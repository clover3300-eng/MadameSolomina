// ===== «ПОРТФЕЛИ» · КАРТОЧКИ И ДЕЙСТВИЯ (модуль цепочки #pfLazySrc) =====
// Карточка портфеля (cardHtml с мини-графиком, разворотами состава и
// графика), шторка настроек ⚙ (menuHtml: правка состава, палитра,
// данжер-зона, импорт из расчёта/избранного/CSV), календарь дат .btcal,
// pfCardHead (общая шапка карточек-виджетов) и ДЕЙСТВИЯ inline-onclick:
// CRUD портфелей и активов, «цена по API», Excel-отчёты, бэкап,
// модалка подтверждения pfConfirm. Имена остатка цепочки (renderPortfolios,
// plural, иконки…) — через PF.*: остаток грузится ПОСЛЕ нас.
(function () {
    'use strict';
    var PF = window.PF;
    // импорт ядра (уже загружено):
    var BOND_PRICE_TIP = PF.BOND_PRICE_TIP, COLORS = PF.COLORS, MAX_CARDS = PF.MAX_CARDS, aggHolding = PF.aggHolding, attr = PF.attr, calcHold = PF.calcHold;
    var calcPf = PF.calcPf, chartImoex = PF.chartImoex, clamp = PF.clamp, colorVal = PF.colorVal, compositionFrom = PF.compositionFrom, dq = PF.dq;
    var drawPfChart = PF.drawPfChart, ensureLots = PF.ensureLots, ensureQuotes = PF.ensureQuotes, esc = PF.esc, findHold = PF.findHold, findPf = PF.findPf;
    var fmtPct = PF.fmtPct, fmtPrice = PF.fmtPrice, fmtQty = PF.fmtQty, fmtRub = PF.fmtRub, genId = PF.genId, importName = PF.importName;
    var loadPfChart = PF.loadPfChart, lookupHistNkd = PF.lookupHistNkd, lookupHistPrice = PF.lookupHistPrice, makePortfolio = PF.makePortfolio, noQuoteCell = PF.noQuoteCell, pad2 = PF.pad2;
    var pfBench = PF.pfBench, pfCardWarming = PF.pfCardWarming, pfChartAssetsHtml = PF.pfChartAssetsHtml, pfChartViewHtml = PF.pfChartViewHtml, pfParseAnyDate = PF.pfParseAnyDate, quotes = PF.quotes;
    var ruDate = PF.ruDate, saveStore = PF.saveStore, skelHtml = PF.skelHtml, toNum = PF.toNum, toast = PF.toast, todayStr = PF.todayStr;
    var visibleItems = PF.visibleItems;
    // импорт конструктора (portfolios-dash.js, уже загружен):
    var DASH_KEY = PF.DASH_KEY, dashCfgFor = PF.dashCfgFor, saveDashCfg = PF.saveDashCfg;
    // импорт виджетов и подвкладок (уже загружены):
    var potentialOf = PF.potentialOf, pfxActivateTab = PF.pfxActivateTab, pfxDropPfTab = PF.pfxDropPfTab, pfxFlashBlock = PF.pfxFlashBlock, pfxGoOverviewFor = PF.pfxGoOverviewFor, pfxOpenPfTabs = PF.pfxOpenPfTabs;
    var pfxSaveOpenTabs = PF.pfxSaveOpenTabs, pfxWide = PF.pfxWide;
    // ---- мини-график доходности прямо в карточке (всегда виден, портфель vs IMOEX) ----
    // Переиспользует drawPfChart (тот же компонент, что и большой график/разворот): шкала
    // процентов слева + наводимые точки с тултипом (дата + значение) — просто в компактном
    // размере (meньше точек, сжатые отступы через .pfc-mchart-plot в CSS).
    function paintPfChartMini(pid) { drawPfChart(pid, dq('pfmChart-' + pid), null, dq('pfmLeg-' + pid), pid + 'm', 16); }
    // мини-график в карточке по умолчанию БЕЗ сравнения с индексом (IMOEX/RGBI) — пользователь
    // включает его сам кнопкой-тумблером. ВАЖНО: выставляем флаг ДО первого loadPfChart() любого
    // пейна (см. PF.renderPortfolios), чтобы серия сразу запрашивалась в согласованном режиме.
    function ensureDefaultImoexFlags() {
        visibleItems().forEach(function (p) { if (!(p.id in chartImoex)) chartImoex[p.id] = false; });
    }
    // на каждый видимый портфель — своя загрузка/перерисовка мини-графика (переиспользует loadPfChart)
    function repaintMiniCharts() {
        visibleItems().forEach(function (p) {
            if (dq('pfmChart-' + p.id)) loadPfChart(p.id);
        });
    }

    // подсказка стата «Доходность»: одна строка на разметку И точечный патчер
    // (livePatchers.cards) — чтобы текст не разъезжался между ними
    var YIELD_TIP = 'Доходность в пересчёте на год (может отличаться от «Дохода» и графика — те показывают фактическое изменение за весь срок, а не годовые)';
    function cardHtml(p, idx, colRight, narrow, colMid) {
        var c = calcPf(p), ac = colorVal(p.color);
        var warm = pfCardWarming(p);   // котировки ещё греются → суммы скелетонами
        var pnlCls = c.pnl >= 0 ? 'pos' : 'neg';
        var bench = pfBench(p);
        var chartOn = !!PF.chartOpen[p.id], holdsOn = !!PF.holdsExpand[p.id];
        // R9.1: когда настройки открыты ШТОРКОЙ (PF.pfSetDrawerOn), карточное меню не
        // рендерим — иначе на странице два .pfc-menu с ОДИНАКОВЫМИ id полей формы
        var menuOn = PF.openMenu === p.id && !PF.pfSetDrawerOn;
        var menu = menuOn ? menuHtml(p) : '';
        // настройки всегда раскрыты «во всю высоту» — полный список без внутреннего скролла
        var tall = menuOn ? ' pf-card--tall' : '';
        var MANY = 4;
        // мини-версия показывает ВЕСЬ состав по порядку (от лучших к худшим — c.hs уже
        // отсортирован); список не режется — карточка скроллится внутри (.pfc-massets).
        var assetsBody = c.hs.length ? pfMiniTableHtml(c.hs, p.id)
            : '<div class="pfc-empty">Состав пуст — добавьте активы в настройках ⚙</div>';
        // «раскрытие» вверху карточки (иконка со стрелками) ведёт в ту же панель, что и график,
        // но сразу с открытыми активами — отдельный оверлей «весь состав» больше не дублируется тут
        var assetsChartOn = chartOn && !!PF.chartAssets[p.id];

        // чип «за сегодня» под названием убран (просьба 2026-07-14): дневное изменение
        // живёт в герое «Панель управления» и KPI-виджете, в карточке он дублировался
        return '<div class="dash2-card pf-card' + (menuOn ? ' menu-open' : '') + tall + (chartOn ? ' chart-open' : '') + (chartOn && PF.chartAssets[p.id] ? ' assets-open' : '') + (holdsOn ? ' holds-open' : '') + (colRight ? ' col-right' : '') + (narrow ? ' pf-card--narrow' : '') + (colMid ? ' col-mid' : '') + '" style="--pf-accent:' + ac + '">' +
            '<div class="pfc-top">' +
                '<div class="pfc-titles">' +
                    '<span class="pfc-name" onclick="pfNameEdit(\'' + p.id + '\',event)" title="Нажмите, чтобы переименовать"><span class="pfc-name-ink">' + esc(p.name) + '</span></span>' +
                '</div>' +
                '<div class="pfc-ctrls">' +
                    '<div class="pfc-acts">' +
                        '<button class="pfc-act" onclick="pfCopyComposition(\'' + p.id + '\',event)" aria-label="Скопировать состав" title="Скопировать состав портфеля">' + PF.COPY_SVG + '</button>' +
                        '<button class="pfc-act' + (assetsChartOn ? ' on' : '') + '" onclick="pfOpenChartAssets(\'' + p.id + '\')" aria-label="Полный состав" title="' + (assetsChartOn ? 'Свернуть' : 'Полный состав') + '">' + PF.HOLDS_SVG + '</button>' +
                        '<button class="pfc-act" onclick="pfToggleHidden(\'' + p.id + '\',event)" aria-label="Убрать карточку с «Обзора»" title="Убрать карточку с «Обзора» — портфель останется в сводках, его вкладка не закроется">' + PF.EYEOFF_SVG + '</button>' +
                        '<button class="pfc-act' + (menuOn ? ' on' : '') + '" onclick="pfToggleMenu(\'' + p.id + '\')" aria-label="Настройки" title="Настройки">' + PF.GEAR_SVG + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            menu +
            (chartOn ? '<div class="pfc-chartwrap">' + pfChartViewHtml(p, c, idx) + pfChartAssetsHtml(p, c) + '</div>' : '') +
            (holdsOn ? holdsOverlayHtml(p, c) : '') +
            '<div class="pfc-normal">' +
            '<div class="pfc-hero">' +
                '<div class="pfc-hero-top">' +
                    // data-live: фоновый тик котировок переписывает эти узлы точечно
                    // (livePatchers.cards ниже) — включая замену скелетонов прогрева числами
                    (warm ? '<span class="pfc-hero-val" data-live="pfc:' + p.id + ':val">' + skelHtml(118, 21) + '</span>' +
                            '<span class="pfc-hero-inc" data-live="pfc:' + p.id + ':inc">' + skelHtml(96, 13) + '</span>'
                          : '<span class="pfc-hero-val" data-live="pfc:' + p.id + ':val">' + fmtRub(c.value) + '</span>' +
                            '<span class="pfc-hero-inc ' + pnlCls + '" data-live="pfc:' + p.id + ':inc">' + (c.pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(c.pnl)) + ' · ' + fmtPct(c.pnlPct) + '</span>') +
                '</div>' +
                (function () {
                    var imOn = !!chartImoex[p.id];
                    return '<div class="pfc-mini-chart">' +
                        '<div class="pfc-mchart-top">' +
                            '<div class="pfc-mchart-leg" id="pfmLeg-' + p.id + '"></div>' +
                            '<button class="pfc-imtgl' + (imOn ? ' on' : '') + '" data-pid="' + p.id + '" onclick="pfToggleMiniImoex(\'' + p.id + '\')" ' +
                                'title="' + (imOn ? 'Скрыть — ' : 'Сравнить — ') + bench.full + '"><span class="pfc-imtgl-dot"></span>' + bench.label + '</button>' +
                        '</div>' +
                        '<div class="pfc-mchart-plot" id="pfmChart-' + p.id + '"></div>' +
                    '</div>';
                })() +
            '</div>' +
            cardRingHtml(c, idx, p) +
            (function () {
                // «Выплаты» — полученные купоны/дивиденды за время владения (в «Доход» не входят);
                // «Кэш» — свободные деньги (правится в ⚙, пополняется остатком ребалансировок).
                // Оба блока опциональны — сетка статов резиновая (flex), влезает любое число.
                // R7: в карточке ТОЛЬКО «Доход» и «Доходность» (референс) — кэш и выплаты
                // не показываем (они остаются в развороте/настройках и общей сводке)
                // data-live: значения «Доход»/«Доходность» (и класс/подсказка контейнера
                // доходности) обновляются точечно фоновым тиком — см. livePatchers.cards
                if (warm) return '<div class="pfc-stats2">' +
                    (narrow ? '' : '<div class="pfc-stat2"><span class="pfc-stat2-l">Вложено</span><span class="pfc-stat2-v">' + fmtRub(c.invested) + '</span></div>') +
                    '<div class="pfc-stat2 pfc-stat2--inc"><span class="pfc-stat2-l">Доход</span><span class="pfc-stat2-v" data-live="pfc:' + p.id + ':pnl">' + skelHtml(66, 13) + '</span></div>' +
                    '<div class="pfc-stat2 pfc-stat2--yield" data-live="pfc:' + p.id + ':ybox"><span class="pfc-stat2-l">Доходность</span><span class="pfc-stat2-v" data-live="pfc:' + p.id + ':yield">' + skelHtml(48, 13) + '</span></div>' +
                '</div>';
                return '<div class="pfc-stats2">' +
                    (narrow ? '' : '<div class="pfc-stat2"><span class="pfc-stat2-l">Вложено</span><span class="pfc-stat2-v">' + fmtRub(c.invested) + '</span></div>') +
                    '<div class="pfc-stat2 pfc-stat2--inc"><span class="pfc-stat2-l">Доход</span><span class="pfc-stat2-v ' + pnlCls + '" data-live="pfc:' + p.id + ':pnl">' + fmtRub(c.pnl) + '</span></div>' +
                    '<div class="pfc-stat2 pfc-stat2--yield is-' + (c.annual >= 0 ? 'gn' : 'rd') + '" data-live="pfc:' + p.id + ':ybox" title="' + YIELD_TIP + '"><span class="pfc-stat2-l">Доходность</span><span class="pfc-stat2-v ' + (c.annual >= 0 ? 'pos' : 'neg') + '" data-live="pfc:' + p.id + ':yield">' + fmtPct(c.annual) + '</span></div>' +
                '</div>';
            })() +
            '<div class="pfc-sep"></div>' +
            '<div class="pfc-massets" data-skey="ma-' + p.id + '">' + assetsBody + '</div>' +
            '<div class="pfc-foot">' +
                '<button class="pfc-rebal" onclick="pfExpand(\'' + p.id + '\')">' + PF.REBAL_SVG + 'Ребалансировать</button>' +
                (c.hs.length > MANY ? '<button class="pfc-more' + (holdsOn ? ' on' : '') + '" onclick="pfToggleHolds(\'' + p.id + '\')" aria-label="' + (holdsOn ? 'Свернуть состав' : 'Показать весь состав') + '" title="' + (holdsOn ? 'Свернуть' : 'Показать всё · ' + c.hs.length) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' : '') +
            '</div>' +
            '</div>' +
        '</div>';
    }

    // Оверлей «весь состав» — раскрывается ВНИЗ поверх контента (как «Состав портфеля» на
    // Главной): высота карточки не меняется, оверлей продолжает ТУ ЖЕ мини-таблицу (те же
    // строки pfMiniRowHtml), просто без ограничения в 4 штуки — а не отдельную широкую таблицу.
    function holdsOverlayHtml(p, c) {
        var body = c.hs.length ? pfMiniTableGroupedHtml(c.hs, p.id)
            : '<div class="pfc-empty">Состав пуст</div>';
        return '<div class="pfc-holdsover">' +
            '<div class="pfc-holdsover-h">' +
                '<span class="pfc-holdsover-t"><span class="pfc-holdsover-dot"></span>' + esc(p.name) + ' · состав</span>' +
                '<span class="pfc-holdsover-n">' + c.count + ' ' + PF.plural(c.count, 'актив', 'актива', 'активов') + '</span>' +
                '<button class="pfc-holdsover-x" onclick="pfToggleHolds(\'' + p.id + '\')" aria-label="Свернуть" title="Свернуть">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>' +
            '<div class="pfc-holdsover-list" data-skey="ho-' + p.id + '">' + body + '</div>' +
        '</div>';
    }

    // ---- точечный фоновый апдейт карточек (роадмап №6) ----
    // На тик котировок переписывает живые ЧИСЛА карточки по data-live узлам
    // (PF.liveSet, ядро), не пересобирая DOM: герой (капитал / доход·%), статы
    // «Доход»/«Доходность», цена и «Изм.» строк состава — в мини-таблице И в
    // оверлее «весь состав» разом (общие ключи pfh:<hid>). Пока полному рендеру
    // сознательно оставлены: ПОРЯДОК строк состава (c.hs отсортирован по живому
    // pnlPct — пересортировка строк это структурное изменение), кольцо/полоса
    // распределения и подсказка цели (donut + inline-ширины + условная разметка,
    // см. cardRingHtml), мини-график (у него свой repaintMiniCharts). Пока
    // котировки греются (pfCardWarming), патчер карточку не трогает — скелетоны
    // заменит первый тик после прогрева.
    PF.livePatchers.cards = function () {
        visibleItems().forEach(function (p) {
            if (pfCardWarming(p)) return;
            var c = calcPf(p);
            var pnlCls = c.pnl >= 0 ? 'pos' : 'neg';
            PF.liveSet('pfc:' + p.id + ':val', { text: fmtRub(c.value) });
            PF.liveSet('pfc:' + p.id + ':inc', {
                text: (c.pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(c.pnl)) + ' · ' + fmtPct(c.pnlPct),
                cls: 'pfc-hero-inc ' + pnlCls });
            PF.liveSet('pfc:' + p.id + ':pnl', { text: fmtRub(c.pnl), cls: 'pfc-stat2-v ' + pnlCls });
            PF.liveSet('pfc:' + p.id + ':ybox', {
                cls: 'pfc-stat2 pfc-stat2--yield is-' + (c.annual >= 0 ? 'gn' : 'rd'), title: YIELD_TIP });
            PF.liveSet('pfc:' + p.id + ':yield', {
                text: fmtPct(c.annual), cls: 'pfc-stat2-v ' + (c.annual >= 0 ? 'pos' : 'neg') });
            c.hs.forEach(function (x) {
                var h = x.h, hc = x.c, isB = h.type === 'bond';
                // те же выражения, что в pfMiniRowHtml — ячейки после апдейта
                // выглядят ровно как после полного рендера
                var noQ = hc.curSrc === 'buy' ? noQuoteCell(h) : null;
                var dayMark = '';
                if (!isB && quotes[h.ticker] && quotes[h.ticker].chgPct != null && Math.abs(quotes[h.ticker].chgPct) >= 3) {
                    var ch = quotes[h.ticker].chgPct;
                    dayMark = ' <i class="pfc-rowday ' + (ch >= 0 ? 'up' : 'dn') + '" title="За сегодня: ' + fmtPct(ch) + '">' + (ch >= 0 ? '▲' : '▼') + '</i>';
                }
                PF.liveSet('pfh:' + h.id + ':now', {
                    html: noQ ? noQ.txt : fmtPrice(hc.cur) + dayMark,
                    cls: 'pfc-mnow' + (hc.live ? ' live' : ''),
                    title: noQ ? noQ.tip : (isB ? BOND_PRICE_TIP : null) });
                PF.liveSet('pfh:' + h.id + ':chg', {
                    text: (!noQ && hc.invested > 0 ? fmtPct(hc.pnlPct) : '—'),
                    cls: 'pfc-mchg ' + (!noQ && hc.invested > 0 ? (hc.pnlPct >= 0 ? 'pos' : 'neg') : '') });
            });
        });
    };

    // Кольцо распределения карточки: маленький donut + номер портфеля в центре + полоса-легенда.
    // Если в ⚙ задана целевая доля облигаций (p.targetBond) — на полосе метка цели, под
    // легендой строка отклонения с подсказкой «докупите … на ~X ₽» (возврат к цели докупкой
    // недостающего класса, без продаж).
    function cardRingHtml(c, idx, p) {
        var bondP = Math.round(clamp(c.bondPct, 0, 100)), stockP = 100 - bondP;
        var num = '<span class="pfc-ringnum">' + (((idx || 0) + 1)) + '</span>';
        var tgt = (p && p.targetBond != null && isFinite(+p.targetBond)) ? clamp(Math.round(+p.targetBond), 0, 100) : null;
        var marker = '', hint = '';
        if (tgt != null && c.value > 0) {
            // полоса: слева акции (stockP%), справа облигации — граница цели на 100−tgt% слева
            marker = '<i class="pfc-dist-tgt" style="left:' + (100 - tgt) + '%" title="Цель: облигации ' + tgt + '%"></i>';
            var dev = c.bondPct - tgt;
            if (Math.abs(dev) < 3) {
                hint = '<div class="pfc-tgt-hint ok">' + PF.CHECK_SVG + 'В балансе с целью ' + tgt + '% облигаций</div>';
            } else {
                var buyTxt = '';
                if (dev > 0 && tgt > 0) { var needS = c.bondVal * 100 / tgt - c.value; if (needS > 1) buyTxt = ' — докупить акций на ~' + fmtRub(needS); }
                else if (dev < 0 && tgt < 100) { var needB = c.stockVal * 100 / (100 - tgt) - c.value; if (needB > 1) buyTxt = ' — докупить облигаций на ~' + fmtRub(needB); }
                hint = '<div class="pfc-tgt-hint off" title="Отклонение от целевой структуры (цель — ' + tgt + '% облигаций). Сумма — сколько докупить недостающего класса, чтобы вернуться к цели без продаж">' +
                    'Облигаций на ' + Math.abs(dev).toFixed(0) + ' п.п. ' + (dev > 0 ? 'больше' : 'меньше') + ' цели' + buyTxt + '</div>';
            }
        }
        return '<div class="pfc-alloc">' +
            PF.donutHtml(c.bondPct, 40, num) +
            '<div class="pfc-dist">' +
                '<div class="pfc-dist-barwrap"><div class="pfc-dist-bar"><div style="width:' + stockP + '%;background:#D97757"></div><div style="width:' + bondP + '%;background:#7B9BBF"></div></div>' + marker + '</div>' +
                '<div class="pfc-dist-lbl"><span><i style="background:#D97757"></i>Акции ' + stockP + '%</span><span><i style="background:#7B9BBF"></i>Облигации ' + bondP + '%</span></div>' +
            '</div></div>' + hint;
    }

    // мини-таблица состава: НАСТОЯЩАЯ <table> (как pfo-table в ребалансе), а не css-grid из
    // фиксированных px-колонок — так шапка и строки гарантированно совпадают по ширине колонок
    // и числа не «наезжают» друг на друга при длинных ценах. Переиспользуется и в оверлее
    // «весь состав» (тот визуально ПРОДОЛЖАЕТ ту же таблицу, просто без лимита в 4 строки).
    function pfMiniTableHtml(list, pid) {
        var head = '<tr><th class="pfc-mc-as">Актив</th><th>Кол-во</th><th>Сейчас</th><th>Изм.</th></tr>';
        var body = list.map(function (x) { return pfMiniRowHtml(x, pid); }).join('');
        return '<div class="pfc-mtablewrap"><table class="pfc-mtable"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    // та же мини-таблица, но состав разбит на группы «Акции» / «Облигации» (строка-заголовок
    // группы внутри одной <table> — колонки групп остаются выровненными). Используется в
    // оверлее «весь состав» (нижнее раскрытие карточки).
    function pfMiniTableGroupedHtml(list, pid) {
        var stocks = list.filter(function (x) { return x.h.type !== 'bond'; });
        var bonds = list.filter(function (x) { return x.h.type === 'bond'; });
        function grp(kind, label, arr) {
            if (!arr.length) return '';
            return '<tr class="pfc-mgrp"><td colspan="4"><span class="pfc-mgrp-in"><i class="pfc-mgrp-dot ' + kind + '"></i>' + label +
                '<b>' + arr.length + '</b></span></td></tr>' +
                arr.map(function (x) { return pfMiniRowHtml(x, pid); }).join('');
        }
        var head = '<tr><th class="pfc-mc-as">Актив</th><th>Кол-во</th><th>Сейчас</th><th>Изм.</th></tr>';
        var body = grp('stock', 'Акции', stocks) + grp('bond', 'Облигации', bonds);
        return '<div class="pfc-mtablewrap"><table class="pfc-mtable"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    // Строка актива: тикер · тип · кол-во · цена · изменение. По КЛИКУ строка раскрывает
    // субданные (дата покупки, цена/средняя цена, НКД для облигаций) — отдельной строкой под ней.
    function pfMiniRowHtml(x, pid) {
        var h = x.h, c = x.c, isB = h.type === 'bond';
        var multi = c.lotCount > 1, open = !!PF.openRows[h.id];
        var lotChip = multi ? ' <i class="pfc-lotn">×' + c.lotCount + '</i>' : '';
        var ptip = isB ? ' title="' + attr(BOND_PRICE_TIP) + '"' : '';
        // котировки ещё нет (curSrc='buy' — фолбэк на цену покупки): «…» пока грузится,
        // «—» если котировки загружены и бумаги в них нет (опечатка в тикере); цену покупки
        // под видом текущей не показываем, «Изм.» без котировки — прочерк, а не «+0,0%»
        var noQ = c.curSrc === 'buy' ? noQuoteCell(h) : null;
        // дневной маркер: акция сдвинулась за день на ≥3% — стрелка с величиной в подсказке
        var dayMark = '';
        if (!isB && quotes[h.ticker] && quotes[h.ticker].chgPct != null && Math.abs(quotes[h.ticker].chgPct) >= 3) {
            var ch = quotes[h.ticker].chgPct;
            dayMark = ' <i class="pfc-rowday ' + (ch >= 0 ? 'up' : 'dn') + '" title="За сегодня: ' + fmtPct(ch) + '">' + (ch >= 0 ? '▲' : '▼') + '</i>';
        }
        var row = '<tr class="pfc-mtr' + (open ? ' open' : '') + '" data-hid="' + h.id + '" onclick="pfToggleAssetRow(\'' + pid + '\',\'' + h.id + '\')">' +
                '<td class="pfc-mc-as"><span class="pfc-mtk"><svg class="pfc-mch' + (open ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><b>' + esc(h.ticker) + '</b><i class="' + (isB ? 'bond' : 'stock') + '">' + (isB ? 'обл' : 'акц') + '</i>' + lotChip + '</span></td>' +
                '<td class="pfc-mqty">' + (c.qty || 0) + '</td>' +
                // data-live: цена и «Изм.» обновляются точечно фоновым тиком (livePatchers.cards);
                // ключ по hid — те же ячейки в оверлее «весь состав» обновятся заодно
                '<td class="pfc-mnow' + (c.live ? ' live' : '') + '" data-live="pfh:' + h.id + ':now"' + (noQ ? ' title="' + attr(noQ.tip) + '"' : ptip) + '>' + (noQ ? noQ.txt : fmtPrice(c.cur) + dayMark) + '</td>' +
                '<td class="pfc-mchg ' + (!noQ && c.invested > 0 ? (c.pnlPct >= 0 ? 'pos' : 'neg') : '') + '" data-live="pfh:' + h.id + ':chg">' + (!noQ && c.invested > 0 ? fmtPct(c.pnlPct) : '—') + '</td>' +
            '</tr>';
        return open ? row + pfMiniDetailRowHtml(h, c) : row;
    }
    // Полное название актива: своё имя (если отличается от тикера) → таблица акций →
    // гугл-таблица облигаций (bonds из data.js; тикер портфеля может быть коротким ISIN).
    function assetDisplayName(h) {
        if (h.name && h.name !== h.ticker) return h.name;
        if (h.type === 'bond') {
            try {
                if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++) {
                    var t = bonds[i] && bonds[i].t;
                    if (t && (t.indexOf(h.ticker) === 0 || String(h.ticker).indexOf(t) === 0)) return bonds[i].n || h.ticker;
                }
            } catch (e) {}
        } else if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(h.ticker);
            if (co && co.name) return co.name;
        }
        return h.name || h.ticker;
    }
    // строка субданных под активом: название · дата покупки · цена/средняя цена · НКД (для облигаций)
    function pfMiniDetailRowHtml(h, c) {
        var isB = h.type === 'bond', multi = c.lotCount > 1;
        // при нескольких лотах показываем СРЕДНИЕ (взвешенные) дату и цену покупки, при одном — фактические
        var dateLbl = multi ? 'Средняя дата' : 'Куплен';
        var dateVal = multi ? ruDate(c.avgDate) : ruDate(c.firstDate);
        var priceLbl = multi ? 'Средняя цена · ' + c.lotCount + ' ' + PF.plural(c.lotCount, 'лот', 'лота', 'лотов') : 'Цена покупки';
        var det = '<span class="pfc-det-i pfc-det-i--nm"><span class="pfc-det-l">Название</span><span class="pfc-det-v pfc-det-v--nm">' + esc(assetDisplayName(h)) + '</span></span>' +
            '<span class="pfc-det-i"><span class="pfc-det-l">' + dateLbl + '</span><span class="pfc-det-v">' + dateVal + '</span></span>' +
            '<span class="pfc-det-i"><span class="pfc-det-l">' + priceLbl + '</span><span class="pfc-det-v">' + fmtPrice(c.buy) + '</span></span>' +
            (isB ? '<span class="pfc-det-i"><span class="pfc-det-l">' + (multi ? 'Средний НКД' : 'НКД при покупке') + '</span><span class="pfc-det-v">' + (c.nkd > 0 ? fmtPrice(c.nkd) : '0 ₽') + '</span></span>' : '');
        return '<tr class="pfc-mdet" data-hid="' + h.id + '"><td colspan="4"><div class="pfc-mdet-in">' + det + '</div></td></tr>';
    }

    // ---- настройки/редактор (дропдаун ⚙): «спокойный список» ----
    // Состав по умолчанию — ЧИТАЕМЫЙ список (текст, не поля): тикер · шт · средняя цена
    // покупки · дата. Клик по строке раскрывает редактор ТОЛЬКО этого актива (viewRowHtml/
    // holdEditorHtml). Форма добавления свёрнута в одну кнопку-строку (у пустого портфеля
    // раскрыта сразу), цвет — точка в шапке с палитрой-поповером, «Удалить портфель» —
    // тихая ссылка в футере, раскрывающая данжер-зону с подтверждением НА МЕСТЕ (без модалки).
    function menuHtml(p) {
        // цвета, занятые ДРУГИМИ портфелями, приглушены и недоступны — у каждого
        // портфеля свой цвет, карточки не путаются
        var takenColors = {};
        PF.store.items.forEach(function (o) { if (o.id !== p.id) takenColors[o.color] = o.name; });
        var sw = COLORS.map(function (cc) {
            var taken = takenColors[cc.id];
            return '<button class="pfm-sw' + (p.color === cc.id ? ' on' : '') + (taken ? ' taken' : '') + '" style="--sw:' + cc.v + ';background:' + cc.v + '" onclick="pfSetColor(\'' + p.id + '\',\'' + cc.id + '\')" aria-label="' + cc.id + '"' +
                (taken ? ' title="Занят: ' + attr(taken) + '"' : '') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>';
        }).join('');
        var holds = p.holdings || [];
        var stocks = holds.filter(function (h) { return h.type !== 'bond'; });
        var bonds = holds.filter(function (h) { return h.type === 'bond'; });
        function grp(label, kind, list) {
            if (!list.length) return '';
            return '<div class="pfm-grp"><span class="pfm-grp-l pfm-grp-l--' + kind + '">' + label + '</span>' +
                '<span class="pfm-grp-n">' + list.length + '</span><i class="pfm-grp-rule"></i></div>' +
                list.map(function (h) { return viewRowHtml(p.id, h); }).join('');
        }
        var rows = grp('Акции', 'stock', stocks) + grp('Облигации', 'bond', bonds);
        var n = holds.length;
        var empty = !n;
        // стрелка указывает ВВЕРХ на форму добавления (она над списком)
        var UP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>';
        // пустое состояние — «портфель с плюсом» в тонированной плашке (а не безликий
        // квадрат), заголовок-приглашение и понятные шаги: форма сверху или импорт снизу
        var noneBox = '<div class="pfm-none">' +
            '<span class="pfm-none-arrow up">' + UP_SVG + '</span>' +
            '<span class="pfm-none-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2.5"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 11v5"/><path d="M9.5 13.5h5"/></svg></span>' +
            '<span class="pfm-none-t">Портфель ждёт первые активы</span>' +
            '<span class="pfm-none-s">Добавьте актив вручную в форме выше — или перенесите готовый состав импортом.</span>' +
            '<div class="pfm-none-imp">' + PF.impWrapHtml('none-' + p.id, p.id) + '</div>' +
        '</div>';
        // шапка: точка-цвет (клик → палитра) + «тихое» имя (рамка на ховер/фокус) + «Готово»
        var top = '<div class="pfm-top">' +
            '<span class="pfm-colorwrap">' +
                '<button class="pfm-dot" style="--sw:' + colorVal(p.color) + '" onclick="pfColorsToggle()" aria-label="Цвет портфеля" title="Цвет портфеля"></button>' +
                (PF.colorsOpen ? '<span class="pfm-colorpop">' + sw + '</span>' : '') +
            '</span>' +
            '<span class="pfm-namewrap">' +
                // 24 символа — тот же максимум, что у инлайн-правки имени на карточке
                '<input class="pfm-name" maxlength="24" value="' + attr(p.name) + '" onchange="pfRename(\'' + p.id + '\',this.value)" placeholder="Название портфеля">' +
                PENCIL_SVG +
            '</span>' +
            '<button class="pfm-done" onclick="pfCloseMenu()">' + PF.CHECK_SVG + 'Готово</button>' +
        '</div>';
        // деньги и цель: свободный кэш портфеля (пополняется остатком ребалансировок) и
        // целевая доля облигаций (маркер на полосе распределения + подсказка «докупите…»)
        var extras = '<div class="pfm-extras">' +
            '<label class="pfm-extra" title="Свободные деньги портфеля — не вложены в бумаги; сюда автоматически падает остаток от обменов ребалансировки">' +
                '<span>Свободные деньги</span><span class="pfm-extra-f"><input class="pfm-in pfm-in-num" type="number" min="0" step="0.01" value="' + (p.cash > 0 ? p.cash : '') + '" placeholder="0" onchange="pfSetCash(\'' + p.id + '\',this.value)"><i>₽</i></span></label>' +
            '<label class="pfm-extra" title="Целевая структура: сколько процентов портфеля должно быть в облигациях. На карточке появится метка цели и подсказка, чего докупить. Пусто — выключено">' +
                '<span>Цель · облигации</span><span class="pfm-extra-f"><input class="pfm-in pfm-in-num" type="number" min="0" max="100" step="1" value="' + (p.targetBond != null ? p.targetBond : '') + '" placeholder="выкл" onchange="pfSetTarget(\'' + p.id + '\',this.value)"><i>%</i></span></label>' +
        '</div>';
        // добавление: свёрнуто в пунктирную кнопку-строку; раскрытая панель — та же форма
        // «за один подход» (addFormHtml), шапка панели сворачивает её обратно
        var addBlock = '<div class="pfm-addwrap' + (PF.addOpen ? ' on' : '') + (empty ? ' is-empty' : '') + '">' +
            (PF.addOpen
                ? '<button class="pfm-addghost on" onclick="pfAddToggle(\'' + p.id + '\')" title="Свернуть форму добавления">' +
                    '<span class="pfm-addhead-ic">' + PF.PLUS_SVG + '</span><span class="pfm-addghost-t">Добавить актив</span>' +
                    '<svg class="pfm-addghost-ch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>' +
                  addFormHtml(p.id, empty)
                : '<button class="pfm-addghost" onclick="pfAddToggle(\'' + p.id + '\')">' + PF.PLUS_SVG + '<span>Добавить актив</span></button>') +
        '</div>';
        // одна строка подписей колонок на весь список (сетка = .pfm-vrow); НКД у облигаций —
        // подстрокой в ячейке цены, поэтому отдельная колонка ему не нужна
        var vhead = n ? '<div class="pfm-vhead"><span>Тикер</span><span>Шт</span><span>Цена покупки</span><span>Дата</span></div>' : '';
        // футер: рутинные действия — тихим текстом слева; «Удалить портфель» — тихой красной
        // ссылкой справа, раскрывающей данжер-зону (само удаление — только внутри зоны)
        var foot = '<div class="pfm-bottom">' +
            '<div class="pfm-foot">' +
                (empty ? '' : PF.impWrapHtml('imp-' + p.id, p.id)) +   // у пустого портфеля «Импорт» уже внутри приглашения
                '<button class="pfm-quiet" onclick="pfToggleHidden(\'' + p.id + '\')" title="Убрать карточку с «Обзора» (портфель останется в сводках) — вернуть можно через «Видимость» в шапке">' +
                    PF.EYEOFF_SVG + 'Скрыть</button>' +
                '<i class="pfm-foot-sp"></i>' +
                '<button class="pfm-del-link' + (PF.delArm ? ' on' : '') + '" onclick="pfDelArm(' + (PF.delArm ? 'false' : 'true') + ')">Удалить портфель</button>' +
            '</div>' +
            (PF.delArm ? dangerHtml(p) : '') +
        '</div>';
        // Оверлей на всю карточку: шапка · добавление · список состава · футер.
        // PF.menuJustOpened=true только на ПЕРВЫЙ рендер после открытия (⚙) — на всех
        // последующих ре-рендерах (правка лота, раскрытие строки и т.п. тоже дёргают
        // PF.renderPortfolios и пересоздают весь .pfc-menu целиком) анимация pfMenuIn
        // ПОВТОРНО не проигрывается, иначе вся панель настроек каждый раз мигает.
        return '<div class="pfc-menu' + (PF.menuJustOpened ? '' : ' no-anim') + '" id="pfMenu-' + p.id + '">' +
            top + addBlock + extras +
            '<div class="pfm-mid' + (empty ? ' pfm-mid--empty' : '') + '">' +
                '<div class="pfm-sec"><span>Состав · ' + n + ' ' + PF.plural(n, 'актив', 'актива', 'активов') + '</span>' +
                    '<i class="pfm-sec-rule"></i></div>' +
                vhead +
                '<div class="pfm-rows" data-skey="menu-' + p.id + '">' + (rows || noneBox) + '</div>' +
            '</div>' +
            foot +
        '</div>';
    }
    // Данжер-зона удаления портфеля: последствия с числами + подтверждение на месте
    function dangerHtml(p) {
        var n = (p.holdings || []).length, t = (p.trades || []).length;
        var bits = [];
        if (n) bits.push(n + ' ' + PF.plural(n, 'актив', 'актива', 'активов') + ' со всеми лотами');
        if (t) bits.push('история сделок');
        var s = bits.length ? 'Будут стёрты: ' + bits.join(' и ') + '. Действие необратимо.'
            : 'Портфель пуст — будет удалена только карточка.';
        return '<div class="pfm-danger">' +
            '<div class="pfm-danger-t">Удалить «' + esc(p.name) + '»?</div>' +
            '<div class="pfm-danger-s">' + s + '</div>' +
            '<div class="pfm-danger-btns">' +
                '<button class="pfm-danger-no" onclick="pfDelArm(false)">Отмена</button>' +
                '<button class="pfm-danger-yes" onclick="pfDeleteYes(\'' + p.id + '\')">Да, удалить</button>' +
            '</div>' +
        '</div>';
    }
    // Иконка «подтянуть на дату» для КОНКРЕТНОГО ЛОТА (журнал докупок): горит (lit) пока
    // не подтянуто с API, затухает (done) после загрузки, крутится при загрузке.
    function fieldFxLot(pid, hid, lotId, field, fromApi, dateStr, loading) {
        var what = field === 'nkd' ? 'НКД' : 'цену';
        var title = loading ? 'Загрузка…'
            : (fromApi ? (field === 'nkd' ? 'НКД' : 'Цена') + ' закрытия на ' + ruDate(dateStr) + ' · нажмите, чтобы обновить'
                       : 'Подтянуть ' + what + ' закрытия MOEX на дату лота');
        var cls = 'pfm-fx ' + (loading ? 'loading' : (fromApi ? 'done' : 'lit'));
        var inner = loading ? '<span class="pfm-fx-sp"></span>' : PF.FETCH_SVG;
        return '<button class="' + cls + '" type="button" tabindex="-1" title="' + attr(title) + '" ' +
            'onclick="pfFetchLotField(\'' + pid + '\',\'' + hid + '\',\'' + lotId + '\',\'' + field + '\')">' + inner + '</button>';
    }
    // календарь-иконка + нативный date-input — как поле даты во вкладке «Тест» (.bt-date-field):
    // штатный индикатор браузера скрыт (растянут прозрачно на всю ячейку — клик открывает пикер),
    // а видимая иконка одинаковая во всём приложении.
    var CAL_SVG = '<svg class="pfm-date-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    function dateFieldHtml(inputHtml) { return '<span class="pfm-datewrap">' + inputHtml + CAL_SVG + '</span>'; }
    function lotDateInput(pid, h, l) {
        return dateFieldHtml('<input class="pfm-in pfm-in-date" type="date" value="' + attr(l.buyDate) + '" ' +
            'onpaste="pfDatePaste(event,this)" onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'buyDate\',this.value)">');
    }

    // ===== Красивый календарь для дат в настройках портфеля — тот же виджет (.btcal),
    // что и в поле даты вкладки «Тест» (см. js/sidebar.js), но без привязки к одному
    // фиксированному input#btDateInput: тут таких полей много (дата лота × несколько
    // строк на портфель) и они постоянно пересоздаются при ре-рендере (PF.renderPortfolios
    // перезаписывает host.innerHTML на каждое изменение) — поэтому вместо getElementById
    // используется делегирование кликов на document и «текущий» инпут curInput. =====
    (function () {
        var mq = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };
        var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        var MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        var DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        var pop = null, curInput = null, vY = 0, vM = 0, view = 'days', vYPageEnd = 0;
        var MIN_YEAR = 2014;
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        function chevron() { return '<svg class="btcal-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'; }
        function closeCal() { if (pop) { pop.remove(); pop = null; } curInput = null; }
        function selDate() {
            if (curInput && curInput.value) {
                var p = curInput.value.split('-');
                return { y: +p[0], m: +p[1] - 1, d: +p[2] };
            }
            return null;
        }
        function monthInFuture(y, m, tY, tM) { return y > tY || (y === tY && m > tM); }

        function renderDays() {
            var today = new Date(); today.setHours(0, 0, 0, 0);
            var tY = today.getFullYear(), tM = today.getMonth();
            var sel = selDate();
            var nm = vM === 11 ? 0 : vM + 1, ny = vM === 11 ? vY + 1 : vY;
            var nextDis = monthInFuture(ny, nm, tY, tM);
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<div class="btcal-sel">'
                + '<button type="button" class="btcal-pick" data-pick="months">' + MONTHS[vM] + chevron() + '</button>'
                + '<button type="button" class="btcal-pick" data-pick="years">' + vY + chevron() + '</button>'
                + '</div>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-dow">';
            DOW.forEach(function (d) { h += '<span>' + d + '</span>'; });
            h += '</div><div class="btcal-grid">';
            var first = new Date(vY, vM, 1);
            var offset = (first.getDay() + 6) % 7;
            var dim = new Date(vY, vM + 1, 0).getDate();
            var dimPrev = new Date(vY, vM, 0).getDate();
            for (var i = 0; i < 42; i++) {
                var dnum, cy = vY, cm = vM, out = false;
                if (i < offset) { dnum = dimPrev - offset + 1 + i; cm = vM - 1; out = true; }
                else if (i >= offset + dim) { dnum = i - offset - dim + 1; cm = vM + 1; out = true; }
                else { dnum = i - offset + 1; }
                var dt = new Date(cy, cm, dnum); dt.setHours(0, 0, 0, 0);
                var dis = dt > today;
                var isSel = sel && dt.getFullYear() === sel.y && dt.getMonth() === sel.m && dt.getDate() === sel.d;
                var isToday = dt.getTime() === today.getTime();
                var cls = 'btcal-day' + (out ? ' out' : '') + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isToday ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-date="' + dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + '"') + '>' + dnum + '</button>';
            }
            h += '</div>';
            return h;
        }

        function renderMonths() {
            var today = new Date();
            var tY = today.getFullYear(), tM = today.getMonth();
            var sel = selDate();
            var nextDis = vY >= tY;
            var prevDis = vY <= MIN_YEAR;
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"' + (prevDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<button type="button" class="btcal-title" data-pick="years">' + vY + chevron() + '</button>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-months">';
            for (var m = 0; m < 12; m++) {
                var dis = monthInFuture(vY, m, tY, tM);
                var isSel = sel && sel.y === vY && sel.m === m;
                var isCur = vY === tY && m === tM;
                var cls = 'btcal-mo' + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isCur ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-month="' + m + '"') + '>' + MONTHS_SHORT[m] + '</button>';
            }
            h += '</div>';
            return h;
        }

        function renderYears() {
            var today = new Date();
            var tY = today.getFullYear();
            var sel = selDate();
            var end = vYPageEnd, start = end - 11;
            var prevDis = start <= MIN_YEAR;
            var nextDis = end >= tY;
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"' + (prevDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<div class="btcal-title btcal-title-static">' + Math.max(MIN_YEAR, start) + ' – ' + end + '</div>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-years">';
            for (var y = start; y <= end; y++) {
                if (y < MIN_YEAR) { h += '<span class="btcal-yr empty"></span>'; continue; }
                var dis = y > tY;
                var isSel = sel && sel.y === y;
                var isCur = y === tY;
                var cls = 'btcal-yr' + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isCur ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-year="' + y + '"') + '>' + y + '</button>';
            }
            h += '</div>';
            return h;
        }

        // Поле «вставить дату»: скопированную дату (ДД.ММ.ГГГГ / ГГГГ-ММ-ДД и т.п.) можно
        // вставить/ввести руками, не выискивая её по календарю. Значение переживает
        // ре-рендеры навигации (pasteVal), при открытии календаря сбрасывается.
        var pasteVal = '';
        function parsePastedDate(s) {
            s = String(s || '').trim();
            var m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/), d, mo, y;
            if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
            else {
                m = s.match(/^(\d{1,2})[-./\s](\d{1,2})[-./\s](\d{2}|\d{4})(?:\s*г\.?)?$/);
                if (!m) return null;
                d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000;
            }
            if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < MIN_YEAR) return null;
            var dt = new Date(y, mo - 1, d);
            if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
            var today = new Date(); today.setHours(23, 59, 59, 999);
            if (dt > today) return null;
            return y + '-' + pad(mo) + '-' + pad(d);
        }
        function applyPaste() {
            var box = pop && pop.querySelector('.btcal-paste input');
            if (!box || !curInput) return;
            var iso = parsePastedDate(box.value);
            if (!iso) { box.classList.add('err'); setTimeout(function () { box.classList.remove('err'); }, 900); return; }
            curInput.value = iso;
            curInput.dispatchEvent(new Event('change', { bubbles: true }));
            closeCal();
        }
        function pasteBoxHtml() {
            return '<div class="btcal-paste">' +
                '<input type="text" inputmode="numeric" maxlength="12" placeholder="ДД.ММ.ГГГГ — вставьте дату" value="' + pasteVal.replace(/"/g, '&quot;') + '">' +
                '<button type="button" class="btcal-paste-ok">OK</button></div>';
        }
        function bindPasteBox() {
            var box = pop && pop.querySelector('.btcal-paste input');
            if (!box) return;
            box.addEventListener('input', function () { pasteVal = box.value; });
            box.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyPaste(); }
                e.stopPropagation();   // Escape в поле не должен закрывать весь календарь через document-хендлер? — закрывает, но без побочек
            });
            // вставка из буфера: применяем сразу, если распозналась
            box.addEventListener('paste', function () {
                setTimeout(function () { pasteVal = box.value; if (parsePastedDate(box.value)) applyPaste(); }, 0);
            });
        }
        function render() {
            if (!pop) return;
            pop.innerHTML = pasteBoxHtml() + (view === 'years' ? renderYears() : (view === 'months' ? renderMonths() : renderDays()));
            bindPasteBox();
            if (curInput) positionPop(curInput);
        }

        // Список дат в настройках лежит в скроллящемся .pfm-rows — обычный position:absolute
        // внутри поля обрезался бы этим overflow. Поэтому попап крепится к <body> как
        // position:fixed и позиционируется координатами инпута (см. positionPop) — тот же приём,
        // что и у выезжающей карточки stockDetailCard (см. память «Fixed overlays need body»).
        function positionPop(inp) {
            var r = inp.getBoundingClientRect();
            // десктопный zoom 0.9 (css/desktop-zoom.css): rect — в ВИЗУАЛЬНЫХ координатах,
            // а style.left/top попапа в <body> зумится → делим на фактический масштаб
            // попапа (самокалибровка, тот же приём, что у призрака драга pfdGz)
            var z = pop.offsetWidth ? (pop.getBoundingClientRect().width / pop.offsetWidth) : 1;
            if (!(z > 0)) z = 1;
            var w = (288) * z, h = (pop.offsetHeight || 330) * z;   // визуальные габариты
            var left = r.left;
            if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
            var top = r.bottom + 8;
            if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
            pop.style.left = (left / z) + 'px';
            pop.style.top = (top / z) + 'px';
        }
        function openCal(inp) {
            closeCal();
            curInput = inp;
            pasteVal = '';
            var sel = selDate();
            var base = sel ? new Date(sel.y, sel.m, 1) : new Date();
            vY = base.getFullYear(); vM = base.getMonth(); view = 'days';
            pop = document.createElement('div');
            // btcal--pf: календарь настроек живёт в <body> и должен всплывать НАД шторкой
            // настроек #pfSetDrawer (z-index 960) — базовый .btcal (z-index 60) тонул за ней
            pop.className = 'btcal btcal--pf';
            pop.style.position = 'fixed';
            document.body.appendChild(pop);
            render();
            positionPop(inp);
            pop.addEventListener('click', function (e) {
                if (e.target.closest('.btcal-paste-ok')) { applyPaste(); return; }
                var t = new Date(), tY = t.getFullYear(), tM = t.getMonth();
                var nav = e.target.closest('[data-nav]');
                if (nav) {
                    if (nav.disabled) return;
                    var d = parseInt(nav.dataset.nav, 10);
                    if (view === 'years') {
                        vYPageEnd += d * 12;
                        if (vYPageEnd > tY) vYPageEnd = tY;
                        if (vYPageEnd < MIN_YEAR + 11) vYPageEnd = MIN_YEAR + 11;
                    } else if (view === 'months') {
                        vY += d;
                        if (vY < MIN_YEAR) vY = MIN_YEAR;
                        if (vY > tY) vY = tY;
                    } else {
                        vM += d;
                        if (vM < 0) { vM = 11; vY--; }
                        if (vM > 11) { vM = 0; vY++; }
                    }
                    render();
                    return;
                }
                var pick = e.target.closest('[data-pick]');
                if (pick) {
                    if (pick.dataset.pick === 'years') {
                        view = 'years';
                        vYPageEnd = tY;
                        if (vY < vYPageEnd - 11) vYPageEnd = vY + 11;
                        if (vYPageEnd < MIN_YEAR + 11) vYPageEnd = MIN_YEAR + 11;
                    } else {
                        view = 'months';
                    }
                    render();
                    return;
                }
                var mo = e.target.closest('[data-month]');
                if (mo) {
                    vM = parseInt(mo.dataset.month, 10);
                    view = 'days';
                    render();
                    return;
                }
                var yr = e.target.closest('[data-year]');
                if (yr) {
                    vY = parseInt(yr.dataset.year, 10);
                    if (monthInFuture(vY, vM, tY, tM)) vM = tM;
                    view = 'days';
                    render();
                    return;
                }
                var day = e.target.closest('[data-date]');
                if (day) {
                    curInput.value = day.dataset.date;
                    curInput.dispatchEvent(new Event('change', { bubbles: true }));
                    closeCal();
                }
            });
        }

        // На десктопе поле делается readonly, чтобы нативный системный календарь не открывался
        // (та же логика, что в «Тест»). Поля пересоздаются при каждом ре-рендере настроек —
        // MutationObserver на #pfWrap переприменяет readonly к новым инпутам сразу после рендера.
        function applyReadonly() {
            document.querySelectorAll('.pfm-in-date').forEach(function (inp) { inp.readOnly = mq.matches; });
        }
        function onModeChange() { applyReadonly(); if (!mq.matches) closeCal(); }
        if (mq.addEventListener) mq.addEventListener('change', onModeChange);
        else if (mq.addListener) mq.addListener(onModeChange);
        window.addEventListener('resize', applyReadonly);

        function ensureObserver() {
            var host = document.getElementById('pfWrap');
            if (!host || host.__pfCalObserved) return;
            host.__pfCalObserved = true;
            new MutationObserver(applyReadonly).observe(host, { childList: true, subtree: true });
            applyReadonly();
        }
        ensureObserver();
        document.addEventListener('DOMContentLoaded', ensureObserver);

        document.addEventListener('mousedown', function (e) {
            var inp = e.target.closest('.pfm-in-date');
            if (inp && mq.matches) {
                e.preventDefault();
                if (pop && curInput === inp) closeCal(); else openCal(inp);
                return;
            }
            if (pop && !pop.contains(e.target)) closeCal();
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCal(); });
        // скролл внутри .pfm-rows (или страницы) — попап зафиксирован на <body>, а не на поле,
        // поэтому при скролле просто закрываем, а не тащим за собой (capture — ловит и вложенные контейнеры)
        document.addEventListener('scroll', function (e) {
            if (pop && !pop.contains(e.target)) closeCal();
        }, true);
    })();
    function lotPriceCell(pid, h, l) {
        return '<span class="pfm-field has-fx">' +
            '<input class="pfm-in pfm-in-num" type="number" step="0.01" min="0" value="' + (l.buyPrice || '') + '" placeholder="цена ₽" ' +
                'onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'buyPrice\',this.value)">' +
            fieldFxLot(pid, h.id, l.id, 'price', !!l.priceFromApi, l.buyDate, PF.loadStatus[l.id + ':price'] === 'loading') + '</span>';
    }
    function lotNkdCell(pid, h, l) {
        return '<span class="pfm-field has-fx">' +
            '<input class="pfm-in pfm-in-num" type="number" step="0.01" min="0" value="' + (l.nkd || '') + '" placeholder="НКД ₽" ' +
                'onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'nkd\',this.value)">' +
            fieldFxLot(pid, h.id, l.id, 'nkd', !!l.nkdFromApi, l.buyDate, PF.loadStatus[l.id + ':nkd'] === 'loading') + '</span>';
    }
    function lotQtyInput(pid, h, l) {
        return '<input class="pfm-in pfm-in-num" type="number" step="1" min="0" value="' + (l.qty || '') + '" placeholder="кол-во" ' +
            'onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'qty\',this.value)">';
    }
    var XMARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    var PENCIL_SVG = '<svg class="pfm-name-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    // Строка состава в режиме ПРОСМОТРА (текст, не поля): тикер+тег · шт · средняя цена
    // покупки (у облигаций подстрока НКД) · дата. Клик раскрывает редактор именно этого
    // актива под строкой; у актива с несколькими лотами в строке чип «×N».
    function viewRowHtml(pid, h) {
        var isB = h.type === 'bond', agg = aggHolding(h), open = !!PF.editHold[h.id];
        var multi = agg.count > 1;
        var lotChip = multi ? '<i class="pfm-vlotn">×' + agg.count + '</i>' : '';
        var nkd = isB && agg.nkd > 0 ? '<i class="pfm-vnkd">НКД ' + fmtPrice(agg.nkd) + '</i>' : '';
        var priceTip = multi ? ' title="Средняя цена покупки по ' + agg.count + ' лотам"' : '';
        var dateVal = multi ? ruDate(agg.avgDate) : ruDate(agg.firstDate);
        var dateTip = multi ? ' title="Средняя (взвешенная) дата покупки"' : '';
        return '<div class="pfm-vwrap">' +
            '<div class="pfm-vrow' + (open ? ' open' : '') + '" onclick="pfMenuRowToggle(\'' + pid + '\',\'' + h.id + '\')" title="' + (open ? 'Свернуть' : 'Изменить — даты, цены, количество') + '">' +
                '<span class="pfm-vtk"><svg class="pfm-vch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
                    '<b>' + esc(h.ticker) + '</b><span class="pfm-tag ' + h.type + '">' + (isB ? 'обл' : 'акц') + '</span>' + lotChip + '</span>' +
                '<span class="pfm-vnum">' + fmtQty(agg.qty) + '</span>' +
                '<span class="pfm-vnum"' + priceTip + '>' + fmtPrice(agg.avgPrice) + nkd + '</span>' +
                '<span class="pfm-vdate"' + dateTip + '>' + dateVal + '</span>' +
            '</div>' +
            (open ? holdEditorHtml(pid, h) : '') +
        '</div>';
    }
    // Редактор актива (раскрыт кликом по строке): тикер + ВСЕ лоты разом (дата · цена ·
    // [НКД] · кол-во — те же поля с подтяжкой MOEX) + «Докупка» + «удалить актив».
    // Редактор — СОСЕД строки (не вложен в неё), поэтому клики по полям не сворачивают её.
    function holdEditorHtml(pid, h) {
        var isB = h.type === 'bond';
        var lots = ensureLots(h), multi = lots.length > 1;
        var cols = '<div class="pfm-ed-cols' + (isB ? ' bond' : '') + '"><span></span><span>Дата</span><span>Цена ₽</span>' +
            (isB ? '<span>НКД ₽</span>' : '') + '<span>Кол-во</span><span></span></div>';
        var lotRows = lots.map(function (l, i) {
            return '<div class="pfm-ed-lot' + (isB ? ' bond' : '') + '">' +
                '<span class="pfm-lotlbl">' + (i + 1) + '</span>' +
                lotDateInput(pid, h, l) +
                lotPriceCell(pid, h, l) +
                (isB ? lotNkdCell(pid, h, l) : '') +
                lotQtyInput(pid, h, l) +
                (multi ? '<button class="pfm-del" type="button" onclick="pfRemoveLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\')" aria-label="Удалить лот" title="Удалить лот">' + XMARK_SVG + '</button>' : '<span></span>') +
            '</div>';
        }).join('');
        return '<div class="pfm-ed">' +
            '<div class="pfm-ed-top"><span class="pfm-ed-l">Тикер</span>' +
                '<input class="pfm-in pfm-in-tk pfm-ed-tk" value="' + attr(h.ticker) + '" onchange="pfEdit(\'' + pid + '\',\'' + h.id + '\',\'ticker\',this.value)" placeholder="Тикер">' +
                '<span class="pfm-hint" title="Иконка-календарь в полях «цена» и «НКД» подтягивает значение закрытия MOEX на дату лота. После загрузки иконка гаснет; сотрите значение — и она снова загорится.">' + PF.INFO_SVG + '</span></div>' +
            cols + lotRows +
            '<div class="pfm-ed-foot">' +
                '<button class="pfm-lotadd" type="button" onclick="pfAddLot(\'' + pid + '\',\'' + h.id + '\')" title="Докупка — ещё одна покупка этого актива (усреднение цены)">' + PF.PLUS_SVG + 'Докупка</button>' +
                '<i class="pfm-foot-sp"></i>' +
                '<button class="pfm-ed-del" type="button" onclick="pfRemoveHolding(\'' + pid + '\',\'' + h.id + '\')">удалить актив</button>' +
            '</div>' +
        '</div>';
    }

    // Форма добавления актива «за один подход»: тикер · тип · дата · цена (+иконка) ·
    // НКД (для облигаций, +иконка) · кол-во · «Добавить». Поле НКД появляется только для
    // облигаций (data-type на форме). Иконка в поле цены/НКД подтягивает значение
    // закрытия MOEX на выбранную дату прямо в форму (значения не теряются — без ре-рендера).
    function addFetchBtn(pid, field) {
        return '<button class="pfm-fx lit" type="button" tabindex="-1" title="Подтянуть ' +
            (field === 'nkd' ? 'НКД' : 'цену') + ' закрытия MOEX на выбранную дату" ' +
            'onclick="pfAddFetch(\'' + pid + '\',\'' + field + '\',event)">' + PF.FETCH_SVG + '</button>';
    }
    // Подсказки тикеров для формы добавления: ОФЗ из таблицы + компании из таблицы акций.
    // Кэшируем собранный список, пересобираем при изменении числа компаний.
    var tkListCache = { n: -1, html: '' };
    function tickerListHtml(pid) {
        var cos = (typeof window.stkAllCompanies === 'function') ? window.stkAllCompanies() : [];
        var bn = 0; try { if (typeof bonds !== 'undefined' && bonds) bn = bonds.length; } catch (e) {}
        if (tkListCache.n !== cos.length + bn) {
            var opts = [];
            try { if (typeof bonds !== 'undefined' && bonds) bonds.forEach(function (b) {
                if (b.t) opts.push('<option value="' + attr(b.t) + '">' + esc(b.n || '') + '</option>'); }); } catch (e) {}
            cos.forEach(function (co) {
                if (co && co.ticker) opts.push('<option value="' + attr(co.ticker) + '">' + esc(co.name || '') + '</option>');
            });
            tkListCache = { n: cos.length + bn, html: opts.join('') };
        }
        return '<datalist id="pfTkList-' + pid + '">' + tkListCache.html + '</datalist>';
    }
    function addFormHtml(pid, empty) {
        return '<div class="pfm-addform" id="pfAddForm-' + pid + '" data-type="stock">' +
            tickerListHtml(pid) +
            '<div class="pfm-addgrid">' +
                '<input class="pfm-in pfm-in-tk pfaf-tk" id="pfNewTk-' + pid + '" placeholder="Тикер / ISIN" maxlength="14" list="pfTkList-' + pid + '" ' +
                    'oninput="pfNewTkAuto(\'' + pid + '\')" onkeydown="if(event.key===\'Enter\')pfAddHolding(\'' + pid + '\')">' +
                '<select class="pfm-in pfm-in-type pfaf-type" id="pfNewType-' + pid + '" onchange="pfAddTypeToggle(\'' + pid + '\')">' +
                    '<option value="stock">Акция</option><option value="bond">Облигация</option></select>' +
                dateFieldHtml('<input class="pfm-in pfm-in-date pfaf-date" id="pfNewDate-' + pid + '" type="date" value="' + todayStr() + '" onpaste="pfDatePaste(event,this)" title="Дата покупки">') +
                '<span class="pfm-field has-fx pfaf-price">' +
                    '<input class="pfm-in pfm-in-num" id="pfNewPrice-' + pid + '" type="number" step="0.01" min="0" placeholder="цена ₽">' +
                    addFetchBtn(pid, 'price') + '</span>' +
                '<span class="pfm-field has-fx pfaf-nkd">' +
                    '<input class="pfm-in pfm-in-num" id="pfNewNkd-' + pid + '" type="number" step="0.01" min="0" placeholder="НКД ₽">' +
                    addFetchBtn(pid, 'nkd') + '</span>' +
                '<input class="pfm-in pfm-in-num pfaf-qty" id="pfNewQty-' + pid + '" type="number" step="1" min="0" placeholder="кол-во" ' +
                    'onkeydown="if(event.key===\'Enter\')pfAddHolding(\'' + pid + '\')">' +
                '<button class="pfm-addbtn pfaf-add" onclick="pfAddHolding(\'' + pid + '\')">' + PF.PLUS_SVG + 'Добавить</button>' +
            '</div></div>';
    }

    // Шапка вторичной карточки в стиле calc-карточек (.k eyebrow + .t заголовок).
    // subLive (опционально) — ключ data-live на подзаголовке: сабтитул с живым
    // числом (напр. общая сумма «Списка портфелей») обновляется точечно фоновым
    // тиком, текст по-прежнему экранируется
    function pfCardHead(k, t, sub, right, subLive) {
        return '<div class="pf-ch">' +
            '<div class="pf-ch-l">' +
                (k ? '<span class="pf-ch-k">' + esc(k) + '</span>' : '') +
                '<span class="pf-ch-t">' + esc(t) + (sub ? '<span class="pf-ch-s"' + (subLive ? ' data-live="' + subLive + '"' : '') + '>' + esc(sub) + '</span>' : '') + '</span>' +
            '</div>' + (right || '') + '</div>';
    }




    // ====================================================================
    //  ДЕЙСТВИЯ (inline onclick)
    // ====================================================================
    window.pfAddPortfolio = function () {
        if (PF.store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' ' + PF.plural(MAX_CARDS, 'портфель', 'портфеля', 'портфелей') + ' на странице', true); return; }
        // до добавления: если видимый портфель был один, его дашборд жил «Обзором» —
        // на переходе 1→2 откроем чип и ему, ряд читается «две вкладки двух портфелей»
        var wasVis = visibleItems();
        var wasSingle = wasVis.length === 1 ? wasVis[0] : null;
        // новый портфель появляется ВВЕРХУ списка (unshift) — «Мои портфели» и
        // сводки показывают его первым
        var p = makePortfolio(); PF.store.items.unshift(p); saveStore();
        // R9.2: карточка на «Обзоре» дописывается В КОНЕЦ сетки — собранная
        // раскладка не перетасовывается (раньше unshift в начало сдвигал все блоки).
        // Пустой order не трогаем: его засеет pfxSeedLayout эталонной раскладкой.
        var oc = dashCfgFor('overview');
        var bid = 'pf:' + p.id;
        if (Array.isArray(oc.order) && oc.order.length && oc.order.indexOf(bid) < 0) {
            oc.order.push(bid);
            if (oc === PF.dashCfg) saveDashCfg();
            else try { localStorage.setItem(DASH_KEY, JSON.stringify(oc)); } catch (e) {}
        }
        PF.pfNoScrollKeep = true;   // ниже сами уводим страницу наверх — сохранять прежнюю позицию не надо
        // R9.2: при 2+ видимых портфелях новый живёт СВОЕЙ вкладкой — открываем чип
        // и настройки-шторку прямо там (штатный путь ⚙), «Обзор» не трогаем
        if (pfxWide() && visibleItems().length >= 2) {
            if (wasSingle && pfxOpenPfTabs.indexOf(wasSingle.id) < 0) pfxOpenPfTabs.push(wasSingle.id);
            if (pfxOpenPfTabs.indexOf(p.id) < 0) pfxOpenPfTabs.push(p.id);
            pfxSaveOpenTabs();
            pfxActivateTab('pf:' + p.id);
            window.pfxPortSettings(p.id);   // чистое состояние настроек + PF.renderNoAnim
            var sct = document.getElementById('contentArea');
            if (sct) { try { sct.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { sct.scrollTop = 0; } }
            toast('Портфель создан — открыт на своей вкладке');
            pfxFlashBlock('pf:' + p.id);
            return;
        }
        // первый портфель / узкий экран: прежний путь — карточка и настройки на «Обзоре».
        // Настройки открываются сразу — с тем же чистым состоянием, что и через ⚙
        // (переход озвучиваем тостом ниже, см. pfxGoOverviewFor).
        var jumped = pfxGoOverviewFor(p.id);
        PF.openMenu = p.id; PF.menuJustOpened = true;
        // форма добавления СВЁРНУТА по умолчанию (раскрывается кнопкой «＋ Добавить актив») —
        // раньше открывалась сразу, что мешало
        PF.editHold = {}; PF.colorsOpen = false; PF.delArm = false; PF.addOpen = false;
        PF.renderPortfolios();
        // и прокручиваем к нему наверх — портфель создаётся с открытыми настройками,
        // пользователь должен его сразу видеть
        var sc = document.getElementById('contentArea');
        if (sc) { try { sc.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { sc.scrollTop = 0; } }
        // нажали с другой подвкладки — объясняем, куда унесло, и подсвечиваем карточку
        if (jumped) {
            toast('Портфель создан — настройки открыты на «Обзоре»');
            pfxFlashBlock('pf:' + p.id);
        }
    };
    // Скопировать состав портфеля таблицей: облигации и акции — ОТДЕЛЬНЫМИ блоками, у
    // каждого своё жирное название раздела и своя строка заголовков (№ / Тикер / … ), между
    // блоками — пустая строка. Возвращает { text, html }:
    //  · text — TSV-фолбэк (пустая строка-разделитель, заголовки под названием раздела),
    //    в Excel столбцы выравниваются по табам;
    //  · html — таблица для Excel/Word/Google-таблиц: названия разделов и заголовки жирные,
    //    каждое значение в своей ячейке — выравнивание по заголовкам «из коробки».
    function copyTextForPortfolio(p) {
        var c = calcPf(p);
        if (!c.hs.length) return null;
        // числа без «₽» и разрядных пробелов, десятичная запятая — Excel съедает как число
        function numCell(v) {
            if (v == null || !isFinite(v)) return '';
            return String(Math.round(v * 100) / 100).replace('.', ',');
        }
        var COLS = ['№', 'Тикер', 'Название', 'Кол-во', 'Ед.', 'Цена, ₽', 'Дата покупки'];
        var ALIGN = ['right', 'left', 'left', 'right', 'left', 'right', 'left'];
        function rowCells(x, i) {
            return [i + 1, x.h.ticker, x.h.name || '', Math.round(x.c.qty || 0), 'шт',
                numCell(x.c.buy), ruDate(x.c.firstDate)];
        }
        var bonds = c.hs.filter(function (x) { return x.h.type === 'bond'; });
        var stocks = c.hs.filter(function (x) { return x.h.type !== 'bond'; });

        // ---- текстовый вариант: столбцы выровнены ПРОБЕЛАМИ (читается ровной таблицей в любом
        // моноширинном поле; Excel/Word/Google-таблицы берут rich-html ниже, поэтому табы не
        // нужны). Ширины столбцов общие для обоих блоков — облигации и акции выровнены между собой. ----
        var allRows = bonds.map(function (x, i) { return rowCells(x, i); })
            .concat(stocks.map(function (x, i) { return rowCells(x, i); }));
        var widths = COLS.map(function (h, ci) {
            var w = h.length;
            allRows.forEach(function (r) { w = Math.max(w, String(r[ci]).length); });
            return w;
        });
        function padCell(v, ci) {
            v = String(v);
            var gap = widths[ci] - v.length; if (gap < 0) gap = 0;
            var sp = new Array(gap + 1).join(' ');
            return ALIGN[ci] === 'right' ? sp + v : v + sp;
        }
        function fmtRow(cells) { return cells.map(padCell).join('  ').replace(/\s+$/, ''); }
        var lines = ['Портфель «' + p.name + '»'];
        function txtSection(title, list) {
            if (!list.length) return;
            lines.push('');                                 // пустая строка между блоками
            lines.push(title);                              // название раздела
            lines.push(fmtRow(COLS));                       // заголовки этого раздела
            list.forEach(function (x, i) { lines.push(fmtRow(rowCells(x, i))); });
        }
        txtSection('Облигации', bonds);
        txtSection('Акции', stocks);
        var text = lines.join('\n');

        // ---- HTML-вариант (жирные разделы/заголовки, выравнивание по столбцам) ----
        var rows = ['<tr><td colspan="' + COLS.length + '" style="font-weight:800;font-size:14px;padding-bottom:4px;">' + esc('Портфель «' + p.name + '»') + '</td></tr>'];
        function htmlSection(title, list) {
            if (!list.length) return;
            rows.push('<tr><td colspan="' + COLS.length + '" style="height:10px;"></td></tr>');   // пустая строка-разделитель
            rows.push('<tr><td colspan="' + COLS.length + '" style="font-weight:800;">' + esc(title) + '</td></tr>');
            rows.push('<tr>' + COLS.map(function (h, i) {
                return '<td align="' + ALIGN[i] + '" style="font-weight:700;border-bottom:1px solid #d0d7e2;">' + esc(h) + '</td>';
            }).join('') + '</tr>');
            list.forEach(function (x, i) {
                rows.push('<tr>' + rowCells(x, i).map(function (v, ci) {
                    return '<td align="' + ALIGN[ci] + '">' + esc(String(v)) + '</td>';
                }).join('') + '</tr>');
            });
        }
        htmlSection('Облигации', bonds);
        htmlSection('Акции', stocks);
        var html = '<table style="border-collapse:collapse;font-family:Inter,Arial,sans-serif;font-size:13px;">' + rows.join('') + '</table>';

        return { text: text, html: html };
    }
    // «+» в шапке «Избранного» → терминал: та же связка, что у сайдбар-подпункта «Терминал»
    // (раскрыть группу «Рынок» + показать таблицу акций в #panel-market-stocks)
    window.pfGoTerminal = function (ev) {
        if (ev) ev.stopPropagation();
        if (typeof window.sbOpenGroup === 'function') window.sbOpenGroup('market');
        if (typeof window.switchTab === 'function') window.switchTab('market-stocks');
    };
    window.pfCopyComposition = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var p = findPf(pid); if (!p) return;
        var payload = copyTextForPortfolio(p);
        if (!payload || !payload.text) { toast('Состав портфеля пуст', true); return; }
        function ok() { toast('Состав «' + p.name + '» скопирован'); }
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = payload.text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta); ok();
            } catch (e) { toast('Не удалось скопировать', true); }
        }
        function plainWrite() {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(payload.text).then(ok, fallback);
            else fallback();
        }
        try {
            // rich-copy: и жирные разделы (text/html для Excel/Word), и TSV-фолбэк (text/plain)
            if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem === 'function' && payload.html) {
                var item = new ClipboardItem({
                    'text/html': new Blob([payload.html], { type: 'text/html' }),
                    'text/plain': new Blob([payload.text], { type: 'text/plain' })
                });
                navigator.clipboard.write([item]).then(ok, plainWrite);
            } else plainWrite();
        } catch (e) { fallback(); }
    };
    // Скрыть/показать карточку. Попап «Видимость» пересоздаётся рендером — если он был
    // открыт, возвращаем ему .open, чтобы можно было переключить несколько портфелей подряд.
    window.pfToggleHidden = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var p = findPf(pid); if (!p) return;
        p.hidden = !p.hidden;
        if (p.hidden) {   // прибираем состояния скрытой карточки
            if (PF.openMenu === pid) { PF.openMenu = null; }
            delete PF.chartOpen[pid]; delete PF.chartAssets[pid]; delete PF.chartAssetsFull[pid]; delete PF.holdsExpand[pid];
        }
        var eyeMenu = dq('pfImp-eye');
        var keepOpen = !!(eyeMenu && eyeMenu.classList.contains('open'));
        var reopenEye = function () {
            var m = dq('pfImp-eye');
            if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
        };
        saveStore(); PF.renderSmooth(keepOpen ? reopenEye : null);
        // R9.2: открытая вкладка скрытого портфеля живёт дальше — озвучиваем,
        // чтобы «скрыть» не читалось как пропажа вкладки. R9.3: словарь честный
        // («убран с Обзора», капитал в сводке остаётся — см. eyeWrapHtml) и
        // кнопка «Вернуть» прямо в тосте — не надо искать «Видимость» в шапке.
        var tabKept = p.hidden && pfxWide() && pfxOpenPfTabs.indexOf(pid) >= 0;
        if (p.hidden) {
            toast('Портфель «' + p.name + '» убран с «Обзора»' + (tabKept ? ' — его вкладка осталась' : ''), false,
                { label: 'Вернуть', fn: function () { window.pfToggleHidden(pid); } });
        } else {
            toast('Портфель «' + p.name + '» снова показан');
        }
    };
    window.pfShowAllHidden = function () {
        PF.store.items.forEach(function (p) { p.hidden = false; });
        saveStore(); PF.renderSmooth();
    };
    // «Показать все»/«Скрыть все» внутри попапа «Видимость» — попап оставляем открытым
    function pfEyeReopen() {
        var m = dq('pfImp-eye');
        if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
    }
    window.pfEyeShowAll = function (ev) {
        if (ev) ev.stopPropagation();
        PF.store.items.forEach(function (p) { p.hidden = false; });
        saveStore(); PF.renderSmooth(pfEyeReopen);
    };
    window.pfEyeHideAll = function (ev) {
        if (ev) ev.stopPropagation();
        PF.store.items.forEach(function (p) {
            p.hidden = true;
            if (PF.openMenu === p.id) { PF.openMenu = null; }
            delete PF.chartOpen[p.id]; delete PF.chartAssets[p.id]; delete PF.chartAssetsFull[p.id]; delete PF.holdsExpand[p.id];
        });
        saveStore(); PF.renderSmooth(pfEyeReopen);
    };
    // НКД при импорте из расчёта/ежемесячного дохода: дата покупки = сегодня, поэтому
    // подтягиваем ТЕКУЩИЙ НКД (ACCRUEDINT) из живых данных MOEX и помечаем как «с API»
    // (иконка в поле сразу гаснет). Цена в импорте — чистая, НКД отдельной величиной.
    function autofillNkd(holds) {
        if (typeof fetchBondData !== 'function') return;
        (holds || []).forEach(function (h) {
            if (h.type !== 'bond' || !h.ticker) return;
            var l0 = ensureLots(h)[0]; if (!l0 || l0.nkdFromApi || l0.nkd > 0) return;
            Promise.resolve(fetchBondData(h.ticker)).then(function (r) {
                if (r && r.nkd != null && r.nkd >= 0 && !l0.nkdFromApi) {
                    l0.nkd = Math.round(r.nkd * 100) / 100; l0.nkdFromApi = true; saveStore();
                    if (currentTab === 'portfolios' && dq('pfWrap')) PF.renderPortfolios();
                }
            }).catch(function () {});
        });
    }
    // Импорт: pid задан → добавить в портфель; pid null → новый портфель.
    // source: 'calc' (sub: all/stock/bond) | 'fav' | 'monthly'
    window.pfImport = function (source, sub, pid, name) {
        closeImpMenus();
        var holds = compositionFrom(source, sub);
        if (!holds || !holds.length) { toast('Нет данных для импорта — выполните расчёт / добавьте избранное', true); return; }
        if (pid) {
            var p = findPf(pid); if (!p) return;
            p.holdings = (p.holdings || []).concat(holds); saveStore();
            PF.pfInvalidateCharts(pid);   // состав изменился → серия графика доходности устарела
            ensureQuotes(true); PF.renderPortfolios();
            autofillNkd(holds); toast('Добавлено: ' + holds.length); return;
        }
        if (PF.store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' ' + PF.plural(MAX_CARDS, 'портфель', 'портфеля', 'портфелей'), true); return; }
        // src запоминаем: портфель из «ежемесячного дохода» ребалансируется с проверкой
        // сохранности графика ежемесячных выплат (см. pfLostMonths в карточке ребалансировки)
        var np = makePortfolio((name && name.trim()) || importName(source)); np.holdings = holds; np.src = source; PF.store.items.push(np); saveStore();
        PF.openMenu = null; ensureQuotes(true); PF.renderPortfolios(); autofillNkd(holds); toast('Импортировано: ' + holds.length);
    };
    function closeImpMenus() {
        var any = document.querySelectorAll('.pf-impmenu.open');
        for (var i = 0; i < any.length; i++) any[i].classList.remove('open');
        document.removeEventListener('click', pfImpOutside);
    }
    function pfImpOutside(e) { if (!e.target.closest('.pf-impwrap')) closeImpMenus(); }
    window.pfToggleImp = function (ev, key) {
        if (ev) ev.stopPropagation();
        var menu = dq('pfImp-' + key); if (!menu) return;
        var willOpen = !menu.classList.contains('open');
        closeImpMenus();
        if (willOpen) { menu.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
    };

    // ---- бэкап: выгрузка/загрузка всех портфелей в JSON-файл ----
    window.pfExportData = function () {
        closeImpMenus();
        try {
            var json = JSON.stringify(PF.store, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'madame-solomina-portfolios-' + todayStr() + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            toast('Бэкап сохранён · портфелей: ' + PF.store.items.length);
        } catch (e) { toast('Не удалось сохранить файл бэкапа', true); }
    };
    // ---- общие CSV-хелперы выгрузок (под русский Excel: «;», BOM, десятичная запятая) ----
    function csvCell(v) {
        var s = String(v == null ? '' : v).replace(/\n/g, ' ');
        // Excel исполняет ячейки, начинающиеся с = + @ (формульная инъекция) —
        // гасим апострофом; отрицательные числа («-12,3») не трогаем
        if (/^[=+@\t\r]/.test(s) || (s[0] === '-' && !/^-[\d\s.,]+%?$/.test(s))) s = "'" + s;
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function csvNum(v, d) { return (v == null || isNaN(v)) ? '' : (+v).toFixed(d == null ? 2 : d).replace('.', ','); }
    function csvRuDate(iso) { return iso ? String(iso).split('-').reverse().join('.') : ''; }
    function csvDownload(lines, fname) {
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }
    // ---- отчёт: все позиции всех портфелей одной таблицей в CSV под русский Excel.
    // Блок на портфель: строки позиций + «Итого»; в конце — общий итог по всем портфелям.
    window.pfExportExcelAll = function () {
        closeImpMenus();
        if (!PF.store.items.length) { toast('Пока нет портфелей для выгрузки', true); return; }
        var head = ['Портфель', 'Тип', 'Тикер', 'Название', 'Кол-во', 'Средняя цена, ₽', 'Вложено, ₽', 'Цена сейчас, ₽', 'Стоимость, ₽', 'Доход, ₽', 'Доход, %', 'Первая покупка'];
        var lines = [head.map(csvCell).join(';')], total = { inv: 0, val: 0 }, nPos = 0;
        PF.store.items.forEach(function (p, i) {
            var c = calcPf(p);
            if (i > 0) lines.push('');
            c.hs.forEach(function (x) {
                if (!x.h.ticker || !(x.c.qty > 0)) return;
                nPos++;
                lines.push([p.name, x.h.type === 'bond' ? 'Облигация' : 'Акция', x.h.ticker, x.h.name || x.h.ticker,
                    x.c.qty, csvNum(x.c.buy), csvNum(x.c.invested), csvNum(x.c.cur), csvNum(x.c.value), csvNum(x.c.pnl), csvNum(x.c.pnlPct), csvRuDate(x.c.firstDate)
                ].map(csvCell).join(';'));
            });
            lines.push([p.name, 'Итого', '', '', '', '', csvNum(c.invested), '', csvNum(c.value), csvNum(c.pnl), csvNum(c.invested > 0 ? c.pnl / c.invested * 100 : 0), ''].map(csvCell).join(';'));
            total.inv += c.invested; total.val += c.value;
        });
        if (PF.store.items.length > 1) {
            lines.push('');
            lines.push(['ВСЕ ПОРТФЕЛИ', 'Итого', '', '', '', '', csvNum(total.inv), '', csvNum(total.val), csvNum(total.val - total.inv), csvNum(total.inv > 0 ? (total.val - total.inv) / total.inv * 100 : 0), ''].map(csvCell).join(';'));
        }
        try {
            csvDownload(lines, 'madame-solomina-positions-' + todayStr() + '.csv');
            toast('Excel-отчёт сохранён · позиций: ' + nPos);
        } catch (e) { toast('Не удалось сохранить Excel-файл', true); }
    };
    // ---- отчёт: все сделки (покупки из лотов + продажи из журналов ребалансировок)
    // по ВСЕМ портфелям, включая скрытые — это выгрузка данных, а не вид страницы.
    window.pfExportTradesExcel = function () {
        closeImpMenus();
        var rows = [];
        PF.store.items.forEach(function (p) {
            (p.trades || []).forEach(function (t) {   // продажи обменов ребалансировки
                var w = new Date(t.ts || 0);
                var iso = w.getFullYear() + '-' + pad2(w.getMonth() + 1) + '-' + pad2(w.getDate());
                var q = +t.sellQty || 0, proceeds = +t.proceeds || 0;
                rows.push({ pf: p.name, date: iso, side: 'Продажа', type: t.kind === 'bond' ? 'Облигация' : 'Акция',
                    tk: t.sellTicker || '', nm: t.sellName || t.sellTicker || '', price: q > 0 ? proceeds / q : null,
                    nkd: null, qty: q, sum: proceeds, feePct: (+t.fee || 0) * 100 });
            });
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker) return;
                var isB = h.type === 'bond';
                ensureLots(h).forEach(function (l) {
                    var q = +l.qty || 0; if (!(q > 0)) return;
                    var nkd = isB ? (+l.nkd || 0) : null;
                    rows.push({ pf: p.name, date: l.buyDate || '', side: 'Покупка', type: isB ? 'Облигация' : 'Акция',
                        tk: h.ticker, nm: h.name || h.ticker, price: +l.buyPrice || 0, nkd: nkd, qty: q,
                        sum: ((+l.buyPrice || 0) + (nkd || 0)) * q, feePct: 0 });
                });
            });
        });
        if (!rows.length) { toast('Пока нет сделок для выгрузки', true); return; }
        rows.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var head = ['Портфель', 'Дата', 'Сторона', 'Тип', 'Тикер', 'Название', 'Цена, ₽', 'НКД, ₽', 'Кол-во', 'Сумма, ₽', 'Комиссия, %'];
        var lines = [head.map(csvCell).join(';')];
        rows.forEach(function (r) {
            lines.push([r.pf, csvRuDate(r.date), r.side, r.type, r.tk, r.nm, csvNum(r.price),
                r.nkd != null ? csvNum(r.nkd) : '', r.qty, csvNum(r.sum), r.feePct > 0 ? csvNum(r.feePct, 3) : ''
            ].map(csvCell).join(';'));
        });
        try {
            csvDownload(lines, 'madame-solomina-trades-' + todayStr() + '.csv');
            toast('Сделки сохранены · строк: ' + rows.length);
        } catch (e) { toast('Не удалось сохранить Excel-файл', true); }
    };
    window.pfImportClick = function () { closeImpMenus(); var i = dq('pfBkpInput'); if (i) i.click(); };
    // Санация бэкапа перед заменой PF.store: битый файл не должен ронять вкладку, а строки
    // из файла попадают в onclick-атрибуты — id вне безопасного алфавита перегенерируем
    // (см. security-конвенции). Кривые holdings/lots приводим к рабочей форме, а не падаем.
    function pfIdOk(s) { return typeof s === 'string' && /^[\w-]{1,64}$/.test(s); }
    function sanitizeStore(obj) {
        var truncated = false;
        var items = obj.items.filter(function (p) { return p && typeof p === 'object'; });
        if (items.length > MAX_CARDS) { items = items.slice(0, MAX_CARDS); truncated = true; }
        items.forEach(function (p) {
            var idFixed = !pfIdOk(p.id);
            if (idFixed) p.id = genId('pf');
            p.name = String(p.name || 'Портфель').slice(0, 24);
            p.color = pfIdOk(p.color) ? p.color : COLORS[0].id;
            p.cash = (+p.cash > 0) ? Math.round(+p.cash * 100) / 100 : 0;
            p.targetBond = (p.targetBond != null && isFinite(+p.targetBond)) ? clamp(Math.round(+p.targetBond), 0, 100) : null;
            if (!Array.isArray(p.holdings)) p.holdings = [];
            p.holdings = p.holdings.filter(function (h) { return h && typeof h === 'object' && h.ticker; });
            var holdIdFixed = false;
            p.holdings.forEach(function (h) {
                if (!pfIdOk(h.id)) { h.id = genId('h'); holdIdFixed = true; }
                h.ticker = String(h.ticker).toUpperCase().replace(/[^\w.@-]/g, '').slice(0, 20);
                h.name = String(h.name || h.ticker).slice(0, 80);
                h.type = h.type === 'bond' ? 'bond' : 'stock';
                if (h.lots != null && !Array.isArray(h.lots)) delete h.lots;   // ensureLots мигрирует из одиночных полей
                if (Array.isArray(h.lots)) {
                    h.lots = h.lots.filter(function (l) { return l && typeof l === 'object'; });
                    h.lots.forEach(function (l) { if (!pfIdOk(l.id)) { l.id = genId('l'); holdIdFixed = true; } });
                }
                ensureLots(h);
            });
            if (!Array.isArray(p.trades)) delete p.trades;
            // сменились id активов/лотов → сохранённые undo-ссылки сделок больше не сходятся
            else if (holdIdFixed || idFixed) p.trades.forEach(function (t) { if (t && t.undo) delete t.undo; });
        });
        return { items: items, truncated: truncated };
    }
    window.pfImportData = function (input) {
        var f = input && input.files && input.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            var obj;
            try {
                obj = JSON.parse(reader.result);
                if (!obj || !Array.isArray(obj.items)) throw new Error('format');
            } catch (e) { toast('Не удалось прочитать файл бэкапа (неверный формат)', true); input.value = ''; return; }
            input.value = '';
            var extra = obj.items.length > MAX_CARDS ? ' Файл содержит ' + obj.items.length + ' — будут загружены первые ' + MAX_CARDS + '.' : '';
            pfConfirm({
                danger: true, ok: 'Заменить', icon: PF.SHIELD_SVG,
                title: 'Загрузить бэкап?',
                text: 'Текущие портфели (' + PF.store.items.length + ') будут заменены данными из файла (' + Math.min(obj.items.length, MAX_CARDS) + '). Локальные данные перезапишутся.' + extra
            }, function () {
                var clean = sanitizeStore(obj);
                PF.store = { v: obj.v || 1, items: clean.items };
                PF.chartRaw = {}; PF.chartCache = {};   // серии графиков от старых портфелей больше не валидны
                saveStore(); PF.openMenu = null; ensureQuotes(true); PF.renderPortfolios();
                toast('Загружено портфелей: ' + PF.store.items.length + (clean.truncated ? ' (лишние за лимитом отброшены)' : ''));
            });
        };
        reader.onerror = function () { toast('Ошибка чтения файла', true); input.value = ''; };
        reader.readAsText(f);
    };
    // ---- импорт сделок из CSV-файла (универсальный формат брокерских отчётов) ----
    // Понимает разделители ; , и таб; шапку ищет по знакомым названиям колонок
    // (тикер/дата/цена/кол-во/НКД/тип), без шапки ждёт порядок: тикер;дата;цена;кол-во;[НКД].
    // Тип бумаги берётся из колонки или угадывается (SU…/RU… и таблица ОФЗ → облигация).
    var csvImportPid = null;
    function guessType(tk) {
        if (/^SU\d{5}/.test(tk) || /^RU\d{3}/.test(tk) || /^XS\d/.test(tk)) return 'bond';
        try { if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++) {
            var t = bonds[i] && bonds[i].t;
            if (t && (t.indexOf(tk) === 0 || tk.indexOf(t) === 0)) return 'bond';
        } } catch (e) {}
        return 'stock';
    }
    // полное имя бумаги по тикеру: таблица ОФЗ / таблица акций (для новых активов)
    function lookupName(tk, type) {
        if (type === 'bond') {
            try { if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++) {
                var t = bonds[i] && bonds[i].t;
                if (t && (t.indexOf(tk) === 0 || tk.indexOf(t) === 0)) return bonds[i].n || tk;
            } } catch (e) {}
            return tk;
        }
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(tk);
            if (co && co.name) return co.name;
        }
        return tk;
    }
    function parseTradesCsv(text) {
        var lines = String(text || '').replace(/\r/g, '').split('\n')
            .map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) return { rows: [], skipped: 0 };
        // разделитель — какой чаще встречается в первой строке
        var sep = ';', bestN = -1;
        [';', '\t', ','].forEach(function (s) {
            var n = lines[0].split(s).length - 1;
            if (n > bestN) { bestN = n; sep = s; }
        });
        function cells(s) { return s.split(sep).map(function (c) { return c.replace(/^"+|"+$/g, '').trim(); }); }
        var head = cells(lines[0]).map(function (c) { return c.toLowerCase(); });
        function findCol(names) {
            for (var i = 0; i < head.length; i++)
                for (var j = 0; j < names.length; j++) if (head[i].indexOf(names[j]) >= 0) return i;
            return -1;
        }
        var ci = { tk: findCol(['тикер', 'ticker', 'isin', 'secid', 'код', 'инструмент']),
            date: findCol(['дата', 'date']), price: findCol(['цена', 'price']),
            qty: findCol(['кол-во', 'количество', 'кол', 'qty', 'quantity', 'шт']),
            nkd: findCol(['нкд', 'aci', 'купонн']), type: findCol(['тип', 'type']) };
        var hasHead = ci.tk >= 0 && ci.qty >= 0;
        if (!hasHead) ci = { tk: 0, date: 1, price: 2, qty: 3, nkd: 4, type: -1 };
        var rows = [], skipped = 0;
        for (var i = hasHead ? 1 : 0; i < lines.length; i++) {
            var cs = cells(lines[i]);
            var tk = String(cs[ci.tk] || '').toUpperCase().replace(/\s/g, '');
            var qty = Math.round(toNum(cs[ci.qty]));
            if (!tk || !/^[\w.@-]{2,20}$/.test(tk) || !(qty > 0)) { skipped++; continue; }
            var price = ci.price >= 0 ? toNum(cs[ci.price]) : NaN;
            var dateIso = ci.date >= 0 ? pfParseAnyDate(cs[ci.date]) : null;
            var tRaw = ci.type >= 0 ? String(cs[ci.type] || '').toLowerCase() : '';
            var type = tRaw.indexOf('обл') >= 0 || tRaw.indexOf('bond') >= 0 ? 'bond'
                : (tRaw.indexOf('акц') >= 0 || tRaw.indexOf('stock') >= 0 || tRaw.indexOf('share') >= 0 ? 'stock' : guessType(tk));
            var nkd = (type === 'bond' && ci.nkd >= 0 && toNum(cs[ci.nkd]) > 0) ? Math.round(toNum(cs[ci.nkd]) * 100) / 100 : 0;
            rows.push({ ticker: tk, type: type, buyDate: dateIso || todayStr(),
                buyPrice: (isFinite(price) && price > 0) ? Math.round(price * 100) / 100 : 0, qty: qty, nkd: nkd });
        }
        return { rows: rows, skipped: skipped };
    }
    // каждая строка CSV = отдельная покупка (лот); одинаковые тикеры сливаются в один актив
    function mergeRowsIntoPf(p, rows) {
        var tickers = {};
        rows.forEach(function (r) {
            var lot = { id: genId('l'), buyDate: r.buyDate, buyPrice: r.buyPrice, qty: r.qty, nkd: r.nkd, priceFromApi: false, nkdFromApi: false };
            var exist = (p.holdings || []).filter(function (h) { return h.ticker === r.ticker && h.type === r.type; })[0];
            if (exist) ensureLots(exist).push(lot);
            else {
                p.holdings = p.holdings || [];
                p.holdings.push({ id: genId('h'), ticker: r.ticker, name: lookupName(r.ticker, r.type), type: r.type, lots: [lot],
                    potAtBuy: r.type === 'stock' ? potentialOf(r.ticker) : null });
            }
            tickers[r.ticker] = 1;
        });
        return Object.keys(tickers).length;
    }
    window.pfCsvClick = function (pid) {
        closeImpMenus(); csvImportPid = pid || null;
        var inp = dq('pfCsvInput');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file'; inp.id = 'pfCsvInput';
            inp.accept = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
            inp.style.display = 'none';
            document.body.appendChild(inp);
            inp.addEventListener('change', function () { pfCsvImport(this); });
        }
        inp.value = ''; inp.click();
    };
    function pfCsvImport(input) {
        var f = input && input.files && input.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            input.value = '';
            var parsed = parseTradesCsv(reader.result);
            if (!parsed.rows.length) {
                toast('В файле не нашлось сделок. Нужны колонки: тикер · дата · цена · кол-во' + (parsed.skipped ? ' (строк пропущено: ' + parsed.skipped + ')' : ''), true);
                return;
            }
            var p = csvImportPid ? findPf(csvImportPid) : null;
            if (!p) {
                if (PF.store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' ' + PF.plural(MAX_CARDS, 'портфель', 'портфеля', 'портфелей'), true); return; }
                p = makePortfolio('Импорт CSV'); PF.store.items.push(p);
            }
            var nTick = mergeRowsIntoPf(p, parsed.rows);
            saveStore(); PF.pfInvalidateCharts(p.id); ensureQuotes(true); PF.renderPortfolios();
            toast('Импортировано ' + parsed.rows.length + ' ' + PF.plural(parsed.rows.length, 'сделка', 'сделки', 'сделок') + ' · ' +
                nTick + ' ' + PF.plural(nTick, 'бумага', 'бумаги', 'бумаг') + (parsed.skipped ? ' · пропущено строк: ' + parsed.skipped : ''));
        };
        reader.onerror = function () { toast('Ошибка чтения файла', true); input.value = ''; };
        reader.readAsText(f);
    }
    window.pfToggleMenu = function (pid) {
        if (PF.openMenu === pid) { PF.openMenu = null; }
        else {
            PF.openMenu = pid; PF.menuJustOpened = true; PF.chartOpen = {}; PF.chartAssets = {}; PF.chartAssetsFull = {}; PF.holdsExpand = {};
            // свежеоткрытые настройки — с чистым состоянием: строки свёрнуты, палитра,
            // данжер-зона и форма добавления актива закрыты
            PF.editHold = {}; PF.colorsOpen = false; PF.delArm = false; PF.addOpen = false;
        }
        // PF.renderNoAnim (не PF.renderPortfolios): раскрытие настроек трогает только ОДНУ карточку,
        // а полный ре-рендер заново «рисует» мини-графики ВСЕХ карточек с 1-сек анимацией линии —
        // на глаз это читалось как мигание графиков. PF.noChartAnim рисует их сразу в конечном виде.
        PF.renderNoAnim();
    };
    // клик по строке актива в мини-таблице → раскрыть/свернуть субданные (дата/цена/НКД).
    // Правим DOM ТОЧЕЧНО (без PF.renderPortfolios): полный ре-рендер заново «рисует» все мини-
    // графики с 1-секундной анимацией линии — на простой разворот строки это выглядит как
    // мигание всей вкладки. Один и тот же актив может быть в мини-таблице И в оверлее — обновляем
    // все совпадающие строки. PF.openRows синхронизирует состояние со следующим полным ре-рендером.
    window.pfToggleAssetRow = function (pid, hid) {
        var willOpen = !PF.openRows[hid];
        if (willOpen) PF.openRows[hid] = true; else delete PF.openRows[hid];
        var p = findPf(pid); if (!p) return;
        var h = findHold(p, hid); if (!h) return;
        var c = calcHold(h);
        var rows = document.querySelectorAll('.pfc-mtr[data-hid="' + hid + '"]');
        Array.prototype.forEach.call(rows, function (row) {
            row.classList.toggle('open', willOpen);
            var ch = row.querySelector('.pfc-mch'); if (ch) ch.classList.toggle('up', willOpen);
            var next = row.nextElementSibling;
            var hasDet = next && next.classList && next.classList.contains('pfc-mdet');
            if (willOpen && !hasDet) {
                var tmp = document.createElement('tbody');
                tmp.innerHTML = pfMiniDetailRowHtml(h, c);
                row.parentNode.insertBefore(tmp.firstChild, row.nextSibling);
            } else if (!willOpen && hasDet) {
                next.parentNode.removeChild(next);
            }
        });
    };
    // график доходности: раскрыть/свернуть. Открыт может быть только один (и не вместе с ⚙).
    window.pfToggleChart = function (pid) {
        if (PF.chartOpen[pid]) { delete PF.chartOpen[pid]; delete PF.chartAssets[pid]; delete PF.chartAssetsFull[pid]; }
        else { PF.chartOpen = {}; PF.chartAssets = {}; PF.chartAssetsFull = {}; PF.holdsExpand = {}; PF.chartOpen[pid] = true; PF.openMenu = null; }
        PF.renderPortfolios();
        if (PF.chartOpen[pid]) loadPfChart(pid);
    };
    // «раскрытие» вверху карточки: та же панель графика, но сразу с открытыми активами
    window.pfOpenChartAssets = function (pid) {
        if (PF.chartOpen[pid] && PF.chartAssets[pid]) { delete PF.chartOpen[pid]; delete PF.chartAssets[pid]; delete PF.chartAssetsFull[pid]; }
        else { PF.chartOpen = {}; PF.chartAssets = {}; PF.chartAssetsFull = {}; PF.holdsExpand = {}; PF.chartOpen[pid] = true; PF.chartAssets[pid] = true; PF.openMenu = null; }
        PF.renderPortfolios();
        if (PF.chartOpen[pid]) loadPfChart(pid);
    };
    // «весь состав»: раскрыть/свернуть оверлей со полной таблицей состава (вниз поверх контента)
    window.pfToggleHolds = function (pid) {
        if (PF.holdsExpand[pid]) { delete PF.holdsExpand[pid]; }
        else { PF.holdsExpand = {}; PF.holdsExpand[pid] = true; PF.openMenu = null; PF.chartOpen = {}; PF.chartAssets = {}; PF.chartAssetsFull = {}; }
        // PF.renderNoAnim — иначе при раскрытии «всего состава» мигают мини-графики всех карточек
        PF.renderNoAnim();
    };
    // «Показать активы»: раскрыть/свернуть таблицу состава под графиком.
    // Тоггл через классы (без полного ре-рендера) — чтобы не сбивать анимацию графика.
    window.pfToggleChartAssets = function (pid) {
        PF.chartAssets[pid] = !PF.chartAssets[pid];
        var on = !!PF.chartAssets[pid];
        var chartEl = dq('pfcvChart-' + pid), card = chartEl ? chartEl.closest('.pf-card') : null;
        if (card) card.classList.toggle('assets-open', on);
        var btn = document.querySelector('.pfcv-assetbtn[data-pid="' + pid + '"]');
        if (btn) {
            btn.classList.toggle('on', on);
            var t = btn.querySelector('.pfcv-assetbtn-t'); if (t) t.textContent = on ? 'Скрыть активы' : 'Показать активы';
            var ch = btn.querySelector('.pfcv-assetbtn-ch'); if (ch) ch.classList.toggle('up', on);
        }
    };
    // «Показать все активы»: снять ограничение высоты (скролл 340px) с таблицы состава под
    // графиком. Тоггл классом (без ре-рендера) — чтобы не сбивать анимацию графика.
    window.pfToggleAssetsFull = function (pid) {
        PF.chartAssetsFull[pid] = !PF.chartAssetsFull[pid];
        var on = !!PF.chartAssetsFull[pid];
        var btn = document.querySelector('.pfcv-assets-more[data-pid="' + pid + '"]');
        if (!btn) return;
        var assets = btn.closest('.pfcv-assets'); if (assets) assets.classList.toggle('full', on);
        btn.classList.toggle('on', on);
        var t = btn.querySelector('.pfcv-assets-more-t');
        if (t) { var c = calcPf(findPf(pid) || { holdings: [] }); t.textContent = on ? 'Свернуть таблицу' : 'Показать все активы · ' + c.hs.length; }
        var ch = btn.querySelector('.pfcv-assets-more-ch'); if (ch) ch.classList.toggle('up', on);
    };
    // наложить/убрать кривую индекса IMOEX за тот же период — так же, как pfToggleMiniImoex
    // ниже: точечно обновляем кнопку и график, БЕЗ PF.renderPortfolios (иначе вся раскрытая
    // карточка перерисовывается заново и заметно мигает).
    window.pfToggleChartImoex = function (pid) {
        chartImoex[pid] = !chartImoex[pid];
        var on = !!chartImoex[pid];
        var btn = document.querySelector('.pfcv-imbtn[onclick*="\'' + pid + '\'"]');
        if (btn) { btn.classList.toggle('on', on); var p = findPf(pid); if (p) btn.title = 'Наложить кривую — ' + pfBench(p).full; }
        loadPfChart(pid);
    };
    // тумблер IMOEX прямо на мини-графике карточки: обновляем ТОЛЬКО эту карточку (класс кнопки
    // + перерисовка её графика через loadPfChart) — без PF.renderPortfolios, иначе заново «рисуются»
    // все мини-графики вкладки и вся вкладка мигает.
    window.pfToggleMiniImoex = function (pid) {
        chartImoex[pid] = !(pid in chartImoex) ? false : !chartImoex[pid];
        var on = !!chartImoex[pid];
        var btn = document.querySelector('.pfc-imtgl[data-pid="' + pid + '"]');
        if (btn) { btn.classList.toggle('on', on); btn.title = on ? 'Скрыть индекс Мосбиржи' : 'Сравнить с индексом Мосбиржи'; }
        loadPfChart(pid);
    };
    window.pfCloseMenu = function () {
        // не терять начатый ввод: если форма добавления заполнена (есть тикер) — добавляем актив
        // перед закрытием. Частая ошибка: заполнил поля и жмёшь «Готово» вместо «Добавить».
        var pid = PF.openMenu, added = null;
        if (pid) { var tk = dq('pfNewTk-' + pid); if (tk && tk.value.trim()) added = pfReadAddForm(pid); }
        PF.openMenu = null; PF.editHold = {}; PF.addOpen = false; PF.colorsOpen = false; PF.delArm = false;
        if (added) { toast(added.restocked ? added.ticker + ': докуплено · +лот' : added.ticker + ' добавлен в портфель'); ensureQuotes(true); }
        PF.renderPortfolios();
    };
    window.pfRename = function (pid, val) { var p = findPf(pid); if (!p) return;
        p.name = ((val || '').trim() || p.name).slice(0, 24);   // тот же лимит, что у инлайн-правки
        saveStore(); PF.renderPortfolios(); };
    window.pfSetColor = function (pid, col) {
        var p = findPf(pid); if (!p) return;
        // цвета не должны совпадать: занятый другим портфелем цвет выбрать нельзя
        var other = null;
        PF.store.items.forEach(function (o) { if (o.id !== pid && o.color === col) other = o; });
        if (other) { toast('Цвет уже занят портфелем «' + other.name + '»', true); return; }
        p.color = col; PF.colorsOpen = false; saveStore(); PF.renderPortfolios();
    };
    // ---- стилизованное окно подтверждения (вместо системного confirm) ----
    // Живёт в <body> (см. правило про fixed-оверлеи: transform на предках вкладок ломает
    // position:fixed). onOk вызывается только по кнопке подтверждения; Escape/фон/«Отмена»
    // просто закрывают окно.
    function pfConfirm(opts, onOk) {
        var old = dq('pfConfirmOv'); if (old) old.remove();
        var TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        var ov = document.createElement('div');
        ov.id = 'pfConfirmOv';
        ov.innerHTML = '<div class="pfcf-card" role="alertdialog" aria-modal="true">' +
            '<div class="pfcf-ico' + (opts.danger ? ' danger' : '') + '">' + (opts.icon || TRASH) + '</div>' +
            '<div class="pfcf-t">' + opts.title + '</div>' +
            '<div class="pfcf-s">' + opts.text + '</div>' +
            '<div class="pfcf-btns">' +
                '<button class="pfcf-btn" type="button" data-act="no">Отмена</button>' +
                '<button class="pfcf-btn pfcf-ok' + (opts.danger ? ' danger' : '') + '" type="button" data-act="yes">' + (opts.ok || 'Подтвердить') + '</button>' +
            '</div></div>';
        document.body.appendChild(ov);
        function close() {
            document.removeEventListener('keydown', onKey);
            ov.classList.remove('show');
            setTimeout(function () { ov.remove(); }, 180);
        }
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
        ov.addEventListener('click', function (e) {
            if (e.target === ov) { close(); return; }
            var b = e.target.closest('.pfcf-btn'); if (!b) return;
            close();
            if (b.getAttribute('data-act') === 'yes') onOk();
        });
        document.addEventListener('keydown', onKey);
        requestAnimationFrame(function () {
            ov.classList.add('show');
            var okBtn = ov.querySelector('.pfcf-ok'); if (okBtn) try { okBtn.focus(); } catch (e) {}
        });
    }
    // Удаление портфеля: ссылка в футере настроек раскрывает данжер-зону (pfDelArm),
    // само удаление — только второй кнопкой «Да, удалить» внутри зоны. Модалки pfConfirm
    // здесь больше нет — подтверждение с последствиями происходит на месте.
    window.pfDelArm = function (on) { PF.delArm = !!on; PF.renderPortfolios(); };
    window.pfDeleteYes = function (pid) {
        var p = findPf(pid); if (!p) return;
        PF.store.items = PF.store.items.filter(function (x) { return x.id !== pid; }); saveStore();
        if (PF.openMenu === pid) { PF.openMenu = null; }
        pfxDropPfTab(pid);   // R9: вкладка портфеля и её раскладка уходят вместе с ним
        PF.delArm = false; PF.renderPortfolios(); toast('Портфель удалён');
    };
    // читает форму добавления и записывает актив в модель (БЕЗ ре-рендера/фокуса/тоста).
    // Возвращает {ticker, restocked} если добавлено, иначе null (нет тикера). Общая логика
    // для кнопки «Добавить» и для «Готово» (чтобы заполненный, но не добавленный тикер не пропал).
    function pfReadAddForm(pid) {
        var p = findPf(pid); if (!p) return null;
        var tkEl = dq('pfNewTk-' + pid), tyEl = dq('pfNewType-' + pid), dEl = dq('pfNewDate-' + pid),
            prEl = dq('pfNewPrice-' + pid), nkEl = dq('pfNewNkd-' + pid), qEl = dq('pfNewQty-' + pid);
        var tk = (tkEl && tkEl.value || '').trim().toUpperCase();
        if (!tk) return null;
        var type = (tyEl && tyEl.value) === 'bond' ? 'bond' : 'stock';
        var date = (dEl && dEl.value) || todayStr();
        var price = Math.max(0, toNum(prEl && prEl.value) || 0);
        var qty = Math.max(0, Math.round(toNum(qEl && qEl.value) || 0));
        var nkd = type === 'bond' ? Math.max(0, toNum(nkEl && nkEl.value) || 0) : 0;
        var lot = { id: genId('l'), buyDate: date, buyPrice: price, qty: qty, nkd: nkd, priceFromApi: false, nkdFromApi: false };
        p.holdings = p.holdings || [];
        // тот же тикер уже в портфеле (того же типа) → ДОКУПКА: добавляем лот к активу
        var exist = p.holdings.filter(function (x) { return x.ticker === tk && x.type === type; })[0], restocked = false;
        if (exist) { ensureLots(exist).push(lot); PF.editHold[exist.id] = true; restocked = true; }
        else {
            // потенциал акции фиксируем на дату покупки (текущий ОДХС) — для карточки ребалансировки
            var pot = type === 'stock' ? potentialOf(tk) : null;
            // полное имя — сразу из таблиц (ОФЗ/акции), а не копия тикера
            p.holdings.push({ id: genId('h'), ticker: tk, name: lookupName(tk, type), type: type, lots: [lot], potAtBuy: pot });
        }
        saveStore(); PF.pfInvalidateCharts(pid);
        return { ticker: tk, restocked: restocked };
    }
    window.pfAddHolding = function (pid) {
        var r = pfReadAddForm(pid);
        if (!r) { toast('Введите тикер', true); var t = dq('pfNewTk-' + pid); if (t) try { t.focus(); } catch (e) {} return; }
        if (r.restocked) toast(r.ticker + ': докуплено · +лот');
        ensureQuotes(true); PF.renderPortfolios();
        // фокус обратно на поле тикера для быстрого ввода следующего актива
        var ni = dq('pfNewTk-' + pid); if (ni) try { ni.focus(); } catch (e) {}
    };
    // Автоопределение типа по вводимому тикеру: SU…/RU…/XS… или совпадение с таблицей
    // ОФЗ → «Облигация», тикер из таблицы акций → «Акция». Селект переключается сам
    // (вместе с полем НКД через pfAddTypeToggle) — руками менять тип почти не приходится.
    window.pfNewTkAuto = function (pid) {
        var tkEl = dq('pfNewTk-' + pid), tyEl = dq('pfNewType-' + pid);
        if (!tkEl || !tyEl) return;
        var tk = (tkEl.value || '').trim().toUpperCase();
        if (tk.length < 3) return;
        var t = null;
        if (/^SU\d{2}/.test(tk) || /^RU\d{3}/.test(tk) || /^XS\d/.test(tk)) t = 'bond';
        else if (typeof window.stkFindCompany === 'function' && window.stkFindCompany(tk)) t = 'stock';
        else {
            try { if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++)
                if (bonds[i].t && bonds[i].t.indexOf(tk) === 0) { t = 'bond'; break; } } catch (e) {}
        }
        if (t && tyEl.value !== t) { tyEl.value = t; window.pfAddTypeToggle(pid); }
    };
    // свободные деньги портфеля (кэш): правится в ⚙, пополняется остатком ребалансировок
    window.pfSetCash = function (pid, val) {
        var p = findPf(pid); if (!p) return;
        var n = toNum(val);
        p.cash = (isFinite(n) && n > 0) ? Math.round(n * 100) / 100 : 0;
        saveStore(); PF.renderPortfolios();
    };
    // целевая доля облигаций, %: пусто/не число → выключено (null)
    window.pfSetTarget = function (pid, val) {
        var p = findPf(pid); if (!p) return;
        var s = String(val == null ? '' : val).trim();
        var n = toNum(s);
        p.targetBond = (s !== '' && isFinite(n)) ? clamp(Math.round(n), 0, 100) : null;
        saveStore(); PF.renderPortfolios();
    };
    // Тип в форме добавления: показываем поле НКД только для облигаций (без ре-рендера —
    // чтобы не потерять уже введённые значения).
    window.pfAddTypeToggle = function (pid) {
        var f = dq('pfAddForm-' + pid), ty = dq('pfNewType-' + pid);
        if (f && ty) f.setAttribute('data-type', ty.value === 'bond' ? 'bond' : 'stock');
    };
    // Подтянуть цену/НКД закрытия MOEX на выбранную дату ПРЯМО в форму добавления.
    // Пишем значение в input напрямую (без PF.renderPortfolios), иначе введённые поля сбросятся.
    window.pfAddFetch = function (pid, field, ev) {
        var btn = ev && ev.currentTarget;
        var tk = ((dq('pfNewTk-' + pid) || {}).value || '').trim().toUpperCase();
        var date = (dq('pfNewDate-' + pid) || {}).value || '';
        var type = ((dq('pfNewType-' + pid) || {}).value) === 'bond' ? 'bond' : 'stock';
        if (!tk) { toast('Сначала введите тикер', true); return; }
        if (!date) { toast('Укажите дату покупки', true); return; }
        if (field === 'nkd' && type !== 'bond') return;
        var input = dq(field === 'nkd' ? 'pfNewNkd-' + pid : 'pfNewPrice-' + pid);
        if (btn) { btn.classList.remove('lit', 'done'); btn.classList.add('loading'); btn.innerHTML = '<span class="pfm-fx-sp"></span>'; }
        function fin(v) {
            if (btn) btn.classList.remove('loading');
            if (v != null && v >= 0) {
                if (input) input.value = Math.round(v * 100) / 100;
                if (btn) { btn.classList.add('done'); btn.innerHTML = PF.FETCH_SVG;
                    btn.title = (field === 'nkd' ? 'НКД' : 'Цена') + ' закрытия на ' + ruDate(date) + ' · нажмите, чтобы обновить'; }
                toast(tk + ': ' + (field === 'nkd' ? 'НКД ' : '') + fmtPrice(v) + ' на ' + ruDate(date));
            } else {
                if (btn) { btn.classList.add('lit'); btn.innerHTML = PF.FETCH_SVG; }
                toast('Нет ' + (field === 'nkd' ? 'НКД' : 'цены') + ' ' + tk + ' на ' + ruDate(date), true);
            }
        }
        if (field === 'nkd') lookupHistNkd(tk, date, fin);
        else lookupHistPrice(tk, type, date, function (p) { fin(p && p > 0 ? p : null); });
    };
    window.pfRemoveHolding = function (pid, hid) {
        var p = findPf(pid); if (!p) return;
        p.holdings = (p.holdings || []).filter(function (h) { return h.id !== hid; });
        delete PF.editHold[hid]; saveStore(); PF.pfInvalidateCharts(pid); PF.renderPortfolios();
    };
    window.pfEdit = function (pid, hid, field, val) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        if (field === 'ticker') {
            h.ticker = (val || '').trim().toUpperCase(); h.name = lookupName(h.ticker, h.type);
            // сменился тикер → старые цены/НКД лотов не на этот тикер: гасим флаги «с API»
            ensureLots(h).forEach(function (l) { l.priceFromApi = false; l.nkdFromApi = false;
                delete PF.loadStatus[l.id + ':price']; delete PF.loadStatus[l.id + ':nkd']; });
        }
        saveStore(); PF.pfInvalidateCharts(pid); ensureQuotes(); PF.renderPortfolios();
    };
    // ---- журнал лотов: правка/добавление/удаление отдельных покупок ----
    function findLot(h, lotId) { var ls = ensureLots(h); for (var i = 0; i < ls.length; i++) if (ls[i].id === lotId) return ls[i]; return null; }
    window.pfEditLot = function (pid, hid, lotId, field, val) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        var l = findLot(h, lotId); if (!l) return;
        if (field === 'buyDate') { l.buyDate = val; l.priceFromApi = false; l.nkdFromApi = false; delete PF.loadStatus[lotId + ':price']; delete PF.loadStatus[lotId + ':nkd']; }
        else if (field === 'buyPrice') { l.buyPrice = Math.max(0, toNum(val) || 0); l.priceFromApi = false; delete PF.loadStatus[lotId + ':price']; }
        else if (field === 'nkd') { l.nkd = Math.max(0, toNum(val) || 0); l.nkdFromApi = false; delete PF.loadStatus[lotId + ':nkd']; }
        else if (field === 'qty') { l.qty = Math.max(0, Math.round(toNum(val) || 0)); }
        saveStore(); PF.pfInvalidateCharts(pid); ensureQuotes(); PF.renderPortfolios();
    };
    window.pfAddLot = function (pid, hid) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        ensureLots(h).push({ id: genId('l'), buyDate: todayStr(), buyPrice: 0, qty: 0, nkd: 0, priceFromApi: false, nkdFromApi: false });
        PF.editHold[hid] = true; saveStore(); PF.pfInvalidateCharts(pid); PF.renderPortfolios();
    };
    window.pfRemoveLot = function (pid, hid, lotId) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        var ls = ensureLots(h);
        if (ls.length <= 1) return;   // последний лот не удаляем — есть «Удалить актив»
        h.lots = ls.filter(function (l) { return l.id !== lotId; });
        saveStore(); PF.pfInvalidateCharts(pid); ensureQuotes(); PF.renderPortfolios();
    };
    // клик по строке состава в настройках → раскрыть/свернуть редактор этого актива
    window.pfMenuRowToggle = function (pid, hid) {
        if (PF.editHold[hid]) delete PF.editHold[hid]; else PF.editHold[hid] = true;
        PF.renderPortfolios();
    };
    // свернуть/раскрыть форму «Добавить актив» (при раскрытии — фокус на поле тикера)
    window.pfAddToggle = function (pid) {
        PF.addOpen = !PF.addOpen; PF.renderPortfolios();
        if (PF.addOpen) { var el = dq('pfNewTk-' + pid); if (el) try { el.focus(); } catch (e) {} }
    };
    // палитра цвета в шапке настроек (точка-кнопка); закрывается кликом мимо — см. ниже
    window.pfColorsToggle = function () { PF.colorsOpen = !PF.colorsOpen; PF.renderPortfolios(); };
    document.addEventListener('click', function (e) {
        if (!PF.colorsOpen) return;
        if (e.target && e.target.closest && e.target.closest('.pfm-colorwrap')) return;
        PF.colorsOpen = false; PF.renderPortfolios();
    });
    // Подтянуть цену/НКД закрытия на дату КОНКРЕТНОГО лота
    window.pfFetchLotField = function (pid, hid, lotId, field) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid);
        if (!h || !h.ticker) { toast('Сначала укажите тикер', true); return; }
        var l = findLot(h, lotId); if (!l) return;
        if (!l.buyDate) { toast('Укажите дату лота', true); return; }
        if (field === 'nkd' && h.type !== 'bond') return;
        PF.loadStatus[lotId + ':' + field] = 'loading'; PF.renderPortfolios();
        var done = function (v) {
            var cp = findPf(pid), ch = cp && findHold(cp, hid), cl = ch && findLot(ch, lotId);
            if (!cl) return;
            delete PF.loadStatus[lotId + ':' + field];
            if (v != null && v >= 0) {
                if (field === 'nkd') { cl.nkd = Math.round(v * 100) / 100; cl.nkdFromApi = true; }
                else { cl.buyPrice = Math.round(v * 100) / 100; cl.priceFromApi = true; }
                saveStore(); PF.pfInvalidateCharts(pid); PF.renderPortfolios();
                toast(h.ticker + ': ' + (field === 'nkd' ? 'НКД ' : '') + fmtPrice(v) + ' на ' + ruDate(cl.buyDate));
            } else { PF.renderPortfolios(); toast('Нет ' + (field === 'nkd' ? 'НКД' : 'цены') + ' ' + h.ticker + ' на ' + ruDate(l.buyDate), true); }
        };
        if (field === 'nkd') lookupHistNkd(h.ticker, l.buyDate, done);
        else lookupHistPrice(h.ticker, h.type, l.buyDate, function (price) { done(price && price > 0 ? price : null); });
    };
    window.pfOpenTicker = function (tk) { if (typeof window.openStockDetail === 'function') { try { window.openStockDetail(tk, 1); } catch (e) {} } };
    // Инлайн-правка имени портфеля: клик по названию → поле ввода на месте (Enter/blur — сохранить, Esc — отмена)
    window.pfNameEdit = function (pid, ev) {
        if (ev) { ev.stopPropagation(); }
        var p = findPf(pid); if (!p) return;
        var host = ev && ev.currentTarget; if (!host || host._editing) return;
        host._editing = true;
        var inp = document.createElement('input');
        // 24 символа — максимум, при котором название гарантированно влезает в шапку
        // карточки и сетка не расползается
        inp.className = 'pfc-name-edit'; inp.value = p.name; inp.maxLength = 24;
        host.innerHTML = ''; host.appendChild(inp);
        try { inp.focus(); inp.select(); } catch (e) {}
        var committed = false;
        function commit(save) {
            if (committed) return; committed = true;
            if (save) { var v = (inp.value || '').trim().slice(0, 24); if (v) { p.name = v; saveStore(); } }
            PF.renderPortfolios();
        }
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(true); }
            else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
        });
        inp.addEventListener('blur', function () { commit(true); });
    };


    // ==================================================================
    //  ИНТЕРФЕЙС КАРТОЧЕК (window.PF)
    // ==================================================================
    // Состояние шторки настроек (PF.openMenu и др.) и PF.pfNoScrollKeep
    // объявлены в каркасе рендера свойствами PF — алиасы запрещены.
    PF.XMARK_SVG = XMARK_SVG; PF.assetDisplayName = assetDisplayName; PF.cardHtml = cardHtml; PF.closeImpMenus = closeImpMenus;
    PF.ensureDefaultImoexFlags = ensureDefaultImoexFlags; PF.menuHtml = menuHtml; PF.paintPfChartMini = paintPfChartMini; PF.pfCardHead = pfCardHead;
    PF.pfConfirm = pfConfirm; PF.pfImpOutside = pfImpOutside; PF.repaintMiniCharts = repaintMiniCharts;
})();
