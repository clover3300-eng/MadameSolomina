// ===== «ПОРТФЕЛИ» · ЭКРАНЫ «ТОРГОВЛИ» (модуль цепочки #pfLazySrc) =====
// Парящая полоса внизу подвкладки «Торговля»: ряд экранов + «плюс».
//
// ЗАЧЕМ. Бумага в терминале занимает пару «стакан + тикет», к ней просится
// график и лента заявок — на одной странице больше трёх-четырёх тикеров не
// помещается, а держать их хочется десяток. Экран — это ещё одна раскладка
// того же дашборд-конструктора: свои виджеты, свои размеры, своя бумага в
// слотах. Переключение мгновенное, и опрашивается ВСЕГДА только видимый
// экран (liveSlots смотрит в DOM) — соседние молчат и лимит брокера не жгут.
//
// МОДЕЛЬ. Отдельного хранилища у экранов нет: ключ подвкладки 'trading'
// (первый экран, исторический) и 'trading:2', 'trading:3'… — обычные ключи
// pf_dash_tabs_v1, значит раскладки и имена (cfg.name) едут в облако вместе
// со всеми (cloud-sync.WATCH). Активный экран — позиция UI, живёт локально
// в pf_subtab_v1 / pf_trade_screen_v1. Помощники по ключам — в
// portfolios-dash.js (pfxIsTradeTab / pfxTradeTabs / pfxTradeName / …).
//
// ГДЕ ЖИВЁТ ПОЛОСА. В <body>, а не внутри панели: у вкладок сайта на предках
// стоит transform (анимация tabFadeIn), а он ловит position:fixed — тот же
// приём, что у шторки #stockDetailCard и кнопки #pfWidgetFab. Видимость
// гейтит CSS (body:has(#panel-portfolios.active)) плюс класс .on отсюда.
(function () {
    'use strict';
    var PF = window.PF;
    var esc = PF.esc, toast = PF.toast, dq = PF.dq;

    // потолок экранов: 16 сквозных номеров слотов при 4 на экран — это ровно
    // четыре полных экрана, остальные под заметки и графики. Восемь — запас,
    // за которым полоса всё равно перестанет читаться
    var MAX_SCREENS = 8;
    var renaming = '';       // ключ экрана, чьё имя сейчас правят инлайном
    var menuOf = '';         // ключ экрана с открытым меню
    // поиск «экран сразу по тикеру»: лупа рядом с «плюсом»
    var findOpen = false, findRes = [], findBusy = false, findMsg = '', findT = null;

    function tabs() { return PF.pfxTradeTabs ? PF.pfxTradeTabs() : ['trading']; }
    function nameOf(t) { return PF.pfxTradeName ? PF.pfxTradeName(t) : 'Экран'; }
    function active() { return PF.pfxEffTab ? PF.pfxEffTab() : 'trading'; }
    function isTrade(t) { return !!(PF.pfxIsTradeTab && PF.pfxIsTradeTab(t)); }
    // Конфиг экрана. Именно dashCfgFor, а не «сырое» чтение pfTabCfgs/pfTabsStore:
    // у ПЕРВОГО экрана записи в хранилище может не быть вовсе (его никто не правил),
    // и тогда полоса не показала бы его бумаги, а удаление соседнего экрана сочло
    // бы их бесхозными. Сид (а с ним выдачу слота) dashCfgFor запускает только на
    // незнакомом ключе — tabs() же перечисляет ровно существующие экраны.
    function cfgOf(t) { try { return PF.dashCfgFor(t); } catch (e) { return null; } }

    // ---------- разметка ----------
    var IC_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    var IC_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
    // та же лупа, что в шапках стакана и графика: жест «найти бумагу» по всему
    // терминалу обязан выглядеть одинаково
    var IC_LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    var IC_FS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"/></svg>';
    var IC_SIMPLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>';

    // подпись бумаг экрана: полоса должна отвечать «что там», не открывая экран.
    // Тикеры берём из слотов, разложенных в конфиге ЭТОГО экрана
    function tickersOf(t) {
        var cfg = cfgOf(t), out = [], seen = {};
        ((cfg && cfg.order) || []).forEach(function (id) {
            var m = /^trade:ob(?::(\d+))?$/.exec(id);
            if (!m) return;
            var n = Math.max(1, Math.floor(+(m[1] || 1)));
            var ins = PF.pftSlotInstr ? PF.pftSlotInstr(n) : null;
            if (ins && ins.ticker && !seen[ins.ticker]) { seen[ins.ticker] = 1; out.push(ins.ticker); }
        });
        return out;
    }

    function pillHtml(t, on) {
        // экран, заведённый лупой, зовётся своим тикером — повторять его во
        // второй строке незачем (эхо); прочие бумаги экрана там остаются
        var nm = nameOf(t);
        var tick = tickersOf(t).filter(function (x) { return x !== nm; });
        var sub = tick.length ? tick.slice(0, 3).join(' · ') + (tick.length > 3 ? ' +' + (tick.length - 3) : '') : '';
        if (renaming === t) {
            return '<span class="pfts-pill pfts-editing">' +
                '<input type="text" class="pfts-input" id="pftsRename" maxlength="24" value="' + PF.attr(nameOf(t)) + '" ' +
                    'aria-label="Название экрана" onkeydown="pftScreenRenameKey(event)" onblur="pftScreenRenameDone()">' +
            '</span>';
        }
        return '<button type="button" class="pfts-pill' + (on ? ' on' : '') + '" role="tab" aria-selected="' + !!on + '" ' +
            'onclick="pftScreenGo(\'' + t + '\')" ondblclick="pftScreenRename(\'' + t + '\')" ' +
            // правый клик по своему экрану — то же меню, что под «⋮»: привычка
            // из вкладок браузера, и мишень «⋮» перестаёт быть единственной
            (on ? 'oncontextmenu="pftScreenMenu(\'' + t + '\', event); return false;" ' : '') +
            'title="' + PF.attr(nameOf(t) + (sub ? ' — ' + sub : '')) + '">' +
            '<span class="pfts-nm">' + esc(nameOf(t)) + '</span>' +
            (sub ? '<span class="pfts-sub">' + esc(sub) + '</span>' : '') +
            // «⋮» только у активного экрана: меню правит именно его, и ряд не
            // рябит тремя точками на каждой пилюле
            (on ? '<span class="pfts-more" role="button" aria-label="Действия с экраном" ' +
                'onclick="pftScreenMenu(\'' + t + '\', event)">' + IC_DOTS + '</span>' : '') +
        '</button>';
    }

    function menuHtml(t) {
        var only = tabs().length < 2;
        return '<div class="pfts-menu" id="pftsMenu">' +
            '<button type="button" onclick="pftScreenRename(\'' + t + '\')">Переименовать</button>' +
            '<button type="button" onclick="pftScreenDup(\'' + t + '\')">Дублировать</button>' +
            // первый экран не удаляется: он — сама подвкладка «Торговля»
            (only || t === 'trading'
                ? '<button type="button" class="pfts-off" disabled title="Первый экран — это сама подвкладка «Торговля»">Удалить</button>'
                : '<button type="button" class="pfts-del" onclick="pftScreenDel(\'' + t + '\')">Удалить экран</button>') +
        '</div>';
    }

    // выпадашка лупы: экран заводится сразу по бумаге — стакан, заявка и график
    // встают на неё, а сам экран называется тикером
    function findHtml() {
        return '<div class="pfts-find" id="pftsFind">' +
            '<input type="text" class="pfts-find-inp" id="pftsFindInp" autocomplete="off" spellcheck="false" ' +
                'placeholder="Тикер или название — например, SBER" aria-label="Бумага нового экрана" ' +
                'oninput="pftScreenFindInput(this.value)" onkeydown="pftScreenFindKey(event)">' +
            '<div class="pfts-find-drop" id="pftsFindDrop">' + findDropHtml() + '</div></div>';
    }
    function findDropHtml() {
        if (findMsg) return '<div class="pfts-find-note">' + esc(findMsg) + '</div>';
        if (findBusy && !findRes.length) return '<div class="pfts-find-note">Ищем бумагу…</div>';
        if (!findRes.length) return '<div class="pfts-find-note">Введите тикер — новый экран откроется уже с этой бумагой.</div>';
        return findRes.map(function (i, k) {
            var tag = PF.pftInstrTag ? PF.pftInstrTag(i) : '';
            return '<div class="pfts-find-row" role="button" tabindex="-1" onclick="pftScreenFindPick(' + k + ')">' +
                '<b>' + esc(i.ticker || '') + '</b><span>' + esc(i.name || '') + '</span>' +
                (tag ? '<i>' + esc(tag) + '</i>' : '') + '</div>';
        }).join('');
    }

    // Полоса — ДВЕ капсулы: слева ряд экранов (он скроллится, когда их много),
    // справа «новый экран». Раньше обе кнопки стояли внутри ряда с пунктирными
    // рамками: пунктир рябил рядом с пилюлями, а на седьмом экране кнопки
    // уезжали в скролл — до них нельзя было дотянуться, не прокрутив ряд.
    // ---- ряд экранов ВНУТРИ полосы 44px (макет 01) ----
    // Там он выглядит иначе: компактная пилюля «точка · имя · тикер», без
    // подстроки и без «⋮», и одна пунктирная кнопка «+». Всё остальное
    // (полноэкранный, «Просто», лупа) в полосе не нужно — режим уже включён,
    // а переключатель сложности живёт в меню «…».
    function pillBarHtml(t, on) {
        if (renaming === t) {
            return '<span class="tb-s tb-s-edit">' +
                '<input type="text" class="pfts-input" id="pftsRename" maxlength="24" value="' + PF.attr(nameOf(t)) + '" ' +
                    'aria-label="Название экрана" onkeydown="pftScreenRenameKey(event)" onblur="pftScreenRenameDone()">' +
            '</span>';
        }
        var nm = nameOf(t);
        var tick = tickersOf(t).filter(function (x) { return x !== nm; });
        return '<button type="button" class="tb-s' + (on ? ' on' : '') + '" role="tab" aria-selected="' + !!on + '" ' +
            'onclick="pftScreenGo(\'' + t + '\')" ondblclick="pftScreenRename(\'' + t + '\')" ' +
            (on ? 'oncontextmenu="pftScreenMenu(\'' + t + '\', event); return false;" ' : '') +
            'title="' + PF.attr(nm + (tick.length ? ' — ' + tick.join(' · ') : '')) + '">' +
            (on ? '<span class="dot"></span>' : '') + esc(nm) +
            (tick.length ? '<u>' + esc(tick[0]) + '</u>' : '') +
        '</button>';
    }
    function barCompactHtml() {
        var act = active();
        var full = tabs().length >= MAX_SCREENS;
        return '<div class="tb-scr" role="tablist" aria-label="Экраны терминала">' +
            tabs().map(function (t) { return pillBarHtml(t, t === act); }).join('') +
            '<button type="button" class="tb-add' + (full ? ' pfts-off' : '') + '" onclick="pftScreenAdd()" ' +
                'aria-label="Новый экран" title="' + (full
                    ? 'Экранов уже ' + MAX_SCREENS + ' — больше терминал не держит'
                    : 'Пустой экран: соберёте виджеты сами') + '">' + IC_PLUS + '</button>' +
        '</div>' + (menuOf && menuOf === act ? menuHtml(menuOf) : '');
    }
    function barHtml() {
        if (PF.pftFsOn && PF.pftFsOn()) return barCompactHtml();
        var act = active();
        var list = tabs().map(function (t) { return pillHtml(t, t === act); }).join('');
        var full = tabs().length >= MAX_SCREENS;
        // На лимите кнопки НЕ отключаем: disabled-кнопка молчит в ответ на клик, и
        // это читается как «не работает» (так и было). Кнопка остаётся живой, гаснет
        // только на вид, а причину называет тостом — отказ обязан себя объяснять
        var off = full ? ' pfts-off' : '';
        var fullT = 'Экранов уже ' + MAX_SCREENS + ' — больше терминал не держит';
        return '<div class="pfts-row" role="tablist" aria-label="Экраны терминала">' + list + '</div>' +
            (menuOf && menuOf === act ? menuHtml(menuOf) : '') +
            '<div class="pfts-new">' +
                // вход в полноэкранный режим — здесь же, где живёт навигация по
                // экранам: полоса в этом режиме переезжает наверх целиком, и кнопка
                // уезжает вместе с ней (там она уже «← Портфели»)
                // «Просто» — вход для новичка: из обычного дашборда до него иначе
                // не добраться (сегмент в полосе виден, только когда полоса уже есть)
                '<button type="button" class="pfts-nbtn pfts-simple" onclick="pftSimpleGo(true)" ' +
                    'title="Простой режим: сумма в рублях вместо лотов и типов заявок">' +
                    IC_SIMPLE + '<span>Просто</span></button>' +
                '<button type="button" class="pfts-nbtn pfts-fs" onclick="pftFsToggle()" ' +
                    'title="Терминал во весь экран: убрать всё, кроме торговли">' +
                    IC_FS + '<span>Во весь экран</span></button>' +
                '<button type="button" class="pfts-nbtn pfts-add' + off + '" onclick="pftScreenAdd()" ' +
                    'title="' + (full ? fullT : 'Пустой экран: соберёте виджеты сами') + '">' +
                    IC_PLUS + '<span>Экран</span></button>' +
                '<button type="button" class="pfts-nbtn pfts-lens' + (findOpen ? ' on' : '') + off +
                    '" onclick="pftScreenFind(event)" aria-label="Новый экран по тикеру" aria-expanded="' + findOpen + '" ' +
                    'title="' + (full ? fullT : 'Экран по тикеру: стакан, заявка и график сразу на этой бумаге') + '">' +
                    IC_LENS + '</button>' +
                (findOpen ? findHtml() : '') +
            '</div>';
    }

    // ---------- синхронизация с рендером ----------
    // Зовётся из хвоста renderPortfolios: полоса появляется только на живом
    // терминале (на гейте управлять нечем) и только на десктопе — мобильная
    // «Торговля» живёт «Обзором», см. pfxEffTab
    // Терминал перерисовывается на каждом тике котировок, а полоса меняется
    // редко — пересобираем её ТОЛЬКО когда что-то правда изменилось. Иначе
    // innerHTML-своп выбивал бы каретку из поля переименования и мигал.
    // Ряд экранов умеет жить в ДВУХ местах: плавающей полосой внизу (обычный
    // режим) и внутри строки 44px полноэкранного (туда он переезжает целиком).
    // Разметка одна на оба — иначе в ней завелись бы одинаковые id (pftsMenu,
    // pftsRename) сразу в двух копиях.
    PF.pftsBarHtml = function () { return barHtml(); };
    var lastKey = '';
    // findRes в ключ НЕ входит: выдачу перерисовывает paintDrop точечно,
    // пересборка полосы выбивала бы каретку из поля поиска
    function stateKey() {
        return [active(), menuOf, renaming, findOpen, tabs().map(function (t) {
            return t + '=' + nameOf(t) + '/' + tickersOf(t).join(',');
        }).join('|')].join('§');
    }
    // после пересборки ряда — вернуть каретку в переименование и подвесить меню
    // ПОД СВОЕЙ пилюлей, а не у левого края: активный экран может быть пятым по
    // счёту, и меню «ниоткуда» читалось бы чужим
    function afterPaint(host) {
        if (renaming) {
            var i = dq('pftsRename');
            if (i) { i.focus(); i.select(); }
        }
        var menu = dq('pftsMenu');
        // в полосе 44px ряд компактный (.tb-scr/.tb-s), в плавающей — прежний
        var pill = host.querySelector('.pfts-pill.on, .tb-s.on');
        if (menu && pill) {
            var row = host.querySelector('.pfts-row, .tb-scr');
            var left = pill.offsetLeft - (row ? row.scrollLeft : 0);
            menu.style.left = Math.max(0, left) + 'px';
        }
    }
    function hideFloating(el) {
        if (el) { el.classList.remove('on'); el.innerHTML = ''; }
        try { document.body.style.removeProperty('--pfts-h'); } catch (e) {}
    }
    function sync() {
        var el = document.getElementById('pftScreens');
        // В полноэкранном режиме ряд уехал в строку 44px. Состояние (меню, поле
        // переименования, лупа) при этом НЕ сбрасываем — оно общее для обоих
        // мест вывода, и обнуление здесь просто ломало бы их в шапке.
        if (PF.pftFsOn && PF.pftFsOn()) {
            hideFloating(el);
            // в «Просто» ряда экранов нет вовсе: бумага там одна, и «Экран 3»
            // ни о чём не говорит — host не найдётся, выходим тихо
            var host = document.querySelector('#pftBar .pftb-scr');
            if (!host) return;
            var k = stateKey();
            if (k === lastKey && host.firstChild) return;
            lastKey = k;
            host.innerHTML = barHtml();
            afterPaint(host);
            return;
        }
        var on = isTrade(active()) && !!(PF.pftTradeReady && PF.pftTradeReady()) &&
                 !!(PF.pfxWide && PF.pfxWide());
        if (!on) {
            hideFloating(el);
            menuOf = ''; renaming = ''; findOpen = false; lastKey = '';
            return;
        }
        if (!el) {
            el = document.createElement('div');
            el.id = 'pftScreens';
            document.body.appendChild(el);
        }
        var key = stateKey();
        if (key === lastKey && el.classList.contains('on')) return;
        lastKey = key;
        el.innerHTML = barHtml();
        el.classList.add('on');
        // Тосты вкладки живут внизу по центру — ровно там же, где полоса, и
        // накрывали её целиком: кнопка исчезала под плашкой сразу после нажатия
        // («не получается нажать»), а тост С ДЕЙСТВИЕМ (.has-act) ещё и ел клики.
        // Отдаём высоту полосы в CSS — тост встаёт над ней (см. broker.css)
        try { document.body.style.setProperty('--pfts-h', el.offsetHeight + 'px'); } catch (e) {}
        afterPaint(el);
    }

    // ---------- действия ----------
    window.pftScreenGo = function (t) {
        menuOf = '';
        if (t === active()) return;
        window.pfxGoTab(t);
    };

    window.pftScreenMenu = function (t, ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        menuOf = (menuOf === t) ? '' : t;
        sync();
    };
    // клик мимо — меню и поиск закрываются (как у всех поповеров вкладки)
    document.addEventListener('click', function (e) {
        if (!menuOf && !findOpen) return;
        if (e.target.closest && e.target.closest('#pftScreens')) return;
        menuOf = ''; findOpen = false;
        sync();
    });

    function nextScreenNo() {
        var used = tabs().map(function (t) { return PF.pfxTradeNo(t); });
        for (var i = 2; i <= MAX_SCREENS; i++) if (used.indexOf(i) < 0) return i;
        return 0;
    }

    // общий ход «завести экран»: сид (график | стакан | заявка по СВОБОДНОЙ
    // бумаге + «Мои заявки») собирает конструктор — см. pfxTabSeed
    function createScreen() {
        if (tabs().length >= MAX_SCREENS) {
            toast('Экранов уже ' + MAX_SCREENS + ' — удалите ненужный через «⋮» на его вкладке', true);
            return '';
        }
        var no = nextScreenNo();
        if (!no) { toast('Свободных номеров экранов не осталось', true); return ''; }
        var t = 'trading:' + no;
        PF.dashCfgFor(t);
        window.pfxGoTab(t);
        PF.saveDashCfg();       // экран должен пережить перезагрузку и уехать в облако
        return t;
    }
    window.pftScreenAdd = function () {
        menuOf = ''; findOpen = false;
        if (createScreen()) toast('Новый экран — выберите бумагу в поиске над стаканом');
    };

    // ---------- лупа: экран сразу по тикеру ----------
    window.pftScreenFind = function (ev) {
        if (ev) ev.stopPropagation();
        menuOf = '';
        // на лимите поиск не открываем — но говорим почему, а не молчим
        if (!findOpen && tabs().length >= MAX_SCREENS) {
            toast('Экранов уже ' + MAX_SCREENS + ' — удалите ненужный через «⋮» на его вкладке', true);
            return;
        }
        findOpen = !findOpen;
        findRes = []; findMsg = ''; findBusy = false;
        sync();
        if (findOpen) { var i = dq('pftsFindInp'); if (i) i.focus(); }
    };
    window.pftScreenFindInput = function (v) {
        clearTimeout(findT);
        var q = String(v || '').trim();
        findRes = []; findMsg = '';
        if (q.length < 2) { findBusy = false; paintDrop(); return; }
        if (!PF.pftFindInstruments) { findMsg = 'Поиск недоступен — брокер не подключён'; paintDrop(); return; }
        findBusy = true; paintDrop();
        // пауза как в поиске стакана: пока печатают тикер, брокера не дёргаем
        findT = setTimeout(function () {
            PF.pftFindInstruments(q).then(function (list) {
                findBusy = false;
                findRes = (list || []).slice(0, 7);
                findMsg = findRes.length ? '' : 'Ничего не нашлось — попробуйте другой тикер';
                paintDrop();
            }, function (e) {
                findBusy = false; findRes = [];
                findMsg = (e && e.message) || 'Брокер не ответил';
                paintDrop();
            });
        }, 280);
    };
    // выдачу перерисовываем ТОЧЕЧНО: пересборка всей полосы выбила бы каретку
    // из поля на первой же букве
    function paintDrop() {
        var d = dq('pftsFindDrop');
        if (d) d.innerHTML = findDropHtml();
    }
    window.pftScreenFindKey = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); findOpen = false; sync(); return; }
        // Enter без выбора берёт первую строку выдачи — самый частый случай:
        // набрал тикер, нажал Enter, экран открылся
        if (e.key === 'Enter') { e.preventDefault(); if (findRes.length) window.pftScreenFindPick(0); }
    };
    window.pftScreenFindPick = function (k) {
        var ins = findRes[k];
        if (!ins || !ins.uid) return;
        findOpen = false; findRes = [];
        var t = createScreen();
        if (!t) return;
        // экран зовётся тикером: в полосе он узнаётся с одного взгляда
        var cfg = PF.dashCfgFor(t);
        cfg.name = String(ins.ticker || '').slice(0, 24);
        if (PF.dashTab === t) PF.saveDashCfg();
        // бумага — в стакан и тикет нового экрана; связанный график встанет
        // на неё сам по событию pft-slot-change (см. portfolios-chart.js)
        var pair = PF.pftScreenPair ? PF.pftScreenPair() : { slots: [] };
        if (pair.slots[0] && PF.pftLoadInstrument) PF.pftLoadInstrument(pair.slots[0], ins.uid);
        else toast('Экран создан, но стакана на нём нет — добавьте виджет', true);
        sync();
    };

    window.pftScreenRename = function (t) {
        menuOf = '';
        renaming = t;
        sync();
    };
    window.pftScreenRenameKey = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
        if (e.key === 'Escape') { e.preventDefault(); renaming = ''; sync(); }
    };
    window.pftScreenRenameDone = function () {
        var t = renaming;
        if (!t) return;
        var i = dq('pftsRename');
        var v = i ? String(i.value || '').trim().slice(0, 24) : '';
        renaming = '';
        var cfg = PF.dashCfgFor(t);
        // имя по умолчанию («Экран 2») не храним: пустое поле — это и есть
        // «как было», и переименованный экран не застынет со старым номером
        cfg.name = (v && v !== 'Экран ' + PF.pfxTradeNo(t)) ? v : '';
        // saveDashCfg пишет ТЕКУЩУЮ подвкладку — имя чужого экрана пришлось бы
        // класть мимо; правим всегда активный, поэтому этого достаточно
        if (PF.dashTab === t) PF.saveDashCfg();
        sync();
    };

    // Дублировать: та же расстановка, но по ДРУГОЙ бумаге — номера слотов и
    // графиков перевыдаются. Кончились свободные номера — блок переезжает
    // как есть (зеркало соседнего экрана), это честнее, чем потерять его
    function remapId(id, slotMap, chartMap) {
        var m = /^trade:(ob|ticket)(?::(\d+))?$/.exec(id);
        if (m) {
            var n = Math.max(1, Math.floor(+(m[2] || 1)));
            var to = slotMap[n];
            return to ? (to === 1 ? 'trade:' + m[1] : 'trade:' + m[1] + ':' + to) : id;
        }
        var c = /^trade:chart(?::(\d+))?$/.exec(id);
        if (c) {
            var cn = Math.max(1, Math.floor(+(c[1] || 1)));
            var cto = chartMap[cn];
            return cto ? (cto === 1 ? 'trade:chart' : 'trade:chart:' + cto) : id;
        }
        return id;
    }
    window.pftScreenDup = function (t) {
        menuOf = '';
        if (tabs().length >= MAX_SCREENS) { toast('Больше ' + MAX_SCREENS + ' экранов терминал не держит', true); return; }
        var no = nextScreenNo();
        if (!no) { toast('Свободных номеров экранов не осталось', true); return; }
        var src = PF.dashCfgFor(t);
        var to = 'trading:' + no;
        // сколько РАЗНЫХ слотов и графиков на исходном экране — столько свободных
        // номеров и просим одной пачкой (pftFreeSlots/pfcFreeCharts): поштучный
        // nextFree* вернул бы один и тот же номер, новых блоков в раскладках ещё нет
        var srcSlots = [], srcCharts = [];
        (src.order || []).forEach(function (id) {
            var m = /^trade:(?:ob|ticket)(?::(\d+))?$/.exec(id);
            if (m) { var n = Math.max(1, Math.floor(+(m[1] || 1))); if (srcSlots.indexOf(n) < 0) srcSlots.push(n); }
            var c = /^trade:chart(?::(\d+))?$/.exec(id);
            if (c) { var cn = Math.max(1, Math.floor(+(c[1] || 1))); if (srcCharts.indexOf(cn) < 0) srcCharts.push(cn); }
        });
        var freeS = PF.pftFreeSlots ? PF.pftFreeSlots(srcSlots.length) : [];
        var freeC = PF.pfcFreeCharts ? PF.pfcFreeCharts(srcCharts.length) : [];
        var slotMap = {}, chartMap = {};
        srcSlots.forEach(function (n, i) { if (freeS[i]) slotMap[n] = freeS[i]; });
        srcCharts.forEach(function (n, i) { if (freeC[i]) chartMap[n] = freeC[i]; });
        var cfg = PF.normTabCfg(null);
        cfg.name = nameOf(t) + ' — копия';
        (src.order || []).forEach(function (id) {
            var nid = remapId(id, slotMap, chartMap);
            cfg.order.push(nid);
            if ((src.span || {})[id] != null) cfg.span[nid] = src.span[id];
            if ((src.h || {})[id] != null) cfg.h[nid] = src.h[id];
            if ((src.col || {})[id] != null) cfg.col[nid] = src.col[id];
            if ((src.thm || {})[id] != null) cfg.thm[nid] = src.thm[id];
            cfg.hidden[nid] = (src.hidden || {})[id] ? 1 : 0;
        });
        PF.pfTabCfgs[to] = cfg;
        window.pfxGoTab(to);
        PF.saveDashCfg();
        toast('Экран продублирован — выберите бумаги в поиске');
    };

    // ---------- удаление ----------
    // Слоты и графики, которые жили ТОЛЬКО на этом экране, гасим: иначе их
    // номера остались бы занятыми, а выбранные бумаги всплыли бы в новом экране
    function ownNumbers(t) {
        var cfg = cfgOf(t) || {}, mineS = {}, mineC = {}, otherS = {}, otherC = {};
        function scan(c, s, ch) {
            ((c && c.order) || []).forEach(function (id) {
                var m = /^trade:(?:ob|ticket)(?::(\d+))?$/.exec(id);
                if (m) s[Math.max(1, Math.floor(+(m[1] || 1)))] = 1;
                var k = /^trade:chart(?::(\d+))?$/.exec(id);
                if (k) ch[Math.max(1, Math.floor(+(k[1] || 1)))] = 1;
            });
        }
        scan(cfg, mineS, mineC);
        tabs().forEach(function (x) { if (x !== t) scan(cfgOf(x), otherS, otherC); });
        return {
            slots: Object.keys(mineS).map(Number).filter(function (n) { return !otherS[n]; }),
            charts: Object.keys(mineC).map(Number).filter(function (n) { return !otherC[n]; })
        };
    }
    window.pftScreenDel = function (t) {
        menuOf = '';
        if (t === 'trading') { toast('Первый экран удалить нельзя — это сама подвкладка «Торговля»', true); return; }
        var own = ownNumbers(t);
        var tick = tickersOf(t);
        PF.pfConfirm({
            danger: true, ok: 'Удалить экран',
            title: 'Удалить «' + nameOf(t) + '»?',
            text: 'Раскладка экрана и его виджеты пропадут' + (tick.length ? ', выбранные бумаги (' + esc(tick.join(', ')) + ') — тоже' : '') +
                '. Заявки и позиции у брокера это не трогает: они живут на счёте, а не на экране.'
        }, function () {
            var back = active() === t;
            PF.pfxDropTabCfg(t);
            if (PF.pftForgetSlots) PF.pftForgetSlots(own.slots);
            if (PF.pfcForgetCharts) PF.pfcForgetCharts(own.charts);
            // уходим с удалённого экрана на соседний (первый — всегда есть)
            if (back) {
                var rest = tabs();
                window.pfxGoTab(rest[rest.length - 1] || 'trading');
            } else if (PF.renderNoAnim) PF.renderNoAnim();
            toast('Экран удалён');
        });
    };

    PF.pftScreensSync = sync;
})();
