// ===== ВКЛАДКА «ПОРТФЕЛИ» · РЕНДЕР И ВСЁ ОСТАЛЬНОЕ (последний файл цепочки #pfLazySrc) =====
// Ядро (portfolios-core.js) уже загружено и создало window.PF. Здесь пока
// живёт всё, что не ядро: каркас рендера, дашборд-конструктор, виджеты,
// карточки, подвкладки, сделки, ребаланс и ИНТЕГРАЦИЯ (window.renderPortfolios
// объявляется ЗДЕСЬ — это сентинел «цепочка загружена» для ensurePortfoliosJs).
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
    var drawPfChart = PF.drawPfChart, repaintOpenCharts = PF.repaintOpenCharts, pfChartViewHtml = PF.pfChartViewHtml, pfChartAssetsHtml = PF.pfChartAssetsHtml, chartImoex = PF.chartImoex, chartBusy = PF.chartBusy;
    var getCalcComposition = PF.getCalcComposition, getFavComposition = PF.getFavComposition, getMonthlyComposition = PF.getMonthlyComposition, compositionFrom = PF.compositionFrom, importName = PF.importName, fullBondId = PF.fullBondId;
    var lookupHistPrice = PF.lookupHistPrice, lookupHistNkd = PF.lookupHistNkd, bondDetail = PF.bondDetail, parseBondDate = PF.parseBondDate, coupSched = PF.coupSched, divSched = PF.divSched;
    var ensureSchedule = PF.ensureSchedule, qtyAtDate = PF.qtyAtDate, pfPayouts = PF.pfPayouts, pfParseAnyDate = PF.pfParseAnyDate;
    // --- экспорт в ядро: его колбэки зовут эти функции через PF.* 
    //     (function-декларации хойстятся — блок валиден в начале файла) ---
    PF.softRerender = softRerender;     PF.donutHtml = donutHtml;
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
    var PFX_TABS = PF.PFX_TABS, pfxActivateTab = PF.pfxActivateTab, pfxApplyCorner = PF.pfxApplyCorner, pfxBgRowHtml = PF.pfxBgRowHtml, pfxCornerRowHtml = PF.pfxCornerRowHtml, pfxDrawerSync = PF.pfxDrawerSync;
    var pfxDropPfTab = PF.pfxDropPfTab, pfxFabSeen = PF.pfxFabSeen, pfxFabSync = PF.pfxFabSync, pfxFlashBlock = PF.pfxFlashBlock, pfxGoOverviewFor = PF.pfxGoOverviewFor, pfxHeroHtml = PF.pfxHeroHtml;
    var pfxOpenPfTabs = PF.pfxOpenPfTabs, pfxPanelWrap = PF.pfxPanelWrap, pfxSaveOpenTabs = PF.pfxSaveOpenTabs, pfxSeedLayout = PF.pfxSeedLayout, pfxSetCardHtml = PF.pfxSetCardHtml, pfxSyncPath = PF.pfxSyncPath;
    var pfxTabPortsHtml = PF.pfxTabPortsHtml, pfxTabsHtml = PF.pfxTabsHtml, pfxTabsScrollSync = PF.pfxTabsScrollSync, pfxVisRowsHtml = PF.pfxVisRowsHtml, pfxWide = PF.pfxWide;
    // импорт карточек (portfolios-cards.js, загружен до нас):
    var XMARK_SVG = PF.XMARK_SVG, assetDisplayName = PF.assetDisplayName, cardHtml = PF.cardHtml, closeImpMenus = PF.closeImpMenus, ensureDefaultImoexFlags = PF.ensureDefaultImoexFlags, menuHtml = PF.menuHtml;
    var paintPfChartMini = PF.paintPfChartMini, pfCardHead = PF.pfCardHead, pfConfirm = PF.pfConfirm, pfImpOutside = PF.pfImpOutside, repaintMiniCharts = PF.repaintMiniCharts;

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
            // ---- R7: радиус карточек из настроек + первичная раскладка-референс ----
            pfxSyncCfg();      // R8: PF.dashCfg = конфиг активной подвкладки
            pfxApplyCorner();
            pfxSeedLayout();
            // Шапка вкладки: тёмный герой «Панель управления» + ряд подвкладок (Обзор |
            // Портфели | Аналитика | …). R8: у КАЖДОЙ подвкладки свой дашборд-конструктор
            // (pfdBodyHtml с её конфигом), «Обзор» дополнительно умеет классический вид.
            var chrome = pfxHeroHtml() + pfxTabsHtml();
            // R9.5: при живом ряде вкладок контент оборачивается в role=tabpanel
            // (aria-controls вкладок ведёт на #pfxTabPanel); без ряда — как есть
            var wrapPanel = chrome ? pfxPanelWrap : function (x) { return x; };
            var body;
            if (pfxEffTab() !== 'overview') {
                body = chrome + wrapPanel(pfdBodyHtml(favStr, noBonds));
            } else if (pfdActive()) {
                // Конструктор: пользовательская раскладка — единая 12-колоночная
                // сетка, порядок и размеры блоков из pf_dash_v1 (см. секцию выше)
                body = chrome + wrapPanel(pfdBodyHtml(favStr, noBonds));
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
            body = chrome + wrapPanel('<div class="pf-topgrid">' +
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
            pfdHeatRepaintSoon();   // блок «Карта рынка»: дорисовать живые плитки
            ensureLiveTick();
            var payBody = document.querySelector('.pf-paycal--cell .pfpc-body');
            if (payBody) window.pfPayCalScroll(payBody);   // начальное состояние затухания списка выплат
            ensureDefaultImoexFlags(); // флаг IMOEX по умолчанию — ДО первого loadPfChart (см. комментарий выше)
            repaintOpenCharts();   // если какой-то график раскрыт — дорисовываем после ре-рендера
            repaintMiniCharts();   // мини-график «портфель vs IMOEX» в каждой карточке
            pfPlistSparksSoon();   // спарклайны «Моих портфелей» без снимков — дорисовать из истории
            pfxDrawerSync();       // R9.1: шторка настроек портфеля обновляется вместе со страницей
            pfxFabSync();          // R9.1: круглая кнопка «+ виджет» справа внизу (после обучения)
            pfxTabsScrollSync();   // R9.3: активная вкладка в видимой зоне ряда, маски краёв, DnD чипов
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

    // Автоподгонка крупных сумм: «100 000 000 000 ₽» должна влезать в строку карточки
    // целиком — без переноса «₽» и сдвига сетки. Меряем переполнение строки и плавно
    // уменьшаем кегль суммы до влезания.
    function fitBigSums() {
        document.querySelectorAll('#pfWrap .pfc-hero-top').forEach(function (row) {
            var val = row.querySelector('.pfc-hero-val'); if (!val) return;
            val.style.fontSize = '';
            var size = parseFloat(getComputedStyle(val).fontSize) || 21;
            var guard = 0;
            while (row.scrollWidth > row.clientWidth + 1 && size > 12 && guard < 40) {
                size -= 0.5; val.style.fontSize = size + 'px'; guard++;
            }
        });
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
            // Идёт жест (драг/ресайз), открыт пикер или ещё доигрывают анимации только что
            // отпущенной карточки — полный своп сейчас недопустим: он оборвёт жест/анимацию.
            // Раньше renderPortfolios просто отбрасывал такой рендер (ранний return), и на
            // авторизованном аккаунте — где есть живые котировки, а значит пачки ответов
            // каждые несколько секунд — своп регулярно попадал в «хвост» дропа: карточка
            // моргала и прыгала на месте. Теперь ПЕРЕЗАВОДИМ таймер: обновление не теряется,
            // а дожидается покоя.
            if (pfdQuiet()) { softRerender(); return; }
            if (PF.openMenu) return;   // не сбиваем открытый редактор
            for (var ck in PF.chartOpen) { if (PF.chartOpen[ck]) return; }   // не перерисовываем раскрытый график (сбилась бы анимация)
            if (document.querySelector('.pf-impmenu.open')) return;   // не сбиваем открытое меню «Импорт»
            // фоновое обновление (котировки/НКД/новости) — не «настоящее» изменение графика,
            // без PF.noChartAnim мини-графики каждый раз переигрывали 1-секундную анимацию
            // прорисовки → на глаз это читалось как мерцание карточек (см. renderNoAnim выше).
            renderNoAnim();
        }, 150);
    }

    // ---- РЫНОЧНАЯ ЛЕНТА В ШАПКЕ САЙТА (бывший тёмный LIVE-виджет отдельной карточкой в
    // правой колонке — не понравился визуально, «не подходил» к странице). Теперь это
    // тонкая строка, вшитая прямо в фон глобального топ-бара (#topBarPfMarket в
    // index.html, ПОД #topBar) — без своего бокса, ненавязчиво, но всегда на виду, пока
    // открыта вкладка «Портфели». Ids те же по смыслу (tbmk-v-*/tbmk-c-*), наполняет их
    // tickLive() из тех же скрытых span'ов дашборда (val-imoex и т.п.), что и раньше.
    function topBarMarketHtml() {
        var tiles = [['imoex', 'IMOEX'], ['usd', 'USD/RUB'], ['btc', 'BTC']];
        return '<span class="tbmk-dot"></span>' + tiles.map(function (t, i) {
            // клик по IMOEX открывает вкладку «Рынок»
            var go = t[0] === 'imoex';
            return (i ? '<span class="tbmk-sep">·</span>' : '') +
                '<span class="tbmk-item' + (go ? ' tbmk-go' : '') + '"' +
                (go ? ' role="button" tabindex="0" title="Открыть вкладку «Рынок»" onclick="switchTab(\'market\')"' : '') + '>' +
                '<span class="tbmk-k">' + t[1] + '</span>' +
                '<span class="tbmk-v" id="tbmk-v-' + t[0] + '">—</span>' +
                '<span class="tbmk-c" id="tbmk-c-' + t[0] + '"></span></span>';
        }).join('');
    }
    function renderTopBarMarket() {
        var host = document.getElementById('topBarPfMarket'); if (!host) return;
        host.innerHTML = topBarMarketHtml();
        host.style.display = 'flex';
    }
    function tickLive() {
        [['imoex', 'val-imoex', 'dyn-imoex'], ['usd', 'val-usdrub', 'dyn-usdrub'], ['btc', 'val-btc', 'dyn-btc']].forEach(function (p) {
            var v = dq('tbmk-v-' + p[0]), c = dq('tbmk-c-' + p[0]), sv = dq(p[1]), sd = dq(p[2]);
            var s = sv ? (sv.textContent || '').trim() : '';
            var d = sd ? (sd.textContent || '').trim() : '';
            var cls = sd ? (sd.classList.contains('negative') ? 'neg' : (sd.classList.contains('positive') ? 'pos' : 'flat')) : 'flat';
            if (v && s) v.textContent = s;
            if (c && sd) { c.textContent = d; c.className = 'tbmk-c ' + cls; }
            // виджет «Рынок сейчас» (pfwIdxHtml) — те же значения в его строки
            var wv = dq('pfxidx-v-' + p[0]), wc = dq('pfxidx-c-' + p[0]);
            if (wv && s) wv.textContent = s;
            if (wc && sd) { wc.textContent = d; wc.className = 'pfix-c ' + cls; }
        });
    }
    function ensureLiveTick() { if (liveTimer) return; liveTimer = setInterval(function () {
        if (currentTab === 'portfolios' && dq('tbmk-v-imoex')) tickLive(); }, 1000); }

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
        return '<div class="pf-impmenu' + (up ? ' up' : '') + '" id="pfImp-' + key + '">' +
            '<div class="pf-impgrp">Откуда перенести бумаги</div>' +
            card('calc', 'all', IMPCALC_SVG, 'Из расчёта', 'нет сохранённого расчёта', calcAll, calcBreakdown) +
            subRow +
            card('fav', null, IMPFAV_SVG, 'Из избранного', 'нет отмеченных звёздочкой бумаг', fav) +
            card('monthly', null, IMPMON_SVG, 'Из ежемесячного дохода', 'нет облигаций в калькуляторе дохода', mon) +
            csvItem +
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
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'bkp\')">' + SHIELD_SVG + '<span>Бэкап</span>' + CHEV_SVG + '</button>' +
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
        // «Панель управления» на дашборде собирает ВСЕ контролы страницы — шапку оставляем пустой
        if (pfdPanelActive()) return '';
        return '<button class="d3-quick" onclick="pfAddPortfolio()">' + PLUS_SVG + '<span>Добавить портфель</span></button>' +
            // «Видимость» показываем при 2+ портфелях, при наличии сделок ИЛИ когда включена
            // своя раскладка (тогда в меню — тумблеры скрытых изначальных секций)
            (PF.store.items.length > 1 || hasAnyTrades() || PF.dashCfg.on ? eyeWrapHtml() : '') +
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

    // ---- «Видимость»: попап управления скрытием карточек (инфраструктура «Импорта») ----
    // Клик по строке прячет/возвращает карточку; попап при этом остаётся открытым, чтобы
    // можно было переключить несколько портфелей подряд (см. pfToggleHidden).
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
            '<div class="pf-eyenote">Скрытые карточки не показываются в сетке и в календаре выплат, но их капитал по-прежнему учитывается в общей сводке. Открытая вкладка портфеля при скрытии не закрывается.</div>' : '';
        // ---- группа «Секции страницы» — тумблеры видимости блоков ----
        // При включённой своей раскладке (PF.dashCfg.on) сюда попадают скрытые/показанные
        // ИЗНАЧАЛЬНЫЕ блоки, которые МОЖНО скрыть глазом на самой карточке: «Календарь
        // выплат», «Избранное», «Ставки рынка» и «Сводка». Виджеты возвращаются из
        // «Конструктор → Добавить блок». Плюс всегда — «История сделок».
        var dashSecRows = '';
        if (PF.dashCfg.on) {
            var hasVisHold = PF.store.items.some(function (p) { return !p.hidden && (p.holdings || []).length > 0; });
            var noBondsV = hasVisHold && !calPfCandidates().length;
            var secs = [
                { id: 'cal', name: noBondsV ? 'Ставки' : 'Календарь выплат', sub: noBondsV ? 'ставки денежного рынка' : 'ближайшие купоны и дивиденды', on: true },
                { id: 'fav', name: 'Избранное', sub: 'потенциал и новости по тикерам', on: true },
                { id: 'rates', name: 'Ставки рынка', sub: 'ключевая ставка, вклады, инфляция', on: !noBondsV },
                { id: 'sum', name: 'Сводка', sub: 'суммарный капитал по портфелям', on: PF.store.items.length >= 2 }
            ];
            dashSecRows = secs.filter(function (s) { return s.on; }).map(function (s) {
                var hid = !!(PF.dashCfg.hidden || {})[s.id];
                return '<button class="pf-impitem pf-eyeitem' + (hid ? ' off-eye' : '') + '" onclick="pfdToggleSection(\'' + s.id + '\',event)">' +
                    '<span class="pf-eyedot" style="background:#5B7C99"></span>' +
                    '<span class="pf-impbody"><b>' + esc(s.name) + '</b><i>' + esc(hid ? 'скрыт' : s.sub) + '</i></span>' +
                    '<span class="pf-eyestate">' + (hid ? EYEOFF_SVG : EYE_SVG) + '</span></button>';
            }).join('');
        }
        var tradesRow = hasAnyTrades()
            ? '<button class="pf-impitem pf-eyeitem' + (tradesHidden ? ' off-eye' : '') + '" onclick="pfToggleTradesHidden(event)">' +
                '<span class="pf-eyedot" style="background:#5B7C99"></span>' +
                '<span class="pf-impbody"><b>История сделок</b><i>' + (tradesHidden ? 'скрыта' : 'журнал покупок и продаж') + '</i></span>' +
                '<span class="pf-eyestate">' + (tradesHidden ? EYEOFF_SVG : EYE_SVG) + '</span></button>'
            : '';
        var secInner = dashSecRows + tradesRow;
        var secGroup = secInner ? '<div class="pf-impgrp">Секции страницы</div>' + secInner : '';
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'eye\')">' + EYE_SVG + '<span>Видимость</span>' +
                (multi && vis < total ? '<i class="pf-eyecnt">' + vis + '/' + total + '</i>' : '') + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-eye">' + pfGroup + secGroup + '</div></div>';
    }

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
            rows.push({ name: p.name, color: p.color, pct: c.pnlPct, value: c.value, has: c.invested > 0, hid: !!p.hidden });
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
                '<span class="pfs2-cap">' + (r.value > 0 ? fmtRub(r.value) : '—') + '</span>' +
                '<span class="pfs2-v ' + (r.has ? (r.pct >= 0 ? 'pos' : 'neg') : 'muted') + '">' + (r.has ? fmtPct(r.pct) : '—') + '</span>' +
            '</div>';
        }).join('');

        var GO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        var warm = pfQuotesWarming();   // первая загрузка котировок → капитал скелетоном
        return '<div class="dash2-card pf-sumcard">' +
            '<div class="pfs2-eyebrow"><span class="pfs2-eyebrow-t">Суммарный капитал</span><span class="pfs2-eyebrow-c">' + PF.store.items.length + ' ' + plural(PF.store.items.length, 'портфель', 'портфеля', 'портфелей') + '</span></div>' +
            '<div class="pfs2-capital">' + (warm ? skelHtml(170, 26) : fmtRub(val)) + '</div>' +
            '<div class="pfs2-sub">Вложено ' + fmtRub(inv) + (warm ? '<span class="pfs2-pnl">' + skelHtml(110, 12) + '</span>'
                : '<span class="pfs2-pnl ' + (pnl >= 0 ? 'pos' : 'neg') + '">' + (pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(pnl)) + ' · ' + fmtPct(pnlPct) + '</span>') + '</div>' +
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

    // ---- donut (conic). Центр — СОСЕД ring'а: CSS-mask клипает потомков ----
    // centerHtml опционален: для карточки/сводки центр оставляем пустым (соотношение
    // акций/облигаций показывает легенда рядом), для разворота — пишем капитал.
    function donutHtml(bondPct, size, centerHtml) {
        size = size || 96;
        var bp = clamp(bondPct, 0, 100);
        return '<div class="pf-ring-wrap" style="width:' + size + 'px;height:' + size + 'px">' +
            '<div class="pf-ring" style="--bp:' + bp.toFixed(1) + '"></div>' +
            (centerHtml ? '<div class="pf-ring-c">' + centerHtml + '</div>' : '') + '</div>';
    }

    // ---- сетка карточек (calCell — HTML «Календаря выплат», занимает свободную ячейку
    // сетки при нечётном числе портфелей: та же высота, что у карточки портфеля) ----
    function gridHtml(calCell) {
        if (!PF.store.items.length) return emptyHtml();
        var vis = visibleItems();
        if (!vis.length) return allHiddenHtml();
        // рендерим ВСЕ видимые портфели (MAX_CARDS ограничивает только создание новых):
        // раньше slice(0,4) молча прятал карточки 5+ после импорта бэкапа
        var items = vis;
        var narrow = PF.cardViewMode === 'narrow', cols = narrow ? 3 : 2;
        // Раскрытый график выезжает ОВЕРЛЕЕМ в сторону поверх контента (position:absolute) —
        // сетка НЕ перестраивается, карточка не смещается, соседи не «прыгают». Направление
        // выезда зависит от колонки: последняя в ряду тянет влево (.col-right).
        var cards = items.map(function (p, i) { return cardHtml(p, i, i % cols === cols - 1, narrow, narrow && i % cols === 1); }).join('');
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
            '<div class="pf-empty-s">Создайте портфель вручную или импортируйте состав из расчёта, избранного или ежемесячного дохода.</div>' +
            '<div class="pf-empty-cta">' +
                '<button class="d3-quick" onclick="pfAddPortfolio()">Создать вручную</button>' +
                impWrapHtml('empty', null) +
            '</div></div>';
    }

    var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg>';

    var HOLDS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    var COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var REBAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg>';

    // ====================================================================
    //  ИСТОРИЯ СДЕЛОК — полноширинный журнал ПОД всей сеткой (всегда самая
    //  нижняя секция). Каждая сделка = один лот покупки (модель хранит только
    //  покупки; поля l.side/l.fee зарезервированы под будущий ввод продаж и
    //  комиссии — сейчас side='buy', fee=0). Стиль повторяет «Календарь выплат».
    // ====================================================================
    var TRADES_HIDDEN_KEY = 'pf_trades_hidden_v1';
    var tradesHidden = false;
    try { tradesHidden = localStorage.getItem(TRADES_HIDDEN_KEY) === '1'; } catch (e) {}
    var tradesFull = false;     // общий шеврон блока: свёрнуто → 3 последние операции
    var tradeYearOpen = {};     // year → true/false, переопределяет дефолт (последний год открыт)
    var tradeSel = null;        // фильтр портфелей: null = все, иначе { pid:true }
    var tradeKind = 'all';      // R7: фильтр типа операции: all | buy | sell | pay (купоны и дивиденды)
    var TR_CHEV = '<svg class="__CH__" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    function tradePfSelected(p) { return !tradeSel || !!tradeSel[p.id]; }
    // портфели-кандидаты для фильтра: не скрытые и содержащие хоть один лот с кол-вом > 0
    function tradePfCandidates() {
        return PF.store.items.filter(function (p) {
            return !p.hidden && (p.holdings || []).some(function (h) {
                return h.ticker && ensureLots(h).some(function (l) { return (+l.qty || 0) > 0; });
            });
        });
    }
    // all=true → без фильтра портфелей (для проверки «есть ли вообще сделки»)
    function collectTrades(all) {
        var list = [];
        // номер портфеля-метки — тот же, что у колец на карточках и в календаре выплат
        // (позиция среди ВИДИМЫХ портфелей), чтобы номера совпадали по всей вкладке
        var visNum = {};
        visibleItems().forEach(function (p, i) { visNum[p.id] = i + 1; });
        PF.store.items.forEach(function (p) {
            if (p.hidden) return;
            if (!all && !tradePfSelected(p)) return;
            // Обмены ребалансировки: продажи в лотах не хранятся (лоты — только покупки),
            // поэтому строку «Продажа» строим из журнала p.trades. Купленный в обмене лот
            // помечаем связкой lotId→trade — для бейджа «ребаланс» и синхронной отмены.
            var rebalByLot = {};
            var newestUndoable = (p.trades && p.trades.length && p.trades[0].undo) ? p.trades[0].id : null;
            (p.trades || []).forEach(function (t) {
                if (t.undo && t.undo.buyLotId) rebalByLot[t.undo.buyLotId] = t;
                var w = new Date(t.ts || 0);
                var iso = w.getFullYear() + '-' + pad2(w.getMonth() + 1) + '-' + pad2(w.getDate());
                var qty = +t.sellQty || 0;
                var proceeds = +t.proceeds || 0;
                list.push({ date: iso, ticker: t.sellTicker || '', name: t.sellName || t.sellTicker || '',
                    type: t.kind === 'bond' ? 'bond' : 'stock', side: 'sell',
                    price: qty > 0 ? proceeds / qty : 0, nkd: 0, hasNkd: false, qty: qty,
                    position: proceeds, fee: 0, total: proceeds,
                    pfName: p.name, pfColor: colorVal(p.color), pfNum: visNum[p.id] || '',
                    rebal: true, pid: p.id, tradeId: t.id, undoable: t.id === newestUndoable });
            });
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker) return;
                var isBond = h.type === 'bond';
                ensureLots(h).forEach(function (l) {
                    var qty = +l.qty || 0; if (!(qty > 0)) return;
                    var price = +l.buyPrice || 0;
                    var nkd = isBond ? (+l.nkd || 0) : 0;
                    var position = (price + nkd) * qty;   // стоимость бумаг (для облигаций — с НКД)
                    var fee = +l.fee || 0;
                    var rt = rebalByLot[l.id];   // лот куплен в обмене ребалансировки?
                    list.push({ date: l.buyDate || '', ticker: h.ticker, name: h.name || h.ticker,
                        type: h.type, side: l.side === 'sell' ? 'sell' : 'buy',
                        price: price, nkd: nkd, hasNkd: isBond, qty: qty,
                        position: position, fee: fee, total: position + fee,
                        pfName: p.name, pfColor: colorVal(p.color), pfNum: visNum[p.id] || '',
                        rebal: !!rt, pid: p.id, tradeId: rt ? rt.id : null,
                        undoable: !!rt && rt.id === newestUndoable });
                });
            });
        });
        // новее — выше (даты ISO YYYY-MM-DD сравниваются лексикографически)
        list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        return list;
    }
    function hasAnyTrades() { return collectTrades(true).length > 0; }
    // R7: ПОЛУЧЕННЫЕ выплаты (купоны по расписаниям MOEX + дивиденды по отсечкам) как строки
    // журнала операций — те же расписания, что питают pfPayouts/«Календарь выплат», только
    // прошлые даты. Количество на дату выплаты — qtyAtDate (как в holdPayouts).
    function collectPastPayouts() {
        var out = [], today = todayStr();
        var visNum = {};
        visibleItems().forEach(function (p, i) { visNum[p.id] = i + 1; });
        PF.store.items.forEach(function (p) {
            if (p.hidden || !tradePfSelected(p)) return;
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker || !(aggHolding(h).qty > 0)) return;
                function push(kind, d, v) {
                    var q = qtyAtDate(h, d); if (!(q > 0)) return;
                    out.push({ date: d, ticker: h.ticker, name: assetDisplayName(h), type: h.type,
                        side: 'pay', payKind: kind, price: v, nkd: 0, hasNkd: false, qty: q,
                        position: v * q, fee: 0, total: v * q,
                        pfName: p.name, pfColor: colorVal(p.color), pfNum: visNum[p.id] || '' });
                }
                if (h.type === 'bond') {
                    var full = fullBondId(h.ticker);
                    if (!(full in coupSched)) { ensureSchedule('bond', full); return; }
                    (coupSched[full] || []).forEach(function (cp) { if (cp.d <= today) push('coup', cp.d, cp.v); });
                } else {
                    if (!(h.ticker in divSched)) { ensureSchedule('div', h.ticker); return; }
                    (divSched[h.ticker] || []).forEach(function (dv) { if (dv.d <= today) push('div', dv.d, dv.v); });
                }
            });
        });
        out.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        return out;
    }
    function groupTradesByYear(trades) {
        var groups = [], idx = {};
        trades.forEach(function (t) {
            var y = (t.date || '').slice(0, 4) || '—';
            if (!(y in idx)) { idx[y] = groups.length; groups.push({ year: y, items: [], sum: 0 }); }
            var g = groups[idx[y]]; g.items.push(t);
            if (t.side === 'buy') g.sum += t.total;   // сумма года — только расходы на покупки
        });
        return groups;   // порядок годов — по убыванию (trades уже отсортированы)
    }
    function tradeYearIsOpen(year, latest) { return (year in tradeYearOpen) ? tradeYearOpen[year] : (year === latest); }

    function tradeHeadRowHtml(multiPf) {
        return '<div class="pft-hrow">' +
            (multiPf ? '<div class="pft-h"></div>' : '') +   // рельса номера-маркера — без заголовка
            '<div class="pft-h">Дата</div>' +
            '<div class="pft-h">Тип</div>' +
            '<div class="pft-h">Тикер · название</div>' +
            '<div class="pft-h pft-r">Цена</div>' +
            '<div class="pft-h pft-r">НКД</div>' +
            '<div class="pft-h pft-r">Кол-во</div>' +
            '<div class="pft-h pft-r">Позиция</div>' +
            '<div class="pft-h pft-r">Комиссия</div>' +
            '<div class="pft-h pft-r">Расход</div>' +
        '</div>';
    }
    function tradeRowHtml(t, multiPf) {
        var side = t.side === 'sell'
            ? '<span class="pft-side sell">Продажа</span>'
            : t.side === 'pay'
                ? '<span class="pft-side pay">' + (t.payKind === 'div' ? 'Дивиденды' : 'Купон') + '</span>'
                : '<span class="pft-side buy">Покупка</span>';
        // сделка из ребалансировки: компактная круглая иконка-метка В ТОЙ ЖЕ строке, что
        // и пилюля типа (не вторым рядом) + (для последней) кнопка синхронной отмены —
        // отмена убирает И продажу, И покупку (общая механика pfRbUndoTrade)
        if (t.rebal) side += '<span class="pft-rebal-ic" title="Сделка из ребалансировки портфеля">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg></span>';
        var undoBtn = (t.rebal && t.undoable && t.pid && t.tradeId)
            ? '<button class="pft-undo" onclick="pfRbUndoTrade(\'' + t.pid + '\',\'' + t.tradeId + '\')" title="Отменить ребалансировку — исчезнут и продажа, и покупка">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>Отменить ребалансировку</button>'
            : '';
        var rel = '';
        if (t.date && typeof getRelativeDateText === 'function') {
            var d = new Date(t.date); if (!isNaN(d.getTime())) rel = getRelativeDateText(d);
        }
        // для продажи и выплаты «Расход» — на самом деле приход: с плюсом и зелёным
        var totalCell = (t.side === 'sell' || t.side === 'pay') ? '<span class="pft-in">+' + fmtRub(t.total) + '</span>' : fmtRub(t.total);
        return '<div class="pft-row' + (t.rebal ? ' pft-row-rebal' : '') + '">' +
            // метка портфеля — номер-маркер ПЕРВОЙ колонкой (левая рельса, как в календаре
            // выплат): без имени и без заголовка, имя портфеля — в подсказке при наведении
            (multiPf ? '<span class="pft-pf" style="--c:' + t.pfColor + '" title="' + esc(t.pfName) + '"><b class="pft-pfnum">' + (t.pfNum || '') + '</b></span>' : '') +
            '<div class="pft-date"><b>' + ruDate(t.date) + '</b>' + (rel ? '<span>' + esc(rel) + '</span>' : '') + '</div>' +
            '<div class="pft-c pft-type">' + side + '</div>' +
            '<div class="pft-id"><span class="pft-tk">' + esc(t.ticker) + '</span><span class="pft-nm">' + esc(t.name) + '</span></div>' +
            '<div class="pft-c pft-price">' + fmtPrice(t.price) + '</div>' +
            '<div class="pft-c pft-nkd">' + (t.hasNkd ? fmtPrice(t.nkd) : '<span class="pft-dash">—</span>') + '</div>' +
            '<div class="pft-c pft-qty">' + t.qty + '</div>' +
            '<div class="pft-c pft-pos">' + fmtRub(t.position) + '</div>' +
            '<div class="pft-c pft-fee">' + (t.fee > 0 ? fmtRub(t.fee) : '<span class="pft-dash">—</span>') + '</div>' +
            '<div class="pft-c pft-total">' + totalCell + '</div>' +
            undoBtn +
        '</div>';
    }
    // Попап-фильтр «Какие портфели показывать» (переиспользует инфраструктуру «Импорт», key='trades')
    function tradeFilterHtml() {
        var cands = tradePfCandidates();
        if (cands.length < 2) return '';   // фильтровать нечего (0–1 портфель со сделками)
        var allOn = !tradeSel, selN = cands.filter(tradePfSelected).length;
        var rows = '<button class="pf-impitem pf-eyeitem' + (allOn ? '' : ' off-eye') + '" onclick="pfTradeShowAll(event)">' +
                '<span class="pf-eyedot pfpc-alldot"></span>' +
                '<span class="pf-impbody"><b>Показать все</b><i>сделки по всем портфелям</i></span>' +
                '<span class="pf-eyestate">' + (allOn ? CHECK_SVG : '') + '</span></button>' +
            cands.map(function (p) {
                var on = tradePfSelected(p);
                return '<button class="pf-impitem pf-eyeitem' + (on ? '' : ' off-eye') + '" onclick="pfToggleTradePf(\'' + p.id + '\',event)">' +
                    '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                    '<span class="pf-impbody"><b>' + esc(p.name) + '</b></span>' +
                    '<span class="pf-eyestate">' + (on ? EYE_SVG : EYEOFF_SVG) + '</span></button>';
            }).join('');
        var badge = !allOn ? '<i class="pf-eyecnt">' + selN + '/' + cands.length + '</i>' : '';
        return '<div class="pf-impwrap pft-filter">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'trades\')">' + FILTER_SVG + 'Портфели' + badge + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-trades">' +
                '<div class="pf-impgrp">Какие портфели показывать</div>' + rows +
            '</div></div>';
    }
    // R7: пилюли типа операции (Все | Покупки | Продажи | Дивиденды) — как в референсе
    function tradeKindPillsHtml() {
        var kinds = [['all', 'Все'], ['buy', 'Покупки'], ['sell', 'Продажи'], ['pay', 'Дивиденды']];
        return '<div class="pft-kinds">' + kinds.map(function (k) {
            return '<button class="pft-kind' + (tradeKind === k[0] ? ' on' : '') + '" onclick="pfSetTradeKind(\'' + k[0] + '\')">' + k[1] + '</button>';
        }).join('') + '</div>';
    }
    // asPage=true → полноэкранный журнал подвкладки «Операции»: всегда развёрнут,
    // без шеврона «Все сделки» и без ссылки «Вся история».
    function tradesHtml(asPage) {
        if (!asPage && (tradesHidden || !PF.store.items.length || !hasAnyTrades())) return '';
        if (asPage && !PF.store.items.length) return '';
        var buysSells = collectTrades(false);
        // выплаты подмешиваем в «Все» и показываем отдельно в «Дивиденды»
        var pays = (tradeKind === 'all' || tradeKind === 'pay') ? collectPastPayouts() : [];
        var trades;
        if (tradeKind === 'buy') trades = buysSells.filter(function (t) { return t.side === 'buy'; });
        else if (tradeKind === 'sell') trades = buysSells.filter(function (t) { return t.side === 'sell'; });
        else if (tradeKind === 'pay') trades = pays;
        else trades = buysSells.concat(pays).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var multiPf = tradePfCandidates().length > 1;   // колонка «Портфель» — только при 2+
        var cls = 'dash2-card pf-card2 pf-trades' + (multiPf ? ' has-pf' : '') + (asPage ? ' pf-trades--page' : '');
        // «Расход всего» — только траты на покупки (выручка продаж расходом не является)
        var totalSum = trades.reduce(function (s, t) { return s + (t.side === 'buy' ? t.total : 0); }, 0);
        var full = asPage || tradesFull;
        var toggle = asPage ? '' : '<button class="pft-toggle' + (tradesFull ? ' on' : '') + '" onclick="pfToggleTrades()" title="' + (tradesFull ? 'Свернуть' : 'Показать все операции') + '">' +
            '<span>' + (tradesFull ? 'Свернуть' : 'Все операции · ' + trades.length) + '</span>' +
            TR_CHEV.replace('__CH__', 'pft-toggle-ch' + (tradesFull ? ' up' : '')) + '</button>';
        var allLink = asPage ? '' : '<button class="pft-alllink" onclick="pfxGoTab(\'ops\')" title="Открыть подвкладку «Операции»"><span>Вся история</span>' + GO_ARROW_SVG + '</button>';
        var right = '<div class="pft-head-r">' + tradeKindPillsHtml() + tradeFilterHtml() +
            '<div class="pft-sum"><span class="pft-sum-l">Расход всего</span><span class="pft-sum-v">' + fmtRub(totalSum) + '</span></div>' +
            toggle + allLink + '</div>';
        var head = pfCardHead('', 'История операций', 'покупки, продажи и выплаты по всем портфелям', right);
        var inner;
        if (!trades.length) {
            inner = '<div class="pft-empty">' + (tradeKind === 'pay'
                ? 'Полученных выплат пока нет — купоны и дивиденды появятся здесь по расписаниям Мосбиржи'
                : 'Операций этого типа пока нет') + '</div>';
        } else if (!full) {
            // свёрнуто — 3 последние операции плоским списком (без разбивки по годам)
            inner = tradeHeadRowHtml(multiPf) +
                '<div class="pft-list">' + trades.slice(0, 3).map(function (t) { return tradeRowHtml(t, multiPf); }).join('') + '</div>' +
                (trades.length > 3 ? '<div class="pft-morehint">и ещё ' + (trades.length - 3) + ' ' + plural(trades.length - 3, 'операция', 'операции', 'операций') + ' — разверните «Все операции»</div>' : '');
        } else {
            // развёрнуто — с разбивкой по годам; прошлые годы сворачиваются по клику
            var groups = groupTradesByYear(trades);
            var latest = groups.length ? groups[0].year : '';
            inner = tradeHeadRowHtml(multiPf) + groups.map(function (g) {
                var open = tradeYearIsOpen(g.year, latest);
                var yhead = '<button class="pft-yr' + (open ? ' open' : '') + '" onclick="pfToggleTradeYear(\'' + g.year + '\')">' +
                    TR_CHEV.replace('__CH__', 'pft-yr-ch') +
                    '<span class="pft-yr-y">' + esc(g.year) + '</span>' +
                    '<span class="pft-yr-n">' + g.items.length + ' ' + plural(g.items.length, 'операция', 'операции', 'операций') + '</span>' +
                    '<span class="pft-yr-sum">' + fmtRub(g.sum) + '</span></button>';
                var rows = open ? '<div class="pft-list">' + g.items.map(function (t) { return tradeRowHtml(t, multiPf); }).join('') + '</div>' : '';
                return '<div class="pft-yrgrp">' + yhead + rows + '</div>';
            }).join('');
        }
        return '<div class="' + cls + '">' + head + '<div class="pft-body">' + inner + '</div></div>';
    }
    window.pfSetTradeKind = function (k) {
        if (['all', 'buy', 'sell', 'pay'].indexOf(k) < 0 || tradeKind === k) return;
        tradeKind = k; renderNoAnim();
    };
    // renderNoAnim — раскрытие «Истории операций» иначе перерисовывает мини-графики карточек с анимацией (мигание)
    window.pfToggleTrades = function () { tradesFull = !tradesFull; renderNoAnim(); };
    window.pfToggleTradeYear = function (year) {
        var groups = groupTradesByYear(collectTrades(false));
        var latest = groups.length ? groups[0].year : '';
        tradeYearOpen[year] = !tradeYearIsOpen(year, latest);
        renderPortfolios();
    };
    // ре-рендер с сохранением открытого попапа-фильтра сделок (как reRenderKeepCalMenu)
    function reRenderKeepTradeMenu() {
        var open = !!(dq('pfImp-trades') && dq('pfImp-trades').classList.contains('open'));
        renderPortfolios();
        if (open) { var m = dq('pfImp-trades'); if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); } }
    }
    window.pfTradeShowAll = function (ev) { if (ev) ev.stopPropagation(); tradeSel = null; reRenderKeepTradeMenu(); };
    window.pfToggleTradePf = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var cands = tradePfCandidates();
        if (!tradeSel) { tradeSel = {}; cands.forEach(function (p) { tradeSel[p.id] = true; }); }
        tradeSel[pid] = !tradeSel[pid];
        if (cands.every(function (p) { return tradeSel[p.id]; }) || cands.every(function (p) { return !tradeSel[p.id]; })) tradeSel = null;
        reRenderKeepTradeMenu();
    };
    // тумблер видимости блока «История сделок» из меню «Видимость» (попап оставляем открытым)
    window.pfToggleTradesHidden = function (ev) {
        if (ev) ev.stopPropagation();
        tradesHidden = !tradesHidden;
        try { localStorage.setItem(TRADES_HIDDEN_KEY, tradesHidden ? '1' : '0'); } catch (e) {}
        var keepOpen = !!(dq('pfImp-eye') && dq('pfImp-eye').classList.contains('open'));
        renderSmooth(keepOpen ? function () {
            var m = dq('pfImp-eye');
            if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
        } : null);
        toast(tradesHidden ? 'История сделок скрыта' : 'История сделок показана');
    };
    // тумблер видимости ИЗНАЧАЛЬНОЙ секции (Календарь/Ставки/Избранное/Сводка) из меню
    // «Видимость» — попап оставляем открытым, как у «Истории сделок»
    window.pfdToggleSection = function (id, ev) {
        if (ev) ev.stopPropagation();
        var wasHidden = !!(PF.dashCfg.hidden || {})[id];
        pfdPushUndo();
        PF.dashCfg.hidden[id] = wasHidden ? 0 : 1;
        saveDashCfg();
        var keepOpen = !!(dq('pfImp-eye') && dq('pfImp-eye').classList.contains('open'));
        PF.pfdWantRender = true;   // явная правка конструктора — не глушим рендер
        renderSmooth(keepOpen ? function () {
            var m = dq('pfImp-eye');
            if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
        } : null);
        toast(wasHidden ? 'Блок показан' : 'Блок скрыт');
    };

    // ====================================================================
    //  КАРТОЧКА РЕБАЛАНСИРОВКИ (R5) — модалка поверх контента (в <body>)
    //  Белая карточка с моно-цифрами (как «Главная»): шапка с пилюлями
    //  «Прибыль …/день» и «НДФЛ», слим-бар шагов 1-2-3, тонированные
    //  колонки (облигации — голубая, акции — крем), строки — белые
    //  карточки. В каждой колонке: «продать» (мой портфель) | «купить»
    //  (рынок из гугл-таблицы), футер с «Подобрать за меня», расчёт обмена.
    //  Суть: обмен облигаций имеет смысл, только если растёт суммарная
    //  прибыль в день (машина денег) — карточка показывает это до/после.
    // ====================================================================
    window.pfExpand = function (pid) {
        var p = findPf(pid); if (!p) return;
        rebalPick = { bond: { sell: null, buy: null, qty: null }, stock: { sell: null, buy: null, qty: null } };
        rebalInfo = {}; rebalFormulas = false; rebalParams = false; rebalHistory = false; rebalFlash = null;
        // Цена/НКД облигаций «сейчас» — основа решения об обмене: сбрасываем живой кэш held-бумаг
        // при каждом открытии, чтобы карточка тянула свежую котировку MOEX (у акций свой TTL 60с).
        (p.holdings || []).forEach(function (h) {
            if (h.type === 'bond' && h.ticker) { delete bondQuotes[h.ticker]; delete bondNkdNow[h.ticker]; }
        });
        ensureQuotes(true);
        if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }   // эшелоны/потенциал акций
        var ov = dq('pfOverlay');
        if (!ov) {
            ov = document.createElement('div'); ov.id = 'pfOverlay'; document.body.appendChild(ov);
            ov.addEventListener('click', function (e) {
                if (e.target === ov) { window.pfCloseOverlay(); return; }
                // клик мимо открытого попапа параметров — закрыть его (пилюля-кнопка переключает сама)
                if (rebalParams && !e.target.closest('.rb5-hwrap')) { rebalParams = false; rebalRepaint(); }
            });
            // выбор бумаги с клавиатуры: строки-«кнопки» — div с role=button, Enter/Space их «кликают»
            ov.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                if (e.target.closest('button, input, a, select, textarea')) return;   // на своих контролах — их логика
                var row = e.target.closest('.rb5-row'); if (!row) return;
                e.preventDefault(); row.click();
            });
        }
        ov.dataset.pid = pid;
        ov.innerHTML = overlayHtml(p, true);
        // догружаем купоны/погашения (мои облигации + список ОФЗ из таблицы) → перерисовать
        ensureBondDetails(p, function () {
            var o = dq('pfOverlay'); if (o && o.dataset.pid === pid && o.classList.contains('show')) rebalRepaint();
        });
        ov.classList.add('show'); document.body.classList.add('pf-modal-open');
        document.addEventListener('keydown', pfEscClose);
    };
    // Перерисовка карточки (выбор бумаги, смена параметров, догрузка данных) с сохранением
    // скролла тела и списков: innerHTML пересобирает всё с нуля, без этого списки «прыгают».
    // Анимация входа не переигрывается (pfo-anim-in только в pfExpand) — карточка не мигает.
    function rebalRepaint() {
        var ov = dq('pfOverlay'); if (!ov || !ov.classList.contains('show')) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var body = ov.querySelector('.rb5-body'), bodyTop = body ? body.scrollTop : 0;
        var listTops = [].map.call(ov.querySelectorAll('.rb5-list-scroll'), function (el) { return el.scrollTop; });
        ov.innerHTML = overlayHtml(p);
        var nb = ov.querySelector('.rb5-body'); if (nb) nb.scrollTop = bodyTop;
        [].forEach.call(ov.querySelectorAll('.rb5-list-scroll'), function (el, i) { if (listTops[i] != null) el.scrollTop = listTops[i]; });
    }
    // Догрузка деталей купонов (купон/частота/погашение): облигации портфеля + список ОФЗ
    // из таблицы — без них не посчитать прибыль в день у кандидатов на покупку.
    function ensureBondDetails(p, cb) {
        var need = (p.holdings || []).filter(function (h) { return h.type === 'bond' && h.ticker && !bondDetail(h.ticker); })
            .map(function (h) { return h.ticker; });
        ofzMarket().forEach(function (b) { if (b.t && !bondDetail(b.t)) need.push(b.t); });
        if (!need.length || typeof fetchBondData !== 'function') { cb(); return; }
        var left = need.length;
        need.forEach(function (tk) {
            // короткий ISIN портфеля → полный SECID, иначе fetchBondData не находит купоны/погашение
            Promise.resolve(fetchBondData(fullBondId(tk))).catch(function () {}).then(function () { if (--left <= 0) cb(); });
        });
    }
    window.pfCloseOverlay = function () {
        var ov = dq('pfOverlay'); if (ov) ov.classList.remove('show');
        document.body.classList.remove('pf-modal-open'); document.removeEventListener('keydown', pfEscClose);
    };
    function pfEscClose(e) {
        if (e.key !== 'Escape') return;
        // открыт диалог подтверждения (отмена сделки) — Esc гасит ЕГО (свой обработчик), не карточку
        if (dq('pfConfirmOv')) return;
        // сначала сворачиваем раскрытый попап/панель, и только следующим Esc — саму карточку
        if (rebalParams || rebalFormulas || rebalHistory) {
            rebalParams = false; rebalFormulas = false; rebalHistory = false; rebalRepaint(); return;
        }
        window.pfCloseOverlay();
    }

    // ---------- параметры ----------
    var rebalTax = 0;            // ставка НДФЛ в расчётах (0 / 0.13 / 0.15)
    var rebalFee = 0;            // комиссия брокера за сделку (доля, напр. 0.0005 = 0,05%);
                                 // берётся ДВАЖДЫ: при продаже (уменьшает выручку) и при покупке (удорожает бумагу)
    var REBAL_FEES = [[0, '0%'], [0.0005, '0,05%'], [0.001, '0,1%'], [0.003, '0,3%']];
    var rebalPeriod = 'day';     // период метрики прибыли: 'day' | 'week' | 'month'
    var PERIODS = { day: ['в день', 1], week: ['в неделю', 7], month: ['в месяц', 30] };
    // выбранный обмен: sell — id актива портфеля, buy — тикер/ISIN с рынка, qty — сколько
    // продать (null → подставится предложение «продать столько, чтобы штук стало больше»)
    var rebalPick = { bond: { sell: null, buy: null, qty: null }, stock: { sell: null, buy: null, qty: null } };
    var rebalInfo = {};          // ключ строки → раскрыты ли детали бумаги (иконка ⓘ в строке)
    var rebalFormulas = false;   // раскрыта ли панель «методика расчёта» (иконка ⓘ в шапке)
    var rebalParams = false;     // раскрыт ли попап «параметры» (НДФЛ/комиссия) в шапке
    var rebalHistory = false;    // раскрыта ли панель «история сделок»
    var rebalInfoAnim = null;    // ключ ⓘ-панели, открытой ПОСЛЕДНИМ кликом: анимацию играем только ей,
                                 // иначе каждый repaint переигрывал бы её у всех открытых панелей
    var rebalFlash = null;       // { delta, anim } — сдвиг «машины денег» после применённого обмена облигаций
    try {
        var _rp = JSON.parse(localStorage.getItem('pf_rebal_params') || '{}');
        if (_rp.tax != null) rebalTax = +_rp.tax;
        if (_rp.fee != null) rebalFee = +_rp.fee;
        if (PERIODS[_rp.per]) rebalPeriod = _rp.per;
    } catch (e) {}
    function saveRebalParams() { try { localStorage.setItem('pf_rebal_params', JSON.stringify({ tax: rebalTax, fee: rebalFee, per: rebalPeriod })); } catch (e) {} }
    function feeLbl(f) { for (var i = 0; i < REBAL_FEES.length; i++) if (REBAL_FEES[i][0] === f) return REBAL_FEES[i][1]; return (f * 100).toFixed(2).replace('.', ',') + '%'; }
    function f2(n) { return (n == null || !isFinite(n)) ? '—' : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function perMul() { return PERIODS[rebalPeriod][1]; }
    function perLbl() { return PERIODS[rebalPeriod][0]; }
    // короткая дата ДД.ММ.ГГГГ из строки MOEX (YYYY-MM-DD)
    function ruDate2(s) { if (!s || s === '—') return '—'; var pp = String(s).split('T')[0].split('-'); return pp.length === 3 ? pp[2] + '.' + pp[1] + '.' + pp[0] : s; }
    // короткий ключ ISIN: портфель хранит «SU26238», рынок — полный «SU26238RMFS4»
    function isinKey(t) { return String(t || '').split('RMFS')[0]; }

    // ---------- экономика облигаций («машина денег») ----------
    // Прибыль облигации при удержании до погашения:
    //   доход   = оставшиеся купоны (купон × выплат/год × дней ÷ 365) + номинал + НКД сейчас
    //   затраты = (цена + НКД) × (1 + комиссия брокера) — для моих средние по покупкам, для рыночных текущие
    //   НДФЛ    = (доход − затраты) × ставка, если разница положительна
    //   прибыль/день = (доход − затраты − НДФЛ) ÷ дней до погашения;  годовых = ×365 ÷ (затраты + НДФЛ)
    // Номинал — настоящий FACEVALUE бумаги (у ОФЗ 1000 ₽, у корпоративных бывает другой).
    // (погашение по номиналу — не сделка, комиссия при нём не берётся)
    function bondEconAt(det, costUnit, nkdNow, face) {
        if (!det || !(costUnit > 0)) return null;
        var mat = parseBondDate(det.matDate); if (!mat) return null;
        var days = (mat.getTime() - Date.now()) / 86400000; if (!(days > 0)) return null;
        var nominal = (det.face > 0) ? +det.face : (face > 0 ? face : 1000);
        var cost = costUnit * (1 + (rebalFee || 0));
        var income = (+det.couponValue || 0) * (+det.freq || 0) * days / 365 + nominal + (nkdNow || 0);
        var tax = Math.max(0, income - cost) * (rebalTax || 0);
        var profit = income - cost - tax;
        return { perDay: profit / days, annual: profit / days * 365 / (cost + tax) * 100,
            days: Math.round(days), matDate: det.matDate };
    }
    // Моя облигация: доходность из портфеля (средние цена/НКД покупки по лотам) + текущие
    // цена/НКД с MOEX (unitNow — выручка за 1 шт при продаже прямо сейчас)
    function bondHeld(h) {
        var a = aggHolding(h);
        var lb = liveBond(h.ticker);
        var nkdNow = lb.nkd != null ? lb.nkd : (a.nkd || 0);
        var price = lb.price > 0 ? lb.price : (a.avgPrice || 0);
        var econ = bondEconAt(bondDetail(h.ticker), (a.avgPrice || 0) + (a.nkd || 0), nkdNow, bondFace(h.ticker));
        return { h: h, qty: a.qty || 0, avgDate: a.avgDate, unitNow: price + nkdNow,
            priceNow: price, nkdNow: nkdNow, live: lb.live, econ: econ };
    }
    // Список ОФЗ из гугл-таблицы — ТОТ ЖЕ источник, что вкладка «ОФЗ» раздела «Ребаланс»
    // (data.js: bonds[]): t=ISIN, n=имя, p/y — цена и доходность из таблицы; цена уточняется
    // живой с MOEX (bondDataCache), НКД/погашение — из fetchBondDetailsInBackground.
    function ofzMarket() {
        try {
            if (typeof bonds !== 'undefined' && bonds && bonds.length) {
                return bonds.map(function (b) {
                    // цена И НКД — живые из кэша MOEX (ключ таблицы = полный SECID), таблица ОФЗ —
                    // фолбэк; НКД капает каждый день, со статичным табличным расход занижался
                    var live = null, liveNkd = null;
                    try {
                        if (typeof bondDataCache !== 'undefined' && bondDataCache[b.t] && bondDataCache[b.t].price > 0) {
                            live = +bondDataCache[b.t].price;
                            if (bondDataCache[b.t].nkd != null) liveNkd = +bondDataCache[b.t].nkd;
                        }
                    } catch (e) {}
                    return { t: b.t, n: b.n || b.t,
                        price: live || parseFloat(String(b.p).replace(',', '.')) || 0,
                        nkd: liveNkd != null ? liveNkd : (parseFloat(b.nkd || 0) || 0),
                        sheetYield: toNum(b.y), matDate: b.matDate };
                });
            }
        } catch (e) {}
        return [];
    }
    // Кандидат на покупку: цена+НКД сейчас = расход, дальше та же экономика, что у моих
    function ofzCand(b) {
        var unit = b.price + b.nkd;
        var econ = bondEconAt(bondDetail(b.t), unit, b.nkd, bondFace(b.t));
        return { t: b.t, n: b.n, unit: unit, price: b.price, nkd: b.nkd, sheetYield: b.sheetYield,
            matDate: (econ && econ.matDate) || b.matDate, econ: econ };
    }
    // Суммарная прибыль в день по всем облигациям портфеля + штук; pending — купоны грузятся
    function bondsTotal(bs) {
        var total = 0, units = 0, pending = false;
        bs.forEach(function (x) {
            var r = bondHeld(x.h); if (!(r.qty > 0)) return;
            units += r.qty;
            if (r.econ) total += r.econ.perDay * r.qty; else pending = true;
        });
        return { total: total, units: units, pending: pending };
    }
    // Сколько продать, чтобы купить хотя бы на 1 бумагу БОЛЬШЕ (продал 200 → купил 202):
    // минимальное n, при котором floor(n × выручка-за-шт ÷ цена-новой-с-НКД) ≥ n + 1.
    // Выручка за шт — за вычетом комиссии продажи, цена новой — с комиссией покупки.
    // null — новая бумага не дешевле: больше штук не выйдет ни при каком n.
    function bondQtyFor1More(unitS, unitB, maxQty) {
        var f = rebalFee || 0, net = unitS * (1 - f), gross = unitB * (1 + f);
        if (!(net > 0) || !(gross > 0) || net <= gross) return null;
        for (var n = 1; n <= maxQty; n++) if (Math.floor(n * net / gross) >= n + 1) return n;
        return null;
    }
    // ---------- график ежемесячных выплат (портфели из импорта «Ежемесячный доход») ----------
    var RB_MON = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    // Месяцы (0-11), в которые бумага платит купоны в ближайшие 12 месяцев —
    // та же периодическая схема от nextCouponDate, что и в календаре выплат
    function bondPayMonths(tk) {
        var det = bondDetail(tk); if (!det) return null;   // детали ещё грузятся
        var nd = nextCouponDate(det); if (!nd) return null;
        var freq = +det.freq || 0; if (!(freq > 0)) return null;
        var stepMs = (365 / freq) * 86400000;
        var out = {}, horizon = Date.now() + 365 * 86400000;
        for (var t = nd.getTime(); t <= horizon; t += stepMs) out[new Date(t).getMonth()] = 1;
        return out;
    }
    // Месяцы, которые останутся БЕЗ выплат, если продать sellH целиком и купить candT
    // (candT == null → просто продать). null — детали купонов ещё не загружены.
    function pfLostMonths(bs, sellH, candT) {
        var mine = bondPayMonths(sellH.ticker); if (!mine) return null;
        var cov = {};
        bs.forEach(function (x) {
            if (x.h.id === sellH.id) return;
            if (!(aggHolding(x.h).qty > 0)) return;
            var m = bondPayMonths(x.h.ticker); if (!m) return;
            Object.keys(m).forEach(function (k) { cov[k] = 1; });
        });
        var candM = candT ? (bondPayMonths(candT) || {}) : {};
        var lost = [];
        Object.keys(mine).forEach(function (k) { if (!cov[k] && !candM[k]) lost.push(+k); });
        lost.sort(function (a, b) { return a - b; });
        return lost;
    }
    function rbIsMonthlyPf() {
        var ov = dq('pfOverlay'); if (!ov) return false;
        var p = findPf(ov.dataset.pid);
        return !!(p && p.src === 'monthly');
    }

    // Полный расчёт обмена облигаций: продаём qty своих (цена+НКД сейчас, минус комиссия) →
    // покупаем новые (цена+НКД сейчас, плюс комиссия); прибыль в день и штук — по всему
    // портфелю ДО и ПОСЛЕ
    function bondDeal(r, cand, bs) {
        if (!r || !cand || !(r.qty > 0) || !(r.unitNow > 0) || !(cand.unit > 0)) return null;
        var f = rebalFee || 0;
        var suggest = bondQtyFor1More(r.unitNow, cand.unit, r.qty);
        var qty = rebalPick.bond.qty != null ? clamp(Math.round(rebalPick.bond.qty), 1, r.qty) : (suggest || r.qty);
        var proceeds = qty * r.unitNow * (1 - f);
        var unitGross = cand.unit * (1 + f);
        var buyQty = Math.floor(proceeds / unitGross);
        var t = bondsTotal(bs);
        var after = (r.econ && cand.econ && !t.pending) ? t.total - qty * r.econ.perDay + buyQty * cand.econ.perDay : null;
        return { qty: qty, maxQty: r.qty, suggest: suggest, proceeds: proceeds, buyQty: buyQty,
            rest: proceeds - buyQty * unitGross,
            unitsBefore: t.units, unitsAfter: t.units - qty + buyQty,
            dayBefore: t.pending ? null : t.total, dayAfter: after };
    }

    // ---------- акции ----------
    var ROMAN = ['I', 'II', 'III', 'IV'];
    // Эшелон тикера: колонка таблицы эшелонов раздела «Ребаланс» → колонка «ЭШЕЛОН» таблицы
    // акций (вкладка «Акции»); 0 — не определён. Таблица эшелонов — ПЕРВИЧНА: кандидаты на
    // покупку берутся именно из неё, поэтому фильтр «тот же эшелон» должен считать эшелон
    // продаваемой бумаги по тому же источнику (иначе несовпадение колонок двух гугл-таблиц
    // давало пустой список кандидатов).
    function echelonOf(ticker) {
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    var col = echelonTableData[ci] || [];
                    for (var i = 0; i < col.length; i++) if (col[i] && col[i].t === ticker) return ci + 1;
                }
            }
        } catch (e2) {}
        if (typeof window.stkFindCompany === 'function') {
            try { var co = window.stkFindCompany(ticker);
                if (co && co.main) { var e = parseInt(co.main['ЭШЕЛОН'], 10); if (e >= 1 && e <= 4) return e; } } catch (e1) {}
        }
        return 0;
    }
    // Потенциал акции: зафиксированный на дату покупки (h.potAtBuy) → текущий ОДХС → target эшелона
    function holdPotential(h) {
        if (h.potAtBuy != null && isFinite(+h.potAtBuy)) return +h.potAtBuy;
        var p = potentialOf(h.ticker); if (p != null) return p;
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    var col = echelonTableData[ci] || [];
                    for (var i = 0; i < col.length; i++) if (col[i] && col[i].t === h.ticker) { var t = toNum(col[i].target); if (isFinite(t)) return t; }
                }
            }
        } catch (e) {}
        return null;
    }
    // Потенциал для СРАВНЕНИЯ в обмене — тем же способом, что у кандидатов (target таблицы
    // эшелонов → живой ОДХС): сравниваем «текущий против текущего». holdPotential у моей бумаги
    // мог быть заморожен на дату покупки (это её тезис, показываем в ⓘ), но для решения
    // «менять ли сейчас» замороженное число завышало бы мою бумагу против живого кандидата.
    function livePotential(h) {
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    var col = echelonTableData[ci] || [];
                    for (var i = 0; i < col.length; i++) if (col[i] && col[i].t === h.ticker) { var t = toNum(col[i].target); if (isFinite(t)) return t; }
                }
            }
        } catch (e) {}
        var p = potentialOf(h.ticker); if (p != null && isFinite(p)) return p;
        return holdPotential(h);
    }
    // цена акции для расчётов: живой MOEX → таблица акций
    function stkPriceOf(tk) {
        if (quotes[tk] && quotes[tk].price > 0) return quotes[tk].price;
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(tk);
            if (co && co.main) { var p = toNum(co.main['Текущая Цена']); if (isFinite(p) && p > 0) return p; }
        }
        return 0;
    }
    // Кандидаты на покупку: ВСЕ потенциальные акции из гугл-таблицы (4 колонки-эшелона
    // раздела «Ребаланс»), включая уже купленные (докупить — легитимный обмен; свои
    // помечаются бейджем «в портфеле», как в списке ОФЗ). Потенциал — из таблицы эшелонов
    // (target, тот же источник, что показывает раздел «Ребаланс»), при пустом target —
    // живой ОДХС из таблицы акций; бумаги без потенциала не выкидываем, а сортируем в конец.
    // ech ≥ 1 — только тот же эшелон, что у продаваемой.
    function stockCands(ech) {
        var arr = [];
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    (echelonTableData[ci] || []).forEach(function (a) {
                        if (!a || !a.t) return;
                        var pot = toNum(a.target);
                        if (!isFinite(pot)) pot = potentialOf(a.t);
                        arr.push({ ticker: a.t, name: a.n || a.t, sector: a.sector || '', ech: ci + 1,
                            pot: (pot != null && isFinite(pot)) ? pot : null });
                    });
                }
            }
        } catch (e) {}
        if (ech >= 1) arr = arr.filter(function (a) { return a.ech === ech; });
        arr.sort(function (a, b) { return (b.pot == null ? -1e9 : b.pot) - (a.pot == null ? -1e9 : a.pot); });
        return arr;
    }
    // Обмен акций: продаём qty по текущей цене (минус комиссия) → покупаем кандидата
    // (плюс комиссия); выгода — рост потенциала
    function stockDeal(r, cand) {
        if (!r || !cand || !(r.qty > 0) || !(r.nowPrice > 0)) return null;
        var f = rebalFee || 0;
        var qty = rebalPick.stock.qty != null ? clamp(Math.round(rebalPick.stock.qty), 1, r.qty) : Math.max(1, Math.round(r.qty / 2));
        var priceN = stkPriceOf(cand.ticker);
        var proceeds = qty * r.nowPrice * (1 - f);
        var buyQty = priceN > 0 ? Math.floor(proceeds / (priceN * (1 + f))) : 0;
        return { qty: qty, maxQty: r.qty, proceeds: proceeds, priceN: priceN, buyQty: buyQty,
            rest: priceN > 0 ? proceeds - buyQty * priceN * (1 + f) : 0,
            potFrom: r.pot, potTo: cand.pot,
            potDelta: (r.pot != null && cand.pot != null) ? cand.pot - r.pot : null };
    }

    // ---------- рендер ----------
    var RB5_ARR = '<svg class="rb5-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
    // иконка «история» (часы со стрелкой назад) — кнопка истории сделок в шапке
    var RB5_HIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.8-6.5"/><path d="M3 4.5V9h4.5"/><polyline points="12 7.5 12 12 15.5 14"/></svg>';
    var UNITS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
    var COIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.5 9.3c0-1.3 1.1-2.1 2.5-2.1s2.5.8 2.5 1.9c0 2.6-5 1.4-5 4 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-2.1"/></svg>';
    // иконка «искры» — кнопка «Подобрать за меня» (авто-выбор самой выгодной пары)
    var RB5_WAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
    var RB5_CHECK = '<span class="rb5-chip">' + CHECK_SVG + '</span>';
    // иконки-бейджи шапок колонок: облигации — портик-«банк» (ОФЗ/госбумаги), акции — столбики рынка
    var RB5_IC_BOND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 9.3 12 4l8.8 5.3"/><line x1="4" y1="20.4" x2="20" y2="20.4"/><line x1="6.4" y1="10" x2="6.4" y2="20.4"/><line x1="10.1" y1="10" x2="10.1" y2="20.4"/><line x1="13.9" y1="10" x2="13.9" y2="20.4"/><line x1="17.6" y1="10" x2="17.6" y2="20.4"/></svg>';
    var RB5_IC_STOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="3.5" y1="20.5" x2="20.5" y2="20.5"/><line x1="7" y1="20" x2="7" y2="13.5"/><line x1="12" y1="20" x2="12" y2="7.5"/><line x1="17" y1="20" x2="17" y2="11"/></svg>';
    // Шапка карточки. bt — bondsTotal() портфеля или null, если облигаций нет: «машина денег»
    // и НДФЛ (он влияет только на экономику облигаций) живут в шапке и показываются лишь
    // при наличии облигаций — так колонки внизу начинаются на одном уровне.
    // Комиссия брокера влияет и на облигации, и на акции — её выбор показывается всегда.
    // Шапка после чистки: слева заголовок, справа ОДИН сводный виджет (машина денег для
    // облигаций / средний потенциал для чисто акционного портфеля) + компактная пилюля
    // «параметры» (НДФЛ и комиссия живут в попапе, а не двумя сегментами в ряд) + круглые
    // кнопки история/методика/закрыть. Так шапка выглядит ровно при любом составе портфеля.
    function rb5Head(p, c, bt, ss) {
        var statW = bt ? machineHtml(bt) : stockPulseHtml(ss);
        var taxTxt = Math.round((rebalTax || 0) * 100) + '%';
        // пилюля параметров: «НДФЛ 0%» (при облигациях; комиссия дописывается, если задана) /
        // «Комиссия 0%» (только акции); клик — попап НДФЛ/комиссии
        var pillVal = bt ? taxTxt + (rebalFee > 0 ? ' · ' + feeLbl(rebalFee) : '') : feeLbl(rebalFee);
        var pill = '<div class="rb5-hwrap">' +
            '<button class="rb5-hpill' + (rebalParams ? ' on' : '') + '" onclick="pfRbParams()" title="Параметры расчёта — НДФЛ и комиссия брокера">' +
                '<span class="rb5-hpl">' + (bt ? 'НДФЛ' : 'Комиссия') + '</span><b class="rb5-hpv">' + pillVal + '</b>' +
            '</button>' + rb5ParamsPop(!!bt) + '</div>';
        var histN = (p.trades || []).length;
        var histBtn = '<button class="rb5-hbtn' + (rebalHistory ? ' on' : '') + '" onclick="pfRbHistory()" aria-label="История сделок" title="История сделок — применённые обмены">' + RB5_HIST +
            (histN ? '<i class="rb5-hbadge">' + (histN > 99 ? '99+' : histN) + '</i>' : '') + '</button>';
        var fxBtn = '<button class="rb5-hbtn' + (rebalFormulas ? ' on' : '') + '" onclick="pfRbFormulas()" aria-label="Методика расчёта" title="Методика расчёта — все формулы">' + INFO_SVG + '</button>';
        return '<div class="rb5-head">' +
            '<div class="rb5-head-t">' +
                '<span class="rb5-eyebrow">Ребалансировка</span>' +
                '<span class="rb5-title">' + esc(p.name) + '</span>' +
                '<span class="rb5-sub">' + c.count + ' ' + plural(c.count, 'актив', 'актива', 'активов') + ' · ' + fmtRub(c.value) + '</span>' +
            '</div>' +
            '<div class="rb5-head-r">' + statW + pill + histBtn + fxBtn +
                '<button class="rb5-x" onclick="pfCloseOverlay()" aria-label="Закрыть">' + XMARK_SVG + '</button>' +
            '</div>' +
        '</div>';
    }
    // Попап «параметры»: сегменты НДФЛ (только при облигациях — на акции он тут не влияет)
    // и комиссии + поле «своя» для нестандартного тарифа брокера (в процентах за сделку).
    function rb5ParamsPop(hasB) {
        if (!rebalParams) return '';
        var taxes = [[0, '0%'], [0.13, '13%'], [0.15, '15%']];
        var preset = false; REBAL_FEES.forEach(function (o) { if (o[0] === rebalFee) preset = true; });
        var taxSec = !hasB ? '' : '<div class="rb5-pop-sec"><span class="rb5-pop-l">НДФЛ</span>' +
            '<div class="rb5-seg">' + taxes.map(function (o) {
                return '<button class="rb5-seg-b' + (rebalTax === o[0] ? ' on' : '') + '" onclick="pfSetRebalTax(' + o[0] + ')">' + o[1] + '</button>';
            }).join('') + '</div>' +
            '<span class="rb5-pop-hint">учитывается в прибыли облигаций к погашению</span></div>';
        var feeSec = '<div class="rb5-pop-sec"><span class="rb5-pop-l">Комиссия брокера</span>' +
            '<div class="rb5-pop-feerow"><div class="rb5-seg">' + REBAL_FEES.map(function (o) {
                return '<button class="rb5-seg-b' + (preset && rebalFee === o[0] ? ' on' : '') + '" onclick="pfSetRebalFee(' + o[0] + ')">' + o[1] + '</button>';
            }).join('') + '</div>' +
            '<label class="rb5-pop-own' + (preset ? '' : ' on') + '" onclick="event.stopPropagation()">' +
                '<input type="number" min="0" max="5" step="0.01" placeholder="своя" value="' + (preset ? '' : +(rebalFee * 100).toFixed(3)) + '" ' +
                    'onchange="pfSetRebalFeeCustom(this.value)"><span>%</span>' +
            '</label></div>' +
            '<span class="rb5-pop-hint">берётся дважды — при продаже и при покупке</span></div>';
        return '<div class="rb5-pop">' + taxSec + feeSec + '</div>';
    }
    // Портфель только из акций: вместо «машины денег» в шапке — средний потенциал
    // (взвешен по стоимости позиций; бумаги без потенциала не участвуют)
    function stockPulseHtml(ss) {
        var wsum = 0, w = 0;
        (ss || []).forEach(function (x) {
            var pot = livePotential(x.h);
            if (pot == null || !(x.c.value > 0)) return;
            wsum += pot * x.c.value; w += x.c.value;
        });
        if (!(w > 0)) return '';
        var avg = wsum / w;
        return '<div class="rb5-hpill rb5-hpill--stat" title="Средний потенциал акций портфеля, взвешенный по стоимости позиций">' +
            '<span class="rb5-hpl">Потенциал</span>' +
            '<b class="rb5-hpv ' + (avg >= 0 ? 'pos' : 'neg') + '">' + fmtPct(avg) + '</b>' +
            '<span class="rb5-hpt">средний</span>' +
        '</div>';
    }
    // Панель «методика расчёта» (иконка ⓘ в шапке): все формулы, по которым карточка
    // считает доходности и обмены, с текущими значениями НДФЛ и комиссии — чтобы методику
    // можно было проверить и поправить.
    function rb5FormulasHtml() {
        if (!rebalFormulas) return '';
        var fee = feeLbl(rebalFee), tax = Math.round((rebalTax || 0) * 100) + '%';
        function sect(t, rows) {
            return '<div class="rb5-fml-sect"><b>' + t + '</b>' + rows.map(function (r) {
                return '<div class="rb5-fml-r"><span>' + r[0] + '</span><code>' + r[1] + '</code></div>';
            }).join('') + '</div>';
        }
        return '<div class="rb5-fml">' +
            '<div class="rb5-fml-note">Текущие параметры: комиссия брокера <b>' + fee + '</b> (берётся при продаже и при покупке), НДФЛ <b>' + tax + '</b>. Номинал — настоящий FACEVALUE бумаги с MOEX (у ОФЗ 1000 ₽).</div>' +
            sect('Облигация — прибыль к погашению', [
                ['Доход', 'купон × выплат в год × (дней до погашения ÷ 365) + номинал + НКД сейчас'],
                ['Затраты', '(цена + НКД) × (1 + комиссия) — для моих: средние цена/НКД покупки по лотам; для рыночных: текущие'],
                ['НДФЛ', 'макс(0, доход − затраты) × ' + tax],
                ['Прибыль в день', '(доход − затраты − НДФЛ) ÷ дней до погашения'],
                ['Годовых', 'прибыль в день × 365 ÷ (затраты + НДФЛ) × 100'],
                ['Машина денег', 'сумма по портфелю: прибыль в день × кол-во (× 7 неделя / × 30 месяц)']
            ]) +
            sect('Обмен облигаций', [
                ['Выручка от продажи', 'кол-во × (цена сейчас + НКД сейчас) × (1 − комиссия)'],
                ['Куплено новых', '⌊выручка ÷ ((цена новой + НКД новой) × (1 + комиссия))⌋'],
                ['Предложенное кол-во', 'минимальное n, при котором куплено ≥ n + 1 («продал 200 → купил 201+»)'],
                ['Вердикт', 'обмен имеет смысл, если прибыль в день ПОСЛЕ > ДО']
            ]) +
            sect('Акции', [
                ['Динамика', '(цена сейчас − средняя цена покупки) ÷ средняя цена покупки × 100'],
                ['Потенциал', 'target таблицы эшелонов («Ребаланс») → живой ОДХС; в обмене сравниваем текущий против текущего (потенциал «при покупке» — в деталях бумаги)'],
                ['Выручка от продажи', 'кол-во × цена сейчас × (1 − комиссия)'],
                ['Куплено новых', '⌊выручка ÷ (цена новой × (1 + комиссия))⌋'],
                ['Налог', 'НДФЛ с прибыли акций в расчёте обмена не учитывается — прикиньте его отдельно перед продажей прибыльной бумаги'],
                ['Вердикт', 'обмен имеет смысл, если потенциал новой выше потенциала продаваемой']
            ]) +
        '</div>';
    }
    function rb5ColHead(kind, name, n, val) {
        var ic = kind === 'bond' ? RB5_IC_BOND : RB5_IC_STOCK;
        return '<div class="rb5-colhead">' +
            '<span class="rb5-chead-ic ' + kind + '">' + ic + '</span>' +
            '<div class="rb5-chead-t"><b>' + name + '</b><span>' + n + ' ' + plural(n, 'бумага', 'бумаги', 'бумаг') + '</span></div>' +
            '<div class="rb5-chead-v"><i>Стоимость</i><b>' + fmtRub(val) + '</b></div>' +
        '</div>';
    }
    function rb5Empty(t, s) { return '<div class="rb5-empty"><b>' + esc(t) + '</b><span>' + esc(s) + '</span></div>'; }
    function dealHint(msg) { return '<div class="rb5-cfoot"><span class="rb5-cfoot-t">' + esc(msg) + '</span></div>'; }
    // чип-шаг «1/2/3»: on — текущий шаг (тёмный), done — пройден (зелёная галка), '' — ещё не дошли
    function rb5Step(n, state) {
        return '<span class="rb5-step' + (state === 'done' ? ' done' : (state === 'on' ? ' on' : '')) + '">' +
            (state === 'done' ? CHECK_SVG : n) + '</span>';
    }
    // ---- слим-бар шагов «1 → 2 → 3» под шапкой (постоянная легенда, как в референсе) ----
    function rb5StepsBar() {
        function st(n, b, rest) { return '<span class="rb5-st"><i>' + n + '</i><span><b>' + b + '</b> ' + rest + '</span></span>'; }
        var arr = '<svg class="rb5-steps-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        return '<div class="rb5-steps">' +
            st(1, 'Что продать', '— бумага в списке слева') + arr +
            st(2, 'Что купить', '— замена доходнее') + arr +
            st(3, 'Примените', 'обмен при зелёном вердикте') +
            '<span class="rb5-steps-or">' + RB5_WAND + '<span>или «Подобрать за меня»</span></span>' +
        '</div>';
    }
    // Подсказка-шаг + «Подобрать за меня» — футер колонки, пока пара не собрана
    // (pfRbAuto — авто-выбор самой выгодной пары).
    function dealGuideHtml(kind, hasSell, hasBuy) {
        var t;
        if (hasSell) t = kind === 'bond' ? 'Шаг 2 — выберите в «Купить» облигацию доходнее'
                                         : 'Шаг 2 — выберите в «Купить» акцию с потенциалом выше';
        else if (hasBuy) t = 'Шаг 1 — выберите бумагу в списке «Продать»';
        else t = 'Шаг 1 — кликните бумагу в «Продать»';
        return '<div class="rb5-cfoot"><span class="rb5-cfoot-t">' + t + '</span>' +
            '<button type="button" class="rb5-auto" onclick="pfRbAuto(\'' + kind + '\')" title="Карточка сама найдёт самую выгодную пару и подставит её в расчёт">' + RB5_WAND + '<span>Подобрать за меня</span></button>' +
        '</div>';
    }
    // заголовок собранного расчёта: пара выбрана — остался шаг 3
    function dealHeadHtml() {
        return '<div class="rb5-deal-h">' + rb5Step(3, 'on') + '<b>Проверьте и примените</b></div>';
    }
    // «до → после»: «было» приглушённо и мельче, «стало» — крупно (акцент на результате)
    function rb5BA(before, after) { return '<b class="rb5-ba"><span>' + before + '</span><i>→</i>' + after + '</b>'; }
    // дельта-чип «+2 шт» / «−1,20 ₽»
    function rb5Delta(v, unit, fmt) {
        var cls = v > 0 ? 'pos' : (v < 0 ? 'neg' : 'mut');
        return '<span class="rb5-dchip ' + cls + '">' + (v > 0 ? '+' : (v < 0 ? '−' : '±')) + fmt(Math.abs(v)) + unit + '</span>';
    }
    function rb5QtyCtl(kind, qty, max) {
        return '<div class="rb5-qty">' +
            '<button type="button" onclick="pfRbQty(\'' + kind + '\',' + (qty - 1) + ',' + max + ')" aria-label="Меньше">−</button>' +
            '<input type="number" min="1" max="' + max + '" value="' + qty + '" onchange="pfRbQty(\'' + kind + '\',this.value,' + max + ')">' +
            '<button type="button" onclick="pfRbQty(\'' + kind + '\',' + (qty + 1) + ',' + max + ')" aria-label="Больше">+</button>' +
            '<span>из ' + max + ' шт</span></div>';
    }
    // «Машина денег» → пилюля «Прибыль +257,37 ₽ в день» в шапке: зелёное моно-значение,
    // клик листает период день → неделя → месяц. Пояснение формулы — в title.
    function machineHtml(t) {
        var tip = (t.pending ? 'Уточняем купоны на Мосбирже…'
            : t.units + ' ' + plural(t.units, 'облигация', 'облигации', 'облигаций') + ' · купоны + номинал + НКД − затраты') +
            ' · клик — сменить период (день / неделя / месяц)';
        // после применённого обмена: дельта-чип + стойкая цветная подсветка пилюли —
        // рост прибыли виден сразу и не гаснет при перерисовках (живёт до закрытия карточки)
        var flash = '', flashCls = '';
        if (rebalFlash && isFinite(rebalFlash.delta) && Math.abs(rebalFlash.delta) > 1e-9 && !t.pending) {
            flash = '<span class="rb5-hpd ' + (rebalFlash.delta > 0 ? 'pos' : 'neg') + '" title="Изменение после применённого обмена">' +
                (rebalFlash.delta > 0 ? '+' : '−') + f2(Math.abs(rebalFlash.delta) * perMul()) + '</span>';
            flashCls = rebalFlash.delta > 0 ? ' up' : ' down';
        }
        var val = t.pending ? '<b class="rb5-hpv mut">…</b>'
            : '<b class="rb5-hpv ' + (t.total >= 0 ? 'pos' : 'neg') + '">' + (t.total >= 0 ? '+' : '−') + f2(Math.abs(t.total) * perMul()) + ' ₽</b>';
        return '<button class="rb5-hpill rb5-hpill--stat' + flashCls + '" onclick="pfCycleRebalPeriod()" title="' + attr(tip) + '">' +
            '<span class="rb5-hpl">Прибыль</span>' + val + '<span class="rb5-hpt">' + perLbl() + '</span>' + flash +
        '</button>';
    }
    // ---- иконка ⓘ в строке + раскрывающиеся детали бумаги ----
    // Иконка появляется при наведении на строку; клик раскрывает панель деталей под строкой
    // (метаданные из строк убраны — дата погашения и прочее живут теперь только здесь).
    function rb5InfoBtn(key, on) {
        return '<button type="button" class="rb5-info' + (on ? ' on' : '') + '" onclick="pfRbInfo(\'' + jsArg(key) + '\',event)" aria-label="Детали бумаги" title="Детали">' + INFO_SVG + '</button>';
    }
    // детали — сетка мини-чипов «подпись/значение»; анимация раскрытия только у панели,
    // открытой последним кликом (rebalInfoAnim), иначе она переигрывалась бы на каждый repaint
    function rb5DetRow(l, v) { return v ? '<div class="rb5-det-i"><span>' + l + '</span><b>' + v + '</b></div>' : ''; }
    function rb5Det(key, rows) { return '<div class="rb5-det' + (rebalInfoAnim === key ? ' anim' : '') + '"><div class="rb5-det-grid">' + rows + '</div></div>'; }
    function couponStr(d) {
        if (!d || !(+d.couponValue > 0)) return 'уточняем…';
        return fmtPrice(+d.couponValue) + (+d.freq > 0 ? ' · ' + (+d.freq) + ' ' + plural(+d.freq, 'раз', 'раза', 'раз') + ' в год' : '');
    }
    // строка моей облигации: имя + кол-во | доходность годовых из портфеля
    function bondRowHtml(x) {
        var r = bondHeld(x.h), e = r.econ, sel = rebalPick.bond.sell === x.h.id;
        var key = 'bs:' + x.h.id, on = !!rebalInfo[key];
        var val = e ? '<b class="' + (e.annual >= 0 ? 'pos' : 'neg') + '">' + fmtPct(e.annual) + '</b><span>годовых</span>'
                    : '<b class="mut">…</b><span>считаем</span>';
        var det = '';
        if (on) {
            var a = aggHolding(x.h), d = bondDetail(x.h.ticker);
            det = rb5Det(key,
                rb5DetRow('ISIN', esc(x.h.ticker)) +
                rb5DetRow('Погашение', e ? ruDate2(e.matDate) + ' · через ' + e.days + ' дн' : 'уточняем…') +
                rb5DetRow('Купон', couponStr(d)) +
                rb5DetRow('Цена сейчас', (r.priceNow > 0 ? fmtPrice(r.priceNow) : '—') + (r.nkdNow != null ? ' + НКД ' + fmtPrice(r.nkdNow) : '')) +
                rb5DetRow('Куплено', r.qty + ' шт · ' + fmtPrice(a.avgPrice) + ' · ' + ruDate(a.avgDate)) +
                rb5DetRow('Прибыль в день', e ? f2(e.perDay * r.qty) + ' ₽ · ' + f2(e.perDay) + ' ₽/шт' : '—')
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickBond(\'sell\',\'' + x.h.id + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(x.h.name || x.h.ticker) + '</span></b>' +
                '<span>' + fmtQty(r.qty) + ' шт</span></div>' +
            '<div class="rb5-rval">' + val + '</div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    // строка ОФЗ из таблицы: имя + цена с НКД | доходность из таблицы
    function ofzRowHtml(cd, heldSet) {
        var sel = rebalPick.bond.buy === cd.t;
        var key = 'bb:' + cd.t, on = !!rebalInfo[key];
        var det = '';
        if (on) {
            var d = bondDetail(cd.t);
            det = rb5Det(key,
                rb5DetRow('ISIN', esc(cd.t)) +
                rb5DetRow('Погашение', (cd.matDate && cd.matDate !== '—') ? ruDate2(cd.matDate) + (cd.econ ? ' · через ' + cd.econ.days + ' дн' : '') : 'уточняем…') +
                rb5DetRow('Купон', couponStr(d)) +
                rb5DetRow('Цена с НКД', cd.unit > 0 ? fmtPrice(cd.unit) : '—') +
                rb5DetRow('Прибыль в день', cd.econ ? f2(cd.econ.perDay) + ' ₽/шт · ' + fmtPct(cd.econ.annual) + ' годовых' : '—')
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickBond(\'buy\',\'' + jsArg(cd.t) + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(cd.n) + '</span>' + (heldSet[isinKey(cd.t)] ? '<i class="rb5-own">в портф.</i>' : '') +
                (cd._keeps ? '<i class="rb5-keep" title="Купоны этой бумаги приходятся на месяцы, которые оголит продажа — график ежемесячных выплат сохранится">держит график</i>' : '') + '</b>' +
                '<span>' + (cd.unit > 0 ? fmtPrice(cd.unit) + ' с НКД' : esc(cd.t)) + '</span></div>' +
            '<div class="rb5-rval"><b class="pos">' + (isFinite(cd.sheetYield) ? cd.sheetYield.toFixed(1).replace('.', ',') + '%' : '—') + '</b><span>доходность</span></div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    // расчёт обмена облигаций: продать N шт → купить M шт + прибыль/штук ДО → ПОСЛЕ + вердикт
    function bondDealHtml(mine, cands) {
        var pick = rebalPick.bond, sellX = null, cand = null;
        mine.forEach(function (x) { if (x.h.id === pick.sell) sellX = x; });
        cands.forEach(function (cd) { if (cd.t === pick.buy) cand = cd; });
        if (!sellX && !cand) return dealGuideHtml('bond', false, false);
        if (sellX && !cand) return dealGuideHtml('bond', true, false);
        if (!sellX) return dealGuideHtml('bond', false, true);
        var sh = bondHeld(sellX.h);
        var d = bondDeal(sh, cand, mine);
        if (!d) return dealHint('Недостаточно данных для расчёта — попробуйте другую пару.');
        // прибыль в день ДО/ПОСЛЕ считаем ПЕРВЫМ — от вердикта зависит тон заметок ниже
        var per = perMul();
        var haveDay = d.dayBefore != null && d.dayAfter != null;
        var dd = haveDay ? (d.dayAfter - d.dayBefore) * per : null;
        var profitUp = dd != null && dd > 0;
        var flow = '<div class="rb5-deal-flow">' +
            '<div class="rb5-deal-side"><i>Продать</i><b>' + esc(sellX.h.name || sellX.h.ticker) + '</b>' +
                rb5QtyCtl('bond', d.qty, d.maxQty) +
                '<small>≈ ' + fmtRub(d.proceeds) + ' с НКД' + (rebalFee > 0 ? ' · после комиссии' : '') + '</small></div>' +
            '<span class="rb5-deal-arr">' + RB5_ARR + '</span>' +
            '<div class="rb5-deal-side"><i>Купить</i><b>' + esc(cand.n) + '</b>' +
                '<div class="rb5-deal-n">' + d.buyQty + ' шт</div>' +
                '<small>' + (d.rest > 0.005 ? 'останется ' + fmtPrice(d.rest) : '&nbsp;') + '</small></div>' +
        '</div>';
        // котировка «сейчас» не пришла с Мосбиржи → выручка посчитана по цене покупки: честно предупреждаем
        var note = '';
        if (!sh.live) note += '<div class="rb5-note info">' + INFO_SVG + '<span>Котировка «сейчас» ещё не пришла с Мосбиржи — выручка от продажи посчитана по вашей цене покупки. Обновите карточку через пару секунд.</span></div>';
        // штук станет меньше (новая дороже за штуку): тревожный тон — ТОЛЬКО когда прибыль НЕ растёт;
        // иначе это осознанный размен «меньше штук, зато каждая доходнее» — машина денег всё равно быстрее
        if (d.suggest == null) {
            note += profitUp
                ? '<div class="rb5-note">Штук станет меньше — новая бумага дороже за штуку, зато каждая доходнее. Прибыль в день всё равно растёт.</div>'
                : '<div class="rb5-note warn">' + CHART_WARN_SVG + '<span>Новая бумага дороже вашей: штук станет меньше' + (haveDay ? ', и прибыль в день не растёт' : '') + ' — обмен спорный.</span></div>';
        } else if (d.qty === d.suggest) {
            note += '<div class="rb5-note">Минимум для «купить больше, чем продал»: ' + d.suggest + ' шт.</div>';
        }
        // Портфель из «Ежемесячного дохода»: следим, чтобы после обмена каждый месяц
        // оставался с выплатой (продажа бумаги целиком может «оголить» её месяцы)
        if (rbIsMonthlyPf() && d.qty >= d.maxQty) {
            var lost = pfLostMonths(mine, sellX.h, cand.t);
            if (lost && lost.length) {
                note += '<div class="rb5-note warn">' + CHART_WARN_SVG + '<span>Портфель собран под выплаты каждый месяц. После этого обмена без купона останутся: <b>' +
                    lost.map(function (m) { return RB_MON[m]; }).join(', ') + '</b>. Выберите бумагу с выплатами в эти месяцы (метка «держит график») или продайте не всё.</span></div>';
            } else if (lost) {
                note += '<div class="rb5-note">График ежемесячных выплат сохраняется — все месяцы остаются с купоном.</div>';
            }
        }
        var rows = '<div class="rb5-vrow"><span class="rb5-vico">' + UNITS_SVG + '</span><span class="rb5-vlabel">Облигаций всего</span>' +
            rb5BA(d.unitsBefore, d.unitsAfter + ' шт') +
            rb5Delta(d.unitsAfter - d.unitsBefore, ' шт', function (v) { return String(v); }) + '</div>';
        var verdict = '';
        if (haveDay) {
            rows += '<div class="rb5-vrow"><span class="rb5-vico">' + COIN_SVG + '</span><span class="rb5-vlabel">Прибыль ' + perLbl() + '</span>' +
                rb5BA(f2(d.dayBefore * per), f2(d.dayAfter * per) + ' ₽') +
                rb5Delta(dd, ' ₽', f2) + '</div>';
            verdict = profitUp
                ? '<div class="rb5-verdict ok">' + CHECK_SVG + '<span>Прибыль растёт — обмен имеет смысл, машина денег разгоняется</span></div>'
                : '<div class="rb5-verdict bad">' + XMARK_SVG + '<span>Прибыль ' + perLbl() + ' снизится — такой обмен смысла не имеет</span></div>';
        } else {
            rows += '<div class="rb5-vrow"><span class="rb5-vico">' + COIN_SVG + '</span><span class="rb5-vlabel">Прибыль ' + perLbl() + '</span><b>уточняем купоны…</b></div>';
        }
        // применить обмен в портфель одним кликом (есть что покупать → кнопка активна)
        var apply = d.buyQty > 0
            ? '<button class="rb5-apply" onclick="pfRbApplyBond()" title="Сделка сразу запишется в портфель и в историю">' + CHECK_SVG +
                '<span>Применить обмен</span><i>−' + d.qty + ' → +' + d.buyQty + ' шт</i></button>'
            : '';
        return '<div class="rb5-deal">' + dealHeadHtml() + flow + note + '<div class="rb5-vbox">' + rows + '</div>' + verdict + apply + '</div>';
    }
    function rb5BondCol(bs, c) {
        var head = rb5ColHead('bond', 'Облигации', bs.length, c.bondVal);
        if (!bs.length) return '<div class="rb5-col rb5-col--bond">' + head + rb5Empty('Нет облигаций', 'Добавьте облигации в портфель — здесь появится их доходность и обмен.') + '</div>';
        // мои — по доходности годовых (лучшие сверху), рынок — по доходности из таблицы
        var mine = bs.slice().sort(function (a, b) {
            var ea = bondHeld(a.h).econ, eb = bondHeld(b.h).econ;
            return (eb ? eb.annual : -1e9) - (ea ? ea.annual : -1e9);
        });
        var heldSet = {}; bs.forEach(function (x) { heldSet[isinKey(x.h.ticker)] = 1; });
        // Список «Купить» показывается полностью (свои бумаги — с бейджем «в портфеле»),
        // но когда слева выбрана бумага на продажу — именно она исчезает из кандидатов,
        // иначе можно «обменять» бумагу саму на себя.
        var sellSel = null; bs.forEach(function (x) { if (x.h.id === rebalPick.bond.sell) sellSel = isinKey(x.h.ticker); });
        var cands = ofzMarket().map(ofzCand).filter(function (cd) { return !sellSel || isinKey(cd.t) !== sellSel; }).sort(function (a, b) {
            return (isFinite(b.sheetYield) ? b.sheetYield : -1e9) - (isFinite(a.sheetYield) ? a.sheetYield : -1e9);
        });
        // выбранный ранее кандидат пропал из списка (его же выбрали на продажу, список
        // перезагрузился) — сброс выбора ДО отрисовки, чтобы чипы шагов не врали
        if (rebalPick.bond.buy && !cands.some(function (cd) { return cd.t === rebalPick.bond.buy; })) rebalPick.bond.buy = null;
        // Портфель из «Ежемесячного дохода» + выбрана бумага на продажу → помечаем
        // кандидатов, чьи купоны закрывают «оголяющиеся» месяцы (метка «держит график»)
        if (rbIsMonthlyPf() && rebalPick.bond.sell) {
            var sellSelX = null; bs.forEach(function (x) { if (x.h.id === rebalPick.bond.sell) sellSelX = x; });
            var needLost = sellSelX ? pfLostMonths(bs, sellSelX.h, null) : null;
            if (needLost && needLost.length) {
                cands.forEach(function (cd) {
                    var cm = bondPayMonths(cd.t);
                    cd._keeps = !!cm && needLost.every(function (m) { return cm[m]; });
                });
            }
        }
        var candRows = cands.length ? cands.map(function (cd) { return ofzRowHtml(cd, heldSet); }).join('')
            : '<div class="rb5-list-empty">Список ОФЗ появится из гугл-таблицы (раздел «Ребаланс»)</div>';
        // чипы шагов 1/2 в заголовках списков — новичок видит, куда кликать сейчас
        // (шаг 3 — в блоке расчёта ниже)
        var s1 = !!rebalPick.bond.sell, s2 = !!rebalPick.bond.buy;
        return '<div class="rb5-col rb5-col--bond">' + head +
            '<div class="rb5-duo">' +
                '<div class="rb5-list"><div class="rb5-list-h">' + rb5Step(1, s1 ? 'done' : 'on') + '<b>Продать</b><i>мои · годовых</i></div><div class="rb5-list-scroll">' + mine.map(bondRowHtml).join('') + '</div></div>' +
                '<div class="rb5-list rb5-list--buy"><div class="rb5-list-h">' + rb5Step(2, s2 ? 'done' : (s1 ? 'on' : '')) + '<b>Купить</b><i>таблица ОФЗ</i></div><div class="rb5-list-scroll">' + candRows + '</div></div>' +
            '</div>' +
            bondDealHtml(mine, cands) +
        '</div>';
    }
    // строка моей акции: тикер + эшелон + кол-во/потенциал | динамика с покупки
    function stockRowHtml(x) {
        var sel = rebalPick.stock.sell === x.h.id;
        var izm = x.c.pnlPct || 0, ech = echelonOf(x.h.ticker), pot = livePotential(x.h);
        var tier = ech ? '<span class="rb5-tier t' + ech + '">' + ROMAN[ech - 1] + '</span>' : '';
        var key = 'ss:' + x.h.id, on = !!rebalInfo[key];
        var det = '';
        if (on) {
            // потенциал «при покупке» показываем отдельной строкой, только если он реально
            // заморожен и отличается от текущего — иначе лишний шум
            var atBuy = (x.h.potAtBuy != null && isFinite(+x.h.potAtBuy)) ? +x.h.potAtBuy : null;
            det = rb5Det(key,
                rb5DetRow('Компания', esc(x.h.name || x.h.ticker)) +
                rb5DetRow('Эшелон', ech ? ROMAN[ech - 1] : '—') +
                rb5DetRow('Цена сейчас', x.c.cur > 0 ? fmtPrice(x.c.cur) : '—') +
                rb5DetRow('Куплено', x.c.qty + ' шт · ' + fmtPrice(x.c.buy) + ' · ' + ruDate(x.c.firstDate)) +
                rb5DetRow('Доход', fmtRub(x.c.pnl) + ' · ' + fmtPct(izm)) +
                rb5DetRow('Потенциал сейчас', pot == null ? '—' : fmtPct(pot)) +
                (atBuy != null && (pot == null || Math.abs(atBuy - pot) > 0.05) ? rb5DetRow('При покупке', fmtPct(atBuy)) : '')
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickStock(\'sell\',\'' + x.h.id + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(x.h.ticker) + '</span>' + tier + '</b>' +
                '<span>' + fmtQty(x.c.qty) + ' шт · потенциал ' + (pot == null ? '—' : fmtPct(pot)) + '</span></div>' +
            '<div class="rb5-rval"><b class="' + (izm >= 0 ? 'pos' : 'neg') + '">' + fmtPct(izm) + '</b><span>динамика</span></div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    function stockCandRowHtml(cn, heldSet) {
        var sel = rebalPick.stock.buy === cn.ticker;
        var price = stkPriceOf(cn.ticker);
        var tier = '<span class="rb5-tier t' + cn.ech + '">' + ROMAN[cn.ech - 1] + '</span>';
        var potCls = cn.pot == null ? 'mut' : (cn.pot >= 0 ? 'pos' : 'neg');
        var key = 'sb:' + cn.ticker, on = !!rebalInfo[key];
        var det = '';
        if (on) {
            det = rb5Det(key,
                rb5DetRow('Компания', esc(cn.name)) +
                (cn.sector ? rb5DetRow('Сектор', esc(cn.sector)) : '') +
                rb5DetRow('Эшелон', ROMAN[cn.ech - 1]) +
                rb5DetRow('Цена сейчас', price > 0 ? fmtPrice(price) : '—') +
                rb5DetRow('Потенциал', cn.pot == null ? '—' : fmtPct(cn.pot))
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickStock(\'buy\',\'' + jsArg(cn.ticker) + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(cn.ticker) + '</span>' + tier + (heldSet && heldSet[cn.ticker] ? '<i class="rb5-own">в портф.</i>' : '') + '</b>' +
                '<span>' + esc(cn.name) + (price > 0 ? ' · ' + fmtPrice(price) : '') + '</span></div>' +
            '<div class="rb5-rval"><b class="' + potCls + '">' + (cn.pot == null ? '—' : fmtPct(cn.pot)) + '</b><span>потенциал</span></div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    // расчёт обмена акций: продать N шт → купить M шт + потенциал ДО → ПОСЛЕ + вердикт
    function stockDealHtml(mine, cands) {
        var pick = rebalPick.stock, sellX = null, cand = null;
        mine.forEach(function (x) { if (x.h.id === pick.sell) sellX = x; });
        cands.forEach(function (cn) { if (cn.ticker === pick.buy) cand = cn; });
        if (pick.buy && !cand) pick.buy = null;   // выбранный кандидат выпал из эшелона — сброс
        if (!sellX && !cand) return dealGuideHtml('stock', false, false);
        if (sellX && !cand) return dealGuideHtml('stock', true, false);
        if (!sellX) return dealGuideHtml('stock', false, true);
        var d = stockDeal({ qty: sellX.c.qty, nowPrice: sellX.c.cur || 0, pot: livePotential(sellX.h) }, cand);
        if (!d) return dealHint('Недостаточно данных для расчёта — попробуйте другую пару.');
        var flow = '<div class="rb5-deal-flow">' +
            '<div class="rb5-deal-side"><i>Продать</i><b>' + esc(sellX.h.ticker) + '</b>' +
                rb5QtyCtl('stock', d.qty, d.maxQty) +
                '<small>≈ ' + fmtRub(d.proceeds) + (rebalFee > 0 ? ' · после комиссии' : '') + '</small></div>' +
            '<span class="rb5-deal-arr">' + RB5_ARR + '</span>' +
            '<div class="rb5-deal-side"><i>Купить</i><b>' + esc(cand.ticker) + '</b>' +
                '<div class="rb5-deal-n">' + (d.buyQty > 0 ? d.buyQty + ' шт' : 'на ' + fmtRub(d.proceeds)) + '</div>' +
                '<small>' + (d.priceN > 0 ? 'по ' + fmtPrice(d.priceN) + (d.buyQty > 0 && d.rest > 0.005 ? ' · останется ' + fmtPrice(d.rest) : '') : '&nbsp;') + '</small></div>' +
        '</div>';
        // выручки не хватает даже на одну акцию кандидата — объясняем, а не прячем кнопку молча
        var note = (d.buyQty <= 0 && d.priceN > 0)
            ? '<div class="rb5-note warn">' + CHART_WARN_SVG + '<span>Выручки (' + fmtRub(d.proceeds) + ') не хватает даже на одну акцию ' + esc(cand.ticker) + ' по ' + fmtPrice(d.priceN) + '. Продайте больше или выберите бумагу дешевле.</span></div>'
            : '';
        var rows = '<div class="rb5-vrow"><span class="rb5-vlabel">Потенциал сейчас</span>' +
            rb5BA(d.potFrom == null ? '—' : fmtPct(d.potFrom), d.potTo == null ? '—' : fmtPct(d.potTo)) +
            (d.potDelta != null ? rb5Delta(d.potDelta, ' п.п.', function (v) { return v.toFixed(1).replace('.', ','); }) : '') + '</div>';
        var verdict = d.potDelta == null ? ''
            : (d.potDelta > 0
                ? '<div class="rb5-verdict ok">' + CHECK_SVG + '<span>Потенциал растёт — обмен имеет смысл</span></div>'
                : '<div class="rb5-verdict bad">' + XMARK_SVG + '<span>Потенциал не растёт — такой обмен смысла не имеет</span></div>');
        var apply = d.buyQty > 0
            ? '<button class="rb5-apply" onclick="pfRbApplyStock()" title="Сделка сразу запишется в портфель и в историю">' + CHECK_SVG +
                '<span>Применить обмен</span><i>−' + d.qty + ' ' + esc(sellX.h.ticker) + ' → +' + d.buyQty + ' ' + esc(cand.ticker) + '</i></button>'
            : '';
        return '<div class="rb5-deal">' + dealHeadHtml() + flow + note + '<div class="rb5-vbox">' + rows + '</div>' + verdict + apply + '</div>';
    }
    function rb5StockCol(ss, c) {
        var head = rb5ColHead('stock', 'Акции', ss.length, c.stockVal);
        if (!ss.length) return '<div class="rb5-col rb5-col--stock">' + head + rb5Empty('Нет акций', 'Добавьте акции в портфель — здесь появится их динамика, потенциал и обмен.') + '</div>';
        var mine = ss.slice().sort(function (a, b) { return (b.c.pnlPct || 0) - (a.c.pnlPct || 0); });   // по динамике
        var heldSet = {}; ss.forEach(function (x) { heldSet[x.h.ticker] = 1; });
        var sellX = null; mine.forEach(function (x) { if (x.h.id === rebalPick.stock.sell) sellX = x; });
        var ech = sellX ? echelonOf(sellX.h.ticker) : 0;
        var cands = stockCands(ech);
        // в эшелоне продаваемой бумаги кандидатов нет (или эшелон не определён) —
        // не оставляем пустоту, показываем полный список по потенциалу
        if (ech >= 1 && !cands.length) { cands = stockCands(0); ech = 0; }
        // саму продаваемую бумагу на замену не предлагаем
        if (sellX) cands = cands.filter(function (cn) { return cn.ticker !== sellX.h.ticker; });
        // кандидат пропал из списка (сменился эшелон, выбрали его же на продажу) —
        // сброс ДО отрисовки, чтобы чипы шагов не врали
        if (rebalPick.stock.buy && !cands.some(function (cn) { return cn.ticker === rebalPick.stock.buy; })) rebalPick.stock.buy = null;
        var candRows = cands.length ? cands.map(function (cn) { return stockCandRowHtml(cn, heldSet); }).join('')
            : '<div class="rb5-list-empty">Список появится из гугл-таблицы (раздел «Ребаланс»)</div>';
        // чипы шагов 1/2 — как в колонке облигаций
        var s1 = !!rebalPick.stock.sell, s2 = !!rebalPick.stock.buy;
        return '<div class="rb5-col rb5-col--stock">' + head +
            '<div class="rb5-duo">' +
                '<div class="rb5-list"><div class="rb5-list-h">' + rb5Step(1, s1 ? 'done' : 'on') + '<b>Продать</b><i>мои · динамика</i></div><div class="rb5-list-scroll">' + mine.map(stockRowHtml).join('') + '</div></div>' +
                '<div class="rb5-list rb5-list--buy"><div class="rb5-list-h">' + rb5Step(2, s2 ? 'done' : (s1 ? 'on' : '')) + '<b>Купить</b><i>потенциальные' + (ech ? ' · эшелон ' + ROMAN[ech - 1] : '') + '</i></div><div class="rb5-list-scroll">' + candRows + '</div></div>' +
            '</div>' +
            stockDealHtml(mine, cands) +
        '</div>';
    }
    // ---- панель «история сделок» (кнопка-часы в шапке) ----
    // Применённые обмены хранятся в p.trades (уходят в localStorage вместе с портфелем):
    // каждый расчёт можно отследить и проверить постфактум; запись можно удалить крестиком.
    function rb5HistoryHtml(p) {
        if (!rebalHistory) return '';
        var ts = p.trades || [];
        var rows = ts.length ? ts.map(function (t, i) {
            var w = new Date(t.ts || 0);
            var when = pad2(w.getDate()) + '.' + pad2(w.getMonth() + 1) + '.' + w.getFullYear() + ' · ' + pad2(w.getHours()) + ':' + pad2(w.getMinutes());
            var eff = '';
            if (t.kind === 'bond' && t.dayBefore != null && t.dayAfter != null)
                eff = rb5Delta(t.dayAfter - t.dayBefore, ' ₽/день', f2);
            else if (t.kind === 'stock' && t.potFrom != null && t.potTo != null)
                eff = rb5Delta(t.potTo - t.potFrom, ' п.п.', function (v) { return v.toFixed(1).replace('.', ','); });
            // отмена доступна только для ПОСЛЕДНЕЙ сделки с сохранённым состоянием —
            // так портфель гарантированно возвращается ровно к состоянию до обмена
            var undoBtn = (i === 0 && t.undo)
                ? '<button class="rb5-hist-undo" onclick="pfRbUndoTrade(\'' + p.id + '\',\'' + t.id + '\')" title="Отменить сделку — портфель вернётся к состоянию до обмена">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>Отменить</button>'
                : '';
            return '<div class="rb5-hist-r">' +
                '<span class="rb5-cdot ' + (t.kind === 'bond' ? 'bond' : 'stock') + '"></span>' +
                '<div class="rb5-hist-main">' +
                    '<b>−' + t.sellQty + ' ' + esc(t.sellName) + '<span class="rb5-hist-arr">→</span>+' + t.buyQty + ' ' + esc(t.buyName) + '</b>' +
                    '<span>' + when + ' · продажа ≈ ' + fmtRub(t.proceeds) +
                        (t.rest > 0.005 ? ' · остаток ' + fmtPrice(t.rest) : '') +
                        (t.fee > 0 ? ' · комиссия ' + feeLbl(t.fee) : '') + '</span>' +
                '</div>' +
                (eff ? '<span class="rb5-hist-eff">' + eff + '</span>' : '') +
                undoBtn +
                '<button class="rb5-hist-x" onclick="pfRbDelTrade(\'' + p.id + '\',\'' + t.id + '\')" aria-label="Удалить запись" title="Удалить запись из истории (портфель не меняется)">' + XMARK_SVG + '</button>' +
            '</div>';
        }).join('') : '<div class="rb5-hist-empty">Пока пусто — применённые обмены будут записываться сюда, чтобы каждый шаг можно было отследить и проверить.</div>';
        return '<div class="rb5-hist"><div class="rb5-hist-h"><b>История сделок</b>' +
            (ts.length ? '<span class="rb5-ccount">' + ts.length + '</span>' : '') + '</div>' + rows + '</div>';
    }
    // animate=true — только первое открытие (см. pfExpand); ре-рендеры без анимации,
    // иначе пересоздание карточки на каждый клик заставляет её мигать целиком
    function overlayHtml(p, animate) {
        var c = calcPf(p);
        var bs = c.hs.filter(function (x) { return x.h.type === 'bond'; });
        var ss = c.hs.filter(function (x) { return x.h.type !== 'bond'; });
        // портфель только из акций → колонку облигаций (и «машину денег» с НДФЛ в шапке)
        // не показываем вовсе; только из облигаций → прячем колонку акций. Пустой портфель —
        // обе заглушки, как раньше.
        var hasB = bs.length > 0, hasS = ss.length > 0;
        var one = (hasB && !hasS) || (hasS && !hasB);
        var cols = (!hasB && !hasS) ? rb5BondCol(bs, c) + rb5StockCol(ss, c)
            : (hasB ? rb5BondCol(bs, c) : '') + (hasS ? rb5StockCol(ss, c) : '');
        return '<div class="pfo-card rb5-card' + (one ? ' rb5-card--one' : '') + (animate ? ' pfo-anim-in' : '') + '">' +
            rb5Head(p, c, hasB ? bondsTotal(bs) : null, ss) +
            '<div class="rb5-body">' + rb5StepsBar() + rb5HistoryHtml(p) + rb5FormulasHtml() +
            '<div class="rb5-cols' + (one ? ' rb5-cols--one' : '') + '">' + cols + '</div></div>' +
        '</div>';
    }

    // ---------- события ----------
    window.pfSetRebalTax = function (rate) { rebalTax = rate; saveRebalParams(); rebalRepaint(); };
    window.pfSetRebalFee = function (rate) { rebalFee = rate; saveRebalParams(); rebalRepaint(); };
    // своя комиссия из попапа параметров: вводится в процентах (0,08 → 0.0008)
    window.pfSetRebalFeeCustom = function (v) {
        var n = toNum(v);
        if (!isFinite(n) || n < 0) { rebalRepaint(); return; }
        rebalFee = clamp(n, 0, 5) / 100; saveRebalParams(); rebalRepaint();
    };
    window.pfRbFormulas = function () { rebalFormulas = !rebalFormulas; rebalRepaint(); };
    window.pfRbParams = function () { rebalParams = !rebalParams; rebalRepaint(); };
    window.pfRbHistory = function () { rebalHistory = !rebalHistory; rebalRepaint(); };
    // «Подобрать за меня»: перебирает пары «моя бумага → кандидат с рынка» и подставляет
    // самую выгодную (облигации — максимальный рост прибыли в день, акции — рост потенциала).
    // Уже выбранная пользователем сторона уважается — подбирается только недостающая половина.
    window.pfRbAuto = function (kind) {
        var ov = dq('pfOverlay'); if (!ov) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var c = calcPf(p), best = null;
        if (kind === 'bond') {
            var bs = c.hs.filter(function (x) { return x.h.type === 'bond'; });
            if (bondsTotal(bs).pending) { toast('Ещё уточняем купоны на Мосбирже — попробуйте через пару секунд'); return; }
            var fixS = rebalPick.bond.sell, fixB = rebalPick.bond.buy, f = rebalFee || 0;
            var cands = ofzMarket().map(ofzCand);
            bs.forEach(function (x) {
                if (fixS && x.h.id !== fixS) return;
                var r = bondHeld(x.h);
                if (!(r.qty > 0) || !r.econ || !(r.unitNow > 0)) return;
                cands.forEach(function (cd) {
                    if (fixB && cd.t !== fixB) return;
                    if (isinKey(cd.t) === isinKey(x.h.ticker)) return;
                    if (!cd.econ || !(cd.unit > 0)) return;
                    var partial = bondQtyFor1More(r.unitNow, cd.unit, r.qty);
                    var qty = partial || r.qty;
                    var buyQty = Math.floor(qty * r.unitNow * (1 - f) / (cd.unit * (1 + f)));
                    if (!(buyQty > 0)) return;
                    // портфель под ежемесячные выплаты: пару, применимую лишь продажей ЦЕЛИКОМ
                    // (нет частичного варианта) и оголяющую месяц, apply всё равно отклонит —
                    // не подсовываем такой «тупик» автоподбором
                    if (p.src === 'monthly' && !partial) {
                        var lost = pfLostMonths(bs, x.h, cd.t);
                        if (lost && lost.length) return;
                    }
                    var delta = buyQty * cd.econ.perDay - qty * r.econ.perDay;   // прибыль/день ПОСЛЕ − ДО
                    if (delta > 0 && (!best || delta > best.delta)) best = { sell: x.h.id, buy: cd.t, delta: delta };
                });
            });
            if (!best) { toast(fixS || fixB ? 'Для выбранной бумаги выгодной пары сейчас нет — попробуйте другую' : 'Выгодного обмена сейчас не видно — облигации портфеля и так работают хорошо'); return; }
            rebalPick.bond = { sell: best.sell, buy: best.buy, qty: null };
        } else {
            var ss = c.hs.filter(function (x) { return x.h.type !== 'bond'; });
            var fixS2 = rebalPick.stock.sell, fixB2 = rebalPick.stock.buy;
            ss.forEach(function (x) {
                if (fixS2 && x.h.id !== fixS2) return;
                var pot = livePotential(x.h);
                if (pot == null || !(x.c.qty > 0) || !(x.c.cur > 0)) return;
                var ech = echelonOf(x.h.ticker);
                var cnds = stockCands(ech >= 1 ? ech : 0);
                if (ech >= 1 && !cnds.length) cnds = stockCands(0);
                cnds.forEach(function (cn) {
                    if (fixB2 && cn.ticker !== fixB2) return;
                    if (cn.ticker === x.h.ticker || cn.pot == null) return;
                    var delta = cn.pot - pot;
                    if (!(delta > 0)) return;
                    var d = stockDeal({ qty: x.c.qty, nowPrice: x.c.cur, pot: pot }, cn);
                    if (!d || !(d.buyQty > 0)) return;
                    if (!best || delta > best.delta) best = { sell: x.h.id, buy: cn.ticker, delta: delta };
                });
            });
            if (!best) { toast(fixS2 || fixB2 ? 'Для выбранной акции выгодной пары сейчас нет — попробуйте другую' : 'Выгодного обмена сейчас не видно — потенциал ваших акций и так на уровне'); return; }
            rebalPick.stock = { sell: best.sell, buy: best.buy, qty: null };
        }
        rebalRepaint();
        rb5ScrollToSel(kind);
    };
    // После автоподбора докручиваем оба списка колонки к выбранным карточкам — иначе выбор
    // в глубине длинного списка остаётся за кадром. Вызывать ПОСЛЕ rebalRepaint: он
    // восстанавливает старые scrollTop списков, и ручной скролл должен лечь поверх.
    function rb5ScrollToSel(kind) {
        var ov = dq('pfOverlay'); if (!ov) return;
        var col = ov.querySelector(kind === 'bond' ? '.rb5-col--bond' : '.rb5-col--stock'); if (!col) return;
        [].forEach.call(col.querySelectorAll('.rb5-list-scroll'), function (sc) {
            var row = sc.querySelector('.rb5-row.sel'); if (!row) return;
            var top = sc.scrollTop + row.getBoundingClientRect().top - sc.getBoundingClientRect().top
                - (sc.clientHeight - row.offsetHeight) / 2;   // выбранная карточка — по центру видимой части
            if (sc.scrollTo) sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            else sc.scrollTop = Math.max(0, top);
        });
    }
    // клик по пилюле «Прибыль» в шапке листает период: день → неделя → месяц → день
    window.pfCycleRebalPeriod = function () {
        var order = ['day', 'week', 'month'];
        rebalPeriod = order[(order.indexOf(rebalPeriod) + 1) % order.length];
        saveRebalParams(); rebalRepaint();
    };
    // выбор бумаги: клик по своей (side='sell') / рыночной (side='buy'); повторный клик —
    // снять выбор; количество к продаже сбрасывается на предложенное
    window.pfPickBond = function (side, id) { var pk = rebalPick.bond;
        pk[side] = (pk[side] === id) ? null : id; pk.qty = null; rebalRepaint(); };
    window.pfPickStock = function (side, id) { var pk = rebalPick.stock;
        pk[side] = (pk[side] === id) ? null : id; pk.qty = null; rebalRepaint(); };
    // иконка ⓘ в строке: раскрыть/свернуть детали бумаги (не выбирая её — клик не всплывает)
    window.pfRbInfo = function (key, ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        rebalInfo[key] = !rebalInfo[key];
        rebalInfoAnim = rebalInfo[key] ? key : null;   // анимация раскрытия — только этой панели
        rebalRepaint();
        rebalInfoAnim = null;
    };
    window.pfRbQty = function (kind, val, max) {
        var n = Math.round(toNum(val)); if (!isFinite(n)) n = 1;
        rebalPick[kind].qty = clamp(n, 1, max || 1); rebalRepaint();
    };

    // ---------- применение обмена в портфель ----------
    // Списание qty у актива: FIFO по дате покупки (старые лоты первыми); лоты, ушедшие
    // в ноль, удаляются; продано всё — удаляется и сам актив.
    function pfReduceHolding(p, h, qty) {
        var ordered = ensureLots(h).slice().sort(function (a, b) { return String(a.buyDate || '').localeCompare(String(b.buyDate || '')); });
        var left = qty;
        ordered.forEach(function (l) {
            if (left <= 0) return;
            var q = +l.qty || 0, take = Math.min(q, left);
            l.qty = q - take; left -= take;
        });
        h.lots = ensureLots(h).filter(function (l) { return (+l.qty || 0) > 0; });
        if (!h.lots.length) p.holdings = (p.holdings || []).filter(function (x) { return x.id !== h.id; });
    }
    // Покупка: такой тикер уже есть (облигации сверяем по короткому ISIN) → докупка лотом,
    // иначе новый актив. Цена/НКД — текущие рыночные: ровно те, по которым считался обмен.
    // Возвращает { hid, lotId } — по ним отмена сделки убирает именно этот лот.
    function pfAddBought(p, o) {
        var lot = { id: genId('l'), buyDate: todayStr(), buyPrice: Math.round((o.price || 0) * 100) / 100, qty: o.qty,
            nkd: Math.round((o.nkd || 0) * 100) / 100, priceFromApi: true, nkdFromApi: o.type === 'bond' };
        var exist = null;
        (p.holdings || []).forEach(function (h) {
            if (exist || h.type !== o.type) return;
            if (o.type === 'bond' ? isinKey(h.ticker) === isinKey(o.ticker) : h.ticker === o.ticker) exist = h;
        });
        if (exist) { ensureLots(exist).push(lot); return { hid: exist.id, lotId: lot.id }; }
        var nh = { id: genId('h'), ticker: o.ticker, name: o.name || o.ticker, type: o.type, lots: [lot],
            potAtBuy: o.type === 'stock' ? (o.pot != null ? o.pot : potentialOf(o.ticker)) : null };
        p.holdings.push(nh);
        return { hid: nh.id, lotId: lot.id };
    }
    function pfLogTrade(p, t) {
        t.id = genId('t'); t.ts = Date.now(); t.fee = rebalFee || 0;
        p.trades = p.trades || [];
        p.trades.unshift(t);
        if (p.trades.length > 120) p.trades.length = 120;   // страховка от разбухания localStorage
    }
    // состав изменился → серии графиков доходности пересобрать заново
    function pfInvalidateCharts(pid) { delete PF.chartRaw[pid]; delete PF.chartCache[pid]; }
    // Кнопка «Применить обмен» (облигации): списывает проданные, добавляет купленные,
    // пишет запись в историю и подсвечивает сдвиг «машины денег» в шапке.
    window.pfRbApplyBond = function () {
        var ov = dq('pfOverlay'); if (!ov) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var bs = calcPf(p).hs.filter(function (x) { return x.h.type === 'bond'; });
        var sellX = null; bs.forEach(function (x) { if (x.h.id === rebalPick.bond.sell) sellX = x; });
        var cand = null; ofzMarket().map(ofzCand).forEach(function (cd) { if (cd.t === rebalPick.bond.buy) cand = cd; });
        if (!sellX || !cand) return;
        var d = bondDeal(bondHeld(sellX.h), cand, bs);
        if (!d) { toast('Недостаточно данных для обмена', true); return; }
        if (!(d.buyQty > 0)) { toast('Выручки не хватает даже на одну новую бумагу', true); return; }
        // портфель под ежемесячные выплаты: не даём обмену оставить месяц без купона
        if (p.src === 'monthly' && d.qty >= d.maxQty) {
            var lostM = pfLostMonths(bs, sellX.h, cand.t);
            if (lostM && lostM.length) {
                toast('Обмен сломает график ежемесячных выплат: без купона — ' + lostM.map(function (m) { return RB_MON[m]; }).join(', '), true);
                return;
            }
        }
        var before = bondsTotal(bs);
        var sellName = sellX.h.name || sellX.h.ticker;
        var sellSnap = JSON.parse(JSON.stringify(sellX.h));   // для отмены сделки из истории
        var sellIdx = (p.holdings || []).indexOf(sellX.h);
        pfReduceHolding(p, sellX.h, d.qty);
        // тикер купленной — КОРОТКИЙ ISIN (как у добавленных вручную): полный SECID из
        // таблицы ОФЗ давал в составе «SU26233RMFS5» рядом с «SU26230» — разнобой
        var bought = pfAddBought(p, { type: 'bond', ticker: isinKey(cand.t), name: cand.n, price: cand.price, nkd: cand.nkd, qty: d.buyQty });
        pfLogTrade(p, { kind: 'bond', sellTicker: sellX.h.ticker, sellName: sellName, sellQty: d.qty,
            buyTicker: isinKey(cand.t), buyName: cand.n, buyQty: d.buyQty, proceeds: d.proceeds, rest: d.rest,
            dayBefore: d.dayBefore, dayAfter: d.dayAfter,
            undo: { sold: sellSnap, soldIdx: sellIdx, buyHid: bought.hid, buyLotId: bought.lotId } });
        // не потраченный при покупке остаток выручки — в свободные деньги портфеля
        if (d.rest > 0.005) p.cash = Math.round(((+p.cash || 0) + d.rest) * 100) / 100;
        // дельта «машины денег»: пересчёт по фактически обновлённому портфелю; если купоны
        // ещё грузятся — берём расчётную дельту из самой сделки
        var after = bondsTotal(calcPf(p).hs.filter(function (x) { return x.h.type === 'bond'; }));
        rebalFlash = (!before.pending && !after.pending) ? { delta: after.total - before.total }
            : (d.dayBefore != null && d.dayAfter != null ? { delta: d.dayAfter - d.dayBefore } : null);
        rebalPick.bond = { sell: null, buy: null, qty: null };
        saveStore(); pfInvalidateCharts(p.id); ensureQuotes(true);
        ensureBondDetails(p, function () { rebalRepaint(); });
        rebalRepaint();
        if (currentTab === 'portfolios' && dq('pfWrap')) renderPortfolios();
        toast('Обмен применён: −' + d.qty + ' ' + sellName + ' → +' + d.buyQty + ' ' + cand.n);
    };
    // Кнопка «Применить обмен» (акции): та же механика, эффект — смена потенциала.
    window.pfRbApplyStock = function () {
        var ov = dq('pfOverlay'); if (!ov) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var ss = calcPf(p).hs.filter(function (x) { return x.h.type !== 'bond'; });
        var sellX = null; ss.forEach(function (x) { if (x.h.id === rebalPick.stock.sell) sellX = x; });
        if (!sellX) return;
        var ech = echelonOf(sellX.h.ticker);
        var cands = stockCands(ech >= 1 ? ech : 0);
        if (ech >= 1 && !cands.length) cands = stockCands(0);
        var cand = null; cands.forEach(function (cn) { if (cn.ticker === rebalPick.stock.buy) cand = cn; });
        if (!cand) return;
        var d = stockDeal({ qty: sellX.c.qty, nowPrice: sellX.c.cur || 0, pot: livePotential(sellX.h) }, cand);
        if (!d) { toast('Недостаточно данных для обмена', true); return; }
        if (!(d.buyQty > 0)) { toast('Выручки не хватает даже на одну акцию ' + cand.ticker, true); return; }
        var sellName = sellX.h.ticker;
        var sellSnap = JSON.parse(JSON.stringify(sellX.h));   // для отмены сделки из истории
        var sellIdx = (p.holdings || []).indexOf(sellX.h);
        pfReduceHolding(p, sellX.h, d.qty);
        var bought = pfAddBought(p, { type: 'stock', ticker: cand.ticker, name: cand.name, price: d.priceN, qty: d.buyQty, pot: cand.pot });
        var stRest = d.priceN > 0 ? d.proceeds - d.buyQty * d.priceN * (1 + (rebalFee || 0)) : 0;
        pfLogTrade(p, { kind: 'stock', sellTicker: sellName, sellName: sellName, sellQty: d.qty,
            buyTicker: cand.ticker, buyName: cand.ticker, buyQty: d.buyQty, proceeds: d.proceeds,
            rest: stRest,
            potFrom: d.potFrom, potTo: d.potTo,
            undo: { sold: sellSnap, soldIdx: sellIdx, buyHid: bought.hid, buyLotId: bought.lotId } });
        // не потраченный при покупке остаток выручки — в свободные деньги портфеля
        if (stRest > 0.005) p.cash = Math.round(((+p.cash || 0) + stRest) * 100) / 100;
        rebalPick.stock = { sell: null, buy: null, qty: null };
        saveStore(); pfInvalidateCharts(p.id); ensureQuotes(true); rebalRepaint();
        if (currentTab === 'portfolios' && dq('pfWrap')) renderPortfolios();
        toast('Обмен применён: −' + d.qty + ' ' + sellName + ' → +' + d.buyQty + ' ' + cand.ticker);
    };
    window.pfRbDelTrade = function (pid, tid) {
        var p = findPf(pid); if (!p) return;
        p.trades = (p.trades || []).filter(function (t) { return t.id !== tid; });
        saveStore(); rebalRepaint();
    };
    // Отмена последней сделки: убираем купленный лот, возвращаем проданное как было.
    // Разрешена только для верхней записи истории — отмены идут строго стеком,
    // иначе более поздние сделки могли уже перераспределить те же бумаги.
    window.pfRbUndoTrade = function (pid, tid) {
        var p = findPf(pid); if (!p) return;
        var ts = p.trades || [];
        if (!ts.length || ts[0].id !== tid) { toast('Отменять сделки можно только по порядку — начиная с последней', true); return; }
        var t = ts[0];
        if (!t.undo || !t.undo.sold) { toast('У этой записи нет сохранённого состояния для отмены', true); return; }
        // окно предупреждения: отмена стирает ОБЕ записи обмена (продажу и покупку) —
        // без явного подтверждения так легко потерять сделку случайным кликом
        var UNDO_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
        pfConfirm({
            danger: true, ok: 'Да, отменить', icon: UNDO_ICO,
            title: 'Отменить ребалансировку?',
            text: 'Из истории исчезнут обе записи обмена — продажа ' + esc(t.sellName || t.sellTicker || '') + ' и покупка ' + esc(t.buyName || t.buyTicker || '') + '. Портфель вернётся к состоянию до сделки.'
        }, function () {
            // 1) убрать купленный лот (если холдинг опустел — убрать и его)
            var bh = null;
            (p.holdings || []).forEach(function (h) { if (h.id === t.undo.buyHid) bh = h; });
            if (bh) {
                bh.lots = ensureLots(bh).filter(function (l) { return l.id !== t.undo.buyLotId; });
                if (!bh.lots.length) p.holdings = p.holdings.filter(function (x) { return x.id !== bh.id; });
            }
            // 2) вернуть проданное: актив ещё есть (продали часть) → восстановить его лоты,
            //    актив был продан целиком → вернуть его в состав на прежнее место
            var sold = t.undo.sold, sh = null;
            (p.holdings || []).forEach(function (h) { if (h.id === sold.id) sh = h; });
            if (sh) sh.lots = sold.lots;
            else {
                var at = (t.undo.soldIdx != null) ? Math.min(t.undo.soldIdx, p.holdings.length) : p.holdings.length;
                p.holdings.splice(at, 0, sold);
            }
            // 3) забрать обратно остаток выручки, упавший в кэш при применении обмена
            if (t.rest > 0.005) p.cash = Math.max(0, Math.round(((+p.cash || 0) - t.rest) * 100) / 100);
            ts.shift();
            rebalPick.bond = { sell: null, buy: null, qty: null };
            rebalPick.stock = { sell: null, buy: null, qty: null };
            saveStore(); pfInvalidateCharts(p.id); ensureQuotes(true);
            rebalRepaint();
            if (currentTab === 'portfolios' && dq('pfWrap')) renderPortfolios();
            toast('Сделка отменена — портфель возвращён к состоянию до обмена');
        });
    };

    // --- экспорт для конструктора (portfolios-dash.js зовёт через PF.*) ---
    PF.CHECK_SVG = CHECK_SVG; PF.CHEV_SVG = CHEV_SVG; PF.EYEOFF_SVG = EYEOFF_SVG; PF.EYE_SVG = EYE_SVG;
        PF.PFDGRID_SVG = PFDGRID_SVG;     PF.UNDO_SVG = UNDO_SVG;                                             PF.plural = plural;     PF.renderSmooth = renderSmooth; PF.summaryCardHtml = summaryCardHtml;
    PF.tradesHtml = tradesHtml;

    // --- экспорт для виджетов (portfolios-widgets.js зовёт через PF.*) ---
    PF.DL_SVG = DL_SVG; PF.IMPCSV_SVG = IMPCSV_SVG; PF.INFO_SVG = INFO_SVG; PF.PLUS_SVG = PLUS_SVG;
    PF.UPLOAD_SVG = UPLOAD_SVG; PF.XLSTBL_SVG = XLSTBL_SVG; PF.backupWrapHtml = backupWrapHtml;
    PF.collectTrades = collectTrades; PF.eyeWrapHtml = eyeWrapHtml; PF.renderNoAnim = renderNoAnim;

    // --- экспорт для «Выплат» (portfolios-payouts.js зовёт через PF.*) ---
    PF.renderPortfolios = renderPortfolios;

    // --- экспорт для подвкладок (portfolios-tabs.js зовёт через PF.*) ---
    PF.REBAL_SVG = REBAL_SVG; PF.allHiddenHtml = allHiddenHtml; PF.emptyHtml = emptyHtml; 
    // --- экспорт для карточек (portfolios-cards.js зовёт через PF.*) ---
    PF.COPY_SVG = COPY_SVG; PF.FETCH_SVG = FETCH_SVG; PF.GEAR_SVG = GEAR_SVG; PF.HOLDS_SVG = HOLDS_SVG;
    PF.SHIELD_SVG = SHIELD_SVG; PF.impWrapHtml = impWrapHtml; PF.loadStatus = loadStatus; PF.openRows = openRows;
    PF.pfInvalidateCharts = pfInvalidateCharts;

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
                // держал открытой при возврате), панель действий и рыночную ленту прячем
                PF.dashEdit = false;
                var tbHost = document.getElementById('topBarPfActions');
                if (tbHost) { tbHost.style.display = 'none'; tbHost.innerHTML = ''; }
                var tbMkt = document.getElementById('topBarPfMarket');
                if (tbMkt) { tbMkt.style.display = 'none'; tbMkt.innerHTML = ''; }
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
