// ===== «ПОРТФЕЛИ» · КАРТОЧКИ И ДЕЙСТВИЯ (модуль цепочки #pfLazySrc) =====
// Карточка портфеля (cardHtml: герой с графиком за период, KPI-полоса,
// полоса распределения, таблица позиций по доле — макет 2026-07-21),
// шторка настроек ⚙ (menuHtml: правка состава, палитра,
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
    var calcPf = PF.calcPf, clamp = PF.clamp, colorVal = PF.colorVal, compositionFrom = PF.compositionFrom, dayDelta = PF.dayDelta, dq = PF.dq, jsArg = PF.jsArg;
    var drawPfChart = PF.drawPfChart, ensureLots = PF.ensureLots, ensureQuotes = PF.ensureQuotes, esc = PF.esc, findHold = PF.findHold, findPf = PF.findPf;
    var fmtPct = PF.fmtPct, fmtPrice = PF.fmtPrice, fmtQty = PF.fmtQty, fmtRub = PF.fmtRub, genId = PF.genId, importName = PF.importName;
    var loadPfChart = PF.loadPfChart, lookupHistNkd = PF.lookupHistNkd, lookupHistPrice = PF.lookupHistPrice, makePortfolio = PF.makePortfolio, noQuoteCell = PF.noQuoteCell, pad2 = PF.pad2;
    var pfAllBoughtToday = PF.pfAllBoughtToday, pfCardWarming = PF.pfCardWarming, pfFirstBuyDate = PF.pfFirstBuyDate, pfParseAnyDate = PF.pfParseAnyDate, quoteMissing = PF.quoteMissing, quotes = PF.quotes;
    var ruDate = PF.ruDate, saveStore = PF.saveStore, skelHtml = PF.skelHtml, toNum = PF.toNum, toast = PF.toast, todayStr = PF.todayStr;
    var visibleItems = PF.visibleItems;
    // импорт конструктора (portfolios-dash.js, уже загружен):
    var DASH_KEY = PF.DASH_KEY, dashCfgFor = PF.dashCfgFor, saveDashCfg = PF.saveDashCfg;
    // импорт виджетов и подвкладок (уже загружены):
    var potentialOf = PF.potentialOf, pfxActivateTab = PF.pfxActivateTab, pfxDropPfTab = PF.pfxDropPfTab, pfxFlashBlock = PF.pfxFlashBlock, pfxGoOverviewFor = PF.pfxGoOverviewFor, pfxOpenPfTabs = PF.pfxOpenPfTabs;
    var pfxSaveOpenTabs = PF.pfxSaveOpenTabs, pfxWide = PF.pfxWide;
    // ---- мини-график доходности в герое карточки ----
    // Переиспользует drawPfChart (тот же компонент, что и большой график): кривая
    // доходности с ОКНОМ по выбранному периоду карточки (PF.cardRange) и подписанной
    // шкалой процентов — серия стоимости у нас живёт только как доходность, поэтому
    // ось честно подписана, а не спрятана. После перерисовки дописывает дельту
    // периода в герое (patchHeroInc): серия приходит с MOEX асинхронно, к моменту
    // рендера карточки её может ещё не быть.
    function paintPfChartMini(pid) {
        drawPfChart(pid, dq('pfmChart-' + pid), null, null, pid + 'm', 16, cardRangeFrom(pid));
        patchHeroInc(pid);
    }
    // на каждый видимый портфель — своя загрузка/перерисовка мини-графика (переиспользует loadPfChart)
    function repaintMiniCharts() {
        visibleItems().forEach(function (p) {
            if (dq('pfmChart-' + p.id)) loadPfChart(p.id);
        });
    }

    // ---- период карточки: 30д / Год / Всё ----
    // Правило: период, для которого нет данных, не показываем вовсе (а не пустым) —
    // у портфеля моложе месяца остаётся только «Всё», «Год» появляется после года
    // владения. Сегмента «День» нет сознательно (решение 2026-07-21): внутридневных
    // точек в проекте нет, дневная дельта стоит отдельным KPI «За день».
    // Выбор живёт в памяти сессии и не персистится.
    PF.cardRange = {};   // pid → '30' | '365' | 'all'
    var RANGE_LBL = { '30': 'за 30 дней', '365': 'за год', 'all': 'за всё время' };
    function pfAgeDays(p) { return (Date.now() - pfFirstBuyDate(p).getTime()) / 864e5; }
    function cardRanges(p) {
        var age = pfAgeDays(p), r = [];
        if (age > 30) r.push(['30', '30д']);
        if (age > 365) r.push(['365', 'Год']);
        r.push(['all', 'Всё']);
        return r;
    }
    function cardRangeOf(p) {
        var r = PF.cardRange[p.id];
        if (!cardRanges(p).some(function (x) { return x[0] === r; })) r = pfAgeDays(p) > 30 ? '30' : 'all';
        return r;
    }
    // начало окна периода ISO-датой; null = вся история (график без фильтра)
    function cardRangeFrom(pid) {
        var p = findPf(pid); if (!p) return null;
        var r = cardRangeOf(p); if (r === 'all') return null;
        var d = new Date(); d.setDate(d.getDate() - +r);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    // переключатель периода переиспользует контрол настроек виджетов (.pfdcfg-seg-b),
    // а не рисует свой; модификатор .pfc-seg лишь ужимает его до шапки карточки
    function cardSegHtml(p, cur, ranges) {
        if (ranges.length < 2) return '';   // один доступный период — переключать нечего
        return '<span class="pfdcfg-seg pfc-seg" data-pid="' + p.id + '">' + ranges.map(function (x) {
            return '<button type="button" class="pfdcfg-seg-b' + (x[0] === cur ? ' on' : '') + '" data-r="' + x[0] +
                '" onclick="pfCardRange(\'' + p.id + '\',\'' + x[0] + '\')">' + x[1] + '</button>';
        }).join('') + '</span>';
    }
    // смена периода: точечно (подсветка сегментов + перерисовка графика и дельты
    // ЭТОЙ карточки), без PF.renderPortfolios — полный своп мигает всеми графиками
    window.pfCardRange = function (pid, r) {
        PF.cardRange[pid] = r;
        Array.prototype.forEach.call(document.querySelectorAll('.pfc-seg[data-pid="' + pid + '"] .pfdcfg-seg-b'), function (b) {
            b.classList.toggle('on', b.getAttribute('data-r') === r);
        });
        loadPfChart(pid);        // из кеша рисует синхронно, иначе догрузит и перерисует
        paintPfChartMini(pid);   // окно нового периода сразу (не ждём тика котировок)
    };

    // ---- герой: сумма ступенями кегля + дельта за период ----
    // Кегль по ЧИСЛУ ЦИФР (≤7 → 38px, 8–10 → 30px, 11+ → 25px), НЕ по scrollWidth:
    // при zoom 0.9 замеры врут (ловушка виджетов). Знак ₽ в <small> — доля кегля,
    // уменьшается вместе с числом.
    function heroValParts(v) {
        var s = fmtRub(v);   // '200 982 ₽' → число отдельно, ₽ мельче рядом
        var digits = s.replace(/\D/g, '').length;
        return { cls: digits >= 11 ? ' l13' : digits >= 8 ? ' l10' : '',
            html: s.slice(0, -2) + '<small> ₽</small>' };
    }
    // дельта под суммой следует за периодом: «за всё время» — живые c.pnl/pnlPct,
    // окна 30д/год — по chartRaw[pid].series: изменение ПРИБЫЛИ за окно (докупка —
    // довнесение капитала, а не рост), процент — к стоимости на начало окна.
    // Пока серия не пришла с MOEX — «…», допишет patchHeroInc после загрузки.
    function heroIncParts(p, c) {
        var r = cardRangeOf(p), lbl = ' <u>' + RANGE_LBL[r] + '</u>';
        var dRub = null, dPct = null;
        if (r === 'all') { dRub = c.pnl; dPct = c.pnlPct; }
        else {
            var raw = PF.chartRaw[p.id], from = cardRangeFrom(p.id), q = null;
            if (raw && raw.series) for (var i = 0; i < raw.series.length; i++) { if (raw.series[i].d >= from) { q = raw.series[i]; break; } }
            if (q) { dRub = c.pnl - (q.c - q.inv); dPct = q.c > 0 ? dRub / q.c * 100 : null; }
        }
        if (dRub == null) return { cls: 'pfc-hero-inc', html: '…' + lbl };
        var pos = dRub >= 0;
        return { cls: 'pfc-hero-inc ' + (pos ? 'pos' : 'neg'),
            html: (pos ? '▲ ' : '▼ ') + fmtRub(Math.abs(dRub)) +
                (dPct != null ? ' (' + fmtPct(Math.abs(dPct)).replace('+', '') + ')' : '') + lbl };
    }
    function patchHeroInc(pid) {
        var p = findPf(pid); if (!p || pfCardWarming(p) || !(p.holdings || []).length) return;
        var inc = heroIncParts(p, calcPf(p));
        PF.liveSet('pfc:' + pid + ':inc', { html: inc.html, cls: inc.cls });
    }
    function signRub(n) { return (n >= 0 ? '+' : '−') + fmtRub(Math.abs(n)); }
    var CHEVR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

    // подсказка KPI «Доходность»: одна строка на разметку И точечный патчер
    // (livePatchers.cards) — чтобы текст не разъезжался между ними
    var YIELD_TIP = 'Доходность за всё время владения. Годовые (CAGR) показываем только после года владения: до этого annualize() их не экстраполирует и они совпали бы с фактическим процентом';
    // Подпись под «Доходностью». Годовые имеют смысл только после ГОДА владения:
    // annualize() держит floor 365 дней (иначе −18% за месяц дали бы −90% годовых),
    // поэтому на сроке меньше года CAGR РАВЕН фактическому проценту — и подпись
    // «−15,5% годовых» под значением «−15,5%» была бы дублем, ровно тем, за который
    // мокап критиковал исходный макет.
    function yieldSubText(c, days, allToday) {
        // «за 1 день» здесь не пишем: ровно та же подпись стоит у соседнего «Дохода»,
        // и две одинаковые строки подряд читаются как ошибка вёрстки
        if (allToday) return 'годовых пока нет';
        if (days >= 365 && c.annual != null) return fmtPct(c.annual) + ' годовых';
        return 'за весь срок';
    }
    // Разметка карточки ОДНА на любую ширину: под размер её подгоняет CSS по
    // ФАКТИЧЕСКОЙ ширине самой карточки (@container в portfolios.css), а не по флагу
    // сетки. Раньше «узость» приходила параметром от раскладки (3-в-ряд ⇒ narrow), и
    // карточка 465px на «Обзоре» сворачивала KPI в 2×2 и мельчила таблицу, хотя места
    // хватало. Правило проекта: контент подстраивается под размер виджета.
    function cardHtml(p) {
        var c = calcPf(p), ac = colorVal(p.color);
        var warm = pfCardWarming(p);   // котировки ещё греются → живые числа скелетонами
        // R9.1: когда настройки открыты ШТОРКОЙ (PF.pfSetDrawerOn), карточное меню не
        // рендерим — иначе на странице два .pfc-menu с ОДИНАКОВЫМИ id полей формы
        var menuOn = PF.openMenu === p.id && !PF.pfSetDrawerOn;
        var menu = menuOn ? menuHtml(p) : '';
        // настройки всегда раскрыты «во всю высоту» — полный список без внутреннего скролла
        var tall = menuOn ? ' pf-card--tall' : '';
        var cash = +p.cash > 0 ? +p.cash : 0;
        var fullV = c.value + cash;   // стоимость портфеля = бумаги + свободные деньги
        var hasHold = c.hs.length > 0;
        var isBrk = !!p.broker;
        // краевые состояния (блок 3): всё куплено сегодня — истории ещё нет физически;
        // нет котировки — curPriceInfo молча падает на цену покупки, и итог врёт.
        // Во время прогрева про котировки не говорим: там «нет цены» — норма.
        var allToday = hasHold && pfAllBoughtToday(p.id);
        var noQuotes = !warm && c.hs.filter(function (x) { return x.c.curSrc === 'buy' && x.c.qty > 0; });
        var noQuoteN = noQuotes ? noQuotes.length : 0;

        // шапка: имя (цветовая метка + сериф) · бейдж брокера · метки состояния ·
        // период · копировать/скрыть/⚙
        var flags = (isBrk ? '<span class="pfc-flag" title="Состав приходит от брокера и перезаписывается при каждом обновлении — ручные правки здесь не сохранятся">Только чтение</span>' : '') +
            (p.hidden ? '<span class="pfc-flag" title="Карточка убрана с «Обзора». В капитале, «Списке портфелей» и аналитике портфель считается как обычно">Скрыт</span>' : '') +
            // индикатор режима «Скрывать суммы»: размытые числа иначе неотличимы от
            // скелетонов прогрева. Рисуем ВСЕГДА, показывает CSS по body.sums-hidden —
            // так переключение тумблера не требует ре-рендера карточек
            '<span class="pfc-flag pfc-flag--priv" title="Включён режим «Скрывать суммы» (личный кабинет). Цены Мосбиржи и проценты остаются открытыми — прячем только ваши деньги">' +
                PF.EYEOFF_SVG + 'Суммы скрыты</span>';
        var top = '<div class="pfc-top">' +
            '<div class="pfc-titles">' +
                '<span class="pfc-name" onclick="pfNameEdit(\'' + p.id + '\',event)" title="Нажмите, чтобы переименовать"><em class="pfc-name-dot"></em><span class="pfc-name-ink">' + esc(p.name) + '</span></span>' +
                // бейдж брокерской карточки (№10): PF.* в момент вызова — файл
                // portfolios-broker-pf.js грузится ПОСЛЕ этого
                (isBrk && PF.brokerPfBadgeHtml ? PF.brokerPfBadgeHtml(p) : '') + flags +
            '</div>' +
            '<div class="pfc-ctrls">' +
                (hasHold ? cardSegHtml(p, cardRangeOf(p), cardRanges(p)) : '') +
                // .pfc-act--sec — служебные иконки, которые в узкой карточке уходят
                // первыми (см. @container): шестерёнка остаётся всегда
                '<div class="pfc-acts">' +
                    '<button class="pfc-act pfc-act--sec" onclick="pfCopyComposition(\'' + p.id + '\',event)" aria-label="Скопировать состав" title="Скопировать состав портфеля">' + PF.COPY_SVG + '</button>' +
                    '<button class="pfc-act pfc-act--sec' + (p.hidden ? ' on' : '') + '" onclick="pfToggleHidden(\'' + p.id + '\',event)" aria-label="' + (p.hidden ? 'Показать на «Обзоре»' : 'Убрать карточку с «Обзора»') + '" title="' + (p.hidden ? 'Вернуть карточку на «Обзор»' : 'Убрать карточку с «Обзора» — портфель останется в сводках, его вкладка не закроется') + '">' + PF.EYEOFF_SVG + '</button>' +
                    '<button class="pfc-act' + (menuOn ? ' on' : '') + '" onclick="pfToggleMenu(\'' + p.id + '\')" aria-label="Настройки" title="Настройки">' + PF.GEAR_SVG + '</button>' +
                '</div>' +
            '</div>' +
        '</div>';

        // герой: колонки 46% / остаток — длинное число меняет свой кегль, а не жмёт график
        var vh = heroValParts(fullV);
        var inc;
        if (!hasHold) inc = { cls: 'pfc-hero-inc', html: '<u>пока нечего считать</u>' };
        else if (allToday) inc = { cls: 'pfc-hero-inc', html: '<span class="pfc-dash">—</span><u>куплено сегодня</u>' };
        else inc = warm ? null : heroIncParts(p, c);
        // график: пока нет ни одного закрытого торгового дня кривой не существует
        // физически — вместо пустого поля объясняем, чего ждём (drawPfChart нарисовал
        // бы то же сообщение, но только после круга запросов к MOEX)
        var chartCell = (!hasHold || allToday)
            ? '<div class="pfc-nochart">' + (hasHold
                ? 'Кривая появится завтра:<br>нужен хотя бы один закрытый торговый день'
                : 'График появится после первой покупки') + '</div>'
            : '<div class="pfc-mchart-plot" id="pfmChart-' + p.id + '"></div>';
        var hero = '<div class="pfc-hero">' +
            '<div class="pfc-hero-l">' +
                '<span class="pfc-hero-k">Стоимость портфеля</span>' +
                // data-live: фоновый тик котировок переписывает эти узлы точечно
                // (livePatchers.cards ниже) — включая замену скелетонов прогрева числами
                (warm ? '<span class="pfc-hero-val" data-live="pfc:' + p.id + ':val">' + skelHtml(180, 30) + '</span>' +
                        '<span class="pfc-hero-inc" data-live="pfc:' + p.id + ':inc">' + skelHtml(128, 13) + '</span>'
                      : '<span class="pfc-hero-val' + vh.cls + '" data-money data-live="pfc:' + p.id + ':val">' + vh.html + '</span>' +
                        '<span class="' + inc.cls + '" data-money data-live="pfc:' + p.id + ':inc">' + inc.html + '</span>') +
            '</div>' + chartCell +
        '</div>';

        var head = '<div class="dash2-card pf-card' + (menuOn ? ' menu-open' : '') + tall +
            (p.hidden ? ' pf-card--dim' : '') + '" style="--pf-accent:' + ac + '" data-pfid="' + p.id + '">';

        // ПУСТОЙ ПОРТФЕЛЬ: обрывается сразу после героя — KPI, полосы и таблицы нет
        // вовсе (делить на ноль нечего, а четыре прочерка подряд читаются как поломка).
        // Вместо них объяснение и два входа: вручную и импортом.
        if (!hasHold) {
            var blank = isBrk
                ? '<div class="pfc-blank"><h5>На счёте пока нет бумаг</h5>' +
                    '<p>Позиции появятся здесь сами после первой покупки у брокера — состав приходит из Т-Инвестиций.</p></div>'
                : '<div class="pfc-blank"><h5>В портфеле пока нет бумаг</h5>' +
                    '<p>Добавьте первую покупку вручную или подтяните состав из брокера — тогда появятся и доход, и распределение.</p>' +
                    '<div class="pfc-blank-row">' +
                        '<button class="pfc-rebal" onclick="pfToggleMenu(\'' + p.id + '\')">Добавить бумагу</button>' +
                        // тот же вход, что в меню «Импорт» шапки: создаёт/показывает
                        // карточку счёта Т-Инвестиций (визард .bk-*, №10)
                        '<button class="pfc-mact" onclick="pfBrokerPfImport()">Импорт из брокера</button>' +
                    '</div></div>';
            return head + top + menu + '<div class="pfc-normal">' + hero + blank + '</div></div>';
        }

        // KPI-полоса: четыре РАЗНЫХ числа, третья строка каждой ячейки — тоже число
        // data-live: «Доход»/«Доходность»/«За день» обновляются точечным тиком
        var kpis;
        if (warm) {
            kpis = '<div class="pfc-stats2">' + ['Вложено', 'Доход', 'Доходность', 'За день'].map(function (k) {
                return '<div class="pfc-stat2"><span class="pfc-stat2-l">' + k + '</span><span class="pfc-stat2-v">' + skelHtml(84, 16) + '</span><span class="pfc-stat2-s">' + skelHtml(58, 11) + '</span></div>';
            }).join('') + '</div>';
        } else {
            var days = Math.max(1, Math.floor(pfAgeDays(p)));
            var dd = allToday ? null : dayDelta(p, c.value);
            var ddPct = dd != null && c.value - dd > 0 ? dd / (c.value - dd) * 100 : null;
            // «Куплено сегодня»: доход уже есть (цена ушла от цены покупки), а вчерашнего
            // снимка в snaps ещё не существует — прочерк и словами, чего ждём.
            // Прочерк честнее нуля: ноль читался бы как «не изменилось».
            var daySub = allToday ? 'нет вчерашней цены' : (dd == null ? 'нет вчерашней цены' : (ddPct != null ? fmtPct(ddPct) + ' сегодня' : 'сегодня'));
            kpis = '<div class="pfc-stats2">' +
                '<div class="pfc-stat2"><span class="pfc-stat2-l">Вложено</span><span class="pfc-stat2-v" data-money>' + fmtRub(c.invested) + '</span><span class="pfc-stat2-s" data-money>' + fmtRub(cash) + ' свободно</span></div>' +
                '<div class="pfc-stat2"><span class="pfc-stat2-l">Доход</span><span class="pfc-stat2-v ' + (c.pnl >= 0 ? 'pos' : 'neg') + '" data-money data-live="pfc:' + p.id + ':pnl">' + signRub(c.pnl) + '</span><span class="pfc-stat2-s">за ' + days + ' ' + PF.plural(days, 'день', 'дня', 'дней') + '</span></div>' +
                '<div class="pfc-stat2" title="' + YIELD_TIP + '"><span class="pfc-stat2-l">Доходность</span><span class="pfc-stat2-v ' + (c.pnlPct >= 0 ? 'pos' : 'neg') + '" data-live="pfc:' + p.id + ':yield">' + fmtPct(c.pnlPct) + '</span><span class="pfc-stat2-s" data-live="pfc:' + p.id + ':ysub">' + yieldSubText(c, days, allToday) + '</span></div>' +
                '<div class="pfc-stat2"><span class="pfc-stat2-l">За день</span><span class="pfc-stat2-v' + (dd == null ? ' pfc-dash' : (dd >= 0 ? ' pos' : ' neg')) + '" data-money data-live="pfc:' + p.id + ':day">' + (dd == null ? '—' : signRub(dd)) + '</span><span class="pfc-stat2-s" data-live="pfc:' + p.id + ':dsub">' + daySub + '</span></div>' +
            '</div>';
        }

        // плашки над списком: по одной на состояние, тихие и объясняющие ПОСЛЕДСТВИЕ,
        // а не факт («итог занижен», «правки не сохранятся», «из расчётов не выпал»)
        var warns = '';
        if (noQuoteN) {
            warns += '<div class="pfc-warn"><i>!</i><span>' +
                (noQuoteN === 1 ? 'По одной бумаге биржа не отдала цену. Её стоимость считаем <b>по цене покупки</b>'
                                : 'По ' + noQuoteN + ' ' + PF.plural(noQuoteN, 'бумаге', 'бумагам', 'бумагам') + ' биржа не отдала цену. Их стоимость считаем <b>по цене покупки</b>') +
                ', поэтому итог неточен.</span></div>';
        }
        if (isBrk) {
            warns += '<div class="pfc-warn quiet"><i>↺</i><span>Состав приходит от брокера и <b>перезаписывается при каждом обновлении</b>. Ручные правки здесь не сохранятся — докупку и продажу делайте в «Торговле».</span></div>';
        }
        if (p.hidden) {
            warns += '<div class="pfc-warn quiet"><i>◍</i><span>Портфель скрыт с «Обзора», но <b>из расчётов не выпал</b>: капитал, «Список портфелей» и аналитика считают его как обычно.</span></div>';
        }

        // позиции: порядок по ДОЛЕ (рядом колонка «Доля» и полоса-стек сверху —
        // список, где вес идёт вразнобой, спорил бы сам с собой); доходность
        // никуда не делась — она в своей колонке «Изм.»
        var list = c.hs.slice().sort(function (a, b) { return b.c.value - a.c.value; });
        // Блок 5: в конструкторе с заданной вручную высотой список РАСТЯГИВАЕТСЯ на
        // остаток блока (CSS .pfd-hset ниже), поэтому считать число строк в JS не
        // нужно — вычислять «хром» карточки формулой значило бы держать в коде
        // магическое число, которое разъедется от любой правки вёрстки.
        var pos = warns +
            '<div class="pfc-pos-h"><span class="pfc-pos-t">Позиции</span><span class="pfc-cnt">' + c.hs.length + '</span></div>' +
            '<div class="pfc-massets" data-skey="ma-' + p.id + '">' + pfMiniTableHtml(list, p.id, fullV, warm) + '</div>';

        // подвал: «Все позиции» → подвкладка портфеля, «Ребаланс» — прежний pfExpand.
        // Счётчик в кнопке показывается только в узкой карточке (@container), где
        // колонка «Доля» скрыта и вес состава иначе не прочесть.
        // У скрытой карточки главное действие — вернуть её на «Обзор».
        var foot = '<div class="pfc-foot">' +
            '<button class="pfc-all" onclick="pfxOpenPf(\'' + p.id + '\')"><span>Все позиции<i class="pfc-all-n">' + c.hs.length + '</i></span>' + CHEVR_SVG + '</button>' +
            (p.hidden
                ? '<button class="pfc-rebal" onclick="pfToggleHidden(\'' + p.id + '\',event)">Показать на «Обзоре»</button>'
                : '<button class="pfc-rebal" onclick="pfExpand(\'' + p.id + '\')">' + PF.REBAL_SVG + 'Ребаланс</button>') +
        '</div>';

        // data-pfid — адрес карточки для прокрутки «покажи счёт» (scrollToCard в
        // portfolios-broker-pf.js работает и в классической сетке, не только в конструкторе)
        return head +
            top + menu +
            '<div class="pfc-normal">' +
                hero + kpis + distHtml(p, c, fullV, cash) + pos +
                // тихая строка «вне трекера: N позиций · X ₽» — прочие типы со счёта брокера
                (isBrk && PF.brokerPfExtraHtml ? PF.brokerPfExtraHtml(p) : '') +
                foot +
            '</div>' +
        '</div>';
    }

    // ---- полоса распределения: акции · облигации · свободные деньги ----
    // Одна краска в трёх плотностях (цвет остаётся за знаком дохода и CTA), доли —
    // от ПОЛНОЙ стоимости вместе с кэшем, иначе проценты не сходятся с суммой в герое.
    // Метка цели p.targetBond и подсказка отклонения СОХРАНЕНЫ с прежней полосы
    // (решение 2026-07-21): цель задаётся в ⚙ и завязана на «Ребаланс»; сама цель
    // по-прежнему считается как доля облигаций от БУМАГ (bondPct) — семантику
    // ребаланса переделка не трогает, метка лишь спроецирована в координаты полосы.
    function distHtml(p, c, fullV, cash) {
        if (!(fullV > 0)) return '';
        var segs = [
            { k: 's1', n: 'Акции', v: c.stockVal },
            { k: 's2', n: 'Облигации', v: c.bondVal },
            { k: 's3', n: 'Свободно', v: cash }
        ].filter(function (s) { return s.v > 0.005; });
        var bar = segs.map(function (s) { return '<i class="' + s.k + '" style="flex:' + (s.v / fullV * 100).toFixed(2) + '"></i>'; }).join('');
        var leg = segs.map(function (s) {
            return '<span><em class="' + s.k + '"></em>' + s.n + ' <b>' + (s.v / fullV * 100).toFixed(1).replace('.', ',') + '%</b></span>';
        }).join('');
        var tgt = (p.targetBond != null && isFinite(+p.targetBond)) ? clamp(Math.round(+p.targetBond), 0, 100) : null;
        var marker = '', hint = '';
        if (tgt != null && c.value > 0) {
            // граница «акции|облигации» при точном попадании в цель: (100−tgt)% от бумаг,
            // в координатах полосы — умноженные на долю бумаг в полной стоимости
            marker = '<i class="pfc-dist-tgt" style="left:' + ((100 - tgt) * c.value / fullV).toFixed(2) + '%" title="Цель: облигации ' + tgt + '%"></i>';
            // Строка цели (переверстана 2026-07-22: прежний вариант — сплошной
            // оранжевый текст — читался как ошибка и рвался на строки, отрывая
            // сумму). Теперь три части в одном ряду: метка «Цель», отклонение и
            // действие с суммой; ряд не переносится вразнобой, сумма не отрывается.
            var dev = c.bondPct - tgt;
            if (Math.abs(dev) < 3) {
                hint = '<div class="pfc-tgt ok"><span class="pfc-tgt-k">' + PF.CHECK_SVG + 'Цель ' + tgt + '%</span>' +
                    '<span class="pfc-tgt-t">структура в балансе</span></div>';
            } else {
                var need = null, what = '';
                if (dev > 0 && tgt > 0) { var needS = c.bondVal * 100 / tgt - c.value; if (needS > 1) { need = needS; what = 'акций'; } }
                else if (dev < 0 && tgt < 100) { var needB = c.stockVal * 100 / (100 - tgt) - c.value; if (needB > 1) { need = needB; what = 'облигаций'; } }
                // сумма помечена как деньги ЯВНО: текст строки длиннее 40 символов,
                // и правило «лист с ₽» модуля приватности его не ловит (isMoneyLeaf)
                hint = '<div class="pfc-tgt off" title="Отклонение от целевой структуры (цель — ' + tgt + '% облигаций). Сумма — сколько докупить недостающего класса, чтобы вернуться к цели без продаж">' +
                    '<span class="pfc-tgt-k">Цель ' + tgt + '%</span>' +
                    '<span class="pfc-tgt-t">облигаций на ' + Math.abs(dev).toFixed(0) + ' п.п. ' + (dev > 0 ? 'больше' : 'меньше') + '</span>' +
                    (need != null ? '<span class="pfc-tgt-b">докупить ' + what + ' <b data-money>~' + fmtRub(need) + '</b></span>' : '') +
                '</div>';
            }
        }
        return '<div class="pfc-alloc">' +
            '<div class="pfc-dist-barwrap"><div class="pfc-dist-bar">' + bar + '</div>' + marker + '</div>' +
            '<div class="pfc-dist-lbl">' + leg + '</div>' + hint +
        '</div>';
    }

    // ---- точечный фоновый апдейт карточек (роадмап №6) ----
    // На тик котировок переписывает живые ЧИСЛА карточки по data-live узлам
    // (PF.liveSet, ядро), не пересобирая DOM: герой (стоимость + дельта периода),
    // KPI «Доход»/«Доходность»/«За день», цена, «Изм.» и «Доля» строк состава.
    // Полному рендеру сознательно оставлены: ПОРЯДОК строк состава (сортировка по
    // доле — структурное изменение), полоса распределения с меткой цели (inline-
    // ширины и условная разметка), мини-график (свой repaintMiniCharts). Пока
    // котировки греются (pfCardWarming), патчер карточку не трогает — скелетоны
    // заменит первый тик после прогрева.
    PF.livePatchers.cards = function () {
        visibleItems().forEach(function (p) {
            if (pfCardWarming(p) || !(p.holdings || []).length) return;
            var c = calcPf(p);
            var cash = +p.cash > 0 ? +p.cash : 0, fullV = c.value + cash;
            var vh = heroValParts(fullV);
            PF.liveSet('pfc:' + p.id + ':val', { html: vh.html, cls: 'pfc-hero-val' + vh.cls });
            var inc = heroIncParts(p, c);
            PF.liveSet('pfc:' + p.id + ':inc', { html: inc.html, cls: inc.cls });
            PF.liveSet('pfc:' + p.id + ':pnl', { text: signRub(c.pnl), cls: 'pfc-stat2-v ' + (c.pnl >= 0 ? 'pos' : 'neg') });
            PF.liveSet('pfc:' + p.id + ':yield', { text: fmtPct(c.pnlPct), cls: 'pfc-stat2-v ' + (c.pnlPct >= 0 ? 'pos' : 'neg') });
            // те же правила, что в разметке: годовые — только после года владения,
            // «за день» у «куплено сегодня» — прочерк (вчерашнего снимка нет)
            var allToday = pfAllBoughtToday(p.id);
            var days = Math.max(1, Math.floor(pfAgeDays(p)));
            PF.liveSet('pfc:' + p.id + ':ysub', { text: yieldSubText(c, days, allToday) });
            var dd = allToday ? null : dayDelta(p, c.value);
            var ddPct = dd != null && c.value - dd > 0 ? dd / (c.value - dd) * 100 : null;
            PF.liveSet('pfc:' + p.id + ':day', { text: dd == null ? '—' : signRub(dd), cls: 'pfc-stat2-v' + (dd == null ? ' pfc-dash' : (dd >= 0 ? ' pos' : ' neg')) });
            PF.liveSet('pfc:' + p.id + ':dsub', { text: dd == null ? 'нет вчерашней цены' : (ddPct != null ? fmtPct(ddPct) + ' сегодня' : 'сегодня') });
            c.hs.forEach(function (x) {
                var h = x.h, hc = x.c;
                // те же выражения, что в pfMiniRowHtml — ячейки после апдейта
                // выглядят ровно как после полного рендера
                var noQ = hc.curSrc === 'buy' ? noQuoteCell(h) : null;
                var ch = chgParts(hc, noQ);
                PF.liveSet('pfh:' + h.id + ':now', {
                    html: noQ ? noQ.txt : fmtPrice(hc.cur),
                    cls: 'pfc-mnow' + (hc.live ? ' live' : ''),
                    title: noQ ? noQ.tip : (h.type === 'bond' ? BOND_PRICE_TIP : null) });
                PF.liveSet('pfh:' + h.id + ':chg', { text: ch.txt, cls: 'pfc-mchg' + (ch.cls ? ' ' + ch.cls : '') });
                // без котировки доля считалась бы от цены покупки и врала — прочерк
                PF.liveSet('pfh:' + h.id + ':share', {
                    html: noQ ? '<span class="pfc-dash">—</span>' : shareCellHtml(fullV > 0 ? hc.value / fullV * 100 : 0) });
                // деньги позиции в раскрытой строке (узлы есть только у открытых строк)
                PF.liveSet('pfh:' + h.id + ':dval', { text: fmtRub(hc.value) });
                PF.liveSet('pfh:' + h.id + ':dpnl', { text: signRub(hc.pnl), cls: 'v ' + (hc.pnl >= 0 ? 'pos' : 'neg') });
                PF.liveSet('pfh:' + h.id + ':dann', {
                    text: hc.annual != null ? fmtPct(hc.annual) : '—',
                    cls: 'v' + (hc.annual != null ? (hc.annual >= 0 ? ' pos' : ' neg') : '') });
            });
        });
    };

    // мини-таблица состава: НАСТОЯЩАЯ <table> с table-layout:fixed — шапка и строки
    // гарантированно совпадают по колонкам. Ширины (31/13/16/16/12/12%) заданы в CSS
    // по номеру колонки, а не <colgroup>: в узкой карточке «Средняя» и «Доля» уходят
    // (@container), и проценты там пересчитываются на 4 оставшиеся колонки — из
    // разметки этим не управлять. Зазор между колонками даёт паддинг, который ВХОДИТ
    // в ширину колонки: менять ширины и паддинг только вместе.
    function pfMiniTableHtml(list, pid, fullV, warm) {
        // имена колонок — те, что уже приняты в проекте (pfxPortHoldRowHtml):
        // Средняя · Сейчас · Изм.
        var head = '<tr><th class="pfc-mc-as">Актив</th><th class="pfc-mc-qty">Кол-во</th>' +
            '<th class="pfc-mc-buy">Средняя</th><th>Сейчас</th><th>Изм.</th><th class="pfc-mc-share">Доля</th></tr>';
        var body = list.map(function (x) { return pfMiniRowHtml(x, pid, fullV, warm); }).join('');
        return '<div class="pfc-mtablewrap"><table class="pfc-mtable"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    // «Изм.» строки: стрелка + процент без знака (знак несут стрелка и цвет);
    // без котировки или вложений — прочерк, а не «+0,0%»
    function chgParts(c, noQ) {
        if (noQ || !(c.invested > 0)) return { txt: '—', cls: '' };
        var pos = c.pnlPct >= 0;
        return { txt: (pos ? '▲ ' : '▼ ') + fmtPct(Math.abs(c.pnlPct)).replace('+', ''), cls: pos ? 'pos' : 'neg' };
    }
    // «Доля» строки: процент + мини-полоса заполнения (ширина = доля × 2.2, потолок 100%)
    function shareCellHtml(share) {
        return '<span class="pfc-share">' + share.toFixed(1).replace('.', ',') + '%' +
            '<i class="pfc-sharebar"><i style="width:' + Math.min(100, share * 2.2).toFixed(0) + '%"></i></i></span>';
    }
    // Строка актива: тикер с названием · кол-во · средняя · сейчас · изм. · доля.
    // Буквенных плашек и чипов типа больше нет — класс актива читается по подписи
    // (имя ОФЗ начинается с «ОФЗ», ISIN ни с чем не спутать).
    // ДВА клика в одной строке (макет 05): вся строка раскрывает субданные, тикер
    // АКЦИИ уводит в терминал (stopPropagation, чтобы не дёргать раскрытие);
    // аффорданса (пунктир + «↗ терминал») — только при наведении на сам тикер.
    // У облигаций тикер некликабелен: терминала для ОФЗ нет, в подвкладке так же.
    function pfMiniRowHtml(x, pid, fullV, warm) {
        var h = x.h, c = x.c, isB = h.type === 'bond';
        var open = !!PF.openRows[h.id];
        var ptip = isB ? ' title="' + attr(BOND_PRICE_TIP) + '"' : '';
        // котировки ещё нет (curSrc='buy' — фолбэк на цену покупки): «…» пока грузится,
        // «—» если котировки загружены и бумаги в них нет (опечатка в тикере); цену покупки
        // под видом текущей не показываем
        var noQ = c.curSrc === 'buy' ? noQuoteCell(h) : null;
        // ПРОГРЕВ: состав, количество и средняя цена известны из localStorage сразу —
        // рисуем их настоящими, скелетон ставим только там, где ждём биржу. Так карточка
        // не «мигает» составом и не выглядит потерявшей данные.
        // НЕТ КОТИРОВКИ (вне прогрева): строка гасится, «Изм.» и «Доля» — прочерк.
        // Прочерк честнее нуля: ноль читается как «упало в ноль».
        var stale = !warm && !!noQ;
        var ch = chgParts(c, noQ);
        var nm = assetDisplayName(h);
        // У ОБЛИГАЦИЙ первой строкой идёт ИМЯ («ОФЗ 26230»), а ISIN — подписью:
        // 12-значный SU26230RMFS1 не помещался в колонку «Актив» и обрезался
        // многоточием, из-за чего строки облигаций визуально не выравнивались с
        // акциями (просьба 2026-07-22). У акций порядок прежний: тикер + компания.
        var head = isB ? (nm && nm !== h.ticker ? nm : h.ticker) : h.ticker;
        var sub = isB ? (nm && nm !== h.ticker ? h.ticker : '') : (nm && nm !== h.ticker ? nm : '');
        var tk = isB
            ? '<b>' + esc(head) + '</b>'
            : '<b class="is-go" onclick="pfOpenTicker(\'' + jsArg(h.ticker) + '\');event.stopPropagation()" title="Открыть в терминале">' + esc(head) + '</b><i class="pfc-mgo">↗ терминал</i>';
        var row = '<tr class="pfc-mtr' + (open ? ' open' : '') + (stale ? ' stale' : '') + '" data-hid="' + h.id + '" onclick="pfToggleAssetRow(\'' + pid + '\',\'' + h.id + '\')">' +
            '<td class="pfc-mc-as"><span class="pfc-mtk">' +
                '<svg class="pfc-mch' + (open ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
                '<span class="pfc-mtt"><span class="pfc-tkline">' + tk + '</span>' + (sub ? '<span class="pfc-mnm">' + esc(sub) + '</span>' : '') + '</span>' +
            '</span></td>' +
            '<td class="pfc-mqty pfc-mc-qty" data-money>' + fmtQty(c.qty) + ' шт</td>' +
            '<td class="pfc-mbuy pfc-mc-buy" data-money="off"' + ptip + '>' + fmtPrice(c.buy) + '</td>' +
            // data-live: цена, «Изм.» и «Доля» обновляются точечно фоновым тиком
            // (livePatchers.cards); ключ по hid — копии той же бумаги в других
            // экземплярах карточки (конструктор) обновятся заодно
            '<td class="pfc-mnow' + (c.live ? ' live' : '') + '" data-money="off" data-live="pfh:' + h.id + ':now"' + (noQ ? ' title="' + attr(noQ.tip) + '"' : ptip) + '>' + (warm ? skelHtml(62, 13) : (noQ ? noQ.txt : fmtPrice(c.cur))) + '</td>' +
            '<td class="pfc-mchg' + (ch.cls ? ' ' + ch.cls : '') + '" data-live="pfh:' + h.id + ':chg">' + (warm ? skelHtml(44, 13) : ch.txt) + '</td>' +
            '<td class="pfc-mshare pfc-mc-share" data-live="pfh:' + h.id + ':share">' + (warm ? skelHtml(40, 13) : (noQ ? '<span class="pfc-dash">—</span>' : shareCellHtml(fullV > 0 ? c.value / fullV * 100 : 0))) + '</td>' +
        '</tr>';
        return open ? row + pfMiniDetailRowHtml(h, c, 6, pid) : row;
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
    // ---- раскрытая строка (макет 05): ТОЛЬКО то, чего нет в самой строке ----
    // Слева список лотов (дата · кол-во · цена · сумма) из ensureLots (через calcHold),
    // НКД у облигаций — строкой под лотом; справа деньги позиции (стоимость, доход ₽,
    // годовых, срок от первой покупки); снизу действия. Старые чипы не перенесены:
    // название и средняя цена теперь в самой строке.
    // span — число колонок родительской таблицы (6 на «Обзоре», 4 в узком виде)
    function pfMiniDetailRowHtml(h, c, span, pid) {
        var isB = h.type === 'bond';
        var p = findPf(pid), isBrk = !!(p && p.broker);
        var lots = c.lots || [];
        var lotRows = lots.map(function (l) {
            var q = +l.qty || 0, pr = +l.buyPrice || 0;
            // НКД — сверх чистой цены лота: в сумме лота его нет, он входит во «Вложено»
            var nkd = (isB && +l.nkd > 0)
                ? '<span class="pfc-lot-nkd">НКД при покупке ' + fmtPrice(+l.nkd) + '/шт — сверх цены, входит во «Вложено»</span>' : '';
            return '<div class="pfc-lot"><i>' + ruDate(l.buyDate) + '</i><span data-money>' + fmtQty(q) + ' шт</span><span data-money="off">' + fmtPrice(pr) + '</span><u data-money>' + fmtRub(q * pr) + '</u>' + nkd + '</div>';
        }).join('');
        function fact(k, v, cls, live) {
            var money = /is-money/.test(cls || '');
            return '<div class="pfc-fact"><span class="k">' + k + '</span><span class="v' + (cls ? ' ' + cls.replace(' is-money', '').replace('is-money', '') : '') + '"' + (money ? ' data-money' : '') +
                (live ? ' data-live="' + live + '"' : '') + '>' + v + '</span></div>';
        }
        // срок владения — от ПЕРВОЙ покупки (c.firstDate), не от взвешенной даты
        var t0 = Date.parse(c.firstDate || '');
        var days = isFinite(t0) ? Math.max(1, Math.floor((Date.now() - t0) / 864e5)) : null;
        // data-live: деньги позиции живут на фоновом тике (livePatchers.cards) —
        // раскрытие может висеть открытым сколько угодно, цифры не должны застыть
        var facts = fact('Стоимость', fmtRub(c.value), 'is-money', 'pfh:' + h.id + ':dval') +
            fact('Доход', signRub(c.pnl), (c.pnl >= 0 ? 'pos' : 'neg') + ' is-money', 'pfh:' + h.id + ':dpnl') +
            fact('Годовых', c.annual != null ? fmtPct(c.annual) : '—', c.annual != null ? (c.annual >= 0 ? 'pos' : 'neg') : '', 'pfh:' + h.id + ':dann') +
            fact('В портфеле', days != null ? days + ' дн.' : '—', '');
        // Действия: «Докупка» → pfAddLot (у брокерской карточки скрыта — лоты затёр бы
        // следующий синк); у акций «Открыть в терминале» → pfOpenTicker, у облигаций
        // вместо терминала — лента ближайших купонов (pfToggleCoupons ниже).
        // «Продать» из макета не проведён: ручной продажи в проекте нет (см. план).
        var acts = '<div class="pfc-det-act">' +
            (isBrk ? '' : '<button class="pfc-mact" onclick="pfAddLot(\'' + pid + '\',\'' + h.id + '\')">Докупка</button>') +
            (isB ? '<button class="pfc-mact' + (PF.openCoup[h.id] ? ' on' : '') + '" onclick="pfToggleCoupons(\'' + pid + '\',\'' + h.id + '\')">Купоны</button>'
                 : '<button class="pfc-mact" onclick="pfOpenTicker(\'' + jsArg(h.ticker) + '\')">Открыть в терминале</button>') +
        '</div>';
        var coups = (isB && PF.openCoup[h.id]) ? couponsStripHtml(h, c, pid) : '';
        return '<tr class="pfc-mdet" data-hid="' + h.id + '"><td colspan="' + (span || 6) + '"><div class="pfc-mdet-in">' +
            '<div class="pfc-mdet-l"><div class="pfc-det-h">' + (lots.length > 1 ? 'Лоты · ' + lots.length : 'Покупка') + '</div>' + lotRows + '</div>' +
            '<div class="pfc-facts">' + facts + '</div>' +
            acts + coups +
        '</div></td></tr>';
    }

    // ---- лента ближайших купонов облигации (кнопка «Купоны» в раскрытии) ----
    // Расписание — то же, что питает «Календарь выплат» (coupSched/ensureSchedule,
    // ядро); суммы — на ТЕКУЩЕЕ количество бумаг. Раскрытие живёт в PF.openCoup и
    // переживает полный ре-рендер (pfMiniDetailRowHtml рисует ленту сам).
    PF.openCoup = {};   // hid → лента купонов раскрыта в субданных
    function couponsStripHtml(h, c, pid) {
        function note(txt) { return '<div class="pfc-coups"><div class="pfc-det-h">Ближайшие купоны</div><div class="pfc-coups-note">' + txt + '</div></div>'; }
        var full = PF.fullBondId(h.ticker);
        if (!(full in PF.coupSched)) {
            PF.ensureSchedule('bond', full);
            coupWait(pid, h.id, 12);   // расписание едет с MOEX — дорисуем, когда придёт
            return note('Загружаем расписание купонов с MOEX…');
        }
        var sched = PF.coupSched[full];
        if (!sched) return note('MOEX не отдаёт расписание по этой бумаге');
        var today = todayStr();
        var next = sched.filter(function (cp) { return cp.d > today; }).slice(0, 4);
        if (!next.length) return note('Будущих купонов в расписании нет');
        var chips = next.map(function (cp) {
            return '<span class="pfc-coup"><i>' + ruDate(cp.d) + '</i><b data-money="off">' + fmtPrice(cp.v) + '/шт</b><u data-money>' + fmtRub(cp.v * (c.qty || 0)) + ' на ' + fmtQty(c.qty || 0) + ' шт</u></span>';
        }).join('');
        return '<div class="pfc-coups"><div class="pfc-det-h">Ближайшие купоны</div><div class="pfc-coups-row">' + chips + '</div></div>';
    }
    // поллинг прихода расписания: ensureSchedule не умеет колбэков, а лента должна
    // дорисоваться сама; гаснет, если ленту успели свернуть или бумага исчезла
    function coupWait(pid, hid, tries) {
        setTimeout(function () {
            if (!PF.openCoup[hid]) return;
            var p = findPf(pid), h = p && findHold(p, hid); if (!h) return;
            if (PF.fullBondId(h.ticker) in PF.coupSched) { repaintDetailRows(pid, hid); return; }
            if (tries > 0) coupWait(pid, hid, tries - 1);
        }, 700);
    }
    window.pfToggleCoupons = function (pid, hid) {
        if (PF.openCoup[hid]) delete PF.openCoup[hid]; else PF.openCoup[hid] = true;
        repaintDetailRows(pid, hid);
    };
    // точечная пересборка раскрытых субданных ОДНОЙ бумаги (все экземпляры карточки) —
    // без PF.renderPortfolios, иначе мигают мини-графики всех карточек
    function repaintDetailRows(pid, hid) {
        var p = findPf(pid); if (!p) return;
        var h = findHold(p, hid); if (!h) return;
        var c = calcHold(h);
        Array.prototype.forEach.call(document.querySelectorAll('.pfc-mdet[data-hid="' + hid + '"]'), function (det) {
            var span = det.querySelector('td') ? det.querySelector('td').colSpan : 6;
            var tmp = document.createElement('tbody');
            tmp.innerHTML = pfMiniDetailRowHtml(h, c, span, pid);
            det.parentNode.replaceChild(tmp.firstChild, det);
        });
    }

    // ---- настройки/редактор (дропдаун ⚙): «спокойный список» ----
    // Состав по умолчанию — ЧИТАЕМЫЙ список (текст, не поля): тикер · шт · средняя цена
    // покупки · дата. Клик по строке раскрывает редактор ТОЛЬКО этого актива (viewRowHtml/
    // holdEditorHtml). Форма добавления свёрнута в одну кнопку-строку (у пустого портфеля
    // раскрыта сразу), цвет — точка в шапке с палитрой-поповером, «Удалить портфель» —
    // тихая ссылка в футере, раскрывающая данжер-зону с подтверждением НА МЕСТЕ (без модалки).
    function menuHtml(p) {
        // Карточка счёта брокера (№10): состав, лоты и кэш наполняются синком
        // (portfolios-broker-pf.js) — ручная правка ЗАТЁРЛАСЬ бы следующим
        // замещающим снапшотом, поэтому форма добавления, редакторы лотов,
        // «Свободные деньги» и импорт состава скрыты; вместо «Удалить портфель» —
        // «Отключить импорт» (pfConfirm с объяснением). Имя, цвет и цель по
        // облигациям остаются пользовательскими.
        var isBrk = !!p.broker;
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
        var noneBox = isBrk
            ? '<div class="pfm-none">' +
                '<span class="pfm-none-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg></span>' +
                '<span class="pfm-none-t">Счёт пока пуст</span>' +
                '<span class="pfm-none-s">Позиции появятся здесь сами после первой покупки на счёте у брокера.</span>' +
            '</div>'
            : '<div class="pfm-none">' +
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
            (isBrk
                ? '<label class="pfm-extra" title="Свободные деньги счёта — приходят из брокера при синке, руками не правятся">' +
                    '<span>Свободные деньги</span><span class="pfm-extra-f"><b class="pfm-extra-ro">' + fmtRub(p.cash || 0) + '</b></span></label>'
                : '<label class="pfm-extra" title="Свободные деньги портфеля — не вложены в бумаги; сюда автоматически падает остаток от обменов ребалансировки">' +
                '<span>Свободные деньги</span><span class="pfm-extra-f"><input class="pfm-in pfm-in-num" type="number" min="0" step="0.01" value="' + (p.cash > 0 ? p.cash : '') + '" placeholder="0" onchange="pfSetCash(\'' + p.id + '\',this.value)"><i>₽</i></span></label>') +
            '<label class="pfm-extra" title="Целевая структура: сколько процентов портфеля должно быть в облигациях. На карточке появится метка цели и подсказка, чего докупить. Пусто — выключено">' +
                '<span>Цель · облигации</span><span class="pfm-extra-f"><input class="pfm-in pfm-in-num" type="number" min="0" max="100" step="1" value="' + (p.targetBond != null ? p.targetBond : '') + '" placeholder="выкл" onchange="pfSetTarget(\'' + p.id + '\',this.value)"><i>%</i></span></label>' +
        '</div>';
        // добавление: свёрнуто в пунктирную кнопку-строку; раскрытая панель — та же форма
        // «за один подход» (addFormHtml), шапка панели сворачивает её обратно.
        // У брокерской карточки формы нет — вместо неё тихая заметка об авто-синке
        var addBlock = isBrk
            ? '<div class="pfm-brknote" title="Карточка наполняется из счёта Т-Инвестиций (примерно раз в минуту). Ручные правки затёр бы следующий синк, поэтому они выключены.">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>' +
                'Состав, количество и деньги обновляются из счёта Т-Инвестиций сами. Ваши здесь — имя, цвет и цель по облигациям.</div>'
            : '<div class="pfm-addwrap' + (PF.addOpen ? ' on' : '') + (empty ? ' is-empty' : '') + '">' +
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
        // у брокерской карточки импорта состава нет, а вместо данжер-зоны удаления —
        // «Отключить импорт» (pfConfirm в portfolios-broker-pf.js: счёт у брокера не трогаем)
        var foot = '<div class="pfm-bottom">' +
            '<div class="pfm-foot">' +
                (empty || isBrk ? '' : PF.impWrapHtml('imp-' + p.id, p.id)) +   // у пустого портфеля «Импорт» уже внутри приглашения
                '<button class="pfm-quiet" onclick="pfToggleHidden(\'' + p.id + '\')" title="Убрать карточку с «Обзора» (портфель останется в сводках) — вернуть можно через «Видимость» в шапке">' +
                    PF.EYEOFF_SVG + 'Скрыть</button>' +
                '<i class="pfm-foot-sp"></i>' +
                (isBrk
                    ? '<button class="pfm-del-link" onclick="pfBrokerPfDetach(\'' + p.id + '\')">Отключить импорт</button>'
                    : '<button class="pfm-del-link' + (PF.delArm ? ' on' : '') + '" onclick="pfDelArm(' + (PF.delArm ? 'false' : 'true') + ')">Удалить портфель</button>') +
            '</div>' +
            (PF.delArm && !isBrk ? dangerHtml(p) : '') +
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
        // брокерская карточка (№10): строки состава read-only — без редактора
        var pf = findPf(pid), ro = !!(pf && pf.broker);
        var isB = h.type === 'bond', agg = aggHolding(h), open = !ro && !!PF.editHold[h.id];
        var multi = agg.count > 1;
        var lotChip = multi ? '<i class="pfm-vlotn">×' + agg.count + '</i>' : '';
        var nkd = isB && agg.nkd > 0 ? '<i class="pfm-vnkd">НКД ' + fmtPrice(agg.nkd) + '</i>' : '';
        var priceTip = multi ? ' title="Средняя цена покупки по ' + agg.count + ' лотам"' : '';
        var dateVal = multi ? ruDate(agg.avgDate) : ruDate(agg.firstDate);
        var dateTip = multi ? ' title="Средняя (взвешенная) дата покупки"' : '';
        return '<div class="pfm-vwrap">' +
            '<div class="pfm-vrow' + (open ? ' open' : '') + (ro ? ' ro' : '') + '"' +
                (ro ? ' title="Позиция счёта у брокера — правится только сделками на счёте"'
                    : ' onclick="pfMenuRowToggle(\'' + pid + '\',\'' + h.id + '\')" title="' + (open ? 'Свернуть' : 'Изменить — даты, цены, количество') + '"') + '>' +
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
        // прибираем состояния скрытой карточки
        if (p.hidden && PF.openMenu === pid) { PF.openMenu = null; }
        var eyeMenu = dq('pfImp-eye');
        var keepOpen = !!(eyeMenu && eyeMenu.classList.contains('open'));
        var reopenEye = function () {
            var m = dq('pfImp-eye');
            if (m) { m.classList.add('open'); if (PF.placeImpMenu) PF.placeImpMenu(m); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
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
        if (m) { m.classList.add('open'); if (PF.placeImpMenu) PF.placeImpMenu(m); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
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
            if (brokerLocked(pid)) return;   // в карточку счёта брокера состав не подмешиваем
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
        for (var i = 0; i < any.length; i++) {
            any[i].classList.remove('open');
            // размеры и сдвиг заново посчитает placeImpMenu при следующем открытии
            any[i].style.maxHeight = ''; any[i].style.left = ''; any[i].style.right = '';
        }
        document.removeEventListener('click', pfImpOutside);
    }
    function pfImpOutside(e) { if (!e.target.closest('.pf-impwrap')) closeImpMenus(); }
    // Куда раскрыть попап и какой высоты его пустить. Класс .up в разметке —
    // лишь догадка места вызова («в шапке места хватит»), а по факту его может
    // не хватить: попап абсолютный, а выше по дереву есть предки с
    // overflow:hidden, которые обрезают МОЛЧА — попап просто оказывается
    // подрезанным снизу. Поэтому сторону выбираем по реальному запасу, а высоту
    // в любом случае ограничиваем видимой областью и включаем свой скролл.
    function placeImpMenu(menu) {
        var wrap = menu.closest && menu.closest('.pf-impwrap');
        if (!wrap) return;
        menu.classList.remove('up');
        menu.style.maxHeight = ''; menu.style.left = ''; menu.style.right = '';
        var GAP = 10, EDGE = 12, MIN = 160;
        var r = wrap.getBoundingClientRect();
        // видимая область = окно, урезанное всеми режущими предками
        var top = 0, bottom = window.innerHeight, left = 0, right = window.innerWidth;
        var el = wrap.parentElement;
        while (el && el !== document.documentElement) {
            var cs = getComputedStyle(el);
            if (cs.overflow !== 'visible' || cs.overflowY !== 'visible' || cs.overflowX !== 'visible') {
                var er = el.getBoundingClientRect();
                if (er.top > top) top = er.top;
                if (er.bottom < bottom) bottom = er.bottom;
                if (er.left > left) left = er.left;
                if (er.right < right) right = er.right;
            }
            el = el.parentElement;
        }
        // по вертикали: сторона — по реальному запасу, высота — не больше него
        var below = bottom - r.bottom - GAP - EDGE;
        var above = r.top - top - GAP - EDGE;
        var need = menu.scrollHeight;
        if (below < need && above > below) menu.classList.add('up');
        var room = Math.max(MIN, menu.classList.contains('up') ? above : below);
        if (need > room) menu.style.maxHeight = Math.round(room) + 'px';
        // по горизонтали: попап шире своей кнопки и по умолчанию прижат к её
        // ПРАВОМУ краю — у кнопки в левой части экрана он уезжал за левый край
        // (у «Импорта» в подвале настроек это было видно как обрезанные подписи)
        var mr = menu.getBoundingClientRect(), dx = 0;
        if (mr.left < left + EDGE) dx = left + EDGE - mr.left;
        else if (mr.right > right - EDGE) dx = right - EDGE - mr.right;
        if (dx) {
            menu.style.right = 'auto';
            menu.style.left = Math.round(mr.left - r.left + dx) + 'px';
        }
    }
    window.pfToggleImp = function (ev, key) {
        if (ev) ev.stopPropagation();
        var menu = dq('pfImp-' + key); if (!menu) return;
        var willOpen = !menu.classList.contains('open');
        closeImpMenus();
        if (willOpen) {
            menu.classList.add('open');
            placeImpMenu(menu);
            setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0);
        }
    };
    PF.placeImpMenu = placeImpMenu;

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
            (p.trades || []).forEach(function (t) {   // продажи: обмены ребалансировки и операции со счёта
                var w = new Date(t.ts || 0);
                var iso = t.date || (w.getFullYear() + '-' + pad2(w.getMonth() + 1) + '-' + pad2(w.getDate()));
                var q = +t.sellQty || 0, proceeds = +t.proceeds || 0;
                rows.push({ pf: p.name, date: iso, side: 'Продажа', type: t.kind === 'bond' ? 'Облигация' : 'Акция',
                    tk: t.sellTicker || '', nm: t.sellName || t.sellTicker || '', price: q > 0 ? proceeds / q : null,
                    // комиссия — В РУБЛЯХ: у операции со счёта она известна точно
                    // (t.feeRub), у обмена ребалансировки t.fee — это СТАВКА, из
                    // неё рубли считаются от суммы сделки
                    nkd: null, qty: q, sum: proceeds,
                    fee: t.src === 'broker' ? (+t.feeRub || 0) : (+t.fee || 0) * proceeds });
            });
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker) return;
                var isB = h.type === 'bond';
                ensureLots(h).forEach(function (l) {
                    var q = +l.qty || 0; if (!(q > 0)) return;
                    var nkd = isB ? (+l.nkd || 0) : null;
                    rows.push({ pf: p.name, date: l.buyDate || '', side: 'Покупка', type: isB ? 'Облигация' : 'Акция',
                        tk: h.ticker, nm: h.name || h.ticker, price: +l.buyPrice || 0, nkd: nkd, qty: q,
                        sum: ((+l.buyPrice || 0) + (nkd || 0)) * q, fee: +l.fee || 0 });
                });
            });
        });
        if (!rows.length) { toast('Пока нет сделок для выгрузки', true); return; }
        rows.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var head = ['Портфель', 'Дата', 'Сторона', 'Тип', 'Тикер', 'Название', 'Цена, ₽', 'НКД, ₽', 'Кол-во', 'Сумма, ₽', 'Комиссия, ₽'];
        var lines = [head.map(csvCell).join(';')];
        rows.forEach(function (r) {
            lines.push([r.pf, csvRuDate(r.date), r.side, r.type, r.tk, r.nm, csvNum(r.price),
                r.nkd != null ? csvNum(r.nkd) : '', r.qty, csvNum(r.sum), r.fee > 0 ? csvNum(r.fee) : ''
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
            else {
                p.trades = p.trades.filter(function (t) { return t && typeof t === 'object'; });
                p.trades.forEach(function (t) {
                    // id уходит СЫРЫМ в onclick журнала, а дата — в разметку строки:
                    // из файла сюда может приехать что угодно
                    if (!pfIdOk(t.id)) { t.id = genId('t'); delete t.undo; }
                    if (t.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) delete t.date;
                    // метка «операция со счёта» имеет смысл только в карточке счёта
                    if (t.src != null && (t.src !== 'broker' || !p.broker)) delete t.src;
                });
                // сменились id активов/лотов → сохранённые undo-ссылки сделок больше не сходятся
                if (holdIdFixed || idFixed) p.trades.forEach(function (t) { if (t.undo) delete t.undo; });
            }
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
            if (csvImportPid && brokerLocked(csvImportPid)) return;   // карточка счёта брокера — read-only
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
            PF.openMenu = pid; PF.menuJustOpened = true;
            // свежеоткрытые настройки — с чистым состоянием: строки свёрнуты, палитра,
            // данжер-зона и форма добавления актива закрыты
            PF.editHold = {}; PF.colorsOpen = false; PF.delArm = false; PF.addOpen = false;
        }
        // PF.renderNoAnim (не PF.renderPortfolios): раскрытие настроек трогает только ОДНУ карточку,
        // а полный ре-рендер заново «рисует» мини-графики ВСЕХ карточек с 1-сек анимацией линии —
        // на глаз это читалось как мигание графиков. PF.noChartAnim рисует их сразу в конечном виде.
        PF.renderNoAnim();
    };
    // клик по строке актива в мини-таблице → раскрыть/свернуть субданные (блок 2 плана
    // заменит их лотами). Правим DOM ТОЧЕЧНО (без PF.renderPortfolios): полный ре-рендер
    // заново «рисует» все мини-графики с 1-секундной анимацией линии — на простой разворот
    // строки это выглядит как мигание всей вкладки. Одна бумага может жить в нескольких
    // экземплярах карточки (конструктор) — обновляем все совпадающие строки. Аккордеона
    // нет: раскрытых строк может быть сколько угодно, PF.openRows синхронизирует
    // состояние со следующим полным ре-рендером.
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
                // colspan по фактическому числу колонок строки: 6 на «Обзоре», 4 в узком виде
                tmp.innerHTML = pfMiniDetailRowHtml(h, c, row.cells.length, pid);
                row.parentNode.insertBefore(tmp.firstChild, row.nextSibling);
                revealRow(row);
            } else if (!willOpen && hasDet) {
                next.parentNode.removeChild(next);
            }
        });
    };
    // Список позиций ограничен пятью строками и скроллится внутри, поэтому
    // раскрытая деталь может оказаться за нижней кромкой — подкручиваем список так,
    // чтобы строка и её субданные были видны целиком. Скроллим ТОЛЬКО контейнер
    // списка (не scrollIntoView: тот утащил бы и саму страницу).
    function revealRow(row) {
        var list = row.closest('.pfc-massets'); if (!list) return;
        var det = row.nextElementSibling;
        var top = row.offsetTop, bottom = (det && det.classList.contains('pfc-mdet') ? det.offsetTop + det.offsetHeight : row.offsetTop + row.offsetHeight);
        var head = list.querySelector('thead');
        var headH = head ? head.offsetHeight : 0;   // липкая шапка перекрывает верх
        requestAnimationFrame(function () {
            var visTop = list.scrollTop + headH, visBottom = list.scrollTop + list.clientHeight;
            if (bottom > visBottom) list.scrollTop = Math.min(bottom - list.clientHeight + 6, top - headH);
            else if (top < visTop) list.scrollTop = top - headH;
        });
    }
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
            // warn — жёлтый предупреждающий вариант (не красный danger): например,
            // варн о задвоении бумаг при создании брокерской карточки (№10)
            '<div class="pfcf-ico' + (opts.danger ? ' danger' : '') + (opts.warn ? ' warn' : '') + '">' + (opts.icon || TRASH) + '</div>' +
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
    // Read-only гард брокерской карточки (№10): состав наполняется синком
    // (portfolios-broker-pf.js), ручную правку затёр бы следующий замещающий
    // снапшот. UI правок скрыт (menuHtml/viewRowHtml), это — вторая линия
    // обороны для прямых вызовов onclick-глобалов.
    function brokerLocked(pid) {
        var p = findPf(pid);
        if (p && p.broker) { toast('Портфель наполняется из счёта брокера — правка руками выключена', true); return true; }
        return false;
    }
    // читает форму добавления и записывает актив в модель (БЕЗ ре-рендера/фокуса/тоста).
    // Возвращает {ticker, restocked} если добавлено, иначе null (нет тикера). Общая логика
    // для кнопки «Добавить» и для «Готово» (чтобы заполненный, но не добавленный тикер не пропал).
    function pfReadAddForm(pid) {
        var p = findPf(pid); if (!p || p.broker) return null;
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
        if (brokerLocked(pid)) return;
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
        if (brokerLocked(pid)) return;
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
        if (brokerLocked(pid)) return;
        var p = findPf(pid); if (!p) return;
        p.holdings = (p.holdings || []).filter(function (h) { return h.id !== hid; });
        delete PF.editHold[hid]; saveStore(); PF.pfInvalidateCharts(pid); PF.renderPortfolios();
    };
    window.pfEdit = function (pid, hid, field, val) {
        if (brokerLocked(pid)) return;
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
        if (brokerLocked(pid)) return;
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        var l = findLot(h, lotId); if (!l) return;
        if (field === 'buyDate') { l.buyDate = val; l.priceFromApi = false; l.nkdFromApi = false; delete PF.loadStatus[lotId + ':price']; delete PF.loadStatus[lotId + ':nkd']; }
        else if (field === 'buyPrice') { l.buyPrice = Math.max(0, toNum(val) || 0); l.priceFromApi = false; delete PF.loadStatus[lotId + ':price']; }
        else if (field === 'nkd') { l.nkd = Math.max(0, toNum(val) || 0); l.nkdFromApi = false; delete PF.loadStatus[lotId + ':nkd']; }
        else if (field === 'qty') { l.qty = Math.max(0, Math.round(toNum(val) || 0)); }
        saveStore(); PF.pfInvalidateCharts(pid); ensureQuotes(); PF.renderPortfolios();
    };
    window.pfAddLot = function (pid, hid) {
        if (brokerLocked(pid)) return;
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        ensureLots(h).push({ id: genId('l'), buyDate: todayStr(), buyPrice: 0, qty: 0, nkd: 0, priceFromApi: false, nkdFromApi: false });
        PF.editHold[hid] = true;
        // «Докупка» из раскрытой строки карточки: настройки ещё закрыты — открываем ⚙
        // этого портфеля сразу с раскрытым редактором актива (свежий лот сверху)
        if (PF.openMenu !== pid) { PF.openMenu = pid; PF.menuJustOpened = true; PF.colorsOpen = false; PF.delArm = false; PF.addOpen = false; }
        saveStore(); PF.pfInvalidateCharts(pid); PF.renderPortfolios();
    };
    window.pfRemoveLot = function (pid, hid, lotId) {
        if (brokerLocked(pid)) return;
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
        if (brokerLocked(pid)) return;   // лоты карточки счёта задаёт синк, а не мы
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
    PF.menuHtml = menuHtml; PF.paintPfChartMini = paintPfChartMini; PF.pfCardHead = pfCardHead;
    PF.pfConfirm = pfConfirm; PF.pfImpOutside = pfImpOutside; PF.repaintMiniCharts = repaintMiniCharts;
})();
