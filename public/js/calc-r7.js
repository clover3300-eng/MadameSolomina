// ===== R7 · «ПУЛЬТ»: правки, которые нельзя сделать одним css =====
// Слой ПОСЛЕ calc-r6.js. Движки не трогает: водопад стратегий, квиз Vanguard,
// mi5-калькулятор купонов и персисты calc-mode работают как работали.
//
// Раунд переносит навигацию «Расчёта» в колонку сайдбара (js/sidebar-ctx.js →
// calcModel), поэтому здесь остаётся то, что касается рабочей площади:
//
//  · «Купоны каждый месяц» — правая карточка режима monthly получает
//    нормальный заголовок вместо иконки-плашки с кикером, а кнопка
//    «Подробнее» уезжает из-над графика в CTA-ряд под именем
//    «Подробный график». Пара «баннер ↔ график выплат» и так живёт в одном
//    слоте (toggleScheduleView), но выглядела как две разные карточки.
//  · Узлы только ПЕРЕЕЗЖАЮТ, их не пересоздают: data.js пишет в #ndIbSub,
//    #ndIbMonthly, #ndIbYearly, #ndIbYield по id, и потеря любого из них
//    тихо убила бы обновление чисел.

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // ── Заголовок карточки купонов ────────────────────────────────────────────
  // Было: круглая оранжевая плашка «₽» + кикер «Купоны ОФЗ» + строка «с N ₽
  // вложений». Стало: заголовок карточки как у всех остальных, приписка
  // справа — ставка налога, а сумма вложений уходит под крупное число.
  function dressBanner() {
    var head = document.querySelector('#miBannerCard .mi5-cb-head');
    if (!head || head._r7) return;
    var sub = $('ndIbSub');
    if (!sub) return;              // разметка ещё не приехала
    head._r7 = true;

    head.classList.add('cxr7-head');
    head.innerHTML = '';
    var t = document.createElement('div');
    t.className = 'cxr7-ttl';
    t.textContent = 'Купоны каждый месяц';
    var a = document.createElement('span');
    a.className = 'cx-aside';
    a.id = 'cxMoTax';
    head.appendChild(t);
    head.appendChild(a);

    // «с N ₽ вложений» переезжает под крупное число, узел #ndIbSub цел
    var lead = document.querySelector('#miBannerCard .mi5-cb-lead');
    var m = document.querySelector('#miBannerCard .mi5-cb-m');
    if (lead && m && m.parentNode !== lead) lead.appendChild(m);
    syncTax();
  }

  // Ставка налога — из того же сегмента, что читает mi5-калькулятор
  function syncTax() {
    var a = $('cxMoTax');
    if (!a) return;
    var r = 0.13;
    try { if (typeof customTax === 'number') r = customTax; } catch (e) {}
    var tx = r > 0 ? ('после НДФЛ ' + Math.round(r * 100) + '%') : 'без налога';
    if (a.textContent !== tx) a.textContent = tx;
  }

  // ── «Подробнее» → «Подробный график» в CTA-ряду ───────────────────────────
  // Кнопка висела поверх шапки мини-графика и читалась как ярлык на графике,
  // а не как переход. Её место — рядом с главным действием карточки.
  function placeMoreBtn() {
    var btn = $('miMoreBtn');
    var row = $('cxMoCta');                 // ряд строит calc-r6.js
    if (!btn || !row) return;
    if (!btn._r7) {
      btn._r7 = true;
      btn.classList.add('cxr7-more');
      var tx = btn.lastChild;               // текстовый узел после иконки
      if (tx && tx.nodeType === 3) tx.nodeValue = ' Подробный график';
    }
    // Ряд ездит между баннером и графиком выплат — кнопка едет за ним, но
    // только пока виден баннер: на самом графике переход в него бессмыслен.
    var banner = $('miBannerCard');
    var onBanner = banner && !banner.classList.contains('is-hidden');
    if (onBanner) {
      if (btn.parentNode !== row) row.appendChild(btn);
    } else if (btn.parentNode === row) {
      var home = document.querySelector('#miBannerCard .mi5-cb-mini-head');
      if (home) home.appendChild(btn);
    }
  }

  function tick() {
    dressBanner();
    placeMoreBtn();
    syncTax();
  }

  // ── Обёртки: тик после каждой перерисовки монтли-блока ───────────────────
  function installWraps() {
    if (typeof window.toggleScheduleView === 'function' && !window.toggleScheduleView._r7) {
      var _oToggle = window.toggleScheduleView;
      window.toggleScheduleView = function () {
        _oToggle.apply(this, arguments);
        tick();
      };
      window.toggleScheduleView._r7 = true;
    }
    if (typeof window.recalcCustomCoupons === 'function' && !window.recalcCustomCoupons._r7) {
      var _oRe = window.recalcCustomCoupons;
      window.recalcCustomCoupons = function () {
        _oRe.apply(this, arguments);
        syncTax();
      };
      window.recalcCustomCoupons._r7 = true;
    }
    if (typeof window.miStartCalc === 'function' && !window.miStartCalc._r7) {
      var _oStart = window.miStartCalc;
      window.miStartCalc = function () {
        _oStart.apply(this, arguments);
        tick();
      };
      window.miStartCalc._r7 = true;
    }
  }

  // ── init ──────────────────────────────────────────────────────────────────
  var tries = 0;
  function init() {
    installWraps();
    tick();
    // Ряд CTA появляется только при входе в режим monthly, а сама разметка
    // mi5 переезжает в «Расчёт» асинхронно — добираем несколько попыток.
    if (++tries < 60) setTimeout(init, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 120); });
  } else {
    setTimeout(init, 120);
  }

  window.r7Tick = tick;
})();
