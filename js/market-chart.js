/* ============================================================================
   МОДУЛЬ «ГРАФИК ИНДЕКСА МОСБИРЖИ» — вкладка Рынок
   ----------------------------------------------------------------------------
   Встраивает интерактивный advanced-chart TradingView (символ RUS:IRUS = IMOEX)
   в карточку #mkChartBody на вкладке «Рынок». Грузится ПОСЛЕДНИМ (после
   stock-terminal.js), чтобы его обёртки switchTab/toggleTheme были внешними.

   Особенности:
   - ленивая инициализация: виджет строится только при ПЕРВОМ заходе на вкладку
     «Рынок» (внешний скрипт TradingView не тянется на старте приложения);
   - тема (день/ночь) и фон/сетка подбираются под оформление приложения;
   - при переключении темы виджет пересобирается под новую палитру.
   ========================================================================== */
(function () {
    'use strict';

    var TV_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    var built = false;     // виджет уже построен
    var curTheme = null;   // тема, под которую он построен ('light' | 'dark')

    function isDark() { return document.body.classList.contains('dark-mode'); }
    function theme() { return isDark() ? 'dark' : 'light'; }

    // Конфиг виджета — повторяет присланный пользователем, с подгонкой под тему
    // приложения (фон/сетка) и autosize вместо фиксированных width/height.
    function cfg(t) {
        var dark = (t === 'dark');
        return {
            autosize: true,
            symbol: 'RUS:IRUS',
            interval: 'W',
            timezone: 'Europe/Moscow',
            theme: dark ? 'dark' : 'light',
            style: '1',
            locale: 'ru',
            allow_symbol_change: true,
            calendar: false,
            details: false,
            hide_side_toolbar: true,
            hide_top_toolbar: false,
            hide_legend: false,
            hide_volume: false,
            hotlist: false,
            save_image: true,
            withdateranges: false,
            backgroundColor: dark ? '#1d2734' : '#ffffff',
            gridColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(46,46,46,0.06)',
            watchlist: [],
            compareSymbols: [],
            studies: ['Volume@tv-basicstudies'],
            support_host: 'https://www.tradingview.com'
        };
    }

    // Полностью (пере)собирает разметку виджета. Внешний скрипт TradingView
    // читает свой собственный textContent как конфиг и рисует график в
    // соседний .tradingview-widget-container__widget.
    function build() {
        var host = document.getElementById('mkChartBody');
        if (!host) return;
        var t = theme();
        host.innerHTML = '';

        var container = document.createElement('div');
        container.className = 'tradingview-widget-container';

        var widget = document.createElement('div');
        widget.className = 'tradingview-widget-container__widget';

        var copy = document.createElement('div');
        copy.className = 'tradingview-widget-copyright';
        copy.innerHTML = '<a href="https://ru.tradingview.com/symbols/RUS-IRUS/" rel="noopener nofollow" target="_blank">' +
                         '<span class="blue-text">Track all markets on TradingView</span></a>';

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = TV_SRC;
        script.async = true;
        script.innerHTML = JSON.stringify(cfg(t));

        container.appendChild(widget);
        container.appendChild(copy);
        container.appendChild(script);
        host.appendChild(container);

        curTheme = t;
        built = true;
    }

    function ensure() { if (!built) build(); }

    function refreshTheme() {
        if (!built) return;
        if (theme() !== curTheme) build(); // пересобрать под новую тему
    }

    // Лениво строим при первом заходе на «Рынок»
    var _origSwitch = window.switchTab;
    window.switchTab = function (tabId) {
        var r = _origSwitch ? _origSwitch.apply(this, arguments) : undefined;
        if (tabId === 'market') setTimeout(ensure, 0);
        return r;
    };

    // Пересобрать под тему при переключении день/ночь
    var _origToggle = window.toggleTheme;
    window.toggleTheme = function () {
        var r = _origToggle ? _origToggle.apply(this, arguments) : undefined;
        setTimeout(refreshTheme, 0);
        return r;
    };

    // Если приложение стартовало уже на вкладке «Рынок»
    document.addEventListener('DOMContentLoaded', function () {
        var p = document.getElementById('panel-market');
        if (p && p.classList.contains('active')) setTimeout(ensure, 300);
    });
})();
