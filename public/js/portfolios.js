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
    var CARDVIEW_KEY = 'pf_cardview_v1';
    var SNAP_KEY = 'pf_snapshots_v1';   // дневные снимки стоимости портфелей (локальный кэш, в облако не зеркалится)
    var MAX_CARDS = 8;   // лимит СОЗДАНИЯ (по числу цветов палитры); сетка рендерит все видимые
    var ISS = 'https://iss.moex.com/iss/';
    // котировки акций: ВСЕ доски рынка shares одним запросом (не только TQBR — иначе
    // фонды/ETF с TQTF и бумаги с TQTD никогда не получали живой цены); лучшая строка
    // на тикер выбирается по приоритету досок в fetchStockQuotes.
    var SHARES_URL = ISS + 'engines/stock/markets/shares/securities.json' +
        '?iss.meta=off&iss.only=marketdata&marketdata.columns=SECID,BOARDID,LAST,LASTTOPREVPRICE';
    var STK_BOARDS = { TQBR: 3, TQTF: 2, TQTD: 1 };   // приоритет досок (прочие = 0)
    // батч-котировки облигаций: один запрос по всему рынку bonds. LAST приходит в % от
    // номинала — рубли = % × FACEVALUE/100, номиналы забираем из блока securities тем же
    // запросом (у ОФЗ 1000 ₽, у корпоративных бывает другой).
    var BONDS_URL = ISS + 'engines/stock/markets/bonds/securities.json' +
        '?iss.meta=off&iss.only=marketdata,securities&marketdata.columns=SECID,LAST&securities.columns=SECID,FACEVALUE';
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
    // ' тоже экранируем: строки часто попадают в onclick="fn('…')", где
    // одинарная кавычка вырывалась бы из JS-литерала (XSS)
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function attr(s) { return esc(s); }
    // Для данных внутри JS-строки inline-обработчика (onclick="fn('X')"):
    // браузер декодирует &#39; обратно в кавычку ДО исполнения JS, поэтому
    // одного esc() мало — сначала экранируем для JS (\\ и \'), затем esc().
    function jsArg(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
    function toNum(s) { return parseFloat(String(s == null ? '' : s).replace('%', '').replace(/\s/g, '').replace(',', '.')); }
    function genId(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 9); }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function fmtRub(n) { if (n == null || !isFinite(n)) return '—'; var neg = n < 0; n = Math.abs(Math.round(n));
        return (neg ? '−' : '') + n.toLocaleString('ru-RU') + ' ₽'; }
    function fmtPrice(n) { if (n == null || !isFinite(n)) return '—';
        return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'; }
    function fmtPct(n) { if (n == null || !isFinite(n)) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%'; }
    function fmtQty(n) { return (n == null || !isFinite(n)) ? '—' : Math.round(n).toLocaleString('ru-RU'); }
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
    // вид карточки портфеля: 'normal' (вложено · доход · доходность, 2 в ряд) |
    // 'narrow' (доход · доходность, без «Вложено» — уже, 3 в ряд)
    function loadCardView() { try { return localStorage.getItem(CARDVIEW_KEY) === 'normal' ? 'normal' : 'narrow'; } catch (e) { return 'narrow'; } }
    var cardViewMode = loadCardView();

    // ---------- дневные снимки стоимости (pid -> { 'ГГГГ-ММ-ДД': ₽ }) ----------
    // Пишутся при живых котировках (не чаще раза в 5 минут), хранят до 400 дней.
    // Питают чип «▲ X ₽ сегодня» в шапке карточки: изменение к последнему снимку
    // прошлых дней. Локальный кэш устройства — в облако не зеркалится.
    var snaps = (function () { try { var o = JSON.parse(localStorage.getItem(SNAP_KEY)); if (o && typeof o === 'object') return o; } catch (e) {} return {}; })();
    var snapSavedAt = 0;
    function recordSnapshots() {
        if (!quotesTs) return;   // без живых цен снимок был бы ценами покупки
        if (Date.now() - snapSavedAt < 5 * 60000) return;
        snapSavedAt = Date.now();
        var today = todayStr(), changed = false;
        store.items.forEach(function (p) {
            var v = calcPf(p).value;
            if (!(v > 0)) return;
            var m = snaps[p.id] || (snaps[p.id] = {});
            if (m[today] != null && Math.abs(m[today] - v) < 0.5) return;
            m[today] = Math.round(v); changed = true;
            var ks = Object.keys(m).sort();
            while (ks.length > 400) { delete m[ks.shift()]; }
        });
        Object.keys(snaps).forEach(function (pid) { if (!findPf(pid)) { delete snaps[pid]; changed = true; } });
        if (changed) try { localStorage.setItem(SNAP_KEY, JSON.stringify(snaps)); } catch (e) {}
    }
    // Изменение стоимости за сегодня: текущая стоимость − последний снимок прошлых дней
    function dayDelta(p, curValue) {
        var m = snaps[p.id]; if (!m) return null;
        var today = todayStr(), best = null;
        for (var d in m) if (d < today && (best == null || d > best)) best = d;
        if (best == null || !(curValue > 0)) return null;
        return curValue - m[best];
    }
    // Самое сильное дневное движение среди акций портфеля (LASTTOPREVPRICE из котировок)
    function topMover(p) {
        var best = null;
        (p.holdings || []).forEach(function (h) {
            if (h.type === 'bond' || !h.ticker) return;
            var q = quotes[h.ticker]; if (!q || q.chgPct == null) return;
            if (!(aggHolding(h).qty > 0)) return;
            if (!best || Math.abs(q.chgPct) > Math.abs(best.chg)) best = { t: h.ticker, chg: q.chgPct };
        });
        return best;
    }

    function findPf(id) { for (var i = 0; i < store.items.length; i++) if (store.items[i].id === id) return store.items[i]; return null; }
    // скрытые портфели (p.hidden) не показываются в сетке карточек, но продолжают
    // учитываться в суммарном капитале, сводке и календаре выплат — деньги не исчезают
    function visibleItems() { return store.items.filter(function (p) { return !p.hidden; }); }
    function findHold(pf, hid) { var hs = pf.holdings || []; for (var i = 0; i < hs.length; i++) if (hs[i].id === hid) return hs[i]; return null; }
    function colorVal(c) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === c || COLORS[i].v === c) return COLORS[i].v; return c || COLORS[0].v; }

    function makePortfolio(name) {
        var used = {}; store.items.forEach(function (p) { used[p.color] = 1; });
        var col = COLORS[store.items.length % COLORS.length].id;
        for (var i = 0; i < COLORS.length; i++) if (!used[COLORS[i].id]) { col = COLORS[i].id; break; }
        return { id: genId('pf'), name: name || ('Портфель ' + (store.items.length + 1)), color: col, createdAt: Date.now(), holdings: [], cash: 0 };
    }

    // ---------- котировки ----------
    var quotes = {};         // ticker -> { price, chgPct }
    var quotesTs = 0, quotesLoading = false;
    var bondQuotes = {};     // isin -> price (₽), 0 = «не нашли»
    var bondPending = {};
    var bondNkdNow = {};     // isin -> текущий НКД ₽ (ACCRUEDINT), null/undefined = ещё не загружен
    var bondNkdPending = {};
    var bondFaceMap = {};    // SECID/ISIN -> номинал ₽ (FACEVALUE из батча/истории MOEX)
    // Номинал облигации ₽: карта батча → кэш деталей (fetchBondData кладёт face) → 1000 (ОФЗ)
    function bondFace(isin) {
        if (bondFaceMap[isin] > 0) return bondFaceMap[isin];
        var full = fullBondId(isin);
        if (bondFaceMap[full] > 0) return bondFaceMap[full];
        var ce = bondCacheEntry(isin);
        if (ce && ce.face > 0) return ce.face;
        return 1000;
    }

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
            var c = md.columns, si = c.indexOf('SECID'), li = c.indexOf('LAST'),
                bi = c.indexOf('BOARDID'), pi = c.indexOf('LASTTOPREVPRICE');
            // одна бумага приходит строками нескольких досок — держим лучшую по приоритету
            var best = {};   // ticker -> приоритет доски принятой котировки
            md.data.forEach(function (row) {
                var t = row[si], last = row[li];
                if (!t || last == null || last === '') return;
                var prio = STK_BOARDS[row[bi]] || 0;
                if (best[t] != null && prio <= best[t]) return;
                best[t] = prio;
                quotes[t] = { price: +last, chgPct: (pi >= 0 && row[pi] != null ? +row[pi] : null) };
            });
            quotesTs = Date.now();
        });
    }

    // таблица ОФЗ (bonds[]) загружена — можно резолвить короткий ISIN портфеля в полный SECID
    function bondsReady() { try { return typeof bonds !== 'undefined' && bonds && bonds.length > 0; } catch (e) { return false; } }
    function fetchBondQuote(isin) {
        if (!isin || bondQuotes[isin] != null || bondPending[isin]) return;
        if (typeof fetchBondData !== 'function') { bondQuotes[isin] = 0; return; }
        // Портфель хранит короткий ISIN («SU26230»), а MOEX/fetchBondData отвечает только на
        // ПОЛНЫЙ SECID («SU26230RMFS1») — резолвим через таблицу ОФЗ. Пока bonds[] не загружена,
        // короткий тикер не резолвится: НЕ кэшируем 0 (иначе цена «замёрзнет» на весь сеанс), ждём.
        var full = fullBondId(isin);
        if (full === isin && !/RMFS/.test(isin) && !bondsReady()) return;
        bondPending[isin] = true;
        Promise.resolve(fetchBondData(full))
            .then(function (r) { bondQuotes[isin] = (r && r.price > 0) ? r.price : 0; })
            .catch(function () { bondQuotes[isin] = 0; })
            .then(function () { bondPending[isin] = false; softRerender(); });
    }

    // Батч-запрос цен всех нужных облигаций ОДНИМ обращением к MOEX; для не найденных в
    // батче — откат на поштучный fetchBondData (он же даёт НКД и детали купонов).
    function fetchBondQuotesBatch(isins) {
        return fetchRetry(BONDS_URL, { cache: 'no-store' }, 2, 500).then(function (r) { return r.json(); }).then(function (j) {
            var md = j.marketdata, found = {}; if (!md || !md.data) return found;
            // номиналы из блока securities — кладём в bondFaceMap (нужны и здесь для
            // пересчёта % → ₽, и экономике bondEconAt для суммы погашения)
            var sec = j.securities;
            if (sec && sec.data) {
                var sc = sec.columns, ssi = sc.indexOf('SECID'), sfi = sc.indexOf('FACEVALUE');
                if (ssi >= 0 && sfi >= 0) sec.data.forEach(function (row) {
                    var t = row[ssi], f = +row[sfi];
                    if (t && f > 0) bondFaceMap[t] = f;
                });
            }
            var c = md.columns, si = c.indexOf('SECID'), li = c.indexOf('LAST');
            // MOEX отдаёт цену под ПОЛНЫМ SECID; портфель просит короткий ISIN — сопоставляем по
            // полному (fullBondId), а результат кладём под исходным ключом, который читает карточка.
            var want = {}; isins.forEach(function (x) { want[fullBondId(x)] = x; });
            md.data.forEach(function (row) {
                var t = row[si], last = row[li], key = want[t];
                if (key && found[key] == null && last != null && last !== '' && +last > 0)
                    found[key] = +last * (bondFaceMap[t] > 0 ? bondFaceMap[t] : 1000) / 100;
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
    // «хорошая» запись bondDataCache: под коротким ISIN портфеля кэш часто пустой (0/«—» —
    // осадок от неудачного запроса до резолва), реальные данные лежат под полным SECID.
    function bondCacheEntry(isin) {
        try {
            if (typeof bondDataCache === 'undefined' || !bondDataCache) return null;
            var full = fullBondId(isin);
            if (bondDataCache[full] && bondDataCache[full].price > 0) return bondDataCache[full];
            if (bondDataCache[isin] && bondDataCache[isin].matDate && bondDataCache[isin].matDate !== '—') return bondDataCache[isin];
            return bondDataCache[full] || bondDataCache[isin] || null;
        } catch (e) { return null; }
    }
    function ensureBondNkd(isins) {
        if (typeof fetchBondData !== 'function') return;
        isins.forEach(function (x) {
            if (!x || bondNkdNow[x] != null || bondNkdPending[x]) return;
            var ce = bondCacheEntry(x);
            if (ce && ce.nkd != null && ce.matDate && ce.matDate !== '—') { bondNkdNow[x] = +ce.nkd || 0; return; }
            var full = fullBondId(x);
            if (full === x && !/RMFS/.test(x) && !bondsReady()) return;   // ждём таблицу ОФЗ для резолва
            bondNkdPending[x] = true;
            Promise.resolve(fetchBondData(full))
                .then(function (r) { bondNkdNow[x] = (r && r.nkd != null && r.nkd >= 0) ? +r.nkd : 0; })
                .catch(function () { bondNkdNow[x] = 0; })
                .then(function () { bondNkdPending[x] = false; softRerender(); });
        });
    }
    // Живые цена/НКД облигации по короткому ISIN портфеля (₽). Приоритет — наш прямой запрос
    // (bondQuotes/bondNkdNow), фолбэк — кэш деталей ОФЗ под полным SECID. live=true, если цена настоящая.
    function liveBond(isin) {
        var price = bondQuotes[isin] > 0 ? bondQuotes[isin] : 0;
        var nkd = bondNkdNow[isin] != null ? bondNkdNow[isin] : null;
        if (price > 0 && nkd != null) return { price: price, nkd: nkd, live: true };
        var ce = bondCacheEntry(isin);
        if (ce) {
            if (!(price > 0) && ce.price > 0) price = ce.price;
            if (nkd == null && ce.nkd != null) nkd = +ce.nkd;
        }
        return { price: price, nkd: nkd, live: price > 0 };
    }
    function curNkdOf(isin) {
        if (bondNkdNow[isin] != null) return bondNkdNow[isin];
        var ce = bondCacheEntry(isin);
        if (ce && ce.nkd != null) return +ce.nkd;
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

    // Цена «сейчас»: живой MOEX → таблица акций (ОДХС) → цена покупки.
    // src отличает настоящую текущую цену от фолбэка: 'live' (котировка MOEX) /
    // 'table' (таблица акций) / 'buy' (котировки ещё нет — подставлена средняя цена
    // ПОКУПКИ; в колонках «Сейчас» её показывать нельзя, только «…»).
    function curPriceInfo(h) {
        // облигации: короткий ISIN портфеля резолвим в полный SECID (liveBond) — иначе живая
        // цена лежала под полным ключом, а колонка «Сейчас» вечно показывала «…»
        if (h.type === 'bond') { var lb = liveBond(h.ticker); if (lb.price > 0) return { p: lb.price, src: 'live' }; }
        else {
            if (quotes[h.ticker]) return { p: quotes[h.ticker].price, src: 'live' };
            if (typeof window.stkFindCompany === 'function') {
                var co = window.stkFindCompany(h.ticker);
                if (co && co.main) { var p = toNum(co.main['Текущая Цена']); if (isFinite(p) && p > 0) return { p: p, src: 'table' }; }
            }
        }
        return { p: aggHolding(h).avgPrice || 0, src: 'buy' };   // фолбэк — средняя цена покупки по лотам
    }
    function curPriceOf(h) { return curPriceInfo(h).p; }
    function isLive(h) { return h.type === 'bond' ? (liveBond(h.ticker).price > 0) : !!quotes[h.ticker]; }
    // Котировки уже загружены, а этой бумаги в них нет → тикер, скорее всего, неверный
    // (или бумага не торгуется). Раньше строка вечно висела в «…» с подсказкой «ждём MOEX» —
    // не отличить опечатку от медленной сети. true = «не ждите, котировки не будет».
    function quoteMissing(h) {
        if (h.type === 'bond') return bondQuotes[h.ticker] === 0;   // 0 = запросили и не нашли
        if (!quotesTs || quotesLoading || quotes[h.ticker]) return false;
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(h.ticker);
            if (co && co.main && toNum(co.main['Текущая Цена']) > 0) return false;   // есть цена из таблицы
        }
        return true;
    }
    // Ячейка «Сейчас», когда живой цены нет: либо ещё грузится («…»), либо тикер не найден («—»)
    function noQuoteCell(h) {
        return quoteMissing(h)
            ? { txt: '—', tip: 'Котировка не найдена на MOEX — проверьте тикер' }
            : { txt: '…', tip: 'Ждём котировку MOEX…' };
    }

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
        var ci = curPriceInfo(h);
        var isBond = h.type === 'bond';
        var qty = a.qty, buy = a.avgPrice, cur = ci.p || buy;
        // Облигации: доход/расход считаем по «грязной» цене (чистая цена + НКД). Расход =
        // цена покупки + НКД на дату покупки, доход = цена сейчас + НКД сейчас (запрос пользователя).
        // НКД сейчас грузится асинхронно (curNkdOf); пока не пришёл — берём НКД покупки как
        // приближение (строка пересчитается после ответа MOEX). Для акций НКД = 0.
        var buyNkd = isBond ? (a.nkd || 0) : 0;
        var cn = isBond ? curNkdOf(h.ticker) : null;
        // текущий НКД применяем только когда есть живая ЦЕНА (ci.src !== 'buy'); иначе мы ещё
        // ждём котировку (в таблице «…») и не смешиваем цену покупки с текущим НКД — иначе
        // возникает ложное «изменение». Пока цены нет — НКД покупки на обеих сторонах → pnl 0.
        var curNkd = (isBond && ci.src !== 'buy' && cn != null) ? cn : buyNkd;
        if (!isBond) curNkd = 0;
        var invested = a.invested + buyNkd * qty;   // включая НКД на дату покупки
        var value = (cur + curNkd) * qty, pnl = value - invested;
        return { qty: qty, buy: buy, cur: cur, curSrc: ci.src, invested: invested, value: value, pnl: pnl,
            pnlPct: invested > 0 ? pnl / invested * 100 : 0, days: a.effDays,
            annual: annualize(invested, value, a.effDays), live: isLive(h),
            lots: a.lots, lotCount: a.count, nkd: a.nkd, curNkd: curNkd,
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
    // Бенчмарк портфеля: чисто облигационный сравниваем с индексом гособлигаций RGBI
    // (IMOEX — индекс акций, для портфеля из ОФЗ сравнение ни о чём), иначе — IMOEX.
    function pfBench(p) {
        var hasS = false, hasB = false;
        ((p && p.holdings) || []).forEach(function (h) { if (h.type === 'bond') hasB = true; else hasS = true; });
        return (hasB && !hasS) ? { code: 'RGBI', label: 'RGBI', full: 'индекс гособлигаций RGBI' }
                               : { code: 'IMOEX', label: 'IMOEX', full: 'индекс Мосбиржи IMOEX' };
    }
    function loadPfChart(pid) {
        var p = findPf(pid); if (!p) return;
        var wantImoex = !!chartImoex[pid];
        var bench = pfBench(p);
        var cached = chartCache[pid];
        if (cached && cached.imoex === wantImoex && cached.bench === bench.code && !cached.err) { repaintCharts(pid); return; }
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
                return btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/' + bench.code + '.json', fromStr, tillStr).then(function (im) {
                    var al = im && im.length ? btAlignReturns(pfSeries, im) : null;
                    return (al && al.points.length >= 2) ? { points: al.points, pfFinal: al.pfFinal, imFinal: al.imFinal } : pfOnlyPoints(pfSeries);
                });
            }
            return pfOnlyPoints(pfSeries);
        }).then(function (res) {
            res.imoex = wantImoex; res.bench = bench.code; res.from = fromStr; chartCache[pid] = res;
        }, function (e) {
            chartCache[pid] = { imoex: wantImoex, bench: bench.code, from: fromStr, err: (e && e.message) || 'ERR' };
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
    // все покупки портфеля датированы сегодняшним днём → истории котировок ещё нет
    // физически: первая точка кривой появится после ближайшего закрытия торгов
    function pfAllBoughtToday(pid) {
        var p = store.items.find(function (x) { return x.id === pid; });
        if (!p || !(p.holdings || []).length) return false;
        var today = todayStr(), seen = false;
        var all = (p.holdings || []).every(function (h) {
            return ensureLots(h).every(function (l) {
                if (!(+l.qty > 0)) return true;
                seen = true;
                return (l.buyDate || today) >= today;
            });
        });
        return seen && all;
    }
    function pfChartMsgHtml(code, pid) {
        var conf = (code === 'NO_PF' || code === 'NO_ASSETS') && pid && pfAllBoughtToday(pid)
              ? { icon: CHART_CLOCK_SVG, t: 'График появится завтра', s: 'Покупки датированы сегодняшним днём — кривая строится по ценам закрытия и будет показана на следующий торговый день.' }
            : code === 'NO_ASSETS' ? { icon: CHART_EMPTY_SVG, t: 'Пока нечего показывать', s: 'Добавьте позиции с количеством — и здесь появится кривая доходности.' }
            : code === 'NO_PF' ? { icon: CHART_SPROUT_SVG, t: 'Пока мало данных для графика', s: 'Кривая доходности строится по дневным котировкам — нужно хотя бы несколько торговых дней после покупки.' }
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
            wrap.innerHTML = pfChartMsgHtml(data.err, pid);
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
        // анимация прорисовки линии (и индекса) — линия «рисуется» слева направо.
        // При ре-рендере из переключателей видимости/вида (noChartAnim, см. renderNoAnim)
        // пропускаем: график сразу в конечном состоянии, вкладка не мерцает.
        if (!noChartAnim) {
            var path = wrap.querySelector('.pfcv-line');
            if (path) { try { var len = path.getTotalLength(); path.style.strokeDasharray = len; path.style.strokeDashoffset = len; path.getBoundingClientRect(); path.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)'; path.style.strokeDashoffset = '0'; } catch (e) {} }
            var ar = wrap.querySelector('.pfcv-area');
            if (ar) { ar.style.opacity = '0'; ar.getBoundingClientRect(); ar.style.transition = 'opacity .9s ease .2s'; ar.style.opacity = '1'; }
            // IMOEX — просто проявляется (без «рисования» слева направо, как у портфеля): её
            // dash-паттерн задан в CSS (см. .pfcv-imline) и не должен перебиваться инлайновым
            // strokeDasharray анимации — иначе пунктир на миг схлопывается в сплошную линию.
            var imp = wrap.querySelector('.pfcv-imline');
            if (imp) { imp.style.opacity = '0'; imp.getBoundingClientRect(); imp.style.transition = 'opacity .9s ease .3s'; imp.style.opacity = ''; }
        }
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
            // в мини-легенде имя индекса опускаем — рядом уже есть тумблер с ним; показываем только %
            if (showIm && data.imFinal != null) { var im = data.imFinal, imLbl = dynEl ? (data.bench === 'RGBI' ? 'RGBI ' : 'IMOEX ') : ''; lgh += '<span class="pfcv-lgi"><i class="pfcv-imdot"></i>' + imLbl + '<b class="' + (im >= 0 ? 'pos' : 'neg') + '">' + (im >= 0 ? '+' : '') + im.toFixed(1) + '%</b></span>'; }
            legEl.innerHTML = lgh;
        }
    }
    function paintPfChart(pid) { drawPfChart(pid, dq('pfcvChart-' + pid), dq('pfcvDyn-' + pid), dq('pfcvLeg-' + pid), pid); }
    function repaintCharts(pid) { paintPfChart(pid); paintPfChartMini(pid); pfdCapMaybeRepaint(); }
    function pfcvStat(l, v, cls) { return '<div class="pfcv-stat"><span class="pfcv-stat-l">' + esc(l) + '</span><span class="pfcv-stat-v ' + (cls || '') + '">' + v + '</span></div>'; }
    // пейн графика в карточке: слева — сводка, справа — кривая доходности (выезжает справа)
    function pfChartViewHtml(p, c, idx) {
        var pid = p.id, pnlCls = c.pnl >= 0 ? 'pos' : 'neg', imOn = !!chartImoex[pid], asOn = !!chartAssets[pid];
        var bench = pfBench(p);
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
                    (function () {   // полученные купоны/дивиденды — в «Доход» и кривую не входят
                        var po = pfPayouts(p);
                        return (po.any && (po.pending || po.sum > 0.005))
                            ? pfcvStat('Выплаты получено', po.pending ? '…' : '+' + fmtRub(po.sum), po.pending ? '' : 'pos') : '';
                    })() +
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
                    '<button class="pfcv-imbtn' + (imOn ? ' on' : '') + '" onclick="pfToggleChartImoex(\'' + pid + '\')" title="Наложить кривую — ' + bench.full + '">' +
                        '<span class="pfcv-imdot"></span>' + bench.label + '</button>' +
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
            // нет живой цены: «…» пока грузится, «—» если тикер не нашёлся в котировках
            var noQ = cc.curSrc === 'buy' ? noQuoteCell(h) : null;
            return '<tr>' +
                '<td class="pfo-c-rk">#' + (i + 1) + '</td>' +
                '<td class="pfo-tk pfo-c-as"><span class="pfo-tkline"><b>' + esc(h.ticker) + '</b></span><span class="pfo-nm">' + esc(h.name || '') + '</span></td>' +
                '<td class="pfo-c-tp"><span class="pfo-tag ' + h.type + '">' + (isB ? 'обл' : 'акц') + '</span></td>' +
                '<td>' + ruDate(cc.firstDate) + lotChip + '</td>' +
                '<td' + buyTip + '>' + fmtPrice(cc.buy) + '</td>' +
                '<td class="pfo-nkdcol' + (isB ? '' : ' muted') + '"' + (isB ? ' title="НКД на дату покупки (взвеш. по лотам)"' : '') + '>' + (isB ? fmtPrice(cc.nkd || 0) : '—') + '</td>' +
                '<td>' + (cc.qty || 0) + '</td>' +
                '<td>' + fmtRub(cc.invested) + '</td>' +
                '<td class="' + (cc.live ? 'pfo-live' : '') + '"' + (noQ ? ' title="' + attr(noQ.tip) + '"' : ptip) + '>' + (noQ ? noQ.txt : fmtPrice(cc.cur)) + '</td>' +
                '<td class="pfo-nkdcol' + (isB ? '' : ' muted') + '"' + (isB ? ' title="Текущий накопленный купонный доход — НКД сейчас (MOEX)"' : '') + '>' + (isB ? (nkdNow != null ? fmtPrice(nkdNow) : '—') : '—') + '</td>' +
                '<td>' + fmtRub(cc.value) + '</td>' +
                '<td class="' + (cc.pnl >= 0 ? 'pos' : 'neg') + '">' + fmtRub(cc.pnl) + '</td>' +
                '<td class="' + (!hasInv || noQ ? '' : (cc.pnlPct >= 0 ? 'pos' : 'neg')) + '">' + (!hasInv || noQ ? '—' : fmtPct(cc.pnlPct)) + '</td>' +
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
    // btGetStockPriceSafe/btGetBondPriceSafe (backtest.js) тянут цену закрытия MOEX
    // на конкретную дату; облигации уже в рублях (×10 от % номинала). Возвращают >0,
    // 0 (нет данных) или -1 (ошибка) — нам годится только >0.
    function histPriceFn(type) {
        var name = type === 'bond' ? 'btGetBondPriceSafe' : 'btGetStockPriceSafe';
        if (typeof window[name] === 'function') return window[name];
        return null;
    }
    // Короткий ISIN портфеля ('SU26238') → полный SECID MOEX ('SU26238RMFS4') из таблицы ОФЗ:
    // история ISS по короткому тикеру пустая, нужен полный.
    function fullBondId(t) {
        try { if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++)
            if (bonds[i].t && bonds[i].t.indexOf(t) === 0) return bonds[i].t; } catch (e) {}
        return t;
    }
    // Строка истории MOEX на дату (или ближайший торговый день до неё, окно 7 дней).
    // ВАЖНО: без фильтра по доске ISS отдаёт строки ВСЕХ досок (SMAL, внесистемные и т.п.) —
    // «sort_order=desc&limit=1» из Тест-вкладки часто попадал в пустую/неосновную доску и
    // цена «не находилась». Здесь берём все строки за окно и выбираем: CLOSE > 0, приоритет
    // основных досок, самая свежая дата. cb({close, accint} | null).
    var histCache = {};   // 'type|ticker|date' → {close, accint} | null (null не кешируем при ошибке сети)
    function fetchHistRow(type, ticker, dateStr, cb) {
        var secid = type === 'bond' ? fullBondId(ticker) : ticker;
        var key = type + '|' + secid + '|' + dateStr;
        if (Object.prototype.hasOwnProperty.call(histCache, key)) { cb(histCache[key]); return; }
        var fd = new Date(dateStr + 'T00:00:00');
        if (isNaN(fd.getTime())) { cb(null); return; }
        fd.setDate(fd.getDate() - 7);
        var from = fd.getFullYear() + '-' + pad2(fd.getMonth() + 1) + '-' + pad2(fd.getDate());
        var market = type === 'bond' ? 'bonds' : 'shares';
        var url = ISS + 'history/engines/stock/markets/' + market + '/securities/' + encodeURIComponent(secid) +
            '.json?from=' + from + '&till=' + dateStr + '&iss.meta=off&iss.only=history';
        var MAIN = type === 'bond' ? { TQOB: 1, TQCB: 1, TQOD: 1, TQIR: 1 } : { TQBR: 1, TQTF: 1, TQTD: 1 };
        fetchRetry(url, { cache: 'no-store' }, 2, 500).then(function (r) { return r.json(); }).then(function (j) {
            var h = j.history, best = null;
            if (h && h.data && h.data.length) {
                var c = h.columns, bi = c.indexOf('BOARDID'), di = c.indexOf('TRADEDATE'), cl = c.indexOf('CLOSE'),
                    ai = c.indexOf('ACCINT'), fi = c.indexOf('FACEVALUE');
                h.data.forEach(function (row) {
                    var close = cl >= 0 ? row[cl] : null;
                    if (close == null || !(+close > 0)) return;
                    var cand = { board: row[bi], date: row[di], close: +close,
                        accint: (ai >= 0 && row[ai] != null && isFinite(row[ai])) ? +row[ai] : null,
                        face: (fi >= 0 && +row[fi] > 0) ? +row[fi] : null };
                    if (!best) { best = cand; return; }
                    var bMain = !!MAIN[best.board], cMain = !!MAIN[cand.board];
                    if (cMain !== bMain) { if (cMain) best = cand; return; }
                    if (cand.date > best.date) best = cand;
                });
            }
            if (best && best.face > 0) bondFaceMap[secid] = best.face;   // попутно запоминаем номинал
            histCache[key] = best; cb(best);
        }).catch(function () { cb(null); });
    }
    function lookupHistPrice(ticker, type, dateStr, cb) {
        fetchHistRow(type, ticker, dateStr, function (row) {
            // облигации: CLOSE в % номинала → ₽ через FACEVALUE (у ОФЗ 1000 ₽, прежний ×10)
            if (row) { cb(type === 'bond' ? row.close * ((row.face > 0 ? row.face : bondFace(ticker)) / 100) : row.close); return; }
            var fn = histPriceFn(type);   // фолбэк — механизм Тест-вкладки, затем живая котировка
            if (fn) {
                Promise.resolve(fn(ticker, dateStr)).then(function (p) { p > 0 ? cb(p) : lookupPrice(ticker, type, cb); })
                    .catch(function () { lookupPrice(ticker, type, cb); });
                return;
            }
            lookupPrice(ticker, type, cb);
        });
    }
    // НКД облигации на дату (колонка ACCINT в истории MOEX). cb(>=0) при успехе (0 — валидно,
    // НКД может обнулиться сразу после купона), cb(null) при ошибке/отсутствии данных.
    function lookupHistNkd(ticker, dateStr, cb) {
        fetchHistRow('bond', ticker, dateStr, function (row) {
            if (row && row.accint != null && row.accint >= 0) { cb(row.accint); return; }
            if (typeof window.btGetBondNkdSafe === 'function') {
                Promise.resolve(window.btGetBondNkdSafe(ticker, dateStr))
                    .then(function (v) { cb(v != null && v >= 0 ? v : null); })
                    .catch(function () { cb(null); });
                return;
            }
            cb(null);
        });
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

    // ============================================================
    //  ВЫПЛАТЫ — настоящие расписания MOEX: купоны (bondization) и
    //  дивиденды (dividends), через готовые загрузчики вкладки «Тест»
    //  (btFetchCoupons/btFetchDividends). Питают строку «Выплаты» в
    //  карточке (полученное с даты покупки) и «Календарь выплат»
    //  (будущие события на год вперёд, точными датами).
    // ============================================================
    var coupSched = {};      // полный SECID -> [{d,v}] | null (загрузили: пусто/ошибка → фолбэк)
    var coupPending = {};
    var divSched = {};       // тикер -> [{d,v}] | null
    var divPending = {};
    var schedQueue = [], schedActive = 0;   // общая очередь, максимум 2 параллельных запроса
    function pumpSchedQueue() {
        while (schedActive < 2 && schedQueue.length) {
            var job = schedQueue.shift(); schedActive++;
            (function (job) {
                var fnName = job.kind === 'bond' ? 'btFetchCoupons' : 'btFetchDividends';
                var run = (typeof window[fnName] === 'function')
                    ? Promise.resolve().then(function () { return window[fnName](job.key); })
                    : Promise.reject(new Error('NO_FN'));
                run.then(function (list) { (job.kind === 'bond' ? coupSched : divSched)[job.key] = (list && list.length) ? list : null; })
                   .catch(function () { (job.kind === 'bond' ? coupSched : divSched)[job.key] = null; })
                   .then(function () {
                        schedActive--; delete (job.kind === 'bond' ? coupPending : divPending)[job.key];
                        softRerender(); pumpSchedQueue();
                   });
            })(job);
        }
    }
    function ensureSchedule(kind, key) {
        var cache = kind === 'bond' ? coupSched : divSched, pend = kind === 'bond' ? coupPending : divPending;
        if (!key || (key in cache) || pend[key]) return;
        pend[key] = true; schedQueue.push({ kind: kind, key: key });
        pumpSchedQueue();
    }
    // Количество бумаг актива, купленное К дате (строго до неё: купон в день покупки
    // достаётся продавцу — покупатель компенсирует его через НКД). Лоты — журнал
    // покупок; проданное в ребалансе уже вычтено из лотов задним числом, поэтому
    // выплаты по проданным ранее бумагам этим приближением не учитываются.
    function qtyAtDate(h, iso) {
        var q = 0;
        ensureLots(h).forEach(function (l) { if ((+l.qty > 0) && l.buyDate && l.buyDate < iso) q += +l.qty; });
        return q;
    }
    // Полученные выплаты по активу за время владения, ₽. null = расписание ещё грузится.
    // Облигации — купоны по расписанию MOEX (фолбэк — периодическая схема от погашения),
    // дивиденды считаем по дате отсечки (фактическая выплата приходит на пару недель позже).
    function holdPayouts(h) {
        if (!h.ticker) return 0;
        var today = todayStr();
        if (h.type === 'bond') {
            var full = fullBondId(h.ticker);
            // короткий ISIN ещё не резолвится (таблица ОФЗ не загружена) — подождём
            if (full === h.ticker && !/RMFS/.test(h.ticker) && !bondsReady()) return null;
            if (!(full in coupSched)) { ensureSchedule('bond', full); return null; }
            var sched = coupSched[full];
            if (sched) {
                var sum = 0;
                sched.forEach(function (cp) { if (cp.d <= today) sum += cp.v * qtyAtDate(h, cp.d); });
                return sum;
            }
            // расписание недоступно → приближение: шаг «выплат в год» от даты погашения назад
            var det = bondDetail(h.ticker);
            if (!det || !(+det.couponValue > 0) || !(+det.freq > 0)) return 0;
            var mat = parseBondDate(det.matDate); if (!mat) return 0;
            var stepMs = (365 / det.freq) * 86400000, t = mat.getTime(), sum2 = 0;
            while (t > Date.now()) t -= stepMs;
            for (var guard = 0; guard < 400 && t > 0; guard++, t -= stepMs) {
                var q = qtyAtDate(h, dateToIso(new Date(t)));
                if (!(q > 0)) break;   // ушли раньше первой покупки
                sum2 += (+det.couponValue) * q;
            }
            return sum2;
        }
        if (!(h.ticker in divSched)) { ensureSchedule('div', h.ticker); return null; }
        var ds = divSched[h.ticker]; if (!ds) return 0;
        var sum3 = 0;
        ds.forEach(function (dv) { if (dv.d <= today) sum3 += dv.v * qtyAtDate(h, dv.d); });
        return sum3;
    }
    // Сумма полученных выплат по портфелю; pending — хоть одно расписание ещё грузится
    function pfPayouts(p) {
        var sum = 0, pending = false, any = false;
        (p.holdings || []).forEach(function (h) {
            if (!h.ticker || !(aggHolding(h).qty > 0)) return;
            any = true;
            var v = holdPayouts(h);
            if (v == null) pending = true; else sum += v;
        });
        return { sum: sum, pending: pending, any: any };
    }

    // ---- парсинг произвольной даты, вставленной в поле (Ctrl+V) ----
    // Нативный <input type="date"> не принимает вставку в формате «12-aug-2025» — обработчик
    // pfDatePaste перехватывает вставку, распознаёт распространённые форматы и подставляет ISO.
    var MONTH_MAP = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        янв: 1, фев: 2, мар: 3, апр: 4, май: 5, мая: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12 };
    function monthNum(w) { return MONTH_MAP[String(w || '').slice(0, 3)] || 0; }
    function fullYear(y) { y = +y; return y < 100 ? 2000 + y : y; }
    function isoOf(y, mo, d) {
        if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31) || !(y >= 1970 && y <= 2100)) return null;
        return y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d);
    }
    function pfParseAnyDate(s) {
        s = String(s || '').trim().toLowerCase();
        if (!s) return null;
        var m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);        // 2025-08-12 (ISO)
        if (m) return isoOf(+m[1], +m[2], +m[3]);
        m = s.match(/^(\d{1,2})[\s.\-\/]*([a-zа-я]{3,})\.?[\s.\-\/]*(\d{2,4})$/); // 12-aug-2025 / 12 авг 2025
        if (m) { var mo = monthNum(m[2]); return mo ? isoOf(fullYear(m[3]), mo, +m[1]) : null; }
        m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);           // 12.08.2025 / 12/08/2025
        if (m) return isoOf(fullYear(m[3]), +m[2], +m[1]);
        return null;
    }
    // Перехватываем вставку в поле даты: распознали формат → подставляем ISO и шлём change
    // (чтобы сработал onchange-хендлер сохранения); не распознали — отдаём браузеру как есть.
    window.pfDatePaste = function (ev, el) {
        var txt = '';
        try { txt = (ev.clipboardData || window.clipboardData).getData('text') || ''; } catch (e) { return; }
        var iso = pfParseAnyDate(txt);
        if (!iso) return;
        ev.preventDefault();
        el.value = iso;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // ====================================================================
    //  РЕНДЕР
    // ====================================================================
    var openMenu = null;     // id портфеля с раскрытыми настройками
    var editHold = {};       // hid -> true: строка состава раскрыта в редактор (правка по клику)
    var addOpen = false;     // раскрыта ли форма «Добавить актив» в открытых настройках
    var colorsOpen = false;  // раскрыта ли палитра цвета в шапке настроек
    var delArm = false;      // раскрыта ли данжер-зона «Удалить портфель» в футере настроек
    var openRows = {};       // hid -> true: раскрыты ли субданные актива в мини-таблице карточки
    var menuJustOpened = false;
    var liveTimer = null;
    var rendering = false;   // защита от повторного входа (см. ниже)
    var loadStatus = {};     // hid -> { state:'loading'|'ok'|'err'|'nodate', date } для кнопки «Загрузить на дату»
    // Новости избранного: кэшируем готовый HTML по тикеру и грузим с ограничением
    // параллелизма (Apps Script медленный и на одном хосте с гугл-таблицами —
    // 12 параллельных запросов раньше «подвешивали» загрузку данных).
    var newsHtmlCache = {};  // tk -> { html, link }
    var newsStarted = {};    // tk -> true (запрос уже поставлен в очередь)
    var newsQueue = [], newsActive = 0;
    var softTimer = null;    // дебаунс мягкого ре-рендера (котировки приходят пачкой)
    // Полный ре-рендер заново «рисует» все мини-графики с 1-секундной анимацией линии —
    // при переключении видимости/вида это выглядит как мерцание всей вкладки. Флаг
    // noChartAnim на время такого ре-рендера рисует графики сразу в конечном состоянии.
    var noChartAnim = false;
    function renderNoAnim() {
        noChartAnim = true;
        renderPortfolios();
        // кешированные графики перерисовываются синхронно; запас — на microtask-хвосты
        setTimeout(function () { noChartAnim = false; }, 250);
    }
    // Плавная перерисовка для пользовательских переключений («Видимость», вид карточек):
    // полный innerHTML-своп читается как мигание всей сетки. View Transitions кросс-фейдит
    // старое и новое состояние; after — колбэк после обновления DOM (вернуть попап .open).
    // Для фоновых обновлений котировок НЕ используется — там перерисовка должна быть незаметной.
    function renderSmooth(after) {
        var run = function () { renderNoAnim(); if (after) after(); };
        if (document.startViewTransition) {
            try { document.startViewTransition(run); return; } catch (e) {}
        }
        run();
    }

    function renderPortfolios() {
        var host = dq('pfWrap'); if (!host) return;
        // Во время активного жеста (перетаскивание/ресайз) или при открытом пикере
        // «Добавить блок» фоновые перерисовки (котировки приходят пачками) глушим:
        // innerHTML-своп оборвал бы жест или затёр живые превью пикера. В покое —
        // даже при живой сетке — обновления котировок идут как обычно. Собственные
        // перерисовки конструктора идут через pfdRerender() (флаг pfdWantRender).
        if ((pfdBusy() || dashEdit) && !pfdWantRender) return;
        // курсор в «Заметках» — ФОНОВЫЙ innerHTML-своп (котировки) унёс бы фокус и
        // несохранённый хвост текста; такие рендеры откладываем до blur (автосейв
        // заметки идёт с дебаунсом). Явные рендеры конструктора (pfdWantRender —
        // добавление/удаление заметки) пропускаем: они сами флашат текст. Проверяем
        // activeElement, а НЕ :focus — псевдокласс не матчится без фокуса окна ОС.
        var ae = document.activeElement;
        if (!pfdWantRender && ae && ae.classList && ae.classList.contains('pfnt-tx') && host.contains(ae)) return;
        pfdWantRender = false;
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
            var n = visibleItems().length;   // раскладка считает только ВИДИМЫЕ карточки
            var favStr = favHtml();
            // Календарь выплат показывать не о чем (нет ни облигаций, ни акций с известными
            // будущими дивидендами) → не рендерим его вовсе, а на его место — и в свободной
            // ячейке сетки, и внизу колонки — встают компактные «Ставки рынка» (см.
            // ratesStackHtml). Условие пересчитывается на КАЖДЫЙ рендер, поэтому само
            // подхватывает любое изменение состава и приход расписаний дивидендов.
            var hasVisibleHoldings = store.items.some(function (p) { return !p.hidden && (p.holdings || []).length > 0; });
            var noBonds = hasVisibleHoldings && !calPfCandidates().length;
            // В узком виде (3 карточки в ряд) остаток от деления на 3 определяет, сколько
            // ячеек ряда календарь должен занять: 1 портфель → 2 ячейки (растягивается до
            // «Избранного»), 2 портфеля → 1 ячейка (третий блок в ряду). В обычном виде
            // (2 в ряд) логика та же на остатке от 2 — как было раньше.
            var cols = cardViewMode === 'narrow' ? 3 : 2;
            var rem = n % cols;
            var needCell = n > 0 && rem !== 0;
            var calSpan = needCell ? cols - rem : 1;
            // noBonds=true → «Ставки рынка» вместо календаря (и в ячейке, и внизу колонки —
            // без большого бокса, см. ratesStackHtml); иначе — обычный «Календарь выплат»
            var cellCard = noBonds ? ratesStackHtml(needCell, calSpan) : paymentCalendarHtml(needCell, calSpan);
            var body;
            if (pfdActive()) {
                // Конструктор: пользовательская раскладка — единая 12-колоночная
                // сетка, порядок и размеры блоков из pf_dash_v1 (см. секцию выше)
                body = pfdBodyHtml(favStr, noBonds);
            } else {
            var gridPart = gridHtml(needCell ? cellCard : '');
            // Календарь/ставки — ВНУТРИ левой колонки (не отдельным блоком во всю ширину
            // страницы), чтобы их ширина совпадала с шириной карточек портфеля и они не
            // «наезжали» визуально на колонку «Избранное» сбоку. Нижнюю полосу ставок
            // показываем только когда есть настоящий календарь — дублировать «Ставки рынка»
            // (уже занявшие место календаря) не нужно.
            // «История сделок» — ВСЕГДА самая нижняя секция ЛЕВОЙ колонки (после ставок
            // рынка), НЕ во всю ширину страницы: её правый край совпадает с краем карточек
            // портфеля / календаря, а не заезжает под «Избранное»/«Суммарный капитал» справа.
            var left = gridPart + (needCell ? '' : cellCard) + (noBonds ? '' : ratesHtml()) + tradesHtml();
            // Сводка по всем портфелям (2+) — компактной карточкой ПОД «Избранным» в правой
            // колонке. Рыночная лента (бывший LIVE-виджет) больше не карточка тут — она
            // вшита в фон глобального топ-бара, см. renderTopBarMarket().
            body = '<div class="pf-topgrid">' +
                    '<div class="pf-topgrid-left">' + left + '</div>' +
                    '<div class="pf-topgrid-fav">' + favStr + (store.items.length >= 2 ? summaryCardHtml() : '') + '</div>' +
                '</div>';
            }
            // Позиции скролла внутренних списков (мини-таблица состава, календарь, избранное,
            // настройки): innerHTML-своп сбрасывал их в ноль на каждом фоновом обновлении
            // котировок — запоминаем по data-skey и возвращаем после пересборки.
            var keepScroll = {};
            Array.prototype.forEach.call(host.querySelectorAll('[data-skey]'), function (el) {
                if (el.scrollTop) keepScroll[el.getAttribute('data-skey')] = el.scrollTop;
            });
            host.innerHTML = body;
            Array.prototype.forEach.call(host.querySelectorAll('[data-skey]'), function (el) {
                var k = el.getAttribute('data-skey');
                if (keepScroll[k]) el.scrollTop = keepScroll[k];
            });
            renderTopBarActions();
            renderTopBarMarket();
            tickLive();
            renderFavNews();
            renderPosNews();        // блок «Новости по позициям» (no-op, если не включён)
            pfdHeatRepaintSoon();   // блок «Карта рынка»: дорисовать живые плитки
            ensureLiveTick();
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
                    // preventScroll: фокус НЕ должен тащить страницу (иначе добавление/открытие
                    // нового портфеля внизу «прыгало» в начало — приходилось прокручивать обратно)
                    if (op && !((op.holdings || []).length)) { var inp = dq('pfNewTk-' + openMenu); if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { try { inp.focus(); } catch (e2) {} } } }
                }
            }
            fitBigSums();   // крупные суммы (до 100 млрд ₽) — уменьшаем кегль, а не переносим/распираем
            recordSnapshots();   // дневной снимок стоимости — для чипа «сегодня ±X ₽»
            pfdSchedulePack();   // masonry: подтянуть короткие блоки вверх в зазоры (no-op вне конструктора)
            if (dashEdit) pflInitPreview();   // карточка раскладки открыта — показать превью выбранного блока
        } finally {
            rendering = false;
        }
    }
    window.renderPortfolios = renderPortfolios;

    // Автоподгонка крупных сумм: «100 000 000 000 ₽» должна влезать в строку карточки
    // целиком — без переноса «₽» и сдвига сетки. Меряем переполнение строки и плавно
    // уменьшаем кегль суммы до влезания.
    function fitBigSums() {
        document.querySelectorAll('#pfWrap .pfc-hero-top').forEach(function (row) {
            var val = row.querySelector('.pfc-hero-val'); if (!val) return;
            val.style.fontSize = '';
            var size = parseFloat(getComputedStyle(val).fontSize) || 21;
            var guard = 0;
            while (row.scrollWidth > row.clientWidth + 1 && size > 12 && guard < 40) {
                size -= 0.5; val.style.fontSize = size + 'px'; guard++;
            }
        });
        document.querySelectorAll('#pfWrap .pfs2-capital').forEach(function (el) {
            el.style.fontSize = '';
            var size = parseFloat(getComputedStyle(el).fontSize) || 26;
            var guard = 0;
            while (el.scrollWidth > el.clientWidth + 1 && size > 14 && guard < 40) {
                size -= 0.5; el.style.fontSize = size + 'px'; guard++;
            }
        });
    }
    window.addEventListener('resize', function () { if (currentTab === 'portfolios' && dq('pfWrap')) fitBigSums(); });

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
            // фоновое обновление (котировки/НКД/новости) — не «настоящее» изменение графика,
            // без noChartAnim мини-графики каждый раз переигрывали 1-секундную анимацию
            // прорисовки → на глаз это читалось как мерцание карточек (см. renderNoAnim выше).
            renderNoAnim();
        }, 150);
    }

    // ---- РЫНОЧНАЯ ЛЕНТА В ШАПКЕ САЙТА (бывший тёмный LIVE-виджет отдельной карточкой в
    // правой колонке — не понравился визуально, «не подходил» к странице). Теперь это
    // тонкая строка, вшитая прямо в фон глобального топ-бара (#topBarPfMarket в
    // index.html, ПОД #topBar) — без своего бокса, ненавязчиво, но всегда на виду, пока
    // открыта вкладка «Портфели». Ids те же по смыслу (tbmk-v-*/tbmk-c-*), наполняет их
    // tickLive() из тех же скрытых span'ов дашборда (val-imoex и т.п.), что и раньше.
    function topBarMarketHtml() {
        var tiles = [['imoex', 'IMOEX'], ['usd', 'USD/RUB'], ['btc', 'BTC']];
        return '<span class="tbmk-dot"></span>' + tiles.map(function (t, i) {
            // клик по IMOEX открывает вкладку «Рынок»
            var go = t[0] === 'imoex';
            return (i ? '<span class="tbmk-sep">·</span>' : '') +
                '<span class="tbmk-item' + (go ? ' tbmk-go' : '') + '"' +
                (go ? ' role="button" tabindex="0" title="Открыть вкладку «Рынок»" onclick="switchTab(\'market\')"' : '') + '>' +
                '<span class="tbmk-k">' + t[1] + '</span>' +
                '<span class="tbmk-v" id="tbmk-v-' + t[0] + '">—</span>' +
                '<span class="tbmk-c" id="tbmk-c-' + t[0] + '"></span></span>';
        }).join('');
    }
    function renderTopBarMarket() {
        var host = document.getElementById('topBarPfMarket'); if (!host) return;
        host.innerHTML = topBarMarketHtml();
        host.style.display = 'flex';
    }
    function tickLive() {
        [['imoex', 'val-imoex', 'dyn-imoex'], ['usd', 'val-usdrub', 'dyn-usdrub'], ['btc', 'val-btc', 'dyn-btc']].forEach(function (p) {
            var v = dq('tbmk-v-' + p[0]), c = dq('tbmk-c-' + p[0]), sv = dq(p[1]), sd = dq(p[2]);
            if (v && sv) { var s = (sv.textContent || '').trim(); if (s) v.textContent = s; }
            if (c && sd) { c.textContent = (sd.textContent || '').trim();
                c.className = 'tbmk-c ' + (sd.classList.contains('negative') ? 'neg' : (sd.classList.contains('positive') ? 'pos' : 'flat')); }
        });
    }
    function ensureLiveTick() { if (liveTimer) return; liveTimer = setInterval(function () {
        if (currentTab === 'portfolios' && dq('tbmk-v-imoex')) tickLive(); }, 1000); }

    // ---- SVG-иконки ----
    var PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    var DL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    var CHEV_SVG = '<svg class="pf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var UNDO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>';
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
    // «Из CSV-файла» — лист со строками (брокерский отчёт)
    var IMPCSV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><polyline points="14 2.5 14 8 19.5 8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>';
    // глаз / перечёркнутый глаз — управление видимостью карточек портфелей
    var EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYEOFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a19.3 19.3 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.9 9.9 0 0 1 12 4c6.5 0 10 7 10 7a19.4 19.4 0 0 1-3.23 4.35"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

    // ---- меню «Импорт» (расчёт / избранное / ежемесячный доход) ----
    // Каждый источник — карточка с иконкой, названием и подписью: если данные есть — сколько
    // позиций перенесётся, если нет — почему пункт недоступен (понятнее, чем просто «серая кнопка»)
    function impMenuHtml(key, pid) {
        // в шапке и в приглашении пустого портфеля меню раскрывается вниз (места достаточно),
        // в остальных местах (низ карточки настроек) — вверх, чтобы не обрезалось
        var up = key !== 'head' && key.indexOf('none-') !== 0;
        var calcAll = getCalcComposition('all'), calcS = getCalcComposition('stock'), calcB = getCalcComposition('bond'),
            fav = getFavComposition(), mon = getMonthlyComposition();
        function oc(src, sub) { return "pfImport('" + src + "'," + (sub ? "'" + sub + "'" : 'null') + ',' + (pid ? "'" + pid + "'" : 'null') + ')'; }
        function posWord(n) { return n + ' ' + plural(n, 'позиция', 'позиции', 'позиций'); }
        function card(src, sub, ico, title, emptyMsg, list, breakdown) {
            var n = list ? list.length : 0, avail = n > 0;
            return '<button class="pf-impitem' + (avail ? '' : ' off') + '"' + (avail ? '' : ' disabled') +
                ' onclick="' + oc(src, sub) + '">' +
                '<span class="pf-impico">' + ico + '</span>' +
                '<span class="pf-impbody"><b>' + title + '</b><i>' + (avail ? (posWord(n) + (breakdown || '')) : emptyMsg) + '</i></span>' +
                (avail ? '<span class="pf-impgo">' + CHEV_SVG + '</span>' : '') +
            '</button>';
        }
        // явно показываем, что в расчёте учтены ТОЛЬКО акции и облигации (не весь состав калькулятора)
        var nS = calcS ? calcS.length : 0, nB = calcB ? calcB.length : 0;
        var calcBreakdown = (nS || nB)
            ? ' · ' + nS + ' ' + plural(nS, 'акция', 'акции', 'акций') + ', ' + nB + ' ' + plural(nB, 'облигация', 'облигации', 'облигаций') : '';
        var subRow = (nS || nB)
            ? '<div class="pf-impsubs">' +
                (nS ? '<button class="pf-impchip" onclick="' + oc('calc', 'stock') + '">Только акции · ' + nS + '</button>' : '') +
                (nB ? '<button class="pf-impchip" onclick="' + oc('calc', 'bond') + '">Только облигации · ' + nB + '</button>' : '') +
            '</div>' : '';
        // импорт из CSV-файла (брокерский отчёт): всегда доступен, pid прокидывается в клик
        var csvItem = '<button class="pf-impitem" onclick="pfCsvClick(' + (pid ? "'" + pid + "'" : 'null') + ')">' +
            '<span class="pf-impico">' + IMPCSV_SVG + '</span>' +
            '<span class="pf-impbody"><b>Из CSV-файла</b><i>отчёт брокера: тикер · дата · цена · кол-во · [НКД]</i></span>' +
            '<span class="pf-impgo">' + CHEV_SVG + '</span></button>';
        return '<div class="pf-impmenu' + (up ? ' up' : '') + '" id="pfImp-' + key + '">' +
            '<div class="pf-impgrp">Откуда перенести бумаги</div>' +
            card('calc', 'all', IMPCALC_SVG, 'Из расчёта', 'нет сохранённого расчёта', calcAll, calcBreakdown) +
            subRow +
            card('fav', null, IMPFAV_SVG, 'Из избранного', 'нет отмеченных звёздочкой бумаг', fav) +
            card('monthly', null, IMPMON_SVG, 'Из ежемесячного дохода', 'нет облигаций в калькуляторе дохода', mon) +
            csvItem +
            '</div>';
    }
    function impWrapHtml(key, pid) {
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'' + key + '\')">' +
                DL_SVG + 'Импорт' + CHEV_SVG + '</button>' +
            impMenuHtml(key, pid) + '</div>';
    }

    // ---- бэкап (выгрузить/загрузить JSON) — переиспользует попап-инфраструктуру «Импорт» ----
    var XLSTBL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/><path d="M15 10v10"/></svg>';
    function backupWrapHtml() {
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'bkp\')">' + SHIELD_SVG + '<span>Бэкап</span>' + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-bkp">' +
                '<div class="pf-impgrp">Резервная копия</div>' +
                '<button class="pf-impitem" onclick="pfExportData()">' + DL_SVG + 'Выгрузить в файл (JSON)</button>' +
                '<button class="pf-impitem" onclick="pfImportClick()">' + UPLOAD_SVG + 'Загрузить из файла</button>' +
                '<div class="pf-impgrp">Отчёт</div>' +
                '<button class="pf-impitem" onclick="pfExportExcelAll()">' + XLSTBL_SVG + 'Выгрузить в Excel (все позиции)</button>' +
                '<button class="pf-impitem" onclick="pfExportTradesExcel()">' + XLSTBL_SVG + 'Выгрузить сделки (Excel)</button>' +
            '</div>' +
            '<input type="file" id="pfBkpInput" accept="application/json,.json" style="display:none" onchange="pfImportData(this)">' +
        '</div>';
    }

    var LAYOUT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="6" height="16" rx="1.6"/><rect x="9.5" y="4" width="6" height="16" rx="1.6"/><rect x="16.5" y="4" width="5" height="16" rx="1.6"/></svg>';
    // Переключатель «Вид» (обычный/узкий) убран из шапки — раскладку теперь задаёт
    // Конструктор (перетаскивание/ресайз блоков), а вид карточек портфеля стал избыточным.
    // Режим cardViewMode остаётся (по умолчанию 'narrow') и по-прежнему питает раскладку
    // сетки/карточек; pfSetCardView сохранён на случай программного вызова.
    window.pfSetCardView = function (mode) {
        if (mode !== 'normal' && mode !== 'narrow') return;
        if (cardViewMode === mode) { closeImpMenus(); return; }
        cardViewMode = mode;
        try { localStorage.setItem(CARDVIEW_KEY, mode); } catch (e) {}
        closeImpMenus(); renderSmooth();
    };

    // ---- панель действий страницы: живёт не в самой вкладке, а в ГЛОБАЛЬНОЙ шапке
    // сайта (#topBarPfActions, слева от «Поиска») — см. renderPortfolios/switchTab ниже.
    // «Импорт» из неё убран — импортировать состав можно из настроек портфеля (⚙).
    // иконка конструктора: сетка 2×2 (LAYOUT_SVG занят пунктом «Вид»)
    var PFDGRID_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/></svg>';
    function topBarActionsHtml() {
        // «Панель управления» на дашборде собирает ВСЕ контролы страницы — шапку оставляем пустой
        if (pfdPanelActive()) return '';
        return '<button class="d3-quick" onclick="pfAddPortfolio()">' + PLUS_SVG + '<span>Добавить портфель</span></button>' +
            // «Видимость» показываем при 2+ портфелях, при наличии сделок ИЛИ когда включена
            // своя раскладка (тогда в меню — тумблеры скрытых изначальных секций)
            (store.items.length > 1 || hasAnyTrades() || dashCfg.on ? eyeWrapHtml() : '') +
            // Вход в настройку раскладки («Раскладка») переехал в шапку страницы рядом с
            // названием раздела — кнопка #pfLayoutBtn (index.html + updateLayoutBtn/pfLayoutToggle).
            backupWrapHtml();
    }
    // наполняет/показывает панель действий в глобальной шапке; скрывается при уходе со
    // вкладки в обёртке switchTab (см. секцию «ИНТЕГРАЦИЯ» внизу файла)
    function renderTopBarActions() {
        var host = document.getElementById('topBarPfActions'); if (!host) return;
        host.innerHTML = topBarActionsHtml();
        host.style.display = 'flex';
        updateLayoutBtn();   // кнопка «Раскладка» в шапке страницы (рядом с названием раздела)
        pfPresetsFetch();    // подтягиваем общие пресеты (троттлинг 90с; no-op пока supa не готов)
    }

    // ---- «Видимость»: попап управления скрытием карточек (инфраструктура «Импорта») ----
    // Клик по строке прячет/возвращает карточку; попап при этом остаётся открытым, чтобы
    // можно было переключить несколько портфелей подряд (см. pfToggleHidden).
    function eyeWrapHtml() {
        var vis = visibleItems().length, total = store.items.length;
        var multi = total > 1;
        // ---- группа «Портфели» (только при 2+ портфелях) ----
        // «Показать все»/«Скрыть все» — ПОСТОЯННАЯ пара кнопок сверху: строки портфелей
        // ниже не прыгают при переключении (раньше «Показать все» то появлялась, то
        // исчезала — список «мигал» и менял места)
        var showAll = multi
            ? '<div class="pf-eyeall-row">' +
                '<button class="pf-eyeallbtn" onclick="pfEyeShowAll(event)"' + (vis === total ? ' disabled' : '') + '>' + EYE_SVG + 'Показать все</button>' +
                '<button class="pf-eyeallbtn" onclick="pfEyeHideAll(event)"' + (vis === 0 ? ' disabled' : '') + '>' + EYEOFF_SVG + 'Скрыть все</button>' +
              '</div>'
            : '';
        var pfRows = multi ? (showAll + store.items.map(function (p) {
            var c = calcPf(p), off = !!p.hidden;
            return '<button class="pf-impitem pf-eyeitem' + (off ? ' off-eye' : '') + '" onclick="pfToggleHidden(\'' + p.id + '\',event)">' +
                '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                '<span class="pf-impbody"><b>' + esc(p.name) + '</b><i>' + fmtRub(c.value) + (off ? ' · скрыт' : '') + '</i></span>' +
                '<span class="pf-eyestate">' + (off ? EYEOFF_SVG : EYE_SVG) + '</span>' +
            '</button>';
        }).join('')) : '';
        var pfGroup = multi ? '<div class="pf-impgrp">Какие портфели показывать</div>' + pfRows +
            '<div class="pf-eyenote">Скрытые карточки не показываются в сетке и в календаре выплат, но их капитал по-прежнему учитывается в общей сводке.</div>' : '';
        // ---- группа «Секции страницы» — тумблеры видимости блоков ----
        // При включённой своей раскладке (dashCfg.on) сюда попадают скрытые/показанные
        // ИЗНАЧАЛЬНЫЕ блоки, которые МОЖНО скрыть глазом на самой карточке — «Календарь
        // выплат» и «Сводка» (у «Избранного»/«Ставок рынка» скрытия нет). Виджеты
        // возвращаются из «Конструктор → Добавить блок». Плюс всегда — «История сделок».
        var dashSecRows = '';
        if (dashCfg.on) {
            var hasVisHold = store.items.some(function (p) { return !p.hidden && (p.holdings || []).length > 0; });
            var noBondsV = hasVisHold && !calPfCandidates().length;
            var secs = [
                { id: 'cal', name: noBondsV ? 'Ставки' : 'Календарь выплат', sub: noBondsV ? 'ставки денежного рынка' : 'ближайшие купоны и дивиденды', on: true },
                { id: 'sum', name: 'Сводка', sub: 'суммарный капитал по портфелям', on: store.items.length >= 2 }
            ];
            dashSecRows = secs.filter(function (s) { return s.on; }).map(function (s) {
                var hid = !!(dashCfg.hidden || {})[s.id];
                return '<button class="pf-impitem pf-eyeitem' + (hid ? ' off-eye' : '') + '" onclick="pfdToggleSection(\'' + s.id + '\',event)">' +
                    '<span class="pf-eyedot" style="background:#5B7C99"></span>' +
                    '<span class="pf-impbody"><b>' + esc(s.name) + '</b><i>' + esc(hid ? 'скрыт' : s.sub) + '</i></span>' +
                    '<span class="pf-eyestate">' + (hid ? EYEOFF_SVG : EYE_SVG) + '</span></button>';
            }).join('');
        }
        var tradesRow = hasAnyTrades()
            ? '<button class="pf-impitem pf-eyeitem' + (tradesHidden ? ' off-eye' : '') + '" onclick="pfToggleTradesHidden(event)">' +
                '<span class="pf-eyedot" style="background:#5B7C99"></span>' +
                '<span class="pf-impbody"><b>История сделок</b><i>' + (tradesHidden ? 'скрыта' : 'журнал покупок и продаж') + '</i></span>' +
                '<span class="pf-eyestate">' + (tradesHidden ? EYEOFF_SVG : EYE_SVG) + '</span></button>'
            : '';
        var secInner = dashSecRows + tradesRow;
        var secGroup = secInner ? '<div class="pf-impgrp">Секции страницы</div>' + secInner : '';
        return '<div class="pf-impwrap">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'eye\')">' + EYE_SVG + '<span>Видимость</span>' +
                (multi && vis < total ? '<i class="pf-eyecnt">' + vis + '/' + total + '</i>' : '') + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-eye">' + pfGroup + secGroup + '</div></div>';
    }

    // ---- сводка по всем портфелям (только при 2+ портфелях) — компактная карточка ПОД
    // «Избранным» в правой колонке: капитал + вложено/доход + распределение + мини-лидерборд
    // портфелей + кнопки быстрого перехода к таблицам «Рынок · Акции» и «Рынок · Облигации».
    function summaryCardHtml() {
        var inv = 0, val = 0, bondVal = 0, cashTotal = 0, paySum = 0, payPending = false;
        var rows = [];
        store.items.forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value; bondVal += c.bondVal;
            cashTotal += (+p.cash || 0);
            var po = pfPayouts(p);
            if (po.pending) payPending = true; else paySum += po.sum;
            rows.push({ name: p.name, color: p.color, pct: c.pnlPct, value: c.value, has: c.invested > 0, hid: !!p.hidden });
        });
        var pnl = val - inv, pnlPct = inv > 0 ? pnl / inv * 100 : 0;
        var bondPct = val > 0 ? bondVal / val * 100 : 0, stockPct = 100 - bondPct;
        // кэш и полученные выплаты — отдельной строкой (в капитал бумаг и «Доход» не входят)
        var extras = '';
        if (cashTotal > 0 || paySum > 0.005 || payPending) {
            extras = '<div class="pfs2-extras">' +
                (cashTotal > 0 ? '<span title="Свободные деньги всех портфелей — не вложены в бумаги">Кэш <b>' + fmtRub(cashTotal) + '</b></span>' : '') +
                ((paySum > 0.005 || payPending) ? '<span title="Полученные купоны и дивиденды за время владения — по расписаниям MOEX">Выплаты получено <b class="pos">' + (payPending ? '…' : '+' + fmtRub(paySum)) + '</b></span>' : '') +
            '</div>';
        }

        var ranked = rows.slice().sort(function (a, b) {
            if (a.has !== b.has) return a.has ? -1 : 1; return b.pct - a.pct; });
        var hasMany = ranked.filter(function (r) { return r.has; }).length > 1;
        var board = ranked.map(function (r, i) {
            return '<div class="pfs2-row' + (i === 0 && r.has && hasMany ? ' lead' : '') + (r.has ? '' : ' empty') + '">' +
                '<span class="pfs2-rk">' + (i + 1) + '</span>' +
                '<span class="pfs2-n"><i style="background:' + colorVal(r.color) + '"></i><span class="pfs2-nm">' + esc(r.name) + '</span>' +
                    (r.hid ? '<span class="pfs2-hid" title="Карточка скрыта из сетки">' + EYEOFF_SVG + '</span>' : '') + '</span>' +
                '<span class="pfs2-cap">' + (r.value > 0 ? fmtRub(r.value) : '—') + '</span>' +
                '<span class="pfs2-v ' + (r.has ? (r.pct >= 0 ? 'pos' : 'neg') : 'muted') + '">' + (r.has ? fmtPct(r.pct) : '—') + '</span>' +
            '</div>';
        }).join('');

        var GO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        return '<div class="dash2-card pf-sumcard">' +
            '<div class="pfs2-eyebrow"><span class="pfs2-eyebrow-t">Суммарный капитал</span><span class="pfs2-eyebrow-c">' + store.items.length + ' ' + plural(store.items.length, 'портфель', 'портфеля', 'портфелей') + '</span></div>' +
            '<div class="pfs2-capital">' + fmtRub(val) + '</div>' +
            '<div class="pfs2-sub">Вложено ' + fmtRub(inv) + '<span class="pfs2-pnl ' + (pnl >= 0 ? 'pos' : 'neg') + '">' + (pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(pnl)) + ' · ' + fmtPct(pnlPct) + '</span></div>' +
            extras +
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
        var vis = visibleItems();
        if (!vis.length) return allHiddenHtml();
        // рендерим ВСЕ видимые портфели (MAX_CARDS ограничивает только создание новых):
        // раньше slice(0,4) молча прятал карточки 5+ после импорта бэкапа
        var items = vis;
        var narrow = cardViewMode === 'narrow', cols = narrow ? 3 : 2;
        // Раскрытый график выезжает ОВЕРЛЕЕМ в сторону поверх контента (position:absolute) —
        // сетка НЕ перестраивается, карточка не смещается, соседи не «прыгают». Направление
        // выезда зависит от колонки: последняя в ряду тянет влево (.col-right).
        var cards = items.map(function (p, i) { return cardHtml(p, i, i % cols === cols - 1, narrow, narrow && i % cols === 1); }).join('');
        return '<div class="pf-grid' + (narrow ? ' pf-grid--narrow' : '') + '">' + cards + (calCell || '') + '</div>';
    }
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
        var fill = (n.fill === 'full') ? 'full' : 'edge';                     // заливка: кант слева | вся карточка
        return { id: String(n.id || genId('n')), color: color, items: items, due: due, dueStart: dueStart, name: name, fill: fill };
    }
    var dashCfg = loadDashCfg();
    var dashEdit = false;        // режим правки (не персистится)
    var pfdWantRender = false;   // наш собственный ре-рендер в режиме правки
    function loadDashCfg() {
        try {
            var c = JSON.parse(localStorage.getItem(DASH_KEY) || 'null') || {};
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
            return { on: !!c.on, order: Array.isArray(c.order) ? c.order : [], span: c.span || {}, h: c.h || {},
                hidden: c.hidden || {}, col: c.col || {}, notes: notes,
                allocPf: c.allocPf || 'all',                    // выбранный портфель в «Распределении активов»
                saved: c.saved || null };                       // снимок сохранённой раскладки (для «Вернуть сохранённую»)
        } catch (e) { return { on: false, order: [], span: {}, h: {}, hidden: {}, col: {}, notes: [], allocPf: 'all', saved: null }; }
    }
    function saveDashCfg() {
        try {
            // чистим ключи удалённых портфелей — конфиг не копит мусор (и не тащит
            // его в облако через cloud-sync). Скрытые портфели остаются в store.items,
            // их раскладка переживает «скрыть/показать».
            var known = { cal: 1, rates: 1, trades: 1, fav: 1, sum: 1, panel: 1,
                'kpi:cap': 1, 'kpi:day': 1, 'kpi:next': 1, cap: 1, cap2: 1, heat: 1, news: 1, alloc: 1 };
            store.items.forEach(function (p) { known['pf:' + p.id] = 1; });
            (dashCfg.notes || []).forEach(function (n) { known['note:' + n.id] = 1; });
            dashCfg.order = (dashCfg.order || []).filter(function (id) { return known[id]; });
            [dashCfg.span, dashCfg.h, dashCfg.hidden, dashCfg.col].forEach(function (m) {
                Object.keys(m || {}).forEach(function (id) { if (!known[id]) delete m[id]; });
            });
            localStorage.setItem(DASH_KEY, JSON.stringify(dashCfg));
        } catch (e) {}
        // если открыта карточка настройки — держим кнопку «Сохранить/Сохранено» в актуальном
        // состоянии (правка после сохранения снова показывает «Сохранить»)
        try { if (dashEdit) pfdUpdateSaveBtn(); } catch (e) {}
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
    function pfBaseFor(count) { return (pfBaseMap || {})[String(count)] || null; }
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
            }, function () { pfPresetsFetching = false; });
    }
    // сохранить список в облако (только админ/владелец). Локально применяем сразу.
    function pfPresetsPersist(okMsg) {
        if (!pfIsAdmin()) { toast('Пресеты задаёт администратор', true); return; }
        savePresetCache();
        try { updateLayoutBtn(); } catch (e) {}
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
    // ---- шаблонизация: снимок раскладки → портативный (карточки портфелей позиционно) ----
    function pfPresetTemplate(snap) {
        snap = snap || {};
        var order = (snap.order || []).slice();
        var map = {}, i = 0;
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
        function sub(id) { var m = /^pf:#(\d+)$/.exec(id); if (!m) return id; var idx = +m[1]; return idx < real.length ? real[idx] : null; }
        var order = [], seen = {};
        (snap.order || []).forEach(function (id) { var r = sub(id); if (r && !seen[r]) { order.push(r); seen[r] = 1; } });
        function remap(m) { var o = {}; Object.keys(m || {}).forEach(function (k) { var r = sub(k); if (r) o[r] = m[k]; }); return o; }
        var span = remap(snap.span), h = remap(snap.h), hidden = remap(snap.hidden), col = remap(snap.col);
        // портфелей БОЛЬШЕ, чем в пресете — не теряем: добавляем хвост карточек дефолтным размером
        real.forEach(function (id) { if (!seen[id]) { order.push(id); if (span[id] == null) span[id] = 4; } });
        // личные заметки пользователя сохраняем — их блоки дописываем в конец
        (dashCfg.notes || []).forEach(function (n) { var id = 'note:' + n.id; if (order.indexOf(id) === -1) order.push(id); });
        return { order: order, span: span, h: h, hidden: hidden, col: col, allocPf: snap.allocPf || 'all' };
    }
    // структурная подпись раскладки (без заметок) — для отметки «активен» у пресета
    function pfStructSig(c) {
        var keep = function (k) { return k.indexOf('note:') !== 0; };
        function m(o) { var r = {}; Object.keys(o || {}).filter(keep).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
        return JSON.stringify([(c.order || []).filter(keep), m(c.span), m(c.h), m(c.hidden), m(c.col), c.allocPf || 'all']);
    }
    function pfPresetActive(p) {
        try { return pfStructSig(pfPresetInstantiate(p.snap)) === pfStructSig(dashCfg); } catch (e) { return false; }
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
            news: { l: 'Новости', h: 2 }, alloc: { l: 'Активы', h: 2 }
        };
        var DEFSPAN = { fav: 4, cal: 8, sum: 4, panel: 12, rates: 12, trades: 12,
            'kpi:cap': 4, 'kpi:day': 4, 'kpi:next': 4, cap: 6, cap2: 6, heat: 6, news: 6, alloc: 4 };
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
        if (!dashCfg.on && !dashEdit) return false;
        try { if (window.matchMedia('(max-width: 1023px)').matches) return false; } catch (e) {}
        return visibleItems().length > 0;
    }
    // Сетка показана на десктопе → блоки ЖИВЫЕ: перетаскивание (за грип-ручку),
    // ресайз (за кромки/уголок), скрытие и удаление доступны ВСЕГДА, без входа в
    // отдельный режим. dashEdit теперь означает лишь «открыт тулбокс Конструктора»
    // (панель «Добавить виджет / Отменить / Вернуть стандартную»).
    function pfdLive() { return pfdActive(); }
    // Идёт жест — активное перетаскивание или ресайз. На это время фоновые
    // ре-рендеры (котировки приходят пачками) глушим: innerHTML-своп оборвал бы
    // жест на полпути. pfdDragEl/pfdRsCancel объявлены ниже (var-хойстинг), к
    // моменту вызова (пользовательское взаимодействие) уже инициализированы.
    function pfdBusy() { return !!(pfdDragEl || pfdRsCancel); }
    // Ре-рендер, инициированный самим конструктором: во время жеста/открытого
    // пикера фоновые перерисовки глушатся — этот флаг их пропускает.
    function pfdRerender() { pfdWantRender = true; renderSmooth(); }

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
        var colPref = dashCfg.col || {};
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
        pfdHeatRepaintSoon();   // ширина окна/блока изменилась → плитки карты заново
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
    function pfdBlocks(favStr, noBonds) {
        var blocks = [];
        var narrow = cardViewMode === 'narrow';
        var defSpan = narrow ? 4 : 6;
        visibleItems().forEach(function (p, i) {
            // col-right/col-mid не передаём: в свободной сетке колонка блока заранее
            // неизвестна, график всегда выезжает вправо от карточки
            blocks.push({ id: 'pf:' + p.id, name: p.name, htmlFn: function () { return cardHtml(p, i, false, narrow, false); }, span: defSpan });
        });
        blocks.push({ id: 'cal', name: noBonds ? 'Ставки' : 'Календарь выплат', htmlFn: function () { return noBonds ? ratesStackHtml(true, 1, true, 'cal') : paymentCalendarHtml(true, 1); }, span: defSpan });
        // обёртка .pf-topgrid-fav сохраняет прицельные стили правой колонки
        // (одноколоночный .pff-grid и т.п.) и в свободной сетке
        blocks.push({ id: 'fav', name: 'Избранное', htmlFn: function () { return '<div class="pf-topgrid-fav pfd-favwrap">' + favStr + '</div>'; }, span: defSpan });
        if (store.items.length >= 2) {
            blocks.push({ id: 'sum', name: 'Сводка', htmlFn: function () { return '<div class="pf-topgrid-fav pfd-favwrap">' + summaryCardHtml() + '</div>'; }, span: defSpan });
        }
        blocks.push({ id: 'panel', name: 'Панель управления', htmlFn: pfdPanelHtml, span: 12, defHidden: true });
        blocks.push({ id: 'kpi:cap', name: 'KPI · Капитал', htmlFn: function () { return pfdKpiHtml('cap'); }, span: 4, defHidden: true });
        blocks.push({ id: 'kpi:day', name: 'KPI · За сегодня', htmlFn: function () { return pfdKpiHtml('day'); }, span: 4, defHidden: true });
        blocks.push({ id: 'kpi:next', name: 'KPI · Ближайшая выплата', htmlFn: function () { return pfdKpiHtml('next'); }, span: 4, defHidden: true });
        blocks.push({ id: 'cap', name: 'График капитала · линия', htmlFn: function () { return pfdCapChartHtml(); }, span: defSpan, defHidden: true });
        blocks.push({ id: 'cap2', name: 'График капитала · столбцы', htmlFn: function () { return pfdCapChartHtmlB(); }, span: defSpan, defHidden: true });
        blocks.push({ id: 'alloc', name: 'Распределение активов', htmlFn: function () { return pfdAllocHtml(); }, span: 4, defHidden: true });
        blocks.push({ id: 'heat', name: 'Карта рынка', htmlFn: pfdHeatHtml, span: defSpan, defHidden: true });
        blocks.push({ id: 'news', name: 'Новости по позициям', htmlFn: pfdNewsHtml, span: defSpan, defHidden: true });
        // каждая заметка — свой блок note:<id> (мультизаметки, «+» плодит новые)
        (dashCfg.notes || []).forEach(function (nt) {
            blocks.push({ id: 'note:' + nt.id, name: 'Заметка', htmlFn: function () { return pfdNoteHtml(nt); }, span: 4, isNote: true });
        });
        if (!noBonds) blocks.push({ id: 'rates', name: 'Ставки', htmlFn: ratesHtml, span: 12 });
        var tr = tradesHtml();
        if (tr) blocks.push({ id: 'trades', name: 'История сделок', htmlFn: function () { return tr; }, span: 12 });
        return blocks;
    }
    // скрыт ли блок: явный выбор пользователя (cfg.hidden) главнее дефолта блока
    function pfdIsHidden(b) {
        var m = dashCfg.hidden || {};
        return Object.prototype.hasOwnProperty.call(m, b.id) ? !!m[b.id] : !!b.defHidden;
    }
    var PFD_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
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
        '__note': 'Заметки, списки задач и сроки прямо на дашборде'
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
        if (id === '__note' || id.indexOf('note:') === 0) return { ic: NOTE_ICON_SVG, t: 'violet' };
        if (id.indexOf('kpi:') === 0) return { ic: PFD_ICO_KPI, t: 'indigo' };
        if (id === 'cap' || id === 'cap2' || id === 'fam:cap') return { ic: PFD_ICO_CAP, t: 'blue' };
        if (id === 'alloc') return { ic: PFD_ICO_ALLOC, t: 'violet' };
        if (id === 'heat') return { ic: PFD_ICO_HEAT, t: 'green' };
        if (id === 'news') return { ic: PFD_ICO_NEWS, t: 'amber' };
        if (id === 'panel') return { ic: PFDGRID_SVG, t: 'indigo' };
        return { ic: PFDGRID_SVG, t: 'blue' };
    }
    // ---- список «Блоки для дашборда»: строка = иконка + название + описание, превью справа ----
    // Скрытые блоки в дашборде отсутствуют → живая копия в выпадашке — единственная в
    // #pfWrap, её и наполняют штатные pfdHeatRepaintSoon/renderPosNews (карта/новости).
    // Заметку показываем ПРИМЕРОМ (это пользовательский контент, «скрытой» заметки нет).
    var pfdShelfBlocks = [];    // стэш скрытых блоков {id,name,htmlFn} из pfdBodyHtml
    var pfdPickerOpen = false;
    function pfdNoteExampleHtml() {
        return '<div class="dash2-card pf-card2 pf-noteblk pfnt-c-amber pfnt-fill-edge">' +
            '<div class="pf-ch pfnt-head"><div class="pf-ch-l">' +
                '<span class="pfnt-colorwrap"><span class="pfnt-badge">' + NOTE_ICON_SVG + '</span></span>' +
                '<span class="pfnt-title">Заметка</span></div></div>' +
            '<div class="pfnt-list">' +
                '<div class="pfnt-row pfnt-row--text"><div class="pfnt-tx">Идеи и план по портфелю</div></div>' +
                '<div class="pfnt-row pfnt-row--bullet"><span class="pfnt-dash"></span><div class="pfnt-tx">Докупить ОФЗ на просадке</div></div>' +
                '<div class="pfnt-row pfnt-row--check done"><span class="pfnt-check on">' + NOTE_CHECK_SVG + '</span><div class="pfnt-tx">Ребаланс раз в квартал</div></div>' +
            '</div>' +
            '<div class="pfnt-duewrap"><div class="pfnt-due set soon"><span class="pfnt-due-ic">' + NOTE_CLOCK_SVG + '</span>' +
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
            out.push({ d: d.getFullYear() + '-' + pfd2(d.getMonth() + 1) + '-' + pfd2(d.getDate()), v: base + vals[i] * 5200 });
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
            pfCardHead('', 'Новости по позициям', 'наведите бумагу — новость раскроется, нажмите — откроется') +
            '<div class="pfnw-body"><div class="pfnw-list">' + rows + '</div></div></div>';
    }
    // превью справа: БЕЗ белой шапки — сразу готовый блок, а в углу плашка-статус
    // («Демо» — данных нет/недостаточно, показан пример; «Live» — реальные данные рынка/портфеля).
    // достаточно ли РЕАЛЬНЫХ данных у блока для «живого» превью (иначе рисуем демо, даже когда
    // портфель уже собран): график — ≥2 точек; «за сегодня» — есть дневной снимок; «ближайшая
    // выплата» — есть событие; новости — есть загруженная новость по позиции; капитал/карта — всегда.
    function pfdWidgetHasRealData(id) {
        if (id === 'heat' || id === 'kpi:cap') return true;
        if (id === 'kpi:day') return store.items.some(function (p) { return dayDelta(p, calcPf(p).value) != null; });
        if (id === 'kpi:next') return collectUpcomingPayouts().length > 0;
        if (id === 'cap' || id === 'cap2') return pfdCapSeries().length >= 2;
        if (id === 'alloc') return pfdAllocCompute(pfdAllocScope()).total > 0;
        if (id === 'news') return pfdNewsList().some(function (x) { var e = newsHtmlCache[x.tk]; return e && e.html; });
        return true;
    }
    function pfdPickPvHtml(id, name, noPf) {
        // «Live» — данные реальные; «Демо» — данных нет/недостаточно, показываем пример.
        var real = !noPf && pfdWidgetHasRealData(id), stage = '', live = false;
        if (id === '__note') { stage = pfdNoteExampleHtml(); }                              // заметка — всегда образец
        else if (id === 'heat') { stage = pfdHeatHtml(); live = true; }                    // карта рынка живая всегда (не зависит от портфеля)
        else if (id === 'cap') { stage = pfdCapChartHtml(real ? null : pfdDemoCapSeries()); live = real; }    // линия
        else if (id === 'cap2') { stage = pfdCapChartHtmlB(real ? null : pfdDemoCapSeries()); live = real; }  // столбцы
        else if (id === 'alloc') {
            stage = real ? pfdAllocHtml() : pfdAllocHtml({ stock: 620000, bond: 410000, cash: 70000 });
            live = real;
        } else if (real) {
            var b = pfdShelfBlockById(id); stage = b ? b.htmlFn() : ''; live = true;        // собран портфель И данных достаточно
        } else {
            // портфель не собран ИЛИ у блока ещё нет данных → показываем ДЕМО вместо пустого live
            if (id.indexOf('kpi:') === 0) stage = pfdKpiHtml(id.slice(4), PFD_DEMO_KPI);
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
            try { if (document.querySelector('#pfdPickPv .pfhm-box')) pfdHeatRepaintSoon(); } catch (e) {}
            try { if (document.querySelector('#pfdPickPv .pf-newsblk') && document.querySelector('#pfdPickPv .pfd-pick-tag.live')) renderPosNews(); } catch (e) {}
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
        var avail = fam.variants.filter(function (v) { return dashCfg.hidden[v.id] !== 0; });
        var famHas = fam.variants.some(function (v) { return v.id === pflFamPick; });
        if (!famHas || dashCfg.hidden[pflFamPick] === 0) pflFamPick = (avail[0] || fam.variants[0]).id;
        var cards = fam.variants.map(function (v) {
            var added = dashCfg.hidden[v.id] === 0;
            var sel = !added && v.id === pflFamPick;
            // без большой рамки/бейджа «Выбрано» (их было слишком много): одно превью-окно,
            // выбор — тонкое кольцо + маленькая галочка в углу, подпись обычным текстом
            return '<div class="pfl-choice' + (added ? ' added' : '') + (sel ? ' selected' : '') + '" ' +
                (added ? '' : 'role="button" tabindex="0" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfdFamPick(\'' + jsArg(v.id) + '\')" ') + '>' +
                '<div class="pfl-choice-pv">' + pfdPickPvHtml(v.id, v.label, noPf) +
                    (sel || added ? '<span class="pfl-choice-tick' + (added ? ' is-added' : '') + '">' + CHECK_SVG + '</span>' : '') +
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
                    ? '<span class="pfl-pv-add is-added">' + CHECK_SVG + '<span>Добавлено</span></span>'
                    : '<button type="button" class="pfl-pv-add" onclick="pfdAddSelected()">' + PFD_PLUS_SVG + '<span>Добавить виджет</span></button>') +
            '</div>' +
        '</div>';
    }
    // выбор дизайна семейства (рамка): перерисовываем ТОЛЬКО превью (без ре-рендера панели —
    // фокус/список целы), затем перекрашиваем карту, если она в выбранной карточке
    window.pfdFamPick = function (id) {
        if (dashCfg.hidden[id] === 0) return;   // добавленный дизайн не выбираем
        pflFamPick = id;
        var pv = document.getElementById('pfdPickPv'), fam = pfdFamilyOfId(id);
        if (pv && fam) {
            pfdRenderFamilyPreview(pv, fam.key);
            requestAnimationFrame(function () { try { if (document.querySelector('#pfdPickPv .pfhm-box')) pfdHeatRepaintSoon(); } catch (e) {} });
        }
    };
    // добавить конкретный виджет (в т.ч. отдельный дизайн семейства); выбор в списке сохраняем,
    // чтобы после ре-рендера остаться на том же блоке/семействе (кнопка станет «Добавлено»)
    window.pfdAddWidget = function (id) {
        if (dashCfg.hidden[id] === 0) return;   // уже на дашборде
        pfdPushUndo();
        dashCfg.hidden[id] = 0;
        // «Панель управления» — всегда верхней полосой во всю ширину: в НАЧАЛО порядка, span 12
        if (id === 'panel') {
            dashCfg.order = (dashCfg.order || []).filter(function (x) { return x !== 'panel'; });
            dashCfg.order.unshift('panel');
            dashCfg.span = dashCfg.span || {}; dashCfg.span.panel = 12;
            dashCfg.col = dashCfg.col || {}; dashCfg.col.panel = 1;
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
            if (pflFamPick && dashCfg.hidden[pflFamPick] !== 0) pfdAddWidget(pflFamPick);
            return;
        }
        if (!id) return;
        if (id === '__note') { pfdAddNote(); return; }
        pfdAddWidget(id);
        pflSelectedId = null;   // блок ушёл со списка → pflInitPreview выберет следующий
    };
    // выбрать первую (или ранее выбранную) строку и показать её превью после ре-рендера
    function pflInitPreview() {
        var list = document.querySelector('#pflPanel .pfd-picker-list'); if (!list) return;
        var rows = Array.prototype.slice.call(list.querySelectorAll('.pfd-pick')); if (!rows.length) return;
        var target = null;
        if (pflSelectedId) target = rows.filter(function (r) { return r.getAttribute('data-pick') === pflSelectedId; })[0];
        if (!target) target = rows[0];
        pfdPickPreview(target.getAttribute('data-pick'));
    }

    function pfdBodyHtml(favStr, noBonds) {
        var blocks = pfdBlocks(favStr, noBonds);
        var byId = {};
        blocks.forEach(function (b) { byId[b.id] = b; });
        var ordered = [];
        (dashCfg.order || []).forEach(function (id) {
            if (byId[id]) { ordered.push(byId[id]); delete byId[id]; }
        });
        blocks.forEach(function (b) { if (byId[b.id]) ordered.push(b); });   // новые блоки — в конец
        var shown = [], hiddenB = [];
        ordered.forEach(function (b) { (pfdIsHidden(b) ? hiddenB : shown).push(b); });

        var items = shown.map(function (b) {
            var html = b.htmlFn();
            if (!html) return '';
            var span = clamp(+(dashCfg.span[b.id]) || b.span, 3, 12);
            var h = +(dashCfg.h[b.id]) || 0;
            var isPanel = b.id === 'panel';
            var minH = isPanel ? 72 : 240;   // «Панель управления» — низкая полоса, свой минимум
            // Панель — контент-бар: заданная высота работает как МИНИМУМ (растёт под контент при
            // узкой ширине — кнопки не режутся), БЕЗ hset-клипа (меню/поповеры не обрезаются).
            var style = 'grid-column: span ' + span + ';' +
                (h ? ((isPanel ? 'min-height:' : 'height:') + clamp(h, minH, 1400) + 'px;') : '');
            var hsetClass = (h && !isPanel) ? ' pfd-hset' : '';
            // Кнопка «скрыть/удалить» блока:
            //  • заметка / портфель — СВОЯ кнопка уже есть в шапке карточки (pfnt-trash / глаз .pfc-act),
            //    в chrome не дублируем;
            //  • ВИДЖЕТ (defHidden: KPI/график/карта/новости) — УДАЛИТЬ (корзина .pfd-cardrm ВНУТРИ
            //    карточки, как у заметки, по hover), вернётся из «Конструктор → Добавить блок»;
            //  • «Календарь выплат»/«Сводка» — СКРЫТЬ глазом .pfc-act В ШАПКЕ карточки (.pfd-eye,
            //    правый-верхний угол напротив заголовка, ТОЧНО как у портфеля, виден всегда), вернуть
            //    — через меню «Видимость» в шапке;
            //  • «История сделок» — своего on-card глаза НЕТ (правый угол шапки занят .pft-toggle);
            //    скрыть/показать — из меню «Видимость»;
            //  • «Избранное»/«Ставки рынка» — без кнопки (их не скрываем).
            var hideBtn = '';
            if (b.isNote || b.id.indexOf('pf:') === 0) {
                hideBtn = '';
            } else if (b.defHidden) {
                // корзина ВНУТРИ карточки (как у заметки .pfnt-trash): тихая иконка в правом-верхнем
                // углу шапки, проявляется по hover; у виджетов с контролами в шапке место освобождает
                // .pfd-rmable (padding-right), у KPI шапки нет — угол и так свободен
                hideBtn = '<button class="pfd-cardrm" title="Удалить виджет (вернуть — «Добавить блок» в Конструкторе)" aria-label="Удалить виджет" onclick="pfdHideBlock(\'' + jsArg(b.id) + '\')">' + NOTE_TRASH_SVG + '</button>';
            } else if (b.id === 'cal' || b.id === 'sum') {
                // глаз-скрытие — ТОЧНО как в карточке портфеля (.pfc-act), в правом-верхнем углу
                // напротив заголовка, видимый постоянно (не в зазоре-бирке). Исключение: когда
                // блок cal показывает «Ставки рынка» (noBonds) — заголовка нет, а глаз сидит в
                // последней плитке (см. ratesStackHtml), угловой оверлей не нужен.
                if (!(b.id === 'cal' && noBonds)) {
                    hideBtn = '<span class="pfd-eye"><button class="pfc-act" title="Скрыть блок (вернуть — «Видимость» в шапке)" aria-label="Скрыть блок" onclick="pfdHideBlock(\'' + jsArg(b.id) + '\')">' + EYEOFF_SVG + '</button></span>';
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
            return '<div class="pfd-item' + hsetClass + (b.defHidden ? ' pfd-rmable' : '') + '" data-pfd="' + esc(b.id) + '" style="' + style + '">' +
                chrome +
                '<div class="pfd-body">' + html + '</div>' +
            '</div>';
        }).join('');

        // Полка скрытых блоков для карточки «Настройка раскладки» (список + превью).
        // Содержимое превью собирается ЛЕНИВО при выборе строки — блоки тяжёлые.
        pfdShelfBlocks = hiddenB.slice();
        pfdPickerOpen = false;
        // Карточка настройки раскладки открывается кнопкой «Раскладка» в шапке страницы
        // (dashEdit) и живёт НАД сеткой; в ней шапка (Вернуть стандартную / Сохранить / ✕)
        // и список блоков с превью. Сама сетка ниже остаётся живой (drag/resize/скрытие).
        var panel = dashEdit ? pflPanelHtml() : '';
        return panel + '<div class="pfd-grid pfd-masonry pfd-live' + (dashEdit ? ' editing' : '') + '" id="pfdGrid">' + items + '</div>';
    }
    // ---- сохранённая раскладка: снимок + сравнение (для «Сохранено» и «Вернуть сохранённую») ----
    // Каждая правка автосохраняется в pf_dash_v1 (рабочее состояние переживает перезагрузку),
    // но «Сохранить» отдельно кладёт КОНТРОЛЬНУЮ ТОЧКУ (dashCfg.saved). Пока рабочий вид совпадает
    // с ней — кнопка показывает «Сохранено»; изменил что-то — снова «Сохранить». А «Вернуть
    // сохранённую» откатывает рабочий вид к этой точке.
    function pfdSavedSnap() {
        return { order: (dashCfg.order || []).slice(),
            span: Object.assign({}, dashCfg.span), h: Object.assign({}, dashCfg.h),
            hidden: Object.assign({}, dashCfg.hidden), col: Object.assign({}, dashCfg.col),
            notes: JSON.parse(JSON.stringify(dashCfg.notes || [])),
            allocPf: dashCfg.allocPf || 'all' };
    }
    function pfdCanonMap(m) { var o = {}; Object.keys(m || {}).sort().forEach(function (k) { o[k] = m[k]; }); return o; }
    function pfdLayoutSig(snap) {
        snap = snap || {};
        return JSON.stringify([snap.order || [], pfdCanonMap(snap.span), pfdCanonMap(snap.h),
            pfdCanonMap(snap.hidden), pfdCanonMap(snap.col), snap.allocPf || 'all',
            (snap.notes || []).map(function (n) { return [n.id, n.text || '', n.items || [], n.due || '']; })]);
    }
    function pfdLayoutSaved() { return !!(dashCfg.saved && pfdLayoutSig(pfdSavedSnap()) === pfdLayoutSig(dashCfg.saved)); }
    // обновить кнопку «Сохранить/Сохранено» и доступность «Вернуть сохранённую» без ре-рендера
    function pfdUpdateSaveBtn() {
        var btn = document.getElementById('pflSaveBtn');
        if (btn) {
            var done = pfdLayoutSaved();
            btn.classList.toggle('done', done);
            btn.innerHTML = (done ? CHECK_SVG + '<span>Сохранено</span>' : CHECK_SVG + '<span>Сохранить раскладку</span>');
            btn.title = done ? 'Текущий вид уже сохранён' : 'Закрепить текущую раскладку за собой';
        }
        var rst = document.getElementById('pflRestoreBtn');
        if (rst) rst.style.display = dashCfg.saved ? '' : 'none';
    }
    // карточка «Настройка раскладки»: шапка (только заголовок + ✕), тело (список+превью),
    // ПОДВАЛ с действиями раскладки (Стандартная / Сохранённая / Сохранить) — блок действий
    // вынесен из шапки карточки вниз, чтобы шапка не была перегружена и читалась ясно.
    function pflPanelHtml() {
        return '<div class="pfl-panel" id="pflPanel">' +
            '<div class="pfl-head">' +
                '<div class="pfl-head-t">' +
                    '<span class="pfl-head-ic">' + PFD_PLUS_SVG + '</span>' +
                    '<div class="pfl-head-tx"><b>Добавить виджет</b>' +
                        '<span>Выберите блок слева — справа появится превью; настройки раскладки — в иконке рядом с кнопкой</span></div>' +
                '</div>' +
                '<button type="button" class="pfl-x" onclick="pfLayoutClose()" aria-label="Закрыть">' + XMARK_SVG + '</button>' +
            '</div>' +
            '<div class="pfl-body">' + pfdPickerInner() + '</div>' +
        '</div>';
    }
    // ---- поповер раскладки (иконка рядом с «Добавить виджет»): базовая/индивидуальная/сохранить.
    // Наполняется из updateLayoutBtn при каждом ре-рендере — состояние всегда актуально.
    function pfLayoutCfgPopHtml() {
        var saved = pfdLayoutSaved();
        var admin = pfIsAdmin();
        var count = visibleItems().length;
        var hasBase = !!pfBaseFor(count);
        var PIN_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>';
        var pfW = plural(count, 'портфель', 'портфеля', 'портфелей');
        var html = '<div class="pfl-cfg-h">Раскладка</div>' +
            '<div class="pfl-cfg-baserow">' +
                '<button type="button" class="pfl-cfg-item" onclick="pfLayoutReset()" title="Вернуть базовую раскладку для ' + count + ' ' + pfW + '">' + PFDGRID_SVG +
                    '<span><b>Базовая</b><i>' + (hasBase ? 'своя · ' : 'стандартная · ') + count + ' ' + pfW + '</i></span></button>' +
                (admin ? '<button type="button" class="pfl-cfg-mini" onclick="pfSetBasePreset()" title="Сделать текущую раскладку базовой для ' + count + ' ' + pfW + ' (для всех)" aria-label="Сделать базовой">' + PIN_IC + '</button>' : '') +
                (admin && hasBase ? '<button type="button" class="pfl-cfg-mini" onclick="pfResetBasePreset()" title="Сбросить базовую для ' + count + ' ' + pfW + ' к системной" aria-label="Сбросить базовую">' + UNDO_SVG + '</button>' : '') +
            '</div>' +
            (dashCfg.saved
                ? '<button type="button" class="pfl-cfg-item" onclick="pfLayoutRestoreSaved()">' + UNDO_SVG +
                    '<span><b>Индивидуальная</b><i>ваша сохранённая раскладка</i></span></button>'
                : '');
        // ---- готовые пресеты: задаёт админ, выбирают все ----
        html += '<div class="pfl-cfg-sep"></div><div class="pfl-cfg-h">Готовые пресеты</div>';
        if (pfPresetList.length) {
            html += '<div class="pfl-cfg-list">' + pfPresetList.map(function (p) {
                var act = pfPresetActive(p);
                return '<div class="pfl-cfg-preset' + (act ? ' active' : '') + '">' +
                    '<button type="button" class="pfl-cfg-preset-card" onclick="pfApplyPreset(\'' + esc(p.id) + '\')" title="Применить пресет ко всей раскладке">' +
                        '<span class="pfl-cfg-thumb">' + pfPresetThumbSvg(p.snap) + '</span>' +
                        '<span class="pfl-cfg-preset-cap"><b>' + esc(p.name || 'Пресет') + '</b>' +
                            (act ? '<i class="pfl-cfg-badge">активен</i>' : '<i class="pfl-cfg-apply">применить</i>') + '</span>' +
                    '</button>' +
                    (admin ? '<button type="button" class="pfl-cfg-del" onclick="pfDeletePreset(\'' + esc(p.id) + '\', event)" title="Удалить пресет у всех" aria-label="Удалить">' + XMARK_SVG + '</button>' : '') +
                '</div>';
            }).join('') + '</div>';
        } else {
            html += '<div class="pfl-cfg-empty">' + (admin ? 'Соберите раскладку и сохраните её как пресет — он появится у всех.' : 'Пресетов пока нет.') + '</div>';
        }
        if (admin) {
            html += '<button type="button" class="pfl-cfg-item add" onclick="pfSaveAsPreset()" title="Сделать текущую раскладку общим пресетом">' + PFD_PLUS_SVG +
                '<span><b>Сохранить как пресет</b><i>для всех пользователей</i></span></button>';
        }
        // ---- личное сохранение ----
        html += '<div class="pfl-cfg-sep"></div>' +
            '<button type="button" class="pfl-cfg-item primary' + (saved ? ' done' : '') + '" onclick="pfLayoutSave()">' + CHECK_SVG +
                '<span><b>' + (saved ? 'Сохранено' : 'Сохранить текущую раскладку') + '</b></span></button>';
        return html;
    }
    window.pfLayoutCfgPopHtml = pfLayoutCfgPopHtml;
    // подвал карточки настройки — блок управления раскладкой
    function pflFootHtml() {
        var done = pfdLayoutSaved();
        return '<div class="pfl-foot">' +
            '<div class="pfl-foot-l">' +
                '<button type="button" class="pfl-btn ghost" onclick="pfLayoutReset()" title="Классический вид: карточки в ряд, «Избранное» справа, без виджетов">' + PFDGRID_SVG + '<span>Стандартная</span></button>' +
                '<button type="button" class="pfl-btn ghost" id="pflRestoreBtn" onclick="pfLayoutRestoreSaved()" style="' + (dashCfg.saved ? '' : 'display:none') + '" title="Откатить к вашей сохранённой раскладке">' + UNDO_SVG + '<span>Сохранённая</span></button>' +
            '</div>' +
            '<button type="button" class="pfl-btn primary' + (done ? ' done' : '') + '" id="pflSaveBtn" onclick="pfLayoutSave()" title="' + (done ? 'Текущий вид уже сохранён' : 'Закрепить текущую раскладку за собой') + '">' + CHECK_SVG + '<span>' + (done ? 'Сохранено' : 'Сохранить раскладку') + '</span></button>' +
        '</div>';
    }

    // ---- «Раскладка»: открыть/закрыть карточку настройки, сохранить, вернуть стандартную ----
    // Правка блоков (перенос/ресайз/скрытие) живёт ВСЕГДА при живой сетке (dashCfg.on) — карточка
    // лишь показывает список блоков для добавления и кнопки сохранения/сброса. dashEdit = карточка
    // открыта. Кнопка «Раскладка» в шапке страницы — единственная точка входа (#pfLayoutBtn).
    // подсветка кнопки «Раскладка»: показ/скрытие + точка «своя раскладка» + нажатое состояние
    // Кнопка «Настроить вид» в ШАПКЕ страницы (рядом с названием раздела): показ/скрытие +
    // точка «своя раскладка» + нажатое состояние. Только десктоп, только на вкладке «Портфели».
    function updateLayoutBtn() {
        var b = document.getElementById('pfLayoutBtn'); if (!b) return;
        // при активной «Панели управления» ВСЕ контролы страницы живут в ней — шапку прячем
        var show = (currentTab === 'portfolios' && store.items.length && !pfdPanelActive());
        // базовый стиль кнопки — display:none, поэтому показываем ЯВНЫМ inline-flex
        b.style.display = show ? 'inline-flex' : 'none';
        var sep = document.getElementById('pfLayoutSep');
        if (sep) sep.style.display = show ? 'inline-block' : 'none';
        b.classList.toggle('on', !!dashCfg.on);
        b.classList.toggle('active', !!dashEdit);
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
    // клик по кнопке «Раскладка»: открыть карточку (или закрыть, если уже открыта)
    window.pfLayoutToggle = function (ev) {
        if (ev) ev.stopPropagation();
        if (dashEdit) { window.pfLayoutClose(); return; }
        try { if (window.matchMedia('(max-width: 1023px)').matches) { toast('Настройка раскладки доступна на широком экране', true); return; } } catch (e) {}
        if (!visibleItems().length) { toast('Сначала добавьте портфель — пока нечего расставлять', true); return; }
        if (!dashCfg.on) { dashCfg.on = true; saveDashCfg(); }
        dashEdit = true;
        closeImpMenus();
        pfdRerender();          // отрисует карточку; pflInitPreview выберет первый блок
        updateLayoutBtn();
    };
    // закрыть карточку (✕): режим своей раскладки НЕ выключаем — сетка остаётся живой,
    // расстановка уже автосохранена; пользователь может тащить/менять блоки и без карточки
    window.pfLayoutClose = function () {
        if (pfdDragEl) pfdEndDrag(true);
        if (pfdRsCancel) pfdRsCancel();
        dashEdit = false;
        closeImpMenus();
        pfdRerender();
        updateLayoutBtn();
    };
    // «Сохранить раскладку»: закрепить КОНТРОЛЬНУЮ ТОЧКУ (dashCfg.saved) — к ней можно
    // вернуться после дальнейших правок. Карточку НЕ закрываем: кнопка сразу показывает
    // «Сохранено», и видно, что дальнейшие изменения снова сделают её «Сохранить».
    window.pfLayoutSave = function () {
        pfdFlushNotes();
        if (pfdLayoutSaved()) { toast('Этот вид уже сохранён'); return; }
        dashCfg.saved = pfdSavedSnap();
        saveDashCfg();
        pfdUpdateSaveBtn();
        updateLayoutBtn();   // освежить поповер раскладки в шапке (кнопка → «Сохранено»)
        toast('Раскладка сохранена — закреплена за вами');
    };
    // «Вернуть сохранённую» — откатить рабочий вид к последней контрольной точке
    window.pfLayoutRestoreSaved = function () {
        if (!dashCfg.saved) { toast('Сохранённой раскладки пока нет', true); return; }
        pfdPushUndo();
        var s = dashCfg.saved;
        dashCfg.on = true;
        dashCfg.order = (s.order || []).slice();
        dashCfg.span = Object.assign({}, s.span); dashCfg.h = Object.assign({}, s.h);
        dashCfg.hidden = Object.assign({}, s.hidden); dashCfg.col = Object.assign({}, s.col);
        dashCfg.notes = JSON.parse(JSON.stringify(s.notes || []));
        dashCfg.allocPf = s.allocPf || 'all';
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
        var order = [], col = {}, span = {};
        var pfIds = visibleItems().map(function (p) { return 'pf:' + p.id; });
        var n = pfIds.length;
        var cardSpan, favSpan, favCol;
        if (n >= 1 && n <= 3) {
            // карточки + «Избранное» делят 12 колонок поровну: 1→6|6, 2→4·4|4, 3→3·3·3|3
            var slots = n + 1;
            cardSpan = Math.floor(12 / slots);
            favSpan = 12 - cardSpan * n;               // остаток отдаём «Избранному» (ровно 12)
            pfIds.forEach(function (id, i) { order.push(id); span[id] = cardSpan; col[id] = 1 + i * cardSpan; });
            favCol = 1 + n * cardSpan;
        } else {
            // 0 или 4+ карточек: «Избранное» правой колонкой (9–12), карточки по 2 в ряд слева
            cardSpan = 4; favSpan = 4; favCol = 9;
            pfIds.forEach(function (id, i) { order.push(id); span[id] = cardSpan; col[id] = 1 + (i % 2) * 4; });
        }
        order.push('fav'); span.fav = favSpan; col.fav = favCol;
        if (store.items.length >= 2) { order.push('sum'); span.sum = favSpan; col.sum = favCol; }
        order.push('cal'); span.cal = Math.max(favCol - 1, 3); col.cal = 1;   // широкая полоса слева
        order.push('rates'); span.rates = 12; col.rates = 1;
        order.push('trades'); span.trades = 12; col.trades = 1;
        return { order: order, col: col, span: span };
    }
    // «Базовая» = для ТЕКУЩЕГО числа портфелей: если владелец/админ задал свою базовую для
    // этого числа (pfBaseMap) — берём её (шаблон → реальные портфели), иначе системную pfdStandardCfg.
    window.pfLayoutReset = function () {
        pfdPushUndo();
        var count = visibleItems().length;
        var base = pfBaseFor(count);
        if (base) {
            var c = pfPresetInstantiate(base);
            dashCfg = { on: true, order: c.order, span: c.span, h: c.h, hidden: c.hidden, col: c.col,
                notes: dashCfg.notes || [], allocPf: c.allocPf, saved: dashCfg.saved || null };
        } else {
            var std = pfdStandardCfg();
            dashCfg = { on: true, order: std.order, span: std.span, h: {}, hidden: {}, col: std.col,
                notes: dashCfg.notes || [], allocPf: dashCfg.allocPf || 'all', saved: dashCfg.saved || null };
        }
        dashEdit = false;
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
        pfdFlushNotes();
        pfBaseMap[String(count)] = pfPresetTemplate(pfdSavedSnap());
        pfPresetsPersist('Базовая для ' + count + ' портф. сохранена — у всех');
    };
    window.pfResetBasePreset = function () {
        if (!pfIsAdmin()) return;
        var count = visibleItems().length;
        if (!pfBaseFor(count)) return;
        delete pfBaseMap[String(count)];
        pfPresetsPersist('Базовая для ' + count + ' портф. сброшена к системной');
    };
    // совместимость со старыми вызовами (Esc-хендлер и т.п.)
    window.pfDashToggleEdit = function () { if (dashEdit) window.pfLayoutClose(); else window.pfLayoutToggle(); };
    window.pfDashReset = window.pfLayoutReset;

    // ---- глобальные пресеты: применить (все) / сохранить как пресет (админ) / удалить (админ) ----
    window.pfApplyPreset = function (id) {
        var p = pfPresetList.filter(function (x) { return x.id === id; })[0];
        if (!p) { toast('Пресет не найден', true); return; }
        if (!visibleItems().length) { toast('Сначала добавьте портфель', true); return; }
        pfdPushUndo();
        var c = pfPresetInstantiate(p.snap);
        dashCfg.on = true;
        dashCfg.order = c.order; dashCfg.span = c.span; dashCfg.h = c.h;
        dashCfg.hidden = c.hidden; dashCfg.col = c.col; dashCfg.allocPf = c.allocPf;
        saveDashCfg();
        dashEdit = false;
        pfdRerender();
        updateLayoutBtn();
        toast('Применён пресет «' + (p.name || 'без имени') + '»');
    };
    window.pfSaveAsPreset = function () {
        if (!pfIsAdmin()) { toast('Пресеты задаёт администратор', true); return; }
        if (!pfCloudOn() || !(pfSupa().isAuthed && pfSupa().isAuthed())) { toast('Нужен вход в аккаунт', true); return; }
        pfdFlushNotes();
        pfPresetNameModal('', function (name) {
            var snap = pfPresetTemplate(pfdSavedSnap());
            var by = (pfSupa().session && pfSupa().session.user) ? pfSupa().session.user.id : null;
            pfPresetList = pfPresetList.concat([{ id: genId('pre'), name: name.slice(0, 40) || 'Пресет', snap: snap, at: Date.now(), by: by }]);
            pfPresetsPersist('Пресет «' + (name || 'Пресет') + '» доступен всем');
        });
    };
    window.pfDeletePreset = function (id, ev) {
        if (ev) ev.stopPropagation();
        if (!pfIsAdmin()) return;
        var p = pfPresetList.filter(function (x) { return x.id === id; })[0]; if (!p) return;
        pfConfirm({ danger: true, title: 'Удалить пресет?', text: '«' + esc(p.name || 'Пресет') + '» исчезнет у всех пользователей.', ok: 'Удалить' }, function () {
            pfPresetList = pfPresetList.filter(function (x) { return x.id !== id; });
            pfPresetsPersist('Пресет удалён');
        });
    };
    // маленькая модалка ввода имени пресета (реюз оформления pfConfirm)
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
        var pfdNarrowH = function (ev) { if (ev.matches && dashEdit) window.pfLayoutClose(); };
        if (pfdNarrowMq.addEventListener) pfdNarrowMq.addEventListener('change', pfdNarrowH);
        else if (pfdNarrowMq.addListener) pfdNarrowMq.addListener(pfdNarrowH);
    } catch (e) {}

    // ---- скрытие/возврат блоков (крестик на бирке + полка «Добавить блок») ----
    window.pfdHideBlock = function (id) {
        pfdPushUndo();
        dashCfg.hidden[id] = 1;
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
        dashCfg.hidden[id] = 0;
        saveDashCfg();
        pfdRerender();
        pfdScrollToBlock(id);
    };

    // ---- undo: каждый шаг правки кладёт снимок раскладки, Cmd/Ctrl+Z возвращает ----
    // Стек живёт в памяти на сессию правки (вход в режим начинает новую).
    var pfdUndoStack = [];
    function pfdCfgSnap() { return JSON.stringify({ order: dashCfg.order, span: dashCfg.span, h: dashCfg.h, hidden: dashCfg.hidden, col: dashCfg.col, notes: dashCfg.notes }); }
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
            dashCfg.order = o.order || []; dashCfg.span = o.span || {};
            dashCfg.h = o.h || {}; dashCfg.hidden = o.hidden || {}; dashCfg.col = o.col || {}; dashCfg.notes = o.notes || [];
        } catch (e) { return; }
        saveDashCfg();
        pfdRerender();
    };
    // ---- мультизаметки: добавить / удалить / перекрасить + строки/срок ----
    function pfdFindNote(id) { return (dashCfg.notes || []).filter(function (n) { return n.id === id; })[0]; }
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
    window.pfdAddNote = function () {
        pfdFlushNotes();
        pfdPushUndo();
        var id = genId('n');
        dashCfg.notes = (dashCfg.notes || []).concat([pfdNormNote({ id: id })]);
        dashCfg.hidden['note:' + id] = 0;
        // новую заметку — сразу после последней имеющейся заметки в порядке (или в конец)
        var ord = (dashCfg.order || []).slice();
        var lastNoteIdx = -1;
        for (var i = 0; i < ord.length; i++) if (ord[i].indexOf('note:') === 0) lastNoteIdx = i;
        if (lastNoteIdx >= 0) ord.splice(lastNoteIdx + 1, 0, 'note:' + id); else ord.push('note:' + id);
        dashCfg.order = ord;
        saveDashCfg();
        pfdRerender();
        pfdScrollToBlock('note:' + id);
    };
    window.pfdRemoveNote = function (blockId) {
        var id = String(blockId).replace(/^note:/, '');
        pfdFlushNotes();
        pfdPushUndo();
        dashCfg.notes = (dashCfg.notes || []).filter(function (n) { return n.id !== id; });
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
    // заливка заметки: кант слева (edge) | вся карточка (full) — перекраска классом, без ре-рендера
    window.pfdSetNoteFill = function (id, fill, ev) {
        if (ev) ev.stopPropagation();
        fill = fill === 'full' ? 'full' : 'edge';
        var nt = pfdFindNote(id); if (!nt || nt.fill === fill) return;
        var card = pfdNoteCard(id);
        pfdPushUndo(); nt.fill = fill; saveDashCfg();
        if (card) {
            card.classList.toggle('pfnt-fill-full', fill === 'full');
            card.classList.toggle('pfnt-fill-edge', fill === 'edge');
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
        pfConfirm({ danger: true, title: 'Удалить ' + esc(ttl) + '?', text: 'Заметка со всеми пунктами будет удалена. Отменить можно сочетанием Cmd/Ctrl+Z в конструкторе.', ok: 'Удалить' }, function () {
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
    function pfdDueDateText(ts) {
        var d = new Date(ts);
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    // текст чипа срока: однодневный «12 июл, 09:30» или ПЕРИОД «12 июл — 19 июл, 09:30»
    function pfdDueText(nt) {
        if (nt.dueStart == null) return pfdDueDateText(nt.due);
        var a = new Date(nt.dueStart), b = new Date(nt.due);
        var dm = { day: 'numeric', month: 'short' };
        var tm = b.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        return a.toLocaleDateString('ru-RU', dm) + ' — ' + b.toLocaleDateString('ru-RU', dm) + ', ' + tm;
    }
    function pfdDueCountdown(ts) {
        var diff = ts - Date.now(), over = diff < 0, a = Math.abs(diff);
        var d = Math.floor(a / 86400000), h = Math.floor(a % 86400000 / 3600000), m = Math.floor(a % 3600000 / 60000), s = Math.floor(a % 60000 / 1000);
        var body = d > 0 ? (d + ' дн ' + h + ' ч') : (h > 0 ? (h + ' ч ' + m + ' мин') : (m + ' мин ' + s + ' с'));
        return { txt: (over ? 'просрочено · ' + body : 'осталось ' + body), cls: over ? 'over' : (diff < 86400000 ? 'soon' : 'ok') };
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
            store.items.forEach(function (p) {
                var c = calcPf(p); inv += c.invested; val += c.value;
                var d = dayDelta(p, c.value); if (d != null) { dd += d; hasDd = true; }
                var m = topMover(p); if (m && (!mv || Math.abs(m.chg) > Math.abs(mv.chg))) mv = m;
            });
        }
        var ic, label, vHtml, vCls = '', sub, ac;
        if (kind === 'cap') {
            var pnl = val - inv, pct = inv > 0 ? pnl / inv * 100 : 0;
            ic = '<rect x="2" y="7" width="20" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/>';
            label = 'Суммарный капитал'; ac = '#3d6fd1';
            vHtml = fmtRub(val);
            sub = 'Вложено ' + fmtRub(inv) + ' · <b class="' + (pnl >= 0 ? 'pos' : 'neg') + '">' + (pnl >= 0 ? '▲ ' : '▼ ') + fmtRub(Math.abs(pnl)) + ' · ' + fmtPct(pct) + '</b>';
        } else if (kind === 'day') {
            ic = '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>';
            label = 'За сегодня'; ac = hasDd ? (dd >= 0 ? '#119d5c' : '#c2410c') : '#64748b';
            vHtml = hasDd ? (dd >= 0 ? '+' : '−') + fmtRub(Math.abs(dd)) : '—';
            vCls = hasDd ? (dd >= 0 ? ' pos' : ' neg') : '';
            sub = hasDd
                ? ((mv && Math.abs(mv.chg) >= 1) ? 'Сильнее всех: ' + esc(mv.t) + ' <b class="' + (mv.chg >= 0 ? 'pos' : 'neg') + '">' + fmtPct(mv.chg) + '</b> за день' : 'к последнему дневному снимку')
                : 'появится со второго дня наблюдения';
        } else {
            var ev = demo ? demo.ev : collectUpcomingPayouts()[0];
            ic = '<rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>';
            label = 'Ближайшая выплата'; ac = '#119d5c';
            vHtml = ev ? '+' + fmtRub(ev.amount) : '—';
            vCls = ev ? ' pos' : '';
            sub = ev ? esc(ev.ticker) + ' · ' + ruDate(dateToIso(ev.date)) + ' · ' + esc(daysUntilText(ev.date))
                : 'нет запланированных выплат на год вперёд';
        }
        return '<div class="dash2-card pf-kpi" style="--ac:' + ac + '">' +
            '<div class="pf-kpi-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ic + '</svg></div>' +
            '<div class="pf-kpi-body">' +
                '<div class="pf-kpi-l">' + label + '</div>' +
                '<div class="pf-kpi-v' + vCls + '">' + vHtml + '</div>' +
                '<div class="pf-kpi-s">' + sub + '</div>' +
            '</div></div>';
    }

    // ---- «Панель управления» (виджет-герой): полноширинная тёмная полоса в стиле верхнего
    // блока «Ребаланса». Слева — идентити + KPI (капитал · за сегодня), справа — ВСЕ контролы
    // страницы (добавить виджет/портфель, Excel, видимость, бэкап, раскладка). Пока панель на
    // дашборде — те же кнопки в шапке страницы скрыты (topBarActionsHtml/updateLayoutBtn через
    // pfdPanelActive). Удаляется штатной корзиной .pfd-cardrm (defHidden) → кнопки возвращаются.
    function pfdPanelActive() {
        if (!dashCfg.on) return false;                                   // панель живёт только в живой сетке
        try { if (window.matchMedia('(max-width: 1023px)').matches) return false; } catch (e) {}
        return (dashCfg.hidden || {}).panel === 0;                       // defHidden:true → активна лишь явным показом
    }
    var PFP_EXCEL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M9.5 12.5l5 5M14.5 12.5l-5 5"/></svg>';
    var PFP_SLIDERS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="20" y2="8"/><circle cx="16" cy="8" r="2"/><line x1="4" y1="16" x2="6" y2="16"/><line x1="10" y1="16" x2="20" y2="16"/><circle cx="8" cy="16" r="2"/></svg>';
    function pfdPanelHtml() {
        // KPI считаем как в pfdKpiHtml — по ВСЕМ портфелям (скрытые тоже: деньги не исчезают)
        var inv = 0, val = 0, dd = 0, hasDd = false;
        store.items.forEach(function (p) {
            var c = calcPf(p); inv += c.invested; val += c.value;
            var d = dayDelta(p, c.value); if (d != null) { dd += d; hasDd = true; }
        });
        var pnl = val - inv, pct = inv > 0 ? pnl / inv * 100 : 0;
        var n = visibleItems().length;
        var ddCls = hasDd ? (dd >= 0 ? 'pos' : 'neg') : '';
        var ddVal = hasDd ? (dd >= 0 ? '+' : '−') + fmtRub(Math.abs(dd)) : '—';

        var idBlock = '<div class="pfp-id">' +
            '<div class="pfp-ico">' + PFDGRID_SVG + '</div>' +
            '<div class="pfp-id-t"><div class="pfp-title">Панель управления</div>' +
                '<div class="pfp-sub">' + n + ' ' + plural(n, 'портфель', 'портфеля', 'портфелей') + ' · дашборд под рукой</div></div>' +
        '</div>';

        var kpis = '<div class="pfp-kpis">' +
            '<div class="pfp-kpi"><div class="num"><b>' + fmtRub(val) + '</b><span>капитал</span></div>' +
                '<div class="sub">вложено ' + fmtRub(inv) + ' · <b class="' + (pnl >= 0 ? 'pos' : 'neg') + '">' + (pnl >= 0 ? '▲ ' : '▼ ') + fmtPct(pct) + '</b></div></div>' +
            '<i class="pfp-div"></i>' +
            '<div class="pfp-kpi"><div class="num"><b class="' + ddCls + '">' + ddVal + '</b><span>за сегодня</span></div>' +
                '<div class="sub">' + (hasDd ? 'к последнему дневному снимку' : 'появится со второго дня') + '</div></div>' +
        '</div>';

        var actions = '<div class="pfp-actions">' +
            '<button type="button" class="pfp-btn primary" onclick="pfLayoutToggle(event)" title="Добавить виджет на дашборд">' + PFD_PLUS_SVG + '<span>Виджет</span></button>' +
            '<button type="button" class="pfp-btn" onclick="pfAddPortfolio()" title="Создать новый портфель">' + PLUS_SVG + '<span>Портфель</span></button>' +
            '<button type="button" class="pfp-btn icon" onclick="pfExportExcelAll()" title="Выгрузить все позиции в Excel">' + PFP_EXCEL_SVG + '</button>' +
            eyeWrapHtml() +
            backupWrapHtml() +
            '<span class="pfl-cfg-wrap pfp-cfg" style="display:inline-flex">' +
                '<button type="button" class="pfl-cfg-btn" title="Раскладка: базовая, индивидуальная, сохранить" aria-label="Настройки раскладки">' + PFP_SLIDERS_SVG + '</button>' +
                '<div class="pfl-cfg-pop">' + pfLayoutCfgPopHtml() + '</div>' +
            '</span>' +
        '</div>';

        return '<div class="pfp-panel">' +
            '<div class="pfp-fx" aria-hidden="true"><i class="g1"></i><i class="g2"></i><i class="mesh"></i></div>' +
            idBlock + kpis + actions +
        '</div>';
    }

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
        store.items.forEach(function (p) {
            var m = snaps[p.id]; if (!m) return;
            var ks = Object.keys(m).sort(), j = 0, cur = null;
            for (var i = 0; i < ds.length; i++) {
                while (j < ks.length && ks[j] <= ds[i]) { cur = m[ks[j]]; j++; }
                if (cur != null) totals[i] += cur;
            }
        });
        var out = ds.map(function (d, i) { return { d: d, v: totals[i] }; });
        if (quotesTs) {   // сегодняшняя точка — живая, не ждёт снимка
            var live = 0, any = false;
            store.items.forEach(function (p) { var v = calcPf(p).value; if (v > 0) { live += v; any = true; } });
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
    // (chartRaw[pid].series = [{d, c, inv}], c — рыночная стоимость на дату), суммируя c по
    // всем портфелям с forward-fill. Серии подтягиваются асинхронно (repaintMiniCharts на
    // рендере) — как только подъедут, pfdCapMaybeRepaint дорисует линию поверх заглушки.
    function pfdCapHistSeries() {
        var per = [];
        visibleItems().forEach(function (p) {
            var raw = chartRaw[p.id];
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
        if (quotesTs) {
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
    var pfdCapRange = 'all';   // 'all' | '90' | '30' — окно графика (сессия, не персистится)
    var pfdCapState = null;    // геометрия текущего графика для ховера-перекрестия
    function pfdCapRangeFilter(s) {
        if (pfdCapRange === 'all' || s.length < 2) return s;
        var cutoff = Date.now() - (pfdCapRange === '30' ? 30 : 90) * 86400000;
        var f = s.filter(function (pt) { return new Date(pt.d).getTime() >= cutoff; });
        return f.length >= 2 ? f : s.slice(-2);
    }
    function pfdCapChip(r, lbl) { return '<button class="pff-sort-b' + (pfdCapRange === r ? ' on' : '') + '" onclick="pfdCapSetRange(\'' + r + '\')">' + lbl + '</button>'; }
    function pfdCapChartHtml(demoSeries) {
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
            // адаптивные чипы окна В ШАПКЕ (не отдельной строкой): только если данных больше месяца
            var spanDays = (new Date(full[full.length - 1].d).getTime() - new Date(full[0].d).getTime()) / 86400000;
            if (spanDays > 33) right = '<div class="pfcap-seg pff-sort">' + pfdCapChip('30', '30д') + (spanDays > 93 ? pfdCapChip('90', '90д') : '') + pfdCapChip('all', 'Всё') + '</div>';
            var min = Infinity, max = -Infinity;
            s.forEach(function (pt) { if (pt.v < min) min = pt.v; if (pt.v > max) max = pt.v; });
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
            pfdCapState = { s: s, min: min, span: span, n: n, inx: INX, pt: PT, pb: PB };
            var plotBot = 100 - PB, grid = '';
            [0.25, 0.5, 0.75].forEach(function (f) { var gy = (PT + (plotBot - PT) * f).toFixed(1); grid += '<line x1="0" y1="' + gy + '" x2="100" y2="' + gy + '" class="pfcap-grid"/>'; });
            var lx = xP(n - 1).toFixed(2), ly = yP(last.v).toFixed(2);
            // герой: крупная текущая стоимость + пилюля дельты + за сколько дней
            hero = '<div class="pfcap-hero"><span class="pfcap-val">' + fmtRub(last.v) + '</span>' +
                '<span class="pfcap-delta ' + (up ? 'pos' : 'neg') + '">' + (up ? '▲' : '▼') + ' ' + fmtRub(Math.abs(delta)) + ' · ' + fmtPct(dPct) + '</span>' +
                '<span class="pfcap-per">за ' + daysShown + ' дн</span></div>';
            body = '<div class="pfcap-plot">' +
                '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
                    '<defs><linearGradient id="pfcapGrad" x1="0" y1="0" x2="0" y2="1">' +
                        '<stop offset="0" stop-color="' + col + '" stop-opacity="0.24"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/>' +
                    '</linearGradient></defs>' +
                    grid +
                    '<path d="' + area + '" fill="url(#pfcapGrad)"/>' +
                    '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
                '</svg>' +
                '<span class="pfcap-end" style="left:' + lx + '%;top:' + ly + '%;--cc:' + col + '"></span>' +
                '<span class="pfcap-y pfcap-y--max">' + fmtRub(max) + '</span>' +
                '<span class="pfcap-y pfcap-y--min">' + fmtRub(min) + '</span>' +
                '<div class="pfcap-cursor"></div><span class="pfcap-cdot"></span><div class="pfcap-tip"></div>' +
                '<div class="pfcap-hit" onmousemove="pfdCapHover(event)" onmouseleave="pfdCapHoverEnd(event)"></div>' +
            '</div>' +
            '<div class="pfcap-x"><span>' + ruDate(s[0].d) + '</span><span>' + ruDate(last.d) + '</span></div>';
        }
        return '<div class="dash2-card pf-card2 pf-capblk" title="Дневные снимки хранятся на этом устройстве (до 400 дней)">' +
            pfCardHead('', 'График капитала', 'стоимость всех портфелей', right) +
            hero +
            '<div class="pfcap-body">' + body + '</div></div>';
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
            var spanDays = (new Date(full[full.length - 1].d).getTime() - new Date(full[0].d).getTime()) / 86400000;
            if (spanDays > 33) right = '<div class="pfcap-seg pff-sort">' + pfdCapChip('30', '30д') + (spanDays > 93 ? pfdCapChip('90', '90д') : '') + pfdCapChip('all', 'Всё') + '</div>';
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
                '</div>' +
                '<div class="pfcap-x"><span>' + ruDate(s[0].d) + '</span><span>' + ruDate(last.d) + '</span></div>';
        }
        return '<div class="dash2-card pf-card2 pf-capblk pf-capblk--bars" title="Дневные снимки хранятся на этом устройстве (до 400 дней)">' +
            pfCardHead('', 'График капитала', 'стоимость всех портфелей', right) +
            hero +
            '<div class="pfcap-body">' + body + '</div></div>';
    }
    window.pfdCapSetRange = function (r) { if (pfdCapRange === r) return; pfdCapRange = r; pfdCapRepaint(); };
    // перерисовать ВСЕ блоки графика капитала (линия и/или столбцы могут быть оба на дашборде)
    function pfdCapRepaint() {
        var cards = document.querySelectorAll('#pfWrap .pf-capblk'); if (!cards.length) return;
        cards.forEach(function (card) {
            var bars = card.classList.contains('pf-capblk--bars');
            var tmp = document.createElement('div'); tmp.innerHTML = bars ? pfdCapChartHtmlB() : pfdCapChartHtml();
            card.parentNode.replaceChild(tmp.firstChild, card);
        });
        pfdRepackSoon();
    }
    // Дорисовать линию капитала поверх заглушки «мало данных», когда исторические серии
    // карточек (chartRaw) подъехали асинхронно. Действуем ТОЛЬКО пока показана заглушка —
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
        if (tip) { tip.innerHTML = '<b>' + fmtRub(pt.v) + '</b><i>' + ruDate(pt.d) + '</i>'; tip.style.left = clamp(lx, 13, 87) + '%'; tip.classList.add('on'); }
    };
    window.pfdCapHoverEnd = function (ev) {
        var plot = ev.currentTarget && ev.currentTarget.parentNode; if (!plot) return;
        ['.pfcap-cursor', '.pfcap-cdot', '.pfcap-tip'].forEach(function (sel) { var el = plot.querySelector(sel); if (el) el.classList.remove('on'); });
    };

    // ---- «Распределение активов»: кольцо акции/облигации/кэш + выбор портфеля ----
    // Выбранный портфель (или «Все») хранится в dashCfg.allocPf. Если портфель исчез —
    // мягкий откат на «Все». Клик по чипу перерисовывает только сам блок (без ре-рендера).
    function pfdAllocScope() {
        var id = dashCfg.allocPf || 'all';
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
        var big = d.total > 0 ? Math.round(d.stock / d.total * 100) : 0;
        return '<div class="pfal-donut">' +
            '<svg viewBox="0 0 100 100" aria-hidden="true">' +
                '<circle cx="50" cy="50" r="38" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="15"/>' +
                '<g transform="rotate(-90 50 50)">' + arcs + '</g>' +
            '</svg>' +
            '<div class="pfal-center"><b>' + big + '%</b><span>акции</span></div>' +
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
        return '<div class="dash2-card pf-card2 pf-allocblk">' +
            pfCardHead('', 'Распределение активов', subName, null) +
            sel + body + '</div>';
    }
    window.pfdAllocPick = function (id) {
        if (dashCfg.allocPf === id) return;
        dashCfg.allocPf = id; saveDashCfg();
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
    function pfdHeatHtml() {
        return '<div class="dash2-card pf-card2 pf-heatblk">' +
            pfCardHead('', 'Карта рынка', 'индекс Мосбиржи · размер — вес, цвет — за день',
                '<button class="d3-quick ghost pfhm-go" onclick="switchTab(\'market\')">Открыть' + GO_ARROW_SVG + '</button>') +
            '<div class="pfhm-box"><div class="pfhm-state">Загружаем карту рынка…</div></div>' +
        '</div>';
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
        var tiles = pfhmSquarify(pfdHeatW.slice(0, MAX), W, H);
        var html = '';
        tiles.forEach(function (t) {
            var chg = pfdHeatC[t.tk]; if (chg != null && isNaN(+chg)) chg = null; else if (chg != null) chg = +chg;
            var x = t.x + 1.5, y = t.y + 1.5, w = Math.max(0, t.w - 3), h = Math.max(0, t.h - 3);
            var big = w > 52 && h > 34, mid = w > 34 && h > 22;
            var pctTxt = chg == null ? '' : (chg >= 0 ? '+' : '−') + Math.abs(chg).toFixed(1) + '%';
            var label = big ? '<b>' + esc(t.tk) + '</b><i>' + pctTxt + '</i>' : (mid ? '<b>' + esc(t.tk) + '</b>' : '');
            var tip = esc(t.tk) + (chg == null ? '' : ' · ' + pctTxt + ' за день');
            html += '<button type="button" class="pfhm-tile" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;--tc:' + pfdTileColor(chg) + '" title="' + tip + '" onclick="pfOpenTicker(\'' + jsArg(t.tk) + '\')">' + label + '</button>';
        });
        box.innerHTML = html;
    }
    var pfdHeatT = null;
    function pfdHeatRepaintSoon() {
        var box = document.querySelector('#pfWrap .pfhm-box'); if (!box) return;
        clearTimeout(pfdHeatT);
        pfdHeatT = setTimeout(pfdHeatRender, 90);
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

    // ---- «Новости по позициям»: свежая новость по каждой акции портфелей ----
    // Переиспользует пайплайн новостей «Избранного» (loadNewsForTicker + newsHtmlCache +
    // очередь newsQueue): та же лента Smart-Lab, тот же кэш — общие тикеры не грузятся дважды.
    var pfdNewsCustom = [];    // тикеры не из портфеля, добавленные вручную (сессия)
    var pfdNewsAdding = false;  // раскрыт ли инпут добавления тикера
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
    var pfdNewsPick = null;   // выбранный тикер-фильтр (null = все)
    function pfdNewsDots(x) { return x.pfs.slice(0, 3).map(function (p) { return '<i class="pfnw-pfdot" style="background:' + p.color + '" title="' + attr(p.name) + '"></i>'; }).join(''); }
    function pfdNewsChips(list) {
        var chips = '<button class="pfnw-pk' + (pfdNewsPick === null ? ' on' : '') + '" onclick="pfdNewsSetPick(\'\')">Все</button>';
        chips += list.map(function (x) {
            return '<button class="pfnw-pk' + (pfdNewsPick === x.tk ? ' on' : '') + '" onclick="pfdNewsSetPick(\'' + jsArg(x.tk) + '\')">' + esc(x.tk) +
                (x.custom ? '<i class="pfnw-pkx" onclick="event.stopPropagation();pfdNewsDelCustom(\'' + jsArg(x.tk) + '\')" title="Убрать тикер">×</i>' : '<span class="pfnw-pkdots">' + pfdNewsDots(x) + '</span>') + '</button>';
        }).join('');
        chips += pfdNewsAdding
            ? '<span class="pfnw-addwrap"><input class="pfnw-addinput" placeholder="ТИКЕР" maxlength="12" onkeydown="pfdNewsAddKey(event)" onblur="pfdNewsAddBlur(this)"></span>'
            : '<button class="pfnw-pk pfnw-pkadd" onclick="pfdNewsAddToggle()" title="Добавить тикер не из портфеля" aria-label="Добавить тикер">' + PFD_PLUS_SVG + '</button>';
        return '<div class="pfnw-picks">' + chips + '</div>';
    }
    function pfdNewsHtml() {
        var list = pfdNewsList();
        if (!list.length && !pfdNewsAdding) {
            return '<div class="dash2-card pf-card2 pf-newsblk">' +
                pfCardHead('', 'Новости по позициям', 'свежая новость по бумагам портфелей', '<button class="pff-add" onclick="pfdNewsAddToggle()" title="Добавить тикер не из портфеля" aria-label="Добавить тикер">' + PFD_PLUS_SVG + '</button>') +
                '<div class="pfnw-body" data-skey="posnews"><div class="pfnw-empty">Добавьте акции в портфель — или введите любой тикер по кнопке «+» справа.</div></div></div>';
        }
        if (pfdNewsPick && !list.some(function (x) { return x.tk === pfdNewsPick; })) pfdNewsPick = null;
        var shown = pfdNewsPick ? list.filter(function (x) { return x.tk === pfdNewsPick; }) : list;
        var rows = shown.map(function (x) { return pfdNewsItemHtml(x); }).join('');
        return '<div class="dash2-card pf-card2 pf-newsblk">' +
            pfCardHead('', 'Новости по позициям', 'наведите бумагу — новость раскроется, нажмите — откроется') +
            pfdNewsChips(list) +
            '<div class="pfnw-body" data-skey="posnews"><div class="pfnw-list">' + rows + '</div></div></div>';
    }
    // строка новости в стиле «Избранного»: слева тикер-чип (→ карточка компании), справа
    // блок новости, который РАСКРЫВАЕТСЯ по наведению (полный заголовок всплывает поверх),
    // клик по нему открывает саму новость. Наполняется асинхронно в fillPosNewsSlot.
    function pfdNewsItemHtml(x) {
        var mark = x.custom ? '<span class="pfnw-item-nopf" title="Не в портфеле">внеш.</span>' : '<span class="pfnw-pfdots">' + pfdNewsDots(x) + '</span>';
        return '<div class="pfnw-item" data-tk="' + esc(x.tk) + '" id="pfnw-' + esc(x.tk) + '">' +
            '<button type="button" class="pfnw-item-tkbtn" onclick="pfOpenTicker(\'' + jsArg(x.tk) + '\')" title="Открыть карточку компании">' +
                '<span class="pfnw-item-tk">' + esc(x.tk) + '</span>' + mark + '</button>' +
            '<div class="pfnw-item-news"><div class="pfnw-item-news-inner">' +
                '<span class="pfnw-item-title">загрузка новости…</span>' +
                '<span class="pfnw-item-meta"></span>' +
            '</div></div>' +
        '</div>';
    }
    var PFNW_GO_SVG = '<svg class="pfnw-item-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><polyline points="8 7 17 7 17 16"/></svg>';
    window.pfdNewsSetPick = function (tk) {
        var next = tk || null;
        if (pfdNewsPick === next) next = null;   // повторный клик по активному чипу — назад к «Все»
        pfdNewsPick = next;
        pfdNewsRepaint();
    };
    window.pfdNewsAddToggle = function () { pfdNewsAdding = !pfdNewsAdding; pfdNewsRepaint(); if (pfdNewsAdding) setTimeout(function () { var i = document.querySelector('#pfWrap .pfnw-addinput'); if (i) i.focus(); }, 30); };
    function pfdNewsCommitAdd(val) {
        var tk = String(val || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        pfdNewsAdding = false;
        if (tk.length >= 2 && pfdNewsCustom.indexOf(tk) < 0) { pfdNewsCustom.push(tk); pfdNewsPick = tk; }
        pfdNewsRepaint();
    }
    window.pfdNewsAddKey = function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); pfdNewsCommitAdd(ev.target.value); }
        else if (ev.key === 'Escape') { ev.preventDefault(); pfdNewsAdding = false; pfdNewsRepaint(); }
    };
    window.pfdNewsAddBlur = function (el) { if (!pfdNewsAdding) return; if (String(el.value || '').trim()) pfdNewsCommitAdd(el.value); else { pfdNewsAdding = false; pfdNewsRepaint(); } };
    window.pfdNewsDelCustom = function (tk) {
        pfdNewsCustom = pfdNewsCustom.filter(function (t) { return t !== tk; });
        if (pfdNewsPick === tk) pfdNewsPick = null;
        pfdNewsRepaint();
    };
    function pfdNewsRepaint() {
        var card = document.querySelector('#pfWrap .pf-newsblk'); if (!card) return;
        var tmp = document.createElement('div'); tmp.innerHTML = pfdNewsHtml();
        card.parentNode.replaceChild(tmp.firstChild, card);
        renderPosNews(); pfdRepackSoon();
    }
    window.pfdNewsOpenLink = function (link) { if (typeof openExternalLink === 'function') openExternalLink(link); else window.open(link, '_blank'); };
    // Наполнить строку новости (как fillNewsSlot «Избранного»): заголовок + мета; если есть
    // ссылка — строка кликабельна (открывает новость), нет — помечаем «нет свежих новостей».
    function fillPosNewsSlot(tk) {
        var row = document.querySelector('#pfWrap .pfnw-item[data-tk="' + tk + '"]'), e = newsHtmlCache[tk];
        if (!row || !e) return;
        var titleEl = row.querySelector('.pfnw-item-title'), metaEl = row.querySelector('.pfnw-item-meta');
        var news = row.querySelector('.pfnw-item-news');
        row.classList.toggle('is-none', !!e.none);
        if (titleEl) titleEl.textContent = e.none ? 'нет свежих новостей' : (e.title || '');
        if (metaEl) metaEl.innerHTML = e.none ? '' : ('<i>' + esc(e.src || 'Smart-Lab') + '</i>' + (e.rel ? ' · ' + esc(e.rel) : '') + (e.link ? PFNW_GO_SVG : ''));
        if (e.link) {
            row.classList.add('link');
            if (news) { news.setAttribute('role', 'link'); news.onclick = function (ev) { ev.stopPropagation(); window.pfdNewsOpenLink(e.link); }; }
        } else {
            row.classList.remove('link');
            if (news) { news.removeAttribute('role'); news.onclick = null; }
        }
    }
    function renderPosNews() {
        if (!document.querySelector('#pfWrap .pf-newsblk') || typeof loadNewsForTicker !== 'function') return;
        pfdNewsTickers().forEach(function (tk) {
            if (newsHtmlCache[tk]) { fillPosNewsSlot(tk); return; }
            if (!newsStarted[tk]) { newsStarted[tk] = true; newsQueue.push(tk); }
        });
        setTimeout(pumpNewsQueue, newsActive ? 0 : 400);
    }

    // ---- «Заметки»: мультиблок; у каждой цвет-точка, строки (текст/пункт/задача) и срок ----
    var pfdNoteT = null;
    var NOTE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v5a1 1 0 0 0 1 1h5"/><path d="M8.5 13.5h7"/><path d="M8.5 17h5"/></svg>';
    var NOTE_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var NOTE_X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    var NOTE_CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    var NOTE_TB_TEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
    var NOTE_TB_BULLET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h3M4 12h3M4 17h3M10 7h10M10 12h10M10 17h10"/></svg>';
    var NOTE_TB_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="7" r="2.4"/><path d="M11 7h9"/><circle cx="6" cy="17" r="2.4"/><path d="M11 17h9"/></svg>';
    var NOTE_TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    // иконки заливки: кант слева (рамка + жирная левая грань) | залить всю карточку (заполненный прямоугольник)
    var NOTE_FILL_EDGE_SVG = '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="5" width="4.5" height="14" rx="1.6" fill="currentColor"/></svg>';
    var NOTE_FILL_FULL_SVG = '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="14" rx="2.5" fill="currentColor"/></svg>';
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
    function pfdNoteDueHtml(nt) {
        var chip;
        if (nt.due == null) {
            chip = '<button type="button" class="pfnt-due pfnt-due-empty" onclick="pfdCalOpen(\'' + jsArg(nt.id) + '\',event)" aria-label="Задать срок выполнения">' +
                '<span class="pfnt-due-ic">' + NOTE_CLOCK_SVG + '</span>' +
                '<span class="pfnt-due-add">Срок выполнения</span>' +
                '<span class="pfnt-due-chev">' + NOTE_CHEV_SVG + '</span>' +
            '</button>';
        } else {
            var cd = pfdDueCountdown(nt.due);
            chip = '<div class="pfnt-due set ' + cd.cls + '">' +
                '<span class="pfnt-due-ic">' + NOTE_CLOCK_SVG + '</span>' +
                '<button type="button" class="pfnt-due-main" onclick="pfdCalOpen(\'' + jsArg(nt.id) + '\',event)" title="Изменить срок">' +
                    '<span class="pfnt-due-date">' + esc(pfdDueText(nt)) + '</span>' +
                    '<span class="pfnt-cd" data-due="' + nt.due + '">' + esc(cd.txt) + '</span></button>' +
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
        var fill = nt.fill === 'full' ? 'full' : 'edge';
        var PFD_COLOR_NAMES = { slate: 'Серый', blue: 'Синий', green: 'Зелёный', amber: 'Жёлтый', violet: 'Фиолетовый', rose: 'Розовый' };
        var sw = PFD_NOTE_COLORS.map(function (c) {
            return '<button type="button" class="pfnt-sw' + (c === color ? ' on' : '') + '" data-c="' + c + '" style="--sw:var(--nt-' + c + ')" title="' + attr(PFD_COLOR_NAMES[c] || c) + '" aria-label="' + attr(PFD_COLOR_NAMES[c] || c) + '" onclick="pfdSetNoteColor(\'' + jsArg(nt.id) + '\',\'' + c + '\',event)"></button>';
        }).join('');
        // палитра-поповер: секция «Цвет» (свотчи) + секция «Заливка» (кант | вся карточка) с подписями
        var fills = '<span class="pfnt-pop-fills">' +
            '<button type="button" class="pfnt-fillb' + (fill === 'edge' ? ' on' : '') + '" data-f="edge" title="Цветной кант слева" onclick="pfdSetNoteFill(\'' + jsArg(nt.id) + '\',\'edge\',event)">' + NOTE_FILL_EDGE_SVG + '<span>Кант</span></button>' +
            '<button type="button" class="pfnt-fillb' + (fill === 'full' ? ' on' : '') + '" data-f="full" title="Залить всю карточку" onclick="pfdSetNoteFill(\'' + jsArg(nt.id) + '\',\'full\',event)">' + NOTE_FILL_FULL_SVG + '<span>Вся карточка</span></button>' +
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
        var toolbar = '<div class="pfnt-toolbar">' +
            '<button type="button" class="pfnt-tb" onclick="pfdNoteAddItem(\'' + jsArg(nt.id) + '\',\'text\')" title="Абзац текста">' + NOTE_TB_TEXT + '<span>Текст</span></button>' +
            '<button type="button" class="pfnt-tb" onclick="pfdNoteAddItem(\'' + jsArg(nt.id) + '\',\'bullet\')" title="Пункт списка (—)">' + NOTE_TB_BULLET + '<span>Пункт</span></button>' +
            '<button type="button" class="pfnt-tb" onclick="pfdNoteAddItem(\'' + jsArg(nt.id) + '\',\'check\')" title="Задача с чекбоксом">' + NOTE_TB_CHECK + '<span>Задача</span></button>' +
        '</div>';
        return '<div class="dash2-card pf-card2 pf-noteblk pfnt-c-' + color + ' pfnt-fill-' + fill + '" data-nid="' + esc(nt.id) + '">' +
            head +
            '<div class="pfnt-list">' + rows + '</div>' +
            toolbar +
            pfdNoteDueHtml(nt) +
        '</div>';
    }

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
        if (!dashCfg.col) dashCfg.col = {};
        pfdDragColHome = dashCfg.col[pfdDragColKey];
        // фиксируем текущие колонки ВСЕХ блоков — чтобы при перетаскивании одного остальные
        // не «перепрыгивали» жадной упаковкой (предсказуемость: двигается только твой блок)
        Array.prototype.forEach.call(item.parentNode.children, function (c) {
            if (!c.classList || !c.classList.contains('pfd-item')) return;
            var cid = c.getAttribute('data-pfd');
            if (dashCfg.col[cid] == null) {
                var m = /^\s*(\d+)/.exec(c.style.gridColumn || '');
                if (m) dashCfg.col[cid] = +m[1];
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
        // Перетащенный блок ЗАКРЕПЛЯЕТСЯ за колонку под курсором (dashCfg.col) — pfdPack
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
        if (!dashCfg.col) dashCfg.col = {};
        var colChanged = dashCfg.col[id] !== targetCol;
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
        dashCfg.col[id] = targetCol;
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
    function pfdEndDrag(cancelled) {
        if (pfdTick) { cancelAnimationFrame(pfdTick); pfdTick = null; }
        document.body.classList.remove('pfd-dragging-now');
        var item = pfdDragEl, g = pfdGhost, home = pfdHomeNext;
        pfdDragEl = null; pfdGhost = null; pfdLastPt = null; pfdHomeNext = null;
        if (!item) return;
        if (!cancelled) pfdSaveOrder();
        else {
            // отмена (Esc/pointercancel): живая перестановка уже переставила блок в
            // DOM и закрепила колонку — возвращаем и порядок, и прежнюю колонку, иначе
            // на экране один вид, а сохранён другой (после «Готово» блок «прыгнул» бы)
            if (pfdDragColKey) {
                if (pfdDragColHome == null) { if (dashCfg.col) delete dashCfg.col[pfdDragColKey]; }
                else { if (!dashCfg.col) dashCfg.col = {}; dashCfg.col[pfdDragColKey] = pfdDragColHome; }
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
        } else if (dashEdit && e.target.closest) {
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
        dashCfg.order = Array.prototype.map.call(grid.children, function (el) {
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
        var startColStyle = item.style.gridColumn, startHStyle = item.style.height;
        var id = item.getAttribute('data-pfd');
        var minH = id === 'panel' ? 72 : 240;   // «Панель управления» — низкая полоса: даём вернуть малую высоту
        var newSpan = 0, newH = 0, hMode = hadH || axis === 'y';
        // ---- левая кромка: правый край блока закреплён, левый едет → span и стартовая
        // колонка меняются вместе. Считаем текущую стартовую колонку и «колонку за правым
        // краем» из реального положения блока в сетке; фиксируем колонки ВСЕХ блоков, чтобы
        // при уширении влево остальные не «прыгали» жадной упаковкой (как при перетаскивании).
        var startColNum = clamp(Math.round(((item.getBoundingClientRect().left - gr.left) / z) / (colW + gap)), 0, 11) + 1;
        var startSpanNum = pfdSpanOf(item, colW, gap);
        var rightEdgeCol = startColNum + startSpanNum;   // 1-based индекс колонки ЗА правым краем
        var leftColStartHome = (dashCfg.col && dashCfg.col[id] != null) ? dashCfg.col[id] : null;
        if (axis === 'xl') {
            if (!dashCfg.col) dashCfg.col = {};
            Array.prototype.forEach.call(grid.children, function (c) {
                if (!c.classList || !c.classList.contains('pfd-item')) return;
                var cid = c.getAttribute('data-pfd');
                if (dashCfg.col[cid] == null) {
                    var m = /^\s*(\d+)/.exec(c.style.gridColumn || '');
                    if (m) dashCfg.col[cid] = +m[1];
                }
            });
        }
        pfdArm = null;   // гасим возможный «взвод» драга — ресайз и драг не смешиваются
        pfdPushUndo();
        item.classList.add('pfd-resizing');
        // без направляющей-пунктира, текстового бейджа и прочих подсказок: соседи сами
        // переезжают под новый размер (masonry), размер виден по самому блоку
        function cleanup() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            item.classList.remove('pfd-resizing');
            pfdRsCancel = null;
        }
        var newColStart = 0;
        function onMove(ev) {
            var dx = (ev.clientX - startX) / z, dy = (ev.clientY - startY) / z;
            if (axis === 'y') dx = 0;      // нижняя кромка — ширину не трогаем
            if (axis === 'x' || axis === 'xl') dy = 0;   // боковые кромки — высоту не трогаем
            if (axis === 'xl') {
                // левая кромка: тянем влево (dx<0) → шире. Правый край закреплён:
                // новая стартовая колонка = (колонка за правым краем) − новый span.
                newSpan = clamp(Math.round((startW - dx + gap) / (colW + gap)), 3, 12);
                newColStart = clamp(rightEdgeCol - newSpan, 1, 12);
                newSpan = rightEdgeCol - newColStart;   // держим согласованность после clamp
                dashCfg.col[id] = newColStart;
            } else {
                newSpan = clamp(Math.round((startW + dx + gap) / (colW + gap)), 3, 12);
            }
            if (!hMode && Math.abs(dy) > 8) hMode = true;
            item.style.gridColumn = 'span ' + newSpan;
            if (hMode) {
                newH = clamp(Math.round(startH + dy), minH, 1400);
                item.style.height = newH + 'px';
                item.classList.add('pfd-hset');
            }
            pfdRepackSoon();   // masonry: соседи переезжают под новый размер
        }
        function onUp() {
            cleanup();
            var changed = false;
            // ширину пишем только когда её реально можно было менять (не чистый ресайз высоты) —
            // иначе «пиннили» бы текущий span поверх дефолта
            if (newSpan && axis !== 'y') { dashCfg.span[id] = newSpan; changed = true; }
            if (axis === 'xl' && newColStart) { dashCfg.col[id] = newColStart; changed = true; }
            if (hMode && newH) {
                // «Панель управления»: стянутая почти к минимуму высота = вернуть АВТО (натуральную),
                // иначе она застревала на 240px (общий минимум карточек) и не возвращалась к исходной
                if (id === 'panel' && newH <= 96) { delete dashCfg.h[id]; }
                else { dashCfg.h[id] = newH; }
                changed = true;
            }
            if (changed) saveDashCfg();
            pfdHeatRepaintSoon();   // карта рынка перерисовывается под новый размер блока
        }
        // Esc/выход из режима во время ресайза: возвращаем стартовые размеры,
        // ничего не сохраняем — вместо прежнего выхода из конструктора «на полпути»
        pfdRsCancel = function () {
            cleanup();
            item.style.gridColumn = startColStyle;
            item.style.height = startHStyle;
            if (axis === 'xl') {   // вернуть прежнюю стартовую колонку (или снять, если её не было)
                if (leftColStartHome == null) { if (dashCfg.col) delete dashCfg.col[id]; }
                else dashCfg.col[id] = leftColStartHome;
            }
            if (!hadH) item.classList.remove('pfd-hset');
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
        if (axis === 'x') { delete dashCfg.span[id]; toast('Ширина — по умолчанию'); }
        else if (axis === 'y') { delete dashCfg.h[id]; toast('Высота — авто'); }
        else if (dashCfg.h[id] != null) { delete dashCfg.h[id]; toast('Высота — авто'); }
        else { delete dashCfg.span[id]; toast('Ширина — по умолчанию'); }
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
        if (dashEdit) window.pfLayoutClose();
    });
    // клик ВНЕ карточки «Добавить виджет» закрывает её — как ждёшь от оверлея (раньше
    // закрывали только ✕/Esc, и казалось, что карточка «не закрывается»). Не трогаем клики
    // внутри карточки, по кнопкам её открытия/раскладки, по модалкам в <body> и во время жеста.
    document.addEventListener('click', function (e) {
        if (!dashEdit) return;
        var t = e.target; if (!t || !t.closest) return;
        if (t.closest('.pfl-panel')) return;
        if (t.closest('#pfLayoutBtn') || t.closest('#pfLayoutCfgWrap') || t.closest('.pfp-cfg') || t.closest('.pfp-btn')) return;
        if (t.closest('#pfConfirmOv')) return;
        if (pfdBusy()) return;
        window.pfLayoutClose();
    });

    // все портфели скрыты — осознанное пустое состояние с кнопкой «показать все»
    function allHiddenHtml() {
        var n = store.items.length;
        return '<div class="dash2-card pf-empty pf-empty--hidden">' +
            '<div class="pf-empty-art">' + EYEOFF_SVG + '</div>' +
            '<div class="pf-empty-t">Все портфели скрыты</div>' +
            '<div class="pf-empty-s">' + (n === 1 ? 'Единственный портфель спрятан' : 'Все ' + n + ' ' + plural(n, 'портфель', 'портфеля', 'портфелей') + ' спрятаны') + ' — верните нужные через «Видимость» в шапке или покажите все разом.</div>' +
            '<div class="pf-empty-cta"><button class="d3-quick" onclick="pfShowAllHidden()">' + EYE_SVG + 'Показать все</button></div>' +
        '</div>';
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

    var HOLDS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    var COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    var REBAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg>';

    // ---- мини-график доходности прямо в карточке (всегда виден, портфель vs IMOEX) ----
    // Переиспользует drawPfChart (тот же компонент, что и большой график/разворот): шкала
    // процентов слева + наводимые точки с тултипом (дата + значение) — просто в компактном
    // размере (meньше точек, сжатые отступы через .pfc-mchart-plot в CSS).
    function paintPfChartMini(pid) { drawPfChart(pid, dq('pfmChart-' + pid), null, dq('pfmLeg-' + pid), pid + 'm', 16); }
    // мини-график в карточке по умолчанию БЕЗ сравнения с индексом (IMOEX/RGBI) — пользователь
    // включает его сам кнопкой-тумблером. ВАЖНО: выставляем флаг ДО первого loadPfChart() любого
    // пейна (см. renderPortfolios), чтобы серия сразу запрашивалась в согласованном режиме.
    function ensureDefaultImoexFlags() {
        visibleItems().forEach(function (p) { if (!(p.id in chartImoex)) chartImoex[p.id] = false; });
    }
    // на каждый видимый портфель — своя загрузка/перерисовка мини-графика (переиспользует loadPfChart)
    function repaintMiniCharts() {
        visibleItems().forEach(function (p) {
            if (dq('pfmChart-' + p.id)) loadPfChart(p.id);
        });
    }

    function cardHtml(p, idx, colRight, narrow, colMid) {
        var c = calcPf(p), ac = colorVal(p.color);
        var pnlCls = c.pnl >= 0 ? 'pos' : 'neg';
        var bench = pfBench(p);
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

        // чип «за сегодня»: изменение стоимости портфеля к последнему дневному снимку;
        // в подсказке — самое сильное дневное движение среди акций. Показывается только
        // когда снимок прошлого дня уже есть (со второго дня наблюдения).
        var dd = dayDelta(p, c.value), mv = topMover(p);
        var dayChip = '';
        if (dd != null && Math.abs(dd) >= 1) {
            var mvTxt = (mv && Math.abs(mv.chg) >= 3) ? ' Сильнее всех: ' + mv.t + ' ' + fmtPct(mv.chg) + ' за день.' : '';
            dayChip = '<span class="pfc-day ' + (dd >= 0 ? 'pos' : 'neg') + '" title="' + attr('Изменение стоимости портфеля за сегодня — к последнему дневному снимку.' + mvTxt) + '">' +
                (dd >= 0 ? '▲' : '▼') + ' ' + fmtRub(Math.abs(dd)) + ' сегодня</span>';
        }
        return '<div class="dash2-card pf-card' + (openMenu === p.id ? ' menu-open' : '') + tall + (chartOn ? ' chart-open' : '') + (chartOn && chartAssets[p.id] ? ' assets-open' : '') + (holdsOn ? ' holds-open' : '') + (colRight ? ' col-right' : '') + (narrow ? ' pf-card--narrow' : '') + (colMid ? ' col-mid' : '') + '" style="--pf-accent:' + ac + '">' +
            '<div class="pfc-top">' +
                '<div class="pfc-titles">' +
                    '<span class="pfc-name" onclick="pfNameEdit(\'' + p.id + '\',event)" title="Нажмите, чтобы переименовать"><span class="pfc-name-ink">' + esc(p.name) + '</span></span>' +
                    dayChip +
                '</div>' +
                '<div class="pfc-ctrls">' +
                    '<div class="pfc-acts">' +
                        '<button class="pfc-act" onclick="pfCopyComposition(\'' + p.id + '\',event)" aria-label="Скопировать состав" title="Скопировать состав портфеля">' + COPY_SVG + '</button>' +
                        '<button class="pfc-act' + (assetsChartOn ? ' on' : '') + '" onclick="pfOpenChartAssets(\'' + p.id + '\')" aria-label="Полный состав" title="' + (assetsChartOn ? 'Свернуть' : 'Полный состав') + '">' + HOLDS_SVG + '</button>' +
                        '<button class="pfc-act" onclick="pfToggleHidden(\'' + p.id + '\',event)" aria-label="Скрыть портфель" title="Скрыть карточку из сетки">' + EYEOFF_SVG + '</button>' +
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
                    var imOn = !!chartImoex[p.id];
                    return '<div class="pfc-mini-chart">' +
                        '<div class="pfc-mchart-top">' +
                            '<div class="pfc-mchart-leg" id="pfmLeg-' + p.id + '"></div>' +
                            '<button class="pfc-imtgl' + (imOn ? ' on' : '') + '" data-pid="' + p.id + '" onclick="pfToggleMiniImoex(\'' + p.id + '\')" ' +
                                'title="' + (imOn ? 'Скрыть — ' : 'Сравнить — ') + bench.full + '"><span class="pfc-imtgl-dot"></span>' + bench.label + '</button>' +
                        '</div>' +
                        '<div class="pfc-mchart-plot" id="pfmChart-' + p.id + '"></div>' +
                    '</div>';
                })() +
            '</div>' +
            cardRingHtml(c, idx, p) +
            (function () {
                // «Выплаты» — полученные купоны/дивиденды за время владения (в «Доход» не входят);
                // «Кэш» — свободные деньги (правится в ⚙, пополняется остатком ребалансировок).
                // Оба блока опциональны — сетка статов резиновая (flex), влезает любое число.
                var po = pfPayouts(p);
                var payStat = (po.any && (po.pending || po.sum > 0.005))
                    ? '<div class="pfc-stat2 pfc-stat2--pay" title="Полученные купоны и дивиденды за время владения — по расписаниям MOEX (дивиденды — по дате отсечки). В «Доход» не входят"><span class="pfc-stat2-l">Выплаты</span><span class="pfc-stat2-v ' + (po.pending ? '' : 'pos') + '">' + (po.pending ? '…' : '+' + fmtRub(po.sum)) + '</span></div>' : '';
                var cashStat = (p.cash > 0)
                    ? '<div class="pfc-stat2" title="Свободные деньги портфеля — не вложены в бумаги; правятся в настройках ⚙"><span class="pfc-stat2-l">Кэш</span><span class="pfc-stat2-v">' + fmtRub(p.cash) + '</span></div>' : '';
                return '<div class="pfc-stats2">' +
                    (narrow ? '' : '<div class="pfc-stat2"><span class="pfc-stat2-l">Вложено</span><span class="pfc-stat2-v">' + fmtRub(c.invested) + '</span></div>') +
                    '<div class="pfc-stat2 pfc-stat2--inc"><span class="pfc-stat2-l">Доход</span><span class="pfc-stat2-v ' + pnlCls + '">' + fmtRub(c.pnl) + '</span></div>' +
                    payStat + cashStat +
                    '<div class="pfc-stat2 pfc-stat2--yield is-' + (c.annual >= 0 ? 'gn' : 'rd') + '" title="Доходность в пересчёте на год (может отличаться от «Дохода» и графика — те показывают фактическое изменение за весь срок, а не годовые)"><span class="pfc-stat2-l">Доходность</span><span class="pfc-stat2-v ' + (c.annual >= 0 ? 'pos' : 'neg') + '">' + fmtPct(c.annual) + '</span></div>' +
                '</div>';
            })() +
            '<div class="pfc-sep"></div>' +
            '<div class="pfc-massets" data-skey="ma-' + p.id + '">' + assetsBody + '</div>' +
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
            '<div class="pfc-holdsover-list" data-skey="ho-' + p.id + '">' + body + '</div>' +
        '</div>';
    }

    // Кольцо распределения карточки: маленький donut + номер портфеля в центре + полоса-легенда.
    // Если в ⚙ задана целевая доля облигаций (p.targetBond) — на полосе метка цели, под
    // легендой строка отклонения с подсказкой «докупите … на ~X ₽» (возврат к цели докупкой
    // недостающего класса, без продаж).
    function cardRingHtml(c, idx, p) {
        var bondP = Math.round(clamp(c.bondPct, 0, 100)), stockP = 100 - bondP;
        var num = '<span class="pfc-ringnum">' + (((idx || 0) + 1)) + '</span>';
        var tgt = (p && p.targetBond != null && isFinite(+p.targetBond)) ? clamp(Math.round(+p.targetBond), 0, 100) : null;
        var marker = '', hint = '';
        if (tgt != null && c.value > 0) {
            // полоса: слева акции (stockP%), справа облигации — граница цели на 100−tgt% слева
            marker = '<i class="pfc-dist-tgt" style="left:' + (100 - tgt) + '%" title="Цель: облигации ' + tgt + '%"></i>';
            var dev = c.bondPct - tgt;
            if (Math.abs(dev) < 3) {
                hint = '<div class="pfc-tgt-hint ok">' + CHECK_SVG + 'В балансе с целью ' + tgt + '% облигаций</div>';
            } else {
                var buyTxt = '';
                if (dev > 0 && tgt > 0) { var needS = c.bondVal * 100 / tgt - c.value; if (needS > 1) buyTxt = ' — докупить акций на ~' + fmtRub(needS); }
                else if (dev < 0 && tgt < 100) { var needB = c.stockVal * 100 / (100 - tgt) - c.value; if (needB > 1) buyTxt = ' — докупить облигаций на ~' + fmtRub(needB); }
                hint = '<div class="pfc-tgt-hint off" title="Отклонение от целевой структуры (цель — ' + tgt + '% облигаций). Сумма — сколько докупить недостающего класса, чтобы вернуться к цели без продаж">' +
                    'Облигаций на ' + Math.abs(dev).toFixed(0) + ' п.п. ' + (dev > 0 ? 'больше' : 'меньше') + ' цели' + buyTxt + '</div>';
            }
        }
        return '<div class="pfc-alloc">' +
            donutHtml(c.bondPct, 40, num) +
            '<div class="pfc-dist">' +
                '<div class="pfc-dist-barwrap"><div class="pfc-dist-bar"><div style="width:' + stockP + '%;background:#D97757"></div><div style="width:' + bondP + '%;background:#7B9BBF"></div></div>' + marker + '</div>' +
                '<div class="pfc-dist-lbl"><span><i style="background:#D97757"></i>Акции ' + stockP + '%</span><span><i style="background:#7B9BBF"></i>Облигации ' + bondP + '%</span></div>' +
            '</div></div>' + hint;
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
        // котировки ещё нет (curSrc='buy' — фолбэк на цену покупки): «…» пока грузится,
        // «—» если котировки загружены и бумаги в них нет (опечатка в тикере); цену покупки
        // под видом текущей не показываем, «Изм.» без котировки — прочерк, а не «+0,0%»
        var noQ = c.curSrc === 'buy' ? noQuoteCell(h) : null;
        // дневной маркер: акция сдвинулась за день на ≥3% — стрелка с величиной в подсказке
        var dayMark = '';
        if (!isB && quotes[h.ticker] && quotes[h.ticker].chgPct != null && Math.abs(quotes[h.ticker].chgPct) >= 3) {
            var ch = quotes[h.ticker].chgPct;
            dayMark = ' <i class="pfc-rowday ' + (ch >= 0 ? 'up' : 'dn') + '" title="За сегодня: ' + fmtPct(ch) + '">' + (ch >= 0 ? '▲' : '▼') + '</i>';
        }
        var row = '<tr class="pfc-mtr' + (open ? ' open' : '') + '" data-hid="' + h.id + '" onclick="pfToggleAssetRow(\'' + pid + '\',\'' + h.id + '\')">' +
                '<td class="pfc-mc-as"><span class="pfc-mtk"><svg class="pfc-mch' + (open ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><b>' + esc(h.ticker) + '</b><i class="' + (isB ? 'bond' : 'stock') + '">' + (isB ? 'обл' : 'акц') + '</i>' + lotChip + '</span></td>' +
                '<td class="pfc-mqty">' + (c.qty || 0) + '</td>' +
                '<td class="pfc-mnow' + (c.live ? ' live' : '') + '"' + (noQ ? ' title="' + attr(noQ.tip) + '"' : ptip) + '>' + (noQ ? noQ.txt : fmtPrice(c.cur) + dayMark) + '</td>' +
                '<td class="pfc-mchg ' + (!noQ && c.invested > 0 ? (c.pnlPct >= 0 ? 'pos' : 'neg') : '') + '">' + (!noQ && c.invested > 0 ? fmtPct(c.pnlPct) : '—') + '</td>' +
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

    // ---- настройки/редактор (дропдаун ⚙): «спокойный список» ----
    // Состав по умолчанию — ЧИТАЕМЫЙ список (текст, не поля): тикер · шт · средняя цена
    // покупки · дата. Клик по строке раскрывает редактор ТОЛЬКО этого актива (viewRowHtml/
    // holdEditorHtml). Форма добавления свёрнута в одну кнопку-строку (у пустого портфеля
    // раскрыта сразу), цвет — точка в шапке с палитрой-поповером, «Удалить портфель» —
    // тихая ссылка в футере, раскрывающая данжер-зону с подтверждением НА МЕСТЕ (без модалки).
    function menuHtml(p) {
        // цвета, занятые ДРУГИМИ портфелями, приглушены и недоступны — у каждого
        // портфеля свой цвет, карточки не путаются
        var takenColors = {};
        store.items.forEach(function (o) { if (o.id !== p.id) takenColors[o.color] = o.name; });
        var sw = COLORS.map(function (cc) {
            var taken = takenColors[cc.id];
            return '<button class="pfm-sw' + (p.color === cc.id ? ' on' : '') + (taken ? ' taken' : '') + '" style="--sw:' + cc.v + ';background:' + cc.v + '" onclick="pfSetColor(\'' + p.id + '\',\'' + cc.id + '\')" aria-label="' + cc.id + '"' +
                (taken ? ' title="Занят: ' + attr(taken) + '"' : '') + '>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>';
        }).join('');
        var holds = p.holdings || [];
        var stocks = holds.filter(function (h) { return h.type !== 'bond'; });
        var bonds = holds.filter(function (h) { return h.type === 'bond'; });
        function grp(label, kind, list) {
            if (!list.length) return '';
            return '<div class="pfm-grp"><span class="pfm-grp-l pfm-grp-l--' + kind + '">' + label + '</span>' +
                '<span class="pfm-grp-n">' + list.length + '</span><i class="pfm-grp-rule"></i></div>' +
                list.map(function (h) { return viewRowHtml(p.id, h); }).join('');
        }
        var rows = grp('Акции', 'stock', stocks) + grp('Облигации', 'bond', bonds);
        var n = holds.length;
        var empty = !n;
        // стрелка указывает ВВЕРХ на форму добавления (она над списком)
        var UP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>';
        // пустое состояние — «портфель с плюсом» в тонированной плашке (а не безликий
        // квадрат), заголовок-приглашение и понятные шаги: форма сверху или импорт снизу
        var noneBox = '<div class="pfm-none">' +
            '<span class="pfm-none-arrow up">' + UP_SVG + '</span>' +
            '<span class="pfm-none-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2.5"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M12 11v5"/><path d="M9.5 13.5h5"/></svg></span>' +
            '<span class="pfm-none-t">Портфель ждёт первые активы</span>' +
            '<span class="pfm-none-s">Добавьте актив вручную в форме выше — или перенесите готовый состав импортом.</span>' +
            '<div class="pfm-none-imp">' + impWrapHtml('none-' + p.id, p.id) + '</div>' +
        '</div>';
        // шапка: точка-цвет (клик → палитра) + «тихое» имя (рамка на ховер/фокус) + «Готово»
        var top = '<div class="pfm-top">' +
            '<span class="pfm-colorwrap">' +
                '<button class="pfm-dot" style="--sw:' + colorVal(p.color) + '" onclick="pfColorsToggle()" aria-label="Цвет портфеля" title="Цвет портфеля"></button>' +
                (colorsOpen ? '<span class="pfm-colorpop">' + sw + '</span>' : '') +
            '</span>' +
            '<span class="pfm-namewrap">' +
                // 24 символа — тот же максимум, что у инлайн-правки имени на карточке
                '<input class="pfm-name" maxlength="24" value="' + attr(p.name) + '" onchange="pfRename(\'' + p.id + '\',this.value)" placeholder="Название портфеля">' +
                PENCIL_SVG +
            '</span>' +
            '<button class="pfm-done" onclick="pfCloseMenu()">' + CHECK_SVG + 'Готово</button>' +
        '</div>';
        // деньги и цель: свободный кэш портфеля (пополняется остатком ребалансировок) и
        // целевая доля облигаций (маркер на полосе распределения + подсказка «докупите…»)
        var extras = '<div class="pfm-extras">' +
            '<label class="pfm-extra" title="Свободные деньги портфеля — не вложены в бумаги; сюда автоматически падает остаток от обменов ребалансировки">' +
                '<span>Свободные деньги</span><span class="pfm-extra-f"><input class="pfm-in pfm-in-num" type="number" min="0" step="0.01" value="' + (p.cash > 0 ? p.cash : '') + '" placeholder="0" onchange="pfSetCash(\'' + p.id + '\',this.value)"><i>₽</i></span></label>' +
            '<label class="pfm-extra" title="Целевая структура: сколько процентов портфеля должно быть в облигациях. На карточке появится метка цели и подсказка, чего докупить. Пусто — выключено">' +
                '<span>Цель · облигации</span><span class="pfm-extra-f"><input class="pfm-in pfm-in-num" type="number" min="0" max="100" step="1" value="' + (p.targetBond != null ? p.targetBond : '') + '" placeholder="выкл" onchange="pfSetTarget(\'' + p.id + '\',this.value)"><i>%</i></span></label>' +
        '</div>';
        // добавление: свёрнуто в пунктирную кнопку-строку; раскрытая панель — та же форма
        // «за один подход» (addFormHtml), шапка панели сворачивает её обратно
        var addBlock = '<div class="pfm-addwrap' + (addOpen ? ' on' : '') + (empty ? ' is-empty' : '') + '">' +
            (addOpen
                ? '<button class="pfm-addghost on" onclick="pfAddToggle(\'' + p.id + '\')" title="Свернуть форму добавления">' +
                    '<span class="pfm-addhead-ic">' + PLUS_SVG + '</span><span class="pfm-addghost-t">Добавить актив</span>' +
                    '<svg class="pfm-addghost-ch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>' +
                  addFormHtml(p.id, empty)
                : '<button class="pfm-addghost" onclick="pfAddToggle(\'' + p.id + '\')">' + PLUS_SVG + '<span>Добавить актив</span></button>') +
        '</div>';
        // одна строка подписей колонок на весь список (сетка = .pfm-vrow); НКД у облигаций —
        // подстрокой в ячейке цены, поэтому отдельная колонка ему не нужна
        var vhead = n ? '<div class="pfm-vhead"><span>Тикер</span><span>Шт</span><span>Цена покупки</span><span>Дата</span></div>' : '';
        // футер: рутинные действия — тихим текстом слева; «Удалить портфель» — тихой красной
        // ссылкой справа, раскрывающей данжер-зону (само удаление — только внутри зоны)
        var foot = '<div class="pfm-bottom">' +
            '<div class="pfm-foot">' +
                (empty ? '' : impWrapHtml('imp-' + p.id, p.id)) +   // у пустого портфеля «Импорт» уже внутри приглашения
                '<button class="pfm-quiet" onclick="pfToggleHidden(\'' + p.id + '\')" title="Спрятать карточку из сетки — вернуть можно через «Видимость» в шапке">' +
                    EYEOFF_SVG + 'Скрыть</button>' +
                '<i class="pfm-foot-sp"></i>' +
                '<button class="pfm-del-link' + (delArm ? ' on' : '') + '" onclick="pfDelArm(' + (delArm ? 'false' : 'true') + ')">Удалить портфель</button>' +
            '</div>' +
            (delArm ? dangerHtml(p) : '') +
        '</div>';
        // Оверлей на всю карточку: шапка · добавление · список состава · футер.
        // menuJustOpened=true только на ПЕРВЫЙ рендер после открытия (⚙) — на всех
        // последующих ре-рендерах (правка лота, раскрытие строки и т.п. тоже дёргают
        // renderPortfolios и пересоздают весь .pfc-menu целиком) анимация pfMenuIn
        // ПОВТОРНО не проигрывается, иначе вся панель настроек каждый раз мигает.
        return '<div class="pfc-menu' + (menuJustOpened ? '' : ' no-anim') + '" id="pfMenu-' + p.id + '">' +
            top + addBlock + extras +
            '<div class="pfm-mid' + (empty ? ' pfm-mid--empty' : '') + '">' +
                '<div class="pfm-sec"><span>Состав · ' + n + ' ' + plural(n, 'актив', 'актива', 'активов') + '</span>' +
                    '<i class="pfm-sec-rule"></i></div>' +
                vhead +
                '<div class="pfm-rows" data-skey="menu-' + p.id + '">' + (rows || noneBox) + '</div>' +
            '</div>' +
            foot +
        '</div>';
    }
    // Данжер-зона удаления портфеля: последствия с числами + подтверждение на месте
    function dangerHtml(p) {
        var n = (p.holdings || []).length, t = (p.trades || []).length;
        var bits = [];
        if (n) bits.push(n + ' ' + plural(n, 'актив', 'актива', 'активов') + ' со всеми лотами');
        if (t) bits.push('история сделок');
        var s = bits.length ? 'Будут стёрты: ' + bits.join(' и ') + '. Действие необратимо.'
            : 'Портфель пуст — будет удалена только карточка.';
        return '<div class="pfm-danger">' +
            '<div class="pfm-danger-t">Удалить «' + esc(p.name) + '»?</div>' +
            '<div class="pfm-danger-s">' + s + '</div>' +
            '<div class="pfm-danger-btns">' +
                '<button class="pfm-danger-no" onclick="pfDelArm(false)">Отмена</button>' +
                '<button class="pfm-danger-yes" onclick="pfDeleteYes(\'' + p.id + '\')">Да, удалить</button>' +
            '</div>' +
        '</div>';
    }
    // Иконка «подтянуть на дату» для КОНКРЕТНОГО ЛОТА (журнал докупок): горит (lit) пока
    // не подтянуто с API, затухает (done) после загрузки, крутится при загрузке.
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
            'onpaste="pfDatePaste(event,this)" onchange="pfEditLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\',\'buyDate\',this.value)">');
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

        // Поле «вставить дату»: скопированную дату (ДД.ММ.ГГГГ / ГГГГ-ММ-ДД и т.п.) можно
        // вставить/ввести руками, не выискивая её по календарю. Значение переживает
        // ре-рендеры навигации (pasteVal), при открытии календаря сбрасывается.
        var pasteVal = '';
        function parsePastedDate(s) {
            s = String(s || '').trim();
            var m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/), d, mo, y;
            if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
            else {
                m = s.match(/^(\d{1,2})[-./\s](\d{1,2})[-./\s](\d{2}|\d{4})(?:\s*г\.?)?$/);
                if (!m) return null;
                d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000;
            }
            if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < MIN_YEAR) return null;
            var dt = new Date(y, mo - 1, d);
            if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
            var today = new Date(); today.setHours(23, 59, 59, 999);
            if (dt > today) return null;
            return y + '-' + pad(mo) + '-' + pad(d);
        }
        function applyPaste() {
            var box = pop && pop.querySelector('.btcal-paste input');
            if (!box || !curInput) return;
            var iso = parsePastedDate(box.value);
            if (!iso) { box.classList.add('err'); setTimeout(function () { box.classList.remove('err'); }, 900); return; }
            curInput.value = iso;
            curInput.dispatchEvent(new Event('change', { bubbles: true }));
            closeCal();
        }
        function pasteBoxHtml() {
            return '<div class="btcal-paste">' +
                '<input type="text" inputmode="numeric" maxlength="12" placeholder="ДД.ММ.ГГГГ — вставьте дату" value="' + pasteVal.replace(/"/g, '&quot;') + '">' +
                '<button type="button" class="btcal-paste-ok">OK</button></div>';
        }
        function bindPasteBox() {
            var box = pop && pop.querySelector('.btcal-paste input');
            if (!box) return;
            box.addEventListener('input', function () { pasteVal = box.value; });
            box.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyPaste(); }
                e.stopPropagation();   // Escape в поле не должен закрывать весь календарь через document-хендлер? — закрывает, но без побочек
            });
            // вставка из буфера: применяем сразу, если распозналась
            box.addEventListener('paste', function () {
                setTimeout(function () { pasteVal = box.value; if (parsePastedDate(box.value)) applyPaste(); }, 0);
            });
        }
        function render() {
            if (!pop) return;
            pop.innerHTML = pasteBoxHtml() + (view === 'years' ? renderYears() : (view === 'months' ? renderMonths() : renderDays()));
            bindPasteBox();
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
            pasteVal = '';
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
                if (e.target.closest('.btcal-paste-ok')) { applyPaste(); return; }
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
    var PENCIL_SVG = '<svg class="pfm-name-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    // Строка состава в режиме ПРОСМОТРА (текст, не поля): тикер+тег · шт · средняя цена
    // покупки (у облигаций подстрока НКД) · дата. Клик раскрывает редактор именно этого
    // актива под строкой; у актива с несколькими лотами в строке чип «×N».
    function viewRowHtml(pid, h) {
        var isB = h.type === 'bond', agg = aggHolding(h), open = !!editHold[h.id];
        var multi = agg.count > 1;
        var lotChip = multi ? '<i class="pfm-vlotn">×' + agg.count + '</i>' : '';
        var nkd = isB && agg.nkd > 0 ? '<i class="pfm-vnkd">НКД ' + fmtPrice(agg.nkd) + '</i>' : '';
        var priceTip = multi ? ' title="Средняя цена покупки по ' + agg.count + ' лотам"' : '';
        var dateVal = multi ? ruDate(agg.avgDate) : ruDate(agg.firstDate);
        var dateTip = multi ? ' title="Средняя (взвешенная) дата покупки"' : '';
        return '<div class="pfm-vwrap">' +
            '<div class="pfm-vrow' + (open ? ' open' : '') + '" onclick="pfMenuRowToggle(\'' + pid + '\',\'' + h.id + '\')" title="' + (open ? 'Свернуть' : 'Изменить — даты, цены, количество') + '">' +
                '<span class="pfm-vtk"><svg class="pfm-vch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
                    '<b>' + esc(h.ticker) + '</b><span class="pfm-tag ' + h.type + '">' + (isB ? 'обл' : 'акц') + '</span>' + lotChip + '</span>' +
                '<span class="pfm-vnum">' + fmtQty(agg.qty) + '</span>' +
                '<span class="pfm-vnum"' + priceTip + '>' + fmtPrice(agg.avgPrice) + nkd + '</span>' +
                '<span class="pfm-vdate"' + dateTip + '>' + dateVal + '</span>' +
            '</div>' +
            (open ? holdEditorHtml(pid, h) : '') +
        '</div>';
    }
    // Редактор актива (раскрыт кликом по строке): тикер + ВСЕ лоты разом (дата · цена ·
    // [НКД] · кол-во — те же поля с подтяжкой MOEX) + «Докупка» + «удалить актив».
    // Редактор — СОСЕД строки (не вложен в неё), поэтому клики по полям не сворачивают её.
    function holdEditorHtml(pid, h) {
        var isB = h.type === 'bond';
        var lots = ensureLots(h), multi = lots.length > 1;
        var cols = '<div class="pfm-ed-cols' + (isB ? ' bond' : '') + '"><span></span><span>Дата</span><span>Цена ₽</span>' +
            (isB ? '<span>НКД ₽</span>' : '') + '<span>Кол-во</span><span></span></div>';
        var lotRows = lots.map(function (l, i) {
            return '<div class="pfm-ed-lot' + (isB ? ' bond' : '') + '">' +
                '<span class="pfm-lotlbl">' + (i + 1) + '</span>' +
                lotDateInput(pid, h, l) +
                lotPriceCell(pid, h, l) +
                (isB ? lotNkdCell(pid, h, l) : '') +
                lotQtyInput(pid, h, l) +
                (multi ? '<button class="pfm-del" type="button" onclick="pfRemoveLot(\'' + pid + '\',\'' + h.id + '\',\'' + l.id + '\')" aria-label="Удалить лот" title="Удалить лот">' + XMARK_SVG + '</button>' : '<span></span>') +
            '</div>';
        }).join('');
        return '<div class="pfm-ed">' +
            '<div class="pfm-ed-top"><span class="pfm-ed-l">Тикер</span>' +
                '<input class="pfm-in pfm-in-tk pfm-ed-tk" value="' + attr(h.ticker) + '" onchange="pfEdit(\'' + pid + '\',\'' + h.id + '\',\'ticker\',this.value)" placeholder="Тикер">' +
                '<span class="pfm-hint" title="Иконка-календарь в полях «цена» и «НКД» подтягивает значение закрытия MOEX на дату лота. После загрузки иконка гаснет; сотрите значение — и она снова загорится.">' + INFO_SVG + '</span></div>' +
            cols + lotRows +
            '<div class="pfm-ed-foot">' +
                '<button class="pfm-lotadd" type="button" onclick="pfAddLot(\'' + pid + '\',\'' + h.id + '\')" title="Докупка — ещё одна покупка этого актива (усреднение цены)">' + PLUS_SVG + 'Докупка</button>' +
                '<i class="pfm-foot-sp"></i>' +
                '<button class="pfm-ed-del" type="button" onclick="pfRemoveHolding(\'' + pid + '\',\'' + h.id + '\')">удалить актив</button>' +
            '</div>' +
        '</div>';
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
    // Подсказки тикеров для формы добавления: ОФЗ из таблицы + компании из таблицы акций.
    // Кэшируем собранный список, пересобираем при изменении числа компаний.
    var tkListCache = { n: -1, html: '' };
    function tickerListHtml(pid) {
        var cos = (typeof window.stkAllCompanies === 'function') ? window.stkAllCompanies() : [];
        var bn = 0; try { if (typeof bonds !== 'undefined' && bonds) bn = bonds.length; } catch (e) {}
        if (tkListCache.n !== cos.length + bn) {
            var opts = [];
            try { if (typeof bonds !== 'undefined' && bonds) bonds.forEach(function (b) {
                if (b.t) opts.push('<option value="' + attr(b.t) + '">' + esc(b.n || '') + '</option>'); }); } catch (e) {}
            cos.forEach(function (co) {
                if (co && co.ticker) opts.push('<option value="' + attr(co.ticker) + '">' + esc(co.name || '') + '</option>');
            });
            tkListCache = { n: cos.length + bn, html: opts.join('') };
        }
        return '<datalist id="pfTkList-' + pid + '">' + tkListCache.html + '</datalist>';
    }
    function addFormHtml(pid, empty) {
        return '<div class="pfm-addform" id="pfAddForm-' + pid + '" data-type="stock">' +
            tickerListHtml(pid) +
            '<div class="pfm-addgrid">' +
                '<input class="pfm-in pfm-in-tk pfaf-tk" id="pfNewTk-' + pid + '" placeholder="Тикер / ISIN" maxlength="14" list="pfTkList-' + pid + '" ' +
                    'oninput="pfNewTkAuto(\'' + pid + '\')" onkeydown="if(event.key===\'Enter\')pfAddHolding(\'' + pid + '\')">' +
                '<select class="pfm-in pfm-in-type pfaf-type" id="pfNewType-' + pid + '" onchange="pfAddTypeToggle(\'' + pid + '\')">' +
                    '<option value="stock">Акция</option><option value="bond">Облигация</option></select>' +
                dateFieldHtml('<input class="pfm-in pfm-in-date pfaf-date" id="pfNewDate-' + pid + '" type="date" value="' + todayStr() + '" onpaste="pfDatePaste(event,this)" title="Дата покупки">') +
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
                        '<button class="pff-id" onclick="pfOpenTicker(\'' + jsArg(tk) + '\')" title="Открыть карточку компании">' +
                            '<span class="pff-tk">' + esc(tk) + '</span><span class="pff-nm">' + esc(name) + '</span></button>' +
                        '<div class="pff-pot-wrap"><span class="pff-pot-l">потенциал</span>' + potHtml + '</div>' +
                    '</div>' +
                    '<div class="pff-news" id="pf-news-' + esc(tk) + '"><div class="pff-news-inner"><span class="pff-news-load">загрузка новости…</span></div></div>' +
                '</div>';
            }).join('') + '</div>';
        }
        return '<div class="dash2-card pf-card2 pf-fav">' +
            pfCardHead('', 'Избранное', 'потенциал и свежая новость по тикеру',
                // «+» → терминал стоит НАПРОТИВ заголовка: вынесен ИЗ .pff-head-r (тот в узкой
                // колонке переносится на 2-ю строку под заголовок), margin-left:auto уводит его
                // вправо на строку заголовка. Внутри head-r он ломал space-between фильтра.
                '<button class="pff-add" type="button" onclick="pfGoTerminal(event)" aria-label="Открыть терминал" title="Открыть терминал — все акции и облигации в таблице">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
                '</button>' +
                '<div class="pff-head-r">' +
                    // кастомный поповер вместо нативного title: тот всплывает с секундной
                    // задержкой и в системном стиле — свой показывается мгновенно и в тоне приложения
                    '<span class="pff-info-wrap"><button class="pff-info" type="button" aria-label="Что такое потенциал">' + INFO_SVG + '<span>Что такое потенциал?</span></button>' +
                    '<span class="pff-tipbox" role="tooltip">' + esc(POT_TIP) + '</span></span>' +
                    // фильтр сортировки избранного (вместо кнопки «Все акции»): по потенциалу / по свежести новостей
                    '<div class="pff-sort" role="tablist">' +
                        '<button class="pff-sort-b' + (favSort === 'pot' ? ' on' : '') + '" onclick="pfSetFavSort(\'pot\')" title="Сначала с наибольшим потенциалом">Потенциал</button>' +
                        '<button class="pff-sort-b' + (favSort === 'news' ? ' on' : '') + '" onclick="pfSetFavSort(\'news\')" title="Сначала со свежими новостями">Новизна</button>' +
                    '</div>' +
                '</div>') +
            '<div class="pff-body" data-skey="fav">' + inner + '</div></div>';
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
        // title/rel/src — для предпросмотра «Новостей по позициям» (оверлей), html — для «Избранного»
        return { html: '<span class="pff-news-t">' + esc(title) + (full.length > 300 ? '…' : '') + '</span>' +
            '<span class="pff-news-m"><i>Smart-Lab</i>' + (rel ? ' · ' + esc(rel) : '') + go + '</span>', link: link,
            title: title + (full.length > 300 ? '…' : ''), rel: rel, src: 'Smart-Lab',
            date: isNaN(d.getTime()) ? 0 : d.getTime() };   // для сортировки избранного «по свежести»
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
                        // как только приходит новая, переупорядочиваем (softRerender дебаунсится)
                        if (favSort === 'news') softRerender();
                        pumpNewsQueue(); });
            })(tk);
        }
    }
    function renderFavNews() {
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

    // ---- ставки рынка (как на дашборде) ----
    function rateTiles() {
        var rd = window.ratesData || (typeof ratesData !== 'undefined' ? ratesData : {});
        // мусор из гугл-таблицы («#VALUE!», «#DIV/0!», «---») в плитку не пропускаем:
        // значение годится, только если в нём есть цифра и нет маркеров ошибки; иначе «—»
        function rvOk(s) { s = String(s == null ? '' : s); return /\d/.test(s) && s.indexOf('---') < 0 && s.indexOf('#') < 0; }
        function rv(id, fb) { var e = dq(id); var t = e ? (e.textContent || '').trim() : '';
            if (t && rvOk(t)) return t; if (fb != null && rvOk(fb)) return fb; return '—'; }
        return [
            { l: 'Ключевая ставка', v: rv('val-key-rate', rd.keyRate), ac: '#119d5c', ic: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>' },
            { l: 'Ставка по вкладам', v: rv('val-deposit-rate', rd.depositRate), ac: '#5B7C99', ic: '<polygon points="12 2 21 7 3 7"/><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="12" y1="18" x2="12" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/>' },
            { l: 'Инфляция, год', v: rv('val-inflation', rd.inflation), ac: '#D97757', ic: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
            { l: 'Доходность ОФЗ 10 лет', v: rv('val-ofz10', rd.ofz10), ac: '#3d6fd1', ic: '<path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 20 7"/>' }
        ];
    }
    function rateTileHtml(t, extra) {
        return '<div class="drt-tile' + (extra ? ' drt-tile--eye' : '') + '" style="--ac:' + t.ac + '"><div class="drt-ic"><svg viewBox="0 0 24 24">' + t.ic + '</svg></div>' +
            '<div class="drt-body"><div class="drt-l">' + esc(t.l) + '</div><div class="drt-v">' + esc(t.v) + '</div></div>' + (extra || '') + '</div>';
    }
    // полноширинная горизонтальная полоса ставок под сеткой — показывается ВСЕГДА,
    // когда есть хоть одна облигация хоть в одном портфеле (т.е. «Календарь выплат» тоже виден)
    function ratesHtml() {
        return '<div class="d3-ratesband pf-ratesband"><div class="drt-grid">' +
            rateTiles().map(rateTileHtml).join('') + '</div></div>';
    }
    // Замена «Календаря выплат», когда нигде нет ни одной облигации: те же 4 плитки,
    // без большого бокса-обёртки (каждая плитка и так своя мини-карточка, drt-tile) —
    // стопкой сверху вниз. Заголовок — тот же pfCardHead, что и у остальных карточек
    // (тот же шрифт/размер, что «Избранное»), выровнен ПО ВЕРХУ ячейки — раньше вся
    // колонка центрировалась по высоте свободной ячейки и «плавала» на уровне середины
    // соседней карточки портфеля; теперь плитки начинаются сразу под заголовком, как у
    // соседей. asCell=true → занимает свободную ЯЧЕЙКУ сетки (растягивается на высоту
    // соседних карточек через align-items:stretch); asCell=false → узкая колонка под
    // сеткой (чётное число портфелей).
    // hideId (напр. 'cal') — на дашборде даёт глаз-скрытие блока прямо в ПОСЛЕДНЕЙ плитке
    // (заголовок «Ставки рынка» убран по просьбе — плитки самоописательны, а отдельная шапка
    // ради глаза была лишней). Классический путь вызывается без hideId — плитки без глаза.
    function ratesStackHtml(asCell, span, withHead, hideId) {
        var tiles = rateTiles();
        var eye = hideId
            ? '<button class="pfc-act pf-ratestile-eye" title="Скрыть блок (вернуть — «Видимость» в шапке)" aria-label="Скрыть блок ставок" onclick="pfdHideBlock(\'' + jsArg(hideId) + '\')">' + EYEOFF_SVG + '</button>'
            : '';
        var grid = '<div class="drt-grid pf-ratesstack-grid">' + tiles.map(function (t, i) {
            return rateTileHtml(t, i === tiles.length - 1 ? eye : '');
        }).join('') + '</div>';
        var cls = 'pf-ratesstack' + (asCell ? ' pf-ratesstack--cell' : ' pf-ratesstack--flow') +
            (asCell && span === 2 ? ' pf-ratesstack--span2' : '');
        return '<div class="' + cls + '">' +
            '<div class="pf-ratesstack-body">' + grid + '</div></div>';
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
        if (days < 60) { var w = Math.round(days / 7); return 'через ' + w + ' ' + plural(w, 'неделю', 'недели', 'недель'); }
        var mo = Math.round(days / 30);   // дальше двух месяцев недели уже не читаются
        return 'через ' + mo + ' ' + plural(mo, 'месяц', 'месяца', 'месяцев');
    }
    // все держащиеся сейчас облигации (qty>0) по всем портфелям — общий список для календаря
    // и для догрузки недостающих деталей купонов разом (а не по одной при открытии каждого портфеля)
    // Фильтр календаря выплат: payCalSel === null → показываем все (не скрытые) портфели;
    // иначе объект { pid:true } — какие портфели включены пользователем.
    var payCalSel = null;
    function calPfSelected(p) { return !payCalSel || !!payCalSel[p.id]; }
    // у портфеля есть акции с ОБЪЯВЛЕННЫМИ будущими дивидендами (по загруженным расписаниям)
    function pfHasUpcomingDivs(p) {
        var today = todayStr();
        return (p.holdings || []).some(function (h) {
            if (h.type === 'bond' || !h.ticker || !(aggHolding(h).qty > 0)) return false;
            var ds = divSched[h.ticker];
            return !!(ds && ds.some(function (dv) { return dv.d > today; }));
        });
    }
    // портфели-кандидаты для фильтра: не скрытые, с облигациями ИЛИ с будущими дивидендами
    function calPfCandidates() {
        return store.items.filter(function (p) {
            if (p.hidden) return false;
            var hasBond = (p.holdings || []).some(function (h) { return h.type === 'bond' && h.ticker && aggHolding(h).qty > 0; });
            return hasBond || pfHasUpcomingDivs(p);
        });
    }
    function allHeldOf(type) {
        var list = [];
        store.items.forEach(function (p) {
            if (p.hidden) return;              // скрытый портфель — выплаты в календаре не показываем
            if (!calPfSelected(p)) return;     // снят в фильтре «Какие портфели показывать»
            (p.holdings || []).forEach(function (h) {
                var isB = h.type === 'bond';
                if ((type === 'bond' ? isB : !isB) && h.ticker && aggHolding(h).qty > 0) list.push({ p: p, h: h });
            });
        });
        return list;
    }
    function allHeldBonds() { return allHeldOf('bond'); }
    function allHeldStocks() { return allHeldOf('stock'); }
    // Будущие выплаты на год вперёд: купоны по НАСТОЯЩЕМУ расписанию MOEX (bondization;
    // фолбэк — прежняя периодическая схема, пока расписание грузится/недоступно),
    // погашения (номинал × кол-во в дату matDate) и объявленные дивиденды (по дате отсечки).
    function collectUpcomingPayouts() {
        var evs = [], now = Date.now(), horizon = now + 365 * 86400000, today = todayStr();
        // номер портфеля — его позиция среди ВИДИМЫХ карточек (там же нумеруются кольца)
        var visNum = {};
        visibleItems().forEach(function (p, i) { visNum[p.id] = i + 1; });
        function ev(date, kind, amount, x) {
            return { date: date, kind: kind, amount: amount, ticker: x.h.ticker, name: x.h.name || x.h.ticker,
                pfName: x.p.name, pfColor: colorVal(x.p.color), pfNum: visNum[x.p.id] || '' };
        }
        allHeldBonds().forEach(function (x) {
            var qty = aggHolding(x.h).qty;
            var det = bondDetail(x.h.ticker);
            var full = fullBondId(x.h.ticker);
            var sched = (full in coupSched) ? coupSched[full] : (ensureSchedule('bond', full), undefined);
            var pushed = false;
            if (sched) {
                sched.forEach(function (cp) {
                    if (cp.d <= today) return;
                    var t = Date.parse(cp.d); if (!isFinite(t) || t > horizon) return;
                    evs.push(ev(new Date(t), 'coupon', cp.v * qty, x)); pushed = true;
                });
            }
            if (!pushed && det && (+det.couponValue > 0)) {   // фолбэк: периодическая схема
                var nd = nextCouponDate(det);
                if (nd && +det.freq > 0) {
                    var stepMs = (365 / det.freq) * 86400000;
                    var matT = (parseBondDate(det.matDate) || { getTime: function () { return horizon; } }).getTime();
                    for (var t2 = nd.getTime(); t2 <= horizon && t2 <= matT; t2 += stepMs)
                        evs.push(ev(new Date(t2), 'coupon', det.couponValue * qty, x));
                }
            }
            // погашение: тело облигации возвращается в дату matDate
            if (det) {
                var mat = parseBondDate(det.matDate);
                if (mat && mat.getTime() > now && mat.getTime() <= horizon)
                    evs.push(ev(mat, 'redeem', bondFace(x.h.ticker) * qty, x));
            }
        });
        allHeldStocks().forEach(function (x) {
            var ds = (x.h.ticker in divSched) ? divSched[x.h.ticker] : (ensureSchedule('div', x.h.ticker), undefined);
            if (!ds) return;
            var qty = aggHolding(x.h).qty;
            ds.forEach(function (dv) {
                if (dv.d <= today) return;
                var t = Date.parse(dv.d); if (!isFinite(t) || t > horizon) return;
                evs.push(ev(new Date(t), 'div', dv.v * qty, x));
            });
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
            ? { t: 'Пока не считается', s: 'Не нашли расписание выплат по вашим бумагам — попробуйте обновить страницу чуть позже.' }
            : { t: 'Пока нечего показывать', s: 'Добавьте облигации или дивидендные акции в любой портфель — здесь появится график ближайших выплат.' };
        return '<div class="pfpc-state"><div class="pfpc-state-art">' + CAL_ICO_SVG + '</div>' +
            '<div class="pfpc-state-t">' + conf.t + '</div><div class="pfpc-state-s">' + conf.s + '</div></div>';
    }
    function payCalRowHtml(ev, multiPf) {
        // метка портфеля — его НОМЕР, «закрашенный маркером» цвета портфеля (тот же приём,
        // что у названия на карточке, .pfc-name-ink); имя портфеля остаётся в title.
        // Номер — ПЕРВОЙ колонкой фиксированной ширины (левая «рельса», как кольца-номера
        // на карточках и строки сводки): между тикером и суммой он стоял вплотную к
        // auto-колонке суммы и «плавал» по горизонтали вслед за её шириной — номера
        // соседних строк не выравнивались. Один портфель → колонка не рендерится вовсе.
        // Тип выплаты: купон — по умолчанию (без бейджа), дивиденды и погашение — с бейджем.
        var kind = ev.kind === 'div' ? '<i class="pfpc-kind kind-div" title="Объявленные дивиденды — по дате закрытия реестра (деньги приходят на пару недель позже)">дивиденды</i>'
            : ev.kind === 'redeem' ? '<i class="pfpc-kind kind-red" title="Погашение — возврат номинала облигации">погашение</i>' : '';
        return '<div class="pfpc-row' + (multiPf ? ' pfpc-row--pf' : '') + '">' +
            (multiPf ? '<span class="pfpc-pf" style="--c:' + ev.pfColor + '" title="' + esc(ev.pfName) + '"><b class="pfpc-pfnum">' + ev.pfNum + '</b></span>' : '') +
            '<div class="pfpc-date"><b>' + ruDate(dateToIso(ev.date)) + '</b><span>' + daysUntilText(ev.date) + '</span></div>' +
            '<div class="pfpc-id"><span class="pfpc-tk">' + esc(ev.ticker) + kind + '</span><span class="pfpc-nm">' + esc(ev.name) + '</span></div>' +
            '<div class="pfpc-amt">+' + fmtRub(ev.amount) + '</div>' +
        '</div>';
    }
    // подпись месяца для разделителей списка выплат («Сентябрь 2026 · +12 400 ₽»)
    var PAY_MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    function payMonKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
    var FILTER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
    // Попап «Какие портфели показывать» в шапке календаря: строка «Показать все» + по строке
    // на каждый портфель (переиспользует инфраструктуру попапов «Импорт», key='paycal').
    function calFilterHtml() {
        var cands = calPfCandidates();
        if (cands.length < 2) return '';   // фильтровать нечего (0–1 портфель с облигациями)
        var allOn = !payCalSel;
        var selN = cands.filter(calPfSelected).length;
        var rows = '<button class="pf-impitem pf-eyeitem' + (allOn ? '' : ' off-eye') + '" onclick="pfCalShowAll(event)">' +
                '<span class="pf-eyedot pfpc-alldot"></span>' +
                '<span class="pf-impbody"><b>Показать все</b><i>купоны по всем портфелям</i></span>' +
                '<span class="pf-eyestate">' + (allOn ? CHECK_SVG : '') + '</span></button>' +
            cands.map(function (p) {
                var on = calPfSelected(p);
                return '<button class="pf-impitem pf-eyeitem' + (on ? '' : ' off-eye') + '" onclick="pfToggleCalPf(\'' + p.id + '\',event)">' +
                    '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                    '<span class="pf-impbody"><b>' + esc(p.name) + '</b></span>' +
                    '<span class="pf-eyestate">' + (on ? EYE_SVG : EYEOFF_SVG) + '</span></button>';
            }).join('');
        var badge = !allOn ? '<i class="pf-eyecnt">' + selN + '/' + cands.length + '</i>' : '';
        return '<div class="pf-impwrap pfpc-filter">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'paycal\')">' + FILTER_SVG + 'Портфели' + badge + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-paycal">' +
                '<div class="pf-impgrp">Какие портфели показывать</div>' + rows +
            '</div></div>';
    }
    // Единый календарь: выплаты по ВСЕМ портфелям сразу на год вперёд — купоны (настоящее
    // расписание MOEX), погашения и объявленные дивиденды. asCell=true → карточка встаёт
    // ЯЧЕЙКОЙ в сетку портфелей (нечётное их число): высота равна карточке портфеля,
    // список скроллится внутри (см. .pf-paycal--cell в CSS).
    function paymentCalendarHtml(asCell, span) {
        if (!store.items.length) return '';
        var SUB = 'купоны, дивиденды и погашения на год вперёд';
        var cls = 'dash2-card pf-card2 pf-paycal' + (asCell ? ' pf-paycal--cell' : '') + (asCell && span === 2 ? ' pf-paycal--span2' : '');
        var held = allHeldBonds(), heldS = allHeldStocks();
        var head = pfCardHead('', 'Календарь выплат', SUB, '<div class="pfpc-head-r">' + calFilterHtml() + '</div>');
        if (!held.length && !heldS.length) return '<div class="' + cls + '">' + head + payCalStateHtml('nobonds') + '</div>';
        var missing = held.some(function (x) { return !bondDetail(x.h.ticker); });
        if (missing) ensureAllBondDetails(function () { softRerender(); });
        // расписания (купоны облигаций / дивиденды акций) ещё в очереди загрузки?
        var schedPending = held.some(function (x) { return !(fullBondId(x.h.ticker) in coupSched); }) ||
            heldS.some(function (x) { return !(x.h.ticker in divSched); });
        var evs = collectUpcomingPayouts();
        if (!evs.length) return '<div class="' + cls + '">' + head + payCalStateHtml((missing || schedPending) ? 'loading' : 'nodata') + '</div>';
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
        var soonEvs = evs.filter(function (e) { return (e.date.getTime() - Date.now()) <= 30 * 86400000; });
        var soonSum = soonEvs.reduce(function (s, e) { return s + e.amount; }, 0);
        // в свёрнутом виде показана только ближайшая дата — бейдж с числом выплат за 30 дней
        // сохраняет контекст «сколько ещё впереди», не разворачивая список
        var cntBadge = (collapseNext && !payCalFull && soonEvs.length > shown.length)
            ? '<span class="pfpc-cnt">' + soonEvs.length + ' ' + plural(soonEvs.length, 'выплата', 'выплаты', 'выплат') + '</span>' : '';
        var soon = '<div class="pfpc-soon"><span class="pfpc-soon-l">За 30 дней</span>' + cntBadge + '<span class="pfpc-soon-v">+' + fmtRub(soonSum) + '</span></div>';
        // при раскрытии shown === evs, поэтому evs.length > shown.length перестаёт быть true —
        // в развёрнутом виде кнопку показываем принудительно (иначе нельзя свернуть обратно)
        var more = (!asCell && (payCalFull || evs.length > shown.length)) ? '<button class="pfpc-more' + (payCalFull ? ' on' : '') + '" onclick="pfTogglePayCal()">' +
            '<span>' + (payCalFull ? 'Свернуть' : 'Показать все · ' + evs.length) + '</span>' +
            '<svg class="pfpc-more-ch' + (payCalFull ? ' up' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' : '';
        var right = '<div class="pfpc-head-r">' + calFilterHtml() + soon + '</div>';
        // в развёрнутых видах (ячейка/«показать все») список разбиваем разделителями по
        // месяцам с суммой месяца; короткий свёрнутый список оставляем плоским
        var withMonths = (payCalFull || asCell) && shown.length > 3;
        var monSum = {};
        if (withMonths) evs.forEach(function (e) { var k = payMonKey(e.date); monSum[k] = (monSum[k] || 0) + e.amount; });
        var rowsHtml = '', prevMon = null;
        shown.forEach(function (e) {
            if (withMonths) {
                var k = payMonKey(e.date);
                if (k !== prevMon) {
                    prevMon = k;
                    rowsHtml += '<div class="pfpc-mon"><b>' + PAY_MON[e.date.getMonth()] + ' ' + e.date.getFullYear() + '</b><span>+' + fmtRub(monSum[k]) + '</span></div>';
                }
            }
            rowsHtml += payCalRowHtml(e, multiPf);
        });
        return '<div class="' + cls + '">' + pfCardHead('', 'Календарь выплат', SUB, right) +
            '<div class="pfpc-body" data-skey="paycal" onscroll="pfPayCalScroll(this)"><div class="pfpc-list">' + rowsHtml + '</div>' + more + '</div>' +
        '</div>';
    }
    window.pfTogglePayCal = function () { payCalFull = !payCalFull; renderPortfolios(); };
    // ре-рендер, сохраняя открытым попап фильтра календаря (как в pfToggleHidden с меню «Видимость»)
    function reRenderKeepCalMenu() {
        var open = !!(dq('pfImp-paycal') && dq('pfImp-paycal').classList.contains('open'));
        renderPortfolios();
        if (open) { var m = dq('pfImp-paycal'); if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); } }
    }
    // renderNoAnim (не renderPortfolios): переключатель сортировки избранного трогает только
    // порядок плиток, но полный ре-рендер заново «рисует» мини-графики карточек портфелей с
    // 1-сек. анимацией линии — на глаз это мерцание. Флаг noChartAnim рисует графики сразу.
    window.pfSetFavSort = function (mode) { if (mode !== 'pot' && mode !== 'news') return; if (favSort === mode) return; favSort = mode; renderNoAnim(); };
    window.pfCalShowAll = function (ev) { if (ev) ev.stopPropagation(); payCalSel = null; reRenderKeepCalMenu(); };
    window.pfToggleCalPf = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var cands = calPfCandidates();
        if (!payCalSel) { payCalSel = {}; cands.forEach(function (p) { payCalSel[p.id] = true; }); }
        payCalSel[pid] = !payCalSel[pid];
        // все выбраны → вернуть в состояние «все» (null); все сняты → тоже сбрасываем в «все»
        // (пустой календарь без причины бессмыслен)
        if (cands.every(function (p) { return payCalSel[p.id]; }) || cands.every(function (p) { return !payCalSel[p.id]; })) payCalSel = null;
        reRenderKeepCalMenu();
    };
    // В режиме ячейки список выплат скроллится внутри карточки — пока ниже есть ещё строки,
    // низ списка плавно затухает (класс has-more + mask в CSS) вместо жёсткого среза
    // последней видимой строки; доскроллили до конца — затухание снимается.
    window.pfPayCalScroll = function (el) {
        if (!el) return;
        var more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
        el.classList.toggle('has-more', more);
    };

    // ====================================================================
    //  ИСТОРИЯ СДЕЛОК — полноширинный журнал ПОД всей сеткой (всегда самая
    //  нижняя секция). Каждая сделка = один лот покупки (модель хранит только
    //  покупки; поля l.side/l.fee зарезервированы под будущий ввод продаж и
    //  комиссии — сейчас side='buy', fee=0). Стиль повторяет «Календарь выплат».
    // ====================================================================
    var TRADES_HIDDEN_KEY = 'pf_trades_hidden_v1';
    var tradesHidden = false;
    try { tradesHidden = localStorage.getItem(TRADES_HIDDEN_KEY) === '1'; } catch (e) {}
    var tradesFull = false;     // общий шеврон блока: свёрнуто → 2 последние сделки
    var tradeYearOpen = {};     // year → true/false, переопределяет дефолт (последний год открыт)
    var tradeSel = null;        // фильтр портфелей: null = все, иначе { pid:true }
    var TR_CHEV = '<svg class="__CH__" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    function tradePfSelected(p) { return !tradeSel || !!tradeSel[p.id]; }
    // портфели-кандидаты для фильтра: не скрытые и содержащие хоть один лот с кол-вом > 0
    function tradePfCandidates() {
        return store.items.filter(function (p) {
            return !p.hidden && (p.holdings || []).some(function (h) {
                return h.ticker && ensureLots(h).some(function (l) { return (+l.qty || 0) > 0; });
            });
        });
    }
    // all=true → без фильтра портфелей (для проверки «есть ли вообще сделки»)
    function collectTrades(all) {
        var list = [];
        // номер портфеля-метки — тот же, что у колец на карточках и в календаре выплат
        // (позиция среди ВИДИМЫХ портфелей), чтобы номера совпадали по всей вкладке
        var visNum = {};
        visibleItems().forEach(function (p, i) { visNum[p.id] = i + 1; });
        store.items.forEach(function (p) {
            if (p.hidden) return;
            if (!all && !tradePfSelected(p)) return;
            // Обмены ребалансировки: продажи в лотах не хранятся (лоты — только покупки),
            // поэтому строку «Продажа» строим из журнала p.trades. Купленный в обмене лот
            // помечаем связкой lotId→trade — для бейджа «ребаланс» и синхронной отмены.
            var rebalByLot = {};
            var newestUndoable = (p.trades && p.trades.length && p.trades[0].undo) ? p.trades[0].id : null;
            (p.trades || []).forEach(function (t) {
                if (t.undo && t.undo.buyLotId) rebalByLot[t.undo.buyLotId] = t;
                var w = new Date(t.ts || 0);
                var iso = w.getFullYear() + '-' + pad2(w.getMonth() + 1) + '-' + pad2(w.getDate());
                var qty = +t.sellQty || 0;
                var proceeds = +t.proceeds || 0;
                list.push({ date: iso, ticker: t.sellTicker || '', name: t.sellName || t.sellTicker || '',
                    type: t.kind === 'bond' ? 'bond' : 'stock', side: 'sell',
                    price: qty > 0 ? proceeds / qty : 0, nkd: 0, hasNkd: false, qty: qty,
                    position: proceeds, fee: 0, total: proceeds,
                    pfName: p.name, pfColor: colorVal(p.color), pfNum: visNum[p.id] || '',
                    rebal: true, pid: p.id, tradeId: t.id, undoable: t.id === newestUndoable });
            });
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker) return;
                var isBond = h.type === 'bond';
                ensureLots(h).forEach(function (l) {
                    var qty = +l.qty || 0; if (!(qty > 0)) return;
                    var price = +l.buyPrice || 0;
                    var nkd = isBond ? (+l.nkd || 0) : 0;
                    var position = (price + nkd) * qty;   // стоимость бумаг (для облигаций — с НКД)
                    var fee = +l.fee || 0;
                    var rt = rebalByLot[l.id];   // лот куплен в обмене ребалансировки?
                    list.push({ date: l.buyDate || '', ticker: h.ticker, name: h.name || h.ticker,
                        type: h.type, side: l.side === 'sell' ? 'sell' : 'buy',
                        price: price, nkd: nkd, hasNkd: isBond, qty: qty,
                        position: position, fee: fee, total: position + fee,
                        pfName: p.name, pfColor: colorVal(p.color), pfNum: visNum[p.id] || '',
                        rebal: !!rt, pid: p.id, tradeId: rt ? rt.id : null,
                        undoable: !!rt && rt.id === newestUndoable });
                });
            });
        });
        // новее — выше (даты ISO YYYY-MM-DD сравниваются лексикографически)
        list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        return list;
    }
    function hasAnyTrades() { return collectTrades(true).length > 0; }
    function groupTradesByYear(trades) {
        var groups = [], idx = {};
        trades.forEach(function (t) {
            var y = (t.date || '').slice(0, 4) || '—';
            if (!(y in idx)) { idx[y] = groups.length; groups.push({ year: y, items: [], sum: 0 }); }
            var g = groups[idx[y]]; g.items.push(t);
            if (t.side !== 'sell') g.sum += t.total;   // сумма года — только расходы на покупки
        });
        return groups;   // порядок годов — по убыванию (trades уже отсортированы)
    }
    function tradeYearIsOpen(year, latest) { return (year in tradeYearOpen) ? tradeYearOpen[year] : (year === latest); }

    function tradeHeadRowHtml(multiPf) {
        return '<div class="pft-hrow">' +
            (multiPf ? '<div class="pft-h"></div>' : '') +   // рельса номера-маркера — без заголовка
            '<div class="pft-h">Дата</div>' +
            '<div class="pft-h">Тип</div>' +
            '<div class="pft-h">Тикер · название</div>' +
            '<div class="pft-h pft-r">Цена</div>' +
            '<div class="pft-h pft-r">НКД</div>' +
            '<div class="pft-h pft-r">Кол-во</div>' +
            '<div class="pft-h pft-r">Позиция</div>' +
            '<div class="pft-h pft-r">Комиссия</div>' +
            '<div class="pft-h pft-r">Расход</div>' +
        '</div>';
    }
    function tradeRowHtml(t, multiPf) {
        var side = t.side === 'sell'
            ? '<span class="pft-side sell">Продажа</span>'
            : '<span class="pft-side buy">Покупка</span>';
        // сделка из ребалансировки: компактная круглая иконка-метка В ТОЙ ЖЕ строке, что
        // и пилюля типа (не вторым рядом) + (для последней) кнопка синхронной отмены —
        // отмена убирает И продажу, И покупку (общая механика pfRbUndoTrade)
        if (t.rebal) side += '<span class="pft-rebal-ic" title="Сделка из ребалансировки портфеля">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg></span>';
        var undoBtn = (t.rebal && t.undoable && t.pid && t.tradeId)
            ? '<button class="pft-undo" onclick="pfRbUndoTrade(\'' + t.pid + '\',\'' + t.tradeId + '\')" title="Отменить ребалансировку — исчезнут и продажа, и покупка">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>Отменить ребалансировку</button>'
            : '';
        var rel = '';
        if (t.date && typeof getRelativeDateText === 'function') {
            var d = new Date(t.date); if (!isNaN(d.getTime())) rel = getRelativeDateText(d);
        }
        // для продажи «Расход» — на самом деле приход: показываем с плюсом и зелёным
        var totalCell = t.side === 'sell' ? '<span class="pft-in">+' + fmtRub(t.total) + '</span>' : fmtRub(t.total);
        return '<div class="pft-row' + (t.rebal ? ' pft-row-rebal' : '') + '">' +
            // метка портфеля — номер-маркер ПЕРВОЙ колонкой (левая рельса, как в календаре
            // выплат): без имени и без заголовка, имя портфеля — в подсказке при наведении
            (multiPf ? '<span class="pft-pf" style="--c:' + t.pfColor + '" title="' + esc(t.pfName) + '"><b class="pft-pfnum">' + (t.pfNum || '') + '</b></span>' : '') +
            '<div class="pft-date"><b>' + ruDate(t.date) + '</b>' + (rel ? '<span>' + esc(rel) + '</span>' : '') + '</div>' +
            '<div class="pft-c pft-type">' + side + '</div>' +
            '<div class="pft-id"><span class="pft-tk">' + esc(t.ticker) + '</span><span class="pft-nm">' + esc(t.name) + '</span></div>' +
            '<div class="pft-c pft-price">' + fmtPrice(t.price) + '</div>' +
            '<div class="pft-c pft-nkd">' + (t.hasNkd ? fmtPrice(t.nkd) : '<span class="pft-dash">—</span>') + '</div>' +
            '<div class="pft-c pft-qty">' + t.qty + '</div>' +
            '<div class="pft-c pft-pos">' + fmtRub(t.position) + '</div>' +
            '<div class="pft-c pft-fee">' + (t.fee > 0 ? fmtRub(t.fee) : '<span class="pft-dash">—</span>') + '</div>' +
            '<div class="pft-c pft-total">' + totalCell + '</div>' +
            undoBtn +
        '</div>';
    }
    // Попап-фильтр «Какие портфели показывать» (переиспользует инфраструктуру «Импорт», key='trades')
    function tradeFilterHtml() {
        var cands = tradePfCandidates();
        if (cands.length < 2) return '';   // фильтровать нечего (0–1 портфель со сделками)
        var allOn = !tradeSel, selN = cands.filter(tradePfSelected).length;
        var rows = '<button class="pf-impitem pf-eyeitem' + (allOn ? '' : ' off-eye') + '" onclick="pfTradeShowAll(event)">' +
                '<span class="pf-eyedot pfpc-alldot"></span>' +
                '<span class="pf-impbody"><b>Показать все</b><i>сделки по всем портфелям</i></span>' +
                '<span class="pf-eyestate">' + (allOn ? CHECK_SVG : '') + '</span></button>' +
            cands.map(function (p) {
                var on = tradePfSelected(p);
                return '<button class="pf-impitem pf-eyeitem' + (on ? '' : ' off-eye') + '" onclick="pfToggleTradePf(\'' + p.id + '\',event)">' +
                    '<span class="pf-eyedot" style="background:' + colorVal(p.color) + '"></span>' +
                    '<span class="pf-impbody"><b>' + esc(p.name) + '</b></span>' +
                    '<span class="pf-eyestate">' + (on ? EYE_SVG : EYEOFF_SVG) + '</span></button>';
            }).join('');
        var badge = !allOn ? '<i class="pf-eyecnt">' + selN + '/' + cands.length + '</i>' : '';
        return '<div class="pf-impwrap pft-filter">' +
            '<button class="d3-quick ghost pf-impbtn" onclick="pfToggleImp(event,\'trades\')">' + FILTER_SVG + 'Портфели' + badge + CHEV_SVG + '</button>' +
            '<div class="pf-impmenu" id="pfImp-trades">' +
                '<div class="pf-impgrp">Какие портфели показывать</div>' + rows +
            '</div></div>';
    }
    function tradesHtml() {
        if (tradesHidden || !store.items.length || !hasAnyTrades()) return '';
        var trades = collectTrades(false);
        var multiPf = tradePfCandidates().length > 1;   // колонка «Портфель» — только при 2+
        var cls = 'dash2-card pf-card2 pf-trades' + (multiPf ? ' has-pf' : '');
        // «Расход всего» — только траты на покупки (выручка продаж расходом не является)
        var totalSum = trades.reduce(function (s, t) { return s + (t.side === 'sell' ? 0 : t.total); }, 0);
        var toggle = '<button class="pft-toggle' + (tradesFull ? ' on' : '') + '" onclick="pfToggleTrades()" title="' + (tradesFull ? 'Свернуть' : 'Показать все сделки') + '">' +
            '<span>' + (tradesFull ? 'Свернуть' : 'Все сделки · ' + trades.length) + '</span>' +
            TR_CHEV.replace('__CH__', 'pft-toggle-ch' + (tradesFull ? ' up' : '')) + '</button>';
        var right = '<div class="pft-head-r">' + tradeFilterHtml() +
            '<div class="pft-sum"><span class="pft-sum-l">Расход всего</span><span class="pft-sum-v">' + fmtRub(totalSum) + '</span></div>' +
            toggle + '</div>';
        var head = pfCardHead('', 'История сделок', 'покупки и продажи по всем портфелям', right);
        var inner;
        if (!trades.length) {
            inner = '<div class="pft-empty">Ни один портфель не выбран в фильтре</div>';
        } else if (!tradesFull) {
            // свёрнуто — 2 последние сделки плоским списком (без разбивки по годам)
            inner = tradeHeadRowHtml(multiPf) +
                '<div class="pft-list">' + trades.slice(0, 2).map(function (t) { return tradeRowHtml(t, multiPf); }).join('') + '</div>' +
                (trades.length > 2 ? '<div class="pft-morehint">и ещё ' + (trades.length - 2) + ' ' + plural(trades.length - 2, 'сделка', 'сделки', 'сделок') + ' — разверните «Все сделки»</div>' : '');
        } else {
            // развёрнуто — с разбивкой по годам; прошлые годы сворачиваются по клику
            var groups = groupTradesByYear(trades);
            var latest = groups.length ? groups[0].year : '';
            inner = tradeHeadRowHtml(multiPf) + groups.map(function (g) {
                var open = tradeYearIsOpen(g.year, latest);
                var yhead = '<button class="pft-yr' + (open ? ' open' : '') + '" onclick="pfToggleTradeYear(\'' + g.year + '\')">' +
                    TR_CHEV.replace('__CH__', 'pft-yr-ch') +
                    '<span class="pft-yr-y">' + esc(g.year) + '</span>' +
                    '<span class="pft-yr-n">' + g.items.length + ' ' + plural(g.items.length, 'сделка', 'сделки', 'сделок') + '</span>' +
                    '<span class="pft-yr-sum">' + fmtRub(g.sum) + '</span></button>';
                var rows = open ? '<div class="pft-list">' + g.items.map(function (t) { return tradeRowHtml(t, multiPf); }).join('') + '</div>' : '';
                return '<div class="pft-yrgrp">' + yhead + rows + '</div>';
            }).join('');
        }
        return '<div class="' + cls + '">' + head + '<div class="pft-body">' + inner + '</div></div>';
    }
    // renderNoAnim — раскрытие «Истории сделок» иначе перерисовывает мини-графики карточек с анимацией (мигание)
    window.pfToggleTrades = function () { tradesFull = !tradesFull; renderNoAnim(); };
    window.pfToggleTradeYear = function (year) {
        var groups = groupTradesByYear(collectTrades(false));
        var latest = groups.length ? groups[0].year : '';
        tradeYearOpen[year] = !tradeYearIsOpen(year, latest);
        renderPortfolios();
    };
    // ре-рендер с сохранением открытого попапа-фильтра сделок (как reRenderKeepCalMenu)
    function reRenderKeepTradeMenu() {
        var open = !!(dq('pfImp-trades') && dq('pfImp-trades').classList.contains('open'));
        renderPortfolios();
        if (open) { var m = dq('pfImp-trades'); if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); } }
    }
    window.pfTradeShowAll = function (ev) { if (ev) ev.stopPropagation(); tradeSel = null; reRenderKeepTradeMenu(); };
    window.pfToggleTradePf = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var cands = tradePfCandidates();
        if (!tradeSel) { tradeSel = {}; cands.forEach(function (p) { tradeSel[p.id] = true; }); }
        tradeSel[pid] = !tradeSel[pid];
        if (cands.every(function (p) { return tradeSel[p.id]; }) || cands.every(function (p) { return !tradeSel[p.id]; })) tradeSel = null;
        reRenderKeepTradeMenu();
    };
    // тумблер видимости блока «История сделок» из меню «Видимость» (попап оставляем открытым)
    window.pfToggleTradesHidden = function (ev) {
        if (ev) ev.stopPropagation();
        tradesHidden = !tradesHidden;
        try { localStorage.setItem(TRADES_HIDDEN_KEY, tradesHidden ? '1' : '0'); } catch (e) {}
        var keepOpen = !!(dq('pfImp-eye') && dq('pfImp-eye').classList.contains('open'));
        renderSmooth(keepOpen ? function () {
            var m = dq('pfImp-eye');
            if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
        } : null);
        toast(tradesHidden ? 'История сделок скрыта' : 'История сделок показана');
    };
    // тумблер видимости ИЗНАЧАЛЬНОЙ секции (Календарь/Ставки/Избранное/Сводка) из меню
    // «Видимость» — попап оставляем открытым, как у «Истории сделок»
    window.pfdToggleSection = function (id, ev) {
        if (ev) ev.stopPropagation();
        var wasHidden = !!(dashCfg.hidden || {})[id];
        pfdPushUndo();
        dashCfg.hidden[id] = wasHidden ? 0 : 1;
        saveDashCfg();
        var keepOpen = !!(dq('pfImp-eye') && dq('pfImp-eye').classList.contains('open'));
        pfdWantRender = true;   // явная правка конструктора — не глушим рендер
        renderSmooth(keepOpen ? function () {
            var m = dq('pfImp-eye');
            if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
        } : null);
        toast(wasHidden ? 'Блок показан' : 'Блок скрыт');
    };

    // ====================================================================
    //  ДЕЙСТВИЯ (inline onclick)
    // ====================================================================
    window.pfAddPortfolio = function () {
        if (store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' ' + plural(MAX_CARDS, 'портфель', 'портфеля', 'портфелей') + ' на странице', true); return; }
        var p = makePortfolio(); store.items.push(p); saveStore();
        // настройки нового портфеля открываются сразу — с тем же чистым состоянием, что и
        // через ⚙ (pfToggleMenu): форма добавления раскрыта (портфель пуст), остальное закрыто
        openMenu = p.id; menuJustOpened = true;
        // форма добавления СВЁРНУТА по умолчанию (раскрывается кнопкой «＋ Добавить актив») —
        // раньше открывалась сразу, что мешало
        editHold = {}; colorsOpen = false; delArm = false; addOpen = false;
        // новый портфель добавляется ВНИЗ; не прыгаем в начало страницы (своп innerHTML терял
        // scroll-anchor) — держим позицию главного скролла, чтобы к новому портфелю не бежать заново
        var sc = document.getElementById('contentArea'), scTop = sc ? sc.scrollTop : 0;
        renderPortfolios();
        if (sc && sc.scrollTop !== scTop) sc.scrollTop = scTop;
    };
    // Скопировать состав портфеля таблицей: облигации и акции — ОТДЕЛЬНЫМИ блоками, у
    // каждого своё жирное название раздела и своя строка заголовков (№ / Тикер / … ), между
    // блоками — пустая строка. Возвращает { text, html }:
    //  · text — TSV-фолбэк (пустая строка-разделитель, заголовки под названием раздела),
    //    в Excel столбцы выравниваются по табам;
    //  · html — таблица для Excel/Word/Google-таблиц: названия разделов и заголовки жирные,
    //    каждое значение в своей ячейке — выравнивание по заголовкам «из коробки».
    function copyTextForPortfolio(p) {
        var c = calcPf(p);
        if (!c.hs.length) return null;
        // числа без «₽» и разрядных пробелов, десятичная запятая — Excel съедает как число
        function numCell(v) {
            if (v == null || !isFinite(v)) return '';
            return String(Math.round(v * 100) / 100).replace('.', ',');
        }
        var COLS = ['№', 'Тикер', 'Название', 'Кол-во', 'Ед.', 'Цена, ₽', 'Дата покупки'];
        var ALIGN = ['right', 'left', 'left', 'right', 'left', 'right', 'left'];
        function rowCells(x, i) {
            return [i + 1, x.h.ticker, x.h.name || '', Math.round(x.c.qty || 0), 'шт',
                numCell(x.c.buy), ruDate(x.c.firstDate)];
        }
        var bonds = c.hs.filter(function (x) { return x.h.type === 'bond'; });
        var stocks = c.hs.filter(function (x) { return x.h.type !== 'bond'; });

        // ---- текстовый вариант: столбцы выровнены ПРОБЕЛАМИ (читается ровной таблицей в любом
        // моноширинном поле; Excel/Word/Google-таблицы берут rich-html ниже, поэтому табы не
        // нужны). Ширины столбцов общие для обоих блоков — облигации и акции выровнены между собой. ----
        var allRows = bonds.map(function (x, i) { return rowCells(x, i); })
            .concat(stocks.map(function (x, i) { return rowCells(x, i); }));
        var widths = COLS.map(function (h, ci) {
            var w = h.length;
            allRows.forEach(function (r) { w = Math.max(w, String(r[ci]).length); });
            return w;
        });
        function padCell(v, ci) {
            v = String(v);
            var gap = widths[ci] - v.length; if (gap < 0) gap = 0;
            var sp = new Array(gap + 1).join(' ');
            return ALIGN[ci] === 'right' ? sp + v : v + sp;
        }
        function fmtRow(cells) { return cells.map(padCell).join('  ').replace(/\s+$/, ''); }
        var lines = ['Портфель «' + p.name + '»'];
        function txtSection(title, list) {
            if (!list.length) return;
            lines.push('');                                 // пустая строка между блоками
            lines.push(title);                              // название раздела
            lines.push(fmtRow(COLS));                       // заголовки этого раздела
            list.forEach(function (x, i) { lines.push(fmtRow(rowCells(x, i))); });
        }
        txtSection('Облигации', bonds);
        txtSection('Акции', stocks);
        var text = lines.join('\n');

        // ---- HTML-вариант (жирные разделы/заголовки, выравнивание по столбцам) ----
        var rows = ['<tr><td colspan="' + COLS.length + '" style="font-weight:800;font-size:14px;padding-bottom:4px;">' + esc('Портфель «' + p.name + '»') + '</td></tr>'];
        function htmlSection(title, list) {
            if (!list.length) return;
            rows.push('<tr><td colspan="' + COLS.length + '" style="height:10px;"></td></tr>');   // пустая строка-разделитель
            rows.push('<tr><td colspan="' + COLS.length + '" style="font-weight:800;">' + esc(title) + '</td></tr>');
            rows.push('<tr>' + COLS.map(function (h, i) {
                return '<td align="' + ALIGN[i] + '" style="font-weight:700;border-bottom:1px solid #d0d7e2;">' + esc(h) + '</td>';
            }).join('') + '</tr>');
            list.forEach(function (x, i) {
                rows.push('<tr>' + rowCells(x, i).map(function (v, ci) {
                    return '<td align="' + ALIGN[ci] + '">' + esc(String(v)) + '</td>';
                }).join('') + '</tr>');
            });
        }
        htmlSection('Облигации', bonds);
        htmlSection('Акции', stocks);
        var html = '<table style="border-collapse:collapse;font-family:Inter,Arial,sans-serif;font-size:13px;">' + rows.join('') + '</table>';

        return { text: text, html: html };
    }
    // «+» в шапке «Избранного» → терминал: та же связка, что у сайдбар-подпункта «Терминал»
    // (раскрыть группу «Рынок» + показать таблицу акций в #panel-market-stocks)
    window.pfGoTerminal = function (ev) {
        if (ev) ev.stopPropagation();
        if (typeof window.sbOpenGroup === 'function') window.sbOpenGroup('market');
        if (typeof window.switchTab === 'function') window.switchTab('market-stocks');
    };
    window.pfCopyComposition = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var p = findPf(pid); if (!p) return;
        var payload = copyTextForPortfolio(p);
        if (!payload || !payload.text) { toast('Состав портфеля пуст', true); return; }
        function ok() { toast('Состав «' + p.name + '» скопирован'); }
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = payload.text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta); ok();
            } catch (e) { toast('Не удалось скопировать', true); }
        }
        function plainWrite() {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(payload.text).then(ok, fallback);
            else fallback();
        }
        try {
            // rich-copy: и жирные разделы (text/html для Excel/Word), и TSV-фолбэк (text/plain)
            if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem === 'function' && payload.html) {
                var item = new ClipboardItem({
                    'text/html': new Blob([payload.html], { type: 'text/html' }),
                    'text/plain': new Blob([payload.text], { type: 'text/plain' })
                });
                navigator.clipboard.write([item]).then(ok, plainWrite);
            } else plainWrite();
        } catch (e) { fallback(); }
    };
    // Скрыть/показать карточку. Попап «Видимость» пересоздаётся рендером — если он был
    // открыт, возвращаем ему .open, чтобы можно было переключить несколько портфелей подряд.
    window.pfToggleHidden = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var p = findPf(pid); if (!p) return;
        p.hidden = !p.hidden;
        if (p.hidden) {   // прибираем состояния скрытой карточки
            if (openMenu === pid) { openMenu = null; }
            delete chartOpen[pid]; delete chartAssets[pid]; delete chartAssetsFull[pid]; delete holdsExpand[pid];
        }
        var eyeMenu = dq('pfImp-eye');
        var keepOpen = !!(eyeMenu && eyeMenu.classList.contains('open'));
        var reopenEye = function () {
            var m = dq('pfImp-eye');
            if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
        };
        saveStore(); renderSmooth(keepOpen ? reopenEye : null);
        toast(p.hidden ? 'Портфель «' + p.name + '» скрыт из сетки' : 'Портфель «' + p.name + '» снова показан');
    };
    window.pfShowAllHidden = function () {
        store.items.forEach(function (p) { p.hidden = false; });
        saveStore(); renderSmooth();
    };
    // «Показать все»/«Скрыть все» внутри попапа «Видимость» — попап оставляем открытым
    function pfEyeReopen() {
        var m = dq('pfImp-eye');
        if (m) { m.classList.add('open'); setTimeout(function () { document.addEventListener('click', pfImpOutside); }, 0); }
    }
    window.pfEyeShowAll = function (ev) {
        if (ev) ev.stopPropagation();
        store.items.forEach(function (p) { p.hidden = false; });
        saveStore(); renderSmooth(pfEyeReopen);
    };
    window.pfEyeHideAll = function (ev) {
        if (ev) ev.stopPropagation();
        store.items.forEach(function (p) {
            p.hidden = true;
            if (openMenu === p.id) { openMenu = null; }
            delete chartOpen[p.id]; delete chartAssets[p.id]; delete chartAssetsFull[p.id]; delete holdsExpand[p.id];
        });
        saveStore(); renderSmooth(pfEyeReopen);
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
    window.pfImport = function (source, sub, pid, name) {
        closeImpMenus();
        var holds = compositionFrom(source, sub);
        if (!holds || !holds.length) { toast('Нет данных для импорта — выполните расчёт / добавьте избранное', true); return; }
        if (pid) {
            var p = findPf(pid); if (!p) return;
            p.holdings = (p.holdings || []).concat(holds); saveStore();
            pfInvalidateCharts(pid);   // состав изменился → серия графика доходности устарела
            ensureQuotes(true); renderPortfolios();
            autofillNkd(holds); toast('Добавлено: ' + holds.length); return;
        }
        if (store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' ' + plural(MAX_CARDS, 'портфель', 'портфеля', 'портфелей'), true); return; }
        // src запоминаем: портфель из «ежемесячного дохода» ребалансируется с проверкой
        // сохранности графика ежемесячных выплат (см. pfLostMonths в карточке ребалансировки)
        var np = makePortfolio((name && name.trim()) || importName(source)); np.holdings = holds; np.src = source; store.items.push(np); saveStore();
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
    // ---- общие CSV-хелперы выгрузок (под русский Excel: «;», BOM, десятичная запятая) ----
    function csvCell(v) {
        var s = String(v == null ? '' : v).replace(/\n/g, ' ');
        // Excel исполняет ячейки, начинающиеся с = + @ (формульная инъекция) —
        // гасим апострофом; отрицательные числа («-12,3») не трогаем
        if (/^[=+@\t\r]/.test(s) || (s[0] === '-' && !/^-[\d\s.,]+%?$/.test(s))) s = "'" + s;
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function csvNum(v, d) { return (v == null || isNaN(v)) ? '' : (+v).toFixed(d == null ? 2 : d).replace('.', ','); }
    function csvRuDate(iso) { return iso ? String(iso).split('-').reverse().join('.') : ''; }
    function csvDownload(lines, fname) {
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }
    // ---- отчёт: все позиции всех портфелей одной таблицей в CSV под русский Excel.
    // Блок на портфель: строки позиций + «Итого»; в конце — общий итог по всем портфелям.
    window.pfExportExcelAll = function () {
        closeImpMenus();
        if (!store.items.length) { toast('Пока нет портфелей для выгрузки', true); return; }
        var head = ['Портфель', 'Тип', 'Тикер', 'Название', 'Кол-во', 'Средняя цена, ₽', 'Вложено, ₽', 'Цена сейчас, ₽', 'Стоимость, ₽', 'Доход, ₽', 'Доход, %', 'Первая покупка'];
        var lines = [head.map(csvCell).join(';')], total = { inv: 0, val: 0 }, nPos = 0;
        store.items.forEach(function (p, i) {
            var c = calcPf(p);
            if (i > 0) lines.push('');
            c.hs.forEach(function (x) {
                if (!x.h.ticker || !(x.c.qty > 0)) return;
                nPos++;
                lines.push([p.name, x.h.type === 'bond' ? 'Облигация' : 'Акция', x.h.ticker, x.h.name || x.h.ticker,
                    x.c.qty, csvNum(x.c.buy), csvNum(x.c.invested), csvNum(x.c.cur), csvNum(x.c.value), csvNum(x.c.pnl), csvNum(x.c.pnlPct), csvRuDate(x.c.firstDate)
                ].map(csvCell).join(';'));
            });
            lines.push([p.name, 'Итого', '', '', '', '', csvNum(c.invested), '', csvNum(c.value), csvNum(c.pnl), csvNum(c.invested > 0 ? c.pnl / c.invested * 100 : 0), ''].map(csvCell).join(';'));
            total.inv += c.invested; total.val += c.value;
        });
        if (store.items.length > 1) {
            lines.push('');
            lines.push(['ВСЕ ПОРТФЕЛИ', 'Итого', '', '', '', '', csvNum(total.inv), '', csvNum(total.val), csvNum(total.val - total.inv), csvNum(total.inv > 0 ? (total.val - total.inv) / total.inv * 100 : 0), ''].map(csvCell).join(';'));
        }
        try {
            csvDownload(lines, 'madame-solomina-positions-' + todayStr() + '.csv');
            toast('Excel-отчёт сохранён · позиций: ' + nPos);
        } catch (e) { toast('Не удалось сохранить Excel-файл', true); }
    };
    // ---- отчёт: все сделки (покупки из лотов + продажи из журналов ребалансировок)
    // по ВСЕМ портфелям, включая скрытые — это выгрузка данных, а не вид страницы.
    window.pfExportTradesExcel = function () {
        closeImpMenus();
        var rows = [];
        store.items.forEach(function (p) {
            (p.trades || []).forEach(function (t) {   // продажи обменов ребалансировки
                var w = new Date(t.ts || 0);
                var iso = w.getFullYear() + '-' + pad2(w.getMonth() + 1) + '-' + pad2(w.getDate());
                var q = +t.sellQty || 0, proceeds = +t.proceeds || 0;
                rows.push({ pf: p.name, date: iso, side: 'Продажа', type: t.kind === 'bond' ? 'Облигация' : 'Акция',
                    tk: t.sellTicker || '', nm: t.sellName || t.sellTicker || '', price: q > 0 ? proceeds / q : null,
                    nkd: null, qty: q, sum: proceeds, feePct: (+t.fee || 0) * 100 });
            });
            (p.holdings || []).forEach(function (h) {
                if (!h.ticker) return;
                var isB = h.type === 'bond';
                ensureLots(h).forEach(function (l) {
                    var q = +l.qty || 0; if (!(q > 0)) return;
                    var nkd = isB ? (+l.nkd || 0) : null;
                    rows.push({ pf: p.name, date: l.buyDate || '', side: 'Покупка', type: isB ? 'Облигация' : 'Акция',
                        tk: h.ticker, nm: h.name || h.ticker, price: +l.buyPrice || 0, nkd: nkd, qty: q,
                        sum: ((+l.buyPrice || 0) + (nkd || 0)) * q, feePct: 0 });
                });
            });
        });
        if (!rows.length) { toast('Пока нет сделок для выгрузки', true); return; }
        rows.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        var head = ['Портфель', 'Дата', 'Сторона', 'Тип', 'Тикер', 'Название', 'Цена, ₽', 'НКД, ₽', 'Кол-во', 'Сумма, ₽', 'Комиссия, %'];
        var lines = [head.map(csvCell).join(';')];
        rows.forEach(function (r) {
            lines.push([r.pf, csvRuDate(r.date), r.side, r.type, r.tk, r.nm, csvNum(r.price),
                r.nkd != null ? csvNum(r.nkd) : '', r.qty, csvNum(r.sum), r.feePct > 0 ? csvNum(r.feePct, 3) : ''
            ].map(csvCell).join(';'));
        });
        try {
            csvDownload(lines, 'madame-solomina-trades-' + todayStr() + '.csv');
            toast('Сделки сохранены · строк: ' + rows.length);
        } catch (e) { toast('Не удалось сохранить Excel-файл', true); }
    };
    window.pfImportClick = function () { closeImpMenus(); var i = dq('pfBkpInput'); if (i) i.click(); };
    // Санация бэкапа перед заменой store: битый файл не должен ронять вкладку, а строки
    // из файла попадают в onclick-атрибуты — id вне безопасного алфавита перегенерируем
    // (см. security-конвенции). Кривые holdings/lots приводим к рабочей форме, а не падаем.
    function pfIdOk(s) { return typeof s === 'string' && /^[\w-]{1,64}$/.test(s); }
    function sanitizeStore(obj) {
        var truncated = false;
        var items = obj.items.filter(function (p) { return p && typeof p === 'object'; });
        if (items.length > MAX_CARDS) { items = items.slice(0, MAX_CARDS); truncated = true; }
        items.forEach(function (p) {
            var idFixed = !pfIdOk(p.id);
            if (idFixed) p.id = genId('pf');
            p.name = String(p.name || 'Портфель').slice(0, 24);
            p.color = pfIdOk(p.color) ? p.color : COLORS[0].id;
            p.cash = (+p.cash > 0) ? Math.round(+p.cash * 100) / 100 : 0;
            p.targetBond = (p.targetBond != null && isFinite(+p.targetBond)) ? clamp(Math.round(+p.targetBond), 0, 100) : null;
            if (!Array.isArray(p.holdings)) p.holdings = [];
            p.holdings = p.holdings.filter(function (h) { return h && typeof h === 'object' && h.ticker; });
            var holdIdFixed = false;
            p.holdings.forEach(function (h) {
                if (!pfIdOk(h.id)) { h.id = genId('h'); holdIdFixed = true; }
                h.ticker = String(h.ticker).toUpperCase().replace(/[^\w.@-]/g, '').slice(0, 20);
                h.name = String(h.name || h.ticker).slice(0, 80);
                h.type = h.type === 'bond' ? 'bond' : 'stock';
                if (h.lots != null && !Array.isArray(h.lots)) delete h.lots;   // ensureLots мигрирует из одиночных полей
                if (Array.isArray(h.lots)) {
                    h.lots = h.lots.filter(function (l) { return l && typeof l === 'object'; });
                    h.lots.forEach(function (l) { if (!pfIdOk(l.id)) { l.id = genId('l'); holdIdFixed = true; } });
                }
                ensureLots(h);
            });
            if (!Array.isArray(p.trades)) delete p.trades;
            // сменились id активов/лотов → сохранённые undo-ссылки сделок больше не сходятся
            else if (holdIdFixed || idFixed) p.trades.forEach(function (t) { if (t && t.undo) delete t.undo; });
        });
        return { items: items, truncated: truncated };
    }
    window.pfImportData = function (input) {
        var f = input && input.files && input.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            var obj;
            try {
                obj = JSON.parse(reader.result);
                if (!obj || !Array.isArray(obj.items)) throw new Error('format');
            } catch (e) { toast('Не удалось прочитать файл бэкапа (неверный формат)', true); input.value = ''; return; }
            input.value = '';
            var extra = obj.items.length > MAX_CARDS ? ' Файл содержит ' + obj.items.length + ' — будут загружены первые ' + MAX_CARDS + '.' : '';
            pfConfirm({
                danger: true, ok: 'Заменить', icon: SHIELD_SVG,
                title: 'Загрузить бэкап?',
                text: 'Текущие портфели (' + store.items.length + ') будут заменены данными из файла (' + Math.min(obj.items.length, MAX_CARDS) + '). Локальные данные перезапишутся.' + extra
            }, function () {
                var clean = sanitizeStore(obj);
                store = { v: obj.v || 1, items: clean.items };
                chartRaw = {}; chartCache = {};   // серии графиков от старых портфелей больше не валидны
                saveStore(); openMenu = null; ensureQuotes(true); renderPortfolios();
                toast('Загружено портфелей: ' + store.items.length + (clean.truncated ? ' (лишние за лимитом отброшены)' : ''));
            });
        };
        reader.onerror = function () { toast('Ошибка чтения файла', true); input.value = ''; };
        reader.readAsText(f);
    };
    // ---- импорт сделок из CSV-файла (универсальный формат брокерских отчётов) ----
    // Понимает разделители ; , и таб; шапку ищет по знакомым названиям колонок
    // (тикер/дата/цена/кол-во/НКД/тип), без шапки ждёт порядок: тикер;дата;цена;кол-во;[НКД].
    // Тип бумаги берётся из колонки или угадывается (SU…/RU… и таблица ОФЗ → облигация).
    var csvImportPid = null;
    function guessType(tk) {
        if (/^SU\d{5}/.test(tk) || /^RU\d{3}/.test(tk) || /^XS\d/.test(tk)) return 'bond';
        try { if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++) {
            var t = bonds[i] && bonds[i].t;
            if (t && (t.indexOf(tk) === 0 || tk.indexOf(t) === 0)) return 'bond';
        } } catch (e) {}
        return 'stock';
    }
    // полное имя бумаги по тикеру: таблица ОФЗ / таблица акций (для новых активов)
    function lookupName(tk, type) {
        if (type === 'bond') {
            try { if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++) {
                var t = bonds[i] && bonds[i].t;
                if (t && (t.indexOf(tk) === 0 || tk.indexOf(t) === 0)) return bonds[i].n || tk;
            } } catch (e) {}
            return tk;
        }
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(tk);
            if (co && co.name) return co.name;
        }
        return tk;
    }
    function parseTradesCsv(text) {
        var lines = String(text || '').replace(/\r/g, '').split('\n')
            .map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) return { rows: [], skipped: 0 };
        // разделитель — какой чаще встречается в первой строке
        var sep = ';', bestN = -1;
        [';', '\t', ','].forEach(function (s) {
            var n = lines[0].split(s).length - 1;
            if (n > bestN) { bestN = n; sep = s; }
        });
        function cells(s) { return s.split(sep).map(function (c) { return c.replace(/^"+|"+$/g, '').trim(); }); }
        var head = cells(lines[0]).map(function (c) { return c.toLowerCase(); });
        function findCol(names) {
            for (var i = 0; i < head.length; i++)
                for (var j = 0; j < names.length; j++) if (head[i].indexOf(names[j]) >= 0) return i;
            return -1;
        }
        var ci = { tk: findCol(['тикер', 'ticker', 'isin', 'secid', 'код', 'инструмент']),
            date: findCol(['дата', 'date']), price: findCol(['цена', 'price']),
            qty: findCol(['кол-во', 'количество', 'кол', 'qty', 'quantity', 'шт']),
            nkd: findCol(['нкд', 'aci', 'купонн']), type: findCol(['тип', 'type']) };
        var hasHead = ci.tk >= 0 && ci.qty >= 0;
        if (!hasHead) ci = { tk: 0, date: 1, price: 2, qty: 3, nkd: 4, type: -1 };
        var rows = [], skipped = 0;
        for (var i = hasHead ? 1 : 0; i < lines.length; i++) {
            var cs = cells(lines[i]);
            var tk = String(cs[ci.tk] || '').toUpperCase().replace(/\s/g, '');
            var qty = Math.round(toNum(cs[ci.qty]));
            if (!tk || !/^[\w.@-]{2,20}$/.test(tk) || !(qty > 0)) { skipped++; continue; }
            var price = ci.price >= 0 ? toNum(cs[ci.price]) : NaN;
            var dateIso = ci.date >= 0 ? pfParseAnyDate(cs[ci.date]) : null;
            var tRaw = ci.type >= 0 ? String(cs[ci.type] || '').toLowerCase() : '';
            var type = tRaw.indexOf('обл') >= 0 || tRaw.indexOf('bond') >= 0 ? 'bond'
                : (tRaw.indexOf('акц') >= 0 || tRaw.indexOf('stock') >= 0 || tRaw.indexOf('share') >= 0 ? 'stock' : guessType(tk));
            var nkd = (type === 'bond' && ci.nkd >= 0 && toNum(cs[ci.nkd]) > 0) ? Math.round(toNum(cs[ci.nkd]) * 100) / 100 : 0;
            rows.push({ ticker: tk, type: type, buyDate: dateIso || todayStr(),
                buyPrice: (isFinite(price) && price > 0) ? Math.round(price * 100) / 100 : 0, qty: qty, nkd: nkd });
        }
        return { rows: rows, skipped: skipped };
    }
    // каждая строка CSV = отдельная покупка (лот); одинаковые тикеры сливаются в один актив
    function mergeRowsIntoPf(p, rows) {
        var tickers = {};
        rows.forEach(function (r) {
            var lot = { id: genId('l'), buyDate: r.buyDate, buyPrice: r.buyPrice, qty: r.qty, nkd: r.nkd, priceFromApi: false, nkdFromApi: false };
            var exist = (p.holdings || []).filter(function (h) { return h.ticker === r.ticker && h.type === r.type; })[0];
            if (exist) ensureLots(exist).push(lot);
            else {
                p.holdings = p.holdings || [];
                p.holdings.push({ id: genId('h'), ticker: r.ticker, name: lookupName(r.ticker, r.type), type: r.type, lots: [lot],
                    potAtBuy: r.type === 'stock' ? potentialOf(r.ticker) : null });
            }
            tickers[r.ticker] = 1;
        });
        return Object.keys(tickers).length;
    }
    window.pfCsvClick = function (pid) {
        closeImpMenus(); csvImportPid = pid || null;
        var inp = dq('pfCsvInput');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file'; inp.id = 'pfCsvInput';
            inp.accept = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
            inp.style.display = 'none';
            document.body.appendChild(inp);
            inp.addEventListener('change', function () { pfCsvImport(this); });
        }
        inp.value = ''; inp.click();
    };
    function pfCsvImport(input) {
        var f = input && input.files && input.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            input.value = '';
            var parsed = parseTradesCsv(reader.result);
            if (!parsed.rows.length) {
                toast('В файле не нашлось сделок. Нужны колонки: тикер · дата · цена · кол-во' + (parsed.skipped ? ' (строк пропущено: ' + parsed.skipped + ')' : ''), true);
                return;
            }
            var p = csvImportPid ? findPf(csvImportPid) : null;
            if (!p) {
                if (store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' ' + plural(MAX_CARDS, 'портфель', 'портфеля', 'портфелей'), true); return; }
                p = makePortfolio('Импорт CSV'); store.items.push(p);
            }
            var nTick = mergeRowsIntoPf(p, parsed.rows);
            saveStore(); pfInvalidateCharts(p.id); ensureQuotes(true); renderPortfolios();
            toast('Импортировано ' + parsed.rows.length + ' ' + plural(parsed.rows.length, 'сделка', 'сделки', 'сделок') + ' · ' +
                nTick + ' ' + plural(nTick, 'бумага', 'бумаги', 'бумаг') + (parsed.skipped ? ' · пропущено строк: ' + parsed.skipped : ''));
        };
        reader.onerror = function () { toast('Ошибка чтения файла', true); input.value = ''; };
        reader.readAsText(f);
    }
    window.pfToggleMenu = function (pid) {
        if (openMenu === pid) { openMenu = null; }
        else {
            openMenu = pid; menuJustOpened = true; chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; holdsExpand = {};
            // свежеоткрытые настройки — с чистым состоянием: строки свёрнуты, палитра,
            // данжер-зона и форма добавления актива закрыты
            editHold = {}; colorsOpen = false; delArm = false; addOpen = false;
        }
        // renderNoAnim (не renderPortfolios): раскрытие настроек трогает только ОДНУ карточку,
        // а полный ре-рендер заново «рисует» мини-графики ВСЕХ карточек с 1-сек анимацией линии —
        // на глаз это читалось как мигание графиков. noChartAnim рисует их сразу в конечном виде.
        renderNoAnim();
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
        else { chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; holdsExpand = {}; chartOpen[pid] = true; openMenu = null; }
        renderPortfolios();
        if (chartOpen[pid]) loadPfChart(pid);
    };
    // «раскрытие» вверху карточки: та же панель графика, но сразу с открытыми активами
    window.pfOpenChartAssets = function (pid) {
        if (chartOpen[pid] && chartAssets[pid]) { delete chartOpen[pid]; delete chartAssets[pid]; delete chartAssetsFull[pid]; }
        else { chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; holdsExpand = {}; chartOpen[pid] = true; chartAssets[pid] = true; openMenu = null; }
        renderPortfolios();
        if (chartOpen[pid]) loadPfChart(pid);
    };
    // «весь состав»: раскрыть/свернуть оверлей со полной таблицей состава (вниз поверх контента)
    window.pfToggleHolds = function (pid) {
        if (holdsExpand[pid]) { delete holdsExpand[pid]; }
        else { holdsExpand = {}; holdsExpand[pid] = true; openMenu = null; chartOpen = {}; chartAssets = {}; chartAssetsFull = {}; }
        // renderNoAnim — иначе при раскрытии «всего состава» мигают мини-графики всех карточек
        renderNoAnim();
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
    // наложить/убрать кривую индекса IMOEX за тот же период — так же, как pfToggleMiniImoex
    // ниже: точечно обновляем кнопку и график, БЕЗ renderPortfolios (иначе вся раскрытая
    // карточка перерисовывается заново и заметно мигает).
    window.pfToggleChartImoex = function (pid) {
        chartImoex[pid] = !chartImoex[pid];
        var on = !!chartImoex[pid];
        var btn = document.querySelector('.pfcv-imbtn[onclick*="\'' + pid + '\'"]');
        if (btn) { btn.classList.toggle('on', on); var p = findPf(pid); if (p) btn.title = 'Наложить кривую — ' + pfBench(p).full; }
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
    window.pfCloseMenu = function () {
        // не терять начатый ввод: если форма добавления заполнена (есть тикер) — добавляем актив
        // перед закрытием. Частая ошибка: заполнил поля и жмёшь «Готово» вместо «Добавить».
        var pid = openMenu, added = null;
        if (pid) { var tk = dq('pfNewTk-' + pid); if (tk && tk.value.trim()) added = pfReadAddForm(pid); }
        openMenu = null; editHold = {}; addOpen = false; colorsOpen = false; delArm = false;
        if (added) { toast(added.restocked ? added.ticker + ': докуплено · +лот' : added.ticker + ' добавлен в портфель'); ensureQuotes(true); }
        renderPortfolios();
    };
    window.pfRename = function (pid, val) { var p = findPf(pid); if (!p) return;
        p.name = ((val || '').trim() || p.name).slice(0, 24);   // тот же лимит, что у инлайн-правки
        saveStore(); renderPortfolios(); };
    window.pfSetColor = function (pid, col) {
        var p = findPf(pid); if (!p) return;
        // цвета не должны совпадать: занятый другим портфелем цвет выбрать нельзя
        var other = null;
        store.items.forEach(function (o) { if (o.id !== pid && o.color === col) other = o; });
        if (other) { toast('Цвет уже занят портфелем «' + other.name + '»', true); return; }
        p.color = col; colorsOpen = false; saveStore(); renderPortfolios();
    };
    // ---- стилизованное окно подтверждения (вместо системного confirm) ----
    // Живёт в <body> (см. правило про fixed-оверлеи: transform на предках вкладок ломает
    // position:fixed). onOk вызывается только по кнопке подтверждения; Escape/фон/«Отмена»
    // просто закрывают окно.
    function pfConfirm(opts, onOk) {
        var old = dq('pfConfirmOv'); if (old) old.remove();
        var TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        var ov = document.createElement('div');
        ov.id = 'pfConfirmOv';
        ov.innerHTML = '<div class="pfcf-card" role="alertdialog" aria-modal="true">' +
            '<div class="pfcf-ico' + (opts.danger ? ' danger' : '') + '">' + (opts.icon || TRASH) + '</div>' +
            '<div class="pfcf-t">' + opts.title + '</div>' +
            '<div class="pfcf-s">' + opts.text + '</div>' +
            '<div class="pfcf-btns">' +
                '<button class="pfcf-btn" type="button" data-act="no">Отмена</button>' +
                '<button class="pfcf-btn pfcf-ok' + (opts.danger ? ' danger' : '') + '" type="button" data-act="yes">' + (opts.ok || 'Подтвердить') + '</button>' +
            '</div></div>';
        document.body.appendChild(ov);
        function close() {
            document.removeEventListener('keydown', onKey);
            ov.classList.remove('show');
            setTimeout(function () { ov.remove(); }, 180);
        }
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
        ov.addEventListener('click', function (e) {
            if (e.target === ov) { close(); return; }
            var b = e.target.closest('.pfcf-btn'); if (!b) return;
            close();
            if (b.getAttribute('data-act') === 'yes') onOk();
        });
        document.addEventListener('keydown', onKey);
        requestAnimationFrame(function () {
            ov.classList.add('show');
            var okBtn = ov.querySelector('.pfcf-ok'); if (okBtn) try { okBtn.focus(); } catch (e) {}
        });
    }
    // Удаление портфеля: ссылка в футере настроек раскрывает данжер-зону (pfDelArm),
    // само удаление — только второй кнопкой «Да, удалить» внутри зоны. Модалки pfConfirm
    // здесь больше нет — подтверждение с последствиями происходит на месте.
    window.pfDelArm = function (on) { delArm = !!on; renderPortfolios(); };
    window.pfDeleteYes = function (pid) {
        var p = findPf(pid); if (!p) return;
        store.items = store.items.filter(function (x) { return x.id !== pid; }); saveStore();
        if (openMenu === pid) { openMenu = null; }
        delArm = false; renderPortfolios(); toast('Портфель удалён');
    };
    // читает форму добавления и записывает актив в модель (БЕЗ ре-рендера/фокуса/тоста).
    // Возвращает {ticker, restocked} если добавлено, иначе null (нет тикера). Общая логика
    // для кнопки «Добавить» и для «Готово» (чтобы заполненный, но не добавленный тикер не пропал).
    function pfReadAddForm(pid) {
        var p = findPf(pid); if (!p) return null;
        var tkEl = dq('pfNewTk-' + pid), tyEl = dq('pfNewType-' + pid), dEl = dq('pfNewDate-' + pid),
            prEl = dq('pfNewPrice-' + pid), nkEl = dq('pfNewNkd-' + pid), qEl = dq('pfNewQty-' + pid);
        var tk = (tkEl && tkEl.value || '').trim().toUpperCase();
        if (!tk) return null;
        var type = (tyEl && tyEl.value) === 'bond' ? 'bond' : 'stock';
        var date = (dEl && dEl.value) || todayStr();
        var price = Math.max(0, toNum(prEl && prEl.value) || 0);
        var qty = Math.max(0, Math.round(toNum(qEl && qEl.value) || 0));
        var nkd = type === 'bond' ? Math.max(0, toNum(nkEl && nkEl.value) || 0) : 0;
        var lot = { id: genId('l'), buyDate: date, buyPrice: price, qty: qty, nkd: nkd, priceFromApi: false, nkdFromApi: false };
        p.holdings = p.holdings || [];
        // тот же тикер уже в портфеле (того же типа) → ДОКУПКА: добавляем лот к активу
        var exist = p.holdings.filter(function (x) { return x.ticker === tk && x.type === type; })[0], restocked = false;
        if (exist) { ensureLots(exist).push(lot); editHold[exist.id] = true; restocked = true; }
        else {
            // потенциал акции фиксируем на дату покупки (текущий ОДХС) — для карточки ребалансировки
            var pot = type === 'stock' ? potentialOf(tk) : null;
            // полное имя — сразу из таблиц (ОФЗ/акции), а не копия тикера
            p.holdings.push({ id: genId('h'), ticker: tk, name: lookupName(tk, type), type: type, lots: [lot], potAtBuy: pot });
        }
        saveStore(); pfInvalidateCharts(pid);
        return { ticker: tk, restocked: restocked };
    }
    window.pfAddHolding = function (pid) {
        var r = pfReadAddForm(pid);
        if (!r) { toast('Введите тикер', true); var t = dq('pfNewTk-' + pid); if (t) try { t.focus(); } catch (e) {} return; }
        if (r.restocked) toast(r.ticker + ': докуплено · +лот');
        ensureQuotes(true); renderPortfolios();
        // фокус обратно на поле тикера для быстрого ввода следующего актива
        var ni = dq('pfNewTk-' + pid); if (ni) try { ni.focus(); } catch (e) {}
    };
    // Автоопределение типа по вводимому тикеру: SU…/RU…/XS… или совпадение с таблицей
    // ОФЗ → «Облигация», тикер из таблицы акций → «Акция». Селект переключается сам
    // (вместе с полем НКД через pfAddTypeToggle) — руками менять тип почти не приходится.
    window.pfNewTkAuto = function (pid) {
        var tkEl = dq('pfNewTk-' + pid), tyEl = dq('pfNewType-' + pid);
        if (!tkEl || !tyEl) return;
        var tk = (tkEl.value || '').trim().toUpperCase();
        if (tk.length < 3) return;
        var t = null;
        if (/^SU\d{2}/.test(tk) || /^RU\d{3}/.test(tk) || /^XS\d/.test(tk)) t = 'bond';
        else if (typeof window.stkFindCompany === 'function' && window.stkFindCompany(tk)) t = 'stock';
        else {
            try { if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++)
                if (bonds[i].t && bonds[i].t.indexOf(tk) === 0) { t = 'bond'; break; } } catch (e) {}
        }
        if (t && tyEl.value !== t) { tyEl.value = t; window.pfAddTypeToggle(pid); }
    };
    // свободные деньги портфеля (кэш): правится в ⚙, пополняется остатком ребалансировок
    window.pfSetCash = function (pid, val) {
        var p = findPf(pid); if (!p) return;
        var n = toNum(val);
        p.cash = (isFinite(n) && n > 0) ? Math.round(n * 100) / 100 : 0;
        saveStore(); renderPortfolios();
    };
    // целевая доля облигаций, %: пусто/не число → выключено (null)
    window.pfSetTarget = function (pid, val) {
        var p = findPf(pid); if (!p) return;
        var s = String(val == null ? '' : val).trim();
        var n = toNum(s);
        p.targetBond = (s !== '' && isFinite(n)) ? clamp(Math.round(n), 0, 100) : null;
        saveStore(); renderPortfolios();
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
        p.holdings = (p.holdings || []).filter(function (h) { return h.id !== hid; });
        delete editHold[hid]; saveStore(); pfInvalidateCharts(pid); renderPortfolios();
    };
    window.pfEdit = function (pid, hid, field, val) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        if (field === 'ticker') {
            h.ticker = (val || '').trim().toUpperCase(); h.name = lookupName(h.ticker, h.type);
            // сменился тикер → старые цены/НКД лотов не на этот тикер: гасим флаги «с API»
            ensureLots(h).forEach(function (l) { l.priceFromApi = false; l.nkdFromApi = false;
                delete loadStatus[l.id + ':price']; delete loadStatus[l.id + ':nkd']; });
        }
        saveStore(); pfInvalidateCharts(pid); ensureQuotes(); renderPortfolios();
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
        saveStore(); pfInvalidateCharts(pid); ensureQuotes(); renderPortfolios();
    };
    window.pfAddLot = function (pid, hid) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        ensureLots(h).push({ id: genId('l'), buyDate: todayStr(), buyPrice: 0, qty: 0, nkd: 0, priceFromApi: false, nkdFromApi: false });
        editHold[hid] = true; saveStore(); pfInvalidateCharts(pid); renderPortfolios();
    };
    window.pfRemoveLot = function (pid, hid, lotId) {
        var p = findPf(pid); if (!p) return; var h = findHold(p, hid); if (!h) return;
        var ls = ensureLots(h);
        if (ls.length <= 1) return;   // последний лот не удаляем — есть «Удалить актив»
        h.lots = ls.filter(function (l) { return l.id !== lotId; });
        saveStore(); pfInvalidateCharts(pid); ensureQuotes(); renderPortfolios();
    };
    // клик по строке состава в настройках → раскрыть/свернуть редактор этого актива
    window.pfMenuRowToggle = function (pid, hid) {
        if (editHold[hid]) delete editHold[hid]; else editHold[hid] = true;
        renderPortfolios();
    };
    // свернуть/раскрыть форму «Добавить актив» (при раскрытии — фокус на поле тикера)
    window.pfAddToggle = function (pid) {
        addOpen = !addOpen; renderPortfolios();
        if (addOpen) { var el = dq('pfNewTk-' + pid); if (el) try { el.focus(); } catch (e) {} }
    };
    // палитра цвета в шапке настроек (точка-кнопка); закрывается кликом мимо — см. ниже
    window.pfColorsToggle = function () { colorsOpen = !colorsOpen; renderPortfolios(); };
    document.addEventListener('click', function (e) {
        if (!colorsOpen) return;
        if (e.target && e.target.closest && e.target.closest('.pfm-colorwrap')) return;
        colorsOpen = false; renderPortfolios();
    });
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
                saveStore(); pfInvalidateCharts(pid); renderPortfolios();
                toast(h.ticker + ': ' + (field === 'nkd' ? 'НКД ' : '') + fmtPrice(v) + ' на ' + ruDate(cl.buyDate));
            } else { renderPortfolios(); toast('Нет ' + (field === 'nkd' ? 'НКД' : 'цены') + ' ' + h.ticker + ' на ' + ruDate(l.buyDate), true); }
        };
        if (field === 'nkd') lookupHistNkd(h.ticker, l.buyDate, done);
        else lookupHistPrice(h.ticker, h.type, l.buyDate, function (price) { done(price && price > 0 ? price : null); });
    };
    window.pfOpenTicker = function (tk) { if (typeof window.openStockDetail === 'function') { try { window.openStockDetail(tk, 1); } catch (e) {} } };
    // Инлайн-правка имени портфеля: клик по названию → поле ввода на месте (Enter/blur — сохранить, Esc — отмена)
    window.pfNameEdit = function (pid, ev) {
        if (ev) { ev.stopPropagation(); }
        var p = findPf(pid); if (!p) return;
        var host = ev && ev.currentTarget; if (!host || host._editing) return;
        host._editing = true;
        var inp = document.createElement('input');
        // 24 символа — максимум, при котором название гарантированно влезает в шапку
        // карточки и сетка не расползается
        inp.className = 'pfc-name-edit'; inp.value = p.name; inp.maxLength = 24;
        host.innerHTML = ''; host.appendChild(inp);
        try { inp.focus(); inp.select(); } catch (e) {}
        var committed = false;
        function commit(save) {
            if (committed) return; committed = true;
            if (save) { var v = (inp.value || '').trim().slice(0, 24); if (v) { p.name = v; saveStore(); } }
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
    //  Белая карточка с моно-цифрами (как «Главная»): шапка с пилюлями
    //  «Прибыль …/день» и «НДФЛ», слим-бар шагов 1-2-3, тонированные
    //  колонки (облигации — голубая, акции — крем), строки — белые
    //  карточки. В каждой колонке: «продать» (мой портфель) | «купить»
    //  (рынок из гугл-таблицы), футер с «Подобрать за меня», расчёт обмена.
    //  Суть: обмен облигаций имеет смысл, только если растёт суммарная
    //  прибыль в день (машина денег) — карточка показывает это до/после.
    // ====================================================================
    window.pfExpand = function (pid) {
        var p = findPf(pid); if (!p) return;
        rebalPick = { bond: { sell: null, buy: null, qty: null }, stock: { sell: null, buy: null, qty: null } };
        rebalInfo = {}; rebalFormulas = false; rebalParams = false; rebalHistory = false; rebalFlash = null;
        // Цена/НКД облигаций «сейчас» — основа решения об обмене: сбрасываем живой кэш held-бумаг
        // при каждом открытии, чтобы карточка тянула свежую котировку MOEX (у акций свой TTL 60с).
        (p.holdings || []).forEach(function (h) {
            if (h.type === 'bond' && h.ticker) { delete bondQuotes[h.ticker]; delete bondNkdNow[h.ticker]; }
        });
        ensureQuotes(true);
        if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }   // эшелоны/потенциал акций
        var ov = dq('pfOverlay');
        if (!ov) {
            ov = document.createElement('div'); ov.id = 'pfOverlay'; document.body.appendChild(ov);
            ov.addEventListener('click', function (e) {
                if (e.target === ov) { window.pfCloseOverlay(); return; }
                // клик мимо открытого попапа параметров — закрыть его (пилюля-кнопка переключает сама)
                if (rebalParams && !e.target.closest('.rb5-hwrap')) { rebalParams = false; rebalRepaint(); }
            });
            // выбор бумаги с клавиатуры: строки-«кнопки» — div с role=button, Enter/Space их «кликают»
            ov.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                if (e.target.closest('button, input, a, select, textarea')) return;   // на своих контролах — их логика
                var row = e.target.closest('.rb5-row'); if (!row) return;
                e.preventDefault(); row.click();
            });
        }
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
            // короткий ISIN портфеля → полный SECID, иначе fetchBondData не находит купоны/погашение
            Promise.resolve(fetchBondData(fullBondId(tk))).catch(function () {}).then(function () { if (--left <= 0) cb(); });
        });
    }
    window.pfCloseOverlay = function () {
        var ov = dq('pfOverlay'); if (ov) ov.classList.remove('show');
        document.body.classList.remove('pf-modal-open'); document.removeEventListener('keydown', pfEscClose);
    };
    function pfEscClose(e) {
        if (e.key !== 'Escape') return;
        // открыт диалог подтверждения (отмена сделки) — Esc гасит ЕГО (свой обработчик), не карточку
        if (dq('pfConfirmOv')) return;
        // сначала сворачиваем раскрытый попап/панель, и только следующим Esc — саму карточку
        if (rebalParams || rebalFormulas || rebalHistory) {
            rebalParams = false; rebalFormulas = false; rebalHistory = false; rebalRepaint(); return;
        }
        window.pfCloseOverlay();
    }

    // ---------- параметры ----------
    var rebalTax = 0;            // ставка НДФЛ в расчётах (0 / 0.13 / 0.15)
    var rebalFee = 0;            // комиссия брокера за сделку (доля, напр. 0.0005 = 0,05%);
                                 // берётся ДВАЖДЫ: при продаже (уменьшает выручку) и при покупке (удорожает бумагу)
    var REBAL_FEES = [[0, '0%'], [0.0005, '0,05%'], [0.001, '0,1%'], [0.003, '0,3%']];
    var rebalPeriod = 'day';     // период метрики прибыли: 'day' | 'week' | 'month'
    var PERIODS = { day: ['в день', 1], week: ['в неделю', 7], month: ['в месяц', 30] };
    // выбранный обмен: sell — id актива портфеля, buy — тикер/ISIN с рынка, qty — сколько
    // продать (null → подставится предложение «продать столько, чтобы штук стало больше»)
    var rebalPick = { bond: { sell: null, buy: null, qty: null }, stock: { sell: null, buy: null, qty: null } };
    var rebalInfo = {};          // ключ строки → раскрыты ли детали бумаги (иконка ⓘ в строке)
    var rebalFormulas = false;   // раскрыта ли панель «методика расчёта» (иконка ⓘ в шапке)
    var rebalParams = false;     // раскрыт ли попап «параметры» (НДФЛ/комиссия) в шапке
    var rebalHistory = false;    // раскрыта ли панель «история сделок»
    var rebalInfoAnim = null;    // ключ ⓘ-панели, открытой ПОСЛЕДНИМ кликом: анимацию играем только ей,
                                 // иначе каждый repaint переигрывал бы её у всех открытых панелей
    var rebalFlash = null;       // { delta, anim } — сдвиг «машины денег» после применённого обмена облигаций
    try {
        var _rp = JSON.parse(localStorage.getItem('pf_rebal_params') || '{}');
        if (_rp.tax != null) rebalTax = +_rp.tax;
        if (_rp.fee != null) rebalFee = +_rp.fee;
        if (PERIODS[_rp.per]) rebalPeriod = _rp.per;
    } catch (e) {}
    function saveRebalParams() { try { localStorage.setItem('pf_rebal_params', JSON.stringify({ tax: rebalTax, fee: rebalFee, per: rebalPeriod })); } catch (e) {} }
    function feeLbl(f) { for (var i = 0; i < REBAL_FEES.length; i++) if (REBAL_FEES[i][0] === f) return REBAL_FEES[i][1]; return (f * 100).toFixed(2).replace('.', ',') + '%'; }
    function f2(n) { return (n == null || !isFinite(n)) ? '—' : n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function perMul() { return PERIODS[rebalPeriod][1]; }
    function perLbl() { return PERIODS[rebalPeriod][0]; }
    // короткая дата ДД.ММ.ГГГГ из строки MOEX (YYYY-MM-DD)
    function ruDate2(s) { if (!s || s === '—') return '—'; var pp = String(s).split('T')[0].split('-'); return pp.length === 3 ? pp[2] + '.' + pp[1] + '.' + pp[0] : s; }
    // короткий ключ ISIN: портфель хранит «SU26238», рынок — полный «SU26238RMFS4»
    function isinKey(t) { return String(t || '').split('RMFS')[0]; }

    // ---------- экономика облигаций («машина денег») ----------
    // Прибыль облигации при удержании до погашения:
    //   доход   = оставшиеся купоны (купон × выплат/год × дней ÷ 365) + номинал + НКД сейчас
    //   затраты = (цена + НКД) × (1 + комиссия брокера) — для моих средние по покупкам, для рыночных текущие
    //   НДФЛ    = (доход − затраты) × ставка, если разница положительна
    //   прибыль/день = (доход − затраты − НДФЛ) ÷ дней до погашения;  годовых = ×365 ÷ (затраты + НДФЛ)
    // Номинал — настоящий FACEVALUE бумаги (у ОФЗ 1000 ₽, у корпоративных бывает другой).
    // (погашение по номиналу — не сделка, комиссия при нём не берётся)
    function bondEconAt(det, costUnit, nkdNow, face) {
        if (!det || !(costUnit > 0)) return null;
        var mat = parseBondDate(det.matDate); if (!mat) return null;
        var days = (mat.getTime() - Date.now()) / 86400000; if (!(days > 0)) return null;
        var nominal = (det.face > 0) ? +det.face : (face > 0 ? face : 1000);
        var cost = costUnit * (1 + (rebalFee || 0));
        var income = (+det.couponValue || 0) * (+det.freq || 0) * days / 365 + nominal + (nkdNow || 0);
        var tax = Math.max(0, income - cost) * (rebalTax || 0);
        var profit = income - cost - tax;
        return { perDay: profit / days, annual: profit / days * 365 / (cost + tax) * 100,
            days: Math.round(days), matDate: det.matDate };
    }
    // Моя облигация: доходность из портфеля (средние цена/НКД покупки по лотам) + текущие
    // цена/НКД с MOEX (unitNow — выручка за 1 шт при продаже прямо сейчас)
    function bondHeld(h) {
        var a = aggHolding(h);
        var lb = liveBond(h.ticker);
        var nkdNow = lb.nkd != null ? lb.nkd : (a.nkd || 0);
        var price = lb.price > 0 ? lb.price : (a.avgPrice || 0);
        var econ = bondEconAt(bondDetail(h.ticker), (a.avgPrice || 0) + (a.nkd || 0), nkdNow, bondFace(h.ticker));
        return { h: h, qty: a.qty || 0, avgDate: a.avgDate, unitNow: price + nkdNow,
            priceNow: price, nkdNow: nkdNow, live: lb.live, econ: econ };
    }
    // Список ОФЗ из гугл-таблицы — ТОТ ЖЕ источник, что вкладка «ОФЗ» раздела «Ребаланс»
    // (data.js: bonds[]): t=ISIN, n=имя, p/y — цена и доходность из таблицы; цена уточняется
    // живой с MOEX (bondDataCache), НКД/погашение — из fetchBondDetailsInBackground.
    function ofzMarket() {
        try {
            if (typeof bonds !== 'undefined' && bonds && bonds.length) {
                return bonds.map(function (b) {
                    // цена И НКД — живые из кэша MOEX (ключ таблицы = полный SECID), таблица ОФЗ —
                    // фолбэк; НКД капает каждый день, со статичным табличным расход занижался
                    var live = null, liveNkd = null;
                    try {
                        if (typeof bondDataCache !== 'undefined' && bondDataCache[b.t] && bondDataCache[b.t].price > 0) {
                            live = +bondDataCache[b.t].price;
                            if (bondDataCache[b.t].nkd != null) liveNkd = +bondDataCache[b.t].nkd;
                        }
                    } catch (e) {}
                    return { t: b.t, n: b.n || b.t,
                        price: live || parseFloat(String(b.p).replace(',', '.')) || 0,
                        nkd: liveNkd != null ? liveNkd : (parseFloat(b.nkd || 0) || 0),
                        sheetYield: toNum(b.y), matDate: b.matDate };
                });
            }
        } catch (e) {}
        return [];
    }
    // Кандидат на покупку: цена+НКД сейчас = расход, дальше та же экономика, что у моих
    function ofzCand(b) {
        var unit = b.price + b.nkd;
        var econ = bondEconAt(bondDetail(b.t), unit, b.nkd, bondFace(b.t));
        return { t: b.t, n: b.n, unit: unit, price: b.price, nkd: b.nkd, sheetYield: b.sheetYield,
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
    // Выручка за шт — за вычетом комиссии продажи, цена новой — с комиссией покупки.
    // null — новая бумага не дешевле: больше штук не выйдет ни при каком n.
    function bondQtyFor1More(unitS, unitB, maxQty) {
        var f = rebalFee || 0, net = unitS * (1 - f), gross = unitB * (1 + f);
        if (!(net > 0) || !(gross > 0) || net <= gross) return null;
        for (var n = 1; n <= maxQty; n++) if (Math.floor(n * net / gross) >= n + 1) return n;
        return null;
    }
    // ---------- график ежемесячных выплат (портфели из импорта «Ежемесячный доход») ----------
    var RB_MON = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    // Месяцы (0-11), в которые бумага платит купоны в ближайшие 12 месяцев —
    // та же периодическая схема от nextCouponDate, что и в календаре выплат
    function bondPayMonths(tk) {
        var det = bondDetail(tk); if (!det) return null;   // детали ещё грузятся
        var nd = nextCouponDate(det); if (!nd) return null;
        var freq = +det.freq || 0; if (!(freq > 0)) return null;
        var stepMs = (365 / freq) * 86400000;
        var out = {}, horizon = Date.now() + 365 * 86400000;
        for (var t = nd.getTime(); t <= horizon; t += stepMs) out[new Date(t).getMonth()] = 1;
        return out;
    }
    // Месяцы, которые останутся БЕЗ выплат, если продать sellH целиком и купить candT
    // (candT == null → просто продать). null — детали купонов ещё не загружены.
    function pfLostMonths(bs, sellH, candT) {
        var mine = bondPayMonths(sellH.ticker); if (!mine) return null;
        var cov = {};
        bs.forEach(function (x) {
            if (x.h.id === sellH.id) return;
            if (!(aggHolding(x.h).qty > 0)) return;
            var m = bondPayMonths(x.h.ticker); if (!m) return;
            Object.keys(m).forEach(function (k) { cov[k] = 1; });
        });
        var candM = candT ? (bondPayMonths(candT) || {}) : {};
        var lost = [];
        Object.keys(mine).forEach(function (k) { if (!cov[k] && !candM[k]) lost.push(+k); });
        lost.sort(function (a, b) { return a - b; });
        return lost;
    }
    function rbIsMonthlyPf() {
        var ov = dq('pfOverlay'); if (!ov) return false;
        var p = findPf(ov.dataset.pid);
        return !!(p && p.src === 'monthly');
    }

    // Полный расчёт обмена облигаций: продаём qty своих (цена+НКД сейчас, минус комиссия) →
    // покупаем новые (цена+НКД сейчас, плюс комиссия); прибыль в день и штук — по всему
    // портфелю ДО и ПОСЛЕ
    function bondDeal(r, cand, bs) {
        if (!r || !cand || !(r.qty > 0) || !(r.unitNow > 0) || !(cand.unit > 0)) return null;
        var f = rebalFee || 0;
        var suggest = bondQtyFor1More(r.unitNow, cand.unit, r.qty);
        var qty = rebalPick.bond.qty != null ? clamp(Math.round(rebalPick.bond.qty), 1, r.qty) : (suggest || r.qty);
        var proceeds = qty * r.unitNow * (1 - f);
        var unitGross = cand.unit * (1 + f);
        var buyQty = Math.floor(proceeds / unitGross);
        var t = bondsTotal(bs);
        var after = (r.econ && cand.econ && !t.pending) ? t.total - qty * r.econ.perDay + buyQty * cand.econ.perDay : null;
        return { qty: qty, maxQty: r.qty, suggest: suggest, proceeds: proceeds, buyQty: buyQty,
            rest: proceeds - buyQty * unitGross,
            unitsBefore: t.units, unitsAfter: t.units - qty + buyQty,
            dayBefore: t.pending ? null : t.total, dayAfter: after };
    }

    // ---------- акции ----------
    var ROMAN = ['I', 'II', 'III', 'IV'];
    // Эшелон тикера: колонка таблицы эшелонов раздела «Ребаланс» → колонка «ЭШЕЛОН» таблицы
    // акций (вкладка «Акции»); 0 — не определён. Таблица эшелонов — ПЕРВИЧНА: кандидаты на
    // покупку берутся именно из неё, поэтому фильтр «тот же эшелон» должен считать эшелон
    // продаваемой бумаги по тому же источнику (иначе несовпадение колонок двух гугл-таблиц
    // давало пустой список кандидатов).
    function echelonOf(ticker) {
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    var col = echelonTableData[ci] || [];
                    for (var i = 0; i < col.length; i++) if (col[i] && col[i].t === ticker) return ci + 1;
                }
            }
        } catch (e2) {}
        if (typeof window.stkFindCompany === 'function') {
            try { var co = window.stkFindCompany(ticker);
                if (co && co.main) { var e = parseInt(co.main['ЭШЕЛОН'], 10); if (e >= 1 && e <= 4) return e; } } catch (e1) {}
        }
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
    // Потенциал для СРАВНЕНИЯ в обмене — тем же способом, что у кандидатов (target таблицы
    // эшелонов → живой ОДХС): сравниваем «текущий против текущего». holdPotential у моей бумаги
    // мог быть заморожен на дату покупки (это её тезис, показываем в ⓘ), но для решения
    // «менять ли сейчас» замороженное число завышало бы мою бумагу против живого кандидата.
    function livePotential(h) {
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    var col = echelonTableData[ci] || [];
                    for (var i = 0; i < col.length; i++) if (col[i] && col[i].t === h.ticker) { var t = toNum(col[i].target); if (isFinite(t)) return t; }
                }
            }
        } catch (e) {}
        var p = potentialOf(h.ticker); if (p != null && isFinite(p)) return p;
        return holdPotential(h);
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
    // Кандидаты на покупку: ВСЕ потенциальные акции из гугл-таблицы (4 колонки-эшелона
    // раздела «Ребаланс»), включая уже купленные (докупить — легитимный обмен; свои
    // помечаются бейджем «в портфеле», как в списке ОФЗ). Потенциал — из таблицы эшелонов
    // (target, тот же источник, что показывает раздел «Ребаланс»), при пустом target —
    // живой ОДХС из таблицы акций; бумаги без потенциала не выкидываем, а сортируем в конец.
    // ech ≥ 1 — только тот же эшелон, что у продаваемой.
    function stockCands(ech) {
        var arr = [];
        try {
            if (typeof echelonTableData !== 'undefined' && echelonTableData) {
                for (var ci = 0; ci < echelonTableData.length; ci++) {
                    (echelonTableData[ci] || []).forEach(function (a) {
                        if (!a || !a.t) return;
                        var pot = toNum(a.target);
                        if (!isFinite(pot)) pot = potentialOf(a.t);
                        arr.push({ ticker: a.t, name: a.n || a.t, sector: a.sector || '', ech: ci + 1,
                            pot: (pot != null && isFinite(pot)) ? pot : null });
                    });
                }
            }
        } catch (e) {}
        if (ech >= 1) arr = arr.filter(function (a) { return a.ech === ech; });
        arr.sort(function (a, b) { return (b.pot == null ? -1e9 : b.pot) - (a.pot == null ? -1e9 : a.pot); });
        return arr;
    }
    // Обмен акций: продаём qty по текущей цене (минус комиссия) → покупаем кандидата
    // (плюс комиссия); выгода — рост потенциала
    function stockDeal(r, cand) {
        if (!r || !cand || !(r.qty > 0) || !(r.nowPrice > 0)) return null;
        var f = rebalFee || 0;
        var qty = rebalPick.stock.qty != null ? clamp(Math.round(rebalPick.stock.qty), 1, r.qty) : Math.max(1, Math.round(r.qty / 2));
        var priceN = stkPriceOf(cand.ticker);
        var proceeds = qty * r.nowPrice * (1 - f);
        var buyQty = priceN > 0 ? Math.floor(proceeds / (priceN * (1 + f))) : 0;
        return { qty: qty, maxQty: r.qty, proceeds: proceeds, priceN: priceN, buyQty: buyQty,
            rest: priceN > 0 ? proceeds - buyQty * priceN * (1 + f) : 0,
            potFrom: r.pot, potTo: cand.pot,
            potDelta: (r.pot != null && cand.pot != null) ? cand.pot - r.pot : null };
    }

    // ---------- рендер ----------
    var RB5_ARR = '<svg class="rb5-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
    // иконка «история» (часы со стрелкой назад) — кнопка истории сделок в шапке
    var RB5_HIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.8-6.5"/><path d="M3 4.5V9h4.5"/><polyline points="12 7.5 12 12 15.5 14"/></svg>';
    var UNITS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
    var COIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.5 9.3c0-1.3 1.1-2.1 2.5-2.1s2.5.8 2.5 1.9c0 2.6-5 1.4-5 4 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-2.1"/></svg>';
    // иконка «искры» — кнопка «Подобрать за меня» (авто-выбор самой выгодной пары)
    var RB5_WAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
    var RB5_CHECK = '<span class="rb5-chip">' + CHECK_SVG + '</span>';
    // иконки-бейджи шапок колонок: облигации — портик-«банк» (ОФЗ/госбумаги), акции — столбики рынка
    var RB5_IC_BOND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 9.3 12 4l8.8 5.3"/><line x1="4" y1="20.4" x2="20" y2="20.4"/><line x1="6.4" y1="10" x2="6.4" y2="20.4"/><line x1="10.1" y1="10" x2="10.1" y2="20.4"/><line x1="13.9" y1="10" x2="13.9" y2="20.4"/><line x1="17.6" y1="10" x2="17.6" y2="20.4"/></svg>';
    var RB5_IC_STOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="3.5" y1="20.5" x2="20.5" y2="20.5"/><line x1="7" y1="20" x2="7" y2="13.5"/><line x1="12" y1="20" x2="12" y2="7.5"/><line x1="17" y1="20" x2="17" y2="11"/></svg>';
    // Шапка карточки. bt — bondsTotal() портфеля или null, если облигаций нет: «машина денег»
    // и НДФЛ (он влияет только на экономику облигаций) живут в шапке и показываются лишь
    // при наличии облигаций — так колонки внизу начинаются на одном уровне.
    // Комиссия брокера влияет и на облигации, и на акции — её выбор показывается всегда.
    // Шапка после чистки: слева заголовок, справа ОДИН сводный виджет (машина денег для
    // облигаций / средний потенциал для чисто акционного портфеля) + компактная пилюля
    // «параметры» (НДФЛ и комиссия живут в попапе, а не двумя сегментами в ряд) + круглые
    // кнопки история/методика/закрыть. Так шапка выглядит ровно при любом составе портфеля.
    function rb5Head(p, c, bt, ss) {
        var statW = bt ? machineHtml(bt) : stockPulseHtml(ss);
        var taxTxt = Math.round((rebalTax || 0) * 100) + '%';
        // пилюля параметров: «НДФЛ 0%» (при облигациях; комиссия дописывается, если задана) /
        // «Комиссия 0%» (только акции); клик — попап НДФЛ/комиссии
        var pillVal = bt ? taxTxt + (rebalFee > 0 ? ' · ' + feeLbl(rebalFee) : '') : feeLbl(rebalFee);
        var pill = '<div class="rb5-hwrap">' +
            '<button class="rb5-hpill' + (rebalParams ? ' on' : '') + '" onclick="pfRbParams()" title="Параметры расчёта — НДФЛ и комиссия брокера">' +
                '<span class="rb5-hpl">' + (bt ? 'НДФЛ' : 'Комиссия') + '</span><b class="rb5-hpv">' + pillVal + '</b>' +
            '</button>' + rb5ParamsPop(!!bt) + '</div>';
        var histN = (p.trades || []).length;
        var histBtn = '<button class="rb5-hbtn' + (rebalHistory ? ' on' : '') + '" onclick="pfRbHistory()" aria-label="История сделок" title="История сделок — применённые обмены">' + RB5_HIST +
            (histN ? '<i class="rb5-hbadge">' + (histN > 99 ? '99+' : histN) + '</i>' : '') + '</button>';
        var fxBtn = '<button class="rb5-hbtn' + (rebalFormulas ? ' on' : '') + '" onclick="pfRbFormulas()" aria-label="Методика расчёта" title="Методика расчёта — все формулы">' + INFO_SVG + '</button>';
        return '<div class="rb5-head">' +
            '<div class="rb5-head-t">' +
                '<span class="rb5-eyebrow">Ребалансировка</span>' +
                '<span class="rb5-title">' + esc(p.name) + '</span>' +
                '<span class="rb5-sub">' + c.count + ' ' + plural(c.count, 'актив', 'актива', 'активов') + ' · ' + fmtRub(c.value) + '</span>' +
            '</div>' +
            '<div class="rb5-head-r">' + statW + pill + histBtn + fxBtn +
                '<button class="rb5-x" onclick="pfCloseOverlay()" aria-label="Закрыть">' + XMARK_SVG + '</button>' +
            '</div>' +
        '</div>';
    }
    // Попап «параметры»: сегменты НДФЛ (только при облигациях — на акции он тут не влияет)
    // и комиссии + поле «своя» для нестандартного тарифа брокера (в процентах за сделку).
    function rb5ParamsPop(hasB) {
        if (!rebalParams) return '';
        var taxes = [[0, '0%'], [0.13, '13%'], [0.15, '15%']];
        var preset = false; REBAL_FEES.forEach(function (o) { if (o[0] === rebalFee) preset = true; });
        var taxSec = !hasB ? '' : '<div class="rb5-pop-sec"><span class="rb5-pop-l">НДФЛ</span>' +
            '<div class="rb5-seg">' + taxes.map(function (o) {
                return '<button class="rb5-seg-b' + (rebalTax === o[0] ? ' on' : '') + '" onclick="pfSetRebalTax(' + o[0] + ')">' + o[1] + '</button>';
            }).join('') + '</div>' +
            '<span class="rb5-pop-hint">учитывается в прибыли облигаций к погашению</span></div>';
        var feeSec = '<div class="rb5-pop-sec"><span class="rb5-pop-l">Комиссия брокера</span>' +
            '<div class="rb5-pop-feerow"><div class="rb5-seg">' + REBAL_FEES.map(function (o) {
                return '<button class="rb5-seg-b' + (preset && rebalFee === o[0] ? ' on' : '') + '" onclick="pfSetRebalFee(' + o[0] + ')">' + o[1] + '</button>';
            }).join('') + '</div>' +
            '<label class="rb5-pop-own' + (preset ? '' : ' on') + '" onclick="event.stopPropagation()">' +
                '<input type="number" min="0" max="5" step="0.01" placeholder="своя" value="' + (preset ? '' : +(rebalFee * 100).toFixed(3)) + '" ' +
                    'onchange="pfSetRebalFeeCustom(this.value)"><span>%</span>' +
            '</label></div>' +
            '<span class="rb5-pop-hint">берётся дважды — при продаже и при покупке</span></div>';
        return '<div class="rb5-pop">' + taxSec + feeSec + '</div>';
    }
    // Портфель только из акций: вместо «машины денег» в шапке — средний потенциал
    // (взвешен по стоимости позиций; бумаги без потенциала не участвуют)
    function stockPulseHtml(ss) {
        var wsum = 0, w = 0;
        (ss || []).forEach(function (x) {
            var pot = livePotential(x.h);
            if (pot == null || !(x.c.value > 0)) return;
            wsum += pot * x.c.value; w += x.c.value;
        });
        if (!(w > 0)) return '';
        var avg = wsum / w;
        return '<div class="rb5-hpill rb5-hpill--stat" title="Средний потенциал акций портфеля, взвешенный по стоимости позиций">' +
            '<span class="rb5-hpl">Потенциал</span>' +
            '<b class="rb5-hpv ' + (avg >= 0 ? 'pos' : 'neg') + '">' + fmtPct(avg) + '</b>' +
            '<span class="rb5-hpt">средний</span>' +
        '</div>';
    }
    // Панель «методика расчёта» (иконка ⓘ в шапке): все формулы, по которым карточка
    // считает доходности и обмены, с текущими значениями НДФЛ и комиссии — чтобы методику
    // можно было проверить и поправить.
    function rb5FormulasHtml() {
        if (!rebalFormulas) return '';
        var fee = feeLbl(rebalFee), tax = Math.round((rebalTax || 0) * 100) + '%';
        function sect(t, rows) {
            return '<div class="rb5-fml-sect"><b>' + t + '</b>' + rows.map(function (r) {
                return '<div class="rb5-fml-r"><span>' + r[0] + '</span><code>' + r[1] + '</code></div>';
            }).join('') + '</div>';
        }
        return '<div class="rb5-fml">' +
            '<div class="rb5-fml-note">Текущие параметры: комиссия брокера <b>' + fee + '</b> (берётся при продаже и при покупке), НДФЛ <b>' + tax + '</b>. Номинал — настоящий FACEVALUE бумаги с MOEX (у ОФЗ 1000 ₽).</div>' +
            sect('Облигация — прибыль к погашению', [
                ['Доход', 'купон × выплат в год × (дней до погашения ÷ 365) + номинал + НКД сейчас'],
                ['Затраты', '(цена + НКД) × (1 + комиссия) — для моих: средние цена/НКД покупки по лотам; для рыночных: текущие'],
                ['НДФЛ', 'макс(0, доход − затраты) × ' + tax],
                ['Прибыль в день', '(доход − затраты − НДФЛ) ÷ дней до погашения'],
                ['Годовых', 'прибыль в день × 365 ÷ (затраты + НДФЛ) × 100'],
                ['Машина денег', 'сумма по портфелю: прибыль в день × кол-во (× 7 неделя / × 30 месяц)']
            ]) +
            sect('Обмен облигаций', [
                ['Выручка от продажи', 'кол-во × (цена сейчас + НКД сейчас) × (1 − комиссия)'],
                ['Куплено новых', '⌊выручка ÷ ((цена новой + НКД новой) × (1 + комиссия))⌋'],
                ['Предложенное кол-во', 'минимальное n, при котором куплено ≥ n + 1 («продал 200 → купил 201+»)'],
                ['Вердикт', 'обмен имеет смысл, если прибыль в день ПОСЛЕ > ДО']
            ]) +
            sect('Акции', [
                ['Динамика', '(цена сейчас − средняя цена покупки) ÷ средняя цена покупки × 100'],
                ['Потенциал', 'target таблицы эшелонов («Ребаланс») → живой ОДХС; в обмене сравниваем текущий против текущего (потенциал «при покупке» — в деталях бумаги)'],
                ['Выручка от продажи', 'кол-во × цена сейчас × (1 − комиссия)'],
                ['Куплено новых', '⌊выручка ÷ (цена новой × (1 + комиссия))⌋'],
                ['Налог', 'НДФЛ с прибыли акций в расчёте обмена не учитывается — прикиньте его отдельно перед продажей прибыльной бумаги'],
                ['Вердикт', 'обмен имеет смысл, если потенциал новой выше потенциала продаваемой']
            ]) +
        '</div>';
    }
    function rb5ColHead(kind, name, n, val) {
        var ic = kind === 'bond' ? RB5_IC_BOND : RB5_IC_STOCK;
        return '<div class="rb5-colhead">' +
            '<span class="rb5-chead-ic ' + kind + '">' + ic + '</span>' +
            '<div class="rb5-chead-t"><b>' + name + '</b><span>' + n + ' ' + plural(n, 'бумага', 'бумаги', 'бумаг') + '</span></div>' +
            '<div class="rb5-chead-v"><i>Стоимость</i><b>' + fmtRub(val) + '</b></div>' +
        '</div>';
    }
    function rb5Empty(t, s) { return '<div class="rb5-empty"><b>' + esc(t) + '</b><span>' + esc(s) + '</span></div>'; }
    function dealHint(msg) { return '<div class="rb5-cfoot"><span class="rb5-cfoot-t">' + esc(msg) + '</span></div>'; }
    // чип-шаг «1/2/3»: on — текущий шаг (тёмный), done — пройден (зелёная галка), '' — ещё не дошли
    function rb5Step(n, state) {
        return '<span class="rb5-step' + (state === 'done' ? ' done' : (state === 'on' ? ' on' : '')) + '">' +
            (state === 'done' ? CHECK_SVG : n) + '</span>';
    }
    // ---- слим-бар шагов «1 → 2 → 3» под шапкой (постоянная легенда, как в референсе) ----
    function rb5StepsBar() {
        function st(n, b, rest) { return '<span class="rb5-st"><i>' + n + '</i><span><b>' + b + '</b> ' + rest + '</span></span>'; }
        var arr = '<svg class="rb5-steps-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        return '<div class="rb5-steps">' +
            st(1, 'Что продать', '— бумага в списке слева') + arr +
            st(2, 'Что купить', '— замена доходнее') + arr +
            st(3, 'Примените', 'обмен при зелёном вердикте') +
            '<span class="rb5-steps-or">' + RB5_WAND + '<span>или «Подобрать за меня»</span></span>' +
        '</div>';
    }
    // Подсказка-шаг + «Подобрать за меня» — футер колонки, пока пара не собрана
    // (pfRbAuto — авто-выбор самой выгодной пары).
    function dealGuideHtml(kind, hasSell, hasBuy) {
        var t;
        if (hasSell) t = kind === 'bond' ? 'Шаг 2 — выберите в «Купить» облигацию доходнее'
                                         : 'Шаг 2 — выберите в «Купить» акцию с потенциалом выше';
        else if (hasBuy) t = 'Шаг 1 — выберите бумагу в списке «Продать»';
        else t = 'Шаг 1 — кликните бумагу в «Продать»';
        return '<div class="rb5-cfoot"><span class="rb5-cfoot-t">' + t + '</span>' +
            '<button type="button" class="rb5-auto" onclick="pfRbAuto(\'' + kind + '\')" title="Карточка сама найдёт самую выгодную пару и подставит её в расчёт">' + RB5_WAND + '<span>Подобрать за меня</span></button>' +
        '</div>';
    }
    // заголовок собранного расчёта: пара выбрана — остался шаг 3
    function dealHeadHtml() {
        return '<div class="rb5-deal-h">' + rb5Step(3, 'on') + '<b>Проверьте и примените</b></div>';
    }
    // «до → после»: «было» приглушённо и мельче, «стало» — крупно (акцент на результате)
    function rb5BA(before, after) { return '<b class="rb5-ba"><span>' + before + '</span><i>→</i>' + after + '</b>'; }
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
    // «Машина денег» → пилюля «Прибыль +257,37 ₽ в день» в шапке: зелёное моно-значение,
    // клик листает период день → неделя → месяц. Пояснение формулы — в title.
    function machineHtml(t) {
        var tip = (t.pending ? 'Уточняем купоны на Мосбирже…'
            : t.units + ' ' + plural(t.units, 'облигация', 'облигации', 'облигаций') + ' · купоны + номинал + НКД − затраты') +
            ' · клик — сменить период (день / неделя / месяц)';
        // после применённого обмена: дельта-чип + стойкая цветная подсветка пилюли —
        // рост прибыли виден сразу и не гаснет при перерисовках (живёт до закрытия карточки)
        var flash = '', flashCls = '';
        if (rebalFlash && isFinite(rebalFlash.delta) && Math.abs(rebalFlash.delta) > 1e-9 && !t.pending) {
            flash = '<span class="rb5-hpd ' + (rebalFlash.delta > 0 ? 'pos' : 'neg') + '" title="Изменение после применённого обмена">' +
                (rebalFlash.delta > 0 ? '+' : '−') + f2(Math.abs(rebalFlash.delta) * perMul()) + '</span>';
            flashCls = rebalFlash.delta > 0 ? ' up' : ' down';
        }
        var val = t.pending ? '<b class="rb5-hpv mut">…</b>'
            : '<b class="rb5-hpv ' + (t.total >= 0 ? 'pos' : 'neg') + '">' + (t.total >= 0 ? '+' : '−') + f2(Math.abs(t.total) * perMul()) + ' ₽</b>';
        return '<button class="rb5-hpill rb5-hpill--stat' + flashCls + '" onclick="pfCycleRebalPeriod()" title="' + attr(tip) + '">' +
            '<span class="rb5-hpl">Прибыль</span>' + val + '<span class="rb5-hpt">' + perLbl() + '</span>' + flash +
        '</button>';
    }
    // ---- иконка ⓘ в строке + раскрывающиеся детали бумаги ----
    // Иконка появляется при наведении на строку; клик раскрывает панель деталей под строкой
    // (метаданные из строк убраны — дата погашения и прочее живут теперь только здесь).
    function rb5InfoBtn(key, on) {
        return '<button type="button" class="rb5-info' + (on ? ' on' : '') + '" onclick="pfRbInfo(\'' + jsArg(key) + '\',event)" aria-label="Детали бумаги" title="Детали">' + INFO_SVG + '</button>';
    }
    // детали — сетка мини-чипов «подпись/значение»; анимация раскрытия только у панели,
    // открытой последним кликом (rebalInfoAnim), иначе она переигрывалась бы на каждый repaint
    function rb5DetRow(l, v) { return v ? '<div class="rb5-det-i"><span>' + l + '</span><b>' + v + '</b></div>' : ''; }
    function rb5Det(key, rows) { return '<div class="rb5-det' + (rebalInfoAnim === key ? ' anim' : '') + '"><div class="rb5-det-grid">' + rows + '</div></div>'; }
    function couponStr(d) {
        if (!d || !(+d.couponValue > 0)) return 'уточняем…';
        return fmtPrice(+d.couponValue) + (+d.freq > 0 ? ' · ' + (+d.freq) + ' ' + plural(+d.freq, 'раз', 'раза', 'раз') + ' в год' : '');
    }
    // строка моей облигации: имя + кол-во | доходность годовых из портфеля
    function bondRowHtml(x) {
        var r = bondHeld(x.h), e = r.econ, sel = rebalPick.bond.sell === x.h.id;
        var key = 'bs:' + x.h.id, on = !!rebalInfo[key];
        var val = e ? '<b class="' + (e.annual >= 0 ? 'pos' : 'neg') + '">' + fmtPct(e.annual) + '</b><span>годовых</span>'
                    : '<b class="mut">…</b><span>считаем</span>';
        var det = '';
        if (on) {
            var a = aggHolding(x.h), d = bondDetail(x.h.ticker);
            det = rb5Det(key,
                rb5DetRow('ISIN', esc(x.h.ticker)) +
                rb5DetRow('Погашение', e ? ruDate2(e.matDate) + ' · через ' + e.days + ' дн' : 'уточняем…') +
                rb5DetRow('Купон', couponStr(d)) +
                rb5DetRow('Цена сейчас', (r.priceNow > 0 ? fmtPrice(r.priceNow) : '—') + (r.nkdNow != null ? ' + НКД ' + fmtPrice(r.nkdNow) : '')) +
                rb5DetRow('Куплено', r.qty + ' шт · ' + fmtPrice(a.avgPrice) + ' · ' + ruDate(a.avgDate)) +
                rb5DetRow('Прибыль в день', e ? f2(e.perDay * r.qty) + ' ₽ · ' + f2(e.perDay) + ' ₽/шт' : '—')
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickBond(\'sell\',\'' + x.h.id + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(x.h.name || x.h.ticker) + '</span></b>' +
                '<span>' + fmtQty(r.qty) + ' шт</span></div>' +
            '<div class="rb5-rval">' + val + '</div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    // строка ОФЗ из таблицы: имя + цена с НКД | доходность из таблицы
    function ofzRowHtml(cd, heldSet) {
        var sel = rebalPick.bond.buy === cd.t;
        var key = 'bb:' + cd.t, on = !!rebalInfo[key];
        var det = '';
        if (on) {
            var d = bondDetail(cd.t);
            det = rb5Det(key,
                rb5DetRow('ISIN', esc(cd.t)) +
                rb5DetRow('Погашение', (cd.matDate && cd.matDate !== '—') ? ruDate2(cd.matDate) + (cd.econ ? ' · через ' + cd.econ.days + ' дн' : '') : 'уточняем…') +
                rb5DetRow('Купон', couponStr(d)) +
                rb5DetRow('Цена с НКД', cd.unit > 0 ? fmtPrice(cd.unit) : '—') +
                rb5DetRow('Прибыль в день', cd.econ ? f2(cd.econ.perDay) + ' ₽/шт · ' + fmtPct(cd.econ.annual) + ' годовых' : '—')
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickBond(\'buy\',\'' + jsArg(cd.t) + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(cd.n) + '</span>' + (heldSet[isinKey(cd.t)] ? '<i class="rb5-own">в портф.</i>' : '') +
                (cd._keeps ? '<i class="rb5-keep" title="Купоны этой бумаги приходятся на месяцы, которые оголит продажа — график ежемесячных выплат сохранится">держит график</i>' : '') + '</b>' +
                '<span>' + (cd.unit > 0 ? fmtPrice(cd.unit) + ' с НКД' : esc(cd.t)) + '</span></div>' +
            '<div class="rb5-rval"><b class="pos">' + (isFinite(cd.sheetYield) ? cd.sheetYield.toFixed(1).replace('.', ',') + '%' : '—') + '</b><span>доходность</span></div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    // расчёт обмена облигаций: продать N шт → купить M шт + прибыль/штук ДО → ПОСЛЕ + вердикт
    function bondDealHtml(mine, cands) {
        var pick = rebalPick.bond, sellX = null, cand = null;
        mine.forEach(function (x) { if (x.h.id === pick.sell) sellX = x; });
        cands.forEach(function (cd) { if (cd.t === pick.buy) cand = cd; });
        if (!sellX && !cand) return dealGuideHtml('bond', false, false);
        if (sellX && !cand) return dealGuideHtml('bond', true, false);
        if (!sellX) return dealGuideHtml('bond', false, true);
        var sh = bondHeld(sellX.h);
        var d = bondDeal(sh, cand, mine);
        if (!d) return dealHint('Недостаточно данных для расчёта — попробуйте другую пару.');
        // прибыль в день ДО/ПОСЛЕ считаем ПЕРВЫМ — от вердикта зависит тон заметок ниже
        var per = perMul();
        var haveDay = d.dayBefore != null && d.dayAfter != null;
        var dd = haveDay ? (d.dayAfter - d.dayBefore) * per : null;
        var profitUp = dd != null && dd > 0;
        var flow = '<div class="rb5-deal-flow">' +
            '<div class="rb5-deal-side"><i>Продать</i><b>' + esc(sellX.h.name || sellX.h.ticker) + '</b>' +
                rb5QtyCtl('bond', d.qty, d.maxQty) +
                '<small>≈ ' + fmtRub(d.proceeds) + ' с НКД' + (rebalFee > 0 ? ' · после комиссии' : '') + '</small></div>' +
            '<span class="rb5-deal-arr">' + RB5_ARR + '</span>' +
            '<div class="rb5-deal-side"><i>Купить</i><b>' + esc(cand.n) + '</b>' +
                '<div class="rb5-deal-n">' + d.buyQty + ' шт</div>' +
                '<small>' + (d.rest > 0.005 ? 'останется ' + fmtPrice(d.rest) : '&nbsp;') + '</small></div>' +
        '</div>';
        // котировка «сейчас» не пришла с Мосбиржи → выручка посчитана по цене покупки: честно предупреждаем
        var note = '';
        if (!sh.live) note += '<div class="rb5-note info">' + INFO_SVG + '<span>Котировка «сейчас» ещё не пришла с Мосбиржи — выручка от продажи посчитана по вашей цене покупки. Обновите карточку через пару секунд.</span></div>';
        // штук станет меньше (новая дороже за штуку): тревожный тон — ТОЛЬКО когда прибыль НЕ растёт;
        // иначе это осознанный размен «меньше штук, зато каждая доходнее» — машина денег всё равно быстрее
        if (d.suggest == null) {
            note += profitUp
                ? '<div class="rb5-note">Штук станет меньше — новая бумага дороже за штуку, зато каждая доходнее. Прибыль в день всё равно растёт.</div>'
                : '<div class="rb5-note warn">' + CHART_WARN_SVG + '<span>Новая бумага дороже вашей: штук станет меньше' + (haveDay ? ', и прибыль в день не растёт' : '') + ' — обмен спорный.</span></div>';
        } else if (d.qty === d.suggest) {
            note += '<div class="rb5-note">Минимум для «купить больше, чем продал»: ' + d.suggest + ' шт.</div>';
        }
        // Портфель из «Ежемесячного дохода»: следим, чтобы после обмена каждый месяц
        // оставался с выплатой (продажа бумаги целиком может «оголить» её месяцы)
        if (rbIsMonthlyPf() && d.qty >= d.maxQty) {
            var lost = pfLostMonths(mine, sellX.h, cand.t);
            if (lost && lost.length) {
                note += '<div class="rb5-note warn">' + CHART_WARN_SVG + '<span>Портфель собран под выплаты каждый месяц. После этого обмена без купона останутся: <b>' +
                    lost.map(function (m) { return RB_MON[m]; }).join(', ') + '</b>. Выберите бумагу с выплатами в эти месяцы (метка «держит график») или продайте не всё.</span></div>';
            } else if (lost) {
                note += '<div class="rb5-note">График ежемесячных выплат сохраняется — все месяцы остаются с купоном.</div>';
            }
        }
        var rows = '<div class="rb5-vrow"><span class="rb5-vico">' + UNITS_SVG + '</span><span class="rb5-vlabel">Облигаций всего</span>' +
            rb5BA(d.unitsBefore, d.unitsAfter + ' шт') +
            rb5Delta(d.unitsAfter - d.unitsBefore, ' шт', function (v) { return String(v); }) + '</div>';
        var verdict = '';
        if (haveDay) {
            rows += '<div class="rb5-vrow"><span class="rb5-vico">' + COIN_SVG + '</span><span class="rb5-vlabel">Прибыль ' + perLbl() + '</span>' +
                rb5BA(f2(d.dayBefore * per), f2(d.dayAfter * per) + ' ₽') +
                rb5Delta(dd, ' ₽', f2) + '</div>';
            verdict = profitUp
                ? '<div class="rb5-verdict ok">' + CHECK_SVG + '<span>Прибыль растёт — обмен имеет смысл, машина денег разгоняется</span></div>'
                : '<div class="rb5-verdict bad">' + XMARK_SVG + '<span>Прибыль ' + perLbl() + ' снизится — такой обмен смысла не имеет</span></div>';
        } else {
            rows += '<div class="rb5-vrow"><span class="rb5-vico">' + COIN_SVG + '</span><span class="rb5-vlabel">Прибыль ' + perLbl() + '</span><b>уточняем купоны…</b></div>';
        }
        // применить обмен в портфель одним кликом (есть что покупать → кнопка активна)
        var apply = d.buyQty > 0
            ? '<button class="rb5-apply" onclick="pfRbApplyBond()" title="Сделка сразу запишется в портфель и в историю">' + CHECK_SVG +
                '<span>Применить обмен</span><i>−' + d.qty + ' → +' + d.buyQty + ' шт</i></button>'
            : '';
        return '<div class="rb5-deal">' + dealHeadHtml() + flow + note + '<div class="rb5-vbox">' + rows + '</div>' + verdict + apply + '</div>';
    }
    function rb5BondCol(bs, c) {
        var head = rb5ColHead('bond', 'Облигации', bs.length, c.bondVal);
        if (!bs.length) return '<div class="rb5-col rb5-col--bond">' + head + rb5Empty('Нет облигаций', 'Добавьте облигации в портфель — здесь появится их доходность и обмен.') + '</div>';
        // мои — по доходности годовых (лучшие сверху), рынок — по доходности из таблицы
        var mine = bs.slice().sort(function (a, b) {
            var ea = bondHeld(a.h).econ, eb = bondHeld(b.h).econ;
            return (eb ? eb.annual : -1e9) - (ea ? ea.annual : -1e9);
        });
        var heldSet = {}; bs.forEach(function (x) { heldSet[isinKey(x.h.ticker)] = 1; });
        // Список «Купить» показывается полностью (свои бумаги — с бейджем «в портфеле»),
        // но когда слева выбрана бумага на продажу — именно она исчезает из кандидатов,
        // иначе можно «обменять» бумагу саму на себя.
        var sellSel = null; bs.forEach(function (x) { if (x.h.id === rebalPick.bond.sell) sellSel = isinKey(x.h.ticker); });
        var cands = ofzMarket().map(ofzCand).filter(function (cd) { return !sellSel || isinKey(cd.t) !== sellSel; }).sort(function (a, b) {
            return (isFinite(b.sheetYield) ? b.sheetYield : -1e9) - (isFinite(a.sheetYield) ? a.sheetYield : -1e9);
        });
        // выбранный ранее кандидат пропал из списка (его же выбрали на продажу, список
        // перезагрузился) — сброс выбора ДО отрисовки, чтобы чипы шагов не врали
        if (rebalPick.bond.buy && !cands.some(function (cd) { return cd.t === rebalPick.bond.buy; })) rebalPick.bond.buy = null;
        // Портфель из «Ежемесячного дохода» + выбрана бумага на продажу → помечаем
        // кандидатов, чьи купоны закрывают «оголяющиеся» месяцы (метка «держит график»)
        if (rbIsMonthlyPf() && rebalPick.bond.sell) {
            var sellSelX = null; bs.forEach(function (x) { if (x.h.id === rebalPick.bond.sell) sellSelX = x; });
            var needLost = sellSelX ? pfLostMonths(bs, sellSelX.h, null) : null;
            if (needLost && needLost.length) {
                cands.forEach(function (cd) {
                    var cm = bondPayMonths(cd.t);
                    cd._keeps = !!cm && needLost.every(function (m) { return cm[m]; });
                });
            }
        }
        var candRows = cands.length ? cands.map(function (cd) { return ofzRowHtml(cd, heldSet); }).join('')
            : '<div class="rb5-list-empty">Список ОФЗ появится из гугл-таблицы (раздел «Ребаланс»)</div>';
        // чипы шагов 1/2 в заголовках списков — новичок видит, куда кликать сейчас
        // (шаг 3 — в блоке расчёта ниже)
        var s1 = !!rebalPick.bond.sell, s2 = !!rebalPick.bond.buy;
        return '<div class="rb5-col rb5-col--bond">' + head +
            '<div class="rb5-duo">' +
                '<div class="rb5-list"><div class="rb5-list-h">' + rb5Step(1, s1 ? 'done' : 'on') + '<b>Продать</b><i>мои · годовых</i></div><div class="rb5-list-scroll">' + mine.map(bondRowHtml).join('') + '</div></div>' +
                '<div class="rb5-list rb5-list--buy"><div class="rb5-list-h">' + rb5Step(2, s2 ? 'done' : (s1 ? 'on' : '')) + '<b>Купить</b><i>таблица ОФЗ</i></div><div class="rb5-list-scroll">' + candRows + '</div></div>' +
            '</div>' +
            bondDealHtml(mine, cands) +
        '</div>';
    }
    // строка моей акции: тикер + эшелон + кол-во/потенциал | динамика с покупки
    function stockRowHtml(x) {
        var sel = rebalPick.stock.sell === x.h.id;
        var izm = x.c.pnlPct || 0, ech = echelonOf(x.h.ticker), pot = livePotential(x.h);
        var tier = ech ? '<span class="rb5-tier t' + ech + '">' + ROMAN[ech - 1] + '</span>' : '';
        var key = 'ss:' + x.h.id, on = !!rebalInfo[key];
        var det = '';
        if (on) {
            // потенциал «при покупке» показываем отдельной строкой, только если он реально
            // заморожен и отличается от текущего — иначе лишний шум
            var atBuy = (x.h.potAtBuy != null && isFinite(+x.h.potAtBuy)) ? +x.h.potAtBuy : null;
            det = rb5Det(key,
                rb5DetRow('Компания', esc(x.h.name || x.h.ticker)) +
                rb5DetRow('Эшелон', ech ? ROMAN[ech - 1] : '—') +
                rb5DetRow('Цена сейчас', x.c.cur > 0 ? fmtPrice(x.c.cur) : '—') +
                rb5DetRow('Куплено', x.c.qty + ' шт · ' + fmtPrice(x.c.buy) + ' · ' + ruDate(x.c.firstDate)) +
                rb5DetRow('Доход', fmtRub(x.c.pnl) + ' · ' + fmtPct(izm)) +
                rb5DetRow('Потенциал сейчас', pot == null ? '—' : fmtPct(pot)) +
                (atBuy != null && (pot == null || Math.abs(atBuy - pot) > 0.05) ? rb5DetRow('При покупке', fmtPct(atBuy)) : '')
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickStock(\'sell\',\'' + x.h.id + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(x.h.ticker) + '</span>' + tier + '</b>' +
                '<span>' + fmtQty(x.c.qty) + ' шт · потенциал ' + (pot == null ? '—' : fmtPct(pot)) + '</span></div>' +
            '<div class="rb5-rval"><b class="' + (izm >= 0 ? 'pos' : 'neg') + '">' + fmtPct(izm) + '</b><span>динамика</span></div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    function stockCandRowHtml(cn, heldSet) {
        var sel = rebalPick.stock.buy === cn.ticker;
        var price = stkPriceOf(cn.ticker);
        var tier = '<span class="rb5-tier t' + cn.ech + '">' + ROMAN[cn.ech - 1] + '</span>';
        var potCls = cn.pot == null ? 'mut' : (cn.pot >= 0 ? 'pos' : 'neg');
        var key = 'sb:' + cn.ticker, on = !!rebalInfo[key];
        var det = '';
        if (on) {
            det = rb5Det(key,
                rb5DetRow('Компания', esc(cn.name)) +
                (cn.sector ? rb5DetRow('Сектор', esc(cn.sector)) : '') +
                rb5DetRow('Эшелон', ROMAN[cn.ech - 1]) +
                rb5DetRow('Цена сейчас', price > 0 ? fmtPrice(price) : '—') +
                rb5DetRow('Потенциал', cn.pot == null ? '—' : fmtPct(cn.pot))
            );
        }
        return '<div class="rb5-row' + (sel ? ' sel' : '') + '" tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '" onclick="pfPickStock(\'buy\',\'' + jsArg(cn.ticker) + '\')">' +
            '<div class="rb5-rid"><b>' + (sel ? RB5_CHECK : '') + '<span class="rb5-nmt">' + esc(cn.ticker) + '</span>' + tier + (heldSet && heldSet[cn.ticker] ? '<i class="rb5-own">в портф.</i>' : '') + '</b>' +
                '<span>' + esc(cn.name) + (price > 0 ? ' · ' + fmtPrice(price) : '') + '</span></div>' +
            '<div class="rb5-rval"><b class="' + potCls + '">' + (cn.pot == null ? '—' : fmtPct(cn.pot)) + '</b><span>потенциал</span></div>' + rb5InfoBtn(key, on) +
        '</div>' + det;
    }
    // расчёт обмена акций: продать N шт → купить M шт + потенциал ДО → ПОСЛЕ + вердикт
    function stockDealHtml(mine, cands) {
        var pick = rebalPick.stock, sellX = null, cand = null;
        mine.forEach(function (x) { if (x.h.id === pick.sell) sellX = x; });
        cands.forEach(function (cn) { if (cn.ticker === pick.buy) cand = cn; });
        if (pick.buy && !cand) pick.buy = null;   // выбранный кандидат выпал из эшелона — сброс
        if (!sellX && !cand) return dealGuideHtml('stock', false, false);
        if (sellX && !cand) return dealGuideHtml('stock', true, false);
        if (!sellX) return dealGuideHtml('stock', false, true);
        var d = stockDeal({ qty: sellX.c.qty, nowPrice: sellX.c.cur || 0, pot: livePotential(sellX.h) }, cand);
        if (!d) return dealHint('Недостаточно данных для расчёта — попробуйте другую пару.');
        var flow = '<div class="rb5-deal-flow">' +
            '<div class="rb5-deal-side"><i>Продать</i><b>' + esc(sellX.h.ticker) + '</b>' +
                rb5QtyCtl('stock', d.qty, d.maxQty) +
                '<small>≈ ' + fmtRub(d.proceeds) + (rebalFee > 0 ? ' · после комиссии' : '') + '</small></div>' +
            '<span class="rb5-deal-arr">' + RB5_ARR + '</span>' +
            '<div class="rb5-deal-side"><i>Купить</i><b>' + esc(cand.ticker) + '</b>' +
                '<div class="rb5-deal-n">' + (d.buyQty > 0 ? d.buyQty + ' шт' : 'на ' + fmtRub(d.proceeds)) + '</div>' +
                '<small>' + (d.priceN > 0 ? 'по ' + fmtPrice(d.priceN) + (d.buyQty > 0 && d.rest > 0.005 ? ' · останется ' + fmtPrice(d.rest) : '') : '&nbsp;') + '</small></div>' +
        '</div>';
        // выручки не хватает даже на одну акцию кандидата — объясняем, а не прячем кнопку молча
        var note = (d.buyQty <= 0 && d.priceN > 0)
            ? '<div class="rb5-note warn">' + CHART_WARN_SVG + '<span>Выручки (' + fmtRub(d.proceeds) + ') не хватает даже на одну акцию ' + esc(cand.ticker) + ' по ' + fmtPrice(d.priceN) + '. Продайте больше или выберите бумагу дешевле.</span></div>'
            : '';
        var rows = '<div class="rb5-vrow"><span class="rb5-vlabel">Потенциал сейчас</span>' +
            rb5BA(d.potFrom == null ? '—' : fmtPct(d.potFrom), d.potTo == null ? '—' : fmtPct(d.potTo)) +
            (d.potDelta != null ? rb5Delta(d.potDelta, ' п.п.', function (v) { return v.toFixed(1).replace('.', ','); }) : '') + '</div>';
        var verdict = d.potDelta == null ? ''
            : (d.potDelta > 0
                ? '<div class="rb5-verdict ok">' + CHECK_SVG + '<span>Потенциал растёт — обмен имеет смысл</span></div>'
                : '<div class="rb5-verdict bad">' + XMARK_SVG + '<span>Потенциал не растёт — такой обмен смысла не имеет</span></div>');
        var apply = d.buyQty > 0
            ? '<button class="rb5-apply" onclick="pfRbApplyStock()" title="Сделка сразу запишется в портфель и в историю">' + CHECK_SVG +
                '<span>Применить обмен</span><i>−' + d.qty + ' ' + esc(sellX.h.ticker) + ' → +' + d.buyQty + ' ' + esc(cand.ticker) + '</i></button>'
            : '';
        return '<div class="rb5-deal">' + dealHeadHtml() + flow + note + '<div class="rb5-vbox">' + rows + '</div>' + verdict + apply + '</div>';
    }
    function rb5StockCol(ss, c) {
        var head = rb5ColHead('stock', 'Акции', ss.length, c.stockVal);
        if (!ss.length) return '<div class="rb5-col rb5-col--stock">' + head + rb5Empty('Нет акций', 'Добавьте акции в портфель — здесь появится их динамика, потенциал и обмен.') + '</div>';
        var mine = ss.slice().sort(function (a, b) { return (b.c.pnlPct || 0) - (a.c.pnlPct || 0); });   // по динамике
        var heldSet = {}; ss.forEach(function (x) { heldSet[x.h.ticker] = 1; });
        var sellX = null; mine.forEach(function (x) { if (x.h.id === rebalPick.stock.sell) sellX = x; });
        var ech = sellX ? echelonOf(sellX.h.ticker) : 0;
        var cands = stockCands(ech);
        // в эшелоне продаваемой бумаги кандидатов нет (или эшелон не определён) —
        // не оставляем пустоту, показываем полный список по потенциалу
        if (ech >= 1 && !cands.length) { cands = stockCands(0); ech = 0; }
        // саму продаваемую бумагу на замену не предлагаем
        if (sellX) cands = cands.filter(function (cn) { return cn.ticker !== sellX.h.ticker; });
        // кандидат пропал из списка (сменился эшелон, выбрали его же на продажу) —
        // сброс ДО отрисовки, чтобы чипы шагов не врали
        if (rebalPick.stock.buy && !cands.some(function (cn) { return cn.ticker === rebalPick.stock.buy; })) rebalPick.stock.buy = null;
        var candRows = cands.length ? cands.map(function (cn) { return stockCandRowHtml(cn, heldSet); }).join('')
            : '<div class="rb5-list-empty">Список появится из гугл-таблицы (раздел «Ребаланс»)</div>';
        // чипы шагов 1/2 — как в колонке облигаций
        var s1 = !!rebalPick.stock.sell, s2 = !!rebalPick.stock.buy;
        return '<div class="rb5-col rb5-col--stock">' + head +
            '<div class="rb5-duo">' +
                '<div class="rb5-list"><div class="rb5-list-h">' + rb5Step(1, s1 ? 'done' : 'on') + '<b>Продать</b><i>мои · динамика</i></div><div class="rb5-list-scroll">' + mine.map(stockRowHtml).join('') + '</div></div>' +
                '<div class="rb5-list rb5-list--buy"><div class="rb5-list-h">' + rb5Step(2, s2 ? 'done' : (s1 ? 'on' : '')) + '<b>Купить</b><i>потенциальные' + (ech ? ' · эшелон ' + ROMAN[ech - 1] : '') + '</i></div><div class="rb5-list-scroll">' + candRows + '</div></div>' +
            '</div>' +
            stockDealHtml(mine, cands) +
        '</div>';
    }
    // ---- панель «история сделок» (кнопка-часы в шапке) ----
    // Применённые обмены хранятся в p.trades (уходят в localStorage вместе с портфелем):
    // каждый расчёт можно отследить и проверить постфактум; запись можно удалить крестиком.
    function rb5HistoryHtml(p) {
        if (!rebalHistory) return '';
        var ts = p.trades || [];
        var rows = ts.length ? ts.map(function (t, i) {
            var w = new Date(t.ts || 0);
            var when = pad2(w.getDate()) + '.' + pad2(w.getMonth() + 1) + '.' + w.getFullYear() + ' · ' + pad2(w.getHours()) + ':' + pad2(w.getMinutes());
            var eff = '';
            if (t.kind === 'bond' && t.dayBefore != null && t.dayAfter != null)
                eff = rb5Delta(t.dayAfter - t.dayBefore, ' ₽/день', f2);
            else if (t.kind === 'stock' && t.potFrom != null && t.potTo != null)
                eff = rb5Delta(t.potTo - t.potFrom, ' п.п.', function (v) { return v.toFixed(1).replace('.', ','); });
            // отмена доступна только для ПОСЛЕДНЕЙ сделки с сохранённым состоянием —
            // так портфель гарантированно возвращается ровно к состоянию до обмена
            var undoBtn = (i === 0 && t.undo)
                ? '<button class="rb5-hist-undo" onclick="pfRbUndoTrade(\'' + p.id + '\',\'' + t.id + '\')" title="Отменить сделку — портфель вернётся к состоянию до обмена">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>Отменить</button>'
                : '';
            return '<div class="rb5-hist-r">' +
                '<span class="rb5-cdot ' + (t.kind === 'bond' ? 'bond' : 'stock') + '"></span>' +
                '<div class="rb5-hist-main">' +
                    '<b>−' + t.sellQty + ' ' + esc(t.sellName) + '<span class="rb5-hist-arr">→</span>+' + t.buyQty + ' ' + esc(t.buyName) + '</b>' +
                    '<span>' + when + ' · продажа ≈ ' + fmtRub(t.proceeds) +
                        (t.rest > 0.005 ? ' · остаток ' + fmtPrice(t.rest) : '') +
                        (t.fee > 0 ? ' · комиссия ' + feeLbl(t.fee) : '') + '</span>' +
                '</div>' +
                (eff ? '<span class="rb5-hist-eff">' + eff + '</span>' : '') +
                undoBtn +
                '<button class="rb5-hist-x" onclick="pfRbDelTrade(\'' + p.id + '\',\'' + t.id + '\')" aria-label="Удалить запись" title="Удалить запись из истории (портфель не меняется)">' + XMARK_SVG + '</button>' +
            '</div>';
        }).join('') : '<div class="rb5-hist-empty">Пока пусто — применённые обмены будут записываться сюда, чтобы каждый шаг можно было отследить и проверить.</div>';
        return '<div class="rb5-hist"><div class="rb5-hist-h"><b>История сделок</b>' +
            (ts.length ? '<span class="rb5-ccount">' + ts.length + '</span>' : '') + '</div>' + rows + '</div>';
    }
    // animate=true — только первое открытие (см. pfExpand); ре-рендеры без анимации,
    // иначе пересоздание карточки на каждый клик заставляет её мигать целиком
    function overlayHtml(p, animate) {
        var c = calcPf(p);
        var bs = c.hs.filter(function (x) { return x.h.type === 'bond'; });
        var ss = c.hs.filter(function (x) { return x.h.type !== 'bond'; });
        // портфель только из акций → колонку облигаций (и «машину денег» с НДФЛ в шапке)
        // не показываем вовсе; только из облигаций → прячем колонку акций. Пустой портфель —
        // обе заглушки, как раньше.
        var hasB = bs.length > 0, hasS = ss.length > 0;
        var one = (hasB && !hasS) || (hasS && !hasB);
        var cols = (!hasB && !hasS) ? rb5BondCol(bs, c) + rb5StockCol(ss, c)
            : (hasB ? rb5BondCol(bs, c) : '') + (hasS ? rb5StockCol(ss, c) : '');
        return '<div class="pfo-card rb5-card' + (one ? ' rb5-card--one' : '') + (animate ? ' pfo-anim-in' : '') + '">' +
            rb5Head(p, c, hasB ? bondsTotal(bs) : null, ss) +
            '<div class="rb5-body">' + rb5StepsBar() + rb5HistoryHtml(p) + rb5FormulasHtml() +
            '<div class="rb5-cols' + (one ? ' rb5-cols--one' : '') + '">' + cols + '</div></div>' +
        '</div>';
    }

    // ---------- события ----------
    window.pfSetRebalTax = function (rate) { rebalTax = rate; saveRebalParams(); rebalRepaint(); };
    window.pfSetRebalFee = function (rate) { rebalFee = rate; saveRebalParams(); rebalRepaint(); };
    // своя комиссия из попапа параметров: вводится в процентах (0,08 → 0.0008)
    window.pfSetRebalFeeCustom = function (v) {
        var n = toNum(v);
        if (!isFinite(n) || n < 0) { rebalRepaint(); return; }
        rebalFee = clamp(n, 0, 5) / 100; saveRebalParams(); rebalRepaint();
    };
    window.pfRbFormulas = function () { rebalFormulas = !rebalFormulas; rebalRepaint(); };
    window.pfRbParams = function () { rebalParams = !rebalParams; rebalRepaint(); };
    window.pfRbHistory = function () { rebalHistory = !rebalHistory; rebalRepaint(); };
    // «Подобрать за меня»: перебирает пары «моя бумага → кандидат с рынка» и подставляет
    // самую выгодную (облигации — максимальный рост прибыли в день, акции — рост потенциала).
    // Уже выбранная пользователем сторона уважается — подбирается только недостающая половина.
    window.pfRbAuto = function (kind) {
        var ov = dq('pfOverlay'); if (!ov) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var c = calcPf(p), best = null;
        if (kind === 'bond') {
            var bs = c.hs.filter(function (x) { return x.h.type === 'bond'; });
            if (bondsTotal(bs).pending) { toast('Ещё уточняем купоны на Мосбирже — попробуйте через пару секунд'); return; }
            var fixS = rebalPick.bond.sell, fixB = rebalPick.bond.buy, f = rebalFee || 0;
            var cands = ofzMarket().map(ofzCand);
            bs.forEach(function (x) {
                if (fixS && x.h.id !== fixS) return;
                var r = bondHeld(x.h);
                if (!(r.qty > 0) || !r.econ || !(r.unitNow > 0)) return;
                cands.forEach(function (cd) {
                    if (fixB && cd.t !== fixB) return;
                    if (isinKey(cd.t) === isinKey(x.h.ticker)) return;
                    if (!cd.econ || !(cd.unit > 0)) return;
                    var partial = bondQtyFor1More(r.unitNow, cd.unit, r.qty);
                    var qty = partial || r.qty;
                    var buyQty = Math.floor(qty * r.unitNow * (1 - f) / (cd.unit * (1 + f)));
                    if (!(buyQty > 0)) return;
                    // портфель под ежемесячные выплаты: пару, применимую лишь продажей ЦЕЛИКОМ
                    // (нет частичного варианта) и оголяющую месяц, apply всё равно отклонит —
                    // не подсовываем такой «тупик» автоподбором
                    if (p.src === 'monthly' && !partial) {
                        var lost = pfLostMonths(bs, x.h, cd.t);
                        if (lost && lost.length) return;
                    }
                    var delta = buyQty * cd.econ.perDay - qty * r.econ.perDay;   // прибыль/день ПОСЛЕ − ДО
                    if (delta > 0 && (!best || delta > best.delta)) best = { sell: x.h.id, buy: cd.t, delta: delta };
                });
            });
            if (!best) { toast(fixS || fixB ? 'Для выбранной бумаги выгодной пары сейчас нет — попробуйте другую' : 'Выгодного обмена сейчас не видно — облигации портфеля и так работают хорошо'); return; }
            rebalPick.bond = { sell: best.sell, buy: best.buy, qty: null };
        } else {
            var ss = c.hs.filter(function (x) { return x.h.type !== 'bond'; });
            var fixS2 = rebalPick.stock.sell, fixB2 = rebalPick.stock.buy;
            ss.forEach(function (x) {
                if (fixS2 && x.h.id !== fixS2) return;
                var pot = livePotential(x.h);
                if (pot == null || !(x.c.qty > 0) || !(x.c.cur > 0)) return;
                var ech = echelonOf(x.h.ticker);
                var cnds = stockCands(ech >= 1 ? ech : 0);
                if (ech >= 1 && !cnds.length) cnds = stockCands(0);
                cnds.forEach(function (cn) {
                    if (fixB2 && cn.ticker !== fixB2) return;
                    if (cn.ticker === x.h.ticker || cn.pot == null) return;
                    var delta = cn.pot - pot;
                    if (!(delta > 0)) return;
                    var d = stockDeal({ qty: x.c.qty, nowPrice: x.c.cur, pot: pot }, cn);
                    if (!d || !(d.buyQty > 0)) return;
                    if (!best || delta > best.delta) best = { sell: x.h.id, buy: cn.ticker, delta: delta };
                });
            });
            if (!best) { toast(fixS2 || fixB2 ? 'Для выбранной акции выгодной пары сейчас нет — попробуйте другую' : 'Выгодного обмена сейчас не видно — потенциал ваших акций и так на уровне'); return; }
            rebalPick.stock = { sell: best.sell, buy: best.buy, qty: null };
        }
        rebalRepaint();
        rb5ScrollToSel(kind);
    };
    // После автоподбора докручиваем оба списка колонки к выбранным карточкам — иначе выбор
    // в глубине длинного списка остаётся за кадром. Вызывать ПОСЛЕ rebalRepaint: он
    // восстанавливает старые scrollTop списков, и ручной скролл должен лечь поверх.
    function rb5ScrollToSel(kind) {
        var ov = dq('pfOverlay'); if (!ov) return;
        var col = ov.querySelector(kind === 'bond' ? '.rb5-col--bond' : '.rb5-col--stock'); if (!col) return;
        [].forEach.call(col.querySelectorAll('.rb5-list-scroll'), function (sc) {
            var row = sc.querySelector('.rb5-row.sel'); if (!row) return;
            var top = sc.scrollTop + row.getBoundingClientRect().top - sc.getBoundingClientRect().top
                - (sc.clientHeight - row.offsetHeight) / 2;   // выбранная карточка — по центру видимой части
            if (sc.scrollTo) sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            else sc.scrollTop = Math.max(0, top);
        });
    }
    // клик по пилюле «Прибыль» в шапке листает период: день → неделя → месяц → день
    window.pfCycleRebalPeriod = function () {
        var order = ['day', 'week', 'month'];
        rebalPeriod = order[(order.indexOf(rebalPeriod) + 1) % order.length];
        saveRebalParams(); rebalRepaint();
    };
    // выбор бумаги: клик по своей (side='sell') / рыночной (side='buy'); повторный клик —
    // снять выбор; количество к продаже сбрасывается на предложенное
    window.pfPickBond = function (side, id) { var pk = rebalPick.bond;
        pk[side] = (pk[side] === id) ? null : id; pk.qty = null; rebalRepaint(); };
    window.pfPickStock = function (side, id) { var pk = rebalPick.stock;
        pk[side] = (pk[side] === id) ? null : id; pk.qty = null; rebalRepaint(); };
    // иконка ⓘ в строке: раскрыть/свернуть детали бумаги (не выбирая её — клик не всплывает)
    window.pfRbInfo = function (key, ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        rebalInfo[key] = !rebalInfo[key];
        rebalInfoAnim = rebalInfo[key] ? key : null;   // анимация раскрытия — только этой панели
        rebalRepaint();
        rebalInfoAnim = null;
    };
    window.pfRbQty = function (kind, val, max) {
        var n = Math.round(toNum(val)); if (!isFinite(n)) n = 1;
        rebalPick[kind].qty = clamp(n, 1, max || 1); rebalRepaint();
    };

    // ---------- применение обмена в портфель ----------
    // Списание qty у актива: FIFO по дате покупки (старые лоты первыми); лоты, ушедшие
    // в ноль, удаляются; продано всё — удаляется и сам актив.
    function pfReduceHolding(p, h, qty) {
        var ordered = ensureLots(h).slice().sort(function (a, b) { return String(a.buyDate || '').localeCompare(String(b.buyDate || '')); });
        var left = qty;
        ordered.forEach(function (l) {
            if (left <= 0) return;
            var q = +l.qty || 0, take = Math.min(q, left);
            l.qty = q - take; left -= take;
        });
        h.lots = ensureLots(h).filter(function (l) { return (+l.qty || 0) > 0; });
        if (!h.lots.length) p.holdings = (p.holdings || []).filter(function (x) { return x.id !== h.id; });
    }
    // Покупка: такой тикер уже есть (облигации сверяем по короткому ISIN) → докупка лотом,
    // иначе новый актив. Цена/НКД — текущие рыночные: ровно те, по которым считался обмен.
    // Возвращает { hid, lotId } — по ним отмена сделки убирает именно этот лот.
    function pfAddBought(p, o) {
        var lot = { id: genId('l'), buyDate: todayStr(), buyPrice: Math.round((o.price || 0) * 100) / 100, qty: o.qty,
            nkd: Math.round((o.nkd || 0) * 100) / 100, priceFromApi: true, nkdFromApi: o.type === 'bond' };
        var exist = null;
        (p.holdings || []).forEach(function (h) {
            if (exist || h.type !== o.type) return;
            if (o.type === 'bond' ? isinKey(h.ticker) === isinKey(o.ticker) : h.ticker === o.ticker) exist = h;
        });
        if (exist) { ensureLots(exist).push(lot); return { hid: exist.id, lotId: lot.id }; }
        var nh = { id: genId('h'), ticker: o.ticker, name: o.name || o.ticker, type: o.type, lots: [lot],
            potAtBuy: o.type === 'stock' ? (o.pot != null ? o.pot : potentialOf(o.ticker)) : null };
        p.holdings.push(nh);
        return { hid: nh.id, lotId: lot.id };
    }
    function pfLogTrade(p, t) {
        t.id = genId('t'); t.ts = Date.now(); t.fee = rebalFee || 0;
        p.trades = p.trades || [];
        p.trades.unshift(t);
        if (p.trades.length > 120) p.trades.length = 120;   // страховка от разбухания localStorage
    }
    // состав изменился → серии графиков доходности пересобрать заново
    function pfInvalidateCharts(pid) { delete chartRaw[pid]; delete chartCache[pid]; }
    // Кнопка «Применить обмен» (облигации): списывает проданные, добавляет купленные,
    // пишет запись в историю и подсвечивает сдвиг «машины денег» в шапке.
    window.pfRbApplyBond = function () {
        var ov = dq('pfOverlay'); if (!ov) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var bs = calcPf(p).hs.filter(function (x) { return x.h.type === 'bond'; });
        var sellX = null; bs.forEach(function (x) { if (x.h.id === rebalPick.bond.sell) sellX = x; });
        var cand = null; ofzMarket().map(ofzCand).forEach(function (cd) { if (cd.t === rebalPick.bond.buy) cand = cd; });
        if (!sellX || !cand) return;
        var d = bondDeal(bondHeld(sellX.h), cand, bs);
        if (!d) { toast('Недостаточно данных для обмена', true); return; }
        if (!(d.buyQty > 0)) { toast('Выручки не хватает даже на одну новую бумагу', true); return; }
        // портфель под ежемесячные выплаты: не даём обмену оставить месяц без купона
        if (p.src === 'monthly' && d.qty >= d.maxQty) {
            var lostM = pfLostMonths(bs, sellX.h, cand.t);
            if (lostM && lostM.length) {
                toast('Обмен сломает график ежемесячных выплат: без купона — ' + lostM.map(function (m) { return RB_MON[m]; }).join(', '), true);
                return;
            }
        }
        var before = bondsTotal(bs);
        var sellName = sellX.h.name || sellX.h.ticker;
        var sellSnap = JSON.parse(JSON.stringify(sellX.h));   // для отмены сделки из истории
        var sellIdx = (p.holdings || []).indexOf(sellX.h);
        pfReduceHolding(p, sellX.h, d.qty);
        // тикер купленной — КОРОТКИЙ ISIN (как у добавленных вручную): полный SECID из
        // таблицы ОФЗ давал в составе «SU26233RMFS5» рядом с «SU26230» — разнобой
        var bought = pfAddBought(p, { type: 'bond', ticker: isinKey(cand.t), name: cand.n, price: cand.price, nkd: cand.nkd, qty: d.buyQty });
        pfLogTrade(p, { kind: 'bond', sellTicker: sellX.h.ticker, sellName: sellName, sellQty: d.qty,
            buyTicker: isinKey(cand.t), buyName: cand.n, buyQty: d.buyQty, proceeds: d.proceeds, rest: d.rest,
            dayBefore: d.dayBefore, dayAfter: d.dayAfter,
            undo: { sold: sellSnap, soldIdx: sellIdx, buyHid: bought.hid, buyLotId: bought.lotId } });
        // не потраченный при покупке остаток выручки — в свободные деньги портфеля
        if (d.rest > 0.005) p.cash = Math.round(((+p.cash || 0) + d.rest) * 100) / 100;
        // дельта «машины денег»: пересчёт по фактически обновлённому портфелю; если купоны
        // ещё грузятся — берём расчётную дельту из самой сделки
        var after = bondsTotal(calcPf(p).hs.filter(function (x) { return x.h.type === 'bond'; }));
        rebalFlash = (!before.pending && !after.pending) ? { delta: after.total - before.total }
            : (d.dayBefore != null && d.dayAfter != null ? { delta: d.dayAfter - d.dayBefore } : null);
        rebalPick.bond = { sell: null, buy: null, qty: null };
        saveStore(); pfInvalidateCharts(p.id); ensureQuotes(true);
        ensureBondDetails(p, function () { rebalRepaint(); });
        rebalRepaint();
        if (currentTab === 'portfolios' && dq('pfWrap')) renderPortfolios();
        toast('Обмен применён: −' + d.qty + ' ' + sellName + ' → +' + d.buyQty + ' ' + cand.n);
    };
    // Кнопка «Применить обмен» (акции): та же механика, эффект — смена потенциала.
    window.pfRbApplyStock = function () {
        var ov = dq('pfOverlay'); if (!ov) return;
        var p = findPf(ov.dataset.pid); if (!p) return;
        var ss = calcPf(p).hs.filter(function (x) { return x.h.type !== 'bond'; });
        var sellX = null; ss.forEach(function (x) { if (x.h.id === rebalPick.stock.sell) sellX = x; });
        if (!sellX) return;
        var ech = echelonOf(sellX.h.ticker);
        var cands = stockCands(ech >= 1 ? ech : 0);
        if (ech >= 1 && !cands.length) cands = stockCands(0);
        var cand = null; cands.forEach(function (cn) { if (cn.ticker === rebalPick.stock.buy) cand = cn; });
        if (!cand) return;
        var d = stockDeal({ qty: sellX.c.qty, nowPrice: sellX.c.cur || 0, pot: livePotential(sellX.h) }, cand);
        if (!d) { toast('Недостаточно данных для обмена', true); return; }
        if (!(d.buyQty > 0)) { toast('Выручки не хватает даже на одну акцию ' + cand.ticker, true); return; }
        var sellName = sellX.h.ticker;
        var sellSnap = JSON.parse(JSON.stringify(sellX.h));   // для отмены сделки из истории
        var sellIdx = (p.holdings || []).indexOf(sellX.h);
        pfReduceHolding(p, sellX.h, d.qty);
        var bought = pfAddBought(p, { type: 'stock', ticker: cand.ticker, name: cand.name, price: d.priceN, qty: d.buyQty, pot: cand.pot });
        var stRest = d.priceN > 0 ? d.proceeds - d.buyQty * d.priceN * (1 + (rebalFee || 0)) : 0;
        pfLogTrade(p, { kind: 'stock', sellTicker: sellName, sellName: sellName, sellQty: d.qty,
            buyTicker: cand.ticker, buyName: cand.ticker, buyQty: d.buyQty, proceeds: d.proceeds,
            rest: stRest,
            potFrom: d.potFrom, potTo: d.potTo,
            undo: { sold: sellSnap, soldIdx: sellIdx, buyHid: bought.hid, buyLotId: bought.lotId } });
        // не потраченный при покупке остаток выручки — в свободные деньги портфеля
        if (stRest > 0.005) p.cash = Math.round(((+p.cash || 0) + stRest) * 100) / 100;
        rebalPick.stock = { sell: null, buy: null, qty: null };
        saveStore(); pfInvalidateCharts(p.id); ensureQuotes(true); rebalRepaint();
        if (currentTab === 'portfolios' && dq('pfWrap')) renderPortfolios();
        toast('Обмен применён: −' + d.qty + ' ' + sellName + ' → +' + d.buyQty + ' ' + cand.ticker);
    };
    window.pfRbDelTrade = function (pid, tid) {
        var p = findPf(pid); if (!p) return;
        p.trades = (p.trades || []).filter(function (t) { return t.id !== tid; });
        saveStore(); rebalRepaint();
    };
    // Отмена последней сделки: убираем купленный лот, возвращаем проданное как было.
    // Разрешена только для верхней записи истории — отмены идут строго стеком,
    // иначе более поздние сделки могли уже перераспределить те же бумаги.
    window.pfRbUndoTrade = function (pid, tid) {
        var p = findPf(pid); if (!p) return;
        var ts = p.trades || [];
        if (!ts.length || ts[0].id !== tid) { toast('Отменять сделки можно только по порядку — начиная с последней', true); return; }
        var t = ts[0];
        if (!t.undo || !t.undo.sold) { toast('У этой записи нет сохранённого состояния для отмены', true); return; }
        // окно предупреждения: отмена стирает ОБЕ записи обмена (продажу и покупку) —
        // без явного подтверждения так легко потерять сделку случайным кликом
        var UNDO_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
        pfConfirm({
            danger: true, ok: 'Да, отменить', icon: UNDO_ICO,
            title: 'Отменить ребалансировку?',
            text: 'Из истории исчезнут обе записи обмена — продажа ' + esc(t.sellName || t.sellTicker || '') + ' и покупка ' + esc(t.buyName || t.buyTicker || '') + '. Портфель вернётся к состоянию до сделки.'
        }, function () {
            // 1) убрать купленный лот (если холдинг опустел — убрать и его)
            var bh = null;
            (p.holdings || []).forEach(function (h) { if (h.id === t.undo.buyHid) bh = h; });
            if (bh) {
                bh.lots = ensureLots(bh).filter(function (l) { return l.id !== t.undo.buyLotId; });
                if (!bh.lots.length) p.holdings = p.holdings.filter(function (x) { return x.id !== bh.id; });
            }
            // 2) вернуть проданное: актив ещё есть (продали часть) → восстановить его лоты,
            //    актив был продан целиком → вернуть его в состав на прежнее место
            var sold = t.undo.sold, sh = null;
            (p.holdings || []).forEach(function (h) { if (h.id === sold.id) sh = h; });
            if (sh) sh.lots = sold.lots;
            else {
                var at = (t.undo.soldIdx != null) ? Math.min(t.undo.soldIdx, p.holdings.length) : p.holdings.length;
                p.holdings.splice(at, 0, sold);
            }
            // 3) забрать обратно остаток выручки, упавший в кэш при применении обмена
            if (t.rest > 0.005) p.cash = Math.max(0, Math.round(((+p.cash || 0) - t.rest) * 100) / 100);
            ts.shift();
            rebalPick.bond = { sell: null, buy: null, qty: null };
            rebalPick.stock = { sell: null, buy: null, qty: null };
            saveStore(); pfInvalidateCharts(p.id); ensureQuotes(true);
            rebalRepaint();
            if (currentTab === 'portfolios' && dq('pfWrap')) renderPortfolios();
            toast('Сделка отменена — портфель возвращён к состоянию до обмена');
        });
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
            else {
                if (dq('pfOverlay')) window.pfCloseOverlay();
                // ушли со вкладки — карточку раскладки закрываем (иначе гард рендера её бы
                // держал открытой при возврате), панель действий и рыночную ленту прячем
                dashEdit = false;
                var tbHost = document.getElementById('topBarPfActions');
                if (tbHost) { tbHost.style.display = 'none'; tbHost.innerHTML = ''; }
                var tbMkt = document.getElementById('topBarPfMarket');
                if (tbMkt) { tbMkt.style.display = 'none'; tbMkt.innerHTML = ''; }
                var tbLay = document.getElementById('pfLayoutBtn');
                if (tbLay) tbLay.style.display = 'none';
                var tbLaySep = document.getElementById('pfLayoutSep');
                if (tbLaySep) tbLaySep.style.display = 'none';
            }
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
