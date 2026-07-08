// =============================================
// CLOUD-SYNC — синхронизация данных с Supabase
// =============================================
// Зеркалит перечисленные localStorage-ключи в таблицу user_data
// (по строке на ключ). Ни один модуль приложения не правился:
// патчим Storage.setItem/removeItem и слушаем записи.
//   · при загрузке/входе — pull: свежие строки из облака кладём в
//     localStorage; если что-то реально поменялось — один мягкий
//     reload, чтобы все вкладки перечитали данные;
//   · локальная правка — debounce 1.2с → batch-upsert в облако;
//   · выход из аккаунта — flush + очистка ключей на устройстве
//     (данные остаются в облаке).
// Правило конфликтов: на этом устройстве сравниваем updated_at
// сервера с последним виденным (supa_sync_meta_v1) — новее сервер →
// применяем; ключа в облаке нет → отправляем локальный.
// Грузится после profile-menu.js (до admin.js).

(function () {
    'use strict';

    // Все пользовательские данные приложения.
    // ВНИМАНИЕ: 'msolominа_state' исторически содержит кириллическую «а» —
    // строка скопирована из app-state.js байт в байт, не «чинить».
    var WATCH = [
        'portfolios_v1',        // портфели (главное!)
        'profile_settings_v1',  // настройки кабинета (имя, брокер, стартовый раздел)
        'stk_fav_v1',           // избранные акции
        'bnd_fav_v1',           // избранные облигации
        'dash_portfolio_v1',    // снапшот портфеля дашборда
        'pf_cardview_v1',       // вид карточек портфелей
        'pf_trades_hidden_v1',  // свёрнутость истории сделок
        'pf_rebal_params',      // параметры ребаланса (налог/комиссия/период)
        'sl_checked_v1',        // отмеченные строки покупок
        'invest_settings',      // параметры расчёта
        'portfolio_snapshot',   // рассчитанный портфель
        'msolominа_state'       // состояние калькулятора (app-state.js)
    ];
    var META_KEY = 'supa_sync_meta_v1';   // { uid, keys: { key: updated_at } }
    var RELOAD_GUARD = 'supa_sync_reloaded';

    var applying = false;                 // пишем принятое из облака — не пушим обратно
    var pending = {};                     // key -> true (ждут отправки)
    var pushTimer = null;
    var pushBusy = null;                  // Promise активной отправки
    var warnedOnce = false;

    function S() { return window.supa; }
    function authed() { var s = S(); return !!(s && s.enabled && s.session); }
    function uid() { return S().session.user.id; }

    function toast(msg, isErr) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isErr);
    }

    // ---------- meta ----------
    function readMeta() {
        try {
            var m = JSON.parse(localStorage.getItem(META_KEY));
            if (m && m.uid === (authed() ? uid() : m.uid) && m.keys) return m;
        } catch (e) {}
        return { uid: authed() ? uid() : null, keys: {} };
    }
    function writeMeta(m) {
        try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
    }

    // ---------- сериализация ----------
    // В user_data.value лежит jsonb. Обычные ключи — готовый JSON;
    // строковые (pf_cardview_v1 = 'narrow') заворачиваем в { __raw }.
    function toJsonb(str) {
        try { return JSON.parse(str); } catch (e) { return { __raw: String(str) }; }
    }
    function fromJsonb(value) {
        if (value && typeof value === 'object' && !Array.isArray(value) && value.__raw !== undefined) {
            return String(value.__raw);
        }
        return JSON.stringify(value);
    }

    // ---------- патч Storage ----------
    var rawSet = Storage.prototype.setItem;
    var rawRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) {
        rawSet.call(this, k, v);
        if (this === window.localStorage) onLocalWrite(k);
    };
    Storage.prototype.removeItem = function (k) {
        rawRemove.call(this, k);
        if (this === window.localStorage) onLocalWrite(k);
    };

    function onLocalWrite(key) {
        if (applying || WATCH.indexOf(key) === -1 || !authed()) return;
        pending[key] = true;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(pushPending, 1200);
    }

    // ---------- push ----------
    function pushPending() {
        if (!authed()) { pending = {}; return Promise.resolve(); }
        var keys = Object.keys(pending);
        if (!keys.length) return Promise.resolve();
        pending = {};

        var rows = keys.map(function (k) {
            var str = null;
            try { str = localStorage.getItem(k); } catch (e) {}
            return { user_id: uid(), key: k, value: str == null ? null : toJsonb(str) };
        });

        pushBusy = S().client.from('user_data')
            .upsert(rows, { onConflict: 'user_id,key' })
            .select('key,updated_at')
            .then(function (res) {
                pushBusy = null;
                if (res.error) {
                    keys.forEach(function (k) { pending[k] = true; });   // вернём в очередь
                    console.warn('[sync] не отправилось:', res.error.message);
                    if (!warnedOnce) {
                        warnedOnce = true;
                        toast('Не удалось сохранить в облако — данные пока только в этом браузере', true);
                    }
                    return;
                }
                var m = readMeta();
                m.uid = uid();
                (res.data || []).forEach(function (r) { m.keys[r.key] = r.updated_at; });
                writeMeta(m);
            }, function (e) {
                pushBusy = null;
                keys.forEach(function (k) { pending[k] = true; });
                console.warn('[sync] сеть:', e);
            });
        return pushBusy;
    }

    function flush() {
        clearTimeout(pushTimer);
        var p = pushPending() || Promise.resolve();
        return pushBusy ? pushBusy : p;
    }

    // ---------- pull ----------
    // mode: 'startup' — обычная загрузка страницы; 'signin' — явный вход
    // (локальные ключи, которых нет в облаке, уезжают наверх).
    function pull(mode) {
        if (!authed()) return Promise.resolve();
        return S().client.from('user_data').select('key,value,updated_at')
            .eq('user_id', uid())
            .then(function (res) {
                if (res.error) { console.warn('[sync] pull:', res.error.message); return; }

                var server = {};
                (res.data || []).forEach(function (r) { server[r.key] = r; });
                var m = readMeta();
                if (m.uid !== uid()) m = { uid: uid(), keys: {} };   // сменился аккаунт — meta с нуля
                var changed = false;

                WATCH.forEach(function (k) {
                    var row = server[k];
                    var localStr = null;
                    try { localStr = localStorage.getItem(k); } catch (e) {}

                    if (row) {
                        var fresher = !m.keys[k] || row.updated_at > m.keys[k];
                        if (fresher) {
                            var incoming = row.value == null ? null : fromJsonb(row.value);
                            if (incoming !== localStr) {
                                applying = true;
                                try {
                                    if (incoming == null) localStorage.removeItem(k);
                                    else localStorage.setItem(k, incoming);
                                } catch (e) {}
                                applying = false;
                                changed = true;
                            }
                            m.keys[k] = row.updated_at;
                        }
                    } else if (localStr != null) {
                        // в облаке ключа нет — поднимаем локальный (первый вход, новый аккаунт)
                        pending[k] = true;
                    }
                });

                writeMeta(m);
                if (Object.keys(pending).length) pushPending();

                if (changed) softReload(mode);
            });
    }

    // Один мягкий reload, чтобы все модули перечитали новые данные.
    // Защита от цикла: не чаще раза в 30 секунд.
    function softReload(mode) {
        try {
            var last = +sessionStorage.getItem(RELOAD_GUARD) || 0;
            if (Date.now() - last < 30000) return;
            sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
        } catch (e) {}
        if (mode === 'signin') toast('Загружаем ваши данные из облака…');
        // при входе ждём чуть дольше: форма успевает переключить вкладку (pushState),
        // и после reload пользователь оказывается уже в приложении с облачными данными
        setTimeout(function () { location.reload(); }, mode === 'signin' ? 1300 : 120);
    }

    // ---------- выход ----------
    // Данные в облаке; с устройства личное убираем (общий компьютер) и
    // перезагружаемся на Главную.
    function onSignOut() {
        applying = true;
        WATCH.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        try { localStorage.removeItem(META_KEY); } catch (e) {}
        applying = false;
        pending = {};
        try { history.replaceState(null, '', '/'); } catch (e) {}
        location.reload();
    }

    // Перед закрытием вкладки — дожать очередь (best effort)
    window.addEventListener('pagehide', function () {
        if (Object.keys(pending).length) { clearTimeout(pushTimer); pushPending(); }
    });

    window.supaSync = {
        onStartup: function () { pull('startup'); },
        onSignIn: function () { pull('signin'); },
        onSignOut: onSignOut,
        flush: flush,
        WATCH: WATCH
    };
})();
