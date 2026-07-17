// ===== «ПОРТФЕЛИ» · ТОРГОВЫЙ ТЕРМИНАЛ (модуль цепочки #pfLazySrc) =====
// Подвкладка «Торговля», этап 2: стакан + тикет заявки + «Мои заявки».
// Рендер зовёт pfxTradingHtml (portfolios-tabs.js) при подключении со
// scope='trade' и state='ok'; данные — T-Invest API через js/broker-api.js.
//
// Предохранители (мировая практика бирж, обсуждение 2026-07-17):
//   · каждая заявка — модалка подтверждения с полными деталями;
//   · сумма выше порога — подтверждение вводом суммы руками;
//   · idempotency: клиентский orderId (UUID) на попытку — двойной клик и
//     ретрай после таймаута не продублируют заявку;
//   · fat-finger: лимит-цена дальше 5% от середины стакана — жёлтый варн;
//   · velocity: больше 5 заявок за минуту — пауза;
//   · вне торговой сессии — предупреждение в тикете;
//   · паник-кнопка «Отменить все заявки»;
//   · боевой контур (не песочница) — баннер до первого «понятно».
// Поллинг: стакан 2с, заявки 6с — ТОЛЬКО на активной подвкладке и видимой
// вкладке браузера; таймеры гасятся при уходе (pftAfterRender).

(function () {
    'use strict';
    var PF = window.PF;
    var dq = PF.dq, esc = PF.esc, fmtRub = PF.fmtRub, jsArg = PF.jsArg, toast = PF.toast;

    var FF_DEV = 0.05;            // fat-finger: 5% от середины стакана
    var VEL_MAX = 5, VEL_WIN = 60000;   // velocity: 5 заявок в минуту
    var SUM_LIMIT_KEY = 'bt_sum_limit_v1';   // порог «подтвердить суммой», ₽
    var LIVE_SEEN_KEY = 'bt_live_seen_v1';   // баннер боевого контура закрыт
    var OB_DEPTH = 10;

    // рабочее состояние терминала (живёт до перезагрузки страницы)
    var T = {
        uid: null, meta: null,        // выбранный инструмент и его паспорт
        ob: null, status: null,       // стакан и статус торгов
        side: 'buy', kind: 'limit', price: '', lots: 1,
        orders: [], sent: [],         // активные заявки; таймстемпы отправок (velocity)
        orderId: null,                // idempotency-ключ текущего подтверждения
        search: [], searchQ: '',
        obTimer: null, ordTimer: null, stTimer: null,
        busy: false
    };
    var instrMem = {};   // uid -> паспорт (lot, шаг цены) на время сессии

    function A() { return window.brokerApi; }
    function conn() { return A() && A().getConn(); }
    function tradeReady() {
        var c = conn();
        return !!(c && c.scope === 'trade' && c.state === 'ok' && !A().isLocked() && !A().isSessionGone());
    }
    function sumLimit() {
        var v = +localStorage.getItem(SUM_LIMIT_KEY);
        return v > 0 ? v : 100000;
    }
    function fmtPrice(n) {
        var d = T.meta && T.meta.minInc < 0.01 ? 4 : 2;
        return (+n || 0).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    // ---------- разметка ----------
    function pftTerminalHtml() {
        var c = conn();
        var banner = (!c.sandbox && !localStorage.getItem(LIVE_SEEN_KEY))
            ? '<div class="btr-live" id="btLive"><b>Боевой контур:</b> заявки уходят на настоящую биржу. ' +
              'Потренироваться без риска можно в песочнице (подключение брокера → песочница).' +
              '<button type="button" onclick="pftLiveOk()">Понятно</button></div>'
            : '';
        return '<div class="pfd-grid" id="pfdGrid"><div class="btr-wrap" style="grid-column: 1 / span 12">' +
            banner +
            '<div class="btr-grid">' +
            '<div class="dash2-card pf-card2 btr-card btr-ob">' + obCardHtml() + '</div>' +
            '<div class="dash2-card pf-card2 btr-card btr-ticket">' + ticketHtml() + '</div>' +
            '<div class="dash2-card pf-card2 btr-card btr-orders">' + ordersHtml() + '</div>' +
            '</div></div></div>';
    }

    // ---- карточка стакана ----
    function statusPill() {
        if (!T.uid) return '';
        var st = T.status && T.status.tradingStatus;
        var open = st === 'SECURITY_TRADING_STATUS_NORMAL_TRADING';
        var label = open ? 'торги идут' : 'сессия закрыта';
        return '<i class="bk-pill ' + (open ? 'bk-pill-green' : 'bk-pill-amber') + '">' + label + '</i>';
    }
    function obCardHtml() {
        var head = PF.pfCardHead('Терминал', 'Стакан', T.meta ? T.meta.name : 'выберите бумагу', null);
        var search = '<div class="btr-search"><input class="ph-input" id="btSearch" type="text" ' +
            'placeholder="Поиск: тикер или название…" autocomplete="off" spellcheck="false" value="' + esc(T.searchQ) + '">' +
            '<div class="btr-search-drop" id="btSearchDrop"></div></div>';
        var title = T.meta
            ? '<div class="btr-instr"><b>' + esc(T.meta.ticker) + '</b><span>' + esc(T.meta.name) + '</span>' + statusPill() + '</div>'
            : '';
        return head + search + title + '<div id="btOb">' + obHtml() + '</div>';
    }
    function obHtml() {
        if (!T.uid) return '<div class="pfal-empty">Найдите бумагу в поиске — стакан появится здесь. Подсказка: тикеры есть в виджете «Позиции у брокера».</div>';
        if (!T.ob) return '<div class="btr-obwait">Загружаем стакан…</div>';
        var q2n = A().q2n;
        var asks = (T.ob.asks || []).slice(0, OB_DEPTH);
        var bids = (T.ob.bids || []).slice(0, OB_DEPTH);
        var maxQ = 1;
        asks.concat(bids).forEach(function (r) { maxQ = Math.max(maxQ, +r.quantity || 0); });
        function row(r, side) {
            var p = q2n(r.price), q = +r.quantity || 0;
            var w = Math.max(3, Math.round(q / maxQ * 100));
            return '<div class="btr-obrow ' + side + '" role="button" onclick="pftPickPrice(\'' + jsArg(String(p)) + '\')">' +
                '<i style="width:' + w + '%"></i><b>' + fmtPrice(p) + '</b><span>' + q.toLocaleString('ru-RU') + '</span></div>';
        }
        var bb = bids.length ? q2n(bids[0].price) : 0, ba = asks.length ? q2n(asks[0].price) : 0;
        var spread = (bb && ba) ? '<div class="btr-spread"><span>спред</span><b>' + fmtPrice(ba - bb) + '</b></div>' : '';
        return '<div class="btr-obhead"><span>Цена</span><span>Лоты</span></div>' +
            asks.slice().reverse().map(function (r) { return row(r, 'ask'); }).join('') +
            spread +
            bids.map(function (r) { return row(r, 'bid'); }).join('') +
            (!asks.length && !bids.length ? '<div class="pfal-empty">Стакан пуст — торги по бумаге сейчас не идут.</div>' : '');
    }

    // ---- карточка тикета ----
    function ticketHtml() {
        var head = PF.pfCardHead('Тикет', 'Заявка', T.meta ? T.meta.ticker + ' · лот ' + (T.meta.lot || 1) + ' шт' : 'сначала выберите бумагу', null);
        if (!T.meta) return head + '<div class="pfal-empty">Тикет откроется после выбора бумаги в стакане.</div>';
        var seg = function (id, items, cur, fn) {
            return '<div class="mh-seg btr-seg" id="' + id + '">' + items.map(function (it) {
                return '<button type="button" class="mh-seg-btn' + (cur === it[0] ? ' active' : '') + '" onclick="' + fn + '(\'' + it[0] + '\')">' + it[1] + '</button>';
            }).join('') + '</div>';
        };
        var shares = T.lots * (T.meta.lot || 1);
        var est = estPrice();
        var sum = est * shares;
        return head +
            seg('btSide', [['buy', 'Купить'], ['sell', 'Продать']], T.side, 'pftSide') +
            seg('btKind', [['limit', 'Лимитная'], ['market', 'Рыночная']], T.kind, 'pftKind') +
            (T.kind === 'limit'
                ? '<div class="ph-field"><label class="ph-lab" for="btPrice">Цена, ₽ (шаг ' + fmtPrice(T.meta.minInc || 0.01) + ')</label>' +
                  '<input class="ph-input" id="btPrice" type="number" step="' + (T.meta.minInc || 0.01) + '" min="0" value="' + esc(T.price) + '"></div>'
                : '<div class="btr-mktnote">По лучшей цене стакана — итог зависит от рынка.</div>') +
            '<div class="ph-field"><label class="ph-lab" for="btLots">Лоты (1 лот = ' + (T.meta.lot || 1) + ' шт)</label>' +
            '<input class="ph-input" id="btLots" type="number" step="1" min="1" value="' + T.lots + '"></div>' +
            '<div class="btr-est"><div class="btr-est-l"><span>' + (T.kind === 'limit' ? 'Итого' : 'Итого ≈') + '</span><i>' + shares.toLocaleString('ru-RU') + ' шт</i></div><b>' + fmtRub(sum) + '</b></div>' +
            '<div class="btr-warns" id="btWarns">' + warnsHtml() + '</div>' +
            '<button type="button" class="btr-submit ' + T.side + '" id="btSubmit" onclick="pftAsk()">' +
            (T.side === 'buy' ? 'Купить ' : 'Продать ') + esc(T.meta.ticker) + '</button>' +
            '<div class="btr-limitrow">' + IC_SHIELD + '<span>Подтверждение вводом суммы от</span>' +
            '<input id="btSumLimit" type="number" min="1000" step="1000" value="' + sumLimit() + '"><span>₽</span></div>';
    }
    var IC_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5v-6z"/></svg>';
    function estPrice() {
        var q2n = A().q2n;
        if (T.kind === 'limit') return +T.price || 0;
        if (!T.ob) return 0;
        var best = T.side === 'buy' ? (T.ob.asks || [])[0] : (T.ob.bids || [])[0];
        return best ? q2n(best.price) : 0;
    }
    function midPrice() {
        if (!T.ob) return 0;
        var q2n = A().q2n;
        var b = (T.ob.bids || [])[0], a = (T.ob.asks || [])[0];
        if (b && a) return (q2n(b.price) + q2n(a.price)) / 2;
        return q2n((b || a || {}).price);
    }
    function warnsHtml() {
        var out = [];
        var st = T.status && T.status.tradingStatus;
        if (T.uid && st && st !== 'SECURITY_TRADING_STATUS_NORMAL_TRADING') {
            out.push('Торговая сессия закрыта: заявка будет ждать открытия, цена исполнения может отличаться.');
        }
        if (T.kind === 'limit' && +T.price > 0) {
            var mid = midPrice();
            if (mid > 0 && Math.abs(+T.price - mid) / mid > FF_DEV) {
                out.push('Цена дальше 5% от рынка (' + fmtPrice(mid) + ' сейчас) — проверьте, нет ли опечатки.');
            }
        }
        var vel = velLeft();
        if (vel > 0) out.push('Слишком часто: ' + VEL_MAX + ' заявок за минуту уже отправлено — пауза ' + Math.ceil(vel / 1000) + ' с.');
        return out.map(function (w) { return '<div class="btr-warn">' + w + '</div>'; }).join('');
    }
    function velLeft() {
        var now = Date.now();
        T.sent = T.sent.filter(function (t) { return now - t < VEL_WIN; });
        if (T.sent.length < VEL_MAX) return 0;
        return VEL_WIN - (now - T.sent[0]);
    }

    // ---- карточка заявок ----
    function ordersHtml() {
        var c = conn();
        var head = PF.pfCardHead('Счёт', 'Мои заявки', c ? c.accountName : 'активные на счёте', null);
        var q2n = A() ? A().q2n : function () { return 0; };
        var rows;
        if (!T.orders.length) {
            rows = '<div class="pfbrk-state pfbrk-state-slim">' +
                '<div class="pfbrk-state-ic">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg></div>' +
                '<div class="pfbrk-state-tx">Активных заявок нет — выставленные из тикета появятся здесь.</div></div>';
        } else {
            rows = '<div class="btr-ords">' + T.orders.map(function (o) {
                var ins = instrMem[o.instrumentUid] || {};
                var buy = o.direction === 'ORDER_DIRECTION_BUY';
                var price = q2n(o.initialSecurityPrice);
                return '<div class="btr-ordrow ' + (buy ? 'buy' : 'sell') + '">' +
                    '<i class="bk-pill ' + (buy ? 'bk-pill-green' : 'bk-pill-amber') + '">' + (buy ? 'покупка' : 'продажа') + '</i>' +
                    '<b>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</b>' +
                    '<span>' + (o.lotsExecuted || 0) + '/' + (o.lotsRequested || 0) + ' лот · ' + fmtPrice(price) + '</span>' +
                    '<button type="button" title="Снять заявку" onclick="pftCancel(\'' + jsArg(o.orderId) + '\')">✕</button></div>';
            }).join('') + '</div>';
        }
        var panic = T.orders.length
            ? '<button type="button" class="bk-btn bk-btn-danger btr-panic" onclick="pftCancelAll()">Отменить все заявки</button>' : '';
        var jr = (A() ? A().journal() : []).filter(function (e) { return e.ev.indexOf('order_') === 0; }).slice(0, 5)
            .map(function (e) {
                return '<div class="bk-jrow"><span>' + esc(e.d || e.ev) + '</span><i>' +
                    new Date(e.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</i></div>';
            }).join('');
        return head + rows + panic +
            '<div class="bk-lab btr-jlab">Журнал</div><div class="bk-journal">' + (jr || '<div class="bk-jrow"><span>Событий пока нет</span></div>') + '</div>';
    }

    // ---------- точечные перерисовки ----------
    function repaintOb() { var el = dq('btOb'); if (el) el.innerHTML = obHtml(); }
    function repaintWarns() { var el = dq('btWarns'); if (el) el.innerHTML = warnsHtml(); }
    function repaintCards() {
        // полная перерисовка трёх карточек без общего ре-рендера вкладки
        var w = document.querySelector('.btr-ob'); if (w) w.innerHTML = obCardHtml();
        var t = document.querySelector('.btr-ticket'); if (t) t.innerHTML = ticketHtml();
        var o = document.querySelector('.btr-orders'); if (o) o.innerHTML = ordersHtml();
        wire();
    }
    function repaintOrders() { var el = document.querySelector('.btr-orders'); if (el) { el.innerHTML = ordersHtml(); } }

    // ---------- данные ----------
    // ушли с подвкладки/вкладки браузера — таймеры гасим прямо из тика
    // (рендер «Портфелей» при уходе на другой раздел не перезапускается)
    function stillHere() {
        if (document.querySelector('#panel-portfolios.active .btr-grid')) return true;
        stopPolling();
        return false;
    }
    function pollOb() {
        if (!stillHere() || !T.uid || document.visibilityState !== 'visible') return;
        A().call('GetOrderBook', { instrumentId: T.uid, depth: OB_DEPTH }).then(function (d) {
            T.ob = d;
            repaintOb();
            repaintWarns();
        }).catch(function () { /* тихо: следующий тик попробует снова */ });
    }
    function pollOrders() {
        if (!stillHere() || document.visibilityState !== 'visible') return;
        var c = conn(); if (!c) return;
        A().call('GetOrders', { accountId: c.accountId }).then(function (d) {
            T.orders = (d.orders || []).filter(function (o) {
                return ['EXECUTION_REPORT_STATUS_NEW', 'EXECUTION_REPORT_STATUS_PARTIALLYFILL'].indexOf(o.executionReportStatus) !== -1;
            });
            // тикеры заявок — дорезолвим в память
            T.orders.forEach(function (o) {
                if (o.instrumentUid && !instrMem[o.instrumentUid]) fetchMeta(o.instrumentUid, true);
            });
            repaintOrders();
        }).catch(function () {});
    }
    function pollStatus() {
        if (!stillHere() || !T.uid) return;
        A().call('GetTradingStatus', { instrumentId: T.uid }).then(function (d) {
            T.status = d;
            repaintWarns();
            var el = document.querySelector('.btr-instr'); if (el && T.meta) {
                el.innerHTML = '<b>' + esc(T.meta.ticker) + '</b><span>' + esc(T.meta.name) + '</span>' + statusPill();
            }
        }).catch(function () {});
    }
    function fetchMeta(uid, quiet) {
        return A().call('GetInstrumentBy', { idType: 'INSTRUMENT_ID_TYPE_UID', id: uid }).then(function (d) {
            var i = d.instrument || {};
            instrMem[uid] = {
                uid: uid, ticker: i.ticker || '', name: i.name || '',
                lot: +i.lot || 1, minInc: A().q2n(i.minPriceIncrement) || 0.01
            };
            if (!quiet) return instrMem[uid];
            repaintOrders();
            return instrMem[uid];
        });
    }

    // ---------- таймеры ----------
    function startPolling() {
        if (!T.obTimer) T.obTimer = setInterval(pollOb, 2000);
        if (!T.ordTimer) T.ordTimer = setInterval(pollOrders, 6000);
        if (!T.stTimer) T.stTimer = setInterval(pollStatus, 30000);
        pollOb(); pollOrders(); pollStatus();
    }
    function stopPolling() {
        clearInterval(T.obTimer); clearInterval(T.ordTimer); clearInterval(T.stTimer);
        T.obTimer = T.ordTimer = T.stTimer = null;
    }
    // зовётся из цикла рендера portfolios.js: включает/гасит поллинг по месту
    function pftAfterRender() {
        var live = document.querySelector('#panel-portfolios.active .btr-grid');
        if (live && tradeReady()) { wire(); startPolling(); }
        else stopPolling();
    }

    // ---------- обработчики ----------
    var searchT = null;
    function wire() {
        var s = dq('btSearch');
        if (s && !s._wired) {
            s._wired = true;
            s.addEventListener('input', function () {
                T.searchQ = s.value.trim();
                clearTimeout(searchT);
                if (T.searchQ.length < 2) { renderDrop([]); return; }
                searchT = setTimeout(function () {
                    A().call('FindInstrument', { query: T.searchQ }).then(function (d) {
                        var list = (d.instruments || []).filter(function (i) {
                            return ['share', 'bond', 'etf', 'INSTRUMENT_TYPE_SHARE', 'INSTRUMENT_TYPE_BOND', 'INSTRUMENT_TYPE_ETF']
                                .indexOf(i.instrumentType || i.instrumentKind) !== -1 || true;   // рынок сам ранжирует
                        }).slice(0, 8);
                        renderDrop(list);
                    }).catch(function (e) { toast(e.message, true); });
                }, 350);
            });
        }
        var p = dq('btPrice');
        if (p && !p._wired) {
            p._wired = true;
            p.addEventListener('input', function () { T.price = p.value; repaintWarns(); repaintEst(); });
        }
        var l = dq('btLots');
        if (l && !l._wired) {
            l._wired = true;
            l.addEventListener('input', function () { T.lots = Math.max(1, Math.floor(+l.value || 1)); repaintEst(); });
        }
        var sl = dq('btSumLimit');
        if (sl && !sl._wired) {
            sl._wired = true;
            sl.addEventListener('change', function () {
                var v = Math.max(1000, Math.floor(+sl.value || 0));
                try { localStorage.setItem(SUM_LIMIT_KEY, String(v)); } catch (e) {}
                sl.value = v;
            });
        }
    }
    function repaintEst() {
        var el = document.querySelector('.btr-est');
        if (!el || !T.meta) return;
        var shares = T.lots * (T.meta.lot || 1);
        el.innerHTML = '<div class="btr-est-l"><span>' + (T.kind === 'limit' ? 'Итого' : 'Итого ≈') + '</span><i>' +
            shares.toLocaleString('ru-RU') + ' шт</i></div><b>' + fmtRub(estPrice() * shares) + '</b>';
    }
    function renderDrop(list) {
        var d = dq('btSearchDrop'); if (!d) return;
        if (!list.length) { d.innerHTML = ''; d.classList.remove('open'); return; }
        d.innerHTML = list.map(function (i, n) {
            return '<div class="btr-search-row" role="button" onclick="pftPick(' + n + ')">' +
                '<b>' + esc(i.ticker || '') + '</b><span>' + esc(i.name || '') + '</span></div>';
        }).join('');
        d.classList.add('open');
        T.search = list;
    }

    // ---------- публичные действия (onclick) ----------
    window.pftLiveOk = function () {
        try { localStorage.setItem(LIVE_SEEN_KEY, '1'); } catch (e) {}
        var b = dq('btLive'); if (b) b.remove();
    };
    window.pftPick = function (n) {
        var i = T.search[n]; if (!i) return;
        T.uid = i.uid; T.ob = null; T.status = null; T.price = ''; T.searchQ = '';
        fetchMeta(i.uid).then(function (m) {
            T.meta = m;
            repaintCards();
            pollOb(); pollStatus();
        }, function (e) { toast(e.message, true); });
    };
    window.pftPickPrice = function (p) {
        if (T.kind !== 'limit') return;
        T.price = String(p);
        var inp = dq('btPrice'); if (inp) inp.value = T.price;
        repaintWarns(); repaintEst();
    };
    window.pftSide = function (s) { T.side = s; repaintCards(); };
    window.pftKind = function (k) { T.kind = k; repaintCards(); };

    // подтверждение заявки: своя модалка (pfConfirm не умеет ввод суммы)
    window.pftAsk = function () {
        if (!tradeReady() || !T.meta || T.busy) return;
        var vel = velLeft();
        if (vel > 0) { toast('Пауза после ' + VEL_MAX + ' заявок подряд — ещё ' + Math.ceil(vel / 1000) + ' с', true); return; }
        var lots = Math.max(1, Math.floor(+T.lots || 1));
        var price = +T.price || 0;
        if (T.kind === 'limit') {
            if (!(price > 0)) { toast('Укажите цену лимитной заявки', true); return; }
            // цена — по шагу инструмента (иначе брокер отклонит)
            var inc = T.meta.minInc || 0.01;
            var snapped = Math.round(price / inc) * inc;
            if (Math.abs(snapped - price) > 1e-9) {
                price = +snapped.toFixed(6);
                T.price = String(price);
                var inp = dq('btPrice'); if (inp) inp.value = T.price;
                toast('Цена округлена до шага ' + fmtPrice(inc));
            }
        }
        var shares = lots * (T.meta.lot || 1);
        var est = T.kind === 'limit' ? price : estPrice();
        var sum = est * shares;
        T.orderId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        var needType = sum >= sumLimit();
        var typed = Math.round(sum);
        var old = dq('btConfirmOv'); if (old) old.remove();
        var ov = document.createElement('div');
        ov.id = 'btConfirmOv';
        ov.innerHTML = '<div class="bk-back"></div><div class="bk-card bk-card-pin btr-cf" role="alertdialog" aria-modal="true">' +
            '<div class="bk-title">' + (T.side === 'buy' ? 'Покупка' : 'Продажа') + ' ' + esc(T.meta.ticker) + '</div>' +
            '<div class="bk-kv"><span>Тип</span><b>' + (T.kind === 'limit' ? 'Лимитная' : 'Рыночная') + '</b></div>' +
            (T.kind === 'limit' ? '<div class="bk-kv"><span>Цена</span><b class="bk-mono">' + fmtPrice(price) + ' ₽</b></div>' : '') +
            '<div class="bk-kv"><span>Количество</span><b>' + lots + ' лот = ' + shares.toLocaleString('ru-RU') + ' шт</b></div>' +
            '<div class="bk-kv"><span>' + (T.kind === 'limit' ? 'Сумма' : 'Сумма ≈') + '</span><b class="bk-mono">' + fmtRub(sum) + '</b></div>' +
            warnsHtml() +
            (needType
                ? '<div class="ph-field"><label class="ph-lab" for="btCfSum">Крупная заявка — введите сумму цифрами (' + typed.toLocaleString('ru-RU') + ')</label>' +
                  '<input class="ph-input" id="btCfSum" type="text" inputmode="numeric" autocomplete="off" placeholder="' + typed.toLocaleString('ru-RU') + '"></div>'
                : '') +
            '<div class="bk-foot"><button type="button" class="bk-btn" id="btCfNo">Отмена</button>' +
            '<button type="button" class="bk-btn bk-btn-pri" id="btCfYes">Подтвердить</button></div></div>';
        document.body.appendChild(ov);
        function closeCf() { ov.remove(); }
        ov.querySelector('.bk-back').addEventListener('click', closeCf);
        ov.querySelector('#btCfNo').addEventListener('click', closeCf);
        ov.querySelector('#btCfYes').addEventListener('click', function () {
            if (needType) {
                var got = String((dq('btCfSum') || {}).value || '').replace(/[\s ]/g, '');
                if (got !== String(typed)) {
                    toast('Сумма не совпала — проверьте ещё раз', true);
                    return;
                }
            }
            closeCf();
            submitOrder(lots, price, sum);
        });
    };

    function submitOrder(lots, price, sum) {
        var c = conn(); if (!c || T.busy) return;
        T.busy = true;
        var btn = dq('btSubmit'); if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; }
        var body = {
            accountId: c.accountId,
            instrumentId: T.uid,
            quantity: String(lots),
            direction: T.side === 'buy' ? 'ORDER_DIRECTION_BUY' : 'ORDER_DIRECTION_SELL',
            orderType: T.kind === 'limit' ? 'ORDER_TYPE_LIMIT' : 'ORDER_TYPE_MARKET',
            orderId: T.orderId
        };
        if (T.kind === 'limit') body.price = A().n2q(price);
        A().call('PostOrder', body).then(function (d) {
            T.busy = false;
            T.sent.push(Date.now());
            T.orderId = null;   // исполненный ключ не переиспользуем
            A().logEvent('order_submit', (T.side === 'buy' ? 'покупка ' : 'продажа ') + T.meta.ticker +
                ' · ' + lots + ' лот' + (T.kind === 'limit' ? ' · ' + fmtPrice(price) + ' ₽' : ' · рыночная'));
            toast('Заявка выставлена: ' + T.meta.ticker);
            pollOrders();
            repaintCards();
        }, function (e) {
            T.busy = false;
            // T.orderId сохраняем: повтор той же попытки не продублирует заявку
            A().logEvent('order_error', T.meta.ticker + ' · ' + (e.message || '').slice(0, 120));
            toast(e.message || 'Заявка не прошла', true);
            var b = dq('btSubmit'); if (b) { b.disabled = false; b.textContent = (T.side === 'buy' ? 'Купить ' : 'Продать ') + T.meta.ticker; }
            repaintOrders();
        });
    }

    window.pftCancel = function (orderId) {
        var c = conn(); if (!c) return;
        PF.pfConfirm({ danger: true, title: 'Снять заявку?', text: 'Заявка будет отменена на бирже.', ok: 'Снять' }, function () {
            A().call('CancelOrder', { accountId: c.accountId, orderId: orderId }).then(function () {
                A().logEvent('order_cancel', 'заявка ' + orderId.slice(0, 8) + '…');
                toast('Заявка снята');
                pollOrders();
            }, function (e) { toast(e.message, true); });
        });
    };
    window.pftCancelAll = function () {
        var c = conn(); if (!c || !T.orders.length) return;
        PF.pfConfirm({ danger: true, title: 'Отменить все заявки?',
            text: 'Все ' + T.orders.length + ' активные заявки будут сняты с биржи.', ok: 'Отменить все' }, function () {
            var chain = Promise.resolve(), ok = 0;
            T.orders.forEach(function (o) {
                chain = chain.then(function () {
                    return A().call('CancelOrder', { accountId: c.accountId, orderId: o.orderId })
                        .then(function () { ok++; }, function () {});
                });
            });
            chain.then(function () {
                A().logEvent('order_cancel', 'паник-отмена: снято ' + ok);
                toast('Снято заявок: ' + ok);
                pollOrders();
            });
        });
    };

    // подключение сменилось (отключили/заблокировали) — гасим таймеры,
    // вкладка перерисуется гейтом при следующем рендере
    window.addEventListener('broker-conn-change', function () {
        if (!tradeReady()) stopPolling();
    });

    PF.pftTerminalHtml = pftTerminalHtml;
    PF.pftAfterRender = pftAfterRender;
})();
