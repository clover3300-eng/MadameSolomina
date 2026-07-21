// ===== ПРАВЫЙ НИЖНИЙ УГОЛ: ОДИН СТЕКЛЯННЫЙ СТОЛБИК НА ВСЕ ПЛАВАЮЩИЕ КНОПКИ =====
// Общий компонент сайта (мокап «Портфели: панель управления → парящие кнопки»):
// вместо трёх отдельных кружков (тема, фон, «+ виджет») — одна стеклянная капсула
// #cornerStack. Сюда сами встают ГЛОБАЛЬНЫЕ кнопки: #bgFab (site-bg.js) и
// #themeFab (profile-menu.js) — оба модуля зовут cornerStack.ensure() и
// аппендятся внутрь, порядок сверху вниз держат order-правила в corner-stack.css.
// «Портфели» доливают СТРАНИЧНЫЕ кнопки (виджет/раскладки/замок) в слот #cstPage
// над чертой .cst-hr (pfxFabSync, portfolios-tabs.js): выше черты — страничное,
// ниже — глобальное.
// Файл обязан грузиться ДО site-bg.js и profile-menu.js (порядок тегов несущий).
(function () {
    'use strict';
    function ensure() {
        var s = document.getElementById('cornerStack');
        if (s) return s;
        if (!document.body) return null;
        s = document.createElement('div');
        s.id = 'cornerStack';
        // черта — div, не <hr>: у hr агрессивные UA-стили (margin/border), их
        // пришлось бы гасить; видимость гейтит CSS по активной вкладке
        s.innerHTML = '<div class="cst-page" id="cstPage"></div><div class="cst-hr" aria-hidden="true"></div>';
        document.body.appendChild(s);
        return s;
    }
    window.cornerStack = { ensure: ensure };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { ensure(); });
    else ensure();
})();
