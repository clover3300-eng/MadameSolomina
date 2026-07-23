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
    // ставка комиссии, % от суммы сделки. Дефолт — тариф «Инвестор» Т-Инвестиций
    // (самый распространённый); у «Трейдера» 0,05 — правится прямо в тикете
    var FEE_KEY = 'bt_fee_pct_v1', FEE_DEF = 0.3;
    var LIVE_SEEN_KEY = 'bt_live_seen_v1';   // баннер боевого контура закрыт
    var SLOTS_KEY = 'bt_slots_v1';           // выбранные бумаги (переживают перезагрузку)
    var OB_DEPTH = 10;      // уровней на сторону в карточке натуральной высоты
    var OB_MAX = 20;        // ...и сколько просим у брокера: растянутой карточке есть что показать
    var OB_MIN = 1;         // самый тесный честный стакан: лучший бид, цена, лучший аск
    // ИНТЕРВАЛЫ ПОЛЛИНГА — одним конфигом (константы в startPolling разъезжались
    // с комментариями про «такты», которые молча ломались при смене цифры)
    var POLL_MS = {
        ob: 2000,       // стакан — самый частый: на нём считаются деньги
        tape: 4000,     // лента обезличенных сделок (только развёрнутая/фокус)
        orders: 6000,   // активные и стоп-заявки
        pos: 15000,     // позиции + лимиты + портфель (один такт на троих)
        status: 30000,  // статус торгов инструмента
        fresh: 1000     // такт свежести: без сети, только сверка часов
    };
    // СВЕЖЕСТЬ ДАННЫХ. fetch к брокеру идёт без таймаута (broker-api.js), то есть
    // зависший запрос не отклоняется НИКОГДА — по ошибкам обрыв не поймать вовсе.
    // Поэтому «живы ли цены» считается по времени последнего УСПЕШНОГО ответа
    // стакана: он самый частый и именно на нём считаются деньги.
    // Четыре пропущенных такта подряд: одиночный сетевой чих терминал
    // не глушит, а настоящий обрыв виден почти сразу.
    var LIVE_MS = POLL_MS.ob * 4;
    // ниже этой высоты карточка уходит в плотный режим (.btr-tight): цифры мельче,
    // воздух убран — иначе в ужатый блок не влезает даже кнопка тикета
    var TIGHT_H = 380;
    // потолок слотов НА ЭКРАНЕ: каждый живой стакан — свой запрос раз в 2с, а лимит
    // MarketData у брокера общий на токен; 4 бумаги = 120 запросов/мин с запасом.
    // Опрашиваются только слоты НА ЭКРАНЕ (liveSlots смотрит в DOM), поэтому с
    // приходом экранов («Торговля» держит их полосой внизу) лимит стал именно
    // экранным: бумаги соседнего экрана молчат, пока на него не переключились.
    var MAX_SLOTS_SCREEN = 4;
    // ...и сквозной потолок номеров на все экраны разом: состояние слота (SLOTS[n],
    // bt_slots_v1) общее по номеру, так что номера не должны кончиться на четвёртом
    var MAX_SLOTS = 16;
    // история сделок: окно и потолок строк. Месяц — компромисс между «вкладка
    // не пустует в тихую неделю» и «один запрос, а не окна по годам», как в
    // portfolios-broker-pf.js (там глубина 9 лет, но и синк там редкий)
    var HIST_DAYS = 30, HIST_MAX = 40;
    var HIST_TTL = 60000;   // повторный вход во вкладку не дёргает брокера заново
    // Срок жизни лимитной заявки. Раньше поле не передавалось вовсе, и заявка
    // жила «до отмены» — забытая лимитка могла сработать через неделю по цене,
    // которая давно не актуальна. Дефолт оставлен прежним (до отмены), чтобы
    // поведение у тех, кто ничего не трогает, не изменилось молча.
    var TIF_TABS = [['gtc', 'До отмены'], ['day', 'До конца дня'], ['fak', 'Снять остаток']];
    var TIF_API = {
        gtc: null,   // не передаём поле — прежнее поведение брокера по умолчанию
        day: 'TIME_IN_FORCE_DAY',
        fak: 'TIME_IN_FORCE_FILL_AND_KILL'
    };
    var TIF_NOTE = {
        gtc: 'Заявка стоит в стакане, пока её не исполнят или не снимут.',
        day: 'Неисполненный остаток снимется в конце торгового дня.',
        fak: 'Исполнится сразу, сколько получится, остаток снимется мгновенно.'
    };

    // ---------- состояние ----------
    // общее по СЧЁТУ (одно на терминал, от бумаги не зависит)
    var T = {
        orders: [], stops: [],        // активные заявки и стоп-заявки — по всем бумагам
        pos: { money: null, secs: {} },   // свободные ₽ и остатки бумаг (GetPositions)
        sent: [],                     // таймстемпы отправок (velocity — лимит счёта)
        otab: 'active',               // вкладка «Моих заявок»: active | stop | hist
        // история ИСПОЛНЕННЫХ сделок (GetOperations) — грузится по требованию,
        // не по таймеру: метод тяжёлый и лимитируется отдельно от MarketData
        hist: [], histTs: 0, histBusy: false, histErr: '', histJournal: false,
        // открытые позиции со средней ценой и P&L (GetPortfolio) — для виджета
        // «Позиции»; опрашивается, только пока виджет на экране
        port: { list: [], ts: 0 },
        // свежесть данных: с какого момента идёт поллинг (гвард ложной тревоги
        // при возврате на вкладку) и сказали ли уже про обрыв — см. freshTick
        pollSince: 0, linkWarned: false,
        // тихая протухлость (данные стоят при живом стакане): возраст снимка
        // заявок, был ли обрыв (второй шанс GetMaxLots) и что уже нарисовано
        ordTs: 0, wasStale: false, ageKey: '',
        obTimer: null, ordTimer: null, stTimer: null, tapeTimer: null, posTimer: null,
        freshTimer: null
    };
    // старше этого — считаем снимок заявок/позиций протухшим и говорим об этом
    var DATA_AGE_MS = 45000;
    // состояние ОДНОЙ бумаги (у каждого слота своё)
    function newSlot() {
        return {
            uid: null, meta: null,        // выбранный инструмент и его паспорт
            ob: null, status: null,       // стакан и статус торгов
            obTs: 0,                      // время последнего УСПЕШНОГО стакана (свежесть, см. LIVE_MS)
            obFail: 0, obErr: '',         // отказов подряд и причина последнего — в тултип метки связи
            linkKey: '',                  // что уже нарисовано про связь (freshTick не трогает DOM зря)
            depth: OB_DEPTH,              // уровней на сторону — по высоте карточки (fitOb)
            agg: 1,                       // склейка соседних цен: множитель шага инструмента
            side: 'buy', kind: 'limit', price: '', lots: 1,
            tif: 'gtc',                   // срок жизни лимитной заявки (см. TIF_TABS)
            stopKind: 'sl', stopPrice: '',// стоп-заявки: стоп-лосс/тейк-профит/стоп-лимит + цена активации
            stopLimit: '',                // цена ЛИМИТНОЙ заявки, выставляемой стоп-лимитом
            prot: false, protSl: '', protTp: '',   // брекет: защита позиции после исполнения
            tape: [],                     // лента обезличенных сделок
            search: [], searchQ: '',
            searchOpen: true,             // поиск виден, пока бумага не выбрана; дальше — лупой
            tapeOpen: false,              // лента сделок под шевроном, по умолчанию свёрнута
            orderId: null,                // idempotency-ключ текущего подтверждения
            orderFp: '',                  // параметры попытки, под которые выдан orderId
            gen: 0,                       // поколение бумаги: clearBook++, опоздавшие ответы отбрасываются
            metaStale: false,             // паспорт из localStorage — обновить с сервера
            max: null,                    // лимиты брокера (GetMaxLots): {buy, sell, ts}
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

    // ---- слоты и ЭКРАНЫ ----
    // Экран «Торговли» — отдельная раскладка конструктора ('trading', 'trading:2'…,
    // см. pfxIsTradeTab в portfolios-dash.js), и слот принадлежит тому экрану, в
    // чьей раскладке лежат его блоки. Номера слотов при этом СКВОЗНЫЕ: состояние
    // SLOTS[n] общее, поэтому один и тот же номер на двух экранах показывал бы
    // одну бумагу дважды. Отсюда две разные выборки: slotNums — слоты ЭТОГО
    // экрана (рендер, пикер, «+»), slotNumsAll — занятые вообще (выдача номера).
    // Конфиг берём через dashCfgFor: у первого экрана записи в pf_dash_tabs_v1 может
    // не быть вовсе (его никто не правил), и «сырое» чтение показало бы пустую
    // раскладку — а его бумага тогда считалась бы бесхозной и всплыла бы на соседнем
    // экране. Рекурсии тут нет: dashCfgFor зовёт сид (а сид — nextFreeSlot) только
    // на НЕЗНАКОМОМ ключе, а tradeTabs перечисляет ровно уже существующие.
    function cfgSlots(cfg, out) {
        ((cfg && cfg.order) || []).forEach(function (id) {
            var m = /^trade:(?:ob|ticket)(?::(\d+))?$/.exec(id);
            if (m) out[slotNo(m[1] || 1)] = 1;
        });
        return out;
    }
    function tradeTabs() { return PF.pfxTradeTabs ? PF.pfxTradeTabs() : ['trading']; }
    function cfgOf(t) {
        if (t === PF.dashTab) return PF.dashCfg;
        try { return PF.dashCfgFor(t); } catch (e) { return null; }
    }
    // слоты, разложенные на ДРУГИХ экранах — на этом их показывать нельзя
    function slotsElsewhere() {
        var out = {};
        tradeTabs().forEach(function (t) { if (t !== PF.dashTab) cfgSlots(cfgOf(t), out); });
        return out;
    }
    // слоты ЭТОГО экрана: что записано в его раскладку + бесхозные бумаги
    // (раскладку почистили, а выбор бумаги остался в localStorage)
    function slotNums() {
        var set = cfgSlots(PF.dashCfg, {});
        var taken = slotsElsewhere();
        Object.keys(SLOTS).forEach(function (n) {
            if (SLOTS[n].uid && !taken[slotNo(n)]) set[slotNo(n)] = 1;
        });
        var out = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
        return out.length ? out : [1];   // терминал без единого слота не бывает
    }
    // все занятые номера — по всем экранам разом
    function slotNumsAll() {
        var set = {};
        tradeTabs().forEach(function (t) { cfgSlots(cfgOf(t), set); });
        Object.keys(SLOTS).forEach(function (n) { set[slotNo(n)] = 1; });
        return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    }
    // какие слоты СЕЙЧАС на экране: только их и опрашиваем (скрытый блок молчит)
    function liveSlots() {
        // Сцена «Эволюции» рисует не карточки терминала, а один герой — но цена
        // ей нужна та же и берётся тем же стаканом, значит слот у неё живой.
        // Бумага на сцене одна: опрашивается только активный слот
        if (sceneLive()) {
            var one = sxSlot();
            return S(one).uid ? [one] : [];
        }
        var out = [], seen = {};
        var els = document.querySelectorAll('#panel-portfolios.active .btr-card[data-slot]');
        Array.prototype.forEach.call(els, function (el) {
            var n = slotNo(el.getAttribute('data-slot'));
            if (!seen[n]) { seen[n] = 1; out.push(n); }
        });
        return out;
    }
    function nextFreeSlot() {
        var used = slotNumsAll();
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
            minInc: +m.minInc > 0 ? +m.minInc : 0.01,
            aci: +m.aci > 0 ? +m.aci : 0,
            nom: +m.nom > 0 ? +m.nom : 0,
            kind: String(m.kind || '').slice(0, 24)
        };
    }
    // ---- облигации: проценты от номинала ⇄ рубли (владелец 2026-07-23) ----
    // Брокер котирует облигации в ПРОЦЕНТАХ от номинала (ОФЗ: 60,4 = 604 ₽ при
    // номинале 1000). Сцена работает В РУБЛЯХ; конверсия строго на границах:
    // рыночные данные ×k при приёме (стакан, свечи, лента, стопы, minInc),
    // заявки ÷k при отправке. k = номинал/100 (ОФЗ — 10). У акций k = 1.
    function bondKOf(meta) {
        if (!meta || !/bond/i.test(String(meta.kind || ''))) return 1;
        var nom = +meta.nom > 0 ? +meta.nom : 1000;   // ОФЗ и почти весь корп — 1000
        return nom / 100;
    }
    function bondK(s) { return bondKOf(s && s.meta); }
    function bondKUid(uid) { return bondKOf(instrMem[uid]); }
    function saveSlots() {
        var out = {};
        Object.keys(SLOTS).forEach(function (n) {
            var s = SLOTS[n];
            if (!s.uid || !s.meta) return;
            out[n] = {
                uid: s.uid, meta: s.meta, side: s.side, kind: s.kind,
                price: String(s.price || '').slice(0, 24),
                stopKind: s.stopKind, stopPrice: String(s.stopPrice || '').slice(0, 24),
                stopLimit: String(s.stopLimit || '').slice(0, 24), tif: s.tif,
                prot: !!s.prot, protSl: String(s.protSl || '').slice(0, 24), protTp: String(s.protTp || '').slice(0, 24),
                agg: s.agg, lots: s.lots, tapeOpen: !!s.tapeOpen
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
            s.stopKind = ['sl', 'tp', 'lim'].indexOf(v.stopKind) >= 0 ? v.stopKind : 'sl';
            // срок действия — только из известного списка: чужое значение уехало бы
            // в timeInForce и заявку отверг бы брокер
            s.tif = TIF_API.hasOwnProperty(v.tif) ? v.tif : 'gtc';
            s.price = numStr(v.price);
            s.stopPrice = numStr(v.stopPrice);
            s.stopLimit = numStr(v.stopLimit);
            s.prot = !!v.prot;
            s.protSl = numStr(v.protSl);
            s.protTp = numStr(v.protTp);
            s.agg = AGG_MULTS.indexOf(+v.agg) >= 0 ? +v.agg : 1;
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
    // Условие живёт в broker-api.js (canTrade): его спрашивает и «Рынок», где
    // ленивой цепочки «Портфелей» ещё нет. Здесь — только доступ к нему.
    function tradeReady() { return !!(A() && A().canTrade()); }
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
        var live = (c && !c.sandbox && !localStorage.getItem(LIVE_SEEN_KEY))
            ? '<div class="btr-live" id="btLive"><b>Боевой контур:</b> заявки уходят на настоящую биржу. ' +
              'Потренироваться без риска можно в песочнице (подключение брокера → песочница).' +
              '<button type="button" onclick="pftLiveOk()">Понятно</button></div>'
            : '';
        return acctBannerHtml() + live;
    }
    // ЧЕЙ ЭТО СЧЁТ. «Торговля» стоит в ряду подвкладок «Портфелей» рядом с
    // ручными портфелями, и легко решить, что сделки идут «в текущий портфель».
    // Это не так: терминал работает на БРОКЕРСКОМ счёте Т-Инвестиций, а портфели
    // слева — отдельный ручной учёт. Плашка говорит это прямо и постоянно (в
    // полноэкранном режиме то же самое несёт строка 44px, там баннер не нужен).
    function acctBannerHtml() {
        if (fsOn()) return '';
        var c = conn(); if (!c) return '';
        var tail = accTail() ? ' ····' + esc(accTail()) : '';
        return '<div class="btr-acctb">' +
            '<span class="btr-acctb-ic">' + IC_BROKER + '</span>' +
            '<span class="btr-acctb-t">Сделки идут на брокерский счёт <b>' +
                esc(c.accountName || 'Т-Инвестиции') + tail + '</b>' +
                (c.sandbox ? '<i class="btr-sand">песочница</i>' : '') + '</span>' +
            '<span class="btr-acctb-sub">Портфели слева — ваш ручной учёт, сюда сделки не попадают.</span>' +
        '</div>';
    }
    var IC_BROKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 21V10l8-5 8 5v11M9 21v-6h6v6"/></svg>';
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
    function posCard() { return '<div class="dash2-card pf-card2 btr-card btr-pos">' + posCardHtml() + '</div>'; }
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
    var IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var IC_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    var IC_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"/></svg>';
    var IC_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5"/><path d="M13.7 19.5a2 2 0 0 1-3.4 0"/></svg>';

    // ---------- избранные бумаги ----------
    // Тот же приём, что у ISIN-избранного облигаций (bnd_fav_v1): локальный
    // список, чтобы не искать один и тот же тикер каждый раз заново. Паспорт
    // храним целиком — тогда выбор из избранного не ждёт запроса к брокеру.
    var FAV_KEY = 'bt_fav_v1', FAV_MAX = 24;
    var FAVS = [];
    function loadFavs() {
        var o;
        try { o = JSON.parse(localStorage.getItem(FAV_KEY) || 'null'); } catch (e) { return; }
        if (!Array.isArray(o)) return;
        FAVS = o.map(normMeta).filter(Boolean).filter(function (m) { return m.uid; }).slice(0, FAV_MAX);
    }
    function saveFavs() {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(FAVS.slice(0, FAV_MAX))); } catch (e) {}
    }
    function isFav(uid) { return !!uid && FAVS.some(function (m) { return m.uid === uid; }); }
    window.pftFavToggle = function (n) {
        var s = S(n);
        if (!s.uid || !s.meta) return;
        if (isFav(s.uid)) {
            FAVS = FAVS.filter(function (m) { return m.uid !== s.uid; });
            toast(s.meta.ticker + ' убран из избранного');
        } else {
            if (FAVS.length >= FAV_MAX) { toast('В избранном уже ' + FAV_MAX + ' бумаг — уберите лишние', true); return; }
            FAVS.unshift(normMeta(s.meta) || s.meta);
            toast(s.meta.ticker + ' в избранном');
        }
        saveFavs();
        repaintSlot(n);
    };
    // избранное показывается прямо в открытом поиске: пустое поле — не тупик,
    // а список того, чем торгуют чаще всего
    function favChips(n) {
        if (!FAVS.length) return '';
        return '<div class="btr-favs"><span class="btr-favs-k">Избранное</span>' +
            FAVS.map(function (m, i) {
                return '<button type="button" class="btr-fav" onclick="pftFavPick(' + n + ',' + i + ')">' +
                    esc(m.ticker) + '</button>';
            }).join('') + '</div>';
    }
    window.pftFavPick = function (n, i) {
        var m = FAVS[i];
        if (!m || !m.uid) return;
        var s = S(n);
        s.uid = m.uid; s.meta = m; clearBook(s); s.price = ''; s.tape = [];
        s.max = null; s.searchQ = ''; s.searchOpen = false; s.metaStale = true;
        instrMem[m.uid] = m;
        saveSlots(); repaintSlot(n); emitSlotChange(n);
        pollOb(); pollStatus(); pollTape(n); pollMaxLots(n);
    };

    // ---------- алерты по цене ----------
    // Смысл фичи — НЕ сидеть во вкладке. Но проверка идёт по тику стакана, то
    // есть работает, пока терминал открыт; обещать больше нельзя, и в модалке
    // это сказано прямо.
    var ALERT_KEY = 'bt_alerts_v1', ALERT_MAX = 20;
    var ALERTS = [];
    function loadAlerts() {
        var o;
        try { o = JSON.parse(localStorage.getItem(ALERT_KEY) || 'null'); } catch (e) { return; }
        if (!Array.isArray(o)) return;
        ALERTS = o.filter(function (a) {
            return a && typeof a === 'object' && normId(a.uid) && +a.px > 0 && (a.dir === 'up' || a.dir === 'down');
        }).slice(0, ALERT_MAX).map(function (a) {
            return { uid: normId(a.uid), ticker: String(a.ticker || '').slice(0, 24), px: +a.px, dir: a.dir };
        });
    }
    function saveAlerts() {
        try { localStorage.setItem(ALERT_KEY, JSON.stringify(ALERTS.slice(0, ALERT_MAX))); } catch (e) {}
    }
    function alertsFor(uid) { return ALERTS.filter(function (a) { return a.uid === uid; }); }
    // проверка на тике стакана: последняя цена пересекла порог — уведомляем и
    // ГАСИМ алерт (иначе он звенел бы каждые две секунды)
    // Ядро проверки принимает ЦЕНУ, а не слот: на экране её приносит стакан, а
    // в фоне — один общий GetLastPrices на все бумаги с алертами.
    function checkAlertsAt(uid, last) {
        if (!ALERTS.length || !uid || !(last > 0)) return;
        var hit = ALERTS.filter(function (a) {
            return a.uid === uid && (a.dir === 'up' ? last >= a.px : last <= a.px);
        });
        if (!hit.length) return;
        ALERTS = ALERTS.filter(function (a) { return hit.indexOf(a) < 0; });
        saveAlerts();
        var ms = { meta: instrMem[uid] || null };
        hit.forEach(function (a) {
            var txt = (a.ticker || '') + ' · цена ' + (a.dir === 'up' ? 'выше' : 'ниже') + ' ' +
                fmtPx(a.px, ms) + ' ₽ (сейчас ' + fmtPx(last, ms) + ')';
            announce('Сработал алерт', txt);
        });
    }
    function checkAlerts(s) {
        if (!s.uid || !s.ob) return;
        checkAlertsAt(s.uid, A().q2n(s.ob.lastPrice));
    }
    window.pftAlertDrop = function (i) {
        ALERTS.splice(i, 1); saveAlerts();
        closeModal('btConfirmOv');
        liveSlots().forEach(function (n) { var el = dqs('Instr', n); if (el && S(n).meta) el.innerHTML = instrHtml(S(n), n); });
    };
    // ---------- единый каркас модалок терминала ----------
    // Пять самодельных копий каркаса разошлись деталями, а паттерн
    // «old.remove()» не снимал document-keydown прежней копии — слушатели
    // копились и жевали Escape. Теперь: подложка, проявление через rAF,
    // Escape и клик мимо — в одном месте; замена старой копии честно
    // снимает её слушатель.
    var modalKeys = {};   // id оверлея -> его document-keydown
    function closeModal(id) {
        if (modalKeys[id]) { document.removeEventListener('keydown', modalKeys[id]); delete modalKeys[id]; }
        var old = dq(id); if (old) old.remove();
    }
    // opts: { id, className?, card (html .bk-card...), onClose? }
    // возвращает { el, close } — кнопки внутри карточки вешает вызывающий
    function openModal(opts) {
        closeModal(opts.id);
        var ov = document.createElement('div');
        ov.id = opts.id;
        // без класса семейства оверлей не попал бы ни под одно правило
        // позиционирования и лёг бы в поток (грабли броker.css:8)
        ov.className = opts.className || 'bk-ov';
        ov.innerHTML = '<div class="bk-back"></div>' + opts.card;
        document.body.appendChild(ov);
        requestAnimationFrame(function () { ov.classList.add('open'); });
        function close() {
            document.removeEventListener('keydown', onKey);
            delete modalKeys[opts.id];
            ov.remove();
            if (opts.onClose) opts.onClose();
        }
        function onKey(e) {
            if (e.key !== 'Escape') return;
            e.stopPropagation(); e.preventDefault();
            close();
        }
        document.addEventListener('keydown', onKey);
        modalKeys[opts.id] = onKey;
        ov.querySelector('.bk-back').addEventListener('click', close);
        return { el: ov, close: close };
    }
    window.pftAlertOpen = function (n) {
        var s = S(n);
        if (!s.meta) return;
        var last = s.ob ? A().q2n(s.ob.lastPrice) : 0;
        var mine = ALERTS.map(function (a, i) { return { a: a, i: i }; }).filter(function (x) { return x.a.uid === s.uid; });
        var m = openModal({ id: 'btConfirmOv', card: '<div class="bk-card bk-card-pin btr-cf" role="dialog" aria-modal="true">' +
            '<div class="bk-title">Алерт по цене · ' + esc(s.meta.ticker) + '</div>' +
            (last > 0 ? '<div class="bk-kv"><span>Сейчас</span><b class="bk-mono">' + fmtPx(last, s) + ' ₽</b></div>' : '') +
            '<div class="ph-field"><label class="ph-lab" for="btAlPx">Уведомить, когда цена дойдёт до</label>' +
            '<input class="ph-input" id="btAlPx" type="number" step="' + (s.meta.minInc || 0.01) + '" min="0" placeholder="0"></div>' +
            (mine.length
                ? '<div class="btr-allist">' + mine.map(function (x) {
                    return '<div class="btr-alrow"><span>' + (x.a.dir === 'up' ? 'выше' : 'ниже') + ' <b>' +
                        fmtPx(x.a.px, s) + ' ₽</b></span>' +
                        '<button type="button" onclick="pftAlertDrop(' + x.i + ')">убрать</button></div>';
                  }).join('') + '</div>'
                : '') +
            '<div class="btr-note">Направление определяется само: цена выше текущей — ждём роста, ниже — падения. Алерты проверяются, пока терминал открыт.</div>' +
            '<div class="bk-foot"><button type="button" class="bk-btn" id="btCfNo">Закрыть</button>' +
            '<button type="button" class="bk-btn bk-btn-pri" id="btCfYes">Поставить</button></div></div>' });
        var ov = m.el, closeCf = m.close;
        ov.querySelector('#btCfNo').addEventListener('click', closeCf);
        setTimeout(function () { var f = dq('btAlPx'); if (f) try { f.focus(); } catch (e) {} }, 30);
        ov.querySelector('#btCfYes').addEventListener('click', function () {
            var v = +((dq('btAlPx') || {}).value) || 0;
            if (!(v > 0)) { toast('Укажите цену алерта', true); return; }
            if (!(last > 0)) { toast('Текущая цена ещё не пришла — попробуйте через секунду', true); return; }
            if (Math.abs(v - last) < 1e-9) { toast('Эта цена уже достигнута', true); return; }
            if (ALERTS.length >= ALERT_MAX) { toast('Больше ' + ALERT_MAX + ' алертов терминал не держит', true); return; }
            ALERTS.push({ uid: s.uid, ticker: s.meta.ticker, px: v, dir: v > last ? 'up' : 'down' });
            saveAlerts();
            closeCf();
            toast('Алерт поставлен: ' + (v > last ? 'выше ' : 'ниже ') + fmtPx(v, s) + ' ₽');
            var el = dqs('Instr', n); if (el) el.innerHTML = instrHtml(s, n);
        });
    };

    // ---- свежесть данных: жива ли СВЯЗЬ ----
    // Статус сессии (statusDot ниже) и статус связи — РАЗНЫЕ факты, и путать их
    // опасно: при обрыве сети зелёная точка «торги идут» продолжала бы уверенно
    // светить над замершим стаканом, а по этой цене отправляется заявка.
    //   live — успешный ответ моложе LIVE_MS;
    //   wait — успеха ещё не было вовсе (первый заход, спящая вкладка проснулась);
    //   stale — успех был, но протух: цены на экране больше не цены рынка.
    // Возвращает и причину: у пустого catch её было негде взять.
    function linkState(s) {
        if (!s || !s.uid) return { state: 'live', ageMs: 0, msg: '' };
        if (!s.obTs) return { state: 'wait', ageMs: 0, msg: s.obErr || 'Ждём первые данные от брокера' };
        var age = Date.now() - s.obTs;
        if (age < LIVE_MS) return { state: 'live', ageMs: age, msg: '' };
        return { state: 'stale', ageMs: age, msg: s.obErr || 'Брокер перестал отвечать' };
    }
    // строка 44px полноэкранного режима возьмёт ТОТ ЖЕ факт, а не заведёт второй
    PF.pftLinkState = function (n) { return linkState(S(n)); };
    // Последняя цена и закрытие по бумаге — для шапки графика в фокусе. Берём из
    // УЖЕ опрашиваемого стакана: заводить графику свой запрос цены значило бы
    // дёргать брокера дважды за одним и тем же числом.
    PF.pftLastFor = function (uid) {
        if (!uid || !A()) return null;
        var q2n = A().q2n, out = null;
        slotNums().forEach(function (n) {
            var s = S(n);
            if (out || s.uid !== uid || !s.ob) return;
            var last = q2n(s.ob.lastPrice) || 0, close = q2n(s.ob.closePrice) || 0;
            if (last > 0) out = { last: last, close: close, minInc: (s.meta && s.meta.minInc) || 0.01 };
        });
        return out;
    };
    function ageTxt(ms) {
        var sec = Math.floor(ms / 1000);
        if (sec < 90) return sec + ' с';
        var m = Math.floor(sec / 60);
        return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч';
    }
    // Метка связи МОЛЧИТ, пока всё живо: язык терминала — знак только на беду,
    // иначе ещё одна вечнозелёная лампочка, которую перестают замечать.
    function linkDot(s) {
        var l = linkState(s);
        if (l.state === 'live') return '';
        return '<span class="btr-link ' + l.state + '" title="' + esc(l.msg) + '"><i></i>' +
            (l.state === 'wait' ? 'ждём данные' : 'нет связи · ' + ageTxt(l.ageMs)) + '</span>';
    }
    // Смена бумаги: стакан прежней к делу больше не относится. Отметку свежести
    // обнуляем ВМЕСТЕ с ним, одним движением — иначе новая бумага стартует
    // «живой» с чужим временем последнего успеха, и кнопка разрешает заявку по
    // ещё пустому стакану (у рыночной заявки это цена вслепую).
    function clearBook(s) {
        s.ob = null; s.status = null;
        s.obTs = 0; s.obFail = 0; s.obErr = ''; s.linkKey = '';
        // поколение бумаги: каждый пуллер запоминает его при отправке запроса и
        // отбрасывает ответ, если бумага сменилась, пока запрос летел. Без этого
        // опоздавший ответ писал чужой стакан/ленту/лимиты, омолаживал obTs
        // (ломая гвард выше) и мог ложно сработать алертом по цене СТАРОЙ бумаги.
        s.gen = (s.gen || 0) + 1;
    }
    // Причина, по которой кнопку жать нельзя. Пусто — можно.
    // Блокируются ОБА вида заявок: у рыночной замершая цена бьёт по деньгам
    // прямо, а лимитную выставляют вслепую — не видно, что рынок ушёл.
    function submitBlock(s) {
        var st = linkState(s).state;
        if (st === 'wait') return 'Ждём данные от брокера';
        if (st === 'stale') return 'Нет связи — цена устарела';
        return '';
    }

    // ---- карточка стакана ----
    // статус торгов — тихая точка с подписью (без пилюли)
    function statusDot(s) {
        if (!s.uid) return '';
        var st = s.status && s.status.tradingStatus;
        var open = st === 'SECURITY_TRADING_STATUS_NORMAL_TRADING';
        return '<span class="btr-st ' + (open ? 'ok' : 'off') + '"><i></i>' +
            (open ? 'торги идут' : 'сессия закрыта') + '</span>';
    }
    function instrHtml(s, n) {
        if (!s.meta) return '';
        var fav = isFav(s.uid);
        var al = alertsFor(s.uid).length;
        // звезда и колокольчик — тихие иконки в строке бумаги, а не ряд кнопок:
        // обе настройки редкие, а главное в карточке — лестница
        var tools = '<span class="btr-itools">' +
            '<button type="button" class="btr-itool' + (fav ? ' on' : '') + '" title="' +
                (fav ? 'Убрать из избранного' : 'В избранное') + '" aria-pressed="' + (fav ? 'true' : 'false') +
                '" onclick="pftFavToggle(' + n + ')">' + IC_STAR + '</button>' +
            '<button type="button" class="btr-itool' + (al ? ' on' : '') + '" title="Алерт по цене" ' +
                'onclick="pftAlertOpen(' + n + ')">' + IC_BELL + (al ? '<i>' + al + '</i>' : '') + '</button>' +
        '</span>';
        // метка связи — в СВОЁЙ обёртке с id: возраст данных тикает раз в секунду,
        // и обновлять её надо точечно, не перерисовывая строку бумаги целиком
        var link = '<span class="btr-linkw" id="' + eid('Link', n) + '">' + linkDot(s) + '</span>';
        return '<b>' + esc(s.meta.ticker) + '</b><span class="btr-iname">' + esc(s.meta.name) + '</span>' +
            link + statusDot(s) + tools;
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
        // В ФОКУСЕ шапка панели несёт только шестерёнку (макет 01): поиск бумаги
        // уехал в строку 44px («Тикер или название» + «/»), вторая бумага — в
        // меню «Добавить виджет». Дублировать их в каждой карточке незачем.
        var fs = fsOn();
        var lens = fs ? '' :
            '<button type="button" class="btr-iconbtn' + (s.searchOpen ? ' on' : '') + '" id="' + eid('SearchTg', n) + '" ' +
            'title="Поиск бумаги" aria-label="Поиск бумаги" onclick="pftSearchToggle(' + n + ')">' + IC_LENS + '</button>';
        // «+» — быстрый путь ко второй бумаге, не заходя в «Добавить виджет»
        var add = (!fs && nextFreeSlot())
            ? '<button type="button" class="btr-iconbtn" title="Ещё одна бумага: стакан и заявка" ' +
              'aria-label="Добавить стакан по другой бумаге" onclick="pftAddSlot()">' + IC_PLUS + '</button>'
            : '';
        // кнопки конструктора — в потоке шапки ПЕРЕД лупой (PFD_OWN_CHROME, R9.2)
        var head = PF.pfCardHead('', slotTitle('Стакан', n), null, PF.pfdInChromeHtml(obId(n)) + add + lens);
        var search = '<div class="btr-search' + (s.searchOpen ? ' open' : '') + '" id="' + eid('SearchWrap', n) + '">' +
            '<input class="ph-input" id="' + eid('Search', n) + '" type="text" ' +
            'placeholder="Тикер или название — например, SBER" autocomplete="off" spellcheck="false" value="' + esc(s.searchQ) + '">' +
            '<div class="btr-search-drop" id="' + eid('SearchDrop', n) + '"></div>' + favChips(n) + '</div>';
        var title = s.meta ? '<div class="btr-instr" id="' + eid('Instr', n) + '">' + instrHtml(s, n) + '</div>' : '';
        // ЛЕНТА. В фокусе она ПОСТОЯННЫЙ блок у нижней кромки карточки (макет 01):
        // прижата margin-top:auto, заголовок капсом со счётчиком, шеврона нет —
        // сворачивать её тут нечем и незачем, места хватает. В дашборде остаётся
        // раскрывашкой: там карточка низкая и лента съела бы стакан.
        var tape = !s.uid ? ''
            : fs
            ? '<div class="btr-tape2">' +
                '<div class="btr-tape2-h"><span class="btr-tape2-l">Лента сделок</span>' +
                    '<span class="btr-tape2-c" id="' + eid('TapeCnt', n) + '">' + tapeCnt(s) + '</span></div>' +
                '<div class="btr-tape" id="' + eid('Tape', n) + '">' + tapeHtml(s) + '</div>' +
              '</div>'
            : '<div class="btr-fold' + (s.tapeOpen ? ' open' : '') + '" id="' + eid('TapeFold', n) + '">' +
                '<button type="button" class="btr-fold-btn" onclick="pftTapeToggle(' + n + ')">' +
                    '<span class="btr-fold-lab">Лента сделок</span>' +
                    '<span class="btr-fold-cnt" id="' + eid('TapeCnt', n) + '">' + tapeCnt(s) + '</span>' +
                    '<span class="btr-fold-ch">' + IC_CHEV + '</span>' +
                '</button>' +
                '<div class="btr-fold-body"><div class="btr-tape" id="' + eid('Tape', n) + '">' + tapeHtml(s) + '</div></div>' +
              '</div>';
        // .btr-obhost забирает всю свободную высоту карточки — по его боксу
        // считается глубина (fitOb), и замер не зависит от числа строк
        // гашение при рендере — той же меткой, что ставит freshTick: карточку
        // перерисовывают и во время обрыва (смена размера, конструктор)
        var stale = linkState(s).state !== 'live' ? ' btr-stale' : '';
        return head + search + title +
            '<div class="btr-obhost' + stale + '" id="' + eid('Ob', n) + '">' + obHtml(n) + '</div>' + tape;
    }
    function tapeCnt(s) { return s.tape.length ? s.tape.length + ' за 15 мин' : ''; }
    function tapeHtml(s) {
        // в фокусе лента постоянна — «раскройте ленту» там нечему предлагать
        if (!s.tapeOpen && !fsOn()) return '<div class="btr-tape-empty">Раскройте ленту — покажем сделки за последние 15 минут.</div>';
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
        // облигации: цена заявки у брокера в процентах — наружу в рублях
        if (px > 0) return px * bondKOf(instrMem[o.instrumentUid] || (s && s.meta));
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
    // Переключатель шага агрегации. Подписи — РЕЗУЛЬТИРУЮЩИЙ шаг в рублях, а не
    // множитель: «×10» ничего не говорит, «0,10 ₽» говорит всё. Тихая строка под
    // лестницей, а не ряд кнопок сверху: настройка редкая, стакан — главный.
    var AGG_MULTS = [1, 2, 5, 10, 25];
    function aggBar(n, s) {
        if (!s.meta) return '';
        var inc = s.meta.minInc || 0.01;
        var cur = Math.max(1, Math.floor(s.agg || 1));
        return '<div class="btr-agg"><span class="btr-agg-k">Шаг</span>' +
            AGG_MULTS.map(function (m) {
                return '<button type="button" class="btr-agg-b' + (m === cur ? ' on' : '') + '" ' +
                    'onclick="pftAgg(' + n + ',' + m + ')">' + fmtPx(inc * m, s) + '</button>';
            }).join('') + '</div>';
    }
    // стакан по оси цены: [объём спроса ←] цена [→ объём предложения];
    // клик по строке кладёт цену в активное ценовое поле тикета
    function obHtml(n) {
        n = slotNo(n);
        var s = S(n);
        if (!s.uid) return '<div class="pfal-empty">Найдите бумагу в поиске — стакан появится здесь. Подсказка: тикеры есть в виджете «Позиции у брокера».</div>';
        if (!s.ob) return '<div class="btr-obwait">Загружаем стакан…</div>';
        var q2n = A().q2n;
        // глубина — по высоте карточки: сколько уровней влезло вокруг центра оси
        var deep = s.depth || OB_DEPTH;
        // Агрегация по шагу цены: на бумаге с мелким шагом 20 уровней — узкая
        // полоска рынка. Склеиваем соседние цены в корзины и показываем ту же
        // высоту стакана, но заметно более широкий диапазон.
        // ВАЖНО: аск округляем ВВЕРХ, бид ВНИЗ. Округление «к ближайшему» сдвигало
        // бы уровень в сторону, выгодную глазу, — стакан обязан врать в свою пользу,
        // а не в пользу смотрящего.
        var mult = Math.max(1, Math.floor(s.agg || 1));
        var inc = (s.meta && s.meta.minInc) || 0.01;
        function levels(list, side) {
            var norm = (list || []).map(function (r) { return { px: q2n(r.price), q: +r.quantity || 0 }; });
            if (mult <= 1) return norm.slice(0, deep);
            var step = inc * mult, map = {}, order = [];
            norm.forEach(function (r) {
                var b = side === 'ask' ? Math.ceil(r.px / step) * step : Math.floor(r.px / step) * step;
                b = +b.toFixed(6);
                var k = Math.round(b / step);
                if (!map[k]) { map[k] = { px: b, q: 0, agg: true }; order.push(k); }
                map[k].q += r.q;
            });
            return order.map(function (k) { return map[k]; }).slice(0, deep);
        }
        var asks = levels(s.ob.asks, 'ask');
        var bids = levels(s.ob.bids, 'bid');
        var mine = myOrdersByPx(s), seen = {};
        // стакан пуст (закрытая сессия/неликвид) — заявка всё равно висит: показываем
        if (!asks.length && !bids.length) {
            var solo = myOutList(mine, seen, null, null, 0, s, n);
            return obEmptyHtml(s, q2n) + (solo.up + solo.down);
        }
        var maxQ = 1;
        asks.concat(bids).forEach(function (r) { maxQ = Math.max(maxQ, r.q); });
        // Накопленный объём: сколько лотов наберётся, если «съесть» стакан до
        // этого уровня включительно. Считается ОТ ЛУЧШЕЙ цены наружу, поэтому
        // итог у обеих сторон — полный объём своей половины стакана.
        var cumMax = 1;
        function withCum(list) {
            var acc = 0;
            list.forEach(function (r) { acc += r.q; r.cum = acc; });
            cumMax = Math.max(cumMax, acc);
            return list;
        }
        withCum(asks); withCum(bids);
        // best — лучшая цена (верх бидов / низ асков), примыкает к центру: акцент
        function row(r, side, best) {
            var p = r.px, q = r.q;
            var w = Math.max(4, Math.round(q / maxQ * 100));
            var cw = Math.max(2, Math.round((r.cum || q) / cumMax * 100));
            // своя заявка: в агрегированной строке — все, что попали в корзину
            var m = null;
            if (mult <= 1) {
                var k = pxKey(p, s);
                m = mine.px[k];
                if (m) seen[k] = 1;
            } else {
                var step = inc * mult;
                var lo = side === 'ask' ? p - step : p, hi = side === 'ask' ? p : p + step;
                Object.keys(mine.px).forEach(function (kk) {
                    var mm = mine.px[kk];
                    if (mm.px <= lo || mm.px > hi) return;
                    seen[kk] = 1;
                    if (!m) m = { px: p, lots: 0, stopLots: 0, buy: mm.buy, sell: mm.sell, sl: 0, tp: 0, stopBuy: 0, stopSell: 0 };
                    m.lots += mm.lots; m.stopLots += mm.stopLots;
                    m.sl += mm.sl; m.tp += mm.tp; m.stopBuy += mm.stopBuy; m.stopSell += mm.stopSell;
                });
            }
            // метка стоит у центра оси (рядом с ценой), где начинается полоса объёма
            var badge = m ? myMarks(m, s) : '';
            var half = '<span class="btr-axh"><u style="width:' + cw + '%"></u><i style="width:' + w + '%"></i>' +
                '<em>' + q.toLocaleString('ru-RU') + '</em>' + badge + '</span>';
            return '<div class="btr-axrow ' + side + (best ? ' best' : '') + (m ? ' mine' : '') + '" role="button" ' +
                'title="накоплено ' + (r.cum || q).toLocaleString('ru-RU') + ' лот" ' +
                'onclick="pftPickPrice(' + n + ',\'' + jsArg(String(p)) + '\')">' +
                (side === 'bid' ? half : '<span class="btr-axh"></span>') +
                '<b>' + fmtPx(p, s) + '</b>' +
                (side === 'ask' ? half : '<span class="btr-axh"></span>') +
            '</div>';
        }
        var bb = bids.length ? bids[0].px : 0, ba = asks.length ? asks[0].px : 0;
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
        var hiPx = askArr.length ? askArr[0].px : bids[0].px;
        var loPx = bids.length ? bids[bids.length - 1].px : askArr[askArr.length - 1].px;
        var out = myOutList(mine, seen, hiPx, loPx, last, s, n);
        return '<div class="btr-ax">' +
            // «Покупка/Продажа» — как в стакане самих Т-Инвестиций; прежнее
            // «Предложение · лоты» клипалось в карточке обычной ширины
            '<div class="btr-ax-head"><span>Лоты · покупка</span><span>Цена</span><span>Продажа · лоты</span></div>' +
            out.up + askHtml + mid + bidHtml + out.down +
        '</div>' + aggBar(n, s);
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
    // продажа — остаток бумаги на счёте) — клик подставляет.
    // Истина — GetMaxLots: брокер знает про маржу, плечо, заблокированное под
    // уже выставленными заявками и лимиты по инструменту. Локальный расчёт
    // «свободные деньги ÷ цену» остаётся ЗАПАСНЫМ путём: он завышает лимит на
    // маржинальном счёте, но лучше приблизительной цифры, чем никакой (метод
    // может быть недоступен — см. maxLotsOff).
    function availLots(s) {
        if (!s.meta) return 0;
        if (s.max) return s.side === 'sell' ? s.max.sell : s.max.buy;
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
            // 0 в позиции — тоже показываем: сразу видно, что продавать нечего.
            // Но только когда остаток ИЗВЕСТЕН: без ответа брокера «0 лот» — ложь
            var known = s.max || T.pos.secs[s.uid] != null || (s.meta.figi && T.pos.secs[s.meta.figi] != null);
            if (!known) return '';
            return '<button type="button" class="btr-ref" onclick="pftUseAvail(' + n + ')">в позиции <b>' + k + ' лот</b></button>';
        }
        var a = availLots(s);
        return a > 0 ? '<button type="button" class="btr-ref" onclick="pftUseAvail(' + n + ')">доступно <b>' + a.toLocaleString('ru-RU') + ' лот</b></button>' : '';
    }
    // Комиссия брокера. Точную ставку API не отдаёт (она в тарифе счёта), так
    // что это ПРИКИДКА по ставке, которую пользователь задаёт сам — но без неё
    // ИТОГО расходилось с выпиской на каждой сделке. Везде печатается со знаком
    // «≈», чтобы её не приняли за списанную сумму.
    function feePct() {
        var v;
        try { v = parseFloat(localStorage.getItem(FEE_KEY)); } catch (e) {}
        if (!isFinite(v) || v < 0) v = FEE_DEF;
        return Math.min(5, v);
    }
    function feeOf(sum) { return sum > 0 ? sum * feePct() / 100 : 0; }
    // сводка сделки над кнопкой: цена × штуки · комиссия · свободные деньги счёта
    function dealHtml(s) {
        if (!s.meta) return '';
        var shares = s.lots * (s.meta.lot || 1);
        var est = estPrice(s);
        var left = (est > 0 && shares > 0)
            ? '<span>' + fmtPx(est, s) + ' ₽ × ' + shares.toLocaleString('ru-RU') + ' шт</span>' : '<span></span>';
        var fee = feeOf(est * shares);
        var mid = fee > 0 ? '<span class="btr-deal-fee">комиссия ≈ <b>' + fmtRub(fee) + '</b></span>' : '';
        var right = T.pos.money != null
            ? '<span>свободно <b>' + fmtRub(T.pos.money) + '</b></span>' : '';
        return left + mid + right;
    }
    // чистый текст (без esc) — идёт и в textContent при точечном обновлении.
    // В ужатом тикете объём НЕ повторяем: он крупно стоит полем выше, а в кнопке
    // и так есть сумма — три экземпляра одного числа на карточку это перебор.
    function submitLbl(s) {
        return (s.side === 'buy' ? 'Купить ' : 'Продать ') + s.meta.ticker +
            (fsOn() ? '' : ' · ' + s.lots + ' лот');
    }
    // 1 лот · 2 лота · 5 лотов — иначе «максимум 34 лот» в референсе
    function lotsWord(k) {
        var a = Math.abs(k) % 100, b = a % 10;
        if (a > 10 && a < 20) return 'лотов';
        if (b > 1 && b < 5) return 'лота';
        return b === 1 ? 'лот' : 'лотов';
    }
    // пустая сумма (цена ещё не введена) → пустая строка: шов и цифра скрыты CSS-ом
    function submitSum(s) {
        var sum = estPrice(s) * s.lots * (s.meta.lot || 1);
        if (!(sum > 0)) return '';
        return (s.kind === 'limit' ? '' : '≈ ') + fmtRub(sum);
    }
    // ---- УЖАТЫЙ ТИКЕТ полноэкранного режима (макеты 01/02) ----
    // Девять групп обычного тикета в фокусе мешают: пока выставляешь заявку,
    // нужны цена, объём и кнопка, а всё остальное — справочно. Здесь пять групп:
    // цена (с типом заявки в строке лейбла и сроком тихой подписью), количество,
    // защита одной строкой, своя позиция одной строкой, кнопка.
    var KIND_NAMES = { limit: 'Лимитная', market: 'Рыночная', stop: 'Стоп' };
    function slimKindSel(n, s) {
        return '<select class="btr-slim-kind" aria-label="Тип заявки" onchange="pftKind(' + n + ', this.value)">' +
            ['limit', 'market', 'stop'].map(function (k) {
                return '<option value="' + k + '"' + (s.kind === k ? ' selected' : '') + '>' + KIND_NAMES[k] + '</option>';
            }).join('') + '</select>';
    }
    // «У вас 240 шт по 264,12 ₽ · +1 982 ₽» — позиция одной строкой вместо блока
    function slimHold(s) {
        var p = null;
        (T.port.list || []).forEach(function (x) { if (x.uid === s.uid) p = x; });
        if (!p || !(Math.abs(p.qty) > 0)) return '';
        var up = p.pnl >= 0;
        return '<div class="btr-slim-hold">У вас <b>' + Math.abs(p.qty).toLocaleString('ru-RU') + ' шт</b> по <b>' +
            fmtPx(p.avg, { meta: p.meta || null }) + ' ₽</b> · <b class="' + (up ? 'up' : 'dn') + '">' +
            (up ? '+' : '−') + fmtRub(Math.abs(p.pnl)) + '</b></div>';
    }
    function slimBody(n, s, inc, side, blk) {
        var lot = s.meta.lot || 1;
        var maxL = s.max ? (s.side === 'buy' ? s.max.buy : s.max.sell) : null;
        var maxRef = maxL != null ? '<span class="btr-slim-ref">максимум ' + maxL + ' ' + lotsWord(maxL) + '</span>' : '';
        // ЦЕНА. Тип заявки — в строке лейбла (был отдельный ряд табов),
        // срок — подписью под полем (был второй ряд табов).
        var priceRow;
        if (s.kind === 'market') {
            var m = midPrice(s);
            priceRow = '<div class="btr-slim-mkt">По лучшей цене стакана' +
                (m > 0 ? ' — сейчас ≈ ' + fmtPx(m, s) + ' ₽' : '') + '</div>';
        } else if (s.kind === 'stop') {
            priceRow = '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Stop', n) + '" type="number" step="' + inc + '" ' +
                'min="0" placeholder="0" value="' + esc(s.stopPrice) + '"><span class="btr-big-suf">₽</span></div>' +
                (s.stopKind === 'lim'
                    ? '<div class="btr-bigrow"><input class="btr-big" id="' + eid('StopLim', n) + '" type="number" step="' + inc + '" ' +
                      'min="0" placeholder="0" value="' + esc(s.stopLimit) + '"><span class="btr-big-suf">₽ заявки</span></div>' : '');
        } else {
            priceRow = '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Price', n) + '" type="number" step="' + inc + '" ' +
                'min="0" placeholder="0" value="' + esc(s.price) + '"><span class="btr-big-suf">₽</span></div>';
        }
        var tifSub = s.kind === 'limit'
            ? (s.tifOpen
                ? '<div class="btr-ttabs btr-slim-tif" id="' + eid('Tif', n) + '">' + TIF_TABS.map(function (it) {
                        return '<button type="button"' + (s.tif === it[0] ? ' class="active"' : '') +
                            ' onclick="pftTif(' + n + ',\'' + it[0] + '\')">' + it[1] + '</button>';
                  }).join('') + '</div>'
                : '<div class="btr-slim-sub">' + esc(TIF_TABS.filter(function (t) { return t[0] === s.tif; })[0][1]).toLowerCase() +
                  ' · <button type="button" class="btr-slim-edit" onclick="pftTifOpen(' + n + ')">изменить</button></div>')
            : '';
        var price = '<div class="btr-bf">' +
            '<div class="btr-bf-lab"><label for="' + eid(s.kind === 'stop' ? 'Stop' : 'Price', n) + '">' +
                (s.kind === 'stop' ? 'Стоп-цена' : 'Цена') + '</label>' + slimKindSel(n, s) +
                '<span id="' + eid('PxRef', n) + '">' + pxRefBtn(n) + '</span></div>' +
            priceRow + tifSub + '</div>';
        // КОЛИЧЕСТВО
        var shares = s.lots * lot;
        var qty = '<div class="btr-bf">' +
            '<div class="btr-bf-lab"><label for="' + eid('Lots', n) + '">Количество</label>' +
                '<span id="' + eid('LotsRef', n) + '">' + lotsRefBtn(n) + '</span>' + maxRef + '</div>' +
            '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Lots', n) + '" type="number" step="1" min="1" value="' + s.lots + '">' +
                '<span class="btr-big-suf">лотов</span></div>' +
            '<div class="btr-slim-sub" id="' + eid('Shares', n) + '">= ' + shares.toLocaleString('ru-RU') +
                ' штук · шаг цены ' + fmtPx(inc, s) + ' ₽</div></div>';
        // ЗАЩИТА — одной строкой. Поля раскрываются, только когда её включили.
        var prot = '';
        if (s.kind !== 'stop') {
            prot = '<div class="btr-slim-opt' + (s.prot ? ' on' : '') + '">' +
                '<button type="button" onclick="pftProt(' + n + ')" aria-pressed="' + (s.prot ? 'true' : 'false') + '">' +
                    '<span class="btr-prot-box">' + (s.prot ? IC_CHECK : '') + '</span>' +
                    '<span class="btr-slim-opt-l">Защита позиции</span>' +
                    '<span class="btr-slim-opt-v">' + (s.prot ? 'вкл' : 'выкл') + '</span></button>' +
                (s.prot ? protFieldsHtml(n, s, inc) : '') +
            '</div>';
        }
        // Предупреждения ОСТАЮТСЯ: в макете их не видно, потому что там всё в
        // порядке. Это предохранители (цена далеко от рынка, сессия закрыта,
        // частота) — убирать их ради компактности нельзя.
        var est = estPrice(s) * shares;
        var fee = feeOf(est);
        return '<div class="btr-tk-body btr-slim">' + side + price + qty + prot + slimHold(s) +
            '<div class="btr-warns" id="' + eid('Warns', n) + '">' + warnsHtml(s) + '</div>' +
            '</div>' +
            '<div class="btr-tk-foot">' +
                '<button type="button" class="btr-submit ' + s.side + (blk ? ' blocked' : '') + '" id="' + eid('Submit', n) + '"' +
                    (blk ? ' disabled title="' + esc(linkState(s).msg) + '"' : '') + ' onclick="pftAsk(' + n + ')">' +
                    '<span class="btr-sb-l">' + esc(blk || submitLbl(s)) + '</span>' +
                    '<span class="btr-sb-s">' + (blk ? '' : submitSum(s)) + '</span></button>' +
                // Настройки порога и комиссии остались в обычном тикете: здесь они
                // фразой, потому что правят их раз в жизни, а место дорого.
                '<div class="btr-slim-note">' + (fee > 0 ? 'включая комиссию ' + fmtRub(fee) + ' · ' : '') +
                'подтверждение вводом суммы от ' + fmtRub(sumLimit()) + '</div>' +
            '</div>';
    }
    window.pftTifOpen = function (n) {
        S(n).tifOpen = true;
        repaintSlot(slotNo(n));
    };

    function ticketHtml(n) {
        n = slotNo(n);
        var s = S(n);
        var c = conn();
        // порядок в шапке: сперва СЧЁТ (куда уйдёт заявка), потом бумага с лотностью
        // (просьба 2026-07-18) — сам тикер вынесен в заголовок карточки
        var note = '<div class="btr-hd-note">' + accNoteHtml() +
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
                'placeholder="0" value="' + esc(s.price) + '"><span class="btr-big-suf">₽</span></div></div>' +
                // срок действия: до этого заявка молча жила «до отмены» — то есть
                // забытая лимитка ждала неделями. Тот же компонент табов
                tabs(eid('Tif', n), TIF_TABS, s.tif, 'pftTif') +
                '<div class="btr-note">' + TIF_NOTE[s.tif] + '</div>';
        } else if (s.kind === 'stop') {
            var lim = s.stopKind === 'lim';
            kindFields = tabs(eid('StopKind', n), [['sl', 'Стоп-лосс'], ['tp', 'Тейк-профит'], ['lim', 'Стоп-лимит']], s.stopKind, 'pftStopKind') +
                '<div class="btr-bf"><div class="btr-bf-lab">' +
                '<label for="' + eid('Stop', n) + '">Стоп-цена' + stepHint + '</label>' +
                '<span id="' + eid('PxRef', n) + '">' + pxRefBtn(n) + '</span></div>' +
                '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Stop', n) + '" type="number" step="' + inc + '" min="0" ' +
                'placeholder="0" value="' + esc(s.stopPrice) + '"><span class="btr-big-suf">₽</span></div>' +
                (lim ? '' : '<div class="btr-note">При достижении стоп-цены уйдёт РЫНОЧНАЯ заявка: на неликвиде цена исполнения может заметно отличаться. Действует до отмены.</div>') +
                '</div>' +
                // стоп-лимит: по достижении стопа выставляется ЛИМИТНАЯ заявка —
                // защита от проскальзывания ценой того, что она может не исполниться
                (lim
                    ? '<div class="btr-bf"><div class="btr-bf-lab">' +
                        '<label for="' + eid('StopLim', n) + '">Цена заявки' + stepHint + '</label></div>' +
                        '<div class="btr-bigrow"><input class="btr-big" id="' + eid('StopLim', n) + '" type="number" step="' + inc + '" min="0" ' +
                        'placeholder="0" value="' + esc(s.stopLimit) + '"><span class="btr-big-suf">₽</span></div>' +
                        '<div class="btr-note">По стоп-цене выставится лимитная заявка по этой цене. Проскальзывания не будет, но при быстром движении рынка заявка может не исполниться. Действует до отмены.</div></div>'
                    : '');
        } else {
            var m = midPrice(s);
            kindFields = '<div class="btr-note">Исполнится по лучшей цене стакана' +
                (m > 0 ? ' — сейчас ≈ ' + fmtPx(m, s) + ' ₽' : '') + '. Итог зависит от рынка.</div>';
        }
        // Брекет: стоп и тейк ставятся ПОСЛЕ исполнения основной заявки (родного
        // OCO у брокера нет — связку ведёт терминал, см. BRACKETS). Для стоповой
        // заявки защита бессмысленна: она сама и есть защита.
        var prot = '';
        if (s.kind !== 'stop') {
            prot = '<div class="btr-prot' + (s.prot ? ' on' : '') + '">' +
                '<button type="button" class="btr-prot-tg" onclick="pftProt(' + n + ')" aria-pressed="' + (s.prot ? 'true' : 'false') + '">' +
                    '<span class="btr-prot-box">' + (s.prot ? IC_CHECK : '') + '</span>' +
                    '<span class="btr-prot-lab">Защита позиции</span>' +
                    '<span class="btr-prot-hint">стоп и тейк после исполнения</span>' +
                '</button>' +
                (s.prot
                    ? protFieldsHtml(n, s, inc) +
                      '<div class="btr-note">Обе заявки уйдут, как только исполнится основная. Когда сработает одна, терминал снимет вторую — пока вкладка открыта. Достаточно заполнить любое одно поле.</div>'
                    : '') +
            '</div>';
        }
        var shares = s.lots * (s.meta.lot || 1);
        var lotsField = '<div class="btr-bf"><div class="btr-bf-lab">' +
            '<label for="' + eid('Lots', n) + '">Лоты<i> · 1 лот = ' + (s.meta.lot || 1) + ' шт</i></label>' +
            '<span id="' + eid('LotsRef', n) + '">' + lotsRefBtn(n) + '</span></div>' +
            '<div class="btr-bigrow"><input class="btr-big" id="' + eid('Lots', n) + '" type="number" step="1" min="1" value="' + s.lots + '">' +
            '<span class="btr-big-suf" id="' + eid('Shares', n) + '">· ' + shares.toLocaleString('ru-RU') + ' шт</span></div></div>';
        var blk = submitBlock(s);   // связь оборвалась — кнопка не нажимается
        // В полноэкранном режиме тикет ужат с девяти групп до пяти (макет 01/02):
        // тип заявки уехал в строку лейбла цены, срок — тихой подписью, защита —
        // одной строкой, разбивка суммы осталась только в подтверждении. Поля и
        // их id те же самые, поэтому обработчики (wireSlot) и точечные
        // перерисовки (repaintTicketBits) работают на обоих вариантах.
        if (fsOn()) return head + slimBody(n, s, inc, side, blk);
        // Тикет делится на ПОЛЯ и ПОДВАЛ: карточку могут ужать, а обрезать в
        // тикете можно что угодно, кроме кнопки. Поля скроллятся, подвал прибит
        // ко дну (CSS .pfd-hset .btr-ticket) — действие всегда на виду.
        return head +
            '<div class="btr-tk-body">' +
                side + kind + kindFields + lotsField + prot +
                '<div class="btr-deal" id="' + eid('Deal', n) + '">' + dealHtml(s) + '</div>' +
                '<div class="btr-warns" id="' + eid('Warns', n) + '">' + warnsHtml(s) + '</div>' +
            '</div>' +
            '<div class="btr-tk-foot">' +
                // рендер во время обрыва обязан отдать кнопку УЖЕ заблокированной:
                // repaintTicketBits придёт только следующим тактом
                '<button type="button" class="btr-submit ' + s.side + (blk ? ' blocked' : '') + '" id="' + eid('Submit', n) + '"' +
                    (blk ? ' disabled title="' + esc(linkState(s).msg) + '"' : '') + ' onclick="pftAsk(' + n + ')">' +
                    '<span class="btr-sb-l">' + esc(blk || submitLbl(s)) + '</span>' +
                    '<span class="btr-sb-s">' + (blk ? '' : submitSum(s)) + '</span></button>' +
                '<div class="btr-subnote">' + IC_SHIELD + '<span>Подтверждение вводом суммы от</span>' +
                '<input id="' + eid('SumLimit', n) + '" type="number" min="1000" step="1000" value="' + sumLimit() + '"><span>₽</span>' +
                '<span class="btr-subnote-sep">·</span><span>комиссия</span>' +
                '<input id="' + eid('Fee', n) + '" type="number" min="0" max="5" step="0.01" value="' + feePct() + '"><span>%</span></div>' +
            '</div>';
    }
    var IC_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5v-6z"/></svg>';
    function estPrice(s) {
        var q2n = A().q2n;
        if (s.kind === 'limit') return +s.price || 0;
        // у стоп-лимита деньги считаются по цене ВЫСТАВЛЯЕМОЙ заявки, а не по
        // цене активации: по стоп-цене сделки не будет вовсе
        if (s.kind === 'stop') return s.stopKind === 'lim' ? (+s.stopLimit || 0) : (+s.stopPrice || 0);
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
    // velocity-гвард перед отправкой: один текст на все три пути
    // (тикет, перенос цены, «Просто») — копии уже начинали расходиться
    function velBlock() {
        var vel = velLeft();
        if (!(vel > 0)) return false;
        toast('Пауза после ' + VEL_MAX + ' заявок подряд — ещё ' + Math.ceil(vel / 1000) + ' с', true);
        return true;
    }
    // поля «Защиты позиции» — одни на оба тикета (обычный и слим): копии
    // одинаковые, но правка одной молча пропускала бы вторую
    function protFieldsHtml(n, s, inc) {
        return '<div class="btr-prot-fields">' +
            '<label class="btr-prot-f"><span>Стоп-лосс</span><span class="btr-prot-f-row">' +
            '<input id="' + eid('ProtSl', n) + '" type="number" step="' + inc + '" min="0" placeholder="0" value="' + esc(s.protSl) + '"><i>₽</i></span></label>' +
            '<label class="btr-prot-f"><span>Тейк-профит</span><span class="btr-prot-f-row">' +
            '<input id="' + eid('ProtTp', n) + '" type="number" step="' + inc + '" min="0" placeholder="0" value="' + esc(s.protTp) + '"><i>₽</i></span></label>' +
          '</div>';
    }
    // плашка счёта в шапке виджета (тикет, «Мои заявки», «Позиции») — одна на всех
    function accNoteHtml() {
        var c = conn();
        if (!c) return '';
        return '<span class="btr-hd-acc">' + esc(c.accountName || 'Счёт') +
            (accTail() ? ' <b>····' + accTail() + '</b>' : '') +
            (c.sandbox ? '<i class="btr-sand">песочница</i>' : '') + '</span>';
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
    // ---- ЗАЯВКИ ТАБЛИЦЕЙ (док полноэкранного режима, макет 01) ----
    // В дашборде заявка — две строки: карточка узкая, в ряд не помещается. В
    // доке ширина во весь экран, и таблица читается быстрее: глаз идёт по
    // колонке, а не собирает поля заново в каждой строке.
    var ORD_COLS = ['время', 'бумага', 'сторона', 'исполнение', 'лоты', 'цена', 'статус', ''];
    function ordHeadHtml() {
        return '<div class="btr-orh">' + ORD_COLS.map(function (c, i) {
            return '<span' + (i >= 4 && i <= 6 ? ' class="r"' : '') + '>' + c + '</span>';
        }).join('') + '</div>';
    }
    function ordTableRow(o) {
        var ins = instrMem[o.instrumentUid] || {};
        var buy = o.direction === 'ORDER_DIRECTION_BUY';
        var price = ordPx(o, metaSlot(o.instrumentUid));
        var req = +o.lotsRequested || 0, exec = +o.lotsExecuted || 0;
        var pct = req ? Math.round(exec / req * 100) : 0;
        var part = exec > 0;
        var canMove = o.orderType !== 'ORDER_TYPE_MARKET' && price > 0;
        var pxTxt = price > 0 ? fmtPx(price, metaSlot(o.instrumentUid)) : '—';
        return '<div class="btr-orr">' +
            '<span class="mut">' + (o.orderDate ? ordTime(o.orderDate) : '—') + '</span>' +
            '<span>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</span>' +
            '<span class="' + (buy ? 'buy' : 'sell') + '">' + (buy ? 'Купить' : 'Продать') + '</span>' +
            '<span>' + (part
                ? '<span class="btr-prog" title="исполнено ' + pct + '%"><i style="width:' + pct + '%"></i></span>'
                : '<span class="mut">—</span>') + '</span>' +
            '<span class="r">' + (part ? exec + ' / ' + req : req) + '</span>' +
            '<span class="r">' + (canMove
                ? '<button type="button" class="btr-ord-move" title="Перенести цену заявки" ' +
                  'onclick="pftMove(\'' + jsArg(o.orderId) + '\')">' + pxTxt + '</button>'
                : pxTxt) + '</span>' +
            '<span class="r nm">' + (part ? 'частично' : 'активна') + '</span>' +
            '<button type="button" class="btr-orx" title="Снять заявку" aria-label="Снять заявку" ' +
                'onclick="pftCancel(\'' + jsArg(o.orderId) + '\')">✕</button>' +
        '</div>';
    }
    function stopTableRow(o) {
        var ins = instrMem[o.instrumentUid] || {};
        var buy = o.direction === 'STOP_ORDER_DIRECTION_BUY';
        var px = A().q2n(o.stopPrice) || 0;
        var kind = o.orderType === 'STOP_ORDER_TYPE_TAKE_PROFIT' ? 'тейк'
            : (o.orderType === 'STOP_ORDER_TYPE_STOP_LIMIT' ? 'стоп-лимит' : 'стоп-лосс');
        return '<div class="btr-orr">' +
            '<span class="mut">' + (o.createDate ? ordTime(o.createDate) : '—') + '</span>' +
            '<span>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</span>' +
            '<span class="' + (buy ? 'buy' : 'sell') + '">' + (buy ? 'Купить' : 'Продать') + '</span>' +
            '<span class="mut">' + kind + '</span>' +
            '<span class="r">' + (+o.lotsRequested || 0) + '</span>' +
            '<span class="r">' + (px > 0 ? fmtPx(px, metaSlot(o.instrumentUid)) : '—') + '</span>' +
            '<span class="r nm">ждёт</span>' +
            '<button type="button" class="btr-orx" title="Снять заявку" aria-label="Снять заявку" ' +
                'onclick="pftCancelStop(\'' + jsArg(o.stopOrderId) + '\')">✕</button>' +
        '</div>';
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
        // Цену ЛИМИТНОЙ заявки можно перенести, не снимая её (ReplaceOrder):
        // отмена + новая заявка теряли очередь по этой цене. У рыночной очереди
        // нет — там цена не кликается.
        var canMove = o.orderType !== 'ORDER_TYPE_MARKET' && price > 0;
        var pxTxt = price > 0 ? fmtPx(price, metaSlot(o.instrumentUid)) + '&nbsp;₽' : '—';
        var pxEl = canMove
            ? '<button type="button" class="btr-ord-px btr-ord-move" title="Перенести цену заявки" ' +
                'onclick="pftMove(\'' + jsArg(o.orderId) + '\')">' + pxTxt + '</button>'
            : '<span class="btr-ord-px">' + pxTxt + '</span>';
        return '<div class="btr-ordrow ' + (buy ? 'buy' : 'sell') + '">' +
            '<div class="btr-ord1">' +
                '<b>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</b>' +
                '<span class="btr-ord-meta">' + (buy ? 'покупка' : 'продажа') + ' · ' + kindTxt + '</span>' +
                pxEl +
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
        var q2n = A().q2n;
        // третий тип (стоп-лимит) появился вместе с полем «цена заявки»: без
        // отдельной подписи он был бы неотличим от обычного стоп-лосса
        var st = o.stopOrderType;
        var typeTxt = st === 'STOP_ORDER_TYPE_TAKE_PROFIT' ? 'тейк-профит'
            : (st === 'STOP_ORDER_TYPE_STOP_LIMIT' ? 'стоп-лимит' : 'стоп-лосс');
        var lim = st === 'STOP_ORDER_TYPE_STOP_LIMIT' ? q2n(o.price) : 0;
        return '<div class="btr-ordrow ' + (buy ? 'buy' : 'sell') + '">' +
            '<div class="btr-ord1">' +
                '<b>' + esc(ins.ticker || (o.figi || '').slice(0, 8)) + '</b>' +
                '<span class="btr-ord-meta">' + typeTxt + ' · ' + (buy ? 'покупка' : 'продажа') +
                    (lim > 0 ? ' · по ' + fmtPx(lim, metaSlot(o.instrumentUid)) : '') + '</span>' +
                '<span class="btr-ord-px">от ' + fmtPx(q2n(o.stopPrice), metaSlot(o.instrumentUid)) + '&nbsp;₽</span>' +
                '<button type="button" class="btr-ordx" title="Снять стоп-заявку" aria-label="Снять стоп-заявку" onclick="pftCancelStop(\'' + jsArg(o.stopOrderId) + '\')">✕</button>' +
            '</div>' +
            '<div class="btr-ord2">' +
                (o.createDate ? '<i>' + ordTime(o.createDate) + '</i>' : '') +
                '<span class="btr-fill">' + (o.lotsRequested || 0) + ' лот</span>' +
                '<span class="btr-ost queue">ждёт цены</span>' +
            '</div></div>';
    }
    // Дата сделки печатается по московскому торговому дню: операция приходит в
    // UTC, и вечерняя сделка при наивной обрезке уехала бы на день назад против
    // того, что показывает приложение брокера (тот же расчёт, что в
    // portfolios-broker-pf.js · mskDate).
    function histDay(ts) {
        var d = new Date(ts + 3 * 3600 * 1000);
        var dd = d.getUTCDate(), mm = d.getUTCMonth() + 1;
        return (dd < 10 ? '0' : '') + dd + '.' + (mm < 10 ? '0' : '') + mm;
    }
    function histTime(ts) {
        var d = new Date(ts + 3 * 3600 * 1000);
        var h = d.getUTCHours(), m = d.getUTCMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }
    // одна исполненная сделка: тикер, направление, объём, цена, сумма, комиссия
    function histRow(r) {
        var ms = { meta: r.meta || null };
        // сумма приходит в валюте расчётов: печатать доллары рублёвым
        // форматтером — молча соврать, поэтому не-рубли идут с кодом валюты
        var rub = r.cur === 'rub';
        var sum = rub ? fmtRub(r.sum)
            : r.sum.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + esc(r.cur.toUpperCase());
        var fee = r.fee > 0 && rub
            ? '<span class="btr-hf">комиссия ' + fmtRub(r.fee) + '</span>' : '';
        return '<div class="btr-ordrow ' + (r.buy ? 'buy' : 'sell') + '">' +
            '<div class="btr-ord1">' +
                '<b>' + esc(r.ticker) + '</b>' +
                '<span class="btr-ord-meta">' + (r.buy ? 'куплено' : 'продано') + ' · ' + r.qty.toLocaleString('ru-RU') + ' шт</span>' +
                '<span class="btr-ord-px">' + fmtPx(r.price, ms) + (rub ? '&nbsp;₽' : '') + '</span>' +
            '</div>' +
            '<div class="btr-ord2">' +
                '<i>' + histDay(r.ts) + ' ' + histTime(r.ts) + '</i>' +
                '<span class="btr-fill">' + sum + '</span>' +
                fee +
            '</div></div>';
    }
    // журнал попыток (отправки, отказы брокера, отмены) — второстепенный слой
    // под шевроном: он объясняет, ПОЧЕМУ сделки нет, когда её нет
    function journalHtml() {
        var jr = (A() ? A().journal() : []).filter(function (e) { return e.ev.indexOf('order_') === 0; }).slice(0, 12)
            .map(function (e) {
                return '<div class="btr-jr"><span>' + esc(e.d || e.ev) + '</span><i>' +
                    new Date(e.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</i></div>';
            }).join('');
        // тот же компонент сворачивания, что у ленты сделок в стакане
        return '<div class="btr-fold' + (T.histJournal ? ' open' : '') + '">' +
            '<button type="button" class="btr-fold-btn" onclick="pftJournalFold()">' +
                '<span class="btr-fold-lab">Журнал заявок</span>' +
                '<span class="btr-fold-ch">' + IC_CHEV + '</span>' +
            '</button>' +
            '<div class="btr-fold-body">' +
                (jr || '<div class="btr-none">Событий пока нет.</div>') +
            '</div>' +
        '</div>';
    }
    function histRows() {
        var body;
        if (T.histBusy && !T.hist.length) body = '<div class="btr-none">Загружаем историю…</div>';
        else if (T.histErr && !T.hist.length) body = '<div class="btr-none">' + esc(T.histErr) + '</div>';
        else if (!T.hist.length) body = '<div class="btr-none">За ' + HIST_DAYS + ' дней исполненных сделок не было.</div>';
        else body = T.hist.map(histRow).join('');
        var upd = T.histTs
            ? '<i>обновлено ' + new Date(T.histTs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</i>'
            : '';
        var head = '<div class="btr-hbar"><span>Сделки за ' + HIST_DAYS + ' дней</span>' + upd +
            '<button type="button" class="btr-ref" onclick="pftHistReload()"' + (T.histBusy ? ' disabled' : '') + '>обновить</button></div>';
        return head + '<div class="btr-ords">' + body + '</div>' + journalHtml();
    }
    function ordersHtml() {
        var c = conn();
        var note = c
            ? '<div class="btr-hd-note">' + accNoteHtml() +
                (T.otab === 'pos' ? ageHint(T.port.ts, 'позиции')
                    : T.otab === 'hist' ? '' : ageHint(T.ordTs, 'заявки')) + '</div>'
            : '';
        // Шеврон сворачивает док: свёрнутый занимает одну строку, и высвободившееся
        // отдаётся верхнему ряду само — высоты в полноэкранном режиме доли, а не
        // пиксели (см. pfdFsFill). Только там он и нужен: в обычном дашборде блок
        // и так тянется мышью.
        // ПОДСКАЗКА ПО КЛАВИШАМ — прямо в шапке дока (макет 01), а не только в
        // модалке: клавиши были реализованы, но невидимы, и спрятать их за пункт
        // меню значило бы оставить ту же беду, только на этаж ближе.
        var keys = fsOn()
            ? '<span class="btr-dock-keys">' + [
                ['/', 'бумага'], ['B', ''], ['S', 'сторона'],
                ['↑', ''], ['↓', 'цена шагом'], ['Esc', 'выход']
              ].map(function (k) {
                  return '<kbd>' + k[0] + '</kbd>' + (k[1] ? '<span>' + k[1] + '</span>' : '');
              }).join('') + '</span>'
            : '';
        var chev = fsOn()
            ? '<button type="button" class="btr-dock-chev' + (dockOpen() ? '' : ' off') + '" ' +
                'onclick="pftDockToggle()" aria-expanded="' + dockOpen() + '" ' +
                'title="' + (dockOpen() ? 'Свернуть — место уйдёт стакану и графику' : 'Развернуть') + '" ' +
                'aria-label="Свернуть панель">' + IC_CHEV + '</button>'
            : '';
        var head = PF.pfCardHead('', 'Мои заявки', null, PF.pfdInChromeHtml('trade:orders') + note + keys + chev);
        // «Позиции» — вкладкой здесь: свой виджет trade:pos по умолчанию скрыт, и
        // открытых позиций было не видно вовсе. В доке они рядом с заявками —
        // один вопрос «что у меня сейчас», один блок.
        var tabs = '<div class="btr-ttabs" id="btOtabs">' +
            '<button type="button"' + (T.otab === 'active' ? ' class="active"' : '') + ' onclick="pftOtab(\'active\')">Активные<span class="btr-cnt">' + T.orders.length + '</span></button>' +
            '<button type="button"' + (T.otab === 'stop' ? ' class="active"' : '') + ' onclick="pftOtab(\'stop\')">Стоп<span class="btr-cnt">' + T.stops.length + '</span></button>' +
            '<button type="button"' + (T.otab === 'pos' ? ' class="active"' : '') + ' onclick="pftOtab(\'pos\')">Позиции<span class="btr-cnt">' + (T.port.list || []).length + '</span></button>' +
            '<button type="button"' + (T.otab === 'hist' ? ' class="active"' : '') + ' onclick="pftOtab(\'hist\')">История</button>' +
        '</div>';
        if (!dockOpen()) return head + tabs;   // свёрнут — только шапка и корешки вкладок
        var body;
        if (T.otab === 'pos') {
            // в доке — таблица с долей портфеля и итогом (макет 01),
            // в узкой карточке дашборда прежний двухстрочный список
            body = fsOn() ? posTableHtml() : posBodyHtml();
        } else if (T.otab === 'hist') {
            body = '<div class="btr-ords">' + histRows() + '</div>';
        } else if (T.otab === 'stop') {
            body = T.stops.length
                ? (fsOn()
                    ? ordHeadHtml() + '<div class="btr-ortab">' + T.stops.map(stopTableRow).join('') + '</div>'
                    : '<div class="btr-ords">' + T.stops.map(stopRow).join('') + '</div>')
                : '<div class="btr-none">Стоп-заявок нет. Выставить можно из тикета — тип «Стоп».</div>';
        } else {
            // в доке ширина во всю страницу — заявки таблицей (макет 01);
            // в узкой карточке дашборда та же заявка не влезет в ряд
            body = T.orders.length
                ? (fsOn()
                    ? ordHeadHtml() + '<div class="btr-ortab">' + T.orders.map(ordTableRow).join('') + '</div>'
                    : '<div class="btr-ords">' + T.orders.map(ordRow).join('') + '</div>')
                : '<div class="btr-none">Активных заявок нет — выставленные из тикета появятся здесь.</div>';
        }
        var panic = (T.otab !== 'hist' && T.otab !== 'pos' && T.orders.length + T.stops.length)
            ? '<button type="button" class="btr-panic" onclick="pftCancelAll()">Отменить все заявки</button>' : '';
        // Предложение включить уведомления показываем ТОЛЬКО когда есть чего
        // ждать (висят заявки) и они ещё не включены: иначе это реклама.
        // Без разрешения браузера фоновая слежка бесполезна — сделка случится,
        // а сказать о ней будет нечем.
        var ask = (T.otab !== 'hist' && T.otab !== 'pos' && (T.orders.length + T.stops.length) && !notifyOn() && ('Notification' in window))
            ? '<button type="button" class="btr-notify" onclick="pftNotifyOn()">' + IC_BELL +
                '<span>Уведомлять об исполнении</span>' +
                '<i>придёт, даже если уйти на другую вкладку</i></button>'
            : '';
        return head + tabs + body + ask + panic;
    }

    // ---------- карточка «Позиции»: что открыто и сколько на этом заработано ----------
    // Виджет ОДИН на счёт, как «Мои заявки». Источник — GetPortfolio: только он
    // отдаёт среднюю цену входа (в GetPositions её нет, там лишь остатки).
    // Клик по строке ставит бумагу в первый слот терминала, «закрыть» — заряжает
    // встречный тикет ПОЛНЫМ объёмом позиции, но НЕ отправляет: отправка всегда
    // остаётся явным действием с подтверждением.
    function posRow(p) {
        var ms = { meta: p.meta || null };
        var up = p.pnl >= 0;
        var pct = p.avg > 0 ? (p.last / p.avg - 1) * 100 : 0;
        var sign = up ? '+' : '−';
        var pnlTxt = sign + fmtRub(Math.abs(p.pnl));
        var pctTxt = sign + Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + '%';
        return '<div class="btr-posrow ' + (up ? 'up' : 'down') + '" role="button" tabindex="0" ' +
                'onclick="pftPosOpen(\'' + jsArg(p.uid) + '\')">' +
            '<div class="btr-ord1">' +
                '<b>' + esc(p.ticker) + '</b>' +
                '<span class="btr-ord-meta">' + p.qty.toLocaleString('ru-RU') + ' шт · средняя ' + fmtPx(p.avg, ms) + '</span>' +
                '<span class="btr-pos-pnl ' + (up ? 'pos' : 'neg') + '">' + pnlTxt + '</span>' +
            '</div>' +
            '<div class="btr-ord2">' +
                '<i>' + fmtPx(p.last, ms) + '&nbsp;₽</i>' +
                '<span class="btr-fill">' + fmtRub(p.val) + '</span>' +
                '<span class="btr-pos-pct ' + (up ? 'pos' : 'neg') + '">' + pctTxt + '</span>' +
                '<button type="button" class="btr-posx" onclick="event.stopPropagation();pftPosClose(\'' + jsArg(p.uid) + '\')">закрыть</button>' +
            '</div></div>';
    }
    // Метка тихой протухлости: стакан может жить, а заявки/позиции — стоять
    // (их пуллеры глотают ошибки молча). Возраст показываем ТОЛЬКО когда снимок
    // старше DATA_AGE_MS — вечнозелёная подпись «обновлено» стала бы шумом.
    function ageHint(ts, word) {
        if (!ts || Date.now() - ts < DATA_AGE_MS) return '';
        return '<i class="btr-hd-age" title="Данные не обновляются — показан последний успешный снимок">' +
            word + ' от ' + new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</i>';
    }
    function posCardHtml() {
        var c = conn();
        var note = c
            ? '<div class="btr-hd-note">' + accNoteHtml() + ageHint(T.port.ts, 'позиции') + '</div>'
            : '';
        var head = PF.pfCardHead('', 'Позиции', null, PF.pfdInChromeHtml('trade:pos') + note);
        return head + posBodyHtml();
    }
    // ---- ПОЗИЦИИ ТАБЛИЦЕЙ (док полноэкранного режима, макет 01) ----
    // Прибыль ₽ и доходность % — РАЗНЫЕ колонки (одной строкой «+1 982 ₽ · +3,13%»
    // их приходилось разбирать глазом), доля портфеля отделена просветом и
    // волосяной линией, снизу — итог по всем позициям.
    var POS_COLS = [['бумага', ''], ['количество', ''], ['средняя', 'r'], ['текущая', 'r'],
        ['стоимость', 'r'], ['прибыль, ₽', 'r'], ['доходность', 'r'], ['доля портфеля', ''], ['', '']];
    function posTableHtml() {
        var list = T.port.list || [];
        if (!list.length) {
            return '<div class="btr-none">' +
                esc(T.port.ts ? 'Открытых позиций нет — купленное появится здесь.' : 'Загружаем позиции…') + '</div>';
        }
        var total = 0;
        list.forEach(function (p) { total += Math.abs(p.val); });
        var head = '<div class="btr-psh">' + POS_COLS.map(function (c) {
            return '<span' + (c[1] ? ' class="r"' : '') + '>' + c[0] + '</span>';
        }).join('') + '</div>';
        var rows = list.map(function (p) {
            var ms = { meta: p.meta || null };
            var up = p.pnl >= 0;
            var pct = p.avg > 0 ? (p.last / p.avg - 1) * 100 : 0;
            var lot = (p.meta && p.meta.lot) || 1;
            var share = total > 0 ? Math.round(Math.abs(p.val) / total * 100) : 0;
            return '<div class="btr-psr" role="button" tabindex="0" onclick="pftPosOpen(\'' + jsArg(p.uid) + '\')">' +
                '<span class="pstk">' + esc(p.ticker) + '</span>' +
                '<span class="mut">' + Math.abs(p.qty).toLocaleString('ru-RU') + ' шт' +
                    (lot > 1 ? ' · ' + Math.floor(Math.abs(p.qty) / lot) + ' ' + lotsWord(Math.floor(Math.abs(p.qty) / lot)) : '') + '</span>' +
                '<span class="r mut">' + fmtPx(p.avg, ms) + '</span>' +
                '<span class="r">' + fmtPx(p.last, ms) + '</span>' +
                '<span class="r">' + fmtRub(p.val) + '</span>' +
                '<span class="r ' + (up ? 'up' : 'dn') + '">' + (up ? '+' : '−') + fmtRub(Math.abs(p.pnl)) + '</span>' +
                '<span class="r ' + (up ? 'up' : 'dn') + '">' + (up ? '+' : '−') +
                    Math.abs(pct).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + '%</span>' +
                '<span class="btr-share"><span class="bar"><i style="width:' + share + '%"></i></span><b>' + share + '%</b></span>' +
                '<button type="button" class="btr-psx" title="Закрыть позицию" aria-label="Закрыть позицию" ' +
                    'onclick="event.stopPropagation();pftPosClose(\'' + jsArg(p.uid) + '\')">✕</button>' +
            '</div>';
        }).join('');
        var pnl = list.reduce(function (a, p) { return a + p.pnl; }, 0);
        var val = list.reduce(function (a, p) { return a + p.val; }, 0);
        var inv = val - pnl;
        var pu = pnl >= 0;
        var yld = inv > 0 ? pnl / inv * 100 : 0;
        var tot = '<div class="btr-pstot">' +
            '<span>Стоимость позиций <b>' + fmtRub(val) + '</b></span>' +
            '<span>Прибыль <b class="' + (pu ? 'up' : 'dn') + '">' + (pu ? '+' : '−') + fmtRub(Math.abs(pnl)) + '</b></span>' +
            '<span>Доходность <b class="' + (pu ? 'up' : 'dn') + '">' + (pu ? '+' : '−') +
                Math.abs(yld).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + '%</b></span>' +
        '</div>';
        return head + '<div class="btr-pstab">' + rows + '</div>' + tot;
    }
    // Тело «Позиций» отдельно от карточки: тот же список идёт вкладкой в нижний
    // док полноэкранного режима, где своей шапки у него нет
    function posBodyHtml() {
        var list = T.port.list;
        if (!list.length) {
            var txt = T.port.ts
                ? 'Открытых позиций нет — купленное появится здесь.'
                : 'Загружаем позиции…';
            return '<div class="btr-none">' + esc(txt) + '</div>';
        }
        var pnl = list.reduce(function (a, p) { return a + p.pnl; }, 0);
        var val = list.reduce(function (a, p) { return a + p.val; }, 0);
        var up = pnl >= 0;
        // итог — герой карточки, тем же приёмом, что ИТОГО в тикете
        var total = '<div class="btr-postot">' +
            '<span class="btr-postot-k">Стоимость</span>' +
            '<b class="btr-postot-v">' + fmtRub(val) + '</b>' +
            '<span class="btr-postot-p ' + (up ? 'pos' : 'neg') + '">' +
                (up ? '+' : '−') + fmtRub(Math.abs(pnl)) + '</span>' +
        '</div>';
        return '<div class="btr-ords btr-poss">' + list.map(posRow).join('') + '</div>' + total;
    }
    // GetPortfolio — только пока виджет на экране: без него эти данные никому не
    // нужны, а запрос стоит столько же, сколько остальные
    function posCardEl() { return document.querySelector('.btr-pos'); }
    function pollPortfolio() {
        // Позиции нужны в трёх случаях: открыт свой виджет, они выбраны вкладкой
        // дока, или живёт сцена «Эволюции» (чипы позиций и итог портфеля в полосе).
        // Иначе запрос никому не нужен — а стоит он столько же.
        if (!awake() || (!posCardEl() && T.otab !== 'pos' && !sceneLive())) return;
        var c = conn(); if (!c) return;
        A().call('GetPortfolio', { accountId: c.accountId }, { interactive: false }).then(function (d) {
            var q2n = A().q2n;
            var out = [], need = [];
            (d.positions || []).forEach(function (p) {
                var qty = q2n(p.quantity);
                if (!(Math.abs(qty) > 0)) return;
                // валюта счёта — не позиция: рубли на балансе не «открытая сделка»
                if (String(p.instrumentType || '').toLowerCase() === 'currency') return;
                var avg = q2n(p.averagePositionPrice);
                var last = q2n(p.currentPrice) || avg;
                var uid = p.instrumentUid || p.figi || '';
                var pnl = q2n(p.expectedYield);
                // expectedYield брокер отдаёт не всегда — тогда считаем сами
                if (!isFinite(pnl) || (!pnl && avg > 0 && last !== avg)) pnl = (last - avg) * qty;
                out.push({
                    uid: uid, figi: p.figi || '', ticker: '', meta: instrMem[uid] || null,
                    qty: qty, avg: avg, last: last, val: last * qty, pnl: pnl
                });
                need.push({ instrumentUid: p.instrumentUid, figi: p.figi });
            });
            return A().resolveInstruments(need).then(function (cache) {
                out.forEach(function (p) {
                    var ins = (cache && cache[p.uid]) || instrMem[p.uid] || null;
                    p.ticker = (ins && ins.ticker) || (p.uid || '').slice(0, 8) || '—';
                });
                // крупные позиции вверху: взгляд идёт по деньгам, а не по алфавиту
                out.sort(function (a, b) { return b.val - a.val; });
                T.port = { list: out, ts: Date.now() };
                scnFetchCloses(out);   // цены закрытия — дневная дельта чипов сцены
                repaintPos();
                fsRepaintBits();   // связь и свежесть в строке среды сцены
                sxTick();          // чипы позиций и итог портфеля в сцене
            });
        }).catch(function () { /* тихо: карточка покажет прошлый снимок */ });
    }
    // Присваиваем innerHTML только когда разметка реально изменилась: пересборка
    // каждые 6/15 секунд рушила DOM (и фокус на кнопках дока) даже в тихом
    // рынке. Строку сравниваем целиком — это дешевле и надёжнее ключа по полям:
    // забытое поле в ключе означало бы «данные изменились, а экран нет».
    function setHtmlIfChanged(el, html) {
        if (el.__btHtml === html) return;
        el.__btHtml = html;
        el.innerHTML = html;
    }
    // позиции живут в двух местах: своим виджетом и вкладкой дока — обновляем оба
    function repaintPos() {
        var el = posCardEl(); if (el) setHtmlIfChanged(el, posCardHtml());
        if (T.otab === 'pos') repaintOrders();
    }
    // клик по позиции — поставить её бумагу в первый слот терминала
    function slotForInstrument(uid) {
        var nums = slotNums();
        for (var i = 0; i < nums.length; i++) if (S(nums[i]).uid === uid) return nums[i];
        return nums[0] || 1;
    }
    function loadInstrument(n, uid, then) {
        var s = S(n);
        if (s.uid === uid) { if (then) then(s); return; }
        s.uid = uid; clearBook(s); s.price = ''; s.tape = []; s.max = null;
        s.searchOpen = false;
        fetchMeta(uid).then(function (m) {
            s.meta = m; s.metaStale = false;
            saveSlots(); repaintSlot(n); emitSlotChange(n);
            pollOb(); pollStatus(); pollMaxLots(n);
            if (then) then(s);
        }, function (e) { toast(e.message, true); });
    }
    window.pftPosOpen = function (uid) {
        if (!uid) return;
        loadInstrument(slotForInstrument(uid), uid);
    };
    // «закрыть» — встречная заявка на весь объём. Тикет ЗАРЯЖАЕТСЯ, но не
    // отправляется: подтверждение сделки всегда остаётся за пользователем.
    window.pftPosClose = function (uid) {
        var p = null;
        T.port.list.forEach(function (x) { if (x.uid === uid) p = x; });
        if (!p) return;
        var n = slotForInstrument(uid);
        loadInstrument(n, uid, function (s) {
            var lot = (s.meta && s.meta.lot) || 1;
            var lots = Math.floor(Math.abs(p.qty) / lot);
            if (!(lots > 0)) { toast('В позиции меньше лота — закрыть её через терминал нельзя', true); return; }
            // длинную позицию закрывают продажей, короткую — покупкой
            s.side = p.qty > 0 ? 'sell' : 'buy';
            s.kind = 'market';
            s.lots = lots;
            saveSlots(); repaintSlot(n); pollMaxLots(n);
            toast('Тикет заряжен: ' + (s.side === 'sell' ? 'продажа ' : 'покупка ') + lots + ' лот — проверьте и подтвердите');
        });
    };

    // ---------- точечные перерисовки ----------
    function obCardEl(n) { return document.querySelector('.btr-ob[data-slot="' + slotNo(n) + '"]'); }
    function tkCardEl(n) { return document.querySelector('.btr-ticket[data-slot="' + slotNo(n) + '"]'); }
    function repaintOb(n) { var el = dqs('Ob', n); if (el) { el.innerHTML = obHtml(n); fitSoon(); } }
    function repaintObAll() { liveSlots().forEach(repaintOb); }
    function repaintWarns(n) { var el = dqs('Warns', n); if (el) el.innerHTML = warnsHtml(S(n)); }
    // ---------- такт свежести ----------
    // Возраст данных растёт САМ, без единого ответа брокера. Если пересчитывать
    // состояние только в ответах, при полном обрыве оно бы и не поменялось
    // никогда: ответов-то больше нет. Отсюда отдельный таймер — он ничего не
    // спрашивает у сети, только сверяет часы.
    // Перерисовка идёт по КЛЮЧУ состояния, а не каждый такт: пока связь жива,
    // ключ не меняется и DOM никто не трогает.
    function freshTick() {
        // Спящая вкладка поллинг НЕ ведёт (awake в pollOb) — данные в ней стареют
        // законно, и кричать об этом некому и незачем.
        if (!awake()) return;
        var anyStale = false;
        liveSlots().forEach(function (n) {
            var s = S(n);
            if (!s.uid) return;
            var l = linkState(s);
            if (l.state === 'stale') anyStale = true;
            var key = l.state + '|' + (l.state === 'stale' ? ageTxt(l.ageMs) : '');
            if (key === s.linkKey) return;
            s.linkKey = key;
            var lw = dqs('Link', n); if (lw) lw.innerHTML = linkDot(s);
            var host = dqs('Ob', n);
            if (host) host.classList.toggle('btr-stale', l.state !== 'live');
            repaintTicketBits(n);   // кнопка называет причину и перестаёт нажиматься
            fsRepaintBits();        // и точка связи в полосе — из того же факта
        });
        // Связь вернулась после обрыва: GetMaxLots мог выключиться НАВСЕГДА из-за
        // двух сетевых чихов (maxLotsOff) — обрыв не приговор методу, даём второй
        // шанс. Отказы самого метода (права, песочница) сюда не попадают: без
        // обрыва wasStale не взводится, и off остаётся выключенным честно.
        if (anyStale) T.wasStale = true;
        else if (T.wasStale) {
            T.wasStale = false;
            if (maxLotsOff || maxLotsFails) { maxLotsOff = false; maxLotsFails = 0; pollMaxLots(); }
        }
        // Заявки/позиции могли протухнуть ТИХО при живом стакане (их пуллеры
        // глотают ошибки): следим за возрастом снимков и перерисовываем шапки
        // на переходах — там появляется метка «заявки от чч:мм».
        var ageKey = (T.ordTs && Date.now() - T.ordTs > DATA_AGE_MS ? 'o' : '') +
            (T.port.ts && Date.now() - T.port.ts > DATA_AGE_MS ? 'p' : '');
        if (ageKey !== T.ageKey) { T.ageKey = ageKey; repaintOrders(); repaintPos(); }
        // Обрыв связи — ОДНО событие, а не четыре по числу слотов: флаг общий.
        // Говорим по разу на переход, иначе тост повторялся бы каждую секунду.
        // Гвард pollSince: сразу после возврата на вкладку данные ЗАКОННО стары
        // (пока летит первый запрос), и тост «связь потеряна» был бы враньём.
        // Гасить стакан и держать кнопку в эти доли секунды всё равно правильно —
        // цена-то и правда старая, поэтому гвард стоит только на тосте.
        if (anyStale && Date.now() - T.pollSince < LIVE_MS) return;
        if (anyStale && !T.linkWarned) {
            T.linkWarned = true;
            toast('Связь с брокером потеряна: цены на экране замерли, заявку отправить нельзя', true);
        } else if (!anyStale && T.linkWarned) {
            T.linkWarned = false;
            toast('Связь с брокером восстановлена');
        }
    }
    // полная перерисовка карточек ОДНОГО слота без общего ре-рендера вкладки
    function repaintSlot(n) {
        var w = obCardEl(n); if (w) w.innerHTML = obCardHtml(n);
        var t = tkCardEl(n); if (t) t.innerHTML = ticketHtml(n);
        wire();
        fitSoon();
    }
    function repaintOrders() {
        var el = document.querySelector('.btr-orders'); if (el) setHtmlIfChanged(el, ordersHtml());
        // график рисует те же заявки линиями — обновляем их в одном такте с
        // лентой, иначе линии отстают от списка на целый цикл поллинга
        if (PF.pfcSyncLines) PF.pfcSyncLines();
        // свечи сцены рисуют заявки теми же линиями (одна сущность, два
        // представления — мокап 04): обновляем в такт поллеру заявок;
        // scnKProt — уровни биржевых стоп-заявок из того же GetStopOrders
        if (sceneLive()) { scnKOrders(); scnKProt(); }
    }

    // ---------- виджеты живут по размеру карточки ----------
    // Общее правило дашборда (у списочных виджетов — pfdRowsFor): контент
    // подстраивается под размер блока, а не клипуется молча. Здесь размер
    // ЗАМЕРЯЕТСЯ, а не читается из cfg.h — тогда карточка перестраивается прямо
    // во время жеста, а не прыгает после отпускания кромки. Кто как тянется:
    //   · стакан — меняет ГЛУБИНУ: столько уровней вокруг центра оси, сколько влезло;
    //   · тикет и «Мои заявки» — скроллят середину, оставляя кнопку на виду (CSS);
    //   · обе карточки ниже TIGHT_H — в плотном режиме (.btr-tight).
    // ЛОВУШКА: мерим только offsetHeight/clientHeight. На десктопе к оболочке
    // применён zoom 0.9 (css/desktop-zoom.css), и getBoundingClientRect отдаёт
    // ВИЗУАЛЬНЫЕ пиксели (строка 25px → 22.5), а clientHeight — layout-пиксели.
    // Смешаешь — бюджет делится на заниженную строку, влезает на 11% больше
    // уровней, чем на самом деле, и низ стакана всё-таки уезжает за кромку.
    function hOf(el, def) { return el ? el.offsetHeight : def; }
    // высота, ЗАДАННАЯ виджету (.pfd-hset). Ноль — карточка растёт по контенту:
    // подстраивать не подо что, да и замер зависел бы от собственного результата
    function boxH(card) {
        var item = card.closest ? card.closest('.pfd-item') : null;
        return (item && item.classList.contains('pfd-hset')) ? card.clientHeight : 0;
    }
    function fitCards() { return document.querySelectorAll('#panel-portfolios.active .btr-card'); }
    var fitRO = null, fitRaf = 0;
    function fitAll() { Array.prototype.forEach.call(fitCards(), fitCard); }
    // ресайз идёт непрерывно во время жеста — считаем раз в кадр, а не на пиксель
    function fitSoon() {
        if (fitRaf) return;
        fitRaf = requestAnimationFrame(function () { fitRaf = 0; fitAll(); });
    }
    // карточки пересоздаются каждым рендером — подписку обновляем целиком
    function fitObserve() {
        if (!window.ResizeObserver) return;
        if (!fitRO) fitRO = new ResizeObserver(fitSoon);
        fitRO.disconnect();
        Array.prototype.forEach.call(fitCards(), function (el) { fitRO.observe(el); });
    }
    function fitCard(card) {
        var h = boxH(card);
        card.classList.toggle('btr-tight', !!h && h < TIGHT_H);
        if (card.classList.contains('btr-ob')) fitOb(card, h);
    }
    function fitOb(card, h) {
        var n = slotNo(card.getAttribute('data-slot'));
        var s = S(n);
        var host = dqs('Ob', n);
        var ax = host && host.querySelector('.btr-ax');
        var want = OB_DEPTH;
        if (h && ax) {
            var rowH = hOf(ax.querySelector('.btr-axrow'), 25);
            // всё, что в лестнице НЕ строка: шапка колонок, центр оси и свои
            // заявки вне глубины — они остаются при любом размере (+ margin из CSS)
            var fixed = hOf(ax.querySelector('.btr-ax-head'), 0) + 6 +
                        hOf(ax.querySelector('.btr-axmid'), 0) + 14 +
                        // переключатель шага — СЕСТРА лестницы внутри того же
                        // хоста: не вычесть её высоту значит отдать лестнице
                        // чужие ~30px и уронить нижние уровни за кромку
                        hOf(host.querySelector('.btr-agg'), 0);
            Array.prototype.forEach.call(ax.querySelectorAll('.btr-axout'), function (el) {
                fixed += el.offsetHeight + 6;
            });
            var rows = Math.floor((host.clientHeight - fixed) / rowH);
            var nAsk = ((s.ob && s.ob.asks) || []).length, nBid = ((s.ob && s.ob.bids) || []).length;
            // стороны бывают разной длины (тонкая книга) — ищем самую глубокую,
            // которая ещё влезает, а не делим свободные строки пополам
            want = OB_MIN;
            for (var k = OB_MIN; k <= OB_MAX; k++) {
                if (Math.min(k, nAsk) + Math.min(k, nBid) <= rows) want = k; else break;
            }
        }
        if (want === s.depth) return;
        s.depth = want;
        repaintOb(n);
    }
    // живые кусочки тикета: суффикс штук, сводка, сумма в кнопке, референсы —
    // точечно, не трогая инпуты (фокус и ввод не сбиваются)
    function repaintTicketBits(n) {
        var s = S(n);
        if (!s.meta || s.busy) return;
        var sh = dqs('Shares', n);
        // подпись под количеством у обычного и ужатого тикета РАЗНАЯ — точечное
        // обновление должно писать ту, что там сейчас, а не свою единственную
        if (sh) {
            var shares = (s.lots * (s.meta.lot || 1)).toLocaleString('ru-RU');
            sh.textContent = fsOn()
                ? '= ' + shares + ' штук · шаг цены ' + fmtPx(s.meta.minInc || 0.01, s) + ' ₽'
                : '· ' + shares + ' шт';
        }
        var d = dqs('Deal', n); if (d) d.innerHTML = dealHtml(s);
        var btn = dqs('Submit', n);
        if (btn) {
            // Замершие цены — причина ПРЯМО В КНОПКЕ: серая кнопка без объяснения
            // читается как «сайт сломался», а тут дело в связи и это надо сказать.
            var blk = submitBlock(s);
            btn.disabled = !!blk;
            btn.classList.toggle('blocked', !!blk);
            btn.title = blk ? linkState(s).msg : '';
            var l = btn.querySelector('.btr-sb-l'); if (l) l.textContent = blk || submitLbl(s);
            var sm = btn.querySelector('.btr-sb-s'); if (sm) sm.textContent = blk ? '' : submitSum(s);
        }
        var pr = dqs('PxRef', n); if (pr) pr.innerHTML = pxRefBtn(n);
        var lr = dqs('LotsRef', n); if (lr) lr.innerHTML = lotsRefBtn(n);
    }

    // ---------- данные ----------
    // ушли с подвкладки/вкладки браузера — таймеры гасим прямо из тика
    // (рендер «Портфелей» при уходе на другой раздел не перезапускается)
    function stillHere() {
        // .btr-card есть у любой карточки терминала: стакан могли удалить,
        // а тикет и «Мои заявки» оставить — поллинг им всё ещё нужен.
        // #btScene — сцена «Эволюции»: карточек терминала там нет, а данные те же
        if (document.querySelector('#panel-portfolios.active .btr-card, #panel-portfolios.active #btScene')) return true;
        stopPolling();
        return false;
    }
    function awake() { return stillHere() && document.visibilityState === 'visible'; }
    // ФОНОВЫЙ РЕЖИМ. Всё, что рисуется (стакан, лента, статус, позиции), в
    // невидимой вкладке смысла не имеет и остаётся на awake(). Но исполнение
    // заявки и срабатывание алерта — ровно то, ради чего уходят на другую
    // вкладку: их проверяем и в фоне, только реже и дешевле.
    // Что тут важно знать: браузер сам троттлит таймеры скрытых вкладок (Chrome
    // — до одного тика в минуту после нескольких минут в фоне), поэтому
    // BG_MS — это «не чаще», а не «ровно». Для сделок такой точности достаточно.
    function alive() { return stillHere(); }
    var BG_MS = 20000;
    var obAsk = OB_MAX;   // сколько уровней просим у брокера (см. catch ниже)
    // опоздавший ответ пуллера принимаем только для ТОЙ ЖЕ бумаги того же
    // поколения (см. clearBook); pftDropSlot подменяет сам объект слота —
    // поэтому сверяем свежий S(n), а не замкнутый s
    function slotAlive(n, u0, g0) {
        var s = S(n);
        return s.uid === u0 && (s.gen || 0) === g0 ? s : null;
    }
    function pollOb() {
        if (!awake()) return;
        liveSlots().forEach(function (n) {
            var s = S(n);
            if (!s.uid) return;
            var u0 = s.uid, g0 = s.gen || 0;
            A().call('GetOrderBook', { instrumentId: s.uid, depth: obAsk }, { interactive: false }).then(function (d) {
                var s2 = slotAlive(n, u0, g0); if (!s2) return;   // бумага уже другая
                // облигации: книга приходит в процентах от номинала — в рубли
                // прямо на границе (см. bondKOf); гвард от двойной конверсии
                var bk = bondK(s2);
                if (bk !== 1 && d && !d.__btRub) {
                    d.__btRub = 1;
                    var q2n = A().q2n, n2q = A().n2q;
                    var cv = function (p) { return p == null ? p : n2q(q2n(p) * bk); };
                    (d.asks || []).forEach(function (l) { l.price = cv(l.price); });
                    (d.bids || []).forEach(function (l) { l.price = cv(l.price); });
                    d.lastPrice = cv(d.lastPrice); d.closePrice = cv(d.closePrice);
                    d.limitUp = cv(d.limitUp); d.limitDown = cv(d.limitDown);
                }
                s2.ob = d;
                s2.obTs = Date.now(); s2.obFail = 0; s2.obErr = '';   // отсчёт свежести — только отсюда
                checkAlerts(s2);   // цена пересекла порог — сказать об этом
                repaintOb(n);
                repaintWarns(n);
                repaintTicketBits(n);
                sxTick();         // в «Просто» цена и разбивка живут тем же тиком
                freshTick();      // связь вернулась — снять гашение сразу, не ждя такта
            }).catch(function (e) {
                // Глубину просим с запасом — но если брокер такую не отдаёт,
                // молчаливый catch оставил бы стакан пустым навсегда. Один раз
                // откатываемся на проверенные 10 и больше с запасом не просим.
                if (obAsk > OB_DEPTH) obAsk = OB_DEPTH;
                var s2 = slotAlive(n, u0, g0); if (!s2) return;   // отказ чужой бумаги не считаем
                // Отказ стакана — единственная ошибка поллинга, которую терминал
                // обязан ПОКАЗАТЬ: на этих ценах считаются деньги. Стакан при этом
                // не стираем (полезно видеть, какой была картина) — его пометит
                // freshTick, когда последний успех протухнет.
                s2.obFail++;
                s2.obErr = (e && e.message) || 'Брокер не ответил';
                freshTick();
            });
        });
    }
    // bg=true — такт из фона: те же данные, но без перерисовок (рисовать
    // некому) и без дорезолва тикеров пачкой запросов
    function pollOrders(bg) {
        if (bg ? !alive() : !awake()) return;
        var c = conn(); if (!c) return;
        Promise.all([
            A().call('GetOrders', { accountId: c.accountId }, { interactive: false }),
            A().call('GetStopOrders', { accountId: c.accountId }, { interactive: false }).catch(function () { return { stopOrders: T.stops }; })
        ]).then(function (rs) {
            T.orders = (rs[0].orders || []).filter(function (o) {
                return ['EXECUTION_REPORT_STATUS_NEW', 'EXECUTION_REPORT_STATUS_PARTIALLYFILL'].indexOf(o.executionReportStatus) !== -1;
            });
            T.stops = rs[1].stopOrders || [];
            T.ordTs = Date.now();   // возраст снимка — для метки протухлости в доке
            // тикеры заявок — дорезолвим в память
            if (!bg) {
                T.orders.concat(T.stops).forEach(function (o) {
                    if (o.instrumentUid && !instrMem[o.instrumentUid]) fetchMeta(o.instrumentUid, true);
                });
            }
            traceOrders();        // что случилось с заявками, пропавшими из активных
            tracePartials();      // лимитка исполнилась частично — сказать один раз
            reconcileBrackets();  // сработала одна нога защиты — снять вторую
            if (bg) return;       // вкладка не на экране — перерисовывать нечего
            repaintOrders();
            repaintObAll();   // метки своих заявок — сразу, не ждя тика стакана
        }).catch(function () {});
    }

    // ---------- фоновый такт ----------
    // Цена для алертов в фоне берётся ОДНИМ запросом GetLastPrices на все
    // бумаги сразу, а не стаканом на каждую: стакан в невидимой вкладке никто
    // не смотрит, а лимит запросов брокера общий на токен.
    function pollAlertsBg() {
        if (!alive() || !ALERTS.length) return;
        var uids = [];
        ALERTS.forEach(function (a) { if (uids.indexOf(a.uid) < 0) uids.push(a.uid); });
        if (!uids.length) return;
        A().call('GetLastPrices', { instrumentId: uids }, { interactive: false }).then(function (d) {
            var q2n = A().q2n;
            (d.lastPrices || []).forEach(function (lp) {
                var uid = lp.instrumentUid || lp.figi;
                var px = q2n(lp.price) * bondKUid(uid);   // алерты живут в ₽
                if (!uid || !(px > 0)) return;
                checkAlertsAt(uid, px);
            });
        }).catch(function () {});
    }
    var bgTimer = null;
    function startBg() { if (!bgTimer) bgTimer = setInterval(bgTick, BG_MS); }
    function stopBg() { clearInterval(bgTimer); bgTimer = null; }
    function bgTick() {
        if (!alive()) { stopBg(); return; }
        if (document.visibilityState === 'visible') return;   // видимую вкладку ведут обычные таймеры
        pollOrders(true);
        pollAlertsBg();
    }
    // Переключение вкладки браузера: показали — возвращаем полный поллинг и
    // сразу подтягиваем данные (иначе первые секунды на экране висят цифры
    // минутной давности); спрятали — оставляем только фоновый такт.
    document.addEventListener('visibilitychange', function () {
        if (!alive()) { stopBg(); return; }
        if (document.visibilityState === 'visible') {
            // поллинг начинается ЗАНОВО: пока летит первый запрос, данные стары
            // законно — freshTick не должен принять это за обрыв связи
            T.pollSince = Date.now();
            pollOb(); pollOrders(); pollStatus(); pollPos(); pollMaxLots(); pollPortfolio();
        } else {
            startBg();
            bgTick();
        }
    });

    // ---------- судьба заявки: исполнилась или снята ----------
    // GetOrders отдаёт ТОЛЬКО активные, поэтому исполнение выглядит как
    // исчезновение строки — молча и незаметно. Пропавшую заявку дозапрашиваем
    // точечно (GetOrderState) и говорим пользователю, чем она кончилась.
    // Первый такт лишь ЗАПОМИНАЕТ картину: заявки, выставленные до открытия
    // терминала, не должны выстрелить очередью уведомлений.
    var seenOrders = null;   // null = первого такта ещё не было
    var FILL_ST = 'EXECUTION_REPORT_STATUS_FILL';
    function traceOrders() {
        var now = {};
        T.orders.forEach(function (o) { if (o.orderId) now[o.orderId] = o; });
        if (seenOrders === null) { seenOrders = now; return; }
        var was = seenOrders;   // снимок ДО подмены: в now пропавших заявок уже нет
        seenOrders = now;
        Object.keys(was).forEach(function (id) {
            if (!now[id]) resolveFate(id, was[id]);
        });
    }
    function resolveFate(orderId, was) {
        var c = conn(); if (!c) return;
        A().call('GetOrderState', { accountId: c.accountId, orderId: orderId }, { interactive: false }).then(function (o) {
            var ins = instrMem[o.instrumentUid] || instrMem[(was || {}).instrumentUid] || {};
            var tk = ins.ticker || '';
            var buy = o.direction === 'ORDER_DIRECTION_BUY';
            var lots = +o.lotsExecuted || 0;
            var st = o.executionReportStatus;
            if (st === FILL_ST || lots > 0) {
                var q2n = A().q2n;
                // средняя цена исполнения приходит за ОДНУ бумагу
                var px = q2n(o.averagePositionPrice) || q2n(o.executedOrderPrice) || 0;
                var txt = tk + ' · ' + (buy ? 'куплено ' : 'продано ') + lots + ' лот' +
                    (px > 0 ? ' по ' + fmtPx(px, { meta: ins }) + ' ₽' : '');
                A().logEvent('order_fill', txt);
                announce((buy ? 'Покупка исполнена' : 'Продажа исполнена'), txt);
                // маркер «вы купили тут» на линии сцены — штуки, не лоты
                addFill(o.instrumentUid || (was || {}).instrumentUid, px, lots * ((ins && ins.lot) || 1), buy);
                armProtection(o, ins);   // если к заявке заказывали защиту — ставим её
                // сделка появилась на счёте — история и лимиты устарели
                loadHist(true); pollPos(); pollMaxLots();
                syncBrokerCard();
            } else if (st === 'EXECUTION_REPORT_STATUS_CANCELLED') {
                delete pendingProt[orderId];   // заявка не исполнится — защита не понадобится
                A().logEvent('order_cancel', tk + ' · заявка снята');
            } else if (st === 'EXECUTION_REPORT_STATUS_REJECTED') {
                delete pendingProt[orderId];
                A().logEvent('order_error', tk + ' · заявка отклонена биржей');
                announce('Заявка отклонена', tk + ' · биржа не приняла заявку');
            }
        }).catch(function () { /* тихо: судьбу заявки покажет история */ });
    }
    // ---------- отказ брокера словами (экран 11, карточка d) ----------
    // Причина — словами человека; код ошибки — в раскрываемой подсказке, для
    // письма в поддержку. Деньги при отказе не списываются — говорим прямо.
    var ERR_WORDS = [
        [/30042|недостаточно средств|insufficient/i, 'Недостаточно средств на счёте. Деньги не списаны.'],
        [/30079|не.?доступен для торг|instrument .*unavailable/i, 'Бумага сейчас недоступна для торгов.'],
        [/30027|торги.*приостановлен|not available for trading/i, 'Торги по бумаге приостановлены биржей.'],
        [/30081|аукцион/i, 'Идёт аукцион — рыночная заявка невозможна, поставьте лимитку.'],
        [/минимальн.*шаг|min.?price.?increment|30057/i, 'Цена не ложится на шаг инструмента — тикет подставит ближайшую.'],
        [/лот|lot|30063/i, 'Количество не кратно лоту этой бумаги.'],
        [/лимит.*заявок|too many|429/i, 'Слишком много заявок подряд — подождите минуту.'],
        [/токен|unauthorized|401|40003/i, 'Брокер не узнал токен — проверьте подключение в кабинете.']
    ];
    function humanErr(msg) {
        for (var i = 0; i < ERR_WORDS.length; i++) if (ERR_WORDS[i][0].test(msg)) return ERR_WORDS[i][1];
        return 'Брокер не принял заявку. Деньги не списаны — попробуйте ещё раз или уточните параметры.';
    }
    function scnOrderFail(e) {
        var raw = String((e && e.message) || '').slice(0, 200);
        var m = openModal({ id: 'btConfirmOv', card: '<div class="bk-card bk-card-pin btr-cf" role="alertdialog" aria-modal="true">' +
            '<div class="bts-fail-ic">✕</div>' +
            '<div class="bk-title" style="text-align:center">Заявка не принята</div>' +
            '<div class="btr-note" style="text-align:center">' + esc(humanErr(raw)) + '</div>' +
            (raw ? '<details class="bts-fail-raw"><summary>Ответ брокера — для письма в поддержку</summary>' +
                '<code>' + esc(raw) + '</code></details>' : '') +
            '<div class="bk-foot"><button type="button" class="bk-btn bk-btn-pri" id="btCfNo">Понятно</button></div></div>' });
        m.el.querySelector('#btCfNo').addEventListener('click', m.close);
    }

    // ---------- частичное исполнение (экран 10, карточка 5) ----------
    // Лимитка стоит в стакане, а часть уже откушена: говорим ОДИН РАЗ на
    // изменение исполненного, не каждый тик. Купленное — в портфеле сразу.
    var partialSeen = {};   // orderId -> lotsExecuted, о которых уже сказали
    function tracePartials() {
        var now = {};
        T.orders.forEach(function (o) {
            if (!o.orderId) return;
            var done = +o.lotsExecuted || 0, req = +o.lotsRequested || 0;
            if (!(done > 0) || done >= req) return;
            now[o.orderId] = done;
            var was = partialSeen[o.orderId] || 0;
            if (done <= was) return;
            var tk = (instrMem[o.instrumentUid] || {}).ticker || '';
            announce('Частичное исполнение',
                tk + ': исполнено ' + done + ' из ' + req + ' лотов — остаток стоит в заявке');
        });
        partialSeen = now;
    }
    // Отмена частично исполненной — свой диалог: разбивка по мокапу (комиссия
    // только с исполненного) и честный выбор «оставить / отменить остаток».
    // Отмена остатка не трогает купленное.
    window.pftScCancelPart = function (orderId) {
        var o = null;
        T.orders.forEach(function (x) { if (x.orderId === orderId) o = x; });
        if (!o) { toast('Заявка уже исполнена или снята', true); return; }
        var done = +o.lotsExecuted || 0, req = +o.lotsRequested || 0;
        if (!(done > 0)) { window.pftCancel(orderId); return; }   // чистая — прежний путь
        var ms = metaSlot(o.instrumentUid);
        var ins = instrMem[o.instrumentUid] || {};
        var lot = ins.lot || 1;
        var px = ordPx(o, ms);
        var buy = o.direction === 'ORDER_DIRECTION_BUY';
        var doneQty = done * lot, sum = px * doneQty;
        var fee = feeOf(sum);
        var m = openModal({ id: 'btConfirmOv', card: '<div class="bk-card bk-card-pin btr-cf" role="dialog" aria-modal="true">' +
            '<div class="bk-title">Исполнено ' + doneQty.toLocaleString('ru-RU') + ' из ' +
                (req * lot).toLocaleString('ru-RU') + ' × ' + esc(ins.ticker || '') + '</div>' +
            '<div class="btr-note">Лимитка ' + fmtPx(px, ms) + ' стоит в стакане; ' +
                (buy ? 'купленные' : 'проданные') + ' ' + doneQty.toLocaleString('ru-RU') +
                ' уже в портфеле. Остаток можно снять в любой момент.</div>' +
            '<div class="bk-kv"><span>Исполнено ' + doneQty.toLocaleString('ru-RU') + ' × ' + fmtPx(px, ms) + ' ₽</span><b class="bk-mono">' +
                fmtKop(sum) + '</b></div>' +
            '<div class="bk-kv"><span>Комиссия с исполненного</span><b class="bk-mono">≈ ' + fmtKop(fee) + '</b></div>' +
            '<div class="bk-kv"><span>Осталось в заявке</span><b class="bk-mono">' +
                ((req - done) * lot).toLocaleString('ru-RU') + ' шт</b></div>' +
            '<div class="bk-kv"><span>' + (buy ? 'Списано сейчас' : 'Пришло сейчас') + '</span><b class="bk-mono">' +
                fmtKop(buy ? sum + fee : sum - fee) + '</b></div>' +
            '<div class="btr-note">Отмена остатка не трогает ' + (buy ? 'купленное' : 'проданное') +
                ': комиссия — только с исполненной части.</div>' +
            '<div class="bk-foot"><button type="button" class="bk-btn bk-btn-pri" id="btCfNo">Оставить заявку</button>' +
            '<button type="button" class="bk-btn" id="btCfYes">Отменить остаток</button></div></div>' });
        m.el.querySelector('#btCfNo').addEventListener('click', m.close);
        m.el.querySelector('#btCfYes').addEventListener('click', function () {
            m.close();
            var c = conn(); if (!c) return;
            A().call('CancelOrder', { accountId: c.accountId, orderId: orderId }).then(function () {
                A().logEvent('order_cancel', 'остаток частично исполненной заявки снят');
                toast('Остаток снят — исполненная часть в портфеле');
                pollOrders(); pollPos();
            }, function (e) { toast(e.message, true); });
        });
    };

    // ---------- брекет: защита позиции стопом и тейком ----------
    // У Т-Инвестиций НЕТ родного OCO: две стоп-заявки живут независимо, и после
    // срабатывания одной вторая осталась бы висеть — на продажу бумаг, которых
    // уже нет. Поэтому связку ведёт терминал:
    //   1) при отправке основной заявки запоминаем «что поставить после неё»;
    //   2) исполнилась (resolveFate) → выставляем стоп и тейк на исполненный объём;
    //   3) одна из пары пропала из GetStopOrders → снимаем вторую.
    // Пары переживают перезагрузку (bt_brackets_v1), но НЕ работают при закрытой
    // вкладке — об этом прямо сказано в тикете, обещать больше нельзя.
    var BRACKETS_KEY = 'bt_brackets_v1';
    var pendingProt = {};   // orderId основной заявки -> параметры защиты
    var BRACKETS = [];      // выставленные пары: {uid, slId, tpId, ts}
    function loadBrackets() {
        var o;
        try { o = JSON.parse(localStorage.getItem(BRACKETS_KEY) || 'null'); } catch (e) { return; }
        if (!Array.isArray(o)) return;
        BRACKETS = o.filter(function (b) {
            return b && typeof b === 'object' && normId(b.uid) && (normId(b.slId) || normId(b.tpId));
        }).slice(0, 40).map(function (b) {
            return { uid: normId(b.uid), slId: normId(b.slId), tpId: normId(b.tpId), ts: +b.ts || 0 };
        });
    }
    function saveBrackets() {
        try { localStorage.setItem(BRACKETS_KEY, JSON.stringify(BRACKETS.slice(0, 40))); } catch (e) {}
    }
    // защита ставится на ИСПОЛНЕННЫЙ объём: заявка могла исполниться частично,
    // и защищать надо то, что реально куплено
    function armProtection(o, ins) {
        var p = pendingProt[o.orderId];
        if (!p) return;
        delete pendingProt[o.orderId];
        var c = conn(); if (!c) return;
        var lots = Math.max(0, Math.floor(+o.lotsExecuted || 0));
        if (!lots) return;
        // защита закрывает позицию — значит, идёт ПРОТИВ основной сделки
        var dir = p.side === 'buy' ? 'STOP_ORDER_DIRECTION_SELL' : 'STOP_ORDER_DIRECTION_BUY';
        var pair = { uid: p.uid, slId: '', tpId: '', ts: Date.now() };
        var jobs = [];
        var bk = bondKUid(p.uid);   // облигации: уровни защиты в ₽ → брокеру в %
        function place(px, type, key) {
            if (!(px > 0)) return;
            jobs.push(A().call('PostStopOrder', {
                accountId: c.accountId, instrumentId: p.uid, quantity: String(lots),
                direction: dir, stopPrice: A().n2q(px / bk), stopOrderType: type,
                expirationType: 'STOP_ORDER_EXPIRATION_TYPE_GOOD_TILL_CANCEL'
            }).then(function (r) { pair[key] = String((r && r.stopOrderId) || ''); },
                function (e) { toast('Защиту выставить не удалось: ' + (e.message || ''), true); }));
        }
        place(p.sl, 'STOP_ORDER_TYPE_STOP_LOSS', 'slId');
        place(p.tp, 'STOP_ORDER_TYPE_TAKE_PROFIT', 'tpId');
        if (!jobs.length) return;
        Promise.all(jobs).then(function () {
            if (!pair.slId && !pair.tpId) return;
            // одна нога — связывать нечего, но заявка выставлена и это уже польза
            if (pair.slId && pair.tpId) { BRACKETS.push(pair); saveBrackets(); }
            A().logEvent('order_submit', (ins.ticker || '') + ' · защита: ' +
                (p.sl > 0 ? 'стоп ' + p.sl : '') + (p.sl > 0 && p.tp > 0 ? ' / ' : '') + (p.tp > 0 ? 'тейк ' + p.tp : ''));
            toast('Защита выставлена: ' + lots + ' лот');
            pollOrders();
        });
    }
    // одна нога пары исчезла (сработала или снята вручную) — снимаем вторую
    function reconcileBrackets() {
        if (!BRACKETS.length) return;
        var c = conn(); if (!c) return;
        var live = {};
        T.stops.forEach(function (o) { if (o.stopOrderId) live[o.stopOrderId] = 1; });
        var keep = [], changed = false;
        BRACKETS.forEach(function (b) {
            var sl = live[b.slId], tp = live[b.tpId];
            if (sl && tp) { keep.push(b); return; }          // обе на месте — ждём
            changed = true;
            if (!sl && !tp) return;                          // обеих нет — пара отработала
            var orphan = sl ? b.slId : b.tpId;
            A().call('CancelStopOrder', { accountId: c.accountId, stopOrderId: orphan }).then(function () {
                A().logEvent('order_cancel', 'парная заявка снята (сработала защита)');
                toast('Сработала одна заявка защиты — парная снята');
                pollOrders();
            }, function () { /* могли снять вручную: тишина уместнее ложной тревоги */ });
        });
        if (changed) { BRACKETS = keep; saveBrackets(); }
    }

    // ---------- сделка → карточка портфеля ----------
    // Замыкает петлю «торгую в терминале → вижу в „Моих портфелях“»: без этого
    // купленное доезжало до трекера только следующим плановым синком.
    // ВАЖНО: свою запись о сделке мы НЕ пишем. У брокерской карточки жёсткое
    // разделение источников (см. portfolios-broker-pf.js): количество бумаг
    // всегда из GetPortfolio, лоты и журнал — из GetOperations. Ручная вставка
    // сделки продублировалась бы, как только разбор истории дойдёт до неё сам.
    // Поэтому мы лишь ТОРОПИМ оба штатных синка (force снимает их троттлы).
    // Биржа проводит сделку не мгновенно — даём ей секунду форы.
    function syncBrokerCard() {
        if (!PF.brokerPfAlive || !PF.brokerPfAlive()) return;
        setTimeout(function () {
            try {
                if (PF.brokerPfSync) PF.brokerPfSync(true);
                if (PF.brokerPfOpsSync) PF.brokerPfOpsSync(true);
            } catch (e) { /* тихо: штатный синк подберёт сделку сам */ }
        }, 1200);
    }

    // Уведомление о СВОЕЙ сделке — только локально. Брокерские данные в этом
    // проекте не покидают устройство (cloud-sync.LOCAL_ONLY), а модуль звоночка
    // раздаёт оповещения ЧЕРЕЗ СЕРВЕР (таблица notifications в Supabase) — писать
    // туда состав сделок значило бы отправить торговую активность в облако.
    // Поэтому: вкладка на глазах — тост, вкладка в фоне — браузерное уведомление
    // (тем же флагом notifyBrowser, которым пользователь уже управляет в профиле).
    var noticeSeq = 0;
    function notifyOn() {
        if (!('Notification' in window) || Notification.permission !== 'granted') return false;
        try { return !!(JSON.parse(localStorage.getItem('profile_settings_v1') || '{}') || {}).notifyBrowser; }
        catch (e) { return false; }
    }
    // Точка в заголовке вкладки: исполнение в фоне не должно пропасть, даже
    // если пуш выключен. Снимается при возврате на вкладку (мокап 10, пин 5).
    function titleDot() {
        if (!document.hidden) return;
        if (!/^● /.test(document.title)) document.title = '● ' + document.title;
    }
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && /^● /.test(document.title)) {
            document.title = document.title.replace(/^● /, '');
        }
    });
    function announce(title, body) {
        // событие терминала — в звоночек сайта (локальный слой msNotify.local:
        // брокерский контур не уходит в облачную таблицу notifications)
        if (window.msNotify && window.msNotify.local) {
            window.msNotify.local(/исполнен|куплено|продано/i.test(title + body) ? 'success' : 'info', title, body);
        }
        titleDot();
        if (!document.hidden) { toast(body); return; }
        if (!notifyOn()) { toast(body); return; }
        // tag РАЗНЫЙ у разных событий: с общим тегом второе уведомление молча
        // затирало бы первое, и две сделки подряд выглядели бы как одна.
        // Без icon: модуль звоночка тоже его не ставит, а битый путь дал бы
        // пустой квадрат вместо иконки сайта.
        try {
            var nt = new Notification(title, { body: body, tag: 'pft-' + (++noticeSeq) });
            // клик возвращает на вкладку терминала — иначе уведомление сообщает
            // о сделке и не даёт на неё посмотреть
            nt.onclick = function () {
                try { window.focus(); } catch (e2) {}
                try { nt.close(); } catch (e2) {}
            };
        } catch (e) { toast(body); }
    }
    // свободные деньги и остатки бумаг — для референсов «доступно» и «свободно»
    function pollPos() {
        if (!awake()) return;
        var c = conn(); if (!c) return;
        A().call('GetPositions', { accountId: c.accountId }, { interactive: false }).then(function (d) {
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
            fsRepaintBits();   // «свободно» в полосе полноэкранного режима
        }).catch(function () { /* тихо: рефы просто не покажутся */ });
    }
    // ---------- лимиты «сколько можно купить/продать» ----------
    // Считает брокер, а не мы: у него на руках маржа, плечо, заблокированное
    // под уже выставленными заявками и ограничения по инструменту. Для
    // лимитной заявки лимит зависит от ЦЕНЫ — передаём ту, что в тикете.
    // Метод могут не отдать (права, песочница) — после двух подряд отказов
    // перестаём спрашивать и живём на локальной прикидке (тот же приём, что с
    // глубиной стакана у obAsk).
    var maxLotsFails = 0, maxLotsOff = false;
    function pollMaxLots(only) {
        if (maxLotsOff || !awake()) return;
        var c = conn(); if (!c) return;
        var list = only ? [slotNo(only)] : liveSlots();
        list.forEach(function (n) {
            var s = S(n);
            if (!s.uid) return;
            var body = { accountId: c.accountId, instrumentId: s.uid };
            var px = s.kind === 'limit' ? +s.price : 0;
            if (px > 0) body.price = A().n2q(px / bondK(s));   // облигации: ₽ → %
            var u0 = s.uid, g0 = s.gen || 0;
            A().call('GetMaxLots', body, { interactive: false }).then(function (d) {
                var s2 = slotAlive(n, u0, g0); if (!s2) return;   // лимиты чужой бумаги
                maxLotsFails = 0;
                var bl = d.buyLimits || {}, sl = d.sellLimits || {};
                // берём лимиты СВОИХ средств, не маржинальные: «доступно» должно
                // означать «на свои», иначе кнопка молча предлагает влезть в долг
                s2.max = {
                    buy: Math.max(0, Math.floor(+bl.buyMaxLots || 0)),
                    sell: Math.max(0, Math.floor(+sl.sellMaxLots || 0)),
                    ts: Date.now()
                };
                repaintTicketBits(n);
            }).catch(function () {
                var s2 = slotAlive(n, u0, g0); if (!s2) return;   // и отказ тоже не её
                if (++maxLotsFails >= 2) maxLotsOff = true;
                s2.max = null;
                repaintTicketBits(n);
            });
        });
    }
    // лента — только у РАЗВЁРНУТЫХ: свёрнутая никому не видна, а запрос стоит
    // столько же, сколько стакан (на четырёх слотах это заметная разница)
    function pollTape(only) {
        if (!awake()) return;
        var list = only ? [slotNo(only)] : liveSlots();
        list.forEach(function (n) {
            var s = S(n);
            // лента-пульс сцены: на «Разгоне»+ активной бумаге лента нужна всегда
            if (!s.uid || (!s.tapeOpen && !fsOn() && !scnTapeWants(n))) return;
            var now = Date.now();
            var u0 = s.uid, g0 = s.gen || 0;
            A().call('GetLastTrades', {
                instrumentId: s.uid,
                from: new Date(now - 15 * 60000).toISOString(),
                to: new Date(now).toISOString()
            }, { interactive: false }).then(function (d) {
                var s2 = slotAlive(n, u0, g0); if (!s2) return;
                // 20 — с запасом на раскрытый блок карточного стакана (16)
                s2.tape = (d.trades || []).slice(-20).reverse();
                var el = dqs('Tape', n);
                if (el) el.innerHTML = tapeHtml(s2);
                var cnt = dqs('TapeCnt', n);
                if (cnt) cnt.textContent = tapeCnt(s2);
            }).catch(function () {});
        });
    }
    // ---------- история исполненных сделок ----------
    // Не в поллинге: GetOperations тяжелее рыночных методов и лимитируется
    // отдельно. Грузим по входу во вкладку «История», по кнопке «обновить» и
    // после собственного исполнения — этого хватает, чтобы список не отставал.
    var BUY_OPS = { OPERATION_TYPE_BUY: 1, OPERATION_TYPE_BUY_CARD: 1, OPERATION_TYPE_BUY_MARGIN: 1 };
    var SELL_OPS = { OPERATION_TYPE_SELL: 1, OPERATION_TYPE_SELL_CARD: 1, OPERATION_TYPE_SELL_MARGIN: 1 };
    function loadHist(force) {
        if (!A() || !conn()) return;
        if (T.histBusy) return;
        if (!force && T.histTs && Date.now() - T.histTs < HIST_TTL) return;
        T.histBusy = true; T.histErr = '';
        if (T.otab === 'hist') repaintOrders();
        var now = Date.now();
        A().getOperations(new Date(now - HIST_DAYS * 86400000).toISOString(), new Date(now).toISOString())
            .then(function (res) {
                var ops = (res && res.operations) || [];
                var q2n = A().q2n;
                // комиссия приходит ОТДЕЛЬНОЙ операцией со ссылкой на родителя;
                // связь мягкая — не сошлась, просто не покажем комиссию
                var fees = {};
                ops.forEach(function (o) {
                    if (o.operationType === 'OPERATION_TYPE_BROKER_FEE' && o.parentOperationId)
                        fees[o.parentOperationId] = (fees[o.parentOperationId] || 0) + Math.abs(q2n(o.payment));
                });
                var rows = [], need = [];
                ops.forEach(function (o) {
                    var buy = BUY_OPS[o.operationType] === 1, sell = SELL_OPS[o.operationType] === 1;
                    if (!buy && !sell) return;
                    var qty = Math.abs(Number(o.quantity) || 0);
                    var price = q2n(o.price);
                    var ts = Date.parse(o.date) || 0;
                    if (!(qty > 0) || !(price > 0) || !ts) return;
                    var key = o.instrumentUid || o.figi || '';
                    rows.push({
                        key: key, buy: buy, qty: qty, price: price, ts: ts,
                        sum: Math.abs(q2n(o.payment)) || price * qty,
                        fee: Math.round((fees[o.id] || 0) * 100) / 100,
                        cur: String((o.price && o.price.currency) || 'rub').toLowerCase(),
                        ticker: '', meta: null
                    });
                    if (key) need.push({ instrumentUid: o.instrumentUid, figi: o.figi });
                });
                rows.sort(function (a, b) { return b.ts - a.ts; });
                rows = rows.slice(0, HIST_MAX);
                return A().resolveInstruments(need).then(function (cache) {
                    rows.forEach(function (r) {
                        var ins = (cache && cache[r.key]) || instrMem[r.key] || null;
                        r.ticker = (ins && ins.ticker) || (r.key || '').slice(0, 8) || '—';
                        // шаг цены знаем только для бумаг, побывавших в слотах;
                        // для остальных fmtPx возьмёт свой разумный дефолт
                        r.meta = instrMem[r.key] || null;
                    });
                    T.hist = rows;
                    T.histTs = Date.now();
                    T.histBusy = false;
                    if (T.otab === 'hist') repaintOrders();
                });
            })
            .catch(function (e) {
                T.histBusy = false;
                T.histErr = (e && e.message) || 'Историю получить не удалось';
                if (T.otab === 'hist') repaintOrders();
            });
    }
    function pollStatus() {
        if (!stillHere()) return;
        liveSlots().forEach(function (n) {
            var s = S(n);
            if (!s.uid) return;
            var u0 = s.uid, g0 = s.gen || 0;
            A().call('GetTradingStatus', { instrumentId: s.uid }, { interactive: false }).then(function (d) {
                var s2 = slotAlive(n, u0, g0); if (!s2) return;
                s2.status = d;
                repaintWarns(n);
                var el = dqs('Instr', n);
                if (el && s2.meta) el.innerHTML = instrHtml(s2, n);
            }).catch(function () {});
        });
    }
    function fetchMeta(uid, quiet) {
        // quiet = дорезолв из пуллера заявок: PIN-модалку звать не имеет права
        return A().call('GetInstrumentBy', { idType: 'INSTRUMENT_ID_TYPE_UID', id: uid }, quiet ? { interactive: false } : undefined).then(function (d) {
            var i = d.instrument || {};
            var kind = String(i.instrumentType || i.instrumentKind || '');
            var nom = A().q2n(i.nominal) || 0;
            // шаг цены облигации приходит в процентах — храним СРАЗУ в рублях
            // (0,01 % × номинал/100), как и все цены сцены (см. bondKOf)
            var k = bondKOf({ kind: kind, nom: nom });
            instrMem[uid] = {
                uid: uid, ticker: i.ticker || '', name: i.name || '', figi: i.figi || '',
                lot: +i.lot || 1, minInc: (A().q2n(i.minPriceIncrement) || 0.01) * k,
                // для тикета: НКД за штуку (он в РУБЛЯХ и у API) и вид бумаги.
                // У акций НКД нет и поле не придёт — тогда 0, и формула полной
                // цены схлопывается до «цена + комиссия», как и должна
                aci: A().q2n(i.aciValue) || 0,
                nom: nom,
                kind: kind
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
        // Зовётся из КАЖДОГО цикла рендера (pftAfterRender), в том числе с
        // фонового тика котировок. Таймеры от повтора защищены, но «чистый
        // лист» и стартовый залп из 7 запросов — только когда поллинг реально
        // начинается: иначе каждый ре-рендер сбрасывал гвард тоста (и «связь
        // потеряна» повторялась заново), а залп дёргал брокера впустую.
        var fresh = !T.obTimer;
        if (!T.obTimer) T.obTimer = setInterval(pollOb, POLL_MS.ob);
        if (!T.ordTimer) T.ordTimer = setInterval(pollOrders, POLL_MS.orders);
        if (!T.stTimer) T.stTimer = setInterval(pollStatus, POLL_MS.status);
        if (!T.tapeTimer) T.tapeTimer = setInterval(function () { pollTape(); }, POLL_MS.tape);
        // лимиты идут в такт с позициями: обе цифры отвечают на один вопрос
        // «сколько я могу», и дёргать брокера отдельным таймером незачем
        if (!T.posTimer) T.posTimer = setInterval(function () { pollPos(); pollMaxLots(); pollPortfolio(); }, POLL_MS.pos);
        // такт свежести сети не касается — сверяет часы с последним успехом
        if (!T.freshTimer) T.freshTimer = setInterval(freshTick, POLL_MS.fresh);
        // каждый заход в терминал начинается с чистого листа: иначе тревога,
        // взведённая в прошлый раз, отзовётся «связь восстановлена» на пустом месте
        if (fresh) {
            T.pollSince = Date.now();
            T.linkWarned = false;
        }
        // фоновый такт живёт рядом с обычными и сам пропускает ходы, пока
        // вкладка на экране: так он уже на месте, когда с неё уходят
        startBg();
        refreshStaleMeta();
        if (fresh) { pollOb(); pollOrders(); pollStatus(); pollTape(); pollPos(); pollMaxLots(); pollPortfolio(); }
    }
    function stopPolling() {
        clearInterval(T.obTimer); clearInterval(T.ordTimer); clearInterval(T.stTimer);
        clearInterval(T.tapeTimer); clearInterval(T.posTimer); clearInterval(T.freshTimer);
        T.obTimer = T.ordTimer = T.stTimer = T.tapeTimer = T.posTimer = T.freshTimer = null;
        stopBg();
    }
    // зовётся из цикла рендера portfolios.js: включает/гасит поллинг по месту
    function pftAfterRender() {
        // Сцена «Эволюции» живёт без карточек терминала (.btr-card), но данные
        // ей нужны те же — стакан для цены, портфель для чипов позиций
        if (sceneLive()) {
            sxWire(); scnFit(); startPolling();
            scnKMount();   // свечи сцены: движок и канвас переживают ре-рендер
            return;
        }
        var live = document.querySelector('#panel-portfolios.active .btr-card');
        if (live && tradeReady()) { wire(); fitObserve(); fitSoon(); startPolling(); }
        else { if (fitRO) fitRO.disconnect(); stopPolling(); }
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
    // цену правят посимвольно, а GetMaxLots — запрос к брокеру: ждём паузы в
    // наборе, иначе на «312,45» уйдёт пять запросов вместо одного
    var maxT = {};
    function maxSoon(n) {
        clearTimeout(maxT[n]);
        maxT[n] = setTimeout(function () { pollMaxLots(n); }, 700);
    }
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
            p.addEventListener('input', function () {
                s.price = p.value; fitBig(p); repaintWarns(n); repaintTicketBits(n); saveSoon();
                maxSoon(n);   // лимит зависит от цены — но не на каждый символ
            });
        }
        var sp = dqs('Stop', n);
        if (sp && !sp._wired) {
            sp._wired = true;
            fitBig(sp);
            sp.addEventListener('input', function () { s.stopPrice = sp.value; fitBig(sp); repaintTicketBits(n); saveSoon(); });
        }
        var slm = dqs('StopLim', n);
        if (slm && !slm._wired) {
            slm._wired = true;
            fitBig(slm);
            slm.addEventListener('input', function () { s.stopLimit = slm.value; fitBig(slm); repaintTicketBits(n); saveSoon(); });
        }
        // поля защиты — мелкие, без fitBig: они не «крупные цифры» тикета
        [['ProtSl', 'protSl'], ['ProtTp', 'protTp']].forEach(function (pair) {
            var el = dqs(pair[0], n);
            if (!el || el._wired) return;
            el._wired = true;
            el.addEventListener('input', function () { s[pair[1]] = el.value; saveSoon(); });
        });
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
        var fe = dqs('Fee', n);
        if (fe && !fe._wired) {
            fe._wired = true;
            fe.addEventListener('change', function () {
                var v = parseFloat(fe.value);
                if (!isFinite(v) || v < 0) v = FEE_DEF;
                v = Math.min(5, v);
                try { localStorage.setItem(FEE_KEY, String(v)); } catch (e) {}
                fe.value = v;
                // ставка общая на терминал — пересчитываем прикидку во всех тикетах
                liveSlots().forEach(repaintTicketBits);
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
        // одна бумага приходит НЕСКОЛЬКИМИ инструментами (разные режимы торгов
        // и классы у брокера, у ОФЗ — особенно): после ранжирования оставляем
        // лучший на ISIN (владелец 2026-07-23 — «несколько ОФЗ 26233 в выдаче»)
        var seen = {};
        return list.slice().map(function (i, n) { return { i: i, n: n, s: score(i) }; })
            .sort(function (a, b) { return b.s - a.s || a.n - b.n; })
            .map(function (x) { return x.i; })
            .filter(function (i) {
                var key = String(i.isin || (i.ticker + '|' + kind(i))).toUpperCase();
                if (seen[key]) return false;
                seen[key] = 1;
                return true;
            });
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
    // force=true — «открой», а не «переключи»: из полосы полноэкранного режима
    // повторное нажатие лупы закрывало бы уже открытый поиск
    window.pftSearchToggle = function (n, force) {
        var s = S(n);
        s.searchOpen = force ? true : !s.searchOpen;
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
    window.pftOtab = function (k) {
        T.otab = k;
        // Свёрнутый док вкладку не показывает — нажатие по корешку и означает
        // «покажи её», а не «переключи вслепую то, чего не видно»
        if (!dockOpen()) { dockState = true; try { localStorage.setItem(DOCK_KEY, '1'); } catch (e) {} }
        repaintOrders();
        if (PF.pfdRepackSoon) PF.pfdRepackSoon();
        if (k === 'hist') loadHist(false);   // TTL внутри: повторный вход брокера не дёргает
        if (k === 'pos') pollPortfolio();    // до этого позиции могли и не опрашиваться
    };
    // Включение уведомлений из терминала. Пишем в ТОТ ЖЕ ключ, которым управляет
    // переключатель в личном кабинете (profile_settings_v1.notifyBrowser), —
    // две независимые настройки одного и того же расходились бы.
    window.pftNotifyOn = function () {
        if (!('Notification' in window)) { toast('Этот браузер не поддерживает уведомления', true); return; }
        Notification.requestPermission().then(function (perm) {
            if (perm !== 'granted') {
                toast('Браузер не дал разрешение — включите уведомления для сайта в его настройках', true);
                return;
            }
            var s = {};
            try { s = JSON.parse(localStorage.getItem('profile_settings_v1') || '{}') || {}; } catch (e) {}
            s.notifyBrowser = true;
            try { localStorage.setItem('profile_settings_v1', JSON.stringify(s)); } catch (e) {}
            toast('Уведомления включены — сообщим об исполнении заявки');
            repaintOrders();
        });
    };
    window.pftHistReload = function () { loadHist(true); };
    window.pftJournalFold = function () { T.histJournal = !T.histJournal; repaintOrders(); };
    window.pftPick = function (n, k) {
        var s = S(n);
        var i = s.search[k]; if (!i) return;
        s.uid = i.uid; clearBook(s); s.price = ''; s.searchQ = ''; s.tape = [];
        s.max = null;           // лимиты были посчитаны по ПРЕЖНЕЙ бумаге
        s.searchOpen = false;   // бумага выбрана — поиск сворачивается в лупу
        fetchMeta(i.uid).then(function (m) {
            s.meta = m;
            s.metaStale = false;
            saveSlots();
            repaintSlot(n);
            emitSlotChange(n);
            pollOb(); pollStatus(); pollTape(n); pollPos(); pollMaxLots(n);
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
        maxSoon(n);   // цена сменилась — лимит покупки вместе с ней
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
    // смена стороны/типа меняет и ответ на «сколько можно»: у покупки и продажи
    // лимиты разные, а у лимитной заявки он ещё и зависит от цены
    window.pftSide = function (n, v) { S(n).side = v; saveSlots(); repaintSlot(n); pollMaxLots(n); };
    window.pftKind = function (n, k) { S(n).kind = k; saveSlots(); repaintSlot(n); pollMaxLots(n); };
    window.pftStopKind = function (n, k) { S(n).stopKind = k; saveSlots(); repaintSlot(n); };
    window.pftTif = function (n, k) { S(n).tif = TIF_API.hasOwnProperty(k) ? k : 'gtc'; saveSlots(); repaintSlot(n); };
    window.pftProt = function (n) { var s = S(n); s.prot = !s.prot; saveSlots(); repaintSlot(n); };
    window.pftAgg = function (n, m) {
        var s = S(n);
        s.agg = AGG_MULTS.indexOf(+m) >= 0 ? +m : 1;
        saveSlots(); repaintOb(n);
    };

    // ---- слоты: добавить бумагу / убрать её состояние ----
    // «+» в шапке стакана: заводим следующий свободный слот и показываем ОБА
    // его блока — стакан без тикета торговать не даёт, а тикет без стакана
    // слеп; поодиночке их всё равно можно убрать корзиной.
    window.pftAddSlot = function (quiet) {
        // потолок теперь ЭКРАННЫЙ: упёрлись — предлагаем новый экран, а не тупик
        if (slotNums().length >= MAX_SLOTS_SCREEN) {
            toast('На одном экране больше ' + MAX_SLOTS_SCREEN + ' бумаг терминал не держит — заведите новый экран внизу', true);
            return false;
        }
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
    function genOrderId() {
        return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    }
    // Idempotency-ключ живёт, пока не изменились ПАРАМЕТРЫ попытки. Повис
    // запрос (fetch у брокера без таймаута) → пользователь жмёт ещё раз →
    // та же заявка уходит с ТЕМ ЖЕ ключом, и брокер сам гасит дубль. Новый
    // ключ — только под новые параметры; успех обнуляет (submitOrder).
    function ensureOrderId(s, fp) {
        if (!s.orderId || s.orderFp !== fp) { s.orderId = genOrderId(); s.orderFp = fp; }
    }
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
        // ЗАМЕРШИЕ ЦЕНЫ. Кнопка на этот случай уже заблокирована, но клавиатура,
        // старая разметка и гонка с тактом свежести мимо неё проходят — а цена
        // отсюда идёт в деньги. Гвард дублируется на отправке (см. ниже).
        var stop = submitBlock(s);
        if (stop) { toast(stop + ': отправлять заявку по замершей цене нельзя', true); return; }
        if (velBlock()) return;
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
        var stopLimit = 0;
        if (s.kind === 'stop') {
            if (!(stopPrice > 0)) { toast('Укажите стоп-цену активации', true); return; }
            stopPrice = snap(stopPrice, 'Stop', 'Стоп-цена');
            s.stopPrice = String(stopPrice);
            if (s.stopKind === 'lim') {
                stopLimit = +s.stopLimit || 0;
                if (!(stopLimit > 0)) { toast('Укажите цену заявки, которая выставится по стоп-цене', true); return; }
                stopLimit = snap(stopLimit, 'StopLim', 'Цена заявки');
                s.stopLimit = String(stopLimit);
            }
        }
        // Защита: стоп ниже входа, тейк выше (для покупки; для продажи наоборот).
        // Перепутанные местами цены — самая частая ошибка в брекете, и брокер её
        // не ловит: он примет стоп-лосс выше рынка и тот сработает мгновенно.
        var protSl = 0, protTp = 0;
        if (s.kind !== 'stop' && s.prot) {
            protSl = +s.protSl || 0;
            protTp = +s.protTp || 0;
            if (!(protSl > 0) && !(protTp > 0)) {
                toast('Заполните стоп-лосс или тейк-профит — либо снимите «Защиту позиции»', true); return;
            }
            var entry = s.kind === 'limit' ? price : (estPrice(s) || midPrice(s));
            if (protSl > 0) protSl = snap(protSl, 'ProtSl', 'Стоп-лосс');
            if (protTp > 0) protTp = snap(protTp, 'ProtTp', 'Тейк-профит');
            if (entry > 0) {
                var bad = s.side === 'buy'
                    ? (protSl > 0 && protSl >= entry) || (protTp > 0 && protTp <= entry)
                    : (protSl > 0 && protSl <= entry) || (protTp > 0 && protTp >= entry);
                if (bad) {
                    toast(s.side === 'buy'
                        ? 'Для покупки стоп-лосс должен быть НИЖЕ цены входа, а тейк-профит — выше'
                        : 'Для продажи стоп-лосс должен быть ВЫШЕ цены входа, а тейк-профит — ниже', true);
                    return;
                }
            }
            s.protSl = protSl > 0 ? String(protSl) : '';
            s.protTp = protTp > 0 ? String(protTp) : '';
        }
        var shares = lots * (s.meta.lot || 1);
        // стоп-лимит исполнится по цене заявки, а не по цене активации
        var est = s.kind === 'limit' ? price
            : (s.kind === 'stop' ? (stopLimit > 0 ? stopLimit : stopPrice) : estPrice(s));
        var sum = est * shares;
        ensureOrderId(s, [s.uid, s.side, s.kind, s.stopKind, s.tif, lots, price, stopPrice, stopLimit, protSl, protTp].join('|'));
        var needType = sum >= sumLimit();
        var typed = Math.round(sum);
        var c = conn();
        var accStr = c ? (c.accountName || 'Счёт') + (accTail() ? ' ····' + accTail() : '') + (c.sandbox ? ' · песочница' : '') : '';
        var STOP_NAME = { tp: 'Тейк-профит', lim: 'Стоп-лимит', sl: 'Стоп-лосс' };
        var kindName = s.kind === 'limit' ? 'Лимитная'
            : (s.kind === 'stop' ? (STOP_NAME[s.stopKind] || 'Стоп-лосс') : 'Рыночная');
        var m = openModal({ id: 'btConfirmOv', card: '<div class="bk-card bk-card-pin btr-cf" role="alertdialog" aria-modal="true">' +
            '<div class="bk-title">' + (s.side === 'buy' ? 'Покупка' : 'Продажа') + ' ' + esc(s.meta.ticker) + '</div>' +
            '<div class="bk-kv"><span>Тип</span><b>' + kindName + '</b></div>' +
            (s.kind === 'limit' ? '<div class="bk-kv"><span>Цена</span><b class="bk-mono">' + fmtPx(price, s) + ' ₽</b></div>' : '') +
            // срок действия называем только когда он НЕ «до отмены»: подтверждение
            // должно перечислять то, что пользователь выбрал сам
            (s.kind === 'limit' && s.tif !== 'gtc'
                ? '<div class="bk-kv"><span>Срок</span><b>' + esc((TIF_TABS.filter(function (t) { return t[0] === s.tif; })[0] || ['', ''])[1]) + '</b></div>' : '') +
            (s.kind === 'stop' ? '<div class="bk-kv"><span>Стоп-цена</span><b class="bk-mono">' + fmtPx(stopPrice, s) + ' ₽</b></div>' : '') +
            (s.kind === 'stop' && stopLimit > 0
                ? '<div class="bk-kv"><span>Цена заявки</span><b class="bk-mono">' + fmtPx(stopLimit, s) + ' ₽</b></div>' : '') +
            '<div class="bk-kv"><span>Количество</span><b>' + lots + ' лот = ' + shares.toLocaleString('ru-RU') + ' шт</b></div>' +
            '<div class="bk-kv"><span>' + (s.kind === 'limit' ? 'Сумма' : 'Сумма ≈') + '</span><b class="bk-mono">' + fmtRub(sum) + '</b></div>' +
            (feeOf(sum) > 0
                ? '<div class="bk-kv"><span>Комиссия ≈</span><b class="bk-mono">' + fmtRub(feeOf(sum)) + '</b></div>' : '') +
            (accStr ? '<div class="bk-kv"><span>Счёт</span><b>' + esc(accStr) + '</b></div>' : '') +
            // защиту называем явно: она поставит ЕЩЁ ДВЕ заявки после исполнения
            (protSl > 0 || protTp > 0
                ? '<div class="bk-kv"><span>Защита</span><b class="bk-mono">' +
                    (protSl > 0 ? 'стоп ' + fmtPx(protSl, s) : '') +
                    (protSl > 0 && protTp > 0 ? ' · ' : '') +
                    (protTp > 0 ? 'тейк ' + fmtPx(protTp, s) : '') + '</b></div>' : '') +
            warnsHtml(s) +
            (needType
                ? '<div class="ph-field"><label class="ph-lab" for="btCfSum">Крупная заявка — введите сумму цифрами (' + typed.toLocaleString('ru-RU') + ')</label>' +
                  '<input class="ph-input" id="btCfSum" type="text" inputmode="numeric" autocomplete="off" placeholder="' + typed.toLocaleString('ru-RU') + '"></div>'
                : '') +
            '<div class="bk-foot"><button type="button" class="bk-btn" id="btCfNo">Отмена</button>' +
            '<button type="button" class="bk-btn bk-btn-pri" id="btCfYes">Подтвердить</button></div></div>' });
        var ov = m.el, closeCf = m.close;
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
            // ГЛАВНАЯ ПРОВЕРКА свежести. Диалог читают неспешно — сумму сверяют,
            // детали перечитывают, — и связь умирает именно здесь, между показом
            // цифр и нажатием «Отправить». Цифры в диалоге к этому моменту уже
            // ложь: пересчитать их молча нельзя, поэтому закрываем и объясняем.
            var late = submitBlock(s);
            if (late) {
                closeCf();
                toast(late + ': проверьте цену заново, заявка не отправлена', true);
                return;
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
        // облигации: сцена живёт в рублях, брокер ждёт проценты от номинала —
        // обратная конверсия ровно на этой границе (см. bondKOf)
        var bk = bondK(s);
        var method, body;
        if (isStop) {
            // у стоп-заявок нет клиентского idempotency-ключа в API —
            // страхуют busy-флаг и velocity-лимит
            var lim = s.stopKind === 'lim';
            method = 'PostStopOrder';
            body = {
                accountId: c.accountId,
                instrumentId: s.uid,
                quantity: String(lots),
                direction: s.side === 'buy' ? 'STOP_ORDER_DIRECTION_BUY' : 'STOP_ORDER_DIRECTION_SELL',
                stopPrice: A().n2q(price / bk),
                stopOrderType: lim ? 'STOP_ORDER_TYPE_STOP_LIMIT'
                    : (s.stopKind === 'tp' ? 'STOP_ORDER_TYPE_TAKE_PROFIT' : 'STOP_ORDER_TYPE_STOP_LOSS'),
                expirationType: 'STOP_ORDER_EXPIRATION_TYPE_GOOD_TILL_CANCEL'
            };
            // у стоп-лимита price — цена ВЫСТАВЛЯЕМОЙ заявки, а не активации
            if (lim) body.price = A().n2q((+s.stopLimit || 0) / bk);
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
            if (s.kind === 'limit') {
                body.price = A().n2q(price / bk);
                // 'gtc' — поле не передаём вовсе: это прежнее поведение брокера
                // по умолчанию, и молча менять его на явное значение не нужно
                var tif = TIF_API[s.tif];
                if (tif) body.timeInForce = tif;
            }
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
        // защиту заказываем ДО ответа брокера, но по ключу этой попытки: сработает
        // она только когда заявка реально исполнится (resolveFate → armProtection)
        if (!isStop && s.prot && (+s.protSl > 0 || +s.protTp > 0) && s.orderId) {
            pendingProt[s.orderId] = {
                uid: s.uid, side: s.side, sl: +s.protSl || 0, tp: +s.protTp || 0
            };
        }
        req.then(function () {
            s.busy = false;
            T.sent.push(Date.now());
            // тейк/стоп уехали снимком в pendingProt — черновик тикета чистим
            // под следующую заявку (владелец 2026-07-23); на графике уровень
            // живёт дальше: «ждёт исполнения» → биржевая стоп-заявка
            if (!isStop && s.prot) {
                s.prot = false; s.protTp = ''; s.protSl = '';
                saveSlots();
                if (sceneLive()) {
                    scnKProt();
                    // repaintSlot не трогает строку защиты сцены — точечно
                    var pf = dq('btScnProt');
                    if (pf) pf.innerHTML = '<em>Защита позиции</em>' + scnProtInner(n);
                }
            }
            s.orderId = null;   // исполненный ключ не переиспользуем
            var kindTxt = isStop ? (s.stopKind === 'tp' ? 'тейк-профит от ' : 'стоп-лосс от ') + fmtPx(price, s) + ' ₽'
                : (s.kind === 'limit' ? fmtPx(price, s) + ' ₽' : 'рыночная');
            A().logEvent('order_submit', (s.side === 'buy' ? 'покупка ' : 'продажа ') + s.meta.ticker +
                ' · ' + lots + ' лот · ' + kindTxt);
            toast((isStop ? 'Стоп-заявка' : 'Заявка') + ' выставлена: ' + s.meta.ticker);
            // выставленная заявка блокирует деньги/бумаги — «доступно» изменилось
            pollOrders(); pollPos(); pollMaxLots(n);
            repaintSlot(n);
        }, function (e) {
            s.busy = false;
            // s.orderId сохраняем: повтор той же попытки не продублирует заявку
            A().logEvent('order_error', s.meta.ticker + ' · ' + (e.message || '').slice(0, 120));
            // на сцене отказ брокера говорит словами человека (экран 11);
            // старым карточкам терминала остаётся прежний тост
            if (sceneLive()) scnOrderFail(e);
            else toast(e.message || 'Заявка не прошла', true);
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
    // ---------- перенос цены заявки (ReplaceOrder) ----------
    // Зачем отдельный метод, а не «снять и выставить заново»: заявка теряет
    // очередь по своей цене, а на два действия уходит два слота velocity-лимита.
    // Предохранители те же, что у отправки: своя модалка с полными деталями,
    // fat-finger на новую цену, снап к шагу инструмента, idempotency-ключ.
    // Осознанно НЕ сделано перетаскивание метки в стакане: случайный драг по
    // живой заявке двигал бы реальные деньги без подтверждения.
    // presetPx (владелец 2026-07-23) — цена, принесённая драгом линии на
    // графике: диалог открывается с ней вместо текущей, деньги двигает кнопка
    window.pftMove = function (orderId, presetPx) {
        var c = conn(); if (!c) return;
        if (!tradeReady()) { toast('Торговля сейчас недоступна', true); return; }
        var o = null;
        T.orders.forEach(function (x) { if (x.orderId === orderId) o = x; });
        if (!o) { toast('Заявка уже исполнена или снята', true); return; }
        var ms = metaSlot(o.instrumentUid);
        var inc = (ms.meta && ms.meta.minInc) || 0.01;
        var cur = ordPx(o, ms);
        var left = Math.max(0, (+o.lotsRequested || 0) - (+o.lotsExecuted || 0));
        var buy = o.direction === 'ORDER_DIRECTION_BUY';
        var tk = (instrMem[o.instrumentUid] || {}).ticker || '';
        var m = openModal({ id: 'btConfirmOv', card: '<div class="bk-card bk-card-pin btr-cf" role="alertdialog" aria-modal="true">' +
            '<div class="bk-title">Перенести цену · ' + esc(tk) + '</div>' +
            '<div class="bk-kv"><span>Заявка</span><b>' + (buy ? 'покупка' : 'продажа') + ' ' + left + ' лот</b></div>' +
            '<div class="bk-kv"><span>Сейчас</span><b class="bk-mono">' + fmtPx(cur, ms) + ' ₽</b></div>' +
            '<div class="ph-field"><label class="ph-lab" for="btMvPx">Новая цена · шаг ' + fmtPx(inc, ms) + '</label>' +
            '<input class="ph-input" id="btMvPx" type="number" step="' + inc + '" min="0" value="' +
                esc(String(presetPx > 0 ? presetPx : cur)) + '"></div>' +
            '<div class="btr-warns" id="btMvWarn"></div>' +
            '<div class="bk-foot"><button type="button" class="bk-btn" id="btCfNo">Отмена</button>' +
            '<button type="button" class="bk-btn bk-btn-pri" id="btCfYes">Перенести</button></div></div>' });
        var ov = m.el, closeCf = m.close;
        ov.querySelector('#btCfNo').addEventListener('click', closeCf);
        var inp = dq('btMvPx');
        // тот же fat-finger, что в тикете: 5% от середины стакана по этой бумаге
        var slot = 0;
        // бумага заявки может стоять на ДРУГОМ экране — ищем по всем слотам:
        // проверка «цена дальше 5% от рынка» не должна молчать из-за этого
        slotNumsAll().forEach(function (k) { if (S(k).uid === o.instrumentUid) slot = k; });
        function recheck() {
            var w = dq('btMvWarn'); if (!w) return;
            var v = +inp.value || 0;
            var mid = slot ? midPrice(S(slot)) : 0;
            w.innerHTML = (mid > 0 && v > 0 && Math.abs(v - mid) / mid > FF_DEV)
                ? '<div class="btr-warn">Цена дальше 5% от рынка (' + fmtPx(mid, ms) + ' сейчас) — проверьте, нет ли опечатки.</div>' : '';
        }
        inp.addEventListener('input', recheck);
        recheck();
        setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
        ov.querySelector('#btCfYes').addEventListener('click', function () {
            var v = +inp.value || 0;
            if (!(v > 0)) { toast('Укажите новую цену', true); return; }
            var snapped = +(Math.round(v / inc) * inc).toFixed(6);
            if (Math.abs(snapped - v) > 1e-9) toast('Цена округлена до шага ' + fmtPx(inc, ms));
            if (Math.abs(snapped - cur) < 1e-9) { toast('Цена та же — переносить нечего', true); return; }
            if (velBlock()) return;
            closeCf();
            // облигации: цена в ₽ на сцене → брокеру в процентах (POINT)
            var bk = bondKOf(instrMem[o.instrumentUid] || (ms && ms.meta));
            A().call('ReplaceOrder', {
                accountId: c.accountId,
                orderId: orderId,
                idempotencyKey: genOrderId(),
                quantity: String(left),
                price: A().n2q(snapped / bk),
                priceType: bk !== 1 ? 'PRICE_TYPE_POINT' : 'PRICE_TYPE_CURRENCY'
            }).then(function () {
                T.sent.push(Date.now());
                A().logEvent('order_replace', tk + ' · цена ' + fmtPx(cur, ms) + ' → ' + fmtPx(snapped, ms));
                toast('Заявка перенесена на ' + fmtPx(snapped, ms) + ' ₽');
                // старый orderId исчез, новый ещё не в списке: чтобы traceOrders
                // не принял подмену за исполнение, пересобираем снимок заявок
                seenOrders = null;
                pollOrders(); pollMaxLots();
            }, function (e) {
                A().logEvent('order_error', tk + ' · перенос: ' + (e.message || '').slice(0, 120));
                toast(e.message || 'Перенести заявку не удалось', true);
            });
        });
    };

    // ---------- перенос стоп-заявки (владелец 2026-07-23) ----------
    // ReplaceOrder для стопов у брокера нет — переносим парой «снять + выставить
    // заново» (очередь стоп не держит, терять нечего). Диалог тот же, что у
    // лимиток: детали, поле цены, снап к шагу; открывает его драг линии на
    // графике. Если стоп — нога пары BRACKETS, id в паре обновляется, иначе
    // reconcileBrackets принял бы перенос за сработавшую защиту и снял бы парную
    window.pftMoveStop = function (stopOrderId, presetPx) {
        var c = conn(); if (!c) return;
        if (!tradeReady()) { toast('Торговля сейчас недоступна', true); return; }
        var o = null;
        T.stops.forEach(function (x) { if (x.stopOrderId === stopOrderId) o = x; });
        if (!o) { toast('Стоп-заявка уже сработала или снята', true); return; }
        var ms = metaSlot(o.instrumentUid);
        var inc = (ms.meta && ms.meta.minInc) || 0.01;
        var bk = bondKUid(o.instrumentUid);   // облигации: % ⇄ ₽
        var cur = A().q2n(o.stopPrice) * bk;
        var lots = +o.lotsRequested || 0;
        var buy = o.direction === 'STOP_ORDER_DIRECTION_BUY';
        var tp = o.stopOrderType === 'STOP_ORDER_TYPE_TAKE_PROFIT';
        var lim = o.stopOrderType === 'STOP_ORDER_TYPE_STOP_LIMIT';
        var tk = (instrMem[o.instrumentUid] || {}).ticker || '';
        var m = openModal({ id: 'btConfirmOv', card: '<div class="bk-card bk-card-pin btr-cf" role="alertdialog" aria-modal="true">' +
            '<div class="bk-title">Перенести ' + (tp ? 'тейк' : 'стоп') + ' · ' + esc(tk) + '</div>' +
            '<div class="bk-kv"><span>Заявка</span><b>' + (buy ? 'покупка' : 'продажа') + ' ' + lots + ' ' +
                PF.plural(lots, 'лот', 'лота', 'лотов') + '</b></div>' +
            '<div class="bk-kv"><span>Сейчас</span><b class="bk-mono">' + fmtPx(cur, ms) + ' ₽</b></div>' +
            '<div class="ph-field"><label class="ph-lab" for="btMvSPx">Новая цена · шаг ' + fmtPx(inc, ms) + '</label>' +
            '<input class="ph-input" id="btMvSPx" type="number" step="' + inc + '" min="0" value="' +
                esc(String(presetPx > 0 ? presetPx : cur)) + '"></div>' +
            '<div class="btr-warns"><div class="btr-note">Стоп пересоздаётся: снимем и сразу выставим на новой цене.</div></div>' +
            '<div class="bk-foot"><button type="button" class="bk-btn" id="btCfNo">Отмена</button>' +
            '<button type="button" class="bk-btn bk-btn-pri" id="btCfYes">Перенести</button></div></div>' });
        var ov = m.el, closeCf = m.close;
        ov.querySelector('#btCfNo').addEventListener('click', closeCf);
        var inp = dq('btMvSPx');
        setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 30);
        ov.querySelector('#btCfYes').addEventListener('click', function () {
            var v = +inp.value || 0;
            if (!(v > 0)) { toast('Укажите новую цену', true); return; }
            var snapped = +(Math.round(v / inc) * inc).toFixed(6);
            if (Math.abs(snapped - cur) < 1e-9) { toast('Цена та же — переносить нечего', true); return; }
            if (velBlock()) return;
            closeCf();
            var body = {
                accountId: c.accountId, instrumentId: o.instrumentUid,
                quantity: String(lots), direction: o.direction,
                stopPrice: A().n2q(snapped / bk), stopOrderType: o.stopOrderType,
                expirationType: 'STOP_ORDER_EXPIRATION_TYPE_GOOD_TILL_CANCEL'
            };
            // у стоп-лимита цена заявки сдвигается на ту же величину, что и активация
            if (lim) body.price = A().n2q((A().q2n(o.price) * bk + (snapped - cur)) / bk);
            A().call('CancelStopOrder', { accountId: c.accountId, stopOrderId: stopOrderId }).then(function () {
                return A().call('PostStopOrder', body).then(function (r) {
                    T.sent.push(Date.now());
                    var nid = String((r && r.stopOrderId) || '');
                    // нога пары BRACKETS — обновляем id, чтобы пара пережила перенос
                    BRACKETS.forEach(function (b) {
                        if (b.slId === stopOrderId) b.slId = nid;
                        if (b.tpId === stopOrderId) b.tpId = nid;
                    });
                    saveBrackets();
                    A().logEvent('order_replace', tk + ' · ' + (tp ? 'тейк' : 'стоп') + ' ' +
                        fmtPx(cur, ms) + ' → ' + fmtPx(snapped, ms));
                    toast((tp ? 'Тейк' : 'Стоп') + ' перенесён на ' + fmtPx(snapped, ms) + ' ₽');
                    pollOrders();
                }, function (e) {
                    // снятый, но не выставленный стоп — позиция БЕЗ защиты: кричим
                    A().logEvent('order_error', tk + ' · перенос стопа: ' + (e.message || '').slice(0, 120));
                    toast('Стоп снят, но выставить на новой цене не удалось — позиция без защиты! ' +
                        'Поставьте заново из тикета. ' + (e.message || ''), true);
                    pollOrders();
                });
            }, function (e) {
                A().logEvent('order_error', tk + ' · перенос стопа: ' + (e.message || '').slice(0, 120));
                toast(e.message || 'Снять стоп-заявку не удалось — перенос отменён', true);
            });
        });
    };

    window.pftCancelAll = function () {
        var c = conn(); if (!c) return;
        var total = T.orders.length + T.stops.length;
        if (!total) return;
        PF.pfConfirm({ danger: true, title: 'Отменить все заявки?',
            text: 'Будут сняты все активные заявки (' + T.orders.length + ') и стоп-заявки (' + T.stops.length + ').', ok: 'Отменить все' }, function () {
            var chain = Promise.resolve(), ok = 0, failed = [];
            // «снято N из M» не говорит, ЧТО осталось висеть — а висящая заявка
            // это заблокированные деньги/бумаги; называем несниёмные поимённо
            function tkOf(o) {
                var m = instrMem[o.instrumentUid];
                return (m && m.ticker) || 'заявка ' + String(o.orderId || o.stopOrderId || '?').slice(0, 6) + '…';
            }
            T.orders.forEach(function (o) {
                chain = chain.then(function () {
                    return A().call('CancelOrder', { accountId: c.accountId, orderId: o.orderId })
                        .then(function () { ok++; }, function () { failed.push(tkOf(o)); });
                });
            });
            T.stops.forEach(function (o) {
                chain = chain.then(function () {
                    return A().call('CancelStopOrder', { accountId: c.accountId, stopOrderId: o.stopOrderId })
                        .then(function () { ok++; }, function () { failed.push(tkOf(o)); });
                });
            });
            chain.then(function () {
                A().logEvent('order_cancel', 'паник-отмена: снято ' + ok + ' из ' + total +
                    (failed.length ? ', не снялись: ' + failed.join(', ') : ''));
                if (failed.length) {
                    toast('Снято ' + ok + ' из ' + total + '. Не снялись: ' + failed.join(', ') +
                        ' — попробуйте снять их по одной', true);
                } else {
                    toast('Снято заявок: ' + ok);
                }
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

    // ---------- мост «Ребаланс» → терминал ----------
    // Движок ребаланса уже посчитал, ЧТО и СКОЛЬКО менять, — но исполнять это
    // приходилось руками, набирая тикеры в поиске заново. Здесь план заряжается
    // в слоты терминала: продажа в один, покупка в другой.
    // Тикет только ЗАПОЛНЯЕТСЯ. Ни одна заявка отсюда не уходит — подтверждение
    // остаётся отдельным осознанным действием пользователя.
    // Тикер → инструмент брокера: у ребаланса на руках только тикер, а слоту
    // нужен uid с паспортом. Берём лучшее совпадение тем же ранжированием,
    // что и поиск, и только среди доступных к торговле.
    function findByTicker(ticker) {
        return A().call('FindInstrument', { query: ticker }).then(function (d) {
            var list = rankInstruments(d.instruments || [], ticker).filter(function (i) {
                return i.uid && i.apiTradeAvailableFlag !== false;
            });
            var exact = list.filter(function (i) {
                return String(i.ticker || '').toUpperCase() === String(ticker || '').toUpperCase();
            });
            return (exact[0] || list[0]) || null;
        });
    }
    // куда класть ногу плана: слот с этой бумагой → свободный → следующий по счёту
    function slotForPlan(uid, used) {
        var nums = slotNums();
        for (var i = 0; i < nums.length; i++) {
            if (S(nums[i]).uid === uid && used.indexOf(nums[i]) < 0) return nums[i];
        }
        for (var j = 0; j < nums.length; j++) {
            if (!S(nums[j]).uid && used.indexOf(nums[j]) < 0) return nums[j];
        }
        var free = nextFreeSlot();
        if (free && PF.pfdAddTradeSlot) { PF.pfdAddTradeSlot(free, true); return free; }
        for (var k = 0; k < nums.length; k++) if (used.indexOf(nums[k]) < 0) return nums[k];
        return nums[0] || 1;
    }
    // legs: [{ticker, side:'buy'|'sell', qty (в ШТУКАХ)}]
    PF.pftLoadPlan = function (legs) {
        if (!tradeReady()) {
            toast('Подключите брокера в режиме «Торговля» — тогда план можно будет исполнить', true);
            return;
        }
        legs = (legs || []).filter(function (l) { return l && l.ticker; }).slice(0, MAX_SLOTS_SCREEN);
        if (!legs.length) return;
        var used = [];
        // одна бумага — не «план»: приходим сюда и из строки «Рынок · Акции»,
        // где слово «план» ничего не значит (см. pftBuyTicker)
        var solo = legs.length === 1 ? String(legs[0].ticker).toUpperCase() : '';
        toast(solo ? 'Ищем ' + solo + ' у брокера…' : 'Ищем бумаги плана у брокера…');
        Promise.all(legs.map(function (l) {
            return findByTicker(l.ticker).then(function (i) { return { leg: l, ins: i }; },
                function () { return { leg: l, ins: null }; });
        })).then(function (res) {
            var ok = 0, miss = [];
            var chain = Promise.resolve();
            res.forEach(function (r) {
                if (!r.ins) { miss.push(r.leg.ticker); return; }
                chain = chain.then(function () {
                    var n = slotForPlan(r.ins.uid, used);
                    used.push(n);
                    return fetchMeta(r.ins.uid).then(function (m) {
                        var s = S(n);
                        s.uid = r.ins.uid; s.meta = m; clearBook(s);
                        s.price = ''; s.tape = []; s.max = null; s.searchOpen = false; s.metaStale = false;
                        s.side = r.leg.side === 'sell' ? 'sell' : 'buy';
                        // план считает в ШТУКАХ, тикет — в ЛОТАХ
                        var lot = (m && m.lot) || 1;
                        s.lots = Math.max(1, Math.floor((+r.leg.qty || 0) / lot));
                        s.kind = 'limit';
                        ok++;
                        saveSlots(); emitSlotChange(n);
                    }, function () { miss.push(r.leg.ticker); });
                });
            });
            return chain.then(function () {
                // В терминал уводим, ТОЛЬКО если там что-то появилось. Из «Рынка»
                // это прыжок через весь сайт: утащить человека от таблицы в пустой
                // терминал из-за бумаги, которой у брокера нет, — обмен плохой.
                if (ok) {
                    // Зовут и с ДРУГОЙ вкладки сайта («Рынок · Акции»), поэтому
                    // сперва вкладка, потом подвкладка. Гвард обязателен:
                    // switchTab не проверяет, что вкладка уже открыта, и повторный
                    // вызов заново перерисовал бы «Портфели» под своим же вызовом.
                    if (!document.querySelector('#panel-portfolios.active') && window.switchTab) {
                        window.switchTab('portfolios');
                    }
                    if (window.pfxGoTab) window.pfxGoTab('trading');
                    else if (PF.pfdRerender) PF.pfdRerender();
                    setTimeout(function () { pollOb(); pollStatus(); pollMaxLots(); }, 100);
                }
                if (ok && miss.length) toast('Заряжено ' + ok + ' из ' + res.length + '; не нашлись: ' + miss.join(', '), true);
                else if (ok) toast(solo
                    ? solo + ' в терминале: укажите цену и объём — заявка НЕ отправлена'
                    : 'План в терминале: проверьте цену и объём — заявки НЕ отправлены');
                else toast(solo ? solo + ' у брокера не нашлась' : 'Ни одну бумагу плана не удалось найти у брокера', true);
            });
        }).catch(function (e) {
            toast((e && e.message) || 'Не удалось загрузить план в терминал', true);
        });
    };

    // Короткий путь к сделке из «Рынок · Акции» и из «Избранного»: до этого от
    // акции в таблице до тикета было четыре шага (запомнить тикер → «Портфели»
    // → «Торговля» → лупа → набрать → выбрать). Объём НЕ подставляем — сделку
    // назначает человек; тикет открывается с одним лотом и лимитной ценой.
    PF.pftBuyTicker = function (ticker, side) {
        if (!ticker) return;
        PF.pftLoadPlan([{ ticker: String(ticker), side: side === 'sell' ? 'sell' : 'buy', qty: 0 }]);
    };

    // ================= СЦЕНА «ЭВОЛЮЦИЯ» · СОСТОЯНИЕ И ТЕМА (раунд 2) =================
    // Раунд 1 (полноэкранная сетка bt_fs_v1 + отдельный режим «Просто»
    // bt_simple_v1) отвергнут владельцем: два мира вместо одного. Ступени
    // насыщенности (Старт → Разгон → Контроль) тоже прожили недолго: «Старт»
    // дорос до полноценного терминала, остальные владелец 2026-07-23 удалил.
    // Сцена всегда полноэкранная; конструктор .pfd-grid на «Торговле» больше
    // не используется. Гейт CSS остался прежним — body:has(#pftBar), id несёт
    // строка среды (см. envRowHtml ниже).
    var STAGE_KEY = 'bt_stage_v1';
    var stageState = null;   // {stage:'start', layers}; layers — ручные флаги слоёв сцены
    function saveStageRaw(o) { try { localStorage.setItem(STAGE_KEY, JSON.stringify(o)); } catch (e) {} }
    // Ступеней больше нет (владелец 2026-07-23): «Старт» дорос до полноценного
    // терминала, «Разгон» и «Контроль» удалены вместе с переходами. Ключ живёт
    // ради layers; чужой stage из старых сессий молча приводится к start.
    function stageObj() {
        if (stageState) return stageState;
        var o = null;
        try { o = JSON.parse(localStorage.getItem(STAGE_KEY) || 'null'); } catch (e) {}
        if (!o || typeof o !== 'object') o = { stage: 'start', layers: {} };
        if (!o.layers || typeof o.layers !== 'object') o.layers = {};
        if (o.stage !== 'start') { o.stage = 'start'; saveStageRaw(o); }
        try { localStorage.removeItem('bt_simple_v1'); localStorage.removeItem('bt_fs_v1'); } catch (e) {}
        stageState = o;
        return o;
    }
    // ТЕМА СЦЕНЫ — свой ключ, независимый от темы сайта (решение набора):
    // светлая по умолчанию, тёмная — вторая полноценная тема, не инверсия.
    var THEME_KEY = 'bt_theme_v1';
    function sceneNight() {
        try { return localStorage.getItem(THEME_KEY) === 'dark'; } catch (e) { return false; }
    }
    window.pftSceneTheme = function () {
        var night = !sceneNight();
        try { localStorage.setItem(THEME_KEY, night ? 'dark' : 'light'); } catch (e) {}
        var el = dq('btScene'); if (el) el.classList.toggle('night', night);
        var th = document.querySelector('#pftBar .bts-th'); if (th) th.outerHTML = scnThemeHtml();
        // свечи движка перекрашиваются своими стилями — токены сцены, не сайта
        if (K.chart) { try { K.chart.setStyles(scnKStyles()); } catch (e) {} }
        scnKProfile();   // тень профиля объёма — в цвета новой темы
        scnKCmp();       // линии сравнения — перерисовать на новом фоне
    };
    // Раунд 1 умер, но его вопросы задают соседние модули (portfolios-dash,
    // portfolios-chart) — отвечаем «нет»: полноэкранной СЕТКИ больше не бывает
    // (сцена — не сетка), режима «Просто» тоже.
    function fsOn() { return false; }
    function simpleOn() { return false; }
    // сцена на экране: единственный признак, по которому живут пуллеры и тики
    function sceneLive() { return !!document.querySelector('#panel-portfolios.active #btScene'); }
    // Кнопка «Терминал» в шапке «Портфелей» (pfxHeroHtml) зовёт по-прежнему её:
    // теперь это просто переход на «Торговлю» — сцена включена всегда.
    window.pftEnterTerminal = function () {
        if (!tradeReady()) { toast('Подключите брокера в режиме «Торговля»', true); return; }
        if (window.pfxGoTrading) window.pfxGoTrading();
        else if (window.pfxGoTab) window.pfxGoTab('trading');
    };
    // «← Портфели» строки среды: сцена — сама подвкладка, выходить из режима
    // нечего — уходим на «Обзор»
    window.pftSceneBack = function () {
        if (window.pfxGoTab) window.pfxGoTab('overview');
    };

    // Нижний док (блок «Мои заявки») сворачивается шевроном — высвободившееся
    // уходит наверх само, потому что высоты в этом режиме доли, а не пиксели.
    var DOCK_KEY = 'bt_dock_v1';
    var dockState = null;
    function dockOpen() {
        if (dockState === null) {
            try { dockState = localStorage.getItem(DOCK_KEY) !== '0'; } catch (e) { dockState = true; }
        }
        return dockState;
    }
    window.pftDockToggle = function () {
        dockState = !dockOpen();
        try { localStorage.setItem(DOCK_KEY, dockState ? '1' : '0'); } catch (e) {}
        repaintOrders();
        if (PF.pfdRepackSoon) PF.pfdRepackSoon();   // высота блока изменилась — пересобрать сетку
    };

    // ---------- строка среды (52px) ----------
    // Только среда: выход, омнибокс, связь, песочница, тумблер темы, «⋯», аватар.
    // Денег здесь НЕТ (решение набора): «свободно» живёт у поля суммы тикета,
    // «портфель» — итогом полосы позиций. id="pftBar" несёт прежний гейт CSS
    // body:has(#pftBar): шапка сайта и боковая колонка прячутся, пока сцена жива.
    function portValue() {
        var v = 0, any = false;
        (T.port.list || []).forEach(function (p) { v += p.val || 0; any = true; });
        return any ? v : null;
    }
    // Связь — тот же linkState, что гасит кнопку тикета. В отличие от раунда 1
    // зелёное состояние ВИДНО («связь» с точкой): так решено мокапом строки среды.
    function scnLinkHtml() {
        var nums = liveSlots(), worst = null;
        for (var i = 0; i < nums.length; i++) {
            var l = linkState(S(nums[i]));
            if (l.state === 'stale') { worst = l; break; }
            if (l.state === 'wait' && !worst) worst = l;
        }
        if (!worst) return '<span class="bts-link ok" title="Данные приходят"><i></i>связь</span>';
        return '<span class="bts-link ' + worst.state + '" title="' + esc(worst.msg) + '"><i></i>' +
            (worst.state === 'wait' ? 'ждём данные' : 'нет связи · ' + ageTxt(worst.ageMs)) + '</span>';
    }
    // тумблер ☀⇄☾ — видимый, в строке среды: тема сцены не следует за темой сайта
    function scnThemeHtml() {
        var night = sceneNight();
        return '<button type="button" class="bts-th" onclick="pftSceneTheme()" ' +
            'title="Тема сцены — светлая или тёмная" aria-label="Переключить тему сцены">' +
            '<i class="' + (night ? '' : 'on') + '">☀</i><i class="' + (night ? 'on' : '') + '">☾</i></button>';
    }
    function envRowHtml() {
        var c = conn();
        // экраны trading:N — вкладки строки среды (механика и хранилище
        // раунда 1); омнибокс справа (bts-omni-s) — середину держат вкладки
        return '<div class="bts-top" id="pftBar">' +
            '<button type="button" class="bts-back" onclick="pftSceneBack()">' + IC_BACK + '<span>Портфели</span></button>' +
            // звезда — рейка избранного (раунд 3); та же клавиша F
            '<button type="button" class="bts-wlb' + (wlOn() ? ' on' : '') + '" onclick="pftScWl()" ' +
                'title="Полоса избранного — клавиша F" aria-label="Полоса избранного" ' +
                'aria-pressed="' + wlOn() + '">★</button>' +
            '<span class="sc-tabs" id="btScnScr">' + scnScreensHtml() + '</span>' +
            // омнибокс ⌘K (этап 6) пока открывает готовый поиск бумаг раунда 1
            '<button type="button" class="bts-omni bts-omni-s" onclick="pftFsSearch()" title="Найти бумагу">' + IC_LENS +
                '<span>Бумага или команда</span><kbd>⌘K</kbd></button>' +
            '<span class="bts-right">' +
                scnLinkHtml() +
                (RP ? '<span class="bts-sand rp">Реплей · ' + esc(RP.label) + '</span>'
                    : (c && c.sandbox ? '<span class="bts-sand">Песочница</span>' : '')) +
                scnThemeHtml() +
                '<button type="button" class="bts-dots" onclick="pftFsMenu(event)" ' +
                    'aria-label="Меню сцены" aria-haspopup="true">' + IC_DOTS3 + '</button>' +
                '<button type="button" class="bts-av" onclick="pftFsProfile()" ' +
                    'aria-label="Личный кабинет" title="Личный кабинет">' + fsAvaHtml() + '</button>' +
            '</span>' +
        '</div>';
    }
    // меню «⋯» — словами, не рядом безымянных иконок (решение живёт с раунда 1)
    var fsMenuOpen = false;
    function fsMenuHtml() {
        var hid = !!(window.sumsPrivacy && window.sumsPrivacy.isOn && window.sumsPrivacy.isOn());
        function item(fn, ic, label, key, on) {
            return '<button type="button" class="bts-mi' + (on ? ' on' : '') + '" onclick="' + fn + '">' +
                ic + '<span>' + label + '</span>' + (key ? '<i>' + key + '</i>' : '') + '</button>';
        }
        return '<div class="bts-menu" id="pftbMenu">' +
            item('pftFsSums()', IC_EYE, 'Скрывать суммы', '', hid) +
            item('pftFsKeys()', IC_KEYS, 'Клавиши терминала', '?') +
            item('pftScScreenRenCur()', IC_PEN, 'Переименовать экран', '') +
            '<div class="bts-msep"></div>' +
            item('pftSceneBack()', IC_OUT, 'В «Портфели»', '') +
        '</div>';
    }
    function fsMenuClose() {
        if (!fsMenuOpen) return;
        fsMenuOpen = false;
        var m = dq('pftbMenu'); if (m) m.remove();
        var b = document.querySelector('.bts-dots'); if (b) b.classList.remove('on');
    }
    window.pftFsMenu = function (ev) {
        if (ev) ev.stopPropagation();
        if (fsMenuOpen) { fsMenuClose(); return; }
        fsMenuOpen = true;
        var bar = dq('pftBar'); if (!bar) return;
        bar.insertAdjacentHTML('beforeend', fsMenuHtml());
        var b = bar.querySelector('.bts-dots'); if (b) b.classList.add('on');
        // закрытие по клику мимо — на СЛЕДУЮЩИЙ тик, иначе этот же клик долетит
        // до документа и закроет меню в момент открытия
        setTimeout(function () {
            document.addEventListener('click', function once(e) {
                if (e.target.closest && e.target.closest('#pftbMenu')) return;
                document.removeEventListener('click', once);
                fsMenuClose();
            });
        }, 0);
    };
    window.pftFsSums = function () {
        fsMenuClose();
        if (!window.sumsPrivacy) { toast('Скрытие сумм недоступно', true); return; }
        var next = !window.sumsPrivacy.isOn();
        window.sumsPrivacy.set(next);
        toast(next ? 'Суммы скрыты' : 'Суммы показаны');
    };
    // аватар строки среды берёт личность у profile-menu.js — второй копии профиля нет
    function fsAvaHtml() {
        var id = window.pmIdentity ? window.pmIdentity() : null;
        if (!id || id.guest) return '';
        return esc(id.ini || '') + (id.photo
            ? '<img src="' + PF.attr(id.photo) + '" alt="" onerror="this.remove()">' : '');
    }
    window.pftFsProfile = function () {
        if (window.pmOpenHub) window.pmOpenHub();
        else toast('Личный кабинет недоступен', true);
    };
    var IC_DOTS3 = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    var IC_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></svg>';
    var IC_KEYS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>';
    var IC_OUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 17l5-5-5-5M20 12H9M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/></svg>';
    var IC_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>';
    var IC_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

    // ---------- ОМНИБОКС ⌘K (этап 6, экран 07) ----------
    // Одна строка на всё: поиск бумаги, команды сцены, намерение «сбер 30к».
    // Парсер собирает из фразы черновик сделки — Enter лишь ПОДСТАВЛЯЕТ его в
    // тикет, отправляет всегда человек кнопкой (закон «ни одна клавиша не
    // отправляет заявку» действует и здесь).
    var omni = { open: false, q: '', busy: false, sel: 0, papers: [], intent: null };
    var omniPx = {};   // uid -> последняя цена для intent-карточки (GetLastPrices)
    window.pftFsSearch = function () { omniToggle(); };
    function omniToggle() {
        if (omni.open) { omniClose(); return; }
        if (!sceneLive()) return;
        omni.open = true; omni.q = ''; omni.sel = 0; omni.papers = []; omni.intent = null;
        var host = dq('btScene');
        if (!host) { omni.open = false; return; }
        host.insertAdjacentHTML('beforeend',
            '<div class="veil" id="btOmniVeil"></div>' +
            '<div class="pal" id="btOmni" role="dialog" aria-modal="true" aria-label="Омнибокс">' +
                '<div class="pal-in">⌕<input id="btOmniIn" type="text" autocomplete="off" spellcheck="false" ' +
                    'placeholder="Бумага, команда или «сбер 30к»" aria-label="Поиск и команды">' +
                    '<kbd>esc</kbd></div>' +
                '<div class="pal-body" id="btOmniBody">' + omniBodyHtml() + '</div>' +
                '<div class="pal-foot"><span><kbd>↑↓</kbd>выбрать</span><span><kbd>Enter</kbd>подставить</span>' +
                '<span><kbd>Esc</kbd>закрыть</span>' +
                '<span class="pf-r">отправка — только кнопкой в тикете</span></div>' +
            '</div>');
        var omniEl = dq('btOmni');
        var b = document.querySelector('.bts-omni'); if (b) b.classList.add('on');
        dq('btOmniVeil').addEventListener('click', omniClose);
        var i = dq('btOmniIn');
        i.addEventListener('input', function () { omniInput(i.value); });
        i.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); omniClose(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                var max = omniRows().length - 1;
                if (max < 0) return;
                omni.sel = Math.max(0, Math.min(max, omni.sel + (e.key === 'ArrowDown' ? 1 : -1)));
                omniPaint();
                return;
            }
            if (e.key === 'Enter') { e.preventDefault(); omniGo(omni.sel); }
        });
        try { i.focus(); } catch (e) {}
        // клик по строке — мышь равноправна клавишам
        omniEl.addEventListener('click', function (e) {
            var row = e.target.closest && e.target.closest('[data-omni]');
            if (row) omniGo(+row.getAttribute('data-omni'));
        });
    }
    function omniClose() {
        omni.open = false;
        var v = dq('btOmniVeil'); if (v) v.remove();
        var p = dq('btOmni'); if (p) p.remove();
        var b = document.querySelector('.bts-omni'); if (b) b.classList.remove('on');
        scnFindTarget = 0;
    }
    var omniT = null;
    function omniInput(v) {
        omni.q = v; omni.sel = 0;
        omni.intent = omniParse(v);
        omniPaint();
        clearTimeout(omniT);
        var word = omni.intent ? omni.intent.word : String(v).trim();
        if (word.length < 2) { omni.papers = []; omni.busy = false; omniPaint(); return; }
        omni.busy = true;
        omniT = setTimeout(function () {
            var q = omni.q;
            PF.pftFindInstruments(word).then(function (list) {
                if (omni.q !== q || !omni.open) return;   // ответ на устаревший ввод
                omni.busy = false;
                omni.papers = (list || []).slice(0, 4);
                omniFetchPx();
                omniPaint();
            }, function () {
                if (omni.q !== q) return;
                omni.busy = false; omni.papers = [];
                omniPaint();
            });
        }, 250);
    }
    // цены выдачи — одним GetLastPrices: у FindInstrument цен нет, а intent
    // обещает «≈ 110 акций по 271,45 ₽» и дельту в строках бумаг
    function omniFetchPx() {
        var need = omni.papers.filter(function (p) { return p.uid && omniPx[p.uid] == null; })
            .map(function (p) { return p.uid; });
        if (!need.length) return;
        A().call('GetLastPrices', { instrumentId: need }, { interactive: false }).then(function (d) {
            var q2n = A().q2n;
            ((d && d.lastPrices) || []).forEach(function (lp) {
                var uid = lp.instrumentUid || lp.figi, px = q2n(lp.price);
                if (!uid || !(px > 0)) return;
                // облигация в выдаче: цена в % от номинала — в ₽ по паспорту
                // строки (номинала у выдачи нет — берём дефолт 1000 из bondKOf)
                var p0 = null;
                omni.papers.forEach(function (p) { if (p.uid === uid) p0 = p; });
                if (p0 && /bond/i.test(String(p0.instrumentType || p0.instrumentKind || ''))) {
                    px *= bondKOf({ kind: 'bond', nom: 0 });
                }
                omniPx[uid] = px;
            });
            if (omni.open) omniPaint();
        }).catch(function () {});
    }
    // ---- парсер намерения: [купить|продать] <слово> <сумма>[к|k|тыс] ----
    // Сумма обязательна — без неё это обычный поиск. «30к» → 30 000.
    function omniParse(v) {
        var s = String(v || '').trim().toLowerCase();
        if (!s) return null;
        var m = /^(купить\s+|продать\s+)?(.+?)\s+(?:на\s+)?(\d+(?:[.,]\d+)?)\s*(к|k|тыс\.?)?\s*(?:₽|р|руб\.?|рублей)?$/.exec(s);
        if (!m || !m[2]) return null;
        var rub = parseFloat(m[3].replace(',', '.'));
        if (m[4]) rub *= 1000;
        rub = Math.floor(rub);
        if (!(rub >= 100)) return null;   // «сбер 5» — скорее опечатка, чем сделка
        return { side: (m[1] || '').indexOf('продать') === 0 ? 'sell' : 'buy', word: m[2].trim(), rub: rub };
    }
    // ---- реестр команд сцены: фильтр по вводу, полный список при пустом ----
    function omniCmds() {
        var out = [];
        out.push(candlesOn()
            ? { ic: '◫', t: 'Линия вместо свечей', em: 'холст', go: function () { window.pftScMode(0); } }
            : { ic: '◫', t: 'Свечи вместо линии', em: 'холст', go: function () { window.pftScMode(1); } });
        out.push({ ic: '◐', t: sceneNight() ? 'Светлая сцена' : 'Тёмная сцена',
            em: 'тумблер — и в строке среды', go: function () { window.pftSceneTheme(); } });
        out.push({ ic: '＋', t: 'Новый экран', em: 'свои бумаги и раскладка', go: function () { window.pftScScreenAdd(); } });
        out.push(scnCmpGet().length
            ? { ic: '⊕', t: 'Убрать сравнение', em: 'снять все линии с холста', go: function () { window.pftScCmpOff(); } }
            : { ic: '⊕', t: 'Сравнить с индексом', em: 'IMOEX поверх свечей, до девяти линий',
                go: function () { window.pftScCmpSet('index', 'IMOEX', 'IMOEX'); } });
        out.push({ ic: '★', t: wlOn() ? 'Скрыть полосу избранного' : 'Полоса избранного',
            em: 'клавиша F · бумаги на цифрах 1–9', go: function () { window.pftScWl(); } });
        out.push(RP
            ? { ic: '⏵', t: 'Выйти из реплея', em: 'вернуть живую сцену', go: function () { window.pftScRpExit(); } }
            : { ic: '⏵', t: 'Реплей: неделя из прошлого', em: 'тренажёр — настоящая история, виртуальные деньги',
                go: function () { window.pftScReplay(); } });
        var word = (omni.intent ? '' : String(omni.q).trim().toLowerCase());
        if (!word) return out;
        var hit = out.filter(function (c) { return c.t.toLowerCase().indexOf(word) >= 0; });
        return hit.length ? hit : out;   // не совпало — полный список, как в мокапе
    }
    // плоский список строк: intent → бумаги → команды (индекс = data-omni)
    function omniRows() {
        var rows = [];
        if (omni.intent) rows.push({ kind: 'intent' });
        omni.papers.forEach(function (p) { rows.push({ kind: 'paper', p: p }); });
        omniCmds().forEach(function (c) { rows.push({ kind: 'cmd', c: c }); });
        return rows;
    }
    function omniBodyHtml() {
        var rows = omniRows();
        var html = '', idx = 0, sect = '';
        if (!rows.length) {
            return '<div class="pal-note">' + (omni.busy ? 'Ищем…' :
                'Начните вводить название, тикер или «сбер 30к».') + '</div>';
        }
        rows.forEach(function (r) {
            var on = idx === omni.sel;
            if (r.kind === 'intent') {
                var it = omni.intent;
                var tk = omni.papers[0];
                var px = tk && omniPx[tk.uid];
                var sub;
                if (tk && px > 0) {
                    var lot = Math.max(1, Math.floor(+tk.lot || 1));
                    var qty = Math.floor(it.rub / (px * (1 + feePct() / 100) * lot)) * lot;
                    sub = qty > 0
                        ? '≈ ' + qty.toLocaleString('ru-RU') + ' ' + PF.plural(qty, 'акция', 'акции', 'акций') +
                          ' по ' + fmtPx(px, { meta: tk }) + ' ₽ · комиссия включена'
                        : 'меньше одного лота — тикет подскажет минимум';
                } else sub = tk ? 'считаем цену…' : (omni.busy ? 'ищем бумагу…' : 'бумага не нашлась — уточните');
                html += '<div class="intent' + (on ? ' on' : '') + '" data-omni="' + idx + '"><span class="iic">₽</span><div>' +
                    '<h5>' + (it.side === 'sell' ? 'Продать' : 'Купить') + ' ' +
                        esc(tk ? tk.ticker : it.word.toUpperCase()) + ' на ' + it.rub.toLocaleString('ru-RU') + ' ₽</h5>' +
                    '<p>' + sub + '</p></div><kbd>Enter — в тикет</kbd></div>';
                idx++;
                return;
            }
            if (r.kind === 'paper') {
                if (sect !== 'p') { sect = 'p'; html += '<div class="pal-sec">Бумаги</div>'; }
                var p = r.p, ppx = omniPx[p.uid];
                html += '<div class="pal-row' + (on ? ' on' : '') + '" data-omni="' + idx + '">' +
                    '<span class="pm" style="background:' + scnHue(p.ticker) + '">' +
                        esc(String(p.ticker).slice(0, 2).toUpperCase()) + '</span>' +
                    '<span><b>' + esc(p.name || p.ticker) + '</b> <em>' + esc(p.ticker) + '</em></span>' +
                    (ppx > 0 ? '<span class="pr">' + fmtPx(ppx, { meta: p }) + '</span>' : '') +
                '</div>';
                idx++;
                return;
            }
            if (sect !== 'c') { sect = 'c'; html += '<div class="pal-sec">Команды сцены</div>'; }
            html += '<div class="pal-row' + (on ? ' on' : '') + '" data-omni="' + idx + '">' +
                '<span class="cic">' + r.c.ic + '</span>' +
                '<span><b>' + esc(r.c.t) + '</b>' + (r.c.em ? ' <em>' + esc(r.c.em) + '</em>' : '') + '</span></div>';
            idx++;
        });
        return html;
    }
    function omniPaint() {
        var el = dq('btOmniBody');
        if (el) el.innerHTML = omniBodyHtml();
    }
    // действие строки. Intent и бумага ЗАПОЛНЯЮТ тикет — не отправляют.
    function omniGo(i) {
        var rows = omniRows();
        var r = rows[i];
        if (!r) return;
        if (r.kind === 'cmd') { omniClose(); r.c.go(); return; }
        var target = scnFindTarget || sxSlot();
        if (r.kind === 'intent') {
            var it = omni.intent, tk = omni.papers[0];
            if (!tk || !tk.uid) { toast('Бумага ещё ищется — секунду', true); return; }
            omniClose();
            loadInstrument(target, tk.uid, function (s) {
                s.side = it.side;
                // черновик намерения — РЫНОЧНЫЙ: лимитка, оставшаяся в слоте с
                // прошлой сессии, молча пересчитала бы «30к» по чужой цене
                s.kind = 'market'; s.price = '';
                simpleSum = String(it.rub);
                scnUnit = 'rub'; scnLim = 0; scnActive = target;
                saveSlots();
                if (PF.renderNoAnim) PF.renderNoAnim();
            });
            return;
        }
        // бумага: в сцену (слот-цель «＋» вкладок уважаем)
        omniClose();
        simpleSum = ''; scnUnit = ''; scnLim = 0;
        loadInstrument(target, r.p.uid, function () {
            scnActive = target;
            if (PF.renderNoAnim) PF.renderNoAnim();
        });
    }
    // ⌘K / Ctrl+K — из любого места сцены; слушатель один, на документ
    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK' && sceneLive()) {
            e.preventDefault();
            omniToggle();
        }
    });

    // живые куски строки среды и тикета — в такт данным (freshTick, pollOb)
    function fsRepaintBits() {
        if (!sceneLive()) return;
        var st = document.querySelector('#pftBar .bts-link');
        if (st) st.outerHTML = scnLinkHtml();
        scnSet('btScnFresh', scnFreshInner());
        scnTicketBits();
    }

    // ================= РЕЖИМ «ПРОСТО» =================
    // Новичок считает не в лотах, а в рублях: «вложу 30 000». Интерфейс сам
    // переводит это в бумаги и честно объясняет, почему не ровно.
    //
    // ГЛАВНОЕ ПРАВИЛО СЧЁТА: количество делится на ПОЛНУЮ цену покупки —
    // цена + НКД + комиссия. Считать по одной цене — самая частая ловушка:
    // в «вложу 30 000 ₽» влезет 48 облигаций, а спишется 30 830 ₽. Человек
    // воспримет это как обман, а заявка может и вовсе не пройти по деньгам.
    // Из этого же правила само собой получается «Всё»: если делитель включает
    // комиссию, сумма никогда не вылезает за свободные деньги.
    var simpleSum = '';   // что человек ввёл (рубли при покупке, штуки при продаже)
    // ДЕНЬГИ ЗДЕСЬ — С КОПЕЙКАМИ. Общий fmtRub округляет до рубля, и в терминале
    // это правильно: там смотрят на порядок. Но «Просто» обещает «спишется
    // ровно столько» — а кнопка «Купить на 29 974 ₽» при списании 29 973,78
    // это обещание не держит. Ради одного этого экрана берём копейки.
    function fmtKop(n) {
        if (n == null || !isFinite(n)) return '—';
        var neg = n < 0;
        return (neg ? '−' : '') + Math.abs(n).toLocaleString('ru-RU',
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
    }
    function aciOf(s) { return (s.meta && +s.meta.aci) || 0; }   // НКД за штуку, 0 у акций
    // ЦЕНА ДЛЯ «ПРОСТО» — всегда РЫНОЧНАЯ, а не estPrice. estPrice у лимитной
    // заявки отдаёт цену, введённую в терминале: если человек оставил там свою
    // лимитку и переключился в «Просто», расчёт шёл бы по чужому старому числу.
    // Берём последнюю цену — ту же, что крупно стоит в шапке карточки, чтобы в
    // разбивке и в заголовке было ОДНО число (спред покрыт предупреждением
    // «цена может немного отличаться»).
    function sxPrice(s) {
        // реплей: цена сцены — цена плёнки, не живого стакана
        if (RP && s && s.uid === RP.uid) return rpPx();
        if (s.ob) {
            var last = A().q2n(s.ob.lastPrice) || 0;
            if (last > 0) return last;
        }
        return midPrice(s) || 0;
    }
    function isBond(s) { return !!(s.meta && /bond/i.test(String(s.meta.kind || ''))); }
    // словоформы бумаги для тикета: облигации перестали быть «акциями»
    function unitWord(s, qty) {
        return isBond(s) ? PF.plural(qty, 'облигация', 'облигации', 'облигаций')
            : PF.plural(qty, 'акция', 'акции', 'акций');
    }
    // Покупка: сколько бумаг влезает в сумму. Возвращает всё, что нужно разбивке.
    function simpleBuyCalc(s, rub, pxOver) {
        // pxOver — цена исполнения от сцены (аск при широком спреде, лимитка);
        // без неё — прежнее поведение: последняя цена, одно число с шапкой
        var px = pxOver > 0 ? pxOver : sxPrice(s);
        var lot = (s.meta && s.meta.lot) || 1;
        var aci = aciOf(s);
        var fee = feePct() / 100;
        var perOne = (px + aci) * (1 + fee);           // полная цена ОДНОЙ бумаги
        if (!(px > 0) || !(perOne > 0) || !(rub > 0)) return null;
        var lots = Math.floor(rub / (perOne * lot));
        if (lots < 1) return { lots: 0, px: px, lot: lot, need: perOne * lot };
        var qty = lots * lot;
        var gross = px * qty;
        var aciSum = aci * qty;
        var feeSum = (gross + aciSum) * fee;
        return {
            lots: lots, qty: qty, px: px, lot: lot, aci: aciSum,
            gross: gross, fee: feeSum, total: gross + aciSum + feeSum,
            // «следующая пачка уже не влезет» — объяснение лотности числом
            nextNeed: perOne * lot * (lots + 1)
        };
    }
    // Продажа: считаем от ШТУК (человек мыслит долями позиции, не рублями)
    function simpleSellCalc(s, qty, pxOver) {
        var px = pxOver > 0 ? pxOver : sxPrice(s);
        var lot = (s.meta && s.meta.lot) || 1;
        var aci = aciOf(s);
        var fee = feePct() / 100;
        if (!(px > 0) || !(qty > 0)) return null;
        var lots = Math.floor(qty / lot);
        if (lots < 1) return { lots: 0, px: px, lot: lot };
        var q = lots * lot;
        var gross = px * q;
        var aciSum = aci * q;                          // при продаже НКД ПОЛУЧАЮТ
        var feeSum = (gross + aciSum) * fee;
        return { lots: lots, qty: q, px: px, lot: lot, aci: aciSum,
                 gross: gross, fee: feeSum, total: gross + aciSum - feeSum };
    }
    // сколько этих бумаг у человека на руках (для продажи и долей)
    function haveQty(s) {
        if (RP && s && s.uid === RP.uid) return RP.qty;   // позиция реплея
        var secs = (T.pos && T.pos.secs) || {};
        var v = secs[s.uid];
        if (v == null && s.meta && s.meta.figi) v = secs[s.meta.figi];
        return Math.max(0, +v || 0);
    }

    // активная вкладка бумаг сцены (0 = первый слот экрана); через liveSlots
    // выражать нельзя — liveSlots сам спрашивает активный слот
    var scnActive = 0;
    function sxSlot() {
        var nums = slotNums();
        if (scnActive && nums.indexOf(scnActive) >= 0 && S(scnActive).uid) return scnActive;
        return nums[0] || 1;
    }
    function scnTapeWants(n) {
        if (!sceneLive() || slotNo(n) !== sxSlot()) return false;
        // стакан всегда несёт мини-ленту снизу (владелец 2026-07-24: один
        // вид — лесенка; отдельные «Лента»/«Кривая» убраны как бесполезные)
        return scnTktView() !== 'deal';
    }

    // ---- график сцены: периоды, свечи периодов для фактов, линия-запаска ----
    // Свечи движка (KLineChart) — дефолт всех ступеней, включая «Старт»
    // (владелец 2026-07-23 поверх мокапа 03); линия остаётся видом по тумблеру.
    var SX_PERIODS = [
        ['day', 'Д', 'CANDLE_INTERVAL_15_MIN', 1],
        ['week', 'Н', 'CANDLE_INTERVAL_HOUR', 7],
        ['month', 'М', 'CANDLE_INTERVAL_DAY', 31],
        ['year', 'Г', 'CANDLE_INTERVAL_DAY', 365],
        ['all', 'Всё', 'CANDLE_INTERVAL_WEEK', 1825]
    ];
    var sxPeriod = 'day';
    var sxCandles = {};   // uid|period -> [{t,v,o,h,l,vol}] | 'busy' | 'err'
    function sxPer(k) {
        for (var i = 0; i < SX_PERIODS.length; i++) if (SX_PERIODS[i][0] === (k || sxPeriod)) return SX_PERIODS[i];
        return SX_PERIODS[0];
    }
    // Свечи периода. Помимо close храним open/high/low/volume: из дневной серии
    // собирается строка фактов (открытие, диапазон, объём) — брокера не дёргаем.
    function sxLoadCandles(uid, perKey) {
        var p = sxPer(perKey), key = uid + '|' + p[0];
        if (sxCandles[key]) return;
        sxCandles[key] = 'busy';
        var now = Date.now();
        A().call('GetCandles', {
            instrumentId: uid,
            from: new Date(now - p[3] * 86400000).toISOString(),
            to: new Date(now).toISOString(),
            interval: p[2]
        }, { interactive: false }).then(function (d) {
            var q2n = A().q2n, k = bondKUid(uid);   // облигации: % → ₽
            sxCandles[key] = ((d && d.candles) || []).map(function (c) {
                return { t: Date.parse(c.time), v: q2n(c.close) * k, o: q2n(c.open) * k,
                         h: q2n(c.high) * k, l: q2n(c.low) * k, vol: +c.volume || 0 };
            }).filter(function (c) { return c.t && c.v > 0; });
            sxTick();
        }, function () { sxCandles[key] = 'err'; sxTick(); });
    }
    function perPillsHtml() {
        return '<span class="ih-per" id="btScnPer">' + SX_PERIODS.map(function (x) {
            return '<span class="' + (x[0] === sxPeriod ? 'on' : '') + '" role="button" tabindex="0" ' +
                'onclick="pftSxPeriod(\'' + x[0] + '\')">' + x[1] + '</span>';
        }).join('') + '</span>';
    }
    window.pftSxPeriod = function (k) {
        sxPeriod = sxPer(k)[0];
        var s = S(sxSlot());
        if (s.uid) sxLoadCandles(s.uid);
        var el = dq('btScnPer'); if (el) el.outerHTML = perPillsHtml();
        sxTick();
    };
    // ---- свои сделки на графике ----
    // Сегодняшние исполнения — из ответов заявок (resolveFate зовёт addFill);
    // история за годы придёт со вторым этапом брокера (GetOperations).
    // Ключ локальный, в облако не ходит (как всё брокерское).
    var FILLS_KEY = 'bt_fills_v1', FILLS = [];
    function sameDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }
    function loadFills() {
        var o;
        try { o = JSON.parse(localStorage.getItem(FILLS_KEY) || 'null'); } catch (e) { return; }
        if (!Array.isArray(o)) return;
        var now = Date.now();
        FILLS = o.filter(function (f) {
            return f && normId(f.uid) && +f.px > 0 && +f.qty > 0 && +f.ts > 0 && sameDay(+f.ts, now);
        }).slice(-30).map(function (f) {
            return { uid: normId(f.uid), px: +f.px, qty: Math.floor(+f.qty), buy: !!f.buy, ts: +f.ts };
        });
    }
    function addFill(uid, px, qty, buy) {
        if (!uid || !(px > 0) || !(qty > 0)) return;
        FILLS.push({ uid: normId(uid), px: px, qty: Math.floor(qty), buy: !!buy, ts: Date.now() });
        FILLS = FILLS.slice(-30);
        try { localStorage.setItem(FILLS_KEY, JSON.stringify(FILLS)); } catch (e) {}
        // счётчик исполнений — топливо порогов-предложений («стакан после 3
        // сделок»); GetOperations этапа 2 брокера уточнит задним числом
        try { localStorage.setItem(DEALS_KEY, String(dealsCount() + 1)); } catch (e) {}
        sxTick();
    }
    var DEALS_KEY = 'bt_deals_v1';
    function dealsCount() {
        var v = 0;
        try { v = Math.floor(+localStorage.getItem(DEALS_KEY) || 0); } catch (e) {}
        return Math.max(0, v);
    }

    // Линия растянута на весь вертикальный диапазон холста — сцена не выглядит
    // пустой (мокап 03/12). Пунктир — вчерашнее закрытие (масштаб дня без второй
    // оси), ярлык у правого края — последняя цена, точки — свои сделки за сегодня.
    function scnChartHtml(s) {
        var p = sxPer(), key = s.uid + '|' + p[0];
        var data = sxCandles[key];
        if (!data || data === 'busy') return '<div class="bts-cnote">Загружаем график…</div>';
        if (data === 'err' || data.length < 2) return '<div class="bts-cnote">График за этот срок недоступен</div>';
        var W = 1000, H = 520;
        var vals = data.map(function (c) { return c.v; });
        var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
        var close = (p[0] === 'day' && s.ob) ? A().q2n(s.ob.closePrice) : 0;
        if (close > 0) { min = Math.min(min, close); max = Math.max(max, close); }
        var span = (max - min) || 1;
        min -= span * 0.06; max += span * 0.06; span = max - min;
        function X(i) { return i * (W / (data.length - 1)); }
        function Y(v) { return H - (v - min) / span * H; }
        var line = data.map(function (c, i) { return X(i).toFixed(1) + ',' + Y(c.v).toFixed(1); }).join(' ');
        var area = 'M0,' + H + ' L' + line.split(' ').join(' L') + ' L' + W + ',' + H + ' Z';
        var lastY = Y(data[data.length - 1].v);
        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
            'aria-label="График цены за период">' +
            (close > 0 ? '<line x1="0" y1="' + Y(close).toFixed(1) + '" x2="' + W + '" y2="' + Y(close).toFixed(1) + '" class="bts-close"/>' : '') +
            '<path d="' + area + '" class="bts-area"/>' +
            '<polyline points="' + line + '" class="bts-line"/>' +
            '<circle cx="' + W + '" cy="' + lastY.toFixed(1) + '" r="4" class="bts-cdot"/>' +
            '<circle cx="' + W + '" cy="' + lastY.toFixed(1) + '" r="9" class="bts-cdot halo"/>' +
        '</svg>';
        // маркеры своих сделок — только на дневной линии: на месяцах точка врёт
        var marks = '';
        if (p[0] === 'day') {
            var t0 = data[0].t, t1 = data[data.length - 1].t;
            FILLS.forEach(function (f) {
                if (f.uid !== s.uid || !(t1 > t0)) return;
                var fx = Math.min(1, Math.max(0, (f.ts - t0) / (t1 - t0))) * 100;
                var fy = Math.min(96, Math.max(2, (max - f.px) / span * 100));
                var tm = new Date(f.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                marks += '<span class="trm' + (f.buy ? '' : ' sell') + '" style="left:' + fx.toFixed(1) + '%;top:' + fy.toFixed(1) + '%"></span>' +
                    '<span class="trm-tag' + (f.buy ? '' : ' sell') + '" style="left:' + Math.min(fx + 1.6, 72).toFixed(1) + '%;top:' + Math.max(fy - 9, 2).toFixed(1) + '%">' +
                    'вы ' + (f.buy ? 'купили' : 'продали') + ' · ' + fmtPx(f.px, s) + ' × ' + f.qty + ' · ' + tm + '</span>';
            });
        }
        var last = sxPrice(s);
        var ptag = last > 0
            ? '<span class="ptag" style="top:' + Math.min(97, Math.max(2, (max - last) / span * 100)).toFixed(1) + '%">' + fmtPx(last, s) + '</span>'
            : '';
        var cnt = p[0] === 'day' ? 7 : 5, dts = '';
        for (var k = 0; k < cnt; k++) {
            var idx = Math.round(k * (data.length - 1) / (cnt - 1));
            var d = new Date(data[idx].t);
            var lab = p[0] === 'day'
                ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                : (p[0] === 'week' || p[0] === 'month')
                    ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                    : d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
            dts += '<span>' + esc(lab) + '</span>';
        }
        return '<div class="bts-canvas">' + svg + ptag + marks + '</div><div class="ax-dates">' + dts + '</div>';
    }

    // ---- сравнение (раунд 3): линии ПОВЕРХ живых свечей героя ----
    // Владелец 2026-07-24: отдельный %-холст «открывал что-то другое» —
    // сравнение обязано ложиться на текущий график. Каждая серия
    // масштабируется к цене героя на общем начале окна (та же идея, что
    // «Compare» TradingView): относительный ход виден прямо на свечах,
    // ось остаётся в рублях героя. Серий — до девяти, каждая своим цветом.
    var CMP_IDX = [
        ['IMOEX', 'IMOEX', 'индекс МосБиржи'],
        ['RTSI', 'РТС', 'долларовый индекс'],
        ['MOEX10', 'MOEX10', 'десять самых ликвидных']
    ];
    var CMP_COLORS = ['#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#10b981',
        '#ec4899', '#84cc16', '#14b8a6', '#f97316'];
    function scnCmpGet() {
        var c = stageObj().layers.cmp;
        if (!c) return [];
        if (!Array.isArray(c)) c = [c];   // наследие первой версии: одиночный объект
        return c.filter(function (x) { return x && x.key; });
    }
    var cmpCache = {};   // kind:key|period -> [{t,v}] | 'busy' | 'err'
    function cmpKey(c) { return c.kind + ':' + c.key + '|' + sxPer()[0]; }
    // время ISS без зоны — всегда московское: без +03:00 свечи уехали бы на 3 часа
    function cmpMoexTime(v) {
        var t = Date.parse(String(v || '').replace(' ', 'T') + '+03:00');
        return isNaN(t) ? 0 : t;
    }
    function cmpLoad(c) {
        var key = cmpKey(c);
        if (cmpCache[key]) return;
        cmpCache[key] = 'busy';
        var per = sxPer();
        function fail() { cmpCache[key] = 'err'; sxTick(); }
        function ok(rows) { cmpCache[key] = rows; sxTick(); }
        if (c.kind === 'index') {
            // индексы — MOEX ISS (карта рынка уже ходит туда же, CORS открыт)
            var iv = { day: 10, week: 60, month: 24, year: 24, all: 7 }[per[0]] || 24;
            var from = new Date(Date.now() - per[3] * 86400000).toISOString().slice(0, 10);
            fetch('https://iss.moex.com/iss/engines/stock/markets/index/securities/' +
                encodeURIComponent(c.key) + '/candles.json?iss.meta=off&interval=' + iv + '&from=' + from,
                { credentials: 'omit' })
                .then(function (r) { if (!r.ok) throw 0; return r.json(); })
                .then(function (j) {
                    var cd = j && j.candles, cols = (cd && cd.columns) || [], data = (cd && cd.data) || [];
                    var iB = cols.indexOf('begin'), iC = cols.indexOf('close');
                    if (iB < 0 || iC < 0) return fail();
                    ok(data.map(function (r2) { return { t: cmpMoexTime(r2[iB]), v: +r2[iC] || 0 }; })
                        .filter(function (x) { return x.t && x.v > 0; }));
                }, fail).catch(fail);
            return;
        }
        // бумага — свечи брокера, тем же методом, что и герой
        A().call('GetCandles', {
            instrumentId: c.key,
            from: new Date(Date.now() - per[3] * 86400000).toISOString(),
            to: new Date().toISOString(),
            interval: per[2]
        }, { interactive: false }).then(function (d) {
            var q2n = A().q2n;
            ok(((d && d.candles) || []).map(function (x) {
                return { t: Date.parse(x.time), v: q2n(x.close) };
            }).filter(function (x) { return x.t && x.v > 0; }));
        }, fail);
    }
    // клик по строке меню ДОБАВЛЯЕТ или УБИРАЕТ линию (тумблер): поповер
    // остаётся открытым — линии добираются одна за другой без лишних кликов
    window.pftScCmpSet = function (kind, key, label) {
        var o = stageObj();
        var list = scnCmpGet().slice();
        var at = -1;
        list.forEach(function (x, k) { if (x.kind === kind && x.key === key) at = k; });
        if (at >= 0) list.splice(at, 1);
        else {
            if (list.length >= 9) { toast('Сравнивать можно до девяти линий разом', true); return; }
            list.push({ kind: kind, key: key, label: label });
        }
        if (list.length) o.layers.cmp = list; else delete o.layers.cmp;
        saveStageRaw(o);
        var hadMenu = !!dq('btScnCmpMenu');
        scnCmpMenuClose();
        // движок живёт: линии — канвас-слой поверх, полный рендер не нужен
        var s = S(sxSlot());
        if (s.meta) scnSet('btScnHead', scnHeadHtml(s));   // счётчик на кнопке
        sxTick();
        if (hadMenu) window.pftScCmpMenu();   // поповер пережил перерисовку шапки
    };
    window.pftScCmpOff = function () {
        var o = stageObj();
        delete o.layers.cmp;
        saveStageRaw(o);
        scnCmpMenuClose();
        var s = S(sxSlot());
        if (s.meta) scnSet('btScnHead', scnHeadHtml(s));
        sxTick();
    };
    // поповер «Сравнить с…»: индексы списком + поиск любой бумаги брокера
    function scnCmpMenuClose() {
        var m = dq('btScnCmpMenu'); if (m) m.remove();
    }
    function scnCmpHas(kind, key) {
        var hit = false;
        scnCmpGet().forEach(function (x) { if (x.kind === kind && x.key === key) hit = true; });
        return hit;
    }
    window.pftScCmpMenu = function (ev) {
        if (ev) ev.stopPropagation();
        var old = dq('btScnCmpMenu'); if (old) { old.remove(); return; }
        var btn = dq('btScnCmpBtn'); if (!btn) return;
        var cur = scnCmpGet();
        var rows = CMP_IDX.map(function (x) {
            var on = scnCmpHas('index', x[0]);
            return '<button type="button" class="' + (on ? 'on' : '') + '" ' +
                'onclick="pftScCmpSet(\'index\',\'' + x[0] + '\',\'' + x[1] + '\')">' +
                '<b>' + x[1] + '</b><em>' + x[2] + '</em><i>✓</i></button>';
        }).join('');
        btn.insertAdjacentHTML('afterend',
            '<div class="bts-indmenu bts-cmpmenu" id="btScnCmpMenu">' +
            '<div class="im-sec"><span class="im-cap">Индексы</span>' + rows + '</div>' +
            '<div class="im-sec"><span class="im-cap">Бумага</span>' +
            '<div class="cmp-find"><input id="btScnCmpQ" type="text" autocomplete="off" spellcheck="false" ' +
                'placeholder="Тикер или название…" aria-label="Бумага для сравнения"></div>' +
            '<div id="btScnCmpRes"></div></div>' +
            '<div class="cmp-hint">до девяти линий · клик добавляет и убирает</div>' +
            (cur.length ? '<button type="button" class="cmp-off" onclick="pftScCmpOff()">Убрать все линии (' +
                cur.length + ')</button>' : '') +
            '</div>');
        var q = dq('btScnCmpQ');
        if (q) {
            var tt = null;
            q.addEventListener('input', function () {
                clearTimeout(tt);
                var v = q.value.trim();
                tt = setTimeout(function () {
                    if (v.length < 2) { var r0 = dq('btScnCmpRes'); if (r0) r0.innerHTML = ''; return; }
                    PF.pftFindInstruments(v).then(function (list) {
                        var box = dq('btScnCmpRes');
                        if (!box) return;
                        box.innerHTML = (list || []).slice(0, 5).map(function (p) {
                            return '<button type="button" class="' + (scnCmpHas('paper', p.uid) ? 'on' : '') +
                                '" onclick="pftScCmpSet(\'paper\',\'' + jsArg(p.uid) +
                                '\',\'' + jsArg(p.ticker) + '\')"><b>' + esc(p.ticker) + '</b><em>' +
                                esc(p.name || '') + '</em><i>✓</i></button>';
                        }).join('') || '<div class="bts-cnote">Не нашлось</div>';
                    }).catch(function () {});
                }, 250);
            });
            q.addEventListener('keydown', function (e) { e.stopPropagation(); });
            try { q.focus(); } catch (e) {}
        }
        setTimeout(function () {
            document.addEventListener('click', function once(e) {
                if (e.target.closest && e.target.closest('#btScnCmpMenu')) return;
                document.removeEventListener('click', once);
                scnCmpMenuClose();
            });
        }, 0);
    };
    function cmpDeltaTxt(v) {
        return (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' %';
    }
    // канвас-слой сравнения поверх свечей движка (та же механика, что тень
    // профиля объёма scnKProfile): x — пиксель бара героя, y — цена героя,
    // приведённая как heroBase · серия/её база на общем начале окна.
    // Перерисовка — на тике, скролле/зуме холста и смене темы
    function scnKCmp() {
        var cv = dq('btScnCmpCv'), leg = dq('btScnCmpLeg');
        if (!cv) return;
        var list = scnCmpGet();
        if (!K.chart || !list.length) {
            cv.style.display = 'none';
            if (leg && leg.__btHtml !== '') { leg.__btHtml = ''; leg.innerHTML = ''; }
            return;
        }
        cv.style.display = '';
        var box = cv.parentElement;
        if (!box) return;
        var W = box.clientWidth, H = box.clientHeight;
        if (!(W > 40) || !(H > 40)) return;
        var dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
            cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        }
        var ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var bars = [], vr = null;
        try { bars = K.chart.getDataList() || []; vr = K.chart.getVisibleRange(); } catch (e) {}
        // база — ЛЕВЫЙ КРАЙ ВИДИМОГО окна (владелец 2026-07-24: якорь на
        // начале ЗАГРУЖЕННОЙ истории уезжал за экран, и наложение «ничего
        // непонятно»). Сдвинули график — базы пересчитались, как в TradingView
        var visFrom = vr && isFinite(vr.from) ? Math.max(0, Math.floor(vr.from)) : 0;
        var visTo = vr && isFinite(vr.to) ? Math.min(bars.length, Math.ceil(vr.to)) : bars.length;
        var s = S(sxSlot());
        var chips = '', tags = [];
        function chip(col, c2, pct, txt) {
            return '<span class="cmp-chip"><i style="background:' + col + '"></i><b>' + esc(c2.label) + '</b>' +
                (txt != null ? '<em>' + txt + '</em>'
                    : '<u class="' + (pct >= 0 ? 'g' : 'r') + '">' + cmpDeltaTxt(pct) + '</u>') +
                '<s role="button" tabindex="0" title="Убрать линию" aria-label="Убрать линию" ' +
                    'onclick="pftScCmpSet(\'' + c2.kind + '\',\'' + jsArg(c2.key) + '\',\'' + jsArg(c2.label) + '\')">✕</s></span>';
        }
        list.forEach(function (c, ci) {
            cmpLoad(c);
            var col = CMP_COLORS[ci % CMP_COLORS.length];
            var rows = cmpCache[cmpKey(c)];
            if (!rows || rows === 'busy') { chips += chip(col, c, null, 'считаем…'); return; }
            if (rows === 'err' || rows.length < 2 || visTo - visFrom < 2) {
                chips += chip(col, c, null, 'нет данных за срок'); return;
            }
            // якорь: первый ВИДИМЫЙ бар, на котором серия уже существует
            var bi0 = visFrom;
            while (bi0 < visTo - 1 && bars[bi0].timestamp < rows[0].t) bi0++;
            if (bars[bi0].timestamp < rows[0].t) { chips += chip(col, c, null, 'нет данных за срок'); return; }
            var ri0 = 0;
            while (ri0 < rows.length - 1 && rows[ri0 + 1].t <= bars[bi0].timestamp) ri0++;
            var heroBase = bars[bi0].close, base = rows[ri0].v;
            if (!(heroBase > 0) || !(base > 0)) { chips += chip(col, c, null, 'нет данных за срок'); return; }
            ctx.beginPath();
            var ri = ri0, started = false, lastV = base, lastP = null;
            for (var i = bi0; i < visTo; i++) {
                while (ri < rows.length - 1 && rows[ri + 1].t <= bars[i].timestamp) ri++;
                if (rows[ri].t > bars[i].timestamp) continue;
                lastV = rows[ri].v;
                var p = null;
                try {
                    p = K.chart.convertToPixel({ dataIndex: i, value: heroBase * lastV / base },
                        { paneId: 'candle_pane' });
                } catch (e) {}
                if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
                if (!started) { ctx.moveTo(p.x, p.y); started = true; }
                else ctx.lineTo(p.x, p.y);
                lastP = p;
            }
            var pct = (lastV / base - 1) * 100;
            if (started) {
                ctx.strokeStyle = col; ctx.lineWidth = 1.6;
                ctx.lineJoin = 'round'; ctx.globalAlpha = 0.9;
                ctx.stroke(); ctx.globalAlpha = 1;
                if (lastP) tags.push({ y: lastP.y, col: col, txt: c.label + ' ' + cmpDeltaTxt(pct) });
            }
            chips += chip(col, c, pct, null);
        });
        // плашки серий у правого края (владелец 2026-07-24): имя + % на цвете
        // линии, раздвинуты по вертикали, чтобы не слипались
        if (tags.length) {
            tags.sort(function (a, b) { return a.y - b.y; });
            for (var ti = 1; ti < tags.length; ti++) {
                if (tags[ti].y - tags[ti - 1].y < 19) tags[ti].y = tags[ti - 1].y + 19;
            }
            ctx.font = '700 10.5px ' + (getComputedStyle(document.body).getPropertyValue('--font-num') || 'monospace');
            tags.forEach(function (tg) {
                var tw = ctx.measureText(tg.txt).width;
                var x = W - tw - 16, y = Math.max(9, Math.min(H - 9, tg.y));
                ctx.fillStyle = tg.col;
                scnRoundRect(ctx, x - 7, y - 9, tw + 14, 18, 9);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillText(tg.txt, x, y + 3.5);
            });
        }
        if (leg) {
            var hero = '';
            if (visTo - visFrom > 1 && s.meta && bars[visFrom]) {
                var hPct = (bars[visTo - 1].close / bars[visFrom].close - 1) * 100;
                hero = '<span class="cmp-chip hero"><i></i><b>' + esc(s.meta.ticker) + '</b>' +
                    '<u class="' + (hPct >= 0 ? 'g' : 'r') + '">' + cmpDeltaTxt(hPct) + '</u></span>';
            }
            var lh = hero + chips + '<em>рост в % от левого края окна — сдвиньте график, база пересчитается</em>';
            if (leg.__btHtml !== lh) { leg.__btHtml = lh; leg.innerHTML = lh; }
        }
    }

    // ---- герой бумаги: шапка без монограммы, цена 58px ----
    // тумблер Линия/Свечи + периоды — одним блоком: на «Старте» в шапке,
    // на «Разгоне» — в зоне графика (шапка героя тянется и над стаканом,
    // и пилюли висели бы над ним, а не над холстом — владелец 2026-07-23)
    function scnPillsHtml() {
        // в реплее пилюли молчат: периодами и сравнением правит плёнка
        if (RP) return '';
        var cmp = scnCmpGet();
        var cmpBtn = '<span class="ih-ind' + (cmp.length ? ' on' : '') + '" id="btScnCmpBtn" role="button" tabindex="0" ' +
            'onclick="pftScCmpMenu(event)" aria-haspopup="true" title="Наложить индексы и другие бумаги — до девяти линий">' +
            '⊕ Сравнить' + (cmp.length ? '<i>' + cmp.length + '</i>' : '') + '</span>';
        // видимый вход в реплей (владелец 2026-07-24: команда омнибокса —
        // слишком глубоко, в тренажёр не попасть, если о нём не знать)
        var rpBtn = '<span class="ih-ind" role="button" tabindex="0" onclick="pftScReplay()" ' +
            'title="Тренажёр: неделя настоящей истории этой бумаги, деньги виртуальные">⏵ Реплей</span>';
        // при живом сравнении линии лежат на свечах движка: тумблер «Линия»
        // не действует и спрятан, периоды и индикаторы остаются
        if (cmp.length) return perPillsHtml() + cmpBtn + scnIndBtnHtml() + rpBtn;
        return '<span class="ih-per"><span class="' + (candlesOn() ? '' : 'on') + '" role="button" tabindex="0" ' +
                'onclick="pftScMode(0)">Линия</span><span class="' + (candlesOn() ? 'on' : '') + '" role="button" ' +
                'tabindex="0" onclick="pftScMode(1)">Свечи</span></span>' + perPillsHtml() +
            cmpBtn + (candlesOn() ? scnIndBtnHtml() : '') + rpBtn;
    }
    function scnHeadHtml(s) {
        var m = s.meta;
        var al = alertsFor(s.uid).length;
        // пилюли + звоночек — в шапке на всех ступенях; на «Разгоне» блок
        // прижат к правому краю ГРАФИКА, не героя (CSS-сдвиг .bts-hero-x
        // .ih-r: над стаканом ему не место — владелец 2026-07-23)
        // звезда у имени: та же «Избранное» (stk_fav_v1), что в Портфелях и
        // на «Рынке» — отсюда бумага попадает в рейку F и на клавиши 1–9
        var fav = wlList().indexOf(m.ticker) !== -1;
        var star = '<button type="button" class="ih-fav' + (fav ? ' on' : '') + '" onclick="pftScFavTgl()" ' +
            'title="' + (fav ? 'Убрать из «Избранного»' : 'В «Избранное» — попадёт в рейку F и на клавиши 1–9') + '" ' +
            'aria-pressed="' + fav + '" aria-label="Избранное">' + (fav ? '★' : '☆') + '</button>';
        return '<span class="ih-nm"><h3>' + esc(m.name || m.ticker) + star + '</h3>' +
            '<em>' + esc(m.ticker) + ' · MOEX · лот ' + m.lot + ' шт</em></span>' +
            '<span class="ih-r">' + scnPillsHtml() +
            '<button type="button" class="ih-bell' + (al ? ' on' : '') + '" onclick="pftScBell(event)" ' +
                'title="Уведомить о цене" aria-label="Алерт по цене" aria-haspopup="true">' + IC_BELL + '</button></span>';
    }
    function scnPriceHtml(s) {
        var last = sxPrice(s);
        // реплей: дельта — от начала плёнки, не от вчерашнего живого закрытия
        var close = RP && s.uid === RP.uid ? RP.rows[0].v : (s.ob ? A().q2n(s.ob.closePrice) : 0);
        var chip = '';
        if (last > 0 && close > 0 && Math.abs(last - close) > 1e-9) {
            var d = last - close, up = d >= 0, pct = Math.abs(d / close * 100);
            chip = '<span class="day-chip' + (up ? '' : ' dn') + '">' + (up ? '▲ +' : '▼ −') +
                fmtPx(Math.abs(d), s) + ' · ' + (up ? '+' : '−') +
                pct.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' % <em>' +
                (RP && s.uid === RP.uid ? 'с начала плёнки' : 'сегодня') + '</em></span>';
        }
        return '<span class="price-big">' + (last > 0 ? fmtPx(last, s) : '—') + '<small> ₽</small></span>' + chip;
    }
    function scnHeroHtml(n, s) {
        // фактов дня больше нет (владелец 2026-07-23): открытие, диапазон
        // и объём видны на самих свечах, отдельная строка только шумела
        return '<div class="bts-hero">' +
            '<div class="ih" id="btScnHead">' + scnHeadHtml(s) + '</div>' +
            '<div class="price-row" id="btScnPrice">' + scnPriceHtml(s) + '</div>' +
            '<div class="bts-chart" id="btScnChart">' + scnChartBody(s) + '</div>' +
        '</div>';
    }
    // тело холста: свечи движка (все ступени, дефолт) либо линия по тумблеру;
    // на «Разгоне»+ вокруг добавляются стакан и лента (мокап 04)
    function scnChartBody(s) {
        if (RP) return rpChartHtml(s);
        // живое сравнение лежит НА свечах движка — линия-svg в стороне:
        // при активных линиях холст всегда за движком
        if (!candlesOn() && !scnCmpGet().length) return scnChartHtml(s);
        // чипы индикаторов с холста ушли (владелец 2026-07-23): их место —
        // кнопка «Индикаторы» в шапке рядом с пилюлями (scnIndBtnHtml)
        return '<div class="bts-kmount" id="btScnK"></div>' +
            '<canvas class="bts-prof" id="btScnProf"></canvas>' +
            '<canvas class="bts-cmp" id="btScnCmpCv"></canvas>' +
            '<div class="bts-cmpleg" id="btScnCmpLeg"></div>' +
            '<div class="bts-ordt" id="btScnOrdT"></div>' +
            '<div class="bts-ordt" id="btScnCrossT"></div>' +
            '<div class="bts-ohlc" id="btScnOhlc"></div>';
    }
    // ---- тикет-колонка: сумма в рублях, «что нужно знать» свёрнуто ----
    // ---- состояние рынка: торги / аукцион / закрыто (экран 11) ----
    // GetTradingStatus уже опрашивается (pollStatus, s.status). Аукцион —
    // четвёртое состояние связи: не торги, не закрытие и не обрыв.
    function scnMktState(s) {
        var st = s.status && s.status.tradingStatus;
        if (!st) return null;   // статус ещё не пришёл — не пугаем зря
        if (st === 'SECURITY_TRADING_STATUS_NORMAL_TRADING' ||
            st === 'SECURITY_TRADING_STATUS_DEALER_NORMAL_TRADING') return 'open';
        if (/AUCTION/.test(st)) return 'auction';
        return 'closed';
    }
    function scnFreshInner() {
        if (RP) return '<span class="fresh amber"><i></i>реплей · счёт виртуальный</span>';
        var s = S(sxSlot());
        var l = linkState(s);
        // закрытая биржа — не обрыв: стакан отвечает, но это цена закрытия
        var mkt = scnMktState(s);
        if (l.state === 'live' && mkt === 'closed') return '<span class="fresh dimm"><i></i>биржа закрыта</span>';
        if (l.state === 'live' && mkt === 'auction') return '<span class="fresh amber"><i></i>аукцион</span>';
        if (l.state === 'live') return '<span class="fresh"><i></i>цена живая</span>';
        if (l.state === 'wait') return '<span class="fresh amber"><i></i>ждём цену</span>';
        return '<span class="fresh amber"><i></i>цена замерла · ' + ageTxt(l.ageMs) + '</span>';
    }
    // причина, по которой кнопку сцены жать нельзя (поверх гварда свежести)
    function scnSubmitBlock(n) {
        var s = S(n);
        // реплей: биржа и связь настоящего мира не при чём — плёнка сама решает
        if (RP && s.uid === RP.uid) {
            return RP.done ? 'Неделя закончилась — итог на экране' : '';
        }
        var l = linkState(s).state;
        if (l === 'wait') return 'Ждём данные от брокера';
        if (l === 'stale') return 'Ждём связь…';
        var mkt = scnMktState(s);
        if (mkt === 'closed') return 'Биржа закрыта — откроется в 10:00';
        // рыночной заявке нужна противоположная сторона стакана (неликвид)
        if (s.kind !== 'limit' && mkt === 'open' && s.ob) {
            var opp = s.side === 'sell' ? s.ob.bids : s.ob.asks;
            if (!opp || !opp.length) return 'Рыночной цены нет — поставьте лимитку';
        }
        return '';
    }
    function feeTxt() { return String(feePct()).replace('.', ','); }
    function posOf(uid) {
        var out = null;
        (T.port.list || []).forEach(function (p) { if (p.uid === uid) out = p; });
        return out;
    }
    // глоссарий новичка: пунктир под «11 лотов», тултип одной фразой (мокап 03)
    function glLot(s, lotsTxt) {
        var m = s.meta, half = Math.max(1, Math.floor(m.lot / 2));
        return '<u class="gl">' + lotsTxt +
            '<span class="gl-tip"><em>Лот</em>Минимальная пачка бумаг на бирже. У ' + esc(m.ticker) +
            ' в лоте ' + m.lot + ' ' + unitWord(s, m.lot) + ': купить ' + half +
            ' нельзя, ' + m.lot + ' — можно. Тикет всегда округляет до целых лотов сам.</span></u>';
    }
    // ---- цена исполнения и единый расчёт: ₽ ⇄ штуки (этап 3, экраны 08–09) ----
    // Рыночная покупка снимает ЛУЧШУЮ ПРОДАЖУ (аск), продажа отдаёт по биду.
    // При узком спреде разница — копейки, и тикет считает по последней цене
    // (одно число с шапкой, решение раунда 1). При широком (порог ~1%) считать
    // по last значит наврать на сотни рублей — расчёт идёт по краю стакана, а
    // спред-гвард предупреждает о переплате и предлагает лимитку у спреда.
    // Это предупреждение, не замок: пороги — предложения.
    var SPREAD_WARN = 0.01;
    function bestPx(s, side) {
        if (!s.ob) return 0;
        var arr = side === 'ask' ? s.ob.asks : s.ob.bids;
        return (arr && arr.length) ? A().q2n(arr[0].price) : 0;
    }
    function spreadInfo(s) {
        // в реплее живой книги нет: исполнение по цене плёнки, гвард молчит
        if (RP && s && s.uid === RP.uid) return null;
        var ask = bestPx(s, 'ask'), bid = bestPx(s, 'bid');
        if (!(ask > 0) || !(bid > 0) || ask <= bid) return null;
        return { ask: ask, bid: bid, pct: (ask - bid) / ((ask + bid) / 2) };
    }
    // Лимитка у спреда — СЕССИОННАЯ (не s.price): у мигранта раунда 1 в слоте
    // могла остаться старая лимитная цена терминала, и тикет молча считал бы
    // по ней — ровно ловушка sxPrice, уже пойманная однажды. Гаснет при смене
    // бумаги и стороны.
    var scnLim = 0;
    // Действующая лимитная цена сцены: её несёт видимая строка цены тикета
    // (s.kind + s.price — слот, как в раунде 1: цена на глазах). Строка цены
    // теперь на всех ступенях — сессионный scnLim остался запасным каналом
    function scnLimPx(s) {
        if (s.kind === 'limit' && +s.price > 0) return +s.price;
        return scnLim > 0 ? scnLim : 0;
    }
    function scnExecPx(s, buy) {
        var lim = scnLimPx(s);
        if (lim > 0) return lim;
        var sp = spreadInfo(s);
        if (sp && sp.pct >= SPREAD_WARN) return buy ? sp.ask : sp.bid;
        return sxPrice(s);
    }
    // цена в лимитку ложится на шаг инструмента — иначе брокер отвергнет
    function scnSnap(v, s) {
        var st = (s.meta && s.meta.minInc) || 0.01;
        var r = Math.round(v / st) * st;
        var dec = String(st).indexOf('.') >= 0 ? String(st).split('.')[1].length : 0;
        return +r.toFixed(Math.min(9, dec));
    }
    // расчёт от ШТУК — режим «в лотах» покупки (продажа так считала всегда)
    function buyFromQty(s, qty, px) {
        var lot = (s.meta && s.meta.lot) || 1;
        var aci = aciOf(s), fee = feePct() / 100;
        if (!(px > 0) || !(qty > 0)) return null;
        var lots = Math.floor(qty / lot);
        if (lots < 1) return { lots: 0, px: px, lot: lot, need: (px + aci) * (1 + fee) * lot };
        var q = lots * lot, gross = px * q, aciSum = aci * q;
        var feeSum = (gross + aciSum) * fee;
        return { lots: lots, qty: q, px: px, lot: lot, aci: aciSum,
                 gross: gross, fee: feeSum, total: gross + aciSum + feeSum };
    }
    // единица ввода: '' = дефолт стороны (покупка — рубли, продажа — штуки)
    var scnUnit = '';
    function unitOf(s) {
        if (scnUnit === 'rub' || scnUnit === 'qty') return scnUnit;
        return s.side === 'sell' ? 'qty' : 'rub';
    }
    // ₽ ⇄ лоты — переключение единицы прямо в поле; в лотовом режиме рублёвых
    // пресетов нет (мокап 08). Смена единицы обнуляет число: оно бессмысленно.
    window.pftScUnit = function () {
        var n = sxSlot(), s = S(n);
        scnUnit = unitOf(s) === 'rub' ? 'qty' : 'rub';
        simpleSum = '';
        var el = dq('btScnTicket');
        if (el) { el.innerHTML = scnTicketHtml(n); sxWire(); }
    };
    function scnCalc(n) {
        var s = S(n), buy = s.side !== 'sell';
        var px = scnExecPx(s, buy);
        var v = +simpleSum || 0;
        if (buy) return unitOf(s) === 'rub' ? simpleBuyCalc(s, v, px) : buyFromQty(s, v, px);
        if (unitOf(s) === 'qty') return simpleSellCalc(s, v, px);
        // продажа «на сумму»: сколько целых лотов набирает выручку, не больше позиции
        var lot = (s.meta && s.meta.lot) || 1;
        var lots = px > 0 ? Math.floor(v / (px * lot)) : 0;
        lots = Math.min(lots, Math.floor(haveQty(s) / lot));
        return simpleSellCalc(s, Math.max(0, lots) * lot, px);
    }
    // свободные деньги сцены: в реплее — виртуальный счёт, вне его — брокер.
    // ЕДИНСТВЕННАЯ точка правды для тикета: все строки денег ходят сюда
    function scnFree() { return RP ? RP.money : T.pos.money; }
    // недостача: введённая сумма против свободных (рубли) или итог против них (штуки)
    function scnShortfall(n) {
        var s = S(n);
        if (s.side === 'sell') return 0;
        var free = scnFree();
        if (free == null) return 0;
        if (unitOf(s) === 'rub') { var v = +simpleSum || 0; return v > free ? v - free : 0; }
        var c = scnCalc(n);
        return (c && c.lots && c.total > free) ? c.total - free : 0;
    }
    function scnApxHtml(n) {
        var s = S(n), buy = s.side !== 'sell';
        var c = scnCalc(n);
        var lot = (s.meta && s.meta.lot) || 1;
        var unit = unitOf(s);
        if (buy) {
            // «не хватает»: недостача словами + честный «Максимум» (экран 09)
            var short = scnShortfall(n);
            if (short > 0) {
                var mx = simpleBuyCalc(s, scnFree(), scnExecPx(s, 1));
                return 'Не хватает <b>' + fmtRub(short) + '</b>.' + (mx && mx.lots
                    ? ' «Максимум» — ' + mx.qty.toLocaleString('ru-RU') + ' ' +
                      unitWord(s, mx.qty) + ' за <b>' + fmtKop(mx.total) + '</b> с комиссией'
                    : '');
            }
            if (!(+simpleSum > 0)) return '<span class="mut">' + (unit === 'rub'
                ? 'Укажите сумму — посчитаем бумаги и комиссию.'
                : 'Укажите количество — посчитаем деньги и комиссию.') + '</span>';
            if (!c) return '<span class="mut">Ждём цену от брокера…</span>';
            if (!c.lots) return 'Меньше одного лота: лот ' + esc(s.meta.ticker) + ' — ' + lot + ' ' +
                unitWord(s, lot) + ', <b>' + fmtKop(c.px * lot) + '</b> (' +
                fmtKop(c.need) + ' с комиссией)';
            // НКД облигации — на глазах ДО подтверждения, не сюрпризом в диалоге
            var aciTxt = c.aci > 0 ? ' · НКД <b>' + fmtKop(c.aci) + '</b>' : '';
            if (unit === 'qty')
                return c.qty.toLocaleString('ru-RU') + ' ' + unitWord(s, c.qty) +
                    ' = <b>' + fmtKop(c.gross) + '</b> по ' + (scnLimPx(s) > 0 ? 'лимиту' : 'рынку') +
                    aciTxt + ' · комиссия ' + fmtKop(c.fee);
            // итог слева, лотность — тихим хвостом у правого края (владелец
            // 2026-07-24: тире-простыня «— 3 лота по 10 шт» не читалась)
            return '<span class="apx-flex"><span>≈ <b>' + c.qty.toLocaleString('ru-RU') + ' ' +
                unitWord(s, c.qty) + '</b>' + aciTxt + '</span>' +
                (lot > 1
                    ? '<span class="apx-r">' + glLot(s, c.lots.toLocaleString('ru-RU') + ' ' +
                      PF.plural(c.lots, 'лот', 'лота', 'лотов')) + ' × ' + lot + ' шт</span>'
                    : '') + '</span>';
        }
        var have = haveQty(s), p = posOf(s.uid);
        if (!(have > 0)) return '<span class="mut">Этой бумаги у вас нет — продавать нечего.</span>';
        var left = (c && c.qty) ? Math.max(0, have - c.qty) : have;
        return 'У вас <b>' + have.toLocaleString('ru-RU') + ' ' + unitWord(s, have) + '</b>' +
            (p && p.avg > 0 ? ' по ' + fmtPx(p.avg, s) + ' ₽' : '') +
            (c && c.qty ? ' — останется ' + left.toLocaleString('ru-RU') : '');
    }
    // средняя после докупки — та же средняя, что видит брокер (GetPortfolio)
    function scnAvgHtml(n) {
        var s = S(n);
        if (RP) return '';   // средняя живой позиции в реплее только путала бы
        if (s.side === 'sell') return '';
        var c = scnCalc(n);
        var p = posOf(s.uid);
        if (!c || !c.lots || !p || !(p.avg > 0) || !(p.qty > 0) || scnShortfall(n) > 0) return '';
        var na = (p.avg * p.qty + c.px * c.qty) / (p.qty + c.qty);
        // подробности — в тултипе-«деталях» (владелец 2026-07-23: развёрнутая
        // строка шумела); та же механика .gl, что у глоссария лота
        return '<u class="gl">средняя станет ' + fmtPx(na, s) + ' ₽' +
            '<span class="gl-tip"><em>Средняя цена</em>Сейчас у вас ' +
            p.qty.toLocaleString('ru-RU') + ' шт по ' + fmtPx(p.avg, s) + ' ₽. Докупка ' +
            c.qty.toLocaleString('ru-RU') + ' шт по ' + fmtPx(c.px, s) +
            ' ₽ сдвинет среднюю до ' + fmtPx(na, s) + ' ₽.</span></u>';
    }
    // переплату называем круглым числом: 469 ₽ точности не добавляет, а «≈» честнее
    function scnTen(v) { return v >= 100 ? Math.round(v / 10) * 10 : Math.round(v); }
    // спред-гвард: предупреждение о переплате в рублях + «лимитка у спреда».
    // Родной брат гварда свежести, но НЕ замок — отправить по рынку можно.
    function scnWarnHtml(n) {
        var s = S(n), buy = s.side !== 'sell';
        var lim0 = scnLimPx(s);
        // лимитку видно в строке цены тикета (теперь на всех ступенях) —
        // вторая строка о ней была бы дублем
        if (lim0 > 0) return '';
        var sp = spreadInfo(s);
        var c = scnCalc(n);
        if (!sp || sp.pct < SPREAD_WARN || !c || !c.lots || scnShortfall(n) > 0) return '';
        var inc = (s.meta && s.meta.minInc) || 0.01;
        var lim = buy ? sp.bid + inc : sp.ask - inc;
        var over = c.qty * (buy ? sp.ask - lim : lim - sp.bid);
        if (!(over > 0)) return '';
        var pct = (sp.pct * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
        return '<span>Спред ' + pct + ' % — по рынку ' + (buy ? 'переплата' : 'недобор') +
            ' ≈ ' + fmtRub(scnTen(over)) + '</span>' +
            '<u onclick="pftScLimit(' + lim.toFixed(6) + ')">Лимитка ' + fmtPx(lim, s) + ' ₽</u>';
    }
    window.pftScLimit = function (px) {
        if (!(px > 0)) return;
        var n = sxSlot(), s = S(n);
        // лимитка встаёт в видимую строку цены тикета (теперь она везде)
        s.kind = 'limit';
        s.price = String(scnSnap(+px, s));
        saveSlots();
        scnTicketRedraw(n);
        toast('Лимитка у спреда: заявка встанет по вашей цене — отправка всё равно только кнопкой');
    };
    window.pftScMarket = function () {
        scnLim = 0;
        var n = sxSlot(), s = S(n);
        if (s.kind === 'limit') {
            s.kind = 'market';
            saveSlots();
            scnTicketRedraw(n);
        } else scnTicketBits();
    };
    // полная пересборка тикета (строки добавились/ушли) + повторная привязка полей
    function scnTicketRedraw(n) {
        var el = dq('btScnTicket');
        if (el) { el.innerHTML = scnTicketHtml(n); sxWire(); }
    }
    function scnPresetsHtml(n) {
        var s = S(n), buy = s.side !== 'sell';
        // рублёвые пресеты живут только у рублёвой единицы (мокап 08), доли
        // позиции — только у штучной продажи; в остальных режимах ряда нет
        if (unitOf(s) !== (buy ? 'rub' : 'qty')) return '';
        function pch(lab, v, fn, off) {
            return '<span class="pch' + (v > 0 && +simpleSum === v ? ' on' : '') + (off ? ' off' : '') +
                '" role="button" tabindex="0" onclick="' + fn + '">' + lab + '</span>';
        }
        if (buy) {
            var free = scnFree();
            return pch('5 000', 5000, 'pftSxQuick(5000)') +
                pch('15 000', 15000, 'pftSxQuick(15000)') +
                pch('30 000', 30000, 'pftSxQuick(30000)') +
                // «Максимум» — все свободные деньги; делитель расчёта уже включает
                // комиссию, поэтому итог не вылезет за них (закон раунда 1)
                pch('Макс', free > 0 ? Math.floor(free) : 0, 'pftSxMax()', !(free > 0));
        }
        var have = haveQty(s);
        return pch('Четверть', Math.floor(have / 4), 'pftSxQuick(' + Math.floor(have / 4) + ')', !(have >= 4)) +
            pch('Половина', Math.floor(have / 2), 'pftSxQuick(' + Math.floor(have / 2) + ')', !(have >= 2)) +
            pch('Всё', have, 'pftSxQuick(' + have + ')', !(have > 0));
    }
    function scnRestHtml(n) {
        var s = S(n), buy = s.side !== 'sell';
        var c = scnCalc(n);
        var free = scnFree();
        if (free == null || !c || !c.lots || scnShortfall(n) > 0) return '';
        return '<span>' + (buy ? 'Останется свободно' : 'Станет свободно') + '</span><b>' +
            fmtRub(buy ? free - c.total : free + c.total) + '</b>';
    }
    // Кнопка гаснет С ПРИЧИНОЙ, не серым молчанием (экран 09): недостача —
    // прямо в кнопке, как сумма списания в счастливом пути. Итог списания —
    // ТОЛЬКО в кнопке, с копейками (fmtKop): закон раунда 1.
    function scnCtaHtml(n) {
        var s = S(n), buy = s.side !== 'sell';
        var c = scnCalc(n);
        var blk = scnSubmitBlock(n);
        var auction = scnMktState(s) === 'auction';
        var short = buy ? scnShortfall(n) : 0;
        var have = haveQty(s);
        var sellOver = !buy && c && c.qty > have;
        var can = !!(c && c.lots) && !blk && !(short > 0) && !sellOver;
        var label, note = 'Комиссия ' + feeTxt() + ' % уже включена';
        if (blk) {
            label = esc(blk);
            if (blk.indexOf('Биржа закрыта') === 0) note = 'Черновик переживёт ночь в тикете — утром цена будет свежей';
        } else if (short > 0) {
            label = 'Не хватает ' + fmtRub(short);
            note = 'Пресет «Макс» подставит достижимую сумму';
        } else if (sellOver) {
            label = 'У вас только ' + have.toLocaleString('ru-RU') + ' шт';
            note = 'Пресет «Всё» подставит всю позицию';
        } else if (!(+simpleSum > 0)) label = buy ? 'Купить' : 'Продать';
        else if (!c || !c.lots) {
            label = buy ? 'Мало для одного лота' : 'Меньше одного лота';
            if (buy && c && c.need > 0) note = 'Кнопка оживёт от ' + fmtRub(Math.ceil(c.need));
        } else if (auction && !RP) {
            // рыночной заявки в аукционе не существует: уйдёт лимитка по
            // индикативной цене, исполнение дешевле лимита возможно — «до»
            label = 'В аукцион — спишется до ' + fmtKop(c.total);
            note = 'Аукцион: лимитка по индикативной цене, дешевле — можно, дороже — никогда';
        } else if (RP) {
            label = (buy ? 'Купить в реплее на ' : 'Продать в реплее на ') + fmtKop(c.total);
            note = 'Деньги виртуальные · комиссия ' + feeTxt() + ' % как настоящая';
        } else label = (buy ? 'Купить на ' : 'Продать на ') + fmtKop(c.total);
        return '<button type="button" class="cta' + (buy ? '' : ' sell') + (can ? '' : ' dis') + '" ' +
            (can ? '' : 'disabled ') + 'onclick="pftSxGo()">' + label + '</button>' +
            '<div class="fee">' + note + '</div>';
    }
    // «что нужно знать» — развёрнуто прямо в тикете: новичок по ссылкам не ходит
    function scnKnowHtml(n) {
        var s = S(n), buy = s.side !== 'sell';
        var last = sxPrice(s);
        var px = last > 0 ? fmtPx(last, s) + ' ₽' : '—';
        // первая строка обязана видеть лимитку (владелец 2026-07-23: тикет с
        // лимиткой говорил «по рыночной цене» — враньё), lim — цена слота
        var lim = s.kind === 'limit' && +s.price > 0 ? fmtPx(+s.price, s) + ' ₽' : '';
        var first = buy
            ? (lim ? 'Купится по вашей лимитной цене <b>' + lim + '</b> или дешевле — дороже никогда.'
                : 'Купится по рыночной цене — сейчас <b>' + px + '</b> за ' + (isBond(s) ? 'облигацию' : 'акцию') + '.')
            : (lim ? 'Продастся по вашей лимитной цене <b>' + lim + '</b> или дороже — дешевле никогда.'
                : 'Продастся по рыночной цене — сейчас <b>' + px + '</b> за ' + (isBond(s) ? 'облигацию' : 'акцию') + '.');
        var rows = buy ? [
            first,
            'Комиссия ' + feeTxt() + ' % уже в сумме кнопки — списаний сверх неё не будет.',
            'Передумать можно, пока заявка не исполнена.'
        ] : [
            first,
            'Комиссия ' + feeTxt() + ' % уже вычтена из суммы кнопки.',
            'Если продаёте с прибылью, налог 13 % удержат по итогам года.'
        ];
        // ✕ живёт ВНУТРИ scnKnowHtml: тик сцены (scnSet btScnKnow) переписывает
        // содержимое карточки, и вынесенная наружу ссылка «Свернуть» умирала
        // с первым же тиком (владелец 2026-07-23: «блок нельзя закрыть»)
        return '<em>Что нужно знать<i class="know-x" role="button" tabindex="0" aria-label="Свернуть" ' +
            'onclick="pftScKnow()">✕</i></em>' +
            rows.map(function (r) { return '<span>' + r + '</span>'; }).join('');
    }
    // ---- вид карточки тикета «Старта»: Сделка / Стакан / Сплит ----
    // (владелец 2026-07-23): стакан приходит прямо в карточку, сплит
    // раздваивает её на стакан + заявку и поджимает герой слева
    function scnTktView() {
        var v = stageObj().layers.tktView;
        return v === 'depth' || v === 'split' ? v : 'deal';
    }
    function scnTktTabsHtml() {
        // сегмент, как «Купить/Продать» ниже (владелец 2026-07-24: слова
        // через дробь не читались кнопками — было непонятно, что жмётся)
        var v = scnTktView();
        function tb(k, lab, cls) {
            return '<b class="tt' + cls + (v === k ? ' on' : '') + '" role="tab" tabindex="0" ' +
                'aria-selected="' + (v === k) + '" onclick="pftScTkt(\'' + k + '\')">' + lab + '</b>';
        }
        return '<span class="tkt-tabs" role="tablist">' + tb('deal', 'Сделка', '') +
            tb('depth', 'Стакан', ' grn') + tb('split', 'Сплит', '') + '</span>';
    }
    window.pftScTkt = function (k) {
        var o = stageObj();
        if (RP && k !== 'deal') { toast('В реплее стакана нет — только цена плёнки', true); return; }
        if (scnTktView() === k) return;
        o.layers.tktView = k;
        saveStageRaw(o);
        // класс и атрибут — ДО перерисовки: ширину карточки и сжатие героя
        // ведёт CSS-transition, содержимое меняется мгновенно
        var sc = dq('btScene');
        if (sc) sc.setAttribute('data-tkt', k);
        var el = dq('btScnTicket');
        if (el) el.classList.toggle('tkt-x2', k === 'split');
        scnTicketRedraw(sxSlot());
    };
    function scnTicketHtml(n) {
        var s = S(n), buy = s.side !== 'sell';
        var vw = RP ? 'deal' : scnTktView();   // в реплее только «Сделка»
        var head = '<div class="tkt-h">' + scnTktTabsHtml() +
            '<span class="freshw" id="btScnFresh">' + scnFreshInner() + '</span></div>';
        // стакан на всю карточку — глубже плоскости «Разгона»: высота позволяет
        if (vw === 'depth') {
            return head + '<div class="tkt-depth" id="btScnTkDepth" onmouseover="pftScDepthHov(event)" ' +
                'onmouseleave="pftScDepthHovOff()">' + scnDepthHtml(s, 1, scnDepthDeep()) + '</div>';
        }
        // облигации ПУЩЕНЫ в тикет (владелец 2026-07-23): вся сцена живёт в
        // рублях (bondKOf на границах данных), НКД уже в расчёте simpleBuyCalc/
        // simpleSellCalc (aci за штуку) — «спишется» честно включает купон.
        // Единицы на живом счёте всё же сверить при первой реальной сделке.
        // «свободно» живёт у поля суммы (решение набора). Обёртка с id всегда
        // на месте: деньги приходят ПОЗЖЕ первого рендера (pollPos), и без неё
        // подпись не появлялась бы до полной перерисовки сцены
        var cap = buy ? '<span class="fld-cap" id="btScnCap">' + scnCapInner() + '</span>' : '';
        var have = haveQty(s);
        var unit = unitOf(s);
        var uTxt = unit === 'rub' ? '₽'
            : (buy ? 'шт · лот ' + ((s.meta && s.meta.lot) || 1) : 'шт из ' + have.toLocaleString('ru-RU'));
        // блок заявки един на всех ступенях как на «Контроле» (владелец
        // 2026-07-23): строка цены «По рынку ⇄ лимит» со значением на глазах
        // и защита позиции; линии на графике ведёт scnKProt — одна сущность
        var priceRow = '<div class="fld fld-p" id="btScnPx">' + scnPriceRowInner(n) + '</div>';
        // защита позиции — про живые стоп-заявки брокера: в реплее её нет
        var protRow = RP ? '' :
            '<div class="fld fld-p" id="btScnProt"><em>Защита позиции</em>' + scnProtInner(n) + '</div>';
        var deal = head +
            '<div class="seg">' +
                '<span class="' + (buy ? 'on' : '') + '" role="button" tabindex="0" onclick="pftSxSide(\'buy\')">Купить</span>' +
                '<span class="' + (buy ? '' : 'on sell') + '" role="button" tabindex="0" onclick="pftSxSide(\'sell\')">Продать</span></div>' +
            '<div class="eg-bannerw" id="btScnStale">' + scnStaleInner(n) + '</div>' +
            priceRow +
            '<div class="fld" id="btScnFld"><em>' + (unit === 'rub' ? 'Сумма' : 'Количество') + cap + '</em>' +
                '<div class="fld-in"><input id="btSxSum" type="text" inputmode="numeric" autocomplete="off" ' +
                    'spellcheck="false" value="' + esc(simpleSum) + '" placeholder="0" ' +
                    'aria-label="' + (unit === 'rub' ? 'Сумма в рублях' : 'Количество бумаг') + '">' +
                '<u>' + uTxt + '</u>' +
                '<span class="fld-sw" role="button" tabindex="0" onclick="pftScUnit()">' +
                    (unit === 'rub' ? 'в лотах ⇄' : 'в рублях ⇄') + '</span></div></div>' +
            '<div class="presets" id="btScnPre">' + scnPresetsHtml(n) + '</div>' +
            '<div class="apx" id="btScnApx">' + scnApxHtml(n) + '</div>' +
            '<div class="apx" id="btScnAvg">' + scnAvgHtml(n) + '</div>' +
            protRow +
            '<div class="warn" id="btScnWarn">' + scnWarnHtml(n) + '</div>' +
            '<div class="tkt-space"></div>' +
            // «что нужно знать» — тихая строка-ссылка на всех ступенях
            // (середину колонки заняли строки цены и защиты, как на «Контроле»)
            (scnKnowOpen
                ? '<div class="knowx" id="btScnKnow">' + scnKnowHtml(n) + '</div>'
                : '<div class="know">🛈 Что нужно знать перед ' + (buy ? 'покупкой' : 'продажей') +
                  '<u role="button" tabindex="0" onclick="pftScKnow()">Открыть</u></div>') +
            '<div class="rest" id="btScnRest">' + scnRestHtml(n) + '</div>' +
            '<div class="ctaw" id="btScnCta">' + scnCtaHtml(n) + '</div>';
        // сплит: карточка раздваивается — стакан слева, заявка справа;
        // ширину контейнера и сжатие героя анимирует CSS (data-tkt на сцене)
        if (vw === 'split') {
            return '<div class="tkt-sub tkt-sub-depth"><div class="tkt-depth" id="btScnTkDepth" ' +
                    'onmouseover="pftScDepthHov(event)" onmouseleave="pftScDepthHovOff()">' +
                    scnDepthHtml(s, 0, scnDepthDeep()) + '</div></div>' +
                '<div class="tkt-sub tkt-sub-deal">' + deal + '</div>';
        }
        return deal;
    }

    // ---- полоса позиций: чипы вместо таблицы (мокап 03, пины 6–7) ----
    var scnClosesTs = 0;
    // цены закрытия для дневной дельты чипов — одним запросом на все позиции
    function scnFetchCloses(list) {
        if (!list || !list.length || Date.now() - scnClosesTs < 60000) return;
        scnClosesTs = Date.now();
        var ins = [];
        list.slice(0, 40).forEach(function (p) { if (p.uid) ins.push({ instrumentId: p.uid }); });
        if (!ins.length) return;
        A().call('GetClosePrices', { instruments: ins }, { interactive: false }).then(function (d) {
            var q2n = A().q2n, map = {};
            ((d && d.closePrices) || []).forEach(function (x) {
                var uid = x.instrumentUid || x.figi, px = q2n(x.price);
                if (uid && px > 0) map[uid] = px;
            });
            T.closes = map;
            sxTick();
        }).catch(function () { /* тихо: чипы просто без дневной дельты */ });
    }
    var POS_CHIPS = 5;
    function scnPosInner() {
        var list = T.port.list || [];
        var nOrd = T.orders.length + T.stops.length;
        // полоса — свёрнутое состояние ростка (вариант А): ряд пилюль-ручек
        // (раунд 3, мокап 03 понравился владельцу) раскрывает панель вверх
        // сразу на нужной вкладке; повторный клик по активной — закрывает
        var open = !!stageObj().layers.deck;
        // итог портфеля живёт в пилюле «Позиции» (владелец 2026-07-23:
        // одинокая сумма у правого нижнего угла смотрелась не к месту)
        var val = portValue();
        function pill(k, lab2, extra, title) {
            var on = open && dockTab === k;
            return '<button type="button" class="ps-pill' + (on ? ' on' : '') + '" ' +
                'aria-expanded="' + on + '" title="' + title + '" ' +
                'onclick="pftScDeck(\'' + k + '\')">' + lab2 + (extra || '') + '</button>';
        }
        var pills = '<span class="ps-pills">' +
            pill('pos', 'Позиции', val != null ? ' <b>' + fmtRub(val) + '</b>' : '', 'Позиции панелью') +
            pill('orders', 'Заявки', nOrd ? ' <em>' + nOrd + '</em>' : '', 'Заявки и стопы панелью') +
            pill('hist', 'История', '', 'Исполненные сделки') +
            pill('alerts', 'Алерты', ALERTS.length ? ' <em>' + ALERTS.length + '</em>' : '', 'Подписки на цену') +
            '</span>';
        if (!list.length) {
            // позиций ещё нет, но росток должен быть достижим — полоса-минимум
            return pills + '<em class="ps-none">пока пусто</em>';
        }
        var chips = list.slice(0, POS_CHIPS).map(function (p) {
            var cl = (T.closes || {})[p.uid];
            var d = (cl > 0 && p.last > 0) ? (p.last / cl - 1) * 100 : null;
            var em = d == null ? '' :
                '<em class="' + (d >= 0 ? 'pup up' : 'pdn dn') + '">' +
                Math.abs(d).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' %</em>';
            var uid = jsArg(p.uid);
            // клик всей плитки грузит бумагу; ховер раскрывает два действия
            return '<span class="ps-chip" role="button" tabindex="0" onclick="pftScChip(\'' + uid + '\')">' +
                '<b>' + esc(p.ticker) + '</b>' + em +
                '<span class="ps-acts"><u class="act" onclick="event.stopPropagation();pftScChip(\'' + uid + '\')">в сцену</u>' +
                '<u class="act sell" onclick="event.stopPropagation();pftScChipSell(\'' + uid + '\')">продать</u></span></span>';
        }).join('');
        var more = list.length > POS_CHIPS
            ? '<button type="button" class="ps-more" onclick="pftSceneBack()" ' +
              'title="Полный разбор позиций — в «Портфелях»">ещё ' + (list.length - POS_CHIPS) + ' →</button>'
            : '';
        return pills + chips + more;
    }
    // ручка «Счёта» — своим узлом ПО ЦЕНТРУ карточки заявки (владелец
    // 2026-07-24; раньше висела в хвосте полосы позиций и к карточке не
    // привязывалась). Обёртка .ps-acctw повторяет геометрию тикета в CSS
    function scnAcctBtnHtml() {
        var free = T.pos.money;
        var acctOn = !!stageObj().layers.acct;
        return '<button type="button" class="ps-acct' + (acctOn ? ' on' : '') + '" onclick="pftScAcct()" ' +
            'title="Деньги и итог счёта">счёт' +
            (free != null ? ' <u>свободно</u> <b>' + fmtRub(free) + '</b>' : '') +
            ' <i>' + (acctOn ? '▴' : '▾') + '</i></button>';
    }
    window.pftScChip = function (uid) {
        loadInstrument(sxSlot(), uid, function () {
            simpleSum = ''; scnUnit = ''; scnLim = 0;
            if (PF.renderNoAnim) PF.renderNoAnim();
        });
    };
    // продажа с чипа: тикет открывается сразу с долями позиции — путь
    // «увидел минус → продал» в два клика (мокап 03, пин 7)
    window.pftScChipSell = function (uid) {
        loadInstrument(sxSlot(), uid, function (s) {
            s.side = 'sell'; simpleSum = ''; scnUnit = ''; scnLim = 0;
            saveSlots();
            if (PF.renderNoAnim) PF.renderNoAnim();
        });
    };

    // ================= РЕПЛЕЙ (раунд 3): песочница-тренажёр =================
    // Сцена уезжает в прошлое: настоящие пятиминутки случайной недели, будущее
    // скрыто, счёт виртуальный. Тот же тикет и та же кнопка — тренируется рука.
    // Состояние живёт ТОЛЬКО в сессии (никакого localStorage: тренировка — не
    // данные); выход одной кнопкой возвращает живую сцену нетронутой.
    var RP = null;   // {uid, rows[{t,v}], i, speed, playing, timer, money, qty, cost, fills, label, done}
    var RP_START = 1000000;
    var RP_SPEED = { 1: 1400, 5: 320, 20: 80, 50: 32 };
    function rpPx() { return RP ? RP.rows[Math.min(RP.i, RP.rows.length - 1)].v : 0; }
    window.pftScReplay = function () {
        var n = sxSlot(), s = S(n);
        if (!s.uid || !s.meta) { toast('Сначала выберите бумагу — реплей идёт по ней', true); return; }
        rpHalt();
        // случайная неделя: 60–560 дней назад, от понедельника; пятиминутки
        // брокер отдаёт максимум сутками — неделя собирается пятью запросами
        var back = 60 + Math.floor(Math.random() * 500);
        var d0 = new Date(Date.now() - back * 86400000);
        while (d0.getDay() !== 1) d0 = new Date(d0.getTime() - 86400000);
        d0.setHours(3, 0, 0, 0);
        var days = [];
        for (var k = 0; k < 5; k++) days.push(new Date(d0.getTime() + k * 86400000));
        toast('Собираем плёнку недели…');
        var uid = s.uid, bk = bondK(s), q2n = A().q2n;
        var chain = Promise.resolve([]);
        days.forEach(function (day) {
            chain = chain.then(function (acc) {
                return A().call('GetCandles', {
                    instrumentId: uid,
                    from: day.toISOString(),
                    to: new Date(day.getTime() + 86400000).toISOString(),
                    interval: 'CANDLE_INTERVAL_5_MIN'
                }, { interactive: false }).then(function (d) {
                    return acc.concat(((d && d.candles) || []).map(function (c) {
                        // полный OHLC: плёнка рисуется свечами (владелец 2026-07-24)
                        return { t: Date.parse(c.time), v: q2n(c.close) * bk,
                                 o: q2n(c.open) * bk, h: q2n(c.high) * bk, l: q2n(c.low) * bk };
                    }).filter(function (x) { return x.t && x.v > 0; }));
                }, function () { return acc; });
            });
        });
        chain.then(function (rows) {
            if (S(sxSlot()).uid !== uid) return;   // бумагу уже сменили
            if (rows.length < 60) {
                toast('За выпавшую неделю плёнки не нашлось — попробуйте ещё раз', true);
                return;
            }
            scnKDispose();   // движок свечей в реплее не участвует
            var lbl = days[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' — ' +
                days[4].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
            // старт — с интро-карточки на паузе (владелец 2026-07-24: «не понял,
            // что даёт режим» — тренажёр обязан представиться до первой свечи)
            rows.sort(function (a, b) { return a.t - b.t; });   // страховка порядка
            RP = { uid: uid, rows: rows, i: Math.min(24, rows.length - 1), speed: 5, playing: false,
                   timer: null, money: RP_START, qty: 0, cost: 0, fills: [], label: lbl,
                   done: false, intro: true };
            rpBuckets();   // сетка получасовых свечей плёнки — один раз
            rpRun();
            if (PF.renderNoAnim) PF.renderNoAnim();
        });
    };
    // интро и итог живут в одном узле-вуали (btScnRpDone)
    window.pftScRpGo = function () {
        if (!RP) return;
        RP.intro = false; RP.playing = true;
        scnSet('btScnRpDone', rpOverHtml());
        rpBarPatch();
    };
    function rpHalt() {
        if (RP && RP.timer) clearInterval(RP.timer);
        RP = null;
    }
    window.pftScRpExit = function () {
        rpHalt();
        if (PF.renderNoAnim) PF.renderNoAnim();
    };
    window.pftScRpAgain = function () {
        if (!RP) return;
        RP.i = Math.min(24, RP.rows.length - 1);
        RP.money = RP_START; RP.qty = 0; RP.cost = 0; RP.fills = [];
        RP.done = false; RP.playing = true; RP.intro = false;
        rpRun();
        if (PF.renderNoAnim) PF.renderNoAnim();
    };
    window.pftScRpPlay = function () {
        if (!RP || RP.done) return;
        RP.playing = !RP.playing;
        RP.lastT = 0;   // после паузы догон не должен глотать плёнку скачком
        rpBarPatch();
    };
    window.pftScRpSpeed = function (k) {
        if (!RP) return;
        RP.speed = RP_SPEED[k] ? k : 5;
        rpRun();
        rpBarPatch();
    };
    function rpRun() {
        if (!RP) return;
        if (RP.timer) clearInterval(RP.timer);
        RP.lastT = 0;
        RP.timer = setInterval(rpStep, RP_SPEED[RP.speed] || 320);
    }
    function rpStep() {
        if (!RP || !RP.playing || RP.done) return;
        if (!sceneLive() || document.visibilityState !== 'visible') { RP.lastT = 0; return; }   // плёнка ждёт зрителя
        // темп — по настенным часам: браузер душит таймеры фоновых вкладок до
        // секунды, без догона ×50 полз бы как ×1 (найдено на прогоне 2026-07-24)
        var ms = RP_SPEED[RP.speed] || 320;
        var now = Date.now(), n = 1;
        if (RP.lastT) n = Math.max(1, Math.min(60, Math.round((now - RP.lastT) / ms)));
        RP.lastT = now;
        RP.i += n;
        if (RP.i >= RP.rows.length - 1) {
            RP.i = RP.rows.length - 1;
            RP.done = true; RP.playing = false;
            scnSet('btScnRpDone', rpOverHtml());
        }
        var s = S(sxSlot());
        scnSet('btScnChart', rpChartHtml(s));
        scnSet('btScnPrice', scnPriceHtml(s));
        scnSet('btScnFresh', scnFreshInner());
        scnTicketBits();
        rpBarPatch();
    }
    // покупка/продажа в реплее: исполняется мгновенно по цене плёнки, деньги
    // виртуальные — но комиссия и лотность считаются как настоящие (scnCalc)
    function rpTrade(n, c, buy) {
        if (!RP || RP.done) return;
        if (buy) {
            RP.money -= c.total;
            RP.cost += c.px * c.qty;
            RP.qty += c.qty;
        } else {
            RP.money += c.total;
            var avg = RP.qty > 0 ? RP.cost / RP.qty : c.px;
            RP.cost = Math.max(0, RP.cost - avg * c.qty);
            RP.qty = Math.max(0, RP.qty - c.qty);
        }
        RP.fills.push({ i: RP.i, px: c.px, qty: c.qty, buy: buy });
        simpleSum = '';
        var inp = dq('btSxSum'); if (inp) inp.value = '';
        rpFlash(buy, c, S(n));
        sxTick();
        rpBarPatch();
    }
    // квитанция сделки плёнки — крупной карточкой над графиком (владелец
    // 2026-07-24: тост снизу «вообще непонятно и не видно»)
    function rpFlash(buy, c, s) {
        var sc = dq('btScene');
        if (!sc) return;
        var el = dq('btScnRpFlash');
        if (!el) {
            el = document.createElement('div');
            el.id = 'btScnRpFlash';
            sc.appendChild(el);
        }
        el.className = 'rp-flash ' + (buy ? 'b' : 's');
        el.innerHTML = '<i>' + (buy ? '▲' : '▼') + '</i><span><b>' +
            (buy ? 'Куплено' : 'Продано') + ' ' + c.qty.toLocaleString('ru-RU') + ' шт × ' +
            fmtPx(c.px, s) + ' ₽</b><em>' + (buy ? 'списано ' : 'на счёт ') + fmtKop(c.total) +
            ' · комиссия настоящая, деньги виртуальные</em></span>';
        el.classList.remove('show');
        void el.offsetWidth;   // рестарт анимации
        el.classList.add('show');
        clearTimeout(rpFlash._t);
        rpFlash._t = setTimeout(function () { el.classList.remove('show'); }, 3200);
    }
    // итог: свой результат против «просто держал бумагу всю неделю»
    function rpEquity() { return RP ? RP.money + RP.qty * rpPx() : 0; }
    // вуаль поверх сцены: интро при входе, итог в конце недели
    function rpOverHtml() {
        if (!RP) return '';
        if (RP.intro) return rpIntroHtml();
        return rpDoneHtml();
    }
    function rpIntroHtml() {
        return '<div class="rp-veil"></div><div class="rp-done rp-hello">' +
            '<h4>Реплей · ' + esc(RP.label) + '</h4>' +
            '<p>Тренажёр на настоящей истории: сцена уехала в случайную неделю прошлого. ' +
            'Свечи приходят в темпе плёнки, будущее скрыто. Счёт виртуальный — <b>' +
            fmtRub(RP_START) + '</b>, но комиссия и лоты настоящие.</p>' +
            '<div class="rp-how">' +
            '<span><i>1</i>Смотрите плёнку — скорость ×1…×50 на планке снизу</span>' +
            '<span><i>2</i>Увидели момент — жмите <b>❚❚ паузу</b> и делайте сделку той же кнопкой тикета: тренируются и <b>покупка</b>, и <b>продажа</b></span>' +
            '<span><i>3</i>Снова <b>▶</b> — плёнка покажет, чем обернулось; результат считается онлайн на планке</span>' +
            '</div>' +
            '<p><em>в конце недели — итог против «просто держать бумагу»</em></p>' +
            '<div class="rp-row">' +
            '<button type="button" class="ub pri" onclick="pftScRpGo()">Поехали</button>' +
            '<button type="button" class="ub gh" onclick="pftScReplay()">Другая неделя</button>' +
            '<button type="button" class="ub gh" onclick="pftScRpExit()">Выйти</button>' +
            '</div></div>';
    }
    function rpDoneHtml() {
        if (!RP || !RP.done) return '';
        var res = (rpEquity() / RP_START - 1) * 100;
        var hold = (RP.rows[RP.rows.length - 1].v / RP.rows[0].v - 1) * 100;
        function pctTxt(v) {
            return (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' %';
        }
        return '<div class="rp-veil"></div><div class="rp-done">' +
            '<h4>Неделя пройдена</h4>' +
            '<p>' + RP.fills.length + ' ' + PF.plural(RP.fills.length, 'сделка', 'сделки', 'сделок') +
            ' · ваш результат <b class="' + (res >= 0 ? 'g' : 'r') + '">' + pctTxt(res) + '</b><br>' +
            'если бы просто держали бумагу — <b>' + pctTxt(hold) + '</b><br>' +
            '<em>комиссии учтены как настоящие · деньги виртуальные</em></p>' +
            '<div class="rp-row">' +
            '<button type="button" class="ub pri" onclick="pftScRpAgain()">Ещё раз эту неделю</button>' +
            '<button type="button" class="ub gh" onclick="pftScReplay()">Другая неделя</button>' +
            '<button type="button" class="ub gh" onclick="pftScRpExit()">Выйти</button>' +
            '</div></div>';
    }
    // сетка плёнки: пятиминутки складываются в ПОЛУЧАСОВЫЕ свечи (владелец
    // 2026-07-24: «в реплее нужны свечи, а не линия»). Ординаты корзин — один
    // раз на плёнку: released-часть растёт по ним слева направо, будущие
    // корзины держат место (будущее скрыто, но ось не прыгает)
    var RP_BSTEP = 30 * 60000;
    function rpBuckets() {
        if (!RP) return;
        var map = {}, ord = 0;
        RP.rows.forEach(function (r) {
            var k = Math.floor(r.t / RP_BSTEP);
            if (!(k in map)) map[k] = ord++;
        });
        RP.bmap = map;
        RP.totalB = ord;
    }
    function rpBucketX(t) { return RP.bmap[Math.floor(t / RP_BSTEP)] || 0; }
    // плёнка: получасовые свечи released-части своим svg (движок ни при чём);
    // последняя свеча дорастает на глазах с каждой пятиминуткой
    function rpChartHtml(s) {
        if (!RP) return '';
        var rows = RP.rows, i = RP.i;
        var W = 1000, H = 520;
        var min = Infinity, max = -Infinity;
        // масштаб — по УЖЕ ПОКАЗАННОЙ части: будущее не подглядывает даже осью
        for (var k = 0; k <= i; k++) {
            if (rows[k].l > 0 && rows[k].l < min) min = rows[k].l;
            if (rows[k].h > max) max = rows[k].h;
            if (rows[k].v < min) min = rows[k].v;
            if (rows[k].v > max) max = rows[k].v;
        }
        if (!(max > min)) max = min + 0.01;
        var span0 = max - min;
        min -= span0 * 0.08; max += span0 * 0.08;
        var span = max - min;
        var totalB = Math.max(2, RP.totalB || 2);
        var bw = W / totalB;                         // шаг корзины
        var cw = Math.max(3, bw * 0.62);             // тело свечи
        function XB(b) { return b * bw + bw / 2; }   // центр корзины
        function Y(v) { return H - (v - min) / span * H; }
        // released-часть → свечи корзин
        var buckets = [];
        var cur = null, curKey = null;
        for (var k3 = 0; k3 <= i; k3++) {
            var r = rows[k3], bk2 = Math.floor(r.t / RP_BSTEP);
            if (bk2 !== curKey) {
                curKey = bk2;
                cur = { b: RP.bmap[bk2] || 0, o: r.o || r.v, h: r.h || r.v, l: r.l || r.v, c: r.v };
                buckets.push(cur);
            } else {
                if ((r.h || r.v) > cur.h) cur.h = r.h || r.v;
                if ((r.l || r.v) < cur.l && (r.l || r.v) > 0) cur.l = r.l || r.v;
                cur.c = r.v;
            }
        }
        var cnds = '';
        buckets.forEach(function (b) {
            var up = b.c >= b.o;
            var x = XB(b.b), yO = Y(b.o), yC = Y(b.c);
            var top = Math.min(yO, yC), hh = Math.max(1.6, Math.abs(yO - yC));
            cnds += '<line x1="' + x.toFixed(1) + '" y1="' + Y(b.h).toFixed(1) + '" x2="' + x.toFixed(1) +
                '" y2="' + Y(b.l).toFixed(1) + '" class="rp-wick ' + (up ? 'g' : 'r') + '"/>' +
                '<rect x="' + (x - cw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + cw.toFixed(1) +
                '" height="' + hh.toFixed(1) + '" class="rp-cnd ' + (up ? 'g' : 'r') + '"/>';
        });
        var nowX = XB(rpBucketX(rows[i].t));
        var marks = '';
        RP.fills.forEach(function (f) {
            marks += '<circle cx="' + XB(rpBucketX(rows[f.i].t)).toFixed(1) + '" cy="' + Y(f.px).toFixed(1) +
                '" r="5" class="rp-fill ' + (f.buy ? 'g' : 'r') + '"/>';
        });
        var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" ' +
            'aria-label="Плёнка реплея">' +
            '<line x1="' + nowX.toFixed(1) + '" y1="0" x2="' + nowX.toFixed(1) + '" y2="' + H + '" class="rp-now"/>' +
            cnds + marks +
        '</svg>';
        var ptag = '<span class="ptag" style="top:' +
            Math.min(97, Math.max(2, (max - rpPx()) / span * 100)).toFixed(1) + '%">' + fmtPx(rpPx(), s) + '</span>';
        var voidNote = i < rows.length - 6
            ? '<span class="rp-void" style="left:' + Math.min(86, nowX / W * 100 + 4).toFixed(1) + '%">' +
              'будущее скрыто — свечи приходят в темпе плёнки</span>'
            : '';
        var dts = '';
        for (var k4 = 0; k4 < 5; k4++) {
            var idx = Math.round(k4 * (rows.length - 1) / 4);
            dts += '<span>' + new Date(rows[idx].t).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }) + '</span>';
        }
        return '<div class="bts-canvas">' + svg + ptag + voidNote + '</div><div class="ax-dates">' + dts + '</div>';
    }
    // плёнка-бар: play/пауза, скорость, прогресс, выход — низ сцены вместо
    // полосы позиций (позиции и счёт в реплее — виртуальные, живой брокер спит)
    function rpBarHtml() {
        if (!RP) return '';
        var pct = Math.round(RP.i / (RP.rows.length - 1) * 100);
        function sp(k) {
            return '<span class="' + (RP.speed === k ? 'on' : '') + '" role="button" tabindex="0" ' +
                'onclick="pftScRpSpeed(' + k + ')">×' + k + '</span>';
        }
        // результат — онлайн, деньгами И процентом (владелец 2026-07-24)
        var pnlRub = rpEquity() - RP_START;
        var pnl = pnlRub / RP_START * 100;
        var sgn = pnlRub >= 0 ? '+' : '−';
        return '<button type="button" class="rp-play" onclick="pftScRpPlay()" ' +
                'aria-label="' + (RP.playing ? 'Пауза' : 'Дальше') + '">' + (RP.playing ? '❚❚' : '▶') + '</button>' +
            '<span class="rp-sp">' + sp(1) + sp(5) + sp(20) + sp(50) + '</span>' +
            '<span class="rp-tl"><i style="width:' + pct + '%"></i></span>' +
            '<span class="rp-info">счёт <b>' + fmtRub(rpEquity()) + '</b>' +
                '<u class="rp-res ' + (pnlRub >= 0 ? 'g' : 'r') + '">' + sgn + fmtRub(Math.abs(pnlRub)) +
                ' · ' + sgn + Math.abs(pnl).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' %</u></span>' +
            '<span class="rp-dt">' + esc(RP.label) + '</span>' +
            '<button type="button" class="rp-exit" onclick="pftScRpExit()">выйти из реплея</button>';
    }
    function rpBarPatch() {
        scnSet('btScnRp', rpBarHtml());
    }

    // ---- полоса избранного (раунд 3): рейка на F, бумаги на цифрах 1–9 ----
    // Тот же стор, что у «Избранного» Портфелей и «Рынка» (stk_fav_v1):
    // звезда, поставленная где угодно, сразу видна и здесь. Цены и
    // спарклайны — дневки MOEX ISS, как у виджета «Избранное».
    function wlList() {
        try {
            return (typeof window.stkGetFavorites === 'function')
                ? window.stkGetFavorites()
                : (JSON.parse(localStorage.getItem('stk_fav_v1')) || []);
        } catch (e) { return []; }
    }
    function wlOn() { return !!stageObj().layers.wl; }
    // рейка двигает левый край героя (CSS-transition): движку свечей нужен
    // resize ПОСЛЕ переезда, иначе холст остаётся сдвинутым (владелец
    // 2026-07-24, скрин со смещённым графиком)
    function scnKResizeSoon() {
        clearTimeout(scnKResizeSoon._t);
        scnKResizeSoon._t = setTimeout(function () {
            try { if (K.chart) { K.chart.resize(); scnKTags(); scnKProfile(); scnKCmp(); } } catch (e) {}
        }, 520);
    }
    // закрытие — ТОЛЬКО кликом вне рейки (владелец 2026-07-24: выбор бумаги
    // рейку не сворачивает — листать избранное можно подряд)
    function wlOutside(e) {
        if (!wlOn()) { document.removeEventListener('click', wlOutside, true); return; }
        var t = e.target;
        if (t && t.closest && (t.closest('#btScnWl') || t.closest('.bts-wlb'))) return;
        document.removeEventListener('click', wlOutside, true);
        var o = stageObj();
        o.layers.wl = 0;
        saveStageRaw(o);
        if (PF.renderNoAnim) PF.renderNoAnim();
        scnKResizeSoon();
    }
    window.pftScWl = function () {
        var o = stageObj();
        o.layers.wl = o.layers.wl ? 0 : 1;
        saveStageRaw(o);
        document.removeEventListener('click', wlOutside, true);
        if (o.layers.wl) {
            // capture: клики по холсту глушатся движком — снаружи всё равно услышим
            setTimeout(function () { document.addEventListener('click', wlOutside, true); }, 0);
        }
        if (PF.renderNoAnim) PF.renderNoAnim();
        scnKResizeSoon();
    };
    var wlData = {};   // ticker -> {last, d, closes[]} | 'busy' | 'err'
    var wlUid = {};    // ticker -> uid брокера (для загрузки в сцену)
    function wlLoad(tk) {
        if (wlData[tk]) return;
        wlData[tk] = 'busy';
        var from = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
        fetch('https://iss.moex.com/iss/engines/stock/markets/shares/securities/' + encodeURIComponent(tk) +
            '/candles.json?iss.meta=off&interval=24&from=' + from, { credentials: 'omit' })
            .then(function (r) { if (!r.ok) throw 0; return r.json(); })
            .then(function (j) {
                var cd = j && j.candles, cols = (cd && cd.columns) || [], data = (cd && cd.data) || [];
                var iC = cols.indexOf('close');
                var closes = iC < 0 ? [] : data.map(function (r2) { return +r2[iC] || 0; })
                    .filter(function (v) { return v > 0; });
                if (closes.length < 2) { wlData[tk] = 'err'; wlPaint(); return; }
                wlData[tk] = {
                    last: closes[closes.length - 1],
                    d: (closes[closes.length - 1] / closes[closes.length - 2] - 1) * 100,
                    closes: closes.slice(-30)
                };
                wlPaint();
            }, function () { wlData[tk] = 'err'; wlPaint(); })
            .catch(function () { wlData[tk] = 'err'; wlPaint(); });
    }
    function wlSpark(closes, up) {
        var W = 46, H = 20;
        var min = Math.min.apply(null, closes), max = Math.max.apply(null, closes);
        var span = (max - min) || 1;
        var pts = closes.map(function (v, i) {
            return (i * W / (closes.length - 1)).toFixed(1) + ',' +
                (H - 2 - (v - min) / span * (H - 4)).toFixed(1);
        }).join(' ');
        return '<svg class="wl-sp" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
            '<polyline points="' + pts + '" class="' + (up ? 'g' : 'r') + '"/></svg>';
    }
    function scnWlHtml() {
        if (!wlOn()) return '';
        var favs = wlList().slice(0, 9);
        var s = S(sxSlot());
        var head = '<div class="wl-h"><b>Избранное</b><kbd>F</kbd>' +
            '<button type="button" class="wl-x" onclick="pftScWl()" aria-label="Свернуть полосу">✕</button></div>';
        if (!favs.length) {
            return head + '<div class="wl-none">Пока пусто. Жмите звезду ☆ у имени бумаги в сцене ' +
                '(или на «Рынке» и в «Избранном» Портфелей) — бумаги появятся здесь и получат клавиши 1–9.</div>';
        }
        var rows = favs.map(function (tk, i) {
            wlLoad(tk);
            var d = wlData[tk];
            var nm = '';
            try { var c = window.stkFindCompany && window.stkFindCompany(tk); nm = (c && (c.name || c['Компания'])) || ''; } catch (e) {}
            var on = s.meta && s.meta.ticker === tk;
            var right = '';
            if (d && d !== 'busy' && d !== 'err') {
                var up = d.d >= 0;
                right = wlSpark(d.closes, up) +
                    '<span class="pd"><b>' + d.last.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + '</b>' +
                    '<i class="' + (up ? 'g' : 'r') + '">' + (up ? '+' : '−') +
                    Math.abs(d.d).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' %</i></span>';
            } else if (d === 'err') right = '<span class="pd"><i>—</i></span>';
            return '<div class="wl-r' + (on ? ' on' : '') + '" role="button" tabindex="0" ' +
                'onclick="pftScWlGo(\'' + jsArg(tk) + '\')" title="В сцену — клавиша ' + (i + 1) + '">' +
                '<kbd>' + (i + 1) + '</kbd>' +
                '<span class="tk"><b>' + esc(tk) + '</b>' + (nm ? '<em>' + esc(nm) + '</em>' : '') + '</span>' +
                right + '</div>';
        }).join('');
        return head + rows +
            '<div class="wl-ft">звезда ☆ у имени бумаги добавляет её сюда · клавиши 1–9 работают и при закрытой рейке</div>';
    }
    // звезда в шапке бумаги: тумблер того же стора stk_fav_v1 (через терминал
    // «Рынка», если он уже загружен — его state не должен разъехаться)
    window.pftScFavTgl = function () {
        var s = S(sxSlot()), tk = s.meta && s.meta.ticker;
        if (!tk) return;
        var on;
        if (typeof window.stkToggleFav === 'function') on = window.stkToggleFav(tk);
        else {
            var list = wlList(), at = list.indexOf(tk);
            if (at === -1) { list.push(tk); on = true; }
            else { list.splice(at, 1); on = false; }
            try { localStorage.setItem('stk_fav_v1', JSON.stringify(list)); } catch (e) {}
        }
        toast(on ? tk + ' — в «Избранном»: рейка F, клавиши 1–9, Портфели и «Рынок»'
                 : tk + ' убрана из «Избранного»');
        scnSet('btScnHead', scnHeadHtml(s));
        wlPaint();
    };
    function wlPaint() {
        if (sceneLive()) scnSet('btScnWl', scnWlHtml());
    }
    // клик или цифра: тикер превращается в uid брокера один раз, дальше кэш
    window.pftScWlGo = function (tk) {
        function go(uid) {
            loadInstrument(sxSlot(), uid, function () {
                simpleSum = ''; scnUnit = ''; scnLim = 0;
                scnActive = sxSlot();
                // рейка ОСТАЁТСЯ (владелец 2026-07-24: листать избранное можно
                // подряд; закрывает только клик вне рейки — wlOutside)
                if (PF.renderNoAnim) PF.renderNoAnim();
                scnKResizeSoon();   // смена бумаги при открытой рейке: холст по месту
            });
        }
        if (wlUid[tk]) { go(wlUid[tk]); return; }
        PF.pftFindInstruments(tk).then(function (list) {
            var hit = null;
            (list || []).forEach(function (p) {
                if (!hit && String(p.ticker).toUpperCase() === String(tk).toUpperCase()) hit = p;
            });
            hit = hit || (list && list[0]);
            if (!hit || !hit.uid) { toast('Бумага ' + tk + ' у брокера не нашлась', true); return; }
            wlUid[tk] = hit.uid;
            go(hit.uid);
        }).catch(function () { toast('Бумага ' + tk + ' у брокера не нашлась', true); });
    };

    var scnFindTarget = 0;   // слот, куда поиск положит бумагу (0 = активный)
    // свечи — дефолт сцены; линия остаётся по тумблеру
    function candlesOn() {
        return stageObj().layers.candles !== 0;
    }
    window.pftScMode = function (candles) {
        var o = stageObj();
        o.layers.candles = candles ? 1 : 0;
        saveStageRaw(o);
        if (PF.renderNoAnim) PF.renderNoAnim();
    };
    // ---- свечи сцены: KLineChart (движок и патчи — экспорт portfolios-chart) ----
    var K = { chart: null, host: null, uid: null, perKey: '', liveCb: null, timer: null, ro: null };
    var SCN_PER = {
        day: { type: 'minute', span: 15 }, week: { type: 'hour', span: 1 },
        month: { type: 'day', span: 1 }, year: { type: 'day', span: 1 }, all: { type: 'week', span: 1 }
    };
    var SCN_LIVE = { day: 15000, week: 30000, month: 60000, year: 60000, all: 60000 };
    function decOf(step) {
        var s = String(step || 0.01), i = s.indexOf('.');
        return i < 0 ? 0 : Math.min(9, s.length - i - 1);
    }
    // стили движка — от ТОКЕНОВ СЦЕНЫ (не темы сайта): рост — заливка,
    // падение — полый контур (candle_down_stroke), два носителя смысла
    function scnKStyles() {
        var nightMode = sceneNight();
        var up = nightMode ? '#34d399' : '#16a34a', down = nightMode ? '#f87171' : '#dc2626';
        var txt = nightMode ? '#5e6c84' : '#94a3b8';
        var grid = nightMode ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)';
        var line = nightMode ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)';
        var chipBg = nightMode ? '#e9eef8' : '#0f172a';
        return {
            grid: { horizontal: { color: grid }, vertical: { color: grid } },
            candle: {
                type: 'candle_down_stroke',
                bar: {
                    upColor: up, downColor: down, noChangeColor: txt,
                    upBorderColor: up, downBorderColor: down, noChangeBorderColor: txt,
                    upWickColor: up, downWickColor: down, noChangeWickColor: txt
                },
                priceMark: {
                    high: { color: txt }, low: { color: txt },
                    // ярлык последней цены у движка СКРЫТ: цену несут ДВЕ
                    // DOM-плашки по краям (слева светлая, справа акцентная —
                    // владелец 2026-07-23, scnKTags); линия движка остаётся
                    last: { upColor: up, downColor: down, noChangeColor: txt,
                        line: { show: true }, text: { show: false } }
                },
                // легенда движка ВЫКЛЮЧЕНА (владелец 2026-07-23: rect-плашка
                // движка прыгала на сторону, противоположную курсору, а нужна
                // ТОЛЬКО слева вверху — это не настраивается). ОHLC-карточку
                // рисует DOM-слой #btScnOhlc из onCrosshairChange (scnKOhlc)
                tooltip: { showRule: 'none' }
            },
            indicator: {
                // легенды индикаторов движок и так держит слева у своих панелей
                tooltip: { showRule: 'follow_cross',
                    legend: { color: nightMode ? '#e9eef8' : '#0f172a', size: 11.5 } },
                ohlc: { upColor: up, downColor: down, noChangeColor: txt },
                bars: [{ upColor: 'rgba(22,163,74,0.45)', downColor: 'rgba(220,38,38,0.45)', noChangeColor: txt }],
                lines: [{ color: nightMode ? '#7c8cff' : '#4453ef' }]
            },
            xAxis: { axisLine: { color: line }, tickLine: { color: line }, tickText: { color: txt } },
            // ось цены и кроссхейр — на ВСЕХ ступенях (владелец 2026-07-23
            // поверх мокапов 03/04: изначально были слоями «Контроля»);
            // сторона оси — scnAxisPos: слева на «Старте»/«Разгоне»
            yAxis: { show: true,
                axisLine: { color: line }, tickLine: { color: line }, tickText: { color: txt } },
            separator: { color: line },
            // чип цены кроссхейра НА ОСИ (слева) — светлый; противоположную
            // сторону дорисовывает DOM-плашка scnKCross (справа — акцент).
            // Геометрия чипа = геометрия DOM-плашек .px-tag: один размер
            // линии кроссхейра — пунктир полутоном (владелец 2026-07-23:
            // сплошные линии мешали читать цифры легенды)
            crosshair: { show: true,
                horizontal: { line: { style: 'dashed', dashedValue: [3, 4],
                    color: nightMode ? 'rgba(147,161,184,0.45)' : 'rgba(100,116,139,0.45)' }, text:
                    { backgroundColor: nightMode ? '#121722' : '#ffffff',
                        color: nightMode ? '#e9eef8' : '#0f172a',
                        borderColor: nightMode ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.14)',
                        borderSize: 1, size: 11, borderRadius: 6,
                        paddingLeft: 7, paddingRight: 7, paddingTop: 4, paddingBottom: 4 } },
                vertical: { line: { style: 'dashed', dashedValue: [3, 4],
                    color: nightMode ? 'rgba(147,161,184,0.45)' : 'rgba(100,116,139,0.45)' },
                    text: { backgroundColor: chipBg } }
            }
        };
    }
    // ось цены слева: правый край холста занят тикетом
    function scnAxisPos() { return 'left'; }
    // ЛОВУШКА движка: сторона оси задаётся ТОЛЬКО при init (layout.yAxis.
    // position); setPaneOptions мержит опцию, но виджет оси не переезжает
    // даже после resize() — проверено на живом инстансе. Поэтому смена
    // ступени с другой стороной оси пересоздаёт график целиком (редкий путь)
    function scnKDispose() {
        try { if (K.ro) K.ro.disconnect(); } catch (e) {}
        K.ro = null; K.roRaf = 0;
        if (K.timer) { clearInterval(K.timer); K.timer = null; }
        try { window.klinecharts.dispose(K.host); } catch (e) {}
        if (K.host && K.host.parentNode) K.host.parentNode.removeChild(K.host);
        K.chart = null; K.host = null; K.liveCb = null; K.lastClose = 0;
        K.uid = ''; K.perKey = ''; K.styleKey = '';
        K.fillIds = []; K.fillPts = [];   // метки исполнений умерли вместе с движком
        Object.keys(K_ORD).forEach(function (id) { delete K_ORD[id]; });
    }
    // загрузчик в модели движка v10: init отдаёт окно периода, forward — ещё
    // одно окно влево, вправо будущих свечей не существует
    function scnKLoader() {
        return {
            getBars: function (p) {
                var uid = K.uid;
                if (!uid || p.type === 'backward') { p.callback([], { forward: false, backward: false }); return; }
                var per = sxPer(), q2n = A().q2n;
                var to = p.type === 'forward' && p.timestamp ? p.timestamp : Date.now();
                var from = to - per[3] * 86400000;
                A().call('GetCandles', {
                    instrumentId: uid,
                    from: new Date(from).toISOString(),
                    to: new Date(to).toISOString(),
                    interval: per[2]
                }, { interactive: false }).then(function (d) {
                    if (uid !== K.uid) { p.callback([], { forward: false, backward: false }); return; }
                    var k = bondKUid(uid);   // облигации: % → ₽
                    var rows = ((d && d.candles) || []).map(function (c) {
                        return { timestamp: Date.parse(c.time), open: q2n(c.open) * k, high: q2n(c.high) * k,
                                 low: q2n(c.low) * k, close: q2n(c.close) * k, volume: +c.volume || 0 };
                    }).filter(function (r) { return r.timestamp && r.close > 0; });
                    if (p.type === 'forward' && p.timestamp) {
                        rows = rows.filter(function (r) { return r.timestamp < p.timestamp; });
                    }
                    p.callback(rows, { forward: rows.length > 0, backward: false });
                    // линии заявок — после первой загрузки: до неё нет ценовой шкалы
                    if (p.type === 'init') {
                        // плашки цены живут закрытием последней свечи (ровно
                        // там же, где пунктир движка) — а не ценой стакана
                        if (rows.length) { K.lastClose = rows[rows.length - 1].close; scnKTags(); }
                        scnKOrders(true);
                    }
                }, function () { p.callback([], { forward: false, backward: false }); });
            },
            subscribeBar: function (p) { K.liveCb = p.callback; scnKLive(); },
            unsubscribeBar: function () {
                K.liveCb = null;
                if (K.timer) { clearInterval(K.timer); K.timer = null; }
            }
        };
    }
    // живая последняя свеча: короткое окно тем же методом, движок сам клеит бар
    function scnKLive() {
        if (K.timer) clearInterval(K.timer);
        K.timer = setInterval(function () {
            if (!K.liveCb || !K.uid || !sceneLive() || !candlesOn() ||
                document.visibilityState !== 'visible') return;
            var per = sxPer(), q2n = A().q2n, now = Date.now();
            var span = per[0] === 'day' ? 3600000 : per[0] === 'week' ? 7200000 : 3 * 86400000;
            var uid = K.uid;
            A().call('GetCandles', {
                instrumentId: uid,
                from: new Date(now - span).toISOString(),
                to: new Date(now).toISOString(),
                interval: per[2]
            }, { interactive: false }).then(function (d) {
                if (uid !== K.uid || !K.liveCb) return;
                var cs = (d && d.candles) || [];
                var c = cs[cs.length - 1];
                if (!c) return;
                var k = bondKUid(uid);   // облигации: % → ₽
                var bar = { timestamp: Date.parse(c.time), open: q2n(c.open) * k, high: q2n(c.high) * k,
                            low: q2n(c.low) * k, close: q2n(c.close) * k, volume: +c.volume || 0 };
                if (bar.timestamp && bar.close > 0) {
                    K.liveCb(bar);
                    // плашки цены ведёт та же свеча, что и пунктир движка —
                    // и сразу, не дожидаясь тика стакана (иначе отстают)
                    K.lastClose = bar.close;
                    scnKTags();
                }
            }).catch(function () {});
        }, SCN_LIVE[sxPer()[0]] || 30000);
    }
    function scnKMount() {
        var mount = dq('btScnK');
        if (!mount || !candlesOn()) return;
        var s = S(sxSlot());
        if (!s.uid || !s.meta) return;
        // ступень сменила сторону оси — движок пересоздаётся (см. scnKDispose)
        if (K.chart && K.axisPos !== scnAxisPos()) scnKDispose();
        if (K.chart) {
            // ре-рендер собрал якорь заново: движок ПЕРЕСОЗДАЁТСЯ, а не
            // переезжает живым узлом — после appendChild инстанс молча глохнет
            // (события кроссхейра и оверлеи мертвы), владелец 2026-07-23
            if (K.host.parentNode !== mount) scnKDispose();
            else {
                // смена темы меняет стили движка (ось, кроссхейр, цвета) —
                // но не каждый тик: setStyles дорог, ключ отсекает шум
                var sk = sceneNight() ? 'n' : 'd';
                if (K.styleKey !== sk) {
                    K.styleKey = sk;
                    try { K.chart.setStyles(scnKStyles()); } catch (e) {}
                }
                scnKSync();
                scnKProt();
                return;
            }
        }
        if (!PF.pfcEngineReady) return;
        PF.pfcEngineReady().then(function (ok) {
            var m2 = dq('btScnK');
            if (!ok || !m2 || K.chart) return;
            scnKRegLevel();
            var host = document.createElement('div');
            host.className = 'bts-khost';
            m2.appendChild(host);
            var chart = window.klinecharts.init(host, {
                locale: 'ru-RU', timezone: 'Europe/Moscow', styles: scnKStyles(),
                layout: { yAxis: { position: scnAxisPos() } }
            });
            if (!chart) return;
            K.axisPos = scnAxisPos();
            if (PF.pfcZoomFix) PF.pfcZoomFix(chart);
            K.chart = chart; K.host = host;
            chart.setDataLoader(scnKLoader());
            // клик по свече кладёт её закрытие лимиткой в тикет — жест раунда 1
            chart.subscribeAction('onCandleBarClick', function (data) {
                if (data && data.close) window.pftScPickPx(data.close);
            });
            // прокрутка/зум сдвигают шкалу — ярлыки заявок и профиль едут следом
            try { chart.subscribeAction('onVisibleRangeChange', function () { scnKTags(); scnKProfile(); scnKCmp(); }); } catch (e) {}
            // плашка цены кроссхейра на стороне, противоположной оси
            try { chart.subscribeAction('onCrosshairChange', function (d) { scnKCross(d); scnKOhlc(d); scnKFillHover(d); }); } catch (e) {}
            try {
                K.ro = new ResizeObserver(function () {
                    if (K.roRaf) return;
                    K.roRaf = requestAnimationFrame(function () {
                        K.roRaf = 0;
                        try { chart.resize(); scnKTags(); } catch (e) {}
                    });
                });
                K.ro.observe(host);
            } catch (e) {}
            scnKSync(true);
            scnKApplyInds();
        });
    }
    // бумага или период сменились: дёргаем ровно то, что изменилось, и один раз
    // (setSymbol и setPeriod оба делают полный resetData — гонка двух загрузок
    // оставляла график пустым, ловушка раунда 1). У месяца и года период движка
    // одинаковый (дневки) — тогда перезагрузку форсит setSymbol той же бумаги.
    function scnKSync(fresh) {
        if (!K.chart) return;
        var s = S(sxSlot());
        if (!s.uid || !s.meta) return;
        var perKey = sxPer()[0], per = SCN_PER[perKey];
        var newSym = K.uid !== s.uid;
        var newPer = K.perKey !== perKey;
        if (!fresh && !newSym && !newPer) return;
        if (newSym) K.lastClose = 0;   // чужое закрытие не должно пережить смену бумаги
        K.uid = s.uid; K.perKey = perKey;
        try {
            var cur = K.chart.getPeriod();
            var perDiff = !cur || cur.type !== per.type || cur.span !== per.span;
            if (perDiff) K.chart.setPeriod(per);
            if (newSym || fresh || (newPer && !perDiff)) {
                K.chart.setSymbol({ ticker: s.meta.ticker, pricePrecision: decOf(s.meta.minInc), volumePrecision: 0 });
            }
        } catch (e) {}
        scnKLive();
    }
    // ---- индикаторы: кнопка у пилюль шапки, реестр в попапе двумя группами ----
    // (чипы с холста ушли — владелец 2026-07-23: «нелепо смотрелись»)
    var SCN_IND_OVER = { MA: 1, EMA: 1, BOLL: 1, SAR: 1 };
    var SCN_IND_ON_CANDLE = [
        ['MA', 'MA 20', 'скользящая средняя'],
        ['EMA', 'EMA', 'экспоненциальная средняя'],
        ['BOLL', 'Боллинджер', 'полосы волатильности'],
        // «Профиль» — не индикатор движка, а свой канвас-слой (scnKProfile):
        // горизонтальная тень у левого края — где наторговано больше всего
        ['PROFILE', 'Профиль объёма', 'где наторговано больше всего']
    ];
    var SCN_IND_PANE = [
        ['VOL', 'Объём', 'гистограмма сделок'],
        ['OBV', 'Балансовый объём', 'объём со знаком движения'],
        ['RSI', 'RSI', 'перекупленность 0–100'],
        ['MACD', 'MACD', 'схождение-расхождение средних'],
        ['KDJ', 'KDJ', 'стохастик']
    ];
    function scnInds() {
        var o = stageObj();
        if (!Array.isArray(o.layers.inds)) o.layers.inds = ['VOL', 'MA'];
        return o.layers.inds;
    }
    function scnIndBtnHtml() {
        var nOn = scnInds().length;
        return '<span class="ih-ind' + (nOn ? ' on' : '') + '" id="btScnIndBtn" role="button" tabindex="0" ' +
            'onclick="pftScIndMenu(event)" aria-haspopup="true">Индикаторы' +
            (nOn ? '<i>' + nOn + '</i>' : '') + '</span>';
    }
    window.pftScInd = function (name) {
        var o = stageObj(), inds = scnInds();
        var at = inds.indexOf(name);
        if (at >= 0) inds.splice(at, 1); else inds.push(name);
        saveStageRaw(o);
        scnKApplyInds();
        // кнопка и открытый попап обновляются точечно: перерисовка всей
        // шапки убила бы попап вместе с наведённым курсором
        var btn = dq('btScnIndBtn'); if (btn) btn.outerHTML = scnIndBtnHtml();
        var box = dq('btScnIndMenu');
        if (box) box.outerHTML = scnIndMenuHtml();
    };
    // пиктограммы групп меню: линия ЛОЖИТСЯ на свечи / осциллятор занимает
    // СВОЮ полосу под свечами — глазами видно, куда встанет индикатор
    var IM_IC_OVER = '<svg viewBox="0 0 14 14" aria-hidden="true">' +
        '<rect x="2.4" y="4.4" width="2.6" height="6.4" rx="0.8" class="c"/>' +
        '<rect x="9" y="2.6" width="2.6" height="6.4" rx="0.8" class="c"/>' +
        '<path d="M1 8.8 C4 3.4, 10 11.4, 13 5.2" class="a"/></svg>';
    var IM_IC_PANE = '<svg viewBox="0 0 14 14" aria-hidden="true">' +
        '<rect x="1.4" y="1.4" width="11.2" height="6.6" rx="1.4" class="c"/>' +
        '<rect x="1.4" y="10" width="11.2" height="2.8" rx="1.2" class="af"/></svg>';
    function scnIndMenuHtml() {
        var inds = scnInds();
        function item(x) {
            var on = inds.indexOf(x[0]) >= 0;
            return '<button type="button" class="' + (on ? 'on' : '') + '" onclick="pftScInd(\'' + x[0] + '\')">' +
                '<b>' + x[1] + '</b><em>' + x[2] + '</em><i>✓</i></button>';
        }
        // группы — двумя карточками с пиктограммами (владелец 2026-07-23:
        // голые подписи сливались со строками индикаторов)
        function sec(ic, cap, arr) {
            return '<div class="im-sec"><span class="im-cap">' + ic + cap + '</span>' + arr.map(item).join('') + '</div>';
        }
        return '<div class="bts-indmenu" id="btScnIndMenu">' +
            sec(IM_IC_OVER, 'На свечах', SCN_IND_ON_CANDLE) +
            sec(IM_IC_PANE, 'Отдельной панелью', SCN_IND_PANE) +
        '</div>';
    }
    window.pftScIndMenu = function (ev) {
        if (ev) ev.stopPropagation();
        var old = dq('btScnIndMenu'); if (old) { old.remove(); return; }
        var btn = dq('btScnIndBtn'); if (!btn) return;
        // попап живёт в .ih-r рядом с кнопкой: позиционируется от правого
        // края блока пилюль, на «Разгоне» уезжает вместе с ним к краю графика
        btn.insertAdjacentHTML('afterend', scnIndMenuHtml());
        setTimeout(function () {
            document.addEventListener('click', function once(e) {
                if (e.target.closest && e.target.closest('#btScnIndMenu')) return;
                document.removeEventListener('click', once);
                var m = dq('btScnIndMenu'); if (m) m.remove();
            });
        }, 0);
    };
    function scnKApplyInds() {
        if (!K.chart) return;
        var want = scnInds();
        var have = [];
        try { have = K.chart.getIndicators() || []; } catch (e) {}
        have.forEach(function (ind) {
            if (want.indexOf(ind.name) < 0) {
                try { K.chart.removeIndicator({ paneId: ind.paneId, name: ind.name }); } catch (e) {}
            }
        });
        var haveN = have.map(function (i) { return i.name; });
        want.forEach(function (name) {
            if (haveN.indexOf(name) >= 0) return;
            if (name === 'PROFILE') return;   // свой канвас-слой, движку не знаком
            var mk = { name: name };
            if (name === 'VOL') mk.calcParams = [];      // голая гистограмма, без своих MA
            if (name === 'MA') mk.calcParams = [20];     // чип и обещает «MA 20»
            if (SCN_IND_OVER[name]) mk.paneId = 'candle_pane';
            try { K.chart.createIndicator(mk, true); } catch (e) {}
        });
        scnKProfile();
        scnKCmp();
        // осцилляторам — небольшая доля холста, свечам всегда большая часть
        try {
            var panes = (K.chart.getPaneOptions() || []).filter(function (p) {
                return p.id !== 'candle_pane' && p.id !== 'x_axis_pane';
            });
            var h = K.host ? K.host.clientHeight : 0;
            var each = Math.max(34, Math.min(92, Math.round(h * 0.16)));
            panes.forEach(function (p) {
                K.chart.setPaneOptions({ id: p.id, height: each, minHeight: 28 });
            });
        } catch (e) {}
    }
    // ---- профиль объёма (раунд 3): канвас-слой поверх свечей ----
    // Горизонтальная тень у левого края: на каких ценах наторговано больше
    // всего. Считается из ВИДИМЫХ баров движка (двигаешь график — профиль
    // пересчитывается), пик подписан фактом. Движок про слой не знает:
    // перерисовка на тиках, скролле и смене темы.
    function scnKProfile() {
        var cv = dq('btScnProf');
        if (!cv) return;
        var on = K.chart && candlesOn() && scnInds().indexOf('PROFILE') >= 0;
        var box = cv.parentElement;
        if (!on || !box) { cv.style.display = 'none'; return; }
        cv.style.display = '';
        var list = [], vr = null;
        try { list = K.chart.getDataList() || []; vr = K.chart.getVisibleRange(); } catch (e) {}
        var from = vr && isFinite(vr.from) ? Math.max(0, Math.floor(vr.from)) : 0;
        var to = vr && isFinite(vr.to) ? Math.min(list.length, Math.ceil(vr.to)) : list.length;
        var bars = list.slice(from, to);
        var W = box.clientWidth, H = box.clientHeight;
        var dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
            cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        }
        var ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (bars.length < 4) return;
        var min = Infinity, max = -Infinity, anyVol = false;
        bars.forEach(function (b) {
            if (b.low > 0 && b.low < min) min = b.low;
            if (b.high > max) max = b.high;
            if (b.volume > 0) anyVol = true;
        });
        if (!(max > min) || !anyVol) return;
        var BINS = Math.max(14, Math.min(28, Math.floor(H / 26)));
        var vols = new Array(BINS);
        for (var i = 0; i < BINS; i++) vols[i] = 0;
        bars.forEach(function (b) {
            var typ = (b.high + b.low + b.close) / 3;
            var bi = Math.min(BINS - 1, Math.max(0, Math.floor((typ - min) / (max - min) * BINS)));
            vols[bi] += +b.volume || 0;
        });
        var maxV = 0, poc = 0;
        vols.forEach(function (v, i) { if (v > maxV) { maxV = v; poc = i; } });
        if (!(maxV > 0)) return;
        // левый край области свечей — x первого видимого бара (ось слева
        // занимает свои пиксели, тень не должна ложиться на цифры шкалы)
        var x0 = 0;
        try {
            var p0 = K.chart.convertToPixel({ dataIndex: from, value: bars[0].close }, { paneId: 'candle_pane' });
            if (p0 && isFinite(p0.x)) x0 = Math.max(0, p0.x - 4);
        } catch (e) {}
        var night = sceneNight();
        var acc = night ? '#7c8cff' : '#4453ef';
        var maxW = Math.min(220, W * 0.2);
        var s = S(sxSlot());
        for (var b2 = 0; b2 < BINS; b2++) {
            if (!(vols[b2] > 0)) continue;
            var pTop = min + (b2 + 1) / BINS * (max - min);
            var pBot = min + b2 / BINS * (max - min);
            var yT = pxToY(pTop), yB = pxToY(pBot);
            if (yT == null || yB == null) continue;
            var hh = Math.max(2, Math.abs(yB - yT) - 3);
            var ww = Math.max(3, vols[b2] / maxV * maxW);
            ctx.globalAlpha = b2 === poc ? 0.26 : 0.11;
            ctx.fillStyle = acc;
            scnRoundRect(ctx, x0, Math.min(yT, yB) + 1.5, ww, hh, 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // пик объёма: волосяной пунктир через холст + тихая подпись фактом
        var pocPx = min + (poc + 0.5) / BINS * (max - min);
        var pocY = pxToY(pocPx);
        if (pocY != null) {
            ctx.strokeStyle = night ? 'rgba(147,161,184,0.5)' : 'rgba(100,116,139,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 5]);
            ctx.beginPath(); ctx.moveTo(x0, pocY); ctx.lineTo(W, pocY); ctx.stroke();
            ctx.setLineDash([]);
            // подпись пика — плашкой-карточкой (владелец 2026-07-24: голый
            // текст поверх свечей не читался)
            var txt = fmtPx(pocPx, s) + ' — пик объёма';
            ctx.font = '700 10.5px ' + (getComputedStyle(document.body).getPropertyValue('--font-num') || 'monospace');
            var tw = ctx.measureText(txt).width;
            var tx = x0 + maxW + 16, ty = Math.max(11, Math.min(H - 11, pocY));
            ctx.fillStyle = night ? 'rgba(24,32,48,0.94)' : 'rgba(255,255,255,0.94)';
            scnRoundRect(ctx, tx - 8, ty - 10, tw + 16, 20, 7);
            ctx.fill();
            ctx.strokeStyle = night ? 'rgba(124,140,255,0.5)' : 'rgba(68,83,239,0.4)';
            ctx.lineWidth = 1;
            scnRoundRect(ctx, tx - 8, ty - 10, tw + 16, 20, 7);
            ctx.stroke();
            ctx.fillStyle = night ? '#e7ecf5' : '#0f172a';
            ctx.fillText(txt, tx, ty + 3.5);
        }
    }
    function scnRoundRect(ctx, x, y, w, h, r) {
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
        ctx.beginPath(); ctx.rect(x, y, w, h);
    }
    // ---- заявки линиями на графике: одна сущность, два представления ----
    // Линия — оверлей движка (drag двигает ЧЕРНОВИК цены в тикете, не заявку:
    // деньги двигает только кнопка); ярлык с «✕ снять» — DOM поверх холста.
    // «btLevel» — своя горизонталь БЕЗ ценника движка: встроенный priceLine
    // рисует у левого края синюю дефолтную плашку, а правило сцены — плашки
    // уровней справа и в цвет смысла (владелец 2026-07-23); их ведёт scnKTags
    function scnKRegLevel() {
        if (scnKRegLevel.done || !window.klinecharts || !window.klinecharts.registerOverlay) return;
        scnKRegLevel.done = true;
        window.klinecharts.registerOverlay({
            name: 'btLevel',
            totalStep: 2,
            needDefaultPointFigure: true,
            needDefaultXAxisFigure: false,
            needDefaultYAxisFigure: false,
            createPointFigures: function (o) {
                var c = o.coordinates && o.coordinates[0];
                if (!c || !isFinite(c.y)) return [];
                return [{ type: 'line', attrs: { coordinates: [{ x: 0, y: c.y }, { x: o.bounding.width, y: c.y }] } }];
            }
        });
        // метка своего исполнения (владелец 2026-07-23, мокап «сделки на
        // графике»): покупка — ▲ под точкой сделки, продажа — ▼ над ней,
        // цвет в extendData (посчитан от темы при создании)
        window.klinecharts.registerOverlay({
            name: 'btFillMark',
            totalStep: 2,
            needDefaultPointFigure: false,
            needDefaultXAxisFigure: false,
            needDefaultYAxisFigure: false,
            createPointFigures: function (o) {
                var c = o.coordinates && o.coordinates[0];
                var x = o.overlay && o.overlay.extendData;
                if (!c || !isFinite(c.y) || !x) return [];
                var s = 5.2;   // полуширина треугольника
                var pts = x.buy
                    ? [{ x: c.x, y: c.y + 4 }, { x: c.x - s, y: c.y + 4 + s * 1.6 }, { x: c.x + s, y: c.y + 4 + s * 1.6 }]
                    : [{ x: c.x, y: c.y - 4 }, { x: c.x - s, y: c.y - 4 - s * 1.6 }, { x: c.x + s, y: c.y - 4 - s * 1.6 }];
                return [{ type: 'polygon', attrs: { coordinates: pts },
                    styles: { style: 'stroke_fill', color: x.color, borderColor: x.ring, borderSize: 1 } }];
            }
        });
    }
    var K_ORD = {};   // orderId -> id оверлея
    function scnKOrders(force) {
        if (!K.chart || !K.uid) return;
        var want = {};
        T.orders.forEach(function (o) {
            if (o.instrumentUid !== K.uid || o.orderType === 'ORDER_TYPE_MARKET') return;
            var px = ordPx(o, S(sxSlot()));
            if (!(px > 0)) return;
            want[o.orderId] = {
                px: px, buy: o.direction === 'ORDER_DIRECTION_BUY',
                left: Math.max(0, (+o.lotsRequested || 0) - (+o.lotsExecuted || 0))
            };
        });
        Object.keys(K_ORD).forEach(function (id) {
            if (!want[id] || force) {
                try { K.chart.removeOverlay({ id: K_ORD[id] }); } catch (e) {}
                delete K_ORD[id];
            }
        });
        Object.keys(want).forEach(function (id) {
            if (K_ORD[id]) return;
            try {
                var oid = K.chart.createOverlay({
                    name: 'btLevel',
                    points: [{ value: want[id].px }],
                    lock: false,
                    onPressedMoveEnd: function (ev) {
                        var v = ev && ev.overlay && ev.overlay.points &&
                            ev.overlay.points[0] && +ev.overlay.points[0].value;
                        // линия — представление ЖИВОЙ заявки: возвращаем её на
                        // место, а новую цену несём в диалог переноса (владелец
                        // 2026-07-23 поверх мокапа: раньше драг лишь заполнял
                        // черновик тикета; деньги по-прежнему двигает кнопка —
                        // ReplaceOrder уйдёт только по «Перенести»)
                        scnKOrders(true);
                        if (v > 0) window.pftMove(id, scnSnap(v, S(sxSlot())));
                        return false;
                    }
                });
                if (oid) K_ORD[id] = Array.isArray(oid) ? oid[0] : oid;
            } catch (e) {}
        });
        K.ordWant = want;
        scnKTags();
    }
    // ---- свои исполнения на свечах (владелец 2026-07-23): ▲ купил / ▼ продал.
    // Данные — журнал FILLS (сегодняшние сделки); ts исполнения снапится к
    // ближайшей свече слева: точку между барами движок не понимает. Полная
    // пересборка на каждый вызов — как у scnKProt: движок молча сносит оверлеи
    // при перезагрузке данных (смена бумаги/периода, возврат с другого экрана),
    // и любой кэш-гвард на этом рано или поздно врёт. Меток ≤ 30 — дёшево
    function scnKFills() {
        if (!K.chart || !K.uid) return;
        var want = FILLS.filter(function (f) { return f.uid === K.uid; });
        var list = [];
        try { list = K.chart.getDataList() || []; } catch (e) {}
        if (!list.length) return;
        (K.fillIds || []).forEach(function (id) { try { K.chart.removeOverlay({ id: id }); } catch (e) {} });
        K.fillIds = [];
        var night = sceneNight();
        K.fillPts = [];
        want.forEach(function (f) {
            var idx = 0;
            for (var i = 0; i < list.length; i++) { if (list[i].timestamp <= f.ts) idx = i; else break; }
            K.fillPts.push({ idx: idx, px: f.px, buy: f.buy, qty: f.qty, ts: f.ts });
            try {
                var oid = K.chart.createOverlay({
                    name: 'btFillMark', lock: true,
                    points: [{ timestamp: list[idx].timestamp, value: f.px }],
                    extendData: {
                        buy: f.buy,
                        color: f.buy ? (night ? '#34d399' : '#16a34a') : (night ? '#f87171' : '#dc2626'),
                        ring: night ? '#0b1220' : '#ffffff'
                    }
                });
                if (oid) K.fillIds.push(Array.isArray(oid) ? oid[0] : oid);
            } catch (e) {}
        });
    }
    // подсказка метки — по близости кроссхейра (lock-оверлей событий мыши не
    // отдаёт): зовётся из onCrosshairChange, сравнивает курсор с точками сделок
    function scnKFillHover(d) {
        var anchor = dq('btScnOrdT');
        var el = dq('btScnFillTip');
        var pts = K.fillPts || [];
        if (!anchor || !K.chart || !pts.length || !d || !isFinite(d.x) || !isFinite(d.y)) {
            if (el) el.remove(); return;
        }
        var hit = null, hp = null;
        pts.forEach(function (f) {
            if (hit) return;
            var pt = null;
            try { pt = K.chart.convertToPixel({ dataIndex: f.idx, value: f.px }, { paneId: 'candle_pane' }); } catch (e) {}
            if (pt && isFinite(pt.x) && Math.abs(pt.x - d.x) < 14 && Math.abs(pt.y - d.y) < 18) { hit = f; hp = pt; }
        });
        if (!hit) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'btScnFillTip'; el.className = 'bts-filltip';
            anchor.parentNode.appendChild(el);
        }
        var s = S(sxSlot());
        el.innerHTML = 'вы ' + (hit.buy ? 'купили' : 'продали') + ' · <b>' + fmtPx(hit.px, s) + ' ₽</b> × ' +
            (+hit.qty).toLocaleString('ru-RU') + ' · ' +
            new Date(hit.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        el.classList.toggle('sell', !hit.buy);
        el.style.left = Math.round(hp.x) + 'px';
        el.style.top = Math.round(hp.y + (hit.buy ? 20 : -36)) + 'px';
    }
    // ярлыки заявок и защиты: позиция из convertToPixel, пересчёт на каждый
    // тик/скролл. Уровень вне видимого диапазона — метка у края со стрелкой
    // (мокап 06, пин 4): линию не видно, но факт защиты со сцены не пропадает.
    function pxToY(px) {
        try {
            var pt = K.chart.convertToPixel({ value: px }, { paneId: 'candle_pane' });
            return pt && isFinite(pt.y) ? pt.y : null;
        } catch (e) { return null; }
    }
    // чип кроссхейра на оси рисует движок; противоположный край — DOM.
    // Правило сторон одно: слева светлая плашка, справа акцентная.
    // d — сырой кроссхейр из onCrosshairChange ({x,y,paneId}; пустой объект =
    // курсор ушёл): getCrosshair есть только у стора, наружу он не торчит
    function scnKCross(d) {
        var el = dq('btScnCrossT');
        if (!el || !K.chart) return;
        var html = '';
        try {
            if (d && d.paneId === 'candle_pane' && isFinite(d.y)) {
                var pt = K.chart.convertFromPixel({ x: d.x || 0, y: d.y }, { paneId: 'candle_pane' });
                var v = pt && +pt.value > 0 ? +pt.value : 0;
                if (v > 0) {
                    var side = scnAxisPos() === 'left' ? 'r acc-ink' : 'l';
                    html = '<span class="px-tag ' + side + '" style="top:' + Math.round(d.y) + 'px">' +
                        fmtPx(v, S(sxSlot())) + '</span>';
                }
            }
        } catch (e) {}
        if (el.__btHtml !== html) { el.__btHtml = html; el.innerHTML = html; }
    }
    // OHLC-карточка кроссхейра — ВСЕГДА слева вверху холста (владелец
    // 2026-07-23: rect-легенда движка прыгала на сторону от курсора).
    // Данные — kLineData из того же onCrosshairChange, курсор ушёл — пусто
    function volTxt(v) {
        v = +v || 0;
        if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн';
        if (v >= 1e3) return (v / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' тыс';
        return v.toLocaleString('ru-RU');
    }
    function scnKOhlc(d) {
        var el = dq('btScnOhlc');
        if (!el) return;
        var c = d && d.kLineData;
        // ЛОВУШКА движка: onCrosshairChange отдаёт СЫРОЙ кроссхейр ({x,y,paneId})
        // без kLineData — свечу достаём сами по x через convertFromPixel
        if (!c && d && isFinite(d.x) && K.chart) {
            try {
                var pt = K.chart.convertFromPixel({ x: d.x }, { paneId: 'candle_pane' });
                var list = K.chart.getDataList();
                if (pt && pt.dataIndex != null && list) c = list[pt.dataIndex] || null;
            } catch (e) {}
        }
        var html = '';
        if (c && isFinite(c.close)) {
            var s = S(sxSlot());
            var per = sxPer()[0];
            var dt = new Date(c.timestamp);
            var tTxt = per === 'day' || per === 'week'
                ? dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' +
                  dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                : dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
            var up = c.close >= c.open;
            html = '<em>' + esc(tTxt) + '</em>' +
                '<span>откр <b>' + fmtPx(c.open, s) + '</b></span>' +
                '<span>макс <b>' + fmtPx(c.high, s) + '</b></span>' +
                '<span>мин <b>' + fmtPx(c.low, s) + '</b></span>' +
                '<span>закр <b class="' + (up ? 'g' : 'r') + '">' + fmtPx(c.close, s) + '</b></span>' +
                (+c.volume > 0 ? '<span>объём <b>' + volTxt(c.volume) + '</b></span>' : '');
        }
        if (el.__btHtml !== html) { el.__btHtml = html; el.innerHTML = html; }
    }
    function scnKTags() {
        var layer = dq('btScnOrdT');
        if (!layer || !K.chart) return;
        var s = S(sxSlot());
        var want = K.ordWant || {};
        var html = '';
        // последняя цена — ДВЕ плашки по краям линии движка: слева светлая
        // в тон дня, справа акцентная (ярлык самого движка скрыт в стилях).
        // Цену ведёт закрытие последней СВЕЧИ (K.lastClose) — ровно уровень
        // пунктира движка; цена стакана опережала бы линию (плашка «не успевала»)
        if (s.uid === K.uid) {
            var lastPx = K.lastClose > 0 ? K.lastClose : sxPrice(s);
            var lH = layer.clientHeight || 0;
            if (lastPx > 0) {
                var lyy = pxToY(lastPx);
                if (lyy != null && lyy >= 8 && (!lH || lyy <= lH - 12)) {
                    var cls = s.ob && A().q2n(s.ob.closePrice) > 0 ? A().q2n(s.ob.closePrice) : 0;
                    var dir = cls > 0 ? (lastPx >= cls ? ' up' : ' dn') : '';
                    var lyr = Math.round(lyy);
                    html += '<span class="px-tag l' + dir + '" style="top:' + lyr + 'px">' + fmtPx(lastPx, s) + '</span>' +
                        '<span class="px-tag r acc' + dir + '" style="top:' + lyr + 'px">' + fmtPx(lastPx, s) + '</span>';
                }
            }
        }
        Object.keys(want).forEach(function (id) {
            var w = want[id];
            var y = pxToY(w.px);
            if (y == null || y < 8) return;
            // клик по телу ярлыка — жест-вход в росток «Заявки» (вариант Г)
            html += '<span class="ord-tag" role="button" tabindex="0" style="top:' + Math.round(y) + 'px" ' +
                'onclick="pftScDeck(\'orders\')" title="Открыть панель заявок">' +
                (w.buy ? 'ваша заявка · ' : 'ваша продажа · ') + fmtPx(w.px, s) + ' × ' +
                (w.left * ((s.meta || {}).lot || 1)).toLocaleString('ru-RU') + ' шт' +
                '<u onclick="event.stopPropagation();pftScCancelPart(\'' + jsArg(id) + '\')" title="Снять заявку">✕</u></span>';
        });
        // тейк/стоп: плашка уровня СПРАВА в цвет смысла (зелёный/красный —
        // владелец 2026-07-23, синие ценники движка убраны вместе с priceLine);
        // ховер объясняет, чей уровень: черновик тикета, «ждёт исполнения»
        // или биржевая стоп-заявка (у той — лоты и «✕ снять»).
        // Уровень вне видимого диапазона — прежняя метка у края со стрелкой
        var h = layer.clientHeight || 0;
        scnProtLevels(s).forEach(function (w) {
            if (!h) return;
            var word = w.tp ? 'тейк' : 'стоп';
            var y = pxToY(w.px);
            if (y == null) return;
            if (y < 8) {
                html += '<span class="ord-off up" style="top:6px">' + word + ' ' +
                    fmtPx(w.px, s) + ' ↑</span>';
            } else if (y > h - 34) {
                html += '<span class="ord-off dn" style="bottom:28px">' + word + ' ' +
                    fmtPx(w.px, s) + ' ↓</span>';
            } else {
                var hint = w.kind === 'draft' ? 'уйдёт со следующей заявкой · линию можно тащить'
                    : w.kind === 'pend' ? 'встанет, когда заявка исполнится'
                    : 'стоп-заявка на бирже';
                // ✕ есть у ВСЕХ видов (владелец 2026-07-23): черновик чистится,
                // ждущая снимается из pendingProt, биржевая — CancelStopOrder;
                // клик по телу «живой» плашки — жест-вход в росток «Заявки»
                var x = w.kind === 'draft'
                    ? '<u onclick="event.stopPropagation();pftScProtClr(\'' + (w.tp ? 'tp' : 'sl') + '\')" title="Убрать уровень">✕</u>'
                    : w.kind === 'pend'
                        ? '<u onclick="event.stopPropagation();pftScPendClr(\'' + jsArg(w.oid) + '\',\'' + (w.tp ? 'tp' : 'sl') + '\')" title="Отменить защиту">✕</u>'
                        : '<u onclick="event.stopPropagation();pftCancelStop(\'' + jsArg(w.id) + '\')" title="Снять стоп-заявку">✕</u>';
                html += '<span class="prot-tag ' + (w.tp ? 'tp' : 'sl') + ' ' + w.kind + '"' +
                    (w.kind === 'live' ? ' role="button" tabindex="0" onclick="pftScDeck(\'orders\')"' : '') +
                    ' style="top:' + Math.round(y) + 'px">' +
                    word + ' ' + fmtPx(w.px, s) +
                    (w.kind === 'live' && w.lots ? ' · ' + w.lots + ' лот' : '') +
                    '<em>' + hint + '</em>' + x + '</span>';
            }
        });
        if (layer.__btHtml !== html) { layer.__btHtml = html; layer.innerHTML = html; }
    }
    // клик по цене (стакан, свеча, drag линии) подставляет её лимиткой в
    // видимую строку цены тикета — она теперь на всех ступенях, цена на глазах
    window.pftScPickPx = function (px) {
        px = +px;
        if (!(px > 0)) return;
        var n = sxSlot(), s = S(n);
        s.kind = 'limit';
        s.price = String(scnSnap(px, s));
        saveSlots();
        scnTicketRedraw(n);
    };
    // клик по СТРОКЕ стакана = ВЫБОР УРОВНЯ «до сюда» (владелец 2026-07-24):
    // не одна цена, а весь путь книги от спреда до уровня. Подсветка держится
    // (scnSweep), а общая сумма выкупа/продажи сразу падает в заявку — сторона,
    // лимит по краю и сумма-нетто. Клик по тому же краю снимает выбор.
    // scnSweep = { uid, side:'ask'|'bid', px } — закреплённый край книги
    var scnSweep = null;
    // деньги и лоты пути «от спреда до px» по одной стороне книги
    function scnSweepCalc(s, side, px) {
        var q2n = A().q2n, lot = (s.meta && s.meta.lot) || 1;
        var arr = (s.ob && (side === 'ask' ? s.ob.asks : s.ob.bids)) || [];
        var money = 0, lots = 0, edge = 0, eps = ((s.meta && s.meta.minInc) || 0.01) / 2;
        arr.forEach(function (l) {
            var p = q2n(l.price), q = +l.quantity || 0;
            if (!(p > 0) || !(q > 0)) return;
            // аски дорожают от лучшего — берём всё ДО px; биды дешевеют — от px
            if (side === 'ask' ? p <= px + eps : p >= px - eps) {
                money += p * q * lot; lots += q; if (side === 'ask' ? p > edge : (!edge || p < edge)) edge = p;
            }
        });
        return { money: money, lots: lots, edge: edge || px, lot: lot };
    }
    window.pftScRowPx = function (px, ask) {
        var n = sxSlot(), s = S(n);
        var side = ask ? 'ask' : 'bid';
        // повторный клик по тому же краю — снять выбор (и заявку не трогаем)
        if (scnSweep && scnSweep.uid === s.uid && scnSweep.side === side &&
            Math.abs(scnSweep.px - px) < 1e-9) { scnSweepClear(); return; }
        var sw = scnSweepCalc(s, side, px);
        scnSweep = { uid: s.uid, side: side, px: px };
        // сторона + лимит по краю пути; сумма-нетто (без комиссии — её добавит
        // строка «спишется») уходит в поле суммы заявки. Продажа считает по
        // рублям и сама упрётся в размер позиции — гвардам ничего не ломаем
        s.side = ask ? 'buy' : 'sell';
        s.kind = 'limit';
        s.price = String(scnSnap(sw.edge, s));
        scnUnit = 'rub';
        simpleSum = sw.money > 0 ? String(Math.round(sw.money)) : '';
        saveSlots();
        if (scnTktView() === 'depth') { window.pftScTkt('deal'); return; }  // redraw внутри
        scnTicketRedraw(n);
        scnDepthRepaint();
    };
    function scnSweepClear() {
        if (!scnSweep) return;
        scnSweep = null;
        scnDepthRepaint();
    }
    // перерисовать стакан по текущему тику (после смены выбора/стороны)
    function scnDepthRepaint() {
        var el = dq('btScnTkDepth'); if (!el) return;
        el.__btDSig = null; el.__btHtml = null;
        var tv = scnTktView();
        scnDepthSet('btScnTkDepth', S(sxSlot()), tv === 'depth' ? 1 : 0, scnDepthDeep());
    }

    // ---- стакан-глубина: правый край графика, одна плоскость ----
    // ЛОВУШКА мокапа: лучшая продажа стоит У СПРЕДА, дорогие аски — сверху.
    // Брокер отдаёт аски от лучшего — на экран идут в ОБРАТНОМ порядке.
    var SCN_DEPTH = 6;        // плоскость «Разгона»/«Контроля»: высота делится с графиком
    var SCN_DEPTH_CARD = 10;  // стакан карточной высоты («Стакан»/«Сплит» на «Старте»)
    // уровней на сторону — ПО ФАКТИЧЕСКОЙ высоте карточного стакана: поджатый
    // «Счётом» тикет не должен ни резать ряды, ни оставлять пустоту (владелец
    // 2026-07-24). ~118px — шапка + сегмент видов + спред, ряд 24px.
    // Лесенка делит высоту с мини-лентой снизу, «Кривая» — с горой сверху
    function scnDepthDeep() {
        var el = dq('btScnTkDepth');
        if (!el || !el.clientHeight) return SCN_DEPTH_CARD;
        // одна лесенка: сверху линия баланса (~64), середина стыка (~48),
        // шапка (~40), а лента растёт снизу — оставляем ей минимум ~160.
        // Лесенка занимает верх карточки по числу рядов, лишнее — ленте
        var per = Math.floor((el.clientHeight - 40 - 64 - 48 - 160) / 24 / 2);
        return Math.max(3, Math.min(SCN_DEPTH_CARD, per));
    }
    // данные стакана для рендера И для точечного патча (scnDepthSet):
    // sqrt-шкала ширины (видны и средние объёмы, не только «стена»),
    // d-big — крупная стена (≥60% максимума), d-best — цены у спреда,
    // title — цена уровня в рублях (px · лоты · лот)
    function scnDepthData(s, lim) {
        var q2n = A().q2n;
        function take(arr) {
            return (arr || []).slice(0, lim).map(function (l) {
                return { px: q2n(l.price), lots: +l.quantity || 0 };
            }).filter(function (l) { return l.px > 0; });
        }
        var asks = take(s.ob.asks), bids = take(s.ob.bids);
        var maxLots = 1;
        asks.concat(bids).forEach(function (l) { if (l.lots > maxLots) maxLots = l.lots; });
        var lot = (s.meta && s.meta.lot) || 1;
        // свои лимитки на уровнях книги (владелец 2026-07-23): точка-метка
        // d-mine + лоты в подсказке — заявка видна прямо в стакане
        var eps = ((s.meta && s.meta.minInc) || 0.01) / 2;
        var mine = [];
        T.orders.forEach(function (o) {
            if (o.instrumentUid !== s.uid || o.orderType === 'ORDER_TYPE_MARKET') return;
            var px = ordPx(o, s);
            var left = Math.max(0, (+o.lotsRequested || 0) - (+o.lotsExecuted || 0));
            if (px > 0 && left > 0) mine.push({ px: px, lots: left });
        });
        function myAt(px) {
            var sum = 0;
            mine.forEach(function (m) { if (Math.abs(m.px - px) <= eps) sum += m.lots; });
            return sum;
        }
        // закреплённый свип: уровень попал в путь «от спреда до края» → d-sel
        var swAsk = scnSweep && scnSweep.uid === s.uid && scnSweep.side === 'ask';
        var swBid = scnSweep && scnSweep.uid === s.uid && scnSweep.side === 'bid';
        var swEps = ((s.meta && s.meta.minInc) || 0.01) / 2;
        function dress(l, side, best) {
            l.w = Math.max(6, Math.round(Math.sqrt(l.lots / maxLots) * 100));
            // плашка «ваши N лот» с ОСТАТКОМ (req − исполнено): исполняется
            // заявка — число на плашке тает (владелец 2026-07-23)
            l.my = myAt(l.px);
            var sel = (swAsk && side === 'd-ask' && l.px <= scnSweep.px + swEps) ||
                      (swBid && side === 'd-bid' && l.px >= scnSweep.px - swEps);
            l.cls = 'd-row ' + side + (l.lots >= maxLots * 0.6 ? ' d-big' : '') +
                (best ? ' d-best' : '') + (l.my ? ' d-mine' : '') + (sel ? ' d-sel' : '');
            l.rub = '≈ ' + Math.round(l.px * l.lots * lot).toLocaleString('ru-RU') + ' ₽ на уровне' +
                (l.my ? ' · ваша заявка: осталось ' + l.my + ' ' + PF.plural(l.my, 'лот', 'лота', 'лотов') : '');
            return l;
        }
        // ЛОВУШКА мокапа: лучшая продажа стоит У СПРЕДА — аски в обратном
        // порядке, их «лучший» на экране ПОСЛЕДНИЙ; у бидов — первый
        var dispAsks = asks.slice().reverse().map(function (l, i) {
            return dress(l, 'd-ask', i === asks.length - 1);
        });
        var dispBids = bids.map(function (l, i) { return dress(l, 'd-bid', i === 0); });
        // баланс книги: сумма лотов сторон в ВИДИМОМ окне — для линии баланса
        var askVol = 0, bidVol = 0;
        asks.forEach(function (l) { askVol += l.lots; });
        bids.forEach(function (l) { bidVol += l.lots; });
        return { asks: dispAsks, bids: dispBids, sp: spreadInfo(s),
                 askVol: askVol, bidVol: bidVol };
    }
    function scnSpreadTxt(s, sp) {
        if (!sp) return 'спред —';
        var pct = sp.pct * 100;
        return 'спред ' + fmtPx(sp.ask - sp.bid, s) + ' · ' +
            (pct < 0.005 ? '<0,01' : pct.toLocaleString('ru-RU', { maximumFractionDigits: 2 })) + ' %';
    }
    function scnDepthRow(l, s) {
        // заливка — мягкий градиент ЗА числом лотов, без серых подложек:
        // длиннее заливка → крупнее уровень, стена подсвечена гуще (d-big)
        // узел d-my ВСЕГДА в строке (пустой спрятан CSS :empty) — точечный
        // патч scnDepthSet ходит по цепочке firstChild БЕЗ пробелов между
        // тегами. Плашка своих лотов — СЛЕВА, у цены с воздухом (владелец
        // 2026-07-23: справа от объёма она жила один раунд)
        return '<div class="' + l.cls + '" role="button" tabindex="0" data-px="' + l.px + '" data-v="' + l.lots + '" ' +
            'title="' + l.rub + '" onclick="pftScRowPx(+this.dataset.px, ' +
            (l.cls.indexOf('d-ask') >= 0 ? 1 : 0) + ')">' +
            '<i class="d-fill" style="width:' + l.w + '%"></i>' +
            '<span class="pr">' + fmtPx(l.px, s) + '</span>' +
            '<span class="d-my">' + (l.my ? l.my + ' ' + PF.plural(l.my, 'лот', 'лота', 'лотов') : '') + '</span>' +
            '<span class="d-vol">' + l.lots.toLocaleString('ru-RU') + '</span></div>';
    }
    // ---- карточный стакан: ОДНА лесенка (владелец 2026-07-24) ----
    // Три вида (Лесенка/Лента/Кривая) убраны как бесполезные. Остаётся лесенка,
    // но сверху — красивая ЛИНИЯ БАЛАНСА спроса и предложения (сглаженная гора
    // кумулятива на канве), середина стыка показывает саму цену сделки, а лента
    // сделок прижата к лесенке снизу. scnDepthView оставлен как заглушка —
    // на него смотрит старый код тика, но значение всегда «лесенка».
    function scnDepthView() { return 'ladder'; }
    // подпись края книги для линии баланса: доля спроса/предложения по объёму
    function scnBalTxt(d) {
        var tot = (d.askVol || 0) + (d.bidVol || 0);
        if (!(tot > 0)) return { bid: 50, ask: 50 };
        var bp = Math.round(d.bidVol / tot * 100);
        return { bid: bp, ask: 100 - bp };
    }
    // середина стакана — «что на стыке»: последняя цена сделки крупно, со
    // стрелкой направления (от ленты), спред — мелким подтекстом (владелец
    // 2026-07-24: «раньше был только спред, непонятно какая цена»)
    function scnMidBandInner(s, d) {
        var last = sxPrice(s);
        var t0 = (s.tape || [])[0];
        var dir = t0 ? (t0.direction === 'TRADE_DIRECTION_BUY' ? 'up' : 'down') : '';
        var arw = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·';
        return '<i class="d-mid-r"></i>' +
            '<span class="d-mid-c">' +
                '<b class="d-mid-px ' + dir + '">' + arw + ' ' + (last > 0 ? fmtPx(last, s) : '—') + ' ₽</b>' +
                '<em>' + scnSpreadTxt(s, d.sp) + '</em>' +
            '</span>' +
            '<i class="d-mid-r"></i>';
    }
    // плашка закреплённого свипа: «выкупить/продать до X ₽ — N лотов ≈ M ₽»
    function scnSweepBar(s) {
        if (!scnSweep || scnSweep.uid !== s.uid || !s.ob) return '';
        var sw = scnSweepCalc(s, scnSweep.side, scnSweep.px);
        if (!(sw.lots > 0)) return '';
        var buy = scnSweep.side === 'ask';
        return '<div class="d-sweep ' + (buy ? 'buy' : 'sell') + '">' +
            '<span>' + (buy ? 'Выкупить до ' : 'Продать до ') + '<b>' + fmtPx(sw.edge, s) + ' ₽</b>' +
            ' · ' + Math.round(sw.lots).toLocaleString('ru-RU') + ' ' +
            PF.plural(Math.round(sw.lots), 'лот', 'лота', 'лотов') +
            ' ≈ <b>' + scnMoneyShort(sw.money) + '</b> — в заявке</span>' +
            '<u role="button" tabindex="0" onclick="pftScSweepOff()">✕</u></div>';
    }
    window.pftScSweepOff = function () { scnSweepClear(); };
    function scnDepthHtml(s, slim, deep) {
        // slim — стакан внутри карточки тикета «Старта»: слово «Стакан» уже
        // на вкладке карточки, остаётся только подсказка жеста.
        // deep — уровней на сторону: карточной высоте есть куда расти
        var head = slim
            ? '<div class="d-h"><em>клик — выбрать уровень «до сюда»</em></div>'
            : '<div class="d-h"><b>Стакан</b><em>клик — выбрать уровень «до сюда»</em></div>';
        if (!s.ob) return head + '<div class="bts-cnote">Ждём стакан…</div>';
        var d = scnDepthData(s, deep || SCN_DEPTH);
        var bal = scnBalTxt(d);
        // линия баланса спроса/предложения: канва-гора + подписи долей
        var balStrip = '<div class="d-bal" id="btScnBal">' +
            '<canvas id="btScnBalCv"></canvas>' +
            '<span class="d-bal-t d-bal-b" id="btScnBalB">спрос ' + bal.bid + '%</span>' +
            '<span class="d-bal-t d-bal-a" id="btScnBalA">' + bal.ask + '% предложение</span>' +
        '</div>';
        // пустую сторону неликвида показываем, не прячем (экран 11): рыночной
        // цены без неё не существует — кнопку тикета гасит scnSubmitBlock
        var askPart = d.asks.length
            ? d.asks.map(function (l) { return scnDepthRow(l, s); }).join('')
            : '<div class="eg-empty">продавцов сейчас нет — спред не определён</div>';
        var bidPart = d.bids.length
            ? d.bids.map(function (l) { return scnDepthRow(l, s); }).join('')
            : '<div class="eg-empty">покупателей сейчас нет — спред не определён</div>';
        var ladder = '<div class="d-ladder">' + askPart +
            '<div class="d-mid" id="btScnMid">' + scnMidBandInner(s, d) + '</div>' +
            bidPart + '</div>';
        return head + balStrip +
            '<div class="d-sweepw" id="btScnSweep">' + scnSweepBar(s) + '</div>' +
            ladder +
            '<div class="d-tape-mini"><div class="d-h2">Лента сделок</div>' +
            '<div class="d-tape-b">' + scnTkTapeRows(s, 24) + '</div></div>';
    }
    // тик стакана: та же структура — патчим ЖИВЫЕ узлы (цены, лоты, ширины
    // заливок), а не innerHTML: css-transition ширины даёт стакану «дышать».
    // Структура сменилась (число уровней, лента, пустая сторона) — полный рендер
    function scnDepthSet(id, s, slim, deep) {
        var el = dq(id);
        if (!el) return;
        // одна лесенка: линия баланса + середина стыка + ряды + мини-лента
        var d = s.ob ? scnDepthData(s, deep || SCN_DEPTH) : null;
        var sig = [slim ? 1 : 0, deep || 0, d ? d.asks.length : -1, d ? d.bids.length : -1,
                   scnSweep && scnSweep.uid === s.uid ? scnSweep.side + scnSweep.px : '0'].join('|');
        if (el.__btDSig !== sig) {
            el.__btDSig = sig;
            el.__btHtml = null;   // после патчей строковый кэш scnSet врал бы
            el.innerHTML = scnDepthHtml(s, slim, deep);
            if (d) requestAnimationFrame(function () { scnBalDraw(s, d); });
            return;
        }
        if (!d) return;
        var rows = el.querySelectorAll('.d-row:not(.d-t)');
        var list = d.asks.concat(d.bids);
        if (rows.length !== list.length) { el.__btDSig = null; scnDepthSet(id, s, slim, deep); return; }
        list.forEach(function (l, i) {
            var r = rows[i];
            // та же цена в той же строке — значит, перемены на ней ЖИВЫЕ:
            // тающая плашка своих лотов получает вспышку (владелец 2026-07-23)
            var samePx = r.dataset.px === String(l.px);
            if (r.className !== l.cls) r.className = l.cls;
            if (r.dataset.px !== String(l.px)) r.dataset.px = l.px;
            if (r.dataset.v !== String(l.lots)) r.dataset.v = l.lots;
            if (r.title !== l.rub) r.title = l.rub;
            var pr = r.firstChild.nextSibling, my = pr.nextSibling, vol = my.nextSibling;
            var pt = fmtPx(l.px, s), vt = l.lots.toLocaleString('ru-RU');
            var mt = l.my ? l.my + ' ' + PF.plural(l.my, 'лот', 'лота', 'лотов') : '';
            if (pr.textContent !== pt) pr.textContent = pt;
            if (my.textContent !== mt) {
                // исполнение: остаток на плашке уменьшился (или плашка исчезла)
                var was = parseInt(my.textContent, 10) || 0, now = parseInt(mt, 10) || 0;
                my.textContent = mt;
                if (samePx && was > 0 && now < was) {
                    r.classList.remove('d-hit'); void r.offsetWidth;   // рестарт анимации
                    r.classList.add('d-hit');
                    my.classList.remove('d-bump'); void my.offsetWidth;
                    my.classList.add('d-bump');
                }
            }
            if (vol.textContent !== vt) vol.textContent = vt;
            var w = l.w + '%';
            if (r.firstChild.style.width !== w) r.firstChild.style.width = w;
        });
        // середина стыка: цена сделки + стрелка + спред — целиком тем же тиком
        var mid = el.querySelector('.d-mid');
        if (mid) {
            var mh = scnMidBandInner(s, d);
            if (mid.__btHtml !== mh) { mid.__btHtml = mh; mid.innerHTML = mh; }
        }
        // линия баланса: перерисовать канву + подписи долей
        scnBalDraw(s, d);
        var bal = scnBalTxt(d);
        var bb = el.querySelector('#btScnBalB'), ba = el.querySelector('#btScnBalA');
        if (bb) { var bbt = 'спрос ' + bal.bid + '%'; if (bb.textContent !== bbt) bb.textContent = bbt; }
        if (ba) { var bat = bal.ask + '% предложение'; if (ba.textContent !== bat) ba.textContent = bat; }
        // плашка свипа: сумма пути живёт тиком (лоты у уровня меняются)
        var swW = el.querySelector('#btScnSweep');
        if (swW) {
            var swh = scnSweepBar(s);
            if (swW.__btHtml !== swh) { swW.__btHtml = swh; swW.innerHTML = swh; }
        }
        // мини-лента сделок снизу живёт теми же тиками
        var tb = el.querySelector('.d-tape-b');
        if (tb) {
            var th = scnTkTapeRows(s, 24);
            if (tb.__btHtml !== th) { tb.__btHtml = th; tb.innerHTML = th; }
        }
    }
    function scnTkTapeRows(s, lim) {
        // рядов с запасом на весь пробел карточки; лишнее срежет overflow
        var rows = (s.tape || []).slice(0, lim || 20);
        if (!rows.length) return '<div class="bts-cnote">Сделки подтянутся через секунду…</div>';
        var q2n = A().q2n, bk = bondK(s);   // облигации: % → ₽
        return rows.map(function (t) {
            var buy = t.direction === 'TRADE_DIRECTION_BUY';
            var tm = t.time ? new Date(t.time).toLocaleTimeString('ru-RU') : '';
            return '<div class="d-row d-t"><span class="tt">' + esc(tm) + '</span>' +
                '<span class="pr ' + (buy ? 'g' : 'r') + '">' + fmtPx(q2n(t.price) * bk, s) + '</span>' +
                '<span class="d-vol">×' + (+t.quantity || 0).toLocaleString('ru-RU') + '</span></div>';
        }).join('');
    }
    // ---- линия баланса спроса и предложения (владелец 2026-07-24) ----
    // Сглаженная гора кумулятива над лесенкой: спрос слева зелёным, предложение
    // справа красным, встречаются на спреде. Х — цена, Y — накопленные лоты.
    // Рисуем на канве от живого s.ob каждым тиком (дешевле патча DOM). Кривая
    // сглажена монотонным бензье — «красиво», не ступеньками
    function scnCurvePalette() {
        var night = sceneNight();
        return {
            grn: night ? '#34d399' : '#16a34a',
            red: night ? '#f87171' : '#dc2626',
            hair: night ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
            mut: night ? '#93a1b8' : '#64748b'
        };
    }
    function scnBalDraw(s, d) {
        var cv = dq('btScnBalCv'), box = dq('btScnBal');
        if (!cv || !box || !s.ob) return;
        var asks = (d.asks || []).slice().reverse();   // экранный порядок — обратно к лучшему
        var bids = (d.bids || []);
        if (!asks.length && !bids.length) return;
        var W = box.clientWidth, H = box.clientHeight;
        if (!(W > 30) || !(H > 20)) return;
        var dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
            cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        }
        var ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var pal = scnCurvePalette();
        // общий диапазон цен книги; спред — по центру X
        var bestBid = bids.length ? bids[0].px : 0;
        var bestAsk = asks.length ? asks[0].px : 0;
        var pmin = bids.length ? bids[bids.length - 1].px : bestAsk;
        var pmax = asks.length ? asks[asks.length - 1].px : bestBid;
        if (!(pmax > pmin)) { pmax = pmin + ((s.meta && s.meta.minInc) || 0.01); }
        var maxCum = 1, cum;
        var bidPts = []; cum = 0;
        bids.forEach(function (l) { cum += l.lots; bidPts.push({ px: l.px, c: cum }); });
        maxCum = Math.max(maxCum, cum);
        var askPts = []; cum = 0;
        asks.forEach(function (l) { cum += l.lots; askPts.push({ px: l.px, c: cum }); });
        maxCum = Math.max(maxCum, cum);
        var padT = 8, padB = 2;
        function X(px) { return (px - pmin) / (pmax - pmin) * (W - 2) + 1; }
        function Y(c) { return H - padB - c / maxCum * (H - padT - padB); }
        // гладкая гора: базовая точка у спреда, сглаживание монотонным бензье
        function smooth(pts, basePx, col) {
            var P = [{ x: X(basePx), y: Y(0) }];
            pts.forEach(function (p) { P.push({ x: X(p.px), y: Y(p.c) }); });
            ctx.beginPath();
            ctx.moveTo(P[0].x, P[0].y);
            for (var i = 0; i < P.length - 1; i++) {
                var a = P[i], b = P[i + 1];
                var mx = (a.x + b.x) / 2;
                ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
            }
            var grad = ctx.createLinearGradient(0, padT, 0, H);
            grad.addColorStop(0, col + '55');
            grad.addColorStop(1, col + '08');
            // заливка под кривой до дна
            ctx.lineTo(P[P.length - 1].x, Y(0));
            ctx.lineTo(P[0].x, Y(0));
            ctx.closePath();
            ctx.fillStyle = grad; ctx.fill();
            // сама линия — поверх заливки, без нижней кромки
            ctx.beginPath();
            ctx.moveTo(P[0].x, P[0].y);
            for (i = 0; i < P.length - 1; i++) {
                var a2 = P[i], b2 = P[i + 1], mx2 = (a2.x + b2.x) / 2;
                ctx.bezierCurveTo(mx2, a2.y, mx2, b2.y, b2.x, b2.y);
            }
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round';
            ctx.shadowColor = col + '66'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
            ctx.stroke();
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        }
        if (bidPts.length) smooth(bidPts, bestBid, pal.grn);
        if (askPts.length) smooth(askPts, bestAsk, pal.red);
        // спред — волосяная вертикаль по центру стыка
        if (bestBid && bestAsk) {
            var mid = (bestBid + bestAsk) / 2;
            ctx.strokeStyle = pal.hair; ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath(); ctx.moveTo(X(mid), padT - 4); ctx.lineTo(X(mid), H); ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    // ---- кумулятивная глубина по ховеру (владелец 2026-07-23) ----
    // Навёл на уровень — тихо подсвечиваются все уровни между спредом и ним,
    // чип называет ёмкость: «скупить до N ₽ — ≈ M ₽». Помогает ставить
    // лимитку осознанно: видно, сколько денег стоит дорога до этой цены
    function scnMoneyShort(v) {
        if (v >= 1e6) return (v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽';
        if (v >= 1e3) return Math.round(v / 1e3).toLocaleString('ru-RU') + ' тыс ₽';
        return Math.round(v).toLocaleString('ru-RU') + ' ₽';
    }
    window.pftScDepthHov = function (ev) {
        var r = ev && ev.target && ev.target.closest ? ev.target.closest('.d-row') : null;
        var box = dq('btScnTkDepth');
        if (!box) return;
        if (!r || r.classList.contains('d-t') || !box.contains(r)) { window.pftScDepthHovOff(); return; }
        var ask = r.classList.contains('d-ask');
        var rows = Array.prototype.slice.call(box.querySelectorAll(ask ? '.d-row.d-ask' : '.d-row.d-bid'));
        var i = rows.indexOf(r);
        if (i < 0) return;
        // аски на экране в обратном порядке (лучший — ПОСЛЕДНИЙ, у спреда),
        // биды — лучший первый: диапазон всегда «от спреда до наведённого»
        var range = ask ? rows.slice(i) : rows.slice(0, i + 1);
        var s = S(sxSlot());
        var lot = (s.meta && s.meta.lot) || 1;
        var money = 0;
        // чистим ОБЕ стороны: ховер перешёл с асков на биды — старую
        // подсветку снять некому, кроме нас
        box.querySelectorAll('.d-cum').forEach(function (x) { x.classList.remove('d-cum'); });
        range.forEach(function (x) {
            x.classList.add('d-cum');
            money += (+x.dataset.px || 0) * (+x.dataset.v || 0) * lot;
        });
        var tip = dq('btScnCumTip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'btScnCumTip'; tip.className = 'd-cumtip';
            box.appendChild(tip);
        }
        tip.textContent = (ask ? 'скупить до ' : 'продать до ') + fmtPx(+r.dataset.px || 0, s) +
            ' ₽ — ≈ ' + scnMoneyShort(money);
        tip.classList.toggle('sell', !ask);
        // чип над строкой, у правого края; выше первого ряда не выпрыгивает
        tip.style.top = Math.max(2, r.offsetTop - 24) + 'px';
    };
    window.pftScDepthHovOff = function () {
        var box = dq('btScnTkDepth');
        if (box) box.querySelectorAll('.d-cum').forEach(function (x) { x.classList.remove('d-cum'); });
        var tip = dq('btScnCumTip'); if (tip) tip.remove();
    };
    // ---- поповер звоночка: подписка на достижение цены ----
    // Хранение — прежний bt_alerts_v1, проверка — в идущем поллере стакана.
    // Доставка в звоночек сайта и пуш — этап уведомлений; пока announce().
    function bellPopHtml(s) {
        var last = sxPrice(s);
        var mine = ALERTS.map(function (a, i) { return { a: a, i: i }; })
            .filter(function (x) { return x.a.uid === s.uid; });
        return '<div class="bellpop" id="btScnBellPop">' +
            '<em>Уведомить о цене</em>' +
            '<div class="bp-in"><input id="btScnBellPx" type="text" inputmode="decimal" autocomplete="off" ' +
                'placeholder="' + (last > 0 ? fmtPx(last, s) : '0') + '" aria-label="Цена алерта"><u>₽</u></div>' +
            '<div class="bp-pre">' +
                '<span>' + (last > 0 ? 'сейчас ' + fmtPx(last, s) : 'ждём цену') + '</span>' +
                '<span role="button" tabindex="0" onclick="pftScBellPre(-1)">−1 %</span>' +
                '<span role="button" tabindex="0" onclick="pftScBellPre(-3)">−3 %</span>' +
            '</div>' +
            (mine.length ? '<div class="bp-list">' + mine.map(function (x) {
                return '<div class="bp-row"><span>' + (x.a.dir === 'up' ? 'выше' : 'ниже') + ' <b>' +
                    fmtPx(x.a.px, s) + ' ₽</b></span><u onclick="pftScBellDrop(' + x.i + ')">убрать</u></div>';
            }).join('') + '</div>' : '') +
            '<button type="button" class="bp-cta" onclick="pftScBellGo()">Следить</button>' +
            // с этапа 7 обещание честное: announce кладёт событие в звоночек
            // сайта (msNotify.local) и шлёт пуш при включённом notifyBrowser
            '<span class="bp-note">Придёт пушем и в звоночек сайта. Сработает один раз — алерт гаснет, не спамит.</span>' +
        '</div>';
    }
    function scnBellClose() { var p = dq('btScnBellPop'); if (p) p.remove(); }
    window.pftScBell = function (ev) {
        if (ev) ev.stopPropagation();
        var s = S(sxSlot());
        if (!s.meta) return;
        if (dq('btScnBellPop')) { scnBellClose(); return; }
        var host = document.querySelector('#btScene .bts-hero');
        if (!host) return;
        host.insertAdjacentHTML('beforeend', bellPopHtml(s));
        var i = dq('btScnBellPx'); if (i) try { i.focus(); } catch (e) {}
        setTimeout(function () {
            document.addEventListener('click', function once(e) {
                if (e.target.closest && (e.target.closest('#btScnBellPop') || e.target.closest('.ih-bell'))) return;
                document.removeEventListener('click', once);
                scnBellClose();
            });
        }, 0);
    };
    window.pftScBellPre = function (pct) {
        var s = S(sxSlot());
        var last = sxPrice(s);
        if (!(last > 0)) return;
        var i = dq('btScnBellPx');
        if (i) i.value = String(scnSnap(last * (1 + pct / 100), s));
    };
    window.pftScBellDrop = function (i) {
        ALERTS.splice(i, 1);
        saveAlerts();
        scnBellClose();
        scnSet('btScnHead', scnHeadHtml(S(sxSlot())));
    };
    window.pftScBellGo = function () {
        var s = S(sxSlot());
        var last = sxPrice(s);
        var v = +String((dq('btScnBellPx') || {}).value || '').replace(',', '.') || 0;
        if (!(v > 0)) { toast('Укажите цену алерта', true); return; }
        if (!(last > 0)) { toast('Текущая цена ещё не пришла — попробуйте через секунду', true); return; }
        if (Math.abs(v - last) < 1e-9) { toast('Эта цена уже достигнута', true); return; }
        if (ALERTS.length >= ALERT_MAX) { toast('Больше ' + ALERT_MAX + ' алертов терминал не держит', true); return; }
        ALERTS.push({ uid: s.uid, ticker: s.meta.ticker, px: v, dir: v > last ? 'up' : 'down' });
        saveAlerts();
        scnBellClose();
        toast('Алерт поставлен: ' + (v > last ? 'выше ' : 'ниже ') + fmtPx(v, s) + ' ₽');
        scnSet('btScnHead', scnHeadHtml(S(sxSlot())));
    };

    // ---- строка цены тикета («Разгон»+): рынок ⇄ лимит ----
    var scnKnowOpen = false;   // «что нужно знать» на «Разгоне» свёрнуто в строку
    // рынок ⇄ лимит — мини-сегмент в идиоме тикета (владелец 2026-07-23
    // поверх мокапа: текстовые ссылки читались плохо); значение цены — рядом
    function scnPriceRowInner(n) {
        var s = S(n);
        var lim = s.kind === 'limit' && +s.price > 0;
        var last = sxPrice(s);
        var seg = '<span class="px-seg">' +
            '<span class="' + (lim ? '' : 'on') + '" role="button" tabindex="0" onclick="pftScKind(0)">По рынку</span>' +
            '<span class="' + (lim ? 'on' : '') + '" role="button" tabindex="0" onclick="pftScKind(1)">Лимит</span></span>';
        if (!lim) {
            return '<em>Цена</em><div class="fld-price">' + seg +
                '<span class="px-now" id="btScnPxNow">' +
                (last > 0 ? 'сейчас ' + fmtPx(last, s) + ' ₽' : '') + '</span></div>';
        }
        return '<em>Цена</em><div class="fld-price">' + seg +
            '<span class="lim-edit"><input id="btScnLimIn" type="text" inputmode="decimal" autocomplete="off" ' +
                'spellcheck="false" value="' + esc(String(s.price)) + '" aria-label="Лимитная цена"><u>₽</u></span>' +
            '<span class="px-now" id="btScnPxNow">' +
                (last > 0 ? 'сейчас ' + fmtPx(last, s) : '') + '</span></div>';
    }
    window.pftScKind = function (toLim) {
        var n = sxSlot(), s = S(n);
        if (toLim) {
            s.kind = 'limit';
            if (!(+s.price > 0)) {
                var last = sxPrice(s);
                if (last > 0) s.price = String(scnSnap(last, s));
            }
        } else {
            s.kind = 'market';
        }
        saveSlots();
        scnTicketRedraw(n);
        if (toLim) { var i = dq('btScnLimIn'); if (i) try { i.focus(); i.select(); } catch (e) {} }
    };
    window.pftScKnow = function () {
        scnKnowOpen = !scnKnowOpen;
        scnTicketRedraw(sxSlot());
    };

    // ================= СТУПЕНЬ «КОНТРОЛЬ» (экран 06) =================
    // Максимальная насыщенность — и всё ещё сцена, не сетка: панели плавают
    // на холсте с воздухом между ними. Сплит на две бумаги, стакан в одной
    // плоскости с главным графиком, лента — рядом со вторым, док
    // Заявки/Позиции/История/Алерты, экраны-вкладки в строке среды.
    // цвет монограммы — детерминированный от тикера (панели сплита — списки,
    // цветные метки живут именно там)
    var SCN_HUES = ['#1d9a55', '#b3452e', '#3b6fd4', '#8b5cf6', '#b98207', '#0891b2'];
    function scnHue(tk) {
        var h = 0, str = String(tk || '');
        for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
        return SCN_HUES[h % SCN_HUES.length];
    }
    // ---- защита позиции: строка тикета И линии на графике ----
    var scnProtEdit = false;
    function protVals(s) {
        return { tp: +s.protTp || 0, sl: +s.protSl || 0 };
    }
    // чипы в цвет плашек графика (владелец 2026-07-23 поверх мокапа: серая
    // строка «тейк · стоп» не читалась) — одна сущность = один язык цвета
    function scnProtInner(n) {
        var s = S(n), v = protVals(s);
        if (scnProtEdit) {
            return '<div class="prot prot-e">' +
                '<label>тейк <input id="btScnProtTp" type="text" inputmode="decimal" autocomplete="off" value="' +
                    esc(s.protTp || '') + '" placeholder="—"></label>' +
                '<label>стоп <input id="btScnProtSl" type="text" inputmode="decimal" autocomplete="off" value="' +
                    esc(s.protSl || '') + '" placeholder="—"></label>' +
                '<u role="button" tabindex="0" onclick="pftScProtDone()">готово</u></div>';
        }
        // пусто — два «призрака» зовут добавить ногу; задана — чип с ✕
        function chip(k, val) {
            var word = k === 'tp' ? 'тейк' : 'стоп';
            if (!(val > 0)) {
                return '<span class="prot-add ' + k + '" role="button" tabindex="0" ' +
                    'onclick="pftScProtEdit(\'' + k + '\')">+ ' + word + '</span>';
            }
            return '<span class="prot-chip ' + k + '" role="button" tabindex="0" ' +
                'onclick="pftScProtEdit(\'' + k + '\')" title="Изменить уровень">' + word +
                ' <b>' + fmtPx(val, s) + ' ₽</b>' +
                '<u onclick="event.stopPropagation();pftScProtClr(\'' + k + '\')" title="Убрать уровень">✕</u></span>';
        }
        return '<div class="prot">' + chip('tp', v.tp) + chip('sl', v.sl) + '</div>';
    }
    window.pftScProtEdit = function (k) {
        scnProtEdit = true;
        scnTicketRedraw(sxSlot());
        var i = dq(k === 'sl' ? 'btScnProtSl' : 'btScnProtTp');
        if (i) try { i.focus(); } catch (e) {}
    };
    window.pftScProtDone = function () {
        scnProtEdit = false;
        var s = S(sxSlot());
        // значения — из полей строки: numStr пускает только число
        var tp = dq('btScnProtTp'), sl = dq('btScnProtSl');
        if (tp) s.protTp = numStr(tp.value.replace(',', '.'));
        if (sl) s.protSl = numStr(sl.value.replace(',', '.'));
        s.prot = (+s.protTp > 0 || +s.protSl > 0);
        saveSlots();
        scnTicketRedraw(sxSlot());
        scnKProt();
    };
    // ✕ на плашке черновика: убрать одну ногу защиты прямо с графика
    window.pftScProtClr = function (k) {
        var s = S(sxSlot());
        s[k === 'tp' ? 'protTp' : 'protSl'] = '';
        s.prot = (+s.protTp > 0 || +s.protSl > 0);
        saveSlots();
        var f = dq('btScnProt'); if (f) f.innerHTML = '<em>Защита позиции</em>' + scnProtInner(sxSlot());
        scnKProt();
    };
    // ✕ на «ждёт исполнения»: защита ещё не на бирже (встанет из pendingProt
    // после исполнения заявки) — снять её можно у нас, без брокера
    window.pftScPendClr = function (oid, k) {
        var p = pendingProt[oid];
        if (!p) return;
        p[k] = 0;
        if (!(p.tp > 0) && !(p.sl > 0)) delete pendingProt[oid];
        toast('Защита по заявке снята — ' + (k === 'tp' ? 'тейк' : 'стоп') + ' не выставится');
        scnKProt();
    };
    // все уровни защиты по бумаге в одном реестре (владелец 2026-07-23:
    // «должно быть понятно, по какой заявке эти тейк и стоп»):
    //   draft — черновик тикета (перетаскивается, уедет со СЛЕДУЮЩЕЙ заявкой),
    //   pend  — снимок pendingProt: заявка отправлена, защита ждёт исполнения,
    //   live  — стоп-заявки, уже живущие на бирже (GetStopOrders)
    function scnProtLevels(s) {
        if (!s || s.uid !== K.uid) return [];
        var out = [];
        var v = protVals(s);
        if (v.tp > 0) out.push({ key: 'tp', px: v.tp, tp: 1, kind: 'draft', drag: 1 });
        if (v.sl > 0) out.push({ key: 'sl', px: v.sl, tp: 0, kind: 'draft', drag: 1 });
        Object.keys(pendingProt).forEach(function (oid) {
            var p = pendingProt[oid];
            if (p.uid !== s.uid) return;
            if (p.tp > 0) out.push({ key: 'pt:' + oid, px: p.tp, tp: 1, kind: 'pend', oid: oid });
            if (p.sl > 0) out.push({ key: 'ps:' + oid, px: p.sl, tp: 0, kind: 'pend', oid: oid });
        });
        T.stops.forEach(function (o) {
            if (o.instrumentUid !== s.uid) return;
            var px = A().q2n(o.stopPrice) * bondK(s);   // облигации: % → ₽
            if (!(px > 0)) return;
            out.push({ key: 'st:' + o.stopOrderId, px: px,
                tp: o.stopOrderType === 'STOP_ORDER_TYPE_TAKE_PROFIT' ? 1 : 0,
                kind: 'live', lots: +o.lotsRequested || 0, id: o.stopOrderId });
        });
        return out;
    }
    // линии тейка и стопа на свечах; у черновика перетаскивание меняет
    // уровень, строка тикета следует (линия — черновик уровня); плашки
    // уровней справа рисует scnKTags
    var K_PROT = {};   // ключ уровня -> id оверлея
    function scnKProt() {
        if (!K.chart) return;
        var s = S(sxSlot());
        Object.keys(K_PROT).forEach(function (k) {
            try { K.chart.removeOverlay({ id: K_PROT[k] }); } catch (e) {}
            delete K_PROT[k];
        });
        scnProtLevels(s).forEach(function (w) {
            var opt = {
                name: 'btLevel',
                points: [{ value: w.px }],
                // биржевой стоп тоже тянется (владелец 2026-07-23): линия
                // вернётся на место, а цена уедет в диалог переноса — деньги
                // двигает кнопка, как и у лимиток
                lock: !w.drag && w.kind !== 'live',
                // черновик — пунктир (ещё не деньги), биржевой стоп — сплошная
                styles: { line: {
                    color: w.tp ? (sceneNight() ? '#34d399' : '#16a34a') : (sceneNight() ? '#f87171' : '#dc2626'),
                    style: w.kind === 'live' ? 'solid' : 'dashed', size: 1
                } }
            };
            if (w.drag) opt.onPressedMoveEnd = function (ev) {
                var nv = ev && ev.overlay && ev.overlay.points &&
                    ev.overlay.points[0] && +ev.overlay.points[0].value;
                if (nv > 0) {
                    var s2 = S(sxSlot());
                    s2[w.tp ? 'protTp' : 'protSl'] = String(scnSnap(nv, s2));
                    s2.prot = true;
                    saveSlots();
                    var f = dq('btScnProt'); if (f) f.innerHTML = '<em>Защита позиции</em>' + scnProtInner(sxSlot());
                }
                scnKProt();
                return false;
            };
            else if (w.kind === 'live') opt.onPressedMoveEnd = function (ev) {
                var nv = ev && ev.overlay && ev.overlay.points &&
                    ev.overlay.points[0] && +ev.overlay.points[0].value;
                scnKProt();   // линия — представление биржевого стопа: на место
                if (nv > 0) window.pftMoveStop(w.id, scnSnap(nv, S(sxSlot())));
                return false;
            };
            try {
                var oid = K.chart.createOverlay(opt);
                if (oid) K_PROT[w.key] = Array.isArray(oid) ? oid[0] : oid;
            } catch (e) {}
        });
        scnKTags();
    }

    // ---- док-«росток»: Заявки · Позиции · История · Алерты ----
    // Вариант А (владелец 2026-07-23): полоса позиций раскрывается ВВЕРХ в
    // панель, герой с графиком поджимается по высоте (та же пружина, что у
    // сплита стакана). Жест-вход Г: клик по плашке заявки на графике.
    var dockTab = 'orders';
    window.pftScDeck = function (k) {
        var o = stageObj();
        var open = !!o.layers.deck;
        if (open && (!k || dockTab === k)) o.layers.deck = 0;   // повторный клик закрывает
        else {
            o.layers.deck = 1;
            if (k) dockTab = k;
            if (dockTab === 'hist') loadHist();
        }
        saveStageRaw(o);
        var sc = dq('btScene'); if (sc) sc.dataset.deck = o.layers.deck ? '1' : '0';
        scnSet('btScnDock', scnDockHtml());
        scnSet('btScnPos', scnPosInner());   // стрелки-ярлыки полосы
        scnDockFit();
    };
    window.pftScDockTab = function (k) {
        dockTab = k;
        if (k === 'hist') loadHist();   // тяжёлый метод — только по требованию
        scnSet('btScnDock', scnDockHtml());
        scnDockFit();
    };
    window.pftScDockShev = function () {
        window.pftScDeck();   // шеврон — просто «закрыть росток»
    };
    window.pftScAlertDrop = function (i) {
        ALERTS.splice(i, 1);
        saveAlerts();
        sxTick();
        scnSet('btScnDock', scnDockHtml());
    };
    function dockOrdersRows() {
        var rows = T.orders.map(function (o) {
            var ms = metaSlot(o.instrumentUid);
            var tk = (instrMem[o.instrumentUid] || {}).ticker || '—';
            var buy = o.direction === 'ORDER_DIRECTION_BUY';
            var lim = o.orderType === 'ORDER_TYPE_LIMIT';
            var px = ordPx(o, ms);
            var req = +o.lotsRequested || 0, done = +o.lotsExecuted || 0;
            var lot = (instrMem[o.instrumentUid] || {}).lot || 1;
            return '<div class="dk-r"><b>' + esc(tk) + '</b>' +
                '<span class="' + (buy ? 'g' : 'r') + '">' + (buy ? 'Покупка' : 'Продажа') + '</span>' +
                '<span>' + (lim ? 'Лимит · <b>' + fmtPx(px, ms) + ' ₽</b>' : 'По рынку') + '</span>' +
                '<span><b>' + (req * lot).toLocaleString('ru-RU') + '</b> шт</span>' +
                '<span>' + done + ' из ' + req + '</span>' +
                '<span class="dk-st act">' + (done > 0 ? 'Частично · ' + done + '/' + req : 'Активна') + '</span>' +
                // частично исполненную снимает свой диалог (разбивка и выбор)
                '<span class="dk-x" role="button" tabindex="0" onclick="pftScCancelPart(\'' + jsArg(o.orderId) + '\')">Отменить</span></div>';
        });
        T.stops.forEach(function (o) {
            var ms = metaSlot(o.instrumentUid);
            var tk = (instrMem[o.instrumentUid] || {}).ticker || '—';
            var buy = o.direction === 'STOP_ORDER_DIRECTION_BUY';
            var px = A().q2n(o.stopPrice) * bondKUid(o.instrumentUid);   // облигации: % → ₽
            var tp = o.stopOrderType === 'STOP_ORDER_TYPE_TAKE_PROFIT';
            rows.push('<div class="dk-r"><b>' + esc(tk) + '</b>' +
                '<span class="' + (buy ? 'g' : 'r') + '">' + (buy ? 'Покупка' : 'Продажа') + '</span>' +
                '<span>' + (tp ? 'Тейк' : 'Стоп') + ' · <b>' + fmtPx(px, ms) + ' ₽</b></span>' +
                '<span><b>' + (+o.lotsRequested || 0) + '</b> лот</span>' +
                '<span>ждёт цены</span>' +
                '<span class="dk-st act">Активна</span>' +
                '<span class="dk-x" role="button" tabindex="0" onclick="pftCancelStop(\'' + jsArg(o.stopOrderId) + '\')">Отменить</span></div>');
        });
        // пустое состояние — приглашение с действием, не голая констатация
        // (владелец 2026-07-23): ссылка ведёт в тикет с готовой лимиткой
        return rows.length ? rows.join('')
            : '<div class="dk-empty">Активных заявок нет — поставьте лимитку, она появится здесь и в стакане' +
              '<u role="button" tabindex="0" onclick="pftScDockLim()">Поставить лимитку</u></div>';
    }
    function dockPosRows() {
        var list = T.port.list || [];
        if (!list.length) return '<div class="dk-empty">' + (T.port.ts
            ? 'Позиций нет — купленное появится здесь' +
              '<u role="button" tabindex="0" onclick="pftScDockBuy()">К покупке</u>'
            : 'Загружаем…') + '</div>';
        return list.map(function (p) {
            var up = p.pnl >= 0;
            var pct = p.avg > 0 ? Math.abs(p.last / p.avg - 1) * 100 : 0;
            return '<div class="dk-r dk-pos" role="button" tabindex="0" onclick="pftScChip(\'' + jsArg(p.uid) + '\')">' +
                '<b>' + esc(p.ticker) + '</b>' +
                '<span>' + p.qty.toLocaleString('ru-RU') + ' шт</span>' +
                '<span><b>' + fmtPx(p.avg, { meta: p.meta }) + ' ₽</b></span>' +
                '<span><b>' + fmtPx(p.last, { meta: p.meta }) + ' ₽</b></span>' +
                '<span class="' + (up ? 'g' : 'r') + '">' + (up ? '+' : '−') + fmtKop(Math.abs(p.pnl)) + '</span>' +
                '<span class="' + (up ? 'g' : 'r') + '">' + (up ? '+' : '−') +
                    pct.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' %</span>' +
                '<span class="dk-go">в сцену →</span></div>';
        }).join('');
    }
    function dockHistRows() {
        if (T.histBusy) return '<div class="dk-empty">Загружаем историю…</div>';
        if (T.histErr) return '<div class="dk-empty">' + esc(T.histErr) + '</div>';
        if (!T.hist.length) return '<div class="dk-empty">За последний месяц исполненных сделок нет</div>';
        return T.hist.slice(0, 12).map(function (r) {
            var d = new Date(r.ts);
            return '<div class="dk-r"><b>' + esc(r.ticker) + '</b>' +
                '<span class="' + (r.buy ? 'g' : 'r') + '">' + (r.buy ? 'Покупка' : 'Продажа') + '</span>' +
                '<span>по <b>' + fmtPx(r.price, { meta: r.meta }) + ' ₽</b></span>' +
                '<span><b>' + r.qty.toLocaleString('ru-RU') + '</b> шт</span>' +
                '<span>' + fmtKop(r.sum) + '</span>' +
                '<span class="dk-st done">' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' · ' +
                    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
                '<span></span></div>';
        }).join('');
    }
    // из пустого состояния — сразу к делу: тикет с лимиткой или полем суммы
    window.pftScDockLim = function () {
        if (scnTktView() === 'depth') window.pftScTkt('deal');
        window.pftScKind(1);   // переключит на лимит и сфокусирует поле цены
    };
    window.pftScDockBuy = function () {
        if (scnTktView() === 'depth') window.pftScTkt('deal');
        var i = dq('btSxSum'); if (i) try { i.focus(); } catch (e) {}
    };
    function dockAlertRows() {
        if (!ALERTS.length) return '<div class="dk-empty">Алертов нет — звоночек в шапке бумаги следит за ценой' +
            '<u role="button" tabindex="0" onclick="event.stopPropagation(); pftScBell()">Поставить алерт</u></div>';
        return ALERTS.map(function (a, i) {
            return '<div class="dk-r"><b>' + esc(a.ticker || '—') + '</b>' +
                '<span>' + (a.dir === 'up' ? 'выше' : 'ниже') + '</span>' +
                '<span><b>' + fmtPx(a.px, { meta: instrMem[a.uid] || null }) + ' ₽</b></span>' +
                '<span>сработает один раз</span><span></span><span></span>' +
                '<span class="dk-x" role="button" tabindex="0" onclick="pftScAlertDrop(' + i + ')">Убрать</span></div>';
        }).join('');
    }
    function scnDockHtml() {
        // закрытый росток — пустой узел (.dock:empty спрятан): полоса позиций
        // и есть его свёрнутое состояние
        if (!stageObj().layers.deck) return '';
        function tab(k, lab, cnt) {
            return '<span class="' + (dockTab === k ? 'on' : '') + '" role="tab" tabindex="0" ' +
                'aria-selected="' + (dockTab === k) + '" onclick="pftScDockTab(\'' + k + '\')">' + lab +
                (cnt ? ' <em>' + cnt + '</em>' : '') + '</span>';
        }
        var tabs = '<div class="dock-tabs">' +
            tab('orders', 'Заявки', T.orders.length + T.stops.length) +
            tab('pos', 'Позиции', (T.port.list || []).length) +
            tab('hist', 'История') +
            tab('alerts', 'Алерты', ALERTS.length) +
            '<button type="button" class="keys" onclick="pftFsKeys()">? клавиши</button>' +
            '<button type="button" class="shev" onclick="pftScDockShev()" aria-label="Свернуть панель">⌄</button></div>';
        var body = dockTab === 'orders' ? dockOrdersRows()
            : dockTab === 'pos' ? dockPosRows()
            : dockTab === 'hist' ? dockHistRows()
            : dockAlertRows();
        var head = dockTab === 'orders'
            ? '<div class="dk-hd"><span>Бумага</span><span>Сторона</span><span>Тип и цена</span><span>Кол-во</span><span>Исполнено</span><span>Статус</span><span></span></div>'
            : dockTab === 'pos'
                ? '<div class="dk-hd"><span>Бумага</span><span>Кол-во</span><span>Средняя</span><span>Текущая</span><span>Прибыль</span><span>Доходность</span><span></span></div>'
                : '';
        return tabs + head + '<div class="dk-body">' + body + '</div>';
    }

    // ---- «Счёт» — выезжающий блок правого нижнего угла (владелец 2026-07-23):
    // деньги собраны у места, где их тратят. Низ карточки = низ ростка (96),
    // раскрывается вверх из-под карточки сделки, ручка — в полосе позиций
    function acctBlocked() {
        var sum = 0;
        T.orders.forEach(function (o) {
            if (o.direction !== 'ORDER_DIRECTION_BUY') return;
            var left = Math.max(0, (+o.lotsRequested || 0) - (+o.lotsExecuted || 0));
            var lot = (instrMem[o.instrumentUid] || {}).lot || 1;
            var px = ordPx(o, metaSlot(o.instrumentUid));
            if (px > 0 && left > 0) sum += px * left * lot;
        });
        return sum;
    }
    function acctDayPnl() {
        var sum = 0, have = false;
        (T.port.list || []).forEach(function (p) {
            var cl = (T.closes || {})[p.uid];
            if (!(cl > 0) || !(p.last > 0)) return;
            sum += (p.last - cl) * p.qty;
            have = true;
        });
        return have ? sum : null;
    }
    function scnAcctHtml() {
        if (!stageObj().layers.acct) return '';
        var free = T.pos.money;
        var val = portValue();
        var blk = acctBlocked();
        var pnl = acctDayPnl();
        function row(lab, v, cls) {
            return '<div class="ac-r' + (cls || '') + '"><span>' + lab + '</span><b>' + v + '</b></div>';
        }
        var total = (free != null || val != null) ? (free || 0) + (val || 0) : null;
        return '<div class="ac-h"><b>Счёт</b><em>' + ((conn() || {}).sandbox ? 'песочница' : 'брокерский') + '</em>' +
            '<button type="button" class="shev" onclick="pftScAcct()" aria-label="Свернуть счёт">⌄</button></div>' +
            row('Свободные деньги', free != null ? fmtRub(free) : '—') +
            (blk > 0 ? row('Ждут в заявках на покупку', '≈ ' + fmtRub(blk)) : '') +
            row('Портфель', val != null ? fmtRub(val) : '—') +
            (pnl != null ? row('Итог дня', (pnl >= 0 ? '+' : '−') + fmtRub(Math.abs(pnl)),
                pnl >= 0 ? ' g' : ' r') : '') +
            (total != null ? row('Всего средств', fmtRub(total), ' sum') : '');
    }
    window.pftScAcct = function () {
        var o = stageObj();
        o.layers.acct = o.layers.acct ? 0 : 1;
        saveStageRaw(o);
        var sc = dq('btScene'); if (sc) sc.dataset.acct = o.layers.acct ? '1' : '0';
        scnSet('btScnAcct', scnAcctHtml());
        scnSet('btScnAcctW', scnAcctBtnHtml());   // стрелка на ручке
        scnAcctFit();
    };
    // карточка сделки поджимается вверх над открытым «Счётом» (владелец
    // 2026-07-24) — та же механика, что у героя над ростком (scnDockFit).
    // Кнопка «Купить» обязана остаться на экране (закон «контент виджета
    // подстраивается»): вторичные строки прячет CSS [data-acct], а если сцене
    // не хватает высоты — счёт частично накрывает тикет (z-index), но тикету
    // гарантирован минимум высоты под рабочие строки
    var TKT_MIN_H = 540;
    function scnAcctFit() {
        var el = dq('btScene'), a = dq('btScnAcct');
        if (!el) return;
        if (a && a.childElementCount) {
            var want = a.offsetHeight + 96 + 12;
            var lim = el.clientHeight - 122 - TKT_MIN_H;   // тикету — минимум
            el.style.setProperty('--bts-acct', Math.max(96 + 12, Math.min(want, lim)) + 'px');
        } else el.style.removeProperty('--bts-acct');
        scnDockFit();   // высота счёта — минимум высоты ростка (верхи вровень)
        // глубина карточного стакана зависит от высоты — пересчитать после пружины
        clearTimeout(scnAcctFit._t);
        scnAcctFit._t = setTimeout(function () {
            var tv = scnTktView();
            if (tv !== 'deal' && sceneLive()) {
                scnDepthSet('btScnTkDepth', S(sxSlot()), tv === 'depth' ? 1 : 0, scnDepthDeep());
            }
        }, 520);
    }

    // ---- экраны trading:N — вкладки в строке среды (механика раунда 1) ----
    var SCN_SCREENS_MAX = 8;
    function scnScreensHtml() {
        var tabs = PF.pfxTradeTabs ? PF.pfxTradeTabs() : ['trading'];
        var cur = PF.pfxTab;
        var html = tabs.map(function (t) {
            var name = (PF.pfxTradeName && PF.pfxTradeName(t)) || 'Основной';
            var on = t === cur;
            // переименование — двойным кликом, но только на АКТИВНОЙ вкладке:
            // клик по чужой переключает экран с полной перерисовкой, и второй
            // клик двойного пришёлся бы в мёртвый узел (владелец 2026-07-23).
            // Перетаскивание — механика pfxReorderTrade полосы раунда 1; ✕ на
            // ховере (кроме первого экрана) удаляет экран в два клика
            var x = t !== 'trading'
                ? '<i class="sct-x" role="button" tabindex="0" aria-label="Удалить экран" ' +
                  'onclick="pftScScreenDel(event,\'' + jsArg(t) + '\')">✕</i>'
                : '';
            return '<span class="sct' + (on ? ' on' : '') + '" role="tab" tabindex="0" draggable="true" ' +
                'aria-selected="' + on + '" onclick="pftScScreenGo(\'' + jsArg(t) + '\')" ' +
                'ondragstart="pftScScreenDrag(event,\'' + jsArg(t) + '\')" ' +
                'ondragover="event.preventDefault()" ' +
                'ondrop="pftScScreenDrop(event,\'' + jsArg(t) + '\')"' +
                (on ? ' ondblclick="pftScScreenRen(event,\'' + jsArg(t) + '\')" title="Двойной клик — переименовать экран"' : '') +
                '><b class="sct-l">' + esc(name) + '</b>' + x + '</span>';
        }).join('');
        if (tabs.length < SCN_SCREENS_MAX) {
            html += '<span class="sct" role="button" tabindex="0" onclick="pftScScreenAdd()" ' +
                'title="Новый экран со своими бумагами">＋</span>';
        }
        return html;
    }
    window.pftScScreenGo = function (t) {
        if (window.pfxGoTab) window.pfxGoTab(t);
    };
    // ход «завести экран» — как в полосе раунда 1: сид собирает раскладку по
    // свободной бумаге (dashCfgFor на незнакомом ключе), потом переход и
    // сохранение — экран переживает перезагрузку и уезжает в облако
    window.pftScScreenAdd = function () {
        var tabs = PF.pfxTradeTabs ? PF.pfxTradeTabs() : ['trading'];
        if (tabs.length >= SCN_SCREENS_MAX) {
            toast('Экранов уже ' + SCN_SCREENS_MAX + ' — удалите ненужный', true);
            return;
        }
        var used = tabs.map(function (t) { return PF.pfxTradeNo ? PF.pfxTradeNo(t) : 1; });
        for (var i = 2; i <= SCN_SCREENS_MAX; i++) {
            if (used.indexOf(i) >= 0) continue;
            var key = 'trading:' + i;
            try { PF.dashCfgFor(key); } catch (e) {}
            if (window.pfxGoTab) window.pfxGoTab(key);
            if (PF.saveDashCfg) PF.saveDashCfg();
            toast('Новый экран — найдите бумагу через ⌘K');
            return;
        }
    };
    // инлайн-переименование активного экрана (владелец 2026-07-23): вкладка
    // на время ввода становится полем, Enter/уход сохраняет, Esc отменяет.
    // Имя живёт в конфиге раскладки и едет в облако (PF.pfxRenameTrade)
    window.pftScScreenRen = function (ev, t) {
        if (ev && ev.preventDefault) { ev.preventDefault(); ev.stopPropagation(); }
        var tab = ev && ev.target && ev.target.closest ? ev.target.closest('.sct') : null;
        if (!tab || tab.querySelector('input')) return;
        var was = (PF.pfxTradeName && PF.pfxTradeName(t)) || '';
        tab.classList.add('ren');
        tab.innerHTML = '<input maxlength="40" value="' + esc(was) + '" aria-label="Имя экрана">';
        var inp = tab.querySelector('input');
        inp.focus(); inp.select();
        var did = false;
        function done(save) {
            if (did) return; did = true;
            if (save && PF.pfxRenameTrade) PF.pfxRenameTrade(t, inp.value);
            // мимо кэша scnSet: innerHTML вкладки правился руками, кэш врёт
            var el = dq('btScnScr');
            if (el) { el.__btHtml = null; el.innerHTML = scnScreensHtml(); }
        }
        // стоп всплытию: пока имя набирается, клавиши сцены (⌘K и др.) молчат
        inp.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') done(true);
            else if (e.key === 'Escape') done(false);
        });
        inp.addEventListener('blur', function () { done(true); });
    };
    // тот же ввод из меню «⋯» — для тех, кто не догадается о двойном клике
    window.pftScScreenRenCur = function () {
        var el = document.querySelector('#btScnScr .sct.on');
        if (!el) return;
        window.pftScScreenRen({ target: el }, PF.pfxTab);
    };
    // перестановка вкладок — жест drag поверх механики pfxReorderTrade
    // (владелец 2026-07-23): порядок общий с полосой раунда 1 (pf_trade_order_v1)
    var scnScrDrag = '';
    window.pftScScreenDrag = function (ev, t) {
        scnScrDrag = t;
        try { ev.dataTransfer.setData('text/plain', t); ev.dataTransfer.effectAllowed = 'move'; } catch (e) {}
    };
    window.pftScScreenDrop = function (ev, t) {
        if (ev) ev.preventDefault();
        var d = scnScrDrag; scnScrDrag = '';
        if (!d || d === t || !PF.pfxReorderTrade) return;
        if (PF.pfxReorderTrade(d, t)) {
            var el = dq('btScnScr');
            if (el) { el.__btHtml = null; el.innerHTML = scnScreensHtml(); }
        }
    };
    // удаление экрана — в два клика (владелец 2026-07-23): первый клик по ✕
    // взводит «удалить?», второй в течение 3 секунд удаляет раскладку экрана
    // (pfxDropTabCfg). Первый экран не удаляется — он и есть «Торговля»
    window.pftScScreenDel = function (ev, t) {
        if (ev) ev.stopPropagation();
        var x = ev && ev.target && ev.target.closest ? ev.target.closest('.sct-x') : null;
        if (!x || t === 'trading') return;
        if (!x.classList.contains('arm')) {
            x.classList.add('arm');
            x.textContent = 'удалить?';
            setTimeout(function () {
                if (x.isConnected) { x.classList.remove('arm'); x.textContent = '✕'; }
            }, 3000);
            return;
        }
        var wasCur = PF.pfxTab === t;
        if (PF.pfxDropTabCfg) PF.pfxDropTabCfg(t);
        toast('Экран удалён — бумаги остались в слотах');
        if (wasCur && window.pfxGoTab) window.pfxGoTab('trading');
        else {
            var el = dq('btScnScr');
            if (el) { el.__btHtml = null; el.innerHTML = scnScreensHtml(); }
        }
    };

    // ---- сцена целиком ----
    // пустая сцена: токен есть, бумага ещё не выбрана (онбординг этапа «край
    // сцены» доскажет остальное — пока одно действие, как решено мокапом 11)
    // онбординг первого входа (экран 11): токен есть, бумаги нет. Полоса
    // позиций у новичка и так пуста (scnPosInner молчит) — приглашение одно
    function scnHelloHtml() {
        return '<div class="bts-hello">' +
            '<h3>Одна бумага — в центре сцены</h3>' +
            '<p>Найдите её по названию или тикеру: цена встанет крупно, график займёт весь холст. ' +
            'Остальное появится по мере опыта.</p>' +
            // ниже кнопки — ничего: приглашение заканчивается действием
            // (владелец 2026-07-23, шпаргалка из трёх строк удалена)
            '<button type="button" onclick="pftFsSearch()">' + IC_LENS + '<span>Найти первую бумагу</span><kbd>⌘K</kbd></button>' +
        '</div>';
    }
    PF.pftSceneHtml = function () {
        loadSlots();
        var st = stageObj();
        var n = sxSlot(), s = S(n);
        if (s.uid) sxLoadCandles(s.uid);
        var tktVw = RP ? 'deal' : scnTktView();
        var body = s.meta
            ? scnHeroHtml(n, s) +
              '<aside class="tkt' + (tktVw === 'split' ? ' tkt-x2' : '') + '" id="btScnTicket">' + scnTicketHtml(n) + '</aside>' +
              (RP ? '' : '<div class="dock" id="btScnDock">' + scnDockHtml() + '</div>' +
                         '<div class="acct" id="btScnAcct">' + scnAcctHtml() + '</div>')
            : scnHelloHtml();
        // реплей: полосу позиций подменяет плёнка-бар (живой брокер спит),
        // росток и «Счёт» закрыты — их данные из настоящего, не из прошлого
        return '<div class="bts' + (sceneNight() ? ' night' : '') + '" id="btScene" data-stage="start" ' +
            'data-tkt="' + tktVw + '" data-deck="' + (!RP && st.layers.deck ? 1 : 0) + '" ' +
            'data-acct="' + (!RP && st.layers.acct ? 1 : 0) + '" data-wl="' + (st.layers.wl ? 1 : 0) + '">' +
            envRowHtml() +
            '<div class="bts-glow"></div>' +
            '<aside class="bts-wl" id="btScnWl">' + scnWlHtml() + '</aside>' +
            body +
            (RP
                ? '<div class="rp-bar" id="btScnRp">' + rpBarHtml() + '</div>' +
                  '<div class="rp-donew" id="btScnRpDone">' + rpOverHtml() + '</div>'
                : '<div class="pos-strip" id="btScnPos">' + scnPosInner() + '</div>' +
                  (s.meta ? '<div class="ps-acctw" id="btScnAcctW">' + scnAcctBtnHtml() + '</div>' : '')) +
        '</div>';
    };

    // ---- точечные перерисовки сцены ----
    function scnSet(id, html) {
        var el = dq(id);
        if (el && el.__btHtml !== html) { el.__btHtml = html; el.innerHTML = html; }
    }
    // тик данных: цена, факты, график, тикет и чипы — точечно, поле ввода не трогаем
    function sxTick() {
        if (!sceneLive()) return;
        var n = sxSlot(), s = S(n);
        // бумагу сцены сменили под живым реплеем — плёнка честно выключается
        if (RP && s.uid !== RP.uid) rpHalt();
        if (s.meta) {
            scnSet('btScnFresh', scnFreshInner());
            scnTicketBits();
            scnSet('btScnPrice', scnPriceHtml(s));
            // свечи живут своим канвасом (движок), innerHTML их убил бы;
            // линия — прежний точечный своп svg
            if (RP) scnSet('btScnChart', rpChartHtml(s));
            else if (candlesOn() || scnCmpGet().length) {
                scnKMount(); scnKTags(); scnKFills(); scnKProfile(); scnKCmp();
            } else scnSet('btScnChart', scnChartHtml(s));
            scnSet('btScnKnow', scnKnowHtml(n));
            // стакан в карточке тикета (вид «Стакан»/«Сплит») — жив тиками
            var tv = scnTktView();
            if (tv !== 'deal') scnDepthSet('btScnTkDepth', s, tv === 'depth' ? 1 : 0, scnDepthDeep());
            // открытый росток заявок/позиций — жив теми же тиками
            if (stageObj().layers.deck) { scnSet('btScnDock', scnDockHtml()); scnDockFit(); }
            // открытый «Счёт» — деньги и итог дня живут тиками
            if (stageObj().layers.acct) { scnSet('btScnAcct', scnAcctHtml()); scnAcctFit(); }
        }
        scnSet('btScnPos', scnPosInner());
        scnSet('btScnAcctW', scnAcctBtnHtml());
        wlPaint();   // активная строка рейки избранного ходит за бумагой сцены
    }
    // куски тикета, зависящие от суммы: сам инпут никогда не пересобирается —
    // каретка и фокус переживают любой тик котировок
    function scnCapInner() {
        var free = scnFree();
        if (RP) return 'виртуально ' + fmtRub(free);
        return free != null ? 'свободно ' + fmtRub(free) : '';
    }
    // баннер обрыва (экран 11): честно называем возраст данных на экране.
    // Уже отправленные заявки живут на бирже и от нашей связи не зависят.
    function scnStaleInner(n) {
        var l = linkState(S(n));
        if (l.state !== 'stale') return '';
        return '<div class="eg-banner" title="Уже отправленные заявки живут на бирже и не зависят ' +
            'от вашей связи — их статус обновится при восстановлении. Ничего не отменяется молча.">' +
            '<i></i>Показываем последние известные данные — им ' + ageTxt(l.ageMs) + '</div>';
    }
    function scnTicketBits() {
        if (!sceneLive()) return;
        var n = sxSlot();
        if (!S(n).meta) return;
        scnSet('btScnCap', scnCapInner());
        scnSet('btScnStale', scnStaleInner(n));   // возраст данных в баннере тикает
        scnSet('btScnPre', scnPresetsHtml(n));
        scnSet('btScnApx', scnApxHtml(n));
        scnSet('btScnAvg', scnAvgHtml(n));
        scnSet('btScnWarn', scnWarnHtml(n));
        scnSet('btScnRest', scnRestHtml(n));
        scnSet('btScnCta', scnCtaHtml(n));
        // поле краснеет вместе с недостачей (мокап 08, состояние «не хватает»)
        var fld = dq('btScnFld');
        if (fld) fld.classList.toggle('err', scnShortfall(n) > 0);
        // «сейчас X ₽» в строке цены живёт тиком, сам инпут цены — нет
        var now = dq('btScnPxNow');
        if (now) {
            var s = S(n), last = sxPrice(s);
            var lim = s.kind === 'limit' && +s.price > 0;
            var t = last > 0 ? 'сейчас ' + fmtPx(last, s) + (lim ? '' : ' ₽') : '';
            if (now.textContent !== t) now.textContent = t;
        }
    }
    // высота сцены — по факту, как sxFit раунда 1: сверху набегает переменный
    // хром, а zoom 0.9 отдаёт rect в экранных пикселях (делим на zoom)
    function scnFit() {
        var el = dq('btScene');
        if (!el) return;
        var z = parseFloat(getComputedStyle(document.body).zoom) || 1;
        var h = (window.innerHeight - el.getBoundingClientRect().top) / z;
        if (h > 480) el.style.height = h + 'px';
        scnDockFit();
        scnAcctFit();
    }
    // низ героя — от фактической высоты открытого ростка: она меняется
    // вкладкой дока, а зазор к ней обязан оставаться воздухом 12px
    function scnDockFit() {
        var el = dq('btScene'), d = dq('btScnDock');
        if (!el) return;
        // 96 — низ ростка выровнен с низом карточки сделки (владелец 2026-07-23)
        if (d && d.childElementCount) {
            // при открытом «Счёте» верх ростка — на линии верха его карточки
            // (владелец 2026-07-24): низы у обоих 96, равняем высоты
            var a = dq('btScnAcct');
            var ah = a && a.childElementCount ? a.offsetHeight : 0;
            d.style.minHeight = ah ? ah + 'px' : '';
            el.style.setProperty('--bts-dock', (d.offsetHeight + 96 + 12) + 'px');
        } else {
            if (d) d.style.minHeight = '';
            el.style.removeProperty('--bts-dock');
        }
    }
    window.addEventListener('resize', scnFit);
    var sxT = null;
    function sxWire() {
        var i = dq('btSxSum');
        if (!i || i._wired) return;
        i._wired = true;
        i.addEventListener('input', function () {
            simpleSum = i.value.replace(/[^\d]/g, '');
            if (i.value !== simpleSum) i.value = simpleSum;
            clearTimeout(sxT);
            sxT = setTimeout(scnTicketBits, 120);
        });
        // Enter только пересчитывает тикет — НЕ отправляет (закон клавиш)
        i.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); scnTicketBits(); }
        });
        // лимитная цена («Разгон»+): свой инпут в строке цены, та же бережность
        var li = dq('btScnLimIn');
        if (li && !li._wired) {
            li._wired = true;
            li.addEventListener('input', function () {
                var s = S(sxSlot());
                s.price = numStr(li.value.replace(',', '.'));
                saveSoon();
                clearTimeout(sxT);
                sxT = setTimeout(scnTicketBits, 120);
            });
            li.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); scnTicketBits(); }
            });
        }
    }
    window.pftSxSide = function (side) {
        var n = sxSlot(), s = S(n);
        s.side = side === 'sell' ? 'sell' : 'buy';
        // единица счёта меняется вместе с задачей — прежнее число тут
        // бессмысленно; лимитка у спреда и единица тоже сбрасываются к дефолту
        simpleSum = '';
        scnUnit = '';
        scnLim = 0;
        scnSweep = null;   // ручная смена стороны отменяет выбранный свип
        saveSlots();
        var el = dq('btScnTicket');
        if (el) { el.innerHTML = scnTicketHtml(n); sxWire(); }
    };
    window.pftSxQuick = function (v) {
        v = Math.max(0, Math.floor(+v || 0));
        simpleSum = v > 0 ? String(v) : '';
        var i = dq('btSxSum'); if (i) i.value = simpleSum;
        scnTicketBits();
    };
    window.pftSxMax = function () {
        var free = scnFree();
        if (!(free > 0)) { toast('Свободные деньги ещё не пришли от брокера — секунду', true); return; }
        window.pftSxQuick(Math.floor(free));
    };
    // отправка — только этой кнопкой; дальше модалка «Проверьте заказ»
    window.pftSxGo = function () {
        var n = sxSlot(), s = S(n);
        var buy = s.side !== 'sell';
        var c = scnCalc(n);
        if (!c || !c.lots) { toast(buy ? 'Укажите сумму покупки' : 'Укажите, сколько продать', true); return; }
        if (scnShortfall(n) > 0 || (!buy && c.qty > haveQty(s))) return;   // кнопка и так гашена с причиной
        var stop = scnSubmitBlock(n);
        if (stop) { toast(stop, true); return; }
        // реплей: сделка виртуальная и мгновенная — по цене плёнки, без брокера
        if (RP) { rpTrade(n, c, buy); return; }
        if (velBlock()) return;
        s.lots = c.lots;
        // лимитка сцены (строка цены «Разгона» или гвард «Старта») — уважаем;
        // иначе «купить сейчас» остаётся рыночной заявкой. В АУКЦИОНЕ рыночной
        // не существует — уходит лимитка по индикативной цене («спишется до»)
        var lim = scnLimPx(s);
        if (!(lim > 0) && scnMktState(s) === 'auction') lim = sxPrice(s);
        if (lim > 0) { s.kind = 'limit'; s.price = String(scnSnap(lim, s)); }
        else s.kind = 'market';
        ensureOrderId(s, ['sx', s.uid, s.side, s.kind, c.lots].join('|'));
        saveSlots();
        sxConfirm(n, s, c, buy);
    };
    loadFills();

    // подтверждение — карточка САМОЙ СЦЕНЫ (владелец 2026-07-23: язык сцены,
    // не модалка раунда 1): вуаль + карточка в темах сцены, полная сумма с
    // копейками, НКД, комиссия и «что произойдёт» словами. Конструкторный
    // тикет вне сцены живёт прежней модалкой (sxConfirmModal ниже)
    function sxConfirm(n, s, c, buy) {
        var sc = dq('btScene');
        if (!sc) { sxConfirmModal(n, s, c, buy); return; }
        var cn = conn() || {};
        var free = T.pos.money;
        var old = dq('btScnCfV'); if (old) old.remove();
        var oldC = dq('btScnCf'); if (oldC) oldC.remove();
        var kindRow = s.kind === 'limit'
            ? '<span>По лимиту</span><b>' + fmtPx(c.px, s) + ' ₽ за штуку</b>'
            : '<span>Примерно по</span><b>' + fmtPx(c.px, s) + ' ₽ за штуку</b>';
        sc.insertAdjacentHTML('beforeend',
            '<div class="veil" id="btScnCfV"></div>' +
            '<div class="cf2" id="btScnCf" role="dialog" aria-modal="true" aria-label="Проверьте заказ">' +
                '<h3>Проверьте заказ</h3>' +
                '<div class="cf2-sub">' + (buy ? 'Покупка' : 'Продажа') + ' · ' +
                    esc(s.meta.name || s.meta.ticker) +
                    (cn.sandbox ? '<i>песочница</i>' : '') + '</div>' +
                '<div class="cf2-rows">' +
                    '<div><span>Бумага</span><b>' + esc(s.meta.ticker) + '</b></div>' +
                    '<div><span>Сколько</span><b>' + c.qty.toLocaleString('ru-RU') + ' шт · ' +
                        c.lots + ' ' + PF.plural(c.lots, 'лот', 'лота', 'лотов') + '</b></div>' +
                    '<div>' + kindRow + '</div>' +
                    (c.aci > 0 ? '<div><span>Накопленный купон</span><b>' + (buy ? '' : '+') + fmtKop(c.aci) + '</b></div>' : '') +
                    '<div><span>Комиссия брокера</span><b>' + fmtKop(c.fee) + '</b></div>' +
                '</div>' +
                '<div class="cf2-tot"><span>' + (buy ? 'Спишется со счёта' : 'Придёт на счёт') + '</span><b>' +
                    fmtKop(c.total) + '</b></div>' +
                (free != null ? '<div class="cf2-rest">' + (buy ? 'останется' : 'станет') + ' свободно ' +
                    fmtKop(buy ? free - c.total : free + c.total) + '</div>' : '') +
                '<div class="cf2-know">' + (s.kind === 'limit'
                    ? 'Исполнится по вашей цене или лучше — когда рынок до неё дойдёт. Пока заявка ждёт, деньги заблокированы; отменить можно в любой момент.'
                    : 'Исполнится по лучшей цене на бирже в этот момент — обычно разница в копейки, на редких бумагах бывает заметнее.') + '</div>' +
                '<div class="cf2-act">' +
                    '<button type="button" class="cf2-no" id="btScnCfNo">Отмена</button>' +
                    '<button type="button" class="cf2-go' + (buy ? '' : ' sell') + '" id="btScnCfYes">' +
                        (buy ? 'Купить' : 'Продать') + '</button>' +
                '</div>' +
            '</div>');
        function closeCf() {
            var v = dq('btScnCfV'), k = dq('btScnCf');
            if (v) v.remove(); if (k) k.remove();
            document.removeEventListener('keydown', onKey, true);
        }
        function onKey(e) {
            if (e.key === 'Escape') { e.stopPropagation(); closeCf(); }
        }
        document.addEventListener('keydown', onKey, true);
        dq('btScnCfV').addEventListener('click', closeCf);
        dq('btScnCfNo').addEventListener('click', closeCf);
        dq('btScnCfYes').addEventListener('click', function () {
            // связь могла умереть, пока читали заказ, — гвард свежести
            // продублирован в карточке (закон раунда 1)
            var late = scnSubmitBlock(n);
            if (late) { closeCf(); toast(late + ': проверьте цену заново, заявка не отправлена', true); return; }
            closeCf();
            submitOrder(n, c.lots, c.px, c.total);
        });
        setTimeout(function () {
            var f = dq('btScnCfYes');
            if (f) try { f.focus(); } catch (e) {}
        }, 30);
    }
    function sxConfirmModal(n, s, c, buy) {
        var cn = conn() || {};
        var free = T.pos.money;
        var m = openModal({ id: 'btSxCfOv', className: 'bk-ov sx-cf-ov', card: '<div class="bk-card sx-cf">' +
            '<h3>Проверьте заказ</h3>' +
            '<div class="sx-cf-sub">' + (buy ? 'Покупка' : 'Продажа') + ' ' +
                esc(s.meta.name || s.meta.ticker) + (cn.sandbox ? ' на тренировочном счёте' : '') + '</div>' +
            '<div class="sx-cf-rows">' +
                '<div class="sx-cf-r"><span>Что ' + (buy ? 'покупаете' : 'продаёте') + '</span><b>' +
                    esc(s.meta.name || '') + ' · ' + esc(s.meta.ticker) + '</b></div>' +
                '<div class="sx-cf-r"><span>Сколько</span><b>' + c.qty.toLocaleString('ru-RU') + ' шт</b></div>' +
                '<div class="sx-cf-r"><span>' + (s.kind === 'limit' ? 'По лимиту' : 'Примерно по') + '</span><b>' +
                    fmtPx(c.px, s) + ' ₽ за штуку</b></div>' +
                (c.aci > 0 ? '<div class="sx-cf-r"><span>Накопленный купон</span><b>' +
                    (buy ? '' : '+') + fmtKop(c.aci) + '</b></div>' : '') +
                '<div class="sx-cf-r"><span>Комиссия брокера</span><b>' + fmtKop(c.fee) + '</b></div>' +
                '<div class="sx-cf-r tot"><span>' + (buy ? 'Спишется со счёта' : 'Придёт на счёт') + '</span><b>' +
                    fmtKop(c.total) + '</b></div>' +
                (free != null ? '<div class="sx-cf-r"><span>' + (buy ? 'Останется' : 'Станет') + ' свободно</span><b>' +
                    fmtKop(buy ? free - c.total : free + c.total) + '</b></div>' : '') +
            '</div>' +
            '<div class="sx-cf-warn">' + IC_SHIELD + '<span>' + (s.kind === 'limit'
                ? 'Лимитная заявка исполнится по вашей цене или лучше — когда рынок до неё дойдёт. ' +
                  'Пока она ждёт, деньги заблокированы; отменить можно в любой момент.'
                : 'Цена может немного отличаться. Заявка исполнится по ' +
                  'лучшей цене на бирже в этот момент — обычно разница в копейки, но на редких бумагах бывает заметнее.') +
            '</span></div>' +
            '<div class="sx-cf-act">' +
                '<button type="button" class="sx-cf-b ghost" id="btSxCfNo">Отмена</button>' +
                '<button type="button" class="sx-cf-b go' + (buy ? '' : ' sell') + '" id="btSxCfYes">' +
                    (buy ? 'Купить' : 'Продать') + '</button>' +
            '</div>' +
            (cn.sandbox ? '<div class="sx-cf-sand">Это тренировочный счёт — деньги не настоящие</div>' : '') +
        '</div>' });
        var ov = m.el, close = m.close;
        ov.querySelector('#btSxCfNo').addEventListener('click', close);
        setTimeout(function () {
            var f = dq('btSxCfYes');
            if (f) try { f.focus(); } catch (e) {}
        }, 30);
        ov.querySelector('#btSxCfYes').addEventListener('click', function () {
            // связь могла умереть, пока читали заказ, — гвард свежести
            // продублирован в диалоге (закон раунда 1); он же ловит закрытие
            // биржи и исчезнувшую сторону стакана
            var late = scnSubmitBlock(n);
            if (late) { close(); toast(late + ': проверьте цену заново, заявка не отправлена', true); return; }
            close();
            submitOrder(n, c.lots, c.px, c.total);
        });
    }

    // ПОДСКАЗКА ПО КЛАВИШАМ. Клавиши были реализованы давно, но не названы нигде —
    // то есть их не существовало ни для кого, кроме автора. Список тут ЗЕРКАЛИТ
    // обработчик ниже: добавляя клавишу туда, добавляй строку сюда.
    var KEYS = [
        ['B', 'Купить — переключить тикет на покупку'],
        ['S', 'Продать — переключить тикет на продажу'],
        ['/', 'Найти бумагу'],
        ['↑ ↓', 'Цена на шаг инструмента (лимитная и стоп-заявка)'],
        ['Esc', 'Выйти из поля ввода, затем — из полноэкранного режима'],
        ['?', 'Эта подсказка']
    ];
    window.pftFsKeys = function () {
        fsMenuClose();
        // ✕ — именно .bk-x: класс .bk-back здесь был бы подложкой во всю карточку
        var m = openModal({ id: 'btKeysOv', card: '<div class="bk-card btr-keys">' +
            '<button type="button" class="bk-x" aria-label="Закрыть">✕</button>' +
            '<h3>Клавиши терминала</h3>' +
            '<div class="btr-keys-list">' + KEYS.map(function (k) {
                return '<div class="btr-keys-row"><kbd>' + esc(k[0]) + '</kbd><span>' + esc(k[1]) + '</span></div>';
            }).join('') + '</div>' +
            // это не мелкий шрифт внизу, а главное свойство: в терминале с
            // деньгами случайное нажатие не должно совершать сделку
            '<div class="btr-keys-note">Ни одна клавиша не отправляет заявку. Они только заполняют тикет — ' +
            'отправка остаётся кнопкой с подтверждением.</div>' +
        '</div>' });
        m.el.querySelector('.bk-x').addEventListener('click', m.close);
    };

    // ---------- горячие клавиши ----------
    // ЖЁСТКОЕ ПРАВИЛО: ни одна клавиша не отправляет заявку. Терминал с деньгами
    // не должен позволять случайному нажатию совершить сделку — клавиши только
    // заполняют тикет, отправка остаётся кнопкой с модалкой подтверждения.
    // Раскладка читается по e.code (KeyB/KeyS), а не по e.key: на кириллице
    // те же клавиши дают «и» и «ы», и терминал переставал слушаться.
    var hotSlot = 1;   // слот, с которым последним работали
    document.addEventListener('focusin', function (e) {
        var card = e.target && e.target.closest && e.target.closest('.btr-card[data-slot]');
        if (card) hotSlot = slotNo(card.getAttribute('data-slot'));
    });
    document.addEventListener('pointerdown', function (e) {
        var card = e.target && e.target.closest && e.target.closest('.btr-card[data-slot]');
        if (card) hotSlot = slotNo(card.getAttribute('data-slot'));
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        // гейт: старые карточки терминала ИЛИ сцена «Эволюции» — набор клавиш
        // раунда 1 работает на сцене без изменений (мокап 06, пин 3)
        var scene = sceneLive();
        if (!scene && !document.querySelector('#panel-portfolios.active .btr-ob')) return;
        if (dq('btConfirmOv') || dq('btSxCfOv')) return;   // модалка подтверждения — её клавиши
        var t = e.target, tag = (t && t.tagName) || '';
        var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
        if (e.key === 'Escape') {
            if (typing && t.blur) { t.blur(); e.preventDefault(); }
            return;
        }
        if (typing) return;                        // в поле клавиши принадлежат полю
        // рейка избранного (раунд 3): F — открыть/закрыть, цифры 1–9 — бумага
        // в сцену; работают и при закрытой рейке, бумага в слоте не обязательна
        if (scene && e.code === 'KeyF' && !e.shiftKey) {
            e.preventDefault(); window.pftScWl(); return;
        }
        if (scene && /^Digit[1-9]$/.test(e.code)) {
            var favs = wlList(), fi = +e.code.slice(5) - 1;
            if (favs[fi]) { e.preventDefault(); window.pftScWlGo(favs[fi]); }
            return;
        }
        var n = scene ? sxSlot() : hotSlot, s = S(n);
        if (!s.uid) return;
        if (e.code === 'KeyB' || e.code === 'KeyS') {
            e.preventDefault();
            if (scene) window.pftSxSide(e.code === 'KeyB' ? 'buy' : 'sell');
            else window.pftSide(n, e.code === 'KeyB' ? 'buy' : 'sell');
            return;
        }
        if (e.code === 'Slash') {                  // «/» — открыть поиск бумаги
            e.preventDefault();
            // «?» — это Shift+«/»: та же клавиша, но вопрос про клавиши, а не поиск
            if (e.shiftKey) { window.pftFsKeys(); return; }
            if (scene) { window.pftFsSearch(); return; }
            if (window.pftSearchToggle) window.pftSearchToggle(n);
            return;
        }
        // стрелки двигают цену на шаг инструмента — привычный жест терминалов
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
            var field = s.kind === 'limit' ? 'price' : (s.kind === 'stop' ? 'stopPrice' : '');
            if (!field) return;
            var cur = +s[field] || 0;
            if (!(cur > 0)) return;
            e.preventDefault();
            var inc = (s.meta && s.meta.minInc) || 0.01;
            var next = Math.max(0, +(cur + (e.code === 'ArrowUp' ? inc : -inc)).toFixed(6));
            if (!(next > 0)) return;
            s[field] = String(next);
            if (scene) {
                var li = dq('btScnLimIn');
                if (li) li.value = s[field];
                saveSoon(); scnTicketBits();
                return;
            }
            var inp = dqs(field === 'price' ? 'Price' : 'Stop', n);
            if (inp) { inp.value = s[field]; fitBig(inp); }
            repaintWarns(n); repaintTicketBits(n); saveSoon(); maxSoon(n);
        }
    });

    loadSlots();
    loadBrackets();   // пары «стоп + тейк» переживают перезагрузку страницы
    loadFavs();
    loadAlerts();

    PF.pftTerminalHtml = pftTerminalHtml;
    PF.pftAfterRender = pftAfterRender;
    // карточки-блоки для дашборд-конструктора «Торговли» (см. portfolios-dash.js)
    PF.pftObCard = obCard;
    PF.pftTicketCard = ticketCard;
    PF.pftOrdersCard = ordersCard;
    PF.pftPosCard = posCard;
    // Для графика (portfolios-chart.js): активные заявки и средняя цена позиции
    // по бумаге — он рисует их горизонтальными линиями поверх свечей.
    PF.pftLinesFor = function (uid) {
        if (!uid) return [];
        var out = [];
        function px(o) { return ordPx(o, metaSlot(uid)); }
        T.orders.forEach(function (o) {
            if (o.instrumentUid !== uid || o.orderType === 'ORDER_TYPE_MARKET') return;
            var p = px(o);
            if (p > 0) out.push({ px: p, kind: 'order', buy: o.direction === 'ORDER_DIRECTION_BUY',
                lots: Math.max(0, (+o.lotsRequested || 0) - (+o.lotsExecuted || 0)) });
        });
        T.stops.forEach(function (o) {
            if (o.instrumentUid !== uid) return;
            var p = A().q2n(o.stopPrice);
            if (p > 0) out.push({ px: p, kind: 'stop', buy: o.direction === 'STOP_ORDER_DIRECTION_BUY',
                lots: +o.lotsRequested || 0,
                tp: o.stopOrderType === 'STOP_ORDER_TYPE_TAKE_PROFIT' });
        });
        T.port.list.forEach(function (p) {
            if (p.uid === uid && p.avg > 0) out.push({ px: p.avg, kind: 'avg', qty: p.qty });
        });
        return out;
    };
    PF.pftLiveBanner = bannerHtml;
    PF.pftTradeReady = tradeReady;
    // пикер конструктора считает слоты ЭТОГО экрана (PF.pftSlotNums) — и лимит
    // ему нужен экранный; сквозной MAX_SLOTS сторожит только выдачу номеров
    PF.pftMaxSlots = MAX_SLOTS_SCREEN;
    // новому экрану нужен свободный номер слота (см. pfxTabSeed в portfolios-dash.js)
    PF.pftNextFreeSlot = nextFreeSlot;
    PF.pftSlotNumsAll = slotNumsAll;
    // Поставить бумагу в слот извне: поиском графика (он ведёт за собой стакан и
    // тикет — см. связку ниже) и лупой полосы экранов, заводящей экран сразу по тикеру
    PF.pftLoadInstrument = function (n, uid, then) { loadInstrument(slotNo(n), uid, then); };
    // ---- СВЯЗКА «график ↔ слот» ВНУТРИ ЭКРАНА ----------------------------
    // Нумерация у графиков своя, у слотов своя, и совпадать они не обязаны
    // (новый экран берёт первые свободные номера из РАЗНЫХ пулов). Парой их
    // делает ПОРЯДОК в раскладке экрана: первый график ходит за первым слотом,
    // второй — за вторым. Выбрал бумагу в любом из них — второй встаёт следом,
    // и тикер не приходится вводить дважды. Лишний график (слотов меньше)
    // остаётся сам по себе, как и лишний слот.
    function screenPair() {
        var slots = [], charts = [];
        ((PF.dashCfg && PF.dashCfg.order) || []).forEach(function (id) {
            var m = /^trade:(?:ob|ticket)(?::(\d+))?$/.exec(id);
            if (m) { var n = slotNo(m[1] || 1); if (slots.indexOf(n) < 0) slots.push(n); }
            var c = /^trade:chart(?::(\d+))?$/.exec(id);
            if (c) { var k = slotNo(c[1] || 1); if (charts.indexOf(k) < 0) charts.push(k); }
        });
        return { slots: slots, charts: charts };
    }
    PF.pftScreenPair = screenPair;
    // парный слот для графика и наоборот (0 — пары нет)
    PF.pftSlotOfChart = function (ch) {
        var p = screenPair(), i = p.charts.indexOf(slotNo(ch));
        return i >= 0 ? (p.slots[i] || 0) : 0;
    };
    PF.pftChartOfSlot = function (n) {
        var p = screenPair(), i = p.slots.indexOf(slotNo(n));
        return i >= 0 ? (p.charts[i] || 0) : 0;
    };
    // ...а дублированию экрана — сразу несколько: nextFreeSlot читает раскладки,
    // и подряд он вернул бы один и тот же номер (новых блоков там ещё нет)
    PF.pftFreeSlots = function (count) {
        var used = slotNumsAll(), out = [];
        for (var i = 1; i <= MAX_SLOTS && out.length < count; i++) if (used.indexOf(i) < 0) out.push(i);
        return out;
    };
    // экран удалили — его бумаги больше нигде не разложены: гасим их состояние,
    // иначе номера считались бы занятыми, а тикеры всплыли бы в новом экране
    PF.pftForgetSlots = function (nums) {
        (nums || []).forEach(function (n) { PF.pftDropSlot(n); });
    };
})();
