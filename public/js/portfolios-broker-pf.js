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
    var live = { ts: 0, busy: false, creating: false, extra: null, backoffTs: 0 };

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
                    function toExtra() { extraN++; extraSum += val; }
                    // не share/bond или тикер ещё не расзолвлен (кэш добирает по
                    // 25 за проход — подтянется следующим синком) → «вне трекера»
                    if ((type !== 'share' && type !== 'bond') || !ins.ticker) { toExtra(); return; }
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
                var lots = ensureLots(h);
                if (lots.length > 1) { h.lots = [lots[0]]; changed = true; }   // инвариант: один лот
                var l = h.lots[0];
                if (Math.abs((+l.qty || 0) - r.qty) > 1e-9) { l.qty = r.qty; changed = true; }
                if (Math.abs((+l.buyPrice || 0) - r.buyPrice) > 0.005) { l.buyPrice = r.buyPrice; changed = true; }
                if (r.name && h.name !== r.name) { h.name = r.name; changed = true; }
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
        if (!p || !connAlive()) { if (cb) cb('idle'); return; }
        if (live.busy) { if (cb) cb('busy'); return; }
        var now = Date.now();
        if (!force && ((live.ts && now - live.ts < 60000) || now < live.backoffTs)) { if (cb) cb('throttled'); return; }
        live.busy = true;
        fetchSnapshot().then(function (snap) {
            live.busy = false; live.ts = Date.now(); live.backoffTs = 0; live.extra = snap.extra;
            var cur = brokerPf(); if (!cur) { if (cb) cb('idle'); return; }   // пока грузили, импорт отключили
            if (applySnapshot(cur, snap)) {
                ensureQuotes(true);
                PF.softRerender();
            } else patchBadgeTime();   // store не трогали — только время на бейдже
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
    }
    // Пункт меню «Импорт» и финал визарда: find-or-create ОДНОЙ карточки счёта.
    // pid меню сознательно игнорируется — источник НЕ подмешивает бумаги в
    // текущий портфель: ручной портфель нельзя сделать зеркалом счёта,
    // замещающий снапшот затёр бы ручные лоты.
    window.pfBrokerPfImport = function () {
        if (PF.closeImpMenus) PF.closeImpMenus();
        var exist = brokerPf();
        if (exist) {   // карточка уже есть: синк сейчас + показать её, вторую не плодим
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
        if (!connAlive()) { toast('Синк недоступен: токен брокера хранится на устройстве, где его вводили', true); return; }
        if (live.busy) { toast('Уже обновляем…'); return; }
        sync(true, function (err) {
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
        var alive = !!connAlive();
        var ts = alive ? (live.ts || p.broker.ts) : p.broker.ts;
        var sand = p.broker.sandbox ? '<i class="pfbk-sand">песочница</i>' : '';
        var accName = (p.broker.name || 'Счёт') + (p.broker.tail ? ' ····' + p.broker.tail : '');
        if (!alive) {
            return '<span class="pfbk-badge off" title="' + attr('Портфель счёта «' + accName + '». Токен брокера хранится только на устройстве, где его вводили, — здесь показан последний сохранённый снимок' + (ts ? ' от ' + dateTimeStr(ts) : '') + '.') + '">' +
                BANK_SVG + '<span class="pfbk-t">Т-Инвестиции · ' + timeStr(ts) + '</span>' + sand +
                '<i class="pfbk-note">синк недоступен на этом устройстве</i></span>';
        }
        return '<span class="pfbk-badge" title="' + attr('Портфель счёта «' + accName + '» — наполняется из Т-Инвестиций сам, примерно раз в минуту.') + '">' +
            BANK_SVG + '<span class="pfbk-t">Т-Инвестиции · <b data-brkts="' + p.id + '">' + timeStr(ts) + '</b></span>' + sand +
            '<button class="pfbk-re" type="button" onclick="pfBrokerPfRefresh(\'' + p.id + '\',event)" aria-label="Обновить из Т-Инвестиций" title="Обновить из Т-Инвестиций сейчас">' + RELOAD_SVG + '</button></span>';
    };
    // Тихая строка «вне трекера: N позиций · X ₽» — типы, которые трекер не
    // ведёт, суммой по ценам брокера на момент синка (в капитал не входят).
    PF.brokerPfExtraHtml = function (p) {
        if (!p || !p.broker) return '';
        var ex = (connAlive() && live.ts) ? live.extra : p.broker.extra;
        if (!ex || !(ex.n > 0)) return '';
        return '<div class="pfbk-extra" title="Фонды, валюта, фьючерсы и металлы со счёта — трекер их не ведёт. Сумма по ценам брокера на момент синка, в капитал карточки не входит.">вне трекера: ' +
            ex.n + ' ' + PF.plural(ex.n, 'позиция', 'позиции', 'позиций') + ' · ' + fmtRub(ex.sum) + '</div>';
    };
})();
