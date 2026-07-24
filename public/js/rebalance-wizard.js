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

    /* ─────────── состояние визарда ─────────── */
    var rbw = {
        step: 1,                 // 1 портфель · 2 режим · 3 расчёт · 4 заявка · 'receipt' · 'done'
        pid: null,               // выбранный портфель
        mode: null,              // 'annual' | 'moment' | 'auto'
        cls: 'bond',             // класс для режима «в моменте»: 'bond' | 'stock'
        pick: { sell: null, buy: null, qty: null }, // ручной выбор сторон сделки
        picker: null,            // 'sell' | 'buy' | null — открытый пикер
        autoIdx: null,           // выбранный вариант в режиме «Авто»
        ord: { sell: 'market', buy: 'limit' }, // тип заявки в корзине
        receipt: null            // результат исполнения
    };
    try {
        var sv = JSON.parse(localStorage.getItem('rbw_state_v1') || 'null');
        if (sv && sv.pid) { rbw.pid = sv.pid; }
    } catch (e) {}
    function persist() {
        try { localStorage.setItem('rbw_state_v1', JSON.stringify({ pid: rbw.pid })); } catch (e) {}
    }
    function resetPicks() { rbw.pick = { sell: null, buy: null, qty: null }; rbw.picker = null; rbw.autoIdx = null; }

    /* ─────────── форматтеры / утилиты (переиспользуем PF) ─────────── */
    var fmtRub = PF.fmtRub, fmtPrice = PF.fmtPrice, fmtPct = PF.fmtPct, fmtQty = PF.fmtQty;
    var toNum = PF.toNum, clamp = PF.clamp;
    function f2(n) { return (n == null || !isFinite(n)) ? '—' : Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function d1(n) { return (n == null || !isFinite(n)) ? '—' : Number(n).toFixed(1).replace('.', ','); } // одна десятичная, запятая
    function pp(n) { return (n >= 0 ? '+' : '−') + d1(Math.abs(n)) + ' п.п.'; }                              // «+6,8 п.п.»
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function isinKey(t) { return String(t || '').split('RMFS')[0]; }
    function feeTax() {
        var p = {}; try { p = JSON.parse(localStorage.getItem('pf_rebal_params') || '{}') || {}; } catch (e) {}
        return { fee: (p.fee != null && isFinite(+p.fee)) ? +p.fee : 0.0005, tax: (p.tax != null && isFinite(+p.tax)) ? +p.tax : 0 };
    }
    // bonds/echelonTableData объявлены в data.js как ЛЕКСИЧЕСКИЕ глобалы (let/const):
    // доступны по «голому» имени из classic-скрипта, но НЕ как window.bonds.
    function allBonds() { try { return (typeof bonds !== 'undefined' && Array.isArray(bonds)) ? bonds : []; } catch (e) { return []; } }
    function allEch() { try { return (typeof echelonTableData !== 'undefined' && Array.isArray(echelonTableData)) ? echelonTableData : []; } catch (e) { return []; } }
    function portfolios() { return ((PF.store && PF.store.items) || []).filter(function (p) { return !p.hidden; }); }
    function curPf() { return rbw.pid ? PF.findPf(rbw.pid) : null; }
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
        lock: ico('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', 1.8)
    };
    function mono2(name) {
        var s = String(name || '').replace(/^ОФЗ\s*/i, '');
        var d = s.match(/\d{4,5}/); if (d) return d[0].slice(-2);
        return s.replace(/[^A-Za-zА-Яа-я]/g, '').slice(0, 2).toUpperCase();
    }

    /* ═══════════ РАСЧЁТ (дубль локальной логики rb5) ═══════════ */
    function bondYieldOf(isin, det) {
        var bs = allBonds();
        for (var i = 0; i < bs.length; i++) if (isinKey(bs[i].t) === isinKey(isin)) { var y = toNum(bs[i].y); if (isFinite(y)) return y; }
        if (det && det.couponYield != null) { var y2 = toNum(det.couponYield); if (isFinite(y2)) return y2; }
        return null;
    }
    function bondEconAt(det, costUnit, nkdNow, face) {
        var ft = feeTax();
        if (!det || !(costUnit > 0)) return null;
        var mat = PF.parseBondDate ? PF.parseBondDate(det.matDate) : null; if (!mat) return null;
        var days = (mat.getTime() - Date.now()) / 86400000; if (!(days > 0)) return null;
        var nominal = (det.face > 0) ? +det.face : (face > 0 ? face : 1000);
        var cost = costUnit * (1 + ft.fee);
        var income = (+det.couponValue || 0) * (+det.freq || 0) * days / 365 + nominal + (nkdNow || 0);
        var tax = Math.max(0, income - cost) * ft.tax;
        var profit = income - cost - tax;
        return { perDay: profit / days, days: Math.round(days), matDate: det.matDate };
    }
    function bondQtyFor1More(unitS, unitB, maxQty) {
        var f = feeTax().fee, net = unitS * (1 - f), gross = unitB * (1 + f);
        if (!(net > 0) || !(gross > 0) || net <= gross) return null;
        for (var n = 1; n <= maxQty; n++) if (Math.floor(n * net / gross) >= n + 1) return n;
        return null;
    }
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
            out.push({ h: h, id: h.id, isin: isin, name: h.name || isin, qty: ck.qty, price: price, nkd: nkd,
                unit: price + nkd, yield: bondYieldOf(isin, det), det: det, face: face, coupon: coupon, freq: freq,
                coupYear: coupon * freq * ck.qty, val: ck.value });
        });
        return out;
    }
    function bondCands() {
        var bs = allBonds(), out = [];
        bs.forEach(function (b) {
            var isin = isinKey(b.t), lv = (PF.liveBond ? PF.liveBond(isin) : null) || {};
            var price = lv.price > 0 ? lv.price : (+b.p || 0);
            var nkd = (lv.nkd != null && isFinite(lv.nkd)) ? lv.nkd : (+b.nkd || 0);
            var det = (PF.bondDetail ? PF.bondDetail(isin) : null) || {};
            var coupon = +det.couponValue || 0, freq = +det.freq || 2;
            if (!(price > 0)) return;
            out.push({ t: b.t, isin: isin, name: b.n || isin, price: price, nkd: nkd, unit: price + nkd,
                yield: toNum(b.y), coupon: coupon, freq: freq });
        });
        return out;
    }
    /* мои акции */
    function heldStocks(p) {
        var c = PF.calcPf(p), out = [];
        c.hs.forEach(function (x) {
            if (x.h.type === 'bond') return;
            var h = x.h, ck = x.c;
            var pot = (PF.potentialOf ? PF.potentialOf(h.ticker) : null);
            out.push({ h: h, id: h.id, ticker: h.ticker, name: h.name || h.ticker, qty: ck.qty,
                price: ck.cur || 0, pot: pot, ech: echelonOf(h.ticker), val: ck.value, pnlPct: ck.pnlPct });
        });
        return out;
    }
    function echelonOf(ticker) {
        var ed = allEch();
        if (ed && ed.length) for (var e = 0; e < ed.length; e++) {
            var arr = ed[e] || []; for (var i = 0; i < arr.length; i++) if (String(arr[i].t) === String(ticker)) return e + 1;
        }
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(ticker);
            if (co && co.main) { var n = toNum(co.main['ЭШЕЛОН']); if (isFinite(n)) return n; }
        }
        return 0;
    }
    function stkPriceOf(tk) {
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(tk);
            if (co && co.main) { var n = toNum(co.main['Текущая Цена']); if (isFinite(n) && n > 0) return n; }
        }
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

    /* автоподбор пары для (mode, cls) → { sellId, buyId } или null */
    function autoBondPair(p, fixSell, fixBuy) {
        var bs = heldBonds(p), cands = bondCands(), best = null, f = feeTax().fee;
        bs.forEach(function (s) {
            if (fixSell && s.id !== fixSell) return;
            if (!(s.qty > 0) || !(s.unit > 0)) return;
            var sEcon = bondEconAt(s.det, s.price + s.nkd, s.nkd, s.face);
            cands.forEach(function (cd) {
                if (fixBuy && cd.isin !== fixBuy) return;
                if (isinKey(cd.isin) === isinKey(s.isin)) return;
                var cEcon = bondEconAt(cd.det || {}, cd.unit, cd.nkd, 1000);
                var partial = bondQtyFor1More(s.unit, cd.unit, s.qty);
                var qty = partial || s.qty;
                var buyQty = Math.floor(qty * s.unit * (1 - f) / (cd.unit * (1 + f)));
                if (!(buyQty > 0)) return;
                var delta = (buyQty * cd.coupon * cd.freq) - (qty * s.coupon * s.freq);
                if (delta > 0 && (!best || delta > best.delta)) best = { sellId: s.id, buyId: cd.isin, delta: delta };
            });
        });
        return best;
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
        // фолбэк: крупнейшая позиция
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
        // фолбэк: bond — макс доходность; stock — макс потенциал
        if (cls === 'bond') return list.slice().sort(function (a, b) { return (b.yield || 0) - (a.yield || 0); })[0];
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

    /* ═══════════ РЕНДЕР ═══════════ */
    var STEPS = [['Портфель', 'какой ребалансируем'], ['Режим', 'как выравниваем'], ['Расчёт', 'выгодная сделка'], ['Заявка', 'выставить в терминал']];
    function stepNo() { return rbw.step === 'receipt' || rbw.step === 'done' ? 4 : rbw.step; }
    function railHtml() {
        var active = stepNo(), rows = '';
        STEPS.forEach(function (s, i) {
            var n = i + 1, cls = n === active ? 'on' : (n < active ? 'done' : '');
            var icn = n < active ? '✓' : n;
            var click = (n < active && n < rbw.step && rbw.step !== 'done') ? ' onclick="rbwGoStep(' + n + ')"' : '';
            rows += '<div class="rbw-rs ' + cls + '"' + click + '><div class="rbw-rs-i">' + icn + '</div>'
                + '<div class="rbw-rs-t"><b>' + s[0] + '</b><em>' + s[1] + '</em></div></div>';
        });
        var p = curPf(), ctx = '';
        if (p && rbw.step >= 2) {
            var c = PF.calcPf(p);
            var modeLbl = { annual: 'Годовая', moment: 'В моменте', auto: 'Авто' }[rbw.mode];
            var modeSub = rbw.mode === 'moment' ? (rbw.cls === 'bond' ? 'внутри ОФЗ' : 'внутри акций') : (rbw.mode === 'annual' ? 'между классами' : 'система выбрала');
            ctx = '<div class="rbw-ctx"><em>Портфель</em>'
                + '<div class="rbw-rc-r"><span class="rbw-rc-dot" style="background:' + esc(p.color || '#5f7fa8') + '"></span>'
                + '<b>' + esc(p.name) + '</b><u>' + fmtRub(c.value) + '</u></div>'
                + (rbw.mode && rbw.step >= 3 ? '<div class="rbw-rc-mode"><i>' + modeLbl + '</i><span>' + modeSub + '</span></div>' : '')
                + '</div>';
        } else {
            ctx = '<div class="rbw-railsub"><i></i>' + (isDemo() ? 'Демо-режим' : 'Доступ для входа') + '</div>';
        }
        return '<div class="rbw-rail">'
            + '<button type="button" class="rbw-exit" onclick="rbwExit()">' + IC.back + 'Портфели</button>'
            + '<div class="rbw-brand"><em>Мастер</em><b>Ребаланс</b></div>'
            + '<div class="rbw-steps">' + rows + '</div>' + ctx + '</div>';
    }
    function mainHtml(kicker, title, sub, body, footHtml) {
        return '<div class="rbw-main"><div class="rbw-mh"><em>' + kicker + '</em><h3>' + title + '</h3>'
            + (sub ? '<p>' + sub + '</p>' : '') + '</div>'
            + '<div class="rbw-body">' + body + '</div>' + (footHtml || '') + '</div>';
    }
    function footHtml(left, hint, primary, primaryDisabled) {
        return '<div class="rbw-foot">'
            + (left || '')
            + (hint ? '<div class="rbw-foothint">' + hint + '</div>' : '')
            + (primary ? '<button type="button" class="rbw-btn rbw-btn-dark wide"' + (primaryDisabled ? ' disabled' : '') + (primary.onclick ? ' onclick="' + primary.onclick + '"' : '') + '>' + primary.label + '</button>' : '')
            + '</div>';
    }
    function isDemo() { var s = window.supa; return !(s && s.enabled); }

    /* ── шаг 1 ── */
    function driftBadge(c, tb) {
        var dev = c.bondPct - tb, ad = Math.abs(dev);
        if (c.stockVal <= 0 || c.bondVal <= 0) return { cls: 'mid', txt: 'внутри класса' };
        if (ad < 3) return { cls: 'ok', txt: 'в норме · ' + fmtPct(dev).replace('%', ' п.п.') };
        return { cls: 'hi', txt: 'дрейф ' + fmtPct(-dev).replace('%', ' п.п.') + ' ' + (dev < 0 ? 'акций' : 'облиг.') };
    }
    function stepPortfolio() {
        var list = portfolios();
        var body;
        if (!list.length) {
            body = '<div class="rbw-empty">Пока нет ни одного портфеля. Соберите портфель на вкладке «Расчёт», и мастер поможет привести его в порядок.</div>';
        } else {
            // сортируем по убыванию дрейфа, предвыбор — максимальный
            var rows = list.map(function (p) {
                var c = PF.calcPf(p), tb = targetBond(p);
                var stockPct = Math.round(c.stockPct), bondPct = 100 - stockPct;
                var dev = Math.abs(c.bondPct - tb), oneClass = (c.stockVal <= 0 || c.bondVal <= 0);
                return { p: p, c: c, tb: tb, stockPct: stockPct, bondPct: bondPct, dev: oneClass ? -1 : dev };
            }).sort(function (a, b) { return b.dev - a.dev; });
            if (!rbw.pid || !PF.findPf(rbw.pid)) rbw.pid = rows[0].p.id;
            body = '<div class="rbw-pflist">' + rows.map(function (r) {
                var p = r.p, sel = p.id === rbw.pid, d = driftBadge(r.c, r.tb);
                var cnt = (p.holdings || []).length;
                return '<div class="rbw-pf' + (sel ? ' sel' : '') + '" onclick="rbwPickPf(\'' + p.id + '\')">'
                    + '<div class="rbw-pf-radio"></div>'
                    + '<div class="rbw-pf-id"><b>' + esc(p.name) + '</b><em>' + cnt + ' ' + plur(cnt, 'позиция', 'позиции', 'позиций') + ' · цель ' + (100 - r.tb) + ' / ' + r.tb + '</em></div>'
                    + '<div class="rbw-pf-alloc"><div class="rbw-pf-bar"><i class="st" style="width:' + r.stockPct + '%"></i><i class="bd" style="width:' + r.bondPct + '%"></i></div>'
                    + '<div class="rbw-pf-lg"><span class="a">Акции ' + r.stockPct + '%</span><span class="b">Облигации ' + r.bondPct + '%</span></div></div>'
                    + '<div class="rbw-pf-right"><span class="rbw-pf-val">' + fmtRub(r.c.value) + '</span><span class="rbw-pf-drift ' + d.cls + '">' + d.txt + '</span></div></div>';
            }).join('') + '</div>';
        }
        var p0 = curPf();
        var hint = p0 ? 'Выбран «' + esc(p0.name) + '»' : '';
        var foot = footHtml('', hint, list.length ? { label: 'Далее — режим <i>→</i>', onclick: 'rbwGoStep(2)' } : null, !list.length);
        return mainHtml('Шаг 1 из 4', 'Какой портфель приводим в порядок?',
            'Слева — все ваши портфели. Уплывшие доли подсвечены; выберите тот, что приводим к цели.', body, foot);
    }

    /* ── шаг 2 ── */
    function stepMode() {
        var p = curPf(); if (!p) { rbw.step = 1; return stepPortfolio(); }
        var c = PF.calcPf(p), tb = targetBond(p), dev = Math.abs(c.bondPct - tb);
        var oneClass = (c.stockVal <= 0 || c.bondVal <= 0);
        var recoAnnual = !oneClass && dev >= 3;
        var stockPct = Math.round(c.stockPct);
        var annualDis = oneClass;
        var annual = '<div class="rbw-modec' + (rbw.mode === 'annual' ? ' sel' : '') + (recoAnnual ? ' reco' : '') + (annualDis ? ' dis' : '') + '"' + (annualDis ? '' : ' onclick="rbwSetMode(\'annual\')"') + '>'
            + '<div class="rbw-mc-ic">' + IC.scale + '</div><h4>Годовая</h4>'
            + '<div class="rbw-mc-d">' + (annualDis ? 'Портфель одного класса — балансировать между акциями и облигациями нечего.' : 'Сверяем доли между классами и возвращаем к цели ' + (100 - tb) + ' / ' + tb + '. Раз в год или когда перекос вышел за порог.') + '</div>'
            + '<div class="rbw-mc-diag"><span class="rbw-dglbl">сейчас → цель</span><div class="rbw-mc-two">'
            + '<div class="rbw-mc-b"><i class="st" style="width:' + stockPct + '%"></i><i class="bd" style="width:' + (100 - stockPct) + '%"></i></div>'
            + '<div class="rbw-mc-cap"><span>' + stockPct + ' / ' + (100 - stockPct) + '</span><span style="color:var(--acc)">→ ' + (100 - tb) + ' / ' + tb + '</span></div></div></div>'
            + '<div class="rbw-mc-pick">' + (rbw.mode === 'annual' ? '✓ Выбрано' : 'Выбрать') + '</div></div>';
        var moment = '<div class="rbw-modec' + (rbw.mode === 'moment' ? ' sel' : '') + '" onclick="rbwSetMode(\'moment\')">'
            + '<div class="rbw-mc-ic">' + IC.spark + '</div><h4>В моменте</h4>'
            + '<div class="rbw-mc-d">Доли между классами не трогаем — работаем внутри. Фиксируем рывок цены и перекладываемся в бумагу выгоднее.</div>'
            + '<div class="rbw-mc-diag"><span class="rbw-dglbl">внутри класса · машина денег</span>'
            + '<div class="rbw-mc-swap"><span class="pill o">продать 10</span><span class="ar">→</span><span class="pill n">купить 11</span></div>'
            + '<div class="rbw-mc-cap" style="margin-top:8px">та же сумма — купонов больше</div></div>'
            + '<div class="rbw-mc-pick">' + (rbw.mode === 'moment' ? '✓ Выбрано' : 'Выбрать') + '</div></div>';
        var auto = '<div class="rbw-modec' + (rbw.mode === 'auto' ? ' sel' : '') + '" onclick="rbwSetMode(\'auto\')">'
            + '<div class="rbw-mc-ic">' + IC.spark + '</div><h4>Авто</h4>'
            + '<div class="rbw-mc-d">Система сама переберёт пары по обоим классам и предложит готовые варианты с посчитанной выгодой.</div>'
            + '<div class="rbw-mc-diag"><span class="rbw-dglbl">система найдёт варианты</span><div class="rbw-mc-auto">'
            + '<div class="rbw-au"><i>1</i>Вернуть доли к цели</div>'
            + '<div class="rbw-au"><i>2</i>Зафиксировать рывок ОФЗ</div>'
            + '<div class="rbw-au"><i>3</i>Усилить потенциал акций</div></div></div>'
            + '<div class="rbw-mc-pick">' + (rbw.mode === 'auto' ? '✓ Выбрано' : 'Выбрать') + '</div></div>';
        var body = '<div class="rbw-modes">' + annual + moment + auto + '</div>';
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(1)">← Назад</button>';
        var foot = footHtml(back, rbw.mode ? '' : 'Выберите способ', rbw.mode ? { label: 'Далее — расчёт <i>→</i>', onclick: 'rbwGoStep(3)' } : null, !rbw.mode);
        return mainHtml('Шаг 2 из 4', 'Как будем выравнивать?',
            'Три способа. ' + (recoAnnual ? 'Перекос между классами большой — рекомендуем «Годовую».' : 'Доли в норме — можно поработать «в моменте».'), body, foot);
    }

    /* ── шаг 3 · пикер ── */
    function pickerHtml(ctx, side) {
        var cls = side === 'sell' ? ctx.sellClass : ctx.buyClass;
        var pos = side === 'sell' ? 'left:0;top:150px' : 'right:0;top:150px';
        var rows = '', p = ctx.p;
        if (side === 'sell') {
            var list = cls === 'bond' ? heldBonds(p) : heldStocks(p);
            rows = list.map(function (x) {
                var selId = cls === 'bond' ? x.isin : x.ticker, cur = ctx.sell && (cls === 'bond' ? ctx.sell.isin === x.isin : ctx.sell.ticker === x.ticker);
                var metric = cls === 'bond' ? (x.yield != null ? fmtPct(x.yield) : '—') : (x.pot != null ? fmtPct(x.pot) : '—');
                var sub = cls === 'bond' ? (f2(x.price) + ' ₽ · ' + x.qty + ' шт') : (f2(x.price) + ' ₽ · ' + x.qty + ' шт');
                return '<div class="rbw-pop-row' + (cls === 'stock' ? ' stk' : '') + (cur ? ' sel' : '') + '" onclick="rbwChoose(\'sell\',\'' + esc(x.id) + '\')">'
                    + '<div class="dm">' + mono2(x.name) + '</div><div class="dt"><b>' + esc(x.name) + '</b><em>' + sub + '</em></div>'
                    + '<div class="dv"><b>' + metric + '</b><em>' + (cls === 'bond' ? 'доходность' : 'потенциал') + '</em></div>'
                    + '<div class="dck">' + (cur ? '✓' : '') + '</div></div>';
            }).join('');
        } else {
            if (cls === 'bond') {
                var cands = bondCands().filter(function (x) { return !ctx.sell || isinKey(x.isin) !== isinKey(ctx.sell.isin); })
                    .sort(function (a, b) { return (b.yield || 0) - (a.yield || 0); });
                var held = {}; heldBonds(p).forEach(function (x) { held[isinKey(x.isin)] = 1; });
                rows = cands.map(function (x) {
                    var cur = ctx.buy && ctx.buy.isin === x.isin, own = held[isinKey(x.isin)];
                    return '<div class="rbw-pop-row' + (cur ? ' sel' : '') + '" onclick="rbwChoose(\'buy\',\'' + esc(x.isin) + '\')">'
                        + '<div class="dm">' + mono2(x.name) + '</div><div class="dt"><b>' + esc(x.name) + (own ? ' <span class="rbw-own">в портф.</span>' : '') + '</b><em>' + f2(x.price) + ' ₽ · купон ' + f2(x.coupon) + '</em></div>'
                        + '<div class="dv"><b>' + (x.yield != null ? fmtPct(x.yield) : '—') + '</b><em>доходность</em></div>'
                        + '<div class="dck">' + (cur ? '✓' : '') + '</div></div>';
                }).join('');
            } else {
                var ech = ctx.sell ? ctx.sell.ech : 0;
                var sc = stockCandsFor(ech >= 1 ? ech : 0); if (!sc.length) sc = stockCandsFor(0);
                sc = sc.filter(function (x) { return !ctx.sell || x.ticker !== ctx.sell.ticker; });
                rows = sc.map(function (x) {
                    var cur = ctx.buy && ctx.buy.ticker === x.ticker;
                    return '<div class="rbw-pop-row stk' + (cur ? ' sel' : '') + '" onclick="rbwChoose(\'buy\',\'' + esc(x.ticker) + '\')">'
                        + '<div class="dm">' + mono2(x.ticker) + '</div><div class="dt"><b>' + esc(x.ticker) + '</b><em>' + esc(x.name || '') + '</em></div>'
                        + '<div class="dv"><b>' + (x.pot != null ? fmtPct(x.pot) : '—') + '</b><em>потенциал</em></div>'
                        + '<div class="dck">' + (cur ? '✓' : '') + '</div></div>';
                }).join('');
            }
        }
        if (!rows) rows = '<div class="rbw-pop-empty">Кандидатов пока нет — данные подгружаются.</div>';
        var sortTxt = cls === 'bond' ? 'доходность ↓' : 'потенциал ↓';
        return '<div class="rbw-pop' + (side === 'sell' ? ' left' : '') + '" style="' + pos + '" onclick="event.stopPropagation()">'
            + '<div class="rbw-pop-search">' + IC.search + '<span>Поиск ' + (cls === 'bond' ? 'выпуска ОФЗ' : 'акции') + '…</span></div>'
            + '<div class="rbw-pop-sort">Сортировка: <b>' + sortTxt + '</b></div>'
            + '<div class="rbw-pop-scroll">' + rows + '</div></div>';
    }
    function pickHtml(ctx, side) {
        var cls = side === 'sell' ? ctx.sellClass : ctx.buyClass, x = side === 'sell' ? ctx.sell : ctx.buy;
        if (!x) return '<div class="rbw-pick" onclick="rbwOpenPicker(\'' + side + '\')"><div class="rbw-mono">?</div><div class="rbw-pk-t"><b>выбрать</b><em>нет данных</em></div><span class="rbw-pk-cv">▾</span></div>';
        var name = cls === 'bond' ? x.name : x.ticker;
        var meta = cls === 'bond' ? (f2(x.price) + ' ₽ · ' + (x.yield != null ? 'дох. ' + fmtPct(x.yield) : '—')) : (f2(x.price) + ' ₽ · ' + (x.pot != null ? 'потенц. ' + fmtPct(x.pot) : '—'));
        var own = '';
        if (side === 'buy' && cls === 'bond') { var h = {}; heldBonds(ctx.p).forEach(function (b) { h[isinKey(b.isin)] = 1; }); if (h[isinKey(x.isin)]) own = ' <span class="rbw-own">в портф.</span>'; }
        var act = (rbw.picker === side) ? ' act' : '';
        return '<div class="rbw-pick' + act + '" onclick="event.stopPropagation();rbwOpenPicker(\'' + side + '\')">'
            + '<div class="rbw-mono">' + mono2(name) + '</div>'
            + '<div class="rbw-pk-t"><b>' + esc(name) + own + '</b><em>' + meta + '</em></div><span class="rbw-pk-cv">▾</span></div>';
    }

    /* ── шаг 3 · сцена-сделка (годовая/в моменте) ── */
    function stepCalc() {
        var p = curPf(); if (!p) { rbw.step = 1; return stepPortfolio(); }
        if (rbw.mode === 'auto') return stepAuto();
        var ctx = dealCtx();
        if (!ctx || !ctx.sell || !ctx.buy || !ctx.deal) {
            var msg = ctx && ctx.kind === 'annual' ? 'Для годового ребаланса нужны бумаги обоих классов.' : 'Внутри класса нет подходящей пары для обмена — данные ещё грузятся или бумага одна.';
            var body0 = '<div class="rbw-ds"><div class="rbw-empty">' + msg + '</div></div>';
            return mainHtml('Шаг 3 из 4', 'Расчёт', '', body0,
                footHtml('<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(2)">← Назад · режим</button>', '', null));
        }
        var d = ctx.deal, sellName = ctx.sellClass === 'bond' ? ctx.sell.name : ctx.sell.ticker, buyName = ctx.buyClass === 'bond' ? ctx.buy.name : ctx.buy.ticker;
        var isAnnual = ctx.kind === 'annual';
        // «зачем»
        var why;
        if (isAnnual) {
            var c = ctx.c, tb = ctx.tb, stockPct = c.stockPct, bondPct = c.bondPct;
            var devA = c.stockPct - (100 - tb);
            why = '<div class="rbw-why warn"><div class="rbw-w-ic">' + IC.scale + '</div>'
                + '<div class="rbw-w-t">' + (ctx.over === 'stock' ? 'Акции переросли цель на <b>' + d1(Math.abs(devA)) + ' п.п.</b>' : 'Облигации переросли цель на <b>' + d1(Math.abs(c.bondPct - tb)) + ' п.п.</b>') + ' Чтобы вернуть портфель к цели <u>' + (100 - tb) + ' / ' + tb + '</u> — переложить <b>≈ ' + fmtRub(ctx.move) + '</b> из ' + (ctx.over === 'stock' ? 'акций в облигации' : 'облигаций в акции') + '.</div>'
                + '<div class="rbw-w-alloc">'
                + allocRow('st', 'Акции', stockPct, 100 - tb)
                + allocRow('bd', 'Обл.', bondPct, tb) + '</div></div>';
        } else {
            var cls = ctx.cls;
            why = '<div class="rbw-why spark"><div class="rbw-w-ic">' + IC.spark + '</div>'
                + '<div class="rbw-w-t"><b>' + esc(sellName) + '</b> ' + (cls === 'bond' ? 'дорогая — доходность к погашению ниже, чем у кандидата. Продаём, на всю выручку берём дешевле с купоном выше.' : 'слабее по потенциалу. Перекладываемся в сильную бумагу того же эшелона.') + ' <u>Доли классов не трогаем.</u></div>'
                + '<div class="rbw-w-alloc" style="width:auto">' + clsToggle() + '</div></div>';
        }
        // бейдж
        var badge = isAnnual ? 'возврат к <b>' + (100 - ctx.tb) + ' / ' + ctx.tb + '</b>'
            : (ctx.cls === 'bond' && d.more > 0 ? d.qty + ' → ' + d.buyQty + ' бумаг · <b>без доплат</b>' : 'обмен по потенциалу');
        // ноги
        var sellUnit = ctx.sellClass === 'bond' ? ctx.sell.unit : ctx.sell.price;
        var buyUnit = ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price;
        var sellSub = ctx.sellClass === 'bond' ? ('× ' + f2(ctx.sell.price) + ' ₽' + (ctx.sell.nkd ? ' +НКД ' + f2(ctx.sell.nkd) : '')) : ('× ' + f2(ctx.sell.price) + ' ₽ · по рынку');
        var buySub = ctx.buyClass === 'bond' ? ('× ' + f2(ctx.buy.price) + ' ₽' + (ctx.buy.nkd ? ' +НКД ' + f2(ctx.buy.nkd) : '') + (ctx.buy.coupon ? ' · купон ' + f2(ctx.buy.coupon) : '')) : ('× ' + f2(ctx.buy.price) + ' ₽ · лимит');
        var card = '<div class="rbw-card"><div class="rbw-badge">' + badge + '</div><div class="rbw-ex">'
            + '<div class="rbw-leg sell"><span class="rbw-side">Продать · ' + (ctx.sellClass === 'bond' ? 'облигации' : 'акции') + '</span>'
            + pickHtml(ctx, 'sell')
            + '<div class="rbw-qbig">−' + fmtQty(d.qty) + ' <small>шт</small></div>'
            + '<div class="rbw-qsub">' + sellSub + '</div>'
            + '<div class="rbw-dsum"><em>освободит</em><b>' + fmtRub(d.proceeds) + '</b></div></div>'
            + '<div class="rbw-swap"><i>⇄</i></div>'
            + '<div class="rbw-leg buy"><span class="rbw-side">Купить · ' + (ctx.buyClass === 'bond' ? 'облигации' : 'акции') + '</span>'
            + pickHtml(ctx, 'buy')
            + '<div class="rbw-qbig">+' + fmtQty(d.buyQty) + ' <small>шт</small></div>'
            + '<div class="rbw-qsub">' + buySub + '</div>'
            + '<div class="rbw-dsum"><em>спишет</em><b>' + fmtRub(d.buyQty * buyUnit) + '</b></div></div>'
            + '</div>'
            + '<div class="rbw-cfoot"><span class="rbw-df-auto" onclick="rbwAuto()">✦ <b>Подобрать</b> за меня</span>'
            + '<span class="rbw-df-note">' + calcNote(ctx) + '</span></div>'
            + (rbw.picker ? pickerHtml(ctx, rbw.picker) : '') + '</div>';
        // итог
        var out;
        if (ctx.cls === 'bond' && !isAnnual) {
            out = '<div class="rbw-mach"><div class="rbw-m-ic">' + IC.coin + '</div>'
                + '<div class="rbw-m-t"><em>Купоны после обмена · платят ' + d.buyQty + ' ' + plur(d.buyQty, 'бумага', 'бумаги', 'бумаг') + '</em><b>' + f2(d.coupAfter) + ' <small>₽/год · было ' + f2(d.coupBefore) + '</small></b></div>'
                + '<div class="rbw-m-delta">▲ +' + f2(d.coupDelta) + ' ₽/год</div>'
                + '<div class="rbw-m-rest">останется ' + fmtRub(d.rest) + '</div></div>';
        } else {
            var aa = allocAfter(p, ctx);
            var txt = isAnnual
                ? 'Доли вернутся к <b>' + d1(aa.stockPct) + ' / ' + d1(aa.bondPct) + '</b> — перекос уходит в норму.'
                : (d.potDelta != null ? 'Потенциал вырастет на <b>' + d1(d.potDelta) + ' п.п.</b> Доли между классами не изменились.' : 'Обмен внутри класса.');
            out = '<div class="rbw-result"><div class="rbw-result-ic">✓</div>'
                + '<div class="rbw-result-t">' + txt + '</div>'
                + '<div class="rbw-rest">останется <b>' + fmtRub(d.rest) + '</b></div></div>';
        }
        var body = '<div class="rbw-ds">' + why + card + out + '</div>';
        var title = isAnnual ? 'Один обмен возвращает доли к цели' : (ctx.cls === 'bond' ? '«Машина денег»: продали ' + d.qty + ' — купили ' + d.buyQty : 'Обмен по потенциалу');
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(2)">← Назад · режим</button>';
        var foot = footHtml(back, 'Клик по бумаге открывает пикер', { label: 'В корзину заявок <i>→</i>', onclick: 'rbwGoStep(4)' });
        return mainHtml('Шаг 3 из 4 · ' + (isAnnual ? 'Годовая' : 'В моменте'), title, '', body, foot);
    }
    function allocRow(cls, lbl, cur, tgt) {
        var dev = cur - tgt;
        return '<div class="rbw-al ' + cls + '"><span>' + lbl + '</span>'
            + '<div class="rbw-al-track"><i style="width:' + clamp(cur, 0, 100) + '%"></i><u style="left:' + clamp(tgt, 0, 100) + '%"></u></div>'
            + '<b>' + d1(cur) + '<s>' + (dev >= 0 ? '+' : '−') + d1(Math.abs(dev)) + '</s></b></div>';
    }
    function clsToggle() {
        return '<div class="rbw-cls"><span class="' + (rbw.cls === 'bond' ? 'on' : '') + '" onclick="rbwSetCls(\'bond\')">ОФЗ</span>'
            + '<span class="' + (rbw.cls === 'stock' ? 'on' : '') + '" onclick="rbwSetCls(\'stock\')">Акции</span></div>';
    }
    function calcNote(ctx) {
        if (ctx.kind === 'annual') return 'Режем позицию перевеса и берём бумагу недостающего класса — перекос уходит к цели.';
        if (ctx.cls === 'bond') return 'Дешевле и с бо́льшим купоном → на ту же выручку берём бумаг больше. Продаём не «где доходность ниже», а ту, что дороже.';
        return 'Продаём слабую по потенциалу бумагу эшелона, берём сильную того же эшелона.';
    }

    /* ── шаг 3 · авто ── */
    function autoVariants(p) {
        var vs = [];
        var c = PF.calcPf(p), tb = targetBond(p);
        if (c.stockVal > 0 && c.bondVal > 0 && Math.abs(c.bondPct - tb) >= 3) {
            var over = overClass(p), move = over === 'bond' ? (c.bondVal - c.value * tb / 100) : (c.stockVal - c.value * (100 - tb) / 100);
            vs.push({ key: 'annual', ic: 'a', icon: IC.scale, title: 'Вернуть доли к цели', mode: 'режим «Годовая» · между классами',
                desc: 'Перекос ' + fmtPct(c.stockPct - (100 - tb)).replace('+', '') + ' п.п. Переложить ≈ ' + fmtRub(Math.max(0, move)) + ', чтобы вернуть к ' + (100 - tb) + ' / ' + tb + '.',
                gain: '≈ ' + fmtRub(Math.max(0, move)), gsub: 'переложено к цели' });
        }
        var ab = autoBondPair(p);
        if (ab) {
            var bs = heldBonds(p), cd = bondCands();
            var s = find(bs, function (x) { return x.id === ab.sellId; }), b = find(cd, function (x) { return x.isin === ab.buyId; });
            if (s && b) { var dd = computeBondDeal(p, s, b); vs.push({ key: 'moment-bond', ic: 'b', icon: IC.coin, title: 'Зафиксировать рывок ОФЗ', mode: 'режим «В моменте» · внутри ОФЗ',
                desc: esc(s.name) + ' → ' + esc(b.name) + '. Продать ' + dd.qty + ', купить ' + dd.buyQty + ' — купоны на ' + dd.buyQty + ' бумаг.',
                gain: '+' + f2(dd.coupDelta) + ' ₽/год', gsub: 'купоны ' + dd.qty + ' → ' + dd.buyQty + ' бумаг', sellId: s.id, buyId: b.isin }); }
        }
        var as = autoStockPair(p);
        if (as) {
            var ss = heldStocks(p);
            var s2 = find(ss, function (x) { return x.id === as.sellId; }), cands = stockCandsFor(0);
            var b2 = find(cands, function (x) { return x.ticker === as.buyId; });
            if (s2 && b2 && b2.pot != null && s2.pot != null) { vs.push({ key: 'moment-stock', ic: 's', icon: IC.bars, title: 'Усилить потенциал акций', mode: 'режим «В моменте» · внутри акций',
                desc: esc(s2.ticker) + ' (потенциал ' + fmtPct(s2.pot) + ') слабее ' + esc(b2.ticker) + ' (' + fmtPct(b2.pot) + '). Переложиться, не меняя долю акций.',
                gain: '+' + f2(b2.pot - s2.pot) + ' п.п.', gsub: 'рост потенциала', sellId: s2.id, buyId: b2.ticker }); }
        }
        return vs;
    }
    function find(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
    function stepAuto() {
        var p = curPf();
        var vs = autoVariants(p);
        if (!vs.length) {
            var body0 = '<div class="rbw-autolist"><div class="rbw-empty">Сейчас ребаланс не окупит комиссий — доли в норме, а бумаги работают хорошо. Загляните позже.</div></div>';
            return mainHtml('Шаг 3 из 4 · Авто', 'Выгодных вариантов пока нет', '', body0,
                footHtml('<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(2)">← Назад · режим</button>', '', null));
        }
        if (rbw.autoIdx == null || rbw.autoIdx >= vs.length) rbw.autoIdx = 0;
        var body = '<div class="rbw-autolist">' + vs.map(function (v, i) {
            var sel = i === rbw.autoIdx;
            return '<div class="rbw-autoc' + (sel ? ' sel' : '') + '" onclick="rbwPickAuto(' + i + ')">'
                + '<div class="rbw-a-ic ' + v.ic + '">' + v.icon + '</div>'
                + '<div class="rbw-auto-t"><b>' + v.title + '</b><p>' + v.desc + '</p><span class="rbw-a-mode">' + v.mode + '</span></div>'
                + '<div class="rbw-auto-gain"><em>выгода</em><b>' + v.gain + '</b><u>' + v.gsub + '</u></div>'
                + '<div class="rbw-auto-pick">' + (sel ? '✓ Выбрано' : 'Выбрать') + '</div></div>';
        }).join('') + '</div>'
            + '<div class="rbw-ninfo" style="margin-top:15px">' + IC.info + '<span>Перебор идёт по обоим классам. Варианты отсортированы по выгоде; убыточных пар в списке нет. Выбор раскроет готовый расчёт.</span></div>';
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(2)">← Назад · режим</button>';
        var foot = footHtml(back, 'Выбран вариант ' + (rbw.autoIdx + 1), { label: 'Открыть расчёт <i>→</i>', onclick: 'rbwOpenAuto()' });
        return mainHtml('Шаг 3 из 4 · Авто', 'Система нашла ' + vs.length + ' ' + plur(vs.length, 'вариант', 'варианта', 'вариантов'),
            'Мастер перебрал пары по обоим классам. Выберите — раскроется готовая сделка.', body, foot);
    }

    /* ── шаг 4 · корзина ── */
    function stepBasket() {
        var p = curPf(); if (!p) { rbw.step = 1; return stepPortfolio(); }
        var ctx = dealCtx();
        if (!ctx || !ctx.deal || !(ctx.deal.buyQty > 0)) { rbw.step = 3; return stepCalc(); }
        var d = ctx.deal;
        var sellUnit = ctx.sellClass === 'bond' ? ctx.sell.unit : ctx.sell.price;
        var buyUnit = ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price;
        var proceeds = d.proceeds, spend = d.buyQty * buyUnit;
        var ft = feeTax(), fee = (proceeds + spend) * ft.fee;
        var broker = !!p.broker, canTr = broker && brokerCanTrade();
        var c = PF.calcPf(p), cash = p.cash || 0;
        var bar = '<div class="rbw-bskt-bar"><div class="rbw-bb-t">Расчёт собран в <b>2 ' + plur(2, 'заявку', 'заявки', 'заявок') + '</b> · продажа и покупка</div>'
            + '<div class="rbw-bb-link">' + IC.term + ' ' + (broker ? (canTr ? 'уйдёт брокеру Т-Инвестиций' : 'подготовим тикеты в терминале') : 'применится к портфелю') + '</div></div>';
        var legs = '<div class="rbw-legs">'
            + legHtml('sell', ctx.sellClass, ctx.sell, d.qty, sellUnit, 'освободится', '+' + fmtRub(proceeds), rbw.ord.sell)
            + legHtml('buy', ctx.buyClass, ctx.buy, d.buyQty, buyUnit, 'спишется', '−' + fmtRub(spend), rbw.ord.buy) + '</div>';
        var aa = allocAfter(p, ctx);
        var sum = '<div class="rbw-bsum">'
            + '<div class="rbw-bs-i"><em>Свободно сейчас</em><b>' + fmtRub(cash) + '</b></div><div class="rbw-bs-sep"></div>'
            + '<div class="rbw-bs-i"><em>После обмена</em><b class="' + (d.rest >= 0 ? 'up' : 'dn') + '">' + (d.rest >= 0 ? '+' : '') + fmtRub(d.rest) + '</b></div><div class="rbw-bs-sep"></div>'
            + '<div class="rbw-bs-i"><em>Комиссия</em><b>≈ ' + fmtRub(fee) + '</b></div><div class="rbw-bs-sep"></div>'
            + '<div class="rbw-bs-i"><em>Доли станут</em><b>' + Math.round(aa.stockPct) + ' / ' + Math.round(aa.bondPct) + '</b></div></div>';
        var note = !broker
            ? '<div class="rbw-ninfo">' + IC.info + '<span>Обмен <b>применится к портфелю сразу</b> и попадёт в историю сделок — его можно будет отменить. Реальные заявки брокеру идут только у портфелей, подключённых к счёту.</span></div>'
            : (canTr
                ? '<div class="rbw-nwarn">' + IC.warn + '<span>Это <b>зеркало брокерского счёта</b>. По кнопке уйдут <b>реальные заявки</b> брокеру Т-Инвестиций (' + fmtQty(d.qty) + ' на продажу, ' + fmtQty(d.buyQty) + ' на покупку). Спросим подтверждение. Состав обновится синком.</span></div>'
                : '<div class="rbw-ninfo">' + IC.info + '<span>Это <b>зеркало брокерского счёта</b>, а торгующее подключение не активно. Мастер подготовит тикеты в терминале Т-Инвестиций — там один тап на отправку.</span></div>');
        var body = '<div class="rbw-bskt">' + bar + legs + sum + note + '</div>';
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(3)">← Назад · расчёт</button>';
        var primaryLabel = rbw.executing ? 'Отправляем…' : (broker ? (canTr ? 'Выставить заявки брокеру <i>→</i>' : 'Открыть в терминале <i>→</i>') : 'Применить обмен · ' + fmtRub(proceeds + spend) + ' <i>→</i>');
        var hint = broker ? (canTr ? 'Реальные сделки — с подтверждением' : 'Заявки не отправятся сами') : 'Спишется ровно столько, сколько в кнопке';
        var foot = footHtml(back, hint, { label: primaryLabel, onclick: 'rbwExecute()' }, rbw.executing);
        return mainHtml('Шаг 4 из 4', broker ? (canTr ? 'Заявки готовы к отправке брокеру' : 'Заявки готовы для терминала') : 'Обмен готов к применению',
            'Продажа и покупка собраны в корзину. ' + (broker ? (canTr ? 'Уйдут брокеру по кнопке, не покидая мастер.' : 'Подготовим тикеты в терминале.') : 'Примените — портфель выровняется, запись ляжет в историю.'), body, foot);
    }
    function legHtml(side, cls, x, qty, unit, sumLbl, sumVal, ordType) {
        var name = cls === 'bond' ? x.name : x.ticker;
        var sub = cls === 'bond' ? ((x.det && x.det.matDate ? 'погашение ' + String(x.det.matDate).slice(0, 4) + ' · ' : '') + qty + ' шт') : ((x.name && x.name !== x.ticker ? esc(x.name) + ' · ' : '') + qty + ' шт');
        var own = '';
        var px = cls === 'bond'
            ? (ordType === 'market' ? 'по рынку ≈ <b>' + f2(x.price) + ' ₽</b>' : 'лимит <b>' + f2(x.price) + ' ₽</b>' + (x.nkd ? ' · +НКД ' + f2(x.nkd) : ''))
            : (ordType === 'market' ? 'по рынку ≈ <b>' + f2(x.price) + ' ₽</b>' : 'лимит <b>' + f2(x.price) + ' ₽</b>');
        return '<div class="rbw-oleg"><div class="rbw-lg-side ' + side + '">' + (side === 'sell' ? 'Продать' : 'Купить') + '</div>'
            + '<div class="rbw-lg-nm"><b>' + esc(name) + own + '</b><em>' + sub + '</em></div>'
            + '<div class="rbw-lg-ord"><div class="rbw-lg-seg"><span class="' + (ordType === 'market' ? 'on' : '') + '" onclick="rbwOrd(\'' + side + '\',\'market\')">Рыночная</span><span class="' + (ordType === 'limit' ? 'on' : '') + '" onclick="rbwOrd(\'' + side + '\',\'limit\')">Лимит</span></div>'
            + '<div class="rbw-lg-px">' + px + '</div></div>'
            + '<div class="rbw-lg-sum"><u>' + sumLbl + '</u><b>' + sumVal + '</b></div></div>';
    }

    /* ── квитанция ── */
    function screenReceipt() {
        var r = rbw.receipt; if (!r) { rbw.step = 4; return stepBasket(); }
        var d = new Date(), tm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        var rows = r.legs.map(function (l) {
            return '<div class="rbw-rcp-l"><div class="rbw-rl-st ' + l.st + '">' + (l.st === 'done' ? 'исполнено' : l.st === 'part' ? 'частично' : l.st === 'rej' ? 'отклонено' : 'в очереди') + '</div>'
                + '<div class="rbw-rl-nm"><b>' + (l.side === 'sell' ? 'Продать' : 'Купить') + ' ' + l.qty + ' × ' + esc(l.name) + '</b><em>' + esc(l.sub) + '</em></div>'
                + '<div class="rbw-rl-v">' + l.val + '<s>' + esc(l.note) + '</s></div></div>';
        }).join('');
        var rcp = '<div class="rbw-rcp"><div class="rbw-rcp-h"><div class="rbw-rh-ic">✓</div>'
            + '<div><b>' + r.title + '</b><p>' + r.sub + '</p></div><div class="rbw-rh-time">' + tm + '</div></div>'
            + rows
            + '<div class="rbw-rcp-tot">' + r.tot.map(function (t) { return '<div class="rbw-rt"><em>' + t[0] + '</em><b>' + t[1] + '</b></div>'; }).join('') + '</div></div>';
        var info = '<div class="rbw-ninfo" style="margin-top:15px">' + IC.bell + '<span>' + r.foot + '</span></div>';
        var body = '<div class="rbw-bskt">' + rcp + info + '</div>';
        var foot = footHtml('', '', { label: 'Готово — к итогу <i>→</i>', onclick: 'rbwGoDone()' });
        return mainHtml('Шаг 4 из 4 · Квитанция', 'Что реально исполнилось', '', body, foot);
    }

    /* ── готово ── */
    function screenDone() {
        var p = curPf(), r = rbw.receipt;
        if (!p) { rbw.step = 1; return stepPortfolio(); }
        var before = (r && r.alloc) ? r.alloc.before : null, after = (r && r.alloc) ? r.alloc.after : null;
        var c = PF.calcPf(p);
        var hero = '<div class="rbw-done-hero"><div class="rbw-dh-ic">✓</div><h3>Портфель выровнен</h3>'
            + '<p>' + (r && r.doneText ? r.doneText : 'Ребаланс применён. Состав портфеля обновлён.') + '</p></div>';
        var cards = '';
        if (before && after) {
            cards += '<div class="rbw-done-c"><em>Доли по классам · до → после</em>'
                + '<div class="rbw-ba"><div class="rbw-ba-b"><em>было</em><div class="rbw-ba-mini"><i class="st" style="width:' + Math.round(before.stockPct) + '%"></i><i class="bd" style="width:' + Math.round(before.bondPct) + '%"></i></div>'
                + '<div class="rbw-ba-cap"><span>Акции ' + Math.round(before.stockPct) + '</span><span>Обл. ' + Math.round(before.bondPct) + '</span></div></div>'
                + '<div class="rbw-ba-ar">→</div>'
                + '<div class="rbw-ba-a"><em>стало</em><div class="rbw-ba-mini"><i class="st" style="width:' + Math.round(after.stockPct) + '%"></i><i class="bd" style="width:' + Math.round(after.bondPct) + '%"></i></div>'
                + '<div class="rbw-ba-cap"><span>Акции ' + Math.round(after.stockPct) + '</span><span>Обл. ' + Math.round(after.bondPct) + '</span></div></div></div></div>';
        }
        if (r && r.coup) {
            cards += '<div class="rbw-done-c"><em>Машина денег · внутри облигаций</em>'
                + '<div class="rbw-mmini"><div class="rbw-mm-big">+' + f2(r.coup.delta) + ' ₽</div>'
                + '<div class="rbw-mm-t">купонов в год. Облигаций стало <b>' + r.coup.after + '</b> вместо <b>' + r.coup.before + '</b> — та же сумма, а платят на бумагу больше.</div></div></div>';
        }
        if (!cards) cards = '<div class="rbw-done-c"><em>Портфель</em><div class="rbw-mm-t">Стоимость ' + fmtRub(c.value) + ' · ' + (p.holdings || []).length + ' позиций. Обмен записан в историю сделок.</div></div>';
        var body = hero + '<div class="rbw-done-cards">' + cards + '</div>'
            + '<div class="rbw-done-next"><button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwRestart()">Ещё ребаланс</button>'
            + '<button type="button" class="rbw-btn rbw-btn-dark" style="margin-left:0" onclick="rbwToPortfolio()">В портфель →</button></div>';
        return mainHtml('Готово', 'Ребаланс завершён', '', body, '');
    }

    /* ═══════════ ГЛАВНЫЙ РЕНДЕР ═══════════ */
    PF.rbwSceneHtml = function () {
        var main;
        try {
            if (rbw.step === 1) main = stepPortfolio();
            else if (rbw.step === 2) main = stepMode();
            else if (rbw.step === 3) main = stepCalc();
            else if (rbw.step === 4) main = stepBasket();
            else if (rbw.step === 'receipt') main = screenReceipt();
            else if (rbw.step === 'done') main = screenDone();
            else main = stepPortfolio();
        } catch (e) {
            main = mainHtml('Ошибка', 'Что-то пошло не так', esc(e && e.message), '<div class="rbw-empty">Обновите страницу и попробуйте снова.</div>', '');
            if (window.console) console.error('[rbw]', e);
        }
        return '<div class="rbw" id="rbwBar" onclick="rbwClosePicker()">' + railHtml() + main + '</div>';
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
            + '<p style="color:var(--text-muted,#64748b);font-size:14px;line-height:1.6;margin-bottom:22px">Пошаговый расчёт самой выгодной сделки и выставление заявки прямо из мастера. Доступен зарегистрированным пользователям.</p>'
            + '<button type="button" class="rbw-btn rbw-btn-dark" style="margin:0 auto" onclick="(window.msAuth&&window.msAuth.open?window.msAuth.open():(window.openAuth&&window.openAuth()))">Войти</button>'
            + '</div></div>';
    };

    /* дорисовка после рендера: Esc, автоскролл наверх тела */
    var escBound = false;
    PF.rbwAfterRender = function () {
        if (!escBound) {
            escBound = true;
            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape') return;
                if (!document.getElementById('rbwBar')) return;
                if (rbw.picker) { rbw.picker = null; rerender(); e.preventDefault(); return; }
                if (typeof rbw.step === 'number' && rbw.step > 1) { rbwGoStep(rbw.step - 1); e.preventDefault(); }
            });
        }
    };

    function rerender() {
        var el = document.getElementById('rbwBar');
        if (el) {
            el.outerHTML = PF.rbwSceneHtml();
            if (PF.rbwAfterRender) PF.rbwAfterRender();
        } else if (PF.renderNoAnim) { PF.renderNoAnim(); }
    }

    /* ═══════════ ДЕЙСТВИЯ ═══════════ */
    window.rbwExit = function () { if (window.pfxGoTab) window.pfxGoTab('overview'); };
    window.rbwPickPf = function (pid) { rbw.pid = pid; persist(); rerender(); };
    window.rbwGoStep = function (n) {
        if (n === 2 && !curPf()) return;
        if (n >= 3 && !rbw.mode) { rbw.step = 2; rerender(); return; }
        if (n < rbw.step) { if (n <= 2) resetPicks(); if (n === 2) rbw.mode = rbw.mode; }
        rbw.step = n; rbw.picker = null; rerender();
    };
    window.rbwSetMode = function (m) { rbw.mode = m; resetPicks(); if (m === 'moment') { var p = curPf(); if (p) { var c = PF.calcPf(p); rbw.cls = c.bondVal > 0 ? 'bond' : 'stock'; } } rerender(); };
    window.rbwSetCls = function (cls) { rbw.cls = cls; resetPicks(); rerender(); };
    window.rbwOpenPicker = function (side) { rbw.picker = rbw.picker === side ? null : side; rerender(); };
    window.rbwClosePicker = function () { if (rbw.picker) { rbw.picker = null; rerender(); } };
    window.rbwChoose = function (side, id) {
        rbw.pick[side] = id;
        if (side === 'sell') rbw.pick.buy = null;  // сменили продаваемую — сбросить куплю
        rbw.pick.qty = null; rbw.picker = null; rerender();
    };
    window.rbwAuto = function () {
        var p = curPf(); if (!p) return;
        var ctx = dealCtx(); var cls = ctx.kind === 'annual' ? ctx.sellClass : ctx.cls;
        var auto = cls === 'bond' ? autoBondPair(p, rbw.pick.sell, rbw.pick.buy) : autoStockPair(p, rbw.pick.sell, rbw.pick.buy);
        if (!auto) { toast('Выгодной пары сейчас не видно — бумаги и так работают хорошо'); return; }
        // sell id — это h.id; buy id — isin/ticker
        var bs = cls === 'bond' ? heldBonds(p) : heldStocks(p);
        rbw.pick.sell = auto.sellId; rbw.pick.buy = auto.buyId; rbw.pick.qty = null; rbw.picker = null; rerender();
    };
    window.rbwPickAuto = function (i) { rbw.autoIdx = i; rerender(); };
    window.rbwOpenAuto = function () {
        var p = curPf(); var vs = autoVariants(p); var v = vs[rbw.autoIdx || 0]; if (!v) return;
        if (v.key === 'annual') { rbw.mode = 'annual'; resetPicks(); }
        else if (v.key === 'moment-bond') { rbw.mode = 'moment'; rbw.cls = 'bond'; resetPicks(); rbw.pick.sell = v.sellId; rbw.pick.buy = v.buyId; }
        else if (v.key === 'moment-stock') { rbw.mode = 'moment'; rbw.cls = 'stock'; resetPicks(); rbw.pick.sell = v.sellId; rbw.pick.buy = v.buyId; }
        rbw.step = 3; rerender();
    };
    window.rbwOrd = function (side, type) { rbw.ord[side] = type; rerender(); };

    window.rbwExecute = function () {
        if (rbw.executing) return;
        var p = curPf(); if (!p) return;
        var ctx = dealCtx(); if (!ctx || !ctx.deal || !(ctx.deal.buyQty > 0)) { toast('Нечего исполнять'); return; }
        if (p.broker) { return execBroker(p, ctx); }
        return execPaper(p, ctx);
    };

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
    function logTrade(p, t) { t.id = genId('t'); t.ts = Date.now(); t.fee = feeTax().fee; p.trades = p.trades || []; p.trades.unshift(t); if (p.trades.length > 120) p.trades.length = 120; }

    function execPaper(p, ctx) {
        var d = ctx.deal, before = { bondPct: PF.calcPf(p).bondPct, stockPct: PF.calcPf(p).stockPct };
        var coupBefore = ctx.cls === 'bond' && ctx.kind !== 'annual' ? d.coupBefore : null;
        var sellH = ctx.sell.h, sellIdx = (p.holdings || []).indexOf(sellH);
        var soldSnap = JSON.parse(JSON.stringify(sellH));
        reduceHolding(p, sellH, d.qty);
        var buyO = ctx.buyClass === 'bond'
            ? { type: 'bond', ticker: isinKey(ctx.buy.isin), name: ctx.buy.name, price: ctx.buy.price, nkd: ctx.buy.nkd, qty: d.buyQty }
            : { type: 'stock', ticker: ctx.buy.ticker, name: ctx.buy.name, price: ctx.buy.price, qty: d.buyQty, pot: ctx.buy.pot };
        var bought = addBought(p, buyO);
        var trade = {
            kind: ctx.sellClass === 'bond' ? 'bond' : 'stock',
            sellTicker: ctx.sellClass === 'bond' ? isinKey(ctx.sell.isin) : ctx.sell.ticker, sellName: ctx.sell.name, sellQty: d.qty,
            buyTicker: buyO.ticker, buyName: ctx.buy.name, buyQty: d.buyQty, proceeds: d.proceeds, rest: d.rest,
            potFrom: d.potFrom, potTo: d.potTo,
            undo: { sold: soldSnap, soldIdx: sellIdx, buyHid: bought.hid, buyLotId: bought.lotId }
        };
        logTrade(p, trade);
        if (d.rest > 0.005) p.cash = (p.cash || 0) + d.rest;
        PF.saveStore(); if (PF.pfInvalidateCharts) PF.pfInvalidateCharts(p.id);
        if (PF.ensureQuotes) try { PF.ensureQuotes(true); } catch (e) {}
        var after = { bondPct: PF.calcPf(p).bondPct, stockPct: PF.calcPf(p).stockPct };
        // квитанция
        var ft = feeTax();
        rbw.receipt = {
            title: 'Обмен применён', sub: 'Продажа и покупка записаны в портфель',
            legs: [
                { st: 'done', side: 'sell', qty: d.qty, name: ctx.sell.name, sub: 'средняя ' + f2(ctx.sell.price) + ' ₽', val: '+' + fmtRub(d.proceeds), note: d.qty + ' из ' + d.qty },
                { st: 'done', side: 'buy', qty: d.buyQty, name: ctx.buy.name, sub: (ctx.buyClass === 'bond' ? 'цена ' + f2(ctx.buy.price) + ' ₽ +НКД' : 'цена ' + f2(ctx.buy.price) + ' ₽'), val: '−' + fmtRub(d.buyQty * (ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price)), note: d.buyQty + ' из ' + d.buyQty }
            ],
            tot: [['Комиссия', '≈ ' + fmtRub((d.proceeds + d.buyQty * (ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price)) * ft.fee)], ['Свободно', fmtRub(p.cash || 0)], ['Доли', Math.round(after.stockPct) + ' / ' + Math.round(after.bondPct)]],
            foot: 'Обмен записан в историю сделок портфеля — его можно отменить оттуда. Купоны и доли пересчитаны.',
            alloc: { before: before, after: after },
            coup: (coupBefore != null) ? { before: d.qty, after: d.buyQty, delta: d.coupDelta } : null,
            doneText: ctx.kind === 'annual' ? 'Перекос ушёл к цели — доли снова в норме.' : (ctx.cls === 'bond' ? 'Внутри облигаций теперь работает на бумагу больше — купоны выросли.' : 'Внутри акций потенциал портфеля усилен.')
        };
        // фикс coup before/after числами бумаг:
        if (rbw.receipt.coup) { rbw.receipt.coup.before = d.qty; rbw.receipt.coup.after = d.buyQty; }
        if (window.msNotify && window.msNotify.local) window.msNotify.local('success', 'Ребаланс применён', ctx.sell.name + ' → ' + ctx.buy.name + ' · ' + fmtRub(d.proceeds));
        rbw.step = 'receipt'; rerender();
    }

    function brokerCanTrade() { var A = window.brokerApi; return !!(A && A.canTrade && A.canTrade()); }
    function brokerLegTicker(cls, side, x) {
        if (cls === 'bond') return (side === 'buy' && x.t) ? x.t : ((PF.fullBondId && PF.fullBondId(x.isin)) || x.isin);
        return x.ticker;
    }
    function execBroker(p, ctx) {
        var d = ctx.deal;
        var legs = [
            { ticker: brokerLegTicker(ctx.sellClass, 'sell', ctx.sell), side: 'sell', qty: d.qty, orderType: rbw.ord.sell, price: ctx.sell.price },
            { ticker: brokerLegTicker(ctx.buyClass, 'buy', ctx.buy), side: 'buy', qty: d.buyQty, orderType: rbw.ord.buy, price: ctx.buy.price }
        ];
        // нет торгующего подключения → безопасный мост: грузим тикеты в терминал (заявки НЕ шлём)
        if (!brokerCanTrade() || !PF.pftPlaceOrders) {
            if (PF.pftLoadPlan) { try { PF.pftLoadPlan(legs.map(function (l) { return { ticker: l.ticker, side: l.side, qty: l.qty }; })); } catch (e) {} }
            else toast('Подключите брокера в «Торговле», чтобы выставить заявки', true);
            return;
        }
        var fire = function () {
            rbw.executing = true; rerender();
            PF.pftPlaceOrders(legs).then(function (results) {
                rbw.executing = false;
                buildBrokerReceipt(p, ctx, results);
                var okN = results.filter(function (r) { return r.ok; }).length;
                if (window.msNotify && window.msNotify.local) window.msNotify.local(okN ? 'success' : 'warn', 'Заявки ребаланса', okN + ' из ' + results.length + ' отправлено брокеру Т-Инвестиций');
                rbw.step = 'receipt'; rerender();
            }, function (e) {
                rbw.executing = false; rerender();
                toast((e && e.message) || 'Не удалось выставить заявки', true);
            });
        };
        if (window.pfConfirm) window.pfConfirm('Выставить 2 заявки брокеру Т-Инвестиций? Это реальные сделки на вашем счёте.', fire);
        else if (!window.confirm || window.confirm('Выставить реальные заявки брокеру?')) fire();
    }
    function buildBrokerReceipt(p, ctx, results) {
        function statusOf(r) {
            if (!r.ok) return { st: 'rej', note: r.error || 'отклонено' };
            var resp = r.resp || {}, req = +resp.lotsRequested || r.lots, exe = +resp.lotsExecuted || 0;
            var rej = /REJECT/i.test(resp.executionReportStatus || '');
            var st = rej ? 'rej' : (exe >= req && req > 0 ? 'done' : 'part');
            var reqSh = req * r.lot, exeSh = exe * r.lot;
            return { st: st, note: rej ? (r.error || 'отклонено') : (st === 'done' ? reqSh + ' из ' + reqSh + ' шт' : exeSh + ' из ' + reqSh + ' шт · в очереди') };
        }
        var friendly = [ctx.sellClass === 'bond' ? ctx.sell.name : ctx.sell.ticker, ctx.buyClass === 'bond' ? ctx.buy.name : ctx.buy.ticker];
        var legsR = results.map(function (r, i) {
            var s = statusOf(r), isSell = r.leg.side === 'sell';
            return { st: s.st, side: r.leg.side, qty: r.leg.qty, name: friendly[i] || r.leg.ticker,
                sub: (isSell ? 'продажа' : 'покупка') + (r.ok ? ' · ' + r.lots + ' лот' : ''), val: '', note: s.note };
        });
        var anyOk = results.some(function (r) { return r.ok; });
        rbw.receipt = {
            title: anyOk ? 'Заявки приняты' : 'Заявки не прошли',
            sub: anyOk ? 'Отправлены брокеру Т-Инвестиций; исполнение придёт синком со счёта' : 'Проверьте подключение брокера и попробуйте снова',
            legs: legsR,
            tot: [['Счёт', 'Т-Инвестиции'], ['Статус', anyOk ? 'у брокера' : 'ошибка'], ['Записей', 'по синку']],
            foot: 'Это зеркало брокерского счёта — «бумажная» запись не создаётся. Состав обновится синком, а о закрытии заявок придёт звоночек сайта.',
            alloc: null, coup: null,
            doneText: 'Заявки ушли брокеру — состав портфеля обновится, как счёт синхронизируется.'
        };
    }

    window.rbwGoDone = function () { rbw.step = 'done'; rerender(); };
    window.rbwRestart = function () { rbw.step = 1; rbw.mode = null; resetPicks(); rbw.receipt = null; rerender(); };
    window.rbwToPortfolio = function () { rbw.step = 1; rbw.receipt = null; if (window.pfxGoTab) window.pfxGoTab('overview'); };

    function toast(msg, err) { if (window.showDashToast) window.showDashToast(msg, !!err); }

})();
