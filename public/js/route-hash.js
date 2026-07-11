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

    // 'dashboard' временно исключён — раздел скрыт (см. goHome в webapp-tabs.js)
    var VALID = ['home', 'portfolios', 'calc', 'portfolio',
                 'rebalance', 'market', 'market-stocks', 'market-bonds',
                 'monthly', 'backtest', 'admin'];

    // Кроме встроенных, валидны свои вкладки админа (tab-gates.js): их ключи
    // приходят из конфига, панель #panel-<key> создаётся динамически. Прямая
    // загрузка /<key> должна восстанавливать вкладку — сверяемся с tabGates и
    // с фактически существующей панелью.
    function isValidTab(t) {
        if (VALID.indexOf(t) !== -1) return true;
        try {
            var custom = window.tabGates && window.tabGates.getCustom && window.tabGates.getCustom();
            if (custom && custom[t]) return true;
        } catch (e) {}
        return !!document.getElementById('panel-' + t);
    }

    function tabFromPath() {
        var t = location.pathname.replace(/^\//, '').replace(/\/$/, '');
        return isValidTab(t) ? t : null;
    }

    function pathForTab(tabId) {
        return tabId === 'home' ? '/' : '/' + tabId;
    }

    // Флаг: сейчас переключаемся ПО адресу, обратно в URL не пишем
    var applyingPath = false;

    var _prevSwitchTab = window.switchTab;
    window.switchTab = function(tabId) {
        _prevSwitchTab(tabId);
        if (!applyingPath && isValidTab(tabId) && tabFromPath() !== tabId) {
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

    // Восстановление вкладки при загрузке/обновлении страницы.
    // СИНХРОННО, без setTimeout: скрипт последний, все модули уже отработали
    // свои DOMContentLoaded-хендлеры, а переключение до первого пейнта убирает
    // мигание Главной перед целевой вкладкой (бесшовный заход по прямой ссылке
    // и после reload при входе). Если вкладку уже переключил кто-то раньше
    // (стартовый раздел из настроек кабинета) — не дёргаем повторно.
    document.addEventListener('DOMContentLoaded', function() {
        var t = tabFromPath();
        if (!t || t === 'home') return;
        if (typeof currentTab !== 'undefined' && t === currentTab) return;
        applyingPath = true;
        try { window.switchTab(t); } finally { applyingPath = false; }
    });
})();
