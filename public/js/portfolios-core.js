// ===== «ПОРТФЕЛИ» · ЯДРО (модуль 1/2 цепочки #pfLazySrc) =====
// Данные и расчёт вкладки: helpers, модель store/persist, дневные снимки,
// котировки MOEX ISS (акции/облигации/НКД/номиналы), исторические цены на дату,
// расписания выплат (купоны/дивиденды), calcPf, график карточки (drawPfChart).
//
// ГРУЗИТСЯ ПЕРВЫМ (ensurePortfoliosJs, webapp-tabs.js) и СОЗДАЁТ window.PF —
// общий неймспейс файлов «Портфелей». Интерфейс ядра — экспорт-блок в конце
// файла; мутабельное общее состояние (PF.store, PF.quotesTs, …) живёт ТОЛЬКО
// свойствами PF, без локальных алиасов. Функции остатка, нужные ядру в
// колбэках (PF.softRerender и др.), приходят из следующих файлов цепочки —
// к моменту любого вызова они уже определены.
(function () {
    'use strict';
    var PF = window.PF = {};

    var STORE_KEY = 'portfolios_v1';
    var CARDVIEW_KEY = 'pf_cardview_v1';
    var SNAP_KEY = 'pf_snapshots_v1';   // дневные снимки стоимости портфелей (локальный кэш, в облако не зеркалится)
    var MAX_CARDS = 4;   // лимит СОЗДАНИЯ портфелей; сетка рендерит все видимые (если их накопилось больше)
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
    // минус — типографский U+2212, как в fmtRub: в одной строке «−4 515 ₽» и
    // «-0,5%» стояли рядом двумя разными знаками, и это было видно
    function fmtPct(n) { if (n == null || !isFinite(n)) return '—';
        return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.', ',') + '%'; }
    function fmtQty(n) { return (n == null || !isFinite(n)) ? '—' : Math.round(n).toLocaleString('ru-RU'); }
    function pad2(n) { return String(n).padStart(2, '0'); }
    function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function dateFromDaysAgo(days) { var d = new Date(); d.setDate(d.getDate() - Math.round(days || 0));
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function ruDate(ds) { if (!ds) return '—'; var p = ds.split('-'); return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0]) : ds; }

    // ---------- toast ----------
    // R9.4: реализация уехала в общий window.msToast (webapp-tabs.js) — одна
    // машинерия тостов на всё приложение; имя и сигнатура прежние, act — кнопка
    // «Вернуть» (undo-паттерн). msToast гарантирован: этот модуль грузится лениво
    // ПОСЛЕ webapp-tabs.
    function toast(msg, isErr, act) { window.msToast(msg, { err: isErr, act: act }); }

    // ---------- модель / persist ----------
    function loadStore() {
        try { var o = JSON.parse(localStorage.getItem(STORE_KEY)); if (o && Array.isArray(o.items)) return o; } catch (e) {}
        return { v: 1, items: [] };
    }
    function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(PF.store)); } catch (e) {} }
    PF.store = loadStore();   // ЕДИНСТВЕННОЕ хранилище модели; реассайнится при восстановлении бэкапа — только через PF
    // вид карточки портфеля: 'normal' (вложено · доход · доходность, 2 в ряд) |
    // 'narrow' (доход · доходность, без «Вложено» — уже, 3 в ряд)
    function loadCardView() { try { return localStorage.getItem(CARDVIEW_KEY) === 'normal' ? 'normal' : 'narrow'; } catch (e) { return 'narrow'; } }
    PF.cardViewMode = loadCardView();   // меняется из pfSetCardView (файл рендера) — только через PF

    // ---------- дневные снимки стоимости (pid -> { 'ГГГГ-ММ-ДД': ₽ }) ----------
    // Пишутся при живых котировках (не чаще раза в 5 минут), хранят до 400 дней.
    // Питают чип «▲ X ₽ сегодня» в шапке карточки: изменение к последнему снимку
    // прошлых дней. Локальный кэш устройства — в облако не зеркалится.
    var snaps = (function () { try { var o = JSON.parse(localStorage.getItem(SNAP_KEY)); if (o && typeof o === 'object') return o; } catch (e) {} return {}; })();
    var snapSavedAt = 0;
    function recordSnapshots() {
        if (!PF.quotesTs) return;   // без живых цен снимок был бы ценами покупки
        if (Date.now() - snapSavedAt < 5 * 60000) return;
        snapSavedAt = Date.now();
        var today = todayStr(), changed = false;
        PF.store.items.forEach(function (p) {
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
    // Изменение стоимости за сегодня: текущая стоимость − последний снимок прошлых дней.
    // ЗАПАСНОЙ ПУТЬ — из котировок (мокап overview3, метка 6 экрана 01). Снимок
    // появляется только со второго дня наблюдения, и до него «за день» стояло
    // прочерком сразу в пяти местах — хотя дневное изменение всё это время лежало
    // в quotes[tk].chgPct (MOEX LASTTOPREVPRICE). Считаем вклад каждой бумаги:
    // при цене P и изменении k вчерашняя стоимость позиции = V / (1 + k), значит
    // сегодняшний прирост = V − V / (1 + k). Складываем по всем бумагам, у которых
    // изменение известно; если не известно ни у одной — по-прежнему null.
    function dayDeltaFromQuotes(p) {
        var sum = 0, any = false;
        (p.holdings || []).forEach(function (h) {
            if (!h.ticker) return;
            var q = quotes[h.ticker];
            if (!q || q.chgPct == null) return;
            var k = q.chgPct / 100;
            if (!(k > -0.999)) return;              // −100% и хуже: делить не на что
            var v = calcHold(h).value;
            if (!(v > 0)) return;
            sum += v - v / (1 + k);
            any = true;
        });
        return any ? sum : null;
    }
    function dayDelta(p, curValue) {
        var m = snaps[p.id];
        if (m && curValue > 0) {
            var today = todayStr(), best = null;
            for (var d in m) if (d < today && (best == null || d > best)) best = d;
            if (best != null) return curValue - m[best];
        }
        return dayDeltaFromQuotes(p);
    }
    // Откуда взялась дельта дня: 'snap' — из вчерашнего снимка, 'quotes' — из
    // дневного изменения котировок, null — неоткуда. Нужна подписям («за день»
    // против «по котировкам»), сама цифра в обоих случаях честная.
    function dayDeltaSrc(p, curValue) {
        var m = snaps[p.id];
        if (m && curValue > 0) {
            var today = todayStr(), best = null;
            for (var d in m) if (d < today && (best == null || d > best)) best = d;
            if (best != null) return 'snap';
        }
        return dayDeltaFromQuotes(p) == null ? null : 'quotes';
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

    function findPf(id) { for (var i = 0; i < PF.store.items.length; i++) if (PF.store.items[i].id === id) return PF.store.items[i]; return null; }
    // скрытые портфели (p.hidden) не показываются в сетке карточек, но продолжают
    // учитываться в суммарном капитале, сводке и календаре выплат — деньги не исчезают
    function visibleItems() { return PF.store.items.filter(function (p) { return !p.hidden; }); }
    function findHold(pf, hid) { var hs = pf.holdings || []; for (var i = 0; i < hs.length; i++) if (hs[i].id === hid) return hs[i]; return null; }
    function colorVal(c) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === c || COLORS[i].v === c) return COLORS[i].v; return c || COLORS[0].v; }

    function makePortfolio(name) {
        var used = {}; PF.store.items.forEach(function (p) { used[p.color] = 1; });
        var col = COLORS[PF.store.items.length % COLORS.length].id;
        for (var i = 0; i < COLORS.length; i++) if (!used[COLORS[i].id]) { col = COLORS[i].id; break; }
        return { id: genId('pf'), name: name || ('Портфель ' + (PF.store.items.length + 1)), color: col, createdAt: Date.now(), holdings: [], cash: 0 };
    }

    // ---------- котировки ----------
    var quotes = {};         // ticker -> { price, chgPct }
    PF.quotesTs = 0;   // время последней ПОПЫТКИ батча (по нему живёт TTL); читает и рендер — только через PF
    // Время последних РЕАЛЬНО ПРИШЕДШИХ цен. Отдельно от quotesTs намеренно: тот
    // ставится и на неудачном ответе (иначе ensureQuotes зациклился бы), поэтому
    // судить по нему о свежести чисел нельзя — MOEX мог не ответить, а штамп
    // обновиться. Этим меряет возраст табло сайдбара (PF.sbCapModel).
    PF.quotesOkTs = 0;
    PF.quotesFresh = function () { PF.quotesOkTs = Date.now(); };
    var quotesLoading = false;
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
        PF.store.items.forEach(function (p) { (p.holdings || []).forEach(function (h) {
            if (!h.ticker) return; if (h.type === 'bond') b[h.ticker] = 1; else s[h.ticker] = 1; }); });
        return { stocks: Object.keys(s), bonds: Object.keys(b) };
    }

    // fetch с повтором и экспоненциальной задержкой (устойчивость к флапам сети / 5xx MOEX)
    function fetchRetry(url, opts, tries, delay) {
        tries = tries || 3; delay = delay || 500;
        // ISS — через прокси (window.issUrl из core.js): прямой iss.moex.com у
        // части пользователей режется; не-ISS URL хелпер пропускает насквозь
        if (window.issUrl) url = window.issUrl(url);
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
            PF.quotesTs = Date.now();
            // цены действительно пришли — только теперь табло вправе считать себя свежим
            if (Object.keys(best).length) PF.quotesFresh();
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
            .then(function (r) {
                bondQuotes[isin] = (r && r.price > 0) ? r.price : 0;
                // портфель может быть чисто облигационным — тогда свежесть табло
                // держат ЭТИ цены, батча акций для него не бывает вовсе
                if (bondQuotes[isin] > 0) PF.quotesFresh();
            })
            .catch(function () { bondQuotes[isin] = 0; })
            .then(function () { bondPending[isin] = false; PF.softRerender(); });
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
            if (Object.keys(found).length) PF.quotesFresh();
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
            PF.softRerender();
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
                .then(function () { bondNkdPending[x] = false; PF.softRerender(); });
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
        // и PF.softRerender→ensureQuotes→fetch зацикливаются, подвешивая вкладку.
        if (!force && PF.quotesTs && Date.now() - PF.quotesTs < QUOTE_TTL) return;
        if (quotesLoading) return;
        quotesLoading = true;
        fetchStockQuotes().catch(function () {}).then(function () {
            quotesLoading = false; PF.quotesTs = Date.now(); PF.softRerender();
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
        if (!PF.quotesTs || quotesLoading || quotes[h.ticker]) return false;
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

    // ---------- скелетоны загрузки ----------
    // Пока живой котировки ещё нет (первая загрузка), суммы считались бы по цене
    // покупки и через секунду «прыгали» к рыночным. Вместо прыжка — скелетон-плейсхолдер
    // (.pf-skel, мерцающая плашка; стиль в portfolios-r7.css). Ре-рендер по приходу
    // котировок (PF.softRerender) сам заменяет скелетоны настоящими числами.
    function skelHtml(w, h) {
        return '<span class="pf-skel" style="width:' + w + 'px;height:' + (h || 14) + 'px"></span>';
    }
    // «данные греются»: запрос котировок в полёте и хотя бы одна бумага ещё без цены.
    // Признак самогасящийся: quotesLoading/bondPending сбрасываются по завершении fetch —
    // вечного скелетона не бывает даже при упавшей сети.
    function pfQuotesWarming() {
        var held = collectTickers();
        if (held.stocks.length && quotesLoading && !PF.quotesTs &&
            held.stocks.some(function (t) { return !quotes[t]; })) return true;
        return held.bonds.some(function (x) { return bondPending[x] && !(liveBond(x).price > 0); });
    }
    // портфель ждёт котировку: есть купленная бумага без живой цены, которую ещё ждём
    function pfCardWarming(p) {
        if (!pfQuotesWarming()) return false;
        return (p.holdings || []).some(function (h) {
            return h.ticker && aggHolding(h).qty > 0 && !isLive(h) && !quoteMissing(h);
        });
    }

    // ---------- точечные обновления живых чисел (роадмап №6) ----------
    // Разметка виджета вешает data-live="<ключ>" на МАЛЕНЬКИЙ узел с живым
    // числом, а патчер виджета (PF.livePatchers.<имя>, живёт в файле своей
    // htmlFn) на фоновом тике котировок пересчитывает значения и зовёт liveSet —
    // тот переписывает ТОЛЬКО textContent/innerHTML/класс/title узла, не
    // пересобирая родителя: фокус в полях, открытые попапы, жесты и скроллы
    // не страдают. Полный рендер остаётся за действиями пользователя и
    // структурными изменениями (состав, порядок строк, расписания выплат).
    // Обходит патчеры PF.liveUpdate (файл рендера, рядом с softRerender).
    PF.livePatchers = {};    // имя виджета -> функция точечного обновления
    var liveMap = null;      // ключ -> [узлы]; собирается на ОДИН проход liveUpdate
    var liveWrites = 0;      // счётчик реальных записей за проход (для fitBigSums)
    function liveBegin() {
        liveMap = {}; liveWrites = 0;
        // весь документ, не только #pfWrap: карточки живут и в шторке/оверлеях
        var nodes = document.querySelectorAll('[data-live]');
        Array.prototype.forEach.call(nodes, function (el) {
            var k = el.getAttribute('data-live');
            (liveMap[k] || (liveMap[k] = [])).push(el);
        });
        return nodes.length;
    }
    function liveEnd() { liveMap = null; return liveWrites; }
    // upd: { text?, html?, cls?, title? }. Каждое поле пишется только при
    // реальном изменении. html сравнивается с последней ЗАПИСАННОЙ строкой
    // (el._lv): innerHTML-геттер пересериализует разметку (&nbsp; и пр.) и
    // прямое сравнение всегда «не совпадает». title: null/'' снимает атрибут.
    function liveSet(key, upd) {
        var ns = liveMap ? (liveMap[key] || []) : document.querySelectorAll('[data-live="' + key + '"]');
        Array.prototype.forEach.call(ns, function (el) {
            if (upd.text != null && el.textContent !== upd.text) { el.textContent = upd.text; liveWrites++; }
            if (upd.html != null && el._lv !== upd.html) { el.innerHTML = upd.html; el._lv = upd.html; liveWrites++; }
            if (upd.cls != null && el.className !== upd.cls) { el.className = upd.cls; liveWrites++; }
            if ('title' in upd) {
                var t = upd.title;
                if (t == null || t === '') { if (el.hasAttribute('title')) { el.removeAttribute('title'); liveWrites++; } }
                else if (el.getAttribute('title') !== t) { el.setAttribute('title', t); liveWrites++; }
            }
        });
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
        if (quotes[ticker] && Date.now() - PF.quotesTs < QUOTE_TTL) return cb(quotes[ticker].price);
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
    // R9.3: мемоизация НА ВРЕМЯ ОДНОГО синхронного прохода renderPortfolios.
    // calcPf зовут герой, «Список портфелей», структура, сводка, карточки, календарь —
    // при 5–8 портфелях один рендер пересчитывал одни и те же составы десятки раз.
    // Кэш включает renderPortfolios (calcMemo = {}) и гасит в finally (calcMemo = null):
    // вне рендера кэша НЕТ вовсе, поэтому обработчики, меняющие лоты между рендерами,
    // всегда считают по свежим данным — окна устаревания не существует.
    var calcMemo = null;
    function calcPf(p) {
        if (calcMemo) {
            var mc = calcMemo[p.id];
            if (mc) return mc;
            return (calcMemo[p.id] = calcPfRaw(p));
        }
        return calcPfRaw(p);
    }
    function calcPfRaw(p) {
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
    // Оверлеи графика/состава на карточке снесены при переделке карточки (2026-07-22,
    // блок 1 плана PF-CARD): график живёт в герое карточки, полный состав — в подвкладке.
    var chartImoex = {};     // pid → наложена кривая индекса; переключается на подвкладке «Портфель» (PF.setBench)
    // Сравнение с индексом (IMOEX для акций, RGBI для чисто облигационного портфеля)
    // живёт на подвкладке «Портфель» — в карточке «Обзора» его нет сознательно
    // (решение по вопросу 2 плана PF-CARD). Флаг хранится в памяти сессии.
    function benchOn(pid) { return !!chartImoex[pid]; }
    function setBench(pid, on) { chartImoex[pid] = !!on; loadPfChart(pid); }
    // Режим сравнения карточки (чип на графике «Табло», 2026-07-22):
    // 'off' — только портфель; 'idx' — индекс (IMOEX, для чисто облигационного —
    // RGBI, решает pfBench); 'dep' — «Депозит»: капитализация ставки RUSFAR, как
    // линия «Депозит» вкладки «Тест». Хранится в том же chartImoex (false|true|'dep'),
    // поэтому тумблер подвкладки «Портфель» (setBench) остаётся совместим: 'dep' для
    // него «включено», выключение сбрасывает оба.
    function benchMode(pid) { return chartImoex[pid] === 'dep' ? 'dep' : (chartImoex[pid] ? 'idx' : 'off'); }
    function setBenchMode(pid, mode) { chartImoex[pid] = mode === 'dep' ? 'dep' : mode === 'idx'; loadPfChart(pid); }
    PF.chartCache = {};     // pid → { imoex, points, pfFinal, imFinal, from, err }
    PF.chartRaw = {};       // pid → { from, series } — сырая серия стоимости (кеш под toggle IMOEX)
    // pid → { bench, pct } | null — бенчмарк за ОКНО периода карточки. Считается
    // только внутри drawPfChart (перебазировка окна живёт там), а нужен подписи
    // графика карточки — она рисуется вне графика (раунд 4, .pfc-gcap).
    PF.chartBench = {};
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
        var mode = benchMode(pid);
        var wantImoex = mode !== 'off';
        // «Депозит» — не индекс цен, а капитализация ставки RUSFAR (формула линии
        // «Депозит» вкладки «Тест», btAttachDeposit); код бенчмарка в кеше — RUSFAR
        var bench = mode === 'dep'
            ? { code: 'RUSFAR', label: 'Депозит', full: 'депозит по ставке RUSFAR' }
            : pfBench(p);
        var cached = PF.chartCache[pid];
        if (cached && cached.imoex === wantImoex && (!wantImoex || cached.bench === bench.code) && !cached.err) { repaintCharts(pid); return; }
        if (chartBusy[pid]) return;
        if (typeof btBuildPortfolioSeries !== 'function') { PF.chartCache[pid] = { imoex: wantImoex, err: 'NO_BT' }; repaintCharts(pid); return; }
        var assets = pfChartAssets(p);
        if (!assets.bonds.length && !assets.stocks.length) { PF.chartCache[pid] = { imoex: wantImoex, err: 'NO_ASSETS' }; repaintCharts(pid); return; }
        var fromStr = dateToIso(pfFirstBuyDate(p)), tillStr = todayStr();
        chartBusy[pid] = true; repaintCharts(pid);   // показываем индикатор загрузки
        var raw = PF.chartRaw[pid];
        var pfPromise = (raw && raw.from === fromStr && raw.series)
            ? Promise.resolve(raw.series)
            : btBuildPortfolioSeries(assets, fromStr, tillStr).then(function (s) { PF.chartRaw[pid] = { from: fromStr, series: s }; return s; });
        pfPromise.then(function (pfSeries) {
            if (!pfSeries || pfSeries.length < 2) throw new Error('NO_PF');
            if (mode === 'idx' && typeof btFetchHistorySeries === 'function' && typeof btAlignReturns === 'function') {
                return btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/' + bench.code + '.json', fromStr, tillStr).then(function (im) {
                    var al = im && im.length ? btAlignReturns(pfSeries, im) : null;
                    return (al && al.points.length >= 2) ? { points: al.points, pfFinal: al.pfFinal, imFinal: al.imFinal } : pfOnlyPoints(pfSeries);
                });
            }
            if (mode === 'dep' && typeof btFetchHistorySeries === 'function') {
                return btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/RUSFAR.json', fromStr, tillStr).then(function (rates) {
                    var res0 = pfOnlyPoints(pfSeries);
                    if (rates && rates.length >= 2) {
                        // капитализация дневной ставки по календарным дням (btAttachDeposit,
                        // вкладка «Тест»); результат кладём в тот же канал .im — рисовалка
                        // и перебазировка окна периода работают без изменений
                        var pts0 = res0.points, ri = 0, rate = null, factor = 1, prevD = null;
                        for (var i = 0; i < pts0.length; i++) {
                            var dd = pts0[i].d;
                            while (ri < rates.length && rates[ri].d <= dd) { rate = rates[ri].c; ri++; }
                            if (prevD !== null && rate !== null) {
                                var days = Math.round((new Date(dd) - new Date(prevD)) / 86400000);
                                if (days > 0) factor *= Math.pow(1 + rate / 100, days / 365);
                            }
                            pts0[i].im = (factor - 1) * 100;
                            prevD = dd;
                        }
                        res0.imFinal = pts0[pts0.length - 1].im;
                    }
                    return res0;
                });
            }
            return pfOnlyPoints(pfSeries);
        }).then(function (res) {
            res.imoex = wantImoex; res.bench = bench.code; res.from = fromStr; PF.chartCache[pid] = res;
        }, function (e) {
            PF.chartCache[pid] = { imoex: wantImoex, bench: bench.code, from: fromStr, err: (e && e.message) || 'ERR' };
        }).then(function () {
            chartBusy[pid] = false; repaintCharts(pid);
        });
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
        var p = PF.store.items.find(function (x) { return x.id === pid; });
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
    // fromDate (опционально, ISO) — окно периода карточки: точки до даты отбрасываются,
    // остальные ПЕРЕБАЗИРУЮТСЯ к началу окна (кривая = доходность за период, согласована
    // с дельтой в герое карточки), живой процент последней точки перебазируется так же.
    // ex (опционально, «Табло» 2026-07-22) — оверлеи карточного мини-графика:
    //   { card:true,                          — флажки экстремумов в ₽ + пульс «сейчас»
    //     pays:[{d,sum,n,lbl}],               — метки выплат на линии (cardPayMarks)
    //     future:{d,days,sum,lbl} }           — ближайшая выплата: пунктир вперёд по оси
    // Прочие пейны (подвкладка «Портфель», «Капитал») ex не передают и не меняются.
    function drawPfChart(pid, wrap, dynEl, legEl, uid, maxPts, fromDate, ex) {
        if (!wrap) return;
        var data = PF.chartCache[pid];
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
        var rebase = 0;
        if (fromDate) {
            var wnd = raw.filter(function (q) { return q.d >= fromDate; });
            if (wnd.length >= 2) {
                rebase = wnd[0].pf;
                var imBase = wnd[0].im;
                raw = wnd.map(function (q) { return { d: q.d, pf: q.pf - rebase,
                    im: (q.im != null && imBase != null) ? q.im - imBase : q.im }; });
                pts = raw;
            }
        }
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
        if (livePct != null) livePct -= rebase;   // окно периода: живой % в системе окна
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
        // под будущую выплату серия ужимается до 86% ширины: хвост оси отдаётся
        // пунктиру «от сейчас до даты выплаты» (мокап «Табло»)
        var xSpan = (100 - 2 * padX) * (ex && ex.future ? 0.86 : 1);
        var xAt = function (i) { return padX + (N === 1 ? 0 : (i / (N - 1))) * xSpan; };
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
        // пунктир будущей выплаты — горизонталь от последней точки до правого поля
        // (полая точка и подпись — DOM-оверлеи ниже: круг в svg 100×100 с
        // preserveAspectRatio:none растянулся бы в эллипс)
        var futX = 100 - padX - 1;
        var futLine = (ex && ex.future && N > 1)
            ? '<line class="pfcv-futline" x1="' + pPts[N - 1].x.toFixed(2) + '" y1="' + pPts[N - 1].y.toFixed(2) +
              '" x2="' + futX + '" y2="' + pPts[N - 1].y.toFixed(2) + '" vector-effect="non-scaling-stroke"/>'
            : '';
        // Деления шкалы считаем ДО svg: подписям нужны линии, иначе «−5%» и «−10%»
        // висят у левого края и не указывают ни на что (замечание 2026-07-30).
        // В маленькой карточке делений меньше — на кривой 100px четыре не читаются.
        var tickVals = niceTicks(minV, maxV, (ex && ex.size === 's') ? 2 : 4);
        var grid = tickVals.map(function (v) {
            if (v === 0) return '';   // ноль рисует своя, более заметная .pfcv-zero
            var gy = yAt(v).toFixed(2);
            return '<line class="pfcv-grid" x1="0" y1="' + gy + '" x2="100" y2="' + gy + '"/>';
        }).join('');
        var svg = '<svg class="pfcv-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
            '<defs><linearGradient id="pfcvGrad-' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="var(--pf-accent)" stop-opacity="0.34"/>' +
            '<stop offset="1" stop-color="var(--pf-accent)" stop-opacity="0"/></linearGradient></defs>' + grid +
            '<line class="pfcv-zero" x1="0" y1="' + zeroY.toFixed(2) + '" x2="100" y2="' + zeroY.toFixed(2) + '"/>' +
            '<path class="pfcv-area" d="' + area + '" fill="url(#pfcvGrad-' + uid + ')"/>' + imLine + futLine +
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
        // ---- оверлеи «Табло» (только карточный мини-график, ex.card) ----
        var exHtml = '';
        if (ex && ex.card && N > 1) {
            // Раунд 4: полотно графика чистое во всех размерах, кроме L. Флажки
            // экстремумов и подписи выплат перекрывали бы кривую 104–138px в S и M
            // (мокап pf-card3, экран 00); точки выплат и пульс остаются везде.
            var big = ex.size === 'l';
            // флажки экстремумов: ₽ на дату — стоимость БУМАГ из chartRaw (без свободных
            // денег: их истории в серии нет — названное отступление плана). Если серия
            // прорежена и точной даты нет — флажок честно пропускаем.
            var exSeries = (PF.chartRaw[pid] || {}).series || null;
            var rubAt = function (d) {
                if (!exSeries) return null;
                for (var k = 0; k < exSeries.length; k++) if (exSeries[k].d === d) return exSeries[k].c;
                return null;
            };
            var iMax = 0, iMin = 0;
            pPts.forEach(function (q, k) { if (q.v > pPts[iMax].v) iMax = k; if (q.v < pPts[iMin].v) iMin = k; });
            if (big && iMax !== iMin) [[iMax, 'max'], [iMin, 'min']].forEach(function (fx) {
                var q = pPts[fx[0]], rubV = rubAt(q.d);
                if (rubV == null) return;
                var edge = q.x > 80 ? ' r' : q.x < 20 ? ' l' : '';
                exHtml += '<span class="pfcv-ext ' + fx[1] + edge + '" style="left:' + q.x.toFixed(2) + '%;top:' + q.y.toFixed(2) + '%">' +
                    '<span data-money>' + fmtRub(rubV) + '</span> · ' + ruShortDate(q.d) + '</span>';
            });
            // метки выплат: дата → последняя точка кривой не позже даты; близкие метки
            // (< 7 единиц вьюбокса) склеиваются в «N выплат · сумма», подписи чередуются
            // над/под линией, чтобы при плотном расписании не слипаться
            if (ex.pays && ex.pays.length) {
                var marks = [];
                ex.pays.forEach(function (pm) {
                    var bi = 0;
                    for (var k2 = 0; k2 < pts.length; k2++) if (pts[k2].d <= pm.d) bi = k2;
                    var q2 = pPts[bi], prev = marks[marks.length - 1];
                    if (prev && q2.x - prev.x < 7) { prev.sum += pm.sum; prev.n += pm.n; }
                    else marks.push({ x: q2.x, y: q2.y, sum: pm.sum, n: pm.n, lbl: pm.lbl });
                });
                marks.forEach(function (m, mi) {
                    var txt = m.n > 1
                        ? m.n + ' ' + (PF.plural ? PF.plural(m.n, 'выплата', 'выплаты', 'выплат') : 'выплаты')
                        : m.lbl;
                    exHtml += '<span class="pfcv-pay' + (mi % 2 ? ' up' : '') + '" style="left:' + m.x.toFixed(2) + '%;top:' + m.y.toFixed(2) + '%"' +
                        (big ? '' : ' title="' + attr(txt + ' · +' + fmtRub(m.sum)) + '"') + '>' +
                        (big ? '<b>' + txt + ' · <span data-money>+' + fmtRub(m.sum) + '</span></b>' : '') + '</span>';
                });
            }
            // Ближайшая выплата: на полотне остаются только пунктир и ПОЛАЯ ТОЧКА.
            // Трёхстрочный столбик .pfcv-futlbl убран (раунд 4): он перекрывал кривую,
            // спорил с подсказкой пульса и гас на ховере — сам этот костыль и был
            // признаком, что элемент стоит не на своём месте. Текст выплаты переехал
            // в подпись графика под кривой (.pfc-gcap в portfolios-cards.js).
            if (ex.future) {
                exHtml += '<span class="pfcv-payf" style="left:' + futX + '%;top:' + pPts[N - 1].y.toFixed(2) + '%"' +
                    ' title="' + attr(ex.future.lbl + ' · через ' + ex.future.days + ' ' +
                        (PF.plural ? PF.plural(ex.future.days, 'день', 'дня', 'дней') : 'дн.') +
                        ' · +' + fmtRub(ex.future.sum)) + '"></span>';
            }
            // пульс «сейчас» — карточка живая, а не нарисованная
            exHtml += '<span class="pfcv-pulse" style="left:' + pPts[N - 1].x.toFixed(2) + '%;top:' + pPts[N - 1].y.toFixed(2) + '%"></span>';
            // Чип сравнения .pfcv-benchchip с полотна тоже убран (раунд 4) — он был
            // единственным элементом карточки с рамкой поверх контента и стоял ровно
            // там, куда заходит кривая растущего портфеля. Кнопка переехала в подпись
            // графика; сюда кладём только ЧИСЛО бенчмарка за ОКНО периода, которое
            // считается здесь и больше нигде: pts[N−1].im — последняя точка
            // перебазированной серии, а не глобальный data.imFinal.
            PF.chartBench[pid] = showIm
                ? { bench: data.bench || 'IMOEX', pct: (pts[N - 1].im != null && isFinite(pts[N - 1].im)) ? pts[N - 1].im : null }
                : null;
        }
        // шкала процентов слева: те же деления, что у линий сетки выше
        var yaxis = tickVals.map(function (v) {
            var lbl = (Math.round(v) === v) ? String(v) : v.toFixed(1);
            return '<span class="pfcv-ytick' + (v === 0 ? ' zero' : '') + '" style="top:' + yAt(v).toFixed(2) + '%">' + lbl + '%</span>';
        }).join('');
        wrap.innerHTML = '<div class="pfcv-yaxis">' + yaxis + '</div><div class="pfcv-plot">' + svg + overlay + exHtml + '</div>';
        // анимация прорисовки линии (и индекса) — линия «рисуется» слева направо.
        // При ре-рендере из переключателей видимости/вида (PF.noChartAnim, см. renderNoAnim)
        // пропускаем: график сразу в конечном состоянии, вкладка не мерцает.
        if (!PF.noChartAnim) {
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
            // Легенда нужна там, где кривых может быть ДВЕ, — на подвкладке «Портфель»
            // (сравнение с бенчмарком). Мини-график карточки её не запрашивает вовсе
            // (legEl не передаётся): там одна кривая, и её процент уже стоит в герое.
            var pf = dispFinal;
            var lgh = '<span class="pfcv-lgi"><i style="background:var(--pf-accent)"></i>Портфель <b class="' + (pf >= 0 ? 'pos' : 'neg') + '">' + (pf >= 0 ? '+' : '') + pf.toFixed(1) + '%</b></span>';
            if (showIm && data.imFinal != null) {
                var im = data.imFinal;
                lgh += '<span class="pfcv-lgi"><i class="pfcv-imdot"></i>' + (data.bench === 'RGBI' ? 'RGBI ' : 'IMOEX ') +
                    '<b class="' + (im >= 0 ? 'pos' : 'neg') + '">' + (im >= 0 ? '+' : '') + im.toFixed(1) + '%</b></span>';
            }
            legEl.innerHTML = lgh;
        }
    }
    // Перерисовка графиков портфеля после прихода серии: мини-график в герое карточки
    // и виджет «График капитала». Большой пейн графика-оверлея снесён вместе с оверлеями
    // карточки (переделка 2026-07-22); сравнение с индексом переедет в подвкладку «Портфель».
    // серия пришла/пересчиталась — дорисовываем все её пейны: мини-график в герое
    // карточки, кривую подвкладки «Портфель» (с бенчмарком) и виджет «Капитал»
    function repaintCharts(pid) {
        PF.paintPfChartMini(pid);
        drawPfChart(pid, dq('pfcvChart-' + pid), null, dq('pfcvLeg-' + pid), pid + 'p');
        PF.pfdCapMaybeRepaint();
    }
    // Есть ли в портфеле облигации. Если нет — колонки НКД показывать незачем:
    // они дают тринадцатую и десятую колонку с прочерком в каждой строке, из-за
    // чего «Стоимость», «Доход» и «Изменение» уезжали за правый край панели, и
    // раскрытие выглядело обрезанным.
    function pfHasBonds(c) {
        return (c.hs || []).some(function (x) { return x.h.type === 'bond'; });
    }
    // строки состава для таблицы большой карточки (переиспользуются разворотом и графиком)
    function pfHoldsRowsHtml(c) {
        var nkd = pfHasBonds(c);
        if (!c.hs.length) return '<tr><td colspan="' + (nkd ? 13 : 11) + '" class="pfo-empty">Состав портфеля пуст</td></tr>';
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
                (nkd ? '<td class="pfo-nkdcol' + (isB ? '' : ' muted') + '"' + (isB ? ' title="НКД на дату покупки (взвеш. по лотам)"' : '') + '>' + (isB ? fmtPrice(cc.nkd || 0) : '—') + '</td>' : '') +
                '<td>' + (cc.qty || 0) + '</td>' +
                '<td>' + fmtRub(cc.invested) + '</td>' +
                '<td class="' + (cc.live ? 'pfo-live' : '') + '"' + (noQ ? ' title="' + attr(noQ.tip) + '"' : ptip) + '>' + (noQ ? noQ.txt : fmtPrice(cc.cur)) + '</td>' +
                (nkd ? '<td class="pfo-nkdcol' + (isB ? '' : ' muted') + '"' + (isB ? ' title="Текущий накопленный купонный доход — НКД сейчас (MOEX)"' : '') + '>' + (isB ? (nkdNow != null ? fmtPrice(nkdNow) : '—') : '—') + '</td>' : '') +
                '<td>' + fmtRub(cc.value) + '</td>' +
                '<td class="' + (cc.pnl >= 0 ? 'pos' : 'neg') + '">' + fmtRub(cc.pnl) + '</td>' +
                '<td class="' + (!hasInv || noQ ? '' : (cc.pnlPct >= 0 ? 'pos' : 'neg')) + '">' + (!hasInv || noQ ? '—' : fmtPct(cc.pnlPct)) + '</td>' +
            '</tr>';
        }).join('');
    }
    function pfHoldsTableHtml(c) {
        var nkd = pfHasBonds(c);
        return '<div class="pfo-tablewrap"><table class="pfo-table"><thead><tr>' +
            '<th class="pfo-c-rk">#</th><th class="pfo-c-as">Актив</th><th class="pfo-c-tp">Тип</th><th>Дата покупки</th><th>Цена покупки</th>' +
            (nkd ? '<th>НКД покупки</th>' : '') +
            '<th>Кол-во</th><th>Вложено</th><th>Цена сейчас</th>' +
            (nkd ? '<th>НКД сейчас</th>' : '') +
            '<th>Стоимость</th><th>Доход</th><th>Изменение</th>' +
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
                nkd: 0, priceFromApi: false, nkdFromApi: false, potAtBuy: type === 'stock' ? PF.potentialOf(x.ticker) : null };
        }
        var holds = [];
        if (filter !== 'stock') (sl.bonds || []).forEach(function (b) { if (b.ticker) holds.push(toHold(b, 'bond')); });
        if (filter !== 'bond') (sl.stocks || []).forEach(function (s) { if (s.ticker) holds.push(toHold(s, 'stock')); });
        return holds.length ? holds : null;
    }
    // Избранные акции (звёздочки в «Рынок · Акции») → позиции с кол-вом 0
    function getFavComposition() {
        var favs = (typeof window.stkGetFavorites === 'function') ? window.stkGetFavorites() : PF.favTickers();
        if (!favs || !favs.length) return null;
        var holds = favs.map(function (tk) {
            var co = (typeof window.stkFindCompany === 'function') ? window.stkFindCompany(tk) : null;
            var price = 0;
            if (co && co.main) { var pp = toNum(co.main['Текущая Цена']); if (isFinite(pp) && pp > 0) price = Math.round(pp * 100) / 100; }
            return { id: genId('h'), ticker: tk, name: (co && co.name) ? co.name : tk, type: 'stock',
                buyDate: todayStr(), buyPrice: price, qty: 0, nkd: 0, priceFromApi: false, nkdFromApi: false, potAtBuy: PF.potentialOf(tk) };
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
                        PF.softRerender(); pumpSchedQueue();
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


    // ==================================================================
    //  ИНТЕРФЕЙС ЯДРА (window.PF)
    // ==================================================================
    // Всё, чем пользуются остальные файлы цепочки. Мутабельное общее
    // состояние объявлено выше сразу свойствами PF (store, quotesTs,
    // cardViewMode, chartCache, chartRaw, noChartAnim) — на него алиасы ЗАПРЕЩЕНЫ.
    // — помощники —
    PF.dq = dq; PF.esc = esc; PF.attr = attr; PF.jsArg = jsArg; PF.toNum = toNum;
    PF.genId = genId; PF.clamp = clamp; PF.fmtRub = fmtRub; PF.fmtPrice = fmtPrice; PF.fmtPct = fmtPct;
    PF.fmtQty = fmtQty; PF.pad2 = pad2; PF.todayStr = todayStr; PF.ruDate = ruDate; PF.toast = toast;
    // — константы —
    PF.MAX_CARDS = MAX_CARDS; PF.COLORS = COLORS; PF.BOND_PRICE_TIP = BOND_PRICE_TIP; PF.CARDVIEW_KEY = CARDVIEW_KEY; PF.CHART_WARN_SVG = CHART_WARN_SVG;
    // — модель и расчёт —
    PF.saveStore = saveStore; PF.makePortfolio = makePortfolio; PF.findPf = findPf; PF.findHold = findHold; PF.visibleItems = visibleItems;
    PF.colorVal = colorVal; PF.ensureLots = ensureLots; PF.aggHolding = aggHolding; PF.calcHold = calcHold; PF.calcPf = calcPf;
    PF.dayDelta = dayDelta; PF.dayDeltaSrc = dayDeltaSrc; PF.topMover = topMover; PF.recordSnapshots = recordSnapshots; PF.snaps = snaps;
    PF.pfAllBoughtToday = pfAllBoughtToday; PF.quoteMissing = quoteMissing;
    // — котировки —
    PF.quotes = quotes; PF.ensureQuotes = ensureQuotes; PF.liveBond = liveBond; PF.bondFace = bondFace; PF.bondQuotes = bondQuotes;
    PF.bondNkdNow = bondNkdNow; PF.pfQuotesWarming = pfQuotesWarming; PF.pfCardWarming = pfCardWarming; PF.skelHtml = skelHtml; PF.noQuoteCell = noQuoteCell;
    // — точечные обновления живых чисел (роадмап №6) —
    PF.liveBegin = liveBegin; PF.liveEnd = liveEnd; PF.liveSet = liveSet;
    // — график карточки —
    PF.dateToIso = dateToIso; PF.niceTicks = niceTicks; PF.pfBench = pfBench; PF.loadPfChart = loadPfChart; PF.drawPfChart = drawPfChart;
    PF.pfFirstBuyDate = pfFirstBuyDate; PF.chartBusy = chartBusy; PF.benchOn = benchOn; PF.setBench = setBench;
    PF.benchMode = benchMode; PF.setBenchMode = setBenchMode;
    // — составы для импорта —
    PF.getCalcComposition = getCalcComposition; PF.getFavComposition = getFavComposition; PF.getMonthlyComposition = getMonthlyComposition; PF.compositionFrom = compositionFrom; PF.importName = importName;
    PF.fullBondId = fullBondId;
    // — история цен и облигации —
    PF.lookupHistPrice = lookupHistPrice; PF.lookupHistNkd = lookupHistNkd; PF.bondDetail = bondDetail; PF.parseBondDate = parseBondDate;
    // — расписания выплат —
    PF.coupSched = coupSched; PF.divSched = divSched; PF.ensureSchedule = ensureSchedule; PF.qtyAtDate = qtyAtDate; PF.pfPayouts = pfPayouts;
    PF.pfParseAnyDate = pfParseAnyDate;
    // кэш calcPf живёт ровно один синхронный проход рендера — скобки
    // выставляет renderPortfolios (файл рендера)
    PF.calcMemoBegin = function () { calcMemo = {}; };
    PF.calcMemoEnd = function () { calcMemo = null; };
})();
