/* ============================================================
   МОДУЛЬ «ТАБЛИЦА ТЕРМИНАЛА» — Рынок · Облигации
   ------------------------------------------------------------
   Интерактивная таблица облигаций: сортировка по столбцам,
   поиск, правила окраски ячеек, видимость столбцов, избранное.
   В ОТЛИЧИЕ от вкладки «Акции» — без раскрывающихся карточек
   деталей и без группировки по секторам (у облигаций их нет):
   плоский список, одна строка = одна облигация.

   Данные — опубликованный CSV «Таблица для Облигаций».
   Структура повторяет js/stock-terminal.js (загрузка → парсинг →
   состояние → рендер → обработчики). Классический скрипт, без
   модулей: грузится после sidebar.js и оборачивает глобальный
   switchTab, чтобы лениво инициализироваться при входе на вкладку
   market-bonds. Всё под префиксом .bnd-, изолировано от .stk-.
   ============================================================ */
(function () {
    'use strict';

    // URL опубликованного листа облигаций в формате CSV (доступ без авторизации)
    var CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSl8uP-rbiQbK57e9L5xxu8dHKzN05jNsJukOMclUn0wuaT2UNsnX-PIAaCctInmwDOzffdPuah4bER/pub?gid=1225879888&single=true&output=csv';

    // Столбцы основной таблицы (key — точное имя заголовка из CSV).
    // type: 'num' — сортировка по распарсенному числу; 'text' — по строке (ru);
    //       'date' — по дате (формат «05-Aug-2026», сортировка хронологическая).
    // align:'center' — у всех столбцов после закреплённого (единое выравнивание).
    // Закреплённая первая колонка — Название + ISIN (см. renderBondRow).
    var COLS = [
        { key: 'кп',                               label: 'КП',          type: 'num',  align: 'center', title: 'Купонный период, дней' },
        { key: 'Текущая Цена',                     label: 'Цена',        type: 'num',  align: 'center' },
        { key: 'Текущая Купонная Доходность',      label: 'Куп. дох.',   type: 'num',  align: 'center', title: 'Текущая купонная доходность' },
        { key: 'Среднегодовая Простая Доходность', label: 'Ср. дох./год',type: 'num',  align: 'center', title: 'Среднегодовая простая доходность' },
        { key: 'НКД',                              label: 'НКД',         type: 'num',  align: 'center', title: 'Накопленный купонный доход' },
        { key: 'Купон',                            label: 'Купон',       type: 'num',  align: 'center' },
        { key: 'Дата Купона',                      label: 'Дата купона', type: 'date', align: 'center' },
        { key: 'Номинал',                          label: 'Номинал',     type: 'num',  align: 'center' },
        { key: 'Дата погашения',                   label: 'Погашение',   type: 'date', align: 'center' }
    ];

    // Звезда «в избранное» (заливка управляется классом .active через CSS)
    var STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg>';

    // Видимые столбцы (с учётом скрытых пользователем) и общее число колонок
    // (включая закреплённую Название/ISIN) — для colspan строки «ничего не найдено».
    function visibleCols() {
        if (!state.hiddenCols.length) return COLS;
        return COLS.filter(function (c) { return state.hiddenCols.indexOf(c.key) === -1; });
    }
    function totalCols() { return visibleCols().length + 1; }

    // Правила условной подсветки ячеек (цвет сайдбара #8FB3A0).
    // op: '>','>=','<','==' — числовой порог (val, редактируется);
    //     'always' — всегда; '<col'/'>=col' — сравнение с другим столбцом (col).
    // Для облигаций: выше доходность — лучше (пороги редактируются в панели «Правила»).
    var DEFAULT_RULES = [
        { key: 'Текущая Купонная Доходность',      label: 'Куп. дох.',    op: '>=', val: 10 },
        { key: 'Среднегодовая Простая Доходность', label: 'Ср. дох./год', op: '>=', val: 15 }
    ];

    // Избранное — единственное, что переживает перезагрузку (localStorage)
    var FAV_KEY = 'bnd_fav_v1';
    function loadFavs() {
        try { var a = JSON.parse(localStorage.getItem(FAV_KEY)); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function saveFavs() {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites)); } catch (e) {}
    }

    // ---------- СОСТОЯНИЕ (в памяти; кроме избранного) ----------
    var state = {
        bonds: null,       // распарсенные облигации (кеш на сессию)
        status: 'idle',    // idle | loading | error | empty | ready
        // Многоуровневая сортировка: массив { key, type, dir }. Порядок = приоритет.
        // key '__name' — закреплённая первая колонка. Пустой массив = без сортировки.
        sort: [],
        query: '',         // строка поиска по названию/ISIN
        favorites: loadFavs(), // ISIN в избранном (localStorage)
        favOnly: false,    // показывать только избранное
        rules: DEFAULT_RULES.map(function (r) { return Object.assign({}, r); }), // правила окраски (редактируемые)
        hiddenCols: []     // ключи скрытых столбцов
    };

    // =========================================================
    //  ХЕЛПЕРЫ
    // =========================================================

    // Ошибки формул таблицы (#DIV/0!, #N/A, #REF! …) — трактуем как пусто
    function isErr(s) {
        s = (s == null ? '' : String(s)).trim();
        return /^#(div\/0!|n\/a|name\?|null!|num!|ref!|value!|error!|calc!|spill!|getting_data)/i.test(s);
    }

    // Парсинг числа из отформатированной строки. CSV отдаёт US-формат
    // (запятая — тысячи, точка — десятичная: «1,000.00»); знак «%» срезаем.
    function parseNum(s) {
        if (s == null) return NaN;
        s = String(s).trim();
        if (!s || s === '—' || s === '-' || s === 'N/A' || s === 'n/a' || isErr(s)) return NaN;
        s = s.replace(/[\s  ]/g, '').replace(/%/g, '');
        var hasComma = s.indexOf(',') !== -1;
        var hasDot = s.indexOf('.') !== -1;
        if (hasComma && hasDot) {
            if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
                s = s.replace(/\./g, '').replace(',', '.'); // EU: точки — тысячи
            } else {
                s = s.replace(/,/g, '');                    // US: запятые — тысячи
            }
        } else if (hasComma) {
            var parts = s.split(',');
            if (parts.length === 2 && parts[1].length !== 3) s = s.replace(',', '.');
            else s = s.replace(/,/g, '');
        }
        var n = parseFloat(s);
        return isFinite(n) ? n : NaN;
    }

    // Парсинг даты «05-Aug-2026» (DD-Mon-YYYY, английский месяц) → timestamp.
    // Используется для хронологической сортировки столбцов-дат. NaN — если не дата.
    var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    function parseDate(s) {
        if (s == null) return NaN;
        s = String(s).trim();
        var m = s.match(/^(\d{1,2})[-\s.\/]([A-Za-zА-Яа-я]{3,})[-\s.\/](\d{4})$/);
        if (!m) return NaN;
        var mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
        if (mo == null) return NaN;
        return new Date(parseInt(m[3], 10), mo, parseInt(m[1], 10)).getTime();
    }

    function isEmptyVal(s) {
        s = (s == null ? '' : String(s)).trim();
        return s === '' || s === '—' || s === '-' || s === 'N/A' || s.toLowerCase() === 'n/a' || isErr(s);
    }

    // Показ ячейки-числа/текста: пусто/ошибка → «—»; иначе как есть.
    function displayCell(raw) {
        if (isEmptyVal(raw)) return '—';
        return esc(String(raw).trim());
    }

    // Показ ячейки-даты: «05-Aug-2026» → «05.08.2026» (Ru); если не распознали —
    // показываем исходную строку; пусто → «—».
    function displayDate(raw) {
        if (isEmptyVal(raw)) return '—';
        var t = parseDate(raw);
        if (isNaN(t)) return esc(String(raw).trim());
        var d = new Date(t);
        var dd = ('0' + d.getDate()).slice(-2);
        var mm = ('0' + (d.getMonth() + 1)).slice(-2);
        return dd + '.' + mm + '.' + d.getFullYear();
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Целое число в столбце «Номер» → это строка облигации
    function isIntStr(s) {
        s = (s == null ? '' : String(s)).trim();
        return s !== '' && /^\d+$/.test(s);
    }

    // =========================================================
    //  ЗАГРУЗКА + ПАРСИНГ
    // =========================================================

    // Устойчивый CSV-парсер: кавычки, экранированные кавычки (""),
    // запятые и переводы строк внутри полей, CRLF.
    function parseCSV(text) {
        var rows = [], row = [], field = '', i = 0, inQuotes = false;
        var n = text.length;
        while (i < n) {
            var ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                    inQuotes = false; i++; continue;
                }
                field += ch; i++; continue;
            }
            if (ch === '"') { inQuotes = true; i++; continue; }
            if (ch === ',') { row.push(field); field = ''; i++; continue; }
            if (ch === '\r') { i++; continue; }
            if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += ch; i++;
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows;
    }

    // Разбор плоского листа в массив облигаций. Каждая строка, где «Номер»
    // (столбец A) — целое число и есть название — это одна облигация.
    function buildBonds(rows) {
        if (!rows.length) return [];
        var headers = rows[0].map(function (h) { return (h || '').trim(); });
        var bonds = [];
        for (var r = 1; r < rows.length; r++) {
            var row = rows[r];
            if (!row) continue;
            var a = (row[0] || '').trim();
            var name = (row[1] || '').trim();
            if (!isIntStr(a) || !name) continue;
            var main = {};
            for (var c = 0; c < headers.length; c++) main[headers[c]] = (row[c] || '').trim();
            bonds.push({
                num: parseInt(a, 10),
                name: name,
                isin: (main['isin'] || '').trim() || name, // ISIN как уникальный ключ (fallback — имя)
                main: main
            });
        }
        return bonds;
    }

    // Загрузка CSV (кеш на сессию в state.bonds)
    function loadData() {
        if (state.status === 'loading') return;
        state.status = 'loading';
        renderState();
        fetch(CSV_URL, { cache: 'no-store' })
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.text();
            })
            .then(function (text) {
                var bonds = buildBonds(parseCSV(text));
                state.bonds = bonds;
                state.status = bonds.length ? 'ready' : 'empty';
                render();
                if (typeof window.onBndBondsLoaded === 'function') { try { window.onBndBondsLoaded(); } catch (e) {} }
            })
            .catch(function (err) {
                console.warn('[bond-terminal] ошибка загрузки:', err);
                state.status = 'error';
                renderState();
            });
    }

    // =========================================================
    //  ФИЛЬТР (поиск по названию/ISIN + только избранное)
    // =========================================================
    function filterList(list) {
        var q = state.query.trim().toLowerCase();
        var favOnly = state.favOnly;
        if (!q && !favOnly) return list;
        return list.filter(function (b) {
            if (favOnly && state.favorites.indexOf(b.isin) === -1) return false;
            if (q && b.name.toLowerCase().indexOf(q) === -1 &&
                     (b.isin || '').toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
    }

    // =========================================================
    //  СОРТИРОВКА
    // =========================================================
    // Многоуровневая: проходим по state.sort по приоритету, первое ненулевое
    // сравнение определяет порядок. Пустые/«—»/ошибки — всегда в конец.
    function sortList(list) {
        if (!state.sort.length) return list;
        var S = state.sort;
        var arr = list.slice();
        arr.sort(function (x, y) {
            for (var i = 0; i < S.length; i++) {
                var s = S[i], key = s.key, r;
                var av = key === '__name' ? x.name : x.main[key];
                var bv = key === '__name' ? y.name : y.main[key];
                if (s.type === 'num' || s.type === 'date') {
                    var conv = s.type === 'date' ? parseDate : parseNum;
                    var an = conv(av), bn = conv(bv);
                    var ae = isNaN(an), be = isNaN(bn);
                    if (ae && be) r = 0;
                    else if (ae) return 1;   // пустые всегда в конец
                    else if (be) return -1;
                    else r = (an < bn ? -1 : (an > bn ? 1 : 0)) * s.dir;
                } else {
                    var ax = (av == null ? '' : String(av)).trim();
                    var bx = (bv == null ? '' : String(bv)).trim();
                    var aE = isEmptyVal(ax), bE = isEmptyVal(bx);
                    if (aE && bE) r = 0;
                    else if (aE) return 1;
                    else if (bE) return -1;
                    else r = ax.localeCompare(bx, 'ru') * s.dir;
                }
                if (r !== 0) return r;
            }
            return 0;
        });
        return arr;
    }

    // Информация о сортировке столбца: { idx, dir } или null
    function sortInfo(key) {
        for (var i = 0; i < state.sort.length; i++) {
            if (state.sort[i].key === key) return { idx: i, dir: state.sort[i].dir };
        }
        return null;
    }

    // =========================================================
    //  РЕНДЕР
    // =========================================================
    function root() { return document.getElementById('bndTerminal'); }

    // Состояние загрузки/ошибки/пусто + счётчик в тулбаре
    function renderState() {
        var el = root(); if (!el) return;
        var stEl = el.querySelector('.bnd-state');
        var scEl = el.querySelector('.bnd-scroll');
        if (!stEl || !scEl) return;
        var html = '';
        if (state.status === 'loading') {
            html = '<div class="bnd-spinner"></div>'
                 + '<p class="bnd-state-title">Загружаем данные рынка…</p>'
                 + '<p class="bnd-state-sub">Тянем «Таблицу для Облигаций» из опубликованной таблицы.</p>';
        } else if (state.status === 'error') {
            html = '<p class="bnd-state-title">Не удалось загрузить данные</p>'
                 + '<p class="bnd-state-sub">Проверьте подключение к сети и попробуйте ещё раз.</p>'
                 + '<button class="bnd-retry" type="button" data-act="retry">Повторить</button>';
        } else if (state.status === 'empty') {
            html = '<p class="bnd-state-title">Данных пока нет</p>'
                 + '<p class="bnd-state-sub">Таблица загрузилась, но не содержит строк облигаций.</p>';
        }
        stEl.innerHTML = html;
        var showState = (state.status === 'loading' || state.status === 'error' || state.status === 'empty');
        stEl.classList.toggle('show', showState);
        scEl.style.display = showState ? 'none' : '';
        var cntEl = el.querySelector('.bnd-count');
        if (cntEl) {
            if (!state.bonds) { cntEl.textContent = ''; }
            else if (state.query.trim() || state.favOnly) {
                var f = filterList(state.bonds).length;
                cntEl.textContent = 'найдено ' + f + ' из ' + state.bonds.length;
            } else {
                cntEl.textContent = state.bonds.length + ' ' + plural(state.bonds.length, 'облигация', 'облигации', 'облигаций');
            }
        }
    }

    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
        return many;
    }

    // Шапка таблицы со стрелками сортировки
    var SORT_HINT = 'Клик — сортировка по столбцу · Shift+клик — добавить столбец';
    function renderHead() {
        var ths = '';
        ths += '<th class="bnd-first bnd-head-center' + (sortInfo('__name') ? ' bnd-sorted' : '')
             + '" data-sort="__name" data-type="text" title="' + esc(SORT_HINT) + '">Название / ISIN' + arrow('__name') + '</th>';
        var cols = visibleCols();
        for (var i = 0; i < cols.length; i++) {
            var col = cols[i];
            var cls = ['bnd-th', 'bnd-col-center'];
            if (sortInfo(col.key)) cls.push('bnd-sorted');
            var tip = col.title ? col.title + ' · ' + SORT_HINT : SORT_HINT;
            ths += '<th class="' + cls.join(' ') + '" data-sort="' + esc(col.key) + '" data-type="' + col.type + '" title="' + esc(tip) + '">'
                 + esc(col.label) + arrow(col.key) + '</th>';
        }
        return '<thead><tr>' + ths + '</tr></thead>';
    }
    function arrow(key) {
        var s = sortInfo(key);
        if (!s) return '';
        var prio = state.sort.length > 1 ? '<span class="bnd-sort-prio">' + (s.idx + 1) + '</span>' : '';
        return '<span class="bnd-arrow">' + (s.dir === 1 ? '▲' : '▼') + '</span>' + prio;
    }

    // Одна строка облигации. rank — порядковый номер в текущем отображении (1..N).
    function renderBondRow(b, rank) {
        var isFav = state.favorites.indexOf(b.isin) !== -1;
        // закреплённая ячейка Название/ISIN: номер + название/ISIN, справа — звезда «в избранное»
        var tds = '<td class="bnd-first"><div class="bnd-first-cell">'
             + '<span class="bnd-ident">'
             + '<span class="bnd-num-badge">' + esc(rank) + '</span>'
             + '<span class="bnd-id-text"><span class="bnd-tkr">' + esc(b.name) + '</span>'
             + '<span class="bnd-name">' + esc(b.isin) + '</span></span>'
             + '</span>'
             + '<span class="bnd-first-actions">'
             + '<button class="bnd-fav' + (isFav ? ' active' : '') + '" type="button" data-act="fav" data-isin="' + esc(b.isin) + '" title="' + (isFav ? 'Убрать из избранного' : 'В избранное') + '" aria-label="Избранное">' + STAR_SVG + '</button>'
             + '</span>'
             + '</div></td>';
        // остальные колонки (только видимые) — все центрированы
        var cols = visibleCols();
        for (var i = 0; i < cols.length; i++) {
            var col = cols[i];
            var raw = b.main[col.key];
            var empty = isEmptyVal(raw);
            var cls = 'bnd-col-center';
            if (col.type === 'num') cls += ' bnd-num';
            if (col.type === 'date') cls += ' bnd-date';
            if (empty) cls += ' bnd-empty-cell';
            else if (isHighlightCell(col.key, b)) cls += ' bnd-hl';
            var disp = col.type === 'date' ? displayDate(raw) : displayCell(raw);
            tds += '<td class="' + cls.trim() + '">' + disp + '</td>';
        }
        return '<tr class="bnd-row" data-isin="' + esc(b.isin) + '">' + tds + '</tr>';
    }

    function ruleFor(key) {
        for (var i = 0; i < state.rules.length; i++) if (state.rules[i].key === key) return state.rules[i];
        return null;
    }

    // Условная подсветка ячейки (цвет сайдбара #8FB3A0) по правилам из state.rules.
    function isHighlightCell(key, b) {
        var rule = ruleFor(key);
        if (!rule) return false;
        if (rule.op === 'always') return !isEmptyVal(b.main[key]);
        var v = parseNum(b.main[key]);
        if (isNaN(v)) return false;
        switch (rule.op) {
            case '>':  return v > rule.val;
            case '>=': return v >= rule.val;
            case '<':  return v < rule.val;
            case '==': return v === rule.val;
            case '<col':  { var o = parseNum(b.main[rule.col]);  return !isNaN(o) && v < o; }
            case '>=col': { var o2 = parseNum(b.main[rule.col]); return !isNaN(o2) && v >= o2; }
            default: return false;
        }
    }

    // Полный рендер таблицы (тело строится из текущего состояния)
    function render() {
        var el = root(); if (!el) return;
        if (state.status !== 'ready') { renderState(); return; }
        renderState();
        populateRulesPanel();
        populateColsPanel();
        updateSortReset();
        updateFavBtn();

        var scEl = el.querySelector('.bnd-scroll');
        // Shell ещё не построен (зашли на вкладку позже автозагрузки): статус
        // остаётся 'ready', renderBondTerminal построит shell и вызовет render().
        if (!scEl) return;

        var visible = filterList(state.bonds);
        var bodyHtml = '';
        if (!visible.length) {
            var msg;
            if (state.favOnly && !state.favorites.length) msg = 'В избранном пока пусто — добавьте облигации звёздочкой ★ в строке.';
            else if (state.favOnly) msg = 'Среди избранного ничего не найдено по текущему фильтру.';
            else if (state.query.trim()) msg = 'Ничего не найдено по запросу «' + esc(state.query.trim()) + '»';
            else msg = 'Нет облигаций под выбранный фильтр.';
            bodyHtml = '<tr class="bnd-noresult"><td colspan="' + totalCols() + '">' + msg + '</td></tr>';
        } else {
            var rank = 0;
            sortList(visible).forEach(function (b) { bodyHtml += renderBondRow(b, ++rank); });
        }
        scEl.innerHTML = '<table class="bnd-table">' + renderHead() + '<tbody>' + bodyHtml + '</tbody></table>';
    }

    function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

    // =========================================================
    //  ОБРАБОТЧИКИ
    // =========================================================
    function onClick(e) {
        var el = root(); if (!el) return;

        if (e.target.closest('[data-act="retry"]')) { loadData(); return; }

        // очистка поиска
        if (e.target.closest('[data-act="clear-search"]')) {
            var inp = el.querySelector('.bnd-search-input');
            inp.value = ''; state.query = '';
            el.querySelector('.bnd-search-clear').hidden = true;
            if (state.status === 'ready') render();
            inp.focus();
            return;
        }

        // меню правил окраски
        if (e.target.closest('[data-act="rules-toggle"]')) {
            var rmenu = el.querySelector('.bnd-rules-menu');
            if (rmenu) rmenu.hidden = !rmenu.hidden;
            return;
        }
        if (e.target.closest('[data-act="rules-reset"]')) {
            state.rules = DEFAULT_RULES.map(function (r) { return Object.assign({}, r); });
            el.querySelectorAll('.bnd-rule-val').forEach(function (inp) {
                var rule = ruleFor(inp.getAttribute('data-rule'));
                if (rule) inp.value = rule.val;
            });
            if (state.status === 'ready') render();
            return;
        }

        // меню видимости столбцов
        if (e.target.closest('[data-act="cols-toggle"]')) {
            var cmenu = el.querySelector('.bnd-cols-menu');
            if (cmenu) cmenu.hidden = !cmenu.hidden;
            return;
        }
        if (e.target.closest('[data-act="cols-reset"]')) {
            state.hiddenCols = [];
            el.querySelectorAll('.bnd-col-opt input').forEach(function (c) { c.checked = true; });
            updateColsBadge();
            updateSortReset();
            if (state.status === 'ready') render();
            return;
        }

        // только избранное
        if (e.target.closest('[data-act="fav-toggle"]')) {
            state.favOnly = !state.favOnly;
            updateFavBtn();
            if (state.status === 'ready') render();
            return;
        }
        // сбросить сортировку + восстановить скрытые столбцы
        if (e.target.closest('[data-act="sort-reset"]')) {
            state.sort = [];
            state.hiddenCols = [];
            el.querySelectorAll('.bnd-col-opt input').forEach(function (c) { c.checked = true; });
            updateColsBadge();
            if (state.status === 'ready') render();
            return;
        }

        // звезда «в избранное» в строке
        var favBtn = e.target.closest('[data-act="fav"]');
        if (favBtn) { toggleFav(favBtn.getAttribute('data-isin')); return; }

        // сортировка по заголовку (обычный клик — одиночная ▲/▼/выкл; Shift+клик — многоуровневая)
        var th = e.target.closest('th[data-sort]');
        if (th) {
            var key = th.getAttribute('data-sort');
            var type = th.getAttribute('data-type') || 'text';
            var arr = state.sort;
            var pos = -1;
            for (var si = 0; si < arr.length; si++) { if (arr[si].key === key) { pos = si; break; } }
            if (e.shiftKey) {
                if (pos === -1) arr.push({ key: key, type: type, dir: 1 });
                else if (arr[pos].dir === 1) arr[pos].dir = -1;
                else arr.splice(pos, 1);
            } else {
                if (arr.length === 1 && pos === 0) {
                    if (arr[0].dir === 1) arr[0].dir = -1;
                    else state.sort = [];
                } else {
                    state.sort = [{ key: key, type: type, dir: 1 }];
                }
            }
            render();
            return;
        }
    }

    // =========================================================
    //  ИНИЦИАЛИЗАЦИЯ / ТОЧКА ВХОДА
    // =========================================================
    var built = false;
    function buildShell() {
        var el = root(); if (!el || built) return;
        el.innerHTML =
            '<div class="bnd-toolbar">'
            + '  <div class="bnd-title-wrap"><h2 class="bnd-title">Терминал · Облигации</h2>'
            + '    <span class="bnd-count"></span></div>'
            + '  <div class="bnd-tools">'
            + '    <label class="bnd-search">'
            + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
            + '      <input class="bnd-search-input" type="text" placeholder="Поиск: название или ISIN" autocomplete="off" spellcheck="false">'
            + '      <button class="bnd-search-clear" type="button" data-act="clear-search" aria-label="Очистить" hidden>×</button>'
            + '    </label>'
            + '    <div class="bnd-rulesfilter">'
            + '      <button class="bnd-rules-btn" type="button" data-act="rules-toggle" title="Правила окраски ячеек">'
            + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>'
            + '        <span class="bnd-rules-label">Правила</span>'
            + '      </button>'
            + '      <div class="bnd-rules-menu" hidden>'
            + '        <div class="bnd-menu-head"><span>Правила окраски</span>'
            + '          <button type="button" class="bnd-reset" data-act="rules-reset">По умолчанию</button></div>'
            + '        <p class="bnd-rules-hint">Ячейка подсвечивается <b>зелёным</b>, если условие выполнено. Значения порогов можно менять.</p>'
            + '        <div class="bnd-rules-list"></div>'
            + '      </div>'
            + '    </div>'
            + '    <div class="bnd-colsfilter">'
            + '      <button class="bnd-cols-btn" type="button" data-act="cols-toggle" title="Показать/скрыть столбцы">'
            + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>'
            + '        <span class="bnd-cols-label">Столбцы</span>'
            + '        <span class="bnd-cols-badge" hidden></span>'
            + '        <svg class="bnd-cols-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
            + '      </button>'
            + '      <div class="bnd-cols-menu" hidden>'
            + '        <div class="bnd-menu-head"><span>Видимость столбцов</span>'
            + '          <button type="button" class="bnd-reset" data-act="cols-reset">Показать все</button></div>'
            + '        <div class="bnd-cols-list"></div>'
            + '      </div>'
            + '    </div>'
            + '    <span class="bnd-multisort-hint" hidden>'
            + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M5 12h9M5 17h5"/><path d="M16 14l3 3-3 3"/></svg>'
            + '      <span><b>Shift</b> + клик по столбцу — сортировка сразу по нескольким</span>'
            + '    </span>'
            + '    <button class="bnd-sortreset" type="button" data-act="sort-reset" hidden title="Сбросить сортировку и показать все столбцы">'
            + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
            + '      <span>Сбросить сортировку</span>'
            + '    </button>'
            + '    <button class="bnd-fav-btn" type="button" data-act="fav-toggle" title="Показать только избранное">'
            + '      ' + STAR_SVG
            + '      <span class="bnd-fav-label">Избранное</span>'
            + '      <span class="bnd-fav-badge" hidden></span>'
            + '    </button>'
            + '  </div>'
            + '</div>'
            + '<div class="bnd-state"></div>'
            + '<div class="bnd-scroll"></div>';
        el.addEventListener('click', onClick);
        // поиск
        var input = el.querySelector('.bnd-search-input');
        var clearBtn = el.querySelector('.bnd-search-clear');
        input.addEventListener('input', function () {
            state.query = input.value;
            clearBtn.hidden = !input.value;
            if (state.status === 'ready') render();
        });
        // видимость столбцов (чекбоксы)
        el.addEventListener('change', function (e) {
            var colcb = e.target.closest('.bnd-col-opt input');
            if (colcb) {
                var key = colcb.value;
                var hidx = state.hiddenCols.indexOf(key);
                if (!colcb.checked && hidx === -1) state.hiddenCols.push(key);
                else if (colcb.checked && hidx !== -1) state.hiddenCols.splice(hidx, 1);
                updateColsBadge();
                updateSortReset();
                if (state.status === 'ready') render();
            }
        });
        // изменение порога правила окраски
        el.addEventListener('input', function (e) {
            var inp = e.target.closest('.bnd-rule-val');
            if (!inp) return;
            var rule = ruleFor(inp.getAttribute('data-rule'));
            if (!rule) return;
            var n = parseFloat(inp.value);
            rule.val = isFinite(n) ? n : 0;
            if (state.status === 'ready') render();
        });
        // клик вне выпадающих меню — закрыть
        document.addEventListener('click', function (e) {
            var elr = root(); if (!elr) return;
            var rm = elr.querySelector('.bnd-rules-menu');
            if (rm && !rm.hidden && !e.target.closest('.bnd-rulesfilter')) rm.hidden = true;
            var cm = elr.querySelector('.bnd-cols-menu');
            if (cm && !cm.hidden && !e.target.closest('.bnd-colsfilter')) cm.hidden = true;
        });
        built = true;
    }

    // Наполнить панель правил окраски (один раз)
    function populateRulesPanel() {
        var el = root(); if (!el) return;
        var listEl = el.querySelector('.bnd-rules-list');
        if (!listEl || listEl.childElementCount) return;
        var opSym = { '>': '>', '>=': '≥', '<': '<', '==': '=' };
        listEl.innerHTML = state.rules.map(function (r) {
            var unit = (r.op === '==') ? '' : '%';
            if (r.op === 'always' || r.op === '<col' || r.op === '>=col') {
                var desc = r.op === 'always' ? 'подсвечивается всегда'
                         : (r.op === '<col' ? '&lt; ' + esc(r.colLabel) : '≥ ' + esc(r.colLabel));
                return '<div class="bnd-rule bnd-rule-info"><span class="bnd-rule-sw"></span>'
                     + '<span class="bnd-rule-name">' + esc(r.label) + '</span>'
                     + '<span class="bnd-rule-desc">' + desc + '</span></div>';
            }
            return '<div class="bnd-rule"><span class="bnd-rule-sw"></span>'
                 + '<span class="bnd-rule-name">' + esc(r.label) + '</span>'
                 + '<span class="bnd-rule-op">' + opSym[r.op] + '</span>'
                 + '<input class="bnd-rule-val" type="number" step="any" data-rule="' + esc(r.key) + '" value="' + esc(r.val) + '">'
                 + (unit ? '<span class="bnd-rule-unit">' + unit + '</span>' : '<span class="bnd-rule-unit"></span>')
                 + '</div>';
        }).join('');
    }

    // Наполнить меню видимости столбцов чекбоксами (один раз).
    function populateColsPanel() {
        var el = root(); if (!el) return;
        var listEl = el.querySelector('.bnd-cols-list');
        if (!listEl || listEl.childElementCount) return;
        listEl.innerHTML = COLS.map(function (c) {
            var checked = state.hiddenCols.indexOf(c.key) === -1 ? ' checked' : '';
            return '<label class="bnd-col-opt"><input type="checkbox" value="' + esc(c.key) + '"' + checked + '>'
                 + '<span class="bnd-col-opt-tx">' + esc(c.label) + '</span></label>';
        }).join('');
    }

    // Переключить ISIN в избранном (с сохранением в localStorage)
    function toggleFav(isin) {
        if (!isin) return;
        var idx = state.favorites.indexOf(isin);
        if (idx === -1) state.favorites.push(isin); else state.favorites.splice(idx, 1);
        saveFavs();
        updateFavBtn();
        if (state.favOnly) { if (state.status === 'ready') render(); return; }
        var el = root(); if (!el) return;
        var on = state.favorites.indexOf(isin) !== -1;
        el.querySelectorAll('.bnd-fav[data-isin="' + cssEscape(isin) + '"]').forEach(function (b) {
            b.classList.toggle('active', on);
            b.title = on ? 'Убрать из избранного' : 'В избранное';
        });
    }

    // Кнопка «Избранное» в тулбаре (счётчик + подсветка активного режима)
    function updateFavBtn() {
        var el = root(); if (!el) return;
        var btn = el.querySelector('.bnd-fav-btn');
        var badge = el.querySelector('.bnd-fav-badge');
        var n = state.favorites.length;
        if (badge) { badge.hidden = n === 0; badge.textContent = n; }
        if (btn) btn.classList.toggle('active', state.favOnly);
    }

    // Кнопка сброса (сортировка + скрытые столбцы) и подсказка мультисортировки
    function updateSortReset() {
        var el = root(); if (!el) return;
        var b = el.querySelector('.bnd-sortreset');
        if (b) b.hidden = state.sort.length === 0 && state.hiddenCols.length === 0;
        var hint = el.querySelector('.bnd-multisort-hint');
        if (hint) hint.hidden = state.sort.length === 0;
    }

    // Бейдж с числом скрытых столбцов + подсветка кнопки «Столбцы»
    function updateColsBadge() {
        var el = root(); if (!el) return;
        var badge = el.querySelector('.bnd-cols-badge');
        var btn = el.querySelector('.bnd-cols-btn');
        var n = state.hiddenCols.length;
        if (badge) { badge.hidden = n === 0; badge.textContent = n; }
        if (btn) btn.classList.toggle('active', n > 0);
    }

    // ---- Внешний доступ для дашборда (блок «Избранное») ----
    // Дашборд читает избранное и данные облигаций отсюда, чтобы был единый
    // источник правды (без рассинхрона с localStorage). Ключ избранного — ISIN.
    window.bndGetFavorites = function () { return state.favorites.slice(); };
    window.bndFindBond = function (isin) {
        if (!isin || !state.bonds) return null;
        for (var i = 0; i < state.bonds.length; i++) {
            if (state.bonds[i].isin === isin) return state.bonds[i];
        }
        return null;
    };
    window.bndToggleFav = function (isin) {
        toggleFav(isin);
        return state.favorites.indexOf(isin) !== -1;
    };
    // Подтянуть таблицу облигаций в фоне (нужно дашборду для имён/доходности в избранном)
    window.bndEnsureLoaded = function () {
        if (state.bonds && state.bonds.length) {
            if (typeof window.onBndBondsLoaded === 'function') { try { window.onBndBondsLoaded(); } catch (e) {} }
            return;
        }
        if (state.status !== 'loading') loadData();
    };

    // Автозагрузка при старте — чтобы избранные облигации показывались в дашборде,
    // даже если пользователь ещё не открывал вкладку «Облигации».
    setTimeout(function () { if (state.status === 'idle' && (!state.bonds || !state.bonds.length)) loadData(); }, 700);

    // Вызывается при входе на вкладку market-bonds
    window.renderBondTerminal = function () {
        buildShell();
        if (state.status === 'idle') { loadData(); return; }
        if (state.status === 'ready') { render(); }
        else renderState();
    };

    // Оборачиваем глобальный switchTab — файл грузится после sidebar.js,
    // поэтому наш wrapper внешний и срабатывает после смены панели.
    if (typeof window.switchTab === 'function') {
        var _bndPrevSwitchTab = window.switchTab;
        window.switchTab = function (tabId) {
            _bndPrevSwitchTab.apply(this, arguments);
            if (tabId === 'market-bonds') window.renderBondTerminal();
        };
    }
})();
