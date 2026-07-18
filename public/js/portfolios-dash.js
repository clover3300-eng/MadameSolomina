// ===== «ПОРТФЕЛИ» · ДАШБОРД-КОНСТРУКТОР (модуль цепочки #pfLazySrc) =====
// Пользовательская раскладка страницы: конфиг dashCfg (пер-вкладочные
// раскладки R8, глобальные пресеты, гейты виджетов), 12-колоночная сетка
// (упаковка, drag+resize, undo), поповер настроек виджета, пикер «Добавить
// виджет» и панель «Раскладки». Виджеты сами живут в СЛЕДУЮЩИХ файлах
// цепочки — их рендеры зовутся через PF.* в момент вызова (к тому времени
// вся цепочка загружена). Интерфейс конструктора — экспорт-блок в конце.
(function () {
    'use strict';
    var PF = window.PF;
    // импорт ядра (уже загружено) — локальные алиасы:
    // ВАЖНО: dq потерялся при дроблении (этап 2, c51872c) — без него падали все
    // dq()-вызовы файла: выбор карточек в пикере (pfl2Pick→pfl2KeepScroll), pfl2SetCat,
    // pflInitPreview, pfl3Repaint, pfdUpdateSaveBtn
    var attr = PF.attr, calcPf = PF.calcPf, clamp = PF.clamp, dayDelta = PF.dayDelta, dq = PF.dq, esc = PF.esc, findPf = PF.findPf, genId = PF.genId, jsArg = PF.jsArg, snaps = PF.snaps, toast = PF.toast, visibleItems = PF.visibleItems;
    // ============================================================
    //  ДАШБОРД-КОНСТРУКТОР — пользовательская раскладка страницы
    // ============================================================
    // Полный конструктор: каждый блок страницы (карточки портфелей, календарь,
    // ставки, история сделок, избранное, сводка) — ячейка единой 12-колоночной
    // сетки .pfd-grid. В режиме правки (кнопка «Конструктор» в шапке) блоки
    // перетаскиваются местами (HTML5 DnD, живой предпросмотр перестановки) и
    // тянутся за правый нижний угол (ширина квантуется в колонки, высота — px).
    // Раскладка живёт в pf_dash_v1 (+ cloud-sync.WATCH — едет за пользователем):
    //   { on, order: ['pf:<id>','cal','fav',…], span: {id: 3..12}, h: {id: px} }
    // Пока on=false — страница рендерится классической двухколоночной вёрсткой.
    // Только десктоп: на ≤1023px всегда обычная колонка (pfdActive()).
    var DASH_KEY = 'pf_dash_v1';
    var PFD_NOTE_COLORS = ['slate', 'blue', 'green', 'amber', 'violet', 'rose'];
    // Заметка нового формата: цвет + список строк (тип text | bullet | check) + необяз.
    // срок (due, timestamp). Нормализуем при загрузке; старую одну строку text режем по
    // \n в строки-абзацы, чтобы ничьи записи не потерялись.
    function pfdNormNote(n) {
        n = n || {};
        var color = PFD_NOTE_COLORS.indexOf(n.color) >= 0 ? n.color : 'amber';   // новая заметка — жёлтая
        var items = [];
        if (Array.isArray(n.items)) {
            n.items.forEach(function (it) {
                if (!it || typeof it !== 'object') return;
                var type = (it.type === 'bullet' || it.type === 'check') ? it.type : 'text';
                items.push({ id: String(it.id || genId('i')), type: type,
                    text: typeof it.text === 'string' ? it.text : '', done: !!it.done });
            });
        } else if (typeof n.text === 'string' && n.text) {
            n.text.split('\n').forEach(function (ln) { items.push({ id: genId('i'), type: 'text', text: ln, done: false }); });
        }
        if (!items.length) items = [{ id: genId('i'), type: 'text', text: '', done: false }];
        var due = (typeof n.due === 'number' && isFinite(n.due)) ? n.due : null;
        // срок может быть ПЕРИОДОМ: dueStart (начало) < due (конец/дедлайн). Держим dueStart
        // только когда он валиден и раньше конца, иначе это обычный однодневный срок.
        var dueStart = (typeof n.dueStart === 'number' && isFinite(n.dueStart) && due != null && n.dueStart < due) ? n.dueStart : null;
        var name = (typeof n.name === 'string') ? n.name.slice(0, 40) : '';   // редактируемый заголовок ('' → «Заметка»)
        var fill = (n.fill === 'full' || n.fill === 'none') ? n.fill : 'edge';   // заливка: кант | вся карточка | без линии
        return { id: String(n.id || genId('n')), color: color, items: items, due: due, dueStart: dueStart, name: name, fill: fill };
    }
    PF.dashCfg = loadDashCfg();   // конфиг АКТИВНОЙ подвкладки (подменяется pfxSyncCfg) — только через PF
    PF.dashEdit = false;        // режим правки (не персистится)
    PF.pfdWantRender = false;   // наш собственный ре-рендер в режиме правки
    function loadDashCfg() {
        try {
            var raw = localStorage.getItem(DASH_KEY);
            var c = JSON.parse(raw || 'null') || {};
            var firstRun = raw == null;   // конфига ещё не было → живая сетка с раскладкой-референсом сразу
            var notes = Array.isArray(c.notes) ? c.notes.filter(function (n) { return n && n.id; }).map(pfdNormNote) : [];
            // миграция старого одиночного cfg.note (строка) → первая заметка нового формата
            if (!notes.length && typeof c.note === 'string' && c.note.trim()) notes = [pfdNormNote({ id: 'nmig', text: c.note })];
            // миграция: раньше дизайн графика хранился флагом capVariant; теперь «Столбцы» —
            // отдельный блок cap2. Если был выбран вариант 'b' и график добавлен — перевешиваем
            // все его ключи (hidden/span/h/col/order) с cap на cap2.
            if (c.capVariant === 'b' && c.hidden && c.hidden.cap === 0) {
                ['hidden', 'span', 'h', 'col'].forEach(function (k) { if (c[k] && c[k].cap != null) { c[k].cap2 = c[k].cap; delete c[k].cap; } });
                if (Array.isArray(c.order)) c.order = c.order.map(function (x) { return x === 'cap' ? 'cap2' : x; });
            }
            return { on: firstRun ? true : !!c.on, order: Array.isArray(c.order) ? c.order : [], span: c.span || {}, h: c.h || {},
                hidden: c.hidden || {}, col: c.col || {}, notes: notes,
                allocPf: c.allocPf || 'all',                    // выбранный портфель в «Распределении активов»
                thm: (c.thm && typeof c.thm === 'object') ? c.thm : {},   // per-виджет тема ('dark') из пикера
                corner: (c.corner === 'main' || c.corner === 'lg') ? c.corner : 'std',   // скругление карточек
                saved: c.saved || null };                       // снимок сохранённой раскладки (для «Вернуть сохранённую»)
        } catch (e) { return { on: true, order: [], span: {}, h: {}, hidden: {}, col: {}, notes: [], allocPf: 'all', thm: {}, corner: 'std', saved: null }; }
    }
    // R9.4: ручной known-список (pfdKnownIds) УДАЛЁН — он молча стирал из конфига
    // любой виджет, который забыли в него дописать (мина для каждого нового
    // виджета). Теперь чистим только ЗАВЕДОМО МЁРТВЫЕ динамические ключи:
    // pf:<id> удалённых портфелей и note:<id> удалённых заметок; всё прочее
    // конфиг сохраняет как есть (несуществующий id просто не рендерится).
    function pfdDeadId(id) {
        if (/^pf:#\d+$/.test(id)) return false;   // позиционный токен пресета — не трогаем
        if (id.indexOf('pf:') === 0) return !findPf(id.slice(3));
        if (id.indexOf('note:') === 0) {
            var nid = id.slice(5);
            return !(PF.dashCfg.notes || []).some(function (n) { return n.id === nid; });
        }
        return false;
    }
    function saveDashCfg() {
        try {
            // чистим ключи удалённых портфелей/заметок — конфиг не копит мусор (и не
            // тащит его в облако через cloud-sync). Скрытые портфели остаются в
            // PF.store.items, их раскладка переживает «скрыть/показать».
            PF.dashCfg.order = (PF.dashCfg.order || []).filter(function (id) { return !pfdDeadId(id); });
            [PF.dashCfg.span, PF.dashCfg.h, PF.dashCfg.hidden, PF.dashCfg.col, PF.dashCfg.thm].forEach(function (m) {
                Object.keys(m || {}).forEach(function (id) { if (pfdDeadId(id)) delete m[id]; });
            });
            // R8: активная раскладка пер-вкладочная. «Обзор» живёт в старом ключе pf_dash_v1
            // (совместимость + cloud-sync), остальные подвкладки — картой pf_dash_tabs_v1.
            if (PF.dashTab === 'overview') localStorage.setItem(DASH_KEY, JSON.stringify(PF.dashCfg));
            else {
                pfTabsStore[PF.dashTab] = PF.dashCfg;
                localStorage.setItem(DASH_TABS_KEY, JSON.stringify(pfTabsStore));
            }
        } catch (e) {}
        // если открыта карточка настройки — держим кнопку «Сохранить/Сохранено» в актуальном
        // состоянии (правка после сохранения снова показывает «Сохранить»)
        try { if (PF.dashEdit) pfdUpdateSaveBtn(); } catch (e) {}
    }

    // ============ R8: ПЕР-ВКЛАДОЧНЫЕ РАСКЛАДКИ ============================
    // У КАЖДОЙ подвкладки (Обзор | Портфели | Аналитика | …) свой полноценный
    // дашборд-конструктор: свои order/span/h/hidden/col/thm/notes/saved. Активный
    // конфиг — всегда переменная PF.dashCfg (весь конструктор работает с ней), а
    // pfxSyncCfg подменяет её при смене подвкладки. PF.dashTab — вкладка активного
    // PF.dashCfg. Новая подвкладка в PF.PFX_TABS работает автоматически: без сида она
    // начинается пустой сеткой с приглашением добавить виджеты.
    var DASH_TABS_KEY = 'pf_dash_tabs_v1';
    PF.dashTab = 'overview';
    var pfTabCfgs = { overview: PF.dashCfg };
    var pfTabsStore = (function () {
        try { var o = JSON.parse(localStorage.getItem(DASH_TABS_KEY) || 'null'); return (o && typeof o === 'object') ? o : {}; }
        catch (e) { return {}; }
    })();
    // конфиг подвкладки: без corner (глобальный, живёт в overview-конфиге) и без on
    // (подвкладки всегда живут сеткой — «классического» вида у них нет)
    function normTabCfg(c) {
        c = c || {};
        var notes = Array.isArray(c.notes) ? c.notes.filter(function (n) { return n && n.id; }).map(pfdNormNote) : [];
        return { on: true, order: Array.isArray(c.order) ? c.order : [], span: c.span || {}, h: c.h || {},
            hidden: c.hidden || {}, col: c.col || {}, thm: (c.thm && typeof c.thm === 'object') ? c.thm : {},
            notes: notes, allocPf: c.allocPf || 'all', saved: c.saved || null };
    }
    // сиды подвкладок: [id, col, span] — повторяют прежние статичные раскладки
    // pfxTabBodyHtml, только теперь это стартовая точка конструктора, а не бетон
    var PFX_TAB_SEEDS = {
        // просто и читаемо: сводный список сверху, ниже — полные составы.
        // Кольцо структуры и сводные плитки дублировали те же цифры третий
        // раз — из сида убраны, но доступны из пикера виджетов (pstruct/psum)
        ports: [['plist', 1, 12], ['pdetail', 1, 12]],
        analytics: [['cap', 1, 8], ['alloc', 9, 4], ['yield', 1, 4], ['movers', 5, 4], ['conc', 9, 4], ['assets', 1, 8], ['idx', 9, 4]],
        reports: [['reports', 1, 6], ['snaps', 7, 6]],
        divs: [['divs', 1, 4], ['kpi:next', 5, 4], ['passive', 9, 4], ['cal', 1, 8], ['calm', 9, 4]],
        ops: [['trades', 1, 12]],
        settings: [['set:corner', 1, 6], ['set:bg', 7, 6], ['set:vis', 1, 6], ['set:layout', 7, 6], ['reports', 1, 6]],
        // «Торговля»: три карточки терминала стартуют в ряд (стакан ýже, тикету и
        // заявкам просторнее) — дальше пользователь двигает и меняет размер сам
        trading: [['trade:ob', 1, 4], ['trade:ticket', 5, 4], ['trade:orders', 9, 4]]
    };
    function pfxTabSeed(tab) {
        var cfg = normTabCfg(null);
        // вкладка-портфель (R9): стартует с его карточки «чуть шире узкой» (span 5 —
        // просьба 2026-07-16, было 12); id виджета карточки совпадает с именем вкладки
        // ('pf:<id>'). «Распределение активов», если его добавят из пикера, сразу
        // смотрит на этот портфель (allocPf). Рядом рендерится обучающий «теневой
        // виджет» добавления (см. pfdBodyHtml → pfxGhostClick).
        if (pfxIsPfTab(tab)) {
            cfg.order.push(tab); cfg.col[tab] = 1; cfg.span[tab] = 5; cfg.hidden[tab] = 0;
            cfg.allocPf = tab.slice(3);
            return cfg;
        }
        (PFX_TAB_SEEDS[tab] || []).forEach(function (r) {
            cfg.order.push(r[0]); cfg.col[r[0]] = r[1]; cfg.span[r[0]] = r[2]; cfg.hidden[r[0]] = 0;
        });
        return cfg;
    }
    function dashCfgFor(tab) {
        if (!pfTabCfgs[tab]) {
            var c = pfTabsStore[tab] ? normTabCfg(pfTabsStore[tab]) : pfxTabSeed(tab);
            // мягкая миграция R9.1: НЕТРОНУТЫЙ старый сид вкладки-портфеля (одна карточка
            // во всю ширину, больше ничего) сужается до нового сида span 5; любая правка
            // пользователя (виджеты, заметки, другой span) конфиг от миграции уводит
            if (pfxIsPfTab(tab) && pfTabsStore[tab] && c.order.length === 1 && c.order[0] === tab &&
                +c.span[tab] === 12 && !c.notes.length) c.span[tab] = 5;
            pfTabCfgs[tab] = c;
        }
        return pfTabCfgs[tab];
    }
    // вкладка-портфель (R9): динамическая подвкладка 'pf:<id>' с дашбордом одного
    // портфеля — открывается кликом по строке «Моих портфелей» (см. pfxOpenPf)
    function pfxIsPfTab(t) { return typeof t === 'string' && t.indexOf('pf:') === 0; }
    // эффективная подвкладка: на мобильном и без портфелей всё живёт «Обзором»
    function pfxEffTab() {
        var t = (typeof PF.pfxTab === 'string') ? PF.pfxTab : 'overview';
        if (t === 'overview' || !PF.store.items.length || !PF.pfxWide()) return 'overview';
        // вкладка-портфель живёт, пока портфель существует. R9.2: у СКРЫТОГО
        // портфеля вкладка живёт тоже — «скрыть» убирает его с «Обзора» и из
        // сводок, а открытая вкладка остаётся единственным местом, где он виден.
        // Правило «один видимый — без вкладки (его дашборд и есть „Обзор“)»
        // касается только видимых портфелей.
        if (pfxIsPfTab(t)) {
            var p = findPf(t.slice(3));
            return (p && (p.hidden || visibleItems().length >= 2)) ? t : 'overview';
        }
        return t;
    }
    function pfxSyncCfg() {
        var t = pfxEffTab();
        if (t === PF.dashTab) return;
        PF.dashTab = t;
        PF.dashCfg = dashCfgFor(t);
        pfdUndoStack.length = 0;   // undo-стек не должен уносить снимок на чужую вкладку
        try { window.pfdCfgClose(); } catch (e) {}
    }
    function pfxTabLabel(t) {
        if (pfxIsPfTab(t)) { var p = findPf(t.slice(3)); return p ? p.name : 'Портфель'; }
        for (var i = 0; i < PF.PFX_TABS.length; i++) if (PF.PFX_TABS[i][0] === t) return PF.PFX_TABS[i][1];
        return 'Обзор';
    }

    // ============ ГЛОБАЛЬНЫЕ ПРЕСЕТЫ РАСКЛАДКИ ============================
    // Пресет — портативный снимок раскладки дашборда (какие блоки показаны, их
    // размеры и расстановка). Задаёт админ/владелец, ВЫБИРАЮТ все пользователи в
    // «настройках раскладки». Хранится в Supabase app_config (ключ 'pf_presets',
    // value = { presets:[{id,name,snap,at,by}] }): читают ВСЕ (RLS select=true),
    // пишет только is_admin(). Карточки портфелей в снимке шаблонизируются позиционно
    // (pf:#0, pf:#1…) — у каждого свои id, при применении токены подставляются в его
    // реальные портфели по порядку. Личные заметки в пресет НЕ попадают. Локальный
    // кэш — pf_presets_cache_v1 (ВНЕ cloud-sync.WATCH: конфиг общий, не пер-юзерный).
    var PRESETS_KEY = 'pf_presets';
    var PRESETS_CACHE = 'pf_presets_cache_v1';
    var PRESETS_REFRESH_MS = 90000;
    // pfPresetList — общие пресеты [{id,name,snap,at,by}]; pfBaseMap — БАЗОВАЯ раскладка по
    // числу видимых портфелей { "1": snap, "2": snap… } (снимки шаблонизированы pf:#0…). Оба
    // в том же app_config-ключе 'pf_presets' (value = { presets, bases }).
    var pfPresetList = [], pfBaseMap = {};
    (function () { var c = loadPresetCache(); pfPresetList = c.presets; pfBaseMap = c.bases; })();
    var pfPresetsFetchedAt = 0, pfPresetsFetching = false, pfPresetsSaving = false;
    function loadPresetCache() {
        try { var c = JSON.parse(localStorage.getItem(PRESETS_CACHE) || 'null') || {};
            return { presets: Array.isArray(c.presets) ? c.presets : [], bases: (c.bases && typeof c.bases === 'object') ? c.bases : {} };
        } catch (e) { return { presets: [], bases: {} }; }
    }
    function savePresetCache() {
        try { localStorage.setItem(PRESETS_CACHE, JSON.stringify({ presets: pfPresetList, bases: pfBaseMap, at: Date.now() })); } catch (e) {}
    }
    // R9: у вкладок-портфелей пресеты и базовая ОБЩИЕ (один ключ 'pftab' на все):
    // раскладка, собранная на одной такой вкладке, подходит любой другой — карточка
    // «своего» портфеля шаблонизируется позиционно в pf:#0 (см. pfPresetTemplate).
    function pfPresetTabKey() { return pfxIsPfTab(PF.dashTab) ? 'pftab' : PF.dashTab; }
    // R8: базовая раскладка пер-вкладочная. Для «Обзора» ключ — ЧИСЛО видимых портфелей
    // (как исторически, свои базовые на 1/2/3… портфеля), для подвкладок — имя вкладки.
    function pfBaseKey() { return PF.dashTab === 'overview' ? String(visibleItems().length) : pfPresetTabKey(); }
    function pfBaseFor() { return (pfBaseMap || {})[pfBaseKey()] || null; }
    // пресеты ТЕКУЩЕЙ подвкладки (у старых пресетов поля tab нет — они обзорные);
    // с гейтом: скрытые админом (hid) обычный пользователь не видит, админ видит все
    function pfPresetsOfTab() { return pfPresetList.filter(function (p) { return (p.tab || 'overview') === pfPresetTabKey(); }); }
    function pfPresetsVisible() {
        var admin = pfIsAdmin();
        return pfPresetsOfTab().filter(function (p) { return admin || !p.hid; });
    }
    function pfSupa() { return window.supa; }
    function pfCloudOn() { return !!(pfSupa() && pfSupa().enabled); }
    function pfIsAdmin() { return !!(pfSupa() && pfSupa().isAdmin && pfSupa().isAdmin()); }
    // читаем список пресетов из облака (троттлинг); по приходу освежаем кэш и поповер
    function pfPresetsFetch(force) {
        if (!pfCloudOn() || pfPresetsFetching) return;
        if (!force && Date.now() - pfPresetsFetchedAt < PRESETS_REFRESH_MS) return;
        pfPresetsFetching = true;
        pfSupa().client.from('app_config').select('value').eq('key', PRESETS_KEY).limit(1)
            .then(function (res) {
                pfPresetsFetching = false;
                if (res.error) return;
                pfPresetsFetchedAt = Date.now();
                var v = (res.data && res.data[0] && res.data[0].value) || {};
                pfPresetList = Array.isArray(v.presets) ? v.presets.filter(function (p) { return p && p.id && p.snap; }) : [];
                pfBaseMap = (v.bases && typeof v.bases === 'object') ? v.bases : {};
                savePresetCache();
                try { updateLayoutBtn(); } catch (e) {}
                try { pfl3Repaint(); } catch (e) {}
            }, function () { pfPresetsFetching = false; });
    }
    // сохранить список в облако (только админ/владелец). Локально применяем сразу.
    function pfPresetsPersist(okMsg) {
        if (!pfIsAdmin()) { toast('Пресеты задаёт администратор', true); return; }
        savePresetCache();
        try { updateLayoutBtn(); } catch (e) {}
        try { pfl3Repaint(); } catch (e) {}
        if (!pfCloudOn() || pfPresetsSaving) return;
        pfPresetsSaving = true;
        var uid = (pfSupa().session && pfSupa().session.user) ? pfSupa().session.user.id : null;
        pfSupa().client.from('app_config').upsert({ key: PRESETS_KEY, value: { presets: pfPresetList, bases: pfBaseMap }, updated_by: uid }, { onConflict: 'key' })
            .then(function (res) {
                pfPresetsSaving = false;
                if (res.error) { toast((pfSupa().errRu ? pfSupa().errRu(res.error) : 'Не удалось сохранить пресет'), true); return; }
                pfPresetsFetchedAt = Date.now();
                try { pfSupa().logEvent && pfSupa().logEvent('pf_preset_save', { n: pfPresetList.length }); } catch (e) {}
                if (okMsg) toast(okMsg);
            }, function () { pfPresetsSaving = false; toast('Не удалось сохранить пресет', true); });
    }
    // ============ ВИДИМОСТЬ ВИДЖЕТОВ КАТАЛОГА (админ/владелец) ================
    // Админ может скрыть любой виджет из пикера «Добавить виджет» у ВСЕХ обычных
    // пользователей: глаз на карточке пикера. Конфиг общий — app_config (ключ
    // 'widget_gates', value = { hidden: { <id виджета>: 1 } }): читают все (RLS
    // select=true), пишет только is_admin(). Кэш — widget_gates_cache_v1 (ВНЕ
    // cloud-sync.WATCH: конфиг общий, не пер-юзерный). Админ видит скрытые
    // карточки приглушёнными с бейджем «скрыт у всех» — и может вернуть.
    var WGATES_KEY = 'widget_gates';
    var WGATES_CACHE = 'widget_gates_cache_v1';
    var pfWGates = (function () {
        try { var c = JSON.parse(localStorage.getItem(WGATES_CACHE) || 'null') || {}; return (c.hidden && typeof c.hidden === 'object') ? c.hidden : {}; }
        catch (e) { return {}; }
    })();
    var pfWGatesFetchedAt = 0, pfWGatesFetching = false;
    function pfWGatesSaveCache() {
        try { localStorage.setItem(WGATES_CACHE, JSON.stringify({ hidden: pfWGates, at: Date.now() })); } catch (e) {}
    }
    function pfWGatesFetch(force) {
        if (!pfCloudOn() || pfWGatesFetching) return;
        if (!force && Date.now() - pfWGatesFetchedAt < PRESETS_REFRESH_MS) return;
        pfWGatesFetching = true;
        pfSupa().client.from('app_config').select('value').eq('key', WGATES_KEY).limit(1)
            .then(function (res) {
                pfWGatesFetching = false;
                if (res.error) return;
                pfWGatesFetchedAt = Date.now();
                var v = (res.data && res.data[0] && res.data[0].value) || {};
                pfWGates = (v.hidden && typeof v.hidden === 'object') ? v.hidden : {};
                pfWGatesSaveCache();
                if (PF.dashEdit) pfl2Paint(['cats', 'main']);   // пикер открыт — освежаем каталог
            }, function () { pfWGatesFetching = false; });
    }
    window.pfl2GateToggle = function (id, ev) {
        if (ev) ev.stopPropagation();
        if (!pfIsAdmin()) return;
        if (pfWGates[id]) delete pfWGates[id]; else pfWGates[id] = 1;
        var nowHidden = !!pfWGates[id];
        pfWGatesSaveCache();
        pfl2Paint(['cats', 'main']);
        if (!pfCloudOn()) { toast('Без облака скрытие действует только на этом устройстве', true); return; }
        var uid = (pfSupa().session && pfSupa().session.user) ? pfSupa().session.user.id : null;
        pfSupa().client.from('app_config').upsert({ key: WGATES_KEY, value: { hidden: pfWGates }, updated_by: uid }, { onConflict: 'key' })
            .then(function (res) {
                if (res.error) { toast((pfSupa().errRu ? pfSupa().errRu(res.error) : 'Не удалось сохранить видимость виджета'), true); return; }
                pfWGatesFetchedAt = Date.now();
                toast(nowHidden ? 'Виджет скрыт у пользователей' : 'Виджет снова виден всем');
            }, function () { toast('Не удалось сохранить видимость виджета', true); });
    };

    // ---- шаблонизация: снимок раскладки → портативный (карточки портфелей позиционно) ----
    function pfPresetTemplate(snap) {
        snap = snap || {};
        var order = (snap.order || []).slice();
        var map = {}, i = 0;
        // R9: на вкладке-портфеле её «хозяин» — всегда pf:#0 (id виджета карточки
        // совпадает с именем вкладки), чтобы пресет с любой такой вкладки на любой
        // другой подставил именно ЕЁ портфель, а не первый по порядку
        if (pfxIsPfTab(PF.dashTab)) map[PF.dashTab] = 'pf:#' + (i++);
        order.forEach(function (id) { if (id.indexOf('pf:') === 0 && !map[id]) map[id] = 'pf:#' + (i++); });
        var tok = function (id) { return map[id] || id; };
        var isNote = function (id) { return id.indexOf('note:') === 0; };
        function remap(m) { var o = {}; Object.keys(m || {}).forEach(function (k) { if (!isNote(k)) o[tok(k)] = m[k]; }); return o; }
        return { order: order.filter(function (id) { return !isNote(id); }).map(tok),
            span: remap(snap.span), h: remap(snap.h), hidden: remap(snap.hidden), col: remap(snap.col), allocPf: 'all' };
    }
    // ---- инстанцирование: портативный пресет → раскладка для ЭТОГО пользователя ----
    function pfPresetInstantiate(snap) {
        snap = snap || {};
        var real = visibleItems().map(function (p) { return 'pf:' + p.id; });
        // R9: на вкладке-портфеле pf:#0 — портфель ЭТОЙ вкладки, прочие номера —
        // остальные видимые по порядку (зеркало pfPresetTemplate)
        if (pfxIsPfTab(PF.dashTab)) real = [PF.dashTab].concat(real.filter(function (id) { return id !== PF.dashTab; }));
        function sub(id) { var m = /^pf:#(\d+)$/.exec(id); if (!m) return id; var idx = +m[1]; return idx < real.length ? real[idx] : null; }
        var order = [], seen = {};
        (snap.order || []).forEach(function (id) { var r = sub(id); if (r && !seen[r]) { order.push(r); seen[r] = 1; } });
        function remap(m) { var o = {}; Object.keys(m || {}).forEach(function (k) { var r = sub(k); if (r) o[r] = m[k]; }); return o; }
        var span = remap(snap.span), h = remap(snap.h), hidden = remap(snap.hidden), col = remap(snap.col);
        // портфелей БОЛЬШЕ, чем в пресете — не теряем: добавляем хвост карточек дефолтным размером
        real.forEach(function (id) { if (!seen[id]) { order.push(id); if (span[id] == null) span[id] = 4; } });
        // личные заметки пользователя сохраняем — их блоки дописываем в конец
        (PF.dashCfg.notes || []).forEach(function (n) { var id = 'note:' + n.id; if (order.indexOf(id) === -1) order.push(id); });
        return { order: order, span: span, h: h, hidden: hidden, col: col, allocPf: snap.allocPf || 'all' };
    }
    // структурная подпись раскладки (без заметок) — для отметки «активен» у пресета
    function pfStructSig(c) {
        var keep = function (k) { return k.indexOf('note:') !== 0; };
        function m(o) { var r = {}; Object.keys(o || {}).filter(keep).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
        return JSON.stringify([(c.order || []).filter(keep), m(c.span), m(c.h), m(c.hidden), m(c.col), c.allocPf || 'all']);
    }
    function pfPresetActive(p) {
        try { return pfStructSig(pfPresetInstantiate(p.snap)) === pfStructSig(PF.dashCfg); } catch (e) { return false; }
    }
    // мини-эскиз раскладки пресета: 12-колоночная схема блоков (span/col/скрытия как в реальной
    // упаковке) — чтобы вид был понятен без применения, а не только по названию
    function pfPresetThumbSvg(snap) {
        snap = snap || {};
        var META = {
            fav: { l: 'Избранное', h: 3 }, cal: { l: 'Календарь', h: 3 }, sum: { l: 'Сводка', h: 2 },
            panel: { l: 'Панель', h: 1 }, rates: { l: 'Ставки', h: 1 }, trades: { l: 'Сделки', h: 2 },
            'kpi:cap': { l: 'Капитал', h: 1 }, 'kpi:day': { l: 'За день', h: 1 }, 'kpi:next': { l: 'Выплата', h: 1 },
            cap: { l: 'График', h: 2 }, cap2: { l: 'График', h: 2 }, heat: { l: 'Карта', h: 2.4 },
            news: { l: 'Новости', h: 2 }, alloc: { l: 'Активы', h: 2 },
            divs: { l: 'Дивиденды', h: 2 }, calm: { l: 'Месяц', h: 2.4 }, assets: { l: 'Активы', h: 2.4 },
            ops: { l: 'Операции', h: 2 }, yield: { l: 'Доходность', h: 2 }, snaps: { l: 'Снимки', h: 2.4 },
            movers: { l: 'Лидеры', h: 2 }, idx: { l: 'Рынок', h: 2 }, passive: { l: 'Доход', h: 2 },
            conc: { l: 'Диверс.', h: 2 }, plist: { l: 'Портфели', h: 2.6 }, pstruct: { l: 'Структура', h: 2.4 },
            psum: { l: 'Сводные', h: 2.4 }, pdetail: { l: 'Составы', h: 3 }, reports: { l: 'Отчёты', h: 2.4 },
            'set:corner': { l: 'Вид', h: 2 }, 'set:vis': { l: 'Видимость', h: 2 }, 'set:layout': { l: 'Раскладки', h: 2 },
            'set:bg': { l: 'Фон', h: 2 }
        };
        var DEFSPAN = { fav: 4, cal: 8, sum: 4, panel: 12, rates: 12, trades: 12,
            'kpi:cap': 4, 'kpi:day': 4, 'kpi:next': 4, cap: 6, cap2: 6, heat: 6, news: 6, alloc: 4,
            divs: 4, calm: 4, assets: 4, ops: 4, yield: 4, snaps: 6, movers: 4, idx: 4, passive: 4, conc: 4,
            plist: 12, pstruct: 6, psum: 6, pdetail: 12, reports: 6,
            'set:corner': 6, 'set:vis': 6, 'set:layout': 6, 'set:bg': 6 };
        function meta(id) {
            if (id.indexOf('pf:') === 0) { var m = /pf:#?(\d+)/.exec(id); return { l: 'П' + ((m ? +m[1] : 0) + 1), h: 3, cls: 'pf' }; }
            if (id.indexOf('note:') === 0) return { l: 'Заметка', h: 1.5, cls: 'note' };
            var x = META[id]; return { l: x ? x.l : id, h: x ? x.h : 2, cls: 'w' };
        }
        function defSpan(id) { if (id.indexOf('pf:') === 0) return 4; if (id.indexOf('note:') === 0) return 4; return DEFSPAN[id] || 6; }
        var hidden = snap.hidden || {}, spanM = snap.span || {}, colM = snap.col || {};
        var order = (snap.order || []).filter(function (id) { return !hidden[id]; });
        if (!order.length) return '';
        var COLS = 12, bottom = [], i; for (i = 0; i < COLS; i++) bottom[i] = 0;
        var placed = order.map(function (id) {
            var mt = meta(id);
            var span = Math.max(3, Math.min(COLS, spanM[id] || defSpan(id)));
            var x, c, k, yy;
            if (colM[id]) { x = Math.max(0, Math.min(COLS - span, colM[id] - 1)); }
            else { x = 0; var bestY = Infinity; for (c = 0; c <= COLS - span; c++) { yy = 0; for (k = c; k < c + span; k++) yy = Math.max(yy, bottom[k]); if (yy < bestY) { bestY = yy; x = c; } } }
            var y = 0; for (k = x; k < x + span; k++) y = Math.max(y, bottom[k]);
            for (k = x; k < x + span; k++) bottom[k] = y + mt.h;
            return { x: x, y: y, w: span, h: mt.h, l: mt.l, cls: mt.cls };
        });
        var totalH = 0; for (i = 0; i < COLS; i++) totalH = Math.max(totalH, bottom[i]); if (!totalH) totalH = 1;
        var CW = 22, CH = 15, GAP = 3, PAD = 4;
        var W = COLS * CW + PAD * 2, H = totalH * CH + PAD * 2;
        var body = placed.map(function (p) {
            var x = PAD + p.x * CW + GAP / 2, y = PAD + p.y * CH + GAP / 2;
            var w = p.w * CW - GAP, h = p.h * CH - GAP;
            var label = (w > 28 && h > 10) ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y + h / 2).toFixed(1) + '" class="pft-tx">' + esc(p.l) + '</text>' : '';
            return '<g class="pft-b pft-' + p.cls + '"><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"/>' + label + '</g>';
        }).join('');
        return '<svg viewBox="0 0 ' + W + ' ' + H.toFixed(1) + '" class="pfl-thumb-svg" preserveAspectRatio="xMidYMid meet">' + body + '</svg>';
    }

    function pfdActive() {
        if (!PF.dashCfg.on && !PF.dashEdit) return false;
        try { if (window.matchMedia('(max-width: 1023px)').matches) return false; } catch (e) {}
        return visibleItems().length > 0;
    }
    // Сетка показана на десктопе → блоки ЖИВЫЕ: перетаскивание (за грип-ручку),
    // ресайз (за кромки/уголок), скрытие и удаление доступны ВСЕГДА, без входа в
    // отдельный режим. PF.dashEdit теперь означает лишь «открыт тулбокс Конструктора»
    // (панель «Добавить виджет / Отменить / Вернуть стандартную»).
    function pfdLive() { return pfdActive(); }
    // Идёт жест — активное перетаскивание или ресайз. На это время фоновые
    // ре-рендеры (котировки приходят пачками) глушим: innerHTML-своп оборвал бы
    // жест на полпути. pfdDragEl/pfdRsCancel объявлены ниже (var-хойстинг), к
    // моменту вызова (пользовательское взаимодействие) уже инициализированы.
    function pfdBusy() { return !!(pfdDragEl || pfdRsCancel); }
    // «Тихое окно» после жеста: pfdEndDrag сбрасывает pfdDragEl сразу, но карточка ещё
    // доигрывает — призрак летит в слот (~180мс), соседи съезжаются FLIP-ом (~240мс).
    // Полный своп в этот момент обрывает анимацию на полукадре: визуально карточка
    // моргает и «прыгает». Держим фоновые перерисовки до конца анимаций.
    var pfdCalmUntil = 0;
    function pfdCalm(ms) { pfdCalmUntil = Date.now() + (ms || 320); }
    // Можно ли сейчас делать ФОНОВЫЙ полный своп (жест / открытый пикер / хвост анимации).
    function pfdQuiet() { return pfdBusy() || PF.dashEdit || Date.now() < pfdCalmUntil; }
    // Ре-рендер, инициированный самим конструктором: во время жеста/открытого
    // пикера фоновые перерисовки глушатся — этот флаг их пропускает.
    function pfdRerender() { PF.pfdWantRender = true; PF.renderSmooth(); }

    // ---- masonry-упаковка: короткие блоки подтягиваются вверх в чужой зазор ----
    // CSS-grid делает ряд по высоте самого высокого блока — под коротким соседом
    // зияет дыра. CSS-masonry в Chrome ещё нет, поэтому раскладываем сами: каждому
    // блоку ставим ЯВНЫЕ grid-column-start и grid-row (в px, при grid-auto-rows:1px),
    // жадно кладя его в колонку(и) с наименьшим текущим «дном». Блоки остаются
    // grid-элементами — drag/resize/FLIP работают как прежде, меняется только место.
    // align-items:start уже держит природную высоту, offsetHeight даёт её независимо
    // от текущего grid-row, поэтому мерить можно без сброса. Вся геометрия в CSS-px
    // (offset*/clientWidth + grid-auto-rows:1px) — один координатный простор, zoom
    // делить не нужно (в отличие от призрака драга, что уходит в визуальные px).
    var pfdPackRaf = 0;
    var pfdRO = null;
    function pfdSpanOf(item, colW, gap) {
        var s = /span\s+(\d+)/.exec(item.style.gridColumn || '');
        if (s) return clamp(+s[1], 1, 12);
        return clamp(Math.round((item.offsetWidth + gap) / (colW + gap)), 1, 12);
    }
    // Разбор фактического места блока в сетке (после pfdPack проставил grid-column/row):
    // {col0, span, right0, row0, row1} в 0-базовых колонках/строках. null — если не размещён.
    function pfdGridRect(item) {
        var mc = /^\s*(\d+)\s*\/\s*span\s*(\d+)/.exec(item.style.gridColumn || '');
        if (!mc) return null;
        var col0 = +mc[1] - 1, span = +mc[2];
        var mr = /^\s*(\d+)\s*\/\s*span\s*(\d+)/.exec(item.style.gridRow || '');
        var row0 = mr ? +mr[1] - 1 : 0, rowSpan = mr ? +mr[2] : 1;
        return { col0: col0, span: span, right0: col0 + span, row0: row0, row1: row0 + rowSpan };
    }
    function pfdPack() {
        pfdPackRaf = 0;
        var grid = document.getElementById('pfdGrid');
        if (!grid || !grid.classList.contains('pfd-masonry')) return;
        var items = Array.prototype.filter.call(grid.children, function (el) {
            return el.classList && el.classList.contains('pfd-item');
        });
        if (!items.length) return;
        var gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
        var colW = (grid.clientWidth - gap * 11) / 12;
        var bottom = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        var colPref = PF.dashCfg.col || {};
        items.forEach(function (item) {
            var span = pfdSpanOf(item, colW, gap);
            var h = Math.max(1, Math.ceil(item.offsetHeight));
            var id = item.getAttribute('data-pfd');
            var bestC;
            // Блок, который пользователь перетащил в конкретную колонку (colPref) — СТАВИМ
            // ИМЕННО ТУДА (стопкой под тем, что уже в этих колонках), даже если рядом есть
            // более короткая колонка. Так «Суммарный капитал» можно положить под «Второй»
            // справа, оставив слева зазор. Не тронутые блоки — жадно в кратчайшую колонку.
            var pref = colPref[id];
            if (pref) {
                bestC = clamp(pref - 1, 0, 12 - span);
            } else {
                bestC = 0;
                var bestTop = Infinity;
                for (var c = 0; c + span <= 12; c++) {
                    var t = 0;
                    for (var k = c; k < c + span; k++) if (bottom[k] > t) t = bottom[k];
                    if (t < bestTop - 0.5) { bestTop = t; bestC = c; }
                }
            }
            var topY = 0;
            for (var kk = bestC; kk < bestC + span; kk++) if (bottom[kk] > topY) topY = bottom[kk];
            item.style.gridColumn = (bestC + 1) + ' / span ' + span;
            item.style.gridRow = (Math.round(topY) + 1) + ' / span ' + h;
            var nb = topY + h + gap;
            for (var k2 = bestC; k2 < bestC + span; k2++) bottom[k2] = nb;
        });
        PF.pfdHeatRepaintSoon();   // ширина окна/блока изменилась → плитки карты заново
    }
    function pfdRepackSoon() { if (!pfdPackRaf) pfdPackRaf = requestAnimationFrame(pfdPack); }
    // (пере)подписываем ResizeObserver на актуальные блоки: их высота меняется от
    // шрифтов/состава/ресайза/ширины окна — тогда пере-упаковываем. Смена grid-row
    // не трогает border-box блока (align-items:start), а смена start-колонки — его
    // ширину, поэтому петли нет: упаковка идемпотентна и сходится за пару проходов.
    function pfdSchedulePack() {
        var grid = document.getElementById('pfdGrid');
        if (!grid || !grid.classList.contains('pfd-masonry')) { if (pfdRO) pfdRO.disconnect(); return; }
        if (window.ResizeObserver) {
            if (!pfdRO) pfdRO = new ResizeObserver(pfdRepackSoon);
            pfdRO.disconnect();
            pfdRO.observe(grid);
            Array.prototype.forEach.call(grid.children, function (el) {
                if (el.classList && el.classList.contains('pfd-item')) pfdRO.observe(el);
            });
        }
        pfdPack();   // синхронно — первый пейнт уже с masonry-раскладкой, без мигания
    }

    // ---- блоки страницы ----
    // Порядок по умолчанию заполняет ряды: сначала карточки, затем короткие блоки
    // одной ширины (календарь + избранное + сводка) — они встают в один ряд, и лишь
    // потом полноширинные «Ставки» и «История сделок». Иначе полноширинный блок
    // сразу после календаря «запечатывал» бы ряд, оставляя справа дыру в 8 колонок
    // (жадный masonry не поднимает более поздние блоки выше уже уложенных).
    // html — ЛЕНИВЫЙ (htmlFn): для скрытых блоков разметка не собирается вовсе.
    // defHidden: true — опт-ин блоки (KPI, график капитала, карта, новости, заметки):
    // появляются только с полки «Добавить блок», существующие раскладки не трогают.
    // R9.2: блоки, которые рисуют кнопки виджета САМИ — внутри своей шапки, слева от
    // собственных контролов (сортировка / «Ребалансировать»). Угловой хром pfdBodyHtml
    // им не ставится. Тот же приём, что у «Избранного» и «Ставок» (свой глаз в шапке).
    // Терминал (trade:*) здесь же: его правый угол занят лупой/счётом, угловой
    // оверлей ложился ПОВЕРХ них — кнопки встают в поток шапки ПЕРЕД этим контентом.
    var PFD_OWN_CHROME = { plist: 1, pdetail: 1, 'trade:ob': 1, 'trade:ticket': 1, 'trade:orders': 1, 'trade:chart': 1 };
    // слоты бумаг (trade:ob:2, trade:ticket:3…) — те же карточки терминала, только
    // с номером: свой хром в шапке им нужен ровно так же, как первому слоту
    function pfdOwnChrome(id) { return !!(PFD_OWN_CHROME[id] || /^trade:(ob|ticket|chart):\d+$/.test(id)); }
    // id блоков слота: первый исторически без суффикса (старые раскладки живы)
    function pftObId(n) { return +n === 1 ? 'trade:ob' : 'trade:ob:' + n; }
    function pftTkId(n) { return +n === 1 ? 'trade:ticket' : 'trade:ticket:' + n; }
    function pftChId(n) { return +n === 1 ? 'trade:chart' : 'trade:chart:' + n; }
    function pftSlotOf(id) {
        var m = /^trade:(?:ob|ticket|chart)(?::(\d+))?$/.exec(id);
        return m ? (+m[1] || 1) : 0;
    }
    // все блоки слота: пара «стакан + заявка» плюс необязательный график свечей
    function pftSlotIds(n) { return [pftObId(n), pftTkId(n), pftChId(n)]; }
    // Новая бумага в терминал: показываем ОБА блока слота и ставим их сразу за
    // блоками предыдущего — иначе стакан улетал в конец сетки, отдельно от
    // своего тикета, и пару приходилось собирать драгом руками.
    PF.pfdAddTradeSlot = function (n, quiet) {
        var ids = [pftObId(n), pftTkId(n)];
        pfdPushUndo();
        PF.dashCfg.order = PF.dashCfg.order || [];
        PF.dashCfg.span = PF.dashCfg.span || {};
        // за каким блоком встать: последний известный блок терминала
        var after = -1;
        PF.dashCfg.order.forEach(function (id, i) { if (pftSlotOf(id)) after = i; });
        ids.forEach(function (id, k) {
            PF.dashCfg.hidden[id] = 0;
            PF.dashCfg.span[id] = 4;
            var at = PF.dashCfg.order.indexOf(id);
            if (at >= 0) PF.dashCfg.order.splice(at, 1);
            if (after >= 0) PF.dashCfg.order.splice(after + 1 + k, 0, id);
            else PF.dashCfg.order.push(id);
        });
        saveDashCfg();
        pfdRerender();
        pfdScrollToBlock(ids[0]);
        // из пикера пачкой — тост общий, свой был бы вторым подряд
        if (!quiet) toast('Добавлены стакан и заявка — выберите бумагу в поиске');
    };
    // пара кнопок блока в поток шапки: настройки виджета + удалить. Поповер настроек
    // якорится к .pfd-item (см. pfdCfgMount), поэтому от места кнопки не зависит.
    function pfdInChromeHtml(id) {
        return '<span class="pfd-inchrome">' +
            '<button type="button" class="pfd-inbtn" title="Настройки виджета" aria-label="Настройки виджета" onclick="pfdCfgOpen(\'' + jsArg(id) + '\', event)">' + PFDCFG_GEAR_SVG + '</button>' +
            '<button type="button" class="pfd-inbtn danger" title="Удалить виджет (вернуть — кнопка «Виджет» в шапке)" aria-label="Удалить виджет" onclick="pfdHideBlock(\'' + jsArg(id) + '\')">' + PF.NOTE_TRASH_SVG + '</button>' +
        '</span>';
    }
    function pfdBlocks(favStr, noBonds) {
        var blocks = [];
        var narrow = PF.cardViewMode === 'narrow';
        var defSpan = narrow ? 4 : 6;
        visibleItems().forEach(function (p, i) {
            // col-right/col-mid не передаём: в свободной сетке колонка блока заранее
            // неизвестна, график всегда выезжает вправо от карточки
            blocks.push({ id: 'pf:' + p.id, name: p.name, htmlFn: function () { return PF.cardHtml(p, i, false, narrow, false); }, span: defSpan });
        });
        // R9.2: СКРЫТЫЙ портфель на СВОЕЙ вкладке карточку сохраняет — «скрыть»
        // убирает его с «Обзора» и из сводок, но открытая вкладка живёт дальше
        if (pfxIsPfTab(PF.dashTab)) {
            var tp = findPf(PF.dashTab.slice(3));
            if (tp && tp.hidden) blocks.push({ id: 'pf:' + tp.id, name: tp.name, htmlFn: function () { return PF.cardHtml(tp, Math.max(0, PF.store.items.indexOf(tp)), false, narrow, false); }, span: defSpan });
        }
        blocks.push({ id: 'cal', name: noBonds ? 'Ставки' : 'Календарь выплат', htmlFn: function () { return noBonds ? PF.ratesStackHtml(true, 1, true, 'cal') : PF.paymentCalendarHtml(true, 1, PF.dashTab === 'divs'); }, span: defSpan });
        // обёртка .pf-topgrid-fav сохраняет прицельные стили правой колонки
        // (одноколоночный .pff-grid и т.п.) и в свободной сетке
        blocks.push({ id: 'fav', name: 'Избранное', htmlFn: function () { return '<div class="pf-topgrid-fav pfd-favwrap">' + favStr + '</div>'; }, span: defSpan });
        if (PF.store.items.length >= 2) {
            blocks.push({ id: 'sum', name: 'Сводка', htmlFn: function () { return '<div class="pf-topgrid-fav pfd-favwrap">' + PF.summaryCardHtml() + '</div>'; }, span: defSpan });
        }
        // виджет «Панель управления» (id 'panel') удалён из набора: с R7 панель — постоянный
        // герой-шапка вкладки (pfxHeroHtml), добавлять её на дашборд отдельно больше не нужно
        blocks.push({ id: 'kpi:cap', name: 'KPI · Капитал', htmlFn: function () { return PF.pfdKpiHtml('cap'); }, span: 4, defHidden: true });
        blocks.push({ id: 'kpi:day', name: 'KPI · За сегодня', htmlFn: function () { return PF.pfdKpiHtml('day'); }, span: 4, defHidden: true });
        blocks.push({ id: 'kpi:next', name: 'KPI · Ближайшая выплата', htmlFn: function () { return PF.pfdKpiHtml('next'); }, span: 4, defHidden: true });
        blocks.push({ id: 'cap', name: 'График капитала · линия', htmlFn: function () { return PF.pfdCapChartHtml(); }, span: defSpan, defHidden: true });
        blocks.push({ id: 'cap2', name: 'График капитала · столбцы', htmlFn: function () { return PF.pfdCapChartHtmlB(); }, span: defSpan, defHidden: true });
        blocks.push({ id: 'alloc', name: 'Распределение активов', htmlFn: function () { return PF.pfdAllocHtml(); }, span: 4, defHidden: true });
        blocks.push({ id: 'heat', name: 'Карта рынка', htmlFn: PF.pfdHeatHtml, span: defSpan, defHidden: true });
        blocks.push({ id: 'news', name: 'Новости по позициям', htmlFn: PF.pfdNewsHtml, span: defSpan, defHidden: true });
        // R7: новые виджеты (используются и на подвкладках, и добавляются на «Обзор» из пикера)
        blocks.push({ id: 'divs', name: 'Дивиденды и купоны', htmlFn: PF.pfwDivsHtml, span: 4, defHidden: true });
        // месячная сетка выплат — отдельный виджет рядом со списочным «Календарём выплат» (cal)
        blocks.push({ id: 'calm', name: 'Календарь · месяц', htmlFn: function () { return PF.pfcmCardHtml(); }, span: 4, defHidden: true });
        blocks.push({ id: 'assets', name: 'Список активов', htmlFn: PF.pfwAssetsHtml, span: 4, defHidden: true });
        blocks.push({ id: 'broker', name: 'Позиции у брокера', htmlFn: PF.pfwBrokerHtml, span: 4, defHidden: true });
        blocks.push({ id: 'ops', name: 'Последние операции', htmlFn: PF.pfwOpsHtml, span: 4, defHidden: true });
        blocks.push({ id: 'yield', name: 'Доходность портфелей', htmlFn: PF.pfwYieldHtml, span: 4, defHidden: true });
        blocks.push({ id: 'snaps', name: 'Снимки капитала', htmlFn: PF.pfwSnapsHtml, span: 4, defHidden: true });
        blocks.push({ id: 'movers', name: 'Лидеры дня', htmlFn: PF.pfwMoversHtml, span: 4, defHidden: true });
        blocks.push({ id: 'idx', name: 'Рынок сейчас', htmlFn: PF.pfwIdxHtml, span: 4, defHidden: true });
        blocks.push({ id: 'passive', name: 'Пассивный доход', htmlFn: PF.pfwPassiveHtml, span: 4, defHidden: true });
        blocks.push({ id: 'conc', name: 'Диверсификация', htmlFn: PF.pfwConcHtml, span: 4, defHidden: true });
        // R8: виджеты подвкладок (референс-скрин «Мои портфели» и карточки настроек);
        // доступны из пикера на ЛЮБОЙ подвкладке, сиды включают их на своих
        // «Список портфелей», не «Мои портфели»: подвкладка теперь сама зовётся
        // «Мои портфели» — одноимённый виджет внутри читался бы тавтологией (R9.3)
        blocks.push({ id: 'plist', name: 'Список портфелей', htmlFn: PF.pfwPlistHtml, span: 12, defHidden: true });
        blocks.push({ id: 'pstruct', name: 'Структура по портфелям', htmlFn: PF.pfwPstructHtml, span: 6, defHidden: true });
        blocks.push({ id: 'psum', name: 'Сводные показатели', htmlFn: PF.pfwPsumHtml, span: 6, defHidden: true });
        blocks.push({ id: 'pdetail', name: 'Составы портфелей', htmlFn: PF.pfxTabPortsHtml, span: 12, defHidden: true });
        blocks.push({ id: 'reports', name: 'Отчёты и экспорт', htmlFn: PF.pfwReportsHtml, span: 6, defHidden: true });
        blocks.push({ id: 'set:corner', name: 'Отображение карточек', htmlFn: function () { return PF.pfxSetCardHtml('Отображение карточек', 'скругление углов виджетов и карточек', PF.pfxCornerRowHtml(true)); }, span: 6, defHidden: true });
        blocks.push({ id: 'set:bg', name: 'Фон страницы', htmlFn: function () { return PF.pfxSetCardHtml('Фон страницы', 'общая подложка сайта под карточками', PF.pfxBgRowHtml(true)); }, span: 6, defHidden: true });
        blocks.push({ id: 'set:vis', name: 'Видимость', htmlFn: function () { return PF.pfxSetCardHtml('Видимость', 'какие портфели и секции показывать', PF.pfxVisRowsHtml()); }, span: 6, defHidden: true });
        blocks.push({ id: 'set:layout', name: 'Раскладки', htmlFn: pfwLayoutCardHtml, span: 6, defHidden: true });
        // каждая заметка — свой блок note:<id> (мультизаметки, «+» плодит новые)
        (PF.dashCfg.notes || []).forEach(function (nt) {
            blocks.push({ id: 'note:' + nt.id, name: 'Заметка', htmlFn: function () { return PF.pfdNoteHtml(nt); }, span: 4, isNote: true });
        });
        if (!noBonds) blocks.push({ id: 'rates', name: 'Ставки', htmlFn: function () { return PF.ratesHtml('rates'); }, span: 12 });
        // «История сделок»: на подвкладке «Операции» — полноэкранный журнал (asPage)
        var tr = PF.tradesHtml(PF.dashTab === 'ops');
        if (tr) blocks.push({ id: 'trades', name: 'История сделок', htmlFn: function () { return tr; }, span: 12 });
        // «Торговля»: карточки терминала — блоки ТОЛЬКО этой подвкладки (в пикер
        // других вкладок не попадают). isTrade освобождает их от опт-ин ниже
        // (видимы по умолчанию), но chrome у них полный, как у всех виджетов:
        // шестерёнка + корзина; удалённая карточка возвращается из «Добавить блок»
        // Слот — пара «стакан + тикет» по ОДНОЙ бумаге; их может быть несколько
        // (trade:ob:2 и т.д.), номер живёт в id блока. Имя блока называет бумагу:
        // «Стакан» и «Стакан» рядом друг от друга не отличить.
        if (PF.dashTab === 'trading' && PF.pftObCard) {
            (PF.pftSlotNums ? PF.pftSlotNums() : [1]).forEach(function (n) {
                blocks.push({ id: pftObId(n), name: PF.pftSlotLabel('ob', n),
                    htmlFn: function () { return PF.pftObCard(n); }, span: 4, isTrade: true });
                blocks.push({ id: pftTkId(n), name: PF.pftSlotLabel('ticket', n),
                    htmlFn: function () { return PF.pftTicketCard(n); }, span: 4, isTrade: true });
                // График свечей — опциональный третий блок слота: тяжелее пары
                // «стакан + заявка» (canvas, история свечей), поэтому включается
                // руками, а не появляется с каждой новой бумагой
                if (PF.pfcChartCard) {
                    blocks.push({ id: pftChId(n), name: PF.pftSlotLabel('chart', n),
                        htmlFn: function () { return PF.pfcChartCard(n); }, span: 8, isTrade: true, defHidden: true });
                }
            });
            blocks.push({ id: 'trade:orders', name: 'Мои заявки', htmlFn: PF.pftOrdersCard, span: 4, isTrade: true });
        }
        // R8: на подвкладках ВСЕ блоки опт-ин — что показано, решает сид (hidden[id]=0)
        // и пользователь через пикер; дефолтно-видимых блоков там нет (включая новые
        // карточки портфелей pf:*, которые на «Обзоре» видимы по умолчанию)
        if (PF.dashTab !== 'overview') blocks.forEach(function (b) { if (!b.isNote && !b.isTrade) b.defHidden = true; });
        return blocks;
    }
    // скрыт ли блок: явный выбор пользователя (cfg.hidden) главнее дефолта блока
    function pfdIsHidden(b) {
        var m = PF.dashCfg.hidden || {};
        return Object.prototype.hasOwnProperty.call(m, b.id) ? !!m[b.id] : !!b.defHidden;
    }
    var PFD_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    // Порог перехода «Панели управления» полоса → герой-колонка (px). Совпадает с натуральной
    // высотой колонки (идентити+KPI+кнопки+отступы) — тогда переход бесшовный: ниже порога
    // min-height ужимает панель плавно до ~84px, выше — колонка заполняет высоту.
    var PFD_PANEL_TALL = 320;
    // мини-эскизы блоков для полки «Добавить блок» — не рендерим тяжёлый настоящий блок,
    // а показываем узнаваемый набросок (карточка + характерная графика)
    var PV_CARD = '<rect x="6" y="7" width="108" height="46" rx="9" class="pv-card"/>';
    var PFD_PV = {
        kpi: '<svg viewBox="0 0 120 60" class="pfd-pv-svg">' + PV_CARD + '<circle cx="96" cy="22" r="8" class="pv-accent"/><rect x="18" y="16" width="40" height="13" rx="3.5" class="pv-strong"/><rect x="18" y="35" width="56" height="6" rx="3" class="pv-soft"/></svg>',
        cap: '<svg viewBox="0 0 120 60" class="pfd-pv-svg">' + PV_CARD + '<path d="M16 43 L34 35 L52 39 L70 25 L88 29 L104 17 L104 47 L16 47 Z" class="pv-area"/><path d="M16 43 L34 35 L52 39 L70 25 L88 29 L104 17" class="pv-stroke"/></svg>',
        heat: '<svg viewBox="0 0 120 60" class="pfd-pv-svg">' + PV_CARD + '<rect x="14" y="15" width="30" height="30" rx="3" class="pv-pos"/><rect x="48" y="15" width="24" height="17" rx="3" class="pv-neg"/><rect x="48" y="34" width="24" height="11" rx="3" class="pv-pos2"/><rect x="76" y="15" width="30" height="13" rx="3" class="pv-neg2"/><rect x="76" y="30" width="30" height="15" rx="3" class="pv-pos"/></svg>',
        news: '<svg viewBox="0 0 120 60" class="pfd-pv-svg">' + PV_CARD + '<circle cx="18" cy="21" r="4" class="pv-accent"/><rect x="28" y="17" width="58" height="5" rx="2.5" class="pv-soft"/><rect x="28" y="25" width="34" height="4" rx="2" class="pv-line2"/><circle cx="18" cy="39" r="4" class="pv-accent"/><rect x="28" y="35" width="58" height="5" rx="2.5" class="pv-soft"/><rect x="28" y="43" width="42" height="4" rx="2" class="pv-line2"/></svg>',
        note: '<svg viewBox="0 0 120 60" class="pfd-pv-svg">' + PV_CARD + '<rect x="6" y="14" width="4" height="32" rx="2" class="pv-accent"/><rect x="22" y="15" width="38" height="6" rx="3" class="pv-soft"/><circle cx="24" cy="32" r="4" class="pv-ring"/><rect x="34" y="29" width="48" height="5" rx="2.5" class="pv-line2"/><rect x="22" y="41" width="60" height="5" rx="2.5" class="pv-line2"/></svg>',
        gen: '<svg viewBox="0 0 120 60" class="pfd-pv-svg">' + PV_CARD + '<rect x="18" y="16" width="50" height="7" rx="3" class="pv-soft"/><rect x="18" y="30" width="84" height="5" rx="2.5" class="pv-line2"/><rect x="18" y="40" width="70" height="5" rx="2.5" class="pv-line2"/></svg>'
    };
    function pfdBlockPreviewSvg(id) {
        if (id === '__note' || id.indexOf('note') === 0) return PFD_PV.note;
        if (id.indexOf('kpi:') === 0) return PFD_PV.kpi;
        if (id === 'cap') return PFD_PV.cap;
        if (id === 'heat') return PFD_PV.heat;
        if (id === 'news') return PFD_PV.news;
        return PFD_PV.gen;
    }
    var PFD_PICK_DESC = {
        'panel': 'Полоса управления: KPI и все кнопки страницы одним блоком',
        'kpi:cap': 'Суммарный капитал и прибыль по всем портфелям',
        'kpi:day': 'Изменение стоимости за сегодня',
        'kpi:next': 'Ближайшая купонная или дивидендная выплата',
        'cap': 'Стоимость всех портфелей по дням — плавной линией',
        'cap2': 'Стоимость всех портфелей по дням — дневными столбцами',
        'fam:cap': 'Стоимость всех портфелей по дням — 2 дизайна на выбор',
        'alloc': 'Доли акций, облигаций и кэша — по портфелю или по всем сразу',
        'heat': 'Тепловая карта индекса Мосбиржи — размер по весу, цвет за день',
        'news': 'Свежие новости по бумагам ваших портфелей',
        '__note': 'Заметки, списки задач и сроки прямо на дашборде',
        'trade:ob': 'Биржевой стакан по оси цены — клик подставляет цену в заявку',
        'trade:ticket': 'Заявка: лимитная, рыночная или стоп, с предохранителями',
        'trade:orders': 'Активные и стоп-заявки счёта: статус, исполнение, отмена',
        '__trade': 'Второй стакан и заявка по другому тикеру — рядом с первым'
    };
    // цветные иконки-плитки строк списка «Блоки для дашборда» (как в макете): узнаваемая
    // пиктограмма + мягкая тонировка по типу блока
    var PFD_ICO_KPI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="6.5" y="12" width="3" height="6" rx="1"/><rect x="11.5" y="8.5" width="3" height="9.5" rx="1"/><rect x="16.5" y="5" width="3" height="13" rx="1"/></svg>';
    var PFD_ICO_CAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="6 14 10 10 14 12 20 5.5"/></svg>';
    var PFD_ICO_HEAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="10" rx="1.7"/><rect x="13" y="3" width="8" height="6" rx="1.7"/><rect x="13" y="11" width="8" height="10" rx="1.7"/><rect x="3" y="15" width="8" height="6" rx="1.7"/></svg>';
    var PFD_ICO_NEWS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h12.5v13H5.5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M16.5 8.5H19a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5"/><path d="M7 9h6.5M7 12.5h6.5M7 16h4"/></svg>';
    var PFD_ICO_ALLOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.2"/><path d="M12 3.8v8.2l6 5.4"/></svg>';
    // {ic, t} для строки списка: иконка + класс тонировки (tint-*)
    function pfdPickMeta(id) {
        if (id === '__note' || id.indexOf('note:') === 0) return { ic: PF.NOTE_ICON_SVG, t: 'violet' };
        if (id.indexOf('kpi:') === 0) return { ic: PFD_ICO_KPI, t: 'indigo' };
        if (id === 'cap' || id === 'cap2' || id === 'fam:cap') return { ic: PFD_ICO_CAP, t: 'blue' };
        if (id === 'alloc') return { ic: PFD_ICO_ALLOC, t: 'violet' };
        if (id === 'heat') return { ic: PFD_ICO_HEAT, t: 'green' };
        if (id === 'news') return { ic: PFD_ICO_NEWS, t: 'amber' };
        if (id === 'panel') return { ic: PF.PFDGRID_SVG, t: 'indigo' };
        return { ic: PF.PFDGRID_SVG, t: 'blue' };
    }
    // ---- список «Блоки для дашборда»: строка = иконка + название + описание, превью справа ----
    // Скрытые блоки в дашборде отсутствуют → живая копия в выпадашке — единственная в
    // #pfWrap, её и наполняют штатные PF.pfdHeatRepaintSoon/PF.renderPosNews (карта/новости).
    // Заметку показываем ПРИМЕРОМ (это пользовательский контент, «скрытой» заметки нет).
    var pfdShelfBlocks = [];    // стэш скрытых блоков {id,name,htmlFn} из pfdBodyHtml
    var pfdPickerOpen = false;
    function pfdNoteExampleHtml() {
        return '<div class="dash2-card pf-card2 pf-noteblk pfnt-c-amber pfnt-fill-edge">' +
            '<div class="pf-ch pfnt-head"><div class="pf-ch-l">' +
                '<span class="pfnt-colorwrap"><span class="pfnt-badge">' + PF.NOTE_ICON_SVG + '</span></span>' +
                '<span class="pfnt-title">Заметка</span></div></div>' +
            '<div class="pfnt-list">' +
                '<div class="pfnt-row pfnt-row--text"><div class="pfnt-tx">Идеи и план по портфелю</div></div>' +
                '<div class="pfnt-row pfnt-row--bullet"><span class="pfnt-dash"></span><div class="pfnt-tx">Докупить ОФЗ на просадке</div></div>' +
                '<div class="pfnt-row pfnt-row--check done"><span class="pfnt-check on">' + PF.NOTE_CHECK_SVG + '</span><div class="pfnt-tx">Ребаланс раз в квартал</div></div>' +
            '</div>' +
            '<div class="pfnt-duewrap"><div class="pfnt-due set soon"><span class="pfnt-due-ic">' + PF.NOTE_CLOCK_SVG + '</span>' +
                '<span class="pfnt-due-main"><span class="pfnt-due-date">через 3 дня</span><span class="pfnt-cd-static">осталось 3 дн</span></span></div></div>' +
        '</div>';
    }
    function pfdShelfBlockById(id) { return pfdShelfBlocks.filter(function (b) { return b.id === id; })[0] || null; }
    // «портфели не собраны» = нет вложений/стоимости ни в одном (пустые портфели): живые
    // блоки были бы пустыми → показываем примеры. invested берётся из лотов, не зависит от
    // живых котировок, поэтому проверка надёжна и без сети.
    function pfdPickNoPf() { return !visibleItems().some(function (p) { var c = calcPf(p); return c && (c.invested > 0 || c.value > 0); }); }
    // демо-данные для превью ПУСТОГО портфеля — настоящие блоки с примерными числами
    var PFD_DEMO_KPI = { inv: 850000, val: 921800, dd: 6240, hasDd: true, mv: { t: 'LKOH', chg: 1.8 },
        ev: { amount: 2444, ticker: 'SU26243RMFS4', date: new Date(Date.now() + 26 * 86400000) } };
    function pfdDemoCapSeries() {
        var base = 720000, out = [], now = new Date(), vals = [0, 6, 3, 11, 9, 17, 14, 22, 19, 27, 31, 28, 36, 42];
        for (var i = 0; i < vals.length; i++) {
            var d = new Date(now.getTime() - (vals.length - 1 - i) * 86400000);
            out.push({ d: d.getFullYear() + '-' + PF.pfd2(d.getMonth() + 1) + '-' + PF.pfd2(d.getDate()), v: base + vals[i] * 5200 });
        }
        return out;
    }
    function pfdNewsDemoHtml() {
        var demo = [
            { tk: 'SBER', title: 'Сбербанк отчитался о рекордной квартальной прибыли', meta: 'Smart-Lab · 2 ч назад' },
            { tk: 'LKOH', title: 'ЛУКОЙЛ рекомендовал дивиденды выше ожиданий рынка', meta: 'РБК · 5 ч назад' },
            { tk: 'GAZP', title: 'Газпром нарастил экспорт по итогам месяца', meta: 'Smart-Lab · вчера' }
        ];
        var rows = demo.map(function (x) {
            return '<div class="pfnw-item link">' +
                '<span class="pfnw-item-tkbtn"><span class="pfnw-item-tk">' + x.tk + '</span></span>' +
                '<div class="pfnw-item-news"><div class="pfnw-item-news-inner">' +
                    '<span class="pfnw-item-title">' + esc(x.title) + '</span>' +
                    '<span class="pfnw-item-meta"><i>' + esc(x.meta) + '</i></span>' +
                '</div></div>' +
            '</div>';
        }).join('');
        return '<div class="dash2-card pf-card2 pf-newsblk">' +
            PF.pfCardHead('', 'Новости по позициям', 'наведите бумагу — новость раскроется, нажмите — откроется') +
            '<div class="pfnw-body"><div class="pfnw-list">' + rows + '</div></div></div>';
    }
    // превью справа: БЕЗ белой шапки — сразу готовый блок, а в углу плашка-статус
    // («Демо» — данных нет/недостаточно, показан пример; «Live» — реальные данные рынка/портфеля).
    // достаточно ли РЕАЛЬНЫХ данных у блока для «живого» превью (иначе рисуем демо, даже когда
    // портфель уже собран): график — ≥2 точек; «за сегодня» — есть дневной снимок; «ближайшая
    // выплата» — есть событие; новости — есть загруженная новость по позиции; капитал/карта — всегда.
    function pfdWidgetHasRealData(id) {
        if (id === 'heat' || id === 'kpi:cap') return true;
        if (id === 'kpi:day') return PF.store.items.some(function (p) { return dayDelta(p, calcPf(p).value) != null; });
        if (id === 'kpi:next') return PF.collectUpcomingPayouts().length > 0;
        if (id === 'cap' || id === 'cap2') return PF.pfdCapSeries().length >= 2;
        if (id === 'alloc') return PF.pfdAllocCompute(PF.pfdAllocScope()).total > 0;
        if (id === 'news') return PF.pfdNewsList().some(function (x) { var e = PF.newsHtmlCache[x.tk]; return e && e.html; });
        return true;
    }
    function pfdPickPvHtml(id, name, noPf) {
        // «Live» — данные реальные; «Демо» — данных нет/недостаточно, показываем пример.
        var real = !noPf && pfdWidgetHasRealData(id), stage = '', live = false;
        if (id === '__note') { stage = pfdNoteExampleHtml(); }                              // заметка — всегда образец
        else if (id === 'heat') { stage = PF.pfdHeatHtml(); live = true; }                    // карта рынка живая всегда (не зависит от портфеля)
        else if (id === 'cap') { stage = PF.pfdCapChartHtml(real ? null : pfdDemoCapSeries()); live = real; }    // линия
        else if (id === 'cap2') { stage = PF.pfdCapChartHtmlB(real ? null : pfdDemoCapSeries()); live = real; }  // столбцы
        else if (id === 'alloc') {
            stage = real ? PF.pfdAllocHtml() : PF.pfdAllocHtml({ stock: 620000, bond: 410000, cash: 70000 });
            live = real;
        } else if (real) {
            var b = pfdShelfBlockById(id); stage = b ? b.htmlFn() : ''; live = true;        // собран портфель И данных достаточно
        } else {
            // портфель не собран ИЛИ у блока ещё нет данных → показываем ДЕМО вместо пустого live
            if (id.indexOf('kpi:') === 0) stage = PF.pfdKpiHtml(id.slice(4), PFD_DEMO_KPI);
            else if (id === 'news') stage = pfdNewsDemoHtml();
            else { var b2 = pfdShelfBlockById(id); stage = b2 ? b2.htmlFn() : ''; }
        }
        return '<div class="pfd-pick-stage">' +
            '<span class="pfd-pick-tag ' + (live ? 'live' : 'demo') + '">' + (live ? 'Live' : 'Демо') + '</span>' + stage +
        '</div>';
    }
    // строка списка: цветная иконка-плитка + имя + описание; клик/наведение выбирает блок
    // и показывает его превью справа (добавление — тёмной кнопкой в превью, а не по строке)
    function pfdPickRow(id, name) {
        var desc = PFD_PICK_DESC[id] || '';
        var m = pfdPickMeta(id);
        var arg = jsArg(id);
        return '<div class="pfd-pick" data-pick="' + esc(id) + '" role="button" tabindex="0" ' +
            'title="Показать превью — добавить кнопкой справа" ' +
            'onmouseenter="pfdPickPreview(\'' + arg + '\')" onfocus="pfdPickPreview(\'' + arg + '\')" onclick="pfdPickPreview(\'' + arg + '\')">' +
            '<span class="pfd-pick-ic tint-' + m.t + '">' + m.ic + '</span>' +
            '<div class="pfd-pick-txt"><b>' + esc(name) + '</b>' + (desc ? '<span>' + esc(desc) + '</span>' : '') + '</div>' +
        '</div>';
    }
    // Семейства виджетов — несколько ДИЗАЙНОВ одного блока (напр. график капитала: линия/
    // столбцы). В списке — одна строка семейства; в превью дизайны идут СТОПКОЙ, каждый со
    // своей кнопкой «Добавить». Так можно добавить один дизайн или оба (это отдельные блоки).
    // Расширяется просто: добавить вариант в variants — в превью появится ещё одна карточка.
    var PFD_FAMILIES = [
        { key: 'cap', name: 'График капитала', variants: [
            { id: 'cap',  label: 'Линия',   desc: 'Плавная линия и область под ней' },
            { id: 'cap2', label: 'Столбцы', desc: 'Дневные столбцы стоимости' }
        ] }
    ];
    function pfdFamilyByKey(k) { for (var i = 0; i < PFD_FAMILIES.length; i++) if (PFD_FAMILIES[i].key === k) return PFD_FAMILIES[i]; return null; }
    function pfdFamilyOfId(id) { for (var i = 0; i < PFD_FAMILIES.length; i++) { var f = PFD_FAMILIES[i]; for (var j = 0; j < f.variants.length; j++) if (f.variants[j].id === id) return f; } return null; }
    function pfdPickerInner() {
        var rows = [], seenFam = {};
        pfdShelfBlocks.forEach(function (b) {
            var fam = pfdFamilyOfId(b.id);
            if (fam) {                                   // варианты семейства сворачиваем в ОДНУ строку
                if (seenFam[fam.key]) return;
                seenFam[fam.key] = 1;
                rows.push(pfdPickRow('fam:' + fam.key, fam.name));
            } else {
                rows.push(pfdPickRow(b.id, b.name || b.id));
            }
        });
        rows.push(pfdPickRow('__note', 'Заметка'));
        return '<div class="pfd-picker-col">' +
                '<div class="pfd-picker-h"><b>Блоки для дашборда</b><span>Выберите блок — справа появится его превью</span></div>' +
                '<div class="pfd-picker-list">' + rows.join('') + '</div>' +
            '</div>' +
            '<div class="pfd-pickpv" id="pfdPickPv"></div>';
    }
    // выбранный в списке блок/семейство (для тёмной кнопки «Добавить на дашборд»)
    var pflSelectedId = null;
    // клик/наведение на строку → наполнить превью-сцену справа. Для семейства — стопка дизайнов.
    window.pfdPickPreview = function (id) {
        var pv = document.getElementById('pfdPickPv'); if (!pv) return;
        pflSelectedId = id;
        if (id.indexOf('fam:') === 0) pfdRenderFamilyPreview(pv, id.slice(4));
        else pfdRenderSinglePreview(pv, id);
        pv.classList.add('show');
        var host = document.getElementById('pflPanel');
        if (host) host.querySelectorAll('.pfd-pick').forEach(function (r) {
            r.classList.toggle('active', r.getAttribute('data-pick') === id);
        });
        // карта живая ВСЕГДА (реальный рынок); новости — только в живом режиме (в демо строки статичные)
        requestAnimationFrame(function () {
            try { if (document.querySelector('#pfdPickPv .pfhm-box')) PF.pfdHeatRepaintSoon(); } catch (e) {}
            try { if (document.querySelector('#pfdPickPv .pf-newsblk') && document.querySelector('#pfdPickPv .pfd-pick-tag.live')) PF.renderPosNews(); } catch (e) {}
        });
    };
    // одиночный блок: превью + подвал с названием и тёмной кнопкой добавления
    function pfdRenderSinglePreview(pv, id) {
        var noPf = pfdPickNoPf();
        var name = id === '__note' ? 'Заметка' : ((pfdShelfBlockById(id) || {}).name || id);
        var desc = PFD_PICK_DESC[id] || '';
        pv.innerHTML = pfdPickPvHtml(id, name, noPf) +
            '<div class="pfl-pv-foot">' +
                '<div class="pfl-pv-meta"><b>' + esc(name) + '</b>' + (desc ? '<span>' + esc(desc) + '</span>' : '') + '</div>' +
                '<button type="button" class="pfl-pv-add" onclick="pfdAddSelected()">' + PFD_PLUS_SVG + '<span>Добавить на дашборд</span></button>' +
            '</div>';
    }
    // семейство: дизайны СТОПКОЙ — каждый показан ЦЕЛИКОМ (крупное превью), карточка
    // ВЫБИРАЕТСЯ кликом (рамка), внизу ОДНА общая кнопка «Добавить виджет» добавляет
    // выбранный дизайн. Так видно оба варианта полностью, а не по обрезку с кнопкой у каждого.
    var pflFamPick = null;   // id выбранного дизайна семейства (для общей кнопки)
    function pfdRenderFamilyPreview(pv, key) {
        var fam = pfdFamilyByKey(key); if (!fam) { pv.innerHTML = ''; return; }
        var noPf = pfdPickNoPf();
        // выбор по умолчанию — ПЕРВЫЙ ещё не добавленный дизайн (если прежний сбит/добавлен)
        var avail = fam.variants.filter(function (v) { return PF.dashCfg.hidden[v.id] !== 0; });
        var famHas = fam.variants.some(function (v) { return v.id === pflFamPick; });
        if (!famHas || PF.dashCfg.hidden[pflFamPick] === 0) pflFamPick = (avail[0] || fam.variants[0]).id;
        var cards = fam.variants.map(function (v) {
            var added = PF.dashCfg.hidden[v.id] === 0;
            var sel = !added && v.id === pflFamPick;
            // без большой рамки/бейджа «Выбрано» (их было слишком много): одно превью-окно,
            // выбор — тонкое кольцо + маленькая галочка в углу, подпись обычным текстом
            return '<div class="pfl-choice' + (added ? ' added' : '') + (sel ? ' selected' : '') + '" ' +
                (added ? '' : 'role="button" tabindex="0" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfdFamPick(\'' + jsArg(v.id) + '\')" ') + '>' +
                '<div class="pfl-choice-pv">' + pfdPickPvHtml(v.id, v.label, noPf) +
                    (sel || added ? '<span class="pfl-choice-tick' + (added ? ' is-added' : '') + '">' + PF.CHECK_SVG + '</span>' : '') +
                '</div>' +
                '<div class="pfl-choice-cap"><b>' + esc(v.label) + '</b><span>' + esc(v.desc) + (added ? ' · на дашборде' : '') + '</span></div>' +
            '</div>';
        }).join('');
        var allAdded = avail.length === 0;
        pv.innerHTML = '<div class="pfl-fam">' +
            '<div class="pfl-fam-h"><b>' + esc(fam.name) + '</b><span>Оба дизайна показаны целиком — выберите нужный</span></div>' +
            '<div class="pfl-fam-list">' + cards + '</div>' +
            '<div class="pfl-pv-foot">' +
                '<div class="pfl-pv-meta"><b>' + esc(fam.name) + '</b><span>' + (allAdded ? 'Оба дизайна уже на дашборде' : 'Выделите дизайн рамкой и добавьте') + '</span></div>' +
                (allAdded
                    ? '<span class="pfl-pv-add is-added">' + PF.CHECK_SVG + '<span>Добавлено</span></span>'
                    : '<button type="button" class="pfl-pv-add" onclick="pfdAddSelected()">' + PFD_PLUS_SVG + '<span>Добавить виджет</span></button>') +
            '</div>' +
        '</div>';
    }
    // выбор дизайна семейства (рамка): перерисовываем ТОЛЬКО превью (без ре-рендера панели —
    // фокус/список целы), затем перекрашиваем карту, если она в выбранной карточке
    window.pfdFamPick = function (id) {
        if (PF.dashCfg.hidden[id] === 0) return;   // добавленный дизайн не выбираем
        pflFamPick = id;
        var pv = document.getElementById('pfdPickPv'), fam = pfdFamilyOfId(id);
        if (pv && fam) {
            pfdRenderFamilyPreview(pv, fam.key);
            requestAnimationFrame(function () { try { if (document.querySelector('#pfdPickPv .pfhm-box')) PF.pfdHeatRepaintSoon(); } catch (e) {} });
        }
    };
    // добавить конкретный виджет (в т.ч. отдельный дизайн семейства); выбор в списке сохраняем,
    // чтобы после ре-рендера остаться на том же блоке/семействе (кнопка станет «Добавлено»)
    window.pfdAddWidget = function (id) {
        if (PF.dashCfg.hidden[id] === 0) return;   // уже на дашборде
        pfdPushUndo();
        delete PF.dashCfg.cleared;   // одноразовый призрак «после очистки» уходит
        PF.dashCfg.hidden[id] = 0;
        // «Панель управления» — всегда верхней полосой во всю ширину: в НАЧАЛО порядка, span 12
        if (id === 'panel') {
            PF.dashCfg.order = (PF.dashCfg.order || []).filter(function (x) { return x !== 'panel'; });
            PF.dashCfg.order.unshift('panel');
            PF.dashCfg.span = PF.dashCfg.span || {}; PF.dashCfg.span.panel = 12;
            PF.dashCfg.col = PF.dashCfg.col || {}; PF.dashCfg.col.panel = 1;
        }
        saveDashCfg();
        pfdRerender();
        pfdScrollToBlock(id);
        toast(id === 'panel' ? 'Панель управления добавлена' : 'Блок добавлен на дашборд');
    };
    // тёмная кнопка «Добавить виджет»: для семейства — добавляет ВЫБРАННЫЙ дизайн (pflFamPick),
    // для одиночного блока — сам блок; затем ре-рендер и выбор следующего
    window.pfdAddSelected = function () {
        var id = pflSelectedId;
        if (id && id.indexOf('fam:') === 0) {          // семейство — добавляем выбранный дизайн
            if (pflFamPick && PF.dashCfg.hidden[pflFamPick] !== 0) pfdAddWidget(pflFamPick);
            return;
        }
        if (!id) return;
        if (id === '__note') { pfdAddNote(); return; }
        pfdAddWidget(id);
        pflSelectedId = null;   // блок ушёл со списка → pflInitPreview выберет следующий
    };
    // R7: после ре-рендера пикера чистим выбор от виджетов, которых в каталоге больше нет
    // (админ спрятал / портфелей стало меньше). Выбор МНОЖЕСТВЕННЫЙ и переживает смену
    // категории/поиска — набирать пачку можно из разных разделов, поэтому фильтруем по
    // ПОЛНОМУ каталогу (pfl2Visible), а не по видимому списку (pfl2Filtered).
    function pflInitPreview() {
        if (!dq('pflPanel')) return;
        var ok = {};
        pfl2Visible().forEach(function (w) { ok[w.id] = 1; });
        var kept = pfl2SelIds.filter(function (id) { return ok[id]; });
        if (kept.length === pfl2SelIds.length && (!pfl2Sel || ok[pfl2Sel])) return;
        pfl2SelIds = kept;
        if (!pfl2Sel || !ok[pfl2Sel]) pfl2Sel = kept.length ? kept[kept.length - 1] : null;
        pfl2Paint(['main', 'set', 'foot']);
    }

    // Чипы готовых раскладок для теневых виджетов (обучающий призрак новой вкладки и
    // призрак после «Очистить»): до 4 вариантов текущей подвкладки из pfl3Options
    // (базовая/стандартная, ваша сохранённая, общие пресеты) — применяются одним кликом.
    function pfxgLaysHtml() {
        var chips = '', cnt = 0;
        try {
            pfl3Options().forEach(function (o) {
                if (!o.snap || cnt >= 4) return;
                cnt++;
                chips += '<button type="button" class="pfxg-lay" onclick="' + pfl3ApplyCall(o) + '" title="Применить раскладку «' + esc(o.name) + '»">' +
                    PF.PFDGRID_SVG + '<span>' + esc(o.name) + '</span></button>';
            });
        } catch (e) {}
        return chips ? '<div class="pfxg-lays"><span class="pfxg-lays-l">или готовая раскладка</span><div class="pfxg-lays-r">' + chips + '</div></div>' : '';
    }
    function pfdBodyHtml(favStr, noBonds) {
        var blocks = pfdBlocks(favStr, noBonds);
        var byId = {};
        blocks.forEach(function (b) { byId[b.id] = b; });
        var ordered = [];
        (PF.dashCfg.order || []).forEach(function (id) {
            if (byId[id]) { ordered.push(byId[id]); delete byId[id]; }
        });
        blocks.forEach(function (b) { if (byId[b.id]) ordered.push(b); });   // новые блоки — в конец
        var shown = [], hiddenB = [];
        ordered.forEach(function (b) { (pfdIsHidden(b) ? hiddenB : shown).push(b); });

        var items = shown.map(function (b) {
            var html = b.htmlFn();
            if (!html) return '';
            var span = clamp(+(PF.dashCfg.span[b.id]) || b.span, 3, 12);
            var h = +(PF.dashCfg.h[b.id]) || 0;
            var isPanel = b.id === 'panel';
            // низкий общий пол (72): ресайз сохраняет высоту только выше натуральной, поэтому
            // клампу нечего «поднимать» — а порог 240 раньше насильно раздувал компактные блоки
            var minH = 72;
            // Панель — контент-бар: заданная высота работает как МИНИМУМ (растёт под контент при
            // узкой ширине — кнопки не режутся), БЕЗ hset-клипа (меню/поповеры не обрезаются).
            var style = 'grid-column: span ' + span + ';' +
                (h ? ((isPanel ? 'min-height:' : 'height:') + clamp(h, minH, 1400) + 'px;') : '');
            var hsetClass = (h && !isPanel) ? ' pfd-hset' : '';
            // Высокая «Панель управления»: контент раскладывается по ВСЕЙ высоте (идентити сверху,
            // KPI акцентом, кнопки снизу), а не висит компактной группой в центре пустоты. Порог
            // PFD_PANEL_TALL ≈ натуральной высоте колонки — ниже него панель = компактная полоса
            // (сжимается плавно до ~84px), выше = герой-колонка (переход без «залипания»/наезда).
            if (isPanel && h >= PFD_PANEL_TALL) hsetClass += ' pfd-ptall';
            // Кнопка «скрыть/удалить» блока:
            //  • заметка / портфель — СВОЯ кнопка уже есть в шапке карточки (pfnt-trash / глаз .pfc-act),
            //    в chrome не дублируем;
            //  • ВИДЖЕТ (defHidden: KPI/график/карта/новости) — УДАЛИТЬ (корзина .pfd-cardrm ВНУТРИ
            //    карточки, как у заметки, по hover), вернётся из «Конструктор → Добавить блок»;
            //  • «Календарь выплат»/«Сводка» — СКРЫТЬ глазом .pfc-act В ШАПКЕ карточки (.pfd-eye,
            //    правый-верхний угол напротив заголовка, ТОЧНО как у портфеля, виден всегда),
            //    вернуть — через меню «Видимость» в шапке;
            //  • «Избранное» — свой глаз ВНУТРИ шапки, рядом с инфо-иконкой, по hover
            //    (см. favHtml/showHide) — угловой оверлей там наезжал на «+» → терминал;
            //  • «Ставки рынка» — свой глаз в последней плитке, по hover (см. PF.ratesHtml);
            //  • «История сделок» — своего on-card глаза НЕТ (правый угол шапки занят .pft-toggle);
            //    скрыть/показать — из меню «Видимость».
            var hideBtn = '';
            if (b.isNote || b.id.indexOf('pf:') === 0 || pfdOwnChrome(b.id)) {
                // R9.2: plist/pdetail/терминал рисуют кнопки блока САМИ — внутри своей
                // шапки, слева от собственных контролов (см. pfdInChromeHtml). Угловые
                // кнопки им не годились: у «Моих портфелей» они выдавливали сортировку
                // 78-px отступом, у «Составов» (шапки .pf-ch нет вовсе) падали прямо на
                // «Ребалансировать», а у терминала — на лупу и подпись счёта в углу.
                hideBtn = '';
            } else if (b.defHidden) {
                // корзина ВНУТРИ карточки (как у заметки .pfnt-trash): тихая иконка в правом-верхнем
                // углу шапки, проявляется по hover; у виджетов с контролами в шапке место освобождает
                // .pfd-rmable (padding-right), у KPI шапки нет — угол и так свободен.
                // Рядом — шестерёнка настроек виджета (тема/высота, у графика — вид/период):
                // открывает поповер .pfdcfg-pop прямо на блоке (см. pfdCfgOpen ниже)
                hideBtn = '<button class="pfd-cardcfg" title="Настройки виджета" aria-label="Настройки виджета" onclick="pfdCfgOpen(\'' + jsArg(b.id) + '\', event)">' + PFDCFG_GEAR_SVG + '</button>' +
                    '<button class="pfd-cardrm" title="Удалить виджет (вернуть — «Добавить блок» в Конструкторе)" aria-label="Удалить виджет" onclick="pfdHideBlock(\'' + jsArg(b.id) + '\')">' + PF.NOTE_TRASH_SVG + '</button>';
            } else if (b.id === 'cal' || b.id === 'sum') {
                // глаз-скрытие — ТОЧНО как в карточке портфеля (.pfc-act), в правом-верхнем углу
                // напротив заголовка, видимый постоянно (не в зазоре-бирке). Исключение: когда
                // блок cal показывает «Ставки рынка» (noBonds) — заголовка нет, а глаз сидит в
                // последней плитке (см. PF.ratesStackHtml), угловой оверлей не нужен.
                if (!(b.id === 'cal' && noBonds)) {
                    hideBtn = '<span class="pfd-eye"><button class="pfc-act" title="Скрыть блок (вернуть — «Видимость» в шапке)" aria-label="Скрыть блок" onclick="pfdHideBlock(\'' + jsArg(b.id) + '\')">' + PF.EYEOFF_SVG + '</button></span>';
                }
            }
            // «живой» chrome у КАЖДОГО блока сетки: НЕВИДИМАЯ полоса-хват по ВЕРХНЕЙ ГРАНИ
            // (.pfd-move — курсор сам «ладошка», за неё блок тянется, никакой бирки), кнопка
            // скрыть/удалить и три зоны ресайза (правая кромка/нижняя/уголок). Без текстового
            // бейджа размера и без native-подсказок (title) на кромках — подсказка ресайза
            // ТОЛЬКО курсором (↔/↕/⤡), никаких «туттипов» при перетаскивании грани.
            var chrome = '<div class="pfd-chrome">' +
                '<span class="pfd-move" aria-hidden="true"></span>' +
                hideBtn +
                '<span class="pfd-rs-l"></span>' +
                '<span class="pfd-rs-r"></span>' +
                '<span class="pfd-rs-b"></span>' +
                '<span class="pfd-rs"></span>' +
            '</div>';
            // тема виджета: тёмная плашка или «стекло» (полупрозрачная поверхность с бликом,
            // как у плиток тепловой карты) — см. .pfd-thm-* в portfolios-r7.css
            var thmV = (PF.dashCfg.thm || {})[b.id];
            var thmCls = thmV === 'dark' ? ' pfd-thm-dark' : thmV === 'glass' ? ' pfd-thm-glass' : '';
            return '<div class="pfd-item' + hsetClass + thmCls + (b.defHidden ? ' pfd-rmable' : '') + '" data-pfd="' + esc(b.id) + '" style="' + style + '">' +
                chrome +
                '<div class="pfd-body">' + html + '</div>' +
            '</div>';
        }).join('');

        // R9.1: обучающий «теневой виджет» на вкладке-портфеле — подсказывает про
        // пикер, пока пользователь ни разу его отсюда не открыл. Первый клик улетает
        // FAB-ом в правый нижний угол (pfxGhostClick) и больше призрак не показывается.
        // Обычный .pfd-item для masonry-пакера, но БЕЗ chrome (не тянется/не режется)
        // и вне PF.dashCfg.order (saveDashCfg его не знает и не сохранит).
        if (pfxIsPfTab(PF.dashTab) && shown.length && !PF.pfxFabSeen() && !PF.dashEdit && !PF.dashCfg.cleared) {
            // R9.3: подпись призрака подстраивается под состав портфеля вкладки —
            // облигационному предлагаем календарь выплат, акционному — лидеров дня
            var gsub = 'график капитала, календарь выплат, новости — соберите вкладку под себя';
            var gp = findPf(PF.dashTab.slice(3));
            if (gp) {
                var gc = calcPf(gp);
                var gB = gc.hs.some(function (x) { return x.h.type === 'bond'; });
                var gS = gc.hs.some(function (x) { return x.h.type !== 'bond'; });
                if (gB && !gS) gsub = 'календарь выплат, дивиденды и купоны, график капитала — соберите вкладку под облигации';
                else if (gS && !gB) gsub = 'лидеры дня, новости по позициям, карта рынка — соберите вкладку под акции';
                else if (gS && gB) gsub = 'распределение активов, календарь выплат, лидеры дня — соберите вкладку под себя';
            }
            // тот же блок чипов раскладок, что у призрака очистки: новую вкладку можно
            // собрать одним кликом, не открывая пикер (просьба 2026-07-17). Кнопка-пикер
            // теперь ВНУТРИ обёртки (в кнопку нельзя вкладывать кнопки-чипы); полёт
            // кометы не тронут — pfxGhostClick меряет closest('.pfd-item').
            items += '<div class="pfd-item pfxg-item" data-pfd="__ghost" style="grid-column: span 4;">' +
                '<div class="pfd-body"><div class="pfxg-ghost">' +
                    '<button type="button" class="pfxg-mainbtn" onclick="pfxGhostClick(event)" title="Открыть пикер виджетов">' +
                        '<span class="pfxg-plus">' + PFD_PLUS_SVG + '</span>' +
                        '<b>Добавить виджет</b>' +
                        '<i>' + gsub + '</i>' +
                    '</button>' +
                    // R10.1: мини-демо «двигайте и растягивайте» — две плитки-скелета в цикле
                    // меняются местами и тянут общий край, как настоящие виджеты за .pfd-move
                    // и .pfd-rs-l/-r; чистая CSS-анимация, кликов не ловит (pointer-events none)
                    '<div class="pfxg-demo" aria-hidden="true">' +
                        '<div class="pfxg-demo-stage"><span class="pfxg-dtile pfxg-dtile-a"></span><span class="pfxg-dtile pfxg-dtile-b"></span></div>' +
                        '<span class="pfxg-demo-t">виджеты живые: тяните за верхнюю грань — поменяются местами, за края — изменят размер</span>' +
                    '</div>' +
                    pfxgLaysHtml() +
                '</div></div>' +
            '</div>';
        }

        // R10: одноразовый теневой виджет после «Очистить подвкладку» (cfg.cleared):
        // портфели остались, остальное убрано — призрак предлагает открыть пикер или
        // применить готовую раскладку прямо на месте. Исчезает с первым добавленным
        // виджетом/раскладкой (delete cfg.cleared в pfdAddWidget/pfApplyPreset/…).
        if (PF.dashCfg.cleared && shown.length && !PF.dashEdit && !PF.pfl3Open) {
            items += '<div class="pfd-item pfxg-item" data-pfd="__ghost" style="grid-column: span 4;">' +
                '<div class="pfd-body"><div class="pfxg-ghost pfxg-ghost--clr">' +
                    '<button type="button" class="pfxg-mainbtn" onclick="pfLayoutToggle(event)" title="Открыть пикер виджетов">' +
                        '<span class="pfxg-plus">' + PFD_PLUS_SVG + '</span>' +
                        '<b>Добавить виджет</b>' +
                        '<i>страница очищена — соберите её заново или примените готовую раскладку</i>' +
                    '</button>' +
                    pfxgLaysHtml() +
                '</div></div>' +
            '</div>';
        }

        // R8: подвкладка без единого видимого блока (всё скрыли / пустой сид будущей
        // вкладки) — не голая пустота, а приглашение собрать дашборд
        if (!shown.length || !items) {
            items = '<div class="pfx-emptytab" style="grid-column: 1 / span 12">' +
                '<div class="pfpc-state"><div class="pfpc-state-art">' + PF.PFDGRID_SVG + '</div>' +
                '<div class="pfpc-state-t">Здесь пока пусто</div>' +
                '<div class="pfpc-state-s">Соберите подвкладку под себя: добавьте виджеты — их можно двигать, растягивать и скрывать.</div>' +
                '<button type="button" class="pfl-pv-add pfx-emptytab-btn" onclick="pfLayoutToggle(event)">' + PFD_PLUS_SVG + '<span>Добавить виджет</span></button>' +
            '</div></div>';
        }

        // Полка скрытых блоков для карточки «Настройка раскладки» (список + превью).
        // Содержимое превью собирается ЛЕНИВО при выборе строки — блоки тяжёлые.
        pfdShelfBlocks = hiddenB.slice();
        pfdPickerOpen = false;
        // Карточка настройки раскладки открывается кнопкой «Раскладка» в шапке страницы
        // (PF.dashEdit) и живёт НАД сеткой; в ней шапка (Вернуть стандартную / Сохранить / ✕)
        // и список блоков с превью. Сама сетка ниже остаётся живой (drag/resize/скрытие).
        // R8: вторым жильцом того же места может быть панель «Раскладки» (pfl3).
        var panel = PF.dashEdit ? pflPanelHtml() : (PF.pfl3Open ? pfl3PanelHtml() : '');
        return panel + '<div class="pfd-grid pfd-masonry pfd-live' + (PF.dashEdit ? ' editing' : '') + '" id="pfdGrid">' + items + '</div>';
    }
    // ---- сохранённая раскладка: снимок + сравнение (для «Сохранено» и «Вернуть сохранённую») ----
    // Каждая правка автосохраняется в pf_dash_v1 (рабочее состояние переживает перезагрузку),
    // но «Сохранить» отдельно кладёт КОНТРОЛЬНУЮ ТОЧКУ (PF.dashCfg.saved). Пока рабочий вид совпадает
    // с ней — кнопка показывает «Сохранено»; изменил что-то — снова «Сохранить». А «Вернуть
    // сохранённую» откатывает рабочий вид к этой точке.
    function pfdSavedSnap() {
        return { order: (PF.dashCfg.order || []).slice(),
            span: Object.assign({}, PF.dashCfg.span), h: Object.assign({}, PF.dashCfg.h),
            hidden: Object.assign({}, PF.dashCfg.hidden), col: Object.assign({}, PF.dashCfg.col),
            thm: Object.assign({}, PF.dashCfg.thm || {}),
            notes: JSON.parse(JSON.stringify(PF.dashCfg.notes || [])),
            allocPf: PF.dashCfg.allocPf || 'all' };
    }
    function pfdCanonMap(m) { var o = {}; Object.keys(m || {}).sort().forEach(function (k) { o[k] = m[k]; }); return o; }
    function pfdLayoutSig(snap) {
        snap = snap || {};
        return JSON.stringify([snap.order || [], pfdCanonMap(snap.span), pfdCanonMap(snap.h),
            pfdCanonMap(snap.hidden), pfdCanonMap(snap.col), snap.allocPf || 'all',
            pfdCanonMap(snap.thm),
            (snap.notes || []).map(function (n) { return [n.id, n.text || '', n.items || [], n.due || '']; })]);
    }
    function pfdLayoutSaved() { return !!(PF.dashCfg.saved && pfdLayoutSig(pfdSavedSnap()) === pfdLayoutSig(PF.dashCfg.saved)); }
    // обновить кнопку «Сохранить/Сохранено» и доступность «Вернуть сохранённую» без ре-рендера
    function pfdUpdateSaveBtn() {
        var btn = document.getElementById('pflSaveBtn');
        if (btn) {
            var done = pfdLayoutSaved();
            btn.classList.toggle('done', done);
            btn.innerHTML = (done ? PF.CHECK_SVG + '<span>Сохранено</span>' : PF.CHECK_SVG + '<span>Сохранить раскладку</span>');
            btn.title = done ? 'Текущий вид уже сохранён' : 'Закрепить текущую раскладку за собой';
        }
        var rst = document.getElementById('pflRestoreBtn');
        if (rst) rst.style.display = PF.dashCfg.saved ? '' : 'none';
    }
    // карточка «Настройка раскладки»: шапка (только заголовок + ✕), тело (список+превью),
    // ПОДВАЛ с действиями раскладки (Стандартная / Сохранённая / Сохранить) — блок действий
    // вынесен из шапки карточки вниз, чтобы шапка не была перегружена и читалась ясно.
    // R7: пикер-модал по референсу — категории слева, карточки виджетов с ДЕМО-превью
    // в центре, настройки выбранного виджета справа, бар выбора снизу. Вся логика —
    // в секции «ПИКЕР "ДОБАВИТЬ ВИДЖЕТ"» ниже (pfl2*).
    var PFL2_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2.8 14.9 9 21.7 9.9 16.8 14.5 18 21.2 12 18 6 21.2 7.2 14.5 2.3 9.9 9.1 9"/></svg>';
    var PFL2_LOUPE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/></svg>';
    function pflPanelHtml() {
        return '<div class="pfl-panel pfl2" id="pflPanel">' +
            '<div class="pfl-head">' +
                '<div class="pfl-head-t">' +
                    '<span class="pfl-head-ic">' + PFL2_STAR + '</span>' +
                    '<div class="pfl-head-tx"><b>Добавить виджет</b>' +
                        '<span>Виджеты добавятся на подвкладку «' + esc(pfxTabLabel(PF.dashTab)) + '» — выберите и настройте</span></div>' +
                '</div>' +
                '<button type="button" class="pfl-x" onclick="pfLayoutClose()" aria-label="Закрыть">' + PF.XMARK_SVG + '</button>' +
            '</div>' +
            '<div class="pfl2-body">' +
                '<aside class="pfl2-side">' +
                    '<div class="pfl2-search">' + PFL2_LOUPE +
                        '<input type="text" id="pfl2Qinp" placeholder="Поиск виджетов" value="' + esc(pfl2Q) + '" oninput="pfl2Search(this.value)">' +
                    '</div>' +
                    '<div class="pfl2-cats" id="pfl2Cats">' + pfl2CatsHtml() + '</div>' +
                    '<div class="pfl2-hint"><span class="pfl2-hint-ic">' + PF.PFDGRID_SVG + '</span><span><b>Порядок можно изменить</b><i>Просто перетаскивайте виджеты</i></span></div>' +
                '</aside>' +
                '<div class="pfl2-main" id="pfl2Main">' + pfl2MainHtml() + '</div>' +
                '<aside class="pfl2-set" id="pfl2Set">' + pfl2SetHtml() + '</aside>' +
            '</div>' +
            '<div class="pfl2-foot" id="pfl2Foot">' + pfl2FootHtml() + '</div>' +
        '</div>';
    }
    // ---- поповер раскладки (иконка рядом с «Добавить виджет»): базовая/индивидуальная/сохранить.
    // Наполняется из updateLayoutBtn при каждом ре-рендере — состояние всегда актуально.
    // Раскладку можно ВЗЯТЬ из трёх мест — базовая, своя сохранённая, общий пресет. Раньше
    // каждое рисовалось по-своему (кнопка / кнопка / карточки с эскизом), и нигде не было
    // видно, что применено ПРЯМО СЕЙЧАС. Теперь это ОДИН список одинаковых строк
    // (эскиз + имя + пояснение + отметка «сейчас»), а сверху — строка состояния.
    // Снимок базовой для текущей подвкладки: своя (задал админ) или системная —
    // pfdStandardCfg на «Обзоре», сид pfxTabSeed на подвкладках.
    function pfBaseSnapNow() {
        var base = pfBaseFor();
        if (base) return pfPresetInstantiate(base);
        if (PF.dashTab !== 'overview') {
            var seed = pfxTabSeed(PF.dashTab);
            return { order: seed.order, span: seed.span, h: {}, hidden: seed.hidden, col: seed.col, allocPf: 'all' };
        }
        var std = pfdStandardCfg();
        return { order: std.order, span: std.span, h: {}, hidden: Object.assign({}, std.hidden || {}),
            col: std.col, allocPf: 'all' };
    }
    // Что применено сейчас: сравниваем СТРУКТУРНУЮ подпись (без заметок — они личные и
    // в пресет не входят). Ничего не совпало → пользователь сам подвинул блоки.
    function pfLayoutActive() {
        var cur;
        try { cur = pfStructSig(PF.dashCfg); } catch (e) { return { k: 'custom' }; }
        try { if (pfStructSig(pfBaseSnapNow()) === cur) return { k: 'base' }; } catch (e) {}
        if (PF.dashCfg.saved) { try { if (pfStructSig(PF.dashCfg.saved) === cur) return { k: 'saved' }; } catch (e) {} }
        var tabPresets = pfPresetsOfTab();
        for (var i = 0; i < tabPresets.length; i++) {
            if (pfPresetActive(tabPresets[i])) return { k: 'preset', id: tabPresets[i].id, name: tabPresets[i].name };
        }
        return { k: 'custom' };
    }
    // строка-вариант: эскиз + имя + пояснение + отметка. Одинаковая для базовой,
    // сохранённой и пресетов — выбор читается как выбор, а не как три разные кнопки.
    function pfLayoutOptHtml(o) {
        // эскиз строим по ПОРТАТИВНОМУ снимку: pfPresetThumbSvg подписывает карточки
        // портфелей позиционно (П1, П2…) и реальные id ему не по зубам
        var thumb = '';
        try { thumb = pfPresetThumbSvg(o.portable ? o.snap : pfPresetTemplate(o.snap)); } catch (e) {}
        return '<div class="pfl-opt' + (o.active ? ' active' : '') + '">' +
            '<button type="button" class="pfl-opt-card" onclick="' + o.action + '" title="' + attr(o.title || '') + '">' +
                '<span class="pfl-opt-thumb">' + (thumb || '<span class="pfl-opt-nothumb">' + PF.PFDGRID_SVG + '</span>') + '</span>' +
                '<span class="pfl-opt-cap"><b>' + esc(o.name) + '</b><i>' + esc(o.sub) + '</i></span>' +
                (o.active ? '<span class="pfl-opt-now">' + PF.CHECK_SVG + 'сейчас</span>'
                          : '<span class="pfl-opt-go">применить</span>') +
            '</button>' + (o.extra || '') +
        '</div>';
    }
    function pfLayoutCfgPopHtml() {
        var saved = pfdLayoutSaved();
        var admin = pfIsAdmin();
        var count = visibleItems().length;
        var hasBase = !!pfBaseFor();
        var act = pfLayoutActive();
        // R8: раскладка пер-вкладочная — подпись базовой зависит от подвкладки
        var baseScope = PF.dashTab === 'overview'
            ? count + ' ' + PF.plural(count, 'портфель', 'портфеля', 'портфелей')
            : 'подвкладка «' + pfxTabLabel(PF.dashTab) + '»';
        var PIN_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>';

        // ---- шапка панели: имя + явный ✕ (панель открывается кликом и живёт до закрытия) ----
        var html = '<div class="pfl-cfg-head"><b>Раскладка и вид</b>' +
            '<button type="button" class="pfl-cfg-x" onclick="pfCfgPopClose()" aria-label="Закрыть">' + PF.XMARK_SVG + '</button></div>';

        // ---- строка состояния: что применено и сохранено ли ----
        var actName = act.k === 'base' ? (hasBase ? 'Базовая' : 'Стандартная')
            : act.k === 'saved' ? 'Ваша сохранённая'
            : act.k === 'preset' ? ('Пресет «' + (act.name || 'без имени') + '»')
            : 'Изменённая вручную';
        var actSub = act.k === 'custom'
            ? (saved ? 'совпадает с сохранённой' : 'не сохранена — кнопка внизу')
            : (saved ? 'сохранена' : 'не сохранена');
        html += '<div class="pfl-cfg-now' + (act.k === 'custom' && !saved ? ' warn' : '') + '">' +
            '<i>Сейчас применено</i><b>' + esc(actName) + '</b><span>' + esc(actSub) + '</span></div>';

        // ---- ЕДИНЫЙ список вариантов ----
        html += '<div class="pfl-cfg-h">Выбрать раскладку</div><div class="pfl-cfg-list">';
        html += pfLayoutOptHtml({
            name: hasBase ? 'Базовая' : 'Стандартная',
            sub: (hasBase ? 'задана администратором' : 'вид по умолчанию') + ' · ' + baseScope,
            snap: pfBaseSnapNow(), active: act.k === 'base', action: 'pfLayoutReset()',
            title: 'Вернуть базовую раскладку (' + baseScope + ')',
            extra: admin ? '<div class="pfl-opt-adm">' +
                '<button type="button" class="pfl-cfg-mini" onclick="pfSetBasePreset()" title="Сделать текущую раскладку базовой (' + attr(baseScope) + ', для всех)" aria-label="Сделать базовой">' + PIN_IC + '</button>' +
                (hasBase ? '<button type="button" class="pfl-cfg-mini" onclick="pfResetBasePreset()" title="Сбросить базовую (' + attr(baseScope) + ') к системной" aria-label="Сбросить базовую">' + PF.UNDO_SVG + '</button>' : '') +
            '</div>' : ''
        });
        if (PF.dashCfg.saved) {
            html += pfLayoutOptHtml({
                name: 'Ваша сохранённая', sub: 'та, что вы закрепили за собой',
                snap: PF.dashCfg.saved, active: act.k === 'saved', action: 'pfLayoutRestoreSaved()',
                title: 'Откатить к вашей сохранённой раскладке'
            });
        }
        pfPresetsVisible().forEach(function (p) {
            html += pfLayoutOptHtml({
                name: p.name || 'Пресет', sub: p.hid ? 'пресет · скрыт у пользователей' : 'общий пресет', portable: true,
                snap: p.snap, active: act.k === 'preset' && act.id === p.id,
                action: 'pfApplyPreset(\'' + esc(p.id) + '\')', title: 'Применить пресет ко всей раскладке',
                extra: admin ? '<button type="button" class="pfl-cfg-del" onclick="pfDeletePreset(\'' + esc(p.id) + '\', event)" title="Удалить пресет у всех" aria-label="Удалить">' + PF.XMARK_SVG + '</button>' : ''
            });
        });
        html += '</div>';
        if (!PF.dashCfg.saved && !pfPresetList.length) {
            html += '<div class="pfl-cfg-empty">Других вариантов пока нет: подвиньте блоки и сохраните вид — он появится здесь.</div>';
        }

        // ---- личное сохранение: главное действие, отдельной секцией ----
        html += '<div class="pfl-cfg-sep"></div><div class="pfl-cfg-h">Ваша раскладка</div>' +
            '<button type="button" class="pfl-cfg-item primary' + (saved ? ' done' : '') + '" onclick="pfLayoutSave()" title="' +
                (saved ? 'Текущий вид уже сохранён' : 'Закрепить текущую раскладку за собой') + '">' + PF.CHECK_SVG +
                '<span><b>' + (saved ? 'Сохранено' : 'Сохранить текущий вид') + '</b>' +
                '<i>' + (saved ? 'к нему можно вернуться в любой момент' : 'закрепить за собой — переживёт перезагрузку') + '</i></span></button>' +
            (admin ? '<button type="button" class="pfl-cfg-item add" onclick="pfSaveAsPreset()" title="Сделать текущую раскладку общим пресетом">' + PFD_PLUS_SVG +
                '<span><b>Сохранить как пресет</b><i>появится у всех пользователей</i></span></button>' : '');

        // ---- отображение карточек: скругление углов виджетов (R7) + фон страницы ----
        html += '<div class="pfl-cfg-sep"></div><div class="pfl-cfg-h">Отображение карточек</div>' + PF.pfxCornerRowHtml(false) +
            '<div class="pfl-cfg-h">Фон страницы</div>' + PF.pfxBgRowHtml(false);
        return html;
    }
    window.pfLayoutCfgPopHtml = pfLayoutCfgPopHtml;
    // подвал карточки настройки — блок управления раскладкой
    function pflFootHtml() {
        var done = pfdLayoutSaved();
        return '<div class="pfl-foot">' +
            '<div class="pfl-foot-l">' +
                '<button type="button" class="pfl-btn ghost" onclick="pfLayoutReset()" title="Классический вид: карточки в ряд, «Избранное» справа, без виджетов">' + PF.PFDGRID_SVG + '<span>Стандартная</span></button>' +
                '<button type="button" class="pfl-btn ghost" id="pflRestoreBtn" onclick="pfLayoutRestoreSaved()" style="' + (PF.dashCfg.saved ? '' : 'display:none') + '" title="Откатить к вашей сохранённой раскладке">' + PF.UNDO_SVG + '<span>Сохранённая</span></button>' +
            '</div>' +
            '<button type="button" class="pfl-btn primary' + (done ? ' done' : '') + '" id="pflSaveBtn" onclick="pfLayoutSave()" title="' + (done ? 'Текущий вид уже сохранён' : 'Закрепить текущую раскладку за собой') + '">' + PF.CHECK_SVG + '<span>' + (done ? 'Сохранено' : 'Сохранить раскладку') + '</span></button>' +
        '</div>';
    }

    // ---- «Раскладка»: открыть/закрыть карточку настройки, сохранить, вернуть стандартную ----
    // Правка блоков (перенос/ресайз/скрытие) живёт ВСЕГДА при живой сетке (PF.dashCfg.on) — карточка
    // лишь показывает список блоков для добавления и кнопки сохранения/сброса. PF.dashEdit = карточка
    // открыта. Кнопка «Раскладка» в шапке страницы — единственная точка входа (#pfLayoutBtn).
    // подсветка кнопки «Раскладка»: показ/скрытие + точка «своя раскладка» + нажатое состояние
    // Кнопка «Настроить вид» в ШАПКЕ страницы (рядом с названием раздела): показ/скрытие +
    // точка «своя раскладка» + нажатое состояние. Только десктоп, только на вкладке «Портфели».
    function updateLayoutBtn() {
        var b = document.getElementById('pfLayoutBtn'); if (!b) return;
        // при активной «Панели управления» ВСЕ контролы страницы живут в ней — шапку прячем
        var show = (currentTab === 'portfolios' && PF.store.items.length && !PF.pfdPanelActive());
        // базовый стиль кнопки — display:none, поэтому показываем ЯВНЫМ inline-flex
        b.style.display = show ? 'inline-flex' : 'none';
        var sep = document.getElementById('pfLayoutSep');
        if (sep) sep.style.display = show ? 'inline-block' : 'none';
        b.classList.toggle('on', !!PF.dashCfg.on);
        b.classList.toggle('active', !!PF.dashEdit);
        // иконка раскладки рядом: показ синхронно с кнопкой, поповер наполняем актуальным состоянием
        var cfg = document.getElementById('pfLayoutCfgWrap');
        if (cfg) {
            cfg.style.display = show ? 'inline-flex' : 'none';
            var pop = document.getElementById('pfLayoutCfgPop');
            if (pop && show) pop.innerHTML = pfLayoutCfgPopHtml();
        }
        // поповер раскладки внутри «Панели управления» — держим в актуальном состоянии тоже
        Array.prototype.forEach.call(document.querySelectorAll('#pfWrap .pfp-cfg .pfl-cfg-pop'), function (p) {
            p.innerHTML = pfLayoutCfgPopHtml();
        });
    }
    window.updateLayoutBtn = updateLayoutBtn;
    // ---- поповер раскладки: открытие ПО КЛИКУ + живучесть при ре-рендерах ----
    // Hover-показ был хрупким: «Сохранить текущий вид» (и любое действие, ведущее к
    // ре-рендеру, например после смены раскраски виджета) пересобирал герой, hover
    // терялся — и блок настройки раскладки исчезал прямо под курсором. Теперь
    // состояние держит флаг: клик по шестерёнке открывает, клик-вне/Esc/✕ закрывают,
    // renderPortfolios восстанавливает .open после innerHTML-свопа.
    var pfCfgPopOpen = false;
    function pfCfgPopSet(on) {
        pfCfgPopOpen = !!on;
        Array.prototype.forEach.call(document.querySelectorAll('.pfl-cfg-wrap'), function (w) {
            w.classList.toggle('open', pfCfgPopOpen);
        });
    }
    window.pfCfgPopToggle = function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        if (!pfCfgPopOpen) updateLayoutBtn();   // свежее содержимое к моменту открытия
        pfCfgPopSet(!pfCfgPopOpen);
    };
    window.pfCfgPopClose = function () { pfCfgPopSet(false); };
    window.pfCfgPopRestore = function () { if (pfCfgPopOpen) pfCfgPopSet(true); };
    document.addEventListener('click', function (e) {
        if (!pfCfgPopOpen) return;
        var t = e.target;
        if (!t || !t.closest) return;
        // клик по кнопке внутри поповера мог уже пересобрать DOM (target отцеплен) —
        // такое закрытием не считаем; закрывает только настоящий клик мимо панели
        if (!t.isConnected) return;
        if (t.closest('.pfl-cfg-pop') || t.closest('.pfl-cfg-btn')) return;
        pfCfgPopSet(false);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !pfCfgPopOpen) return;
        pfCfgPopSet(false);
        e.stopImmediatePropagation();
    });
    // клик по кнопке «Раскладка»: открыть карточку (или закрыть, если уже открыта)
    window.pfLayoutToggle = function (ev) {
        if (ev) ev.stopPropagation();
        if (PF.dashEdit) { window.pfLayoutClose(); return; }
        try { if (window.matchMedia('(max-width: 1023px)').matches) { toast('Настройка раскладки доступна на широком экране', true); return; } } catch (e) {}
        if (!visibleItems().length) { toast('Сначала добавьте портфель — пока нечего расставлять', true); return; }
        if (!PF.dashCfg.on) { PF.dashCfg.on = true; saveDashCfg(); }
        PF.pfl3Open = false;   // пикер и панель раскладок не живут вместе
        PF.dashEdit = true;
        PF.closeImpMenus();
        pfWGatesFetch();        // свежая видимость виджетов каталога к открытию пикера
        pfdRerender();          // отрисует карточку; pflInitPreview выберет первый блок
        updateLayoutBtn();
    };
    // закрыть карточку (✕): режим своей раскладки НЕ выключаем — сетка остаётся живой,
    // расстановка уже автосохранена; пользователь может тащить/менять блоки и без карточки
    window.pfLayoutClose = function () {
        if (pfdDragEl) pfdEndDrag(true);
        if (pfdRsCancel) pfdRsCancel();
        PF.dashEdit = false;
        PF.closeImpMenus();
        pfdRerender();
        updateLayoutBtn();
    };
    // «Сохранить раскладку»: закрепить КОНТРОЛЬНУЮ ТОЧКУ (PF.dashCfg.saved) — к ней можно
    // вернуться после дальнейших правок. Карточку НЕ закрываем: кнопка сразу показывает
    // «Сохранено», и видно, что дальнейшие изменения снова сделают её «Сохранить».
    window.pfLayoutSave = function () {
        PF.pfdFlushNotes();
        if (pfdLayoutSaved()) { toast('Этот вид уже сохранён'); return; }
        PF.dashCfg.saved = pfdSavedSnap();
        saveDashCfg();
        pfdUpdateSaveBtn();
        updateLayoutBtn();   // освежить поповер раскладки в шапке (кнопка → «Сохранено»)
        try { pfl3Repaint(); } catch (e) {}   // панель раскладок: строка «Ваша сохранённая» и подвал
        toast('Раскладка сохранена — закреплена за вами');
    };
    // «Вернуть сохранённую» — откатить рабочий вид к последней контрольной точке
    window.pfLayoutRestoreSaved = function () {
        if (!PF.dashCfg.saved) { toast('Сохранённой раскладки пока нет', true); return; }
        pfdPushUndo();
        var s = PF.dashCfg.saved;
        PF.dashCfg.on = true;
        delete PF.dashCfg.cleared;
        PF.dashCfg.order = (s.order || []).slice();
        PF.dashCfg.span = Object.assign({}, s.span); PF.dashCfg.h = Object.assign({}, s.h);
        PF.dashCfg.hidden = Object.assign({}, s.hidden); PF.dashCfg.col = Object.assign({}, s.col);
        PF.dashCfg.thm = Object.assign({}, s.thm || {});
        PF.dashCfg.notes = JSON.parse(JSON.stringify(s.notes || []));
        PF.dashCfg.allocPf = s.allocPf || 'all';
        saveDashCfg();
        pfdRerender();
        toast('Вернул вашу сохранённую раскладку');
    };
    // «Вернуть стандартную» = сбросить всю расстановку/размеры/скрытия/добавленные виджеты
    // к стандартному виду, НО ОСТАТЬСЯ в живой сетке (on:true) — блоки по-прежнему подвижны,
    // а глаз-скрытие у «Сводки»/«Календаря» на месте (в классике on:false их бы не было, и
    // дашборд «замирал» до первого добавления виджета). Карточку закрываем, чтобы виден был
    // результат; заметки (текст) храним. Обратимо: снимок кладём ПЕРЕД сбросом (Cmd/Ctrl+Z).
    // Явная «классическая» раскладка в живой сетке: карточки портфелей в верхнем ряду,
    // «Избранное» — крайним справа, «Сводка» под ним, календарь широкой полосой слева
    // под карточками, «Ставки»/«История сделок» — во всю ширину внизу. Считаем ЯВНЫЕ
    // col/span (а не жадную упаковку) — тогда вид предсказуем и совпадает с классикой
    // «4 карточки в ряд, избранное справа», а не со случайной масонри-стопкой.
    function pfdStandardCfg() {
        var order = [], col = {}, span = {}, hidden = {};
        var pfIds = visibleItems().map(function (p) { return 'pf:' + p.id; });
        var n = pfIds.length;
        function put(id, c, s) { order.push(id); col[id] = c; span[id] = s; }
        function show(id) { hidden[id] = 0; }   // опт-ин виджеты (defHidden) включаем явно
        // 0 или 5+ портфелей — генерика: карточки по 2 в ряд слева, «Избранное» справа
        if (!n || n > 4) {
            pfIds.forEach(function (id, i) { put(id, 1 + (i % 2) * 4, 4); });
            put('fav', 9, 4);
            if (PF.store.items.length >= 2) put('sum', 9, 4);
            put('cal', 1, 8);
            put('rates', 1, 12);
            put('trades', 1, 12);
            return { order: order, col: col, span: span, hidden: hidden };
        }
        // 1–4 портфеля → раскладка ЧЕТЫРЬМЯ ЗОНАМИ сверху вниз (просьба 2026-07-14):
        //   1. «Как я сегодня» — один взгляд, и понятно состояние: три KPI-плитки
        //      (капитал · за сегодня · ближайшая выплата) + график капитала со сводкой;
        //   2. «Что я держу» — карточки портфелей, распределение активов, избранное;
        //   3. «Что делать» — календарь выплат (что ждать/докупать) и ставки рынка;
        //   4. «Что было» — история сделок во всю ширину.
        // ---- зона 1 «Как я сегодня» ----
        put('kpi:cap', 1, 4); put('kpi:day', 5, 4); put('kpi:next', 9, 4);
        put('cap', 1, 8);
        ['kpi:cap', 'kpi:day', 'kpi:next', 'cap'].forEach(show);
        if (n >= 2) { put('sum', 9, 4); }
        else { put('divs', 9, 4); show('divs'); }   // 1 портфель: сводки нет — дивиденды и купоны
        // ---- зона 2 «Что я держу» ----
        show('alloc');
        if (n === 1) {
            put(pfIds[0], 1, 4); put('alloc', 5, 4); put('fav', 9, 4);
        } else if (n === 2) {
            put(pfIds[0], 1, 4); put(pfIds[1], 5, 4); put('alloc', 9, 4);
        } else {
            pfIds.slice(0, 3).forEach(function (id, i) { put(id, 1 + i * 4, 4); });
            if (n === 3) { put('alloc', 1, 4); put('fav', 5, 4); put('assets', 9, 4); show('assets'); }
            else { put(pfIds[3], 1, 4); put('alloc', 5, 4); put('fav', 9, 4); }
        }
        // ---- зона 3 «Что делать» ----
        if (n === 2) { put('cal', 1, 4); put('fav', 5, 4); put('rates', 9, 4); }
        else { put('cal', 1, 8); put('rates', 9, 4); }
        // ---- зона 4 «Что было» ----
        put('trades', 1, 12);
        return { order: order, col: col, span: span, hidden: hidden };
    }
    // «Базовая» = для ТЕКУЩЕГО числа портфелей: если владелец/админ задал свою базовую для
    // этого числа (pfBaseMap) — берём её (шаблон → реальные портфели), иначе системную pfdStandardCfg.
    window.pfLayoutReset = function () {
        pfdPushUndo();
        var base = pfBaseFor();
        var c;
        if (base) c = pfPresetInstantiate(base);
        else if (PF.dashTab !== 'overview') {
            // системная база подвкладки — её сид
            var seed = pfxTabSeed(PF.dashTab);
            c = { order: seed.order, span: seed.span, h: {}, hidden: seed.hidden, col: seed.col, allocPf: 'all' };
        } else {
            var std = pfdStandardCfg();
            c = { order: std.order, span: std.span, h: {}, hidden: Object.assign({}, std.hidden || {}), col: std.col, allocPf: PF.dashCfg.allocPf || 'all' };
        }
        // R8: конфиг МУТИРУЕМ (PF.dashCfg — общий объект с pfTabCfgs, пересоздание оторвало
        // бы его от реестра вкладок); corner/notes/saved остаются как были
        PF.dashCfg.on = true;
        delete PF.dashCfg.cleared;
        PF.dashCfg.order = c.order; PF.dashCfg.span = c.span; PF.dashCfg.h = c.h;
        PF.dashCfg.hidden = c.hidden; PF.dashCfg.col = c.col; PF.dashCfg.thm = {};
        PF.dashCfg.allocPf = c.allocPf;
        PF.dashEdit = false;
        saveDashCfg();
        pfdRerender();
        updateLayoutBtn();
        toast(base ? 'Базовая раскладка возвращена' : 'Стандартная раскладка возвращена');
    };
    // владелец/админ: закрепить ТЕКУЩИЙ вид как базовый для ТЕКУЩЕГО числа портфелей — у
    // каждого числа своя базовая (по «Базовой» юзер получит её вместо системной).
    window.pfSetBasePreset = function () {
        if (!pfIsAdmin()) { toast('Базовую задаёт администратор', true); return; }
        if (!pfCloudOn() || !(pfSupa().isAuthed && pfSupa().isAuthed())) { toast('Нужен вход в аккаунт', true); return; }
        var count = visibleItems().length;
        if (!count) { toast('Сначала добавьте портфель', true); return; }
        PF.pfdFlushNotes();
        pfBaseMap[pfBaseKey()] = pfPresetTemplate(pfdSavedSnap());
        pfPresetsPersist(PF.dashTab === 'overview'
            ? 'Базовая для ' + count + ' портф. сохранена — у всех'
            : pfxIsPfTab(PF.dashTab) ? 'Базовая вкладок-портфелей сохранена — у всех'
            : 'Базовая «' + pfxTabLabel(PF.dashTab) + '» сохранена — у всех');
    };
    window.pfResetBasePreset = function () {
        if (!pfIsAdmin()) return;
        if (!pfBaseFor()) return;
        delete pfBaseMap[pfBaseKey()];
        pfPresetsPersist('Базовая сброшена к системной');
    };
    // совместимость со старыми вызовами (Esc-хендлер и т.п.)
    window.pfDashToggleEdit = function () { if (PF.dashEdit) window.pfLayoutClose(); else window.pfLayoutToggle(); };
    window.pfDashReset = window.pfLayoutReset;

    // ---- «Очистить подвкладку»: убрать ВСЕ виджеты, оставить только портфели ----
    // (просьба 2026-07-17). После очистки в сетке живёт ОДНОРАЗОВЫЙ теневой виджет
    // «Добавить виджет» (флаг cfg.cleared, см. pfdBodyHtml): из него открывается пикер
    // или applied готовая раскладка. Флаг снимает любое добавление виджета/раскладка.
    // Обратимо: снимок ложится в undo (Cmd/Ctrl+Z).
    window.pfLayoutClearAsk = function () {
        PF.pfConfirm({ danger: true, title: 'Очистить подвкладку?',
            text: 'Все виджеты будут убраны — останутся только карточки портфелей. Вернуть можно готовой раскладкой из теневого виджета или Cmd/Ctrl+Z.',
            ok: 'Очистить' }, function () { window.pfLayoutClear(); });
    };
    window.pfLayoutClear = function () {
        pfdPushUndo();
        PF.dashCfg.on = true;
        var keep = {};
        if (pfxIsPfTab(PF.dashTab)) keep['pf:' + PF.dashTab.slice(3)] = 1;
        else visibleItems().forEach(function (p) { keep['pf:' + p.id] = 1; });
        var h = PF.dashCfg.hidden = PF.dashCfg.hidden || {};
        // всё явно включённое (опт-ин виджеты и сиды подвкладок) — выключаем
        Object.keys(h).forEach(function (id) { if (!keep[id]) h[id] = 1; });
        // дефолтно-видимые блоки «Обзора» и заметки прячем явно (их нет в hidden)
        ['cal', 'fav', 'sum', 'rates', 'trades'].forEach(function (id) { if (!keep[id]) h[id] = 1; });
        (PF.dashCfg.notes || []).forEach(function (nt) { h['note:' + nt.id] = 1; });
        Object.keys(keep).forEach(function (id) { h[id] = 0; });
        PF.dashCfg.cleared = 1;
        PF.dashEdit = false; PF.pfl3Open = false;
        saveDashCfg();
        pfdRerender();
        updateLayoutBtn();
        toast('Виджеты убраны — остались только портфели');
    };

    // ---- глобальные пресеты: применить (все) / сохранить как пресет (админ) / удалить (админ) ----
    window.pfApplyPreset = function (id) {
        var p = pfPresetList.filter(function (x) { return x.id === id; })[0];
        if (!p) { toast('Пресет не найден', true); return; }
        if (!visibleItems().length) { toast('Сначала добавьте портфель', true); return; }
        pfdPushUndo();
        var c = pfPresetInstantiate(p.snap);
        PF.dashCfg.on = true;
        delete PF.dashCfg.cleared;
        PF.dashCfg.order = c.order; PF.dashCfg.span = c.span; PF.dashCfg.h = c.h;
        PF.dashCfg.hidden = c.hidden; PF.dashCfg.col = c.col; PF.dashCfg.allocPf = c.allocPf;
        saveDashCfg();
        PF.dashEdit = false;
        pfdRerender();
        updateLayoutBtn();
        toast('Применён пресет «' + (p.name || 'без имени') + '»');
    };
    window.pfSaveAsPreset = function () {
        if (!pfIsAdmin()) { toast('Пресеты задаёт администратор', true); return; }
        if (!pfCloudOn() || !(pfSupa().isAuthed && pfSupa().isAuthed())) { toast('Нужен вход в аккаунт', true); return; }
        PF.pfdFlushNotes();
        pfPresetNameModal('', function (name) {
            var snap = pfPresetTemplate(pfdSavedSnap());
            var by = (pfSupa().session && pfSupa().session.user) ? pfSupa().session.user.id : null;
            // R8: пресет привязан к подвкладке (tab) — показывается только на ней;
            // R9: у вкладок-портфелей ключ общий ('pftab') — пресет виден на всех таких
            pfPresetList = pfPresetList.concat([{ id: genId('pre'), name: name.slice(0, 40) || 'Пресет', snap: snap, at: Date.now(), by: by, tab: pfPresetTabKey() }]);
            pfPresetsPersist(pfxIsPfTab(PF.dashTab)
                ? 'Пресет «' + (name || 'Пресет') + '» доступен всем на вкладках портфелей'
                : 'Пресет «' + (name || 'Пресет') + '» доступен всем на подвкладке «' + pfxTabLabel(PF.dashTab) + '»');
        });
    };
    window.pfDeletePreset = function (id, ev) {
        if (ev) ev.stopPropagation();
        if (!pfIsAdmin()) return;
        var p = pfPresetList.filter(function (x) { return x.id === id; })[0]; if (!p) return;
        PF.pfConfirm({ danger: true, title: 'Удалить пресет?', text: '«' + esc(p.name || 'Пресет') + '» исчезнет у всех пользователей.', ok: 'Удалить' }, function () {
            pfPresetList = pfPresetList.filter(function (x) { return x.id !== id; });
            pfPresetsPersist('Пресет удалён');
        });
    };
    // маленькая модалка ввода имени пресета (реюз оформления PF.pfConfirm)
    function pfPresetNameModal(initial, onOk) {
        var old = dq('pfConfirmOv'); if (old) old.remove();
        var GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
        var ov = document.createElement('div');
        ov.id = 'pfConfirmOv';
        ov.innerHTML = '<div class="pfcf-card" role="dialog" aria-modal="true">' +
            '<div class="pfcf-ico">' + GRID + '</div>' +
            '<div class="pfcf-t">Новый пресет раскладки</div>' +
            '<div class="pfcf-s">Он станет доступен всем пользователям в настройках раскладки.</div>' +
            '<input type="text" class="pfcf-input" id="pfPresetName" maxlength="40" placeholder="Название пресета" value="' + esc(initial || '') + '">' +
            '<div class="pfcf-btns">' +
                '<button class="pfcf-btn" type="button" data-act="no">Отмена</button>' +
                '<button class="pfcf-btn pfcf-ok" type="button" data-act="yes">Сохранить</button>' +
            '</div></div>';
        document.body.appendChild(ov);
        var inp = ov.querySelector('#pfPresetName');
        function close() { document.removeEventListener('keydown', onKey); ov.classList.remove('show'); setTimeout(function () { ov.remove(); }, 180); }
        function submit() { var v = (inp.value || '').trim(); if (!v) { try { inp.focus(); } catch (e) {} return; } close(); onOk(v); }
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter') { e.preventDefault(); submit(); } }
        ov.addEventListener('click', function (e) {
            if (e.target === ov) { close(); return; }
            var b = e.target.closest('.pfcf-btn'); if (!b) return;
            if (b.getAttribute('data-act') === 'yes') submit(); else close();
        });
        document.addEventListener('keydown', onKey);
        requestAnimationFrame(function () { ov.classList.add('show'); try { inp.focus(); inp.select(); } catch (e) {} });
    }

    // окно сузилось до мобильной ширины во время правки → автозакрытие карточки:
    // на ≤1023 конструктор неактивен (pfdActive), карточка не должна висеть заглушкой
    try {
        var pfdNarrowMq = window.matchMedia('(max-width: 1023px)');
        var pfdNarrowH = function (ev) { if (ev.matches && PF.dashEdit) window.pfLayoutClose(); };
        if (pfdNarrowMq.addEventListener) pfdNarrowMq.addEventListener('change', pfdNarrowH);
        else if (pfdNarrowMq.addListener) pfdNarrowMq.addListener(pfdNarrowH);
    } catch (e) {}

    // ---- скрытие/возврат блоков (крестик на бирке + полка «Добавить блок») ----
    window.pfdHideBlock = function (id) {
        pfdPushUndo();
        PF.dashCfg.hidden[id] = 1;
        // Убрали ОБА блока слота — терминалу эта бумага больше не нужна: забываем
        // её и (для второго и дальше) вычищаем id из раскладки, чтобы номер снова
        // стал свободен для «+». Cmd+Z вернёт карточки, но бумагу придётся выбрать
        // заново — состояние слота живёт отдельно от снимка раскладки.
        var n = pftSlotOf(id);
        if (n && PF.pftDropSlot) {
            var h = PF.dashCfg.hidden || {};
            var ord = PF.dashCfg.order || [];
            // Слот жив, пока на экране хоть один его блок. График опциональный:
            // его может не быть в раскладке вовсе — тогда он и не держит слот.
            var alive = pftSlotIds(n).some(function (bid) {
                if (h[bid] === 1) return false;
                return bid === pftObId(n) || bid === pftTkId(n) || ord.indexOf(bid) >= 0;
            });
            if (!alive) {
                if (n > 1) {
                    pftSlotIds(n).forEach(function (bid) {
                        PF.dashCfg.order = (PF.dashCfg.order || []).filter(function (x) { return x !== bid; });
                        [PF.dashCfg.span, PF.dashCfg.h, PF.dashCfg.hidden, PF.dashCfg.col, PF.dashCfg.thm]
                            .forEach(function (m) { if (m) delete m[bid]; });
                    });
                }
                PF.pftDropSlot(n);
            }
        }
        saveDashCfg();
        pfdRerender();
    };
    // прокрутка к только что добавленному блоку + короткая подсветка — чтобы было видно,
    // что он появился (ре-рендер асинхронный → опрашиваем DOM несколько кадров).
    function pfdScrollToBlock(id) {
        var tries = 0;
        (function poll() {
            var el = document.querySelector('#pfWrap .pfd-item[data-pfd="' + id + '"]');
            if (el) {
                try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
                el.classList.add('pfd-flash');
                setTimeout(function () { try { el.classList.remove('pfd-flash'); } catch (e) {} }, 1500);
                return;
            }
            if (tries++ < 45) requestAnimationFrame(poll);
        })();
    }
    window.pfdShowBlock = function (id) {
        pfdPushUndo();
        PF.dashCfg.hidden[id] = 0;
        saveDashCfg();
        pfdRerender();
        pfdScrollToBlock(id);
    };

    // ====================================================================
    //  ПОПОВЕР НАСТРОЕК ВИДЖЕТА — шестерёнка .pfd-cardcfg рядом с корзиной.
    //  Открывает карточку .pfdcfg-pop прямо НА блоке: тема (светлая/тёмная/
    //  стекло — как в пикере), высота S/M/L, у графика капитала — вид и период.
    //  Изменения применяются сразу; тема и высота правятся живьём без ре-рендера
    //  (поповер не мигает), смена вида графика меняет id блока (cap↔cap2) →
    //  полный ре-рендер и повторный монтаж поповера без анимации входа.
    // ====================================================================
    var PFDCFG_GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    var PFDCFG_X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    PF.pfdCfgFor = null;   // id блока с открытым поповером настроек (null — закрыт)
    // имя виджета для шапки поповера: каталог пикера + блоки вне каталога
    function pfdCfgName(id) {
        var w = pfl2ById(id === 'cap2' ? 'cap' : id);
        if (w) return w.name;
        // карточки слотов терминала зовутся по бумаге: «Стакан · SBER»
        var n = pftSlotOf(id);
        if (n && PF.pftSlotLabel) return PF.pftSlotLabel(id.indexOf('trade:ob') === 0 ? 'ob' : 'ticket', n);
        return id === 'panel' ? 'Панель управления' : 'Виджет';
    }
    // текущий пресет высоты — те же значения, что пишет пикер (s=300 / l=560 / m=авто);
    // произвольная высота от ручного ресайза не подсвечивает ни одну кнопку
    function pfdCfgSizeOf(id) {
        var h = +((PF.dashCfg.h || {})[id]) || 0;
        if (!h) return 'm';
        return h === 300 ? 's' : h === 560 ? 'l' : '';
    }
    function pfdCfgHtml(id) {
        var thm = (PF.dashCfg.thm || {})[id];
        thm = thm === 'dark' ? 'dark' : thm === 'glass' ? 'glass' : 'light';
        var size = pfdCfgSizeOf(id);
        var a = jsArg(id);
        function thmBtn(v, label) {
            return '<button type="button" class="pfdcfg-thm' + (thm === v ? ' on' : '') + '" onclick="pfdCfgSetThm(\'' + a + '\',\'' + v + '\')">' +
                '<span class="pfdcfg-sw pfdcfg-sw-' + v + '"><i></i><em></em></span>' +
                '<span class="pfdcfg-thm-n">' + label + '</span></button>';
        }
        function segBtn(fn, v, cur, label, title) {
            return '<button type="button" class="pfdcfg-seg-b' + (cur === v ? ' on' : '') + '"' + (title ? ' title="' + title + '"' : '') +
                ' onclick="' + fn + '(\'' + a + '\',\'' + v + '\')">' + label + '</button>';
        }
        var capExtra = '';
        if (id === 'cap' || id === 'cap2') {
            var view = id === 'cap2' ? 'bars' : 'line';
            capExtra =
                '<div class="pfdcfg-lbl">Вид графика</div>' +
                '<div class="pfdcfg-seg">' +
                    segBtn('pfdCfgSetView', 'line', view, 'Линия') +
                    segBtn('pfdCfgSetView', 'bars', view, 'Столбцы') +
                '</div>' +
                '<div class="pfdcfg-lbl">Период</div>' +
                '<div class="pfdcfg-seg">' +
                    [['7', '7д'], ['30', '30д'], ['90', '3м'], ['365', 'Год'], ['all', 'Всё']].map(function (x) {
                        return segBtn('pfdCfgSetPeriod', x[0], PF.pfdCapRange, x[1]);
                    }).join('') +
                '</div>';
        }
        return '<div class="pfdcfg-head">' +
                '<div class="pfdcfg-head-t"><span class="pfdcfg-k">Настройки виджета</span><b class="pfdcfg-t">' + esc(pfdCfgName(id)) + '</b></div>' +
                '<button type="button" class="pfdcfg-x" onclick="pfdCfgClose()" aria-label="Закрыть">' + PFDCFG_X_SVG + '</button>' +
            '</div>' +
            '<div class="pfdcfg-lbl">Тема</div>' +
            '<div class="pfdcfg-thms">' + thmBtn('light', 'Светлая') + thmBtn('dark', 'Тёмная') + thmBtn('glass', 'Стекло') + '</div>' +
            '<div class="pfdcfg-lbl">Высота</div>' +
            '<div class="pfdcfg-seg">' +
                segBtn('pfdCfgSetSize', 's', size, 'S', 'Компактный · 300 px') +
                segBtn('pfdCfgSetSize', 'm', size, 'M', 'Средний · по содержимому') +
                segBtn('pfdCfgSetSize', 'l', size, 'L', 'Большой · 560 px') +
            '</div>' +
            capExtra +
            '<div class="pfdcfg-hint">Изменения применяются сразу. Ширину и место меняйте перетаскиванием за кромки блока.</div>';
    }
    function pfdCfgMount(id, noAnim) {
        if (document.querySelector('#pfWrap .pfdcfg-pop')) return;   // один поповер на страницу
        var item = document.querySelector('#pfWrap .pfd-item[data-pfd="' + id + '"]');
        if (!item) return;
        var pop = document.createElement('div');
        pop.className = 'pfdcfg-pop' + (noAnim ? ' no-anim' : '');
        pop.innerHTML = pfdCfgHtml(id);
        item.appendChild(pop);
        item.classList.add('pfd-cfgopen');
        PF.pfdCfgFor = id;
    }
    // перерисовать содержимое открытого поповера на месте (подсветка активных кнопок)
    function pfdCfgRepaint() {
        var pop = document.querySelector('#pfWrap .pfdcfg-pop');
        if (pop && PF.pfdCfgFor) pop.innerHTML = pfdCfgHtml(PF.pfdCfgFor);
    }
    // после полного ре-рендера поповер собирается заново на свежем блоке БЕЗ анимации
    // входа (тот же принцип, что .pfo-anim-in/.no-anim). Рендер под view-transition
    // асинхронный — опрашиваем DOM по кадрам, как pfdScrollToBlock.
    function pfdCfgRemountSoon(id) {
        PF.pfdCfgFor = id;
        var tries = 0;
        (function poll() {
            if (!document.querySelector('#pfWrap .pfdcfg-pop')) {
                var item = document.querySelector('#pfWrap .pfd-item[data-pfd="' + id + '"]');
                if (item) { pfdCfgMount(id, true); return; }
            } else return;   // поповер уже на месте (повторный вызов) — выходим
            if (tries++ < 60) requestAnimationFrame(poll);
            else PF.pfdCfgFor = null;   // блок исчез (скрыт/удалён) — считаем поповер закрытым
        })();
    }
    window.pfdCfgOpen = function (id, ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        var open = document.querySelector('#pfWrap .pfdcfg-pop');
        if (open && PF.pfdCfgFor === id) { window.pfdCfgClose(); return; }   // повторный клик = закрыть
        window.pfdCfgClose();
        pfdCfgMount(id, false);
    };
    window.pfdCfgClose = function () {
        document.querySelectorAll('#pfWrap .pfdcfg-pop').forEach(function (p) {
            var it = p.closest('.pfd-item');
            if (it) it.classList.remove('pfd-cfgopen');
            p.remove();
        });
        PF.pfdCfgFor = null;
    };
    // тема — живьём классом на блоке, без ре-рендера (тот же класс ставит pfdBodyHtml)
    window.pfdCfgSetThm = function (id, v) {
        pfdPushUndo();
        if (v === 'dark' || v === 'glass') PF.dashCfg.thm[id] = v; else delete PF.dashCfg.thm[id];
        saveDashCfg();
        var item = document.querySelector('#pfWrap .pfd-item[data-pfd="' + id + '"]');
        if (item) {
            item.classList.toggle('pfd-thm-dark', v === 'dark');
            item.classList.toggle('pfd-thm-glass', v === 'glass');
        }
        pfdCfgRepaint();
        pfdUpdateSaveBtn();
        updateLayoutBtn();   // поповер раскладки сразу видит «не сохранена» после смены раскраски
    };
    // высота — пресеты пикера (s=300 / m=авто / l=560); стиль блока правим живьём и
    // перепаковываем masonry — ровно как штатный ресайз за кромку
    window.pfdCfgSetSize = function (id, s) {
        pfdPushUndo();
        var hMap = { s: 300, l: 560 };
        if (s === 'm') delete PF.dashCfg.h[id]; else PF.dashCfg.h[id] = hMap[s];
        saveDashCfg();
        var item = document.querySelector('#pfWrap .pfd-item[data-pfd="' + id + '"]');
        if (item) {
            var h = +(PF.dashCfg.h[id]) || 0;
            var isPanel = id === 'panel';
            item.style.height = (!isPanel && h) ? h + 'px' : '';
            item.style.minHeight = (isPanel && h) ? h + 'px' : '';
            item.classList.toggle('pfd-hset', !!h && !isPanel);
            if (isPanel) item.classList.toggle('pfd-ptall', h >= PFD_PANEL_TALL);
            pfdRepackSoon();
        }
        pfdCfgRepaint();
        pfdUpdateSaveBtn();
        updateLayoutBtn();   // статус «не сохранена» в поповере раскладки — сразу
    };
    // вид графика капитала: линия и столбцы — два разных блока (cap/cap2); настройки
    // и место в сетке переезжают на новый id (как pfl2Add с real='cap2')
    window.pfdCfgSetView = function (id, v) {
        var to = v === 'bars' ? 'cap2' : 'cap';
        if (id === to) return;
        pfdPushUndo();
        ['span', 'h', 'col', 'thm'].forEach(function (k) {
            var m = PF.dashCfg[k] = PF.dashCfg[k] || {};
            if (m[id] != null) m[to] = m[id];
            delete m[id];
        });
        PF.dashCfg.hidden[id] = 1; PF.dashCfg.hidden[to] = 0;
        var ord = PF.dashCfg.order = (PF.dashCfg.order || []).slice();
        var jx = ord.indexOf(to);
        if (jx >= 0) ord.splice(jx, 1);
        var ix = ord.indexOf(id);
        if (ix >= 0) ord.splice(ix, 1, to); else ord.push(to);
        saveDashCfg();
        pfdRerender();
        pfdCfgRemountSoon(to);
    };
    // период графика — сессионная настройка, общая с пилюлями на самом виджете;
    // PF.pfdCapRepaint меняет карточку ВНУТРИ .pfd-body, поповер (сосед) не трогается
    window.pfdCfgSetPeriod = function (id, p) {
        if (PF.pfdCapRange !== p) { PF.pfdCapRange = p; PF.pfdCapRepaint(); }
        pfdCfgRepaint();
    };
    // клик-вне и Esc закрывают поповер; Esc гасим stopImmediatePropagation-ом, чтобы
    // тот же Esc не долетал до обработчика выхода из режима правки (оба на document,
    // этот зарегистрирован раньше по файлу — выполняется первым)
    document.addEventListener('click', function (e) {
        if (!PF.pfdCfgFor) return;
        var t = e.target;
        if (!t || !t.closest || !t.isConnected) return;
        if (t.closest('.pfdcfg-pop') || t.closest('.pfd-cardcfg')) return;
        window.pfdCfgClose();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !PF.pfdCfgFor) return;
        window.pfdCfgClose();
        e.stopImmediatePropagation();
    });

    // ---- undo: каждый шаг правки кладёт снимок раскладки, Cmd/Ctrl+Z возвращает ----
    // Стек живёт в памяти на сессию правки (вход в режим начинает новую).
    var pfdUndoStack = [];
    function pfdCfgSnap() { return JSON.stringify({ order: PF.dashCfg.order, span: PF.dashCfg.span, h: PF.dashCfg.h, hidden: PF.dashCfg.hidden, col: PF.dashCfg.col, thm: PF.dashCfg.thm, notes: PF.dashCfg.notes }); }
    function pfdPushUndo() {
        pfdUndoStack.push(pfdCfgSnap());
        if (pfdUndoStack.length > 40) pfdUndoStack.shift();
    }
    window.pfdUndo = function () {
        // пропускаем снимки, не отличающиеся от текущего (драг, вернувшийся на место)
        var cur = pfdCfgSnap(), snap = null;
        while (pfdUndoStack.length) { var s = pfdUndoStack.pop(); if (s !== cur) { snap = s; break; } }
        if (!snap) { toast('Отменять нечего', true); return; }
        try {
            var o = JSON.parse(snap);
            PF.dashCfg.order = o.order || []; PF.dashCfg.span = o.span || {};
            PF.dashCfg.h = o.h || {}; PF.dashCfg.hidden = o.hidden || {}; PF.dashCfg.col = o.col || {};
            PF.dashCfg.thm = o.thm || {}; PF.dashCfg.notes = o.notes || [];
        } catch (e) { return; }
        window.pfdCfgClose();   // откат мог поменять/убрать блок с открытым поповером настроек
        saveDashCfg();
        pfdRerender();
    };
    // ---- мультизаметки: добавить / удалить / перекрасить + строки/срок ----

    // ---- перетаскивание: pointer-события вместо HTML5 DnD ----
    // Своё перетаскивание даёт: призрак-клон точно под курсором (вместо
    // системного полупрозрачного снимка), FLIP-анимацию перестановки соседей
    // (сетка не «прыгает»), автопрокрутку у краёв экрана и работу на тач-пене.
    // Оригинальный блок остаётся в потоке как пунктирный слот (.pfd-slot) —
    // предпросмотр нового места всегда живой.
    var pfdDragEl = null;       // блок-слот в сетке
    var pfdGhost = null;        // fixed-клон у курсора
    var pfdGz = 1;              // zoom-фактор контекста призрака (body zoom 0.9)
    var pfdGrabX = 0, pfdGrabY = 0;
    var pfdArm = null;          // { item, x, y } — ждём порог 5px до старта
    var pfdLastPt = null;
    var pfdLastReorder = 0;
    var pfdTick = null;
    var pfdScrollEl = null;     // скролл-контейнер страницы (null = window)
    var pfdHomeNext = null;     // сосед справа на старте драга — для отмены (Esc)
    var pfdDragColKey = null, pfdDragColHome;   // прежняя колонка блока — для отмены
    var pfdDragColStart = null;    // фактическая колонка блока на старте драга (освобождаемая на дропе)
    var pfdDragRects = null;       // снимок мест ВСЕХ блоков на старте драга — для «обмена» на дропе
    var pfdRsCancel = null;     // отмена активного ресайза (функция) — Esc/выход из режима

    function pfdScrollParentOf(el) {
        for (var p = el.parentElement; p; p = p.parentElement) {
            var s = getComputedStyle(p);
            if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
        }
        return null;
    }
    // FLIP: замер до/после перестановки + обратный transform с переходом —
    // соседи плавно съезжаются на новые места вместо мгновенного скачка
    function pfdFlip(grid, mutate) {
        var kids = Array.prototype.slice.call(grid.children);
        var first = kids.map(function (el) { return el.getBoundingClientRect(); });
        mutate();
        kids.forEach(function (el, i) {
            var last = el.getBoundingClientRect();
            var dx = first[i].left - last.left, dy = first[i].top - last.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = 'none';
            el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            requestAnimationFrame(function () {
                el.style.transition = 'transform 200ms cubic-bezier(.2, .7, .3, 1)';
                el.style.transform = '';
            });
            clearTimeout(el._pfdFlipT);
            el._pfdFlipT = setTimeout(function () { el.style.transition = ''; }, 240);
        });
    }
    function pfdStartDrag(item, x, y) {
        var r = item.getBoundingClientRect();
        pfdPushUndo();   // снимок ДО перестановки — Cmd+Z вернёт как было
        pfdDragEl = item;
        pfdHomeNext = item.nextElementSibling;   // исходное место — для отмены
        // прежняя колонка блока — вернём её при отмене жеста (Esc/pointercancel)
        pfdDragColKey = item.getAttribute('data-pfd');
        if (!PF.dashCfg.col) PF.dashCfg.col = {};
        pfdDragColHome = PF.dashCfg.col[pfdDragColKey];
        // фактическая стартовая колонка блока — освобождаемое место для «обмена» на дропе
        var srect0 = pfdGridRect(item);
        pfdDragColStart = srect0 ? srect0.col0 + 1 : null;
        // снимок мест всех блоков ДО жеста: пока блок тащится, pfdPack перекладывает
        // соседей (частичное перекрытие временно роняет их вниз), и «кто был в этом
        // ряду» на дропе надёжно знает только стартовая картинка
        pfdDragRects = {};
        Array.prototype.forEach.call(item.parentNode.children, function (c) {
            if (!c.classList || !c.classList.contains('pfd-item')) return;
            var rr = pfdGridRect(c);
            if (rr) pfdDragRects[c.getAttribute('data-pfd')] = rr;
        });
        // фиксируем текущие колонки ВСЕХ блоков — чтобы при перетаскивании одного остальные
        // не «перепрыгивали» жадной упаковкой (предсказуемость: двигается только твой блок)
        Array.prototype.forEach.call(item.parentNode.children, function (c) {
            if (!c.classList || !c.classList.contains('pfd-item')) return;
            var cid = c.getAttribute('data-pfd');
            if (PF.dashCfg.col[cid] == null) {
                var m = /^\s*(\d+)/.exec(c.style.gridColumn || '');
                if (m) PF.dashCfg.col[cid] = +m[1];
            }
        });
        pfdScrollEl = pfdScrollParentOf(item);
        pfdGrabX = x - r.left; pfdGrabY = y - r.top;
        var g = item.cloneNode(true);
        g.classList.add('pfd-ghost');
        g.classList.remove('pfd-slot');
        g.style.gridColumn = '';
        g.style.width = r.width + 'px';
        g.style.height = r.height + 'px';
        g.style.left = '-9999px'; g.style.top = '0px';
        g.style.transform = 'none';   // на время калибровки: scale исказил бы замер
        document.body.appendChild(g);
        // самокалибровка под zoom: fixed-координаты и размеры клона живут в
        // масштабе body (zoom 0.9), а clientX/rect — в визуальных px
        pfdGz = g.getBoundingClientRect().width / r.width || 1;
        if (Math.abs(pfdGz - 1) > 0.001) {
            g.style.width = (r.width / pfdGz) + 'px';
            g.style.height = (r.height / pfdGz) + 'px';
        }
        g.style.transform = '';       // возвращаем scale(1.02) из класса
        pfdGhost = g;
        pfdMoveGhost(x, y);
        item.classList.add('pfd-slot');
        document.body.classList.add('pfd-dragging-now');
        pfdTick = requestAnimationFrame(pfdAutoScroll);
    }
    function pfdMoveGhost(x, y) {
        if (!pfdGhost) return;
        pfdGhost.style.left = ((x - pfdGrabX) / pfdGz) + 'px';
        pfdGhost.style.top = ((y - pfdGrabY) / pfdGz) + 'px';
    }
    function pfdReorderAt(x, y) {
        if (!pfdDragEl || Date.now() - pfdLastReorder < 55) return;
        var grid = document.getElementById('pfdGrid');
        if (!grid) return;
        var id = pfdDragEl.getAttribute('data-pfd');
        // ---- ЦЕЛЕВАЯ КОЛОНКА из позиции курсора (в layout-px, с поправкой на zoom) ----
        // Перетащенный блок ЗАКРЕПЛЯЕТСЯ за колонку под курсором (PF.dashCfg.col) — pfdPack
        // ставит его именно туда стопкой, оставляя зазор в других колонках. Так «Сводку»
        // можно положить под «Второй» справа, а не в кратчайшую (левую) колонку.
        var gr = grid.getBoundingClientRect();
        var z = gr.width / grid.clientWidth || 1;
        var gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
        var colW = (grid.clientWidth - gap * 11) / 12;
        var span = pfdSpanOf(pfdDragEl, colW, gap);
        // Целимся ПО ЛЕВОМУ КРАЮ перетаскиваемой карточки, а не по курсору: вычитаем захват
        // (pfdGrabX — где пользователь взял блок). Иначе цель смещена на «полкарточки», и чтобы
        // сдвинуть синий слот на колонку, приходится вести курсор заметно дальше. Теперь слот
        // идёт за краем карточки 1:1 — сразу отзывчиво.
        var leftEdge = x - pfdGrabX;
        var targetCol = clamp(Math.round(((leftEdge - gr.left) / z) / (colW + gap)), 0, 12 - span) + 1;  // 1-based
        if (!PF.dashCfg.col) PF.dashCfg.col = {};
        var colChanged = PF.dashCfg.col[id] !== targetCol;
        // ---- ПОРЯДОК В СТОПКЕ: блок под курсором, иначе ближайший по расстоянию ----
        var el = document.elementFromPoint(x, y);
        var over = el && el.closest ? el.closest('.pfd-item') : null;
        if (over && (over === pfdDragEl || over.parentNode !== grid)) over = null;
        if (!over) {
            var bestD = Infinity;
            Array.prototype.forEach.call(grid.children, function (c) {
                if (c === pfdDragEl || !c.classList || !c.classList.contains('pfd-item')) return;
                var cr = c.getBoundingClientRect();
                var cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
                var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
                if (d < bestD) { bestD = d; over = c; }
            });
        }
        var before = false, orderChanged = false;
        if (over && over !== pfdDragEl) {
            // Куда вставлять — ПРОСТРАНСТВЕННО: выше блока или в его левой половине → до;
            // ниже или в правой половине → после.
            var r = over.getBoundingClientRect();
            // Полноширинные блоки (span 12: «Панель управления», «История сделок», «Ставки») —
            // решаем ТОЛЬКО по вертикали (выше середины → перед ним). Для них левая/правая
            // половина бессмысленна, и раньше такой блок было не поднять наверх мимо колоночных
            // карточек (курсор попадал в «правую половину» → всегда «после»).
            var fullW = pfdSpanOf(pfdDragEl, colW, gap) >= 12 || pfdSpanOf(over, colW, gap) >= 12;
            if (y < r.top) before = true;
            else if (y > r.bottom) before = false;
            else if (fullW) before = y < (r.top + r.height / 2);
            else before = x < (r.left + r.width / 2);
            if (before && over.previousElementSibling !== pfdDragEl) orderChanged = true;
            else if (!before && over.nextElementSibling !== pfdDragEl) orderChanged = true;
        }
        if (!colChanged && !orderChanged) return;   // ни колонка, ни порядок не поменялись
        PF.dashCfg.col[id] = targetCol;
        pfdFlip(grid, function () {
            if (orderChanged && over) {
                if (before) grid.insertBefore(pfdDragEl, over);
                else grid.insertBefore(pfdDragEl, over.nextSibling);
            }
            pfdPack();   // masonry: сразу пере-упаковываем — FLIP снимет новые места
        });
        pfdLastReorder = Date.now();
    }
    // у верхней/нижней кромки экрана страница едет сама — длинный дашборд
    // можно пересобрать одним перетаскиванием
    function pfdAutoScroll() {
        if (!pfdDragEl) { pfdTick = null; return; }
        if (pfdLastPt) {
            var m = 90, vh = window.innerHeight, dy = 0;
            if (pfdLastPt.y < m) dy = -Math.ceil((m - pfdLastPt.y) / 5);
            else if (pfdLastPt.y > vh - m) dy = Math.ceil((pfdLastPt.y - (vh - m)) / 5);
            if (dy) {
                if (pfdScrollEl) pfdScrollEl.scrollTop += dy;
                else window.scrollBy(0, dy);
                pfdReorderAt(pfdLastPt.x, pfdLastPt.y);
            }
        }
        pfdTick = requestAnimationFrame(pfdAutoScroll);
    }
    // ---- «ОБМЕН МЕСТАМИ» НА ДРОПЕ: блок брошен на чужие колонки в ряду → сосед(и),
    // которых он накрыл, переезжают в колонки, которые блок освободил. Раньше сосед
    // оставался пришпилен к своей колонке, pfdPack складывал два блока стопкой — и
    // сосед «падал» вниз, разваливая ряд из трёх. Решаем именно на дропе (не в
    // процессе): во время жеста слот сам гуляет между рядами, и «тот же ряд»
    // надёжно определяется только по точке отпускания.
    function pfdResolveRowSwap(item, lp) {
        var grid = document.getElementById('pfdGrid');
        if (!grid || !lp) return;
        var id = item.getAttribute('data-pfd');
        var target = PF.dashCfg.col ? PF.dashCfg.col[id] : null;
        var homeCol = pfdDragColStart;
        if (target == null || homeCol == null || target === homeCol) return;
        var gr = grid.getBoundingClientRect();
        var z = gr.width / grid.clientWidth || 1;
        var gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
        var colW = (grid.clientWidth - gap * 11) / 12;
        var span = pfdSpanOf(item, colW, gap);
        // частичный сдвиг (меньше своей ширины): освобождаемые колонки пересекаются с
        // занятыми — соседа переселять некуда, оставляем свободную расстановку как есть
        if (Math.abs(target - homeCol) < span) return;
        var rowPx = (lp.y - gr.top) / z;      // строка под курсором (grid-auto-rows: 1px)
        var t0 = target - 1, t1 = t0 + span, victims = [];
        // жертвы — по СНИМКУ мест на старте жеста: к моменту дропа pfdPack уже мог
        // временно уронить накрытого соседа вниз, и его живой rect ряд не выдаёт
        Object.keys(pfdDragRects || {}).forEach(function (vid) {
            if (vid === id) return;
            var rc = pfdDragRects[vid];
            if (rowPx < rc.row0 - 8 || rowPx > rc.row1 + 8) return;   // не тот ряд
            var ov = Math.min(rc.right0, t1) - Math.max(rc.col0, t0);
            if (ov < Math.min(span, rc.span) / 2) return;   // лёгкое касание краем — не обмен
            victims.push({ id: vid, rc: rc });
        });
        if (!victims.length) return;
        // вытесненные встают в освобождённые колонки слева направо
        victims.sort(function (a, b) { return a.rc.col0 - b.rc.col0; });
        var cur = homeCol;
        victims.forEach(function (v) {
            PF.dashCfg.col[v.id] = clamp(cur, 1, 12 - v.rc.span + 1);
            cur += v.rc.span;
        });
        pfdFlip(grid, pfdPack);   // соседи плавно съезжаются на новые места
    }
    function pfdEndDrag(cancelled) {
        if (pfdTick) { cancelAnimationFrame(pfdTick); pfdTick = null; }
        // жест кончился, но призрак/FLIP ещё летят — фоновым свопам сюда нельзя
        pfdCalm(360);
        document.body.classList.remove('pfd-dragging-now');
        var item = pfdDragEl, g = pfdGhost, home = pfdHomeNext, lp = pfdLastPt;
        pfdDragEl = null; pfdGhost = null; pfdLastPt = null; pfdHomeNext = null;
        if (!item) return;
        if (!cancelled) { pfdResolveRowSwap(item, lp); pfdSaveOrder(); }
        else {
            // отмена (Esc/pointercancel): живая перестановка уже переставила блок в
            // DOM и закрепила колонку — возвращаем и порядок, и прежнюю колонку, иначе
            // на экране один вид, а сохранён другой (после «Готово» блок «прыгнул» бы)
            if (pfdDragColKey) {
                if (pfdDragColHome == null) { if (PF.dashCfg.col) delete PF.dashCfg.col[pfdDragColKey]; }
                else { if (!PF.dashCfg.col) PF.dashCfg.col = {}; PF.dashCfg.col[pfdDragColKey] = pfdDragColHome; }
            }
            var grid = item.parentNode;
            if (grid && grid.id === 'pfdGrid') {
                pfdFlip(grid, function () {
                    grid.insertBefore(item, home && home.parentNode === grid ? home : null);
                    pfdPack();
                });
            }
        }
        if (g && !cancelled) {
            // призрак мягко «прилетает» в слот и растворяется
            var sr = item.getBoundingClientRect();
            g.style.transition = 'left 170ms cubic-bezier(.2, .7, .3, 1), top 170ms cubic-bezier(.2, .7, .3, 1), transform 170ms, opacity 170ms';
            g.style.left = (sr.left / pfdGz) + 'px';
            g.style.top = (sr.top / pfdGz) + 'px';
            g.style.transform = 'none';
            g.style.opacity = '0.6';
            setTimeout(function () {
                if (g.parentNode) g.parentNode.removeChild(g);
                item.classList.remove('pfd-slot');
            }, 180);
        } else {
            // отмена: блок сам плавно едет на исходное место (FLIP выше), призрак
            // просто растворяется у курсора — лететь ему больше некуда
            item.classList.remove('pfd-slot');
            if (g) {
                g.style.transition = 'opacity 150ms, transform 150ms';
                g.style.opacity = '0';
                setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 160);
            }
        }
    }
    document.addEventListener('pointerdown', function (e) {
        if (!pfdLive() || e.button !== 0) return;
        var it = null;
        var grip = e.target.closest ? e.target.closest('.pfd-move') : null;
        if (grip) {
            // грип-ручка по верхней грани — работает ВСЕГДА (в т.ч. при закрытой карточке,
            // чтобы содержимое блока — тикеры/меню/скролл — оставалось кликабельным)
            it = grip.closest('.pfd-grid.pfd-live .pfd-item');
        } else if (PF.dashEdit && e.target.closest) {
            // в режиме настройки (карточка «Раскладка» открыта) блок тащится за ЛЮБОЕ
            // место — левый край, тело, шапку — кроме интерактивных элементов (кнопки,
            // ссылки, поля, редактируемый текст заметок, ручки ресайза, глаз/корзина)
            if (e.target.closest('button, a, input, textarea, select, [contenteditable="true"], .pfnt-tx, .pfd-rs, .pfd-rs-r, .pfd-rs-b, .pfd-rs-l, .pfd-eye, .pfd-cardrm')) return;
            it = e.target.closest('#pfdGrid.pfd-live .pfd-item');
        }
        if (!it) return;
        e.preventDefault();
        pfdArm = { item: it, x: e.clientX, y: e.clientY };
    });
    document.addEventListener('pointermove', function (e) {
        if (pfdArm && !pfdDragEl && !pfdRsCancel) {   // во время ресайза драг не стартует
            // порог 5px: случайный клик не превращается в перетаскивание
            if (Math.abs(e.clientX - pfdArm.x) + Math.abs(e.clientY - pfdArm.y) > 5) {
                pfdStartDrag(pfdArm.item, pfdArm.x, pfdArm.y);
            }
        }
        if (!pfdDragEl) return;
        pfdLastPt = { x: e.clientX, y: e.clientY };
        pfdMoveGhost(e.clientX, e.clientY);
        pfdReorderAt(e.clientX, e.clientY);
    });
    document.addEventListener('pointerup', function () {
        pfdArm = null;
        if (pfdDragEl) pfdEndDrag(false);
    });
    document.addEventListener('pointercancel', function () {
        pfdArm = null;
        if (pfdDragEl) pfdEndDrag(true);
    });
    function pfdSaveOrder() {
        var grid = document.getElementById('pfdGrid');
        if (!grid) return;
        PF.dashCfg.order = Array.prototype.map.call(grid.children, function (el) {
            return el.getAttribute('data-pfd');
        }).filter(Boolean);
        saveDashCfg();
    }

    // ---- изменение размера за уголок ----
    // Дельтовый ресайз: считаем от стартовой ширины/высоты блока, а не от его
    // rect на каждом шаге — блок может переехать на другой ряд, расчёт не
    // разваливается. Вся геометрия в layout-px (offsetWidth), курсорные дельты
    // делим на zoom-фактор — при body{zoom:0.9} колонки совпадают с сеткой.
    // Высота фиксируется ТОЛЬКО при заметном вертикальном движении: ширину
    // можно менять, не замораживая природную высоту блока.
    document.addEventListener('pointerdown', function (e) {
        var rs = e.target.closest ? e.target.closest('.pfd-rs, .pfd-rs-r, .pfd-rs-b, .pfd-rs-l') : null;
        if (!rs || !pfdLive() || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var item = rs.closest('.pfd-item');
        var grid = document.getElementById('pfdGrid');
        if (!item || !grid) return;
        // ось ресайза по ручке: правая кромка — ширина вправо, ЛЕВАЯ — ширина влево
        // (правый край закреплён), нижняя — высота, уголок — обе
        var axis = rs.classList.contains('pfd-rs-r') ? 'x'
                 : rs.classList.contains('pfd-rs-l') ? 'xl'
                 : rs.classList.contains('pfd-rs-b') ? 'y' : 'both';
        var gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
        var gr = grid.getBoundingClientRect();
        var z = gr.width / grid.offsetWidth || 1;
        var colW = (grid.offsetWidth - gap * 11) / 12;
        var startX = e.clientX, startY = e.clientY;
        var startW = item.offsetWidth, startH = item.offsetHeight;
        var hadH = item.classList.contains('pfd-hset');
        var hadPtall = item.classList.contains('pfd-ptall');
        var startColStyle = item.style.gridColumn, startHStyle = item.style.height, startMinHStyle = item.style.minHeight;
        var id = item.getAttribute('data-pfd');
        // ОБЩЕЕ ПРАВИЛО виджетов: минимум по высоте = натуральная высота блока (его контент),
        // а не фикс-порог 240 — иначе «Ставки» (полоса ~85px) и т.п. нельзя вернуть в линию.
        // natH меряем один раз на старте: снимаем заданную высоту/hset/ptall, читаем offsetHeight,
        // возвращаем как было (синхронно, без мигания). Утянул ниже natH → блок сворачивается в АВТО.
        var natH = (function () {
            var sh = item.style.height, smh = item.style.minHeight,
                hh = item.classList.contains('pfd-hset'), pt = item.classList.contains('pfd-ptall');
            item.style.height = ''; item.style.minHeight = '';
            item.classList.remove('pfd-hset'); item.classList.remove('pfd-ptall');
            var n = item.offsetHeight;
            item.style.height = sh; item.style.minHeight = smh;
            if (hh) item.classList.add('pfd-hset'); if (pt) item.classList.add('pfd-ptall');
            return n;
        })();
        // R7: блок можно УЖИМАТЬ НИЖЕ натуральной высоты (контент клипуется hset и скроллится
        // внутри) — «снап» в авто-высоту только в узком окне ±16px вокруг натуральной.
        var snapLo = natH - 16, snapHi = natH + 16;
        var minH = 88;                // абсолютный пол тяги (совсем в нитку не ужать)
        var newSpan = 0, newH = 0, hMode = hadH || axis === 'y';
        // ---- левая кромка: правый край блока закреплён, левый едет → span и стартовая
        // колонка меняются вместе. Считаем текущую стартовую колонку и «колонку за правым
        // краем» из реального положения блока в сетке; фиксируем колонки ВСЕХ блоков, чтобы
        // при уширении влево остальные не «прыгали» жадной упаковкой (как при перетаскивании).
        var startColNum = clamp(Math.round(((item.getBoundingClientRect().left - gr.left) / z) / (colW + gap)), 0, 11) + 1;
        var startSpanNum = pfdSpanOf(item, colW, gap);
        var rightEdgeCol = startColNum + startSpanNum;   // 1-based индекс колонки ЗА правым краем
        var leftColStartHome = (PF.dashCfg.col && PF.dashCfg.col[id] != null) ? PF.dashCfg.col[id] : null;
        if (axis === 'xl') {
            if (!PF.dashCfg.col) PF.dashCfg.col = {};
            Array.prototype.forEach.call(grid.children, function (c) {
                if (!c.classList || !c.classList.contains('pfd-item')) return;
                var cid = c.getAttribute('data-pfd');
                if (PF.dashCfg.col[cid] == null) {
                    var m = /^\s*(\d+)/.exec(c.style.gridColumn || '');
                    if (m) PF.dashCfg.col[cid] = +m[1];
                }
            });
        }
        pfdArm = null;   // гасим возможный «взвод» драга — ресайз и драг не смешиваются
        pfdPushUndo();
        item.classList.add('pfd-resizing');
        // ОБЩЕЕ ПРАВИЛО «делитель»: тянем боковую кромку блока НАРУЖУ → соседи с ЭТОЙ стороны
        // (в тех же рядах) не уезжают вниз, а СЖИМАЮТСЯ (их край у нашего блока едет за нашей
        // кромкой, дальний край на месте); тянем внутрь — растут обратно. Работает у обеих
        // боковых кромок (правая axis 'x', левая 'xl'), если с этой стороны есть с кем «поделиться».
        var pushNb = null, pushA = null, pushOrig = null;
        if (axis === 'x' || axis === 'xl') {
            var raStart = pfdGridRect(item);
            if (raStart) {
                var nb = [];
                Array.prototype.forEach.call(grid.children, function (c) {
                    if (c === item || !c.classList || !c.classList.contains('pfd-item')) return;
                    var rc = pfdGridRect(c); if (!rc) return;
                    var rowOverlap = rc.row0 < raStart.row1 - 0.5 && rc.row1 > raStart.row0 + 0.5;
                    if (!rowOverlap) return;
                    // справа (для правой кромки): левый край соседа = наш правый;
                    // слева (для левой кромки): правый край соседа = наш левый
                    var isNb = axis === 'x' ? (rc.col0 >= raStart.right0 - 0.5) : (rc.right0 <= raStart.col0 + 0.5);
                    if (isNb) nb.push({ el: c, id: c.getAttribute('data-pfd'), col0: rc.col0, span: rc.span, right0: rc.right0 });
                });
                if (nb.length) {
                    if (!PF.dashCfg.col) PF.dashCfg.col = {};
                    pushNb = nb; pushA = { col0: raStart.col0, span: raStart.span, right0: raStart.right0 };
                    pushOrig = { cols: {}, spans: {} };
                    pushOrig.cols[id] = PF.dashCfg.col[id]; pushOrig.spans[id] = PF.dashCfg.span[id];
                    nb.forEach(function (n) { pushOrig.cols[n.id] = PF.dashCfg.col[n.id]; pushOrig.spans[n.id] = PF.dashCfg.span[n.id]; });
                }
            }
        }
        // без направляющей-пунктира, текстового бейджа и прочих подсказок: соседи сами
        // переезжают под новый размер (masonry), размер виден по самому блоку
        function cleanup() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            item.classList.remove('pfd-resizing');
            pfdRsCancel = null;
            // единственный выход из ресайза (и обычный, и по Esc): соседи ещё съезжаются
            // FLIP-ом под новый размер — фоновым свопам сюда нельзя
            pfdCalm(360);
        }
        var newColStart = 0;
        function onMove(ev) {
            var dx = (ev.clientX - startX) / z, dy = (ev.clientY - startY) / z;
            if (axis === 'y') dx = 0;      // нижняя кромка — ширину не трогаем
            if (axis === 'x' || axis === 'xl') dy = 0;   // боковые кромки — высоту не трогаем
            if (axis === 'xl' && pushNb) {
                // левая кромка + есть соседи слева → «делитель»: наш блок растёт влево, соседи
                // сжимаются (их ЛЕВЫЕ края на месте, ПРАВЫЕ едут за нашим левым). Правый край
                // нашего блока закреплён. Самому «тесному» слева соседу оставляем ≥3 колонки.
                var maxNbCol0 = Math.max.apply(null, pushNb.map(function (n) { return n.col0; }));
                var maxSpanL = Math.max(3, pushA.right0 - (maxNbCol0 + 3));
                newSpan = clamp(Math.round((startW - dx + gap) / (colW + gap)), 3, maxSpanL);
                var aLeft = pushA.right0 - newSpan;     // левый край нашего блока (0-базово)
                newColStart = aLeft + 1;
                PF.dashCfg.col[id] = newColStart;          // правый край держится: col = right0 − span
                pushNb.forEach(function (n) {
                    var ns = Math.max(3, aLeft - n.col0);
                    n.el.style.gridColumn = 'span ' + ns;   // pfdSpanOf читает span отсюда
                    PF.dashCfg.col[n.id] = n.col0 + 1;          // левый край соседа на месте
                    n._span = ns;
                });
            } else if (axis === 'xl') {
                // левая кромка без соседей слева: тянем влево (dx<0) → шире. Правый край
                // закреплён: новая стартовая колонка = (колонка за правым краем) − новый span.
                newSpan = clamp(Math.round((startW - dx + gap) / (colW + gap)), 3, 12);
                newColStart = clamp(rightEdgeCol - newSpan, 1, 12);
                newSpan = rightEdgeCol - newColStart;   // держим согласованность после clamp
                PF.dashCfg.col[id] = newColStart;
            } else if (axis === 'x' && pushNb) {
                // правая кромка + есть соседи справа → «делитель»: наш блок растёт вправо,
                // соседи сжимаются (их правые края на месте, левые едут за нашим правым).
                // Ограничение: самому «тесному» соседу оставляем ≥3 колонки.
                var minRight = Math.min.apply(null, pushNb.map(function (n) { return n.right0; }));
                var maxSpanA = Math.max(3, minRight - pushA.col0 - 3);
                newSpan = clamp(Math.round((startW + dx + gap) / (colW + gap)), 3, maxSpanA);
                var aRight = pushA.col0 + newSpan;      // правый край нашего блока (0-базово)
                PF.dashCfg.col[id] = pushA.col0 + 1;       // левый край нашего блока закреплён
                pushNb.forEach(function (n) {
                    var ns = Math.max(3, n.right0 - aRight);
                    n.el.style.gridColumn = 'span ' + ns;   // pfdSpanOf читает span отсюда
                    PF.dashCfg.col[n.id] = aRight + 1;          // левый край соседа = наш правый
                    n._span = ns;
                });
            } else {
                newSpan = clamp(Math.round((startW + dx + gap) / (colW + gap)), 3, 12);
            }
            if (!hMode && Math.abs(dy) > 8) hMode = true;
            item.style.gridColumn = 'span ' + newSpan;
            if (hMode) {
                newH = clamp(Math.round(startH + dy), minH, 1400);
                var collapse = newH >= snapLo && newH <= snapHi;   // около натуральной → снап в авто
                if (id === 'panel') {
                    // Панель пишет min-height (как и рендер) — не height: иначе стей­л
                    // min-height из прошлого рендера конфликтует с новым height и СТОПОРИТ
                    // сжатие. min-height растёт под контент (не режет поповеры hset-клипом).
                    if (collapse) { item.style.minHeight = ''; item.style.height = ''; item.classList.remove('pfd-ptall'); }
                    else {
                        item.style.minHeight = newH + 'px'; item.style.height = '';
                        // раскладка-колонка pfd-ptall ПРЯМО во время тяги (порог = натуральной
                        // высоте колонки, чтобы сжатие/переход шли без «залипания» и наезда)
                        item.classList.toggle('pfd-ptall', newH >= PFD_PANEL_TALL);
                    }
                } else if (collapse) {
                    // ОБЩЕЕ: любой блок утянутый к натуральной высоте — обратно в авто (без hset-клипа),
                    // так «Ставки» и др. возвращаются в компактную линию, а не застревают
                    item.style.height = ''; item.style.minHeight = ''; item.classList.remove('pfd-hset');
                } else {
                    item.style.height = newH + 'px'; item.classList.add('pfd-hset');
                }
            }
            pfdRepackSoon();   // masonry: соседи переезжают под новый размер
        }
        function onUp() {
            cleanup();
            var changed = false;
            // ширину пишем только когда её реально можно было менять (не чистый ресайз высоты) —
            // иначе «пиннили» бы текущий span поверх дефолта
            if (newSpan && axis !== 'y') { PF.dashCfg.span[id] = newSpan; changed = true; }
            if (axis === 'xl' && newColStart) { PF.dashCfg.col[id] = newColStart; changed = true; }
            // «делитель»: сохраняем ужатые/выросшие размеры соседей (их col уже в PF.dashCfg.col
            // из onMove); наш col тоже закреплён (левый край у правой кромки / он же у левой)
            if ((axis === 'x' || axis === 'xl') && pushNb) {
                pushNb.forEach(function (n) { if (n._span) PF.dashCfg.span[n.id] = n._span; });
                changed = true;
            }
            if (hMode && newH) {
                // ОБЩЕЕ ПРАВИЛО: около натуральной высоты (±16px) → сбрасываем в АВТО (не пишем
                // cfg.h); заметно выше ИЛИ НИЖЕ натуральной — сохраняем заданную высоту (ужатый
                // блок клипуется hset, списки скроллятся внутри).
                if (newH >= snapLo && newH <= snapHi) {
                    delete PF.dashCfg.h[id]; item.style.height = ''; item.style.minHeight = '';
                    item.classList.remove('pfd-ptall'); item.classList.remove('pfd-hset');
                } else { PF.dashCfg.h[id] = newH; }
                changed = true;
            }
            if (changed) saveDashCfg();
            PF.pfdHeatRepaintSoon();   // карта рынка перерисовывается под новый размер блока
            // высота изменилась → перерисовываем содержимое: списки пересчитывают число
            // строк под новый размер (pfdRowsFor), графики перетягиваются — данные
            // «подстраиваются», а не клипуются молча
            if (hMode && newH) pfdRerender();
        }
        // Esc/выход из режима во время ресайза: возвращаем стартовые размеры,
        // ничего не сохраняем — вместо прежнего выхода из конструктора «на полпути»
        pfdRsCancel = function () {
            cleanup();
            item.style.gridColumn = startColStyle;
            item.style.height = startHStyle;
            item.style.minHeight = startMinHStyle;
            if (axis === 'xl') {   // вернуть прежнюю стартовую колонку (или снять, если её не было)
                if (leftColStartHome == null) { if (PF.dashCfg.col) delete PF.dashCfg.col[id]; }
                else PF.dashCfg.col[id] = leftColStartHome;
            }
            // «делитель»: откат col/span нашего блока и всех соседей к состоянию до тяги
            if (pushNb && pushOrig) {
                Object.keys(pushOrig.cols).forEach(function (k) {
                    if (pushOrig.cols[k] == null) { if (PF.dashCfg.col) delete PF.dashCfg.col[k]; } else PF.dashCfg.col[k] = pushOrig.cols[k];
                    if (pushOrig.spans[k] == null) { if (PF.dashCfg.span) delete PF.dashCfg.span[k]; } else PF.dashCfg.span[k] = pushOrig.spans[k];
                });
                pushNb.forEach(function (n) { n.el.style.gridColumn = 'span ' + (pushOrig.spans[n.id] || n.span); });
            }
            if (!hadH) item.classList.remove('pfd-hset');
            if (id === 'panel') item.classList.toggle('pfd-ptall', hadPtall);
            pfdRepackSoon();
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    });
    // двойной клик по ручке ресайза — сброс: кромка сбрасывает свою ось (ширину/высоту),
    // уголок — ступенчато (сперва высота в авто, следующий дабл-клик — ширина по умолчанию)
    document.addEventListener('dblclick', function (e) {
        var rs = e.target.closest ? e.target.closest('.pfd-rs, .pfd-rs-r, .pfd-rs-b, .pfd-rs-l') : null;
        if (!rs || !pfdLive()) return;
        var item = rs.closest('.pfd-item');
        var id = item && item.getAttribute('data-pfd');
        if (!id) return;
        pfdPushUndo();
        var axis = rs.classList.contains('pfd-rs-r') ? 'x'
                 : rs.classList.contains('pfd-rs-l') ? 'x'
                 : rs.classList.contains('pfd-rs-b') ? 'y' : 'both';
        if (axis === 'x') { delete PF.dashCfg.span[id]; toast('Ширина — по умолчанию'); }
        else if (axis === 'y') { delete PF.dashCfg.h[id]; toast('Высота — авто'); }
        else if (PF.dashCfg.h[id] != null) { delete PF.dashCfg.h[id]; toast('Высота — авто'); }
        else { delete PF.dashCfg.span[id]; toast('Ширина — по умолчанию'); }
        saveDashCfg();
        pfdRerender();
    });
    // Esc: сперва отменяет активный жест (перетаскивание, затем ресайз), затем —
    // если открыт тулбокс — закрывает его
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !pfdLive()) return;
        var panel = document.getElementById('panel-portfolios');
        if (!panel || !panel.classList.contains('active')) return;
        // pfdArm сбрасываем всегда: иначе зажатая кнопка мыши после отмены тут же
        // перезапускала бы драг
        pfdArm = null;
        if (pfdDragEl) { pfdEndDrag(true); return; }
        if (pfdRsCancel) { pfdRsCancel(); return; }
        if (PF.dashEdit) window.pfLayoutClose();
    });
    // клик ВНЕ карточки «Добавить виджет» закрывает её — как ждёшь от оверлея (раньше
    // закрывали только ✕/Esc, и казалось, что карточка «не закрывается»). Не трогаем клики
    // внутри карточки, по кнопкам её открытия/раскладки, по модалкам в <body> и во время жеста.
    document.addEventListener('click', function (e) {
        if (!PF.dashEdit) return;
        var t = e.target; if (!t || !t.closest) return;
        // клик по элементу, который обработчик уже УСПЕЛ перерисовать (innerHTML-своп в
        // pfl2Paint и т.п.): узел оторван от DOM, closest('.pfl-panel') даёт null и карточка
        // закрывалась ЛЮБЫМ кликом внутри пикера. Оторванные узлы игнорируем.
        if (!t.isConnected) return;
        if (t.closest('.pfl-panel')) return;
        if (t.closest('#pfLayoutBtn') || t.closest('#pfLayoutCfgWrap') || t.closest('.pfp-cfg') || t.closest('.pfp-btn')) return;
        if (t.closest('#pfConfirmOv')) return;
        if (pfdBusy()) return;
        window.pfLayoutClose();
    });

    // все портфели скрыты — осознанное пустое состояние с кнопкой «показать все»

    // ====================================================================
    //  R7 — ПИКЕР «ДОБАВИТЬ ВИДЖЕТ»: категории + карточки с ДЕМО-превью + настройки
    // ====================================================================
    // категории пикера: [key, name, svg-иконка] — иконка у КАЖДОЙ (как в референсе)
    var PFL2_CATS = [
        ['pop', 'Популярные', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2.8 14.9 9 21.7 9.9 16.8 14.5 18 21.2 12 18 6 21.2 7.2 14.5 2.3 9.9 9.1 9"/></svg>'],
        ['over', 'Обзор портфеля', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/></svg>'],
        ['charts', 'Графики и аналитика', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="6 14 10 10 14 12 20 5.5"/></svg>'],
        ['assets', 'Активы и позиции', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'],
        ['profit', 'Доходность и прибыль', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'],
        ['divs', 'Дивиденды и выплаты', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><circle cx="16.5" cy="15" r="1.4" fill="currentColor" stroke="none"/></svg>'],
        ['market', 'Рынок и индексы', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="10" rx="1.7"/><rect x="13" y="3" width="8" height="6" rx="1.7"/><rect x="13" y="11" width="8" height="10" rx="1.7"/><rect x="3" y="15" width="8" height="6" rx="1.7"/></svg>'],
        ['notes', 'Заметки и задачи', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/><path d="M8.5 13.5h7"/><path d="M8.5 17h5"/></svg>'],
        ['cal', 'Календарь и события', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/></svg>'],
        ['other', 'Прочее', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>']
    ];
    function pfl2Catalog() {
        var list = [
            { id: 'cap', name: 'График капитала', desc: 'Динамика стоимости портфеля за выбранный период', cats: ['pop', 'over', 'charts'], chart: true },
            { id: 'alloc', name: 'Распределение активов', desc: 'Структура портфеля по классам активов', cats: ['pop', 'over', 'charts'] },
            { id: 'kpi:cap', name: 'Суммарный капитал и прибыль', desc: 'Общая стоимость и прибыль по всем портфелям', cats: ['pop', 'over', 'profit'] },
            { id: 'kpi:day', name: 'KPI · За сегодня', desc: 'Ключевые показатели за сегодня', cats: ['pop', 'over', 'profit'] },
            { id: 'divs', name: 'Дивиденды', desc: 'Ожидаемые и полученные дивиденды и купоны', cats: ['pop', 'divs', 'cal'] },
            { id: 'heat', name: 'Карта рынка', desc: 'Тепловая карта рынка по секторам и компаниям', cats: ['pop', 'market'] },
            { id: 'assets', name: 'Список активов', desc: 'Ваши активы и их текущая стоимость', cats: ['assets', 'over'] },
            { id: 'broker', name: 'Позиции у брокера', desc: 'Живой портфель счёта из API Т-Инвестиций со сверкой с трекером', cats: ['pop', 'assets', 'over'] },
            { id: 'ops', name: 'Последние операции', desc: 'История последних операций по портфелю', cats: ['assets', 'other'] },
            { id: '__note', name: 'Заметка', desc: 'Быстрая заметка, список задач или идеи', cats: ['notes', 'other'] },
            { id: 'kpi:next', name: 'Ближайшая выплата', desc: 'Ближайший купон или дивиденд — дата и сумма', cats: ['divs', 'cal'] },
            { id: 'cal', name: 'Календарь выплат · список', desc: 'Купоны, дивиденды и погашения на год вперёд', cats: ['divs', 'cal'] },
            { id: 'calm', name: 'Календарь выплат · месяц', desc: 'Месячная сетка: в какие дни придут выплаты и сколько', cats: ['pop', 'divs', 'cal'] },
            { id: 'yield', name: 'Доходность портфелей', desc: 'Сравнение доходности ваших портфелей', cats: ['profit', 'charts'] },
            { id: 'snaps', name: 'Снимки капитала', desc: 'Дневные значения стоимости и их изменение', cats: ['profit', 'other'] },
            { id: 'news', name: 'Новости по позициям', desc: 'Свежие новости по бумагам ваших портфелей', cats: ['market'] },
            { id: 'fav', name: 'Избранное', desc: 'Потенциал и свежая новость по любимым тикерам', cats: ['market', 'assets'] },
            { id: 'rates', name: 'Ставки рынка', desc: 'Ключевая ставка, вклады, инфляция и ОФЗ 10 лет', cats: ['market', 'other'] },
            { id: 'movers', name: 'Лидеры дня', desc: 'Сильнейшие дневные движения ваших бумаг', cats: ['charts', 'assets', 'market'] },
            { id: 'idx', name: 'Рынок сейчас', desc: 'IMOEX, доллар и биткойн — живые значения', cats: ['market', 'other'] },
            { id: 'passive', name: 'Пассивный доход', desc: 'Купоны и дивиденды в пересчёте на месяц', cats: ['divs', 'profit'] },
            { id: 'conc', name: 'Диверсификация', desc: 'Доли крупнейших позиций и вердикт о концентрации', cats: ['charts', 'profit'] },
            // R8: виджеты подвкладок — доступны на любой подвкладке
            { id: 'plist', name: 'Список портфелей', desc: 'Все портфели: стоимость, доходность и мини-график', cats: ['pop', 'over', 'assets'] },
            { id: 'pstruct', name: 'Структура по портфелям', desc: 'Кольцо: как капитал распределён между портфелями', cats: ['over', 'charts'] },
            { id: 'psum', name: 'Сводные показатели', desc: 'Общая стоимость, доходность, вложения и число активов', cats: ['over', 'profit'] },
            { id: 'pdetail', name: 'Составы портфелей', desc: 'Полные таблицы бумаг каждого портфеля с показателями', cats: ['assets'] },
            { id: 'reports', name: 'Отчёты и экспорт', desc: 'Excel-выгрузки, бэкап и импорт данных', cats: ['other'] },
            { id: 'set:corner', name: 'Отображение карточек', desc: 'Настройка скругления углов виджетов', cats: ['other'] },
            { id: 'set:vis', name: 'Видимость', desc: 'Какие портфели и секции показывать', cats: ['other'] },
            { id: 'set:layout', name: 'Раскладки', desc: 'Вход в панель раскладок и сохранение вида', cats: ['other'] },
            { id: 'set:bg', name: 'Фон страницы', desc: 'Общая подложка сайта: мозаика, шалфейный, градиент и другие', cats: ['other'] }
        ];
        if (PF.store.items.length >= 2) list.push({ id: 'sum', name: 'Сводка портфелей', desc: 'Суммарный капитал и лидерборд портфелей', cats: ['over', 'profit'] });
        // Карточки терминала — только на своей подвкладке: на «Обзоре» им неоткуда
        // взять поллинг и подключение. Раньше их в каталоге не было вовсе, и
        // удалённый корзиной стакан вернуть было нечем.
        if (PF.dashTab === 'trading' && PF.pftSlotNums) {
            PF.pftSlotNums().forEach(function (n) {
                list.push({ id: pftObId(n), name: PF.pftSlotLabel('ob', n),
                    desc: 'Биржевой стакан по оси цены — клик подставляет цену в заявку', cats: ['pop', 'market'] });
                list.push({ id: pftTkId(n), name: PF.pftSlotLabel('ticket', n),
                    desc: 'Заявка: лимитная, рыночная или стоп, с предохранителями', cats: ['pop', 'market'] });
            });
            list.push({ id: 'trade:orders', name: 'Мои заявки',
                desc: 'Активные и стоп-заявки счёта: статус, исполнение, отмена', cats: ['pop', 'market'] });
            if (PF.pftSlotNums().length < (PF.pftMaxSlots || 4)) {
                list.push({ id: '__trade', name: 'Ещё одна бумага',
                    desc: 'Второй стакан и заявка по другому тикеру — рядом с первым', cats: ['pop', 'market'] });
            }
        }
        // R9: карточки портфелей — тоже виджеты каталога: вернуть убранную карточку на
        // вкладку-портфель или продублировать её на любую другую подвкладку
        visibleItems().forEach(function (p) {
            list.push({ id: 'pf:' + p.id, name: 'Портфель «' + p.name + '»', desc: 'Полная карточка портфеля: состав, мини-график и настройки', cats: ['assets'] });
        });
        return list;
    }
    var pfl2Cat = 'pop', pfl2Q = '', pfl2Sel = 'cap';
    // ВЫБОР — МНОЖЕСТВЕННЫЙ: pfl2SelIds — все отмеченные виджеты в порядке выбора (их и
    // добавит кнопка), pfl2Sel — тот, чьи настройки показаны справа (последний нажатый).
    // Клик по карточке переключает её участие в выборе; настройки — СВОИ у каждого
    // виджета (pfl2OptMap), поэтому в одной пачке можно добавить светлый график и
    // тёмный список, не перебивая опции друг другу.
    var pfl2SelIds = ['cap'];
    var pfl2OptMap = {};
    function pfl2DefOpts() { return { size: 'm', theme: 'light', view: 'line', period: '30' }; }
    function pfl2OptsOf(id) {
        if (!id) return pfl2DefOpts();
        if (!pfl2OptMap[id]) pfl2OptMap[id] = pfl2DefOpts();
        return pfl2OptMap[id];
    }
    function pfl2IsSel(id) { return pfl2SelIds.indexOf(id) >= 0; }
    // каталог с учётом видимости: скрытые админом виджеты (pfWGates) обычный
    // пользователь не видит вовсе; админ видит все (скрытые — приглушёнными)
    function pfl2Visible() {
        var all = pfl2Catalog();
        if (pfIsAdmin()) return all;
        return all.filter(function (w) { return !pfWGates[w.id]; });
    }
    function pfl2Filtered() {
        var all = pfl2Visible();
        if (pfl2Q) {
            return all.filter(function (w) {
                return (w.name + ' ' + w.desc).toLowerCase().indexOf(pfl2Q) >= 0;
            });
        }
        return all.filter(function (w) { return w.cats.indexOf(pfl2Cat) >= 0; });
    }
    function pfl2ById(id) { return pfl2Catalog().filter(function (w) { return w.id === id; })[0] || null; }
    // виджет уже на дашборде? (деф-видимые блоки — если не скрыты; defHidden — при явном
    // показе). R8: деф-видимые есть только на «Обзоре», на подвкладках всё опт-ин.
    function pfl2IsAdded(id) {
        if (id === '__note' || id === '__trade') return false;   // «плодящие» — всегда доступны
        var m = PF.dashCfg.hidden || {};
        if (id === 'cap') return m.cap === 0 || m.cap2 === 0;
        // карточки портфелей на «Обзоре» видимы по умолчанию — «нет на дашборде»
        // только при явном скрытии (hidden=1)
        if (id.indexOf('pf:') === 0 && PF.dashTab === 'overview') return m[id] !== 1;
        var defOn = PF.dashTab === 'overview' ? { fav: 1, cal: 1, rates: 1, trades: 1, sum: 1 } : {};
        if (defOn[id]) return !m[id];
        return m[id] === 0;
    }
    // ---- ДЕМО-превью (всегда статичные примеры, никаких живых данных) ----
    // плавная растущая кривая с заливкой и точкой на конце — как график в референсе
    var PFL2_DEMO_PATH = 'M4 70 C 26 64, 40 68, 58 60 C 78 51, 88 58, 106 46 C 126 33, 138 41, 156 28 C 174 16, 190 22, 206 12 L 214 9';
    var PFL2_DEMO_LINE = '<svg viewBox="0 0 220 84" class="dm-svg" preserveAspectRatio="none">' +
        '<line x1="0" y1="22" x2="220" y2="22" class="dm-grid"/><line x1="0" y1="46" x2="220" y2="46" class="dm-grid"/><line x1="0" y1="70" x2="220" y2="70" class="dm-grid"/>' +
        '<path d="' + PFL2_DEMO_PATH + ' L 214 82 L 4 82 Z" class="dm-area"/>' +
        '<path d="' + PFL2_DEMO_PATH + '" class="dm-line"/>' +
        '<circle cx="214" cy="9" r="3.2" class="dm-dot"/></svg>';
    // тот же график столбцами — для живого превью «Вид графика: столбцы»
    var PFL2_DEMO_BARS = (function () {
        var hs = [26, 32, 24, 38, 30, 44, 40, 52, 46, 58, 50, 64, 60, 70, 66, 74], out = '';
        hs.forEach(function (h, i) {
            out += '<rect x="' + (6 + i * 13.4) + '" y="' + (80 - h) + '" width="9" height="' + h + '" rx="2.5" class="dm-bar"/>';
        });
        return '<svg viewBox="0 0 220 84" class="dm-svg" preserveAspectRatio="none">' +
            '<line x1="0" y1="22" x2="220" y2="22" class="dm-grid"/><line x1="0" y1="46" x2="220" y2="46" class="dm-grid"/><line x1="0" y1="70" x2="220" y2="70" class="dm-grid"/>' +
            out + '</svg>';
    })();
    var PFL2_PERIOD_LBL = { 7: '7 дней', 30: '30 дней', 90: '3 месяца', 365: 'год', all: 'всё время' };
    function pfl2DemoHtml(id, o) {
        // o — опции живого превью (только у ВЫБРАННОЙ карточки): вид графика и период
        // меняют само демо; тема и высота — классами контейнера (см. pfl2MainHtml)
        if (id === 'cap') {
            var chart = (o && o.view === 'bars') ? PFL2_DEMO_BARS : PFL2_DEMO_LINE;
            var per = o ? '<i class="dm-per">' + (PFL2_PERIOD_LBL[o.period] || '30 дней') + '</i>' : '';
            return '<div class="dm-cap">' + chart + per + '</div>';
        }
        if (id === 'alloc') {
            return '<div class="dm-alloc"><svg viewBox="0 0 84 84" class="dm-donut">' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#e8edf4" stroke-width="13"/>' +
                '<g transform="rotate(-90 42 42)">' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#4c5ef7" stroke-width="13" stroke-dasharray="113 188"/>' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#31c48d" stroke-width="13" stroke-dasharray="56 188" stroke-dashoffset="-113"/>' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#f4b740" stroke-width="13" stroke-dasharray="15 188" stroke-dashoffset="-169"/>' +
                '</g></svg>' +
                '<div class="dm-leg">' +
                    '<span><i style="background:#4c5ef7"></i>Акции<b>60%</b></span>' +
                    '<span><i style="background:#31c48d"></i>Облигации<b>30%</b></span>' +
                    '<span><i style="background:#f4b740"></i>ETF<b>8%</b></span>' +
                    '<span><i style="background:#94a3b8"></i>Денежные средства<b>2%</b></span>' +
                '</div></div>';
        }
        if (id === 'kpi:cap') {
            // как в референсе: значение + дельта + зелёная кривая в светлом боксе
            return '<div class="dm-kcap"><div class="dm-kcap-box"><b>123 764 602 ₽</b>' +
                '<span class="pos">+50 330 434 ₽ <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><polyline points="8 7 17 7 17 16"/></svg> +68,5%</span>' +
                PFL2_DEMO_LINE + '</div></div>';
        }
        if (id === 'kpi:day') {
            return '<div class="dm-chips">' +
                '<span class="dm-chip"><i>Прибыль</i><b class="pos">+412 590</b></span>' +
                '<span class="dm-chip"><i>Доходность</i><b class="pos">+0,73%</b></span>' +
                '<span class="dm-chip"><i>Операции</i><b>12</b></span></div>';
        }
        if (id === 'kpi:next') {
            return '<div class="dm-rows"><span class="dm-row"><i>29.07.2026</i><em>ОФЗ 26233</em><b class="pos">+8 913 ₽</b></span>' +
                '<span class="dm-row"><i>04.08.2026</i><em>SBER</em><b class="pos">+23 400 ₽</b></span></div>';
        }
        if (id === 'divs') {
            return '<div class="dm-rows dm-divs">' +
                '<span class="dm-row dm-box"><i>Получено</i><b class="pos">+23 540 ₽</b></span>' +
                '<span class="dm-row dm-box"><i>Ожидается</i><b class="pos">+45 200 ₽</b></span></div>';
        }
        if (id === 'heat') {
            // раскладка как в референсе: SBER во всю высоту слева, GAZP и LKOH колонкой
            // правее, безымянная мелочь — блоком 2×2 в правом нижнем углу
            return '<div class="dm-heat">' +
                '<span class="big" style="grid-area:a;background:#63ad84"><b>SBER</b><i>+1,6%</i></span>' +
                '<span style="grid-area:b;background:#8cc7a7"><b>GAZP</b><i>+0,8%</i></span>' +
                '<span style="grid-area:c;background:#6fb490"><b>LKOH</b><i>+2,1%</i></span>' +
                '<span style="grid-area:d;background:#7cbd99"></span>' +
                '<span style="grid-area:e;background:#93cdad"></span>' +
                '<span style="grid-area:f;background:#a3d6bb"></span>' +
                '<span style="grid-area:g;background:#86c3a2"></span>' +
                '<span style="grid-area:h;background:#b5dfc9"></span>' +
                '<span style="grid-area:i;background:#97cfb0"></span></div>';
        }
        if (id === 'movers') {
            return '<div class="dm-bars">' +
                '<span><i>YDEX</i><em style="width:88%"></em><b class="pos">+3,5%</b></span>' +
                '<span><i>SBER</i><em style="width:46%"></em><b class="pos">+1,6%</b></span>' +
                '<span><i>MTSS</i><em style="width:30%;background:#f0876a"></em><b class="neg">−1,2%</b></span></div>';
        }
        if (id === 'idx') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>IMOEX</em><b>2 874,4</b><b class="pos">+0,8%</b></span>' +
                '<span class="dm-row"><em>USD/RUB</em><b>81,24</b><b class="neg">−0,3%</b></span>' +
                '<span class="dm-row"><em>BTC</em><b>118 402 $</b><b class="pos">+2,1%</b></span></div>';
        }
        if (id === 'passive') {
            return '<div class="dm-kcap"><b>+41 830 ₽</b><span>в среднем в месяц</span>' +
                '<div class="dm-rows" style="margin-top:6px">' +
                '<span class="dm-row"><em>Ближайшие 30 дней</em><b class="pos">+24 336 ₽</b></span>' +
                '<span class="dm-row"><em>За год</em><b class="pos">+501 968 ₽</b></span></div></div>';
        }
        if (id === 'conc') {
            return '<div class="dm-bars">' +
                '<span><i>SBER</i><em style="width:70%"></em><b>28,4%</b></span>' +
                '<span><i>LKOH</i><em style="width:44%"></em><b>17,9%</b></span>' +
                '<span><i>ОФЗ 26248</i><em style="width:34%"></em><b>13,8%</b></span></div>';
        }
        if (id === 'assets') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>SBER</em><i>100 шт</i><b>31 045 ₽</b></span>' +
                '<span class="dm-row"><em>LKOH</em><i>12 шт</i><b>84 300 ₽</b></span>' +
                '<span class="dm-row"><em>ОФЗ 26248</em><i>280 шт</i><b>162 063 ₽</b></span></div>';
        }
        if (id === 'broker') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>SBER</em><i>Т-Инвестиции</i><b>31 045 ₽</b></span>' +
                '<span class="dm-row"><em>LKOH</em><i>12 шт</i><b class="pos">+4 210 ₽</b></span>' +
                '<span class="dm-row"><em>ОФЗ 26248</em><i>280 шт</i><b>162 063 ₽</b></span></div>';
        }
        if (id === 'ops') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><i>13.07.2026</i><em>Покупка · SBER</em><b>31 076 ₽</b></span>' +
                '<span class="dm-row"><i>10.07.2026</i><em>Продажа · YDEX</em><b class="pos">+12 400 ₽</b></span></div>';
        }
        if (id === '__note') {
            return '<div class="dm-note"><span class="dm-note-l"></span><div>' +
                '<b>Идеи по портфелю</b><i>— докупить ОФЗ на просадке</i><i class="done">✓ ребаланс раз в квартал</i></div></div>';
        }
        if (id === 'cal') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><i>29.07</i><em>ОФЗ 26233 · купон</em><b class="pos">+8 913 ₽</b></span>' +
                '<span class="dm-row"><i>02.08</i><em>SBER · дивиденды</em><b class="pos">+23 400 ₽</b></span>' +
                '<span class="dm-row"><i>15.08</i><em>ОФЗ 26248 · купон</em><b class="pos">+11 260 ₽</b></span></div>';
        }
        if (id === 'calm') {
            // мини-месяц: та же сетка 7×N, что и у виджета, но статичными числами —
            // сразу видно, чем «месяц» отличается от списочного календаря
            var mk = '', pay = { 4: 'a', 11: 'b', 12: 'a', 19: 'm', 26: 'a' };
            for (var i = 0; i < 3; i++) mk += '<span class="dm-cm-e"></span>';
            for (var d = 1; d <= 30; d++) {
                var p = pay[d];
                mk += '<span class="dm-cm-d' + (p ? ' has p-' + p : '') + (d === 12 ? ' today' : '') + '">' + d + '</span>';
            }
            return '<div class="dm-cm"><div class="dm-cm-h"><b>Июль 2026</b><i>+44 573 ₽</i></div>' +
                '<div class="dm-cm-wds">' + PF.PFCM_WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
                '<div class="dm-cm-g">' + mk + '</div></div>';
        }
        if (id === 'yield') {
            return '<div class="dm-bars">' +
                '<span><i>Основной</i><em style="width:86%"></em><b class="pos">+12,4%</b></span>' +
                '<span><i>Пенсионный</i><em style="width:54%"></em><b class="pos">+7,8%</b></span>' +
                '<span><i>Эксперименты</i><em style="width:22%;background:#f0876a"></em><b class="neg">−3,1%</b></span></div>';
        }
        if (id === 'snaps') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><i>13.07.2026</i><em>123 764 602 ₽</em><b class="pos">+2 595 417</b></span>' +
                '<span class="dm-row"><i>12.07.2026</i><em>121 169 185 ₽</em><b class="pos">+804 210</b></span></div>';
        }
        if (id === 'news') {
            return '<div class="dm-news">' +
                '<span><b>SBER</b>У участников Клуба акционеров Сбера — новые привилегии</span>' +
                '<span><b>VTBR</b>«Холдинг ВТБ Капитал Ай Би» подал ва…</span></div>';
        }
        if (id === 'fav') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>SBER</em><i>потенциал</i><b class="pos">+76,0%</b></span>' +
                '<span class="dm-row"><em>BSPB</em><i>потенциал</i><b class="pos">+103,4%</b></span></div>';
        }
        if (id === 'rates') {
            return '<div class="dm-chips">' +
                '<span class="dm-chip"><i>Ключевая</i><b>14,25%</b></span>' +
                '<span class="dm-chip"><i>Вклады</i><b>12,76%</b></span>' +
                '<span class="dm-chip"><i>ОФЗ 10л</i><b>13,58%</b></span></div>';
        }
        if (id === 'sum') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><i>1</i><em>Основной</em><b>84 300 512 ₽</b></span>' +
                '<span class="dm-row"><i>2</i><em>Пенсионный</em><b>39 464 090 ₽</b></span></div>';
        }
        if (id === 'plist') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><i style="color:#4c5ef7">▦</i><em>Основной</em><b>68 910 342 ₽</b><b class="pos">+0,11%</b></span>' +
                '<span class="dm-row"><i style="color:#7c3aed">▦</i><em>Долгосрочный</em><b>24 160 785 ₽</b><b class="pos">+5,43%</b></span>' +
                '<span class="dm-row"><i style="color:#d97757">▦</i><em>Спекулятивный</em><b>8 303 090 ₽</b><b class="neg">−1,47%</b></span></div>';
        }
        if (id === 'pstruct') {
            return '<div class="dm-alloc"><svg viewBox="0 0 84 84" class="dm-donut">' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#e8edf4" stroke-width="13"/>' +
                '<g transform="rotate(-90 42 42)">' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#4c5ef7" stroke-width="13" stroke-dasharray="128 188"/>' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#a78bfa" stroke-width="13" stroke-dasharray="45 188" stroke-dashoffset="-128"/>' +
                '<circle cx="42" cy="42" r="30" fill="none" stroke="#f4a261" stroke-width="13" stroke-dasharray="15 188" stroke-dashoffset="-173"/>' +
                '</g></svg>' +
                '<div class="dm-leg">' +
                    '<span><i style="background:#4c5ef7"></i>Основной<b>68%</b></span>' +
                    '<span><i style="background:#a78bfa"></i>Долгосрочный<b>24%</b></span>' +
                    '<span><i style="background:#f4a261"></i>Спекулятивный<b>8%</b></span>' +
                '</div></div>';
        }
        if (id === 'psum') {
            return '<div class="dm-chips">' +
                '<span class="dm-chip"><i>Стоимость</i><b>101 374 217</b></span>' +
                '<span class="dm-chip"><i>Доходность</i><b class="pos">+1 194 762</b></span>' +
                '<span class="dm-chip"><i>Вложено</i><b>100 848 682</b></span>' +
                '<span class="dm-chip"><i>Активов</i><b>35</b></span></div>';
        }
        if (id === 'pdetail') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>SBER</em><i>100 шт · 12,4%</i><b>31 045 ₽</b></span>' +
                '<span class="dm-row"><em>LKOH</em><i>12 шт · 8,2%</i><b>84 300 ₽</b></span>' +
                '<span class="dm-row"><em>ОФЗ 26248</em><i>280 шт · 21,7%</i><b>162 063 ₽</b></span></div>';
        }
        if (id === 'reports') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>Excel · Все позиции</em><b>→</b></span>' +
                '<span class="dm-row"><em>Excel · Журнал операций</em><b>→</b></span>' +
                '<span class="dm-row"><em>Бэкап JSON</em><b>→</b></span></div>';
        }
        if (id === 'set:corner') {
            return '<div class="dm-chips">' +
                '<span class="dm-chip"><i>Мягкие</i><b>20px</b></span>' +
                '<span class="dm-chip"><i>Главная</i><b>14px</b></span>' +
                '<span class="dm-chip"><i>Крупные</i><b>28px</b></span></div>';
        }
        if (id === 'set:vis') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>Основной</em><b>👁</b></span>' +
                '<span class="dm-row"><em>Календарь выплат</em><b>👁</b></span></div>';
        }
        if (id === 'set:layout') {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>Панель раскладок</em><b>→</b></span>' +
                '<span class="dm-row"><em>Сохранить текущий вид</em><b>→</b></span></div>';
        }
        // фон — единственный виджет, чьё демо показывает НАСТОЯЩИЕ заливки (.sbgpv-*),
        // а не подпись: выбирают его глазами
        if (id === 'set:bg') {
            return '<div class="dm-bgs">' + (window.siteBg ? window.siteBg.list() : []).slice(0, 6).map(function (b) {
                return '<span class="dm-bg sbgpv-' + esc(b.id) + '"></span>';
            }).join('') + '</div>';
        }
        // R9: карточка портфеля (id 'pf:<id>') — демо в духе «Составов», данные статичные
        if (id.indexOf('pf:') === 0) {
            return '<div class="dm-rows">' +
                '<span class="dm-row"><em>SBER</em><i>120 шт · 14,2%</i><b>36 850 ₽</b></span>' +
                '<span class="dm-row"><em>ОФЗ 26248</em><i>40 шт · 8,9%</i><b>23 152 ₽</b></span>' +
                '<span class="dm-row"><i>Доходность</i><b class="pos">+12,4%</b></span></div>';
        }
        return '<div class="dm-rows"><span class="dm-row"><em>Виджет</em></span></div>';
    }
    // ---- отрисовка секций пикера ----
    function pfl2CatsHtml() {
        var all = pfl2Visible();
        return PFL2_CATS.map(function (c) {
            var n = all.filter(function (w) { return w.cats.indexOf(c[0]) >= 0; }).length;
            if (!n) return '';
            return '<button type="button" class="pfl2-cat' + (!pfl2Q && pfl2Cat === c[0] ? ' on' : '') + '" onclick="pfl2SetCat(\'' + c[0] + '\')">' +
                '<span class="pfl2-cat-ic">' + c[2] + '</span>' +
                '<span class="pfl2-cat-n">' + c[1] + '</span><i class="pfl2-cat-c">' + n + '</i></button>';
        }).join('');
    }
    function pfl2MainHtml() {
        var list = pfl2Filtered();
        var title = pfl2Q ? ('Найдено: ' + list.length) : ((PFL2_CATS.filter(function (c) { return c[0] === pfl2Cat; })[0] || ['', 'Виджеты'])[1] + ' виджеты');
        var CHECK = '<span class="pfl2-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>';
        var admin = pfIsAdmin();
        var cards = list.map(function (w) {
            var sel = pfl2IsSel(w.id);          // отмечен галочкой — поедет в дашборд
            var cur = pfl2Sel === w.id;         // его настройки открыты справа
            var added = pfl2IsAdded(w.id);
            var gated = !!pfWGates[w.id];
            // админ/владелец: глаз на карточке скрывает виджет из каталога у ВСЕХ пользователей
            var eye = admin ? '<button type="button" class="pfl2-gate' + (gated ? ' off' : '') + '" title="' +
                (gated ? 'Скрыт у пользователей — нажмите, чтобы вернуть' : 'Скрыть виджет у всех пользователей') + '"' +
                ' onclick="pfl2GateToggle(\'' + jsArg(w.id) + '\', event)">' + (gated ? PF.EYEOFF_SVG : PF.EYE_SVG) + '</button>' : '';
            // отмеченная карточка — живое превью: её СОБСТВЕННЫЕ настройки (тема/вид/высота/
            // период) отражаются прямо в демо, видно что добавляешь
            var o = sel ? pfl2OptsOf(w.id) : null;
            var demoCls = 'pfl2-demo' + (o ? ' dm-' + o.size +
                (o.theme === 'dark' ? ' dm-dark' : o.theme === 'glass' ? ' dm-glass' : '') : '');
            return '<div class="pfl2-card' + (sel ? ' sel' : '') + (cur ? ' cur' : '') + (gated ? ' gated' : '') +
                '" role="button" tabindex="0" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfl2Pick(\'' + jsArg(w.id) + '\')">' +
                '<div class="pfl2-card-h"><b>' + esc(w.name) + '</b>' + eye + (sel ? CHECK : '') + '</div>' +
                '<span class="pfl2-card-d">' + esc(w.desc) + '</span>' +
                '<div class="' + demoCls + '">' + pfl2DemoHtml(w.id, o) + '</div>' +
                (gated ? '<span class="pfl2-added pfl2-gatebdg">скрыт у всех</span>' : (added ? '<span class="pfl2-added">на дашборде</span>' : '')) +
            '</div>';
        }).join('');
        return '<div class="pfl2-main-t">' + title + '</div>' +
            (list.length ? '<div class="pfl2-grid">' + cards + '</div>'
                : '<div class="pfl2-none">Ничего не нашлось — попробуйте другой запрос.</div>');
    }
    function pfl2SetHtml() {
        var w = pfl2ById(pfl2Sel);
        if (!w) return '<div class="pfl2-set-t">Настройки виджета</div><div class="pfl2-none">Выберите виджет слева.</div>';
        var o = pfl2OptsOf(pfl2Sel);
        function seg(key, opts) {
            return '<div class="pfl2-seg">' + opts.map(function (x) {
                return '<button type="button" class="pfl2-seg-b' + (o[key] === x[0] ? ' on' : '') + '" onclick="pfl2SetOpt(\'' + key + '\',\'' + x[0] + '\')">' + x[1] + '</button>';
            }).join('') + '</div>';
        }
        var periodSel = '<label class="pfl2-lbl">Период</label>' +
            '<select class="pfl2-select" onchange="pfl2SetOpt(\'period\', this.value)">' +
                [['7', '7 дней'], ['30', '30 дней'], ['90', '3 месяца'], ['365', 'Год'], ['all', 'Всё время']].map(function (x) {
                    return '<option value="' + x[0] + '"' + (o.period === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
                }).join('') +
            '</select>';
        var curSel = '<label class="pfl2-lbl">Валюта</label>' +
            '<select class="pfl2-select" disabled title="Пока только рубль"><option>₽ Рубль</option></select>';
        var viewSeg = '<label class="pfl2-lbl">Вид графика</label>' + seg('view', [['line', PFD_ICO_CAP], ['bars', PFD_ICO_KPI]]);
        // «Стекло» — полупрозрачная поверхность с диагональным бликом, как у плиток тепловой
        // карты в «Рынке»: сквозь виджет просвечивает фон страницы
        var themeSeg = '<label class="pfl2-lbl">Тема</label>' + seg('theme', [['light', 'Светлая'], ['dark', 'Тёмная'], ['glass', 'Стекло']]);
        var sizeSeg = '<label class="pfl2-lbl">Высота виджета</label>' + seg('size', [['s', 'S'], ['m', 'M'], ['l', 'L']]);
        // подпись, что настройки — этого виджета: в пачке выбранных их несколько,
        // и «Тема/Высота» без имени читались бы как общие для всех
        return '<div class="pfl2-set-t">Настройки · ' + esc(w.name) + '</div>' +
            (w.chart ? periodSel + curSel + viewSeg : '') +
            themeSeg + sizeSeg +
            '<div class="pfl2-set-hint">Настройки — у каждого виджета свои. Размеры и место всегда можно поменять позже — просто перетащите виджет или потяните за кромку.</div>';
    }
    function pfl2SizeLabel(id) { var s = pfl2OptsOf(id).size; return s === 's' ? 'Компактный' : s === 'l' ? 'Большой' : 'Средний размер'; }
    function pfl2FootHtml() {
        var n = pfl2SelIds.length;
        // список выбранных именами: видно всю пачку до нажатия «Добавить»
        var names = pfl2SelIds.map(function (id) {
            var w = pfl2ById(id);
            return w ? w.name : id;
        });
        var sub = !n ? 'кликните карточки в списке — можно отметить сразу несколько'
            : n === 1 ? esc(names[0]) + ' · ' + pfl2SizeLabel(pfl2SelIds[0])
            : esc(names.join(', '));
        var title = !n ? 'Виджеты не выбраны'
            : 'Выбрано ' + n + ' ' + PF.plural(n, 'виджет', 'виджета', 'виджетов');
        var btnLbl = n > 1 ? 'Добавить ' + n + ' ' + PF.plural(n, 'виджет', 'виджета', 'виджетов') : 'Добавить виджет';
        return '<div class="pfl2-sel"><b>' + title + '</b><span>' + sub + '</span></div>' +
            '<div class="pfl2-foot-r">' +
                (n ? '<button type="button" class="pfl-btn ghost" onclick="pfl2ClearSel()">Снять выбор</button>' : '') +
                '<button type="button" class="pfl-btn ghost" onclick="pfLayoutClose()">Отмена</button>' +
                '<button type="button" class="pfl-btn primary pfl2-addbtn"' + (n ? '' : ' disabled') +
                    ' onclick="pfl2Add()">' + PFD_PLUS_SVG + '<span>' + btnLbl + '</span></button>' +
            '</div>';
    }
    function pfl2Paint(parts) {
        (parts || ['cats', 'main', 'set', 'foot']).forEach(function (p) {
            var el = dq(p === 'cats' ? 'pfl2Cats' : p === 'main' ? 'pfl2Main' : p === 'set' ? 'pfl2Set' : 'pfl2Foot');
            if (!el) return;
            el.innerHTML = p === 'cats' ? pfl2CatsHtml() : p === 'main' ? pfl2MainHtml() : p === 'set' ? pfl2SetHtml() : pfl2FootHtml();
        });
    }
    window.pfl2SetCat = function (k) { pfl2Cat = k; pfl2Q = ''; var i = dq('pfl2Qinp'); if (i) i.value = ''; pfl2Paint(['cats', 'main']); };
    window.pfl2Search = function (v) { pfl2Q = String(v || '').trim().toLowerCase(); pfl2Paint(['cats', 'main']); };
    // клик по карточке ПЕРЕКЛЮЧАЕТ её участие в выборе (можно набрать пачку). Настройки
    // справа показываем у последнего отмеченного; сняли последний — панель пустеет.
    window.pfl2Pick = function (id) {
        var i = pfl2SelIds.indexOf(id);
        if (i >= 0) {
            pfl2SelIds.splice(i, 1);
            if (pfl2Sel === id) pfl2Sel = pfl2SelIds.length ? pfl2SelIds[pfl2SelIds.length - 1] : null;
        } else {
            pfl2SelIds.push(id);
            pfl2Sel = id;
        }
        pfl2KeepScroll(function () { pfl2Paint(['main', 'set', 'foot']); });
    };
    window.pfl2ClearSel = function () {
        pfl2SelIds = []; pfl2Sel = null;
        pfl2KeepScroll(function () { pfl2Paint(['main', 'set', 'foot']); });
    };
    // innerHTML-своп списка сбрасывает его прокрутку — вокруг любой перерисовки
    // центральной колонки позицию запоминаем и возвращаем
    function pfl2KeepScroll(fn) {
        var main = dq('pfl2Main'), st = main ? main.scrollTop : 0;
        fn();
        main = dq('pfl2Main'); if (main) main.scrollTop = st;
    }
    window.pfl2SetOpt = function (k, v) {
        if (!pfl2Sel) return;
        pfl2OptsOf(pfl2Sel)[k] = v;
        // настройки видны СРАЗУ: демо выбранной карточки перерисовывается с новыми
        // опциями (тема/высота/вид/период). Скролл списка сохраняем — innerHTML-своп
        // среди прочего сбрасывает позицию.
        pfl2KeepScroll(function () { pfl2Paint(['main', 'set', 'foot']); });
    };
    // Добавляем ВСЮ отмеченную пачку за один раз: один снимок для Cmd+Z, одна запись
    // конфига и один ре-рендер на всех (иначе N виджетов = N перерисовок дашборда и
    // N всплывашек). Уже показанные виджеты пропускаем и говорим об этом в итоге.
    window.pfl2Add = function () {
        if (!pfl2SelIds.length) { toast('Сначала выберите виджет', true); return; }
        var defOn = PF.dashTab === 'overview' ? { fav: 1, cal: 1, rates: 1, trades: 1, sum: 1 } : {};
        var hMap = { s: 300, l: 560 };
        var added = [], skipped = 0, notes = 0;
        pfdPushUndo();
        pfl2SelIds.forEach(function (id) {
            if (id === '__note') { pfdAddNote(true); notes++; return; }
            // «Ещё одна бумага» заводит ПАРУ блоков нового слота — своим путём
            // (ему нужен свободный номер и место рядом с прошлым стаканом)
            if (id === '__trade') { if (window.pftAddSlot && window.pftAddSlot(true)) notes++; return; }
            var o = pfl2OptsOf(id);
            // «График капитала» — одно имя каталога на два блока-дизайна (линия/столбцы)
            var real = (id === 'cap' && o.view === 'bars') ? 'cap2' : id;
            var m = PF.dashCfg.hidden || {};
            var shownAlready = defOn[real] ? !m[real] : m[real] === 0;
            if (shownAlready) { skipped++; return; }
            PF.dashCfg.hidden[real] = 0;
            // «Панель управления» — всегда верхней полосой во всю ширину
            if (real === 'panel') {
                PF.dashCfg.order = (PF.dashCfg.order || []).filter(function (x) { return x !== 'panel'; });
                PF.dashCfg.order.unshift('panel');
                PF.dashCfg.span = PF.dashCfg.span || {}; PF.dashCfg.span.panel = 12;
                PF.dashCfg.col = PF.dashCfg.col || {}; PF.dashCfg.col.panel = 1;
            }
            if (o.size !== 'm') PF.dashCfg.h[real] = hMap[o.size]; else delete PF.dashCfg.h[real];
            if (o.theme === 'dark' || o.theme === 'glass') PF.dashCfg.thm[real] = o.theme; else delete PF.dashCfg.thm[real];
            if (real === 'cap' || real === 'cap2') PF.pfdCapRange = o.period || 'all';
            added.push(real);
        });
        saveDashCfg();
        pfl2SelIds = []; pfl2Sel = null;
        pfdRerender();
        var n = added.length + notes;
        if (!n) toast(skipped === 1 ? 'Виджет уже на дашборде' : 'Все выбранные виджеты уже на дашборде');
        else {
            // к одиночному добавлению подкручиваем — к пачке нет: она может лечь в разные
            // концы сетки, и прыжок к «первому попавшемуся» дезориентирует
            if (n === 1 && added.length) pfdScrollToBlock(added[0]);
            toast(n === 1 ? 'Блок добавлен на дашборд'
                : 'Добавлено ' + n + ' ' + PF.plural(n, 'виджет', 'виджета', 'виджетов') +
                  (skipped ? ' · ' + skipped + ' уже ' + PF.plural(skipped, 'был', 'было', 'было') + ' на дашборде' : ''));
        }
    };

    // ====================================================================
    //  R8 — ПАНЕЛЬ «РАСКЛАДКИ» (pfl3): управление раскладками подвкладки.
    //  Живёт там же, где пикер виджетов (над сеткой), и в том же стиле:
    //  слева список вариантов с SVG-эскизами (базовая | своя сохранённая |
    //  общие пресеты), справа крупное превью выбранного с действиями.
    //  Пользователь: посмотреть и применить, сохранить свой вид.
    //  Админ/владелец: обновить пресет из текущей раскладки, переименовать,
    //  скрыть у пользователей (гейт hid), удалить, назначить базовую.
    // ====================================================================
    PF.pfl3Open = false;
    var pfl3Sel = 'base';
    // иконка панели живёт в остатке цепочки — читаем ЛЕНИВО в момент рендера,
    // на eval этого файла PF.PFP_SLIDERS_SVG ещё не экспортирован
    function PFL3_IC() { return PF.PFP_SLIDERS_SVG; }
    window.pfLayoutsToggle = function (ev) {
        if (ev) ev.stopPropagation();
        if (PF.pfl3Open) { window.pfLayoutsClose(); return; }
        try { if (window.matchMedia('(max-width: 1023px)').matches) { toast('Управление раскладками доступно на широком экране', true); return; } } catch (e) {}
        if (!PF.store.items.length) { toast('Сначала добавьте портфель — пока нечего расставлять', true); return; }
        if (PF.dashEdit) PF.dashEdit = false;         // пикер и панель раскладок не живут вместе
        if (!PF.dashCfg.on) { PF.dashCfg.on = true; saveDashCfg(); }
        PF.pfl3Open = true;
        pfl3Sel = 'base';
        PF.closeImpMenus();
        pfPresetsFetch(true);   // свежие пресеты и базовые к открытию
        pfdRerender();
        updateLayoutBtn();
    };
    window.pfLayoutsClose = function () {
        if (!PF.pfl3Open) return;
        PF.pfl3Open = false;
        pfdRerender();
        updateLayoutBtn();
    };
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !PF.pfl3Open) return;
        window.pfLayoutsClose();
        e.stopImmediatePropagation();
    });
    // варианты раскладок текущей подвкладки — единый список для строк и превью
    function pfl3Options() {
        var act = pfLayoutActive();
        var hasBase = !!pfBaseFor();
        var opts = [{
            key: 'base', kind: 'base',
            name: hasBase ? 'Базовая' : 'Стандартная',
            sub: hasBase ? 'задана администратором' : 'системный вид по умолчанию',
            snap: pfBaseSnapNow(), portable: false, active: act.k === 'base'
        }];
        if (PF.dashCfg.saved) opts.push({
            key: 'saved', kind: 'saved', name: 'Ваша сохранённая', sub: 'личная контрольная точка',
            snap: PF.dashCfg.saved, portable: false, active: act.k === 'saved'
        });
        pfPresetsVisible().forEach(function (p) {
            opts.push({
                key: 'pre:' + p.id, kind: 'preset', preset: p,
                name: p.name || 'Пресет', sub: p.hid ? 'скрыт у пользователей' : 'общий пресет',
                snap: p.snap, portable: true, active: act.k === 'preset' && act.id === p.id
            });
        });
        return opts;
    }
    function pfl3OptByKey(key) {
        var opts = pfl3Options();
        for (var i = 0; i < opts.length; i++) if (opts[i].key === key) return opts[i];
        return opts[0];
    }
    function pfl3ThumbHtml(o) {
        var svg = '';
        try { svg = pfPresetThumbSvg(o.portable ? o.snap : pfPresetTemplate(o.snap)); } catch (e) {}
        return svg || '<span class="pfl-opt-nothumb">' + PF.PFDGRID_SVG + '</span>';
    }
    function pfl3ListHtml() {
        var opts = pfl3Options();
        if (!opts.some(function (o) { return o.key === pfl3Sel; })) pfl3Sel = 'base';
        return opts.map(function (o) {
            return '<div class="pfl3-row' + (pfl3Sel === o.key ? ' on' : '') + (o.preset && o.preset.hid ? ' gated' : '') + '"' +
                ' role="button" tabindex="0" onclick="pfl3Pick(\'' + jsArg(o.key) + '\')">' +
                '<span class="pfl3-thumb">' + pfl3ThumbHtml(o) + '</span>' +
                '<span class="pfl3-cap"><b>' + esc(o.name) + '</b><i>' + esc(o.sub) + '</i></span>' +
                (o.active ? '<span class="pfl3-now">' + PF.CHECK_SVG + '<span>сейчас</span></span>' : '') +
            '</div>';
        }).join('');
    }
    // действие «применить» выбранного варианта — одно на превью и на подвал
    function pfl3ApplyCall(o) {
        return o.kind === 'base' ? 'pfLayoutReset()'
            : o.kind === 'saved' ? 'pfLayoutRestoreSaved()'
            : 'pfApplyPreset(\'' + jsArg(o.preset.id) + '\')';
    }
    function pfl3PvHtml() {
        var o = pfl3OptByKey(pfl3Sel);
        if (!o) return '';
        var admin = pfIsAdmin();
        var meta = '';
        if (o.kind === 'preset' && o.preset.at) {
            try { meta = 'обновлён ' + new Date(o.preset.at).toLocaleDateString('ru-RU'); } catch (e) {}
        }
        // админ-действия: у пресета — полный набор, у базовой — назначение/сброс
        var adm = '';
        if (admin && o.kind === 'preset') {
            var pid = jsArg(o.preset.id);
            adm = '<div class="pfl3-adm">' +
                '<button type="button" class="pfl3-abtn" onclick="pfPresetUpdate(\'' + pid + '\', event)" title="Заменить содержимое пресета текущей раскладкой подвкладки">' + PF.UNDO_SVG + '<span>Обновить из текущей</span></button>' +
                '<button type="button" class="pfl3-abtn" onclick="pfPresetRename(\'' + pid + '\', event)" title="Переименовать пресет">' + PFL3_PENCIL_SVG + '<span>Переименовать</span></button>' +
                '<button type="button" class="pfl3-abtn' + (o.preset.hid ? ' off' : '') + '" onclick="pfPresetGate(\'' + pid + '\', event)" title="' + (o.preset.hid ? 'Пресет скрыт у пользователей — нажмите, чтобы вернуть' : 'Скрыть пресет у всех пользователей') + '">' + (o.preset.hid ? PF.EYEOFF_SVG : PF.EYE_SVG) + '<span>' + (o.preset.hid ? 'Скрыт у всех' : 'Виден всем') + '</span></button>' +
                '<button type="button" class="pfl3-abtn danger" onclick="pfDeletePreset(\'' + pid + '\', event)" title="Удалить пресет у всех">' + PF.NOTE_TRASH_SVG + '<span>Удалить</span></button>' +
            '</div>';
        } else if (admin && o.kind === 'base') {
            adm = '<div class="pfl3-adm">' +
                '<button type="button" class="pfl3-abtn" onclick="pfSetBasePreset()" title="Сделать текущую раскладку базовой для всех пользователей">' + PF.CHECK_SVG + '<span>Назначить текущую базовой</span></button>' +
                (pfBaseFor() ? '<button type="button" class="pfl3-abtn" onclick="pfResetBasePreset()" title="Сбросить базовую к системной">' + PF.UNDO_SVG + '<span>Сбросить к системной</span></button>' : '') +
            '</div>';
        }
        // «Применить» и подпись варианта переехали в ПОДВАЛ панели — ровно туда же, где у
        // пикера «Выбрано …» и «Добавить виджет» (см. pfl3FootHtml). Здесь остаётся схема,
        // строка «обновлён …» (её в подвале нет) и админ-действия над пресетом.
        return '<div class="pfl3-stage">' + pfl3ThumbHtml(o) + '</div>' +
            (meta ? '<div class="pfl3-meta">' + esc(meta) + '</div>' : '') + adm;
    }
    // Подвал — калька подвала пикера «Добавить виджет» (.pfl2-foot): слева подпись, что
    // выбрано, справа кнопки, и главная — «Применить» — крайняя справа, тем же primary.
    function pfl3FootHtml() {
        var o = pfl3OptByKey(pfl3Sel);
        var saved = pfdLayoutSaved();
        var admin = pfIsAdmin();
        var title = o ? esc(o.name) : 'Раскладка не выбрана';
        var sub = o ? esc(o.sub) : 'выберите вариант слева';
        return '<div class="pfl-foot pfl2-foot pfl3-foot" id="pfl3Foot">' +
            '<div class="pfl2-sel"><b>' + title + '</b><span>' + sub + '</span></div>' +
            '<div class="pfl2-foot-r">' +
                '<button type="button" class="pfl-btn ghost pfl3-clearbtn" onclick="pfLayoutClearAsk()" title="Убрать все виджеты — останутся только карточки портфелей">' + PF.NOTE_TRASH_SVG + '<span>Очистить</span></button>' +
                '<button type="button" class="pfl-btn ghost' + (saved ? ' done' : '') + '" onclick="pfLayoutSave()" title="' + (saved ? 'Текущий вид уже сохранён' : 'Закрепить текущую раскладку за собой') + '">' + PF.CHECK_SVG + '<span>' + (saved ? 'Сохранено' : 'Сохранить текущий вид') + '</span></button>' +
                (admin ? '<button type="button" class="pfl-btn ghost" onclick="pfSaveAsPreset()" title="Сделать текущую раскладку общим пресетом подвкладки">' + PFD_PLUS_SVG + '<span>Новый пресет</span></button>' : '') +
                '<button type="button" class="pfl-btn ghost" onclick="pfLayoutsClose()">Отмена</button>' +
                // «Применена» — то же успокоенное зелёное состояние, что «Сохранено»
                // (.pfl-btn.primary.done); .pfl2-addbtn не вешаем — его градиент !important
                // перебил бы зелёный фон
                (o && o.active
                    ? '<span class="pfl-btn primary done pfl3-applied">' + PF.CHECK_SVG + '<span>Применена</span></span>'
                    : '<button type="button" class="pfl-btn primary pfl2-addbtn"' + (o ? '' : ' disabled') +
                        ' onclick="' + (o ? pfl3ApplyCall(o) : '') + '">' + PF.CHECK_SVG + '<span>Применить</span></button>') +
            '</div>' +
        '</div>';
    }
    function pfl3PanelHtml() {
        return '<div class="pfl-panel pfl3" id="pfl3Panel">' +
            '<div class="pfl-head">' +
                '<div class="pfl-head-t">' +
                    '<span class="pfl-head-ic">' + PFL3_IC() + '</span>' +
                    '<div class="pfl-head-tx"><b>Раскладки · ' + esc(pfxTabLabel(PF.dashTab)) + '</b>' +
                        '<span>Выберите вариант слева — справа появится схема и действия</span></div>' +
                '</div>' +
                '<button type="button" class="pfl-x" onclick="pfLayoutsClose()" aria-label="Закрыть">' + PF.XMARK_SVG + '</button>' +
            '</div>' +
            '<div class="pfl3-body">' +
                '<div class="pfl3-list" id="pfl3List">' + pfl3ListHtml() + '</div>' +
                '<div class="pfl3-pv" id="pfl3Pv">' + pfl3PvHtml() + '</div>' +
            '</div>' +
            pfl3FootHtml() +
        '</div>';
    }
    window.pfl3Pick = function (key) {
        if (pfl3Sel === key) return;
        pfl3Sel = key;
        pfl3Repaint();
    };
    // точечная перерисовка панели (без полного ре-рендера страницы) — после выбора
    // строки, прихода пресетов из облака, переименования/гейта
    function pfl3Repaint() {
        if (!PF.pfl3Open) return;
        var list = dq('pfl3List'), pv = dq('pfl3Pv'), foot = dq('pfl3Foot');
        if (list) list.innerHTML = pfl3ListHtml();
        if (pv) pv.innerHTML = pfl3PvHtml();
        if (foot) foot.outerHTML = pfl3FootHtml();
    }
    // ---- админ-действия над пресетами (обновить/переименовать/гейт) ----
    // ВНИМАНИЕ: имя своё (не PENCIL_SVG) — та переменная уже занята карандашом-подсказкой
    // у имени портфеля (.pfm-name-ic, размер задаёт КЛАСС). Одноимённый var в этом же
    // скоупе перетирал её, и карандаш в настройках раздувался во всю карточку.
    var PFL3_PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/></svg>';
    function pfPresetById(id) { return pfPresetList.filter(function (x) { return x.id === id; })[0] || null; }
    window.pfPresetUpdate = function (id, ev) {
        if (ev) ev.stopPropagation();
        if (!pfIsAdmin()) return;
        var p = pfPresetById(id); if (!p) return;
        PF.pfConfirm({ title: 'Обновить пресет?', text: 'Текущая раскладка подвкладки «' + esc(pfxTabLabel(PF.dashTab)) + '» заменит содержимое пресета «' + esc(p.name || 'Пресет') + '» у всех пользователей.', ok: 'Обновить' }, function () {
            PF.pfdFlushNotes();
            p.snap = pfPresetTemplate(pfdSavedSnap());
            p.at = Date.now();
            pfPresetsPersist('Пресет «' + (p.name || 'Пресет') + '» обновлён из текущей раскладки');
        });
    };
    window.pfPresetRename = function (id, ev) {
        if (ev) ev.stopPropagation();
        if (!pfIsAdmin()) return;
        var p = pfPresetById(id); if (!p) return;
        pfPresetNameModal(p.name || '', function (name) {
            p.name = name.slice(0, 40) || 'Пресет';
            pfPresetsPersist('Пресет переименован');
        });
    };
    window.pfPresetGate = function (id, ev) {
        if (ev) ev.stopPropagation();
        if (!pfIsAdmin()) return;
        var p = pfPresetById(id); if (!p) return;
        if (p.hid) delete p.hid; else p.hid = 1;
        pfPresetsPersist(p.hid ? 'Пресет скрыт у пользователей' : 'Пресет снова виден всем');
    };
    // карточка-виджет «Раскладки» (подвкладка «Настройки»): вход в панель + быстрый сейв
    function pfwLayoutCardHtml() {
        function item(ic, t, sub, oc) {
            return '<button class="pf-impitem" onclick="' + oc + '">' +
                '<span class="pf-impico">' + ic + '</span>' +
                '<span class="pf-impbody"><b>' + t + '</b><i>' + sub + '</i></span>' +
                '<span class="pf-impgo">' + PF.CHEV_SVG + '</span></button>';
        }
        var body = '<div class="pfx-setlist">' +
            item(PFL3_IC(), 'Панель раскладок', 'пресеты, базовая и ваша сохранённая — у каждой подвкладки своя', 'pfLayoutsToggle(event)') +
            item(PF.CHECK_SVG, 'Сохранить текущий вид', 'закрепить раскладку этой подвкладки за собой', 'pfLayoutSave()') +
            item(PF.NOTE_TRASH_SVG, 'Очистить подвкладку', 'убрать все виджеты — останутся только портфели', 'pfLayoutClearAsk()') +
        '</div>';
        return '<div class="dash2-card pf-card2 pfx-setcard">' +
            PF.pfCardHead('', 'Раскладки', 'управление видом подвкладок', null) + body + '</div>';
    }


    // ==================================================================
    //  ИНТЕРФЕЙС КОНСТРУКТОРА (window.PF)
    // ==================================================================
    // Мутабельное состояние конструктора объявлено выше свойствами PF
    // (dashCfg, dashEdit, dashTab, pfdWantRender, pfl3Open, pfdCfgFor,
    // pfdCapRange, pfxTab) — алиасы на него запрещены.
    PF.dashCfgFor = dashCfgFor; PF.pfLayoutCfgPopHtml = pfLayoutCfgPopHtml; PF.pfPresetsFetch = pfPresetsFetch; PF.pfWGatesFetch = pfWGatesFetch;
    PF.pfdActive = pfdActive; PF.pfdBodyHtml = pfdBodyHtml; PF.pfdBusy = pfdBusy; PF.pfdCfgRemountSoon = pfdCfgRemountSoon;
    PF.pfdInChromeHtml = pfdInChromeHtml; PF.pfdLive = pfdLive; PF.pfdNormNote = pfdNormNote; PF.pfdPushUndo = pfdPushUndo;
    PF.pfdQuiet = pfdQuiet; PF.pfdRepackSoon = pfdRepackSoon; PF.pfdRerender = pfdRerender; PF.pfdSchedulePack = pfdSchedulePack;
    PF.pfdScrollToBlock = pfdScrollToBlock; PF.pfdStandardCfg = pfdStandardCfg; PF.pflInitPreview = pflInitPreview; PF.pfxEffTab = pfxEffTab;
    PF.pfxIsPfTab = pfxIsPfTab; PF.pfxSyncCfg = pfxSyncCfg; PF.saveDashCfg = saveDashCfg; PF.updateLayoutBtn = updateLayoutBtn;
    PF.DASH_KEY = DASH_KEY; PF.DASH_TABS_KEY = DASH_TABS_KEY; PF.PFDCFG_GEAR_SVG = PFDCFG_GEAR_SVG; PF.PFD_NOTE_COLORS = PFD_NOTE_COLORS;
    PF.PFD_PLUS_SVG = PFD_PLUS_SVG; PF.pfTabCfgs = pfTabCfgs; PF.pfTabsStore = pfTabsStore;
})();
