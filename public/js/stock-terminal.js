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

    // Год для столбцов «% Обязательств» обновляется в начале мая каждого года:
    // до мая показываем позапрошлый год, с мая — прошлый (годовые отчёты к этому
    // времени уже опубликованы). Пример: май 2026 → 2025 и 2024; май 2027 → 2026 и 2025.
    // Ключи строим динамически, чтобы они совпадали с заголовками CSV, когда
    // владелец таблицы добавит колонки нового года.
    function obligationYears() {
        var d = new Date(), y = d.getFullYear();
        var primary = d.getMonth() >= 4 ? y - 1 : y - 2; // getMonth(): май = 4
        return { primary: primary, secondary: primary - 1 };
    }
    var OBL = obligationYears();
    var OBL_KEY_1 = 'Процент Обязательств ' + OBL.primary + 'г';
    var OBL_KEY_2 = 'Процент Обязательств ' + OBL.secondary + 'г';
    // \n — принудительный перенос строки в заголовке (CSS: white-space: pre-line на
    // .stk-th), чтобы «Обязательства» всегда оставалось целым словом на своей строке,
    // а год/% — на следующей, независимо от того, влезает ли вся фраза в одну строку.
    var OBL_LBL_1 = 'Обязательства\n' + OBL.primary + ', %';
    var OBL_LBL_2 = 'Обязательства\n' + OBL.secondary + ', %';

    // Столбцы основной таблицы (key — точное имя заголовка из CSV).
    // type: 'num' — сортировка по распарсенному числу; 'text' — по строке (ru).
    // align: 'right' по умолчанию у числовых столбцов (моноширинные цифры выравниваются
    // по разряду, так легче сравнивать величины сверху вниз), 'center' — у текстовых и у
    // отдельных числовых, где сравнение по разряду не важно (напр. «Выплат в год»).
    // pin: true — столбец «едет» вместе с закреплённым Тикером при горизонтальном
    // скролле (см. stk-pin-N в renderHead/renderCompanyRow и syncPinOffsets).
    // Сейчас закреплённых столбцов нет (Цена/ОДХС отвязаны по просьбе — при
    // горизонтальном скролле закреплён только Тикер/Название); механика pin
    // оставлена на случай возврата.
    // tip — краткое пояснение столбца (показывается тултипом при наведении на заголовок)
    var COLS = [
        { key: 'Текущая Цена',                   label: 'Цена',           type: 'num',  align: 'right',  tip: 'Текущая рыночная цена одной акции' },
        { key: 'ОДХС',                           label: 'ОДХС',           type: 'num',  align: 'right',  tip: 'Доходность для инвестирования в акции, %' },
        { key: 'РСБУ/МСФО',                      label: 'Учёт',           type: 'text', align: 'center', tip: 'Стандарт отчётности компании: РСБУ или МСФО' },
        { key: 'EPS',                            label: 'EPS',            type: 'num',  align: 'right',  tip: 'Прибыль на акцию (Earnings Per Share)' },
        { key: 'Изменение СК',                   label: 'Капитал',        type: 'num',  align: 'right',  tip: 'Изменение собственного капитала за период, %' },
        { key: 'ROE',                            label: 'ROE',            type: 'num',  align: 'right',  tip: 'Рентабельность собственного капитала (ROE), %' },
        { key: 'Изменение Выручки',              label: 'Выручка',        type: 'num',  align: 'right',  tip: 'Изменение выручки за период, %' },
        { key: 'Изменение Валовой прибыли',      label: 'Валовая прибыль',type: 'num',  align: 'right',  tip: 'Изменение валовой прибыли за период, %' },
        { key: 'Изменение Операционной прибыли', label: 'Операционная прибыль', type: 'num', align: 'right', tip: 'Изменение операционной прибыли за период, %' },
        { key: 'Изменение Чистой прибыли',       label: 'Чистая прибыль', type: 'num',  align: 'right',  tip: 'Изменение чистой прибыли за период, %' },
        { key: 'Денежный Поток от ОД',           label: 'Денежный поток',  type: 'num',  align: 'right',  tip: 'Денежный поток от операционной деятельности (1 — положительный)' },
        { key: OBL_KEY_1,                        label: OBL_LBL_1,        type: 'num',  align: 'right',  tip: 'Доля обязательств в активах за ' + OBL.primary + ' год, %' },
        { key: OBL_KEY_2,                        label: OBL_LBL_2,        type: 'num',  align: 'right',  tip: 'Доля обязательств в активах за ' + OBL.secondary + ' год, %' },
        { key: 'Сектор',                         label: 'Сектор',         type: 'text', align: 'center', tip: 'Отрасль / сектор экономики компании' },
        { key: 'P/BV',                           label: 'P/BV',           type: 'num',  align: 'right',  tip: 'Цена к балансовой стоимости (Price / Book Value)' },
        { key: 'BV/кол-во акций',                label: 'BV на акцию',    type: 'num',  align: 'right',  tip: 'Балансовая стоимость на одну акцию' },
        { key: 'P/E',                            label: 'P/E',            type: 'num',  align: 'right',  tip: 'Цена к прибыли (Price / Earnings)' },
        { key: 'Маржа Валовой прибыли',          label: 'Валовая маржа',  type: 'num',  align: 'right',  tip: 'Маржа валовой прибыли, %' },
        { key: 'Маржа Операционной прибыли',     label: 'Операционная маржа', type: 'num', align: 'right', tip: 'Маржа операционной прибыли, %' },
        { key: 'Маржа Чистой прибыли',           label: 'Чистая маржа',   type: 'num',  align: 'right',  tip: 'Маржа чистой прибыли, %' },
        { key: 'Объем выпуска, шт.',             label: 'Объём выпуска',  type: 'num',  align: 'right',  tip: 'Общее количество выпущенных акций, шт.' },
        { key: 'Платят дивиденды',               label: 'Дивиденды',      type: 'text', align: 'center', tip: 'Платит ли компания дивиденды' },
        { key: 'Количество в год',               label: 'Выплат в год',   type: 'num',  align: 'center', tip: 'Количество дивидендных выплат в год' },
        { key: 'ЭШЕЛОН',                         label: 'Эшелон',         type: 'text', align: 'center', tip: 'Эшелон ликвидности акции (1 — голубые фишки)' },
        { key: 'ПРИВИЛЕГИРОВАННЫЕ АКЦИИ',        label: 'Привилегированные акции', type: 'text', align: 'center', tip: 'Наличие привилегированных акций у компании' },
        { key: 'СОСТОЯНИЕ',                      label: 'Состояние',      type: 'text', align: 'center', tip: 'Текущее состояние / статус компании' }
    ];

    // Звезда «в избранное» (заливка управляется классом .active через CSS)
    var STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg>';

    // Иконка «открыть боковую карточку компании» (новости + дивиденды).
    // Не ₽ — это полная карточка о компании; рисуем «панель сбоку».
    var CARD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M14 4v16"/><path d="M17 9h1M17 13h1"/></svg>';

    // Видимые столбцы (с учётом скрытых пользователем) и общее число колонок
    // (включая закреплённую Тикер/Название) — для colspan секций и аккордеона.
    function visibleCols() {
        if (!state.hiddenCols.length) return COLS;
        return COLS.filter(function (c) { return state.hiddenCols.indexOf(c.key) === -1; });
    }
    function totalCols() { return visibleCols().length + 1; }
    // Сколько первых видимых столбцов реально закреплены (Цена/ОДХС — см. pin в COLS).
    // Пользователь может скрыть один из них панелью видимости столбцов — тогда
    // закреплённая группа короче (или пуста), это должно отражаться и в разметке.
    function pinnedLead(cols) {
        var n = 0;
        while (n < cols.length && cols[n].pin) n++;
        return n;
    }

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
        { key: OBL_KEY_1,                        label: OBL_LBL_1,        op: '<col', col: OBL_KEY_2, colLabel: OBL_LBL_2 },
        { key: OBL_KEY_2,                        label: OBL_LBL_2,        op: 'always' },
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
        hiddenCols: [],    // ключи скрытых столбцов (сбрасывается кнопкой «Сбросить сортировку»)
        expanded: {},      // ticker -> true (раскрытые карточки)
        filters: {},       // key -> { op, val, on } — фильтры по параметрам (напр. ROE > 20)
        pinnedRows: {}     // ticker -> true (строка выделена кликом)
    };

    // Активные фильтры по параметрам: включён чекбокс и введён порог
    function activeFilters() {
        var out = [];
        Object.keys(state.filters).forEach(function (key) {
            var f = state.filters[key];
            if (f && f.on && f.val !== '' && f.val != null && isFinite(f.val)) {
                out.push({ key: key, op: f.op || '>', val: +f.val });
            }
        });
        return out;
    }

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

    // Пусто, если строка пустая, это «N/A», ошибка формулы ИЛИ состоит только из
    // прочерков/дефисов (в т.ч. «----» — приводим к единому «—» при показе).
    function isEmptyVal(s) {
        s = (s == null ? '' : String(s)).trim();
        return s === '' || /^[-–—‒]+$/.test(s) || s === 'N/A' || s.toLowerCase() === 'n/a' || isErr(s);
    }

    // Сокращённая запись больших чисел для карточек: 1 000 → «1 тыс.»,
    // 1 500 000 → «1,5 млн», 2 000 000 000 → «2 млрд». Возвращает null, если
    // значение не число, меньше 1000 по модулю или содержит «%» (проценты не
    // сокращаем — они и так компактны). Знак сохраняем.
    var ABBR_UNITS = [
        { v: 1e12, s: ' трлн' },
        { v: 1e9,  s: ' млрд' },
        { v: 1e6,  s: ' млн'  },
        { v: 1e3,  s: ' тыс.' }
    ];
    function abbrevNum(raw) {
        var s = String(raw == null ? '' : raw).trim();
        if (s.indexOf('%') !== -1) return null; // проценты не сокращаем
        var n = parseNum(s);
        if (isNaN(n)) return null;
        var abs = Math.abs(n);
        if (abs < 1000) return null;            // мелкие числа оставляем как есть
        for (var i = 0; i < ABBR_UNITS.length; i++) {
            if (abs >= ABBR_UNITS[i].v) {
                var x = n / ABBR_UNITS[i].v;
                var r = Math.round(x * 10) / 10; // один знак после запятой
                var num = (r % 1 === 0) ? String(r) : String(r).replace('.', ',');
                return num + ABBR_UNITS[i].s;
            }
        }
        return null;
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
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

    // Порог правила «ОДХС» берём прямо из таблицы — ячейка AE2 (столбец
    // «Доходность для Инвестирования в Акции», хранится в процентах, напр. «26%»).
    // Так порог редактируется в самой Google-таблице, а не хардкодом в коде.
    var ODHS_CELL = { row: 1, col: 30 }; // AE2 → строка 2, столбец AE (0-индексы)
    function applyOdhsThreshold(rows) {
        var raw = (rows && rows[ODHS_CELL.row]) ? rows[ODHS_CELL.row][ODHS_CELL.col] : null;
        var n = parseNum(raw); // parseNum срезает «%» → число
        if (isNaN(n)) return;
        // обновляем и текущее правило, и дефолт — чтобы «По умолчанию» тоже брал из таблицы
        DEFAULT_RULES.forEach(function (r) { if (r.key === 'ОДХС') r.val = n; });
        var rule = ruleFor('ОДХС'); if (rule) rule.val = n;
        var el = root();
        if (el) { var inp = el.querySelector('.stk-rule-val[data-rule="ОДХС"]'); if (inp) inp.value = n; }
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
                applyOdhsThreshold(rows); // порог ОДХС из ячейки AE2 таблицы
                state.companies = companies;
                state.status = companies.length ? 'ready' : 'empty';
                render();
                if (typeof window.onStkCompaniesLoaded === 'function') { try { window.onStkCompaniesLoaded(); } catch (e) {} }
            })
            .catch(function (err) {
                console.warn('[stock-terminal] ошибка загрузки:', err);
                state.status = 'error';
                renderState();
            });
    }

    // Подтянуть таблицу акций в фоне (нужно дашборду для колонки ОДХС в избранном)
    window.stkEnsureLoaded = function () {
        if (state.companies && state.companies.length) {
            if (typeof window.onStkCompaniesLoaded === 'function') { try { window.onStkCompaniesLoaded(); } catch (e) {} }
            return;
        }
        if (state.status !== 'loading') loadData();
    };

    // Автозагрузка таблицы при старте приложения — независимо от того,
    // заходил ли пользователь на вкладку «Акции» (нужно для потенциала в избранном).
    setTimeout(function () { if (state.status === 'idle' && (!state.companies || !state.companies.length)) loadData(); }, 600);

    // =========================================================
    //  ФИЛЬТР (поиск по тикеру/названию)
    // =========================================================
    function filterList(list) {
        var q = state.query.trim().toLowerCase();
        var secs = state.sectors;
        var favOnly = state.favOnly;
        var flt = activeFilters();
        if (!q && !secs.length && !favOnly && !flt.length) return list;
        return list.filter(function (co) {
            if (favOnly && state.favorites.indexOf(co.ticker) === -1) return false;
            if (secs.length && secs.indexOf(co.sector) === -1) return false;
            if (q && co.ticker.toLowerCase().indexOf(q) === -1 &&
                     (co.name || '').toLowerCase().indexOf(q) === -1) return false;
            // фильтры по параметрам: должны выполниться ВСЕ условия;
            // пустые значения («—») не проходят числовой фильтр
            for (var i = 0; i < flt.length; i++) {
                var f = flt[i];
                var v = parseNum(co.main[f.key]);
                if (isNaN(v)) return false;
                var ok;
                switch (f.op) {
                    case '>':  ok = v > f.val; break;
                    case '>=': ok = v >= f.val; break;
                    case '<':  ok = v < f.val; break;
                    case '<=': ok = v <= f.val; break;
                    default:   ok = v === f.val;
                }
                if (!ok) return false;
            }
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
            if (!state.companies) { cntEl.innerHTML = ''; }
            else if (state.query.trim() || state.sectors.length || state.favOnly || activeFilters().length) {
                var f = filterList(state.companies).length;
                cntEl.innerHTML = 'найдено <b class="stk-count-n">' + f + '</b> из <b class="stk-count-n">' + state.companies.length + '</b>';
            } else {
                var nc = state.companies.length;
                cntEl.innerHTML = '<b class="stk-count-n">' + nc + '</b> ' + plural(nc, 'компания', 'компании', 'компаний');
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
             + '" data-sort="__ticker" data-type="text" title="' + esc('Биржевой тикер и название компании') + '\n' + esc(SORT_HINT) + '">Тикер / Название' + arrow('__ticker') + '</th>';
        var cols = visibleCols();
        var pinN = pinnedLead(cols);
        for (var i = 0; i < cols.length; i++) {
            var col = cols[i];
            var cls = ['stk-th'];
            if (col.align === 'center') cls.push('stk-col-center'); // числа — по правому краю (разряды совпадают), текст — по центру
            if (i < pinN) cls.push('stk-pin-' + (i + 1));   // едет вместе с Тикером при горизонтальном скролле
            if (sortInfo(col.key)) cls.push('stk-sorted');
            // тултип: пояснение столбца + подсказка про сортировку (на отдельной строке)
            var tip = col.tip ? esc(col.tip) + '\n' + esc(SORT_HINT) : esc(SORT_HINT);
            ths += '<th class="' + cls.join(' ') + '" data-sort="' + esc(col.key) + '" data-type="' + col.type + '" title="' + tip + '">'
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
        var ech = parseInt(co.main['ЭШЕЛОН'], 10);
        var tds = '';
        var cols = visibleCols();
        var pinN = pinnedLead(cols);
        // закреплённая ячейка Тикер/Название: слева — раскрытие аккордеона показателей,
        // справа — кластер действий: кнопка боковой карточки компании + звезда «в избранное».
        // stk-edge (граница закреплённого блока) — тут, только если Цена/ОДХС оба скрыты.
        tds += '<td class="stk-first' + (pinN === 0 ? ' stk-edge' : '') + '"><div class="stk-first-cell">'
             + '<span class="stk-ident' + idOpen + '" data-act="toggle" data-ticker="' + esc(co.ticker) + '" title="Развернуть показатели по годам">'
             + '<span class="stk-chev-btn" aria-hidden="true"><svg class="stk-chev-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>'
             + '<span class="stk-num-badge">' + esc(rank) + '</span>'
             + '<span class="stk-id-text"><span class="stk-tkr">' + esc(co.ticker) + '</span>'
             + '<span class="stk-name">' + esc(co.name) + '</span></span>'
             + '</span>'
             + '<span class="stk-first-actions">'
             + '<button class="stk-cardbtn" type="button" data-act="card" data-ticker="' + esc(co.ticker) + '" data-echelon="' + (isFinite(ech) ? ech : 1) + '" title="Карточка компании: новости и дивиденды" aria-label="Карточка компании">' + CARD_SVG + '</button>'
             + '<button class="stk-fav' + (isFav ? ' active' : '') + '" type="button" data-act="fav" data-ticker="' + esc(co.ticker) + '" title="' + (isFav ? 'Убрать из избранного' : 'В избранное') + '" aria-label="Избранное">' + STAR_SVG + '</button>'
             + '</span>'
             + '</div></td>';
        // остальные колонки (только видимые) — числа по правому краю, текст по центру
        for (var i = 0; i < cols.length; i++) {
            var col = cols[i];
            var raw = co.main[col.key];
            var empty = isEmptyVal(raw);
            var cls = col.align === 'center' ? 'stk-col-center' : '';
            if (i < pinN) cls += (cls ? ' ' : '') + 'stk-pin-' + (i + 1) + (i === pinN - 1 ? ' stk-edge' : '');
            if (col.type === 'num') {
                cls += ' stk-num';
                // проценты красим по знаку: плюс — зелёным, минус — красным;
                // обычные (непроцентные) числа — красным только при отрицательном значении
                var nv = parseNum(raw);
                var isPct = String(raw).indexOf('%') !== -1;
                if (!isNaN(nv)) {
                    if (nv < 0) cls += ' stk-neg-val';
                    else if (isPct && nv > 0) cls += ' stk-pos-val';
                }
            }
            if (empty) cls += ' stk-empty-cell';
            // условная подсветка ячейки (цвет сайдбара) по правилам isHighlightCell
            else if (isHighlightCell(col.key, co)) cls += ' stk-hl';
            tds += '<td class="' + cls.trim() + '">' + displayCell(col.key, raw) + '</td>';
        }
        var rowHtml = '<tr class="stk-row' + (state.pinnedRows[co.ticker] ? ' stk-row-pin' : '') + '" data-ticker="' + esc(co.ticker) + '">' + tds + '</tr>';
        // аккордеон-строка (рендерим содержимое только если раскрыта — иначе лёгкая заглушка)
        var open = !!state.expanded[co.ticker];
        var accInner = open ? renderCardInner(co) : '';
        var accHtml = '<tr class="stk-card-row" data-card="' + esc(co.ticker) + '">'
            + '<td colspan="' + totalCols() + '"><div class="stk-acc' + (open ? ' open' : '') + '">'
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
                var cell;
                if (isEmptyVal(val)) {
                    cell = '<span class="stk-m-dash">—</span>';
                } else {
                    var ab = abbrevNum(val);
                    // сокращённую запись показываем с тултипом полного значения
                    cell = ab ? '<span title="' + esc(val) + '">' + esc(ab) + '</span>' : esc(val);
                }
                body += '<td class="stk-m-val">' + cell + '</td>';
            }
            body += '</tr>';
            if (hasChg) {
                body += '<tr class="stk-m-chg ' + grp + '"><td class="stk-m-clabel">↳ изм.</td>';
                for (var ch = 0; ch < co.years.length; ch++) {
                    var cv = met.changes[ch];
                    var sign = signClass(cv);
                    var pill;
                    if (isEmptyVal(cv)) {
                        pill = '<span class="stk-chg-pill">—</span>';
                    } else {
                        var cab = abbrevNum(cv); // проценты не трогаем (abbrevNum вернёт null)
                        pill = cab ? '<span class="stk-chg-pill" title="' + esc(cv) + '">' + esc(cab) + '</span>'
                                   : '<span class="stk-chg-pill">' + esc(cv) + '</span>';
                    }
                    body += '<td class="stk-chg ' + sign + '">' + pill + '</td>';
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
        if (!rule || rule.off) return false; // off — выделение по этому столбцу выключено
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
        populateColsPanel();  // наполнить меню видимости столбцов (один раз)
        populateFltPanel();   // наполнить меню фильтров по параметрам (один раз)
        updateSortReset();    // показать/скрыть кнопку сброса сортировки
        updateFavBtn();       // состояние кнопки «Избранное»

        var scEl = el.querySelector('.stk-scroll');
        // Shell ещё не построен (автозагрузка завершилась раньше захода на вкладку):
        // ничего не рендерим — статус остаётся 'ready', и renderStockTerminal
        // при входе на вкладку построит shell и вызовет render() повторно.
        if (!scEl) return;
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
            bodyHtml = '<tr class="stk-noresult"><td colspan="' + totalCols() + '">' + msg + '</td></tr>';
        } else if (state.mode === 'sector') {
            // группируем по сектору; группы — по алфавиту (ru); внутри — сортировка
            var groups = {};
            visible.forEach(function (co) {
                (groups[co.sector] = groups[co.sector] || []).push(co);
            });
            var sectors = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
            sectors.forEach(function (sec) {
                var list = sortList(groups[sec]);
                bodyHtml += '<tr class="stk-sector-row"><td colspan="' + totalCols() + '">'
                    + '<span class="stk-sector-inner"><span class="stk-sector-name">' + esc(sec) + '</span>'
                    + '<span class="stk-sector-count"><b>' + list.length + '</b> '
                    + plural(list.length, 'компания', 'компании', 'компаний') + '</span></span></td></tr>';
                list.forEach(function (co) { bodyHtml += renderCompanyRow(co, ++rank); });
            });
        } else {
            // общий плоский список
            var flat = sortList(visible);
            flat.forEach(function (co) { bodyHtml += renderCompanyRow(co, ++rank); });
        }

        scEl.innerHTML = '<table class="stk-table">' + renderHead() + '<tbody>' + bodyHtml + '</tbody></table>';

        // вернуть раскрытым карточкам корректную высоту (мгновенно, без анимации).
        // overflow:visible — обязательное условие работы position:sticky карточки:
        // предок с overflow:hidden «съедает» sticky, и карточка уезжала бы при
        // горизонтальном скролле (юзер листает вправо, раскрывает — и ничего не видит)
        Object.keys(state.expanded).forEach(function (tk) {
            if (!state.expanded[tk]) return;
            var acc = scEl.querySelector('.stk-card-row[data-card="' + cssEscape(tk) + '"] .stk-acc');
            if (acc) { acc.style.maxHeight = 'none'; acc.style.overflow = 'visible'; }
        });
        syncCardWidths();
        syncPinOffsets();
    }

    // Простой escape для значения в CSS-селекторе [data-card="..."]
    function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

    // =========================================================
    //  ВЫГРУЗКА В EXCEL (CSV, ; как разделитель — русская локаль)
    //  Выгружается текущий срез: фильтры/поиск/сортировка/видимые столбцы.
    // =========================================================
    function csvCell(v) {
        var s = String(v == null ? '' : v).replace(/\n/g, ' ');
        // Excel исполняет ячейки, начинающиеся с = + @ (формульная инъекция) —
        // гасим апострофом; отрицательные числа («-12,3») не трогаем
        if (/^[=+@\t\r]/.test(s) || (s[0] === '-' && !/^-[\d\s.,]+%?$/.test(s))) s = "'" + s;
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function downloadCsv(name, lines) {
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }
    function exportCsv() {
        if (state.status !== 'ready' || !state.companies) return;
        var cols = visibleCols();
        var head = ['Тикер', 'Название'].concat(cols.map(function (c) { return c.label.replace(/\n/g, ' '); }));
        var lines = [head.map(csvCell).join(';')];
        var pushRow = function (co) {
            var row = [co.ticker, co.name].concat(cols.map(function (c) {
                var raw = co.main[c.key];
                return isEmptyVal(raw) ? '' : String(raw);
            }));
            lines.push(row.map(csvCell).join(';'));
        };
        var visible = filterList(state.companies);
        if (state.mode === 'sector') {
            var groups = {};
            visible.forEach(function (co) { (groups[co.sector] = groups[co.sector] || []).push(co); });
            Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'ru'); }).forEach(function (sec) {
                sortList(groups[sec]).forEach(pushRow);
            });
        } else {
            sortList(visible).forEach(pushRow);
        }
        var d = new Date();
        var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        downloadCsv('terminal-akcii-' + stamp + '.csv', lines);
    }

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

    // Смещение слева для закреплённых Цена/ОДХС (см. pin в COLS). Ширина колонки
    // Тикер/Название зависит от данных (авто) — фиксировать left в CSS нельзя,
    // поэтому меряем реальные ширины после каждой отрисовки и кладём в CSS-переменные,
    // которые читает .stk-pin-1/.stk-pin-2 (left: var(--stk-pin1-left) и т.п.).
    function syncPinOffsets() {
        var el = root(); if (!el) return;
        var table = el.querySelector('.stk-table'); if (!table) return;
        var firstTh = table.querySelector('thead th.stk-first'); if (!firstTh) return;
        var left1 = firstTh.offsetWidth;
        table.style.setProperty('--stk-pin1-left', left1 + 'px');
        var pin1Th = table.querySelector('thead th.stk-pin-1');
        var left2 = left1 + (pin1Th ? pin1Th.offsetWidth : 0);
        table.style.setProperty('--stk-pin2-left', left2 + 'px');
    }

    // =========================================================
    //  ОБРАБОТЧИКИ
    // =========================================================
    function onClick(e) {
        var el = root(); if (!el) return;

        // переключатель класса активов (объединённая вкладка Акции/Облигации)
        var assetBtn = e.target.closest('.mt-asset-btn');
        if (assetBtn) {
            if (typeof window.mtShowTerminal === 'function') window.mtShowTerminal(assetBtn.getAttribute('data-asset'));
            return;
        }

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
        // выключить/включить выделение по одному правилу (клик по квадратику-свотчу)
        var swBtn = e.target.closest('[data-act="rule-toggle"]');
        if (swBtn) {
            var rk = swBtn.getAttribute('data-rule');
            var rl = ruleFor(rk);
            if (rl) {
                rl.off = !rl.off;
                swBtn.setAttribute('aria-pressed', rl.off ? 'false' : 'true');
                var row = el.querySelector('.stk-rule[data-rule-row="' + cssEscape(rk) + '"]');
                if (row) row.classList.toggle('is-off', !!rl.off);
                if (state.status === 'ready') render();
            }
            return;
        }
        // снять все выделения (выключить все правила)
        if (e.target.closest('[data-act="rules-clear"]')) {
            state.rules.forEach(function (r) { r.off = true; });
            el.querySelectorAll('.stk-rule').forEach(function (row) { row.classList.add('is-off'); });
            el.querySelectorAll('.stk-rule-sw').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
            if (state.status === 'ready') render();
            return;
        }
        // сбросить правила к значениям по умолчанию
        if (e.target.closest('[data-act="rules-reset"]')) {
            state.rules = DEFAULT_RULES.map(function (r) { return Object.assign({}, r); });
            el.querySelectorAll('.stk-rule-val').forEach(function (inp) {
                var rule = ruleFor(inp.getAttribute('data-rule'));
                if (rule) inp.value = rule.val;
            });
            el.querySelectorAll('.stk-rule').forEach(function (row) { row.classList.remove('is-off'); });
            el.querySelectorAll('.stk-rule-sw').forEach(function (b) { b.setAttribute('aria-pressed', 'true'); });
            if (state.status === 'ready') render();
            return;
        }

        // открыть/закрыть меню фильтров по параметрам
        if (e.target.closest('[data-act="flt-toggle"]')) {
            var fmenu = el.querySelector('.stk-flt-menu');
            if (fmenu) fmenu.hidden = !fmenu.hidden;
            return;
        }
        // сбросить все фильтры по параметрам
        if (e.target.closest('[data-act="flt-reset"]')) {
            state.filters = {};
            el.querySelectorAll('.stk-flt-row .stk-flt-on').forEach(function (c) { c.checked = false; });
            el.querySelectorAll('.stk-flt-row .stk-flt-val').forEach(function (i) { i.value = ''; });
            updateFltBadge();
            if (state.status === 'ready') render();
            return;
        }

        // открыть/закрыть меню видимости столбцов
        if (e.target.closest('[data-act="cols-toggle"]')) {
            var cmenu = el.querySelector('.stk-cols-menu');
            if (cmenu) cmenu.hidden = !cmenu.hidden;
            return;
        }
        // показать все столбцы (сброс скрытия — только столбцы)
        if (e.target.closest('[data-act="cols-reset"]')) {
            state.hiddenCols = [];
            el.querySelectorAll('.stk-col-opt input').forEach(function (c) { c.checked = true; });
            updateColsBadge();
            updateSortReset();
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
        // сбросить сортировку + восстановить скрытые столбцы
        if (e.target.closest('[data-act="sort-reset"]')) {
            state.sort = [];
            state.hiddenCols = [];
            el.querySelectorAll('.stk-col-opt input').forEach(function (c) { c.checked = true; });
            updateColsBadge();
            if (state.status === 'ready') render();
            return;
        }
        // открыть боковую карточку компании (новости + дивиденды) — общий drawer из ребаланса
        var cardBtn = e.target.closest('[data-act="card"]');
        if (cardBtn) { openCompanyCard(cardBtn.getAttribute('data-ticker'), cardBtn.getAttribute('data-echelon')); return; }
        // звезда «в избранное» в строке (проверяем ДО клика по тикеру)
        var favBtn = e.target.closest('[data-act="fav"]');
        if (favBtn) { toggleFav(favBtn.getAttribute('data-ticker')); return; }

        // тумблер режима «По секторам/Общий список». ВАЖНО: подсветку active меняем
        // только у кнопок с data-mode — рядом стоит сегмент класса активов из тех же
        // .stk-tg-btn, и общий селектор снимал active с «Акции/Облигации» (сбрасывал его)
        var tg = e.target.closest('.stk-tg-btn');
        if (tg) {
            var mode = tg.getAttribute('data-mode');
            if (mode && mode !== state.mode) {
                state.mode = mode;
                el.querySelectorAll('.stk-tg-btn[data-mode]').forEach(function (b) {
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

        // клик по «пустому» месту строки — закрепить/снять выделение строки
        var rowEl = e.target.closest('tr.stk-row');
        if (rowEl && !e.target.closest('button') && !e.target.closest('[data-act]')) {
            var rtk = rowEl.getAttribute('data-ticker');
            state.pinnedRows[rtk] = !state.pinnedRows[rtk];
            rowEl.classList.toggle('stk-row-pin', !!state.pinnedRows[rtk]);
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
            // после анимации снимаем фикс. высоту и клиппинг: overflow:hidden у
            // предка ломает position:sticky карточки при горизонтальном скролле
            window.setTimeout(function () {
                if (state.expanded[ticker]) { acc.style.maxHeight = 'none'; acc.style.overflow = 'visible'; }
            }, 380);
        } else {
            // фиксируем текущую высоту перед сворачиванием (для плавности)
            acc.style.overflow = '';
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

    // Открыть боковую карточку компании (новости + дивиденды + описание).
    // Переиспользуем общий drawer #stockDetailCard из вкладки «Ребаланс»
    // (функция openStockDetail глобальна; имя/сектор подтягиваются из
    // echelonTableData, а при отсутствии — из терминала через stkFindCompany).
    function openCompanyCard(ticker, echelon) {
        if (!ticker) return;
        // drawer создаётся при рендере ребаланса; если на «Акции» зашли первыми — создаём пустой
        if (!document.getElementById('stockDetailCard')) {
            var c = document.createElement('div');
            c.className = 'stock-detail-card';
            c.id = 'stockDetailCard';
            document.body.appendChild(c);
        }
        var ech = parseInt(echelon, 10);
        if (typeof window.openStockDetail === 'function') {
            window.openStockDetail(ticker, isFinite(ech) ? ech : 1);
        }
    }

    // =========================================================
    //  ИНИЦИАЛИЗАЦИЯ / ТОЧКА ВХОДА
    // =========================================================
    var built = false;
    function buildShell() {
        var el = root(); if (!el || built) return;
        el.innerHTML =
            // заголовок «Терминал · Акции» убран — раздел уже читается по хлебной крошке
            // в шапке сайта. Слева направо: переключатель Акции/Облигации (объединённая
            // вкладка), режим «По секторам/Общий список» (по просьбе — слева), счётчик.
            '<div class="stk-toolbar">'
            + '  <div class="stk-lead">'
            // сегмент класса активов — ГЛАВНЫЙ переключатель: с иконками и тёмной
            // активной плашкой (.mt-asset в CSS), чтобы не путался с тумблером режима
            + '    <div class="stk-toggle mt-asset" role="tablist" aria-label="Класс активов">'
            + '      <button class="stk-tg-btn mt-asset-btn active" type="button" data-asset="stocks">'
            + '        <span class="mt-asset-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></span>Акции</button>'
            + '      <button class="stk-tg-btn mt-asset-btn" type="button" data-asset="bonds">'
            + '        <span class="mt-asset-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg></span>Облигации</button>'
            + '    </div>'
            + '    <div class="stk-toggle stk-mode" role="tablist">'
            + '      <button class="stk-tg-btn active" type="button" data-mode="sector">По секторам</button>'
            + '      <button class="stk-tg-btn" type="button" data-mode="flat">Общий список</button>'
            + '    </div>'
            + '    <span class="stk-count"></span>'
            + '  </div>'
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
            + '          <span class="stk-rules-head-acts"><button type="button" class="stk-sec-reset" data-act="rules-clear">Снять все</button>'
            + '          <button type="button" class="stk-sec-reset" data-act="rules-reset">По умолчанию</button></span></div>'
            + '        <p class="stk-rules-hint">Ячейка подсвечивается <b>зелёным</b>, если условие выполнено. Клик по <b>квадратику</b> слева — выключить выделение, значения порогов можно менять.</p>'
            + '        <div class="stk-rules-list"></div>'
            + '      </div>'
            + '    </div>'
            + '    <div class="stk-fltfilter">'
            + '      <button class="stk-flt-btn" type="button" data-act="flt-toggle" title="Фильтры по параметрам: показать только компании с нужными значениями">'
            + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6.5 7.6V19l-3-1.6v-4.8z"/></svg>'
            + '        <span class="stk-flt-label">Фильтры</span>'
            + '        <span class="stk-flt-badge" hidden></span>'
            + '        <svg class="stk-sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
            + '      </button>'
            + '      <div class="stk-flt-menu" hidden>'
            + '        <div class="stk-sec-menu-head"><span>Фильтры по параметрам</span>'
            + '          <button type="button" class="stk-sec-reset" data-act="flt-reset">Сбросить</button></div>'
            + '        <p class="stk-rules-hint">Показывать только компании, где выполнены <b>все</b> включённые условия. Например: ROE &gt; 20.</p>'
            + '        <div class="stk-flt-list"></div>'
            + '      </div>'
            + '    </div>'
            + '    <div class="stk-colsfilter">'
            + '      <button class="stk-cols-btn" type="button" data-act="cols-toggle" title="Показать/скрыть столбцы">'
            + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>'
            + '        <span class="stk-cols-label">Столбцы</span>'
            + '        <span class="stk-cols-badge" hidden></span>'
            + '        <svg class="stk-sec-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
            + '      </button>'
            + '      <div class="stk-cols-menu" hidden>'
            + '        <div class="stk-sec-menu-head"><span>Видимость столбцов</span>'
            + '          <button type="button" class="stk-sec-reset" data-act="cols-reset">Показать все</button></div>'
            + '        <div class="stk-cols-list"></div>'
            + '      </div>'
            + '    </div>'
            + '    <span class="stk-multisort-hint" hidden>'
            + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M5 12h9M5 17h5"/><path d="M16 14l3 3-3 3"/></svg>'
            + '      <span><b>Shift</b> + клик по столбцу — сортировка сразу по нескольким</span>'
            + '    </span>'
            + '    <button class="stk-sortreset" type="button" data-act="sort-reset" hidden title="Сбросить сортировку и показать все столбцы">'
            + '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
            + '      <span>Сбросить сортировку</span>'
            + '    </button>'
            + '    <button class="stk-fav-btn" type="button" data-act="fav-toggle" title="Показать только избранное">'
            + '      ' + STAR_SVG
            + '      <span class="stk-fav-label">Избранное</span>'
            + '      <span class="stk-fav-badge" hidden></span>'
            + '    </button>'
            // Excel-кнопка переехала в глобальную шапку сайта (#termHdrExportBtn → mtExportCsv)
            + '  </div>'
            + '</div>'
            + '<div class="stk-state"></div>'
            + '<div class="stk-scroll"></div>';
        el.addEventListener('click', onClick);
        // Shift+клик по заголовку — не даём браузеру начать выделение текста,
        // иначе жест «добавить столбец в сортировку» выглядит сломанным
        el.addEventListener('mousedown', function (e) {
            if (e.shiftKey && e.target.closest('th[data-sort]')) e.preventDefault();
        });
        // поиск: ввод обновляет фильтр и перерисовывает (тулбар не пересоздаётся)
        var input = el.querySelector('.stk-search-input');
        var clearBtn = el.querySelector('.stk-search-clear');
        input.addEventListener('input', function () {
            state.query = input.value;
            clearBtn.hidden = !input.value;
            if (state.status === 'ready') render();
        });
        // выбор секторов и видимости столбцов (чекбоксы) — делегируем change
        el.addEventListener('change', function (e) {
            var cb = e.target.closest('.stk-sec-opt input');
            if (cb) {
                var sec = cb.value;
                var idx = state.sectors.indexOf(sec);
                if (cb.checked && idx === -1) state.sectors.push(sec);
                else if (!cb.checked && idx !== -1) state.sectors.splice(idx, 1);
                updateSecBadge();
                if (state.status === 'ready') render();
                return;
            }
            var colcb = e.target.closest('.stk-col-opt input');
            if (colcb) {
                var key = colcb.value;
                var hidx = state.hiddenCols.indexOf(key);
                // checked = столбец видим; снятая галочка = скрыт
                if (!colcb.checked && hidx === -1) state.hiddenCols.push(key);
                else if (colcb.checked && hidx !== -1) state.hiddenCols.splice(hidx, 1);
                updateColsBadge();
                updateSortReset();
                if (state.status === 'ready') render();
                return;
            }
            // фильтры по параметрам: чекбокс «вкл» или знак сравнения
            var fltEl = e.target.closest('.stk-flt-row');
            if (fltEl && (e.target.classList.contains('stk-flt-on') || e.target.classList.contains('stk-flt-op'))) {
                syncFltRow(fltEl);
                return;
            }
        });
        // изменение порога правила окраски / значения фильтра — делегируем input
        el.addEventListener('input', function (e) {
            var finp = e.target.closest('.stk-flt-val');
            if (finp) {
                var frow = finp.closest('.stk-flt-row');
                if (frow) {
                    // ввод порога сам включает условие — не заставляем искать чекбокс
                    var on = frow.querySelector('.stk-flt-on');
                    if (on && finp.value !== '' && !on.checked) on.checked = true;
                    syncFltRow(frow);
                }
                return;
            }
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
            var cm = elr.querySelector('.stk-cols-menu');
            if (cm && !cm.hidden && !e.target.closest('.stk-colsfilter')) cm.hidden = true;
            var fm = elr.querySelector('.stk-flt-menu');
            if (fm && !fm.hidden && !e.target.closest('.stk-fltfilter')) fm.hidden = true;
        });
        built = true;
    }

    // Прочитать строку фильтра из DOM в state.filters и перерисовать таблицу
    function syncFltRow(rowEl) {
        var key = rowEl.getAttribute('data-flt');
        if (!key) return;
        var on = rowEl.querySelector('.stk-flt-on');
        var op = rowEl.querySelector('.stk-flt-op');
        var val = rowEl.querySelector('.stk-flt-val');
        var n = val && val.value !== '' ? parseFloat(val.value) : NaN;
        state.filters[key] = {
            on: !!(on && on.checked),
            op: op ? op.value : '>',
            val: isFinite(n) ? n : ''
        };
        rowEl.classList.toggle('is-on', !!(on && on.checked) && isFinite(n));
        updateFltBadge();
        if (state.status === 'ready') render();
    }

    // Бейдж с числом активных фильтров + подсветка кнопки «Фильтры»
    function updateFltBadge() {
        var el = root(); if (!el) return;
        var badge = el.querySelector('.stk-flt-badge');
        var btn = el.querySelector('.stk-flt-btn');
        var n = activeFilters().length;
        if (badge) { badge.hidden = n === 0; badge.textContent = n; }
        if (btn) btn.classList.toggle('active', n > 0);
    }

    // Наполнить меню фильтров строками по числовым столбцам (один раз)
    function populateFltPanel() {
        var el = root(); if (!el) return;
        var listEl = el.querySelector('.stk-flt-list');
        if (!listEl || listEl.childElementCount) return;
        var ops = ['>', '>=', '<', '<=', '=='];
        var opTx = { '>': '>', '>=': '≥', '<': '<', '<=': '≤', '==': '=' };
        listEl.innerHTML = COLS.filter(function (c) { return c.type === 'num'; }).map(function (c) {
            var opts = ops.map(function (o) {
                return '<option value="' + o + '">' + opTx[o] + '</option>';
            }).join('');
            return '<div class="stk-flt-row" data-flt="' + esc(c.key) + '">'
                 + '<input type="checkbox" class="stk-flt-on" title="Включить условие">'
                 + '<span class="stk-flt-name">' + esc(c.label).replace(/\n/g, ' ') + '</span>'
                 + '<select class="stk-flt-op">' + opts + '</select>'
                 + '<input type="number" class="stk-flt-val" step="any" placeholder="порог">'
                 + '</div>';
        }).join('');
    }

    // Наполнить панель правил окраски (один раз)
    function populateRulesPanel() {
        var el = root(); if (!el) return;
        var listEl = el.querySelector('.stk-rules-list');
        if (!listEl || listEl.childElementCount) return;
        var opSym = { '>': '>', '>=': '≥', '<': '<', '==': '=' };
        listEl.innerHTML = state.rules.map(function (r) {
            var unit = (r.key === 'EPS' || r.op === '==') ? '' : '%';
            var off = r.off ? ' is-off' : '';
            var sw = '<button type="button" class="stk-rule-sw" data-act="rule-toggle" data-rule="' + esc(r.key) + '" title="Включить/выключить выделение" aria-pressed="' + (r.off ? 'false' : 'true') + '"></button>';
            if (r.op === 'always' || r.op === '<col' || r.op === '>=col') {
                var desc = r.op === 'always' ? 'подсвечивается всегда'
                         : (r.op === '<col' ? '&lt; ' + esc(r.colLabel) : '≥ ' + esc(r.colLabel));
                return '<div class="stk-rule stk-rule-info' + off + '" data-rule-row="' + esc(r.key) + '">' + sw
                     + '<span class="stk-rule-name">' + esc(r.label) + '</span>'
                     + '<span class="stk-rule-desc">' + desc + '</span></div>';
            }
            return '<div class="stk-rule' + off + '" data-rule-row="' + esc(r.key) + '">' + sw
                 + '<span class="stk-rule-name">' + esc(r.label) + '</span>'
                 + '<span class="stk-rule-op">' + opSym[r.op] + '</span>'
                 + '<input class="stk-rule-val" type="number" step="any" data-rule="' + esc(r.key) + '" value="' + esc(r.val) + '">'
                 + (unit ? '<span class="stk-rule-unit">' + unit + '</span>' : '<span class="stk-rule-unit"></span>')
                 + '</div>';
        }).join('');
    }

    // Наполнить меню видимости столбцов чекбоксами (один раз).
    // Закреплённую колонку Тикер/Название скрывать нельзя — её в списке нет.
    function populateColsPanel() {
        var el = root(); if (!el) return;
        var listEl = el.querySelector('.stk-cols-list');
        if (!listEl || listEl.childElementCount) return;
        listEl.innerHTML = COLS.map(function (c) {
            var checked = state.hiddenCols.indexOf(c.key) === -1 ? ' checked' : '';
            return '<label class="stk-col-opt"><input type="checkbox" value="' + esc(c.key) + '"' + checked + '>'
                 + '<span class="stk-col-opt-tx">' + esc(c.label) + '</span></label>';
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

    // Показать/скрыть кнопку сброса (сортировка + скрытые столбцы) и подсказку мультисортировки
    function updateSortReset() {
        var el = root(); if (!el) return;
        var b = el.querySelector('.stk-sortreset');
        if (b) b.hidden = state.sort.length === 0 && state.hiddenCols.length === 0;
        // подсказка про Shift+клик показывается, когда уже есть активная сортировка
        var hint = el.querySelector('.stk-multisort-hint');
        if (hint) hint.hidden = state.sort.length === 0;
    }

    // Бейдж с числом скрытых столбцов + подсветка кнопки «Столбцы»
    function updateColsBadge() {
        var el = root(); if (!el) return;
        var badge = el.querySelector('.stk-cols-badge');
        var btn = el.querySelector('.stk-cols-btn');
        var n = state.hiddenCols.length;
        if (badge) { badge.hidden = n === 0; badge.textContent = n; }
        if (btn) btn.classList.toggle('active', n > 0);
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

    // ---- Внешний доступ для дашборда (блок «Избранное») ----
    // Дашборд читает избранное и данные компаний отсюда, чтобы был
    // единый источник правды (без рассинхрона с localStorage).
    window.stkGetFavorites = function () { return state.favorites.slice(); };
    window.stkFindCompany = function (ticker) {
        if (!ticker || !state.companies) return null;
        for (var i = 0; i < state.companies.length; i++) {
            if (state.companies[i].ticker === ticker) return state.companies[i];
        }
        return null;
    };
    window.stkToggleFav = function (ticker) {
        toggleFav(ticker);
        return state.favorites.indexOf(ticker) !== -1;
    };

    // Вызывается при входе на вкладку market-stocks
    window.renderStockTerminal = function () {
        buildShell();
        if (state.status === 'idle') { loadData(); return; }
        if (state.status === 'ready') { render(); window.setTimeout(function () { syncCardWidths(); syncPinOffsets(); }, 60); }
        else renderState();
    };

    // ---- Объединённая вкладка «Терминал»: Акции ↔ Облигации ----
    // Оба корня (#stkTerminal и #bndTerminal) живут в #panel-market-stocks;
    // сегмент .mt-asset в тулбарах переключает, какой из них виден.
    // Excel-кнопка в глобальной шапке сайта (#termHdrExportBtn) выгружает
    // ТЕКУЩУЮ таблицу: mtExportCsv выбирает экспортёр по _mtMode.
    window.stkExportCsv = exportCsv;
    window.mtExportCsv = function () {
        if (window._mtMode === 'bonds' && typeof window.bndExportCsv === 'function') window.bndExportCsv();
        else window.stkExportCsv();
    };
    window._mtMode = 'stocks';
    window.mtShowTerminal = function (mode) {
        window._mtMode = (mode === 'bonds') ? 'bonds' : 'stocks';
        var stk = document.getElementById('stkTerminal');
        var bnd = document.getElementById('bndTerminal');
        if (!stk || !bnd) return;
        stk.style.display = (window._mtMode === 'stocks') ? '' : 'none';
        bnd.style.display = (window._mtMode === 'bonds') ? '' : 'none';
        if (window._mtMode === 'bonds') {
            if (typeof window.renderBondTerminal === 'function') window.renderBondTerminal();
        } else {
            window.renderStockTerminal();
        }
        // подсветить активный сегмент в тулбарах обоих терминалов
        document.querySelectorAll('.mt-asset .mt-asset-btn, .mt-asset .bnd-tg-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-asset') === window._mtMode);
        });
    };

    // пересчёт ширины sticky-карточек и смещения закреплённых столбцов при ресайзе окна
    window.addEventListener('resize', function () {
        if (state.status === 'ready' && document.getElementById('panel-market-stocks') &&
            document.getElementById('panel-market-stocks').classList.contains('active')) {
            syncCardWidths();
            syncPinOffsets();
        }
    });

    // Оборачиваем глобальный switchTab — этот файл грузится последним,
    // поэтому наш wrapper внешний и срабатывает после смены панели.
    // Вход на объединённую вкладку показывает последний выбранный класс активов.
    if (typeof window.switchTab === 'function') {
        var _stkPrevSwitchTab = window.switchTab;
        window.switchTab = function (tabId) {
            _stkPrevSwitchTab.apply(this, arguments);
            if (tabId === 'market-stocks') window.mtShowTerminal(window._mtMode || 'stocks');
        };
    }
})();
