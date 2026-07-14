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

    // Перерисовываем, только когда размер РЕАЛЬНО поменялся: draw() правит innerHTML бокса,
    // и без этой отсечки наблюдатель мог бы гонять сам себя.
    var lastW = 0, lastH = 0;
    function drawIfResized() {
        var box = document.getElementById('siteBgTiles');
        if (!box) return;
        var W = box.clientWidth, H = box.clientHeight;
        if (W < 2 || H < 2) return;                 // скрыт (не та вкладка/тема) — рисовать нечего
        if (W === lastW && H === lastH) return;
        lastW = W; lastH = H;
        draw();
    }

    // ---------------------------------------------------------------
    //  ВАРИАНТ ФОНА (переключатель в «Портфели · Настройки»)
    // ---------------------------------------------------------------
    // Заливки живут в css/site-bg.css (body.sbg-<key> #siteBgTiles). Здесь — только
    // список, персист и классы на <body>. Мозаика — дефолт: при пустом ключе классы
    // не ставим вовсе, и всё работает ровно как до появления переключателя.
    var BG_KEY = 'site_bg_v1';
    var BG_LIST = [
        { id: 'mosaic',   name: 'Мозаика',    sub: 'как сейчас' },
        { id: 'sage',     name: 'Шалфейный',  sub: 'тихий зелёный' },
        { id: 'gradient', name: 'Градиент',   sub: 'сине-лиловая дымка' },
        { id: 'calm',     name: 'Спокойный',  sub: 'нейтральная бумага' },
        { id: 'aurora',   name: 'Аврора',     sub: 'холодные всполохи' },
        { id: 'dawn',     name: 'Рассвет',    sub: 'персик и барвинок' }
    ];
    function bgValid(v) { return BG_LIST.some(function (b) { return b.id === v; }); }
    function bgGet() {
        try { var v = localStorage.getItem(BG_KEY); return bgValid(v) ? v : 'mosaic'; }
        catch (e) { return 'mosaic'; }
    }
    function bgApply() {
        var cur = bgGet(), b = document.body;
        if (!b) return;
        BG_LIST.forEach(function (x) { b.classList.remove('sbg-' + x.id); });
        b.classList.toggle('sbg-plain', cur !== 'mosaic');
        if (cur !== 'mosaic') b.classList.add('sbg-' + cur);
        // «Мозаика» вернулась после другого варианта — плитки могли не рисоваться ни разу
        // (бокс был занят заливкой, размер не менялся, drawIfResized() отсекал по lastW/lastH)
        if (cur === 'mosaic') { lastW = 0; lastH = 0; drawIfResized(); }
        // фон меняют ДВА места — плавающий переключатель ниже и карточка в «Настройках».
        // Событие держит их в согласии: кто бы ни переключил, отметку «выбрано»
        // перерисуют оба, и им не нужно знать друг о друге.
        try { document.dispatchEvent(new CustomEvent('site-bg-change', { detail: cur })); } catch (e) {}
    }
    function bgSet(v) {
        if (!bgValid(v) || v === bgGet()) return;
        try { localStorage.setItem(BG_KEY, v); } catch (e) {}
        bgApply();
    }
    // API для переключателя (js/portfolios.js — карточка «Фон страницы»)
    window.siteBg = { list: function () { return BG_LIST.slice(); }, get: bgGet, set: bgSet, apply: bgApply };

    // --- плавающий переключатель фона (#bgFab) ---
    // Круглая кнопка с волной над кнопкой темы; по наведению вверх раскрывается
    // рейка образцов шириной в саму кнопку. Живёт здесь, а не в profile-menu.js,
    // потому что это про фон: список вариантов и bgSet() уже рядом.
    // Раскрытие — по наведению И по клику: наведение удобно мышью, клик нужен
    // для клавиатуры и тач-экранов, где hover не наступает вовсе.
    var fab = null;
    function fabSync() {
        if (!fab) return;
        var cur = bgGet();
        [].forEach.call(fab.querySelectorAll('.bgfab-sw'), function (el) {
            var on = el.getAttribute('data-bg') === cur;
            el.classList.toggle('on', on);
            el.setAttribute('aria-checked', on ? 'true' : 'false');
        });
    }
    function buildFab() {
        if (document.getElementById('bgFab')) return;
        var WAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M2 8c2.5-2.6 5-2.6 7.5 0S15 10.6 17.5 8 22 5.4 22 8"/>' +
            '<path d="M2 16c2.5-2.6 5-2.6 7.5 0s5 2.6 7.5 0 4.5-2.6 4.5 0"/></svg>';
        fab = document.createElement('div');
        fab.id = 'bgFab';
        fab.innerHTML =
            '<div class="bgfab-rail" role="radiogroup" aria-label="Фон страницы">' +
                BG_LIST.map(function (o) {
                    // data-name → подпись .bgfab-tip слева от образца: варианты фона
                    // намеренно неяркие, и кружком 30px они друг от друга не отличаются —
                    // без названия выбирать пришлось бы наугад
                    return '<button type="button" class="bgfab-sw sbgpv-' + o.id + '" role="radio" data-bg="' + o.id + '"' +
                        ' data-name="' + o.name + '" aria-label="' + o.name + ' — ' + o.sub + '"></button>';
                }).join('') +
            '</div>' +
            '<span class="bgfab-tip" aria-hidden="true"></span>' +
            '<button type="button" class="bgfab-btn" aria-label="Фон страницы" title="Фон страницы">' + WAVE + '</button>';
        document.body.appendChild(fab);
        var tip = fab.querySelector('.bgfab-tip');
        fab.addEventListener('click', function (e) {
            var sw = e.target.closest('.bgfab-sw');
            if (sw) { bgSet(sw.getAttribute('data-bg')); return; }
            if (e.target.closest('.bgfab-btn')) fab.classList.toggle('open');
        });
        // подпись ведём по наведённому образцу: ставим её ровно напротив кружка.
        // offsetTop, а НЕ getBoundingClientRect: на десктопе у body zoom 0.9, и rect
        // отдаёт уже отмасштабированные px, а `top` в CSS — свои, до масштаба;
        // подпись съезжала бы на те самые 10%. offsetTop живёт в тех же координатах, что CSS.
        fab.addEventListener('mouseover', function (e) {
            var sw = e.target.closest('.bgfab-sw'); if (!sw) return;
            tip.textContent = sw.getAttribute('data-name');
            tip.style.top = (sw.offsetTop + sw.offsetHeight / 2) + 'px';
            tip.classList.add('on');
        });
        fab.addEventListener('mouseout', function (e) {
            if (e.target.closest('.bgfab-sw')) tip.classList.remove('on');
        });
        fab.addEventListener('mouseleave', function () { tip.classList.remove('on'); });
        document.addEventListener('pointerdown', function (e) {
            if (fab.classList.contains('open') && !fab.contains(e.target)) fab.classList.remove('open');
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') fab.classList.remove('open');
        });
        fabSync();
    }
    document.addEventListener('site-bg-change', fabSync);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { buildFab(); bgApply(); drawIfResized(); });
    } else {
        buildFab();
        bgApply();
        drawIfResized();
    }

    // Мозаика показывается только на НЕ-главной вкладке в светлой теме (см. css/site-bg.css:
    // display:none по умолчанию, block по body:not(.dark-mode):not(.tab-home)). Загрузка же
    // идёт НА ГЛАВНОЙ — бокс скрыт, его clientWidth = 0, и разовый draw() на DOMContentLoaded
    // выходил вхолостую. Перейдя на другую вкладку, пользователь получал пустой бокс: draw()
    // звал только resize окна, а переключение вкладки — не resize. Итог: плиток не было
    // никогда, фон вкладок оставался голым градиентом.
    // ResizeObserver закрывает это, не сообщая site-bg.js про вкладки: у display:none размер
    // 0×0, при показе он становится W×H — наблюдатель срабатывает и на смену вкладки, и на
    // смену темы, и на ресайз окна.
    if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { drawIfResized(); });
        var target = document.getElementById('siteBgTiles');
        if (target) ro.observe(target);
        else document.addEventListener('DOMContentLoaded', function () {
            var t = document.getElementById('siteBgTiles'); if (t) ro.observe(t);
        });
    }
    // фолбэк для браузеров без ResizeObserver
    var rsz = null;
    window.addEventListener('resize', function () {
        clearTimeout(rsz);
        rsz = setTimeout(drawIfResized, 200);
    });
})();
