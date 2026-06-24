// ===== ВКЛАДКА «ПОРТФЕЛИ» (мульти-портфельный дашборд) =====
// Несколько портфелей одновременно (до 4 карточек-мини-панелей в стиле «Капитал»):
//  • каждый портфель — donut распределения, прокручиваемое превью состава
//    (актив · дата покупки · цена покупки · кол-во · цена сейчас · годовых)
//  • выпадающие настройки ⚙: правка состава/дат/цен/кол-ва, имя, цвет, удаление,
//    импорт из расчёта; кнопка «цена по API» подставляет живую котировку MOEX
//  • «Развернуть» → большая карточка поверх контента (модалка в <body>)
//  • живые цены тянутся напрямую из бесплатного MOEX ISS (акции) и через
//    глобальный fetchBondData (облигации); доходность считается автоматически
//  • доп. блоки: LIVE-полоска, сводка по всем портфелям, сравнение доходности,
//    избранное (актив + потенциал + 1 новость на тикер), ставки рынка
(function () {
    'use strict';

    var STORE_KEY = 'portfolios_v1';
    var MAX_CARDS = 4;
    var ISS = 'https://iss.moex.com/iss/';
    var SHARES_URL = ISS + 'engines/stock/markets/shares/boards/TQBR/securities.json' +
        '?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LAST,LASTTOPREVPRICE';
    var QUOTE_TTL = 60000;   // 60с — кэш котировок акций

    var COLORS = [
        { id: 'blue',   v: '#3b82f6' }, { id: 'green',  v: '#10b981' },
        { id: 'amber',  v: '#f59e0b' }, { id: 'violet', v: '#8b5cf6' },
        { id: 'red',    v: '#ef4444' }, { id: 'cyan',   v: '#06b6d4' },
        { id: 'pink',   v: '#ec4899' }, { id: 'slate',  v: '#64748b' }
    ];

    // ---------- helpers ----------
    function dq(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function attr(s) { return esc(s).replace(/'/g, '&#39;'); }
    function toNum(s) { return parseFloat(String(s == null ? '' : s).replace('%', '').replace(/\s/g, '').replace(',', '.')); }
    function genId(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 9); }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function fmtRub(n) { if (n == null || !isFinite(n)) return '—'; var neg = n < 0; n = Math.abs(Math.round(n));
        return (neg ? '−' : '') + n.toLocaleString('ru-RU') + ' ₽'; }
    function fmtPrice(n) { if (n == null || !isFinite(n)) return '—';
        return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'; }
    function fmtPct(n) { if (n == null || !isFinite(n)) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
    function pad2(n) { return String(n).padStart(2, '0'); }
    function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function ruDate(ds) { if (!ds) return '—'; var p = ds.split('-'); return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0]) : ds; }

    // ---------- toast ----------
    function toast(msg, isErr) {
        var t = dq('pfToast');
        if (!t) { t = document.createElement('div'); t.id = 'pfToast'; t.className = 'pf-toast'; document.body.appendChild(t); }
        t.textContent = msg; t.classList.toggle('err', !!isErr);
        t.classList.add('show'); clearTimeout(t._tm);
        t._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
    }

    // ---------- модель / persist ----------
    function loadStore() {
        try { var o = JSON.parse(localStorage.getItem(STORE_KEY)); if (o && Array.isArray(o.items)) return o; } catch (e) {}
        return { v: 1, items: [] };
    }
    function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} }
    var store = loadStore();

    function findPf(id) { for (var i = 0; i < store.items.length; i++) if (store.items[i].id === id) return store.items[i]; return null; }
    function findHold(pf, hid) { var hs = pf.holdings || []; for (var i = 0; i < hs.length; i++) if (hs[i].id === hid) return hs[i]; return null; }
    function colorVal(c) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === c || COLORS[i].v === c) return COLORS[i].v; return c || COLORS[0].v; }

    function makePortfolio(name) {
        var used = {}; store.items.forEach(function (p) { used[p.color] = 1; });
        var col = COLORS[store.items.length % COLORS.length].id;
        for (var i = 0; i < COLORS.length; i++) if (!used[COLORS[i].id]) { col = COLORS[i].id; break; }
        return { id: genId('pf'), name: name || ('Портфель ' + (store.items.length + 1)), color: col, createdAt: Date.now(), holdings: [] };
    }

    // ---------- котировки ----------
    var quotes = {};         // ticker -> { price, chgPct }
    var quotesTs = 0, quotesLoading = false;
    var bondQuotes = {};     // isin -> price (₽), 0 = «не нашли»
    var bondPending = {};

    function collectTickers() {
        var s = {}, b = {};
        store.items.forEach(function (p) { (p.holdings || []).forEach(function (h) {
            if (!h.ticker) return; if (h.type === 'bond') b[h.ticker] = 1; else s[h.ticker] = 1; }); });
        return { stocks: Object.keys(s), bonds: Object.keys(b) };
    }

    function fetchStockQuotes() {
        return fetch(SHARES_URL, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
            var md = j.marketdata; if (!md || !md.data) return;
            var c = md.columns, si = c.indexOf('SECID'), li = c.indexOf('LAST'), pi = c.indexOf('LASTTOPREVPRICE');
            md.data.forEach(function (row) {
                var t = row[si], last = row[li];
                if (t && last != null && last !== '') quotes[t] = { price: +last, chgPct: (pi >= 0 && row[pi] != null ? +row[pi] : null) };
            });
            quotesTs = Date.now();
        });
    }

    function fetchBondQuote(isin) {
        if (!isin || bondQuotes[isin] != null || bondPending[isin]) return;
        if (typeof fetchBondData !== 'function') { bondQuotes[isin] = 0; return; }
        bondPending[isin] = true;
        Promise.resolve(fetchBondData(isin))
            .then(function (r) { bondQuotes[isin] = (r && r.price > 0) ? r.price : 0; })
            .catch(function () { bondQuotes[isin] = 0; })
            .then(function () { bondPending[isin] = false; softRerender(); });
    }

    // Подтянуть котировки (акции — общий запрос с TTL, облигации — по требованию)
    function ensureQuotes(force) {
        var held = collectTickers();
        held.bonds.forEach(fetchBondQuote);
        // TTL по времени последней ПОПЫТКИ (а не по наличию данных): иначе при
        // неудачном/пустом ответе MOEX quotes остаётся пустым, guard не срабатывает
        // и softRerender→ensureQuotes→fetch зацикливаются, подвешивая вкладку.
        if (!force && quotesTs && Date.now() - quotesTs < QUOTE_TTL) return;
        if (quotesLoading) return;
        quotesLoading = true;
        fetchStockQuotes().catch(function () {}).then(function () {
            quotesLoading = false; quotesTs = Date.now(); softRerender();
        });
    }

    // Цена «сейчас»: живой MOEX → таблица акций (ОДХС) → цена покупки
    function curPriceOf(h) {
        if (h.type === 'bond') { if (bondQuotes[h.ticker] > 0) return bondQuotes[h.ticker]; }
        else if (quotes[h.ticker]) return quotes[h.ticker].price;
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(h.ticker);
            if (co && co.main) { var p = toNum(co.main['Текущая Цена']); if (isFinite(p) && p > 0) return p; }
        }
        return +h.buyPrice || 0;
    }
    function isLive(h) { return h.type === 'bond' ? (bondQuotes[h.ticker] > 0) : !!quotes[h.ticker]; }

    // Разовый запрос цены для кнопки «по API»
    function lookupPrice(ticker, type, cb) {
        if (type === 'bond') {
            if (typeof fetchBondData !== 'function') return cb(null);
            Promise.resolve(fetchBondData(ticker)).then(function (r) {
                var p = r && r.price > 0 ? r.price : null; if (p) bondQuotes[ticker] = p; cb(p);
            }).catch(function () { cb(null); });
            return;
        }
        if (quotes[ticker] && Date.now() - quotesTs < QUOTE_TTL) return cb(quotes[ticker].price);
        fetchStockQuotes().then(function () { cb(quotes[ticker] ? quotes[ticker].price : null); }).catch(function () { cb(null); });
    }

    // ---------- вычисления ----------
    function daysHeld(ds) { if (!ds) return 0; var d = new Date(ds + 'T00:00:00'); if (isNaN(d.getTime())) return 0;
        return Math.max(0, (Date.now() - d.getTime()) / 86400000); }
    function annualize(inv, val, days) {
        if (inv <= 0 || val <= 0) return null;
        // Срок < 1 года не экстраполируем вверх (иначе −18% за месяц → −90%/год):
        // floor по сроку = 365 дней, поэтому для «свежих» позиций показывается
        // фактическая доходность за период, а не раздутая годовая.
        var yrs = Math.max(days, 365) / 365;
        return clamp((Math.pow(val / inv, 1 / yrs) - 1) * 100, -99.9, 9999);
    }
    function calcHold(h) {
        var qty = +h.qty || 0, buy = +h.buyPrice || 0, cur = curPriceOf(h) || buy;
        var invested = buy * qty, value = cur * qty, pnl = value - invested;
        return { qty: qty, buy: buy, cur: cur, invested: invested, value: value, pnl: pnl,
            pnlPct: invested > 0 ? pnl / invested * 100 : 0, days: daysHeld(h.buyDate),
            annual: annualize(invested, value, daysHeld(h.buyDate)), live: isLive(h) };
    }
    function calcPf(p) {
        var hs = (p.holdings || []).map(function (h) { return { h: h, c: calcHold(h) }; });
        var invested = 0, value = 0, bondVal = 0, stockVal = 0, asum = 0, wsum = 0;
        hs.forEach(function (x) {
            invested += x.c.invested; value += x.c.value;
            if (x.h.type === 'bond') bondVal += x.c.value; else stockVal += x.c.value;
            if (x.c.annual != null && x.c.invested > 0) { asum += x.c.annual * x.c.invested; wsum += x.c.invested; }
        });
        var bondPct = value > 0 ? bondVal / value * 100 : 0;
        return { hs: hs, invested: invested, value: value, pnl: value - invested,
            pnlPct: invested > 0 ? (value - invested) / invested * 100 : 0,
            annual: wsum > 0 ? asum / wsum : null, bondPct: bondPct, stockPct: 100 - bondPct,
            bondVal: bondVal, stockVal: stockVal, count: hs.length };
    }

    // ---------- состав из расчёта / избранного / ежемесячного дохода ----------
    // filter: 'all' | 'stock' | 'bond'
    function getCalcComposition(filter) {
        var sl = window._shoppingListData;
        var has = sl && ((sl.bonds && sl.bonds.length) || (sl.stocks && sl.stocks.length));
        if (!has) { try { var snap = JSON.parse(localStorage.getItem('dash_portfolio_v1')); if (snap && snap.composition) sl = snap.composition; } catch (e) {} }
        if (!sl) return null;
        function toHold(x, type) {
            var qty = +x.qty || 0, price = +x.price || (qty > 0 && x.sum ? x.sum / qty : 0);
            return { id: genId('h'), ticker: x.ticker, name: x.name || x.ticker, type: type,
                echelon: x.echelon || 0, buyDate: todayStr(), buyPrice: Math.round(price * 100) / 100, qty: qty, priceFromApi: false };
        }
        var holds = [];
        if (filter !== 'stock') (sl.bonds || []).forEach(function (b) { if (b.ticker) holds.push(toHold(b, 'bond')); });
        if (filter !== 'bond') (sl.stocks || []).forEach(function (s) { if (s.ticker) holds.push(toHold(s, 'stock')); });
        return holds.length ? holds : null;
    }
    // Избранные акции (звёздочки в «Рынок · Акции») → позиции с кол-вом 0
    function getFavComposition() {
        var favs = (typeof window.stkGetFavorites === 'function') ? window.stkGetFavorites() : favTickers();
        if (!favs || !favs.length) return null;
        var holds = favs.map(function (tk) {
            var co = (typeof window.stkFindCompany === 'function') ? window.stkFindCompany(tk) : null;
            var price = 0;
            if (co && co.main) { var pp = toNum(co.main['Текущая Цена']); if (isFinite(pp) && pp > 0) price = Math.round(pp * 100) / 100; }
            return { id: genId('h'), ticker: tk, name: (co && co.name) ? co.name : tk, type: 'stock',
                buyDate: todayStr(), buyPrice: price, qty: 0, priceFromApi: false };
        }).filter(function (h) { return h.ticker; });
        return holds.length ? holds : null;
    }
    // Облигации из калькулятора «Ежемесячный доход» (экспорт window.pfMonthlyBonds из data.js)
    function getMonthlyComposition() {
        var src = window.pfMonthlyBonds;
        if (!src || !src.length) return null;
        var holds = src.map(function (b) {
            var price = toNum(b.p); if (!isFinite(price) || price <= 0) price = 0;
            return { id: genId('h'), ticker: b.t, name: b.n || b.t, type: 'bond',
                buyDate: todayStr(), buyPrice: Math.round(price * 100) / 100, qty: 0, priceFromApi: false };
        }).filter(function (h) { return h.ticker; });
        return holds.length ? holds : null;
    }
    function compositionFrom(source, sub) {
        if (source === 'fav') return getFavComposition();
        if (source === 'monthly') return getMonthlyComposition();
        return getCalcComposition(sub || 'all');
    }
    function importName(source) {
        return source === 'fav' ? 'Избранное' : source === 'monthly' ? 'Ежемесячный доход' : 'Расчётный портфель';
    }

    // ---------- историческая цена на дату (механизм вкладки «Тест») ----------
    // btGetStockPriceSafe/btGetBondPriceSafe (webapp-tabs.js) тянут цену закрытия MOEX
    // на конкретную дату; облигации уже в рублях (×10 от % номинала). Возвращают >0,
    // 0 (нет данных) или -1 (ошибка) — нам годится только >0.
    function histPriceFn(type) {
        var name = type === 'bond' ? 'btGetBondPriceSafe' : 'btGetStockPriceSafe';
        if (typeof window[name] === 'function') return window[name];
        return null;
    }
    function lookupHistPrice(ticker, type, dateStr, cb) {
        var fn = histPriceFn(type);
        if (fn) {
            Promise.resolve(fn(ticker, dateStr)).then(function (p) { cb(p > 0 ? p : null); }).catch(function () { cb(null); });
            return;
        }
        lookupPrice(ticker, type, cb);   // фолбэк на живую котировку, если Тест не загружен
    }

    // ====================================================================
    //  РЕНДЕР
    // ====================================================================
    var openMenu = null;     // id портфеля с раскрытыми настройками
    var clockTimer = null;
    var rendering = false;   // защита от повторного входа (см. ниже)
    var loadStatus = {};     // hid -> { state:'loading'|'ok'|'err'|'nodate', date } для кнопки «Загрузить на дату»

    function renderPortfolios() {
        var host = dq('pfWrap'); if (!host) return;
        // favHtml() синхронно дёргает stkEnsureLoaded(): если таблица акций уже
        // загружена, та сразу вызывает onStkCompaniesLoaded()→renderPortfolios(),
        // т.е. рендер вызывает сам себя. Без этого guard'а получается бесконечная
        // рекурсия — главный поток виснет, а каждый виток ещё и шлёт запросы
        // (ensureQuotes/renderFavNews), забивая пул соединений → не грузятся даже
        // другие сайты. Повторный вход просто игнорируем.
        if (rendering) return;
        rendering = true;
        try {
            ensureQuotes();
            // 1 портфель → карточка + сводка «справа от портфеля» (.pf-solo);
            // несколько → сводка-полоса сверху, ниже сетка карточек.
            var body;
            if (store.items.length === 1) body = soloHtml(store.items[0]);
            else body = (store.items.length ? summaryHtml(false) : '') + gridHtml();
            host.innerHTML =
                liveBarHtml() +
                headHtml() +
                body +
                pairHtml() +
                ratesHtml();
            tickLive();
            renderFavNews();
            ensureClock();
            if (openMenu) { var m = dq('pfMenu-' + openMenu); if (m) m.scrollTop = 0; }
        } finally {
            rendering = false;
        }
    }
    window.renderPortfolios = renderPortfolios;

    function softRerender() {
        if (currentTab !== 'portfolios' || !dq('pfWrap')) return;
        if (openMenu) return;   // не сбиваем открытый редактор
        if (document.querySelector('.pf-impmenu.open')) return;   // не сбиваем открытое меню «Импорт»
        renderPortfolios();
    }

    // ---- LIVE-полоска (стиль дашборда, свои id, чтобы не дублировать) ----
    function liveBarHtml() {
        var tiles = [['imoex', 'IMOEX'], ['usd', 'USD/RUB'], ['btc', 'BTC']];
        return '<div class="dash2-livebar" id="pfLiveBar">' +
            '<div class="dlv-live"><span class="dlv-dot"></span>LIVE</div>' +
            '<div class="dlv-vsep"></div>' +
            '<div class="dlv-items">' + tiles.map(function (t) {
                return '<div class="dlv-item"><span class="dlv-k">' + t[1] + '</span>' +
                    '<span class="dlv-v" id="pflv-v-' + t[0] + '">—</span>' +
                    '<span class="dlv-c" id="pflv-c-' + t[0] + '"></span></div>';
            }).join('<span class="dlv-isep"></span>') + '</div>' +
            '<div class="dlv-time"><span class="dlv-time-k">MSK</span><span class="dlv-time-v" id="pfClock">--:--:--</span></div>' +
            '</div>';
    }
    function tickLive() {
        var clock = dq('pfClock');
        if (clock) { try { clock.textContent = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour12: false }); }
            catch (e) { clock.textContent = new Date().toLocaleTimeString('ru-RU', { hour12: false }); } }
        [['imoex', 'val-imoex', 'dyn-imoex'], ['usd', 'val-usdrub', 'dyn-usdrub'], ['btc', 'val-btc', 'dyn-btc']].forEach(function (p) {
            var v = dq('pflv-v-' + p[0]), c = dq('pflv-c-' + p[0]), sv = dq(p[1]), sd = dq(p[2]);
            if (v && sv) { var s = (sv.textContent || '').trim(); if (s) v.textContent = s; }
            if (c && sd) { c.textContent = (sd.textContent || '').trim();
                c.className = 'dlv-c ' + (sd.classList.contains('negative') ? 'neg' : (sd.classList.contains('positive') ? 'pos' : 'flat')); }
        });
    }
    function ensureClock() { if (clockTimer) return; clockTimer = setInterval(function () {
        if (currentTab === 'portfolios' && dq('pfClock')) tickLive(); }, 1000); }

    // ---- SVG-иконки ----
    var PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    var DL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    var CHEV_SVG = '<svg class="pf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    // ---- меню «Импорт» (расчёт / избранное / ежемесячный доход) ----
    function impMenuHtml(key, pid) {
        var up = key !== 'head';                                   // в шапке — вниз, иначе — вверх (не обрезается)
        var calc = !!getCalcComposition('all'), calcS = !!getCalcComposition('stock'),
            calcB = !!getCalcComposition('bond'), fav = !!getFavComposition(), mon = !!getMonthlyComposition();
        function oc(src, sub) { return "pfImport('" + src + "'," + (sub ? "'" + sub + "'" : 'null') + ',' + (pid ? "'" + pid + "'" : 'null') + ')'; }
        function item(src, sub, label, avail, cls) {
            return '<button class="pf-impitem' + (cls ? ' ' + cls : '') + (avail ? '' : ' off') + '"' +
                (avail ? '' : ' disabled') + ' onclick="' + oc(src, sub) + '">' + label + '</button>';
        }
        return '<div class="pf-impmenu' + (up ? ' up' : '') + '" id="pfImp-' + key + '">' +
            '<div class="pf-impgrp">Из расчёта</div>' +
            item('calc', 'all', 'Весь расчёт', calc) +
            item('calc', 'stock', 'Только акции', calcS, 'sub') +
            item('calc', 'bond', 'Только облигации', calcB, 'sub') +
            '<div class="pf-impgrp">Другое</div>' +
            item('fav', null, 'Из избранного', fav) +
            item('monthly', null, 'Из ежемесячного дохода', mon) +
            '</div>';
    }
    function impWrapHtml(key, pid) {
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'' + key + '\')">' +
                DL_SVG + 'Импорт' + CHEV_SVG + '</button>' +
            impMenuHtml(key, pid) + '</div>';
    }

    // ---- заголовок ----
    function headHtml() {
        return '<div class="d3-head">' +
            '<div class="d3-head-l"><h1 class="d3-title">Портфели</h1>' +
            '<span class="d3-sub">Отслеживание и сравнение нескольких портфелей</span></div>' +
            '<div class="d3-head-actions">' +
                '<button class="d3-quick" onclick="pfAddPortfolio()">' + PLUS_SVG + 'Добавить портфель</button>' +
                impWrapHtml('head', null) +
            '</div></div>';
    }

    // 1 портфель: карточка слева + сводка-капитал справа (aside)
    function soloHtml(p) {
        return '<div class="pf-solo">' +
            '<div class="pf-solo-main">' + cardHtml(p, 0) + '</div>' +
            '<div class="pf-solo-side">' + summaryHtml(true) + '</div>' +
        '</div>';
    }

    // ---- сводка по всем портфелям (aside=true — вертикальная колонка справа от 1 портфеля) ----
    function summaryHtml(aside) {
        var inv = 0, val = 0, bondVal = 0, stockVal = 0, best = null, worst = null;
        store.items.forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value; bondVal += c.bondVal; stockVal += c.stockVal;
            if (c.invested > 0) {
                if (!best || c.pnlPct > best.pct) best = { name: p.name, pct: c.pnlPct, color: p.color };
                if (!worst || c.pnlPct < worst.pct) worst = { name: p.name, pct: c.pnlPct, color: p.color };
            }
        });
        var pnl = val - inv, pnlPct = inv > 0 ? pnl / inv * 100 : 0;
        var bondPct = val > 0 ? bondVal / val * 100 : 0;
        var bw = '';
        if (best) bw += '<div class="pfs-bw"><span class="pfs-bw-l">Лучший</span>' +
            '<span class="pfs-bw-n"><i style="background:' + colorVal(best.color) + '"></i>' + esc(best.name) + '</span>' +
            '<span class="pfs-bw-v ' + (best.pct >= 0 ? 'pos' : 'neg') + '">' + fmtPct(best.pct) + '</span></div>';
        if (worst && store.items.length > 1) bw += '<div class="pfs-bw"><span class="pfs-bw-l">Худший</span>' +
            '<span class="pfs-bw-n"><i style="background:' + colorVal(worst.color) + '"></i>' + esc(worst.name) + '</span>' +
            '<span class="pfs-bw-v ' + (worst.pct >= 0 ? 'pos' : 'neg') + '">' + fmtPct(worst.pct) + '</span></div>';

        return '<div class="dash2-card pf-summary' + (aside ? ' pf-summary--aside' : '') + '">' +
            '<div class="pfs-main">' +
                '<div class="pfs-eyebrow">Суммарный капитал · ' + store.items.length + ' ' + plural(store.items.length, 'портфель', 'портфеля', 'портфелей') + '</div>' +
                '<div class="pfs-capital">' + fmtRub(val) + '</div>' +
                '<div class="pfs-sub">Вложено ' + fmtRub(inv) + ' · ' +
                    '<span class="pfs-pnl ' + (pnl >= 0 ? 'pos' : 'neg') + '">' + (pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(pnl)) + ' (' + fmtPct(pnlPct) + ')</span></div>' +
            '</div>' +
            '<div class="pfs-mid">' + bw + '</div>' +
            '<div class="pfs-ring">' + donutHtml(bondPct, 'Активы', (store.items.reduce(function (a, p) { return a + (p.holdings || []).length; }, 0)) || '0', 104) +
                '<div class="pfs-legend">' +
                    '<span><i class="bond"></i>Облигации ' + Math.round(bondPct) + '%</span>' +
                    '<span><i class="stock"></i>Акции ' + Math.round(100 - bondPct) + '%</span>' +
                '</div></div>' +
            '</div>';
    }
    function plural(n, one, few, many) { n = Math.abs(n) % 100; var n1 = n % 10;
        if (n > 10 && n < 20) return many; if (n1 > 1 && n1 < 5) return few; if (n1 === 1) return one; return many; }

    // ---- donut (conic). Центр — СОСЕД ring'а: CSS-mask клипает потомков ----
    function donutHtml(bondPct, top, val, size) {
        size = size || 96;
        var bp = clamp(bondPct, 0, 100);
        return '<div class="pf-ring-wrap" style="width:' + size + 'px;height:' + size + 'px">' +
            '<div class="pf-ring" style="--bp:' + bp.toFixed(1) + '"></div>' +
            '<div class="pf-ring-c"><span class="pf-ring-top">' + esc(top) + '</span><span class="pf-ring-val">' + esc(val) + '</span></div></div>';
    }

    // ---- сетка карточек ----
    function gridHtml() {
        if (!store.items.length) return emptyHtml();
        var cards = store.items.slice(0, MAX_CARDS).map(function (p, i) { return cardHtml(p, i); }).join('');
        return '<div class="pf-grid">' + cards + '</div>';
    }
    function emptyHtml() {
        return '<div class="dash2-card pf-empty">' +
            '<div class="pf-empty-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/></svg></div>' +
            '<div class="pf-empty-t">Пока нет портфелей</div>' +
            '<div class="pf-empty-s">Создайте портфель вручную или импортируйте состав из расчёта, избранного или ежемесячного дохода.</div>' +
            '<div class="pf-empty-cta">' +
                '<button class="d3-quick" onclick="pfAddPortfolio()">Создать вручную</button>' +
                impWrapHtml('empty', null) +
            '</div></div>';
    }

    var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

    function cardHtml(p, idx) {
        var c = calcPf(p), ac = colorVal(p.color);
        var pnlCls = c.pnl >= 0 ? 'pos' : 'neg';
        var holdsRows = c.hs.length ? c.hs.map(function (x) { return holdRowHtml(x); }).join('')
            : '<div class="pfc-empty">Состав пуст — добавьте активы в настройках ⚙</div>';
        var menu = (openMenu === p.id) ? menuHtml(p) : '';
        var wm = ('0' + (((idx || 0) + 1))).slice(-2);

        return '<div class="dash2-card pf-card' + (openMenu === p.id ? ' menu-open' : '') + '" style="--pf-accent:' + ac + '">' +
            '<div class="pf-wm-clip"><span class="pf-wm">' + wm + '</span></div>' +
            '<div class="pfc-top">' +
                '<div class="pfc-titles">' +
                    '<span class="pfc-k"><i class="pfc-dot"></i>Портфель · ' + c.count + ' ' + plural(c.count, 'актив', 'актива', 'активов') + '</span>' +
                    '<span class="pfc-name" title="' + attr(p.name) + '">' + esc(p.name) + '</span>' +
                '</div>' +
                '<div class="pfc-ctrls">' +
                    '<span class="pfc-pnl ' + pnlCls + '">' + fmtPct(c.pnlPct) + '</span>' +
                    '<button class="pfc-gear' + (openMenu === p.id ? ' on' : '') + '" onclick="pfToggleMenu(\'' + p.id + '\')" aria-label="Настройки">' + GEAR_SVG + '</button>' +
                '</div>' +
            '</div>' +
            menu +
            '<div class="pfc-body">' +
                donutHtml(c.bondPct, 'Капитал', c.count + ' ' + plural(c.count, 'актив', 'актива', 'активов'), 96) +
                '<div class="pfc-kv">' +
                    kv('Стоимость', fmtRub(c.value)) +
                    kv('Вложено', fmtRub(c.invested)) +
                    kv('Доход', fmtRub(c.pnl), pnlCls) +
                    kv('Годовых', c.annual == null ? '—' : fmtPct(c.annual), c.annual == null ? '' : (c.annual >= 0 ? 'pos' : 'neg')) +
                '</div>' +
            '</div>' +
            '<div class="pfc-holds">' +
                '<div class="pfc-cols"><span>Актив</span><span>Куплен</span><span>Цена</span><span>Кол-во</span><span>Сейчас</span><span>Годовых</span></div>' +
                '<div class="pfc-scroll">' + holdsRows + '</div>' +
            '</div>' +
            '<div class="pfc-foot">' +
                '<button class="pfc-expand" onclick="pfExpand(\'' + p.id + '\')">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>' +
                    'Развернуть</button>' +
            '</div>' +
        '</div>';
    }
    function kv(l, v, cls) { return '<div class="pfc-kvi"><span class="pfc-kl">' + esc(l) + '</span><span class="pfc-kvv ' + (cls || '') + '">' + v + '</span></div>'; }

    function holdRowHtml(x) {
        var h = x.h, c = x.c, ac = c.annual;
        return '<div class="pfc-row">' +
            '<span class="pfc-tk"><b>' + esc(h.ticker) + '</b><i>' + esc(h.type === 'bond' ? 'обл' : 'акц') + '</i></span>' +
            '<span class="pfc-cell">' + ruDate(h.buyDate) + '</span>' +
            '<span class="pfc-cell">' + fmtPrice(c.buy) + '</span>' +
            '<span class="pfc-cell">' + (c.qty || 0) + '</span>' +
            '<span class="pfc-cell' + (c.live ? ' live' : '') + '">' + fmtPrice(c.cur) + '</span>' +
            '<span class="pfc-cell pfc-an ' + (ac == null ? '' : (ac >= 0 ? 'pos' : 'neg')) + '">' + (ac == null ? '—' : fmtPct(ac)) + '</span>' +
        '</div>';
    }

    // ---- настройки/редактор (дропдаун ⚙) ----
    function menuHtml(p) {
        var sw = COLORS.map(function (cc) {
            return '<button class="pfm-sw' + (p.color === cc.id ? ' on' : '') + '" style="--sw:' + cc.v + ';background:' + cc.v + '" onclick="pfSetColor(\'' + p.id + '\',\'' + cc.id + '\')" aria-label="' + cc.id + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>';
        }).join('');
        var rows = (p.holdings || []).map(function (h) { return editRowHtml(p.id, h); }).join('');
        var n = (p.holdings || []).length;
        // Оверлей на всю карточку: шапка (имя + цвет напротив + Готово) · состав (скролл) · добавление/действия
        return '<div class="pfc-menu" id="pfMenu-' + p.id + '">' +
            '<div class="pfm-top">' +
                '<input class="pfm-name" value="' + attr(p.name) + '" onchange="pfRename(\'' + p.id + '\',this.value)" placeholder="Название портфеля">' +
                '<div class="pfm-colors">' + sw + '</div>' +
                '<button class="pfm-done" onclick="pfCloseMenu()">' + CHECK_SVG + 'Готово</button>' +
            '</div>' +
            '<div class="pfm-mid">' +
                '<div class="pfm-sec"><span>Состав · ' + n + ' ' + plural(n, 'актив', 'актива', 'активов') + '</span></div>' +
                '<div class="pfm-rows">' + (rows || '<div class="pfm-none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>Активов пока нет — добавьте первый ниже</div>') + '</div>' +
            '</div>' +
            '<div class="pfm-bottom">' +
                '<div class="pfm-add">' +
                    '<input class="pfm-in pfm-in-tk" id="pfNewTk-' + p.id + '" placeholder="Тикер / ISIN" maxlength="14">' +
                    '<select class="pfm-in pfm-in-type" id="pfNewType-' + p.id + '"><option value="stock">Акция</option><option value="bond">Облигация</option></select>' +
                    '<button class="pfm-addbtn" onclick="pfAddHolding(\'' + p.id + '\')">' + PLUS_SVG + 'Добавить</button>' +
                '</div>' +
                '<div class="pfm-foot">' +
                    impWrapHtml('imp-' + p.id, p.id) +
                    '<button class="pfm-act danger" onclick="pfDelete(\'' + p.id + '\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Удалить</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }
    function priceStatusHtml(h) {
        var st = loadStatus[h.id], state = st && st.state;
        if (state === 'loading') return '<span class="pfm-loadst loading">загрузка цены…</span>';
        if (state === 'ok') return '<span class="pfm-loadst ok">цена закрытия на ' + ruDate(st.date) + '</span>';
        if (state === 'err') return '<span class="pfm-loadst err">нет цены на ' + ruDate(st.date) + '</span>';
        if (state === 'nodate') return '<span class="pfm-loadst err">укажите дату покупки</span>';
        if (h.priceFromApi) return '<span class="pfm-loadst ok">цена закрытия на ' + ruDate(h.buyDate) + '</span>';
        return '<span class="pfm-loadst muted">цена закрытия MOEX на дату покупки</span>';
    }
    function editRowHtml(pid, h) {
        var tag = h.type === 'bond' ? 'обл' : 'акц';
        return '<div class="pfm-row">' +
            '<div class="pfm-row-main">' +
                '<span class="pfm-tk-cell"><span class="pfm-tag ' + h.type + '">' + tag + '</span>' +
                    '<input class="pfm-in pfm-in-tk" value="' + attr(h.ticker) + '" onchange="pfEdit(\'' + pid + '\',\'' + h.id + '\',\'ticker\',this.value)" placeholder="Тикер"></span>' +
                '<input class="pfm-in pfm-in-date" type="date" value="' + attr(h.buyDate) + '" onchange="pfEdit(\'' + pid + '\',\'' + h.id + '\',\'buyDate\',this.value)">' +
                '<input class="pfm-in pfm-in-num" type="number" step="0.01" min="0" value="' + (h.buyPrice || '') + '" onchange="pfEdit(\'' + pid + '\',\'' + h.id + '\',\'buyPrice\',this.value)" placeholder="цена ₽">' +
                '<input class="pfm-in pfm-in-num" type="number" step="1" min="0" value="' + (h.qty || '') + '" onchange="pfEdit(\'' + pid + '\',\'' + h.id + '\',\'qty\',this.value)" placeholder="кол-во">' +
                '<button class="pfm-del" onclick="pfRemoveHolding(\'' + pid + '\',\'' + h.id + '\')" aria-label="Удалить">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>' +
            '<div class="pfm-row-load">' +
                '<button class="pfm-loadbtn" onclick="pfFetchPrice(\'' + pid + '\',\'' + h.id + '\')">' + DL_SVG + 'Загрузить цену на дату</button>' +
                priceStatusHtml(h) +
            '</div>' +
        '</div>';
    }

    // ---- сравнение доходности ----
    function compareHtml() {
        var rows = store.items.map(function (p) { var c = calcPf(p); return { p: p, ann: c.annual, pnl: c.pnlPct }; });
        var maxAbs = 1; rows.forEach(function (r) { if (r.ann != null) maxAbs = Math.max(maxAbs, Math.abs(r.ann)); });
        var sorted = rows.slice().sort(function (a, b) { return (b.ann == null ? -1e9 : b.ann) - (a.ann == null ? -1e9 : a.ann); });
        var body = sorted.map(function (r) {
            var ac = colorVal(r.p.color), ann = r.ann;
            var w = ann == null ? 0 : Math.abs(ann) / maxAbs * 100;
            return '<div class="pfcmp-row">' +
                '<span class="pfcmp-n"><i style="background:' + ac + '"></i>' + esc(r.p.name) + '</span>' +
                '<span class="pfcmp-track"><span class="pfcmp-bar ' + (ann >= 0 ? 'pos' : 'neg') + '" style="width:' + w.toFixed(1) + '%;background:' + ac + '"></span></span>' +
                '<span class="pfcmp-v ' + (ann == null ? '' : (ann >= 0 ? 'pos' : 'neg')) + '">' + (ann == null ? '—' : fmtPct(ann)) + '</span>' +
            '</div>';
        }).join('');
        return '<div class="dash2-card pf-card2 pf-compare">' +
            pfCardHead('Аналитика', 'Сравнение доходности', 'годовых по всем портфелям', '') +
            '<div class="pfcmp-list">' + body + '</div></div>';
    }

    // Парный блок: «Сравнение доходности» + «Избранное» рядом (лекало «Ежемесячный доход»)
    function pairHtml() {
        var hasCompare = store.items.length > 1;
        var inner = (hasCompare ? compareHtml() : '') + favHtml();
        return '<div class="pf-pair' + (hasCompare ? '' : ' single') + '">' + inner + '</div>';
    }

    // Шапка вторичной карточки в стиле calc-карточек (.k eyebrow + .t заголовок)
    function pfCardHead(k, t, sub, right) {
        return '<div class="pf-ch">' +
            '<div class="pf-ch-l">' +
                '<span class="pf-ch-k">' + esc(k) + '</span>' +
                '<span class="pf-ch-t">' + esc(t) + (sub ? '<span class="pf-ch-s">' + esc(sub) + '</span>' : '') + '</span>' +
            '</div>' + (right || '') + '</div>';
    }

    // ---- избранное (актив · потенциал · новость) ----
    function favTickers() { try { return (typeof window.stkGetFavorites === 'function') ? window.stkGetFavorites() : (JSON.parse(localStorage.getItem('stk_fav_v1')) || []); } catch (e) { return []; } }
    function potentialOf(tk) {
        if (typeof window.stkFindCompany !== 'function') return null;
        var co = window.stkFindCompany(tk); if (!co || !co.main) return null;
        var n = toNum(co.main['ОДХС']); if (!isFinite(n)) return null; return n;
    }
    function favHtml() {
        if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }
        var favs = favTickers();
        var inner;
        if (!favs.length) {
            inner = '<div class="pff-empty">Нет избранных акций. Добавьте их звёздочкой в разделе «Рынок · Акции».</div>';
        } else {
            inner = favs.slice(0, 12).map(function (tk) {
                var co = (typeof window.stkFindCompany === 'function') ? window.stkFindCompany(tk) : null;
                var name = co && co.name ? co.name : tk;
                var pot = potentialOf(tk);
                var potHtml = pot == null ? '<span class="pff-pot muted">—</span>'
                    : '<span class="pff-pot ' + (pot >= 0 ? 'pos' : 'neg') + '">' + fmtPct(pot) + '</span>';
                return '<div class="pff-row" onclick="pfOpenTicker(\'' + esc(tk) + '\')">' +
                    '<div class="pff-l"><span class="pff-tk">' + esc(tk) + '</span><span class="pff-nm">' + esc(name) + '</span></div>' +
                    '<div class="pff-news" id="pf-news-' + esc(tk) + '"><span class="pff-news-load">загрузка новости…</span></div>' +
                    '<div class="pff-r"><span class="pff-pot-l">потенциал</span>' + potHtml + '</div>' +
                '</div>';
            }).join('');
        }
        return '<div class="dash2-card pf-card2 pf-fav">' +
            pfCardHead('Рынок', 'Избранное', 'потенциал и свежая новость по тикеру',
                '<button class="pf-ch-go" onclick="switchTab(\'market-stocks\')">Все акции ' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></button>') +
            '<div class="pff-list">' + inner + '</div></div>';
    }
    function renderFavNews() {
        var favs = favTickers(); if (!favs.length || typeof loadNewsForTicker !== 'function') return;
        favs.slice(0, 12).forEach(function (tk) {
            var slot = dq('pf-news-' + tk); if (!slot) return;
            Promise.resolve(loadNewsForTicker(tk)).then(function (news) {
                var s = dq('pf-news-' + tk); if (!s) return;
                if (!news || !news.length) { s.innerHTML = '<span class="pff-news-none">нет новостей</span>'; return; }
                var item = news[0];
                var d = new Date(item.date);
                var rel = (typeof getRelativeDateText === 'function' && !isNaN(d.getTime())) ? getRelativeDateText(d)
                    : (isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
                var title = String(item.title || '').slice(0, 78);
                s.innerHTML = '<span class="pff-news-t">' + esc(title) + (item.title && item.title.length > 78 ? '…' : '') + '</span>' +
                    '<span class="pff-news-m"><i>Smart-Lab</i>' + (rel ? ' · ' + esc(rel) : '') + '</span>';
            }).catch(function () { var s = dq('pf-news-' + tk); if (s) s.innerHTML = '<span class="pff-news-none">нет новостей</span>'; });
        });
    }

    // ---- ставки рынка (как на дашборде) ----
    function ratesHtml() {
        var rd = window.ratesData || (typeof ratesData !== 'undefined' ? ratesData : {});
        function rv(id, fb) { var e = dq(id); var t = e ? (e.textContent || '').trim() : '';
            if (t && /\d/.test(t) && t.indexOf('---') < 0) return t; if (fb != null && /\d/.test(String(fb))) return fb; return t || '—'; }
        var tiles = [
            { l: 'Ключевая ставка', v: rv('val-key-rate', rd.keyRate), ac: '#119d5c', ic: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>' },
            { l: 'Ставка по вкладам', v: rv('val-deposit-rate', rd.depositRate), ac: '#5B7C99', ic: '<polygon points="12 2 21 7 3 7"/><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="12" y1="18" x2="12" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/>' },
            { l: 'Инфляция, год', v: rv('val-inflation', rd.inflation), ac: '#D97757', ic: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
            { l: 'Доходность ОФЗ 10 лет', v: rv('val-ofz10', rd.ofz10), ac: '#3d6fd1', ic: '<path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 20 7"/>' }
        ];
        return '<div class="d3-ratesband">' +
            '<div class="drt-head"><div class="drt-title">Ставки рынка</div><span class="drt-tag">Россия · ЦБ РФ</span></div>' +
            '<div class="drt-grid">' + tiles.map(function (t) {
                return '<div class="drt-tile" style="--ac:' + t.ac + '"><div class="drt-ic"><svg viewBox="0 0 24 24">' + t.ic + '</svg></div>' +
                    '<div class="drt-body"><div class="drt-l">' + esc(t.l) + '</div><div class="drt-v">' + esc(t.v) + '</div></div></div>';
            }).join('') + '</div></div>';
    }

    // ====================================================================
    //  ДЕЙСТВИЯ (inline onclick)
    // ====================================================================
    window.pfAddPortfolio = function () {
        if (store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' портфеля на странице', true); return; }
        var p = makePortfolio(); store.items.push(p); saveStore(); openMenu = p.id; renderPortfolios();
    };
    // Импорт: pid задан → добавить в портфель; pid null → новый портфель.
    // source: 'calc' (sub: all/stock/bond) | 'fav' | 'monthly'
    window.pfImport = function (source, sub, pid) {
        closeImpMenus();
        var holds = compositionFrom(source, sub);
        if (!holds || !holds.length) { toast('Нет данных для импорта — выполните расчёт / добавьте избранное', true); return; }
        if (pid) {
            var p = findPf(pid); if (!p) return;
            p.holdings = (p.holdings || []).concat(holds); saveStore(); ensureQuotes(true); renderPortfolios();
            toast('Добавлено: ' + holds.length); return;
        }
        if (store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' портфеля', true); return; }
        var np = makePortfolio(importName(source)); np.holdings = holds; store.items.push(np); saveStore();
        openMenu = null; ensureQuotes(true); renderPortfolios(); toast('Импортировано: ' + holds.length);
    };
    function closeImpMenus() {
        var any = document.querySelectorAll('.pf-impmenu.open');
        for (var i = 0; i < any.length; i++) any[i].classList.remove('open');
        document.removeEventListener('click', pfImpOutside);
    }
    function pfImpOutside(e) { if (!e.target.closest('.pf-impwrap')) closeImpMenus(); }
    window.pfToggleImp = function (ev, key) {
        if (ev) ev.stopPropagation();
        var menu = dq('pfImp-' + key); if (!menu) return;
        var willOpen = !menu.classList.contains('open');
        closeImpMenus();
        if (willOpen) { menu.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
    };
    window.pfToggleMenu = function (pid) { openMenu = (openMenu === pid) ? null : pid; renderPortfolios(); };
    window.pfCloseMenu = function () { openMenu = null; renderPortfolios(); };
    window.pfRename = function (pid, val) { var p = findPf(pid); if (!p) return; p.name = (val || '').trim() || p.name; saveStore(); renderPortfolios(); };
    window.pfSetColor = function (pid, col) { var p = findPf(pid); if (!p) return; p.color = col; saveStore(); renderPortfolios(); };
    window.pfDelete = function (pid) {
        var p = findPf(pid); if (!p) return;
        if (!confirm('Удалить портфель «' + p.name + '»? Действие необратимо.')) return;
        store.items = store.items.filter(function (x) { return x.id !== pid; }); saveStore();
        if (openMenu === pid) openMenu = null; renderPortfolios(); toast('Портфель удалён');
    };
    window.pfAddHolding = function (pid) {
        var p = findPf(pid); if (!p) return;
        var tkEl = dq('pfNewTk-' + pid), tyEl = dq('pfNewType-' + pid);
        var tk = (tkEl && tkEl.value || '').trim().toUpperCase(); if (!tk) { toast('Введите тикер', true); return; }
        var type = (tyEl && tyEl.value) === 'bond' ? 'bond' : 'stock';
        p.holdings = p.holdings || [];
        p.holdings.push({ id: genId('h'), ticker: tk, name: tk, type: type, buyDate: todayStr(), buyPrice: 0, qty: 0, priceFromApi: false });
        saveStore(); ensureQuotes(true); renderPortfolios();
    };
    window.pfRemoveHolding = function (pid, hid) {
        var p = findPf(pid); if (!p) return;
        p.holdings = (p.holdings || []).filter(function (h) { return h.id !== hid; }); saveStore(); renderPortfolios();
    };
    window.pfEdit = function (pid, hid, field, val) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        if (field === 'ticker') { h.ticker = (val || '').trim().toUpperCase(); h.name = h.ticker; h.priceFromApi = false; delete loadStatus[hid]; }
        else if (field === 'buyDate') { h.buyDate = val; h.priceFromApi = false; delete loadStatus[hid]; }
        else if (field === 'buyPrice') { h.buyPrice = Math.max(0, toNum(val) || 0); h.priceFromApi = false; delete loadStatus[hid]; }
        else if (field === 'qty') { h.qty = Math.max(0, Math.round(toNum(val) || 0)); }
        saveStore(); ensureQuotes(); renderPortfolios();
    };
    // Цена покупки = историческая цена закрытия MOEX на h.buyDate (механизм вкладки «Тест»)
    window.pfFetchPrice = function (pid, hid) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid);
        if (!h || !h.ticker) { toast('Сначала укажите тикер', true); return; }
        if (!h.buyDate) { loadStatus[hid] = { state: 'nodate' }; renderPortfolios(); return; }
        loadStatus[hid] = { state: 'loading' }; renderPortfolios();
        lookupHistPrice(h.ticker, h.type, h.buyDate, function (price) {
            var cur = findHold(findPf(pid) || {}, hid); if (!cur) return;
            if (price && price > 0) {
                cur.buyPrice = Math.round(price * 100) / 100; cur.priceFromApi = true;
                loadStatus[hid] = { state: 'ok', date: cur.buyDate }; saveStore(); renderPortfolios();
                toast(cur.ticker + ': ' + fmtPrice(price) + ' на ' + ruDate(cur.buyDate));
            } else {
                loadStatus[hid] = { state: 'err', date: cur.buyDate }; renderPortfolios();
                toast('Нет цены ' + cur.ticker + ' на ' + ruDate(cur.buyDate), true);
            }
        });
    };
    window.pfOpenTicker = function (tk) { if (typeof window.openStockDetail === 'function') { try { window.openStockDetail(tk, 1); } catch (e) {} } };

    // ====================================================================
    //  РАЗВОРОТ ПОРТФЕЛЯ — модалка поверх контента (в <body>)
    // ====================================================================
    window.pfExpand = function (pid) {
        var p = findPf(pid); if (!p) return;
        ensureQuotes(true);
        var ov = dq('pfOverlay');
        if (!ov) { ov = document.createElement('div'); ov.id = 'pfOverlay'; document.body.appendChild(ov);
            ov.addEventListener('click', function (e) { if (e.target === ov) window.pfCloseOverlay(); }); }
        ov.dataset.pid = pid;
        ov.innerHTML = overlayHtml(p);
        ov.classList.add('show'); document.body.classList.add('pf-modal-open');
        document.addEventListener('keydown', pfEscClose);
    };
    window.pfCloseOverlay = function () {
        var ov = dq('pfOverlay'); if (ov) ov.classList.remove('show');
        document.body.classList.remove('pf-modal-open'); document.removeEventListener('keydown', pfEscClose);
    };
    function pfEscClose(e) { if (e.key === 'Escape') window.pfCloseOverlay(); }

    function overlayHtml(p) {
        var c = calcPf(p), ac = colorVal(p.color), pnlCls = c.pnl >= 0 ? 'pos' : 'neg';
        var rows = c.hs.length ? c.hs.map(function (x) {
            var h = x.h, cc = x.c;
            return '<tr>' +
                '<td class="pfo-tk"><b>' + esc(h.ticker) + '</b><span>' + esc(h.name || '') + '</span></td>' +
                '<td><span class="pfo-tag ' + h.type + '">' + (h.type === 'bond' ? 'обл' : 'акц') + '</span></td>' +
                '<td>' + ruDate(h.buyDate) + '</td>' +
                '<td>' + fmtPrice(cc.buy) + (h.priceFromApi ? ' <i class="pfo-api">API</i>' : '') + '</td>' +
                '<td>' + (cc.qty || 0) + '</td>' +
                '<td>' + fmtRub(cc.invested) + '</td>' +
                '<td class="' + (cc.live ? 'pfo-live' : '') + '">' + fmtPrice(cc.cur) + '</td>' +
                '<td>' + fmtRub(cc.value) + '</td>' +
                '<td class="' + (cc.pnl >= 0 ? 'pos' : 'neg') + '">' + fmtRub(cc.pnl) + '<small>' + fmtPct(cc.pnlPct) + '</small></td>' +
                '<td class="' + (cc.annual == null ? '' : (cc.annual >= 0 ? 'pos' : 'neg')) + '">' + (cc.annual == null ? '—' : fmtPct(cc.annual)) + '</td>' +
            '</tr>';
        }).join('') : '<tr><td colspan="10" class="pfo-empty">Состав портфеля пуст</td></tr>';

        return '<div class="pfo-card" style="--pf-accent:' + ac + '">' +
            '<div class="pfo-head">' +
                '<div class="pfo-head-l"><span class="pfo-dot"></span>' +
                    '<div><div class="pfo-name">' + esc(p.name) + '</div>' +
                    '<div class="pfo-meta">' + c.count + ' ' + plural(c.count, 'актив', 'актива', 'активов') + ' · создан ' + new Date(p.createdAt).toLocaleDateString('ru-RU') + '</div></div></div>' +
                '<button class="pfo-x" onclick="pfCloseOverlay()" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>' +
            '<div class="pfo-top">' +
                '<div class="pfo-ring">' + donutHtml(c.bondPct, 'Капитал', fmtRub(c.value).replace(' ₽', ''), 132) +
                    '<div class="pfo-legend"><span><i class="bond"></i>Облигации · ' + fmtRub(c.bondVal) + '</span><span><i class="stock"></i>Акции · ' + fmtRub(c.stockVal) + '</span></div></div>' +
                '<div class="pfo-stats">' +
                    pfoStat('Стоимость сейчас', fmtRub(c.value)) +
                    pfoStat('Вложено', fmtRub(c.invested)) +
                    pfoStat('Доход', fmtRub(c.pnl) + '  (' + fmtPct(c.pnlPct) + ')', pnlCls) +
                    pfoStat('Доходность годовых', c.annual == null ? '—' : fmtPct(c.annual), c.annual == null ? '' : (c.annual >= 0 ? 'pos' : 'neg')) +
                '</div>' +
            '</div>' +
            '<div class="pfo-tablewrap"><table class="pfo-table"><thead><tr>' +
                '<th>Актив</th><th>Тип</th><th>Дата покупки</th><th>Цена покупки</th><th>Кол-во</th><th>Вложено</th><th>Цена сейчас</th><th>Стоимость</th><th>Доход</th><th>Годовых</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<div class="pfo-foot"><button class="pfo-edit" onclick="pfCloseOverlay();pfToggleMenu(\'' + p.id + '\')">⚙ Редактировать состав</button></div>' +
        '</div>';
    }
    function pfoStat(l, v, cls) { return '<div class="pfo-stat"><div class="pfo-stat-l">' + esc(l) + '</div><div class="pfo-stat-v ' + (cls || '') + '">' + v + '</div></div>'; }

    // ====================================================================
    //  ИНТЕГРАЦИЯ
    // ====================================================================
    // Рендер при входе на вкладку (оборачиваем switchTab — паттерн market-модулей)
    if (typeof window.switchTab === 'function') {
        var _prevSwitch = window.switchTab;
        window.switchTab = function (tabId) {
            _prevSwitch.apply(this, arguments);
            if (tabId === 'portfolios') { openMenu = null; renderPortfolios(); }
            else if (dq('pfOverlay')) window.pfCloseOverlay();
        };
    }
    // Когда подгрузилась таблица акций — обновить избранное/потенциал (chain, не ломая дашборд)
    var _prevStkLoaded = window.onStkCompaniesLoaded;
    window.onStkCompaniesLoaded = function () {
        if (typeof _prevStkLoaded === 'function') { try { _prevStkLoaded(); } catch (e) {} }
        if (currentTab === 'portfolios') renderPortfolios();
    };

    // Первичный рендер, если вкладка уже активна на старте
    if (typeof currentTab !== 'undefined' && currentTab === 'portfolios') renderPortfolios();
})();
