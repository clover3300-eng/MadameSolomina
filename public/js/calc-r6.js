// ===== R6 · «СЦЕНА»: тёмный герой + живые карточки вкладки «Расчёт» =====
// Слой ПОВЕРХ calc-r5.js (каркас pk-карточек) и calc-mode.js (режимы/чузер):
// их код не меняется — R6 только пересаживает узлы и добавляет новые блоки.
//
//  · Герой #cxHero один на все режимы (cxm-choose/mix/monthly): вопрос слева,
//    ЖИВАЯ СУММА справа — #ndInputHero физически переносится в герой, все
//    обработчики #sumInput (ndFormatInput/ndSumEnter/персист) сохраняются.
//    Тексты героя меняются по режиму (MutationObserver класса <body> — так
//    перехватываются и внутренние вызовы setMode внутри calc-mode.js).
//  · Экран выбора: #cxChooser остаётся под управлением calc-mode (клики,
//    бейджи «Продолжить»), R6 добавляет в витрины живые цифры и мини-графики.
//  · Режим mix: карточка «Капитал» (осушена переносом суммы) превращается в
//    «Прогноз / Ваш портфель» и встаёт ВТОРОЙ; в её CTA-ряд переезжают
//    #calcCtaBar и комиссия (.fee-selector-unified).
//  · Режим monthly: интро-оверлей пропускается (его роль выполняет карточка
//    на экране выбора), сумма синхронизируется герой ↔ #monthlySumInput.
//
// Оценки в цифрах ПРЕЗЕНТАЦИОННЫЕ: доход считается по реальной корзине mi5
// (monthlyIncomeBonds + allScheduledPayments, без мутации bondQtyMap), рост —
// сложный процент от смешанной ставки (ОФЗ-доходность + премия акций).

(function () {
  'use strict';

  var EQ_PREM = 0.03;      // оценочная премия акций к доходности ОФЗ
  var DIV_Y   = 0.08;      // оценочная дивидендная доходность акций
  var FALLBACK_R = 0.145;  // ставка ОФЗ до загрузки цен MOEX
  var YEARS = 5;

  // ── helpers ───────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function fmtInt(v) { return Math.round(v).toLocaleString('ru-RU'); }
  // крупные суммы: «1.93 млн» / «193 000»
  function fmtCap(v) {
    if (v >= 950000) return (v / 1e6).toFixed(2).replace(',', '.') + ' <small>млн ₽</small>';
    return fmtInt(v) + ' <small>₽</small>';
  }
  function fmtCapPlain(v) {
    if (v >= 950000) return (v / 1e6).toFixed(2) + ' млн';
    return fmtInt(v);
  }
  function taxRate() {
    try { if (typeof customTax === 'number') return customTax; } catch (e) {}
    return 0.13;
  }
  function heroSum() {
    var inp = $('sumInput');
    if (!inp) return 0;
    return parseInt(String(inp.value).replace(/\D/g, ''), 10) || 0;
  }
  function currentMode() {
    var b = document.body.classList;
    return b.contains('cxm-mix') ? 'mix' : b.contains('cxm-monthly') ? 'monthly' : 'choose';
  }
  function bondsPct() {
    // «Обл. 50%» в шапке выбранной стратегии
    var elB = $('mainCardBonds');
    var m = elB && elB.textContent.match(/(\d+)/);
    var v = m ? +m[1] : 50;
    return (v >= 0 && v <= 100) ? v : 50;
  }

  // ── СИМУЛЯЦИИ ─────────────────────────────────────────────────────────────
  // Купонная корзина для суммы S — та же математика, что distributeMonthly-
  // Investment + recalcCustomCoupons, но без записи в bondQtyMap/DOM.
  function simIncome(S) {
    try {
      if (typeof monthlyIncomeBonds === 'undefined' || !monthlyIncomeBonds || !monthlyIncomeBonds.length) return null;
      if (typeof allScheduledPayments === 'undefined' || !allScheduledPayments || !allScheduledPayments.length) return null;
      var priced = monthlyIncomeBonds.map(function (b) {
        return { t: b.t, n: b.n, fp: (+b.p || 0) + (+b.nkd || 0) };
      });
      if (!priced.some(function (p) { return p.fp > 0; })) return null;
      var per = S / 6, qty = {};
      priced.forEach(function (p) { qty[p.t] = p.fp > 0 ? Math.floor(per / p.fp) : 0; });
      // добор остатка самыми дешёвыми — как в distributeMonthlyInvestment
      var leftover = S - priced.reduce(function (s, p) { return s + qty[p.t] * p.fp; }, 0);
      var byPrice = priced.filter(function (p) { return p.fp > 0; })
        .sort(function (a, b) { return a.fp - b.fp; });
      var added = true;
      while (added) {
        added = false;
        for (var bi = 0; bi < byPrice.length; bi++) {
          if (byPrice[bi].fp <= leftover) {
            qty[byPrice[bi].t]++; leftover -= byPrice[bi].fp; added = true;
          }
        }
      }
      var tax = taxRate();
      var annual = 0, byMonth = new Array(12).fill(0), next = null, nextMn = -1;
      allScheduledPayments.forEach(function (pay) {
        var q = qty[pay.paymentTicker];
        if (q == null) {
          var pb = priced.find(function (p) { return p.n === pay.displayName; });
          if (pb) q = qty[pb.t];
        }
        q = q || 0;
        var net = (+pay.staticCouponVal || 0) * q * (1 - tax);
        annual += net;
        var parts = String(pay.dateStr || '').split('.');
        var mn = parts.length >= 3 ? parseInt(parts[1], 10) - 1 : parseInt(parts[0], 10) - 1;
        if (mn >= 0 && mn < 12) byMonth[mn] += net;
        if (!next && q > 0) {
          next = {
            name: (pay.displayName || '').replace(/^(ОФЗ)-/, '$1 '),
            dm: parts.length >= 3 ? (parts[0] + '.' + parts[1]) : '',
            net: net
          };
          nextMn = mn;
        }
      });
      if (annual <= 0) return null;
      return {
        annual: annual, monthly: annual / 12, byMonth: byMonth,
        rGross: S > 0 ? (annual / (1 - tax)) / S : FALLBACK_R,
        next: next, nextMn: nextMn, tax: tax
      };
    } catch (e) { return null; }
  }

  // Прогноз роста: смешанная ставка ОФЗ/акции, коридор ± по доле акций
  function simGrowth(S, inc) {
    var rB = (inc && inc.rGross > 0.01) ? inc.rGross : FALLBACK_R;
    var b = bondsPct() / 100;
    var r = b * rB + (1 - b) * (rB + EQ_PREM);
    var sig = 0.012 + (1 - b) * 0.05;
    var cash = S * (b * rB + (1 - b) * DIV_Y) * (1 - taxRate()) / 12; // купоны+дивиденды в месяц
    return {
      r: r,
      base: S * Math.pow(1 + r, YEARS),
      lo:   S * Math.pow(1 + Math.max(0.001, r - sig), YEARS),
      hi:   S * Math.pow(1 + r + sig, YEARS),
      cash: cash
    };
  }

  // ── ГРАФИКИ ───────────────────────────────────────────────────────────────
  // Веер прогноза: коридор lo..hi + базовая линия, подпись у конца
  function fanSVG(S, g, W, H) {
    var padL = 6, padR = 78, padT = 16, padB = 22;
    var x0 = padL, x1 = W - padR, yB = H - padB, yT = padT;
    var vMin = S, vMax = g.hi;
    function X(t) { return x0 + (x1 - x0) * t / YEARS; }
    function Y(v) {
      if (vMax <= vMin) return yB;
      return yB - (yB - yT) * ((v - vMin) / (vMax - vMin));
    }
    function rate(vEnd) { return Math.pow(vEnd / S, 1 / YEARS) - 1; }
    function pts(rr, rev) {
      var out = [];
      for (var i = 0; i <= 24; i++) {
        var t = YEARS * i / 24;
        out.push([X(t), Y(S * Math.pow(1 + rr, t))]);
      }
      if (rev) out.reverse();
      return out;
    }
    function d(p) {
      return p.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ');
    }
    var hiR = rate(g.hi), loR = rate(g.lo), baseR = rate(g.base);
    var area = d(pts(hiR)) + ' ' + d(pts(loR, true)).replace(/^M/, 'L') + ' Z';
    var yEnd = Y(g.base);
    var year0 = new Date().getFullYear();
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="cxr6fan" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#4a8df0" stop-opacity=".16"/>' +
        '<stop offset="1" stop-color="#4a8df0" stop-opacity=".02"/>' +
      '</linearGradient></defs>' +
      '<g stroke="var(--r5-line,#e6ecf4)" stroke-width="1">' +
        '<line x1="0" y1="' + Math.round(yT + (yB - yT) * .33) + '" x2="' + W + '" y2="' + Math.round(yT + (yB - yT) * .33) + '"/>' +
        '<line x1="0" y1="' + Math.round(yT + (yB - yT) * .66) + '" x2="' + W + '" y2="' + Math.round(yT + (yB - yT) * .66) + '"/>' +
      '</g>' +
      '<path d="' + area + '" fill="url(#cxr6fan)"/>' +
      '<path d="' + d(pts(baseR)) + '" fill="none" stroke="#4a8df0" stroke-width="2.6"/>' +
      '<circle cx="' + x1 + '" cy="' + yEnd.toFixed(1) + '" r="4" fill="#4a8df0"/>' +
      '<text x="' + (x1 + 8) + '" y="' + (yEnd + 4).toFixed(1) + '" font-family="var(--r5-mono,monospace)" font-size="12" font-weight="700" fill="currentColor">' + fmtCapPlain(g.base) + '</text>' +
      '<text x="4" y="' + (H - 6) + '" font-family="var(--r5-mono,monospace)" font-size="10" fill="#97a3b4">' + year0 + '</text>' +
      '<text x="' + (x1 - 30) + '" y="' + (H - 6) + '" font-family="var(--r5-mono,monospace)" font-size="10" fill="#97a3b4">' + (year0 + YEARS) + '</text>' +
    '</svg>';
  }

  // Столбики выплат по месяцам
  var MONS = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
  function barsHTML(inc) {
    var vals = (inc && inc.byMonth) ? inc.byMonth : new Array(12).fill(1);
    var max = Math.max.apply(null, vals.concat([1]));
    var hl = inc ? inc.nextMn : -1;
    var html = '<div class="cxr6-bars">';
    for (var i = 0; i < 12; i++) {
      var h = Math.round(16 + 62 * (vals[i] / max));
      html += '<span class="cb' + (i === hl ? ' hl' : '') + '"' +
        (inc && vals[i] > 0 ? ' title="+' + fmtInt(vals[i]) + ' ₽"' : '') + '>' +
        '<i style="height:' + h + 'px"></i><b>' + MONS[i] + '</b></span>';
    }
    return html + '</div>';
  }

  // ── ГЕРОЙ ─────────────────────────────────────────────────────────────────
  var TXT = {
    choose: {
      kick: 'Новый расчёт',
      title: 'Что для вас важнее сейчас?',
      sub: 'Введите сумму — обе карточки сразу покажут, что она даст: рост на годы или выплаты каждый месяц.',
      hint: 'цифры в карточках пересчитаются мгновенно'
    },
    mix: {
      kick: 'Расчёт · <span class="acc-b">Хочу рост</span>',
      title: 'Нарастить капитал за годы',
      sub: 'Выберите стратегию — прогноз справа пересчитается мгновенно.',
      hint: 'меняйте прямо здесь — всё пересчитается'
    },
    monthly: {
      kick: 'Расчёт · <span class="acc-o">Хочу доход</span>',
      title: 'Получать деньги каждый месяц',
      sub: 'Корзина из 6 выпусков ОФЗ уже разложена под вашу сумму — подкрутите под себя.',
      hint: 'меняйте прямо здесь — всё пересчитается'
    }
  };

  function buildHero() {
    if ($('cxHero')) return true;
    var rows = document.querySelector('#calcPaneContent .cx-rows.r5');
    var amountHero = $('ndInputHero');
    if (!rows || !amountHero) return false;

    var hero = el('div', '', '');
    hero.id = 'cxHero';
    hero.innerHTML =
      '<span class="cxh-wm">₽</span>' +
      '<button type="button" id="cxHeroBack">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>' +
        '<span>Выбор типа портфеля</span>' +
      '</button>' +
      '<div class="cxh-row">' +
        '<div class="cxh-left">' +
          '<div class="cxh-kick" id="cxHeroKick"></div>' +
          '<div class="cxh-title" id="cxHeroTitle"></div>' +
          '<div class="cxh-sub" id="cxHeroSub"></div>' +
        '</div>' +
        '<div class="cxh-amt">' +
          '<div class="cxh-amt-k">Сумма инвестиций</div>' +
          '<div class="cxh-amt-host" id="cxHeroAmtHost"></div>' +
          '<div class="cxh-hint" id="cxHeroHint"></div>' +
        '</div>' +
      '</div>';
    rows.insertBefore(hero, rows.firstChild);

    // сумма переезжает в герой; обработчики #sumInput сохраняются
    $('cxHeroAmtHost').appendChild(amountHero);
    $('cxHeroBack').addEventListener('click', function () {
      if (typeof window.cxSetMode === 'function') window.cxSetMode('choose');
    });
    return true;
  }

  function syncHero() {
    var m = currentMode(), t = TXT[m];
    var k = $('cxHeroKick'), ti = $('cxHeroTitle'), s = $('cxHeroSub'), h = $('cxHeroHint');
    if (k) k.innerHTML = t.kick;
    if (ti) ti.textContent = t.title;
    if (s) s.textContent = t.sub;
    if (h) h.textContent = t.hint;
  }

  // Компактные размеры цифр суммы в герое (штатный ndFormatInput ставит
  // инлайновые 64px под большую карточку — пережимаем после него)
  function heroSizing() {
    var inp = $('sumInput'), ruble = $('ndRuble');
    if (!inp) return;
    var len = inp.value.length;
    var size = len <= 7 ? 38 : len <= 9 ? 32 : len <= 12 ? 26 : 20;
    inp.style.setProperty('font-size', size + 'px', 'important');
    inp.style.setProperty('width', (len || 1) + 'ch', 'important');
    inp.style.setProperty('min-width', (len || 1) + 'ch', 'important');
    if (ruble) ruble.style.fontSize = Math.round(size * .74) + 'px';
  }

  // ── ЭКРАН ВЫБОРА: живые блоки на витринах ─────────────────────────────────
  function buildChooserLive() {
    var ch = $('cxChooser');
    if (!ch || $('cxGrowLive')) return !!$('cxGrowLive');
    var grow = ch.querySelector('.cxm-type[data-mode="mix"]');
    var inc = ch.querySelector('.cxm-type[data-mode="monthly"]');
    if (!grow || !inc) return false;

    [['cxGrow', grow, 'стратегию уточните на следующем шаге'],
     ['cxInc', inc, '6 выпусков ОФЗ · данные MOEX']].forEach(function (cfg) {
      var live = el('div', 'cxr6-live');
      live.id = cfg[0] + 'Live';
      live.innerHTML =
        '<div class="cxr6-big" id="' + cfg[0] + 'Big">—</div>' +
        '<div class="cxr6-rng" id="' + cfg[0] + 'Rng"></div>' +
        '<div class="cxr6-viz" id="' + cfg[0] + 'Viz"></div>';
      var facts = cfg[1].querySelector('.cxm-facts');
      cfg[1].insertBefore(live, facts || null);
      // кнопка + приписка в один ряд
      var btn = cfg[1].querySelector('.cxm-tbtn');
      if (btn) {
        var row = el('div', 'cxr6-ctarow');
        cfg[1].appendChild(row);
        row.appendChild(btn);
        row.appendChild(el('span', 'cxr6-meta', cfg[2]));
      }
    });

    // полоса «Не знаете, что выбрать?»: добавляем кнопку теста
    var cta = ch.querySelector('.cxm-cta');
    if (cta && !cta.querySelector('.cxr6-quizbtn')) {
      var qb = el('button', 'cxr6-quizbtn', 'Тест · 2 мин');
      qb.type = 'button';
      qb.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof window.cxSetMode === 'function') window.cxSetMode('mix');
        setTimeout(function () {
          if (typeof window.r5OpenQuiz === 'function') window.r5OpenQuiz();
        }, 120);
      });
      var goBtn = cta.querySelector('.btn');
      cta.insertBefore(qb, goBtn || null);
    }
    return true;
  }

  // ── РЕЖИМ MIX: карточка «Прогноз / Ваш портфель» ─────────────────────────
  function buildForecastCard() {
    if ($('cxFc')) return true;
    var split = $('r5Split');
    if (!split) return false;
    var cards = split.querySelectorAll(':scope > .pk-card');
    if (cards.length < 2) return false;
    var cap = null, dist = null;
    cards.forEach ? null : 0;
    Array.prototype.forEach.call(cards, function (c) {
      if (c.querySelector('.cx-cap-center')) cap = c;
      if (c.querySelector('.cx-strat-host')) dist = c;
    });
    if (!cap || !dist) return false;

    // порядок: стратегия (01) слева, прогноз (02) справа
    split.appendChild(cap);
    var setCard = function (card, no, kick, title) {
      var wm = card.querySelector('.wm-clip .wm');
      var k = card.querySelector(':scope > .k');
      var t = card.querySelector(':scope > .t');
      if (wm) wm.textContent = no;
      if (k) k.textContent = kick;
      if (t) t.textContent = title;
    };
    setCard(dist, '01', 'Распределение', 'Стратегия');
    setCard(cap, '02', 'Прогноз', 'Ваш портфель');

    var body = cap.querySelector(':scope > .ct');
    var center = cap.querySelector('.cx-cap-center');
    var fee = cap.querySelector('.fee-selector-unified');
    var moex = cap.querySelector('.nd-moex-strip');
    if (moex) moex.style.display = 'none';

    var fc = el('div', '', '');
    fc.id = 'cxFc';
    fc.innerHTML =
      '<div id="cxFcBig">—</div>' +
      '<div id="cxFcRng"></div>' +
      '<div id="cxFcChart"></div>' +
      '<div id="cxFcFacts">' +
        '<span class="f"><span class="fic">₽</span>Доход в месяц — <b id="cxFcCash">—</b></span>' +
        '<span class="f"><span class="fic">%</span>Доходность — <b id="cxFcYield">—</b></span>' +
      '</div>' +
      '<div id="cxFcCta"></div>';
    if (body) body.insertBefore(fc, body.firstChild);
    if (center) center.style.display = 'none';

    var ctaRow = $('cxFcCta');
    var bar = $('calcCtaBar');
    if (ctaRow) {
      if (bar) ctaRow.appendChild(bar);
      if (fee) ctaRow.appendChild(fee);
      ctaRow.appendChild(el('span', 'cxr6-meta', 'считается на лету · MOEX'));
    }
    return true;
  }

  // ── ПЕРЕСЧЁТ ЖИВЫХ ЦИФР ──────────────────────────────────────────────────
  function recalc() {
    var S = heroSum();
    var hasS = S >= 1000;
    var inc = hasS ? simIncome(S) : null;
    var g = hasS ? simGrowth(S, inc) : null;

    // витрина «Хочу рост»
    var gb = $('cxGrowBig');
    if (gb) {
      if (g) {
        gb.innerHTML = '≈ ' + fmtCap(g.base) + ' <small>через ' + YEARS + ' лет</small>';
        $('cxGrowRng').textContent = 'коридор сценариев ' + fmtCapPlain(g.lo) + ' – ' + fmtCapPlain(g.hi);
        $('cxGrowViz').innerHTML = fanSVG(S, g, 640, 132);
      } else {
        gb.innerHTML = 'Введите сумму <small>— покажем прогноз на ' + YEARS + ' лет</small>';
        $('cxGrowRng').textContent = '';
        $('cxGrowViz').innerHTML = '';
      }
    }

    // витрина «Хочу доход»
    var ib = $('cxIncBig');
    if (ib) {
      if (hasS) {
        var m = inc ? inc.monthly : S * FALLBACK_R * (1 - taxRate()) / 12;
        var yld = inc ? (inc.annual / S * 100) : FALLBACK_R * (1 - taxRate()) * 100;
        ib.innerHTML = '≈ ' + fmtInt(m) + ' <small>₽ в месяц</small>';
        $('cxIncRng').textContent = fmtInt(m * 12) + ' ₽ в год · ' + yld.toFixed(1).replace('.', ',') + '% годовых · после НДФЛ ' + Math.round(taxRate() * 100) + '%';
        $('cxIncViz').innerHTML = barsHTML(inc);
      } else {
        ib.innerHTML = 'Введите сумму <small>— покажем купоны по месяцам</small>';
        $('cxIncRng').textContent = '';
        $('cxIncViz').innerHTML = '';
      }
    }

    // карточка «Прогноз» (mix)
    var fb = $('cxFcBig');
    if (fb) {
      if (g) {
        fb.innerHTML = '≈ ' + fmtCap(g.base) + ' <small>через ' + YEARS + ' лет</small>';
        $('cxFcRng').textContent = 'коридор сценариев ' + fmtCapPlain(g.lo) + ' – ' + fmtCapPlain(g.hi) + ' · облигации ' + bondsPct() + '% / акции ' + (100 - bondsPct()) + '%';
        $('cxFcChart').innerHTML = fanSVG(S, g, 760, 170);
        $('cxFcCash').textContent = '≈ ' + fmtInt(g.cash) + ' ₽';
        $('cxFcYield').textContent = (g.r * 100).toFixed(1).replace('.', ',') + '% годовых';
      } else {
        fb.innerHTML = 'Введите сумму <small>в шапке — прогноз посчитается сам</small>';
        $('cxFcRng').textContent = '';
        $('cxFcChart').innerHTML = '';
        $('cxFcCash').textContent = '—';
        $('cxFcYield').textContent = '—';
      }
    }
  }
  var _rcT = null;
  function scheduleRecalc() { clearTimeout(_rcT); _rcT = setTimeout(recalc, 60); }

  // ── MONTHLY: пропуск интро + синхронизация суммы ──────────────────────────
  var _prog = false;   // программное обновление суммы — не гнать синк по кругу

  function enterMonthly() {
    // сумма героя → mi5 (если введена); интро пропускаем через штатный старт
    var S = heroSum();
    var main = $('monthlySumInput');
    if (main && S >= 1000 && parseInt(main.value, 10) !== S) {
      main.value = S;
      if (typeof distributeMonthlyInvestment === 'function') {
        try { distributeMonthlyInvestment(); } catch (e) {}
      }
    }
    var ov = $('miStartOverlay');
    if (ov && !ov.classList.contains('is-out')) {
      var si = $('miStartInput');
      if (si && S >= 1000) si.value = S.toLocaleString('ru-RU');
      if (typeof miStartCalc === 'function') {
        try { miStartCalc(); } catch (e) {}
      }
    }
    // заголовок левой карточки — «Корзина ОФЗ»
    var ttl = document.querySelector('#calcAccordion .mi5-calc > .mi5-ttl');
    if (ttl && ttl.textContent !== 'Корзина ОФЗ') ttl.textContent = 'Корзина ОФЗ';
  }

  function syncHeroFromMonthly() {
    var main = $('monthlySumInput'), inp = $('sumInput');
    if (!main || !inp) return;
    var v = parseInt(String(main.value).replace(/\D/g, ''), 10) || 0;
    var cur = heroSum();
    if (v > 0 && v !== cur) {
      _prog = true;
      inp.value = String(v);
      try { if (typeof ndFormatInput === 'function') ndFormatInput(inp); } catch (e) {}
      _prog = false;
    }
  }

  // ── ОБЁРТКИ ШТАТНЫХ ФУНКЦИЙ ───────────────────────────────────────────────
  function installWraps() {
    // сумма: компактные размеры в герое + живые цифры + синк в monthly
    if (typeof window.ndFormatInput === 'function' && !window.ndFormatInput._r6) {
      var _oFmt = window.ndFormatInput;
      window.ndFormatInput = function (input) {
        _oFmt.apply(this, arguments);
        heroSizing();
        scheduleRecalc();
        if (!_prog && document.body.classList.contains('cxm-monthly')) {
          clearTimeout(window._r6MoT);
          window._r6MoT = setTimeout(function () {
            var main = $('monthlySumInput');
            var S = heroSum();
            if (main && S >= 1000) {
              main.value = S;
              try { if (typeof distributeMonthlyInvestment === 'function') distributeMonthlyInvestment(); } catch (e) {}
            }
          }, 350);
        }
      };
      window.ndFormatInput._r6 = true;
    }
    // степперы mi5 меняют сумму → показываем её и в герое
    if (typeof window.updateMonthlySumFromQuantities === 'function' && !window.updateMonthlySumFromQuantities._r6) {
      var _oUpd = window.updateMonthlySumFromQuantities;
      window.updateMonthlySumFromQuantities = function () {
        _oUpd.apply(this, arguments);
        syncHeroFromMonthly();
      };
      window.updateMonthlySumFromQuantities._r6 = true;
    }
  }

  // ── РЕЖИМЫ: реагируем на классы <body> (ловит и внутренние setMode) ──────
  var _lastMode = null;
  function onModeMaybeChanged() {
    var m = currentMode();
    if (m === _lastMode) return;
    _lastMode = m;
    syncHero();
    if (m === 'monthly') enterMonthly();
    scheduleRecalc();
  }

  // стратегия меняется → пересчёт прогноза (текст «Обл. N%» в шапке стратегии)
  function observeStrategy() {
    var host = $('ndStratBlock');
    if (!host || host._r6obs) return;
    host._r6obs = true;
    new MutationObserver(scheduleRecalc)
      .observe(host, { subtree: true, characterData: true, childList: true });
  }

  // цены MOEX приходят асинхронно — до них живые цифры на фолбэке
  function waitPrices() {
    var tries = 0;
    (function tick() {
      var ok = false;
      try {
        ok = (typeof monthlyIncomeBonds !== 'undefined') && monthlyIncomeBonds &&
          monthlyIncomeBonds.some(function (b) { return b && (+b.p > 0); }) &&
          (typeof allScheduledPayments !== 'undefined') && allScheduledPayments && allScheduledPayments.length > 0;
      } catch (e) {}
      if (ok) {
        recalc();
        // купоны/расписание могут догрузиться позже цен — страховочные пересчёты
        setTimeout(recalc, 3000);
        setTimeout(recalc, 8000);
        return;
      }
      if (++tries < 60) setTimeout(tick, 1000);
    })();
  }

  // ── INIT: после calc-r5 (каркас) и calc-mode (чузер/режимы) ───────────────
  var tries = 0;
  function init() {
    var okHero = buildHero();
    var okLive = buildChooserLive();
    var okFc = buildForecastCard();
    if (!okHero || !okLive || !okFc) {
      if (++tries < 80) setTimeout(init, 80);
      return;
    }
    installWraps();
    observeStrategy();

    // режимы: класс на <body> — единственный источник правды
    new MutationObserver(onModeMaybeChanged)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    onModeMaybeChanged();

    // стартовая сумма: если персист пуст — 1 000 000, чтобы карточки жили сразу
    var inp = $('sumInput');
    if (inp && !heroSum()) {
      inp.value = '1000000';
      try { if (typeof ndFormatInput === 'function') ndFormatInput(inp); } catch (e) {}
    } else {
      heroSizing();
    }

    syncHero();
    recalc();
    waitPrices();
    if (typeof window.cxSyncCardHeight === 'function') {
      try { window.cxSyncCardHeight(); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 40); });
  } else {
    setTimeout(init, 40);
  }

  // отладка
  window.r6Recalc = recalc;
})();
