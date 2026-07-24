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
        pickerQ: '',             // строка поиска в пикере
        autoIdx: null,           // выбранный вариант в режиме «Авто»
        ord: { sell: 'market', buy: 'limit' }, // тип заявки в корзине
        cart: [],                // корзина обменов (мультизаявка): снимки сделок
        whatIf: false,           // открыт предпросмотр «Что если»
        receipt: null,           // результат исполнения
        executing: false
    };
    try {
        var sv = JSON.parse(localStorage.getItem('rbw_state_v1') || 'null');
        if (sv) {
            if (sv.pid) rbw.pid = sv.pid;
            if (sv.mode) rbw.mode = sv.mode;
            if (sv.cls) rbw.cls = sv.cls;
            if (sv.pick && typeof sv.pick === 'object') rbw.pick = sv.pick;
            if (typeof sv.autoIdx === 'number') rbw.autoIdx = sv.autoIdx;
            // шаг восстанавливаем только валидный (1..4); receipt/done — транзиентны
            if (typeof sv.step === 'number' && sv.step >= 1 && sv.step <= 4) rbw.step = sv.step;
        }
    } catch (e) {}
    function persist() {
        try {
            localStorage.setItem('rbw_state_v1', JSON.stringify({
                pid: rbw.pid, step: (typeof rbw.step === 'number' ? rbw.step : 1),
                mode: rbw.mode, cls: rbw.cls, pick: rbw.pick, autoIdx: rbw.autoIdx
            }));
        } catch (e) {}
    }
    function resetPicks() { rbw.pick = { sell: null, buy: null, qty: null }; rbw.picker = null; rbw.pickerQ = ''; rbw.autoIdx = null; }
    /* порог дрейфа (п.п.) — из портфеля, дефолт 3 */
    function driftThr(p) { return (p && p.driftThreshold != null && isFinite(+p.driftThreshold)) ? clamp(+p.driftThreshold, 0, 50) : 3; }

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
        lock: ico('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', 1.8),
        swap: ico('<path d="M8 4v16M8 4L5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3"/>')
    };
    function mono2(name) {
        var s = String(name || '').replace(/^ОФЗ\s*/i, '');
        var d = s.match(/\d{4,5}/); if (d) return d[0].slice(-2);
        return s.replace(/[^A-Za-zА-Яа-я]/g, '').slice(0, 2).toUpperCase();
    }
    // термин с всплывающим объяснением (пунктир + тултип по наведению) — чтобы не гуглить
    function gl(term, tip) { return '<span class="rbw-gl" tabindex="0">' + term + '<span class="rbw-gl-tip">' + tip + '</span></span>'; }
    var TIP = {
        nkd: 'НКД — накопленный купонный доход. Небольшая сумма, которую при покупке облигации доплачиваете прежнему владельцу за уже набежавший купон. Вам она вернётся ближайшей выплатой.',
        ytm: 'Доходность к погашению — сколько процентов годовых принесёт облигация, если держать её до конца: и купоны, и разница между ценой покупки и номиналом (1000 ₽).',
        market: 'Рыночная заявка — купить/продать прямо сейчас по лучшей доступной цене. Исполняется мгновенно, но цена может чуть отличаться от показанной.',
        limit: 'Лимитная заявка — по вашей цене (или лучше). Исполнится, только когда рынок дойдёт до неё; может подождать в очереди.'
    };

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
            var momYield = (ck.annual != null && isFinite(ck.annual)) ? ck.annual
                : (ck.days > 0 && ck.pnlPct != null ? ck.pnlPct * 365 / ck.days : (ck.pnlPct || 0));
            out.push({ h: h, id: h.id, isin: isin, name: h.name || isin, qty: ck.qty, price: price, nkd: nkd,
                unit: price + nkd, yield: bondYieldOf(isin, det), det: det, face: face, coupon: coupon, freq: freq,
                coupYear: coupon * freq * ck.qty, val: ck.value, buy: ck.buy, momYield: momYield });
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
            var pot = PF.rbLivePotential ? PF.rbLivePotential(h) : (PF.potentialOf ? PF.potentialOf(h.ticker) : null);
            out.push({ h: h, id: h.id, ticker: h.ticker, name: h.name || h.ticker, qty: ck.qty,
                price: ck.cur || 0, pot: pot, ech: echelonOf(h.ticker), val: ck.value, pnlPct: ck.pnlPct, buy: ck.buy });
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
            var c = PF.calcPf(p), tb = targetBond(p);
            var stockPct = Math.round(c.stockPct), bondPct = 100 - stockPct;
            var oneClass = (c.stockVal <= 0 || c.bondVal <= 0), dev = c.bondPct - tb;
            var drift = oneClass ? '<span class="rbw-rc-drift mid">один тип</span>'
                : (Math.abs(dev) < driftThr(p) ? '<span class="rbw-rc-drift ok">в норме</span>'
                    : '<span class="rbw-rc-drift hi">перевес ' + d1(Math.abs(dev)) + '%</span>');
            var bar = oneClass ? '' : '<div class="rbw-rc-bar"><i class="st" style="width:' + stockPct + '%"></i><i class="bd" style="width:' + bondPct + '%"></i></div>'
                + '<div class="rbw-rc-lg"><span class="a">Акции ' + stockPct + '</span><span class="b">Обл. ' + bondPct + '</span></div>';
            var modeLbl = { annual: 'Годовая', moment: 'В моменте', auto: 'Авто' }[rbw.mode];
            var modeSub = rbw.mode === 'moment' ? (rbw.cls === 'bond' ? 'внутри облигаций' : 'внутри акций') : (rbw.mode === 'annual' ? 'акции ↔ облигации' : 'система подберёт');
            ctx = '<div class="rbw-ctx"><em>Портфель</em>'
                + '<div class="rbw-rc-r"><span class="rbw-rc-dot" style="background:' + esc(p.color || '#5f7fa8') + '"></span>'
                + '<b>' + esc(p.name) + '</b>' + drift + '</div>'
                + '<u class="rbw-rc-val">' + fmtRub(c.value) + '</u>' + bar
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
    function driftBadge(c, tb, thr) {
        var dev = c.bondPct - tb, ad = Math.abs(dev);
        if (c.stockVal <= 0 || c.bondVal <= 0) return { cls: 'mid', txt: 'один тип бумаг' };
        if (ad < (thr != null ? thr : 3)) return { cls: 'ok', txt: 'доли в норме' };
        return { cls: 'hi', txt: 'перевес ' + (dev < 0 ? 'акций' : 'облигаций') + ' ' + d1(ad) + '%' };
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
                var p = r.p, sel = p.id === rbw.pid, d = driftBadge(r.c, r.tb, driftThr(p));
                var cnt = (p.holdings || []).length;
                var tags = (p.broker ? '<span class="rbw-pf-tag brk">брокер</span>' : '') + (p.hidden ? '<span class="rbw-pf-tag hid">скрыт</span>' : '');
                return '<div class="rbw-pf' + (sel ? ' sel' : '') + '" onclick="rbwPickPf(\'' + p.id + '\')">'
                    + '<div class="rbw-pf-radio"></div>'
                    + '<div class="rbw-pf-id"><b>' + esc(p.name) + tags + '</b><em>' + cnt + ' ' + plur(cnt, 'бумага', 'бумаги', 'бумаг') + ' · цель ' + (100 - r.tb) + '% акций / ' + r.tb + '% облигаций</em></div>'
                    + '<div class="rbw-pf-alloc"><div class="rbw-pf-bar"><i class="st" style="width:' + r.stockPct + '%"></i><i class="bd" style="width:' + r.bondPct + '%"></i></div>'
                    + '<div class="rbw-pf-lg"><span class="a">Акции ' + r.stockPct + '%</span><span class="b">Облигации ' + r.bondPct + '%</span></div></div>'
                    + '<div class="rbw-pf-right"><span class="rbw-pf-val">' + fmtRub(r.c.value) + '</span><span class="rbw-pf-drift ' + d.cls + '">' + d.txt + '</span></div></div>';
            }).join('') + '</div>';
        }
        var p0 = curPf();
        var hint = p0 ? 'Выбран «' + esc(p0.name) + '»' : '';
        var foot = footHtml('', hint, list.length ? { label: 'Далее — режим <i>→</i>', onclick: 'rbwGoStep(2)' } : null, !list.length);
        return mainHtml('Шаг 1 из 4', 'Какой портфель приводим в порядок?',
            'Ребаланс возвращает состав портфеля к вашей цели: продаём то, чего стало слишком много, и докупаем то, чего мало. Выберите портфель — где доли ушли от цели, отмечено.', body, foot);
    }

    /* ── шаг 2 ── */
    function stepMode() {
        var p = curPf(); if (!p) { rbw.step = 1; return stepPortfolio(); }
        var c = PF.calcPf(p), tb = targetBond(p), dev = Math.abs(c.bondPct - tb), thr = driftThr(p);
        var oneClass = (c.stockVal <= 0 || c.bondVal <= 0);
        var recoAnnual = !oneClass && dev >= thr;
        var stockPct = Math.round(c.stockPct);
        var annualDis = oneClass;
        var annual = '<div class="rbw-modec' + (rbw.mode === 'annual' ? ' sel' : '') + (recoAnnual ? ' reco' : '') + (annualDis ? ' dis' : '') + '"' + (annualDis ? '' : ' onclick="rbwSetMode(\'annual\')"') + '>'
            + '<div class="rbw-mc-ic">' + IC.scale + '</div><h4>Годовая</h4>'
            + '<div class="rbw-mc-d">' + (annualDis ? 'В портфеле только один тип бумаг — выравнивать акции с облигациями нечего.' : 'Возвращаем доли акций и облигаций к вашей цели ' + (100 - tb) + ' / ' + tb + ': продаём чего много, докупаем чего мало. Делают раз в год или когда состав сильно уплыл.') + '</div>'
            + '<div class="rbw-mc-diag"><span class="rbw-dglbl">как есть → как надо</span><div class="rbw-mc-two">'
            + '<div class="rbw-mc-b"><i class="st" style="width:' + stockPct + '%"></i><i class="bd" style="width:' + (100 - stockPct) + '%"></i></div>'
            + '<div class="rbw-mc-cap"><span>' + stockPct + ' / ' + (100 - stockPct) + '</span><span style="color:var(--acc)">→ ' + (100 - tb) + ' / ' + tb + '</span></div></div></div>'
            + '<div class="rbw-mc-pick">' + (rbw.mode === 'annual' ? '✓ Выбрано' : 'Выбрать') + '</div></div>';
        var moment = '<div class="rbw-modec' + (rbw.mode === 'moment' ? ' sel' : '') + '" onclick="rbwSetMode(\'moment\')">'
            + '<div class="rbw-mc-ic">' + IC.spark + '</div><h4>В моменте</h4>'
            + '<div class="rbw-mc-d">Доли акций и облигаций не меняем. Внутри одного типа меняем бумагу на более выгодную — больше дохода на те же деньги.</div>'
            + '<div class="rbw-mc-diag"><span class="rbw-dglbl">на те же деньги — больше отдача</span>'
            + '<div class="rbw-mc-swap"><span class="pill o">продать 10</span><span class="ar">→</span><span class="pill n">купить 11</span></div>'
            + '<div class="rbw-mc-cap" style="margin-top:8px">та же сумма — купонов больше</div></div>'
            + '<div class="rbw-mc-pick">' + (rbw.mode === 'moment' ? '✓ Выбрано' : 'Выбрать') + '</div></div>';
        var auto = '<div class="rbw-modec' + (rbw.mode === 'auto' ? ' sel' : '') + '" onclick="rbwSetMode(\'auto\')">'
            + '<div class="rbw-mc-ic">' + IC.spark + '</div><h4>Авто <span class="rbw-mc-hint">не уверены? начните отсюда</span></h4>'
            + '<div class="rbw-mc-d">Система сама найдёт выгодные обмены и покажет готовые варианты — вам останется выбрать и подтвердить.</div>'
            + '<div class="rbw-mc-diag"><span class="rbw-dglbl">система найдёт варианты</span><div class="rbw-mc-auto">'
            + '<div class="rbw-au"><i>1</i>Вернуть доли к цели</div>'
            + '<div class="rbw-au"><i>2</i>Зафиксировать рывок ОФЗ</div>'
            + '<div class="rbw-au"><i>3</i>Усилить потенциал акций</div></div></div>'
            + '<div class="rbw-mc-pick">' + (rbw.mode === 'auto' ? '✓ Выбрано' : 'Выбрать') + '</div></div>';
        var thrBar = oneClass ? '' : '<div class="rbw-thr"><span>Считаем, что доли уплыли, если разница с целью больше</span>'
            + '<button type="button" class="rbw-thr-b" onclick="rbwSetThr(-1)">−</button><b>' + thr + '%</b><button type="button" class="rbw-thr-b" onclick="rbwSetThr(1)">＋</button>'
            + '<em>сейчас разница ' + d1(dev) + '% — ' + (dev >= thr ? 'уже стоит выровнять' : 'пока в норме') + '</em></div>';
        var body = thrBar + '<div class="rbw-modes">' + annual + moment + auto + '</div>';
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(1)">← Назад</button>';
        var foot = footHtml(back, rbw.mode ? '' : 'Выберите способ', rbw.mode ? { label: 'Далее — расчёт <i>→</i>', onclick: 'rbwGoStep(3)' } : null, !rbw.mode);
        return mainHtml('Шаг 2 из 4', 'Что хотите сделать?',
            'Три способа привести портфель в порядок. ' + (recoAnnual ? 'Доли сильно ушли от цели — советуем «Годовую».' : 'Доли в норме — можно поработать «в моменте».') + ' Не уверены — берите «Авто».', body, foot);
    }

    /* ── шаг 3 · пикер ── */
    function pickerHtml(ctx, side) {
        var cls = side === 'sell' ? ctx.sellClass : ctx.buyClass;
        var pos = 'left:0;top:calc(100% + 10px)';   // якорится под строкой сделки (.rbw-c2-inst — relative)
        var rows = '', p = ctx.p;
        if (side === 'sell') {
            var list = cls === 'bond' ? heldBonds(p) : heldStocks(p);
            // для облигаций сортируем по «росту в моменте» — сверху та, что выгоднее продать
            if (cls === 'bond') list = list.slice().sort(function (a, b) { return (b.momYield || -1e9) - (a.momYield || -1e9); });
            rows = list.map(function (x) {
                var cur = ctx.sell && (cls === 'bond' ? ctx.sell.isin === x.isin : ctx.sell.ticker === x.ticker);
                var metric = cls === 'bond' ? (x.momYield != null ? d1(x.momYield) + '%' : '—') : (x.pot != null ? fmtPct(x.pot) : '—');
                var sub = f2(x.price) + ' ₽ · ' + x.qty + ' шт';
                return '<div class="rbw-pop-row' + (cls === 'stock' ? ' stk' : '') + (cur ? ' sel' : '') + '" data-nm="' + esc((x.name + ' ' + (x.isin || x.ticker || '')).toLowerCase()) + '" onclick="rbwChoose(\'sell\',\'' + esc(x.id) + '\')">'
                    + '<div class="dm">' + mono2(x.name) + '</div><div class="dt"><b>' + esc(x.name) + '</b><em>' + sub + '</em></div>'
                    + '<div class="dv"><b>' + metric + '</b><em>' + (cls === 'bond' ? 'рост, годовых' : 'потенциал') + '</em></div>'
                    + '<div class="dck">' + (cur ? '✓' : '') + '</div></div>';
            }).join('');
        } else {
            if (cls === 'bond') {
                var cands = bondCands().filter(function (x) { return !ctx.sell || isinKey(x.isin) !== isinKey(ctx.sell.isin); })
                    .sort(function (a, b) { return (b.yield || 0) - (a.yield || 0); });
                var held = {}; heldBonds(p).forEach(function (x) { held[isinKey(x.isin)] = 1; });
                rows = cands.map(function (x) {
                    var cur = ctx.buy && ctx.buy.isin === x.isin, own = held[isinKey(x.isin)];
                    return '<div class="rbw-pop-row' + (cur ? ' sel' : '') + '" data-nm="' + esc((x.name + ' ' + x.isin).toLowerCase()) + '" onclick="rbwChoose(\'buy\',\'' + esc(x.isin) + '\')">'
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
                    return '<div class="rbw-pop-row stk' + (cur ? ' sel' : '') + '" data-nm="' + esc((x.ticker + ' ' + (x.name || '')).toLowerCase()) + '" onclick="rbwChoose(\'buy\',\'' + esc(x.ticker) + '\')">'
                        + '<div class="dm">' + mono2(x.ticker) + '</div><div class="dt"><b>' + esc(x.ticker) + '</b><em>' + esc(x.name || '') + '</em></div>'
                        + '<div class="dv"><b>' + (x.pot != null ? fmtPct(x.pot) : '—') + '</b><em>потенциал</em></div>'
                        + '<div class="dck">' + (cur ? '✓' : '') + '</div></div>';
                }).join('');
            }
        }
        if (!rows) rows = '<div class="rbw-pop-empty">Кандидатов пока нет — данные подгружаются.</div>';
        var sortTxt = cls === 'bond' ? (side === 'sell' ? 'рост в моменте ↓' : 'доходность ↓') : 'потенциал ↓';
        return '<div class="rbw-pop left" style="' + pos + '" onclick="event.stopPropagation()">'
            + '<div class="rbw-pop-search">' + IC.search + '<input class="rbw-pop-inp" type="text" placeholder="Поиск ' + (cls === 'bond' ? 'выпуска ОФЗ' : 'акции') + '…" value="' + esc(rbw.pickerQ) + '" oninput="rbwPickerFilter(this.value)" onkeydown="rbwPickerKey(event)"></div>'
            + '<div class="rbw-pop-sort">Сортировка: <b>' + sortTxt + '</b> · ↑↓ выбор, Enter — взять</div>'
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
        return '<div class="rbw-pick' + act + '" title="Нажмите, чтобы выбрать другую бумагу" onclick="event.stopPropagation();rbwOpenPicker(\'' + side + '\')">'
            + '<div class="rbw-mono">' + mono2(name) + '</div>'
            + '<div class="rbw-pk-t"><b>' + esc(name) + own + '</b><em>' + meta + '</em></div><span class="rbw-pk-cv">сменить ▾</span></div>';
    }

    /* ── шаг 3 · сцена-сделка (годовая/в моменте) ── */
    function stepCalc() {
        var p = curPf(); if (!p) { rbw.step = 1; return stepPortfolio(); }
        if (rbw.mode === 'auto') return stepAuto();
        var ctx = dealCtx();
        if (!ctx || !ctx.sell || !ctx.buy || !ctx.deal) {
            var msg = ctx && ctx.kind === 'annual' ? 'Для этого способа нужны и акции, и облигации — а здесь только один тип бумаг. Выберите «В моменте» или другой портфель.' : 'Пока нет выгодной пары для обмена — данные ещё подгружаются или бумага в портфеле одна.';
            var body0 = '<div class="rbw-ds"><div class="rbw-empty">' + msg + '</div></div>';
            return mainHtml('Шаг 3 из 4', 'Расчёт', '', body0,
                footHtml('<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(2)">← Назад · режим</button>', '', null));
        }
        var d = ctx.deal, isAnnual = ctx.kind === 'annual';
        var sellNm = ctx.sellClass === 'bond' ? ctx.sell.name : ctx.sell.ticker;
        // заголовок + подзаголовок (плейн, «зачем» одной фразой)
        var title, sub, c;
        if (isAnnual) {
            c = ctx.c; var over = ctx.over, dev = over === 'stock' ? (c.stockPct - (100 - ctx.tb)) : (c.bondPct - ctx.tb);
            title = 'Переложить ≈ ' + fmtRub(ctx.move) + ' из ' + (over === 'stock' ? 'акций в облигации' : 'облигаций в акции');
            sub = (over === 'stock' ? 'Акций' : 'Облигаций') + ' стало больше цели на ' + d1(Math.abs(dev)) + '% — этот обмен вернёт портфель к цели ' + (100 - ctx.tb) + ' / ' + ctx.tb + '. Всё можно поправить: бумагу, количество.';
        } else if (ctx.cls === 'bond') {
            var sMom = ctx.sell.momYield, momStr = (sMom != null && isFinite(sMom)) ? ' (это ≈ ' + d1(sMom) + '% годовых)' : '';
            var betterY = (ctx.sell.yield != null && ctx.buy.yield != null && ctx.buy.yield > ctx.sell.yield), moreB = d.more > 0;
            title = moreB ? 'Продать выросшую, купить доходную: облигаций ' + d.qty + ' → ' + d.buyQty
                : (betterY ? 'Обменять на более доходную облигацию' : 'Обмен внутри облигаций');
            sub = esc(sellNm) + ' сильнее других выросла в цене' + momStr + ' — сейчас её выгодно продать и забрать прибыль. На всю выручку берём '
                + (betterY ? '<b>более доходную (' + fmtPct(ctx.buy.yield) + ' против ' + fmtPct(ctx.sell.yield) + ')</b>' : 'другую') + ' облигацию'
                + (moreB ? ', и её выходит больше — ' + d.qty + ' → ' + d.buyQty : '') + '. Доли акций и облигаций не меняются.';
        } else {
            title = 'Обменять акцию на более перспективную';
            sub = esc(sellNm) + ' по ожидаемому росту слабее другой бумаги того же уровня. Доля акций та же.';
        }
        // ── ЛЕВО: сама сделка простыми словами ──
        var clsBar = (!isAnnual) ? '<div class="rbw-c2-clsbar"><span class="rbw-c2-clslbl">Работаем с:</span>' + clsToggle() + '</div>' : '';
        var left = '<div class="rbw-c2-left">' + clsBar
            + '<div class="rbw-c2-deal">'
            + c2Row('sell', ctx, d)
            + '<div class="rbw-c2-arrow" title="меняем одно на другое">' + IC.swap + '</div>'
            + c2Row('buy', ctx, d) + '</div>'
            + qtyCtrl(ctx, d)
            + '<div class="rbw-c2-actions"><button type="button" class="rbw-c2-act" onclick="rbwAuto()">✦ Подобрать выгоднее</button>'
            + '<button type="button" class="rbw-c2-act" onclick="rbwCartAdd()">＋ Ещё обмен' + (rbw.cart.length ? ' (' + rbw.cart.length + ')' : '') + '</button>'
            + '<span class="rbw-c2-hint">' + calcNote(ctx) + '</span></div></div>';
        // ── ПРАВО: что изменится (наглядно) ──
        var right = '<div class="rbw-c2-right">' + c2Panel(ctx, d) + '</div>';
        var body = '<div class="rbw-calc2">' + left + right + '</div>';
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(2)">← Назад</button>'
            + '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwWhatIf()">👁 Что если</button>';
        var nDeals = effectiveDeals().length;
        var foot = footHtml(back, '', { label: 'Дальше — оформить заявку' + (nDeals > 1 ? ' (' + nDeals + ')' : '') + ' <i>→</i>', onclick: 'rbwToBasket()' });
        return mainHtml('Шаг 3 из 4 · ' + (isAnnual ? 'Годовая' : 'В моменте'), title, sub, body, foot);
    }
    // строка сделки: сторона · бумага (сменить) · количество · сумма
    function c2Row(side, ctx, d) {
        var isSell = side === 'sell', cls = isSell ? ctx.sellClass : ctx.buyClass, x = isSell ? ctx.sell : ctx.buy;
        var qty = isSell ? d.qty : d.buyQty, unit = cls === 'bond' ? x.unit : x.price;
        var sum = isSell ? d.proceeds : d.buyQty * unit;
        var name = cls === 'bond' ? x.name : x.ticker;
        var own = '';
        if (!isSell && cls === 'bond') { var h = {}; heldBonds(ctx.p).forEach(function (b) { h[isinKey(b.isin)] = 1; }); if (h[isinKey(x.isin)]) own = ' <span class="rbw-own">уже есть</span>'; }
        var px = cls === 'bond' ? ('по ' + f2(x.price) + ' ₽' + (x.nkd ? ' + ' + gl('НКД', TIP.nkd) + ' ' + f2(x.nkd) : '')
            + (isSell && ctx.kind !== 'annual' && x.momYield != null ? ' · вырос ≈ ' + d1(x.momYield) + '%/год' : '')
            + (!isSell && x.yield != null ? ' · доходность ' + fmtPct(x.yield) : '')) : ('по ' + f2(x.price) + ' ₽ за штуку');
        var open = rbw.picker === side;
        return '<div class="rbw-c2-row ' + side + '"><div class="rbw-c2-side">' + (isSell ? 'Продаём' : 'Покупаем') + '</div>'
            + '<div class="rbw-c2-inst' + (open ? ' open' : '') + '" title="Нажмите, чтобы выбрать другую бумагу" onclick="event.stopPropagation();rbwOpenPicker(\'' + side + '\')">'
            + '<div class="rbw-c2-mono">' + mono2(name) + '</div>'
            + '<div class="rbw-c2-nm"><b>' + esc(name) + own + '</b><em>' + px + '</em></div>'
            + '<span class="rbw-c2-chg">сменить ▾</span>'
            + (open ? pickerHtml(ctx, side) : '') + '</div>'
            + '<div class="rbw-c2-num"><b>' + (isSell ? '−' : '+') + fmtQty(qty) + '</b><span>шт</span></div>'
            + '<div class="rbw-c2-money"><u>' + (isSell ? 'освободится' : 'спишется') + '</u><b>' + fmtRub(sum) + '</b></div></div>';
    }
    function c2BaRow(lbl, sPct, bPct, tb, on) {
        return '<div class="rbw-c2-ba-row' + (on ? ' on' : '') + '"><div class="rbw-c2-ba-lbl">' + lbl + '</div>'
            + '<div class="rbw-c2-ba-bar"><i class="st" style="width:' + clamp(sPct, 0, 100) + '%"></i><i class="bd" style="width:' + clamp(bPct, 0, 100) + '%"></i>'
            + (tb != null ? '<u style="left:' + clamp(100 - tb, 0, 100) + '%"></u>' : '') + '</div>'
            + '<div class="rbw-c2-ba-v">' + Math.round(sPct) + ' / ' + Math.round(bPct) + '</div></div>';
    }
    // правая панель «Что изменится»
    function c2Panel(ctx, d) {
        var p = ctx.p, isAnnual = ctx.kind === 'annual';
        var spend = d.buyQty * (ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price);
        var tax = saleTax(ctx.sell, d.qty), fee = (d.proceeds + spend) * feeTax().fee;
        var viz;
        if (isAnnual) {
            var c = PF.calcPf(p), aa = allocAfter(p, ctx), tb = ctx.tb;
            viz = '<div class="rbw-c2-ba">'
                + c2BaRow('Сейчас', c.stockPct, c.bondPct, tb, false)
                + '<div class="rbw-c2-ba-mid"><span>вернём к цели ' + (100 - tb) + ' / ' + tb + '</span></div>'
                + c2BaRow('Станет', aa.stockPct, aa.bondPct, tb, true) + '</div>'
                + '<div class="rbw-c2-legend"><span><i class="st"></i>Акции</span><span><i class="bd"></i>Облигации</span><span><i class="tg"></i>Цель</span></div>';
        } else if (ctx.cls === 'bond') {
            var by = ctx.buy.yield, sMom2 = ctx.sell.momYield;
            if (d.more > 0) {
                viz = '<div class="rbw-c2-shift"><em>Облигаций станет</em>'
                    + '<div class="rbw-c2-shift-r"><s>' + d.qty + ' шт</s><span class="ar">→</span><b>' + d.buyQty + ' шт</b></div>'
                    + '<div class="rbw-c2-shift-d up">▲ +' + d.more + ' ' + plur(d.more, 'бумага', 'бумаги', 'бумаг') + ' на ту же сумму</div>'
                    + '<p>Продаём выросшую в цене' + (sMom2 != null ? ' (≈ ' + d1(sMom2) + '% годовых)' : '') + ' и берём ' + (by != null ? 'доходнее (' + fmtPct(by) + ' к погашению) и ' : '') + 'дешевле — поэтому бумаг больше.' + (d.coupDelta >= 0.5 ? ' Купонов в год: +' + f2(d.coupDelta) + ' ₽.' : '') + '</p></div>';
            } else {
                var betterY3 = (ctx.sell.yield != null && by != null && by > ctx.sell.yield);
                viz = '<div class="rbw-c2-shift"><em>Годовая доходность к погашению</em>'
                    + '<div class="rbw-c2-shift-r"><s>' + (ctx.sell.yield != null ? fmtPct(ctx.sell.yield) : '—') + '</s><span class="ar">→</span><b>' + (by != null ? fmtPct(by) : '—') + '</b></div>'
                    + (betterY3 ? '<div class="rbw-c2-shift-d up">▲ +' + d1(by - ctx.sell.yield) + '% годовых</div>' : '')
                    + '<p>' + (betterY3 ? 'Берём облигацию доходнее к погашению.' : 'Меняем на выбранную облигацию.') + ' Доли акций и облигаций не меняются.</p></div>';
            }
        } else {
            viz = '<div class="rbw-c2-shift"><em>Ожидаемый рост</em>'
                + '<div class="rbw-c2-shift-r"><s>' + (d.potFrom != null ? fmtPct(d.potFrom) : '—') + '</s><span class="ar">→</span><b>' + (d.potTo != null ? fmtPct(d.potTo) : '—') + '</b></div>'
                + (d.potDelta != null ? '<div class="rbw-c2-shift-d up">▲ +' + d1(d.potDelta) + '%</div>' : '')
                + '<p>Меняем на более перспективную бумагу того же уровня. Доля акций та же.</p></div>';
        }
        var nums = '<div class="rbw-c2-nums">'
            + '<div class="rbw-c2-n"><em>Останется свободно</em><b>' + fmtRub(d.rest) + '</b></div>'
            + '<div class="rbw-c2-n"><em>Комиссия</em><b>≈ ' + fmtRub(fee) + '</b></div>'
            + (tax > 0.5 ? '<div class="rbw-c2-n"><em>Налог (НДФЛ)</em><b>≈ ' + fmtRub(tax) + '</b></div>' : '')
            + '</div>';
        return '<div class="rbw-c2-panel"><div class="rbw-c2-panel-h"><i>' + IC.info + '</i>Что изменится</div>' + viz + nums + '</div>';
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
    function qtyCtrl(ctx, d) {
        var max = ctx.sell.qty;
        return '<div class="rbw-qty"><span class="rbw-qty-l">Кол-во к продаже</span>'
            + '<button type="button" class="rbw-qty-b" onclick="event.stopPropagation();rbwQtyStep(-1)">−</button>'
            + '<input class="rbw-qty-in" type="range" min="1" max="' + max + '" value="' + d.qty + '" oninput="rbwQtyLive(this.value)" onchange="rbwSetQty(this.value)">'
            + '<button type="button" class="rbw-qty-b" onclick="event.stopPropagation();rbwQtyStep(1)">＋</button>'
            + '<b class="rbw-qty-v">' + fmtQty(d.qty) + ' шт</b><span class="rbw-qty-max">из ' + max + '</span></div>';
    }
    /* ── мультизаявка: снимок сделки и корзина ── */
    function dealSnapshot(ctx) {
        var d = ctx.deal;
        var sellUnit = ctx.sellClass === 'bond' ? ctx.sell.unit : ctx.sell.price;
        var buyUnit = ctx.buyClass === 'bond' ? ctx.buy.unit : ctx.buy.price;
        return {
            kind: ctx.kind, cls: ctx.cls, sellClass: ctx.sellClass, buyClass: ctx.buyClass,
            sell: { id: ctx.sell.id, isin: ctx.sell.isin, ticker: ctx.sell.ticker, name: ctx.sell.name, price: ctx.sell.price, nkd: ctx.sell.nkd, unit: sellUnit, buy: ctx.sell.buy, det: ctx.sell.det, t: ctx.sell.t, coupon: ctx.sell.coupon, freq: ctx.sell.freq },
            buy: { isin: ctx.buy.isin, ticker: ctx.buy.ticker, name: ctx.buy.name, price: ctx.buy.price, nkd: ctx.buy.nkd, unit: buyUnit, coupon: ctx.buy.coupon, freq: ctx.buy.freq, pot: ctx.buy.pot, t: ctx.buy.t, det: ctx.buy.det },
            qty: d.qty, buyQty: d.buyQty, proceeds: d.proceeds, rest: d.rest, coupDelta: d.coupDelta, potDelta: d.potDelta
        };
    }
    function sameDeal(a, b) {
        if (!a || !b || a.sell.id !== b.sell.id) return false;
        return a.buyClass === 'bond' ? isinKey(a.buy.isin) === isinKey(b.buy.isin) : a.buy.ticker === b.buy.ticker;
    }
    function curDraft() { var ctx = dealCtx(); return (ctx && ctx.sell && ctx.buy && ctx.deal && ctx.deal.buyQty > 0) ? dealSnapshot(ctx) : null; }
    // все обмены к исполнению: корзина + текущий черновик (если не дубль уже добавленного)
    function effectiveDeals() {
        var arr = rbw.cart.slice(), dr = curDraft();
        if (dr && !arr.some(function (x) { return sameDeal(x, dr); })) arr.push(dr);
        return arr;
    }
    function calcNote(ctx) {
        if (ctx.kind === 'annual') return 'Продаём часть того, чего перебор, и на эти деньги докупаем недостающее — доли возвращаются к цели. Бумаги и количество можно поменять.';
        if (ctx.cls === 'bond') return 'Продаём облигацию, которая сильнее всех выросла в цене (забираем прибыль), и берём доходнее к погашению и дешевле — поэтому бумаг выходит больше. Бумаги можно поменять.';
        return 'Продаём акцию послабее и берём более перспективную того же уровня. Бумаги можно поменять.';
    }

    /* ── шаг 3 · авто ── */
    function autoVariants(p) {
        var vs = [];
        var c = PF.calcPf(p), tb = targetBond(p);
        if (c.stockVal > 0 && c.bondVal > 0 && Math.abs(c.bondPct - tb) >= driftThr(p)) {
            var over = overClass(p), move = over === 'bond' ? (c.bondVal - c.value * tb / 100) : (c.stockVal - c.value * (100 - tb) / 100);
            vs.push({ key: 'annual', ic: 'a', icon: IC.scale, title: 'Вернуть доли к цели', mode: 'способ «Годовая» · акции ↔ облигации',
                desc: (over === 'stock' ? 'Акций' : 'Облигаций') + ' больше цели на ' + d1(Math.abs(c.bondPct - tb)) + '%. Переложить ≈ ' + fmtRub(Math.max(0, move)) + ', чтобы вернуть к ' + (100 - tb) + ' / ' + tb + '.',
                gain: '≈ ' + fmtRub(Math.max(0, move)), gsub: 'переложено к цели' });
        }
        var ab = autoBondPair(p);
        if (ab) {
            var bs = heldBonds(p), cd = bondCands();
            var s = find(bs, function (x) { return x.id === ab.sellId; }), b = find(cd, function (x) { return x.isin === ab.buyId; });
            if (s && b) { var dd = computeBondDeal(p, s, b); var more = dd.buyQty - dd.qty; vs.push({ key: 'moment-bond', ic: 'b', icon: IC.coin, title: 'Зафиксировать рост и купить доходную', mode: 'способ «В моменте» · внутри облигаций',
                desc: esc(s.name) + ' сильнее всех выросла' + (s.momYield != null ? ' (≈ ' + d1(s.momYield) + '%/год)' : '') + ' — продаём и берём ' + esc(b.name) + ' доходнее' + (b.yield != null ? ' (' + fmtPct(b.yield) + ')' : '') + ' и дешевле: облигаций ' + dd.qty + ' → ' + dd.buyQty + '.',
                gain: more > 0 ? '+' + more + ' ' + plur(more, 'бумага', 'бумаги', 'бумаг') : (b.yield != null ? fmtPct(b.yield) : '+доход'), gsub: more > 0 ? 'на ту же сумму' : 'доходность', sellId: s.id, buyId: b.isin }); }
        }
        var as = autoStockPair(p);
        if (as) {
            var ss = heldStocks(p);
            var s2 = find(ss, function (x) { return x.id === as.sellId; }), cands = stockCandsFor(0);
            var b2 = find(cands, function (x) { return x.ticker === as.buyId; });
            if (s2 && b2 && b2.pot != null && s2.pot != null) { vs.push({ key: 'moment-stock', ic: 's', icon: IC.bars, title: 'Акции с бо́льшим потенциалом', mode: 'способ «В моменте» · внутри акций',
                desc: 'У ' + esc(s2.ticker) + ' ожидаемый рост ' + fmtPct(s2.pot) + ', у ' + esc(b2.ticker) + ' — ' + fmtPct(b2.pot) + '. Меняем на более перспективную, доля акций та же.',
                gain: '+' + f2(b2.pot - s2.pot) + '%', gsub: 'ожидаемый рост', sellId: s2.id, buyId: b2.ticker }); }
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
            + '<div class="rbw-ninfo" style="margin-top:15px">' + IC.info + '<span>Мастер сам проверил ваши бумаги и подобрал выгодные обмены — отсортированы по пользе, невыгодных тут нет. Выберите любой, дальше увидите готовый расчёт и сможете всё поправить.</span></div>';
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(2)">← Назад</button>';
        var foot = footHtml(back, 'Выбран вариант ' + (rbw.autoIdx + 1) + ' — можно поменять', { label: 'Показать расчёт <i>→</i>', onclick: 'rbwOpenAuto()' });
        return mainHtml('Шаг 3 из 4 · Авто', 'Готовые варианты — выберите любой',
            'Мастер сам нашёл, что стоит поменять. Каждый вариант — с посчитанной пользой; ничего не применяется, пока не подтвердите.', body, foot);
    }

    /* ── шаг 4 · корзина ── */
    function dealName(x) { return x.name || x.ticker || '—'; }
    function allocAfterCart(p, deals) {
        var c = PF.calcPf(p), bondV = c.bondVal, stockV = c.stockVal;
        deals.forEach(function (dl) {
            var sV = dl.qty * dl.sell.unit, bV = dl.buyQty * dl.buy.unit;
            if (dl.sellClass === 'bond') bondV -= sV; else stockV -= sV;
            if (dl.buyClass === 'bond') bondV += bV; else stockV += bV;
        });
        var tot = bondV + stockV;
        return { bondPct: tot > 0 ? bondV / tot * 100 : 0, stockPct: tot > 0 ? stockV / tot * 100 : 0 };
    }
    /* №7 «Что если»: предпросмотр эффекта БЕЗ применения (портфель не трогаем) */
    function buildWhatIf(p, deals) {
        var c = PF.calcPf(p), ft = feeTax();
        var before = { stockPct: c.stockPct, bondPct: c.bondPct };
        var after = allocAfterCart(p, deals);
        var coupBefore = heldBonds(p).reduce(function (s, x) { return s + x.coupYear; }, 0), coupAfter = coupBefore;
        var proceeds = 0, spend = 0, rest = 0, tax = 0;
        deals.forEach(function (dl) {
            proceeds += dl.proceeds; spend += dl.buyQty * dl.buy.unit; rest += dl.rest; tax += saleTax(dl.sell, dl.qty);
            var addC = dl.buyClass === 'bond' ? dl.buyQty * (dl.buy.coupon || 0) * (dl.buy.freq || 0) : 0;
            var subC = dl.sellClass === 'bond' ? dl.qty * (dl.sell.coupon || 0) * (dl.sell.freq || 0) : 0;
            coupAfter += (addC - subC);
        });
        return { before: before, after: after, coupBefore: coupBefore, coupAfter: coupAfter,
            proceeds: proceeds, spend: spend, rest: rest, fee: (proceeds + spend) * ft.fee, tax: tax, value: c.value };
    }
    function baMini(before, after) {
        function bar(a) { return '<div class="rbw-ba-mini"><i class="st" style="width:' + Math.round(a.stockPct) + '%"></i><i class="bd" style="width:' + Math.round(a.bondPct) + '%"></i></div>'
            + '<div class="rbw-ba-cap"><span>Акции ' + Math.round(a.stockPct) + '</span><span>Обл. ' + Math.round(a.bondPct) + '</span></div>'; }
        return '<div class="rbw-ba"><div class="rbw-ba-b"><em>сейчас</em>' + bar(before) + '</div><div class="rbw-ba-ar">→</div><div class="rbw-ba-a"><em>станет</em>' + bar(after) + '</div></div>';
    }
    function whatIfHtml() {
        var p = curPf(); if (!p) return '';
        var deals = effectiveDeals(); if (!deals.length) return '';
        var w = buildWhatIf(p, deals);
        var coupCard = (w.coupAfter > w.coupBefore + 0.5)
            ? '<div class="rbw-done-c"><em>Купоны · доход в год</em><div class="rbw-mmini"><div class="rbw-mm-big">+' + fmtRub(w.coupAfter - w.coupBefore) + '</div>'
                + '<div class="rbw-mm-t">' + fmtRub(w.coupBefore) + ' → <b>' + fmtRub(w.coupAfter) + '</b> в год</div></div></div>' : '';
        return '<div class="rbw-wi-back" onclick="rbwWhatIfClose()"></div>'
            + '<div class="rbw-wi"><div class="rbw-wi-h"><b>Что если применить?</b><span class="rbw-wi-x" onclick="rbwWhatIfClose()">✕</span></div>'
            + '<p class="rbw-wi-sub">Предпросмотр эффекта — портфель <b>не меняется</b>, ничего не выставляется.</p>'
            + '<div class="rbw-wi-cards"><div class="rbw-done-c"><em>Доли по классам</em>' + baMini(w.before, w.after) + '</div>' + coupCard + '</div>'
            + '<div class="rbw-wi-tot">'
            + '<span><em>Оборот</em><b>' + fmtRub(w.proceeds + w.spend) + '</b></span>'
            + '<span><em>Остаток</em><b>' + fmtRub(w.rest) + '</b></span>'
            + '<span><em>Комиссия</em><b>≈ ' + fmtRub(w.fee) + '</b></span>'
            + (w.tax > 0.5 ? '<span><em>Налог</em><b>≈ ' + fmtRub(w.tax) + '</b></span>' : '')
            + '</div>'
            + '<div class="rbw-wi-foot"><button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwWhatIfClose()">Закрыть</button>'
            + '<button type="button" class="rbw-btn rbw-btn-dark" onclick="rbwWhatIfClose();rbwGoStep(4)">К заявке →</button></div></div>';
    }
    function stepBasket() {
        var p = curPf(); if (!p) { rbw.step = 1; return stepPortfolio(); }
        var deals = effectiveDeals();
        if (!deals.length) { rbw.step = 3; return stepCalc(); }
        var ft = feeTax(), proceeds = 0, spend = 0, rest = 0, tax = 0, nLegs = 0;
        deals.forEach(function (dl) { proceeds += dl.proceeds; spend += dl.buyQty * dl.buy.unit; rest += dl.rest; tax += saleTax(dl.sell, dl.qty); nLegs += 2; });
        var fee = (proceeds + spend) * ft.fee;
        var broker = !!p.broker, canTr = broker && brokerCanTrade(), cash = p.cash || 0;
        var bar = '<div class="rbw-bskt-bar"><div class="rbw-bb-t">Собрано <b>' + nLegs + ' ' + plur(nLegs, 'заявка', 'заявки', 'заявок') + '</b>' + (deals.length > 1 ? ' · ' + deals.length + ' ' + plur(deals.length, 'обмен', 'обмена', 'обменов') : '') + '</div>'
            + '<div class="rbw-bb-link">' + IC.term + ' ' + (broker ? (canTr ? 'уйдёт брокеру Т-Инвестиций' : 'подготовим тикеты в терминале') : 'применится к портфелю') + '</div></div>';
        var chips = '';
        if (rbw.cart.length) {
            chips = '<div class="rbw-cart-chips">' + rbw.cart.map(function (dl, i) {
                return '<span class="rbw-cchip">' + esc(dealName(dl.sell)) + ' → ' + esc(dealName(dl.buy)) + '<b onclick="rbwCartDel(' + i + ')" title="убрать">✕</b></span>';
            }).join('') + (deals.length > rbw.cart.length ? '<span class="rbw-cchip cur">＋ текущий: ' + esc(dealName(deals[deals.length - 1].sell)) + ' → ' + esc(dealName(deals[deals.length - 1].buy)) + '</span>' : '') + '</div>';
        }
        var legs = '<div class="rbw-legs">' + deals.map(function (dl) {
            return legHtml('sell', dl.sellClass, dl.sell, dl.qty, dl.sell.unit, 'освободится', '+' + fmtRub(dl.proceeds), rbw.ord.sell)
                + legHtml('buy', dl.buyClass, dl.buy, dl.buyQty, dl.buy.unit, 'спишется', '−' + fmtRub(dl.buyQty * dl.buy.unit), rbw.ord.buy);
        }).join('') + '</div>';
        var aa = allocAfterCart(p, deals);
        var sum = '<div class="rbw-bsum">'
            + '<div class="rbw-bs-i"><em>Свободно сейчас</em><b>' + fmtRub(cash) + '</b></div><div class="rbw-bs-sep"></div>'
            + '<div class="rbw-bs-i"><em>Остаток обмена</em><b class="' + (rest >= 0 ? 'up' : 'dn') + '">' + (rest >= 0 ? '+' : '') + fmtRub(rest) + '</b></div><div class="rbw-bs-sep"></div>'
            + '<div class="rbw-bs-i"><em>Комиссия</em><b>≈ ' + fmtRub(fee) + '</b></div>'
            + (tax > 0.5 ? '<div class="rbw-bs-sep"></div><div class="rbw-bs-i"><em>Налог (НДФЛ)</em><b>≈ ' + fmtRub(tax) + '</b></div>' : '')
            + '<div class="rbw-bs-sep"></div><div class="rbw-bs-i"><em>Доли станут</em><b>' + Math.round(aa.stockPct) + ' / ' + Math.round(aa.bondPct) + '</b></div></div>';
        // предупреждения: нехватка средств → очередь T+1; лимитки
        var warns = '';
        if (broker && canTr && cash < spend - 0.5) {
            warns += '<div class="rbw-nwarn">' + IC.warn + '<span>Свободно <b>' + fmtRub(cash) + '</b> — на всю покупку не хватает. Сначала исполнится <b>продажа</b>, деньги освободятся (по ОФЗ расчёты <b>T+1</b>), покупка встанет в очередь и уйдёт следом.</span></div>';
        }
        if (rbw.ord.buy === 'limit' || rbw.ord.sell === 'limit') {
            warns += '<div class="rbw-ninfo">' + IC.info + '<span><b>Лимит</b> — сделка пройдёт по указанной цене (или лучше), но может подождать, пока рынок до неё дойдёт. <b>Рыночная</b> — сразу по текущей цене (может чуть отличаться от показанной).</span></div>';
        }
        var note = !broker
            ? '<div class="rbw-ninfo">' + IC.info + '<span>Обмен' + (deals.length > 1 ? 'ы' : '') + ' <b>применится к портфелю сразу</b> и попадёт в историю сделок — можно отменить. Реальные заявки брокеру идут только у портфелей, подключённых к счёту.</span></div>'
            : (canTr
                ? '<div class="rbw-nwarn">' + IC.warn + '<span>Это <b>зеркало брокерского счёта</b>. По кнопке уйдут <b>реальные заявки</b> брокеру Т-Инвестиций (' + nLegs + ' шт). Спросим подтверждение. Состав обновится синком.</span></div>'
                : '<div class="rbw-ninfo">' + IC.info + '<span>Это <b>зеркало брокерского счёта</b>, а торгующее подключение не активно. Мастер подготовит тикеты в терминале Т-Инвестиций — там один тап на отправку.</span></div>');
        var body = '<div class="rbw-bskt">' + bar + chips + legs + sum + warns + note + '</div>';
        var back = '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwGoStep(3)">← Назад · расчёт</button>'
            + '<button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwWhatIf()">👁 Что если</button>';
        var primaryLabel = rbw.executing ? 'Отправляем…' : (broker ? (canTr ? 'Выставить заявки брокеру <i>→</i>' : 'Открыть в терминале <i>→</i>') : 'Применить ' + (deals.length > 1 ? deals.length + ' ' + plur(deals.length, 'обмен', 'обмена', 'обменов') : 'обмен') + ' <i>→</i>');
        var hint = broker ? (canTr ? 'Реальные сделки — с подтверждением' : 'Заявки не отправятся сами') : 'Применится к портфелю с записью в историю';
        var foot = footHtml(back, hint, { label: primaryLabel, onclick: 'rbwExecute()' }, rbw.executing);
        return mainHtml('Шаг 4 из 4', broker ? (canTr ? 'Заявки готовы к отправке брокеру' : 'Заявки готовы для терминала') : (deals.length > 1 ? deals.length + ' обмена готовы к применению' : 'Обмен готов к применению'),
            'Продажа и покупка собраны в корзину. ' + (broker ? (canTr ? 'Уйдут брокеру по кнопке, не покидая мастер.' : 'Подготовим тикеты в терминале.') : 'Примените — портфель выровняется, записи лягут в историю.'), body, foot);
    }
    function legHtml(side, cls, x, qty, unit, sumLbl, sumVal, ordType) {
        var name = cls === 'bond' ? x.name : x.ticker;
        var sub = cls === 'bond' ? ((x.det && x.det.matDate ? 'погашение ' + String(x.det.matDate).slice(0, 4) + ' · ' : '') + qty + ' шт') : ((x.name && x.name !== x.ticker ? esc(x.name) + ' · ' : '') + qty + ' шт');
        var own = '';
        var nkdStr = (cls === 'bond' && x.nkd) ? ' · +' + gl('НКД', TIP.nkd) + ' ' + f2(x.nkd) : '';
        var px = ordType === 'market' ? 'сейчас ≈ <b>' + f2(x.price) + ' ₽</b>' + nkdStr : 'по цене <b>' + f2(x.price) + ' ₽</b>' + nkdStr;
        return '<div class="rbw-oleg"><div class="rbw-lg-side ' + side + '">' + (side === 'sell' ? 'Продать' : 'Купить') + '</div>'
            + '<div class="rbw-lg-nm"><b>' + esc(name) + own + '</b><em>' + sub + '</em></div>'
            + '<div class="rbw-lg-ord"><div class="rbw-lg-seg"><span class="' + (ordType === 'market' ? 'on' : '') + '" title="Сразу по текущей цене" onclick="rbwOrd(\'' + side + '\',\'market\')">Рыночная</span><span class="' + (ordType === 'limit' ? 'on' : '') + '" title="По указанной цене; может подождать" onclick="rbwOrd(\'' + side + '\',\'limit\')">Лимит</span></div>'
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
                + '<div class="rbw-rl-v">' + l.val + '<s>' + esc(l.note) + (l.orderId && l.st === 'part' ? ' · <a class="rbw-rl-cancel" onclick="rbwCancelOrder(\'' + esc(l.orderId) + '\')">отменить</a>' : '') + '</s></div></div>';
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
            cards += '<div class="rbw-done-c"><em>Купоны · доход в год</em>'
                + '<div class="rbw-mmini"><div class="rbw-mm-big">+' + fmtRub(r.coup.delta) + '</div>'
                + '<div class="rbw-mm-t">в год. Купонный доход <b>' + fmtRub(r.coup.beforeRub) + '</b> → <b>' + fmtRub(r.coup.afterRub) + '</b> — та же сумма вложений работает сильнее.</div></div></div>';
        }
        if (r && r.forecast) {
            var fc = r.forecast;
            cards += '<div class="rbw-done-c"><em>Прогноз на год</em>'
                + '<div class="rbw-mm-t">Купонами портфель принесёт ≈ <b>' + fmtRub(fc.coupYear) + '</b> в год — это <b>' + d1(fc.yieldPct) + '%</b> на ' + fmtRub(fc.value) + '.'
                + (fc.marketOfz != null ? ' Для сравнения, рынок ОФЗ сейчас в среднем ≈ <b>' + d1(fc.marketOfz) + '%</b>.' : '')
                + '</div></div>';
        }
        if (!cards) cards = '<div class="rbw-done-c"><em>Портфель</em><div class="rbw-mm-t">Стоимость ' + fmtRub(c.value) + ' · ' + (p.holdings || []).length + ' позиций. Записано в историю сделок.</div></div>';
        var reviewLine = (r && r.nextReview) ? '<div class="rbw-review">' + IC.bell + '<span>Следующая годовая сверка — <b>' + fmtDate(r.nextReview) + '</b>. Напомним звоночком, когда подойдёт срок.</span></div>' : '';
        var body = hero + '<div class="rbw-done-cards">' + cards + '</div>' + reviewLine
            + '<div class="rbw-done-next"><button type="button" class="rbw-btn rbw-btn-ghost" onclick="rbwRestart()">Ещё ребаланс</button>'
            + '<button type="button" class="rbw-btn rbw-btn-dark" style="margin-left:0" onclick="rbwToPortfolio()">В портфель →</button></div>';
        return mainHtml('Готово', 'Ребаланс завершён', '', body, '');
    }

    /* ═══════════ ГЛАВНЫЙ РЕНДЕР ═══════════ */
    var rbwLastKey = null;
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
        // плавное появление контента ТОЛЬКО при смене шага/режима (не на каждый ре-рендер пикера/кол-ва)
        var key = String(rbw.step) + '|' + String(rbw.mode) + '|' + String(rbw.cls);
        if (key !== rbwLastKey) { main = main.replace('class="rbw-main"', 'class="rbw-main rbw-anim"'); rbwLastKey = key; }
        var overlay = (rbw.whatIf && (rbw.step === 3 || rbw.step === 4)) ? whatIfHtml() : '';
        return '<div class="rbw" id="rbwBar" onclick="rbwClosePicker()">' + railHtml() + main + overlay + '</div>';
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

    /* дорисовка после рендера: Esc, фокус в пикер, разовое напоминание о сверке */
    var escBound = false, reviewScanned = false;
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
        // пикер открыт → фокус в поиск + применить фильтр (переживает ре-рендер)
        if (rbw.picker) {
            var inp = document.querySelector('.rbw-pop-inp');
            if (inp && document.activeElement !== inp) { try { inp.focus(); var v = inp.value; inp.value = ''; inp.value = v; } catch (e) {} }
            if (rbw.pickerQ) applyPickerFilter(rbw.pickerQ);
            highlightFirst();
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

    /* фильтр/клавиатура пикера — работают по DOM, без ре-рендера (не сбивают фокус) */
    function applyPickerFilter(q) {
        q = String(q || '').trim().toLowerCase();
        var rows = document.querySelectorAll('.rbw-pop .rbw-pop-row');
        Array.prototype.forEach.call(rows, function (r) {
            var nm = r.getAttribute('data-nm') || '';
            r.style.display = (!q || nm.indexOf(q) >= 0) ? '' : 'none';
        });
    }
    function visibleRows() { return Array.prototype.filter.call(document.querySelectorAll('.rbw-pop .rbw-pop-row'), function (r) { return r.style.display !== 'none'; }); }
    function highlightFirst() {
        Array.prototype.forEach.call(document.querySelectorAll('.rbw-pop .rbw-pop-row'), function (r) { r.classList.remove('hi'); });
        var vr = visibleRows(); if (vr[0]) vr[0].classList.add('hi');
    }
    window.rbwPickerFilter = function (q) { rbw.pickerQ = q; applyPickerFilter(q); highlightFirst(); };
    window.rbwPickerKey = function (e) {
        var vr = visibleRows(); if (!vr.length) { if (e.key === 'Escape') { rbw.picker = null; rerender(); } return; }
        var cur = vr.findIndex ? vr.findIndex(function (r) { return r.classList.contains('hi'); }) : (function () { for (var i = 0; i < vr.length; i++) if (vr[i].classList.contains('hi')) return i; return -1; })();
        if (e.key === 'ArrowDown') { e.preventDefault(); var n = Math.min(vr.length - 1, cur + 1); vr.forEach(function (r, i) { r.classList.toggle('hi', i === n); }); vr[n].scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); var m = Math.max(0, cur - 1); vr.forEach(function (r, i) { r.classList.toggle('hi', i === m); }); vr[m].scrollIntoView({ block: 'nearest' }); }
        else if (e.key === 'Enter') { e.preventDefault(); (vr[cur] || vr[0]).click(); }
        else if (e.key === 'Escape') { e.preventDefault(); rbw.picker = null; rerender(); }
    };
    window.rbwSetThr = function (delta) {
        var p = curPf(); if (!p) return;
        p.driftThreshold = clamp(driftThr(p) + delta, 0, 20);
        if (PF.saveStore) PF.saveStore();
        rerender();
    };
    window.rbwSetQty = function (v) { var ctx = dealCtx(); if (!ctx || !ctx.sell) return; rbw.pick.qty = clamp(Math.round(+v), 1, ctx.sell.qty); rerender(); };
    window.rbwQtyStep = function (delta) { var ctx = dealCtx(); if (!ctx || !ctx.deal) return; window.rbwSetQty((ctx.deal.qty || 1) + delta); };

    /* ═══════════ ДЕЙСТВИЯ ═══════════ */
    window.rbwExit = function () { if (window.pfxGoTab) window.pfxGoTab('overview'); };
    window.rbwPickPf = function (pid) { if (pid !== rbw.pid) rbw.cart = []; rbw.pid = pid; persist(); rerender(); };
    window.rbwGoStep = function (n) {
        if (n === 2 && !curPf()) return;
        if (n >= 3 && !rbw.mode) { rbw.step = 2; rerender(); return; }
        if (n < rbw.step && n <= 2) { resetPicks(); rbw.cart = []; }
        rbw.step = n; rbw.picker = null; rbw.whatIf = false; rerender();
    };
    window.rbwSetMode = function (m) { if (m !== rbw.mode) rbw.cart = []; rbw.mode = m; resetPicks(); if (m === 'moment') { var p = curPf(); if (p) { var c = PF.calcPf(p); rbw.cls = c.bondVal > 0 ? 'bond' : 'stock'; } } rerender(); };
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
        var deals = effectiveDeals(); if (!deals.length) { toast('Нечего исполнять'); return; }
        if (p.broker) { return execBroker(p, deals); }
        return execPaper(p, deals);
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
    function logTrade(p, t) { t.id = genId('t'); t.ts = Date.now(); t.fee = feeTax().fee; p.trades = p.trades || []; p.trades.unshift(t); if (p.trades.length > 120) p.trades.length = 120; }

    function execPaper(p, deals) {
        var before = { bondPct: PF.calcPf(p).bondPct, stockPct: PF.calcPf(p).stockPct };
        var coupBefore0 = heldBonds(p).reduce(function (s, x) { return s + x.coupYear; }, 0);
        var legsR = [], totProceeds = 0, totSpend = 0, totTax = 0, applied = 0;
        deals.forEach(function (dl) {
            var sellH = (p.holdings || []).filter(function (h) { return h.id === dl.sell.id; })[0];
            if (!sellH) return;
            var avail = (PF.ensureLots ? PF.ensureLots(sellH) : (sellH.lots || [])).reduce(function (s, l) { return s + (+l.qty || 0); }, 0);
            var qty = Math.min(dl.qty, avail); if (!(qty > 0)) return;
            var sellIdx = (p.holdings || []).indexOf(sellH);
            var soldSnap = JSON.parse(JSON.stringify(sellH));
            reduceHolding(p, sellH, qty);
            var buyO = dl.buyClass === 'bond'
                ? { type: 'bond', ticker: isinKey(dl.buy.isin), name: dl.buy.name, price: dl.buy.price, nkd: dl.buy.nkd, qty: dl.buyQty }
                : { type: 'stock', ticker: dl.buy.ticker, name: dl.buy.name, price: dl.buy.price, qty: dl.buyQty, pot: dl.buy.pot };
            var bought = addBought(p, buyO);
            logTrade(p, {
                kind: dl.sellClass === 'bond' ? 'bond' : 'stock',
                sellTicker: dl.sellClass === 'bond' ? isinKey(dl.sell.isin) : dl.sell.ticker, sellName: dl.sell.name, sellQty: qty,
                buyTicker: buyO.ticker, buyName: dl.buy.name, buyQty: dl.buyQty, proceeds: dl.proceeds, rest: dl.rest,
                potFrom: dl.potDelta != null ? null : null,
                undo: { sold: soldSnap, soldIdx: sellIdx, buyHid: bought.hid, buyLotId: bought.lotId }
            });
            if (dl.rest > 0.005) p.cash = (p.cash || 0) + dl.rest;
            totProceeds += dl.proceeds; totSpend += dl.buyQty * dl.buy.unit; totTax += saleTax(dl.sell, qty); applied++;
            legsR.push({ st: 'done', side: 'sell', qty: qty, name: dl.sell.name, sub: 'средняя ' + f2(dl.sell.price) + ' ₽', val: '+' + fmtRub(dl.proceeds), note: qty + ' из ' + qty });
            legsR.push({ st: 'done', side: 'buy', qty: dl.buyQty, name: dl.buy.name, sub: (dl.buyClass === 'bond' ? 'цена ' + f2(dl.buy.price) + ' ₽ +НКД' : 'цена ' + f2(dl.buy.price) + ' ₽'), val: '−' + fmtRub(dl.buyQty * dl.buy.unit), note: dl.buyQty + ' из ' + dl.buyQty });
        });
        if (!applied) { toast('Обмен не применился — бумаги уже нет в портфеле'); return; }
        PF.saveStore(); if (PF.pfInvalidateCharts) PF.pfInvalidateCharts(p.id);
        if (PF.ensureQuotes) try { PF.ensureQuotes(true); } catch (e) {}
        setNextReview(p);
        var after = { bondPct: PF.calcPf(p).bondPct, stockPct: PF.calcPf(p).stockPct };
        var coupAfter0 = heldBonds(p).reduce(function (s, x) { return s + x.coupYear; }, 0);
        var ft = feeTax(), multi = applied > 1;
        rbw.receipt = {
            title: multi ? applied + ' ' + plur(applied, 'обмен применён', 'обмена применены', 'обменов применены') : 'Обмен применён',
            sub: 'Продажа и покупка записаны в портфель',
            legs: legsR,
            tot: [['Комиссия', '≈ ' + fmtRub((totProceeds + totSpend) * ft.fee)]]
                .concat(totTax > 0.5 ? [['Налог', '≈ ' + fmtRub(totTax)]] : [])
                .concat([['Свободно', fmtRub(p.cash || 0)], ['Доли', Math.round(after.stockPct) + ' / ' + Math.round(after.bondPct)]]),
            foot: 'Записано в историю сделок портфеля — можно отменить оттуда. Следующая годовая сверка — ' + fmtDate(p.nextReview) + '.',
            alloc: { before: before, after: after },
            coup: (coupAfter0 > coupBefore0 + 0.5) ? { beforeRub: coupBefore0, afterRub: coupAfter0, delta: coupAfter0 - coupBefore0 } : null,
            forecast: buildForecast(p),
            nextReview: p.nextReview,
            doneText: 'Портфель обновлён — доли и купоны пересчитаны.'
        };
        if (window.msNotify && window.msNotify.local) window.msNotify.local('success', multi ? 'Ребаланс: ' + applied + ' обмена' : 'Ребаланс применён', (deals[0] ? dealName(deals[0].sell) + ' → ' + dealName(deals[0].buy) : '') + ' · ' + fmtRub(totProceeds));
        rbw.cart = []; rbw.step = 'receipt'; rerender();
    }

    function brokerCanTrade() { var A = window.brokerApi; return !!(A && A.canTrade && A.canTrade()); }
    function brokerLegTicker(cls, side, x) {
        if (cls === 'bond') return (side === 'buy' && x.t) ? x.t : ((PF.fullBondId && PF.fullBondId(x.isin)) || x.isin);
        return x.ticker;
    }
    function execBroker(p, deals) {
        var legs = [];
        deals.forEach(function (dl) {
            legs.push({ ticker: brokerLegTicker(dl.sellClass, 'sell', dl.sell), side: 'sell', qty: dl.qty, orderType: rbw.ord.sell, price: dl.sell.price, nm: dealName(dl.sell) });
            legs.push({ ticker: brokerLegTicker(dl.buyClass, 'buy', dl.buy), side: 'buy', qty: dl.buyQty, orderType: rbw.ord.buy, price: dl.buy.price, nm: dealName(dl.buy) });
        });
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
                buildBrokerReceipt(p, results);
                var okN = results.filter(function (r) { return r.ok; }).length;
                if (window.msNotify && window.msNotify.local) window.msNotify.local(okN ? 'success' : 'warn', 'Заявки ребаланса', okN + ' из ' + results.length + ' отправлено брокеру Т-Инвестиций');
                rbw.cart = []; rbw.step = 'receipt'; rerender();
                pollBrokerOrders(p);   // №6: уточнить статусы (частично/в очереди/отменено)
            }, function (e) {
                rbw.executing = false; rerender();
                toast((e && e.message) || 'Не удалось выставить заявки', true);
            });
        };
        var n = legs.length;
        if (window.pfConfirm) window.pfConfirm('Выставить ' + n + ' ' + plur(n, 'заявку', 'заявки', 'заявок') + ' брокеру Т-Инвестиций? Это реальные сделки на вашем счёте.', fire);
        else if (!window.confirm || window.confirm('Выставить реальные заявки брокеру?')) fire();
    }
    function brokerStatusOf(r) {
        if (!r.ok) return { st: 'rej', note: r.error || 'отклонено' };
        var resp = r.resp || {}, req = +resp.lotsRequested || r.lots, exe = +resp.lotsExecuted || 0;
        var rej = /REJECT/i.test(resp.executionReportStatus || '');
        var st = rej ? 'rej' : (exe >= req && req > 0 ? 'done' : 'part');
        var reqSh = req * r.lot, exeSh = exe * r.lot;
        return { st: st, note: rej ? (r.error || 'отклонено') : (st === 'done' ? reqSh + ' из ' + reqSh + ' шт' : exeSh + ' из ' + reqSh + ' шт · в очереди') };
    }
    function buildBrokerReceipt(p, results) {
        var acc = (window.brokerApi && window.brokerApi.getConn && window.brokerApi.getConn()) || {};
        var legsR = results.map(function (r) {
            var s = brokerStatusOf(r), isSell = r.leg.side === 'sell';
            return { st: s.st, side: r.leg.side, qty: r.leg.qty, name: r.leg.nm || r.leg.ticker, lot: r.lot || 1,
                sub: (isSell ? 'продажа' : 'покупка') + (r.ok ? ' · ' + r.lots + ' лот' : ''), val: '', note: s.note,
                orderId: (r.resp && r.resp.orderId) || null };
        });
        var anyOk = results.some(function (r) { return r.ok; });
        var anyOpen = legsR.some(function (l) { return l.orderId && l.st === 'part'; });
        rbw.receipt = {
            broker: true, accountId: acc.accountId,
            title: anyOk ? 'Заявки приняты' : 'Заявки не прошли',
            sub: anyOk ? 'Отправлены брокеру Т-Инвестиций; статус обновляется автоматически' : 'Проверьте подключение брокера и попробуйте снова',
            legs: legsR,
            tot: [['Счёт', 'Т-Инвестиции'], ['Статус', anyOk ? (anyOpen ? 'в исполнении' : 'у брокера') : 'ошибка']],
            foot: 'Зеркало брокерского счёта — «бумажная» запись не создаётся. Состав обновится синком, а о закрытии заявок придёт звоночек сайта.',
            alloc: null, coup: null, forecast: buildForecast(p),
            doneText: 'Заявки ушли брокеру — состав портфеля обновится, как счёт синхронизируется.'
        };
    }
    // №6: поллинг статуса выставленных заявок (GetOrderState) — уточняет «частично/в очереди/отменено»
    function pollBrokerOrders(p) {
        var r = rbw.receipt; if (!r || !r.broker || !r.accountId) return;
        var open = r.legs.filter(function (l) { return l.orderId && l.st === 'part'; });
        if (!open.length || !(window.brokerApi && window.brokerApi.call)) return;
        setTimeout(function () {
            if (rbw.receipt !== r) return;   // пользователь ушёл с квитанции
            Promise.all(open.map(function (l) {
                return window.brokerApi.call('GetOrderState', { accountId: r.accountId, orderId: l.orderId }).then(function (st) {
                    var req = +st.lotsRequested || 0, exe = +st.lotsExecuted || 0, rej = /REJECT|CANCEL/i.test(st.executionReportStatus || '');
                    l.st = rej ? 'rej' : (req > 0 && exe >= req ? 'done' : 'part');
                    l.note = rej ? 'отменена' : (l.st === 'done' ? (exe * (l.lot || 1)) + ' шт · исполнено' : exe + ' из ' + req + ' лот · в очереди');
                }, function () {});
            })).then(function () { if (rbw.receipt === r && rbw.step === 'receipt') rerender(); });
        }, 3500);
    }
    window.rbwCancelOrder = function (orderId) {
        var r = rbw.receipt; if (!r || !orderId || !r.accountId || !(window.brokerApi && window.brokerApi.call)) return;
        window.brokerApi.call('CancelOrder', { accountId: r.accountId, orderId: orderId }).then(function () {
            var l = r.legs.filter(function (x) { return x.orderId === orderId; })[0];
            if (l) { l.st = 'rej'; l.note = 'отменена'; }
            toast('Заявка отменена'); rerender();
        }, function (e) { toast((e && e.message) || 'Не удалось отменить заявку', true); });
    };

    window.rbwGoDone = function () { rbw.step = 'done'; rerender(); };
    window.rbwRestart = function () { rbw.step = 1; rbw.mode = null; rbw.cart = []; resetPicks(); rbw.receipt = null; rerender(); };
    window.rbwToPortfolio = function () { rbw.step = 1; rbw.cart = []; rbw.receipt = null; if (window.pfxGoTab) window.pfxGoTab('overview'); };

    /* мультизаявка: корзина обменов */
    window.rbwCartAdd = function () {
        var dr = curDraft(); if (!dr) { toast('Нет готового обмена для добавления'); return; }
        if (rbw.cart.some(function (x) { return sameDeal(x, dr); })) { toast('Такой обмен уже в корзине'); return; }
        rbw.cart.push(dr); resetPicks(); toast('В корзине обменов: ' + rbw.cart.length); rerender();
    };
    window.rbwToBasket = function () { if (!effectiveDeals().length) { toast('Сначала соберите обмен'); return; } rbw.step = 4; rbw.picker = null; rbw.whatIf = false; rerender(); };
    window.rbwCartDel = function (i) { rbw.cart.splice(i, 1); rerender(); };
    window.rbwWhatIf = function () { if (!effectiveDeals().length) { toast('Сначала соберите обмен'); return; } rbw.whatIf = true; rbw.picker = null; rerender(); };
    window.rbwWhatIfClose = function () { rbw.whatIf = false; rerender(); };
    window.rbwQtyLive = function (v) { var el = document.querySelector('.rbw-qty-v'); if (el) el.textContent = fmtQty(+v) + ' шт'; };

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
