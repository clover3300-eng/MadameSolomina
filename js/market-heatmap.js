/* ============================================================================
   МОДУЛЬ «ТЕПЛОВАЯ КАРТА ИНДЕКСА МОСБИРЖИ» — вкладка Рынок (#mhCard)
   ----------------------------------------------------------------------------
   Рисует squarified-treemap по составу индекса IMOEX на бесплатных данных
   ISS API Московской биржи (iss.moex.com, CORS открыт):
     • состав + веса      — statistics/.../index/analytics/IMOEX.json
     • цена/изм%/объём    — engines/stock/markets/shares/boards/TQBR/securities
   Размер плитки = вес в индексе ИЛИ объём торгов за день (переключатель),
   цвет = дневное изменение цены (LASTTOPREVPRICE), зелёный↔красный.

   Классический скрипт (без модулей), грузится ПОСЛЕДНИМ — оборачивает
   глобальный switchTab, чтобы лениво строиться при первом заходе на «Рынок».
   Данные обновляются раз в 30 c, пока вкладка открыта и страница видима.
   Источник бесплатный → котировки с задержкой ~15 мин (показываем в подписи).
   ========================================================================== */
(function () {
    'use strict';

    var ANALYTICS_URL =
        'https://iss.moex.com/iss/statistics/engines/stock/markets/index/analytics/IMOEX.json' +
        '?iss.meta=off&iss.only=analytics&analytics.columns=ticker,shortnames,weight&limit=100';
    var MARKETDATA_URL =
        'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json' +
        '?iss.meta=off&iss.only=marketdata' +
        '&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VALTODAY,UPDATETIME';

    var POLL_MS = 30000;     // период автообновления котировок
    var CAP = 3;             // насыщение цвета при изменении ±3% за день
    var HEADER_H = 19;       // высота полосы с названием сектора
    var GAP = 1.5;           // ширина «гэпа» между плитками (через inset box-shadow)

    // Сектор для каждой бумаги индекса (состав меняется ~раз в квартал;
    // незнакомый тикер попадает в «Прочее»). Привилегированные — рядом с обычными.
    var SECTORS = {
        // Нефть и газ
        LKOH: 'Нефть и газ', GAZP: 'Нефть и газ', ROSN: 'Нефть и газ', NVTK: 'Нефть и газ',
        TATN: 'Нефть и газ', TATNP: 'Нефть и газ', SNGS: 'Нефть и газ', SNGSP: 'Нефть и газ',
        TRNFP: 'Нефть и газ',
        // Финансы
        SBER: 'Финансы', SBERP: 'Финансы', VTBR: 'Финансы', T: 'Финансы', MOEX: 'Финансы',
        CBOM: 'Финансы', SVCB: 'Финансы', BSPB: 'Финансы', DOMRF: 'Финансы', RENI: 'Финансы',
        // Металлы и добыча
        GMKN: 'Металлы и добыча', PLZL: 'Металлы и добыча', RUAL: 'Металлы и добыча',
        CHMF: 'Металлы и добыча', NLMK: 'Металлы и добыча', MAGN: 'Металлы и добыча',
        ALRS: 'Металлы и добыча', ENPG: 'Металлы и добыча', UGLD: 'Металлы и добыча',
        // IT и технологии
        YDEX: 'IT и технологии', OZON: 'IT и технологии', HEAD: 'IT и технологии',
        VKCO: 'IT и технологии', POSI: 'IT и технологии', CNRU: 'IT и технологии',
        // Потребительский / здравоохранение
        X5: 'Потребительский', LENT: 'Потребительский', MDMG: 'Здравоохранение',
        // Телеком
        MTSS: 'Телеком', RTKM: 'Телеком',
        // Электроэнергетика
        IRAO: 'Электроэнергетика', MSNG: 'Электроэнергетика',
        // Транспорт / недвижимость / химия / холдинги
        AFLT: 'Транспорт', FLOT: 'Транспорт', PIKK: 'Недвижимость',
        PHOR: 'Химия', AFKS: 'Холдинги'
    };
    function sectorOf(t) { return SECTORS[t] || 'Прочее'; }

    var REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>';

    // ---------- Состояние (в памяти на сессию) ----------
    var state = {
        built: false,
        constituents: null,  // { TICKER: {name, weight} } — грузим один раз
        rows: null,          // объединённые данные [{ticker,name,sector,weight,last,chg,value}]
        sizeMode: 'weight',  // 'weight' | 'value'
        status: 'idle',      // idle | loading | ready | error
        updated: null,       // UPDATETIME биржи (строка ЧЧ:ММ:СС)
        timer: null,
        loading: false       // защита от параллельных запросов
    };

    // ---------- Утилиты ----------
    function $(sel) { var c = document.getElementById('mhCard'); return c ? c.querySelector(sel) : null; }
    function clamp(min, v, max) { return v < min ? min : (v > max ? max : v); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function fmtPct(p) { if (p == null || isNaN(p)) return '—'; return (p >= 0 ? '+' : '') + p.toFixed(2) + '%'; }
    function fmtPrice(v) {
        if (v == null || isNaN(v) || v === 0) return '—';
        var d = v >= 1000 ? 1 : (v >= 10 ? 2 : (v >= 1 ? 2 : 4));
        return v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ₽';
    }
    function fmtValue(v) {
        if (!v) return '—';
        if (v >= 1e9) return (v / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' млрд ₽';
        if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' млн ₽';
        return Math.round(v).toLocaleString('ru-RU') + ' ₽';
    }

    // Цвет плитки по дневному изменению (нейтральный slate → зелёный/красный)
    var C_NEU = [123, 129, 141], C_POS = [22, 160, 90], C_NEG = [214, 62, 60];
    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
    function tileColor(p) {
        if (p == null || isNaN(p)) p = 0;
        var t = clamp(-CAP, p, CAP) / CAP; // -1..1
        var to = t >= 0 ? C_POS : C_NEG, k = Math.abs(t);
        return 'rgb(' + lerp(C_NEU[0], to[0], k) + ',' + lerp(C_NEU[1], to[1], k) + ',' + lerp(C_NEU[2], to[2], k) + ')';
    }

    // ====================================================================
    //  SQUARIFIED TREEMAP (Bruls, Huizing, van Wijk)
    //  items: [{value>0, ...}] → возвращает [{node, x, y, w, h}]
    // ====================================================================
    function sumArea(row) { var s = 0; for (var i = 0; i < row.length; i++) s += row[i].area; return s; }
    function worst(row, side) {
        var max = -Infinity, min = Infinity, sum = 0;
        for (var i = 0; i < row.length; i++) { var a = row[i].area; sum += a; if (a > max) max = a; if (a < min) min = a; }
        if (sum === 0) return Infinity;
        var s2 = sum * sum, side2 = side * side;
        return Math.max((side2 * max) / s2, s2 / (side2 * min));
    }
    function layoutRow(row, free, out) {
        var rowArea = sumArea(row), i, seg;
        if (free.w <= free.h) {              // ряд тянем по горизонтали (короткая сторона — ширина)
            var rh = rowArea / free.w, x = free.x;
            for (i = 0; i < row.length; i++) { seg = row[i].area / rh;
                out.push({ node: row[i].node, x: x, y: free.y, w: seg, h: rh }); x += seg; }
            return { x: free.x, y: free.y + rh, w: free.w, h: free.h - rh };
        }
        var rw = rowArea / free.h, y = free.y; // ряд тянем по вертикали
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
            if (row.length === 0 || worst(row.concat(item), side) <= worst(row, side)) {
                row.push(item); idx++;
            } else { free = layoutRow(row, free, out); row = []; }
        }
        if (row.length) layoutRow(row, free, out);
        return out;
    }

    // ====================================================================
    //  ЗАГРУЗКА ДАННЫХ
    // ====================================================================
    function fetchConstituents() {
        if (state.constituents) return Promise.resolve(state.constituents);
        return fetch(ANALYTICS_URL, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('analytics ' + r.status); return r.json();
        }).then(function (j) {
            var a = j.analytics, c = a.columns, d = a.data;
            var ti = c.indexOf('ticker'), ni = c.indexOf('shortnames'), wi = c.indexOf('weight');
            var m = {};
            for (var i = 0; i < d.length; i++) m[d[i][ti]] = { name: d[i][ni], weight: +d[i][wi] || 0 };
            state.constituents = m; return m;
        });
    }
    function fetchMarketdata() {
        return fetch(MARKETDATA_URL, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('marketdata ' + r.status); return r.json();
        }).then(function (j) {
            var md = j.marketdata, c = md.columns, d = md.data;
            var si = c.indexOf('SECID'), li = c.indexOf('LAST'), ci = c.indexOf('LASTTOPREVPRICE'),
                vi = c.indexOf('VALTODAY'), ui = c.indexOf('UPDATETIME');
            var m = {}, upd = null;
            for (var i = 0; i < d.length; i++) {
                var row = d[i];
                m[row[si]] = { last: row[li], chg: row[ci], value: row[vi] || 0 };
                if (row[ui] && (!upd || row[ui] > upd)) upd = row[ui];
            }
            return { map: m, upd: upd };
        });
    }

    // Объединяем состав + котировки в плоский список строк
    function buildRows(cons, md) {
        var rows = [];
        for (var t in cons) {
            if (!cons.hasOwnProperty(t)) continue;
            var q = md[t] || {};
            rows.push({
                ticker: t, name: cons[t].name || t, sector: sectorOf(t),
                weight: cons[t].weight, last: q.last != null ? q.last : null,
                chg: q.chg != null ? q.chg : null, value: q.value || 0
            });
        }
        return rows;
    }

    // ====================================================================
    //  РЕНДЕР КАРТЫ
    // ====================================================================
    function sizeValue(row) {
        // площадь плитки; пол в 1, чтобы бумага без оборота не схлопывалась в ноль
        return state.sizeMode === 'value' ? Math.max(row.value || 0, 1) : Math.max(row.weight || 0, 0.01);
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
            html += '<span class="mh-pr" style="font-size:' + prFs.toFixed(1) + 'px">' + fmtPrice(row.last) + '</span>';
        }
        return html;
    }

    function render() {
        var plot = $('.mh-plot');
        if (!plot || !state.rows) return;
        var W = plot.clientWidth, H = plot.clientHeight;
        if (W < 2 || H < 2) return;

        // 1) группируем по секторам, считаем взвешенное изменение сектора
        var bySec = {}, order = [];
        state.rows.forEach(function (r) {
            var s = r.sector;
            if (!bySec[s]) { bySec[s] = { name: s, rows: [], value: 0, chgW: 0, wW: 0 }; order.push(bySec[s]); }
            var g = bySec[s]; g.rows.push(r); g.value += sizeValue(r);
            if (r.chg != null) { g.chgW += r.chg * r.weight; g.wW += r.weight; }
        });
        var sectors = order.map(function (g) {
            return { node: g, value: g.value, avg: g.wW ? g.chgW / g.wW : 0 };
        });

        // 2) раскладываем сектора по всему полю, внутри каждого — бумаги
        var secRects = squarify(sectors, { x: 0, y: 0, w: W, h: H });
        var html = '';
        secRects.forEach(function (sr) {
            var g = sr.node.node, avg = sr.node.avg;
            var withHead = sr.h > 42 && sr.w > 62;
            if (withHead) {
                var showChg = sr.w > 130; // у узких секторов процент прячем — иначе наезжает
                html += '<div class="mh-sec" style="left:' + sr.x + 'px;top:' + sr.y + 'px;width:' + sr.w + 'px;height:' + HEADER_H + 'px">' +
                    '<span class="mh-sec-name">' + esc(g.name) + '</span>' +
                    (showChg ? '<span class="mh-sec-chg" style="color:' + tileColor(avg) + '">' + fmtPct(avg) + '</span>' : '') +
                    '</div>';
            }
            var inner = withHead
                ? { x: sr.x, y: sr.y + HEADER_H, w: sr.w, h: sr.h - HEADER_H }
                : { x: sr.x, y: sr.y, w: sr.w, h: sr.h };
            var items = g.rows.map(function (r) { return { value: sizeValue(r), row: r }; });
            squarify(items, inner).forEach(function (t) {
                var r = t.node.row;
                var x = t.x + GAP, y = t.y + GAP, w = Math.max(0, t.w - GAP * 2), h = Math.max(0, t.h - GAP * 2);
                html += '<div class="mh-tile" data-tk="' + esc(r.ticker) + '" ' +
                    'style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;background:' + tileColor(r.chg) + '">' +
                    tileText(r, w, h) + '</div>';
            });
        });
        html += '<div class="mh-tip"></div>';
        plot.innerHTML = html;
    }

    // ====================================================================
    //  ОБНОВЛЕНИЕ ДАННЫХ
    // ====================================================================
    function setMeta() {
        var meta = $('.mh-meta');
        if (!meta) return;
        var live = state.status === 'ready';
        meta.innerHTML =
            '<span class="mh-dot' + (live ? ' live' : '') + '"></span>' +
            (state.updated ? 'Обновлено ' + esc(state.updated) + ' (МСК)' : 'Загрузка…') +
            ' · данные ISS Московской биржи, задержка ~15 мин · размер плитки — ' +
            (state.sizeMode === 'value' ? 'объём торгов' : 'вес в индексе') +
            ', цвет — изменение за день';
    }

    function showLoading() {
        var plot = $('.mh-plot');
        if (plot && !state.rows) plot.innerHTML = '<div class="mh-state"><div class="mh-spinner"></div>Загружаем индекс МосБиржи…</div>';
    }
    function showError() {
        var plot = $('.mh-plot');
        if (plot) plot.innerHTML = '<div class="mh-state">Не удалось загрузить данные Мосбиржи.' +
            '<button class="mh-retry" type="button" data-act="retry">Повторить</button></div>';
    }

    function refresh() {
        if (state.loading) return;
        state.loading = true;
        var btn = $('.mh-refresh'); if (btn) btn.classList.add('spin');
        showLoading();
        Promise.all([fetchConstituents(), fetchMarketdata()]).then(function (res) {
            state.rows = buildRows(res[0], res[1].map);
            state.updated = res[1].upd;
            state.status = 'ready';
            render(); setMeta();
        }).catch(function (e) {
            state.status = 'error';
            if (!state.rows) showError();
            setMeta();
            // eslint-disable-next-line no-console
            if (window.console) console.warn('[market-heatmap]', e);
        }).then(function () {
            state.loading = false;
            var b = $('.mh-refresh'); if (b) b.classList.remove('spin');
        });
    }

    // ====================================================================
    //  ТУЛТИП + ВЗАИМОДЕЙСТВИЕ
    // ====================================================================
    function rowByTicker(t) {
        if (!state.rows) return null;
        for (var i = 0; i < state.rows.length; i++) if (state.rows[i].ticker === t) return state.rows[i];
        return null;
    }
    function showTip(tile, plot) {
        var r = rowByTicker(tile.getAttribute('data-tk')); if (!r) return;
        var tip = plot.querySelector('.mh-tip'); if (!tip) return;
        tip.innerHTML =
            '<div class="mh-tip-name">' + esc(r.name) + '</div>' +
            '<div class="mh-tip-sub">' + esc(r.ticker) + ' · ' + esc(r.sector) + '</div>' +
            '<div class="mh-tip-row"><span>Цена</span><b>' + fmtPrice(r.last) + '</b></div>' +
            '<div class="mh-tip-row"><span>Изм. за день</span><b style="color:' + tileColor(r.chg) + '">' + fmtPct(r.chg) + '</b></div>' +
            '<div class="mh-tip-row"><span>Вес в индексе</span><b>' + (r.weight != null ? r.weight.toFixed(2) + '%' : '—') + '</b></div>' +
            '<div class="mh-tip-row"><span>Объём за день</span><b>' + fmtValue(r.value) + '</b></div>' +
            '<div class="mh-tip-hint">Клик — карточка компании</div>';
        tip.classList.add('show');
    }
    function moveTip(e, plot) {
        var tip = plot.querySelector('.mh-tip'); if (!tip || !tip.classList.contains('show')) return;
        var pr = plot.getBoundingClientRect();
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var x = e.clientX - pr.left + 14, y = e.clientY - pr.top + 14;
        if (x + tw > pr.width) x = e.clientX - pr.left - tw - 14;
        if (y + th > pr.height) y = pr.height - th - 4;
        tip.style.left = clamp(0, x, Math.max(0, pr.width - tw)) + 'px';
        tip.style.top = clamp(0, y, Math.max(0, pr.height - th)) + 'px';
    }
    function hideTip() { var tip = $('.mh-tip'); if (tip) tip.classList.remove('show'); }

    // Карточка компании — переиспользуем общий drawer #stockDetailCard (как в терминале)
    function openCompany(ticker) {
        if (!ticker || typeof window.openStockDetail !== 'function') return;
        if (!document.getElementById('stockDetailCard')) {
            var c = document.createElement('div');
            c.className = 'stock-detail-card'; c.id = 'stockDetailCard';
            document.body.appendChild(c);
        }
        window.openStockDetail(ticker, 1);
    }

    // ====================================================================
    //  ПОСТРОЕНИЕ ОБОЛОЧКИ + ОБРАБОТЧИКИ
    // ====================================================================
    function build() {
        var card = document.getElementById('mhCard');
        if (!card || state.built) return;
        card.innerHTML =
            '<div class="mh-head">' +
            '  <span class="mh-title">Тепловая карта</span>' +
            '  <span class="mh-sym">Индекс МосБиржи · IMOEX</span>' +
            '  <span class="mh-spacer"></span>' +
            '  <span class="mh-legend"><span>−' + CAP + '%</span><span class="mh-legend-bar"></span><span>+' + CAP + '%</span></span>' +
            '  <span class="mh-seg" role="tablist">' +
            '    <button class="mh-seg-btn active" type="button" data-size="weight">Вес</button>' +
            '    <button class="mh-seg-btn" type="button" data-size="value">Объём</button>' +
            '  </span>' +
            '  <button class="mh-refresh" type="button" title="Обновить" aria-label="Обновить">' + REFRESH_SVG + '</button>' +
            '</div>' +
            '<div class="mh-meta"><span class="mh-dot"></span>Загрузка…</div>' +
            '<div class="mh-plot"></div>';

        var plot = card.querySelector('.mh-plot');

        // Переключатель размера
        card.querySelectorAll('.mh-seg-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                if (b.classList.contains('active')) return;
                card.querySelectorAll('.mh-seg-btn').forEach(function (x) { x.classList.remove('active'); });
                b.classList.add('active');
                state.sizeMode = b.getAttribute('data-size');
                render(); setMeta();
            });
        });
        // Ручное обновление + повтор после ошибки
        card.querySelector('.mh-refresh').addEventListener('click', refresh);
        card.addEventListener('click', function (e) {
            if (e.target.closest('[data-act="retry"]')) { refresh(); return; }
            var tile = e.target.closest('.mh-tile');
            if (tile) openCompany(tile.getAttribute('data-tk'));
        });
        // Тултип (делегирование на поле)
        plot.addEventListener('mouseover', function (e) {
            var tile = e.target.closest('.mh-tile'); if (tile) showTip(tile, plot);
        });
        plot.addEventListener('mousemove', function (e) { moveTip(e, plot); });
        plot.addEventListener('mouseleave', hideTip);

        state.built = true;
    }

    // ====================================================================
    //  АВТООБНОВЛЕНИЕ + ЖИЗНЕННЫЙ ЦИКЛ ВКЛАДКИ
    // ====================================================================
    function startPolling() { if (!state.timer) state.timer = setInterval(function () {
        if (!document.hidden) refresh(); }, POLL_MS); }
    function stopPolling() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

    function onEnter() { build(); refresh(); startPolling(); }
    function onLeave() { stopPolling(); hideTip(); }

    // Перерисовка при изменении размеров поля (без повторной загрузки)
    var relayoutTimer = null;
    function relayout() {
        clearTimeout(relayoutTimer);
        relayoutTimer = setTimeout(function () { if (state.rows && isMarketActive()) render(); }, 120);
    }
    function isMarketActive() {
        var p = document.getElementById('panel-market');
        return !!(p && p.classList.contains('active'));
    }

    // Ленивая инициализация при заходе на «Рынок»
    var _origSwitch = window.switchTab;
    window.switchTab = function (tabId) {
        var r = _origSwitch ? _origSwitch.apply(this, arguments) : undefined;
        if (tabId === 'market') setTimeout(onEnter, 0); else onLeave();
        return r;
    };

    // Останавливаем поллинг на скрытой вкладке браузера, возобновляем при возврате
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { stopPolling(); return; }
        if (isMarketActive()) { startPolling(); refresh(); }
    });

    window.addEventListener('resize', relayout);

    document.addEventListener('DOMContentLoaded', function () {
        if (window.ResizeObserver) {
            var card = document.getElementById('mhCard');
            if (card) new ResizeObserver(relayout).observe(card);
        }
        if (isMarketActive()) setTimeout(onEnter, 300);
    });
})();
