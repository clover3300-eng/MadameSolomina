// ===== ВКЛАДКА «ПОРТФЕЛИ» · КАРКАС РЕНДЕРА (ПОСЛЕДНИЙ файл цепочки #pfLazySrc) =====
// Дирижёр вкладки: renderPortfolios/renderSmooth/softRerender, сводка,
// «Видимость», LIVE-таймер, пустые состояния — и ИНТЕГРАЦИЯ в хвосте
// (обёртка switchTab, подхват __pfSub, первичный рендер).
//
// Цепочка модулей (порядок несущий, задаёт #pfLazySrc в index.html):
//   portfolios-core.js     — данные и расчёт; СОЗДАЁТ window.PF
//   portfolios-dash.js     — дашборд-конструктор (сетка, пикер, раскладки)
//   portfolios-widgets.js  — виджеты Обзора (заметки, KPI, капитал, новости…)
//   portfolios-payouts.js  — календари выплат и «Дивиденды и купоны»
//   portfolios-tabs.js     — герой, подвкладки/чипы, deep-link
//   portfolios-cards.js    — карточка портфеля, шторка настроек, действия
//   portfolios-trades.js   — история сделок и ребаланс-оверлей
//   portfolios-trading.js  — терминал подвкладки «Торговля» (стакан, тикет, заявки)
//   portfolios-broker-pf.js— карточка-портфель из Т-Инвестиций (авто-синк счёта, №10)
//   portfolios-chart.js    — график свечей терминала (KLineChart, блок trade:chart)
//   portfolios-screens.js  — экраны «Торговли»: парящая полоса внизу подвкладки
//   portfolios.js          — этот файл; window.renderPortfolios объявляется
//                            ЗДЕСЬ — сентинел «цепочка загружена» для
//                            ensurePortfoliosJs (webapp-tabs.js)
// Правила неймспейса PF: мутабельное общее состояние — ТОЛЬКО свойствами PF
// (store, quotesTs, dashCfg, openMenu…), алиасы разрешены на функции и
// константы из РАНЬШЕ загруженных файлов; имена ПОЗЖЕ загружаемых — через
// PF.* в момент вызова.
(function () {
    'use strict';
    var PF = window.PF;
    // --- импорт ядра: функции и стабильные объекты (алиасы). Мутабельное
    //     состояние ядра — ТОЛЬКО через PF.store, PF.quotesTs и т.д. ---
    var dq = PF.dq, esc = PF.esc, attr = PF.attr, jsArg = PF.jsArg, toNum = PF.toNum, genId = PF.genId;
    var clamp = PF.clamp, fmtRub = PF.fmtRub, fmtPrice = PF.fmtPrice, fmtPct = PF.fmtPct, fmtQty = PF.fmtQty, pad2 = PF.pad2;
    var todayStr = PF.todayStr, ruDate = PF.ruDate, toast = PF.toast, MAX_CARDS = PF.MAX_CARDS, COLORS = PF.COLORS, BOND_PRICE_TIP = PF.BOND_PRICE_TIP;
    var CARDVIEW_KEY = PF.CARDVIEW_KEY, CHART_WARN_SVG = PF.CHART_WARN_SVG, saveStore = PF.saveStore, makePortfolio = PF.makePortfolio, findPf = PF.findPf, findHold = PF.findHold;
    var visibleItems = PF.visibleItems, colorVal = PF.colorVal, ensureLots = PF.ensureLots, aggHolding = PF.aggHolding, calcHold = PF.calcHold, calcPf = PF.calcPf;
    var dayDelta = PF.dayDelta, topMover = PF.topMover, recordSnapshots = PF.recordSnapshots, snaps = PF.snaps, quotes = PF.quotes, ensureQuotes = PF.ensureQuotes;
    var liveBond = PF.liveBond, bondFace = PF.bondFace, bondQuotes = PF.bondQuotes, bondNkdNow = PF.bondNkdNow, pfQuotesWarming = PF.pfQuotesWarming, pfCardWarming = PF.pfCardWarming;
    var skelHtml = PF.skelHtml, noQuoteCell = PF.noQuoteCell, dateToIso = PF.dateToIso, niceTicks = PF.niceTicks, pfBench = PF.pfBench, loadPfChart = PF.loadPfChart;
    var getCalcComposition = PF.getCalcComposition, getFavComposition = PF.getFavComposition, getMonthlyComposition = PF.getMonthlyComposition, compositionFrom = PF.compositionFrom, importName = PF.importName, fullBondId = PF.fullBondId;
    var lookupHistPrice = PF.lookupHistPrice, lookupHistNkd = PF.lookupHistNkd, bondDetail = PF.bondDetail, parseBondDate = PF.parseBondDate, coupSched = PF.coupSched, divSched = PF.divSched;
    var ensureSchedule = PF.ensureSchedule, qtyAtDate = PF.qtyAtDate, pfPayouts = PF.pfPayouts, pfParseAnyDate = PF.pfParseAnyDate;
    // --- экспорт в ядро: его колбэки зовут эти функции через PF.* 
    //     (function-декларации хойстятся — блок валиден в начале файла) ---
    PF.softRerender = softRerender;
    // импорт конструктора (portfolios-dash.js, загружен до нас):
    var dashCfgFor = PF.dashCfgFor, pfLayoutCfgPopHtml = PF.pfLayoutCfgPopHtml, pfPresetsFetch = PF.pfPresetsFetch, pfWGatesFetch = PF.pfWGatesFetch, pfdActive = PF.pfdActive;
    var pfdBodyHtml = PF.pfdBodyHtml, pfdBusy = PF.pfdBusy, pfdCfgRemountSoon = PF.pfdCfgRemountSoon, pfdInChromeHtml = PF.pfdInChromeHtml, pfdLive = PF.pfdLive;
    var pfdNormNote = PF.pfdNormNote, pfdPushUndo = PF.pfdPushUndo, pfdQuiet = PF.pfdQuiet, pfdRepackSoon = PF.pfdRepackSoon, pfdRerender = PF.pfdRerender;
    var pfdSchedulePack = PF.pfdSchedulePack, pfdScrollToBlock = PF.pfdScrollToBlock, pfdStandardCfg = PF.pfdStandardCfg, pflInitPreview = PF.pflInitPreview, pfxEffTab = PF.pfxEffTab;
    var pfxIsPfTab = PF.pfxIsPfTab, pfxSyncCfg = PF.pfxSyncCfg, saveDashCfg = PF.saveDashCfg, updateLayoutBtn = PF.updateLayoutBtn, DASH_KEY = PF.DASH_KEY;
    // импорт виджетов (portfolios-widgets.js, загружен до нас):
    var GO_ARROW_SVG = PF.GO_ARROW_SVG, NOTE_CHECK_SVG = PF.NOTE_CHECK_SVG, NOTE_CLOCK_SVG = PF.NOTE_CLOCK_SVG, NOTE_ICON_SVG = PF.NOTE_ICON_SVG, NOTE_TRASH_SVG = PF.NOTE_TRASH_SVG, PFP_SLIDERS_SVG = PF.PFP_SLIDERS_SVG;
    var favHtml = PF.favHtml, favTickers = PF.favTickers, newsHtmlCache = PF.newsHtmlCache, pfPlistSparksSoon = PF.pfPlistSparksSoon, pfd2 = PF.pfd2, pfdAllocCompute = PF.pfdAllocCompute;
    var pfdAllocHtml = PF.pfdAllocHtml, pfdAllocScope = PF.pfdAllocScope, pfdCapChartHtml = PF.pfdCapChartHtml, pfdCapChartHtmlB = PF.pfdCapChartHtmlB, pfdCapMaybeRepaint = PF.pfdCapMaybeRepaint, pfdCapRepaint = PF.pfdCapRepaint;
    var pfdCapSeries = PF.pfdCapSeries, pfdFlushNotes = PF.pfdFlushNotes, pfdHeatHtml = PF.pfdHeatHtml, pfdHeatRepaintSoon = PF.pfdHeatRepaintSoon, pfdKpiHtml = PF.pfdKpiHtml, pfdNewsHtml = PF.pfdNewsHtml;
    var pfdNewsList = PF.pfdNewsList, pfdNoteHtml = PF.pfdNoteHtml, pfdPanelActive = PF.pfdPanelActive, pfwAssetsHtml = PF.pfwAssetsHtml, pfwConcHtml = PF.pfwConcHtml, pfwIdxHtml = PF.pfwIdxHtml;
    var pfwMoversHtml = PF.pfwMoversHtml, pfwOpsHtml = PF.pfwOpsHtml, pfwPassiveHtml = PF.pfwPassiveHtml, pfwPlistHtml = PF.pfwPlistHtml, pfwPstructHtml = PF.pfwPstructHtml, pfwPsumHtml = PF.pfwPsumHtml;
    var pfwReportsHtml = PF.pfwReportsHtml, pfwSnapsHtml = PF.pfwSnapsHtml, pfwYieldHtml = PF.pfwYieldHtml, potentialOf = PF.potentialOf, ratesHtml = PF.ratesHtml, ratesStackHtml = PF.ratesStackHtml;
    var renderFavNews = PF.renderFavNews, renderPosNews = PF.renderPosNews;
    var DASH_TABS_KEY = PF.DASH_TABS_KEY, PFDCFG_GEAR_SVG = PF.PFDCFG_GEAR_SVG, PFD_NOTE_COLORS = PF.PFD_NOTE_COLORS, PFD_PLUS_SVG = PF.PFD_PLUS_SVG, pfTabCfgs = PF.pfTabCfgs;
    var pfTabsStore = PF.pfTabsStore;
    // импорт выплат (portfolios-payouts.js, загружен до нас):
    var FILTER_SVG = PF.FILTER_SVG, PFCM_WD = PF.PFCM_WD, calPfCandidates = PF.calPfCandidates, collectUpcomingPayouts = PF.collectUpcomingPayouts, daysUntilText = PF.daysUntilText, nextCouponDate = PF.nextCouponDate;
    var paymentCalendarHtml = PF.paymentCalendarHtml, pfcmCardHtml = PF.pfcmCardHtml, pfwDivsHtml = PF.pfwDivsHtml;
    // импорт подвкладок (portfolios-tabs.js, загружен до нас):
    var PFX_TABS = PF.PFX_TABS, pfxActivateTab = PF.pfxActivateTab, pfxBgRowHtml = PF.pfxBgRowHtml, pfxDrawerSync = PF.pfxDrawerSync;
    var pfxDropPfTab = PF.pfxDropPfTab, pfxFabSeen = PF.pfxFabSeen, pfxFabSync = PF.pfxFabSync, pfxFlashBlock = PF.pfxFlashBlock, pfxGoOverviewFor = PF.pfxGoOverviewFor;
    var pfxOpenPfTabs = PF.pfxOpenPfTabs, pfxPanelWrap = PF.pfxPanelWrap, pfxSaveOpenTabs = PF.pfxSaveOpenTabs, pfxSeedLayout = PF.pfxSeedLayout, pfxSetCardHtml = PF.pfxSetCardHtml, pfxSyncPath = PF.pfxSyncPath;
    var pfxTabPortsHtml = PF.pfxTabPortsHtml, pfxVisRowsHtml = PF.pfxVisRowsHtml, pfxWide = PF.pfxWide;
    // импорт карточек (portfolios-cards.js, загружен до нас):
    var XMARK_SVG = PF.XMARK_SVG, assetDisplayName = PF.assetDisplayName, cardHtml = PF.cardHtml, closeImpMenus = PF.closeImpMenus, menuHtml = PF.menuHtml;
    var paintPfChartMini = PF.paintPfChartMini, pfCardHead = PF.pfCardHead, pfConfirm = PF.pfConfirm, pfImpOutside = PF.pfImpOutside, repaintMiniCharts = PF.repaintMiniCharts;
    // импорт сделок и ребаланса (portfolios-trades.js, загружен до нас):
    var collectTrades = PF.collectTrades, hasAnyTrades = PF.hasAnyTrades, pfInvalidateCharts = PF.pfInvalidateCharts, rebalRepaint = PF.rebalRepaint, tradesHtml = PF.tradesHtml;
    // импорт брокерской карточки (portfolios-broker-pf.js, загружен до нас):
    var brokerPfSync = PF.brokerPfSync, brokerPfGet = PF.brokerPfGet, brokerPfAlive = PF.brokerPfAlive;

    // ====================================================================
    //  РЕНДЕР
    // ====================================================================
    PF.openMenu = null;     // id портфеля с раскрытыми настройками
    // R9.1: PF.openMenu показан ШТОРКОЙ поверх страницы (pfxPortSettings), а не меню
    // в карточке; пока true — карточное меню не рендерится (см. menuOn в cardHtml)
    PF.pfSetDrawerOn = false;
    PF.editHold = {};       // hid -> true: строка состава раскрыта в редактор (правка по клику)
    PF.addOpen = false;     // раскрыта ли форма «Добавить актив» в открытых настройках
    PF.colorsOpen = false;  // раскрыта ли палитра цвета в шапке настроек
    PF.delArm = false;      // раскрыта ли данжер-зона «Удалить портфель» в футере настроек
    var openRows = {};       // hid -> true: раскрыты ли субданные актива в мини-таблице карточки
    PF.menuJustOpened = false;
    var liveTimer = null;
    var rendering = false;   // защита от повторного входа (см. ниже)
    var loadStatus = {};     // hid -> { state:'loading'|'ok'|'err'|'nodate', date } для кнопки «Загрузить на дату»
    // Новости избранного: кэшируем готовый HTML по тикеру и грузим с ограничением
    // параллелизма (Apps Script медленный и на одном хосте с гугл-таблицами —
    // 12 параллельных запросов раньше «подвешивали» загрузку данных).
    var softTimer = null;    // дебаунс мягкого ре-рендера (котировки приходят пачкой)
    // Полный ре-рендер заново «рисует» все мини-графики с 1-секундной анимацией линии —
    // при переключении видимости/вида это выглядит как мерцание всей вкладки. Флаг
    // PF.noChartAnim на время такого ре-рендера рисует графики сразу в конечном состоянии.
    PF.noChartAnim = false;   // читает drawPfChart в ядре — только через PF
    function renderNoAnim() {
        PF.noChartAnim = true;
        renderPortfolios();
        // кешированные графики перерисовываются синхронно; запас — на microtask-хвосты
        setTimeout(function () { PF.noChartAnim = false; }, 250);
    }
    // Плавная перерисовка для пользовательских переключений («Видимость», вид карточек):
    // полный innerHTML-своп читается как мигание всей сетки. View Transitions кросс-фейдит
    // старое и новое состояние; after — колбэк после обновления DOM (вернуть попап .open).
    // Для фоновых обновлений котировок НЕ используется — там перерисовка должна быть незаметной.
    function renderSmooth(after) {
        var run = function () { renderNoAnim(); if (after) after(); };
        if (document.startViewTransition) {
            try { document.startViewTransition(run); return; } catch (e) {}
        }
        run();
    }

    // Следующий рендер НЕ возвращает прокрутку страницы: её осознанно задаёт вызывающий
    // (например, pfAddPortfolio уводит к новому портфелю наверх). Флаг одноразовый —
    // renderPortfolios гасит его сам, чтобы «отказ» не протёк на соседние перерисовки.
    PF.pfNoScrollKeep = false;
    function renderPortfolios() {
        var host = dq('pfWrap'); if (!host) return;
        // Во время активного жеста (перетаскивание/ресайз) или при открытом пикере
        // «Добавить блок» фоновые перерисовки (котировки приходят пачками) глушим:
        // innerHTML-своп оборвал бы жест или затёр живые превью пикера. В покое —
        // даже при живой сетке — обновления котировок идут как обычно. Собственные
        // перерисовки конструктора идут через pfdRerender() (флаг PF.pfdWantRender).
        if ((pfdBusy() || PF.dashEdit) && !PF.pfdWantRender) return;
        // курсор в «Заметках» — ФОНОВЫЙ innerHTML-своп (котировки) унёс бы фокус и
        // несохранённый хвост текста; такие рендеры откладываем до blur (автосейв
        // заметки идёт с дебаунсом). Явные рендеры конструктора (PF.pfdWantRender —
        // добавление/удаление заметки) пропускаем: они сами флашат текст. Проверяем
        // activeElement, а НЕ :focus — псевдокласс не матчится без фокуса окна ОС.
        var ae = document.activeElement;
        if (!PF.pfdWantRender && ae && ae.classList && ae.classList.contains('pfnt-tx') && host.contains(ae)) return;
        PF.pfdWantRender = false;
        // favHtml() синхронно дёргает stkEnsureLoaded(): если таблица акций уже
        // загружена, та сразу вызывает onStkCompaniesLoaded()→renderPortfolios(),
        // т.е. рендер вызывает сам себя. Без этого guard'а получается бесконечная
        // рекурсия — главный поток виснет, а каждый виток ещё и шлёт запросы
        // (ensureQuotes/renderFavNews), забивая пул соединений → не грузятся даже
        // другие сайты. Повторный вход просто игнорируем.
        if (rendering) return;
        rendering = true;
        PF.calcMemoBegin();   // R9.3: кэш calcPf живёт ровно один синхронный проход рендера
        try {
            ensureQuotes();
            // Раскладка: «Избранное» ВСЕГДА в правой колонке (.pf-topgrid-fav), независимо от
            // числа портфелей — слева (.pf-topgrid-left) сводка+карточки, справа избранное.
            // На узком экране (<1600px) колонка складывается в 1, избранное уходит вниз (см.
            // @media в CSS) — порядок в DOM (left затем fav) уже даёт нужный порядок на мобиле.
            //  • 0 портфелей → слева просто пустое состояние;
            //  • 1 портфель → БЕЗ сводки: карточка портфеля первой ячейкой, «Календарь выплат»
            //    рядом (той же высоты) занимает вторую ячейку сетки;
            //  • 2+ → сводка «Суммарный капитал» компактной карточкой в правой колонке
            //    ПОД «Избранным» (см. summaryCardHtml);
            //  • нечётное число портфелей (1 или 3) → календарь в свободной ячейке сетки,
            //    чётное — отдельной полноширинной карточкой под сеткой.
            var n = visibleItems().length;   // раскладка считает только ВИДИМЫЕ карточки
            // showHide = сработает ли ниже КОНСТРУКТОРНАЯ ветка (pfdBodyHtml) — та же
            // проверка, что решает branch на пару строк ниже (pfdActive()). Считаем её
            // здесь заранее: favStr — ОДНА строка на оба branch'а (constructor/classic),
            // и хвост скрытия нужен только там, где карточка обёрнута в .pfd-item с
            // «Видимостью» в шапке — в классической правой колонке скрывать нечем.
            var favStr = favHtml(pfdActive());
            // Календарь выплат показывать не о чем (нет ни облигаций, ни акций с известными
            // будущими дивидендами) → не рендерим его вовсе, а на его место — и в свободной
            // ячейке сетки, и внизу колонки — встают компактные «Ставки рынка» (см.
            // ratesStackHtml). Условие пересчитывается на КАЖДЫЙ рендер, поэтому само
            // подхватывает любое изменение состава и приход расписаний дивидендов.
            var hasVisibleHoldings = PF.store.items.some(function (p) { return !p.hidden && (p.holdings || []).length > 0; });
            var noBonds = hasVisibleHoldings && !calPfCandidates().length;
            // В узком виде (3 карточки в ряд) остаток от деления на 3 определяет, сколько
            // ячеек ряда календарь должен занять: 1 портфель → 2 ячейки (растягивается до
            // «Избранного»), 2 портфеля → 1 ячейка (третий блок в ряду). В обычном виде
            // (2 в ряд) логика та же на остатке от 2 — как было раньше.
            var cols = PF.cardViewMode === 'narrow' ? 3 : 2;
            var rem = n % cols;
            var needCell = n > 0 && rem !== 0;
            var calSpan = needCell ? cols - rem : 1;
            // noBonds=true → «Ставки рынка» вместо календаря (и в ячейке, и внизу колонки —
            // без большого бокса, см. ratesStackHtml); иначе — обычный «Календарь выплат»
            var cellCard = noBonds ? ratesStackHtml(needCell, calSpan) : paymentCalendarHtml(needCell, calSpan);
            // ---- первичная раскладка-референс (радиус карточек — один, из CSS) ----
            pfxSyncCfg();      // R8: PF.dashCfg = конфиг активной подвкладки
            pfxSeedLayout();
            // R8: у КАЖДОЙ подвкладки свой дашборд-конструктор (pfdBodyHtml с её
            // конфигом), «Обзор» дополнительно умеет классический вид.
            // Обёртка #pfxTabPanel нужна только на широком экране с портфелями —
            // на неё завязаны отступы полноэкранных сцен (css/broker.css).
            var wrapPanel = (PF.store.items.length && pfxWide())
                ? pfxPanelWrap : function (x) { return x; };
            var body;
            if (PF.pfxIsTradeTab(pfxEffTab())) {
                // «Торговля», раунд 2 «Эволюция»: сцена всегда полноэкранная и
                // рисует свой хром (строку среды) — герой, ряд подвкладок и
                // конструктор .pfd-grid здесь не используются вовсе. Нет
                // торгующего подключения — гейт по состоянию брокера
                // (стекло trading-gate-glass) — см. pfxTradingHtml в portfolios-tabs.js
                body = (PF.pftTradeReady && PF.pftTradeReady() && PF.pftSceneHtml)
                    ? PF.pftSceneHtml()
                    : wrapPanel(PF.pfxTradingHtml());
            } else if (pfxEffTab() === 'rebal') {
                // «Ребаланс» — пошаговый мастер (rebalance-wizard.js): подписчику
                // (в демо-режиме — всем) полноэкранная сцена #rbwBar со своим хромом;
                // гостю — карточка-гейт «войдите». См. PF.rbwSceneHtml/rbwGateHtml.
                body = (PF.rbwReady && PF.rbwReady() && PF.rbwSceneHtml)
                    ? PF.rbwSceneHtml()
                    : wrapPanel(PF.rbwGateHtml ? PF.rbwGateHtml() : '');
            } else if (pfxEffTab() !== 'overview') {
                body = wrapPanel(pfdBodyHtml(favStr, noBonds));
            } else if (pfdActive()) {
                // Конструктор: пользовательская раскладка — единая 12-колоночная
                // сетка, порядок и размеры блоков из pf_dash_v1 (см. секцию выше)
                body = wrapPanel(pfdBodyHtml(favStr, noBonds));
            } else {
            var gridPart = gridHtml(needCell ? cellCard : '');
            // Календарь/ставки — ВНУТРИ левой колонки (не отдельным блоком во всю ширину
            // страницы), чтобы их ширина совпадала с шириной карточек портфеля и они не
            // «наезжали» визуально на колонку «Избранное» сбоку. Нижнюю полосу ставок
            // показываем только когда есть настоящий календарь — дублировать «Ставки рынка»
            // (уже занявшие место календаря) не нужно.
            // «История сделок» — ВСЕГДА самая нижняя секция ЛЕВОЙ колонки (после ставок
            // рынка), НЕ во всю ширину страницы: её правый край совпадает с краем карточек
            // портфеля / календаря, а не заезжает под «Избранное»/«Суммарный капитал» справа.
            var left = gridPart + (needCell ? '' : cellCard) + (noBonds ? '' : ratesHtml()) + tradesHtml();
            // Сводка по всем портфелям (2+) — компактной карточкой ПОД «Избранным» в правой
            // колонке. Рыночная лента (бывший LIVE-виджет) больше не карточка тут — она
            // вшита в фон глобального топ-бара, см. renderTopBarMarket().
            body = wrapPanel('<div class="pf-topgrid">' +
                    '<div class="pf-topgrid-left">' + left + '</div>' +
                    '<div class="pf-topgrid-fav">' + favStr + (PF.store.items.length >= 2 ? summaryCardHtml() : '') + '</div>' +
                '</div>');
            }
            // Позиции скролла внутренних списков (мини-таблица состава, календарь, избранное,
            // настройки): innerHTML-своп сбрасывал их в ноль на каждом фоновом обновлении
            // котировок — запоминаем по data-skey и возвращаем после пересборки.
            var keepScroll = {};
            Array.prototype.forEach.call(host.querySelectorAll('[data-skey]'), function (el) {
                if (el.scrollTop) keepScroll[el.getAttribute('data-skey')] = el.scrollTop;
            });
            // Прокрутка САМОЙ СТРАНИЦЫ: innerHTML-своп сперва выносит всё содержимое #pfWrap,
            // высота контейнера на этот момент схлопывается, и браузер зажимает его scrollTop
            // к нулю — новое содержимое приезжает уже «наверх». Из-за этого ЛЮБАЯ кнопка
            // вкладки (фильтры «Истории операций», «Все операции», раскрытие года, тумблеры
            // видимости) швыряла страницу в начало. Снимаем позицию до свопа и возвращаем
            // сразу после — синхронно, до пейнта, поэтому скачка не видно.
            // Прокрутку не ВОССТАНАВЛИВАЕМ, а не даём ей сбиться: подпираем #pfWrap его же
            // прежней высотой на время свопа. Иначе innerHTML сперва выносит всё содержимое,
            // высота схлопывается, браузер зажимает scrollTop контейнера к нулю — и любая
            // кнопка вкладки швыряла страницу в начало. Восстановление «постфактум» тут не
            // годится: новое содержимое дорастает до полной высоты только через кадр-другой
            // (мини-графики, canvas карты, fitBigSums), и возвращать позицию приходилось бы
            // асинхронно, воюя с фоновыми рендерами котировок. Подпорка снимается в rAF —
            // к этому моменту содержимое уже своей высоты; если оно ЧЕСТНО короче (фильтр
            // отсёк строки), браузер зажмёт прокрутку сам, и это правильно.
            var keepPage = !PF.pfNoScrollKeep;
            PF.pfNoScrollKeep = false;
            var pinH = keepPage ? host.offsetHeight : 0;
            if (pinH) host.style.minHeight = pinH + 'px';
            host.innerHTML = body;
            if (pinH) requestAnimationFrame(function () { host.style.minHeight = ''; });
            Array.prototype.forEach.call(host.querySelectorAll('[data-skey]'), function (el) {
                var k = el.getAttribute('data-skey');
                if (keepScroll[k]) el.scrollTop = keepScroll[k];
            });
            renderTopBarActions();
            renderTopBarMarket();
            tickLive();
            renderFavNews();
            renderPosNews();        // блок «Новости по позициям» (no-op, если не включён)
            PF.renderBrokerPos();   // блок «Позиции у брокера»: догрузка из API (no-op без виджета)
            brokerPfSync();         // карточка-портфель счёта Т-Инвестиций: тихий синк (троттл 60с, no-op без карточки)
            if (PF.pftAfterRender) PF.pftAfterRender();   // терминал «Торговли»: поллинг только на живой подвкладке
            if (PF.rbwAfterRender) PF.rbwAfterRender();   // мастер «Ребаланс»: Esc-навигация на живой сцене
            if (PF.pfcAfterRender) PF.pfcAfterRender();   // график свечей: живой canvas переезжает в свежий якорь
            if (PF.pftScreensSync) PF.pftScreensSync();   // парящая полоса экранов «Торговли» (в body, см. модуль)
            // блок «Карта рынка»: живые плитки СИНХРОННО, до пейнта — иначе бокс
            // мигает пустым на каждом ре-рендере вкладки (дебаунс 90мс остаётся
            // только у ресайзов, см. pfdHeatRepaintSoon)
            if (PF.pfdHeatRenderNow) PF.pfdHeatRenderNow(); else pfdHeatRepaintSoon();
            ensureLiveTick();
            var payBody = document.querySelector('.pf-paycal--cell .pfpc-body');
            if (payBody) window.pfPayCalScroll(payBody);   // начальное состояние затухания списка выплат
            repaintMiniCharts();   // мини-график доходности в герое каждой карточки
            if (PF.pfxPortChartsRepaint) PF.pfxPortChartsRepaint();   // кривая с бенчмарком на подвкладке «Портфель»
            pfPlistSparksSoon();   // спарклайны «Моих портфелей» без снимков — дорисовать из истории
            pfxDrawerSync();       // R9.1: шторка настроек портфеля обновляется вместе со страницей
            pfxFabSync();          // парящие узлы: слот столбика #cornerStack + панель действий #pfActBar
            if (PF.openMenu) {
                var m = dq('pfMenu-' + PF.openMenu); if (m) m.scrollTop = 0;
                // пустой портфель → сразу ставим фокус на ввод тикера (интуитивнее)
                if (PF.menuJustOpened) {
                    PF.menuJustOpened = false;
                    var op = findPf(PF.openMenu);
                    // preventScroll: фокус НЕ должен тащить страницу (иначе добавление/открытие
                    // нового портфеля внизу «прыгало» в начало — приходилось прокручивать обратно)
                    if (op && !((op.holdings || []).length)) { var inp = dq('pfNewTk-' + PF.openMenu); if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { try { inp.focus(); } catch (e2) {} } } }
                }
            }
            fitBigSums();   // крупные суммы (до 100 млрд ₽) — уменьшаем кегль, а не переносим/распираем
            recordSnapshots();   // дневной снимок стоимости — для чипа «сегодня ±X ₽»
            pfdSchedulePack();   // masonry: подтянуть короткие блоки вверх в зазоры (no-op вне конструктора)
            if (PF.pfdCfgFor) pfdCfgRemountSoon(PF.pfdCfgFor);   // открытый поповер настроек виджета переживает ре-рендер
            if (window.pfCfgPopRestore) window.pfCfgPopRestore();   // поповер раскладки — тоже (герой пересобран свопом)
            if (PF.dashEdit) pflInitPreview();   // карточка раскладки открыта — показать превью выбранного блока
        } finally {
            PF.calcMemoEnd();   // вне рендера calcPf всегда считает по свежим данным
            rendering = false;
        }
    }
    window.renderPortfolios = renderPortfolios;

    // Автоподгонка крупных сумм: «100 000 000 000 ₽» должна влезать в строку целиком —
    // без переноса «₽» и сдвига сетки. Герой КАРТОЧКИ сюда больше не входит: его кегль
    // ступенями задаёт heroValParts по числу цифр (scrollWidth при zoom 0.9 врёт).
    function fitBigSums() {
        document.querySelectorAll('#pfWrap .pfs2-capital').forEach(function (el) {
            el.style.fontSize = '';
            var size = parseFloat(getComputedStyle(el).fontSize) || 26;
            var guard = 0;
            while (el.scrollWidth > el.clientWidth + 1 && size > 14 && guard < 40) {
                size -= 0.5; el.style.fontSize = size + 'px'; guard++;
            }
        });
    }
    window.addEventListener('resize', function () { if (currentTab === 'portfolios' && dq('pfWrap')) fitBigSums(); });

    // ---- точечный фоновый апдейт (роадмап №6) ----
    // Пробегает патчеры виджетов (PF.livePatchers; каждый живёт в файле своей
    // htmlFn) — те переписывают ТОЛЬКО textContent/класс/title маленьких
    // data-live узлов через PF.liveSet (ядро). DOM не пересобирается, поэтому
    // вызов безопасен в любом состоянии UI (фокус, попапы, жесты, скроллы) и
    // в softRerender идёт ПЕРЕД гвардами полного рендера: даже когда полный
    // своп отложен (открыт попап/меню/жест/график), живые числа обновляются.
    // Полный рендер ниже по softRerender пока СОХРАНЯЕТСЯ: он покрывает ещё
    // не размеченные виджеты и структурные изменения (порядок строк по живому
    // P&L, приход расписаний выплат, скелетоны → разметка).
    function liveUpdate() {
        if (currentTab !== 'portfolios' || !dq('pfWrap')) return;
        if (!PF.liveBegin()) { PF.liveEnd(); return; }   // размеченных узлов нет — выходим тихо
        PF.calcMemoBegin();   // кэш calcPf на один синхронный проход — как у renderPortfolios
        try {
            for (var k in PF.livePatchers) {
                // патчеры независимы: поломка одного не должна отменять остальные
                try { PF.livePatchers[k](); } catch (e) {}
            }
        } finally {
            PF.calcMemoEnd();
            if (PF.liveEnd()) fitBigSums();   // сумма могла смениться на порядок — подгоняем кегль
        }
    }
    PF.liveUpdate = liveUpdate;

    // Котировки (акции пачкой, облигации по одной) приходят асинхронно, и каждая
    // приходит В РАЗНОЕ время (несколько облигаций = несколько отдельных fetch).
    // Раньше первый ответ планировал ре-рендер через 120мс и на этом дебаунс
    // «сгорал» — следующий ответ (даже через 150мс) снова полностью пересобирал
    // host.innerHTML → серия быстрых полных ре-рендеров подряд визуально мигает.
    // Теперь это trailing-дебаунс: каждый новый ответ ПЕРЕНОСИТ таймер вперёд, и
    // рендер срабатывает один раз — после того как все ответы за пачку утихли.
    function softRerender() {
        if (softTimer) clearTimeout(softTimer);
        softTimer = setTimeout(function () {
            softTimer = null;
            rebalRepaint();   // открытая карточка ребалансировки: живые цены/НКД пришли — обновить
            if (currentTab !== 'portfolios' || !dq('pfWrap')) return;
            liveUpdate();   // точечные числа — ВСЕГДА, даже когда полный рендер ниже отложен гвардами
            // Полный рендер на фоновый тик пока СОХРАНЁН (роадмап №6, этапы 1–6):
            // патчеры покрывают карточки, героя/«Панель управления», сводку,
            // «Список портфелей», KPI-плитки и «Сводные показатели», но
            //  • живые числа остались в «Графике капитала», «Распределении активов»
            //    (оба в СТАНДАРТНОЙ раскладке), «Мои портфели» (pdetail), «Лидерах
            //    дня», «Списке активов», «Доходности портфелей», «Диверсификации»,
            //    «Структуре», «Снимках», «Пассивном доходе», строках set:vis;
            //  • сам цикл подкачки котировок (ensureQuotes с TTL) и дневные снимки
            //    (recordSnapshots) живут внутри renderPortfolios — тик без полного
            //    рендера остановил бы и то и другое;
            //  • структурные softRerender (расписания выплат, детали облигаций,
            //    новости) обязаны пересобирать DOM в любом случае.
            // Отключать полный своп на тик можно только после покрытия остатка —
            // план в dev/ROADMAP.md (№6, продолжение).
            // Идёт жест (драг/ресайз), открыт пикер или ещё доигрывают анимации только что
            // отпущенной карточки — полный своп сейчас недопустим: он оборвёт жест/анимацию.
            // Раньше renderPortfolios просто отбрасывал такой рендер (ранний return), и на
            // авторизованном аккаунте — где есть живые котировки, а значит пачки ответов
            // каждые несколько секунд — своп регулярно попадал в «хвост» дропа: карточка
            // моргала и прыгала на месте. Теперь ПЕРЕЗАВОДИМ таймер: обновление не теряется,
            // а дожидается покоя.
            if (pfdQuiet()) { softRerender(); return; }
            if (PF.openMenu) return;   // не сбиваем открытый редактор
            if (document.querySelector('.pf-impmenu.open')) return;   // не сбиваем открытое меню «Импорт»
            // фоновое обновление (котировки/НКД/новости) — не «настоящее» изменение графика,
            // без PF.noChartAnim мини-графики каждый раз переигрывали 1-секундную анимацию
            // прорисовки → на глаз это читалось как мерцание карточек (см. renderNoAnim выше).
            renderNoAnim();
        }, 150);
    }

    // ---- СЛОТ В СЕРЕДИНЕ ШАПКИ (#topBarPfMarket) ----
    // Слот исторически носил рыночную ленту IMOEX/USD/BTC (скрыта с 2026-07-14),
    // потом ряд подвкладок «Портфелей» (снят 2026-07-28 — второй уровень уехал в
    // колонку сайдбара). Держим его пустым и скрытым, а не удаляем: слот общий
    // для вкладок (.topbar-tab-market), и обёртка switchTab им управляет.
    function renderTopBarMarket() {
        var host = document.getElementById('topBarPfMarket'); if (!host) return;
        if (host.__pfxHtml) { host.innerHTML = ''; host.__pfxHtml = ''; }
        host.style.display = 'none';
        if (window.sbCtxSync) window.sbCtxSync();   // вместо ряда пересобираем колонку
    }
    // Рыночной ленты в шапке больше нет — живые значения нужны только виджету
    // «Рынок сейчас» (pfwIdxHtml); источник прежний: скрытые span'ы дашборда
    // Плитки рынка форматируют числа по-английски («79.86 ₽», «-0.06%»), а весь
    // остальной проект — по-русски: запятая в дробях и типографский минус (см.
    // fmtRub/fmtPct). В одном виджете рядом с портфельными числами эта разница
    // бросается в глаза, поэтому переводим на лету.
    function ruNum(s) { return String(s).replace(/(\d)\.(\d)/g, '$1,$2').replace(/^-/, '−'); }
    function tickLive() {
        [['imoex', 'val-imoex', 'dyn-imoex'], ['usd', 'val-usdrub', 'dyn-usdrub'], ['btc', 'val-btc', 'dyn-btc']].forEach(function (p) {
            var sv = dq(p[1]), sd = dq(p[2]);
            var s = sv ? (sv.textContent || '').trim() : '';
            var d = sd ? (sd.textContent || '').trim() : '';
            var cls = sd ? (sd.classList.contains('negative') ? 'neg' : (sd.classList.contains('positive') ? 'pos' : 'flat')) : 'flat';
            var wv = dq('pfxidx-v-' + p[0]), wc = dq('pfxidx-c-' + p[0]);
            if (wv && s) wv.textContent = ruNum(s);
            if (wc && sd) { wc.textContent = ruNum(d); wc.className = 'pfix-c ' + cls; }
        });
    }
    function ensureLiveTick() { if (liveTimer) return; liveTimer = setInterval(function () {
        if (currentTab === 'portfolios' && dq('pfxidx-v-imoex')) tickLive(); }, 1000); }

    // ---- SVG-иконки ----
    var PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    var DL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    var CHEV_SVG = '<svg class="pf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var UNDO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>';
    // «Подтянуть на дату» — календарь со стрелкой загрузки (в полях цены/НКД)
    var FETCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/><polyline points="9.5 14 12 16.5 14.5 14"/><line x1="12" y1="12" x2="12" y2="16.5"/></svg>';
    var INFO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    // бэкап: «щит» (кнопка), «выгрузить в файл» (стрелка вниз в лоток), «загрузить из файла» (стрелка вверх)
    var SHIELD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    var UPLOAD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    // иконки источников в меню «Импорт» — калькулятор / звезда (избранное) / кошелёк (доход)
    var IMPCALC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="8" y2="12.01"/><line x1="12" y1="12" x2="12" y2="12.01"/><line x1="16" y1="12" x2="16" y2="12.01"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="12" y1="16" x2="12" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/></svg>';
    var IMPFAV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2.8 14.9 9 21.7 9.9 16.8 14.5 18 21.2 12 18 6 21.2 7.2 14.5 2.3 9.9 9.1 9"/></svg>';
    var IMPMON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><circle cx="16.5" cy="15" r="1.4" fill="currentColor" stroke="none"/></svg>';
    // «Из CSV-файла» — лист со строками (брокерский отчёт)
    var IMPCSV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><polyline points="14 2.5 14 8 19.5 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>';
    // «Из Т-Инвестиций» — банк (контур виджета «Позиции у брокера»)
    var IMPBANK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>';
    // глаз / перечёркнутый глаз — управление видимостью карточек портфелей
    var EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYEOFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a19.3 19.3 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.9 9.9 0 0 1 12 4c6.5 0 10 7 10 7a19.4 19.4 0 0 1-3.23 4.35"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

    // ---- меню «Импорт» (расчёт / избранное / ежемесячный доход) ----
    // Каждый источник — карточка с иконкой, названием и подписью: если данные есть — сколько
    // позиций перенесётся, если нет — почему пункт недоступен (понятнее, чем просто «серая кнопка»)
    function impMenuHtml(key, pid) {
        // в шапке и в приглашении пустого портфеля меню раскрывается вниз (места достаточно),
        // в остальных местах (низ карточки настроек) — вверх, чтобы не обрезалось
        var up = key !== 'head' && key.indexOf('none-') !== 0;
        var calcAll = getCalcComposition('all'), calcS = getCalcComposition('stock'), calcB = getCalcComposition('bond'),
            fav = getFavComposition(), mon = getMonthlyComposition();
        function oc(src, sub) { return "pfImport('" + src + "'," + (sub ? "'" + sub + "'" : 'null') + ',' + (pid ? "'" + pid + "'" : 'null') + ')'; }
        function posWord(n) { return n + ' ' + plural(n, 'позиция', 'позиции', 'позиций'); }
        function card(src, sub, ico, title, emptyMsg, list, breakdown) {
            var n = list ? list.length : 0, avail = n > 0;
            return '<button class="pf-impitem' + (avail ? '' : ' off') + '"' + (avail ? '' : ' disabled') +
                ' onclick="' + oc(src, sub) + '">' +
                '<span class="pf-impico">' + ico + '</span>' +
                '<span class="pf-impbody"><b>' + title + '</b><i>' + (avail ? (posWord(n) + (breakdown || '')) : emptyMsg) + '</i></span>' +
                (avail ? '<span class="pf-impgo">' + CHEV_SVG + '</span>' : '') +
            '</button>';
        }
        // явно показываем, что в расчёте учтены ТОЛЬКО акции и облигации (не весь состав калькулятора)
        var nS = calcS ? calcS.length : 0, nB = calcB ? calcB.length : 0;
        var calcBreakdown = (nS || nB)
            ? ' · ' + nS + ' ' + plural(nS, 'акция', 'акции', 'акций') + ', ' + nB + ' ' + plural(nB, 'облигация', 'облигации', 'облигаций') : '';
        var subRow = (nS || nB)
            ? '<div class="pf-impsubs">' +
                (nS ? '<button class="pf-impchip" onclick="' + oc('calc', 'stock') + '">Только акции · ' + nS + '</button>' : '') +
                (nB ? '<button class="pf-impchip" onclick="' + oc('calc', 'bond') + '">Только облигации · ' + nB + '</button>' : '') +
            '</div>' : '';
        // импорт из CSV-файла (брокерский отчёт): всегда доступен, pid прокидывается в клик
        var csvItem = '<button class="pf-impitem" onclick="pfCsvClick(' + (pid ? "'" + pid + "'" : 'null') + ')">' +
            '<span class="pf-impico">' + IMPCSV_SVG + '</span>' +
            '<span class="pf-impbody"><b>Из CSV-файла</b><i>отчёт брокера: тикер · дата · цена · кол-во · [НКД]</i></span>' +
            '<span class="pf-impgo">' + CHEV_SVG + '</span></button>';
        // «Из Т-Инвестиций» (portfolios-broker-pf.js): в отличие от остальных
        // источников НЕ подмешивает бумаги в текущий портфель — pid игнорируется,
        // это всегда find-or-create ОДНОЙ выделенной карточки счёта (ручной
        // портфель нельзя сделать зеркалом счёта: замещающий снапшот затёр бы
        // ручные лоты). Формулировка — «счёт отдельной карточкой», а не
        // «перенести сюда».
        // Пункт показываем ВСЕГДА, в том числе без подключения: раньше он
        // прятался до подключения брокера, и о самой возможности можно было
        // никогда не узнать — меню «Импорт» и есть то место, где её ищут.
        var brkPf = brokerPfGet();
        var brkOn = brokerPfAlive();
        var brkTitle = brkPf ? 'Обновить из Т-Инвестиций' : 'Из Т-Инвестиций';
        var brkSub = brkPf
            ? (brkOn ? 'карточка счёта уже на странице — обновить и показать'
                     : 'карточка счёта уже на странице — показать её')
            : (brkOn ? 'счёт отдельной карточкой · обновляется сам'
                     : 'подключить брокера — счёт станет отдельной карточкой');
        var brkItem = '<button class="pf-impitem" onclick="' +
                (brkOn || brkPf ? 'pfBrokerPfImport()' : 'PF.closeImpMenus();brokerConnect.open()') + '">' +
            '<span class="pf-impico">' + IMPBANK_SVG + '</span>' +
            '<span class="pf-impbody"><b>' + brkTitle + '</b><i>' + brkSub + '</i></span>' +
            '<span class="pf-impgo">' + CHEV_SVG + '</span></button>';
        return '<div class="pf-impmenu' + (up ? ' up' : '') + '" id="pfImp-' + key + '">' +
            '<div class="pf-impgrp">Откуда перенести бумаги</div>' +
            card('calc', 'all', IMPCALC_SVG, 'Из расчёта', 'нет сохранённого расчёта', calcAll, calcBreakdown) +
            subRow +
            card('fav', null, IMPFAV_SVG, 'Из избранного', 'нет отмеченных звёздочкой бумаг', fav) +
            card('monthly', null, IMPMON_SVG, 'Из ежемесячного дохода', 'нет облигаций в калькуляторе дохода', mon) +
            csvItem +
            brkItem +
            '</div>';
    }
    function impWrapHtml(key, pid) {
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'' + key + '\')">' +
                DL_SVG + 'Импорт' + CHEV_SVG + '</button>' +
            impMenuHtml(key, pid) + '</div>';
    }

    // ---- бэкап (выгрузить/загрузить JSON) — переиспользует попап-инфраструктуру «Импорт» ----
    var XLSTBL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/><path d="M15 10v10"/></svg>';
    function backupWrapHtml() {
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'bkp\')" data-tip="Бэкап">' + SHIELD_SVG + '<span>Бэкап</span>' + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-bkp">' +
                '<div class="pf-impgrp">Резервная копия</div>' +
                '<button class="pf-impitem" onclick="pfExportData()">' + DL_SVG + 'Выгрузить в файл (JSON)</button>' +
                '<button class="pf-impitem" onclick="pfImportClick()">' + UPLOAD_SVG + 'Загрузить из файла</button>' +
                '<div class="pf-impgrp">Отчёт</div>' +
                '<button class="pf-impitem" onclick="pfExportExcelAll()">' + XLSTBL_SVG + 'Выгрузить в Excel (все позиции)</button>' +
                '<button class="pf-impitem" onclick="pfExportTradesExcel()">' + XLSTBL_SVG + 'Выгрузить сделки (Excel)</button>' +
            '</div>' +
            '<input type="file" id="pfBkpInput" accept="application/json,.json" style="display:none" onchange="pfImportData(this)">' +
        '</div>';
    }

    var LAYOUT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="6" height="16" rx="1.6"/><rect x="9.5" y="4" width="6" height="16" rx="1.6"/><rect x="16.5" y="4" width="5" height="16" rx="1.6"/></svg>';
    // Переключатель «Вид» (обычный/узкий) убран из шапки — раскладку теперь задаёт
    // Конструктор (перетаскивание/ресайз блоков), а вид карточек портфеля стал избыточным.
    // Режим PF.cardViewMode остаётся (по умолчанию 'narrow') и по-прежнему питает раскладку
    // сетки/карточек; pfSetCardView сохранён на случай программного вызова.
    window.pfSetCardView = function (mode) {
        if (mode !== 'normal' && mode !== 'narrow') return;
        if (PF.cardViewMode === mode) { closeImpMenus(); return; }
        PF.cardViewMode = mode;
        try { localStorage.setItem(CARDVIEW_KEY, mode); } catch (e) {}
        closeImpMenus(); renderSmooth();
    };

    // ---- панель действий страницы: живёт не в самой вкладке, а в ГЛОБАЛЬНОЙ шапке
    // сайта (#topBarPfActions, слева от «Поиска») — см. renderPortfolios/switchTab ниже.
    // «Импорт» из неё убран — импортировать состав можно из настроек портфеля (⚙).
    // иконка конструктора: сетка 2×2 (LAYOUT_SVG занят пунктом «Вид»)
    var PFDGRID_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/></svg>';
    function topBarActionsHtml() {
        // на десктопе ВСЕ контролы страницы живут в парящих узлах (pfxFabSync) —
        // шапку оставляем пустой; кнопки ниже — МОБИЛЬНЫЙ верхний ряд (mobile.css)
        if (pfdPanelActive()) return '';
        return '<button class="d3-quick" onclick="pfAddPortfolio()">' + PLUS_SVG + '<span>Добавить портфель</span></button>' +
            // «Видимость» — ТОЛЬКО про портфели (2026-07-29), поэтому и показываем её
            // только при 2+ портфелях: скрывать единственный смысла нет
            (PF.store.items.length > 1 ? eyeWrapHtml() : '') +
            // Вход в настройку раскладки («Раскладка») переехал в шапку страницы рядом с
            // названием раздела — кнопка #pfLayoutBtn (index.html + updateLayoutBtn/pfLayoutToggle).
            backupWrapHtml();
    }
    // наполняет/показывает панель действий в глобальной шапке; скрывается при уходе со
    // вкладки в обёртке switchTab (см. секцию «ИНТЕГРАЦИЯ» внизу файла)
    function renderTopBarActions() {
        var host = document.getElementById('topBarPfActions'); if (!host) return;
        host.innerHTML = topBarActionsHtml();
        host.style.display = 'flex';
        updateLayoutBtn();   // кнопка «Раскладка» в шапке страницы (рядом с названием раздела)
        pfPresetsFetch();    // подтягиваем общие пресеты (троттлинг 90с; no-op пока supa не готов)
        pfWGatesFetch();     // и видимость виджетов каталога (тот же троттлинг)
    }

    // ---- «Видимость»: попап управления скрытием ПОРТФЕЛЕЙ (инфраструктура «Импорта») ----
    // Клик по строке прячет/возвращает карточку; попап при этом остаётся открытым, чтобы
    // можно было переключить несколько портфелей подряд (см. pfToggleHidden).
    // 2026-07-29: группа «Секции страницы» (тумблеры Календаря/Избранного/Ставок/Сводки
    // и «Истории сделок») отсюда УБРАНА. Скрытий стало три штуки на разные сущности, и
    // в них путались: у виджета теперь ОДИН путь — корзина на самой карточке, вернуть из
    // пикера «Добавить виджет». Скрывать умеет только портфель — здесь и глазом в колонке
    // сайдбара (js/sidebar-ctx.js, act 'pf-hide').
    function eyeWrapHtml() {
        var vis = visibleItems().length, total = PF.store.items.length;
        var multi = total > 1;
        // ---- группа «Портфели» (только при 2+ портфелях) ----
        // «Показать все»/«Скрыть все» — ПОСТОЯННАЯ пара кнопок сверху: строки портфелей
        // ниже не прыгают при переключении (раньше «Показать все» то появлялась, то
        // исчезала — список «мигал» и менял места)
        var showAll = multi
            ? '<div class="pf-eyeall-row">' +
                '<button class="pf-eyeallbtn" onclick="pfEyeShowAll(event)"' + (vis === total ? ' disabled' : '') + '>' + EYE_SVG + 'Показать все</button>' +
                '<button class="pf-eyeallbtn" onclick="pfEyeHideAll(event)"' + (vis === 0 ? ' disabled' : '') + '>' + EYEOFF_SVG + 'Скрыть все</button>' +
              '</div>'
            : '';
        var pfRows = multi ? (showAll + PF.store.items.map(function (p) {
            var c = calcPf(p), off = !!p.hidden;
            // R9.3: у скрытого — мини-кнопка «открыть вкладку»: иначе до скрытого
            // портфеля не добраться, если его чип не был открыт заранее
            var openTab = (off && pfxWide())
                ? '<span class="pf-eyego" role="button" title="Открыть вкладку портфеля" aria-label="Открыть вкладку портфеля" onclick="pfEyeOpenTab(\'' + p.id + '\', event)">' + GO_ARROW_SVG + '</span>'
                : '';
            return '<button class="pf-impitem pf-eyeitem' + (off ? ' off-eye' : '') + '" onclick="pfToggleHidden(\'' + p.id + '\',event)">' +
                '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                '<span class="pf-impbody"><b>' + esc(p.name) + '</b><i>' + fmtRub(c.value) + (off ? ' · скрыт' : '') + '</i></span>' +
                openTab +
                '<span class="pf-eyestate">' + (off ? EYEOFF_SVG : EYE_SVG) + '</span>' +
            '</button>';
        }).join('')) : '';
        var pfGroup = multi ? '<div class="pf-impgrp">Какие портфели показывать</div>' + pfRows +
            '<div class="pf-eyenote">Скрытые карточки не показываются в сетке и в календаре выплат, но их капитал по-прежнему учитывается в общей сводке. Открытая вкладка портфеля при скрытии не закрывается. Виджеты здесь не прячутся — их убирает корзина на самой карточке.</div>' : '';
        // .has-off — янтарная точка «часть портфелей скрыта»: счётчик «2/3» тонет
        // среди подписей, а скрытый портфель без сигнала легко забыть насовсем
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn' + (multi && vis < total ? ' has-off' : '') + '" onclick="pfToggleImp(event,\'eye\')" data-tip="Видимость' + (multi && vis < total ? ' · ' + vis + '/' + total : '') + '">' + EYE_SVG + '<span>Видимость</span>' +
                (multi && vis < total ? '<i class="pf-eyecnt">' + vis + '/' + total + '</i>' : '') + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-eye">' + pfGroup + '</div></div>';
    }
    // Esc закрывает попапы «Импорт»/«Видимость»/«Бэкап»: клик-вне у них был всегда
    // (pfImpOutside), а клавиатуры не было — в панели действий это заметно
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeImpMenus(); });

    // ---- сводка по всем портфелям (только при 2+ портфелях) — компактная карточка ПОД
    // «Избранным» в правой колонке: капитал + вложено/доход + распределение + мини-лидерборд
    // портфелей + кнопки быстрого перехода к таблицам «Рынок · Акции» и «Рынок · Облигации».
    function summaryCardHtml() {
        var inv = 0, val = 0, bondVal = 0, cashTotal = 0, paySum = 0, payPending = false;
        var rows = [];
        PF.store.items.forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value; bondVal += c.bondVal;
            cashTotal += (+p.cash || 0);
            var po = pfPayouts(p);
            if (po.pending) payPending = true; else paySum += po.sum;
            rows.push({ id: p.id, name: p.name, color: p.color, pct: c.pnlPct, value: c.value, has: c.invested > 0, hid: !!p.hidden });
        });
        var pnl = val - inv, pnlPct = inv > 0 ? pnl / inv * 100 : 0;
        var bondPct = val > 0 ? bondVal / val * 100 : 0, stockPct = 100 - bondPct;
        // кэш и полученные выплаты — отдельной строкой (в капитал бумаг и «Доход» не входят)
        var extras = '';
        if (cashTotal > 0 || paySum > 0.005 || payPending) {
            extras = '<div class="pfs2-extras">' +
                (cashTotal > 0 ? '<span title="Свободные деньги всех портфелей — не вложены в бумаги">Кэш <b>' + fmtRub(cashTotal) + '</b></span>' : '') +
                ((paySum > 0.005 || payPending) ? '<span title="Полученные купоны и дивиденды за время владения — по расписаниям MOEX">Выплаты получено <b class="pos">' + (payPending ? '…' : '+' + fmtRub(paySum)) + '</b></span>' : '') +
            '</div>';
        }

        var ranked = rows.slice().sort(function (a, b) {
            if (a.has !== b.has) return a.has ? -1 : 1; return b.pct - a.pct; });
        var hasMany = ranked.filter(function (r) { return r.has; }).length > 1;
        var board = ranked.map(function (r, i) {
            return '<div class="pfs2-row' + (i === 0 && r.has && hasMany ? ' lead' : '') + (r.has ? '' : ' empty') + '">' +
                '<span class="pfs2-rk">' + (i + 1) + '</span>' +
                '<span class="pfs2-n"><i style="background:' + colorVal(r.color) + '"></i><span class="pfs2-nm">' + esc(r.name) + '</span>' +
                    (r.hid ? '<span class="pfs2-hid" title="Карточка убрана с «Обзора» — капитал учитывается в сводке">' + EYEOFF_SVG + '</span>' : '') + '</span>' +
                // data-live: капитал и % строки лидерборда обновляет livePatchers.summary;
                // МЕСТО в рейтинге (сортировка по живому pct, класс lead) — полному рендеру
                '<span class="pfs2-cap" data-live="pfs2:' + r.id + ':cap">' + (r.value > 0 ? fmtRub(r.value) : '—') + '</span>' +
                '<span class="pfs2-v ' + (r.has ? (r.pct >= 0 ? 'pos' : 'neg') : 'muted') + '" data-live="pfs2:' + r.id + ':pct">' + (r.has ? fmtPct(r.pct) : '—') + '</span>' +
            '</div>';
        }).join('');

        var GO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        var warm = pfQuotesWarming();   // первая загрузка котировок → капитал скелетоном
        return '<div class="dash2-card pf-sumcard">' +
            '<div class="pfs2-eyebrow"><span class="pfs2-eyebrow-t">Суммарный капитал</span><span class="pfs2-eyebrow-c">' + PF.store.items.length + ' ' + plural(PF.store.items.length, 'портфель', 'портфеля', 'портфелей') + '</span></div>' +
            // data-live: капитал и строку дохода переписывает livePatchers.summary
            // (скелетоны прогрева заменяются числами первым тиком после прогрева)
            '<div class="pfs2-capital" data-live="pfs2:cap">' + (warm ? skelHtml(170, 26) : fmtRub(val)) + '</div>' +
            '<div class="pfs2-sub">Вложено ' + fmtRub(inv) + (warm ? '<span class="pfs2-pnl" data-live="pfs2:pnl">' + skelHtml(110, 12) + '</span>'
                : '<span class="pfs2-pnl ' + (pnl >= 0 ? 'pos' : 'neg') + '" data-live="pfs2:pnl">' + (pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(pnl)) + ' · ' + fmtPct(pnlPct) + '</span>') + '</div>' +
            extras +
            '<div class="pfs2-alloc">' +
                '<div class="pfs2-alloc-bar"><span class="pfs2-alloc-stock" style="width:' + stockPct.toFixed(1) + '%"></span><span class="pfs2-alloc-bond" style="width:' + bondPct.toFixed(1) + '%"></span></div>' +
                '<div class="pfs2-alloc-leg"><span><i class="stock"></i>Акции ' + (100 - Math.round(bondPct)) + '%</span><span><i class="bond"></i>Облигации ' + Math.round(bondPct) + '%</span></div>' +
            '</div>' +
            '<div class="pfs2-board">' + board + '</div>' +
            '<div class="pfs2-nav">' +
                '<button class="pfs2-go" onclick="switchTab(\'market-stocks\')"><i class="stock"></i>Акции' + GO_SVG + '</button>' +
                '<button class="pfs2-go" onclick="switchTab(\'market-bonds\')"><i class="bond"></i>Облигации' + GO_SVG + '</button>' +
            '</div>' +
        '</div>';
    }
    function plural(n, one, few, many) { n = Math.abs(n) % 100; var n1 = n % 10;
        if (n > 10 && n < 20) return many; if (n1 > 1 && n1 < 5) return few; if (n1 === 1) return one; return many; }

    // ---- точечный фоновый апдейт сводки (роадмап №6) ----
    // Капитал, строка «Вложено … ▲ X ₽ · +N%» и числа лидерборда (fmtRub/fmtPct
    // по каждому портфелю) переписываются по data-live узлам summaryCardHtml.
    // Полному рендеру оставлены: ПОРЯДОК лидерборда (сортировка по живому pct и
    // класс lead у первой строки), полоса распределения с легендой (inline-ширины,
    // как donut в карточках), «Кэш»/«Выплаты» (не котировочные). Пока котировки
    // греются, капитал/доход не пишем — скелетоны заменит первый тик после прогрева.
    PF.livePatchers.summary = function () {
        var inv = 0, val = 0;
        PF.store.items.forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value;
            var has = c.invested > 0;
            PF.liveSet('pfs2:' + p.id + ':cap', { text: c.value > 0 ? fmtRub(c.value) : '—' });
            PF.liveSet('pfs2:' + p.id + ':pct', {
                text: has ? fmtPct(c.pnlPct) : '—',
                cls: 'pfs2-v ' + (has ? (c.pnlPct >= 0 ? 'pos' : 'neg') : 'muted') });
        });
        if (pfQuotesWarming()) return;
        var pnl = val - inv, pnlPct = inv > 0 ? pnl / inv * 100 : 0;
        PF.liveSet('pfs2:cap', { text: fmtRub(val) });
        PF.liveSet('pfs2:pnl', {
            text: (pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(pnl)) + ' · ' + fmtPct(pnlPct),
            cls: 'pfs2-pnl ' + (pnl >= 0 ? 'pos' : 'neg') });
    };

    // ---- сетка карточек (calCell — HTML «Календаря выплат», занимает свободную ячейку
    // сетки при нечётном числе портфелей: та же высота, что у карточки портфеля) ----
    function gridHtml(calCell) {
        if (!PF.store.items.length) return emptyHtml();
        var vis = visibleItems();
        if (!vis.length) return allHiddenHtml();
        // рендерим ВСЕ видимые портфели (MAX_CARDS ограничивает только создание новых):
        // раньше slice(0,4) молча прятал карточки 5+ после импорта бэкапа
        var items = vis;
        var narrow = PF.cardViewMode === 'narrow';   // 3 карточки в ряд вместо 2 (только раскладка сетки)
        var cards = items.map(function (p) { return cardHtml(p); }).join('');
        return '<div class="pf-grid' + (narrow ? ' pf-grid--narrow' : '') + '">' + cards + (calCell || '') + '</div>';
    }
    function allHiddenHtml() {
        var n = PF.store.items.length;
        return '<div class="dash2-card pf-empty pf-empty--hidden">' +
            '<div class="pf-empty-art">' + EYEOFF_SVG + '</div>' +
            '<div class="pf-empty-t">Все портфели скрыты</div>' +
            '<div class="pf-empty-s">' + (n === 1 ? 'Единственный портфель спрятан' : 'Все ' + n + ' ' + plural(n, 'портфель', 'портфеля', 'портфелей') + ' спрятаны') + ' — верните нужные через «Видимость» в шапке или покажите все разом.</div>' +
            '<div class="pf-empty-cta"><button class="d3-quick" onclick="pfShowAllHidden()">' + EYE_SVG + 'Показать все</button></div>' +
        '</div>';
    }
    function emptyHtml() {
        return '<div class="dash2-card pf-empty">' +
            '<div class="pf-empty-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/></svg></div>' +
            '<div class="pf-empty-t">Пока нет портфелей</div>' +
            '<div class="pf-empty-s">Создайте портфель вручную или импортируйте состав из расчёта, избранного, ежемесячного дохода или подключённого брокера.</div>' +
            '<div class="pf-empty-cta">' +
                '<button class="d3-quick" onclick="pfAddPortfolio()">Создать вручную</button>' +
                impWrapHtml('empty', null) +
            '</div></div>';
    }

    var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg>';

    var HOLDS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    var COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var REBAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg>';

    // --- экспорт для конструктора (portfolios-dash.js зовёт через PF.*) ---
    PF.CHECK_SVG = CHECK_SVG; PF.CHEV_SVG = CHEV_SVG; PF.EYEOFF_SVG = EYEOFF_SVG; PF.EYE_SVG = EYE_SVG;
        PF.PFDGRID_SVG = PFDGRID_SVG;     PF.UNDO_SVG = UNDO_SVG;                                             PF.plural = plural;     PF.renderSmooth = renderSmooth; PF.summaryCardHtml = summaryCardHtml;
    
    // --- экспорт для виджетов (portfolios-widgets.js зовёт через PF.*) ---
    PF.DL_SVG = DL_SVG; PF.IMPCSV_SVG = IMPCSV_SVG; PF.INFO_SVG = INFO_SVG; PF.PLUS_SVG = PLUS_SVG;
    PF.UPLOAD_SVG = UPLOAD_SVG; PF.XLSTBL_SVG = XLSTBL_SVG; PF.backupWrapHtml = backupWrapHtml;
    PF.eyeWrapHtml = eyeWrapHtml; PF.renderNoAnim = renderNoAnim;

    // --- экспорт для «Выплат» (portfolios-payouts.js зовёт через PF.*) ---
    PF.renderPortfolios = renderPortfolios;

    // --- экспорт для подвкладок (portfolios-tabs.js зовёт через PF.*) ---
    PF.REBAL_SVG = REBAL_SVG; PF.allHiddenHtml = allHiddenHtml; PF.emptyHtml = emptyHtml; 
    // --- экспорт для карточек (portfolios-cards.js зовёт через PF.*) ---
    PF.COPY_SVG = COPY_SVG; PF.FETCH_SVG = FETCH_SVG; PF.GEAR_SVG = GEAR_SVG; PF.HOLDS_SVG = HOLDS_SVG;
    PF.SHIELD_SVG = SHIELD_SVG; PF.impWrapHtml = impWrapHtml; PF.loadStatus = loadStatus; PF.openRows = openRows;
    
    // ====================================================================
    //  ИНТЕГРАЦИЯ
    // ====================================================================
    // Рендер при входе на вкладку (оборачиваем switchTab — паттерн market-модулей)
    if (typeof window.switchTab === 'function') {
        var _prevSwitch = window.switchTab;
        window.switchTab = function (tabId) {
            _prevSwitch.apply(this, arguments);
            if (tabId === 'portfolios') { PF.openMenu = null; renderPortfolios(); }
            else {
                if (dq('pfOverlay')) window.pfCloseOverlay();
                // ушли со вкладки — карточку раскладки закрываем (иначе гард рендера её бы
                // держал открытой при возврате), панель действий и слот шапки прячем
                PF.dashEdit = false;
                var tbHost = document.getElementById('topBarPfActions');
                if (tbHost) { tbHost.style.display = 'none'; tbHost.innerHTML = ''; }
                var tbMkt = document.getElementById('topBarPfMarket');
                if (tbMkt) { tbMkt.style.display = 'none'; tbMkt.innerHTML = ''; tbMkt.__pfxHtml = ''; }
                var tbLay = document.getElementById('pfLayoutBtn');
                if (tbLay) tbLay.style.display = 'none';
                var tbLaySep = document.getElementById('pfLayoutSep');
                if (tbLaySep) tbLaySep.style.display = 'none';
            }
        };
    }
    // Когда подгрузилась таблица акций — обновить избранное/потенциал (chain, не ломая дашборд)
    var _prevStkLoaded = window.onStkCompaniesLoaded;
    window.onStkCompaniesLoaded = function () {
        if (typeof _prevStkLoaded === 'function') { try { _prevStkLoaded(); } catch (e) {} }
        if (currentTab === 'portfolios') renderPortfolios();
    };

    // R9.3: deep-link мог прийти ДО ленивой загрузки этого файла — route-hash
    // оставил подвкладку в window.__pfSub, подбираем перед первым рендером
    if (window.__pfSub) {
        try { window.pfxApplySubPath(window.__pfSub); } catch (e) {}
        window.__pfSub = null;
    }
    // Первичный рендер, если вкладка уже активна на старте
    if (typeof currentTab !== 'undefined' && currentTab === 'portfolios') renderPortfolios();
    // R9.4: модуль ленивый и загрузился ПОСЛЕ того, как route-hash записал путь —
    // на момент записи pfxSubPath ещё не существовал, и в адрес ушёл голый
    // /portfolios. Дописываем подвкладку, иначе URL врёт до первого переключения
    // (скопированная ссылка вела бы не туда, куда смотрит человек).
    pfxSyncPath();
})();
