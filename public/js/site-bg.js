// =============================================
// SITE BACKGROUND — статичная мозаика (#siteBgTiles)
// =============================================
// Тот же вид, что у живой карты на Главной (js/home-register.js), но
// НЕ живые данные: фиксированный набор чисел ниже, посчитан squarify
// один раз при загрузке и на resize — без fetch, без setInterval.
// Показывается только на остальных вкладках (см. css/site-bg.css),
// на Главной у неё своя, настоящая, живая карта.
(function () {
    'use strict';

    // Фиксированный псевдо-набор «весов» (условные величины, без тикеров)
    // и «изменений» (только для оттенка мята/клэй, тоже фиксированные) —
    // ничего не запрашивается и не обновляется.
    var WEIGHTS = [
        100, 82, 76, 68, 61, 55, 50, 47, 44, 40,
        37, 34, 32, 30, 28, 26, 24, 23, 21, 20,
        19, 18, 17, 16, 15, 14, 13, 12, 12, 11,
        10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5
    ];
    var CHANGES = [
        1.8, -0.6, 0.9, -1.4, 2.1, 0.3, -0.2, 1.1, -0.8, 0.5,
        -1.9, 0.7, 1.3, -0.3, 0.1, -1.1, 0.6, 2.4, -0.5, 0.2,
        -0.9, 1.6, 0.4, -0.1, 0.8, -2.1, 0.3, 1.0, -0.4, 0.5,
        -0.7, 0.2, 1.2, -0.3, 0.6, -1.3, 0.1, 0.9, -0.6, 0.4, -0.2, 0.7
    ];
    var CAP = 3;

    // --- squarified treemap (та же схема, что в home-register.js/market-heatmap.js) ---
    function worst(row, side) {
        var max = -Infinity, min = Infinity, sum = 0, i;
        for (i = 0; i < row.length; i++) { var a = row[i].area; sum += a; if (a > max) max = a; if (a < min) min = a; }
        if (sum === 0) return Infinity;
        var s2 = sum * sum, side2 = side * side;
        return Math.max((side2 * max) / s2, s2 / (side2 * min));
    }
    function layoutRow(row, free, out) {
        var rowArea = 0, i, seg;
        for (i = 0; i < row.length; i++) rowArea += row[i].area;
        if (free.w <= free.h) {
            var rh = rowArea / free.w, x = free.x;
            for (i = 0; i < row.length; i++) { seg = row[i].area / rh;
                out.push({ idx: row[i].idx, x: x, y: free.y, w: seg, h: rh }); x += seg; }
            return { x: free.x, y: free.y + rh, w: free.w, h: free.h - rh };
        }
        var rw = rowArea / free.h, y = free.y;
        for (i = 0; i < row.length; i++) { seg = row[i].area / rw;
            out.push({ idx: row[i].idx, x: free.x, y: y, w: rw, h: seg }); y += seg; }
        return { x: free.x + rw, y: free.y, w: free.w - rw, h: free.h };
    }
    function squarify(items, rect) {
        var out = [];
        if (rect.w <= 0 || rect.h <= 0) return out;
        var total = 0, i;
        for (i = 0; i < items.length; i++) total += items[i].value;
        if (total <= 0) return out;
        var scale = (rect.w * rect.h) / total;
        var scaled = items.map(function (n) { return { idx: n.idx, area: n.value * scale }; })
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

    function draw() {
        var box = document.getElementById('siteBgTiles');
        if (!box) return;
        var W = box.clientWidth, H = box.clientHeight;
        if (W < 2 || H < 2) return;
        var items = WEIGHTS.map(function (v, i) { return { idx: i, value: v }; });
        var tiles = squarify(items, { x: 0, y: 0, w: W, h: H });
        var html = '';
        tiles.forEach(function (t) {
            var chg = CHANGES[t.idx % CHANGES.length];
            var cls = chg > 0.15 ? 'up' : (chg < -0.15 ? 'dn' : 'flat');
            var k = Math.min(1, Math.abs(chg) / CAP);
            var x = t.x + 2, y = t.y + 2, w = Math.max(0, t.w - 4), h = Math.max(0, t.h - 4);
            html += '<div class="sbg-tile ' + cls + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) +
                'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;--k:' + k.toFixed(2) + '"></div>';
        });
        // Вуаль ПОСЛЕ плиток в DOM — иначе плитки перекрыли бы её сверху
        html += '<div class="sbg-scrim"></div>';
        box.innerHTML = html;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', draw);
    } else {
        draw();
    }

    var rsz = null;
    window.addEventListener('resize', function () {
        clearTimeout(rsz);
        rsz = setTimeout(draw, 200);
    });
})();
