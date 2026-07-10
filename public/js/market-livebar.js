/* ============================================================================
   МОДУЛЬ «КНОПКИ ВКЛАДКИ РЫНОК» (переходы к терминалам в глобальной шапке сайта)
   ----------------------------------------------------------------------------
   Раньше здесь была и тёмная LIVE-полоска, и рыночная лента, вшитая в фон топ-бара
   (#topBarMktMarket). По «премиальному» решению лента убрана с ВСЕХ вкладок
   (css/portfolios.css: .topbar-tab-market { display:none !important }), поэтому её
   рендер и ежесекундный тик здесь тоже удалены — они обновляли навсегда скрытый
   контейнер вхолостую. Осталось только то, что видно: кнопки-ссылки «Все акции» и
   «Облигации» в #topBarMktActions (.topbar-tab-actions), которые ведут в терминалы.

   Грузится ПОСЛЕДНИМ, чтобы обёртка switchTab была внешней. Если понадобится
   вернуть ленту — история в git; стили .tbmk-* в portfolios.css сохранены.
   ========================================================================== */
(function () {
    'use strict';

    function actionsHost() { return document.getElementById('topBarMktActions'); }
    function isActive() { var p = document.getElementById('panel-market'); return !!(p && p.classList.contains('active')); }

    function hide() {
        var a = actionsHost(); if (a) { a.style.display = 'none'; a.innerHTML = ''; }
    }

    // Переходы к таблицам-терминалам — лёгкие кнопки-ссылки со стрелкой,
    // а не тёмные CTA (это навигация, а не главное действие вкладки)
    function renderActions() {
        var host = actionsHost(); if (!host) return;
        var GO = '<svg class="tbmk-go-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        host.innerHTML =
            '<button class="tbmk-go" onclick="switchTab(\'market-stocks\')" title="Таблица всех акций с показателями">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' +
                '<span>Все акции</span>' + GO + '</button>' +
            '<button class="tbmk-go" onclick="switchTab(\'market-bonds\')" title="Таблица всех облигаций">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10"/><path d="M7 13h6"/></svg>' +
                '<span>Облигации</span>' + GO + '</button>';
        host.style.display = 'flex';
    }

    // Показываем кнопки при заходе на «Рынок», прячем при уходе
    var _origSwitch = window.switchTab;
    window.switchTab = function (tabId) {
        var r = _origSwitch ? _origSwitch.apply(this, arguments) : undefined;
        if (tabId === 'market') renderActions();
        else hide();
        return r;
    };

    document.addEventListener('DOMContentLoaded', function () {
        if (isActive()) renderActions();
    });
})();
