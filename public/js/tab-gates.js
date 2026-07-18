// =============================================
// ЗАГЛУШКИ ВКЛАДОК И СИСТЕМНЫЕ СООБЩЕНИЯ
// =============================================
// Конфиг живёт в Supabase (app_config, ключ 'tab_gates', пишет админ из
// раздела «Вкладки»), читают все — включая гостей. Формат:
//   { tabs:   { calc: { off: true }, market: { msg: '…', msgKind: 'warn' },
//               mobile: { off: true } },        // 'mobile' — ВСЯ мобильная версия
//     custom: { newtab: { label: 'Новая вкладка' } },  // задел на будущие вкладки
//     titles: { backtest: 'Бэктест' } }                // переименование вкладок
//   off — вкладка закрыта заглушкой «раздел в разработке»;
//   msg — баннер-сообщение поверх вкладки (не блокирует работу);
//   custom — вкладки, добавленные админом заранее: заглушка применится сама,
//   как только в DOM появится #panel-<key> (пока панели нет — просто ждёт);
//   titles — своё название вкладки вместо встроенного (пусто = встроенное).
//   Переименование НЕ трогает id: роутинг, ключи конфига и панели те же.
//
// Заглушка — ГЛАВНАЯ ОДИН В ОДИН: та же сетка .hg-cover (манифест слева,
// плотная белая колонна справа), те же классы hc-*/hr-*/hg-* из
// home-register.css. На десктопе, пока открыта закрытая вкладка, body.gx-on
// включает ОБЩИЙ фикс-слой Главной #hgHeatWrap (живая карта + вуаль на весь
// экран, ПОД шапкой и сайдбаром) и форсит тёмную тему — сцена один в один,
// включая фон под рейкой (syncFull). Отличия только в тексте и механике
// формы: вместо входа — подписка «сообщим о готовности».
// Контент рендерится ВНУТРИ панели вкладки (.gx-cover, прямые дети панели
// прячутся классом .tab-gated — никаких fixed, см. паттерн «fixed ловится
// transform»); свой фон .gx-heat в .gx-cover остаётся только для узких
// экранов (десктоп прячет его CSS-ом — фон рисует #hgHeatWrap).
// Исключение — заглушка мобильной версии: она одна на ВСЁ приложение и
// живёт fixed-оверлеем #gxMobileCover прямо в <body> (там transform не
// ловит, см. паттерн stockDetailCard).
//
// Свои вкладки админа появляются у всех СРАЗУ: syncPanels создаёт пустую
// панель #panel-<key> (её тут же закрывает заглушка), syncSidebar — настоящий
// пункт сайдбара перед «Админкой»; роутинг /<key> понимает route-hash.js
// (isValid спрашивает tabGates.getCustom).
//
//   · авторизованный видит обращение по имени и колонну «сообщим, когда
//     будет готово» с выбором канала (сайт / браузер / Telegram — подписка
//     в feature_waitlist; выбор telegram включает profiles.notify_telegram,
//     browser — разрешение Notification);
//   · гость видит заглушку с кнопкой «Войти на Главной».
//
// Кэш конфига — localStorage tab_gates_cache_v1 (ВНЕ cloud-sync.WATCH):
// заглушка встаёт мгновенно при загрузке, сеть лишь освежает.
// Без Supabase модуль спит (в демо-режиме заглушек нет).
// Грузится после notifications.js, до route-hash.js.

(function () {
    'use strict';

    var LS_CACHE = 'tab_gates_cache_v1';
    var REFRESH_MS = 90000;              // перечитываем конфиг не чаще
    var CFG_KEY = 'tab_gates';
    var MOBILE_KEY = 'mobile';           // спец-ключ: вся мобильная версия

    // Встроенные вкладки, которым доступны заглушка и баннер
    // (Главная и Админка — никогда). Список дополняется custom-вкладками
    // из конфига — их админ добавляет заранее, до появления самой панели.
    var BASE_TABS = {
        calc:            'Расчёт',
        portfolio:       'Портфель',
        portfolios:      'Портфели',
        rebalance:       'Ребаланс',
        market:          'Рынок',
        'market-stocks': 'Терминал',
        backtest:        'Тест портфеля'
    };

    var gates = {};          // tab -> { off, msg, msgKind }
    var customTabs = {};     // key -> { label } (добавленные админом)
    var titles = {};         // tab -> своё название (переименование из админки)
    var fetchedAt = 0;
    var fetching = false;
    var myWaitlist = null;   // tab -> channel (подписки текущего пользователя), null = не грузили

    function supa() { return window.supa; }
    function cloudOn() { return !!(supa() && supa().enabled); }
    function authed() { return !!(supa() && supa().enabled && supa().isAuthed()); }
    function toast(msg, isErr) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isErr);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function firstName() {
        var pr = supa() && supa().profile;
        var n = (pr && pr.name || '').trim();
        return n ? n.split(/\s+/)[0] : '';
    }
    // Явное переименование из админки (пусто — вкладка зовётся как встроено)
    function titleOf(k) {
        var t = titles[k];
        return t == null ? '' : String(t).trim();
    }
    // Итоговое имя вкладки: переименование → встроенное → label своей → ключ
    function tabTitle(k) {
        return titleOf(k) || BASE_TABS[k] || (customTabs[k] && customTabs[k].label) || k;
    }
    function tabsAll() {
        var m = {}, k;
        for (k in BASE_TABS) m[k] = tabTitle(k);
        for (k in customTabs) {
            if (m[k] || k === MOBILE_KEY || k === 'home' || k === 'admin') continue;
            m[k] = tabTitle(k);
        }
        return m;
    }
    function isNarrow() {
        try { return window.matchMedia('(max-width: 1023px)').matches; } catch (e) { return false; }
    }

    // ---------- конфиг ----------
    function readCache() {
        try { return JSON.parse(localStorage.getItem(LS_CACHE) || 'null') || {}; }
        catch (e) { return {}; }
    }
    function writeCache() {
        try { localStorage.setItem(LS_CACHE, JSON.stringify({ tabs: gates, custom: customTabs, titles: titles, at: Date.now() })); } catch (e) {}
    }

    function fetchConfig(force) {
        if (!cloudOn() || fetching) return Promise.resolve();
        if (!force && Date.now() - fetchedAt < REFRESH_MS) return Promise.resolve();
        fetching = true;
        return supa().client.from('app_config').select('value').eq('key', CFG_KEY).limit(1)
            .then(function (res) {
                fetching = false;
                if (res.error) return;
                fetchedAt = Date.now();
                var v = (res.data && res.data[0] && res.data[0].value) || {};
                gates = v.tabs || {};
                customTabs = v.custom || {};
                titles = v.titles || {};
                writeCache();
                applyAll();
            }, function () { fetching = false; });
    }

    function fetchMyWaitlist() {
        if (!authed()) { myWaitlist = {}; return Promise.resolve(); }
        return supa().client.from('feature_waitlist').select('tab,channel')
            .then(function (res) {
                myWaitlist = {};
                if (!res.error) (res.data || []).forEach(function (r) { myWaitlist[r.tab] = r.channel; });
            }, function () { myWaitlist = {}; });
    }

    // Мгновенное применение свежесохранённого конфига (зовёт админка)
    window.tabGates = {
        refresh: function () { fetchedAt = 0; return fetchConfig(true); },
        get: function () { return gates; },
        getCustom: function () { return customTabs; },
        // titleOf — только явное переименование ('' если его нет, зовёт sidebar.js);
        // tabTitle — итоговое имя вкладки для показа
        titleOf: titleOf,
        tabTitle: tabTitle,
        BASE_TABS: BASE_TABS,
        MOBILE_KEY: MOBILE_KEY,
        // совместимость со старым API (admin.js читал TABS)
        TABS: BASE_TABS
    };

    // ---------- применение ----------
    function panelOf(tab) { return document.getElementById('panel-' + tab); }

    function applyAll() {
        syncPanels();
        syncSidebar();
        syncLabels();
        var all = tabsAll();
        Object.keys(all).forEach(function (tab) { applyTab(tab); });
        applyMobile();
        syncFull();
    }

    // ---------- свои вкладки: панель + пункт сайдбара ----------
    // Добавленная админом вкладка появляется у ВСЕХ сразу: создаём пустую
    // панель #panel-<key> (её тут же закрывает заглушка) и настоящий пункт
    // сайдбара перед «Админкой». Если разработчики позже выложат настоящую
    // панель с таким id — syncPanels её не тронет.
    var KEY_RE = /^[a-z][a-z0-9-]{1,23}$/;
    var GX_TAB_ICON = '<svg viewBox="0 0 24 24"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>';

    function customKeys() {
        return Object.keys(customTabs).filter(function (k) {
            return KEY_RE.test(k) && !BASE_TABS[k] && k !== MOBILE_KEY && k !== 'home' && k !== 'admin';
        });
    }

    function syncPanels() {
        var home = document.getElementById('panel-home');
        var host = home && home.parentNode;
        if (!host) return;
        customKeys().forEach(function (key) {
            if (!document.getElementById('panel-' + key)) {
                var p = document.createElement('div');
                p.id = 'panel-' + key;
                p.className = 'tab-panel gx-custom-panel';
                host.appendChild(p);
            }
        });
        // вкладку убрали из конфига — уносим пользователя и панель
        var live = document.querySelectorAll('.tab-panel.gx-custom-panel');
        for (var i = 0; i < live.length; i++) {
            var key = live[i].id.replace(/^panel-/, '');
            if (customTabs[key]) continue;
            if (live[i].classList.contains('active') && typeof window.switchTab === 'function') {
                window.switchTab('home');
            }
            live[i].remove();
        }
    }

    function syncSidebar() {
        var nav = document.getElementById('sbNav');
        if (!nav) return;
        var anchor = document.getElementById('sbAdminBtn');
        var stale = nav.querySelectorAll('.sb-item.gx-custom');
        for (var i = 0; i < stale.length; i++) {
            if (!customTabs[stale[i].getAttribute('data-tab')]) stale[i].remove();
        }
        customKeys().forEach(function (key) {
            var label = tabTitle(key);   // своя вкладка тоже переименовывается
            var el = nav.querySelector('.sb-item.gx-custom[data-tab="' + key + '"]');
            if (!el) {
                el = document.createElement('a');
                el.className = 'sb-item gx-custom';
                el.setAttribute('data-tab', key);
                el.href = '/' + key;
                el.innerHTML = GX_TAB_ICON + '<span class="sb-label"></span>';
                el.addEventListener('click', function (e) {
                    // модифицированный клик — браузеру (новая вкладка), обычный — SPA
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    if (typeof window.switchTab === 'function') window.switchTab(key);
                });
                nav.insertBefore(el, anchor || null);
            }
            el.title = label;
            el.querySelector('.sb-label').textContent = label;
        });
    }

    // ---------- переименование вкладок ----------
    // Админ даёт вкладке своё имя (раздел «Вкладки»), id при этом не меняется.
    // Подписи встроенных вкладок лежат в СТАТИЧЕСКОЙ разметке index.html, своего
    // JS-владельца у них нет — патчим живые узлы: пункт сайдбара (title +
    // .sb-label) и кнопку мобильного дока. Исходную подпись прячем в data-gx-l0:
    // сброс имени обязан вернуть ровно её, а в сайдбаре подписи короче полного
    // имени («Тест» при title «Тест портфеля») — брать их из BASE_TABS нельзя.
    function labelNode(el, txt) {
        if (!el) return;
        if (el.getAttribute('data-gx-l0') == null) el.setAttribute('data-gx-l0', el.textContent);
        el.textContent = txt || el.getAttribute('data-gx-l0');
    }
    function syncLabels() {
        var keys = {}, k;
        for (k in BASE_TABS) keys[k] = 1;
        for (k in titles) keys[k] = 1;
        Object.keys(keys).forEach(function (tab) {
            // свои вкладки целиком рисует syncSidebar (там же и их имя)
            if (!BASE_TABS[tab] && customTabs[tab]) return;
            var t = titleOf(tab);
            var sb = document.querySelector('.sb-item[data-tab="' + tab + '"]');
            if (sb) {
                labelNode(sb.querySelector('.sb-label'), t);
                if (sb.getAttribute('data-gx-t0') == null) sb.setAttribute('data-gx-t0', sb.getAttribute('title') || '');
                sb.setAttribute('title', t || sb.getAttribute('data-gx-t0'));
            }
            labelNode(document.querySelector('#mobileDock .dock-item[data-tab="' + tab + '"] span'), t);
        });
        // хлебная крошка шапки берёт имя из своего словаря — перерисовываем её
        if (typeof window.renderHeaderBadge === 'function') window.renderHeaderBadge(curTab());
    }

    // ---------- полноэкранная сцена: фон как на Главной ----------
    // Пока открыта закрытая вкладка (десктоп), body.gx-on включает общий
    // фикс-слой Главной #hgHeatWrap (css/tab-gates.css) — карта уходит под
    // шапку и сайдбар. Тему форсим в тёмную (у Главной то же делает авто-тема);
    // при уходе возвращаем тему вкладки через applyAutoThemeForTab.
    var forcedDark = false;
    function curTab() {
        // currentTab объявлена `let` в webapp-tabs.js — она в скрипт-скоупе, а
        // не на window; барворд виден всем классическим скриптам, грузящимся позже
        try { return (typeof currentTab !== 'undefined') ? currentTab : null; } catch (e) { return null; }
    }
    function syncFull() {
        var t = curTab();
        var g = t ? gates[t] : null;
        var on = !!(g && g.off && tabsAll()[t] && !isNarrow());
        var was = document.body.classList.contains('gx-on');
        document.body.classList.toggle('gx-on', on);
        if (on && !document.body.classList.contains('dark-mode')) {
            forcedDark = true;
            if (typeof window.toggleTheme === 'function') window.toggleTheme();
        } else if (!on && was && forcedDark) {
            forcedDark = false;
            if (typeof window.applyAutoThemeForTab === 'function') window.applyAutoThemeForTab(t || 'home');
        }
        if (on && !was) {
            // слой был display:none (нулевой размер) — перерисовать карту
            window.requestAnimationFrame(function () {
                if (typeof window.hgHeatRepaint === 'function') window.hgHeatRepaint();
            });
        }
    }

    function applyTab(tab) {
        var panel = panelOf(tab);
        if (!panel) return;   // custom-вкладка без панели — заглушка ждёт её появления
        var g = gates[tab] || {};

        // --- заглушка ---
        var covered = !!g.off;
        panel.classList.toggle('tab-gated', covered);
        var cover = panel.querySelector('.gx-cover');
        if (covered) {
            if (!cover) {
                cover = document.createElement('div');
                cover.className = 'gx-cover';
                panel.insertBefore(cover, panel.firstChild);
            }
            renderCover(cover, tab);
        } else if (cover) {
            cover.remove();
        }

        // --- системный баннер (при заглушке не нужен — панель и так закрыта) ---
        var msg = (!covered && g.msg) ? String(g.msg) : '';
        var banner = panel.querySelector('.gx-banner');
        if (msg) {
            if (!banner) {
                banner = document.createElement('div');
                banner.setAttribute('role', 'status');
                panel.insertBefore(banner, panel.firstChild);
            }
            banner.className = 'gx-banner ' + (g.msgKind === 'warn' ? 'warn' : 'info');
            banner.innerHTML =
                '<svg viewBox="0 0 24 24">' + (g.msgKind === 'warn'
                    ? '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
                    : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>') + '</svg>' +
                '<span>' + esc(msg) + '</span>';
        } else if (banner) {
            banner.remove();
        }
    }

    // Заглушка ВСЕЙ мобильной версии: fixed-оверлей в <body> (не в панели —
    // мобильная заглушка одна на всё приложение). Включается конфигом
    // tabs.mobile.off и только на узком экране (≤1023px, как css/mobile.css).
    function applyMobile() {
        var g = gates[MOBILE_KEY] || {};
        var on = !!g.off && isNarrow();
        var cover = document.getElementById('gxMobileCover');
        if (on) {
            if (!cover) {
                cover = document.createElement('div');
                cover.id = 'gxMobileCover';
                cover.className = 'gx-cover gx-mobile';
                document.body.appendChild(cover);
            }
            renderCover(cover, MOBILE_KEY);
            document.body.classList.add('gx-mobile-on');
        } else if (cover) {
            cover.remove();
            document.body.classList.remove('gx-mobile-on');
        }
    }

    // ---------- сцена-заглушка: Главная один в один ----------
    // Разметка повторяет .hg-cover из index.html (манифест .hg-main слева,
    // белая колонна .hg-auth справа) — классы те же, стили приезжают из
    // home-register.css, tab-gates.css лишь переводит сцену в тёмный вид
    // Главной. Фон — живые плитки .hg-tile в .gx-heat (hgHeatRepaint).
    var SVG_ARROW = '<svg class="hr-submit-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"></path><path d="M9 7h8v8"></path></svg>';
    var SVG_LOCK = '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    var SVG_BELL = '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>';

    function renderCover(cover, tab) {
        var isAuthed = authed();
        var name = firstName();
        var isMobile = tab === MOBILE_KEY;
        var tabName = isMobile ? 'Мобильная версия' : (tabsAll()[tab] || tab);
        var sub = myWaitlist && myWaitlist[tab];

        // --- левый манифест ---
        var title, lead;
        if (isMobile) {
            title = (isAuthed && name)
                ? esc(name) + ', мобильная версия<br>пока в мастерской'
                : 'Мобильная версия<br>пока в мастерской';
            lead = 'Мы аккуратно собираем тот же терминал под экран телефона. ' +
                'Пока загляните с компьютера — там открыта полная версия.';
        } else {
            title = (isAuthed && name)
                ? esc(name) + ', раздел<br>«' + esc(tabName) + '» в мастерской'
                : 'Раздел «' + esc(tabName) + '»<br>скоро откроется';
            lead = isAuthed
                ? 'Мы дорабатываем его до привычного уровня — спокойно и без спешки. ' +
                  'Подпишитесь на оповещение, и мы сообщим, как только всё будет готово.'
                : 'Мы дорабатываем его до привычного уровня. Загляните чуть позже — ' +
                  'или войдите, чтобы подписаться на новость о запуске.';
        }
        var ctas = '<div class="hc-ctas">' +
            (isMobile ? '' :
                '<button class="hc-cta hc-cta-dark" type="button" data-gx="go-home">' +
                    '<span>' + (isAuthed ? 'Вернуться в кабинет' : 'На Главную') + '</span>' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"></path><path d="M9 7h8v8"></path></svg>' +
                '</button>') +
            '<span class="hg-live gx-status">Раздел в разработке</span>' +
        '</div>';

        var main =
            '<div class="hg-main">' +
                '<div class="hg-brand">' +
                    '<span class="hg-brand-name"><span style="font-weight:300;">Madame </span><span style="font-weight:800;">Solomi\'na</span></span>' +
                    '<span class="hg-brand-sub">Wealth Management</span>' +
                '</div>' +
                '<h1 class="hc-title">' + title + '</h1>' +
                '<p class="hc-lead">' + lead + '</p>' +
                ctas +
            '</div>';

        // --- правая колонна: та же белая карточка, но с механикой подписки ---
        var side;
        if (!isAuthed) {
            side =
                '<aside class="hg-auth gx-side">' +
                    '<span class="hr-label">Оповещение о запуске</span>' +
                    '<h2 class="hr-title">Не пропустите запуск</h2>' +
                    '<p class="hr-sub">' + (isMobile
                        ? 'Откройте сайт с компьютера, войдите в аккаунт — и подпишитесь на новость о запуске мобильной версии.'
                        : 'Войдите или создайте аккаунт — и здесь появится подписка: пришлём новость, когда раздел откроется.') + '</p>' +
                    (isMobile ? '' :
                        '<button class="hr-submit" type="button" data-gx="go-home"><span>Войти на Главной</span>' + SVG_ARROW + '</button>') +
                    '<p class="hr-policy">' + SVG_LOCK + 'Secure Access</p>' +
                '</aside>';
        } else if (sub) {
            side =
                '<aside class="hg-auth gx-side">' +
                    '<span class="hr-label">Оповещение о запуске</span>' +
                    '<div class="gx-ok"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.27"/></svg></div>' +
                    '<h2 class="hr-title">Вы в списке</h2>' +
                    '<p class="hr-sub">Как только ' + (isMobile ? 'мобильная версия откроется' : 'раздел откроется') + ', пришлём оповещение' +
                        (sub === 'telegram' ? ' — и продублируем в Telegram' : (sub === 'browser' ? ' — и покажем в браузере' : ' под звоночек в шапке')) + '.</p>' +
                    (isMobile ? '' :
                        '<button class="hr-submit" type="button" data-gx="go-home"><span>Вернуться в кабинет</span>' + SVG_ARROW + '</button>') +
                    '<p class="hr-foot">Передумали? <a class="hr-link" data-gx="unsub" data-tab="' + tab + '">Отписаться</a></p>' +
                    '<p class="hr-policy">' + SVG_LOCK + 'Secure Access</p>' +
                '</aside>';
        } else {
            var pr = supa().profile || {};
            var tgOk = !!pr.telegram_id;
            var chans =
                chanBtn('site', 'Под звоночком', 'Оповещение на сайте — рядом с аватаром', true, true) +
                chanBtn('browser', 'В браузере', ('Notification' in window) ? 'Системное уведомление на этом устройстве' : 'Браузер не поддерживает уведомления', ('Notification' in window), false) +
                chanBtn('telegram', 'В Telegram', tgOk ? 'Сообщение от бота — придёт и на телефон' : 'Сначала привяжите Telegram: аватар → Профиль', tgOk, false);
            side =
                '<aside class="hg-auth gx-side">' +
                    '<span class="hr-label">Оповещение о запуске</span>' +
                    '<h2 class="hr-title">Сообщим о готовности</h2>' +
                    '<p class="hr-sub">Выберите удобный канал — оповестим один раз, когда ' + (isMobile ? 'мобильная версия' : 'раздел') + ' откроется.</p>' +
                    '<div class="gx-chans" data-tab="' + tab + '">' + chans + '</div>' +
                    '<button class="hr-submit" type="button" data-gx="sub" data-tab="' + tab + '"><span>Подписаться</span>' + SVG_ARROW + '</button>' +
                    (isMobile ? '' :
                        '<button class="hr-tg" type="button" data-gx="go-home">Вернуться в кабинет</button>') +
                    '<p class="hr-policy">' + SVG_BELL + 'Одно оповещение · без спама</p>' +
                '</aside>';
        }

        var html =
            '<div class="gx-heat" aria-hidden="true"></div>' +
            '<div class="gx-scrim" aria-hidden="true"></div>' +
            '<div class="hg-cover gx-hg">' + main + side + '</div>';

        // повторный вызов с тем же содержимым не трогает DOM — иначе
        // на каждом switchTab переигрывалась бы анимация hgAuthIn
        if (cover._gxHtml !== html) {
            cover.innerHTML = html;
            cover._gxHtml = html;
        }
        // живые плитки в фон (общий рендер Главной; данные закэшированы)
        window.requestAnimationFrame(function () {
            if (typeof window.hgHeatRepaint === 'function') window.hgHeatRepaint();
        });
    }

    function chanBtn(id, t, s, enabled, active) {
        return '<button type="button" class="gx-chan' + (active ? ' on' : '') + '" data-chan="' + id + '"' + (enabled ? '' : ' disabled') + '>' +
            '<b>' + t + '</b><span>' + s + '</span></button>';
    }

    // ---------- подписка ----------
    function subscribe(tab, channel) {
        if (!authed()) return;
        var uid = supa().session.user.id;
        supa().client.from('feature_waitlist')
            .upsert({ user_id: uid, tab: tab, channel: channel }, { onConflict: 'user_id,tab' })
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                myWaitlist = myWaitlist || {};
                myWaitlist[tab] = channel;

                // выбранный канал включаем по-настоящему — иначе доставка не дойдёт
                if (channel === 'telegram') {
                    supa().client.from('profiles').update({ notify_telegram: true })
                        .eq('id', uid).then(function () {
                            if (supa().profile) supa().profile.notify_telegram = true;
                        }, function () {});
                } else if (channel === 'browser' && ('Notification' in window) && Notification.permission !== 'granted') {
                    Notification.requestPermission().then(function (perm) {
                        if (perm === 'granted') {
                            try {
                                var s = JSON.parse(localStorage.getItem('profile_settings_v1') || '{}');
                                s.notifyBrowser = true;
                                localStorage.setItem('profile_settings_v1', JSON.stringify(s));
                            } catch (e) {}
                        }
                    });
                }
                toast('Подписка оформлена — сообщим, когда раздел откроется');
                if (tab === MOBILE_KEY) applyMobile(); else applyTab(tab);
            });
    }

    function unsubscribe(tab) {
        if (!authed()) return;
        supa().client.from('feature_waitlist').delete()
            .eq('user_id', supa().session.user.id).eq('tab', tab)
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                if (myWaitlist) delete myWaitlist[tab];
                toast('Подписка снята');
                if (tab === MOBILE_KEY) applyMobile(); else applyTab(tab);
            });
    }

    // ---------- события ----------
    document.addEventListener('click', function (e) {
        var chan = e.target.closest ? e.target.closest('.gx-chan') : null;
        if (chan && !chan.disabled) {
            var box = chan.closest('.gx-chans');
            box.querySelectorAll('.gx-chan').forEach(function (b) { b.classList.remove('on'); });
            chan.classList.add('on');
            return;
        }
        var btn = e.target.closest ? e.target.closest('[data-gx]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-gx');
        if (act === 'go-home') {
            if (typeof window.switchTab === 'function') window.switchTab('home');
        } else if (act === 'sub') {
            var tab = btn.getAttribute('data-tab');
            var picked = document.querySelector('.gx-chans[data-tab="' + tab + '"] .gx-chan.on');
            subscribe(tab, picked ? picked.getAttribute('data-chan') : 'site');
        } else if (act === 'unsub') {
            unsubscribe(btn.getAttribute('data-tab'));
        }
    });

    // ---------- init ----------
    function init() {
        var c = readCache();       // мгновенно, до сети
        gates = c.tabs || {};
        customTabs = c.custom || {};
        titles = c.titles || {};
        applyAll();
        if (!cloudOn()) return;    // демо-режим — заглушек нет
        fetchMyWaitlist().then(function () { applyAll(); });
        fetchConfig(true);

        if (supa()) {
            supa().onChange(function (kind) {
                if (kind === 'init' || kind === 'signin' || kind === 'signout' || kind === 'profile') {
                    fetchMyWaitlist().then(function () { applyAll(); });
                }
            });
        }
    }

    // Поворот/ресайз: мобильная заглушка следует за шириной экрана,
    // а полноэкранная сцена — за пересечением десктопного порога
    (function () {
        try {
            var mq = window.matchMedia('(max-width: 1023px)');
            var onMq = function () { applyMobile(); syncFull(); };
            if (mq.addEventListener) mq.addEventListener('change', onMq);
            else if (mq.addListener) mq.addListener(onMq);
        } catch (e) {}
    })();

    // Переключение вкладки: перепроверяем конфиг (мягко, с троттлингом).
    // syncFull зовём ВСЕГДА — уходя с закрытой вкладки надо снять gx-on/тему.
    var _prevSwitchTab = window.switchTab;
    if (typeof _prevSwitchTab === 'function') {
        window.switchTab = function (tabId) {
            _prevSwitchTab(tabId);
            if (tabsAll()[tabId]) {
                applyTab(tabId);
                fetchConfig(false);
            }
            syncFull();
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
