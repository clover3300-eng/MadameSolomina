/* ============================================================
   МОДУЛЬ «ТАБЛИЦА ТЕРМИНАЛА» — Рынок · Акции
   ------------------------------------------------------------
   Интерактивная таблица акций: группировка по секторам/общий
   список, сортировка по столбцам, раскрывающиеся карточки
   показателей по годам.

   Данные — опубликованный CSV «Таблица для Терминала».
   Структура кода: загрузка → парсинг → состояние → рендер →
   обработчики. Классические скрипты, без модулей (порядок
   подключения важен — этот файл грузится последним и оборачивает
   глобальный switchTab, чтобы лениво инициализироваться при входе
   на вкладку market-stocks).
   ============================================================ */
(function () {
    'use strict';

    // URL опубликованного листа в формате CSV (доступ без авторизации)
    var CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQOS1fww8td_IIjlZL7uiD3-7aDF6BVDFPC6jSUv92fisIdnud4lS9MfWoyovN803yll-zOWbipEMig/pub?gid=535001813&single=true&output=csv';

    // Столбцы основной таблицы (key — точное имя заголовка из CSV).
    // type: 'num' — сортировка по распарсенному числу; 'text' — по строке (ru).
    // align: 'center'   — центрируем И заголовок, И данные (категориальные столбцы);
    // headCenter: true  — центрируем ТОЛЬКО заголовок (данные-числа остаются справа).
    var COLS = [
        { key: 'РСБУ/МСФО',                      label: 'Учёт',           type: 'text' },
        { key: 'Текущая Цена',                   label: 'Цена',           type: 'num', headCenter: true },
        { key: 'EPS',                            label: 'EPS',            type: 'num', headCenter: true },
        { key: 'ОДХС',                           label: 'ОДХС',           type: 'num' },
        { key: 'Изменение СК',                   label: 'Изм. СК',        type: 'num' },
        { key: 'ROE',                            label: 'ROE',            type: 'num', headCenter: true },
        { key: 'Изменение Выручки',              label: 'Изм. Выручки',   type: 'num' },
        { key: 'Изменение Валовой прибыли',      label: 'Изм. Вал.приб.', type: 'num' },
        { key: 'Изменение Операционной прибыли', label: 'Изм. Опер.приб.',type: 'num' },
        { key: 'Изменение Чистой прибыли',       label: 'Изм. Чист.приб.',type: 'num' },
        { key: 'Денежный Поток от ОД',           label: 'ДП от ОД',       type: 'num' },
        { key: 'Процент Обязательств 2025г',     label: '% Обяз. 2025',   type: 'num' },
        { key: 'Процент Обязательств 2024г',     label: '% Обяз. 2024',   type: 'num' },
        { key: 'Сектор',                         label: 'Сектор',         type: 'text', align: 'center' },
        { key: 'P/BV',                           label: 'P/BV',           type: 'num', headCenter: true },
        { key: 'BV/кол-во акций',                label: 'BV/акц.',        type: 'num' },
        { key: 'P/E',                            label: 'P/E',            type: 'num', headCenter: true },
        { key: 'Маржа Валовой прибыли',          label: 'Маржа Вал.',     type: 'num' },
        { key: 'Маржа Операционной прибыли',     label: 'Маржа Опер.',    type: 'num' },
        { key: 'Маржа Чистой прибыли',           label: 'Маржа Чист.',    type: 'num' },
        { key: 'Объем выпуска, шт.',             label: 'Объём выпуска',  type: 'num' },
        { key: 'Платят дивиденды',               label: 'Дивиденды',      type: 'text', align: 'center' },
        { key: 'Количество в год',               label: 'Выплат/год',     type: 'num',  align: 'center' },
        { key: 'ЭШЕЛОН',                         label: 'Эшелон',         type: 'text', align: 'center' },
        { key: 'ПРИВИЛЕГИРОВАННЫЕ АКЦИИ',        label: 'Привилегированные акции', type: 'text', align: 'center' },
        { key: 'СОСТОЯНИЕ',                      label: 'Состояние',      type: 'text', align: 'center' }
    ];
    var TOTAL_COLS = COLS.length + 1; // +1 — закреплённая колонка Тикер/Название

    // Звезда «в избранное» (заливка управляется классом .active через CSS)
    var STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg>';

    // Правила условной подсветки ячеек (цвет сайдбара #8FB3A0).
    // op: '>','>=','<','==' — числовой порог (val, редактируется);
    //     'always' — всегда; '<col'/'>=col' — сравнение с другим столбцом (col).
    var DEFAULT_RULES = [
        { key: 'EPS',                            label: 'EPS',            op: '>',  val: 0 },
        { key: 'ОДХС',                           label: 'ОДХС',           op: '>',  val: 25 },
        { key: 'Изменение СК',                   label: 'Изм. СК',        op: '>',  val: 5 },
        { key: 'ROE',                            label: 'ROE',            op: '>',  val: 20 },
        { key: 'Изменение Выручки',              label: 'Изм. Выручки',   op: '>',  val: 5 },
        { key: 'Изменение Валовой прибыли',      label: 'Изм. Вал. приб.',op: '>',  val: 5 },
        { key: 'Изменение Операционной прибыли', label: 'Изм. Опер. приб.',op: '>', val: 5 },
        { key: 'Изменение Чистой прибыли',       label: 'Изм. Чист. приб.',op: '>', val: 5 },
        { key: 'Денежный Поток от ОД',           label: 'ДП от ОД',       op: '==', val: 1 },
        { key: 'Процент Обязательств 2025г',     label: '% Обяз. 2025',   op: '<col', col: 'Процент Обязательств 2024г', colLabel: '% Обяз. 2024' },
        { key: 'Процент Обязательств 2024г',     label: '% Обяз. 2024',   op: 'always' },
        { key: 'BV/кол-во акций',                label: 'BV/акц.',        op: '>=col', col: 'Текущая Цена', colLabel: 'Цены' },
        { key: 'Маржа Валовой прибыли',          label: 'Маржа Вал.',     op: '>=', val: 40 },
        { key: 'Маржа Операционной прибыли',     label: 'Маржа Опер.',    op: '>=', val: 25 },
        { key: 'Маржа Чистой прибыли',           label: 'Маржа Чист.',    op: '>=', val: 15 }
    ];

    // Избранное — единственное, что переживает перезагрузку (localStorage)
    var FAV_KEY = 'stk_fav_v1';
    function loadFavs() {
        try { var a = JSON.parse(localStorage.getItem(FAV_KEY)); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function saveFavs() {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites)); } catch (e) {}
    }

    // ---------- СОСТОЯНИЕ (в памяти; кроме избранного) ----------
    var state = {
        companies: null,   // распарсенные компании (кеш на сессию)
        status: 'idle',    // idle | loading | error | empty | ready
        mode: 'sector',    // 'sector' | 'flat'
        // Многоуровневая сортировка: массив { key, type, dir }. Порядок = приоритет.
        // key '__ticker' — закреплённая первая колонка. Пустой массив = без сортировки.
        sort: [],
        query: '',         // строка поиска по тикеру/названию
        sectors: [],       // выбранные секторы (пусто = все)
        favorites: loadFavs(), // тикеры в избранном (localStorage)
        favOnly: false,    // показывать только избранное
        rules: DEFAULT_RULES.map(function (r) { return Object.assign({}, r); }), // правила окраски (редактируемые)
        expanded: {}       // ticker -> true (раскрытые карточки)
    };

    // =========================================================
    //  ХЕЛПЕРЫ
    // =========================================================

    // Парсинг числа из отформатированной строки. Данные могут быть в
    // US-формате (запятая — тысячи, точка — десятичная: «23,640.00») или
    // EU-формате (пробел/  — тысячи, запятая — десятичная). Возвращаем
    // NaN для пустых/«—». Используется для сортировки и знака (±).
    // Ошибки формул таблицы (#DIV/0!, #N/A, #REF! …) — трактуем как пусто
    function isErr(s) {
        s = (s == null ? '' : String(s)).trim();
        return /^#(div\/0!|n\/a|name\?|null!|num!|ref!|value!|error!|calc!|spill!|getting_data)/i.test(s);
    }

    function parseNum(s) {
        if (s == null) return NaN;
        s = String(s).trim();
        if (!s || s === '—' || s === '-' || s === 'N/A' || s === 'n/a' || isErr(s)) return NaN;
        // убираем все виды пробелов (вкл. неразрывный/узкий) и знак процента
        s = s.replace(/[\s  ]/g, '').replace(/%/g, '');
        var hasComma = s.indexOf(',') !== -1;
        var hasDot = s.indexOf('.') !== -1;
        if (hasComma && hasDot) {
            // последний разделитель — десятичный
            if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
                s = s.replace(/\./g, '').replace(',', '.'); // EU: точки — тысячи
            } else {
                s = s.replace(/,/g, '');                    // US: запятые — тысячи
            }
        } else if (hasComma) {
            var parts = s.split(',');
            // одна запятая и не 3 цифры после неё → десятичная (напр. «28,0»),
            // иначе трактуем как разделитель тысяч (напр. «203,414,000»)
            if (parts.length === 2 && parts[1].length !== 3) s = s.replace(',', '.');
            else s = s.replace(/,/g, '');
        }
        var n = parseFloat(s);
        return isFinite(n) ? n : NaN;
    }

    function isEmptyVal(s) {
        s = (s == null ? '' : String(s)).trim();
        return s === '' || s === '—' || s === '-' || s === 'N/A' || s.toLowerCase() === 'n/a' || isErr(s);
    }

    // Подготовка значения ячейки к показу: пусто/ошибка → «—»;
    // «Количество в год» приходит испорченным датой из Google Sheets
    // (дробь 1/2 превращается в 1/2/2023) — отрезаем фальшивый год;
    // булевы true/false приводим к ВЕРХНЕМУ регистру.
    function displayCell(key, raw) {
        if (isEmptyVal(raw)) return '—';
        var s = String(raw).trim();
        if (key === 'Количество в год') {
            var m = s.match(/^(\d+)\/(\d+)\/\d{2,4}$/);
            if (m) return esc(m[1] + '/' + m[2]);
        }
        var low = s.toLowerCase();
        if (low === 'true') return 'TRUE';
        if (low === 'false') return 'FALSE';
        return esc(s);
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Целое число в столбце A → это строка компании
    function isIntStr(s) {
        s = (s == null ? '' : String(s)).trim();
        return s !== '' && /^\d+$/.test(s);
    }

    // =========================================================
    //  ЗАГРУЗКА + ПАРСИНГ
    // =========================================================

    // Минимальный устойчивый CSV-парсер: учитывает кавычки, экранированные
    // кавычки (""), запятые и переводы строк внутри полей, CRLF.
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
        // последнее поле/строка
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return rows;
    }

    // Разбор плоского листа в массив компаний (см. структуру в ТЗ).
    function buildCompanies(rows) {
        if (!rows.length) return [];
        var headers = rows[0].map(function (h) { return (h || '').trim(); });
        var companies = [];
        var cur = null;          // текущая компания
        var lastMetric = null;   // последний добавленный показатель (для «↳ изм.»)

        // взять срез значений по годам начиная с колонки C+1 (индекс 3)
        function sliceYears(row, len) {
            var out = [];
            for (var k = 0; k < len; k++) out.push((row[3 + k] || '').trim());
            return out;
        }

        for (var r = 1; r < rows.length; r++) {
            var row = rows[r];
            if (!row) continue;
            var a = (row[0] || '').trim();
            var b = (row[1] || '').trim();

            // СТРОКА КОМПАНИИ: A — целое число, B — непустой тикер
            if (isIntStr(a) && b) {
                var main = {};
                for (var c = 0; c < headers.length; c++) main[headers[c]] = (row[c] || '').trim();
                cur = {
                    num: parseInt(a, 10),
                    ticker: b,
                    name: (row[2] || '').trim(),
                    sector: (main['Сектор'] || '').trim() || 'Без сектора',
                    main: main,
                    years: [],
                    metrics: []
                };
                companies.push(cur);
                lastMetric = null;
                continue;
            }

            // СТРОКИ ДЕТАЛИЗАЦИИ относятся к текущей компании
            if (!cur) continue;
            var label = (row[2] || '').trim();
            if (!label) continue;

            if (label === 'Показатель') {
                // массив годов — все непустые ячейки начиная с D
                var years = [];
                for (var y = 3; y < row.length; y++) {
                    var v = (row[y] || '').trim();
                    if (v) years.push(v);
                }
                cur.years = years;
                lastMetric = null;
            } else if (label === '↳ изм.') {
                // присоединяем изменения к последнему показателю
                if (lastMetric) {
                    var len = cur.years.length || (row.length - 3);
                    lastMetric.changes = sliceYears(row, len);
                }
            } else {
                // новый показатель
                var len2 = cur.years.length || (row.length - 3);
                lastMetric = { label: label, values: sliceYears(row, len2), changes: null };
                cur.metrics.push(lastMetric);
            }
        }
        return companies;
    }

    // Загрузка CSV (кеш на сессию в state.companies)
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
                var rows = parseCSV(text);
                var companies = buildCompanies(rows);
                state.companies = companies;
                state.status = companies.length ? 'ready' : 'empty';
                render();
            })
            .catch(function (err) {
                console.warn('[stock-terminal] ошибка загрузки:', err);
                state.status = 'error';
                renderState();
            });
    }

    // =========================================================
    //  ФИЛЬТР (поиск по тикеру/названию)
    // =========================================================
    function filterList(list) {
        var q = state.query.trim().toLowerCase();
        var secs = state.sectors;
        var favOnly = state.favOnly;
        if (!q && !secs.length && !favOnly) return list;
        return list.filter(function (co) {
            if (favOnly && state.favorites.indexOf(co.ticker) === -1) return false;
            if (secs.length && secs.indexOf(co.sector) === -1) return false;
            if (q && co.ticker.toLowerCase().indexOf(q) === -1 &&
                     (co.name || '').toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
    }

    // =========================================================
    //  СОРТИРОВКА
    // =========================================================
    // Многоуровневая сортировка: проходим по state.sort по приоритету,
    // первое ненулевое сравнение определяет порядок. Пустые/«—»/ошибки —
    // всегда в конец (независимо от направления).
    function sortList(list) {
        if (!state.sort.length) return list; // без активной сортировки — исходный порядок
        var S = state.sort;
        var arr = list.slice();
        arr.sort(function (x, y) {
            for (var i = 0; i < S.length; i++) {
                var s = S[i], key = s.key, r;
                var av = key === '__ticker' ? x.ticker : x.main[key];
                var bv = key === '__ticker' ? y.ticker : y.main[key];
                if (s.type === 'num') {
                    var an = parseNum(av), bn = parseNum(bv);
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
    function root() { return document.getElementById('stkTerminal'); }

    // Состояние загрузки/ошибки/пусто
    function renderState() {
        var el = root(); if (!el) return;
        var stEl = el.querySelector('.stk-state');
        var scEl = el.querySelector('.stk-scroll');
        if (!stEl || !scEl) return;
        var html = '';
        if (state.status === 'loading') {
            html = '<div class="stk-spinner"></div>'
                 + '<p class="stk-state-title">Загружаем данные рынка…</p>'
                 + '<p class="stk-state-sub">Тянем «Таблицу для Терминала» из опубликованной таблицы.</p>';
        } else if (state.status === 'error') {
            html = '<p class="stk-state-title">Не удалось загрузить данные</p>'
                 + '<p class="stk-state-sub">Проверьте подключение к сети и попробуйте ещё раз.</p>'
                 + '<button class="stk-retry" type="button" data-act="retry">Повторить</button>';
        } else if (state.status === 'empty') {
            html = '<p class="stk-state-title">Данных пока нет</p>'
                 + '<p class="stk-state-sub">Таблица загрузилась, но не содержит строк компаний.</p>';
        }
        stEl.innerHTML = html;
        var showState = (state.status === 'loading' || state.status === 'error' || state.status === 'empty');
        stEl.classList.toggle('show', showState);
        scEl.style.display = showState ? 'none' : '';
        // счётчик компаний в тулбаре (при поиске — «найдено N»)
        var cntEl = el.querySelector('.stk-count');
        if (cntEl) {
            if (!state.companies) { cntEl.textContent = ''; }
            else if (state.query.trim() || state.sectors.length || state.favOnly) {
                var f = filterList(state.companies).length;
                cntEl.textContent = 'найдено ' + f + ' из ' + state.companies.length;
            } else {
                cntEl.textContent = state.companies.length + ' ' + plural(state.companies.length, 'компания', 'компании', 'компаний');
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
        // первая закреплённая колонка (заголовок по центру по просьбе)
        ths += '<th class="stk-first stk-head-center' + (sortInfo('__ticker') ? ' stk-sorted' : '')
             + '" data-sort="__ticker" data-type="text" title="' + esc(SORT_HINT) + '">Тикер / Название' + arrow('__ticker') + '</th>';
        for (var i = 0; i < COLS.length; i++) {
            var col = COLS[i];
            var cls = ['stk-th'];
            if (sortInfo(col.key)) cls.push('stk-sorted');
            if (col.align === 'center') cls.push('stk-col-center');     // заголовок И данные
            else if (col.headCenter) cls.push('stk-head-center');       // только заголовок
            ths += '<th class="' + cls.join(' ') + '" data-sort="' + esc(col.key) + '" data-type="' + col.type + '" title="' + esc(SORT_HINT) + '">'
                 + esc(col.label) + arrow(col.key) + '</th>';
        }
        return '<thead><tr>' + ths + '</tr></thead>';
    }
    // Стрелка направления + (при многоуровневой сортировке) номер приоритета
    function arrow(key) {
        var s = sortInfo(key);
        if (!s) return '';
        var prio = state.sort.length > 1 ? '<span class="stk-sort-prio">' + (s.idx + 1) + '</span>' : '';
        return '<span class="stk-arrow">' + (s.dir === 1 ? '▲' : '▼') + '</span>' + prio;
    }

    // Одна строка компании + строка-аккордеон под ней.
    // rank — порядковый номер в текущем отображении (1..N), чтобы нумерация была сквозной.
    function renderCompanyRow(co, rank) {
        var idOpen = state.expanded[co.ticker] ? ' open' : '';
        var isFav = state.favorites.indexOf(co.ticker) !== -1;
        var tds = '';
        // закреплённая ячейка Тикер/Название: слева — кнопка-иконка вызова карточки,
        // справа — звезда «в избранное».
        tds += '<td class="stk-first"><div class="stk-first-cell">'
             + '<span class="stk-ident' + idOpen + '" data-act="toggle" data-ticker="' + esc(co.ticker) + '" title="Открыть карточку компании">'
             + '<span class="stk-chev-btn" aria-hidden="true"><svg class="stk-chev-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>'
             + '<span class="stk-num-badge">' + esc(rank) + '</span>'
             + '<span class="stk-id-text"><span class="stk-tkr">' + esc(co.ticker) + '</span>'
             + '<span class="stk-name">' + esc(co.name) + '</span></span>'
             + '</span>'
             + '<button class="stk-fav' + (isFav ? ' active' : '') + '" type="button" data-act="fav" data-ticker="' + esc(co.ticker) + '" title="' + (isFav ? 'Убрать из избранного' : 'В избранное') + '" aria-label="Избранное">' + STAR_SVG + '</button>'
             + '</div></td>';
        // остальные колонки
        for (var i = 0; i < COLS.length; i++) {
            var col = COLS[i];
            var raw = co.main[col.key];
            var empty = isEmptyVal(raw);
            var cls = col.type === 'num' ? 'stk-num' : '';
            if (col.align === 'center') cls += ' stk-col-center';
            if (empty) cls += ' stk-empty-cell';
            // условная подсветка ячейки (цвет сайдбара) по правилам isHighlightCell
            else if (isHighlightCell(col.key, co)) cls += ' stk-hl';
            tds += '<td class="' + cls.trim() + '">' + displayCell(col.key, raw) + '</td>';
        }
        var rowHtml = '<tr class="stk-row" data-ticker="' + esc(co.ticker) + '">' + tds + '</tr>';
        // аккордеон-строка (рендерим содержимое только если раскрыта — иначе лёгкая заглушка)
        var open = !!state.expanded[co.ticker];
        var accInner = open ? renderCardInner(co) : '';
        var accHtml = '<tr class="stk-card-row" data-card="' + esc(co.ticker) + '">'
            + '<td colspan="' + TOTAL_COLS + '"><div class="stk-acc' + (open ? ' open' : '') + '">'
            + accInner + '</div></td></tr>';
        return rowHtml + accHtml;
    }

    // Внутренность карточки показателей.
    // Заголовок не дублируем (тикер/название/сектор уже видны в строке выше).
    // Показатель и его «↳ изм.» объединяем в один визуальный блок (зебра по блокам).
    function renderCardInner(co) {
        if (!co.metrics.length || !co.years.length) {
            return '<div class="stk-card"><div class="stk-card-inner">'
                 + '<div class="stk-card-empty">Нет данных по показателям</div></div></div>';
        }

        // шапка лет
        var thead = '<tr><th class="stk-m-th-first">Показатель</th>';
        for (var y = 0; y < co.years.length; y++) thead += '<th>' + esc(co.years[y]) + '</th>';
        thead += '</tr>';

        // строки показателей (+ строка изменений, если есть)
        var body = '';
        for (var m = 0; m < co.metrics.length; m++) {
            var met = co.metrics[m];
            var grp = (m % 2 === 0) ? 'stk-mg-a' : 'stk-mg-b'; // зебра по блокам показателей
            var hasChg = !!met.changes;
            body += '<tr class="stk-m-row ' + grp + (hasChg ? '' : ' stk-m-solo') + '">'
                 + '<td class="stk-m-label">' + esc(met.label) + '</td>';
            for (var v = 0; v < co.years.length; v++) {
                var val = met.values[v];
                body += '<td class="stk-m-val">' + (isEmptyVal(val) ? '<span class="stk-m-dash">—</span>' : esc(val)) + '</td>';
            }
            body += '</tr>';
            if (hasChg) {
                body += '<tr class="stk-m-chg ' + grp + '"><td class="stk-m-clabel">↳ изм.</td>';
                for (var ch = 0; ch < co.years.length; ch++) {
                    var cv = met.changes[ch];
                    var sign = signClass(cv);
                    body += '<td class="stk-chg ' + sign + '">'
                          + (isEmptyVal(cv) ? '<span class="stk-chg-pill">—</span>' : '<span class="stk-chg-pill">' + esc(cv) + '</span>')
                          + '</td>';
                }
                body += '</tr>';
            }
        }

        return '<div class="stk-card"><div class="stk-card-inner">'
             + '<div class="stk-card-tablewrap"><table class="stk-mini">'
             + '<thead>' + thead + '</thead><tbody>' + body + '</tbody></table></div></div></div>';
    }

    function ruleFor(key) {
        for (var i = 0; i < state.rules.length; i++) if (state.rules[i].key === key) return state.rules[i];
        return null;
    }

    // Условная подсветка ячейки главной таблицы (цвет сайдбара #8FB3A0).
    // Возвращает true, если значение в столбце key удовлетворяет правилу из state.rules.
    function isHighlightCell(key, co) {
        var rule = ruleFor(key);
        if (!rule) return false;
        if (rule.op === 'always') return !isEmptyVal(co.main[key]);
        var v = parseNum(co.main[key]);
        if (isNaN(v)) return false;
        switch (rule.op) {
            case '>':  return v > rule.val;
            case '>=': return v >= rule.val;
            case '<':  return v < rule.val;
            case '==': return v === rule.val;
            case '<col':  { var o = parseNum(co.main[rule.col]);  return !isNaN(o) && v < o; }
            case '>=col': { var o2 = parseNum(co.main[rule.col]); return !isNaN(o2) && v >= o2; }
            default: return false;
        }
    }

    // Класс знака для подсветки изменений (используется в карточке)
    function signClass(v) {
        if (isEmptyVal(v)) return 'neu';
        var n = parseNum(v);
        if (isNaN(n) || n === 0) return 'neu';
        return n > 0 ? 'pos' : 'neg';
    }

    // Полный рендер таблицы (тело строится из текущего состояния)
    function render() {
        var el = root(); if (!el) return;
        if (state.status !== 'ready') { renderState(); return; }
        renderState(); // обновит счётчик и спрячет состояние
        populateSectorMenu(); // наполнить меню секторов (один раз)
        populateRulesPanel(); // наполнить панель правил окраски (один раз)
        updateSortReset();    // показать/скрыть кнопку сброса сортировки
        updateFavBtn();       // состояние кнопки «Избранное»

        var scEl = el.querySelector('.stk-scroll');
        var bodyHtml = '';

        // фильтр поиска применяем ДО группировки/сортировки
        var visible = filterList(state.companies);
        var rank = 0; // сквозная нумерация в порядке отображения

        if (!visible.length) {
            // пустой результат — сообщение зависит от активного фильтра
            var msg;
            if (state.favOnly && !state.favorites.length) msg = 'В избранном пока пусто — добавьте акции звёздочкой ★ в строке.';
            else if (state.favOnly) msg = 'Среди избранного ничего не найдено по текущему фильтру.';
            else if (state.query.trim()) msg = 'Ничего не найдено по запросу «' + esc(state.query.trim()) + '»';
            else msg = 'Нет компаний под выбранный фильтр.';
            bodyHtml = '<tr class="stk-noresult"><td colspan="' + TOTAL_COLS + '">' + msg + '</td></tr>';
        } else if (state.mode === 'sector') {
            // группируем по сектору; группы — по алфавиту (ru); внутри — сортировка
            var groups = {};
            visible.forEach(function (co) {
                (groups[co.sector] = groups[co.sector] || []).push(co);
            });
            var sectors = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
            sectors.forEach(function (sec) {
                var list = sortList(groups[sec]);
                bodyHtml += '<tr class="stk-sector-row"><td colspan="' + TOTAL_COLS + '">'
                    + '<span class="stk-sector-inner"><span class="stk-sector-name">' + esc(sec) + '</span>'
                    + '<span class="stk-sector-count">' + list.length + '</span></span></td></tr>';
                list.forEach(function (co) { bodyHtml += renderCompanyRow(co, ++rank); });
            });
        } else {
            // общий плоский список
            var flat = sortList(visible);
            flat.forEach(function (co) { bodyHtml += renderCompanyRow(co, ++rank); });
        }

        scEl.innerHTML = '<table class="stk-table">' + renderHead() + '<tbody>' + bodyHtml + '</tbody></table>';

        // вернуть раскрытым карточкам корректную высоту (мгновенно, без анимации)
        Object.keys(state.expanded).forEach(function (tk) {
            if (!state.expanded[tk]) return;
            var acc = scEl.querySelector('.stk-card-row[data-card="' + cssEscape(tk) + '"] .stk-acc');
            if (acc) acc.style.maxHeight = acc.scrollHeight + 'px';
        });
        syncCardWidths();
    }

    // Простой escape для значения в CSS-селекторе [data-card="..."]
    function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

    // Ширина sticky-карточек = видимая ширина контейнера (чтобы карточка
    // не уезжала при горизонтальном скролле)
    function syncCardWidths() {
        var el = root(); if (!el) return;
        var sc = el.querySelector('.stk-scroll'); if (!sc) return;
        var w = sc.clientWidth - 36; // минус горизонтальные паддинги .stk-card
        el.querySelectorAll('.stk-card').forEach(function (card) {
            // карточка шириной по контенту, но не шире видимой области (иначе уедет за экран)
            card.style.maxWidth = w + 'px';
        });
    }

    // =========================================================
    //  ОБРАБОТЧИКИ
    // =========================================================
    function onClick(e) {
        var el = root(); if (!el) return;

        // повтор загрузки
        if (e.target.closest('[data-act="retry"]')) { loadData(); return; }

        // очистка поиска
        if (e.target.closest('[data-act="clear-search"]')) {
            var inp = el.querySelector('.stk-search-input');
            inp.value = ''; state.query = '';
            el.querySelector('.stk-search-clear').hidden = true;
            if (state.status === 'ready') render();
            inp.focus();
            return;
        }

        // открыть/закрыть меню секторов
        if (e.target.closest('[data-act="sec-toggle"]')) {
            var menu = el.querySelector('.stk-sec-menu');
            if (menu) menu.hidden = !menu.hidden;
            return;
        }
        // сбросить выбор секторов
        if (e.target.closest('[data-act="sec-reset"]')) {
            state.sectors = [];
            el.querySelectorAll('.stk-sec-opt input').forEach(function (c) { c.checked = false; });
            updateSecBadge();
            if (state.status === 'ready') render();
            return;
        }

        // открыть/закрыть меню правил окраски
        if (e.target.closest('[data-act="rules-toggle"]')) {
            var rmenu = el.querySelector('.stk-rules-menu');
            if (rmenu) rmenu.hidden = !rmenu.hidden;
            return;
        }
        // сбросить правила к значениям по умолчанию
        if (e.target.closest('[data-act="rules-reset"]')) {
            state.rules = DEFAULT_RULES.map(function (r) { return Object.assign({}, r); });
            el.querySelectorAll('.stk-rule-val').forEach(function (inp) {
                var rule = ruleFor(inp.getAttribute('data-rule'));
                if (rule) inp.value = rule.val;
            });
            if (state.status === 'ready') render();
            return;
        }

        // показать только избранное (тумблер в тулбаре)
        if (e.target.closest('[data-act="fav-toggle"]')) {
            state.favOnly = !state.favOnly;
            updateFavBtn();
            if (state.status === 'ready') render();
            return;
        }
        // сбросить сортировку
        if (e.target.closest('[data-act="sort-reset"]')) {
            state.sort = [];
            if (state.status === 'ready') render();
            return;
        }
        // звезда «в избранное» в строке (проверяем ДО клика по тикеру)
        var favBtn = e.target.closest('[data-act="fav"]');
        if (favBtn) { toggleFav(favBtn.getAttribute('data-ticker')); return; }

        // тумблер режима
        var tg = e.target.closest('.stk-tg-btn');
        if (tg) {
            var mode = tg.getAttribute('data-mode');
            if (mode && mode !== state.mode) {
                state.mode = mode;
                el.querySelectorAll('.stk-tg-btn').forEach(function (b) {
                    b.classList.toggle('active', b === tg);
                });
                render();
            }
            return;
        }

        // сортировка по заголовку. Обычный клик — одиночная сортировка
        // (▲ → ▼ → выкл). Shift+клик — добавить/переключить столбец в списке.
        var th = e.target.closest('th[data-sort]');
        if (th) {
            var key = th.getAttribute('data-sort');
            var type = th.getAttribute('data-type') || 'text';
            var arr = state.sort;
            var pos = -1;
            for (var si = 0; si < arr.length; si++) { if (arr[si].key === key) { pos = si; break; } }
            if (e.shiftKey) {
                // многоуровневая: нет → ▲, ▲ → ▼, ▼ → убрать уровень
                if (pos === -1) arr.push({ key: key, type: type, dir: 1 });
                else if (arr[pos].dir === 1) arr[pos].dir = -1;
                else arr.splice(pos, 1);
            } else {
                // одиночная: если это единственный активный столбец — цикл ▲/▼/выкл,
                // иначе заменяем весь список этим столбцом (▲)
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

        // раскрытие/сворачивание карточки
        var ident = e.target.closest('[data-act="toggle"]');
        if (ident) {
            toggleCard(ident.getAttribute('data-ticker'));
            return;
        }
    }

    // Анимированное раскрытие/сворачивание (max-height/opacity)
    function toggleCard(ticker) {
        if (!ticker) return;
        var el = root(); if (!el) return;
        var sc = el.querySelector('.stk-scroll');
        var open = !state.expanded[ticker];
        state.expanded[ticker] = open;

        var row = sc.querySelector('.stk-card-row[data-card="' + cssEscape(ticker) + '"]');
        var ident = sc.querySelector('.stk-ident[data-ticker="' + cssEscape(ticker) + '"]');
        if (!row) return;
        var acc = row.querySelector('.stk-acc');
        if (ident) ident.classList.toggle('open', open);

        if (open) {
            // дозаполняем содержимое карточки при первом раскрытии
            var co = findCompany(ticker);
            if (co && !acc.innerHTML.trim()) acc.innerHTML = renderCardInner(co);
            syncCardWidths();
            acc.classList.add('open');
            acc.style.maxHeight = acc.scrollHeight + 'px';
            // после анимации снимаем фикс. высоту, чтобы карточка тянулась
            window.setTimeout(function () {
                if (state.expanded[ticker]) acc.style.maxHeight = 'none';
            }, 380);
        } else {
            // фиксируем текущую высоту перед сворачиванием (для плавности)
            acc.style.maxHeight = acc.scrollHeight + 'px';
            // форсируем reflow и уезжаем в 0
            void acc.offsetHeight;
            acc.classList.remove('open');
            acc.style.maxHeight = '0px';
        }
    }

    function findCompany(ticker) {
        if (!state.companies) return null;
        for (var i = 0; i < state.companies.length; i++) {
            if (state.companies[i].ticker === ticker) return state.companies[i];
        }
        return null;
    }

    // =========================================================
    //  ИНИЦИАЛИЗАЦИЯ / ТОЧКА ВХОДА
    // =========================================================
    var built = false;
    function buildShell() {
        var el = root(); if (!el || built) return;
        el.innerHTML =
            '<div class="stk-toolbar">'
            + '  <div class="stk-title-wrap"><h2 class="stk-title">Терминал · Акции</h2>'
            + '    <span class="stk-count"></span></div>'
            + '  <div class="stk-tools">'
            + '    <label class="stk-search">'
            + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
            + '      <input class="stk-search-input" type="text" placeholder="Поиск: тикер или название" autocomplete="off" spellcheck="false">'
            + '      <button class="stk-search-clear" type="button" data-act="clear-search" aria-label="Очистить" hidden>×</button>'
            + '    </label>'
            + '    <div class="stk-secfilter">'
            + '      <button class="stk-sec-btn" type="button" data-act="sec-toggle">'
            + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>'
            + '        <span class="stk-sec-label">Секторы</span>'
            + '        <span class="stk-sec-badge" hidden></span>'
            + '        <svg class="stk-sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
            + '      </button>'
            + '      <div class="stk-sec-menu" hidden>'
            + '        <div class="stk-sec-menu-head"><span>Фильтр по секторам</span>'
            + '          <button type="button" class="stk-sec-reset" data-act="sec-reset">Сбросить</button></div>'
            + '        <div class="stk-sec-list"></div>'
            + '      </div>'
            + '    </div>'
            + '    <div class="stk-rulesfilter">'
            + '      <button class="stk-rules-btn" type="button" data-act="rules-toggle" title="Правила окраски ячеек">'
            + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>'
            + '        <span class="stk-rules-label">Правила</span>'
            + '      </button>'
            + '      <div class="stk-rules-menu" hidden>'
            + '        <div class="stk-sec-menu-head"><span>Правила окраски</span>'
            + '          <button type="button" class="stk-sec-reset" data-act="rules-reset">По умолчанию</button></div>'
            + '        <p class="stk-rules-hint">Ячейка подсвечивается <b>зелёным</b>, если условие выполнено. Значения порогов можно менять.</p>'
            + '        <div class="stk-rules-list"></div>'
            + '      </div>'
            + '    </div>'
            + '    <button class="stk-sortreset" type="button" data-act="sort-reset" hidden>'
            + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
            + '      <span>Сбросить сортировку</span>'
            + '    </button>'
            + '    <button class="stk-fav-btn" type="button" data-act="fav-toggle" title="Показать только избранное">'
            + '      ' + STAR_SVG
            + '      <span class="stk-fav-label">Избранное</span>'
            + '      <span class="stk-fav-badge" hidden></span>'
            + '    </button>'
            + '    <div class="stk-toggle" role="tablist">'
            + '      <button class="stk-tg-btn active" type="button" data-mode="sector">По секторам</button>'
            + '      <button class="stk-tg-btn" type="button" data-mode="flat">Общий список</button>'
            + '    </div>'
            + '  </div>'
            + '</div>'
            + '<div class="stk-state"></div>'
            + '<div class="stk-scroll"></div>';
        el.addEventListener('click', onClick);
        // поиск: ввод обновляет фильтр и перерисовывает (тулбар не пересоздаётся)
        var input = el.querySelector('.stk-search-input');
        var clearBtn = el.querySelector('.stk-search-clear');
        input.addEventListener('input', function () {
            state.query = input.value;
            clearBtn.hidden = !input.value;
            if (state.status === 'ready') render();
        });
        // выбор секторов (чекбоксы) — делегируем change
        el.addEventListener('change', function (e) {
            var cb = e.target.closest('.stk-sec-opt input');
            if (!cb) return;
            var sec = cb.value;
            var idx = state.sectors.indexOf(sec);
            if (cb.checked && idx === -1) state.sectors.push(sec);
            else if (!cb.checked && idx !== -1) state.sectors.splice(idx, 1);
            updateSecBadge();
            if (state.status === 'ready') render();
        });
        // изменение порога правила окраски — делегируем input
        el.addEventListener('input', function (e) {
            var inp = e.target.closest('.stk-rule-val');
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
            var sm = elr.querySelector('.stk-sec-menu');
            if (sm && !sm.hidden && !e.target.closest('.stk-secfilter')) sm.hidden = true;
            var rm = elr.querySelector('.stk-rules-menu');
            if (rm && !rm.hidden && !e.target.closest('.stk-rulesfilter')) rm.hidden = true;
        });
        built = true;
    }

    // Наполнить панель правил окраски (один раз)
    function populateRulesPanel() {
        var el = root(); if (!el) return;
        var listEl = el.querySelector('.stk-rules-list');
        if (!listEl || listEl.childElementCount) return;
        var opSym = { '>': '>', '>=': '≥', '<': '<', '==': '=' };
        listEl.innerHTML = state.rules.map(function (r) {
            var unit = (r.key === 'EPS' || r.op === '==') ? '' : '%';
            if (r.op === 'always' || r.op === '<col' || r.op === '>=col') {
                var desc = r.op === 'always' ? 'подсвечивается всегда'
                         : (r.op === '<col' ? '&lt; ' + esc(r.colLabel) : '≥ ' + esc(r.colLabel));
                return '<div class="stk-rule stk-rule-info"><span class="stk-rule-sw"></span>'
                     + '<span class="stk-rule-name">' + esc(r.label) + '</span>'
                     + '<span class="stk-rule-desc">' + desc + '</span></div>';
            }
            return '<div class="stk-rule"><span class="stk-rule-sw"></span>'
                 + '<span class="stk-rule-name">' + esc(r.label) + '</span>'
                 + '<span class="stk-rule-op">' + opSym[r.op] + '</span>'
                 + '<input class="stk-rule-val" type="number" step="any" data-rule="' + esc(r.key) + '" value="' + esc(r.val) + '">'
                 + (unit ? '<span class="stk-rule-unit">' + unit + '</span>' : '<span class="stk-rule-unit"></span>')
                 + '</div>';
        }).join('');
    }

    // Наполнить меню секторов чекбоксами (один раз, после загрузки)
    function populateSectorMenu() {
        var el = root(); if (!el) return;
        var listEl = el.querySelector('.stk-sec-list');
        if (!listEl || listEl.childElementCount || !state.companies) return;
        var set = {};
        state.companies.forEach(function (co) { set[co.sector] = (set[co.sector] || 0) + 1; });
        var sectors = Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
        listEl.innerHTML = sectors.map(function (s) {
            return '<label class="stk-sec-opt"><input type="checkbox" value="' + esc(s) + '">'
                 + '<span class="stk-sec-opt-tx">' + esc(s) + '</span>'
                 + '<span class="stk-sec-opt-n">' + set[s] + '</span></label>';
        }).join('');
    }

    // Переключить тикер в избранном (с сохранением в localStorage)
    function toggleFav(ticker) {
        if (!ticker) return;
        var idx = state.favorites.indexOf(ticker);
        if (idx === -1) state.favorites.push(ticker); else state.favorites.splice(idx, 1);
        saveFavs();
        updateFavBtn();
        // если показываем только избранное — состав строк меняется, перерисовываем
        if (state.favOnly) { if (state.status === 'ready') render(); return; }
        // иначе обновляем только звезду в текущей строке (без перерисовки)
        var el = root(); if (!el) return;
        var on = state.favorites.indexOf(ticker) !== -1;
        el.querySelectorAll('.stk-fav[data-ticker="' + cssEscape(ticker) + '"]').forEach(function (b) {
            b.classList.toggle('active', on);
            b.title = on ? 'Убрать из избранного' : 'В избранное';
        });
    }

    // Состояние кнопки «Избранное» в тулбаре (счётчик + подсветка активного режима)
    function updateFavBtn() {
        var el = root(); if (!el) return;
        var btn = el.querySelector('.stk-fav-btn');
        var badge = el.querySelector('.stk-fav-badge');
        var n = state.favorites.length;
        if (badge) { badge.hidden = n === 0; badge.textContent = n; }
        if (btn) btn.classList.toggle('active', state.favOnly);
    }

    // Показать/скрыть кнопку сброса сортировки
    function updateSortReset() {
        var el = root(); if (!el) return;
        var b = el.querySelector('.stk-sortreset');
        if (b) b.hidden = state.sort.length === 0;
    }

    // Обновить бейдж с числом выбранных секторов + подсветку кнопки
    function updateSecBadge() {
        var el = root(); if (!el) return;
        var badge = el.querySelector('.stk-sec-badge');
        var btn = el.querySelector('.stk-sec-btn');
        var n = state.sectors.length;
        if (badge) { badge.hidden = n === 0; badge.textContent = n; }
        if (btn) btn.classList.toggle('active', n > 0);
    }

    // Вызывается при входе на вкладку market-stocks
    window.renderStockTerminal = function () {
        buildShell();
        if (state.status === 'idle') { loadData(); return; }
        if (state.status === 'ready') { render(); window.setTimeout(syncCardWidths, 60); }
        else renderState();
    };

    // пересчёт ширины sticky-карточек при ресайзе окна
    window.addEventListener('resize', function () {
        if (state.status === 'ready' && document.getElementById('panel-market-stocks') &&
            document.getElementById('panel-market-stocks').classList.contains('active')) {
            syncCardWidths();
        }
    });

    // Оборачиваем глобальный switchTab — этот файл грузится последним,
    // поэтому наш wrapper внешний и срабатывает после смены панели.
    if (typeof window.switchTab === 'function') {
        var _stkPrevSwitchTab = window.switchTab;
        window.switchTab = function (tabId) {
            _stkPrevSwitchTab.apply(this, arguments);
            if (tabId === 'market-stocks') window.renderStockTerminal();
        };
    }
})();
