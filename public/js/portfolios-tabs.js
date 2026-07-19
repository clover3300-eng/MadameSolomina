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
    var pfxIsTradeTab = PF.pfxIsTradeTab, pfxTradeAlive = PF.pfxTradeAlive, pfxTradeNo = PF.pfxTradeNo;
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
    var PFX_TRADE_KEY = 'pf_trade_screen_v1';   // последний открытый экран «Торговли» — тоже позиция UI
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
    // валидная подвкладка: штатная из PFX_TABS, ОТКРЫТАЯ вкладка живого портфеля
    // или существующий экран «Торговли» ('trading:2' и далее, см. pfxIsTradeTab)
    function pfxValidTab(t) {
        if (PFX_TABS.some(function (x) { return x[0] === t; })) return true;
        if (pfxIsTradeTab(t)) return pfxTradeAlive(t);
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
        try {
            localStorage.setItem(PFX_TAB_KEY, t);
            // какой экран «Торговли» был последним — для возврата из верхнего ряда
            if (pfxIsTradeTab(t)) localStorage.setItem(PFX_TRADE_KEY, t);
        } catch (e) {}
        PF.closeImpMenus();
        pfxSyncCfg();                           // R8: PF.dashCfg вкладки + сброс undo
        pfxSyncPath();                          // R9.3: подвкладка отражается в /portfolios/<sub>
    }
    window.pfxGoTab = function (t) {
        if (!pfxValidTab(t) || PF.pfxTab === t) return;
        pfxActivateTab(t);
        PF.renderNoAnim();
    };
    // «Торговля» в верхнем ряду возвращает на ПОСЛЕДНИЙ открытый экран: уйти в
    // «Аналитику» и вернуться к своему стакану — обычный жест, а сброс на первый
    // экран каждый раз заставлял бы искать нужный в полосе внизу
    window.pfxGoTrading = function () {
        var last = '';
        try { last = localStorage.getItem(PFX_TRADE_KEY) || ''; } catch (e) {}
        window.pfxGoTab(pfxIsTradeTab(last) && pfxTradeAlive(last) ? last : 'trading');
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
        // экран «Торговли» — '#trading-2': двоеточие в хэше выглядело бы как
        // протокол и не переживало бы копирование ссылки из мессенджера
        if (pfxIsTradeTab(t) && t !== 'trading') return '#trading-' + pfxTradeNo(t);
        return '#' + t;
    };
    // применить подвкладку из пути (прямая загрузка /portfolios/analytics, popstate);
    // deep-link на вкладку-портфель ОТКРЫВАЕТ её чип — ссылкой можно поделиться
    window.pfxApplySubPath = function (sub) {
        var t = sub === 'overview' ? 'overview'
              : (sub && sub.indexOf('pf-') === 0) ? 'pf:' + sub.slice(3)
              : /^trading-\d+$/.test(sub || '') ? 'trading:' + sub.slice(8)
              : sub;
        if (!t || t === PF.pfxTab) return;
        if (pfxIsPfTab(t)) {
            var pid = t.slice(3);
            if (!findPf(pid) || !pfxWide()) return;
            if (pfxOpenPfTabs.indexOf(pid) < 0) { pfxOpenPfTabs.push(pid); pfxSaveOpenTabs(); }
        } else if (pfxIsTradeTab(t)) {
            // ссылка на несуществующий экран (его удалили) — открываем первый,
            // а не оставляем пользователя на прежней подвкладке молча
            if (!pfxTradeAlive(t)) t = 'trading';
            if (t === PF.pfxTab) return;
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
            // «Торговля» подсвечена на ЛЮБОМ своём экране (trading:2 и далее): экраны —
            // это её внутренний ряд внизу, а не отдельные пункты верхнего ряда. Клик
            // возвращает на последний открытый экран, а не сбрасывает на первый
            var on = t[0] === 'trading' ? pfxIsTradeTab(eff) : eff === t[0];
            var go = t[0] === 'trading' ? 'pfxGoTrading()' : 'pfxGoTab(\'' + t[0] + '\')';
            return '<button type="button" role="tab" id="pfxTab-' + t[0] + '" aria-controls="pfxTabPanel" tabindex="' + (on ? '0' : '-1') + '" class="pfx-tab' + (on ? ' on' : '') + '" aria-selected="' + on + '" onclick="' + go + '">' +
                '<span class="pfx-tab-ic" aria-hidden="true">' + t[2] + '</span>' + t[1] + '</button>' +
                (t[0] === 'overview' ? chips : '');
        }).join('') + '</div>';
    }
    // R9.5: контент под рядом — настоящий tabpanel: aria-controls вкладок ведёт
    // сюда, aria-labelledby называет активную. Оборачиваем только когда ряд
    // вообще есть (широкий экран, есть портфели) — на мобильном ролей нет
    function pfxPanelWrap(inner) {
        var eff = pfxEffTab();
        // экраны «Торговли» называет одна и та же вкладка ряда (#pfxTab-trading):
        // aria-labelledby обязан указывать на СУЩЕСТВУЮЩИЙ id, а чипа 'trading:2' нет
        var slug = pfxIsPfTab(eff) ? 'pf-' + eff.slice(3) : (pfxIsTradeTab(eff) ? 'trading' : eff);
        return '<div id="pfxTabPanel" role="tabpanel" aria-labelledby="pfxTab-' + slug + '">' + inner + '</div>';
    }

    // ---- подвкладка «Торговля»: гейт по состоянию подключения брокера ----
    // Пока терминала нет, подвкладка показывает ЕГО САМОГО: за матовым стеклом
    // стоит «призрак» — стакан, тикет, график и лента заявок из тех же
    // .btr-*-классов, что и живая раскладка. Экран перестаёт быть пустым
    // прямоугольником, и сразу видно, ЧТО откроется; замок поверх объясняет,
    // чего не хватает.
    //
    // ВАЖНО: раскладку призрак берёт из конструктора — dashCfgFor('trading'),
    // тот же конфиг, по которому живёт живой терминал. Кто уже собрал вкладку
    // под себя (второй стакан, график во всю ширину, свои ширины и высоты) —
    // за стеклом увидит СВОЮ раскладку, а не образцовую. Новому пользователю
    // достаётся сид PFX_TAB_SEEDS: стакан | заявка | мои заявки + график.
    // Рисуем при этом СИЛУЭТЫ, а не настоящие виджеты: без доступа к брокеру
    // каждый из них показал бы собственную заглушку «разблокируйте токен» —
    // за стеклом стояли бы четыре копии одного и того же сообщения.
    //
    // Призрак — inert (вне фокуса и вне a11y-дерева) и pointer-events:none;
    // цифры в нём выдуманы, и подпись в карточке говорит об этом прямо.

    // бумаги слотов: [тикер, название, цена, шаг, лотность]. Второй стакан
    // не должен быть копией первого — у каждого слота своя бумага
    var PFTG_PAPERS = [
        ['SBER', 'Сбербанк',  268.3,  0.06, 10],
        ['LKOH', 'ЛУКОЙЛ',   7214,    2,     1],
        ['GAZP', 'Газпром',   128.4,  0.04, 10],
        ['ROSN', 'Роснефть',  512.6,  0.2,   1]
    ];
    // ритм лестницы: объёмы и ширины полос, 5 асков сверху + 5 бидов снизу.
    // За блюром важен только он — сами цены считаются от бумаги слота
    var PFTG_VOL = [412, 268, 731, 190, 356, 505, 244, 668, 301, 889];
    var PFTG_BAR = [46, 30, 82, 21, 40, 57, 27, 75, 34, 100];
    function pftgPaper(n) {
        var i = Math.max(0, (Math.floor(+n) || 1) - 1);
        return PFTG_PAPERS[i % PFTG_PAPERS.length];
    }
    function pftgNum(v, d) {
        return (+v || 0).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    function pftgAxRow(px, vol, bar, side, best, d) {
        var half = '<span class="btr-axh"><u style="width:' + Math.min(100, bar + 18) + '%"></u>' +
            '<i style="width:' + bar + '%"></i><em>' + vol + '</em></span>';
        return '<div class="btr-axrow ' + side + (best ? ' best' : '') + '">' +
            (side === 'bid' ? half : '<span class="btr-axh"></span>') + '<b>' + pftgNum(px, d) + '</b>' +
            (side === 'ask' ? half : '<span class="btr-axh"></span>') + '</div>';
    }
    function pftgObCard(n) {
        var p = pftgPaper(n), d = p[3] < 0.01 ? 4 : 2, mid = p[2], st = p[3];
        var rows = '';
        for (var i = 0; i < 5; i++) rows += pftgAxRow(mid + st * (5 - i), PFTG_VOL[i], PFTG_BAR[i], 'ask', i === 4, d);
        rows += '<div class="btr-axmid up"><i class="ar">▲</i><b>' + pftgNum(mid, d) + '</b><em>₽</em>' +
            '<span class="sp">спред <b>' + pftgNum(st * 2, d) + '</b></span></div>';
        for (var j = 0; j < 5; j++) rows += pftgAxRow(mid - st * (j + 1), PFTG_VOL[5 + j], PFTG_BAR[5 + j], 'bid', !j, d);
        return '<div class="dash2-card pf-card2 btr-card btr-ob">' +
            PF.pfCardHead('', 'Стакан · ' + p[0]) +
            '<div class="btr-instr"><b>' + p[0] + '</b><span>' + p[1] + '</span>' +
                '<span class="btr-st ok"><i></i>торги идут</span></div>' +
            '<div class="btr-ax">' +
                '<div class="btr-ax-head"><span>Лоты · спрос</span><span>Цена</span><span>Предложение · лоты</span></div>' +
                rows +
            '</div></div>';
    }
    // поле-цифра тикета: инпуты настоящие (по ним считана вся вёрстка .btr-big),
    // но readonly и вне обхода табом — призрак ничего не принимает
    function pftgBigField(lab, hint, val, suf, ref) {
        return '<div class="btr-bf"><div class="btr-bf-lab">' +
            '<label>' + lab + '<i> · ' + hint + '</i></label>' +
            (ref ? '<span class="btr-ref">рынок <b>' + ref + '</b></span>' : '') + '</div>' +
            '<div class="btr-bigrow"><input class="btr-big" type="text" value="' + val + '" readonly tabindex="-1">' +
            '<span class="btr-big-suf">' + suf + '</span></div></div>';
    }
    function pftgTicketCard(n) {
        var p = pftgPaper(n), d = p[3] < 0.01 ? 4 : 2, lots = 4, sum = p[2] * p[4] * lots;
        return '<div class="dash2-card pf-card2 btr-card btr-ticket">' +
            PF.pfCardHead('', 'Заявка · ' + p[0], null, '<div class="btr-hd-note">' +
                '<span class="btr-hd-acc">Брокерский счёт <b>····4417</b></span>' +
                '<span class="btr-hd-ins">' + p[0] + ' · лот ' + p[4] + '</span></div>') +
            '<div class="btr-tk-body">' +
                '<div class="btr-side">' +
                    '<button type="button" class="btr-side-b buy active" tabindex="-1">Купить</button>' +
                    '<button type="button" class="btr-side-b sell" tabindex="-1">Продать</button></div>' +
                '<div class="btr-ttabs">' +
                    '<button type="button" class="active" tabindex="-1">Лимитная</button>' +
                    '<button type="button" tabindex="-1">Рыночная</button>' +
                    '<button type="button" tabindex="-1">Стоп</button></div>' +
                pftgBigField('Цена', 'шаг ' + pftgNum(p[3], d), pftgNum(p[2], d), '₽', pftgNum(p[2], d) + ' ₽') +
                pftgBigField('Лоты', '1 лот = ' + p[4] + ' шт', lots, '· ' + (lots * p[4]) + ' шт', '') +
                '<div class="btr-deal"><span>Сумма <b>' + pftgNum(sum, 0) + ' ₽</b></span>' +
                    '<span>Комиссия <b>≈ ' + pftgNum(sum * 0.0004, 2) + ' ₽</b></span></div>' +
            '</div>' +
            '<div class="btr-tk-foot"><div class="btr-submit buy">' +
                '<span class="btr-sb-l">Купить ' + lots + ' лота</span>' +
                '<span class="btr-sb-s">' + pftgNum(sum, 0) + ' ₽</span></div></div>' +
        '</div>';
    }
    var PFTG_ORD = [
        ['buy',  'SBER', 'лимитная · 4 лота',    '268,30 ₽',   '10:42 · исполнено 0 из 4'],
        ['sell', 'LKOH', 'лимитная · 1 лот',     '7 214,00 ₽', '10:15 · исполнено 0 из 1'],
        ['buy',  'GAZP', 'стоп-лосс · 12 лотов', '128,40 ₽',   'до отмены']
    ];
    function pftgOrdersCard() {
        return '<div class="dash2-card pf-card2 btr-card btr-orders">' +
            PF.pfCardHead('', 'Мои заявки') +
            '<div class="btr-ords">' + PFTG_ORD.map(function (o) {
                return '<div class="btr-ordrow ' + o[0] + '">' +
                    '<div class="btr-ord1"><b>' + o[1] + '</b>' +
                        '<span class="btr-ord-meta">' + o[2] + '</span>' +
                        '<span class="btr-ord-px">' + o[3] + '</span></div>' +
                    '<div class="btr-ord2"><i>' + o[4] + '</i></div></div>';
            }).join('') + '</div></div>';
    }
    // Свечи призрака: считаются ОДИН раз своим LCG вместо Math.random —
    // призрак обязан быть одинаковым при каждой перерисовке, иначе картинка
    // за стеклом дёргается на каждый ре-рендер вкладки. Значения — проценты
    // высоты поля (0 внизу): [открытие, закрытие, максимум, минимум, объём]
    var PFTG_CANDLES = (function (n) {
        var out = [], seed = 20260719, px = 22;
        function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
        for (var i = 0; i < n; i++) {
            // блуждание с возвратом к тренду: чистый random walk топтался узкой
            // полосой посреди поля и читался пунктиром, а не графиком. Тренд
            // ведёт серию снизу вверх, шум даёт откаты — силуэт «график»
            var trend = 20 + (i / (n - 1)) * 52;
            var o = px, c = clamp(px + (trend - px) * 0.22 + (rnd() - 0.5) * 13, 8, 92);
            // объём привязан к размаху свечи: на широких днях столбик выше —
            // так гистограмма читается вместе со свечами, а не своей жизнью
            var vol = clamp(Math.abs(c - o) * 5 + rnd() * 34 + 8, 8, 100);
            out.push([o, c, Math.min(96, Math.max(o, c) + rnd() * 4.5), Math.max(4, Math.min(o, c) - rnd() * 4.5), vol]);
            px = c;
        }
        return out;
    })(64);
    // Поле делится по высоте: цены живут в верхних PFTG_PX_H процентах, ниже
    // зазор и гистограмма объёма до самого низа. Отсюда ДВА разных перевода
    // «значение → y», и путать их нельзя: свечи и столбики иначе наезжают
    var PFTG_PX_H = 74, PFTG_VOL_H = 22;
    function pftgPxY(v) { return (100 - v) * PFTG_PX_H / 100; }   // цена (0 внизу шкалы) → y
    function pftgChartCard(n) {
        var p = pftgPaper(n), w = 100 / PFTG_CANDLES.length, d = p[3] < 0.01 ? 4 : 2;
        var last = PFTG_CANDLES[PFTG_CANDLES.length - 1][1];
        // шкала цены: середина поля = текущая цена бумаги, края ±10%
        function pxAt(v) { return p[2] * (0.9 + v / 100 * 0.2); }
        // non-scaling-stroke: viewBox тянется непропорционально (preserveAspectRatio
        // none), иначе тени свечей, сетка и пунктир растянулись бы вместе с ним
        var body = PFTG_CANDLES.map(function (c, i) {
            var x = i * w, cx = x + w / 2, up = c[1] >= c[0], bx = (x + w * 0.22).toFixed(2), bw = (w * 0.56).toFixed(2);
            var yTop = pftgPxY(Math.max(c[0], c[1])), yBot = pftgPxY(Math.min(c[0], c[1]));
            var vh = c[4] * PFTG_VOL_H / 100;
            return '<line class="' + (up ? 'up' : 'dn') + '" vector-effect="non-scaling-stroke" x1="' + cx.toFixed(2) +
                    '" y1="' + pftgPxY(c[2]).toFixed(2) + '" x2="' + cx.toFixed(2) + '" y2="' + pftgPxY(c[3]).toFixed(2) + '"/>' +
                '<rect class="' + (up ? 'up' : 'dn') + '" x="' + bx + '" y="' + yTop.toFixed(2) +
                    '" width="' + bw + '" height="' + Math.max(0.7, yBot - yTop).toFixed(2) + '"/>' +
                '<rect class="vol ' + (up ? 'up' : 'dn') + '" x="' + bx + '" y="' + (100 - vh).toFixed(2) +
                    '" width="' + bw + '" height="' + vh.toFixed(2) + '"/>';
        }).join('');
        var LEVELS = [90, 70, 50, 30, 10];
        var grid = LEVELS.map(function (v) {
            var y = pftgPxY(v).toFixed(2);
            return '<line class="gr" vector-effect="non-scaling-stroke" x1="0" y1="' + y + '" x2="100" y2="' + y + '"/>';
        }).join('');
        // линия последней цены — пунктиром через всё поле, как в терминале
        var ly = pftgPxY(last).toFixed(2);
        var lastLine = '<line class="lastpx" vector-effect="non-scaling-stroke" x1="0" y1="' + ly +
            '" x2="100" y2="' + ly + '"/>';
        // Ось цены справа — тем же моно-шрифтом, что и весь терминал. Подписи
        // стоят АБСОЛЮТНО напротив своих линий (space-between развесил бы их по
        // всей высоте карточки, включая полосу объёма), последняя цена — плашкой
        var axis = LEVELS.map(function (v) {
            return '<span style="top:' + pftgPxY(v).toFixed(2) + '%">' + pftgNum(pxAt(v), d) + '</span>';
        }).join('') + '<b style="top:' + ly + '%">' + pftgNum(pxAt(last), d) + '</b>';
        return '<div class="dash2-card pf-card2 btr-card pftg-chart">' +
            PF.pfCardHead('', 'График · ' + p[0], null,
                '<div class="btr-hd-note"><span class="btr-hd-ins">1 день · свечи</span></div>') +
            '<div class="pftg-chart-plot">' +
                // svg — абсолютом внутри .pftg-chart-svg: у viewBox 100×100 своя
                // пропорция 1:1, и в потоке он раздувал карточку до квадрата в
                // полторы тысячи пикселей. Абсолютный слой в разметку не растёт
                '<div class="pftg-chart-svg">' +
                    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
                        grid + body + lastLine + '</svg>' +
                '</div>' +
                '<div class="pftg-chart-ax">' + axis + '</div>' +
            '</div></div>';
    }
    // силуэт любого другого виджета: шапка и строки-скелетоны. Раскладку
    // пользователь мог собрать из чего угодно — форму блока сохраняем, чтобы
    // за стеклом стояла ЕГО вкладка, а не только карточки терминала
    function pftgGenericCard(name) {
        var rows = [92, 74, 84, 62, 78].map(function (w) {
            return '<div class="pftg-sk-row"><i style="width:' + w + '%"></i></div>';
        }).join('');
        return '<div class="dash2-card pf-card2 btr-card pftg-sk">' +
            PF.pfCardHead('', name) + '<div class="pftg-sk-body">' + rows + '</div></div>';
    }
    // id блока → силуэт. Слоты нумерованные ('trade:ob:2'), поэтому хвост-номер
    // отрезаем: вид карточки задают первые два сегмента
    function pftgBlockHtml(id) {
        var seg = String(id).split(':');
        var kind = seg.slice(0, 2).join(':'), n = +seg[2] || 1;
        if (kind === 'trade:ob') return pftgObCard(n);
        if (kind === 'trade:ticket') return pftgTicketCard(n);
        if (kind === 'trade:chart') return pftgChartCard(n);
        if (kind === 'trade:orders') return pftgOrdersCard();
        if (kind === 'trade:pos') return pftgGenericCard('Позиции');
        if (kind === 'note') return pftgGenericCard('Заметка');
        return pftgGenericCard('Виджет');
    }
    // сид на случай, если конструктор недоступен (конфига нет вовсе) —
    // [id, ширина, колонка, высота], зеркало PFX_TAB_SEEDS.trading
    var PFTG_SEED = [['trade:chart', 5, 1, 430], ['trade:ob', 3, 6], ['trade:ticket', 4, 9], ['trade:orders', 12, 1]];
    function pftgGhostHtml() {
        var cfg = null;
        // раскладка АКТИВНОГО экрана: гейт стоит и на втором-третьем экране тоже
        try { cfg = dashCfgFor(pfxIsTradeTab(pfxEffTab()) ? pfxEffTab() : 'trading'); } catch (e) {}
        var rows;
        if (cfg && cfg.order && cfg.order.length) {
            // [id, ширина, колонка, высота] — ровно то, чем живёт настоящая раскладка
            rows = cfg.order.filter(function (id) { return !(cfg.hidden || {})[id]; })
                .map(function (id) {
                    return [id, +(cfg.span || {})[id] || 4, +(cfg.col || {})[id] || 0, +(cfg.h || {})[id] || 0];
                });
        }
        if (!rows || !rows.length) rows = PFTG_SEED.map(function (r) { return [r[0], r[1], r[2] || 0, r[3] || 0]; });
        var items = rows.map(function (r) {
            var span = clamp(r[1], 3, 12), col = r[2], h = r[3];
            // колонку пользователь мог задать перетаскиванием — повторяем её явно
            // (клампом, чтобы col+span не вылезли за 12 и не сломали ряд); в живом
            // терминале то же место считает masonry-пакер, здесь он не нужен
            var place = col ? clamp(col, 1, 13 - span) + ' / span ' + span : 'span ' + span;
            return '<div class="pfd-item' + (h ? ' pfd-hset' : '') + '" style="grid-column: ' + place + ';' +
                (h ? 'height:' + clamp(h, 72, 1400) + 'px;' : '') + '">' +
                '<div class="pfd-body">' + pftgBlockHtml(r[0]) + '</div></div>';
        }).join('');
        return '<div class="pftg-ghost" inert aria-hidden="true">' +
            '<div class="pfd-grid">' + items + '</div></div>';
    }
    // состояние гейта: акцент, надзаголовок-статус, текст и действие.
    // Порядок веток — от «брокера нет вовсе» к «всё есть, но заперто»
    function pftgState(conn) {
        if (!conn) return {
            a: 'idle', eyebrow: 'брокер не подключён', t: 'Торговый терминал',
            s: 'Подключите Т-Инвестиции с уровнем «Торговля» — здесь появятся стакан, тикет заявок и ваши ордера. Для начала хватит и «Только чтения»: виджет «Позиции у брокера» уже работает.',
            b: 'Подключить брокера', go: 'brokerConnect.open()'
        };
        if (conn.scope !== 'trade') return {
            a: 'warn', eyebrow: 'только чтение', t: 'Нужен торговый доступ',
            s: 'Брокер подключён в режиме «Только чтение» — торговать им нельзя, и это правильно для просмотра. Для терминала выпустите у брокера токен с полным доступом и переключите режим в подключении.',
            b: 'Настроить подключение', go: 'brokerConnect.open()'
        };
        if (conn.state === 'revoked') return {
            a: 'bad', eyebrow: 'токен отозван', t: 'Токен не работает',
            s: 'Брокер не принял токен — его отозвали или перевыпустили. Обновите токен в подключении, и терминал вернётся.',
            b: 'Обновить токен', go: 'brokerConnect.open()'
        };
        if (conn.state === 'downgraded') return {
            a: 'warn', eyebrow: 'права урезаны', t: 'Права токена урезали',
            s: 'Токен стал «только для чтения» — торговать им нельзя. Выпустите у брокера токен с полным доступом и обновите его в подключении.',
            b: 'Обновить токен', go: 'brokerConnect.open()'
        };
        var A = window.brokerApi;
        if (A && A.isSessionGone()) return {
            a: 'idle', eyebrow: 'сессия закончилась', t: 'Сессия токена закончилась',
            s: 'Токен не сохранялся («до закрытия вкладки») — вставьте его ещё раз, и терминал вернётся.',
            b: 'Ввести токен', go: 'brokerConnect.open()'
        };
        if (A && A.isLocked()) return {
            a: 'lock', eyebrow: 'заперто PIN-кодом', t: 'Токен под PIN-кодом', lock: true,
            s: 'Ключ от счёта лежит зашифрованным в этом браузере. Введите PIN — и стакан за стеклом станет живым.',
            b: 'Разблокировать', go: 'pfBrokerUnlock()'
        };
        return {
            a: 'idle', eyebrow: 'скоро', t: 'Терминал готовится',
            s: 'Торговое подключение активно' + (conn.sandbox ? ' (песочница)' : '') + ': счёт «' + esc(conn.accountName) +
               '». Стакан, тикет заявок с подтверждением и журнал ордеров — следующий этап, он появится именно здесь.',
            b: 'Управлять подключением', go: 'brokerConnect.open()'
        };
    }
    // замок с отдельной дужкой: .pftg-shk поворачивается вокруг правой ноги
    // (transform-box: fill-box) — на ховере кнопки замок приоткрывается
    var PFTG_LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
        '<path class="pftg-shk" d="M8 11V7.5a4 4 0 0 1 8 0V11"/>' +
        '<rect x="4.2" y="11" width="15.6" height="10" rx="2.8"/><path d="M12 15v2.4"/></svg>';
    function pfxTradingHtml() {
        var A = window.brokerApi;
        var conn = A && A.getConn();
        // терминал открыт — гейта нет (этап 2, portfolios-trading.js в цепочке)
        if (conn && conn.scope === 'trade' && conn.state !== 'revoked' && conn.state !== 'downgraded' &&
            !(A.isLocked() || A.isSessionGone()) && PF.pftTerminalHtml) return PF.pftTerminalHtml();
        var st = pftgState(conn);
        return '<div class="pfd-grid" id="pfdGrid">' +
            '<div class="pftg pftg-a-' + st.a + '" style="grid-column: 1 / span 12">' +
                pftgGhostHtml() +
                '<div class="pftg-veil" aria-hidden="true"></div>' +
                '<div class="pftg-lock"><div class="pftg-card">' +
                    '<div class="pftg-ic">' + PFTG_LOCK_SVG + '</div>' +
                    '<div class="pftg-eyebrow"><i></i>' + esc(st.eyebrow) + '</div>' +
                    '<div class="pftg-t">' + esc(st.t) + '</div>' +
                    '<div class="pftg-s">' + st.s + '</div>' +
                    '<button type="button" class="pftg-btn' + (st.lock ? ' pftg-btn-lock' : '') + '" ' +
                        'onclick="pftGatePeek(this); ' + st.go + '">' +
                        '<span class="pftg-btn-ic">' + PFTG_LOCK_SVG + '</span>' +
                        '<span>' + esc(st.b) + '</span></button>' +
                    '<div class="pftg-fine">За стеклом — как выглядит терминал: цифры для примера.</div>' +
                '</div></div>' +
            '</div></div>';
    }
    // клик по кнопке приоткрывает стекло: блюр на полсекунды спадает — «дверь
    // приотворилась». Удалось разблокировать — подвкладка перерисуется терминалом
    // и класс уедет вместе с узлом; не удалось — снимаем по таймеру
    window.pftGatePeek = function (el) {
        var g = el && el.closest ? el.closest('.pftg') : null;
        if (!g) return;
        g.classList.add('pftg-peek');
        setTimeout(function () { g.classList.remove('pftg-peek'); }, 640);
    };
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
        // Ряд подвкладок ждёт первого портфеля, а герой — НЕТ: у гостя (0 портфелей)
        // панель управления единственное место, где живут «Портфель» и импорт из
        // бэкапа, и без неё вкладка выглядела пустой до первого клика
        if (!pfxWide()) return '';
        var empty = !PF.store.items.length;
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
                '<div class="pfp-sub">' + (empty ? 'пока ни одного портфеля — создайте или импортируйте'
                    : n + ' ' + PF.plural(n, 'портфель', 'портфеля', 'портфелей') + ' · дашборд под рукой') + '</div></div>' +
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
        // «Торговля»: при живом терминале это полноценный конструктор — кнопки
        // «Виджет»/«Раскладки» доступны (двигать/добавлять карточки); пока стоит
        // гейт (нет подключения/только чтение) конфигом управлять нечем — прячем
        var isTrading = pfxIsTradeTab(pfxEffTab()) && !(PF.pftTradeReady && PF.pftTradeReady());
        // конструктором нечего настраивать: и на гейте «Торговли», и у гостя, где
        // вместо дашборда стоит пустое состояние — виджет было бы некуда положить
        var noCfg = isTrading || empty;
        var actions = '<div class="pfp-actions">' +
            (noCfg ? '' : '<button type="button" class="pfp-btn primary" onclick="pfxAddWidgetClick()" title="Добавить виджет на дашборд">' + PFD_PLUS_SVG + '<span>Виджет</span></button>') +
            '<button type="button" class="pfp-btn' + (empty ? ' primary' : '') + '" onclick="pfAddPortfolio()" title="Создать новый портфель">' + PF.PLUS_SVG + '<span>Портфель</span></button>' +
            '<button type="button" class="pfp-btn icon' + (sumsOn ? ' on' : '') + '" onclick="pfxToggleSums()" title="' + (sumsOn ? 'Показать суммы' : 'Скрывать суммы от посторонних глаз') + '">' + (sumsOn ? PFX_LOCK_SVG : PFX_UNLOCK_SVG) + '</button>' +
            PF.eyeWrapHtml() +
            PF.backupWrapHtml() +
            // R8: кнопка-слайдеры открывает ПАНЕЛЬ «Раскладки» (pfl3) текущей подвкладки —
            // пресеты с эскизами, базовая, своя сохранённая; прежний поповер остался
            // только в шапке страницы (index.html) как быстрый доступ
            (noCfg ? '' : '<span class="pfl-cfg-wrap pfp-cfg' + (PF.pfl3Open ? ' active' : '') + '" style="display:inline-flex">' +
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
