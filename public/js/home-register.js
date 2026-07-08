// =============================================
// HOME AUTH — стартовая сплит-карточка (регистрация/вход)
// =============================================
// Форма на приветственной вкладке. Два режима работы:
//   · Supabase подключён (js/supabase-config.js) — настоящие
//     регистрация/вход/сброс пароля через window.supa;
//   · ключей нет — прежнее демо-сохранение в localStorage.
// Плюс третий вид формы 'recovery': пользователь пришёл по ссылке
// «сброс пароля» из письма — просим придумать новый пароль.
// Вход через Telegram: при подключённом Supabase — настоящий (виджет/
// WebApp initData проверяются на сервере, см. worker/index.js), иначе
// прежний демо-режим (только localStorage).
// Бэкенд-регистрация (брокеры/планы) живёт отдельно в registration.js.

(function () {
    'use strict';

    var authMode = 'register'; // 'register' | 'login' | 'recovery'

    // Безопасный тост: переиспользуем showDashToast, иначе мягкий фолбэк.
    function toast(msg, isError) {
        if (typeof window.showDashToast === 'function') {
            window.showDashToast(msg, isError);
        } else {
            console[isError ? 'warn' : 'log']('[home-register] ' + msg);
        }
    }

    function haptic(kind) {
        try {
            var h = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
            if (!h) return;
            if (kind === 'success') h.notificationOccurred('success');
            else h.impactOccurred('medium');
        } catch (e) { /* no-op */ }
    }

    function el(id) { return document.getElementById(id); }
    function cloudOn() { return !!(window.supa && window.supa.enabled); }

    // Сообщение под формой: err — красное, ok — зелёное (класс в home-register.css)
    function note(msg, isOk) {
        var box = el('homeRegError');
        if (!box) return;
        box.textContent = msg;
        box.classList.toggle('ok', !!isOk);
        box.classList.add('show');
    }
    function clearNote() {
        var box = el('homeRegError');
        if (box) { box.classList.remove('show'); box.classList.remove('ok'); }
    }

    function setBusy(busy, label) {
        var btn = el('hsSubmit');
        var lbl = el('hsSubmitLabel');
        if (!btn) return;
        btn.disabled = !!busy;
        btn.classList.toggle('is-busy', !!busy);
        if (label && lbl) lbl.textContent = label;
    }

    // ---- Колонна входа (.hg-auth на обложке) ----
    // Модалки больше нет: форма всегда на Главной, в стеклянной колонне.
    // Для вошедшего пользователя вместо формы — приветствие (#hgAuthed);
    // режим recovery показывает форму даже при активной сессии.
    function updateAuthView() {
        var form = el('hsAuthInner');
        var done = el('hgAuthed');
        if (!form || !done) return;
        var authed = !!(window.supa && window.supa.isAuthed());
        var showDone = authed && authMode !== 'recovery';
        form.style.display = showDone ? 'none' : '';
        done.hidden = !showDone;
        if (showDone) {
            var email = (window.supa.profile && window.supa.profile.email) ||
                        (window.supa.session && window.supa.session.user && window.supa.session.user.email) || '';
            var box = el('hgAuthedEmail');
            if (box) box.textContent = email ? ('Вы вошли как ' + email) : 'Вы вошли в аккаунт';
        }
    }
    // Совместимость со старым API модалки: «открыть» = переключить режим
    // и подвести взгляд к колонне (recovery-ссылка из письма зовёт именно это).
    window.hsOpenAuth = function (mode) {
        if (mode) window.homeAuthMode(mode);
        updateAuthView();
        var col = el('homeRegister');
        if (col && col.scrollIntoView) col.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        haptic('medium');
    };
    window.hsCloseAuth = function () { /* колонна всегда на месте */ };

    // ---- Переключение «Регистрация / Вход / Новый пароль» ----
    window.homeAuthMode = function (mode) {
        if (mode !== 'register' && mode !== 'login' && mode !== 'recovery') return;
        if (mode === authMode) return;
        authMode = mode;
        haptic('medium');

        var isReg = mode === 'register';
        var isRec = mode === 'recovery';

        var tabReg = el('hsTabRegister');
        var tabLogin = el('hsTabLogin');
        if (tabReg) tabReg.classList.toggle('active', isReg);
        if (tabLogin) tabLogin.classList.toggle('active', mode === 'login');

        var title = el('hsAuthTitle');
        if (title) title.textContent = isRec ? 'Новый пароль' : (isReg ? 'Создайте аккаунт' : 'С возвращением!');

        var nameField = el('hsNameField');
        if (nameField) nameField.classList.toggle('hidden', !isReg);
        var emailField = el('hsEmailField');
        if (emailField) emailField.classList.toggle('hidden', isRec);

        var hint = el('hsPassHint');
        if (hint) hint.style.display = isReg ? '' : 'none';

        // «Забыли пароль?» — только в режиме входа и только с подключённым облаком
        var forgot = el('hsForgot');
        if (forgot) forgot.style.display = (mode === 'login' && cloudOn()) ? '' : 'none';

        var label = el('hsSubmitLabel');
        if (label) label.textContent = isRec ? 'Сохранить пароль' : (isReg ? 'Создать аккаунт' : 'Войти');

        var foot = el('hsFoot');
        if (foot) {
            if (isRec) {
                foot.innerHTML = 'Вспомнили старый? <a class="hr-link" onclick="homeAuthMode(\'login\')">Войти</a>';
            } else if (isReg) {
                foot.innerHTML = 'Уже есть аккаунт? <a class="hr-link" onclick="homeAuthMode(\'login\')">Войти</a>';
            } else {
                foot.innerHTML = 'Нет аккаунта? <a class="hr-link" onclick="homeAuthMode(\'register\')">Создать</a>';
            }
        }

        // Сбрасываем сообщение и «выполненное» состояние кнопки при смене режима.
        clearNote();
        var btn = el('hsSubmit');
        if (btn) { btn.classList.remove('is-done'); btn.disabled = false; }

        var form = el('homeRegForm');
        if (form && form.password) {
            form.password.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
            if (isRec) form.password.value = '';
        }

        // recovery показывает форму даже при активной сессии — и наоборот
        updateAuthView();
    };

    // ---- Показ/скрытие пароля ----
    window.hsTogglePass = function (btn) {
        var wrap = btn && btn.closest('.hr-inputwrap');
        var input = wrap && wrap.querySelector('.hr-input');
        if (!input) return;
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    };

    // ---- Успех: галочка на кнопке и переход в приложение ----
    function successAndGo(msg) {
        var btn = el('hsSubmit');
        if (btn) { btn.classList.add('is-done'); btn.disabled = false; el('hsSubmitLabel').textContent = 'Готово ✓'; }
        haptic('success');
        toast(msg);
        setTimeout(function () {
            if (typeof window.switchTab === 'function') window.switchTab('calc');
        }, 900);
    }

    // ---- Отправка формы ----
    window.homeRegisterSubmit = function (event) {
        if (event) event.preventDefault();
        var form = el('homeRegForm');
        if (!form) return false;

        var isReg = authMode === 'register';
        var isRec = authMode === 'recovery';
        var name = (form.name.value || '').trim();
        var email = (form.email.value || '').trim();
        var pass = form.password.value || '';

        clearNote();
        if (isReg && name.length < 2) { note('Введите имя'); return false; }
        if (!isRec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note('Введите корректный email'); return false; }
        if (pass.length < 6) { note('Пароль — минимум 6 символов'); return false; }

        // ===== Облако подключено — настоящая авторизация =====
        if (cloudOn()) {
            if (isRec) {
                setBusy(true, 'Сохраняем…');
                window.supa.updatePassword(pass).then(function (r) {
                    setBusy(false, 'Сохранить пароль');
                    if (!r.ok) { note(r.error); return; }
                    successAndGo('Пароль обновлён — вы вошли в аккаунт');
                });
            } else if (isReg) {
                setBusy(true, 'Создаём аккаунт…');
                window.supa.signUp(name, email, pass).then(function (r) {
                    setBusy(false, 'Создать аккаунт');
                    if (!r.ok) { note(r.error); return; }
                    if (r.needConfirm) {
                        haptic('success');
                        // переключаем на «Вход» (homeAuthMode чистит сообщение — пишем после)
                        window.homeAuthMode('login');
                        note('Почти готово! Мы отправили письмо на ' + email + ' — подтвердите почту и войдите.', true);
                    } else {
                        successAndGo('Аккаунт создан, ' + name + '!');
                    }
                });
            } else {
                setBusy(true, 'Входим…');
                window.supa.signIn(email, pass).then(function (r) {
                    setBusy(false, 'Войти');
                    if (!r.ok) { note(r.error); return; }
                    successAndGo('Вход выполнен');
                });
            }
            return false;
        }

        // ===== Демо-режим (ключи Supabase не заданы) =====
        try {
            var saved = {};
            if (!isReg) {
                try { saved = JSON.parse(localStorage.getItem('home_profile_v1')) || {}; } catch (e) { saved = {}; }
            }
            localStorage.setItem('home_profile_v1', JSON.stringify({
                name: isReg ? name : (saved.name || null),
                email: email,
                createdAt: saved.createdAt || Date.now()
            }));
        } catch (e) { /* приватный режим — не критично */ }

        successAndGo(isReg ? ('Аккаунт создан, ' + name + '!') : 'Вход выполнен');
        return false;
    };

    // ---- «Забыли пароль?» ----
    window.homeForgotPassword = function () {
        if (!cloudOn()) return;
        var form = el('homeRegForm');
        var email = form ? (form.email.value || '').trim() : '';
        clearNote();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            note('Введите email в поле выше — и мы пришлём ссылку для сброса');
            return;
        }
        window.supa.resetPassword(email).then(function (r) {
            if (!r.ok) { note(r.error); return; }
            haptic('success');
            note('Ссылка для сброса пароля отправлена на ' + email, true);
        });
    };

    // ---- Вход через Telegram ----
    window.homeTelegramLogin = function () {
        haptic('medium');
        var tg = window.Telegram && window.Telegram.WebApp;
        var waUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;

        // ===== Облако подключено — настоящий вход =====
        // (попап/initData захватывает и проверяет window.supa.signInWithTelegram —
        // проверка подписи на сервере, см. worker/index.js)
        if (cloudOn()) {
            toast('Входим через Telegram…');
            window.supa.signInWithTelegram().then(function (r) {
                if (!r.ok) { toast(r.error, true); return; }
                successAndGo('Вход выполнен через Telegram');
            });
            return;
        }

        // ===== Демо-режим (ключи Supabase не заданы) =====
        if (waUser) {
            // Приложение открыто внутри Telegram — пользователь уже авторизован.
            try {
                localStorage.setItem('home_profile_v1', JSON.stringify({
                    name: [waUser.first_name, waUser.last_name].filter(Boolean).join(' '),
                    telegram_id: waUser.id,
                    username: waUser.username || null,
                    createdAt: Date.now()
                }));
            } catch (e) { /* no-op */ }
            haptic('success');
            toast('Вход выполнен через Telegram');
            if (typeof window.switchTab === 'function') {
                setTimeout(function () { window.switchTab('calc'); }, 600);
            }
            return;
        }

        // Открыто в обычном браузере: ведём в Telegram-бот для авторизации.
        var bot = window.TELEGRAM_BOT_USERNAME;
        if (bot) {
            var link = 'https://t.me/' + bot;
            if (tg && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(link);
            else window.open(link, '_blank', 'noopener');
            return;
        }

        toast('Откройте приложение через Telegram, чтобы войти', true);
    };

    // ---- Реакция на состояние облака ----
    function renderCloudState(kind) {
        // Пришли по ссылке «сброс пароля» из письма
        if (kind === 'recovery') {
            if (typeof window.switchTab === 'function') window.switchTab('home');
            window.hsOpenAuth('recovery');
            toast('Придумайте новый пароль');
            return;
        }
        // Колонна: гостю — форма, вошедшему — приветствие «В кабинет»
        updateAuthView();
        var authed = !!(window.supa && window.supa.isAuthed());
        // Если форма всё же видна при активной сессии (recovery) — подпись честная
        var foot = el('hsFoot');
        if (foot && authed && authMode !== 'recovery') {
            var email = (window.supa.profile && window.supa.profile.email) ||
                        (window.supa.session.user && window.supa.session.user.email) || '';
            foot.innerHTML = 'Вы вошли как <b>' + String(email).replace(/[<>&]/g, '') + '</b> · ' +
                '<a class="hr-link" onclick="switchTab(\'portfolios\')">К портфелям</a>';
        }
        // Показ «Забыли пароль?» при уже выбранном режиме входа
        var forgot = el('hsForgot');
        if (forgot) forgot.style.display = (authMode === 'login' && cloudOn()) ? '' : 'none';
    }

    if (window.supa) window.supa.onChange(renderCloudState);
})();

// =============================================
// HOME COVER — живой пульс IMOEX в пилюле у CTA
// =============================================
// Дневное изменение индекса + время обновления из MOEX ISS
// (колонка именно LASTCHANGEPRC — LASTTOCLOSEPRC не существует).
(function () {
    'use strict';

    var IMOEX_URL = 'https://iss.moex.com/iss/engines/stock/markets/index/securities.json' +
        '?iss.meta=off&securities=IMOEX&iss.only=marketdata&marketdata.columns=SECID,LASTCHANGEPRC,UPDATETIME';

    function loadImoex() {
        var elV = document.getElementById('hcStatImoex');
        if (!elV) return;
        fetch(IMOEX_URL)
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var md = j && j.marketdata;
                if (!md || !md.data || !md.data.length) return;
                var row = md.data[0];
                var v = row[md.columns.indexOf('LASTCHANGEPRC')];
                if (v == null || isNaN(v)) return;
                var sign = v > 0 ? '+' : (v < 0 ? '−' : '');
                elV.textContent = sign + Math.abs(v).toFixed(2).replace('.', ',') + '%';
                elV.classList.toggle('pos', v > 0);
                elV.classList.toggle('neg', v < 0);
                var upd = row[md.columns.indexOf('UPDATETIME')];
                var updEl = document.getElementById('hgLiveUpd');
                if (updEl && upd) updEl.textContent = String(upd).slice(0, 5);
            })
            .catch(function () { /* биржа недоступна — остаётся «—» */ });
    }

    loadImoex();
    setInterval(loadImoex, 60000);
})();

// =============================================
// HOME COVER — фоновая тепловая карта IMOEX (#hgHeatBg)
// =============================================
// Декоративный слой под манифестом: топ бумаг индекса по весу,
// squarified-treemap (как у большой карты на «Рынке», но без
// интерактива и секторов). Данные — те же два эндпоинта MOEX ISS.
// Стили/цвета плиток — .hg-tile в home-register.css (интенсивность --k).
// Биржа недоступна → слой просто пуст, обложка остаётся белой.
(function () {
    'use strict';

    var ISS = 'https://iss.moex.com/iss/';
    var A_URL = ISS + 'statistics/engines/stock/markets/index/analytics/IMOEX.json' +
        '?iss.meta=off&iss.only=analytics&analytics.columns=ticker,weight&limit=100';
    var M_URL = ISS + 'engines/stock/markets/shares/boards/TQBR/securities.json' +
        '?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LASTTOPREVPRICE';

    var CAP = 3;         // ±3% — полная насыщенность цвета (период «день»)
    var MAX_TILES = 34;  // плиток больше не нужно — фон, а не терминал
    var weights = null;  // [{tk, value}] по убыванию веса (кэш на сессию)
    var changes = null;  // {TICKER: изм.% за день}

    function jget(url) {
        return fetch(url, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error(url + ' ' + r.status);
            return r.json();
        });
    }

    // --- компактный squarified treemap (Bruls et al., как в market-heatmap.js) ---
    function worst(row, side) {
        var max = -Infinity, min = Infinity, sum = 0, i;
        for (i = 0; i < row.length; i++) { var a = row[i].area; sum += a; if (a > max) max = a; if (a < min) min = a; }
        if (sum === 0) return Infinity;
        var s2 = sum * sum, side2 = side * side;
        return Math.max((side2 * max) / s2, s2 / (side2 * min));
    }
    function layoutRow(row, free, out) {
        var rowArea = 0, i, seg;
        for (i = 0; i < row.length; i++) rowArea += row[i].area;
        if (free.w <= free.h) {
            var rh = rowArea / free.w, x = free.x;
            for (i = 0; i < row.length; i++) { seg = row[i].area / rh;
                out.push({ tk: row[i].tk, x: x, y: free.y, w: seg, h: rh }); x += seg; }
            return { x: free.x, y: free.y + rh, w: free.w, h: free.h - rh };
        }
        var rw = rowArea / free.h, y = free.y;
        for (i = 0; i < row.length; i++) { seg = row[i].area / rw;
            out.push({ tk: row[i].tk, x: free.x, y: y, w: rw, h: seg }); y += seg; }
        return { x: free.x + rw, y: free.y, w: free.w - rw, h: free.h };
    }
    function squarify(items, rect) {
        var out = [];
        if (rect.w <= 0 || rect.h <= 0) return out;
        var total = 0, i;
        for (i = 0; i < items.length; i++) total += items[i].value;
        if (total <= 0) return out;
        var scale = (rect.w * rect.h) / total;
        var scaled = items.map(function (n) { return { tk: n.tk, area: n.value * scale }; })
            .sort(function (a, b) { return b.area - a.area; });
        var free = { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, row = [], idx = 0;
        while (idx < scaled.length) {
            var side = Math.min(free.w, free.h), item = scaled[idx];
            if (row.length === 0 || worst(row.concat(item), side) <= worst(row, side)) { row.push(item); idx++; }
            else { free = layoutRow(row, free, out); row = []; }
        }
        if (row.length) layoutRow(row, free, out);
        return out;
    }

    function draw() {
        var box = document.getElementById('hgHeatBg');
        if (!box || !weights) return;
        var W = box.clientWidth, H = box.clientHeight;
        if (W < 2 || H < 2) return;
        var tiles = squarify(weights.slice(0, MAX_TILES), { x: 0, y: 0, w: W, h: H });
        var html = '';
        tiles.forEach(function (t) {
            var chg = changes ? changes[t.tk] : null;
            var cls = (chg != null && chg > 0.02) ? 'up' : ((chg != null && chg < -0.02) ? 'dn' : 'flat');
            var k = Math.min(1, Math.abs(chg || 0) / CAP);
            var x = t.x + 2, y = t.y + 2, w = Math.max(0, t.w - 4), h = Math.max(0, t.h - 4);
            var label = (w > 64 && h > 40) ? t.tk : '';
            html += '<div class="hg-tile ' + cls + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) +
                'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;--k:' + k.toFixed(2) + '">' + label + '</div>';
        });
        box.innerHTML = html;
    }

    function load() {
        if (!document.getElementById('hgHeatBg')) return;
        Promise.all([weights ? Promise.resolve(null) : jget(A_URL), jget(M_URL)])
            .then(function (res) {
                if (res[0]) {
                    var a = res[0].analytics, ti = a.columns.indexOf('ticker'), wi = a.columns.indexOf('weight');
                    weights = a.data.map(function (r) { return { tk: r[ti], value: +r[wi] || 0 }; })
                        .sort(function (x, y) { return y.value - x.value; });
                }
                var md = res[1].marketdata, si = md.columns.indexOf('SECID'), ci = md.columns.indexOf('LASTTOPREVPRICE');
                var m = {};
                md.data.forEach(function (r) { m[r[si]] = r[ci]; });
                changes = m;
                draw();
            })
            .catch(function () { /* фон опционален — молча пропускаем */ });
    }

    load();
    setInterval(function () {
        if (document.hidden) return;
        var p = document.getElementById('panel-home');
        if (!p || !p.classList.contains('active')) return;
        load();
    }, 60000);

    var rsz = null;
    window.addEventListener('resize', function () {
        clearTimeout(rsz);
        rsz = setTimeout(draw, 200);
    });

    // Возврат на Главную: пока вкладка скрыта, у #hgHeatBg нулевой размер —
    // перерисовываем после переключения (паттерн обёртки как у market-heatmap)
    (function hook() {
        var prev = window.switchTab;
        if (typeof prev !== 'function') { setTimeout(hook, 300); return; }
        window.switchTab = function (tab) {
            var r = prev.apply(this, arguments);
            if (tab === 'home') setTimeout(draw, 80);
            return r;
        };
    })();
})();
