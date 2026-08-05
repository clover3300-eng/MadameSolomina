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
    var jsArg = PF.jsArg, pfQuotesWarming = PF.pfQuotesWarming, ruDate = PF.ruDate, skelHtml = PF.skelHtml, toast = PF.toast, visibleItems = PF.visibleItems;
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
    // [ключ, подпись]. С 2026-07-28 они рисуются вторым уровнем колонки сайдбара
    // (PF.sbSideModel ниже), иконки им даёт js/sidebar-ctx.js по ключу.
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
    // ---- КАПИТАЛ ДЛЯ ШАПКИ КОЛОНКИ (сайдбар «Верстак», мокап Б) ----
    // Отдельно от sbSideModel: блок капитала висит в сайдбаре на ЛЮБОЙ вкладке,
    // а модель второго уровня собирается только для «Портфелей».
    // Суммируем ВСЕ портфели, включая скрытые: p.hidden прячет карточку на
    // «Обзоре», но не деньги (см. память hide-scope-overview-only).
    // Дневное изменение — только при вчерашнем снимке: dayDelta вернул null у
    // всех ⇒ chip остаётся null и в разметке его просто нет.
    // ВОЗРАСТ ЦЕН. PF.quotesOkTs (portfolios-core.js) — время последних РЕАЛЬНО
    // пришедших котировок, а не последней попытки: если MOEX молчит, оно стоит
    // на месте. Пока цены моложе порога, табло молчит тоже — метка появляется
    // ровно тогда, когда числам перестало быть можно верить как «сейчас».
    var STALE_MS = 5 * 60000;
    function capStale() {
        var ok = PF.quotesOkTs || 0;
        if (!ok) return PF.quotesTs ? 'Цены ещё не пришли' : null;   // попытки были, ответа нет
        if (Date.now() - ok < STALE_MS) return null;
        var d = new Date(ok), p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return 'Цены на ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    PF.sbCapModel = function () {
        if (!pfxWide()) return null;
        var items = (PF.store && PF.store.items) || [];
        // ПУСТО — это тоже состояние, а не «нечего показывать»: колонка отдаёт
        // вход вместо схлопнутой дыры (js/sidebar-ctx.js)
        if (!items.length) return { empty: 'new' };
        var total = 0, day = 0, dayKnown = false;
        items.forEach(function (p) {
            var c = calcPf(p);
            total += c.value;
            var d = dayDelta(p, c.value);
            if (d != null) { day += d; dayKnown = true; }
        });
        // Портфель заведён, но бумаг в нём нет: капитала всё равно нет, а звать
        // заводить ВТОРОЙ портфель было бы советом мимо — зовём наполнить этот
        if (!(total > 0)) return { empty: 'fill' };
        var chip = null, dayRub = null;
        if (dayKnown && total - day > 0) {
            var pct = day / (total - day) * 100;
            if (isFinite(pct)) chip = { tx: (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1).replace('.', ',') + '%', neg: pct < 0 };
            // день В РУБЛЯХ — из тех же снимков, что дают dayDelta; отдельного
            // расчёта не нужно, только знак и формат (раунд 4)
            dayRub = (day >= 0 ? '+' : '−') + fmtRub(Math.abs(day));
        }
        return {
            total: total,                 // сырое число — под интрадей-ряд спарклайна
            cap: fmtRub(total),
            chip: chip,
            dayRub: dayRub,
            // Долей классов табло больше не показывает: полоса с насечкой цели
            // снята в пользу линии дня (2026-07-28). Дрейф остался бейджем на
            // кружке «Ребаланса» — его и считаем.
            drift: (PF.pfDriftCount ? PF.pfDriftCount() : 0),
            // возраст цен: строка-метка либо null, если числа свежие
            stale: capStale()
        };
    };
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
        // ---- ПОРТФЕЛИ ----
        // Показываем ВСЕ портфели, а не только те, чьи вкладки открыты (просьба
        // 2026-08-05): колонка — перечень того, что у пользователя есть, и искать
        // свой портфель по вкладкам «а открыт ли он» неоткуда. Клик по строке
        // открывает вкладку (pfxOpenPfTab заводит её при надобности), крестик
        // остаётся только у ОТКРЫТЫХ — закрывать нечего, если вкладки нет.
        var curPid = pfxIsPfTab(eff) ? eff.slice(3) : null;
        var ports = PF.store.items.map(function (p) {
            var c = calcPf(p);
            // ДОХОДНОСТЬ ЗА ВСЁ ВРЕМЯ ВМЕСТО СУММЫ (просьба 2026-08-04). Сумма
            // отвечала на «сколько здесь», но в перечне из четырёх строк это
            // четыре длинных числа, между которыми нечего сравнивать. Процент
            // сравним сразу — и он же говорит, стоило ли; сама сумма осталась в
            // подсказке строки. Считаем к вложенному (c.pnlPct), как на карточке.
            var ret = c.invested > 0 && isFinite(c.pnlPct)
                ? { tx: fmtPct(c.pnlPct), neg: c.pnlPct < 0 } : null;
            return {
                act: 'pf', key: p.id, tx: p.name, dot: colorVal(p.color),
                on: curPid === p.id, cls: p.hidden ? 'dim' : '',
                title: p.name + ' · ' + fmtRub(c.value) + (ret ? ' · ' + ret.tx + ' за всё время' : ''),
                ret: ret,
                chg: pfxSideDay(p, c.value),
                // всплывающий глаз (js/sidebar-ctx.js, act 'pf-hide'): скрытие портфеля
                // осталось единственным в проекте, и держать его только в меню «Видимость»
                // в шапке — далеко от самого портфеля
                hide: { act: 'pf-hide', key: p.id, off: !!p.hidden },
                close: pfxOpenPfTabs.indexOf(p.id) >= 0 ? { act: 'pf-close', key: p.id } : null
            };
        });
        ports.push({ act: 'pf-new', key: '', tx: 'Новый портфель', iconKey: 'plus', cls: 'gh' });
        var groups = [{ label: 'Разделы', items: secs }];
        groups.push({ label: 'Портфели', items: ports });
        return {
            title: 'Портфели',
            cap: items.length ? fmtRub(total) : null,
            chip: chip,
            groups: groups,
            foot: { act: 'pfx', key: 'settings', tx: 'Настройки', iconKey: 'settings', on: eff === 'settings' }
        };
    };
    // Обёртка контента #pfxTabPanel. Ролей ARIA у неё БОЛЬШЕ НЕТ: tabpanel без
    // tablist невалиден, а кнопок-вкладок в документе не осталось — второй
    // уровень уехал в колонку сайдбара (PF.sbSideModel + js/sidebar-ctx.js).
    // Сам узел жив как точка опоры разметки: на #pfxTabPanel завязаны отступы
    // полноэкранных сцен (css/broker.css, полоса экранов «Торговли»).
    function pfxPanelWrap(inner) {
        return '<div id="pfxTabPanel">' + inner + '</div>';
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

    // ---- скругление карточек: ОДНО на весь проект, 14px «как на Главной» ----
    // 2026-07-29: выбор из трёх вариантов (виджет «Отображение карточек» + строка в
    // поповере раскладки) снят по просьбе владельца — радиус карточки входа Главной
    // стал единственным. Переменная --pfr жива: на ней держатся десятки правил
    // (css/portfolios-r7.css) и обнуление в полноэкранной торговле (css/broker.css);
    // значение теперь задаёт САМ CSS (#panel-portfolios), инлайна из JS больше нет.
    // Ключ corner в старых конфигах не читается и не пишется — он молча отмирает.

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
            // «ВИДИМОСТЬ» ИЗ ПАНЕЛИ УБРАНА (2026-08-04): глаз стоит на самой строке
            // портфеля во втором уровне сайдбара (js/sidebar-ctx.js, act 'pf-hide') —
            // там, где портфель и живёт. Меню в углу было вторым входом в то же
            // действие, причём дальше от объекта. На мобиле кнопка остаётся
            // (topBarActionsHtml): колонки сайдбара там нет.
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
    // ---- «Снимки капитала» ПРЯМО В КАРТОЧКЕ «Составов» (просьба 2026-08-05) ----
    // Кнопка в ряду действий раскрывает под шапкой дневные снимки стоимости ЭТОГО
    // портфеля — не суммарные, как у одноимённого виджета: карточка про один
    // портфель, и снимки в ней про него же. Открытые карточки — в PF.pfptSnapsOpen
    // (сессия, как chartOpen), рендер читает его при полных перерисовках.
    PF.pfptSnapsOpen = PF.pfptSnapsOpen || {};
    // серия по ОДНОМУ портфелю: pf_snapshots_v1[pid] + живая точка сегодня —
    // та же механика, что у суммарной pfdCapSeries в portfolios-widgets.js
    function pfxPtSnapSeries(p, c) {
        var m = (PF.snaps || {})[p.id] || {};
        var out = Object.keys(m).sort().map(function (d) { return { d: d, v: m[d] }; });
        if (PF.quotesTs && c && c.value > 0) {
            var t = PF.todayStr();
            if (out.length && out[out.length - 1].d === t) out[out.length - 1].v = c.value;
            else out.push({ d: t, v: c.value });
        }
        return out;
    }
    // Секция = две колонки: слева ПОЛНЫЙ архив снимков (хранится до 400 дней на
    // портфель — обрезает recordSnapshots), справа календарь: отметки дней со
    // снимками, ручная запись задним числом (стоимость из истории MOEX,
    // PF.chartRaw), удаление лишнего и частота автозаписи (день/неделя/месяц).
    // Состояние календаря — сессия: PF.pfptSnapCal[pid] = { y, m, sel }.
    PF.pfptSnapCal = PF.pfptSnapCal || {};
    var PFSC_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    // глифы кнопки-тумблера: пульс (дневная линия стоимости) и шеврон-стрелка
    var PFSC_PULSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
    var NOTE_CHEVR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"/></svg>';
    function pfxScState(pid) {
        if (!PF.pfptSnapCal[pid]) {
            var n = new Date();
            PF.pfptSnapCal[pid] = { y: n.getFullYear(), m: n.getMonth(), sel: null };
        }
        return PF.pfptSnapCal[pid];
    }
    function pfxScIso(y, m, d) { return y + '-' + PF.pad2(m + 1) + '-' + PF.pad2(d); }
    // стоимость бумаг портфеля на прошлую дату — из той же истории MOEX, что
    // питает график карточки (chartRaw[pid].series, поле c; свободных денег в
    // серии нет — снимок задним числом честно пишем без них)
    function pfxScHistVal(pid, iso) {
        var raw = PF.chartRaw[pid];
        if (!raw || !raw.series) return null;
        for (var i = 0; i < raw.series.length; i++) if (raw.series[i].d === iso) return raw.series[i].c;
        return null;
    }
    function pfxScCalHtml(p, st) {
        var m = (PF.snaps || {})[p.id] || {};
        var today = PF.todayStr();
        var first = new Date(st.y, st.m, 1);
        var lead = (first.getDay() + 6) % 7;                       // понедельник — первый
        var dim = new Date(st.y, st.m + 1, 0).getDate();
        var cells = '';
        for (var b = 0; b < lead; b++) cells += '<span class="pfsc-b"></span>';
        for (var d = 1; d <= dim; d++) {
            var iso = pfxScIso(st.y, st.m, d);
            var cls = 'pfsc-d';
            if (m[iso] != null) cls += ' has';
            if (iso === today) cls += ' today';
            if (iso === st.sel) cls += ' sel';
            var future = iso > today;
            cells += future
                ? '<span class="pfsc-d off">' + d + '</span>'
                : '<button type="button" class="' + cls + '" onclick="pfxScPick(\'' + jsArg(p.id) + '\',\'' + iso + '\')"' +
                  (m[iso] != null ? ' title="Снимок: ' + attr(fmtRub(m[iso])) + '"' : '') + '>' + d + '</button>';
        }
        var atNow = (function () { var n = new Date(); return st.y === n.getFullYear() && st.m === n.getMonth(); })();
        return '<div class="pfsc-cal">' +
            '<div class="pfsc-head">' +
                '<button type="button" class="pfsc-nav" onclick="pfxScNav(\'' + jsArg(p.id) + '\',-1)" aria-label="Прошлый месяц">' + PF.CHEV_SVG + '</button>' +
                '<b>' + PFSC_MONTHS[st.m] + ' ' + st.y + '</b>' +
                '<button type="button" class="pfsc-nav r" onclick="pfxScNav(\'' + jsArg(p.id) + '\',1)" aria-label="Следующий месяц"' + (atNow ? ' disabled' : '') + '>' + PF.CHEV_SVG + '</button>' +
            '</div>' +
            '<div class="pfsc-wd"><span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span></div>' +
            '<div class="pfsc-grid">' + cells + '</div>' +
        '</div>';
    }
    // панель выбранного дня: снимок есть — значение и «Удалить», снимка нет —
    // «Записать» со стоимостью из истории (или живой для сегодня); в выходной
    // без торгов честно объясняем, почему записать нечего
    function pfxScDayHtml(p, st) {
        if (!st.sel) return '<div class="pfsc-day quiet">Выберите день в календаре: снимок можно записать задним числом или удалить лишний.</div>';
        var m = (PF.snaps || {})[p.id] || {};
        var today = PF.todayStr();
        var lbl = ruDate(st.sel);
        if (m[st.sel] != null) {
            var ks = Object.keys(m).sort(), prev = null;
            for (var i = 0; i < ks.length; i++) if (ks[i] < st.sel) prev = ks[i];
            var dch = prev != null ? m[st.sel] - m[prev] : null;
            return '<div class="pfsc-day">' +
                '<div class="pfsc-day-l"><i>' + lbl + '</i><b>' + fmtRub(m[st.sel]) + '</b>' +
                    (dch != null ? '<span class="pfsn-c ' + (dch >= 0 ? 'pos' : 'neg') + '">' + (dch >= 0 ? '+' : '−') + fmtRub(Math.abs(dch)) + '</span>' : '') +
                '</div>' +
                '<button type="button" class="pfsc-act danger" onclick="pfxScDelete(\'' + jsArg(p.id) + '\')">Удалить снимок</button>' +
            '</div>';
        }
        var val = st.sel === today
            ? (PF.quotesTs ? calcPf(p).value : null)
            : pfxScHistVal(p.id, st.sel);
        if (!(val > 0)) {
            var why = st.sel === today ? 'Дождитесь живых котировок — записать пока нечего.'
                : 'В этот день торгов не было или история MOEX ещё не загрузилась.';
            return '<div class="pfsc-day quiet"><i>' + lbl + '</i> · ' + why + '</div>';
        }
        return '<div class="pfsc-day">' +
            '<div class="pfsc-day-l"><i>' + lbl + '</i><b>' + fmtRub(val) + '</b><span class="pfsc-day-src">' + (st.sel === today ? 'по живым котировкам' : 'из истории MOEX') + '</span></div>' +
            '<button type="button" class="pfsc-act" onclick="pfxScWrite(\'' + jsArg(p.id) + '\')">Записать снимок</button>' +
        '</div>';
    }
    function pfxScFreqHtml() {
        var f = PF.snapFreq ? PF.snapFreq() : 'day';
        function b(v, t) {
            return '<button type="button" class="pfsc-fb' + (f === v ? ' on' : '') + '" onclick="pfxScFreq(\'' + v + '\')">' + t + '</button>';
        }
        return '<div class="pfsc-freq"><i>Автозапись</i><div class="pfsc-fseg">' +
            b('day', 'Каждый день') + b('week', 'Раз в неделю') + b('month', 'Раз в месяц') +
        '</div></div>';
    }
    function pfxPtSnapsHtml(p, c) {
        var s = pfxPtSnapSeries(p, c);
        var stored = Object.keys((PF.snaps || {})[p.id] || {}).length;
        var st = pfxScState(p.id);
        var list;
        if (s.length < 2) {
            list = '<div class="pfal-empty">Снимков ещё нет: они пишутся автоматически при живых котировках, а первый можно записать прямо сейчас — выберите день в календаре справа.</div>';
        } else {
            // ВЕСЬ архив (до 400 дней), новые сверху; между месяцами — тихий
            // разделитель, чтобы длинный список листался по ориентирам
            var rows = '', lastMon = '';
            for (var i = s.length - 1; i >= 1; i--) {
                var mon = s[i].d.slice(0, 7);
                if (mon !== lastMon) {
                    rows += '<div class="pfsn-mon">' + PFSC_MONTHS[+mon.slice(5) - 1] + ' ' + mon.slice(0, 4) + '</div>';
                    lastMon = mon;
                }
                var d = s[i].v - s[i - 1].v;
                rows += '<div class="pfsn-row"><span class="pfsn-d">' + ruDate(s[i].d) + '</span>' +
                    '<span class="pfsn-v">' + fmtRub(s[i].v) + '</span>' +
                    '<span class="pfsn-c ' + (d >= 0 ? 'pos' : 'neg') + '">' + (d >= 0 ? '+' : '−') + fmtRub(Math.abs(d)) + '</span></div>';
            }
            list = '<div class="pfsn-list">' + rows + '</div>';
        }
        // .pfsc-noarch — архива ещё нет: внутри колонки список прячется целиком,
        // потому что о пустоте уже сказала плитка «Снимки капитала» над секцией
        return '<div class="pfpt-snaps" id="pfptSnaps-' + p.id + '">' +
            '<div class="pfpt-chart-h"><span class="pfpt-chart-t">Снимки капитала' +
                '<i>' + (stored ? stored + ' ' + PF.plural(stored, 'снимок', 'снимка', 'снимков') + ' · ' : '') + 'хранится до 400 дней</i></span></div>' +
            '<div class="pfsc-wrap' + (s.length < 2 ? ' pfsc-noarch' : '') + '">' +
                '<div class="pfsc-listcol">' + list + '</div>' +
                '<aside class="pfsc-side">' + pfxScCalHtml(p, st) + pfxScDayHtml(p, st) + pfxScFreqHtml() + '</aside>' +
            '</div>' +
        '</div>';
    }
    // точечная перерисовка секции на месте — без полного ре-рендера дашборда
    function pfxPtSnapsRepaint(pid) {
        var p = findPf(pid); if (!p) return;
        var sec = dq('pfptSnaps-' + pid);
        if (sec) sec.outerHTML = pfxPtSnapsHtml(p, calcPf(p));
        if (PF.pfdRepackSoon) PF.pfdRepackSoon();
    }
    window.pfxScNav = function (pid, dir) {
        var st = pfxScState(pid);
        var d = new Date(st.y, st.m + dir, 1), n = new Date();
        if (d > n) return;
        st.y = d.getFullYear(); st.m = d.getMonth();
        pfxPtSnapsRepaint(pid);
    };
    window.pfxScPick = function (pid, iso) {
        var st = pfxScState(pid);
        st.sel = st.sel === iso ? null : iso;   // повторный клик снимает выбор
        pfxPtSnapsRepaint(pid);
    };
    window.pfxScFreq = function (v) {
        if (PF.snapSetFreq) PF.snapSetFreq(v);
        // частота общая на все портфели — обновляем каждую открытую секцию И строку
        // «Автозапись» в плитках колонки: без этого сегмент переключался, а плитка
        // над ним продолжала говорить «каждый день» — выбор выглядел непринятым
        var tx = PFZ_FREQ_TX[v] || 'каждый день';
        document.querySelectorAll('#pfWrap [data-snapfreq]').forEach(function (b) { b.textContent = tx; });
        document.querySelectorAll('#pfWrap .pfpt-snaps').forEach(function (sec) {
            var pid = (sec.id || '').replace('pfptSnaps-', '');
            if (pid) pfxPtSnapsRepaint(pid);
        });
        if (PF.recordSnapshots) PF.recordSnapshots(true);   // новая частота вступает в силу сразу, минуя троттл
    };
    window.pfxScWrite = function (pid) {
        var p = findPf(pid), st = pfxScState(pid);
        if (!p || !st.sel) return;
        var today = PF.todayStr();
        var val = st.sel === today ? (PF.quotesTs ? calcPf(p).value : null) : pfxScHistVal(pid, st.sel);
        if (!(val > 0)) { toast('Нет данных для снимка на эту дату', true); return; }
        if (PF.snapWrite(pid, st.sel, val)) {
            toast('Снимок за ' + ruDate(st.sel) + ' записан: ' + fmtRub(val));
            pfxPtSnapsRepaint(pid);
        }
    };
    window.pfxScDelete = function (pid) {
        var p = findPf(pid), st = pfxScState(pid);
        if (!p || !st.sel) return;
        var m = (PF.snaps || {})[pid] || {};
        var old = m[st.sel], iso = st.sel;
        if (old == null) return;
        if (PF.snapDelete(pid, iso)) {
            pfxPtSnapsRepaint(pid);
            toast('Снимок за ' + ruDate(iso) + ' удалён', false, {
                label: 'Вернуть',
                fn: function () { PF.snapWrite(pid, iso, old); pfxPtSnapsRepaint(pid); }
            });
        }
    };
    // раскрытие/сворачивание — прямым DOM (вставка/удаление секции), без полного
    // ре-рендера: полный сбрасывал бы прокрутку страницы и мигал графиком
    window.pfxPtSnapsToggle = function (pid) {
        var p = findPf(pid); if (!p) return;
        var open = !PF.pfptSnapsOpen[pid];
        PF.pfptSnapsOpen[pid] = open;
        var card = document.querySelector('#pfWrap .pfpt-card[data-pid="' + pid + '"]');
        if (!card) return;
        // входов два — строка в плитке колонки и плитка узкой ленты; шеврон/подсветка синхронно
        card.querySelectorAll('.pfz-snapo, .pfz-tbtn').forEach(function (b) { b.classList.toggle('on', open); });
        card.classList.toggle('pfz-snapopen', open);
        var sec = dq('pfptSnaps-' + pid);
        if (!open) { if (sec) sec.remove(); }
        else if (!sec) {
            var side = card.querySelector('.pfz-side');
            if (side) side.insertAdjacentHTML('beforeend', pfxPtSnapsHtml(p, calcPf(p)));
            // история MOEX для записи задним числом — греем, если карточка портфеля
            // (обычный поставщик chartRaw) с вкладки убрана
            if (!PF.chartRaw[pid]) try { PF.loadPfChart(pid); } catch (e) {}
        }
        if (PF.pfdRepackSoon) PF.pfdRepackSoon();   // высота блока сменилась — перепаковать masonry
    };
    // ================= «Составы портфелей» — «Штурманская», чистовик v3 =================
    // Мокап dev/mockups/pdetail3-mockups (утверждён 2026-08-05): слева реестр бумаг
    // с группами классов, долей-столбиком и чипами годовых; справа колонка плиток —
    // капитал с кривой из снимков, движение дня, ближайшая выплата, снимки.
    // Принципы: один факт — одно место; цвет только состоянию; ломаться локально.
    // Узкий блок (контейнерный порог < 900px): колонка складывается в ленту плиток
    // над таблицей, колонки «Сейчас»/«Доход» и группы уходят (CSS, @container pfz).
    var PFZ_MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    function pfzRuDateLong(iso) {   // '2026-09-24' → «24 сентября»
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? (+m[3]) + ' ' + PFZ_MON_G[+m[2] - 1] : (iso || '');
    }
    // вклад бумаг в дневное изменение — из quotes[tk].chgPct (та же формула, что
    // dayDeltaFromQuotes в ядре): при цене P и изменении k вчерашняя стоимость
    // позиции = V/(1+k), вклад = V − V/(1+k). Облигации без дневного изменения
    // MOEX в раскладку не попадают — движение честно только по тем, о ком знаем.
    function pfzMoves(p, c) {
        var list = [], total = 0;
        c.hs.forEach(function (x) {
            var tk = x.h.ticker;
            if (!tk || x.h.type === 'bond' || !(x.c.value > 0)) return;
            var q = PF.quotes[tk];
            if (!q || q.chgPct == null) return;
            var d = x.c.value - x.c.value / (1 + q.chgPct / 100);
            if (!isFinite(d) || Math.abs(d) < 0.5) return;
            list.push({ tk: tk, d: d, chg: q.chgPct, share: c.value > 0 ? x.c.value / c.value * 100 : 0 });
            total += Math.abs(d);
        });
        list.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
        return { list: list, total: total };
    }
    // ближайшая выплата ЭТОГО портфеля — те же расписания, что у календаря выплат
    function pfzNextPay(p) {
        try {
            var evs = PF.collectUpcomingPayouts();
            for (var i = 0; i < evs.length; i++) if (evs[i].pfId === p.id) return evs[i];
        } catch (e) {}
        return null;
    }
    // последний снимок ПРОШЛЫХ дней (сегодняшний ещё пишется и не «последний»)
    function pfzLastSnap(p) {
        var m = (PF.snaps || {})[p.id] || {};
        var ks = Object.keys(m).sort(), today = PF.todayStr();
        for (var i = ks.length - 1; i >= 0; i--) if (ks[i] < today) return { d: ks[i], v: m[ks[i]] };
        return null;
    }
    // нейтральная кривая капитала в герое: последние 30 точек дневных снимков
    // (плюс живая сегодняшняя из pfxPtSnapSeries); < 2 точек — честная заглушка
    function pfzHeroCurve(p, c) {
        var s = pfxPtSnapSeries(p, c).slice(-30);
        if (s.length < 2) return '<div class="pfz-nochart">Кривая появится со второго дня наблюдений</div>';
        var min = Infinity, max = -Infinity;
        s.forEach(function (q) { if (q.v < min) min = q.v; if (q.v > max) max = q.v; });
        var span = max - min;
        var pts = s.map(function (q, i) {
            var x = i / (s.length - 1) * 216;
            var y = span > 0 ? 4 + (max - q.v) / span * 26 : 17;
            return x.toFixed(1) + ',' + y.toFixed(1);
        });
        return '<svg class="pfz-herosvg" viewBox="0 0 216 34" preserveAspectRatio="none" aria-hidden="true">' +
            '<path d="M' + pts.join(' L') + ' L216,34 L0,34 Z"/>' +
            '<polyline points="' + pts.join(' ') + '"/></svg>';
    }
    // чип годовой доходности — ЕДИНСТВЕННЫЙ цветовой акцент строки таблицы
    function pfzChip(v) {
        if (v == null || !isFinite(v)) return '<span class="pfz-nochip">—</span>';
        var pos = v >= 0;
        return '<span class="pfz-chip ' + (pos ? 'pos' : 'neg') + '">' + (pos ? '▲' : '▼') + ' ' +
            Math.abs(v).toFixed(1).replace('.', ',') + '%</span>';
    }
    // «Доля»: число и полоска — один правоприжатый элемент одной ширины,
    // классовый цвет полоски (акции/облигации — те же, что в проекте всюду)
    function pfzShare(share, isBond) {
        return '<span class="pfz-shr"><b>' + Math.round(share) + '%</b>' +
            '<u><i style="width:' + clamp(share, 2, 100).toFixed(0) + '%;background:' + (isBond ? '#7B9BBF' : '#D97757') + '"></i></u></span>';
    }
    // Значка класса у тикера НЕТ (правка 2026-08-05): бумаги и так разложены по
    // группам «Акции»/«Облигации», а полоска доли несёт классовый цвет — метка
    // у каждой строки повторяла это в третий раз.
    // Ячейка бумаги ДВУХСТРОЧНАЯ (правка «таблица нагружена, взгляд теряется»):
    // сверху тикер и имя, снизу позиция «100 шт × 287,85 ₽». Кол-во и цена были
    // отдельными колонками, но их не сравнивают между строками (у каждой бумаги
    // свой масштаб цены) — колонок стало 7, а числовых столбцов для сканирования
    // всего четыре: стоимость, доля, доход, годовых. Теперь их ровно четыре.
    function pfzAsCell(h, hc) {
        var pos = hc ? fmtQty(hc.qty) + ' шт × ' + (hc.curSrc === 'buy' ? '…' : fmtPrice(hc.cur)) + ' ₽' : '';
        return '<div class="pfpt-as"><span class="pfz-asn"><b>' + esc(h.ticker) + '</b>' +
            '<span>' + esc(PF.assetDisplayName(h)) + '</span></span>' +
            (pos ? '<span class="pfz-aspos' + (hc && hc.live ? ' live' : '') + '">' + pos + '</span>' : '') + '</div>';
    }
    // НКД одной облигации (ACCRUEDINT с MOEX, обновляется каждый день — сторож
    // bondNkdDayGuard в ядре); в подсказке — накопленное по всей позиции
    function pfzNkdCell(h, hc) {
        var v = PF.curNkdOf ? PF.curNkdOf(h.ticker) : null;
        if (v == null) return '<td class="pfpt-num pfz-nkd">…</td>';
        var tot = v * (hc.qty || 0);
        return '<td class="pfpt-num pfz-nkd" title="' + attr('Накоплено по позиции: ' + fmtRub(tot)) + '">' +
            fmtPrice(v) + '</td>';
    }
    function pfzRowHtml(x, c) {
        var h = x.h, hc = x.c, isB = h.type === 'bond';
        var share = (c.value > 0 && hc.value > 0) ? hc.value / c.value * 100 : 0;
        var noQ = hc.curSrc === 'buy';
        var has = hc.invested > 0 && !noQ;
        return '<tr class="pfpt-tr"' + (isB ? '' : ' role="button" onclick="pfOpenTicker(\'' + jsArg(h.ticker) + '\')"') + '>' +
            '<td>' + pfzAsCell(h, hc) + '</td>' +
            (isB ? pfzNkdCell(h, hc) : '<td class="pfz-nkd"></td>') +
            '<td class="pfpt-num pfpt-val">' + fmtRub(hc.value) + '</td>' +
            '<td class="pfz-shrc">' + pfzShare(share, isB) + '</td>' +
            // рубли дохода НЕЙТРАЛЬНЫЕ (знак в числе) — цвет несёт только чип годовых
            '<td class="pfpt-num pfz-wc">' + (has ? (hc.pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(hc.pnl)) : '—') + '</td>' +
            '<td class="pfz-chipc">' + (has ? pfzChip(hc.annual) : '<span class="pfz-nochip">—</span>') + '</td>' +
        '</tr>';
    }
    function pfzTableHtml(p, c) {
        var stocks = [], bonds = [];
        c.hs.forEach(function (x) {
            if (x.h.type === 'bond') bonds.push(x); else stocks.push(x);
        });
        // ОБЩЕЙ ШАПКИ «Бумага» БОЛЬШЕ НЕТ (просьба 2026-08-05): у каждого класса
        // своя строка заголовков, и первая ячейка называет сам класс — «Акции» /
        // «Облигации». Так подзаголовок раздела и шапка колонок стали одной
        // строкой вместо двух, а у облигаций появилось место под свою колонку НКД
        // (у акций её ячейки пустые — вертикаль чисел остаётся общей на всю таблицу).
        function head(name, withNkd) {
            return '<tr class="pfz-hd"><th>' + name + '</th>' +
                '<th class="pfpt-num pfz-nkd"' + (withNkd ? ' title="Накопленный купонный доход на одну бумагу, обновляется каждый день"' : '') + '>' +
                    (withNkd ? 'НКД' : '') + '</th>' +
                '<th class="pfpt-num">Стоимость</th><th class="pfpt-num">Доля</th>' +
                '<th class="pfpt-num pfz-wc">Доход</th>' +
                // «Годовых» одним словом: единица измерения чипов —
                // «▲ 28,5%» читается «28,5% годовых»
                '<th class="pfpt-num" title="Доходность в процентах годовых">Годовых</th></tr>';
        }
        var rows = '';
        if (stocks.length) { rows += head('Акции', false); rows += stocks.map(function (x) { return pfzRowHtml(x, c); }).join(''); }
        if (bonds.length) { rows += head('Облигации', true); rows += bonds.map(function (x) { return pfzRowHtml(x, c); }).join(''); }
        var n = c.hs.length, has = c.invested > 0;
        rows += '<tr class="pfz-tot"><td>Итого · ' + n + ' ' + PF.plural(n, 'бумага', 'бумаги', 'бумаг') + '</td>' +
            '<td class="pfz-nkd"></td>' +
            '<td class="pfpt-num pfpt-val">' + fmtRub(c.value) + '</td><td></td>' +
            '<td class="pfpt-num pfz-wc">' + (has ? (c.pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(c.pnl)) : '—') + '</td>' +
            '<td class="pfz-chipc">' + (has ? pfzChip(c.annual) : '<span class="pfz-nochip">—</span>') + '</td></tr>';
        return '<div class="pfpt-tablewrap"><table class="pfpt-table pfz-tbl"><tbody>' + rows + '</tbody></table></div>';
    }
    // ---- плитки колонки (и их близнецы в узкой ленте) ----
    function pfzHeroCard(p, c, dd) {
        var pct = (dd != null && c.value - dd > 0) ? Math.abs(dd) / (c.value - dd) * 100 : null;
        var chip = dd != null
            ? '<span class="pfz-dchip ' + (dd >= 0 ? 'pos' : 'neg') + '">' + (dd >= 0 ? '▲' : '▼') + ' ' + fmtRub(Math.abs(dd)) +
                (pct != null ? ' · ' + pct.toFixed(1).replace('.', ',') + '%' : '') + ' за сегодня</span>'
            : '<span class="pfz-dquiet">изменение за день — со второго дня наблюдений</span>';
        return '<div class="pfz-tile pfz-hero"><i>Капитал</i><span class="pfz-ts">30 дней</span>' +
            '<b data-money>' + fmtRub(c.value) + '</b>' +
            '<span class="pfz-inv">вложено <span data-money>' + fmtRub(c.invested) + '</span></span>' +
            chip + pfzHeroCurve(p, c) + '</div>';
    }
    // Кольцо распределения: ДВА сегмента, суммы классов рядом легендой. Сюда
    // переехали суммы, что стояли в подзаголовках групп таблицы: у распределения
    // теперь одно место в виджете, и колонка получает якорь-картинку.
    function pfzAllocCard(p, c) {
        var sSum = 0, bSum = 0;
        c.hs.forEach(function (x) { if (x.h.type === 'bond') bSum += x.c.value; else sSum += x.c.value; });
        var tot = sSum + bSum;
        if (!(tot > 0)) return '';
        var stockP = Math.round(clamp(sSum / tot * 100, 0, 100)), bondP = 100 - stockP;
        var CIRC = 2 * Math.PI * 26, sLen = CIRC * (sSum / tot);
        var ring = '<svg class="pfz-donut" viewBox="0 0 68 68" aria-hidden="true">' +
            '<circle class="trk" cx="34" cy="34" r="26" fill="none" stroke-width="9"/>' +
            (sSum > 0 ? '<circle cx="34" cy="34" r="26" fill="none" stroke="#D97757" stroke-width="9" transform="rotate(-90 34 34)" ' +
                'stroke-dasharray="' + sLen.toFixed(1) + ' ' + (CIRC - sLen).toFixed(1) + '"/>' : '') +
            (bSum > 0 ? '<circle cx="34" cy="34" r="26" fill="none" stroke="#7B9BBF" stroke-width="9" transform="rotate(-90 34 34)" ' +
                'stroke-dasharray="' + (CIRC - sLen).toFixed(1) + ' ' + sLen.toFixed(1) + '" stroke-dashoffset="' + (-sLen).toFixed(1) + '"/>' : '') +
        '</svg>';
        function leg(col, name, pct, sum) {
            return '<div class="pfz-leg"><span class="d" style="background:' + col + '"></span>' +
                '<span class="t"><b>' + name + '</b><u data-money>' + fmtRub(sum) + '</u></span>' +
                '<i>' + pct + '%</i></div>';
        }
        return '<div class="pfz-tile pfz-alloc"><i>Распределение</i>' +
            '<div class="pfz-allocb">' + ring + '<div class="pfz-legs">' +
                (sSum > 0 ? leg('#D97757', 'Акции', stockP, sSum) : '') +
                (bSum > 0 ? leg('#7B9BBF', 'Облигации', bondP, bSum) : '') +
            '</div></div></div>';
    }
    function pfzMoveCard(p, c) {
        var mv = pfzMoves(p, c);
        if (!mv.list.length) {
            return '<div class="pfz-tile"><i>Движение дня</i>' +
                '<div class="pfz-quiet">Появится с котировками: MOEX отдаёт дневное изменение только по акциям.</div></div>';
        }
        var lead = mv.list[0];
        var pctOf = mv.total > 0 ? Math.round(Math.abs(lead.d) / mv.total * 100) : 100;
        var rows = mv.list.slice(1, 3).map(function (m) {
            return '<div class="pfz-mvrow"><b>' + esc(m.tk) + '</b><i data-money>' + (m.d >= 0 ? '+' : '−') + fmtRub(Math.abs(m.d)) + '</i></div>';
        }).join('');
        return '<div class="pfz-tile"><i>Движение дня</i>' +
            '<div class="pfz-mvlead' + (lead.d >= 0 ? ' pos' : '') + '"><div class="t"><b>' + esc(lead.tk) + '</b>' +
                '<i data-money>' + (lead.d >= 0 ? '+' : '−') + fmtRub(Math.abs(lead.d)) + '</i></div>' +
                '<div class="s">' + pctOf + '% дневного изменения: ' + (lead.chg >= 0 ? '+' : '−') +
                    Math.abs(lead.chg).toFixed(1).replace('.', ',') + '% при доле ' + Math.round(lead.share) + '%</div></div>' +
            rows + '</div>';
    }
    // плитки выплаты НЕТ вовсе, когда выплат не ожидается — колонка честно короче
    function pfzPayCard(p) {
        var ev = pfzNextPay(p);
        if (!ev) return '';
        var kind = ev.kind === 'div' ? 'дивиденды' : ev.kind === 'redeem' ? 'погашение' : 'купон';
        var name = ev.kind === 'div' ? ev.ticker : (ev.name || ev.ticker);
        var iso = PF.dateToIso(ev.date);
        // сумма ЗЕЛЁНАЯ и со знаком: это единственные деньги виджета, которые
        // придут, а не переоценятся, — и читается как приход, а не как остаток
        return '<div class="pfz-tile pfz-pay"><i>Ближайшая выплата</i>' +
            '<b class="pos" data-money>+' + fmtRub(ev.amount) + '</b>' +
            '<span class="pfz-what">' + kind + ' ' + esc(name) + (ev.qty > 0 ? ' · ' + fmtQty(ev.qty) + ' шт' : '') + '</span>' +
            '<div class="pfz-hr"></div>' +
            '<div class="pfz-when"><span>' + pfzRuDateLong(iso) + '</span><i>' + esc(PF.daysUntilText(ev.date)) + '</i></div></div>';
    }
    var PFZ_FREQ_TX = { day: 'каждый день', week: 'раз в неделю', month: 'раз в месяц' };
    var PFZ_SNAP_FREQ_ATTR = ' data-snapfreq';
    function pfzSnapCard(p) {
        var last = pfzLastSnap(p);
        var today = PF.todayStr();
        var y = new Date(); y.setDate(y.getDate() - 1);
        var yIso = y.getFullYear() + '-' + PF.pad2(y.getMonth() + 1) + '-' + PF.pad2(y.getDate());
        var lbl = last ? (last.d === yIso ? 'вчера' : ruDate(last.d)) : null;
        var m = (PF.snaps || {})[p.id] || {};
        var body = last
            ? '<div class="pfz-srow"><span>Последний · ' + lbl + '</span><b data-money>' + fmtRub(last.v) + '</b></div>' +
              '<div class="pfz-srow"><span>Автозапись</span><b class="q"' + PFZ_SNAP_FREQ_ATTR + '>' + (PFZ_FREQ_TX[PF.snapFreq ? PF.snapFreq() : 'day'] || 'каждый день') + '</b></div>'
            : m[today] != null
                ? '<div class="pfz-srow"><span>Первый · сегодня</span><b data-money>' + fmtRub(m[today]) + '</b></div>' +
                  '<div class="pfz-srow"><span>Автозапись</span><b class="q"' + PFZ_SNAP_FREQ_ATTR + '>' + (PFZ_FREQ_TX[PF.snapFreq ? PF.snapFreq() : 'day'] || 'каждый день') + '</b></div>'
                : '<div class="pfz-quiet">Снимков ещё нет: первый запишется при живых котировках. Календарь уже работает — можно записать задним числом.</div>';
        return '<div class="pfz-tile pfz-snap"><i>Снимки капитала</i>' + body +
            '<button type="button" class="pfz-snapo' + (PF.pfptSnapsOpen[p.id] ? ' on' : '') + '" onclick="pfxPtSnapsToggle(\'' + jsArg(p.id) + '\')">' +
                PFSC_PULSE_SVG + '<span>Календарь снимков</span><em>' + NOTE_CHEVR_SVG + '</em></button></div>';
    }
    // узкая лента: те же четыре факта одной строкой плиток (2×2 в самой узкой)
    function pfzBandHtml(p, c, dd) {
        var mv = pfzMoves(p, c);
        var lead = mv.list[0];
        var pctOf = lead && mv.total > 0 ? Math.round(Math.abs(lead.d) / mv.total * 100) : 0;
        var ev = pfzNextPay(p);
        var last = pfzLastSnap(p);
        var m = (PF.snaps || {})[p.id] || {};
        var snapV = last ? last.v : m[PF.todayStr()];
        var iso = ev ? PF.dateToIso(ev.date) : '';
        return '<div class="pfz-band">' +
            '<div class="pfz-tile pfz-hero"><i>Капитал</i><b data-money>' + fmtRub(c.value) + '</b>' +
                (dd != null
                    ? '<span class="bs ' + (dd >= 0 ? 'pos' : 'neg') + '" data-money>' + (dd >= 0 ? '▲' : '▼') + ' ' + fmtRub(Math.abs(dd)) + '</span>'
                    : '<span class="bs">со второго дня</span>') + '</div>' +
            '<div class="pfz-tile"><i>Движение дня</i>' +
                (lead ? '<span class="bv" data-money>' + (lead.d >= 0 ? '+' : '−') + fmtRub(Math.abs(lead.d)) + ' · ' + esc(lead.tk) + '</span>' +
                        '<span class="bs">' + pctOf + '% дневного движения</span>'
                      : '<span class="bv q">—</span><span class="bs">появится с котировками</span>') + '</div>' +
            '<div class="pfz-tile pfz-pay"><i>Выплата</i>' +
                (ev ? '<b class="pos" data-money>+' + fmtRub(ev.amount) + '</b><span class="pfz-what">' + ruDate(iso).slice(0, 5) + ' · ' + esc(PF.daysUntilText(ev.date)) + '</span>'
                    : '<span class="bv q">—</span><span class="bs">не ожидается</span>') + '</div>' +
            '<button type="button" class="pfz-tile pfz-tbtn' + (PF.pfptSnapsOpen[p.id] ? ' on' : '') + '" onclick="pfxPtSnapsToggle(\'' + jsArg(p.id) + '\')"><i>Снимки</i>' +
                (snapV != null ? '<span class="bv" data-money>' + fmtRub(snapV) + (last ? ' · ' + (last.d === (function(){var d=new Date();d.setDate(d.getDate()-1);return d.getFullYear()+'-'+PF.pad2(d.getMonth()+1)+'-'+PF.pad2(d.getDate());})() ? 'вчера' : ruDate(last.d).slice(0, 5)) : ' · сегодня') + '</span>'
                            : '<span class="bv q">—</span>') +
                '<span class="bs">календарь по клику</span></button>' +
        '</div>';
    }
    function pfzStripHtml(p, c, i, extraMeta) {
        var ac = colorVal(p.color);
        var warm = PF.pfCardWarming && PF.pfCardWarming(p);
        var stale = !warm && PF.quotesTs && (Date.now() - PF.quotesTs > 15 * 60000);
        var meta;
        if (extraMeta != null) meta = extraMeta;
        else {
            var n = c.hs.length;
            var when = PF.quotesTs ? new Date(PF.quotesTs) : null;
            var hhmm = when ? PF.pad2(when.getHours()) + ':' + PF.pad2(when.getMinutes()) : '';
            meta = n + ' ' + PF.plural(n, 'бумага', 'бумаги', 'бумаг') + (warm
                ? ' · котировки загружаются…'
                : stale ? '' : (hhmm ? ' · котировки ' + hhmm : ''));
            if (stale) return pfzStripCore(p, i, '<span class="pfz-meta stale">' +
                n + ' ' + PF.plural(n, 'бумага', 'бумаги', 'бумаг') + ' · котировки устарели · ' + hhmm + '</span>');
        }
        return pfzStripCore(p, i, '<span class="pfz-meta">' + meta + '</span>');
    }
    function pfzStripCore(p, i, metaHtml, noRebal) {
        var ac = colorVal(p.color);
        var GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg>';
        return '<div class="pfz-strip">' +
            '<span class="pfz-dot" style="background:' + ac + '"></span>' +
            '<span class="pfc-name" onclick="pfNameEdit(\'' + p.id + '\',event)" title="Нажмите, чтобы переименовать"><span class="pfc-name-ink">' + esc(p.name) + '</span></span>' +
            metaHtml +
            '<span class="pfz-sp"></span>' +
            (i === 0 ? pfdInChromeHtml('pdetail') : '') +
            // пустому составу ребалансировать нечего — кнопки нет (мокап v3, состояние 2)
            (noRebal ? '' : '<button class="pfc-rebal pfpt-rebal" onclick="pfExpand(\'' + p.id + '\')">' + PF.REBAL_SVG + 'Ребалансировать</button>') +
            '<button class="pfc-act" onclick="pfxPortSettings(\'' + p.id + '\')" title="Настройки портфеля" aria-label="Настройки портфеля">' + GEAR + '</button>' +
        '</div>';
    }
    // состояние «Загрузка»: скелетоны формы контента (лента + строки по числу бумаг)
    function pfzSkeletonHtml(p, c, i) {
        function tile() {
            return '<div class="pfz-tile">' + skelHtml(52, 8) + '<span class="pfz-skgap"></span>' + skelHtml(84, 15) + '<span class="pfz-skgap"></span>' + skelHtml(64, 8) + '</div>';
        }
        function row() {
            return '<tr class="pfpt-tr"><td>' + skelHtml(170, 13) + '<br>' + skelHtml(96, 9) + '</td>' +
                '<td class="pfz-nkd"></td>' +
                '<td class="pfpt-num">' + skelHtml(64, 11) + '</td>' +
                '<td class="pfz-shrc">' + skelHtml(52, 11) + '</td><td class="pfpt-num pfz-wc">' + skelHtml(56, 11) + '</td>' +
                '<td class="pfz-chipc">' + skelHtml(52, 18) + '</td></tr>';
        }
        var n = Math.max(2, Math.min(c.hs.length || 3, 8)), rows = '';
        for (var k = 0; k < n; k++) rows += row();
        return pfzStripHtml(p, c, i, c.hs.length + ' ' + PF.plural(c.hs.length, 'бумага', 'бумаги', 'бумаг') + ' · котировки загружаются…') +
            '<div class="pfz-band on">' + tile() + tile() + tile() + tile() + '</div>' +
            '<div class="pfpt-tablewrap"><table class="pfpt-table pfz-tbl"><tbody>' +
            '<tr class="pfz-hd"><th>Бумага</th><th class="pfz-nkd"></th>' +
            '<th class="pfpt-num">Стоимость</th><th class="pfpt-num">Доля</th>' +
            '<th class="pfpt-num pfz-wc">Доход</th>' +
            '<th class="pfpt-num">Годовых</th></tr>' + rows + '</tbody></table></div>';
    }
    // состояние «Пусто»: объяснение и ОДНО действие; плитки — прочерки, не нули
    function pfzEmptyHtml(p, i) {
        function dashTile(lbl, sub) {
            return '<div class="pfz-tile"><i>' + lbl + '</i><span class="bv q">—</span><span class="bs">' + sub + '</span></div>';
        }
        return pfzStripCore(p, i, '<span class="pfz-meta">0 бумаг</span>', true) +
            '<div class="pfz-band on">' +
                dashTile('Капитал', 'после первой покупки') + dashTile('Движение дня', 'появится с котировками') +
                dashTile('Выплата', 'не ожидается') + dashTile('Снимки', 'после первого дня') +
            '</div>' +
            '<div class="pfz-empty"><b>Состав пуст</b>' +
                '<span>Добавьте бумаги в настройках портфеля — таблица, доли и доходность соберутся сами.</span>' +
                '<button type="button" class="pfc-rebal pfpt-rebal" onclick="pfxPortSettings(\'' + jsArg(p.id) + '\')">Добавить активы</button></div>';
    }
    function pfxTabPortsHtml() {
        var vis = visibleItems();
        // область виджета (2026-07-30): «Составы» умеют показывать ОДИН портфель —
        // выбор задаётся при добавлении из пикера или в настройках виджета ⚙ и
        // живёт в PF.dashCfg.pdPf; исчезнувший портфель мягко откатывает на «Все»
        var pdScope = PF.dashCfg.pdPf || 'all';
        if (pdScope !== 'all') {
            var one = vis.filter(function (p) { return p.id === pdScope; });
            // вкладка-портфель СКРЫТОГО портфеля: visibleItems его не отдаёт, но
            // вкладка — единственное место, где он виден (R9.2)
            if (!one.length && pfxIsPfTab(PF.dashTab) && PF.dashTab.slice(3) === pdScope) {
                var ownP = findPf(pdScope);
                if (ownP) one = [ownP];
            }
            if (one.length) vis = one;
        }
        // Пустое состояние области — в обёртке со своими кнопками (PFD_OWN_CHROME)
        if (!vis.length) {
            return '<div class="pfx-ports"><div class="dash2-card pf-card2 pfpt-card">' +
                PF.pfCardHead('', 'Составы портфелей', 'полные таблицы бумаг каждого портфеля', pfdInChromeHtml('pdetail')) +
                (PF.store.items.length ? PF.allHiddenHtml() : PF.emptyHtml()) +
            '</div></div>';
        }
        return '<div class="pfx-ports">' + vis.map(function (p, i) {
            var c = calcPf(p), ac = colorVal(p.color);
            var open = function (inner) {
                return '<div class="dash2-card pf-card2 pfpt-card pfz-card' + (PF.pfptSnapsOpen[p.id] ? ' pfz-snapopen' : '') +
                    '" data-pid="' + esc(p.id) + '" style="--pf-accent:' + ac + '">' + inner + '</div>';
            };
            // состояние 2: пусто — объяснение и одно действие
            if (!c.hs.length) return open(pfzEmptyHtml(p, i));
            // состояние 1: загрузка — скелетоны формы контента (self-gasящаяся:
            // pfQuotesWarming живёт только пока fetch в полёте)
            if (PF.pfCardWarming && PF.pfCardWarming(p)) return open(pfzSkeletonHtml(p, c, i));
            var dd = dayDelta(p, c.value);
            // состояние 3: биржа недоступна — данные ОСТАЮТСЯ (цены покупки),
            // янтарная плашка называет причину и даёт «Повторить»
            var anyTicker = c.hs.some(function (x) { return !!x.h.ticker; });
            var offline = anyTicker && !c.hs.some(function (x) { return x.c.live; });
            var alert = offline
                ? '<div class="pfz-alert">Биржа недоступна<span>· показаны цены покупки</span>' +
                  '<button type="button" class="re" onclick="PF.ensureQuotes(true)">Повторить</button></div>'
                : '';
            // Календарь снимков раскрывается ВНИЗУ БОКОВОЙ КОЛОНКИ (правка
            // 2026-08-05): раньше секция вставлялась под шапку во всю ширину и
            // отжимала таблицу вниз. Теперь это последняя секция панели — прямо
            // под плиткой, из которой её открыли.
            var snapsBlock = PF.pfptSnapsOpen[p.id] ? pfxPtSnapsHtml(p, c) : '';
            return open(
                pfzStripHtml(p, c, i) + alert +
                '<div class="pfz-body">' +
                    '<div class="pfz-main">' + pfzBandHtml(p, c, dd) + pfzTableHtml(p, c) + '</div>' +
                    '<aside class="pfz-side">' + pfzHeroCard(p, c, dd) + pfzAllocCard(p, c) + pfzMoveCard(p, c) + pfzPayCard(p) + pfzSnapCard(p) + snapsBlock + '</aside>' +
                '</div>');
        }).join('') + '</div>';
    }
    // История MOEX (PF.chartRaw) нужна календарю снимков для записи задним числом.
    // Обычно её греет карточка портфеля (pfmChart → loadPfChart), но если карточку
    // с вкладки убрали — догреваем сами для открытых секций снимков.
    PF.pfxPortChartsRepaint = function () {
        visibleItems().forEach(function (p) {
            if (PF.pfptSnapsOpen[p.id] && !PF.chartRaw[p.id]) PF.loadPfChart(p.id);
        });
    };
    // R8: только видимость ПОРТФЕЛЕЙ (глобальная). Тумблеров секций тут не было и
    // не будет: виджет убирают корзиной на его же карточке, а возвращают из пикера —
    // скрытие осталось одно и только у портфеля (см. eyeWrapHtml в portfolios.js).
    function pfxVisRowsHtml() {
        var rows = '<div class="pf-impgrp">Портфели</div>';
        PF.store.items.forEach(function (p) {
            var off = !!p.hidden, c = calcPf(p);
            rows += '<button class="pf-impitem pf-eyeitem' + (off ? ' off-eye' : '') + '" onclick="pfToggleHidden(\'' + p.id + '\',event)">' +
                '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                '<span class="pf-impbody"><b>' + esc(p.name) + '</b><i>' + fmtRub(c.value) + (off ? ' · скрыт' : '') + '</i></span>' +
                '<span class="pf-eyestate">' + (off ? PF.EYEOFF_SVG : PF.EYE_SVG) + '</span></button>';
        });
        rows += '<div class="pf-eyenote">Скрытый портфель выходит из учёта: его нет в сетке и календаре, а деньги не входят в суммы, KPI и графики. В перечнях («Список портфелей», лидерборд сводки) он остаётся с пометкой. Виджеты здесь не прячутся: лишний убирает корзина на его карточке, вернуть — кнопкой «Виджет».</div>';
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
    PF.PFX_TABS = PFX_TABS; PF.pfxActivateTab = pfxActivateTab; PF.pfxBgRowHtml = pfxBgRowHtml;
    PF.pfxDrawerSync = pfxDrawerSync; PF.pfxDropPfTab = pfxDropPfTab; PF.pfxFabSeen = pfxFabSeen;
    PF.pfxFabSync = pfxFabSync; PF.pfxFlashBlock = pfxFlashBlock; PF.pfxGoOverviewFor = pfxGoOverviewFor;
    PF.pfxOpenPfTabs = pfxOpenPfTabs; PF.pfxPanelWrap = pfxPanelWrap; PF.pfxSaveOpenTabs = pfxSaveOpenTabs; PF.pfxSeedLayout = pfxSeedLayout;
    PF.pfxSetCardHtml = pfxSetCardHtml; PF.pfxSyncPath = pfxSyncPath; PF.pfxTabPortsHtml = pfxTabPortsHtml;
    PF.pfxVisRowsHtml = pfxVisRowsHtml; PF.pfxWide = pfxWide;
    PF.pfxTradingHtml = pfxTradingHtml;
})();
