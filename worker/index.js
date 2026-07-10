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

// Базовые защитные заголовки для всей статики.
// frame-ancestors разрешает web.telegram.org: веб-версия Telegram открывает
// мини-аппы в iframe (мобильный/десктопный клиенты — нативный webview, им
// заголовок не мешает). Остальным сайтам встраивать нас нельзя (кликджекинг).
var SECURITY_HEADERS = {
    'Content-Security-Policy': "frame-ancestors 'self' https://web.telegram.org; object-src 'none'; base-uri 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
};

export default {
    async fetch(request, env) {
        var url = new URL(request.url);
        if (url.pathname === '/api/telegram-auth' && request.method === 'POST') {
            return handleTelegramAuth(request, env);
        }
        var res = await env.ASSETS.fetch(request);
        res = new Response(res.body, res);
        Object.keys(SECURITY_HEADERS).forEach(function (k) {
            res.headers.set(k, SECURITY_HEADERS[k]);
        });
        return res;
    }
};
