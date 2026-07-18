// =============================================
// ЛИЧНЫЙ КАБИНЕТ
// =============================================
// Круглая кнопка-аватар (#topProfileBtn, шапка, все вкладки кроме
// Главной) раскрывает по клику/Enter панель #profileHub:
//   • Профиль — имя/фамилия/email (+ привязка Telegram у облачных),
//   • API брокера — токен для будущей автозагрузки портфеля,
//   • Тарифы — маркетинговый задел,
//   • Настройки — стартовый раздел, «Скрывать суммы» (см. js/sums-privacy.js),
//   • Безопасность — смена пароля и выход на всех устройствах,
//     ТОЛЬКО для облачного аккаунта (CSS-гейт по data-auth-state),
//   • Данные — экспорт JSON, очистка устройства, удаление аккаунта
//     (cloud → RPC delete_own_account, local → wipe),
//   • Выйти / Создать аккаунт.
// Кнопка темы на этих вкладках уезжает в правый нижний угол (#themeFab).
//
// Хранилище: home_profile_v1 (создаёт форма на Главной) +
// profile_settings_v1 (этот модуль). При живой сессии Supabase профиль
// и операции идут через window.supa; локальный режим — фолбэк. Точки
// подмены: getProfile()/saveProfile()/logout() — весь код ходит через них.

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
        { id: 'calc',       name: 'Расчёт' },
        { id: 'portfolios', name: 'Портфели' },
        { id: 'rebalance',  name: 'Ребаланс' },
        { id: 'market',     name: 'Рынок' },
        { id: 'backtest',   name: 'Тест портфеля' }
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
        // чужой компьютер: предлагаем забрать с устройства и токен брокера.
        // Нативный confirm — сознательно: сразу после него страница перезагрузится
        // (signOut), собственной модалке дожить не дадут.
        if (window.brokerApi && window.brokerApi.hasConn()) {
            var wipe = window.confirm('Стереть с этого устройства и подключение брокера вместе с токеном?\n«OK» — стереть (чужой компьютер), «Отмена» — оставить для следующего входа.');
            if (wipe) window.brokerApi.disconnect('выход из аккаунта', true);
            else window.brokerApi.lock();
        }
        if (cloudOn()) {
            // Занавес поднимаем ЗДЕСЬ, до signOut: выход дёргает notify('signout'),
            // и приложение на пару кадров перерисовывается «гостем» (аватар гаснет,
            // вкладки закрываются заглушками) — этот промежуточный кадр и читался
            // как рывок. Цвет сразу по Главной: onSignOut уводит именно туда, а она
            // тёмная — иначе занавес пришлось бы перекрашивать на полпути.
            if (window.pageTransition) {
                window.pageTransition.cover({ tab: 'home', label: 'Выходим из аккаунта…' });
            }
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
        card: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>',
        // для KPI-плиток и карточки регистрации
        bag: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
        crown: '<svg viewBox="0 0 24 24"><path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z"/><line x1="5" y1="20" x2="19" y2="20"/></svg>',
        spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/><line x1="19" y1="15" x2="19" y2="19"/><line x1="17" y1="17" x2="21" y2="17"/></svg>',
        back: '<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
        lock: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        monitor: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        db: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
        trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
    };

    // ---------- сборка DOM ----------
    var hub = null, fab = null, btn = null, backFab = null;
    // история разделов для тихой кнопки «назад» (рядом с темой): стек предыдущих вкладок,
    // navBack — флаг, что переключение вызвано самой кнопкой (тогда в стек не пишем)
    var navHist = [], navBack = false;

    function buildOptions(list, selected) {
        return list.map(function (o) {
            // «Раздел при запуске»: вкладку могли переименовать в админке
            // (js/tab-gates.js). Для брокеров titleOf вернёт пусто — имя своё.
            var nm = (window.tabGates && window.tabGates.titleOf && window.tabGates.titleOf(o.id)) || o.name;
            return '<option value="' + o.id + '"' + (o.id === selected ? ' selected' : '') + '>' + escHtml(nm) + '</option>';
        }).join('');
    }
    // имя раздела теперь может прийти из конфига — экранируем
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function buildHub() {
        var s = getSettings();
        hub = document.createElement('div');
        hub.id = 'profileHub';
        hub.setAttribute('role', 'dialog');
        hub.setAttribute('aria-label', 'Личный кабинет');
        hub.innerHTML =
            // Шапка светлая, на языке .hg-auth: панель всплывает НАД любой вкладкой, и
            // прежний тёмный герой (градиент + glow-слой .ph-fx) сливался с тёмными
            // героями Портфелей/Ребаланса.
            // Шапка = только личность (кто я + где лежат данные). Смысл пилюли продублирован
            // строкой #phHdNote: раньше он жил в title, то есть был виден лишь при наведении
            // мышью — с тача не прочитать вовсе.
            '<div class="ph-head">' +
                '<div class="ph-head-top">' +
                    '<div class="ph-ava" id="phAva"></div>' +
                    '<div class="ph-id"><div class="ph-name" id="phName"></div><div class="ph-mail" id="phMail"></div></div>' +
                    '<div class="ph-pill" id="phPill" title="Данные хранятся в этом браузере. Синхронизация и вход с любого устройства появятся после подключения базы данных."><i></i>локально</div>' +
                '</div>' +
                '<div class="ph-hd-note" id="phHdNote"></div>' +
            '</div>' +
            // KPI плитками, а не строкой: счётчик «3» — самое короткое значение панели, и
            // в голой полоске он висел без опоры. Плитка даёт числу дом, а иконка — беглый
            // якорь. Заливки плоские: градиенты в проекте уже вычищены (Портфели R7).
            '<div class="ph-tiles" id="phStrip"></div>' +
            // Карточка регистрации — всем, КРОМЕ облачного аккаунта (ему предлагать нечего).
            // Кликается целиком: вторая крупная синяя кнопка спорила бы с «Войти» внизу.
            '<div class="ph-cta" id="phCta" role="button" tabindex="0">' +
                '<span class="ph-cta-ic">' + IC.spark + '</span>' +
                '<span class="ph-cta-tt">' +
                    '<span class="ph-cta-t">Создайте аккаунт</span>' +
                    '<span class="ph-cta-s">Синхронизация и вход с любого устройства</span>' +
                '</span>' +
            '</div>' +
            // Разделы сгруппированы по смыслу: шесть равнозначных строк подряд не давали
            // понять, где искать пароль, а где выгрузку данных. Групп ровно три, и в каждой
            // по два раздела — заголовок над ОДНОЙ строкой ничего не группирует, только
            // добавляет шума (так было с «Подпиской» и «Подключениями»).
            //   Аккаунт             — кто я и по какому тарифу
            //   Приложение          — как оно себя ведёт и что к нему подключено
            //   Безопасность и данные — пароль, устройства, экспорт, удаление
            '<div class="ph-list">' +

                '<div class="ph-grp">Аккаунт</div>' +

                // ---- Профиль ----
                '<div class="ph-sec ph-sec--prof" id="phSecProf">' +
                    '<button class="ph-row" type="button" data-sec="prof" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.user + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">Профиль</span><span class="ph-row-s" id="phSubProf"></span></span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad" id="phProfBody"></div></div></div>' +
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
                            '<div class="ph-plan-h"><b>Pro</b><span class="ph-plan-price">скоро</span></div>' +
                            '<div class="ph-plan-s">Синхронизация с брокером по API, автоматический ребаланс и уведомления о купонных выплатах.</div>' +
                            '<div class="ph-hint">' + IC.shield + '<span>Тариф появится после подключения аккаунтов — цена и состав уточняются.</span></div>' +
                        '</div>' +
                    '</div></div></div>' +
                '</div>' +

                '<div class="ph-grp">Приложение</div>' +

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
                            '<span class="ph-set-tt"><span class="ph-set-t">Скрывать суммы</span><span class="ph-set-s">Размывать рубли от посторонних глаз — наведите, чтобы взглянуть</span></span>' +
                            '<button class="ph-sw' + (s.hideSums ? ' on' : '') + '" type="button" id="phSwHide" role="switch" aria-checked="' + (s.hideSums ? 'true' : 'false') + '" aria-label="Скрывать суммы"></button>' +
                        '</div>' +
                        '<div class="ph-set">' +
                            '<span class="ph-set-tt"><span class="ph-set-t">Синхронизация с брокером <span class="ph-soon">скоро</span></span><span class="ph-set-s">Автозагрузка портфеля по токену</span></span>' +
                            '<button class="ph-sw' + (s.brokerSync ? ' on' : '') + '" type="button" id="phSwSync" role="switch" aria-label="Синхронизация с брокером"></button>' +
                        '</div>' +
                    '</div></div></div>' +
                '</div>' +

                // ---- API брокера (без аккаунта заперт: см. renderIdentity) ----
                '<div class="ph-sec ph-sec--api" id="phSecApi">' +
                    '<button class="ph-row" type="button" data-sec="api" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.key + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">API брокера</span><span class="ph-row-s" id="phSubApi"></span></span>' +
                        '<span class="ph-lockic">' + IC.lock + '</span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad">' +
                        '<div class="ph-field"><label class="ph-lab" for="phBroker">Брокер</label>' +
                            '<select class="ph-select" id="phBroker">' + buildOptions(BROKERS, s.brokerId || 'tinkoff') + '</select></div>' +
                        // статус подключения рисует renderBkState() (строки .bk-kv из broker.css)
                        '<div class="ph-bkstate" id="phBkState"></div>' +
                        '<div class="ph-hint">' + IC.shield + '<span>Подключение через официальное API брокера: выбираете уровень доступа, мы сверяем его с токеном. Токен хранится только на этом устройстве (можно под PIN-кодом), в облако не попадает. Пароль от банка мы не спрашиваем никогда.</span></div>' +
                        '<button class="ph-save" type="button" id="phConnectBroker">' + IC.key + '<span id="phConnectLbl">Подключить брокера</span></button>' +
                    '</div></div></div>' +
                '</div>' +

                '<div class="ph-grp">Безопасность и данные</div>' +

                // ---- Безопасность (только для облачного аккаунта) ----
                '<div class="ph-sec ph-sec--sec" id="phSecSec">' +
                    '<button class="ph-row" type="button" data-sec="sec" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.lock + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">Безопасность</span><span class="ph-row-s">Пароль, устройства</span></span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad">' +
                        '<div class="ph-field"><label class="ph-lab" for="phPass1">Новый пароль</label>' +
                            '<input class="ph-input" id="phPass1" type="password" placeholder="минимум 6 символов" autocomplete="new-password" spellcheck="false"></div>' +
                        '<div class="ph-field"><label class="ph-lab" for="phPass2">Повторите пароль</label>' +
                            '<input class="ph-input" id="phPass2" type="password" placeholder="ещё раз" autocomplete="new-password" spellcheck="false"></div>' +
                        '<button class="ph-save" type="button" id="phSavePass">' + IC.check + 'Обновить пароль</button>' +
                        '<div class="ph-hint">' + IC.monitor + '<span>Выход на всех устройствах завершит сессии везде, кроме этого браузера, — на случай, если вы забыли выйти на чужом компьютере.</span></div>' +
                        '<button class="ph-adm ph-adm--wide" type="button" id="phSignoutAll">' + IC.monitor + '<span>Выйти на всех устройствах</span></button>' +
                    '</div></div></div>' +
                '</div>' +

                // ---- Данные ----
                '<div class="ph-sec ph-sec--data" id="phSecData">' +
                    '<button class="ph-row" type="button" data-sec="data" aria-expanded="false">' +
                        '<span class="ph-row-ic">' + IC.db + '</span>' +
                        '<span class="ph-row-tt"><span class="ph-row-t">Данные</span><span class="ph-row-s">Экспорт, очистка, удаление</span></span>' +
                        IC.chev +
                    '</button>' +
                    '<div class="ph-body"><div class="ph-body-in"><div class="ph-body-pad">' +
                        '<button class="ph-adm ph-adm--wide" type="button" id="phExport">' + IC.download + '<span>Скачать мои данные (JSON)</span></button>' +
                        '<button class="ph-adm ph-adm--wide" type="button" id="phClearDev">' + IC.trash + '<span>Очистить данные на этом устройстве</span></button>' +
                        '<div class="ph-danger">' +
                            '<div class="ph-danger-h">Опасная зона</div>' +
                            '<div class="ph-danger-s" id="phDangerNote">Удаление сотрёт аккаунт и все данные без возможности восстановления.</div>' +
                            '<button class="ph-del" type="button" id="phDeleteAcc">' + IC.trash + '<span>Удалить аккаунт</span></button>' +
                        '</div>' +
                    '</div></div></div>' +
                '</div>' +

            '</div>' +
            '<div class="ph-foot">' +
                '<span class="ph-note" id="phNote">Задел под личный кабинет — данные пока хранятся в этом браузере.</span>' +
                '<span id="phFootBtn"></span>' +
            '</div>';
        document.body.appendChild(hub);
        renderBkState();
    }

    function buildFab() {
        fab = document.createElement('div');
        fab.id = 'themeFab';
        fab.title = 'Сменить тему';
        fab.setAttribute('role', 'button');
        fab.setAttribute('aria-label', 'Сменить тему');
        document.body.appendChild(fab);
        fab.addEventListener('click', function () {
            // Фаб живёт только вне Главной — переключаем тему проекта без вопроса.
            if (typeof window.requestThemeToggle === 'function') window.requestThemeToggle();
            else if (typeof window.toggleTheme === 'function') window.toggleTheme();
        });
        syncFabIcon();

        // Кнопка «назад» слева от темы: возвращает на раздел, с которого пришли.
        // Видна только когда есть куда возвращаться; подпись рядом с иконкой — чтобы
        // назначение читалось сразу, без наведения (раньше была просто полупрозрачная
        // стрелка и терялась рядом с яркой кнопкой темы).
        backFab = document.createElement('div');
        backFab.id = 'navBackFab';
        backFab.setAttribute('role', 'button');
        backFab.setAttribute('aria-label', 'Назад — к предыдущему разделу');
        backFab.title = 'Назад';
        backFab.innerHTML = IC.back + '<span>Назад</span>';
        document.body.appendChild(backFab);
        backFab.addEventListener('click', navGoBack);
        installNavTracking();
        syncBackFab();
    }

    function syncFabIcon() {
        if (!fab) return;
        fab.innerHTML = document.body.classList.contains('dark-mode') ? IC.sun : IC.moon;
    }

    // ---------- «назад» к предыдущему разделу ----------
    // Оборачиваем switchTab (route-hash.js уже обернул его до нас — мы становимся самым
    // внешним слоем и видим ВСЕ переключения). Пишем в стек прежнюю вкладку currentTab.
    function installNavTracking() {
        if (typeof window.switchTab !== 'function' || window.__pmNavTracked) return;
        window.__pmNavTracked = true;
        var _prev = window.switchTab;
        window.switchTab = function (tabId) {
            var from = (typeof currentTab !== 'undefined') ? currentTab : null;
            var r = _prev.apply(this, arguments);
            var to = (typeof currentTab !== 'undefined') ? currentTab : tabId;
            if (!navBack && from && to && from !== to) {
                navHist.push(from);
                if (navHist.length > 40) navHist.shift();
            }
            syncBackFab();
            return r;
        };
    }
    function navGoBack() {
        if (!navHist.length) return;
        var dest = navHist.pop();
        navBack = true;                       // это переключение в стек не пишем
        try { if (typeof window.switchTab === 'function') window.switchTab(dest); }
        finally { navBack = false; }
        syncBackFab();
    }
    function syncBackFab() {
        if (backFab) backFab.classList.toggle('on', navHist.length > 0);
    }

    // ---------- KPI-полоска шапки ----------
    // Две ячейки: сколько портфелей и какой тариф. Капитал отсюда убран намеренно —
    // живых котировок у кабинета нет (они в замыкании portfolios.js), и сумму
    // приходилось брать из вчерашнего снимка pf_snapshots_v1: цифра честная, но
    // запаздывающая, а рядом с ней «капитал» читался как «прямо сейчас». Актуальную
    // сумму показывают сами «Портфели», кабинету дублировать её незачем.
    function phPlural(n, one, few, many) {
        var a = Math.abs(n) % 100, b = a % 10;
        if (a > 10 && a < 20) return many;
        if (b > 1 && b < 5) return few;
        if (b === 1) return one;
        return many;
    }
    function phStats() {
        var items = [];
        try {
            var st = JSON.parse(localStorage.getItem('portfolios_v1')) || {};
            items = (Array.isArray(st.items) ? st.items : []).filter(function (p) { return !p.hidden; });
        } catch (e) { return null; }
        if (!items.length) return null;
        return { n: items.length };
    }
    function renderStrip() {
        var el = hub && hub.querySelector('#phStrip');
        if (!el) return;
        var st = phStats();
        // без портфелей плитки не нужны — «0» и «Базовый» ничего не сообщают
        if (!st) { el.innerHTML = ''; el.hidden = true; return; }
        el.hidden = false;
        el.innerHTML =
            '<div class="ph-tile"><span class="ph-tile-ic">' + IC.bag + '</span>' +
                '<span class="ph-tile-tt"><b>' + st.n + '</b>' +
                '<span>' + phPlural(st.n, 'портфель', 'портфеля', 'портфелей') + '</span></span></div>' +
            '<div class="ph-tile ph-tile--plan"><span class="ph-tile-ic">' + IC.crown + '</span>' +
                '<span class="ph-tile-tt"><b class="txt">Базовый</b><span>тариф</span></span></div>';
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

        // «Данные»: текст опасной зоны и её видимость (гостю удалять нечего)
        var dn = hub.querySelector('#phDangerNote');
        if (dn) dn.textContent = isCloud
            ? 'Удаление сотрёт аккаунт в облаке и все данные без возможности восстановления.'
            : 'Удаление сотрёт локальный профиль и все данные в этом браузере.';
        var dz = hub.querySelector('.ph-danger');
        if (dz) dz.style.display = p ? '' : 'none';

        // «API брокера» без облачного аккаунта — под замком: токен ждёт привязки счёта,
        // а привязывать его не к чему. Раздел ВИДЕН (понятно, что возможность есть), но
        // не раскрывается. «Данные» рядом НЕ запираем: экспорт JSON у гостя работает и
        // ему же нужнее всех — без облака это единственный способ не потерять портфели.
        var apiSec = hub.querySelector('#phSecApi');
        if (apiSec) {
            var lock = !isCloud;
            apiSec.classList.toggle('locked', lock);
            var apiRow = apiSec.querySelector('.ph-row');
            apiRow.setAttribute('aria-disabled', lock ? 'true' : 'false');
            if (lock) {
                apiSec.classList.remove('on');           // заперли, пока был раскрыт
                apiRow.setAttribute('aria-expanded', 'false');
            }
        }

        // Пилюля состояния + подпись в футере: облако ↔ локально
        var pill = hub.querySelector('#phPill');
        if (pill) {
            pill.innerHTML = '<i></i>' + (isCloud ? 'облако' : 'локально');
            pill.classList.toggle('cloud', isCloud);
            pill.title = isCloud
                ? 'Аккаунт подключён: портфели и настройки синхронизируются, вход доступен с любого устройства.'
                : 'Данные хранятся в этом браузере. Синхронизация и вход с любого устройства появятся после подключения базы данных.';
        }
        // то же, что в title пилюли, но ВИДИМОЙ строкой: с тача title недоступен
        var hdNote = hub.querySelector('#phHdNote');
        if (hdNote) {
            hdNote.textContent = isCloud
                ? 'Портфели и настройки синхронизируются с облаком'
                : 'Данные хранятся только на этом устройстве';
        }
        var phNote = hub.querySelector('#phNote');
        if (phNote) {
            phNote.textContent = isCloud
                ? 'Данные синхронизируются с облаком — можно входить с любого устройства.'
                : 'Задел под личный кабинет — данные пока хранятся в этом браузере.';
        }
        renderStrip();

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
        renderBkState();
        applyAuditBadge();   // innerHTML выше стирает «!» на аватаре — возвращаем
    }

    function renderApiSub() {
        var sub = hub.querySelector('#phSubApi');
        // под замком «Не подключён» звучало бы упрёком — говорим, чего не хватает
        if (hub.dataset.authState !== 'cloud-user') {
            sub.textContent = 'Доступно с аккаунтом';
            sub.classList.remove('ok');
            return;
        }
        var conn = window.brokerApi && window.brokerApi.getConn();
        if (conn) {
            var st = conn.state === 'revoked' ? 'токен отозван'
                : (conn.scope === 'trade' ? 'торговля' : 'чтение');
            sub.textContent = 'Т-Инвестиции · ' + st + (conn.sandbox ? ' · песочница' : '');
            sub.classList.toggle('ok', conn.state !== 'revoked');
        } else if (getBrokerToken()) {
            // токен, сохранённый по-старому (до визарда) — не потерян, ждёт проверки
            sub.textContent = 'Токен сохранён — завершите подключение';
            sub.classList.remove('ok');
        } else {
            sub.textContent = 'Не подключён';
            sub.classList.remove('ok');
        }
    }

    // Статус подключения в теле секции: строки .bk-kv переиспользуем из
    // broker.css (визард и кабинет говорят на одном визуальном языке)
    function renderBkState() {
        var box = hub && hub.querySelector('#phBkState');
        if (!box) return;
        var lbl = hub.querySelector('#phConnectLbl');
        var conn = window.brokerApi && window.brokerApi.getConn();
        if (!conn) {
            box.innerHTML = getBrokerToken()
                ? '<div class="ph-hint">' + IC.key + '<span>Нашли токен, сохранённый по-старому. Пройдите подключение — проверим его у брокера и переведём на новое хранение.</span></div>'
                : '';
            if (lbl) lbl.textContent = 'Подключить брокера';
            return;
        }
        var A = window.brokerApi;
        var stPill = conn.state === 'revoked'
            ? '<i class="bk-pill">токен отозван</i>'
            : (conn.state === 'downgraded'
                ? '<i class="bk-pill bk-pill-amber">права урезаны</i>'
                : '<i class="bk-pill bk-pill-green">работает</i>');
        box.innerHTML =
            '<div class="bk-kv"><span>Счёт</span><b>' + escHtml(conn.accountName) + '</b></div>' +
            '<div class="bk-kv"><span>Режим</span><b>' + (conn.scope === 'trade' ? 'Торговля' : 'Только чтение') +
                (conn.sandbox ? ' <i class="bk-pill bk-pill-amber">песочница</i>' : '') + '</b></div>' +
            '<div class="bk-kv"><span>Токен</span><b class="bk-mono">' + escHtml(A.maskTail(conn.tokenTail)) + ' ' + stPill + '</b></div>';
        if (lbl) lbl.textContent = 'Управлять подключением';
    }
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

    function onConnectBroker() {
        var brokerId = hub.querySelector('#phBroker').value;
        saveSettings({ brokerId: brokerId });
        if (brokerId !== 'tinkoff') {
            toast('Пока подключаются только Т-Инвестиции — остальные брокеры на подходе', true);
            return;
        }
        if (window.brokerConnect) {
            closeHub();
            window.brokerConnect.open();
        }
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

    // ---------- безопасность (только облако) ----------
    // Кнопка «Обновить пароль» сама отчитывается о результате: поля очищаются, и по ним
    // уже не видно, прошло ли обновление, — тост к этому моменту мог и уйти. Состояния:
    // «Обновляем…» (заблокирована) → «Пароль обновлён» с галочкой (.done) → через 2.6с
    // обратно. Тот же приём отложенного возврата, что у .arm в onLogout.
    var passTimer = null;
    function setPassBtn(state) {
        var b = hub.querySelector('#phSavePass');
        if (!b) return;
        b.classList.toggle('done', state === 'done');
        b.disabled = state === 'busy';
        b.innerHTML = IC.check + (state === 'busy' ? 'Обновляем…' : state === 'done' ? 'Пароль обновлён' : 'Обновить пароль');
    }
    function onSavePassword() {
        if (!window.supa) return;
        var p1 = hub.querySelector('#phPass1').value || '';
        var p2 = hub.querySelector('#phPass2').value || '';
        if (p1.length < 6) { toast('Пароль — минимум 6 символов', true); return; }
        if (p1 !== p2) { toast('Пароли не совпадают', true); return; }
        clearTimeout(passTimer);
        setPassBtn('busy');
        window.supa.updatePassword(p1).then(function (r) {
            if (!r.ok) { setPassBtn('idle'); toast(r.error, true); return; }
            hub.querySelector('#phPass1').value = '';
            hub.querySelector('#phPass2').value = '';
            setPassBtn('done');
            toast('Пароль обновлён');
            passTimer = setTimeout(function () { setPassBtn('idle'); }, 2600);
        });
    }
    function onSignoutAll(e) {
        if (!armToggle(e.currentTarget, 'Выйти везде?')) return;
        if (!window.supa) return;
        toast('Завершаем сессии на других устройствах…');
        window.supa.signOutOthers().then(function (r) {
            toast(r.ok ? 'Сессии на других устройствах завершены' : r.error, !r.ok);
        });
    }

    // ---------- данные ----------
    // Все пользовательские ключи приложения: берём список синхронизации
    // из cloud-sync (единый источник правды), плюс локальные вне WATCH.
    function appDataKeys() {
        var base = (window.supaSync && window.supaSync.WATCH) ? window.supaSync.WATCH.slice() : [
            'portfolios_v1', 'profile_settings_v1', 'stk_fav_v1', 'bnd_fav_v1',
            'dash_portfolio_v1', 'pf_cardview_v1', 'pf_trades_hidden_v1', 'pf_rebal_params',
            'sl_checked_v1', 'invest_settings', 'portfolio_snapshot', 'msolominа_state'
        ];
        return base;
    }
    function wipeLocalData() {
        var keys = appDataKeys().concat([
            'home_profile_v1', LS_TOKEN, 'supa_sync_meta_v1', 'supa_seen_ping_v1',
            // подключение брокера: метаданные, журнал, кэш инструментов (см. broker-api.js)
            'broker_conn_local_v1', 'broker_journal_local_v1', 'broker_instr_cache_v1'
        ]);
        keys.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        try { sessionStorage.removeItem('broker_token_session_v1'); } catch (e) {}
    }
    function onExportData() {
        try {
            // токен брокера НЕ выгружаем — это боевой ключ к счёту, не место ему в файле
            var keys = appDataKeys().concat(['home_profile_v1']);
            var dump = { app: "Madame Solomi'na", exportedAt: new Date().toISOString(), data: {} };
            keys.forEach(function (k) {
                var v = localStorage.getItem(k);
                if (v == null) return;
                try { dump.data[k] = JSON.parse(v); } catch (e) { dump.data[k] = v; }
            });
            var blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'madame-solomina-data-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
            toast('Данные сохранены в файл');
        } catch (e) { toast('Не удалось сохранить файл', true); }
    }
    function onClearDevice(e) {
        if (!armToggle(e.currentTarget, 'Точно очистить?')) return;
        wipeLocalData();
        toast('Данные на устройстве очищены');
        // Пауза — чтобы тост успели прочитать, дальше занавес вместо вспышки
        setTimeout(function () {
            if (window.pageTransition) { window.pageTransition.reload({ label: 'Очищаем устройство…' }); return; }
            location.reload();
        }, 450);
    }
    function onDeleteAccount(e) {
        if (!armToggle(e.currentTarget, 'Точно удалить аккаунт?')) return;
        var p = getProfile();
        if (p && p.cloud && window.supa) {
            toast('Удаляем аккаунт…');
            window.supa.deleteAccount().then(function (r) {
                if (!r.ok) { toast(r.error, true); return; }
                wipeLocalData();
                toast('Аккаунт удалён');
                setTimeout(function () {
                    if (window.pageTransition) { window.pageTransition.go('/', { tab: 'home' }); return; }
                    location.href = '/';
                }, 600);
            });
        } else {
            // локальный профиль — стираем всё и уходим в гости
            wipeLocalData();
            renderIdentity();
            closeHub();
            if (typeof window.switchTab === 'function') window.switchTab('home');
            toast('Профиль и данные удалены');
        }
    }

    // arm-подтверждение для одиночной кнопки: первый клик «взводит» (меняет
    // подпись), второй в течение 2.8с — выполняет. Возвращает true, когда пора.
    function armToggle(btn, confirmText) {
        if (btn.classList.contains('arm')) { clearTimeout(btn._armT); return true; }
        btn.classList.add('arm');
        var sp = btn.querySelector('span');
        btn._label = sp ? sp.textContent : btn.textContent;
        if (sp) sp.textContent = confirmText; else btn.textContent = confirmText;
        btn._armT = setTimeout(function () {
            btn.classList.remove('arm');
            var s2 = btn.querySelector('span');
            if (s2) s2.textContent = btn._label; else btn.textContent = btn._label;
        }, 2800);
        return false;
    }

    // ---------- открытие/закрытие ----------
    function openHub() {
        if (!hub || hub.classList.contains('open')) return;
        renderIdentity();
        hub.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
    }
    function closeHub() {
        if (!hub || !hub.classList.contains('open')) return;
        hub.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
    }

    function wire() {
        // Открывается ТОЛЬКО по клику (раньше открывалась ещё и по наведению — мешало,
        // когда курсор просто проходил над аватаром по пути к чему-то другому). Закрытие —
        // повторный клик по аватару, клик снаружи (pointerdown ниже) или Escape.
        btn.addEventListener('click', function () {
            if (hub.classList.contains('open')) closeHub(); else openHub();
        });
        // клавиатура: кнопка-аватар — это div role="button", сам по себе Enter/Space
        // его не активируют. Открываем/закрываем панель и уводим фокус внутрь.
        btn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                if (hub.classList.contains('open')) { closeHub(); }
                else {
                    openHub();
                    var first = hub.querySelector('.ph-row');
                    if (first) first.focus();
                }
            }
        });
        document.addEventListener('pointerdown', function (e) {
            if (!hub.classList.contains('open')) return;
            if (hub.contains(e.target) || btn.contains(e.target)) return;
            closeHub();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeHub();
        });

        // карточка регистрации: ведёт туда же, куда «Войти» — на Главную к форме
        var cta = hub.querySelector('#phCta');
        if (cta) {
            cta.addEventListener('click', goRegister);
            cta.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goRegister(); }
            });
        }

        // Подкручиваем список так, чтобы РАСКРЫТАЯ секция была видна целиком: секции
        // внизу («Данные», «Безопасность») разворачивались за нижним краем, и до полей
        // приходилось доскроллировать руками. Двигаем на минимум — если секция и так
        // помещается, не трогаем вовсе. Секцию выше окна прижимаем шапкой к верху:
        // показать её низ ценой ухода заголовка за край — хуже, чем не двигать.
        function phRevealSec(sec) {
            var list = hub.querySelector('.ph-list');
            if (!list) return;
            var pad = 8;
            var sr = sec.getBoundingClientRect(), lr = list.getBoundingClientRect();
            var delta = 0;
            if (sr.height > lr.height - pad * 2 || sr.top < lr.top) delta = sr.top - lr.top - pad;
            else if (sr.bottom > lr.bottom) delta = sr.bottom - lr.bottom + pad;
            if (Math.abs(delta) < 1) return;
            // rect'ы отдают ЗУМЛЕННЫЕ пиксели (desktop-zoom 0.9), scrollTop — слои
            // вёрстки: без деления на зум прокрутка недолетает
            var zoom = lr.height / (list.clientHeight || lr.height) || 1;
            list.scrollTo({ top: list.scrollTop + delta / zoom, behavior: 'smooth' });
        }

        // аккордеоны (открыт максимум один)
        hub.querySelectorAll('.ph-row').forEach(function (row) {
            row.addEventListener('click', function () {
                var sec = row.closest('.ph-sec');
                // запертый раздел не раскрываем, но и не молчим: мёртвый клик злит
                if (sec.classList.contains('locked')) {
                    toast('Создайте аккаунт, чтобы подключить брокера');
                    return;
                }
                var on = sec.classList.contains('on');
                hub.querySelectorAll('.ph-sec.on').forEach(function (x) {
                    x.classList.remove('on');
                    x.querySelector('.ph-row').setAttribute('aria-expanded', 'false');
                });
                if (!on) {
                    sec.classList.add('on');
                    row.setAttribute('aria-expanded', 'true');
                    // ждём конца раскрытия (.ph-body, grid-template-rows 0fr→1fr):
                    // до него высота секции ещё старая и скроллить не по чему
                    var body = sec.querySelector('.ph-body');
                    var done = function (e) {
                        if (e && e.target !== body) return;
                        body.removeEventListener('transitionend', done);
                        clearTimeout(tmr);
                        phRevealSec(sec);
                    };
                    var tmr = setTimeout(done, 320); // страховка, если transitionend не придёт
                    body.addEventListener('transitionend', done);
                }
            });
        });

        // брокер: визард подключения; селекты/переключатели настроек
        hub.querySelector('#phConnectBroker').addEventListener('click', onConnectBroker);
        hub.querySelector('#phBroker').addEventListener('change', function () {
            saveSettings({ brokerId: this.value });
        });
        // визард сообщает о подключении/отключении/блокировке — обновляем статус
        window.addEventListener('broker-conn-change', function () {
            if (!hub) return;
            renderApiSub();
            renderBkState();
        });
        hub.querySelector('#phStartTab').addEventListener('change', function () {
            saveSettings({ startTab: this.value });
            toast('Стартовый раздел: ' + this.options[this.selectedIndex].text);
        });
        hub.querySelector('#phSwHide').addEventListener('click', function () {
            this.classList.toggle('on');
            var hidden = this.classList.contains('on');
            this.setAttribute('aria-checked', hidden ? 'true' : 'false');
            saveSettings({ hideSums: hidden });
            if (window.sumsPrivacy) window.sumsPrivacy.set(hidden);
            toast(hidden ? 'Суммы скрыты — наведите на значение, чтобы взглянуть' : 'Суммы показаны');
        });
        hub.querySelector('#phSwSync').addEventListener('click', function () {
            this.classList.toggle('on');
            saveSettings({ brokerSync: this.classList.contains('on') });
        });

        // безопасность + данные
        hub.querySelector('#phSavePass').addEventListener('click', onSavePassword);
        hub.querySelector('#phSignoutAll').addEventListener('click', onSignoutAll);
        hub.querySelector('#phExport').addEventListener('click', onExportData);
        hub.querySelector('#phClearDev').addEventListener('click', onClearDevice);
        hub.querySelector('#phDeleteAcc').addEventListener('click', onDeleteAccount);
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

    // ---------- сигнал аудита эшелонов (только у админа) ----------
    // Админский модуль (admin.js) в фоне сверяет эшелоны с дивидендами и шлёт
    // событие 'echelon-audit'. При расхождениях зажигаем красный «!» на аватаре —
    // подсказку зайти в Админку → «Гугл таблица» и перепроверить. Клик по «!»
    // ведёт прямо в раздел. renderIdentity перерисовывает кнопку через innerHTML,
    // поэтому число держим в auditN и накатываем бейдж заново после каждого рендера.
    var auditN = 0;
    function setAuditBadge(n) {
        auditN = (n && n > 0) ? n : 0;
        applyAuditBadge();
    }
    function applyAuditBadge() {
        if (!btn) return;
        var hint = 'Эшелоны: ' + auditN + ' ' + plural(auditN, 'расхождение', 'расхождения', 'расхождений') + ' с дивидендами — проверьте в Админке';
        var el = btn.querySelector('#phAlert');
        if (auditN > 0) {
            if (!el) {
                el = document.createElement('span');
                el.id = 'phAlert';
                el.className = 'ph-alert';
                el.setAttribute('aria-hidden', 'true');
                el.textContent = '!';
                el.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    try { closeHub(); } catch (e) {}
                    if (window.echelonAudit && typeof window.echelonAudit.open === 'function') window.echelonAudit.open();
                });
                btn.appendChild(el);
            }
            el.title = hint;
        } else if (el) {
            el.remove();
        }
        // красная точка на кнопке «Админка» в панели кабинета
        var adm = hub && hub.querySelector('#phAdmin');
        if (adm) {
            var dot = adm.querySelector('.ph-adm-dot');
            if (auditN > 0 && !dot) {
                dot = document.createElement('i');
                dot.className = 'ph-adm-dot';
                adm.appendChild(dot);
            } else if (!auditN && dot) dot.remove();
            adm.title = auditN > 0 ? hint : 'Открыть админку';
        }
    }
    function plural(n, one, few, many) {
        var m = Math.abs(n) % 100, n1 = m % 10;
        if (m > 10 && m < 20) return many;
        if (n1 > 1 && n1 < 5) return few;
        if (n1 === 1) return one;
        return many;
    }
    window.addEventListener('echelon-audit', function (e) {
        setAuditBadge(e.detail && e.detail.mismatch);
    });

    // ---------- init ----------
    function init() {
        btn = document.getElementById('topProfileBtn');
        if (!btn) return;
        migrateBrokerToken();
        buildHub();
        buildFab();
        renderIdentity();
        wire();
        // событие аудита могло прийти до нас — подхватываем текущее состояние
        if (window.echelonAudit) setAuditBadge(window.echelonAudit.mismatch());
    }

    // «Раздел при запуске»: применяем только на «чистом» заходе (путь /),
    // прямые ссылки вида /market восстанавливает route-hash.js. Переключаем
    // СИНХРОННО на DOMContentLoaded — до первого пейнта, чтобы Главная не
    // мелькала перед стартовой вкладкой (бесшовный заход). Хендлер навешан
    // на верхнем уровне: defer-скрипт выполняется до DOMContentLoaded, а
    // восстановитель route-hash (скрипт позже нас) увидит уже переключённую
    // вкладку и не дёрнет её повторно.
    document.addEventListener('DOMContentLoaded', function () {
        var startTab = getSettings().startTab;
        if (!startTab || startTab === 'home') return;
        if (location.pathname.replace(/\/$/, '') !== '') return;
        if (typeof window.switchTab === 'function' && typeof currentTab !== 'undefined' && currentTab === 'home') {
            window.switchTab(startTab);
        }
    }, { once: true });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Тема могла восстановиться из localStorage после нас (initTheme/app-state) — досинхронизируем значок.
    document.addEventListener('DOMContentLoaded', function () { setTimeout(syncFabIcon, 50); });
})();
