// ===== ОБЪЕДИНЁННАЯ ВКЛАДКА «РАСЧЁТ»: выбор типа портфеля =====
// «Расчёт портфеля» и «Ежемесячный доход» слиты в одну вкладку на базе
// «Расчёта». При входе — две карточки выбора в стиле рабочих карточек R5
// (левая зеркалит «Капитал»: герой по центру + параметры снизу; правая —
// «Распределение»: строки-варианты как список стратегий). По ответу
// включается либо штатный r5-калькулятор, либо mi5-калькулятор купонов,
// который физически ПЕРЕНОСИТСЯ сюда из #panel-monthly (вся его логика в
// data.js работает по id и переезда не замечает; импорт в «Портфели» читает
// глобальные pfMonthlyBonds/bondQtyMap и _shoppingListData).
//
// Состояние = класс на <body>: cxm-choose / cxm-mix / cxm-monthly.
// Режим живёт в памяти страницы: после перезагрузки снова карточки выбора.
//
// ПОДВКЛАДКИ РЕЗУЛЬТАТОВ: когда расчёт произведён, в сайдбаре под «Расчётом»
// появляются «Смешанный портфель» (→ вкладка «Портфель») и/или «Ежемесячный
// доход» (→ купонный режим). Расчёты сохраняются:
//  - смешанный — штатный персист app-state.js + флаг calcDone; при загрузке
//    тихо пересобирается (window._cxSilentCalc гасит switchTab в
//    calculateAndShowPortfolio);
//  - купонный — свой ключ calc_monthly_v1 (started/sum/qty), восстановление
//    после загрузки цен MOEX.
//
// ЭТАЛОННАЯ ВЫСОТА КАРТОЧЕК: карточки всех трёх состояний держат высоту
// пары «Капитал/Распределение» — она замеряется (offsetHeight, зум её не
// искажает) и кладётся в --cx-card-h на .cx-rows.r5 (правила в calc-mode.css).

(function () {
  'use strict';

  var mode = null;        // 'choose' | 'mix' | 'monthly'
  var pending = null;     // режим, запрошенный до инициализации (deep-link)
  var ready = false;
  var miStarted = false;  // купонный расчёт произведён («Приступить к расчёту»)
  var MO_KEY = 'calc_monthly_v1';

  function rowsHost() {
    return document.querySelector('#calcPaneContent .cx-rows.r5');
  }

  // ── Перенос mi5-блока из «Ежемесячного дохода» в «Расчёт» ────────────────
  function moveMonthly() {
    var acc = document.getElementById('calcAccordion');
    var rows = rowsHost();
    if (!acc || !rows) return false;
    if (acc.parentNode !== rows) rows.appendChild(acc);
    return true;
  }

  // ── Экран выбора типа портфеля (единая карточка, мокап A+B №1) ───────────
  var GO_IC   = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
  var BACK_IC = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>';
  var SPARK_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z"/></svg>';
  // иконки фактов витрин
  var PIE_IC    = '<svg class="cxm-fic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 3v9"/></svg>';
  var TREND_IC  = '<svg class="cxm-fic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M16 7h5v5"/></svg>';
  var CAL_IC    = '<svg class="cxm-fic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var SHIELD_IC = '<svg class="cxm-fic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';

  function buildChooser() {
    if (document.getElementById('cxChooser')) return true;
    var rows = rowsHost();
    if (!rows) return false;

    var ch = document.createElement('div');
    ch.className = 'cxm-card';
    ch.id = 'cxChooser';
    ch.innerHTML =
      // Шапка: вопрос на белой поверхности карточки (не в хроме)
      '<div class="cxm-head">' +
        '<span class="cxm-k">Новый расчёт</span>' +
        '<div class="cxm-q">Что для вас важнее сейчас?</div>' +
        '<div class="cxm-qline"></div>' +
      '</div>' +
      // Две витрины типов
      '<div class="cxm-types">' +
        // 01 — Смешанный (рекомендованный)
        '<div class="cxm-type on" data-mode="mix">' +
          '<span class="wm">01</span>' +
          '<span class="cxm-tk blue">Хочу рост</span>' +
          '<span class="cxm-tn">Нарастить капитал за годы</span>' +
          '<span class="cxm-ts">Не трогаю деньги сейчас — хочу, чтобы через несколько лет их стало заметно больше.</span>' +
          '<div class="cxm-facts">' +
            '<span class="cxm-fact">' + PIE_IC + 'Облигации и акции по стратегии</span>' +
            '<span class="cxm-fact">' + TREND_IC + 'Цель — рост, горизонт от 3 лет</span>' +
          '</div>' +
          '<span class="cxm-tbtn dark">Выбрать рост ' + GO_IC + '</span>' +
        '</div>' +
        // 02 — Купонный
        '<div class="cxm-type on" data-mode="monthly">' +
          '<span class="wm">02</span>' +
          '<span class="cxm-tk orange">Хочу доход</span>' +
          '<span class="cxm-tn">Получать деньги каждый месяц</span>' +
          '<span class="cxm-ts">Пусть капитал приносит выплаты на счёт — как зарплата от вложений.</span>' +
          '<div class="cxm-facts">' +
            '<span class="cxm-fact">' + CAL_IC + '12 выплат в год, 6 выпусков</span>' +
            '<span class="cxm-fact">' + SHIELD_IC + 'Минимальный риск</span>' +
          '</div>' +
          '<span class="cxm-tbtn ghost">Выбрать доход ' + GO_IC + '</span>' +
        '</div>' +
      '</div>' +
      // Подсказка для неопределившихся
      '<div class="r-cta cxm-cta">' +
        '<span class="ic">' + SPARK_IC + '</span>' +
        '<span class="tx"><b>Не знаете, что выбрать?</b><span>Начните со смешанного — внутри есть тест на определение риск-профиля</span></span>' +
        '<span class="btn">Смешанный ' + GO_IC + '</span>' +
      '</div>';

    rows.insertBefore(ch, rows.firstChild);

    // Витрина целиком кликабельна (кнопка внутри — визуальная, клик всплывает)
    ch.querySelectorAll('.cxm-type').forEach(function (t) {
      t.addEventListener('click', function () {
        openMode(t.getAttribute('data-mode'));
        haptic('light');
      });
    });
    var cta = ch.querySelector('.cxm-cta');
    if (cta) cta.addEventListener('click', function () { setMode('mix'); haptic('light'); });
    refreshResumeBadges();
    return true;
  }

  // ── Бейджи «продолжить сохранённый расчёт» на витринах выбора (фишка 4) ──
  // Если режим уже посчитан (mix: calcDone/isPortfolioCalculated, monthly:
  // started/miStarted), на витрине появляется пилюля «Сохранённый расчёт», а
  // кнопка меняет надпись на «Продолжить». Сам расчёт восстановлен ещё при
  // загрузке (moRestore/mixRestore), поэтому клик просто открывает готовое.
  function savedFor(m) {
    try {
      if (m === 'mix') {
        if (typeof isPortfolioCalculated !== 'undefined' && isPortfolioCalculated) return true;
        var s = JSON.parse(localStorage.getItem('msolominа_state'));
        return !!(s && s.calcDone);
      }
      if (miStarted) return true;
      var mo = JSON.parse(localStorage.getItem(MO_KEY));
      return !!(mo && mo.started);
    } catch (e) { return false; }
  }

  // ── Дата расчёта ─────────────────────────────────────────────────────────
  // Без неё витрина с сохранённым расчётом выглядит как новая. Берём именно
  // момент расчёта, а не последней записи состояния: lsSave/moSave срабатывают
  // на каждый ввод и показывали бы «сегодня» всегда.
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function savedTs(m) {
    try {
      if (m === 'mix') {
        var s = JSON.parse(localStorage.getItem('msolominа_state'));
        return (s && s.calcTs) || 0;
      }
      var mo = JSON.parse(localStorage.getItem(MO_KEY));
      return (mo && mo.startedTs) || 0;
    } catch (e) { return 0; }
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var s = d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== now.getFullYear()) s += ' ' + d.getFullYear();
    return s;
  }
  // ставится только при настоящем расчёте (не при тихом восстановлении)
  function markMixCalcTs() {
    try {
      var st = JSON.parse(localStorage.getItem('msolominа_state')) || {};
      st.calcTs = Date.now();
      localStorage.setItem('msolominа_state', JSON.stringify(st));
    } catch (e) {}
  }
  // Клик по витрине. Новый расчёт открывает калькулятор, а сохранённый —
  // сразу результат, как обещает надпись «Продолжить»: у смешанного результат
  // живёт на вкладке «Портфель» (тот же переход, что у подпункта calc-mix в
  // сайдбаре), у купонного результатом служит сама корзина — это режим monthly.
  function openMode(m) {
    if (m === 'mix' && savedFor('mix')) {
      if (typeof window.sbOpenGroup === 'function') window.sbOpenGroup('calc');
      if (typeof switchTab === 'function') switchTab('portfolio');
      return;
    }
    setMode(m);
  }

  // «Новый расчёт» — открыть калькулятор с чистого листа.
  // Для смешанного достаточно просто открыть его: витрина уводит в готовый
  // результат, и другого пути к калькулятору нет. Дата обновится сама, когда
  // пользователь нажмёт «Рассчитать портфель» (до этого в силе старый расчёт).
  // Для купонного сохранённый расчёт — это и есть подкрученные руками
  // количества, поэтому пересобираем корзину и сбрасываем дату: иначе кнопка
  // ничем не отличалась бы от «Продолжить».
  function renewCalc(m) {
    if (m === 'monthly') {
      try {
        var mo = JSON.parse(localStorage.getItem(MO_KEY)) || {};
        delete mo.startedTs;
        localStorage.setItem(MO_KEY, JSON.stringify(mo));
      } catch (e) {}
    }
    setMode(m);
    if (m !== 'monthly') return;
    setTimeout(function () {
      try { if (typeof distributeMonthlyInvestment === 'function') distributeMonthlyInvestment(); } catch (e) {}
    }, 80);
  }

  function refreshResumeBadges() {
    var ch = document.getElementById('cxChooser');
    if (!ch) return;
    ['mix', 'monthly'].forEach(function (m) {
      var card = ch.querySelector('.cxm-type[data-mode="' + m + '"]');
      if (!card) return;
      var saved = savedFor(m);
      card.classList.toggle('has-saved', saved);
      var btn = card.querySelector('.cxm-tbtn');
      if (btn) {
        if (!btn._baseHTML) btn._baseHTML = btn.innerHTML;
        btn.innerHTML = saved ? ('Продолжить ' + GO_IC) : btn._baseHTML;
      }
      // Пилюля: не просто «сохранённый», а когда именно посчитан
      var badge = card.querySelector('.cxm-resume');
      if (saved) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'cxm-resume';
          card.insertBefore(badge, card.querySelector('.cxm-tk'));
        }
        var ds = fmtDate(savedTs(m));
        badge.innerHTML = '<span class="dot"></span>' +
          (ds ? ('Расчёт от ' + ds) : 'Сохранённый расчёт');
      } else if (badge) {
        badge.parentNode.removeChild(badge);
      }
      // «Новый расчёт» рядом с «Продолжить»: сама витрина ведёт в готовый
      // результат, и без этой кнопки пересчитать было бы неоткуда.
      var renew = card.querySelector('.cxm-renew');
      if (saved && btn) {
        if (!renew) {
          renew = document.createElement('button');
          renew.type = 'button';
          renew.className = 'cxm-renew';
          renew.textContent = 'Новый расчёт';
          renew.addEventListener('click', function (e) {
            e.stopPropagation();          // не отдаём клик витрине — она уводит в результат
            renewCalc(m);
            haptic('light');
          });
        }
        // держим её сразу за «Продолжить» в CTA-ряду, куда кнопку переносит R6
        if (renew.previousSibling !== btn) btn.parentNode.insertBefore(renew, btn.nextSibling);
      } else if (renew) {
        renew.parentNode.removeChild(renew);
      }
    });
  }
  window.cxRefreshResume = refreshResumeBadges;

  // ── Кнопка «Назад к выбору типа» (видна только в режимах mix/monthly) ────
  // Один элемент в самом верху колонки .cx-rows.r5: [back][chooser][r5Split].
  // Видимость переключает CSS по классу режима на <body>.
  function buildBackBtn() {
    if (document.getElementById('cxBack')) return;
    var rows = rowsHost();
    if (!rows) return;
    var b = document.createElement('button');
    b.id = 'cxBack';
    b.type = 'button';
    b.className = 'cxm-back';
    b.innerHTML = BACK_IC + '<span>Выбор типа портфеля</span>';
    b.addEventListener('click', function () { setMode('choose'); haptic('light'); });
    rows.insertBefore(b, rows.firstChild);
  }

  // ── Эталонная высота карточек (пара «Капитал/Распределение») ─────────────
  // offsetHeight не искажается CSS-zoom (в отличие от getBoundingClientRect).
  function measureMixH() {
    var split = document.getElementById('r5Split');
    var rows = rowsHost();
    if (!split || !rows) return 0;
    if (split.offsetHeight > 0) return split.offsetHeight;   // r5Split видим
    // скрыт CSS-правилом режима — замеряем невидимой абсолютной копией раскладки
    var prev = split.style.cssText;
    split.style.setProperty('display', 'grid', 'important');
    split.style.setProperty('visibility', 'hidden', 'important');
    split.style.setProperty('position', 'absolute', 'important');
    split.style.setProperty('top', '0', 'important');
    split.style.setProperty('left', '0', 'important');
    split.style.setProperty('width', rows.clientWidth + 'px', 'important');
    var h = split.offsetHeight;
    split.style.cssText = prev;
    return h;
  }
  function syncCardHeight() {
    if (window.innerWidth < 1024) return;   // на мобиле высоты естественные
    var rows = rowsHost();
    var panel = document.getElementById('panel-calc');
    if (!rows || !panel || panel.offsetParent === null) return;   // вкладка скрыта
    var h = measureMixH();
    if (h > 300) rows.style.setProperty('--cx-card-h', Math.round(h) + 'px');
  }
  window.cxSyncCardHeight = syncCardHeight;
  var _rsTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(_rsTimer); _rsTimer = setTimeout(syncCardHeight, 150);
  });

  // ── Подвкладки результатов в сайдбаре ─────────────────────────────────────
  function showSub(kind) {
    var el = document.getElementById(kind === 'mix' ? 'sbSubMix' : 'sbSubMonthly');
    if (el) el.style.display = '';
  }
  function subShown(id) {
    var el = document.getElementById(id);
    return !!el && el.style.display !== 'none';
  }
  // Подсветка подпункта для вкладки calc зависит от РЕЖИМА, не только от вкладки
  function syncCalcSubActive() {
    if (typeof currentTab === 'undefined' || currentTab !== 'calc') return;
    var want = (mode === 'monthly' && subShown('sbSubMonthly')) ? 'calc-monthly' : 'calc-portfolio';
    document.querySelectorAll('.sb-sub').forEach(function (s) {
      s.classList.toggle('active', s.getAttribute('data-sub') === want);
    });
  }

  // ── Переключение режима ──────────────────────────────────────────────────
  function setMode(m) {
    mode = m;
    var b = document.body;
    b.classList.toggle('cxm-choose', m === 'choose');
    b.classList.toggle('cxm-mix', m === 'mix');
    b.classList.toggle('cxm-monthly', m === 'monthly');
    if (m === 'monthly') {
      // пересчёт купонного калькулятора (как делал switchTab('monthly')),
      // но НЕ затираем восстановленные вручную настроенные количества
      if (!miStarted) {
        setTimeout(function () {
          try { if (typeof distributeMonthlyInvestment === 'function') distributeMonthlyInvestment(); } catch (e) {}
        }, 60);
      }
    }
    if (m === 'choose') refreshResumeBadges();               // актуализируем бейджи «Продолжить»
    if (m === 'mix' && typeof ndSyncCtaState === 'function') ndSyncCtaState();  // состояние кнопки «Рассчитать»
    requestAnimationFrame(syncCardHeight);
    syncCalcSubActive();
    var ca = document.getElementById('contentArea');
    if (ca) ca.scrollTop = 0;
  }
  window.cxSetMode = setMode;

  // Запрос режима извне (виджеты «Ежемесячный доход», легаси-роут /monthly)
  window.cxRequestMode = function (m) {
    if (ready) setMode(m); else pending = m;
  };
  window.cxGoMonthly = function () {
    window.cxRequestMode('monthly');
    if (typeof switchTab === 'function') switchTab('calc');
  };

  // ── Персист купонного расчёта (calc_monthly_v1) ──────────────────────────
  function moSave() {
    if (!miStarted) return;
    try {
      var qm = {};
      try { if (typeof bondQtyMap !== 'undefined' && bondQtyMap) qm = bondQtyMap; } catch (e) {}
      var main = document.getElementById('monthlySumInput');
      var prev = null;
      try { prev = JSON.parse(localStorage.getItem(MO_KEY)); } catch (e) {}
      localStorage.setItem(MO_KEY, JSON.stringify({
        started: 1,
        sum: main ? (parseInt(main.value, 10) || 0) : 0,
        qty: qm,
        // startedTs — дата расчёта (ставится один раз, показывается на витрине);
        // ts обновляется на каждой правке корзины
        startedTs: (prev && prev.startedTs) || Date.now(),
        ts: Date.now()
      }));
    } catch (e) {}
  }
  var _moTimer = null;
  function moScheduleSave() { clearTimeout(_moTimer); _moTimer = setTimeout(moSave, 800); }

  function moRestore() {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(MO_KEY)); } catch (e) {}
    if (!st || !st.started) return;
    miStarted = true;
    showSub('monthly');
    var tries = 0;
    (function attempt() {
      var rowsReady = !!document.querySelector('#calc-bonds-input-list .mi5-bond');
      var pricesOk = false;
      try {
        pricesOk = (typeof monthlyIncomeBonds !== 'undefined') && monthlyIncomeBonds &&
          monthlyIncomeBonds.some(function (b) { return b && (+b.nkd > 0); });
      } catch (e) {}
      // ждём и строки, и цены MOEX (после них distributeMonthlyInvestment уже отработал);
      // по таймауту (~20с) применяем что есть
      if (!rowsReady || (!pricesOk && tries < 50)) {
        if (++tries < 120) setTimeout(attempt, 400);
        return;
      }
      try {
        var main = document.getElementById('monthlySumInput');
        if (st.sum > 0 && main) main.value = st.sum;
        if (st.qty && typeof bondQtyMap !== 'undefined') {
          Object.keys(st.qty).forEach(function (t) { bondQtyMap[t] = Math.max(0, +st.qty[t] || 0); });
          if (typeof renderMonthlyIncomeCards === 'function') renderMonthlyIncomeCards();
        }
        if (typeof recalcCustomCoupons === 'function') recalcCustomCoupons();
        // интро уже пройдено — открываем рабочее состояние
        var ov = document.getElementById('miStartOverlay');
        if (ov) { ov.classList.add('is-out'); ov.style.display = 'none'; }
        var mb = document.getElementById('miMoreBtn');
        if (mb) mb.classList.remove('is-hidden');
        var cb = document.getElementById('miCreatePfBtn');
        if (cb) cb.classList.remove('is-hidden');
      } catch (e) {}
    })();
  }

  // ── Тихое восстановление смешанного расчёта (app-state + calcDone) ──────
  function mixRestore() {
    var st = null;
    try { st = JSON.parse(localStorage.getItem('msolominа_state')); } catch (e) {}
    if (!st || !st.calcDone) return;
    var tries = 0;
    (function attempt() {
      var sumOk = false, feeOk = false, dataOk = false;
      try { sumOk = (typeof getSumInputValue === 'function') && getSumInputValue() >= 100000; } catch (e) {}
      try { feeOk = (typeof isFeeSelected !== 'undefined') && isFeeSelected; } catch (e) {}
      try { dataOk = (typeof bonds !== 'undefined') && bonds && bonds.length > 0; } catch (e) {}
      if (!(sumOk && feeOk && dataOk)) {
        if (++tries < 60) setTimeout(attempt, 500);
        return;
      }
      try {
        window._cxSilentCalc = true;   // гасит switchTab('portfolio') внутри расчёта
        if (typeof calculateAndShowPortfolio === 'function') calculateAndShowPortfolio();
      } catch (e) {} finally {
        window._cxSilentCalc = false;
      }
    })();
  }

  // ── Обёртки над штатными функциями (classic-скрипты: глобальные биндинги
  //    разрешаются в момент вызова, поэтому переприсваивание перехватывает
  //    и внутренние вызовы data.js/webapp-tabs.js) ──────────────────────────
  function installWraps() {
    if (typeof window.miStartCalc === 'function' && !window.miStartCalc._cx) {
      var _oStart = window.miStartCalc;
      window.miStartCalc = function () {
        _oStart.apply(this, arguments);
        miStarted = true;
        showSub('monthly');
        moSave();
        syncCalcSubActive();
      };
      window.miStartCalc._cx = true;
    }
    if (typeof window.recalcCustomCoupons === 'function' && !window.recalcCustomCoupons._cx) {
      var _oRecalc = window.recalcCustomCoupons;
      window.recalcCustomCoupons = function () {
        _oRecalc.apply(this, arguments);
        if (miStarted) moScheduleSave();
      };
      window.recalcCustomCoupons._cx = true;
    }
    if (typeof window.calculateAndShowPortfolio === 'function' && !window.calculateAndShowPortfolio._cx) {
      var _oCalc = window.calculateAndShowPortfolio;
      window.calculateAndShowPortfolio = function () {
        _oCalc.apply(this, arguments);
        try {
          if (typeof isPortfolioCalculated !== 'undefined' && isPortfolioCalculated) {
            showSub('mix');
            // дату ставим только за настоящий расчёт: mixRestore прогоняет эту
            // же функцию при каждой загрузке и сдвинул бы её на «сегодня»
            if (!window._cxSilentCalc) markMixCalcTs();
          }
        } catch (e) {}
      };
      window.calculateAndShowPortfolio._cx = true;
    }
    // Оборачиваем switchTab, а не sbSyncActive: sidebar.js вызывает свою
    // ЛОКАЛЬНУЮ sbSyncActive из замыкания, переприсваивание window.sbSyncActive
    // внутренний вызов не перехватило бы. Наш wrap ставится на DOMContentLoaded —
    // он самый внешний (после route-hash) и выполняется после всей цепочки.
    if (typeof window.switchTab === 'function' && !window.switchTab._cx) {
      var _oTab = window.switchTab;
      window.switchTab = function (tabId) {
        _oTab.apply(this, arguments);
        if (typeof currentTab !== 'undefined' && currentTab === 'calc') {
          syncCalcSubActive();                       // подсветка подпункта по режиму
          requestAnimationFrame(syncCardHeight);     // вкладка видима — замер эталона
        }
      };
      window.switchTab._cx = true;
    }
  }

  function haptic(kind) {
    try {
      var h = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
      if (h) h.impactOccurred(kind || 'light');
    } catch (e) {}
  }

  // ── init: после сборки r5-каркаса (calc-r5.js) ───────────────────────────
  var tries = 0;
  function init() {
    if (!moveMonthly() || !buildChooser()) {
      if (++tries < 40) setTimeout(init, 60);
      return;
    }
    buildBackBtn();
    installWraps();
    ready = true;
    setMode(pending || 'choose');
    pending = null;
    moRestore();
    mixRestore();
    syncCardHeight();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }
})();
