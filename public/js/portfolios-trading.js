// ===== «ПОРТФЕЛИ» · ТОРГОВЫЙ ТЕРМИНАЛ (модуль цепочки #pfLazySrc) =====
// Подвкладка «Торговля», этап 2: стакан + тикет заявки + «Мои заявки».
// Рендер зовёт pfxTradingHtml (portfolios-tabs.js) при подключении со
// scope='trade' и state='ok'; данные — T-Invest API через js/broker-api.js.
//
// Минимал-редизайн 2026-07-18: стакан «ось цены» (цена по центру, объёмы
// бидов влево, асков вправо), поиск свёрнут в лупу, лента сделок под
// шевроном; тикет — крупные цифры с референс-подписями («рынок», «доступно»)
// и суммой прямо в кнопке; «Мои заявки» — табы Активные/Стоп/История,
// заявка = две строки с тонкой цветной меткой. Счёт (имя + хвост id +
// песочница) виден в шапках тикета/заявок и в модалке подтверждения.
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
// Поллинг: стакан 2с, заявки 6с, позиции 15с — ТОЛЬКО на активной подвкладке
// и видимой вкладке браузера; таймеры гасятся при уходе (pftAfterRender).

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
        stopKind: 'sl', stopPrice: '',// стоп-заявки: стоп-лосс/тейк-профит + цена активации
        orders: [], stops: [],        // активные заявки и стоп-заявки
        tape: [],                     // лента обезличенных сделок
        pos: { money: null, secs: {} },   // свободные ₽ и остатки бумаг (GetPositions)
        sent: [],                     // таймстемпы отправок (velocity)
        orderId: null,                // idempotency-ключ текущего подтверждения
        search: [], searchQ: '',
        searchOpen: true,             // поиск виден, пока бумага не выбрана; дальше — лупой
        tapeOpen: false,              // лента сделок под шевроном, по умолчанию свёрнута
        otab: 'active',               // вкладка «Моих заявок»: active | stop | hist
        obTimer: null, ordTimer: null, stTimer: null, tapeTimer: null, posTimer: null,
        busy: false
    };
    var instrMem = {};   // uid -> паспорт (lot, шаг цены, figi) на время сессии

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
    // хвост id счёта — маркировка «куда уходят заявки» в шапках и модалке
    function accTail() {
        var c = conn();
        return c && c.accountId ? String(c.accountId).slice(-4) : '';
    }

    // ---------- разметка ----------
    // баннер боевого контура (над сеткой конструктора и в fallback-раскладке)
    function bannerHtml() {
        var c = conn();
        return (c && !c.sandbox && !localStorage.getItem(LIVE_SEEN_KEY))
            ? '<div class="btr-live" id="btLive"><b>Боевой контур:</b> заявки уходят на настоящую биржу. ' +
              'Потренироваться без риска можно в песочнице (подключение брокера → песочница).' +
              '<button type="button" onclick="pftLiveOk()">Понятно</button></div>'
            : '';
    }
    // три карточки терминала — каждая самостоятельный блок дашборд-конструктора
    // (drag/resize/шестерёнка/корзина через .pfd-chrome, как у всех виджетов);
    // классы .btr-ob/.btr-ticket/.btr-orders — якоря точечных перерисовок
    function obCard() { return '<div class="dash2-card pf-card2 btr-card btr-ob">' + obCardHtml() + '</div>'; }
    function ticketCard() { return '<div class="dash2-card pf-card2 btr-card btr-ticket">' + ticketHtml() + '</div>'; }
    function ordersCard() { return '<div class="dash2-card pf-card2 btr-card btr-orders">' + ordersHtml() + '</div>'; }
    // fallback-раскладка (фиксированная сетка) — если конструктор недоступен;
    // основной путь рендерит карточки блоками через pfdBodyHtml (portfolios.js)
    function pftTerminalHtml() {
        return '<div class="pfd-grid" id="pfdGrid"><div class="btr-wrap" style="grid-column: 1 / span 12">' +
            bannerHtml() +
            '<div class="btr-grid">' + obCard() + ticketCard() + ordersCard() + '</div></div></div>';
    }

    var IC_LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    var IC_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

    // ---- карточка стакана ----
    // статус торгов — тихая точка с подписью (без пилюли)
    function statusDot() {
        if (!T.uid) return '';
        var st = T.status && T.status.tradingStatus;
        var open = st === 'SECURITY_TRADING_STATUS_NORMAL_TRADING';
        return '<span class="btr-st ' + (open ? 'ok' : 'off') + '"><i></i>' +
            (open ? 'торги идут' : 'сессия закрыта') + '</span>';
    }
    function instrHtml() {
        if (!T.meta) return '';
        return '<b>' + esc(T.meta.ticker) + '</b><span>' + esc(T.meta.name) + '</span>' + statusDot();
    }
    function obCardHtml() {
        var lens = '<button type="button" class="btr-iconbtn' + (T.searchOpen ? ' on' : '') + '" id="btSearchTg" ' +
            'title="Поиск бумаги" aria-label="Поиск бумаги" onclick="pftSearchToggle()">' + IC_LENS + '</button>';
        // кнопки конструктора — в потоке шапки ПЕРЕД лупой (PFD_OWN_CHROME, R9.2)
        var head = PF.pfCardHead('Терминал', 'Стакан', null, PF.pfdInChromeHtml('trade:ob') + lens);
        var search = '<div class="btr-search' + (T.searchOpen ? ' open' : '') + '" id="btSearchWrap">' +
            '<input class="ph-input" id="btSearch" type="text" ' +
            'placeholder="Тикер или название — например, SBER" autocomplete="off" spellcheck="false" value="' + esc(T.searchQ) + '">' +
            '<div class="btr-search-drop" id="btSearchDrop"></div></div>';
        var title = T.meta ? '<div class="btr-instr">' + instrHtml() + '</div>' : '';
        var tape = T.uid
            ? '<div class="btr-fold' + (T.tapeOpen ? ' open' : '') + '" id="btTapeFold">' +
                '<button type="button" class="btr-fold-btn" onclick="pftTapeToggle()">' +
                    '<span class="btr-fold-lab">Лента сделок</span>' +
                    '<span class="btr-fold-cnt" id="btTapeCnt">' + tapeCnt() + '</span>' +
                    '<span class="btr-fold-ch">' + IC_CHEV + '</span>' +
                '</button>' +
                '<div class="btr-fold-body"><div class="btr-tape" id="btTape">' + tapeHtml() + '</div></div>' +
              '</div>'
            : '';
        return head + search + title + '<div id="btOb">' + obHtml() + '</div>' + tape;
    }
    function tapeCnt() { return T.tape.length ? T.tape.length + ' за 15 мин' : ''; }
    function tapeHtml() {
        if (!T.tape.length) return '<div class="btr-tape-empty">Сделок за последние минуты нет.</div>';
        var q2n = A().q2n;
        return T.tape.slice(0, 10).map(function (t) {
            var buy = t.direction === 'TRADE_DIRECTION_BUY';
            var tm = '';
            try { tm = new Date(t.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) {}
            return '<div class="btr-tape-row"><i>' + tm + '</i>' +
                '<b class="' + (buy ? 'bid' : 'ask') + '">' + fmtPrice(q2n(t.price)) + '</b>' +
                '<span>' + (+t.quantity || 0).toLocaleString('ru-RU') + '</span></div>';
        }).join('');
    }
    // пустой стакан (закрытая сессия / неликвид) — не голый текст, а плашка со
    // статусом и последней/закрывающей ценой: пользователю есть на что смотреть
    var OB_EMPTY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h8M4 12h13M4 17h6"/><circle cx="17" cy="8" r="3.2"/><path d="m19.4 10.4 2.1 2.1"/></svg>';
    function obEmptyHtml(q2n) {
        var lp = q2n(T.ob.lastPrice), cp = q2n(T.ob.closePrice);
        var closed = !!(T.status && T.status.tradingStatus &&
            T.status.tradingStatus !== 'SECURITY_TRADING_STATUS_NORMAL_TRADING');
        var px = (lp || cp)
            ? '<div class="btr-obempty-px">' +
                (lp ? '<div><span>Последняя</span><b>' + fmtPrice(lp) + ' ₽</b></div>' : '') +
                (cp ? '<div><span>Закрытие</span><b>' + fmtPrice(cp) + ' ₽</b></div>' : '') +
              '</div>' : '';
        return '<div class="btr-obempty">' +
            '<div class="btr-obempty-ic">' + OB_EMPTY_SVG + '</div>' +
            '<div class="btr-obempty-tt">' + (closed ? 'Сессия закрыта' : 'Заявок сейчас нет') + '</div>' +
            '<div class="btr-obempty-tx">' + (closed
                ? 'Стакан наполнится с открытием торгов. Лимитную заявку можно выставить заранее — она дождётся открытия.'
                : 'В стакане по этой бумаге сейчас нет активных заявок.') + '</div>' +
            px + '</div>';
    }
    // стакан по оси цены: [объём спроса ←] цена [→ объём предложения];
    // клик по строке кладёт цену в активное ценовое поле тикета
    function obHtml() {
        if (!T.uid) return '<div class="pfal-empty">Найдите бумагу в поиске — стакан появится здесь. Подсказка: тикеры есть в виджете «Позиции у брокера».</div>';
        if (!T.ob) return '<div class="btr-obwait">Загружаем стакан…</div>';
        var q2n = A().q2n;
        var asks = (T.ob.asks || []).slice(0, OB_DEPTH);
        var bids = (T.ob.bids || []).slice(0, OB_DEPTH);
        if (!asks.length && !bids.length) return obEmptyHtml(q2n);
        var maxQ = 1;
        asks.concat(bids).forEach(function (r) { maxQ = Math.max(maxQ, +r.quantity || 0); });
        // best — лучшая цена (верх бидов / низ асков), примыкает к центру: акцент
        function row(r, side, best) {
            var p = q2n(r.price), q = +r.quantity || 0;
            var w = Math.max(4, Math.round(q / maxQ * 100));
            var half = '<span class="btr-axh"><i style="width:' + w + '%"></i><em>' + q.toLocaleString('ru-RU') + '</em></span>';
            return '<div class="btr-axrow ' + side + (best ? ' best' : '') + '" role="button" onclick="pftPickPrice(\'' + jsArg(String(p)) + '\')">' +
                (side === 'bid' ? half : '<span class="btr-axh"></span>') +
                '<b>' + fmtPrice(p) + '</b>' +
                (side === 'ask' ? half : '<span class="btr-axh"></span>') +
            '</div>';
        }
        var bb = bids.length ? q2n(bids[0].price) : 0, ba = asks.length ? q2n(asks[0].price) : 0;
        // центр оси — последняя цена крупно (стрелка к закрытию) + спред,
        // между hairline-линиями; фокус, вокруг которого дышит стакан
        var last = q2n(T.ob.lastPrice) || ((bb && ba) ? (bb + ba) / 2 : 0);
        var close = q2n(T.ob.closePrice);
        var dir = (last && close) ? (last > close ? 'up' : last < close ? 'down' : '') : '';
        var mid = '<div class="btr-axmid ' + dir + '">' +
            (dir ? '<i class="ar">' + (dir === 'up' ? '▲' : '▼') + '</i>' : '') +
            '<b>' + fmtPrice(last) + '</b><em>₽</em>' +
            ((bb && ba) ? '<span class="sp">спред <b>' + fmtPrice(ba - bb) + '</b></span>' : '') +
        '</div>';
        var askArr = asks.slice().reverse();
        return '<div class="btr-ax">' +
            '<div class="btr-ax-head"><span>Лоты · спрос</span><span>Цена</span><span>Предложение · лоты</span></div>' +
            askArr.map(function (r, i) { return row(r, 'ask', i === askArr.length - 1); }).join('') +
            mid +
            bids.map(function (r, i) { return row(r, 'bid', i === 0); }).join('') +
        '</div>';
    }

    // ---- карточка тикета ----
    // референс у цены: середина стакана — клик подставляет (по шагу)
    function pxRefBtn() {
        var m = midPrice();
        return m > 0
            ? '<button type="button" class="btr-ref" onclick="pftUseMarket()">рынок <b>' + fmtPrice(m) + ' ₽</b></button>'
            : '';
    }
    // референс у лотов: «доступно» (покупка — от свободных денег,
    // продажа — остаток бумаги на счёте) — клик подставляет
    function availLots() {
        if (!T.meta) return 0;
        var lot = T.meta.lot || 1;
        if (T.side === 'sell') {
            var units = T.pos.secs[T.uid];
            if (units == null && T.meta.figi) units = T.pos.secs[T.meta.figi];
            return units > 0 ? Math.floor(units / lot) : 0;
        }
        var price = estPrice() || midPrice();
        if (!(T.pos.money > 0) || !(price > 0)) return 0;
        return Math.floor(T.pos.money / (price * lot));
    }
    function lotsRefBtn() {
        if (!T.meta) return '';
        if (T.side === 'sell') {
            var n = availLots();
            // 0 в позиции — тоже показываем: сразу видно, что продавать нечего
            if (T.pos.secs[T.uid] == null && !(T.meta.figi && T.pos.secs[T.meta.figi] != null)) return '';
            return '<button type="button" class="btr-ref" onclick="pftUseAvail()">в позиции <b>' + n + ' лот</b></button>';
        }
        var a = availLots();
        return a > 0 ? '<button type="button" class="btr-ref" onclick="pftUseAvail()">доступно <b>' + a.toLocaleString('ru-RU') + ' лот</b></button>' : '';
    }
    // сводка сделки над кнопкой: цена × штуки · свободные деньги счёта
    function dealHtml() {
        if (!T.meta) return '';
        var shares = T.lots * (T.meta.lot || 1);
        var est = estPrice();
        var left = (est > 0 && shares > 0)
            ? '<span>' + fmtPrice(est) + ' ₽ × ' + shares.toLocaleString('ru-RU') + ' шт</span>' : '<span></span>';
        var right = T.pos.money != null
            ? '<span>свободно <b>' + fmtRub(T.pos.money) + '</b></span>' : '';
        return left + right;
    }
    // чистый текст (без esc) — идёт и в textContent при точечном обновлении
    function submitLbl() {
        return (T.side === 'buy' ? 'Купить ' : 'Продать ') + T.meta.ticker + ' · ' + T.lots + ' лот';
    }
    // пустая сумма (цена ещё не введена) → пустая строка: шов и цифра скрыты CSS-ом
    function submitSum() {
        var sum = estPrice() * T.lots * (T.meta.lot || 1);
        if (!(sum > 0)) return '';
        return (T.kind === 'limit' ? '' : '≈ ') + fmtRub(sum);
    }
    function ticketHtml() {
        var c = conn();
        var note = '<div class="btr-hd-note">' +
            (T.meta ? '<span class="btr-hd-ins">' + esc(T.meta.ticker) + ' · лот ' + (T.meta.lot || 1) + '</span>' : '') +
            (c ? '<span class="btr-hd-acc">' + esc(c.accountName || 'Счёт') +
                (accTail() ? ' <b>····' + accTail() + '</b>' : '') +
                (c.sandbox ? '<i class="btr-sand">песочница</i>' : '') + '</span>' : '') +
        '</div>';
        var head = PF.pfCardHead('Тикет', 'Заявка', null, PF.pfdInChromeHtml('trade:ticket') + note);
        if (!T.meta) return head + '<div class="pfal-empty">Тикет откроется после выбора бумаги в стакане.</div>';
        var inc = T.meta.minInc || 0.01;
        var stepHint = '<i> · шаг ' + fmtPrice(inc) + '</i>';
        var side = '<div class="btr-side" id="btSide">' +
            '<button type="button" class="btr-side-b buy' + (T.side === 'buy' ? ' active' : '') + '" onclick="pftSide(\'buy\')">Купить</button>' +
            '<button type="button" class="btr-side-b sell' + (T.side === 'sell' ? ' active' : '') + '" onclick="pftSide(\'sell\')">Продать</button></div>';
        var tabs = function (id, items, cur, fn) {
            return '<div class="btr-ttabs" id="' + id + '">' + items.map(function (it) {
                return '<button type="button"' + (cur === it[0] ? ' class="active"' : '') + ' onclick="' + fn + '(\'' + it[0] + '\')">' + it[1] + '</button>';
            }).join('') + '</div>';
        };
        var kind = tabs('btKind', [['limit', 'Лимитная'], ['market', 'Рыночная'], ['stop', 'Стоп']], T.kind, 'pftKind');
        var kindFields;
        if (T.kind === 'limit') {
            kindFields = '<div class="btr-bf"><div class="btr-bf-lab">' +
                '<label for="btPrice">Цена' + stepHint + '</label>' +
                '<span id="btPxRef">' + pxRefBtn() + '</span></div>' +
                '<div class="btr-bigrow"><input class="btr-big" id="btPrice" type="number" step="' + inc + '" min="0" ' +
                'placeholder="0" value="' + esc(T.price) + '"><span class="btr-big-suf">₽</span></div></div>';
        } else if (T.kind === 'stop') {
            kindFields = tabs('btStopKind', [['sl', 'Стоп-лосс'], ['tp', 'Тейк-профит']], T.stopKind, 'pftStopKind') +
                '<div class="btr-bf"><div class="btr-bf-lab">' +
                '<label for="btStop">Стоп-цена' + stepHint + '</label>' +
                '<span id="btPxRef">' + pxRefBtn() + '</span></div>' +
                '<div class="btr-bigrow"><input class="btr-big" id="btStop" type="number" step="' + inc + '" min="0" ' +
                'placeholder="0" value="' + esc(T.stopPrice) + '"><span class="btr-big-suf">₽</span></div>' +
                '<div class="btr-note">При достижении стоп-цены уйдёт рыночная заявка. Действует до отмены.</div></div>';
        } else {
            var m = midPrice();
            kindFields = '<div class="btr-note">Исполнится по лучшей цене стакана' +
                (m > 0 ? ' — сейчас ≈ ' + fmtPrice(m) + ' ₽' : '') + '. Итог зависит от рынка.</div>';
        }
        var shares = T.lots * (T.meta.lot || 1);
        var lotsField = '<div class="btr-bf"><div class="btr-bf-lab">' +
            '<label for="btLots">Лоты<i> · 1 лот = ' + (T.meta.lot || 1) + ' шт</i></label>' +
            '<span id="btLotsRef">' + lotsRefBtn() + '</span></div>' +
            '<div class="btr-bigrow"><input class="btr-big" id="btLots" type="number" step="1" min="1" value="' + T.lots + '">' +
            '<span class="btr-big-suf" id="btShares">· ' + shares.toLocaleString('ru-RU') + ' шт</span></div></div>';
        return head + side + kind + kindFields + lotsField +
            '<div class="btr-deal" id="btDeal">' + dealHtml() + '</div>' +
            '<div class="btr-warns" id="btWarns">' + warnsHtml() + '</div>' +
            '<button type="button" class="btr-submit ' + T.side + '" id="btSubmit" onclick="pftAsk()">' +
                '<span class="btr-sb-l">' + esc(submitLbl()) + '</span>' +
                '<span class="btr-sb-s">' + submitSum() + '</span></button>' +
            '<div class="btr-subnote">' + IC_SHIELD + '<span>Подтверждение вводом суммы от</span>' +
            '<input id="btSumLimit" type="number" min="1000" step="1000" value="' + sumLimit() + '"><span>₽</span></div>';
    }
    var IC_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5v-6z"/></svg>';
    function estPrice() {
        var q2n = A().q2n;
        if (T.kind === 'limit') return +T.price || 0;
        if (T.kind === 'stop') return +T.stopPrice || 0;
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
        // fat-finger только для лимитных: стоп-цена по смыслу стоит поодаль от рынка
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

    // ---- карточка заявок: табы Активные / Стоп / История ----
    function ordTime(iso) {
        try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return ''; }
    }
    function ordRow(o) {
        var ins = instrMem[o.instrumentUid] || {};
        var buy = o.direction === 'ORDER_DIRECTION_BUY';
        var q2n = A().q2n;
        var price = q2n(o.initialSecurityPrice);
        var req = +o.lotsRequested || 0, exec = +o.lotsExecuted || 0;
        var pct = req ? Math.round(exec / req * 100) : 0;
        var part = o.executionReportStatus === 'EXECUTION_REPORT_STATUS_PARTIALLYFILL' || exec > 0;
        var kindTxt = o.orderType === 'ORDER_TYPE_MARKET' ? 'рыночная' : 'лимит';
        return '<div class="btr-ordrow ' + (buy ? 'buy' : 'sell') + '">' +
            '<div class="btr-ord1">' +
                '<b>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</b>' +
                '<span class="btr-ord-meta">' + (buy ? 'покупка' : 'продажа') + ' · ' + kindTxt + '</span>' +
                '<span class="btr-ord-px">' + (price > 0 ? fmtPrice(price) + '&nbsp;₽' : '—') + '</span>' +
                '<button type="button" class="btr-ordx" title="Снять заявку" aria-label="Снять заявку" onclick="pftCancel(\'' + jsArg(o.orderId) + '\')">✕</button>' +
            '</div>' +
            '<div class="btr-ord2">' +
                (o.orderDate ? '<i>' + ordTime(o.orderDate) + '</i>' : '') +
                '<span class="btr-fill">' + exec + ' из ' + req + ' лот</span>' +
                '<span class="btr-ost ' + (part ? 'part' : 'queue') + '">' + (part ? 'частично ' + pct + '%' : 'в очереди') + '</span>' +
            '</div></div>';
    }
    function stopRow(o) {
        var ins = instrMem[o.instrumentUid] || {};
        var buy = o.direction === 'STOP_ORDER_DIRECTION_BUY';
        var tp = o.stopOrderType === 'STOP_ORDER_TYPE_TAKE_PROFIT';
        var q2n = A().q2n;
        return '<div class="btr-ordrow ' + (buy ? 'buy' : 'sell') + '">' +
            '<div class="btr-ord1">' +
                '<b>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</b>' +
                '<span class="btr-ord-meta">' + (tp ? 'тейк-профит' : 'стоп-лосс') + ' · ' + (buy ? 'покупка' : 'продажа') + '</span>' +
                '<span class="btr-ord-px">от ' + fmtPrice(q2n(o.stopPrice)) + '&nbsp;₽</span>' +
                '<button type="button" class="btr-ordx" title="Снять стоп-заявку" aria-label="Снять стоп-заявку" onclick="pftCancelStop(\'' + jsArg(o.stopOrderId) + '\')">✕</button>' +
            '</div>' +
            '<div class="btr-ord2">' +
                (o.createDate ? '<i>' + ordTime(o.createDate) + '</i>' : '') +
                '<span class="btr-fill">' + (o.lotsRequested || 0) + ' лот</span>' +
                '<span class="btr-ost queue">ждёт цены</span>' +
            '</div></div>';
    }
    function histRows() {
        var jr = (A() ? A().journal() : []).filter(function (e) { return e.ev.indexOf('order_') === 0; }).slice(0, 12)
            .map(function (e) {
                return '<div class="btr-jr"><span>' + esc(e.d || e.ev) + '</span><i>' +
                    new Date(e.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</i></div>';
            }).join('');
        return jr || '<div class="btr-none">Событий пока нет — здесь появится журнал заявок.</div>';
    }
    function ordersHtml() {
        var c = conn();
        var note = c
            ? '<div class="btr-hd-note"><span class="btr-hd-acc">' + esc(c.accountName || 'Счёт') +
                (accTail() ? ' <b>····' + accTail() + '</b>' : '') +
                (c.sandbox ? '<i class="btr-sand">песочница</i>' : '') + '</span></div>'
            : '';
        var head = PF.pfCardHead('Счёт', 'Мои заявки', null, PF.pfdInChromeHtml('trade:orders') + note);
        var tabs = '<div class="btr-ttabs" id="btOtabs">' +
            '<button type="button"' + (T.otab === 'active' ? ' class="active"' : '') + ' onclick="pftOtab(\'active\')">Активные<span class="btr-cnt">' + T.orders.length + '</span></button>' +
            '<button type="button"' + (T.otab === 'stop' ? ' class="active"' : '') + ' onclick="pftOtab(\'stop\')">Стоп<span class="btr-cnt">' + T.stops.length + '</span></button>' +
            '<button type="button"' + (T.otab === 'hist' ? ' class="active"' : '') + ' onclick="pftOtab(\'hist\')">История</button>' +
        '</div>';
        var body;
        if (T.otab === 'hist') {
            body = '<div class="btr-ords">' + histRows() + '</div>';
        } else if (T.otab === 'stop') {
            body = T.stops.length
                ? '<div class="btr-ords">' + T.stops.map(stopRow).join('') + '</div>'
                : '<div class="btr-none">Стоп-заявок нет. Выставить можно из тикета — тип «Стоп».</div>';
        } else {
            body = T.orders.length
                ? '<div class="btr-ords">' + T.orders.map(ordRow).join('') + '</div>'
                : '<div class="btr-none">Активных заявок нет — выставленные из тикета появятся здесь.</div>';
        }
        var panic = (T.otab !== 'hist' && T.orders.length + T.stops.length)
            ? '<button type="button" class="btr-panic" onclick="pftCancelAll()">Отменить все заявки</button>' : '';
        return head + tabs + body + panic;
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
    // живые кусочки тикета: суффикс штук, сводка, сумма в кнопке, референсы —
    // точечно, не трогая инпуты (фокус и ввод не сбиваются)
    function repaintTicketBits() {
        if (!T.meta || T.busy) return;
        var sh = dq('btShares');
        if (sh) sh.textContent = '· ' + (T.lots * (T.meta.lot || 1)).toLocaleString('ru-RU') + ' шт';
        var d = dq('btDeal'); if (d) d.innerHTML = dealHtml();
        var btn = dq('btSubmit');
        if (btn) {
            var l = btn.querySelector('.btr-sb-l'); if (l) l.textContent = submitLbl();
            var s = btn.querySelector('.btr-sb-s'); if (s) s.textContent = submitSum();
        }
        var pr = dq('btPxRef'); if (pr) pr.innerHTML = pxRefBtn();
        var lr = dq('btLotsRef'); if (lr) lr.innerHTML = lotsRefBtn();
    }

    // ---------- данные ----------
    // ушли с подвкладки/вкладки браузера — таймеры гасим прямо из тика
    // (рендер «Портфелей» при уходе на другой раздел не перезапускается)
    function stillHere() {
        // .btr-ob есть и в конструкторе (блок), и в fallback-сетке (.btr-grid ушёл)
        if (document.querySelector('#panel-portfolios.active .btr-ob')) return true;
        stopPolling();
        return false;
    }
    function pollOb() {
        if (!stillHere() || !T.uid || document.visibilityState !== 'visible') return;
        A().call('GetOrderBook', { instrumentId: T.uid, depth: OB_DEPTH }).then(function (d) {
            T.ob = d;
            repaintOb();
            repaintWarns();
            repaintTicketBits();
        }).catch(function () { /* тихо: следующий тик попробует снова */ });
    }
    function pollOrders() {
        if (!stillHere() || document.visibilityState !== 'visible') return;
        var c = conn(); if (!c) return;
        Promise.all([
            A().call('GetOrders', { accountId: c.accountId }),
            A().call('GetStopOrders', { accountId: c.accountId }).catch(function () { return { stopOrders: T.stops }; })
        ]).then(function (rs) {
            T.orders = (rs[0].orders || []).filter(function (o) {
                return ['EXECUTION_REPORT_STATUS_NEW', 'EXECUTION_REPORT_STATUS_PARTIALLYFILL'].indexOf(o.executionReportStatus) !== -1;
            });
            T.stops = rs[1].stopOrders || [];
            // тикеры заявок — дорезолвим в память
            T.orders.concat(T.stops).forEach(function (o) {
                if (o.instrumentUid && !instrMem[o.instrumentUid]) fetchMeta(o.instrumentUid, true);
            });
            repaintOrders();
        }).catch(function () {});
    }
    // свободные деньги и остатки бумаг — для референсов «доступно» и «свободно»
    function pollPos() {
        if (!stillHere() || document.visibilityState !== 'visible') return;
        var c = conn(); if (!c) return;
        A().call('GetPositions', { accountId: c.accountId }).then(function (d) {
            var q2n = A().q2n;
            var rub = (d.money || []).filter(function (m) {
                return String(m.currency || '').toLowerCase() === 'rub';
            })[0];
            var secs = {};
            (d.securities || []).forEach(function (s) {
                var units = +s.balance || 0;
                if (s.instrumentUid) secs[s.instrumentUid] = units;
                if (s.figi) secs[s.figi] = units;
            });
            T.pos = { money: rub ? q2n(rub) : null, secs: secs };
            repaintTicketBits();
        }).catch(function () { /* тихо: рефы просто не покажутся */ });
    }
    function pollTape() {
        if (!stillHere() || !T.uid || document.visibilityState !== 'visible') return;
        var now = Date.now();
        A().call('GetLastTrades', {
            instrumentId: T.uid,
            from: new Date(now - 15 * 60000).toISOString(),
            to: new Date(now).toISOString()
        }).then(function (d) {
            var list = (d.trades || []).slice(-12).reverse();
            T.tape = list;
            var el = dq('btTape');
            if (el) el.innerHTML = tapeHtml();
            var cnt = dq('btTapeCnt');
            if (cnt) cnt.textContent = tapeCnt();
        }).catch(function () {});
    }
    function pollStatus() {
        if (!stillHere() || !T.uid) return;
        A().call('GetTradingStatus', { instrumentId: T.uid }).then(function (d) {
            T.status = d;
            repaintWarns();
            var el = document.querySelector('.btr-instr');
            if (el && T.meta) el.innerHTML = instrHtml();
        }).catch(function () {});
    }
    function fetchMeta(uid, quiet) {
        return A().call('GetInstrumentBy', { idType: 'INSTRUMENT_ID_TYPE_UID', id: uid }).then(function (d) {
            var i = d.instrument || {};
            instrMem[uid] = {
                uid: uid, ticker: i.ticker || '', name: i.name || '', figi: i.figi || '',
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
        if (!T.tapeTimer) T.tapeTimer = setInterval(pollTape, 4000);
        if (!T.posTimer) T.posTimer = setInterval(pollPos, 15000);
        pollOb(); pollOrders(); pollStatus(); pollTape(); pollPos();
    }
    function stopPolling() {
        clearInterval(T.obTimer); clearInterval(T.ordTimer); clearInterval(T.stTimer);
        clearInterval(T.tapeTimer); clearInterval(T.posTimer);
        T.obTimer = T.ordTimer = T.stTimer = T.tapeTimer = T.posTimer = null;
    }
    // зовётся из цикла рендера portfolios.js: включает/гасит поллинг по месту
    function pftAfterRender() {
        var live = document.querySelector('#panel-portfolios.active .btr-ob');
        if (live && tradeReady()) { wire(); startPolling(); }
        else stopPolling();
    }

    // ---------- обработчики ----------
    // крупные инпуты тикета сидят в строке с суффиксом — ширина по содержимому
    function fitBig(inp) {
        if (!inp) return;
        var len = String(inp.value || inp.placeholder || '').length;
        inp.style.width = (Math.max(1, len) + 0.7) + 'ch';
    }
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
            fitBig(p);
            p.addEventListener('input', function () { T.price = p.value; fitBig(p); repaintWarns(); repaintTicketBits(); });
        }
        var sp = dq('btStop');
        if (sp && !sp._wired) {
            sp._wired = true;
            fitBig(sp);
            sp.addEventListener('input', function () { T.stopPrice = sp.value; fitBig(sp); repaintTicketBits(); });
        }
        var l = dq('btLots');
        if (l && !l._wired) {
            l._wired = true;
            fitBig(l);
            l.addEventListener('input', function () { T.lots = Math.max(1, Math.floor(+l.value || 1)); fitBig(l); repaintTicketBits(); });
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
    window.pftSearchToggle = function () {
        T.searchOpen = !T.searchOpen;
        var w = dq('btSearchWrap'); if (w) w.classList.toggle('open', T.searchOpen);
        var b = dq('btSearchTg'); if (b) b.classList.toggle('on', T.searchOpen);
        if (T.searchOpen) { var i = dq('btSearch'); if (i) i.focus(); }
    };
    window.pftTapeToggle = function () {
        T.tapeOpen = !T.tapeOpen;
        var f = dq('btTapeFold'); if (f) f.classList.toggle('open', T.tapeOpen);
    };
    window.pftOtab = function (k) { T.otab = k; repaintOrders(); };
    window.pftPick = function (n) {
        var i = T.search[n]; if (!i) return;
        T.uid = i.uid; T.ob = null; T.status = null; T.price = ''; T.searchQ = '';
        T.searchOpen = false;   // бумага выбрана — поиск сворачивается в лупу
        fetchMeta(i.uid).then(function (m) {
            T.meta = m;
            repaintCards();
            pollOb(); pollStatus(); pollTape(); pollPos();
        }, function (e) { toast(e.message, true); });
    };
    window.pftPickPrice = function (p) {
        // клик по цене стакана заполняет активное ценовое поле тикета
        if (T.kind === 'limit') {
            T.price = String(p);
            var inp = dq('btPrice'); if (inp) { inp.value = T.price; fitBig(inp); }
        } else if (T.kind === 'stop') {
            T.stopPrice = String(p);
            var sp = dq('btStop'); if (sp) { sp.value = T.stopPrice; fitBig(sp); }
        } else return;
        repaintWarns(); repaintTicketBits();
    };
    // референс «рынок» — середина стакана, округлённая до шага инструмента
    window.pftUseMarket = function () {
        var m = midPrice(); if (!(m > 0) || !T.meta) return;
        var inc = T.meta.minInc || 0.01;
        window.pftPickPrice(String(+(Math.round(m / inc) * inc).toFixed(6)));
    };
    // референс «доступно / в позиции» — подставляет максимум лотов
    window.pftUseAvail = function () {
        var n = availLots(); if (!(n > 0)) return;
        T.lots = n;
        var l = dq('btLots'); if (l) { l.value = n; fitBig(l); }
        repaintTicketBits();
    };
    window.pftSide = function (s) { T.side = s; repaintCards(); };
    window.pftKind = function (k) { T.kind = k; repaintCards(); };
    window.pftStopKind = function (k) { T.stopKind = k; repaintCards(); };

    // подтверждение заявки: своя модалка (pfConfirm не умеет ввод суммы)
    window.pftAsk = function () {
        if (!tradeReady() || !T.meta || T.busy) return;
        var vel = velLeft();
        if (vel > 0) { toast('Пауза после ' + VEL_MAX + ' заявок подряд — ещё ' + Math.ceil(vel / 1000) + ' с', true); return; }
        var lots = Math.max(1, Math.floor(+T.lots || 1));
        var inc = T.meta.minInc || 0.01;
        // цены — по шагу инструмента, иначе брокер отклонит заявку
        function snap(v, inputId, label) {
            var s = +(Math.round(v / inc) * inc).toFixed(6);
            if (Math.abs(s - v) > 1e-9) {
                var inp = dq(inputId); if (inp) { inp.value = String(s); fitBig(inp); }
                toast(label + ' округлена до шага ' + fmtPrice(inc));
            }
            return s;
        }
        var price = +T.price || 0;
        var stopPrice = +T.stopPrice || 0;
        if (T.kind === 'limit') {
            if (!(price > 0)) { toast('Укажите цену лимитной заявки', true); return; }
            price = snap(price, 'btPrice', 'Цена');
            T.price = String(price);
        }
        if (T.kind === 'stop') {
            if (!(stopPrice > 0)) { toast('Укажите стоп-цену активации', true); return; }
            stopPrice = snap(stopPrice, 'btStop', 'Стоп-цена');
            T.stopPrice = String(stopPrice);
        }
        var shares = lots * (T.meta.lot || 1);
        var est = T.kind === 'limit' ? price : (T.kind === 'stop' ? stopPrice : estPrice());
        var sum = est * shares;
        T.orderId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        var needType = sum >= sumLimit();
        var typed = Math.round(sum);
        var c = conn();
        var accStr = c ? (c.accountName || 'Счёт') + (accTail() ? ' ····' + accTail() : '') + (c.sandbox ? ' · песочница' : '') : '';
        var old = dq('btConfirmOv'); if (old) old.remove();
        var ov = document.createElement('div');
        ov.id = 'btConfirmOv';
        var kindName = T.kind === 'limit' ? 'Лимитная'
            : (T.kind === 'stop' ? (T.stopKind === 'tp' ? 'Тейк-профит' : 'Стоп-лосс') : 'Рыночная');
        ov.innerHTML = '<div class="bk-back"></div><div class="bk-card bk-card-pin btr-cf" role="alertdialog" aria-modal="true">' +
            '<div class="bk-title">' + (T.side === 'buy' ? 'Покупка' : 'Продажа') + ' ' + esc(T.meta.ticker) + '</div>' +
            '<div class="bk-kv"><span>Тип</span><b>' + kindName + '</b></div>' +
            (T.kind === 'limit' ? '<div class="bk-kv"><span>Цена</span><b class="bk-mono">' + fmtPrice(price) + ' ₽</b></div>' : '') +
            (T.kind === 'stop' ? '<div class="bk-kv"><span>Стоп-цена</span><b class="bk-mono">' + fmtPrice(stopPrice) + ' ₽</b></div>' : '') +
            '<div class="bk-kv"><span>Количество</span><b>' + lots + ' лот = ' + shares.toLocaleString('ru-RU') + ' шт</b></div>' +
            '<div class="bk-kv"><span>' + (T.kind === 'limit' ? 'Сумма' : 'Сумма ≈') + '</span><b class="bk-mono">' + fmtRub(sum) + '</b></div>' +
            (accStr ? '<div class="bk-kv"><span>Счёт</span><b>' + esc(accStr) + '</b></div>' : '') +
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
                var got = String((dq('btCfSum') || {}).value || '').replace(/[\s ]/g, '');
                if (got !== String(typed)) {
                    toast('Сумма не совпала — проверьте ещё раз', true);
                    return;
                }
            }
            closeCf();
            submitOrder(lots, T.kind === 'stop' ? stopPrice : price, sum);
        });
    };

    function submitOrder(lots, price, sum) {
        var c = conn(); if (!c || T.busy) return;
        T.busy = true;
        var btn = dq('btSubmit');
        if (btn) {
            btn.disabled = true;
            var bl = btn.querySelector('.btr-sb-l'); if (bl) bl.textContent = 'Отправляем…';
        }
        var isStop = T.kind === 'stop';
        var method, body;
        if (isStop) {
            // у стоп-заявок нет клиентского idempotency-ключа в API —
            // страхуют busy-флаг и velocity-лимит
            method = 'PostStopOrder';
            body = {
                accountId: c.accountId,
                instrumentId: T.uid,
                quantity: String(lots),
                direction: T.side === 'buy' ? 'STOP_ORDER_DIRECTION_BUY' : 'STOP_ORDER_DIRECTION_SELL',
                stopPrice: A().n2q(price),
                stopOrderType: T.stopKind === 'tp' ? 'STOP_ORDER_TYPE_TAKE_PROFIT' : 'STOP_ORDER_TYPE_STOP_LOSS',
                expirationType: 'STOP_ORDER_EXPIRATION_TYPE_GOOD_TILL_CANCEL'
            };
        } else {
            method = 'PostOrder';
            body = {
                accountId: c.accountId,
                instrumentId: T.uid,
                quantity: String(lots),
                direction: T.side === 'buy' ? 'ORDER_DIRECTION_BUY' : 'ORDER_DIRECTION_SELL',
                orderType: T.kind === 'limit' ? 'ORDER_TYPE_LIMIT' : 'ORDER_TYPE_MARKET',
                orderId: T.orderId
            };
            if (T.kind === 'limit') body.price = A().n2q(price);
        }
        A().call(method, body).then(function () {
            T.busy = false;
            T.sent.push(Date.now());
            T.orderId = null;   // исполненный ключ не переиспользуем
            var kindTxt = isStop ? (T.stopKind === 'tp' ? 'тейк-профит от ' : 'стоп-лосс от ') + fmtPrice(price) + ' ₽'
                : (T.kind === 'limit' ? fmtPrice(price) + ' ₽' : 'рыночная');
            A().logEvent('order_submit', (T.side === 'buy' ? 'покупка ' : 'продажа ') + T.meta.ticker +
                ' · ' + lots + ' лот · ' + kindTxt);
            toast((isStop ? 'Стоп-заявка' : 'Заявка') + ' выставлена: ' + T.meta.ticker);
            pollOrders(); pollPos();
            repaintCards();
        }, function (e) {
            T.busy = false;
            // T.orderId сохраняем: повтор той же попытки не продублирует заявку
            A().logEvent('order_error', T.meta.ticker + ' · ' + (e.message || '').slice(0, 120));
            toast(e.message || 'Заявка не прошла', true);
            var b = dq('btSubmit'); if (b) b.disabled = false;
            repaintTicketBits();
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
    window.pftCancelStop = function (stopOrderId) {
        var c = conn(); if (!c) return;
        PF.pfConfirm({ danger: true, title: 'Снять стоп-заявку?', text: 'Стоп-заявка будет отменена.', ok: 'Снять' }, function () {
            A().call('CancelStopOrder', { accountId: c.accountId, stopOrderId: stopOrderId }).then(function () {
                A().logEvent('order_cancel', 'стоп-заявка снята');
                toast('Стоп-заявка снята');
                pollOrders();
            }, function (e) { toast(e.message, true); });
        });
    };
    window.pftCancelAll = function () {
        var c = conn(); if (!c) return;
        var total = T.orders.length + T.stops.length;
        if (!total) return;
        PF.pfConfirm({ danger: true, title: 'Отменить все заявки?',
            text: 'Будут сняты все активные заявки (' + T.orders.length + ') и стоп-заявки (' + T.stops.length + ').', ok: 'Отменить все' }, function () {
            var chain = Promise.resolve(), ok = 0;
            T.orders.forEach(function (o) {
                chain = chain.then(function () {
                    return A().call('CancelOrder', { accountId: c.accountId, orderId: o.orderId })
                        .then(function () { ok++; }, function () {});
                });
            });
            T.stops.forEach(function (o) {
                chain = chain.then(function () {
                    return A().call('CancelStopOrder', { accountId: c.accountId, stopOrderId: o.stopOrderId })
                        .then(function () { ok++; }, function () {});
                });
            });
            chain.then(function () {
                A().logEvent('order_cancel', 'паник-отмена: снято ' + ok + ' из ' + total);
                toast('Снято заявок: ' + ok);
                pollOrders();
            });
        });
    };

    // подключение сменилось (подключили/отключили/заблокировали) — гасим
    // таймеры при уходе и СРАЗУ перерисовываем вкладку «Торговля», чтобы гейт
    // сменился терминалом (и наоборот) без ручной перезагрузки страницы
    window.addEventListener('broker-conn-change', function () {
        if (!tradeReady()) stopPolling();
        if (document.querySelector('#panel-portfolios.active') &&
            PF.pfxEffTab && PF.pfxEffTab() === 'trading') {
            PF.pfdRerender();
        }
    });

    PF.pftTerminalHtml = pftTerminalHtml;
    PF.pftAfterRender = pftAfterRender;
    // карточки-блоки для дашборд-конструктора «Торговли» (см. portfolios-dash.js)
    PF.pftObCard = obCard;
    PF.pftTicketCard = ticketCard;
    PF.pftOrdersCard = ordersCard;
    PF.pftLiveBanner = bannerHtml;
    PF.pftTradeReady = tradeReady;
})();
