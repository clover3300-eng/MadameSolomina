// =============================================================
// ПРОКСИ К T-INVEST API НА ЯНДЕКС-ФУНКЦИИ
// =============================================================
// ЗАЧЕМ ОН ВООБЩЕ ЕСТЬ. Раньше запросы к брокеру проксировал наш Cloudflare
// Worker (worker/index.js, маршрут /api/broker/tinkoff/*). Он рабочий, но
// упирается в стену, которую кодом не обойти: сертификат invest-public-api
// выдан «Russian Trusted Sub CA» (Минцифры РФ), а этот корень не входит в
// доверенные у Cloudflare — любой исходящий запрос падает с 526 «Invalid SSL
// certificate». Проверено на боевом домене: маршрут жив, формат токена
// проверяется, но ни один вызов до брокера не доходит. Домены sandbox- и
// tbank.ru — с тем же издателем, сменой хоста не обойти.
// Яндекс-функция живёт в российском контуре, где этот корень доверенный, и
// спокойно ходит к брокеру. Поэтому мост переезжает сюда.
//
// ЧТО ВАЖНО ПОНИМАТЬ ПРО ДОВЕРИЕ. Через эту функцию идёт ТОКЕН Т-Инвестиций.
// Он нигде не сохраняется и не логируется (см. ниже — ни одного console.log с
// заголовками), но физически проходит через контур Яндекс-облака владельца
// сайта. Это осознанное решение владельца, принятое 2026-08-05.
//
// ЗАЩИТА — та же, что была в воркере:
//   · whitelist методов и требуемый уровень доступа (X-Broker-Scope);
//   · Origin строго из списка своих (анти-CSRF: чужая страница из браузера
//     наш Origin не подделает);
//   · хост назначения фиксирован, клиент влияет только на имя метода;
//   · лимит тела и таймаут;
//   · ответы не кэшируются.
//
// ДЕПЛОЙ (один раз):
//   1. Яндекс Облако → Cloud Functions → Создать функцию;
//   2. рантайм nodejs18, точка входа index.handler, файл — этот;
//   3. таймаут 20 с, память 128 МБ;
//   4. вкладка «Обзор» → сделать функцию ПУБЛИЧНОЙ (вызов без авторизации),
//      иначе браузер получит 403;
//   5. скопировать URL вида https://functions.yandexcloud.net/<id>
//      и вписать его в public/js/broker-proxy-config.js.
// Пока URL пустой, клиент ходит прежним путём (Cloudflare) — то есть ничего
// не ломается, просто брокер остаётся недоступным.
// =============================================================

const TI_HOST = 'https://invest-public-api.tinkoff.ru';
const TI_SANDBOX_HOST = 'https://sandbox-invest-public-api.tinkoff.ru';
const TI_PATH = '/rest/tinkoff.public.invest.api.contract.v1.';
const TI_TIMEOUT_MS = 15000;
const TI_MAX_BODY = 8192;

// Свои страницы. Добавьте сюда кастомный домен, если он появится.
const ALLOWED_ORIGINS = [
    'https://madamesolomina.clover3300.workers.dev'
];

// read — любому подключению, trade — только режиму «Торговля». Список обязан
// совпадать с TI_METHODS в worker/index.js: это один и тот же контракт.
const TI_METHODS = {
    GetAccounts:      { svc: 'UsersService',       scope: 'read' },
    GetInfo:          { svc: 'UsersService',       scope: 'read' },
    GetPortfolio:     { svc: 'OperationsService',  scope: 'read' },
    GetPositions:     { svc: 'OperationsService',  scope: 'read' },
    GetOperations:    { svc: 'OperationsService',  scope: 'read' },
    GetInstrumentBy:  { svc: 'InstrumentsService', scope: 'read' },
    FindInstrument:   { svc: 'InstrumentsService', scope: 'read' },
    GetDividends:     { svc: 'InstrumentsService', scope: 'read' },
    GetLastPrices:    { svc: 'MarketDataService',  scope: 'read' },
    GetClosePrices:   { svc: 'MarketDataService',  scope: 'read' },
    GetOrderBook:     { svc: 'MarketDataService',  scope: 'read' },
    GetTradingStatus: { svc: 'MarketDataService',  scope: 'read' },
    GetLastTrades:    { svc: 'MarketDataService',  scope: 'read' },
    GetCandles:       { svc: 'MarketDataService',  scope: 'read' },
    GetOrders:        { svc: 'OrdersService',      scope: 'read' },
    GetOrderState:    { svc: 'OrdersService',      scope: 'read' },
    GetMaxLots:       { svc: 'OrdersService',      scope: 'read' },
    PostOrder:        { svc: 'OrdersService',      scope: 'trade' },
    CancelOrder:      { svc: 'OrdersService',      scope: 'trade' },
    ReplaceOrder:     { svc: 'OrdersService',      scope: 'trade' },
    GetStopOrders:    { svc: 'StopOrdersService',  scope: 'read' },
    PostStopOrder:    { svc: 'StopOrdersService',  scope: 'trade' },
    CancelStopOrder:  { svc: 'StopOrdersService',  scope: 'trade' },
    OpenSandboxAccount: { svc: 'SandboxService', scope: 'read', sandboxOnly: true },
    SandboxPayIn:       { svc: 'SandboxService', scope: 'read', sandboxOnly: true }
};

function hdr(headers, name) {
    if (!headers) return '';
    const lower = String(name).toLowerCase();
    const key = Object.keys(headers).find(k => k.toLowerCase() === lower);
    return key ? String(headers[key] || '') : '';
}

function cors(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Broker-Token, Content-Type, X-Broker-Scope, X-Broker-Sandbox',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
    };
}

function json(body, status, origin) {
    return {
        statusCode: status || 200,
        headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(origin || '')),
        body: JSON.stringify(body)
    };
}

module.exports.handler = async function (event) {
    const headers = (event && event.headers) || {};
    const origin = hdr(headers, 'Origin');
    const allowed = ALLOWED_ORIGINS.indexOf(origin) >= 0;

    // preflight: браузер шлёт его из-за наших X-Broker-* заголовков
    if (event && event.httpMethod === 'OPTIONS') {
        if (!allowed) return { statusCode: 403, headers: { 'Cache-Control': 'no-store' }, body: '' };
        return { statusCode: 204, headers: Object.assign({ 'Cache-Control': 'no-store' }, cors(origin)), body: '' };
    }
    if (!event || event.httpMethod !== 'POST') return json({ error: 'method_not_allowed' }, 405, allowed ? origin : '');
    if (!allowed) return json({ error: 'forbidden_origin' }, 403, '');

    const q = event.queryStringParameters || {};
    const method = String(q.method || '');
    const def = Object.prototype.hasOwnProperty.call(TI_METHODS, method) ? TI_METHODS[method] : null;
    if (!def) return json({ error: 'unknown_method' }, 404, origin);

    const scope = hdr(headers, 'X-Broker-Scope') || 'read';
    if (def.scope === 'trade' && scope !== 'trade') return json({ error: 'scope_not_allowed' }, 403, origin);

    const sandbox = hdr(headers, 'X-Broker-Sandbox') === '1';
    if (def.sandboxOnly && !sandbox) return json({ error: 'sandbox_only' }, 403, origin);

    // ТОКЕН ЕДЕТ В X-Broker-Token, А НЕ В Authorization. Яндекс Облако считает
    // заголовок Authorization своим (IAM-токен вызова функции) и на чужое значение
    // отвечает собственным 403 «Forbidden: Not authorized», даже не запуская код —
    // проверено на живой функции 2026-08-05. Фолбэк на Authorization оставлен для
    // совместимости с маршрутом Cloudflare, где перехвата нет.
    const auth = hdr(headers, 'X-Broker-Token') || hdr(headers, 'Authorization');
    if (!/^Bearer t\.[A-Za-z0-9_\-]{20,200}$/.test(auth)) return json({ error: 'bad_token_format' }, 401, origin);

    let bodyText = event.body || '{}';
    if (event.isBase64Encoded) bodyText = Buffer.from(bodyText, 'base64').toString('utf8');
    if (bodyText.length > TI_MAX_BODY) return json({ error: 'body_too_large' }, 413, origin);
    if (!bodyText) bodyText = '{}';

    const host = sandbox ? TI_SANDBOX_HOST : TI_HOST;
    try {
        const upstream = await fetch(host + TI_PATH + def.svc + '/' + method, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: bodyText,
            signal: AbortSignal.timeout(TI_TIMEOUT_MS)
        });
        const text = await upstream.text();
        const out = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(origin));
        // 429 — единственный заголовок апстрима наружу: по нему клиент выдерживает паузу
        if (upstream.status === 429) {
            const ra = upstream.headers.get('Retry-After') || upstream.headers.get('x-ratelimit-reset');
            if (ra) {
                out['Retry-After'] = ra;
                out['Access-Control-Expose-Headers'] = 'Retry-After';
            }
        }
        return { statusCode: upstream.status, headers: out, body: text };
    } catch (e) {
        // таймаут или сеть; деталей не раскрываем и ничего не логируем
        return json({ error: 'upstream_unreachable' }, 502, origin);
    }
};
