// ===== ДИНАМИКА КОЛОНКИ САЙДБАРА (мокап Б «Верстак») =====
// Модуль наполняет три узла:
//   #sbCap  — капитал и день по ВСЕМ портфелям (PF.sbCapModel), виден на любой
//             вкладке; пока «Портфели» не загружены лениво, узел пуст;
//   #sbCtx  — второй уровень АКТИВНОГО раздела: подвкладки «Портфелей», экраны
//             «Торговли» третьим уровнем и открытые вкладки-портфели;
//   бейдж на «Ребалансе» в сетке разделов — сколько портфелей просят ребаланса.
//
// Блок второго уровня стоит ПОД СЕТКОЙ разделов, а не под своей строкой:
// в сетке 4×2 у пункта нет «своего» кружка, от которого можно вести линию
// вложенности, — раздел называет первый заголовок блока.
//
// Разделы без второго уровня блока не получают вовсе — он просто не
// показывается (класс body.sb-ctx ставит sbCtxSync).
//
// Данные не выдумываются: модель «Портфелей» отдаёт PF.sbSideModel()
// (portfolios-tabs.js) и она же решает, есть ли честное число под шапку;
// «Расчёт» и «Рынок» зеркалят СВОИ ЖЕ пункты .sb-sub из разметки, включая их
// видимость (подвкладки результатов появляются после первого расчёта).
(function () {
    var MQ = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };
    function wide() { return MQ.matches; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function svg(d) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
    }
    // Иконки второго уровня. Ставятся ТОЛЬКО там, где смысл однозначен: пункт
    // без своей иконки честнее случайной — .sbc-it переживает её отсутствие.
    var IC = {
        overview:  '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        ports:     '<path d="M3 7h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/>',
        analytics: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
        reports:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
        ops:       '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
        rebal:     '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M8 7l-4 7h8z"/><path d="M16 7l-4 7h8z"/>',
        trading:   '<rect x="3.5" y="8" width="6" height="9" rx="1.5"/><path d="M6.5 4v4M6.5 17v3"/><rect x="14.5" y="5" width="6" height="10" rx="1.5"/><path d="M17.5 3v2M17.5 15v6"/>',
        settings:  '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
        plus:      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
        // часы-«цены не свежие»: не восклицательный знак — это не ошибка
        // пользователя и не тревога, а сообщение о возрасте чисел
        warn:      '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
        collapse:  '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>',
        chev:      '<polyline points="6 9 12 15 18 9"/>',
        // шеврон вправо — признак «пилюля нажимается» в табло капитала
        chevr:     '<polyline points="9 5 16 12 9 19"/>',
        // академическая шапочка — вход в шторку #rbxAcademy из блока «Академии»
        cap:       '<path d="M21.4 10.9a1 1 0 0 0 0-1.8l-8.5-3.9a2 2 0 0 0-1.7 0L2.7 9.1a1 1 0 0 0 0 1.8l8.5 3.9a2 2 0 0 0 1.7 0z"/><path d="M6 12.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5"/>',
        arrow:     '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
        // подвкладки «Расчёта» и «Рынка» — по data-sub
        'calc-portfolio': '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
        'calc-mix':       '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        'calc-monthly':   '<rect x="2.5" y="6" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
        // второй уровень «Расчёта» (раунд «Пульт»)
        'calc-growth':    '<path d="M3 17l6-6 4 4 8-8"/><polyline points="15 7 21 7 21 13"/>',
        'calc-basket':    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
        'calc-quiz':      '<path d="M9.5 17h5"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9V17h-7v-3.1A6 6 0 0 1 12 3z"/>',
        'market-terminal':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/>',
        'market-stocks':  '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        'market-bonds':   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
    };
    var X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    // ---------- модели ----------
    // «Расчёт» / «Рынок»: зеркало собственных .sb-sub — единственный источник
    // правды об их составе и видимости остаётся в разметке + calc-mode.js
    function subsModel(group, title) {
        var g = document.querySelector('.sb-group[data-group="' + group + '"]');
        if (!g) return null;
        var items = [];
        Array.prototype.forEach.call(g.querySelectorAll('.sb-sub'), function (s) {
            if (s.style.display === 'none') return;
            var key = s.getAttribute('data-sub') || '';
            var tx = s.querySelector('.sb-sub-tx');
            items.push({
                act: 'sub', key: key,
                tx: tx ? tx.textContent : key,
                icon: IC[key],
                on: s.classList.contains('active')
            });
        });
        if (!items.length) return null;
        return { title: title, solo: true, groups: [{ label: 'Разделы', items: items }] };
    }

    // «Расчёт» (раунд «Пульт»): второй уровень раздела — это ТИП ПОРТФЕЛЯ.
    // Раньше колонка зеркалила один видимый .sb-sub и стояла почти пустой, пока
    // тип переключался внутри контента — чузером и крошкой в шапке. Теперь
    // переключатель живёт здесь, а вкладка избавлена от собственной навигации.
    //
    // Справа только СЧЁТЧИКИ: сколько выпусков в корзине, сколько вопросов в
    // тесте. Сумм и прогноза в навигации нет — они живут на рабочей площади, и
    // продублированные в рейке спорили бы с ней за внимание.
    function curMode() {
        var c = document.body.classList;
        return c.contains('cxm-mix') ? 'mix' : c.contains('cxm-monthly') ? 'monthly' : 'choose';
    }
    function subVisible(id) {
        var el = document.getElementById(id);
        return !!el && el.style.display !== 'none';
    }
    function countOf(fn) {
        try { var n = fn(); return (n > 0) ? n : null; } catch (e) { return null; }
    }
    function calcModel() {
        var m = curMode();
        var groups = [{
            label: 'Тип портфеля',
            items: [
                { act: 'cxmode', key: 'mix', tx: 'Рост капитала',
                  icon: IC['calc-growth'], on: m === 'mix' },
                { act: 'cxmode', key: 'monthly', tx: 'Ежемесячный доход',
                  icon: IC['calc-monthly'], on: m === 'monthly' }
            ]
        }];

        // Готовый расчёт: пункт появляется только после настоящего расчёта —
        // ровно тогда, когда calc-mode.js показывает соответствующий .sb-sub.
        var done = [];
        if (subVisible('sbSubMix')) {
            done.push({ act: 'sub', key: 'calc-mix', tx: 'Смешанный портфель',
                        icon: IC['calc-mix'],
                        on: (typeof currentTab !== 'undefined' && currentTab === 'portfolio') });
        }
        if (subVisible('sbSubMonthly')) {
            done.push({ act: 'sub', key: 'calc-monthly', tx: 'Корзина ОФЗ',
                        icon: IC['calc-basket'],
                        n: countOf(function () { return monthlyIncomeBonds.length; }) });
        }
        if (done.length) groups.push({ label: 'Готовый расчёт', items: done });

        // VG_Q объявлен const в vanguard-test.js — он в глобальной области, но
        // не на window, поэтому только через typeof
        groups.push({
            label: 'Подбор',
            items: [{ act: 'cxquiz', key: 'quiz', tx: 'Тест риск-профиля',
                      icon: IC['calc-quiz'],
                      n: countOf(function () { return VG_Q.length; }) }]
        });
        return { title: 'Расчёт', solo: true, groups: groups };
    }

    // У каких разделов второй уровень есть в принципе. Ширину он больше не
    // двигает (колонка всегда 268px), так что резервировать нечего — карта
    // осталась ответом на вопрос «есть ли у раздела что раскрывать».
    var COL_TITLE = {
        portfolios: 'Портфели',
        calc: 'Расчёт', portfolio: 'Расчёт', monthly: 'Расчёт',
        market: 'Рынок', 'market-stocks': 'Рынок', 'market-bonds': 'Рынок',
        // «Академия»: второй уровень тут не список, а МАНИФЕСТ — см. whyHtml
        rebalance: 'Академия'
    };
    // есть ли у раздела второй уровень — спрашивает sidebar.js, чтобы клик по
    // разделу возвращал свёрнутую колонку
    window.sbCtxHas = function (tab) { return !!COL_TITLE[tab]; };
    function modelFor(tab) {
        if (!wide()) return null;
        if (tab === 'portfolios') {
            return (window.PF && PF.sbSideModel) ? PF.sbSideModel() : null;
        }
        if (tab === 'calc' || tab === 'portfolio' || tab === 'monthly') return calcModel();
        if (tab === 'market' || tab === 'market-stocks' || tab === 'market-bonds') return subsModel('market', 'Рынок');
        // «Академия» — единственный раздел без подвкладок: у него второй уровень
        // не навигация, а текст. Модель-флаг, содержимое статично (whyHtml).
        if (tab === 'rebalance') return { why: true };
        return null;
    }

    /* ---------- МАНИФЕСТ «ЗАЧЕМ РЕБАЛАНСИРОВАТЬ» (только «Академия») ----------
       Слот второго уровня у этого раздела пустовал, а на странице манифест
       занимал треть ширины и теснил списки. Здесь он и живёт — но это ДОБАВКА,
       а не переезд: в рейке 84px и на мобиле второго уровня нет, поэтому вход в
       шторку дублируется в витрине вкладки (rbxTopSync в js/rebalance.js).

       Голосов ровно столько, сколько нужно, чтобы блок не превратился в кашу:
       серифный заголовок → волосяная черта → одна строка Inter → три тезиса ПО
       ОДНОЙ строке. Метки группы над заголовком НЕТ (два заголовка подряд
       смотрелись скомканно), эпиграфа серифным курсивом — тоже: второй серифный
       голос вплотную к заголовку и создавал ту самую кашу. Расшифровки тезисов
       и цитата живут в шторке — здесь для них нет ширины.
       Вход — КАРТОЧКА в языке табло капитала (та же пилюля, тот же радиус, но с
       зелёным квадратом-иконкой): тихую строку с шевроном можно было вовсе не
       заметить, а это единственный вход в академию на десктопе. Прижата к низу
       (margin-top:auto в css) — воздух между тезисами и действием читается как
       разрядка, а не как дыра. */
    var WHY = [
        ['I', 'Фиксируем прибыль'],
        ['II', 'Докупаем недооценённое'],
        ['III', 'Держим риск по плану']
    ];
    function whyHtml() {
        var h = '<div class="sbc-why">' +
            '<h3 class="sbc-why-t">Зачем ребалансировать</h3>' +
            '<div class="sbc-why-rule" aria-hidden="true"></div>' +
            '<p class="sbc-why-lead">Рынок незаметно переписывает доли: выросшее начинает весить больше положенного.</p>';
        WHY.forEach(function (w) {
            h += '<div class="sbc-th"><span class="n">' + w[0] + '</span><b>' + esc(w[1]) + '</b></div>';
        });
        h += '<button type="button" class="sbc-acad" data-act="acad" data-key=""' +
            ' title="Открыть академию ребалансировки">' +
            '<span class="ic">' + svg(IC.cap) + '</span>' +
            '<span class="tx"><b>Академия ребалансировки</b>' +
            '<i>Три разбора с примерами' + svg(IC.arrow) + '</i></span></button>';
        return h + '</div>';
    }

    // ---------- разметка ----------
    function itemHtml(it) {
        var cls = 'sbc-it' + (it.on ? ' on' : '') + (it.cls ? ' ' + it.cls : '');
        // иконку модель может отдать готовым path'ом, ключом словаря или вовсе
        // не отдать (экраны «Торговли» — третий уровень, там её и не должно быть)
        var icon = it.icon || IC[it.iconKey] || (it.act === 'pfx' || it.act === 'trading' ? IC[it.key] : null);
        var right = '';
        // сумма и дневное изменение стоят рядом: сумма — где портфель сейчас,
        // изменение — куда он идёт. Под курсором изменение уступает крестику
        // (css), сумма остаётся: закрывая вкладку, полезно видеть, что закрываешь
        if (it.val) right += '<span class="sbc-val">' + esc(it.val) + '</span>';
        if (it.chg) right += '<span class="sbc-chg' + (it.chg.neg ? ' neg' : '') + '">' + esc(it.chg.tx) + '</span>';
        else if (it.n != null) right += '<span class="sbc-n">' + esc(it.n) + '</span>';
        if (it.close) {
            right += '<span class="sbc-x" role="button" tabindex="0" data-act="' + esc(it.close.act) + '" data-key="' +
                esc(it.close.key) + '" title="Закрыть вкладку" aria-label="Закрыть вкладку">' + X_SVG + '</span>';
        }
        return '<button type="button" class="' + cls + '" data-act="' + esc(it.act) + '" data-key="' + esc(it.key) + '"' +
            (it.on ? ' aria-current="page"' : '') + (it.title ? ' title="' + esc(it.title) + '"' : '') + '>' +
            (it.dot ? '<span class="sbc-dot" style="background:' + esc(it.dot) + '"></span>' : '') +
            (icon ? svg(icon) : '') +
            '<span class="sbc-tx">' + esc(it.tx) + '</span>' + right +
        '</button>';
    }
    // ---- свёртка длинного списка ----
    // «Портфели» отдают семь разделов подряд, и низ колонки они забирают
    // целиком. Прячем ВТОРОСТЕПЕННЫЕ — те, за которыми ходят реже всего
    // (мокап Б оставляет на виду Обзор · Мои портфели · Аналитика · Операции ·
    // Торговля). Прятать «последние N» было бы проще, но «Торговля» стоит в
    // списке последней, и её как раз открывают чаще всего.
    var SECONDARY = { reports: 1, rebal: 1 };
    // Раскрытие ЗАПОМИНАЕТСЯ (раунд 4): кто ходит в «Отчёты» каждый день,
    // раскрывает список один раз. Ключ зеркалится в облако как позиция UI
    // (см. WATCH в js/cloud-sync.js) — на втором устройстве список тот же.
    var MORE_KEY = 'sb_more_v1';
    var moreOpen = (function () {
        try { return localStorage.getItem(MORE_KEY) === '1'; } catch (e) { return false; }
    })();
    // Хвост сворачиваем только когда прятать есть что И список действительно
    // длинный: у трёх пунктов «Ещё» само стало бы четвёртым.
    function splitMore(items) {
        var hid = [];
        if (items.length <= 5) return { show: items, hid: hid };
        var show = items.filter(function (it) {
            // активный пункт и его третий уровень не прячем никогда: список
            // обязан показывать, где ты стоишь
            if (!SECONDARY[it.key] || it.on || it.cls === 'lvl3') return true;
            hid.push(it);
            return false;
        });
        return { show: show, hid: hid };
    }
    function moreHtml(hid) {
        // Строка НАЗЫВАЕТ скрытое, а не прячет его за глухим «Ещё»: сколько бы
        // имён ни влезло, информационный след остаётся, а счётчик справа держит
        // точное число — его многоточие не съест.
        var tx = moreOpen ? 'Свернуть' : ('Ещё · ' + hid.map(function (it) { return it.tx; }).join(', '));
        return '<button type="button" class="sbc-it more' + (moreOpen ? ' open' : '') + '" data-act="ctxmore" data-key=""' +
            ' aria-expanded="' + (moreOpen ? 'true' : 'false') + '">' + svg(IC.chev) +
            '<span class="sbc-tx">' + esc(tx) + '</span>' +
            (moreOpen ? '' : '<span class="sbc-n">' + hid.length + '</span>') + '</button>';
    }
    // Шапки-карточки у блока нет: раздел называет ПЕРВЫЙ заголовок группы.
    // Модельные cap/chip остаются — их отдаёт PF.sbSideModel, но капитал теперь
    // рисует свой узел #sbCap (он виден на любой вкладке, а не только здесь).
    function listHtml(m, tab) {
        var h = '', first = true;
        (m.groups || []).forEach(function (g) {
            if (!g.items || !g.items.length) return;
            var items = g.items, tailHtml = '';
            var lab = g.label;
            if (first) {
                // «Разделы» — служебное имя группы; вслух блок называется именем
                // раздела, а его могли переименовать из админки (js/tab-gates.js)
                if (!lab || lab === 'Разделы') lab = tabName(SEC_OF[tab] || tab) || m.title || '';
                var sp = splitMore(items);
                items = sp.show;
                if (sp.hid.length) tailHtml = moreHtml(sp.hid);
                if (moreOpen && sp.hid.length) items = g.items;
            }
            if (lab) h += '<div class="sbc-grp"><span>' + esc(lab) + '</span></div>';
            h += items.map(itemHtml).join('') + tailHtml;
            first = false;
        });
        return '<div class="sbc-list">' + h + '</div>';
    }
    // Имя раздела для заголовка блока: переименование из админки старше словаря
    // моделей. Спрашиваем именно ВЕРХНИЙ раздел, а не текущую вкладку: у
    // 'market-stocks' своё имя («Терминал»), и заголовком группы оно соврало бы.
    var SEC_OF = {
        portfolios: 'portfolios',
        calc: 'calc', portfolio: 'calc', monthly: 'calc',
        market: 'market', 'market-stocks': 'market', 'market-bonds': 'market'
    };
    function tabName(tab) {
        try {
            if (window.tabGates && window.tabGates.titleOf) return window.tabGates.titleOf(tab) || '';
        } catch (e) {}
        return '';
    }
    // ---------- подвал ----------
    // «Настройки» раздела живут ВНИЗУ колонки, а не в конце списка: список
    // раскрывается под активным разделом, и подвал, приклеенный к нему, висел бы
    // посреди навигации.
    // С 2026-07-28 это ШЕСТЕРЁНКА в ряду личного, рядом с лупой (просьба
    // владельца): широкой строкой «⚙ Настройки» подвал занимал целый ряд ради
    // одного пункта, а рядом уже стоял ряд круглых кнопок того же назначения.
    // Кнопка живёт в разметке (#sbSettingsBtn) — здесь только её видимость и
    // адрес перехода; клик ловит общий слушатель #sbRailFoot по data-act.
    function footSync(m) {
        var btn = document.getElementById('sbSettingsBtn');
        if (!btn) return;
        var f = (m && m.foot && wide()) ? m.foot : null;
        btn.hidden = !f;
        if (!f) { btn.removeAttribute('data-act'); btn.removeAttribute('data-key'); return; }
        btn.setAttribute('data-act', f.act);
        btn.setAttribute('data-key', f.key || '');
        btn.classList.toggle('on', !!f.on);
        var tx = f.tx || 'Настройки';
        if (btn.title !== tx) { btn.title = tx; btn.setAttribute('aria-label', tx); }
        btn.setAttribute('aria-current', f.on ? 'page' : 'false');
    }

    // ---------- КАПИТАЛ (#sbCap) ----------
    // Единственные числа навигации. Виден на ЛЮБОЙ вкладке, поэтому и модель
    // своя (PF.sbCapModel), а не кусок sbSideModel: тот собирается только для
    // «Портфелей». Пока цепочка #pfLazySrc не загружена, PF нет вовсе — узел
    // остаётся пустым, и CSS (#sbCap:empty) убирает его вместе с отступами.
    // Маскировать суммы не наше дело: sums-privacy.js сам находит лист с «₽».
    // ---- интрадей-ряд для спарклайна ----
    // Готового ряда «капитал в течение дня» в проекте нет: снимки пишутся раз в
    // сутки. Собираем свой — точка не чаще раза в минуту, ключ живёт один день
    // (в облако НЕ зеркалим: это данные устройства за сегодня, а не позиция UI).
    // Пока точек меньше трёх — линия соврала бы формой, спарклайна просто нет,
    // но строка своей высоты не теряет: табло не должно прыгать на третьей точке.
    var SERIES_KEY = 'sb_day_series', SERIES_MIN_MS = 60000, SERIES_MAX = 300;
    function today() {
        var d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }
    function series(total) {
        var s = null;
        try { s = JSON.parse(localStorage.getItem(SERIES_KEY) || 'null'); } catch (e) {}
        if (!s || s.d !== today() || !Array.isArray(s.v)) s = { d: today(), v: [], t: 0 };
        var now = Date.now();
        if (total > 0 && (now - (s.t || 0) >= SERIES_MIN_MS)) {
            s.v.push(Math.round(total));
            if (s.v.length > SERIES_MAX) s.v = s.v.slice(-SERIES_MAX);
            s.t = now;
            try { localStorage.setItem(SERIES_KEY, JSON.stringify(s)); } catch (e) {}
        }
        return s.v;
    }
    // Линия во всю ширину табло: viewBox тянется по ширине (preserveAspectRatio
    // none), поэтому толщина штриха задана vector-effect, а не расчётом.
    function sparkHtml(v, neg) {
        if (!v || v.length < 3) return '';
        var min = Math.min.apply(null, v), max = Math.max.apply(null, v);
        var span = max - min;
        var W = 200, H = 24;
        var pts = v.map(function (n, i) {
            var x = v.length > 1 ? (i / (v.length - 1) * W) : 0;
            // плоский день — линия ровно посередине, а не по верхнему краю
            var y = span > 0 ? (H - (n - min) / span * H) : H / 2;
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
        return '<svg class="sbcap-spark' + (neg ? ' neg' : '') + '" viewBox="0 0 ' + W + ' ' + H +
            '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
    }
    // Табло: капитал, день в рублях и процентах, линия дня. Клик ведёт на
    // «Обзор» — там капитал разобран по полочкам, поэтому у линии есть шеврон:
    // он не отдельная кнопка, а признак, что нажимается вся пилюля.
    // ПОЛОСА КЛАССОВ С НАСЕЧКОЙ ЦЕЛИ СНЯТА (просьба владельца 2026-07-28) —
    // на её месте и ровно в её высоту стоит линия дня. Доли и дрейф остались у
    // «Обзора» и «Ребаланса»; бейдж на кружке «Ребаланса» о дрейфе по-прежнему
    // говорит — геометрией об этом колонка больше не рассказывает.
    // ПУСТОЕ СОСТОЯНИЕ. У нового пользователя портфелей нет, табло схлопывалось
    // через #sbCap:empty, и верх колонки читался не пустым, а сломанным: между
    // именем продукта и сеткой разделов зияла дыра, а второй уровень «Портфелей»
    // состоял из одного «Обзора». На месте табло встаёт ВХОД: та же пилюля того
    // же размера, но зовёт не смотреть капитал, а завести первый портфель.
    // Два повода для пустоты — и зовут они в разные места: портфелей нет вовсе
    // ('new') или портфель заведён, но пуст ('fill'). Одно «Создать портфель» на
    // оба случая советовало бы второму пользователю завести лишний портфель
    // вместо того, чтобы наполнить уже созданный.
    var CAP_EMPTY = {
        'new':  { act: 'capnew', t: 'Создать портфель', s: 'Капитал и день появятся здесь' },
        'fill': { act: 'capfill', t: 'Добавить бумаги', s: 'В портфеле пока пусто' }
    };
    function capEmptyHtml(kind) {
        var c = CAP_EMPTY[kind] || CAP_EMPTY['new'];
        return '<button type="button" class="sbcap-btn sbcap-empty" data-act="' + c.act + '" data-key=""' +
            ' title="' + esc(c.t) + '">' +
            '<span class="sbcap-plus" aria-hidden="true">' + svg(IC.plus) + '</span>' +
            '<span class="sbcap-etx"><b>' + esc(c.t) + '</b><i>' + esc(c.s) + '</i></span></button>';
    }
    function capHtml(m) {
        if (m.empty) return capEmptyHtml(m.empty);
        var h = '<div class="sbcap-top"><span class="sbcap-l">Капитал · все портфели</span></div>' +
            '<div class="sbcap-v"><span class="sbcap-n">' + esc(m.cap) + '</span>' +
            (m.chip ? '<span class="sbcap-d' + (m.chip.neg ? ' neg' : '') + '">' + esc(m.chip.tx) + '</span>' : '') +
            '</div>';
        if (m.dayRub && m.chip) {
            // Две редакции строки дня в разметке, выбирает CSS по body.sums-hidden:
            // под маской «Скрывать суммы» рубли не размываются, а уступают место
            // процентам (мокап Б+2б) — размытая «•• ••• ₽ за сегодня» читалась бы
            // сломанной строкой, а не защищённой.
            h += '<div class="sbcap-day' + (m.chip.neg ? ' neg' : '') + '">' +
                '<span class="sbcap-rub">' + esc(m.dayRub) + ' за сегодня</span>' +
                '<span class="sbcap-pct">' + esc(m.chip.tx) + ' за сегодня</span></div>';
        } else {
            // снимка ещё нет — ни дня, ни спарклайна, ни прочерков: одна подпись
            h += '<div class="sbcap-day mut">День появится после второго снимка</div>';
        }
        // Ряд линии стоит ВСЕГДА: пока точек мало, в нём остаётся один шеврон, и
        // высота табло не зависит от того, сколько минут открыта вкладка.
        h += '<div class="sbcap-spk">' + sparkHtml(series(m.total), m.chip && m.chip.neg) +
            '<span class="sbcap-go" aria-hidden="true">' + svg(IC.chevr) + '</span></div>';
        // НЕСВЕЖЕСТЬ. Если MOEX не ответил, цены остаются прежними, и табло
        // молча показывало вчерашнее число сегодняшним — правды об этом в
        // колонке не было вовсе. Метка называет ВРЕМЯ последних пришедших цен
        // (PF.quotesOkTs), а сами числа приглушаются: соврать они не могут, но и
        // выдавать себя за живые не должны.
        var cls = 'sbcap-btn' + (m.stale ? ' stale' : '');
        if (m.stale) h += '<div class="sbcap-stale">' + svg(IC.warn) + '<span>' + esc(m.stale) + '</span></div>';
        return '<button type="button" class="' + cls + '" data-act="capgo" data-key=""' +
            ' title="' + (m.stale ? esc(m.stale) + '. ' : '') + 'Открыть «Обзор»">' + h + '</button>';
    }
    // В СВЁРНУТОЙ РЕЙКЕ КАПИТАЛА НЕТ. Чип «1,46 млн / +0,8%» из мокапа Б+3 был
    // сделан и снят по просьбе владельца: свёрнутая рейка — это выбор «покажи
    // только разделы», и пилюля с суммой в ней спорила с этим выбором. Состояние
    // в 84px по-прежнему держит бейдж дрейфа на кружке «Ребаланса».
    // Бейдж «сколько портфелей просят ребаланса» на кружке раздела. Правило
    // порога живёт в мастере (PF.pfDriftCount) — здесь только показ.
    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
        return many;
    }
    function badgeSync(n) {
        var it = document.querySelector('#sbNav .sb-item[data-tab="rebalance"]');
        if (!it) return;
        var b = it.querySelector('.sb-badge');
        if (!(n > 0) || !wide()) { if (b) b.remove(); return; }
        if (!b) {
            b = document.createElement('span');
            b.className = 'sb-badge';
            it.appendChild(b);
        }
        var tx = String(n);
        if (b.textContent !== tx) b.textContent = tx;
        var lbl = n + ' ' + plural(n, 'портфель просит', 'портфеля просят', 'портфелей просят') + ' ребаланса';
        if (b.getAttribute('aria-label') !== lbl) b.setAttribute('aria-label', lbl);
    }
    function capSync() {
        var host = document.getElementById('sbCap');
        var m = null;
        // Цены обновляет рендер «Портфелей», а табло висит на ЛЮБОЙ вкладке —
        // без этой строчки на «Расчёте» оно показывало бы числа часовой давности
        // и само же честно сообщало о своей несвежести. Вызов дешёвый: внутри
        // ensureQuotes стоит TTL 60с, чаще одного запроса в минуту не выйдет.
        try { if (wide() && window.PF && PF.ensureQuotes && PF.store && PF.store.items.length) PF.ensureQuotes(); } catch (e) {}
        try { m = (wide() && window.PF && PF.sbCapModel) ? PF.sbCapModel() : null; } catch (e) { m = null; }
        if (host) {
            // в рейке табло не живёт вовсе (см. выше) — узел просто пуст
            var rail = document.body.classList.contains('sb-rail');
            var html = (!m || rail) ? '' : capHtml(m);
            if (host.__sbcapHtml !== html) { host.innerHTML = html; host.__sbcapHtml = html; }
        }
        badgeSync(m ? m.drift : 0);
    }

    // ---------- место блока в разметке ----------
    // #sbCtx встаёт сразу ЗА сеткой разделов (#sbNav), внутрь неё не лезет:
    // #sbNav — грид, и блок стал бы его ячейкой. В разметке узел лежит снаружи
    // #sbRail, поэтому переставляем его при первом же рендере.
    function placeCtx(host) {
        var nav = document.getElementById('sbNav');
        if (!nav || !nav.parentNode) return;
        if (nav.nextSibling !== host) nav.parentNode.insertBefore(host, nav.nextSibling);
    }

    // ---------- рендер ----------
    // Своп только при изменении HTML: фоновый тик котировок пересобирает модель
    // каждую секунду, а живой :hover и фокус в колонке рвать нельзя.
    function sbCtxSync() {
        capSync();                                  // капитал живёт и без второго уровня
        // крошка в шапке несёт подвкладку («Портфели · Обзор»), а меняется та
        // без switchTab — обновляем здесь, на каждом рендере «Портфелей»
        if (window.renderHeaderBadge && typeof currentTab !== 'undefined' && currentTab) {
            try { window.renderHeaderBadge(currentTab); } catch (e) {}
        }
        var host = document.getElementById('sbCtx');
        if (!host) return;
        var tab = (typeof currentTab !== 'undefined' && currentTab) ? currentTab : 'home';
        var m = null;
        try { m = modelFor(tab); } catch (e) { m = null; }
        // рейка (свёрнуто или «Главная») второго уровня не показывает
        var rail = document.body.classList.contains('sb-rail');
        var expect = wide() && !rail && !!COL_TITLE[tab];
        document.body.classList.toggle('sb-ctx', expect);
        footSync(expect ? m : null);
        if (!expect || !m) {
            if (host.__sbcHtml) { host.innerHTML = ''; host.__sbcHtml = ''; }
            return;
        }
        var html = m.why ? whyHtml() : listHtml(m, tab);
        if (host.__sbcHtml !== html) {
            var ae = document.activeElement;
            var keepKey = ae && host.contains(ae) && ae.getAttribute ? ae.getAttribute('data-key') : null;
            host.innerHTML = html;
            host.__sbcHtml = html;
            if (keepKey) {
                var back = host.querySelector('.sbc-it[data-key="' + (window.CSS && CSS.escape ? CSS.escape(keepKey) : keepKey) + '"]');
                if (back) { try { back.focus(); } catch (e) {} }
            }
        }
        placeCtx(host);
    }
    window.sbCtxSync = sbCtxSync;

    // ---------- клики ----------
    function onClick(e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var hit = t.closest('[data-act]');
        if (!hit) return;
        var act = hit.getAttribute('data-act'), key = hit.getAttribute('data-key') || '';
        e.preventDefault();
        e.stopPropagation();
        if (act === 'collapse') { if (window.toggleSidebarCollapse) window.toggleSidebarCollapse(); return; }
        if (act === 'ctxmore') {
            moreOpen = !moreOpen;
            try { localStorage.setItem(MORE_KEY, moreOpen ? '1' : '0'); } catch (e) {}
            sbCtxSync();
            return;
        }
        // табло — самый крупный таргет колонки; ведёт туда, где капитал разобран
        if (act === 'capgo') {
            if (typeof currentTab === 'undefined' || currentTab !== 'portfolios') {
                if (window.switchTab) window.switchTab('portfolios');
            }
            if (window.pfxGoTab) window.pfxGoTab('overview');
            return;
        }
        // вход пустого табло: сперва на «Портфели» (кнопка видна с любой вкладки,
        // а новая карточка появляется именно там), потом само создание
        if (act === 'capnew' || act === 'capfill') {
            if (typeof currentTab === 'undefined' || currentTab !== 'portfolios') {
                if (window.switchTab) window.switchTab('portfolios');
            }
            // 'capfill' — портфель уже есть: ведём в «Мои портфели», где бумаги
            // и добавляют, а не заводим второй пустой
            if (act === 'capfill') { if (window.pfxGoTab) window.pfxGoTab('ports'); return; }
            if (window.pfAddPortfolio) window.pfAddPortfolio();
            return;
        }
        // карточка манифеста → шторка академии. Разметка шторки лежит внутри
        // вкладки, поэтому на всякий случай сначала возвращаемся на неё: блок
        // виден только на «Академии», но клавиатурный фокус мог пережить уход
        if (act === 'acad') {
            if (typeof currentTab === 'undefined' || currentTab !== 'rebalance') {
                if (window.switchTab) window.switchTab('rebalance');
            }
            if (window.rbxAcademyOpen) window.rbxAcademyOpen();
            return;
        }
        if (act === 'sub') { if (window.sbNavSub) window.sbNavSub(key, e); return; }
        // тип портфеля: вкладка могла быть не «Расчёт» (пришли с /portfolio)
        if (act === 'cxmode') {
            if (typeof currentTab === 'undefined' || currentTab !== 'calc') {
                if (window.switchTab) window.switchTab('calc');
            }
            if (window.cxSetMode) window.cxSetMode(key);
            return;
        }
        // тест риск-профиля живёт внутри карточки «Стратегия» режима mix
        if (act === 'cxquiz') {
            if (typeof currentTab === 'undefined' || currentTab !== 'calc') {
                if (window.switchTab) window.switchTab('calc');
            }
            if (window.cxSetMode) window.cxSetMode('mix');
            setTimeout(function () { if (window.r5OpenQuiz) window.r5OpenQuiz(); }, 140);
            return;
        }
        if (act === 'pfx') { if (window.pfxGoTab) window.pfxGoTab(key); return; }
        if (act === 'trading') { if (window.pfxGoTrading) window.pfxGoTrading(); return; }
        if (act === 'pf') { if (window.pfxOpenPf) window.pfxOpenPf(key); return; }
        if (act === 'pf-close') { if (window.pfxClosePfTab) window.pfxClosePfTab(key, e); return; }
        if (act === 'pf-new') { if (window.pfAddPortfolio) window.pfAddPortfolio(); return; }
    }
    function onKey(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var t = e.target;
        if (!t || !t.closest || !t.closest('#sbCtx')) return;
        if (t.classList && t.classList.contains('sbc-x')) { onClick(e); }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var host = document.getElementById('sbCtx');
        if (host) {
            host.addEventListener('click', onClick);
            host.addEventListener('keydown', onKey);
        }
        // подвал теперь снаружи блока — его слот слушаем отдельно (кнопка
        // схлопывания в разметке идёт своим onclick и до onClick не доходит:
        // у неё нет data-act)
        var foot = document.getElementById('sbRailFoot');
        if (foot) foot.addEventListener('click', onClick);
        // табло живёт выше сетки и в блок второго уровня не входит — свой слушатель
        var cap = document.getElementById('sbCap');
        if (cap) cap.addEventListener('click', onClick);
        sbCtxSync();
    });
    // ширина рейки меняется вместе с колонкой — пересобираем на кроссинге брейкпоинта
    if (MQ.addEventListener) MQ.addEventListener('change', sbCtxSync);
    else if (MQ.addListener) MQ.addListener(sbCtxSync);
    // Свой тик табло. На «Портфелях» его пересобирает рендер, но на остальных
    // вкладках сайдбар — единственный, кто вообще спрашивает цены: без тика
    // метка возраста однажды бы зажглась и осталась гореть навсегда.
    setInterval(function () {
        if (!wide() || document.hidden) return;
        if (!document.getElementById('sbCap')) return;
        capSync();
    }, 60000);
})();
