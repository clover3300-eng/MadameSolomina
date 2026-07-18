// ===== «ПОРТФЕЛИ» · ГРАФИК СВЕЧЕЙ ТЕРМИНАЛА (модуль цепочки #pfLazySrc) =====
// Третий, необязательный блок слота «Торговли»: свечи с зумом, индикаторами и
// инструментами рисования по той же бумаге, что стакан и тикет слота.
// Движок — KLineChart v10 (Apache-2.0), вендорен в js/vendor/klinecharts.min.js:
// чужой CDN на страницу с брокерской сессией не пускаем (как html2canvas/jsPDF).
//
// ДАННЫЕ. Основной источник — T-Invest GetCandles через воркер-прокси (та же
// бумага по instrumentId, что и стакан). Запасной — свечи MOEX ISS по тикеру:
// у брокера история отдельных бумаг бывает короче/пустой, а пустой график в
// терминале читается как поломка. Источник виден в подписи под шапкой.
//
// ЖИВОЙ DOM. Рендер «Портфелей» пересобирает вкладку целиком (host.innerHTML),
// а canvas такого не переживает — инстанс графика умирал бы на каждом тике
// котировок вместе с зумом, индикаторами и начерченными линиями. Поэтому узел
// с canvas живёт в CH[n].host ВНЕ документа, htmlFn рисует только пустой якорь
// .btc-mount, а pfcAfterRender переносит узел в свежий якорь appendChild'ом:
// инстанс не пересоздаётся, состояние графика цело. Тот же приём, что у
// поповера настроек виджета (pfdCfgRemountSoon), только без пересборки.
//
// ПОЛЛИНГ. Стрима у нас нет (MarketDataStream — не через REST-прокси), поэтому
// последняя свеча дотягивается своим таймером: 10с на минутках, 60с на дневках
// и старше, и только когда блок на экране, а вкладка браузера видима.

(function () {
    'use strict';
    var PF = window.PF;
    var esc = PF.esc, toast = PF.toast;

    var CFG_KEY = 'bt_chart_v1';   // ТФ/индикаторы/чертежи по слотам — ЛОКАЛЬНО, как bt_slots_v1
    var MIN_BARS = 180;            // сколько свечей набрать при первой загрузке
    var MAX_CHUNKS = 6;            // потолок запросов на одну догрузку истории
    var DAY = 86400000;

    // Таймфреймы подобраны так, чтобы КАЖДЫЙ существовал в обоих источниках:
    // у MOEX ISS нет 5 и 15 минут, у брокера нет «квартала» — общий знаменатель
    // ниже переключается без оговорок «этот ТФ только у брокера».
    var TF = [
        { k: '1m',  lab: '1м', ti: 'CANDLE_INTERVAL_1_MIN',  moex: 1,  per: { type: 'minute', span: 1 },  chunk: DAY,        live: 10000 },
        { k: '10m', lab: '10м', ti: 'CANDLE_INTERVAL_10_MIN', moex: 10, per: { type: 'minute', span: 10 }, chunk: DAY,        live: 15000 },
        { k: '1h',  lab: '1ч', ti: 'CANDLE_INTERVAL_HOUR',   moex: 60, per: { type: 'hour',   span: 1 },  chunk: 7 * DAY,    live: 30000 },
        { k: '1d',  lab: 'Д',  ti: 'CANDLE_INTERVAL_DAY',    moex: 24, per: { type: 'day',    span: 1 },  chunk: 360 * DAY,  live: 60000 },
        { k: '1w',  lab: 'Н',  ti: 'CANDLE_INTERVAL_WEEK',   moex: 7,  per: { type: 'week',   span: 1 },  chunk: 720 * DAY,  live: 60000 },
        { k: '1M',  lab: 'М',  ti: 'CANDLE_INTERVAL_MONTH',  moex: 31, per: { type: 'month',  span: 1 },  chunk: 3600 * DAY, live: 60000 }
    ];
    function tfBy(k) {
        for (var i = 0; i < TF.length; i++) if (TF[i].k === k) return TF[i];
        return TF[3];   // дневки — привычный дефолт для российских бумаг
    }

    // Индикаторы: одни ложатся ПОВЕРХ свечей (скользящие, полосы, точки SAR),
    // другим нужна своя панель со своей шкалой (объём, осцилляторы).
    var IND_OVER = [
        { n: 'MA',   t: 'Скользящие средние' },
        { n: 'EMA',  t: 'Экспоненциальные средние' },
        { n: 'BOLL', t: 'Полосы Боллинджера' },
        { n: 'SAR',  t: 'Параболик SAR' }
    ];
    var IND_PANE = [
        { n: 'VOL',  t: 'Объём' },
        { n: 'MACD', t: 'MACD' },
        { n: 'RSI',  t: 'RSI' },
        { n: 'KDJ',  t: 'Стохастик KDJ' },
        { n: 'CCI',  t: 'CCI' },
        { n: 'WR',   t: 'Williams %R' },
        { n: 'OBV',  t: 'Балансовый объём' }
    ];
    // Инструменты рисования. Порядок — от самых ходовых (уровень, трендовая) к
    // редким; названия человеческие, а не как в движке.
    var DRAW = [
        { n: 'horizontalStraightLine', t: 'Горизонтальный уровень' },
        { n: 'segment',                t: 'Трендовая линия' },
        { n: 'rayLine',                t: 'Луч' },
        { n: 'priceLine',              t: 'Линия цены с подписью' },
        { n: 'parallelStraightLine',   t: 'Параллельные линии' },
        { n: 'priceChannelLine',       t: 'Ценовой канал' },
        { n: 'fibonacciLine',          t: 'Уровни Фибоначчи' },
        { n: 'rect',                   t: 'Прямоугольник' },
        { n: 'simpleAnnotation',       t: 'Заметка на свече' }
    ];

    var IC_IND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.5 8.5 11l4 3.5L21 5"/><path d="M15.5 5H21v5.5"/></svg>';
    var IC_DRAW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 4.6a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8L8.6 19.6 4 20.4l.8-4.6z"/><path d="m13.8 6 4.2 4.2"/></svg>';
    var IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

    // ---------- состояние ----------
    // n -> { host, chart, uid, ticker, tf, src, timer, liveCb, loading }
    var CH = {};
    function slotNo(n) { n = Math.floor(+n || 1); return n >= 1 ? n : 1; }
    function chId(n) { return slotNo(n) === 1 ? 'trade:chart' : 'trade:chart:' + slotNo(n); }
    function A() { return window.brokerApi; }
    function instr(n) { return (PF.pftSlotInstr && PF.pftSlotInstr(slotNo(n))) || null; }
    function kc() { return window.klinecharts; }

    // Движок (228 КБ) грузим ЛЕНИВО — в тот момент, когда блок графика впервые
    // оказался на экране. Он нужен единицам (терминал + явно включённый виджет),
    // и вешать его на всех, кто просто зашёл в «Портфели», незачем.
    var engineP = null;
    function ensureEngine() {
        if (kc()) return Promise.resolve(true);
        if (engineP) return engineP;
        engineP = new Promise(function (res) {
            var s = document.createElement('script');
            s.src = 'js/vendor/klinecharts.min.js?v=1';
            s.async = true;
            s.onload = function () { res(!!kc()); };
            // сеть моргнула — сбрасываем обещание, следующий рендер попробует снова
            s.onerror = function () { engineP = null; res(false); };
            document.head.appendChild(s);
        });
        return engineP;
    }

    // ---------- персист ----------
    // Как и выбранные бумаги терминала, настройки графика живут ЛОКАЛЬНО и в
    // облако не уезжают: брокерский контур наружу не ходит.
    var cfgMem = null;
    function cfgAll() {
        if (cfgMem) return cfgMem;
        try { cfgMem = JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || {}; } catch (e) { cfgMem = {}; }
        if (!cfgMem || typeof cfgMem !== 'object') cfgMem = {};
        return cfgMem;
    }
    function cfg(n) {
        var all = cfgAll(), k = String(slotNo(n));
        var c = all[k];
        if (!c || typeof c !== 'object') c = all[k] = {};
        if (!tfExists(c.tf)) c.tf = '1d';
        if (!Array.isArray(c.inds)) c.inds = ['VOL'];
        if (!Array.isArray(c.ovs)) c.ovs = [];
        return c;
    }
    function tfExists(k) { for (var i = 0; i < TF.length; i++) if (TF[i].k === k) return true; return false; }
    var saveT = null;
    function cfgSave() {
        clearTimeout(saveT);
        saveT = setTimeout(function () {
            try { localStorage.setItem(CFG_KEY, JSON.stringify(cfgAll())); } catch (e) {}
        }, 300);
    }

    // ---------- источник 1: T-Invest GetCandles ----------
    // Ответ брокера — Quotation (units+nano) на каждую цену; пустые свечи
    // (нулевой close) выбрасываем: klinecharts нарисовал бы их провалом в ноль.
    function tiCandles(uid, tf, from, to) {
        if (!A() || !A().getConn()) return Promise.reject(new Error('no-broker'));
        var q2n = A().q2n;
        return A().call('GetCandles', {
            instrumentId: uid,
            from: new Date(from).toISOString(),
            to: new Date(to).toISOString(),
            interval: tf.ti
        }).then(function (d) {
            return ((d && d.candles) || []).map(function (c) {
                return {
                    timestamp: Date.parse(c.time),
                    open: q2n(c.open), high: q2n(c.high),
                    low: q2n(c.low), close: q2n(c.close),
                    volume: +c.volume || 0
                };
            }).filter(function (c) { return c.timestamp && c.close > 0; });
        });
    }

    // ---------- источник 2: MOEX ISS ----------
    // Публичный ISS отдаёт свечи без токена, но рынок в пути обязателен: сперва
    // акции, при пустом ответе — облигации (в терминале бывают и те и другие).
    var moexMkt = {};   // ticker -> 'shares' | 'bonds' (не искать рынок каждый раз)
    function moexUrl(ticker, mkt, tf, from, to) {
        return 'https://iss.moex.com/iss/engines/stock/markets/' + mkt +
            '/securities/' + encodeURIComponent(ticker) + '/candles.json' +
            '?iss.meta=off&interval=' + tf.moex +
            '&from=' + isoDay(from) + '&till=' + isoDay(to);
    }
    function isoDay(t) { return new Date(t).toISOString().slice(0, 10); }
    // ISS отдаёт время БЕЗ зоны, оно всегда московское: без явного +03:00
    // браузер прочитал бы его как UTC и сдвинул все свечи на три часа
    function moexTime(s) {
        var t = Date.parse(String(s || '').replace(' ', 'T') + '+03:00');
        return isNaN(t) ? 0 : t;
    }
    function moexFetch(ticker, mkt, tf, from, to) {
        return fetch(moexUrl(ticker, mkt, tf, from, to), { credentials: 'omit' })
            .then(function (r) {
                if (!r.ok) throw new Error('moex ' + r.status);
                return r.json();
            })
            .then(function (j) {
                var c = j && j.candles;
                var cols = (c && c.columns) || [], rows = (c && c.data) || [];
                var iO = cols.indexOf('open'), iC = cols.indexOf('close'), iH = cols.indexOf('high');
                var iL = cols.indexOf('low'), iV = cols.indexOf('volume'), iB = cols.indexOf('begin');
                if (iB < 0 || iC < 0) return [];
                return rows.map(function (r2) {
                    return {
                        timestamp: moexTime(r2[iB]),
                        open: +r2[iO] || 0, high: +r2[iH] || 0,
                        low: +r2[iL] || 0, close: +r2[iC] || 0,
                        volume: +r2[iV] || 0
                    };
                }).filter(function (x) { return x.timestamp && x.close > 0; });
            });
    }
    function moexCandles(ticker, tf, from, to) {
        if (!ticker) return Promise.reject(new Error('no-ticker'));
        var known = moexMkt[ticker];
        if (known) return moexFetch(ticker, known, tf, from, to);
        return moexFetch(ticker, 'shares', tf, from, to).then(function (rows) {
            if (rows.length) { moexMkt[ticker] = 'shares'; return rows; }
            return moexFetch(ticker, 'bonds', tf, from, to).then(function (b) {
                if (b.length) moexMkt[ticker] = 'bonds';
                return b;
            });
        });
    }

    // ---------- общая загрузка отрезка ----------
    // Брокер ограничивает глубину ОДНОГО запроса (минутки — сутками, часовки —
    // неделей), поэтому идём чанками назад от `to`, пока не наберём нужное
    // число свечей или не упрёмся в потолок запросов. Тот же цикл обслуживает и
    // MOEX — там лимита нет, но одинаковый путь проще держать в голове.
    function loadBack(c, tf, to, want) {
        var out = [], chunks = 0;
        var ins = c.instr;
        function step(end) {
            if (out.length >= want || chunks >= MAX_CHUNKS) return Promise.resolve(out);
            chunks++;
            var start = end - tf.chunk;
            var p = c.src === 'moex'
                ? moexCandles(ins.ticker, tf, start, end)
                : tiCandles(ins.uid, tf, start, end).catch(function (e) {
                    // брокер отказал (нет истории/лимит/ошибка сети) — дальше по
                    // этому графику работаем от MOEX, молча и до смены бумаги
                    if (c.src === 'ti' && chunks === 1) {
                        c.src = 'moex';
                        srcNote(c);
                        return moexCandles(ins.ticker, tf, start, end);
                    }
                    throw e;
                });
            return p.then(function (rows) {
                out = rows.concat(out);
                return step(start);
            });
        }
        return step(to).then(dedupe);
    }
    // Страховка от повторов: чанк на границе диапазона может задеть свечи,
    // которые уже на графике. Дубль по времени движок кладёт отдельным баром —
    // ось времени после такого идёт вспять.
    function fresh(c, rows) {
        var have = {};
        try {
            (c.chart.getDataList() || []).forEach(function (r) { have[r.timestamp] = 1; });
        } catch (e) { return rows; }
        return rows.filter(function (r) { return !have[r.timestamp]; });
    }
    // Чанки идут внахлёст (границы суток/недель повторяют свечу), а брокер и ISS
    // на стыках отдают их в разном порядке. Без сортировки и склейки дублей ось
    // времени ломалась: за 17 июля вдруг шло 11-е.
    function dedupe(rows) {
        var seen = {}, out = [];
        rows.forEach(function (r) {
            if (seen[r.timestamp]) return;
            seen[r.timestamp] = 1;
            out.push(r);
        });
        return out.sort(function (a, b) { return a.timestamp - b.timestamp; });
    }

    // ---------- график ----------
    function themeDark() {
        return document.body.classList.contains('dark-mode');
    }
    // Палитра повторяет язык терминала: тонкая сетка, приглушённые подписи,
    // зелёный/красный только на самих свечах и метке последней цены.
    function styles() {
        var d = themeDark();
        var txt = d ? '#94a3b8' : '#64748b';
        var grid = d ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
        var line = d ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)';
        var up = '#16a34a', down = '#dc2626';
        return {
            grid: {
                horizontal: { color: grid },
                vertical: { color: grid }
            },
            candle: {
                bar: {
                    upColor: up, downColor: down, noChangeColor: txt,
                    upBorderColor: up, downBorderColor: down, noChangeBorderColor: txt,
                    upWickColor: up, downWickColor: down, noChangeWickColor: txt
                },
                priceMark: {
                    high: { color: txt }, low: { color: txt },
                    last: {
                        upColor: up, downColor: down, noChangeColor: txt,
                        line: { show: true },
                        text: { color: '#fff' }
                    }
                },
                tooltip: {
                    title: { color: txt },
                    legend: { color: txt }
                }
            },
            indicator: {
                tooltip: { legend: { color: txt } },
                ohlc: { upColor: up, downColor: down, noChangeColor: txt },
                bars: [{ upColor: 'rgba(22,163,74,0.6)', downColor: 'rgba(220,38,38,0.6)', noChangeColor: txt }]
            },
            xAxis: { axisLine: { color: line }, tickLine: { color: line }, tickText: { color: txt } },
            yAxis: { axisLine: { color: line }, tickLine: { color: line }, tickText: { color: txt } },
            separator: { color: line },
            crosshair: {
                horizontal: {
                    line: { color: txt },
                    text: { backgroundColor: d ? '#334155' : '#1b2433' }
                },
                vertical: {
                    line: { color: txt },
                    text: { backgroundColor: d ? '#334155' : '#1b2433' }
                }
            }
        };
    }

    // Один инстанс на слот. Создаётся при первом появлении блока на экране и
    // живёт, пока слот не удалили: узел просто переезжает между рендерами.
    // Контейнер вставляем в якорь ДО init — движок меряет бокс при инициализации,
    // и у отсоединённого узла канва получилась бы нулевого размера.
    function ensureChart(n, mount) {
        n = slotNo(n);
        var c = CH[n];
        if (c && c.chart) return c;
        if (!kc() || !mount) return null;
        var host = document.createElement('div');
        host.className = 'btc-host';
        mount.appendChild(host);
        var chart = kc().init(host, {
            locale: 'ru-RU',
            timezone: 'Europe/Moscow',
            styles: styles()
        });
        if (!chart) { try { mount.removeChild(host); } catch (e) {} return null; }
        c = CH[n] = { host: host, chart: chart, slot: n, instr: null, tf: cfg(n).tf, src: 'ti', timer: null, liveCb: null };
        chart.setDataLoader(makeLoader(c));
        // клик по свече кладёт её закрытие в ценовое поле тикета — тот же жест,
        // что клик по строке стакана (pftPickPrice)
        chart.subscribeAction('onCandleBarClick', function (data) {
            if (!data || !data.close) return;
            if (window.pftPickPrice) window.pftPickPrice(n, round(data.close, c.instr));
        });
        // свой ResizeObserver: карточку тянут за угол конструктора, и движку
        // надо пересчитать канву под новый бокс
        try {
            c.ro = new ResizeObserver(function () { try { chart.resize(); } catch (e) {} });
            c.ro.observe(host);
        } catch (e) {}
        return c;
    }
    // цена в поле тикета должна лечь на шаг инструмента, иначе брокер отвергнет
    function round(v, ins) {
        var st = (ins && ins.minInc) || 0.01;
        var r = Math.round(v / st) * st;
        var dec = Math.max(0, String(st).indexOf('.') >= 0 ? String(st).split('.')[1].length : 0);
        return +r.toFixed(dec);
    }

    // Загрузчик в модели klinecharts. ВНИМАНИЕ: имена направлений в движке
    // контринтуитивные, и путать их нельзя (проверено по его исходнику):
    //   'forward'  — история ВЛЕВО, в прошлое. Просится, когда прокрутка упёрлась
    //                в начало; timestamp = самый СТАРЫЙ бар; порция клеится
    //                в начало списка (data.concat(dataList)).
    //   'backward' — данные ВПРАВО, в будущее; timestamp = самый НОВЫЙ бар;
    //                порция клеится в конец.
    // Отданная не в ту сторону порция приклеивается не тем концом, и ось времени
    // посреди графика идёт вспять: после 18 июля снова 11-е.
    function makeLoader(c) {
        return {
            getBars: function (p) {
                var tf = tfBy(c.tf);
                if (!c.instr) { p.callback([], false); return; }
                // Правее «сейчас» свечей не существует, а 'init' грузит ровно до
                // текущего момента — на запрос вправо честный ответ всегда пустой.
                if (p.type === 'backward') { p.callback([], { backward: false }); return; }
                mark(c, true);
                var to = p.type === 'forward' && p.timestamp ? p.timestamp : Date.now();
                var want = p.type === 'init' ? MIN_BARS : 60;
                return loadBack(c, tf, to, want).then(function (rows) {
                    if (p.type === 'forward' && p.timestamp) {
                        rows = rows.filter(function (r) { return r.timestamp < p.timestamp; });
                    }
                    rows = fresh(c, rows);
                    mark(c, false);
                    // forward:false движок понимает как «история кончилась» и
                    // больше её не просит — ставим его только на пустой ответ
                    p.callback(rows, { forward: rows.length > 0, backward: false });
                    if (p.type === 'init') restoreOverlays(c);
                }).catch(function () {
                    mark(c, false);
                    p.callback([], { forward: false, backward: false });
                    srcNote(c, 'нет данных');
                });
            },
            subscribeBar: function (p) {
                c.liveCb = p.callback;
                startLive(c);
            },
            unsubscribeBar: function () {
                c.liveCb = null;
                stopLive(c);
            }
        };
    }

    // ---------- живая последняя свеча ----------
    function startLive(c) {
        stopLive(c);
        var tf = tfBy(c.tf);
        c.timer = setInterval(function () { tickLive(c); }, tf.live);
    }
    function stopLive(c) { if (c.timer) { clearInterval(c.timer); c.timer = null; } }
    function tickLive(c) {
        if (!c.liveCb || !c.instr) return;
        // блок ушёл с экрана или вкладка браузера в фоне — не жжём лимит брокера
        if (!document.querySelector('#panel-portfolios.active .btc-mount')) { stopLive(c); return; }
        if (document.visibilityState !== 'visible') return;
        var tf = tfBy(c.tf), now = Date.now();
        var p = c.src === 'moex'
            ? moexCandles(c.instr.ticker, tf, now - tf.chunk, now)
            : tiCandles(c.instr.uid, tf, now - tf.chunk, now);
        p.then(function (rows) {
            var last = rows[rows.length - 1];
            if (last && c.liveCb) c.liveCb(last);
        }).catch(function () { /* тихо: следующий тик попробует снова */ });
    }

    // ---------- индикаторы и чертежи ----------
    function applyInds(c, n) {
        if (!c.chart) return;
        var want = cfg(n).inds;
        var have = c.chart.getIndicators() || [];
        have.forEach(function (ind) {
            if (want.indexOf(ind.name) < 0) c.chart.removeIndicator({ paneId: ind.paneId, name: ind.name });
        });
        var haveNames = have.map(function (i) { return i.name; });
        want.forEach(function (name) {
            if (haveNames.indexOf(name) >= 0) return;
            var over = IND_OVER.some(function (x) { return x.n === name; });
            try {
                var indId = c.chart.createIndicator(over ? { name: name, paneId: 'candle_pane' } : { name: name }, true);
                // Своя панель осциллятора по умолчанию делит высоту поровну со
                // свечами: включил объём и MACD — и от свечей осталась полоска.
                // Держим осцилляторы низкими, главная панель забирает остаток.
                // createIndicator отдаёт id ИНДИКАТОРА, а не панели — id панели
                // достаём из самого индикатора, иначе setPaneOptions бьёт мимо.
                if (!over && indId) {
                    var made = (c.chart.getIndicators({ id: indId }) || [])[0];
                    if (made && made.paneId) c.chart.setPaneOptions({ id: made.paneId, height: 74, minHeight: 40 });
                }
            } catch (e) {}
        });
    }
    // Начерченное переживает уход со вкладки: сохраняем имя и точки (время+цена),
    // при следующей загрузке данных рисуем заново. Без этого трендовые линии
    // пропадали бы при каждом переключении подвкладки.
    function saveOverlays(c, n) {
        if (!c.chart) return;
        var list = (c.chart.getOverlays() || []).map(function (o) {
            return { name: o.name, points: (o.points || []).map(function (p) {
                return { timestamp: p.timestamp, value: p.value };
            }) };
        }).filter(function (o) { return o.points.length; });
        cfg(n).ovs = list.slice(0, 60);
        cfgSave();
    }
    function restoreOverlays(c) {
        var saved = cfg(c.slot).ovs || [];
        if (!saved.length || c.ovsDone) return;
        c.ovsDone = true;
        saved.forEach(function (o) {
            try { c.chart.createOverlay({ name: o.name, points: o.points }); } catch (e) {}
        });
    }

    // ---------- карточка ----------
    function tfHtml(n) {
        var cur = cfg(n).tf;
        return '<div class="btr-ttabs btc-tf">' + TF.map(function (t) {
            return '<button type="button"' + (cur === t.k ? ' class="active"' : '') +
                ' onclick="pfcTf(' + n + ',\'' + t.k + '\')">' + t.lab + '</button>';
        }).join('') + '</div>';
    }
    function menuHtml(n, kind) {
        var items = kind === 'ind' ? IND_OVER.concat(IND_PANE) : DRAW;
        var on = cfg(n).inds;
        var rows = items.map(function (it) {
            var act = kind === 'ind' ? 'pfcInd' : 'pfcDraw';
            var checked = kind === 'ind' && on.indexOf(it.n) >= 0;
            return '<button type="button" class="btc-mi' + (checked ? ' on' : '') + '" ' +
                'onclick="' + act + '(' + n + ',\'' + it.n + '\')">' +
                '<span>' + esc(it.t) + '</span>' +
                (kind === 'ind' ? '<i>' + (checked ? IC_CHECK : '') + '</i>' : '') + '</button>';
        }).join('');
        var foot = kind === 'draw'
            ? '<button type="button" class="btc-mi danger" onclick="pfcDrawClear(' + n + ')"><span>Убрать все построения</span></button>'
            : '';
        return '<div class="btc-menu" id="btcMenu' + kind + '_' + n + '">' + rows + foot + '</div>';
    }
    function chartCardHtml(n) {
        var ins = instr(n);
        var title = ins ? 'График · ' + ins.ticker : 'График';
        var right = PF.pfdInChromeHtml(chId(n)) +
            '<span class="btc-mwrap">' +
                '<button type="button" class="btr-iconbtn" title="Индикаторы" aria-label="Индикаторы" ' +
                    'onclick="pfcMenu(' + n + ',\'ind\',event)">' + IC_IND + '</button>' +
                menuHtml(n, 'ind') +
            '</span>' +
            '<span class="btc-mwrap">' +
                '<button type="button" class="btr-iconbtn" title="Инструменты рисования" aria-label="Инструменты рисования" ' +
                    'onclick="pfcMenu(' + n + ',\'draw\',event)">' + IC_DRAW + '</button>' +
                menuHtml(n, 'draw') +
            '</span>';
        var head = PF.pfCardHead('', title, null, right);
        if (!ins) {
            return head + '<div class="btc-empty">' +
                '<div class="btc-empty-tt">Бумага не выбрана</div>' +
                '<div class="btc-empty-tx">Выберите бумагу в стакане этого слота — график встанет на неё сам.</div>' +
                '</div>';
        }
        return head + tfHtml(n) +
            '<div class="btc-note" id="btcNote_' + n + '"></div>' +
            '<div class="btc-mount" data-slot="' + n + '"></div>';
    }
    function chartCard(n) {
        n = slotNo(n);
        return '<div class="dash2-card pf-card2 btr-card btc-card" data-slot="' + n + '">' +
            chartCardHtml(n) + '</div>';
    }

    // подпись под шапкой: откуда взяты свечи и идёт ли загрузка
    function srcNote(c, err) {
        var el = document.getElementById('btcNote_' + c.slot);
        if (!el) return;
        if (err) { el.textContent = err; el.className = 'btc-note warn'; return; }
        el.textContent = (c.loading ? 'Загрузка · ' : '') +
            (c.src === 'moex' ? 'данные Московской биржи' : 'данные Т-Инвестиций');
        el.className = 'btc-note';
    }
    function mark(c, on) { c.loading = on; srcNote(c); }

    // ---------- монтаж ----------
    // Зовётся из хвоста renderPortfolios рядом с pftAfterRender: находит свежие
    // якоря и переносит в них живые узлы графиков.
    function afterRender() {
        var live = {};
        var mounts = document.querySelectorAll('#panel-portfolios.active .btc-mount');
        // движка ещё нет: качаем и возвращаемся сюда же, когда он появится
        if (!kc()) {
            if (mounts.length) {
                ensureEngine().then(function (ok) {
                    if (ok) afterRender();
                    else Array.prototype.forEach.call(mounts, function (m) {
                        m.innerHTML = '<div class="btc-err">Не удалось загрузить график. Проверьте соединение и обновите страницу.</div>';
                    });
                });
            }
            return;
        }
        Array.prototype.forEach.call(mounts, function (m) {
            var n = slotNo(m.getAttribute('data-slot'));
            live[n] = 1;
            var c = ensureChart(n, m);
            if (!c) return;
            c.slot = n;
            // ре-рендер вкладки собрал якорь заново — переносим живой узел в него
            if (c.host.parentNode !== m) m.appendChild(c.host);
            syncInstr(c, n);
            applyInds(c, n);
            srcNote(c);
            try { c.chart.resize(); } catch (e) {}
            if (c.liveCb && !c.timer) startLive(c);
        });
        // Блок ушёл с экрана (другая подвкладка, скрыли виджет): инстанс и его
        // состояние держим, но поллинг гасим — платить лимитом за невидимое
        // незачем. Заодно фиксируем построения: до закрытия страницы можно и не
        // дожить (переключил подвкладку, а вкладку потом закрыл через меню).
        Object.keys(CH).forEach(function (k) {
            if (live[k]) return;
            stopLive(CH[k]);
            saveOverlays(CH[k], k);
        });
    }
    // бумага слота сменилась (или появилась впервые) — перезаряжаем данные
    function syncInstr(c, n) {
        var ins = instr(n);
        if (!ins) return;
        var same = c.instr && c.instr.uid === ins.uid;
        c.instr = ins;
        if (same && c.tf === cfg(n).tf) return;
        c.tf = cfg(n).tf;
        c.src = 'ti';
        c.ovsDone = false;
        var tf = tfBy(c.tf);
        try {
            c.chart.setSymbol({ ticker: ins.ticker, pricePrecision: decOf(ins.minInc), volumePrecision: 0 });
            c.chart.setPeriod(tf.per);
        } catch (e) {}
        if (c.liveCb) startLive(c);
    }
    function decOf(step) {
        var s = String(step || 0.01);
        var i = s.indexOf('.');
        return i < 0 ? 0 : Math.min(9, s.length - i - 1);
    }

    // ---------- действия ----------
    window.pfcTf = function (n, k) {
        n = slotNo(n);
        cfg(n).tf = k;
        cfgSave();
        var c = CH[n];
        if (c) { saveOverlays(c, n); c.ovsDone = false; }
        // перерисовать только сегмент ТФ, не всю вкладку
        var card = document.querySelector('.btc-card[data-slot="' + n + '"] .btc-tf');
        if (card) {
            Array.prototype.forEach.call(card.children, function (b, i) {
                b.className = TF[i] && TF[i].k === k ? 'active' : '';
            });
        }
        if (c && c.chart) {
            c.tf = k;
            try { c.chart.setPeriod(tfBy(k).per); } catch (e) {}
            if (c.liveCb) startLive(c);
        }
        closeMenus();
    };
    window.pfcInd = function (n, name) {
        n = slotNo(n);
        var c2 = cfg(n), at = c2.inds.indexOf(name);
        if (at >= 0) c2.inds.splice(at, 1); else c2.inds.push(name);
        cfgSave();
        var c = CH[n];
        if (c) applyInds(c, n);
        // галочки в открытом меню — на месте, меню не закрываем: индикаторы
        // обычно включают пачкой
        var box = document.getElementById('btcMenuind_' + n);
        if (box) box.outerHTML = menuHtml(n, 'ind');
        var box2 = document.getElementById('btcMenuind_' + n);
        if (box2) box2.classList.add('open');
    };
    window.pfcDraw = function (n, name) {
        n = slotNo(n);
        var c = CH[slotNo(n)];
        if (c && c.chart) {
            // weak_magnet притягивает точку к ближайшей цене свечи — линии
            // ложатся по хаям/лоям, а не «примерно рядом»
            try { c.chart.createOverlay({ name: name, mode: 'weak_magnet' }); } catch (e) {}
        }
        closeMenus();
    };
    window.pfcDrawClear = function (n) {
        var c = CH[slotNo(n)];
        if (c && c.chart) { try { c.chart.removeOverlay(); } catch (e) {} }
        cfg(n).ovs = [];
        cfgSave();
        closeMenus();
    };
    window.pfcMenu = function (n, kind, ev) {
        if (ev) ev.stopPropagation();
        var id = 'btcMenu' + kind + '_' + slotNo(n);
        var box = document.getElementById(id);
        var was = box && box.classList.contains('open');
        closeMenus();
        if (box && !was) box.classList.add('open');
    };
    function closeMenus() {
        Array.prototype.forEach.call(document.querySelectorAll('.btc-menu.open'), function (b) {
            b.classList.remove('open');
        });
    }
    document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('.btc-mwrap')) closeMenus();
    });

    // ---------- внешние события ----------
    // бумага в слоте сменилась: заголовок карточки и данные графика — за ней
    window.addEventListener('pft-slot-change', function (e) {
        var n = slotNo(e.detail && e.detail.slot);
        var c = CH[n];
        if (c) { c.instr = null; syncInstr(c, n); }
        if (PF.pfdRerender) PF.pfdRerender();
    });
    // тема переключилась — движок не знает о наших классах на body
    try {
        var themeWas = themeDark();
        new MutationObserver(function () {
            var now = themeDark();
            if (now === themeWas) return;
            themeWas = now;
            var st = styles();
            Object.keys(CH).forEach(function (k) {
                if (CH[k].chart) { try { CH[k].chart.setStyles(st); } catch (e) {} }
            });
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    // ушли со вкладки браузера — поллинг ни к чему; вернулись — сразу дотянем свечу
    document.addEventListener('visibilitychange', function () {
        Object.keys(CH).forEach(function (k) {
            var c = CH[k];
            if (document.visibilityState === 'visible' && c.liveCb) { startLive(c); tickLive(c); }
        });
    });
    // построения сохраняем на уходе со страницы: чертить заново обидно
    window.addEventListener('beforeunload', function () {
        Object.keys(CH).forEach(function (k) { saveOverlays(CH[k], k); });
        try { localStorage.setItem(CFG_KEY, JSON.stringify(cfgAll())); } catch (e) {}
    });

    // слот удалён из конструктора — инстанс больше не нужен
    PF.pfcDropSlot = function (n) {
        n = slotNo(n);
        var c = CH[n];
        if (!c) return;
        stopLive(c);
        try { if (c.ro) c.ro.disconnect(); } catch (e) {}
        try { kc().dispose(c.host); } catch (e) {}
        delete CH[n];
    };

    PF.pfcChartCard = chartCard;
    PF.pfcAfterRender = afterRender;
    // инстанс движка по номеру слота — точка входа для отладки с консоли
    PF.pfcChart = function (n) { var c = CH[slotNo(n)]; return c ? c.chart : null; };
})();
