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
// Свои заявки видны и в САМОМ стакане (myOrdersByPx): на цене — пилюля с
// остатком лотов, вне глубины лестницы — полоска «выше/ниже стакана».
//
// СЛОТЫ БУМАГ (2026-07-18): терминал держит НЕСКОЛЬКО бумаг разом. Слот —
// это пара «стакан + тикет» с собственной бумагой; блоки конструктора
// зовутся trade:ob / trade:ob:2 / trade:ob:3 (и так же trade:ticket:N),
// номер слота = суффикс. Состояние слота живёт в SLOTS[n], общее по счёту
// (заявки, позиции, лимит частоты) — в T. Выбранные бумаги переживают
// перезагрузку страницы: bt_slots_v1 в localStorage (ЛОКАЛЬНО, не в облако —
// брокерское наружу не ходит). «Мои заявки» — один виджет на счёт: заявки
// приходят по всем бумагам сразу.
//
// Предохранители (мировая практика бирж, обсуждение 2026-07-17):
//   · каждая заявка — модалка подтверждения с полными деталями;
//   · сумма выше порога — подтверждение вводом суммы руками;
//   · idempotency: клиентский orderId (UUID) на попытку — двойной клик и
//     ретрай после таймаута не продублируют заявку;
//   · fat-finger: лимит-цена дальше 5% от середины стакана — жёлтый варн;
//   · velocity: больше 5 заявок за минуту — пауза (общая на счёт);
//   · вне торговой сессии — предупреждение в тикете;
//   · паник-кнопка «Отменить все заявки»;
//   · боевой контур (не песочница) — баннер до первого «понятно».
// Поллинг: стакан 2с (по каждому живому слоту), заявки 6с, позиции 15с,
// лента 4с только у РАЗВЁРНУТОЙ ленты — ТОЛЬКО на активной подвкладке и
// видимой вкладке браузера; таймеры гасятся при уходе (pftAfterRender).

(function () {
    'use strict';
    var PF = window.PF;
    var dq = PF.dq, esc = PF.esc, fmtRub = PF.fmtRub, jsArg = PF.jsArg, toast = PF.toast;

    var FF_DEV = 0.05;            // fat-finger: 5% от середины стакана
    var VEL_MAX = 5, VEL_WIN = 60000;   // velocity: 5 заявок в минуту
    var SUM_LIMIT_KEY = 'bt_sum_limit_v1';   // порог «подтвердить суммой», ₽
    var LIVE_SEEN_KEY = 'bt_live_seen_v1';   // баннер боевого контура закрыт
    var SLOTS_KEY = 'bt_slots_v1';           // выбранные бумаги (переживают перезагрузку)
    var OB_DEPTH = 10;
    // потолок слотов: каждый живой стакан — свой запрос раз в 2с, а лимит
    // MarketData у брокера общий на токен; 4 бумаги = 120 запросов/мин с запасом
    var MAX_SLOTS = 4;

    // ---------- состояние ----------
    // общее по СЧЁТУ (одно на терминал, от бумаги не зависит)
    var T = {
        orders: [], stops: [],        // активные заявки и стоп-заявки — по всем бумагам
        pos: { money: null, secs: {} },   // свободные ₽ и остатки бумаг (GetPositions)
        sent: [],                     // таймстемпы отправок (velocity — лимит счёта)
        otab: 'active',               // вкладка «Моих заявок»: active | stop | hist
        obTimer: null, ordTimer: null, stTimer: null, tapeTimer: null, posTimer: null
    };
    // состояние ОДНОЙ бумаги (у каждого слота своё)
    function newSlot() {
        return {
            uid: null, meta: null,        // выбранный инструмент и его паспорт
            ob: null, status: null,       // стакан и статус торгов
            side: 'buy', kind: 'limit', price: '', lots: 1,
            stopKind: 'sl', stopPrice: '',// стоп-заявки: стоп-лосс/тейк-профит + цена активации
            tape: [],                     // лента обезличенных сделок
            search: [], searchQ: '',
            searchOpen: true,             // поиск виден, пока бумага не выбрана; дальше — лупой
            tapeOpen: false,              // лента сделок под шевроном, по умолчанию свёрнута
            orderId: null,                // idempotency-ключ текущего подтверждения
            metaStale: false,             // паспорт из localStorage — обновить с сервера
            busy: false                   // идёт отправка заявки ИЗ ЭТОГО слота
        };
    }
    var SLOTS = {};
    function S(n) {
        n = slotNo(n);
        return SLOTS[n] || (SLOTS[n] = newSlot());
    }
    function slotNo(n) { n = Math.floor(+n || 1); return n >= 1 ? n : 1; }
    // id блоков конструктора: первый слот исторически без суффикса
    function obId(n) { return slotNo(n) === 1 ? 'trade:ob' : 'trade:ob:' + slotNo(n); }
    function tkId(n) { return slotNo(n) === 1 ? 'trade:ticket' : 'trade:ticket:' + slotNo(n); }
    // id элементов внутри карточки слота (btPrice_2 и т.д.)
    function eid(base, n) { return 'bt' + base + '_' + slotNo(n); }
    function dqs(base, n) { return dq(eid(base, n)); }

    // какие слоты вообще заведены: первый всегда + всё, что записано в раскладку
    // подвкладки (конструктор — источник правды о существовании блока)
    function slotNums() {
        var set = { 1: 1 };
        ((PF.dashCfg && PF.dashCfg.order) || []).forEach(function (id) {
            var m = /^trade:(?:ob|ticket):(\d+)$/.exec(id);
            if (m) set[slotNo(m[1])] = 1;
        });
        // слот с выбранной бумагой жив даже без записи в раскладке (восстановился
        // из localStorage); пустые заготовки от S(n) сюда не попадают
        Object.keys(SLOTS).forEach(function (n) { if (SLOTS[n].uid) set[slotNo(n)] = 1; });
        return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    }
    // какие слоты СЕЙЧАС на экране: только их и опрашиваем (скрытый блок молчит)
    function liveSlots() {
        var out = [], seen = {};
        var els = document.querySelectorAll('#panel-portfolios.active .btr-card[data-slot]');
        Array.prototype.forEach.call(els, function (el) {
            var n = slotNo(el.getAttribute('data-slot'));
            if (!seen[n]) { seen[n] = 1; out.push(n); }
        });
        return out;
    }
    function nextFreeSlot() {
        var used = slotNums();
        for (var i = 1; i <= MAX_SLOTS; i++) if (used.indexOf(i) < 0) return i;
        return 0;
    }

    // ---------- персист выбранных бумаг ----------
    // Паспорт приходит из localStorage — значит, может быть подделан или протух:
    // приводим типы руками и не пускаем внутрь ничего сверх известных полей.
    // идентификаторы брокера — только буквы, цифры, дефис и подчёркивание:
    // «[object Object]» из битой записи не должен изображать figi
    function normId(v) {
        var s = String(v == null ? '' : v).slice(0, 64);
        return /^[A-Za-z0-9_-]*$/.test(s) ? s : '';
    }
    function normMeta(m) {
        if (!m || typeof m !== 'object') return null;
        var t = String(m.ticker || '').slice(0, 24);
        if (!t) return null;
        return {
            uid: normId(m.uid),
            ticker: t,
            name: String(m.name || '').slice(0, 160),
            figi: normId(m.figi),
            lot: Math.max(1, Math.floor(+m.lot || 1)),
            minInc: +m.minInc > 0 ? +m.minInc : 0.01
        };
    }
    function saveSlots() {
        var out = {};
        Object.keys(SLOTS).forEach(function (n) {
            var s = SLOTS[n];
            if (!s.uid || !s.meta) return;
            out[n] = {
                uid: s.uid, meta: s.meta, side: s.side, kind: s.kind,
                price: String(s.price || '').slice(0, 24),
                stopKind: s.stopKind, stopPrice: String(s.stopPrice || '').slice(0, 24),
                lots: s.lots, tapeOpen: !!s.tapeOpen
            };
        });
        try { localStorage.setItem(SLOTS_KEY, JSON.stringify(out)); } catch (e) {}
    }
    var slotsLoaded = false;
    function loadSlots() {
        if (slotsLoaded) return;
        slotsLoaded = true;
        var o;
        try { o = JSON.parse(localStorage.getItem(SLOTS_KEY) || 'null'); } catch (e) { return; }
        if (!o || typeof o !== 'object') return;
        Object.keys(o).forEach(function (k) {
            // ключ — НОМЕР слота: без этой проверки битый ключ ('abc' → NaN → 1)
            // молча садился на первый слот и вытеснял настоящую бумагу
            if (!/^[1-9]\d*$/.test(k)) return;
            var n = slotNo(k), v = o[k];
            if (n > MAX_SLOTS || !v || typeof v !== 'object') return;
            var meta = normMeta(v.meta);
            var uid = normId(v.uid);
            if (!meta || !uid) return;
            var s = S(n);
            s.uid = uid;
            s.meta = meta;
            s.side = v.side === 'sell' ? 'sell' : 'buy';
            s.kind = ['limit', 'market', 'stop'].indexOf(v.kind) >= 0 ? v.kind : 'limit';
            s.stopKind = v.stopKind === 'tp' ? 'tp' : 'sl';
            s.price = numStr(v.price);
            s.stopPrice = numStr(v.stopPrice);
            s.lots = Math.max(1, Math.floor(+v.lots || 1));
            s.tapeOpen = !!v.tapeOpen;
            s.searchOpen = false;      // бумага уже выбрана — поиск свёрнут в лупу
            s.metaStale = true;        // лотность/шаг могли смениться — обновим с сервера
            instrMem[s.uid] = meta;
        });
    }
    // в поле цены пускаем только число (из хранилища может прийти что угодно)
    function numStr(v) {
        var s = String(v == null ? '' : v).trim();
        return /^\d{0,12}(\.\d{0,6})?$/.test(s) ? s : '';
    }

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
    // цену печатаем по шагу СВОЕЙ бумаги: у слотов он разный
    function fmtPx(n, s) {
        var d = s && s.meta && s.meta.minInc < 0.01 ? 4 : 2;
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
    // карточки терминала — самостоятельные блоки дашборд-конструктора
    // (drag/resize/шестерёнка/корзина через .pfd-chrome, как у всех виджетов);
    // data-slot — якорь точечных перерисовок и опроса живых слотов
    function obCard(n) {
        n = slotNo(n);
        return '<div class="dash2-card pf-card2 btr-card btr-ob" data-slot="' + n + '">' + obCardHtml(n) + '</div>';
    }
    function ticketCard(n) {
        n = slotNo(n);
        return '<div class="dash2-card pf-card2 btr-card btr-ticket" data-slot="' + n + '">' + ticketHtml(n) + '</div>';
    }
    function ordersCard() { return '<div class="dash2-card pf-card2 btr-card btr-orders">' + ordersHtml() + '</div>'; }
    // fallback-раскладка (фиксированная сетка) — если конструктор недоступен;
    // основной путь рендерит карточки блоками через pfdBodyHtml (portfolios.js)
    function pftTerminalHtml() {
        loadSlots();
        var cards = slotNums().map(function (n) { return obCard(n) + ticketCard(n); }).join('');
        return '<div class="pfd-grid" id="pfdGrid"><div class="btr-wrap" style="grid-column: 1 / span 12">' +
            bannerHtml() +
            '<div class="btr-grid">' + cards + ordersCard() + '</div></div></div>';
    }

    var IC_LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    var IC_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    var IC_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

    // ---- карточка стакана ----
    // статус торгов — тихая точка с подписью (без пилюли)
    function statusDot(s) {
        if (!s.uid) return '';
        var st = s.status && s.status.tradingStatus;
        var open = st === 'SECURITY_TRADING_STATUS_NORMAL_TRADING';
        return '<span class="btr-st ' + (open ? 'ok' : 'off') + '"><i></i>' +
            (open ? 'торги идут' : 'сессия закрыта') + '</span>';
    }
    function instrHtml(s) {
        if (!s.meta) return '';
        return '<b>' + esc(s.meta.ticker) + '</b><span>' + esc(s.meta.name) + '</span>' + statusDot(s);
    }
    // заголовок блока называет БУМАГУ: со вторым стаканом «Стакан» и «Стакан»
    // не различить, а карточки конструктора можно растащить по разным углам
    function slotTitle(base, n) {
        var s = S(n);
        return s.meta ? base + ' · ' + s.meta.ticker : (slotNums().length > 1 ? base + ' ' + n : base);
    }
    function obCardHtml(n) {
        n = slotNo(n);
        var s = S(n);
        var lens = '<button type="button" class="btr-iconbtn' + (s.searchOpen ? ' on' : '') + '" id="' + eid('SearchTg', n) + '" ' +
            'title="Поиск бумаги" aria-label="Поиск бумаги" onclick="pftSearchToggle(' + n + ')">' + IC_LENS + '</button>';
        // «+» — быстрый путь ко второй бумаге, не заходя в «Добавить виджет»
        var add = nextFreeSlot()
            ? '<button type="button" class="btr-iconbtn" title="Ещё одна бумага: стакан и заявка" ' +
              'aria-label="Добавить стакан по другой бумаге" onclick="pftAddSlot()">' + IC_PLUS + '</button>'
            : '';
        // кнопки конструктора — в потоке шапки ПЕРЕД лупой (PFD_OWN_CHROME, R9.2)
        var head = PF.pfCardHead('', slotTitle('Стакан', n), null, PF.pfdInChromeHtml(obId(n)) + add + lens);
        var search = '<div class="btr-search' + (s.searchOpen ? ' open' : '') + '" id="' + eid('SearchWrap', n) + '">' +
            '<input class="ph-input" id="' + eid('Search', n) + '" type="text" ' +
            'placeholder="Тикер или название — например, SBER" autocomplete="off" spellcheck="false" value="' + esc(s.searchQ) + '">' +
            '<div class="btr-search-drop" id="' + eid('SearchDrop', n) + '"></div></div>';
        var title = s.meta ? '<div class="btr-instr" id="' + eid('Instr', n) + '">' + instrHtml(s) + '</div>' : '';
        var tape = s.uid
            ? '<div class="btr-fold' + (s.tapeOpen ? ' open' : '') + '" id="' + eid('TapeFold', n) + '">' +
                '<button type="button" class="btr-fold-btn" onclick="pftTapeToggle(' + n + ')">' +
                    '<span class="btr-fold-lab">Лента сделок</span>' +
                    '<span class="btr-fold-cnt" id="' + eid('TapeCnt', n) + '">' + tapeCnt(s) + '</span>' +
                    '<span class="btr-fold-ch">' + IC_CHEV + '</span>' +
                '</button>' +
                '<div class="btr-fold-body"><div class="btr-tape" id="' + eid('Tape', n) + '">' + tapeHtml(s) + '</div></div>' +
              '</div>'
            : '';
        return head + search + title + '<div id="' + eid('Ob', n) + '">' + obHtml(n) + '</div>' + tape;
    }
    function tapeCnt(s) { return s.tape.length ? s.tape.length + ' за 15 мин' : ''; }
    function tapeHtml(s) {
        if (!s.tapeOpen) return '<div class="btr-tape-empty">Раскройте ленту — покажем сделки за последние 15 минут.</div>';
        if (!s.tape.length) return '<div class="btr-tape-empty">Сделок за последние минуты нет.</div>';
        var q2n = A().q2n;
        return s.tape.slice(0, 10).map(function (t) {
            var buy = t.direction === 'TRADE_DIRECTION_BUY';
            var tm = '';
            try { tm = new Date(t.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) {}
            return '<div class="btr-tape-row"><i>' + tm + '</i>' +
                '<b class="' + (buy ? 'bid' : 'ask') + '">' + fmtPx(q2n(t.price), s) + '</b>' +
                '<span>' + (+t.quantity || 0).toLocaleString('ru-RU') + '</span></div>';
        }).join('');
    }
    // пустой стакан (закрытая сессия / неликвид) — не голый текст, а плашка со
    // статусом и последней/закрывающей ценой: пользователю есть на что смотреть
    var OB_EMPTY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h8M4 12h13M4 17h6"/><circle cx="17" cy="8" r="3.2"/><path d="m19.4 10.4 2.1 2.1"/></svg>';
    function obEmptyHtml(s, q2n) {
        var lp = q2n(s.ob.lastPrice), cp = q2n(s.ob.closePrice);
        var closed = !!(s.status && s.status.tradingStatus &&
            s.status.tradingStatus !== 'SECURITY_TRADING_STATUS_NORMAL_TRADING');
        var px = (lp || cp)
            ? '<div class="btr-obempty-px">' +
                (lp ? '<div><span>Последняя</span><b>' + fmtPx(lp, s) + ' ₽</b></div>' : '') +
                (cp ? '<div><span>Закрытие</span><b>' + fmtPx(cp, s) + ' ₽</b></div>' : '') +
              '</div>' : '';
        return '<div class="btr-obempty">' +
            '<div class="btr-obempty-ic">' + OB_EMPTY_SVG + '</div>' +
            '<div class="btr-obempty-tt">' + (closed ? 'Сессия закрыта' : 'Заявок сейчас нет') + '</div>' +
            '<div class="btr-obempty-tx">' + (closed
                ? 'Стакан наполнится с открытием торгов. Лимитную заявку можно выставить заранее — она дождётся открытия.'
                : 'В стакане по этой бумаге сейчас нет активных заявок.') + '</div>' +
            px + '</div>';
    }

    // ---- свои заявки прямо в стакане ----
    // Своя лимитная заявка по бумаге СЛОТА отмечается на строке стакана: видно,
    // на какой цене она стоит и сколько лотов очереди — мои. Заявку вне глубины
    // стакана (далеко от рынка) строкой не покажешь — она уходит в отдельную
    // полоску над/под лестницей, иначе выставил и «потерял».
    // Ключ — цена в шагах инструмента: и стакан, и заявка приходят как units+nano,
    // сравнивать их напрямую нельзя (плавающая точка).
    function pxStep(s) { return (s.meta && s.meta.minInc) || 0.01; }
    function pxKey(p, s) { return String(Math.round(p / pxStep(s))); }
    // Цена заявки ЗА ШТУКУ. initialSecurityPrice приходит не всегда (у части
    // заявок брокер отдаёт 0 либо не отдаёт поле вовсе) — тогда считаем её из
    // суммы заявки: initialOrderPrice = цена × лотность × лоты. Без запасного
    // пути такая заявка молча пропадала из стакана: у брокера висит, а метки
    // нет — и это читалось как «во втором стакане заявка не показывается».
    function ordPx(o, s) {
        var q2n = A().q2n;
        var px = q2n(o.initialSecurityPrice);
        if (px > 0) return px;
        var tot = q2n(o.initialOrderPrice) || q2n(o.totalOrderAmount);
        var req = +o.lotsRequested || 0;
        var lot = (s.meta && s.meta.lot) || 1;
        if (tot > 0 && req > 0) return tot / (req * lot);
        return q2n(o.averagePositionPrice) || 0;
    }
    // ---- свои заявки по цене ----
    // Лимитка СТОИТ В ОЧЕРЕДИ стакана, стоп ЖДЁТ АКТИВАЦИИ — это разные ответы
    // на «что здесь моего», поэтому считаем их врозь и метим разными знаками.
    // out.px — по цене в шагах инструмента; out.noPx — заявки, чью цену брокер
    // так и не дал: их всё равно показываем полоской, иначе «выставил и потерял».
    function myOrdersByPx(s) {
        var out = { px: {}, noPx: [] };
        if (!s.uid || !A()) return out;
        var figi = s.meta && s.meta.figi;
        function isMine(o) { return o.instrumentUid === s.uid || !!(figi && o.figi === figi); }
        function at(px) {
            var k = pxKey(px, s);
            return out.px[k] || (out.px[k] = { px: px, lots: 0, buy: 0, sell: 0, stopLots: 0, stopBuy: 0, stopSell: 0, tp: 0, sl: 0 });
        }
        T.orders.forEach(function (o) {
            if (!isMine(o)) return;
            if (o.orderType === 'ORDER_TYPE_MARKET') return;   // у рыночной цены в стакане нет
            // в очереди стоит только неисполненный остаток
            var left = Math.max(0, (+o.lotsRequested || 0) - (+o.lotsExecuted || 0));
            if (!left) return;
            var buy = o.direction === 'ORDER_DIRECTION_BUY';
            var px = ordPx(o, s);
            if (!(px > 0)) { out.noPx.push({ lots: left, buy: buy, stop: false }); return; }
            var e = at(px);
            e.lots += left;
            if (buy) e.buy += left; else e.sell += left;
        });
        T.stops.forEach(function (o) {
            if (!isMine(o)) return;
            var lots = Math.max(0, Math.floor(+o.lotsRequested || 0));
            if (!lots) return;
            var buy = o.direction === 'STOP_ORDER_DIRECTION_BUY';
            var tp = o.stopOrderType === 'STOP_ORDER_TYPE_TAKE_PROFIT';
            var px = A().q2n(o.stopPrice);
            if (!(px > 0)) { out.noPx.push({ lots: lots, buy: buy, stop: true, tp: tp }); return; }
            var e = at(px);
            e.stopLots += lots;
            if (buy) e.stopBuy += lots; else e.stopSell += lots;
            if (tp) e.tp += lots; else e.sl += lots;
        });
        return out;
    }
    function sideWord(buy, sell) {
        return (buy && sell) ? 'мои заявки' : buy ? 'моя покупка' : 'моя продажа';
    }
    function limTitle(m, s) {
        var side = (m.buy && m.sell) ? 'заявки' : (m.buy ? 'покупка' : 'продажа');
        return 'Ваша ' + side + ' · ' + m.lots + ' лот в очереди по ' + fmtPx(m.px, s) + ' ₽';
    }
    function stopTitle(m, s) {
        var both = m.tp && m.sl;
        return (both ? 'Ваши стоп-заявки' : 'Ваш ' + (m.tp ? 'тейк-профит' : 'стоп-лосс')) +
            ' · ' + m.stopLots + ' лот · активация по ' + fmtPx(m.px, s) + ' ₽';
    }
    // метки у центра оси: лимит — заливкой (уже в очереди), стоп — контуром
    // (цена ещё не наступила, в стакане этих лотов нет)
    function myMarks(m, s) {
        var h = '';
        if (m.lots) h += '<span class="btr-axmine" title="' + esc(limTitle(m, s)) + '">' + m.lots + '</span>';
        if (m.stopLots) h += '<span class="btr-axmine stop" title="' + esc(stopTitle(m, s)) + '">' + m.stopLots + '</span>';
        return h ? '<span class="btr-axmk">' + h + '</span>' : '';
    }
    // полоска «моя заявка вне лестницы»: цена далеко от рынка либо стакан пуст
    function myOutRow(m, where, s, n, stop) {
        var lots = stop ? m.stopLots : m.lots;
        var buy = stop ? m.stopBuy : m.buy, sell = stop ? m.stopSell : m.sell;
        var what = stop
            ? ((m.tp && m.sl) ? 'мои стопы' : m.tp ? 'мой тейк-профит' : 'мой стоп-лосс')
            : sideWord(buy, sell);
        return '<div class="btr-axout' + (stop ? ' stop' : '') + (where ? ' ' + where : '') + '" role="button" ' +
            'title="' + esc(stop ? stopTitle(m, s) : limTitle(m, s)) + '" onclick="pftPickPrice(' + n + ',\'' + jsArg(String(m.px)) + '\')">' +
            '<span class="btr-axout-d ' + (sell && !buy ? 'sell' : 'buy') + '"></span>' +
            '<b>' + fmtPx(m.px, s) + ' ₽</b>' +
            '<span>' + what + ' · ' + lots + ' лот</span>' +
            '<i>' + (stop ? 'активация' : where === 'up' ? 'выше стакана' : where === 'down' ? 'ниже стакана' : 'ждёт очереди') + '</i>' +
        '</div>';
    }
    // цену брокер не прислал — на ось заявку не поставить, но и потерять нельзя:
    // показываем без цены, чтобы «выставил и не вижу» не случалось вовсе
    function myNoPxRow(m) {
        var what = m.stop ? (m.tp ? 'мой тейк-профит' : 'мой стоп-лосс') : (m.buy ? 'моя покупка' : 'моя продажа');
        return '<div class="btr-axout nopx" title="Брокер не прислал цену этой заявки — она видна в карточке «Мои заявки»">' +
            '<span class="btr-axout-d ' + (m.buy ? 'buy' : 'sell') + '"></span>' +
            '<b>—</b><span>' + what + ' · ' + m.lots + ' лот</span>' +
            '<i>цена не пришла</i></div>';
    }
    function myOutList(mine, seen, hiPx, loPx, last, s, n) {
        var up = [], down = [];
        Object.keys(mine.px).forEach(function (k) {
            if (seen[k]) return;
            var m = mine.px[k];
            // между строками разреженного стакана — относим по последней цене
            var above = hiPx == null ? false : (m.px > hiPx || (m.px >= loPx && m.px > last));
            (above ? up : down).push(m);
        });
        // на одной цене могут стоять и лимитка, и стоп — тогда это две полоски:
        // очередь и активация живут по разным правилам, в одну строку не сводятся
        function rows(list, where) {
            list.sort(function (a, b) { return b.px - a.px; });
            return list.map(function (m) {
                return (m.lots ? myOutRow(m, where, s, n, false) : '') +
                       (m.stopLots ? myOutRow(m, where, s, n, true) : '');
            }).join('');
        }
        return {
            up: rows(up, hiPx == null ? '' : 'up'),
            down: rows(down, hiPx == null ? '' : 'down') + mine.noPx.map(myNoPxRow).join('')
        };
    }
    // стакан по оси цены: [объём спроса ←] цена [→ объём предложения];
    // клик по строке кладёт цену в активное ценовое поле тикета
    function obHtml(n) {
        n = slotNo(n);
        var s = S(n);
        if (!s.uid) return '<div class="pfal-empty">Найдите бумагу в поиске — стакан появится здесь. Подсказка: тикеры есть в виджете «Позиции у брокера».</div>';
        if (!s.ob) return '<div class="btr-obwait">Загружаем стакан…</div>';
        var q2n = A().q2n;
        var asks = (s.ob.asks || []).slice(0, OB_DEPTH);
        var bids = (s.ob.bids || []).slice(0, OB_DEPTH);
        var mine = myOrdersByPx(s), seen = {};
        // стакан пуст (закрытая сессия/неликвид) — заявка всё равно висит: показываем
        if (!asks.length && !bids.length) {
            var solo = myOutList(mine, seen, null, null, 0, s, n);
            return obEmptyHtml(s, q2n) + (solo.up + solo.down);
        }
        var maxQ = 1;
        asks.concat(bids).forEach(function (r) { maxQ = Math.max(maxQ, +r.quantity || 0); });
        // best — лучшая цена (верх бидов / низ асков), примыкает к центру: акцент
        function row(r, side, best) {
            var p = q2n(r.price), q = +r.quantity || 0;
            var w = Math.max(4, Math.round(q / maxQ * 100));
            var k = pxKey(p, s), m = mine.px[k];
            if (m) seen[k] = 1;
            // метка стоит у центра оси (рядом с ценой), где начинается полоса объёма
            var badge = m ? myMarks(m, s) : '';
            var half = '<span class="btr-axh"><i style="width:' + w + '%"></i><em>' + q.toLocaleString('ru-RU') + '</em>' + badge + '</span>';
            return '<div class="btr-axrow ' + side + (best ? ' best' : '') + (m ? ' mine' : '') + '" role="button" onclick="pftPickPrice(' + n + ',\'' + jsArg(String(p)) + '\')">' +
                (side === 'bid' ? half : '<span class="btr-axh"></span>') +
                '<b>' + fmtPx(p, s) + '</b>' +
                (side === 'ask' ? half : '<span class="btr-axh"></span>') +
            '</div>';
        }
        var bb = bids.length ? q2n(bids[0].price) : 0, ba = asks.length ? q2n(asks[0].price) : 0;
        // центр оси — последняя цена крупно (стрелка к закрытию) + спред,
        // между hairline-линиями; фокус, вокруг которого дышит стакан
        var last = q2n(s.ob.lastPrice) || ((bb && ba) ? (bb + ba) / 2 : 0);
        var close = q2n(s.ob.closePrice);
        var dir = (last && close) ? (last > close ? 'up' : last < close ? 'down' : '') : '';
        var mid = '<div class="btr-axmid ' + dir + '">' +
            (dir ? '<i class="ar">' + (dir === 'up' ? '▲' : '▼') + '</i>' : '') +
            '<b>' + fmtPx(last, s) + '</b><em>₽</em>' +
            ((bb && ba) ? '<span class="sp">спред <b>' + fmtPx(ba - bb, s) + '</b></span>' : '') +
        '</div>';
        var askArr = asks.slice().reverse();
        // строки собираем ДО myOutList: row() по ходу отмечает в seen цены,
        // на которых своя заявка уже показана внутри лестницы
        var askHtml = askArr.map(function (r, i) { return row(r, 'ask', i === askArr.length - 1); }).join('');
        var bidHtml = bids.map(function (r, i) { return row(r, 'bid', i === 0); }).join('');
        var hiPx = askArr.length ? q2n(askArr[0].price) : q2n(bids[0].price);
        var loPx = bids.length ? q2n(bids[bids.length - 1].price) : q2n(askArr[askArr.length - 1].price);
        var out = myOutList(mine, seen, hiPx, loPx, last, s, n);
        return '<div class="btr-ax">' +
            '<div class="btr-ax-head"><span>Лоты · спрос</span><span>Цена</span><span>Предложение · лоты</span></div>' +
            out.up + askHtml + mid + bidHtml + out.down +
        '</div>';
    }

    // ---- карточка тикета ----
    // референс у цены: середина стакана — клик подставляет (по шагу)
    function pxRefBtn(n) {
        var s = S(n), m = midPrice(s);
        return m > 0
            ? '<button type="button" class="btr-ref" onclick="pftUseMarket(' + n + ')">рынок <b>' + fmtPx(m, s) + ' ₽</b></button>'
            : '';
    }
    // референс у лотов: «доступно» (покупка — от свободных денег,
    // продажа — остаток бумаги на счёте) — клик подставляет
    function availLots(s) {
        if (!s.meta) return 0;
        var lot = s.meta.lot || 1;
        if (s.side === 'sell') {
            var units = T.pos.secs[s.uid];
            if (units == null && s.meta.figi) units = T.pos.secs[s.meta.figi];
            return units > 0 ? Math.floor(units / lot) : 0;
        }
        var price = estPrice(s) || midPrice(s);
        if (!(T.pos.money > 0) || !(price > 0)) return 0;
        return Math.floor(T.pos.money / (price * lot));
    }
    function lotsRefBtn(n) {
        var s = S(n);
        if (!s.meta) return '';
        if (s.side === 'sell') {
            var k = availLots(s);
            // 0 в позиции — тоже показываем: сразу видно, что продавать нечего
            if (T.pos.secs[s.uid] == null && !(s.meta.figi && T.pos.secs[s.meta.figi] != null)) return '';
            return '<button type="button" class="btr-ref" onclick="pftUseAvail(' + n + ')">в позиции <b>' + k + ' лот</b></button>';
        }
        var a = availLots(s);
        return a > 0 ? '<button type="button" class="btr-ref" onclick="pftUseAvail(' + n + ')">доступно <b>' + a.toLocaleString('ru-RU') + ' лот</b></button>' : '';
    }
    // сводка сделки над кнопкой: цена × штуки · свободные деньги счёта
    function dealHtml(s) {
        if (!s.meta) return '';
        var shares = s.lots * (s.meta.lot || 1);
        var est = estPrice(s);
        var left = (est > 0 && shares > 0)
            ? '<span>' + fmtPx(est, s) + ' ₽ × ' + shares.toLocaleString('ru-RU') + ' шт</span>' : '<span></span>';
        var right = T.pos.money != null
            ? '<span>свободно <b>' + fmtRub(T.pos.money) + '</b></span>' : '';
        return left + right;
    }
    // чистый текст (без esc) — идёт и в textContent при точечном обновлении
    function submitLbl(s) {
        return (s.side === 'buy' ? 'Купить ' : 'Продать ') + s.meta.ticker + ' · ' + s.lots + ' лот';
    }
    // пустая сумма (цена ещё не введена) → пустая строка: шов и цифра скрыты CSS-ом
    function submitSum(s) {
        var sum = estPrice(s) * s.lots * (s.meta.lot || 1);
        if (!(sum > 0)) return '';
        return (s.kind === 'limit' ? '' : '≈ ') + fmtRub(sum);
    }
    function ticketHtml(n) {
        n = slotNo(n);
        var s = S(n);
        var c = conn();
        // порядок в шапке: сперва СЧЁТ (куда уйдёт заявка), потом бумага с лотностью
        // (просьба 2026-07-18) — сам тикер вынесен в заголовок карточки
        var note = '<div class="btr-hd-note">' +
            (c ? '<span class="btr-hd-acc">' + esc(c.accountName || 'Счёт') +
                (accTail() ? ' <b>····' + accTail() + '</b>' : '') +
                (c.sandbox ? '<i class="btr-sand">песочница</i>' : '') + '</span>' : '') +
            (s.meta ? '<span class="btr-hd-ins">' + esc(s.meta.ticker) + ' · лот ' + (s.meta.lot || 1) + '</span>' : '') +
        '</div>';
        var head = PF.pfCardHead('', slotTitle('Заявка', n), null, PF.pfdInChromeHtml(tkId(n)) + note);
        if (!s.meta) return head + '<div class="pfal-empty">Тикет откроется после выбора бумаги в стакане.</div>';
        var inc = s.meta.minInc || 0.01;
        var stepHint = '<i> · шаг ' + fmtPx(inc, s) + '</i>';
        var side = '<div class="btr-side" id="' + eid('Side', n) + '">' +
            '<button type="button" class="btr-side-b buy' + (s.side === 'buy' ? ' active' : '') + '" onclick="pftSide(' + n + ',\'buy\')">Купить</button>' +
            '<button type="button" class="btr-side-b sell' + (s.side === 'sell' ? ' active' : '') + '" onclick="pftSide(' + n + ',\'sell\')">Продать</button></div>';
        var tabs = function (id, items, cur, fn) {
            return '<div class="btr-ttabs" id="' + id + '">' + items.map(function (it) {
                return '<button type="button"' + (cur === it[0] ? ' class="active"' : '') + ' onclick="' + fn + '(' + n + ',\'' + it[0] + '\')">' + it[1] + '</button>';
            }).join('') + '</div>';
        };
        var kind = tabs(eid('Kind', n), [['limit', 'Лимитная'], ['market', 'Рыночная'], ['stop', 'Стоп']], s.kind, 'pftKind');
        var kindFields;
        if (s.kind === 'limit') {
            kindFields = '<div class="btr-bf"><div class="btr-bf-lab">' +
                '<label for="' + eid('Price', n) + '">Цена' + stepHint + '</label>' +
                '<span id="' + eid('PxRef', n) + '">' + pxRefBtn(n) + '</span></div>' +
                '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Price', n) + '" type="number" step="' + inc + '" min="0" ' +
                'placeholder="0" value="' + esc(s.price) + '"><span class="btr-big-suf">₽</span></div></div>';
        } else if (s.kind === 'stop') {
            kindFields = tabs(eid('StopKind', n), [['sl', 'Стоп-лосс'], ['tp', 'Тейк-профит']], s.stopKind, 'pftStopKind') +
                '<div class="btr-bf"><div class="btr-bf-lab">' +
                '<label for="' + eid('Stop', n) + '">Стоп-цена' + stepHint + '</label>' +
                '<span id="' + eid('PxRef', n) + '">' + pxRefBtn(n) + '</span></div>' +
                '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Stop', n) + '" type="number" step="' + inc + '" min="0" ' +
                'placeholder="0" value="' + esc(s.stopPrice) + '"><span class="btr-big-suf">₽</span></div>' +
                '<div class="btr-note">При достижении стоп-цены уйдёт рыночная заявка. Действует до отмены.</div></div>';
        } else {
            var m = midPrice(s);
            kindFields = '<div class="btr-note">Исполнится по лучшей цене стакана' +
                (m > 0 ? ' — сейчас ≈ ' + fmtPx(m, s) + ' ₽' : '') + '. Итог зависит от рынка.</div>';
        }
        var shares = s.lots * (s.meta.lot || 1);
        var lotsField = '<div class="btr-bf"><div class="btr-bf-lab">' +
            '<label for="' + eid('Lots', n) + '">Лоты<i> · 1 лот = ' + (s.meta.lot || 1) + ' шт</i></label>' +
            '<span id="' + eid('LotsRef', n) + '">' + lotsRefBtn(n) + '</span></div>' +
            '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Lots', n) + '" type="number" step="1" min="1" value="' + s.lots + '">' +
            '<span class="btr-big-suf" id="' + eid('Shares', n) + '">· ' + shares.toLocaleString('ru-RU') + ' шт</span></div></div>';
        return head + side + kind + kindFields + lotsField +
            '<div class="btr-deal" id="' + eid('Deal', n) + '">' + dealHtml(s) + '</div>' +
            '<div class="btr-warns" id="' + eid('Warns', n) + '">' + warnsHtml(s) + '</div>' +
            '<button type="button" class="btr-submit ' + s.side + '" id="' + eid('Submit', n) + '" onclick="pftAsk(' + n + ')">' +
                '<span class="btr-sb-l">' + esc(submitLbl(s)) + '</span>' +
                '<span class="btr-sb-s">' + submitSum(s) + '</span></button>' +
            '<div class="btr-subnote">' + IC_SHIELD + '<span>Подтверждение вводом суммы от</span>' +
            '<input id="' + eid('SumLimit', n) + '" type="number" min="1000" step="1000" value="' + sumLimit() + '"><span>₽</span></div>';
    }
    var IC_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5v-6z"/></svg>';
    function estPrice(s) {
        var q2n = A().q2n;
        if (s.kind === 'limit') return +s.price || 0;
        if (s.kind === 'stop') return +s.stopPrice || 0;
        if (!s.ob) return 0;
        var best = s.side === 'buy' ? (s.ob.asks || [])[0] : (s.ob.bids || [])[0];
        return best ? q2n(best.price) : 0;
    }
    function midPrice(s) {
        if (!s.ob) return 0;
        var q2n = A().q2n;
        var b = (s.ob.bids || [])[0], a = (s.ob.asks || [])[0];
        if (b && a) return (q2n(b.price) + q2n(a.price)) / 2;
        return q2n((b || a || {}).price);
    }
    function warnsHtml(s) {
        var out = [];
        var st = s.status && s.status.tradingStatus;
        if (s.uid && st && st !== 'SECURITY_TRADING_STATUS_NORMAL_TRADING') {
            out.push('Торговая сессия закрыта: заявка будет ждать открытия, цена исполнения может отличаться.');
        }
        // fat-finger только для лимитных: стоп-цена по смыслу стоит поодаль от рынка
        if (s.kind === 'limit' && +s.price > 0) {
            var mid = midPrice(s);
            if (mid > 0 && Math.abs(+s.price - mid) / mid > FF_DEV) {
                out.push('Цена дальше 5% от рынка (' + fmtPx(mid, s) + ' сейчас) — проверьте, нет ли опечатки.');
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
    // Виджет ОДИН на счёт: заявки приходят по всем бумагам сразу, дробить их по
    // слотам нечестно — часть заявок оказалась бы не видна ни в одном стакане.
    function ordTime(iso) {
        try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return ''; }
    }
    // цена заявки печатается по шагу ЕЁ бумаги (у слотов он разный)
    function metaSlot(uid) {
        var m = instrMem[uid];
        return { meta: m || null };
    }
    function ordRow(o) {
        var ins = instrMem[o.instrumentUid] || {};
        var buy = o.direction === 'ORDER_DIRECTION_BUY';
        // цена — тем же запасным путём, что и метка в стакане (ordPx): иначе
        // заявка стоит в лестнице с ценой, а в списке у неё прочерк
        var price = ordPx(o, metaSlot(o.instrumentUid));
        var req = +o.lotsRequested || 0, exec = +o.lotsExecuted || 0;
        var pct = req ? Math.round(exec / req * 100) : 0;
        var part = o.executionReportStatus === 'EXECUTION_REPORT_STATUS_PARTIALLYFILL' || exec > 0;
        var kindTxt = o.orderType === 'ORDER_TYPE_MARKET' ? 'рыночная' : 'лимит';
        return '<div class="btr-ordrow ' + (buy ? 'buy' : 'sell') + '">' +
            '<div class="btr-ord1">' +
                '<b>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</b>' +
                '<span class="btr-ord-meta">' + (buy ? 'покупка' : 'продажа') + ' · ' + kindTxt + '</span>' +
                '<span class="btr-ord-px">' + (price > 0 ? fmtPx(price, metaSlot(o.instrumentUid)) + '&nbsp;₽' : '—') + '</span>' +
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
                '<span class="btr-ord-px">от ' + fmtPx(q2n(o.stopPrice), metaSlot(o.instrumentUid)) + '&nbsp;₽</span>' +
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
        var head = PF.pfCardHead('', 'Мои заявки', null, PF.pfdInChromeHtml('trade:orders') + note);
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
    function obCardEl(n) { return document.querySelector('.btr-ob[data-slot="' + slotNo(n) + '"]'); }
    function tkCardEl(n) { return document.querySelector('.btr-ticket[data-slot="' + slotNo(n) + '"]'); }
    function repaintOb(n) { var el = dqs('Ob', n); if (el) el.innerHTML = obHtml(n); }
    function repaintObAll() { liveSlots().forEach(repaintOb); }
    function repaintWarns(n) { var el = dqs('Warns', n); if (el) el.innerHTML = warnsHtml(S(n)); }
    // полная перерисовка карточек ОДНОГО слота без общего ре-рендера вкладки
    function repaintSlot(n) {
        var w = obCardEl(n); if (w) w.innerHTML = obCardHtml(n);
        var t = tkCardEl(n); if (t) t.innerHTML = ticketHtml(n);
        wire();
    }
    function repaintOrders() { var el = document.querySelector('.btr-orders'); if (el) { el.innerHTML = ordersHtml(); } }
    // живые кусочки тикета: суффикс штук, сводка, сумма в кнопке, референсы —
    // точечно, не трогая инпуты (фокус и ввод не сбиваются)
    function repaintTicketBits(n) {
        var s = S(n);
        if (!s.meta || s.busy) return;
        var sh = dqs('Shares', n);
        if (sh) sh.textContent = '· ' + (s.lots * (s.meta.lot || 1)).toLocaleString('ru-RU') + ' шт';
        var d = dqs('Deal', n); if (d) d.innerHTML = dealHtml(s);
        var btn = dqs('Submit', n);
        if (btn) {
            var l = btn.querySelector('.btr-sb-l'); if (l) l.textContent = submitLbl(s);
            var sm = btn.querySelector('.btr-sb-s'); if (sm) sm.textContent = submitSum(s);
        }
        var pr = dqs('PxRef', n); if (pr) pr.innerHTML = pxRefBtn(n);
        var lr = dqs('LotsRef', n); if (lr) lr.innerHTML = lotsRefBtn(n);
    }

    // ---------- данные ----------
    // ушли с подвкладки/вкладки браузера — таймеры гасим прямо из тика
    // (рендер «Портфелей» при уходе на другой раздел не перезапускается)
    function stillHere() {
        // .btr-card есть у любой карточки терминала: стакан могли удалить,
        // а тикет и «Мои заявки» оставить — поллинг им всё ещё нужен
        if (document.querySelector('#panel-portfolios.active .btr-card')) return true;
        stopPolling();
        return false;
    }
    function awake() { return stillHere() && document.visibilityState === 'visible'; }
    function pollOb() {
        if (!awake()) return;
        liveSlots().forEach(function (n) {
            var s = S(n);
            if (!s.uid) return;
            A().call('GetOrderBook', { instrumentId: s.uid, depth: OB_DEPTH }).then(function (d) {
                s.ob = d;
                repaintOb(n);
                repaintWarns(n);
                repaintTicketBits(n);
            }).catch(function () { /* тихо: следующий тик попробует снова */ });
        });
    }
    function pollOrders() {
        if (!awake()) return;
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
            repaintObAll();   // метки своих заявок — сразу, не ждя тика стакана
        }).catch(function () {});
    }
    // свободные деньги и остатки бумаг — для референсов «доступно» и «свободно»
    function pollPos() {
        if (!awake()) return;
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
            liveSlots().forEach(repaintTicketBits);
        }).catch(function () { /* тихо: рефы просто не покажутся */ });
    }
    // лента — только у РАЗВЁРНУТЫХ: свёрнутая никому не видна, а запрос стоит
    // столько же, сколько стакан (на четырёх слотах это заметная разница)
    function pollTape(only) {
        if (!awake()) return;
        var list = only ? [slotNo(only)] : liveSlots();
        list.forEach(function (n) {
            var s = S(n);
            if (!s.uid || !s.tapeOpen) return;
            var now = Date.now();
            A().call('GetLastTrades', {
                instrumentId: s.uid,
                from: new Date(now - 15 * 60000).toISOString(),
                to: new Date(now).toISOString()
            }).then(function (d) {
                s.tape = (d.trades || []).slice(-12).reverse();
                var el = dqs('Tape', n);
                if (el) el.innerHTML = tapeHtml(s);
                var cnt = dqs('TapeCnt', n);
                if (cnt) cnt.textContent = tapeCnt(s);
            }).catch(function () {});
        });
    }
    function pollStatus() {
        if (!stillHere()) return;
        liveSlots().forEach(function (n) {
            var s = S(n);
            if (!s.uid) return;
            A().call('GetTradingStatus', { instrumentId: s.uid }).then(function (d) {
                s.status = d;
                repaintWarns(n);
                var el = dqs('Instr', n);
                if (el && s.meta) el.innerHTML = instrHtml(s);
            }).catch(function () {});
        });
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
    // паспорт из localStorage мог протухнуть (сплит, смена лотности) — сверяем
    // с сервером на первом же живом такте и молча обновляем карточки слота
    function refreshStaleMeta() {
        liveSlots().forEach(function (n) {
            var s = S(n);
            if (!s.metaStale || !s.uid) return;
            s.metaStale = false;
            fetchMeta(s.uid).then(function (m) {
                if (!m || !m.ticker) return;
                var was = s.meta || {};
                s.meta = m;
                saveSlots();
                if (was.lot !== m.lot || was.minInc !== m.minInc || was.ticker !== m.ticker) repaintSlot(n);
            }, function () { /* тихо: работаем с сохранённым паспортом */ });
        });
    }

    // ---------- таймеры ----------
    function startPolling() {
        if (!T.obTimer) T.obTimer = setInterval(pollOb, 2000);
        if (!T.ordTimer) T.ordTimer = setInterval(pollOrders, 6000);
        if (!T.stTimer) T.stTimer = setInterval(pollStatus, 30000);
        if (!T.tapeTimer) T.tapeTimer = setInterval(function () { pollTape(); }, 4000);
        if (!T.posTimer) T.posTimer = setInterval(pollPos, 15000);
        refreshStaleMeta();
        pollOb(); pollOrders(); pollStatus(); pollTape(); pollPos();
    }
    function stopPolling() {
        clearInterval(T.obTimer); clearInterval(T.ordTimer); clearInterval(T.stTimer);
        clearInterval(T.tapeTimer); clearInterval(T.posTimer);
        T.obTimer = T.ordTimer = T.stTimer = T.tapeTimer = T.posTimer = null;
    }
    // зовётся из цикла рендера portfolios.js: включает/гасит поллинг по месту
    function pftAfterRender() {
        var live = document.querySelector('#panel-portfolios.active .btr-card');
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
    var saveT = null;
    function saveSoon() { clearTimeout(saveT); saveT = setTimeout(saveSlots, 400); }
    // Слот у инпута берём из data-slot карточки, а не из замыкания: карточки
    // перерисовываются целиком, и старое замыкание указывало бы в пустоту.
    function wire() {
        liveSlots().forEach(function (n) { wireSlot(n); });
    }
    var searchT = {};
    function wireSlot(n) {
        var s = S(n);
        var se = dqs('Search', n);
        if (se && !se._wired) {
            se._wired = true;
            se.addEventListener('input', function () {
                s.searchQ = se.value.trim();
                clearTimeout(searchT[n]);
                if (s.searchQ.length < 2) { renderDrop(n, []); return; }
                searchT[n] = setTimeout(function () {
                    var q = s.searchQ;
                    A().call('FindInstrument', { query: q }).then(function (d) {
                        renderDrop(n, rankInstruments(d.instruments || [], q).slice(0, 8), q);
                    }).catch(function (e) { toast(e.message, true); });
                }, 350);
            });
        }
        var p = dqs('Price', n);
        if (p && !p._wired) {
            p._wired = true;
            fitBig(p);
            p.addEventListener('input', function () { s.price = p.value; fitBig(p); repaintWarns(n); repaintTicketBits(n); saveSoon(); });
        }
        var sp = dqs('Stop', n);
        if (sp && !sp._wired) {
            sp._wired = true;
            fitBig(sp);
            sp.addEventListener('input', function () { s.stopPrice = sp.value; fitBig(sp); repaintTicketBits(n); saveSoon(); });
        }
        var l = dqs('Lots', n);
        if (l && !l._wired) {
            l._wired = true;
            fitBig(l);
            l.addEventListener('input', function () { s.lots = Math.max(1, Math.floor(+l.value || 1)); fitBig(l); repaintTicketBits(n); saveSoon(); });
        }
        var sl = dqs('SumLimit', n);
        if (sl && !sl._wired) {
            sl._wired = true;
            sl.addEventListener('change', function () {
                var v = Math.max(1000, Math.floor(+sl.value || 0));
                try { localStorage.setItem(SUM_LIMIT_KEY, String(v)); } catch (e) {}
                sl.value = v;
            });
        }
    }
    // Брокер отдаёт совпадения в своём порядке, а на короткий тикер их десятки:
    // на «sber» приезжают облигации Сбербанка, ноты и фонды, и сама акция в
    // первую восьмёрку не попадала — поиск выглядел сломанным. Ранжируем сами:
    // точное совпадение тикера — всегда первым.
    function rankInstruments(list, q) {
        var Q = String(q || '').trim().toUpperCase();
        function kind(i) { return String(i.instrumentType || i.instrumentKind || '').toLowerCase(); }
        function score(i) {
            var tk = String(i.ticker || '').toUpperCase();
            var nm = String(i.name || '').toUpperCase();
            var s = 0;
            if (tk === Q) s += 1000;                       // ровно тот тикер, что набрали
            else if (tk.indexOf(Q) === 0) s += 600;        // тикер начинается с запроса
            else if (nm.indexOf(Q) === 0) s += 300;        // название начинается с запроса
            else if (tk.indexOf(Q) > 0) s += 120;
            else if (nm.indexOf(Q) > 0) s += 60;
            if (i.apiTradeAvailableFlag === false) s -= 500;   // купить всё равно нельзя
            var k = kind(i);
            if (k.indexOf('share') >= 0) s += 40;          // акции выше облигаций и фондов
            else if (k.indexOf('etf') >= 0) s += 20;
            if (i.forQualInvestorFlag) s -= 30;            // только для квалов — ниже
            s -= Math.min(20, tk.length);                  // короткий тикер ближе к запросу
            return s;
        }
        return list.slice().map(function (i, n) { return { i: i, n: n, s: score(i) }; })
            .sort(function (a, b) { return b.s - a.s || a.n - b.n; })
            .map(function (x) { return x.i; });
    }
    function instrTag(i) {
        var k = String(i.instrumentType || i.instrumentKind || '').toLowerCase();
        if (k.indexOf('share') >= 0) return 'акция';
        if (k.indexOf('bond') >= 0) return 'облигация';
        if (k.indexOf('etf') >= 0) return 'фонд';
        if (k.indexOf('futures') >= 0) return 'фьючерс';
        if (k.indexOf('currency') >= 0) return 'валюта';
        return '';
    }
    function renderDrop(n, list, q) {
        var d = dqs('SearchDrop', n); if (!d) return;
        var s = S(n);
        if (!list.length) {
            // молчаливо пустой список читался как «поиск не работает»
            d.innerHTML = q ? '<div class="btr-search-none">Ничего не нашли по запросу «' + esc(q) + '»</div>' : '';
            d.classList.toggle('open', !!q);
            s.search = [];
            return;
        }
        d.innerHTML = list.map(function (i, k) {
            var tag = instrTag(i);
            return '<div class="btr-search-row" role="button" onclick="pftPick(' + n + ',' + k + ')">' +
                '<b>' + esc(i.ticker || '') + '</b><span>' + esc(i.name || '') + '</span>' +
                (tag ? '<i class="btr-search-tag">' + tag + '</i>' : '') + '</div>';
        }).join('');
        d.classList.add('open');
        s.search = list;
    }

    // ---------- публичные действия (onclick) ----------
    window.pftLiveOk = function () {
        try { localStorage.setItem(LIVE_SEEN_KEY, '1'); } catch (e) {}
        var b = dq('btLive'); if (b) b.remove();
    };
    window.pftSearchToggle = function (n) {
        var s = S(n);
        s.searchOpen = !s.searchOpen;
        var w = dqs('SearchWrap', n); if (w) w.classList.toggle('open', s.searchOpen);
        var b = dqs('SearchTg', n); if (b) b.classList.toggle('on', s.searchOpen);
        if (s.searchOpen) { var i = dqs('Search', n); if (i) i.focus(); }
    };
    window.pftTapeToggle = function (n) {
        var s = S(n);
        s.tapeOpen = !s.tapeOpen;
        var f = dqs('TapeFold', n); if (f) f.classList.toggle('open', s.tapeOpen);
        var el = dqs('Tape', n); if (el) el.innerHTML = tapeHtml(s);
        if (s.tapeOpen) pollTape(n);   // развернули — не ждём общего тика
        saveSlots();
    };
    window.pftOtab = function (k) { T.otab = k; repaintOrders(); };
    window.pftPick = function (n, k) {
        var s = S(n);
        var i = s.search[k]; if (!i) return;
        s.uid = i.uid; s.ob = null; s.status = null; s.price = ''; s.searchQ = ''; s.tape = [];
        s.searchOpen = false;   // бумага выбрана — поиск сворачивается в лупу
        fetchMeta(i.uid).then(function (m) {
            s.meta = m;
            s.metaStale = false;
            saveSlots();
            repaintSlot(n);
            emitSlotChange(n);
            pollOb(); pollStatus(); pollTape(n); pollPos();
        }, function (e) { toast(e.message, true); });
    };
    window.pftPickPrice = function (n, p) {
        // клик по цене стакана заполняет активное ценовое поле тикета
        var s = S(n);
        if (s.kind === 'limit') {
            s.price = String(p);
            var inp = dqs('Price', n); if (inp) { inp.value = s.price; fitBig(inp); }
        } else if (s.kind === 'stop') {
            s.stopPrice = String(p);
            var sp = dqs('Stop', n); if (sp) { sp.value = s.stopPrice; fitBig(sp); }
        } else return;
        repaintWarns(n); repaintTicketBits(n); saveSoon();
    };
    // референс «рынок» — середина стакана, округлённая до шага инструмента
    window.pftUseMarket = function (n) {
        var s = S(n), m = midPrice(s);
        if (!(m > 0) || !s.meta) return;
        var inc = s.meta.minInc || 0.01;
        window.pftPickPrice(n, String(+(Math.round(m / inc) * inc).toFixed(6)));
    };
    // референс «доступно / в позиции» — подставляет максимум лотов
    window.pftUseAvail = function (n) {
        var s = S(n), k = availLots(s);
        if (!(k > 0)) return;
        s.lots = k;
        var l = dqs('Lots', n); if (l) { l.value = k; fitBig(l); }
        repaintTicketBits(n); saveSlots();
    };
    window.pftSide = function (n, v) { S(n).side = v; saveSlots(); repaintSlot(n); };
    window.pftKind = function (n, k) { S(n).kind = k; saveSlots(); repaintSlot(n); };
    window.pftStopKind = function (n, k) { S(n).stopKind = k; saveSlots(); repaintSlot(n); };

    // ---- слоты: добавить бумагу / убрать её состояние ----
    // «+» в шапке стакана: заводим следующий свободный слот и показываем ОБА
    // его блока — стакан без тикета торговать не даёт, а тикет без стакана
    // слеп; поодиночке их всё равно можно убрать корзиной.
    window.pftAddSlot = function (quiet) {
        var n = nextFreeSlot();
        if (!n) { toast('Больше ' + MAX_SLOTS + ' бумаг разом терминал не держит — лимит запросов брокера', true); return false; }
        if (!PF.pfdAddTradeSlot) { toast('Конструктор не готов — обновите страницу', true); return false; }
        PF.pfdAddTradeSlot(n, quiet);
        // фокус в поиск новой карточки: добавили — сразу набираем тикер
        var tries = 0;
        (function poll() {
            var i = dqs('Search', n);
            if (i) { try { i.focus(); } catch (e) {} return; }
            if (tries++ < 45) requestAnimationFrame(poll);
        })();
        return true;
    };
    // конструктор снёс оба блока слота — забываем бумагу, чтобы она не всплыла
    // при следующем добавлении и не считалась «занятым» номером
    PF.pftDropSlot = function (n) {
        n = slotNo(n);
        if (n === 1) { SLOTS[1] = newSlot(); } else { delete SLOTS[n]; }
        saveSlots();
    };
    PF.pftSlotNums = slotNums;
    PF.pftSlotLabel = function (kind, n) {
        return slotTitle(kind === 'ob' ? 'Стакан' : kind === 'chart' ? 'График' : 'Заявка', n);
    };
    // Паспорт выбранной бумаги слота для СОСЕДНИХ блоков (график свечей —
    // js/portfolios-chart.js): копия, а не сам s.meta, чтобы чужой блок не мог
    // испортить состояние терминала.
    PF.pftSlotInstr = function (n) {
        var s = S(n);
        if (!s.uid || !s.meta) return null;
        return {
            uid: s.uid, ticker: s.meta.ticker, name: s.meta.name,
            figi: s.meta.figi, lot: s.meta.lot, minInc: s.meta.minInc
        };
    };
    // Поиск бумаги и её паспорт — общие с графиком свечей (js/portfolios-chart.js):
    // у него свой выбор тикера, но ранжирование выдачи и подписи типов должны быть
    // теми же, что в стакане, иначе один и тот же запрос даёт разный порядок.
    PF.pftFindInstruments = function (q) {
        if (!A()) return Promise.reject(new Error('Брокер не подключён'));
        return A().call('FindInstrument', { query: q }).then(function (d) {
            return rankInstruments(d.instruments || [], q);
        });
    };
    PF.pftInstrTag = instrTag;
    PF.pftInstrMeta = function (uid) { return fetchMeta(uid); };

    // бумага слота сменилась — соседние блоки перезагружают свои данные
    function emitSlotChange(n) {
        try { window.dispatchEvent(new CustomEvent('pft-slot-change', { detail: { slot: slotNo(n) } })); } catch (e) {}
    }

    // подтверждение заявки: своя модалка (pfConfirm не умеет ввод суммы)
    window.pftAsk = function (n) {
        n = slotNo(n);
        var s = S(n);
        // Молчаливый выход здесь читался как «кнопка не работает»: каждый отказ
        // должен называть причину, иначе пользователь жмёт в пустоту.
        if (s.busy) { toast('Заявка уже отправляется — подождите ответа брокера'); return; }
        if (!s.meta) { toast('Сначала выберите бумагу — найдите её в поиске над стаканом', true); return; }
        if (!tradeReady()) {
            var c0 = conn();
            if (!c0) toast('Брокер не подключён', true);
            else if (A().isLocked()) { toast('Токен заперт PIN-кодом — разблокируйте его', true); if (window.pfBrokerUnlock) window.pfBrokerUnlock(); }
            else if (A().isSessionGone()) toast('Сессия токена закончилась — введите токен заново', true);
            else if (c0.scope !== 'trade') toast('Подключение в режиме «Только чтение» — торговать им нельзя', true);
            else if (c0.state === 'revoked') toast('Брокер не принял токен — обновите его в подключении', true);
            else if (c0.state === 'downgraded') toast('Права токена урезали до чтения — выпустите токен с полным доступом', true);
            else toast('Торговля сейчас недоступна', true);
            return;
        }
        var vel = velLeft();
        if (vel > 0) { toast('Пауза после ' + VEL_MAX + ' заявок подряд — ещё ' + Math.ceil(vel / 1000) + ' с', true); return; }
        var lots = Math.max(1, Math.floor(+s.lots || 1));
        var inc = s.meta.minInc || 0.01;
        // цены — по шагу инструмента, иначе брокер отклонит заявку
        function snap(v, base, label) {
            var x = +(Math.round(v / inc) * inc).toFixed(6);
            if (Math.abs(x - v) > 1e-9) {
                var inp = dqs(base, n); if (inp) { inp.value = String(x); fitBig(inp); }
                toast(label + ' округлена до шага ' + fmtPx(inc, s));
            }
            return x;
        }
        var price = +s.price || 0;
        var stopPrice = +s.stopPrice || 0;
        if (s.kind === 'limit') {
            if (!(price > 0)) { toast('Укажите цену лимитной заявки', true); return; }
            price = snap(price, 'Price', 'Цена');
            s.price = String(price);
        }
        if (s.kind === 'stop') {
            if (!(stopPrice > 0)) { toast('Укажите стоп-цену активации', true); return; }
            stopPrice = snap(stopPrice, 'Stop', 'Стоп-цена');
            s.stopPrice = String(stopPrice);
        }
        var shares = lots * (s.meta.lot || 1);
        var est = s.kind === 'limit' ? price : (s.kind === 'stop' ? stopPrice : estPrice(s));
        var sum = est * shares;
        s.orderId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
        var needType = sum >= sumLimit();
        var typed = Math.round(sum);
        var c = conn();
        var accStr = c ? (c.accountName || 'Счёт') + (accTail() ? ' ····' + accTail() : '') + (c.sandbox ? ' · песочница' : '') : '';
        var old = dq('btConfirmOv'); if (old) old.remove();
        var ov = document.createElement('div');
        ov.id = 'btConfirmOv';
        var kindName = s.kind === 'limit' ? 'Лимитная'
            : (s.kind === 'stop' ? (s.stopKind === 'tp' ? 'Тейк-профит' : 'Стоп-лосс') : 'Рыночная');
        ov.innerHTML = '<div class="bk-back"></div><div class="bk-card bk-card-pin btr-cf" role="alertdialog" aria-modal="true">' +
            '<div class="bk-title">' + (s.side === 'buy' ? 'Покупка' : 'Продажа') + ' ' + esc(s.meta.ticker) + '</div>' +
            '<div class="bk-kv"><span>Тип</span><b>' + kindName + '</b></div>' +
            (s.kind === 'limit' ? '<div class="bk-kv"><span>Цена</span><b class="bk-mono">' + fmtPx(price, s) + ' ₽</b></div>' : '') +
            (s.kind === 'stop' ? '<div class="bk-kv"><span>Стоп-цена</span><b class="bk-mono">' + fmtPx(stopPrice, s) + ' ₽</b></div>' : '') +
            '<div class="bk-kv"><span>Количество</span><b>' + lots + ' лот = ' + shares.toLocaleString('ru-RU') + ' шт</b></div>' +
            '<div class="bk-kv"><span>' + (s.kind === 'limit' ? 'Сумма' : 'Сумма ≈') + '</span><b class="bk-mono">' + fmtRub(sum) + '</b></div>' +
            (accStr ? '<div class="bk-kv"><span>Счёт</span><b>' + esc(accStr) + '</b></div>' : '') +
            warnsHtml(s) +
            (needType
                ? '<div class="ph-field"><label class="ph-lab" for="btCfSum">Крупная заявка — введите сумму цифрами (' + typed.toLocaleString('ru-RU') + ')</label>' +
                  '<input class="ph-input" id="btCfSum" type="text" inputmode="numeric" autocomplete="off" placeholder="' + typed.toLocaleString('ru-RU') + '"></div>'
                : '') +
            '<div class="bk-foot"><button type="button" class="bk-btn" id="btCfNo">Отмена</button>' +
            '<button type="button" class="bk-btn bk-btn-pri" id="btCfYes">Подтвердить</button></div></div>';
        document.body.appendChild(ov);
        // класс .open включает не только проявление, но и само позиционирование
        // оверлея (см. broker.css) — без него модалка уезжает ниже экрана
        requestAnimationFrame(function () { ov.classList.add('open'); });
        function closeCf() {
            document.removeEventListener('keydown', onKey);
            ov.remove();
        }
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); closeCf(); }
        }
        document.addEventListener('keydown', onKey);
        ov.querySelector('.bk-back').addEventListener('click', closeCf);
        ov.querySelector('#btCfNo').addEventListener('click', closeCf);
        // фокус сразу в модалку: крупную заявку подтверждают вводом суммы,
        // обычную — Enter'ом по кнопке
        setTimeout(function () {
            var f = dq('btCfSum') || dq('btCfYes');
            if (f) try { f.focus(); } catch (e) {}
        }, 30);
        ov.querySelector('#btCfYes').addEventListener('click', function () {
            if (needType) {
                var got = String((dq('btCfSum') || {}).value || '').replace(/[\s ]/g, '');
                if (got !== String(typed)) {
                    toast('Сумма не совпала — проверьте ещё раз', true);
                    return;
                }
            }
            closeCf();
            submitOrder(n, lots, s.kind === 'stop' ? stopPrice : price, sum);
        });
    };

    function submitOrder(n, lots, price, sum) {
        var s = S(n);
        var c = conn(); if (!c || s.busy) return;
        s.busy = true;
        var btn = dqs('Submit', n);
        if (btn) {
            btn.disabled = true;
            var bl = btn.querySelector('.btr-sb-l'); if (bl) bl.textContent = 'Отправляем…';
        }
        var isStop = s.kind === 'stop';
        var method, body;
        if (isStop) {
            // у стоп-заявок нет клиентского idempotency-ключа в API —
            // страхуют busy-флаг и velocity-лимит
            method = 'PostStopOrder';
            body = {
                accountId: c.accountId,
                instrumentId: s.uid,
                quantity: String(lots),
                direction: s.side === 'buy' ? 'STOP_ORDER_DIRECTION_BUY' : 'STOP_ORDER_DIRECTION_SELL',
                stopPrice: A().n2q(price),
                stopOrderType: s.stopKind === 'tp' ? 'STOP_ORDER_TYPE_TAKE_PROFIT' : 'STOP_ORDER_TYPE_STOP_LOSS',
                expirationType: 'STOP_ORDER_EXPIRATION_TYPE_GOOD_TILL_CANCEL'
            };
        } else {
            method = 'PostOrder';
            body = {
                accountId: c.accountId,
                instrumentId: s.uid,
                quantity: String(lots),
                direction: s.side === 'buy' ? 'ORDER_DIRECTION_BUY' : 'ORDER_DIRECTION_SELL',
                orderType: s.kind === 'limit' ? 'ORDER_TYPE_LIMIT' : 'ORDER_TYPE_MARKET',
                orderId: s.orderId
            };
            if (s.kind === 'limit') body.price = A().n2q(price);
        }
        // синхронный бросок здесь оставил бы busy навсегда взведённым, а с ним
        // и мёртвую кнопку до перезагрузки страницы
        var req;
        try { req = A().call(method, body); }
        catch (e) {
            s.busy = false;
            toast((e && e.message) || 'Не удалось отправить заявку', true);
            var b0 = dqs('Submit', n); if (b0) b0.disabled = false;
            repaintTicketBits(n);
            return;
        }
        req.then(function () {
            s.busy = false;
            T.sent.push(Date.now());
            s.orderId = null;   // исполненный ключ не переиспользуем
            var kindTxt = isStop ? (s.stopKind === 'tp' ? 'тейк-профит от ' : 'стоп-лосс от ') + fmtPx(price, s) + ' ₽'
                : (s.kind === 'limit' ? fmtPx(price, s) + ' ₽' : 'рыночная');
            A().logEvent('order_submit', (s.side === 'buy' ? 'покупка ' : 'продажа ') + s.meta.ticker +
                ' · ' + lots + ' лот · ' + kindTxt);
            toast((isStop ? 'Стоп-заявка' : 'Заявка') + ' выставлена: ' + s.meta.ticker);
            pollOrders(); pollPos();
            repaintSlot(n);
        }, function (e) {
            s.busy = false;
            // s.orderId сохраняем: повтор той же попытки не продублирует заявку
            A().logEvent('order_error', s.meta.ticker + ' · ' + (e.message || '').slice(0, 120));
            toast(e.message || 'Заявка не прошла', true);
            var b = dqs('Submit', n); if (b) b.disabled = false;
            repaintTicketBits(n);
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

    loadSlots();

    PF.pftTerminalHtml = pftTerminalHtml;
    PF.pftAfterRender = pftAfterRender;
    // карточки-блоки для дашборд-конструктора «Торговли» (см. portfolios-dash.js)
    PF.pftObCard = obCard;
    PF.pftTicketCard = ticketCard;
    PF.pftOrdersCard = ordersCard;
    PF.pftLiveBanner = bannerHtml;
    PF.pftTradeReady = tradeReady;
    PF.pftMaxSlots = MAX_SLOTS;
})();
