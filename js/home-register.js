// =============================================
// HOME REGISTER — стартовая форма (скролл вниз)
// =============================================
// Лёгкая клиентская форма на приветственной вкладке:
//   • плавный скролл к форме,
//   • базовая валидация + сохранение в localStorage (демо),
//   • вход через Telegram (использует Telegram WebApp, если есть).
// Бэкенд-регистрация (брокеры/планы) живёт отдельно в registration.js.

(function () {
    'use strict';

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

    // ---- Плавная прокрутка к форме регистрации ----
    window.scrollToRegister = function () {
        var target = document.getElementById('homeRegister');
        if (!target) return;
        haptic('medium');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Фокус на первое поле после прокрутки (без рывка экрана).
        setTimeout(function () {
            var first = target.querySelector('.hr-input');
            if (first) first.focus({ preventScroll: true });
        }, 600);
    };

    // ---- Отправка формы регистрации ----
    window.homeRegisterSubmit = function (event) {
        if (event) event.preventDefault();
        var form = document.getElementById('homeRegForm');
        var errBox = document.getElementById('homeRegError');
        if (!form) return false;

        var name = (form.name.value || '').trim();
        var email = (form.email.value || '').trim();
        var pass = form.password.value || '';

        function fail(msg) {
            if (errBox) { errBox.textContent = msg; errBox.classList.add('show'); }
            return false;
        }
        if (errBox) errBox.classList.remove('show');

        if (name.length < 2) return fail('Введите имя');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Введите корректный email');
        if (pass.length < 6) return fail('Пароль — минимум 6 символов');

        // Демо-сохранение профиля (без передачи пароля наружу).
        try {
            localStorage.setItem('home_profile_v1', JSON.stringify({
                name: name, email: email, createdAt: Date.now()
            }));
        } catch (e) { /* приватный режим — не критично */ }

        // Успех: визуальный отклик на кнопке, затем переход в терминал.
        var btn = form.querySelector('.hr-submit');
        if (btn) { btn.classList.add('is-done'); btn.textContent = 'Готово ✓'; }
        haptic('success');
        toast('Аккаунт создан, ' + name + '!');

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
