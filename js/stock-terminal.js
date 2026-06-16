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
    var COLS = [
        { key: 'РСБУ/МСФО',                      label: 'Учёт',           type: 'text' },
        { key: 'Текущая Цена',                   label: 'Цена',           type: 'num' },
        { key: 'EPS',                            label: 'EPS',            type: 'num' },
        { key: 'ОДХС',                           label: 'ОДХС',           type: 'num' },
        { key: 'Изменение СК',                   label: 'Изм. СК',        type: 'num' },
        { key: 'ROE',                            label: 'ROE',            type: 'num' },
        { key: 'Изменение Выручки',              label: 'Изм. Выручки',   type: 'num' },
        { key: 'Изменение Валовой прибыли',      label: 'Изм. Вал.приб.', type: 'num' },
        { key: 'Изменение Операционной прибыли', label: 'Изм. Опер.приб.',type: 'num' },
        { key: 'Изменение Чистой прибыли',       label: 'Изм. Чист.приб.',type: 'num' },
        { key: 'Денежный Поток от ОД',           label: 'ДП от ОД',       type: 'num' },
        { key: 'Процент Обязательств 2025г',     label: '% Обяз. 2025',   type: 'num' },
        { key: 'Процент Обязательств 2024г',     label: '% Обяз. 2024',   type: 'num' },
        { key: 'Сектор',                         label: 'Сектор',         type: 'text' },
        { key: 'P/BV',                           label: 'P/BV',           type: 'num' },
        { key: 'BV/кол-во акций',                label: 'BV/акц.',        type: 'num' },
        { key: 'P/E',                            label: 'P/E',            type: 'num' },
        { key: 'Маржа Валовой прибыли',          label: 'Маржа Вал.',     type: 'num' },
        { key: 'Маржа Операционной прибыли',     label: 'Маржа Опер.',    type: 'num' },
        { key: 'Маржа Чистой прибыли',           label: 'Маржа Чист.',    type: 'num' },
        { key: 'Объем выпуска, шт.',             label: 'Объём выпуска',  type: 'num' },
        { key: 'Платят дивиденды',               label: 'Дивиденды',      type: 'text' },
        { key: 'Количество в год',               label: 'Выплат/год',     type: 'num' },
        { key: 'ЭШЕЛОН',                         label: 'Эшелон',         type: 'text' },
        { key: 'ПРИВИЛЕГИРОВАННЫЕ АКЦИИ',        label: 'Преф',           type: 'text' },
        { key: 'СОСТОЯНИЕ',                      label: 'Состояние',      type: 'text' }
    ];
    var TOTAL_COLS = COLS.length + 1; // +1 — закреплённая колонка Тикер/Название

    // Столбцы основной таблицы, раскрашиваемые по знаку (зелёный/красный):
    // «Изменение *» и маржи. В карточке изм. раскрашиваются всегда.
    var HL_KEYS = {
        'Изменение СК': 1, 'Изменение Выручки': 1, 'Изменение Валовой прибыли': 1,
        'Изменение Операционной прибыли': 1, 'Изменение Чистой прибыли': 1,
        'Маржа Валовой прибыли': 1, 'Маржа Операционной прибыли': 1, 'Маржа Чистой прибыли': 1
    };

    // ---------- СОСТОЯНИЕ (в памяти, без localStorage) ----------
    var state = {
        companies: null,   // распарсенные компании (кеш на сессию)
        status: 'idle',    // idle | loading | error | empty | ready
        mode: 'sector',    // 'sector' | 'flat'
        sortKey: null,     // ключ активного столбца ('__ticker' для первой колонки)
        sortType: 'text',
        sortDir: 1,        // 1 — по возрастанию, -1 — по убыванию
        query: '',         // строка поиска по тикеру/названию
        expanded: {}       // ticker -> true (раскрытые карточки)
    };

    // =========================================================
    //  ХЕЛПЕРЫ
    // =========================================================

    // Парсинг числа из отформатированной строки. Данные могут быть в
    // US-формате (запятая — тысячи, точка — десятичная: «23,640.00») или
    // EU-формате (пробел/  — тысячи, запятая — десятичная). Возвращаем
    // NaN для пустых/«—». Используется для сортировки и знака (±).
    function parseNum(s) {
        if (s == null) return NaN;
        s = String(s).trim();
        if (!s || s === '—' || s === '-' || s === 'N/A' || s === 'n/a') return NaN;
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
        return s === '' || s === '—' || s === '-';
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
        if (!q) return list;
        return list.filter(function (co) {
            return co.ticker.toLowerCase().indexOf(q) !== -1 ||
                   (co.name || '').toLowerCase().indexOf(q) !== -1;
        });
    }

    // =========================================================
    //  СОРТИРОВКА
    // =========================================================
    function sortList(list) {
        if (!state.sortKey) return list; // без активной сортировки — исходный порядок
        var key = state.sortKey, type = state.sortType, dir = state.sortDir;
        var arr = list.slice();
        arr.sort(function (x, y) {
            var av, bv;
            if (key === '__ticker') { av = x.ticker; bv = y.ticker; }
            else { av = x.main[key]; bv = y.main[key]; }

            if (type === 'num') {
                var an = parseNum(av), bn = parseNum(bv);
                var ae = isNaN(an), be = isNaN(bn);
                if (ae && be) return 0;
                if (ae) return 1;   // пустые/«—» — всегда в конец
                if (be) return -1;
                return (an - bn) * dir;
            }
            // текст
            var ax = (av == null ? '' : String(av)).trim();
            var bx = (bv == null ? '' : String(bv)).trim();
            var aE = isEmptyVal(ax), bE = isEmptyVal(bx);
            if (aE && bE) return 0;
            if (aE) return 1;
            if (bE) return -1;
            return ax.localeCompare(bx, 'ru') * dir;
        });
        return arr;
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
            else if (state.query.trim()) {
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
    function renderHead() {
        var ths = '';
        // первая закреплённая колонка
        ths += '<th class="stk-first' + (state.sortKey === '__ticker' ? ' stk-sorted' : '')
             + '" data-sort="__ticker" data-type="text">Тикер / Название' + arrow('__ticker') + '</th>';
        for (var i = 0; i < COLS.length; i++) {
            var col = COLS[i];
            var sorted = state.sortKey === col.key ? ' stk-sorted' : '';
            ths += '<th class="' + sorted + '" data-sort="' + esc(col.key) + '" data-type="' + col.type + '">'
                 + esc(col.label) + arrow(col.key) + '</th>';
        }
        return '<thead><tr>' + ths + '</tr></thead>';
    }
    function arrow(key) {
        if (state.sortKey !== key) return '';
        return '<span class="stk-arrow">' + (state.sortDir === 1 ? '▲' : '▼') + '</span>';
    }

    // Одна строка компании + строка-аккордеон под ней
    function renderCompanyRow(co) {
        var idOpen = state.expanded[co.ticker] ? ' open' : '';
        var tds = '';
        // закреплённая ячейка Тикер/Название (кликабельная)
        tds += '<td class="stk-first">'
             + '<span class="stk-ident' + idOpen + '" data-act="toggle" data-ticker="' + esc(co.ticker) + '">'
             + '<svg class="stk-chev-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>'
             + '<span class="stk-num-badge">' + esc(co.num) + '</span>'
             + '<span class="stk-id-text"><span class="stk-tkr">' + esc(co.ticker) + '</span>'
             + '<span class="stk-name">' + esc(co.name) + '</span></span>'
             + '</span></td>';
        // остальные колонки
        for (var i = 0; i < COLS.length; i++) {
            var col = COLS[i];
            var raw = co.main[col.key];
            var empty = isEmptyVal(raw);
            var cls = col.type === 'num' ? 'stk-num' : '';
            if (empty) cls += ' stk-empty-cell';
            // подсветка по знаку для «Изменение *» и маржей
            else if (HL_KEYS[col.key]) {
                var sc = signClass(raw);
                if (sc === 'pos') cls += ' stk-pos-txt';
                else if (sc === 'neg') cls += ' stk-neg-txt';
            }
            tds += '<td class="' + cls.trim() + '">' + (empty ? '—' : esc(raw)) + '</td>';
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

    // Внутренность карточки показателей
    function renderCardInner(co) {
        var head = '<div class="stk-card-head">'
            + '<span class="stk-card-tkr">' + esc(co.ticker) + '</span>'
            + '<span class="stk-card-name">' + esc(co.name) + '</span>'
            + '<span class="stk-card-sector">' + esc(co.sector) + '</span></div>';

        if (!co.metrics.length || !co.years.length) {
            return '<div class="stk-card"><div class="stk-card-inner">' + head
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
            body += '<tr class="stk-m-row"><td class="stk-m-label">' + esc(met.label) + '</td>';
            for (var v = 0; v < co.years.length; v++) {
                var val = met.values[v];
                body += '<td class="stk-m-val">' + (isEmptyVal(val) ? '—' : esc(val)) + '</td>';
            }
            body += '</tr>';
            if (met.changes) {
                body += '<tr class="stk-m-chg"><td class="stk-m-clabel">↳ изм.</td>';
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

        return '<div class="stk-card"><div class="stk-card-inner">' + head
             + '<div class="stk-card-tablewrap"><table class="stk-mini">'
             + '<thead>' + thead + '</thead><tbody>' + body + '</tbody></table></div></div></div>';
    }

    // Класс знака для подсветки изменений
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

        var scEl = el.querySelector('.stk-scroll');
        var bodyHtml = '';

        // фильтр поиска применяем ДО группировки/сортировки
        var visible = filterList(state.companies);

        if (!visible.length) {
            // ничего не найдено по запросу
            bodyHtml = '<tr class="stk-noresult"><td colspan="' + TOTAL_COLS + '">'
                + 'Ничего не найдено по запросу «' + esc(state.query.trim()) + '»</td></tr>';
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
                list.forEach(function (co) { bodyHtml += renderCompanyRow(co); });
            });
        } else {
            // общий плоский список
            var flat = sortList(visible);
            flat.forEach(function (co) { bodyHtml += renderCompanyRow(co); });
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
            card.style.width = w + 'px';
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

        // сортировка по заголовку
        var th = e.target.closest('th[data-sort]');
        if (th) {
            var key = th.getAttribute('data-sort');
            var type = th.getAttribute('data-type') || 'text';
            if (state.sortKey === key) state.sortDir = -state.sortDir; // повтор → реверс
            else { state.sortKey = key; state.sortType = type; state.sortDir = 1; }
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
        built = true;
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
