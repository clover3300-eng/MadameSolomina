/* ============================================================================
   МОДУЛЬ «ТЕПЛОВАЯ КАРТА ИНДЕКСА МОСБИРЖИ» — вкладка Рынок (#mhCard)
   ----------------------------------------------------------------------------
   Squarified-treemap по составу индекса IMOEX на бесплатных данных ISS API
   Московской биржи (iss.moex.com, CORS открыт):
     • состав + веса      — statistics/.../index/analytics/IMOEX.json
     • секторы            — состав отраслевых индексов MOEXOG/FN/MM/IT/… (динамически)
     • цена/изм%/объём    — engines/stock/markets/shares/boards/TQBR/securities
     • значение индекса   — engines/stock/markets/index/securities (IMOEX)
   Размер плитки = вес в индексе ИЛИ объём торгов, цвет = дневное изменение цены
   (LASTTOPREVPRICE). Плюс шапка-пульс рынка, drill-down по секторам, живые
   вспышки котировок, плавные переходы и сортируемая таблица под картой.

   Классический скрипт (без модулей), грузится ПОСЛЕ market-chart.js — оборачивает
   switchTab, чтобы лениво строиться при первом заходе на «Рынок». Котировки
   обновляются раз в 30 c, пока вкладка открыта и страница видима (задержка ~15 мин).
   ========================================================================== */
(function () {
    'use strict';

    var ISS = 'https://iss.moex.com/iss/';
    var ANALYTICS_URL = ISS + 'statistics/engines/stock/markets/index/analytics/IMOEX.json' +
        '?iss.meta=off&iss.only=analytics&analytics.columns=ticker,shortnames,weight&limit=100';
    var MARKETDATA_URL = ISS + 'engines/stock/markets/shares/boards/TQBR/securities.json' +
        '?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VALTODAY,UPDATETIME';
    var INDEX_URL = ISS + 'engines/stock/markets/index/securities.json' +
        '?iss.meta=off&securities=IMOEX&iss.only=marketdata' +
        '&marketdata.columns=SECID,CURRENTVALUE,LASTVALUE,LASTCHANGEPRC,UPDATETIME';
    function sectorUrl(idx) {
        return ISS + 'statistics/engines/stock/markets/index/analytics/' + idx +
            '.json?iss.meta=off&iss.only=analytics&analytics.columns=ticker&limit=100';
    }

    var POLL_MS = 30000;     // период автообновления котировок
    var HEADER_H = 22;       // высота полосы с названием сектора
    var GAP = 3;             // «гэп» между плитками (по GAP с каждой стороны → ~6px между)
    var SECGAP = 10;         // «гэп»-жёлоб вокруг каждого сектора (бенто-разделение)

    // Периоды тепловой карты: насыщение цвета (±cap%) и порог «мувера» подобраны
    // под типичный размах изменений за день/неделю/месяц.
    var PERIODS = {
        day:   { cap: 3,  mover: 2,  word: 'день',   short: 'День' },
        week:  { cap: 8,  mover: 5,  word: 'неделю', short: 'Неделя' },
        month: { cap: 15, mover: 10, word: 'месяц',  short: 'Месяц' }
    };
    function pcfg() { return PERIODS[state.period] || PERIODS.day; }
    var CAP = PERIODS.day.cap;  // дефолтное насыщение (для статичной легенды в build)

    // Отраслевые индексы Мосбиржи → сектор. Состав каждого = тикеры сектора;
    // тянем динамически (порядок задаёт приоритет при пересечениях).
    var SECTOR_INDICES = [
        ['MOEXOG', 'Нефть и газ'], ['MOEXFN', 'Финансы'], ['MOEXMM', 'Металлы и добыча'],
        ['MOEXIT', 'IT и технологии'], ['MOEXCN', 'Потребительский'], ['MOEXEU', 'Электроэнергетика'],
        ['MOEXTL', 'Телеком'], ['MOEXTN', 'Транспорт'], ['MOEXCH', 'Химия'],
        ['MOEXRE', 'Строительные компании']
    ];
    // Бумаги вне отраслевых индексов (холдинги и пр.) — крошечный фолбэк
    var SECTOR_FALLBACK = { AFKS: 'Холдинги', MDMG: 'Здравоохранение', MSNG: 'Электроэнергетика' };
    function sectorOf(t) {
        return (state.sectorsMap && state.sectorsMap[t]) || SECTOR_FALLBACK[t] || 'Прочее';
    }

    var REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>';
    var BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    var GRID_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>';
    // Звезда «в избранное» и иконка «боковая карточка компании» — те же, что в таблице «Акции»,
    // чтобы поведение строки тикера совпадало между вкладками (заливка звезды — класс .active).
    var STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg>';
    var CARD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M14 4v16"/><path d="M17 9h1M17 13h1"/></svg>';

    // ---------- Избранное ----------
    // Делегируем единому списку избранного из таблицы «Акции» (localStorage stk_fav_v1),
    // чтобы звезда была общей для всего приложения (Акции + дашборд). Если модуль «Акции»
    // ещё не подгружен — читаем/пишем тот же ключ напрямую.
    var FAV_KEY = 'stk_fav_v1';
    function loadFavs() {
        try { var a = JSON.parse(localStorage.getItem(FAV_KEY)); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function getFavs() {
        return (typeof window.stkGetFavorites === 'function') ? window.stkGetFavorites() : loadFavs();
    }
    function toggleFav(tk) {
        if (typeof window.stkToggleFav === 'function') return window.stkToggleFav(tk);
        var a = loadFavs(), i = a.indexOf(tk);
        if (i === -1) a.push(tk); else a.splice(i, 1);
        try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch (e) {}
        return a.indexOf(tk) !== -1;
    }
    // Тоггл избранного из таблицы карты + синхронная подсветка звезды(звёзд) в строке.
    function toggleHeatFav(tk) {
        var on = toggleFav(tk);
        var c = card(); if (!c) return;
        c.querySelectorAll('.mh-tk-fav[data-tk="' + tk + '"]').forEach(function (b) {
            b.classList.toggle('active', on);
            b.title = on ? 'Убрать из избранного' : 'В избранное';
        });
    }

    // Колонки таблицы под картой
    var COLS = [
        { key: 'ticker', label: 'Тикер', num: false, cls: 'mh-th-id' },
        { key: 'last',   label: 'Цена ₽', num: true },
        { key: 'sector', label: 'Сектор', num: false, cls: 'mh-th-sec' },
        { key: 'chg',    label: 'Изм.', num: true },
        { key: 'weight', label: 'Вес', num: true, cls: 'mh-th-wt' },
        { key: 'value',  label: 'Объём', num: true, cls: 'mh-th-vol' }
    ];

    // ---------- Состояние ----------
    var state = {
        built: false,
        constituents: null,  // { TICKER: {name, weight} }
        sectorsMap: null,    // { TICKER: sector }
        rows: null,          // [{ticker,name,sector,weight,last,chg,value}]
        index: null,         // { value, chg }
        sizeMode: 'weight',  // 'weight' | 'value' | 'change'
        period: 'day',       // 'day' | 'week' | 'month' — период изменения (цвет/таблица)
        refCloses: {},       // { week: {TICKER:close}, month: {...} } — закрытие на опорную дату
        refIndex: {},        // { week: closeIMOEX, month: ... }
        zoom: null,          // имя сектора при drill-down или null
        sortKey: 'weight', sortDir: -1,
        prevPrices: {},      // последняя цена по тикеру (для вспышек)
        tileEls: {}, secEls: {},  // переиспользуемые DOM-узлы (плавные переходы)
        status: 'idle', updated: null, timer: null, loading: false
    };
    var plotEl = null;

    // ---------- Утилиты ----------
    function card() { return document.getElementById('mhCard'); }
    function $(sel) { var c = card(); return c ? c.querySelector(sel) : null; }
    function clamp(min, v, max) { return v < min ? min : (v > max ? max : v); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function fmtPct(p) { if (p == null || isNaN(p)) return '—'; return (p >= 0 ? '+' : '') + p.toFixed(2) + '%'; }
    function fmtPrice(v) {
        if (v == null || isNaN(v) || v === 0) return '—';
        var d = v >= 1000 ? 1 : (v >= 1 ? 2 : 4);
        return v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    function fmtIdx(v) { return v == null ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function fmtValue(v) {
        if (!v) return '—';
        if (v >= 1e9) return (v / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' млрд';
        if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' млн';
        return Math.round(v).toLocaleString('ru-RU');
    }
    // Объём для таблицы — число и единица раздельно (единица приглушена в CSS)
    function volParts(v) {
        if (!v) return { num: '—', unit: '' };
        if (v >= 1e9) return { num: (v / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 2 }), unit: 'млрд' };
        if (v >= 1e6) return { num: (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 0 }), unit: 'млн' };
        return { num: Math.round(v).toLocaleString('ru-RU'), unit: '' };
    }
    // Пилюля изменения для таблицы: стрелка-направление + модуль %
    function chgPill(p) {
        var cls = p > 0 ? 'up' : (p < 0 ? 'down' : 'flat');
        var ar = p > 0 ? '▲' : (p < 0 ? '▼' : '·');
        var val = (p == null || isNaN(p)) ? '—' : Math.abs(p).toFixed(2) + '%';
        return '<span class="mh-chg-pill ' + cls + '"><span class="mh-chg-ar">' + ar + '</span>' + val + '</span>';
    }

    // Цвет плитки по дневному изменению — диверг-палитра OKLCH (бренд):
    // рост — мята (hue 158), падение — клэй/терракота (hue 44). В светлой теме
    // нейтраль почти белая (L .955) → насыщенный, но всё ещё светлый цвет
    // (тёмный текст поверх); в тёмной теме — тёмная нейтраль → насыщенный (светлый
    // текст). Гамма + «мёртвая зона» поднимают цвет даже на небольших движениях.
    var COLOR_LIGHT = { neutralL: 0.955, neutralC: 0.012, strongL: 0.74, strongC: 0.115, gamma: 0.80, dead: 0.05 };
    var COLOR_DARK  = { neutralL: 0.300, neutralC: 0.016, strongL: 0.55, strongC: 0.135, gamma: 0.85, dead: 0.04 };
    var POS_HUE = 158, NEG_HUE = 44;
    function colorCfg() { return document.body.classList.contains('dark-mode') ? COLOR_DARK : COLOR_LIGHT; }
    function oklchOf(p) {
        if (p == null || isNaN(p)) p = 0;
        var cfg = colorCfg(), cap = pcfg().cap;
        var a = clamp(-cap, p, cap) / cap, m = Math.abs(a), hue = a >= 0 ? POS_HUE : NEG_HUE;
        var t = m < cfg.dead ? 0 : (m - cfg.dead) / (1 - cfg.dead);
        var ease = Math.pow(t, cfg.gamma);
        var L = cfg.neutralL + (cfg.strongL - cfg.neutralL) * ease;
        var C = cfg.neutralC + (cfg.strongC - cfg.neutralC) * ease;
        return { L: L, C: C, hue: hue };
    }
    function tileColor(p) { var c = oklchOf(p); return 'oklch(' + c.L.toFixed(3) + ' ' + c.C.toFixed(3) + ' ' + c.hue + ')'; }
    function glowColor(p) { var hue = (p != null && p < 0) ? NEG_HUE : POS_HUE; return 'oklch(0.62 0.17 ' + hue + ' / 0.55)'; }
    function moverNow() { return pcfg().mover; } // |изм.%| ≥ этого → плитка «светится»
    // Устойчивый приглушённый цвет сектора (для точки в таблице)
    function secHue(name) { var h = 0, i; for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }
    function secDot(name) { return 'hsl(' + secHue(name) + ',42%,55%)'; }

    // ====================================================================
    //  SQUARIFIED TREEMAP (Bruls, Huizing, van Wijk)
    // ====================================================================
    function sumArea(row) { var s = 0; for (var i = 0; i < row.length; i++) s += row[i].area; return s; }
    function worst(row, side) {
        var max = -Infinity, min = Infinity, sum = 0, i;
        for (i = 0; i < row.length; i++) { var a = row[i].area; sum += a; if (a > max) max = a; if (a < min) min = a; }
        if (sum === 0) return Infinity;
        var s2 = sum * sum, side2 = side * side;
        return Math.max((side2 * max) / s2, s2 / (side2 * min));
    }
    function layoutRow(row, free, out) {
        var rowArea = sumArea(row), i, seg;
        if (free.w <= free.h) {
            var rh = rowArea / free.w, x = free.x;
            for (i = 0; i < row.length; i++) { seg = row[i].area / rh;
                out.push({ node: row[i].node, x: x, y: free.y, w: seg, h: rh }); x += seg; }
            return { x: free.x, y: free.y + rh, w: free.w, h: free.h - rh };
        }
        var rw = rowArea / free.h, y = free.y;
        for (i = 0; i < row.length; i++) { seg = row[i].area / rw;
            out.push({ node: row[i].node, x: free.x, y: y, w: rw, h: seg }); y += seg; }
        return { x: free.x + rw, y: free.y, w: free.w - rw, h: free.h };
    }
    function squarify(items, rect) {
        var out = [];
        if (rect.w <= 0 || rect.h <= 0) return out;
        var total = 0, i; for (i = 0; i < items.length; i++) total += items[i].value;
        if (total <= 0) return out;
        var scale = (rect.w * rect.h) / total;
        var scaled = items.map(function (n) { return { node: n, area: n.value * scale }; })
            .sort(function (a, b) { return b.area - a.area; });
        var free = { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, row = [], idx = 0;
        while (idx < scaled.length) {
            var side = Math.min(free.w, free.h), item = scaled[idx];
            if (row.length === 0 || worst(row.concat(item), side) <= worst(row, side)) { row.push(item); idx++; }
            else { free = layoutRow(row, free, out); row = []; }
        }
        if (row.length) layoutRow(row, free, out);
        return out;
    }

    // ====================================================================
    //  ЗАГРУЗКА ДАННЫХ
    // ====================================================================
    function jget(url) { return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }

    function fetchConstituents() {
        if (state.constituents) return Promise.resolve(state.constituents);
        return jget(ANALYTICS_URL).then(function (j) {
            var a = j.analytics, c = a.columns, d = a.data;
            var ti = c.indexOf('ticker'), ni = c.indexOf('shortnames'), wi = c.indexOf('weight'), m = {};
            for (var i = 0; i < d.length; i++) m[d[i][ti]] = { name: d[i][ni], weight: +d[i][wi] || 0 };
            state.constituents = m; return m;
        });
    }
    // Секторы — состав отраслевых индексов (параллельно, один раз за сессию)
    function fetchSectors() {
        if (state.sectorsMap) return Promise.resolve(state.sectorsMap);
        return Promise.all(SECTOR_INDICES.map(function (pair) {
            return jget(sectorUrl(pair[0]))
                .then(function (j) { return { name: pair[1], tickers: j.analytics.data.map(function (r) { return r[0]; }) }; })
                .catch(function () { return { name: pair[1], tickers: [] }; });
        })).then(function (list) {
            var m = {};
            list.forEach(function (s) { s.tickers.forEach(function (t) { if (!m[t]) m[t] = s.name; }); });
            state.sectorsMap = m; return m;
        });
    }
    function fetchMarketdata() {
        return jget(MARKETDATA_URL).then(function (j) {
            var md = j.marketdata, c = md.columns, d = md.data;
            var si = c.indexOf('SECID'), li = c.indexOf('LAST'), ci = c.indexOf('LASTTOPREVPRICE'),
                vi = c.indexOf('VALTODAY'), ui = c.indexOf('UPDATETIME'), m = {}, upd = null;
            for (var i = 0; i < d.length; i++) {
                var row = d[i];
                m[row[si]] = { last: row[li], chg: row[ci], value: row[vi] || 0 };
                if (row[ui] && (!upd || row[ui] > upd)) upd = row[ui];
            }
            return { map: m, upd: upd };
        });
    }
    function fetchIndex() {
        return jget(INDEX_URL).then(function (j) {
            var c = j.marketdata.columns, d = j.marketdata.data[0]; if (!d) return null;
            function g(k) { return d[c.indexOf(k)]; }
            return { value: g('CURRENTVALUE') || g('LASTVALUE'), chg: g('LASTCHANGEPRC') };
        }).catch(function () { return null; });
    }
    function ensureStatic() { return Promise.all([fetchConstituents(), fetchSectors()]); }

    function buildRows(cons, md) {
        var rows = [];
        for (var t in cons) {
            if (!cons.hasOwnProperty(t)) continue;
            var q = md[t] || {};
            var dchg = q.chg != null ? q.chg : null;
            rows.push({ ticker: t, name: cons[t].name || t, sector: sectorOf(t), weight: cons[t].weight,
                last: q.last != null ? q.last : null, chgDay: dchg, chg: dchg, value: q.value || 0 });
        }
        return rows;
    }

    // ----- Историческое закрытие для периодов «неделя/месяц» (ISS history) -----
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function targetDate(period) {
        var d = new Date(); d.setHours(12, 0, 0, 0);
        if (period === 'week') d.setDate(d.getDate() - 7); else d.setDate(d.getDate() - 30);
        return d;
    }
    // Все акции TQBR за дату (с пагинацией) → { SECID: close } или null, если торгов не было
    function histDay(ds) {
        var map = {}, got = false;
        function page(start) {
            return jget(ISS + 'history/engines/stock/markets/shares/boards/TQBR/securities.json' +
                '?iss.meta=off&iss.only=history&history.columns=SECID,CLOSE&date=' + ds + '&start=' + start)
                .then(function (j) {
                    var h = j.history, c = h.columns, d = h.data, si = c.indexOf('SECID'), ci = c.indexOf('CLOSE');
                    for (var i = 0; i < d.length; i++) { if (d[i][ci] != null) { map[d[i][si]] = d[i][ci]; got = true; } }
                    if (d.length >= 100 && start < 500) return page(start + 100);
                    return null;
                });
        }
        return page(0).then(function () { return got ? map : null; });
    }
    function histIndex(ds) {
        // per-security path: возвращает историю ТОЛЬКО IMOEX (общий /securities эндпоинт
        // не фильтрует по securities= и пагинирует, IMOEX уезжает за первую страницу)
        return jget(ISS + 'history/engines/stock/markets/index/securities/IMOEX.json' +
            '?iss.meta=off&iss.only=history&history.columns=CLOSE&from=' + ds + '&till=' + ds)
            .then(function (j) { var d = j.history.data; return d.length ? d[0][0] : null; })
            .catch(function () { return null; });
    }
    // Находит ближайший торговый день ≤ target (ретрай назад по будням/праздникам)
    function fetchRefCloses(period) {
        if (state.refCloses[period]) return Promise.resolve();
        var base = targetDate(period);
        function tryDay(back) {
            if (back > 7) return Promise.reject(new Error('no trading day for ' + period));
            var dd = new Date(base); dd.setDate(dd.getDate() - back); var ds = dateStr(dd);
            return histDay(ds).then(function (m) { return m ? { map: m, ds: ds } : tryDay(back + 1); });
        }
        return tryDay(0).then(function (res) {
            state.refCloses[period] = res.map;
            return histIndex(res.ds).then(function (ic) { state.refIndex[period] = ic; });
        });
    }
    // Пересчёт r.chg под выбранный период (дневное — из marketdata, иначе от опорного закрытия)
    function applyPeriod() {
        if (!state.rows) return;
        var p = state.period;
        if (p === 'day') { state.rows.forEach(function (r) { r.chg = r.chgDay; }); return; }
        var ref = state.refCloses[p] || {};
        state.rows.forEach(function (r) {
            var rc = ref[r.ticker];
            r.chg = (rc && r.last != null && rc > 0) ? (r.last - rc) / rc * 100 : r.chgDay;
        });
    }
    function indexChgNow() {
        if (!state.index) return null;
        if (state.period === 'day') return state.index.chg;
        var ri = state.refIndex[state.period];
        return (ri && state.index.value != null && ri > 0) ? (state.index.value - ri) / ri * 100 : state.index.chg;
    }

    // ====================================================================
    //  РЕНДЕР КАРТЫ (diff-реконсиляция → плавные переходы + вспышки)
    // ====================================================================
    function sizeValue(row) {
        if (state.sizeMode === 'value') return Math.max(row.value || 0, 1);
        if (state.sizeMode === 'change') return Math.max(Math.abs(row.chg || 0), 0.05);
        return Math.max(row.weight || 0, 0.01);
    }
    function applyTileLook(el, r) {
        el.style.setProperty('--tile', tileColor(r.chg));
        var mover = r.chg != null && Math.abs(r.chg) >= moverNow();
        el.classList.toggle('mh-mover', mover);
        if (mover) el.style.setProperty('--glow', glowColor(r.chg)); else el.style.removeProperty('--glow');
    }

    function tileMini(w, h) { return Math.min(w, h) < 24; }
    function tileText(row, w, h) {
        var tk = esc(row.ticker), len = row.ticker.length;
        // Доступная ширина под текст (минус паддинг плитки: мелкие — 4px, обычные — 13px).
        var availW = Math.max(2, w - (tileMini(w, h) ? 4 : 13));
        // Предв. кегль по ширине (символ ~0.66 кегля, с запасом).
        var fitW = availW / (len * 0.66);
        // Узкая «портретная» плитка, где тикер по ширине влезает только мелко → пишем
        // ВЕРТИКАЛЬНО и только тикер (без % и цены). Решение по ГЕОМЕТРИИ (а не по факту
        // переполнения) — чтобы похожие плитки (RTKM/VKCO/BSPB…) вели себя одинаково.
        // Широкие плитки (CBOM/DOMRF) остаются горизонтальными — там тикер влезает.
        if (fitW < 13 && h >= w * 1.2 && h >= 32 && h >= len * 8) {
            var vFs = clamp(7, Math.min(w / 2.0, (h - 4) / (len * 0.92), 15), 15);
            return '<span class="mh-tk mh-tk-vert" style="font-size:' + vFs.toFixed(1) + 'px">' + tk + '</span>';
        }
        var showPc = h >= 30 && w >= 40, showPr = h >= 58 && w >= 72;
        var tkFs = clamp(6, Math.min(fitW, h / 2.7, 17), 17);
        var html = '<span class="mh-tk" style="font-size:' + tkFs.toFixed(1) + 'px">' + tk + '</span>';
        if (showPc) {
            var pcFs = clamp(8, tkFs * 0.74, 12.5);
            html += '<span class="mh-pc" style="font-size:' + pcFs.toFixed(1) + 'px">' + fmtPct(row.chg) + '</span>';
        }
        if (showPr) {
            var prFs = clamp(8, tkFs * 0.64, 11.5);
            html += '<span class="mh-pr" style="font-size:' + prFs.toFixed(1) + 'px">' + fmtPrice(row.last) + ' ₽</span>';
        }
        return html;
    }

    // Страховка ПО ФАКТУ (после вставки в DOM): если горизонтальный тикер всё же не влез
    // по ширине (оценка кегля бывает оптимистичной для широких букв) — ужимаем кегль до
    // влезания. Ориентацию (гориз./вертик.) уже решил tileText по геометрии. scrollWidth —
    // интринсик-ширина текста (стабильна во время FLIP-анимации ширины плитки).
    function fitTicker(el, w, h) {
        var tk = el.querySelector('.mh-tk');
        if (!tk || tk.classList.contains('mh-tk-vert')) return;
        var avail = w - (tileMini(w, h) ? 4 : 13);
        var need = tk.scrollWidth;
        if (need <= avail + 0.5) return; // влезает — ничего не трогаем
        var curFs = parseFloat(tk.style.fontSize) || 12;
        tk.style.fontSize = Math.max(5, curFs * avail / need - 0.2).toFixed(1) + 'px';
    }

    function rowsOfSector(name) { return state.rows.filter(function (r) { return r.sector === name; }); }

    // Расчёт раскладки: либо группировка по секторам, либо один сектор (zoom)
    function computeLayout(W, H) {
        if (state.zoom) {
            var rows = rowsOfSector(state.zoom);
            var items = rows.map(function (r) { return { value: sizeValue(r), row: r }; });
            var tiles = squarify(items, { x: 0, y: 0, w: W, h: H }).map(function (t) {
                return { rect: t, row: t.node.row }; });
            return { sectors: [], tiles: tiles };
        }
        var bySec = {}, order = [];
        state.rows.forEach(function (r) {
            var g = bySec[r.sector];
            if (!g) { g = bySec[r.sector] = { name: r.sector, rows: [], value: 0, chgW: 0, wW: 0 }; order.push(g); }
            g.rows.push(r); g.value += sizeValue(r);
            if (r.chg != null) { g.chgW += r.chg * r.weight; g.wW += r.weight; }
        });
        var secItems = order.map(function (g) { return { value: g.value, node: g, avg: g.wW ? g.chgW / g.wW : 0 }; });
        var secRects = squarify(secItems, { x: 0, y: 0, w: W, h: H });
        var sectors = [], tiles = [];
        secRects.forEach(function (sr) {
            var g = sr.node.node, avg = sr.node.avg;
            // жёлоб вокруг сектора (бенто-разделение): ужимаем прямоугольник на SECGAP
            var inset = SECGAP / 2;
            var bx = sr.x + inset, by = sr.y + inset,
                bw = Math.max(0, sr.w - SECGAP), bh = Math.max(0, sr.h - SECGAP);
            // Заголовок показываем даже у мелких секторов (Транспорт, Холдинги, Химия…),
            // ужимая его высоту под небольшой бокс, чтобы плитки не «съедались».
            var withHead = bh > 28 && bw > 44;
            var headH = withHead ? clamp(14, Math.round(bh * 0.42), HEADER_H) : 0;
            var box = { x: bx, y: by, w: bw, h: bh };
            sectors.push({ name: g.name, rect: box, avg: avg, withHead: withHead, headH: headH });
            var inner = withHead ? { x: bx, y: by + headH, w: bw, h: bh - headH } : box;
            var items = g.rows.map(function (r) { return { value: sizeValue(r), row: r }; });
            squarify(items, inner).forEach(function (t) { tiles.push({ rect: t, row: t.node.row }); });
        });
        return { sectors: sectors, tiles: tiles };
    }

    function flash(el, up) {
        el.classList.remove('mh-flash-up', 'mh-flash-down');
        void el.offsetWidth; // перезапуск анимации
        el.classList.add(up ? 'mh-flash-up' : 'mh-flash-down');
    }
    function removeEl(el) {
        el.style.opacity = '0'; el.style.pointerEvents = 'none';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 380);
    }

    function reconcileTiles(tiles) {
        var seen = {};
        tiles.forEach(function (t) {
            var r = t.row, tk = r.ticker, rc = t.rect;
            var x = rc.x + GAP, y = rc.y + GAP, w = Math.max(0, rc.w - GAP * 2), h = Math.max(0, rc.h - GAP * 2);
            var el = state.tileEls[tk];
            seen[tk] = true;
            if (!el) {
                // Свежая плитка: геометрию ставим с выключенным transition (без «роста от
                // нуля»), затем синхронно коммитим reflow и включаем переходы. Базовая
                // opacity = 1, появление — CSS-анимацией (.mh-enter), без зависимости от rAF.
                el = document.createElement('div'); el.className = 'mh-tile mh-enter'; el.setAttribute('data-tk', tk);
                el.style.transition = 'none';
                el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
                applyTileLook(el, r);
                el.innerHTML = tileText(r, w, h);
                el.classList.toggle('mh-mini', Math.min(w, h) < 24);
                plotEl.appendChild(el); state.tileEls[tk] = el;
                void el.offsetWidth;        // коммитим геометрию при transition:none
                fitTicker(el, w, h);        // точная подгонка/вертикаль по реальной ширине
                el.style.transition = '';   // дальше — плавные переходы (FLIP)
                return;
            }
            // Существующая плитка: меняем геометрию/цвет → CSS-переход анимирует (FLIP)
            el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
            el.style.opacity = '1';
            applyTileLook(el, r);
            el.innerHTML = tileText(r, w, h);
            el.classList.toggle('mh-mini', Math.min(w, h) < 24);
            fitTicker(el, w, h);        // точная подгонка/вертикаль по реальной ширине
            var prev = state.prevPrices[tk];
            if (prev != null && r.last != null && r.last !== prev) flash(el, r.last > prev);
        });
        Object.keys(state.tileEls).forEach(function (tk) {
            if (!seen[tk]) { removeEl(state.tileEls[tk]); delete state.tileEls[tk]; }
        });
    }

    function reconcileSectors(sectors) {
        var seen = {};
        sectors.forEach(function (s) {
            var el = state.secEls[s.name], fresh = false;
            if (!el) {
                el = document.createElement('div'); el.className = 'mh-sec'; el.setAttribute('data-sec', s.name);
                el.style.transition = 'none'; fresh = true;
                plotEl.appendChild(el); state.secEls[s.name] = el;
            }
            el.style.display = s.withHead ? 'flex' : 'none';
            el.style.left = s.rect.x + 'px'; el.style.top = s.rect.y + 'px';
            el.style.width = s.rect.w + 'px'; el.style.height = (s.headH || HEADER_H) + 'px';
            // адаптив заголовка: размер шрифта и состав под ширину сектора, имя усекается
            var sw = s.rect.w;
            var nmSize = sw < 58 ? 8.5 : (sw < 96 ? 9.5 : (sw < 150 ? 10.5 : 11.5));
            var showChg = sw >= 92, showZoom = sw >= 118;
            el.innerHTML = '<span class="mh-sec-name" style="font-size:' + nmSize + 'px">' + esc(s.name) + '</span>' +
                (showChg ? '<span class="mh-sec-chg ' + (s.avg >= 0 ? 'up' : 'down') + '">' + fmtPct(s.avg) + '</span>' : '') +
                (showZoom ? '<span class="mh-sec-zoom">⤢</span>' : '');
            if (fresh) { void el.offsetWidth; el.style.transition = ''; } // коммит геометрии → дальше плавно
            seen[s.name] = true;
        });
        Object.keys(state.secEls).forEach(function (n) {
            if (!seen[n]) { var el = state.secEls[n]; if (el.parentNode) el.parentNode.removeChild(el); delete state.secEls[n]; }
        });
    }

    function renderPlot() {
        if (!plotEl || !state.rows) return;
        var W = plotEl.clientWidth, H = plotEl.clientHeight;
        if (W < 2 || H < 2) return;
        var lay = computeLayout(W, H);
        reconcileSectors(lay.sectors);
        reconcileTiles(lay.tiles);
        // обновляем «прошлые» цены после сравнения (для вспышек на следующем апдейте)
        state.rows.forEach(function (r) { state.prevPrices[r.ticker] = r.last; });
    }

    // ---------- Шапка-пульс ----------
    function renderPulse() {
        var c = card(); if (!c || !state.rows) return;
        var iv = state.index;
        var valEl = c.querySelector('.mh-idx-val'), chgEl = c.querySelector('.mh-idx-chg');
        if (valEl) valEl.textContent = iv ? fmtIdx(iv.value) : '—';
        if (chgEl) {
            var p = indexChgNow();
            chgEl.textContent = (p != null ? (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(2) + '%' : '—');
            chgEl.className = 'mh-idx-chg' + (p > 0 ? ' up' : p < 0 ? ' down' : '');
        }
        // ширина рынка — «сентимент-метр»: проценты вшиты прямо в сегменты бара
        var up = 0, down = 0, flat = 0;
        state.rows.forEach(function (r) { if (r.chg > 0) up++; else if (r.chg < 0) down++; else flat++; });
        var tot = up + down + flat || 1;
        var upPct = Math.round(up / tot * 100), dnPct = Math.round(down / tot * 100);
        var bar = c.querySelector('.mh-breadth-bar');
        if (bar) {
            var iu = bar.querySelector('i.up'), ifl = bar.querySelector('i.flat'), idn = bar.querySelector('i.down');
            iu.style.width = (up / tot * 100) + '%'; ifl.style.width = (flat / tot * 100) + '%'; idn.style.width = (down / tot * 100) + '%';
        }
        var ratio = c.querySelector('.mh-brd-ratio');
        if (ratio) ratio.innerHTML = '<b class="up">' + up + '</b> / <b class="down">' + down + '</b>';
        // проценты вынесены в подписи под баром — плоско и читаемо, в стиле остального дашборда
        var lbl = c.querySelector('.mh-breadth-lbl');
        if (lbl) lbl.innerHTML = '<span class="up"><b>' + upPct + '%</b> растут</span>' +
            '<span class="flat">' + flat + ' нейтр.</span>' +
            '<span class="down"><b>' + dnPct + '%</b> падают</span>';
        // лидеры дня — always-on двухколоночный лидерборд (top-3 рост / top-3 падение)
        // с пропорциональными барами (ширина ∝ |изм.| / макс. по рынку), без выпадашки
        var withChg = state.rows.filter(function (r) { return r.chg != null; });
        var gain = withChg.filter(function (r) { return r.chg > 0; }).sort(function (a, b) { return b.chg - a.chg; }).slice(0, 3);
        var lose = withChg.filter(function (r) { return r.chg < 0; }).sort(function (a, b) { return a.chg - b.chg; }).slice(0, 3);
        var maxAbs = 0; withChg.forEach(function (r) { var a = Math.abs(r.chg); if (a > maxAbs) maxAbs = a; });
        maxAbs = maxAbs || 1;
        function moverRow(r, dir) {
            if (!r) return '<div class="mh-mv ghost"></div>';
            var w = Math.max(8, Math.abs(r.chg) / maxAbs * 100);
            return '<div class="mh-mv ' + dir + '" style="--w:' + w.toFixed(1) + '%">' +
                '<span class="mh-mv-fill"></span>' +
                '<span class="mh-mv-tk">' + esc(r.ticker) + '</span>' +
                '<span class="mh-mv-pc">' + fmtPct(r.chg) + '</span></div>';
        }
        var upCol = c.querySelector('.mh-mv-col.up'), dnCol = c.querySelector('.mh-mv-col.down');
        if (upCol) upCol.innerHTML = [0, 1, 2].map(function (i) { return moverRow(gain[i], 'up'); }).join('');
        if (dnCol) dnCol.innerHTML = [0, 1, 2].map(function (i) { return moverRow(lose[i], 'down'); }).join('');
    }

    // ---------- Хлебные крошки (drill-down) ----------
    function renderBread() {
        var b = $('.mh-bread'); if (!b) return;
        if (!state.zoom) { b.hidden = true; b.innerHTML = ''; return; }
        b.hidden = false;
        b.innerHTML = '<button class="mh-bread-root" type="button" data-act="bread-root">' + BACK_SVG +
            'Индекс МосБиржи</button><span class="mh-bread-sep">▸</span>' +
            '<span class="mh-bread-cur">' + esc(state.zoom) + '</span>';
    }

    // ---------- Таблица ----------
    function tableRows() {
        var rows = state.zoom ? rowsOfSector(state.zoom) : state.rows.slice();
        var k = state.sortKey, dir = state.sortDir, numeric = COLS.filter(function (c) { return c.key === k; })[0];
        numeric = numeric && numeric.num;
        rows.sort(function (a, b) {
            var va = a[k], vb = b[k];
            if (numeric) { va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb; return (va - vb) * dir; }
            return String(va).localeCompare(String(vb), 'ru') * dir;
        });
        return rows;
    }
    function renderTable() {
        var c = card(); if (!c || !state.rows) return;
        var head = c.querySelector('.mh-table thead tr');
        if (head) head.querySelectorAll('th').forEach(function (th) {
            var sorted = th.getAttribute('data-sort') === state.sortKey;
            th.classList.toggle('sorted', sorted);
            var ar = th.querySelector('.mh-arrow');
            if (ar) ar.textContent = sorted ? (state.sortDir < 0 ? '▼' : '▲') : (th.classList.contains('mh-th-rank') ? '' : '↕');
        });
        var body = c.querySelector('.mh-table tbody'); if (!body) return;
        var favs = getFavs();
        var rows = tableRows();
        // макс. вес среди видимых строк → длина мини-баров «Веса» (пропорция)
        var maxW = 0;
        rows.forEach(function (r) { if (r.weight != null && r.weight > maxW) maxW = r.weight; });
        if (!maxW) maxW = 1;
        var html = '';
        rows.forEach(function (r, i) {
            var isFav = favs.indexOf(r.ticker) !== -1;
            var vp = volParts(r.value);
            var wPct = r.weight != null ? Math.max(3, r.weight / maxW * 100) : 0;
            html += '<tr data-tk="' + esc(r.ticker) + '">' +
                '<td class="mh-rank">' + (i + 1) + '</td>' +
                '<td class="mh-td-id"><span class="mh-id-cell">' +
                    '<span class="mh-id-text">' +
                        '<span class="mh-id-tkr">' + esc(r.ticker) + '</span>' +
                        '<span class="mh-id-name">' + esc(r.name) + '</span>' +
                    '</span>' +
                    '<span class="mh-tk-actions">' +
                        '<button class="mh-tk-card" type="button" data-act="card" data-tk="' + esc(r.ticker) + '" title="Карточка компании" aria-label="Карточка компании">' + CARD_SVG + '</button>' +
                        '<button class="mh-tk-fav' + (isFav ? ' active' : '') + '" type="button" data-act="fav" data-tk="' + esc(r.ticker) + '" title="' + (isFav ? 'Убрать из избранного' : 'В избранное') + '" aria-label="Избранное">' + STAR_SVG + '</button>' +
                    '</span>' +
                '</span></td>' +
                '<td class="num">' + fmtPrice(r.last) + '</td>' +
                '<td class="mh-td-sec-col"><span class="mh-td-sec">' + esc(r.sector) + '</span></td>' +
                '<td class="num">' + chgPill(r.chg) + '</td>' +
                '<td class="num mh-td-wt">' + (r.weight != null
                    ? '<span class="mh-wt"><span class="mh-wt-track"><i style="width:' + wPct.toFixed(1) + '%"></i></span>' +
                      '<span class="mh-wt-num">' + r.weight.toFixed(2) + '%</span></span>'
                    : '—') + '</td>' +
                '<td class="num mh-td-vol"><span class="mh-vol-num">' + vp.num + '</span>' +
                    (vp.unit ? '<span class="mh-vol-unit">' + vp.unit + '</span>' : '') + '</td></tr>';
        });
        body.innerHTML = html;
    }

    function render() { renderPulse(); renderBread(); renderPlot(); renderTable(); setMeta(); }

    // ====================================================================
    //  СОСТОЯНИЯ / ПОДПИСЬ
    // ====================================================================
    function setMeta() {
        var c = card(); if (!c) return;
        // LIVE-капсула в шапке: пульс + время последнего апдейта
        var liveEl = c.querySelector('.mh-live'), tEl = c.querySelector('.mh-live-time');
        if (liveEl) liveEl.className = 'mh-live' + (state.status === 'ready' ? ' live' : state.status === 'error' ? ' stale' : '');
        if (tEl) tEl.textContent = state.updated ? state.updated : '—';
        // тонкая подпись-источник под статбаром
        var meta = c.querySelector('.mh-meta-txt');
        if (meta) meta.textContent = 'Данные ISS Московской биржи · задержка ~15 мин · ' +
            'размер плитки — ' + (state.sizeMode === 'value' ? 'объём торгов' : state.sizeMode === 'change' ? 'модуль изменения' : 'вес в индексе') +
            ', цвет — изменение за ' + pcfg().word;
    }
    function overlay() { return $('.mh-overlay'); }
    function hideOverlay() { var o = overlay(); if (o) o.hidden = true; }
    var SKEL = [[0, 0, 41, 58], [41, 0, 30, 58], [71, 0, 29, 36], [71, 36, 16, 22], [87, 36, 13, 22],
        [0, 58, 22, 42], [22, 58, 19, 42], [41, 58, 34, 25], [41, 83, 18, 17], [59, 83, 16, 17], [75, 58, 25, 42]];
    function showSkeleton() {
        var o = overlay(); if (!o) return;
        o.hidden = false;
        o.innerHTML = '<div class="mh-skel">' + SKEL.map(function (s) {
            return '<i style="left:' + s[0] + '%;top:' + s[1] + '%;width:' + (s[2] - 1) + '%;height:' + (s[3] - 1) + '%"></i>';
        }).join('') + '</div>';
    }
    function showError() {
        var o = overlay(); if (!o) return;
        o.hidden = false;
        o.innerHTML = 'Не удалось загрузить данные Мосбиржи.<button class="mh-retry" type="button" data-act="retry">Повторить</button>';
    }
    function spin(on) { var b = $('.mh-refresh'); if (b) b.classList.toggle('spin', on); }

    function refresh() {
        if (state.loading) return;
        state.loading = true; spin(true);
        if (!state.rows) showSkeleton();
        ensureStatic().then(function () { return Promise.all([fetchMarketdata(), fetchIndex()]); })
            .then(function (res) {
                state.rows = buildRows(state.constituents, res[0].map);
                state.updated = res[0].upd;
                if (res[1]) state.index = res[1];
                applyPeriod();   // переложить дневное изм. на выбранный период (если не «день»)
                state.status = 'ready'; hideOverlay();
                render();
            }).catch(function (e) {
                state.status = 'error'; if (!state.rows) showError(); setMeta();
                if (window.console) console.warn('[market-heatmap]', e);
            }).then(function () { state.loading = false; spin(false); });
    }

    // ====================================================================
    //  ТУЛТИП + ВЗАИМОДЕЙСТВИЕ
    // ====================================================================
    function rowByTicker(t) {
        if (!state.rows) return null;
        for (var i = 0; i < state.rows.length; i++) if (state.rows[i].ticker === t) return state.rows[i];
        return null;
    }
    function showTip(tk) {
        var r = rowByTicker(tk); if (!r) return;
        var tip = $('.mh-tip'); if (!tip) return;
        tip.innerHTML =
            '<div class="mh-tip-name">' + esc(r.name) + '</div>' +
            '<div class="mh-tip-sub">' + esc(r.ticker) + ' · ' + esc(r.sector) + '</div>' +
            '<div class="mh-tip-row"><span>Цена</span><b>' + fmtPrice(r.last) + ' ₽</b></div>' +
            '<div class="mh-tip-row"><span>Изм. за день</span><b style="color:' + (r.chg >= 0 ? 'var(--mh-up)' : 'var(--mh-down)') + '">' + fmtPct(r.chg) + '</b></div>' +
            '<div class="mh-tip-row"><span>Вес в индексе</span><b>' + (r.weight != null ? r.weight.toFixed(2) + '%' : '—') + '</b></div>' +
            '<div class="mh-tip-row"><span>Объём за день</span><b>' + fmtValue(r.value) + ' ₽</b></div>' +
            '<div class="mh-tip-hint">Клик — карточка компании</div>';
        tip.classList.add('show');
    }
    function moveTip(e) {
        var tip = $('.mh-tip'); if (!tip || !tip.classList.contains('show')) return;
        if (!plotEl) return;
        var host = tip.offsetParent || plotEl;       // карточка (.mh-card) — система координат тултипа
        var hr = host.getBoundingClientRect();
        var pr = plotEl.getBoundingClientRect();
        // Эффективный zoom самокалибруем из плота: getBoundingClientRect отдаёт ЭКРАННЫЕ
        // пиксели (layout × zoom), а clientWidth — layout. На десктопе body{zoom:.85}, иначе 1.
        var z = plotEl.clientWidth ? (pr.width / plotEl.clientWidth) : 1;
        if (!z) z = 1;
        // Курсор (clientX/Y — экранные пиксели, та же система, что и getBoundingClientRect)
        // → в LAYOUT-координаты карточки, где живут left/top тултипа.
        var mx = (e.clientX - hr.left) / z;
        var my = (e.clientY - hr.top) / z;
        var tw = tip.offsetWidth, th = tip.offsetHeight, hostH = host.clientHeight;
        var plotL = plotEl.offsetLeft, plotT = plotEl.offsetTop, plotW = plotEl.clientWidth;
        // По умолчанию — СЛЕВА от курсора, ближняя грань в 4px: карточка вплотную рядом,
        // но НЕ перекрывает точку клика (плитку под курсором). Если слева не помещается
        // (курсор у левого края карты) — отражаем вправо с тем же зазором 4px.
        var GAP = 4;
        var x = mx - tw - GAP, y = my + GAP;
        if (x < plotL + 2) x = mx + GAP;
        x = clamp(plotL + 2, x, Math.max(plotL + 2, plotL + plotW - tw - 2));
        if (y + th > hostH - 2) y = Math.max(plotT, my - th - 14); // упёрлись в низ карты → выше курсора
        tip.style.left = Math.round(x) + 'px';
        tip.style.top = Math.round(y) + 'px';
    }
    function hideTip() { var tip = $('.mh-tip'); if (tip) tip.classList.remove('show'); }

    function openCompany(ticker) {
        if (!ticker || typeof window.openStockDetail !== 'function') return;
        if (!document.getElementById('stockDetailCard')) {
            var c = document.createElement('div'); c.className = 'stock-detail-card'; c.id = 'stockDetailCard';
            document.body.appendChild(c);
        }
        window.openStockDetail(ticker, 1);
    }

    function enterZoom(name) { if (state.zoom === name) return; state.zoom = name; hideTip(); render(); }
    function exitZoom() { if (!state.zoom) return; state.zoom = null; hideTip(); render(); }

    // Обновляет подписи легенды ±cap% под выбранный период
    function updateLegend() {
        var lg = $('.mh-legend'); if (!lg) return;
        var cap = pcfg().cap, kids = lg.children;
        if (kids[0]) kids[0].textContent = '−' + cap + '%';
        if (kids[2]) kids[2].textContent = '+' + cap + '%';
    }
    // Смена периода: при «неделя/месяц» лениво подтягивает опорные закрытия (кэш на сессию)
    function selectPeriod(p) {
        state.period = p; updateLegend();
        if (p === 'day' || state.refCloses[p]) { applyPeriod(); render(); return; }
        spin(true);
        fetchRefCloses(p).catch(function (e) { if (window.console) console.warn('[market-heatmap] period', e); })
            .then(function () { applyPeriod(); render(); spin(false); });
    }

    // ====================================================================
    //  ПОСТРОЕНИЕ ОБОЛОЧКИ
    // ====================================================================
    function build() {
        var c = card(); if (!c || state.built) return;
        c.innerHTML =
            '<div class="mh-head">' +
            '  <div class="mh-head-title">' +
            '    <span class="mh-head-ico" aria-hidden="true">' + GRID_SVG + '</span>' +
            '    <div class="mh-head-tt">' +
            '      <span class="mh-title">Тепловая карта</span>' +
            '      <span class="mh-sym">Индекс МосБиржи · IMOEX</span>' +
            '    </div>' +
            '  </div>' +
            '  <div class="mh-head-ctrl">' +
            '    <span class="mh-live" title="Время последнего обновления данных Мосбиржи (задержка ~15 мин)">' +
            '      <i class="mh-live-dot"></i>' +
            '      <span class="mh-live-meta"><span class="mh-live-cap">обновлено</span><span class="mh-live-time">—</span></span>' +
            '    </span>' +
            '    <span class="mh-seg mh-seg-period" role="tablist" title="Период изменения (цвет карты)">' +
            '      <button class="mh-seg-btn active" type="button" data-period="day">День</button>' +
            '      <button class="mh-seg-btn" type="button" data-period="week">Неделя</button>' +
            '      <button class="mh-seg-btn" type="button" data-period="month">Месяц</button>' +
            '    </span>' +
            '    <span class="mh-seg mh-seg-size" role="tablist" title="Размер плитки">' +
            '      <button class="mh-seg-btn active" type="button" data-size="weight">Вес</button>' +
            '      <button class="mh-seg-btn" type="button" data-size="value">Объём</button>' +
            '      <button class="mh-seg-btn" type="button" data-size="change">% изм.</button>' +
            '    </span>' +
            '    <button class="mh-refresh" type="button" title="Обновить" aria-label="Обновить">' + REFRESH_SVG + '</button>' +
            '  </div>' +
            '</div>' +
            '<div class="mh-pulse">' +
            '  <div class="mh-kpi mh-kpi-idx">' +
            '    <div class="mh-idx-top"><span class="mh-idx-tag">IMOEX</span><span class="mh-idx-lbl">Индекс МосБиржи</span></div>' +
            '    <div class="mh-pulse-idx"><span class="mh-idx-val">—</span><span class="mh-idx-chg">—</span></div>' +
            '  </div>' +
            '  <div class="mh-kpi mh-kpi-breadth">' +
            '    <div class="mh-brd-top"><span class="mh-kpi-lbl">Ширина рынка</span><span class="mh-brd-ratio"></span></div>' +
            '    <div class="mh-breadth-bar"><i class="up"></i><i class="flat"></i><i class="down"></i></div>' +
            '    <div class="mh-breadth-lbl"></div>' +
            '  </div>' +
            '  <div class="mh-kpi mh-kpi-leaders">' +
            '    <span class="mh-kpi-lbl">Лидеры дня</span>' +
            '    <div class="mh-movers"><div class="mh-mv-col up"></div><div class="mh-mv-col down"></div></div>' +
            '  </div>' +
            '</div>' +
            '<div class="mh-meta">' +
            '  <span class="mh-legend"><span>−' + CAP + '%</span><span class="mh-legend-bar"></span><span>+' + CAP + '%</span></span>' +
            '  <span class="mh-meta-txt"></span>' +
            '</div>' +
            '<div class="mh-bread" hidden></div>' +
            '<div class="mh-plot">' +
            '  <div class="mh-overlay" hidden></div>' +
            '</div>' +
            // тултип ВНЕ .mh-plot (у плота overflow:hidden) — чтобы карточка могла
            // уходить НИЖЕ курсора, не упираясь в нижний край карты и не клипаясь.
            '<div class="mh-tip"></div>' +
            '<div class="mh-table-wrap"><table class="mh-table"><thead><tr>' +
            '<th class="mh-th-rank">#</th>' +
            COLS.map(function (col) {
                return '<th data-sort="' + col.key + '" class="' + (col.num ? 'num ' : '') + (col.cls || '') + '">' +
                    esc(col.label) + '<span class="mh-arrow"></span></th>';
            }).join('') +
            '</tr></thead><tbody></tbody></table></div>';

        plotEl = c.querySelector('.mh-plot');

        // Переключатель размера плитки (вес / объём / % изм.)
        c.querySelectorAll('.mh-seg-size .mh-seg-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                if (b.classList.contains('active')) return;
                c.querySelectorAll('.mh-seg-size .mh-seg-btn').forEach(function (x) { x.classList.remove('active'); });
                b.classList.add('active'); state.sizeMode = b.getAttribute('data-size');
                render();
            });
        });
        // Переключатель периода (день / неделя / месяц) — меняет базу изменения (цвет/таблица)
        c.querySelectorAll('.mh-seg-period .mh-seg-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                if (b.classList.contains('active')) return;
                c.querySelectorAll('.mh-seg-period .mh-seg-btn').forEach(function (x) { x.classList.remove('active'); });
                b.classList.add('active'); selectPeriod(b.getAttribute('data-period'));
            });
        });
        c.querySelector('.mh-refresh').addEventListener('click', refresh);

        // Сортировка таблицы
        c.querySelectorAll('.mh-table thead th').forEach(function (th) {
            th.addEventListener('click', function () {
                var k = th.getAttribute('data-sort'), col = COLS.filter(function (x) { return x.key === k; })[0];
                if (state.sortKey === k) state.sortDir *= -1;
                else { state.sortKey = k; state.sortDir = col && col.num ? -1 : 1; }
                renderTable();
            });
        });

        // Делегированные клики: ретрай, крошки, сектор-зум, плитка, действия/строка таблицы
        c.addEventListener('click', function (e) {
            if (e.target.closest('[data-act="retry"]')) { refresh(); return; }
            if (e.target.closest('[data-act="bread-root"]')) { exitZoom(); return; }
            // действия в ячейке тикера — проверяем ДО клика по строке
            var favBtn = e.target.closest('[data-act="fav"]');
            if (favBtn) { toggleHeatFav(favBtn.getAttribute('data-tk')); return; }
            var cardBtn = e.target.closest('[data-act="card"]');
            if (cardBtn) { openCompany(cardBtn.getAttribute('data-tk')); return; }
            var sec = e.target.closest('.mh-sec'); if (sec) { enterZoom(sec.getAttribute('data-sec')); return; }
            var tile = e.target.closest('.mh-tile'); if (tile) { openCompany(tile.getAttribute('data-tk')); return; }
            var tr = e.target.closest('.mh-table tbody tr'); if (tr) { openCompany(tr.getAttribute('data-tk')); }
        });

        // Тултип + спотлайт
        plotEl.addEventListener('mouseover', function (e) {
            var tile = e.target.closest('.mh-tile');
            if (tile) { showTip(tile.getAttribute('data-tk')); plotEl.classList.add('mh-spot'); }
        });
        plotEl.addEventListener('mousemove', moveTip);
        plotEl.addEventListener('mouseleave', function () { hideTip(); plotEl.classList.remove('mh-spot'); });

        state.built = true;
    }

    // ====================================================================
    //  АВТООБНОВЛЕНИЕ + ЖИЗНЕННЫЙ ЦИКЛ
    // ====================================================================
    function startPolling() { if (!state.timer) state.timer = setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS); }
    function stopPolling() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
    function onEnter() {
        build(); refresh(); startPolling();
        // фоном тянем таблицу терминала — нужна для ОДХС в карточке компании по клику
        if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }
    }
    function onLeave() { stopPolling(); hideTip(); }

    var relayoutTimer = null;
    function relayout() { clearTimeout(relayoutTimer); relayoutTimer = setTimeout(function () {
        if (state.rows && isMarketActive()) renderPlot(); }, 120); }
    function isMarketActive() { var p = document.getElementById('panel-market'); return !!(p && p.classList.contains('active')); }

    var _origSwitch = window.switchTab;
    window.switchTab = function (tabId) {
        var r = _origSwitch ? _origSwitch.apply(this, arguments) : undefined;
        if (tabId === 'market') setTimeout(onEnter, 0); else onLeave();
        return r;
    };
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { stopPolling(); return; }
        if (isMarketActive()) { startPolling(); refresh(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.zoom && isMarketActive()) exitZoom(); });
    window.addEventListener('resize', relayout);
    // Перерисовка при смене темы — цвета плиток (OKLCH) зависят от dark-mode
    var _lastDark = document.body.classList.contains('dark-mode');
    if (window.MutationObserver) {
        new MutationObserver(function () {
            var d = document.body.classList.contains('dark-mode');
            if (d === _lastDark) return;
            _lastDark = d;
            if (state.rows && isMarketActive()) { renderPlot(); renderPulse(); renderTable(); }
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    document.addEventListener('DOMContentLoaded', function () {
        if (window.ResizeObserver) { var c = card(); if (c) new ResizeObserver(relayout).observe(c); }
        if (isMarketActive()) setTimeout(onEnter, 300);
    });
})();
