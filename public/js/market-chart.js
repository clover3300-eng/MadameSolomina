/* ============================================================================
   МОДУЛЬ «ГРАФИК ИНДЕКСА МОСБИРЖИ» — вкладка Рынок
   ----------------------------------------------------------------------------
   Advanced-chart TradingView (символ RUS:IRUS = IMOEX, МЕСЯЧНЫЙ таймфрейм).
   Отдельной карточки на странице больше нет: график живёт ВНУТРИ карточки
   тепловой карты (#mhCard) и подменяет её холст по кнопке в статбаре
   (см. js/market-heatmap.js). Этот модуль только собирает виджет:

     window.mkChartMount(host) — построить график в переданном контейнере
       (ленивая загрузка: внешний скрипт TradingView тянется при первом вызове;
        повторные вызовы — no-op, пока не сменилась тема).
     window.mkChartUnmount() — снести виджет (iframe TradingView со своим
       рендер-циклом): зовётся при уходе со вкладки «Рынок». Держать его живым
       в фоне незачем — это самый тяжёлый объект страницы.

   При переключении темы (день/ночь) смонтированный виджет пересобирается
   под новую палитру. Грузится ПЕРЕД market-heatmap.js.
   ========================================================================== */
(function () {
    'use strict';

    var TV_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    var hostEl = null;     // контейнер, в котором смонтирован виджет
    var curTheme = null;   // тема, под которую он построен ('light' | 'dark')

    function isDark() { return document.body.classList.contains('dark-mode'); }
    function theme() { return isDark() ? 'dark' : 'light'; }

    // Конфиг виджета: месячные свечи на всю доступную историю, autosize под хост
    function cfg(t) {
        var dark = (t === 'dark');
        return {
            autosize: true,
            symbol: 'RUS:IRUS',
            interval: 'M',  // месячный таймфрейм
            range: 'ALL',   // вся доступная история заполняет ширину виджета
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

    // Полностью (пере)собирает разметку виджета в hostEl. Внешний скрипт
    // TradingView читает свой textContent как конфиг и рисует график в
    // соседний .tradingview-widget-container__widget.
    function build() {
        if (!hostEl) return;
        var t = theme();
        hostEl.innerHTML = '';

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
        hostEl.appendChild(container);

        curTheme = t;
    }

    // Публичная точка входа: смонтировать график в host (или пересобрать,
    // если host сменился/тема устарела). Уже актуальный виджет не трогаем.
    window.mkChartMount = function (host) {
        if (!host) return;
        if (hostEl === host && curTheme === theme() && host.firstChild) return;
        hostEl = host;
        build();
    };

    // Снести виджет: iframe TradingView крутит свой рендер-цикл и держит
    // соединение, даже когда вкладка скрыта. Следующий mkChartMount соберёт
    // заново (скрипт уже в кэше браузера — сборка быстрая).
    window.mkChartUnmount = function () {
        if (!hostEl) return;
        hostEl.innerHTML = '';
        hostEl = null;
        curTheme = null;
    };

    // Пересобрать под тему при переключении день/ночь (если уже смонтирован)
    var _origToggle = window.toggleTheme;
    window.toggleTheme = function () {
        var r = _origToggle ? _origToggle.apply(this, arguments) : undefined;
        setTimeout(function () {
            if (hostEl && curTheme !== theme()) build();
        }, 0);
        return r;
    };
})();
