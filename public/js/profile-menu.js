// =============================================
// ЛИЧНЫЙ КАБИНЕТ — задел (база данных не подключена)
// =============================================
// Круглая кнопка-аватар (#topProfileBtn, шапка, все вкладки кроме
// Главной) раскрывает по наведению/клику панель #profileHub:
//   • Профиль — имя/фамилия/email (локальный аккаунт home_profile_v1),
//   • API брокера — токен для будущей автозагрузки портфеля,
//   • Настройки — стартовый раздел, приватность (задел),
//   • Выйти / Создать аккаунт.
// Кнопка темы на этих вкладках уезжает в правый нижний угол (#themeFab).
//
// Хранилище: home_profile_v1 (создаёт форма на Главной) +
// profile_settings_v1 (этот модуль). Точки подмены на Supabase:
// getProfile()/saveProfile()/logout() — весь остальной код ходит
// только через них.

(function () {
    'use strict';

    var LS_PROFILE = 'home_profile_v1';
    var LS_SETTINGS = 'profile_settings_v1';
    var LS_TOKEN = 'broker_token_local_v1';   // локальный, НЕ синхронизируется

    var BROKERS = [
        { id: 'tinkoff', name: 'Т-Инвестиции' },
        { id: 'alfa',    name: 'Альфа-Инвестиции' },
        { id: 'sber',    name: 'СберИнвестиции' },
        { id: 'bcs',     name: 'БКС Мир инвестиций' },
        { id: 'finam',   name: 'Финам' }
    ];
    var START_TABS = [
        { id: 'home',       name: 'Главная' },
        { id: 'portfolios', name: 'Портфели' },
        { id: 'market',     name: 'Рынок' },
        { id: 'calc',       name: 'Расчёт' }
    ];

    // ---------- хранилище ----------
    // Точки подмены на Supabase сработали (2026-07): при живой сессии
    // профиль приходит из window.supa, локальный режим остаётся фолбэком.
    function readJSON(key) {
        try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
    }
    function cloudOn() { return !!(window.supa && window.supa.enabled && window.supa.isAuthed()); }
    // Технический email аккаунтов, заведённых через Telegram (id<telegram_id>@...,
    // см. worker/index.js) — в интерфейсе его не показываем, поле остаётся пустым.
    function isTechEmail(email) {
        return typeof email === 'string' && email.toLowerCase().indexOf('@telegram.mstelegram.local') !== -1;
    }
    function getProfile() {                                              // null = гость
        if (cloudOn()) {
            var pr = window.supa.profile || {};
            return {
                name: pr.name || '',
                email: pr.email || (window.supa.session.user && window.supa.session.user.email) || '',
                telegramLinked: !!pr.telegram_id,
                photo: pr.tg_photo_url || '',
                createdAt: pr.created_at ? Date.parse(pr.created_at) : Date.now(),
                cloud: true
            };
        }
        return readJSON(LS_PROFILE);
    }
    function saveProfile(patch) {
        if (cloudOn()) {
            window.supa.updateProfile(patch).then(function (r) {
                if (!r.ok) { toast(r.error, true); return; }
                if (r.emailPending) toast('Подтвердите новый email — письмо уже в ящике');
                renderIdentity();
            });
            return;
        }
        var cur = getProfile() || {};
        var next = Object.assign({}, cur, patch);
        if (!next.createdAt) next.createdAt = Date.now();
        try { localStorage.setItem(LS_PROFILE, JSON.stringify(next)); } catch (e) {}
    }
    function logout() {
        if (cloudOn()) {
            // supa.signOut дожимает синхронизацию, чистит устройство и перезагружает
            window.supa.signOut();
            return;
        }
        try { localStorage.removeItem(LS_PROFILE); } catch (e) {}
        saveSettings({ firstName: null, lastName: null });
    }
    function getSettings() { return readJSON(LS_SETTINGS) || {}; }
    function saveSettings(patch) {
        var next = Object.assign({}, getSettings(), patch);
        // null = «удалить поле»: не таскаем пустые ключи в JSON и в облако
        Object.keys(next).forEach(function (k) { if (next[k] == null) delete next[k]; });
        try { localStorage.setItem(LS_SETTINGS, JSON.stringify(next)); } catch (e) {}
    }

    // API-токен брокера — боевой ключ к счёту. Хранится ТОЛЬКО на этом
    // устройстве (LS_TOKEN нет в cloud-sync.WATCH), в profile_settings_v1
    // и в облако не попадает — иначе его видел бы админ в user_data.
    function getBrokerToken() {
        try { return localStorage.getItem(LS_TOKEN) || ''; } catch (e) { return ''; }
    }
    function setBrokerToken(token) {
        try {
            if (token) localStorage.setItem(LS_TOKEN, token);
            else localStorage.removeItem(LS_TOKEN);
        } catch (e) {}
    }
    // Раньше токен жил в profile_settings_v1 и синхронизировался — переносим
    // в локальный ключ и вычищаем из настроек (следующий push обновит облако).
    function migrateBrokerToken() {
        var s = getSettings();
        if (s.brokerToken === undefined) return;
        if (s.brokerToken && !getBrokerToken()) setBrokerToken(String(s.brokerToken));
        saveSettings({ brokerToken: null });
    }

    // Имя/фамилия: приоритет — profile_settings, иначе режем name из home_profile_v1
    function nameParts() {
        var s = getSettings(), p = getProfile() || {};
        var first = s.firstName || '', last = s.lastName || '';
        if (!first && !last && p.name) {
            var bits = String(p.name).trim().split(/\s+/);
            first = bits[0] || '';
            last = bits.slice(1).join(' ');
        }
        return { first: first, last: last };
    }
    function fullName() {
        var n = nameParts();
        return (n.first + ' ' + n.last).trim();
    }
    function initials() {
        var n = nameParts();
        var s = (n.first ? n.first[0] : '') + (n.last ? n.last[0] : '');
        return s.toUpperCase();
    }

    function toast(msg, isError) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isError);
    }

    // ---------- иконки ----------
    var IC = {
        user: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        key: '<svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
        sliders: '<svg viewBox="0 0 24 24"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
        chev: '<svg class="ph-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
        eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        out: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
        userPlus: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
        sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
        moon: '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
        card: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>'
    };

    // ---------- сборка DOM ----------
    var hub = null, fab = null, btn = null;

    function buildOptions(list, selected) {
        return list.map(function (o) {
            return '<option value="' + o.id + '"' + (o.id === selected ? ' selected' : '') + '>' + o.name + '</option>';
        }).join('');
    }

    function buildHub() {
        var s = getSettings();
        hub = document.createElement('div');
        hub.id = 'profileHub';
        hub.setAttribute('role', 'dialog');
        hub.setAttribute('aria-label', 'Личный кабинет');
        hub.innerHTML =
            '<div class="ph-head">' +
                '<div class="ph-ava" id="phAva"></div>' +
                '<div class="ph-id"><div class="ph-name" id="phName"></div><div class="ph-mail" id="phMail"></div></div>' +
                '<div class="ph-pill" id="phPill" title="Данные хранятся в этом браузере. Синхронизация и вход с любого устройства появятся после подключения базы данных."><i></i>локально</div>' +
            '</div>' +
            '<div class="ph-list">' +

                // ---- Профиль ----
                '<div class="ph-sec ph-sec--prof" id="phSecProf">' +
                    '<button class="ph-row" type="button" data-sec="prof" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.user + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">Профиль</span><span class="ph-row-s" id="phSubProf"></span></span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad" id="phProfBody"></div></div></div>' +
                '</div>' +

                // ---- API брокера ----
                '<div class="ph-sec ph-sec--api" id="phSecApi">' +
                    '<button class="ph-row" type="button" data-sec="api" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.key + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">API брокера</span><span class="ph-row-s" id="phSubApi"></span></span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad">' +
                        '<div class="ph-field"><label class="ph-lab" for="phBroker">Брокер</label>' +
                            '<select class="ph-select" id="phBroker">' + buildOptions(BROKERS, s.brokerId || 'tinkoff') + '</select></div>' +
                        '<div class="ph-field"><label class="ph-lab" for="phToken">API-токен</label>' +
                            '<div class="ph-tokwrap">' +
                                '<input class="ph-input" id="phToken" type="password" placeholder="t.xxxxxxxx…" autocomplete="off" spellcheck="false">' +
                                '<button class="ph-eye" type="button" id="phEye" aria-label="Показать токен">' + IC.eye + '</button>' +
                            '</div></div>' +
                        '<div class="ph-hint">' + IC.shield + '<span>Токен хранится только в этом браузере и никуда не отправляется. После подключения аккаунтов он позволит автоматически загружать позиции и сделки от брокера.</span></div>' +
                        '<button class="ph-save" type="button" id="phSaveTok">' + IC.check + 'Сохранить токен</button>' +
                    '</div></div></div>' +
                '</div>' +

                // ---- Тарифы ----
                '<div class="ph-sec ph-sec--plan" id="phSecPlan">' +
                    '<button class="ph-row" type="button" data-sec="plan" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.card + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">Тарифы</span><span class="ph-row-s">Базовый — активен</span></span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad">' +
                        '<div class="ph-plan on">' +
                            '<div class="ph-plan-h"><b>Базовый</b><span class="ph-plan-price free">бесплатно</span></div>' +
                            '<div class="ph-plan-s">Расчёт портфеля, ежемесячный доход, портфели, ребаланс и терминал — без ограничений.</div>' +
                            '<span class="ph-plan-badge">' + IC.check + 'Ваш тариф</span>' +
                        '</div>' +
                        '<div class="ph-plan">' +
                            '<div class="ph-plan-h"><b>Про</b><span class="ph-plan-price">скоро</span></div>' +
                            '<div class="ph-plan-s">Синхронизация с брокером по API, автоматический ребаланс и уведомления о купонных выплатах.</div>' +
                            '<div class="ph-hint">' + IC.shield + '<span>Тариф появится после подключения аккаунтов — цена и состав уточняются.</span></div>' +
                        '</div>' +
                    '</div></div></div>' +
                '</div>' +

                // ---- Настройки ----
                '<div class="ph-sec ph-sec--set" id="phSecSet">' +
                    '<button class="ph-row" type="button" data-sec="set" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.sliders + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">Настройки</span><span class="ph-row-s">Запуск, приватность</span></span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad">' +
                        '<div class="ph-field"><label class="ph-lab" for="phStartTab">Раздел при запуске</label>' +
                            '<select class="ph-select" id="phStartTab">' + buildOptions(START_TABS, s.startTab || 'home') + '</select></div>' +
                        '<div class="ph-set">' +
                            '<span class="ph-set-tt"><span class="ph-set-t">Скрывать суммы <span class="ph-soon">скоро</span></span><span class="ph-set-s">Прятать капитал от посторонних глаз</span></span>' +
                            '<button class="ph-sw' + (s.hideSums ? ' on' : '') + '" type="button" id="phSwHide" role="switch" aria-label="Скрывать суммы"></button>' +
                        '</div>' +
                        '<div class="ph-set">' +
                            '<span class="ph-set-tt"><span class="ph-set-t">Синхронизация с брокером <span class="ph-soon">скоро</span></span><span class="ph-set-s">Автозагрузка портфеля по токену</span></span>' +
                            '<button class="ph-sw' + (s.brokerSync ? ' on' : '') + '" type="button" id="phSwSync" role="switch" aria-label="Синхронизация с брокером"></button>' +
                        '</div>' +
                    '</div></div></div>' +
                '</div>' +

            '</div>' +
            '<div class="ph-foot">' +
                '<span class="ph-note" id="phNote">Задел под личный кабинет — данные пока хранятся в этом браузере.</span>' +
                '<span id="phFootBtn"></span>' +
            '</div>';
        document.body.appendChild(hub);

        var tok = hub.querySelector('#phToken');
        var savedTok = getBrokerToken();
        if (tok && savedTok) tok.value = savedTok;
    }

    function buildFab() {
        fab = document.createElement('div');
        fab.id = 'themeFab';
        fab.title = 'Сменить тему';
        fab.setAttribute('role', 'button');
        fab.setAttribute('aria-label', 'Сменить тему');
        document.body.appendChild(fab);
        fab.addEventListener('click', function () {
            if (typeof window.toggleTheme === 'function') window.toggleTheme();
        });
        syncFabIcon();
    }

    function syncFabIcon() {
        if (!fab) return;
        fab.innerHTML = document.body.classList.contains('dark-mode') ? IC.sun : IC.moon;
    }

    // ---------- рендер динамики (шапка панели, сабтайтлы, футер, аватар в шапке сайта) ----------
    function renderIdentity() {
        if (!hub || !btn) return;
        var p = getProfile();
        var name = fullName();
        var ini = initials();

        // аватар из Telegram: фото поверх инициалов (при ошибке загрузки
        // картинка убирает себя — остаются инициалы на градиенте)
        var photoImg = (p && p.photo)
            ? '<img class="ph-photo" src="' + String(p.photo).replace(/"/g, '&quot;') + '" alt="" onerror="this.remove()">'
            : '';

        // кнопка в шапке
        if (p && (ini || photoImg)) {
            btn.classList.remove('guest');
            btn.textContent = ini;
            if (photoImg) btn.innerHTML = ini + photoImg;
        } else {
            btn.classList.add('guest');
            btn.innerHTML = IC.user;
        }
        btn.title = p ? (name || 'Личный кабинет') : 'Личный кабинет';

        // шапка панели
        var ava = hub.querySelector('#phAva');
        if (p && (ini || photoImg)) {
            ava.classList.remove('guest');
            ava.textContent = ini;
            if (photoImg) ava.innerHTML = ini + photoImg;
        } else { ava.classList.add('guest'); ava.innerHTML = IC.user; }
        hub.querySelector('#phName').textContent = p ? (name || 'Инвестор') : 'Гость';
        hub.querySelector('#phMail').textContent = p ? (isTechEmail(p.email) ? '' : (p.email || (p.username ? '@' + p.username : ''))) : 'Аккаунт не создан';
        var isCloud = !!(p && p.cloud);
        hub.dataset.authState = isCloud ? 'cloud-user' : (p ? 'local-user' : 'local-guest');

        // Пилюля состояния + подпись в футере: облако ↔ локально
        var pill = hub.querySelector('#phPill');
        if (pill) {
            pill.innerHTML = '<i></i>' + (isCloud ? 'облако' : 'локально');
            pill.classList.toggle('cloud', isCloud);
            pill.title = isCloud
                ? 'Аккаунт подключён: портфели и настройки синхронизируются, вход доступен с любого устройства.'
                : 'Данные хранятся в этом браузере. Синхронизация и вход с любого устройства появятся после подключения базы данных.';
        }
        var phNote = hub.querySelector('#phNote');
        if (phNote) {
            phNote.textContent = isCloud
                ? 'Данные синхронизируются с облаком — можно входить с любого устройства.'
                : 'Задел под личный кабинет — данные пока хранятся в этом браузере.';
        }

        // сабтайтл «Профиль»
        var subProf = hub.querySelector('#phSubProf');
        subProf.textContent = p ? 'Имя, фамилия, email' : 'Создайте аккаунт на Главной';

        // тело «Профиль»
        var body = hub.querySelector('#phProfBody');
        if (p) {
            var n = nameParts();
            var tgRow = p.cloud
                ? (p.telegramLinked
                    ? '<div class="ph-tg"><span class="ph-tg-ok">' + IC.check + 'Telegram привязан</span>' +
                      '<button class="ph-adm" type="button" id="phTgUnlink">Отвязать</button></div>'
                    : '<div class="ph-tg"><button class="ph-adm" type="button" id="phTgLink">' + IC.userPlus + 'Привязать Telegram</button></div>')
                : '';
            body.innerHTML =
                '<div class="ph-2col">' +
                    '<div class="ph-field"><label class="ph-lab" for="phFirst">Имя</label><input class="ph-input" id="phFirst" type="text" autocomplete="off"></div>' +
                    '<div class="ph-field"><label class="ph-lab" for="phLast">Фамилия</label><input class="ph-input" id="phLast" type="text" autocomplete="off"></div>' +
                '</div>' +
                '<div class="ph-field"><label class="ph-lab" for="phEmail">Email</label><input class="ph-input" id="phEmail" type="email" autocomplete="off"></div>' +
                tgRow +
                '<button class="ph-save" type="button" id="phSaveProf">' + IC.check + 'Сохранить</button>';
            body.querySelector('#phFirst').value = n.first;
            body.querySelector('#phLast').value = n.last;
            body.querySelector('#phEmail').value = isTechEmail(p.email) ? '' : (p.email || '');
            body.querySelector('#phSaveProf').addEventListener('click', onSaveProfile);
            var tgLink = body.querySelector('#phTgLink');
            if (tgLink) tgLink.addEventListener('click', onLinkTelegram);
            var tgUnlink = body.querySelector('#phTgUnlink');
            if (tgUnlink) tgUnlink.addEventListener('click', onUnlinkTelegram);
        } else {
            body.innerHTML =
                '<div class="ph-hint">' + IC.user + '<span>Профиль появится после регистрации. Создайте аккаунт на Главной — имя и email подставятся сюда автоматически.</span></div>' +
                '<button class="ph-save" type="button" id="phGoReg">' + IC.userPlus + 'Создать аккаунт</button>';
            body.querySelector('#phGoReg').addEventListener('click', goRegister);
        }

        // футер
        var foot = hub.querySelector('#phFootBtn');
        if (p) {
            var adminBtn = (window.supa && window.supa.isAdmin())
                ? '<button class="ph-adm" type="button" id="phAdmin" title="Открыть админку">' + IC.shield + '<span>Админка</span></button>'
                : '';
            foot.innerHTML = adminBtn + '<button class="ph-out" type="button" id="phLogout">' + IC.out + '<span>Выйти</span></button>';
            var adm = foot.querySelector('#phAdmin');
            if (adm) adm.addEventListener('click', function () {
                closeHub();
                if (typeof window.switchTab === 'function') window.switchTab('admin');
            });
            foot.querySelector('#phLogout').addEventListener('click', onLogout);
        } else {
            foot.innerHTML = '<button class="ph-in" type="button" id="phLogin">' + IC.userPlus + '<span>Войти</span></button>';
            foot.querySelector('#phLogin').addEventListener('click', goRegister);
        }

        renderApiSub();
    }

    function renderApiSub() {
        var s = getSettings();
        var sub = hub.querySelector('#phSubApi');
        if (getBrokerToken()) {
            var b = BROKERS.filter(function (x) { return x.id === s.brokerId; })[0];
            sub.textContent = (b ? b.name : 'Брокер') + ' · токен сохранён';
            sub.classList.add('ok');
        } else {
            sub.textContent = 'Токен не задан';
            sub.classList.remove('ok');
        }
    }

    // ---------- обработчики ----------
    function onSaveProfile() {
        var first = (hub.querySelector('#phFirst').value || '').trim();
        var last = (hub.querySelector('#phLast').value || '').trim();
        var email = (hub.querySelector('#phEmail').value || '').trim();
        if (!first) { toast('Введите имя', true); return; }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Некорректный email', true); return; }
        saveSettings({ firstName: first, lastName: last });
        saveProfile({ name: (first + ' ' + last).trim(), email: email });
        renderIdentity();
        toast('Профиль сохранён');
    }

    function onLinkTelegram() {
        if (!window.supa) return;
        toast('Открываем Telegram…');
        window.supa.linkTelegram().then(function (r) {
            if (!r.ok) { toast(r.error, true); return; }
            toast('Telegram привязан — теперь вход через него ведёт в этот аккаунт');
            renderIdentity();
        });
    }

    function onUnlinkTelegram() {
        if (!window.supa) return;
        window.supa.unlinkTelegram().then(function (r) {
            if (!r.ok) { toast(r.error, true); return; }
            toast('Telegram отвязан');
            renderIdentity();
        });
    }

    function onSaveToken() {
        var brokerId = hub.querySelector('#phBroker').value;
        var token = (hub.querySelector('#phToken').value || '').trim();
        saveSettings({ brokerId: brokerId });
        setBrokerToken(token);
        renderApiSub();
        toast(token ? 'Токен сохранён в этом браузере' : 'Токен удалён');
    }

    function onLogout(e) {
        var b = e.currentTarget;
        if (!b.classList.contains('arm')) {
            b.classList.add('arm');
            b.querySelector('span').textContent = 'Точно выйти?';
            setTimeout(function () {
                b.classList.remove('arm');
                var sp = b.querySelector('span');
                if (sp) sp.textContent = 'Выйти';
            }, 2600);
            return;
        }
        logout();
        renderIdentity();
        closeHub();
        if (typeof window.switchTab === 'function') window.switchTab('home');
        toast('Вы вышли из аккаунта');
    }

    function goRegister() {
        closeHub();
        if (typeof window.switchTab === 'function') window.switchTab('home');
        if (typeof window.homeAuthMode === 'function') window.homeAuthMode('register');
    }

    // ---------- открытие/закрытие ----------
    var openT = null, closeT = null;

    function openHub() {
        clearTimeout(closeT);
        if (!hub || hub.classList.contains('open')) return;
        renderIdentity();
        hub.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
    }
    function closeHub() {
        clearTimeout(openT);
        if (!hub || !hub.classList.contains('open')) return;
        hub.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
    }

    function wire() {
        var canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
        if (canHover) {
            btn.addEventListener('mouseenter', function () {
                clearTimeout(closeT);
                openT = setTimeout(openHub, 110);
            });
            btn.addEventListener('mouseleave', function () {
                clearTimeout(openT);
                closeT = setTimeout(closeHub, 280);
            });
            hub.addEventListener('mouseenter', function () { clearTimeout(closeT); });
            hub.addEventListener('mouseleave', function () { closeT = setTimeout(closeHub, 280); });
        }
        btn.addEventListener('click', function () {
            clearTimeout(openT); clearTimeout(closeT);
            if (hub.classList.contains('open')) closeHub(); else openHub();
        });
        document.addEventListener('pointerdown', function (e) {
            if (!hub.classList.contains('open')) return;
            if (hub.contains(e.target) || btn.contains(e.target)) return;
            closeHub();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeHub();
        });

        // аккордеоны (открыт максимум один)
        hub.querySelectorAll('.ph-row').forEach(function (row) {
            row.addEventListener('click', function () {
                var sec = row.closest('.ph-sec');
                var on = sec.classList.contains('on');
                hub.querySelectorAll('.ph-sec.on').forEach(function (x) {
                    x.classList.remove('on');
                    x.querySelector('.ph-row').setAttribute('aria-expanded', 'false');
                });
                if (!on) {
                    sec.classList.add('on');
                    row.setAttribute('aria-expanded', 'true');
                }
            });
        });

        // токен: глаз + сохранить; селекты/переключатели настроек
        hub.querySelector('#phEye').addEventListener('click', function () {
            var inp = hub.querySelector('#phToken');
            inp.type = inp.type === 'password' ? 'text' : 'password';
        });
        hub.querySelector('#phSaveTok').addEventListener('click', onSaveToken);
        hub.querySelector('#phStartTab').addEventListener('change', function () {
            saveSettings({ startTab: this.value });
            toast('Стартовый раздел: ' + this.options[this.selectedIndex].text);
        });
        hub.querySelector('#phSwHide').addEventListener('click', function () {
            this.classList.toggle('on');
            saveSettings({ hideSums: this.classList.contains('on') });
        });
        hub.querySelector('#phSwSync').addEventListener('click', function () {
            this.classList.toggle('on');
            saveSettings({ brokerSync: this.classList.contains('on') });
        });
    }

    // ---------- интеграция с остальным приложением ----------
    // Закрываем панель при смене вкладки; route-hash.js оборачивает нас позже — порядок сохранён.
    var _prevSwitchTab = window.switchTab;
    if (typeof _prevSwitchTab === 'function') {
        window.switchTab = function (tabId) {
            _prevSwitchTab(tabId);
            closeHub();
        };
    }

    // Значок на плавающей кнопке — в той же цепочке, что и кнопки шапки.
    var _prevToggleTheme = window.toggleTheme;
    if (typeof _prevToggleTheme === 'function') {
        window.toggleTheme = function () {
            _prevToggleTheme();
            syncFabIcon();
        };
    }

    // После регистрации/входа на Главной — обновляем аватар и панель.
    var _prevRegSubmit = window.homeRegisterSubmit;
    if (typeof _prevRegSubmit === 'function') {
        window.homeRegisterSubmit = function (ev) {
            var r = _prevRegSubmit(ev);
            setTimeout(renderIdentity, 60);
            return r;
        };
    }
    var _prevTgLogin = window.homeTelegramLogin;
    if (typeof _prevTgLogin === 'function') {
        window.homeTelegramLogin = function () {
            _prevTgLogin();
            setTimeout(renderIdentity, 60);
        };
    }

    window.profileMenuRefresh = renderIdentity;

    // ---------- init ----------
    function init() {
        btn = document.getElementById('topProfileBtn');
        if (!btn) return;
        migrateBrokerToken();
        buildHub();
        buildFab();
        renderIdentity();
        wire();

        // «Раздел при запуске»: применяем только на «чистом» заходе (путь /),
        // прямые ссылки вида /market восстанавливает route-hash.js.
        var startTab = getSettings().startTab;
        if (startTab && startTab !== 'home' && location.pathname.replace(/\/$/, '') === '') {
            setTimeout(function () {
                if (typeof window.switchTab === 'function' && typeof currentTab !== 'undefined' && currentTab === 'home') {
                    window.switchTab(startTab);
                }
            }, 40);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Тема могла восстановиться из localStorage после нас (initTheme/app-state) — досинхронизируем значок.
    document.addEventListener('DOMContentLoaded', function () { setTimeout(syncFabIcon, 50); });
})();
