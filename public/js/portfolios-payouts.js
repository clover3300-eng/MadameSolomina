// ===== «ПОРТФЕЛИ» · ВЫПЛАТЫ (модуль цепочки #pfLazySrc) =====
// Календарь выплат-список (ближайшие купоны/дивиденды всех портфелей,
// фильтр по портфелям, «Показать все»), виджет «Дивиденды и купоны»
// (pfwDivsHtml) и месячный календарь выплат клеточками (pfcm*).
// Имена остатка цепочки (pfCardHead, plural, renderPortfolios…) — через
// PF.*: остаток грузится ПОСЛЕ нас.
(function () {
    'use strict';
    var PF = window.PF;
    // импорт ядра (уже загружено):
    var aggHolding = PF.aggHolding, attr = PF.attr, bondDetail = PF.bondDetail, bondFace = PF.bondFace, colorVal = PF.colorVal, coupSched = PF.coupSched;
    var dateToIso = PF.dateToIso, divSched = PF.divSched, dq = PF.dq, ensureSchedule = PF.ensureSchedule, esc = PF.esc, fmtRub = PF.fmtRub;
    var fullBondId = PF.fullBondId, jsArg = PF.jsArg, pad2 = PF.pad2, parseBondDate = PF.parseBondDate, pfPayouts = PF.pfPayouts, ruDate = PF.ruDate;
    var todayStr = PF.todayStr, visibleItems = PF.visibleItems;
    // ============================================================
    //  КАЛЕНДАРЬ ВЫПЛАТ — ближайшие купоны по облигациям ВСЕХ портфелей сразу
    // ============================================================
    // Дата купона у нас не хранится напрямую (MOEX её отдельным полем не отдаёт в уже
    // используемых запросах) — приближаем её по периодической схеме «частота выплат в год»
    // от даты ПОГАШЕНИЯ назад: это те же couponValue/freq/matDate, что уже тянет
    // fetchBondData/bondDetailsMap для «Прибыли по облигациям» в карточке ребалансировки
    // (см. bondEconAt ниже). Реальный график может отличаться на несколько дней от факта
    // MOEX — это приближение, а не официальный календарь выплат эмитента.
    function nextCouponDate(det) {
        var mat = parseBondDate(det && det.matDate); if (!mat) return null;
        var freq = +det.freq || 0; if (!(freq > 0)) return null;
        var stepMs = (365 / freq) * 86400000;
        var t = mat.getTime(), now = Date.now();
        if (t < now) return null;   // уже погашена
        while (t - stepMs >= now) t -= stepMs;
        return new Date(t);
    }
    function daysUntilText(d) {
        var days = Math.round((d.getTime() - Date.now()) / 86400000);
        if (days <= 0) return 'сегодня';
        if (days === 1) return 'завтра';
        if (days < 14) return 'через ' + days + ' ' + PF.plural(days, 'день', 'дня', 'дней');
        if (days < 60) { var w = Math.round(days / 7); return 'через ' + w + ' ' + PF.plural(w, 'неделю', 'недели', 'недель'); }
        var mo = Math.round(days / 30);   // дальше двух месяцев недели уже не читаются
        return 'через ' + mo + ' ' + PF.plural(mo, 'месяц', 'месяца', 'месяцев');
    }
    // все держащиеся сейчас облигации (qty>0) по всем портфелям — общий список для календаря
    // и для догрузки недостающих деталей купонов разом (а не по одной при открытии каждого портфеля)
    // Фильтр календаря выплат: payCalSel === null → показываем все (не скрытые) портфели;
    // иначе объект { pid:true } — какие портфели включены пользователем.
    var payCalSel = null;
    function calPfSelected(p) { return !payCalSel || !!payCalSel[p.id]; }
    // у портфеля есть акции с ОБЪЯВЛЕННЫМИ будущими дивидендами (по загруженным расписаниям)
    function pfHasUpcomingDivs(p) {
        var today = todayStr();
        return (p.holdings || []).some(function (h) {
            if (h.type === 'bond' || !h.ticker || !(aggHolding(h).qty > 0)) return false;
            var ds = divSched[h.ticker];
            return !!(ds && ds.some(function (dv) { return dv.d > today; }));
        });
    }
    // портфели-кандидаты для фильтра: не скрытые, с облигациями ИЛИ с будущими дивидендами
    function calPfCandidates() {
        return PF.store.items.filter(function (p) {
            if (p.hidden) return false;
            var hasBond = (p.holdings || []).some(function (h) { return h.type === 'bond' && h.ticker && aggHolding(h).qty > 0; });
            return hasBond || pfHasUpcomingDivs(p);
        });
    }
    function allHeldOf(type) {
        var list = [];
        PF.store.items.forEach(function (p) {
            if (p.hidden) return;              // скрытый портфель — выплаты в календаре не показываем
            if (!calPfSelected(p)) return;     // снят в фильтре «Какие портфели показывать»
            (p.holdings || []).forEach(function (h) {
                var isB = h.type === 'bond';
                if ((type === 'bond' ? isB : !isB) && h.ticker && aggHolding(h).qty > 0) list.push({ p: p, h: h });
            });
        });
        return list;
    }
    function allHeldBonds() { return allHeldOf('bond'); }
    function allHeldStocks() { return allHeldOf('stock'); }
    // Будущие выплаты на год вперёд: купоны по НАСТОЯЩЕМУ расписанию MOEX (bondization;
    // фолбэк — прежняя периодическая схема, пока расписание грузится/недоступно),
    // погашения (номинал × кол-во в дату matDate) и объявленные дивиденды (по дате отсечки).
    function collectUpcomingPayouts() {
        var evs = [], now = Date.now(), horizon = now + 365 * 86400000, today = todayStr();
        // номер портфеля — его позиция среди ВИДИМЫХ карточек (там же нумеруются кольца)
        var visNum = {};
        visibleItems().forEach(function (p, i) { visNum[p.id] = i + 1; });
        function ev(date, kind, amount, x) {
            return { date: date, kind: kind, amount: amount, ticker: x.h.ticker, name: x.h.name || x.h.ticker,
                pfName: x.p.name, pfColor: colorVal(x.p.color), pfNum: visNum[x.p.id] || '' };
        }
        allHeldBonds().forEach(function (x) {
            var qty = aggHolding(x.h).qty;
            var det = bondDetail(x.h.ticker);
            var full = fullBondId(x.h.ticker);
            var sched = (full in coupSched) ? coupSched[full] : (ensureSchedule('bond', full), undefined);
            var pushed = false;
            if (sched) {
                sched.forEach(function (cp) {
                    if (cp.d <= today) return;
                    var t = Date.parse(cp.d); if (!isFinite(t) || t > horizon) return;
                    evs.push(ev(new Date(t), 'coupon', cp.v * qty, x)); pushed = true;
                });
            }
            if (!pushed && det && (+det.couponValue > 0)) {   // фолбэк: периодическая схема
                var nd = nextCouponDate(det);
                if (nd && +det.freq > 0) {
                    var stepMs = (365 / det.freq) * 86400000;
                    var matT = (parseBondDate(det.matDate) || { getTime: function () { return horizon; } }).getTime();
                    for (var t2 = nd.getTime(); t2 <= horizon && t2 <= matT; t2 += stepMs)
                        evs.push(ev(new Date(t2), 'coupon', det.couponValue * qty, x));
                }
            }
            // погашение: тело облигации возвращается в дату matDate
            if (det) {
                var mat = parseBondDate(det.matDate);
                if (mat && mat.getTime() > now && mat.getTime() <= horizon)
                    evs.push(ev(mat, 'redeem', bondFace(x.h.ticker) * qty, x));
            }
        });
        allHeldStocks().forEach(function (x) {
            var ds = (x.h.ticker in divSched) ? divSched[x.h.ticker] : (ensureSchedule('div', x.h.ticker), undefined);
            if (!ds) return;
            var qty = aggHolding(x.h).qty;
            ds.forEach(function (dv) {
                if (dv.d <= today) return;
                var t = Date.parse(dv.d); if (!isFinite(t) || t > horizon) return;
                evs.push(ev(new Date(t), 'div', dv.v * qty, x));
            });
        });
        evs.sort(function (a, b) { return a.date - b.date; });
        return evs;
    }
    // догрузка недостающих деталей купонов разом по ВСЕМ портфелям (де-дуп по тикеру —
    // fetchBondData и так кеширует внутри себя, но незачем плодить повторные вызовы за один проход)
    var payCalPending = false;
    function ensureAllBondDetails(cb) {
        if (typeof fetchBondData !== 'function') { cb(); return; }
        var seen = {}, need = [];
        allHeldBonds().forEach(function (x) { var tk = x.h.ticker;
            if (!seen[tk] && !bondDetail(tk)) { seen[tk] = 1; need.push(tk); } });
        if (!need.length || payCalPending) { cb(); return; }
        payCalPending = true;
        var left = need.length;
        need.forEach(function (tk) {
            Promise.resolve(fetchBondData(tk)).catch(function () {}).then(function () { if (--left <= 0) { payCalPending = false; cb(); } });
        });
    }
    var payCalFull = false;
    function sameCalDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    var CAL_ICO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    function payCalStateHtml(kind) {
        if (kind === 'loading') return '<div class="pfpc-state"><span class="pfcv-spin"></span><span>Уточняем даты выплат на Мосбирже…</span></div>';
        var conf = kind === 'nodata'
            ? { t: 'Пока не считается', s: 'Не нашли расписание выплат по вашим бумагам — попробуйте обновить страницу чуть позже.' }
            : { t: 'Пока нечего показывать', s: 'Добавьте облигации или дивидендные акции в любой портфель — здесь появится график ближайших выплат.' };
        return '<div class="pfpc-state"><div class="pfpc-state-art">' + CAL_ICO_SVG + '</div>' +
            '<div class="pfpc-state-t">' + conf.t + '</div><div class="pfpc-state-s">' + conf.s + '</div></div>';
    }
    function payCalRowHtml(ev, multiPf) {
        // Дата — квадратиком-«отрывным календарём» (число сверху, месяц под ним), как в
        // референсе. Он же метка портфеля: подложка квадратика красится в цвет портфеля
        // (раньше рядом стояла отдельная рельса с НОМЕРОМ портфеля — две сущности про одно
        // и то же). Полная дата, «через сколько» и имя портфеля — в подсказке.
        // Тип выплаты: купон — по умолчанию (без бейджа), дивиденды и погашение — с бейджем.
        var kind = ev.kind === 'div' ? '<i class="pfpc-kind kind-div" title="Объявленные дивиденды — по дате закрытия реестра (деньги приходят на пару недель позже)">дивиденды</i>'
            : ev.kind === 'redeem' ? '<i class="pfpc-kind kind-red" title="Погашение — возврат номинала облигации">погашение</i>' : '';
        var tip = ruDate(dateToIso(ev.date)) + ' · ' + daysUntilText(ev.date) + (multiPf && ev.pfName ? ' · ' + ev.pfName : '');
        return '<div class="pfpc-row">' +
            '<div class="pfpc-day' + (multiPf ? ' pfpc-day--pf' : '') + '"' + (multiPf ? ' style="--c:' + ev.pfColor + '"' : '') + ' title="' + attr(tip) + '">' +
                '<b>' + ev.date.getDate() + '</b><span>' + PAY_MON_SHORT[ev.date.getMonth()] + '</span></div>' +
            '<div class="pfpc-id"><span class="pfpc-tk">' + esc(ev.ticker) + kind + '</span><span class="pfpc-nm">' + esc(ev.name) + '</span></div>' +
            '<div class="pfpc-amt">+' + fmtRub(ev.amount) + '</div>' +
        '</div>';
    }
    // подпись месяца для разделителей списка выплат («Сентябрь 2026 · +12 400 ₽»)
    var PAY_MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    // короткая подпись месяца — внутри квадратика даты («29 / июл»)
    var PAY_MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    // родительный падеж — заголовок «Ближайшая выплата»: «29 июля — ОФЗ 26230»
    var PAY_MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    function payMonKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
    var FILTER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
    // Попап «Какие портфели показывать» в шапке календаря: строка «Показать все» + по строке
    // на каждый портфель (переиспользует инфраструктуру попапов «Импорт», key='paycal').
    function calFilterHtml() {
        var cands = calPfCandidates();
        if (cands.length < 2) return '';   // фильтровать нечего (0–1 портфель с облигациями)
        var allOn = !payCalSel;
        var selN = cands.filter(calPfSelected).length;
        var rows = '<button class="pf-impitem pf-eyeitem' + (allOn ? '' : ' off-eye') + '" onclick="pfCalShowAll(event)">' +
                '<span class="pf-eyedot pfpc-alldot"></span>' +
                '<span class="pf-impbody"><b>Показать все</b><i>купоны по всем портфелям</i></span>' +
                '<span class="pf-eyestate">' + (allOn ? PF.CHECK_SVG : '') + '</span></button>' +
            cands.map(function (p) {
                var on = calPfSelected(p);
                return '<button class="pf-impitem pf-eyeitem' + (on ? '' : ' off-eye') + '" onclick="pfToggleCalPf(\'' + p.id + '\',event)">' +
                    '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                    '<span class="pf-impbody"><b>' + esc(p.name) + '</b></span>' +
                    '<span class="pf-eyestate">' + (on ? PF.EYE_SVG : PF.EYEOFF_SVG) + '</span></button>';
            }).join('');
        var badge = !allOn ? '<i class="pf-eyecnt">' + selN + '/' + cands.length + '</i>' : '';
        return '<div class="pf-impwrap pfpc-filter">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'paycal\')">' + FILTER_SVG + 'Портфели' + badge + PF.CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-paycal">' +
                '<div class="pf-impgrp">Какие портфели показывать</div>' + rows +
            '</div></div>';
    }
    // Единый календарь: выплаты по ВСЕМ портфелям сразу на год вперёд — купоны (настоящее
    // расписание MOEX), погашения и объявленные дивиденды. asCell=true → карточка встаёт
    // ЯЧЕЙКОЙ в сетку портфелей (нечётное их число): высота равна карточке портфеля,
    // список скроллится внутри (см. .pf-paycal--cell в CSS).
    // ТОЧЕЧНЫЕ ОБНОВЛЕНИЯ (роадмап №6): у календаря — как и у всего этого файла —
    // НЕТ чисел, зависящих от живых котировок: суммы = расписания coupSched/divSched
    // × кол-во из лотов + номинал bondFace, PF.quotes/calcPf здесь не читаются.
    // data-live разметка не нужна. НО виджет дозаполняется асинхронно приходом
    // расписаний (pumpSchedQueue в ядре и ensureAllBondDetails ниже дёргают
    // PF.softRerender) — это СТРУКТУРНЫЕ перерисовки (спиннер → список, новые
    // строки), их полный рендер в softRerender обязан сохраниться.
    function paymentCalendarHtml(asCell, span, forceFull) {
        if (!PF.store.items.length) return '';
        var SUB = 'купоны, дивиденды и погашения на год вперёд';
        var cls = 'dash2-card pf-card2 pf-paycal' + (asCell ? ' pf-paycal--cell' : '') + (asCell && span === 2 ? ' pf-paycal--span2' : '') + (forceFull ? ' pf-paycal--page' : '');
        var held = allHeldBonds(), heldS = allHeldStocks();
        var head = PF.pfCardHead('', 'Календарь выплат', SUB, '<div class="pfpc-head-r">' + calFilterHtml() + '</div>');
        if (!held.length && !heldS.length) return '<div class="' + cls + '">' + head + payCalStateHtml('nobonds') + '</div>';
        var missing = held.some(function (x) { return !bondDetail(x.h.ticker); });
        if (missing) ensureAllBondDetails(function () { PF.softRerender(); });
        // расписания (купоны облигаций / дивиденды акций) ещё в очереди загрузки?
        var schedPending = held.some(function (x) { return !(fullBondId(x.h.ticker) in coupSched); }) ||
            heldS.some(function (x) { return !(x.h.ticker in divSched); });
        var evs = collectUpcomingPayouts();
        if (!evs.length) return '<div class="' + cls + '">' + head + payCalStateHtml((missing || schedPending) ? 'loading' : 'nodata') + '</div>';
        // в режиме ячейки список скроллится внутри — лимит не нужен, показываем всё сразу
        var LIMIT = 6, multiPf = PF.store.items.length > 1;
        // при 2 или 4 портфелях сразу видно много карточек — календарь сворачиваем до
        // ближайшей даты выплаты (если на неё приходится сразу несколько купонов —
        // показываем их все); полный список — по клику на «Показать все»
        var collapseNext = (PF.store.items.length === 2 || PF.store.items.length === 4) && !asCell && !forceFull;
        var shown;
        if (collapseNext && !payCalFull) {
            var d0 = evs[0].date;
            shown = evs.filter(function (e) { return sameCalDay(e.date, d0); });
        } else {
            shown = (payCalFull || asCell || forceFull) ? evs : evs.slice(0, LIMIT);
        }
        var soonEvs = evs.filter(function (e) { return (e.date.getTime() - Date.now()) <= 30 * 86400000; });
        var soonSum = soonEvs.reduce(function (s, e) { return s + e.amount; }, 0);
        // в свёрнутом виде показана только ближайшая дата — бейдж с числом выплат за 30 дней
        // сохраняет контекст «сколько ещё впереди», не разворачивая список
        var cntBadge = (collapseNext && !payCalFull && soonEvs.length > shown.length)
            ? '<span class="pfpc-cnt">' + soonEvs.length + ' ' + PF.plural(soonEvs.length, 'выплата', 'выплаты', 'выплат') + '</span>' : '';
        var soon = '<div class="pfpc-soon"><span class="pfpc-soon-l">За 30 дней</span>' + cntBadge + '<span class="pfpc-soon-v">+' + fmtRub(soonSum) + '</span></div>';
        // при раскрытии shown === evs, поэтому evs.length > shown.length перестаёт быть true —
        // в развёрнутом виде кнопку показываем принудительно (иначе нельзя свернуть обратно)
        var more = (!asCell && !forceFull && (payCalFull || evs.length > shown.length)) ? '<button class="pfpc-more' + (payCalFull ? ' on' : '') + '" onclick="pfTogglePayCal()">' +
            '<span>' + (payCalFull ? 'Свернуть' : 'Показать все · ' + evs.length) + '</span>' +
            '<svg class="pfpc-more-ch' + (payCalFull ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' : '';
        var right = '<div class="pfpc-head-r">' + calFilterHtml() + soon + '</div>';
        // R7: разделители-месяцы («ИЮЛЬ 2026 · +984 180 ₽») показываем ВСЕГДА, когда строк
        // больше двух — как в референсе; совсем короткий список оставляем плоским
        var withMonths = shown.length > 2;
        var monSum = {};
        if (withMonths) evs.forEach(function (e) { var k = payMonKey(e.date); monSum[k] = (monSum[k] || 0) + e.amount; });
        var rowsHtml = '', prevMon = null;
        shown.forEach(function (e) {
            if (withMonths) {
                var k = payMonKey(e.date);
                if (k !== prevMon) {
                    prevMon = k;
                    rowsHtml += '<div class="pfpc-mon"><b>' + PAY_MON[e.date.getMonth()] + ' ' + e.date.getFullYear() + '</b><span>+' + fmtRub(monSum[k]) + '</span></div>';
                }
            }
            rowsHtml += payCalRowHtml(e, multiPf);
        });
        return '<div class="' + cls + '">' + PF.pfCardHead('', 'Календарь выплат', SUB, right) +
            '<div class="pfpc-body" data-skey="paycal" onscroll="pfPayCalScroll(this)"><div class="pfpc-list">' + rowsHtml + '</div>' + more + '</div>' +
        '</div>';
    }
    window.pfTogglePayCal = function () { payCalFull = !payCalFull; PF.renderPortfolios(); };
    // ре-рендер, сохраняя открытым попап фильтра календаря (как в pfToggleHidden с меню «Видимость»)
    function reRenderKeepCalMenu() {
        var open = !!(dq('pfImp-paycal') && dq('pfImp-paycal').classList.contains('open'));
        PF.renderPortfolios();
        if (open) { var m = dq('pfImp-paycal'); if (m) { m.classList.add('open'); if (PF.placeImpMenu) PF.placeImpMenu(m); setTimeout(function () { document.addEventListener('click', PF.pfImpOutside); }, 0); } }
    }
    window.pfCalShowAll = function (ev) { if (ev) ev.stopPropagation(); payCalSel = null; reRenderKeepCalMenu(); };
    window.pfToggleCalPf = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var cands = calPfCandidates();
        if (!payCalSel) { payCalSel = {}; cands.forEach(function (p) { payCalSel[p.id] = true; }); }
        payCalSel[pid] = !payCalSel[pid];
        // все выбраны → вернуть в состояние «все» (null); все сняты → тоже сбрасываем в «все»
        // (пустой календарь без причины бессмыслен)
        if (cands.every(function (p) { return payCalSel[p.id]; }) || cands.every(function (p) { return !payCalSel[p.id]; })) payCalSel = null;
        reRenderKeepCalMenu();
    };
    // В режиме ячейки список выплат скроллится внутри карточки — пока ниже есть ещё строки,
    // низ списка плавно затухает (класс has-more + mask в CSS) вместо жёсткого среза
    // последней видимой строки; доскроллили до конца — затухание снимается.
    window.pfPayCalScroll = function (el) {
        if (!el) return;
        var more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
        el.classList.toggle('has-more', more);
    };

    // ====================================================================
    //  R7 — НОВЫЕ ВИДЖЕТЫ (подвкладки + опт-ин на «Обзор» через пикер)
    // ====================================================================
    // «Дивиденды и купоны»: получено за время владения + ожидается (30 дней / год)
    function pfwDivsHtml() {
        var got = 0, pending = false, any = false;
        PF.store.items.forEach(function (p) {
            if (p.hidden) return;
            var po = pfPayouts(p);
            if (po.any) any = true;
            if (po.pending) pending = true; else got += po.sum;
        });
        var evs = collectUpcomingPayouts();
        var soon = 0, year = 0;
        evs.forEach(function (e) { if (e.date.getTime() - Date.now() <= 30 * 86400000) soon += e.amount; year += e.amount; });
        var IC_GOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><circle cx="16.5" cy="15" r="1.4" fill="currentColor" stroke="none"/></svg>';
        var IC_WAIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
        var IC_YEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg>';
        function row(ic, cls, l, sub, v, vCls) {
            return '<div class="pfdv-row"><span class="pfdv-ic ' + cls + '">' + ic + '</span>' +
                '<span class="pfdv-t"><b>' + l + '</b><i>' + sub + '</i></span>' +
                '<span class="pfdv-v ' + (vCls || '') + '">' + v + '</span></div>';
        }
        var body = !any
            ? '<div class="pfal-empty">Добавьте облигации или дивидендные акции — здесь появятся полученные и будущие выплаты.</div>'
            : '<div class="pfdv-rows">' +
                row(IC_GOT, 'got', 'Получено', 'за время владения', pending ? '…' : '+' + fmtRub(got), 'pos') +
                row(IC_WAIT, 'soon', 'Ожидается', 'ближайшие 30 дней', soon > 0 ? '+' + fmtRub(soon) : '—', soon > 0 ? 'pos' : '') +
                row(IC_YEAR, 'year', 'Ожидается', 'на год вперёд', year > 0 ? '+' + fmtRub(year) : '—', year > 0 ? 'pos' : '') +
            '</div>';
        return '<div class="dash2-card pf-card2 pf-divsblk">' +
            PF.pfCardHead('', 'Дивиденды', 'ожидаемые и полученные выплаты', null) + body + '</div>';
    }
    // «Полученные по портфелям»: строка на портфель с суммой выплат
    function pfwDivsByPfHtml() {
        var rows = '';
        PF.store.items.forEach(function (p) {
            if (p.hidden) return;
            var po = pfPayouts(p);
            if (!po.any) return;
            rows += '<div class="pfdv-prow"><i style="background:' + colorVal(p.color) + '"></i>' +
                '<span class="pfdv-pn">' + esc(p.name) + '</span>' +
                '<b class="' + (po.pending ? '' : 'pos') + '">' + (po.pending ? '…' : '+' + fmtRub(po.sum)) + '</b></div>';
        });
        var body = rows ? '<div class="pfdv-plist">' + rows + '</div>'
            : '<div class="pfal-empty">Пока нет портфелей с выплатами.</div>';
        return '<div class="dash2-card pf-card2 pf-divsblk">' +
            PF.pfCardHead('', 'Выплаты по портфелям', 'полученные купоны и дивиденды', null) + body + '</div>';
    }
    // ====================================================================
    //  ВИДЖЕТ «Календарь выплат · месяц» — настоящая месячная сетка
    // ====================================================================
    // В отличие от блока «Календарь выплат» (cal), который показывает выплаты СПИСКОМ,
    // этот виджет рисует месяц клеточками: видно, как выплаты распределены по дням.
    // Данные — те же collectUpcomingPayouts() (реальные расписания Мосбиржи, год вперёд),
    // никакой своей арифметики. Дни с выплатами метим ЦВЕТОМ ПОДЛОЖКИ квадратика — тем же
    // приёмом, что и список-календарь (цвет портфеля); день с выплатами из разных
    // портфелей получает нейтральную акцентную подложку и точки по цветам.
    var PFCM_WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var PFCM_MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    var pfcmOffset = 0;    // смещение показанного месяца от текущего (стрелки ‹ ›)
    var pfcmSelKey = null; // выбранный день (YYYY-M-D) — под сеткой раскрывается его список
    function pfcmKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
    // Месяц, который показываем: текущий + смещение. Через setMonth на 1-м числе —
    // иначе 31-е «перепрыгивало» бы короткие месяцы.
    function pfcmShownMonth() {
        var n = new Date(), d = new Date(n.getFullYear(), n.getMonth(), 1);
        d.setMonth(d.getMonth() + pfcmOffset);
        return d;
    }
    // выплаты показанного месяца, разложенные по дням: key → { sum, evs, colors }
    function pfcmByDay(mon) {
        var map = {}, y = mon.getFullYear(), m = mon.getMonth();
        collectUpcomingPayouts().forEach(function (e) {
            if (e.date.getFullYear() !== y || e.date.getMonth() !== m) return;
            var k = pfcmKey(e.date);
            if (!map[k]) map[k] = { sum: 0, evs: [], colors: [] };
            map[k].sum += e.amount;
            map[k].evs.push(e);
            if (map[k].colors.indexOf(e.pfColor) < 0) map[k].colors.push(e.pfColor);
        });
        return map;
    }
    window.pfcmNav = function (delta, ev) {
        if (ev) ev.stopPropagation();
        // держимся в пределах горизонта данных: назад — не раньше текущего месяца
        // (прошлые выплаты живут в «Истории операций»), вперёд — год, как и у collectUpcomingPayouts
        var next = pfcmOffset + delta;
        if (next < 0 || next > 12) return;
        pfcmOffset = next;
        pfcmSelKey = null;
        PF.renderNoAnim();
    };
    window.pfcmPickDay = function (k, ev) {
        if (ev) ev.stopPropagation();
        pfcmSelKey = (pfcmSelKey === k) ? null : k;
        PF.renderNoAnim();
    };
    // клик по «Ближайшая выплата»: перейти к её месяцу и раскрыть день под сеткой
    window.pfcmFocusNext = function (ev) {
        if (ev) ev.stopPropagation();
        var all = collectUpcomingPayouts();
        if (!all.length) return;
        var d = all[0].date, now = new Date();
        pfcmOffset = Math.max(0, Math.min(12, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth()));
        pfcmSelKey = pfcmKey(d);
        PF.renderNoAnim();
    };
    function pfcmCardHtml(demoMap) {
        var mon = demoMap ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : pfcmShownMonth();
        var byDay = demoMap || pfcmByDay(mon);
        var y = mon.getFullYear(), m = mon.getMonth();
        var today = new Date(); var todayKey = pfcmKey(today);
        // первая клетка — понедельник недели, в которой лежит 1-е число (getDay: Вс=0 → Пн=0)
        var first = new Date(y, m, 1);
        var lead = (first.getDay() + 6) % 7;
        var days = new Date(y, m + 1, 0).getDate();
        var cells = '';
        for (var i = 0; i < lead; i++) cells += '<span class="pfcm-e"></span>';
        var monthSum = 0, monthCnt = 0;
        for (var d = 1; d <= days; d++) {
            var k = y + '-' + m + '-' + d;
            var info = byDay[k];
            var cls = 'pfcm-d';
            var style = '', inner = '<i class="pfcm-n">' + d + '</i>';
            if (k === todayKey) cls += ' today';
            if (info) {
                monthSum += info.sum; monthCnt += info.evs.length;
                cls += ' has';
                // один портфель — подложка его цветом; несколько — нейтральный акцент и точки.
                // Сумму в клетке НЕ пишем (просьба 2026-07-14): день только маркируется цветом,
                // сумма читается по клику (список дня под сеткой) и в подсказке title.
                if (info.colors.length === 1) { cls += ' one'; style = ' style="--c:' + info.colors[0] + '"'; }
                else {
                    cls += ' multi';
                    inner += '<span class="pfcm-dots">' + info.colors.slice(0, 3).map(function (c) {
                        return '<i style="background:' + c + '"></i>'; }).join('') + '</span>';
                }
                if (pfcmSelKey === k) cls += ' sel';
            }
            var tip = info ? (ruDate(dateToIso(new Date(y, m, d))) + ' · ' + info.evs.length + ' ' +
                PF.plural(info.evs.length, 'выплата', 'выплаты', 'выплат') + ' на ' + fmtRub(info.sum)) : '';
            cells += info
                ? '<button type="button" class="' + cls + '"' + style + ' title="' + attr(tip) + '" onclick="pfcmPickDay(\'' + jsArg(k) + '\', event)">' + inner + '</button>'
                : '<span class="' + cls + '">' + inner + '</span>';
        }
        var CH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        // R11 (мокап «Обзора» 2026-07-22): большой ряд навигации и пилюля «за месяц»
        // в шапке ушли — месяц со стрелками и итог живут одной тихой строкой ПОД сеткой
        var foot = '<div class="pfcm-foot">' +
            '<button type="button" class="pfcm-arw prev"' + (pfcmOffset <= 0 && !demoMap ? ' disabled' : '') + ' aria-label="Предыдущий месяц" onclick="pfcmNav(-1, event)">' + CH + '</button>' +
            '<span class="pfcm-mon">' + PFCM_MON[m] + ' ' + y + '</span>' +
            '<button type="button" class="pfcm-arw next"' + (pfcmOffset >= 12 && !demoMap ? ' disabled' : '') + ' aria-label="Следующий месяц" onclick="pfcmNav(1, event)">' + CH + '</button>' +
            (monthCnt
                ? '<span class="pfcm-foot-tot">за месяц<b>+' + fmtRub(monthSum) + '</b></span>'
                : '<span class="pfcm-foot-tot empty">за месяц<b>выплат нет</b></span>') +
        '</div>';
        // «Ближайшая выплата» — заголовок виджета (мокап «Обзора»): дата и бумага крупно,
        // сумма зелёным; несколько выплат в один день — счётчик и сумма за день.
        // Клик подсвечивает этот день в сетке (переключая месяц, если он дальше).
        var next = '';
        if (!demoMap) {
            var all = collectUpcomingPayouts();
            if (all.length) {
                var e0 = all[0];
                var sameD = all.filter(function (e) { return sameCalDay(e.date, e0.date); });
                var kindW = e0.kind === 'div' ? 'дивиденды' : e0.kind === 'redeem' ? 'погашение' : 'купон';
                var when = e0.date.getDate() + ' ' + PAY_MON_GEN[e0.date.getMonth()];
                // облигации подписываем именем («ОФЗ 26233»), не 12-значным secid —
                // как в строках списка-календаря (там имя стоит второй строкой)
                var nTk = (e0.kind === 'div' ? e0.ticker : (e0.name || e0.ticker));
                var nTitle = sameD.length > 1
                    ? when + ' — ' + sameD.length + ' ' + PF.plural(sameD.length, 'выплата', 'выплаты', 'выплат')
                    : when + ' — ' + esc(nTk);
                var nAmt = sameD.length > 1
                    ? '+' + fmtRub(sameD.reduce(function (s, e) { return s + e.amount; }, 0)) + ' за день'
                    : kindW + ' · +' + fmtRub(e0.amount);
                next = '<button type="button" class="pfcm-next" onclick="pfcmFocusNext(event)" title="Показать день в календаре">' +
                    '<b>Ближайшая · ' + daysUntilText(e0.date) + '</b>' +
                    '<strong>' + nTitle + '</strong><em>' + nAmt + '</em></button>';
            }
        }
        // список выбранного дня — раскрывается ПОД сеткой, чтобы суммы можно было прочитать
        // по бумагам, а не только сводной цифрой в клетке
        var detail = '';
        if (pfcmSelKey && byDay[pfcmSelKey]) {
            var info2 = byDay[pfcmSelKey];
            var parts = pfcmSelKey.split('-');
            detail = '<div class="pfcm-day"><div class="pfcm-day-h"><b>' + ruDate(dateToIso(new Date(+parts[0], +parts[1], +parts[2]))) + '</b>' +
                '<span>+' + fmtRub(info2.sum) + '</span></div>' +
                info2.evs.map(function (e) {
                    var kind = e.kind === 'div' ? 'дивиденды' : e.kind === 'redeem' ? 'погашение' : 'купон';
                    return '<div class="pfcm-day-r"><i class="pfcm-day-c" style="background:' + e.pfColor + '"></i>' +
                        '<span class="pfcm-day-tk">' + esc(e.ticker) + '<em>' + kind + '</em></span>' +
                        '<b>+' + fmtRub(e.amount) + '</b></div>';
                }).join('') + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-calmblk">' +
            // кнопки конструктора — в потоке шапки (PFD_OWN_CHROME): подзаголовок и пилюля
            // «за месяц» ушли по мокапу «Обзора», но свой хром виджету по-прежнему нужен
            PF.pfCardHead('', 'Календарь выплат', '',
                '<div class="pfcm-head-r">' + PF.pfdInChromeHtml('calm') + '</div>') +
            next +
            '<div class="pfcm-wds">' + PFCM_WD.map(function (w) { return '<span class="pfcm-wd">' + w + '</span>'; }).join('') + '</div>' +
            '<div class="pfcm-grid">' + cells + '</div>' +
            detail +
            foot +
        '</div>';
    }

    // ==================================================================
    //  ИНТЕРФЕЙС ВЫПЛАТ (window.PF)
    // ==================================================================
    PF.FILTER_SVG = FILTER_SVG; PF.PFCM_WD = PFCM_WD; PF.calPfCandidates = calPfCandidates; PF.collectUpcomingPayouts = collectUpcomingPayouts;
    PF.daysUntilText = daysUntilText; PF.nextCouponDate = nextCouponDate; PF.paymentCalendarHtml = paymentCalendarHtml; PF.pfcmCardHtml = pfcmCardHtml;
    PF.pfwDivsHtml = pfwDivsHtml;
})();
