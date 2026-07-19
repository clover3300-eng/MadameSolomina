// =============================================
// CLOUDFLARE WORKER — API-эндпоинты поверх статики
// =============================================
// Помимо раздачи public/ (ASSETS-биндинг), обслуживает POST
// /api/telegram-auth: проверяет подпись Telegram (виджет входа
// или Telegram WebApp initData) секретным токеном бота и заводит
// / логинит соответствующего пользователя в Supabase через
// service_role-ключ (оба секрета живут только тут, на сервере —
// см. TELEGRAM_SETUP.md).

const TG_EMAIL_DOMAIN = 'telegram.mstelegram.local';
// Окно годности подписи: чем короче, тем меньше времени у перехваченного
// payload на повторный вход (replay). Виджет отдаёт свежий auth_date на
// каждый клик — хватает 15 минут; initData WebApp создаётся при открытии
// мини-аппа и живёт всю сессию — даём час.
const MAX_WIDGET_AGE_SEC = 900;
const MAX_WEBAPP_AGE_SEC = 3600;

const enc = new TextEncoder();

function bufToHex(bytes) {
    return Array.prototype.map.call(bytes, function (b) {
        return b.toString(16).padStart(2, '0');
    }).join('');
}

// Сравнение за постоянное время — обычный !== отвечает быстрее на раннем
// расхождении и потенциально утекает информацию о верном префиксе HMAC.
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmacSha256(keyBytes, msgBytes) {
    const key = await crypto.subtle.importKey(
        'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
}

// Проверка данных виджета/попапа входа (Telegram.Login.auth)
// https://core.telegram.org/widgets/login#checking-authorization
async function verifyWidgetAuth(user, botToken) {
    if (!user || !user.hash || !user.id) return false;
    var hash = user.hash;
    var checkString = Object.keys(user)
        .filter(function (k) { return k !== 'hash' && user[k] !== undefined && user[k] !== null; })
        .sort()
        .map(function (k) { return k + '=' + user[k]; })
        .join('\n');

    var secretKey = await sha256(enc.encode(botToken));
    var computed = bufToHex(await hmacSha256(secretKey, enc.encode(checkString)));
    if (!safeEqual(computed, String(hash))) return false;

    var authDate = Number(user.auth_date) || 0;
    if (Date.now() / 1000 - authDate > MAX_WIDGET_AGE_SEC) return false;
    return true;
}

// Проверка Telegram.WebApp.initData
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyWebAppInitData(initData, botToken) {
    var params = new URLSearchParams(initData);
    var hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    var pairs = [];
    params.forEach(function (v, k) { pairs.push(k + '=' + v); });
    pairs.sort();
    var checkString = pairs.join('\n');

    var secretKey = await hmacSha256(enc.encode('WebAppData'), enc.encode(botToken));
    var computed = bufToHex(await hmacSha256(secretKey, enc.encode(checkString)));
    if (!safeEqual(computed, String(hash))) return null;

    var authDate = Number(params.get('auth_date')) || 0;
    if (Date.now() / 1000 - authDate > MAX_WEBAPP_AGE_SEC) return null;

    var userJson = params.get('user');
    return userJson ? JSON.parse(userJson) : null;
}

async function generateMagicLink(env, headers, email) {
    var linkRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/generate_link', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ type: 'magiclink', email: email })
    });
    if (!linkRes.ok) throw new Error('generate_link_failed: ' + await linkRes.text());
    var linkData = await linkRes.json();
    var tokenHash = linkData.hashed_token || (linkData.properties && linkData.properties.hashed_token);
    if (!tokenHash) throw new Error('no_hashed_token');
    return { email: email, token_hash: tokenHash };
}

// Дозаполняем профиль телеграмными полями при входе: аватар мог смениться,
// а у старых аккаунтов колонок telegram_id/tg_photo_url ещё не было.
// Ошибка не должна ломать вход — молча пропускаем.
async function updateTgPhoto(env, headers, filter, patch) {
    try {
        await fetch(env.SUPABASE_URL + '/rest/v1/profiles?' + filter, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify(patch)
        });
    } catch (e) { /* no-op */ }
}

async function findOrCreateTelegramUser(env, tgUser) {
    var headers = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
    };

    // Аккаунт уже привязан (через «Привязать Telegram» в личном кабинете,
    // см. supabase/schema.sql link_telegram()) — входим именно в него,
    // с его настоящим email, а не заводим отдельный технический аккаунт.
    var byIdUrl = env.SUPABASE_URL + '/rest/v1/profiles?select=id,email&telegram_id=eq.' + encodeURIComponent(tgUser.id);
    var byId = await fetch(byIdUrl, { headers: headers });
    var byIdRows = byId.ok ? await byId.json() : [];
    if (byIdRows.length) {
        if (tgUser.photo_url) {
            await updateTgPhoto(env, headers, 'id=eq.' + encodeURIComponent(byIdRows[0].id),
                { tg_photo_url: tgUser.photo_url });
        }
        return generateMagicLink(env, headers, byIdRows[0].email);
    }

    var email = 'id' + tgUser.id + '@' + TG_EMAIL_DOMAIN;
    var name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim()
        || tgUser.username || ('id' + tgUser.id);

    var lookupUrl = env.SUPABASE_URL + '/rest/v1/profiles?select=id&email=eq.' + encodeURIComponent(email);
    var lookup = await fetch(lookupUrl, { headers: headers });
    var rows = lookup.ok ? await lookup.json() : [];

    if (!rows.length) {
        var createRes = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                email: email,
                email_confirm: true,
                user_metadata: {
                    name: name,
                    provider: 'telegram',
                    telegram_id: tgUser.id,
                    telegram_username: tgUser.username || null,
                    avatar_url: tgUser.photo_url || null
                }
            })
        });
        if (!createRes.ok) {
            // могла проскочить гонка двух одновременных входов — перепроверим,
            // прежде чем считать это настоящей ошибкой
            var recheck = await fetch(lookupUrl, { headers: headers });
            var recheckRows = recheck.ok ? await recheck.json() : [];
            if (!recheckRows.length) {
                throw new Error('create_user_failed: ' + await createRes.text());
            }
        }
    }

    var patch = { telegram_id: tgUser.id };
    if (tgUser.photo_url) patch.tg_photo_url = tgUser.photo_url;
    await updateTgPhoto(env, headers, 'email=eq.' + encodeURIComponent(email), patch);

    return generateMagicLink(env, headers, email);
}

function json(body, status) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleTelegramAuth(request, env) {
    if (!env.TELEGRAM_BOT_TOKEN) {
        return json({ ok: false, error: 'Вход через Telegram ещё не настроен на сервере' }, 500);
    }

    var body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request' }, 400); }

    var tgUser = null;
    try {
        if (body.mode === 'webapp' && body.initData) {
            tgUser = await verifyWebAppInitData(body.initData, env.TELEGRAM_BOT_TOKEN);
        } else if (body.mode === 'widget' && body.user) {
            var ok = await verifyWidgetAuth(body.user, env.TELEGRAM_BOT_TOKEN);
            tgUser = ok ? body.user : null;
        }
    } catch (e) {
        return json({ ok: false, error: 'Ошибка проверки подписи Telegram' }, 400);
    }

    if (!tgUser || !tgUser.id) {
        return json({ ok: false, error: 'Не удалось подтвердить вход через Telegram' }, 401);
    }

    // Только проверка подписи — для привязки Telegram к УЖЕ авторизованному
    // аккаунту (личный кабинет сам делает client.rpc('link_telegram', ...),
    // сервисный ключ Supabase тут не нужен).
    if (body.verifyOnly) {
        return json({
            ok: true,
            telegram: {
                id: tgUser.id,
                name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim()
                    || tgUser.username || ('id' + tgUser.id),
                username: tgUser.username || null,
                photo_url: tgUser.photo_url || null
            }
        });
    }

    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) {
        return json({ ok: false, error: 'Вход через Telegram ещё не настроен на сервере' }, 500);
    }

    try {
        var result = await findOrCreateTelegramUser(env, tgUser);
        return json({ ok: true, email: result.email, token_hash: result.token_hash });
    } catch (e) {
        console.error('[telegram-auth]', e);
        return json({ ok: false, error: 'Ошибка сервера при входе через Telegram' }, 500);
    }
}

// =============================================
// POST /api/notify — дубль оповещения в Telegram
// =============================================
// Зовёт админка после записи оповещения в public.notifications:
// проверяем JWT Supabase вызывающего, что он незабаненный админ,
// и шлём сообщение ботом всем получателям, кто привязал Telegram
// И включил «Уведомления в Telegram» (profiles.notify_telegram).
// body: { title, body, user_id? } — user_id сужает до одного адресата.

// Лимит субзапросов CF Worker — 50 на вызов; 3 уходят на проверки,
// остальное — с запасом на рассылку. Хвост больших списков вернётся
// в skipped (задел под батчи, когда пользователей станет больше).
const MAX_TG_SENDS = 40;

function tgEscape(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function handleNotify(request, env) {
    if (!env.TELEGRAM_BOT_TOKEN || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) {
        return json({ ok: false, error: 'Рассылка в Telegram ещё не настроена на сервере' }, 500);
    }

    var auth = request.headers.get('Authorization') || '';
    var jwt = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : '';
    if (!jwt) return json({ ok: false, error: 'Нужна авторизация' }, 401);

    var body;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request' }, 400); }
    var title = String(body.title || '').trim().slice(0, 200);
    var text = String(body.body || '').trim().slice(0, 2000);
    if (!title && !text) return json({ ok: false, error: 'Пустое оповещение' }, 400);

    var svc = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
    };

    // 1) чей JWT — валидирует сам Supabase (подпись, срок)
    var uRes = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + jwt }
    });
    if (!uRes.ok) return json({ ok: false, error: 'Сессия не подтверждена' }, 401);
    var caller = await uRes.json();
    if (!caller || !caller.id) return json({ ok: false, error: 'Сессия не подтверждена' }, 401);

    // 2) роль: рассылает только незабаненный админ
    var pRes = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?id=eq.' +
        encodeURIComponent(caller.id) + '&select=role,banned', { headers: svc });
    var pRows = pRes.ok ? await pRes.json() : [];
    if (!pRows.length || ['admin', 'owner'].indexOf(pRows[0].role) === -1 || pRows[0].banned) {
        return json({ ok: false, error: 'Рассылать может только администратор' }, 403);
    }

    // 3) получатели: Telegram привязан + уведомления включены + не в бане
    var filter = 'telegram_id=not.is.null&notify_telegram=is.true&banned=is.false&select=telegram_id&limit=1000';
    if (body.user_id) filter = 'id=eq.' + encodeURIComponent(body.user_id) + '&' + filter;
    var rRes = await fetch(env.SUPABASE_URL + '/rest/v1/profiles?' + filter, { headers: svc });
    var recipients = rRes.ok ? await rRes.json() : [];
    if (!recipients.length) return json({ ok: true, sent: 0, failed: 0, skipped: 0, total: 0 });

    var msg = (title ? '<b>' + tgEscape(title) + '</b>' : '') +
        (title && text ? '\n\n' : '') + tgEscape(text) +
        '\n\n<i>Madame Solomi\'na</i>';

    var slice = recipients.slice(0, MAX_TG_SENDS);
    var sent = 0, failed = 0;
    for (var i = 0; i < slice.length; i++) {
        try {
            var tgRes = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: slice[i].telegram_id,
                    text: msg,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                })
            });
            // 403 — пользователь не нажимал Start у бота или заблокировал его
            if (tgRes.ok) sent++; else failed++;
        } catch (e) { failed++; }
    }

    return json({
        ok: true,
        sent: sent,
        failed: failed,
        skipped: recipients.length - slice.length,
        total: recipients.length
    });
}

// =============================================
// POST /api/broker/tinkoff/<Метод> — прокси к T-Invest API
// =============================================
// Браузер не может ходить в invest-public-api.tinkoff.ru напрямую (CORS),
// поэтому запросы пробрасывает воркер. Токен брокера приходит в Authorization
// и НИКОГДА не логируется и не сохраняется — чистый passthrough; ответы
// не кэшируются, тексты ошибок апстрима наружу не пробрасываем.
// Защита:
//   · whitelist методов + требуемый уровень доступа (X-Broker-Scope):
//     даже если UI по ошибке дёрнет торговый метод при read-подключении,
//     прокси его не пропустит;
//   · Origin строго свой — мы не открытый прокси для чужих сайтов
//     (заодно анти-CSRF: чужая страница наш заголовок не подделает);
//   · хост назначения фиксирован, клиент влияет только на имя метода;
//   · лимит тела и таймаут.
// Песочница: X-Broker-Sandbox: 1 → sandbox-хост T-Invest (тот же контракт).

var TI_HOST = 'https://invest-public-api.tinkoff.ru';
var TI_SANDBOX_HOST = 'https://sandbox-invest-public-api.tinkoff.ru';
var TI_PATH = '/rest/tinkoff.public.invest.api.contract.v1.';
var TI_TIMEOUT_MS = 15000;
var TI_MAX_BODY = 8192;

// read-методы доступны любому подключению; trade — только режиму «Торговля»
// (и только если сам токен полного доступа: брокер отвергнет read-only токен).
var TI_METHODS = {
    GetAccounts:      { svc: 'UsersService',       scope: 'read' },
    GetInfo:          { svc: 'UsersService',       scope: 'read' },
    GetPortfolio:     { svc: 'OperationsService',  scope: 'read' },
    GetPositions:     { svc: 'OperationsService',  scope: 'read' },
    GetOperations:    { svc: 'OperationsService',  scope: 'read' },
    GetInstrumentBy:  { svc: 'InstrumentsService', scope: 'read' },
    FindInstrument:   { svc: 'InstrumentsService', scope: 'read' },
    GetLastPrices:    { svc: 'MarketDataService',  scope: 'read' },
    GetOrderBook:     { svc: 'MarketDataService',  scope: 'read' },
    GetTradingStatus: { svc: 'MarketDataService',  scope: 'read' },
    // этап 2 — терминал: чтение заявок и торговля
    GetOrders:        { svc: 'OrdersService',      scope: 'read' },
    GetOrderState:    { svc: 'OrdersService',      scope: 'read' },
    GetMaxLots:       { svc: 'OrdersService',      scope: 'read' },
    PostOrder:        { svc: 'OrdersService',      scope: 'trade' },
    CancelOrder:      { svc: 'OrdersService',      scope: 'trade' },
    // перенос цены заявки без снятия: отмена+выставление теряли очередь в стакане
    ReplaceOrder:     { svc: 'OrdersService',      scope: 'trade' },
    // этап 3 — стоп-заявки и лента обезличенных сделок
    GetLastTrades:    { svc: 'MarketDataService',  scope: 'read' },
    // этап 4 — свечи для графика терминала (виджет «График», js/portfolios-chart.js)
    GetCandles:       { svc: 'MarketDataService',  scope: 'read' },
    GetStopOrders:    { svc: 'StopOrdersService',  scope: 'read' },
    PostStopOrder:    { svc: 'StopOrdersService',  scope: 'trade' },
    CancelStopOrder:  { svc: 'StopOrdersService',  scope: 'trade' },
    // песочница: счёт там существует только после явного OpenSandboxAccount
    // (кабинет Т-Банка его не создаёт) — визард открывает и пополняет сам.
    // sandboxOnly: на боевом хосте этих методов нет, и не надо
    OpenSandboxAccount: { svc: 'SandboxService', scope: 'read', sandboxOnly: true },
    SandboxPayIn:       { svc: 'SandboxService', scope: 'read', sandboxOnly: true }
};

function brokerJson(body, status) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
}

async function handleBrokerProxy(request, url) {
    // только со своих страниц: браузер шлёт Origin на любой кросс- и same-origin POST
    var origin = request.headers.get('Origin') || '';
    if (origin !== url.origin) return brokerJson({ error: 'forbidden_origin' }, 403);

    var method = url.pathname.slice('/api/broker/tinkoff/'.length);
    // hasOwnProperty: голый TI_METHODS['constructor'] truthy через прототип
    var def = Object.prototype.hasOwnProperty.call(TI_METHODS, method) ? TI_METHODS[method] : null;
    if (!def) return brokerJson({ error: 'unknown_method' }, 404);

    // read-методы доступны любому подключению, trade — только заявленной «торговле»
    var scope = request.headers.get('X-Broker-Scope') || 'read';
    if (def.scope === 'trade' && scope !== 'trade') {
        return brokerJson({ error: 'scope_not_allowed' }, 403);
    }
    var sandbox = request.headers.get('X-Broker-Sandbox') === '1';
    if (def.sandboxOnly && !sandbox) {
        return brokerJson({ error: 'sandbox_only' }, 403);
    }

    // токены T-Invest начинаются с «t.» — заодно отсекаем случайно
    // вставленный не-токен до того, как он уедет к брокеру
    var auth = request.headers.get('Authorization') || '';
    if (!/^Bearer t\.[A-Za-z0-9_\-]{20,200}$/.test(auth)) {
        return brokerJson({ error: 'bad_token_format' }, 401);
    }

    var bodyText = await request.text();
    if (bodyText.length > TI_MAX_BODY) return brokerJson({ error: 'body_too_large' }, 413);
    if (!bodyText) bodyText = '{}';

    var host = sandbox ? TI_SANDBOX_HOST : TI_HOST;
    try {
        var upstream = await fetch(host + TI_PATH + def.svc + '/' + method, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: bodyText,
            signal: AbortSignal.timeout(TI_TIMEOUT_MS)
        });
        // тело отдаём как есть (JSON брокера), заголовки — только свои
        var text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
    } catch (e) {
        // таймаут или сеть; деталей не раскрываем и ничего не логируем
        return brokerJson({ error: 'upstream_unreachable' }, 502);
    }
}

// Базовые защитные заголовки для всей статики.
// frame-ancestors разрешает web.telegram.org: веб-версия Telegram открывает
// мини-аппы в iframe (мобильный/десктопный клиенты — нативный webview, им
// заголовок не мешает). Остальным сайтам встраивать нас нельзя (кликджекинг).
// 2026-07-17 (задел под API брокера): HSTS, Permissions-Policy и полный CSP
// в режиме Report-Only — он ничего не блокирует, а репортит нарушения в
// консоль браузера; после обкатки политику можно переносить в боевой
// Content-Security-Policy. Список источников собран по факту из index.html
// и fetch'ей в public/js (MOEX ISS, Google CSV, Supabase, TradingView,
// Telegram, Binance, Яндекс-функции).
var SECURITY_HEADERS = {
    'Content-Security-Policy': "frame-ancestors 'self' https://web.telegram.org; object-src 'none'; base-uri 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy-Report-Only':
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://telegram.org https://s3.tradingview.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "img-src 'self' data: blob: https:; " +
        "connect-src 'self' https://iss.moex.com https://docs.google.com https://*.googleusercontent.com " +
            "https://*.supabase.co https://functions.yandexcloud.net https://api.binance.com " +
            "https://*.tradingview.com wss://*.tradingview.com; " +
        "frame-src https://*.tradingview.com https://www.tradingview-widget.com https://oauth.telegram.org; " +
        "frame-ancestors 'self' https://web.telegram.org; object-src 'none'; base-uri 'self'; form-action 'self'"
};

export default {
    async fetch(request, env) {
        var url = new URL(request.url);
        if (url.pathname === '/api/telegram-auth' && request.method === 'POST') {
            return handleTelegramAuth(request, env);
        }
        if (url.pathname === '/api/notify' && request.method === 'POST') {
            return handleNotify(request, env);
        }
        if (url.pathname.indexOf('/api/broker/tinkoff/') === 0 && request.method === 'POST') {
            return handleBrokerProxy(request, url);
        }
        var res = await env.ASSETS.fetch(request);
        res = new Response(res.body, res);
        Object.keys(SECURITY_HEADERS).forEach(function (k) {
            res.headers.set(k, SECURITY_HEADERS[k]);
        });
        return res;
    }
};
