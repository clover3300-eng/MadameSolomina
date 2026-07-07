/* ============================================
   Роутинг вкладок по настоящим путям: /market, /portfolios, …
   Держит текущую вкладку в URL: обновление страницы (F5)
   возвращает на то же место, кнопки «назад/вперёд» браузера
   переключают вкладки, ссылкой можно поделиться.
   Прямая загрузка любого пути отдаётся Cloudflare Pages как
   index.html через _redirects (SPA-фолбэк).
   Грузится ПОСЛЕДНИМ в index.html — оборачивает уже
   полностью декорированный window.switchTab.
   ============================================ */
(function() {
    'use strict';

    var VALID = ['home', 'dashboard', 'portfolios', 'calc', 'portfolio',
                 'rebalance', 'market', 'market-stocks', 'market-bonds',
                 'monthly', 'backtest'];

    function tabFromPath() {
        var t = location.pathname.replace(/^\//, '').replace(/\/$/, '');
        return VALID.indexOf(t) !== -1 ? t : null;
    }

    function pathForTab(tabId) {
        return tabId === 'home' ? '/' : '/' + tabId;
    }

    // Флаг: сейчас переключаемся ПО адресу, обратно в URL не пишем
    var applyingPath = false;

    var _prevSwitchTab = window.switchTab;
    window.switchTab = function(tabId) {
        _prevSwitchTab(tabId);
        if (!applyingPath && VALID.indexOf(tabId) !== -1 && tabFromPath() !== tabId) {
            history.pushState({ tab: tabId }, '', pathForTab(tabId));
        }
    };

    // Кнопки «назад/вперёд» браузера
    window.addEventListener('popstate', function() {
        var t = tabFromPath() || 'home';
        if (t === currentTab) return;
        applyingPath = true;
        try { window.switchTab(t); } finally { applyingPath = false; }
    });

    // Восстановление вкладки при загрузке/обновлении страницы
    document.addEventListener('DOMContentLoaded', function() {
        var t = tabFromPath();
        if (!t || t === 'home') return;
        // Даём отработать DOMContentLoaded-инициализации остальных модулей
        setTimeout(function() {
            applyingPath = true;
            try { window.switchTab(t); } finally { applyingPath = false; }
        }, 0);
    });
})();
