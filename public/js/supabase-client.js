// =============================================
// SUPABASE-КЛИЕНТ — сессия, профиль, события
// =============================================
// Единая точка доступа к облаку: window.supa.
//   · enabled  — ключи вставлены и библиотека загружена;
//   · session / profile — текущее состояние (null = гость);
//   · onChange(cb) — подписка на смену состояния: cb('init'|'signin'|
//     'signout'|'profile'|'recovery');
//   · signUp/signIn/signOut/resetPassword/updatePassword/updateProfile;
//   · logEvent(event, meta) — журнал app_events (безопасно молчит без сессии).
// Профиль зеркалится в home_profile_v1, чтобы легаси-код (аватар,
// приветствия) работал без правок. Синхронизация данных — cloud-sync.js.
// Грузится ПОСЛЕ js/vendor/supabase.js и js/supabase-config.js,
// ПЕРЕД home-register.js / profile-menu.js.

(function () {
    'use strict';

    var LS_PROFILE = 'home_profile_v1';
    var LS_SEEN = 'supa_seen_ping_v1';       // троттлинг last_seen_at
    var SEEN_EVERY = 30 * 60 * 1000;         // не чаще раза в 30 минут

    var lib = window.supabase;               // UMD-сборка из js/vendor/
    var url = window.SUPABASE_URL || '';
    var key = window.SUPABASE_ANON_KEY || '';
    var enabled = !!(lib && /^https:\/\/.+\.supabase\.co/.test(url) && key.length > 20);

    var client = null;
    if (enabled) {
        try {
            client = lib.createClient(url, key);
        } catch (e) {
            console.warn('[supa] не удалось создать клиент:', e);
            enabled = false;
        }
    }

    var listeners = [];

    var S = window.supa = {
        enabled: enabled,
        client: client,
        session: null,
        profile: null,   // строка public.profiles
        ready: false,    // первичная загрузка сессии завершена

        isAuthed: function () { return !!S.session; },
        // права модерации: и админ, и владелец (роли user < admin < owner)
        isAdmin: function () {
            return !!(S.profile && (S.profile.role === 'admin' || S.profile.role === 'owner') && !S.profile.banned);
        },
        // владелец: раздаёт роли, неприкосновенен (см. supabase/schema.sql 5.3)
        isOwner: function () {
            return !!(S.profile && S.profile.role === 'owner' && !S.profile.banned);
        },
        onChange: function (cb) { if (typeof cb === 'function') listeners.push(cb); },

        signUp: signUp,
        signIn: signIn,
        signInWithTelegram: signInWithTelegram,
        linkTelegram: linkTelegram,
        unlinkTelegram: unlinkTelegram,
        signOut: signOut,
        resetPassword: resetPassword,
        updatePassword: updatePassword,
        updateProfile: updateProfile,
        signOutOthers: signOutOthers,
        deleteAccount: deleteAccount,
        logEvent: logEvent,
        errRu: errRu
    };

    function notify(kind) {
        listeners.forEach(function (cb) {
            try { cb(kind); } catch (e) { console.warn('[supa] listener:', e); }
        });
        // Аватар и панель кабинета перерисовываются при любой смене состояния
        if (typeof window.profileMenuRefresh === 'function') {
            try { window.profileMenuRefresh(); } catch (e) {}
        }
    }

    // ---------- перевод ошибок ----------
    function errRu(error) {
        var m = String((error && error.message) || error || '');
        if (/already registered|already exists/i.test(m)) return 'Такой email уже зарегистрирован — попробуйте войти';
        if (/invalid login credentials/i.test(m)) return 'Неверный email или пароль';
        if (/email not confirmed/i.test(m)) return 'Почта не подтверждена — найдите письмо и перейдите по ссылке';
        if (/rate limit|too many|security purposes/i.test(m)) return 'Слишком много попыток — подождите минуту и повторите';
        if (/password should be at least|at least 6/i.test(m)) return 'Пароль — минимум 6 символов';
        if (/invalid email|unable to validate email/i.test(m)) return 'Введите корректный email';
        if (/same.*password|different from the old/i.test(m)) return 'Новый пароль совпадает со старым';
        if (/network|failed to fetch|load failed/i.test(m)) return 'Нет связи с сервером — проверьте интернет';
        if (/signups not allowed/i.test(m)) return 'Регистрация временно отключена';
        return m || 'Что-то пошло не так — попробуйте ещё раз';
    }

    // ---------- зеркало профиля для легаси-кода ----------
    function mirrorProfile() {
        try {
            if (S.session && S.profile) {
                localStorage.setItem(LS_PROFILE, JSON.stringify({
                    name: S.profile.name || '',
                    email: S.profile.email || S.session.user.email || '',
                    createdAt: S.profile.created_at ? Date.parse(S.profile.created_at) : Date.now(),
                    cloud: true
                }));
            } else if (!S.session) {
                var cur = null;
                try { cur = JSON.parse(localStorage.getItem(LS_PROFILE)); } catch (e) {}
                // стираем только облачное зеркало; локальный демо-профиль не трогаем
                if (cur && cur.cloud) localStorage.removeItem(LS_PROFILE);
            }
        } catch (e) { /* приватный режим */ }
    }

    // ---------- профиль ----------
    function loadProfile() {
        if (!S.session) { S.profile = null; mirrorProfile(); return Promise.resolve(null); }
        return client.from('profiles').select('*').eq('id', S.session.user.id).single()
            .then(function (res) {
                if (res.error) {
                    console.warn('[supa] профиль не загрузился:', res.error.message);
                    return null;
                }
                S.profile = res.data;
                if (S.profile && S.profile.banned) {
                    // Забаненный аккаунт: выходим и объясняем
                    toast('Аккаунт заблокирован администратором', true);
                    return signOut({ silent: true }).then(function () { return null; });
                }
                mirrorProfile();
                pingSeen();
                notify('profile');
                return S.profile;
            });
    }

    function pingSeen() {
        if (!S.session) return;
        var uid = S.session.user.id;
        try {
            var marks = JSON.parse(localStorage.getItem(LS_SEEN)) || {};
            if (marks[uid] && Date.now() - marks[uid] < SEEN_EVERY) return;
            marks[uid] = Date.now();
            localStorage.setItem(LS_SEEN, JSON.stringify(marks));
        } catch (e) {}
        client.from('profiles').update({ last_seen_at: new Date().toISOString() })
            .eq('id', uid).then(function () {}, function () {});
    }

    // ---------- журнал событий ----------
    function logEvent(event, meta) {
        if (!enabled || !S.session) return Promise.resolve();
        return client.from('app_events')
            .insert({ user_id: S.session.user.id, event: event, meta: meta || {} })
            .then(function (res) {
                if (res.error) console.warn('[supa] событие не записалось:', res.error.message);
            }, function () {});
    }

    // ---------- auth-операции ----------
    function signUp(name, email, pass) {
        return client.auth.signUp({
            email: email,
            password: pass,
            options: {
                data: { name: name },
                emailRedirectTo: location.origin + '/'
            }
        }).then(function (res) {
            if (res.error) return { ok: false, error: errRu(res.error) };
            // Сессии нет — включено подтверждение почты
            if (!res.data.session) return { ok: true, needConfirm: true };
            return { ok: true, needConfirm: false };
        });
    }

    function signIn(email, pass) {
        return client.auth.signInWithPassword({ email: email, password: pass })
            .then(function (res) {
                if (res.error) return { ok: false, error: errRu(res.error) };
                logEvent('login');
                return { ok: true };
            });
    }

    // Достаём подтверждённую Telegram-личность — попап Telegram.Login.auth
    // в обычном браузере, initData напрямую, если открыто внутри Telegram
    // (WebApp). Используется и для входа, и для привязки в личном кабинете.
    function captureTelegramIdentity() {
        return new Promise(function (resolve, reject) {
            var tg = window.Telegram && window.Telegram.WebApp;
            if (tg && tg.initData) {
                resolve({ mode: 'webapp', initData: tg.initData });
                return;
            }
            if (window.Telegram && window.Telegram.Login && window.TELEGRAM_BOT_ID) {
                window.Telegram.Login.auth({ bot_id: window.TELEGRAM_BOT_ID }, function (user) {
                    if (!user) { reject(new Error('Вход через Telegram отменён')); return; }
                    resolve({ mode: 'widget', user: user });
                });
                return;
            }
            reject(new Error('Вход через Telegram пока не настроен'));
        });
    }

    function callTelegramAuth(payload) {
        return fetch('/api/telegram-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (res) { return res.json(); }, function () {
            return { ok: false, error: 'Нет связи с сервером' };
        });
    }

    // Вход через Telegram: проверка подписи и заведение/поиск пользователя —
    // на сервере (worker/index.js), тут только обмен token_hash на сессию.
    function signInWithTelegram() {
        if (!enabled) return Promise.resolve({ ok: false, error: 'Облако не подключено' });
        return captureTelegramIdentity().then(function (payload) {
            return callTelegramAuth(payload).then(function (data) {
                if (!data || !data.ok) {
                    return { ok: false, error: (data && data.error) || 'Не удалось войти через Telegram' };
                }
                return client.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' })
                    .then(function (res2) {
                        if (res2.error) return { ok: false, error: errRu(res2.error) };
                        logEvent('login', { via: 'telegram' });
                        return { ok: true };
                    });
            });
        }, function (err) {
            return { ok: false, error: err.message };
        });
    }

    // Привязка Telegram к уже вошедшему аккаунту (email/пароль) — чтобы
    // дальше кнопка «Войти через Telegram» заходила именно в него.
    function linkTelegram() {
        if (!enabled || !S.session) return Promise.resolve({ ok: false, error: 'Нужно войти в аккаунт' });
        return captureTelegramIdentity().then(function (payload) {
            payload.verifyOnly = true;
            return callTelegramAuth(payload).then(function (data) {
                if (!data || !data.ok) {
                    return { ok: false, error: (data && data.error) || 'Не удалось подтвердить Telegram' };
                }
                return client.rpc('link_telegram', {
                    p_telegram_id: data.telegram.id,
                    p_photo_url: data.telegram.photo_url || null
                }).then(function (res2) {
                    if (res2.error) return { ok: false, error: errRu(res2.error) };
                    return loadProfile().then(function () { return { ok: true, telegram: data.telegram }; });
                });
            });
        }, function (err) {
            return { ok: false, error: err.message };
        });
    }

    function unlinkTelegram() {
        if (!enabled || !S.session) return Promise.resolve({ ok: false, error: 'Нужно войти в аккаунт' });
        return client.rpc('unlink_telegram').then(function (res) {
            if (res.error) return { ok: false, error: errRu(res.error) };
            return loadProfile().then(function () { return { ok: true }; });
        });
    }

    function signOut(opts) {
        opts = opts || {};
        var pre = opts.silent ? Promise.resolve() : logEvent('logout');
        // Дожимаем несохранённые изменения в облако перед выходом
        if (window.supaSync && typeof window.supaSync.flush === 'function') {
            pre = pre.then(function () { return window.supaSync.flush(); });
        }
        return pre.then(function () { return client.auth.signOut(); })
            .then(function () {
                S.session = null;
                S.profile = null;
                mirrorProfile();
                if (window.supaSync && typeof window.supaSync.onSignOut === 'function') {
                    window.supaSync.onSignOut();   // чистит синхронизируемые ключи и перезагружает
                } else {
                    notify('signout');
                }
            });
    }

    function resetPassword(email) {
        return client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' })
            .then(function (res) {
                if (res.error) return { ok: false, error: errRu(res.error) };
                logEvent('password_reset_request');
                return { ok: true };
            });
    }

    function updatePassword(newPass) {
        return client.auth.updateUser({ password: newPass }).then(function (res) {
            if (res.error) return { ok: false, error: errRu(res.error) };
            logEvent('password_reset_done');
            return { ok: true };
        });
    }

    // patch: { name?, email? } — имя пишем в profiles, email меняем через auth
    // (Supabase попросит подтвердить новый адрес письмом).
    function updateProfile(patch) {
        if (!S.session) return Promise.resolve({ ok: false, error: 'Нет сессии' });
        var jobs = [];
        if (patch.name != null) {
            jobs.push(client.from('profiles').update({ name: patch.name })
                .eq('id', S.session.user.id));
        }
        var emailChanged = patch.email && patch.email !== (S.profile && S.profile.email);
        if (emailChanged) {
            jobs.push(client.auth.updateUser(
                { email: patch.email },
                { emailRedirectTo: location.origin + '/' }
            ));
        }
        return Promise.all(jobs).then(function (results) {
            var bad = results.filter(function (r) { return r && r.error; })[0];
            if (bad) return { ok: false, error: errRu(bad.error) };
            return loadProfile().then(function () {
                return { ok: true, emailPending: !!emailChanged };
            });
        });
    }

    // Выход на всех ДРУГИХ устройствах (scope:'others') — текущая сессия
    // сохраняется, отзываются только чужие. Для «забыл выйти на чужом ПК».
    function signOutOthers() {
        if (!enabled || !S.session) return Promise.resolve({ ok: false, error: 'Нет сессии' });
        return client.auth.signOut({ scope: 'others' }).then(function (res) {
            if (res.error) return { ok: false, error: errRu(res.error) };
            logEvent('signout_others');
            return { ok: true };
        });
    }

    // Самоудаление аккаунта — RPC delete_own_account (security definer,
    // см. supabase/schema.sql) стирает строку auth.users, каскад уносит
    // профиль и user_data. Затем локально выходим (сессия уже мертва).
    function deleteAccount() {
        if (!enabled || !S.session) return Promise.resolve({ ok: false, error: 'Нет сессии' });
        return client.rpc('delete_own_account').then(function (res) {
            if (res.error) return { ok: false, error: errRu(res.error) };
            return client.auth.signOut().then(function () {
                S.session = null; S.profile = null; mirrorProfile();
                return { ok: true };
            }, function () {
                S.session = null; S.profile = null; mirrorProfile();
                return { ok: true };
            });
        });
    }

    function toast(msg, isErr) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isErr);
        else console[isErr ? 'warn' : 'log']('[supa] ' + msg);
    }

    // ---------- инициализация ----------
    if (enabled) {
        client.auth.onAuthStateChange(function (event, session) {
            // Внутри колбэка нельзя дёргать другие вызовы supabase напрямую
            // (дедлок по документации) — уводим работу в макротаску.
            setTimeout(function () {
                var hadSession = !!S.session;
                S.session = session || null;

                if (event === 'INITIAL_SESSION') {
                    loadProfile().then(function () {
                        S.ready = true;
                        notify('init');
                        if (S.session && window.supaSync) window.supaSync.onStartup();
                    });
                } else if (event === 'SIGNED_IN') {
                    // SIGNED_IN прилетает и при восстановлении вкладки — реагируем
                    // только на настоящий вход (сессии не было)
                    if (!hadSession) {
                        loadProfile().then(function () {
                            notify('signin');
                            if (window.supaSync) window.supaSync.onSignIn();
                        });
                    }
                } else if (event === 'SIGNED_OUT') {
                    S.session = null;
                    S.profile = null;
                    mirrorProfile();
                    notify('signout');
                } else if (event === 'PASSWORD_RECOVERY') {
                    notify('recovery');
                } else if (event === 'USER_UPDATED') {
                    loadProfile();
                }
            }, 0);
        });

        // Активность: обновляем last_seen_at при возвращении на вкладку
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) pingSeen();
        });
    } else {
        S.ready = true;
        if (window.SUPABASE_URL === '') {
            console.info('[supa] ключи не заданы (js/supabase-config.js) — работаем в локальном режиме');
        }
    }
})();
