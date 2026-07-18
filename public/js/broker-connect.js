// =============================================
// BROKER-CONNECT — визард подключения брокера (Т-Инвестиции)
// =============================================
// UI поверх ядра js/broker-api.js. Оверлей #bkOverlay строится лениво в
// <body> (позиционируется fixed — см. правило про transform-предков),
// стили в css/broker.css, формы переиспользуют .ph-* из profile-menu.css.
// Открытие: window.brokerConnect.open() (зовёт секция «API брокера»
// в кабинете и гейт подвкладки «Торговля»).
//
// Шаги: режим → инструкция → токен (+хранение) → счета (сверка уровня
// доступа с выбранным режимом!) → статус подключения с журналом.
// Здесь же модалка PIN — регистрируется в brokerApi.setPinPrompt.

(function () {
    'use strict';

    var TOKEN_SETTINGS_URL = 'https://www.tbank.ru/invest/settings/api/';

    var overlay = null, pinOverlay = null;
    var step = 'scope';
    // рабочее состояние визарда; токен держим тут только между шагами
    // «токен» и «подключить», после connect() сразу затираем
    var sel = { scope: 'read', storage: 'local', sandbox: false, token: '', accounts: [], accIdx: -1 };
    var busy = false;
    var disarmT = null;

    function api() { return window.brokerApi; }
    function toast(msg, isErr) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isErr);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function ruDateTime(iso) {
        try {
            var d = new Date(iso);
            return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return ''; }
    }

    var IC = {
        shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5v-6z"/><path d="m9 12 2 2 4-4.5"/></svg>',
        eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
        warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.8 1.9 18.3a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6.5 10 17 4.5 11.5"/></svg>'
    };

    var EV_LABELS = {
        connect: 'Подключение',
        disconnect: 'Отключение',
        token_revoked: 'Брокер отклонил токен',
        verify_fail: 'Счёт недоступен токену',
        verify_downgraded: 'Права токена урезаны',
        pin_wrong: 'Неверный PIN',
        pin_lockout: 'PIN заблокирован (5 попыток)',
        api_error: 'Ошибка запроса',
        sandbox_open: 'Счёт песочницы открыт',
        legacy_import: 'Импорт старого токена',
        autolock: 'Автоблокировка токена',
        passkey_fail: 'Passkey: отмена или сбой',
        order_submit: 'Заявка выставлена',
        order_cancel: 'Заявка снята',
        order_error: 'Заявка отклонена'
    };

    var STORE_LABELS = { session: 'до закрытия вкладки', local: 'на этом устройстве', pin: 'под PIN-кодом', passkey: 'под Touch ID / passkey' };

    // ---------- оверлей ----------
    function ensureOverlay() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'bkOverlay';
        overlay.innerHTML = '<div class="bk-back"></div><div class="bk-card" role="dialog" aria-modal="true" aria-label="Подключение брокера"></div>';
        document.body.appendChild(overlay);
        overlay.querySelector('.bk-back').addEventListener('click', close);
        document.addEventListener('keydown', function (e) {
            // Escape в открытой PIN-модалке закрывает только её, не визард под ней
            if (pinOverlay && pinOverlay.classList.contains('open')) return;
            if (e.key === 'Escape' && overlay.classList.contains('open')) close();
        });
    }
    function card() { return overlay.querySelector('.bk-card'); }

    function open() {
        ensureOverlay();
        busy = false;
        step = api() && api().hasConn() ? 'done' : 'scope';
        // сессионный токен закончился (новая вкладка/рестарт) — сразу к вводу токена
        if (step === 'done' && api().isSessionGone()) {
            var c0 = api().getConn();
            sel = { scope: c0.scope, storage: c0.storage, storeTouched: true, sandbox: !!c0.sandbox, token: '', accounts: [], accIdx: -1 };
            step = 'token';
        }
        if (step === 'scope') {
            sel = { scope: 'read', storage: 'local', sandbox: false, token: '', accounts: [], accIdx: -1 };
            // токен, сохранённый по-старому (поле в кабинете до визарда):
            // подставим на шаге ввода — пользователь пройдёт проверку и выберет хранение
            try {
                var legacy = localStorage.getItem(api().TOKEN_KEY);
                if (legacy && api().tokenOk(legacy)) sel.token = legacy;
            } catch (e) {}
        }
        render();
        overlay.classList.add('open');
    }
    function close() {
        if (!overlay) return;
        overlay.classList.remove('open');
        sel.token = ''; sel.pin = '';   // секреты в памяти визарда не задерживаются
        // и в DOM скрытого оверлея тоже: введённый токен/PIN не должны лежать в value
        overlay.querySelectorAll('input').forEach(function (i) { i.value = ''; });
        clearTimeout(disarmT);
    }

    // ---------- куски разметки ----------
    function headHtml(title, subtitle, stepNo) {
        return '<div class="bk-head">' +
            (stepNo ? '<div class="bk-step">Шаг ' + stepNo + ' из 4</div>' : '') +
            '<div class="bk-title">' + title + '</div>' +
            (subtitle ? '<div class="bk-sub">' + subtitle + '</div>' : '') +
            '<button type="button" class="bk-x" aria-label="Закрыть" onclick="brokerConnect.close()">✕</button></div>';
    }
    function footHtml(backStep, nextLabel, nextFn, nextDisabled) {
        return '<div class="bk-foot">' +
            (backStep ? '<button type="button" class="bk-btn" onclick="brokerConnect.go(\'' + backStep + '\')">Назад</button>' : '<span></span>') +
            '<button type="button" class="bk-btn bk-btn-pri" id="bkNext"' + (nextDisabled ? ' disabled' : '') +
            ' onclick="brokerConnect.' + nextFn + '()">' + nextLabel + '</button></div>';
    }
    function shieldHtml(text) {
        return '<div class="bk-shield">' + IC.shield + '<span>' + text + '</span></div>';
    }

    // ---------- шаг 1: режим ----------
    function stepScopeHtml() {
        var cards = api().SCOPES.map(function (s, i) {
            var on = sel.scope === s.id;
            var dis = !!s.disabled;
            return '<div class="bk-opt' + (on ? ' on' : '') + (dis ? ' dis' : '') + '" role="radio" aria-checked="' + on + '"' +
                (dis ? '' : ' tabindex="0" onclick="brokerConnect.pickScope(\'' + s.id + '\')"') + '>' +
                '<div class="bk-opt-t">' + esc(s.name) +
                (s.id === 'read' ? '<i class="bk-pill bk-pill-green">рекомендуем</i>' : '') +
                (dis ? '<i class="bk-pill">нет у Т-Инвестиций</i>' : '') + '</div>' +
                '<div class="bk-opt-s">' + esc(s.hint) + '</div></div>';
        }).join('');
        return headHtml('Подключение брокера', 'Т-Инвестиции · официальное бесплатное API', 1) +
            '<div class="bk-body"><div class="bk-lab">Что разрешаем приложению</div>' + cards +
            shieldHtml('Чем меньше прав — тем безопаснее. Для просмотра портфеля хватает «Только чтения», режим всегда можно поменять.') +
            '</div>' + footHtml(null, 'Дальше', 'toHowto');
    }

    // ---------- шаг 2: инструкция ----------
    function stepHowtoHtml() {
        var tokKind = sel.scope === 'trade'
            ? '<b>«Токен с полным доступом»</b> — только он умеет торговать'
            : '<b>«Токен только для чтения»</b> — он не может торговать и выводить деньги, даже если утечёт';
        return headHtml('Выпустите токен у брокера', 'Т-Инвестиции сверят его с выбранным режимом', 2) +
            '<div class="bk-body"><ol class="bk-list">' +
            '<li>Откройте <a href="' + TOKEN_SETTINGS_URL + '" target="_blank" rel="noopener noreferrer">настройки API в Т-Инвестициях</a> (вход только на официальном сайте Т-Банка).</li>' +
            '<li>Выпустите ' + tokKind + '.</li>' +
            '<li>Совет: при выпуске <b>ограничьте токен одним счётом</b> — это защита на стороне брокера, она сработает, даже если что-то пойдёт не так у нас.</li>' +
            '<li>Скопируйте токен — целиком он показывается только один раз.</li></ol>' +
            shieldHtml('Мы никогда не просим логин или пароль от Т-Банка — только API-токен. Его можно отозвать в те же настройки за десять секунд.') +
            '</div>' + footHtml('scope', 'Токен готов', 'toToken');
    }

    // ---------- шаг 3: токен и хранение ----------
    function storeRow(id, name, hint, badge) {
        var on = sel.storage === id;
        return '<div class="bk-opt bk-opt-slim' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" tabindex="0" onclick="brokerConnect.pickStore(\'' + id + '\')">' +
            '<div class="bk-opt-t">' + name + (badge || '') + '</div><div class="bk-opt-s">' + hint + '</div></div>';
    }
    function stepTokenHtml() {
        // при поддержке passkey рекомендация переезжает на него — PIN остаётся фолбэком
        var hasPk = !!(api() && api().passkeySupported);
        var recBadge = sel.scope === 'trade' ? '<i class="bk-pill bk-pill-green">рекомендуем</i>' : '';
        var pinBadge = hasPk ? '' : recBadge;
        var pkRow = hasPk
            ? storeRow('passkey', 'Touch ID / Passkey', 'Ключ шифрования — в аппаратном модуле устройства, разблокировка биометрией', recBadge)
            : '';
        return headHtml('Вставьте токен', 'Он останется только на этом устройстве', 3) +
            '<div class="bk-body">' +
            '<div class="ph-field"><label class="ph-lab" for="bkToken">API-токен Т-Инвестиций</label>' +
            '<div class="ph-tokwrap"><input class="ph-input" id="bkToken" type="password" placeholder="t.xxxxxxxx…" autocomplete="off" spellcheck="false">' +
            '<button class="ph-eye" type="button" id="bkEye" aria-label="Показать токен">' + IC.eye + '</button></div>' +
            '<button type="button" class="bk-clip" id="bkClip" hidden onclick="brokerConnect.clearClip()">Очистить буфер обмена</button></div>' +
            '<div class="bk-lab">Как хранить токен</div>' +
            storeRow('session', 'Не сохранять', 'Забудем при закрытии вкладки — самый строгий вариант') +
            storeRow('local', 'На этом устройстве', 'Токен останется в этом браузере, в облако не попадает') +
            pkRow +
            storeRow('pin', 'Под PIN-кодом', 'Токен шифруется, PIN спрашиваем раз за сессию', pinBadge) +
            '<div id="bkPinFields"' + (sel.storage === 'pin' ? '' : ' hidden') + ' class="ph-2col bk-pin2">' +
            '<div class="ph-field"><label class="ph-lab" for="bkPin1">PIN-код (4–12 цифр)</label><input class="ph-input" id="bkPin1" type="password" inputmode="numeric" autocomplete="off" maxlength="12"></div>' +
            '<div class="ph-field"><label class="ph-lab" for="bkPin2">Ещё раз</label><input class="ph-input" id="bkPin2" type="password" inputmode="numeric" autocomplete="off" maxlength="12"></div></div>' +
            '<label class="bk-chk"><input type="checkbox" id="bkSandbox"' + (sel.sandbox ? ' checked' : '') + '><span>Песочница T-Invest — тестовый контур с виртуальными деньгами (нужен отдельный токен песочницы)</span></label>' +
            '<div class="bk-err" id="bkErr" hidden></div>' +
            '</div>' + footHtml('howto', 'Проверить и продолжить', 'verify');
    }

    // ---------- шаг 4: счета ----------
    function levelBadge(acc) {
        if (acc.level === 'trade') return '<i class="bk-pill bk-pill-amber">полный доступ</i>';
        if (acc.level === 'read') return '<i class="bk-pill bk-pill-green">только чтение</i>';
        return '<i class="bk-pill">нет доступа</i>';
    }
    function stepAccountsHtml() {
        var A = api();
        var anyOk = sel.accounts.some(function (a) { return A.checkScope(sel.scope, a.accessLevel) !== 'weaker'; });
        // боевой контур токен не принял, а песочница узнала — говорим об этом прямо
        var sbNote = sel.sandboxAuto
            ? '<div class="bk-verdict bk-verdict-info">' + IC.shield + '<div><b>Это токен песочницы.</b> Включили тестовый контур: сделки и деньги здесь виртуальные, до настоящей биржи они не доходят.</div></div>'
            : '';
        var verdict = '';
        if (!sel.accounts.length) {
            // пустой список — это НЕ «токен слабее»: в песочнице счёт открывается
            // только через API, у боевого токена могли отрезать все счета при выпуске
            verdict = sel.sandbox
                ? '<div class="bk-verdict bk-verdict-warn">' + IC.warn + '<div><b>В песочнице пока нет счетов.</b> Кабинет Т-Банка их не открывает — счёт песочницы создаётся только через API. Мы сделаем это за вас и сразу зачислим 1 000 000 ₽ виртуальных денег.</div></div>' +
                  '<button type="button" class="bk-btn bk-btn-ghost" id="bkSbOpen" onclick="brokerConnect.sandboxOpen()">Открыть счёт в песочнице</button>'
                : '<div class="bk-verdict bk-verdict-bad">' + IC.warn + '<div><b>Брокер не вернул ни одного счёта.</b> Проверьте, для тех ли счетов выпущен токен, — или перевыпустите его с доступом ко всем счетам.</div></div>';
        } else if (!anyOk) {
            var wantTrade = sel.scope === 'trade';
            verdict = '<div class="bk-verdict bk-verdict-bad">' + IC.warn + '<div><b>Токен слабее выбранного режима.</b> ' +
                (wantTrade
                    ? 'Вы выбрали «Торговлю», а этот токен выпущен только для чтения. Выпустите токен с полным доступом — или переключитесь на «Только чтение».'
                    : 'Этому токену брокер не дал доступа к счетам. Проверьте, для тех ли счетов он выпущен.') +
                '</div></div>' +
                (wantTrade ? '<button type="button" class="bk-btn bk-btn-ghost" onclick="brokerConnect.fallbackRead()">Переключиться на «Только чтение»</button>' : '');
        } else if (!sel.sandbox && sel.accounts.some(function (a) { return A.checkScope(sel.scope, a.accessLevel) === 'stronger'; })) {
            // в песочнице токен всегда полного доступа — пугать «перевыпустите» не за что
            verdict = '<div class="bk-verdict bk-verdict-warn">' + IC.warn + '<div><b>Токен умеет больше, чем вы разрешили нам.</b> ' +
                'Работать будем только в режиме чтения — торговые запросы наш сервер не пропустит. Надёжнее перевыпустить токен «только для чтения».</div></div>';
        }
        var cards = sel.accounts.map(function (a, i) {
            var weak = A.checkScope(sel.scope, a.accessLevel) === 'weaker';
            var on = sel.accIdx === i;
            return '<div class="bk-opt bk-opt-slim' + (on ? ' on' : '') + (weak ? ' dis' : '') + '" role="radio" aria-checked="' + on + '"' +
                (weak ? '' : ' tabindex="0" onclick="brokerConnect.pickAcc(' + i + ')"') + '>' +
                '<div class="bk-opt-t">' + esc(a.name) + ' ' + levelBadge(a) + '</div>' +
                '<div class="bk-opt-s">' + esc(api().ACC_TYPES[a.type] || 'Счёт') + (weak ? ' · токен не даёт нужного уровня' : '') + '</div></div>';
        }).join('');
        // без счетов список и его заголовок не рисуем — вердикт выше сказал всё
        var listHtml = sel.accounts.length ? '<div class="bk-lab">Счета, доступные токену</div>' + cards : '';
        return headHtml('Выберите счёт', 'Мы сверили токен с выбранным режимом' +
                (sel.sandbox ? ' · <i class="bk-pill bk-pill-amber">песочница</i>' : ''), 4) +
            '<div class="bk-body">' + sbNote + verdict + listHtml + '<div class="bk-err" id="bkErr" hidden></div></div>' +
            footHtml('token', 'Подключить', 'connect', sel.accIdx < 0);
    }

    // ---------- статус подключения ----------
    function stepDoneHtml() {
        var A = api(), c = A.getConn();
        if (!c) return stepScopeHtml();
        var scopeName = c.scope === 'trade' ? 'Торговля' : 'Только чтение';
        var banner = '';
        if (c.state === 'revoked') {
            banner = '<div class="bk-verdict bk-verdict-bad">' + IC.warn + '<div><b>Брокер не принял токен.</b> Его отозвали или перевыпустили — подключите новый.</div></div>';
        } else if (c.state === 'downgraded') {
            banner = '<div class="bk-verdict bk-verdict-warn">' + IC.warn + '<div><b>Права токена урезали до чтения.</b> Торговый режим не работает — выпустите токен с полным доступом.</div></div>';
        } else if (A.isLocked()) {
            banner = '<div class="bk-verdict bk-verdict-lock">' + IC.lock + '<div><b>Токен под PIN-кодом.</b> Разблокируйте, чтобы виджеты получили данные.</div>' +
                '<button type="button" class="bk-btn" onclick="brokerConnect.unlock()">Разблокировать</button></div>';
        }
        var jr = A.journal().slice(0, 6).map(function (e) {
            return '<div class="bk-jrow"><span>' + esc(EV_LABELS[e.ev] || e.ev) + (e.d ? ' · ' + esc(e.d) : '') + '</span><i>' + ruDateTime(e.t) + '</i></div>';
        }).join('') || '<div class="bk-jrow"><span>Пока пусто</span></div>';
        return headHtml('Брокер подключён', 'Т-Инвестиции' + (c.sandbox ? ' · <i class="bk-pill bk-pill-amber">песочница</i>' : '')) +
            '<div class="bk-body">' + banner +
            '<div class="bk-kv"><span>Счёт</span><b>' + esc(c.accountName) + '</b></div>' +
            '<div class="bk-kv"><span>Режим</span><b>' + scopeName + '</b></div>' +
            '<div class="bk-kv"><span>Токен</span><b class="bk-mono">' + esc(A.maskTail(c.tokenTail)) + '</b></div>' +
            '<div class="bk-kv"><span>Хранение</span><b>' + (STORE_LABELS[c.storage] || c.storage) + '</b></div>' +
            '<div class="bk-kv"><span>Проверен</span><b class="bk-mono">' + ruDateTime(c.lastVerifiedAt) + '</b></div>' +
            '<div class="bk-lab">Журнал действий</div><div class="bk-journal">' + jr + '</div>' +
            '<div class="bk-actions">' +
            '<button type="button" class="bk-btn" onclick="brokerConnect.changeToken()">Сменить токен</button>' +
            '<a class="bk-btn bk-btn-ghost" href="' + TOKEN_SETTINGS_URL + '" target="_blank" rel="noopener noreferrer">Отозвать у брокера</a>' +
            '<button type="button" class="bk-btn bk-btn-danger" id="bkOff" onclick="brokerConnect.disconnect()"><span>Отключить</span></button>' +
            '</div>' +
            shieldHtml('Настоящий рубильник — отзыв токена у брокера: после него токен бесполезен везде, не только у нас.') +
            '</div>';
    }

    // ---------- рендер и обработчики ----------
    function render() {
        // каждый переход шага пересоздаёт кнопки — залипший busy здесь всегда лишний
        // (ревизия: verify() на успехе уходил в render() без сброса, и «Подключить» умирал)
        busy = false;
        var html = '';
        if (step === 'scope') html = stepScopeHtml();
        else if (step === 'howto') html = stepHowtoHtml();
        else if (step === 'token') html = stepTokenHtml();
        else if (step === 'accounts') html = stepAccountsHtml();
        else html = stepDoneHtml();
        card().innerHTML = html;
        wireStep();
    }
    function wireStep() {
        var tok = card().querySelector('#bkToken');
        if (tok) {
            if (sel.token) tok.value = sel.token;
            tok.addEventListener('paste', function () {
                var clip = card().querySelector('#bkClip');
                if (clip) clip.hidden = false;
            });
            setTimeout(function () { try { tok.focus(); } catch (e) {} }, 60);
        }
        var eye = card().querySelector('#bkEye');
        if (eye) eye.addEventListener('click', function () {
            tok.type = tok.type === 'password' ? 'text' : 'password';
        });
        var sb = card().querySelector('#bkSandbox');
        if (sb) sb.addEventListener('change', function () { sel.sandbox = sb.checked; });
    }
    function err(msg) {
        var el = card().querySelector('#bkErr');
        if (!el) { toast(msg, true); return; }
        el.textContent = msg;
        el.hidden = false;
    }
    function setBusy(on, label) {
        busy = on;
        var b = card().querySelector('#bkNext');
        if (b) { b.disabled = on; if (label) b.textContent = label; }
    }

    // ---------- публичные действия (onclick) ----------
    var brokerConnect = {
        open: open,
        close: close,
        go: function (s) { step = s; render(); },
        pickScope: function (id) { sel.scope = id; render(); },
        pickStore: function (id) {
            sel.storage = id;
            sel.storeTouched = true;   // явный выбор пользователя — не перетирать дефолтом
            var t = card().querySelector('#bkToken');
            if (t) sel.token = t.value.trim();
            render();
        },
        pickAcc: function (i) { sel.accIdx = i; render(); },
        toHowto: function () { step = 'howto'; render(); },
        toToken: function () {
            // дефолт хранения от режима — но только пока пользователь не выбрал сам;
            // для торговли при поддержке passkey рекомендуем именно его
            if (!sel.storeTouched) {
                sel.storage = sel.scope === 'trade'
                    ? (api().passkeySupported ? 'passkey' : 'pin')
                    : 'local';
            }
            step = 'token';
            render();
        },
        clearClip: function () {
            api().clearClipboard().then(function (ok) {
                toast(ok ? 'Буфер обмена очищен' : 'Не удалось очистить буфер', !ok);
            });
        },
        fallbackRead: function () { sel.scope = 'read'; sel.accIdx = -1; render(); },
        verify: function () {
            if (busy) return;
            var A = api();
            var tok = (card().querySelector('#bkToken').value || '').trim();
            if (!A.tokenOk(tok)) return err('Это не похоже на токен Т-Инвестиций: он начинается с «t.» и длиннее 20 символов. Пароль от банка сюда вводить не нужно.');
            if (sel.storage === 'pin') {
                var p1 = card().querySelector('#bkPin1').value, p2 = card().querySelector('#bkPin2').value;
                if (!/^\d{4,12}$/.test(p1)) return err('PIN — от 4 до 12 цифр.');
                if (p1 !== p2) return err('PIN-коды не совпадают.');
                sel.pin = p1;
            }
            sel.token = tok;
            sel.sandboxAuto = false;
            setBusy(true, 'Проверяем у брокера…');
            // единственный подходящий счёт выбираем сразу
            function autoPick(accounts) {
                var okIdx = -1, okCount = 0;
                accounts.forEach(function (a, i) {
                    if (A.checkScope(sel.scope, a.accessLevel) !== 'weaker') { okCount++; if (okIdx < 0) okIdx = i; }
                });
                return okCount === 1 ? okIdx : -1;
            }
            function toAccounts(res) {
                sel.accounts = res.accounts;
                sel.accIdx = autoPick(res.accounts);
                step = 'accounts';
                render();
            }
            A.verifyToken(tok, sel.sandbox).then(toAccounts, function (e) {
                // боевой контур ответил 401 — молча пробуем песочницу: песочные
                // токены выглядят так же, и галочку про них легко не заметить
                if (e && e.status === 401 && !sel.sandbox) {
                    A.verifyToken(tok, true).then(function (res) {
                        sel.sandbox = true;
                        sel.sandboxAuto = true;
                        toAccounts(res);
                    }, function () {
                        setBusy(false, 'Проверить и продолжить');
                        err(e.message);
                    });
                    return;
                }
                setBusy(false, 'Проверить и продолжить');
                if (e && e.status === 401 && sel.sandbox) {
                    err('Песочница не приняла токен. Если это обычный боевой токен — снимите галочку «Песочница» и попробуйте ещё раз.');
                } else {
                    err(e && e.message ? e.message : 'Не удалось проверить токен');
                }
            });
        },
        // счёт в песочнице: OpenSandboxAccount + виртуальный миллион, затем
        // повторная проверка токена возвращает уже непустой список счетов
        sandboxOpen: function () {
            if (busy) return;
            busy = true;
            var A = api();
            var b = card().querySelector('#bkSbOpen');
            if (b) { b.disabled = true; b.textContent = 'Открываем счёт…'; }
            A.sandboxSetup(sel.token).then(function () {
                return A.verifyToken(sel.token, true);
            }).then(function (res) {
                sel.accounts = res.accounts;
                sel.accIdx = res.accounts.length ? 0 : -1;
                render();
                toast('Счёт в песочнице открыт — на нём 1 000 000 ₽ виртуальных денег');
            }, function (e) {
                busy = false;
                if (b) { b.disabled = false; b.textContent = 'Открыть счёт в песочнице'; }
                err(e && e.message ? e.message : 'Не удалось открыть счёт в песочнице');
            });
        },
        connect: function () {
            if (busy || sel.accIdx < 0) return;
            var A = api();
            var acc = sel.accounts[sel.accIdx];
            if (!acc || A.checkScope(sel.scope, acc.accessLevel) === 'weaker') return;
            setBusy(true, 'Подключаем…');
            A.connect({
                token: sel.token, scope: sel.scope, storage: sel.storage,
                pin: sel.pin, sandbox: sel.sandbox, account: acc
            }).then(function () {
                sel.token = ''; sel.pin = ''; sel.accounts = [];
                toast('Брокер подключён: ' + acc.name);
                step = 'done';
                render();
            }, function (e) {
                setBusy(false, 'Подключить');
                // passkey не создался (нет PRF, отмена биометрии) — подсказываем фолбэк
                if (sel.storage === 'passkey') {
                    err((e && e.message ? e.message + '. ' : '') + 'Можно вернуться на шаг назад и выбрать хранение под PIN-кодом.');
                } else {
                    err('Не удалось сохранить подключение');
                }
            });
        },
        changeToken: function () {
            var c = api().getConn();
            if (c) { sel.scope = c.scope; sel.storage = c.storage; sel.storeTouched = true; sel.sandbox = !!c.sandbox; }
            sel.token = ''; sel.accIdx = -1;
            step = 'token';
            render();
        },
        unlock: function () {
            api().getToken(true).then(function (t) {
                if (t) { toast('Токен разблокирован'); render(); }
            });
        },
        // двухкликовое подтверждение как у выхода из аккаунта
        disconnect: function () {
            var b = card().querySelector('#bkOff');
            if (b && !b.classList.contains('arm')) {
                b.classList.add('arm');
                b.querySelector('span').textContent = 'Точно отключить?';
                clearTimeout(disarmT);
                disarmT = setTimeout(function () {
                    if (b && b.classList) { b.classList.remove('arm'); var s = b.querySelector('span'); if (s) s.textContent = 'Отключить'; }
                }, 2800);
                return;
            }
            api().disconnect();
            toast('Брокер отключён, токен стёрт с устройства');
            step = 'scope';
            sel = { scope: 'read', storage: 'local', sandbox: false, token: '', accounts: [], accIdx: -1 };
            render();
        }
    };
    window.brokerConnect = brokerConnect;

    // ---------- модалка PIN (для разблокировки вне визарда) ----------
    function ensurePin() {
        if (pinOverlay) return;
        pinOverlay = document.createElement('div');
        pinOverlay.id = 'bkPinOverlay';
        pinOverlay.innerHTML = '<div class="bk-back"></div><div class="bk-card bk-card-pin" role="dialog" aria-modal="true" aria-label="PIN-код">' +
            '<div class="bk-title">Токен под PIN-кодом</div>' +
            '<div class="bk-sub" id="bkPinSub">Введите PIN, чтобы разблокировать доступ к брокеру</div>' +
            '<input class="ph-input" id="bkPinIn" type="password" inputmode="numeric" autocomplete="off" maxlength="12">' +
            '<div class="bk-foot"><button type="button" class="bk-btn" id="bkPinCancel">Отмена</button>' +
            '<button type="button" class="bk-btn bk-btn-pri" id="bkPinOk">Разблокировать</button></div></div>';
        document.body.appendChild(pinOverlay);
    }
    function askPin(attempt) {
        ensurePin();
        return new Promise(function (resolve) {
            var input = pinOverlay.querySelector('#bkPinIn');
            var sub = pinOverlay.querySelector('#bkPinSub');
            sub.textContent = attempt > 1
                ? 'Неверный PIN — попытка ' + attempt + ' из 5'
                : 'Введите PIN, чтобы разблокировать доступ к брокеру';
            sub.classList.toggle('bk-sub-err', attempt > 1);
            input.value = '';
            pinOverlay.classList.add('open');
            setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
            function done(val) {
                pinOverlay.classList.remove('open');
                ok.removeEventListener('click', onOk);
                cancel.removeEventListener('click', onCancel);
                input.removeEventListener('keydown', onKey);
                resolve(val);
            }
            var ok = pinOverlay.querySelector('#bkPinOk');
            var cancel = pinOverlay.querySelector('#bkPinCancel');
            function onOk() { done(input.value || null); }
            function onCancel() { done(null); }
            function onKey(e) {
                if (e.key === 'Enter') onOk();
                if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
            }
            ok.addEventListener('click', onOk);
            cancel.addEventListener('click', onCancel);
            input.addEventListener('keydown', onKey);
        });
    }

    function init() {
        if (window.brokerApi) window.brokerApi.setPinPrompt(askPin);
        // тихая ре-верификация подключения раз за сессию (токен могли отозвать)
        if (window.brokerApi && window.brokerApi.hasConn()) {
            setTimeout(function () { window.brokerApi.ensureVerified(); }, 4000);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
