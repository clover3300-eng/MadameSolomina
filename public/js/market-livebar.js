/* ============================================================================
   МОДУЛЬ «ШАПКА ВКЛАДКИ РЫНОК» (рыночная лента + кнопки в глобальной шапке сайта)
   ----------------------------------------------------------------------------
   Раньше здесь была тёмная LIVE-полоска (.dash2-livebar/.dlv-*) прямо на странице
   и заголовок с 2 кнопками (d3-head/d3-head-actions) — оба убраны со страницы
   («Рынок» и так читается по хлебной крошке): лента тонкой строкой вшита в фон
   топ-бара (#topBarMktMarket, между брендом и панелью действий, общий класс
   .topbar-tab-market — см. css/portfolios.css), кнопки «Все акции»/«Облигации» —
   в #topBarMktActions (.topbar-tab-actions). Значения ленты берёт из тех же
   «источников» (#val-imoex, #dyn-imoex …), что и остальные вкладки — отдельный
   фетч не нужен, данные обновляет core.js. Тикает раз в секунду, пока активна
   вкладка «Рынок». Грузится ПОСЛЕДНИМ, чтобы обёртка switchTab была внешней.
   ========================================================================== */
(function () {
    'use strict';

    var TILES = [
        { k: 'imoex', label: 'IMOEX',   v: 'val-imoex',  d: 'dyn-imoex' },
        { k: 'usd',   label: 'USD/RUB', v: 'val-usdrub', d: 'dyn-usdrub' },
        { k: 'btc',   label: 'BTC',     v: 'val-btc',    d: 'dyn-btc' }
    ];

    var built = false, timer = null;

    function bar() { return document.getElementById('topBarMktMarket'); }
    function actionsHost() { return document.getElementById('topBarMktActions'); }
    function esc(s) { return String(s == null ? '' : s); }
    function isActive() { var p = document.getElementById('panel-market'); return !!(p && p.classList.contains('active')); }

    function render() {
        var host = bar(); if (!host) return;
        // клик по IMOEX здесь не нужен (сами уже на «Рынке», не на «Портфели»/«Главной»)
        host.innerHTML = '<span class="tbmk-dot"></span>' + TILES.map(function (t, i) {
            return (i ? '<span class="tbmk-sep">·</span>' : '') +
                '<span class="tbmk-item">' +
                '<span class="tbmk-k">' + esc(t.label) + '</span>' +
                '<span class="tbmk-v" id="tbmkm-v-' + t.k + '">—</span>' +
                '<span class="tbmk-c" id="tbmkm-c-' + t.k + '"></span></span>';
        }).join('');
        host.style.display = 'flex';
        built = true;
        tick();
    }

    function hide() {
        var host = bar(); if (host) { host.style.display = 'none'; host.innerHTML = ''; }
        built = false;
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

    // Обновление значений без полной перерисовки (раз в секунду)
    function tick() {
        var host = bar(); if (!host) return;
        TILES.forEach(function (t) {
            var v = document.getElementById('tbmkm-v-' + t.k);
            var c = document.getElementById('tbmkm-c-' + t.k);
            var srcV = document.getElementById(t.v);
            var srcD = document.getElementById(t.d);
            if (v && srcV) { var s = (srcV.textContent || '').trim(); if (s && s !== '---') v.textContent = s; }
            if (c && srcD) {
                var tx = (srcD.textContent || '').trim();
                c.textContent = tx;
                c.className = 'tbmk-c ' + (srcD.classList.contains('negative') ? 'neg' : (srcD.classList.contains('positive') ? 'pos' : 'flat'));
            }
        });
    }

    function start() {
        if (!built) render();
        if (!timer) timer = setInterval(function () { if (!document.hidden && isActive()) tick(); }, 1000);
    }

    // Лениво строим/обновляем при заходе на «Рынок», прячем при уходе
    var _origSwitch = window.switchTab;
    window.switchTab = function (tabId) {
        var r = _origSwitch ? _origSwitch.apply(this, arguments) : undefined;
        if (tabId === 'market') { render(); start(); renderActions(); }
        else { hide(); }
        return r;
    };

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && isActive()) tick();
    });

    document.addEventListener('DOMContentLoaded', function () {
        if (isActive()) { render(); start(); renderActions(); }
        else { start(); } // запускаем таймер заранее — он сам проверяет активность вкладки
    });
})();
