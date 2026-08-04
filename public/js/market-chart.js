/* ============================================================================
   МОДУЛЬ «ГРАФИК ИНДЕКСА МОСБИРЖИ» — вкладка Рынок
   ----------------------------------------------------------------------------
   СВОЙ площадной график в герое #mhHero (раунд «Разворот»): виджет TradingView
   не вписывался в язык вкладки (своя палитра, свой фон, свой шрифт) и заменён
   лёгким SVG по свечам ISS Мосбиржи. Кривая красится знаком периода (рост —
   мята, падение — клэй, токены --mh-up/--mh-down), заливка — градиент в
   currentColor, оси — три даты снизу. viewBox + non-scaling-stroke: график
   тянется с карточкой без пересчёта.

     window.mkChartMount(host, range) — нарисовать график диапазона
       ('1D'|'5D'|'1M'|'12M'); свечи кэшируются на 60 с, повторный вызов с теми
       же host/range — no-op.
     window.mkChartUnmount() — очистить хост (уход со вкладки «Рынок»).

   Классический скрипт, грузится ПЕРЕД market-heatmap.js.
   ========================================================================== */
(function () {
    'use strict';

    var ISS = 'https://iss.moex.com/iss/';
    // Диапазон → [интервал свечи ISS, дней назад]. Интервалы ISS: 1/10/60 мин,
    // 24 — день, 7 — неделя. Запас дней покрывает выходные и праздники.
    var CFG = {
        '1D':  { interval: 10, days: 7,   axis: 'time' },
        '5D':  { interval: 60, days: 12,  axis: 'day'  },
        '1M':  { interval: 24, days: 34,  axis: 'day'  },
        '12M': { interval: 7,  days: 372, axis: 'mon'  }
    };
    var TTL = 60000;                 // кэш свечей, мс
    var cache = {};                  // { range: { t, pts:[{d:Date,v:Number}] } }
    var hostEl = null, curRange = null, seq = 0;

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function dstr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

    function fetchPts(range) {
        var hit = cache[range];
        if (hit && Date.now() - hit.t < TTL) return Promise.resolve(hit.pts);
        var cfg = CFG[range];
        var from = new Date(); from.setDate(from.getDate() - cfg.days);
        var url = ISS + 'engines/stock/markets/index/securities/IMOEX/candles.json' +
            '?iss.meta=off&interval=' + cfg.interval + '&from=' + dstr(from) +
            '&candles.columns=close,begin';
        return fetch(url, { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('candles ' + r.status); return r.json(); })
            .then(function (j) {
                var d = j.candles.data, pts = [], i;
                for (i = 0; i < d.length; i++) {
                    if (d[i][0] == null) continue;
                    pts.push({ v: +d[i][0], d: new Date(String(d[i][1]).replace(' ', 'T')) });
                }
                // «1Д» — только последний торговый день из недельного запаса
                if (range === '1D' && pts.length) {
                    var last = dstr(pts[pts.length - 1].d);
                    pts = pts.filter(function (p) { return dstr(p.d) === last; });
                }
                if (pts.length < 2) throw new Error('candles empty');
                cache[range] = { t: Date.now(), pts: pts };
                return pts;
            });
    }

    var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    function axisLabel(p, kind) {
        if (kind === 'time') return pad2(p.d.getHours()) + ':' + pad2(p.d.getMinutes());
        if (kind === 'mon')  return MONTHS[p.d.getMonth()] + ' ' + String(p.d.getFullYear()).slice(2);
        return p.d.getDate() + ' ' + MONTHS[p.d.getMonth()];
    }

    // Площадной график: линия + градиентная заливка в currentColor. Ось —
    // первая/средняя/последняя точка. uid у градиента — на случай двух графиков.
    function draw(host, pts, kind) {
        var W = 100, H = 40, PAD = 2;
        var min = Infinity, max = -Infinity, i;
        for (i = 0; i < pts.length; i++) { var v = pts[i].v; if (v < min) min = v; if (v > max) max = v; }
        var span = (max - min) || 1;
        var line = '';
        for (i = 0; i < pts.length; i++) {
            var x = (i / (pts.length - 1)) * W;
            var y = PAD + (1 - (pts[i].v - min) / span) * (H - PAD * 2);
            line += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
        }
        var dir = pts[pts.length - 1].v >= pts[0].v ? 'up' : 'down';
        var id = 'mkcg' + (++seq);
        var mid = pts[Math.floor((pts.length - 1) / 2)];
        host.innerHTML =
            '<svg class="mkc ' + dir + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
            '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="currentColor" stop-opacity=".22"/>' +
            '<stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
            '<path d="' + line + 'L' + W + ' ' + H + 'L0 ' + H + 'Z" fill="url(#' + id + ')" stroke="none"/>' +
            '<path d="' + line + '" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                'vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
            '</svg>' +
            '<div class="mkc-ax">' +
            '  <span>' + axisLabel(pts[0], kind) + '</span>' +
            '  <span>' + axisLabel(mid, kind) + '</span>' +
            '  <span>' + axisLabel(pts[pts.length - 1], kind) + '</span>' +
            '</div>';
    }

    function render(host, range) {
        var my = ++seq;
        // скелет только на холодный старт: при смене диапазона из кэша мигать нечему
        if (!host.firstChild) host.innerHTML = '<div class="mkc-skel"></div>';
        fetchPts(range).then(function (pts) {
            if (hostEl !== host || curRange !== range || my < seq) return; // устаревший ответ
            draw(host, pts, CFG[range].axis);
        }).catch(function (e) {
            if (hostEl !== host || curRange !== range) return;
            host.innerHTML = '<div class="mkc-err">График Мосбиржи сейчас недоступен</div>';
            if (window.console) console.warn('[market-chart]', e);
        });
    }

    // Публичная точка входа. Актуальный график не трогаем.
    window.mkChartMount = function (host, range) {
        if (!host) return;
        if (!range || !CFG[range]) range = curRange || '1M';
        if (hostEl === host && curRange === range && host.querySelector('.mkc')) return;
        hostEl = host; curRange = range;
        render(host, range);
    };

    window.mkChartUnmount = function () {
        if (!hostEl) return;
        hostEl.innerHTML = '';
        hostEl = null; curRange = null;
    };
})();
