/* ============================================================================
   МОДУЛЬ «LIVE-ПОЛОСКА РЫНКА» — вкладка Рынок
   ----------------------------------------------------------------------------
   Тёмная полоса с живыми рыночными данными (IMOEX / USD·RUB / BTC) и часами МСК
   — повторяет LIVE-полоску дашборда (.dash2-livebar / .dlv-*). Значения берёт из
   тех же «источников» (#val-imoex, #dyn-imoex …), что и дашборд, поэтому отдельный
   фетч не нужен — данные обновляет core.js. Тикает раз в секунду, пока активна
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

    function bar() { return document.getElementById('mkLiveBar'); }
    function esc(s) { return String(s == null ? '' : s); }
    function isActive() { var p = document.getElementById('panel-market'); return !!(p && p.classList.contains('active')); }

    function render() {
        var host = bar(); if (!host) return;
        host.innerHTML =
            '<div class="dlv-live"><span class="dlv-dot"></span>LIVE</div>' +
            '<div class="dlv-vsep"></div>' +
            '<div class="dlv-items">' + TILES.map(function (t) {
                return '<div class="dlv-item">' +
                    '<span class="dlv-k">' + esc(t.label) + '</span>' +
                    '<span class="dlv-v" id="mklv-v-' + t.k + '">—</span>' +
                    '<span class="dlv-c" id="mklv-c-' + t.k + '"></span>' +
                '</div>';
            }).join('<span class="dlv-isep"></span>') + '</div>' +
            '<div class="dlv-time"><span class="dlv-time-k">MSK</span><span class="dlv-time-v" id="mklvClock">--:--:--</span></div>';
        built = true;
        tick();
    }

    // Обновление значений без полной перерисовки (раз в секунду)
    function tick() {
        var host = bar(); if (!host) return;
        var clock = document.getElementById('mklvClock');
        if (clock) {
            try { clock.textContent = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour12: false }); }
            catch (e) { clock.textContent = new Date().toLocaleTimeString('ru-RU', { hour12: false }); }
        }
        TILES.forEach(function (t) {
            var v = document.getElementById('mklv-v-' + t.k);
            var c = document.getElementById('mklv-c-' + t.k);
            var srcV = document.getElementById(t.v);
            var srcD = document.getElementById(t.d);
            if (v && srcV) { var s = (srcV.textContent || '').trim(); if (s && s !== '---') v.textContent = s; }
            if (c && srcD) {
                var tx = (srcD.textContent || '').trim();
                c.textContent = tx;
                c.className = 'dlv-c ' + (srcD.classList.contains('negative') ? 'neg' : (srcD.classList.contains('positive') ? 'pos' : 'flat'));
            }
        });
    }

    function start() {
        if (!built) render();
        if (!timer) timer = setInterval(function () { if (!document.hidden && isActive()) tick(); }, 1000);
    }

    // Лениво строим/обновляем при заходе на «Рынок»
    var _origSwitch = window.switchTab;
    window.switchTab = function (tabId) {
        var r = _origSwitch ? _origSwitch.apply(this, arguments) : undefined;
        if (tabId === 'market') { render(); start(); }
        return r;
    };

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && isActive()) tick();
    });

    document.addEventListener('DOMContentLoaded', function () {
        if (isActive()) { render(); start(); }
        else { start(); } // запускаем таймер заранее — он сам проверяет активность вкладки
    });
})();
