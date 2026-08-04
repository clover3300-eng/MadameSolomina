/* ============================================================================
   МОДУЛЬ «ГРАФИК ИНДЕКСА МОСБИРЖИ» — вкладка Рынок
   ----------------------------------------------------------------------------
   Advanced-chart TradingView (символ RUS:IRUS = IMOEX). После раунда
   «Разворот» отдельного вида «График» больше нет: виджет живёт ПОСТОЯННО в
   герое вкладки (#mhHero, см. js/market-heatmap.js) площадным графиком, а
   период задаёт сегмент 1Д/1Н/1М/1Г рядом с ним. Этот модуль только
   собирает виджет:

     window.mkChartMount(host, range) — построить график в переданном
       контейнере на диапазон range ('1D'|'5D'|'1M'|'12M'; по умолчанию '1M').
       Ленивая загрузка: внешний скрипт TradingView тянется при первом вызове;
       повторные вызовы — no-op, пока не сменились тема/диапазон/хост.
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
    var curRange = '1M';   // диапазон, под который он построен

    function isDark() { return document.body.classList.contains('dark-mode'); }
    function theme() { return isDark() ? 'dark' : 'light'; }

    // Свечной ТФ под каждый диапазон: день — получас, неделя — час, месяц —
    // день, год — неделя (иначе TV рисует год из дневных свечей кашей).
    var RANGE_TF = { '1D': '30', '5D': '60', '1M': 'D', '12M': 'W' };

    // Конфиг виджета: площадной график (style 3) без тулбаров — герой уже несёт
    // и заголовок, и цифры, и переключатель периода; виджету остаётся кривая.
    // Фон прозрачный: карточка героя — стекло, белая плита его бы закрыла.
    function cfg(t, range) {
        var dark = (t === 'dark');
        return {
            autosize: true,
            symbol: 'RUS:IRUS',
            interval: RANGE_TF[range] || 'D',
            range: range,
            timezone: 'Europe/Moscow',
            theme: dark ? 'dark' : 'light',
            style: '3',      // area — как в мокапе Р2 (свечи остались в терминале)
            locale: 'ru',
            allow_symbol_change: false,
            calendar: false,
            details: false,
            hide_side_toolbar: true,
            hide_top_toolbar: true,
            hide_legend: true,
            hide_volume: true,
            hotlist: false,
            save_image: false,
            withdateranges: false,
            backgroundColor: dark ? 'rgba(28,39,53,0)' : 'rgba(255,255,255,0)',
            gridColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(46,46,46,0.06)',
            watchlist: [],
            compareSymbols: [],
            studies: [],
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
        script.innerHTML = JSON.stringify(cfg(t, curRange));

        container.appendChild(widget);
        container.appendChild(copy);
        container.appendChild(script);
        hostEl.appendChild(container);

        curTheme = t;
    }

    // Публичная точка входа: смонтировать график в host на диапазон range (или
    // пересобрать, если host/тема/диапазон устарели). Актуальный не трогаем.
    window.mkChartMount = function (host, range) {
        if (!host) return;
        if (range && RANGE_TF[range]) { var next = range; } else { next = curRange; }
        if (hostEl === host && curTheme === theme() && curRange === next && host.firstChild) return;
        hostEl = host;
        curRange = next;
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
