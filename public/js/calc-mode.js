// ===== ОБЪЕДИНЁННАЯ ВКЛАДКА «РАСЧЁТ»: выбор типа портфеля =====
// «Расчёт портфеля» и «Ежемесячный доход» слиты в одну вкладку на базе
// «Расчёта». При входе показываются две карточки-вопрос (стиль pk-card из
// calc-r5): «Смешанный: акции + облигации» или «Только облигации: купоны
// каждый месяц». По ответу включается либо штатный r5-калькулятор, либо
// mi5-калькулятор купонов, который физически ПЕРЕНОСИТСЯ сюда из
// #panel-monthly (вся его логика в data.js работает по id и переезда не
// замечает; импорт в «Портфели» читает глобальные pfMonthlyBonds/bondQtyMap
// и _shoppingListData — тоже не зависит от места в DOM).
//
// Состояние = класс на <body>: cxm-choose / cxm-mix / cxm-monthly.
// Режим живёт в памяти страницы: после перезагрузки выбор задаётся заново.

(function () {
  'use strict';

  var mode = null;        // 'choose' | 'mix' | 'monthly'
  var pending = null;     // режим, запрошенный до инициализации (deep-link)
  var ready = false;

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

  // ── Карточки-вопрос ──────────────────────────────────────────────────────
  var MIX_IC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>';
  var MON_IC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>';
  var GO_IC  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

  function buildChooser() {
    if (document.getElementById('cxChooser')) return true;
    var rows = rowsHost();
    if (!rows) return false;

    var ch = document.createElement('div');
    ch.className = 'cx-split';
    ch.id = 'cxChooser';
    ch.innerHTML =
      // 01 — вопрос
      '<div class="pk-card">' +
        '<div class="wm-clip"><span class="wm">01</span></div>' +
        '<span class="k">Начало</span>' +
        '<span class="t">Какой портфель предпочитаете?</span>' +
        '<div class="ct">' +
          '<div class="cxm-opt mix" data-mode="mix">' +
            '<span class="ic">' + MIX_IC + '</span>' +
            '<span class="tx"><b>Смешанный: акции + облигации</b>' +
            '<span>Рост капитала — распределение по стратегии под ваш риск-профиль</span></span>' +
            '<span class="go">' + GO_IC + '</span>' +
          '</div>' +
          '<div class="cxm-opt mon" data-mode="monthly">' +
            '<span class="ic">' + MON_IC + '</span>' +
            '<span class="tx"><b>Только облигации: купоны каждый месяц</b>' +
            '<span>Набор ОФЗ, где выплаты приходят ежемесячно — как зарплата</span></span>' +
            '<span class="go">' + GO_IC + '</span>' +
          '</div>' +
          '<div class="cxm-note">Выбор можно изменить в любой момент — переключатель под карточками расчёта.</div>' +
        '</div>' +
      '</div>' +
      // 02 — подсказка
      '<div class="pk-card act">' +
        '<div class="wm-clip"><span class="wm">02</span></div>' +
        '<span class="k">Подсказка</span>' +
        '<span class="t">Чем они отличаются</span>' +
        '<div class="ct">' +
          '<div class="cxm-info mix" data-mode="mix">' +
            '<span class="bar"></span>' +
            '<div class="bd"><span class="nm">Смешанный портфель</span>' +
              '<ul>' +
                '<li>Акции Мосбиржи + ОФЗ в пропорции выбранной стратегии</li>' +
                '<li>Мини-тест риск-профиля подберёт стратегию за 2 минуты</li>' +
                '<li>Доход — рост цены акций, дивиденды и купоны</li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
          '<div class="cxm-info mon" data-mode="monthly">' +
            '<span class="bar"></span>' +
            '<div class="bd"><span class="nm">Купонный портфель</span>' +
              '<ul>' +
                '<li>6 выпусков ОФЗ с разными датами выплат</li>' +
                '<li>Купоны закрывают все 12 месяцев года — без пропусков</li>' +
                '<li>График выплат и средний доход в месяц</li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    rows.insertBefore(ch, rows.firstChild);

    // клик по варианту — включаем режим; hover подсвечивает блок справа
    ch.querySelectorAll('.cxm-opt').forEach(function (opt) {
      var m = opt.getAttribute('data-mode');
      opt.addEventListener('click', function () { setMode(m); haptic('light'); });
      opt.addEventListener('mouseenter', function () { hl(m, true); });
      opt.addEventListener('mouseleave', function () { hl(m, false); });
    });
    // блоки подсказки тоже кликабельны
    ch.querySelectorAll('.cxm-info').forEach(function (inf) {
      inf.style.cursor = 'pointer';
      inf.addEventListener('click', function () { setMode(inf.getAttribute('data-mode')); haptic('light'); });
    });
    function hl(m, on) {
      var inf = ch.querySelector('.cxm-info[data-mode="' + m + '"]');
      if (inf) inf.classList.toggle('hl', on);
    }
    return true;
  }

  // ── Виджет-переход mix → monthly (под кнопкой «Рассчитать портфель») ────
  function buildMixWidget() {
    if (document.getElementById('cxMonthlyWidget')) return;
    var bar = document.getElementById('calcCtaBar');
    if (!bar || !bar.parentNode) return;
    var w = document.createElement('div');
    w.id = 'cxMonthlyWidget';
    w.className = 'ms-nav-widget green';
    w.innerHTML =
      '<span class="ic">' + MON_IC + '</span>' +
      '<span class="tx"><b>Купоны каждый месяц</b>' +
      '<span>Портфель только из ОФЗ — выплаты приходят ежемесячно, как зарплата.</span></span>' +
      '<span class="go">' + GO_IC + '</span>';
    w.onclick = function () { setMode('monthly'); };
    bar.parentNode.insertBefore(w, bar.nextSibling);
  }

  // ── Переключение режима ──────────────────────────────────────────────────
  function setMode(m) {
    mode = m;
    var b = document.body;
    b.classList.toggle('cxm-choose', m === 'choose');
    b.classList.toggle('cxm-mix', m === 'mix');
    b.classList.toggle('cxm-monthly', m === 'monthly');
    if (m === 'monthly') {
      // пересчёт купонного калькулятора (как делал switchTab('monthly'))
      setTimeout(function () {
        try { if (typeof distributeMonthlyInvestment === 'function') distributeMonthlyInvestment(); } catch (e) {}
      }, 60);
    }
    var ca = document.getElementById('contentArea');
    if (ca) ca.scrollTop = 0;
  }
  window.cxSetMode = setMode;

  // Запрос режима извне (виджеты «Ежемесячный доход», легаси-роут /monthly):
  // если модуль ещё не инициализирован — запоминаем и применяем после.
  window.cxRequestMode = function (m) {
    if (ready) setMode(m); else pending = m;
  };
  // Быстрый переход в купонный режим из других вкладок
  window.cxGoMonthly = function () {
    window.cxRequestMode('monthly');
    if (typeof switchTab === 'function') switchTab('calc');
  };

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
    buildMixWidget();
    ready = true;
    setMode(pending || 'choose');
    pending = null;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }
})();
