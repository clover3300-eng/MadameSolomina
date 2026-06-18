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
    var CAP = 3;             // насыщение цвета при изменении ±3% за день
    var HEADER_H = 19;       // высота полосы с названием сектора
    var GAP = 1.5;           // «гэп» между плитками

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

    // Колонки таблицы под картой
    var COLS = [
        { key: 'ticker', label: 'Тикер', num: false },
        { key: 'name',   label: 'Компания', num: false, cls: 'mh-th-name' },
        { key: 'sector', label: 'Сектор', num: false },
        { key: 'last',   label: 'Цена ₽', num: true },
        { key: 'chg',    label: 'Изм.', num: true },
        { key: 'weight', label: 'Вес', num: true },
        { key: 'value',  label: 'Объём', num: true }
    ];

    // ---------- Состояние ----------
    var state = {
        built: false,
        constituents: null,  // { TICKER: {name, weight} }
        sectorsMap: null,    // { TICKER: sector }
        rows: null,          // [{ticker,name,sector,weight,last,chg,value}]
        index: null,         // { value, chg }
        sizeMode: 'weight',  // 'weight' | 'value'
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

    // Цвет плитки по дневному изменению (нейтральный slate → зелёный/красный)
    var C_NEU = [110, 118, 132], C_POS = [22, 178, 98], C_NEG = [224, 60, 58];
    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
    function rgbOf(p) {
        if (p == null || isNaN(p)) p = 0;
        var t = clamp(-CAP, p, CAP) / CAP, to = t >= 0 ? C_POS : C_NEG, k = Math.abs(t);
        return [lerp(C_NEU[0], to[0], k), lerp(C_NEU[1], to[1], k), lerp(C_NEU[2], to[2], k)];
    }
    function tileColor(p) { var c = rgbOf(p); return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
    function glowColor(p) { var c = rgbOf(p); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',.6)'; }
    var MOVER = 2; // |изм.%| ≥ этого → плитка «светится» (крупное движение)
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
            rows.push({ ticker: t, name: cons[t].name || t, sector: sectorOf(t), weight: cons[t].weight,
                last: q.last != null ? q.last : null, chg: q.chg != null ? q.chg : null, value: q.value || 0 });
        }
        return rows;
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
        var mover = r.chg != null && Math.abs(r.chg) >= MOVER;
        el.classList.toggle('mh-mover', mover);
        if (mover) el.style.setProperty('--glow', glowColor(r.chg)); else el.style.removeProperty('--glow');
    }

    function tileText(row, w, h) {
        if (w < 22 || h < 14) return '';
        var base = Math.min(w / 4.2, h / 2.7), tkFs = clamp(8.5, base, 16);
        var html = '<span class="mh-tk" style="font-size:' + tkFs.toFixed(1) + 'px">' + esc(row.ticker) + '</span>';
        if (h >= 30 && w >= 40) {
            var pcFs = clamp(8, tkFs * 0.78, 12.5);
            html += '<span class="mh-pc" style="font-size:' + pcFs.toFixed(1) + 'px">' + fmtPct(row.chg) + '</span>';
        }
        if (h >= 62 && w >= 74) {
            var prFs = clamp(8, tkFs * 0.68, 11.5);
            html += '<span class="mh-pr" style="font-size:' + prFs.toFixed(1) + 'px">' + fmtPrice(row.last) + ' ₽</span>';
        }
        return html;
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
            var withHead = sr.h > 42 && sr.w > 62;
            sectors.push({ name: g.name, rect: sr, avg: avg, withHead: withHead });
            var inner = withHead ? { x: sr.x, y: sr.y + HEADER_H, w: sr.w, h: sr.h - HEADER_H } : sr;
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
                plotEl.appendChild(el); state.tileEls[tk] = el;
                void el.offsetWidth;        // коммитим геометрию при transition:none
                el.style.transition = '';   // дальше — плавные переходы (FLIP)
                return;
            }
            // Существующая плитка: меняем геометрию/цвет → CSS-переход анимирует (FLIP)
            el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
            el.style.opacity = '1';
            applyTileLook(el, r);
            el.innerHTML = tileText(r, w, h);
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
            el.style.width = s.rect.w + 'px'; el.style.height = HEADER_H + 'px';
            var showChg = s.rect.w > 130;
            el.innerHTML = '<span class="mh-sec-name">' + esc(s.name) + '</span>' +
                (showChg ? '<span class="mh-sec-chg" style="color:' + tileColor(s.avg) + '">' + fmtPct(s.avg) + '</span>' : '') +
                '<span class="mh-sec-zoom">⤢</span>';
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
            var p = iv ? iv.chg : null;
            chgEl.textContent = (p != null ? (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(2) + '%' : '—');
            chgEl.className = 'mh-idx-chg' + (p > 0 ? ' up' : p < 0 ? ' down' : '');
        }
        var up = 0, down = 0, flat = 0;
        state.rows.forEach(function (r) { if (r.chg > 0) up++; else if (r.chg < 0) down++; else flat++; });
        var tot = up + down + flat || 1;
        var bar = c.querySelector('.mh-breadth-bar');
        if (bar) {
            bar.querySelector('i.up').style.width = (up / tot * 100) + '%';
            bar.querySelector('i.flat').style.width = (flat / tot * 100) + '%';
            bar.querySelector('i.down').style.width = (down / tot * 100) + '%';
        }
        var lbl = c.querySelector('.mh-breadth-lbl');
        if (lbl) lbl.innerHTML = '<b class="up">' + up + ' ↑</b><b>' + flat + ' →</b><b class="down">' + down + ' ↓</b>';
        var withChg = state.rows.filter(function (r) { return r.chg != null; }).slice().sort(function (a, b) { return b.chg - a.chg; });
        var top = withChg[0], bot = withChg[withChg.length - 1];
        var lead = c.querySelector('.mh-pulse-leaders');
        if (lead && top && bot) {
            lead.innerHTML =
                '<span class="mh-leader up"><span class="tk">' + esc(top.ticker) + '</span> ' + fmtPct(top.chg) + '</span>' +
                '<span class="mh-leader down"><span class="tk">' + esc(bot.ticker) + '</span> ' + fmtPct(bot.chg) + '</span>';
        }
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
            var ar = th.querySelector('.mh-arrow'); if (ar) ar.textContent = sorted ? (state.sortDir < 0 ? '▼' : '▲') : '';
        });
        var body = c.querySelector('.mh-table tbody'); if (!body) return;
        var html = '';
        tableRows().forEach(function (r, i) {
            var cls = r.chg > 0 ? 'up' : (r.chg < 0 ? 'down' : 'flat');
            html += '<tr data-tk="' + esc(r.ticker) + '">' +
                '<td class="mh-rank">' + (i + 1) + '</td>' +
                '<td class="mh-td-tk">' + esc(r.ticker) + '</td>' +
                '<td class="mh-td-name">' + esc(r.name) + '</td>' +
                '<td><span class="mh-td-sec"><i style="background:' + secDot(r.sector) + '"></i>' + esc(r.sector) + '</span></td>' +
                '<td class="num">' + fmtPrice(r.last) + '</td>' +
                '<td class="num"><span class="mh-chg-pill ' + cls + '">' + fmtPct(r.chg) + '</span></td>' +
                '<td class="num">' + (r.weight != null ? r.weight.toFixed(2) + '%' : '—') + '</td>' +
                '<td class="num">' + fmtValue(r.value) + '</td></tr>';
        });
        body.innerHTML = html;
    }

    function render() { renderPulse(); renderBread(); renderPlot(); renderTable(); setMeta(); }

    // ====================================================================
    //  СОСТОЯНИЯ / ПОДПИСЬ
    // ====================================================================
    function setMeta() {
        var meta = $('.mh-meta'); if (!meta) return;
        var live = state.status === 'ready';
        meta.innerHTML = '<span class="mh-dot' + (live ? ' live' : '') + '"></span>' +
            (state.updated ? 'Обновлено ' + esc(state.updated) + ' (МСК)' : 'Загрузка…') +
            ' · данные ISS Московской биржи, задержка ~15 мин · размер плитки — ' +
            (state.sizeMode === 'value' ? 'объём торгов' : state.sizeMode === 'change' ? 'модуль изменения' : 'вес в индексе') +
            ', цвет — изменение за день';
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
            '<div class="mh-tip-row"><span>Изм. за день</span><b style="color:' + tileColor(r.chg) + '">' + fmtPct(r.chg) + '</b></div>' +
            '<div class="mh-tip-row"><span>Вес в индексе</span><b>' + (r.weight != null ? r.weight.toFixed(2) + '%' : '—') + '</b></div>' +
            '<div class="mh-tip-row"><span>Объём за день</span><b>' + fmtValue(r.value) + ' ₽</b></div>' +
            '<div class="mh-tip-hint">Клик — карточка компании</div>';
        tip.classList.add('show');
    }
    function moveTip(e) {
        var tip = $('.mh-tip'); if (!tip || !tip.classList.contains('show')) return;
        var pr = plotEl.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
        var x = e.clientX - pr.left + 14, y = e.clientY - pr.top + 14;
        if (x + tw > pr.width) x = e.clientX - pr.left - tw - 14;
        if (y + th > pr.height) y = pr.height - th - 4;
        tip.style.left = clamp(0, x, Math.max(0, pr.width - tw)) + 'px';
        tip.style.top = clamp(0, y, Math.max(0, pr.height - th)) + 'px';
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
            '    <span class="mh-legend"><span>−' + CAP + '%</span><span class="mh-legend-bar"></span><span>+' + CAP + '%</span></span>' +
            '    <span class="mh-seg" role="tablist">' +
            '      <button class="mh-seg-btn active" type="button" data-size="weight">Вес</button>' +
            '      <button class="mh-seg-btn" type="button" data-size="value">Объём</button>' +
            '      <button class="mh-seg-btn" type="button" data-size="change">% изм.</button>' +
            '    </span>' +
            '    <button class="mh-refresh" type="button" title="Обновить" aria-label="Обновить">' + REFRESH_SVG + '</button>' +
            '  </div>' +
            '</div>' +
            '<div class="mh-pulse">' +
            '  <div class="mh-kpi mh-kpi-idx">' +
            '    <span class="mh-kpi-lbl">Индекс IMOEX</span>' +
            '    <div class="mh-pulse-idx"><span class="mh-idx-val">—</span><span class="mh-idx-chg">—</span></div>' +
            '  </div>' +
            '  <div class="mh-kpi mh-kpi-breadth">' +
            '    <span class="mh-kpi-lbl">Ширина рынка</span>' +
            '    <div class="mh-pulse-breadth"><div class="mh-breadth-bar"><i class="up"></i><i class="flat"></i><i class="down"></i></div><div class="mh-breadth-lbl"></div></div>' +
            '  </div>' +
            '  <div class="mh-kpi mh-kpi-leaders">' +
            '    <span class="mh-kpi-lbl">Лидеры дня</span>' +
            '    <div class="mh-pulse-leaders"></div>' +
            '  </div>' +
            '</div>' +
            '<div class="mh-meta"><span class="mh-dot"></span>Загрузка…</div>' +
            '<div class="mh-bread" hidden></div>' +
            '<div class="mh-plot"><div class="mh-tip"></div><div class="mh-overlay" hidden></div></div>' +
            '<div class="mh-table-wrap"><table class="mh-table"><thead><tr>' +
            '<th class="mh-th-rank">#</th>' +
            COLS.map(function (col) {
                return '<th data-sort="' + col.key + '" class="' + (col.num ? 'num ' : '') + (col.cls || '') + '">' +
                    esc(col.label) + '<span class="mh-arrow"></span></th>';
            }).join('') +
            '</tr></thead><tbody></tbody></table></div>';

        plotEl = c.querySelector('.mh-plot');

        // Переключатель размера
        c.querySelectorAll('.mh-seg-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                if (b.classList.contains('active')) return;
                c.querySelectorAll('.mh-seg-btn').forEach(function (x) { x.classList.remove('active'); });
                b.classList.add('active'); state.sizeMode = b.getAttribute('data-size');
                render();
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

        // Делегированные клики: ретрай, крошки, сектор-зум, плитка, строка таблицы
        c.addEventListener('click', function (e) {
            if (e.target.closest('[data-act="retry"]')) { refresh(); return; }
            if (e.target.closest('[data-act="bread-root"]')) { exitZoom(); return; }
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
    document.addEventListener('DOMContentLoaded', function () {
        if (window.ResizeObserver) { var c = card(); if (c) new ResizeObserver(relayout).observe(c); }
        if (isMarketActive()) setTimeout(onEnter, 300);
    });
})();
