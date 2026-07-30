// ===== SITE SIDEBAR CONTROLLER =====
(function() {
    var sbMqDesktop = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };
    var sbIsDesktop = function() { return sbMqDesktop.matches; };
    // имя раздела в крошке может прийти из конфига (переименование вкладок) — экранируем
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ---- Два состояния сайдбара (мокап Г1 «Мастер») ----
    // sb-collapsed — выбор пользователя: колонка 268px или рейка 76px.
    // sb-rail — ПРОИЗВОДНЫЙ признак «сейчас показана рейка», по нему живёт весь
    // css/sidebar-rail.css. Кроме свёрнутого состояния в него попадает
    // «Главная»: колонка во всю высоту поверх манифеста с живой картой читалась
    // бы чужой, там сайдбар остаётся компактной карточкой, как и был.
    // На первом кадре sb-rail для Главной ставит инлайн-скрипт под <body> —
    // иначе колонка мелькала бы во всю ширину до DCL.
    function sbIsHome() {
        if (document.body.classList.contains('tab-home')) return true;
        return typeof currentTab !== 'undefined' && currentTab === 'home';
    }
    function sbRailSync() {
        var rail = document.body.classList.contains('sb-collapsed') || sbIsHome();
        document.body.classList.toggle('sb-rail', rail);
    }
    window.sbRailSync = sbRailSync;

    // В рейке 84px подпись раздела обрезается многоточием (переименованная из
    // админки «Академия Ребалансировки» просит 185px), и целиком имя показывает
    // только подсказка. Статический title из разметки после переименования врал
    // бы — держим его равным тому, что реально написано в подписи.
    // Подсказка называет ещё и ВЕЛИЧИНУ события, если у раздела горит метка:
    // «Ребаланс · дрейф 4,1 п.п. в 1 портфеле». Точное число — единственное,
    // чего сетке не сказать: панель остаётся навигацией, а «насколько»
    // отвечает по наведению. Текст кладёт badgeSync (js/sidebar-ctx.js) в
    // data-sb-note, чтобы у title остался ОДИН владелец — иначе после
    // switchTab подсказка затирала бы сама себя.
    function sbTitleSync() {
        document.querySelectorAll('#sbNav .sb-item[data-tab]').forEach(function (it) {
            var lbl = it.querySelector('.sb-label');
            var tx = lbl ? lbl.textContent.trim() : '';
            if (!tx) return;
            var note = it.getAttribute('data-sb-note');
            var full = note ? (tx + ' · ' + note) : tx;
            if (it.getAttribute('title') !== full) it.setAttribute('title', full);
        });
    }
    window.sbTitleSync = sbTitleSync;

    // СЕТКИ РАЗДЕЛОВ БОЛЬШЕ НЕТ (раунд 6): разделы стоят строками, и число
    // колонок считать не от чего. Вместе с ней удалены sbNavColsSync(), признак
    // data-cols и MutationObserver, следивший за составом ради пересчёта колонок:
    // строка не зависит от того, сколько разделов видно, поэтому наблюдать за
    // «Админкой» по роли и за своими вкладками из админки больше незачем.

    // Умолчание — РАЗВЁРНУТО: колонка и есть навигация раздела, прятать её по
    // умолчанию значило бы прятать второй уровень. Явный выбор пользователя
    // (localStorage) старше умолчания.
    function applySidebarDefault() {
        try {
            var stored = localStorage.getItem('sbCollapsed');
            document.body.classList.toggle('sb-collapsed', stored === '1');
        } catch (e) {}
        sbRailSync();
        sbTitleSync();
        if (window.sbPersonalSync) window.sbPersonalSync();
        if (window.updateCollapseLabel) window.updateCollapseLabel();
        if (window.sbCtxSync) window.sbCtxSync();
    }
    applySidebarDefault();
    if (sbMqDesktop.addEventListener) sbMqDesktop.addEventListener('change', applySidebarDefault);
    else if (sbMqDesktop.addListener) sbMqDesktop.addListener(applySidebarDefault);
    window.addEventListener('load', applySidebarDefault);

    // Hover-peek ОТМЕНЁН вместе с переходом на рейку «Подъём»: подглядывание
    // существовало ровно ради подписей разделов, а на рейке 76px подписи есть
    // всегда. Класс sb-peek больше никто не ставит; правила под него в
    // site-layout.css остались нейтральными (css/sidebar-rail.css задаёт
    // ширины для обоих состояний одинаково).
    document.addEventListener('DOMContentLoaded', function() {
        applySidebarDefault();
        document.body.classList.remove('sb-peek');
    });

    // Keep the footer toggle's label honest: collapsed → it pins the menu open,
    // expanded → it collapses back to the icon rail.
    function updateCollapseLabel() {
        var collapsed = document.body.classList.contains('sb-collapsed');
        var btn = document.getElementById('sbCollapseBtn');
        if (btn) {
            var lbl = btn.querySelector('.sb-label');
            if (lbl) lbl.textContent = collapsed ? 'Закрепить' : 'Свернуть';
            btn.title = collapsed ? 'Закрепить меню' : 'Свернуть меню';
        }
        // та же кнопка внизу колонки: подпись обязана говорить, что произойдёт.
        // В развёрнутой колонке её больше не видно (css: свернуть можно шевроном
        // у имени), но в рейке она — единственный способ вернуть колонку.
        var rb = document.querySelector('#sbRailFoot .sbc-btn');
        if (rb) {
            var t = collapsed ? 'Развернуть меню' : 'Свернуть в рейку';
            rb.title = t;
            rb.setAttribute('aria-label', t);
        }
        // квадрат-марка: в рейке он разворачивает колонку, в колонке — обновляет
        // страницу. Подсказка обязана называть то, что случится (см. sbReload).
        var mark = document.querySelector('#sbHead .sb-logo-mark');
        if (mark) {
            var mt = markExpands() ? 'Развернуть колонку' : 'Обновить страницу';
            mark.title = mt;
            mark.setAttribute('aria-label', mt);
        }
    }
    window.updateCollapseLabel = updateCollapseLabel;

    window.toggleSidebarCollapse = function() {
        var collapsed = document.body.classList.toggle('sb-collapsed');
        document.body.classList.remove('sb-peek');
        try { localStorage.setItem('sbCollapsed', collapsed ? '1' : '0'); } catch (e) {}
        sbRailSync();
        updateCollapseLabel();
        if (window.sbCtxSync) window.sbCtxSync();   // колонка второго уровня прячется/возвращается
        // ширина сайдбара изменилась → пересчитываем левый край портфеля
        requestAnimationFrame(function() {
            window.pfSyncLeftEdge && window.pfSyncLeftEdge();
            window.pfSyncLeftWidth && window.pfSyncLeftWidth();
            window.pfCenterTables && window.pfCenterTables();
            window.pfFitNumbers && window.pfFitNumbers();
        });
    };
    // Квадрат с «M» в шапке сайдбара. Клик по ИМЕНИ рядом по-прежнему ведёт на
    // Главную, поэтому всплытие гасим: иначе сработали бы оба действия.
    //   • колонка развёрнута — ОБНОВЛЕНИЕ страницы. Путь вкладки живёт в адресе
    //     (route-hash.js), так что возвращается ровно тот же раздел;
    //   • колонка свёрнута в рейку — марка РАЗВОРАЧИВАЕТ её (просьба владельца
    //     2026-07-28). В рейке 84px это самая крупная мишень сверху, а шеврон
    //     разворота стоит в самом низу — тянуться к нему через всю колонку.
    // На «Главной» рейка не про свёртку, а про саму вкладку (sbRailSync), и
    // разворот там ничего бы не изменил — марка остаётся обновлением.
    function markExpands() {
        return sbIsDesktop() && !sbIsHome() && document.body.classList.contains('sb-collapsed');
    }
    window.sbReload = function(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (markExpands()) { window.toggleSidebarCollapse(); return false; }
        location.reload();
        return false;
    };
    // ===== ЛИЧНОЕ В ПОДВАЛЕ КОЛОНКИ =====
    // Шапка сайта на десктопе снята со всех вкладок, кроме «Главной» (просьба
    // владельца 2026-07-28), и аватар кабинета со звоночком переезжают в подвал
    // сайдбара ФИЗИЧЕСКИ — как #bgFab/#themeFab переезжают в панель действий
    // «Портфелей» (pfxAdoptGlobals). Пересоздавать узлы нельзя: их держат
    // js/profile-menu.js и js/notifications.js, и на новые копии они не смотрят.
    // На «Главной» шапка остаётся — там кнопки возвращаются в неё.
    function sbPersonalSync() {
        var slot = document.getElementById('sbPersonalSlot');
        var prof = document.getElementById('topProfileBtn');
        if (!slot || !prof) return;
        var bell = document.getElementById('nfBell');
        var toSide = sbIsDesktop() && !sbIsHome();
        if (toSide) {
            // Порядок в подвале: АВАТАР, затем звоночек (просьба владельца
            // 2026-07-28) — в шапке было наоборот, но там ряд читался справа
            // налево от края окна, а здесь он начинается от левого края колонки,
            // и первым по чтению должен идти кабинет.
            if (prof.parentNode !== slot) slot.appendChild(prof);
            if (bell && bell.parentNode !== slot) slot.appendChild(bell);
        } else {
            var home = document.getElementById('topBarActions');
            if (!home) return;
            if (prof.parentNode !== home) home.appendChild(prof);
            // звоночек штатно стоит СЛЕВА от аватара (js/notifications.js)
            if (bell && bell.parentNode !== home) home.insertBefore(bell, prof);
        }
    }
    window.sbPersonalSync = sbPersonalSync;

    // ---- КОМАНДНАЯ СТРОКА НАВЕРХУ КОЛОНКИ (#sbCmd) ----
    // Поле — не своя реализация поиска, а второй вход в ту же палитру
    // (js/top-search.js): oninput/onkeydown зовут её же обработчики, а результаты
    // рисуются в общий #searchResults. Признак body.sbs-open переставляет палитру
    // к сайдбару и прячет её собственное поле — иначе полей было бы два.
    // ЧТО ИЗМЕНИЛОСЬ ПРОТИВ ПОДВАЛА: поле больше не раскрывается лупой поверх
    // аватара, а стоит открытым наверху колонки — на месте снятого слота
    // виджетов. Поэтому «открыто/закрыто» теперь означает не поле, а ПАЛИТРУ:
    // класс .on висит на #sbCmd только пока она развёрнута.
    function sbSearchSet(on) {
        var row = document.getElementById('sbCmd');
        var inp = document.getElementById('sbSearchInput');
        var overlay = document.getElementById('searchOverlay');
        if (!row || !inp) return;
        row.classList.toggle('on', !!on);
        document.body.classList.toggle('sbs-open', !!on);
        if (on) {
            if (overlay) overlay.classList.add('open');
            document.body.classList.add('ts-open');
            try { inp.focus(); } catch (e) {}
        } else {
            inp.value = '';
            try { inp.blur(); } catch (e) {}
            if (window.closeTopSearch) window.closeTopSearch();
        }
    }
    // Фокус в поле = запрос палитры. Поле стоит открытым всегда, и без этого
    // пользователь набирал бы текст в никуда: обработчики ввода палитру сами
    // не разворачивают.
    window.sbSearchOpen = function () {
        var row = document.getElementById('sbCmd');
        if (row && row.classList.contains('on')) return;
        sbSearchSet(true);
    };
    window.sbSearchToggle = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        var row = document.getElementById('sbCmd');
        var open = !(row && row.classList.contains('on'));
        // в рейке 84px поля нет вовсе — там на его месте кнопка-лупа. Сперва
        // разворачиваем колонку, потом открываем палитру: клик по лупе всё
        // равно должен приводить к поиску, а не только к ширине.
        if (open && document.body.classList.contains('sb-rail') && document.body.classList.contains('sb-collapsed')) {
            window.toggleSidebarCollapse();
            setTimeout(function () { sbSearchSet(true); }, 270);   // после перехода ширины
            return;
        }
        sbSearchSet(open);
    };
    window.sbSearchClose = function () { sbSearchSet(false); };
    // Палитра закрывается своими путями (Esc, клик по подложке, выбор бумаги) —
    // поле обязано погаснуть следом, иначе в колонке остался бы набранный текст
    // и активная рамка уже без результатов.
    (function () {
        var prev = window.closeTopSearch;
        if (typeof prev !== 'function') return;
        window.closeTopSearch = function () {
            var r = prev.apply(this, arguments);
            var row = document.getElementById('sbCmd');
            if (row && row.classList.contains('on')) {
                row.classList.remove('on');
                document.body.classList.remove('sbs-open');
                var inp = document.getElementById('sbSearchInput');
                if (inp) { inp.value = ''; try { inp.blur(); } catch (e) {} }
            }
            return r;
        };
    })();

    // ===== КЛАВИАТУРА: стрелки ходят по колонке =====
    // Tab по сайдбару работал и раньше (разделы — <a href>, второй уровень —
    // <button>), но Tab идёт ПО ОДНОМУ узлу и не знает про сетку: чтобы попасть
    // из «Расчёта» в «Тест» под ним, нужно было пройти весь первый ряд. Стрелки
    // говорят на языке раскладки — влево/вправо по ряду, вверх/вниз по столбцу,
    // а на границе сетки фокус перетекает во второй уровень и обратно.
    // Раскладку НЕ ЗАШИВАЕМ: число колонок читаем из реального положения ячеек
    // (в рейке колонка одна, в сетке четыре) — иначе рейка ходила бы по правилам
    // сетки, которой в ней нет.
    var NAVKEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Home: 1, End: 1 };
    function sbVisible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
    function sbNavCells() {
        var nav = document.getElementById('sbNav');
        if (!nav) return [];
        // БЕЗ ФИЛЬТРА [data-tab]: видимый первый уровень на десктопе — это
        // строки, сгенерированные в #sbFlat (sidebar-ctx.js), и data-tab у них
        // нет — подвкладки «Портфелей» ходят через data-act="pfx"/"trading",
        // копии настоящих вкладок несут только href/onclick, а «Ещё» — это
        // data-act="flatmore". Отбор по data-tab оставлял бы список пустым (или
        // ловил бы скрытые исходные ссылки) — и стрелки на этих строках молчали.
        // Скрытые исходники отсеивает sbVisible, порядок отдаёт сам DOM.
        return Array.prototype.filter.call(nav.querySelectorAll('.sb-item'), sbVisible);
    }
    function sbCtxCells() {
        var ctx = document.getElementById('sbCtx');
        if (!ctx || !document.body.classList.contains('sb-ctx')) return [];
        return Array.prototype.filter.call(ctx.querySelectorAll('.sbc-it'), sbVisible);
    }
    // РЯД — ВСЕГДА ОДНА СТРОКА (раунд 6). Прежний sbPerRow() считал ячейки в
    // первом ряду по offsetTop, потому что разделы стояли сеткой 3–4 в ряд, а в
    // рейке — столбиком. Теперь и в колонке, и в рейке это список: вверх-вниз
    // ходят по одному пункту, влево-вправо делают то же самое (в списке им
    // больше нечего значить, а отнимать привычный ход не за что).
    function sbFocus(el) { if (el) { try { el.focus(); } catch (e) {} } }
    function onSbKey(e) {
        if (!sbIsDesktop() || !NAVKEYS[e.key]) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var t = e.target;
        if (!t || !t.closest) return;
        // поле поиска само обрабатывает стрелки (выбор строки в палитре)
        if (t.id === 'sbSearchInput') return;
        var inNav = !!t.closest('#sbNav'), inCtx = !!t.closest('#sbCtx');
        if (!inNav && !inCtx) return;
        var cells = inNav ? sbNavCells() : sbCtxCells();
        var i = cells.indexOf(t.closest(inNav ? '.sb-item' : '.sbc-it'));
        if (i < 0) return;
        var per = 1;
        var to = null, other;
        if (e.key === 'Home') to = cells[0];
        else if (e.key === 'End') to = cells[cells.length - 1];
        else if (e.key === 'ArrowRight') to = cells[Math.min(i + 1, cells.length - 1)];
        else if (e.key === 'ArrowLeft') to = cells[Math.max(i - 1, 0)];
        else if (e.key === 'ArrowDown') {
            if (inNav && i + per >= cells.length) {
                // с последнего раздела — в первый пункт второго уровня
                other = sbCtxCells();
                to = other.length ? other[0] : cells[cells.length - 1];
            } else to = cells[Math.min(i + per, cells.length - 1)];
        } else if (e.key === 'ArrowUp') {
            if (inCtx && i === 0) {
                other = sbNavCells();
                to = other.length ? other[other.length - 1] : null;
            } else to = cells[Math.max(i - per, 0)];
        }
        if (!to) return;
        e.preventDefault();
        sbFocus(to);
    }
    document.addEventListener('DOMContentLoaded', function () {
        var sb = document.getElementById('sideBar');
        // на самом сайдбаре, а не на документе: стрелки в таблицах и полях
        // страницы остаются страничными
        if (sb) sb.addEventListener('keydown', onSbKey);
    });

    window.openSidebarDrawer = function() {
        document.body.classList.add('sb-open');
    };
    window.closeSidebarDrawer = function() {
        document.body.classList.remove('sb-open');
    };

    // Section badges in the header: icon chip + name
    var hdrSections = {
        dashboard: { name: 'Главная',        icon: '<path d="M3 9.5L12 3l9 6.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>' },
        calc:      { name: 'Расчёт',         icon: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>' },
        portfolio: { name: 'Портфель',       icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
        portfolios:{ name: 'Портфели',       icon: '<rect x="2" y="7" width="20" height="13" rx="1"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/>' },
        rebalance: { name: 'Ребаланс',       icon: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><polyline points="17 6 23 6 23 12"/>' },
        market:    { name: 'Рынок',          icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
        // Объединённая вкладка терминала (Акции ↔ Облигации внутри)
        'market-stocks': { name: 'Терминал', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/>' },
        backtest:  { name: 'Тест портфеля',  icon: '<path d="M3 3v18h18"/><path d="M18 17l-5-5-4 4-3-3"/>' },
        admin:     { name: 'Админка',        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' }
    };
    function updateDockActive(tabId) {
        document.querySelectorAll('#mobileDock [data-tab]').forEach(function(btn) {
            var isActive = btn.dataset.tab === tabId ||
                           (btn.dataset.tab === 'calc' && (tabId === 'portfolio' || tabId === 'monthly')) ||
                           (btn.dataset.tab === 'market' && (tabId === 'market-bonds' || tabId === 'market-stocks')) ||
                           (btn.dataset.tab === 'home' && tabId === 'dashboard');
            btn.classList.toggle('active', isActive);
        });
    }
    function renderHeaderBadge(tabId) {
        // «Ежемесячный доход» объединён с расчётом — бейдж показываем расчётный
        if (tabId === 'monthly') tabId = 'calc';
        var crumb = document.getElementById('topBarCrumb');
        if (!crumb) return;
        var s = hdrSections[tabId];
        if (s) {
            // вкладку могли переименовать в админке (js/tab-gates.js) — своё имя
            // старше словаря; пустой titleOf значит «зовётся как встроено»
            var nm = (window.tabGates && window.tabGates.titleOf && window.tabGates.titleOf(tabId)) || s.name;
            // Подвкладка («Портфели · Обзор») из крошки СНЯТА вместе с самой
            // шапкой: на десктопе её больше нет нигде, кроме «Главной», а там
            // разделов не бывает. Раздел и подвкладку показывает сайдбар —
            // зелёный кружок в сетке и пилюля в списке. Крошка осталась ради
            // мобильной шапки, которая никуда не делась.
            var html = '<span class="hdr-chip"><svg viewBox="0 0 24 24">' + s.icon + '</svg></span>' +
                       '<span class="hdr-sec">' + esc(nm) + '</span>';
            if (crumb.innerHTML !== html) crumb.innerHTML = html;
            crumb.style.display = 'flex';
        } else {
            crumb.style.display = 'none';
        }
    }
    window.renderHeaderBadge = renderHeaderBadge;

    // ===== Раскрывающиеся подразделы (Расчёт / Рынок) =====
    // Какая группа/подпункт активны для данной вкладки.
    // 'monthly' объединён с расчётом (js/calc-mode.js). Подвкладки результатов:
    // «Смешанный портфель» (calc-mix → вкладка portfolio) и «Ежемесячный доход»
    // (calc-monthly → купонный режим calc); появляются после первого расчёта.
    // Подсветку подпункта для вкладки calc уточняет по режиму обёртка
    // sbSyncActive в calc-mode.js.
    var SB_GROUP_OF = { calc: 'calc', portfolio: 'calc', monthly: 'calc', market: 'market', 'market-bonds': 'market', 'market-stocks': 'market' };
    var SB_SUB_OF   = { calc: 'calc-portfolio', portfolio: 'calc-mix', monthly: 'calc-portfolio', 'market-bonds': 'market-terminal', 'market-stocks': 'market-terminal' };

    function sbGroupEl(group) { return document.querySelector('.sb-group[data-group="' + group + '"]'); }

    window.sbOpenGroup = function(group) {
        var g = sbGroupEl(group);
        if (g) g.classList.add('open');
    };
    // Клик по шеврону — только раскрыть/свернуть, без перехода
    window.sbToggleGroup = function(group, e) {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        var g = sbGroupEl(group);
        if (g) g.classList.toggle('open');
    };
    // Клик по строке родителя — переход на вкладку + раскрытие подпунктов
    window.sbNavParent = function(group, e) {
        window.sbOpenGroup(group);
        if (group === 'calc') { switchToCalcOrPortfolio(); }
        else { switchTab(group); }
    };
    // Клик по подпункту
    window.sbNavSub = function(sub, e) {
        if (e) e.stopPropagation();
        if (sub === 'calc-portfolio') {
            // «Расчёт портфеля» = начать новый расчёт: карточки выбора типа
            window.sbOpenGroup('calc');
            if (window.cxSetMode) window.cxSetMode('choose');
            switchTab('calc');
        }
        else if (sub === 'calc-mix') { window.sbOpenGroup('calc'); switchTab('portfolio'); }
        else if (sub === 'calc-monthly') {
            window.sbOpenGroup('calc');
            if (window.cxGoMonthly) window.cxGoMonthly(); else switchTab('calc');
        }
        else if (sub === 'market-terminal') {
            // объединённый терминал: акции ↔ облигации переключаются внутри вкладки
            window.sbOpenGroup('market'); switchTab('market-stocks');
        }
        else if (sub === 'market-bonds' || sub === 'market-stocks') {
            window.sbOpenGroup('market'); switchTab(sub);
        }
    };
    // ---- Пункты-ссылки: обычный клик — SPA-переход, модифицированный — браузеру ----
    // Пункты сайдбара — настоящие <a href>: Cmd/Ctrl/Shift/средний клик открывает
    // раздел в новой вкладке браузера (прямая загрузка пути восстанавливается
    // route-hash.js). Обычный левый клик перехватываем и переключаем без перезагрузки.
    function sbModClick(e) {
        return !!(e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
            (typeof e.button === 'number' && e.button !== 0)));
    }
    // ---- Клик по разделу управляет вторым уровнем ----
    // Чужой раздел: переходим и РАЗВОРАЧИВАЕМ колонку — нажатие на раздел это
    // запрос «покажи, что внутри», отвечать на него одной сменой контента,
    // оставляя второй уровень спрятанным, неправильно.
    // Свой (уже активный) раздел: клик схлопывает колонку в рейку и обратно.
    // Перехода при этом НЕ делаем: мы уже здесь, а лишний switchTab перерисовал
    // бы вкладку впустую.
    // На мобиле не трогаем ничего: колонки там нет, а флаг общий.
    function sbSectionOf(tab) { return SB_GROUP_OF[tab] || tab; }
    function sbSetCollapsed(on) {
        document.body.classList.toggle('sb-collapsed', !!on);
        try { localStorage.setItem('sbCollapsed', on ? '1' : '0'); } catch (e) {}
        sbRailSync();
        updateCollapseLabel();
        if (window.sbCtxSync) window.sbCtxSync();
    }
    // true — клик обслужен колонкой, переход не нужен
    function sbColumnClick(tab) {
        if (!sbIsDesktop() || !window.sbCtxHas || !window.sbCtxHas(tab)) return false;
        var cur = sbSectionOf(typeof currentTab !== 'undefined' ? currentTab : '');
        var collapsed = document.body.classList.contains('sb-collapsed');
        if (cur === tab) { sbSetCollapsed(!collapsed); return true; }
        if (collapsed) sbSetCollapsed(false);
        return false;
    }
    window.sbGo = function(e, tab) {
        if (sbModClick(e)) return true;
        if (e) e.preventDefault();
        if (sbColumnClick(tab)) return false;
        if (tab === 'home' && typeof window.goHome === 'function') window.goHome();
        else switchTab(tab);
        return false;
    };
    window.sbGoParent = function(e, group) {
        if (sbModClick(e)) return true;
        if (e) e.preventDefault();
        if (sbColumnClick(group)) return false;
        window.sbNavParent(group, e);
        return false;
    };
    window.sbGoSub = function(e, sub) {
        if (sbModClick(e)) return true;
        if (e) e.preventDefault();
        window.sbNavSub(sub, e);
        return false;
    };

    // Синхронизирует активную группу/подпункт и подсветку родителя с текущей вкладкой
    function sbSyncActive(tabId) {
        var activeGroup = SB_GROUP_OF[tabId] || null;
        var activeSub = SB_SUB_OF[tabId] || null;
        if (activeGroup) window.sbOpenGroup(activeGroup);
        document.querySelectorAll('.sb-parent').forEach(function(p) {
            var g = p.closest('.sb-group');
            p.classList.toggle('active', !!g && g.getAttribute('data-group') === activeGroup);
        });
        document.querySelectorAll('.sb-sub').forEach(function(s) {
            s.classList.toggle('active', !!activeSub && s.getAttribute('data-sub') === activeSub);
        });
        // «Главная» показывает рейку, остальные разделы — колонку
        sbRailSync();
        sbTitleSync();   // подпись могли переименовать из админки — подсказка следом
        // на «Главной» шапка сайта жива, и аватар со звоночком уезжают обратно в неё
        sbPersonalSync();
        // поиск, раскрытый в подвале, уходить вместе с вкладкой не должен зависать
        if (window.sbSearchClose) window.sbSearchClose();
        // Второй уровень зеркалит эти же .sb-sub («Расчёт»/«Рынок») и спрашивает
        // PF о «Портфелях» — пересобирается ПОСЛЕ простановки .active, а ещё он
        // встаёт в разметку сразу за активным разделом (см. placeCtx)
        if (window.sbCtxSync) window.sbCtxSync();
    }
    window.sbSyncActive = sbSyncActive;

    // Close mobile drawer after navigation
    var _sbPrevSwitchTab = switchTab;
    switchTab = function(tabId) {
        _sbPrevSwitchTab(tabId);
        window.closeSidebarDrawer();
        renderHeaderBadge(tabId);
        updateDockActive(tabId);
        sbSyncActive(tabId);
        if (['portfolio','rebalance','market','backtest'].indexOf(tabId) !== -1 && window.pfSyncLeftWidth) {
            requestAnimationFrame(function() {
                window.pfSyncLeftEdge && window.pfSyncLeftEdge();
                window.pfSyncLeftWidth();
                window.pfCenterTables && window.pfCenterTables();
            window.pfFitNumbers && window.pfFitNumbers();
            });
        }
    };

    // Esc closes the drawer
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') window.closeSidebarDrawer();
    });

    // ===== Красивый календарь для даты бэктеста (десктоп) =====
    (function() {
        var mq = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };
        var MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        var MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        var DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
        var pop = null, vY = 0, vM = 0, view = 'days', vYPageEnd = 0;
        var MIN_YEAR = 2014;
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        function chevron() { return '<svg class="btcal-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'; }
        function getInput() { return document.getElementById('btDateInput'); }
        function getField() { var i = getInput(); return i ? i.closest('.bt-date-field') : null; }
        function closeCal() { if (pop) { pop.remove(); pop = null; } }
        function selDate() {
            var inp = getInput();
            if (inp && inp.value) {
                var p = inp.value.split('-');
                return { y: +p[0], m: +p[1] - 1, d: +p[2] };
            }
            return null;
        }
        function monthInFuture(y, m, tY, tM) { return y > tY || (y === tY && m > tM); }

        function renderDays() {
            var today = new Date(); today.setHours(0,0,0,0);
            var tY = today.getFullYear(), tM = today.getMonth();
            var sel = selDate();
            var nm = vM === 11 ? 0 : vM + 1, ny = vM === 11 ? vY + 1 : vY;
            var nextDis = monthInFuture(ny, nm, tY, tM);
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<div class="btcal-sel">'
                + '<button type="button" class="btcal-pick" data-pick="months">' + MONTHS[vM] + chevron() + '</button>'
                + '<button type="button" class="btcal-pick" data-pick="years">' + vY + chevron() + '</button>'
                + '</div>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-dow">';
            DOW.forEach(function(d) { h += '<span>' + d + '</span>'; });
            h += '</div><div class="btcal-grid">';
            var first = new Date(vY, vM, 1);
            var offset = (first.getDay() + 6) % 7;
            var dim = new Date(vY, vM + 1, 0).getDate();
            var dimPrev = new Date(vY, vM, 0).getDate();
            for (var i = 0; i < 42; i++) {
                var dnum, cy = vY, cm = vM, out = false;
                if (i < offset) { dnum = dimPrev - offset + 1 + i; cm = vM - 1; out = true; }
                else if (i >= offset + dim) { dnum = i - offset - dim + 1; cm = vM + 1; out = true; }
                else { dnum = i - offset + 1; }
                var dt = new Date(cy, cm, dnum); dt.setHours(0,0,0,0);
                var dis = dt > today;
                var isSel = sel && dt.getFullYear() === sel.y && dt.getMonth() === sel.m && dt.getDate() === sel.d;
                var isToday = dt.getTime() === today.getTime();
                var cls = 'btcal-day' + (out ? ' out' : '') + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isToday ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-date="' + dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + '"') + '>' + dnum + '</button>';
            }
            h += '</div>';
            return h;
        }

        function renderMonths() {
            var today = new Date();
            var tY = today.getFullYear(), tM = today.getMonth();
            var sel = selDate();
            var nextDis = vY >= tY;
            var prevDis = vY <= MIN_YEAR;
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"' + (prevDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<button type="button" class="btcal-title" data-pick="years">' + vY + chevron() + '</button>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-months">';
            for (var m = 0; m < 12; m++) {
                var dis = monthInFuture(vY, m, tY, tM);
                var isSel = sel && sel.y === vY && sel.m === m;
                var isCur = vY === tY && m === tM;
                var cls = 'btcal-mo' + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isCur ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-month="' + m + '"') + '>' + MONTHS_SHORT[m] + '</button>';
            }
            h += '</div>';
            return h;
        }

        function renderYears() {
            var today = new Date();
            var tY = today.getFullYear();
            var sel = selDate();
            var end = vYPageEnd, start = end - 11;
            var prevDis = start <= MIN_YEAR;
            var nextDis = end >= tY;
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"' + (prevDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<div class="btcal-title btcal-title-static">' + Math.max(MIN_YEAR, start) + ' – ' + end + '</div>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-years">';
            for (var y = start; y <= end; y++) {
                if (y < MIN_YEAR) { h += '<span class="btcal-yr empty"></span>'; continue; }
                var dis = y > tY;
                var isSel = sel && sel.y === y;
                var isCur = y === tY;
                var cls = 'btcal-yr' + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isCur ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-year="' + y + '"') + '>' + y + '</button>';
            }
            h += '</div>';
            return h;
        }

        function render() {
            if (!pop) return;
            pop.innerHTML = view === 'years' ? renderYears() : (view === 'months' ? renderMonths() : renderDays());
        }

        function openCal() {
            var inp = getInput();
            var field = getField();
            if (!inp || !field) return;
            closeCal();
            var sel = selDate();
            var base = sel ? new Date(sel.y, sel.m, 1) : new Date();
            vY = base.getFullYear(); vM = base.getMonth(); view = 'days';
            pop = document.createElement('div');
            pop.className = 'btcal';
            field.appendChild(pop);
            render();
            pop.addEventListener('click', function(e) {
                var t = new Date(), tY = t.getFullYear(), tM = t.getMonth();
                var nav = e.target.closest('[data-nav]');
                if (nav) {
                    if (nav.disabled) return;
                    var d = parseInt(nav.dataset.nav, 10);
                    if (view === 'years') {
                        vYPageEnd += d * 12;
                        if (vYPageEnd > tY) vYPageEnd = tY;
                        if (vYPageEnd < MIN_YEAR + 11) vYPageEnd = MIN_YEAR + 11;
                    } else if (view === 'months') {
                        vY += d;
                        if (vY < MIN_YEAR) vY = MIN_YEAR;
                        if (vY > tY) vY = tY;
                    } else {
                        vM += d;
                        if (vM < 0) { vM = 11; vY--; }
                        if (vM > 11) { vM = 0; vY++; }
                    }
                    render();
                    return;
                }
                var pick = e.target.closest('[data-pick]');
                if (pick) {
                    if (pick.dataset.pick === 'years') {
                        view = 'years';
                        vYPageEnd = tY;
                        if (vY < vYPageEnd - 11) vYPageEnd = vY + 11;
                        if (vYPageEnd < MIN_YEAR + 11) vYPageEnd = MIN_YEAR + 11;
                    } else {
                        view = 'months';
                    }
                    render();
                    return;
                }
                var mo = e.target.closest('[data-month]');
                if (mo) {
                    vM = parseInt(mo.dataset.month, 10);
                    view = 'days';
                    render();
                    return;
                }
                var yr = e.target.closest('[data-year]');
                if (yr) {
                    vY = parseInt(yr.dataset.year, 10);
                    if (monthInFuture(vY, vM, tY, tM)) vM = tM;
                    view = 'days';
                    render();
                    return;
                }
                var day = e.target.closest('[data-date]');
                if (day) {
                    var inp2 = getInput();
                    inp2.value = day.dataset.date;
                    if (typeof onBtDateChange === 'function') onBtDateChange();
                    closeCal();
                }
            });
        }

        // На десктопе делаем поле readonly — это полностью отключает нативный
        // системный календарь, оставляя только наш кастомный.
        function applyMode() {
            var inp = getInput();
            if (!inp) return;
            if (mq.matches) { inp.readOnly = true; }
            else { inp.readOnly = false; closeCal(); }
        }
        if (mq.addEventListener) mq.addEventListener('change', applyMode);
        else if (mq.addListener) mq.addListener(applyMode);
        window.addEventListener('resize', applyMode);
        applyMode();
        document.addEventListener('DOMContentLoaded', applyMode);

        document.addEventListener('mousedown', function(e) {
            var inp = getInput();
            if (!inp) return;
            if (e.target === inp && mq.matches) {
                e.preventDefault();
                if (pop) closeCal(); else openCal();
                return;
            }
            if (pop && !pop.contains(e.target)) closeCal();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeCal();
        });
    })();

    // Initial active state sync (switchTab may have run before this script)
    document.addEventListener('DOMContentLoaded', function() {
        var ct = (typeof currentTab !== 'undefined' && currentTab) ? currentTab : 'home';
        renderHeaderBadge(ct);
        updateDockActive(ct);
        document.querySelectorAll('.sb-item[data-tab]').forEach(function(btn) {
            var isActive = btn.dataset.tab === ct ||
                           (btn.dataset.tab === 'calc' && (ct === 'portfolio' || ct === 'monthly')) ||
                           (btn.dataset.tab === 'market' && (ct === 'market-bonds' || ct === 'market-stocks')) ||
                           (btn.dataset.tab === 'home' && ct === 'dashboard');
            btn.classList.toggle('active', isActive);
        });
        sbSyncActive(ct);
        // profile-menu.js и notifications.js грузятся ПОСЛЕ нас — их узлы
        // появляются только к этому моменту, поэтому переезд повторяем здесь
        sbPersonalSync();
    });
})();
