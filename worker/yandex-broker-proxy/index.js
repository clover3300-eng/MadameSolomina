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

const https = require('https');
const tls = require('tls');

// КОРЕНЬ «Russian Trusted Root CA» (Минцифры РФ) — ВШИТ СЮДА НАМЕРЕННО.
// Node.js доверяет не системным сертификатам, а собственному вшитому списку
// (Mozilla CA bundle), и российского корня там нет — даже в российском облаке.
// Поэтому исходящий запрос к брокеру падал с ошибкой проверки сертификата, а
// функция отдавала upstream_unreachable (проверено на живой функции 2026-08-05).
// Мы НЕ отключаем проверку (никаких NODE_TLS_REJECT_UNAUTHORIZED=0 — это открыло
// бы дорогу подмене), а добавляем ОДИН конкретный корень к системному списку.
// Отпечаток SHA-256 сверен с двух независимых хостов (invest-public-api.tinkoff.ru
// и sberbank.ru), совпал:
//   D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
// Копия сертификата отдельным файлом лежит рядом: russian-trusted-root.pem.
const RU_TRUSTED_ROOT_PEM =
    '-----BEGIN CERTIFICATE-----\n' +
    'MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx\n' +
    'PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu\n' +
    'ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg\n' +
    'Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS\n' +
    'VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg\n' +
    'YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v\n' +
    'dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n\n' +
    'qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q\n' +
    'XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U\n' +
    'zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX\n' +
    'YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y\n' +
    'Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD\n' +
    'U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD\n' +
    '4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9\n' +
    'G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH\n' +
    'BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX\n' +
    'ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa\n' +
    'OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf\n' +
    'BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS\n' +
    'BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF\n' +
    'AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH\n' +
    'tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq\n' +
    'W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+\n' +
    '/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS\n' +
    'AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj\n' +
    'C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV\n' +
    '4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d\n' +
    'WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ\n' +
    'D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC\n' +
    'EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq\n' +
    '391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=\n' +
    '-----END CERTIFICATE-----\n';
const CA_BUNDLE = [RU_TRUSTED_ROOT_PEM].concat(tls.rootCertificates);

// POST к брокеру через https с нашим набором корней. Встроенный fetch этого не
// умеет: подсунуть ему свой CA в Node 18 без внешних зависимостей нечем.
function upstreamPost(urlStr, headers, body) {
    return new Promise(function (resolve, reject) {
        const u = new URL(urlStr);
        const req = https.request({
            hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
            headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, headers),
            ca: CA_BUNDLE, timeout: TI_TIMEOUT_MS
        }, function (res) {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', function (d) { data += d; });
            res.on('end', function () { resolve({ status: res.statusCode, text: data, headers: res.headers }); });
        });
        req.on('timeout', function () { req.destroy(new Error('timeout')); });
        req.on('error', reject);
        req.end(body);
    });
}

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
        const upstream = await upstreamPost(host + TI_PATH + def.svc + '/' + method, {
            Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json'
        }, bodyText);
        const text = upstream.text;
        const out = Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(origin));
        // 429 — единственный заголовок апстрима наружу: по нему клиент выдерживает паузу
        if (upstream.status === 429) {
            const ra = upstream.headers['retry-after'] || upstream.headers['x-ratelimit-reset'];
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
