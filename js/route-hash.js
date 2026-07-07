/* ============================================
   Хэш-роутинг вкладок: #market, #portfolios, …
   Держит текущую вкладку в URL: обновление страницы (F5)
   возвращает на то же место, кнопки «назад/вперёд» браузера
   переключают вкладки, ссылкой можно поделиться.
   Грузится ПОСЛЕДНИМ в index.html — оборачивает уже
   полностью декорированный window.switchTab.
   ============================================ */
(function() {
    'use strict';

    var VALID = ['home', 'dashboard', 'portfolios', 'calc', 'portfolio',
                 'rebalance', 'market', 'market-stocks', 'market-bonds',
                 'monthly', 'backtest'];

    function tabFromHash() {
        var t = (location.hash || '').replace(/^#\/?/, '');
        return VALID.indexOf(t) !== -1 ? t : null;
    }

    // Флаг: сейчас переключаемся ПО хэшу, обратно в URL не пишем
    var applyingHash = false;

    var _prevSwitchTab = window.switchTab;
    window.switchTab = function(tabId) {
        _prevSwitchTab(tabId);
        if (!applyingHash && VALID.indexOf(tabId) !== -1 && tabFromHash() !== tabId) {
            // Стартовую «Главную» не пишем в URL, чтобы не засорять адрес
            if (tabId === 'home' && !location.hash) return;
            location.hash = tabId;
        }
    };

    // Кнопки «назад/вперёд» браузера
    window.addEventListener('hashchange', function() {
        var t = tabFromHash();
        if (!t || t === currentTab) return;
        applyingHash = true;
        try { window.switchTab(t); } finally { applyingHash = false; }
    });

    // Восстановление вкладки при загрузке/обновлении страницы
    document.addEventListener('DOMContentLoaded', function() {
        var t = tabFromHash();
        if (!t || t === 'home') return;
        // Даём отработать DOMContentLoaded-инициализации остальных модулей
        setTimeout(function() {
            applyingHash = true;
            try { window.switchTab(t); } finally { applyingHash = false; }
        }, 0);
    });
})();
