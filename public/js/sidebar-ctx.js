// ===== ДИНАМИКА КОЛОНКИ САЙДБАРА (мокап Б «Верстак») =====
// Модуль наполняет три узла:
//   (данных верх колонки больше не показывает — там командная строка #sbCmd;
//    табло капитала и слот виджетов сняты целиком)
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
        // три точки — глиф строки-кнопки «Ещё» (мокап сайдбара по референсу)
        dots:      '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>',
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
        // ДНЕВНОГО ИЗМЕНЕНИЯ В СТРОКЕ БОЛЬШЕ НЕТ. Оно стояло четвёртым элементом
        // после точки, имени и суммы, а строке всего 226px: «18 233 322 ₽»
        // съедало половину, и имя резалось до «Портфел…». У скрытых портфелей
        // к этому добавлялась янтарная метка глаза — правый край переставал быть
        // краем, а список читался кашей. Сумма остаётся: она отвечает на вопрос
        // «сколько здесь», ради которого в перечень и смотрят. Дельта дня никуда
        // не делась — она на карточках «Обзора» и в «Моих портфелях», где под
        // неё есть своя колонка. Значение it.chg модель по-прежнему считает: его
        // берёт подсказка строки (title), чтобы число было доступно и отсюда.
        if (it.val) right += '<span class="sbc-val">' + esc(it.val) + '</span>';
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
        // Кластер действий — ТОЛЬКО по наведению, у всех строк одинаково. Раньше
        // у скрытого портфеля глаз висел справа всегда (это была метка
        // состояния) и отжимал сумму влево: колонка чисел ломалась ровно на тех
        // строках, где и так было тесно. Теперь про скрытость говорит метка
        // СЛЕВА, на месте цветной точки, — правый край свободен всегда.
        if (acts) right += '<span class="sbc-acts">' + acts + '</span>';
        // Дельту дня из строки убрали — подсказка её сохраняет: наведение
        // остаётся способом узнать «сколько сегодня», не загромождая перечень.
        var tip = it.title || '';
        if (it.chg && it.chg.tx) tip = (tip ? tip + ' · ' : it.tx + ' · ') + it.chg.tx + ' за сегодня';
        return '<button type="button" class="' + cls + '" data-act="' + esc(it.act) + '" data-key="' + esc(it.key) + '"' +
            (it.on ? ' aria-current="page"' : '') + (tip ? ' title="' + esc(tip) + '"' : '') + '>' +
            // СКРЫТОСТЬ ГОВОРИТ ТОЧКА, А НЕ ХВОСТ СТРОКИ. Цветной кружок портфеля
            // и так стоит слева и ничего, кроме цвета, не сообщает — он и берёт
            // на себя состояние: перечёркнутый глаз внутри того же кружка того же
            // цвета. Правый край строки при этом остаётся под одно число, а
            // переключает видимость по-прежнему кластер по наведению.
            (it.dot ? '<span class="sbc-dot' + (it.hide && it.hide.off ? ' off' : '') +
                '" style="background:' + esc(it.dot) + '"' +
                (it.hide && it.hide.off ? ' title="Скрыт с «Обзора»"' : '') + '>' +
                (it.hide && it.hide.off ? EYEOFF_SVG : '') + '</span>' : '') +
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
    // Модельные cap/chip у PF.sbSideModel остались, но колонка их больше не
    // читает: капитал ушёл из сайдбара вместе с табло.
    function listHtml(m, tab) {
        var h = '', first = true;
        (m.groups || []).forEach(function (g) {
            if (!g.items || !g.items.length) return;
            var items = g.items, tailHtml = '';
            var lab = g.label;
            // ПОДВКЛАДКИ «ПОРТФЕЛЕЙ» УШЛИ В ПЕРВЫЙ УРОВЕНЬ и во втором больше не
            // печатаются — иначе одни и те же семь пунктов стояли бы дважды.
            // Из этой группы во втором уровне остаются только ЭКРАНЫ «ТОРГОВЛИ»
            // (cls 'lvl3'): они третий уровень, и подниматься им некуда.
            if (first && tab === 'portfolios') {
                var lvl3 = items.filter(function (it) { return it.cls === 'lvl3'; });
                if (!lvl3.length) { first = false; return; }
                items = lvl3;
                lab = 'Экраны торговли';
                h += '<div class="sbc-grp"><span>' + esc(lab) + '</span></div>';
                h += items.map(itemHtml).join('');
                first = false;
                return;
            }
            // ПЕРЕЧЕНЬ «ОТКРЫТЫЕ ПОРТФЕЛИ» УЕХАЛ В ПЕРВЫЙ УРОВЕНЬ (мокап В4–В5,
            // portsHtml выше): под «Моими портфелями» он и живёт. Печатать его
            // ещё и вторым уровнем значило бы ставить те же строки дважды в
            // одной колонке. «Новый портфель» не теряется: он есть кнопкой
            // «+ Портфель» в углу самой вкладки.
            if (tab === 'portfolios' && lab === 'Открытые портфели') return;
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
    // ---- имя и роль в строке подвала (мокап В4–В6) ----
    // Профиль читается из window.supa (имя из profiles, роль owner/admin из
    // той же строки); технический email телеграм-аккаунтов не показываем
    // (см. isTechEmail в js/profile-menu.js). Гость видит «Гость» — аватар
    // рядом и так ведёт на вход. Класс authed на ряду зажигает зелёную
    // точку-статус на аватаре (css/sidebar-rail.css).
    function userSync() {
        var el = document.getElementById('sbUserName');
        var pers = document.getElementById('sbPersonal');
        if (!el) return;
        var name = '', sub = '', authedNow = false;
        try {
            if (window.supa && window.supa.enabled && window.supa.isAuthed()) {
                authedNow = true;
                var pr = window.supa.profile || {};
                var email = pr.email ||
                    (window.supa.session && window.supa.session.user && window.supa.session.user.email) || '';
                var tech = email.toLowerCase().indexOf('@telegram.mstelegram.local') !== -1;
                name = pr.name || (!tech && email ? email.split('@')[0] : 'Кабинет');
                sub = pr.role === 'owner' ? 'owner'
                    : pr.role === 'admin' ? 'admin'
                    : (!tech ? email : '');
            } else if (window.supa && window.supa.enabled) {
                name = 'Гость';
                sub = 'вход — по аватару';
            } else {
                // демо-режим без облака: сессии не бывает вовсе — подписи не врём
                name = 'Кабинет';
            }
        } catch (e) { name = 'Кабинет'; }
        if (pers) pers.classList.toggle('authed', authedNow);
        var html = '<b>' + esc(name) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
        if (el.__unHtml !== html) { el.innerHTML = html; el.__unHtml = html; }
    }

    // ---------- ВЕРХ КОЛОНКИ БОЛЬШЕ НЕ ПОКАЗЫВАЕТ ДАННЫХ ----------
    // Здесь жило табло капитала, а потом слот на шесть виджетов. Снято целиком
    // (решение владельца 2026-07-29): верх сайдбара — место навигации, входа или
    // событий, витрине данных там не место. Капитал остался на «Обзоре» и в
    // «Сводных показателях», где его и разбирают; наверху колонки теперь
    // командная строка поиска (#sbCmd, разметка + sbSearchSet в js/sidebar.js).
    // Вместе со слотом ушли: реестр SLOTS и шесть тел виджетов, ховер-хром «⋯»
    // со списком выбора, ключи sb_widget_v1 / sb_note_v1 (и строка из WATCH в
    // js/cloud-sync.js), интрадей-ряд sb_day_series со спарклайном и разбором
    // выбросов, пустые состояния табло. Пережил только БЕЙДЖ ДРЕЙФА на кружке
    // «Ребаланса» — он про навигацию, а не про данные (badgeTick ниже).
    // ---------- ПЛОСКИЙ ПЕРВЫЙ УРОВЕНЬ (раунд «Плоскость», 2026-07-30) ----------
    // Дерево навигации было кривым: из шести разделов один держал СЕМЬ экранов
    // (Обзор, Мои портфели, Ребаланс, Торговля, Аналитика, Отчёты, Операции),
    // а три — ни одного. Иерархия называлась двухуровневой, а работала как
    // одноуровневая с ямой: «Отчёты» надо было искать внутри «Портфелей», хотя
    // «Тест» был сам себе разделом. Второй уровень «Портфелей» поднят в первый и
    // встал рядом с «Рынком», «Расчётом» и «Академией»; редкое уехало в «Ещё».
    //
    // АДРЕСА НЕ ИЗМЕНИЛИСЬ. route-hash.js по-прежнему держит раздел путём, а
    // подвкладку хэшем — поднялся только уровень, на котором пункт нарисован.
    //
    // Список рисуется в #sbFlat ВНУТРИ #sbNav (display:contents), поэтому все
    // правила #sbNav .sb-item достаются ему без единого нового селектора, и
    // рейка 84px складывает его теми же плитками, что складывала разделы.
    //
    // ПОДПИСИ ПОДВКЛАДОК ДУБЛИРУЮТСЯ ЗДЕСЬ НАМЕРЕННО. PF грузится лениво
    // (#pfLazySrc), а первый уровень навигации обязан стоять целиком с первого
    // кадра — иначе на «Расчёте» четыре пункта из семи появлялись бы с задержкой.
    // Из PF приходят только счётчики, метка дрейфа и признак активности.
    var FLAT_PF      = [['overview', 'Обзор'], ['ports', 'Мои портфели'],
                        ['rebal', 'Ребаланс'], ['trading', 'Торговля']];
    var FLAT_PF_MORE = [['analytics', 'Аналитика'], ['reports', 'Отчёты'], ['ops', 'Операции']];
    // Настоящие вкладки: подписи, иконки, адреса и видимость читаются из
    // РАЗМЕТКИ #sbNav — там единственный источник правды (админка переименовывает
    // вкладки через tab-gates, роль гейтит «Админку»), и дублировать его нельзя.
    var FLAT_TABS      = ['market', 'calc', 'rebalance'];
    var FLAT_TABS_MORE = ['backtest', 'admin'];
    var FLAT_MORE_KEY = 'sb_flat_more_v1';

    // ---- КТО ЧТО ВИДИТ ----
    // ГОСТЮ НЕ ПОКАЗЫВАЕМ ТО, ЧТО БЕЗ АККАУНТА НЕ РАБОТАЕТ: все экраны портфелей
    // (Обзор, Мои портфели, Ребаланс, Торговля, Аналитика, Отчёты, Операции)
    // требуют вход — там нечего показать, а пункт, который ведёт в заглушку,
    // это обещание, которого навигация не сдержит. Остаются Рынок, Расчёт,
    // Академия и Тест: они считают и показывают без входа.
    //
    // БЕЗ ОБЛАКА СЧИТАЕМ, ЧТО ДОСТУПНО ВСЁ. В демо-режиме (пустые ключи в
    // js/supabase-config.js) сессии не бывает вовсе, и гостевая логика спрятала
    // бы половину продукта у каждого, кто поднял копию без Supabase.
    function authed() {
        try {
            if (!(window.supa && window.supa.enabled)) return true;
            return !!window.supa.isAuthed();
        } catch (e) { return true; }
    }
    // ЭКРАН ПРИВЕТСТВИЯ — НЕ ПОЛНАЯ НАВИГАЦИЯ, А КОРОТКИЙ ВХОД. На «Главной»
    // колонка сжата в рейку 84px поверх живой карты, и семь пунктов ей не по
    // росту: там нужен не каталог, а несколько дверей. Состав выбран владельцем.
    var HOME_AUTHED = ['pf:overview', 'pf:trading', 'tab:market', 'tab:rebalance', 'tab:backtest'];
    var HOME_GUEST  = ['tab:market', 'tab:calc', 'tab:rebalance', 'tab:backtest'];
    function flatLabel(key) {
        var i;
        for (i = 0; i < FLAT_PF.length; i++) if (FLAT_PF[i][0] === key) return FLAT_PF[i][1];
        for (i = 0; i < FLAT_PF_MORE.length; i++) if (FLAT_PF_MORE[i][0] === key) return FLAT_PF_MORE[i][1];
        return key;
    }
    function flatOne(id) {
        return id.indexOf('pf:') === 0
            ? flatPfHtml(id.slice(3), flatLabel(id.slice(3)))
            : flatTabHtml(id.slice(4));
    }
    var flatMoreOpen = (function () {
        try { return localStorage.getItem(FLAT_MORE_KEY) === '1'; } catch (e) { return false; }
    })();

    // ---- ОТКРЫТЫЕ ПОРТФЕЛИ ПОД «МОИ ПОРТФЕЛИ» (мокап В4–В5) ----
    // Аналог TEAM-списка референса: строки с цветной точкой, именем и днём.
    // Источник — та же модель, что кормила второй уровень (PF.sbSideModel):
    // открытые вкладки-портфели, СКРЫТЫЕ (p.hidden, cls 'dim') не печатаются —
    // список в навигации короткий, скрытое возвращает меню «Видимость».
    // Пока PF не загружен лениво (#pfLazySrc), списка честно нет — как и
    // счётчиков: числа не выдумываем.
    var PORTS_KEY = 'sb_ports_v1';
    var portsOpen = (function () {
        try { return localStorage.getItem(PORTS_KEY) !== '0'; } catch (e) { return true; }
    })();
    function portsRows() {
        try {
            if (!(window.PF && PF.sbSideModel)) return [];
            var m = PF.sbSideModel();
            if (!m || !m.groups) return [];
            var g = null;
            m.groups.forEach(function (x) { if (x.label === 'Открытые портфели') g = x; });
            if (!g || !g.items) return [];
            return g.items.filter(function (it) { return it.act === 'pf' && it.cls !== 'dim'; });
        } catch (e) { return []; }
    }
    function portsHtml() {
        if (!portsOpen) return '';
        var rows = portsRows();
        if (!rows.length) return '';
        var h = '<div class="sb-ports">';
        rows.forEach(function (it) {
            h += '<button type="button" class="sb-item sb-port' + (it.on ? ' on' : '') + '"' +
                ' data-act="pf" data-key="' + esc(it.key) + '"' +
                (it.on ? ' aria-current="page"' : '') +
                (it.title ? ' title="' + esc(it.title) + '"' : '') + '>' +
                '<span class="sb-pdot" style="--pc:' + esc(it.dot || '') + '"></span>' +
                '<span class="sb-label">' + esc(it.tx) + '</span>' +
                (it.chg && it.chg.tx
                    ? '<span class="sb-chg' + (it.chg.neg ? ' neg' : '') + '">' + esc(it.chg.tx) + '</span>'
                    : '') +
                '</button>';
        });
        return h + '</div>';
    }

    function plural(n, one, few, many) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
        return many;
    }
    function flatTabNode(tab) {
        return document.querySelector('#sbNav .sb-item[data-tab="' + tab + '"]');
    }
    function flatTabOff(n) {
        return !n || n.hidden || (n.style && n.style.display === 'none');
    }
    // Строка настоящей вкладки — КОПИЯ ссылки из разметки, а не своя кнопка:
    // href и onclick переносятся как есть, поэтому Cmd/Ctrl-клик по-прежнему
    // открывает раздел в новой вкладке браузера, а обычный перехватывает
    // sbGo/sbGoParent. Иконка берётся оттуда же — второго набора глифов нет.
    function flatTabHtml(tab) {
        var n = flatTabNode(tab);
        if (flatTabOff(n)) return '';
        var lbl = n.querySelector('.sb-label');
        var ic = n.querySelector('svg');
        var tx = lbl ? lbl.textContent.trim() : tab;
        var oc = n.getAttribute('onclick') || '';
        return '<a class="sb-item' + (n.classList.contains('active') ? ' active' : '') + '"' +
            ' href="' + esc(n.getAttribute('href') || '#') + '"' +
            (oc ? ' onclick="' + esc(oc) + '"' : '') +
            ' title="' + esc(tx) + '">' +
            (ic ? '<svg viewBox="0 0 24 24" aria-hidden="true">' + ic.innerHTML + '</svg>' : '') +
            '<span class="sb-label">' + esc(tx) + '</span></a>';
    }
    // Строка подвкладки «Портфелей». Клик идёт через общий onClick по data-act —
    // тот же путь, которым она ходила, пока была вторым уровнем.
    function flatPfHtml(key, tx) {
        var on = false, num = null, drift = 0;
        var cur = (typeof currentTab !== 'undefined') ? currentTab : '';
        try {
            if (window.PF) {
                if (cur === 'portfolios' && PF.pfxEffTab) {
                    var eff = PF.pfxEffTab();
                    on = key === 'trading'
                        ? (PF.pfxIsTradeTab ? !!PF.pfxIsTradeTab(eff) : eff === 'trading')
                        : eff === key;
                }
                if (key === 'ports' && PF.store && PF.store.items) num = PF.store.items.length || null;
                if (key === 'ops' && PF.collectTrades) num = PF.collectTrades(true).length || null;
                if (key === 'trading' && PF.pfxTradeTabs) {
                    var s = PF.pfxTradeTabs().length;
                    num = s > 1 ? s : null;      // один экран — не число, а данность
                }
                // МЕТКА ДРЕЙФА ПЕРЕЕХАЛА НА «РЕБАЛАНС». Раньше она висела на
                // разделе data-tab="rebalance", а он в проде подписан «Академия»:
                // метка про мастер ребаланса горела на разделе про обучение.
                // Теперь мастер стоит своей строкой, и метка на нём.
                if (key === 'rebal' && PF.pfDriftCount) drift = PF.pfDriftCount() || 0;
            }
        } catch (e) {}
        var note = '';
        if (drift > 0) {
            var d = null;
            try { d = PF.pfDriftMax ? PF.pfDriftMax() : null; } catch (e2) { d = null; }
            var where = drift + ' ' + plural(drift, 'портфеле', 'портфелях', 'портфелях');
            note = d != null
                ? ('дрейф ' + d.toFixed(1).replace('.', ',') + ' п.п. в ' + where)
                : ('дрейф в ' + where);
        }
        var act = key === 'trading' ? 'trading' : 'pfx';
        return '<button type="button" class="sb-item' + (on ? ' active' : '') + '"' +
            ' data-act="' + act + '" data-key="' + esc(key) + '"' +
            (on ? ' aria-current="page"' : '') +
            ' title="' + esc(note ? tx + ' · ' + note : tx) + '">' +
            svg(IC[key] || IC.overview) +
            '<span class="sb-label">' + esc(tx) + '</span>' +
            (drift > 0 ? '<span class="sb-badge" aria-label="' + esc(drift + ' ' +
                plural(drift, 'портфель просит', 'портфеля просят', 'портфелей просят') +
                ' ребаланса') + '">' + drift + '</span>' : '') +
            (num != null ? '<span class="sb-n">' + esc(num) + '</span>' : '') +
            // шеврон-складка списка портфелей — только на «Моих портфелях» и
            // только когда список есть (мокап: клик по шеврону, не по строке)
            (key === 'ports' && portsRows().length
                ? '<span class="sb-pchev' + (portsOpen ? ' open' : '') + '" data-act="flatports" data-key=""' +
                  ' title="' + (portsOpen ? 'Свернуть список портфелей' : 'Показать список портфелей') + '">' +
                  svg(IC.chev) + '</span>'
                : '') +
            '</button>';
    }
    // Состав первого уровня одним списком: гость и «Главная» — это фильтры над
    // ним, а не отдельные ветки разметки.
    function flatIds() {
        var home = document.body.classList.contains('tab-home');
        if (home) return { main: (authed() ? HOME_AUTHED : HOME_GUEST).slice(), more: [] };
        var main = [], more = [];
        if (authed()) FLAT_PF.forEach(function (t) { main.push('pf:' + t[0]); });
        FLAT_TABS.forEach(function (t) { main.push('tab:' + t); });
        if (authed()) {
            FLAT_PF_MORE.forEach(function (t) { more.push('pf:' + t[0]); });
            FLAT_TABS_MORE.forEach(function (t) { more.push('tab:' + t); });
        } else {
            // У гостя первичных пунктов всего три. Прятать за «Ещё» один «Тест»
            // значило бы делать вид, что список длинный, — поднимаем его наверх.
            FLAT_TABS_MORE.forEach(function (t) { main.push('tab:' + t); });
        }
        return { main: main, more: more };
    }
    function flatHtml() {
        var ids = flatIds();
        var h = '';
        // список открытых портфелей встаёт СРАЗУ ПОД «Моими портфелями»
        // (мокап В4–В5) — на «Главной» пункта ports нет, и списка там нет тоже
        ids.main.forEach(function (id) {
            h += flatOne(id);
            if (id === 'pf:ports') h += portsHtml();
        });
        // Считаем ТОЛЬКО то, что реально видно: «Админка» приходит по роли, и в
        // закрытом виде её в счёте «Ещё» быть не должно.
        var hidden = ids.more.filter(function (id) {
            return id.indexOf('pf:') === 0 || !flatTabOff(flatTabNode(id.slice(4)));
        });
        if (!hidden.length) return h;
        // «Ещё» — одетая строка-кнопка (мокап, раунд 4): три точки, счёт
        // скрытых пилюлей, шеврон-переворот; раскрытые пункты ложатся в
        // «карман» .sb-morebox ПОД кнопкой, подпись меняется на «Свернуть».
        h += '<button type="button" class="sb-item sb-more' + (flatMoreOpen ? ' open' : '') + '"' +
            ' data-act="flatmore" data-key="" aria-expanded="' + (flatMoreOpen ? 'true' : 'false') + '"' +
            ' title="' + esc(flatMoreOpen ? 'Свернуть'
                : ('Ещё ' + hidden.length + ' ' + plural(hidden.length, 'раздел', 'раздела', 'разделов'))) + '">' +
            '<svg class="sb-mdots" viewBox="0 0 24 24" aria-hidden="true">' + IC.dots + '</svg>' +
            '<span class="sb-label">' + (flatMoreOpen ? 'Свернуть' : 'Ещё') + '</span>' +
            (flatMoreOpen ? '' : '<span class="sb-cnt">' + hidden.length + '</span>') +
            '<svg class="sb-mch" viewBox="0 0 24 24" aria-hidden="true">' + IC.chev + '</svg>' +
            '</button>';
        if (flatMoreOpen) {
            h += '<div class="sb-morebox">';
            hidden.forEach(function (id) { h += flatOne(id); });
            h += '</div>';
        }
        return h;
    }
    // Пересборка только при разнице html: тик котировок зовёт нас раз в минуту,
    // а живой :hover и фокус в колонке рвать нельзя.
    function flatSync() {
        var host = document.getElementById('sbFlat');
        if (!host) return;
        var html = wide() ? flatHtml() : '';
        if (host.__flatHtml === html) return;
        host.innerHTML = html;
        host.__flatHtml = html;
    }
    // Цены обновляет рендер «Портфелей», а метка дрейфа висит на ЛЮБОЙ вкладке —
    // без этой строчки она замерла бы на числе, посчитанном при заходе. Вызов
    // дешёвый: внутри ensureQuotes стоит TTL 60с.
    function badgeTick() {
        try { if (wide() && window.PF && PF.ensureQuotes && PF.store && PF.store.items.length) PF.ensureQuotes(); } catch (e) {}
        flatSync();
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

    // ---------- возврат фокуса после пересборки списка ----------
    // Список пересобирается целиком, и фокус приходится ставить программно.
    // Chrome считает такой фокус «как с клавиатуры» и рисует :focus-visible —
    // после клика мышью по глазу строка так и оставалась обведённой зелёным.
    // Помним, был ли последним указатель, и на один заход гасим обводку меткой;
    // снимаем метку по уходу фокуса и по первой же клавише, чтобы клавиатурная
    // навигация обводку не потеряла.
    var pointerAt = 0;
    document.addEventListener('pointerdown', function () { pointerAt = Date.now(); }, true);
    function refocus(el) {
        var byPointer = Date.now() - pointerAt < 700;
        if (byPointer) {
            el.classList.add('nofv');
            var off = function () {
                el.classList.remove('nofv');
                el.removeEventListener('blur', off);
                document.removeEventListener('keydown', off, true);
            };
            el.addEventListener('blur', off);
            document.addEventListener('keydown', off, true);
        }
        el.focus();
    }

    // ---------- рендер ----------
    // Своп только при изменении HTML: фоновый тик котировок пересобирает модель
    // каждую секунду, а живой :hover и фокус в колонке рвать нельзя.
    function sbCtxSync() {
        flatSync();                                 // первый уровень живёт на любой вкладке
        userSync();                                 // имя/роль в подвале — тоже
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
        // Перечень мог ЦЕЛИКОМ уехать в первый уровень («Открытые портфели» —
        // мокап В4–В5): пустой блок с волосяной чертой не показываем, но
        // footSync выше уже отработал — шестерёнка «Настроек» остаётся.
        if (html === '<div class="sbc-list"></div>') {
            document.body.classList.remove('sb-ctx');
            if (host.__sbcHtml) { host.innerHTML = ''; host.__sbcHtml = ''; }
            return;
        }
        if (host.__sbcHtml !== html) {
            var ae = document.activeElement;
            var keepKey = ae && host.contains(ae) && ae.getAttribute ? ae.getAttribute('data-key') : null;
            host.innerHTML = html;
            host.__sbcHtml = html;
            if (keepKey) {
                var back = host.querySelector('.sbc-it[data-key="' + (window.CSS && CSS.escape ? CSS.escape(keepKey) : keepKey) + '"]');
                if (back) { try { refocus(back); } catch (e) {} }
            }
        }
        placeCtx(host);
    }
    window.sbCtxSync = sbCtxSync;

    // ---------- клики ----------
    // ПЕРЕХОД В «ПОРТФЕЛИ» ИЗ ЛЮБОГО МЕСТА. Пока «Обзор», «Ребаланс» и
    // «Торговля» жили вторым уровнем, они нажимались только на своей вкладке —
    // switchTab им был не нужен. В плоской навигации они стоят первым уровнем и
    // нажимаются с «Главной» и с «Рынка»: без переключения вкладки клик молча
    // ничего не делал (эту дыру владелец и нашёл).
    // Модуль ленивый: switchTab поднимает цепочку #pfLazySrc, но pfxGoTab
    // появляется только ПОСЛЕ неё — поэтому действие ждёт колбэка
    // ensurePortfoliosJs. Тот же договор, что у rbxGoPf в js/rebalance.js.
    function goPf(run) {
        var away = (typeof currentTab === 'undefined') || currentTab !== 'portfolios';
        if (away && window.switchTab) window.switchTab('portfolios');
        if (window.ensurePortfoliosJs) window.ensurePortfoliosJs(run);
        else run();
    }
    function onClick(e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var hit = t.closest('[data-act]');
        if (!hit) return;
        var act = hit.getAttribute('data-act'), key = hit.getAttribute('data-key') || '';
        e.preventDefault();
        e.stopPropagation();
        if (act === 'collapse') { if (window.toggleSidebarCollapse) window.toggleSidebarCollapse(); return; }
        // «Ещё» первого уровня: тот же договор, что у «Ещё» второго — раскрытие
        // запоминается, чтобы тот, кто ходит в «Отчёты» каждый день, раскрыл
        // список один раз.
        if (act === 'flatmore') {
            flatMoreOpen = !flatMoreOpen;
            try { localStorage.setItem(FLAT_MORE_KEY, flatMoreOpen ? '1' : '0'); } catch (e) {}
            flatSync();
            return;
        }
        // шеврон на «Моих портфелях»: складывает список открытых портфелей,
        // не трогая сам переход (клик по строке остаётся переходом)
        if (act === 'flatports') {
            portsOpen = !portsOpen;
            try { localStorage.setItem(PORTS_KEY, portsOpen ? '1' : '0'); } catch (e) {}
            flatSync();
            return;
        }
        if (act === 'ctxmore') {
            moreOpen = !moreOpen;
            try { localStorage.setItem(MORE_KEY, moreOpen ? '1' : '0'); } catch (e) {}
            sbCtxSync();
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
        if (act === 'pfx') { goPf(function () { if (window.pfxGoTab) window.pfxGoTab(key); }); return; }
        if (act === 'trading') { goPf(function () { if (window.pfxGoTrading) window.pfxGoTrading(); }); return; }
        if (act === 'pf') { goPf(function () { if (window.pfxOpenPf) window.pfxOpenPf(key); }); return; }
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
        // Первый уровень теперь тоже наш: строки подвкладок ходят по data-act,
        // как ходили вторым уровнем. Ссылки настоящих вкладок идут своим onclick
        // из разметки и до onClick не доходят — у них нет data-act.
        var nav = document.getElementById('sbNav');
        if (nav) nav.addEventListener('click', onClick);
        sbCtxSync();
    });
    // ширина рейки меняется вместе с колонкой — пересобираем на кроссинге брейкпоинта
    if (MQ.addEventListener) MQ.addEventListener('change', sbCtxSync);
    else if (MQ.addListener) MQ.addListener(sbCtxSync);
    // ВХОД И ВЫХОД МЕНЯЮТ СОСТАВ ПЕРВОГО УРОВНЯ. Гость видит четыре пункта,
    // вошедший — семь; без подписки на onChange список остался бы гостевым до
    // первой смены вкладки, то есть сразу после входа человек не увидел бы своих
    // портфелей в навигации.
    try {
        if (window.supa && window.supa.onChange) window.supa.onChange(function () {
            flatSync();
            userSync();   // вход/выход меняют и имя с ролью в подвале
        });
    } catch (e) {}
    // Свой тик бейджа. На «Портфелях» его пересобирает рендер, но на остальных
    // вкладках сайдбар — единственный, кто вообще спрашивает цены: без тика
    // метка дрейфа замерла бы на числе, посчитанном при заходе на вкладку.
    setInterval(function () {
        if (!wide() || document.hidden) return;
        badgeTick();
    }, 60000);
})();
