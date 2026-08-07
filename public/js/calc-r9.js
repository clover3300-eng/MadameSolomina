// ===== R9 · «ПОЛКИ» — рабочая площадь вкладки «Расчёт» =====
// Реализация утверждённого мокапа dev/mockups/calc3-mockups.src.html, вариант Б
// (сцены Б.1 рост · Б.2 доход · Б.3 подбор · Б.4 развилка).
//
// ПРИНЦИП СЛОЯ. Вся видимая разметка строится ЗДЕСЬ и классами .c9-* — ровно
// теми, что в мокапе (оформление приходит из calc-r9.css, сгенерированного из
// мокапа скриптом). Старый слой r5/r6/r7 остаётся в DOM ДВИЖКОМ: он считает
// (simIncome/simGrowth в calc-r6.js, водопад стратегий в calculator-ui.js,
// корзина mi5 в data.js), а его вёрстка гасится в calc-r9-mount.css. Так
// «1в1» получается без борьбы с чужими стилями: чужого на экране нет.
//
// Обмен с движком — только через функции, которые он уже экспортирует:
//   window.cxSim         — {income, growth, split, bondsPct, stratName, sum,
//                           tax, years, setYears, EQ_PREM, FALLBACK_R}
//   ndSelectFee/ndApplyStrategy/ndOpenCustom  — комиссия и стратегии
//   changeQty/distributeMonthlyInvestment/setCustomTax — корзина ОФЗ и налог
//   calculateAndShowPortfolio / #miCreatePfBtn.click() — главные действия
//
// Три отступления от мокапа названы владельцу: (1) поле суммы — настоящий
// input в геометрии мокапа; (2) графики тянутся по высоте полки (мокап —
// фиксированная сцена 1600×900); (3) «Своя» стратегия открывает штатную
// панель слайдера (её в мокапе нет).

(function () {
  'use strict';

  /* ── иконки: 1в1 из мокапа ──────────────────────────────────────────────── */
  var IC = {
    cases: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.6"/><path d="M9 7.5V5.6A2.1 2.1 0 0 1 11.1 3.5h1.8A2.1 2.1 0 0 1 15 5.6v1.9"/>',
    pie:   '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4V12h8.6"/>',
    chev:  '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
    arr:   '<path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5"/>',
    ok:    '<path d="M20 6.5L9.2 17.4 4 12.2"/>',
    pen:   '<path d="M12 20h8"/><path d="M16.4 4.1a2.1 2.1 0 0 1 3 3L7.4 19.1 3.6 20l.9-3.8z"/>'
  };
  function ic(d, cls) {
    return '<svg viewBox="0 0 24 24" width="14" height="14"' + (cls ? ' class="' + cls + '"' : '') + '>' + d + '</svg>';
  }

  /* ── мелочи ─────────────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function sp(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function pct1(v) { return (v * 100).toFixed(1).replace('.', ',') + '%'; }
  function capN(v) { return v >= 950000 ? (v / 1e6).toFixed(2) : sp(v); }
  function capU(v) { return v >= 950000 ? 'млн ₽' : '₽'; }
  function capBoth(v) { return capN(v) + (v >= 950000 ? ' млн' : ''); }
  function plural(n, one, few, many) {
    var d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return one;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
    return many;
  }
  function yrs(n) { return n + ' ' + plural(n, 'год', 'года', 'лет'); }
  var MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MON_UP = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
  var MON_LO = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  /* ── доступ к движку ────────────────────────────────────────────────────── */
  function SIM() { return window.cxSim || null; }
  function sumV() { var s = SIM(); return s ? s.sum() : 0; }
  function taxV() { var s = SIM(); return s ? s.tax() : 0.13; }
  function yearsV() { var s = SIM(); return s ? s.years() : 3; }
  function bondsV() { var s = SIM(); return s ? s.bondsPct() : 50; }
  function stratV() { var s = SIM(); return s ? s.stratName() : 'Гармония'; }
  function mode() {
    var b = document.body.classList;
    if (b.contains('cx9-quiz')) return 'quiz';
    return b.contains('cxm-mix') ? 'mix' : b.contains('cxm-monthly') ? 'monthly' : 'choose';
  }
  function feeText() {
    var t = $('feeSelectedText');
    var v = t ? t.textContent.trim() : '';
    return (!v || v === 'Выбрать') ? '—' : v.replace('.', ',');
  }
  function taxText() {
    var r = taxV();
    return r > 0 ? 'НДФЛ ' + Math.round(r * 100) + '%' : 'без налога';
  }

  /* Корзина ОФЗ движка: цена, НКД, количество, купон за год (после налога).
     Количество — источник правды в полях #input-<ticker> (их читает data.js),
     поэтому берём оттуда, а не из bondQtyMap. */
  function basketRows() {
    var out = [];
    try {
      if (typeof monthlyIncomeBonds === 'undefined' || !monthlyIncomeBonds) return out;
      var tax = taxV(), coup = {}, mons = {};
      if (typeof allScheduledPayments !== 'undefined' && allScheduledPayments) {
        allScheduledPayments.forEach(function (pay) {
          var t = pay.paymentTicker;
          if (!t) {
            var pb = monthlyIncomeBonds.find(function (b) { return b.n === pay.displayName; });
            if (pb) t = pb.t;
          }
          if (!t) return;
          var inp = $('input-' + t);
          var q = inp ? (parseInt(inp.value, 10) || 0) : 0;
          coup[t] = (coup[t] || 0) + (+pay.staticCouponVal || 0) * q * (1 - tax);
          var parts = String(pay.dateStr || '').split('.');
          var mn = parts.length >= 3 ? parseInt(parts[1], 10) - 1 : parseInt(parts[0], 10) - 1;
          if (mn >= 0 && mn < 12) {
            if (!mons[t]) mons[t] = [];
            if (mons[t].indexOf(mn) === -1) mons[t].push(mn);
          }
        });
      }
      monthlyIncomeBonds.forEach(function (b) {
        var inp = $('input-' + b.t);
        var q = inp ? (parseInt(inp.value, 10) || 0) : 0;
        var full = (+b.p || 0) + (+b.nkd || 0);
        var mm = (mons[b.t] || []).slice().sort(function (x, y) { return x - y; });
        out.push({
          t: b.t,
          n: String(b.n || '').replace(/^(ОФЗ)-/, '$1 '),
          // ОФЗ серии 26xxx: номинал 1000 ₽, поэтому цена в % номинала = p / 10
          price: (+b.p || 0) / 10,
          qty: q,
          inv: q * full,
          coupon: coup[b.t] || 0,
          yld: String(b.y == null ? '' : b.y).replace('%', '').replace('.', ','),
          months: mm
        });
      });
    } catch (e) {}
    return out;
  }

  /* Двенадцать месяцев вперёд: величина + выпуск, который платит в этом месяце.
     Начало окна — месяц ближайшей выплаты (в мокапе это сентябрь). */
  function monthsAhead(inc) {
    var rows = basketRows(), byMon = new Array(12).fill(0), tick = new Array(12).fill('');
    rows.forEach(function (r) {
      r.months.forEach(function (m) { tick[m] = r.t; });
    });
    if (inc && inc.byMonth) byMon = inc.byMonth.slice();
    var start = (inc && inc.nextMn >= 0) ? inc.nextMn : new Date().getMonth();
    var out = [];
    for (var i = 0; i < 12; i++) {
      var m = (start + i) % 12;
      out.push({ m: m, v: byMon[m] || 0, t: tick[m], near: i === 0 });
    }
    return out;
  }

  /* ── ГРАФИКИ: геометрия 1в1 из мокапа, данные — из движка ────────────────── */

  // «Как растёт капитал» — ось начинается ОТ ВЛОЖЕННОГО, а не от нуля.
  // С нулевой осью полоса «вложено» забирала 62% высоты, и рост оставался
  // лентой сверху (правка владельца 2026-08-07). Вложенное называет себя
  // подписью на базовой линии, высоту получает прибыль облигаций и акций.
  function growSVG(w, h, S, g) {
    var n = yearsV() + 1;
    var pts = [], i, sim = SIM();
    for (i = 0; i < n; i++) {
      var split = (sim && i > 0) ? sim.split(S, g, i) : { bond: 0, eq: 0 };
      pts.push({ t: S * Math.pow(1 + g.r, i), b: split.bond, e: split.eq });
    }
    var top = 20, bot = h - 26;
    var span = Math.max(1, (pts[n - 1].t - S) * 1.12);
    var X = function (k) { return 4 + k * (w - 8) / (n - 1); };
    var Y = function (v) { return bot - ((v - S) / span) * (bot - top); };
    var s = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" class="c9-pl">';
    s += '<g stroke="var(--line)" stroke-width="1" fill="none">';
    for (i = 0; i <= 3; i++) {
      var gy = top + i * (bot - top) / 3;
      s += '<path d="M0 ' + gy.toFixed(1) + 'H' + w + '"/>';
    }
    s += '</g>';
    function band(from, to, fill, op) {
      var d = 'M' + X(0) + ' ' + Y(from(0)).toFixed(1), k;
      for (k = 1; k < n; k++) d += 'L' + X(k).toFixed(1) + ' ' + Y(from(k)).toFixed(1);
      for (k = n - 1; k >= 0; k--) d += 'L' + X(k).toFixed(1) + ' ' + Y(to(k)).toFixed(1);
      return '<path d="' + d + 'Z" fill="' + fill + '" opacity="' + op + '"/>';
    }
    s += band(function (k) { return S + pts[k].b; }, function () { return S; }, 'var(--bond)', '.55');
    s += band(function (k) { return pts[k].t; }, function (k) { return S + pts[k].b; }, 'var(--eq)', '.6');
    var ln = 'M' + X(0) + ' ' + Y(pts[0].t).toFixed(1);
    for (i = 1; i < n; i++) ln += 'L' + X(i).toFixed(1) + ' ' + Y(pts[i].t).toFixed(1);
    s += '<path d="' + ln + '" fill="none" stroke="var(--eqtx)" stroke-width="2"/>';
    s += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(pts[n - 1].t).toFixed(1) + '" r="4.5" fill="var(--eqtx)"/>';
    // базовая линия называет вложенное — отдельной полосы под него больше нет
    s += '<path d="M0 ' + bot + 'H' + w + '" stroke="var(--cbase)" stroke-width="2" fill="none"/>';
    s += '<text x="0" y="' + (bot - 8) + '" font-family="var(--fN)" font-size="10.5" font-weight="700"' +
         ' fill="var(--dim)">вложено ' + capBoth(S) + '</text>';
    // подписи промежуточных лет: итог уже назван крупно
    s += '<g font-family="var(--fN)" font-size="11.5" font-weight="700" fill="var(--mut)" text-anchor="middle">';
    for (i = 1; i < n - 1; i++) {
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (Y(pts[i].t) - 11).toFixed(1) + '">' +
           capBoth(pts[i].t).replace(' млн', '') + '</text>';
    }
    s += '</g>';
    var y0 = new Date().getFullYear();
    s += '<g font-family="var(--fN)" font-size="10.5" font-weight="600" fill="var(--dim)">';
    for (i = 0; i < n; i++) {
      var a = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      s += '<text x="' + X(i).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="' + a + '">' + (y0 + i) + '</text>';
    }
    return s + '</g></svg>';
  }

  // Календарь купонов: 12 подписанных столбиков (месяц + выпуск)
  function barsSVG(w, h, list, plain) {
    var max = Math.max.apply(null, list.map(function (x) { return x.v; }).concat([1])) * 1.09;
    var top = 26, bot = h - (plain ? 22 : 34), step = w / 12, bw = Math.min(56, step - 18);
    var s = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" class="c9-pl">';
    s += '<path d="M0 ' + bot + 'H' + w + '" stroke="var(--line)" stroke-width="1" fill="none"/>';
    list.forEach(function (m, i) {
      var x = i * step + (step - bw) / 2, hh = (m.v / max) * (bot - top), y = bot - hh;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, hh).toFixed(1) +
           '" rx="5" fill="var(--eq)" opacity="' + (m.near ? '.95' : '.42') + '"/>';
      var cx = (x + bw / 2).toFixed(1);
      if (!plain) {
        s += '<text x="' + cx + '" y="' + (y - 8).toFixed(1) + '" text-anchor="middle" font-family="var(--fN)" font-size="10.5"' +
             ' font-weight="700" fill="' + (m.near ? 'var(--eqtx)' : 'var(--mut)') + '">' + sp(m.v) + '</text>';
      }
      s += '<text x="' + cx + '" y="' + (bot + 15) + '" text-anchor="middle" font-family="var(--fN)" font-size="10"' +
           ' font-weight="700" fill="var(--dim)">' + MON_UP[m.m] + '</text>';
      if (!plain && m.t) {
        s += '<text x="' + cx + '" y="' + (bot + 28) + '" text-anchor="middle" font-family="var(--fN)" font-size="9.5"' +
             ' font-weight="600" fill="var(--dim)" opacity=".8">' + esc(String(m.t).replace(/^SU|RMFS.*$/g, '')) + '</text>';
      }
    });
    return s + '</svg>';
  }

  /* ── ПОЛКА УСЛОВИЙ ──────────────────────────────────────────────────────── */
  function srcLine(what) {
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return '<div class="c9-src">' + what + '<br>MOEX · ' + p(d.getDate()) + '.' + p(d.getMonth() + 1) +
           ', ' + p(d.getHours()) + ':' + p(d.getMinutes()) + '</div>';
  }
  function sumField() {
    return '<div class="c9-fl c9-xl c9-inp" data-c9="sum"><em>Сумма инвестиций</em>' +
           '<div class="c9-v"><input class="c9-sumf c9-num" id="cx9Sum" type="text" inputmode="numeric" ' +
           'autocomplete="off" placeholder="0" aria-label="Сумма инвестиций"><i>₽</i></div></div>';
  }
  var FEES = [[0.0001, '0,01%'], [0.0003, '0,03%'], [0.0005, '0,05%'], [0.001, '0,1%'], [0.003, '0,3%'], [0.005, '0,5%']];
  var TAXES = [[0, 'без налога'], [0.13, 'НДФЛ 13%'], [0.15, 'НДФЛ 15%']];
  function feeDD() {
    var cur = feeText(), h = '<div class="c9-dd" id="cx9FeeDD">';
    FEES.forEach(function (f) {
      var on = f[1] === cur;
      h += '<div class="c9-r' + (on ? ' c9-on' : '') + '" data-c9act="fee" data-v="' + f[0] + '" data-l="' + f[1] + '">' + f[1] +
           (on ? '<span class="c9-ck">' + ic(IC.ok) + '</span>' : '') + '</div>';
    });
    return h + '<div class="c9-r c9-cu" data-c9act="feecustom">Своя<span>' + ic(IC.pen) + '</span></div></div>';
  }
  function taxDD() {
    var cur = taxText(), h = '<div class="c9-dd" id="cx9TaxDD">';
    TAXES.forEach(function (t) {
      var on = t[1] === cur;
      h += '<div class="c9-r' + (on ? ' c9-on' : '') + '" data-c9act="tax" data-v="' + t[0] + '">' + t[1] +
           (on ? '<span class="c9-ck">' + ic(IC.ok) + '</span>' : '') + '</div>';
    });
    return h + '</div>';
  }
  function condMix() {
    return '<div class="c9-sh c9-cond">' + sumField() +
      '<div class="c9-vd" style="height:44px"></div>' +
      '<div class="c9-fl"><em>Срок</em><div class="c9-v">' + yrs(yearsV()) +
        '<span class="c9-stp"><i data-c9act="yr" data-v="-1">−</i><i data-c9act="yr" data-v="1">+</i></span></div></div>' +
      '<div class="c9-fl" style="position:relative"><em>Комиссия брокера</em>' +
        '<div class="c9-v" data-c9act="feedd">' + feeText() + ' ' + ic(IC.chev) + '</div></div>' +
      '<div class="c9-fl" style="position:relative"><em>Налог</em>' +
        '<div class="c9-v" data-c9act="taxdd">' + taxText() + ' ' + ic(IC.chev) + '</div></div>' +
      srcLine('цены акций и облигаций') + '</div>';
  }
  function condMon() {
    var cur = taxText(), seg = '';
    TAXES.forEach(function (t) {
      seg += '<b class="' + (t[1] === cur ? 'c9-on' : '') + '" data-c9act="tax" data-v="' + t[0] + '">' +
             (t[0] === 0 ? 'Без налога' : t[1]) + '</b>';
    });
    var n = basketRows().length || 6;
    return '<div class="c9-sh c9-cond">' + sumField() +
      '<div class="c9-vd" style="height:44px"></div>' +
      '<div class="c9-fl"><em>Налог</em><div class="c9-seg">' + seg + '</div></div>' +
      '<div class="c9-fl"><em>Выпусков в корзине</em><div class="c9-v">' + n + '</div></div>' +
      srcLine('цены и НКД') + '</div>';
  }

  /* ── ПОЛКА ВЫБОРА: шесть стратегий плитками ─────────────────────────────── */
  function strategies() {
    var list = [], sim = SIM();
    var g = sim ? sim.growth(sumV() || 1000000, lastInc) : null;
    var rB = g ? g.rB : 0.145, prem = sim ? sim.EQ_PREM : 0.03;
    var saved = null;
    try { if (typeof savedCustomBonds !== 'undefined' && savedCustomBonds !== null) saved = +savedCustomBonds; } catch (e) {}
    var src = (typeof ND_STRATEGIES !== 'undefined') ? ND_STRATEGIES : [];
    var cur = stratV();
    src.forEach(function (s) {
      var custom = s.bonds === -1;
      var bonds = custom ? saved : s.bonds;
      var title = (custom && saved !== null) ? 'Индивидуальная' : s.title;
      var sub = (custom && saved !== null) ? 'Ваша настройка' : s.subtitle;
      var b = (bonds == null ? 50 : bonds) / 100;
      list.push({
        title: title, sub: sub, bonds: bonds, custom: custom,
        yield: pct1(b * rB + (1 - b) * (rB + prem)),
        on: title === cur
      });
    });
    return list;
  }
  function pickShelf() {
    var qn = 0;
    try { if (typeof VG_Q !== 'undefined' && VG_Q) qn = VG_Q.length; } catch (e) {}
    var h = '<div class="c9-sh c9-pick"><div class="c9-pick-hd">' +
      '<span class="c9-lb">Стратегия · доля акций задаёт риск</span>' +
      '<span class="c9-qt" data-c9act="quiz">Не знаете, какую взять? Тест — ' + qn + ' ' +
      plural(qn, 'вопрос', 'вопроса', 'вопросов') + ', 2 минуты ' + ic(IC.arr) + '</span></div><div class="c9-tiles">';
    strategies().forEach(function (s, i) {
      h += '<div class="c9-tl' + (s.on ? ' c9-on' : '') + '" data-c9act="strat" data-i="' + i + '">' +
        '<div class="c9-tl-n">' + esc(s.title) + '</div><div class="c9-tl-s">' + esc(s.sub) + '</div>';
      if (s.bonds == null || s.bonds < 0) {
        h += '<div class="c9-tl-cu">' + ic(IC.pen) + '<span>Задать доли</span></div>';
      } else {
        h += '<div class="c9-tl-bar"><i class="c9-b" style="width:' + s.bonds + '%"></i><i class="c9-e" style="width:' + (100 - s.bonds) + '%"></i></div>' +
          '<div class="c9-tl-sh"><span class="c9-b">Обл. ' + s.bonds + '%</span><span class="c9-e">Акц. ' + (100 - s.bonds) + '%</span></div>' +
          '<div class="c9-tl-y">' + s.yield + '<span>годовых</span></div>';
      }
      h += '</div>';
    });
    return h + '</div></div>';
  }

  /* ── ПОЛКА ОТВЕТА: рост ─────────────────────────────────────────────────── */
  function ansMix(g, inc) {
    var S = sumV(), y = yearsV();
    if (!g) {
      return '<div class="c9-sh c9-ans"><div class="c9-ans-l"><div class="c9-hh">Ваш портфель через ' + yrs(y) + '</div>' +
        '<div class="c9-rng" style="margin-top:14px">Введите сумму — прогноз посчитается сам</div></div>' +
        '<div class="c9-ans-r"></div></div>';
    }
    var mo = inc ? inc.monthly : 0;
    return '<div class="c9-sh c9-ans"><div class="c9-ans-l">' +
      '<div class="c9-hh">Ваш портфель через ' + yrs(y) + '</div>' +
      '<div class="c9-big"><i>≈</i><b>' + capN(g.base) + '</b><span>' + capU(g.base) + '</span></div>' +
      '<div class="c9-rng">сценарий <b>' + capN(g.lo) + '</b> – <b>' + capN(g.hi) + '</b>' +
        (g.base >= 950000 ? ' млн' : ' ₽') + ' · ' + pct1(g.r) + ' годовых</div>' +
      '<div class="c9-facts">' +
        '<div class="c9-fct"><span>Доход в месяц</span><b>≈ ' + sp(g.cash) + ' ₽</b></div>' +
        '<div class="c9-fct"><span>Прибыль за ' + yrs(y) + '</span><b class="c9-g">+ ' + sp(g.base - S) + ' ₽</b></div>' +
      '</div>' +
      '<div class="c9-go"><button type="button" class="c9-btn" data-c9act="calc">' + ic(IC.pie) + 'Рассчитать портфель</button>' +
        (mo ? '<span class="c9-mir" data-c9act="tomonthly">А если нужны деньги каждый месяц — <b>' + sp(mo) + ' ₽/мес</b> ' + ic(IC.arr) + '</span>' : '') +
      '</div></div>' +
      '<div class="c9-ans-r">' +
        '<div class="c9-cv-h"><span class="c9-lb">Как растёт капитал</span>' +
          '<span class="c9-qt">вложенное не трогаем — сверху копится прибыль</span></div>' +
        '<div class="c9-chart" id="cx9Grow"></div>' +
        // «вложено» ушло на базовую линию графика — в подписи два цвета прибыли
        '<div class="c9-leg">' +
          '<s><em style="background:var(--bond);opacity:.75"></em>прибыль облигаций</s>' +
          '<s><em style="background:var(--eq);opacity:.8"></em>прибыль акций</s></div>' +
      '</div></div>';
  }

  /* ── ПОЛКА ОТВЕТА: доход ────────────────────────────────────────────────── */
  function ansMon(g, inc) {
    var S = sumV(), rows = basketRows();
    var inv = rows.reduce(function (a, r) { return a + r.inv; }, 0);
    var rest = Math.max(0, S - inv);
    if (!inc) {
      return '<div class="c9-sh c9-ans"><div class="c9-ans-l"><div class="c9-hh">Купоны каждый месяц</div>' +
        '<div class="c9-rng" style="margin-top:14px">Введите сумму — покажем купоны по месяцам</div></div>' +
        '<div class="c9-ans-r"></div></div>';
    }
    var next = inc.next || null;
    var nextTx = '—';
    if (next && next.dm) {
      var pp = next.dm.split('.');
      nextTx = parseInt(pp[0], 10) + ' ' + MON_GEN[Math.max(0, parseInt(pp[1], 10) - 1)];
    }
    return '<div class="c9-sh c9-ans"><div class="c9-ans-l">' +
      '<div class="c9-hh">Купоны каждый месяц</div>' +
      '<div class="c9-big"><i>≈</i><b>' + sp(inc.monthly) + '</b><span>₽ / мес</span></div>' +
      '<div class="c9-rng">' + (taxV() > 0 ? 'после НДФЛ ' + Math.round(taxV() * 100) + '%' : 'без налога') +
        ' · <b>' + sp(inc.annual) + ' ₽</b> за год · <b>' + pct1(S > 0 ? inc.annual / S : 0) + '</b> годовых</div>' +
      '<div class="c9-facts">' +
        '<div class="c9-fct"><span>Ближайшая выплата</span><b>' + nextTx + '</b></div>' +
        '<div class="c9-fct"><span>Свободный остаток</span><b>' + sp(rest) + ' ₽</b></div>' +
      '</div>' +
      '<div class="c9-go"><button type="button" class="c9-btn" data-c9act="createpf">' + ic(IC.cases) + 'Создать портфель</button>' +
        (g ? '<span class="c9-mir" data-c9act="tomix">А если растить капитал — <b>' + capBoth(g.base) + ' за ' + yrs(yearsV()) + '</b> ' + ic(IC.arr) + '</span>' : '') +
      '</div></div>' +
      '<div class="c9-ans-r">' +
        '<div class="c9-cv-h"><span class="c9-lb">Двенадцать месяцев вперёд</span>' +
          '<span class="c9-qt">под столбиком — выпуск, который платит в этом месяце</span></div>' +
        '<div class="c9-chart" id="cx9Bars"></div>' +
      '</div></div>';
  }

  /* ── ПОЛКА КОРЗИНЫ ОФЗ ──────────────────────────────────────────────────── */
  function basketShelf(inc) {
    var rows = basketRows();
    var h = '<div class="c9-sh c9-bskt c9-sm"><div class="c9-pick-hd">' +
      '<span class="c9-lb">Корзина ОФЗ · ' + rows.length + ' ' + plural(rows.length, 'выпуск', 'выпуска', 'выпусков') + '</span>' +
      '<span class="c9-qt">подобраны так, чтобы купон приходил в любой месяц года</span>' +
      '<span class="c9-qt" data-c9act="redistr">Подобрать заново ' + ic(IC.arr) + '</span></div>' +
      '<table class="c9-bt"><thead><tr><th>Выпуск</th><th>Доходность</th><th>Цена</th>' +
      '<th>Количество</th><th>Вложено</th><th>Купон за год</th></tr></thead><tbody>';
    var qs = 0, inv = 0, cp = 0;
    rows.forEach(function (r) {
      qs += r.qty; inv += r.inv; cp += r.coupon;
      var mo = r.months.map(function (m) { return MON_LO[m]; }).join(' · ');
      h += '<tr><td class="c9-nm">' + esc(r.n) + '<em>' + (mo ? 'купоны · ' + mo : '&nbsp;') + '</em></td>' +
        '<td class="c9-y">' + (r.yld ? r.yld + '%' : '—') + '</td>' +
        '<td class="c9-mo">' + r.price.toFixed(1).replace('.', ',') + '%</td>' +
        '<td><span class="c9-qty"><i data-c9act="qty" data-t="' + r.t + '" data-d="-1">−</i><b>' + r.qty +
          '</b><i data-c9act="qty" data-t="' + r.t + '" data-d="1">+</i></span></td>' +
        '<td>' + sp(r.inv) + ' ₽</td><td>' + sp(r.coupon) + ' ₽</td></tr>';
    });
    return h + '</tbody><tfoot><tr><td class="c9-k">Итого</td><td></td><td></td>' +
      '<td class="c9-k">' + sp(qs) + ' шт</td><td>' + sp(inv) + ' ₽</td><td>' + sp(cp) + ' ₽</td></tr></tfoot></table></div>';
  }

  /* ── ПОЛКА ПОДБОРА (Б.3) ────────────────────────────────────────────────── */
  var qi = 0, answers = [], picked = -1;
  function questions() { try { return (typeof VG_Q !== 'undefined' && VG_Q) ? VG_Q : []; } catch (e) { return []; } }
  function quizShelf() {
    var Q = questions(), q = Q[qi];
    if (!q) return '<div class="c9-sh c9-quiz"></div>';
    var h = '<div class="c9-sh c9-quiz"><div class="c9-quiz-top">' +
      '<span class="c9-lb">Подбор стратегии</span>' +
      '<span class="c9-prog"><i style="width:' + Math.round((qi + 1) / Q.length * 100) + '%"></i></span>' +
      '<span class="c9-num" style="font-size:11.5px;font-weight:700;color:var(--mut)">' + (qi + 1) + ' / ' + Q.length + '</span></div>' +
      '<div class="c9-qbody"><div class="c9-quiz-q">' + esc(q.t) + '</div>';
    // подсказка под вопросом: в мокапе она объясняла механику теста, в данных
    // VG_Q своего текста у вопросов нет — печатаем общий, он верен для всех
    h += '<div class="c9-qt" style="max-width:620px">' +
      esc(q.h || 'Отвечайте как есть: по сумме ответов подберём долю акций — чем спокойнее вы к просадкам, тем она выше.') +
      '</div>';
    h += '<div class="c9-qopts">';
    q.o.forEach(function (o, i) {
      h += '<div class="c9-qo' + (i === picked ? ' c9-on' : '') + '" data-c9act="qopt" data-i="' + i + '" data-s="' + o[1] + '">' +
        '<em></em><span>' + esc(o[0]) + '</span></div>';
    });
    h += '</div></div><div class="c9-quiz-go">' +
      '<button type="button" class="c9-btn' + (picked < 0 ? ' c9-gh' : '') + '" data-c9act="qnext">' +
        (qi === Q.length - 1 ? 'Готово' : 'Далее') + ' ' + ic(IC.arr) + '</button>' +
      '<span class="c9-mir" data-c9act="qskip">Пропустить — оставить «' + esc(stratV()) + '» ' +
        bondsV() + '/' + (100 - bondsV()) + ' ' + ic(IC.arr) + '</span></div></div>';
    return h;
  }
  // Итог теста: состояния «результат» в мокапе нет — собран его языком
  function quizResult(profile, applied) {
    return '<div class="c9-sh c9-quiz"><div class="c9-quiz-top">' +
      '<span class="c9-lb">Подбор стратегии</span><span class="c9-prog"><i style="width:100%"></i></span>' +
      '<span class="c9-num" style="font-size:11.5px;font-weight:700;color:var(--mut)">готово</span></div>' +
      '<div class="c9-qbody"><div class="c9-lb">Ваш инвестпрофиль</div>' +
      '<div class="c9-quiz-q" style="margin-top:10px">' + esc(profile.name || '') + '</div>' +
      '<div class="c9-qt" style="max-width:620px;margin-top:10px">' + esc(profile.desc || '') + '</div>' +
      '<div class="c9-tl c9-on" style="max-width:300px;margin-top:22px">' +
        '<div class="c9-tl-n">' + esc(applied.t) + '</div><div class="c9-tl-s">подобрана по вашим ответам</div>' +
        '<div class="c9-tl-bar"><i class="c9-b" style="width:' + applied.bonds + '%"></i><i class="c9-e" style="width:' + (100 - applied.bonds) + '%"></i></div>' +
        '<div class="c9-tl-sh"><span class="c9-b">Обл. ' + applied.bonds + '%</span><span class="c9-e">Акц. ' + (100 - applied.bonds) + '%</span></div>' +
      '</div></div>' +
      '<div class="c9-quiz-go"><button type="button" class="c9-btn" data-c9act="qdone">Показать расчёт ' + ic(IC.arr) + '</button>' +
      '<span class="c9-mir" data-c9act="quiz">Пройти заново ' + ic(IC.arr) + '</span></div></div>';
  }

  /* ── ПОЛКИ РАЗВИЛКИ (Б.4) ───────────────────────────────────────────────── */
  function forkShelves(g, inc) {
    var y = yearsV();
    var h = '<div class="c9-sh c9-fork" style="flex:1"><div class="c9-ans-l">' +
      '<div class="c9-kick c9-lb">Рост капитала</div>' +
      '<div class="c9-hh" style="margin-top:6px">Не трогаю деньги сейчас</div>' +
      (g ? '<div class="c9-big"><i>≈</i><b style="font-size:46px">' + capN(g.base) + '</b><span>' + capU(g.base) + ' через ' + yrs(y) + '</span></div>' +
           '<div class="c9-rng">«' + esc(stratV()) + '» ' + bondsV() + '/' + (100 - bondsV()) + ' · ' + pct1(g.r) + ' годовых</div>'
         : '<div class="c9-rng" style="margin-top:14px">Введите сумму — посчитаем прогноз</div>') +
      '<div class="c9-go"><button type="button" class="c9-btn" data-c9act="tomix">Выбрать рост ' + ic(IC.arr) + '</button></div></div>' +
      '<div class="c9-ans-r"><div class="c9-chart" id="cx9ForkGrow" style="margin-top:auto"></div></div></div>';
    h += '<div class="c9-sh c9-fork" style="flex:1"><div class="c9-ans-l">' +
      '<div class="c9-kick c9-lb">Ежемесячный доход</div>' +
      '<div class="c9-hh" style="margin-top:6px">Пусть капитал платит на счёт</div>' +
      (inc ? '<div class="c9-big"><i>≈</i><b style="font-size:46px">' + sp(inc.monthly) + '</b><span>₽ каждый месяц</span></div>' +
             '<div class="c9-rng">' + basketRows().length + ' ' + plural(basketRows().length, 'выпуск', 'выпуска', 'выпусков') +
             ' ОФЗ · ' + sp(inc.annual) + ' ₽ за год</div>'
           : '<div class="c9-rng" style="margin-top:14px">Введите сумму — покажем купоны</div>') +
      '<div class="c9-go"><button type="button" class="c9-btn c9-gh" data-c9act="tomonthly">Выбрать доход ' + ic(IC.arr) + '</button></div></div>' +
      '<div class="c9-ans-r"><div class="c9-chart" id="cx9ForkBars" style="margin-top:auto"></div></div></div>';
    return h;
  }

  /* ── СБОРКА И ПЕРЕРИСОВКА ───────────────────────────────────────────────── */
  var host = null, lastInc = null, lastG = null, quizDone = null;

  // Полки — десктопная раскладка (колонка сайдбара включается там же, с 1024px).
  // Ниже порога слой выключается целиком и «Расчёт» остаётся на прежней вёрстке:
  // мобильный слой живёт в css/mobile.css и этого раунда не касается.
  function desktop() {
    try { return window.matchMedia('(min-width: 1024px)').matches; } catch (e) { return true; }
  }

  function mount() {
    if ($('cx9')) { host = $('cx9').querySelector('.c9-ct'); return true; }
    var pane = $('calcPaneContent');
    if (!pane) return false;
    var root = document.createElement('div');
    root.id = 'cx9';
    root.className = 'cx9';
    root.innerHTML = '<div class="c9-ct" id="cx9Ct"></div>';
    pane.appendChild(root);
    host = $('cx9Ct');
    // штатная панель «Своя» — из гасимой карточки наружу, поверх площади
    var cust = $('customStrategyExpanded');
    var cp = $('calcPane');
    if (cust && cp && cust.parentNode !== cp) cp.appendChild(cust);
    if (cp && !$('cx9Veil')) {
      var veil = document.createElement('div');
      veil.id = 'cx9Veil';
      veil.addEventListener('click', closeCustom);
      cp.appendChild(veil);
    }
    document.body.classList.add('cx9-on');
    return true;
  }

  function closeCustom() {
    var cust = $('customStrategyExpanded');
    if (cust) cust.classList.remove('show');
    document.body.classList.remove('cx9-cust');
  }

  function render() {
    if (!host) return;
    if (!desktop()) { document.body.classList.remove('cx9-on'); return; }
    document.body.classList.add('cx9-on');
    var S = sumV(), sim = SIM();
    var ok = S >= 1000 && sim;
    lastInc = ok ? sim.income(S) : null;
    lastG = ok ? sim.growth(S, lastInc) : null;
    var m = mode(), html = '';
    if (m === 'quiz') {
      html = condMix() + (quizDone ? quizResult(quizDone.p, quizDone.a) : quizShelf());
    } else if (m === 'monthly') {
      html = condMon() + basketShelf(lastInc) + ansMon(lastG, lastInc);
    } else if (m === 'mix') {
      html = condMix() + pickShelf() + ansMix(lastG, lastInc);
    } else {
      html = condMix() + forkShelves(lastG, lastInc);
    }
    host.innerHTML = html;
    syncSumField();
    paint();
  }

  // Графики рисуются по фактическому месту в полке (мокап — фиксированная сцена)
  function fit(id, maxH) {
    var n = $(id);
    if (!n) return null;
    var box = n.parentNode, h = box.clientHeight;
    // ЛОВУШКА: у графика margin-top:auto, и getComputedStyle отдаёт его
    // ИСПОЛЬЗОВАННЫМ значением (всё свободное место). Вычитать можно только
    // соседей — иначе от высоты остаётся полоска.
    Array.prototype.forEach.call(box.children, function (c) {
      if (c === n) return;
      h -= c.offsetHeight + (parseFloat(getComputedStyle(c).marginTop) || 0) + (parseFloat(getComputedStyle(c).marginBottom) || 0);
    });
    if (maxH) h = Math.min(h, maxH);
    return { n: n, w: Math.max(240, Math.round(n.clientWidth || box.clientWidth)), h: Math.max(150, Math.round(h)) };
  }
  function paint() {
    var S = sumV();
    var g = fit('cx9Grow');
    if (g && lastG) g.n.innerHTML = growSVG(g.w, g.h, S, lastG);
    var b = fit('cx9Bars');
    if (b && lastInc) b.n.innerHTML = barsSVG(b.w, b.h, monthsAhead(lastInc));
    var fg = fit('cx9ForkGrow', 240);
    if (fg && lastG) fg.n.innerHTML = growSVG(fg.w, fg.h, S, lastG);
    var fb = fit('cx9ForkBars', 240);
    if (fb && lastInc) fb.n.innerHTML = barsSVG(fb.w, fb.h, monthsAhead(lastInc), 1);
  }

  /* ── поле суммы ─────────────────────────────────────────────────────────── */
  function syncSumField() {
    var f = $('cx9Sum');
    if (!f || f === document.activeElement) return;
    var S = sumV();
    f.value = S ? sp(S) : '';
    f.style.width = Math.max(1, f.value.length) + 'ch';
  }
  function onSumInput() {
    var f = $('cx9Sum');
    if (!f) return;
    var digits = String(f.value).replace(/\D/g, '').slice(0, 12);
    var caretEnd = f.selectionStart >= f.value.length;
    f.value = digits ? sp(digits) : '';
    f.style.width = Math.max(1, f.value.length) + 'ch';
    if (caretEnd) { try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} }
    var inp = $('sumInput');
    if (inp) {
      inp.value = digits;
      try { if (typeof ndFormatInput === 'function') ndFormatInput(inp); } catch (e) {}
    }
    schedule();
  }

  /* ── действия ───────────────────────────────────────────────────────────── */
  function closeDD() {
    var d = $('cx9FeeDD'); if (d) d.remove();
    var t = $('cx9TaxDD'); if (t) t.remove();
  }
  function act(name, node) {
    var sim = SIM();
    switch (name) {
      case 'yr':
        if (sim && sim.setYears) { sim.setYears(yearsV() + (+node.getAttribute('data-v'))); render(); }
        break;
      case 'feedd':
        if ($('cx9FeeDD')) { closeDD(); return; }
        closeDD(); node.parentNode.insertAdjacentHTML('beforeend', feeDD());
        break;
      case 'taxdd':
        if ($('cx9TaxDD')) { closeDD(); return; }
        closeDD(); node.parentNode.insertAdjacentHTML('beforeend', taxDD());
        break;
      case 'fee':
        try { ndSelectFee(+node.getAttribute('data-v'), node.getAttribute('data-l'), null); } catch (e) {}
        closeDD(); render();
        break;
      case 'feecustom':
        if (node.querySelector('input')) return;
        node.innerHTML = 'Своя<input type="number" step="0.001" min="0.001" max="5" placeholder="0,07">';
        var ci = node.querySelector('input');
        ci.focus();
        ci.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          var v = parseFloat(String(ci.value).replace(',', '.'));
          if (!(v > 0)) return;
          try { ndSelectFee(v / 100, String(v).replace('.', ',') + '%', null); } catch (er) {}
          closeDD(); render();
        });
        break;
      case 'tax':
        var r = +node.getAttribute('data-v');
        var btn = $(r === 0 ? 'tax-custom-0' : r === 0.15 ? 'tax-custom-15' : 'tax-custom-13');
        try { if (typeof setCustomTax === 'function') setCustomTax(r, btn || node); } catch (e) {}
        closeDD(); schedule();
        break;
      case 'strat':
        var s = strategies()[+node.getAttribute('data-i')];
        if (!s) return;
        if (s.bonds == null || s.bonds < 0) {
          document.body.classList.add('cx9-cust');
          try { if (typeof ndOpenCustom === 'function') ndOpenCustom(); } catch (e) {}
        } else {
          var nd = (typeof ND_STRATEGIES !== 'undefined') ? ND_STRATEGIES.find(function (x) { return x.title === s.title; }) : null;
          try { if (nd && typeof ndApplyStrategy === 'function') ndApplyStrategy(nd.bonds, nd.title, nd.subtitle); } catch (e) {}
          render();
        }
        break;
      case 'qty':
        try { if (typeof changeQty === 'function') changeQty(node.getAttribute('data-t'), +node.getAttribute('data-d')); } catch (e) {}
        schedule();
        break;
      case 'redistr':
        try { if (typeof distributeMonthlyInvestment === 'function') distributeMonthlyInvestment(); } catch (e) {}
        schedule();
        break;
      case 'calc':
        try { calculateAndShowPortfolio(); } catch (e) {}
        break;
      case 'createpf':
        var cr = $('miCreatePfBtn');
        if (cr) cr.click();
        break;
      case 'tomix':
        document.body.classList.remove('cx9-quiz');
        if (typeof window.cxSetMode === 'function') window.cxSetMode('mix');
        break;
      case 'tomonthly':
        document.body.classList.remove('cx9-quiz');
        if (typeof window.cxSetMode === 'function') window.cxSetMode('monthly');
        break;
      case 'quiz':
        openQuiz();
        break;
      case 'qopt':
        picked = +node.getAttribute('data-i');
        var sc = new Number(+node.getAttribute('data-s'));
        sc._idx = picked; answers[qi] = sc;
        render();
        break;
      case 'qnext':
        if (picked < 0) return;
        if (qi < questions().length - 1) { qi++; picked = (answers[qi] != null) ? answers[qi]._idx : -1; render(); }
        else finishQuiz();
        break;
      case 'qskip':
      case 'qdone':
        closeQuiz();
        break;
    }
  }

  /* ── подбор ─────────────────────────────────────────────────────────────── */
  function openQuiz() {
    if (!questions().length) return;
    qi = 0; answers = []; picked = -1; quizDone = null;
    if (typeof window.cxSetMode === 'function' && mode() !== 'mix') window.cxSetMode('mix');
    document.body.classList.add('cx9-quiz');
    render();
  }
  function closeQuiz() {
    document.body.classList.remove('cx9-quiz');
    quizDone = null;
    render();
  }
  function finishQuiz() {
    var score = answers.reduce(function (s, a) { return s + (a ? +a : 0); }, 0);
    try { window._vgScore = score; } catch (e) {}
    try { _vgScore = score; } catch (e) {}
    var profile = (typeof vgGetProfile === 'function') ? vgGetProfile() : { name: 'Сбалансированный' };
    var map = (typeof VG_STRAT_MAP !== 'undefined') ? VG_STRAT_MAP : {};
    var s = map[profile.name] || { t: 'Гармония', bonds: 50 };
    var applied = { t: s.t, bonds: (typeof s.bonds === 'number' && s.bonds >= 0) ? s.bonds : 50 };
    var preset = (typeof ndFindPreset === 'function') ? ndFindPreset(applied.bonds) : null;
    if (preset && typeof ndApplyStrategy === 'function') {
      try { ndApplyStrategy(preset.bonds, preset.title, preset.subtitle); } catch (e) {}
      applied = { t: preset.title, bonds: preset.bonds };
    }
    quizDone = { p: profile, a: applied };
    render();
  }

  /* ── планировщик перерисовки ────────────────────────────────────────────── */
  var _t = null;
  function schedule() { clearTimeout(_t); _t = setTimeout(render, 70); }
  var _pt = null;
  function schedulePaint() { clearTimeout(_pt); _pt = setTimeout(paint, 120); }

  /* ── обёртки штатных функций: числа полок живут вместе с движком ─────────── */
  function wraps() {
    ['ndFormatInput', 'recalcCustomCoupons', 'renderMonthlyIncomeCards', 'ndSelectFee', 'ndSaveCustom'].forEach(function (fn) {
      if (typeof window[fn] !== 'function' || window[fn]._r9) return;
      var orig = window[fn];
      window[fn] = function () {
        var r = orig.apply(this, arguments);
        if (fn === 'ndSaveCustom') closeCustom();
        schedule();
        return r;
      };
      window[fn]._r9 = true;
    });
  }

  /* ── init ───────────────────────────────────────────────────────────────── */
  var tries = 0;
  function init() {
    if (!mount() || !SIM()) {
      if (++tries < 120) setTimeout(init, 80);
      return;
    }
    wraps();
    // комиссия по умолчанию 0,05% (закон раунда: кнопка не бывает выключенной)
    try {
      if (typeof isFeeSelected !== 'undefined' && !isFeeSelected && typeof ndSelectFee === 'function') {
        ndSelectFee(0.0005, '0,05%', null);
      }
    } catch (e) {}
    document.addEventListener('click', function (e) {
      var n = e.target.closest && e.target.closest('[data-c9act]');
      if (!n) {
        if (!(e.target.closest && e.target.closest('.c9-dd'))) closeDD();
        return;
      }
      if (!$('cx9') || !$('cx9').contains(n)) return;
      e.stopPropagation();
      act(n.getAttribute('data-c9act'), n);
    });
    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'cx9Sum') onSumInput();
    });
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'cx9Sum' && e.key === 'Enter') {
        e.target.blur();
        try { if (typeof ndSumEnter === 'function') ndSumEnter(); } catch (er) {}
      }
    });
    // клик по полю суммы = фокус в input (как в мокапе: вся строка — поле)
    document.addEventListener('mousedown', function (e) {
      var fl = e.target.closest && e.target.closest('#cx9 .c9-fl.c9-inp');
      if (fl && e.target.id !== 'cx9Sum') { var f = $('cx9Sum'); if (f) { e.preventDefault(); f.focus(); } }
    });
    new MutationObserver(function () { schedule(); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    var strat = $('ndStratBlock');
    if (strat) new MutationObserver(function () { schedule(); })
      .observe(strat, { subtree: true, characterData: true, childList: true });
    window.addEventListener('resize', function () { schedule(); schedulePaint(); });
    // тест из колонки сайдбара открывает полку подбора, а не оверлей r5
    window.r5OpenQuiz = openQuiz;
    render();
    // цены MOEX приходят асинхронно — досчитываем, когда появятся
    var t2 = 0;
    (function tick() {
      var ready = false;
      try {
        ready = (typeof monthlyIncomeBonds !== 'undefined') && monthlyIncomeBonds &&
          monthlyIncomeBonds.some(function (b) { return b && (+b.p > 0); });
      } catch (e) {}
      if (ready) { render(); setTimeout(render, 3000); return; }
      if (++t2 < 60) setTimeout(tick, 1000);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 60); });
  } else {
    setTimeout(init, 60);
  }

  window.cx9Render = render;
})();
