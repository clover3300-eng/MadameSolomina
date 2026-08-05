/* ============================================================================
   МОДУЛЬ «ГРАФИК ИНДЕКСА МОСБИРЖИ» — вкладка Рынок
   ----------------------------------------------------------------------------
   Герой #mhHero рисует KLineChart v10 — ТОТ ЖЕ движок, что у свечей терминала
   (js/vendor/klinecharts.min.js, лениво; см. portfolios-chart.js). Он даёт всё,
   чего не умел самодельный SVG: ценовую шкалу справа, перекрестье с ценой и
   временем под курсором, зум колесом/щипком, прокрутку в историю с догрузкой
   свечей и переключение «Линия ↔ Свечи». Палитра — из токенов карточки
   (--mh-up/--mh-down/--mh-muted2…), линия и заливка красятся ЗНАКОМ видимого
   периода, как красился SVG.

   Данные — свечи ISS Мосбиржи (candles.json по IMOEX): диапазон задаёт ТФ и
   стартовое окно (1Д=10м за последний торговый день, 1Н=час, 1М=день, 1Г=
   неделя), прокрутка влево догружает историю кусками до потолка MAX_BARS.

     window.mkChartMount(host, range, kind) — построить/перенастроить график
       (range '1D'|'5D'|'1M'|'12M', kind 'line'|'candles').
     window.mkChartUnmount() — снести инстанс (уход со вкладки «Рынок»).

   Классический скрипт, грузится ПЕРЕД market-heatmap.js.
   ========================================================================== */
(function () {
    'use strict';

    var ISS = 'https://iss.moex.com/iss/';
    var DAY = 86400000;
    // Диапазон → ТФ ISS, период движка, стартовое окно и кусок догрузки истории
    var CFG = {
        '1D':  { iss: 10, per: { type: 'minute', span: 10 }, init: 5 * DAY,    chunk: 5 * DAY,    lastDayOnly: true },
        '5D':  { iss: 60, per: { type: 'hour',   span: 1 },  init: 16 * DAY,   chunk: 20 * DAY },
        '1M':  { iss: 24, per: { type: 'day',    span: 1 },  init: 46 * DAY,   chunk: 200 * DAY },
        '12M': { iss: 7,  per: { type: 'week',   span: 1 },  init: 372 * DAY,  chunk: 1100 * DAY }
    };
    var MAX_BARS = 1500;   // потолок догрузки: дальше листать историю индекса незачем

    var hostEl = null;     // .mh-chart-host, куда смонтирован график
    var chartEl = null;    // внутренний узел с канвой
    var chart = null;      // инстанс движка
    var curRange = null, curKind = 'line';
    var lastSign = 1;      // знак видимого периода (красит линию/заливку)

    function kc() { return window.klinecharts; }

    // ---------- движок: ленивая загрузка (общая с portfolios-chart.js) ----------
    var engineP = null;
    function ensureEngine() {
        if (kc()) return Promise.resolve(true);
        if (engineP) return engineP;
        engineP = new Promise(function (res) {
            var s = document.createElement('script');
            s.src = 'js/vendor/klinecharts.min.js?v=1';
            s.async = true;
            s.onload = function () { res(!!kc()); };
            s.onerror = function () { engineP = null; res(false); };
            document.head.appendChild(s);
        });
        return engineP;
    }
    var locDone = false;
    function ensureLocale() {
        if (locDone || !kc() || !kc().registerLocale) return;
        locDone = true;
        try {
            kc().registerLocale('ru-RU', {
                time: 'Время: ', open: 'Открытие: ', high: 'Макс: ', low: 'Мин: ',
                close: 'Закрытие: ', volume: 'Объём: ', turnover: 'Оборот: ', change: 'Изм: ',
                second: 'с', minute: '', hour: 'ч', day: 'Д', week: 'Н', month: 'М', year: 'Г'
            });
        } catch (e) { locDone = false; }
    }
    // Поправка перекрестья под body{zoom:.9} — тот же патч прототипа, что в
    // portfolios-chart.js. Флаг ОБЩИЙ (window.__kcZoomPatched): патч на
    // прототипе один на страницу, второй сдвинул бы курсор в другую сторону.
    function fixZoomPointer(c) {
        if (window.__kcZoomPatched) return;
        try {
            var ev = c._chartEvent && c._chartEvent._event;
            var proto = ev && Object.getPrototypeOf(ev);
            if (!proto || typeof proto._makeCompatEvent !== 'function') return;
            var orig = proto._makeCompatEvent;
            proto._makeCompatEvent = function (e, touch) {
                var r = orig.call(this, e, touch);
                var el = this._target, z = el && el.currentCSSZoom;
                if (!(typeof z === 'number' && z > 0)) {
                    var w = el ? el.getBoundingClientRect().width : 0, lw = el ? el.offsetWidth : 0;
                    z = (w > 0 && lw > 0) ? w / lw : 1;
                }
                if (Math.abs(z - 1) > 0.001) { r.x /= z; r.y /= z; }
                return r;
            };
            window.__kcZoomPatched = true;
        } catch (e) {}
    }

    // ---------- палитра из токенов карточки ----------
    function tok(cs, n, fb) { var v = cs.getPropertyValue(n).trim(); return v || fb; }
    function buildStyles() {
        var card = hostEl ? hostEl.closest('.mh-card') : null;
        var cs = getComputedStyle(card || document.body);
        var up = tok(cs, '--mh-up', '#12a35c'), down = tok(cs, '--mh-down', '#d8452b');
        var txt = tok(cs, '--mh-muted2', '#5c6a7d');
        var grid = tok(cs, '--mh-line-soft', 'rgba(16,24,40,0.08)');
        var sig = lastSign >= 0 ? up : down;
        var mono = 'JetBrains Mono';
        var crossBg = document.body.classList.contains('dark-mode') ? '#33415c' : '#1b2433';
        return {
            grid: { horizontal: { color: grid }, vertical: { color: grid } },
            candle: {
                type: curKind === 'candles' ? 'candle_solid' : 'area',
                bar: {
                    upColor: up, downColor: down, noChangeColor: txt,
                    upBorderColor: up, downBorderColor: down, noChangeBorderColor: txt,
                    upWickColor: up, downWickColor: down, noChangeWickColor: txt
                },
                // площадной вид: линия и заливка знаком периода, как в SVG-версии
                area: {
                    lineSize: 2, lineColor: sig, value: 'close', smooth: false,
                    backgroundColor: [
                        { offset: 0, color: sig + '00' },
                        { offset: 1, color: sig + '38' }
                    ],
                    point: { show: true, color: sig, radius: 3,
                        rippleColor: sig + '1f', rippleRadius: 7 }
                },
                priceMark: {
                    high: { color: txt, textFamily: mono },
                    low: { color: txt, textFamily: mono },
                    last: {
                        upColor: up, downColor: down, noChangeColor: txt,
                        line: { show: true },
                        text: { color: '#fff', family: mono }
                    }
                },
                tooltip: {
                    title: { color: txt, family: mono },
                    // без строки объёма: у индекса в свечах ISS его нет, «Объём: n/a»
                    // в легенде читался поломкой
                    legend: { color: txt, family: mono, template: [
                        { title: 'time', value: '{time}' },
                        { title: 'open', value: '{open}' },
                        { title: 'high', value: '{high}' },
                        { title: 'low', value: '{low}' },
                        { title: 'close', value: '{close}' }
                    ] }
                }
            },
            xAxis: { axisLine: { color: grid }, tickLine: { color: grid },
                tickText: { color: txt, family: mono, size: 10 } },
            yAxis: { axisLine: { color: grid }, tickLine: { color: grid },
                tickText: { color: txt, family: mono, size: 10 } },
            separator: { color: grid },
            crosshair: {
                horizontal: { line: { color: txt },
                    text: { backgroundColor: crossBg, family: mono } },
                vertical: { line: { color: txt },
                    text: { backgroundColor: crossBg, family: mono } }
            }
        };
    }

    // ---------- свечи ISS ----------
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function dstr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function fetchCandles(range, fromMs, tillMs) {
        var cfg = CFG[range];
        var url = ISS + 'engines/stock/markets/index/securities/IMOEX/candles.json' +
            '?iss.meta=off&interval=' + cfg.iss +
            '&from=' + dstr(new Date(fromMs)) + '&till=' + dstr(new Date(tillMs)) +
            '&candles.columns=open,close,high,low,begin';
        // через прокси (window.issUrl из core.js): прямой iss.moex.com у части
        // пользователей режется (CORS/сеть) и график оставался пустым
        if (window.issUrl) url = window.issUrl(url);
        return fetch(url, { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('candles ' + r.status); return r.json(); })
            .then(function (j) {
                var d = j.candles.data, rows = [], i;
                for (i = 0; i < d.length; i++) {
                    var c = d[i];
                    if (c[1] == null) continue;
                    rows.push({
                        timestamp: new Date(String(c[4]).replace(' ', 'T')).getTime(),
                        open: +c[0], close: +c[1], high: +c[2], low: +c[3]
                    });
                }
                return rows;
            });
    }

    // ---------- вид под данные: знак периода + свечи по ширине бокса ----------
    function applyLook(rows) {
        if (!chart) return;
        if (rows && rows.length > 1) {
            var sign = rows[rows.length - 1].close >= rows[0].close ? 1 : -1;
            if (sign !== lastSign) { lastSign = sign; }
        }
        try { chart.setStyles(buildStyles()); } catch (e) {}
        // Стартовое окно должно ЗАПОЛНЯТЬ ширину (22 дневки на 900px без этого —
        // кучка свечей у правого края); зум от этой посадки работает как обычно.
        // На СЛЕДУЮЩЕМ кадре: движок применяет данные и раскладку после
        // callback'а, синхронный setBarSpace он перетирал.
        if (rows && rows.length && chartEl) {
            var n = rows.length;
            requestAnimationFrame(function () {
                if (!chart || !chartEl) return;
                var w = chartEl.clientWidth - 70;   // минус ценовая шкала
                var space = Math.max(3, Math.min(40, w / n));
                try { chart.setBarSpace(space); } catch (e) {}
                try { chart.setOffsetRightDistance(8); } catch (e) {}
            });
        }
    }

    function makeLoader() {
        return {
            getBars: function (p) {
                var cfg = CFG[curRange || '1M'];
                if (p.type === 'backward') { p.callback([], { backward: false }); return; }
                var loaded = (chart && chart.getDataList() || []).length;
                if (p.type === 'forward' && loaded >= MAX_BARS) {
                    p.callback([], { forward: false, backward: false });
                    return;
                }
                var till = p.type === 'forward' && p.timestamp ? p.timestamp - 1 : Date.now();
                var from = till - (p.type === 'forward' ? cfg.chunk : cfg.init);
                fetchCandles(curRange, from, till).then(function (rows) {
                    if (p.type === 'forward' && p.timestamp) {
                        rows = rows.filter(function (r) { return r.timestamp < p.timestamp; });
                    }
                    // «1Д» на старте — только последний торговый день (семантика
                    // диапазона); прокрутка влево доложит предыдущие дни
                    if (p.type === 'init' && cfg.lastDayOnly && rows.length) {
                        var lastDay = dstr(new Date(rows[rows.length - 1].timestamp));
                        rows = rows.filter(function (r) { return dstr(new Date(r.timestamp)) === lastDay; });
                    }
                    clearNote();
                    p.callback(rows, { forward: rows.length > 0, backward: false });
                    if (p.type === 'init') applyLook(rows);
                }).catch(function (e) {
                    p.callback([], { forward: false, backward: false });
                    if (p.type === 'init') showNote('График Мосбиржи сейчас недоступен');
                    if (window.console) console.warn('[market-chart]', e);
                });
            },
            subscribeBar: function () {},
            unsubscribeBar: function () {}
        };
    }

    // тихая заметка поверх пустого графика (ошибка сети)
    function showNote(txt) {
        if (!hostEl) return;
        clearNote();
        var n = document.createElement('div');
        n.className = 'mkc-err'; n.textContent = txt;
        hostEl.appendChild(n);
    }
    function clearNote() {
        if (!hostEl) return;
        var n = hostEl.querySelector('.mkc-err');
        if (n) n.parentNode.removeChild(n);
    }

    function buildChart() {
        ensureLocale();
        chartEl = document.createElement('div');
        chartEl.className = 'mkc-kl';
        hostEl.appendChild(chartEl);
        chart = kc().init(chartEl, {
            locale: 'ru-RU',
            timezone: 'Europe/Moscow',
            styles: buildStyles()
        });
        if (!chart) return;
        fixZoomPointer(chart);
        chart.setDataLoader(makeLoader());
        chart.setSymbol({ ticker: 'IMOEX', pricePrecision: 2, volumePrecision: 0 });
        chart.setPeriod(CFG[curRange].per);   // триггерит init-загрузку
        // карточку тянет resize окна — движку надо пересчитать канву
        try {
            var raf = 0;
            new ResizeObserver(function () {
                if (raf) return;
                raf = requestAnimationFrame(function () { raf = 0; try { chart && chart.resize(); } catch (e) {} });
            }).observe(chartEl);
        } catch (e) {}
    }

    // ---------- публичный API ----------
    window.mkChartMount = function (host, range, kind) {
        if (!host) return;
        if (!range || !CFG[range]) range = curRange || '1M';
        if (kind === 'line' || kind === 'candles') curKind = kind;
        var rangeChanged = range !== curRange;
        curRange = range;
        if (chart && hostEl === host) {
            // живой инстанс: диапазон меняет период (движок сам перезагрузит
            // данные), вид — только стили
            if (rangeChanged) { try { chart.setPeriod(CFG[range].per); } catch (e) {} }
            else { try { chart.setStyles(buildStyles()); } catch (e) {} }
            return;
        }
        window.mkChartUnmount();
        hostEl = host;
        host.innerHTML = '<div class="mkc-skel"></div>';
        ensureEngine().then(function (ok) {
            if (!ok || hostEl !== host) return;
            host.innerHTML = '';
            buildChart();
        });
    };

    window.mkChartUnmount = function () {
        if (!hostEl) return;
        if (chart) { try { kc().dispose(chartEl); } catch (e) {} }
        chart = null; chartEl = null;
        hostEl.innerHTML = '';
        hostEl = null;
    };

    // Смена темы: панель наблюдает класс body и перекрашивает график из свежих
    // токенов карточки (сами данные не трогаем)
    var lastDark = document.body.classList.contains('dark-mode');
    if (window.MutationObserver) {
        new MutationObserver(function () {
            var d = document.body.classList.contains('dark-mode');
            if (d === lastDark) return;
            lastDark = d;
            if (chart) { try { chart.setStyles(buildStyles()); } catch (e) {} }
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
})();
