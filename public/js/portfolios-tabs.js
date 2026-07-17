// ===== «ПОРТФЕЛИ» · ПОДВКЛАДКИ И ГЕРОЙ (модуль цепочки #pfLazySrc) =====
// R7-редизайн вкладки: тёмный герой-шапка (pfxHeroHtml), ряд подвкладок
// с чипами-портфелями (tablist, roving tabindex, DnD чипов, скролл с
// масками), deep-link подвкладки в хэше (pfxSyncPath + window.pfxGoTab/
// pfxApplySubPath/pfxSubPath), сиды раскладок подвкладок (PFX_TAB_SEEDS),
// контент подвкладки «Портфели» (pdetail) и карточки настроек set:*.
// Имена остатка цепочки (menuHtml, pfCardHead…) — через PF.*: остаток
// грузится ПОСЛЕ нас.
(function () {
    'use strict';
    var PF = window.PF;
    // импорт ядра (уже загружено):
    var attr = PF.attr, calcPf = PF.calcPf, clamp = PF.clamp, colorVal = PF.colorVal, dayDelta = PF.dayDelta, dq = PF.dq;
    var esc = PF.esc, findPf = PF.findPf, fmtPct = PF.fmtPct, fmtPrice = PF.fmtPrice, fmtQty = PF.fmtQty, fmtRub = PF.fmtRub;
    var jsArg = PF.jsArg, pfQuotesWarming = PF.pfQuotesWarming, skelHtml = PF.skelHtml, toast = PF.toast, visibleItems = PF.visibleItems;
    // импорт конструктора (portfolios-dash.js, уже загружен):
    var DASH_KEY = PF.DASH_KEY, DASH_TABS_KEY = PF.DASH_TABS_KEY, PFDCFG_GEAR_SVG = PF.PFDCFG_GEAR_SVG, PFD_PLUS_SVG = PF.PFD_PLUS_SVG, dashCfgFor = PF.dashCfgFor, pfTabCfgs = PF.pfTabCfgs;
    var pfTabsStore = PF.pfTabsStore, pfdInChromeHtml = PF.pfdInChromeHtml, pfdScrollToBlock = PF.pfdScrollToBlock, pfdStandardCfg = PF.pfdStandardCfg, pfxEffTab = PF.pfxEffTab, pfxIsPfTab = PF.pfxIsPfTab;
    var pfxSyncCfg = PF.pfxSyncCfg, saveDashCfg = PF.saveDashCfg, updateLayoutBtn = PF.updateLayoutBtn;
    // импорт виджетов (portfolios-widgets.js, уже загружен):
    var PFP_SLIDERS_SVG = PF.PFP_SLIDERS_SVG;
    // ====================================================================
    //  R7 — РЕДИЗАЙН ВКЛАДКИ: тёмный герой-шапка, подвкладки, новые виджеты,
    //  пикер «Добавить виджет» с демо-превью, настройка скруглений карточек.
    // ====================================================================
    // ---- подвкладки (Обзор | Портфели | Аналитика | Отчёты | Дивиденды | Операции | Настройки) ----
    // [ключ, подпись, иконка]. Иконка — чтобы вкладка узнавалась по силуэту и ряд не
    // приходилось перечитывать целиком. Третий элемент добавлен, а не подменил второй:
    // подпись [1] читает ещё и pfxTabLabel — она уходит в текст, не в разметку.
    var PFXI = function (d) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    };
    var PFX_TABS = [
        ['overview',  'Обзор',      PFXI('<rect x="3" y="3" width="7.5" height="8.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.8"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.8"/><rect x="3" y="14" width="7.5" height="7" rx="1.8"/>')],
        // «Мои портфели», не «Портфели»: вкладка сайдбара уже зовётся «Портфели» —
        // одинаковая подпись уровнем ниже читалась тавтологией (просьба 2026-07-15)
        ['ports',     'Мои портфели', PFXI('<rect x="2.5" y="7" width="19" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M2.5 12.5h19"/>')],
        ['analytics', 'Аналитика',  PFXI('<path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21"/><path d="M7 15.5l4-4.5 3.5 3L20 7"/>')],
        ['reports',   'Отчёты',     PFXI('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>')],
        ['divs',      'Дивиденды',  PFXI('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>')],
        ['ops',       'Операции',   PFXI('<path d="M3 7h13"/><path d="M12.5 3.5 16 7l-3.5 3.5"/><path d="M21 17H8"/><path d="M11.5 13.5 8 17l3.5 3.5"/>')],
        // «Торговля» — терминал этапа 2 (стакан/тикет/заявки); пока рендерит
        // гейт-карточку по состоянию подключения брокера (pfxTradingHtml)
        ['trading',   'Торговля',   PFXI('<path d="M3 17l5-5 3 3 7-8.5"/><polyline points="14 6.5 18 6.5 18 10.5"/><path d="M3 21h18"/>')],
        ['settings',  'Настройки',  PFDCFG_GEAR_SVG]   // та же шестерёнка, что у виджетов
    ];
    var PFX_TAB_KEY = 'pf_subtab_v1';   // локально (в облако не зеркалится — просто позиция UI)
    // ---- R9: вкладки-портфели ----
    // Клик по строке «Моих портфелей» открывает портфелю СВОЮ подвкладку рядом с
    // «Обзором» (только при 2+ видимых портфелях): у каждой — полноценный дашборд-
    // конструктор со своим конфигом в pf_dash_tabs_v1 (ключ 'pf:<id>', зеркалится в
    // облако вместе с остальными). Список ОТКРЫТЫХ вкладок — локальный, как и активная
    // подвкладка: это позиция UI, не данные. Закрытие крестиком раскладку НЕ стирает —
    // повторное открытие вернёт вкладку как была; конфиг удаляется только вместе с
    // портфелем (pfxDropPfTab).
    var PFX_OPEN_KEY = 'pf_open_tabs_v1';
    var pfxOpenPfTabs = (function () {
        try {
            var a = JSON.parse(localStorage.getItem(PFX_OPEN_KEY) || 'null');
            return Array.isArray(a) ? a.filter(function (pid) { return findPf(pid); }) : [];
        } catch (e) { return []; }
    })();
    function pfxSaveOpenTabs() { try { localStorage.setItem(PFX_OPEN_KEY, JSON.stringify(pfxOpenPfTabs)); } catch (e) {} }
    // валидная подвкладка: штатная из PFX_TABS или ОТКРЫТАЯ вкладка живого портфеля
    function pfxValidTab(t) {
        if (PFX_TABS.some(function (x) { return x[0] === t; })) return true;
        return pfxIsPfTab(t) && pfxOpenPfTabs.indexOf(t.slice(3)) >= 0 && !!findPf(t.slice(3));
    }
    PF.pfxTab = (function () {
        try {
            var t = localStorage.getItem(PFX_TAB_KEY);
            return pfxValidTab(t) ? t : 'overview';
        } catch (e) { return 'overview'; }
    })();
    function pfxWide() { try { return !window.matchMedia('(max-width: 1023px)').matches; } catch (e) { return true; } }
    // смена активной подвкладки БЕЗ рендера — общее ядро pfxGoTab/pfxPortSettings
    function pfxActivateTab(t) {
        if (PF.pfxTab === t) return;
        if (PF.dashEdit) { PF.dashEdit = false; try { updateLayoutBtn(); } catch (e) {} }   // пикер не тащим на другую подвкладку
        PF.pfl3Open = false;                       // панель раскладок — тоже пер-вкладочная
        PF.pfxTab = t;
        try { localStorage.setItem(PFX_TAB_KEY, t); } catch (e) {}
        PF.closeImpMenus();
        pfxSyncCfg();                           // R8: PF.dashCfg вкладки + сброс undo
        pfxSyncPath();                          // R9.3: подвкладка отражается в /portfolios/<sub>
    }
    window.pfxGoTab = function (t) {
        if (!pfxValidTab(t) || PF.pfxTab === t) return;
        pfxActivateTab(t);
        PF.renderNoAnim();
    };
    // ---- R9.3/R9.4: deep-link подвкладок — /portfolios#<sub> ----
    // Слаг для URL: «Обзор» — без хвоста, штатные подвкладки — своим ключом
    // ('#analytics', '#ports'…), вкладка-портфель — '#pf-<id>'. Именно ХЭШ, не
    // сегмент пути: /portfolios/analytics ломал резолв относительных src при
    // прямой загрузке (см. комментарий в route-hash.js). Читает route-hash
    // (pathForTab композирует путь при switchTab), пишет pfxSyncPath ниже.
    window.pfxSubPath = function () {
        var t = PF.pfxTab;
        if (!t || t === 'overview') return '';
        if (pfxIsPfTab(t)) return '#pf-' + t.slice(3);
        return '#' + t;
    };
    // применить подвкладку из пути (прямая загрузка /portfolios/analytics, popstate);
    // deep-link на вкладку-портфель ОТКРЫВАЕТ её чип — ссылкой можно поделиться
    window.pfxApplySubPath = function (sub) {
        var t = sub === 'overview' ? 'overview'
              : (sub && sub.indexOf('pf-') === 0) ? 'pf:' + sub.slice(3)
              : sub;
        if (!t || t === PF.pfxTab) return;
        if (pfxIsPfTab(t)) {
            var pid = t.slice(3);
            if (!findPf(pid) || !pfxWide()) return;
            if (pfxOpenPfTabs.indexOf(pid) < 0) { pfxOpenPfTabs.push(pid); pfxSaveOpenTabs(); }
        } else if (t !== 'overview' && !PFX_TABS.some(function (x) { return x[0] === t; })) return;
        pfxActivateTab(t);
        if (typeof currentTab !== 'undefined' && currentTab === 'portfolios' && dq('pfWrap')) PF.renderNoAnim();
    };
    // подвкладка сменилась — отразить в адресе (replaceState: без мусора в истории;
    // сами переходы между вкладками сайта пишет route-hash)
    function pfxSyncPath() {
        if (typeof currentTab === 'undefined' || currentTab !== 'portfolios') return;
        if (location.pathname.indexOf('/portfolios') !== 0) return;
        try { history.replaceState(history.state, '', '/portfolios' + window.pfxSubPath()); } catch (e) {}
    }
    // открыть портфелю его вкладку (клик по строке «Моих портфелей»); при одном
    // видимом портфеле вкладку не плодим — его дашборд и есть «Обзор» (просьба 2026-07-15)
    window.pfxOpenPf = function (pid) {
        var p = findPf(pid); if (!p) return;
        // R9.2: СКРЫТЫЙ портфель на широком экране открывается своей вкладкой —
        // на «Обзоре» его карточки нет; «Обзором» живут одиночка и узкий экран
        if (!pfxWide() || (!p.hidden && visibleItems().length < 2)) {
            var jumped = pfxGoOverviewFor(pid);
            if (jumped) { PF.renderNoAnim(); toast('Портфель показан на «Обзоре»'); }
            pfdScrollToBlock('pf:' + pid);
            return;
        }
        if (pfxOpenPfTabs.indexOf(pid) < 0) { pfxOpenPfTabs.push(pid); pfxSaveOpenTabs(); }
        if (PF.pfxTab === 'pf:' + pid) return;   // уже на своей вкладке — клик ничего не рушит
        window.pfxGoTab('pf:' + pid);
    };
    // закрыть вкладку-портфель (крестик на чипе); раскладка остаётся в pf_dash_tabs_v1.
    // R9.3: в тосте — «Вернуть»: вкладка встаёт на прежнее место и, если была
    // активной, снова активируется (undo-паттерн, как у скрытия портфеля)
    window.pfxClosePfTab = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var i = pfxOpenPfTabs.indexOf(pid);
        if (i >= 0) { pfxOpenPfTabs.splice(i, 1); pfxSaveOpenTabs(); }
        var wasOn = PF.pfxTab === 'pf:' + pid;
        if (wasOn) { pfxActivateTab('overview'); }
        PF.renderNoAnim();
        var p = findPf(pid);
        if (p && i >= 0) {
            toast('Вкладка «' + p.name + '» закрыта', false, { label: 'Вернуть', fn: function () {
                if (!findPf(pid)) return;   // портфель могли успеть удалить
                if (pfxOpenPfTabs.indexOf(pid) < 0) {
                    pfxOpenPfTabs.splice(Math.min(i, pfxOpenPfTabs.length), 0, pid);
                    pfxSaveOpenTabs();
                }
                if (wasOn) pfxActivateTab('pf:' + pid);
                PF.renderNoAnim();
            } });
        }
    };
    // R9.3: «открыть вкладку» из попапа «Видимость» — путь к СКРЫТОМУ портфелю
    // (в «Списке портфелей» его строки нет, карточки на «Обзоре» тоже нет)
    window.pfEyeOpenTab = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var p = findPf(pid); if (!p || !pfxWide()) return;
        if (pfxOpenPfTabs.indexOf(pid) < 0) { pfxOpenPfTabs.push(pid); pfxSaveOpenTabs(); }
        if (PF.pfxTab === 'pf:' + pid) { PF.renderNoAnim(); return; }   // уже там — просто закрыть попап рендером
        window.pfxGoTab('pf:' + pid);
    };
    // портфель удалён — вкладка, её раскладка и позиция UI уходят вместе с ним
    function pfxDropPfTab(pid) {
        var t = 'pf:' + pid, i = pfxOpenPfTabs.indexOf(pid);
        if (i >= 0) { pfxOpenPfTabs.splice(i, 1); pfxSaveOpenTabs(); }
        delete pfTabCfgs[t];
        if (pfTabsStore[t]) { delete pfTabsStore[t]; try { localStorage.setItem(DASH_TABS_KEY, JSON.stringify(pfTabsStore)); } catch (e) {} }
        if (PF.pfxTab === t) {
            PF.pfxTab = 'overview';
            try { localStorage.setItem(PFX_TAB_KEY, 'overview'); } catch (e) {}
            pfxSyncCfg();
            pfxSyncPath();
        }
    }
    function pfxTabsHtml() {
        if (!PF.store.items.length || !pfxWide()) return '';
        // подсветка — по ЭФФЕКТИВНОЙ вкладке: когда вкладка-портфель временно не живёт
        // (портфель скрыли, остался один видимый) контент показывает «Обзор» — активная
        // метка обязана показывать то же, иначе ряд остаётся «без выбранного»
        var eff = pfxEffTab();
        // чипы открытых вкладок-портфелей — сразу за «Обзором». Видимый портфель
        // показывает чип только при 2+ видимых (при одном его дашборд — «Обзор»).
        // R9.2: СКРЫТЫЙ портфель с открытой вкладкой — всегда: «скрыть» на «Обзоре»
        // вкладку не закрывает, она — единственное место, где портфель остался
        var chips = pfxOpenPfTabs.map(function (pid) {
            var p = findPf(pid);
            if (!p) return '';
            if (!p.hidden && visibleItems().length < 2) return '';
            var t = 'pf:' + pid, on = eff === t;
            // R9.3: чип перетаскивается (порядок вкладок — свой, см. pfxBindChipDnd);
            // у скрытого портфеля — мини-глазок: одна прозрачность не объясняла, ПОЧЕМУ
            // чип бледный (тултип видел только тот, кто навёл)
            // крестик — span role=button: вложенный <button> в <button> невалиден
            return '<button type="button" role="tab" id="pfxTab-pf-' + attr(pid) + '" aria-controls="pfxTabPanel" tabindex="' + (on ? '0' : '-1') + '" draggable="true" data-pid="' + attr(pid) + '" class="pfx-tab pfx-tab-pf' + (on ? ' on' : '') + (p.hidden ? ' hid' : '') + '" aria-selected="' + on + '" onclick="pfxGoTab(\'' + t + '\')" title="Дашборд портфеля «' + attr(p.name) + '»' + (p.hidden ? ' — убран с «Обзора»' : '') + '">' +
                '<span class="pfx-tab-dot" style="background:' + colorVal(p.color) + '" aria-hidden="true"></span>' +
                (p.hidden ? '<span class="pfx-tab-eyeoff" aria-hidden="true">' + PF.EYEOFF_SVG + '</span>' : '') +
                '<span class="pfx-tab-nm">' + esc(p.name) + '</span>' +
                '<span class="pfx-tab-x" role="button" aria-label="Закрыть вкладку" title="Закрыть вкладку" onclick="pfxClosePfTab(\'' + pid + '\', event)">' + PF.XMARK_SVG + '</span>' +
            '</button>';
        }).join('');
        // R9.5: честный tablist — roving tabindex (в Tab-обходе ровно одна вкладка,
        // остальное стрелками, см. pfxTabsKeydown), aria-controls ведёт на
        // #pfxTabPanel (обёртка контента, pfxPanelWrap)
        return '<div class="pfx-tabs" role="tablist" aria-label="Разделы «Портфелей»">' + PFX_TABS.map(function (t) {
            var on = eff === t[0];
            return '<button type="button" role="tab" id="pfxTab-' + t[0] + '" aria-controls="pfxTabPanel" tabindex="' + (on ? '0' : '-1') + '" class="pfx-tab' + (on ? ' on' : '') + '" aria-selected="' + on + '" onclick="pfxGoTab(\'' + t[0] + '\')">' +
                '<span class="pfx-tab-ic" aria-hidden="true">' + t[2] + '</span>' + t[1] + '</button>' +
                (t[0] === 'overview' ? chips : '');
        }).join('') + '</div>';
    }
    // R9.5: контент под рядом — настоящий tabpanel: aria-controls вкладок ведёт
    // сюда, aria-labelledby называет активную. Оборачиваем только когда ряд
    // вообще есть (широкий экран, есть портфели) — на мобильном ролей нет
    function pfxPanelWrap(inner) {
        var eff = pfxEffTab();
        var slug = pfxIsPfTab(eff) ? 'pf-' + eff.slice(3) : eff;
        return '<div id="pfxTabPanel" role="tabpanel" aria-labelledby="pfxTab-' + slug + '">' + inner + '</div>';
    }

    // ---- подвкладка «Торговля»: гейт по состоянию подключения брокера ----
    // Терминал (стакан, тикет заявок, ордера) — этап 2; сейчас подвкладка честно
    // говорит, что нужно для его включения. Карточка — язык пустых подвкладок
    // (.pfx-emptytab/.pfpc-state), рендер зовёт portfolios.js вместо pfdBodyHtml.
    function pfxTradingHtml() {
        var A = window.brokerApi;
        var conn = A && A.getConn();
        var art = PFXI('<path d="M3 17l5-5 3 3 7-8.5"/><polyline points="14 6.5 18 6.5 18 10.5"/><path d="M3 21h18"/>');
        var t, s, btn;
        if (!conn) {
            t = 'Торговый терминал';
            s = 'Подключите Т-Инвестиции с уровнем «Торговля» — здесь появятся стакан, тикет заявок и ваши ордера. Для начала хватит и «Только чтения»: виджет «Позиции у брокера» уже работает.';
            btn = '<button type="button" class="pfl-pv-add pfx-emptytab-btn" onclick="brokerConnect.open()"><span>Подключить брокера</span></button>';
        } else if (conn.scope !== 'trade') {
            t = 'Нужен торговый доступ';
            s = 'Брокер подключён в режиме «Только чтение» — торговать им нельзя, и это правильно для просмотра. Для терминала выпустите у брокера токен с полным доступом и переключите режим в подключении.';
            btn = '<button type="button" class="pfl-pv-add pfx-emptytab-btn" onclick="brokerConnect.open()"><span>Настроить подключение</span></button>';
        } else if (conn.state === 'revoked') {
            t = 'Токен не работает';
            s = 'Брокер не принял токен — его отозвали или перевыпустили. Обновите токен в подключении, и терминал вернётся.';
            btn = '<button type="button" class="pfl-pv-add pfx-emptytab-btn" onclick="brokerConnect.open()"><span>Обновить токен</span></button>';
        } else if (conn.state === 'downgraded') {
            t = 'Права токена урезали';
            s = 'Токен стал «только для чтения» — торговать им нельзя. Выпустите у брокера токен с полным доступом и обновите его в подключении.';
            btn = '<button type="button" class="pfl-pv-add pfx-emptytab-btn" onclick="brokerConnect.open()"><span>Обновить токен</span></button>';
        } else if (window.brokerApi && (window.brokerApi.isLocked() || window.brokerApi.isSessionGone())) {
            var gone = window.brokerApi.isSessionGone();
            t = gone ? 'Сессия токена закончилась' : 'Токен под PIN-кодом';
            s = gone ? 'Токен не сохранялся («до закрытия вкладки») — вставьте его ещё раз, и терминал вернётся.'
                : 'Разблокируйте токен, чтобы терминал получил доступ к счёту.';
            btn = '<button type="button" class="pfl-pv-add pfx-emptytab-btn" onclick="' + (gone ? 'brokerConnect.open()' : 'pfBrokerUnlock()') + '"><span>' + (gone ? 'Ввести токен' : 'Разблокировать') + '</span></button>';
        } else if (PF.pftTerminalHtml) {
            // этап 2: полноценный терминал (portfolios-trading.js в цепочке)
            return PF.pftTerminalHtml();
        } else {
            t = 'Терминал готовится';
            s = 'Торговое подключение активно' + (conn.sandbox ? ' (песочница)' : '') + ': счёт «' + esc(conn.accountName) +
                '». Стакан, тикет заявок с подтверждением и журнал ордеров — следующий этап, он появится именно здесь.';
            btn = '<button type="button" class="pfl-pv-add pfx-emptytab-btn" onclick="brokerConnect.open()"><span>Управлять подключением</span></button>';
        }
        return '<div class="pfd-grid pfd-masonry" id="pfdGrid">' +
            '<div class="pfx-emptytab" style="grid-column: 1 / span 12"><div class="pfpc-state">' +
            '<div class="pfpc-state-art">' + art + '</div>' +
            '<div class="pfpc-state-t">' + t + '</div>' +
            '<div class="pfpc-state-s">' + s + '</div>' + btn +
            '</div></div></div>';
    }
    // ---- R9.3: ряд вкладок скроллится, а не переносится ----
    // Затухание краёв показывает, что ряд продолжается (маска .fade-l/.fade-r по
    // фактическому scrollLeft), активная вкладка после рендера подъезжает в видимую
    // зону. Ряд пересоздаётся innerHTML-свопом каждый рендер — слушатели вешаем
    // заново по флагу на самом элементе.
    function pfxTabsFade(row) {
        var canL = row.scrollLeft > 4;
        var canR = row.scrollLeft + row.clientWidth < row.scrollWidth - 4;
        row.classList.toggle('fade-l', canL);
        row.classList.toggle('fade-r', canR);
    }
    function pfxTabsScrollSync() {
        var row = document.querySelector('#pfWrap .pfx-tabs');
        if (!row) return;
        if (!row._pfxBound) {
            row._pfxBound = true;
            row.addEventListener('scroll', function () { pfxTabsFade(row); }, { passive: true });
            row.addEventListener('keydown', pfxTabsKeydown);
            pfxBindChipDnd(row);
        }
        if (row.scrollWidth > row.clientWidth + 4) {
            var on = row.querySelector('.pfx-tab.on');
            if (on) {
                // прицельно двигаем scrollLeft (scrollIntoView утащил бы и страницу)
                var rl = row.getBoundingClientRect(), ol = on.getBoundingClientRect();
                if (ol.left < rl.left + 8) row.scrollLeft += ol.left - rl.left - 28;
                else if (ol.right > rl.right - 8) row.scrollLeft += ol.right - rl.right + 28;
            }
        }
        pfxTabsFade(row);
    }
    // ---- R9.5: клавиатура ряда вкладок (паттерн tablist, «ручная активация») ----
    // Стрелки ←/→ и Home/End гуляют ФОКУСОМ по вкладкам (roving tabindex), Enter/
    // Space активируют (нативный клик кнопки) — без ре-рендера на каждый шаг.
    // Ctrl/Cmd+стрелка на чипе двигает вкладку — клавиатурный аналог перетаскивания.
    function pfxTabsKeydown(e) {
        var row = e.currentTarget;
        var cur = e.target && e.target.closest ? e.target.closest('.pfx-tab') : null;
        if (!cur) return;
        if ((e.ctrlKey || e.metaKey) && cur.classList.contains('pfx-tab-pf') &&
            (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            e.preventDefault();
            pfxMoveChip(cur.getAttribute('data-pid'), e.key === 'ArrowRight' ? 1 : -1);
            return;
        }
        var tabs = Array.prototype.slice.call(row.querySelectorAll('.pfx-tab'));
        var i = tabs.indexOf(cur);
        if (i < 0) return;
        var to = null;
        if (e.key === 'ArrowRight') to = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') to = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') to = tabs[0];
        else if (e.key === 'End') to = tabs[tabs.length - 1];
        if (!to) return;
        e.preventDefault();
        tabs.forEach(function (b) { b.tabIndex = -1; });
        to.tabIndex = 0;
        to.focus();
    }
    // передвинуть чип на позицию влево/вправо в pfxOpenPfTabs; фокус остаётся
    // на нём (ряд пересоздан рендером — находим по data-pid заново)
    function pfxMoveChip(pid, dir) {
        var i = pfxOpenPfTabs.indexOf(pid);
        if (i < 0) return;
        var j = i + dir;
        if (j < 0 || j >= pfxOpenPfTabs.length) return;
        var tmp = pfxOpenPfTabs[i]; pfxOpenPfTabs[i] = pfxOpenPfTabs[j]; pfxOpenPfTabs[j] = tmp;
        pfxSaveOpenTabs();
        PF.renderNoAnim();
        var el = document.querySelector('#pfWrap .pfx-tab-pf[data-pid="' + pid + '"]');
        if (el) { el.tabIndex = 0; try { el.focus(); } catch (e) {} }
    }
    // ---- R9.3: перетаскивание чипов — свой порядок вкладок-портфелей ----
    // HTML5 DnD на строке (делегирование: чипы пересоздаются каждый рендер, строка
    // тоже — слушатели вешает pfxTabsScrollSync по флагу). Порядок сохраняется в
    // pfxOpenPfTabs (pf_open_tabs_v1); цель вставки — по серединам соседних чипов.
    var pfxDragPid = null;
    function pfxBindChipDnd(row) {
        row.addEventListener('dragstart', function (e) {
            var chip = e.target && e.target.closest ? e.target.closest('.pfx-tab-pf') : null;
            if (!chip) return;
            pfxDragPid = chip.getAttribute('data-pid');
            chip.classList.add('drag');
            try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', pfxDragPid); } catch (err) {}
        });
        // R9.4: каретка вставки — черта у чипа, ПЕРЕД (или после, если в конец)
        // которым приземлится перетаскиваемый; без неё место вставки было лотереей
        function clearDropMarks() {
            var marked = row.querySelectorAll('.pfx-drop-before, .pfx-drop-after');
            for (var i = 0; i < marked.length; i++) marked[i].classList.remove('pfx-drop-before', 'pfx-drop-after');
        }
        row.addEventListener('dragend', function () {
            pfxDragPid = null;
            clearDropMarks();
            var c = row.querySelector('.pfx-tab-pf.drag'); if (c) c.classList.remove('drag');
        });
        row.addEventListener('dragover', function (e) {
            if (!pfxDragPid) return;
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
            var chips = row.querySelectorAll('.pfx-tab-pf');
            var before = null, last = null;
            for (var i = 0; i < chips.length; i++) {
                if (chips[i].getAttribute('data-pid') === pfxDragPid) continue;
                last = chips[i];
                var r = chips[i].getBoundingClientRect();
                if (!before && e.clientX < r.left + r.width / 2) before = chips[i];
            }
            clearDropMarks();
            if (before) before.classList.add('pfx-drop-before');
            else if (last) last.classList.add('pfx-drop-after');
        });
        row.addEventListener('drop', function (e) {
            if (!pfxDragPid) return;
            e.preventDefault();
            clearDropMarks();
            var pid = pfxDragPid; pfxDragPid = null;
            // перед КАКИМ чипом бросили: первый, чья середина правее курсора
            var before = null;
            var chips = row.querySelectorAll('.pfx-tab-pf');
            for (var i = 0; i < chips.length; i++) {
                var cp = chips[i].getAttribute('data-pid');
                if (cp === pid) continue;
                var r = chips[i].getBoundingClientRect();
                if (e.clientX < r.left + r.width / 2) { before = cp; break; }
            }
            var from = pfxOpenPfTabs.indexOf(pid);
            if (from < 0) return;
            pfxOpenPfTabs.splice(from, 1);
            var to = before != null ? pfxOpenPfTabs.indexOf(before) : pfxOpenPfTabs.length;
            if (to < 0) to = pfxOpenPfTabs.length;
            pfxOpenPfTabs.splice(to, 0, pid);
            pfxSaveOpenTabs();
            PF.renderNoAnim();
        });
    }

    // ---- тёмный герой «Панель управления» — постоянная шапка вкладки (референс R7) ----
    var PFX_LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    var PFX_UNLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/></svg>';
    window.pfxToggleSums = function () {
        var s = {};
        try { s = JSON.parse(localStorage.getItem('profile_settings_v1')) || {}; } catch (e) {}
        s.hideSums = !s.hideSums;
        try { localStorage.setItem('profile_settings_v1', JSON.stringify(s)); } catch (e) {}
        if (window.sumsPrivacy && window.sumsPrivacy.set) window.sumsPrivacy.set(!!s.hideSums);
        PF.renderNoAnim();
        toast(s.hideSums ? 'Суммы скрыты — наведите на сумму, чтобы посмотреть' : 'Суммы снова видны');
    };
    // R8: пикер работает на ЛЮБОЙ подвкладке — виджет добавляется на текущую
    // (раньше кнопка принудительно уводила на «Обзор»)
    window.pfxAddWidgetClick = function () { window.pfLayoutToggle(); };
    function pfxHeroHtml() {
        if (!PF.store.items.length || !pfxWide()) return '';
        var dd = 0, hasDd = false;
        PF.store.items.forEach(function (p) {
            var d = dayDelta(p, calcPf(p).value); if (d != null) { dd += d; hasDd = true; }
        });
        var n = visibleItems().length;
        var ddCls = hasDd ? (dd >= 0 ? 'pos' : 'neg') : '';
        var ddVal = hasDd ? (dd >= 0 ? '+' : '−') + fmtRub(Math.abs(dd)) : '—';
        var sumsOn = !!(window.sumsPrivacy && window.sumsPrivacy.isOn && window.sumsPrivacy.isOn());
        var idBlock = '<div class="pfp-id">' +
            '<div class="pfp-ico">' + PF.PFDGRID_SVG + '</div>' +
            '<div class="pfp-id-t"><div class="pfp-title">Панель управления</div>' +
                '<div class="pfp-sub">' + n + ' ' + PF.plural(n, 'портфель', 'портфеля', 'портфелей') + ' · дашборд под рукой</div></div>' +
        '</div>';
        // «Капитал» из героя убран (просьба 2026-07-14): сумма живёт в KPI-виджете и
        // карточках. Остаётся один KPI «за сегодня» — ему свободнее (.pfp-kpis--solo).
        // data-live: KPI «за сегодня» и подпись обновляются точечно фоновым тиком
        // (livePatchers.hero ниже); те же ключи у дубликата в pfdPanelHtml (виджет
        // «Панель управления» конструктора) — обновятся заодно. Скелетон прогрева
        // живёт ВНУТРИ <b> (а не вместо него), чтобы патчеру было куда писать число.
        var ddNum = hasDd
            ? (pfQuotesWarming() ? '<b data-live="pfp:dd">' + skelHtml(92, 20) + '</b>' : '<b class="' + ddCls + '" data-live="pfp:dd">' + ddVal + '</b>')
            : '<b data-live="pfp:dd">—</b>';
        var kpis = '<div class="pfp-kpis pfp-kpis--solo">' +
            '<div class="pfp-kpi"><div class="num">' + ddNum + '<span>за сегодня</span></div>' +
                '<div class="sub" data-live="pfp:dd-sub">' + (hasDd ? 'к последнему дневному снимку' : 'появится со второго дня') + '</div></div>' +
        '</div>';
        // «Торговля» — не дашборд-конструктор: кнопки «Виджет»/«Раскладки»
        // там управляли бы пустым конфигом и только путали
        var isTrading = pfxEffTab() === 'trading';
        var actions = '<div class="pfp-actions">' +
            (isTrading ? '' : '<button type="button" class="pfp-btn primary" onclick="pfxAddWidgetClick()" title="Добавить виджет на дашборд">' + PFD_PLUS_SVG + '<span>Виджет</span></button>') +
            '<button type="button" class="pfp-btn" onclick="pfAddPortfolio()" title="Создать новый портфель">' + PF.PLUS_SVG + '<span>Портфель</span></button>' +
            '<button type="button" class="pfp-btn icon' + (sumsOn ? ' on' : '') + '" onclick="pfxToggleSums()" title="' + (sumsOn ? 'Показать суммы' : 'Скрывать суммы от посторонних глаз') + '">' + (sumsOn ? PFX_LOCK_SVG : PFX_UNLOCK_SVG) + '</button>' +
            PF.eyeWrapHtml() +
            PF.backupWrapHtml() +
            // R8: кнопка-слайдеры открывает ПАНЕЛЬ «Раскладки» (pfl3) текущей подвкладки —
            // пресеты с эскизами, базовая, своя сохранённая; прежний поповер остался
            // только в шапке страницы (index.html) как быстрый доступ
            (isTrading ? '' : '<span class="pfl-cfg-wrap pfp-cfg' + (PF.pfl3Open ? ' active' : '') + '" style="display:inline-flex">' +
                '<button type="button" class="pfl-cfg-btn" onclick="pfLayoutsToggle(event)" title="Раскладки подвкладки: пресеты, базовая, сохранённая" aria-label="Панель раскладок">' + PFP_SLIDERS_SVG + '</button>' +
            '</span>') +
        '</div>';
        return '<div class="pfp-panel pfx-hero">' +
            '<div class="pfp-fx" aria-hidden="true"><i class="g1"></i><i class="g2"></i><i class="mesh"></i></div>' +
            idBlock + kpis + actions +
        '</div>';
    }

    // ---- точечный фоновый апдейт героя (роадмап №6) ----
    // KPI «за сегодня» = Σ dayDelta по ВСЕМ портфелям (включая скрытые — как в
    // pfxHeroHtml). Ключи pfp:dd/pfp:dd-sub стоят и на дубликате разметки в
    // pfdPanelHtml (виджет «Панель управления») — liveSet обновит оба узла разом.
    // Пока котировки греются, число не пишем — скелетон заменит первый тик
    // после прогрева. Счётчик портфелей в .pfp-sub не котировочный — не трогаем.
    PF.livePatchers.hero = function () {
        var dd = 0, hasDd = false;
        PF.store.items.forEach(function (p) {
            var d = dayDelta(p, calcPf(p).value); if (d != null) { dd += d; hasDd = true; }
        });
        if (hasDd && pfQuotesWarming()) return;
        PF.liveSet('pfp:dd', {
            text: hasDd ? (dd >= 0 ? '+' : '−') + fmtRub(Math.abs(dd)) : '—',
            cls: hasDd ? (dd >= 0 ? 'pos' : 'neg') : '' });
        PF.liveSet('pfp:dd-sub', { text: hasDd ? 'к последнему дневному снимку' : 'появится со второго дня' });
    };

    // ---- скругление карточек: CSS-переменная --pfr на панели, персист в pf_dash_v1 ----
    // R8: настройка ГЛОБАЛЬНАЯ (одна на все подвкладки) — живёт в конфиге «Обзора»,
    // какая бы подвкладка ни была активна
    function pfxCornerPx() {
        var c = (pfTabCfgs.overview || PF.dashCfg).corner;
        return c === 'main' ? '14px' : c === 'lg' ? '28px' : '20px';
    }
    function pfxApplyCorner() {
        var el = document.getElementById('panel-portfolios');
        if (el) el.style.setProperty('--pfr', pfxCornerPx());
    }
    window.pfxSetCorner = function (v) {
        var oc = pfTabCfgs.overview || PF.dashCfg;
        if (['std', 'main', 'lg'].indexOf(v) < 0 || oc.corner === v) return;
        oc.corner = v;
        if (oc === PF.dashCfg) saveDashCfg();
        else try { localStorage.setItem(DASH_KEY, JSON.stringify(oc)); } catch (e) {}
        pfxApplyCorner();
        PF.renderNoAnim();
        try { updateLayoutBtn(); } catch (e) {}
    };
    function pfxCornerRowHtml(big) {
        var cur = PF.dashCfg.corner || 'std';
        var opts = [
            ['std', 'Мягкие', '20px', 'по умолчанию'],
            ['main', 'Как на Главной', '14px', 'как карточка входа'],
            ['lg', 'Крупные', '28px', 'как раньше']
        ];
        return '<div class="pfx-corner-row' + (big ? ' big' : '') + '">' + opts.map(function (o) {
            return '<button type="button" class="pfx-corner' + (cur === o[0] ? ' on' : '') + '" onclick="pfxSetCorner(\'' + o[0] + '\')" title="Скругление ' + o[2] + '">' +
                '<span class="pfx-corner-pv" style="border-radius:' + Math.round(parseInt(o[2], 10) * 0.55) + 'px"></span>' +
                '<span class="pfx-corner-tx"><b>' + o[1] + '</b><i>' + o[2] + (big ? ' · ' + o[3] : '') + '</i></span>' +
            '</button>';
        }).join('') + '</div>';
    }

    // ---- фон страницы: варианты живут в js/site-bg.js (список + персист + классы на body) ----
    // Настройка ГЛОБАЛЬНАЯ и общесайтовая — тот же фон на всех вкладках, не только здесь.
    // Плитка каждого варианта показывает его НАСТОЯЩУЮ заливку (класс .sbgpv-<id>,
    // css/site-bg.css), поэтому выбирать можно глазами, а не по названию.
    window.pfxSetBg = function (v) {
        if (!window.siteBg) return;
        window.siteBg.set(v);
        var b = (window.siteBg.list().filter(function (x) { return x.id === v; })[0] || {}).name;
        if (b) toast('Фон: ' + b.toLowerCase());
    };
    // Фон меняет не только эта карточка, но и плавающая кнопка #bgFab (js/site-bg.js).
    // Перерисовку повесили на событие, а не на pfxSetBg: так отметка «выбрано» верна,
    // кто бы ни переключил, и карточке не нужно знать про существование кнопки.
    document.addEventListener('site-bg-change', function () {
        if (document.querySelector('.pfx-bg')) PF.renderNoAnim();
    });
    function pfxBgRowHtml(big) {
        if (!window.siteBg) return '';
        var cur = window.siteBg.get();
        return '<div class="pfx-bg-row' + (big ? ' big' : '') + '">' + window.siteBg.list().map(function (o) {
            return '<button type="button" class="pfx-bg' + (cur === o.id ? ' on' : '') + '" onclick="pfxSetBg(\'' + jsArg(o.id) + '\')" title="' + esc(o.name) + ' — ' + esc(o.sub) + '">' +
                '<span class="pfx-bg-pv sbgpv-' + esc(o.id) + '"></span>' +
                '<span class="pfx-bg-tx"><b>' + esc(o.name) + '</b><i>' + esc(o.sub) + '</i></span>' +
            '</button>';
        }).join('') + '</div>' +
        '<div class="pfx-bg-note">Фон общий для всего сайта. На Главной своя живая карта, а в тёмной теме и на телефоне фон остаётся ровным — там узор только мешал бы.</div>';
    }

    // ---- первичная раскладка: у нового пользователя дашборд сразу собран по референсу ----
    // (авто-заметка над «Избранным» из старого референса убрана — в зонной раскладке
    // 2026-07-14 у неё нет своего места, заметки добавляются пикером по желанию)
    function pfxSeedLayout() {
        if (PF.dashTab !== 'overview') return;   // R8: подвкладки сидируются в pfxTabSeed
        if (!PF.dashCfg.on || (PF.dashCfg.order || []).length || !visibleItems().length) return;
        var std = pfdStandardCfg();
        PF.dashCfg.order = std.order; PF.dashCfg.span = std.span; PF.dashCfg.col = std.col;
        PF.dashCfg.hidden = Object.assign({}, std.hidden || {});
        saveDashCfg();
    }


    // ====================================================================
    //  R7 — ПОДВКЛАДКИ (R8: статичные сетки pfxCell/pfxGridWrap удалены —
    //  раскладку каждой подвкладки собирает конструктор pfdBodyHtml)
    // ====================================================================
    // Подвкладка «Портфели» (R7.2): не карточки-виджеты, а полноширинный обзор КАЖДОГО
    // портфеля — шапка с показателями и распределением + ПОЛНЫЙ состав таблицей с
    // показателями по каждой бумаге (кол-во, средняя, сейчас, стоимость, доля, доход).
    function pfxPortHoldRowHtml(x, c) {
        var h = x.h, hc = x.c, isB = h.type === 'bond';
        var share = (c.value > 0 && hc.value > 0) ? hc.value / c.value * 100 : 0;
        var noQ = hc.curSrc === 'buy';
        var has = hc.invested > 0 && !noQ;
        return '<tr class="pfpt-tr"' + (isB ? '' : ' role="button" onclick="pfOpenTicker(\'' + jsArg(h.ticker) + '\')"') + '>' +
            '<td class="pfpt-as"><b>' + esc(h.ticker) + '</b><i class="' + (isB ? 'bond' : 'stock') + '">' + (isB ? 'обл' : 'акц') + '</i><span>' + esc(PF.assetDisplayName(h)) + '</span></td>' +
            '<td class="pfpt-num">' + fmtQty(hc.qty) + '</td>' +
            '<td class="pfpt-num">' + fmtPrice(hc.buy) + '</td>' +
            '<td class="pfpt-num' + (hc.live ? ' pfpt-live' : '') + '">' + (noQ ? '…' : fmtPrice(hc.cur)) + '</td>' +
            '<td class="pfpt-num pfpt-val">' + fmtRub(hc.value) + '</td>' +
            '<td class="pfpt-share"><span class="pfpt-sharebar"><i style="width:' + clamp(share, 2, 100).toFixed(1) + '%"></i></span><b>' + share.toFixed(1).replace('.', ',') + '%</b></td>' +
            '<td class="pfpt-num ' + (has ? (hc.pnl >= 0 ? 'pos' : 'neg') : '') + '">' + (has ? (hc.pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(hc.pnl)) : '—') + '</td>' +
            '<td class="pfpt-num ' + (has ? (hc.pnlPct >= 0 ? 'pos' : 'neg') : '') + '">' + (has ? fmtPct(hc.pnlPct) : '—') + '</td>' +
        '</tr>';
    }
    // ---- переход на «Обзор» ради карточки портфеля (R8) ----
    // R9: при 2+ видимых портфелях у каждого есть СВОЯ вкладка с карточкой — настройки
    // открываются там (pfxPortSettings ведёт на неё). «Обзор» остаётся местом карточки
    // для одного портфеля и фолбэком (узкий экран, скрытый портфель, «+ Портфель»).
    // Чтобы переход не читался как сбой («нажал — куда-то унесло»), его ОЗВУЧИВАЕМ
    // тостом и подсвечиваем карточку, к которой унесло.
    function pfxGoOverviewFor(pid) {
        var jumped = pfxEffTab() !== 'overview';
        if (jumped) {
            PF.pfxTab = 'overview';
            try { localStorage.setItem(PFX_TAB_KEY, 'overview'); } catch (e) {}
            PF.pfl3Open = false;
            pfxSyncCfg();
            pfxSyncPath();
        }
        // карточку могли удалить с «Обзора» (hidden=1) — тогда уводить было бы некуда:
        // возвращаем её, раз пользователь сам просит настройки этого портфеля
        var oc = dashCfgFor('overview');
        if (oc.hidden && oc.hidden['pf:' + pid]) {
            oc.hidden['pf:' + pid] = 0;
            if (oc === PF.dashCfg) saveDashCfg();
            else try { localStorage.setItem(DASH_KEY, JSON.stringify(oc)); } catch (e) {}
        }
        return jumped;
    }
    // подсветка карточки после перехода (без прокрутки — её ведут вызывающие)
    function pfxFlashBlock(id) {
        var tries = 0;
        (function poll() {
            var el = document.querySelector('#pfWrap .pfd-item[data-pfd="' + id + '"]');
            if (el) {
                el.classList.add('pfd-flash');
                setTimeout(function () { try { el.classList.remove('pfd-flash'); } catch (e) {} }, 1500);
                return;
            }
            if (tries++ < 45) requestAnimationFrame(poll);
        })();
    }
    // ---- R9.1: настройки портфеля — ШТОРКОЙ справа, БЕЗ смены подвкладки ----
    // Шестерёнка в «Моих портфелях»/«Составах» больше никуда не уводит (просьба
    // 2026-07-16): настройки открываются оверлеем поверх текущей страницы.
    // Содержимое — тот же PF.menuHtml, что в карточке (одна логика состава/цвета/
    // импорта/удаления), поэтому и источник состояния общий: PF.openMenu + флаг
    // PF.pfSetDrawerOn. Пока шторка открыта, карточное меню НЕ рендерится (см.
    // menuOn в cardHtml) — иначе на странице два набора одинаковых id полей.
    function pfxDrawerEl() {
        var host = document.getElementById('pfSetDrawer');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'pfSetDrawer';
        host.innerHTML = '<div class="pfsd-scrim" onclick="pfCloseMenu()"></div>' +
            '<aside class="pfsd-panel" role="dialog" aria-label="Настройки портфеля">' +
                '<div class="pfsd-head">' +
                    '<div class="pfsd-head-t"><b>Настройки портфеля</b><span>состав, имя и цвет, деньги, цель и удаление</span></div>' +
                    '<button type="button" class="pfsd-x" onclick="pfCloseMenu()" aria-label="Закрыть">' + PF.XMARK_SVG + '</button>' +
                '</div>' +
                '<div class="pfsd-body"></div>' +
            '</aside>';
        document.body.appendChild(host);
        return host;
    }
    // синк шторки — в конце renderPortfolios: все хендлеры настроек (лоты, цвет,
    // импорт, данжер-зона) зовут общий рендер, шторка обновляется вместе со страницей
    function pfxDrawerSync() {
        var host = document.getElementById('pfSetDrawer');
        var p = PF.pfSetDrawerOn && PF.openMenu ? findPf(PF.openMenu) : null;
        if (!p) {
            PF.pfSetDrawerOn = false;
            if (host && host.classList.contains('open')) {
                host.classList.remove('open');
                document.body.classList.remove('pfsd-open');
            }
            return;
        }
        host = pfxDrawerEl();
        var body = host.querySelector('.pfsd-body');
        // курсор в текстовом поле шторки (имя/деньги/форма добавления) — фоновый своп
        // котировок унёс бы ввод; кнопки фокус-гарду не мешают (клики обновляют список)
        var ae = document.activeElement;
        if (host.classList.contains('open') && ae && body.contains(ae) &&
            (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
        var keep = {};
        Array.prototype.forEach.call(body.querySelectorAll('[data-skey]'), function (el) {
            if (el.scrollTop) keep[el.getAttribute('data-skey')] = el.scrollTop;
        });
        // .pfc-menu внутри шторки всегда no-anim: входит сама шторка, а не меню
        var saveJust = PF.menuJustOpened;
        PF.menuJustOpened = false;
        body.innerHTML = PF.menuHtml(p);
        PF.menuJustOpened = saveJust;
        Array.prototype.forEach.call(body.querySelectorAll('[data-skey]'), function (el) {
            var k = el.getAttribute('data-skey');
            if (keep[k]) el.scrollTop = keep[k];
        });
        host.querySelector('.pfsd-panel').style.setProperty('--pf-accent', colorVal(p.color));
        host.classList.add('open');
        document.body.classList.add('pfsd-open');
    }
    window.pfxPortSettings = function (pid) {
        if (!findPf(pid)) return;
        // свежеоткрытая шторка — с чистым состоянием (тот же набор, что в pfToggleMenu);
        // PF.menuJustOpened даёт автофокус на тикер у пустого портфеля (хвост renderPortfolios)
        PF.openMenu = pid; PF.pfSetDrawerOn = true; PF.menuJustOpened = true;
        PF.chartOpen = {}; PF.chartAssets = {}; PF.chartAssetsFull = {}; PF.holdsExpand = {};
        PF.editHold = {}; PF.colorsOpen = false; PF.delArm = false; PF.addOpen = false;
        PF.renderNoAnim();   // спрячет карточное меню, pfxDrawerSync наполнит шторку
    };
    // Esc закрывает шторку (клик по скриму — тоже, см. pfxDrawerEl); pfCloseMenu
    // сбрасывает PF.openMenu, а pfxDrawerSync по нему гасит и саму шторку
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && PF.pfSetDrawerOn) window.pfCloseMenu();
    });

    // ---- R9.1: обучающий призрак «Добавить виджет» → постоянная круглая кнопка ----
    // Первый клик по призраку на вкладке-портфеле улетает анимацией в правый нижний
    // угол и превращается в FAB «+» над кнопкой смены фона (идея 2026-07-16): так
    // пользователь СВОИМИ ГЛАЗАМИ видит, куда переехала точка входа, и призрак больше
    // не занимает сетку. Флаг обучения — локальный (позиция UI, в облако не зеркалится).
    var PFX_FAB_KEY = 'pf_widget_fab_v1';
    function pfxFabSeen() { try { return localStorage.getItem(PFX_FAB_KEY) === '1'; } catch (e) { return false; } }
    // постоянная кнопка: живёт в body, видимость на вкладке «Портфели» гейтит CSS
    // (body:has(#panel-portfolios.active)), класс .on — «обучение пройдено, десктоп»
    function pfxFabSync() {
        var f = document.getElementById('pfWidgetFab');
        if (!pfxFabSeen() || !pfxWide()) { if (f) f.classList.remove('on'); return; }
        if (!f) {
            f = document.createElement('button');
            f.id = 'pfWidgetFab'; f.type = 'button';
            f.title = 'Добавить виджет на подвкладку'; f.setAttribute('aria-label', 'Добавить виджет');
            f.innerHTML = PFD_PLUS_SVG;
            // stopPropagation: клик по FAB не должен долетать до document — там
            // «клик-вне» пикера мгновенно закрыл бы только что открытую панель
            f.onclick = function (e) { if (e) e.stopPropagation(); try { window.pfLayoutToggle(); } catch (err) {} };
            document.body.appendChild(f);
        }
        f.classList.add('on');
    }
    window.pfxGhostClick = function (ev) {
        if (ev) ev.stopPropagation();   // «клик-вне» пикера не должен тут же закрыть его
        // повторный клик после обучения сюда не попадает (призрак уже не рендерится),
        // но на всякий случай — сразу пикер
        if (pfxFabSeen()) { window.pfLayoutToggle(); return; }
        var item = ev.currentTarget.closest('.pfd-item') || ev.currentTarget;
        var r = item.getBoundingClientRect();
        // клон-«комета» летит fixed-ом в body: body под zoom 0.9 → визуальные px из
        // rect делим на фактор (та же самокалибровка, что у призрака драга, pfdGz)
        var z = r.width / (item.offsetWidth || r.width) || 1;
        var SZ = 46, RIGHT = 22, BOTTOM = 124;   // геометрия #pfWidgetFab (см. CSS)
        var fly = document.createElement('div');
        fly.className = 'pfxg-fly';
        fly.style.left = (r.left / z) + 'px'; fly.style.top = (r.top / z) + 'px';
        fly.style.width = (r.width / z) + 'px'; fly.style.height = (r.height / z) + 'px';
        fly.innerHTML = PFD_PLUS_SVG;
        document.body.appendChild(fly);
        try { localStorage.setItem(PFX_FAB_KEY, '1'); } catch (e) {}
        item.style.visibility = 'hidden';   // исходная ячейка гаснет сразу — летит только комета
        requestAnimationFrame(function () {
            fly.classList.add('go');
            fly.style.left = (window.innerWidth / z - RIGHT - SZ) + 'px';
            fly.style.top = (window.innerHeight / z - BOTTOM - SZ) + 'px';
            fly.style.width = SZ + 'px'; fly.style.height = SZ + 'px';
        });
        var done = false;
        var finish = function () {
            if (done) return; done = true;
            try { fly.remove(); } catch (e) {}
            pfxFabSync();               // FAB появляется ровно там, куда прилетела комета
            window.pfLayoutToggle();    // и сразу открываем пикер — призрак же «Добавить виджет»
        };
        fly.addEventListener('transitionend', finish);
        setTimeout(finish, 950);        // страховка, если transitionend не стрельнёт
    };
    function pfxTabPortsHtml() {
        var vis = visibleItems();
        if (!vis.length) return PF.store.items.length ? PF.allHiddenHtml() : PF.emptyHtml();
        var GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg>';
        return '<div class="pfx-ports">' + vis.map(function (p, i) {
            var c = calcPf(p), ac = colorVal(p.color);
            var dd = dayDelta(p, c.value);
            var bondP = Math.round(clamp(c.bondPct, 0, 100)), stockP = 100 - bondP;
            var has = c.invested > 0;
            // R9.2: показатели — ПЛИТКАМИ в языке «Сводных показателей» (.pfsm-*): подпись,
            // крупное моно-число и чип с контекстом. Чипы не украшение, а ответ на вопрос
            // «от чего число»: у капитала — движение за сегодня (раньше чип болтался у
            // имени), у вложено — число активов, у дохода — процент, у доходности —
            // «годовых» (величина годовая, и по одному «+2,3%» это было не прочитать).
            function tile(l, v, cls, chp) {
                return '<div class="pfsm-tile"><i>' + l + '</i><b class="' + (cls || '') + '">' + v + '</b>' + (chp || '') + '</div>';
            }
            function chip(cls, tx) { return '<span class="pfsm-chip ' + cls + '">' + tx + '</span>'; }
            function absPct(x) { return Math.abs(x).toFixed(1).replace('.', ',') + '%'; }
            var ddChip = (dd != null && Math.abs(dd) >= 1)
                ? chip(dd >= 0 ? 'pos' : 'neg', (dd >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(dd)) + ' за сегодня')
                : chip('', 'появится со второго дня');
            var nA = c.hs.length;
            var head = '<div class="pfpt-head">' +
                '<div class="pfpt-id">' +
                    '<span class="pfc-name" onclick="pfNameEdit(\'' + p.id + '\',event)" title="Нажмите, чтобы переименовать"><span class="pfc-name-ink">' + esc(p.name) + '</span></span>' +
                '</div>' +
                '<div class="pfpt-kpis">' +
                    tile('Капитал', fmtRub(c.value), '', ddChip) +
                    tile('Вложено', has ? fmtRub(c.invested) : '—', '', chip('', nA + ' ' + PF.plural(nA, 'актив', 'актива', 'активов'))) +
                    tile('Доход', has ? (c.pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(c.pnl)) : '—', c.pnl >= 0 ? 'pos' : 'neg',
                        has ? chip(c.pnlPct >= 0 ? 'pos' : 'neg', (c.pnlPct >= 0 ? '▲ ' : '▼ ') + absPct(c.pnlPct)) : '') +
                    tile('Доходность', has ? fmtPct(c.annual) : '—', c.annual >= 0 ? 'pos' : 'neg', chip('', 'годовых')) +
                '</div>' +
                '<div class="pfpt-alloc">' +
                    '<div class="pfc-dist-bar"><div style="width:' + stockP + '%;background:#D97757"></div><div style="width:' + bondP + '%;background:#7B9BBF"></div></div>' +
                    '<div class="pfc-dist-lbl"><span><i style="background:#D97757"></i>Акции ' + stockP + '%</span><span><i style="background:#7B9BBF"></i>Облигации ' + bondP + '%</span></div>' +
                '</div>' +
                '<div class="pfpt-acts">' +
                    // кнопки виджета — у ПЕРВОЙ карточки блока (блок один, кнопки одни) и
                    // слева от действий портфеля, а не поверх них
                    (i === 0 ? pfdInChromeHtml('pdetail') : '') +
                    '<button class="pfc-rebal pfpt-rebal" onclick="pfExpand(\'' + p.id + '\')">' + PF.REBAL_SVG + 'Ребалансировать</button>' +
                    '<button class="pfc-act" onclick="pfxPortSettings(\'' + p.id + '\')" title="Настройки портфеля" aria-label="Настройки портфеля">' + GEAR + '</button>' +
                '</div>' +
            '</div>';
            var table = c.hs.length
                ? '<div class="pfpt-tablewrap"><table class="pfpt-table"><thead><tr>' +
                    // «Доля» — свой класс и на заголовке: колонка левоприжатая (полоска
                    // растёт слева), и отступ от правоприжатой «Стоимости» задаётся
                    // ОДИН раз для th и td, чтобы шапка не разъезжалась со значением
                    '<th>Бумага</th><th class="pfpt-num">Кол-во</th><th class="pfpt-num">Средняя</th><th class="pfpt-num">Сейчас</th>' +
                    '<th class="pfpt-num">Стоимость</th><th class="pfpt-share">Доля</th><th class="pfpt-num">Доход</th><th class="pfpt-num">Доходность</th>' +
                  '</tr></thead><tbody>' + c.hs.map(function (x) { return pfxPortHoldRowHtml(x, c); }).join('') + '</tbody></table></div>'
                : '<div class="pfal-empty">Состав пуст — добавьте активы в настройках портфеля ⚙.</div>';
            return '<div class="dash2-card pf-card2 pfpt-card" style="--pf-accent:' + ac + '">' + head + table + '</div>';
        }).join('') + '</div>';
    }
    // R8: только видимость ПОРТФЕЛЕЙ (глобальная). Тумблеры секций отсюда убраны:
    // видимость блоков теперь пер-вкладочная и управляется корзиной/глазом на самих
    // виджетах и меню «Видимость» в герое — а этот виджет может жить на любой подвкладке.
    function pfxVisRowsHtml() {
        var rows = '<div class="pf-impgrp">Портфели</div>';
        PF.store.items.forEach(function (p) {
            var off = !!p.hidden, c = calcPf(p);
            rows += '<button class="pf-impitem pf-eyeitem' + (off ? ' off-eye' : '') + '" onclick="pfToggleHidden(\'' + p.id + '\',event)">' +
                '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                '<span class="pf-impbody"><b>' + esc(p.name) + '</b><i>' + fmtRub(c.value) + (off ? ' · скрыт' : '') + '</i></span>' +
                '<span class="pf-eyestate">' + (off ? PF.EYEOFF_SVG : PF.EYE_SVG) + '</span></button>';
        });
        rows += '<div class="pf-eyenote">Скрытые портфели не показываются в списках и календаре, но их капитал учитывается в сводке. Видимость виджетов настраивается на каждой подвкладке: корзина на блоке и меню «Видимость» в шапке.</div>';
        return '<div class="pfx-setlist">' + rows + '</div>';
    }
    function pfxSetCardHtml(title, sub, inner) {
        return '<div class="dash2-card pf-card2 pfx-setcard">' + PF.pfCardHead('', title, sub, null) +
            '<div class="pfx-setbody">' + inner + '</div></div>';
    }
    // R8: статичных раскладок подвкладок (pfxTabBodyHtml) больше нет — каждая
    // подвкладка рендерится конструктором pfdBodyHtml со своим конфигом; прежние
    // наборы виджетов стали СИДАМИ (PFX_TAB_SEEDS), карточки настроек — виджетами
    // set:* (pfxSetCardHtml/pfxVisRowsHtml используются ими и живут выше).


    // ==================================================================
    //  ИНТЕРФЕЙС ПОДВКЛАДОК (window.PF)
    // ==================================================================
    // Состояние шторки настроек (PF.openMenu, PF.pfSetDrawerOn, PF.editHold,
    // PF.addOpen, PF.colorsOpen, PF.delArm, PF.menuJustOpened) объявлено в
    // каркасе рендера свойствами PF — алиасы на него запрещены.
    PF.PFX_TABS = PFX_TABS; PF.pfxActivateTab = pfxActivateTab; PF.pfxApplyCorner = pfxApplyCorner; PF.pfxBgRowHtml = pfxBgRowHtml;
    PF.pfxCornerRowHtml = pfxCornerRowHtml; PF.pfxDrawerSync = pfxDrawerSync; PF.pfxDropPfTab = pfxDropPfTab; PF.pfxFabSeen = pfxFabSeen;
    PF.pfxFabSync = pfxFabSync; PF.pfxFlashBlock = pfxFlashBlock; PF.pfxGoOverviewFor = pfxGoOverviewFor; PF.pfxHeroHtml = pfxHeroHtml;
    PF.pfxOpenPfTabs = pfxOpenPfTabs; PF.pfxPanelWrap = pfxPanelWrap; PF.pfxSaveOpenTabs = pfxSaveOpenTabs; PF.pfxSeedLayout = pfxSeedLayout;
    PF.pfxSetCardHtml = pfxSetCardHtml; PF.pfxSyncPath = pfxSyncPath; PF.pfxTabPortsHtml = pfxTabPortsHtml; PF.pfxTabsHtml = pfxTabsHtml;
    PF.pfxTabsScrollSync = pfxTabsScrollSync; PF.pfxVisRowsHtml = pfxVisRowsHtml; PF.pfxWide = pfxWide;
    PF.pfxTradingHtml = pfxTradingHtml;
})();
