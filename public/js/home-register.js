// =============================================
// HOME AUTH — стартовая сплит-карточка (регистрация/вход)
// =============================================
// Лёгкая клиентская форма на приветственной вкладке:
//   • переключатель «Регистрация / Вход» (одна форма, два режима),
//   • базовая валидация + сохранение в localStorage (демо),
//   • показ/скрытие пароля,
//   • вход через Telegram (использует Telegram WebApp, если есть).
// Бэкенд-регистрация (брокеры/планы) живёт отдельно в registration.js.

(function () {
    'use strict';

    var authMode = 'register'; // 'register' | 'login'

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

    // ---- Переключение «Регистрация / Вход» ----
    window.homeAuthMode = function (mode) {
        if (mode !== 'register' && mode !== 'login') return;
        if (mode === authMode) return;
        authMode = mode;
        haptic('medium');

        var isReg = mode === 'register';
        var el = function (id) { return document.getElementById(id); };

        var tabReg = el('hsTabRegister');
        var tabLogin = el('hsTabLogin');
        if (tabReg) tabReg.classList.toggle('active', isReg);
        if (tabLogin) tabLogin.classList.toggle('active', !isReg);

        var title = el('hsAuthTitle');
        if (title) title.textContent = isReg ? 'Создайте аккаунт' : 'С возвращением!';

        var nameField = el('hsNameField');
        if (nameField) nameField.classList.toggle('hidden', !isReg);

        var hint = el('hsPassHint');
        if (hint) hint.style.display = isReg ? '' : 'none';

        var label = el('hsSubmitLabel');
        if (label) label.textContent = isReg ? 'Создать аккаунт' : 'Войти';

        var foot = el('hsFoot');
        if (foot) {
            foot.innerHTML = isReg
                ? 'Уже есть аккаунт? <a class="hr-link" onclick="homeAuthMode(\'login\')">Войти</a>'
                : 'Нет аккаунта? <a class="hr-link" onclick="homeAuthMode(\'register\')">Создать</a>';
        }

        // Сбрасываем ошибку и «выполненное» состояние кнопки при смене режима.
        var errBox = el('homeRegError');
        if (errBox) errBox.classList.remove('show');
        var btn = el('hsSubmit');
        if (btn) btn.classList.remove('is-done');

        var form = el('homeRegForm');
        if (form && form.password) {
            form.password.setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
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

    // ---- Отправка формы (регистрация или вход) ----
    window.homeRegisterSubmit = function (event) {
        if (event) event.preventDefault();
        var form = document.getElementById('homeRegForm');
        var errBox = document.getElementById('homeRegError');
        if (!form) return false;

        var isReg = authMode === 'register';
        var name = (form.name.value || '').trim();
        var email = (form.email.value || '').trim();
        var pass = form.password.value || '';

        function fail(msg) {
            if (errBox) { errBox.textContent = msg; errBox.classList.add('show'); }
            return false;
        }
        if (errBox) errBox.classList.remove('show');

        if (isReg && name.length < 2) return fail('Введите имя');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Введите корректный email');
        if (pass.length < 6) return fail('Пароль — минимум 6 символов');

        // Демо-сохранение профиля (без передачи пароля наружу).
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

        // Успех: визуальный отклик на кнопке, затем переход в терминал.
        var btn = form.querySelector('.hr-submit');
        if (btn) { btn.classList.add('is-done'); btn.innerHTML = 'Готово ✓'; }
        haptic('success');
        toast(isReg ? ('Аккаунт создан, ' + name + '!') : 'Вход выполнен');

        setTimeout(function () {
            if (typeof window.switchTab === 'function') window.switchTab('calc');
        }, 900);
        return false;
    };

    // ---- Вход через Telegram ----
    window.homeTelegramLogin = function () {
        haptic('medium');
        var tg = window.Telegram && window.Telegram.WebApp;
        var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;

        if (user) {
            // Приложение открыто внутри Telegram — пользователь уже авторизован.
            try {
                localStorage.setItem('home_profile_v1', JSON.stringify({
                    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
                    telegram_id: user.id,
                    username: user.username || null,
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
        // BOT_USERNAME можно задать глобально (window.TG_BOT_USERNAME) при деплое.
        var bot = window.TG_BOT_USERNAME;
        if (bot) {
            var link = 'https://t.me/' + bot;
            if (tg && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(link);
            else window.open(link, '_blank', 'noopener');
            return;
        }

        toast('Откройте приложение через Telegram, чтобы войти', true);
    };
})();
