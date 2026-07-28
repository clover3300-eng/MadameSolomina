// ===== КОЛОНКА ВТОРОГО УРОВНЯ (сайдбар «Подъём», мокап В3-б) =====
// Рейка слева держит разделы, эта колонка — второй уровень АКТИВНОГО раздела:
// подвкладки «Портфелей» (жили в середине шапки), экраны «Торговли» третьим
// уровнем, открытые вкладки-портфели (жили в попапе на пилюле) и подвал
// с «Настройками» и «Свернуть».
//
// Разделы без второго уровня колонки не получают вовсе — она просто не
// показывается, и 212px уходят контенту (класс body.sb-ctx ставит sbCtxSync).
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
        collapse:  '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>',
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

    // У КАКИХ разделов колонка есть в принципе — знание статическое, и это важно:
    // «Портфели» грузятся лениво (#pfLazySrc), их модель приходит через полсекунды
    // после первого пейнта. Не зная заранее, что колонка будет, мы бы отдали ширину
    // контенту и через мгновение отняли — вкладка дёргалась бы на каждой прямой
    // загрузке /portfolios. Поэтому ширину резервируем сразу, а содержимое
    // дорисовываем, когда модель появится.
    var COL_TITLE = {
        portfolios: 'Портфели',
        calc: 'Расчёт', portfolio: 'Расчёт', monthly: 'Расчёт',
        market: 'Рынок', 'market-stocks': 'Рынок', 'market-bonds': 'Рынок'
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
        return null;
    }

    // ---------- разметка ----------
    function itemHtml(it) {
        var cls = 'sbc-it' + (it.on ? ' on' : '') + (it.cls ? ' ' + it.cls : '');
        // иконку модель может отдать готовым path'ом, ключом словаря или вовсе
        // не отдать (экраны «Торговли» — третий уровень, там её и не должно быть)
        var icon = it.icon || IC[it.iconKey] || (it.act === 'pfx' || it.act === 'trading' ? IC[it.key] : null);
        var right = '';
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
    function headHtml(m) {
        var cap = '';
        if (m.cap) {
            cap = '<div class="sbc-cap">' + esc(m.cap) +
                (m.chip ? '<span class="sbc-chip' + (m.chip.neg ? ' neg' : '') + '">' + esc(m.chip.tx) + '</span>' : '') +
                '</div>';
        }
        return '<div class="sbc-head' + (cap ? '' : ' solo') + '"><h4>' + esc(m.title) + '</h4>' + cap + '</div>';
    }
    function listHtml(m) {
        var h = '';
        (m.groups || []).forEach(function (g) {
            if (!g.items || !g.items.length) return;
            if (g.label) h += '<div class="sbc-grp"><span>' + esc(g.label) + '</span></div>';
            h += g.items.map(itemHtml).join('');
        });
        return '<div class="sbc-list">' + h + '</div>';
    }
    function footHtml(m) {
        var left = m.foot ? itemHtml(m.foot) : '<span style="flex:1"></span>';
        return '<div class="sbc-foot">' + left +
            '<button type="button" class="sbc-btn" data-act="collapse" data-key="" title="Свернуть колонку" ' +
            'aria-label="Свернуть колонку">' + svg(IC.collapse) + '</button></div>';
    }

    // ---------- рендер ----------
    // Своп только при изменении HTML: фоновый тик котировок пересобирает модель
    // каждую секунду, а живой :hover и фокус в колонке рвать нельзя.
    function sbCtxSync() {
        var host = document.getElementById('sbCtx');
        if (!host) return;
        var tab = (typeof currentTab !== 'undefined' && currentTab) ? currentTab : 'home';
        var m = null;
        try { m = modelFor(tab); } catch (e) { m = null; }
        var collapsed = document.body.classList.contains('sb-collapsed');
        var expect = wide() && !!COL_TITLE[tab];
        // sb-hascol — «у раздела второй уровень ЕСТЬ» (независимо от того,
        // свёрнут он или нет). По нему CSS решает, показывать ли кнопку
        // разворота внизу рейки: на «Главной» и «Тесте» разворачивать нечего,
        // и кнопка там была бы мёртвой.
        document.body.classList.toggle('sb-hascol', expect);
        document.body.classList.toggle('sb-ctx', expect && !collapsed);
        if (!m) {
            // раздел с колонкой, но модель ещё не приехала — держим шапку с именем
            // раздела: пустая колонка честнее скачка ширины
            if (!expect) {
                if (host.__sbcHtml) { host.innerHTML = ''; host.__sbcHtml = ''; }
                return;
            }
            m = { title: COL_TITLE[tab], solo: true, groups: [] };
        }
        var html = headHtml(m) + listHtml(m) + footHtml(m);
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
        // растворение у нижней кромки — только когда список честно не помещается
        var list = host.querySelector('.sbc-list');
        if (list) list.classList.toggle('is-scroll', list.scrollHeight - list.clientHeight > 2);
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
        sbCtxSync();
    });
    // ширина рейки меняется вместе с колонкой — пересобираем на кроссинге брейкпоинта
    if (MQ.addEventListener) MQ.addEventListener('change', sbCtxSync);
    else if (MQ.addListener) MQ.addListener(sbCtxSync);
})();
