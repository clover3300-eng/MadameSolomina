// ===== «ПОРТФЕЛИ» · ПОДВКЛАДКИ И ПАРЯЩИЕ УЗЛЫ (модуль цепочки #pfLazySrc) =====
// R7-редизайн вкладки: парящие узлы управления (pfxFabSync), ряд подвкладок
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
    var DASH_KEY = PF.DASH_KEY, DASH_TABS_KEY = PF.DASH_TABS_KEY, PFD_PLUS_SVG = PF.PFD_PLUS_SVG, dashCfgFor = PF.dashCfgFor, pfTabCfgs = PF.pfTabCfgs;
    var pfTabsStore = PF.pfTabsStore, pfdInChromeHtml = PF.pfdInChromeHtml, pfdScrollToBlock = PF.pfdScrollToBlock, pfdStandardCfg = PF.pfdStandardCfg, pfxEffTab = PF.pfxEffTab, pfxIsPfTab = PF.pfxIsPfTab;
    var pfxSyncCfg = PF.pfxSyncCfg, saveDashCfg = PF.saveDashCfg, updateLayoutBtn = PF.updateLayoutBtn;
    var pfxIsTradeTab = PF.pfxIsTradeTab, pfxTradeAlive = PF.pfxTradeAlive, pfxTradeNo = PF.pfxTradeNo;
    // импорт виджетов (portfolios-widgets.js, уже загружен):
    var PFP_SLIDERS_SVG = PF.PFP_SLIDERS_SVG;
    // ====================================================================
    //  R7 — РЕДИЗАЙН ВКЛАДКИ: тёмный герой-шапка, подвкладки, новые виджеты,
    //  пикер «Добавить виджет» с демо-превью, настройка скруглений карточек.
    // ====================================================================
    // ---- подвкладки (Обзор | Портфели | Аналитика | Отчёты | Операции | Настройки) ----
    // [ключ, подпись]. Иконок у пунктов НЕТ (убраны 2026-07-20): восемь значков в ряд
    // читались шумом — каждый тянул на себя внимание, а узнавался ряд всё равно по
    // подписям. Ряд стал чисто типографическим, поэтому кегль подписи подрос
    // (13,5→14,5px), а начертание, наоборот, стало легче (700→600) — см. .pfx-tab:
    // жирный при таком размере превращал строку в сплошную тёмную полосу.
    var PFX_TABS = [
        ['overview',  'Обзор'],
        // «Мои портфели», не «Портфели»: вкладка сайдбара уже зовётся «Портфели» —
        // одинаковая подпись уровнем ниже читалась тавтологией (просьба 2026-07-15)
        ['ports',     'Мои портфели'],
        ['analytics', 'Аналитика'],
        ['reports',   'Отчёты'],
        // «Дивиденды» убраны 2026-07-24: отдельного раздела под них больше нет —
        // виджеты выплат («Дивиденды и купоны», «Календарь выплат», «Пассивный
        // доход», «Ближайшая выплата») остались в пикере и ставятся на любую вкладку
        ['ops',       'Операции'],
        // «Ребаланс» — пошаговый мастер (rebalance-wizard.js): выбор портфеля →
        // режим → расчёт выгодной сделки → заявка. Ключ 'rebal', НЕ 'rebalance'
        // (последний занят top-level вкладкой сайдбара). Подпись «Ребаланс».
        ['rebal',     'Ребаланс'],
        // «Торговля» — терминал этапа 2 (стакан/тикет/заявки); пока рендерит
        // гейт-карточку по состоянию подключения брокера (pfxTradingHtml)
        ['trading',   'Торговля'],
        ['settings',  'Настройки']
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
    // шестерёнка «Настроек» — с 2026-07-21 подвкладка рендерится иконкой, а с
    // 2026-07-22 живёт не в ряду, а в ПРАВОМ кластере шапки сразу за «Поиском»
    // (кнопка #pfGearBtn, скин звоночка #nfBell): это конфиг, а не восьмой вид
    // данных, и в кластере действий ему место честнее, чем в ряду разделов
    var PFX_GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/></svg>';
    // подвкладки, живущие РЯДОМ (без «Настроек» — они ушли в шестерёнку шапки)
    function pfxRowTabs() { return PFX_TABS.filter(function (t) { return t[0] !== 'settings'; }); }

    // ================= МОДЕЛЬ БОКОВОЙ КОЛОНКИ (сайдбар «Подъём») =================
    // С этой правкой второй уровень «Портфелей» живёт НЕ в шапке, а в колонке
    // сайдбара (js/sidebar-ctx.js рисует, мы отдаём данные). Сюда переехали:
    // ряд подвкладок (был #topBarPfMarket), шестерёнка «Настроек» (была в правом
    // кластере шапки), список открытых вкладок-портфелей (был попапом на пилюле)
    // и экраны «Торговли» третьим уровнем (полоса внизу экрана осталась).
    //
    // Числа только ЧЕСТНЫЕ: счётчик появляется, когда его есть откуда взять, а
    // дневное изменение портфеля — лишь при наличии вчерашнего снимка (dayDelta
    // возвращает null, пока снимка нет; выдумывать проценты нельзя).
    function pfxSideCount(key) {
        try {
            if (key === 'ports') return PF.store.items.length || null;
            if (key === 'ops') {
                var n = PF.collectTrades ? PF.collectTrades(true).length : 0;
                return n || null;
            }
            if (key === 'trading') {
                var s = PF.pfxTradeTabs ? PF.pfxTradeTabs().length : 0;
                return s > 1 ? s : null;      // один экран — не число, а данность
            }
        } catch (e) {}
        return null;
    }
    // дневное изменение портфеля в процентах (или null — снимка ещё нет)
    function pfxSideDay(p, value) {
        var d = dayDelta(p, value);
        if (d == null) return null;
        var base = value - d;
        if (!(base > 0)) return null;
        var pct = d / base * 100;
        if (!isFinite(pct)) return null;
        return { tx: (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1).replace('.', ',') + '%', neg: pct < 0 };
    }
    PF.sbSideModel = function () {
        if (!pfxWide()) return null;              // на мобиле колонки нет вовсе
        var eff = pfxEffTab();
        var items = PF.store.items;
        // шапка колонки: капитал и его изменение за день — суммарно по ВСЕМ
        // портфелям (скрытые тоже считаются: деньги никуда не деваются)
        var total = 0, day = 0, dayKnown = false;
        items.forEach(function (p) {
            var c = calcPf(p);
            total += c.value;
            var d = dayDelta(p, c.value);
            if (d != null) { day += d; dayKnown = true; }
        });
        var chip = null;
        if (dayKnown && total - day > 0) {
            var pct = day / (total - day) * 100;
            if (isFinite(pct)) chip = { tx: (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1).replace('.', ',') + '%', neg: pct < 0 };
        }
        // ---- разделы ----
        var secs = [];
        pfxRowTabs().forEach(function (t) {
            var key = t[0];
            var on = key === 'trading' ? pfxIsTradeTab(eff) : eff === key;
            secs.push({
                act: key === 'trading' ? 'trading' : 'pfx', key: key, tx: t[1],
                icon: null, iconKey: key, on: on, n: pfxSideCount(key)
            });
            // экраны «Торговли» — третий уровень, разворачивается на своём разделе
            if (key === 'trading' && on) {
                var tabs = PF.pfxTradeTabs ? PF.pfxTradeTabs() : ['trading'];
                if (tabs.length > 1) {
                    tabs.forEach(function (tt) {
                        secs.push({
                            act: 'pfx', key: tt, cls: 'lvl3',
                            tx: (PF.pfxTradeName && PF.pfxTradeName(tt)) || 'Основной',
                            on: eff === tt
                        });
                    });
                }
            }
        });
        // ---- открытые вкладки-портфели ----
        var curPid = pfxIsPfTab(eff) ? eff.slice(3) : null;
        var ports = pfxOpenPfTabs.map(findPf).filter(Boolean).map(function (p) {
            var c = calcPf(p);
            return {
                act: 'pf', key: p.id, tx: p.name, dot: colorVal(p.color),
                on: curPid === p.id, cls: p.hidden ? 'dim' : '',
                title: p.name + ' · ' + fmtRub(c.value),
                chg: pfxSideDay(p, c.value),
                close: { act: 'pf-close', key: p.id }
            };
        });
        ports.push({ act: 'pf-new', key: '', tx: 'Новый портфель', iconKey: 'plus', cls: 'gh' });
        var groups = [{ label: 'Разделы', items: secs }];
        groups.push({ label: 'Открытые портфели', items: ports });
        return {
            title: 'Портфели',
            cap: items.length ? fmtRub(total) : null,
            chip: chip,
            groups: groups,
            foot: { act: 'pfx', key: 'settings', tx: 'Настройки', iconKey: 'settings', on: eff === 'settings' }
        };
    };
    // Ряд подвкладок. С 2026-07-21 живёт НЕ на странице, а в середине глобальной
    // шапки (#topBarPfMarket, наполняет renderTopBarMarket в portfolios.js), прижат
    // К ПИЛЮЛЕ раздела: на широком экране центрирование уводило ряд на середину
    // пустой середины, и он читался оторванным от «Все портфели» рядом.
    // Чипов открытых портфелей в ряду больше нет — портфели переехали в выпадающий
    // список на пилюле раздела (#topBarCrumb, см. pfxCrumbSync ниже). Переполнение
    // решает не скролл, а свёртка хвоста в «⋯» (pfxTabsFit).
    function pfxTabsHtml() {
        if (!PF.store.items.length || !pfxWide()) return '';
        // подсветка — по ЭФФЕКТИВНОЙ вкладке: когда вкладка-портфель временно не живёт
        // (портфель скрыли, остался один видимый) контент показывает «Обзор» — активная
        // метка обязана показывать то же, иначе ряд остаётся «без выбранного»
        var eff = pfxEffTab();
        var tabs = pfxRowTabs();
        // roving tabindex: когда активны «Настройки» или вкладка-портфель, в ряду нет
        // «своей» кнопки — точкой входа Tab остаётся «Обзор», иначе ряд выпал бы из
        // обхода целиком
        var rowHasOn = tabs.some(function (t) { return t[0] === 'trading' ? pfxIsTradeTab(eff) : eff === t[0]; });
        // R9.5: честный tablist — roving tabindex (в Tab-обходе ровно одна вкладка,
        // остальное стрелками, см. pfxTabsKeydown), aria-controls ведёт на
        // #pfxTabPanel (обёртка контента, pfxPanelWrap)
        return '<div class="pfx-tabs" role="tablist" aria-label="Разделы «Портфелей»">' + tabs.map(function (t) {
            // «Торговля» подсвечена на ЛЮБОМ своём экране (trading:2 и далее): экраны —
            // это её внутренний ряд внизу, а не отдельные пункты верхнего ряда. Клик
            // возвращает на последний открытый экран, а не сбрасывает на первый
            var on = t[0] === 'trading' ? pfxIsTradeTab(eff) : eff === t[0];
            var go = t[0] === 'trading' ? 'pfxGoTrading()' : 'pfxGoTab(\'' + t[0] + '\')';
            var ti = on || (!rowHasOn && t[0] === 'overview') ? '0' : '-1';
            return '<button type="button" role="tab" id="pfxTab-' + t[0] + '" aria-controls="pfxTabPanel" tabindex="' + ti + '" class="pfx-tab' + (on ? ' on' : '') + '" aria-selected="' + on + '" onclick="' + go + '">' +
                t[1] + '</button>';
        }).join('') +
            // «⋯» — хвост ряда, свёрнутый по нехватке ширины (pfxTabsFit); кнопка
            // появляется только когда есть что прятать. Обёртка — позиционный якорь меню
            '<span class="pfx-morewrap">' +
                '<button type="button" class="pfx-more" id="pfxTabsMore" aria-haspopup="menu" aria-expanded="false" aria-label="Ещё разделы" title="Ещё разделы" hidden>⋯</button>' +
                '<div class="pfx-morepop" id="pfxTabsMorePop" role="menu" aria-label="Ещё разделы"></div>' +
            '</span>' +
        '</div>';
    }
    // ---- шестерёнка «Настроек» в правом кластере шапки (сразу за «Поиском») ----
    // Кнопка живёт вне ленивой цепочки — как и слот ряда, создаётся по месту и
    // переживает свопы (меняем только класс активности и aria). Роли tab у неё
    // НЕТ: вне tablist она была бы невалидна — обычная кнопка-переключатель с
    // aria-pressed. Id сохранён (#pfxTab-settings): на него ссылается
    // aria-labelledby панели контента, когда открыты «Настройки».
    function pfxGearSync() {
        var host = document.getElementById('topBarActions');
        var anchor = document.getElementById('topSearchBtn');
        var gear = document.getElementById('pfxTab-settings');
        // Шестерёнка в кластере шапки БОЛЬШЕ НЕ НУЖНА: «Настройки» вернулись в
        // навигацию — они прижаты к низу колонки сайдбара (PF.sbSideModel.foot).
        // Функция осталась снимающей: у кого кнопка уже висит в живой вкладке,
        // тот получит её удаление на первом же рендере.
        var need = false;
        if (!need) { if (gear) gear.remove(); return; }
        if (!host || !anchor) return;
        if (!gear) {
            gear = document.createElement('button');
            gear.type = 'button';
            gear.id = 'pfxTab-settings';
            gear.className = 'pfx-gearbtn';
            gear.title = 'Настройки «Портфелей»';
            gear.setAttribute('aria-label', 'Настройки «Портфелей»');
            gear.innerHTML = PFX_GEAR_SVG;
            gear.addEventListener('click', function () { window.pfxGoTab('settings'); });
            // сразу ЗА «Поиском»: nextSibling у якоря — тема/звоночек/аватар
            host.insertBefore(gear, anchor.nextSibling);
        }
        var on = pfxEffTab() === 'settings';
        gear.classList.toggle('on', on);
        gear.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // R9.5: контент под рядом — настоящий tabpanel: aria-controls вкладок ведёт
    // сюда, aria-labelledby называет активную. Оборачиваем только когда ряд
    // вообще есть (широкий экран, есть портфели) — на мобильном ролей нет
    function pfxPanelWrap(inner) {
        var eff = pfxEffTab();
        // вкладку-портфель в ряду больше ничто не представляет (чипы уехали в список
        // на пилюле) — панель называем напрямую: aria-labelledby указывал бы в пустоту
        if (pfxIsPfTab(eff)) {
            var p = findPf(eff.slice(3));
            return '<div id="pfxTabPanel" role="tabpanel" aria-label="Дашборд портфеля «' + attr(p ? p.name : '') + '»">' + inner + '</div>';
        }
        // Ряда подвкладок в шапке больше нет — второй уровень уехал в колонку
        // сайдбара (PF.sbSideModel + js/sidebar-ctx.js), кнопок #pfxTab-* в
        // документе не осталось. aria-labelledby указывал бы в пустоту, поэтому
        // панель называем НАПРЯМУЮ подписью активной подвкладки.
        var slug = pfxIsTradeTab(eff) ? 'trading' : eff;
        var nm = '';
        for (var i = 0; i < PFX_TABS.length; i++) if (PFX_TABS[i][0] === slug) { nm = PFX_TABS[i][1]; break; }
        if (pfxIsTradeTab(eff) && PF.pfxTradeName) {
            var sn = PF.pfxTradeName(eff);
            if (sn) nm += ' · ' + sn;
        }
        return '<div id="pfxTabPanel" role="tabpanel" aria-label="' + attr(nm || 'Портфели') + '">' + inner + '</div>';
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
            '<div class="btr-instr"><b>' + p[0] + '</b><span class="btr-iname">' + p[1] + '</span>' +
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
    // ---- свёртка ряда в «⋯» (2026-07-21, взамен горизонтального скролла) ----
    // Ряд живёт в середине шапки, где места впритык (1280 + развёрнутый сайдбар +
    // вход = 515px): показываем всё, меряем и прячем подвкладки С КОНЦА, пока ряд
    // не влезет. «Обзор» не прячется никогда, шестерёнка — тоже; скрытое —
    // пунктами меню «⋯». Пересчёт — после каждого рендера и на ресайз слота.
    function pfxTabsFit() {
        var host = document.getElementById('topBarPfMarket');
        var row = host && host.querySelector('.pfx-tabs');
        if (!row || !host.offsetWidth) return;
        var more = row.querySelector('#pfxTabsMore');
        var pop = row.querySelector('#pfxTabsMorePop');
        if (!more || !pop) return;
        var tabs = Array.prototype.slice.call(row.querySelectorAll('.pfx-tab'));
        tabs.forEach(function (b) { b.hidden = false; });
        more.hidden = true;
        var GAP = 2;   // gap ряда (см. .pfx-tabs)
        var avail = row.clientWidth;
        var w = tabs.map(function (b) { return b.offsetWidth + GAP; });
        var need = w.reduce(function (a, b) { return a + b; }, 0);
        var hid = [];
        if (need > avail) {
            more.hidden = false;
            avail -= more.offsetWidth + GAP;
            for (var i = tabs.length - 1; i >= 1 && need > avail; i--) {
                tabs[i].hidden = true; hid.unshift(i); need -= w[i];
            }
        }
        pop.innerHTML = hid.map(function (i) {
            var b = tabs[i], key = b.id.slice(7);   // 'pfxTab-'.length
            var go = key === 'trading' ? 'pfxGoTrading()' : 'pfxGoTab(\'' + key + '\')';
            return '<button type="button" role="menuitem" class="pfx-moreit' + (b.classList.contains('on') ? ' on' : '') + '"' +
                ' onclick="pfxMoreClose();' + go + '">' + b.textContent + '</button>';
        }).join('');
        // всё разом влезло — открытое меню теряет смысл (и содержимое)
        if (!hid.length) window.pfxMoreClose();
    }
    function pfxMoreToggle() {
        var more = document.getElementById('pfxTabsMore'), pop = document.getElementById('pfxTabsMorePop');
        if (!more || !pop) return;
        var on = !pop.classList.contains('on');
        pop.classList.toggle('on', on);
        more.classList.toggle('open', on);
        more.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    window.pfxMoreClose = function () {
        var more = document.getElementById('pfxTabsMore'), pop = document.getElementById('pfxTabsMorePop');
        if (pop) pop.classList.remove('on');
        if (more) { more.classList.remove('open'); more.setAttribute('aria-expanded', 'false'); }
    };
    // Синк ряда после рендера (имя историческое — прежний ряд скроллился, этот
    // складывается). Ряд пересоздаётся innerHTML-свопом — слушатели по флагу на
    // элементе; ResizeObserver висит на СЛОТЕ шапки (он переживает свопы).
    function pfxTabsScrollSync() {
        var host = document.getElementById('topBarPfMarket');
        if (!host) return;
        var row = host.querySelector('.pfx-tabs');
        if (!row) return;
        if (!row._pfxBound) {
            row._pfxBound = true;
            row.addEventListener('keydown', pfxTabsKeydown);
            var more = row.querySelector('#pfxTabsMore');
            if (more) more.addEventListener('click', function (e) { e.stopPropagation(); pfxMoreToggle(); });
        }
        if (!host._pfxRo && window.ResizeObserver) {
            // ЛОВУШКА: обработчик, меняющий размер наблюдаемого узла, зацикливает
            // ResizeObserver и вешает вкладку без единой ошибки в консоли.
            // Гвард — выходим, пока ШИРИНА слота не изменилась (высоту не смотрим)
            host._pfxRoW = -1;
            host._pfxRo = new ResizeObserver(function () {
                var w = host.clientWidth;
                if (w === host._pfxRoW) return;
                host._pfxRoW = w;
                pfxTabsFit();
            });
            host._pfxRo.observe(host);
            // поздний Inter меняет ширину подписей, а слот при этом не ресайзится
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { pfxTabsFit(); });
        }
        pfxTabsFit();
    }
    // ---- R9.5: клавиатура ряда вкладок (паттерн tablist, «ручная активация») ----
    // Стрелки ←/→ и Home/End гуляют ФОКУСОМ по вкладкам (roving tabindex), Enter/
    // Space активируют (нативный клик кнопки) — без ре-рендера на каждый шаг.
    // Спрятанные свёрткой подвкладки ([hidden]) в обходе не участвуют.
    function pfxTabsKeydown(e) {
        var row = e.currentTarget;
        var cur = e.target && e.target.closest ? e.target.closest('.pfx-tab') : null;
        if (!cur) return;
        var tabs = Array.prototype.filter.call(row.querySelectorAll('.pfx-tab'), function (b) { return !b.hidden; });
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

    // ==================================================================
    //  СЕЛЕКТОР ПОРТФЕЛЕЙ НА ПИЛЮЛЕ РАЗДЕЛА (#topBarCrumb), 2026-07-21
    // ==================================================================
    // Чипы открытых вкладок-портфелей переехали из ряда в выпадающий список:
    // пилюля «Портфели» в шапке становится селектором (точка, имя области,
    // счётчик, шеврон). Всё, что умели чипы, умеет список: открыть (pfxOpenPf),
    // закрыть с отменой (pfxClosePfTab), путь к скрытому (pfEyeOpenTab),
    // перетаскивание порядка (pf_open_tabs_v1, формат прежний), Ctrl/Cmd+стрелки.
    // Бейдж раздела (renderHeaderBadge, sidebar.js) НЕ трогаем — селектор
    // дописывается рядом, а .hdr-chip/.hdr-sec прячет CSS только на десктопе:
    // при ресайзе в мобильную ширину пилюля сама возвращается к обычному виду.
    var pfxSelOn = false;
    var PFX_GRIP_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
    var PFX_CHEV_SVG = '<svg class="pfsel-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    var PFX_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    // содержимое пилюли: активная вкладка-портфель — его цвет и имя; иначе
    // «Все портфели» со счётчиком. Единственный портфель показываем по имени —
    // его дашборд и есть «Обзор», надпись «Все портфели» тут врала бы
    function pfxCrumbSelHtml() {
        var n = PF.store.items.length;
        if (!n) return '<span class="pfsel-nm">Портфели</span>' + PFX_CHEV_SVG;
        var eff = pfxEffTab();
        var cur = pfxIsPfTab(eff) ? findPf(eff.slice(3)) : null;
        if (!cur && n === 1) cur = PF.store.items[0];
        return '<span class="pfsel-dot" style="background:' + (cur ? colorVal(cur.color) : '#4453ef') + '" aria-hidden="true"></span>' +
            '<span class="pfsel-nm">' + esc(cur ? cur.name : 'Все портфели') + '</span>' +
            '<i class="pfsel-cnt">' + n + '</i>' + PFX_CHEV_SVG;
    }
    // строки списка: сперва ОТКРЫТЫЕ вкладки в своём порядке (pf_open_tabs_v1) —
    // только их можно перетаскивать, — затем остальные портфели по порядку данных
    function pfxCrumbPopHtml() {
        var items = PF.store.items;
        var add = '<button type="button" role="menuitem" class="pfp-it pfp-add" data-add="1">' + PF.PLUS_SVG + '<span>Новый портфель</span></button>';
        if (!items.length) return add;
        var eff = pfxEffTab();
        var curPid = pfxIsPfTab(eff) ? eff.slice(3) : null;
        var openSet = {};
        var ordered = pfxOpenPfTabs.map(function (pid) { openSet[pid] = 1; return findPf(pid); }).filter(Boolean)
            .concat(items.filter(function (p) { return !openSet[p.id]; }));
        var rows = ordered.map(function (p) {
            var isOpen = !!openSet[p.id], on = curPid === p.id;
            var c = calcPf(p);
            // строка — <button> с span-инструментами role=button (вложенный <button>
            // невалиден) — тот же приём, что был у чипов и есть у .pf-impitem
            return '<button type="button" role="menuitem" class="pfp-it pfp-row' + (on ? ' on' : '') + (p.hidden ? ' dim' : '') + '"' +
                ' data-pid="' + attr(p.id) + '"' + (isOpen ? ' data-open="1" draggable="true"' : '') +
                ' title="' + (p.hidden ? 'Открыть вкладку скрытого портфеля' : 'Открыть портфель') + '">' +
                '<span class="pfp-grab' + (isOpen ? '' : ' off') + '" aria-hidden="true">' + PFX_GRIP_SVG + '</span>' +
                '<span class="pfp-dot" style="background:' + colorVal(p.color) + '" aria-hidden="true"></span>' +
                '<span class="pfp-bd"><span>' + esc(p.name) + '</span><i>' + fmtRub(c.value) + (p.hidden ? ' · скрыт' : '') + '</i></span>' +
                '<span class="pfp-tools">' +
                    (on ? '<span class="pfp-check" aria-hidden="true">' + PFX_CHECK_SVG + '</span>' : '') +
                    '<span class="pfp-tl" role="button" tabindex="0" data-eye="' + attr(p.id) + '" title="' + (p.hidden ? 'Показать на «Обзоре»' : 'Скрыть с «Обзора»') + '" aria-label="' + (p.hidden ? 'Показать портфель' : 'Скрыть портфель') + '">' + (p.hidden ? PF.EYEOFF_SVG : PF.EYE_SVG) + '</span>' +
                    (isOpen ? '<span class="pfp-tl pfp-x" role="button" tabindex="0" data-x="' + attr(p.id) + '" title="Закрыть вкладку" aria-label="Закрыть вкладку">' + PF.XMARK_SVG + '</span>' : '') +
                '</span>' +
            '</button>';
        }).join('');
        return '<div class="pfp-grp"><span>Показывать</span></div>' +
            '<button type="button" role="menuitem" class="pfp-it pfp-all' + (!curPid ? ' on' : '') + '" data-all="1">' +
                '<span class="pfp-dot" style="background:#4453ef" aria-hidden="true"></span>' +
                '<span class="pfp-bd"><span>Все портфели</span><i>сводный обзор</i></span>' +
                (!curPid ? '<span class="pfp-tools"><span class="pfp-check" aria-hidden="true">' + PFX_CHECK_SVG + '</span></span>' : '') +
            '</button>' +
            '<hr class="pfp-hr">' +
            '<div class="pfp-grp"><span>Портфели</span><span>' + items.length + '</span></div>' +
            rows +
            '<hr class="pfp-hr">' + add;
    }
    function pfxSelSetOpen(on) {
        pfxSelOn = !!on;
        var sel = document.getElementById('pfCrumbSel'), pop = document.getElementById('pfCrumbPop');
        if (sel) sel.setAttribute('aria-expanded', pfxSelOn ? 'true' : 'false');
        if (pop) pop.classList.toggle('on', pfxSelOn);
    }
    function pfxSelToggle() {
        pfxSelSetOpen(!pfxSelOn);
        if (pfxSelOn) {
            var pop = document.getElementById('pfCrumbPop');
            var f = pop && (pop.querySelector('.pfp-it.on') || pop.querySelector('.pfp-it'));
            if (f) { try { f.focus(); } catch (e) {} }
        }
    }
    function pfxSelClose() { if (pfxSelOn) pfxSelSetOpen(false); }
    // клик по строке: открыть портфель (та же логика, что у строк «Моих портфелей» —
    // pfxOpenPf сам решает про одиночку и «Обзор»); скрытому — pfEyeOpenTab,
    // единственный путь к нему. Глазок и крестик оставляют список открытым
    function pfxSelPopClick(e) {
        e.stopPropagation();
        var t = e.target;
        if (!t || !t.closest) return;
        var eye = t.closest('[data-eye]');
        if (eye) { window.pfToggleHidden(eye.getAttribute('data-eye'), e); return; }
        var x = t.closest('[data-x]');
        if (x) { window.pfxClosePfTab(x.getAttribute('data-x'), e); return; }
        if (t.closest('[data-add]')) { pfxSelClose(); window.pfAddPortfolio(); return; }
        if (t.closest('[data-all]')) { pfxSelClose(); window.pfxGoTab('overview'); return; }
        var row = t.closest('.pfp-row');
        if (row) {
            var pid = row.getAttribute('data-pid'), p = findPf(pid);
            if (!p) return;
            pfxSelClose();
            if (p.hidden) window.pfEyeOpenTab(pid);
            else window.pfxOpenPf(pid);
        }
    }
    // клавиатура списка: ↑/↓ и Home/End гуляют фокусом, Ctrl/Cmd+стрелка двигает
    // ОТКРЫТУЮ вкладку в pf_open_tabs_v1 (клавиатурный аналог перетаскивания;
    // ←/→ оставлены как синонимы — жест переехал из горизонтального ряда)
    function pfxSelPopKeydown(e) {
        var pop = e.currentTarget;
        var cur = e.target && e.target.closest ? e.target.closest('.pfp-it') : null;
        if (!cur) return;
        var arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if ((e.ctrlKey || e.metaKey) && cur.getAttribute('data-open') && arrows.indexOf(e.key) >= 0) {
            e.preventDefault();
            pfxMoveOpenTab(cur.getAttribute('data-pid'), (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1);
            return;
        }
        var items = Array.prototype.slice.call(pop.querySelectorAll('.pfp-it'));
        var i = items.indexOf(cur);
        if (i < 0) return;
        var to = null;
        if (e.key === 'ArrowDown') to = items[(i + 1) % items.length];
        else if (e.key === 'ArrowUp') to = items[(i - 1 + items.length) % items.length];
        else if (e.key === 'Home') to = items[0];
        else if (e.key === 'End') to = items[items.length - 1];
        if (!to) return;
        e.preventDefault();
        to.focus();
    }
    // передвинуть открытую вкладку на позицию вверх/вниз; фокус остаётся на её
    // строке (список пересоздан рендером — находим по data-pid заново)
    function pfxMoveOpenTab(pid, dir) {
        var i = pfxOpenPfTabs.indexOf(pid);
        if (i < 0) return;
        var j = i + dir;
        if (j < 0 || j >= pfxOpenPfTabs.length) return;
        var tmp = pfxOpenPfTabs[i]; pfxOpenPfTabs[i] = pfxOpenPfTabs[j]; pfxOpenPfTabs[j] = tmp;
        pfxSaveOpenTabs();
        PF.renderNoAnim();
        var el = document.querySelector('#pfCrumbPop .pfp-row[data-pid="' + pid + '"]');
        if (el) { try { el.focus(); } catch (e) {} }
    }
    // ---- перетаскивание строк списка — свой порядок открытых вкладок ----
    // HTML5 DnD c делегированием на попапе (строки пересоздаются каждый рендер,
    // попап — нет). Порядок в pfxOpenPfTabs (pf_open_tabs_v1, формат прежний);
    // цель вставки — по серединам соседних ОТКРЫТЫХ строк, каретка — черта у цели
    var pfxDragPid = null;
    function pfxBindListDnd(pop) {
        function clearDropMarks() {
            var marked = pop.querySelectorAll('.pfp-drop-before, .pfp-drop-after');
            for (var i = 0; i < marked.length; i++) marked[i].classList.remove('pfp-drop-before', 'pfp-drop-after');
        }
        pop.addEventListener('dragstart', function (e) {
            var row = e.target && e.target.closest ? e.target.closest('.pfp-row[data-open]') : null;
            if (!row) return;
            pfxDragPid = row.getAttribute('data-pid');
            row.classList.add('drag');
            try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', pfxDragPid); } catch (err) {}
        });
        pop.addEventListener('dragend', function () {
            pfxDragPid = null;
            clearDropMarks();
            var r = pop.querySelector('.pfp-row.drag'); if (r) r.classList.remove('drag');
        });
        pop.addEventListener('dragover', function (e) {
            if (!pfxDragPid) return;
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
            var rows = pop.querySelectorAll('.pfp-row[data-open]');
            var before = null, last = null;
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].getAttribute('data-pid') === pfxDragPid) continue;
                last = rows[i];
                var r = rows[i].getBoundingClientRect();
                if (!before && e.clientY < r.top + r.height / 2) before = rows[i];
            }
            clearDropMarks();
            if (before) before.classList.add('pfp-drop-before');
            else if (last) last.classList.add('pfp-drop-after');
        });
        pop.addEventListener('drop', function (e) {
            if (!pfxDragPid) return;
            e.preventDefault();
            clearDropMarks();
            var pid = pfxDragPid; pfxDragPid = null;
            // перед КАКОЙ строкой бросили: первая, чья середина ниже курсора
            var before = null;
            var rows = pop.querySelectorAll('.pfp-row[data-open]');
            for (var i = 0; i < rows.length; i++) {
                var cp = rows[i].getAttribute('data-pid');
                if (cp === pid) continue;
                var r = rows[i].getBoundingClientRect();
                if (e.clientY < r.top + r.height / 2) { before = cp; break; }
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
    // Синк селектора — из renderPortfolios на каждый рендер. Узлы дописываются в
    // пилюлю ОДИН раз и наполняются свопом только при изменении HTML (фоновый тик
    // котировок не должен закрывать открытый список и рвать hover). При смене
    // вкладки сайта renderHeaderBadge пересобирает пилюлю с нуля — узлы селектора
    // уходят вместе с innerHTML, класс .pf-sel-on снимает обёртка switchTab
    // renderHeaderBadge (sidebar.js) и переименование вкладок (tab-gates.js) могут
    // пересобрать пилюлю innerHTML-ом В ЛЮБОЙ момент — в том числе спустя секунды
    // после входа (поздний конфиг гейтов). Узлы селектора сносятся вместе с
    // разметкой, а следующего рендера может не быть (пустые портфели не тикают) —
    // наблюдатель возвращает селектор, пока открыты «Портфели» на широком экране
    var pfxCrumbMo = null;
    function pfxCrumbWatch(crumb) {
        if (pfxCrumbMo || !window.MutationObserver) return;
        pfxCrumbMo = new MutationObserver(function () {
            if (typeof currentTab === 'undefined' || currentTab !== 'portfolios') return;
            if (!pfxWide() || document.getElementById('pfCrumbSel')) return;
            // микропаузой — дать пересборке пилюли закончиться одним куском
            setTimeout(function () {
                if (typeof currentTab !== 'undefined' && currentTab === 'portfolios' &&
                    !document.getElementById('pfCrumbSel')) pfxCrumbSync();
            }, 0);
        });
        pfxCrumbMo.observe(crumb, { childList: true });
    }
    function pfxCrumbSync() {
        var crumb = document.getElementById('topBarCrumb');
        if (!crumb) return;
        // Селектор портфелей на пилюле СНЯТ: открытые вкладки-портфели переехали
        // в колонку сайдбара («Открытые портфели»), а пилюля вернулась к честной
        // крошке раздела «Портфели». Ветка ниже снимает узлы и класс — тем, у
        // кого они уже стоят в живой вкладке.
        var legacyOff = true;
        if (legacyOff || !pfxWide()) {
            crumb.classList.remove('pf-sel-on');
            var s0 = document.getElementById('pfCrumbSel'); if (s0) s0.remove();
            var p0 = document.getElementById('pfCrumbPop'); if (p0) p0.remove();
            return;
        }
        crumb.classList.add('pf-sel-on');
        var sel = document.getElementById('pfCrumbSel');
        if (!sel) {
            sel = document.createElement('button');
            sel.type = 'button';
            sel.id = 'pfCrumbSel';
            sel.setAttribute('aria-haspopup', 'menu');
            sel.setAttribute('aria-expanded', 'false');
            sel.title = 'Портфели: выбрать область';
            sel.addEventListener('click', function (e) { e.stopPropagation(); pfxSelToggle(); });
            crumb.appendChild(sel);
        }
        var pop = document.getElementById('pfCrumbPop');
        if (!pop) {
            // узлы пересоздаются после каждого renderHeaderBadge (смена вкладки
            // сайта) — свежий список всегда закрыт, открытость не «переживает» уход
            pfxSelOn = false;
            pop = document.createElement('div');
            pop.id = 'pfCrumbPop';
            pop.setAttribute('role', 'menu');
            pop.setAttribute('aria-label', 'Портфели');
            pop.addEventListener('click', pfxSelPopClick);
            pop.addEventListener('keydown', pfxSelPopKeydown);
            pfxBindListDnd(pop);
            crumb.appendChild(pop);
        }
        var selHtml = pfxCrumbSelHtml(), popHtml = pfxCrumbPopHtml();
        if (sel.__pfxHtml !== selHtml) { sel.innerHTML = selHtml; sel.__pfxHtml = selHtml; }
        if (pop.__pfxHtml !== popHtml) {
            // фокус клавиатуры переживает своп (перестановка Ctrl+стрелкой и фоновый
            // тик котировок пересобирают строки — без возврата фокус падал на body)
            var ae = document.activeElement;
            var focusRow = pfxSelOn && ae && pop.contains(ae) && ae.closest ? ae.closest('.pfp-row') : null;
            var focusPid = focusRow ? focusRow.getAttribute('data-pid') : null;
            pop.innerHTML = popHtml; pop.__pfxHtml = popHtml;
            if (focusPid) {
                var fr = pop.querySelector('.pfp-row[data-pid="' + focusPid + '"]');
                if (fr) { try { fr.focus(); } catch (e) {} }
            }
        }
        sel.setAttribute('aria-expanded', pfxSelOn ? 'true' : 'false');
        pop.classList.toggle('on', pfxSelOn);
    }
    // «⋯» и список портфелей закрываются по Esc и клику вне (сами кнопки-якоря
    // отфильтрованы по родителю: их собственные обработчики уже переключили)
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest || !t.closest('.pfx-morewrap')) window.pfxMoreClose();
        if (!t || !t.closest || !t.closest('#topBarCrumb')) pfxSelClose();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { window.pfxMoreClose(); pfxSelClose(); }
    });

    // ---- контролы страницы: жили в тёмном герое, с 2026-07-21 — в парящих узлах ----
    var PFX_LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    var PFX_UNLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/></svg>';
    // «во весь экран» — та же метафора, что у кнопки входа в полосе экранов
    var PFX_TERM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"/></svg>';
    // «сетка с плюсом» у «Виджета»: он добавляет блок В СЕТКУ, а не сущность —
    // чистый плюс в углу рядом с «Портфелем» читался как то же самое действие
    var PFX_WIDGETPLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/><line x1="17.25" y1="3.2" x2="17.25" y2="10.3"/><line x1="13.7" y1="6.75" x2="20.8" y2="6.75"/></svg>';
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
    // Тёмный герой «Панель управления» (pfxHeroHtml) снесён 2026-07-21: полоса
    // съедала первый экран, а работала в ней один KPI «за сегодня» — дубль
    // карточки «Обзора». Все её контролы переехали в парящие узлы (pfxFabSync
    // ниже): столбик #cornerStack и панель действий #pfActBar. Вместе с героем
    // ушёл и livePatchers.hero — точечно обновлять стало нечего.

    // ---- скругление карточек: CSS-переменная --pfr на панели, персист в pf_dash_v1 ----
    // R8: настройка ГЛОБАЛЬНАЯ (одна на все подвкладки) — живёт в конфиге «Обзора»,
    // какая бы подвкладка ни была активна
    // ЕДИНЫЙ источник правды: настройка глобальная и живёт в конфиге «Обзора».
    // Читать её из PF.dashCfg нельзя — на подвкладке это конфиг ЭТОЙ подвкладки,
    // где ключа corner нет вовсе. Из-за такого расхождения виджет «Отображение
    // карточек» выглядел неработающим: подсветка всегда падала на 'std', а клик по
    // реально выбранному варианту гасился ранним выходом (oc.corner === v).
    function pfxCornerCur() { return (pfTabCfgs.overview || PF.dashCfg).corner || 'std'; }
    function pfxCornerPx() {
        var c = pfxCornerCur();
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
        var cur = pfxCornerCur();   // не PF.dashCfg — см. pfxCornerCur
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
        PF.editHold = {}; PF.colorsOpen = false; PF.delArm = false; PF.addOpen = false;
        PF.renderNoAnim();   // спрячет карточное меню, pfxDrawerSync наполнит шторку
    };
    // Esc закрывает шторку (клик по скриму — тоже, см. pfxDrawerEl); pfCloseMenu
    // сбрасывает PF.openMenu, а pfxDrawerSync по нему гасит и саму шторку
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && PF.pfSetDrawerOn) window.pfCloseMenu();
    });

    // ---- R9.1: обучающий призрак «Добавить виджет» (комета летит в FAB) ----
    // Первый клик по призраку на вкладке-портфеле улетает анимацией в правый нижний
    // угол — к круглому FAB над панелью действий: так пользователь СВОИМИ ГЛАЗАМИ
    // видит, куда переехала точка входа, и призрак больше не занимает сетку.
    // Флаг обучения — локальный (позиция UI, в облако не зеркалится).
    var PFX_FAB_KEY = 'pf_widget_fab_v1';
    function pfxFabSeen() { try { return localStorage.getItem(PFX_FAB_KEY) === '1'; } catch (e) { return false; } }
    // ---- парящие узлы управления вкладки (мокап «угол: круглый FAB + панель») ----
    // С 2026-07-22 столбик #cornerStack на «Портфелях» НЕ показывается вовсе:
    // фон (#bgFab) и тема (#themeFab) ФИЗИЧЕСКИ переезжают в кластер панели
    // действий (слот #pfabGlobals), а «Виджет» — отдельный круглый FAB #pfxFab,
    // парящий над правым краем панели. Панель #pfActBar (Терминал | Портфель ·
    // Видимость · Бэкап | Раскладки · Замок · Фон · Тема) обязана жить в <body>:
    // у панелей вкладок на предках transform из tabFadeIn, он ловит position:fixed.
    // Видимость узлов гейтит CSS по body:has(#panel-portfolios.active) — JS только
    // наполняет разметку на каждый рендер. Своп пропускаем, пока HTML не изменился:
    // фоновый тик котировок не должен без причины закрывать открытые меню
    // «Видимость»/«Бэкап» и рейку фона.
    // ЛОВУШКА: innerHTML-своп панели УНИЧТОЖИЛ бы живые #bgFab/#themeFab (их
    // держат site-bg.js/profile-menu.js, пересоздать некому) — перед свопом
    // возвращаем их в столбик (pfxReleaseGlobals), после — затаскиваем обратно.
    function pfxAdoptGlobals() {
        var slot = document.getElementById('pfabGlobals'); if (!slot) return;
        var bg = document.getElementById('bgFab'), th = document.getElementById('themeFab');
        if (bg && bg.parentNode !== slot) slot.appendChild(bg);
        if (th && th.parentNode !== slot) slot.appendChild(th);
    }
    function pfxReleaseGlobals() {
        var stack = window.cornerStack && window.cornerStack.ensure(); if (!stack) return;
        var bg = document.getElementById('bgFab'), th = document.getElementById('themeFab');
        if (bg && bg.parentNode !== stack) stack.appendChild(bg);
        if (th && th.parentNode !== stack) stack.appendChild(th);
    }
    // уход с «Портфелей» обязан вернуть фон+тему в столбик: на прочих вкладках
    // панель скрыта CSS-ом, и кнопки бы пропали вместе с ней. switchTab к моменту
    // ленивой загрузки этого файла давно определён — мы внешний слой обёрток.
    (function () {
        if (window.__pfxGlobalsWrap || typeof window.switchTab !== 'function') return;
        window.__pfxGlobalsWrap = true;
        var prev = window.switchTab;
        window.switchTab = function (tabId) {
            var r = prev.apply(this, arguments);
            if (tabId !== 'portfolios') pfxReleaseGlobals();
            return r;
        };
    })();
    function pfxFabSync() {
        if (!pfxWide()) return;
        var empty = !PF.store.items.length;
        // как у прежней полосы: на гейте «Торговли» и у гостя конструктором нечего
        // настраивать — FAB «Виджет» и «Раскладки» не рисуем (замок остаётся)
        var isTrading = pfxIsTradeTab(pfxEffTab()) && !(PF.pftTradeReady && PF.pftTradeReady());
        var noCfg = isTrading || empty;
        var sumsOn = !!(window.sumsPrivacy && window.sumsPrivacy.isOn && window.sumsPrivacy.isOn());
        // слот столбика больше не наполняем — страничных кнопок в нём нет
        var host = document.getElementById('cstPage');
        if (host && host.__cstHtml !== '') { host.innerHTML = ''; host.__cstHtml = ''; }
        var bar = document.getElementById('pfActBar');
        if (!bar) { bar = document.createElement('div'); bar.id = 'pfActBar'; document.body.appendChild(bar); }
        // ВХОД В ТЕРМИНАЛ — из панели, то есть с ЛЮБОЙ подвкладки, включая «Обзор».
        // Показываем только тем, кто реально может торговать (canTrade в
        // broker-api.js): вести остальных в гейт кнопкой из угла нечестно.
        var canTrade = !!(window.brokerApi && window.brokerApi.canTrade());
        // data-tip у серых кнопок показывается ТОЛЬКО на узком десктопе, когда
        // подписи свёрнуты (медиа-правило в portfolios-r7.css); кластер за волоском —
        // те же кружки .cst-btn, что были в столбике, ярлычки у них всплывают сверху
        var barHtml =
            (canTrade && !empty ? '<button type="button" class="pfab-btn pfab-term" onclick="pftEnterTerminal()" title="Полноэкранный терминал: стакан, заявка и график во весь экран">' + PFX_TERM_SVG + '<span>Терминал</span></button><span class="pfab-hr" aria-hidden="true"></span>' : '') +
            // у гостя «Портфель» — единственное осмысленное действие: подсвечен синим
            '<button type="button" class="pfab-btn' + (empty ? ' primary' : '') + '" onclick="pfAddPortfolio()" data-tip="Портфель" title="Создать новый портфель">' + PF.PLUS_SVG + '<span>Портфель</span></button>' +
            (empty ? '' : PF.eyeWrapHtml()) +
            PF.backupWrapHtml() +
            '<span class="pfab-hr" aria-hidden="true"></span>' +
            (noCfg ? '' :
                '<button type="button" class="cst-btn' + (PF.pfl3Open ? ' on' : '') + '" onclick="pfLayoutsToggle(event)" data-tip="Раскладки" aria-label="Раскладки">' + PFP_SLIDERS_SVG + '</button>') +
            '<button type="button" class="cst-btn cst-lock' + (sumsOn ? ' on' : '') + '" onclick="pfxToggleSums()" aria-pressed="' + (sumsOn ? 'true' : 'false') + '" data-tip="' + (sumsOn ? 'Показать суммы' : 'Скрыть суммы') + '" aria-label="Скрывать суммы">' + (sumsOn ? PFX_LOCK_SVG : PFX_UNLOCK_SVG) + '</button>' +
            '<span class="pfab-globals" id="pfabGlobals"></span>';
        if (bar.__cstHtml !== barHtml) {
            pfxReleaseGlobals();   // спасаем фон+тему от innerHTML-свопа
            bar.innerHTML = barHtml; bar.__cstHtml = barHtml;
        }
        pfxAdoptGlobals();
        // круглый FAB «Добавить виджет» — 58px над правым краем панели.
        // stopPropagation — как у прежней кнопки столбика: «клик-вне» пикера на
        // document мгновенно закрыл бы только что открытую панель (pfLayoutsToggle
        // глушит всплытие сам — ему хватает переданного event)
        var fabHost = document.getElementById('pfxFab');
        if (!fabHost) { fabHost = document.createElement('div'); fabHost.id = 'pfxFab'; document.body.appendChild(fabHost); }
        var fabHtml = noCfg ? '' :
            '<button type="button" class="pfx-fab" id="cstWidgetBtn" onclick="event.stopPropagation();pfxAddWidgetClick()" data-tip="Добавить виджет" aria-label="Добавить виджет">' + PFX_WIDGETPLUS_SVG + '</button>';
        if (fabHost.__cstHtml !== fabHtml) { fabHost.innerHTML = fabHtml; fabHost.__cstHtml = fabHtml; }
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
        // цель — круглый FAB «Добавить виджет» над панелью; rect в тех же визуальных
        // px, что и у ячейки, поэтому делится тем же фактором. Фолбэк-константы —
        // его расчётное место (right 22 · bottom 78 · 58px), если FAB не отрисован
        var SZ = 58, RIGHT = 22, BOTTOM = 78;
        var tgt = document.getElementById('cstWidgetBtn');
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
            if (tgt) {
                var tr = tgt.getBoundingClientRect();
                fly.style.left = (tr.left / z) + 'px'; fly.style.top = (tr.top / z) + 'px';
                fly.style.width = (tr.width / z) + 'px'; fly.style.height = (tr.height / z) + 'px';
            } else {
                fly.style.left = (window.innerWidth / z - RIGHT - SZ) + 'px';
                fly.style.top = (window.innerHeight / z - BOTTOM - SZ) + 'px';
                fly.style.width = SZ + 'px'; fly.style.height = SZ + 'px';
            }
        });
        var done = false;
        var finish = function () {
            if (done) return; done = true;
            try { fly.remove(); } catch (e) {}
            window.pfLayoutToggle();    // сразу открываем пикер — призрак же «Добавить виджет»
        };
        fly.addEventListener('transitionend', finish);
        setTimeout(finish, 950);        // страховка, если transitionend не стрельнёт
    };
    function pfxTabPortsHtml() {
        var vis = visibleItems();
        // Пустое состояние — в обёртке со своими кнопками: pdetail в PFD_OWN_CHROME,
        // угловой оверлей ему не ставится, а ранний выход отдавал голую заглушку —
        // виджет висел на дашборде без шестерёнки и корзины, убрать его было нечем.
        if (!vis.length) {
            return '<div class="pfx-ports"><div class="dash2-card pf-card2 pfpt-card">' +
                PF.pfCardHead('', 'Составы портфелей', 'полные таблицы бумаг каждого портфеля', pfdInChromeHtml('pdetail')) +
                (PF.store.items.length ? PF.allHiddenHtml() : PF.emptyHtml()) +
            '</div></div>';
        }
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
            // Сравнение с индексом (решение вопроса 2 плана PF-CARD): из карточки
            // «Обзора» оно ушло — там график отвечает на «как у меня дела», а не
            // «обгоняю ли рынок». Здесь для этого есть место: кривая доходности
            // портфеля от первой покупки с наложением бенчмарка по кнопке.
            // Бенчмарк выбирается сам: RGBI для чисто облигационного портфеля,
            // иначе IMOEX (pfBench) — сравнивать ОФЗ с индексом акций бессмысленно.
            var bench = PF.pfBench(p), benchOn = PF.benchOn(p.id);
            var chartBlock = c.hs.length
                ? '<div class="pfpt-chart">' +
                    '<div class="pfpt-chart-h">' +
                        '<span class="pfpt-chart-t">Доходность портфеля<i>с ' + PF.ruDate(PF.dateToIso(PF.pfFirstBuyDate(p))) + ' · первая покупка</i></span>' +
                        '<div class="pfpt-chart-leg" id="pfcvLeg-' + p.id + '"></div>' +
                        '<button class="pfpt-benchbtn' + (benchOn ? ' on' : '') + '" onclick="pfxBenchToggle(\'' + p.id + '\')" ' +
                            'title="' + attr((benchOn ? 'Убрать кривую — ' : 'Наложить кривую — ') + bench.full) + '">' +
                            '<span class="pfcv-imdot"></span>' + bench.label + '</button>' +
                    '</div>' +
                    '<div class="pfcv-chart" id="pfcvChart-' + p.id + '"></div>' +
                '</div>'
                : '';
            var table = c.hs.length
                ? '<div class="pfpt-tablewrap"><table class="pfpt-table"><thead><tr>' +
                    // «Доля» — свой класс и на заголовке: колонка левоприжатая (полоска
                    // растёт слева), и отступ от правоприжатой «Стоимости» задаётся
                    // ОДИН раз для th и td, чтобы шапка не разъезжалась со значением
                    '<th>Бумага</th><th class="pfpt-num">Кол-во</th><th class="pfpt-num">Средняя</th><th class="pfpt-num">Сейчас</th>' +
                    '<th class="pfpt-num">Стоимость</th><th class="pfpt-share">Доля</th><th class="pfpt-num">Доход</th><th class="pfpt-num">Доходность</th>' +
                  '</tr></thead><tbody>' + c.hs.map(function (x) { return pfxPortHoldRowHtml(x, c); }).join('') + '</tbody></table></div>'
                : '<div class="pfal-empty">Состав пуст — добавьте активы в настройках портфеля ⚙.</div>';
            return '<div class="dash2-card pf-card2 pfpt-card" style="--pf-accent:' + ac + '">' + head + chartBlock + table + '</div>';
        }).join('') + '</div>';
    }
    // Кривые подвкладки «Портфель» дорисовываются после полного рендера — как
    // мини-графики карточек (repaintMiniCharts). Пейн переживает своп разметки:
    // loadPfChart отдаёт данные из кеша синхронно, если они уже загружены.
    PF.pfxPortChartsRepaint = function () {
        visibleItems().forEach(function (p) {
            if (dq('pfcvChart-' + p.id)) PF.loadPfChart(p.id);
        });
    };
    // тумблер бенчмарка: точечно — класс кнопки и перерисовка ЭТОГО графика,
    // без PF.renderPortfolios (полный своп перерисовал бы все кривые вкладки)
    window.pfxBenchToggle = function (pid) {
        var on = !PF.benchOn(pid);
        var p = findPf(pid);
        var btn = document.querySelector('.pfpt-benchbtn[onclick*="\'' + pid + '\'"]');
        if (btn && p) {
            btn.classList.toggle('on', on);
            btn.title = (on ? 'Убрать кривую — ' : 'Наложить кривую — ') + PF.pfBench(p).full;
        }
        PF.setBench(pid, on);   // сам перерисует график, когда серия придёт
    };
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
    PF.pfxFabSync = pfxFabSync; PF.pfxFlashBlock = pfxFlashBlock; PF.pfxGoOverviewFor = pfxGoOverviewFor;
    PF.pfxOpenPfTabs = pfxOpenPfTabs; PF.pfxPanelWrap = pfxPanelWrap; PF.pfxSaveOpenTabs = pfxSaveOpenTabs; PF.pfxSeedLayout = pfxSeedLayout;
    PF.pfxSetCardHtml = pfxSetCardHtml; PF.pfxSyncPath = pfxSyncPath; PF.pfxTabPortsHtml = pfxTabPortsHtml; PF.pfxTabsHtml = pfxTabsHtml;
    PF.pfxTabsScrollSync = pfxTabsScrollSync; PF.pfxVisRowsHtml = pfxVisRowsHtml; PF.pfxWide = pfxWide;
    PF.pfxCrumbSync = pfxCrumbSync; PF.pfxGearSync = pfxGearSync;
    PF.pfxTradingHtml = pfxTradingHtml;
})();
