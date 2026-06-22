// ===== R5 · РЕДИЗАЙН ВКЛАДКИ «РАСЧЁТ» =====
// Двухкарточный layout (Капитал / Распределение) + встроенный мини-квиз.
//
// Принцип: НЕ дублируем рабочую логику калькулятора. Существующие блоки
// (#ndInputHero — сумма, .fee-selector-unified — комиссия, #ndStratCard —
// стратегия с водопадом и кастомным слайдером) физически ПЕРЕНОСЯТСЯ в новый
// каркас из двух карточек. Все обработчики/ID сохраняются, меняется только
// раскладка и оформление (css/calc-r5.css). Тот же приём «переноса узлов»,
// что использует populatePanels() для портфеля.
//
// Мини-квиз переиспользует движок теста Vanguard (VG_Q, vgGetProfile,
// VG_STRAT_MAP) — classic-скрипты делят общий global scope, поэтому функции и
// переменные из vanguard-test.js здесь доступны напрямую.

(function () {
  'use strict';

  // ── Сборка двухкарточного каркаса ─────────────────────────────────────────
  function assembleCalcR5() {
    var host = document.getElementById('calcPaneContent');
    var section = document.getElementById('calcSection');
    if (!host || !section) return false;
    if (document.getElementById('r5Split')) return true; // уже собрано

    // Исходные функциональные блоки (внутри #calcSection)
    var hero    = document.getElementById('ndInputHero');                 // сумма
    var fee     = section.querySelector('.fee-selector-unified');         // комиссия
    var moex    = section.querySelector('.nd-moex-strip');                // плашка MOEX
    var strat   = document.getElementById('ndStratCard');                 // стратегия
    var hdr     = section.querySelector('.nd-hdr');                        // старая шапка
    var banner  = section.querySelector('.nd-vg-banner');                 // старый баннер теста

    // Каркас: .cx-rows > .cx-split > [card01, card02]
    var rows = el('div', 'cx-rows r5');
    var split = el('div', 'cx-split');
    split.id = 'r5Split';

    var cap = pkCard('01', 'Капитал', 'Сумма и параметры', false);
    var dist = pkCard('02', 'Распределение', 'Стратегия', true);

    split.appendChild(cap.card);
    split.appendChild(dist.card);
    rows.appendChild(split);
    // Каркас — первым элементом в калькуляторной области
    host.insertBefore(rows, host.firstChild);

    // ── Карточка 01 · Капитал ──
    var capCenter = el('div', 'cx-cap-center');
    if (hero) { hero.classList.add('cx-amount-host'); capCenter.appendChild(hero); }
    var capParams = el('div', 'cx-cap-params');
    if (fee)  capParams.appendChild(fee);
    if (moex) capParams.appendChild(moex);
    capCenter.appendChild(capParams);
    cap.body.appendChild(capCenter);

    // ── Карточка 02 · Распределение ──
    if (strat) {
      strat.classList.add('cx-strat-host');
      // нейтрализуем сворачивание всей карточки по клику — список теперь всегда открыт
      strat.removeAttribute('onclick');
      strat.onclick = function (e) { e.stopPropagation(); };
      dist.body.appendChild(strat);
      forceOpenStrategy(strat);
    }
    // Точка входа в квиз + сам квиз
    dist.body.appendChild(buildQuizEntry());
    dist.body.appendChild(buildQuiz());

    // Прячем старьё
    [hdr, banner].forEach(function (n) { if (n) n.style.display = 'none'; });
    // Пустую обёртку параметров (из неё забрали комиссию и стратегию) — схлопываем
    var oldParams = section.querySelector('.nd-params-card');
    if (oldParams && oldParams.children.length === 0) oldParams.style.display = 'none';
    section.classList.add('r5-drained');

    return true;
  }

  // Раскрыть блок стратегии и держать водопад всегда видимым
  function forceOpenStrategy(strat) {
    var block = document.getElementById('ndStratBlock');
    if (block) block.style.display = 'block';
    strat.classList.add('open');
    if (typeof ndBuildWF === 'function') { try { ndBuildWF(); } catch (e) {} }
    var wf = document.getElementById('waterfallContainer');
    if (wf) wf.classList.add('show'); // CSS в r5 держит список открытым независимо от .show
  }

  // ── Атомы каркаса ─────────────────────────────────────────────────────────
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function pkCard(no, kicker, title, active) {
    var card = el('div', 'pk-card' + (active ? ' act' : ''));
    var clip = el('div', 'wm-clip');
    var wm = el('span', 'wm'); wm.textContent = no; clip.appendChild(wm);
    var k = el('span', 'k'); k.textContent = kicker;
    var t = el('span', 't'); t.textContent = title;
    var ct = el('div', 'ct');
    card.appendChild(clip); card.appendChild(k); card.appendChild(t); card.appendChild(ct);
    return { card: card, body: ct };
  }

  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
  var SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z"/></svg>';
  var BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>';

  function buildQuizEntry() {
    var cta = el('div', 'r-cta');
    cta.id = 'r5QuizEntry';
    cta.innerHTML =
      '<span class="ic">' + SPARK + '</span>' +
      '<span class="tx"><b>Не знаете, какую выбрать?</b><span>Подберём за 2 минуты по тесту</span></span>' +
      '<span class="btn">Тест ' + ARROW + '</span>';
    cta.addEventListener('click', openQuiz);
    return cta;
  }

  function buildQuiz() {
    var q = el('div', 'r-quiz');
    q.id = 'r5Quiz';
    q.style.display = 'none';
    q.innerHTML =
      '<div class="qhead">' +
        '<span class="r-back sm" id="r5QuizBack">' + BACK + '</span>' +
        '<div class="qprog">' +
          '<div class="r-prog"><i id="r5QuizProg"></i></div>' +
          '<span class="qno" id="r5QuizNo"></span>' +
        '</div>' +
      '</div>' +
      '<h3 class="qq" id="r5QuizQ"></h3>' +
      '<div class="qopts" id="r5QuizOpts"></div>' +
      '<div class="qfoot"><span class="r-go" id="r5QuizNext"></span></div>';
    return q;
  }

  // ── Состояние и логика квиза ──────────────────────────────────────────────
  var qi = 0;           // индекс вопроса
  var answers = [];     // балл за каждый вопрос
  var picked = -1;      // выбранный вариант текущего вопроса

  function questions() { return (typeof VG_Q !== 'undefined') ? VG_Q : []; }

  function openQuiz() {
    if (!questions().length) return;
    qi = 0; answers = []; picked = -1;
    var quiz = document.getElementById('r5Quiz');
    var card = quiz && quiz.closest('.pk-card');
    if (card) card.classList.add('quiz-on');
    if (quiz) quiz.style.display = 'flex';
    renderQ();
    bindQuizControls();
    haptic('light');
  }

  function closeQuiz() {
    var quiz = document.getElementById('r5Quiz');
    var card = quiz && quiz.closest('.pk-card');
    if (card) card.classList.remove('quiz-on');
    if (quiz) quiz.style.display = 'none';
  }

  var _bound = false;
  function bindQuizControls() {
    if (_bound) return; _bound = true;
    var back = document.getElementById('r5QuizBack');
    var next = document.getElementById('r5QuizNext');
    if (back) back.addEventListener('click', onBack);
    if (next) next.addEventListener('click', onNext);
  }

  function renderQ() {
    var Q = questions();
    var q = Q[qi];
    if (!q) return;
    var total = Q.length;
    var prog = document.getElementById('r5QuizProg');
    var no = document.getElementById('r5QuizNo');
    var qq = document.getElementById('r5QuizQ');
    var opts = document.getElementById('r5QuizOpts');
    var next = document.getElementById('r5QuizNext');

    if (prog) prog.style.width = Math.round(((qi + 1) / total) * 100) + '%';
    if (no) no.textContent = 'Вопрос ' + (qi + 1) + ' из ' + total;
    if (qq) qq.textContent = q.t;

    picked = (typeof answers[qi] === 'number') ? answers[qi]._idx : -1;
    if (opts) {
      opts.innerHTML = '';
      q.o.forEach(function (o, i) {
        var row = el('div', 'r-opt' + (i === picked ? ' sel' : ''));
        row.innerHTML = '<span class="rd"></span><span class="otx"><span class="ot">' + esc(o[0]) + '</span></span>';
        row.addEventListener('click', function () { pick(i, o[1], row); });
        opts.appendChild(row);
      });
    }
    if (next) {
      next.classList.toggle('is-off', picked < 0);
      next.innerHTML = (qi === total - 1 ? 'Готово' : 'Далее') + ' ' + ARROW;
    }
    // анимация появления
    var quiz = document.getElementById('r5Quiz');
    if (quiz) { quiz.classList.remove('q-anim'); void quiz.offsetWidth; quiz.classList.add('q-anim'); }
  }

  function pick(i, score, row) {
    picked = i;
    // помечаем ответ: храним и балл, и индекс варианта (для восстановления)
    var v = new Number(score); v._idx = i; answers[qi] = v;
    var opts = document.getElementById('r5QuizOpts');
    if (opts) Array.prototype.forEach.call(opts.children, function (c, j) { c.classList.toggle('sel', j === i); });
    var next = document.getElementById('r5QuizNext');
    if (next) next.classList.remove('is-off');
    haptic('light');
  }

  function onNext() {
    if (picked < 0) return;
    var total = questions().length;
    if (qi < total - 1) { qi++; renderQ(); }
    else finishQuiz();
  }

  function onBack() {
    if (qi === 0) { closeQuiz(); return; }
    qi--; renderQ();
  }

  function finishQuiz() {
    // суммарный балл → профиль (через движок Vanguard)
    var score = answers.reduce(function (s, a) { return s + (a ? +a : 0); }, 0);
    if (typeof window !== 'undefined') { try { window._vgScore = score; } catch (e) {} }
    try { _vgScore = score; } catch (e) {}
    var profile = (typeof vgGetProfile === 'function')
      ? vgGetProfile()
      : { name: 'Сбалансированный' };
    applyProfileStrategy(profile);
    closeQuiz();
    flashResult(profile);
    haptic('success');
  }

  // Применить стратегию профиля к существующему селектору стратегий
  function applyProfileStrategy(profile) {
    var map = (typeof VG_STRAT_MAP !== 'undefined') ? VG_STRAT_MAP : {};
    var s = map[profile.name] || { bonds: 50, t: 'Гармония' };

    if (s.t === 'Индивидуальная') {
      // кастомное соотношение — через тот же путь, что и слайдер «Своя»
      try { savedCustomBonds = s.bonds; savedCustomStocks = 100 - s.bonds; } catch (e) {}
      setVal('ratioSlider', s.bonds);
      setVal('customRatioSlider', s.bonds);
      if (typeof updateCustomSliderDisplay === 'function') { try { updateCustomSliderDisplay(s.bonds); } catch (e) {} }
      if (typeof updateMainCardUI === 'function') { try { updateMainCardUI(s.bonds, 'Индивидуальная', 'Ваша настройка'); } catch (e) {} }
      var cv = document.getElementById('ndStratCardVal'); if (cv) cv.textContent = 'Индивидуальная';
      if (typeof ndBuildWF === 'function') { try { ndBuildWF(); } catch (e) {} }
      if (typeof draw === 'function') { try { draw(); } catch (e) {} }
    } else if (typeof ND_STRATEGIES !== 'undefined' && typeof ndApplyStrategy === 'function') {
      var nd = ND_STRATEGIES.find(function (x) { return x.title === s.t; });
      if (nd) ndApplyStrategy(nd.bonds, nd.title, nd.subtitle);
    }
    // держим список открытым после применения
    var wf = document.getElementById('waterfallContainer');
    if (wf) wf.classList.add('show');
  }

  // Короткое подтверждение результата над списком стратегий
  function flashResult(profile) {
    var host = document.getElementById('r5QuizEntry');
    if (!host) return;
    var map = (typeof VG_STRAT_MAP !== 'undefined') ? VG_STRAT_MAP : {};
    var s = map[profile.name] || { t: 'Гармония' };
    host.classList.add('done');
    host.innerHTML =
      '<span class="ic ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span>' +
      '<span class="tx"><b>Профиль: ' + esc(profile.name) + '</b><span>Подобрана стратегия «' + esc(s.t) + '»</span></span>' +
      '<span class="btn ghost" id="r5QuizRetake">Заново</span>';
    var again = document.getElementById('r5QuizRetake');
    if (again) again.addEventListener('click', function (e) { e.stopPropagation(); resetEntry(); openQuiz(); });
  }

  function resetEntry() {
    var host = document.getElementById('r5QuizEntry');
    if (!host) return;
    host.classList.remove('done');
    host.innerHTML =
      '<span class="ic">' + SPARK + '</span>' +
      '<span class="tx"><b>Не знаете, какую выбрать?</b><span>Подберём за 2 минуты по тесту</span></span>' +
      '<span class="btn">Тест ' + ARROW + '</span>';
    host.addEventListener('click', openQuiz);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  function setVal(id, v) { var n = document.getElementById(id); if (n) n.value = v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function haptic(kind) {
    try {
      var h = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
      if (!h) return;
      if (kind === 'success') h.notificationOccurred('success'); else h.impactOccurred(kind || 'light');
    } catch (e) {}
  }

  // ── init: после populatePanels() ──────────────────────────────────────────
  function init() {
    if (!assembleCalcR5()) {
      // на случай гонки — повторить разок
      setTimeout(assembleCalcR5, 60);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }

  // экспорт для отладки/совместимости
  window.assembleCalcR5 = assembleCalcR5;
  window.r5OpenQuiz = openQuiz;
})();
