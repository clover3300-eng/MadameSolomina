/* ===== «МАСТЕР РЕБАЛАНСА» — подвкладка «Портфелей» перед «Торговлей» =====
   Полноэкранный пошаговый визард: Портфель → Режим → Расчёт → Заявка.
   Реализация 1в1 по dev/mockups/rebalance-wizard-mockups.html.
   Модуль поверх namespace window.PF (грузится в цепочке #pfLazySrc ПОСЛЕ
   portfolios-trades.js, ДО portfolios.js). Расчётные функции rb5 локальны в
   portfolios-trades.js — здесь продублированы, читают живые данные через
   PF.* и глобалы bonds/echelonTableData/bondDetailsMap + window.stkFindCompany.
   Комиссия/налог — из того же ключа pf_rebal_params, что и карточка rb5. */
(function () {
    'use strict';
    var PF = window.PF = window.PF || {};

    /* ─────────── состояние мастера (раунд 5) ─────────── */
    /* Шагов-номеров больше нет: мокап описывает ЭКРАНЫ, и состояние называет их
       так же. diag → pick → (annual: deal) | (moment: sellpick → deal) → done;
       qty/details/buypick — боковые экраны, возвращающие на deal. */
    var rbw = {
        view: 'diag',            // diag | pick | sellpick | buypick | deal | qty | details | done
        pid: null,               // выбранный портфель (чипы в верхней строке)
        mode: null,              // 'annual' | 'moment'
        cls: 'bond',             // класс для способа «в моменте»: 'bond' | 'stock'
        pick: { sell: null, buy: null, qty: null }, // ручной выбор сторон и количества
        receipt: null,           // результат исполнения (сцены 06 и 11)
        executing: false
    };
    try {
        var sv = JSON.parse(localStorage.getItem('rbw_state_v2') || 'null');
        if (sv) {
            if (sv.pid) rbw.pid = sv.pid;
            if (sv.mode) rbw.mode = sv.mode;
            if (sv.cls) rbw.cls = sv.cls;
            if (sv.pick && typeof sv.pick === 'object') rbw.pick = sv.pick;
            // экран восстанавливаем только «спокойный»: done без квитанции пуст
            if (['diag', 'pick', 'sellpick', 'deal'].indexOf(sv.view) >= 0) rbw.view = sv.view;
        }
    } catch (e) {}
    function persist() {
        try {
            localStorage.setItem('rbw_state_v2', JSON.stringify({
                pid: rbw.pid, view: rbw.view, mode: rbw.mode, cls: rbw.cls, pick: rbw.pick
            }));
        } catch (e) {}
    }
    function resetPicks() { rbw.pick = { sell: null, buy: null, qty: null }; }
    /* порог дрейфа (п.п.) — из портфеля, дефолт 3 */
    function driftThr(p) { return (p && p.driftThreshold != null && isFinite(+p.driftThreshold)) ? clamp(+p.driftThreshold, 0, 50) : 3; }

    /* ЦЕЛЬ ЯВНАЯ, а не дефолтная. targetBond(p) отвечает 40 и портфелю, которому
       цель никто не ставил, — визарду так удобно (ему всегда есть от чего
       считать). Сайдбару нельзя: насечка «цель 58» на полосе классов и бейдж
       дрейфа обязаны молчать, пока цели нет, иначе первый же день покажет
       выдуманное расхождение (мокап Б+2в, раунд 4). */
    function hasTarget(p) { return !!p && p.targetBond != null && isFinite(+p.targetBond); }

    /* ПОРОГ ДРЕЙФА ОДИН НА ПРОЕКТ — 3 п.п. (раунд 4). Персональный
       p.driftThreshold остаётся языком визарда: там пользователь настраивает
       чувствительность КОНКРЕТНОГО портфеля. Бейдж в сайдбаре и «Пульс дня» на
       «Обзоре» говорят об одном и том же событии, поэтому считают по общему
       порогу — иначе колонка и страница противоречили бы друг другу. */
    PF.DRIFT_THR = 3;

    /* Сколько портфелей просят ребаланса — для бейджа на «Ребалансе» в сайдбаре
       («Верстак», js/sidebar-ctx.js). Портфель из одного класса не дрейфует по
       определению: менять внутри класса нечего, обмена между классами нет. */
    PF.pfDriftCount = function () {
        try {
            return ((PF.store && PF.store.items) || []).filter(function (p) {
                if (!hasTarget(p)) return false;
                var c = PF.calcPf(p);
                if (!(c.stockVal > 0 && c.bondVal > 0)) return false;
                return Math.abs(c.bondPct - targetBond(p)) >= PF.DRIFT_THR;
            }).length;
        } catch (e) { return 0; }
    };

    /* Самое большое расхождение среди тех же портфелей — для подсказки на
       метке («Ребаланс · дрейф 4,1 п.п. в 1 портфеле»). Метка носит СЧЁТ, а
       величину показывает только наведение: сетка остаётся навигацией.
       Правила отбора те же, что у pfDriftCount, — цель явная, оба класса
       ненулевые; нечего показать ⇒ null, а не 0 (ноль сказал бы «дрейфа нет»,
       хотя на деле его не из чего считать). */
    PF.pfDriftMax = function () {
        try {
            var max = null;
            ((PF.store && PF.store.items) || []).forEach(function (p) {
                if (!hasTarget(p)) return;
                var c = PF.calcPf(p);
                if (!(c.stockVal > 0 && c.bondVal > 0)) return;
                var d = Math.abs(c.bondPct - targetBond(p));
                if (d >= PF.DRIFT_THR && (max === null || d > max)) max = d;
            });
            return max;
        } catch (e) { return null; }
    };

    /* Целевые доли классов по ВСЕМ портфелям — насечка на полосе табло.
       Взвешиваем по стоимости: цель портфеля на 900 тысяч весит больше цели
       портфеля на 30. Считаем только по тем, у кого цель задана, и от их же
       суммы: подмешивать бесцелевой портфель в знаменатель значит занижать
       цель тем сильнее, чем больше денег лежит вне мастера. */
    PF.pfTargetMix = function () {
        try {
            var base = 0, tb = 0;
            ((PF.store && PF.store.items) || []).forEach(function (p) {
                if (!hasTarget(p)) return;
                var v = PF.calcPf(p).value;
                if (!(v > 0)) return;
                base += v; tb += v * targetBond(p) / 100;
            });
            if (!(base > 0)) return null;
            var bond = tb / base * 100;
            return { bond: bond, stock: 100 - bond };
        } catch (e) { return null; }
    };

    /* ─────────── форматтеры / утилиты (переиспользуем PF) ─────────── */
    var fmtRub = PF.fmtRub, fmtPrice = PF.fmtPrice, fmtPct = PF.fmtPct, fmtQty = PF.fmtQty;
    var toNum = PF.toNum, clamp = PF.clamp;
    function f2(n) { return (n == null || !isFinite(n)) ? '—' : Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function d1(n) { return (n == null || !isFinite(n)) ? '—' : Number(n).toFixed(1).replace('.', ','); } // одна десятичная, запятая
    function pp(n) { return (n >= 0 ? '+' : '−') + d1(Math.abs(n)) + ' п.п.'; }                              // «+6,8 п.п.»
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function isinKey(t) { return String(t || '').split('RMFS')[0]; }
    // комиссия/налог — из ЕДИНОГО источника rb5 (PF.rbFee/rbTax читают те же rebalFee/rebalTax,
    // что и карточка ребаланса); фолбэк на ключ pf_rebal_params, если модуль ещё не отдал экспорт
    function feeTax() {
        if (PF.rbFee && PF.rbTax) return { fee: PF.rbFee(), tax: PF.rbTax() };
        var p = {}; try { p = JSON.parse(localStorage.getItem('pf_rebal_params') || '{}') || {}; } catch (e) {}
        return { fee: (p.fee != null && isFinite(+p.fee)) ? +p.fee : 0, tax: (p.tax != null && isFinite(+p.tax)) ? +p.tax : 0 };
    }
    // bonds/echelonTableData объявлены в data.js как ЛЕКСИЧЕСКИЕ глобалы (let/const):
    // доступны по «голому» имени из classic-скрипта, но НЕ как window.bonds.
    function allBonds() { try { return (typeof bonds !== 'undefined' && Array.isArray(bonds)) ? bonds : []; } catch (e) { return []; } }
    function allEch() { try { return (typeof echelonTableData !== 'undefined' && Array.isArray(echelonTableData)) ? echelonTableData : []; } catch (e) { return []; } }
    // НДФЛ с реализованной прибыли (рост цены × кол-во); ставка из pf_rebal_params (дефолт 0 → скрыто)
    function saleTax(sell, qty) {
        var t = feeTax().tax; if (!(t > 0) || !sell || !(qty > 0)) return 0;
        var basis = (sell.buy != null && isFinite(sell.buy)) ? sell.buy : sell.price;
        var gain = qty * ((sell.price || 0) - basis);
        return Math.max(0, gain) * t;
    }
    var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    function fmtDate(iso) { if (!iso) return '—'; var a = String(iso).split('-'); if (a.length < 3) return iso; return (+a[2]) + ' ' + MONTHS[(+a[1]) - 1] + ' ' + a[0]; }
    function todayIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    // прогноз на год после ребаланса: годовой купонный доход + доходность портфеля vs рынок ОФЗ
    function buildForecast(p) {
        var c = PF.calcPf(p);
        var coupYear = heldBonds(p).reduce(function (s, x) { return s + x.coupYear; }, 0);
        var yieldPct = c.value > 0 ? coupYear / c.value * 100 : 0;
        var ys = bondCands().map(function (x) { return x.yield; }).filter(function (y) { return y != null && isFinite(y); });
        var marketOfz = ys.length ? ys.reduce(function (a, b) { return a + b; }, 0) / ys.length : null;
        return { coupYear: coupYear, yieldPct: yieldPct, marketOfz: marketOfz, value: c.value };
    }
    // ВСЕ портфели (в т.ч. скрытые и брокерские): скрытие прячет карточку только
    // из «Обзора», но НЕ из перечней/выбора (правило проекта hide-scope-overview-only)
    function portfolios() { return ((PF.store && PF.store.items) || []).slice(); }
    /* Портфель по умолчанию — тот, где расхождение с планом больше: экрана
       выбора портфеля в раунде 5 нет, чипы наверху лишь переключают уже
       выбранный. Пустой pid значит «мастер открыли впервые». */
    function curPf() {
        var p = rbw.pid ? PF.findPf(rbw.pid) : null;
        if (p) return p;
        var list = portfolios(); if (!list.length) return null;
        var best = list[0], bestD = -1;
        list.forEach(function (x) {
            if (!hasTarget(x)) return;
            var c = PF.calcPf(x); if (!(c.stockVal > 0 && c.bondVal > 0)) return;
            var d = Math.abs(c.bondPct - targetBond(x));
            if (d > bestD) { bestD = d; best = x; }
        });
        rbw.pid = best.id;
        return best;
    }
    function find(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
    function plur(n, one, few, many) {
        n = Math.abs(n) % 100; var n1 = n % 10;
        if (n > 10 && n < 20) return many; if (n1 > 1 && n1 < 5) return few; if (n1 === 1) return one; return many;
    }

    /* ─────────── иконки ─────────── */
    function ico(p, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.7) + '" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
    var IC = {
        back: ico('<path d="M15 18l-6-6 6-6"/>'),
        scale: ico('<path d="M12 3v18M5 21h14M6 7l-3 6h6zM18 7l-3 6h6zM6 7l6-2 6 2"/>'),
        spark: ico('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
        coin: ico('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
        bars: ico('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
        term: ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>'),
        search: ico('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>', 1.8),
        info: ico('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>', 1.8),
        warn: ico('<path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17h.01"/>', 1.8),
        bell: ico('<path d="M6 8a6 6 0 0112 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21a2 2 0 004 0"/>', 1.8),
        lock: ico('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', 1.8),
        swap: ico('<path d="M8 4v16M8 4L5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3"/>'),
        eye: ico('<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
        auto: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>')
    };
    function mono2(name) {
        var s = String(name || '').replace(/^ОФЗ\s*/i, '');
        var d = s.match(/\d{4,5}/); if (d) return d[0].slice(-2);
        return s.replace(/[^A-Za-zА-Яа-я]/g, '').slice(0, 2).toUpperCase();
    }
    /* ═══════════ РАСЧЁТ ═══════════
       Ядро формул («машина денег») — из ЕДИНОГО модуля rb5 через PF.rb* (см.
       portfolios-trades.js), чтобы карточка и мастер не разъезжались. Здесь —
       только оркестровка (списки кандидатов/held, qty-aware обёртки). */
    function bondYieldOf(isin, det) {
        var bs = allBonds();
        for (var i = 0; i < bs.length; i++) if (isinKey(bs[i].t) === isinKey(isin)) { var y = toNum(bs[i].y); if (isFinite(y)) return y; }
        if (det && det.couponYield != null) { var y2 = toNum(det.couponYield); if (isFinite(y2)) return y2; }
        return null;
    }
    function bondEconAt(det, costUnit, nkdNow, face) { return PF.rbBondEconAt ? PF.rbBondEconAt(det, costUnit, nkdNow, face) : null; }
    function bondQtyFor1More(unitS, unitB, maxQty) { return PF.rbBondQtyFor1More ? PF.rbBondQtyFor1More(unitS, unitB, maxQty) : null; }
    /* мои облигации портфеля */
    function heldBonds(p) {
        var c = PF.calcPf(p), out = [];
        c.hs.forEach(function (x) {
            if (x.h.type !== 'bond') return;
            var h = x.h, ck = x.c, isin = h.ticker, lv = (PF.liveBond ? PF.liveBond(isin) : null) || {};
            var price = lv.price > 0 ? lv.price : (ck.cur || 0);
            var nkd = (lv.nkd != null && isFinite(lv.nkd)) ? lv.nkd : (ck.curNkd || 0);
            var det = (PF.bondDetail ? PF.bondDetail(isin) : null) || {};
            var face = (PF.bondFace ? PF.bondFace(isin) : 0) || 1000;
            var coupon = +det.couponValue || 0, freq = +det.freq || 0;
            // «доходность в моменте в пересчёте на годовые» = насколько бумага выросла с покупки, годовых.
            // Продаём ту, где она максимальна (рывок цены — фиксируем прибыль).
            // «Доходность в моменте, годовых» — по формуле владельца (та же форма, что в карточке):
            //   прибыль ÷ дней держания = прибыль/день; × 365 = прибыль/год; ÷ вложено × 100 = годовых.
            var momYield = (ck.days > 0 && ck.invested > 0)
                ? (ck.pnl / ck.days) * 365 / ck.invested * 100
                : (ck.pnlPct || 0);
            // Доходность к погашению «в моменте» и прибыль в день — ТА ЖЕ формула bondEconAt,
            // что в карточке, но от ТЕКУЩЕЙ цены (price+nkd), а НЕ от цены покупки. Иначе бумага,
            // купленная дёшево, показывала бы фантомные 85% (мой локнутый YTM) против рыночных
            // 13% у кандидатов — несравнимо. От текущей цены обе стороны в одной системе координат.
            var econ = bondEconAt(det, price + nkd, nkd, face);
            var ytm = (econ && isFinite(econ.annual)) ? econ.annual : bondYieldOf(isin, det);
            out.push({ h: h, id: h.id, isin: isin, name: h.name || isin, qty: ck.qty, price: price, nkd: nkd,
                unit: price + nkd, yield: ytm, econ: econ, det: det, face: face, coupon: coupon, freq: freq,
                coupYear: coupon * freq * ck.qty, val: ck.value, buy: ck.buy, pnl: ck.pnl, invested: ck.invested, momYield: momYield });
        });
        return out;
    }
    function bondCands() {
        // источник и экономика — ТЕ ЖЕ, что в карточке rb5: ofzMarket()+ofzCand() дают
        // годовую доходность к погашению (econ.annual) и прибыль в день (econ.perDay).
        if (PF.rbOfzMarket && PF.rbOfzCand) {
            var mk = PF.rbOfzMarket() || [], out = [];
            mk.forEach(function (b) {
                if (!(b.price > 0)) return;
                var cd = PF.rbOfzCand(b), det = (PF.bondDetail ? PF.bondDetail(isinKey(b.t)) : null) || {};
                var yv = (cd.econ && isFinite(cd.econ.annual)) ? cd.econ.annual : toNum(b.sheetYield);
                out.push({ t: b.t, isin: isinKey(b.t), name: b.n || b.t, price: b.price, nkd: b.nkd, unit: cd.unit,
                    yield: yv, econ: cd.econ, coupon: +det.couponValue || 0, freq: +det.freq || 2 });
            });
            return out;
        }
        var bs = allBonds(), out2 = [];
        bs.forEach(function (b) {
            var isin = isinKey(b.t), lv = (PF.liveBond ? PF.liveBond(isin) : null) || {};
            var price = lv.price > 0 ? lv.price : (+b.p || 0);
            var nkd = (lv.nkd != null && isFinite(lv.nkd)) ? lv.nkd : (+b.nkd || 0);
            var det = (PF.bondDetail ? PF.bondDetail(isin) : null) || {};
            var coupon = +det.couponValue || 0, freq = +det.freq || 2;
            if (!(price > 0)) return;
            out2.push({ t: b.t, isin: isin, name: b.n || isin, price: price, nkd: nkd, unit: price + nkd,
                yield: toNum(b.y), econ: null, coupon: coupon, freq: freq });
        });
        return out2;
    }
    /* мои акции */
    function heldStocks(p) {
        var c = PF.calcPf(p), out = [];
        c.hs.forEach(function (x) {
            if (x.h.type === 'bond') return;
            var h = x.h, ck = x.c;
            var pot = PF.rbLivePotential ? PF.rbLivePotential(h) : (PF.potentialOf ? PF.potentialOf(h.ticker) : null);
            out.push({ h: h, id: h.id, ticker: h.ticker, name: h.name || h.ticker, qty: ck.qty,
                price: ck.cur || 0, pot: pot, ech: echelonOf(h.ticker), val: ck.value, pnlPct: ck.pnlPct, buy: ck.buy,
                pnl: ck.pnl, invested: ck.invested });
        });
        return out;
    }
    // эшелон/цена акции — из единого модуля rb5 (PF.rb*); фолбэк — те же глобалы
    function echelonOf(ticker) {
        if (PF.rbEchelonOf) return PF.rbEchelonOf(ticker);
        if (typeof window.stkFindCompany === 'function') { var co = window.stkFindCompany(ticker); if (co && co.main) { var n = toNum(co.main['ЭШЕЛОН']); if (isFinite(n)) return n; } }
        return 0;
    }
    function stkPriceOf(tk) {
        if (PF.rbStkPriceOf) return PF.rbStkPriceOf(tk);
        if (typeof window.stkFindCompany === 'function') { var co = window.stkFindCompany(tk); if (co && co.main) { var n = toNum(co.main['Текущая Цена']); if (isFinite(n) && n > 0) return n; } }
        return 0;
    }
    function stockCandsFor(ech) {
        var ed = allEch(), out = [];
        if (!ed || !ed.length) return out;
        ed.forEach(function (arr, e) {
            if (ech >= 1 && (e + 1) !== ech) return;
            (arr || []).forEach(function (a) {
                var pot = toNum(a.target); if (!isFinite(pot)) pot = (PF.potentialOf ? PF.potentialOf(a.t) : null);
                out.push({ ticker: a.t, name: a.n || a.t, sector: a.sector, ech: e + 1, pot: pot, price: stkPriceOf(a.t) });
            });
        });
        out.sort(function (a, b) { return (b.pot || -1e9) - (a.pot || -1e9); });
        return out;
    }

    function computeBondDeal(p, sell, buy, qtyOverride) {
        if (!sell || !buy) return null;
        var f = feeTax().fee, maxQty = sell.qty;
        var suggest = bondQtyFor1More(sell.unit, buy.unit, maxQty) || Math.max(1, Math.round(maxQty / 2));
        var qty = (qtyOverride != null) ? clamp(Math.round(qtyOverride), 1, maxQty) : suggest;
        var proceeds = qty * sell.unit * (1 - f);
        var buyQty = buy.unit > 0 ? Math.floor(proceeds / (buy.unit * (1 + f))) : 0;
        var rest = proceeds - buyQty * buy.unit * (1 + f);
        var coupAll = heldBonds(p).reduce(function (s, x) { return s + x.coupYear; }, 0);
        var coupAfter = coupAll - qty * sell.coupon * sell.freq + buyQty * buy.coupon * buy.freq;
        return { qty: qty, maxQty: maxQty, suggest: suggest, proceeds: proceeds, buyQty: buyQty, rest: rest,
            coupBefore: coupAll, coupAfter: coupAfter, coupDelta: coupAfter - coupAll, more: buyQty - qty };
    }
    /* обобщённый обмен для годового режима: стороны могут быть РАЗНЫХ классов,
       поэтому цена за штуку берётся по классу каждой ноги (облигация — с НКД) */
    function computeCrossDeal(sellUnit, buyUnit, maxQty, qtyOverride) {
        var f = feeTax().fee;
        var qty = (qtyOverride != null) ? clamp(Math.round(qtyOverride), 1, maxQty) : Math.max(1, Math.round(maxQty / 2));
        var proceeds = qty * sellUnit * (1 - f);
        var buyQty = buyUnit > 0 ? Math.floor(proceeds / (buyUnit * (1 + f))) : 0;
        var rest = proceeds - buyQty * buyUnit * (1 + f);
        return { qty: qty, maxQty: maxQty, proceeds: proceeds, buyQty: buyQty, rest: rest };
    }
    function computeStockDeal(sell, buy, qtyOverride) {
        if (!sell || !buy || !(sell.qty > 0) || !(sell.price > 0)) return null;
        var f = feeTax().fee;
        var qty = (qtyOverride != null) ? clamp(Math.round(qtyOverride), 1, sell.qty) : Math.max(1, Math.round(sell.qty / 2));
        var priceN = buy.price > 0 ? buy.price : stkPriceOf(buy.ticker);
        var proceeds = qty * sell.price * (1 - f);
        var buyQty = priceN > 0 ? Math.floor(proceeds / (priceN * (1 + f))) : 0;
        var rest = priceN > 0 ? proceeds - buyQty * priceN * (1 + f) : 0;
        return { qty: qty, maxQty: sell.qty, proceeds: proceeds, priceN: priceN, buyQty: buyQty, rest: rest,
            potFrom: sell.pot, potTo: buy.pot, potDelta: (sell.pot != null && buy.pot != null) ? buy.pot - sell.pot : null };
    }

    /* цель по облигациям (доля %); дефолт 40 (портфель 60/40) */
    function targetBond(p) {
        return (p.targetBond != null && isFinite(+p.targetBond)) ? clamp(Math.round(+p.targetBond), 0, 100) : 40;
    }
    /* «over»-класс (перевес) для годового режима */
    function overClass(p) {
        var c = PF.calcPf(p), tb = targetBond(p);
        return c.bondPct > tb ? 'bond' : 'stock';
    }

    /* автоподбор пары облигаций → { sellId, buyId } или null.
       ПРАВИЛО (машина денег): ПРОДАЁМ бумагу, чья доходность в моменте (годовых)
       максимальна — она сильнее всех выросла в цене, фиксируем прибыль.
       ПОКУПАЕМ более доходную к погашению и дешевле, чтобы бумаг стало больше. */
    function autoBondPair(p, fixSell, fixBuy) {
        var bs = heldBonds(p), cands = bondCands(), f = feeTax().fee;
        // 1) сторона продажи: макс. «доходность в моменте» (годовой прирост цены)
        var sell = null;
        bs.forEach(function (s) {
            if (fixSell && s.id !== fixSell) return;
            if (!(s.qty > 0) || !(s.unit > 0)) return;
            var m = (s.momYield != null && isFinite(s.momYield)) ? s.momYield : -1e9;
            if (!sell || m > sell.m) sell = { s: s, m: m };
        });
        if (!sell) return null;
        var s = sell.s;
        // 2) сторона покупки: доходнее (YTM) и дешевле → бумаг больше (buyQty > qty)
        var buy = null;
        cands.forEach(function (cd) {
            if (fixBuy && cd.isin !== fixBuy) return;
            if (isinKey(cd.isin) === isinKey(s.isin)) return;
            if (cd.yield == null || !(cd.unit > 0)) return;
            var buyQty = Math.floor(s.qty * s.unit * (1 - f) / (cd.unit * (1 + f)));
            var more = buyQty - s.qty;                 // >0 → купили больше, чем продали
            var better = (s.yield != null && cd.yield > s.yield) ? 1 : 0;   // доходнее проданной
            // приоритет: (доходнее) → (бумаг больше) → (дешевле) → (сама доходность)
            var score = better * 1e12 + (more > 0 ? 1e9 : 0) + (cd.unit < s.unit ? 1e6 : 0) + cd.yield;
            if (!buy || score > buy.score) buy = { cd: cd, score: score };
        });
        if (!buy) return null;
        return { sellId: s.id, buyId: buy.cd.isin };
    }
    function autoStockPair(p, fixSell, fixBuy) {
        var ss = heldStocks(p), best = null;
        ss.forEach(function (s) {
            if (fixSell && s.id !== fixSell) return;
            if (s.pot == null || !(s.qty > 0) || !(s.price > 0)) return;
            var cnds = stockCandsFor(s.ech >= 1 ? s.ech : 0);
            if (s.ech >= 1 && !cnds.length) cnds = stockCandsFor(0);
            cnds.forEach(function (cn) {
                if (fixBuy && cn.ticker !== fixBuy) return;
                if (cn.ticker === s.ticker || cn.pot == null) return;
                var delta = cn.pot - s.pot; if (!(delta > 0)) return;
                var d = computeStockDeal(s, cn); if (!d || !(d.buyQty > 0)) return;
                if (!best || delta > best.delta) best = { sellId: s.id, buyId: cn.ticker, delta: delta };
            });
        });
        return best;
    }

    /* нормализованный контекст сделки для текущего состояния */
    function dealCtx() {
        var p = curPf(); if (!p) return null;
        if (rbw.mode === 'annual') {
            var over = overClass(p), c = PF.calcPf(p), tb = targetBond(p);
            var sellClass = over, buyClass = over === 'bond' ? 'stock' : 'bond';
            // сколько переложить, чтобы вернуть к цели (без новых денег)
            var move = over === 'bond' ? (c.bondVal - c.value * tb / 100) : (c.stockVal - c.value * (100 - tb) / 100);
            move = Math.max(0, move);
            var sell = resolveSell(p, sellClass), buy = resolveBuy(p, buyClass, sell);
            if (!sell || !buy) return { kind: 'annual', p: p, over: over, move: move, c: c, tb: tb, sellClass: sellClass, buyClass: buyClass, sell: sell, buy: buy, deal: null };
            var sellUnitA = sellClass === 'bond' ? sell.unit : sell.price;
            var buyUnitA = buyClass === 'bond' ? buy.unit : buy.price;
            var qty = rbw.pick.qty != null ? rbw.pick.qty : (sellUnitA > 0 ? clamp(Math.round(move / sellUnitA), 1, sell.qty) : 1);
            var deal = computeCrossDeal(sellUnitA, buyUnitA, sell.qty, qty);
            return { kind: 'annual', p: p, over: over, move: move, c: c, tb: tb, sellClass: sellClass, buyClass: buyClass, sell: sell, buy: buy, deal: deal };
        }
        // moment
        var cls = rbw.cls;
        var s2 = resolveSell(p, cls), b2 = resolveBuy(p, cls, s2);
        var deal2 = null;
        if (s2 && b2) deal2 = cls === 'bond' ? computeBondDeal(p, s2, b2, rbw.pick.qty) : computeStockDeal(s2, b2, rbw.pick.qty);
        return { kind: 'moment', p: p, cls: cls, sellClass: cls, buyClass: cls, sell: s2, buy: b2, deal: deal2 };
    }
    function resolveSell(p, cls) {
        var list = cls === 'bond' ? heldBonds(p) : heldStocks(p);
        if (!list.length) return null;
        var id = rbw.pick.sell;
        if (id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; }
        // авто-дефолт
        var auto = cls === 'bond' ? autoBondPair(p) : autoStockPair(p);
        if (auto) { for (var j = 0; j < list.length; j++) if (list[j].id === auto.sellId) return list[j]; }
        // фолбэк: облигации — макс. доходность в моменте; акции — крупнейшая позиция
        if (cls === 'bond') return list.slice().sort(function (a, b) { return (b.momYield || -1e9) - (a.momYield || -1e9); })[0];
        return list.slice().sort(function (a, b) { return b.val - a.val; })[0];
    }
    function resolveBuy(p, cls, sell) {
        var list = cls === 'bond' ? bondCands() : stockCandsFor(sell ? (sell.ech || 0) : 0);
        if (!list.length && cls === 'stock') list = stockCandsFor(0);
        if (!list.length) return null;
        var id = rbw.pick.buy, keyf = cls === 'bond' ? function (x) { return x.isin; } : function (x) { return x.ticker; };
        // исключаем продаваемую (для moment)
        if (sell && cls === 'bond') list = list.filter(function (x) { return isinKey(x.isin) !== isinKey(sell.isin); });
        if (sell && cls === 'stock') list = list.filter(function (x) { return x.ticker !== sell.ticker; });
        if (id) { for (var i = 0; i < list.length; i++) if (keyf(list[i]) === id) return list[i]; }
        var auto = cls === 'bond' ? autoBondPair(p, sell ? sell.id : null) : autoStockPair(p, sell ? sell.id : null);
        if (auto) { for (var j = 0; j < list.length; j++) if (keyf(list[j]) === auto.buyId) return list[j]; }
        // фолбэк: bond — дешевле продаваемой (бумаг больше), затем доходнее; stock — макс потенциал
        if (cls === 'bond') {
            var su = sell ? sell.unit : Infinity;
            return list.slice().sort(function (a, b) {
                var ac = a.unit < su ? 1 : 0, bc = b.unit < su ? 1 : 0;
                if (ac !== bc) return bc - ac;
                return (b.yield || 0) - (a.yield || 0);
            })[0];
        }
        return list[0];
    }

    /* доли после сделки (для строки результата/готово) */
    function allocAfter(p, ctx) {
        var c = PF.calcPf(p);
        if (!ctx || !ctx.deal) return { bondPct: c.bondPct, stockPct: c.stockPct };
        var bondV = c.bondVal, stockV = c.stockVal, d = ctx.deal;
        var sellV = d.qty * (ctx.sellClass === 'bond' ? ctx.sell.unit : ctx.sell.price);
        var buyV = d.buyQty * (ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price);
        if (ctx.sellClass === 'bond') bondV -= sellV; else stockV -= sellV;
        if (ctx.buyClass === 'bond') bondV += buyV; else stockV += buyV;
        var tot = bondV + stockV;
        return { bondPct: tot > 0 ? bondV / tot * 100 : 0, stockPct: tot > 0 ? stockV / tot * 100 : 0 };
    }

    /* ═══════════ РЕНДЕР · РАУНД 5 ═══════════
       Разметка перенесена ИЗ МОКАПА dev/mockups/rebalance-wizard5-mockups.html
       поэлементно: те же классы, тот же порядок узлов, те же инлайновые стили,
       те же слова. Данные подставляются в места, где в мокапе стояли примеры.

       НАЗВАННЫЕ ОТСТУПЛЕНИЯ ПО ТЕКСТУ (данных для мокапного варианта нет):
       · «подорожала на 3,1 % за месяц» → «подорожала на 3,1 %»: месячного ряда
         цен у мастера нет, есть изменение с покупки; срок держания вынесен в
         подпись строки («куплена 2 года назад»), как в мокапе;
       · «налог 0 ₽, бумаги куплены больше трёх лет назад» → причина пишется по
         факту: ставка НДФЛ берётся из pf_rebal_params, и при нулевой ставке
         строка так и говорит.
       Раскладка, кегли, отступы и порядок блоков не тронуты нигде. */

    var ARR = ico('<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>', 2);
    var CHEV = ico('<path d="M9 6l6 6-6 6"/>', 2);
    var SWAP2 = ico('<path d="M4 9h15l-4-4"/><path d="M20 15H5l4 4"/>', 1.9);
    var CHECK = ico('<path d="M20 6L9 17l-5-5"/>', 2.4);
    var BACK = ico('<path d="M15 18l-6-6 6-6"/>', 1.9);

    function pct0(n) { return Math.max(0, Math.min(100, Math.round(n || 0))); }
    function rub(n) { return fmtRub(n); }
    function nameOf(x, cls) { return cls === 'bond' ? (x.name || x.isin) : (x.ticker || x.name); }
    function clock() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function planStr(p) { var tb = targetBond(p); return (100 - tb) + ' / ' + tb; }
    function devOf(p) { var c = PF.calcPf(p); return c.stockPct - (100 - targetBond(p)); } // >0 — акций больше плана
    function oneClass(p) { var c = PF.calcPf(p); return !(c.stockVal > 0 && c.bondVal > 0); }
    function annualOk(p) { return !!p && hasTarget(p) && !oneClass(p); }
    function heldOf(p, cls) { return cls === 'bond' ? heldBonds(p) : heldStocks(p); }
    /* рост с покупки, %: тот же ck.pnl/ck.invested, из которого считается momYield */
    function growPct(x) { return (x && x.invested > 0) ? (x.pnl / x.invested * 100) : (x && x.pnlPct) || 0; }
    function heldSorted(p, cls) {
        return heldOf(p, cls).slice().sort(function (a, b) { return (b.momYield || -1e9) - (a.momYield || -1e9); });
    }
    function ageStr(x) {
        var d = x && x.h && x.h.lots && x.h.lots.length ? x.h.lots[0].buyDate : null;
        if (!d) return null;
        var days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        if (!(days >= 0)) return null;
        if (days < 45) return 'куплена ' + days + ' ' + plur(days, 'день', 'дня', 'дней') + ' назад';
        if (days < 365) { var mo = Math.round(days / 30); return 'куплена ' + mo + ' ' + plur(mo, 'месяц', 'месяца', 'месяцев') + ' назад'; }
        var yr = Math.round(days / 365); return 'куплена ' + yr + ' ' + plur(yr, 'год', 'года', 'лет') + ' назад';
    }
    /* сколько минимум продать, чтобы бумаг стало хотя бы на одну больше */
    function minQtyForMore(sell, buy) {
        if (!sell || !buy || !(sell.unit > 0) || !(buy.unit > 0)) return null;
        var q = bondQtyFor1More(sell.unit, buy.unit, sell.qty);
        return (q > 0) ? q : null;
    }

    /* ── верхняя строка (одинакова на всех сценах мокапа) ── */
    function pfDot(p) {
        if (!annualOk(p)) return false;
        return Math.abs(PF.calcPf(p).stockPct - (100 - targetBond(p))) >= driftThr(p);
    }
    function topHtml(o) {
        var chips;
        if (o.onePf) {
            var p0 = curPf();
            chips = '<span class="r5-pf on">' + esc(p0 ? p0.name : '—') + (pfDot(p0) ? '<i></i>' : '') + '</span>';
        } else {
            chips = portfolios().map(function (p) {
                return '<span class="r5-pf' + (p.id === rbw.pid ? ' on' : '') + '" onclick="rbwPickPf(\'' + esc(p.id) + '\')">'
                    + esc(p.name) + (pfDot(p) ? '<i></i>' : '') + '</span>';
            }).join('');
        }
        return '<div class="r5-top">'
            + '<button class="r5-back" onclick="' + (o.backFn || 'rbwExit()') + '">' + BACK + esc(o.back || 'Портфели') + '</button>'
            + '<div class="r5-brand"><em>' + esc(o.eyebrow) + '</em><b>' + esc(o.name) + '</b></div>'
            + '<div class="r5-pfs">' + chips + '</div>'
            + '<span class="r5-clock">MOEX · ' + clock() + '</span></div>';
    }
    function stage(cls, inner, style) {
        return '<div class="r5-stage' + (cls ? ' ' + cls : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' + inner + '</div>';
    }
    var GLOW = '<div class="r5-glow"></div>';
    function btn(label, onclick, mod, dis) {
        return '<button class="r5-btn' + (mod ? ' ' + mod : '') + '"' + (dis ? ' disabled' : ' onclick="' + onclick + '"') + '>' + label + '</button>';
    }
    function quiet(label, onclick, chev) {
        return '<span class="r5-quiet"' + (onclick ? ' onclick="' + onclick + '"' : '') + '>' + label + (chev ? '\n        ' + CHEV : '') + '</span>';
    }

    /* ── две полосы «Сейчас / По плану» (сцены 02 и 12) ── */
    function browPair(stockNow, stockPlan) {
        var n = pct0(stockNow), pl = pct0(stockPlan);
        return '<div class="r5-brow"><em>Сейчас</em>'
            + '<span class="r5-bbar"><i class="st" style="width:' + n + '%"></i><i class="bd" style="width:' + (100 - n) + '%"></i></span>'
            + '<b class="num">' + n + ' / ' + (100 - n) + '</b></div>'
            + '<div class="r5-brow plan"><em>По плану</em>'
            + '<span class="r5-bbar"><i class="st" style="width:' + pl + '%"></i><i class="bd" style="width:' + (100 - pl) + '%"></i></span>'
            + '<b class="num">' + pl + ' / ' + (100 - pl) + '</b></div>';
    }

    /* ═══ СЦЕНА 01 · «Что происходит» ═══ */
    function viewDiag() {
        var p = curPf();
        if (!p) return viewNoPf();
        if (!annualOk(p)) return viewCalm();
        var c = PF.calcPf(p), tgtStock = 100 - targetBond(p), dev = c.stockPct - tgtStock;
        if (Math.abs(dev) < driftThr(p)) return viewCalm();

        var over = dev > 0 ? 'stock' : 'bond', ad = Math.abs(dev);
        var move = Math.max(0, over === 'stock' ? (c.stockVal - c.value * tgtStock / 100) : (c.bondVal - c.value * targetBond(p) / 100));
        var lo = Math.min(c.stockPct, tgtStock), w = ad;

        var head = '<div class="r5-kick">Портфель «' + esc(p.name) + '» · <b>' + rub(c.value) + '</b> · план ' + planStr(p) + '</div>'
            + '<div class="r5-h1">' + (over === 'stock' ? 'Акций' : 'Облигаций') + ' стало больше плана '
                + '<span style="color:var(--amb)">на ' + d1(ad) + ' %</span>.</div>'
            + '<div class="r5-sub" style="max-width:820px">Так бывает само собой: ' + (over === 'stock' ? 'акции выросли сильнее облигаций' : 'облигации выросли сильнее акций')
                + ', и портфель стал ' + (over === 'stock' ? 'рискованнее' : 'осторожнее') + ', чем вы задумывали. Это лечится <b>одним обменом</b> — '
                + 'заштрихованный кусок и есть те деньги, которые надо переложить.</div>';

        var bar = '<div class="r5-hb">'
            + '<div class="r5-hb-hd">'
                + '<div class="s"><b class="num st">' + pct0(c.stockPct) + ' %</b><span>Акции · ' + rub(c.stockVal) + '</span></div>'
                + '<div class="s r"><b class="num bd">' + pct0(c.bondPct) + ' %</b><span>Облигации · ' + rub(c.bondVal) + '</span></div>'
            + '</div>'
            + '<div class="r5-bar">'
                + (over === 'stock'
                    ? '<i class="st" style="width:' + tgtStock + '%"></i><i class="over" style="width:' + ad + '%"></i><i class="bd" style="width:' + (100 - c.stockPct) + '%"></i>'
                    : '<i class="st" style="width:' + c.stockPct + '%"></i><i class="over" style="width:' + ad + '%"></i><i class="bd" style="width:' + (100 - tgtStock) + '%"></i>')
                + '<u class="tgt" style="left:' + tgtStock + '%"></u>'
                + '<span class="tgtlbl" style="left:' + tgtStock + '%">план ' + planStr(p) + '</span>'
                + '<span class="r5-brace" style="left:' + lo + '%;width:' + w + '%"></span>'
                + '<span class="r5-bracelbl" style="left:' + (lo + w / 2) + '%"><b>' + rub(move) + '</b><span>столько нужно переложить</span></span>'
            + '</div>'
            + '<div class="r5-legend">'
                + '<span><i class="st"></i>акции</span><span><i class="bd"></i>облигации</span>'
                + '<span><i class="hz"></i>сверх плана — это и есть будущая сделка</span><span><i class="tg"></i>план</span>'
            + '</div></div>';

        var acts = '<div class="r5-acts" style="margin-top:36px;padding-bottom:0">'
            + btn('Что можно сделать ' + ARR, 'rbwGo(\'pick\')')
            + quiet('Изменить план портфеля', 'rbwEditPlan()')
            + '<span class="sp"></span>'
            + quiet('Ничего не делать, напомнить через год', 'rbwRemind(12)')
            + '</div>';

        return topHtml({ eyebrow: 'Ребаланс', name: p.name })
            + stage('center', GLOW + head + bar + acts);
    }

    /* ═══ СЦЕНА 12 · «Здесь всё в порядке» ═══ */
    function viewCalm() {
        var p = curPf();
        if (!p) return viewNoPf();
        var c = PF.calcPf(p), hasT = annualOk(p), tgtStock = 100 - targetBond(p);
        var dev = hasT ? Math.abs(c.stockPct - tgtStock) : null;
        var sub = hasT
            ? 'У вас <b>' + pct0(c.stockPct) + ' % акций и ' + pct0(c.bondPct) + ' % облигаций</b> — это и есть ваш план. '
                + 'Обмен на такой разнице стоил бы дороже, чем дал бы. <b>Делать ничего не нужно.</b>'
            : (oneClass(p)
                ? 'В портфеле бумаги одного типа — выравнивать акции с облигациями нечего. <b>Доступен только обмен «в моменте».</b>'
                : 'Плана по долям у этого портфеля нет — сверять не с чем. <b>Задайте план, и мастер посчитает обмен.</b>');

        var body = '<div class="r5-calm">'
            + '<div class="r5-kick">Портфель «' + esc(p.name) + '» · <b>' + rub(c.value) + '</b></div>'
            + '<div class="r5-h1" style="font-size:52px">' + (hasT ? 'Здесь всё в порядке.' : (oneClass(p) ? 'Здесь один тип бумаг.' : 'План не задан.')) + '</div>'
            + '<div class="r5-sub" style="font-size:16.5px;max-width:780px">' + sub + '</div>'
            + (hasT ? '<div style="margin-top:36px;max-width:820px">' + browPair(c.stockPct, tgtStock) + '</div>' : '')
            + '<div class="r5-acts" style="margin-top:0;padding-top:38px">'
                + (hasT ? btn('Напомнить ' + fmtDate(nextReviewOf(p)), 'rbwRemind(12)', 'ghost')
                        : btn('Задать план портфеля ' + ARR, 'rbwEditPlan()'))
                + quiet('Изменить план портфеля', 'rbwEditPlan()')
                + quiet('Сверить другой портфель', 'rbwNextPf()')
            + '</div></div>';

        var best = momentBest(p);
        var hint = best ? '<div class="r5-hint">'
            + '<div class="t"><b>Одна возможность всё-таки есть.</b> Ваша ' + esc(nameOf(best.sell, best.cls))
                + ' подорожала на ' + d1(growPct(best.sell)) + ' % — её можно продать и на те же деньги взять больше бумаг подешевле. '
                + 'Доли при этом не сдвинутся.</div>'
            + '<span class="sp" style="flex:1"></span>'
            + btn('Посмотреть обмен', 'rbwStartMoment()', 'ghost')
            + '</div>' : '';

        return topHtml({ eyebrow: 'Ребаланс', name: p.name })
            + stage('', body + hint, 'padding-top:96px');
    }

    /* ═══ СЦЕНА 02 · «Что будем делать» ═══ */
    function viewPick() {
        var p = curPf();
        if (!p) return viewNoPf();
        var c = PF.calcPf(p), tgtStock = 100 - targetBond(p), dev = c.stockPct - tgtStock, ad = Math.abs(dev);
        var hasT = annualOk(p), reco = hasT && ad >= driftThr(p);

        var noteA = hasT
            ? (ad >= driftThr(p)
                ? (dev > 0 ? 'Акций' : 'Облигаций') + ' у вас <b>на ' + d1(ad) + ' % больше</b>, чем вы задумывали. Один обмен это выправит.'
                : 'Доли держатся плана — расхождение всего ' + d1(ad) + ' %. Обмен сейчас почти ничего не изменит.')
            : (oneClass(p) ? 'Нужны и акции, и облигации: в портфеле бумаги одного типа.' : 'План по долям не задан — сверять не с чем.');
        var cardA = '<div class="r5-pc' + (reco ? ' reco' : '') + (hasT ? '' : ' dis') + '">'
            + (reco ? '<span class="r5-pc-tag">советуем</span>' : '')
            + '<h3>Раз в год</h3>'
            + '<p>Вернуть портфель к плану: продать то, чего стало слишком много, и купить то, чего не хватает.</p>'
            + '<div class="r5-pc-fig">' + (hasT ? browPair(c.stockPct, tgtStock)
                : '<div class="r5-pc-note" style="margin-top:0">Здесь появятся две полосы — «сейчас» и «по плану».</div>') + '</div>'
            + '<div class="r5-pc-note">' + noteA + '</div>'
            + '<div class="r5-pc-go">' + btn('Выбрать этот способ\n          ' + ARR, 'rbwStartAnnual()', (reco ? 'acc full' : 'ghost full'), !hasT) + '</div>'
            + '</div>';

        var best = momentBest(p), figB, noteB;
        if (best && best.deal && best.deal.buyQty > 0) {
            var was = best.deal.qty, now = best.deal.buyQty;
            figB = '<div class="r5-cnt">'
                + '<span class="v num was">' + fmtQty(was) + '</span>'
                + '<span class="ar">→</span>'
                + '<span class="v num now">' + fmtQty(now) + '</span>'
                + '<span class="cap">' + (best.cls === 'bond' ? 'облигаций' : 'акций') + ' станет<br>у вас на руках</span>'
                + '</div>';
            noteB = 'Ваша <b>' + esc(nameOf(best.sell, best.cls)) + '</b> подорожала на ' + d1(growPct(best.sell))
                + ' %. Доли акций и облигаций не изменятся.';
        } else {
            figB = '<div class="r5-cnt"><span class="v num was">—</span><span class="cap">пока менять нечего:<br>ни одна бумага не выросла</span></div>';
            noteB = 'Ни одна ваша бумага не подорожала настолько, чтобы обмен дал прибавку.';
        }
        var cardB = '<div class="r5-pc' + (reco ? '' : (best ? ' reco' : '')) + '">'
            + (!reco && best ? '<span class="r5-pc-tag">советуем</span>' : '')
            + '<h3>В моменте</h3>'
            + '<p>Забрать то, что выросло: продать подорожавшую бумагу и на те же деньги купить больше бумаг подешевле.</p>'
            + '<div class="r5-pc-fig">' + figB + '</div>'
            + '<div class="r5-pc-note">' + noteB + '</div>'
            + '<div class="r5-pc-go">' + btn('Выбрать этот способ', 'rbwStartMoment()', (!reco && best ? 'acc full' : 'ghost full')) + '</div>'
            + '</div>';

        var body = '<div class="r5-kick">Портфель «' + esc(p.name) + '» · <b>' + rub(c.value) + '</b></div>'
            + '<div class="r5-h1">Что будем делать?</div>'
            + '<div class="r5-sub">Два способа привести портфель в порядок. Выберите любой — что продать и что купить, мы посчитаем сами.</div>'
            + '<div class="r5-pick">' + cardA + cardB + '</div>'
            + '<div class="r5-acts" style="margin-top:34px;padding-bottom:0">'
                + quiet('Изменить план портфеля', 'rbwEditPlan()')
                + '<span class="sp"></span>'
                + quiet('Чем эти способы отличаются', 'rbwWhyModes()', true)
            + '</div>';

        return topHtml({ eyebrow: 'Ребаланс', name: p.name, back: 'Портфели', backFn: 'rbwGo(\'diag\')' })
            + stage('center', GLOW + body);
    }

    /* ═══ СЦЕНА 07 · «Какая бумага выросла?» / СЦЕНА 13 · «забирать нечего» ═══ */
    function viewSellPick() {
        var p = curPf();
        if (!p) return viewNoPf();
        var cls = rbw.cls, list = heldSorted(p, cls);
        var usable = list.filter(function (x) { return x.qty > 0; });
        var best = momentBest(p);

        var sw = '<span class="sw">'
            + '<span class="' + (cls === 'bond' ? 'on' : '') + '" onclick="rbwSetCls(\'bond\')">Облигации</span>'
            + '<span class="' + (cls === 'stock' ? 'on' : '') + '" onclick="rbwSetCls(\'stock\')">Акции</span></span>';

        /* СЦЕНА 13: выгодной пары нет — список приглушён целиком, выбора нет */
        if (!best || best.cls !== cls) {
            var top1 = usable[0];
            var rows13 = usable.slice(0, 6).map(function (x) { return lrHtml(x, cls, false, true); }).join('');
            var calm = '<div class="r5-calm">'
                + '<div class="r5-kick">Портфель «' + esc(p.name) + '» · в моменте</div>'
                + '<div class="r5-h1" style="font-size:52px">Сейчас забирать нечего.</div>'
                + '<div class="r5-sub" style="font-size:16.5px;max-width:820px">Ни одна ваша бумага не подорожала настолько, '
                    + 'чтобы обмен дал прибавку.' + (top1 ? ' Самая выросшая — <b>' + esc(nameOf(top1, cls)) + ', всего на ' + d1(growPct(top1))
                    + ' %</b>: на такой разнице бумаг не прибавится ни одной.' : '') + '</div></div>';
            return topHtml({ eyebrow: 'В моменте', name: p.name, back: 'Другой способ', backFn: 'rbwGo(\'pick\')', onePf: true })
                + stage('center', GLOW + calm
                    + '<div class="r5-list" style="margin-top:30px">'
                        /* Мокап (сцена 13) рисует шапку БЕЗ переключателя: там пары нет
                           ни в облигациях, ни в акциях, и переключать нечего. Но если
                           пара есть в ДРУГОМ классе (сюда пришли тумблером со сцены 07),
                           убрать его — значит запереть человека на пустом экране. */
                        + '<div class="r5-lh"><b>Ваши ' + (cls === 'bond' ? 'облигации' : 'акции') + ' — сверху те, что выросли сильнее</b>'
                            + (best ? sw : '') + '</div>'
                        + (rows13 || '<div class="r5-lnote">Бумаг этого типа в портфеле нет.</div>')
                    + '</div>'
                    + '<div class="r5-acts" style="margin-top:30px;padding-bottom:0">'
                        + btn('Напомнить через месяц', 'rbwRemind(1)', 'ghost')
                        + quiet('Проверить доли' + (annualOk(p) && Math.abs(devOf(p)) >= driftThr(p) ? ' — там работа есть' : ''), 'rbwGo(\'diag\')')
                        + '<span class="sp"></span>'
                        + quiet('Сверить другой портфель', 'rbwNextPf()')
                    + '</div>');
        }

        var selId = rbw.pick.sell || best.sell.id;
        var rows = usable.map(function (x) { return lrHtml(x, cls, x.id === selId, growPct(x) <= 0); }).join('');
        var body = '<div class="r5-kick">В моменте · шаг 1 из 2</div>'
            + '<div class="r5-h1">Какая бумага выросла?</div>'
            + '<div class="r5-sub" style="max-width:800px">Продаём ту, что сильнее подорожала, и на те же деньги берём больше '
                + 'бумаг подешевле. <b>Доли акций и облигаций при этом не сдвинутся.</b></div>'
            + '<div class="r5-list">'
                + '<div class="r5-lh"><b>Ваши бумаги — сверху те, что выросли сильнее</b>' + sw + '</div>'
                + rows
                + '<div class="r5-lnote">Продавать подешевевшую бумагу этим способом смысла нет — рост ещё не случился, '
                    + 'забирать нечего. Такие строки приглушены, но выбрать их можно.</div>'
            + '</div>'
            + '<div class="r5-acts" style="margin-top:30px;padding-bottom:0">'
                + btn('Дальше — что купим ' + ARR, 'rbwGo(\'deal\')')
                + '<span class="sp"></span>'
                + quiet('Почему список отсортирован по росту', 'rbwWhySort()')
            + '</div>';

        return topHtml({ eyebrow: 'В моменте', name: p.name, back: 'Другой способ', backFn: 'rbwGo(\'pick\')', onePf: true })
            + stage('center', GLOW + body);
    }
    function lrHtml(x, cls, on, mute) {
        var g = growPct(x), up = g >= 0, age = ageStr(x);
        return '<div class="r5-lr' + (on ? ' on' : '') + (mute ? ' mute' : '') + '" onclick="rbwChoose(\'sell\',\'' + esc(x.id) + '\')">'
            + '<span class="rd"></span><span class="mn' + (cls === 'stock' ? ' st' : '') + '">' + mono2(nameOf(x, cls)) + '</span>'
            + '<div class="t"><b>' + esc(nameOf(x, cls)) + '</b><span>' + fmtQty(x.qty) + ' ' + plur(x.qty, 'штука', 'штуки', 'штук')
                + ' · ' + f2(x.price) + ' ₽' + (age ? ' · ' + age : '') + '</span></div>'
            + '<div class="g' + (up ? '' : ' down') + '">' + (up ? 'подорожала' : 'подешевела') + ' на ' + d1(Math.abs(g)) + ' %</div>'
            + '<div class="p num' + (up ? '' : ' down') + '">' + (up ? '+' : '−') + rub(Math.abs(x.pnl || 0)) + '</div></div>';
    }

    /* ═══ СЦЕНЫ 03 и 08 · «обмен» ═══ */
    function viewDeal() {
        var p = curPf();
        if (!p) return viewNoPf();
        var ctx = dealCtx();
        if (!ctx || !ctx.sell || !ctx.buy || !ctx.deal || !(ctx.deal.buyQty > 0)) return viewNoDeal(ctx);
        var d = ctx.deal, annual = ctx.kind === 'annual';
        var sellNm = nameOf(ctx.sell, ctx.sellClass), buyNm = nameOf(ctx.buy, ctx.buyClass);
        var spend = d.buyQty * (ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price);

        var head, out;
        if (annual) {
            var toBond = ctx.buyClass === 'bond';
            head = '<div class="r5-kick">Шаг 2 из 2 · осталось подтвердить</div>'
                + '<div class="r5-h1">Продаём немного ' + (toBond ? 'акций, покупаем облигации' : 'облигаций, покупаем акции') + '</div>'
                + '<div class="r5-sub">Так портфель вернётся к плану <b>' + planStr(p) + '</b>. Доплачивать ничего не нужно — '
                    + 'покупка делается на деньги от продажи.</div>';
            var a = allocAfter(p, ctx);
            var coup = d.coupDelta != null ? d.coupDelta : coupDeltaOf(ctx, d);
            out = 'После обмена у вас будет <b>' + pct0(a.stockPct) + ' % акций и ' + pct0(a.bondPct) + ' % облигаций</b> — ровно как вы задумывали.'
                + (coup > 0.5 ? ' Облигации будут приносить <b>на ' + rub(coup) + ' в год больше</b>.' : '');
        } else if (ctx.cls === 'bond') {
            var more = d.buyQty - d.qty;
            head = '<div class="r5-kick">В моменте · шаг 2 из 2</div>'
                + '<div class="r5-h1">Продаём подорожавшую, берём ' + (more > 0 ? 'больше подешевле' : 'доходнее') + '</div>'
                + '<div class="r5-sub">' + esc(sellNm) + ' выросла в цене — эту прибыль забираем и на те же деньги покупаем'
                    + (more > 0 ? ' <b>на ' + more + ' ' + plur(more, 'бумагу', 'бумаги', 'бумаг') + ' больше</b>' : ' бумагу доходнее')
                    + '. Доли акций и облигаций не сдвинутся.</div>';
            out = (more > 0 ? 'Облигаций станет <b>' + d.buyQty + ' вместо ' + d.qty + '</b> — за те же деньги.' : 'Обмен идёт внутри облигаций, доли не двигаются.')
                + (d.coupAfter != null && d.coupBefore != null && Math.abs(d.coupAfter - d.coupBefore) > 0.5
                    ? ' Купоны ' + (d.coupAfter > d.coupBefore ? 'вырастут' : 'изменятся') + ' <b>с ' + rub(d.coupBefore) + ' до ' + rub(d.coupAfter) + ' в год</b>.' : '');
        } else {
            head = '<div class="r5-kick">В моменте · шаг 2 из 2</div>'
                + '<div class="r5-h1">Меняем слабую акцию на более перспективную</div>'
                + '<div class="r5-sub">' + esc(sellNm) + ' по ожидаемому росту слабее ' + esc(buyNm)
                    + '. <b>Доля акций при этом не сдвинется.</b></div>';
            out = 'Ожидаемый рост по этой части портфеля вырастет <b>с ' + fmtPct(ctx.sell.pot) + ' до ' + fmtPct(ctx.buy.pot) + '</b>.';
        }

        var deal = '<div class="r5-deal"><div class="r5-deal-top">'
            + '<div class="r5-leg sell">'
                + '<div class="r5-legk">Продаём</div>'
                + '<div class="r5-inst"><span class="r5-mn' + (ctx.sellClass === 'bond' ? ' bd' : '') + '">' + mono2(sellNm) + '</span>'
                    + '<div class="t"><b>' + esc(sellNm) + '</b><span>' + f2(ctx.sellClass === 'bond' ? ctx.sell.unit : ctx.sell.price)
                    + ' ₽ за штуку · у вас ' + fmtQty(ctx.sell.qty) + '</span></div></div>'
                + '<div class="r5-q num sell">−' + fmtQty(d.qty) + '<span> шт</span></div>'
                + '<div class="r5-money num">' + rub(d.proceeds) + ' <em>получим</em></div>'
            + '</div>'
            + '<div class="r5-mid"><span>' + SWAP2 + '</span></div>'
            + '<div class="r5-leg buy">'
                + '<div class="r5-legk">Покупаем</div>'
                + '<div class="r5-inst"><span class="r5-mn' + (ctx.buyClass === 'bond' ? ' bd' : '') + '">' + mono2(buyNm) + '</span>'
                    + '<div class="t"><b>' + esc(buyNm) + '</b><span>' + f2(ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price)
                    + ' ₽ за штуку' + (ctx.kind === 'moment' && ctx.cls === 'bond' ? ' · дешевле и доходнее' : '') + '</span></div></div>'
                + '<div class="r5-q num buy">+' + fmtQty(d.buyQty) + '<span> шт</span></div>'
                + '<div class="r5-money num">' + rub(spend) + ' <em>потратим</em></div>'
            + '</div></div>'
            + '<div class="r5-out"><span class="ic">' + CHECK + '</span><div class="tx">' + out + '</div></div></div>';

        var acts = '<div class="r5-acts">'
            + btn('Сделать обмен\n        ' + ARR, 'rbwExecute()', '', rbw.executing)
            + quiet(annual ? 'Сколько продаём' : 'Сколько меняем', 'rbwGo(\'qty\')')
            + quiet('Другие бумаги', 'rbwGo(\'' + (annual ? 'pick' : 'sellpick') + '\')')
            + quiet('Подробности', 'rbwGo(\'details\')')
            + '</div>';

        return topHtml({ eyebrow: annual ? 'Раз в год' : 'В моменте', name: p.name,
                back: annual ? 'Другой способ' : 'К выбору бумаги', backFn: annual ? 'rbwGo(\'pick\')' : 'rbwGo(\'sellpick\')', onePf: true })
            + stage('center', GLOW + head + deal + acts);
    }
    function coupDeltaOf(ctx, d) {
        var add = ctx.buyClass === 'bond' ? d.buyQty * (ctx.buy.coupon || 0) * (ctx.buy.freq || 0) : 0;
        var sub = ctx.sellClass === 'bond' ? d.qty * (ctx.sell.coupon || 0) * (ctx.sell.freq || 0) : 0;
        return add - sub;
    }

    /* ═══ СЦЕНЫ 04 и 09 · «Сколько продаём / меняем» ═══ */
    function viewQty() {
        var p = curPf();
        if (!p) return viewNoPf();
        var ctx = dealCtx();
        if (!ctx || !ctx.sell || !ctx.deal) return viewNoDeal(ctx);
        var d = ctx.deal, annual = ctx.kind === 'annual';
        var sellNm = nameOf(ctx.sell, ctx.sellClass), buyNm = nameOf(ctx.buy, ctx.buyClass);
        var maxQ = ctx.sell.qty, q = d.qty, pos = maxQ > 1 ? (q - 1) / (maxQ - 1) * 100 : 100;
        var sugg = suggestQty(ctx);
        var suggPos = maxQ > 1 ? (sugg - 1) / (maxQ - 1) * 100 : 100;
        var minMore = (!annual && ctx.cls === 'bond') ? minQtyForMore(ctx.sell, ctx.buy) : null;
        var deadPos = (minMore && maxQ > 1) ? Math.max(0, (minMore - 1) / (maxQ - 1) * 100) : 0;
        var more = d.buyQty - d.qty;

        var head = '<div class="r5-h1" style="margin-top:0">Сколько ' + (ctx.sellClass === 'bond' ? 'облигаций' : 'акций')
                + ' ' + esc(sellNm) + ' продаём?</div>'
            + '<div class="r5-sub"' + (annual ? '' : ' style="max-width:800px"') + '>У вас ' + fmtQty(maxQ) + '. Мы предлагаем <b>' + fmtQty(sugg) + '</b> — '
                + (annual ? 'ровно столько, чтобы вернуться к плану. Можно поставить любое другое число.'
                    : 'при таком объёме бумаг станет на ' + Math.max(0, more) + ' больше. Чем больше продаёте, тем больше прибавка.') + '</div>';

        var a = allocAfter(p, ctx);
        var res = annual
            ? 'На эти деньги купим <b>' + fmtQty(d.buyQty) + ' ' + (ctx.buyClass === 'bond' ? 'облигаций ' : 'акций ') + esc(buyNm) + '</b>. '
                + 'Акций останется <b>' + pct0(a.stockPct) + ' %</b> — ' + (Math.abs(a.stockPct - (100 - targetBond(p))) < 1 ? 'ровно по плану' : 'план ' + (100 - targetBond(p)) + ' %') + '.'
            : 'На эти деньги купим <b>' + fmtQty(d.buyQty) + ' ' + (ctx.buyClass === 'bond' ? 'облигаций ' : 'акций ') + esc(buyNm) + '</b>'
                + (more > 0 ? ' — <b>на ' + more + ' ' + plur(more, 'бумагу', 'бумаги', 'бумаг') + ' больше</b>, чем продали' : '') + '. Доплачивать не нужно.';

        var slab = '<div class="r5-slab">'
            + '<div class="r5-big"><b class="num">' + fmtQty(q) + '</b><span>' + plur(q, 'штука', 'штуки', 'штук') + ' из ' + fmtQty(maxQ)
                + ' · на ' + rub(d.proceeds) + '</span></div>'
            + '<div class="r5-track" id="rbwTrack" tabindex="0" role="slider" aria-label="Сколько продаём" onclick="rbwTrackClick(event)" onkeydown="rbwTrackKey(event)">'
                + (deadPos > 0.4 ? '<span class="dead" style="width:' + deadPos.toFixed(1) + '%"></span>' : '')
                + '<span class="fill" style="width:' + pos.toFixed(1) + '%"></span>'
                + '<span class="mark' + (annual ? '' : ' m2') + '" style="left:' + suggPos.toFixed(1) + '%"></span>'
                + '<span class="knob" style="left:' + pos.toFixed(1) + '%"></span>'
            + '</div>'
            + '<div class="r5-scale"><span>1 штука</span><span>' + fmtQty(maxQ) + ' ' + plur(maxQ, 'штука', 'штуки', 'штук') + ' — все</span></div>'
            + '<div class="r5-res"><div class="t">' + res + '</div></div>'
            + '</div>';

        var acts = '<div class="r5-acts"' + (annual ? '' : ' style="margin-top:30px;padding-bottom:0"') + '>'
            + btn('Готово' + (annual ? '\n        ' : ' ') + ARR, 'rbwGo(\'deal\')')
            + btn('Вернуть ' + fmtQty(sugg), 'rbwSetQty(' + sugg + ')', 'ghost', q === sugg)
            + '<span class="sp"></span>'
            + quiet(minMore ? 'До ' + minMore + ' штук бумаг не прибавится — этот кусок шкалы заштрихован'
                            : 'Ползунок двигается по одной бумаге — половины штуки не бывает')
            + '</div>';

        return topHtml({ eyebrow: annual ? 'Раз в год' : 'В моменте', name: annual ? 'Сколько продаём' : 'Сколько меняем',
                back: 'К обмену', backFn: 'rbwGo(\'deal\')', onePf: true })
            + stage('center', GLOW + head + slab + acts);
    }
    function suggestQty(ctx) {
        var p = ctx.p, save = rbw.pick.qty;
        rbw.pick.qty = null;
        var fresh = dealCtx();
        rbw.pick.qty = save;
        return (fresh && fresh.deal) ? fresh.deal.qty : (ctx.deal ? ctx.deal.qty : 1);
    }

    /* ═══ СЦЕНЫ 05 и 10 · «Подробности» ═══ */
    function viewDetails() {
        var p = curPf();
        if (!p) return viewNoPf();
        var ctx = dealCtx();
        if (!ctx || !ctx.sell || !ctx.buy || !ctx.deal) return viewNoDeal(ctx);
        var d = ctx.deal, annual = ctx.kind === 'annual';
        var sellNm = nameOf(ctx.sell, ctx.sellClass), buyNm = nameOf(ctx.buy, ctx.buyClass);
        var spend = d.buyQty * (ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price);
        var ft = feeTax(), fee = (d.proceeds + spend) * ft.fee, tax = saleTax(ctx.sell, d.qty);

        /* левая карточка — что продаём */
        var sellRows, sellWhy;
        if (ctx.sellClass === 'stock') {
            var others = heldStocks(p).filter(function (x) { return x.id !== ctx.sell.id && x.pot != null; })
                .sort(function (a, b) { return (b.pot || 0) - (a.pot || 0); });
            sellRows = fr('Цена сейчас', f2(ctx.sell.price) + ' ₽')
                + fr('Ожидаемый рост', ctx.sell.pot != null ? fmtPct(ctx.sell.pot) : '—')
                + fr('Прибыль по этой бумаге', (ctx.sell.pnl >= 0 ? '+' : '−') + rub(Math.abs(ctx.sell.pnl || 0)), ctx.sell.pnl >= 0 ? 'pos' : '');
            sellWhy = 'Из ваших ' + fmtQty(heldStocks(p).length) + ' ' + plur(heldStocks(p).length, 'акции', 'акций', 'акций')
                + ' у ' + esc(sellNm) + ' <b>самый слабый ожидаемый рост</b>'
                + (others[0] && others[0].pot != null ? ' — у ' + esc(others[0].ticker) + ' он ' + fmtPct(others[0].pot) : '')
                + '. Продавая её, вы отдаёте меньше всего будущего.';
        } else {
            var nHeld = heldBonds(p).length;
            sellRows = fr('Цена сейчас', f2(ctx.sell.unit) + ' ₽')
                + fr('Подорожала с покупки', (growPct(ctx.sell) >= 0 ? '+' : '−') + d1(Math.abs(growPct(ctx.sell))) + ' %', growPct(ctx.sell) >= 0 ? 'pos' : '')
                + fr('Принесла с покупки', (ctx.sell.pnl >= 0 ? '+' : '−') + rub(Math.abs(ctx.sell.pnl || 0)), ctx.sell.pnl >= 0 ? 'pos' : '');
            sellWhy = 'Из ваших ' + fmtQty(nHeld) + ' ' + plur(nHeld, 'выпуска', 'выпусков', 'выпусков') + ' ' + esc(sellNm)
                + ' подорожала сильнее всех. <b>Рост уже случился</b> — забираем его, пока цена высокая, а не ждём, пока она вернётся назад.';
        }

        /* правая карточка — что покупаем */
        var buyRows, buyWhy;
        if (ctx.buyClass === 'bond') {
            var coupY = d.buyQty * (ctx.buy.coupon || 0) * (ctx.buy.freq || 0);
            buyRows = fr('Цена сейчас', f2(ctx.buy.unit) + ' ₽')
                + fr('Даёт в год, если держать до конца', ctx.buy.yield != null ? fmtPct(ctx.buy.yield) : '—')
                + fr('Купоны с этих ' + fmtQty(d.buyQty) + ' штук', coupY > 0 ? rub(coupY) + ' в год' : '—', 'pos');
            buyWhy = annual
                ? 'Из доступных выпусков у ' + esc(buyNm) + ' <b>самая высокая доходность</b>, и цена ниже номинала — '
                    + 'к погашению государство вернёт больше, чем вы платите сейчас.'
                : 'Она <b>дешевле проданной и доходнее</b> — поэтому на ту же сумму бумаг выходит больше, '
                    + 'а платить купоны будут все ' + fmtQty(d.buyQty) + ' штук вместо ' + fmtQty(d.qty) + '.';
        } else {
            buyRows = fr('Цена сейчас', f2(ctx.buy.price) + ' ₽')
                + fr('Ожидаемый рост', ctx.buy.pot != null ? fmtPct(ctx.buy.pot) : '—', 'pos')
                + fr('Уровень риска', ctx.buy.ech ? 'уровень ' + ctx.buy.ech : 'тот же, что у проданной');
            buyWhy = 'У неё <b>выше ожидаемый рост</b> при том же уровне риска — доля акций в портфеле не меняется, '
                + 'меняется только состав.';
        }

        var two = '<div class="r5-two">'
            + '<div class="r5-dc">'
                + '<div class="r5-dc-h"><span class="r5-mn' + (ctx.sellClass === 'bond' ? ' bd' : '') + '">' + mono2(sellNm) + '</span>'
                    + '<div class="t"><b>Продаём ' + esc(sellNm) + '</b><span>' + fmtQty(d.qty) + ' из ' + fmtQty(ctx.sell.qty) + ' штук</span></div>'
                    + '<span class="ch" onclick="rbwGo(\'sellpick\')">выбрать другую ›</span></div>'
                + sellRows + '<div class="r5-why">' + sellWhy + '</div>'
            + '</div>'
            + '<div class="r5-dc">'
                + '<div class="r5-dc-h"><span class="r5-mn' + (ctx.buyClass === 'bond' ? ' bd' : '') + '">' + mono2(buyNm) + '</span>'
                    + '<div class="t"><b>Покупаем ' + esc(buyNm) + '</b><span>' + fmtQty(d.buyQty) + ' штук</span></div>'
                    + '<span class="ch" onclick="rbwBuyPicker()">выбрать другую ›</span></div>'
                + buyRows + '<div class="r5-why">' + buyWhy + '</div>'
            + '</div></div>';

        /* пара «было → станет» — только у обмена внутри облигаций (сцена 10) */
        var fig2 = '';
        if (!annual && ctx.cls === 'bond' && d.coupBefore != null) {
            fig2 = '<div class="r5-fig2">'
                + '<div class="r5-fc"><em>Облигаций<br>станет</em>'
                    + '<span class="vv"><s class="num">' + fmtQty(d.qty) + '</s><i>→</i><b class="num">' + fmtQty(d.buyQty) + '</b></span></div>'
                + '<div class="r5-fc"><em>Купоны<br>в год</em>'
                    + '<span class="vv"><s class="num">' + rub(d.coupBefore) + '</s><i>→</i><b class="num">' + rub(d.coupAfter) + '</b></span></div>'
                + '</div>';
        }

        var strip = '<div class="r5-money-strip"' + (fig2 ? ' style="margin-top:20px"' : '') + '>'
            + ms('Получим за ' + esc(sellNm), rub(d.proceeds))
            + ms('Потратим на ' + esc(buyNm), rub(spend))
            + ms('Комиссия брокера', rub(fee))
            + ms('Останется на счёте', rub(d.rest))
            + '</div>';

        var taxTxt = tax > 0.5
            ? 'Налог с продажи — ' + rub(tax) + ' по ставке ' + d1(ft.tax * 100) + ' %'
            : 'Налог с продажи — 0 ₽' + (ft.tax > 0 ? ', прибыли по этой сделке нет' : ', ставка налога в настройках «Ребаланса» не задана');

        var acts = '<div class="r5-acts">'
            + btn('Всё понятно — к обмену' + (annual ? '\n        ' : ' ') + ARR, 'rbwGo(\'deal\')')
            + '<span class="sp"></span>'
            + quiet(taxTxt)
            + '</div>';

        return topHtml({ eyebrow: annual ? 'Раз в год' : 'В моменте', name: 'Подробности',
                back: 'К обмену', backFn: 'rbwGo(\'deal\')', onePf: true })
            + stage('', '<div class="r5-h1" style="margin-top:0">Почему именно ' + (annual ? 'эти бумаги' : 'эта пара') + '</div>'
                + two + fig2 + strip + acts);
    }
    function fr(k, v, mod) { return '<div class="r5-fr"><span class="k">' + k + '</span><span class="v' + (mod ? ' ' + mod : '') + '">' + v + '</span></div>'; }
    function ms(k, v) { return '<div class="r5-ms"><em>' + k + '</em><b class="num">' + v + '</b></div>'; }

    /* ═══ СЦЕНЫ 06 и 11 · «Готово» ═══ */
    function viewDone() {
        var p = curPf(), r = rbw.receipt;
        if (!p) return viewNoPf();
        if (!r) return viewDiag();
        var rows = r.rows.map(function (l) {
            return '<div class="r5-rr"><span class="mn' + (l.cls === 'bond' ? ' bd' : '') + '">' + mono2(l.name) + '</span>'
                + '<div class="t"><b>' + esc(l.title) + '</b><span>по ' + f2(l.price) + ' ₽</span></div>'
                + '<div class="q">' + fmtQty(l.qty) + ' шт</div>'
                + '<div class="s' + (l.side === 'buy' ? ' out' : '') + (l.part ? ' part' : '') + '">'
                    + (l.part ? l.part : ((l.side === 'buy' ? '−' : '') + rub(l.sum))) + '</div></div>';
        }).join('');
        var acts = '<div class="r5-acts" style="justify-content:center;margin-top:38px;padding-bottom:0">'
            + btn('В портфель' + ' ' + ARR, 'rbwToPortfolio()')
            + (r.canUndo ? quiet('Отменить обмен', 'rbwUndo()') : '')
            + (r.mode === 'moment' ? quiet('Забрать ещё одну выросшую', 'rbwStartMoment()') : '')
            + '</div>';
        var body = '<div class="r5-done">'
            + '<div class="ic">' + CHECK + '</div>'
            + '<h3>' + r.headline + '</h3>'
            + '<p>' + r.sub + '</p>'
            + '<div class="r5-rows">' + rows + '</div>'
            + '<div class="r5-plain">' + r.plain + '</div>'
            + '</div>';
        return topHtml({ eyebrow: 'Ребаланс', name: p.name, onePf: true })
            + stage('center', GLOW + body + acts, 'padding-top:56px');
    }

    /* ═══ служебные экраны (в мокапе не нарисованы — язык взят у сцены 12) ═══ */
    function plain(eyebrow, name, h1, sub, actsHtml) {
        var p = curPf();
        return topHtml({ eyebrow: eyebrow, name: name || (p ? p.name : 'Ребаланс') })
            + stage('center', GLOW + '<div class="r5-calm">'
                + '<div class="r5-h1" style="font-size:46px">' + h1 + '</div>'
                + '<div class="r5-empty">' + sub + '</div>'
                + '<div class="r5-acts" style="margin-top:0;padding-top:32px">' + (actsHtml || '') + '</div></div>');
    }
    function viewNoPf() {
        return plain('Ребаланс', 'Ребаланс', 'Пока нет ни одного портфеля.',
            'Соберите портфель на вкладке «Расчёт» — и мастер поможет держать его в плане.',
            btn('К портфелям ' + ARR, 'rbwExit()'));
    }
    function viewNoDeal(ctx) {
        var annual = ctx && ctx.kind === 'annual';
        return plain(annual ? 'Раз в год' : 'В моменте', curPf() ? curPf().name : 'Ребаланс',
            'Пары для обмена пока нет.',
            annual ? 'Для этого способа нужны и акции, и облигации, а ещё живые цены — они могут ещё подгружаться.'
                   : 'Ни одна бумага не выросла настолько, чтобы обмен окупился, либо цены ещё подгружаются.',
            btn('Другой способ ' + ARR, 'rbwGo(\'pick\')', 'ghost'));
    }

    /* ═══════════ ЛУЧШИЙ ОБМЕН «В МОМЕНТЕ» ═══════════
       Одна пара на портфель: сначала облигации (правило владельца — продаём ту,
       что сильнее выросла, берём доходнее и дешевле, чтобы бумаг стало больше),
       и только если там нечего — акции. Питает карточку способа на сцене 02,
       подсказку на сцене 12 и решение «рисовать сцену 07 или сцену 13». */
    function momentBest(p) {
        if (!p) return null;
        var res = null;
        ['bond', 'stock'].forEach(function (cls) {
            if (res && res.cls === 'bond') return;
            var auto = cls === 'bond' ? autoBondPair(p) : autoStockPair(p);
            if (!auto) return;
            var hs = heldOf(p, cls);
            var s = find(hs, function (x) { return x.id === auto.sellId; });
            if (!s) return;
            var cd = cls === 'bond' ? bondCands() : stockCandsFor(s.ech >= 1 ? s.ech : 0);
            var b = find(cd, function (x) { return cls === 'bond' ? x.isin === auto.buyId : x.ticker === auto.buyId; });
            if (!b) return;
            var d = cls === 'bond' ? computeBondDeal(p, s, b) : computeStockDeal(s, b);
            if (!d || !(d.buyQty > 0)) return;
            /* «В моменте» = ЗАБРАТЬ УЖЕ СЛУЧИВШИЙСЯ РОСТ. Бумага в минусе сюда не
               годится, даже если обмен формально даёт больше штук: продавать
               подешевевшую — это фиксировать убыток, а не забирать прибыль.
               Без этого условия сцена 13 («забирать нечего») не наступала бы
               никогда, а мокап её рисует именно для такого дня. */
            if (!(growPct(s) > 0)) return;
            var gain = cls === 'bond' ? (d.buyQty - d.qty) : ((b.pot || 0) - (s.pot || 0));
            if (!(gain > 0)) return;
            if (!res || cls === 'bond') res = { cls: cls, sell: s, buy: b, deal: d, gain: gain };
        });
        return res;
    }
    function nextReviewOf(p) {
        if (p && p.nextReview) return p.nextReview;
        var d = new Date(); d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().slice(0, 10);
    }

    /* ═══════════ ГЛАВНЫЙ РЕНДЕР ═══════════ */
    PF.rbwSceneHtml = function () {
        var main;
        try {
            var v = rbw.view;
            if (v === 'pick') main = viewPick();
            else if (v === 'sellpick') main = viewSellPick();
            else if (v === 'buypick') main = viewBuyPick();
            else if (v === 'deal') main = viewDeal();
            else if (v === 'qty') main = viewQty();
            else if (v === 'details') main = viewDetails();
            else if (v === 'done') main = viewDone();
            else main = viewDiag();
        } catch (e) {
            main = plain('Ребаланс', 'Ребаланс', 'Что-то пошло не так.',
                esc((e && e.message) || 'Неизвестная ошибка') + '<br>Обновите страницу и попробуйте снова.',
                btn('К портфелям ' + ARR, 'rbwExit()', 'ghost'));
            if (window.console) console.error('[rbw]', e);
        }
        return '<div class="rbw" id="rbwBar">' + main + '</div>';
    };

    PF.rbwReady = function () {
        var s = window.supa;
        if (!s || !s.enabled) return true;          // демо-режим (ключи не заданы) — открыто
        return !!(s.isAuthed && s.isAuthed());       // боевой — требуем вход
    };

    PF.rbwGateHtml = function () {
        return '<div class="pfd-grid" style="display:block"><div style="max-width:560px;margin:60px auto;text-align:center;padding:40px 32px;border:1px solid var(--border-color,#e7ecf3);border-radius:20px;background:var(--card-bg,#fff)">'
            + '<div style="width:56px;height:56px;margin:0 auto 18px;border-radius:16px;display:grid;place-items:center;background:rgba(68,83,239,.1);color:#4453ef">' + IC.lock + '</div>'
            + '<div class="pftg-t" style="font-family:var(--font-title);font-size:23px;margin-bottom:10px">Мастер ребаланса</div>'
            + '<p style="color:var(--text-muted,#64748b);font-size:14px;line-height:1.6;margin-bottom:22px">Два вопроса и один обмен: мастер сам считает, что продать и что купить, и выставляет заявку. Доступен зарегистрированным пользователям.</p>'
            + '<button type="button" class="r5-btn" style="margin:0 auto" onclick="(window.msAuth&&window.msAuth.open?window.msAuth.open():(window.openAuth&&window.openAuth()))">Войти</button>'
            + '</div></div>';
    };

    /* дорисовка после рендера: Esc и разовое напоминание о сверке */
    var escBound = false, reviewScanned = false;
    var BACK_OF = { pick: 'diag', sellpick: 'pick', buypick: 'details', deal: null, qty: 'deal', details: 'deal', done: null, diag: null };
    PF.rbwAfterRender = function () {
        if (!escBound) {
            escBound = true;
            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape') return;
                if (!document.getElementById('rbwBar')) return;
                var to = BACK_OF[rbw.view];
                if (rbw.view === 'deal') to = rbw.mode === 'annual' ? 'pick' : 'sellpick';
                if (to) { window.rbwGo(to); e.preventDefault(); }
            });
        }
        if (!reviewScanned) { reviewScanned = true; try { scanReviews(); } catch (e) {} }
    };

    function rerender() {
        persist();
        var el = document.getElementById('rbwBar');
        if (el) {
            el.outerHTML = PF.rbwSceneHtml();
            if (PF.rbwAfterRender) PF.rbwAfterRender();
        } else if (PF.renderNoAnim) { PF.renderNoAnim(); }
    }

    /* ═══ СПИСОК КАНДИДАТОВ (в мокапе не нарисован; собран из компонентов сцены 07,
       потому что «выбрать другую ›» на «Подробностях» обязано куда-то вести) ═══ */
    function viewBuyPick() {
        var p = curPf();
        if (!p) return viewNoPf();
        var ctx = dealCtx();
        if (!ctx || !ctx.sell) return viewNoDeal(ctx);
        var cls = ctx.buyClass, sell = ctx.sell;
        var list = cls === 'bond'
            ? bondCands().filter(function (x) { return isinKey(x.isin) !== isinKey(sell.isin || ''); })
                .sort(function (a, b) { return (b.yield || -1e9) - (a.yield || -1e9); })
            : stockCandsFor(sell.ech >= 1 ? sell.ech : 0).filter(function (x) { return x.ticker !== sell.ticker; });
        var curId = ctx.buy ? (cls === 'bond' ? ctx.buy.isin : ctx.buy.ticker) : null;
        var sellUnit = ctx.sellClass === 'bond' ? sell.unit : sell.price;
        var sum = (ctx.deal ? ctx.deal.qty : 1) * sellUnit;
        var rows = list.slice(0, 12).map(function (x) {
            var id = cls === 'bond' ? x.isin : x.ticker, unit = cls === 'bond' ? x.unit : x.price;
            var n = unit > 0 ? Math.floor(sum / unit) : 0;
            return '<div class="r5-lr' + (id === curId ? ' on' : '') + '" onclick="rbwChoose(\'buy\',\'' + esc(id) + '\')">'
                + '<span class="rd"></span><span class="mn' + (cls === 'stock' ? ' st' : '') + '">' + mono2(nameOf(x, cls)) + '</span>'
                + '<div class="t"><b>' + esc(nameOf(x, cls)) + '</b><span>' + f2(unit) + ' ₽ за штуку'
                    + (cls === 'stock' && x.name && x.name !== x.ticker ? ' · ' + esc(x.name) : '') + '</span></div>'
                + '<div class="g">' + (cls === 'bond'
                    ? (x.yield != null ? 'даёт ' + fmtPct(x.yield) + ' в год' : '—')
                    : (x.pot != null ? 'ожидаемый рост ' + fmtPct(x.pot) : '—')) + '</div>'
                + '<div class="p num">' + fmtQty(n) + ' шт</div></div>';
        }).join('');
        var body = '<div class="r5-kick">' + (ctx.kind === 'annual' ? 'Раз в год' : 'В моменте') + ' · что покупаем</div>'
            + '<div class="r5-h1">Куда переложить деньги?</div>'
            + '<div class="r5-sub" style="max-width:800px">Сверху — ' + (cls === 'bond' ? 'самые доходные выпуски' : 'бумаги с самым большим ожидаемым ростом')
                + '. Справа видно, сколько штук выйдет на вашу сумму.</div>'
            + '<div class="r5-list">'
                + '<div class="r5-lh"><b>' + (cls === 'bond' ? 'Облигации — сверху доходные' : 'Акции — сверху перспективные') + '</b></div>'
                + (rows || '<div class="r5-lnote">Кандидатов пока нет — цены ещё подгружаются.</div>')
            + '</div>'
            + '<div class="r5-acts" style="margin-top:30px;padding-bottom:0">'
                + btn('Готово ' + ARR, 'rbwGo(\'details\')')
                + '<span class="sp"></span>'
                + quiet('Считаем от суммы продажи — ' + rub(sum))
            + '</div>';
        return topHtml({ eyebrow: ctx.kind === 'annual' ? 'Раз в год' : 'В моменте', name: 'Что покупаем',
                back: 'К подробностям', backFn: 'rbwGo(\'details\')', onePf: true })
            + stage('center', GLOW + body);
    }

    /* ═══════════ ДЕЙСТВИЯ ═══════════ */
    window.rbwExit = function () { if (window.pfxGoTab) window.pfxGoTab('overview'); };
    window.rbwGo = function (v) { rbw.view = v; rerender(); };
    window.rbwPickPf = function (pid) {
        if (pid === rbw.pid) return;
        rbw.pid = pid; rbw.mode = null; resetPicks(); rbw.receipt = null; rbw.view = 'diag';
        persist(); rerender();
    };
    window.rbwNextPf = function () {
        var list = portfolios(); if (list.length < 2) { toast('Другого портфеля пока нет'); return; }
        var i = 0; list.forEach(function (p, k) { if (p.id === rbw.pid) i = k; });
        window.rbwPickPf(list[(i + 1) % list.length].id);
    };
    window.rbwStartAnnual = function () {
        var p = curPf(); if (!p || !annualOk(p)) { toast('Для этого способа нужны и акции, и облигации, и план по долям'); return; }
        rbw.mode = 'annual'; resetPicks(); rbw.view = 'deal'; rerender();
    };
    window.rbwStartMoment = function () {
        var p = curPf(); if (!p) return;
        var best = momentBest(p);
        rbw.mode = 'moment';
        rbw.cls = best ? best.cls : (PF.calcPf(p).bondVal > 0 ? 'bond' : 'stock');
        resetPicks(); rbw.view = 'sellpick'; rerender();
    };
    window.rbwSetCls = function (cls) { rbw.cls = cls; resetPicks(); rerender(); };
    window.rbwChoose = function (side, id) {
        rbw.pick[side] = id;
        if (side === 'sell') rbw.pick.buy = null;   // сменили продаваемую — подбор покупки заново
        rbw.pick.qty = null;
        rerender();
    };
    window.rbwBuyPicker = function () { rbw.view = 'buypick'; rerender(); };
    window.rbwSetQty = function (v) {
        var ctx = dealCtx(); if (!ctx || !ctx.sell) return;
        rbw.pick.qty = clamp(Math.round(+v), 1, ctx.sell.qty); rerender();
    };
    /* ползунок «сколько»: клик по дорожке и стрелки — шаг ровно в одну бумагу */
    window.rbwTrackClick = function (e) {
        var t = e.currentTarget, ctx = dealCtx(); if (!ctx || !ctx.sell) return;
        var r = t.getBoundingClientRect(); if (!(r.width > 0)) return;
        var k = clamp((e.clientX - r.left) / r.width, 0, 1);
        window.rbwSetQty(1 + Math.round(k * (ctx.sell.qty - 1)));
    };
    window.rbwTrackKey = function (e) {
        var ctx = dealCtx(); if (!ctx || !ctx.deal) return;
        var q = ctx.deal.qty, max = ctx.sell.qty;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); window.rbwSetQty(q - 1); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); window.rbwSetQty(q + 1); }
        else if (e.key === 'Home') { e.preventDefault(); window.rbwSetQty(1); }
        else if (e.key === 'End') { e.preventDefault(); window.rbwSetQty(max); }
    };
    window.rbwEditPlan = function () {
        toast('План по долям задаётся в карточке портфеля — открываю «Мои портфели»');
        if (window.pfxGoTab) window.pfxGoTab('ports');
    };
    window.rbwRemind = function (months) {
        var p = curPf(); if (!p) return;
        var d = new Date(); d.setMonth(d.getMonth() + (months || 12));
        p.nextReview = d.toISOString().slice(0, 10); p.reviewNotified = null;
        if (PF.saveStore) PF.saveStore();
        toast('Напомним ' + fmtDate(p.nextReview));
        rerender();
    };
    window.rbwWhyModes = function () {
        toast('«Раз в год» возвращает доли акций и облигаций к плану. «В моменте» меняет бумагу на бумагу внутри одного класса — доли не двигаются.');
    };
    window.rbwWhySort = function () {
        toast('Сверху та бумага, что сильнее подорожала: её рост уже случился, и его можно забрать, не дожидаясь отката.');
    };
    window.rbwToPortfolio = function () { rbw.receipt = null; rbw.view = 'diag'; if (window.pfxGoTab) window.pfxGoTab('overview'); };
    window.rbwUndo = function () {
        var r = rbw.receipt, p = curPf();
        if (!r || !r.tradeId || !p || !window.pfRbUndoTrade) { toast('Отмена доступна из истории сделок портфеля'); return; }
        window.pfRbUndoTrade(p.id, r.tradeId);
        rbw.receipt = null; rbw.view = 'diag'; resetPicks(); rerender();
    };

    /* ═══════════ ИСПОЛНЕНИЕ ═══════════ */
    window.rbwExecute = function () {
        if (rbw.executing) return;
        var p = curPf(); if (!p) return;
        var ctx = dealCtx();
        if (!ctx || !ctx.sell || !ctx.buy || !ctx.deal || !(ctx.deal.buyQty > 0)) { toast('Нечего исполнять'); return; }
        if (p.broker) return execBroker(p, ctx);
        return execPaper(p, ctx);
    };

    function setNextReview(p) { var d = new Date(); d.setFullYear(d.getFullYear() + 1); p.nextReview = d.toISOString().slice(0, 10); p.reviewNotified = null; }

    /* применение к локальному портфелю (дубль pfReduceHolding/pfAddBought/pfLogTrade) */
    function genId(pfx) { return pfx + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36); }
    function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function reduceHolding(p, h, qty) {
        var lots = (PF.ensureLots ? PF.ensureLots(h) : (h.lots || [])).slice().sort(function (a, b) { return String(a.buyDate || '').localeCompare(String(b.buyDate || '')); });
        var left = qty;
        lots.forEach(function (l) { if (left <= 0) return; var q = +l.qty || 0, take = Math.min(q, left); l.qty = q - take; left -= take; });
        h.lots = (PF.ensureLots ? PF.ensureLots(h) : h.lots).filter(function (l) { return (+l.qty || 0) > 0; });
        if (!h.lots.length) p.holdings = (p.holdings || []).filter(function (x) { return x.id !== h.id; });
    }
    function addBought(p, o) {
        var lot = { id: genId('l'), buyDate: todayStr(), buyPrice: Math.round((o.price || 0) * 100) / 100, qty: o.qty, nkd: Math.round((o.nkd || 0) * 100) / 100, priceFromApi: true, nkdFromApi: o.type === 'bond' };
        var exist = null;
        (p.holdings || []).forEach(function (h) {
            if (exist || h.type !== o.type) return;
            if (o.type === 'bond' ? isinKey(h.ticker) === isinKey(o.ticker) : h.ticker === o.ticker) exist = h;
        });
        if (exist) { (PF.ensureLots ? PF.ensureLots(exist) : exist.lots).push(lot); return { hid: exist.id, lotId: lot.id }; }
        var nh = { id: genId('h'), ticker: o.ticker, name: o.name || o.ticker, type: o.type, lots: [lot], potAtBuy: o.type === 'stock' ? (o.pot != null ? o.pot : (PF.potentialOf ? PF.potentialOf(o.ticker) : null)) : null };
        p.holdings.push(nh); return { hid: nh.id, lotId: lot.id };
    }
    function logTrade(p, t) { t.id = genId('t'); t.ts = Date.now(); t.fee = feeTax().fee; p.trades = p.trades || []; p.trades.unshift(t); if (p.trades.length > 120) p.trades.length = 120; return t.id; }

    /* ── «Готово»: сцены 06 и 11 мокапа. Заголовок повторяет обещание, данное на
         экране выбора способа, слово в слово; для «в моменте» отдельной строкой
         сказано, что доли не поехали (заметка 2 к сцене 11) ── */
    function buildDoneReceipt(p, ctx, applied) {
        var annual = ctx.kind === 'annual', d = ctx.deal;
        var sellNm = nameOf(ctx.sell, ctx.sellClass), buyNm = nameOf(ctx.buy, ctx.buyClass);
        var spend = applied.buyQty * (ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price);
        var after = { stockPct: PF.calcPf(p).stockPct, bondPct: PF.calcPf(p).bondPct };
        var head, plainTxt;
        if (annual) {
            head = 'Портфель снова по плану';
            plainTxt = 'Теперь у вас <b>' + pct0(after.stockPct) + ' % акций и ' + pct0(after.bondPct) + ' % облигаций</b>.'
                + (applied.coupDelta > 0.5 ? ' Облигации будут приносить <b>на ' + rub(applied.coupDelta) + ' в год больше</b>.' : '')
                + '<br>Следующая сверка — <b>' + fmtDate(p.nextReview) + '</b>, напомним сами.';
        } else {
            var more = applied.buyQty - applied.qty;
            head = (ctx.cls === 'bond' && more > 0)
                ? 'Облигаций стало ' + fmtQty(applied.buyQty) + ' вместо ' + fmtQty(applied.qty)
                : 'Обмен сделан';
            plainTxt = (applied.coupAfter != null && applied.coupBefore != null && Math.abs(applied.coupAfter - applied.coupBefore) > 0.5
                    ? 'Купоны теперь <b>' + rub(applied.coupAfter) + ' в год</b> вместо ' + rub(applied.coupBefore) + '. ' : '')
                + 'Доли акций и облигаций не изменились — <b>' + pct0(after.stockPct) + ' % и ' + pct0(after.bondPct) + ' %</b>, как были.'
                + (applied.rest > 0.5 ? '<br>На счёт вернулось <b>' + rub(applied.rest) + '</b>.' : '');
        }
        return {
            mode: annual ? 'annual' : 'moment',
            headline: head,
            sub: 'Обе заявки исполнены. Всё записано в историю операций.',
            rows: [
                { cls: ctx.sellClass, name: sellNm, title: 'Продали ' + sellNm, price: ctx.sellClass === 'bond' ? ctx.sell.unit : ctx.sell.price, qty: applied.qty, sum: applied.proceeds, side: 'sell' },
                { cls: ctx.buyClass, name: buyNm, title: 'Купили ' + buyNm, price: ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price, qty: applied.buyQty, sum: spend, side: 'buy' }
            ],
            plain: plainTxt,
            canUndo: true,
            tradeId: applied.tradeId
        };
    }

    function execPaper(p, ctx) {
        var d = ctx.deal;
        var sellH = (p.holdings || []).filter(function (h) { return h.id === ctx.sell.id; })[0];
        if (!sellH) { toast('Обмен не применился — бумаги уже нет в портфеле', true); return; }
        var avail = (PF.ensureLots ? PF.ensureLots(sellH) : (sellH.lots || [])).reduce(function (s, l) { return s + (+l.qty || 0); }, 0);
        var qty = Math.min(d.qty, avail); if (!(qty > 0)) { toast('Нечего продавать', true); return; }
        var coupBefore = heldBonds(p).reduce(function (s, x) { return s + x.coupYear; }, 0);
        var sellIdx = (p.holdings || []).indexOf(sellH);
        var soldSnap = JSON.parse(JSON.stringify(sellH));
        reduceHolding(p, sellH, qty);
        var buyO = ctx.buyClass === 'bond'
            ? { type: 'bond', ticker: isinKey(ctx.buy.isin), name: ctx.buy.name, price: ctx.buy.price, nkd: ctx.buy.nkd, qty: d.buyQty }
            : { type: 'stock', ticker: ctx.buy.ticker, name: ctx.buy.name, price: ctx.buy.price, qty: d.buyQty, pot: ctx.buy.pot };
        var bought = addBought(p, buyO);
        var tradeId = logTrade(p, {
            kind: ctx.sellClass === 'bond' ? 'bond' : 'stock',
            sellTicker: ctx.sellClass === 'bond' ? isinKey(ctx.sell.isin) : ctx.sell.ticker, sellName: ctx.sell.name, sellQty: qty,
            buyTicker: buyO.ticker, buyName: ctx.buy.name, buyQty: d.buyQty, proceeds: d.proceeds, rest: d.rest,
            undo: { sold: soldSnap, soldIdx: sellIdx, buyHid: bought.hid, buyLotId: bought.lotId }
        });
        if (d.rest > 0.005) p.cash = (p.cash || 0) + d.rest;
        PF.saveStore(); if (PF.pfInvalidateCharts) PF.pfInvalidateCharts(p.id);
        if (PF.ensureQuotes) try { PF.ensureQuotes(true); } catch (e) {}
        setNextReview(p);
        var coupAfter = heldBonds(p).reduce(function (s, x) { return s + x.coupYear; }, 0);
        rbw.receipt = buildDoneReceipt(p, ctx, {
            qty: qty, buyQty: d.buyQty, proceeds: d.proceeds, rest: d.rest, tradeId: tradeId,
            coupBefore: coupBefore, coupAfter: coupAfter, coupDelta: coupAfter - coupBefore
        });
        if (window.msNotify && window.msNotify.local) {
            window.msNotify.local('success', 'Ребаланс применён',
                nameOf(ctx.sell, ctx.sellClass) + ' → ' + nameOf(ctx.buy, ctx.buyClass) + ' · ' + rub(d.proceeds));
        }
        resetPicks(); rbw.view = 'done'; rerender();
    }

    function brokerCanTrade() { var A = window.brokerApi; return !!(A && A.canTrade && A.canTrade()); }
    function brokerLegTicker(cls, side, x) {
        if (cls === 'bond') return (side === 'buy' && x.t) ? x.t : ((PF.fullBondId && PF.fullBondId(x.isin)) || x.isin);
        return x.ticker;
    }
    function execBroker(p, ctx) {
        var d = ctx.deal;
        var legs = [
            { ticker: brokerLegTicker(ctx.sellClass, 'sell', ctx.sell), side: 'sell', qty: d.qty, orderType: 'market', price: ctx.sell.price, nm: nameOf(ctx.sell, ctx.sellClass), cls: ctx.sellClass },
            { ticker: brokerLegTicker(ctx.buyClass, 'buy', ctx.buy), side: 'buy', qty: d.buyQty, orderType: 'limit', price: ctx.buy.price, nm: nameOf(ctx.buy, ctx.buyClass), cls: ctx.buyClass }
        ];
        if (!brokerCanTrade() || !PF.pftPlaceOrders) {
            if (PF.pftLoadPlan) { try { PF.pftLoadPlan(legs.map(function (l) { return { ticker: l.ticker, side: l.side, qty: l.qty }; })); } catch (e) {} }
            else toast('Подключите брокера в «Торговле», чтобы выставить заявки', true);
            return;
        }
        var fire = function () {
            rbw.executing = true; rerender();
            PF.pftPlaceOrders(legs).then(function (results) {
                rbw.executing = false;
                buildBrokerReceipt(p, ctx, legs, results);
                var okN = results.filter(function (r) { return r.ok; }).length;
                if (window.msNotify && window.msNotify.local) window.msNotify.local(okN ? 'success' : 'warn', 'Заявки ребаланса', okN + ' из ' + results.length + ' отправлено брокеру Т-Инвестиций');
                resetPicks(); rbw.view = 'done'; rerender();
                pollBrokerOrders(p);
            }, function (e) {
                rbw.executing = false; rerender();
                toast((e && e.message) || 'Не удалось выставить заявки', true);
            });
        };
        if (window.pfConfirm) window.pfConfirm('Выставить 2 заявки брокеру Т-Инвестиций? Это реальные сделки на вашем счёте.', fire);
        else if (!window.confirm || window.confirm('Выставить реальные заявки брокеру?')) fire();
    }
    function brokerStatusOf(r) {
        if (!r.ok) return { st: 'rej', note: r.error || 'отклонено' };
        var resp = r.resp || {}, req = +resp.lotsRequested || r.lots, exe = +resp.lotsExecuted || 0;
        var rej = /REJECT/i.test(resp.executionReportStatus || '');
        var st = rej ? 'rej' : (exe >= req && req > 0 ? 'done' : 'part');
        return { st: st, exeSh: exe * (r.lot || 1), reqSh: req * (r.lot || 1) };
    }
    /* квитанция брокера живёт в той же сцене «Готово»: у частично исполненной
       строки — янтарная дробь «118 / 130» (заметка 6 к сцене 11 мокапа) */
    function buildBrokerReceipt(p, ctx, legs, results) {
        var acc = (window.brokerApi && window.brokerApi.getConn && window.brokerApi.getConn()) || {};
        var anyPart = false, anyRej = false;
        var rows = results.map(function (r, i) {
            var s = brokerStatusOf(r), l = legs[i] || r.leg || {};
            if (s.st === 'part') anyPart = true;
            if (s.st === 'rej') anyRej = true;
            return {
                cls: l.cls, name: l.nm || l.ticker, side: l.side,
                title: (l.side === 'sell' ? 'Продаём ' : 'Покупаем ') + (l.nm || l.ticker),
                price: l.price, qty: l.qty,
                sum: (l.qty || 0) * (l.price || 0),
                part: s.st === 'part' ? (fmtQty(s.exeSh) + ' <i>/ ' + fmtQty(s.reqSh) + '</i>') : (s.st === 'rej' ? 'отклонена' : null),
                orderId: (r.resp && r.resp.orderId) || null, st: s.st, lot: r.lot || 1
            };
        });
        rbw.receipt = {
            broker: true, accountId: acc.accountId, mode: ctx.kind === 'annual' ? 'annual' : 'moment',
            headline: anyRej ? 'Заявки не прошли' : (anyPart ? 'Заявки приняты, исполняются' : 'Заявки исполнены'),
            sub: anyPart ? 'Остаток живёт в терминале — звоночек придёт, когда он доисполнится.'
                         : 'Отправлены брокеру Т-Инвестиций. Состав портфеля обновится синком.',
            rows: rows,
            plain: 'Это зеркало брокерского счёта — «бумажная» запись не создаётся.'
                + (anyPart ? '<br>Остаток докупится сам, отменить его можно в «Заявках».' : ''),
            canUndo: false, tradeId: null
        };
    }
    function pollBrokerOrders(p) {
        var r = rbw.receipt; if (!r || !r.broker || !r.accountId) return;
        var open = r.rows.filter(function (l) { return l.orderId && l.st === 'part'; });
        if (!open.length || !(window.brokerApi && window.brokerApi.call)) return;
        setTimeout(function () {
            if (rbw.receipt !== r) return;
            Promise.all(open.map(function (l) {
                return window.brokerApi.call('GetOrderState', { accountId: r.accountId, orderId: l.orderId }).then(function (st) {
                    var req = +st.lotsRequested || 0, exe = +st.lotsExecuted || 0, rej = /REJECT|CANCEL/i.test(st.executionReportStatus || '');
                    l.st = rej ? 'rej' : (req > 0 && exe >= req ? 'done' : 'part');
                    l.part = rej ? 'отменена' : (l.st === 'done' ? null : (fmtQty(exe * (l.lot || 1)) + ' <i>/ ' + fmtQty(req * (l.lot || 1)) + '</i>'));
                }, function () {});
            })).then(function () { if (rbw.receipt === r && rbw.view === 'done') rerender(); });
        }, 3500);
    }
    window.rbwCancelOrder = function (orderId) {
        var r = rbw.receipt; if (!r || !orderId || !r.accountId || !(window.brokerApi && window.brokerApi.call)) return;
        window.brokerApi.call('CancelOrder', { accountId: r.accountId, orderId: orderId }).then(function () {
            var l = r.rows.filter(function (x) { return x.orderId === orderId; })[0];
            if (l) { l.st = 'rej'; l.part = 'отменена'; }
            toast('Заявка отменена'); rerender();
        }, function (e) { toast((e && e.message) || 'Не удалось отменить заявку', true); });
    };

    /* №5: разовое напоминание о наступившей годовой сверке */
    function scanReviews() {
        var items = (PF.store && PF.store.items) || [];
        if (!(window.msNotify && window.msNotify.local)) return;
        var today = new Date().toISOString().slice(0, 10), fired = false;
        items.forEach(function (p) {
            if (p.hidden || !p.nextReview) return;
            if (String(p.nextReview) > today) return;             // срок ещё не подошёл
            if (p.reviewNotified === today) return;               // уже сегодня напомнили
            p.reviewNotified = today; fired = true;
            window.msNotify.local('info', 'Пора свериться с целью', 'Портфель «' + p.name + '»: подошёл срок годовой сверки долей. Загляните в «Ребаланс».');
        });
        if (fired && PF.saveStore) PF.saveStore();
    }

    function toast(msg, err) { if (window.showDashToast) window.showDashToast(msg, !!err); }

})();
