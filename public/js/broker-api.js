// =============================================
// BROKER-API — ядро подключения к брокеру (Т-Инвестиции)
// =============================================
// Клиентский слой T-Invest API поверх воркер-прокси /api/broker/tinkoff/*
// (worker/index.js: whitelist методов по уровню доступа, Origin-гард,
// no-store, тексты ошибок апстрима не пробрасываются).
//
// Безопасность (см. обсуждение «этап 1», 2026-07-17):
//   · токен НИКОГДА не уезжает в облако: все ключи вне WATCH cloud-sync
//     и добавлены в заслон BROKER_LOCAL_KEYS (cloud-sync.js);
//   · три режима хранения: 'session' (sessionStorage, до закрытия вкладки),
//     'local' (localStorage, исторический ключ broker_token_local_v1),
//     'pin' (AES-GCM, ключ из PIN через PBKDF2-SHA256; расшифрованный
//     токен живёт только в памяти вкладки);
//   · режима «шифруем ключом из localStorage» нет намеренно — это театр
//     безопасности, а не защита;
//   · токен не попадает в журнал, тексты ошибок и toast'ы; в UI — только
//     хвост maskTail();
//   · верификация уровня доступа: GetAccounts → accessLevel счёта
//     сверяется с выбранным у нас режимом (см. checkScope).
//
// Наружу: window.brokerApi. UI визарда — js/broker-connect.js,
// виджет позиций — portfolios-widgets.js (pfwBrokerHtml).

(function () {
    'use strict';

    var CONN_KEY = 'broker_conn_local_v1';      // метаданные подключения (+ enc-блоб при PIN)
    var TOKEN_KEY = 'broker_token_local_v1';    // плейн-токен при storage='local' (исторический ключ)
    var SESSION_KEY = 'broker_token_session_v1';// плейн-токен при storage='session' (sessionStorage)
    var JOURNAL_KEY = 'broker_journal_local_v1';// журнал событий (без токенов!)
    var INSTR_KEY = 'broker_instr_cache_v1';    // кэш справочника инструментов (uid → тикер/имя)
    var JOURNAL_MAX = 200;
    var PBKDF2_ITER = 310000;                   // рекомендация OWASP для PBKDF2-SHA256

    var memToken = null;        // расшифрованный/сессионный токен в памяти вкладки
    var verifiedThisSession = false;
    var pinPrompt = null;       // регистрирует broker-connect.js: function(attempt) -> Promise<pin|null>
    var pinFails = 0, pinLockUntil = 0;   // кулдаун подбора PIN (5 промахов → 60с паузы)

    // Режимы взаимодействия — модель на вырост: у Т-Инвестиций переводов
    // в API нет (пополнение/вывод невозможны технически), пункт остаётся
    // заделом под других брокеров и честно помечен недоступным.
    var SCOPES = [
        { id: 'read', name: 'Только чтение', hint: 'Видим позиции и операции. Торговать и выводить деньги этим доступом невозможно.' },
        { id: 'trade', name: 'Торговля', hint: 'Чтение + выставление и отмена заявок на бирже. Вывод средств невозможен.' },
        { id: 'transfers', name: 'Торговля и переводы', hint: 'Т-Инвестиции не дают API на пополнение и вывод — пункт появится с брокерами, где это возможно.', disabled: true }
    ];

    var ACC_TYPES = {
        ACCOUNT_TYPE_TINKOFF: 'Брокерский счёт',
        ACCOUNT_TYPE_TINKOFF_IIS: 'ИИС',
        ACCOUNT_TYPE_INVEST_BOX: 'Инвесткопилка',
        ACCOUNT_TYPE_INVEST_FUND: 'Фонд'
    };

    // ---------- утилиты ----------
    function readJSON(store, key) {
        try { return JSON.parse(store.getItem(key)) || null; } catch (e) { return null; }
    }
    function writeJSON(store, key, val) {
        try { store.setItem(key, JSON.stringify(val)); } catch (e) {}
    }
    function q2n(q) {
        if (q == null) return 0;
        if (typeof q === 'number') return q;
        return (Number(q.units) || 0) + (Number(q.nano) || 0) / 1e9;
    }
    function maskTail(tail) { return tail ? 't.•••…' + tail : ''; }
    function tokenOk(t) { return /^t\.[A-Za-z0-9_\-]{20,200}$/.test(String(t || '')); }
    function fireChange() {
        try { window.dispatchEvent(new CustomEvent('broker-conn-change')); } catch (e) {}
    }

    // ---------- журнал (банковская прозрачность: без токенов!) ----------
    function journal() { return readJSON(localStorage, JOURNAL_KEY) || []; }
    function logEvent(ev, detail) {
        var list = journal();
        list.unshift({ t: new Date().toISOString(), ev: ev, d: String(detail || '').slice(0, 300) });
        writeJSON(localStorage, JOURNAL_KEY, list.slice(0, JOURNAL_MAX));
    }

    // ---------- PIN-шифрование (WebCrypto) ----------
    function b64(buf) {
        var bytes = new Uint8Array(buf), s = '';
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }
    function unb64(str) {
        var s = atob(str), bytes = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
        return bytes;
    }
    function deriveKey(pin, salt, iter) {
        var enc = new TextEncoder();
        return crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey'])
            .then(function (km) {
                return crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
                    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            });
    }
    function encryptToken(token, pin) {
        var salt = crypto.getRandomValues(new Uint8Array(16));
        var iv = crypto.getRandomValues(new Uint8Array(12));
        return deriveKey(pin, salt, PBKDF2_ITER).then(function (key) {
            return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(token));
        }).then(function (ct) {
            return { v: 1, iter: PBKDF2_ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
        });
    }
    // null = неверный PIN (GCM не сойдётся аутентификация)
    function decryptToken(enc, pin) {
        return deriveKey(pin, unb64(enc.salt), enc.iter || PBKDF2_ITER).then(function (key) {
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, key, unb64(enc.ct));
        }).then(function (buf) {
            return new TextDecoder().decode(buf);
        }).catch(function () { return null; });
    }

    // ---------- подключение ----------
    function getConn() { return readJSON(localStorage, CONN_KEY); }
    function hasConn() { return !!getConn(); }
    function isLocked() {
        var c = getConn();
        return !!(c && c.storage === 'pin' && !memToken);
    }
    // режим «до закрытия вкладки»: в новой вкладке/после рестарта токена уже нет
    function isSessionGone() {
        var c = getConn();
        if (!c || c.storage !== 'session' || memToken) return false;
        try { return !sessionStorage.getItem(SESSION_KEY); } catch (e) { return true; }
    }

    // Токен по режиму хранения. interactive=true разрешает спросить PIN
    // (модалку регистрирует broker-connect.js через setPinPrompt).
    function getToken(interactive) {
        var c = getConn();
        if (!c) return Promise.resolve(null);
        if (c.storage === 'local') return Promise.resolve(localStorage.getItem(TOKEN_KEY) || null);
        if (c.storage === 'session') {
            if (!memToken) memToken = sessionStorage.getItem(SESSION_KEY) || null;
            return Promise.resolve(memToken);
        }
        // storage === 'pin'
        if (memToken) return Promise.resolve(memToken);
        if (!interactive || typeof pinPrompt !== 'function' || !c.enc) return Promise.resolve(null);
        // кулдаун: после пяти неверных PIN — пауза, иначе «блокировка» была бы пустым словом
        if (Date.now() < pinLockUntil) return Promise.resolve(null);
        var attempt = 0;
        function ask() {
            attempt++;
            return Promise.resolve(pinPrompt(attempt)).then(function (pin) {
                if (pin == null || pin === '') return null;   // отмена
                return decryptToken(c.enc, pin).then(function (tok) {
                    if (tok == null) {
                        pinFails++;
                        logEvent('pin_wrong', 'попытка ' + pinFails + ' из 5');
                        if (pinFails >= 5) {
                            pinFails = 0;
                            pinLockUntil = Date.now() + 60000;
                            logEvent('pin_lockout', 'пауза 60 секунд');
                            return null;
                        }
                        return ask();
                    }
                    pinFails = 0;
                    pinLockUntil = 0;
                    memToken = tok;
                    fireChange();
                    return tok;
                });
            });
        }
        return ask();
    }
    function lock() {
        var c = getConn();
        if (c && c.storage === 'pin') { memToken = null; fireChange(); }
    }

    // Сохранить подключение после успешной верификации в визарде.
    // opts: { token, scope, storage:'session'|'local'|'pin', pin?, sandbox?,
    //         account:{ id, name, type, accessLevel } }
    function connect(opts) {
        var conn = {
            v: 1,
            broker: 'tinkoff',
            scope: opts.scope === 'trade' ? 'trade' : 'read',
            storage: opts.storage,
            sandbox: !!opts.sandbox,
            accountId: opts.account.id,
            accountName: opts.account.name || ACC_TYPES[opts.account.type] || 'Счёт',
            accountType: opts.account.type || '',
            accessLevel: opts.account.accessLevel || '',
            tokenTail: String(opts.token).slice(-4),
            state: 'ok',
            connectedAt: new Date().toISOString(),
            lastVerifiedAt: new Date().toISOString()
        };
        var save = function () {
            // токен кладём строго в один слот, остальные чистим
            try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
            try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
            memToken = null;
            if (opts.storage === 'local') {
                try { localStorage.setItem(TOKEN_KEY, opts.token); } catch (e) {}
            } else if (opts.storage === 'session') {
                try { sessionStorage.setItem(SESSION_KEY, opts.token); } catch (e) {}
                memToken = opts.token;
            } else {
                memToken = opts.token;   // PIN: до конца сессии разблокирован
            }
            writeJSON(localStorage, CONN_KEY, conn);
            verifiedThisSession = true;
            logEvent('connect', conn.accountName + ' · ' + (conn.scope === 'trade' ? 'торговля' : 'чтение') +
                (conn.sandbox ? ' · песочница' : '') + ' · хранение: ' + conn.storage);
            fireChange();
        };
        if (opts.storage === 'pin') {
            return encryptToken(opts.token, opts.pin).then(function (enc) { conn.enc = enc; save(); return conn; });
        }
        save();
        return Promise.resolve(conn);
    }

    // wipeAll=true — сценарий «чужой компьютер» (выход из аккаунта): стираем
    // и журнал с именем счёта, и кэш инструментов (он выдаёт, чем владели)
    function disconnect(reason, wipeAll) {
        try { localStorage.removeItem(CONN_KEY); } catch (e) {}
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
        try { localStorage.removeItem(INSTR_KEY); } catch (e) {}
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        memToken = null;
        verifiedThisSession = false;
        if (wipeAll) {
            try { localStorage.removeItem(JOURNAL_KEY); } catch (e) {}
        } else {
            logEvent('disconnect', reason || 'отключено пользователем');
        }
        fireChange();
    }

    // ---------- сверка режима с реальным уровнем токена ----------
    // FULL_ACCESS → токен умеет торговать, READ_ONLY → только чтение.
    function levelOf(accessLevel) {
        if (accessLevel === 'ACCOUNT_ACCESS_LEVEL_FULL_ACCESS') return 'trade';
        if (accessLevel === 'ACCOUNT_ACCESS_LEVEL_READ_ONLY') return 'read';
        return null;
    }
    // 'ok' — совпало; 'weaker' — токен слабее выбранного режима (блокируем);
    // 'stronger' — токен мощнее (мягко предупреждаем: наименьшие привилегии)
    function checkScope(chosenScope, accessLevel) {
        var lvl = levelOf(accessLevel);
        if (!lvl) return 'weaker';
        if (chosenScope === 'trade' && lvl === 'read') return 'weaker';
        if (chosenScope === 'read' && lvl === 'trade') return 'stronger';
        return 'ok';
    }

    // ---------- вызовы через воркер-прокси ----------
    function ruError(status, brokerMsg) {
        if (status === 401) return 'Брокер не принял токен — он неверный или отозван';
        if (status === 429) return 'Брокер ограничил частоту запросов — подождите минуту';
        if (status === 404) return 'Метод не входит в whitelist прокси';
        if (status === 403) return brokerMsg || 'Брокер отказал в доступе';
        if (status === 502) return 'Сервер брокера недоступен — попробуйте позже';
        // 405/501 отдаёт голый статик-сервер без воркера (локальное превью)
        if (status === 405 || status === 501) return 'Прокси брокера недоступен в этом окружении — на боевом сайте всё заработает';
        return brokerMsg || ('Ошибка запроса к брокеру (' + status + ')');
    }
    function rawCall(method, body, token, scope, sandbox) {
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-Broker-Scope': scope === 'trade' ? 'trade' : 'read'
        };
        if (sandbox) headers['X-Broker-Sandbox'] = '1';
        return fetch('/api/broker/tinkoff/' + method, {
            method: 'POST', headers: headers, body: JSON.stringify(body || {})
        }).then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                try { data = JSON.parse(text); } catch (e) {}
                if (!res.ok) {
                    var err = new Error(ruError(res.status, data && data.message));
                    err.status = res.status;
                    err.brokerCode = data && data.code;
                    throw err;
                }
                return data || {};
            });
        }, function () {
            // сеть/оффлайн/нет воркера (локальное превью без прокси)
            var err = new Error('Прокси брокера недоступен — проверьте соединение');
            err.status = 0;
            throw err;
        });
    }
    function call(method, body) {
        var c = getConn();
        if (!c) return Promise.reject(new Error('Брокер не подключён'));
        return getToken(true).then(function (token) {
            if (!token) {
                var err = new Error(c.storage === 'session'
                    ? 'Сессионный токен закончился — введите токен заново'
                    : 'Токен заблокирован — введите PIN');
                err.locked = true;
                throw err;
            }
            return rawCall(method, body, token, c.scope, c.sandbox).catch(function (e) {
                if (e.status === 401) {
                    // токен отозвали/перевыпустили: помечаем, UI покажет баннер.
                    // Гвард от гонки: пока запрос летел, могли нажать «Отключить» —
                    // не воскрешаем стёртое подключение записью старого объекта
                    var cur = getConn();
                    if (cur && cur.tokenTail === c.tokenTail) {
                        cur.state = 'revoked';
                        writeJSON(localStorage, CONN_KEY, cur);
                        logEvent('token_revoked', method);
                        fireChange();
                    }
                } else if (e.status && e.status !== 429) {
                    logEvent('api_error', method + ' → ' + e.status);
                }
                throw e;
            });
        });
    }

    // Проверка токена ДО сохранения (шаг визарда): счета + уровни доступа
    function verifyToken(token, sandbox) {
        if (!tokenOk(token)) {
            return Promise.reject(new Error('Это не похоже на токен Т-Инвестиций — он начинается с «t.»'));
        }
        return rawCall('GetAccounts', {}, token, 'read', sandbox).then(function (data) {
            var accounts = (data.accounts || []).filter(function (a) {
                return a.status !== 'ACCOUNT_STATUS_CLOSED';
            }).map(function (a) {
                return {
                    id: a.id,
                    name: a.name || ACC_TYPES[a.type] || 'Счёт',
                    type: a.type || '',
                    accessLevel: a.accessLevel || '',
                    level: levelOf(a.accessLevel)
                };
            });
            return { accounts: accounts };
        });
    }

    // Тихая ре-верификация раз за сессию: токен могли отозвать или урезать.
    // Не интерактивна: PIN-режим в запертом состоянии просто пропускаем.
    function ensureVerified() {
        var c = getConn();
        if (!c) return Promise.resolve('none');
        if (verifiedThisSession) return Promise.resolve(c.state === 'revoked' ? 'revoked' : 'ok');
        return getToken(false).then(function (token) {
            if (!token) return 'locked';
            return rawCall('GetAccounts', {}, token, c.scope, c.sandbox).then(function (data) {
                verifiedThisSession = true;
                // пока ответ летел, подключение могли стереть — не воскрешаем
                if (!getConn()) return 'none';
                var acc = (data.accounts || []).filter(function (a) { return a.id === c.accountId; })[0];
                c.lastVerifiedAt = new Date().toISOString();
                if (!acc) {
                    c.state = 'revoked';
                    writeJSON(localStorage, CONN_KEY, c);
                    logEvent('verify_fail', 'счёт недоступен токену');
                    fireChange();
                    return 'revoked';
                }
                c.accessLevel = acc.accessLevel || c.accessLevel;
                // токен урезали до чтения при выбранной торговле — фиксируем
                c.state = (c.scope === 'trade' && levelOf(c.accessLevel) !== 'trade') ? 'downgraded' : 'ok';
                writeJSON(localStorage, CONN_KEY, c);
                if (c.state !== 'ok') logEvent('verify_downgraded', 'токен стал слабее выбранного режима');
                fireChange();
                return c.state === 'ok' ? 'ok' : c.state;
            }).catch(function (e) {
                if (e.status === 401) {
                    // здесь rawCall (не call) — помечаем отзыв сами
                    var cur = getConn();
                    if (cur && cur.tokenTail === c.tokenTail) {
                        cur.state = 'revoked';
                        writeJSON(localStorage, CONN_KEY, cur);
                        logEvent('token_revoked', 'тихая проверка');
                        fireChange();
                    }
                    return 'revoked';
                }
                return 'offline';
            });
        });
    }

    // ---------- данные для виджетов ----------
    function getPortfolio() {
        var c = getConn();
        if (!c) return Promise.reject(new Error('Брокер не подключён'));
        return call('GetPortfolio', { accountId: c.accountId, currency: 'RUB' });
    }

    // figi/uid → { ticker, name } с кэшем в localStorage; не больше пачки
    // за раз, чтобы не упереться в лимиты (остальное дорезолвится потом)
    function resolveInstruments(positions) {
        var cache = readJSON(localStorage, INSTR_KEY) || {};
        var need = [];
        (positions || []).forEach(function (p) {
            var key = p.instrumentUid || p.figi;
            if (key && !cache[key]) need.push(p);
        });
        var chain = Promise.resolve();
        need.slice(0, 25).forEach(function (p) {
            chain = chain.then(function () {
                var body = p.instrumentUid
                    ? { idType: 'INSTRUMENT_ID_TYPE_UID', id: p.instrumentUid }
                    : { idType: 'INSTRUMENT_ID_TYPE_FIGI', id: p.figi };
                return call('GetInstrumentBy', body).then(function (data) {
                    var ins = data.instrument || {};
                    cache[p.instrumentUid || p.figi] = {
                        ticker: ins.ticker || '', name: ins.name || '', lot: ins.lot || 1
                    };
                }).catch(function () { /* дорезолвим в следующий раз */ });
            });
        });
        return chain.then(function () {
            writeJSON(localStorage, INSTR_KEY, cache);
            return cache;
        });
    }

    // ---------- мелочи для UI ----------
    // Очистка буфера обмена после вставки токена (банковская гигиена).
    // Работает только по жесту пользователя; ошибки молча глотаем.
    function clearClipboard() {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText('').then(function () { return true; }, function () { return false; });
            }
        } catch (e) {}
        return Promise.resolve(false);
    }

    window.brokerApi = {
        SCOPES: SCOPES,
        ACC_TYPES: ACC_TYPES,
        CONN_KEY: CONN_KEY,
        TOKEN_KEY: TOKEN_KEY,
        SESSION_KEY: SESSION_KEY,
        JOURNAL_KEY: JOURNAL_KEY,
        INSTR_KEY: INSTR_KEY,
        getConn: getConn,
        hasConn: hasConn,
        isLocked: isLocked,
        isSessionGone: isSessionGone,
        getToken: getToken,
        lock: lock,
        setPinPrompt: function (fn) { pinPrompt = fn; },
        connect: connect,
        disconnect: disconnect,
        levelOf: levelOf,
        checkScope: checkScope,
        verifyToken: verifyToken,
        ensureVerified: ensureVerified,
        call: call,
        getPortfolio: getPortfolio,
        resolveInstruments: resolveInstruments,
        journal: journal,
        logEvent: logEvent,
        q2n: q2n,
        maskTail: maskTail,
        tokenOk: tokenOk,
        clearClipboard: clearClipboard
    };
})();
