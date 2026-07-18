// ===== «ПОРТФЕЛИ» · КАРТОЧКА-ПОРТФЕЛЬ ИЗ Т-ИНВЕСТИЦИЙ (роадмап №10) =====
// Авто-импорт брокерского счёта в ОДНУ выделенную карточку. Модель — «обычный
// портфель с флагом»: item в portfolios_v1 + p.broker = { acc, name, tail,
// sandbox, ts, extra }, поэтому карточка, аналитика, сводка, выплаты, виджеты,
// sums-privacy, роутинг #pf-<id> и cloud-sync работают без спец-кейсов.
//
// Позиции — из GetPortfolio (js/broker-api.js через воркер-прокси; хватает
// scope «только чтение»). В состав идут только share/bond с тикером из
// resolveInstruments; у облигаций тикер Т-Банка = MOEX SECID, гвард — трекер
// умеет её оценить (fetchBondData вернула цену >0). Всё прочее (фонды, валюта,
// фьючерсы, золото, нерасзолвленное) — счётчиком «вне трекера» в тихой строке.
//
// Повторный синк — ЗАМЕЩАЮЩИЙ снапшот со стабильностью: у известных тикеров
// сохраняются h.id и buyDate/НКД первого появления, обновляются только
// qty/buyPrice; исчезнувшие позиции уходят, новые приходят. Если состав
// фактически не изменился — store НЕ трогаем (не дёргаем cloud-sync/рендер).
// Ручная правка такого портфеля выключена (read-only гарды в
// portfolios-cards.js) — её затёр бы следующий снапшот.
//
// ЭТАП 2 (реальная история сделок) — второй, РЕДКИЙ источник поверх первого:
// GetOperations разбирается в настоящие лоты (дата, цена и комиссия каждой
// покупки) и в записи продаж для журнала «История операций». Разделение
// ответственности жёсткое: количество бумаг ВСЕГДА берётся из GetPortfolio
// (единственная истина), история операций лишь объясняет, из чего это
// количество сложилось. Поэтому все известные дефекты метода — молчаливое
// усечение до последней тысячи операций, амортизация облигаций, сплиты,
// неоднозначность «штуки или лоты» в документации — сводятся к одному
// штатному исходу: реальные лоты на то, что удалось восстановить, плюс
// уравнивающий лот на остаток (см. fitLots). Синк истории идёт не по
// таймеру, а по событию: карточка создана, состав разошёлся с историей,
// или пользователь нажал «Обновить историю».
//
// Триггеры синка: цикл рендера вкладки (PF.brokerPfSync из renderPortfolios,
// троттл 60с по паттерну brokerCache виджета), кнопка «Обновить» на бейдже,
// событие broker-conn-change. Ошибки тихие, бэкофф 60с. Токен живёт только на
// устройстве подключения: на другом устройстве карточка показывает последний
// снапшот из облака с подписью «синк недоступен» — это штатно, не ошибка.
(function () {
    'use strict';
    var PF = window.PF;
    var dq = PF.dq, esc = PF.esc, attr = PF.attr, genId = PF.genId, toast = PF.toast;
    var fmtRub = PF.fmtRub, todayStr = PF.todayStr, saveStore = PF.saveStore, makePortfolio = PF.makePortfolio;
    var findPf = PF.findPf, MAX_CARDS = PF.MAX_CARDS, ensureQuotes = PF.ensureQuotes, aggHolding = PF.aggHolding;
    var ensureLots = PF.ensureLots, potentialOf = PF.potentialOf, pfConfirm = PF.pfConfirm, pfxDropPfTab = PF.pfxDropPfTab;
    var pad2 = PF.pad2, coupSched = PF.coupSched, ensureSchedule = PF.ensureSchedule, fullBondId = PF.fullBondId;
    // PF.softRerender / PF.renderPortfolios / PF.plural / PF.closeImpMenus часть —
    // из ПОЗЖЕ загружаемого portfolios.js: только через PF.* в момент вызова.

    // тот же контур банка, что у виджета «Позиции у брокера» (BRK_BANK_SVG)
    var BANK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/></svg>';
    var RELOAD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg>';
    var WARN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

    // ---------- состояние синка (память вкладки, в store не пишется) ----------
    // ts — свежий успешный синк ЭТОГО устройства: бейдж показывает его, а
    // p.broker.ts (персистентное время) обновляется только при фактической
    // записи снапшота; extra — «вне трекера» по последнему ответу брокера;
    // backoffTs — тихий бэкофф после ошибки (паттерн brokerCache виджета).
    var live = { ts: 0, busy: false, creating: false, extra: null, backoffTs: 0, rows: null };

    function brokerPf() {
        var items = PF.store.items;
        for (var i = 0; i < items.length; i++) if (items[i].broker) return items[i];
        return null;
    }
    // «живое» подключение = синк возможен прямо сейчас, без вопросов к пользователю
    function connAlive() {
        var A = window.brokerApi;
        if (!A) return null;
        var c = A.getConn();
        if (!c || c.state === 'revoked' || A.isLocked() || A.isSessionGone()) return null;
        return c;
    }
    // ...и оно ведёт К ТОМУ ЖЕ счёту, что записан в карточке. Подключение можно
    // сменить на другой счёт того же токена или переключиться в песочницу — без
    // этой сверки карточка молча продолжила бы наполняться ЧУЖИМИ позициями,
    // подмешивая их к уже разобранной истории первого счёта.
    function connFor(p) {
        var c = connAlive();
        if (!c || !p || !p.broker) return null;
        return (!p.broker.acc || c.accountId === p.broker.acc) ? c : null;
    }
    function timeStr(ts) {
        if (!ts) return '—';
        try { return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; }
    }
    function dateTimeStr(ts) {
        if (!ts) return '';
        try { return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
    }

    // ---------- GetPortfolio → снапшот ----------
    // rows: {ticker, name, type, qty, buyPrice, nkdNow} только для share/bond;
    // cash — рубли totalAmountCurrencies; extra — {n, sum} прочих позиций по
    // ценам брокера (null, если таких нет).
    function fetchSnapshot() {
        var A = window.brokerApi;
        return A.getPortfolio().then(function (pf) {
            var poss = (pf.positions || []).filter(function (p) { return A.q2n(p.quantity) > 0; });
            return A.resolveInstruments(poss).then(function (cache) {
                var rows = [], extraN = 0, extraSum = 0, bondChecks = [];
                poss.forEach(function (p) {
                    var type = p.instrumentType || '';
                    var qty = A.q2n(p.quantity);
                    var val = A.q2n(p.currentPrice) * qty;
                    // рублёвый остаток приходит и валютной позицией — он уже
                    // учтён в p.cash (totalAmountCurrencies), не дублируем
                    if (type === 'currency' && (p.figi === 'RUB000UTSTOM' || !p.figi)) return;
                    var ins = cache[p.instrumentUid || p.figi] || {};
                    // noRub — цена позиции не в рублях: считаем такую бумагу
                    // штукой, но НЕ прибавляем к рублёвой сумме (курса у нас
                    // нет, а сложить доллары с рублями — соврать в строке)
                    function toExtra(noRub) { extraN++; if (!noRub) extraSum += val; }
                    // не share/bond или тикер ещё не расзолвлен (кэш добирает по
                    // 25 за проход — подтянется следующим синком) → «вне трекера»
                    if ((type !== 'share' && type !== 'bond') || !ins.ticker) { toExtra(); return; }
                    // Бумага торгуется не в рублях: её цена придёт в своей
                    // валюте, а весь трекер считает рублями — принять доллары
                    // за рубли значит соврать в капитале карточки. Такая бумага
                    // честнее выглядит счётчиком «вне трекера».
                    var pcur = p.averagePositionPrice && p.averagePositionPrice.currency;
                    if (pcur && String(pcur).toLowerCase() !== 'rub') { toExtra(true); return; }
                    var row = { ticker: ins.ticker, name: ins.name || ins.ticker,
                        type: type === 'bond' ? 'bond' : 'stock', qty: qty,
                        // у облигаций averagePositionPrice — рублёвая ЧИСТАЯ цена,
                        // единицы совпадают с трекером (котировки MOEX тоже чистые)
                        buyPrice: Math.round(A.q2n(p.averagePositionPrice) * 100) / 100,
                        nkdNow: Math.round(A.q2n(p.currentNkd) * 100) / 100 };
                    if (row.type === 'bond') {
                        if (typeof fetchBondData !== 'function') { toExtra(); return; }
                        // гвард: трекер умеет оценить бумагу (иначе она висела бы
                        // в составе вечным «…» без цены)
                        bondChecks.push(Promise.resolve(fetchBondData(row.ticker)).then(function (r) {
                            if (r && r.price > 0) {
                                if (!(row.nkdNow > 0) && r.nkd > 0) row.nkdNow = Math.round(r.nkd * 100) / 100;
                                rows.push(row);
                            } else toExtra();
                        }, toExtra));
                        return;
                    }
                    rows.push(row);
                });
                return Promise.all(bondChecks).then(function () {
                    // стабильный порядок (гварды облигаций асинхронные): сравнение
                    // и хранение не зависят от того, чей fetch ответил первым
                    rows.sort(function (a, b) {
                        return a.type === b.type ? (a.ticker < b.ticker ? -1 : 1) : (a.type === 'stock' ? -1 : 1);
                    });
                    return { rows: rows, cash: Math.round(A.q2n(pf.totalAmountCurrencies) * 100) / 100,
                        extra: extraN ? { n: extraN, sum: Math.round(extraSum) } : null };
                });
            });
        });
    }

    // ---------- лоты: сумма количеств и FIFO-списание ----------
    function lotsQty(h) {
        var q = 0;
        ensureLots(h).forEach(function (l) { q += +l.qty || 0; });
        return Math.round(q * 1e6) / 1e6;
    }
    // Списываем qty со СТАРЫХ лотов (FIFO — как pfReduceHolding в
    // portfolios-trades.js): опустевшие лоты уходят, но хотя бы один остаётся.
    function fifoReduce(h, qty) {
        var lots = ensureLots(h).slice().sort(function (a, b) {
            return String(a.buyDate || '').localeCompare(String(b.buyDate || ''));
        });
        var left = qty;
        lots.forEach(function (l) {
            if (left <= 0) return;
            var q = +l.qty || 0, take = Math.min(q, left);
            l.qty = Math.round((q - take) * 1e6) / 1e6; left -= take;
        });
        var rest = ensureLots(h).filter(function (l) { return (+l.qty || 0) > 0; });
        if (rest.length) h.lots = rest;
    }

    // ---------- замещающий снапшот со стабильностью ----------
    // У известных тикеров сохраняем h.id (живые ссылки виджетов/графиков) и
    // buyDate/НКД лота первого появления, обновляем только qty/buyPrice;
    // исчезнувшие удаляем, новые добавляем одним лотом «на сегодня».
    // Возвращает true, если store фактически изменился (тогда и пишем).
    function applySnapshot(p, snap) {
        var changed = false;
        var byKey = {};
        (p.holdings || []).forEach(function (h) { byKey[h.type + ':' + h.ticker] = h; });
        var next = snap.rows.map(function (r) {
            var h = byKey[r.type + ':' + r.ticker];
            if (h) {
                if (r.name && h.name !== r.name) { h.name = r.name; changed = true; }
                // Холдинг с разобранной историей (этап 2): его лоты — реальные
                // сделки, перезаписывать их снапшотом нельзя. Количество из
                // GetPortfolio всё равно остаётся истиной: разошлось (докупка
                // или продажа после последнего разбора) — сводим уравнивающим
                // лотом и помечаем холдинг к пересборке истории.
                if (h.ops) {
                    var diff = Math.round((r.qty - lotsQty(h)) * 1e6) / 1e6;
                    if (Math.abs(diff) > 1e-9) {
                        if (diff > 0) ensureLots(h).push({ id: genId('l'), buyDate: todayStr(),
                            buyPrice: r.buyPrice, qty: diff, nkd: r.type === 'bond' ? (r.nkdNow || 0) : 0,
                            priceFromApi: true, nkdFromApi: true, opKey: BAL_KEY });
                        else fifoReduce(h, -diff);
                        h.opsGap = true;
                        changed = true;
                    }
                    return h;
                }
                var lots = ensureLots(h);
                if (lots.length > 1) { h.lots = [lots[0]]; changed = true; }   // инвариант: один лот
                var l = h.lots[0];
                if (Math.abs((+l.qty || 0) - r.qty) > 1e-9) { l.qty = r.qty; changed = true; }
                if (Math.abs((+l.buyPrice || 0) - r.buyPrice) > 0.005) { l.buyPrice = r.buyPrice; changed = true; }
                return h;
            }
            changed = true;
            return { id: genId('h'), ticker: r.ticker, name: r.name || r.ticker, type: r.type,
                lots: [{ id: genId('l'), buyDate: todayStr(), buyPrice: r.buyPrice, qty: r.qty,
                    nkd: r.type === 'bond' ? (r.nkdNow || 0) : 0, priceFromApi: true, nkdFromApi: true }],
                potAtBuy: r.type === 'stock' && typeof potentialOf === 'function' ? potentialOf(r.ticker) : null };
        });
        if (next.length !== (p.holdings || []).length) changed = true;
        p.holdings = next;
        if (Math.abs((+p.cash || 0) - snap.cash) > 0.005) { p.cash = snap.cash; changed = true; }
        if (changed) {
            p.broker.ts = Date.now();
            p.broker.extra = snap.extra;
            saveStore();
            PF.pfInvalidateCharts(p.id);
        }
        return changed;
    }

    // ====================================================================
    //  ЭТАП 2 · РЕАЛЬНАЯ ИСТОРИЯ СДЕЛОК ИЗ GetOperations
    // ====================================================================
    // Что делает: превращает историю операций счёта в настоящие лоты (дата,
    // цена, комиссия каждой покупки) и в записи продаж для журнала.
    // Чего сознательно НЕ делает: не решает, сколько у пользователя бумаг —
    // это остаётся за GetPortfolio. Такое разделение и делает разбор
    // безопасным при любых дефектах истории (см. шапку файла).
    var OPS_V = 1;                       // версия схемы разбора: рост = пересобрать у всех
    var OPS_YEARS = 9;                   // глубина истории, лет назад
    var OPS_TRUNC = 900;                 // близко к потолку метода (1000) — режем окнами по годам
    var OPS_GAP_MS = 10 * 60 * 1000;     // авто-разбор не чаще раза в 10 минут
    var OPS_MAX_LOTS = 60;               // больше — старые сделки сворачиваются в одну
    var OPS_MAX_TRADES = 200;            // потолок записей продаж со счёта в журнале
    var BAL_KEY = '~bal';                // уравнивающий лот: остаток, не покрытый историей
    var BUY_OPS = { OPERATION_TYPE_BUY: 1, OPERATION_TYPE_BUY_CARD: 1, OPERATION_TYPE_BUY_MARGIN: 1 };
    var SELL_OPS = { OPERATION_TYPE_SELL: 1, OPERATION_TYPE_SELL_CARD: 1, OPERATION_TYPE_SELL_MARGIN: 1 };

    var opsLive = { busy: false, gen: 0, ts: 0, backoffTs: 0, err: '' };

    // Дата операции приходит в UTC, а биржевой день — московский: наивная
    // обрезка строки по 'T' увела бы вечерние сделки на день назад против
    // того, что пользователь видит в приложении брокера.
    function mskDate(iso) {
        var t = Date.parse(iso);
        if (!isFinite(t)) return '';
        var d = new Date(t + 3 * 3600 * 1000);
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }
    function dayDiff(a, b) {
        var ta = Date.parse(a + 'T00:00:00Z'), tb = Date.parse(b + 'T00:00:00Z');
        return (isFinite(ta) && isFinite(tb)) ? Math.round((tb - ta) / 86400000) : NaN;
    }
    // НКД на дату покупки: в операциях его нет (в API нет и такого типа
    // операции), зато он однозначно считается по расписанию купонов MOEX —
    // тому же, что питает «Календарь выплат».
    // pend — «расписание ещё грузится»: без этого сигнала лот навсегда получил
    // бы фолбэк (НКД на СЕГОДНЯ, а не на дату покупки), потому что расписания
    // приезжают очередью и на первом разборе новой карточки их обычно ещё нет.
    function nkdAtDate(ticker, iso, fallback, pend) {
        var full = fullBondId(ticker);
        var sch = coupSched[full];
        if (!sch || !sch.length) {
            try { ensureSchedule('bond', full); } catch (e) {}
            if (pend) pend.hit = true;
            return fallback;
        }
        var prev = null, next = null, after = null;
        sch.forEach(function (c) {
            if (!c || !c.d) return;
            if (c.d <= iso) { if (!prev || c.d > prev.d) prev = c; }
            else if (!next || c.d < next.d) next = c;
        });
        if (!next) return fallback;                  // покупка после последнего купона
        if (!prev) {
            // куплено в ПЕРВОМ купонном периоде: предыдущей выплаты нет, начало
            // периода восстанавливаем по шагу расписания (купоны периодичны)
            sch.forEach(function (c) {
                if (!c || !c.d || c.d <= next.d) return;
                if (!after || c.d < after.d) after = c;
            });
            if (!after) return fallback;
            var step = dayDiff(next.d, after.d);
            if (!(step > 0)) return fallback;
            prev = { d: null, v: 0 };
            var g0 = step - dayDiff(iso, next.d);
            if (!(g0 >= 0)) return fallback;
            return Math.round((+next.v || 0) * g0 / step * 100) / 100;
        }
        var span = dayDiff(prev.d, next.d), gone = dayDiff(prev.d, iso);
        if (!(span > 0) || !(gone >= 0)) return fallback;
        return Math.round((+next.v || 0) * gone / span * 100) / 100;
    }

    // ---------- загрузка операций ----------
    // Сначала одним широким окном: у обычного счёта вся история влезает в
    // единственный запрос. Уткнулись в потолок метода — перезабираем годовыми
    // окнами (в каждом свой потолок в тысячу, суммарно берём кратно больше).
    function opsWindow(y, now) {
        return { from: y + '-01-01T00:00:00+03:00',
            to: y >= now.getFullYear() ? new Date().toISOString() : (y + 1) + '-01-01T00:00:00+03:00' };
    }
    function fetchOps(alive) {
        var A = window.brokerApi, now = new Date(), y0 = now.getFullYear();
        return A.getOperations((y0 - OPS_YEARS) + '-01-01T00:00:00+03:00', now.toISOString()).then(function (res) {
            var list = (res && res.operations) || [];
            if (list.length < OPS_TRUNC) return list;
            var out = [], y = y0;
            function step() {
                if (y < y0 - OPS_YEARS || !alive()) return Promise.resolve(out);
                var w = opsWindow(y, now);
                return A.getOperations(w.from, w.to).then(function (r2) {
                    out = out.concat((r2 && r2.operations) || []);
                    y--;
                    return step();
                });
            }
            return step();
        });
    }
    // Резолв тикеров: история упоминает больше инструментов, чем текущий
    // портфель (полностью проданные бумаги), а resolveInstruments берёт по 25
    // за проход — идём несколькими проходами, пока не кончатся неизвестные.
    function resolveOps(list, alive) {
        var A = window.brokerApi, passes = 0;
        // по ОДНОМУ представителю на инструмент: resolveInstruments не
        // дедуплицирует вход и режет очередь по 25 — сотня операций по трём
        // бумагам сожгла бы весь проход на повторные запросы одного и того же
        var uniq = [], seen = {};
        list.forEach(function (o) {
            var k = o.instrumentUid || o.figi;
            if (!k || seen[k]) return;
            seen[k] = 1; uniq.push(o);
        });
        function step() {
            return A.resolveInstruments(uniq).then(function (cache) {
                var left = uniq.some(function (o) {
                    var k = o.instrumentUid || o.figi;
                    return k && !cache[k];
                });
                if (!left || ++passes >= 4 || !alive()) return cache;
                return step();
            });
        }
        return step();
    }

    // ---------- операции → группы по тикеру ----------
    function opsGroups(list, cache) {
        var A = window.brokerApi;
        // комиссия сделки приходит отдельной операцией со ссылкой на родителя
        // (документировано); связь мягкая — не сошлась, просто не покажем
        var fees = {};
        list.forEach(function (o) {
            if (o.operationType === 'OPERATION_TYPE_BROKER_FEE' && o.parentOperationId)
                fees[o.parentOperationId] = (fees[o.parentOperationId] || 0) + Math.abs(A.q2n(o.payment));
        });
        var byTicker = {};
        list.forEach(function (o) {
            var isBuy = BUY_OPS[o.operationType] === 1, isSell = SELL_OPS[o.operationType] === 1;
            if (!isBuy && !isSell) return;
            var key = o.instrumentUid || o.figi;
            var ins = key ? cache[key] : null;
            if (!ins || !ins.ticker) return;              // тикер не разрезолвился — бумагу пропускаем
            var type = o.instrumentType === 'bond' ? 'bond' : (o.instrumentType === 'share' ? 'stock' : '');
            if (!type) return;                            // фонды, валюта, фьючерсы — «вне трекера»
            // весь трекер считает в рублях: у валютной бумаги price придёт в
            // её валюте, и молча принять его за рубли — худшее, что можно
            // сделать. Такая бумага просто останется без разобранной истории.
            var cur = o.price && o.price.currency;
            if (cur && String(cur).toLowerCase() !== 'rub') return;
            var qty = Math.abs(Number(o.quantity) || 0);
            var price = A.q2n(o.price);
            var date = mskDate(o.date);
            if (!(qty > 0) || !(price > 0) || !date) return;
            var g = byTicker[ins.ticker] || (byTicker[ins.ticker] = {
                ticker: ins.ticker, name: ins.name || ins.ticker, type: type,
                lot: Math.max(1, Math.round(+ins.lot || 1)), buys: [], sells: [] });
            var rec = { date: date, ts: Date.parse(o.date) || 0, qty: qty,
                price: Math.round(price * 100) / 100,
                fee: Math.round((fees[o.id] || 0) * 100) / 100,
                pay: Math.abs(A.q2n(o.payment)) };
            (isBuy ? g.buys : g.sells).push(rec);
        });
        return byTicker;
    }
    function byDateAsc(a, b) { return a.date === b.date ? a.ts - b.ts : (a.date < b.date ? -1 : 1); }
    // FIFO: продажи гасят самые старые покупки — остаются лоты, которыми
    // бумага фактически держится сейчас. Комиссия покупки уезжает вместе с
    // проданной частью лота, чтобы в журнале она осталась пропорциональной.
    function fifoLots(g) {
        var open = g.buys.slice().sort(byDateAsc).map(function (b) {
            return { date: b.date, price: b.price, qty: b.qty, qty0: b.qty, fee: b.fee };
        });
        g.sells.slice().sort(byDateAsc).forEach(function (s) {
            var left = s.qty;
            for (var i = 0; i < open.length && left > 0; i++) {
                // гасить можно только то, что к моменту продажи уже куплено:
                // иначе продажа бумаг, ПЕРЕВЕДЁННЫХ от другого брокера (такой
                // операции в истории нет вовсе), съела бы более позднюю
                // настоящую покупку и выбросила бы её из истории
                if (open[i].date > s.date) continue;
                var take = Math.min(open[i].qty, left);
                open[i].qty -= take; left -= take;
            }
            // непокрытый остаток продажи просто отбрасываем: покупки, которую
            // он гасил, в доступной истории нет
        });
        return open.filter(function (o) { return o.qty > 1e-9; }).map(function (o) {
            return { date: o.date, price: o.price, qty: o.qty,
                fee: o.qty0 > 0 ? Math.round(o.fee * (o.qty / o.qty0) * 100) / 100 : 0 };
        });
    }
    // Сведение восстановленного с истиной из GetPortfolio. Остаток, не
    // объяснённый операциями (усечение до тысячи, амортизация, сплит, перевод
    // бумаг от другого брокера), становится одним уравнивающим лотом — числа
    // карточки остаются верными, а часть истории всё равно настоящая.
    // Пересчёт лотности сюда УЖЕ приходит решённым (см. lotScale): решать его
    // здесь, по одной бумаге, нельзя — «восстановлено ровно в lot раз меньше»
    // куда чаще означает неполную историю, чем единицы измерения.
    function fitLots(lots, want, r) {
        var sum = 0;
        lots.forEach(function (l) { sum += l.qty; });
        sum = Math.round(sum * 1e6) / 1e6;
        if (sum - want > 1e-9) {                   // операций больше, чем бумаг: гасим старые
            var over = sum - want;
            lots.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
            for (var i = 0; i < lots.length && over > 1e-9; i++) {
                var q0 = lots[i].qty, take = Math.min(q0, over);
                lots[i].qty -= take; over -= take;
                // комиссия едет вместе с количеством — тем же приёмом, что в fifoLots
                if (lots[i].fee > 0 && q0 > 0) lots[i].fee = Math.round(lots[i].fee * (lots[i].qty / q0) * 100) / 100;
            }
            lots = lots.filter(function (l) { return l.qty > 1e-9; });
        } else if (want - sum > 1e-9) {            // история не покрывает всё — уравниваем
            lots.push({ date: todayStr(), price: r.price, qty: Math.round((want - sum) * 1e6) / 1e6,
                fee: 0, bal: true });
        }
        lots.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        if (lots.length > OPS_MAX_LOTS) {          // старые сделки — одной строкой
            var head = lots.slice(0, lots.length - OPS_MAX_LOTS + 1), tail = lots.slice(head.length);
            var q = 0, inv = 0, fee = 0, last = '';
            head.forEach(function (l) { q += l.qty; inv += l.price * l.qty; fee += l.fee || 0;
                if (l.date > last) last = l.date; });
            // дата свёртки — САМАЯ ПОЗДНЯЯ из свёрнутых: так мы не приписываем
            // бумагам более раннее владение, чем было (иначе поедут прошлые выплаты)
            lots = [{ date: last, price: q > 0 ? Math.round(inv / q * 100) / 100 : 0, qty: q,
                fee: Math.round(fee * 100) / 100, roll: true }].concat(tail);
        }
        // ключ лота выводится из содержания операции, а не из её id: id операций
        // официально нестабильны, а нам нужна сходимость — иначе каждый разбор
        // давал бы новые id лотов и гнал бы весь portfolios_v1 в облако
        var seen = {};
        lots.forEach(function (l) {
            var base = l.bal ? BAL_KEY : (l.roll ? 'roll|' + l.date : l.date + '|' + l.qty + '|' + l.price);
            seen[base] = (seen[base] || 0) + 1;
            l.opKey = seen[base] > 1 ? base + '#' + seen[base] : base;
        });
        return lots;
    }
    function lotsSig(lots) {
        return lots.map(function (l) {
            return (l.opKey || '') + '/' + (l.buyDate || l.date) + '/' + (+l.qty || 0) +
                '/' + (+l.buyPrice || +l.price || 0) + '/' + (+l.fee || 0) + '/' + (+l.nkd || 0);
        }).join(';');
    }
    // Подпись состава: ею ловится и обычное расхождение, и схлопывание лотов
    // устройством со СТАРОЙ версией этого файла (оно срезает h.lots до одного,
    // а флаг h.ops не трогает) — тогда история просто пересобирается заново.
    function opsSig(p) {
        return (p.holdings || []).map(function (h) {
            return h.ticker + ':' + (h.ops ? ensureLots(h).length : 0);
        }).join(',');
    }
    function needOps(p) {
        if (!p || !p.broker) return false;
        var o = p.broker.ops;
        if (!o || o.v !== OPS_V) return true;
        if ((p.holdings || []).some(function (h) { return h.opsGap; })) return true;
        return opsSig(p) !== o.sig;
    }

    // Единицы измерения quantity — свойство ОТВЕТА API, а не отдельной бумаги:
    // документация противоречит сама себе («штуки» в актуальном FAQ, «лоты» в
    // архивном), поэтому решаем один раз по всему счёту. Пересчёт включается,
    // только если у КАЖДОЙ лотной бумаги восстановленное количество ровно в
    // lot раз меньше фактического. Иначе это не единицы, а неполная история
    // (перевод от другого брокера, покупка раньше окна) — её место в
    // уравнивающем лоте, а не в домножении на лотность.
    function lotScale(p, byTicker) {
        var any = false, all = true;
        (p.holdings || []).forEach(function (h) {
            var g = byTicker[h.ticker];
            if (!g || g.type !== h.type || !g.buys.length || !(g.lot > 1)) return;
            var want = lotsQty(h), sum = 0;
            fifoLots(g).forEach(function (l) { sum += l.qty; });
            // Голосует КАЖДАЯ лотная бумага, включая те, у которых количество и
            // так сошлось: сойтись без пересчёта оно могло только если единицы
            // уже штуки — то есть это довод ПРОТИВ, а не воздержавшийся.
            if (Math.abs(sum * g.lot - want) < 1e-6) any = true;
            else all = false;
        });
        return any && all;
    }

    // ---------- запись разобранной истории в портфель ----------
    function applyOps(p, byTicker, opsN) {
        var changed = false, covered = 0;
        var pend = { hit: false }, waitSched = {};
        var scale = lotScale(p, byTicker);
        if (scale) {
            // пересчёт касается и продаж: иначе журнал показал бы «продано 2»
            // там, где продано 20 бумаг
            Object.keys(byTicker).forEach(function (tk) {
                var g = byTicker[tk];
                if (!(g.lot > 1)) return;
                g.buys.forEach(function (b) { b.qty *= g.lot; });
                g.sells.forEach(function (s) { s.qty *= g.lot; });
            });
        }
        (p.holdings || []).forEach(function (h) {
            var g = byTicker[h.ticker];
            if (!g || g.type !== h.type || !g.buys.length) return;   // истории по бумаге нет — оставляем как есть
            var want = lotsQty(h);                                    // количество из снапшота = истина
            if (!(want > 0)) return;
            var cur = ensureLots(h);
            var fallbackNkd = +(cur[0] || {}).nkd || 0;
            pend.hit = false;                                         // сигнал «нет расписания» — по каждой бумаге свой
            // цена уравнивающего лота — средняя позиции у брокера: честное «мы
            // не знаем, когда и почём куплен этот остаток», а не цена соседнего лота
            var row = null;
            (live.rows || []).forEach(function (x) { if (x.ticker === h.ticker && x.type === h.type) row = x; });
            var lots = fitLots(fifoLots(g), want,
                { price: row ? row.buyPrice : (+(cur[0] || {}).buyPrice || 0) });
            var byKey = {};
            cur.forEach(function (l) { if (l.opKey) byKey[l.opKey] = l; });
            var next = lots.map(function (n) {
                var old = byKey[n.opKey];
                var lot = { id: old ? old.id : genId('l'), buyDate: n.date, buyPrice: n.price,
                    qty: Math.round(n.qty * 1e6) / 1e6,
                    nkd: h.type === 'bond' ? nkdAtDate(h.ticker, n.date, fallbackNkd, pend) : 0,
                    priceFromApi: true, nkdFromApi: true, opKey: n.opKey };
                if (n.fee > 0) lot.fee = n.fee;
                return lot;
            });
            if (lotsSig(next) !== lotsSig(cur)) { h.lots = next; changed = true; }
            if (!h.ops) { h.ops = true; changed = true; }
            if (pend.hit) waitSched[h.id] = 1;
            covered++;
        });
        // Пометка «состав разошёлся с историей» снимается со ВСЕХ бумаг, а не
        // только с покрытых: у бумаги может не быть покупок в истории вовсе
        // (перевод от другого брокера, выпадение из окна), и незакрытый флаг
        // заставлял бы перечитывать всю историю каждые десять минут вечно.
        (p.holdings || []).forEach(function (h) {
            if (h.opsGap) { delete h.opsGap; changed = true; }
        });
        // ...и тут же возвращается облигациям, чьё расписание купонов ещё не
        // приехало: их НКД посчитан фолбэком, разбор надо повторить, когда
        // расписание будет в кэше (opsSync ставит короткий бэкофф).
        (p.holdings || []).forEach(function (h) {
            if (waitSched[h.id]) { h.opsGap = true; changed = true; }
        });
        opsLive.waitSched = Object.keys(waitSched).length > 0;
        if (applyOpsTrades(p, byTicker)) changed = true;
        var sig = opsSig(p);
        var o = p.broker.ops || {};
        if (o.v !== OPS_V || o.sig !== sig || o.n !== opsN || o.covered !== covered) {
            p.broker.ops = { v: OPS_V, ts: Date.now(), n: opsN, covered: covered,
                total: (p.holdings || []).length, sig: sig };
            changed = true;
        }
        return changed;
    }
    // Продажи со счёта — в общий журнал p.trades (там же живут обмены
    // ребалансировки). Блок брокерских записей ЗАМЕЩАЕТСЯ целиком: id операций
    // нестабильны, поэтому дедуп идёт по содержанию (opKey), а не по их id.
    // Записи обменов не трогаем и не вытесняем — у них есть undo, потерять их
    // нельзя.
    function applyOpsTrades(p, byTicker) {
        var made = [];
        Object.keys(byTicker).forEach(function (tk) {
            var g = byTicker[tk];
            g.sells.forEach(function (s) {
                var proceeds = s.pay > 0 ? s.pay : Math.round(s.price * s.qty * 100) / 100;
                made.push({ ts: s.ts || Date.parse(s.date + 'T12:00:00+03:00') || 0,
                    // дату журнала везём отдельным полем: восстановленная из ts
                    // она считалась бы в зоне браузера и разошлась бы с датами
                    // лотов, которые мы считаем по московскому торговому дню
                    date: s.date,
                    kind: g.type === 'bond' ? 'bond' : 'stock',
                    sellTicker: g.ticker, sellName: g.name || g.ticker, sellQty: s.qty,
                    proceeds: Math.round(proceeds * 100) / 100,
                    feeRub: s.fee > 0 ? s.fee : 0, src: 'broker',
                    opKey: s.date + '|' + s.qty + '|' + s.price });
            });
        });
        var seen = {};
        made.forEach(function (t) {
            seen[t.opKey] = (seen[t.opKey] || 0) + 1;
            if (seen[t.opKey] > 1) t.opKey += '#' + seen[t.opKey];
        });
        made.sort(function (a, b) { return b.ts - a.ts; });
        if (made.length > OPS_MAX_TRADES) made.length = OPS_MAX_TRADES;
        var old = p.trades || [], keep = [], oldBrk = {};
        old.forEach(function (t) {
            if (t.src === 'broker') oldBrk[t.opKey] = t; else keep.push(t);
        });
        // id записи должен пережить пересборку: он уходит в onclick разметки
        // журнала, и менять его каждый разбор — значит ломать открытые попапы
        made.forEach(function (t) { t.id = (oldBrk[t.opKey] || {}).id || genId('t'); });
        function sig(list) {
            return list.map(function (t) { return t.opKey + '/' + t.proceeds + '/' + t.sellQty; }).join(';');
        }
        var wasBrk = old.filter(function (t) { return t.src === 'broker'; });
        if (sig(wasBrk) === sig(made)) return false;
        p.trades = keep.concat(made).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        return true;
    }

    // ---------- разбор истории: оркестровка ----------
    // Собираем всё во временные структуры и коммитим одним куском: частично
    // разобранная история не должна попадать в store. Поколение gen гасит
    // гонку с отключением импорта и с повторным запуском.
    function opsSync(force, cb) {
        var p = brokerPf();
        if (!p || !connFor(p)) { if (cb) cb('idle'); return; }
        if (opsLive.busy) { if (cb) cb('busy'); return; }
        var now = Date.now();
        if (!force && (now < opsLive.backoffTs || (opsLive.ts && now - opsLive.ts < OPS_GAP_MS))) { if (cb) cb('throttled'); return; }
        var gen = ++opsLive.gen, pid = p.id;
        function alive() {
            var cur = brokerPf();
            return opsLive.gen === gen && !!cur && cur.id === pid && !!connFor(cur);
        }
        opsLive.busy = true; opsLive.err = '';
        PF.softRerender();
        fetchOps(alive).then(function (list) {
            if (!alive()) throw new Error('__stale__');
            // резолвим тикеры только по сделкам: у купонов, налогов и
            // пополнений инструмент либо не нужен, либо его нет вовсе
            var trades = list.filter(function (o) {
                return BUY_OPS[o.operationType] === 1 || SELL_OPS[o.operationType] === 1;
            });
            return resolveOps(trades, alive).then(function (cache) {
                if (!alive()) throw new Error('__stale__');
                var cur = brokerPf();
                opsLive.waitSched = false;
                var changed = applyOps(cur, opsGroups(list, cache), list.length);
                opsLive.busy = false; opsLive.ts = Date.now();
                // расписания купонов не успели приехать — повторяем скоро, а не
                // через штатные десять минут: иначе НКД покупок останется
                // фолбэком до следующего изменения состава
                opsLive.backoffTs = 0;
                if (opsLive.waitSched) { opsLive.ts = 0; opsLive.backoffTs = Date.now() + 30000; }
                if (changed) {
                    saveStore();
                    PF.pfInvalidateCharts(cur.id);
                    ensureQuotes(true);
                }
                try { window.brokerApi.logEvent('ops_sync', 'разобрано операций: ' + list.length); } catch (e) {}
                PF.softRerender();
                if (cb) cb(null, changed);
            });
        }).catch(function (e) {
            // Устаревший разбор не должен трогать состояние, которым владеет
            // НОВОЕ поколение. Но если поколение прежнее (карточку не пересоздали,
            // просто сменился счёт или пропало подключение), освободить busy
            // обязаны мы сами — иначе разбор залипнет до перезагрузки страницы.
            if (e && e.message === '__stale__') {
                if (opsLive.gen === gen) opsLive.busy = false;
                if (cb) cb('stale');
                return;
            }
            if (opsLive.gen === gen) opsLive.busy = false;
            opsLive.backoffTs = Date.now() + OPS_GAP_MS;
            opsLive.err = (e && e.message) || 'Не удалось загрузить историю сделок';
            PF.softRerender();
            if (cb) cb(e || 'error');
        });
    }
    PF.brokerPfOpsSync = opsSync;
    // кнопка в тихой строке карточки
    window.pfBrokerPfOps = function (ev) {
        if (ev) ev.stopPropagation();
        var pOps = brokerPf();
        if (!pOps || !connFor(pOps)) { toast('История сделок доступна на устройстве, где вводили токен', true); return; }
        if (opsLive.busy) { toast('Уже разбираем историю…'); return; }
        opsSync(true, function (err) {
            if (err && err !== 'stale' && err !== 'idle') toast((err && err.message) || 'Не удалось загрузить историю сделок', true);
            else if (!err) {
                var p = brokerPf(), o = p && p.broker.ops;
                toast(o ? 'История сделок разобрана · операций: ' + o.n : 'История сделок обновлена');
            }
        });
    };

    // ---------- синк ----------
    // Бейдж показывает время синка устройства даже без записи store — правим
    // текстовый узел точечно (тот же принцип, что data-live роадмапа №6).
    function patchBadgeTime() {
        var p = brokerPf(); if (!p) return;
        var el = document.querySelector('[data-brkts="' + p.id + '"]');
        if (el) el.textContent = timeStr(live.ts || p.broker.ts);
    }
    function sync(force, cb) {
        var p = brokerPf();
        if (!p || !connFor(p)) { if (cb) cb('idle'); return; }
        if (live.busy) { if (cb) cb('busy'); return; }
        var now = Date.now();
        if (!force && ((live.ts && now - live.ts < 60000) || now < live.backoffTs)) { if (cb) cb('throttled'); return; }
        live.busy = true;
        fetchSnapshot().then(function (snap) {
            live.busy = false; live.ts = Date.now(); live.backoffTs = 0; live.extra = snap.extra; live.rows = snap.rows;
            var cur = brokerPf(); if (!cur) { if (cb) cb('idle'); return; }   // пока грузили, импорт отключили
            if (applySnapshot(cur, snap)) {
                ensureQuotes(true);
                PF.softRerender();
            } else patchBadgeTime();   // store не трогали — только время на бейдже
            // История сделок — по событию, а не по таймеру: разбирать её на
            // каждом тике рендера незачем, она меняется только со сделками.
            if (needOps(cur)) opsSync(false);
            if (cb) cb(null);
        }).catch(function (e) {
            live.busy = false;
            live.backoffTs = Date.now() + 60000;   // тихо: следующая попытка через минуту
            if (cb) cb(e || 'error');
        });
    }
    PF.brokerPfSync = sync;               // зовёт цикл рендера (portfolios.js)
    PF.brokerPfGet = brokerPf;            // для меню «Импорт» и гардов
    PF.brokerPfAlive = function () { return !!connAlive(); };

    // подключили/разблокировали/отключили брокера — сбрасываем троттл и, если
    // вкладка открыта, тихо синкаем и перерисовываем (бейдж меняет состояние)
    window.addEventListener('broker-conn-change', function () {
        live.ts = 0; live.backoffTs = 0;
        opsLive.backoffTs = 0; opsLive.err = '';
        if (typeof currentTab !== 'undefined' && currentTab === 'portfolios' && dq('pfWrap')) {
            sync();
            PF.softRerender();
        }
    });

    // ---------- создание/обновление из меню «Импорт» и визарда ----------
    // Прокрутка к карточке счёта: в конструкторе — блок pf:<id>, в классической
    // сетке — карточка по data-pfid; рендер асинхронный → поллинг по кадрам.
    function scrollToCard(id) {
        var tries = 0;
        (function poll() {
            var el = document.querySelector('#pfWrap .pfd-item[data-pfd="pf:' + id + '"], #pfWrap .pf-card[data-pfid="' + id + '"]');
            if (el) {
                try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
                el.classList.add('pfd-flash');
                setTimeout(function () { try { el.classList.remove('pfd-flash'); } catch (e) {} }, 1500);
                return;
            }
            if (tries++ < 45) requestAnimationFrame(poll);
        })();
    }
    // Предупреждение о задвоении: тикеры счёта уже ведутся в РУЧНЫХ портфелях —
    // «Суммарный капитал» посчитает эти бумаги дважды. Жёлтый варн, не блокер.
    function dupWarn(snap) {
        var onAcc = {};
        snap.rows.forEach(function (r) { onAcc[r.ticker] = 1; });
        var dups = {}, nPf = 0;
        PF.store.items.forEach(function (p) {
            if (p.broker) return;
            var hit = false;
            (p.holdings || []).forEach(function (h) {
                if (h.ticker && onAcc[h.ticker] && aggHolding(h).qty > 0) { dups[h.ticker] = 1; hit = true; }
            });
            if (hit) nPf++;
        });
        var list = Object.keys(dups);
        if (!list.length) return null;
        return { icon: WARN_SVG, warn: true, ok: 'Всё равно создать',
            title: 'Бумаги счёта уже учтены в портфелях',
            text: '<b>' + list.map(esc).join(', ') + '</b> — уже ' + (list.length === 1 ? 'ведётся' : 'ведутся') + ' руками в ' +
                nPf + ' ' + PF.plural(nPf, 'портфеле', 'портфелях', 'портфелях') +
                '. Сводка «Суммарный капитал» посчитает ' + (list.length === 1 ? 'эту бумагу' : 'эти бумаги') + ' дважды.' };
    }
    function createCard(c, snap) {
        var np = makePortfolio('Т-Инвестиции');
        np.broker = { acc: c.accountId, name: c.accountName || 'Счёт',
            tail: String(c.accountId || '').slice(-4), sandbox: !!c.sandbox,
            ts: Date.now(), extra: snap.extra };
        PF.store.items.push(np);
        applySnapshot(np, snap);
        saveStore();   // applySnapshot пишет только при изменениях — пустой счёт тоже сохраняем
        live.ts = Date.now(); live.extra = snap.extra;
        PF.openMenu = null;
        ensureQuotes(true);
        PF.renderPortfolios();
        scrollToCard(np.id);
        toast('Карточка счёта создана · позиций: ' + snap.rows.length);
        // сразу вслед — реальные даты и цены покупок (этап 2): карточка
        // родилась с лотами «на сегодня», история их заменит через пару секунд
        opsSync(true);
    }
    // Пункт меню «Импорт» и финал визарда: find-or-create ОДНОЙ карточки счёта.
    // pid меню сознательно игнорируется — источник НЕ подмешивает бумаги в
    // текущий портфель: ручной портфель нельзя сделать зеркалом счёта,
    // замещающий снапшот затёр бы ручные лоты.
    window.pfBrokerPfImport = function () {
        if (PF.closeImpMenus) PF.closeImpMenus();
        var exist = brokerPf();
        if (exist) {   // карточка уже есть: синк сейчас + показать её, вторую не плодим
            if (!connFor(exist)) {
                toast('Карточка привязана к другому счёту — сейчас подключён не он. Отключите импорт в настройках карточки и создайте её заново.', true);
                scrollToCard(exist.id);
                return;
            }
            sync(true, function (err) { if (!err) toast('Счёт обновлён из Т-Инвестиций'); });
            scrollToCard(exist.id);
            return;
        }
        var c = connAlive();
        if (!c) { toast('Брокер не подключён на этом устройстве', true); return; }
        if (PF.store.items.length >= MAX_CARDS) { toast('Максимум ' + MAX_CARDS + ' ' + PF.plural(MAX_CARDS, 'портфель', 'портфеля', 'портфелей'), true); return; }
        if (live.creating) return;
        live.creating = true;
        toast('Загружаем счёт из Т-Инвестиций…');
        fetchSnapshot().then(function (snap) {
            live.creating = false;
            if (brokerPf() || PF.store.items.length >= MAX_CARDS) return;   // гонка двойного клика
            var warn = dupWarn(snap);
            if (warn) pfConfirm(warn, function () { createCard(c, snap); });
            else createCard(c, snap);
        }).catch(function (e) {
            live.creating = false;
            toast((e && e.message) || 'Не удалось получить портфель у брокера', true);
        });
    };
    // кнопка «Обновить» на бейдже карточки
    window.pfBrokerPfRefresh = function (pid, ev) {
        if (ev) ev.stopPropagation();
        var pRe = findPf(pid) || brokerPf();
        if (!pRe || !connFor(pRe)) { toast('Синк недоступен: подключён другой счёт или токен хранится на другом устройстве', true); return; }
        if (live.busy) { toast('Уже обновляем…'); return; }
        sync(true, function (err) {
            // idle/busy/throttled — служебные исходы (карточку успели отключить,
            // пока летел запрос), а не ошибка: красный тост тут врал бы
            if (err === 'idle' || err === 'busy' || err === 'throttled') return;
            if (err) toast((err && err.message) || 'Не удалось обновить счёт', true);
            else toast('Счёт обновлён · ' + timeStr(live.ts));
        });
    };
    // Удаление карточки = «отключить импорт»: счёт у брокера не трогаем
    // (и не можем — read-only API), удаляется только карточка трекера.
    window.pfBrokerPfDetach = function (pid) {
        var p = findPf(pid); if (!p || !p.broker) return;
        pfConfirm({
            danger: true, ok: 'Отключить', title: 'Отключить импорт счёта?',
            text: 'Удалится только карточка на этой странице. Счёт, бумаги и деньги у брокера не пострадают — этим доступом их тронуть невозможно. Подключение брокера остаётся; карточку можно создать заново: «Импорт → Из Т-Инвестиций».'
        }, function () {
            PF.store.items = PF.store.items.filter(function (x) { return x.id !== pid; });
            saveStore();
            if (PF.openMenu === pid) PF.openMenu = null;
            pfxDropPfTab(pid);
            live.ts = 0; live.extra = null;
            opsLive.gen++; opsLive.busy = false; opsLive.ts = 0; opsLive.backoffTs = 0; opsLive.err = '';
            PF.renderPortfolios();
            toast('Импорт счёта отключён — карточка удалена');
        });
    };

    // ---------- бейдж и строка «вне трекера» (зовёт cardHtml через PF.*) ----------
    // Бейдж-пилюля в шапке карточки: банк-иконка + «Т-Инвестиции · 12:34»,
    // у песочницы — оранжевая метка (как .btr-sand в терминале). Без живого
    // подключения (другое устройство / токен заперт) — приглушённая пилюля с
    // последним временем p.broker.ts: показываем снапшот из облака, это штатно.
    PF.brokerPfBadgeHtml = function (p) {
        if (!p || !p.broker) return '';
        var alive = !!connFor(p);
        var ts = alive ? (live.ts || p.broker.ts) : p.broker.ts;
        var sand = p.broker.sandbox ? '<i class="pfbk-sand">песочница</i>' : '';
        var accName = (p.broker.name || 'Счёт') + (p.broker.tail ? ' ····' + p.broker.tail : '');
        if (!alive) {
            // подключение есть, но ведёт на ДРУГОЙ счёт — это не «нет токена»,
            // и лечится оно иначе, поэтому и говорим иначе
            var other = !!connAlive();
            var note = other ? 'подключён другой счёт' : 'синк недоступен на этом устройстве';
            var tip = other
                ? 'Портфель счёта «' + accName + '», но сейчас подключён другой счёт брокера — карточка показывает последний снимок' + (ts ? ' от ' + dateTimeStr(ts) : '') + '. Чтобы вести текущий счёт, отключите импорт и создайте карточку заново.'
                : 'Портфель счёта «' + accName + '». Токен брокера хранится только на устройстве, где его вводили, — здесь показан последний сохранённый снимок' + (ts ? ' от ' + dateTimeStr(ts) : '') + '.';
            return '<span class="pfbk-badge off" title="' + attr(tip) + '">' +
                BANK_SVG + '<span class="pfbk-t">Т-Инвестиции · ' + timeStr(ts) + '</span>' + sand +
                '<i class="pfbk-note">' + note + '</i></span>';
        }
        return '<span class="pfbk-badge" title="' + attr('Портфель счёта «' + accName + '» — наполняется из Т-Инвестиций сам, примерно раз в минуту.') + '">' +
            BANK_SVG + '<span class="pfbk-t">Т-Инвестиции · <b data-brkts="' + p.id + '">' + timeStr(ts) + '</b></span>' + sand +
            '<button class="pfbk-re" type="button" onclick="pfBrokerPfRefresh(\'' + p.id + '\',event)" aria-label="Обновить из Т-Инвестиций" title="Обновить из Т-Инвестиций сейчас">' + RELOAD_SVG + '</button></span>';
    };
    // Тихая строка «вне трекера: N позиций · X ₽» — типы, которые трекер не
    // ведёт, суммой по ценам брокера на момент синка (в капитал не входят).
    PF.brokerPfExtraHtml = function (p) {
        if (!p || !p.broker) return '';
        var out = '';
        var ex = (connFor(p) && live.ts) ? live.extra : p.broker.extra;
        if (ex && ex.n > 0) {
            out += '<div class="pfbk-extra" title="Фонды, валюта, фьючерсы, металлы и бумаги в иностранной валюте — трекер их не ведёт. Сумма по ценам брокера на момент синка, в капитал карточки не входит; валютные бумаги в неё не включены — курса у нас нет.">вне трекера: ' +
                ex.n + ' ' + PF.plural(ex.n, 'позиция', 'позиции', 'позиций') + ' · ' + fmtRub(ex.sum) + '</div>';
        }
        return out + opsNoteHtml(p);
    };
    // Тихая строка про историю сделок (этап 2). Она же — единственный вход
    // для ручного пере-разбора: отдельной кнопки в интерфейсе не заводим.
    function opsNoteHtml(p) {
        var o = p.broker.ops, alive = !!connFor(p);
        if (opsLive.busy) return '<div class="pfbk-extra pfbk-ops">разбираем историю сделок со счёта…</div>';
        if (!alive) {
            if (!o) return '';
            return '<div class="pfbk-extra pfbk-ops" title="Реальные даты и цены покупок разобраны на устройстве, где вводили токен.">' +
                'реальные даты сделок · ' + o.n + ' ' + PF.plural(o.n, 'операция', 'операции', 'операций') + '</div>';
        }
        var re = '<button class="pfbk-opsbtn" type="button" onclick="pfBrokerPfOps(event)" title="Перечитать историю операций счёта">обновить</button>';
        if (opsLive.err && !o) {
            return '<div class="pfbk-extra pfbk-ops err" title="' + attr(opsLive.err) + '">историю сделок загрузить не удалось' +
                '<button class="pfbk-opsbtn" type="button" onclick="pfBrokerPfOps(event)">повторить</button></div>';
        }
        if (!o) {
            return '<div class="pfbk-extra pfbk-ops" title="Пока лоты созданы датой подключения. Разбор операций подставит настоящие даты, цены и комиссии покупок и добавит продажи в «Историю операций».">' +
                'история сделок не разобрана' +
                '<button class="pfbk-opsbtn" type="button" onclick="pfBrokerPfOps(event)">загрузить</button></div>';
        }
        // часть бумаг историей не покрыта — честно говорим об этом: у метода
        // есть потолок в тысячу операций, и старые покупки могут не приехать
        var partial = o.covered < o.total
            ? ' · по ' + o.covered + ' из ' + o.total + ' ' + PF.plural(o.total, 'бумаги', 'бумаг', 'бумаг')
            : '';
        return '<div class="pfbk-extra pfbk-ops" title="' + attr('Даты, цены и комиссии покупок взяты из истории операций счёта' +
            (o.ts ? ', разобрана ' + dateTimeStr(o.ts) : '') + '. Количество бумаг всегда берётся из портфеля брокера.') + '">' +
            'реальные даты сделок · ' + o.n + ' ' + PF.plural(o.n, 'операция', 'операции', 'операций') + partial + re + '</div>';
    }
})();
