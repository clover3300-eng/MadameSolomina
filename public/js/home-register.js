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
    function escHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    // Вид «гость ↔ вошёл» меняет ВЕСЬ первый экран: манифест слева и колонну
    // справа. Голая подмена делала это за один кадр — самый заметный рывок на
    // сайте. Поэтому: первая отрисовка (загрузка страницы) — молча, а НАСТОЯЩАЯ
    // смена состояния — короткой сменой через ноль (класс .hg-swap, стили в
    // home-register.css). Тот же приём, что у .pfo-anim-in: анимируем событие,
    // а не каждую перерисовку.
    var _authShown = null;          // null = ещё ни разу не рисовали
    var _authSwapT = null;

    function updateAuthView(opts) {
        var form = el('hsAuthInner');
        var done = el('hgAuthed');
        if (!form || !done) return;
        var authed = !!(window.supa && window.supa.isAuthed());
        var showDone = authed && authMode !== 'recovery';

        // silent — вид ставится молча. Обязателен на 'init': до ответа облака
        // вид отрисован «гостевым», и появление сессии выглядело бы сменой
        // состояния — вошедший ловил бы перемигивание манифеста НА КАЖДОЙ
        // загрузке страницы. Анимируем только настоящие вход и выход.
        var silent = !!(opts && opts.silent);
        var first = (_authShown === null);
        var changed = !first && !silent && _authShown !== showDone;
        _authShown = showDone;
        if (changed) { softSwapAuthView(showDone); return; }
        applyAuthView(showDone);
    }

    function authZones() {
        return [document.querySelector('.hg-manifest'), el('hgDockGuest'), el('hgDockAuthed')].filter(Boolean);
    }
    function clearAuthSwap() {
        authZones().forEach(function (z) { z.classList.remove('hg-swap'); });
    }

    // Гасим обе зоны → подменяем содержимое под ноль → проявляем обратно
    function softSwapAuthView(showDone) {
        var zones = authZones();
        // В фоновой вкладке кадры не приходят, а таймеры throttled: анимация
        // не доиграет и оставит манифест с колонной на opacity:0 — то есть
        // ПУСТОЙ экран вместо плавности. Смотреть там всё равно некому —
        // меняем вид мгновенно. Тот же урок, что и с занавесом переходов.
        if (!zones.length || document.hidden) { applyAuthView(showDone); clearAuthSwap(); return; }
        clearTimeout(_authSwapT);
        zones.forEach(function (z) { z.classList.add('hg-swap'); });
        _authSwapT = setTimeout(function () {
            applyAuthView(showDone);
            // следующий кадр — иначе браузер склеит подмену и проявление в один шаг
            requestAnimationFrame(clearAuthSwap);
            setTimeout(clearAuthSwap, 60);   // если кадр не придёт
        }, 200);
    }

    // Ушли со вкладки посреди смены — вернувшийся не должен застать пустоту
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        clearTimeout(_authSwapT);
        if (_authShown !== null) applyAuthView(_authShown);
        clearAuthSwap();
    });

    function applyAuthView(showDone) {
        var form = el('hsAuthInner');
        var done = el('hgAuthed');
        if (!form || !done) return;
        form.style.display = showDone ? 'none' : '';
        done.hidden = !showDone;

        var name = (window.supa && window.supa.profile && window.supa.profile.name) || '';
        var email = (window.supa && window.supa.profile && window.supa.profile.email) ||
                    (window.supa && window.supa.session && window.supa.session.user &&
                     window.supa.session.user.email) || '';
        if (showDone) {
            var box = el('hgAuthedEmail');
            if (box) box.textContent = email ? ('Вы вошли как ' + email) : 'Вы вошли в аккаунт';
        }

        // Док внизу сцены: гостю — почта и две кнопки, вошедшему — действия.
        var dockGuest = el('hgDockGuest'), dockAuthed = el('hgDockAuthed');
        if (dockGuest) dockGuest.hidden = showDone;
        if (dockAuthed) dockAuthed.hidden = !showDone;
        // Шапка: «Войти» ↔ аватар с первой буквой имени (или почты).
        var loginBtn = el('hgLoginBtn'), ava = el('hgHeadAva');
        if (loginBtn) loginBtn.hidden = showDone;
        if (ava) {
            ava.hidden = !showDone;
            var letter = (name || email || '·').trim().charAt(0).toUpperCase();
            ava.textContent = letter || '·';
            ava.setAttribute('aria-label', name ? ('Кабинет: ' + name) : 'Личный кабинет');
        }

        // Манифест живой: гостю — приглашение, вошедшему «с возвращением» по имени.
        var title = el('hcTitle'), lead = el('hcLead'), cta = el('hcCtaLabel');
        if (title && lead) {
            if (showDone) {
                title.innerHTML = 'С возвращением' + (name ? ', <em>' + escHtml(name) + '</em>' : '');
                lead.textContent = 'Рынок не стоял на месте: загляните в портфель и сверьте доли — ' +
                    'ребаланс займёт пару минут.';
                if (cta) cta.textContent = 'Сделать ребалансировку';
            } else {
                title.innerHTML = 'Терминал <em>спокойного</em> инвестора';
                lead.textContent = 'Портфель из ОФЗ и акций под вашу цель, план ребаланса ' +
                    'и выплаты по расписанию.';
            }
        }
    }

    // ---- Карточка формы поверх сцены ----
    // Модалки по-прежнему нет: форма живёт в разметке Главной и просто
    // раскрывается поверх орбит (сцена отходит на второй план классом
    // .hg-formopen). Почта, введённая в док, переезжает в форму.
    function formOpen() {
        var cover = el('hgCover');
        return !!(cover && cover.classList.contains('hg-formopen'));
    }
    window.hgOpenForm = function (mode) {
        var cover = el('hgCover');
        if (!cover) return;
        if (mode) window.homeAuthMode(mode);
        cover.classList.add('hg-formopen');
        var btn = el('hgLoginBtn');
        if (btn) btn.classList.toggle('is-on', mode === 'login');

        var form = el('homeRegForm');
        var quick = el('hgQuickMail');
        if (form && quick && quick.value && !form.email.value) form.email.value = quick.value.trim();
        haptic('medium');

        // Фокус в первое пустое поле: имя (регистрация) или почта/пароль (вход)
        setTimeout(function () {
            if (!form) return;
            var first = (mode === 'login')
                ? (form.email.value ? form.password : form.email)
                : (form.name && !form.name.value ? form.name : (form.email.value ? form.password : form.email));
            try { first.focus({ preventScroll: true }); } catch (e) { try { first.focus(); } catch (e2) {} }
        }, 60);
    };
    window.hgCloseForm = function () {
        var cover = el('hgCover');
        if (!cover) return;
        cover.classList.remove('hg-formopen');
        var btn = el('hgLoginBtn');
        if (btn) btn.classList.remove('is-on');
        clearNote();
    };
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && formOpen()) window.hgCloseForm();
    });
    // Кнопка манифеста: гостя ведёт в калькулятор, вошедшего — в Портфели
    // (там живёт ребалансировка).
    window.hcCtaGo = function () {
        var authed = !!(window.supa && window.supa.isAuthed());
        if (typeof window.switchTab === 'function') window.switchTab(authed ? 'portfolios' : 'calc');
    };
    // Совместимость со старым API модалки: «открыть» = переключить режим
    // и подвести взгляд к колонне (recovery-ссылка из письма зовёт именно это).
    window.hsOpenAuth = function (mode) {
        updateAuthView();
        window.hgOpenForm(mode || 'register');
    };
    window.hsCloseAuth = function () { window.hgCloseForm(); };

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

        // До входа мы не знаем, кто перед нами: приветствие по имени звучит
        // ТОЛЬКО после входа (в манифесте сцены), форма называется честно.
        var title = el('hsAuthTitle');
        if (title) title.textContent = isRec ? 'Новый пароль' : (isReg ? 'Создайте аккаунт' : 'Вход в кабинет');
        var sub = el('hsAuthSub');
        if (sub) {
            sub.textContent = isRec ? 'Придумайте пароль, которым будете входить'
                : (isReg ? 'Личный кабинет инвестора Madame Solomi\'na'
                         : 'Портфели и настройки ждут внутри');
        }

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
            form.password.setAttribute('placeholder', mode === 'login' ? 'Ваш пароль' : 'Придумайте пароль');
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
    // Куда вести после успеха. «Раздел при запуске» из настроек кабинета
    // (profile_settings_v1) уважается всегда. Если он не задан:
    //   · вход (email/Telegram/новый пароль) — ОСТАЁМСЯ на Главной: манифест
    //     уже перерисован в «С возвращением, Имя» (updateAuthView), прыжок
    //     на «Расчёт» и мерцания были главным раздражителем;
    //   · регистрация нового аккаунта — прежний дефолт «Расчёт» (онбординг).
    function landingTab(isNewUser) {
        var startTab = '';
        try {
            var s = JSON.parse(localStorage.getItem('profile_settings_v1') || '{}');
            if (s && typeof s.startTab === 'string') startTab = s.startTab;
        } catch (e) {}
        if (startTab && startTab !== 'home') return startTab;
        return isNewUser ? 'calc' : 'home';
    }

    function successAndGo(msg, isNewUser) {
        var btn = el('hsSubmit');
        if (btn) { btn.classList.add('is-done'); btn.disabled = false; el('hsSubmitLabel').textContent = 'Готово ✓'; }
        haptic('success');
        toast(msg);
        var dest = landingTab(isNewUser);
        // Остаёмся на Главной — карточку формы закрываем, чтобы человек увидел
        // перерисованный манифест «С возвращением» и свою сцену, а не форму.
        if (dest === 'home') setTimeout(function () { window.hgCloseForm(); }, 420);

        // При облачном входе cloud-sync сам делает один мягкий reload, подтянув данные.
        // Ставим целевой путь заранее — после reload route-hash откроет нужную вкладку
        // синхронно, до первого пейнта (бесшовно, без промежуточной Главной).
        if (cloudOn()) {
            if (dest !== 'home') {
                try { history.replaceState({ tab: dest }, '', '/' + dest); } catch (e) {}
                // Фолбэк, если reload не случился (данные не изменились / 30-сек. гард).
                setTimeout(function () {
                    if (typeof window.switchTab === 'function' &&
                        typeof currentTab !== 'undefined' && currentTab !== dest) {
                        window.switchTab(dest);
                    }
                }, 1600);
            }
            // dest === 'home': никуда не уходим — пользователь уже видит приветствие
            return;
        }

        if (dest !== 'home') {
            setTimeout(function () {
                if (typeof window.switchTab === 'function') window.switchTab(dest);
            }, 900);
        }
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
                        successAndGo('Аккаунт создан, ' + name + '!', true);
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

        successAndGo(isReg ? ('Аккаунт создан, ' + name + '!') : 'Вход выполнен', isReg);
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
            var demoDest = landingTab();
            if (demoDest !== 'home' && typeof window.switchTab === 'function') {
                setTimeout(function () { window.switchTab(demoDest); }, 600);
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
        // Колонна: гостю — форма, вошедшему — приветствие «В кабинет».
        // 'init' — не смена состояния, а первое знакомство с ним при загрузке
        // страницы: ставим молча (см. updateAuthView)
        updateAuthView({ silent: kind === 'init' });
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

    // Тот же путь ISS, что и на «Рынке». URL строим через общий прокси
    // (window.moexUrl из core.js) — как остальные вкладки; прямой iss.moex.com
    // оставлен фолбэком, если core.js почему-то не отдал moexUrl.
    var IMOEX_PATH = '/iss/engines/stock/markets/index/securities.json' +
        '?iss.meta=off&securities=IMOEX&iss.only=marketdata' +
        '&marketdata.columns=SECID,CURRENTVALUE,LASTCHANGEPRC,UPDATETIME';
    function imoexUrl() {
        return (typeof window.moexUrl === 'function')
            ? window.moexUrl(IMOEX_PATH)
            : 'https://iss.moex.com' + IMOEX_PATH;
    }

    function loadImoex() {
        var elV = document.getElementById('hcStatImoex');
        if (!elV) return;
        fetch(imoexUrl())
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var md = j && j.marketdata;
                if (!md || !md.data || !md.data.length) return;
                var row = md.data[0];
                // Само значение индекса — сердце «Обсерватории» (центр сцены)
                var cur = row[md.columns.indexOf('CURRENTVALUE')];
                var core = document.getElementById('hgCoreVal');
                if (core && cur != null && !isNaN(cur)) {
                    core.textContent = Number(cur).toLocaleString('ru-RU', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2
                    });
                }
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
// Декоративный слой во весь экран (фикс-обёртка #hgHeatWrap в #appShell,
// видна только на Главной): топ бумаг индекса по весу, squarified-treemap
// (как у большой карты на «Рынке», но без интерактива и секторов).
// Данные — те же два эндпоинта MOEX ISS. Стили/цвета плиток — .hg-tile
// в home-register.css (интенсивность --k).
// Биржа недоступна → слой просто пуст, остаётся фон-градиент.
(function () {
    'use strict';

    var ISS = 'https://iss.moex.com/iss/';
    var A_URL = ISS + 'statistics/engines/stock/markets/index/analytics/IMOEX.json' +
        '?iss.meta=off&iss.only=analytics&analytics.columns=ticker,weight&limit=100';
    var M_URL = ISS + 'engines/stock/markets/shares/boards/TQBR/securities.json' +
        '?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LASTTOPREVPRICE';

    var CAP = 3;         // ±3% — полная насыщенность цвета (период «день»)
    var MAX_TILES = 46;  // фон теперь во весь экран — плиток чуть больше
    var weights = null;  // [{tk, value}] по убыванию веса (кэш на сессию)
    var changes = null;  // {TICKER: изм.% за день}

    function jget(url) {
        // через прокси (window.issUrl из core.js): прямой ISS у части пользователей режется
        return fetch(window.issUrl ? window.issUrl(url) : url, { cache: 'no-store' }).then(function (r) {
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

    // Рисует карту в произвольный контейнер. Помимо родного #hgHeatBg этим же
    // рендером пользуются заглушки вкладок (js/tab-gates.js): их сцена — «Главная
    // один в один», фон .gx-heat заполняется теми же живыми плитками .hg-tile.
    function drawInto(box) {
        if (!box || !weights) return;
        var W = box.clientWidth, H = box.clientHeight;
        if (W < 2 || H < 2) return;
        var tiles = squarify(weights.slice(0, MAX_TILES), { x: 0, y: 0, w: W, h: H });
        // Мелкие плитки (хвост индекса, кластер в углу) не должны спорить
        // с манифестом: до этой площади плитка растворяется в фон (--a)
        var FULL_AREA = W * H * 0.008;
        var html = '';
        tiles.forEach(function (t) {
            var chg = changes ? changes[t.tk] : null;
            var cls = (chg != null && chg > 0.02) ? 'up' : ((chg != null && chg < -0.02) ? 'dn' : 'flat');
            var x = t.x + 2, y = t.y + 2, w = Math.max(0, t.w - 4), h = Math.max(0, t.h - 4);
            var a = Math.min(1, (w * h) / FULL_AREA);
            var k = Math.min(1, Math.abs(chg || 0) / CAP) * (0.35 + 0.65 * a);
            var label = (w > 64 && h > 40) ? t.tk : '';
            html += '<div class="hg-tile ' + cls + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) +
                'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;--k:' + k.toFixed(2) +
                ';--a:' + a.toFixed(2) + '">' + label + '</div>';
        });
        box.innerHTML = html;
    }

    // ============================================================
    // ОБСЕРВАТОРИЯ — узлы-бумаги на эллиптических орбитах (#hgOrbits)
    // ============================================================
    // Те же данные, что кормили карту-фон: веса (размер узла) и дневное
    // изменение (цвет по монохромному закону — заливка растёт, контур падает).
    // Движение делает CSS (offset-path + offset-distance), js только раскладывает.
    // Орбиты заданы в ПРОЦЕНТАХ поля — сцена адаптивна без пересчёта на resize.
    var RINGS = [
        { rx: 26, ry: 20.5, dur: 90,  rev: false },
        { rx: 36, ry: 29,   dur: 140, rev: true  },   // средняя идёт навстречу
        { rx: 46, ry: 38,   dur: 200, rev: false }
    ];
    var ORB_MAX = 12;      // столько бумаг живёт на сцене
    var ORB_CAP = 3;       // ±3% — полная насыщенность цвета

    // offset-path поддерживают не все браузеры: без него узлы расставляются
    // статически (тригонометрией) — композиция сохраняется, движения нет.
    var CAN_ORBIT = (function () {
        try {
            return !!(window.CSS && CSS.supports &&
                CSS.supports('offset-path', 'ellipse(30% 20% at 50% 50%)'));
        } catch (e) { return false; }
    })();

    function drawOrbits() {
        var box = document.getElementById('hgOrbits');
        if (!box || !weights) return;
        var list = weights.slice(0, ORB_MAX);
        var html = '';
        list.forEach(function (item, i) {
            var ring = RINGS[i % RINGS.length];
            // фаза: равномерно по своему кольцу + смещение кольца, чтобы
            // соседние орбиты не выстраивались в линию
            var perRing = Math.ceil(list.length / RINGS.length);
            var slot = Math.floor(i / RINGS.length);
            var phase = (slot / perRing) + (i % RINGS.length) * 0.11;
            phase = phase - Math.floor(phase);

            var chg = changes ? changes[item.tk] : null;
            var c = (chg == null || isNaN(chg)) ? 0 : +chg;
            var k = Math.min(1, Math.abs(c) / ORB_CAP);
            var cls = c < -0.02 ? 'dn' : 'up';
            var w = item.value || 0;
            var fs = (10 + Math.min(w, 14) * 0.55).toFixed(1);      // 10…17.7px
            var pad = (5 + Math.min(w, 14) * 0.35).toFixed(1);
            var sign = c > 0 ? '+' : (c < 0 ? '−' : '');
            var pct = sign + Math.abs(c).toFixed(2).replace('.', ',') + '%';

            var pos, extra;
            if (CAN_ORBIT) {
                pos = 'offset-path:ellipse(' + ring.rx + '% ' + ring.ry + '% at 50% 50%);' +
                      '--od:' + (phase * 100).toFixed(2) + '%;' +
                      'animation-duration:' + ring.dur + 's;' +
                      'animation-direction:' + (ring.rev ? 'reverse' : 'normal') + ';';
                extra = ' hg-flying';
            } else {
                var a = phase * Math.PI * 2;
                pos = 'left:' + (50 + ring.rx * Math.cos(a)).toFixed(2) + '%;' +
                      'top:' + (50 + ring.ry * Math.sin(a)).toFixed(2) + '%;' +
                      'transform:translate(-50%,-50%);';
                extra = '';
            }
            html += '<button type="button" class="hg-orb ' + cls + extra + '"' +
                ' style="' + pos + '--k:' + k.toFixed(2) + ';padding:' + pad + 'px ' + (pad * 1.9).toFixed(1) + 'px"' +
                ' onclick="switchTab(\'market\')" title="' + item.tk + ' ' + pct + ' — открыть Рынок">' +
                '<b style="font-size:' + fs + 'px">' + item.tk + '</b>' +
                (w > 3.2 ? '<span style="font-size:' + (fs * 0.82).toFixed(1) + 'px">' + pct + '</span>' : '') +
                '</button>';
        });
        box.innerHTML = html;
        var meta = document.getElementById('hgBtmMeta');
        if (meta) meta.textContent = 'топ-' + list.length + ' весов индекса';
    }

    // Все живые сцены на странице: орбиты Главной + плитки заглушек (.gx-heat)
    function draw() {
        drawOrbits();
        drawInto(document.getElementById('hgHeatBg'));
        var extra = document.querySelectorAll('.gx-heat');
        for (var i = 0; i < extra.length; i++) drawInto(extra[i]);
    }
    // Публичный репейнт для tab-gates.js: данные уже есть — рисуем сразу,
    // нет — грузим (draw() случится по приходу данных).
    window.hgHeatRepaint = function () {
        if (weights && changes) draw(); else load();
    };

    function load() {
        // Цели рендера: орбиты Главной, фоны заглушек, старый слой карты
        if (!document.getElementById('hgOrbits') &&
            !document.getElementById('hgHeatBg') &&
            !document.querySelector('.gx-heat')) return;
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
        var homeActive = !!(p && p.classList.contains('active'));
        // живая карта видна и на заглушках: активная закрытая вкладка
        // или полноэкранная заглушка мобильной версии
        var gateVisible = !!document.querySelector('.tab-panel.active .gx-heat, #gxMobileCover .gx-heat');
        if (!homeActive && !gateVisible) return;
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
            // Авто-тема по вкладке (Главная тёмная, остальные светлые), пока нет
            // явного выбора — ДО отрисовки, чтобы вкладка появлялась уже в своей теме.
            if (typeof window.applyAutoThemeForTab === 'function') window.applyAutoThemeForTab(tab);
            var r = prev.apply(this, arguments);
            if (tab === 'home') setTimeout(draw, 80);
            return r;
        };
    })();
})();
