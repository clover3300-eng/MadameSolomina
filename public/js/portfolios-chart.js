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
    // Потолок истории на график. Движок просит ещё, ПОКА видимое окно упирается
    // в левый край, и на пустом/сброшенном графике это условие верно на каждом
    // кадре: без потолка виджет уходил в петлю и выдавал тысячи запросов к бирже.
    var MAX_BARS = 2500;
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
    // те же лупа и плюс, что в шапке стакана: жест «найти бумагу» и «добавить ещё»
    // должен выглядеть одинаково в обеих карточках терминала
    var IC_LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    // звено цепи — связь графика со стаканом и тикетом экрана; разорванное
    // звено (с косой чертой) читается как «график живёт своей бумагой»
    var IC_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5a4 4 0 0 1 0-5.7l2.1-2.1a4 4 0 1 1 5.7 5.7l-1 1"/><path d="M14.5 9.5a4 4 0 0 1 0 5.7l-2.1 2.1a4 4 0 1 1-5.7-5.7l1-1"/></svg>';
    var IC_UNLINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5a4 4 0 0 1 0-5.7l2.1-2.1a4 4 0 1 1 5.7 5.7l-1 1"/><path d="M14.5 9.5a4 4 0 0 1 0 5.7l-2.1 2.1a4 4 0 1 1-5.7-5.7l1-1"/><path d="M3.5 3.5 20.5 20.5"/></svg>';
    var IC_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

    // ---------- состояние ----------
    // n -> { host, chart, slot, instr, tf, src, timer, liveCb, loading }
    var CH = {};
    // Графиков может быть несколько, и нумерация у них СВОЯ, не слотов терминала:
    // график живёт своей бумагой (можно смотреть один тикер, торгуя другим) и
    // опрашивает биржу редко, поэтому его копии не расходуют лимит слотов.
    // ...на ОДНОМ экране: «Торговля» держит несколько экранов (см. pfxIsTradeTab),
    // и графики соседнего экрана не рисуются, пока на него не переключились
    var MAX_CHARTS = 4;
    // сквозной потолок номеров на все экраны: состояние графика (CH[n]) общее по
    // номеру, поэтому один номер на двух экранах показывал бы одну бумагу дважды
    var MAX_CHARTS_ALL = 16;
    function slotNo(n) { n = Math.floor(+n || 1); return n >= 1 ? n : 1; }
    function chId(n) { return slotNo(n) === 1 ? 'trade:chart' : 'trade:chart:' + slotNo(n); }
    function cfgCharts(cfg, out) {
        ((cfg && cfg.order) || []).forEach(function (id) {
            var m = /^trade:chart(?::(\d+))?$/.exec(id);
            if (m) out[slotNo(m[1] || 1)] = 1;
        });
        return out;
    }
    function tradeTabs() { return PF.pfxTradeTabs ? PF.pfxTradeTabs() : ['trading']; }
    // конфиг экрана. dashCfgFor безопасен: сид (а с ним nextFreeChart) он зовёт
    // только на НЕЗНАКОМОМ ключе, а tradeTabs перечисляет уже существующие —
    // зато у первого экрана записи в pf_dash_tabs_v1 может не быть вовсе
    function cfgOf(t) {
        if (t === PF.dashTab) return PF.dashCfg;
        try { return PF.dashCfgFor(t); } catch (e) { return null; }
    }
    // графики ЭТОГО экрана: что в его раскладке + свои графики, никем не занятые
    function chartNums() {
        var elsewhere = {};
        tradeTabs().forEach(function (t) { if (t !== PF.dashTab) cfgCharts(cfgOf(t), elsewhere); });
        var set = cfgCharts(PF.dashCfg, {});
        Object.keys(CH).forEach(function (n) { if (!elsewhere[slotNo(n)]) set[slotNo(n)] = 1; });
        var out = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
        return out.length ? out : [1];
    }
    // свободный номер ищем по ВСЕМ экранам разом
    function nextFreeChart() {
        var used = {};
        tradeTabs().forEach(function (t) { cfgCharts(cfgOf(t), used); });
        Object.keys(CH).forEach(function (n) { used[slotNo(n)] = 1; });
        for (var i = 1; i <= MAX_CHARTS_ALL; i++) if (!used[i]) return i;
        return 0;
    }
    function A() { return window.brokerApi; }
    // Бумага графика: сначала СВОЙ выбор (поиск в шапке), и лишь если его не было —
    // бумага одноимённого слота терминала. Так первый график из коробки показывает
    // то, что в стакане, но перестаёт за ним следовать, как только выбрали своё.
    function instr(n) {
        var own = cfg(n).ins;
        if (own && own.uid) return own;
        // своего выбора не было — берём бумагу ПАРНОГО слота экрана: номера у
        // графиков и слотов из разных пулов и совпадают не всегда (см. pftScreenPair)
        var slot = (linkOn(n) && PF.pftSlotOfChart && PF.pftSlotOfChart(n)) || slotNo(n);
        return (PF.pftSlotInstr && PF.pftSlotInstr(slot)) || null;
    }
    function chartLabel(n) {
        var i = instr(n);
        if (i) return 'График · ' + i.ticker;
        return chartNums().length > 1 ? 'График ' + slotNo(n) : 'График';
    }
    function kc() { return window.klinecharts; }

    // РУССКАЯ ЛОКАЛЬ — РЕГИСТРИРУЕМ САМИ, И ЭТО НЕ КОСМЕТИКА.
    // В вендоренной сборке ровно две локали: 'zh-CN' и 'en-US'. Достаёт их
    // `Fe(t, e) { return Be[e][t] ?? t; }` — БЕЗ проверки, что Be[e] существует.
    // С locale:'ru-RU' это Be['ru-RU'][t] → TypeError на КАЖДОЙ отрисовке легенды
    // свечной панели.
    //
    // Почему от этого «пропадает график». Рисование идёт через Canvas._executeListener:
    //     this._requestAnimationId === B && (this._requestAnimationId = F(function () {
    //         e._ctx.clearRect(…);   // чистим
    //         null == t || t();      // _resetPixelRatio: меняет размер бэкстора
    //         e._listener();         // рисуем → ИСКЛЮЧЕНИЕ
    //         e._requestAnimationId = B;   // ← сюда уже не доходим
    //     }));
    // Флаг остаётся взведённым, и все следующие вызовы выходят по первой строке.
    // А размер бэкстора меняется ИМЕННО отсюда — значит слой перестаёт и рисоваться,
    // и ресайзиться. Замер A/B (одинаковые графики, разница только в локали),
    // CSS-бокс 1949px: 'en-US' — обе канвы 3508; 'ru-RU' — свечи 3508, а ОВЕРЛЕЙ
    // намертво 1298. Чем шире тянуть карточку, тем сильнее мёртвый слой растянут
    // поверх свечей. На нём живут перекрестье, строка легенды, ВСЕ построения
    // (pfcDraw) и линии заявок/средней (syncOrderLines) — всё это пропадало.
    //
    // Ключи — те же, что у 'en-US' в сборке. Неполный объект был бы безопасен
    // (`?? t` вернёт сам ключ), но подписи тултипа тогда полезут английские.
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
        // Из коробки — чистый график: дневные свечи и объём, без единого
        // осциллятора. Индикаторы добавляют те, кому они нужны.
        if (!tfExists(c.tf)) c.tf = '1d';
        if (!Array.isArray(c.inds)) c.inds = ['VOL'];
        if (!Array.isArray(c.ovs)) c.ovs = [];
        c.ins = normIns(c.ins);
        // связь с парным слотом экрана: по умолчанию ВКЛЮЧЕНА — бумага, выбранная
        // в графике, встаёт в стакан и тикет, и наоборот (см. pftScreenPair).
        // Кнопка-звено в шапке рвёт связь тем, кто смотрит одну бумагу, торгуя другой
        c.link = (c.link === 0 || c.link === false) ? 0 : 1;
        return c;
    }
    function linkOn(n) { return !!cfg(n).link; }
    // Паспорт бумаги приходит из localStorage — то есть может быть подделан или
    // протух: приводим типы руками и не пускаем внутрь ничего сверх известных
    // полей (тот же приём, что у слотов терминала).
    function normIns(m) {
        if (!m || typeof m !== 'object') return null;
        var t = String(m.ticker || '').slice(0, 24);
        var uid = String(m.uid || '').slice(0, 64);
        if (!t || !/^[A-Za-z0-9_-]+$/.test(uid)) return null;
        return {
            uid: uid, ticker: t,
            name: String(m.name || '').slice(0, 160),
            figi: /^[A-Za-z0-9_-]*$/.test(String(m.figi || '')) ? String(m.figi || '').slice(0, 64) : '',
            lot: Math.max(1, Math.floor(+m.lot || 1)),
            minInc: +m.minInc > 0 ? +m.minInc : 0.01
        };
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
        // через прокси (window.issUrl из core.js, НЕ путать с локальным moexUrl):
        // прямой iss.moex.com у части пользователей режется (CORS/сеть)
        var u = moexUrl(ticker, mkt, tf, from, to);
        return fetch(window.issUrl ? window.issUrl(u) : u, { credentials: 'omit' })
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
        ensureLocale();   // ОБЯЗАТЕЛЬНО до init: без неё 'ru-RU' роняет отрисовку (см. выше)
        var chart = kc().init(host, {
            locale: 'ru-RU',
            timezone: 'Europe/Moscow',
            styles: styles()
        });
        if (!chart) { try { mount.removeChild(host); } catch (e) {} return null; }
        fixZoomPointer(chart);
        c = CH[n] = { host: host, chart: chart, slot: n, instr: null, tf: cfg(n).tf, src: 'ti', timer: null, liveCb: null };
        chart.setDataLoader(makeLoader(c));
        // клик по свече кладёт её закрытие в ценовое поле тикета — тот же жест,
        // что клик по строке стакана (pftPickPrice)
        chart.subscribeAction('onCandleBarClick', function (data) {
            if (!data || !data.close) return;
            if (window.pftPickPrice) window.pftPickPrice(n, round(data.close, c.instr));
        });
        // Свой ResizeObserver: карточку тянут за угол конструктора, и движку надо
        // не только пересчитать канву, но и переразложить панели под новый бокс.
        // Ресайз идёт непрерывно во время жеста — считаем на следующем кадре,
        // чтобы не дёргать движок по разу на каждый пиксель.
        try {
            c.ro = new ResizeObserver(function () {
                if (c.roRaf) return;
                c.roRaf = requestAnimationFrame(function () {
                    c.roRaf = 0;
                    try { chart.resize(); sizePanes(c); } catch (e) {}
                });
            });
            c.ro.observe(host);
        } catch (e) {}
        return c;
    }
    // ЗУМ И КУРСОР. У сайта body{zoom:.9} (css/desktop-zoom.css), и движок на этом
    // спотыкается: канву он меряет в layout-px (clientWidth), а позицию курсора
    // берёт как clientX - rect.left, то есть в ВИЗУАЛЬНЫХ px. Пространства разные,
    // и перекрестье садится левее курсора на 10% расстояния до левого края графика
    // (замер: курсор в 400 px от края — линия даты в 360). Вправо ошибка растёт,
    // и на широком виджете это уже почти сотня пикселей.
    //
    // Все координаты движка — мышь, тач, протяжка, колесо — идут через один метод
    // _makeCompatEvent, поэтому чиним в нём, а не перехватом событий: сам патч
    // одноразовый, на прототипе. Вендорный файл не трогаем, чтобы обновление
    // движка не пришлось накатывать поверх наших правок.
    //
    // Коэффициент берём у САМОГО элемента (currentCSSZoom, запасной путь —
    // отношение визуальной ширины к layout-ширине): при zoom:1 на мобиле и на
    // случай, если общий множитель когда-нибудь сменится, множитель сам себя
    // калибрует. pageX/pageY движок использует только как ОТНОШЕНИЕ (масштаб оси
    // времени щипком), там поправка не нужна.
    // Флаг ОБЩИЙ со вторым потребителем движка (js/market-chart.js, график
    // IMOEX на «Рынке»): патч живёт на прототипе, один на страницу — второй
    // поделил бы координаты на zoom дважды и увёл курсор в другую сторону.
    var zoomFixed = false;
    function fixZoomPointer(chart) {
        if (zoomFixed || window.__kcZoomPatched) { zoomFixed = true; return; }
        try {
            var ev = chart._chartEvent && chart._chartEvent._event;
            var proto = ev && Object.getPrototypeOf(ev);
            if (!proto || typeof proto._makeCompatEvent !== 'function') return;
            var orig = proto._makeCompatEvent;
            proto._makeCompatEvent = function (e, touch) {
                var r = orig.call(this, e, touch);
                var z = zoomOf(this._target);
                if (Math.abs(z - 1) > 0.001) { r.x /= z; r.y /= z; }
                return r;
            };
            zoomFixed = true;
            window.__kcZoomPatched = true;
        } catch (e) {}
    }
    function zoomOf(el) {
        if (!el) return 1;
        var z = el.currentCSSZoom;                       // Chrome 128+, точное значение
        if (typeof z === 'number' && z > 0) return z;
        var w = el.getBoundingClientRect().width, lw = el.offsetWidth;
        return (w > 0 && lw > 0) ? w / lw : 1;
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
                // набрали столько, что дальше листать бессмысленно — закрываем
                // подкачку, иначе левый край графика просит историю без конца
                var loaded = (c.chart.getDataList() || []).length;
                if (p.type === 'forward' && loaded >= MAX_BARS) {
                    p.callback([], { forward: false, backward: false });
                    return;
                }
                mark(c, true);
                var to = p.type === 'forward' && p.timestamp ? p.timestamp : Date.now();
                var want = p.type === 'init' ? MIN_BARS : 60;
                return loadBack(c, tf, to, want).then(function (rows) {
                    if (p.type === 'forward' && p.timestamp) {
                        rows = rows.filter(function (r) { return r.timestamp < p.timestamp; });
                    }
                    // Дубли отсекаем только на ДОГРУЗКЕ истории. На 'init' список
                    // ещё держит свечи прошлой бумаги, а у дневок разных бумаг
                    // одни и те же даты — фильтр вырезал бы всю новую бумагу
                    // целиком, и смена тикера давала пустой график.
                    if (p.type !== 'init') rows = fresh(c, rows);
                    mark(c, false);
                    // forward:false движок понимает как «история кончилась» и
                    // больше её не просит — ставим его только на пустой ответ
                    p.callback(rows, { forward: rows.length > 0, backward: false });
                    // линии заявок ставим после первой загрузки данных: до неё у
                    // графика нет ценовой шкалы, и overlay лёг бы в пустоту
                    if (p.type === 'init') { restoreOverlays(c); syncOrderLines(c); }
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
    function isOverlayInd(name) { return IND_OVER.some(function (x) { return x.n === name; }); }
    // Свечам нужно место. Если карточку сжали так, что осцилляторам пришлось бы
    // отдать треть бокса, панели прячем совсем: чистый график читается, а полоска
    // свечей в восемь пикселей — нет. Настройки не трогаем: вернули высоту —
    // вернулись и индикаторы.
    function tightNow(c, n) {
        var h = c.host ? c.host.clientHeight : 0;
        var need = cfg(n).inds.filter(function (x) { return !isOverlayInd(x); }).length;
        if (!h || !need) return false;
        return (h - 26) < 140 + need * 32;
    }
    function applyInds(c, n) {
        if (!c.chart) return;
        c.tight = tightNow(c, n);
        // наложения (скользящие, полосы) живут на самих свечах и места не просят —
        // их прячем только по прямому выбору пользователя
        var want = cfg(n).inds.filter(function (name) { return !c.tight || isOverlayInd(name); });
        var have = c.chart.getIndicators() || [];
        have.forEach(function (ind) {
            if (want.indexOf(ind.name) < 0) c.chart.removeIndicator({ paneId: ind.paneId, name: ind.name });
        });
        var haveNames = have.map(function (i) { return i.name; });
        want.forEach(function (name) {
            if (haveNames.indexOf(name) >= 0) return;
            var over = IND_OVER.some(function (x) { return x.n === name; });
            try {
                // Объём рисуем ГОЛОЙ гистограммой: со скользящими по умолчанию его
                // легенда занимает строку «VOL(5,10,20) MA5 … MA10 … MA20 …» и
                // спорит со свечами за внимание.
                var mk = { name: name };
                if (name === 'VOL') mk.calcParams = [];
                if (over) mk.paneId = 'candle_pane';
                c.chart.createIndicator(mk, true);
            } catch (e) {}
        });
        sizePanes(c);
    }
    // Высота панелей осцилляторов — ДОЛЯ от карточки, а не фикс: виджет тянут за
    // угол конструктора, и 74px, разумные в высокой карточке, съедали бы все
    // свечи в низкой. Свечам всегда остаётся большая часть.
    function sizePanes(c) {
        if (!c.chart || !c.host || c.sizing) return;
        var h = c.host.clientHeight || 0;
        if (!h) return;
        var n = c.slot;
        // порог «тесно» перешли в другую сторону — пересобрать набор индикаторов
        // (applyInds сам вернётся сюда, поэтому закрываемся флагом от петли)
        if (n && tightNow(c, n) !== !!c.tight) {
            c.sizing = true;
            try { applyInds(c, n); } finally { c.sizing = false; }
        }
        var panes = (c.chart.getPaneOptions() || []).filter(function (p) {
            return p.id !== 'candle_pane' && p.id !== 'x_axis_pane';
        });
        if (!panes.length) return;
        // на каждую доп. панель — 18% высоты, но в разумных пределах; и вместе
        // они не должны отнять у свечей больше 40% бокса
        var each = clampNum(Math.round(h * 0.18), 34, 92);
        var cap = Math.floor((h - 26) * 0.4);
        if (each * panes.length > cap) each = Math.max(28, Math.floor(cap / panes.length));
        panes.forEach(function (p) {
            try { c.chart.setPaneOptions({ id: p.id, height: each, minHeight: 28 }); } catch (e) {}
        });
    }
    function clampNum(v, a, b) { return v < a ? a : v > b ? b : v; }
    // Начерченное переживает уход со вкладки: сохраняем имя и точки (время+цена),
    // при следующей загрузке данных рисуем заново. Без этого трендовые линии
    // пропадали бы при каждом переключении подвкладки.
    function saveOverlays(c, n) {
        if (!c.chart) return;
        var list = (c.chart.getOverlays() || []).filter(function (o) {
            // линии заявок рисует терминал, а не пользователь: попади они в
            // сохранённые построения — остались бы на графике призраками
            // давно исполненных заявок
            return String(o.id || '').indexOf(ORD_OV) !== 0;
        }).map(function (o) {
            return { name: o.name, points: (o.points || []).map(function (p) {
                return { timestamp: p.timestamp, value: p.value };
            }) };
        }).filter(function (o) { return o.points.length; });
        cfg(n).ovs = list.slice(0, 60);
        cfgSave();
    }

    // ---------- заявки и позиция линиями на графике ----------
    // Здесь график и стакан наконец срастаются: видно, где стоят свои заявки,
    // где защита и по какой цене набрана позиция — не сверяя два списка глазами.
    // Линии ЗАБЛОКИРОВАНЫ (lock): перетаскивание двигало бы реальную заявку
    // без подтверждения — перенос цены живёт в «Моих заявках» с модалкой.
    var ORD_OV = 'pfcord_';
    var ORD_COL = { buy: '#16a34a', sell: '#dc2626', avg: '#3b82f6' };
    function clearOrderLines(c) {
        (c.ordOv || []).forEach(function (id) {
            try { c.chart.removeOverlay({ id: id }); } catch (e) {}
        });
        c.ordOv = [];
    }
    function syncOrderLines(c) {
        if (!c || !c.chart || !c.instr || !c.instr.uid) return;
        if (!PF.pftLinesFor) return;
        clearOrderLines(c);
        var lines = [];
        try { lines = PF.pftLinesFor(c.instr.uid) || []; } catch (e) { return; }
        lines.slice(0, 24).forEach(function (l, i) {
            var id = ORD_OV + c.slot + '_' + i;
            var col = l.kind === 'avg' ? ORD_COL.avg : (l.buy ? ORD_COL.buy : ORD_COL.sell);
            var lab = l.kind === 'avg' ? 'средняя'
                : (l.kind === 'stop' ? (l.tp ? 'тейк' : 'стоп') : (l.buy ? 'покупка' : 'продажа'));
            if (l.lots) lab += ' ' + l.lots + ' лот';
            try {
                c.chart.createOverlay({
                    id: id, name: 'priceLine', lock: true, points: [{ value: l.px }],
                    styles: {
                        line: { color: col, size: 1, style: l.kind === 'avg' ? 'solid' : 'dashed' },
                        text: { color: '#fff', backgroundColor: col, size: 10, family: 'inherit' }
                    },
                    extendData: lab
                });
                c.ordOv.push(id);
            } catch (e) { /* движок мог не принять стиль — линия просто не появится */ }
        });
    }
    // зовётся из терминала в такт с обновлением «Моих заявок»
    PF.pfcSyncLines = function () {
        Object.keys(CH).forEach(function (k) { syncOrderLines(CH[k]); });
    };
    function restoreOverlays(c) {
        var saved = cfg(c.slot).ovs || [];
        if (!saved.length || c.ovsDone) return;
        c.ovsDone = true;
        saved.forEach(function (o) {
            try { c.chart.createOverlay({ name: o.name, points: o.points }); } catch (e) {}
        });
    }

    // ---------- карточка ----------
    // Шапка графика в фокусе — ОДНОЙ строкой (макет 01): тикер, имя, цена,
    // дельта за день и таймфреймы. Отдельного ряда под таймфреймы больше нет:
    // в полноэкранном каждая строка хрома отнимает высоту у самого графика.
    // Цену берём у терминала (PF.pftLastFor) — стакан её и так опрашивает.
    function chartHeadFs(n, ins, right) {
        var px = PF.pftLastFor ? PF.pftLastFor(ins.uid) : null;
        var d = 2, num = '';
        if (px) {
            d = px.minInc < 0.01 ? 4 : 2;
            num = '<span class="btc-h-px">' + px.last.toLocaleString('ru-RU',
                { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ₽</span>';
            if (px.close > 0) {
                var dt = (px.last / px.close - 1) * 100;
                num += '<span class="btc-h-dt ' + (dt >= 0 ? 'up' : 'dn') + '">' +
                    (dt >= 0 ? '+' : '−') + Math.abs(dt).toFixed(2).replace('.', ',') + '%</span>';
            }
        }
        return '<div class="pf-ch btc-h">' +
            '<span class="btc-h-tk">' + esc(ins.ticker || '') + '</span>' +
            '<span class="btc-h-nm">' + esc(ins.name || '') + '</span>' + num +
            tfHtml(n) + right + '</div>';
    }
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
    var SOPEN = {};   // n -> развёрнут ли поиск бумаги (переживает своп карточки)
    var SRES = {};    // n -> последняя выдача поиска (по индексу из onclick)
    function chartCardHtml(n) {
        var ins = instr(n);
        var open = SOPEN[n] || !ins;   // без бумаги поиск открыт сразу — иначе тупик
        var lens = '<button type="button" class="btr-iconbtn' + (open ? ' on' : '') + '" ' +
            'title="Выбрать бумагу" aria-label="Выбрать бумагу" onclick="pfcSearchToggle(' + n + ')">' + IC_LENS + '</button>';
        // «+» — второй график, не заходя в «Добавить виджет» (как «+» у стакана)
        var add = nextFreeChart()
            ? '<button type="button" class="btr-iconbtn" title="Ещё один график" ' +
              'aria-label="Добавить ещё один график" onclick="pfcAddChart()">' + IC_PLUS + '</button>'
            : '';
        // звено показываем, только когда паре есть с кем связываться (на экране
        // есть свой стакан): у одинокого графика кнопка ничего не значила бы
        var pairSlot = PF.pftSlotOfChart ? PF.pftSlotOfChart(n) : 0;
        var on = linkOn(n);
        var link = pairSlot
            ? '<button type="button" class="btr-iconbtn btc-link' + (on ? ' on' : '') + '" ' +
              'title="' + (on ? 'Бумага общая со стаканом и заявкой — нажмите, чтобы отвязать график' :
                                'График живёт своей бумагой — нажмите, чтобы вести его за стаканом') + '" ' +
              'aria-pressed="' + on + '" aria-label="Связать график со стаканом" ' +
              'onclick="pfcLink(' + n + ')">' + (on ? IC_LINK : IC_UNLINK) + '</button>'
            : '';
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
            '</span>' + link + add + lens;
        // ШАПКА В ФОКУСЕ — одной строкой (макет 01): тикер · имя · цена · дельта
        // за день, таймфреймы туда же, отдельного ряда под ними больше нет. В
        // дашборде остаётся прежний заголовок: там карточка узкая и в строку
        // всё это не встанет.
        var fs = !!(PF.pftFsOn && PF.pftFsOn());
        var head = (fs && ins)
            ? chartHeadFs(n, ins, right)
            : PF.pfCardHead('', chartLabel(n), null, right);
        var search = '<div class="btr-search' + (open ? ' open' : '') + '" id="btcSearchWrap_' + n + '">' +
            '<input class="ph-input" id="btcSearch_' + n + '" type="text" ' +
            'placeholder="Тикер или название — например, SBER" autocomplete="off" spellcheck="false">' +
            '<div class="btr-search-drop" id="btcSearchDrop_' + n + '"></div></div>';
        if (!ins) {
            return head + search + '<div class="btc-empty">' +
                '<div class="btc-empty-tt">Бумага не выбрана</div>' +
                '<div class="btc-empty-tx">Найдите бумагу в поиске выше — или выберите её в стакане, и график встанет на неё сам.</div>' +
                '</div>';
        }
        // таймфреймы в фокусе уже стоят в шапке — вторым рядом их не повторяем
        return head + search + (fs ? '' : tfHtml(n)) +
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
        // поиск подключаем у ВСЕХ карточек, включая пустые: там он — единственный
        // способ выбрать бумагу, а якоря графика в них ещё нет
        Array.prototype.forEach.call(document.querySelectorAll('#panel-portfolios.active .btc-card'), function (card) {
            wireSearch(slotNo(card.getAttribute('data-slot')));
        });
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
    // Каждый из setSymbol/setPeriod внутри движка делает полный resetData и
    // запускает загрузку заново. Вызвать оба подряд — значит стартовать две
    // гонящиеся инициализации: первая успевает записать свечи, вторая их
    // затирает, и график остаётся пустым. Поэтому дёргаем ровно то, что реально
    // изменилось, и только один раз.
    function syncInstr(c, n) {
        var ins = instr(n);
        if (!ins) return;
        var newSym = !c.instr || c.instr.uid !== ins.uid;
        var newTf = c.tf !== cfg(n).tf;
        c.instr = ins;
        if (!newSym && !newTf) return;
        c.tf = cfg(n).tf;
        c.src = 'ti';
        c.ovsDone = false;
        try {
            // период — первым, бумагу — второй: загрузку запускает ПОСЛЕДНИЙ
            // вызов, и он должен видеть уже актуальный таймфрейм
            var per = tfBy(c.tf).per, cur = c.chart.getPeriod();
            if (!cur || cur.type !== per.type || cur.span !== per.span) c.chart.setPeriod(per);
            if (newSym) c.chart.setSymbol({ ticker: ins.ticker, pricePrecision: decOf(ins.minInc), volumePrecision: 0 });
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
    // ---------- выбор бумаги ----------
    window.pfcSearchToggle = function (n) {
        n = slotNo(n);
        SOPEN[n] = !SOPEN[n];
        var w = document.getElementById('btcSearchWrap_' + n);
        if (w) w.classList.toggle('open', !!SOPEN[n]);
        // кнопку-лупу подсвечиваем как у стакана и сразу отдаём ей фокус
        var card = document.querySelector('.btc-card[data-slot="' + n + '"]');
        var lens = card ? card.querySelector('.pf-ch .btr-iconbtn:last-child') : null;
        if (lens) lens.classList.toggle('on', !!SOPEN[n]);
        if (SOPEN[n]) {
            var i = document.getElementById('btcSearch_' + n);
            if (i) { try { i.focus(); } catch (e) {} }
        }
    };
    var searchT = {};
    // Поиск — общий с терминалом (PF.pftFindInstruments): то же ранжирование, что
    // в стакане. Без брокера искать нечем: у ISS нет поиска по uid, а график всё
    // равно возьмёт бумагу из слота.
    function wireSearch(n) {
        var inp = document.getElementById('btcSearch_' + n);
        if (!inp || inp._wired) return;
        inp._wired = true;
        inp.addEventListener('input', function () {
            var q = inp.value.trim();
            clearTimeout(searchT[n]);
            if (q.length < 2) { drawDrop(n, [], ''); return; }
            searchT[n] = setTimeout(function () {
                if (!PF.pftFindInstruments) { drawDrop(n, [], q); return; }
                PF.pftFindInstruments(q).then(function (list) {
                    drawDrop(n, list.slice(0, 8), q);
                }).catch(function (e) { toast(e.message, true); });
            }, 350);
        });
    }
    function drawDrop(n, list, q) {
        var d = document.getElementById('btcSearchDrop_' + n);
        if (!d) return;
        SRES[n] = list;
        if (!list.length) {
            d.innerHTML = q ? '<div class="btr-search-none">Ничего не нашли по запросу «' + esc(q) + '»</div>' : '';
            d.classList.toggle('open', !!q);
            return;
        }
        d.innerHTML = list.map(function (i, k) {
            var tag = PF.pftInstrTag ? PF.pftInstrTag(i) : '';
            return '<div class="btr-search-row" role="button" onclick="pfcPick(' + n + ',' + k + ')">' +
                '<b>' + esc(i.ticker || '') + '</b><span>' + esc(i.name || '') + '</span>' +
                (tag ? '<i class="btr-search-tag">' + tag + '</i>' : '') + '</div>';
        }).join('');
        d.classList.add('open');
    }
    window.pfcPick = function (n, k) {
        n = slotNo(n);
        var i = (SRES[n] || [])[k];
        if (!i || !i.uid) return;
        // паспорт нужен ради шага цены: клик по свече кладёт цену в тикет, а её
        // надо округлить к шагу инструмента — иначе брокер отвергнет заявку
        var base = { uid: i.uid, ticker: i.ticker || '', name: i.name || '', figi: i.figi || '', lot: 1, minInc: 0.01 };
        applyPick(n, base);
        if (PF.pftInstrMeta) {
            PF.pftInstrMeta(i.uid).then(function (m) {
                if (m && m.ticker) applyPick(n, m, true);
            }, function () {});
        }
        // связанный график ведёт за собой стакан и тикет своего экрана: тикер
        // вводят ОДИН раз, в любом из трёх виджетов. Слот сам пришлёт
        // pft-slot-change — обработчик ниже увидит ту же бумагу и не зациклится
        if (linkOn(n) && PF.pftLoadInstrument) {
            var slot = PF.pftSlotOfChart ? PF.pftSlotOfChart(n) : 0;
            if (slot) PF.pftLoadInstrument(slot, i.uid);
        }
    };
    function applyPick(n, ins, quiet) {
        var c2 = cfg(n);
        c2.ins = normIns(ins);
        c2.ovs = [];              // построения были по другой бумаге — не переносим
        cfgSave();
        var c = CH[n];
        // линии заявок были по ПРЕЖНЕЙ бумаге — снимаем сразу, не дожидаясь
        // загрузки новой: иначе на чужих свечах висят чужие цены
        if (c && c.chart) clearOrderLines(c);
        if (c) { c.instr = null; c.ovsDone = false; }
        SOPEN[n] = false;
        if (!quiet) {
            if (PF.pfdRerender) PF.pfdRerender();
            else if (PF.renderNoAnim) PF.renderNoAnim();
        }
    }
    // «+» в шапке и «Ещё один график» из пикера
    window.pfcAddChart = function (quiet) {
        // потолок экранный: упёрлись — новый экран внизу даёт ещё четыре
        if (chartNums().length >= MAX_CHARTS) {
            toast('Больше ' + MAX_CHARTS + ' графиков на одном экране не держим — заведите новый экран внизу', true);
            return false;
        }
        var n = nextFreeChart();
        if (!n) { toast('Больше ' + MAX_CHARTS_ALL + ' графиков разом терминал не держит', true); return false; }
        if (!PF.pfdAddChart) { toast('Конструктор не готов — обновите страницу', true); return false; }
        PF.pfdAddChart(n, quiet);
        return true;
    };

    // звено: включили — график сразу встаёт на бумагу своего стакана (иначе
    // «связал», а ничего не произошло, и связь выглядит сломанной)
    window.pfcLink = function (n) {
        n = slotNo(n);
        var c = cfg(n);
        c.link = c.link ? 0 : 1;
        cfgSave();
        if (c.link) {
            var slot = PF.pftSlotOfChart ? PF.pftSlotOfChart(n) : 0;
            var ins = slot && PF.pftSlotInstr ? PF.pftSlotInstr(slot) : null;
            // бумага есть только у графика — ведём стакан за ним, а не гасим выбор
            if (ins) applyPick(n, ins, true);
            else if (slot && c.ins && PF.pftLoadInstrument) PF.pftLoadInstrument(slot, c.ins.uid);
            toast('График связан со стаканом и заявкой этого экрана');
        } else toast('График отвязан — теперь у него своя бумага');
        if (PF.pfdRerender) PF.pfdRerender();
        else if (PF.renderNoAnim) PF.renderNoAnim();
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
        // СВЯЗАННЫЙ график экрана идёт за бумагой слота, даже если у него был свой
        // выбор: выбрал тикер в стакане — свечи те же, вводить второй раз не надо.
        // Номер графика с номером слота совпадать не обязан (пулы номеров разные),
        // пару держит порядок блоков в раскладке — pftChartOfSlot
        var ch = PF.pftChartOfSlot ? PF.pftChartOfSlot(n) : 0;
        if (ch && linkOn(ch)) {
            var ins = PF.pftSlotInstr ? PF.pftSlotInstr(n) : null;
            var cur = cfg(ch).ins;
            if (ins && (!cur || cur.uid !== ins.uid)) applyPick(ch, ins, true);
        }
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

    // график убран из конструктора — инстанс и его настройки больше не нужны
    PF.pfcDropChart = function (n) {
        n = slotNo(n);
        var c = CH[n];
        if (c) {
            stopLive(c);
            try { if (c.ro) c.ro.disconnect(); } catch (e) {}
            try { kc().dispose(c.host); } catch (e) {}
            delete CH[n];
        }
        // со второго графика и дальше номер освобождается под новый — старые
        // настройки (бумага, ТФ, построения) не должны всплыть у следующего
        if (n > 1) { delete cfgAll()[String(n)]; cfgSave(); }
        delete SOPEN[n]; delete SRES[n];
    };

    PF.pfcChartCard = chartCard;
    PF.pfcAfterRender = afterRender;
    PF.pfcChartNums = chartNums;
    PF.pfcChartLabel = chartLabel;
    PF.pfcMaxCharts = MAX_CHARTS;
    // новому экрану «Торговли» нужен свободный номер графика (pfxTabSeed)
    PF.pfcNextFreeChart = nextFreeChart;
    // ...а дублированию экрана — СРАЗУ НЕСКОЛЬКО: nextFreeChart смотрит на
    // раскладки, и подряд он вернул бы один и тот же номер (новых блоков там
    // ещё нет). Отдаём столько свободных, сколько нашлось, по возрастанию
    PF.pfcFreeCharts = function (count) {
        var used = {};
        tradeTabs().forEach(function (t) { cfgCharts(cfgOf(t), used); });
        Object.keys(CH).forEach(function (n) { used[slotNo(n)] = 1; });
        var out = [];
        for (var i = 1; i <= MAX_CHARTS_ALL && out.length < count; i++) if (!used[i]) out.push(i);
        return out;
    };
    // экран удалили — забываем его графики тем же путём, что корзина конструктора:
    // номера освобождаются, настройки и построения не всплывают у следующего
    PF.pfcForgetCharts = function (nums) {
        (nums || []).forEach(function (n) { PF.pfcDropChart(n); });
    };
    // инстанс движка по номеру графика — точка входа для отладки с консоли
    PF.pfcChart = function (n) { var c = CH[slotNo(n)]; return c ? c.chart : null; };
    // ---- сцене «Эволюции» (portfolios-trading.js) нужен тот же движок ----
    // Экспортируем готовые куски вместо их дублирования: ленивая загрузка
    // вендора, русская локаль (без неё 'ru-RU' роняет отрисовку, см. выше) и
    // зум-патч указателя. Патч ОБЩИЙ через флаг этого модуля — вторая копия
    // обёртки делила бы координаты на zoom дважды.
    PF.pfcEngineReady = function () {
        return ensureEngine().then(function (ok) {
            if (ok) ensureLocale();
            return ok;
        });
    };
    PF.pfcZoomFix = fixZoomPointer;
})();
