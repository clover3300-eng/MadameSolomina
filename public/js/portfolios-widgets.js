// ===== «ПОРТФЕЛИ» · ВИДЖЕТЫ ОБЗОРА (модуль цепочки #pfLazySrc) =====
// Рендеры виджетов дашборда: заметки (плюс их календарь срока), KPI, график
// капитала, распределение, теплокарта, новости (с очередью загрузки),
// избранное, ставки рынка, «Список активов» и R7/R8-виджеты (операции,
// доходность, снимки, отчёты, движения, индексы, пассивный доход,
// концентрация, список/структура/сводка портфелей). Конструктор зовёт их
// через PF.* из pfdBodyHtml. Имена остатка цепочки (pfCardHead, plural,
// иконки карточек…) — тоже через PF.*: остаток грузится ПОСЛЕ нас.
(function () {
    'use strict';
    var PF = window.PF;
    // импорт ядра (уже загружено):
    var aggHolding = PF.aggHolding, attr = PF.attr, calcPf = PF.calcPf, chartBusy = PF.chartBusy, clamp = PF.clamp, colorVal = PF.colorVal;
    var dateToIso = PF.dateToIso, dayDelta = PF.dayDelta, dq = PF.dq, esc = PF.esc, findPf = PF.findPf, fmtPct = PF.fmtPct;
    var fmtQty = PF.fmtQty, fmtRub = PF.fmtRub, genId = PF.genId, jsArg = PF.jsArg, loadPfChart = PF.loadPfChart, niceTicks = PF.niceTicks;
    var pfQuotesWarming = PF.pfQuotesWarming, quotes = PF.quotes, ruDate = PF.ruDate, skelHtml = PF.skelHtml, snaps = PF.snaps, toNum = PF.toNum;
    var toast = PF.toast, todayStr = PF.todayStr, topMover = PF.topMover, visibleItems = PF.visibleItems;
    // импорт конструктора (portfolios-dash.js, уже загружен):
    var PFD_NOTE_COLORS = PF.PFD_NOTE_COLORS, PFD_PLUS_SVG = PF.PFD_PLUS_SVG, pfLayoutCfgPopHtml = PF.pfLayoutCfgPopHtml, pfdActive = PF.pfdActive, pfdInChromeHtml = PF.pfdInChromeHtml, pfdLive = PF.pfdLive;
    var pfdNormNote = PF.pfdNormNote, pfdPushUndo = PF.pfdPushUndo, pfdRepackSoon = PF.pfdRepackSoon, pfdRerender = PF.pfdRerender, pfdScrollToBlock = PF.pfdScrollToBlock, saveDashCfg = PF.saveDashCfg;
    var newsHtmlCache = {};  // tk -> { html, link }
    var newsStarted = {};    // tk -> true (запрос уже поставлен в очередь)
    var newsQueue = [], newsActive = 0;

    function pfdFindNote(id) { return (PF.dashCfg.notes || []).filter(function (n) { return n.id === id; })[0]; }
    function pfdFindItem(nid, iid) { var n = pfdFindNote(nid); return n ? (n.items || []).filter(function (x) { return x.id === iid; })[0] : null; }
    function pfdNoteCard(id) { return document.querySelector('#pfWrap .pf-noteblk[data-nid="' + id + '"]'); }
    function pfdFocusEnd(el) {
        if (!el) return; el.focus();
        try { var r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
            var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
    }
    // Перед любым ре-рендером сбрасываем несохранённый (в пределах дебаунса) текст всех
    // строк заметок из DOM в модель — структурные правки (добавить/убрать строку, срок,
    // цвет) пишутся в модель сразу, дебаунсится только набор текста.
    function pfdFlushNotes() {
        clearTimeout(pfdNoteT);
        document.querySelectorAll('#pfWrap .pf-noteblk').forEach(function (card) {
            var nt = pfdFindNote(card.getAttribute('data-nid')); if (!nt) return;
            card.querySelectorAll('.pfnt-row').forEach(function (row) {
                var it = (nt.items || []).filter(function (x) { return x.id === row.getAttribute('data-iid'); })[0];
                var tx = row.querySelector('.pfnt-tx');
                if (it && tx) it.text = String(tx.textContent || '').slice(0, 4000);
            });
        });
    }
    // batch=true — заметка добавляется в составе пачки из пикера: снимок undo, сохранение,
    // ре-рендер и подкрутку делает вызывающий один раз на всю пачку (см. pfl2Add), а
    // id нового блока возвращаем — пачке он нужен, чтобы подкрутить и к заметке тоже
    window.pfdAddNote = function (batch) {
        pfdFlushNotes();
        if (!batch) pfdPushUndo();
        delete PF.dashCfg.cleared;   // заметка — тоже виджет: одноразовый призрак очистки уходит
        var id = genId('n');
        PF.dashCfg.notes = (PF.dashCfg.notes || []).concat([pfdNormNote({ id: id })]);
        PF.dashCfg.hidden['note:' + id] = 0;
        // новую заметку — сразу после последней имеющейся заметки в порядке (или в конец)
        var ord = (PF.dashCfg.order || []).slice();
        var lastNoteIdx = -1;
        for (var i = 0; i < ord.length; i++) if (ord[i].indexOf('note:') === 0) lastNoteIdx = i;
        if (lastNoteIdx >= 0) ord.splice(lastNoteIdx + 1, 0, 'note:' + id); else ord.push('note:' + id);
        PF.dashCfg.order = ord;
        if (batch) return 'note:' + id;
        saveDashCfg();
        pfdRerender();
        pfdScrollToBlock('note:' + id);
    };
    window.pfdRemoveNote = function (blockId) {
        var id = String(blockId).replace(/^note:/, '');
        pfdFlushNotes();
        pfdPushUndo();
        PF.dashCfg.notes = (PF.dashCfg.notes || []).filter(function (n) { return n.id !== id; });
        saveDashCfg();
        pfdRerender();
    };
    var pfdNoteClrOpen = null;   // id заметки с раскрытой палитрой (одна за раз)
    window.pfdNoteClrToggle = function (id, ev) {
        if (ev) ev.stopPropagation();
        var card = pfdNoteCard(id), pop = card && card.querySelector('.pfnt-colorpop'); if (!pop) return;
        var willOpen = !pop.classList.contains('open');
        document.querySelectorAll('#pfWrap .pfnt-colorpop.open').forEach(function (p) { p.classList.remove('open'); });
        pop.classList.toggle('open', willOpen);
        pfdNoteClrOpen = willOpen ? id : null;
    };
    window.pfdSetNoteColor = function (id, color, ev) {
        if (ev) ev.stopPropagation();
        var nt = pfdFindNote(id); if (!nt) return;
        var card = pfdNoteCard(id);
        if (nt.color !== color) {
            pfdPushUndo();
            nt.color = color;
            saveDashCfg();
            // перекраска без ре-рендера — не теряем фокус/каретку в строке
            if (card) {
                PFD_NOTE_COLORS.forEach(function (c) { card.classList.remove('pfnt-c-' + c); });
                card.classList.add('pfnt-c-' + color);   // --nt меняется классом → цветной значок перекрашивается сам
                card.querySelectorAll('.pfnt-sw').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-c') === color); });
            }
        }
        // палитра НЕ закрывается — рядом выбор заливки; закроет клик вне (см. обработчик ниже)
    };
    // заливка заметки: кант слева (edge) | вся карточка (full) | без линии (none, R7) —
    // перекраска классом, без ре-рендера
    window.pfdSetNoteFill = function (id, fill, ev) {
        if (ev) ev.stopPropagation();
        fill = (fill === 'full' || fill === 'none') ? fill : 'edge';
        var nt = pfdFindNote(id); if (!nt || nt.fill === fill) return;
        var card = pfdNoteCard(id);
        pfdPushUndo(); nt.fill = fill; saveDashCfg();
        if (card) {
            card.classList.toggle('pfnt-fill-full', fill === 'full');
            card.classList.toggle('pfnt-fill-edge', fill === 'edge');
            card.classList.toggle('pfnt-fill-none', fill === 'none');
            card.querySelectorAll('.pfnt-fillb').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-f') === fill); });
        }
    };
    // редактируемый заголовок заметки (клик по подписи → инпут, как у названия портфеля)
    window.pfdNoteNameEdit = function (id, ev) {
        if (ev) ev.stopPropagation();
        var nt = pfdFindNote(id); if (!nt) return;
        var host = ev && ev.currentTarget; if (!host || host._editing) return;
        host._editing = true;
        var inp = document.createElement('input');
        inp.className = 'pfnt-name-edit'; inp.value = nt.name || ''; inp.maxLength = 40;
        inp.placeholder = 'Заметка';
        host.innerHTML = ''; host.appendChild(inp);
        try { inp.focus(); inp.select(); } catch (e) {}
        var done = false;
        function commit(save) {
            if (done) return; done = true;
            if (save) { var v = (inp.value || '').trim().slice(0, 40); if (v !== (nt.name || '')) { pfdPushUndo(); nt.name = v; saveDashCfg(); } }
            host._editing = false;
            host.innerHTML = esc((nt.name && nt.name.trim()) ? nt.name : 'Заметка');
            pfdRepackSoon();
        }
        inp.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commit(true); }
            else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
        });
        inp.addEventListener('blur', function () { commit(true); });
        inp.addEventListener('click', function (e) { e.stopPropagation(); });
    };
    // удаление заметки БЕЗ режима конструктора — с подтверждением (Cmd/Ctrl+Z вернёт)
    window.pfdNoteDelete = function (id, ev) {
        if (ev) ev.stopPropagation();
        var nt = pfdFindNote(id); if (!nt) return;
        var ttl = (nt.name && nt.name.trim()) ? nt.name : 'заметку';
        PF.pfConfirm({ danger: true, title: 'Удалить ' + esc(ttl) + '?', text: 'Заметка со всеми пунктами будет удалена. Отменить можно сочетанием Cmd/Ctrl+Z в конструкторе.', ok: 'Удалить' }, function () {
            pfdRemoveNote('note:' + id);
        });
    };
    // строки заметки: текст/пункт/задача — добавление, удаление, отметка, ввод, клавиши
    function pfdNoteInsertItem(nid, afterIid, type, focus) {
        var nt = pfdFindNote(nid); if (!nt) return;
        pfdPushUndo();
        var it = { id: genId('i'), type: type || 'text', text: '', done: false };
        var arr = nt.items || (nt.items = []);
        var idx = afterIid ? arr.map(function (x) { return x.id; }).indexOf(afterIid) : -1;
        if (idx >= 0) arr.splice(idx + 1, 0, it); else arr.push(it);
        saveDashCfg();
        var card = pfdNoteCard(nid), list = card && card.querySelector('.pfnt-list');
        if (list) {
            var tmp = document.createElement('div'); tmp.innerHTML = pfdNoteRowHtml(nid, it);
            var node = tmp.firstChild;
            var afterEl = afterIid ? list.querySelector('.pfnt-row[data-iid="' + afterIid + '"]') : null;
            if (afterEl) list.insertBefore(node, afterEl.nextSibling); else list.appendChild(node);
            if (focus) pfdFocusEnd(node.querySelector('.pfnt-tx'));
        }
        pfdRepackSoon();
    }
    window.pfdNoteAddItem = function (nid, type) {
        var nt = pfdFindNote(nid); var arr = nt && nt.items || [];
        pfdNoteInsertItem(nid, arr.length ? arr[arr.length - 1].id : null, type, true);
    };
    window.pfdNoteDelItem = function (nid, iid, ev, focusPrev) {
        if (ev) ev.stopPropagation();
        var nt = pfdFindNote(nid); if (!nt) return;
        var arr = nt.items || [], card = pfdNoteCard(nid);
        if (arr.length <= 1) {   // последнюю строку не удаляем — просто очищаем
            if (arr[0]) { arr[0].text = ''; arr[0].done = false; }
            saveDashCfg();
            var tx0 = card && card.querySelector('.pfnt-tx'); if (tx0) { tx0.textContent = ''; pfdFocusEnd(tx0); }
            pfdRepackSoon(); return;
        }
        var idx = arr.map(function (x) { return x.id; }).indexOf(iid); if (idx < 0) return;
        pfdPushUndo();
        arr.splice(idx, 1); saveDashCfg();
        var row = card && card.querySelector('.pfnt-row[data-iid="' + iid + '"]');
        var prev = row && row.previousElementSibling;
        if (row) row.parentNode.removeChild(row);
        if (focusPrev && prev) pfdFocusEnd(prev.querySelector('.pfnt-tx'));
        pfdRepackSoon();
    };
    window.pfdNoteToggle = function (nid, iid, ev) {
        if (ev) ev.stopPropagation();
        var it = pfdFindItem(nid, iid); if (!it) return;
        it.done = !it.done; saveDashCfg();
        var card = pfdNoteCard(nid), row = card && card.querySelector('.pfnt-row[data-iid="' + iid + '"]');
        if (row) { row.classList.toggle('done', it.done); var b = row.querySelector('.pfnt-check'); if (b) b.classList.toggle('on', it.done); }
    };
    window.pfdNoteRowInput = function (nid, iid, el) {
        pfdRepackSoon();   // текст мог перенестись на новую строку — блок подрос
        clearTimeout(pfdNoteT);
        var val = String(el.textContent || '').slice(0, 4000);
        pfdNoteT = setTimeout(function () { var it = pfdFindItem(nid, iid); if (it) { it.text = val; saveDashCfg(); } }, 350);
    };
    window.pfdNoteRowKey = function (ev, nid, iid) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            var it = pfdFindItem(nid, iid); if (it) it.text = String(ev.target.textContent || '').slice(0, 4000);
            pfdNoteInsertItem(nid, iid, it ? it.type : 'text', true);
        } else if (ev.key === 'Backspace' && String(ev.target.textContent || '') === '') {
            ev.preventDefault();
            window.pfdNoteDelItem(nid, iid, null, true);
        }
    };
    // срок выполнения: due (timestamp) + живой отсчёт; чип пересобираем на месте
    function pfdToLocalInput(ts) {
        var d = new Date(ts); function p(n) { return String(n).padStart(2, '0'); }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    // «2 сентября, 09:30» — месяц СЛОВОМ (мокап overview3: «срок 2 сентября»).
    // У периода месяц остаётся сокращённым: двумя словами строка «2 сентября —
    // 9 сентября, 09:30» переносится в узком виджете.
    function pfdDueDateText(ts) {
        var d = new Date(ts);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    // текст чипа срока: однодневный «12 июл, 09:30» или ПЕРИОД «12 июл — 19 июл, 09:30»
    function pfdDueText(nt) {
        if (nt.dueStart == null) return pfdDueDateText(nt.due);
        var a = new Date(nt.dueStart), b = new Date(nt.due);
        var dm = { day: 'numeric', month: 'short' };
        var tm = b.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return a.toLocaleDateString('ru-RU', dm) + ' — ' + b.toLocaleDateString('ru-RU', dm) + ', ' + tm;
    }
    // Отсчёт словами, как в мокапе: «осталось 34 дня». Дни склоняются; часы и
    // минуты показываем только когда до срока меньше суток — иначе «34 дн 5 ч»
    // соревнуется с датой рядом, хотя за сутки эти пять часов ничего не решают.
    function pfdDueCountdown(ts) {
        var diff = ts - Date.now(), over = diff < 0, a = Math.abs(diff);
        var d = Math.floor(a / 86400000), h = Math.floor(a % 86400000 / 3600000), m = Math.floor(a % 3600000 / 60000), s = Math.floor(a % 60000 / 1000);
        var body = d > 0 ? (d + ' ' + PF.plural(d, 'день', 'дня', 'дней'))
            : (h > 0 ? (h + ' ч ' + m + ' мин') : (m + ' мин ' + s + ' с'));
        return { txt: (over ? 'просрочено на ' + body : 'осталось ' + body), cls: over ? 'over' : (diff < 86400000 ? 'soon' : 'ok') };
    }
    function pfdReplaceDue(nt) {
        var card = pfdNoteCard(nt.id), wrap = card && card.querySelector('.pfnt-duewrap');
        if (!wrap) return;
        var tmp = document.createElement('div'); tmp.innerHTML = pfdNoteDueHtml(nt);
        wrap.parentNode.replaceChild(tmp.firstChild, wrap);
    }
    window.pfdNoteSetDue = function (id, val) {
        var nt = pfdFindNote(id); if (!nt) return;
        var ts = val ? new Date(val).getTime() : null;
        var next = (ts && isFinite(ts)) ? ts : null;
        if (next === nt.due) return;
        pfdPushUndo(); nt.due = next; saveDashCfg(); pfdReplaceDue(nt); pfdRepackSoon();
    };
    window.pfdNoteClearDue = function (id, ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        var nt = pfdFindNote(id); if (!nt || nt.due == null) return;
        pfdPushUndo(); nt.due = null; nt.dueStart = null; saveDashCfg(); pfdReplaceDue(nt); pfdRepackSoon();
    };
    // ---- СВОЙ календарь-поповер срока: день или период ПРОТЯГИВАНИЕМ + время ----
    // Одиночный клик по дню = срок-день; зажать день и протянуть до другого = период.
    // d = конец/дедлайн (Date, с временем); start = начало периода (ms, локальная полночь)
    // или null для одиночного дня; dragging/dragAnchor — состояние протягивания мышью.
    var pfdCal = null;
    var PFDCAL_WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var PFDCAL_MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    var PFDCAL_PRESETS = [   // быстрый срок от сегодня: конец = сегодня+смещение; period → диапазон
        { l: 'Сегодня', d: 0 }, { l: 'Завтра', d: 1 }, { l: 'Неделя', d: 7, period: true }
    ];
    function pfd2(n) { return String(n).padStart(2, '0'); }
    function pfdMid(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }   // полночь дня Date
    function pfdCalInner() {
        var c = pfdCal, d = c.d, vy = c.vy, vm = c.vm;
        var isPer = c.start != null;                         // период задан, если есть день начала
        var presets = PFDCAL_PRESETS.map(function (p, i) {
            return '<button type="button" class="pfnt-cal-preset" onclick="pfdCalPreset(' + i + ')">' + p.l + '</button>';
        }).join('');
        var wd = PFDCAL_WD.map(function (w) { return '<span class="pfnt-cal-wd">' + w + '</span>'; }).join('');
        var first = new Date(vy, vm, 1);
        var lead = (first.getDay() + 6) % 7;                 // Пн — первый столбец
        var daysIn = new Date(vy, vm + 1, 0).getDate();
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var endMid = pfdMid(d);
        var startMid = isPer ? c.start : null;
        var lo = startMid != null ? Math.min(startMid, endMid) : endMid;
        var hi = startMid != null ? Math.max(startMid, endMid) : endMid;
        var cells = '';
        for (var i = 0; i < lead; i++) cells += '<span class="pfnt-cal-e"></span>';
        for (var day = 1; day <= daysIn; day++) {
            var dt = new Date(vy, vm, day), ts = dt.getTime();
            var cls = 'pfnt-cal-d';
            if (ts === today.getTime()) cls += ' today';
            if (dt < today) cls += ' past';
            if (startMid != null) {
                if (ts === lo && ts === hi) cls += ' sel';
                else if (ts === lo) cls += ' rstart';
                else if (ts === hi) cls += ' rend';
                else if (ts > lo && ts < hi) cls += ' inrange';
            } else if (ts === endMid) cls += ' sel';
            // mousedown — начало, mouseenter при зажатой кнопке — конец периода (протягивание)
            cells += '<button type="button" class="' + cls + '" data-ts="' + ts + '" ' +
                'onmousedown="pfdCalDown(' + ts + ',event)" onmouseenter="pfdCalOver(' + ts + ')">' + day + '</button>';
        }
        var hint = isPer ? 'Период выбран' : 'Выберите день или период';
        var timeVal = pfd2(d.getHours()) + ':' + pfd2(d.getMinutes());
        return '<div class="pfnt-cal-presets">' + presets + '</div>' +
            '<div class="pfnt-cal-head">' +
                '<button type="button" class="pfnt-cal-nav" onclick="pfdCalNav(-1)" aria-label="Прошлый месяц">' + NOTE_CHEV_SVG + '</button>' +
                '<span class="pfnt-cal-mon">' + PFDCAL_MON[vm] + ' ' + vy + '</span>' +
                '<button type="button" class="pfnt-cal-nav next" onclick="pfdCalNav(1)" aria-label="Следующий месяц">' + NOTE_CHEV_SVG + '</button>' +
            '</div>' +
            '<div class="pfnt-cal-wds">' + wd + '</div>' +
            '<div class="pfnt-cal-days">' + cells + '</div>' +
            '<div class="pfnt-cal-hint">' + hint + '</div>' +
            '<div class="pfnt-cal-time">' + NOTE_CLOCK_SVG + '<span>' + (isPer ? 'Время конца' : 'Время') + '</span>' +
                '<input type="time" class="pfnt-cal-time-in" value="' + timeVal + '" onchange="pfdCalTime(this.value)"></div>' +
            '<div class="pfnt-cal-foot">' +
                '<button type="button" class="pfnt-cal-clear" onclick="pfdCalClear()">Убрать срок</button>' +
                '<button type="button" class="pfnt-cal-ok" onclick="pfdCalApply()">Готово</button>' +
            '</div>';
    }
    // перекрасить дни по текущему выбору БЕЗ пересборки innerHTML — плавно во время протягивания
    function pfdCalPaint() {
        if (!pfdCal) return;
        var card = pfdNoteCard(pfdCal.nid), pop = card && card.querySelector('.pfnt-cal');
        if (!pop) return;
        var endMid = pfdMid(pfdCal.d), startMid = pfdCal.start;
        var lo = startMid != null ? Math.min(startMid, endMid) : endMid;
        var hi = startMid != null ? Math.max(startMid, endMid) : endMid;
        pop.querySelectorAll('.pfnt-cal-d').forEach(function (btn) {
            var ts = +btn.getAttribute('data-ts');
            btn.classList.remove('sel', 'rstart', 'rend', 'inrange');
            if (startMid != null) {
                if (ts === lo && ts === hi) btn.classList.add('sel');
                else if (ts === lo) btn.classList.add('rstart');
                else if (ts === hi) btn.classList.add('rend');
                else if (ts > lo && ts < hi) btn.classList.add('inrange');
            } else if (ts === endMid) btn.classList.add('sel');
        });
    }
    function pfdCalRender() {
        if (!pfdCal) return;
        var card = pfdNoteCard(pfdCal.nid), pop = card && card.querySelector('.pfnt-cal');
        if (pop) pop.innerHTML = pfdCalInner();
    }
    window.pfdCalOpen = function (nid, ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        // закрыть любые другие поповеры (палитра, чужой календарь)
        document.querySelectorAll('#pfWrap .pfnt-cal.open').forEach(function (p) { p.classList.remove('open'); });
        document.querySelectorAll('#pfWrap .pfnt-colorpop.open').forEach(function (p) { p.classList.remove('open'); });
        pfdNoteClrOpen = null;
        var nt = pfdFindNote(nid); if (!nt) return;
        var d = nt.due != null ? new Date(nt.due) : new Date();
        if (nt.due == null) d.setHours(18, 0, 0, 0);   // разумный дефолт срока — сегодня 18:00
        // выбор восстанавливаем по заметке: есть день начала → период, иначе одиночный срок
        pfdCal = { nid: nid, vy: d.getFullYear(), vm: d.getMonth(), d: d, start: (nt.dueStart != null ? nt.dueStart : null), dragging: false, dragAnchor: null };
        var card = pfdNoteCard(nid), pop = card && card.querySelector('.pfnt-cal');
        if (!pop) { pfdCal = null; return; }
        pop.innerHTML = pfdCalInner();
        pop.classList.remove('down');
        pop.classList.add('open');
        // по умолчанию раскрывается ВВЕРХ; выбираем сторону с бОльшим запасом, если
        // сверху не помещается (заметка у верха/низа страницы) — переворачиваем вниз
        var chip = pop.parentNode.querySelector('.pfnt-due');
        if (chip) {
            var cr = chip.getBoundingClientRect(), ph = pop.getBoundingClientRect().height;
            var roomUp = cr.top - 8, roomDown = window.innerHeight - cr.bottom - 8;
            if (roomUp < ph && roomDown > roomUp) pop.classList.add('down');
        }
        try { pop.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        pfdRepackSoon();
    };
    function pfdCalClose() {
        if (!pfdCal) return;
        var card = pfdNoteCard(pfdCal.nid), pop = card && card.querySelector('.pfnt-cal');
        if (pop) { pop.classList.remove('open'); pop.innerHTML = ''; }
        pfdCal = null; pfdRepackSoon();
    }
    window.pfdCalNav = function (delta) {
        if (!pfdCal) return;
        var m = pfdCal.vm + delta;
        pfdCal.vy += Math.floor(m / 12); pfdCal.vm = ((m % 12) + 12) % 12;
        pfdCalRender();
    };
    function pfdCalSetDayOf(d, ts) { var t = new Date(ts); d.setFullYear(t.getFullYear(), t.getMonth(), t.getDate()); }
    // нажали день: старт как одиночный срок; протягивание (mouseenter) расширит до периода
    window.pfdCalDown = function (ts, ev) {
        if (ev) ev.preventDefault();               // без выделения текста при протягивании
        if (!pfdCal) return;
        pfdCal.dragAnchor = ts; pfdCal.dragging = true;
        pfdCalSetDayOf(pfdCal.d, ts); pfdCal.start = null;
        pfdCalPaint();
    };
    // курсор зашёл на день при зажатой кнопке — второй конец периода
    window.pfdCalOver = function (ts) {
        if (!pfdCal || !pfdCal.dragging) return;
        var lo = Math.min(pfdCal.dragAnchor, ts), hi = Math.max(pfdCal.dragAnchor, ts);
        pfdCalSetDayOf(pfdCal.d, hi); pfdCal.start = lo < hi ? lo : null;   // lo==hi → одиночный день
        pfdCalPaint();
    };
    // отпустили кнопку — зафиксировать выбор. НЕ пересобираем innerHTML: следом за mouseup
    // браузер шлёт click, и на пересозданном (detached) дне closest('.pfnt-duewrap') вернул бы
    // null → общий обработчик закрыл бы календарь. Точечно правим только подсказку и подпись времени.
    function pfdCalDragEnd() {
        if (!pfdCal || !pfdCal.dragging) return;
        pfdCal.dragging = false;
        var card = pfdNoteCard(pfdCal.nid), pop = card && card.querySelector('.pfnt-cal');
        if (!pop) return;
        var isPer = pfdCal.start != null;
        var hint = pop.querySelector('.pfnt-cal-hint');
        if (hint) hint.textContent = isPer ? 'Период выбран' : 'Выберите день или период';
        var tl = pop.querySelector('.pfnt-cal-time > span');
        if (tl) tl.textContent = isPer ? 'Время конца' : 'Время';
    }
    window.pfdCalPreset = function (i) {
        if (!pfdCal) return;
        var p = PFDCAL_PRESETS[i]; if (!p) return;
        var now = new Date();
        var d = new Date();
        if (p.d) d.setDate(d.getDate() + p.d);
        d.setHours(pfdCal.d.getHours(), pfdCal.d.getMinutes(), 0, 0);       // время-суток сохраняем
        pfdCal.d = d;
        // «Неделя» — ДИАПАЗОН с текущей даты по +7 дней; прочие пресеты — одиночный срок.
        // Вид календаря держим на месяце начала периода (виден день-старт), иначе — на дне.
        if (p.period) { pfdCal.start = pfdMid(now); pfdCal.vy = now.getFullYear(); pfdCal.vm = now.getMonth(); }
        else { pfdCal.start = null; pfdCal.vy = d.getFullYear(); pfdCal.vm = d.getMonth(); }
        pfdCalRender();
    };
    window.pfdCalTime = function (val) {
        if (!pfdCal || !val) return;
        var m = /^(\d{1,2}):(\d{2})$/.exec(val); if (!m) return;
        pfdCal.d.setHours(+m[1], +m[2], 0, 0);
    };
    window.pfdCalApply = function () {
        if (!pfdCal) return;
        var nt = pfdFindNote(pfdCal.nid), ts = pfdCal.d.getTime();
        // начало периода валидно, только если оно РАНЬШЕ дня конца (иначе — обычный срок-день)
        var start = (pfdCal.start != null && pfdCal.start < pfdMid(pfdCal.d)) ? pfdCal.start : null;
        pfdCalClose();
        if (nt && (ts !== nt.due || start !== (nt.dueStart == null ? null : nt.dueStart))) {
            pfdPushUndo(); nt.due = ts; nt.dueStart = start; saveDashCfg(); pfdReplaceDue(nt); pfdRepackSoon();
        }
    };
    window.pfdCalClear = function () {
        if (!pfdCal) return;
        var nt = pfdFindNote(pfdCal.nid);
        pfdCalClose();
        if (nt && (nt.due != null || nt.dueStart != null)) { pfdPushUndo(); nt.due = null; nt.dueStart = null; saveDashCfg(); pfdReplaceDue(nt); pfdRepackSoon(); }
    };
    // живой отсчёт сроков: тикаем раз в секунду, только на активной вкладке с заметками
    setInterval(function () {
        if (document.hidden) return;
        var panel = document.getElementById('panel-portfolios');
        if (!panel || !panel.classList.contains('active')) return;
        var cds = document.querySelectorAll('#pfWrap .pfnt-cd'); if (!cds.length) return;
        cds.forEach(function (el) {
            var ts = +el.getAttribute('data-due'); if (!isFinite(ts)) return;
            var r = pfdDueCountdown(ts); el.textContent = r.txt;
            var wrap = el.closest('.pfnt-due'); if (wrap) { wrap.classList.remove('ok', 'soon', 'over'); wrap.classList.add(r.cls); }
        });
    }, 1000);
    // отпускание мыши где угодно завершает протягивание диапазона в календаре срока
    document.addEventListener('mouseup', function () { if (pfdCal && pfdCal.dragging) pfdCalDragEnd(); });
    // клик вне палитры/календаря — закрыть раскрытый поповер
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (pfdNoteClrOpen && !(t && t.closest && t.closest('.pfnt-colorwrap'))) {
            document.querySelectorAll('#pfWrap .pfnt-colorpop.open').forEach(function (p) { p.classList.remove('open'); });
            pfdNoteClrOpen = null;
        }
        if (pfdCal && !(t && t.closest && t.closest('.pfnt-duewrap'))) pfdCalClose();
    });
    // Esc закрывает открытый календарь срока (не давая ему долететь до хендлера закрытия
    // карточки раскладки ниже — иначе один Esc закрыл бы и календарь, и всю карточку)
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (pfdCal) { e.stopImmediatePropagation(); pfdCalClose(); }
    });
    document.addEventListener('keydown', function (e) {
        if (!pfdLive() || (!e.metaKey && !e.ctrlKey) || e.shiftKey || String(e.key).toLowerCase() !== 'z') return;
        var panel = document.getElementById('panel-portfolios');
        if (!panel || !panel.classList.contains('active')) return;
        // не перехватываем Cmd/Ctrl+Z, когда правится текст (заметка/поле ввода) —
        // там это отмена ввода, а не отмена раскладки
        var ae = document.activeElement;
        if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        window.pfdUndo();
    });

    // ---- KPI-плитки: капитал · за сегодня · ближайшая выплата ----
    // Компактные «кирпичики» дашборда (span 4): включаются с полки «Добавить блок».
    function pfdKpiHtml(kind, demo) {
        var inv, val, dd, hasDd, mv;
        if (demo) {                       // демо-данные для превью пустого портфеля
            inv = demo.inv; val = demo.val; dd = demo.dd; hasDd = demo.hasDd !== false; mv = demo.mv || null;
        } else {
            inv = 0; val = 0; dd = 0; hasDd = false; mv = null;
            visibleItems().forEach(function (p) {
                var c = calcPf(p); inv += c.invested; val += c.value;
                var d = dayDelta(p, c.value); if (d != null) { dd += d; hasDd = true; }
                var m = topMover(p); if (m && (!mv || Math.abs(m.chg) > Math.abs(mv.chg))) mv = m;
            });
        }
        var warm = !demo && pfQuotesWarming();   // котировки греются → значение скелетоном
        var label, kpiSub, vHtml, vCls = '', dVal = '—', dLbl = '', dCls = '';
        var nPf = PF.store.items.length;
        if (kind === 'cap') {
            var pnl = val - inv, pct = inv > 0 ? pnl / inv * 100 : 0;
            label = 'Капитал';
            kpiSub = 'по ' + nPf + ' ' + PF.plural(nPf, 'портфелю', 'портфелям', 'портфелям');
            vHtml = warm ? skelHtml(150, 24) : kpiBig(val);
            // дельта дня — то, ради чего на плитку смотрят утром; итог за всё
            // время живёт в соседней плитке «Вложено», дублировать его незачем
            if (hasDd) { dVal = (dd >= 0 ? '+' : '−') + fmtRub(Math.abs(dd)); dLbl = 'за день'; dCls = dd >= 0 ? ' pos' : ' neg'; }
            else { dVal = (pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(pnl)); dLbl = 'результат · ' + fmtPct(pct); dCls = pnl >= 0 ? ' pos' : ' neg'; }
        } else if (kind === 'day') {
            label = 'За сегодня';
            kpiSub = hasDd ? 'к прошлому дневному снимку' : 'появится со второго дня наблюдения';
            vHtml = warm && hasDd ? skelHtml(110, 24) : hasDd ? (dd >= 0 ? '+' : '−') + kpiBig(Math.abs(dd)) : '—';
            vCls = !warm && hasDd ? (dd >= 0 ? ' pos' : ' neg') : '';
            if (mv && Math.abs(mv.chg) >= 0.01) { dVal = fmtPct(mv.chg); dLbl = 'сильнее всех: ' + esc(mv.t); dCls = mv.chg >= 0 ? ' pos' : ' neg'; }
            else { dVal = ''; dLbl = ''; }
        } else {
            var ev = demo ? demo.ev : PF.collectUpcomingPayouts()[0];
            label = 'Ближайшая выплата';
            // облигацию подписываем именем («ОФЗ 26248»), а не 12-значным secid —
            // так же, как в строках календаря выплат
            kpiSub = ev ? esc(ev.kind === 'div' ? ev.ticker : (ev.name || ev.ticker)) + ', ' +
                    (ev.kind === 'div' ? 'дивиденды' : ev.kind === 'redeem' ? 'погашение' : 'купон')
                : 'нет выплат на год вперёд';
            vHtml = ev ? '+' + kpiBig(ev.amount) : '—';
            vCls = ev ? ' pos' : '';
            if (ev) { dVal = ruDate(dateToIso(ev.date)); dLbl = esc(PF.daysUntilText(ev.date)); }
            else { dVal = ''; dLbl = ''; }
        }
        // data-live только у котировочных плиток (cap/day) и НЕ в demo-режиме
        // (превью пикера с захардкоженными числами патчер трогать не должен);
        // плитка «Ближайшая выплата» — расписания, не котировки
        var live = !demo && (kind === 'cap' || kind === 'day');
        // KPI-плитка по мокапу overview3 (экран 13): та же шапка, что у всех
        // виджетов (серифное имя + подпись), под ней ОДНО крупное моно-число и
        // строка дельты — число моноширинным, ярлык при нём гротеском. Значка в
        // цветном квадрате нет: цветным пятном тут был не смысл, а украшение.
        return '<div class="dash2-card pf-card2 pf-kpi">' +
            PF.pfCardHead('', label, kpiSub, null, live ? 'kpi:' + kind + ':h' : '') +
            '<div class="pf-kpi-v' + vCls + '"' + (live ? ' data-live="kpi:' + kind + ':v"' : '') + '>' + vHtml + '</div>' +
            '<div class="pf-kpi-d' + dCls + '"' + (live ? ' data-live="kpi:' + kind + ':s"' : '') + '>' + dVal +
                (dLbl ? '<span>' + dLbl + '</span>' : '') + '</div>' +
        '</div>';
    }
    // «18 180 623 ₽» → крупное число и тихий знак валюты (мокап: .kpi-v small)
    function kpiBig(n) { return fmtRub(n).replace(/\s?₽$/, '<small>&nbsp;₽</small>'); }

    // ---- точечный фоновый апдейт KPI-плиток (роадмап №6) ----
    // «Суммарный капитал» (значение + саб «Вложено … ▲ X ₽ · +N%») и «За сегодня»
    // (значение + саб про лидера дня) переписываются по data-live узлам, зеркаля
    // выражения pfdKpiHtml. Полному рендеру оставлены: акцентный цвет плитки
    // (--ac в inline-style корня зависит от знака dd) и плитка «Ближайшая
    // выплата» (меняется приходом расписаний — это структурный softRerender).
    // Пока котировки греются, не пишем — скелетоны заменит первый тик после.
    PF.livePatchers.kpi = function () {
        if (pfQuotesWarming()) return;
        var inv = 0, val = 0, dd = 0, hasDd = false, mv = null;
        visibleItems().forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value;
            var d = dayDelta(p, c.value); if (d != null) { dd += d; hasDd = true; }
            var m = topMover(p); if (m && (!mv || Math.abs(m.chg) > Math.abs(mv.chg))) mv = m;
        });
        var pnl = val - inv, pct = inv > 0 ? pnl / inv * 100 : 0;
        // патчер зеркалит ту же разметку, что и рендер: крупное число с тихим «₽»
        // и строка дельты «число + ярлык» (мокап overview3, экран 13)
        function dRow(val2, lbl, cls) {
            return { html: val2 + (lbl ? '<span>' + lbl + '</span>' : ''), cls: 'pf-kpi-d' + (cls || '') };
        }
        PF.liveSet('kpi:cap:v', { html: kpiBig(val), cls: 'pf-kpi-v' });
        PF.liveSet('kpi:cap:s', hasDd
            ? dRow((dd >= 0 ? '+' : '−') + fmtRub(Math.abs(dd)), 'за день', dd >= 0 ? ' pos' : ' neg')
            : dRow((pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(pnl)), 'результат · ' + fmtPct(pct), pnl >= 0 ? ' pos' : ' neg'));
        PF.liveSet('kpi:day:v', {
            html: hasDd ? (dd >= 0 ? '+' : '−') + kpiBig(Math.abs(dd)) : '—',
            cls: 'pf-kpi-v' + (hasDd ? (dd >= 0 ? ' pos' : ' neg') : '') });
        PF.liveSet('kpi:day:s', (mv && Math.abs(mv.chg) >= 0.01)
            ? dRow(fmtPct(mv.chg), 'сильнее всех: ' + esc(mv.t), mv.chg >= 0 ? ' pos' : ' neg')
            : dRow('', ''));
    };

    // ---- pfdPanelActive: «контролы страницы живут не в шапке сайта» ----
    // Исторически проверка называлась по виджету «Панель управления», потом по
    // герою-полосе; с 2026-07-21 контролы в ПАРЯЩИХ УЗЛАХ (pfxFabSync: столбик
    // #cornerStack + панель #pfActBar) — а те на десктопе есть ВСЕГДА, включая
    // 0 портфелей. Поэтому кнопки в глобальной шапке сайта прячем на любом
    // широком экране; мобильный верхний ряд (topBarActionsHtml) остаётся.
    function pfdPanelActive() {
        try { if (window.matchMedia('(max-width: 1023px)').matches) return false; } catch (e) {}
        return true;
    }
    var PFP_SLIDERS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="20" y2="8"/><circle cx="16" cy="8" r="2"/><line x1="4" y1="16" x2="6" y2="16"/><line x1="10" y1="16" x2="20" y2="16"/><circle cx="8" cy="16" r="2"/></svg>';
    // pfdPanelHtml (виджет-герой «Панель управления») удалён 2026-07-21: из набора
    // блоков он выпал ещё в R7 (см. комментарий у списка блоков в portfolios-dash.js),
    // рендерить его стало некому, а его наследник-полоса pfxHeroHtml снесён тоже.

    // ---- «График капитала»: линия суммарной стоимости по дневным снимкам ----
    // Данные уже копятся в pf_snapshots_v1 (recordSnapshots, до 400 дней) — блок
    // просто их показывает. Снимки локальные (в облако не зеркалятся) — при смене
    // устройства история начнётся заново.
    function pfdCapSeries() {
        var dates = {};
        Object.keys(snaps).forEach(function (pid) {
            if (!findPf(pid)) return;
            Object.keys(snaps[pid]).forEach(function (d) { dates[d] = 1; });
        });
        var ds = Object.keys(dates).sort();
        var totals = ds.map(function () { return 0; });
        // forward-fill: в день без снимка портфель идёт по последнему известному значению
        visibleItems().forEach(function (p) {
            var m = snaps[p.id]; if (!m) return;
            var ks = Object.keys(m).sort(), j = 0, cur = null;
            for (var i = 0; i < ds.length; i++) {
                while (j < ks.length && ks[j] <= ds[i]) { cur = m[ks[j]]; j++; }
                if (cur != null) totals[i] += cur;
            }
        });
        var out = ds.map(function (d, i) { return { d: d, v: totals[i] }; });
        if (PF.quotesTs) {   // сегодняшняя точка — живая, не ждёт снимка
            var live = 0, any = false;
            visibleItems().forEach(function (p) { var v = calcPf(p).value; if (v > 0) { live += v; any = true; } });
            if (any) {
                var t = todayStr();
                if (out.length && out[out.length - 1].d === t) out[out.length - 1].v = live;
                else out.push({ d: t, v: live });
            }
        }
        return out;
    }
    // Фолбэк, когда дневных снимков ещё мало (<2 точек): портфели свежие или были
    // пересозданы (история снимков ведётся по id и обнуляется при удалении). Собираем
    // линию капитала из ТЕХ ЖЕ исторических серий MOEX, что питают мини-графики карточек
    // (PF.chartRaw[pid].series = [{d, c, inv}], c — рыночная стоимость на дату), суммируя c по
    // всем портфелям с forward-fill. Серии подтягиваются асинхронно (repaintMiniCharts на
    // рендере) — как только подъедут, pfdCapMaybeRepaint дорисует линию поверх заглушки.
    function pfdCapHistSeries() {
        var per = [];
        visibleItems().forEach(function (p) {
            var raw = PF.chartRaw[p.id];
            if (!raw || !raw.series || !raw.series.length) return;
            var m = {};
            raw.series.forEach(function (q) { if (q && q.d != null && q.c != null) m[q.d] = q.c; });
            var ks = Object.keys(m); if (ks.length) per.push({ ks: ks.sort(), m: m });
        });
        if (!per.length) return [];
        var allD = {}; per.forEach(function (s) { s.ks.forEach(function (d) { allD[d] = 1; }); });
        var ds = Object.keys(allD).sort();
        if (ds.length < 2) return [];
        var out = ds.map(function (d) { return { d: d, v: 0 }; });
        per.forEach(function (s) {
            var j = 0, cur = null;
            for (var i = 0; i < ds.length; i++) {
                while (j < s.ks.length && s.ks[j] <= ds[i]) { cur = s.m[s.ks[j]]; j++; }
                if (cur != null) out[i].v += cur;
            }
        });
        // последняя точка — живая суммарная стоимость (как в pfdCapSeries), чтобы конец
        // линии совпадал со «Суммарным капиталом», а не с ценой последнего закрытия MOEX
        if (PF.quotesTs) {
            var live = 0, any = false;
            visibleItems().forEach(function (p) { var v = calcPf(p).value; if (v > 0) { live += v; any = true; } });
            if (any) out[out.length - 1].v = live;
        }
        return out;
    }
    // Итоговая серия графика капитала: приоритет — дневные снимки (истинная стоимость по
    // дням); если их <2 — исторический фолбэк (сразу и без ожидания снимков, как у карточек).
    function pfdCapEffectiveSeries() {
        var s = pfdCapSeries();
        if (s.length >= 2) return s;
        var h = pfdCapHistSeries();
        return h.length >= 2 ? h : s;
    }
    PF.pfdCapRange = 'all';   // '1'|'7'|'30'|'90'|'365'|'all' — окно графика (сессия, не персистится)
    var pfdCapState = null;    // геометрия текущего графика для ховера-перекрестия
    function pfdCapRangeFilter(s) {
        if (PF.pfdCapRange === 'all' || s.length < 2) return s;
        var cutoff = Date.now() - (+PF.pfdCapRange || 90) * 86400000;
        var f = s.filter(function (pt) { return new Date(pt.d).getTime() >= cutoff; });
        return f.length >= 2 ? f : s.slice(-2);
    }
    // Сегменты периода живут в ПРАВОМ СЛОТЕ ШАПКИ виджета, рядом со «Сравнить»
    // (мокап overview3, экраны 13 и 18): оба контрола про то, «что показывать».
    var PFD_CAP_RANGES = [['30', '30д'], ['90', '90д'], ['365', 'Год'], ['all', 'Всё']];
    function pfdCapRangesHtml() {
        return '<div class="pfcap-ranges">' + PFD_CAP_RANGES.map(function (r) {
            return '<button class="pfcap-rb' + (PF.pfdCapRange === r[0] ? ' on' : '') + '" onclick="pfdCapSetRange(\'' + r[0] + '\')">' + r[1] + '</button>';
        }).join('') + '</div>';
    }
    // «Что показать на полотне» (мокап overview3, экран 16): пик и дно, полоса
    // выплат. Обе по умолчанию включены и живут в раскладке — это свойство
    // виджета, а не сессии. Сравнение сюда не входит намеренно: две кривые на
    // стекле спорят, и вторая появляется только по нажатию (экран 18, п. 10).
    function pfdCapShow(k) { return (PF.dashCfg.capShow || {})[k] !== 0; }
    window.pfdCapShowToggle = function (k) {
        var m = PF.dashCfg.capShow || (PF.dashCfg.capShow = {});
        m[k] = pfdCapShow(k) ? 0 : 1;
        saveDashCfg();
        // ТОЧЕЧНАЯ ПЕРЕРИСОВКА, А НЕ ВЕСЬ ДАШБОРД (фикс 2026-08-04): тумблеры
        // «Что показать на полотне» живут ещё и в магазине виджетов, а полный
        // pfdRerender пересобирает и саму панель магазина — на каждом нажатии
        // она мигала и теряла место прокрутки. Меняется только полотно графика.
        pfdCapRepaint();
    };
    // ═══════════ СРАВНЕНИЕ ГРАФИКА КАПИТАЛА С ИНДЕКСОМ ═══════════
    // (мокап overview3, экран 19). Шкала графика уже в процентах от старта окна,
    // поэтому вторая кривая ложится на неё без пересчёта осей: индекс переводим
    // в «синтетическую стоимость» base × (idx_i / idx_0) — те же проценты, тот же
    // масштаб. Ось при этом расширяется под обе кривые, иначе индекс уходил бы
    // за край полотна.
    PF.pfdCapCmp = null;             // null | 'IMOEX' | 'RGBI' — что наложено
    var pfdCmpCache = {};            // 'IMOEX|2026-01-15|2026-07-30' → [{d,c}] | 'load' | 'err'
    function pfdCmpSeries(bench, from, till) {
        var key = bench + '|' + from + '|' + till;
        var hit = pfdCmpCache[key];
        if (hit) return hit === 'load' || hit === 'err' ? null : hit;
        if (typeof btFetchHistorySeries !== 'function') { pfdCmpCache[key] = 'err'; return null; }
        pfdCmpCache[key] = 'load';
        btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/' + bench + '.json', from, till)
            .then(function (rows) {
                pfdCmpCache[key] = (rows && rows.length > 1) ? rows : 'err';
                if (PF.pfdCapCmp === bench) pfdCapRepaint();   // пришла серия индекса — перерисовываем только полотно
            })
            .catch(function () { pfdCmpCache[key] = 'err'; });
        return null;
    }
    function pfdCmpState(bench, from, till) {
        var key = bench + '|' + from + '|' + till;
        return pfdCmpCache[key] === 'load' ? 'load' : (pfdCmpCache[key] === 'err' ? 'err' : 'ok');
    }
    // Индекс по составу: чисто облигационному портфелю IMOEX не соперник — ему RGBI.
    function pfdCapBench() {
        var bond = 0, all = 0;
        visibleItems().forEach(function (p) { var c = calcPf(p); bond += c.bondVal; all += c.value; });
        return all > 0 && bond / all > 0.7 ? 'RGBI' : 'IMOEX';
    }
    // ---- ЧЕТЫРЕ БАЗЫ СРАВНЕНИЯ (мокап overview3, экран 19) ----
    // Индекс отвечает «а рынок как?», другой портфель — «а другая моя стратегия?»,
    // вложенные деньги и вклад — «а стоило ли вообще шевелиться». Последние две —
    // прямые линии, и это их смысл: они не про рынок, а про альтернативу ему.
    // Ставка вклада берётся из тикера ставок — той же цифры, что видит человек
    // в виджете «Ставки рынка»; нет цифры — нет и строки в меню.
    function pfdDepRate() {
        var rd = window.ratesData || {};
        var e = dq('val-deposit-rate'), t = e ? (e.textContent || '').trim() : '';
        if (!t || !/\d/.test(t) || t.indexOf('#') >= 0) t = String(rd.depositRate == null ? '' : rd.depositRate);
        var m = t.replace(',', '.').match(/-?\d+(\.\d+)?/);
        var v = m ? parseFloat(m[0]) : NaN;
        return (isFinite(v) && v > 0 && v < 100) ? v : null;
    }
    function pfdCmpBases() {
        var idx = pfdCapBench();
        var out = [{ k: idx, n: idx, s: idx === 'RGBI' ? 'индекс гособлигаций' : 'индекс МосБиржи' }];
        // «любой из ваших четырёх» рисуем не одной строкой с подменю, а строкой на
        // портфель: их максимум четыре, и вложенное меню тут дороже самого выбора
        if (visibleItems().length > 1) {
            visibleItems().forEach(function (p) {
                out.push({ k: 'pf:' + p.id, n: p.name, s: 'ваш портфель', c: p.color });
            });
        }
        out.push({ k: 'inv', n: 'Вложенные деньги', s: 'сколько было бы без движения цен' });
        var dep = pfdDepRate();
        if (dep) out.push({ k: 'dep', n: 'Вклад под ' + fmtPct(dep).replace('+', ''), s: 'ставка из тикера ставок' });
        return out;
    }
    function pfdCmpBaseOf(k) { return pfdCmpBases().filter(function (b) { return b.k === k; })[0] || null; }
    // Синтетическая стоимость базы в системе координат графика: массив той же длины,
    // что серия капитала, в рублях от той же стартовой точки. Так обе кривые ложатся
    // на одну шкалу процентов без пересчёта осей.
    function pfdCmpCurve(s, k) {
        var n = s.length, base = s[0].v, last = s[n - 1], i;
        if (k === 'inv') {
            // «без движения цен»: старт плюс всё, что довнесли за окно (или минус
            // то, что продали). Ступеньки — дни покупок, между ними прямая.
            var inv0 = pfdInvestedAt(s[0].d), arr = [];
            for (i = 0; i < n; i++) arr.push(base + (pfdInvestedAt(s[i].d) - inv0));
            return { pts: arr, state: 'ok' };
        }
        if (k === 'dep') {
            var r = pfdDepRate(); if (!r) return { pts: null, state: 'err' };
            var t0 = new Date(s[0].d).getTime(), pts = [];
            for (i = 0; i < n; i++) {
                var days = Math.max(0, (new Date(s[i].d).getTime() - t0) / 86400000);
                pts.push(base * Math.pow(1 + r / 100, days / 365));
            }
            return { pts: pts, state: 'ok' };
        }
        if (k.indexOf('pf:') === 0) {
            // другой портфель — по его же дневным снимкам, перебазированным к старту
            var m = snaps[k.slice(3)] || {}, prev = null, arr2 = [], b0 = null, got = 0;
            for (i = 0; i < n; i++) {
                var v = m[s[i].d]; if (v == null) v = prev; else prev = v;
                if (v == null) { arr2.push(null); continue; }
                if (b0 == null) b0 = v;
                if (!(b0 > 0)) { arr2.push(null); continue; }
                arr2.push(base * (v / b0)); got++;
            }
            return got > 1 ? { pts: arr2, state: 'ok' } : { pts: null, state: 'err' };
        }
        // индекс: тянем историю MOEX тем же путём, что вкладка «Тест»
        var st = pfdCmpState(k, s[0].d, last.d);
        var rows = pfdCmpSeries(k, s[0].d, last.d);
        if (!rows || rows.length < 2) return { pts: null, state: st === 'load' ? 'load' : 'err' };
        var byD = {}; rows.forEach(function (row) { byD[row.d] = row.c; });
        var c0 = null, pc = null, arr3 = [], any = false;
        for (i = 0; i < n; i++) {
            var c = byD[s[i].d]; if (c == null) c = pc; else pc = c;
            if (c == null) { arr3.push(null); continue; }
            if (c0 == null) c0 = c;
            arr3.push(base * (c / c0)); any = true;
        }
        return any ? { pts: arr3, state: 'ok' } : { pts: null, state: 'err' };
    }
    // Сколько денег было вложено на дату: сумма лотов, купленных не позже неё.
    // Продажи в модели уменьшают количество, поэтому считаем по тем же лотам,
    // что и calcPf — просто с отсечкой по дате.
    function pfdInvestedAt(iso) {
        var sum = 0;
        visibleItems().forEach(function (p) {
            (p.holdings || []).forEach(function (h) {
                PF.ensureLots(h).forEach(function (l) {
                    if (!(+l.qty > 0) || !l.buyDate || l.buyDate > iso) return;
                    sum += (+l.qty) * (+l.price || 0);
                });
            });
        });
        return sum;
    }
    // ИТОГ СРАВНЕНИЯ — строкой под графиком. Разница в процентных пунктах и есть
    // то единственное, ради чего сравнение включают; заставлять вычитать её
    // глазами по двум кривым нельзя (мокап, экран 19, п. 3).
    function pfdCmpDiffHtml(s, pts, base, days) {
        var n = s.length, b0 = s[0].v, li = -1;
        // считаем на последнем дне, где база ЕСТЬ: у чужого портфеля хвост бывает пустым,
        // и сравнивать его старое значение с нашим сегодняшним — подлог
        for (var i = n - 1; i >= 0; i--) { if (pts[i] != null) { li = i; break; } }
        if (li < 1 || !(b0 > 0)) return '';
        var mine = (s[li].v / b0 - 1) * 100, other = (pts[li] / b0 - 1) * 100, diff = mine - other;
        function cell(l, v, cls) {
            return '<span><em>' + l + '</em><b class="' + cls + '">' + v + '</b></span>';
        }
        return '<div class="pfcap-diff">' +
            cell('Ваш капитал за ' + days + ' дн', fmtPct(mine), mine >= 0 ? 'pos' : 'neg') +
            cell(esc(base.n) + ' за тот же срок', fmtPct(other), other >= 0 ? 'pos' : 'neg') +
            '<span class="pfcap-diff-r"><em>Разница</em><b class="' + (diff >= 0 ? 'pos' : 'neg') + '">' +
                (diff >= 0 ? '+' : '−') + Math.abs(diff).toFixed(1).replace('.', ',') + ' п.п.</b></span>' +
        '</div>';
    }
    // Кнопка живёт в ШАПКЕ виджета, рядом с периодами: и то и другое про то,
    // «что показывать», и стоять им положено вместе (мокап, экран 19).
    // Само сравнение не загорается: две кривые на стекле спорят, вторая
    // появляется только по выбору человека.
    function pfdCapCmpBtnHtml() {
        var cur = PF.pfdCapCmp ? pfdCmpBaseOf(PF.pfdCapCmp) : null;
        var rows = pfdCmpBases().map(function (b) {
            var on = PF.pfdCapCmp === b.k;
            return '<button type="button" class="pfcap-cmpr' + (on ? ' on' : '') +
                '" onclick="pfdCapCmpPick(\'' + jsArg(b.k) + '\', event)">' +
                '<i class="pfcap-cmpd"' + (b.c ? ' style="--c:' + esc(b.c) + '"' : '') + '></i>' +
                '<span><b>' + esc(b.n) + '</b><em>' + esc(b.s) + '</em></span>' +
                (on ? '<u>✓</u>' : '') + '</button>';
        }).join('');
        return '<span class="pfcap-cmpwrap' + (PF.pfdCapCmpOpen ? ' open' : '') + '" id="pfcapCmpWrap">' +
            '<button type="button" class="pfcap-cmp' + (cur ? ' on' : '') + '" onclick="pfdCapCmpMenu(event)" ' +
            'title="Наложить вторую кривую — обе считаются в процентах от начала окна">⊕ Сравнить' +
            (cur ? '<i>' + esc(cur.n) + '</i>' : '') + '</button>' +
            '<div class="pfcap-cmpop"><div class="pfcap-cmpop-t">Сравнить с</div>' + rows +
            (PF.pfdCapCmp ? '<button type="button" class="pfcap-cmpr off" onclick="pfdCapCmpPick(\'\', event)">' +
                '<i class="pfcap-cmpd"></i><span><b>Без сравнения</b><em>одна кривая на полотне</em></span></button>' : '') +
            '</div></span>';
    }
    PF.pfdCapCmpOpen = false;
    function pfdCapCmpClose() {
        PF.pfdCapCmpOpen = false;
        Array.prototype.forEach.call(document.querySelectorAll('.pfcap-cmpwrap.open'),
            function (x) { x.classList.remove('open'); });
    }
    // Открываем КЛАССОМ, а не ре-рендером: полный своп заново рисует полотно
    // (и гасит меню в тот же кадр) — та же ловушка, что у меню периодов карточки.
    window.pfdCapCmpMenu = function (ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        var el = ev && ev.target && ev.target.closest ? ev.target.closest('.pfcap-cmpwrap') : null;
        if (!el) return;
        var on = !el.classList.contains('open');
        pfdCapCmpClose();
        if (on) { el.classList.add('open'); PF.pfdCapCmpOpen = true; }
    };
    window.pfdCapCmpPick = function (k, ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        PF.pfdCapCmp = k || null;
        pfdCapCmpClose();
        pfdCapRepaint();   // как и у тумблеров полотна: мигать всей страницей незачем
    };
    document.addEventListener('click', function (e) {
        if (!PF.pfdCapCmpOpen) return;
        if (e.target && e.target.closest && e.target.closest('.pfcap-cmpwrap')) return;
        pfdCapCmpClose();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') pfdCapCmpClose(); });

    // ═══════════ ВЫПЛАТЫ ДЛЯ МЕТОК НА ПОЛОТНЕ ═══════════
    // «Показывают, что доход бывает не только от цены». Расписание берём то же,
    // что кормит «Календарь выплат»: купоны — по датам зачисления, дивиденды — по
    // дате отсечки. Пока расписание грузится, меток просто нет: ensureSchedule по
    // приходе дёргает softRerender, и они появляются сами.
    function pfdPayByDate(from, till) {
        var map = {}, total = 0, max = 0;
        visibleItems().forEach(function (p) {
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker || !(aggHolding(h).qty > 0)) return;
                var isB = h.type === 'bond', sched;
                if (isB) {
                    var full = PF.fullBondId(h.ticker);
                    if (!(full in PF.coupSched)) { PF.ensureSchedule('bond', full); return; }
                    sched = PF.coupSched[full];
                } else {
                    if (!(h.ticker in PF.divSched)) { PF.ensureSchedule('div', h.ticker); return; }
                    sched = PF.divSched[h.ticker];
                }
                if (!sched) return;
                sched.forEach(function (cp) {
                    if (!(+cp.v > 0) || cp.d < from || cp.d > till) return;
                    var q = PF.qtyAtDate(h, cp.d); if (!(q > 0)) return;
                    map[cp.d] = (map[cp.d] || 0) + cp.v * q;
                    total += cp.v * q;
                });
            });
        });
        Object.keys(map).forEach(function (k) { if (map[k] > max) max = map[k]; });
        return { map: map, total: total, max: max };
    }
    // Метки выплат НА полотне — тот же язык, что у мини-графика карточки портфеля
    // («Табло», .pfcv-pay в drawPfChart): полая зелёная точка на линии в день
    // выплаты, сумму и дату говорит подсказка. Была полоса-гистограмма под
    // полотном (мокап overview3, экран 18) — заменена по решению 2026-08-04:
    // отдельная шкала спорила с полотном, точки эстетичнее. Близкие метки
    // (< 4% ширины) склеиваются в одну «N выплат · сумма» — как на карточке.
    function pfdPayMarksHtml(s, pay, xP, yP) {
        var n = s.length, marks = [];
        Object.keys(pay.map).sort().forEach(function (d) {
            var k = null;                                     // выплата в день без снимка —
            for (var j = 0; j < n; j++) {                     // кладём в ближайший прошлый
                if (s[j].d <= d) k = j; else break;
            }
            if (k == null) k = 0;
            var x = xP(k), prev = marks[marks.length - 1];
            if (prev && x - prev.x < 4) { prev.sum += pay.map[d]; prev.when.push(d); }
            else marks.push({ x: x, y: yP(s[k].v), sum: pay.map[d], when: [d] });
        });
        return marks.map(function (m) {
            var t = m.when.length > 1
                ? m.when.length + ' ' + PF.plural(m.when.length, 'выплата', 'выплаты', 'выплат')
                : ruDate(m.when[0]);
            // подпись — мгновенная плашка по :hover (язык .pfcv-pay карточки), а не
            // нативный title с его секундной задержкой. У кромок полотна плашка
            // прижимается к точке классами: dn — под точкой, l/r — без центровки.
            var cls = (m.y < 34 ? ' dn' : '') + (m.x < 12 ? ' l' : m.x > 88 ? ' r' : '');
            return '<span class="pfcap-paym' + cls + '" style="left:' + m.x.toFixed(2) + '%;top:' + m.y.toFixed(2) + '%">' +
                '<b>' + esc(t) + ' · <span data-money>+' + fmtRub(m.sum) + '</span></b></span>';
        }).join('');
    }
    // Полотно графика капитала вынесено в отдельную функцию: тот же плот нужен
    // и виджету «График капитала», и герою «Обзора». Возвращает {hero, body} —
    // крупную строку стоимости с дельтой и само полотно с осью и подписями дат.
    function pfdCapParts(demoSeries, opts) {
        opts = opts || {};
        var full = demoSeries || pfdCapEffectiveSeries();
        var s = demoSeries ? demoSeries.slice() : pfdCapRangeFilter(full);
        var last = s.length ? s[s.length - 1] : null;
        var right = '', hero = '', body;
        if (s.length < 2) {
            pfdCapState = null;
            body = '<div class="pfcap-empty"><div class="pfcap-empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 3-4 3 3 4-6"/></svg></div>' +
                '<div class="pfcap-empty-t">' + (full.length ? 'Первая точка уже есть' : 'Снимков пока нет') + '</div>' +
                '<div class="pfcap-empty-s">Стоимость портфелей записывается раз в день при живых котировках — линия появится со второго дня.</div></div>';
        } else {
            var min = Infinity, max = -Infinity;
            s.forEach(function (pt) { if (pt.v < min) min = pt.v; if (pt.v > max) max = pt.v; });
            // вторая кривая (индекс) в тех же процентах: base × (idx_i / idx_0).
            // Считаем ДО расчёта span — ось обязана вместить обе, иначе индекс
            // вылезал бы за полотно или упирался в кромку.
            var cmpKey = opts.noCmp ? null : PF.pfdCapCmp, cmpBase = null, cmpPts = null, cmpState = null;
            if (cmpKey && !demoSeries) {
                cmpBase = pfdCmpBaseOf(cmpKey);
                var cv = pfdCmpCurve(s, cmpKey);
                cmpState = cv.state;
                if (cv.pts) {
                    cmpPts = cv.pts;
                    cmpPts.forEach(function (v) { if (v == null) return; if (v < min) min = v; if (v > max) max = v; });
                }
            }
            var span = Math.max(1, max - min);
            var n = s.length, INX = 1.6, PT = 12, PB = 16;
            function xP(i) { return INX + (n > 1 ? i / (n - 1) : 0) * (100 - 2 * INX); }
            function yP(v) { return PT + (1 - (v - min) / span) * (100 - PT - PB); }
            var pts = s.map(function (pt, i) { return xP(i).toFixed(2) + ',' + yP(pt.v).toFixed(2); });
            var line = 'M' + pts.join(' L');
            var area = line + ' L' + xP(n - 1).toFixed(2) + ',100 L' + xP(0).toFixed(2) + ',100 Z';
            var delta = last.v - s[0].v, dPct = s[0].v > 0 ? delta / s[0].v * 100 : 0;
            var up = delta >= 0, col = up ? '#12a35c' : '#e0592b';
            var daysShown = Math.max(1, Math.round((new Date(last.d).getTime() - new Date(s[0].d).getTime()) / 86400000));
            // base/cmp — для подсказки перекрестия: она печатает процент от начала
            // окна (тот же отсчёт, что у шкалы) и вторую строку по наложенной кривой
            pfdCapState = { s: s, min: min, span: span, n: n, inx: INX, pt: PT, pb: PB,
                base: s[0].v || 0, cmp: cmpPts, bench: cmpBase ? cmpBase.n : '' };
            // ШКАЛА В ПРОЦЕНТАХ ОТ СТАРТА ПЕРИОДА (мокап overview3, экран 19).
            // Была шкала в рублях: «19,1 млн / 18,6 млн / 18,1 млн» — три почти
            // одинаковых числа, по которым нельзя прикинуть, много ли «вот столько».
            // Проценты отвечают ровно на тот вопрос, ради которого на график смотрят,
            // и совпадают с дельтой в герое. Нулевая линия — точка отсчёта, поэтому
            // она единственная сплошная и подписана «0%»; её добавляем принудительно,
            // даже если niceTicks её не выбрал.
            var base = s[0].v || 1;
            function toPct(v) { return (v / base - 1) * 100; }
            function pctLabel(p) {
                if (Math.abs(p) < 0.05) return '0%';
                return (p > 0 ? '+' : '−') + Math.abs(p).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%';
            }
            var grid = '', yTicks = '';
            var tps = niceTicks(toPct(min), toPct(max), 4).slice();
            if (!tps.some(function (p) { return Math.abs(p) < 1e-9; })) tps.push(0);
            tps.forEach(function (tp) {
                var gy = yP(base * (1 + tp / 100));
                if (gy < 2 || gy > 98) return;
                var zero = Math.abs(tp) < 1e-9;
                grid += '<line x1="0" y1="' + gy.toFixed(1) + '" x2="100" y2="' + gy.toFixed(1) +
                    '" class="pfcap-grid' + (zero ? ' pfcap-grid0' : '') + '"/>';
                yTicks += '<span class="pfcap-yt' + (zero ? ' pfcap-yt0' : '') + '" style="top:' + gy.toFixed(1) + '%">' +
                    pctLabel(tp) + '</span>';
            });
            var lx = xP(n - 1).toFixed(2), ly = yP(last.v).toFixed(2);
            // ПОДПИСИ ПИКА И ДНА (мокап overview3, экран 18): две даты с суммами
            // прямо на полотне. Шкала даёт всю высоту, но не называет ни одной
            // точки; подписи называют ровно те две, о которых спрашивают. Рисуем
            // только когда точек хватает и пик со дном — разные дни.
            var marks = '';
            if (pfdCapShow('peak') && n >= 4) {
                var iMax = 0, iMin = 0;
                s.forEach(function (pt, i) { if (pt.v > s[iMax].v) iMax = i; if (pt.v < s[iMin].v) iMin = i; });
                if (iMax !== iMin) {
                    marks = [[iMax, 'hi'], [iMin, 'low']].map(function (m) {
                        var pt = s[m[0]];
                        return '<span class="pfcap-mk ' + m[1] + '" style="left:' +
                            clamp(xP(m[0]), 9, 91).toFixed(1) + '%;top:' + yP(pt.v).toFixed(1) + '%">' +
                            '<b>' + fmtRub(pt.v) + '</b> · ' + ruDate(pt.d).slice(0, 5) + '</span>';
                    }).join('');
                }
            }
            var pay = pfdCapShow('pay') && !demoSeries ? pfdPayByDate(s[0].d, last.d) : null;
            if (pay && !(pay.total > 0)) pay = null;
            // герой: крупная текущая стоимость + пилюля дельты + за сколько дней
            hero = '<div class="pfcap-hero"><span class="pfcap-val">' + fmtRub(last.v) + '</span>' +
                '<span class="pfcap-delta ' + (up ? 'pos' : 'neg') + '">' + (up ? '▲' : '▼') + ' ' + fmtRub(Math.abs(delta)) + ' · ' + fmtPct(dPct) + '</span>' +
                '<span class="pfcap-per">за ' + daysShown + ' дн</span></div>';
            body = '<div class="pfcap-plot pfcap-plot--axis">' +
                '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
                    '<defs><linearGradient id="pfcapGrad" x1="0" y1="0" x2="0" y2="1">' +
                        '<stop offset="0" stop-color="' + col + '" stop-opacity="0.24"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/>' +
                    '</linearGradient></defs>' +
                    grid +
                    '<path d="' + area + '" fill="url(#pfcapGrad)"/>' +
                    (cmpPts ? '<path d="' + cmpPts.reduce(function (acc, v, i) {
                        if (v == null) return acc;
                        return acc + (acc ? ' L' : 'M') + xP(i).toFixed(2) + ',' + yP(v).toFixed(2);
                    }, '') + '" fill="none" stroke="#4a6fa5" stroke-width="1.6" stroke-dasharray="5 4" ' +
                        'stroke-opacity="0.85" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' : '') +
                    '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
                '</svg>' +
                '<span class="pfcap-end" style="left:' + lx + '%;top:' + ly + '%;--cc:' + col + '"></span>' +
                yTicks + marks +
                '<div class="pfcap-cursor"></div><span class="pfcap-cdot"></span><div class="pfcap-tip"></div>' +
                '<div class="pfcap-hit" onmousemove="pfdCapHover(event)" onmouseleave="pfdCapHoverEnd(event)"></div>' +
                // метки выплат — ПОСЛЕ .pfcap-hit: слой перекрестия накрывает полотно,
                // и только так у точек работает своя подсказка с датой и суммой
                (pay ? pfdPayMarksHtml(s, pay, xP, yP) : '') +
            '</div>' +
            // ПОДПИСЕЙ ДАТ ПОД ПОЛОТНОМ БОЛЬШЕ НЕТ (просьба 2026-08-04): «дата
            // начала — дата сейчас» повторяли выбранное окно, которое и так
            // названо пилюлей периода в шапке и подписью «за N дн» в герое.
            // Точную дату любой точки говорит перекрестие, крайние — пилюля.
            (cmpBase || pay ? '<div class="pfcap-leg"><span><i class="pfcap-lp" style="background:' + col + '"></i>капитал</span>' +
                (cmpBase ? '<span><i class="pfcap-li"></i>' + esc(cmpBase.n) +
                    (cmpState === 'load' ? ' <em>грузим…</em>' : cmpState === 'err' ? ' <em>нет данных</em>' : '') + '</span>' : '') +
                (pay ? '<span><i class="pfcap-lg"></i>выплаты по дням <em>' + esc(fmtRub(pay.total)) + '</em></span>' : '') +
                '<span class="pfcap-leg-r">' + (cmpBase ? 'обе кривые — в процентах от начала окна' : 'шкала — от начала окна') +
                '</span></div>' : '') +
            (cmpPts ? pfdCmpDiffHtml(s, cmpPts, cmpBase, daysShown) : '');
            right = pfdCapRangesHtml() + (opts.noCmp ? '' : pfdCapCmpBtnHtml());
        }
        return { hero: hero, body: body, right: right, empty: s.length < 2 };
    }
    function pfdCapChartHtml(demoSeries) {
        var parts = pfdCapParts(demoSeries);
        return '<div class="dash2-card pf-card2 pf-capblk" title="Дневные снимки хранятся на этом устройстве (до 400 дней)">' +
            // Правый угол занят пилюлями периода и «Сравнить», поэтому шестерёнка и
            // корзина идут В ПОТОКЕ шапки СЛЕВА от них ('cap' в PFD_OWN_CHROME) —
            // общее правило для виджетов с собственным контентом в углу. Раньше
            // тут висел угловой оверлей .pfd-cardcfg/.pfd-cardrm со сдвигом в px,
            // и на узком блоке он ложился прямо на пилюли.
            PF.pfCardHead('', 'График капитала', 'стоимость всех портфелей',
                pfdInChromeHtml('cap') + parts.right) +
            parts.hero +
            '<div class="pfcap-body">' + parts.body + '</div></div>';
    }
    // ═══════════ ГЕРОЙ «ОБЗОРА» (мокап overview3, экран 02) ═══════════
    // До него страница начиналась с трёх KPI-плиток, графика и тёмной карточки
    // «Суммарный капитал» — и капитал был напечатан ТРИЖДЫ: в плитке, в шапке
    // графика и в тёмной карточке. Ни одна из трёх не отвечала на вопрос, с
    // которого человек открывает «Обзор»: что сегодня произошло и надо ли что-то
    // делать. Герой отвечает: сумма один раз, дельта дня крупно, кто её сделал,
    // и одна строка вердикта с единственным на странице акцентным действием.
    function pfxHeroBlockHtml() {
        var inv = 0, val = 0, dd = 0, hasDd = false, papers = {}, free = 0;
        visibleItems().forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value;
            var d = dayDelta(p, c.value); if (d != null) { dd += d; hasDd = true; }
            (p.holdings || []).forEach(function (h) { if (h.ticker && aggHolding(h).qty > 0) papers[h.ticker] = 1; });
            free += (+p.cash || 0);
        });
        var n = visibleItems().length;
        var pnl = val - inv, pnlPct = inv > 0 ? pnl / inv * 100 : 0;
        var ddPct = hasDd && val - dd > 0 ? dd / (val - dd) * 100 : null;
        var warm = pfQuotesWarming();

        // крупным идёт самая свежая правда, которая есть: дельта дня, а без неё —
        // результат за всё время (мокап overview3, экран 12 «Состояния»)
        var bigCls = hasDd ? (dd >= 0 ? 'pos' : 'neg') : (pnl >= 0 ? 'pos' : 'neg');
        var big = hasDd
            ? '<span class="pfh-k">За день</span><b class="' + bigCls + '">' + (dd >= 0 ? '+' : '−') + fmtRub(Math.abs(dd)) +
              (ddPct != null ? ' <em>' + fmtPct(ddPct) + '</em>' : '') + '</b>'
            : '<span class="pfh-k">За всё время</span><b class="' + bigCls + '">' + (pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(pnl)) +
              ' <em>' + fmtPct(pnlPct) + '</em></b>';
        var small = hasDd
            ? 'за всё время <b class="' + (pnl >= 0 ? 'pos' : 'neg') + '">' + (pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(pnl)) + '</b> · ' + fmtPct(pnlPct)
            : 'за день <b>—</b> · дневное изменение ещё не пришло';

        // кто двигал сегодня: тот же расчёт вклада в рублях, что у «Лидеров дня»
        var byTk = {}, order = [];
        visibleItems().forEach(function (p) {
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker) return;
                var q = quotes[h.ticker]; if (!q || q.chgPct == null) return;
                var k = q.chgPct / 100; if (!(k > -0.999)) return;
                var v = PF.calcHold(h).value; if (!(v > 0)) return;
                var r = byTk[h.ticker];
                if (!r) { r = byTk[h.ticker] = { tk: h.ticker, name: PF.assetDisplayName(h), chg: +q.chgPct, rub: 0 }; order.push(r); }
                r.rub += v - v / (1 + k);
            });
        });
        order.sort(function (a, b) { return Math.abs(b.rub) - Math.abs(a.rub); });
        var movers = order.slice(0, 4);
        var moversHtml = movers.length
            ? movers.map(function (r) {
                var pos = r.rub >= 0;
                return '<div class="pfh-mv"><span class="tk">' + esc(r.tk) + '</span>' +
                    '<span class="nm">' + esc(r.name) + '</span>' +
                    '<b class="' + (pos ? 'pos' : 'neg') + '">' + (pos ? '+' : '−') + fmtRub(Math.abs(r.rub)) + '</b>' +
                    '<i class="' + (pos ? 'pos' : 'neg') + '">' + fmtPct(r.chg) + '</i></div>';
            }).join('')
            : '<div class="pfh-none">Дневное изменение ещё не пришло ни по одной бумаге. Столбец наполнится сам, ' +
              'как только ответит Мосбиржа — задним числом ничего не досчитывается.</div>';

        // ВЕРДИКТ — единственная строка на странице, которая говорит, что делать.
        // Порядок важности: дрейф за порогом → концентрация → всё спокойно.
        var verdict = pfxHeroVerdict(val, order);

        var parts = pfdCapParts();
        var chart = parts.empty
            ? '<div class="pfh-none" style="margin-top:14px">' +
              'Линия появится со второго дня наблюдения: стоимость записывается раз в день при живых котировках.</div>'
            : '<div class="pfcap-body pfh-plot">' + parts.body + '</div>';

        return '<div class="dash2-card pf-card2 pf-heroblk">' +
            '<div class="pfh-row">' +
                '<div class="pfh-l">' +
                    '<div class="pfh-cap">Капитал · ' + n + ' ' + PF.plural(n, 'портфель', 'портфеля', 'портфелей') + '</div>' +
                    // знак валюты — тихим 52% (мокап .hx-sum small): 40px «₽» спорил
                    // с самой суммой, хотя несёт куда меньше
                    '<div class="pfh-sum">' + (warm ? skelHtml(190, 36) : kpiBig(val)) + '</div>' +
                    '<div class="pfh-big">' + big + '</div>' +
                    '<div class="pfh-small">' + small + '</div>' +
                    '<div class="pfh-line">' +
                        '<span>Вложено<b>' + fmtRub(inv) + '</b></span>' +
                        '<span>Свободных денег<b>' + fmtRub(free) + '</b></span>' +
                        '<span>Бумаг в портфелях<b>' + Object.keys(papers).length + '</b></span>' +
                    '</div>' +
                '</div>' +
                '<div class="pfh-c">' +
                    // пилюли периода и «Сравнить» — в строке заголовка графика
                    // (мокап overview3, экран 02: .hx-pills + cmpBtn в .hx-ct)
                    '<div class="pfh-ct"><span class="pfh-k">Капитал по дням</span>' + parts.right + '</div>' +
                    chart +
                '</div>' +
                '<div class="pfh-r">' +
                    '<div class="pfh-k">Кто двигал сегодня</div>' +
                    '<div class="pfh-mvs">' + moversHtml + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="pfh-foot' + (verdict.warn ? ' warn' : '') + '">' +
                '<span class="pfh-dot">' + PF.INFO_SVG + '</span>' +
                '<span class="pfh-say">' + verdict.text + '</span>' +
                (verdict.cta ? '<button class="pfh-go' + (verdict.warn ? ' acc' : '') + '" onclick="' + verdict.act + '">' + verdict.cta + '</button>' : '') +
            '</div>' +
        '</div>';
    }
    // Вердикт героя. Дрейф считаем только по портфелям с ЯВНОЙ целью (p.targetBond),
    // порог — общий PF.DRIFT_THR. Концентрация — доля самой крупной бумаги в капитале.
    function pfxHeroVerdict(val, movers) {
        var thr = PF.DRIFT_THR || 3, worst = null;
        visibleItems().forEach(function (p) {
            if (p.targetBond == null) return;
            var c = calcPf(p), drift = Math.abs(c.bondPct - p.targetBond);
            if (!worst || drift > worst.drift) worst = { p: p, drift: drift, c: c };
        });
        if (worst && worst.drift > thr) {
            return { warn: true,
                text: 'Доли в «<b>' + esc(worst.p.name) + '</b>» ушли от цели на <b>' +
                      worst.drift.toFixed(1).replace('.', ',') + ' п.п.</b> — облигаций ' +
                      Math.round(worst.c.bondPct) + '% при цели ' + worst.p.targetBond + '%.',
                cta: 'Ребаланс ›', act: 'pfExpand(\'' + jsArg(worst.p.id) + '\')' };
        }
        // концентрация: одна бумага держит слишком много капитала
        var top = null, byTk = {};
        visibleItems().forEach(function (p) {
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker) return;
                var v = PF.calcHold(h).value; if (!(v > 0)) return;
                byTk[h.ticker] = (byTk[h.ticker] || 0) + v;
            });
        });
        Object.keys(byTk).forEach(function (tk) { if (!top || byTk[tk] > top.v) top = { tk: tk, v: byTk[tk] }; });
        if (top && val > 0 && top.v / val > 0.4) {
            var share = Math.round(top.v / val * 100);
            var mv = movers && movers.length && movers[0].tk === top.tk ? movers[0] : null;
            var lead = mv && Math.abs(mv.rub) > 0
                ? 'Сегодня он же дал <b>' + (mv.rub >= 0 ? '+' : '−') + fmtRub(Math.abs(mv.rub)) + '</b>. '
                : '';
            return { warn: false,
                text: '<b>' + share + '% капитала стоит в одной бумаге</b> — ' + esc(top.tk) + '. ' + lead,
                cta: 'Диверсификация ›', act: 'pfdShowBlock(\'conc\')' };
        }
        var noTarget = visibleItems().filter(function (p) { return p.targetBond == null; }).length;
        if (noTarget === visibleItems().length && noTarget > 0) {
            return { warn: false,
                text: 'Целевых долей не задано ни у одного портфеля — «Ребаланс» не подскажет, когда сверяться.',
                cta: 'Задать цель ›', act: 'pfxGoTab(\'rebal\')' };
        }
        return { warn: false, text: 'Доли у всех портфелей в пределах порога ' + thr + ' п.п. — <b>сверяться не нужно.</b>',
            cta: '', act: '' };
    }

    // «График капитала» — два ОТДЕЛЬНЫХ блока-дизайна: cap (линия, pfdCapChartHtml) и
    // cap2 (столбцы, pfdCapChartHtmlB). Оба можно держать на дашборде одновременно.
    // Дизайн B — столбчатый: те же данные/окна/герой, но стоимость показана колонками.
    function pfdCapChartHtmlB(demoSeries) {
        var full = demoSeries || pfdCapEffectiveSeries();
        var s = demoSeries ? demoSeries.slice() : pfdCapRangeFilter(full);
        var last = s.length ? s[s.length - 1] : null;
        var right = '', hero = '', body;
        if (s.length < 2) {
            pfdCapState = null;
            body = '<div class="pfcap-empty"><div class="pfcap-empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 3-4 3 3 4-6"/></svg></div>' +
                '<div class="pfcap-empty-t">' + (full.length ? 'Первая точка уже есть' : 'Снимков пока нет') + '</div>' +
                '<div class="pfcap-empty-s">Стоимость портфелей записывается раз в день при живых котировках — линия появится со второго дня.</div></div>';
        } else {
            var min = Infinity, max = -Infinity;
            s.forEach(function (pt) { if (pt.v < min) min = pt.v; if (pt.v > max) max = pt.v; });
            // при большом числе точек прореживаем до ~40 столбцов (равномерно + последняя)
            var bars = s, MAXB = 40;
            if (bars.length > MAXB) {
                var step = bars.length / MAXB, arr = [];
                for (var bi = 0; bi < MAXB; bi++) arr.push(bars[Math.floor(bi * step)]);
                if (arr[arr.length - 1] !== last) arr.push(last);
                bars = arr;
            }
            var lo = min, rng = Math.max(1, max - min);
            var delta = last.v - s[0].v, dPct = s[0].v > 0 ? delta / s[0].v * 100 : 0;
            var up = delta >= 0;
            pfdCapState = null;   // столбцы не используют курсорный тултип линии
            hero = '<div class="pfcap-hero"><span class="pfcap-val">' + fmtRub(last.v) + '</span>' +
                '<span class="pfcap-delta ' + (up ? 'pos' : 'neg') + '">' + (up ? '▲' : '▼') + ' ' + fmtRub(Math.abs(delta)) + ' · ' + fmtPct(dPct) + '</span>' +
                '<span class="pfcap-per">за ' + Math.max(1, Math.round((new Date(last.d).getTime() - new Date(s[0].d).getTime()) / 86400000)) + ' дн</span></div>';
            var barsHtml = bars.map(function (pt) {
                var h = 6 + ((pt.v - lo) / rng) * 88;   // 6..94% высоты
                var pos = pt.v >= s[0].v;
                return '<span class="pfcapb-bar ' + (pos ? 'pos' : 'neg') + '" style="height:' + h.toFixed(1) + '%" title="' + esc(ruDate(pt.d)) + ' · ' + esc(fmtRub(pt.v)) + '"></span>';
            }).join('');
            body = '<div class="pfcapb-wrap">' +
                    '<span class="pfcap-y pfcap-y--max">' + fmtRub(max) + '</span>' +
                    '<span class="pfcap-y pfcap-y--min">' + fmtRub(min) + '</span>' +
                    '<div class="pfcapb-plot">' + barsHtml + '</div>' +
                '</div>';   // подписи дат под полотном сняты — см. pfdCapParts
            right = pfdCapRangesHtml();
        }
        return '<div class="dash2-card pf-card2 pf-capblk pf-capblk--bars" title="Дневные снимки хранятся на этом устройстве (до 400 дней)">' +
            PF.pfCardHead('', 'График капитала', 'стоимость всех портфелей',
                pfdInChromeHtml('cap2') + right) +
            hero +
            '<div class="pfcap-body">' + body + '</div></div>';
    }
    window.pfdCapSetRange = function (r) { if (PF.pfdCapRange === r) return; PF.pfdCapRange = r; pfdCapRepaint(); };
    // перерисовать ВСЕ блоки графика капитала (линия и/или столбцы могут быть оба
    // на дашборде) и героя «Обзора» — его пилюли периода живут в той же сессии
    function pfdCapRepaint() {
        var cards = document.querySelectorAll('#pfWrap .pf-capblk, #pfWrap .pf-heroblk'); if (!cards.length) return;
        cards.forEach(function (card) {
            var html = card.classList.contains('pf-heroblk') ? pfxHeroBlockHtml()
                : card.classList.contains('pf-capblk--bars') ? pfdCapChartHtmlB() : pfdCapChartHtml();
            var tmp = document.createElement('div'); tmp.innerHTML = html;
            card.parentNode.replaceChild(tmp.firstChild, card);
        });
        pfdRepackSoon();
    }
    // Дорисовать линию капитала поверх заглушки «мало данных», когда исторические серии
    // карточек (PF.chartRaw) подъехали асинхронно. Действуем ТОЛЬКО пока показана заглушка —
    // как только линия нарисована, .pfcap-empty исчезает и повторные вызовы выходят сразу
    // (без циклов и лишних перерисовок). Вызывается из repaintCharts после каждой загрузки.
    function pfdCapMaybeRepaint() {
        var cards = document.querySelectorAll('#pfWrap .pf-capblk'); if (!cards.length) return;
        var anyEmpty = Array.prototype.some.call(cards, function (c) { return c.querySelector('.pfcap-empty'); });
        if (!anyEmpty) return;                              // линии/столбцы уже есть — не трогаем
        if (pfdCapSeries().length >= 2) return;            // подъехали настоящие снимки — обычный ре-рендер справится
        if (pfdCapHistSeries().length < 2) return;         // истории ещё нет — ждём
        pfdCapRepaint();
    }
    window.pfdCapHover = function (ev) {
        var st = pfdCapState, hit = ev.currentTarget, plot = hit && hit.parentNode; if (!st || !plot) return;
        var rect = hit.getBoundingClientRect(); if (!rect.width) return;
        var frac = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        var i = clamp(Math.round(frac * (st.n - 1)), 0, st.n - 1), pt = st.s[i];
        var lx = st.inx + (st.n > 1 ? i / (st.n - 1) : 0) * (100 - 2 * st.inx);
        var ly = st.pt + (1 - (pt.v - st.min) / st.span) * (100 - st.pt - st.pb);
        var cur = plot.querySelector('.pfcap-cursor'), cdot = plot.querySelector('.pfcap-cdot'), tip = plot.querySelector('.pfcap-tip');
        if (cur) { cur.style.left = lx + '%'; cur.classList.add('on'); }
        if (cdot) { cdot.style.left = lx + '%'; cdot.style.top = ly + '%'; cdot.classList.add('on'); }
        if (tip) {
            // процент — от начала окна, тем же отсчётом, что шкала слева: «−4,3%»
            // в подсказке и «−5%» на шкале обязаны говорить об одном (экран 18)
            var pct = st.base > 0 ? (pt.v / st.base - 1) * 100 : null;
            var html = '<b>' + fmtRub(pt.v) + '</b><i>' + ruDate(pt.d) +
                (pct == null ? '' : ' · ' + fmtPct(pct)) + '</i>';
            // вторая строка — только когда сравнение включено И индекс за этот день есть
            if (st.cmp && st.cmp[i] != null && st.base > 0) {
                html += '<i>' + esc(st.bench) + ' за тот же срок · ' + fmtPct((st.cmp[i] / st.base - 1) * 100) + '</i>';
            }
            tip.innerHTML = html; tip.style.left = clamp(lx, 13, 87) + '%'; tip.classList.add('on');
        }
    };
    window.pfdCapHoverEnd = function (ev) {
        var plot = ev.currentTarget && ev.currentTarget.parentNode; if (!plot) return;
        ['.pfcap-cursor', '.pfcap-cdot', '.pfcap-tip'].forEach(function (sel) { var el = plot.querySelector(sel); if (el) el.classList.remove('on'); });
    };

    // ---- «Распределение активов»: кольцо акции/облигации/кэш + выбор портфеля ----
    // Выбранный портфель (или «Все») хранится в PF.dashCfg.allocPf. Если портфель исчез —
    // мягкий откат на «Все». Клик по чипу перерисовывает только сам блок (без ре-рендера).
    function pfdAllocScope() {
        var id = PF.dashCfg.allocPf || 'all';
        if (id !== 'all' && !visibleItems().some(function (p) { return p.id === id; })) id = 'all';
        return id;
    }
    function pfdAllocCompute(scope) {
        var stock = 0, bond = 0, cash = 0;
        var list = scope === 'all' ? visibleItems() : visibleItems().filter(function (p) { return p.id === scope; });
        list.forEach(function (p) { var c = calcPf(p); bond += c.bondVal; stock += (c.value - c.bondVal); cash += (+p.cash || 0); });
        if (stock < 0) stock = 0;
        return { stock: stock, bond: bond, cash: cash, total: stock + bond + cash };
    }
    function pfdAllocDonut(d) {
        var C = 238.76, segs = [
            { v: d.stock, c: '#D97757' }, { v: d.bond, c: '#7B9BBF' }, { v: d.cash, c: '#94a3b8' }
        ].filter(function (s) { return s.v > 0; });
        var acc = 0;
        var arcs = segs.map(function (s) {
            var f = s.v / d.total, dash = (f * C).toFixed(2), off = (-acc * C).toFixed(2);
            acc += f;
            return '<circle cx="50" cy="50" r="38" fill="none" stroke="' + s.c + '" stroke-width="15" ' +
                'stroke-dasharray="' + dash + ' ' + (C - f * C).toFixed(2) + '" stroke-dashoffset="' + off + '"/>';
        }).join('');
        // R7: центр кольца ПУСТОЙ (проценты читаются в легенде рядом — референс)
        return '<div class="pfal-donut">' +
            '<svg viewBox="0 0 100 100" aria-hidden="true">' +
                '<circle cx="50" cy="50" r="38" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="15"/>' +
                '<g transform="rotate(-90 50 50)">' + arcs + '</g>' +
            '</svg>' +
        '</div>';
    }
    function pfdAllocLegRow(label, val, total, cls) {
        var pct = total > 0 ? Math.round(val / total * 100) : 0;
        return '<div class="pfal-lrow"><span class="pfal-dot ' + cls + '"></span>' +
            '<span class="pfal-lname">' + label + '</span>' +
            '<span class="pfal-lval">' + fmtRub(val) + '</span>' +
            '<span class="pfal-lpct">' + pct + '%</span></div>';
    }
    function pfdAllocHtml(demo) {
        var scope, d, vis = visibleItems();
        if (demo) { scope = 'all'; d = { stock: demo.stock, bond: demo.bond, cash: demo.cash, total: demo.stock + demo.bond + demo.cash }; }
        else { scope = pfdAllocScope(); d = pfdAllocCompute(scope); }
        var sel = '';
        if (!demo && vis.length > 1) {
            var chips = '<button class="pfal-chip' + (scope === 'all' ? ' on' : '') + '" onclick="pfdAllocPick(\'all\')">Все</button>';
            vis.forEach(function (p) {
                chips += '<button class="pfal-chip' + (scope === p.id ? ' on' : '') + '" onclick="pfdAllocPick(\'' + jsArg(p.id) + '\')" title="' + esc(p.name) + '">' +
                    '<i style="background:' + colorVal(p.color) + '"></i><span>' + esc(p.name) + '</span></button>';
            });
            sel = '<div class="pfal-seg">' + chips + '</div>';
        }
        var subName = scope === 'all' ? 'по всем портфелям' : (function () { var p = findPf(scope); return p ? p.name : 'портфель'; })();
        var body;
        if (d.total <= 0) {
            body = '<div class="pfal-empty">Нет данных о составе — добавьте бумаги в портфель, и доли посчитаются автоматически.</div>';
        } else {
            body = '<div class="pfal-body">' + pfdAllocDonut(d) +
                '<div class="pfal-legend">' +
                    pfdAllocLegRow('Акции', d.stock, d.total, 'stk') +
                    pfdAllocLegRow('Облигации', d.bond, d.total, 'bnd') +
                    (d.cash > 0 ? pfdAllocLegRow('Кэш', d.cash, d.total, 'csh') : '') +
                '</div></div>';
        }
        // область охвата и переход в «Ребаланс» — подвалом, а не подписью: подвал
        // прижат к низу и даёт ряду общую нижнюю грань (мокап, экран 13, п. 2)
        var foot = demo ? '' : PF.pfCardFoot(esc(subName), '',
            { label: 'Ребаланс', onclick: "pfxGoTab('rebal')" });
        return '<div class="dash2-card pf-card2 pf-allocblk">' +
            PF.pfCardHead('', 'Распределение активов', '', null) +
            sel + body + foot + '</div>';
    }
    window.pfdAllocPick = function (id) {
        if (PF.dashCfg.allocPf === id) return;
        PF.dashCfg.allocPf = id; saveDashCfg();
        var cards = document.querySelectorAll('#pfWrap .pf-allocblk');
        if (!cards.length) { pfdRerender(); return; }
        cards.forEach(function (card) {
            var tmp = document.createElement('div'); tmp.innerHTML = pfdAllocHtml();
            card.parentNode.replaceChild(tmp.firstChild, card);
        });
        pfdRepackSoon();
    };

    // ---- «Карта рынка»: живой мини-treemap IMOEX ----
    // Рисует home-register.js (window.hgHeatRepaint): контейнеру достаточно класса
    // .gx-heat — тот же приём, что у заглушек вкладок (tab-gates). Обновляется тем же
    // 60-секундным циклом Главной (он ищет .gx-heat на активной вкладке).
    // Режим карты: индекс целиком или только ваши бумаги (мокап overview3, экран 13).
    // Один контрол виджета — сегмент в правом слоте шапки, рядом с хромом.
    function pfdHeatMode() { return PF.dashCfg.heatMode === 'pf' ? 'pf' : 'idx'; }
    window.pfdHeatSetMode = function (m) {
        if (pfdHeatMode() === m) return;
        PF.dashCfg.heatMode = m; saveDashCfg(); pfdRerender();
    };
    // Плитки «моего портфеля»: размер — стоимость позиции, цвет — дневное
    // изменение из тех же котировок, что кормят карточки (quotes[tk].chgPct).
    function pfdHeatOwnItems() {
        var m = {};
        visibleItems().forEach(function (p) {
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker || h.type === 'bond') return;
                var v = PF.calcHold ? PF.calcHold(h).value : 0;
                if (!(v > 0)) return;
                m[h.ticker] = (m[h.ticker] || 0) + v;
            });
        });
        return Object.keys(m).map(function (tk) { return { tk: tk, value: m[tk] }; })
            .sort(function (a, b) { return b.value - a.value; });
    }
    function pfdHeatHtml() {
        var mode = pfdHeatMode();
        var seg = '<span class="pfhm-seg">'
            + '<button type="button" class="' + (mode === 'idx' ? 'on' : '') + '" onclick="pfdHeatSetMode(\'idx\')">Индекс</button>'
            + '<button type="button" class="' + (mode === 'pf' ? 'on' : '') + '" onclick="pfdHeatSetMode(\'pf\')">Мой портфель</button>'
            + '</span>';
        return '<div class="dash2-card pf-card2 pf-heatblk">' +
            PF.pfCardHead('', 'Карта рынка',
                mode === 'pf' ? 'ваши акции · размер — стоимость позиции, цвет — за день'
                              : 'IMOEX · размер плитки — вес в индексе, цвет — за день',
                // кнопки конструктора — в потоке шапки ПЕРЕД сегментом (PFD_OWN_CHROME)
                pfdInChromeHtml('heat') + seg) +
            // заглушка «Загружаем…» — только при ПЕРВОЙ загрузке (данных ещё нет).
            // При любом ре-рендере вкладки с закэшированными данными бокс остаётся
            // пустым на долю кадра и тут же наполняется синхронно (pfdHeatRenderNow
            // в renderPortfolios) — текст заглушки мигал бы на каждом переключении.
            '<div class="pfhm-box">' + (pfdHeatW && pfdHeatC ? '' : '<div class="pfhm-state">Загружаем карту рынка…</div>') + '</div>' +
            // шкала цвета: без неё «зелёное» и «красное» — просто настроение,
            // а не −3 % и +3 % (мокап overview3, экран 13)
            '<div class="pfhm-sc"><span>−3%</span><u></u><span>+3%</span>' +
                '<em>данные MOEX ISS' + (pfdHeatTs ? ' · ' + pfhmTime(pfdHeatTs) : '') + '</em>' +
                '<span class="pfhm-go2" onclick="switchTab(\'market\')">Рынок ›</span></div>' +
        '</div>';
    }
    function pfhmTime(ts) {
        var d = new Date(ts);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    // ---- собственный squarified-treemap (свои плитки, а не декоративный фон Главной):
    // живые цвета по дневному %, тикер+% на плитке, hover-подсветка. Данные — те же
    // два эндпоинта MOEX ISS (веса индекса + дневное изменение), кэш на 60с.
    var PFHM_ISS = 'https://iss.moex.com/iss/';
    var pfdHeatW = null;    // [{tk, value}] веса по убыванию
    var pfdHeatC = null;    // {TICKER: изм.% за день}
    var pfdHeatTs = 0, pfdHeatLoading = false;
    function pfhmJget(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
    function pfdHeatLoad(cb) {
        if (pfdHeatLoading) return;
        if (pfdHeatW && pfdHeatC && Date.now() - pfdHeatTs < 60000) { cb && cb(); return; }
        pfdHeatLoading = true;
        var aU = PFHM_ISS + 'statistics/engines/stock/markets/index/analytics/IMOEX.json?iss.meta=off&iss.only=analytics&analytics.columns=ticker,weight&limit=100';
        var mU = PFHM_ISS + 'engines/stock/markets/shares/boards/TQBR/securities.json?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LASTTOPREVPRICE';
        Promise.all([pfdHeatW ? Promise.resolve(null) : pfhmJget(aU), pfhmJget(mU)])
            .then(function (res) {
                if (res[0]) { var a = res[0].analytics, ti = a.columns.indexOf('ticker'), wi = a.columns.indexOf('weight');
                    pfdHeatW = a.data.map(function (r) { return { tk: r[ti], value: +r[wi] || 0 }; }).filter(function (x) { return x.value > 0; }).sort(function (x, y) { return y.value - x.value; }); }
                var md = res[1].marketdata, si = md.columns.indexOf('SECID'), ci = md.columns.indexOf('LASTTOPREVPRICE');
                var m = {}; md.data.forEach(function (r) { m[r[si]] = r[ci]; }); pfdHeatC = m;
                pfdHeatTs = Date.now(); pfdHeatLoading = false; cb && cb();
            })
            .catch(function () { pfdHeatLoading = false; cb && cb(true); });
    }
    // диверг-палитра OKLCH как у большой карты: рост — мята 158, падение — клэй 44
    function pfdTileColor(p) {
        if (p == null || isNaN(p)) p = 0;
        var dark = document.body.classList.contains('dark-mode'), cap = 3;
        var a = clamp(p, -cap, cap) / cap, m = Math.abs(a), hue = a >= 0 ? 158 : 44;
        var nL = dark ? 0.30 : 0.955, sL = dark ? 0.56 : 0.72, nC = dark ? 0.016 : 0.012, sC = dark ? 0.135 : 0.115;
        var t = Math.pow(m < 0.04 ? 0 : (m - 0.04) / 0.96, 0.8);
        return 'oklch(' + (nL + (sL - nL) * t).toFixed(3) + ' ' + (nC + (sC - nC) * t).toFixed(3) + ' ' + hue + ')';
    }
    function pfhmWorst(row, side) { var mx = -Infinity, mn = Infinity, s = 0, i; for (i = 0; i < row.length; i++) { var ar = row[i].area; s += ar; if (ar > mx) mx = ar; if (ar < mn) mn = ar; } if (s === 0) return Infinity; var s2 = s * s, d2 = side * side; return Math.max(d2 * mx / s2, s2 / (d2 * mn)); }
    function pfhmRow(row, free, out) { var ra = 0, i, seg; for (i = 0; i < row.length; i++) ra += row[i].area; if (free.w <= free.h) { var rh = ra / free.w, x = free.x; for (i = 0; i < row.length; i++) { seg = row[i].area / rh; out.push({ tk: row[i].tk, x: x, y: free.y, w: seg, h: rh }); x += seg; } return { x: free.x, y: free.y + rh, w: free.w, h: free.h - rh }; } var rw = ra / free.h, y = free.y; for (i = 0; i < row.length; i++) { seg = row[i].area / rw; out.push({ tk: row[i].tk, x: free.x, y: y, w: rw, h: seg }); y += seg; } return { x: free.x + rw, y: free.y, w: free.w - rw, h: free.h }; }
    function pfhmSquarify(items, W, H) {
        var out = [], total = 0, i; for (i = 0; i < items.length; i++) total += items[i].value; if (total <= 0 || W <= 0 || H <= 0) return out;
        var scale = W * H / total, scaled = items.map(function (n) { return { tk: n.tk, area: n.value * scale }; });
        var free = { x: 0, y: 0, w: W, h: H }, row = [], idx = 0;
        while (idx < scaled.length) { var side = Math.min(free.w, free.h), it = scaled[idx]; if (row.length === 0 || pfhmWorst(row.concat(it), side) <= pfhmWorst(row, side)) { row.push(it); idx++; } else { free = pfhmRow(row, free, out); row = []; } }
        if (row.length) pfhmRow(row, free, out);
        return out;
    }
    function pfdHeatRender() {
        var box = document.querySelector('#pfWrap .pfhm-box'); if (!box) return;
        if (!pfdHeatW || !pfdHeatC) {
            pfdHeatLoad(function (err) { if (err) { var b = document.querySelector('#pfWrap .pfhm-box'); if (b) b.innerHTML = '<div class="pfhm-state">Биржа недоступна — попробуйте позже</div>'; } else pfdHeatRender(); });
            return;
        }
        var W = box.clientWidth, H = box.clientHeight; if (W < 4 || H < 4) return;
        var MAX = W * H > 180000 ? 40 : 26;
        var own = pfdHeatMode() === 'pf';
        var src = own ? pfdHeatOwnItems() : pfdHeatW;
        if (own && !src.length) {
            box.innerHTML = '<div class="pfhm-state">В портфелях нет акций — карте нечего показать. Переключитесь на «Индекс».</div>';
            return;
        }
        var tiles = pfhmSquarify(src.slice(0, MAX), W, H);
        var html = '';
        tiles.forEach(function (t) {
            // в режиме портфеля дневное изменение берём из своих котировок:
            // там есть и бумаги вне индекса, которых в выгрузке ISS нет
            var chg = own ? ((quotes[t.tk] || {}).chgPct) : pfdHeatC[t.tk];
            if (chg != null && isNaN(+chg)) chg = null; else if (chg != null) chg = +chg;
            var x = t.x + 1.5, y = t.y + 1.5, w = Math.max(0, t.w - 3), h = Math.max(0, t.h - 3);
            var big = w > 52 && h > 34, mid = w > 34 && h > 22;
            var pctTxt = chg == null ? '' : (chg >= 0 ? '+' : '−') + Math.abs(chg).toFixed(1).replace('.', ',') + '%';
            var label = big ? '<b>' + esc(t.tk) + '</b><i>' + pctTxt + '</i>' : (mid ? '<b>' + esc(t.tk) + '</b>' : '');
            // нативный title убран: по наведению всплывает своё мини-превью (pfdHeatPvShow)
            var tip = esc(t.tk) + (chg == null ? '' : ' · ' + pctTxt + ' за день');
            html += '<button type="button" class="pfhm-tile" data-tk="' + esc(t.tk) + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;--tc:' + pfdTileColor(chg) + '" aria-label="' + tip + '" onclick="pfOpenTicker(\'' + jsArg(t.tk) + '\')">' + label + '</button>';
        });
        box.innerHTML = html;
        pfdHeatPvBind(box);
    }
    // ---- мини-превью плитки карты: по наведению всплывает карточка с хвостиком ----
    // Одно превью на бокс (position:absolute внутри .pfhm-box), над плиткой (у верхнего
    // ряда — под ней), хвостик всегда указывает на центр плитки даже при клампе к краям.
    // pointer-events:none — не перехватывает hover/клики, клик по плитке работает как раньше.
    var pfdHeatPvTile = null, pfdHeatPvHideT = null;
    function pfdHeatPvHtml(tk) {
        var co = (typeof window.stkFindCompany === 'function') ? window.stkFindCompany(tk) : null;
        var name = co && co.name ? co.name : '';
        var chg = pfdHeatC ? pfdHeatC[tk] : null;
        if (chg != null && isNaN(+chg)) chg = null; else if (chg != null) chg = +chg;
        var weight = null;
        if (pfdHeatW) pfdHeatW.some(function (x) { if (x.tk === tk) { weight = x.value; return true; } return false; });
        var price = null, pot = null;
        if (co && co.main) {
            price = toNum(co.main['Текущая Цена']); if (!isFinite(price)) price = null;
            pot = toNum(co.main['ОДХС']); if (!isFinite(pot)) pot = null;
        }
        function row(l, v, cls) { return v == null ? '' : '<span class="pfhm-pv-r"><i>' + l + '</i><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></span>'; }
        var chgTxt = chg == null ? null : (chg >= 0 ? '+' : '−') + Math.abs(chg).toFixed(2) + '%';
        var priceTxt = price == null ? null : price.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
        var wTxt = weight == null ? null : weight.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + '%';
        var potTxt = pot == null ? null : fmtPct(pot);
        return '<div class="pfhm-pv-head"><b>' + esc(tk) + '</b>' + (name ? '<span>' + esc(name) + '</span>' : '') + '</div>' +
            '<div class="pfhm-pv-rows">' +
                row('За день', chgTxt, chg != null ? (chg >= 0 ? 'pos' : 'neg') : '') +
                row('Цена', priceTxt) +
                row('Вес в IMOEX', wTxt) +
                row('Потенциал', potTxt, pot != null ? (pot >= 0 ? 'pos' : 'neg') : '') +
            '</div>' +
            '<div class="pfhm-pv-hint">нажмите — карточка компании</div>' +
            '<i class="pfhm-pv-tail"></i>';
    }
    function pfdHeatPvShow(box, tile) {
        clearTimeout(pfdHeatPvHideT);
        pfdHeatPvTile = tile;
        var pv = box.querySelector('.pfhm-pv');
        if (!pv) { pv = document.createElement('div'); pv.className = 'pfhm-pv'; box.appendChild(pv); }
        pv.innerHTML = pfdHeatPvHtml(tile.getAttribute('data-tk') || '');
        var bw = box.clientWidth;
        var pw = pv.offsetWidth, ph = pv.offsetHeight;
        var cx = tile.offsetLeft + tile.offsetWidth / 2;
        var left = clamp(cx - pw / 2, 6, Math.max(6, bw - pw - 6));
        var below = tile.offsetTop - ph - 10 < 4;   // сверху не влезает → показываем под плиткой
        var top = below ? tile.offsetTop + tile.offsetHeight + 10 : tile.offsetTop - ph - 10;
        pv.classList.toggle('below', below);
        pv.style.left = left + 'px';
        pv.style.top = top + 'px';
        pv.style.setProperty('--tail-x', clamp(cx - left, 14, pw - 14) + 'px');
        requestAnimationFrame(function () { if (pfdHeatPvTile === tile) pv.classList.add('on'); });
    }
    function pfdHeatPvHide(box) {
        clearTimeout(pfdHeatPvHideT);
        // микро-задержка: переход между соседними плитками проскакивает по фону бокса
        // (зазор 1.5px) — без задержки превью мигало бы на каждом шаге
        pfdHeatPvHideT = setTimeout(function () {
            pfdHeatPvTile = null;
            var pv = box.querySelector('.pfhm-pv');
            if (pv) pv.classList.remove('on');
        }, 70);
    }
    function pfdHeatPvBind(box) {
        box.onmouseover = function (e) {
            var tile = e.target.closest ? e.target.closest('.pfhm-tile') : null;
            if (!tile || !box.contains(tile)) { pfdHeatPvHide(box); return; }
            if (tile === pfdHeatPvTile) { clearTimeout(pfdHeatPvHideT); return; }
            pfdHeatPvShow(box, tile);
        };
        box.onmouseleave = function () { pfdHeatPvHide(box); };
        // клик по плитке открывает карточку компании — превью сразу прячем
        box.onclick = function () { pfdHeatPvHide(box); };
    }
    var pfdHeatT = null;
    function pfdHeatRepaintSoon() {
        var box = document.querySelector('#pfWrap .pfhm-box'); if (!box) return;
        clearTimeout(pfdHeatT);
        pfdHeatT = setTimeout(pfdHeatRender, 90);
    }
    // Синхронная дорисовка ПОСЛЕ innerHTML-свопа вкладки (renderPortfolios): при
    // закэшированных данных плитки встают в том же кадре, что и своп, — карта не
    // мигает пустым боксом 90мс дебаунса на каждом переключении внутри страницы
    // (сортировка «Избранного», тумблеры и т.п.). Без кэша — прежний путь с загрузкой.
    function pfdHeatRenderNow() {
        var box = document.querySelector('#pfWrap .pfhm-box'); if (!box) return;
        clearTimeout(pfdHeatT);
        pfdHeatRender();
    }
    // живое обновление карты: раз в 60с, только когда блок на экране и вкладка видна
    setInterval(function () {
        if (document.hidden) return;
        var panel = document.getElementById('panel-portfolios');
        if (!panel || !panel.classList.contains('active')) return;
        if (!document.querySelector('#pfWrap .pfhm-box')) return;
        pfdHeatTs = 0;   // форсируем перезагрузку данных
        pfdHeatLoad(function (err) { if (!err) pfdHeatRender(); });
    }, 60000);
    var GO_ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><polyline points="8 7 17 7 17 16"/></svg>';
    // смена темы (класс dark-mode на body) → перекрасить плитки карты под новую палитру
    try {
        new MutationObserver(function () {
            if (document.querySelector('#pfWrap .pfhm-box')) pfdHeatRepaintSoon();
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}

    // ---- «Новости по позициям»: Д2 «сторис» (мокап news-mockups, утверждён 2026-07-22) ----
    // Полоса монограмм бумаг (кольцо = есть непрочитанное, бейдж — счёт новостей),
    // плеер непрочитанного с сегментами прогресса, фокус бумаги со всеми её новостями,
    // лента с группами дней и прочитанностью. Пайплайн новостей общий с «Избранным»
    // (loadNewsForTicker + newsHtmlCache + очередь): общие тикеры не грузятся дважды.
    var NW_READ_KEY = 'nw_read_v1';   // прочитанные ссылки (localStorage, ключ в WATCH cloud-sync)
    var NW_FRESH_MS = 7 * 864e5;      // «непрочитанным» считаем только новость за последнюю неделю
    var nwRead = null;                // { link: 1 } — лениво из localStorage
    var pfdNewsCustom = [];    // тикеры не из портфеля, добавленные вручную (сессия)
    var pfdNewsAdding = false;  // раскрыт ли инпут добавления тикера
    var nwView = { mode: 'feed' };    // 'feed' | 'player' (tk, idx, list-снапшот) | 'focus' (tk)
    var nwReadTimer = null;           // «показ ≥2с в плеере = прочитано»
    var nwRepaintT = null;            // дебаунс перерисовки при прогрессивной загрузке новостей
    function nwReadSet() {
        if (nwRead) return nwRead;
        nwRead = {};
        try { (JSON.parse(localStorage.getItem(NW_READ_KEY) || '[]') || []).forEach(function (l) { nwRead[l] = 1; }); } catch (e) {}
        return nwRead;
    }
    function nwSaveRead() {
        var keys = Object.keys(nwReadSet());
        if (keys.length > 600) {   // не раздуваем ключ: порядок вставки = старые первыми
            keys = keys.slice(keys.length - 600);
            nwRead = {}; keys.forEach(function (l) { nwRead[l] = 1; });
        }
        try { localStorage.setItem(NW_READ_KEY, JSON.stringify(keys)); } catch (e) {}
    }
    function nwMarkRead(link) {
        if (!link || nwReadSet()[link]) return false;
        nwRead[link] = 1; nwSaveRead(); return true;
    }
    function nwUnreadOf(tk) {
        var e = newsHtmlCache[tk], now = Date.now(), rs = nwReadSet();
        if (!e || !e.items) return [];
        return e.items.filter(function (it) { return it.link && !rs[it.link] && it.date && now - it.date < NW_FRESH_MS; });
    }
    function nwTotalUnread(list) {
        var n = 0; list.forEach(function (x) { n += nwUnreadOf(x.tk).length; }); return n;
    }
    function pfdNewsList() {
        var map = {}, order = [];
        visibleItems().forEach(function (p) {
            (p.holdings || []).forEach(function (h) {
                if (h.type === 'bond' || !h.ticker) return;
                var a = aggHolding(h); if (!(a.qty > 0)) return;
                var tk = h.ticker, q = quotes[tk];
                if (!map[tk]) { map[tk] = { tk: tk, qty: 0, val: 0, chg: q && q.chgPct != null ? q.chgPct : null, pfs: [] }; order.push(tk); }
                map[tk].qty += a.qty;
                map[tk].val += ((q && q.price) || a.avgPrice || 0) * a.qty;
                if (!map[tk].pfs.some(function (x) { return x.id === p.id; })) map[tk].pfs.push({ id: p.id, name: p.name, color: colorVal(p.color) });
            });
        });
        var list = order.map(function (tk) { return map[tk]; });
        list.sort(function (a, b) { return b.val - a.val; });   // крупные позиции — первыми
        pfdNewsCustom.forEach(function (tk) {
            if (map[tk]) return;   // уже есть в портфеле — не дублируем
            var q = quotes[tk];
            list.push({ tk: tk, qty: 0, val: 0, chg: q && q.chgPct != null ? q.chgPct : null, pfs: [], custom: true });
        });
        return list.slice(0, 16);
    }
    function pfdNewsTickers() { return pfdNewsList().map(function (x) { return x.tk; }); }
    function nwCoName(tk) {
        var co = (typeof window.stkFindCompany === 'function') ? window.stkFindCompany(tk) : null;
        return co && co.name ? co.name : '';
    }
    // дневное изменение моно-цифрой: '+0,8%' / '−1,2%' (знак минуса — типографский)
    function nwChgHtml(chg, cls) {
        if (chg == null || isNaN(chg)) return '';
        var s = (chg > 0 ? '+' : '') + Number(chg).toFixed(1).replace('.', ',').replace('-', '−') + '%';
        return '<span class="' + cls + (chg > 0 ? ' pos' : chg < 0 ? ' neg' : '') + '">' + s + '</span>';
    }
    // полоса: бумаги с непрочитанным первыми (внутри — порядок списка, т.е. по весу позиции)
    function nwStripOrder(list) {
        var un = [], rd = [];
        list.forEach(function (x) { (nwUnreadOf(x.tk).length ? un : rd).push(x); });
        return un.concat(rd);
    }
    function nwStripHtml(list) {
        var selTk = nwView.mode === 'feed' ? null : nwView.tk;
        var t = '<div class="nws-it' + (selTk === null ? ' sel' : '') + '">' +
            '<button type="button" class="nws-all" onclick="pfdNwFeed()" title="Вся лента">Все</button>' +
            '<span class="nws-nm">лента</span></div>';
        t += nwStripOrder(list).map(function (x) {
            var un = nwUnreadOf(x.tk);
            var badge = x.custom
                ? '<i class="nws-del" onclick="event.stopPropagation();pfdNewsDelCustom(\'' + jsArg(x.tk) + '\')" title="Убрать тикер">×</i>'
                : (un.length > 1 ? '<i class="nws-cnt">' + un.length + '</i>' : '');
            return '<div class="nws-it' + (un.length ? ' unread' : '') + (selTk === x.tk ? ' sel' : '') + '">' +
                '<button type="button" class="nws-ava" onclick="pfdNwRing(\'' + jsArg(x.tk) + '\')" title="' + (un.length ? 'Смотреть непрочитанное' : 'Новости бумаги') + '">' +
                    esc(x.tk.charAt(0)) + badge + '</button>' +
                '<button type="button" class="nws-tkc" onclick="pfdNwFocus(\'' + jsArg(x.tk) + '\')" title="Все новости бумаги">' +
                    '<span class="nws-nm">' + esc(x.tk) + '</span>' + (nwChgHtml(x.chg, 'nws-chg') || '<span class="nws-chg">&nbsp;</span>') + '</button></div>';
        }).join('');
        t += pfdNewsAdding
            ? '<div class="nws-it"><span class="nws-addwrap"><input class="pfnw-addinput" placeholder="ТИКЕР" maxlength="12" onkeydown="pfdNewsAddKey(event)" onblur="pfdNewsAddBlur(this)"></span><span class="nws-nm">тикер</span></div>'
            : '<div class="nws-it"><button type="button" class="nws-plus" onclick="pfdNewsAddToggle()" title="Добавить тикер не из портфеля" aria-label="Добавить тикер">' + PFD_PLUS_SVG + '</button><span class="nws-nm">тикер</span></div>';
        return '<div class="nws-strip">' + t + '</div>';
    }
    // панель под шапкой: «N новых» + «Прочитать всё» (только в ленте и только при непрочитанном)
    function nwBarHtml(n) {
        if (!n) return '';
        return '<div class="nws-bar"><span class="nws-new">' + FAV_STAR_SVG + '<b>' + n + '</b>&nbsp;новых</span>' +
            '<button type="button" class="nws-mark" onclick="pfdNwReadAll()">' + NW_CHECK_SVG + 'Прочитать всё</button></div>';
    }
    // группа дня для ленты: 0 — Сегодня, 1 — Вчера, 2 — Ранее
    function nwDayGroup(ts) {
        if (!ts) return 2;
        var d = new Date(ts).toDateString(), now = new Date();
        if (d === now.toDateString()) return 0;
        if (d === new Date(now.getTime() - 864e5).toDateString()) return 1;
        return 2;
    }
    function nwRowHtml(x) {
        var e = newsHtmlCache[x.tk];
        var it = (e && !e.none && e.items && e.items.length) ? e.items[0] : null;
        var loading = !e;
        var unread = !!nwUnreadOf(x.tk).length;
        var mark = x.custom ? '<span class="nwd-ext">внеш.</span>'
            : '<span class="nwd-dots">' + (x.pfs || []).map(function (p) { return '<i style="background:' + p.color + '" title="' + attr(p.name) + '"></i>'; }).join('') + '</span>';
        var meta = it
            ? '<div class="nwd-meta"><i>Smart-Lab</i><em>' + esc(it.rel || '') + '</em>' + mark + (it.link ? PFNW_GO_SVG : '') + '</div>'
            : (loading ? '' : '<div class="nwd-meta">' + mark + '</div>');
        var title = loading ? 'загрузка новости…' : (it ? it.t : 'нет свежих новостей');
        var news = it && it.link
            ? '<div class="nwd-news" role="link" onclick="pfdNwOpenRow(\'' + jsArg(x.tk) + '\')"><div class="nwd-nt">' + esc(title) + '</div>' + meta + '</div>'
            : '<div class="nwd-news"><div class="nwd-nt">' + esc(title) + '</div>' + meta + '</div>';
        return '<div class="nwd-row' + (it ? '' : ' none') + (!unread && !loading ? ' read' : '') + '" data-tk="' + esc(x.tk) + '">' +
            (unread ? '<span class="nws-dot"></span>' : '') +
            '<button type="button" class="nwd-tkb" onclick="pfOpenTicker(\'' + jsArg(x.tk) + '\')" title="Открыть карточку компании">' +
                '<b class="nwd-tk">' + esc(x.tk) + '</b>' + nwChgHtml(x.chg, 'nwd-chg') + '</button>' + news + '</div>';
    }
    // лента «Все»: группы Сегодня/Вчера/Ранее по дате свежей новости, затем
    // «Пока без новостей» и «Загружается» — уже показанные строки не прыгают.
    // Лента укорочена до NW_FEED_MAX строк: остальное рассказывает полоса-сторис,
    // а плеер, открываясь на месте ленты, не дёргает высоту виджета
    var NW_FEED_MAX = 2;
    function nwFeedHtml(list) {
        var g = { s: [], v: [], r: [], n: [], l: [] };
        list.forEach(function (x) {
            var e = newsHtmlCache[x.tk];
            if (!e) { g.l.push(x); return; }
            if (e.none || !e.items || !e.items.length) { g.n.push(x); return; }
            var grp = nwDayGroup(e.items[0].date);
            (grp === 0 ? g.s : grp === 1 ? g.v : g.r).push(x);
        });
        var dOf = function (x) { var e = newsHtmlCache[x.tk]; return (e && e.items && e.items[0]) ? e.items[0].date : 0; };
        var by = function (a, b) { return dOf(b) - dOf(a); };
        var out = '', left = NW_FEED_MAX;
        var sect = function (t, arr, quiet) {
            if (!arr.length || left <= 0) return;
            var take = arr.slice(0, left); left -= take.length;
            out += '<div class="nwd-day' + (quiet ? ' quiet' : '') + '"><b>' + t + '</b></div>' +
                take.map(function (x) { return nwRowHtml(x); }).join('');
        };
        sect('Сегодня', g.s.sort(by)); sect('Вчера', g.v.sort(by)); sect('Ранее', g.r.sort(by), true);
        sect('Пока без новостей', g.n, true); sect('Загружается', g.l, true);
        return '<div class="nwd-list">' + out + '</div>';
    }
    function nwZeroHtml() {
        return '<div class="nws-zero"><div class="zt">Вы в курсе всего</div>' +
            '<div class="zs">Новых новостей по бумагам портфелей нет — последние прочитанные ниже.</div></div>';
    }
    // следующая бумага с непрочитанным (для автоперехода плеера и подсказки «дальше — …»)
    function nwNextUnreadTk(exceptTk) {
        var c = nwStripOrder(pfdNewsList()).filter(function (x) { return x.tk !== exceptTk && nwUnreadOf(x.tk).length; })[0];
        return c ? c.tk : null;
    }
    // плеер: сегменты = снапшот непрочитанного бумаги на момент открытия (индексы стабильны)
    function nwPlayerHtml() {
        var tk = nwView.tk, list = nwView.list || [];
        if (!list.length) return '';
        var idx = nwView.idx = Math.max(0, Math.min(nwView.idx || 0, list.length - 1));
        var it = list[idx];
        var segs = list.map(function (_, i) { return '<i class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '"></i>'; }).join('');
        var x = pfdNewsList().filter(function (r) { return r.tk === tk; })[0] || {};
        var nxt = nwNextUnreadTk(tk);
        return '<div class="nwp">' +
            '<div class="nwp-segs">' + segs + '</div>' +
            '<div class="nwp-head"><span class="nwp-ava">' + esc(tk.charAt(0)) + '</span>' +
                '<b>' + esc(tk) + '</b><span class="nwp-nm">' + esc(nwCoName(tk)) + '</span>' + nwChgHtml(x.chg, 'nwp-chg') +
                '<button type="button" class="nwp-x" onclick="pfdNwFeed()" title="Закрыть (Esc)">×</button></div>' +
            '<div class="nwp-t">' + esc(it.t) + '</div>' +
            '<div class="nwd-meta nwp-meta"><i>Smart-Lab</i><em>' + esc(it.rel || '') + '</em></div>' +
            '<div class="nwp-foot">' +
                (it.link ? '<button type="button" class="nwp-cta" onclick="pfdNwOpenCur()">Читать на Smart-Lab' + PFNW_GO_SVG + '</button>' : '') +
                '<span class="nwp-cnt">' + (idx + 1) + ' из ' + list.length + '</span>' +
                (nxt ? '<span class="nwp-next">дальше —&nbsp;<span class="nwp-ava mini">' + esc(nxt.charAt(0)) + '</span>' + esc(nxt) + '</span>' : '') +
            '</div>' +
            '<button type="button" class="nwp-nav l" onclick="pfdNwPrev()" aria-label="Предыдущая новость">' + NW_CHEV_L_SVG + '</button>' +
            '<button type="button" class="nwp-nav r" onclick="pfdNwNext()" aria-label="Следующая новость">' + NW_CHEV_R_SVG + '</button>' +
        '</div>';
    }
    // фокус бумаги: только все её новости (график/позиция/кнопки убраны по замечанию
    // 2026-07-22 — детали открывает клик по тикеру, это карточка компании)
    function nwFocusHtml() {
        var tk = nwView.tk, e = newsHtmlCache[tk], now = Date.now(), rs = nwReadSet();
        var x = pfdNewsList().filter(function (r) { return r.tk === tk; })[0] || {};
        var rows;
        if (e && !e.none && e.items && e.items.length) {
            rows = e.items.map(function (it, i) {
                var rd = !it.link || rs[it.link] || !(it.date && now - it.date < NW_FRESH_MS);
                return '<div class="nwf-row' + (rd ? ' read' : '') + '"' +
                    (it.link ? ' role="link" onclick="pfdNwOpenItem(\'' + jsArg(tk) + '\',' + i + ')"' : '') + '>' +
                    (rd ? '' : '<span class="nws-dot"></span>') +
                    '<div class="nwd-nt">' + esc(it.t) + '</div>' +
                    '<div class="nwd-meta"><i>Smart-Lab</i><em>' + esc(it.rel || '') + '</em>' + (it.link ? PFNW_GO_SVG : '') + '</div></div>';
            }).join('');
        } else {
            rows = '<div class="pfnw-empty">' + (e ? 'Свежих новостей по бумаге нет.' : 'Загружаем новости…') + '</div>';
        }
        return '<div class="nwf-h"><button type="button" class="nwf-tk" onclick="pfOpenTicker(\'' + jsArg(tk) + '\')" title="Открыть карточку компании">' + esc(tk) + '</button>' +
            '<span class="nwf-nm">' + esc(nwCoName(tk)) + '</span>' + nwChgHtml(x.chg, 'nwf-chg') + '</div>' +
            '<div class="nwd-list">' + rows + '</div>';
    }
    function pfdNewsHtml() {
        var list = pfdNewsList();
        // кнопки конструктора — в потоке шапки ПЕРЕД «+» (news в PFD_OWN_CHROME):
        // без своей пары кнопок виджет стало бы нечем настроить и удалить
        var head = PF.pfCardHead('', 'Новости по позициям', '',
            pfdInChromeHtml('news') +
            '<button class="pff-add" onclick="pfdNewsAddToggle()" title="Добавить тикер не из портфеля" aria-label="Добавить тикер">' + PFD_PLUS_SVG + '</button>');
        if (!list.length && !pfdNewsAdding) {
            return '<div class="dash2-card pf-card2 pf-newsblk">' + head +
                '<div class="pfnw-body" data-skey="posnews"><div class="pfnw-empty">Добавьте акции в портфель — или введите любой тикер по кнопке «+» справа.</div></div></div>';
        }
        // выбранная бумага могла исчезнуть из списка — назад к ленте
        if (nwView.mode !== 'feed' && !list.some(function (x) { return x.tk === nwView.tk; })) nwView = { mode: 'feed' };
        var un = nwTotalUnread(list);
        var body;
        if (nwView.mode === 'player') body = nwPlayerHtml() || nwFeedHtml(list);
        else if (nwView.mode === 'focus') body = nwFocusHtml();
        else body = (un ? '' : nwZeroHtml()) + nwFeedHtml(list);
        return '<div class="dash2-card pf-card2 pf-newsblk">' + head +
            (nwView.mode === 'feed' ? nwBarHtml(un) : '') +
            nwStripHtml(list) +
            '<div class="pfnw-body" data-skey="posnews">' + body + '</div></div>';
    }
    var PFNW_GO_SVG = '<svg class="nwd-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><polyline points="8 7 17 7 17 16"/></svg>';
    var NW_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var NW_CHEV_L_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    var NW_CHEV_R_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    // --- действия Д2 ---
    window.pfdNwFeed = function () { clearTimeout(nwReadTimer); nwView = { mode: 'feed' }; pfdNewsRepaint(); };
    window.pfdNwFocus = function (tk) { clearTimeout(nwReadTimer); nwView = { mode: 'focus', tk: tk }; pfdNewsRepaint(); };
    // клик по кольцу: есть непрочитанное — плеер, нет — фокус
    window.pfdNwRing = function (tk) {
        var un = nwUnreadOf(tk);
        if (!un.length) { window.pfdNwFocus(tk); return; }
        nwView = { mode: 'player', tk: tk, idx: 0, list: un };
        pfdNewsRepaint();
    };
    window.pfdNwPrev = function () {
        if (nwView.mode !== 'player' || !(nwView.idx > 0)) return;
        nwView.idx--; pfdNewsRepaint();
    };
    window.pfdNwNext = function () {
        if (nwView.mode !== 'player') return;
        if (nwView.idx + 1 < nwView.list.length) { nwView.idx++; pfdNewsRepaint(); return; }
        var cur = nwView.list[nwView.idx];          // долистал до конца — последняя тоже прочитана
        if (cur) nwMarkRead(cur.link);
        var nxt = nwNextUnreadTk(nwView.tk);
        if (nxt) window.pfdNwRing(nxt); else window.pfdNwFeed();
    };
    window.pfdNwOpenCur = function () {
        if (nwView.mode !== 'player') return;
        var it = nwView.list[nwView.idx];
        if (!it || !it.link) return;
        nwMarkRead(it.link); nwPatchStrip();
        window.pfdNewsOpenLink(it.link);
    };
    window.pfdNwOpenRow = function (tk) {
        var e = newsHtmlCache[tk], it = e && e.items && e.items[0];
        if (!it || !it.link) return;
        var was = nwMarkRead(it.link);
        window.pfdNewsOpenLink(it.link);
        if (was) pfdNewsRepaint();
    };
    window.pfdNwOpenItem = function (tk, i) {
        var e = newsHtmlCache[tk], it = e && e.items && e.items[i];
        if (!it || !it.link) return;
        var was = nwMarkRead(it.link);
        window.pfdNewsOpenLink(it.link);
        if (was) pfdNewsRepaint();
    };
    // «Прочитать всё»: bulk-запись, мягкий тост (действие не разрушительное — без модалки)
    window.pfdNwReadAll = function () {
        var now = Date.now(), n = 0;
        pfdNewsTickers().forEach(function (tk) {
            var e = newsHtmlCache[tk];
            ((e && e.items) || []).forEach(function (it) {
                if (it.link && it.date && now - it.date < NW_FRESH_MS && nwMarkRead(it.link)) n++;
            });
        });
        if (n) toast('Все новости отмечены прочитанными');
        pfdNewsRepaint();
    };
    // точечно обновить полосу (кольца/бейджи) без полного репейнта — не дёргаем плеер
    function nwPatchStrip() {
        var card = document.querySelector('#pfWrap .pf-newsblk'); if (!card) return;
        var s = card.querySelector('.nws-strip'); if (!s) return;
        var tmp = document.createElement('div'); tmp.innerHTML = nwStripHtml(pfdNewsList());
        s.parentNode.replaceChild(tmp.firstChild, s);
    }
    // «показ ≥2с = прочитано»: взводится при каждом рендере плеера (renderPosNews)
    function nwArmReadTimer() {
        clearTimeout(nwReadTimer);
        if (nwView.mode !== 'player') return;
        var it = (nwView.list || [])[nwView.idx];
        if (!it || !it.link || nwReadSet()[it.link]) return;
        nwReadTimer = setTimeout(function () {
            if (nwView.mode !== 'player' || (nwView.list || [])[nwView.idx] !== it) return;
            nwMarkRead(it.link); nwPatchStrip();
        }, 2000);
    }
    // клавиатура плеера: ←/→ — новости, Esc — закрыть, Enter — открыть ссылку
    document.addEventListener('keydown', function (ev) {
        if (nwView.mode !== 'player' || !document.querySelector('#pfWrap .pf-newsblk .nwp')) return;
        var tg = ev.target, tag = tg && tg.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (tg && tg.isContentEditable)) return;
        if (ev.key === 'Enter' && tag === 'BUTTON') return;   // Enter по кнопке = её клик, не наш
        if (ev.key === 'Escape') { ev.preventDefault(); window.pfdNwFeed(); }
        else if (ev.key === 'ArrowLeft') { ev.preventDefault(); window.pfdNwPrev(); }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); window.pfdNwNext(); }
        else if (ev.key === 'Enter') { ev.preventDefault(); window.pfdNwOpenCur(); }
    });
    window.pfdNewsAddToggle = function () { pfdNewsAdding = !pfdNewsAdding; pfdNewsRepaint(); if (pfdNewsAdding) setTimeout(function () { var i = document.querySelector('#pfWrap .pfnw-addinput'); if (i) i.focus(); }, 30); };
    function pfdNewsCommitAdd(val) {
        var tk = String(val || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        pfdNewsAdding = false;
        if (tk.length >= 2 && pfdNewsCustom.indexOf(tk) < 0) {
            pfdNewsCustom.push(tk);
            nwView = { mode: 'focus', tk: tk };   // сразу к новостям добавленной бумаги
        }
        pfdNewsRepaint();
    }
    window.pfdNewsAddKey = function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); pfdNewsCommitAdd(ev.target.value); }
        else if (ev.key === 'Escape') { ev.preventDefault(); pfdNewsAdding = false; pfdNewsRepaint(); }
    };
    window.pfdNewsAddBlur = function (el) { if (!pfdNewsAdding) return; if (String(el.value || '').trim()) pfdNewsCommitAdd(el.value); else { pfdNewsAdding = false; pfdNewsRepaint(); } };
    window.pfdNewsDelCustom = function (tk) {
        pfdNewsCustom = pfdNewsCustom.filter(function (t) { return t !== tk; });
        if (nwView.mode !== 'feed' && nwView.tk === tk) nwView = { mode: 'feed' };
        pfdNewsRepaint();
    };
    function pfdNewsRepaint() {
        var card = document.querySelector('#pfWrap .pf-newsblk'); if (!card) return;
        var tmp = document.createElement('div'); tmp.innerHTML = pfdNewsHtml();
        card.parentNode.replaceChild(tmp.firstChild, card);
        renderPosNews(); pfdRepackSoon();
    }
    window.pfdNewsOpenLink = function (link) { if (typeof openExternalLink === 'function') openExternalLink(link); else window.open(link, '_blank'); };
    // Новость по тикеру доехала (общий пайплайн «Избранного» зовёт нас из fillNewsSlot):
    // строки ленты живут в группах дней, поэтому точечного слота нет — дебаунсим полный
    // репейнт. Открытый плеер не трогаем (листание не сбивается) — ему хватает полосы.
    function fillPosNewsSlot(tk) {
        if (!document.querySelector('#pfWrap .pf-newsblk')) return;
        clearTimeout(nwRepaintT);
        nwRepaintT = setTimeout(function () {
            if (nwView.mode === 'player') { nwPatchStrip(); return; }
            pfdNewsRepaint();
        }, 150);
    }
    function renderPosNews() {
        if (!document.querySelector('#pfWrap .pf-newsblk') || typeof loadNewsForTicker !== 'function') return;
        pfdNewsTickers().forEach(function (tk) {
            if (newsHtmlCache[tk] || newsStarted[tk]) return;
            newsStarted[tk] = true; newsQueue.push(tk);
        });
        setTimeout(pumpNewsQueue, newsActive ? 0 : 400);
        nwArmReadTimer();
    }

    // ---- «Заметки»: мультиблок; у каждой цвет-точка, строки (текст/пункт/задача) и срок ----
    var pfdNoteT = null;
    var NOTE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/><path d="M8.5 13.5h7"/><path d="M8.5 17h5"/></svg>';
    var NOTE_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var NOTE_X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    var NOTE_CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    var NOTE_TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    // иконки заливки: кант слева (рамка + жирная левая грань) | залить всю карточку (заполненный прямоугольник)
    var NOTE_FILL_EDGE_SVG = '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="5" width="4.5" height="14" rx="1.6" fill="currentColor"/></svg>';
    var NOTE_FILL_FULL_SVG = '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2.5" fill="currentColor"/></svg>';
    var NOTE_FILL_NONE_SVG = '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"/></svg>';
    var NOTE_CHEV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    function pfdNoteRowHtml(nid, it) {
        var type = (it.type === 'bullet' || it.type === 'check') ? it.type : 'text';
        var mark = type === 'check'
            ? '<button type="button" class="pfnt-check' + (it.done ? ' on' : '') + '" tabindex="-1" onclick="pfdNoteToggle(\'' + jsArg(nid) + '\',\'' + jsArg(it.id) + '\',event)" aria-label="Отметить выполненной">' + NOTE_CHECK_SVG + '</button>'
            : (type === 'bullet' ? '<span class="pfnt-dash" aria-hidden="true"></span>' : '');
        var ph = type === 'check' ? 'Задача…' : (type === 'bullet' ? 'Пункт…' : 'Текст заметки…');
        return '<div class="pfnt-row pfnt-row--' + type + (it.done ? ' done' : '') + '" data-iid="' + esc(it.id) + '" data-type="' + type + '">' +
            mark +
            '<div class="pfnt-tx" contenteditable="true" role="textbox" data-ph="' + attr(ph) + '" ' +
                'oninput="pfdNoteRowInput(\'' + jsArg(nid) + '\',\'' + jsArg(it.id) + '\',this)" ' +
                'onkeydown="pfdNoteRowKey(event,\'' + jsArg(nid) + '\',\'' + jsArg(it.id) + '\')">' + esc(it.text || '') + '</div>' +
            '<button type="button" class="pfnt-del" tabindex="-1" onclick="pfdNoteDelItem(\'' + jsArg(nid) + '\',\'' + jsArg(it.id) + '\',event)" aria-label="Удалить строку" title="Удалить строку">' + NOTE_X_SVG + '</button>' +
        '</div>';
    }
    // Срок — не форма на всю ширину, а ФРАЗА в пилюле: «срок 2 сентября ·
    // осталось 34 дня» (мокап overview3, экран заметки). Часы-иконку убрали:
    // слово «срок» говорит то же самое и не спорит с цветным значком шапки.
    function pfdNoteDueHtml(nt) {
        var chip;
        if (nt.due == null) {
            chip = '<button type="button" class="pfnt-due pfnt-due-empty" onclick="pfdCalOpen(\'' + jsArg(nt.id) + '\',event)" aria-label="Задать срок выполнения">' +
                '<span class="pfnt-due-ic">' + NOTE_CLOCK_SVG + '</span>поставить срок</button>';
        } else {
            var cd = pfdDueCountdown(nt.due);
            chip = '<div class="pfnt-due set ' + cd.cls + '">' +
                '<button type="button" class="pfnt-due-main" onclick="pfdCalOpen(\'' + jsArg(nt.id) + '\',event)" title="Изменить срок">' +
                    'срок <b>' + esc(pfdDueText(nt)) + '</b> · ' +
                    '<em class="pfnt-cd" data-due="' + nt.due + '">' + esc(cd.txt) + '</em></button>' +
                '<button type="button" class="pfnt-due-clr" onclick="pfdNoteClearDue(\'' + jsArg(nt.id) + '\',event)" aria-label="Убрать срок" title="Убрать срок">' + NOTE_X_SVG + '</button>' +
            '</div>';
        }
        // .pfnt-cal — контейнер СВОЕГО календаря-поповера (наполняется при открытии, поверх контента).
        // onclick=stopPropagation на КОНТЕЙНЕРЕ (он переживает ре-рендер innerHTML при выборе дня/
        // пресета, в отличие от самой кнопки) — иначе всплывший клик долетал до общего обработчика
        // document, а detached-кнопка теряла closest('.pfnt-duewrap') и календарь тут же закрывался.
        return '<div class="pfnt-duewrap">' + chip +
            '<div class="pfnt-cal" data-nid="' + esc(nt.id) + '" onclick="event.stopPropagation()"></div></div>';
    }
    function pfdNoteHtml(nt) {
        var color = PFD_NOTE_COLORS.indexOf(nt.color) >= 0 ? nt.color : 'amber';
        // 'none' — полноправное значение (см. pfdNormNote): без него сохранённая заливка
        // «Без линии» на каждом ре-рендере откатывалась в 'edge' (кант возвращался сам), а
        // pfdSetNoteFill(id,'none') молча выходил по nt.fill === fill — «с первого раза не ставится»
        var fill = (nt.fill === 'full' || nt.fill === 'none') ? nt.fill : 'edge';
        var PFD_COLOR_NAMES = { slate: 'Серый', blue: 'Синий', green: 'Зелёный', amber: 'Жёлтый', violet: 'Фиолетовый', rose: 'Розовый' };
        var sw = PFD_NOTE_COLORS.map(function (c) {
            return '<button type="button" class="pfnt-sw' + (c === color ? ' on' : '') + '" data-c="' + c + '" style="--sw:var(--nt-' + c + ')" title="' + attr(PFD_COLOR_NAMES[c] || c) + '" aria-label="' + attr(PFD_COLOR_NAMES[c] || c) + '" onclick="pfdSetNoteColor(\'' + jsArg(nt.id) + '\',\'' + c + '\',event)"></button>';
        }).join('');
        // палитра-поповер: секция «Цвет» (свотчи) + секция «Заливка» (кант | вся карточка) с подписями
        var fills = '<span class="pfnt-pop-fills">' +
            '<button type="button" class="pfnt-fillb' + (fill === 'edge' ? ' on' : '') + '" data-f="edge" title="Цветной кант слева" onclick="pfdSetNoteFill(\'' + jsArg(nt.id) + '\',\'edge\',event)">' + NOTE_FILL_EDGE_SVG + '<span>Кант</span></button>' +
            '<button type="button" class="pfnt-fillb' + (fill === 'full' ? ' on' : '') + '" data-f="full" title="Залить всю карточку" onclick="pfdSetNoteFill(\'' + jsArg(nt.id) + '\',\'full\',event)">' + NOTE_FILL_FULL_SVG + '<span>Вся карточка</span></button>' +
            '<button type="button" class="pfnt-fillb' + (fill === 'none' ? ' on' : '') + '" data-f="none" title="Чистая карточка без цветной линии" onclick="pfdSetNoteFill(\'' + jsArg(nt.id) + '\',\'none\',event)">' + NOTE_FILL_NONE_SVG + '<span>Без линии</span></button>' +
        '</span>';
        // шапка: единый цветной значок-иконка (он же выбор цвета — палитра-поповер),
        // РЕДАКТИРУЕМЫЙ заголовок (клик → инпут, как у портфеля), справа — удалить + «+»
        var titleTxt = (nt.name && nt.name.trim()) ? nt.name : 'Заметка';
        var head = '<div class="pf-ch pfnt-head">' +
            '<div class="pf-ch-l">' +
                '<span class="pfnt-colorwrap">' +
                    '<button type="button" class="pfnt-badge" onclick="pfdNoteClrToggle(\'' + jsArg(nt.id) + '\',event)" aria-label="Цвет заметки" title="Цвет и заливка">' + NOTE_ICON_SVG + '</button>' +
                    '<span class="pfnt-colorpop' + (pfdNoteClrOpen === nt.id ? ' open' : '') + '">' +
                        '<span class="pfnt-pop-sec">Цвет</span><span class="pfnt-pop-row">' + sw + '</span>' +
                        '<span class="pfnt-pop-sec">Заливка</span>' + fills +
                    '</span>' +
                '</span>' +
                '<span class="pfnt-title" title="Нажмите, чтобы переименовать" onclick="pfdNoteNameEdit(\'' + jsArg(nt.id) + '\',event)">' + esc(titleTxt) + '</span>' +
            '</div>' +
            '<span class="pfnt-head-r">' +
                '<button type="button" class="pfnt-trash" onclick="pfdNoteDelete(\'' + jsArg(nt.id) + '\',event)" aria-label="Удалить заметку" title="Удалить заметку">' + NOTE_TRASH_SVG + '</button>' +
                '<button type="button" class="pff-add pfnt-plus" onclick="pfdAddNote()" aria-label="Новая заметка" title="Добавить ещё одну заметку">' + PFD_PLUS_SVG + '</button>' +
            '</span>' +
        '</div>';
        var rows = (nt.items || []).map(function (it) { return pfdNoteRowHtml(nt.id, it); }).join('');
        // Метка кнопки — сам знак строки (¶ — ☐) моноширинным, а не иконка: знак
        // ОДИН к одному повторяет то, что появится в списке, и рисовать его
        // отдельной картинкой незачем (мокап overview3: .note-tb b > i).
        function tb(type, glyph, label, title) {
            return '<button type="button" class="pfnt-tb" onclick="pfdNoteAddItem(\'' + jsArg(nt.id) + '\',\'' + type + '\')" title="' + attr(title) + '">' +
                '<i>' + glyph + '</i>' + label + '</button>';
        }
        var toolbar = '<div class="pfnt-toolbar">' +
            tb('text', '¶', 'Текст', 'Абзац текста') +
            tb('bullet', '—', 'Пункт', 'Пункт списка (—)') +
            tb('check', '☐', 'Задача', 'Задача с чекбоксом') +
        '</div>';
        return '<div class="dash2-card pf-card2 pf-noteblk pfnt-c-' + color + ' pfnt-fill-' + fill + '" data-nid="' + esc(nt.id) + '">' +
            head +
            '<div class="pfnt-list">' + rows + '</div>' +
            toolbar +
            pfdNoteDueHtml(nt) +
        '</div>';
    }


    // ---- избранное (актив · потенциал · новость) ----
    function favTickers() { try { return (typeof window.stkGetFavorites === 'function') ? window.stkGetFavorites() : (JSON.parse(localStorage.getItem('stk_fav_v1')) || []); } catch (e) { return []; } }
    function potentialOf(tk) {
        if (typeof window.stkFindCompany !== 'function') return null;
        var co = window.stkFindCompany(tk); if (!co || !co.main) return null;
        var n = toNum(co.main['ОДХС']); if (!isFinite(n)) return null; return n;
    }
    // пояснение «что такое потенциал» (показывается инфо-иконкой в карточке «Избранное»)
    var POT_TIP = 'Потенциал (ОДХС) — оценка недооценённости: на сколько процентов справедливая цена выше (или ниже) текущей. ' +
        'Плюс = есть запас роста, минус = бумага уже переоценена. Это ориентир, а не гарантия — рассчитан по модели, рынок может думать иначе.';
    // Показанные плитки избранного: топ-12 по потенциалу. ЕДИНЫЙ список для favHtml и
    // renderFavNews — раньше новости грузились для первых 12 тикеров ИЗ ХРАНИЛИЩА (без
    // сортировки), и при >12 избранных часть видимых плиток (например SBER/VTBR) вечно
    // висела в «загрузка новости…», т.к. их просто не было в очереди загрузки.
    // Пул для загрузки новостей — топ-12 по потенциалу (НЕ грузим новости по всем избранным:
    // Apps Script медленный, см. очередь newsQueue). Порядок пула стабилен независимо от фильтра.
    function favPool() {
        return favTickers().slice().sort(function (a, b) {
            var pa = potentialOf(a), pb = potentialOf(b);
            if (pa == null && pb == null) return 0;
            if (pa == null) return 1; if (pb == null) return -1;
            return pb - pa;
        }).slice(0, 12);
    }
    var favSort = 'pot';   // 'pot' — по потенциалу (наибольший сверху) | 'news' — по свежести новости
    function newsDateOf(tk) { var e = newsHtmlCache[tk]; return (e && e.date) ? e.date : 0; }
    // Отображаемый список = тот же пул, при фильтре «по новизне» переупорядочен по дате новости
    // (свежие сверху; у кого новость ещё не загружена — в конце, сохраняя порядок по потенциалу).
    function favShown() {
        var pool = favPool();
        if (favSort === 'news') pool = pool.slice().sort(function (a, b) { return newsDateOf(b) - newsDateOf(a); });
        return pool;
    }
    // Монограмма вместо логотипа (источника логотипов компаний нет): первая буква
    // тикера на цветном круге, цвет детерминирован из тикера — стабилен между рендерами
    var FAV_LOGO_COLORS = ['#1d4ed8', '#16a34a', '#7c3aed', '#334155', '#b45309', '#0e7490', '#be185d', '#4d7c0f'];
    function favLogoColor(tk) {
        var h = 0; for (var i = 0; i < tk.length; i++) h = (h * 31 + tk.charCodeAt(i)) % 997;
        return FAV_LOGO_COLORS[h % FAV_LOGO_COLORS.length];
    }
    // Раздел «Из „Расчёта"» (облигации по доходности и акции по потенциалу) удалён
    // 2026-08-04 по просьбе владельца: «Избранное» — про то, что человек отметил
    // сам, а подбор живёт на вкладке «Расчёт». Вместе с разделом ушли favCalcBonds,
    // favCalcStocks и favCalcRowsHtml — своих расчётов у виджета не осталось.
    // заголовок раздела внутри виджета: имя · пояснение · переход
    function favSecHtml(title, sub, go) {
        return '<div class="pff-sec"><b>' + title + '</b><span>' + sub + '</span>' +
            (go ? '<span class="go" onclick="' + go.onclick + '">' + esc(go.label) + ' ›</span>' : '') + '</div>';
    }
    var FAV_STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    function favHtml(showHide) {
        if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }
        var favs = favShown();
        var inner;
        if (!favs.length) {
            inner = '<div class="pff-empty"><div class="pff-empty-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>' +
                '<div class="pff-empty-t">Нет избранных акций</div>' +
                '<div class="pff-empty-s">Отмечайте акции звёздочкой в разделе «Рынок · Акции» — здесь появятся их потенциал и свежие новости.</div></div>';
        } else {
            // R10 (мокап fav-mockups, утверждён 2026-07-22): строки-КАРТОЧКИ с воздухом —
            // монограмма + тикер/имя | новость (заголовок + пилюля источника + дата) |
            // потенциал моно-цифрой со стрелкой + спарклайн 30 дней (MOEX ISS).
            // Лидер по потенциалу — бейдж «Топ 1» + лёгкая зелёная подложка, БЕЗ зелёной
            // обводки/канта (замечание к мокапу). В узком виджете (<460px контейнера)
            // спарклайн скрыт, потенциал в строке тикера — см. @container в CSS.
            // «Купить» — тот же короткий путь, что из строки «Рынок · Акции»:
            // считаем предикат ОДИН раз на карточку, а не на каждую строку
            var canBuy = !!(window.brokerApi && window.brokerApi.canTrade() && PF.pftBuyTicker);
            inner = '<div class="pff-grid pff2-list pff3-list">' + favs.map(function (tk, i) {
                var co = (typeof window.stkFindCompany === 'function') ? window.stkFindCompany(tk) : null;
                var name = co && co.name ? co.name : tk;
                var pot = potentialOf(tk);
                var dir = pot == null ? 'mut' : (pot >= 0 ? 'pos' : 'neg');
                // Стрелки у числа в мокапе нет — знак несёт сам «+/−» и цвет
                var potHtml = pot == null ? '<span class="pff-pot muted">—</span>'
                    : '<span class="pff-pot ' + (pot >= 0 ? 'pos' : 'neg') + '">' + fmtPct(pot) + '</span>';
                // «Топ 1» — только при сортировке «Потенциал», только у первой строки
                // и только при положительном потенциале; при «Новизне» бейджа нет
                var top1 = favSort === 'pot' && i === 0 && pot != null && pot > 0;
                var buy = canBuy
                    ? '<button class="pff-buy" onclick="pfBuyFav(\'' + jsArg(tk) + '\', event)" ' +
                        'title="Открыть тикет на покупку в терминале — заявка не отправляется">Купить</button>'
                    : '';
                return '<div class="pff-tile pff3-row' + (top1 ? ' pff3-top1' : '') + '">' +
                    '<div class="pff3-line">' +
                        '<button class="pff-id pff3-id" onclick="pfOpenTicker(\'' + jsArg(tk) + '\')" title="Открыть карточку компании">' +
                            '<span class="pff3-logo" style="background:' + favLogoColor(tk) + '">' + esc(tk.charAt(0)) + '</span>' +
                            '<span class="pff3-idt"><span class="pff-tk">' + esc(tk) + '</span><span class="pff-nm">' + esc(name) + '</span>' +
                                // «Топ 1» — пилюлей ВНУТРИ ячейки тикера (мокап .fv3-top),
                                // а не отдельным этажом над строкой
                                (top1 ? '<span class="pff3-top">Топ 1</span>' : '') +
                            '</span>' +
                        '</button>' +
                        '<div class="pff-news pff3-news" id="pf-news-' + esc(tk) + '"><div class="pff-news-inner"><span class="pff-news-load">загрузка новости…</span></div></div>' +
                        '<div class="pff3-pot">' + potHtml + '<span class="pff3-potl">потенциал</span></div>' +
                        // слот спарклайна заполняет renderFavSparks (кэш на сессию);
                        // класс знака красит линию в цвет потенциала. Своя колонка
                        // сетки (мокап .fv3-sp), а не довесок под числом
                        '<span class="pff3-spark ' + dir + '" id="pf-spk-' + esc(tk) + '"></span>' +
                    '</div>' +
                    // «Купить» и корзина — по hover строки, поверх декоративного спарклайна
                    // (число потенциала остаётся видно); раскрытие кнопок — базовые правила
                    // .pff-tile:hover .pff-buy/.pff-del из portfolios.css
                    '<div class="pff3-act">' + buy +
                        '<button class="pff-del" onclick="pfRemoveFav(\'' + jsArg(tk) + '\', event)" title="Убрать из избранного" aria-label="Убрать из избранного">' + NOTE_TRASH_SVG + '</button>' +
                    '</div>' +
                '</div>';
            }).join('') + '</div>';
        }
        // РАЗДЕЛА «ИЗ РАСЧЁТА» БОЛЬШЕ НЕТ (просьба 2026-08-04): виджет про то, что
        // человек отметил сам; подбор «Расчёта» живёт на своей вкладке и здесь
        // только удваивал длину карточки. Вместе с ним ушли favCalcBonds/
        // favCalcStocks/favCalcRowsHtml и строки .pff-cx.
        var mySec = favs.length
            ? favSecHtml('Мои звёздочки', 'отмечены в «Рынок · Акции»',
                { label: 'Все акции', onclick: "pfGoTerminal(event)" })
            : '';
        return '<div class="dash2-card pf-card2 pf-fav">' +
            PF.pfCardHead(favs.length, 'Избранное',
                'потенциал и свежая новость по вашим бумагам',
                // «+» → терминал стоит НАПРОТИВ заголовка (голый плюс, без плашки).
                // R9.3: шестерёнка и корзина конструктора — СЛЕВА от «+», в потоке шапки
                // (PFD_OWN_CHROME). Угловой оверлей ложился ровно на «+» (замерено: обе
                // кнопки 408-459 против «+» 428-452). Корзина заменила прежний глаз
                // .pff-hide — действие то же (pfdHideBlock), но пара «настройки+удалить»
                // такая же, как у всех виджетов конструктора.
                (showHide ? pfdInChromeHtml('fav') : '') +
                // Контрол виджета — сортировка (мокап, экран 13). Прежняя строка
                // .pff3-bar между шапкой и списком была отдельным этажом хрома ни
                // для чего.
                '<div class="pff-sort" role="tablist">' +
                    '<button class="pff-sort-b' + (favSort === 'pot' ? ' on' : '') + '" onclick="pfSetFavSort(\'pot\')" title="Сначала с наибольшим потенциалом">По потенциалу</button>' +
                    '<button class="pff-sort-b' + (favSort === 'news' ? ' on' : '') + '" onclick="pfSetFavSort(\'news\')" title="Сначала со свежими новостями">По свежести</button>' +
                '</div>' +
                // «+» → терминал, в самом углу (возвращён 2026-08-04: пропал вместе
                // с приходом сегмента сортировки и был нужен — это единственный
                // короткий путь «добавить бумагу в избранное» из виджета)
                '<button class="pff-add" type="button" onclick="pfGoTerminal(event)" aria-label="Открыть терминал"' +
                    ' title="Открыть «Рынок · Акции» — отметить бумагу звёздочкой">' + PFD_PLUS_SVG + '</button>') +
            '<div class="pff-body" data-skey="fav">' + mySec + inner + '</div>' +
            // пояснение «что такое потенциал» переехало в подвал: оно про колонку
            // чисел, а не про действие, и в шапке занимало место контрола
            PF.pfCardFoot('<span class="pff-info-wrap"><button class="pff-info" type="button" aria-label="Что такое потенциал">' + PF.INFO_SVG +
                    '<span>Что такое потенциал?</span></button>' +
                    '<span class="pff-tipbox" role="tooltip">' + esc(POT_TIP) + '</span></span>', '',
                { label: 'Все акции', onclick: "pfGoTerminal(event)" }) +
        '</div>';
    }
    // Готовый HTML новости + ссылку складываем в кэш (новость = клик по ссылке, не карточка)
    function buildNewsEntry(news) {
        if (!news || !news.length) return { html: '<span class="pff-news-none">нет свежих новостей</span>', link: '', none: true, items: [] };
        // ВЕСЬ массив (до 8) — для «Новостей по позициям» Д2 (плеер/фокус/прочитанность);
        // «Избранное» по-прежнему использует поля первой новости ниже
        var items = news.slice(0, 8).map(function (n) {
            var nd = new Date(n.date), bad = isNaN(nd.getTime());
            var nrel = (typeof getRelativeDateText === 'function' && !bad) ? getRelativeDateText(nd)
                : (bad ? '' : nd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
            var nt = String(n.title || '');
            return { t: nt.slice(0, 300) + (nt.length > 300 ? '…' : ''), link: n.link || '', date: bad ? 0 : nd.getTime(), rel: nrel };
        }).filter(function (n) { return n.t; });
        var item = news[0], d = new Date(item.date);
        var rel = (typeof getRelativeDateText === 'function' && !isNaN(d.getTime())) ? getRelativeDateText(d)
            : (isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
        // заголовок целиком (в свёрнутом виде CSS обрезает в 1 строку, на ховере показывается полностью)
        var full = String(item.title || ''), title = full.slice(0, 300);
        var link = item.link || '';
        var go = link ? '<svg class="pff-news-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><polyline points="8 7 17 7 17 16"/></svg>' : '';
        // title/rel/src — для предпросмотра «Новостей по позициям» (оверлей), html — для «Избранного»
        // источник — отдельной пилюлей, дата — рядом: раньше оба были простым текстом
        // через « · », и источник, будучи цветным и жирным, читался как часть заголовка
        return { html: '<span class="pff-news-t">' + esc(title) + (full.length > 300 ? '…' : '') + '</span>' +
            '<span class="pff-news-m"><i>Smart-Lab</i>' + (rel ? '<em>' + esc(rel) + '</em>' : '') + go + '</span>', link: link,
            title: title + (full.length > 300 ? '…' : ''), rel: rel, src: 'Smart-Lab',
            date: isNaN(d.getTime()) ? 0 : d.getTime(),   // для сортировки избранного «по свежести»
            items: items };                               // все новости тикера — для Д2
    }
    function fillNewsSlot(tk) {
        // новость по тикеру может ждать и блок «Новости по позициям» (конструктор)
        if (typeof fillPosNewsSlot === 'function') fillPosNewsSlot(tk);
        var slot = dq('pf-news-' + tk), e = newsHtmlCache[tk]; if (!slot || !e) return;
        slot.innerHTML = '<div class="pff-news-inner">' + e.html + '</div>';
        slot.classList.toggle('is-none', !!e.none);   // маркер «новости нет» (разворот на ховере идёт только у .link)
        if (e.link) {
            slot.classList.add('link'); slot.setAttribute('role', 'link');
            slot.onclick = function (ev) { ev.stopPropagation(); if (typeof openExternalLink === 'function') openExternalLink(e.link); else window.open(e.link, '_blank'); };
        } else { slot.classList.remove('link'); slot.onclick = null; }
        pfFavFitSoon();   // высота строки могла дрогнуть — пересчитать, что влезает целиком
    }
    function pumpNewsQueue() {
        while (newsActive < 2 && newsQueue.length) {
            var tk = newsQueue.shift(); newsActive++;
            (function (tk) {
                Promise.resolve(loadNewsForTicker(tk))
                    .then(function (news) { newsHtmlCache[tk] = buildNewsEntry(news); })
                    .catch(function () { newsHtmlCache[tk] = { html: '<span class="pff-news-none">нет свежих новостей</span>', link: '', none: true }; })
                    .then(function () { newsActive--; fillNewsSlot(tk);
                        // при сортировке «по свежести» порядок плиток зависит от дат новостей —
                        // как только приходит новая, переупорядочиваем (PF.softRerender дебаунсится)
                        if (favSort === 'news') PF.softRerender();
                        pumpNewsQueue(); });
            })(tk);
        }
    }
    // ---- спарклайны избранного: 30 дней дневных свечей MOEX ISS ----
    // Новые данные редизайна R10: лёгкий фетч close-цен (interval=24) с кэшем НА СЕССИЮ
    // и той же дисциплиной, что у новостей — очередь, максимум 2 запроса одновременно.
    // Слот .pff3-spark заполняется точечно (без ререндера); после innerHTML-свопа
    // renderFavSparks восстанавливает svg из кэша синхронно, сеть не трогается.
    var favSparkCache = {};                                   // tk -> [closes] | 'none'
    var favSparkStarted = {}, favSparkQueue = [], favSparkActive = 0;
    function favSparkSvg(closes) {
        if (!closes || closes.length < 2) return '';
        var min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
        var span = (max - min) || 1;
        var W = 120, H = 36, pad = 2, n = closes.length - 1;
        var pts = closes.map(function (v, i) {
            return (i * W / n).toFixed(1) + ',' + (pad + (H - 2 * pad) * (1 - (v - min) / span)).toFixed(1);
        });
        // заливка-площадь под линией + сама линия (цвет — по классу знака на слоте)
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
            '<path d="M' + pts.join(' L') + ' L' + W + ',' + H + ' L0,' + H + ' Z"/>' +
            '<polyline points="' + pts.join(' ') + '"/></svg>';
    }
    function fillSparkSlot(tk) {
        var el = dq('pf-spk-' + tk), c = favSparkCache[tk];
        if (!el || !c || c === 'none') return;
        el.innerHTML = favSparkSvg(c);
    }
    function pumpSparkQueue() {
        while (favSparkActive < 2 && favSparkQueue.length) {
            var tk = favSparkQueue.shift(); favSparkActive++;
            (function (tk) {
                var from = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10);
                fetch('https://iss.moex.com/iss/engines/stock/markets/shares/securities/' + encodeURIComponent(tk) +
                      '/candles.json?iss.meta=off&interval=24&from=' + from, { credentials: 'omit' })
                    .then(function (r) { if (!r.ok) throw new Error('iss ' + r.status); return r.json(); })
                    .then(function (j) {
                        var c = j && j.candles, cols = (c && c.columns) || [], rows = (c && c.data) || [];
                        var iC = cols.indexOf('close');
                        var closes = iC < 0 ? [] : rows.map(function (r2) { return +r2[iC] || 0; })
                            .filter(function (v) { return v > 0; });
                        favSparkCache[tk] = closes.length > 1 ? closes : 'none';
                    })
                    .catch(function () { favSparkCache[tk] = 'none'; })
                    .then(function () { favSparkActive--; fillSparkSlot(tk); pumpSparkQueue(); });
            })(tk);
        }
    }
    function renderFavSparks() {
        // слотов нет (пустое избранное / узкий вид без спарклайнов рендерит слоты всё
        // равно — их прячет CSS, заполняем на вырост) — но без виджета выходим сразу
        if (!document.querySelector('#pfWrap .pff3-spark')) return;
        favPool().forEach(function (tk) {
            if (favSparkCache[tk]) { fillSparkSlot(tk); return; }   // кэш сессии → без сети
            if (!favSparkStarted[tk]) { favSparkStarted[tk] = true; favSparkQueue.push(tk); }
        });
        // задержка чуть больше новостной: сперва котировки и таблицы, потом декор
        setTimeout(pumpSparkQueue, favSparkActive ? 0 : 500);
    }

    function renderFavNews() {
        // строки, не влезающие в блок целиком, прячутся (независимо от загрузки новостей)
        pfFavFitWatch(); pfFavFitSoon();
        renderFavSparks();   // спарклайны живут тем же циклом рендера, что и новости
        // грузим новости для стабильного пула (топ-12 по потенциалу) — он же набор видимых плиток
        // при любом фильтре; сортировка «по свежести» лишь переупорядочивает уже эти тикеры
        var favs = favPool(); if (!favs.length || typeof loadNewsForTicker !== 'function') return;
        favs.forEach(function (tk) {
            if (newsHtmlCache[tk]) { fillNewsSlot(tk); return; }   // уже загружено → без сети
            if (!newsStarted[tk]) { newsStarted[tk] = true; newsQueue.push(tk); }
        });
        // лёгкая задержка старта, чтобы сперва прогрузились данные таблиц, а не новости
        setTimeout(pumpNewsQueue, newsActive ? 0 : 350);
    }
    // ---- «Избранное»: показываем только ЦЕЛИКОМ влезающие строки ----
    // Строка, обрезанная нижним краем блока (виден только тикер или половина новости),
    // не отображается вовсе (.pff-cut, просьба 2026-07-17): список заканчивается на
    // последней целой строке. Пересчёт — после каждого рендера избранного (renderFavNews)
    // и на живой ресайз виджета (ResizeObserver на .pff-body). Первую строку не режем
    // никогда — совсем пустой блок хуже одной подрезанной строки.
    var pfFavFitRO = null, pfFavFitT = null;
    function pfFavFitRows() {
        var bodies = document.querySelectorAll('#pfWrap .pf-fav .pff-body');
        Array.prototype.forEach.call(bodies, function (body) {
            var rows = body.querySelectorAll('.pff2-list .pff-tile');
            if (!rows.length) return;
            Array.prototype.forEach.call(rows, function (r) { r.classList.remove('pff-cut'); });
            if (body.scrollHeight <= body.clientHeight + 1) return;   // всё влезает — не режем
            body.scrollTop = 0;   // хвост прячем, скроллить больше нечего
            var bb = body.getBoundingClientRect().bottom;
            var cut = false;
            Array.prototype.forEach.call(rows, function (r, i) {
                if (!cut && i > 0 && r.getBoundingClientRect().bottom > bb + 0.5) cut = true;
                if (cut) r.classList.add('pff-cut');
            });
        });
    }
    function pfFavFitSoon() { clearTimeout(pfFavFitT); pfFavFitT = setTimeout(pfFavFitRows, 60); }
    function pfFavFitWatch() {
        if (!window.ResizeObserver) return;
        if (!pfFavFitRO) pfFavFitRO = new ResizeObserver(pfFavFitSoon);
        else pfFavFitRO.disconnect();
        var bodies = document.querySelectorAll('#pfWrap .pf-fav .pff-body');
        Array.prototype.forEach.call(bodies, function (b) { pfFavFitRO.observe(b); });
    }

    // ---- ставки рынка (как на дашборде) ----
    function rateTiles() {
        var rd = window.ratesData || (typeof ratesData !== 'undefined' ? ratesData : {});
        // мусор из гугл-таблицы («#VALUE!», «#DIV/0!», «---») в плитку не пропускаем:
        // значение годится, только если в нём есть цифра и нет маркеров ошибки; иначе «—»
        function rvOk(s) { s = String(s == null ? '' : s); return /\d/.test(s) && s.indexOf('---') < 0 && s.indexOf('#') < 0; }
        function rv(id, fb) { var e = dq(id); var t = e ? (e.textContent || '').trim() : '';
            if (t && rvOk(t)) return t; if (fb != null && rvOk(fb)) return fb; return '—'; }
        // иконки-значки слева убраны по просьбе — плитка = только подпись и значение
        return [
            { l: 'Ключевая ставка', v: rv('val-key-rate', rd.keyRate), ac: '#119d5c' },
            { l: 'Ставка по вкладам', v: rv('val-deposit-rate', rd.depositRate), ac: '#5B7C99' },
            { l: 'Инфляция, год', v: rv('val-inflation', rd.inflation), ac: '#D97757' },
            { l: 'Доходность ОФЗ 10 лет', v: rv('val-ofz10', rd.ofz10), ac: '#3d6fd1' }
        ];
    }
    function rateTileHtml(t, extra) {
        // extra — только строка-разметка (кнопка-глаз). При вызове через .map(rateTileHtml)
        // вторым аргументом прилетает ИНДЕКС массива (0,1,2,3) — он не должен попасть в плитку
        // «сырой» цифрой (был баг «1 2 3» под плитками ставок); принимаем только строку.
        var ex = (typeof extra === 'string') ? extra : '';
        return '<div class="drt-tile' + (ex ? ' drt-tile--eye' : '') + '" style="--ac:' + t.ac + '">' +
            '<div class="drt-body"><div class="drt-l">' + esc(t.l) + '</div><div class="drt-v">' + esc(t.v) + '</div></div>' + ex + '</div>';
    }
    // полноширинная горизонтальная полоса ставок под сеткой — показывается ВСЕГДА,
    // когда есть хоть одна облигация хоть в одном портфеле (т.е. «Календарь выплат» тоже виден)
    // hideId — как у ratesStackHtml: глаз-скрытие рисуем ТОЛЬКО когда явно передан id
    // (конструкторная ветка передаёт 'rates', классический вызов — без аргумента). У
    // классического вида нет «Видимости» в шапке, скрывать там нечем — кнопка не должна
    // ни рисоваться (мёртвый клик), ни быть кликабельной по неосторожному hover.
    // Сама кнопка — в ПОСЛЕДНЕЙ плитке (тот же .pf-ratestile-eye, что у ratesStackHtml):
    // у полосы нет шапки, и угловой оверлей .pfd-eye лёг бы поверх значения плитки.
    // Дата, «на которую» цифры ставок: фид дневной, в выходные новых значений нет —
    // суббота/воскресенье показывают дату пятницы (просьба владельца 2026-07-30:
    // в подписи обновления дата, а не время).
    function ratesDateLabel() {
        var d = new Date(), wd = d.getDay();
        if (wd === 0) d.setDate(d.getDate() - 2);
        else if (wd === 6) d.setDate(d.getDate() - 1);
        var M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return d.getDate() + ' ' + M[d.getMonth()];
    }
    // Редизайн 2026-07-30 (мокап «Обзор р2», экран 02): четыре плитки-карточки заменены
    // ОДНОЙ тикер-строкой в стандартной карточке виджета .pf-card2 — подпись + крупное
    // моно-значение, hairline-разделители, справа источник и дата. Именно потому, что это
    // обычный .pf-card2, тема «Стекло» (.pfd-thm-glass) и весь хром достаются виджету теми
    // же правилами, что остальным, — без адресных костылей под .drt-tile.
    // Пара кнопок конструктора ('rates' в PFD_OWN_CHROME) — ПЕРЕД подписью источника,
    // ОБА В ОДНОМ .rtb-tail в общем потоке строки (правка 2026-07-30: было абсолютным
    // оверлеем НАД подписью — при узком блоке контейнер-запрос уводил подпись источника
    // на отдельную строку сеткой, а неприбитая к потоку пара плавала поверх, отчего
    // строка «переносилась» и снизу оставалась пустая полоса). Теперь хром просто ещё
    // один флекс-элемент строки: занимает 0 места, пока скрыт (opacity:0 в
    // .pfd-inchrome), проявляется по hover без сдвига соседей.
    // ratesStackHtml (режим «Ставки» у блока 'cal') живёт на старых плитках — cal не в
    // PFD_OWN_CHROME, и там свой угловой хром.
    // короткие подписи тикера — полные имена плиток в строке режутся многоточием;
    // полное имя остаётся в title (наведение)
    var RTB_SHORT = { 'Ключевая ставка': 'Ключевая', 'Ставка по вкладам': 'Вклады',
                      'Инфляция, год': 'Инфляция, год', 'Доходность ОФЗ 10 лет': 'ОФЗ 10 лет' };
    function ratesHtml(hideId) {
        var tiles = rateTiles();
        var chrome = hideId
            ? '<span class="rtb-chrome">' + pfdInChromeHtml(hideId) + '</span>'
            : '';
        return '<div class="pf-card2 pf-ratesbar"><div class="rtb-row">' +
            tiles.map(function (t) {
                return '<div class="rtb-i" title="' + esc(t.l) + '"><span class="rtb-l">' + esc(RTB_SHORT[t.l] || t.l) + '</span>' +
                    '<b class="rtb-v">' + esc(t.v) + '</b></div>';
            }).join('') +
            '<span class="rtb-tail">' + chrome +
                '<span class="rtb-src">ЦБ · MOEX · обновлено ' + ratesDateLabel() + '</span>' +
            '</span></div></div>';
    }
    // Замена «Календаря выплат», когда нигде нет ни одной облигации: те же 4 плитки,
    // без большого бокса-обёртки (каждая плитка и так своя мини-карточка, drt-tile) —
    // стопкой сверху вниз. Заголовок — тот же PF.pfCardHead, что и у остальных карточек
    // (тот же шрифт/размер, что «Избранное»), выровнен ПО ВЕРХУ ячейки — раньше вся
    // колонка центрировалась по высоте свободной ячейки и «плавала» на уровне середины
    // соседней карточки портфеля; теперь плитки начинаются сразу под заголовком, как у
    // соседей. asCell=true → занимает свободную ЯЧЕЙКУ сетки (растягивается на высоту
    // соседних карточек через align-items:stretch); asCell=false → узкая колонка под
    // сеткой (чётное число портфелей).
    // hideId (напр. 'cal') — на дашборде даёт корзину блока прямо в ПОСЛЕДНЕЙ плитке
    // (заголовок «Ставки рынка» убран по просьбе — плитки самоописательны, а отдельная шапка
    // ради кнопки была лишней). Классический путь вызывается без hideId — плитки без кнопки.
    function ratesStackHtml(asCell, span, withHead, hideId) {
        var tiles = rateTiles();
        var eye = hideId
            ? '<button class="pfc-act pf-ratestile-eye" title="Удалить виджет (вернуть — кнопка «Виджет» в шапке)" aria-label="Удалить виджет «Ставки»" onclick="pfdHideBlock(\'' + jsArg(hideId) + '\')">' + PF.NOTE_TRASH_SVG + '</button>'
            : '';
        var grid = '<div class="drt-grid pf-ratesstack-grid">' + tiles.map(function (t, i) {
            return rateTileHtml(t, i === tiles.length - 1 ? eye : '');
        }).join('') + '</div>';
        var cls = 'pf-ratesstack' + (asCell ? ' pf-ratesstack--cell' : ' pf-ratesstack--flow') +
            (asCell && span === 2 ? ' pf-ratesstack--span2' : '');
        return '<div class="' + cls + '">' +
            '<div class="pf-ratesstack-body">' + grid + '</div></div>';
    }

    // PF.renderNoAnim (не renderPortfolios): переключатель сортировки избранного трогает только
    // порядок плиток, но полный ре-рендер заново «рисует» мини-графики карточек портфелей с
    // 1-сек. анимацией линии — на глаз это мерцание. Флаг PF.noChartAnim рисует графики сразу.
    window.pfSetFavSort = function (mode) { if (mode !== 'pot' && mode !== 'news') return; if (favSort === mode) return; favSort = mode; PF.renderNoAnim(); };
    // Убрать тикер из избранного прямо из блока «Избранное» (корзина по hover плитки) —
    // сразу, без подтверждения. Источник правды — stk_fav_v1 (через stkToggleFav терминала),
    // перерисовываем ТОЛЬКО карточки «Избранного» в #pfWrap (без ре-рендера всей страницы —
    // не мигают графики/карта), затем догружаем новости оставшихся тикеров.
    function pfRepaintFav() {
        var cards = document.querySelectorAll('#pfWrap .pf-fav');
        if (!cards.length) return;
        cards.forEach(function (card) {
            var tmp = document.createElement('div'); tmp.innerHTML = favHtml(pfdActive());
            if (tmp.firstChild) card.parentNode.replaceChild(tmp.firstChild, card);
        });
        if (typeof renderFavNews === 'function') renderFavNews();
        pfdRepackSoon();
    }
    window.pfRemoveFav = function (tk, ev) {
        if (ev) { try { ev.stopPropagation(); ev.preventDefault(); } catch (e) {} }
        if (!tk) return;
        if (typeof window.stkToggleFav === 'function') {
            if (favTickers().indexOf(tk) !== -1) window.stkToggleFav(tk);   // toggle снимает звезду
        } else {
            try { var f = JSON.parse(localStorage.getItem('stk_fav_v1')) || []; var i = f.indexOf(tk);
                if (i !== -1) { f.splice(i, 1); localStorage.setItem('stk_fav_v1', JSON.stringify(f)); } } catch (e) {}
        }
        pfRepaintFav();
        toast(tk + ' убран из избранного');
    };

    // Короткий путь к сделке прямо из «Избранного»: строка ведёт в терминал с
    // заряженным тикетом. stopPropagation обязателен — под кнопкой лежит клик
    // всей плитки (карточка компании), и без него откроются оба.
    window.pfBuyFav = function (tk, ev) {
        if (ev) { try { ev.stopPropagation(); ev.preventDefault(); } catch (e) {} }
        if (tk && PF.pftBuyTicker) PF.pftBuyTicker(tk, 'buy');
    };

    // «Список активов»: все бумаги всех портфелей по убыванию стоимости позиции
    function pfwAssetsHtml() {
        var rows = [];
        visibleItems().forEach(function (p) {
            calcPf(p).hs.forEach(function (x) {
                if (!(x.c.qty > 0)) return;
                rows.push({ h: x.h, c: x.c, pf: p });
            });
        });
        rows.sort(function (a, b) { return (b.c.value || 0) - (a.c.value || 0); });
        var body;
        if (!rows.length) {
            body = '<div class="pfal-empty">Состав пуст — добавьте активы в настройках портфеля ⚙.</div>';
        } else {
            // строка мокапа: тикер моно · метка класса · имя тихо · количество ·
            // стоимость · изменение в колонке 56px (экран 13, .row / .cx3)
            body = '<div class="pfas-list" data-skey="pfassets">' + rows.map(function (r) {
                var isB = r.h.type === 'bond';
                var chg = (r.c.invested > 0)
                    ? '<span class="pfas-c ' + (r.c.pnlPct >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.c.pnlPct) + '</span>'
                    : '<span class="pfas-c">—</span>';
                return '<div class="pfas-row" role="button" onclick="pfOpenTicker(\'' + jsArg(r.h.ticker) + '\')">' +
                    '<span class="pfas-tk">' + esc(r.h.ticker) + '</span>' +
                    '<i class="pfas-cl ' + (isB ? 'bond' : 'stock') + '">' + (isB ? 'обл' : 'акц') + '</i>' +
                    '<span class="pfas-nm">' + esc(PF.assetDisplayName(r.h)) + '</span>' +
                    '<span class="pfas-qty">' + fmtQty(r.c.qty) + ' шт</span>' +
                    '<span class="pfas-val">' + fmtRub(r.c.value || 0) + '</span>' +
                    chg +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-assetsblk">' +
            // счётчик у имени вместо фразы в подписи (мокап, экран 13, п. 5)
            PF.pfCardHead(rows.length || '', 'Список активов', 'по убыванию стоимости позиции', null) + body + '</div>';
    }

    // «Позиции у брокера»: живой портфель счёта из T-Invest API (js/broker-api.js,
    // через воркер-прокси). Каркас рендерится сразу (скелет/инвайт/замок), данные
    // приходят асинхронно в #pfbrkList (паттерн новостей: fill-slot + pfdRepackSoon);
    // кэш 60с — ре-рендеры дашборда не дёргают API брокера. Сверка: количество
    // у брокера ↔ ручные лоты трекера по тикеру.
    var brokerCache = { ts: 0, busy: false, data: null, err: null };
    window.pfBrokerBust = function () { brokerCache = { ts: 0, busy: false, data: null, err: null }; };
    var BRK_TYPES = { share: 'акц', bond: 'обл', etf: 'фонд', futures: 'фьюч' };
    var BRK_BANK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>';
    var BRK_LINK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';

    function pfwBrokerHtml() {
        var A = window.brokerApi;
        var conn = A && A.getConn();
        var body, sub = 'портфель счёта по официальному API';
        // мини-состояние в языке пустых подвкладок: иконка-плитка + текст + кнопка
        function invite(text, btnLabel, onclick) {
            return '<div class="pfbrk-state">' +
                '<div class="pfbrk-state-ic">' + BRK_BANK_SVG + '</div>' +
                '<div class="pfbrk-state-tx">' + text + '</div>' +
                '<button type="button" class="pfbrk-btn" onclick="' + onclick + '">' + btnLabel + '</button></div>';
        }
        // правый слот шапки — вход в подключение (виден при живом подключении)
        var right = conn
            ? '<button type="button" class="pf-ch-go pfbrk-go" onclick="brokerConnect.open()" title="Управлять подключением брокера">' + BRK_LINK_SVG + '<span>Подключение</span></button>'
            : null;
        // sub уходит в PF.pfCardHead, который экранирует сам — без esc() тут (иначе двойное)
        if (!A || !conn) {
            body = invite('Подключите брокера — покажем позиции счёта, как их видят Т-Инвестиции. Хватит токена «только для чтения».',
                'Подключить брокера', 'brokerConnect.open()');
        } else if (conn.state === 'revoked') {
            sub = conn.accountName;
            body = invite('Брокер не принял токен — он отозван или перевыпущен.', 'Обновить токен', 'brokerConnect.open()');
        } else if (A.isSessionGone()) {
            sub = conn.accountName;
            body = invite('Токен не сохранялся («до закрытия вкладки») — сессия закончилась. Вставьте его ещё раз.', 'Ввести токен', 'brokerConnect.open()');
        } else if (A.isLocked()) {
            sub = conn.accountName;
            body = invite('Токен под PIN-кодом — разблокируйте, чтобы загрузить позиции.', 'Разблокировать', 'pfBrokerUnlock()');
        } else {
            // счёт песочницы так и зовётся «Песочница» — не дублируем суффикс
            sub = conn.accountName + (conn.sandbox && !/песочниц/i.test(conn.accountName) ? ' · песочница' : '');
            body = '<div id="pfbrkList">' + (brokerCache.data || brokerCache.err
                ? pfwBrokerRowsHtml()
                : '<div class="pfbrk-skel">' + skelHtml(150, 18) + skelHtml(210, 18) + skelHtml(180, 18) + '</div>') + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-brokerblk">' +
            // счётчик — число позиций на счёте; имя счёта уехало в подпись
            PF.pfCardHead((brokerCache.data && brokerCache.data.rows) ? brokerCache.data.rows.length : '',
                'Позиции у брокера', 'Т-Инвестиции' + (sub ? ' · ' + sub : ''), right) + body + '</div>';
    }

    function pfwBrokerRowsHtml() {
        if (brokerCache.err) return '<div class="pfbrk-state"><div class="pfbrk-state-ic">' + BRK_BANK_SVG + '</div><div class="pfbrk-state-tx">' + esc(brokerCache.err) + '</div></div>';
        var d = brokerCache.data;
        if (!d || !d.rows.length) return '<div class="pfbrk-state"><div class="pfbrk-state-ic">' + BRK_BANK_SVG + '</div><div class="pfbrk-state-tx">На счёте нет позиций — только деньги.</div></div>';
        var lim = pfdRowsFor('broker', 6, 34, 130);
        var at = new Date(brokerCache.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        var head = '<div class="pfbrk-total"><div class="pfbrk-total-l"><span>Стоимость портфеля</span><i>обновлено ' + at + '</i></div><b>' + fmtRub(d.total || 0) + '</b></div>';
        return head + '<div class="pfas-list" data-skey="pfbroker">' + d.rows.slice(0, lim).map(function (r) {
            // та же строка, что у «Списка активов» — список общий (.pfas-list)
            var chg = r.pnl === 0 ? '<span class="pfas-c">—</span>'
                : '<span class="pfas-c ' + (r.pnl >= 0 ? 'pos' : 'neg') + '">' + (r.pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(r.pnl)) + '</span>';
            // сверка с ручными лотами: количество разошлось — заметная метка
            var diff = (r.manualQty !== undefined && Math.abs(r.manualQty - r.qty) > 1e-9)
                ? '<i class="pfbrk-diff" title="В трекере ' + fmtQty(r.manualQty) + ' шт — у брокера ' + fmtQty(r.qty) + ' шт">≠ трекер</i>' : '';
            var open = r.tkOk ? ' role="button" onclick="pfOpenTicker(\'' + jsArg(r.tk) + '\')"' : '';
            return '<div class="pfas-row"' + open + '>' +
                '<span class="pfas-tk">' + esc(r.tk) + '</span>' +
                (BRK_TYPES[r.type] ? '<i class="pfas-cl ' + (r.type === 'bond' ? 'bond' : 'stock') + '">' + BRK_TYPES[r.type] + '</i>' : '') +
                '<span class="pfas-nm">' + esc(r.name) + '</span>' +
                '<span class="pfas-qty">' + fmtQty(r.qty) + ' шт' + diff + '</span>' +
                '<span class="pfas-val">' + fmtRub(r.value) + '</span>' +
                chg +
            '</div>';
        }).join('') + '</div>';
    }

    // асинхронная догрузка (зовётся из цикла рендера portfolios.js — no-op без виджета)
    function renderBrokerPos() {
        var el = dq('pfbrkList');
        if (!el) return;
        var A = window.brokerApi;
        if (!A || !A.getConn() || A.isLocked() || A.isSessionGone()) return;
        if (brokerCache.busy || (brokerCache.ts && Date.now() - brokerCache.ts < 60000)) return;
        brokerCache.busy = true;
        A.getPortfolio().then(function (pf) {
            var poss = (pf.positions || []).filter(function (p) {
                return A.q2n(p.quantity) > 0 && p.instrumentType !== 'currency';
            });
            return A.resolveInstruments(poss).then(function (cache) {
                // ручные количества по тикеру — для сверки с трекером. Только
                // РУЧНЫЕ портфели: карточка счёта (p.broker, №10) наполняется из
                // этого же API — с ней сверка всегда сходилась бы «ок»
                var manual = {};
                try {
                    visibleItems().filter(function (p) { return !p.broker; }).forEach(function (p) {
                        calcPf(p).hs.forEach(function (x) {
                            if (x.c.qty > 0) manual[x.h.ticker] = (manual[x.h.ticker] || 0) + x.c.qty;
                        });
                    });
                } catch (e) {}
                var rows = poss.map(function (p) {
                    var ins = cache[p.instrumentUid || p.figi] || {};
                    var qty = A.q2n(p.quantity);
                    var tk = ins.ticker || '';
                    return {
                        tk: tk || (p.figi || '').slice(0, 12), tkOk: !!tk,
                        name: ins.name || '', type: p.instrumentType || '',
                        qty: qty,
                        value: A.q2n(p.currentPrice) * qty,
                        pnl: A.q2n(p.expectedYield),
                        manualQty: tk ? manual[tk] : undefined
                    };
                });
                rows.sort(function (a, b) { return b.value - a.value; });
                brokerCache = { ts: Date.now(), busy: false, err: null,
                    data: { rows: rows, total: A.q2n(pf.totalAmountPortfolio) } };
                fillBrokerSlot();
            });
        }).catch(function (e) {
            brokerCache = { ts: Date.now(), busy: false, data: null,
                err: (e && e.message) || 'Не удалось получить данные брокера' };
            fillBrokerSlot();
        });
    }
    function fillBrokerSlot() {
        var el = dq('pfbrkList');
        if (!el) return;
        el.innerHTML = pfwBrokerRowsHtml();
        pfdRepackSoon();
    }
    window.pfBrokerUnlock = function () {
        if (!window.brokerApi) return;
        window.brokerApi.getToken(true).then(function (t) {
            if (t) { window.pfBrokerBust(); pfdRerender(); }
        });
    };
    // подключили/отключили/разблокировали брокера — виджет перерисовывается
    window.addEventListener('broker-conn-change', function () {
        window.pfBrokerBust();
        if (document.querySelector('#panel-portfolios.active .pf-brokerblk')) pfdRerender();
    });

    // «Последние операции»: 5 свежих сделок компактным списком (при заданной высоте
    // блока строк больше/меньше — под размер, см. pfdRowsFor)
    function pfwOpsHtml() {
        var list = PF.collectTrades(false).slice(0, pfdRowsFor('ops', 5, 42, 150));
        var body;
        if (!list.length) {
            body = '<div class="pfal-empty">Операций пока нет — покупки появятся здесь автоматически.</div>';
        } else {
            // строка мокапа (.hs-r): дата · вид операции капсом, а не плашкой ·
            // тикер с именем · количество · сумма
            body = '<div class="pfop-list">' + list.map(function (t) {
                var sell = t.side === 'sell';
                return '<div class="pfop-row">' +
                    '<span class="pfop-date">' + ruDate(t.date) + '</span>' +
                    '<span class="pfop-side ' + (sell ? 'sell' : 'buy') + '">' + (sell ? 'Продажа' : 'Покупка') + '</span>' +
                    '<span class="pfop-id"><b>' + esc(t.ticker) + '</b><i>' + esc(t.name) + '</i></span>' +
                    '<span class="pfop-qty">' + fmtQty(t.qty) + ' шт</span>' +
                    '<span class="pfop-sum' + (sell ? ' pos' : '') + '">' + (sell ? '+' : '') + fmtRub(t.total) + '</span>' +
                '</div>';
            }).join('') + '</div>';
        }
        // подвал общий для всех виджетов: итог слева, переход справа
        var spent = 0;
        list.forEach(function (t) { spent += (t.side === 'sell' ? -1 : 1) * (t.total || 0); });
        return '<div class="dash2-card pf-card2 pf-opsblk">' +
            PF.pfCardHead(list.length || '', 'Последние операции', 'свежие покупки и продажи', null) + body +
            (list.length ? PF.pfCardFoot('расход за эти сделки', fmtRub(Math.abs(spent)),
                { label: 'Вся история', onclick: 'pfxGoTab(\'ops\')' }) : '') + '</div>';
    }
    // «Доходность портфелей»: строка мокапа — точка · имя · за всё время ·
    // годовых, полоса ПОД строкой. Раньше полоса стояла между именем и числом
    // и растаскивала строку на три колонки разной природы; и число было одно —
    // подпись «годовых» обещала второе, которого не было.
    function pfwYieldHtml() {
        var rows = [];
        visibleItems().forEach(function (p) {
            var c = calcPf(p);
            if (!(c.invested > 0)) return;
            rows.push({ name: p.name, color: colorVal(p.color), pct: c.pnlPct, annual: c.annual, val: c.value });
        });
        var body;
        if (!rows.length) {
            body = '<div class="pfal-empty">Добавьте бумаги — сравнение доходности появится автоматически.</div>';
        } else {
            var maxAbs = rows.reduce(function (m, r) { return Math.max(m, Math.abs(r.pct)); }, 1);
            rows.sort(function (a, b) { return b.pct - a.pct; });
            body = '<div class="pfyl-list">' + rows.map(function (r) {
                var w = clamp(Math.abs(r.pct) / maxAbs * 100, 4, 100);
                var cls = r.pct >= 0 ? 'pos' : 'neg';
                return '<div class="pfyl-row">' +
                    '<span class="pfyl-l">' +
                        '<i class="pfyl-dot" style="background:' + r.color + '"></i>' +
                        '<b class="pfyl-n">' + esc(r.name) + '</b>' +
                        '<span class="pfyl-v ' + cls + '">' + fmtPct(r.pct) + '</span>' +
                        '<span class="pfyl-a ' + cls + '">' + (r.annual == null ? '—' : fmtPct(r.annual)) + '</span>' +
                    '</span>' +
                    '<span class="pfyl-barwrap"><span class="pfyl-bar" style="width:' + w.toFixed(1) + '%;background:' + r.color + '"></span></span>' +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-yieldblk">' +
            PF.pfCardHead('', 'Доходность портфелей', 'за всё время · годовых', null) + body + '</div>';
    }
    // «Снимки капитала»: последние дневные значения и их дневное изменение
    function pfwSnapsHtml() {
        var s = pfdCapEffectiveSeries();
        var body;
        if (s.length < 2) {
            body = '<div class="pfal-empty">Снимки записываются раз в день при живых котировках — таблица появится со второго дня.</div>';
        } else {
            var tail = s.slice(-(pfdRowsFor('snaps', 10, 38, 110) + 1));   // строк по высоте блока
            var rows = '';
            // строка мокапа с датой (payRow): дата колонкой 52px слева, значение
            // отжато вправо, изменение — колонкой 56px
            for (var i = tail.length - 1; i >= 1; i--) {
                var d = tail[i].v - tail[i - 1].v;
                rows += '<div class="pfsn-row"><span class="pfsn-d">' + ruDate(tail[i].d) + '</span>' +
                    '<span class="pfsn-v">' + fmtRub(tail[i].v) + '</span>' +
                    '<span class="pfsn-c ' + (d >= 0 ? 'pos' : 'neg') + '">' + (d >= 0 ? '+' : '−') + fmtRub(Math.abs(d)) + '</span></div>';
            }
            body = '<div class="pfsn-list" data-skey="pfsnaps">' + rows + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-snapsblk">' +
            // счётчика тут нет намеренно: в мокапе он считает ПРЕДМЕТ виджета
            // (бумаги, выплаты, портфели), а «388 дней истории» — не предмет
            PF.pfCardHead('', 'Снимки капитала', 'дневные значения стоимости портфелей', null) + body + '</div>';
    }
    // «Отчёты и экспорт» (подвкладка «Отчёты»)
    function pfwReportsHtml() {
        function item(ic, t, sub, oc) {
            return '<button class="pf-impitem" onclick="' + oc + '">' +
                '<span class="pf-impico">' + ic + '</span>' +
                '<span class="pf-impbody"><b>' + t + '</b><i>' + sub + '</i></span>' +
                '<span class="pf-impgo">' + PF.CHEV_SVG + '</span></button>';
        }
        var body = '<div class="pfx-setlist">' +
            '<div class="pf-impgrp">Excel</div>' +
            item(PF.XLSTBL_SVG, 'Все позиции', 'портфели, бумаги, цены и доходность одним файлом', 'pfExportExcelAll()') +
            item(PF.XLSTBL_SVG, 'Журнал операций', 'покупки и продажи по всем портфелям', 'pfExportTradesExcel()') +
            '<div class="pf-impgrp">Резервная копия</div>' +
            item(PF.DL_SVG, 'Выгрузить в файл (JSON)', 'полный бэкап портфелей на диск', 'pfExportData()') +
            item(PF.UPLOAD_SVG, 'Загрузить из файла', 'восстановить портфели из бэкапа', 'pfImportClick()') +
            '<div class="pf-impgrp">Импорт</div>' +
            item(PF.IMPCSV_SVG, 'Из CSV-файла', 'отчёт брокера: тикер · дата · цена · кол-во · [НКД]', 'pfCsvClick(null)') +
        '</div>';
        return '<div class="dash2-card pf-card2 pfx-setcard">' +
            PF.pfCardHead('', 'Отчёты и экспорт', 'выгрузки, бэкап и импорт данных', null) + body + '</div>';
    }

    // сколько строк списка влезает в заданную пользователем высоту блока (cfg.h):
    // (высота − «хром» карточки: шапка/отступы/подвал) ÷ высота строки. Без заданной
    // высоты — дефолт def (естественная высота виджета). Так содержимое ПОДСТРАИВАЕТСЯ
    // под размер: виджет L показывает больше данных, а не пустоту под пятью строками.
    function pfdRowsFor(id, def, rowH, chrome) {
        var h = +((PF.dashCfg.h || {})[id]) || 0;
        if (!h) return def;
        return clamp(Math.floor((h - (chrome || 96)) / rowH), 2, 40);
    }
    // короткий формат числа для осей: 1 264 484 → «1,26 млн», 12 400 → «12 тыс»
    function pfxShortNum(v) {
        var a = Math.abs(v);
        function trim(x, d) { return x.toFixed(d).replace(/\.?0+$/, '').replace('.', ','); }
        if (a >= 1e9) return trim(v / 1e9, 2) + ' млрд';
        if (a >= 1e6) return trim(v / 1e6, 2) + ' млн';
        if (a >= 1e3) return trim(v / 1e3, 0) + ' тыс';
        return String(Math.round(v));
    }
    // ---- R7.2: виджеты «как в больших терминалах» ----
    // «Лидеры дня»: сильнейшие дневные движения среди акций портфелей (quotes.chgPct)
    // КТО ДВИГАЛ СЕГОДНЯ (мокап overview3, правый столбец героя на экране 02).
    // Виджет сортировал бумаги по величине ПРОЦЕНТА и называл лидером дня того,
    // кто сильнее всех дёрнулся. На деле это вводило в заблуждение: LKOH на −3,9%
    // уносил 5 572 ₽, а SBER на −0,7% — 119 662 ₽, то есть в двадцать раз больше.
    // Считаем вклад в рублях (тем же способом, что dayDeltaFromQuotes) и сортируем
    // по нему; процент остаётся, но становится подписью, а не главным числом.
    // Один тикер может лежать в нескольких портфелях — вклад складываем.
    function pfwMoversHtml() {
        var byTk = {}, order = [];
        visibleItems().forEach(function (p) {
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker || h.type === 'bond') return;
                var q = quotes[h.ticker];
                if (!q || q.chgPct == null) return;
                var k = q.chgPct / 100;
                if (!(k > -0.999)) return;
                var v = PF.calcHold ? PF.calcHold(h).value : 0;
                if (!(v > 0)) return;
                var r = byTk[h.ticker];
                if (!r) { r = byTk[h.ticker] = { tk: h.ticker, name: PF.assetDisplayName(h), chg: +q.chgPct, rub: 0 }; order.push(r); }
                r.rub += v - v / (1 + k);
            });
        });
        var rows = order.sort(function (a, b) { return Math.abs(b.rub) - Math.abs(a.rub); });
        rows = rows.slice(0, pfdRowsFor('movers', 6, 34, 110));   // строк больше при высоком блоке
        var body;
        if (!rows.length) {
            body = '<div class="pfal-empty">Появится с приходом дневных котировок — держите в портфеле хотя бы одну акцию.</div>';
        } else {
            // Строка ровно как в мокапе (экран 13): тикер · имя · вклад в рублях ·
            // процент. Полосу «доля вклада» убрал: цвет в строке остаётся только
            // у знака, а длину вклада и так печатает само число рублей.
            body = '<div class="pfmv-list">' + rows.map(function (r) {
                var pos = r.rub >= 0, cls = pos ? 'pos' : 'neg';
                return '<div class="pfmv-r" role="button" onclick="pfOpenTicker(\'' + jsArg(r.tk) + '\')">' +
                    '<span class="tk">' + esc(r.tk) + '</span>' +
                    '<span class="nm">' + esc(r.name) + '</span>' +
                    '<b class="' + cls + '">' + (pos ? '+' : '−') + fmtRub(Math.abs(r.rub)) + '</b>' +
                    '<span class="pct ' + cls + '">' + fmtPct(r.chg) + '</span>' +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-moversblk">' +
            PF.pfCardHead('', 'Лидеры дня', 'кто двигал капитал сегодня — вклад в рублях', null) + body + '</div>';
    }
    // «Рынок сейчас»: IMOEX / USD / BTC — живые значения из скрытых спанов дашборда
    // (те же источники, что рыночная лента в шапке; тикает tickLive раз в секунду)
    function pfwIdxHtml() {
        // Строка мокапа (экран 13): тикер · значение · процент. Расшифровок
        // «IMOEX — Индекс Мосбиржи» больше нет: они пересказывали тикер своими
        // словами и требовали третьего кегля, а строка и так читается.
        var items = [['imoex', 'IMOEX'], ['usd', 'USD/RUB'], ['btc', 'BTC']];
        var rows = items.map(function (t) {
            return '<div class="pfix-row">' +
                '<span class="pfix-tk">' + t[1] + '</span>' +
                '<span class="pfix-v" id="pfxidx-v-' + t[0] + '">—</span>' +
                '<span class="pfix-c" id="pfxidx-c-' + t[0] + '"></span>' +
            '</div>';
        }).join('');
        return '<div class="dash2-card pf-card2 pf-idxblk">' +
            PF.pfCardHead('', 'Рынок сейчас', 'живые котировки, задержка до 15 минут',
                // кнопки конструктора — в потоке шапки ПЕРЕД «Рынок» (PFD_OWN_CHROME)
                pfdInChromeHtml('idx') +
                '<button class="d3-quick ghost pfhm-go" onclick="switchTab(\'market\')">Рынок' + GO_ARROW_SVG + '</button>') +
            '<div class="pfix-rows">' + rows + '</div></div>';
    }
    // «Пассивный доход»: средний месяц из выплат на год вперёд + доходность выплатами
    function pfwPassiveHtml() {
        var evs = PF.collectUpcomingPayouts();
        var year = 0;
        evs.forEach(function (e) { year += e.amount; });
        var val = 0;
        visibleItems().forEach(function (p) { val += calcPf(p).value; });
        var monthly = year / 12, yPct = val > 0 ? year / val * 100 : 0;
        var body;
        if (!(year > 0)) {
            body = '<div class="pfal-empty">Добавьте облигации или дивидендные акции — посчитаем ваш пассивный доход.</div>';
        } else {
            // Тот же блок, что у KPI-плиток (мокап, экран 13: pass собран из
            // .kpi-v/.kpi-d): крупно — год, под ним доходность к капиталу,
            // месяц в подвале. Своя вёрстка «.pfpv-hero» была четвёртым
            // способом показать одно большое число — числа теперь одинаковы
            // во всех виджетах, а строку «Ближайшие 30 дней» говорят
            // «Дивиденды и купоны» и «Календарь выплат».
            body = '<div class="pf-kpi-v pos">+' + kpiBig(year) + '</div>' +
                '<div class="pf-kpi-d pos">' + fmtPct(yPct).replace('+', '') + '<span>к капиталу</span></div>';
        }
        return '<div class="dash2-card pf-card2 pf-passiveblk">' +
            PF.pfCardHead('', 'Пассивный доход', 'ожидаемые выплаты за 12 месяцев', null) + body +
            (year > 0 ? PF.pfCardFoot('в месяц', '+' + fmtRub(monthly), null, 'pos') : '') + '</div>';
    }
    // «Диверсификация»: доли топ-5 позиций и вердикт о концентрации
    function pfwConcHtml() {
        var m = {}, total = 0;
        visibleItems().forEach(function (p) {
            calcPf(p).hs.forEach(function (x) {
                if (!(x.c.qty > 0) || !(x.c.value > 0)) return;
                if (!m[x.h.ticker]) m[x.h.ticker] = { v: 0, nm: '' };
                m[x.h.ticker].v += x.c.value; total += x.c.value;
                // облигации: в строке ИМЯ («ОФЗ 26238»), а не 12-значный ISIN —
                // тот же принцип, что в составе портфеля (assetDisplayName)
                if (!m[x.h.ticker].nm && x.h.type === 'bond') {
                    var bn = PF.assetDisplayName(x.h);
                    if (bn && bn !== x.h.ticker) m[x.h.ticker].nm = bn;
                }
            });
        });
        var list = Object.keys(m).map(function (tk) { return { tk: m[tk].nm || tk, v: m[tk].v }; })
            .sort(function (a, b) { return b.v - a.v; });
        var body;
        if (!list.length || !(total > 0)) {
            body = '<div class="pfal-empty">Добавьте бумаги — покажем, насколько портфель диверсифицирован.</div>';
        } else {
            // строк больше при высоком блоке; вердикт всегда по топ-5 (стабильная метрика,
            // не зависящая от размера виджета)
            var top = list.slice(0, Math.max(5, pfdRowsFor('conc', 5, 34, 150))), top5Sum = 0;
            list.slice(0, 5).forEach(function (r) { top5Sum += r.v / total * 100; });
            // та же строка, что у «Доходности портфелей» (мокап overview3, .dv-r):
            // бумага · сколько денег · доля, полоса ПОД строкой
            var rows = top.map(function (r) {
                var sh = r.v / total * 100;
                return '<div class="pfyl-row">' +
                    '<span class="pfyl-l">' +
                        '<b class="pfyl-n">' + esc(r.tk) + '</b>' +
                        '<span class="pfyl-v">' + fmtRub(r.v) + '</span>' +
                        '<span class="pfyl-a">' + sh.toFixed(1).replace('.', ',') + '%</span>' +
                    '</span>' +
                    '<span class="pfyl-barwrap"><span class="pfyl-bar" style="width:' + clamp(sh, 3, 100).toFixed(1) + '%"></span></span>' +
                '</div>';
            }).join('');
            var topSum = top5Sum;
            // R11 (мокап «Обзора» 2026-07-22): вердикт — тихая строка с цветной иконкой
            // вместо цветной плашки; формулировка короче («топ-5 = 33% — …»)
            var verdict = topSum <= 45 ? ['ok', 'топ-5 = ' + Math.round(topSum) + '% — хорошая диверсификация']
                : topSum <= 70 ? ['mid', 'топ-5 = ' + Math.round(topSum) + '% — умеренная концентрация']
                : ['hot', 'топ-5 = ' + Math.round(topSum) + '% — высокая концентрация'];
            body = '<div class="pfyl-list pfcc-list">' + rows + '</div>' +
                '<div class="pfcc-verdict ' + verdict[0] + '"><i>' + (verdict[0] === 'ok' ? NW_CHECK_SVG : '!') + '</i>' + verdict[1] + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-concblk">' +
            PF.pfCardHead(list.length || '', 'Диверсификация', 'вес бумаги в капитале', null) + body + '</div>';
    }

    // ====================================================================
    //  R8 — ВИДЖЕТЫ ПОДВКЛАДКИ «ПОРТФЕЛИ» (референс-скрин 2026-07-14):
    //  «Мои портфели» (строки со стоимостью/доходностью/спарклайном),
    //  «Структура по портфелям» (кольцо), «Сводные показатели» (4 плитки).
    // ====================================================================
    var PFPL_CASE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="7" width="19" height="13" rx="2.5"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2.5 12.5h19"/></svg>';
    var PFPL_GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg>';
    var pfPlistSort = 'value';   // 'value' | 'yield' | 'name' — сортировка списка (сессия)
    window.pfPlistSetSort = function (v, ev) {
        if (ev) ev.stopPropagation();
        if (pfPlistSort === v) return;
        pfPlistSort = v;
        PF.renderNoAnim();
    };
    // серия значений для спарклайна: дневные снимки → фолбэк на историю мини-графиков
    // (PF.chartRaw наполняется асинхронно, см. pfPlistSparksSoon) → живой хвост
    function pfPlistSeries(p) {
        var m = snaps[p.id] || {}, ks = Object.keys(m).sort();
        var out = ks.map(function (k) { return m[k]; });
        if (out.length < 2) {
            var raw = PF.chartRaw[p.id];
            if (raw && raw.series && raw.series.length >= 2) out = raw.series.map(function (q) { return q.c; });
        }
        if (PF.quotesTs) { var v = calcPf(p).value; if (v > 0) out = out.concat([v]); }
        return out;
    }
    function pfPlistSparkSvg(p) {
        var s = pfPlistSeries(p);
        if (s.length > 40) {   // прореживание: спарклайну хватает ~40 точек
            var step = s.length / 40, thin = [];
            for (var i = 0; i < 40; i++) thin.push(s[Math.floor(i * step)]);
            thin[39] = s[s.length - 1];
            s = thin;
        }
        if (s.length < 2) {
            return '<svg class="pfpl-spark-svg flat" viewBox="0 0 120 36" preserveAspectRatio="none"><line x1="4" y1="18" x2="116" y2="18"/></svg>';
        }
        var min = Math.min.apply(null, s), max = Math.max.apply(null, s);
        var span = max - min || 1;
        var pts = s.map(function (v, i) {
            var x = 4 + i / (s.length - 1) * 112;
            var y = 30 - (v - min) / span * 24;
            return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
        });
        var line = pts.map(function (pt, i) { return (i ? 'L' : 'M') + pt[0] + ' ' + pt[1]; }).join(' ');
        var area = line + ' L ' + pts[pts.length - 1][0] + ' 34 L ' + pts[0][0] + ' 34 Z';
        var up = s[s.length - 1] >= s[0];
        return '<svg class="pfpl-spark-svg ' + (up ? 'pos' : 'neg') + '" viewBox="0 0 120 36" preserveAspectRatio="none">' +
            '<path class="a" d="' + area + '"/><path class="l" d="' + line + '"/></svg>';
    }
    // портфели без снимков: дозагружаем историю мини-графиков и дорисовываем спарклайны
    // на месте (без ре-рендера страницы) — те же данные, что у мини-графика карточки
    var pfplSparkTimer = null;
    function pfPlistSparksSoon() {
        var pend = [];
        PF.store.items.forEach(function (p) {   // спарклайны нужны и скрытым: они в списке
            var el = document.querySelector('#pfWrap .pfpl-spark[data-pid="' + p.id + '"]');
            if (!el) return;
            if (Object.keys(snaps[p.id] || {}).length >= 2) return;
            if (PF.chartRaw[p.id] && PF.chartRaw[p.id].series) return;
            pend.push(p.id);
            loadPfChart(p.id);
        });
        if (!pend.length) return;
        if (pfplSparkTimer) clearInterval(pfplSparkTimer);
        var tries = 0;
        pfplSparkTimer = setInterval(function () {
            pend = pend.filter(function (pid) {
                var el = document.querySelector('#pfWrap .pfpl-spark[data-pid="' + pid + '"]');
                if (!el) return false;
                if (!(PF.chartRaw[pid] && PF.chartRaw[pid].series)) return !!chartBusy[pid];
                var p = findPf(pid);
                if (p) el.innerHTML = pfPlistSparkSvg(p);
                return false;
            });
            if (!pend.length || ++tries > 20) { clearInterval(pfplSparkTimer); pfplSparkTimer = null; }
        }, 700);
    }
    function pfwPlistHtml() {
        // Список — ПОЛНЫЙ, включая скрытые (просьба 2026-07-18): скрытие выводит
        // портфель из УЧЁТА (2026-08-04), но не удаляет его — иначе спрятанный
        // портфель пропадал из единственного места, где виден весь их перечень.
        // Скрытые помечены значком-глазом, числа у них настоящие; в общей доле
        // капитала они не участвуют.
        var all = PF.store.items;
        if (!all.length) {
            return '<div class="dash2-card pf-card2 pf-plistblk">' +
                // пустое состояние — тоже со своими кнопками: plist в PFD_OWN_CHROME,
                // углового оверлея нет, и без этого виджет нельзя было ни настроить, ни убрать
                PF.pfCardHead('', 'Список портфелей', 'все портфели со сводкой', pfdInChromeHtml('plist')) +
                '<div class="pfal-empty">Создайте первый портфель кнопкой «Портфель» в шапке.</div></div>';
        }
        var rows = all.map(function (p) { return { p: p, c: calcPf(p) }; });
        // база для чипа «N% капитала» — только видимые: скрытый выведен из учёта,
        // и считать его долю в капитале, которого он больше не составляет, нельзя
        var total = 0; rows.forEach(function (r) { if (!r.p.hidden) total += r.c.value; });
        if (pfPlistSort === 'name') rows.sort(function (a, b) { return a.p.name.localeCompare(b.p.name, 'ru'); });
        else if (pfPlistSort === 'yield') rows.sort(function (a, b) { return (b.c.invested > 0 ? b.c.pnlPct : -1e9) - (a.c.invested > 0 ? a.c.pnlPct : -1e9); });
        else rows.sort(function (a, b) { return b.c.value - a.c.value; });
        var seg = '<div class="pft-kinds pfpl-sort">' + [['value', 'Стоимость'], ['yield', 'Доходность'], ['name', 'Имя']].map(function (x) {
            return '<button type="button" class="pft-kind' + (pfPlistSort === x[0] ? ' on' : '') + '" onclick="pfPlistSetSort(\'' + x[0] + '\', event)">' + x[1] + '</button>';
        }).join('') + '</div>';
        var add = '<button type="button" class="pfpl-add" onclick="pfAddPortfolio()" title="Создать новый портфель">' + PFD_PLUS_SVG + '<span>Новый портфель</span></button>';
        // подписи колонок — ОДИН раз над списком (эталон — таблица ОФЗ,
        // см. table-header-data-convention), а не в каждой строке заново
        var cols = '<div class="pfpl-cols" aria-hidden="true">' +
            '<span class="c-name">Портфель</span>' +
            '<span>Стоимость</span>' +
            '<span>Доходность</span>' +
            '<span>Вложено</span>' +
            '<span class="c-spark">Динамика</span>' +
            '<span class="c-gear"></span>' +
        '</div>';
        var body = cols + '<div class="pfpl-list">' + rows.map(function (r) {
            var p = r.p, c = r.c, ac = colorVal(p.color);
            var n = (p.holdings || []).filter(function (h) { return aggHolding(h).qty > 0; }).length;
            var has = c.invested > 0;
            // key (опционально) — ключ data-live на ячейке: живые «Стоимость» и
            // «Доходность» (число + чип) переписывает точечно livePatchers.plist
            function kpi(v, cls, extra, key) {
                return '<span class="pfpl-kpi"' + (key ? ' data-live="' + key + '"' : '') + '><b class="' + (cls || '') + '">' + v + '</b>' + (extra || '') + '</span>';
            }
            // R9.3: числа строк — в том же языке, что KPI-плитки «Составов» (крупное
            // моно + чип с контекстом), иначе рядом с плитками список читался пусто.
            // Чип у стоимости — доля портфеля в общем капитале (при 2+ портфелях: у
            // одного она всегда 100% и смысла не несёт), у доходности — процент.
            function chip(cls, tx) { return '<span class="pfsm-chip ' + cls + '">' + tx + '</span>'; }
            function absPct(x) { return Math.abs(x).toFixed(1).replace('.', ',') + '%'; }
            var shareChip = (rows.length > 1 && total > 0 && c.value > 0 && !p.hidden)
                ? chip('', Math.round(c.value / total * 100) + '% капитала') : '';
            var yld = has
                ? kpi((c.pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(c.pnl)), c.pnl >= 0 ? 'pos' : 'neg',
                    chip(c.pnlPct >= 0 ? 'pos' : 'neg', (c.pnlPct >= 0 ? '▲ ' : '▼ ') + absPct(c.pnlPct)), 'pfpl:' + p.id + ':yld')
                : kpi('—', 'muted', '', 'pfpl:' + p.id + ':yld');
            var hid = !!p.hidden;
            // значок-глаз скрытого — КНОПКА возврата (просьба 2026-07-30): раньше
            // вернуть портфель можно было только из «Видимости», а список — самое
            // очевидное место. pfToggleHidden сам гасит клик строки (stopPropagation)
            var hidMark = hid
                ? '<button type="button" class="pfpl-hid" onclick="pfToggleHidden(\'' + p.id + '\',event)" title="Портфель выведен из учёта — нажмите, чтобы вернуть" aria-label="Вернуть портфель в учёт">' + PF.EYEOFF_SVG + '</button>'
                : '';
            return '<div class="pfpl-row' + (hid ? ' hid' : '') + '" role="button" tabindex="0" onclick="pfxOpenPf(\'' + p.id + '\')" title="Открыть дашборд портфеля">' +
                '<span class="pfpl-ic" style="--pc:' + ac + '">' + PFPL_CASE_SVG + '</span>' +
                '<span class="pfpl-id"><b><span class="pfpl-nm">' + esc(p.name) + '</span>' + hidMark + '</b>' +
                    '<i>' + n + ' ' + PF.plural(n, 'актив', 'актива', 'активов') +
                    (hid ? ' · вне учёта' : '') + '</i></span>' +
                kpi(fmtRub(c.value), '', shareChip, 'pfpl:' + p.id + ':val') +
                yld +
                kpi(has ? fmtRub(c.invested) : '—', has ? '' : 'muted') +
                '<span class="pfpl-spark" data-pid="' + p.id + '">' + pfPlistSparkSvg(p) + '</span>' +
                '<button type="button" class="pfc-act pfpl-gear" onclick="event.stopPropagation(); pfxPortSettings(\'' + p.id + '\')" title="Настройки портфеля" aria-label="Настройки портфеля">' + PFPL_GEAR_SVG + '</button>' +
            '</div>';
        }).join('') + '</div>';
        return '<div class="dash2-card pf-card2 pf-plistblk">' +
            PF.pfCardHead(PF.store.items.length, 'Список портфелей', 'стоимость, доходность и мини-график',
                // подпись у сегмента — иначе «Стоимость|Доходность|Имя» читается как
                // фильтр или вкладки, а не сортировка (просьба 2026-07-16).
                // Кнопки виджета — ПЕРВЫМИ в ряду (слева от сортировки), а не в углу
                '<div class="pfpl-head-r">' + pfdInChromeHtml('plist') +
                    '<span class="pfpl-sort-cap">Сортировка</span>' + seg + add + '</div>',
                'pfpl:sub') + body +
            PF.pfCardFoot('всего по портфелям', '<span data-live="pfpl:tot">' + fmtRub(total) + '</span>', null) + '</div>';
    }

    // ---- точечный фоновый апдейт «Списка портфелей» (роадмап №6) ----
    // Переписывает по data-live узлам: общую сумму в подзаголовке шапки
    // (pfpl:sub) и ячейки строк «Стоимость» (число + чип доли) и «Доходность»
    // (число + чип %) — pfpl:<pid>:val/yld, разметка зеркалит kpi()/chip() выше.
    // Полному рендеру оставлены: ПОРЯДОК строк (сортировки «Стоимость» и
    // «Доходность» живые), спарклайн (свой перерисовщик pfPlistSparksSoon,
    // живой хвост дорисуется следующим полным рендером) и «Вложено» (не
    // котировочное). Скелетонов прогрева у виджета нет.
    PF.livePatchers.plist = function () {
        var vis = PF.store.items;   // список полный, включая скрытые — как в pfwPlistHtml
        if (!vis.length) return;
        var total = 0, cs = {};
        vis.forEach(function (p) { var c = calcPf(p); cs[p.id] = c; total += c.value; });
        PF.liveSet('pfpl:tot', { text: fmtRub(total) });
        function chip(cls, tx) { return '<span class="pfsm-chip ' + cls + '">' + tx + '</span>'; }
        function absPct(x) { return Math.abs(x).toFixed(1).replace('.', ',') + '%'; }
        vis.forEach(function (p) {
            var c = cs[p.id], has = c.invested > 0;
            var shareChip = (vis.length > 1 && total > 0 && c.value > 0)
                ? chip('', Math.round(c.value / total * 100) + '% капитала') : '';
            PF.liveSet('pfpl:' + p.id + ':val', { html: '<b class="">' + fmtRub(c.value) + '</b>' + shareChip });
            PF.liveSet('pfpl:' + p.id + ':yld', { html: has
                ? '<b class="' + (c.pnl >= 0 ? 'pos' : 'neg') + '">' + (c.pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(c.pnl)) + '</b>' +
                    chip(c.pnlPct >= 0 ? 'pos' : 'neg', (c.pnlPct >= 0 ? '▲ ' : '▼ ') + absPct(c.pnlPct))
                : '<b class="muted">—</b>' });
        });
    };
    // «Структура по портфелям»: кольцо распределения стоимости + легенда
    function pfwPstructHtml() {
        var vis = visibleItems(), total = 0;
        var rows = [];
        vis.forEach(function (p) {
            var v = calcPf(p).value;
            if (!(v > 0)) return;
            total += v;
            rows.push({ name: p.name, color: colorVal(p.color), v: v });
        });
        var body;
        if (!total) {
            body = '<div class="pfal-empty">Добавьте бумаги в портфели — распределение стоимости появится автоматически.</div>';
        } else {
            rows.sort(function (a, b) { return b.v - a.v; });
            var R = 54, C = 2 * Math.PI * R, off = 0;
            var segs = rows.map(function (r) {
                var len = r.v / total * C;
                var s = '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + r.color + '" stroke-width="16" stroke-dasharray="' + Math.max(len - 2.5, 0.8).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '" stroke-linecap="round"/>';
                off += len;
                return s;
            }).join('');
            // строка легенды мокапа (.don-r): доля — громкое число, рубли за ней
            // тихо. Было наоборот, хотя виджет отвечает на вопрос «какая доля».
            var legend = rows.map(function (r) {
                var pct = (r.v / total * 100);
                return '<div class="pfps-lrow"><i style="background:' + r.color + '"></i>' +
                    '<span class="pfps-ln">' + esc(r.name) + '</span>' +
                    '<b class="pfps-lp">' + pct.toFixed(1).replace('.', ',') + '%</b>' +
                    '<em class="pfps-lv">' + fmtRub(r.v) + '</em></div>';
            }).join('');
            // Центр кольца ПУСТОЙ — как у pfdAllocDonut выше: сумма в дырке
            // сжималась до 15px, чтобы влезть, и спорила с сегментами. Общая
            // стоимость переехала в подзаголовок шапки — то же место и тот же
            // приём, что у «Списка портфелей» (и обновляется так же точечно).
            body = '<div class="pfps-wrap">' +
                '<div class="pfps-ring"><svg viewBox="0 0 140 140"><g transform="rotate(-90 70 70)">' + segs + '</g></svg></div>' +
                '<div class="pfps-legend">' + legend + '</div>' +
            '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-pstructblk">' +
            PF.pfCardHead('', 'Структура по портфелям', pfwPstructSub(total), null, 'pfps:sub') + body + '</div>';
    }
    // подзаголовок «Структуры»: описание + общая стоимость (пока считать нечего —
    // одно описание, иначе в шапке висел бы «0 ₽»)
    function pfwPstructSub(total) {
        return total ? 'общая стоимость · ' + fmtRub(total) : 'распределение стоимости';
    }
    // ---- точечный фоновый апдейт «Структуры» (роадмап №6) ----
    // Живёт только сумма в шапке: сегменты кольца и суммы легенды — геометрия и
    // порядок строк, их пересчитывает полный рендер.
    PF.livePatchers.pstruct = function () {
        var total = 0;
        visibleItems().forEach(function (p) {
            var v = calcPf(p).value;
            if (v > 0) total += v;
        });
        PF.liveSet('pfps:sub', { text: pfwPstructSub(total) });
    };
    // «Сводные показатели»: 4 плитки — стоимость (+за сегодня), доходность, вложено, активы
    function pfwPsumHtml() {
        var value = 0, invested = 0, pnl = 0, dd = 0, hasDd = false, assets = 0, nPf = 0;
        visibleItems().forEach(function (p) {
            var c = calcPf(p);
            value += c.value; invested += c.invested; pnl += c.pnl;
            var d = dayDelta(p, c.value);
            if (d != null) { dd += d; hasDd = true; }
            var k = (p.holdings || []).filter(function (h) { return aggHolding(h).qty > 0; }).length;
            if (k) { assets += k; nPf++; }
        });
        var pct = invested > 0 ? pnl / invested * 100 : null;
        var base = value - dd;
        var ddPct = hasDd && base > 0 ? dd / base * 100 : null;
        // key (опционально) — data-live на плитке: живые «Общая стоимость» и
        // «Общая доходность» переписывает точечно livePatchers.psum
        // Сводка мокапа (.hx-line) — ЛИСТ фактов: метка тихо слева, число моно
        // справа, уточнение за ним. Были четыре плитки с рамкой, фоном,
        // капс-эйбрау и цветной пилюлей — карточки внутри карточки, ровно то,
        // от чего раунд «Витраж» уходит.
        function row(l, v, vCls, tail, key) {
            return '<span class="pfsm-r"' + (key ? ' data-live="' + key + '"' : '') + '>' +
                '<i>' + l + '</i><b class="' + (vCls || '') + '">' + v + '</b>' +
                (tail || '') + '</span>';
        }
        function tail(cls, tx) { return '<em class="' + cls + '">' + tx + '</em>'; }
        // проценты в хвосте — БЕЗ знака (направление уже говорит стрелка ▲/▼)
        function absPct(x) { return Math.abs(x).toFixed(1).replace('.', ',') + '%'; }
        var ddTail = hasDd
            ? tail(dd >= 0 ? 'pos' : 'neg', (dd >= 0 ? '▲ ' : '▼ ') + (ddPct != null ? absPct(ddPct) : fmtRub(Math.abs(dd))) + ' за сегодня')
            : tail('', 'дневное изменение — со второго дня');
        var body = '<div class="pfsm-list">' +
            row('Общая стоимость', fmtRub(value), '', ddTail, 'psum:val') +
            row('Общая доходность', invested > 0 ? (pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(pnl)) : '—', pnl >= 0 ? 'pos' : 'neg',
                pct != null ? tail(pct >= 0 ? 'pos' : 'neg', (pct >= 0 ? '▲ ' : '▼ ') + absPct(pct)) : '', 'psum:pnl') +
            row('Вложено своих денег', invested > 0 ? fmtRub(invested) : '—') +
            row('Бумаг в портфелях', String(assets), '', tail('', 'в ' + nPf + ' ' + PF.plural(nPf, 'портфеле', 'портфелях', 'портфелях'))) +
        '</div>';
        return '<div class="dash2-card pf-card2 pf-psumblk">' +
            PF.pfCardHead('', 'Сводные показатели', 'итог по всем видимым портфелям', null) + body + '</div>';
    }

    // ---- точечный фоновый апдейт «Сводных показателей» (роадмап №6) ----
    // Переписывает содержимое живых строк целиком (метка + число + хвост —
    // зеркалит row()/tail() выше): «Общая стоимость» с хвостом «за сегодня» и
    // «Общая доходность» с хвостом %. «Вложено» и «Бумаг в портфелях» — не
    // котировочные, остаются как есть. Скелетонов прогрева у виджета нет
    // (до котировок числа считаются по фолбэкам calcPf, как и в htmlFn).
    PF.livePatchers.psum = function () {
        var value = 0, invested = 0, pnl = 0, dd = 0, hasDd = false;
        visibleItems().forEach(function (p) {
            var c = calcPf(p);
            value += c.value; invested += c.invested; pnl += c.pnl;
            var d = dayDelta(p, c.value);
            if (d != null) { dd += d; hasDd = true; }
        });
        var pct = invested > 0 ? pnl / invested * 100 : null;
        var base = value - dd;
        var ddPct = hasDd && base > 0 ? dd / base * 100 : null;
        function tail(cls, tx) { return '<em class="' + cls + '">' + tx + '</em>'; }
        function absPct(x) { return Math.abs(x).toFixed(1).replace('.', ',') + '%'; }
        var ddTail = hasDd
            ? tail(dd >= 0 ? 'pos' : 'neg', (dd >= 0 ? '▲ ' : '▼ ') + (ddPct != null ? absPct(ddPct) : fmtRub(Math.abs(dd))) + ' за сегодня')
            : tail('', 'дневное изменение — со второго дня');
        PF.liveSet('psum:val', { html: '<i>Общая стоимость</i><b class="">' + fmtRub(value) + '</b>' + ddTail });
        PF.liveSet('psum:pnl', { html: '<i>Общая доходность</i><b class="' + (pnl >= 0 ? 'pos' : 'neg') + '">' +
            (invested > 0 ? (pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(pnl)) : '—') + '</b>' +
            (pct != null ? tail(pct >= 0 ? 'pos' : 'neg', (pct >= 0 ? '▲ ' : '▼ ') + absPct(pct)) : '') });
    };

    // ==================================================================
    //  ИНТЕРФЕЙС ВИДЖЕТОВ (window.PF)
    // ==================================================================
    PF.GO_ARROW_SVG = GO_ARROW_SVG; PF.NOTE_CHECK_SVG = NOTE_CHECK_SVG; PF.NOTE_CLOCK_SVG = NOTE_CLOCK_SVG; PF.NOTE_ICON_SVG = NOTE_ICON_SVG;
    PF.NOTE_TRASH_SVG = NOTE_TRASH_SVG; PF.PFP_SLIDERS_SVG = PFP_SLIDERS_SVG; PF.favHtml = favHtml; PF.favTickers = favTickers;
    PF.newsHtmlCache = newsHtmlCache; PF.pfPlistSparksSoon = pfPlistSparksSoon; PF.pfd2 = pfd2; PF.pfdAllocCompute = pfdAllocCompute;
    PF.pfdAllocHtml = pfdAllocHtml; PF.pfdAllocScope = pfdAllocScope; PF.pfxHeroBlockHtml = pfxHeroBlockHtml; PF.pfdCapChartHtml = pfdCapChartHtml; PF.pfdCapChartHtmlB = pfdCapChartHtmlB;
    // для раздела «Что показать на полотне» в магазине виджетов (pfl2CanvasToggle)
    PF.pfdCapShow = pfdCapShow; PF.pfdCapBench = pfdCapBench;
    PF.pfdCapMaybeRepaint = pfdCapMaybeRepaint; PF.pfdCapRepaint = pfdCapRepaint; PF.pfdCapSeries = pfdCapSeries; PF.pfdFlushNotes = pfdFlushNotes;
    PF.pfdHeatHtml = pfdHeatHtml; PF.pfdHeatRepaintSoon = pfdHeatRepaintSoon; PF.pfdHeatRenderNow = pfdHeatRenderNow; PF.pfdKpiHtml = pfdKpiHtml; PF.pfdNewsHtml = pfdNewsHtml;
    PF.pfdNewsList = pfdNewsList; PF.pfdNoteHtml = pfdNoteHtml; PF.pfdPanelActive = pfdPanelActive; PF.pfwAssetsHtml = pfwAssetsHtml;
    PF.pfwConcHtml = pfwConcHtml; PF.pfwIdxHtml = pfwIdxHtml; PF.pfwMoversHtml = pfwMoversHtml; PF.pfwOpsHtml = pfwOpsHtml;
    PF.pfwPassiveHtml = pfwPassiveHtml; PF.pfwPlistHtml = pfwPlistHtml; PF.pfwPstructHtml = pfwPstructHtml; PF.pfwPsumHtml = pfwPsumHtml;
    PF.pfwReportsHtml = pfwReportsHtml; PF.pfwSnapsHtml = pfwSnapsHtml; PF.pfwYieldHtml = pfwYieldHtml; PF.potentialOf = potentialOf;
    PF.ratesHtml = ratesHtml; PF.ratesStackHtml = ratesStackHtml; PF.renderFavNews = renderFavNews; PF.renderPosNews = renderPosNews;
    PF.pfwBrokerHtml = pfwBrokerHtml; PF.renderBrokerPos = renderBrokerPos;
})();
