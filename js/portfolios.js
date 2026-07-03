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
    // батч-котировки облигаций: один запрос по всему рынку bonds (LAST в % номинала → ×10 = ₽)
    var BONDS_URL = ISS + 'engines/stock/markets/bonds/securities.json' +
        '?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,LAST';
    var QUOTE_TTL = 60000;   // 60с — кэш котировок акций
    // тултип для цен облигаций: котировки MOEX — «чистые» (без НКД), НКД учитываем отдельной колонкой
    var BOND_PRICE_TIP = 'Чистая цена облигации — без НКД (НКД в отдельной колонке)';

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
    function dateFromDaysAgo(days) { var d = new Date(); d.setDate(d.getDate() - Math.round(days || 0));
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
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
    var bondNkdNow = {};     // isin -> текущий НКД ₽ (ACCRUEDINT), null/undefined = ещё не загружен
    var bondNkdPending = {};

    function collectTickers() {
        var s = {}, b = {};
        store.items.forEach(function (p) { (p.holdings || []).forEach(function (h) {
            if (!h.ticker) return; if (h.type === 'bond') b[h.ticker] = 1; else s[h.ticker] = 1; }); });
        return { stocks: Object.keys(s), bonds: Object.keys(b) };
    }

    // fetch с повтором и экспоненциальной задержкой (устойчивость к флапам сети / 5xx MOEX)
    function fetchRetry(url, opts, tries, delay) {
        tries = tries || 3; delay = delay || 500;
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r;
        }).catch(function (e) {
            if (tries <= 1) throw e;
            return new Promise(function (res) { setTimeout(res, delay); })
                .then(function () { return fetchRetry(url, opts, tries - 1, Math.min(delay * 2, 4000)); });
        });
    }

    function fetchStockQuotes() {
        return fetchRetry(SHARES_URL, { cache: 'no-store' }, 3, 500).then(function (r) { return r.json(); }).then(function (j) {
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

    // Батч-запрос цен всех нужных облигаций ОДНИМ обращением к MOEX; для не найденных в
    // батче — откат на поштучный fetchBondData (он же даёт НКД и детали купонов).
    function fetchBondQuotesBatch(isins) {
        return fetchRetry(BONDS_URL, { cache: 'no-store' }, 2, 500).then(function (r) { return r.json(); }).then(function (j) {
            var md = j.marketdata, found = {}; if (!md || !md.data) return found;
            var c = md.columns, si = c.indexOf('SECID'), li = c.indexOf('LAST');
            var want = {}; isins.forEach(function (x) { want[x] = 1; });
            md.data.forEach(function (row) {
                var t = row[si], last = row[li];
                if (t && want[t] && found[t] == null && last != null && last !== '' && +last > 0) found[t] = +last * 10;
            });
            return found;
        });
    }
    function ensureBondQuotes(isins) {
        var need = isins.filter(function (x) { return x && bondQuotes[x] == null && !bondPending[x]; });
        if (!need.length) return;
        if (need.length === 1) { fetchBondQuote(need[0]); return; }   // одна бумага — без батча
        need.forEach(function (x) { bondPending[x] = true; });
        fetchBondQuotesBatch(need).then(function (found) {
            need.forEach(function (x) {
                bondPending[x] = false;
                if (found[x] > 0) bondQuotes[x] = found[x];
                else fetchBondQuote(x);   // не нашли в батче → поштучно (цена + НКД + купоны)
            });
            softRerender();
        }).catch(function () {
            need.forEach(function (x) { bondPending[x] = false; fetchBondQuote(x); });   // батч упал → откат
        });
    }

    // Текущий НКД (ACCRUEDINT) облигаций — для колонки «НКД сейчас» в таблице состава.
    // Цена идёт батчем отдельно (без НКД), поэтому НКД тянем через fetchBondData
    // (она же кеширует в глобальный bondDataCache). Результат — в bondNkdNow.
    function ensureBondNkd(isins) {
        if (typeof fetchBondData !== 'function') return;
        isins.forEach(function (x) {
            if (!x || bondNkdNow[x] != null || bondNkdPending[x]) return;
            try { if (typeof bondDataCache !== 'undefined' && bondDataCache[x] && bondDataCache[x].nkd != null) { bondNkdNow[x] = +bondDataCache[x].nkd || 0; return; } } catch (e) {}
            bondNkdPending[x] = true;
            Promise.resolve(fetchBondData(x))
                .then(function (r) { bondNkdNow[x] = (r && r.nkd != null && r.nkd >= 0) ? +r.nkd : 0; })
                .catch(function () { bondNkdNow[x] = 0; })
                .then(function () { bondNkdPending[x] = false; softRerender(); });
        });
    }
    function curNkdOf(isin) {
        if (bondNkdNow[isin] != null) return bondNkdNow[isin];
        try { if (typeof bondDataCache !== 'undefined' && bondDataCache[isin] && bondDataCache[isin].nkd != null) return +bondDataCache[isin].nkd; } catch (e) {}
        return null;
    }

    // Подтянуть котировки (акции — общий запрос с TTL, облигации — по требованию)
    function ensureQuotes(force) {
        var held = collectTickers();
        ensureBondQuotes(held.bonds);
        ensureBondNkd(held.bonds);
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
        return aggHolding(h).avgPrice || 0;   // фолбэк — средняя цена покупки по лотам
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
    // ---------- лоты (журнал докупок): holding.lots[] ----------
    // Старая модель хранила ОДНУ покупку (buyPrice/qty/nkd/buyDate) на тикер. Теперь — массив
    // лотов; агрегаты (средняя цена, суммарное кол-во, взвеш. НКД, эффективный срок) считаются
    // из лотов. ensureLots мигрирует старые holding'и «на лету» (одиночное поле → один лот).
    function ensureLots(h) {
        if (!h) return [];
        if (!Array.isArray(h.lots) || !h.lots.length) {
            h.lots = [{ id: genId('l'), buyDate: h.buyDate || todayStr(), buyPrice: +h.buyPrice || 0,
                qty: +h.qty || 0, nkd: +h.nkd || 0, priceFromApi: !!h.priceFromApi, nkdFromApi: !!h.nkdFromApi }];
        }
        return h.lots;
    }
    function aggHolding(h) {
        var lots = ensureLots(h);
        var qty = 0, invested = 0, nkdSum = 0, daysW = 0, firstDate = null, anyApi = false;
        lots.forEach(function (l) {
            var q = +l.qty || 0, p = +l.buyPrice || 0, inv = p * q;
            qty += q; invested += inv; nkdSum += (+l.nkd || 0) * q; daysW += daysHeld(l.buyDate) * inv;
            if (l.priceFromApi || l.nkdFromApi) anyApi = true;
            if (l.buyDate && (firstDate == null || l.buyDate < firstDate)) firstDate = l.buyDate;
        });
        var l0 = lots[0] || {};
        var avg = qty > 0 ? invested / qty : (+l0.buyPrice || 0);
        var nkdAvg = qty > 0 ? nkdSum / qty : (+l0.nkd || 0);
        var effDays = invested > 0 ? daysW / invested : daysHeld(l0.buyDate);
        var avgDate = invested > 0 ? dateFromDaysAgo(effDays) : (firstDate || l0.buyDate || '');
        return { lots: lots, qty: qty, avgPrice: avg, invested: invested, nkd: nkdAvg,
            effDays: effDays, avgDate: avgDate, firstDate: firstDate || l0.buyDate || '', count: lots.length, anyApi: anyApi };
    }
    function calcHold(h) {
        var a = aggHolding(h);
        var qty = a.qty, buy = a.avgPrice, cur = curPriceOf(h) || buy;
        var invested = a.invested, value = cur * qty, pnl = value - invested;
        return { qty: qty, buy: buy, cur: cur, invested: invested, value: value, pnl: pnl,
            pnlPct: invested > 0 ? pnl / invested * 100 : 0, days: a.effDays,
            annual: annualize(invested, value, a.effDays), live: isLive(h),
            lots: a.lots, lotCount: a.count, nkd: a.nkd,
            firstDate: a.firstDate, avgDate: a.avgDate, anyApi: a.anyApi };
    }
    function calcPf(p) {
        var hs = (p.holdings || []).map(function (h) { return { h: h, c: calcHold(h) }; });
        // состав всегда отсортирован по величине изменения (сначала те, что больше выросли);
        // позиции без вложений (кол-во 0) — в самом конце. Порядок влияет только на ОТОБРАЖЕНИЕ
        // (мини-таблица, оверлей, таблица ребаланса) — суммы ниже от порядка не зависят.
        hs.sort(function (a, b) {
            var ai = a.c.invested > 0, bi = b.c.invested > 0;
            if (ai !== bi) return ai ? -1 : 1;
            return b.c.pnlPct - a.c.pnlPct;
        });
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

    // ---------- график доходности портфеля (стиль «Ежемесячного дохода») ----------
    // По клику на иконку графика карточка раскрывается на всю ширину и делится надвое:
    // слева — сводка (кольцо/вложено/доход/динамика), справа — кривая доходности от
    // СРЕДНЕЙ даты покупок до сегодня. Данные — историческая цена закрытия MOEX за период
    // (механизм вкладки «Тест»: btBuildPortfolioSeries/btFetchHistorySeries/btAlignReturns),
    // считаются асинхронно и кешируются. Можно наложить кривую индекса IMOEX за тот же период.
    var chartOpen = {};      // pid → график раскрыт (одновременно открыт только один)
    var chartImoex = {};     // pid → наложена кривая индекса IMOEX
    var chartAssets = {};    // pid → раскрыта таблица состава под графиком
    var chartAssetsFull = {}; // pid → таблица состава раскрыта на всю высоту (без скролла 340px)
    var holdsExpand = {};    // pid → раскрыт оверлей «весь состав» (вниз поверх контента)
    var chartCache = {};     // pid → { imoex, points, pfFinal, imFinal, from, err }
    var chartRaw = {};       // pid → { from, series } — сырая серия стоимости (кеш под toggle IMOEX)
    var chartBusy = {};      // pid → идёт загрузка (защита от двойного запроса)
    function ruShortDate(ds) { var p = String(ds).split('-'); return p.length === 3 ? (p[2] + '.' + p[1]) : ds; }
    // сглаженный путь (Catmull-Rom → кубические безье) — как в графике «Ежемесячного дохода»
    function smoothD(pts) {
        if (!pts.length) return '';
        if (pts.length < 2) return 'M' + pts[0].x.toFixed(2) + ',' + pts[0].y.toFixed(2);
        var d = 'M' + pts[0].x.toFixed(2) + ',' + pts[0].y.toFixed(2);
        for (var i = 0; i < pts.length - 1; i++) {
            var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
            var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
            var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
            d += ' C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2) + ' ' + p2.x.toFixed(2) + ',' + p2.y.toFixed(2);
        }
        return d;
    }
    // «красивые» деления для шкалы процентов слева от графика (~count интервалов)
    function niceTicks(min, max, count) {
        var span = (max - min) || 1, raw = span / Math.max(1, count);
        var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
        var norm = raw / mag, step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
        step *= mag;
        var ticks = [], start = Math.ceil(min / step) * step;
        for (var v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
        return ticks;
    }
    function dateToIso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    // средняя (взвешенная по вложенному) дата покупок портфеля — старт периода графика
    function pfAvgBuyDate(p) {
        var accum = 0, wsum = 0, earliest = null;
        (p.holdings || []).forEach(function (h) {
            ensureLots(h).forEach(function (l) {
                var t = Date.parse(l.buyDate || ''); if (!isFinite(t)) return;
                if (earliest == null || t < earliest) earliest = t;
                var inv = (+l.buyPrice || 0) * (+l.qty || 0);
                if (inv > 0) { accum += t * inv; wsum += inv; }
            });
        });
        var ms = wsum > 0 ? accum / wsum : earliest;
        if (ms == null) ms = Date.now() - 365 * 864e5;
        return new Date(ms);
    }
    // Дата ПЕРВОЙ покупки в портфеле (самый ранний лот любого актива) — с неё строится график
    // доходности: раньше стартовали со взвешенной «средней даты покупок», из-за чего кривая
    // начиналась в середине периода владения и выглядела странно. Теперь старт = первая сделка.
    function pfFirstBuyDate(p) {
        var earliest = null;
        (p.holdings || []).forEach(function (h) {
            ensureLots(h).forEach(function (l) {
                var t = Date.parse(l.buyDate || ''); if (!isFinite(t)) return;
                if (earliest == null || t < earliest) earliest = t;
            });
        });
        if (earliest == null) earliest = Date.now() - 365 * 864e5;
        return new Date(earliest);
    }
    // состав портфеля для серии стоимости (только позиции с количеством); lots — фактические
    // докупки (дата+кол-во), чтобы серия отражала кол-во НА КАЖДУЮ дату, а не текущее кол-во
    // задним числом (см. комментарий в btBuildPortfolioSeries). Несколько holding'ов с одним
    // тикером (на практике не бывает, но на всякий случай) — сливаем в одну запись.
    function pfChartAssets(p) {
        var bonds = {}, stocks = {};
        (p.holdings || []).forEach(function (h) {
            var a = aggHolding(h); if (!(a.qty > 0) || !h.ticker) return;
            var bucket = h.type === 'bond' ? bonds : stocks;
            if (!bucket[h.ticker]) bucket[h.ticker] = { t: h.ticker, qty: 0, lots: [] };
            bucket[h.ticker].qty += a.qty;
            a.lots.forEach(function (l) { var q = +l.qty || 0; if (q > 0 && l.buyDate) bucket[h.ticker].lots.push({ buyDate: l.buyDate, qty: q, buyPrice: +l.buyPrice || 0 }); });
        });
        return { bonds: Object.keys(bonds).map(function (k) { return bonds[k]; }), stocks: Object.keys(stocks).map(function (k) { return stocks[k]; }) };
    }
    // серия только портфеля (без индекса): доходность = (стоимость − вложено на эту дату) / вложено
    // на эту дату (q.inv считает btBuildPortfolioSeries — та же формула, что и calcHold/calcPf,
    // просто на каждый день, а не только на сегодня). Простое отношение c[t]/c[0] тут не годится:
    // докупка увеличивает c[t] возросшим кол-вом, но это не доходность, а довнесение капитала.
    function pfOnlyPoints(pfSeries) {
        var points = pfSeries.map(function (q) { return { d: q.d, pf: q.inv > 0 ? (q.c / q.inv - 1) * 100 : 0 }; });
        return { points: points, pfFinal: points[points.length - 1].pf, imFinal: null };
    }
    // асинхронная загрузка серии доходности (история MOEX) + перерисовка пейна графика
    function loadPfChart(pid) {
        var p = findPf(pid); if (!p) return;
        var wantImoex = !!chartImoex[pid];
        var cached = chartCache[pid];
        if (cached && cached.imoex === wantImoex && !cached.err) { repaintCharts(pid); return; }
        if (chartBusy[pid]) return;
        if (typeof btBuildPortfolioSeries !== 'function') { chartCache[pid] = { imoex: wantImoex, err: 'NO_BT' }; repaintCharts(pid); return; }
        var assets = pfChartAssets(p);
        if (!assets.bonds.length && !assets.stocks.length) { chartCache[pid] = { imoex: wantImoex, err: 'NO_ASSETS' }; repaintCharts(pid); return; }
        var fromStr = dateToIso(pfFirstBuyDate(p)), tillStr = todayStr();
        chartBusy[pid] = true; repaintCharts(pid);   // показываем индикатор загрузки
        var raw = chartRaw[pid];
        var pfPromise = (raw && raw.from === fromStr && raw.series)
            ? Promise.resolve(raw.series)
            : btBuildPortfolioSeries(assets, fromStr, tillStr).then(function (s) { chartRaw[pid] = { from: fromStr, series: s }; return s; });
        pfPromise.then(function (pfSeries) {
            if (!pfSeries || pfSeries.length < 2) throw new Error('NO_PF');
            if (wantImoex && typeof btFetchHistorySeries === 'function' && typeof btAlignReturns === 'function') {
                return btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/IMOEX.json', fromStr, tillStr).then(function (im) {
                    var al = im && im.length ? btAlignReturns(pfSeries, im) : null;
                    return (al && al.points.length >= 2) ? { points: al.points, pfFinal: al.pfFinal, imFinal: al.imFinal } : pfOnlyPoints(pfSeries);
                });
            }
            return pfOnlyPoints(pfSeries);
        }).then(function (res) {
            res.imoex = wantImoex; res.from = fromStr; chartCache[pid] = res;
        }, function (e) {
            chartCache[pid] = { imoex: wantImoex, from: fromStr, err: (e && e.message) || 'ERR' };
        }).then(function () {
            chartBusy[pid] = false; repaintCharts(pid);
        });
    }
    // после полного ре-рендера пейн графика сбрасывается в «загрузку» — дорисовываем
    // из кеша (или дозапускаем загрузку) для всех раскрытых графиков
    function repaintOpenCharts() {
        Object.keys(chartOpen).forEach(function (pid) { if (chartOpen[pid] && dq('pfcvChart-' + pid)) loadPfChart(pid); });
    }
    function pfChartLoadingHtml() {
        return '<div class="pfcv-load"><span class="pfcv-spin"></span><span>Загружаем котировки Мосбиржи…</span></div>';
    }
    // Пустое/ошибочное состояние графика — оформлено как ОСОЗНАННЫЙ empty-state (иконка в
    // тонированном кружке + заголовок + пояснение), как .pf-empty/.pff-empty/.pfm-none, а не
    // одинокая серая строка текста (та выглядела как баг/ошибка загрузки, а не «так и задумано»).
    // NO_ASSETS/NO_PF/NO_BT — нормальные, ожидаемые состояния (тон = акцент портфеля);
    // ERR (не смогли получить данные) — единственный настоящий сбой (тон предупреждения).
    var CHART_EMPTY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>';
    var CHART_CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';
    var CHART_SPROUT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V12"/><path d="M12 12C12 8.5 9.5 6 6 6c0 3.5 2.5 6 6 6z"/><path d="M12 9c0-2.76 1.79-5 4.5-5C16.5 6.76 14.71 9 12 9z"/><path d="M4 21h16"/></svg>';
    var CHART_WARN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    function pfChartMsgHtml(code) {
        var conf = code === 'NO_ASSETS' ? { icon: CHART_EMPTY_SVG, t: 'Пока нечего показывать', s: 'Добавьте позиции с количеством — и здесь появится кривая доходности.' }
            : code === 'NO_PF' ? { icon: CHART_SPROUT_SVG, t: 'График скоро появится', s: 'С первой покупки прошло мало дней — как накопится больше котировок, здесь построится кривая доходности.' }
            : code === 'NO_BT' ? { icon: CHART_CLOCK_SVG, t: 'Модуль ещё грузится', s: 'Данные исторических цен подгружаются — откройте график чуть позже.' }
            : { icon: CHART_WARN_SVG, t: 'Не удалось загрузить', s: 'Не получили данные Мосбиржи. Попробуйте обновить позже.', warn: true };
        return '<div class="pfcv-msg' + (conf.warn ? ' warn' : '') + '"><span class="pfcv-msg-art">' + conf.icon + '</span>' +
            '<span class="pfcv-msg-t">' + conf.t + '</span><span class="pfcv-msg-s">' + conf.s + '</span></div>';
    }
    // рисуем серию в пейн графика (mi5-стиль): площадь + плавная линия + точки/тултипы
    // рисуем серию в ПЕРЕДАННЫЙ контейнер (uid — суффикс id градиента: два графика одного
    // портфеля — в карточке и во встроенной сводке одиночного портфеля — не делят <linearGradient>)
    function drawPfChart(pid, wrap, dynEl, legEl, uid, maxPts) {
        if (!wrap) return;
        var data = chartCache[pid];
        if (chartBusy[pid] || !data) { wrap.innerHTML = pfChartLoadingHtml();
            if (dynEl) { dynEl.textContent = '—'; dynEl.className = 'pfcv-stat-v'; }
            if (legEl) legEl.innerHTML = ''; return; }
        if (data.err) {
            wrap.innerHTML = pfChartMsgHtml(data.err);
            if (dynEl) { dynEl.textContent = '—'; dynEl.className = 'pfcv-stat-v'; }
            if (legEl) legEl.innerHTML = '';
            return;
        }
        // прорежаем серию до читаемого числа точек (как в графике «Ежемесячного дохода»):
        // линия остаётся плавной, а точки-маркеры не сливаются. Итоговый % берётся из
        // сырых данных (data.pfFinal), поэтому от прореживания не страдает.
        var raw = data.points, pts = raw, MAXP = maxPts || 40;
        if (raw.length > MAXP) {
            var stepP = (raw.length - 1) / (MAXP - 1);
            pts = [];
            for (var s = 0; s < MAXP; s++) pts.push(raw[Math.round(s * stepP)]);
            pts[pts.length - 1] = raw[raw.length - 1];
        }
        var N = pts.length;
        var showIm = !!data.imoex && pts[0] && pts[0].im != null;
        // РАНЬШЕ подпись графика форсилась в живой pnlPct отдельным коэффициентом pfK, который
        // растягивал (или, при большом расхождении, вовсе не трогал) ВСЮ кривую — из-за этого
        // форма могла исказиться или даже перевернуться знаком. Теперь кривая и подпись по
        // построению — одна и та же формула (стоимость − вложено)/вложено, поэтому по всей длине
        // они уже совпадают. Расходится может только САМАЯ последняя точка: она в q.pf — это
        // «на дату последнего закрытия MOEX», а живой pnlPct — по текущей котировке (для
        // облигаций особенно, у них дневной close может ощутимо отставать от реальной сделки).
        // Поэтому просто подменяем pf только у последней точки на живой процент — это честно
        // (последний отрезок кривой отражает реальное движение с последнего закрытия) и не трогает
        // форму остальной кривой.
        var pfEntity = findPf(pid), livePct = pfEntity ? calcPf(pfEntity).pnlPct : null;
        if (N && livePct != null && isFinite(livePct) && pts[N - 1].pf !== livePct) {
            var lastPt = pts[N - 1];
            pts = pts.slice(0, N - 1).concat([{ d: lastPt.d, pf: livePct, im: lastPt.im }]);
        }
        // старт кривой — день первой покупки, доходность в этот момент по определению 0% (ещё
        // ничего не изменилось в цене). q.pf там обычно чуть отличается от нуля — это не
        // реальное движение, а разница между ценой закрытия MOEX в тот день и фактической ценой
        // сделки. Поджимаем первую точку к 0, как и последнюю — к живому pnlPct (см. выше).
        if (N > 1 && pts[0].pf !== 0) {
            var firstPt = pts[0];
            pts = [{ d: firstPt.d, pf: 0, im: firstPt.im }].concat(pts.slice(1));
        }
        var pfv = function (q) { return q.pf; };
        var allV = []; pts.forEach(function (q) { allV.push(pfv(q)); if (showIm) allV.push(q.im); });
        var minV = Math.min.apply(null, allV), maxV = Math.max.apply(null, allV);
        if (minV === maxV) { minV -= 1; maxV += 1; }
        if (minV > 0) minV = 0; if (maxV < 0) maxV = 0;   // 0% всегда в кадре — опорная линия
        var span = (maxV - minV) || 1, padX = 4, topY = 14, botY = 84;
        var xAt = function (i) { return padX + (N === 1 ? 0 : (i / (N - 1))) * (100 - 2 * padX); };
        var yAt = function (v) { return botY - ((v - minV) / span) * (botY - topY); };
        var zeroY = yAt(0);
        var pPts = pts.map(function (q, i) { var vv = pfv(q); return { x: xAt(i), y: yAt(vv), v: vv, d: q.d }; });
        var line = smoothD(pPts);
        var area = line + ' L' + pPts[N - 1].x.toFixed(2) + ',' + botY + ' L' + pPts[0].x.toFixed(2) + ',' + botY + ' Z';
        var imLine = '';
        if (showIm) {
            var iPts = pts.map(function (q, i) { return { x: xAt(i), y: yAt(q.im) }; });
            imLine = '<path class="pfcv-imline" d="' + smoothD(iPts) + '" fill="none" vector-effect="non-scaling-stroke"/>';
        }
        var svg = '<svg class="pfcv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
            '<defs><linearGradient id="pfcvGrad-' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="var(--pf-accent)" stop-opacity="0.34"/>' +
            '<stop offset="1" stop-color="var(--pf-accent)" stop-opacity="0"/></linearGradient></defs>' +
            '<line class="pfcv-zero" x1="0" y1="' + zeroY.toFixed(2) + '" x2="100" y2="' + zeroY.toFixed(2) + '"/>' +
            '<path class="pfcv-area" d="' + area + '" fill="url(#pfcvGrad-' + uid + ')"/>' + imLine +
            '<path class="pfcv-line" pathLength="1" d="' + line + '" fill="none" stroke="var(--pf-accent)" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        var lblEvery = Math.max(1, Math.ceil(N / 6));
        var overlay = pPts.map(function (q, i) {
            var flip = q.y < 40 ? ' flip' : '', showLbl = (i === 0 || i === N - 1 || i % lblEvery === 0), pos = q.v >= 0;
            return '<div class="pfcv-lp' + flip + '" style="left:' + q.x.toFixed(2) + '%;--y:' + q.y.toFixed(2) + '%">' +
                '<span class="pfcv-dot"></span>' +
                '<div class="pfcv-tip"><b class="' + (pos ? 'pos' : 'neg') + '">' + (pos ? '+' : '') + q.v.toFixed(1) + '%</b><span>' + ruDate(q.d) + '</span></div>' +
                (showLbl ? '<span class="pfcv-x">' + ruShortDate(q.d) + '</span>' : '') +
            '</div>';
        }).join('');
        // шкала процентов слева: «красивые» деления между minV и maxV (выравнены по кривой)
        var yaxis = niceTicks(minV, maxV, 4).map(function (v) {
            var lbl = (Math.round(v) === v) ? String(v) : v.toFixed(1);
            return '<span class="pfcv-ytick' + (v === 0 ? ' zero' : '') + '" style="top:' + yAt(v).toFixed(2) + '%">' + lbl + '%</span>';
        }).join('');
        wrap.innerHTML = '<div class="pfcv-yaxis">' + yaxis + '</div><div class="pfcv-plot">' + svg + overlay + '</div>';
        // анимация прорисовки линии (и индекса) — линия «рисуется» слева направо
        var path = wrap.querySelector('.pfcv-line');
        if (path) { try { var len = path.getTotalLength(); path.style.strokeDasharray = len; path.style.strokeDashoffset = len; path.getBoundingClientRect(); path.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)'; path.style.strokeDashoffset = '0'; } catch (e) {} }
        var ar = wrap.querySelector('.pfcv-area');
        if (ar) { ar.style.opacity = '0'; ar.getBoundingClientRect(); ar.style.transition = 'opacity .9s ease .2s'; ar.style.opacity = '1'; }
        // IMOEX — просто проявляется (без «рисования» слева направо, как у портфеля): её
        // dash-паттерн задан в CSS (см. .pfcv-imline) и не должен перебиваться инлайновым
        // strokeDasharray анимации — иначе пунктир на миг схлопывается в сплошную линию.
        var imp = wrap.querySelector('.pfcv-imline');
        if (imp) { imp.style.opacity = '0'; imp.getBoundingClientRect(); imp.style.transition = 'opacity .9s ease .3s'; imp.style.opacity = ''; }
        // подпись «Портфель X%» = то же значение, которым теперь заканчивается кривая (см. выше:
        // либо data.pfFinal, либо подменённый на живой pnlPct последний пункт) — расходиться им
        // неоткуда.
        var dispFinal = pts.length ? pts[pts.length - 1].pf : data.pfFinal;
        if (dynEl) {
            var pos2 = dispFinal >= 0;
            dynEl.textContent = (pos2 ? '+' : '') + dispFinal.toFixed(1) + '%';
            dynEl.className = 'pfcv-stat-v ' + (pos2 ? 'pos' : 'neg');
        }
        if (legEl) {
            var pf = dispFinal;
            // мини-график в карточке (dynEl отсутствует): цифра «Портфель X%» уже показана рядом,
            // в шапке карточки (pfc-hero-inc) — повторять её тут не нужно, легенда несёт только
            // IMOEX (бенчмарк для сравнения), компактно поверх графика.
            var lgh = dynEl ? '<span class="pfcv-lgi"><i style="background:var(--pf-accent)"></i>Портфель <b class="' + (pf >= 0 ? 'pos' : 'neg') + '">' + (pf >= 0 ? '+' : '') + pf.toFixed(1) + '%</b></span>' : '';
            // в мини-легенде слово «IMOEX» опускаем — рядом уже есть тумблер IMOEX; показываем только %
            if (showIm && data.imFinal != null) { var im = data.imFinal, imLbl = dynEl ? 'IMOEX ' : ''; lgh += '<span class="pfcv-lgi"><i class="pfcv-imdot"></i>' + imLbl + '<b class="' + (im >= 0 ? 'pos' : 'neg') + '">' + (im >= 0 ? '+' : '') + im.toFixed(1) + '%</b></span>'; }
            legEl.innerHTML = lgh;
        }
    }
    function paintPfChart(pid) { drawPfChart(pid, dq('pfcvChart-' + pid), dq('pfcvDyn-' + pid), dq('pfcvLeg-' + pid), pid); }
    function repaintCharts(pid) { paintPfChart(pid); paintPfChartMini(pid); }
    function pfcvStat(l, v, cls) { return '<div class="pfcv-stat"><span class="pfcv-stat-l">' + esc(l) + '</span><span class="pfcv-stat-v ' + (cls || '') + '">' + v + '</span></div>'; }
    // пейн графика в карточке: слева — сводка, справа — кривая доходности (выезжает справа)
    function pfChartViewHtml(p, c, idx) {
        var pid = p.id, pnlCls = c.pnl >= 0 ? 'pos' : 'neg', imOn = !!chartImoex[pid], asOn = !!chartAssets[pid];
        var fromTxt = ruDate(dateToIso(pfFirstBuyDate(p)));
        // в центре кольца — номер портфеля (как в мини-карточке), не капитал
        var ringNum = '<span class="pfc-ringnum">' + (((idx || 0) + 1)) + '</span>';
        return '<div class="pfc-chartview">' +
            '<div class="pfcv-left">' +
                '<div class="pfcv-ring">' +
                    donutHtml(c.bondPct, 104, ringNum) +
                    (function () { var bp = Math.round(clamp(c.bondPct, 0, 100)); return '<div class="pfcv-ringleg">' +
                        '<span class="pfc-lg"><i class="stock"></i>Акции<b>' + (100 - bp) + '%</b></span>' +
                        '<span class="pfc-lg"><i class="bond"></i>Облигации<b>' + bp + '%</b></span>' +
                    '</div>'; })() +
                '</div>' +
                '<div class="pfcv-stats">' +
                    pfcvStat('Вложено', fmtRub(c.invested), '') +
                    pfcvStat('Доход', fmtRub(c.pnl), pnlCls) +
                    '<div class="pfcv-stat pfcv-stat--dyn"><span class="pfcv-stat-l">Динамика за период</span><span class="pfcv-stat-v" id="pfcvDyn-' + pid + '">—</span></div>' +
                '</div>' +
                '<button class="pfcv-assetbtn' + (asOn ? ' on' : '') + '" data-pid="' + pid + '" onclick="pfToggleChartAssets(\'' + pid + '\')" title="Показать состав портфеля">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' +
                    '<span class="pfcv-assetbtn-t">' + (asOn ? 'Скрыть активы' : 'Показать активы') + '</span>' +
                    '<svg class="pfcv-assetbtn-ch' + (asOn ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="pfcv-right">' +
                '<div class="pfcv-rhead">' +
                    '<div class="pfcv-rtt"><span class="pfcv-rk">Доходность портфеля</span><span class="pfcv-rsub">с ' + fromTxt + ' · первая покупка</span></div>' +
                    '<button class="pfcv-imbtn' + (imOn ? ' on' : '') + '" onclick="pfToggleChartImoex(\'' + pid + '\')" title="Наложить кривую индекса Мосбиржи">' +
                        '<span class="pfcv-imdot"></span>IMOEX</button>' +
                    '<button class="pfcv-close" onclick="pfToggleChart(\'' + pid + '\')" aria-label="Свернуть график" title="Свернуть график"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
                '</div>' +
                '<div class="pfcv-leg" id="pfcvLeg-' + pid + '"></div>' +
                '<div class="pfcv-chart" id="pfcvChart-' + pid + '">' + pfChartLoadingHtml() + '</div>' +
            '</div>' +
        '</div>';
    }
    // раскрывающаяся таблица состава под графиком (та же, что в карточке ребалансировки)
    // при многих активах под таблицей — кнопка «развернуть всю таблицу» (снимает скролл 340px)
    function pfChartAssetsHtml(p, c) {
        var full = !!chartAssetsFull[p.id];
        var many = c.hs.length > 6;   // таблица упирается в скролл → предлагаем развернуть
        var more = many ? '<button class="pfcv-assets-more' + (full ? ' on' : '') + '" data-pid="' + p.id + '" onclick="pfToggleAssetsFull(\'' + p.id + '\')">' +
            '<span class="pfcv-assets-more-t">' + (full ? 'Свернуть таблицу' : 'Показать все активы · ' + c.hs.length) + '</span>' +
            '<svg class="pfcv-assets-more-ch' + (full ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' : '';
        return '<div class="pfcv-assets' + (full ? ' full' : '') + '"><div class="pfcv-assets-in">' + pfHoldsTableHtml(c) + more + '</div></div>';
    }
    // строки состава для таблицы большой карточки (переиспользуются разворотом и графиком)
    function pfHoldsRowsHtml(c) {
        if (!c.hs.length) return '<tr><td colspan="13" class="pfo-empty">Состав портфеля пуст</td></tr>';
        return c.hs.map(function (x, i) {
            var h = x.h, cc = x.c, isB = h.type === 'bond';
            var ptip = isB ? ' title="' + attr(BOND_PRICE_TIP) + '"' : '';
            var multi = cc.lotCount > 1;
            var lotChip = multi ? ' <i class="pfo-lots" title="' + cc.lotCount + ' лота · средняя цена">×' + cc.lotCount + '</i>' : '';
            var buyTip = multi ? ' title="Средняя цена по ' + cc.lotCount + ' лотам"' : ptip;
            var nkdNow = isB ? curNkdOf(h.ticker) : null;   // текущий НКД (ACCRUEDINT)
            // «Изменение» = доход в % (cc.pnlPct) вместо годовых; для позиций без вложений (кол-во 0) — прочерк
            var hasInv = cc.invested > 0;
            return '<tr>' +
                '<td class="pfo-c-rk">#' + (i + 1) + '</td>' +
                '<td class="pfo-tk pfo-c-as"><span class="pfo-tkline"><b>' + esc(h.ticker) + '</b></span><span class="pfo-nm">' + esc(h.name || '') + '</span></td>' +
                '<td class="pfo-c-tp"><span class="pfo-tag ' + h.type + '">' + (isB ? 'обл' : 'акц') + '</span></td>' +
                '<td>' + ruDate(cc.firstDate) + lotChip + '</td>' +
                '<td' + buyTip + '>' + fmtPrice(cc.buy) + '</td>' +
                '<td class="pfo-nkdcol' + (isB ? '' : ' muted') + '"' + (isB ? ' title="НКД на дату покупки (взвеш. по лотам)"' : '') + '>' + (isB ? fmtPrice(cc.nkd || 0) : '—') + '</td>' +
                '<td>' + (cc.qty || 0) + '</td>' +
                '<td>' + fmtRub(cc.invested) + '</td>' +
                '<td class="' + (cc.live ? 'pfo-live' : '') + '"' + ptip + '>' + fmtPrice(cc.cur) + '</td>' +
                '<td class="pfo-nkdcol' + (isB ? '' : ' muted') + '"' + (isB ? ' title="Текущий накопленный купонный доход — НКД сейчас (MOEX)"' : '') + '>' + (isB ? (nkdNow != null ? fmtPrice(nkdNow) : '—') : '—') + '</td>' +
                '<td>' + fmtRub(cc.value) + '</td>' +
                '<td class="' + (cc.pnl >= 0 ? 'pos' : 'neg') + '">' + fmtRub(cc.pnl) + '</td>' +
                '<td class="' + (!hasInv ? '' : (cc.pnlPct >= 0 ? 'pos' : 'neg')) + '">' + (!hasInv ? '—' : fmtPct(cc.pnlPct)) + '</td>' +
            '</tr>';
        }).join('');
    }
    function pfHoldsTableHtml(c) {
        return '<div class="pfo-tablewrap"><table class="pfo-table"><thead><tr>' +
            '<th class="pfo-c-rk">#</th><th class="pfo-c-as">Актив</th><th class="pfo-c-tp">Тип</th><th>Дата покупки</th><th>Цена покупки</th><th>НКД покупки</th><th>Кол-во</th><th>Вложено</th><th>Цена сейчас</th><th>НКД сейчас</th><th>Стоимость</th><th>Доход</th><th>Изменение</th>' +
            '</tr></thead><tbody>' + pfHoldsRowsHtml(c) + '</tbody></table></div>';
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
                echelon: x.echelon || 0, buyDate: todayStr(), buyPrice: Math.round(price * 100) / 100, qty: qty,
                nkd: 0, priceFromApi: false, nkdFromApi: false, potAtBuy: type === 'stock' ? potentialOf(x.ticker) : null };
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
                buyDate: todayStr(), buyPrice: price, qty: 0, nkd: 0, priceFromApi: false, nkdFromApi: false, potAtBuy: potentialOf(tk) };
        }).filter(function (h) { return h.ticker; });
        return holds.length ? holds : null;
    }
    // Облигации из калькулятора «Ежемесячный доход» (экспорт window.pfMonthlyBonds из data.js).
    // Кол-во берём из живой карты калькулятора bondQtyMap (глобальная в core.js): если в
    // калькуляторе уже введены/рассчитаны количества — переносим их в портфель.
    function getMonthlyComposition() {
        var src = window.pfMonthlyBonds;
        if (!src || !src.length) return null;
        var qm = {}; try { if (typeof bondQtyMap !== 'undefined' && bondQtyMap) qm = bondQtyMap; } catch (e) {}
        var holds = src.map(function (b) {
            var price = toNum(b.p); if (!isFinite(price) || price <= 0) price = 0;
            var q = Math.max(0, Math.round(+qm[b.t] || 0));
            return { id: genId('h'), ticker: b.t, name: b.n || b.t, type: 'bond',
                buyDate: todayStr(), buyPrice: Math.round(price * 100) / 100, qty: q,
                nkd: toNum(b.nkd) > 0 ? Math.round(toNum(b.nkd) * 100) / 100 : 0,
                priceFromApi: false, nkdFromApi: toNum(b.nkd) > 0 };
        }).filter(function (h) { return h.ticker; });
        return holds.length ? holds : null;
    }
    function compositionFrom(source, sub) {
        if (source === 'fav') return getFavComposition();
        if (source === 'monthly') return getMonthlyComposition();
        return getCalcComposition(sub || 'all');
    }
    function importName(source) {
        // Имя нового портфеля при импорте — всегда «Новый Портфель» (не дублируем имя
        // источника, иначе повторный импорт из того же места плодит одинаковые названия).
        return 'Новый Портфель';
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
    // НКД облигации на дату (колонка ACCINT в истории MOEX). cb(>=0) при успехе (0 — валидно,
    // НКД может обнулиться сразу после купона), cb(null) при ошибке/отсутствии данных.
    function lookupHistNkd(ticker, dateStr, cb) {
        if (typeof window.btGetBondNkdSafe === 'function') {
            Promise.resolve(window.btGetBondNkdSafe(ticker, dateStr))
                .then(function (v) { cb(v != null && v >= 0 ? v : null); })
                .catch(function () { cb(null); });
            return;
        }
        cb(null);
    }
    // Детали облигации (купон, частота, дата погашения) из bondDetailsMap — его попутно
    // наполняет fetchBondData. Нужны карточке ребалансировки и календарю выплат.
    function bondDetail(isin) {
        try {
            if (typeof bondDetailsMap === 'undefined' || !bondDetailsMap) return null;
            if (bondDetailsMap[isin]) return bondDetailsMap[isin];
            // fetchBondData сохраняет детали под ПОЛНЫМ ISIN (SU26238RMFS4), а в портфеле тикер
            // короткий (SU26238) — ищем ключ по префиксу, иначе «к погашению»/купоны не находятся.
            if (isin) { var ks = Object.keys(bondDetailsMap); for (var i = 0; i < ks.length; i++) if (ks[i].indexOf(isin) === 0) return bondDetailsMap[ks[i]]; }
        } catch (e) {}
        return null;
    }
    function parseBondDate(s) {
        if (!s || s === '—') return null;
        var d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d;
    }

    // ====================================================================
    //  РЕНДЕР
    // ====================================================================
    var openMenu = null;     // id портфеля с раскрытыми настройками
    var openLots = {};       // hid -> true: раскрыт ли журнал лотов актива в редакторе
    var openRows = {};       // hid -> true: раскрыты ли субданные актива в мини-таблице карточки
    var menuTall = false;    // раскрыта ли карточка настроек «вниз» (показать все тикеры без скролла)
    var menuJustOpened = false;
    var clockTimer = null;
    var rendering = false;   // защита от повторного входа (см. ниже)
    var loadStatus = {};     // hid -> { state:'loading'|'ok'|'err'|'nodate', date } для кнопки «Загрузить на дату»
    // Новости избранного: кэшируем готовый HTML по тикеру и грузим с ограничением
    // параллелизма (Apps Script медленный и на одном хосте с гугл-таблицами —
    // 12 параллельных запросов раньше «подвешивали» загрузку данных).
    var newsHtmlCache = {};  // tk -> { html, link }
    var newsStarted = {};    // tk -> true (запрос уже поставлен в очередь)
    var newsQueue = [], newsActive = 0;
    var softTimer = null;    // дебаунс мягкого ре-рендера (котировки приходят пачкой)

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
            // Раскладка: «Избранное» ВСЕГДА в правой колонке (.pf-topgrid-fav), независимо от
            // числа портфелей — слева (.pf-topgrid-left) сводка+карточки, справа избранное.
            // На узком экране (<1600px) колонка складывается в 1, избранное уходит вниз (см.
            // @media в CSS) — порядок в DOM (left затем fav) уже даёт нужный порядок на мобиле.
            //  • 0 портфелей → слева просто пустое состояние;
            //  • 1 портфель → БЕЗ сводки: карточка портфеля первой ячейкой, «Календарь выплат»
            //    рядом (той же высоты) занимает вторую ячейку сетки;
            //  • 2+ → сводка «Суммарный капитал» компактной карточкой в правой колонке
            //    ПОД «Избранным» (см. summaryCardHtml);
            //  • нечётное число портфелей (1 или 3) → календарь в свободной ячейке сетки,
            //    чётное — отдельной полноширинной карточкой под сеткой.
            var n = store.items.length;
            var favStr = favHtml();
            var rates = ratesHtml();
            var oddCal = n % 2 === 1;
            var payCal = paymentCalendarHtml(oddCal);
            var body;
            var gridPart = gridHtml(oddCal ? payCal : '');
            // Календарь и ставки — ВНУТРИ левой колонки (не отдельным блоком во всю ширину
            // страницы), чтобы их ширина совпадала с шириной карточек портфеля и они не
            // «наезжали» визуально на колонку «Избранное» сбоку.
            var left = gridPart + (oddCal ? '' : payCal) + rates;
            // Сводка по всем портфелям (2+) — компактной карточкой ПОД «Избранным» в правой
            // колонке (раньше — полноширинной sticky-полосой над сеткой, она мешала).
            body = '<div class="pf-topgrid">' +
                    '<div class="pf-topgrid-left">' + left + '</div>' +
                    '<div class="pf-topgrid-fav">' + favStr + (n >= 2 ? summaryCardHtml() : '') + '</div>' +
                '</div>';
            host.innerHTML =
                liveBarHtml() +
                headHtml() +
                body;
            tickLive();
            renderFavNews();
            ensureClock();
            var payBody = document.querySelector('.pf-paycal--cell .pfpc-body');
            if (payBody) window.pfPayCalScroll(payBody);   // начальное состояние затухания списка выплат
            ensureDefaultImoexFlags(); // флаг IMOEX по умолчанию — ДО первого loadPfChart (см. комментарий выше)
            repaintOpenCharts();   // если какой-то график раскрыт — дорисовываем после ре-рендера
            repaintMiniCharts();   // мини-график «портфель vs IMOEX» в каждой карточке
            if (openMenu) {
                var m = dq('pfMenu-' + openMenu); if (m) m.scrollTop = 0;
                // пустой портфель → сразу ставим фокус на ввод тикера (интуитивнее)
                if (menuJustOpened) {
                    menuJustOpened = false;
                    var op = findPf(openMenu);
                    if (op && !((op.holdings || []).length)) { var inp = dq('pfNewTk-' + openMenu); if (inp) { try { inp.focus(); } catch (e) {} } }
                }
            }
        } finally {
            rendering = false;
        }
    }
    window.renderPortfolios = renderPortfolios;

    // Котировки (акции пачкой, облигации по одной) приходят асинхронно, и каждая
    // приходит В РАЗНОЕ время (несколько облигаций = несколько отдельных fetch).
    // Раньше первый ответ планировал ре-рендер через 120мс и на этом дебаунс
    // «сгорал» — следующий ответ (даже через 150мс) снова полностью пересобирал
    // host.innerHTML → серия быстрых полных ре-рендеров подряд визуально мигает.
    // Теперь это trailing-дебаунс: каждый новый ответ ПЕРЕНОСИТ таймер вперёд, и
    // рендер срабатывает один раз — после того как все ответы за пачку утихли.
    function softRerender() {
        if (softTimer) clearTimeout(softTimer);
        softTimer = setTimeout(function () {
            softTimer = null;
            rebalRepaint();   // открытая карточка ребалансировки: живые цены/НКД пришли — обновить
            if (currentTab !== 'portfolios' || !dq('pfWrap')) return;
            if (openMenu) return;   // не сбиваем открытый редактор
            for (var ck in chartOpen) { if (chartOpen[ck]) return; }   // не перерисовываем раскрытый график (сбилась бы анимация)
            if (document.querySelector('.pf-impmenu.open')) return;   // не сбиваем открытое меню «Импорт»
            renderPortfolios();
        }, 150);
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
    // «Подтянуть на дату» — календарь со стрелкой загрузки (в полях цены/НКД)
    var FETCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/><polyline points="9.5 14 12 16.5 14.5 14"/><line x1="12" y1="12" x2="12" y2="16.5"/></svg>';
    var INFO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    // бэкап: «щит» (кнопка), «выгрузить в файл» (стрелка вниз в лоток), «загрузить из файла» (стрелка вверх)
    var SHIELD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    var UPLOAD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    // иконки источников в меню «Импорт» — калькулятор / звезда (избранное) / кошелёк (доход)
    var IMPCALC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="8" y2="12.01"/><line x1="12" y1="12" x2="12" y2="12.01"/><line x1="16" y1="12" x2="16" y2="12.01"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="12" y1="16" x2="12" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/></svg>';
    var IMPFAV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2.8 14.9 9 21.7 9.9 16.8 14.5 18 21.2 12 18 6 21.2 7.2 14.5 2.3 9.9 9.1 9"/></svg>';
    var IMPMON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><circle cx="16.5" cy="15" r="1.4" fill="currentColor" stroke="none"/></svg>';

    // ---- меню «Импорт» (расчёт / избранное / ежемесячный доход) ----
    // Каждый источник — карточка с иконкой, названием и подписью: если данные есть — сколько
    // позиций перенесётся, если нет — почему пункт недоступен (понятнее, чем просто «серая кнопка»)
    function impMenuHtml(key, pid) {
        var up = key !== 'head';                                   // в шапке — вниз, иначе — вверх (не обрезается)
        var calcAll = getCalcComposition('all'), calcS = getCalcComposition('stock'), calcB = getCalcComposition('bond'),
            fav = getFavComposition(), mon = getMonthlyComposition();
        function oc(src, sub) { return "pfImport('" + src + "'," + (sub ? "'" + sub + "'" : 'null') + ',' + (pid ? "'" + pid + "'" : 'null') + ')'; }
        function posWord(n) { return n + ' ' + plural(n, 'позиция', 'позиции', 'позиций'); }
        function card(src, sub, ico, title, emptyMsg, list) {
            var n = list ? list.length : 0, avail = n > 0;
            return '<button class="pf-impitem' + (avail ? '' : ' off') + '"' + (avail ? '' : ' disabled') +
                ' onclick="' + oc(src, sub) + '">' +
                '<span class="pf-impico">' + ico + '</span>' +
                '<span class="pf-impbody"><b>' + title + '</b><i>' + (avail ? posWord(n) : emptyMsg) + '</i></span>' +
                (avail ? '<span class="pf-impgo">' + CHEV_SVG + '</span>' : '') +
            '</button>';
        }
        var subRow = (calcS && calcS.length) || (calcB && calcB.length)
            ? '<div class="pf-impsubs">' +
                ((calcS && calcS.length) ? '<button class="pf-impchip" onclick="' + oc('calc', 'stock') + '">Только акции · ' + calcS.length + '</button>' : '') +
                ((calcB && calcB.length) ? '<button class="pf-impchip" onclick="' + oc('calc', 'bond') + '">Только облигации · ' + calcB.length + '</button>' : '') +
            '</div>' : '';
        return '<div class="pf-impmenu' + (up ? ' up' : '') + '" id="pfImp-' + key + '">' +
            '<div class="pf-impgrp">Откуда перенести бумаги</div>' +
            card('calc', 'all', IMPCALC_SVG, 'Из расчёта', 'нет сохранённого расчёта', calcAll) +
            subRow +
            card('fav', null, IMPFAV_SVG, 'Из избранного', 'нет отмеченных звёздочкой бумаг', fav) +
            card('monthly', null, IMPMON_SVG, 'Из ежемесячного дохода', 'нет облигаций в калькуляторе дохода', mon) +
            '</div>';
    }
    function impWrapHtml(key, pid) {
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'' + key + '\')">' +
                DL_SVG + 'Импорт' + CHEV_SVG + '</button>' +
            impMenuHtml(key, pid) + '</div>';
    }

    // ---- бэкап (выгрузить/загрузить JSON) — переиспользует попап-инфраструктуру «Импорт» ----
    function backupWrapHtml() {
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'bkp\')">' + SHIELD_SVG + 'Бэкап' + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-bkp">' +
                '<div class="pf-impgrp">Резервная копия</div>' +
                '<button class="pf-impitem" onclick="pfExportData()">' + DL_SVG + 'Выгрузить в файл (JSON)</button>' +
                '<button class="pf-impitem" onclick="pfImportClick()">' + UPLOAD_SVG + 'Загрузить из файла</button>' +
            '</div>' +
            '<input type="file" id="pfBkpInput" accept="application/json,.json" style="display:none" onchange="pfImportData(this)">' +
        '</div>';
    }

    // ---- заголовок ----
    function headHtml() {
        var title = store.items.length === 1 ? 'Портфель' : 'Портфели';
        return '<div class="d3-head pf-head">' +
            '<div class="d3-head-l"><h1 class="d3-title">' + title + '</h1></div>' +
            '<div class="d3-head-actions">' +
                '<button class="d3-quick" onclick="pfAddPortfolio()">' + PLUS_SVG + 'Добавить портфель</button>' +
                backupWrapHtml() +
                impWrapHtml('head', null) +
            '</div></div>';
    }

    // ---- сводка по всем портфелям (только при 2+ портфелях) — компактная карточка ПОД
    // «Избранным» в правой колонке: капитал + вложено/доход + распределение + мини-лидерборд
    // портфелей + кнопки быстрого перехода к таблицам «Рынок · Акции» и «Рынок · Облигации».
    function summaryCardHtml() {
        var inv = 0, val = 0, bondVal = 0;
        var rows = [];
        store.items.forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value; bondVal += c.bondVal;
            rows.push({ name: p.name, color: p.color, pct: c.pnlPct, value: c.value, has: c.invested > 0 });
        });
        var pnl = val - inv, pnlPct = inv > 0 ? pnl / inv * 100 : 0;
        var bondPct = val > 0 ? bondVal / val * 100 : 0, stockPct = 100 - bondPct;

        var ranked = rows.slice().sort(function (a, b) {
            if (a.has !== b.has) return a.has ? -1 : 1; return b.pct - a.pct; });
        var hasMany = ranked.filter(function (r) { return r.has; }).length > 1;
        var board = ranked.map(function (r, i) {
            return '<div class="pfs2-row' + (i === 0 && r.has && hasMany ? ' lead' : '') + (r.has ? '' : ' empty') + '">' +
                '<span class="pfs2-rk">' + (i + 1) + '</span>' +
                '<span class="pfs2-n"><i style="background:' + colorVal(r.color) + '"></i><span class="pfs2-nm">' + esc(r.name) + '</span></span>' +
                '<span class="pfs2-cap">' + (r.value > 0 ? fmtRub(r.value) : '—') + '</span>' +
                '<span class="pfs2-v ' + (r.has ? (r.pct >= 0 ? 'pos' : 'neg') : 'muted') + '">' + (r.has ? fmtPct(r.pct) : '—') + '</span>' +
            '</div>';
        }).join('');

        var GO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        return '<div class="dash2-card pf-sumcard">' +
            '<div class="pfs2-eyebrow">Суммарный капитал · ' + store.items.length + ' ' + plural(store.items.length, 'портфель', 'портфеля', 'портфелей') + '</div>' +
            '<div class="pfs2-capital">' + fmtRub(val) + '</div>' +
            '<div class="pfs2-sub">Вложено ' + fmtRub(inv) + '<span class="pfs2-pnl ' + (pnl >= 0 ? 'pos' : 'neg') + '">' + (pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(pnl)) + ' · ' + fmtPct(pnlPct) + '</span></div>' +
            '<div class="pfs2-alloc">' +
                '<div class="pfs2-alloc-bar"><span class="pfs2-alloc-stock" style="width:' + stockPct.toFixed(1) + '%"></span><span class="pfs2-alloc-bond" style="width:' + bondPct.toFixed(1) + '%"></span></div>' +
                '<div class="pfs2-alloc-leg"><span><i class="stock"></i>Акции ' + (100 - Math.round(bondPct)) + '%</span><span><i class="bond"></i>Облигации ' + Math.round(bondPct) + '%</span></div>' +
            '</div>' +
            '<div class="pfs2-board">' + board + '</div>' +
            '<div class="pfs2-nav">' +
                '<button class="pfs2-go" onclick="switchTab(\'market-stocks\')"><i class="stock"></i>Акции' + GO_SVG + '</button>' +
                '<button class="pfs2-go" onclick="switchTab(\'market-bonds\')"><i class="bond"></i>Облигации' + GO_SVG + '</button>' +
            '</div>' +
        '</div>';
    }
    function plural(n, one, few, many) { n = Math.abs(n) % 100; var n1 = n % 10;
        if (n > 10 && n < 20) return many; if (n1 > 1 && n1 < 5) return few; if (n1 === 1) return one; return many; }

    // ---- donut (conic). Центр — СОСЕД ring'а: CSS-mask клипает потомков ----
    // centerHtml опционален: для карточки/сводки центр оставляем пустым (соотношение
    // акций/облигаций показывает легенда рядом), для разворота — пишем капитал.
    function donutHtml(bondPct, size, centerHtml) {
        size = size || 96;
        var bp = clamp(bondPct, 0, 100);
        return '<div class="pf-ring-wrap" style="width:' + size + 'px;height:' + size + 'px">' +
            '<div class="pf-ring" style="--bp:' + bp.toFixed(1) + '"></div>' +
            (centerHtml ? '<div class="pf-ring-c">' + centerHtml + '</div>' : '') + '</div>';
    }

    // ---- сетка карточек (calCell — HTML «Календаря выплат», занимает свободную ячейку
    // сетки при нечётном числе портфелей: та же высота, что у карточки портфеля) ----
    function gridHtml(calCell) {
        if (!store.items.length) return emptyHtml();
        var items = store.items.slice(0, MAX_CARDS);
        // Раскрытый график выезжает ОВЕРЛЕЕМ в сторону поверх контента (position:absolute) —
        // сетка НЕ перестраивается, карточка не смещается, соседи не «прыгают». Направление
        // выезда зависит от колонки: правая колонка тянет влево (.col-right).
        var cards = items.map(function (p, i) { return cardHtml(p, i, i % 2 === 1); }).join('');
        return '<div class="pf-grid">' + cards + (calCell || '') + '</div>';
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

    var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="17" r="2.5"/></svg>';

    var CHART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l5-5 4 3 7-7"/><path d="M16 8h4v4"/></svg>';
    var HOLDS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    var REBAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg>';

    // ---- мини-график доходности прямо в карточке (всегда виден, портфель vs IMOEX) ----
    // Переиспользует drawPfChart (тот же компонент, что и большой график/разворот): шкала
    // процентов слева + наводимые точки с тултипом (дата + значение) — просто в компактном
    // размере (meньше точек, сжатые отступы через .pfc-mchart-plot в CSS).
    function paintPfChartMini(pid) { drawPfChart(pid, dq('pfmChart-' + pid), null, dq('pfmLeg-' + pid), pid + 'm', 16); }
    // мини-график в карточке по умолчанию сравнивает с IMOEX (как в референсе); после первого
    // явного тоггла (кнопка IMOEX) — уважаем выбор пользователя. ВАЖНО: выставляем флаг ДО первого
    // loadPfChart() любого пейна (см. renderPortfolios) — иначе другой пейн того же портфеля
    // (раскрытый большой график) может запросить серию РАНЬШЕ repaintMiniCharts() с ещё не
    // выставленным флагом (wantImoex=false), а пока тот запрос летит, chartBusy блокирует
    // повторный запрос — кривая IMOEX так и не подгрузится, пока не тронуть тумблер руками.
    function ensureDefaultImoexFlags() {
        store.items.slice(0, MAX_CARDS).forEach(function (p) { if (!(p.id in chartImoex)) chartImoex[p.id] = true; });
    }
    // на каждый видимый портфель — своя загрузка/перерисовка мини-графика (переиспользует loadPfChart)
    function repaintMiniCharts() {
        store.items.slice(0, MAX_CARDS).forEach(function (p) {
            if (dq('pfmChart-' + p.id)) loadPfChart(p.id);
        });
    }

    function cardHtml(p, idx, colRight) {
        var c = calcPf(p), ac = colorVal(p.color);
        var pnlCls = c.pnl >= 0 ? 'pos' : 'neg';
        var chartOn = !!chartOpen[p.id], holdsOn = !!holdsExpand[p.id];
        var menu = (openMenu === p.id) ? menuHtml(p) : '';
        // настройки всегда раскрыты «во всю высоту» — полный список без внутреннего скролла
        var tall = (openMenu === p.id) ? ' pf-card--tall' : '';
        var MANY = 4;
        // мини-версия показывает ВЕСЬ состав по порядку (от лучших к худшим — c.hs уже
        // отсортирован); список не режется — карточка скроллится внутри (.pfc-massets).
        var assetsBody = c.hs.length ? pfMiniTableHtml(c.hs, p.id)
            : '<div class="pfc-empty">Состав пуст — добавьте активы в настройках ⚙</div>';
        // «раскрытие» вверху карточки (иконка со стрелками) ведёт в ту же панель, что и график,
        // но сразу с открытыми активами — отдельный оверлей «весь состав» больше не дублируется тут
        var assetsChartOn = chartOn && !!chartAssets[p.id];

        return '<div class="dash2-card pf-card' + (openMenu === p.id ? ' menu-open' : '') + tall + (chartOn ? ' chart-open' : '') + (chartOn && chartAssets[p.id] ? ' assets-open' : '') + (holdsOn ? ' holds-open' : '') + (colRight ? ' col-right' : '') + '" style="--pf-accent:' + ac + '">' +
            '<div class="pfc-top">' +
                '<div class="pfc-titles">' +
                    '<span class="pfc-name" onclick="pfNameEdit(\'' + p.id + '\',event)" title="Нажмите, чтобы переименовать"><span class="pfc-name-ink">' + esc(p.name) + '</span></span>' +
                '</div>' +
                '<div class="pfc-ctrls">' +
                    '<span class="pfc-pnl ' + pnlCls + '">' + fmtPct(c.pnlPct) + '</span>' +
                    '<div class="pfc-acts">' +
                        '<button class="pfc-act' + (chartOn ? ' on' : '') + '" onclick="pfToggleChart(\'' + p.id + '\')" aria-label="График доходности" title="' + (chartOn ? 'Свернуть график' : 'Сравнить с IMOEX')  + '">' + CHART_SVG + '</button>' +
                        '<button class="pfc-act' + (assetsChartOn ? ' on' : '') + '" onclick="pfOpenChartAssets(\'' + p.id + '\')" aria-label="Полный состав" title="' + (assetsChartOn ? 'Свернуть' : 'Полный состав') + '">' + HOLDS_SVG + '</button>' +
                        '<button class="pfc-act' + (openMenu === p.id ? ' on' : '') + '" onclick="pfToggleMenu(\'' + p.id + '\')" aria-label="Настройки" title="Настройки">' + GEAR_SVG + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            menu +
            (chartOn ? '<div class="pfc-chartwrap">' + pfChartViewHtml(p, c, idx) + pfChartAssetsHtml(p, c) + '</div>' : '') +
            (holdsOn ? holdsOverlayHtml(p, c) : '') +
            '<div class="pfc-normal">' +
            '<div class="pfc-hero">' +
                '<div class="pfc-hero-top">' +
                    '<span class="pfc-hero-val">' + fmtRub(c.value) + '</span>' +
                    '<span class="pfc-hero-inc ' + pnlCls + '">' + (c.pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(c.pnl)) + ' · ' + fmtPct(c.pnlPct) + '</span>' +
                '</div>' +
                (function () {
                    var imOn = !(p.id in chartImoex) || !!chartImoex[p.id];
                    return '<div class="pfc-mini-chart">' +
                        '<div class="pfc-mchart-top">' +
                            '<div class="pfc-mchart-leg" id="pfmLeg-' + p.id + '"></div>' +
                            '<button class="pfc-imtgl' + (imOn ? ' on' : '') + '" data-pid="' + p.id + '" onclick="pfToggleMiniImoex(\'' + p.id + '\')" ' +
                                'title="' + (imOn ? 'Скрыть индекс Мосбиржи' : 'Сравнить с индексом Мосбиржи') + '"><span class="pfc-imtgl-dot"></span>IMOEX</button>' +
                        '</div>' +
                        '<div class="pfc-mchart-plot" id="pfmChart-' + p.id + '"></div>' +
                    '</div>';
                })() +
            '</div>' +
            cardRingHtml(c, idx) +
            '<div class="pfc-stats2">' +
                '<div class="pfc-stat2"><span class="pfc-stat2-l">Вложено</span><span class="pfc-stat2-v">' + fmtRub(c.invested) + '</span></div>' +
                '<div class="pfc-stat2 pfc-stat2--inc"><span class="pfc-stat2-l">Доход</span><span class="pfc-stat2-v ' + pnlCls + '">' + fmtRub(c.pnl) + '</span></div>' +
                '<div class="pfc-stat2 pfc-stat2--yield is-' + (c.annual >= 0 ? 'gn' : 'rd') + '" title="Доходность в пересчёте на год (может отличаться от «Дохода» и графика — те показывают фактическое изменение за весь срок, а не годовые)"><span class="pfc-stat2-l">Доходность</span><span class="pfc-stat2-v ' + (c.annual >= 0 ? 'pos' : 'neg') + '">' + fmtPct(c.annual) + '</span></div>' +
            '</div>' +
            '<div class="pfc-sep"></div>' +
            '<div class="pfc-massets">' + assetsBody + '</div>' +
            '<div class="pfc-foot">' +
                '<button class="pfc-rebal" onclick="pfExpand(\'' + p.id + '\')">' + REBAL_SVG + 'Ребалансировать</button>' +
                (c.hs.length > MANY ? '<button class="pfc-more' + (holdsOn ? ' on' : '') + '" onclick="pfToggleHolds(\'' + p.id + '\')" aria-label="' + (holdsOn ? 'Свернуть состав' : 'Показать весь состав') + '" title="' + (holdsOn ? 'Свернуть' : 'Показать всё · ' + c.hs.length) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' : '') +
            '</div>' +
            '</div>' +
        '</div>';
    }

    // Оверлей «весь состав» — раскрывается ВНИЗ поверх контента (как «Состав портфеля» на
    // Главной): высота карточки не меняется, оверлей продолжает ТУ ЖЕ мини-таблицу (те же
    // строки pfMiniRowHtml), просто без ограничения в 4 штуки — а не отдельную широкую таблицу.
    function holdsOverlayHtml(p, c) {
        var body = c.hs.length ? pfMiniTableGroupedHtml(c.hs, p.id)
            : '<div class="pfc-empty">Состав пуст</div>';
        return '<div class="pfc-holdsover">' +
            '<div class="pfc-holdsover-h">' +
                '<span class="pfc-holdsover-t"><span class="pfc-holdsover-dot"></span>' + esc(p.name) + ' · состав</span>' +
                '<span class="pfc-holdsover-n">' + c.count + ' ' + plural(c.count, 'актив', 'актива', 'активов') + '</span>' +
                '<button class="pfc-holdsover-x" onclick="pfToggleHolds(\'' + p.id + '\')" aria-label="Свернуть" title="Свернуть">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>' +
            '<div class="pfc-holdsover-list">' + body + '</div>' +
        '</div>';
    }

    // Кольцо распределения карточки: маленький donut + номер портфеля в центре + полоса-легенда
    function cardRingHtml(c, idx) {
        var bondP = Math.round(clamp(c.bondPct, 0, 100)), stockP = 100 - bondP;
        var num = '<span class="pfc-ringnum">' + (((idx || 0) + 1)) + '</span>';
        return '<div class="pfc-alloc">' +
            donutHtml(c.bondPct, 40, num) +
            '<div class="pfc-dist">' +
                '<div class="pfc-dist-bar"><div style="width:' + stockP + '%;background:#D97757"></div><div style="width:' + bondP + '%;background:#7B9BBF"></div></div>' +
                '<div class="pfc-dist-lbl"><span><i style="background:#D97757"></i>Акции ' + stockP + '%</span><span><i style="background:#7B9BBF"></i>Облигации ' + bondP + '%</span></div>' +
            '</div></div>';
    }

    // мини-таблица состава: НАСТОЯЩАЯ <table> (как pfo-table в ребалансе), а не css-grid из
    // фиксированных px-колонок — так шапка и строки гарантированно совпадают по ширине колонок
    // и числа не «наезжают» друг на друга при длинных ценах. Переиспользуется и в оверлее
    // «весь состав» (тот визуально ПРОДОЛЖАЕТ ту же таблицу, просто без лимита в 4 строки).
    function pfMiniTableHtml(list, pid) {
        var head = '<tr><th class="pfc-mc-as">Актив</th><th>Кол-во</th><th>Сейчас</th><th>Изм.</th></tr>';
        var body = list.map(function (x) { return pfMiniRowHtml(x, pid); }).join('');
        return '<div class="pfc-mtablewrap"><table class="pfc-mtable"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    // та же мини-таблица, но состав разбит на группы «Акции» / «Облигации» (строка-заголовок
    // группы внутри одной <table> — колонки групп остаются выровненными). Используется в
    // оверлее «весь состав» (нижнее раскрытие карточки).
    function pfMiniTableGroupedHtml(list, pid) {
        var stocks = list.filter(function (x) { return x.h.type !== 'bond'; });
        var bonds = list.filter(function (x) { return x.h.type === 'bond'; });
        function grp(kind, label, arr) {
            if (!arr.length) return '';
            return '<tr class="pfc-mgrp"><td colspan="4"><span class="pfc-mgrp-in"><i class="pfc-mgrp-dot ' + kind + '"></i>' + label +
                '<b>' + arr.length + '</b></span></td></tr>' +
                arr.map(function (x) { return pfMiniRowHtml(x, pid); }).join('');
        }
        var head = '<tr><th class="pfc-mc-as">Актив</th><th>Кол-во</th><th>Сейчас</th><th>Изм.</th></tr>';
        var body = grp('stock', 'Акции', stocks) + grp('bond', 'Облигации', bonds);
        return '<div class="pfc-mtablewrap"><table class="pfc-mtable"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    // Строка актива: тикер · тип · кол-во · цена · изменение. По КЛИКУ строка раскрывает
    // субданные (дата покупки, цена/средняя цена, НКД для облигаций) — отдельной строкой под ней.
    function pfMiniRowHtml(x, pid) {
        var h = x.h, c = x.c, isB = h.type === 'bond';
        var multi = c.lotCount > 1, open = !!openRows[h.id];
        var lotChip = multi ? ' <i class="pfc-lotn">×' + c.lotCount + '</i>' : '';
        var ptip = isB ? ' title="' + attr(BOND_PRICE_TIP) + '"' : '';
        var row = '<tr class="pfc-mtr' + (open ? ' open' : '') + '" data-hid="' + h.id + '" onclick="pfToggleAssetRow(\'' + pid + '\',\'' + h.id + '\')">' +
                '<td class="pfc-mc-as"><span class="pfc-mtk"><svg class="pfc-mch' + (open ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><b>' + esc(h.ticker) + '</b><i class="' + (isB ? 'bond' : 'stock') + '">' + (isB ? 'обл' : 'акц') + '</i>' + lotChip + '</span></td>' +
                '<td class="pfc-mqty">' + (c.qty || 0) + '</td>' +
                '<td class="pfc-mnow' + (c.live ? ' live' : '') + '"' + ptip + '>' + fmtPrice(c.cur) + '</td>' +
                '<td class="pfc-mchg ' + (c.invested > 0 ? (c.pnlPct >= 0 ? 'pos' : 'neg') : '') + '">' + (c.invested > 0 ? fmtPct(c.pnlPct) : '—') + '</td>' +
            '</tr>';
        return open ? row + pfMiniDetailRowHtml(h, c) : row;
    }
    // Полное название актива: своё имя (если отличается от тикера) → таблица акций →
    // гугл-таблица облигаций (bonds из data.js; тикер портфеля может быть коротким ISIN).
    function assetDisplayName(h) {
        if (h.name && h.name !== h.ticker) return h.name;
        if (h.type === 'bond') {
            try {
                if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++) {
                    var t = bonds[i] && bonds[i].t;
                    if (t && (t.indexOf(h.ticker) === 0 || String(h.ticker).indexOf(t) === 0)) return bonds[i].n || h.ticker;
                }
            } catch (e) {}
        } else if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(h.ticker);
            if (co && co.name) return co.name;
        }
        return h.name || h.ticker;
    }
    // строка субданных под активом: название · дата покупки · цена/средняя цена · НКД (для облигаций)
    function pfMiniDetailRowHtml(h, c) {
        var isB = h.type === 'bond', multi = c.lotCount > 1;
        // при нескольких лотах показываем СРЕДНИЕ (взвешенные) дату и цену покупки, при одном — фактические
        var dateLbl = multi ? 'Средняя дата' : 'Куплен';
        var dateVal = multi ? ruDate(c.avgDate) : ruDate(c.firstDate);
        var priceLbl = multi ? 'Средняя цена · ' + c.lotCount + ' ' + plural(c.lotCount, 'лот', 'лота', 'лотов') : 'Цена покупки';
        var det = '<span class="pfc-det-i pfc-det-i--nm"><span class="pfc-det-l">Название</span><span class="pfc-det-v pfc-det-v--nm">' + esc(assetDisplayName(h)) + '</span></span>' +
            '<span class="pfc-det-i"><span class="pfc-det-l">' + dateLbl + '</span><span class="pfc-det-v">' + dateVal + '</span></span>' +
            '<span class="pfc-det-i"><span class="pfc-det-l">' + priceLbl + '</span><span class="pfc-det-v">' + fmtPrice(c.buy) + '</span></span>' +
            (isB ? '<span class="pfc-det-i"><span class="pfc-det-l">' + (multi ? 'Средний НКД' : 'НКД при покупке') + '</span><span class="pfc-det-v">' + (c.nkd > 0 ? fmtPrice(c.nkd) : '0 ₽') + '</span></span>' : '');
        return '<tr class="pfc-mdet" data-hid="' + h.id + '"><td colspan="4"><div class="pfc-mdet-in">' + det + '</div></td></tr>';
    }

    // ---- настройки/редактор (дропдаун ⚙) ----
    function menuHtml(p) {
        var sw = COLORS.map(function (cc) {
            return '<button class="pfm-sw' + (p.color === cc.id ? ' on' : '') + '" style="--sw:' + cc.v + ';background:' + cc.v + '" onclick="pfSetColor(\'' + p.id + '\',\'' + cc.id + '\')" aria-label="' + cc.id + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>';
        }).join('');
        var holds = p.holdings || [];
        var stocks = holds.filter(function (h) { return h.type !== 'bond'; });
        var bonds = holds.filter(function (h) { return h.type === 'bond'; });
        // состав сгруппирован: отдельно «Акции», отдельно «Облигации» — с заголовком группы
        // и строкой подписей колонок (тикер · дата · цена · [НКД] · кол-во), чтобы поля были
        // понятны без фокуса. Сетка подписей совпадает с .pfm-row-main--stock/--bond.
        function colsHead(kind) {
            return kind === 'bond'
                ? '<div class="pfm-cols pfm-cols--bond"><span>Тикер</span><span>Дата</span><span>Цена ₽</span><span>НКД ₽</span><span>Кол-во</span><span></span></div>'
                : '<div class="pfm-cols pfm-cols--stock"><span>Тикер</span><span>Дата</span><span>Цена ₽</span><span>Кол-во</span><span></span></div>';
        }
        function grp(label, kind, list) {
            if (!list.length) return '';
            return '<div class="pfm-grp"><span class="pfm-grp-l pfm-grp-l--' + kind + '">' + label + '</span>' +
                '<span class="pfm-grp-n">' + list.length + '</span><i class="pfm-grp-rule"></i></div>' +
                colsHead(kind) +
                list.map(function (h, i) { return editRowHtml(p.id, h, i + 1); }).join('');
        }
        var rows = grp('Акции', 'stock', stocks) + grp('Облигации', 'bond', bonds);
        var n = holds.length;
        var empty = !n;
        // стрелка указывает ВВЕРХ на форму добавления (она теперь над списком)
        var UP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>';
        // пустое состояние — «портфель с плюсом» в тонированной плашке (а не безликий
        // квадрат), заголовок-приглашение и понятные шаги: форма сверху или импорт снизу
        var noneBox = '<div class="pfm-none">' +
            '<span class="pfm-none-arrow up">' + UP_SVG + '</span>' +
            '<span class="pfm-none-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2.5"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 11v5"/><path d="M9.5 13.5h5"/></svg></span>' +
            '<span class="pfm-none-t">Портфель ждёт первые активы</span>' +
            '<span class="pfm-none-s">Впишите тикер в форму «Добавить актив» сверху — цену и НКД можно подтянуть с MOEX иконкой-календарём. Или подтяните готовый состав кнопкой «Импорт» внизу.</span>' +
        '</div>';
        // Оверлей на всю карточку: шапка · ВЫДЕЛЕННАЯ форма добавления (сверху) ·
        // полный список состава (без скролла, карточка растёт вниз) · действия (импорт/удалить)
        // menuJustOpened=true только на ПЕРВЫЙ рендер после открытия (⚙) — на всех
        // последующих ре-рендерах (добавление/удаление лота, сворачивание журнала и т.п.
        // тоже дёргают renderPortfolios и пересоздают весь .pfc-menu целиком) анимация
        // pfMenuIn ПОВТОРНО не проигрывается, иначе вся панель настроек каждый раз мигает.
        return '<div class="pfc-menu' + (menuJustOpened ? '' : ' no-anim') + '" id="pfMenu-' + p.id + '">' +
            '<div class="pfm-top">' +
                '<input class="pfm-name" value="' + attr(p.name) + '" onchange="pfRename(\'' + p.id + '\',this.value)" placeholder="Название портфеля">' +
                '<div class="pfm-colors">' + sw + '</div>' +
                '<button class="pfm-done" onclick="pfCloseMenu()">' + CHECK_SVG + 'Готово</button>' +
            '</div>' +
            '<div class="pfm-addpanel' + (empty ? ' is-empty' : '') + '">' +
                '<div class="pfm-addhead"><span class="pfm-addhead-ic">' + PLUS_SVG + '</span>' +
                    '<span class="pfm-addhead-t">Добавить актив</span>' +
                    '<span class="pfm-addhead-s">все данные за один подход</span>' +
                    '<span class="pfm-hint" title="В полях «цена» и «НКД» иконка-календарь подтягивает значение закрытия с MOEX на выбранную дату. После загрузки иконка гаснет; сотрите значение — и она снова загорится для повторного запроса.">' + INFO_SVG + '</span></div>' +
                addFormHtml(p.id, empty) +
            '</div>' +
            '<div class="pfm-mid' + (empty ? ' pfm-mid--empty' : '') + '">' +
                '<div class="pfm-sec"><span>Состав · ' + n + ' ' + plural(n, 'актив', 'актива', 'активов') + '</span>' +
                    '<i class="pfm-sec-rule"></i></div>' +
                '<div class="pfm-rows">' + (rows || noneBox) + '</div>' +
            '</div>' +
            '<div class="pfm-bottom">' +
                '<div class="pfm-foot">' +
                    impWrapHtml('imp-' + p.id, p.id) +
                    '<button class="pfm-act danger" onclick="pfDelete(\'' + p.id + '\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Удалить</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }
    // Иконка «подтянуть на дату» внутри поля: горит (lit) пока не подтянуто с API,
    // затухает (done) после загрузки — с тултипом «… на дату ДД.ММ.ГГГГ», крутится при загрузке.
    function fieldFx(pid, hid, field, fromApi, dateStr, loading) {
        var what = field === 'nkd' ? 'НКД' : 'цену';
        var title = loading ? 'Загрузка…'
            : (fromApi ? (field === 'nkd' ? 'НКД' : 'Цена') + ' закрытия на ' + ruDate(dateStr) + ' · нажмите, чтобы обновить'
                       : 'Подтянуть ' + what + ' закрытия MOEX на дату покупки');
        var cls = 'pfm-fx ' + (loading ? 'loading' : (fromApi ? 'done' : 'lit'));
        var inner = loading ? '<span class="pfm-fx-sp"></span>' : FETCH_SVG;
        return '<button class="' + cls + '" type="button" tabindex="-1" title="' + attr(title) + '" ' +
            'onclick="pfFetchField(\'' + pid + '\',\'' + hid + '\',\'' + field + '\')">' + inner + '</button>';
    }
    // Иконка «подтянуть на дату» для КОНКРЕТНОГО ЛОТА (журнал докупок)
    function fieldFxLot(pid, hid, lotId, field, fromApi, dateStr, loading) {
        var what = field === 'nkd' ? 'НКД' : 'цену';
        var title = loading ? 'Загрузка…'
            : (fromApi ? (field === 'nkd' ? 'НКД' : 'Цена') + ' закрытия на ' + ruDate(dateStr) + ' · нажмите, чтобы обновить'
                       : 'Подтянуть ' + what + ' закрытия MOEX на дату лота');
        var cls = 'pfm-fx ' + (loading ? 'loading' : (fromApi ? 'done' : 'lit'));
        var inner = loading ? '<span class="pfm-fx-sp"></span>' : FETCH_SVG;
        return '<button class="' + cls + '" type="button" tabindex="-1" title="' + attr(title) + '" ' +
            'onclick="pfFetchLotField(\'' + pid + '\',\'' + hid + '\',\'' + lotId + '\',\'' + field + '\')">' + inner + '</button>';
    }
    // календарь-иконка + нативный date-input — как поле даты во вкладке «Тест» (.bt-date-field):
    // штатный индикатор браузера скрыт (растянут прозрачно на всю ячейку — клик открывает пикер),
    // а видимая иконка одинаковая во всём приложении.
    var CAL_SVG = '<svg class="pfm-date-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    function dateFieldHtml(inputHtml) { return '<span class="pfm-datewrap">' + inputHtml + CAL_SVG + '</span>'; }
    function lotDateInput(pid, h, l) {
        return dateFieldHtml('<input class="pfm-in pfm-in-date" type="date" value="' + attr(l.buyDate) + '" ' +
            'onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'buyDate\',this.value)">');
    }

    // ===== Красивый календарь для дат в настройках портфеля — тот же виджет (.btcal),
    // что и в поле даты вкладки «Тест» (см. js/sidebar.js), но без привязки к одному
    // фиксированному input#btDateInput: тут таких полей много (дата лота × несколько
    // строк на портфель) и они постоянно пересоздаются при ре-рендере (renderPortfolios
    // перезаписывает host.innerHTML на каждое изменение) — поэтому вместо getElementById
    // используется делегирование кликов на document и «текущий» инпут curInput. =====
    (function () {
        var mq = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };
        var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        var MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        var DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        var pop = null, curInput = null, vY = 0, vM = 0, view = 'days', vYPageEnd = 0;
        var MIN_YEAR = 2014;
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        function chevron() { return '<svg class="btcal-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'; }
        function closeCal() { if (pop) { pop.remove(); pop = null; } curInput = null; }
        function selDate() {
            if (curInput && curInput.value) {
                var p = curInput.value.split('-');
                return { y: +p[0], m: +p[1] - 1, d: +p[2] };
            }
            return null;
        }
        function monthInFuture(y, m, tY, tM) { return y > tY || (y === tY && m > tM); }

        function renderDays() {
            var today = new Date(); today.setHours(0, 0, 0, 0);
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
            DOW.forEach(function (d) { h += '<span>' + d + '</span>'; });
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
                var dt = new Date(cy, cm, dnum); dt.setHours(0, 0, 0, 0);
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
            if (curInput) positionPop(curInput);
        }

        // Список дат в настройках лежит в скроллящемся .pfm-rows — обычный position:absolute
        // внутри поля обрезался бы этим overflow. Поэтому попап крепится к <body> как
        // position:fixed и позиционируется координатами инпута (см. positionPop) — тот же приём,
        // что и у выезжающей карточки stockDetailCard (см. память «Fixed overlays need body»).
        function positionPop(inp) {
            var r = inp.getBoundingClientRect();
            var w = 288, h = pop.offsetHeight || 330;
            var left = r.left;
            if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
            var top = r.bottom + 8;
            if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
            pop.style.left = left + 'px';
            pop.style.top = top + 'px';
        }
        function openCal(inp) {
            closeCal();
            curInput = inp;
            var sel = selDate();
            var base = sel ? new Date(sel.y, sel.m, 1) : new Date();
            vY = base.getFullYear(); vM = base.getMonth(); view = 'days';
            pop = document.createElement('div');
            pop.className = 'btcal';
            pop.style.position = 'fixed';
            document.body.appendChild(pop);
            render();
            positionPop(inp);
            pop.addEventListener('click', function (e) {
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
                    curInput.value = day.dataset.date;
                    curInput.dispatchEvent(new Event('change', { bubbles: true }));
                    closeCal();
                }
            });
        }

        // На десктопе поле делается readonly, чтобы нативный системный календарь не открывался
        // (та же логика, что в «Тест»). Поля пересоздаются при каждом ре-рендере настроек —
        // MutationObserver на #pfWrap переприменяет readonly к новым инпутам сразу после рендера.
        function applyReadonly() {
            document.querySelectorAll('.pfm-in-date').forEach(function (inp) { inp.readOnly = mq.matches; });
        }
        function onModeChange() { applyReadonly(); if (!mq.matches) closeCal(); }
        if (mq.addEventListener) mq.addEventListener('change', onModeChange);
        else if (mq.addListener) mq.addListener(onModeChange);
        window.addEventListener('resize', applyReadonly);

        function ensureObserver() {
            var host = document.getElementById('pfWrap');
            if (!host || host.__pfCalObserved) return;
            host.__pfCalObserved = true;
            new MutationObserver(applyReadonly).observe(host, { childList: true, subtree: true });
            applyReadonly();
        }
        ensureObserver();
        document.addEventListener('DOMContentLoaded', ensureObserver);

        document.addEventListener('mousedown', function (e) {
            var inp = e.target.closest('.pfm-in-date');
            if (inp && mq.matches) {
                e.preventDefault();
                if (pop && curInput === inp) closeCal(); else openCal(inp);
                return;
            }
            if (pop && !pop.contains(e.target)) closeCal();
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCal(); });
        // скролл внутри .pfm-rows (или страницы) — попап зафиксирован на <body>, а не на поле,
        // поэтому при скролле просто закрываем, а не тащим за собой (capture — ловит и вложенные контейнеры)
        document.addEventListener('scroll', function (e) {
            if (pop && !pop.contains(e.target)) closeCal();
        }, true);
    })();
    function lotPriceCell(pid, h, l) {
        return '<span class="pfm-field has-fx">' +
            '<input class="pfm-in pfm-in-num" type="number" step="0.01" min="0" value="' + (l.buyPrice || '') + '" placeholder="цена ₽" ' +
                'onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'buyPrice\',this.value)">' +
            fieldFxLot(pid, h.id, l.id, 'price', !!l.priceFromApi, l.buyDate, loadStatus[l.id + ':price'] === 'loading') + '</span>';
    }
    function lotNkdCell(pid, h, l) {
        return '<span class="pfm-field has-fx">' +
            '<input class="pfm-in pfm-in-num" type="number" step="0.01" min="0" value="' + (l.nkd || '') + '" placeholder="НКД ₽" ' +
                'onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'nkd\',this.value)">' +
            fieldFxLot(pid, h.id, l.id, 'nkd', !!l.nkdFromApi, l.buyDate, loadStatus[l.id + ':nkd'] === 'loading') + '</span>';
    }
    function lotQtyInput(pid, h, l) {
        return '<input class="pfm-in pfm-in-num" type="number" step="1" min="0" value="' + (l.qty || '') + '" placeholder="кол-во" ' +
            'onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'qty\',this.value)">';
    }
    var XMARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    // Строка состава = актив с ЖУРНАЛОМ ЛОТОВ. Главная строка правит ПЕРВЫЙ лот (+ тикер +
    // «удалить актив»); тулбар показывает среднюю/кол-во по лотам + «Докупка» + тоггл; доп.
    // лоты (со 2-го) раскрываются под строкой.
    function editRowHtml(pid, h, rank) {
        var isBond = h.type === 'bond';
        var tag = isBond ? 'обл' : 'акц';
        var lots = ensureLots(h), l0 = lots[0], agg = aggHolding(h);
        var multi = lots.length > 1, expanded = !!openLots[h.id];
        // действия актива в одну строку: «Докупка» (иконка+тултип) + «Удалить» (мягко-красная)
        var acts = '<div class="pfm-acts">' +
            '<button class="pfm-mini pfm-dup" type="button" onclick="pfAddLot(\'' + pid + '\',\'' + h.id + '\')" aria-label="Докупка" title="Докупка — ещё одна покупка этого актива (усреднение цены)">' + PLUS_SVG + '</button>' +
            '<button class="pfm-del" type="button" onclick="pfRemoveHolding(\'' + pid + '\',\'' + h.id + '\')" aria-label="Удалить актив" title="Удалить актив">' + XMARK_SVG + '</button>' +
        '</div>';
        var main = '<div class="pfm-row-main ' + (isBond ? 'pfm-row-main--bond' : 'pfm-row-main--stock') + '">' +
            '<span class="pfm-tk-cell">' +
                (rank ? '<span class="pfm-rank">' + rank + '</span>' : '') +
                '<span class="pfm-tag ' + h.type + '">' + tag + '</span>' +
                '<input class="pfm-in pfm-in-tk" value="' + attr(h.ticker) + '" onchange="pfEdit(\'' + pid + '\',\'' + h.id + '\',\'ticker\',this.value)" placeholder="Тикер"></span>' +
            lotDateInput(pid, h, l0) +
            lotPriceCell(pid, h, l0) +
            (isBond ? lotNkdCell(pid, h, l0) : '') +
            lotQtyInput(pid, h, l0) +
            acts +
        '</div>';
        // доп. лоты раскрываются ПОД первым лотом; тулбар (сводка + «Свернуть») — НИЖЕ всех лотов
        var extra = '';
        if (multi && expanded) {
            extra = '<div class="pfm-lotlist">' + lots.slice(1).map(function (l, i) {
                return '<div class="pfm-lotrow ' + (isBond ? 'pfm-lotrow--bond' : 'pfm-lotrow--stock') + '">' +
                    '<span class="pfm-lotlbl">#' + (i + 2) + '</span>' +
                    lotDateInput(pid, h, l) +
                    lotPriceCell(pid, h, l) +
                    (isBond ? lotNkdCell(pid, h, l) : '') +
                    lotQtyInput(pid, h, l) +
                    '<button class="pfm-del" type="button" onclick="pfRemoveLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\')" aria-label="Удалить лот" title="Удалить лот">' + XMARK_SVG + '</button>' +
                '</div>';
            }).join('') + '</div>';
        }
        // тулбар лотов — только для активов с несколькими покупками (сводка + сворачивание),
        // ниже последнего лота. Докупка — отдельной иконкой в строке актива (выше).
        var bar = '';
        if (multi) {
            var toggle = '<button class="pfm-lottgl' + (expanded ? ' on' : '') + '" onclick="pfToggleLots(\'' + pid + '\',\'' + h.id + '\')">' +
                (expanded ? 'Свернуть' : 'Показать лоты') +
                '<svg class="pfm-lottgl-i' + (expanded ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>';
            var sumTxt = '<span class="pfm-lotsum"><b>' + lots.length + ' ' + plural(lots.length, 'лот', 'лота', 'лотов') + '</b>' +
                (agg.qty > 0 ? ' · ср. ' + ruDate(agg.avgDate) + ' · ' + fmtPrice(agg.avgPrice) + ' · ' + agg.qty + ' шт' : '') + '</span>';
            bar = '<div class="pfm-lotbar">' + sumTxt + '<i class="pfm-lotbar-sp"></i>' + toggle + '</div>';
        }
        return '<div class="pfm-row pfm-hold' + (multi ? ' has-lots' : '') + '">' + main + extra + bar + '</div>';
    }

    // Форма добавления актива «за один подход»: тикер · тип · дата · цена (+иконка) ·
    // НКД (для облигаций, +иконка) · кол-во · «Добавить». Поле НКД появляется только для
    // облигаций (data-type на форме). Иконка в поле цены/НКД подтягивает значение
    // закрытия MOEX на выбранную дату прямо в форму (значения не теряются — без ре-рендера).
    function addFetchBtn(pid, field) {
        return '<button class="pfm-fx lit" type="button" tabindex="-1" title="Подтянуть ' +
            (field === 'nkd' ? 'НКД' : 'цену') + ' закрытия MOEX на выбранную дату" ' +
            'onclick="pfAddFetch(\'' + pid + '\',\'' + field + '\',event)">' + FETCH_SVG + '</button>';
    }
    function addFormHtml(pid, empty) {
        return '<div class="pfm-addform" id="pfAddForm-' + pid + '" data-type="stock">' +
            '<div class="pfm-addgrid">' +
                '<input class="pfm-in pfm-in-tk pfaf-tk" id="pfNewTk-' + pid + '" placeholder="Тикер / ISIN" maxlength="14" ' +
                    'onkeydown="if(event.key===\'Enter\')pfAddHolding(\'' + pid + '\')">' +
                '<select class="pfm-in pfm-in-type pfaf-type" id="pfNewType-' + pid + '" onchange="pfAddTypeToggle(\'' + pid + '\')">' +
                    '<option value="stock">Акция</option><option value="bond">Облигация</option></select>' +
                dateFieldHtml('<input class="pfm-in pfm-in-date pfaf-date" id="pfNewDate-' + pid + '" type="date" value="' + todayStr() + '" title="Дата покупки">') +
                '<span class="pfm-field has-fx pfaf-price">' +
                    '<input class="pfm-in pfm-in-num" id="pfNewPrice-' + pid + '" type="number" step="0.01" min="0" placeholder="цена ₽">' +
                    addFetchBtn(pid, 'price') + '</span>' +
                '<span class="pfm-field has-fx pfaf-nkd">' +
                    '<input class="pfm-in pfm-in-num" id="pfNewNkd-' + pid + '" type="number" step="0.01" min="0" placeholder="НКД ₽">' +
                    addFetchBtn(pid, 'nkd') + '</span>' +
                '<input class="pfm-in pfm-in-num pfaf-qty" id="pfNewQty-' + pid + '" type="number" step="1" min="0" placeholder="кол-во" ' +
                    'onkeydown="if(event.key===\'Enter\')pfAddHolding(\'' + pid + '\')">' +
                '<button class="pfm-addbtn pfaf-add" onclick="pfAddHolding(\'' + pid + '\')">' + PLUS_SVG + 'Добавить</button>' +
            '</div></div>';
    }

    // Шапка вторичной карточки в стиле calc-карточек (.k eyebrow + .t заголовок)
    function pfCardHead(k, t, sub, right) {
        return '<div class="pf-ch">' +
            '<div class="pf-ch-l">' +
                (k ? '<span class="pf-ch-k">' + esc(k) + '</span>' : '') +
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
    // пояснение «что такое потенциал» (показывается инфо-иконкой в карточке «Избранное»)
    var POT_TIP = 'Потенциал (ОДХС) — оценка недооценённости: на сколько процентов справедливая цена выше (или ниже) текущей. ' +
        'Плюс = есть запас роста, минус = бумага уже переоценена. Это ориентир, а не гарантия — рассчитан по модели, рынок может думать иначе.';
    // Показанные плитки избранного: топ-12 по потенциалу. ЕДИНЫЙ список для favHtml и
    // renderFavNews — раньше новости грузились для первых 12 тикеров ИЗ ХРАНИЛИЩА (без
    // сортировки), и при >12 избранных часть видимых плиток (например SBER/VTBR) вечно
    // висела в «загрузка новости…», т.к. их просто не было в очереди загрузки.
    function favShown() {
        return favTickers().slice().sort(function (a, b) {
            var pa = potentialOf(a), pb = potentialOf(b);
            if (pa == null && pb == null) return 0;
            if (pa == null) return 1; if (pb == null) return -1;
            return pb - pa;
        }).slice(0, 12);
    }
    function favHtml() {
        if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }
        var favs = favShown();
        var inner;
        if (!favs.length) {
            inner = '<div class="pff-empty"><div class="pff-empty-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>' +
                '<div class="pff-empty-t">Нет избранных акций</div>' +
                '<div class="pff-empty-s">Отмечайте акции звёздочкой в разделе «Рынок · Акции» — здесь появятся их потенциал и свежие новости.</div></div>';
        } else {
            inner = '<div class="pff-grid">' + favs.map(function (tk) {
                var co = (typeof window.stkFindCompany === 'function') ? window.stkFindCompany(tk) : null;
                var name = co && co.name ? co.name : tk;
                var pot = potentialOf(tk);
                var potHtml = pot == null ? '<span class="pff-pot muted">—</span>'
                    : '<span class="pff-pot ' + (pot >= 0 ? 'pos' : 'neg') + '">' + fmtPct(pot) + '</span>';
                return '<div class="pff-tile">' +
                    '<div class="pff-thead">' +
                        '<button class="pff-id" onclick="pfOpenTicker(\'' + esc(tk) + '\')" title="Открыть карточку компании">' +
                            '<span class="pff-tk">' + esc(tk) + '</span><span class="pff-nm">' + esc(name) + '</span></button>' +
                        '<div class="pff-pot-wrap"><span class="pff-pot-l">потенциал</span>' + potHtml + '</div>' +
                    '</div>' +
                    '<div class="pff-news" id="pf-news-' + esc(tk) + '"><div class="pff-news-inner"><span class="pff-news-load">загрузка новости…</span></div></div>' +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-fav">' +
            pfCardHead('', 'Избранное', 'потенциал и свежая новость по тикеру',
                '<div class="pff-head-r">' +
                    // кастомный поповер вместо нативного title: тот всплывает с секундной
                    // задержкой и в системном стиле — свой показывается мгновенно и в тоне приложения
                    '<span class="pff-info-wrap"><button class="pff-info" type="button" aria-label="Что такое потенциал">' + INFO_SVG + '<span>Что такое потенциал?</span></button>' +
                    '<span class="pff-tipbox" role="tooltip">' + esc(POT_TIP) + '</span></span>' +
                    '<button class="pf-ch-go" onclick="switchTab(\'market-stocks\')">Все акции ' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></button>' +
                '</div>') +
            '<div class="pff-body">' + inner + '</div></div>';
    }
    // Готовый HTML новости + ссылку складываем в кэш (новость = клик по ссылке, не карточка)
    function buildNewsEntry(news) {
        if (!news || !news.length) return { html: '<span class="pff-news-none">нет свежих новостей</span>', link: '', none: true };
        var item = news[0], d = new Date(item.date);
        var rel = (typeof getRelativeDateText === 'function' && !isNaN(d.getTime())) ? getRelativeDateText(d)
            : (isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
        // заголовок целиком (в свёрнутом виде CSS обрезает в 1 строку, на ховере показывается полностью)
        var full = String(item.title || ''), title = full.slice(0, 300);
        var link = item.link || '';
        var go = link ? '<svg class="pff-news-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><polyline points="8 7 17 7 17 16"/></svg>' : '';
        return { html: '<span class="pff-news-t">' + esc(title) + (full.length > 300 ? '…' : '') + '</span>' +
            '<span class="pff-news-m"><i>Smart-Lab</i>' + (rel ? ' · ' + esc(rel) : '') + go + '</span>', link: link };
    }
    function fillNewsSlot(tk) {
        var slot = dq('pf-news-' + tk), e = newsHtmlCache[tk]; if (!slot || !e) return;
        slot.innerHTML = '<div class="pff-news-inner">' + e.html + '</div>';
        slot.classList.toggle('is-none', !!e.none);   // маркер «новости нет» (разворот на ховере идёт только у .link)
        if (e.link) {
            slot.classList.add('link'); slot.setAttribute('role', 'link'); slot.title = 'Открыть новость';
            slot.onclick = function (ev) { ev.stopPropagation(); if (typeof openExternalLink === 'function') openExternalLink(e.link); else window.open(e.link, '_blank'); };
        } else { slot.classList.remove('link'); slot.onclick = null; }
    }
    function pumpNewsQueue() {
        while (newsActive < 2 && newsQueue.length) {
            var tk = newsQueue.shift(); newsActive++;
            (function (tk) {
                Promise.resolve(loadNewsForTicker(tk))
                    .then(function (news) { newsHtmlCache[tk] = buildNewsEntry(news); })
                    .catch(function () { newsHtmlCache[tk] = { html: '<span class="pff-news-none">нет свежих новостей</span>', link: '', none: true }; })
                    .then(function () { newsActive--; fillNewsSlot(tk); pumpNewsQueue(); });
            })(tk);
        }
    }
    function renderFavNews() {
        // тот же топ-12 по потенциалу, что и в favHtml — грузим новости ровно для видимых плиток
        var favs = favShown(); if (!favs.length || typeof loadNewsForTicker !== 'function') return;
        favs.forEach(function (tk) {
            if (newsHtmlCache[tk]) { fillNewsSlot(tk); return; }   // уже загружено → без сети
            if (!newsStarted[tk]) { newsStarted[tk] = true; newsQueue.push(tk); }
        });
        // лёгкая задержка старта, чтобы сперва прогрузились данные таблиц, а не новости
        setTimeout(pumpNewsQueue, newsActive ? 0 : 350);
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
        return '<div class="d3-ratesband pf-ratesband">' +
            '<div class="drt-grid">' + tiles.map(function (t) {
                return '<div class="drt-tile" style="--ac:' + t.ac + '"><div class="drt-ic"><svg viewBox="0 0 24 24">' + t.ic + '</svg></div>' +
                    '<div class="drt-body"><div class="drt-l">' + esc(t.l) + '</div><div class="drt-v">' + esc(t.v) + '</div></div></div>';
            }).join('') + '</div></div>';
    }

    // ============================================================
    //  КАЛЕНДАРЬ ВЫПЛАТ — ближайшие купоны по облигациям ВСЕХ портфелей сразу
    // ============================================================
    // Дата купона у нас не хранится напрямую (MOEX её отдельным полем не отдаёт в уже
    // используемых запросах) — приближаем её по периодической схеме «частота выплат в год»
    // от даты ПОГАШЕНИЯ назад: это те же couponValue/freq/matDate, что уже тянет
    // fetchBondData/bondDetailsMap для «Прибыли по облигациям» в карточке ребалансировки
    // (см. bondEconAt ниже). Реальный график может отличаться на несколько дней от факта
    // MOEX — это приближение, а не официальный календарь выплат эмитента.
    function nextCouponDate(det) {
        var mat = parseBondDate(det && det.matDate); if (!mat) return null;
        var freq = +det.freq || 0; if (!(freq > 0)) return null;
        var stepMs = (365 / freq) * 86400000;
        var t = mat.getTime(), now = Date.now();
        if (t < now) return null;   // уже погашена
        while (t - stepMs >= now) t -= stepMs;
        return new Date(t);
    }
    function daysUntilText(d) {
        var days = Math.round((d.getTime() - Date.now()) / 86400000);
        if (days <= 0) return 'сегодня';
        if (days === 1) return 'завтра';
        if (days < 14) return 'через ' + days + ' ' + plural(days, 'день', 'дня', 'дней');
        var w = Math.round(days / 7);
        return 'через ' + w + ' ' + plural(w, 'неделю', 'недели', 'недель');
    }
    // все держащиеся сейчас облигации (qty>0) по всем портфелям — общий список для календаря
    // и для догрузки недостающих деталей купонов разом (а не по одной при открытии каждого портфеля)
    function allHeldBonds() {
        var list = [];
        store.items.forEach(function (p) { (p.holdings || []).forEach(function (h) {
            if (h.type === 'bond' && h.ticker && aggHolding(h).qty > 0) list.push({ p: p, h: h });
        }); });
        return list;
    }
    function collectUpcomingCoupons() {
        var evs = [];
        allHeldBonds().forEach(function (x) {
            var det = bondDetail(x.h.ticker); if (!det) return;
            var nd = nextCouponDate(det); if (!nd) return;
            var qty = aggHolding(x.h).qty, amount = (+det.couponValue || 0) * qty;
            if (!(amount > 0)) return;
            evs.push({ date: nd, ticker: x.h.ticker, name: x.h.name || x.h.ticker, amount: amount,
                pfName: x.p.name, pfColor: colorVal(x.p.color) });
        });
        evs.sort(function (a, b) { return a.date - b.date; });
        return evs;
    }
    // догрузка недостающих деталей купонов разом по ВСЕМ портфелям (де-дуп по тикеру —
    // fetchBondData и так кеширует внутри себя, но незачем плодить повторные вызовы за один проход)
    var payCalPending = false;
    function ensureAllBondDetails(cb) {
        if (typeof fetchBondData !== 'function') { cb(); return; }
        var seen = {}, need = [];
        allHeldBonds().forEach(function (x) { var tk = x.h.ticker;
            if (!seen[tk] && !bondDetail(tk)) { seen[tk] = 1; need.push(tk); } });
        if (!need.length || payCalPending) { cb(); return; }
        payCalPending = true;
        var left = need.length;
        need.forEach(function (tk) {
            Promise.resolve(fetchBondData(tk)).catch(function () {}).then(function () { if (--left <= 0) { payCalPending = false; cb(); } });
        });
    }
    var payCalFull = false;
    function sameCalDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    var CAL_ICO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    function payCalStateHtml(kind) {
        if (kind === 'loading') return '<div class="pfpc-state"><span class="pfcv-spin"></span><span>Уточняем даты выплат на Мосбирже…</span></div>';
        var conf = kind === 'nodata'
            ? { t: 'Пока не считается', s: 'Не нашли даты погашения по вашим облигациям — попробуйте обновить страницу чуть позже.' }
            : { t: 'Пока нечего показывать', s: 'Добавьте облигации в любой портфель — здесь появится график ближайших купонных выплат.' };
        return '<div class="pfpc-state"><div class="pfpc-state-art">' + CAL_ICO_SVG + '</div>' +
            '<div class="pfpc-state-t">' + conf.t + '</div><div class="pfpc-state-s">' + conf.s + '</div></div>';
    }
    function payCalRowHtml(ev, multiPf) {
        return '<div class="pfpc-row">' +
            '<div class="pfpc-date"><b>' + ruDate(dateToIso(ev.date)) + '</b><span>' + daysUntilText(ev.date) + '</span></div>' +
            '<div class="pfpc-id"><span class="pfpc-tk">' + esc(ev.ticker) + '</span><span class="pfpc-nm">' + esc(ev.name) + '</span></div>' +
            (multiPf ? '<span class="pfpc-pf" style="--c:' + ev.pfColor + '"><i></i>' + esc(ev.pfName) + '</span>' : '<span></span>') +
            '<div class="pfpc-amt">+' + fmtRub(ev.amount) + '</div>' +
        '</div>';
    }
    // Единый календарь: ближайшие купоны по облигациям ВСЕХ портфелей сразу (не по одному —
    // раньше доход по купонам был виден только внутри карточки ребалансировки ОДНОГО портфеля).
    // asCell=true → карточка встаёт ЯЧЕЙКОЙ в сетку портфелей (нечётное их число): высота
    // равна карточке портфеля, список скроллится внутри (см. .pf-paycal--cell в CSS).
    function paymentCalendarHtml(asCell) {
        if (!store.items.length) return '';
        var cls = 'dash2-card pf-card2 pf-paycal' + (asCell ? ' pf-paycal--cell' : '');
        var held = allHeldBonds();
        var head = pfCardHead('', 'Календарь выплат', 'ближайшие купоны по облигациям всех портфелей');
        if (!held.length) return '<div class="' + cls + '">' + head + payCalStateHtml('nobonds') + '</div>';
        var missing = held.some(function (x) { return !bondDetail(x.h.ticker); });
        if (missing) ensureAllBondDetails(function () { softRerender(); });
        var evs = collectUpcomingCoupons();
        if (!evs.length) return '<div class="' + cls + '">' + head + payCalStateHtml(missing ? 'loading' : 'nodata') + '</div>';
        // в режиме ячейки список скроллится внутри — лимит не нужен, показываем всё сразу
        var LIMIT = 6, multiPf = store.items.length > 1;
        // при 2 или 4 портфелях сразу видно много карточек — календарь сворачиваем до
        // ближайшей даты выплаты (если на неё приходится сразу несколько купонов —
        // показываем их все); полный список — по клику на «Показать все»
        var collapseNext = (store.items.length === 2 || store.items.length === 4) && !asCell;
        var shown;
        if (collapseNext && !payCalFull) {
            var d0 = evs[0].date;
            shown = evs.filter(function (e) { return sameCalDay(e.date, d0); });
        } else {
            shown = (payCalFull || asCell) ? evs : evs.slice(0, LIMIT);
        }
        var soonSum = evs.filter(function (e) { return (e.date.getTime() - Date.now()) <= 30 * 86400000; })
            .reduce(function (s, e) { return s + e.amount; }, 0);
        var soon = '<div class="pfpc-soon"><span class="pfpc-soon-l">за 30 дней</span><span class="pfpc-soon-v">+' + fmtRub(soonSum) + '</span></div>';
        var more = (!asCell && evs.length > shown.length) ? '<button class="pfpc-more' + (payCalFull ? ' on' : '') + '" onclick="pfTogglePayCal()">' +
            '<span>' + (payCalFull ? 'Свернуть' : 'Показать все · ' + evs.length) + '</span>' +
            '<svg class="pfpc-more-ch' + (payCalFull ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' : '';
        return '<div class="' + cls + '">' + pfCardHead('', 'Календарь выплат', 'ближайшие купоны по облигациям всех портфелей', soon) +
            '<div class="pfpc-body" onscroll="pfPayCalScroll(this)"><div class="pfpc-list">' + shown.map(function (e) { return payCalRowHtml(e, multiPf); }).join('') + '</div>' + more + '</div>' +
        '</div>';
    }
    window.pfTogglePayCal = function () { payCalFull = !payCalFull; renderPortfolios(); };
    // В режиме ячейки список выплат скроллится внутри карточки — пока ниже есть ещё строки,
    // низ списка плавно затухает (класс has-more + mask в CSS) вместо жёсткого среза
    // последней видимой строки; доскроллили до конца — затухание снимается.
    window.pfPayCalScroll = function (el) {
        if (!el) return;
        var more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
        el.classList.toggle('has-more', more);
    };

    // ====================================================================
    //  ДЕЙСТВИЯ (inline onclick)
    // ====================================================================
    window.pfAddPortfolio = function () {
        if (store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' портфеля на странице', true); return; }
        var p = makePortfolio(); store.items.push(p); saveStore(); openMenu = p.id; renderPortfolios();
    };
    // НКД при импорте из расчёта/ежемесячного дохода: дата покупки = сегодня, поэтому
    // подтягиваем ТЕКУЩИЙ НКД (ACCRUEDINT) из живых данных MOEX и помечаем как «с API»
    // (иконка в поле сразу гаснет). Цена в импорте — чистая, НКД отдельной величиной.
    function autofillNkd(holds) {
        if (typeof fetchBondData !== 'function') return;
        (holds || []).forEach(function (h) {
            if (h.type !== 'bond' || !h.ticker) return;
            var l0 = ensureLots(h)[0]; if (!l0 || l0.nkdFromApi || l0.nkd > 0) return;
            Promise.resolve(fetchBondData(h.ticker)).then(function (r) {
                if (r && r.nkd != null && r.nkd >= 0 && !l0.nkdFromApi) {
                    l0.nkd = Math.round(r.nkd * 100) / 100; l0.nkdFromApi = true; saveStore();
                    if (currentTab === 'portfolios' && dq('pfWrap')) renderPortfolios();
                }
            }).catch(function () {});
        });
    }
    // Импорт: pid задан → добавить в портфель; pid null → новый портфель.
    // source: 'calc' (sub: all/stock/bond) | 'fav' | 'monthly'
    window.pfImport = function (source, sub, pid) {
        closeImpMenus();
        var holds = compositionFrom(source, sub);
        if (!holds || !holds.length) { toast('Нет данных для импорта — выполните расчёт / добавьте избранное', true); return; }
        if (pid) {
            var p = findPf(pid); if (!p) return;
            p.holdings = (p.holdings || []).concat(holds); saveStore(); ensureQuotes(true); renderPortfolios();
            autofillNkd(holds); toast('Добавлено: ' + holds.length); return;
        }
        if (store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' портфеля', true); return; }
        var np = makePortfolio(importName(source)); np.holdings = holds; store.items.push(np); saveStore();
        openMenu = null; ensureQuotes(true); renderPortfolios(); autofillNkd(holds); toast('Импортировано: ' + holds.length);
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

    // ---- бэкап: выгрузка/загрузка всех портфелей в JSON-файл ----
    window.pfExportData = function () {
        closeImpMenus();
        try {
            var json = JSON.stringify(store, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'madame-solomina-portfolios-' + todayStr() + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            toast('Бэкап сохранён · портфелей: ' + store.items.length);
        } catch (e) { toast('Не удалось сохранить файл бэкапа', true); }
    };
    window.pfImportClick = function () { closeImpMenus(); var i = dq('pfBkpInput'); if (i) i.click(); };
    window.pfImportData = function (input) {
        var f = input && input.files && input.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            var ok = false;
            try {
                var obj = JSON.parse(reader.result);
                if (!obj || !Array.isArray(obj.items)) throw new Error('format');
                // лёгкая валидация структуры
                obj.items.forEach(function (p) { if (!p || typeof p !== 'object' || !('holdings' in p) && !p.id) throw new Error('format'); });
                if (!confirm('Заменить текущие портфели (' + store.items.length + ') данными из файла (' + obj.items.length + ')? Действие перезапишет локальные данные.')) { input.value = ''; return; }
                store = obj; if (!store.v) store.v = 1;
                (store.items || []).forEach(function (p) { (p.holdings || []).forEach(ensureLots); });   // миграция лотов
                saveStore(); openMenu = null; ensureQuotes(true); renderPortfolios();
                ok = true;
                toast('Загружено портфелей: ' + store.items.length);
            } catch (e) { if (!ok) toast('Не удалось прочитать файл бэкапа (неверный формат)', true); }
            input.value = '';
        };
        reader.onerror = function () { toast('Ошибка чтения файла', true); input.value = ''; };
        reader.readAsText(f);
    };
    window.pfToggleMenu = function (pid) {
        if (openMenu === pid) { openMenu = null; menuTall = false; }
        else { openMenu = pid; menuTall = false; menuJustOpened = true; chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; holdsExpand = {}; }
        renderPortfolios();
    };
    // клик по строке актива в мини-таблице → раскрыть/свернуть субданные (дата/цена/НКД).
    // Правим DOM ТОЧЕЧНО (без renderPortfolios): полный ре-рендер заново «рисует» все мини-
    // графики с 1-секундной анимацией линии — на простой разворот строки это выглядит как
    // мигание всей вкладки. Один и тот же актив может быть в мини-таблице И в оверлее — обновляем
    // все совпадающие строки. openRows синхронизирует состояние со следующим полным ре-рендером.
    window.pfToggleAssetRow = function (pid, hid) {
        var willOpen = !openRows[hid];
        if (willOpen) openRows[hid] = true; else delete openRows[hid];
        var p = findPf(pid); if (!p) return;
        var h = findHold(p, hid); if (!h) return;
        var c = calcHold(h);
        var rows = document.querySelectorAll('.pfc-mtr[data-hid="' + hid + '"]');
        Array.prototype.forEach.call(rows, function (row) {
            row.classList.toggle('open', willOpen);
            var ch = row.querySelector('.pfc-mch'); if (ch) ch.classList.toggle('up', willOpen);
            var next = row.nextElementSibling;
            var hasDet = next && next.classList && next.classList.contains('pfc-mdet');
            if (willOpen && !hasDet) {
                var tmp = document.createElement('tbody');
                tmp.innerHTML = pfMiniDetailRowHtml(h, c);
                row.parentNode.insertBefore(tmp.firstChild, row.nextSibling);
            } else if (!willOpen && hasDet) {
                next.parentNode.removeChild(next);
            }
        });
    };
    // график доходности: раскрыть/свернуть. Открыт может быть только один (и не вместе с ⚙).
    window.pfToggleChart = function (pid) {
        if (chartOpen[pid]) { delete chartOpen[pid]; delete chartAssets[pid]; delete chartAssetsFull[pid]; }
        else { chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; holdsExpand = {}; chartOpen[pid] = true; openMenu = null; menuTall = false; }
        renderPortfolios();
        if (chartOpen[pid]) loadPfChart(pid);
    };
    // «раскрытие» вверху карточки: та же панель графика, но сразу с открытыми активами
    window.pfOpenChartAssets = function (pid) {
        if (chartOpen[pid] && chartAssets[pid]) { delete chartOpen[pid]; delete chartAssets[pid]; delete chartAssetsFull[pid]; }
        else { chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; holdsExpand = {}; chartOpen[pid] = true; chartAssets[pid] = true; openMenu = null; menuTall = false; }
        renderPortfolios();
        if (chartOpen[pid]) loadPfChart(pid);
    };
    // «весь состав»: раскрыть/свернуть оверлей со полной таблицей состава (вниз поверх контента)
    window.pfToggleHolds = function (pid) {
        if (holdsExpand[pid]) { delete holdsExpand[pid]; }
        else { holdsExpand = {}; holdsExpand[pid] = true; openMenu = null; menuTall = false; chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; }
        renderPortfolios();
    };
    // «Показать активы»: раскрыть/свернуть таблицу состава под графиком.
    // Тоггл через классы (без полного ре-рендера) — чтобы не сбивать анимацию графика.
    window.pfToggleChartAssets = function (pid) {
        chartAssets[pid] = !chartAssets[pid];
        var on = !!chartAssets[pid];
        var chartEl = dq('pfcvChart-' + pid), card = chartEl ? chartEl.closest('.pf-card') : null;
        if (card) card.classList.toggle('assets-open', on);
        var btn = document.querySelector('.pfcv-assetbtn[data-pid="' + pid + '"]');
        if (btn) {
            btn.classList.toggle('on', on);
            var t = btn.querySelector('.pfcv-assetbtn-t'); if (t) t.textContent = on ? 'Скрыть активы' : 'Показать активы';
            var ch = btn.querySelector('.pfcv-assetbtn-ch'); if (ch) ch.classList.toggle('up', on);
        }
    };
    // «Показать все активы»: снять ограничение высоты (скролл 340px) с таблицы состава под
    // графиком. Тоггл классом (без ре-рендера) — чтобы не сбивать анимацию графика.
    window.pfToggleAssetsFull = function (pid) {
        chartAssetsFull[pid] = !chartAssetsFull[pid];
        var on = !!chartAssetsFull[pid];
        var btn = document.querySelector('.pfcv-assets-more[data-pid="' + pid + '"]');
        if (!btn) return;
        var assets = btn.closest('.pfcv-assets'); if (assets) assets.classList.toggle('full', on);
        btn.classList.toggle('on', on);
        var t = btn.querySelector('.pfcv-assets-more-t');
        if (t) { var c = calcPf(findPf(pid) || { holdings: [] }); t.textContent = on ? 'Свернуть таблицу' : 'Показать все активы · ' + c.hs.length; }
        var ch = btn.querySelector('.pfcv-assets-more-ch'); if (ch) ch.classList.toggle('up', on);
    };
    // наложить/убрать кривую индекса IMOEX за тот же период
    window.pfToggleChartImoex = function (pid) {
        chartImoex[pid] = !chartImoex[pid];
        renderPortfolios();
        loadPfChart(pid);
    };
    // тумблер IMOEX прямо на мини-графике карточки: обновляем ТОЛЬКО эту карточку (класс кнопки
    // + перерисовка её графика через loadPfChart) — без renderPortfolios, иначе заново «рисуются»
    // все мини-графики вкладки и вся вкладка мигает.
    window.pfToggleMiniImoex = function (pid) {
        chartImoex[pid] = !(pid in chartImoex) ? false : !chartImoex[pid];
        var on = !!chartImoex[pid];
        var btn = document.querySelector('.pfc-imtgl[data-pid="' + pid + '"]');
        if (btn) { btn.classList.toggle('on', on); btn.title = on ? 'Скрыть индекс Мосбиржи' : 'Сравнить с индексом Мосбиржи'; }
        loadPfChart(pid);
    };
    window.pfToggleMenuTall = function (pid) { if (openMenu === pid) { menuTall = !menuTall; renderPortfolios(); } };
    window.pfCloseMenu = function () { openMenu = null; menuTall = false; renderPortfolios(); };
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
        var tkEl = dq('pfNewTk-' + pid), tyEl = dq('pfNewType-' + pid), dEl = dq('pfNewDate-' + pid),
            prEl = dq('pfNewPrice-' + pid), nkEl = dq('pfNewNkd-' + pid), qEl = dq('pfNewQty-' + pid);
        var tk = (tkEl && tkEl.value || '').trim().toUpperCase();
        if (!tk) { toast('Введите тикер', true); if (tkEl) try { tkEl.focus(); } catch (e) {} return; }
        var type = (tyEl && tyEl.value) === 'bond' ? 'bond' : 'stock';
        var date = (dEl && dEl.value) || todayStr();
        var price = Math.max(0, toNum(prEl && prEl.value) || 0);
        var qty = Math.max(0, Math.round(toNum(qEl && qEl.value) || 0));
        var nkd = type === 'bond' ? Math.max(0, toNum(nkEl && nkEl.value) || 0) : 0;
        var lot = { id: genId('l'), buyDate: date, buyPrice: price, qty: qty, nkd: nkd, priceFromApi: false, nkdFromApi: false };
        p.holdings = p.holdings || [];
        // тот же тикер уже в портфеле (того же типа) → ДОКУПКА: добавляем лот к активу
        var exist = p.holdings.filter(function (x) { return x.ticker === tk && x.type === type; })[0];
        if (exist) { ensureLots(exist).push(lot); openLots[exist.id] = true; toast(tk + ': докуплено · +лот'); }
        else {
            // потенциал акции фиксируем на дату покупки (текущий ОДХС) — для карточки ребалансировки
            var pot = type === 'stock' ? potentialOf(tk) : null;
            p.holdings.push({ id: genId('h'), ticker: tk, name: tk, type: type, lots: [lot], potAtBuy: pot });
        }
        saveStore(); ensureQuotes(true); renderPortfolios();
        // фокус обратно на поле тикера для быстрого ввода следующего актива
        var ni = dq('pfNewTk-' + pid); if (ni) try { ni.focus(); } catch (e) {}
    };
    // Тип в форме добавления: показываем поле НКД только для облигаций (без ре-рендера —
    // чтобы не потерять уже введённые значения).
    window.pfAddTypeToggle = function (pid) {
        var f = dq('pfAddForm-' + pid), ty = dq('pfNewType-' + pid);
        if (f && ty) f.setAttribute('data-type', ty.value === 'bond' ? 'bond' : 'stock');
    };
    // Подтянуть цену/НКД закрытия MOEX на выбранную дату ПРЯМО в форму добавления.
    // Пишем значение в input напрямую (без renderPortfolios), иначе введённые поля сбросятся.
    window.pfAddFetch = function (pid, field, ev) {
        var btn = ev && ev.currentTarget;
        var tk = ((dq('pfNewTk-' + pid) || {}).value || '').trim().toUpperCase();
        var date = (dq('pfNewDate-' + pid) || {}).value || '';
        var type = ((dq('pfNewType-' + pid) || {}).value) === 'bond' ? 'bond' : 'stock';
        if (!tk) { toast('Сначала введите тикер', true); return; }
        if (!date) { toast('Укажите дату покупки', true); return; }
        if (field === 'nkd' && type !== 'bond') return;
        var input = dq(field === 'nkd' ? 'pfNewNkd-' + pid : 'pfNewPrice-' + pid);
        if (btn) { btn.classList.remove('lit', 'done'); btn.classList.add('loading'); btn.innerHTML = '<span class="pfm-fx-sp"></span>'; }
        function fin(v) {
            if (btn) btn.classList.remove('loading');
            if (v != null && v >= 0) {
                if (input) input.value = Math.round(v * 100) / 100;
                if (btn) { btn.classList.add('done'); btn.innerHTML = FETCH_SVG;
                    btn.title = (field === 'nkd' ? 'НКД' : 'Цена') + ' закрытия на ' + ruDate(date) + ' · нажмите, чтобы обновить'; }
                toast(tk + ': ' + (field === 'nkd' ? 'НКД ' : '') + fmtPrice(v) + ' на ' + ruDate(date));
            } else {
                if (btn) { btn.classList.add('lit'); btn.innerHTML = FETCH_SVG; }
                toast('Нет ' + (field === 'nkd' ? 'НКД' : 'цены') + ' ' + tk + ' на ' + ruDate(date), true);
            }
        }
        if (field === 'nkd') lookupHistNkd(tk, date, fin);
        else lookupHistPrice(tk, type, date, function (p) { fin(p && p > 0 ? p : null); });
    };
    window.pfRemoveHolding = function (pid, hid) {
        var p = findPf(pid); if (!p) return;
        p.holdings = (p.holdings || []).filter(function (h) { return h.id !== hid; }); saveStore(); renderPortfolios();
    };
    window.pfEdit = function (pid, hid, field, val) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        if (field === 'ticker') {
            h.ticker = (val || '').trim().toUpperCase(); h.name = h.ticker;
            // сменился тикер → старые цены/НКД лотов не на этот тикер: гасим флаги «с API»
            ensureLots(h).forEach(function (l) { l.priceFromApi = false; l.nkdFromApi = false;
                delete loadStatus[l.id + ':price']; delete loadStatus[l.id + ':nkd']; });
        }
        saveStore(); ensureQuotes(); renderPortfolios();
    };
    // ---- журнал лотов: правка/добавление/удаление отдельных покупок ----
    function findLot(h, lotId) { var ls = ensureLots(h); for (var i = 0; i < ls.length; i++) if (ls[i].id === lotId) return ls[i]; return null; }
    window.pfEditLot = function (pid, hid, lotId, field, val) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        var l = findLot(h, lotId); if (!l) return;
        if (field === 'buyDate') { l.buyDate = val; l.priceFromApi = false; l.nkdFromApi = false; delete loadStatus[lotId + ':price']; delete loadStatus[lotId + ':nkd']; }
        else if (field === 'buyPrice') { l.buyPrice = Math.max(0, toNum(val) || 0); l.priceFromApi = false; delete loadStatus[lotId + ':price']; }
        else if (field === 'nkd') { l.nkd = Math.max(0, toNum(val) || 0); l.nkdFromApi = false; delete loadStatus[lotId + ':nkd']; }
        else if (field === 'qty') { l.qty = Math.max(0, Math.round(toNum(val) || 0)); }
        saveStore(); ensureQuotes(); renderPortfolios();
    };
    window.pfAddLot = function (pid, hid) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        ensureLots(h).push({ id: genId('l'), buyDate: todayStr(), buyPrice: 0, qty: 0, nkd: 0, priceFromApi: false, nkdFromApi: false });
        openLots[hid] = true; saveStore(); renderPortfolios();
    };
    window.pfRemoveLot = function (pid, hid, lotId) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        var ls = ensureLots(h);
        if (ls.length <= 1) return;   // последний лот не удаляем — есть «Удалить актив»
        h.lots = ls.filter(function (l) { return l.id !== lotId; });
        saveStore(); ensureQuotes(); renderPortfolios();
    };
    window.pfToggleLots = function (pid, hid) { openLots[hid] = !openLots[hid]; renderPortfolios(); };
    // Подтянуть цену/НКД закрытия на дату КОНКРЕТНОГО лота
    window.pfFetchLotField = function (pid, hid, lotId, field) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid);
        if (!h || !h.ticker) { toast('Сначала укажите тикер', true); return; }
        var l = findLot(h, lotId); if (!l) return;
        if (!l.buyDate) { toast('Укажите дату лота', true); return; }
        if (field === 'nkd' && h.type !== 'bond') return;
        loadStatus[lotId + ':' + field] = 'loading'; renderPortfolios();
        var done = function (v) {
            var cp = findPf(pid), ch = cp && findHold(cp, hid), cl = ch && findLot(ch, lotId);
            if (!cl) return;
            delete loadStatus[lotId + ':' + field];
            if (v != null && v >= 0) {
                if (field === 'nkd') { cl.nkd = Math.round(v * 100) / 100; cl.nkdFromApi = true; }
                else { cl.buyPrice = Math.round(v * 100) / 100; cl.priceFromApi = true; }
                saveStore(); renderPortfolios();
                toast(h.ticker + ': ' + (field === 'nkd' ? 'НКД ' : '') + fmtPrice(v) + ' на ' + ruDate(cl.buyDate));
            } else { renderPortfolios(); toast('Нет ' + (field === 'nkd' ? 'НКД' : 'цены') + ' ' + h.ticker + ' на ' + ruDate(l.buyDate), true); }
        };
        if (field === 'nkd') lookupHistNkd(h.ticker, l.buyDate, done);
        else lookupHistPrice(h.ticker, h.type, l.buyDate, function (price) { done(price && price > 0 ? price : null); });
    };
    // Подтянуть цену (акция/облигация — чистая цена закрытия) или НКД (облигация) на дату покупки.
    window.pfFetchField = function (pid, hid, field) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid);
        if (!h || !h.ticker) { toast('Сначала укажите тикер', true); return; }
        if (!h.buyDate) { toast('Укажите дату покупки', true); return; }
        if (field === 'nkd' && h.type !== 'bond') return;
        loadStatus[hid + ':' + field] = 'loading'; renderPortfolios();
        var done = function (v) {
            var cur = findHold(findPf(pid) || {}, hid); if (!cur) return;
            delete loadStatus[hid + ':' + field];
            if (v != null && v >= 0) {
                if (field === 'nkd') { cur.nkd = Math.round(v * 100) / 100; cur.nkdFromApi = true; }
                else { cur.buyPrice = Math.round(v * 100) / 100; cur.priceFromApi = true; }
                saveStore(); renderPortfolios();
                toast(cur.ticker + ': ' + (field === 'nkd' ? 'НКД ' : '') + fmtPrice(v) + ' на ' + ruDate(cur.buyDate));
            } else {
                renderPortfolios();
                toast('Нет ' + (field === 'nkd' ? 'НКД' : 'цены') + ' ' + cur.ticker + ' на ' + ruDate(cur.buyDate), true);
            }
        };
        if (field === 'nkd') lookupHistNkd(h.ticker, h.buyDate, done);
        else lookupHistPrice(h.ticker, h.type, h.buyDate, function (price) { done(price && price > 0 ? price : null); });
    };
    window.pfOpenTicker = function (tk) { if (typeof window.openStockDetail === 'function') { try { window.openStockDetail(tk, 1); } catch (e) {} } };
    // Инлайн-правка имени портфеля: клик по названию → поле ввода на месте (Enter/blur — сохранить, Esc — отмена)
    window.pfNameEdit = function (pid, ev) {
        if (ev) { ev.stopPropagation(); }
        var p = findPf(pid); if (!p) return;
        var host = ev && ev.currentTarget; if (!host || host._editing) return;
        host._editing = true;
        var inp = document.createElement('input');
        inp.className = 'pfc-name-edit'; inp.value = p.name; inp.maxLength = 40;
        host.innerHTML = ''; host.appendChild(inp);
        try { inp.focus(); inp.select(); } catch (e) {}
        var committed = false;
        function commit(save) {
            if (committed) return; committed = true;
            if (save) { var v = (inp.value || '').trim(); if (v) { p.name = v; saveStore(); } }
            renderPortfolios();
        }
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(true); }
            else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
        });
        inp.addEventListener('blur', function () { commit(true); });
    };

    // ====================================================================
    //  КАРТОЧКА РЕБАЛАНСИРОВКИ (R5) — модалка поверх контента (в <body>)
    //  Дизайн «Главной» (стеклянная карточка, Inter, минимум шума).
    //  Слева облигации, справа акции; в каждой колонке: «продать» (мой
    //  портфель) | «купить» (рынок из гугл-таблицы) и расчёт обмена.
    //  Суть: обмен облигаций имеет смысл, только если растёт суммарная
    //  прибыль в день (машина денег) — карточка показывает это до/после.
    // ====================================================================
    window.pfExpand = function (pid) {
        var p = findPf(pid); if (!p) return;
        rebalPick = { bond: { sell: null, buy: null, qty: null }, stock: { sell: null, buy: null, qty: null } };
        ensureQuotes(true);
        if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }   // эшелоны/потенциал акций
        var ov = dq('pfOverlay');
        if (!ov) { ov = document.createElement('div'); ov.id = 'pfOverlay'; document.body.appendChild(ov);
            ov.addEventListener('click', function (e) { if (e.target === ov) window.pfCloseOverlay(); }); }
        ov.dataset.pid = pid;
        ov.innerHTML = overlayHtml(p, true);
        // догружаем купоны/погашения (мои облигации + список ОФЗ из таблицы) → перерисовать
        ensureBondDetails(p, function () {
            var o = dq('pfOverlay'); if (o && o.dataset.pid === pid && o.classList.contains('show')) rebalRepaint();
        });
        ov.classList.add('show'); document.body.classList.add('pf-modal-open');
        document.addEventListener('keydown', pfEscClose);
    };
    // Перерисовка карточки (выбор бумаги, смена параметров, догрузка данных) с сохранением
    // скролла тела и списков: innerHTML пересобирает всё с нуля, без этого списки «прыгают».
    // Анимация входа не переигрывается (pfo-anim-in только в pfExpand) — карточка не мигает.
    function rebalRepaint() {
        var ov = dq('pfOverlay'); if (!ov || !ov.classList.contains('show')) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var body = ov.querySelector('.rb5-body'), bodyTop = body ? body.scrollTop : 0;
        var listTops = [].map.call(ov.querySelectorAll('.rb5-list-scroll'), function (el) { return el.scrollTop; });
        ov.innerHTML = overlayHtml(p);
        var nb = ov.querySelector('.rb5-body'); if (nb) nb.scrollTop = bodyTop;
        [].forEach.call(ov.querySelectorAll('.rb5-list-scroll'), function (el, i) { if (listTops[i] != null) el.scrollTop = listTops[i]; });
    }
    // Догрузка деталей купонов (купон/частота/погашение): облигации портфеля + список ОФЗ
    // из таблицы — без них не посчитать прибыль в день у кандидатов на покупку.
    function ensureBondDetails(p, cb) {
        var need = (p.holdings || []).filter(function (h) { return h.type === 'bond' && h.ticker && !bondDetail(h.ticker); })
            .map(function (h) { return h.ticker; });
        ofzMarket().forEach(function (b) { if (b.t && !bondDetail(b.t)) need.push(b.t); });
        if (!need.length || typeof fetchBondData !== 'function') { cb(); return; }
        var left = need.length;
        need.forEach(function (tk) {
            Promise.resolve(fetchBondData(tk)).catch(function () {}).then(function () { if (--left <= 0) cb(); });
        });
    }
    window.pfCloseOverlay = function () {
        var ov = dq('pfOverlay'); if (ov) ov.classList.remove('show');
        document.body.classList.remove('pf-modal-open'); document.removeEventListener('keydown', pfEscClose);
    };
    function pfEscClose(e) { if (e.key === 'Escape') window.pfCloseOverlay(); }

    // ---------- параметры ----------
    var rebalTax = 0;            // ставка НДФЛ в расчётах (0 / 0.13 / 0.15)
    var rebalPeriod = 'day';     // период метрики прибыли: 'day' | 'week' | 'month'
    var PERIODS = { day: ['в день', 1], week: ['в неделю', 7], month: ['в месяц', 30] };
    // выбранный обмен: sell — id актива портфеля, buy — тикер/ISIN с рынка, qty — сколько
    // продать (null → подставится предложение «продать столько, чтобы штук стало больше»)
    var rebalPick = { bond: { sell: null, buy: null, qty: null }, stock: { sell: null, buy: null, qty: null } };
    try {
        var _rp = JSON.parse(localStorage.getItem('pf_rebal_params') || '{}');
        if (_rp.tax != null) rebalTax = +_rp.tax;
        if (PERIODS[_rp.per]) rebalPeriod = _rp.per;
    } catch (e) {}
    function saveRebalParams() { try { localStorage.setItem('pf_rebal_params', JSON.stringify({ tax: rebalTax, per: rebalPeriod })); } catch (e) {} }
    function f2(n) { return (n == null || !isFinite(n)) ? '—' : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function perMul() { return PERIODS[rebalPeriod][1]; }
    function perLbl() { return PERIODS[rebalPeriod][0]; }
    // короткая дата ДД.ММ.ГГГГ из строки MOEX (YYYY-MM-DD)
    function ruDate2(s) { if (!s || s === '—') return '—'; var pp = String(s).split('T')[0].split('-'); return pp.length === 3 ? pp[2] + '.' + pp[1] + '.' + pp[0] : s; }
    // короткий ключ ISIN: портфель хранит «SU26238», рынок — полный «SU26238RMFS4»
    function isinKey(t) { return String(t || '').split('RMFS')[0]; }

    // ---------- экономика облигаций («машина денег») ----------
    // Прибыль облигации при удержании до погашения:
    //   доход   = оставшиеся купоны (купон × выплат/год × дней ÷ 365) + номинал 1000 ₽ + НКД сейчас
    //   расход  = цена + НКД (для моих — средние по покупкам, для рыночных — текущие) + НДФЛ с прибыли
    //   прибыль/день = (доход − расход) ÷ дней до погашения;  годовых = ×365 ÷ расход
    function bondEconAt(det, costUnit, nkdNow) {
        if (!det || !(costUnit > 0)) return null;
        var mat = parseBondDate(det.matDate); if (!mat) return null;
        var days = (mat.getTime() - Date.now()) / 86400000; if (!(days > 0)) return null;
        var income = (+det.couponValue || 0) * (+det.freq || 0) * days / 365 + 1000 + (nkdNow || 0);
        var tax = Math.max(0, income - costUnit) * (rebalTax || 0);
        var profit = income - costUnit - tax;
        return { perDay: profit / days, annual: profit / days * 365 / (costUnit + tax) * 100,
            days: Math.round(days), matDate: det.matDate };
    }
    // Моя облигация: доходность из портфеля (средние цена/НКД покупки по лотам) + текущие
    // цена/НКД с MOEX (unitNow — выручка за 1 шт при продаже прямо сейчас)
    function bondHeld(h) {
        var a = aggHolding(h);
        var nkdNow = curNkdOf(h.ticker); if (nkdNow == null) nkdNow = a.nkd || 0;
        var price = bondQuotes[h.ticker] > 0 ? bondQuotes[h.ticker] : (a.avgPrice || 0);
        var econ = bondEconAt(bondDetail(h.ticker), (a.avgPrice || 0) + (a.nkd || 0), nkdNow);
        return { h: h, qty: a.qty || 0, avgDate: a.avgDate, unitNow: price + nkdNow, econ: econ };
    }
    // Список ОФЗ из гугл-таблицы — ТОТ ЖЕ источник, что вкладка «ОФЗ» раздела «Ребаланс»
    // (data.js: bonds[]): t=ISIN, n=имя, p/y — цена и доходность из таблицы; цена уточняется
    // живой с MOEX (bondDataCache), НКД/погашение — из fetchBondDetailsInBackground.
    function ofzMarket() {
        try {
            if (typeof bonds !== 'undefined' && bonds && bonds.length) {
                return bonds.map(function (b) {
                    var live = null;
                    try { if (typeof bondDataCache !== 'undefined' && bondDataCache[b.t] && bondDataCache[b.t].price > 0) live = +bondDataCache[b.t].price; } catch (e) {}
                    return { t: b.t, n: b.n || b.t,
                        price: live || parseFloat(String(b.p).replace(',', '.')) || 0,
                        nkd: parseFloat(b.nkd || 0) || 0,
                        sheetYield: toNum(b.y), matDate: b.matDate };
                });
            }
        } catch (e) {}
        return [];
    }
    // Кандидат на покупку: цена+НКД сейчас = расход, дальше та же экономика, что у моих
    function ofzCand(b) {
        var unit = b.price + b.nkd;
        var econ = bondEconAt(bondDetail(b.t), unit, b.nkd);
        return { t: b.t, n: b.n, unit: unit, sheetYield: b.sheetYield,
            matDate: (econ && econ.matDate) || b.matDate, econ: econ };
    }
    // Суммарная прибыль в день по всем облигациям портфеля + штук; pending — купоны грузятся
    function bondsTotal(bs) {
        var total = 0, units = 0, pending = false;
        bs.forEach(function (x) {
            var r = bondHeld(x.h); if (!(r.qty > 0)) return;
            units += r.qty;
            if (r.econ) total += r.econ.perDay * r.qty; else pending = true;
        });
        return { total: total, units: units, pending: pending };
    }
    // Сколько продать, чтобы купить хотя бы на 1 бумагу БОЛЬШЕ (продал 200 → купил 202):
    // минимальное n, при котором floor(n × выручка-за-шт ÷ цена-новой-с-НКД) ≥ n + 1.
    // null — новая бумага не дешевле: больше штук не выйдет ни при каком n.
    function bondQtyFor1More(unitS, unitB, maxQty) {
        if (!(unitS > 0) || !(unitB > 0) || unitS <= unitB) return null;
        for (var n = 1; n <= maxQty; n++) if (Math.floor(n * unitS / unitB) >= n + 1) return n;
        return null;
    }
    // Полный расчёт обмена облигаций: продаём qty своих (цена+НКД сейчас) → покупаем новые
    // (цена+НКД сейчас); прибыль в день и штук считаем по всему портфелю ДО и ПОСЛЕ
    function bondDeal(r, cand, bs) {
        if (!r || !cand || !(r.qty > 0) || !(r.unitNow > 0) || !(cand.unit > 0)) return null;
        var suggest = bondQtyFor1More(r.unitNow, cand.unit, r.qty);
        var qty = rebalPick.bond.qty != null ? clamp(Math.round(rebalPick.bond.qty), 1, r.qty) : (suggest || r.qty);
        var proceeds = qty * r.unitNow;
        var buyQty = Math.floor(proceeds / cand.unit);
        var t = bondsTotal(bs);
        var after = (r.econ && cand.econ && !t.pending) ? t.total - qty * r.econ.perDay + buyQty * cand.econ.perDay : null;
        return { qty: qty, maxQty: r.qty, suggest: suggest, proceeds: proceeds, buyQty: buyQty,
            rest: proceeds - buyQty * cand.unit,
            unitsBefore: t.units, unitsAfter: t.units - qty + buyQty,
            dayBefore: t.pending ? null : t.total, dayAfter: after };
    }

    // ---------- акции ----------
    var ROMAN = ['I', 'II', 'III', 'IV'];
    // Эшелон тикера: колонка «ЭШЕЛОН» таблицы акций (вкладка «Акции») → колонка таблицы
    // эшелонов раздела «Ребаланс»; 0 — не определён
    function echelonOf(ticker) {
        if (typeof window.stkFindCompany === 'function') {
            try { var co = window.stkFindCompany(ticker);
                if (co && co.main) { var e = parseInt(co.main['ЭШЕЛОН'], 10); if (e >= 1 && e <= 4) return e; } } catch (e1) {}
        }
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    var col = echelonTableData[ci] || [];
                    for (var i = 0; i < col.length; i++) if (col[i] && col[i].t === ticker) return ci + 1;
                }
            }
        } catch (e2) {}
        return 0;
    }
    // Потенциал акции: зафиксированный на дату покупки (h.potAtBuy) → текущий ОДХС → target эшелона
    function holdPotential(h) {
        if (h.potAtBuy != null && isFinite(+h.potAtBuy)) return +h.potAtBuy;
        var p = potentialOf(h.ticker); if (p != null) return p;
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    var col = echelonTableData[ci] || [];
                    for (var i = 0; i < col.length; i++) if (col[i] && col[i].t === h.ticker) { var t = toNum(col[i].target); if (isFinite(t)) return t; }
                }
            }
        } catch (e) {}
        return null;
    }
    // цена акции для расчётов: живой MOEX → таблица акций
    function stkPriceOf(tk) {
        if (quotes[tk] && quotes[tk].price > 0) return quotes[tk].price;
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(tk);
            if (co && co.main) { var p = toNum(co.main['Текущая Цена']); if (isFinite(p) && p > 0) return p; }
        }
        return 0;
    }
    // Кандидаты на покупку: потенциальные акции из гугл-таблицы (4 колонки-эшелона раздела
    // «Ребаланс»), без уже купленных; ech ≥ 1 — только тот же эшелон, что у продаваемой
    function stockCands(heldSet, ech) {
        var arr = [];
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    (echelonTableData[ci] || []).forEach(function (a) {
                        if (!a || !a.t || (heldSet && heldSet[a.t])) return;
                        var pot = toNum(a.target); if (!isFinite(pot)) return;
                        arr.push({ ticker: a.t, name: a.n || a.t, ech: ci + 1, pot: pot });
                    });
                }
            }
        } catch (e) {}
        if (ech >= 1) arr = arr.filter(function (a) { return a.ech === ech; });
        arr.sort(function (a, b) { return b.pot - a.pot; });
        return arr;
    }
    // Обмен акций: продаём qty по текущей цене → покупаем кандидата; выгода — рост потенциала
    function stockDeal(r, cand) {
        if (!r || !cand || !(r.qty > 0) || !(r.nowPrice > 0)) return null;
        var qty = rebalPick.stock.qty != null ? clamp(Math.round(rebalPick.stock.qty), 1, r.qty) : Math.max(1, Math.round(r.qty / 2));
        var priceN = stkPriceOf(cand.ticker);
        var proceeds = qty * r.nowPrice;
        return { qty: qty, maxQty: r.qty, proceeds: proceeds, priceN: priceN,
            buyQty: priceN > 0 ? Math.floor(proceeds / priceN) : 0,
            potFrom: r.pot, potTo: cand.pot,
            potDelta: (r.pot != null && cand.pot != null) ? cand.pot - r.pot : null };
    }

    // ---------- рендер ----------
    var RB5_ARR = '<svg class="rb5-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
    var UNITS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
    var COIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.5 9.3c0-1.3 1.1-2.1 2.5-2.1s2.5.8 2.5 1.9c0 2.6-5 1.4-5 4 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-2.1"/></svg>';
    var RB5_CHECK = '<span class="rb5-chip">' + CHECK_SVG + '</span>';
    function rb5Head(p, c) {
        var taxes = [[0, '0%'], [0.13, '13%'], [0.15, '15%']];
        return '<div class="rb5-head">' +
            '<div class="rb5-head-t">' +
                '<span class="rb5-eyebrow">Ребалансировка</span>' +
                '<span class="rb5-title">' + esc(p.name) + '</span>' +
                '<span class="rb5-sub">' + c.count + ' ' + plural(c.count, 'актив', 'актива', 'активов') + ' · ' + fmtRub(c.value) + '</span>' +
            '</div>' +
            '<div class="rb5-head-r">' +
                '<div class="rb5-seg rb5-seg--tax"><span class="rb5-seg-l">НДФЛ</span>' + taxes.map(function (o) {
                    return '<button class="rb5-seg-b' + (rebalTax === o[0] ? ' on' : '') + '" onclick="pfSetRebalTax(' + o[0] + ')">' + o[1] + '</button>';
                }).join('') + '</div>' +
                '<button class="rb5-x" onclick="pfCloseOverlay()" aria-label="Закрыть">' + XMARK_SVG + '</button>' +
            '</div>' +
        '</div>';
    }
    function rb5ColHead(kind, name, n, val) {
        return '<div class="rb5-colhead"><span class="rb5-cdot ' + kind + '"></span><b>' + name + '</b>' +
            '<span class="rb5-ccount">' + n + '</span><span class="rb5-cval">' + fmtRub(val) + '</span></div>';
    }
    function rb5Empty(t, s) { return '<div class="rb5-empty"><b>' + esc(t) + '</b><span>' + esc(s) + '</span></div>'; }
    function dealHint(msg) { return '<div class="rb5-deal rb5-deal--hint">' + REBAL_SVG + '<span>' + esc(msg) + '</span></div>'; }
    // дельта-чип «+2 шт» / «−1,20 ₽»
    function rb5Delta(v, unit, fmt) {
        var cls = v > 0 ? 'pos' : (v < 0 ? 'neg' : 'mut');
        return '<span class="rb5-dchip ' + cls + '">' + (v > 0 ? '+' : (v < 0 ? '−' : '±')) + fmt(Math.abs(v)) + unit + '</span>';
    }
    function rb5QtyCtl(kind, qty, max) {
        return '<div class="rb5-qty">' +
            '<button type="button" onclick="pfRbQty(\'' + kind + '\',' + (qty - 1) + ',' + max + ')" aria-label="Меньше">−</button>' +
            '<input type="number" min="1" max="' + max + '" value="' + qty + '" onchange="pfRbQty(\'' + kind + '\',this.value,' + max + ')">' +
            '<button type="button" onclick="pfRbQty(\'' + kind + '\',' + (qty + 1) + ',' + max + ')" aria-label="Больше">+</button>' +
            '<span>из ' + max + ' шт</span></div>';
    }
    // «Машина денег»: суммарная прибыль по облигациям за выбранный период + переключатель
    function machineHtml(t) {
        var segs = [['day', 'день'], ['week', 'неделя'], ['month', 'месяц']];
        return '<div class="rb5-machine">' +
            '<div class="rb5-mch-top"><span class="rb5-label">Прибыль по облигациям</span>' +
                '<div class="rb5-seg">' + segs.map(function (s) {
                    return '<button class="rb5-seg-b' + (rebalPeriod === s[0] ? ' on' : '') + '" onclick="pfSetRebalPeriod(\'' + s[0] + '\')">' + s[1] + '</button>';
                }).join('') + '</div></div>' +
            '<div class="rb5-mch-val"><b>' + (t.pending ? '…' : f2(t.total * perMul())) + '</b><span>₽ ' + perLbl() + '</span></div>' +
            '<div class="rb5-mch-sub">' + (t.pending ? 'уточняем купоны на Мосбирже…'
                : t.units + ' ' + plural(t.units, 'облигация', 'облигации', 'облигаций') + ' · купоны + номинал + НКД − затраты, на дни до погашения') + '</div>' +
        '</div>';
    }
    // строка моей облигации: имя + кол-во/погашение | доходность годовых из портфеля
    function bondRowHtml(x) {
        var r = bondHeld(x.h), e = r.econ, sel = rebalPick.bond.sell === x.h.id;
        var val = e ? '<b class="' + (e.annual >= 0 ? 'pos' : 'neg') + '">' + fmtPct(e.annual) + '</b><span>годовых</span>'
                    : '<b class="mut">…</b><span>считаем</span>';
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" onclick="pfPickBond(\'sell\',\'' + x.h.id + '\')">' +
            '<div class="rb5-rid"><b>' + esc(x.h.name || x.h.ticker) + (sel ? RB5_CHECK : '') + '</b>' +
                '<span>' + r.qty + ' шт' + (e ? ' · до ' + ruDate2(e.matDate) : '') + '</span></div>' +
            '<div class="rb5-rval">' + val + '</div>' +
        '</div>';
    }
    // строка ОФЗ из таблицы: имя + цена с НКД/погашение | доходность из таблицы
    function ofzRowHtml(cd, heldSet) {
        var sel = rebalPick.bond.buy === cd.t;
        var meta = (cd.unit > 0 ? fmtPrice(cd.unit) + ' с НКД' : '') +
            (cd.matDate && cd.matDate !== '—' ? (cd.unit > 0 ? ' · ' : '') + 'до ' + ruDate2(cd.matDate) : '');
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" onclick="pfPickBond(\'buy\',\'' + esc(cd.t) + '\')">' +
            '<div class="rb5-rid"><b>' + esc(cd.n) + (heldSet[isinKey(cd.t)] ? '<i class="rb5-own">в портфеле</i>' : '') + (sel ? RB5_CHECK : '') + '</b>' +
                '<span>' + (meta || esc(cd.t)) + '</span></div>' +
            '<div class="rb5-rval"><b class="pos">' + (isFinite(cd.sheetYield) ? cd.sheetYield.toFixed(1).replace('.', ',') + '%' : '—') + '</b><span>доходность</span></div>' +
        '</div>';
    }
    // расчёт обмена облигаций: продать N шт → купить M шт + прибыль/штук ДО → ПОСЛЕ + вердикт
    function bondDealHtml(mine, cands) {
        var pick = rebalPick.bond, sellX = null, cand = null;
        mine.forEach(function (x) { if (x.h.id === pick.sell) sellX = x; });
        cands.forEach(function (cd) { if (cd.t === pick.buy) cand = cd; });
        if (!sellX && !cand) return dealHint('Выберите облигацию слева (что продать) и справа (что купить) — здесь появится расчёт обмена.');
        if (sellX && !cand) return dealHint('Теперь выберите справа, какую ОФЗ купить на замену.');
        if (!sellX) return dealHint('Выберите слева, какую свою облигацию продать.');
        var d = bondDeal(bondHeld(sellX.h), cand, mine);
        if (!d) return dealHint('Недостаточно данных для расчёта — попробуйте другую пару.');
        var flow = '<div class="rb5-deal-flow">' +
            '<div class="rb5-deal-side"><i>Продать</i><b>' + esc(sellX.h.name || sellX.h.ticker) + '</b>' +
                rb5QtyCtl('bond', d.qty, d.maxQty) +
                '<small>≈ ' + fmtRub(d.proceeds) + ' с НКД</small></div>' +
            RB5_ARR +
            '<div class="rb5-deal-side"><i>Купить</i><b>' + esc(cand.n) + '</b>' +
                '<div class="rb5-deal-n">' + d.buyQty + ' шт</div>' +
                '<small>' + (d.rest > 0.005 ? 'останется ' + fmtPrice(d.rest) : '&nbsp;') + '</small></div>' +
        '</div>';
        var note = d.suggest == null
            ? '<div class="rb5-note warn">' + CHART_WARN_SVG + '<span>Новая бумага не дешевле вашей — купить больше штук, чем продали, не выйдет.</span></div>'
            : (d.qty === d.suggest ? '<div class="rb5-note">Минимум для «купить больше, чем продал»: ' + d.suggest + ' шт.</div>' : '');
        var rows = '<div class="rb5-vrow"><span class="rb5-vico">' + UNITS_SVG + '</span><span class="rb5-vlabel">Облигаций всего</span><b>' + d.unitsBefore + ' → ' + d.unitsAfter + '</b>' +
            rb5Delta(d.unitsAfter - d.unitsBefore, ' шт', function (v) { return String(v); }) + '</div>';
        var verdict = '';
        if (d.dayBefore != null && d.dayAfter != null) {
            var per = perMul(), dd = (d.dayAfter - d.dayBefore) * per;
            rows += '<div class="rb5-vrow"><span class="rb5-vico">' + COIN_SVG + '</span><span class="rb5-vlabel">Прибыль ' + perLbl() + '</span><b>' + f2(d.dayBefore * per) + ' → ' + f2(d.dayAfter * per) + ' ₽</b>' +
                rb5Delta(dd, ' ₽', f2) + '</div>';
            verdict = dd > 0
                ? '<div class="rb5-verdict ok">' + CHECK_SVG + '<span>Прибыль растёт — обмен имеет смысл, машина денег разгоняется</span></div>'
                : '<div class="rb5-verdict bad">' + XMARK_SVG + '<span>Прибыль ' + perLbl() + ' снизится — такой обмен смысла не имеет</span></div>';
        } else {
            rows += '<div class="rb5-vrow"><span class="rb5-vico">' + COIN_SVG + '</span><span class="rb5-vlabel">Прибыль ' + perLbl() + '</span><b>уточняем купоны…</b></div>';
        }
        return '<div class="rb5-deal">' + flow + note + '<div class="rb5-vbox">' + rows + '</div>' + verdict + '</div>';
    }
    function rb5BondCol(bs, c) {
        var head = rb5ColHead('bond', 'Облигации', bs.length, c.bondVal);
        if (!bs.length) return '<div class="rb5-col">' + head + rb5Empty('Нет облигаций', 'Добавьте облигации в портфель — здесь появится их доходность и обмен.') + '</div>';
        // мои — по доходности годовых (лучшие сверху), рынок — по доходности из таблицы
        var mine = bs.slice().sort(function (a, b) {
            var ea = bondHeld(a.h).econ, eb = bondHeld(b.h).econ;
            return (eb ? eb.annual : -1e9) - (ea ? ea.annual : -1e9);
        });
        var heldSet = {}; bs.forEach(function (x) { heldSet[isinKey(x.h.ticker)] = 1; });
        // бумаги, уже лежащие в портфеле (в т.ч. выбранная слева на продажу), не должны
        // попадать в список «Купить» справа — иначе можно «обменять» бумагу саму на себя
        // (тот же баг был исправлен для акций через stockCands/heldSet выше)
        var cands = ofzMarket().map(ofzCand).filter(function (cd) { return !heldSet[isinKey(cd.t)]; }).sort(function (a, b) {
            return (isFinite(b.sheetYield) ? b.sheetYield : -1e9) - (isFinite(a.sheetYield) ? a.sheetYield : -1e9);
        });
        var candRows = cands.length ? cands.map(function (cd) { return ofzRowHtml(cd, heldSet); }).join('')
            : '<div class="rb5-list-empty">Список ОФЗ появится из гугл-таблицы (раздел «Ребаланс»)</div>';
        return '<div class="rb5-col">' + head + machineHtml(bondsTotal(bs)) +
            '<div class="rb5-duo">' +
                '<div class="rb5-list"><div class="rb5-list-h"><b>Продать</b><i>мои · годовых</i></div><div class="rb5-list-scroll">' + mine.map(bondRowHtml).join('') + '</div></div>' +
                '<div class="rb5-list rb5-list--buy"><div class="rb5-list-h"><b>Купить</b><i>таблица ОФЗ</i></div><div class="rb5-list-scroll">' + candRows + '</div></div>' +
            '</div>' +
            bondDealHtml(mine, cands) +
        '</div>';
    }
    // строка моей акции: тикер + эшелон + кол-во/потенциал | динамика с покупки
    function stockRowHtml(x) {
        var sel = rebalPick.stock.sell === x.h.id;
        var izm = x.c.pnlPct || 0, ech = echelonOf(x.h.ticker), pot = holdPotential(x.h);
        var tier = ech ? '<span class="rb5-tier t' + ech + '">' + ROMAN[ech - 1] + '</span>' : '';
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" onclick="pfPickStock(\'sell\',\'' + x.h.id + '\')">' +
            '<div class="rb5-rid"><b>' + esc(x.h.ticker) + tier + (sel ? RB5_CHECK : '') + '</b>' +
                '<span>' + x.c.qty + ' шт · потенциал ' + (pot == null ? '—' : fmtPct(pot)) + '</span></div>' +
            '<div class="rb5-rval"><b class="' + (izm >= 0 ? 'pos' : 'neg') + '">' + fmtPct(izm) + '</b><span>динамика</span></div>' +
        '</div>';
    }
    function stockCandRowHtml(cn) {
        var sel = rebalPick.stock.buy === cn.ticker;
        var price = stkPriceOf(cn.ticker);
        var tier = '<span class="rb5-tier t' + cn.ech + '">' + ROMAN[cn.ech - 1] + '</span>';
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" onclick="pfPickStock(\'buy\',\'' + esc(cn.ticker) + '\')">' +
            '<div class="rb5-rid"><b>' + esc(cn.ticker) + tier + (sel ? RB5_CHECK : '') + '</b>' +
                '<span>' + esc(cn.name) + (price > 0 ? ' · ' + fmtPrice(price) : '') + '</span></div>' +
            '<div class="rb5-rval"><b class="' + (cn.pot >= 0 ? 'pos' : 'neg') + '">' + fmtPct(cn.pot) + '</b><span>потенциал</span></div>' +
        '</div>';
    }
    // расчёт обмена акций: продать N шт → купить M шт + потенциал ДО → ПОСЛЕ + вердикт
    function stockDealHtml(mine, cands) {
        var pick = rebalPick.stock, sellX = null, cand = null;
        mine.forEach(function (x) { if (x.h.id === pick.sell) sellX = x; });
        cands.forEach(function (cn) { if (cn.ticker === pick.buy) cand = cn; });
        if (pick.buy && !cand) pick.buy = null;   // выбранный кандидат выпал из эшелона — сброс
        if (!sellX && !cand) return dealHint('Выберите акцию слева (что продать) и справа (что купить) — здесь появится расчёт обмена.');
        if (sellX && !cand) return dealHint('Теперь выберите справа акцию на замену — показан тот же эшелон, что у продаваемой.');
        if (!sellX) return dealHint('Выберите слева, какую свою акцию продать.');
        var d = stockDeal({ qty: sellX.c.qty, nowPrice: sellX.c.cur || 0, pot: holdPotential(sellX.h) }, cand);
        if (!d) return dealHint('Недостаточно данных для расчёта — попробуйте другую пару.');
        var flow = '<div class="rb5-deal-flow">' +
            '<div class="rb5-deal-side"><i>Продать</i><b>' + esc(sellX.h.ticker) + '</b>' +
                rb5QtyCtl('stock', d.qty, d.maxQty) +
                '<small>≈ ' + fmtRub(d.proceeds) + '</small></div>' +
            RB5_ARR +
            '<div class="rb5-deal-side"><i>Купить</i><b>' + esc(cand.ticker) + '</b>' +
                '<div class="rb5-deal-n">' + (d.buyQty > 0 ? d.buyQty + ' шт' : 'на ' + fmtRub(d.proceeds)) + '</div>' +
                '<small>' + (d.priceN > 0 ? 'по ' + fmtPrice(d.priceN) : '&nbsp;') + '</small></div>' +
        '</div>';
        var rows = '<div class="rb5-vrow"><span class="rb5-vlabel">Потенциал бумаги</span><b>' +
            (d.potFrom == null ? '—' : fmtPct(d.potFrom)) + ' → ' + (d.potTo == null ? '—' : fmtPct(d.potTo)) + '</b>' +
            (d.potDelta != null ? rb5Delta(d.potDelta, ' п.п.', function (v) { return v.toFixed(1).replace('.', ','); }) : '') + '</div>';
        var verdict = d.potDelta == null ? ''
            : (d.potDelta > 0
                ? '<div class="rb5-verdict ok">' + CHECK_SVG + '<span>Потенциал растёт — обмен имеет смысл</span></div>'
                : '<div class="rb5-verdict bad">' + XMARK_SVG + '<span>Потенциал не растёт — такой обмен смысла не имеет</span></div>');
        return '<div class="rb5-deal">' + flow + '<div class="rb5-vbox">' + rows + '</div>' + verdict + '</div>';
    }
    function rb5StockCol(ss, c) {
        var head = rb5ColHead('stock', 'Акции', ss.length, c.stockVal);
        if (!ss.length) return '<div class="rb5-col">' + head + rb5Empty('Нет акций', 'Добавьте акции в портфель — здесь появится их динамика, потенциал и обмен.') + '</div>';
        var mine = ss.slice().sort(function (a, b) { return (b.c.pnlPct || 0) - (a.c.pnlPct || 0); });   // по динамике
        var heldSet = {}; ss.forEach(function (x) { heldSet[x.h.ticker] = 1; });
        var sellX = null; mine.forEach(function (x) { if (x.h.id === rebalPick.stock.sell) sellX = x; });
        var ech = sellX ? echelonOf(sellX.h.ticker) : 0;
        var cands = stockCands(heldSet, ech);
        var candRows = cands.length ? cands.map(stockCandRowHtml).join('')
            : '<div class="rb5-list-empty">' + (ech ? 'Нет потенциальных акций в эшелоне ' + ROMAN[ech - 1] : 'Список появится из гугл-таблицы (раздел «Ребаланс»)') + '</div>';
        return '<div class="rb5-col">' + head +
            '<div class="rb5-duo">' +
                '<div class="rb5-list"><div class="rb5-list-h"><b>Продать</b><i>мои · динамика</i></div><div class="rb5-list-scroll">' + mine.map(stockRowHtml).join('') + '</div></div>' +
                '<div class="rb5-list rb5-list--buy"><div class="rb5-list-h"><b>Купить</b><i>потенциальные' + (ech ? ' · эшелон ' + ROMAN[ech - 1] : '') + '</i></div><div class="rb5-list-scroll">' + candRows + '</div></div>' +
            '</div>' +
            stockDealHtml(mine, cands) +
        '</div>';
    }
    // animate=true — только первое открытие (см. pfExpand); ре-рендеры без анимации,
    // иначе пересоздание карточки на каждый клик заставляет её мигать целиком
    function overlayHtml(p, animate) {
        var c = calcPf(p);
        var bs = c.hs.filter(function (x) { return x.h.type === 'bond'; });
        var ss = c.hs.filter(function (x) { return x.h.type !== 'bond'; });
        return '<div class="pfo-card rb5-card' + (animate ? ' pfo-anim-in' : '') + '">' +
            rb5Head(p, c) +
            '<div class="rb5-body"><div class="rb5-cols">' + rb5BondCol(bs, c) + rb5StockCol(ss, c) + '</div></div>' +
        '</div>';
    }

    // ---------- события ----------
    window.pfSetRebalTax = function (rate) { rebalTax = rate; saveRebalParams(); rebalRepaint(); };
    window.pfSetRebalPeriod = function (per) { if (PERIODS[per]) rebalPeriod = per; saveRebalParams(); rebalRepaint(); };
    // выбор бумаги: клик по своей (side='sell') / рыночной (side='buy'); повторный клик —
    // снять выбор; количество к продаже сбрасывается на предложенное
    window.pfPickBond = function (side, id) { var pk = rebalPick.bond;
        pk[side] = (pk[side] === id) ? null : id; pk.qty = null; rebalRepaint(); };
    window.pfPickStock = function (side, id) { var pk = rebalPick.stock;
        pk[side] = (pk[side] === id) ? null : id; pk.qty = null; rebalRepaint(); };
    window.pfRbQty = function (kind, val, max) {
        var n = Math.round(toNum(val)); if (!isFinite(n)) n = 1;
        rebalPick[kind].qty = clamp(n, 1, max || 1); rebalRepaint();
    };

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
