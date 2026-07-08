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

    // ---- Модалка входа (#hsAuthOverlay в <body>) ----
    // Форма-«телефон» больше не живёт на Главной: обложка открывает её
    // кнопкой «Вход», recovery-ссылка из письма — автоматически.
    window.hsOpenAuth = function (mode) {
        var ov = el('hsAuthOverlay');
        if (!ov) return;
        if (mode) window.homeAuthMode(mode);
        if (!ov.hidden) return;
        ov.hidden = false;
        // класс .open на следующий кадр — иначе transition не сыграет
        requestAnimationFrame(function () { ov.classList.add('open'); });
        haptic('medium');
    };
    window.hsCloseAuth = function () {
        var ov = el('hsAuthOverlay');
        if (!ov || ov.hidden) return;
        ov.classList.remove('open');
        setTimeout(function () { ov.hidden = true; }, 280);
    };
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') window.hsCloseAuth();
    });

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
            window.hsCloseAuth();
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
        // Кнопка на обложке: гостю — «Вход», вошедшему — «В кабинет»
        var coverBtn = el('hcAuthBtn');
        var authed = !!(window.supa && window.supa.isAuthed());
        if (coverBtn) {
            coverBtn.textContent = authed ? 'В кабинет' : 'Вход';
            coverBtn.onclick = authed
                ? function () { if (typeof window.switchTab === 'function') window.switchTab('portfolios'); }
                : function () { window.hsOpenAuth('login'); };
        }
        // Уже вошли — форма говорит об этом, а не предлагает регистрацию
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
// HOME COVER — живые цифры дня на обложке
// =============================================
// Ставка ЦБ и доходность ОФЗ приходят из ratesData: updateRatesDisplay
// (js/core.js) дублирует значения в #hcStatKey/#hcStatOfz при каждом
// обновлении. Здесь — только дневное изменение IMOEX из MOEX ISS.
(function () {
    'use strict';

    var IMOEX_URL = 'https://iss.moex.com/iss/engines/stock/markets/index/securities.json' +
        '?iss.meta=off&securities=IMOEX&iss.only=marketdata&marketdata.columns=SECID,LASTCHANGEPRC';

    function loadImoex() {
        var elV = document.getElementById('hcStatImoex');
        if (!elV) return;
        fetch(IMOEX_URL)
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var md = j && j.marketdata;
                if (!md || !md.data || !md.data.length) return;
                var v = md.data[0][md.columns.indexOf('LASTCHANGEPRC')];
                if (v == null || isNaN(v)) return;
                var sign = v > 0 ? '+' : (v < 0 ? '−' : '');
                elV.textContent = sign + Math.abs(v).toFixed(2).replace('.', ',') + '%';
                elV.classList.toggle('pos', v > 0);
                elV.classList.toggle('neg', v < 0);
            })
            .catch(function () { /* биржа недоступна — остаётся «—» */ });
    }

    loadImoex();
    setInterval(loadImoex, 60000);
})();
