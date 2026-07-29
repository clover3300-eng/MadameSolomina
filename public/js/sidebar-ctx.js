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
    // Глаз портфеля — всплывает по наведению на строку, слева от крестика. После
    // 2026-07-29 скрытие в проекте ОДНО и только у портфеля (виджеты удаляются
    // корзиной), и колонка — второе его место рядом с меню «Видимость» в шапке.
    var EYE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.6 12S5.3 5.5 12 5.5 22.4 12 22.4 12 18.7 18.5 12 18.5 1.6 12 1.6 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYEOFF_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6.7 0 10.4 6.5 10.4 6.5a18 18 0 0 1-3.3 4.2M6.2 7.8A18 18 0 0 0 1.6 12S5.3 18.5 12 18.5c1.9 0 3.5-.5 4.9-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';

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
        // Действия строки живут ОДНИМ кластером .sbc-acts: под курсором он
        // всплывает пилюлей цвета поля колонки и встаёт НА МЕСТО суммы (css прячет
        // .sbc-val/.sbc-chg на hover) — правый край не дёргается, а две иконки
        // читаются как один контрол, а не как пара случайных глифов.
        // Глаз стоит ЛЕВЕЕ крестика: скрытие обратимо, закрытие вкладки — нет,
        // и необратимое действие честнее держать крайним.
        var acts = '';
        if (it.hide) {
            var hTitle = it.hide.off ? 'Показать портфель на «Обзоре»' : 'Скрыть портфель с «Обзора» — капитал останется в сводке';
            acts += '<span class="sbc-eye' + (it.hide.off ? ' off' : '') + '" role="button" tabindex="0" data-act="' +
                esc(it.hide.act) + '" data-key="' + esc(it.hide.key) + '" title="' + esc(hTitle) +
                '" aria-label="' + esc(hTitle) + '">' + (it.hide.off ? EYEOFF_SVG : EYE_SVG) + '</span>';
        }
        if (it.close) {
            acts += '<span class="sbc-x" role="button" tabindex="0" data-act="' + esc(it.close.act) + '" data-key="' +
                esc(it.close.key) + '" title="Закрыть вкладку" aria-label="Закрыть вкладку">' + X_SVG + '</span>';
        }
        // .has-off — у скрытого портфеля глаз виден ВСЕГДА, и кластеру нельзя
        // схлопываться в ноль ширины: он и есть метка состояния
        if (acts) right += '<span class="sbc-acts' + (it.hide && it.hide.off ? ' has-off' : '') + '">' + acts + '</span>';
        return '<button type="button" class="' + cls + '" data-act="' + esc(it.act) + '" data-key="' + esc(it.key) + '"' +
            (it.on ? ' aria-current="page"' : '') + (it.title ? ' title="' + esc(it.title) + '"' : '') + '>' +
            (it.dot ? '<span class="sbc-dot" style="background:' + esc(it.dot) + '"></span>' : '') +
            (icon ? svg(icon) : '') +
            '<span class="sbc-tx">' + esc(it.tx) + '</span>' + right +
        '</button>';
    }
    // ---- свёртка длинного списка ----
    // «Портфели» отдают семь разделов подряд, и низ колонки они забирают
    // целиком. Прячем ВТОРОСТЕПЕННЫЕ — те, за которыми ходят реже всего.
    // 2026-07-29 (просьба владельца): на виду четыре рабочих шага —
    // Обзор · Мои портфели · Ребаланс · Торговля, в «Ещё» уезжают Аналитика,
    // Отчёты и Операции (их открывают эпизодически, а не каждый день).
    // Прятать «последние N» было бы проще, но «Торговля» стоит в списке
    // последней, и её как раз открывают чаще всего.
    var SECONDARY = { analytics: 1, reports: 1, ops: 1 };
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
        // Строка НАЗЫВАЕТ скрытое — но только пока имена в неё помещаются.
        // Правило раунда 4 («перечисляем всегда, счётчик держит точное число»)
        // работает на одном-двух именах и физически не работает на трёх: в 226px
        // строки «Ещё · Аналитика, Отчёты, Операции» обрывается ровно там, где
        // перечисление должно было помочь, и обрывок ещё и дублируется счётчиком.
        // С трёх имён строка считает, а перечисление уходит в подсказку.
        var names = hid.map(function (it) { return it.tx; });
        var many = names.length > 2;
        var tx = moreOpen ? 'Свернуть'
            : (many ? ('Ещё ' + names.length + ' ' + plural(names.length, 'раздел', 'раздела', 'разделов'))
                    : ('Ещё · ' + names.join(', ')));
        return '<button type="button" class="sbc-it more' + (moreOpen ? ' open' : '') + '" data-act="ctxmore" data-key=""' +
            ' title="' + esc(moreOpen ? 'Свернуть' : names.join(', ')) + '"' +
            ' aria-expanded="' + (moreOpen ? 'true' : 'false') + '">' + svg(IC.chev) +
            '<span class="sbc-tx">' + esc(tx) + '</span>' +
            (moreOpen || many ? '' : '<span class="sbc-n">' + names.length + '</span>') + '</button>';
    }
    // склонение берём у общего plural(n, one, few, many) ниже по файлу — своя
    // одноимённая функция молча перебила бы его объявлением (оба всплывают в
    // одну область видимости, и выигрывает последнее): строка выдавала
    // «Ещё 3 undefined»
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
                // ИМЯ РАЗДЕЛА НЕ ЗВУЧИТ ДВАЖДЫ (раунд 6): строка «Портфели» стоит
                // прямо над чертой, и заголовок «ПОРТФЕЛИ» под чертой был её эхом
                // на расстоянии 40px. Сверяем с тем же источником, из которого
                // берётся подпись строки, и молчим на совпадении. Заголовки,
                // которые не дубль («Тип портфеля», «Готовый расчёт», «Открытые
                // портфели»), остаются на месте.
                if (lab && norm(lab) === norm(secName(SEC_OF[tab] || tab))) lab = '';
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
    // сравнение имён для проверки на дубль: регистр и лишние пробелы не в счёт
    function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    // ИМЯ РАЗДЕЛА ТАК, КАК ЕГО ВИДНО В КОЛОНКЕ. tabGates.titleOf отвечает пустой
    // строкой, пока список вкладок не подтянулся (а для части разделов — всегда),
    // поэтому спрашиваем сначала саму строку навигации: её подпись переименование
    // из админки правит, и именно с ней заголовок группы рискует срифмоваться.
    function secName(tab) {
        var it = document.querySelector('#sbNav .sb-item[data-tab="' + tab + '"] .sb-label');
        var tx = it ? it.textContent.trim() : '';
        return tx || tabName(tab);
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
        // ТОЧКУ ПИШЕМ ТОЛЬКО НА ЖИВЫХ ЦЕНАХ. Прежнее условие total > 0 брало
        // капитал в любой момент, включая тот, когда котировки части бумаг ещё
        // не пришли, — и в ряд попадало заниженное число. Одна такая точка
        // задавала масштаб линии на весь день (в проде это выглядело обвалом на
        // 14%, которого не было).
        // СМОТРИМ НА PF.quotesOkTs, А НЕ ЗОВЁМ PF.quotesFresh(): вопреки имени
        // это не предикат, а СЕТТЕР — он штампует quotesOkTs и возвращает
        // undefined. Вызов и соврал бы про свежесть, и сам бы её подделал,
        // погасив метку «Цены на 14:32» у табло.
        // Порог тот же, что у метки возраста цен (STALE_MS в portfolios-tabs.js):
        // пока цены моложе пяти минут, точка идёт в ряд.
        var fresh = true;
        try {
            if (window.PF && typeof PF.quotesOkTs === 'number') {
                fresh = PF.quotesOkTs > 0 && (now - PF.quotesOkTs) < 5 * 60000;
            }
        } catch (e) {}
        if (total > 0 && fresh && (now - (s.t || 0) >= SERIES_MIN_MS)) {
            s.v.push(Math.round(total));
            if (s.v.length > SERIES_MAX) s.v = s.v.slice(-SERIES_MAX);
            s.t = now;
            try { localStorage.setItem(SERIES_KEY, JSON.stringify(s)); } catch (e) {}
        }
        return s.v;
    }
    // Второй рубеж — уже при отрисовке: ряды за прошлые дни писались без гарда
    // выше, да и «свежие» цены могут прийти неполным батчем. Точки дальше 3% от
    // медианы в линию не идут; медиана, а не среднее, — чтобы сам выброс не
    // сдвинул порог, за которым его ловят.
    function clean(v) {
        if (!v || v.length < 3) return v || [];
        var sorted = v.slice().sort(function (a, b) { return a - b; });
        var med = sorted[Math.floor(sorted.length / 2)];
        if (!med) return v;
        var ok = v.filter(function (n) { return Math.abs(n - med) / med <= 0.03; });
        return ok.length >= 3 ? ok : v;
    }
    // Линия во всю ширину табло: viewBox тянется по ширине (preserveAspectRatio
    // none), поэтому толщина штриха задана vector-effect, а не расчётом.
    function sparkHtml(v, neg) {
        v = clean(v);
        if (!v || v.length < 3) return '';
        var min = Math.min.apply(null, v), max = Math.max.apply(null, v);
        var span = max - min;
        // ПОЛ РАЗМАХА. Нормировка по min/max сама по себе честна только там, где
        // размах что-то значит: при дрожании капитала на сотые доли процента она
        // растягивает шум на всю высоту, и спокойный день читается качкой. Меньше
        // 0,15% капитала — считаем день ровным: линия по центру и приглушённым
        // тоном (класс flat), а не зелёным или красным, потому что знака у неё
        // в этом случае нет.
        var flat = !(span > 0) || (max > 0 && span / max < 0.0015);
        var W = 200, H = 24;
        var pts = v.map(function (n, i) {
            var x = v.length > 1 ? (i / (v.length - 1) * W) : 0;
            var y = flat ? H / 2 : (H - (n - min) / span * H);
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
        return '<svg class="sbcap-spark' + (flat ? ' flat' : (neg ? ' neg' : '')) + '" viewBox="0 0 ' + W + ' ' + H +
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
    // ---------- СЛОТ: ВИДЖЕТ КОЛОНКИ ВМЕСТО ТАБЛО ----------
    // Табло капитала перестало быть единственным жильцом верха колонки: тот же
    // прямоугольник теперь занимает ЛЮБОЙ из шести виджетов, выбор — в ховер-хроме
    // блока (кнопка «⋯» → список). Набор УЗКИЙ и сделан под 252px: виджеты
    // конструктора «Портфелей» рассчитаны на 4–12 колонок сетки и в колонке
    // читались бы обрубками. Каждый берёт данные из УЖЕ существующего источника,
    // своих запросов слот не делает:
    //   cap   — PF.sbCapModel()            (как было)
    //   drift — PF.calcPf + PF.pfTargetMix + pfDriftCount/pfDriftMax
    //   next  — PF.collectUpcomingPayouts()
    //   idx   — скрытые узлы дашборда val-imoex/usdrub/btc (их кормит core.js)
    //   rates — те же скрытые узлы ставок + window.ratesData
    //   note  — свой текст, ключ sb_note_v1
    // Выбор живёт в sb_widget_v1 и зеркалится в облако (WATCH в cloud-sync.js):
    // это позиция интерфейса, а не данные устройства.
    var SLOT_KEY = 'sb_widget_v1', NOTE_KEY = 'sb_note_v1';
    var SLOTS = [
        { id: 'cap',   name: 'Капитал',           desc: 'Стоимость всех портфелей, день и линия дня' },
        { id: 'drift', name: 'Доли и дрейф',      desc: 'Акции против облигаций и расхождение с целью' },
        { id: 'next',  name: 'Ближайшая выплата', desc: 'Дата, бумага и сумма купона или дивиденда' },
        { id: 'calm',  name: 'Календарь выплат',  desc: 'Месяц сеткой: в какие дни придут купоны и дивиденды' },
        { id: 'idx',   name: 'Рынок сейчас',      desc: 'IMOEX, доллар и биткойн' },
        { id: 'rates', name: 'Ставки рынка',      desc: 'Ключевая, вклады, инфляция и ОФЗ 10 лет' },
        { id: 'note',  name: 'Заметка',           desc: 'Свой текст под рукой на любой вкладке' }
    ];
    function slotOf(id) { for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].id === id) return SLOTS[i]; return null; }
    var slotId = (function () {
        var v = null;
        try { v = localStorage.getItem(SLOT_KEY); } catch (e) {}
        return slotOf(v) ? v : 'cap';
    })();
    var slotPopOpen = false;
    var slotWarm = 0;              // модуль «Портфелей» дозаказан один раз за сессию
    // Виджеты «Портфелей» живут на ЛЮБОЙ вкладке, а модуль #pfLazySrc грузится
    // только при входе на неё — до первого захода слот молчал. Просим модуль
    // сами, но по трём правилам, чтобы не платить за это всем:
    //   · только когда выбранный виджет и правда про портфели;
    //   · только если портфели у пользователя ЕСТЬ (ключ portfolios_v1 непуст) —
    //     новичку грузить 236КБ незачем, ему слот и так покажет вход «Создать»;
    //   · в простое (requestIdleCallback), чтобы не спорить с загрузкой вкладки.
    // Сама цепочка тем же путём грузится по наведению на пункт «Портфели», так
    // что режим «загрузилась, но вкладка другая» для неё штатный.
    // Возвращает, есть ли у пользователя портфели вообще: по этому же ответу
    // виджет решает, что написать, пока модуля нет.
    function slotWarmPf() {
        var has = false;
        try {
            var raw = JSON.parse(localStorage.getItem('portfolios_v1') || 'null');
            has = !!(raw && ((Array.isArray(raw) && raw.length) || (raw.items && raw.items.length)));
        } catch (e) { has = false; }
        if (!has || slotWarm || !window.ensurePortfoliosJs) return has;
        slotWarm = 1;
        var idle = window.requestIdleCallback || function (fn) { setTimeout(fn, 1200); };
        idle(function () { window.ensurePortfoliosJs(function () { capSync(); }); });
        return has;
    }

    function num(v) { return '<span class="sbw-n">' + esc(v) + '</span>'; }
    function txtOf(id) { var e = document.getElementById(id); return e ? (e.textContent || '').trim() : ''; }
    // Значение из скрытого узла дашборда годится, только если в нём есть цифра:
    // пока MOEX не ответил, там «—», «---» или мусор из таблицы — такое в колонку
    // не пускаем и честно говорим, что значений ещё нет (правило rateTiles).
    function liveOk(s) { return !!s && /\d/.test(s) && s.indexOf('---') < 0 && s.indexOf('#') < 0; }
    function slotEmpty(tx) { return '<div class="sbw-mut">' + esc(tx) + '</div>'; }
    function rub(v) {
        try { return (window.PF && PF.fmtRub) ? PF.fmtRub(v) : (Math.round(v).toLocaleString('ru-RU') + ' ₽'); }
        catch (e) { return Math.round(v) + ' ₽'; }
    }

    // ---- Доли и дрейф ----
    // Полоса классов с насечкой цели вернулась — но уже как ВЫБОР пользователя,
    // а не как часть табло: из капитала её сняли в пользу линии дня (2026-07-28),
    // и спорить с тем решением незачем — здесь она живёт отдельным виджетом.
    function driftHtml() {
        var st = 0, bd = 0;
        try {
            ((PF.store && PF.store.items) || []).forEach(function (p) {
                if (p.hidden) return;
                var c = PF.calcPf(p);
                st += c.stockVal || 0; bd += c.bondVal || 0;
            });
        } catch (e) { return null; }
        var base = st + bd;
        if (!(base > 0)) return slotEmpty('Доли появятся, когда в портфелях будут бумаги');
        var sp = st / base * 100, bp = 100 - sp;
        var tgt = null;
        try { tgt = PF.pfTargetMix ? PF.pfTargetMix() : null; } catch (e) {}
        var n = 0, d = null;
        try { n = PF.pfDriftCount ? PF.pfDriftCount() : 0; d = PF.pfDriftMax ? PF.pfDriftMax() : null; } catch (e) {}
        var h = '<div class="sbw-h"><span class="sbw-l">Доли · все портфели</span></div>' +
            '<div class="sbw-bar"><i class="st" style="width:' + sp.toFixed(1) + '%"></i><i class="bd"></i>' +
            // насечка — ТОЛЬКО при явной цели: без неё чёрточка показала бы
            // выдуманное расхождение уже в первый день (правило раунда 4)
            (tgt ? '<span class="sbw-tick" style="left:' + tgt.stock.toFixed(1) + '%"></span>' : '') +
            '</div>' +
            '<div class="sbw-lg"><span>Акции ' + num(Math.round(sp)) + (tgt ? ' · цель ' + Math.round(tgt.stock) : '') + '</span>' +
            '<span>Обл. ' + num(Math.round(bp)) + (tgt ? ' · цель ' + Math.round(tgt.bond) : '') + '</span></div>';
        if (n > 0) {
            h += '<div class="sbw-say warn">' +
                esc(d != null ? ('Дрейф ' + d.toFixed(1).replace('.', ',') + ' п.п. в ' +
                    n + ' ' + plural(n, 'портфеле', 'портфелях', 'портфелях')) : ('Дрейф в ' + n + ' портфелях')) +
                '</div>';
        } else if (tgt) {
            h += '<div class="sbw-say">Доли в цели</div>';
        } else {
            h += '<div class="sbw-say mut">Цель не задана — задайте её в мастере</div>';
        }
        return card('driftgo', 'Открыть «Ребаланс»', h);
    }

    // ---- Ближайшая выплата ----
    function nextHtml() {
        var evs = null;
        try { evs = PF.collectUpcomingPayouts ? PF.collectUpcomingPayouts() : null; } catch (e) { evs = null; }
        if (!evs) return null;
        if (!evs.length) return slotEmpty('Ближайших выплат нет — добавьте облигации или дивидендные акции');
        var e0 = evs.slice().sort(function (a, b) { return a.date - b.date; })[0];
        var days = Math.max(0, Math.round((e0.date.getTime() - Date.now()) / 86400000));
        var when = e0.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        var h = '<div class="sbw-h"><span class="sbw-l">Ближайшая выплата</span></div>' +
            '<div class="sbw-v"><span class="sbw-big">' + esc(rub(e0.amount)) + '</span></div>' +
            '<div class="sbw-say">' + esc(when) + ' · ' +
            esc(days === 0 ? 'сегодня' : 'через ' + days + ' ' + plural(days, 'день', 'дня', 'дней')) + '</div>' +
            '<div class="sbw-row"><span class="sbw-tk">' + esc(e0.ticker || e0.name) + '</span>' +
            '<span class="sbw-kind">' + (e0.kind === 'coupon' ? 'купон' : 'дивиденд') + '</span></div>';
        return card('nextgo', 'Открыть «Портфели»', h);
    }

    // ---- Календарь выплат · месяц ----
    // Своя, узкая редакция месячной сетки: у виджета «Портфелей» (pfcmCardHtml)
    // есть стрелки месяцев, раскрытие дня и цвета портфелей — в 224px это не
    // живёт. Здесь только текущий месяц: где выплата — заливка дня, под сеткой
    // сумма месяца. Подробности по клику на «Портфелях», как у остальных.
    // Свою навигацию по месяцам не заводим ПРИНЦИПИАЛЬНО: pfcmOffset — состояние
    // дашборда, и колонка, листающая чужой календарь, разошлась бы с ним.
    var CAL_DOW = ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'];
    var CAL_MON = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
        'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    // в подсказке дня месяц стоит при числе — там нужен родительный падеж
    // («15 июля», а не «15 июль»); заголовку виджета годится именительный
    var CAL_MON_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    function calmHtml() {
        var evs = null;
        try { evs = PF.collectUpcomingPayouts ? PF.collectUpcomingPayouts() : null; } catch (e) { evs = null; }
        if (!evs) return null;
        var now = new Date(), y = now.getFullYear(), m = now.getMonth();
        var sum = 0, byDay = {};
        evs.forEach(function (e) {
            if (e.date.getFullYear() !== y || e.date.getMonth() !== m) return;
            byDay[e.date.getDate()] = (byDay[e.date.getDate()] || 0) + e.amount;
            sum += e.amount;
        });
        var first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
        var lead = (first.getDay() + 6) % 7;              // getDay: Вс=0 → неделя с понедельника
        var cells = '';
        for (var i = 0; i < lead; i++) cells += '<i class="off"></i>';
        for (var d = 1; d <= days; d++) {
            var cls = byDay[d] ? 'pay' : '';
            if (d === now.getDate()) cls += (cls ? ' ' : '') + 'now';
            // подсказка называет сумму дня: в клетку 26px её не написать
            cells += '<i' + (cls ? ' class="' + cls + '"' : '') +
                (byDay[d] ? ' title="' + esc(d + ' ' + CAL_MON_G[m] + ' · ' + rub(byDay[d])) + '"' : '') +
                '>' + d + '</i>';
        }
        var h = '<div class="sbw-h"><span class="sbw-l">Выплаты · ' + esc(CAL_MON[m]) + '</span></div>' +
            '<div class="sbw-cal-dow">' + CAL_DOW.map(function (x) { return '<i>' + x + '</i>'; }).join('') + '</div>' +
            '<div class="sbw-cal">' + cells + '</div>' +
            (sum > 0
                ? '<div class="sbw-say">За месяц ' + esc(rub(sum)) + '</div>'
                : '<div class="sbw-say mut">В этом месяце выплат нет</div>');
        return card('nextgo', 'Открыть «Портфели»', h);
    }

    // ---- Рынок сейчас ----
    // Значения берём из скрытых узлов дашборда — тех же, что кормят виджет
    // «Рынок сейчас» на «Портфелях». Своего запроса слот не делает: колонка
    // висит на всех вкладках, и второй поллинг MOEX ради трёх строк лишний.
    var IDX_ROWS = [['IMOEX', 'val-imoex', 'dyn-imoex'], ['USD/RUB', 'val-usdrub', 'dyn-usdrub'], ['BTC', 'val-btc', 'dyn-btc']];
    function idxHtml() {
        var rows = '', live = 0;
        IDX_ROWS.forEach(function (r) {
            var v = txtOf(r[1]), dEl = document.getElementById(r[2]);
            var d = dEl ? (dEl.textContent || '').trim() : '';
            var neg = dEl && dEl.classList.contains('negative');
            if (!liveOk(v)) return;
            live++;
            rows += '<div class="sbw-irow"><span class="sbw-it">' + esc(r[0]) + '</span>' +
                '<span class="sbw-iv">' + esc(v) + '</span>' +
                '<span class="sbw-ic' + (neg ? ' neg' : '') + '">' + esc(d) + '</span></div>';
        });
        if (!live) return slotEmpty('Значения появятся, когда ответит биржа');
        return card('mktgo', 'Открыть «Рынок»',
            '<div class="sbw-h"><span class="sbw-l">Рынок сейчас</span></div><div class="sbw-irows">' + rows + '</div>');
    }

    // ---- Ставки рынка ----
    var RATE_ROWS = [['Ключевая ставка', 'val-key-rate', 'keyRate'], ['Вклады', 'val-deposit-rate', 'depositRate'],
                     ['Инфляция, год', 'val-inflation', 'inflation'], ['ОФЗ 10 лет', 'val-ofz10', 'ofz10']];
    function ratesHtml() {
        var rd = window.ratesData || {};
        var rows = '', live = 0;
        RATE_ROWS.forEach(function (r) {
            var v = txtOf(r[1]);
            if (!liveOk(v)) v = String(rd[r[2]] == null ? '' : rd[r[2]]);
            if (!liveOk(v)) return;
            live++;
            rows += '<div class="sbw-irow"><span class="sbw-it">' + esc(r[0]) + '</span>' +
                '<span class="sbw-iv">' + esc(v) + '</span></div>';
        });
        if (!live) return slotEmpty('Ставки появятся, когда загрузятся данные');
        return '<div class="sbw-card">' +
            '<div class="sbw-h"><span class="sbw-l">Ставки рынка</span></div>' +
            '<div class="sbw-irows">' + rows + '</div></div>';
    }

    // ---- Заметка ----
    // Единственный виджет со своим состоянием: текст живёт в sb_note_v1 и
    // зеркалится в облако. Перерисовку блока с полем нельзя делать на каждом
    // тике — увёл бы каретку; за этим следит slotBusy() в capSync.
    function noteRead() { try { return localStorage.getItem(NOTE_KEY) || ''; } catch (e) { return ''; } }
    function noteHtml() {
        return '<div class="sbw-card sbw-notecard">' +
            '<div class="sbw-h"><span class="sbw-l">Заметка</span></div>' +
            '<textarea class="sbw-note" rows="3" placeholder="Мысль, план, тикер — что угодно" ' +
            'aria-label="Заметка в колонке">' + esc(noteRead()) + '</textarea></div>';
    }

    // Общая оболочка нажимаемого виджета: как у табло, вся площадь — одна мишень.
    function card(act, title, inner) {
        // Шеврон — свой класс, а не .sbcap-go из табло: тот рассчитан на РЯД
        // (flex-элемент рядом с линией дня) и в блочном потоке терял размеры —
        // svg с height:100% растягивал карточку на две сотни пикселей.
        return '<button type="button" class="sbw-card sbw-go" data-act="' + esc(act) + '" data-key=""' +
            ' title="' + esc(title) + '">' + inner +
            '<span class="sbw-goic" aria-hidden="true">' + svg(IC.chevr) + '</span></button>';
    }

    // Ховер-хром блока: одна кнопка «сменить виджет» (PFD_OWN_CHROME — язык
    // конструктора «Портфелей»). Кнопка НЕ внутри тела виджета: тело часто само
    // <button>, а кнопка в кнопке — сломанная разметка и мёртвый клик.
    var IC_DOTS = '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>';
    var IC_CHECK = '<polyline points="4 12.5 9 17.5 20 6.5"/>';
    function slotPopHtml() {
        return '<div class="sbw-pop" role="menu" aria-label="Виджет колонки">' +
            '<div class="sbw-pop-h">Виджет колонки</div>' +
            SLOTS.map(function (s) {
                var on = s.id === slotId;
                return '<button type="button" class="sbw-opt' + (on ? ' on' : '') + '" role="menuitemradio"' +
                    ' aria-checked="' + (on ? 'true' : 'false') + '" data-act="wset" data-key="' + esc(s.id) + '">' +
                    '<span class="sbw-opt-tx"><b>' + esc(s.name) + '</b><i>' + esc(s.desc) + '</i></span>' +
                    (on ? '<span class="sbw-opt-on" aria-hidden="true">' + svg(IC_CHECK) + '</span>' : '') +
                '</button>';
            }).join('') + '</div>';
    }
    function slotBodyHtml(m) {
        // На мобиле колонки нет вовсе (CSS гасит #sbCap вне десктопной медиа) —
        // но и в разметку виджет попадать не должен: поле «Заметки» в скрытом
        // узле осталось бы табстопом мобильной шторки.
        if (!wide()) return '';
        // Табло ведёт себя ровно как раньше: нет модуля — нет узла (#sbCap:empty
        // схлопывает его вместе с отступами), заглушку вместо чисел не рисуем.
        // Разница только в том, что теперь мы просим модуль догрузиться — иначе
        // на «Расчёте» пустой слот нельзя было бы даже сменить: хром живёт на теле.
        if (slotId === 'cap') { if (!m) slotWarmPf(); return m ? capHtml(m) : ''; }
        if (slotId === 'note') return noteHtml();
        if (slotId === 'idx') return idxHtml();
        if (slotId === 'rates') return ratesHtml();
        // Виджеты «Портфелей» просят модуль #pfLazySrc, а он грузится только при
        // входе на вкладку. Табло (умолчание) этого не меняет — пустой узел, как
        // было. А вот «Доли» и «Выплату» пользователь выбрал САМ: молчать в ответ
        // на явный выбор нельзя, поэтому модуль подтягиваем и держим подпись,
        // чтобы хром смены виджета не исчез вместе с числами.
        if (!window.PF || !PF.store) {
            var has = slotWarmPf();
            return '<div class="sbw-card">' +
                '<div class="sbw-h"><span class="sbw-l">' + esc(slotOf(slotId).name) + '</span></div>' +
                '<div class="sbw-say mut">' + (has ? 'Считаем по портфелям…' : 'Появится, когда будет первый портфель') + '</div></div>';
        }
        if (slotId === 'drift') return driftHtml();
        if (slotId === 'next') return nextHtml();
        if (slotId === 'calm') return calmHtml();
        return '';
    }
    function slotHtml(m) {
        var body = slotBodyHtml(m);
        if (!body) return '';        // #sbCap:empty схлопнет узел вместе с отступами
        return '<div class="sbw" data-w="' + esc(slotId) + '">' + body +
            '<button type="button" class="sbw-pick" data-act="wpick" data-key=""' +
            ' title="Сменить виджет колонки" aria-label="Сменить виджет колонки"' +
            ' aria-expanded="' + (slotPopOpen ? 'true' : 'false') + '">' + svg(IC_DOTS) + '</button>' +
            (slotPopOpen ? slotPopHtml() : '') + '</div>';
    }
    // Перерисовку блокирует ТОЛЬКО правка заметки: пропала бы каретка, а вместе
    // с ней и несохранённый хвост строки. Раньше здесь стояло «любой фокус
    // внутри #sbCap» — и выбор виджета не срабатывал вовсе: клик по пункту
    // списка фокусирует свою же кнопку, блок считался занятым, и пересборка,
    // которая должна была поставить новый виджет, молча пропускалась.
    function slotBusy() {
        var a = document.activeElement;
        return !!(a && a.classList && a.classList.contains('sbw-note'));
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
    // Подсказка раздела собирается в js/sidebar.js (sbTitleSync) — у title
    // один владелец, иначе следующий switchTab затёр бы дописанное здесь.
    // Наше дело — положить примечание и позвать пересборку.
    function noteSync(it, note) {
        if (note) {
            if (it.getAttribute('data-sb-note') !== note) it.setAttribute('data-sb-note', note);
        } else if (it.hasAttribute('data-sb-note')) {
            it.removeAttribute('data-sb-note');
        } else return;
        if (window.sbTitleSync) window.sbTitleSync();
    }
    function badgeSync(n) {
        var it = document.querySelector('#sbNav .sb-item[data-tab="rebalance"]');
        if (!it) return;
        var b = it.querySelector('.sb-badge');
        if (!(n > 0) || !wide()) { if (b) b.remove(); noteSync(it, ''); return; }
        if (!b) {
            b = document.createElement('span');
            b.className = 'sb-badge';
            it.appendChild(b);
        }
        var tx = String(n);
        if (b.textContent !== tx) b.textContent = tx;
        var lbl = n + ' ' + plural(n, 'портфель просит', 'портфеля просят', 'портфелей просят') + ' ребаланса';
        if (b.getAttribute('aria-label') !== lbl) b.setAttribute('aria-label', lbl);
        // Величину дрейфа метка не носит (в 15px её не написать) — её называет
        // подсказка. Если максимума почему-то нет, примечание остаётся счётным:
        // выдумывать число ради красивой строки нельзя.
        var d = null;
        try { d = (window.PF && PF.pfDriftMax) ? PF.pfDriftMax() : null; } catch (e) { d = null; }
        var where = n + ' ' + plural(n, 'портфеле', 'портфелях', 'портфелях');
        noteSync(it, d != null
            ? ('дрейф ' + d.toFixed(1).replace('.', ',') + ' п.п. в ' + where)
            : ('дрейф в ' + where));
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
        if (host && !slotBusy()) {
            // в рейке виджета не живёт вовсе (см. выше) — узел просто пуст
            var rail = document.body.classList.contains('sb-rail');
            // Слот рисует ВЫБРАННЫЙ виджет: 'cap' спрашивает модель, остальные
            // берут свои источники сами и живут даже без загруженного PF.
            var html = rail ? '' : slotHtml(m);
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
        // ---- слот виджета колонки ----
        if (act === 'wpick') { slotPopOpen = !slotPopOpen; capSync(); return; }
        if (act === 'wset') {
            slotPopOpen = false;
            if (slotOf(key) && key !== slotId) {
                slotId = key;
                try { localStorage.setItem(SLOT_KEY, slotId); } catch (e2) {}
            }
            capSync();
            return;
        }
        // Виджеты ведут туда, где их число разобрано подробно, — тот же договор,
        // что у табло («вся площадь нажимается, шеврон — признак»).
        if (act === 'driftgo') {
            if (typeof currentTab === 'undefined' || currentTab !== 'rebalance') {
                if (window.switchTab) window.switchTab('rebalance');
            }
            return;
        }
        if (act === 'nextgo') {
            if (typeof currentTab === 'undefined' || currentTab !== 'portfolios') {
                if (window.switchTab) window.switchTab('portfolios');
            }
            if (window.pfxGoTab) window.pfxGoTab('overview');
            return;
        }
        if (act === 'mktgo') { if (window.switchTab) window.switchTab('market'); return; }
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
        // скрыть/вернуть портфель прямо из колонки. Строка НЕ пропадает (скрытый
        // портфель остаётся приглушённым пунктом, cls 'dim'), поэтому вернуть его
        // можно тем же кликом — искать меню «Видимость» в шапке не надо.
        // pfToggleHidden сам перерисовывает вкладку, но колонку освежаем явно:
        // на чужой вкладке (виджеты «Портфелей» живут везде) её ре-рендер не позовут.
        if (act === 'pf-hide') {
            if (window.pfToggleHidden) window.pfToggleHidden(key, e);
            sbCtxSync();
            return;
        }
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
        if (cap) {
            cap.addEventListener('click', onClick);
            // Заметка пишется прямо в колонке. Сохраняем с задержкой: буква за
            // буквой в localStorage писать незачем, а уход фокуса и закрытие
            // вкладки дожимают запись сразу (blur).
            var noteTimer = null;
            function noteSave(el) {
                try { localStorage.setItem(NOTE_KEY, el.value); } catch (e) {}
            }
            cap.addEventListener('input', function (e) {
                var el = e.target;
                if (!el || !el.classList || !el.classList.contains('sbw-note')) return;
                clearTimeout(noteTimer);
                noteTimer = setTimeout(function () { noteSave(el); }, 400);
            });
            cap.addEventListener('focusout', function (e) {
                var el = e.target;
                if (!el || !el.classList || !el.classList.contains('sbw-note')) return;
                clearTimeout(noteTimer); noteSave(el);
            });
        }
        // Список выбора закрывается кликом мимо и по Esc — как любой поповер
        // проекта. Слушатели на документе, потому что «мимо» лежит вне #sbCap.
        document.addEventListener('click', function (e) {
            if (!slotPopOpen) return;
            var host = document.getElementById('sbCap');
            if (host && e.target && host.contains(e.target)) return;
            slotPopOpen = false; capSync();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || !slotPopOpen) return;
            slotPopOpen = false; capSync();
        });
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
    // «Рынок сейчас» и «Ставки» читают ЧУЖИЕ узлы, которые обновляются сами по
    // себе, — минутного тика им мало, значения выглядели бы подвисшими. Свой
    // тик частый, но дешёвый: пересборка идёт только при разнице html.
    setInterval(function () {
        if (!wide() || document.hidden) return;
        if (slotId !== 'idx' && slotId !== 'rates') return;
        if (!document.getElementById('sbCap')) return;
        capSync();
    }, 12000);
})();
