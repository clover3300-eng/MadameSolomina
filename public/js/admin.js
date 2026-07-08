// =============================================
// АДМИНКА — вкладка «Админка» (#panel-admin)
// =============================================
// Видна только пользователям с profiles.role = 'admin' (пункт в
// сайдбаре скрыт для остальных; прямой заход /admin упирается в
// заглушку «нет доступа»). Работает целиком на anon-ключе: доступ
// к чужим строкам открывают RLS-политики public.is_admin().
// Разделы:
//   · Обзор       — KPI, график регистраций за 14 дней, лента событий;
//   · Пользователи — таблица + карточка: роль, бан, данные, события;
//   · События     — журнал app_events с фильтрами и подгрузкой.
// Опасные действия — двухшаговое подтверждение («Точно?»), как у
// кнопки «Выйти» в кабинете. Полное удаление аккаунта — RPC
// admin_delete_user (security definer, см. supabase/schema.sql).
// Грузится после cloud-sync.js, до route-hash.js.

(function () {
    'use strict';

    var root = null;                  // #admRoot
    var section = 'overview';         // overview | users | events
    var searchQ = '';
    var eventFilter = 'all';
    var EVENTS_PAGE = 300;

    var D = {
        profiles: [],                 // public.profiles (новые сверху)
        dataMeta: [],                 // user_data: user_id/key/updated_at (без значений)
        events: [],                   // app_events + вложенный профиль
        eventsTotal: 0,
        eventsHasMore: false,
        loadedAt: 0,
        loading: false,
        error: null
    };

    // ---------- helpers ----------
    function supa() { return window.supa; }
    function client() { return window.supa.client; }
    function dq(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function toast(msg, isErr) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isErr);
    }
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtDT(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2) +
               ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
    }
    function fmtAgo(iso) {
        if (!iso) return '—';
        var s = (Date.now() - new Date(iso).getTime()) / 1000;
        if (s < 90) return 'только что';
        if (s < 3600) return Math.round(s / 60) + ' мин назад';
        if (s < 86400) return Math.round(s / 3600) + ' ч назад';
        if (s < 172800) return 'вчера';
        return fmtDate(iso);
    }
    function fmtSize(n) {
        if (n < 1024) return n + ' Б';
        if (n < 1048576) return (n / 1024).toFixed(1).replace('.', ',') + ' КБ';
        return (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';
    }
    function initialsOf(p) {
        var n = String(p.name || p.email || '?').trim();
        var bits = n.split(/\s+/);
        var s = (bits[0] ? bits[0][0] : '') + (bits[1] ? bits[1][0] : '');
        return (s || n[0] || '?').toUpperCase();
    }
    // фото из Telegram поверх инициалов (при ошибке загрузки удаляет себя)
    function avaPhoto(p) {
        return p.tg_photo_url
            ? '<img class="adm-ava-img" src="' + esc(p.tg_photo_url) + '" alt="" onerror="this.remove()">'
            : '';
    }
    function isOnline(p) { return p.last_seen_at && (Date.now() - new Date(p.last_seen_at).getTime()) < 5 * 60 * 1000; }
    function isMe(p) { return supa().session && p.id === supa().session.user.id; }

    var EVENT_META = {
        register:               { t: 'Регистрация',       c: 'reg' },
        login:                  { t: 'Вход',              c: 'in' },
        logout:                 { t: 'Выход',             c: 'out' },
        password_reset_request: { t: 'Запрос сброса',     c: 'key' },
        password_reset_done:    { t: 'Пароль обновлён',   c: 'key' },
        admin_role:             { t: 'Смена роли',        c: 'adm' },
        admin_ban:              { t: 'Блокировка',        c: 'ban' },
        admin_unban:            { t: 'Разблокировка',     c: 'adm' },
        admin_clear_data:       { t: 'Очистка данных',    c: 'ban' },
        admin_delete_user:      { t: 'Аккаунт удалён',    c: 'ban' }
    };
    function evMeta(ev) { return EVENT_META[ev] || { t: ev, c: 'out' }; }

    var KEY_LABELS = {
        portfolios_v1: 'Портфели',
        profile_settings_v1: 'Настройки кабинета',
        stk_fav_v1: 'Избранные акции',
        bnd_fav_v1: 'Избранные облигации',
        dash_portfolio_v1: 'Снапшот дашборда',
        pf_cardview_v1: 'Вид карточек портфелей',
        pf_trades_hidden_v1: 'История сделок (вид)',
        pf_rebal_params: 'Параметры ребаланса',
        sl_checked_v1: 'Отметки покупок',
        invest_settings: 'Параметры расчёта',
        portfolio_snapshot: 'Рассчитанный портфель',
        'msolominа_state': 'Состояние калькулятора'
    };
    function keyLabel(k) { return KEY_LABELS[k] || k; }

    var IC = {
        refresh: '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        pulse: '<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
        box: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="13" rx="1"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/></svg>',
        zap: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        x: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        chev: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
        copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        trash: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        ban: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
        userX: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>',
        check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
    };

    // ---------- загрузка данных ----------
    function refresh() {
        if (D.loading) return;
        D.loading = true;
        D.error = null;
        renderApp();

        Promise.all([
            client().from('profiles').select('*').order('created_at', { ascending: false }).limit(1000),
            client().from('user_data').select('user_id,key,updated_at').limit(20000),
            client().from('app_events').select('*, profiles(name,email)')
                .order('created_at', { ascending: false }).limit(EVENTS_PAGE),
            client().from('app_events').select('*', { count: 'exact', head: true })
        ]).then(function (res) {
            D.loading = false;
            var bad = res.filter(function (r) { return r.error; })[0];
            if (bad) {
                D.error = bad.error.message;
                renderApp();
                return;
            }
            D.profiles = res[0].data || [];
            D.dataMeta = res[1].data || [];
            D.events = res[2].data || [];
            D.eventsTotal = res[3].count || 0;
            D.eventsHasMore = D.events.length < D.eventsTotal;
            D.loadedAt = Date.now();
            renderApp();
        }, function (e) {
            D.loading = false;
            D.error = String(e && e.message || e);
            renderApp();
        });
    }

    function loadMoreEvents() {
        var from = D.events.length;
        client().from('app_events').select('*, profiles(name,email)')
            .order('created_at', { ascending: false })
            .range(from, from + EVENTS_PAGE - 1)
            .then(function (res) {
                if (res.error) { toast(res.error.message, true); return; }
                D.events = D.events.concat(res.data || []);
                D.eventsHasMore = D.events.length < D.eventsTotal;
                renderApp();
            });
    }

    // сводки по user_data
    function dataByUser() {
        var m = {};
        D.dataMeta.forEach(function (r) {
            (m[r.user_id] = m[r.user_id] || []).push(r);
        });
        return m;
    }

    // ---------- каркас и заглушки ----------
    function ensureRoot() {
        if (!root) root = dq('admRoot');
        return root;
    }

    function renderGate() {
        if (!ensureRoot()) return;
        var s = supa();

        if (!s || !s.enabled) {
            root.innerHTML =
                '<div class="adm-gate">' +
                    '<div class="adm-gate-ic">' + IC.shield + '</div>' +
                    '<div class="adm-gate-t">Админка ждёт подключения Supabase</div>' +
                    '<div class="adm-gate-s">Три шага: создайте проект на supabase.com, выполните <b>supabase/schema.sql</b> в SQL Editor ' +
                    'и вставьте Project URL с anon-ключом в <b>public/js/supabase-config.js</b>. Подробная инструкция — в файле <b>SUPABASE_SETUP.md</b> в корне репозитория.</div>' +
                '</div>';
            return;
        }
        if (!s.ready) {
            root.innerHTML = '<div class="adm-gate"><div class="adm-gate-s">Проверяем доступ…</div></div>';
            return;
        }
        if (!s.isAuthed()) {
            root.innerHTML =
                '<div class="adm-gate">' +
                    '<div class="adm-gate-ic">' + IC.shield + '</div>' +
                    '<div class="adm-gate-t">Нужен вход</div>' +
                    '<div class="adm-gate-s">Войдите в аккаунт администратора на Главной.</div>' +
                    '<button class="adm-btn primary" data-act="go-home">Перейти ко входу</button>' +
                '</div>';
            return;
        }
        if (!s.isAdmin()) {
            root.innerHTML =
                '<div class="adm-gate">' +
                    '<div class="adm-gate-ic">' + IC.ban + '</div>' +
                    '<div class="adm-gate-t">Недостаточно прав</div>' +
                    '<div class="adm-gate-s">Раздел доступен только администраторам сервиса.</div>' +
                '</div>';
            return;
        }
        renderApp();
    }

    // ---------- основной рендер ----------
    function renderApp() {
        if (!ensureRoot()) return;

        var upd = D.loadedAt
            ? 'обновлено ' + pad2(new Date(D.loadedAt).getHours()) + ':' + pad2(new Date(D.loadedAt).getMinutes())
            : '';

        var h =
            '<div class="adm-top">' +
                '<div class="adm-seg" role="tablist">' +
                    segBtn('overview', 'Обзор') +
                    segBtn('users', 'Пользователи', D.profiles.length) +
                    segBtn('events', 'События', D.eventsTotal) +
                '</div>' +
                '<div class="adm-top-right">' +
                    (D.loading ? '<span class="adm-upd">загружаем…</span>' : '<span class="adm-upd">' + upd + '</span>') +
                    '<button class="adm-refresh" data-act="refresh" title="Обновить данные"' + (D.loading ? ' disabled' : '') + '>' + IC.refresh + '</button>' +
                '</div>' +
            '</div>';

        if (D.error) {
            h += '<div class="adm-error">Не удалось загрузить данные: ' + esc(D.error) + '</div>';
        } else if (!D.loadedAt && D.loading) {
            h += '<div class="adm-gate"><div class="adm-gate-s">Загружаем данные…</div></div>';
        } else if (section === 'overview') {
            h += renderOverview();
        } else if (section === 'users') {
            h += renderUsers();
        } else {
            h += renderEvents();
        }

        root.innerHTML = h;

        var si = dq('admSearch');
        if (si) {
            si.value = searchQ;
            si.addEventListener('input', function () {
                searchQ = this.value;
                var body = dq('admUsersBody');
                if (body) body.innerHTML = usersRows();
                var cnt = dq('admUsersCount');
                if (cnt) cnt.textContent = filteredUsers().length;
            });
        }
    }

    function segBtn(id, label, n) {
        return '<button class="adm-seg-btn' + (section === id ? ' active' : '') + '" data-act="sec" data-sec="' + id + '">' +
            label + (n != null ? ' <span class="adm-seg-n">' + n + '</span>' : '') + '</button>';
    }

    // ---------- ОБЗОР ----------
    function renderOverview() {
        var now = Date.now();
        var day = 86400000;
        var new7 = D.profiles.filter(function (p) { return now - new Date(p.created_at).getTime() < 7 * day; }).length;
        var act24 = D.profiles.filter(function (p) { return p.last_seen_at && now - new Date(p.last_seen_at).getTime() < day; }).length;
        var act7 = D.profiles.filter(function (p) { return p.last_seen_at && now - new Date(p.last_seen_at).getTime() < 7 * day; }).length;
        var byUser = dataByUser();
        var withPf = Object.keys(byUser).filter(function (uid) {
            return byUser[uid].some(function (r) { return r.key === 'portfolios_v1'; });
        }).length;
        var ev24 = D.events.filter(function (e) { return now - new Date(e.created_at).getTime() < day; }).length;
        var banned = D.profiles.filter(function (p) { return p.banned; }).length;
        var admins = D.profiles.filter(function (p) { return p.role === 'admin'; }).length;

        var h = '<div class="adm-kpis">' +
            kpi(IC.users, D.profiles.length, 'Пользователей', '+' + new7 + ' за 7 дней') +
            kpi(IC.pulse, act24, 'Активны за 24 ч', act7 + ' за неделю') +
            kpi(IC.box, withPf, 'С портфелями', D.dataMeta.length + ' ключей данных') +
            kpi(IC.zap, ev24, 'Событий за 24 ч', D.eventsTotal + ' всего') +
        '</div>';

        h += '<div class="adm-cols">';

        // график регистраций 14 дней
        h += '<div class="adm-card"><div class="adm-card-t">Регистрации · 14 дней</div>' + regChart() + '</div>';

        // последние события
        h += '<div class="adm-card"><div class="adm-card-t">Последние события</div>';
        if (!D.events.length) {
            h += '<div class="adm-empty">Событий пока нет — они появятся после первых регистраций и входов.</div>';
        } else {
            h += '<div class="adm-feed">' + D.events.slice(0, 9).map(function (e) {
                var m = evMeta(e.event);
                var who = e.profiles ? (e.profiles.name || e.profiles.email || '—') : 'удалённый аккаунт';
                return '<div class="adm-feed-row">' +
                    '<span class="adm-ev ' + m.c + '">' + esc(m.t) + '</span>' +
                    '<span class="adm-feed-who">' + esc(who) + '</span>' +
                    '<span class="adm-feed-time">' + fmtAgo(e.created_at) + '</span>' +
                '</div>';
            }).join('') + '</div>';
        }
        h += '</div></div>';

        // служебная строка
        h += '<div class="adm-foot-note">Администраторов: ' + admins + ' · Заблокировано: ' + banned +
             ' · Удаление аккаунта — в карточке пользователя, раздел «Пользователи».</div>';
        return h;
    }

    function kpi(ic, num, label, sub) {
        return '<div class="adm-kpi"><div class="adm-kpi-ic">' + ic + '</div>' +
            '<div class="adm-kpi-num">' + num + '</div>' +
            '<div class="adm-kpi-lab">' + label + '</div>' +
            '<div class="adm-kpi-sub">' + sub + '</div></div>';
    }

    function regChart() {
        var days = [];
        var now = new Date(); now.setHours(0, 0, 0, 0);
        for (var i = 13; i >= 0; i--) {
            var d = new Date(now.getTime() - i * 86400000);
            days.push({ t: d.getTime(), n: 0, lab: pad2(d.getDate()) });
        }
        D.profiles.forEach(function (p) {
            var t = new Date(p.created_at); t.setHours(0, 0, 0, 0);
            for (var j = 0; j < days.length; j++) if (days[j].t === t.getTime()) { days[j].n++; break; }
        });
        var max = Math.max.apply(null, days.map(function (d) { return d.n; }));
        if (!max) return '<div class="adm-empty">За последние две недели регистраций не было.</div>';

        var W = 560, H = 150, pad = 4, bw = (W - pad * 2) / days.length;
        var bars = days.map(function (d, i) {
            var bh = d.n ? Math.max(6, (d.n / max) * (H - 44)) : 3;
            var x = pad + i * bw + bw * 0.18;
            var y = H - 26 - bh;
            return '<g><title>' + fmtDate(new Date(d.t).toISOString()) + ': ' + d.n + '</title>' +
                '<rect class="adm-bar' + (d.n ? '' : ' zero') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
                '" width="' + (bw * 0.64).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="4"/>' +
                (d.n ? '<text class="adm-bar-v" x="' + (x + bw * 0.32).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle">' + d.n + '</text>' : '') +
                '<text class="adm-bar-l" x="' + (x + bw * 0.32).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + d.lab + '</text></g>';
        }).join('');
        return '<svg class="adm-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + bars + '</svg>';
    }

    // ---------- ПОЛЬЗОВАТЕЛИ ----------
    function filteredUsers() {
        if (!searchQ.trim()) return D.profiles;
        var q = searchQ.trim().toLowerCase();
        return D.profiles.filter(function (p) {
            return String(p.name || '').toLowerCase().indexOf(q) !== -1 ||
                   String(p.email || '').toLowerCase().indexOf(q) !== -1;
        });
    }

    function renderUsers() {
        var h = '<div class="adm-card">' +
            '<div class="adm-users-bar">' +
                '<div class="adm-search">' + IC.search + '<input id="admSearch" type="text" placeholder="Имя или email…" autocomplete="off" spellcheck="false"></div>' +
                '<span class="adm-users-n">Найдено: <b id="admUsersCount">' + filteredUsers().length + '</b></span>' +
            '</div>' +
            '<div class="adm-uhead">' +
                '<span>Пользователь</span><span>Роль</span><span>Статус</span>' +
                '<span>Регистрация</span><span>Активность</span><span>Данные</span><span></span>' +
            '</div>' +
            '<div class="adm-ubody" id="admUsersBody">' + usersRows() + '</div>' +
        '</div>';
        return h;
    }

    function usersRows() {
        var list = filteredUsers();
        if (!list.length) {
            return '<div class="adm-empty">' + (searchQ ? 'Никого не нашли по запросу «' + esc(searchQ) + '».' : 'Пока нет ни одного пользователя.') + '</div>';
        }
        var byUser = dataByUser();
        return list.map(function (p) {
            var keys = byUser[p.id] || [];
            return '<div class="adm-urow' + (p.banned ? ' banned' : '') + '" data-act="open-user" data-id="' + p.id + '">' +
                '<span class="adm-u-id">' +
                    '<span class="adm-ava' + (p.role === 'admin' ? ' adm' : '') + '">' + esc(initialsOf(p)) + avaPhoto(p) + (isOnline(p) ? '<i class="adm-dot"></i>' : '') + '</span>' +
                    '<span class="adm-u-nm"><b>' + esc(p.name || 'Без имени') + (isMe(p) ? ' <em>вы</em>' : '') + '</b><small>' + esc(p.email || '—') + '</small></span>' +
                '</span>' +
                '<span>' + roleBadge(p) + '</span>' +
                '<span>' + statusBadge(p) + '</span>' +
                '<span class="adm-mono">' + fmtDate(p.created_at) + '</span>' +
                '<span class="adm-mono">' + fmtAgo(p.last_seen_at) + '</span>' +
                '<span class="adm-mono">' + (keys.length ? keys.length + ' кл.' : '—') + '</span>' +
                '<span class="adm-u-chev">' + IC.chev + '</span>' +
            '</div>';
        }).join('');
    }

    function roleBadge(p) {
        return p.role === 'admin'
            ? '<span class="adm-badge role-admin">' + IC.shield + 'админ</span>'
            : '<span class="adm-badge role-user">юзер</span>';
    }
    function statusBadge(p) {
        if (p.banned) return '<span class="adm-badge st-ban">бан</span>';
        if (isOnline(p)) return '<span class="adm-badge st-on">онлайн</span>';
        return '<span class="adm-badge st-ok">активен</span>';
    }

    // ---------- СОБЫТИЯ ----------
    var EV_FILTERS = [
        { id: 'all', t: 'Все' },
        { id: 'auth', t: 'Входы/выходы', match: ['login', 'logout'] },
        { id: 'reg', t: 'Регистрации', match: ['register'] },
        { id: 'pass', t: 'Пароль', match: ['password_reset_request', 'password_reset_done'] },
        { id: 'admin', t: 'Действия админа', match: ['admin_role', 'admin_ban', 'admin_unban', 'admin_clear_data'] }
    ];

    function renderEvents() {
        var flt = EV_FILTERS.filter(function (f) { return f.id === eventFilter; })[0] || EV_FILTERS[0];
        var list = flt.match
            ? D.events.filter(function (e) { return flt.match.indexOf(e.event) !== -1; })
            : D.events;

        var h = '<div class="adm-card">' +
            '<div class="adm-ev-bar">' +
                EV_FILTERS.map(function (f) {
                    return '<button class="adm-pill' + (eventFilter === f.id ? ' active' : '') + '" data-act="ev-filter" data-f="' + f.id + '">' + f.t + '</button>';
                }).join('') +
                '<span class="adm-users-n">Показано: <b>' + list.length + '</b> из ' + D.eventsTotal + '</span>' +
            '</div>';

        if (!list.length) {
            h += '<div class="adm-empty">Под этот фильтр событий пока нет.</div>';
        } else {
            h += '<div class="adm-ehead"><span>Время</span><span>Пользователь</span><span>Событие</span><span>Детали</span></div>' +
                '<div class="adm-ebody">' + list.map(function (e) {
                    var m = evMeta(e.event);
                    var who = e.profiles ? (e.profiles.name || e.profiles.email || '—') : 'удалённый аккаунт';
                    var meta = e.meta && Object.keys(e.meta).length ? JSON.stringify(e.meta) : '';
                    if (meta.length > 80) meta = meta.slice(0, 77) + '…';
                    return '<div class="adm-erow">' +
                        '<span class="adm-mono">' + fmtDT(e.created_at) + '</span>' +
                        '<span class="adm-e-who' + (e.user_id ? '" data-act="open-user" data-id="' + e.user_id : '') + '">' + esc(who) + '</span>' +
                        '<span><span class="adm-ev ' + m.c + '">' + esc(m.t) + '</span></span>' +
                        '<span class="adm-e-meta">' + esc(meta) + '</span>' +
                    '</div>';
                }).join('') + '</div>';
            if (D.eventsHasMore) {
                h += '<button class="adm-btn more" data-act="ev-more">Показать ещё ' + EVENTS_PAGE + '</button>';
            }
        }
        h += '</div>';
        return h;
    }

    // ---------- КАРТОЧКА ПОЛЬЗОВАТЕЛЯ (модалка в <body>) ----------
    var modal = null;
    var modalUser = null;      // profile
    var modalData = null;      // user_data строки со значениями
    var modalEvents = null;    // события пользователя

    function ensureModal() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'admModal';
        modal.innerHTML = '<div class="adm-m-card" role="dialog" aria-label="Карточка пользователя"></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeModal();
            onAction(e);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeModal();
        });
        return modal;
    }

    function openUser(id) {
        var p = D.profiles.filter(function (x) { return x.id === id; })[0];
        if (!p) return;
        modalUser = p;
        modalData = null;
        modalEvents = null;
        ensureModal().classList.add('open');
        document.body.classList.add('adm-modal-open');
        renderModal();

        Promise.all([
            client().from('user_data').select('key,value,updated_at').eq('user_id', id),
            client().from('app_events').select('*').eq('user_id', id)
                .order('created_at', { ascending: false }).limit(15)
        ]).then(function (res) {
            if (!modalUser || modalUser.id !== id) return;   // уже закрыли/сменили
            modalData = res[0].error ? [] : (res[0].data || []);
            modalEvents = res[1].error ? [] : (res[1].data || []);
            renderModal();
        });
    }

    function closeModal() {
        if (!modal || !modal.classList.contains('open')) return;
        modal.classList.remove('open');
        document.body.classList.remove('adm-modal-open');
        modalUser = null;
    }

    function renderModal() {
        if (!modal || !modalUser) return;
        var p = modalUser;
        var me = isMe(p);

        var h = '<button class="adm-m-x" data-act="close-modal" aria-label="Закрыть">' + IC.x + '</button>' +
            '<div class="adm-m-head">' +
                '<span class="adm-ava big' + (p.role === 'admin' ? ' adm' : '') + '">' + esc(initialsOf(p)) + avaPhoto(p) + '</span>' +
                '<div class="adm-m-id">' +
                    '<div class="adm-m-name">' + esc(p.name || 'Без имени') + (me ? ' <em>это вы</em>' : '') + '</div>' +
                    '<div class="adm-m-mail">' + esc(p.email || '—') + '</div>' +
                    '<div class="adm-m-badges">' + roleBadge(p) + statusBadge(p) + '</div>' +
                '</div>' +
            '</div>' +

            '<div class="adm-m-info">' +
                mInfo('Регистрация', fmtDT(p.created_at)) +
                mInfo('Активность', fmtAgo(p.last_seen_at)) +
                mInfo('Ключей данных', modalData ? String(modalData.length) : '…') +
                '<div class="adm-m-cell"><small>ID</small><b class="adm-mono adm-m-uid" data-act="copy-id" data-id="' + p.id + '" title="Скопировать полный ID">' + p.id.slice(0, 8) + '… ' + IC.copy + '</b></div>' +
            '</div>' +

            '<div class="adm-m-actions">' +
                (p.role === 'admin'
                    ? armBtn('role-user', p.id, IC.shield, 'Снять админа', me ? 'С себя роль снять нельзя — попросите другого админа' : '')
                    : armBtn('role-admin', p.id, IC.shield, 'Сделать админом', '')) +
                (p.banned
                    ? armBtn('unban', p.id, IC.check, 'Разблокировать', '')
                    : armBtn('ban', p.id, IC.ban, 'Заблокировать', me ? 'Себя заблокировать нельзя' : '')) +
            '</div>';

        // Данные
        h += '<div class="adm-m-sec-t">Данные пользователя</div>';
        if (!modalData) {
            h += '<div class="adm-empty">Загружаем…</div>';
        } else if (!modalData.length) {
            h += '<div class="adm-empty">Пользователь ещё ничего не сохранил.</div>';
        } else {
            h += '<div class="adm-m-data">' + modalData.map(function (r, i) {
                var str = r.value == null ? 'null' : JSON.stringify(r.value, null, 2);
                var size = fmtSize(str.length);
                var extra = '';
                if (r.key === 'portfolios_v1') extra = pfSummary(r.value);
                return '<details class="adm-m-key"' + (r.key === 'portfolios_v1' ? ' open' : '') + '>' +
                    '<summary><span class="adm-m-key-t">' + esc(keyLabel(r.key)) + '</span>' +
                    '<span class="adm-m-key-s adm-mono">' + size + ' · ' + fmtAgo(r.updated_at) + '</span>' + IC.chev + '</summary>' +
                    extra +
                    '<pre class="adm-json">' + esc(str) + '</pre>' +
                '</details>';
            }).join('') + '</div>';
        }

        // События
        h += '<div class="adm-m-sec-t">Последние события</div>';
        if (!modalEvents) {
            h += '<div class="adm-empty">Загружаем…</div>';
        } else if (!modalEvents.length) {
            h += '<div class="adm-empty">Событий не записано.</div>';
        } else {
            h += '<div class="adm-feed">' + modalEvents.map(function (e) {
                var m = evMeta(e.event);
                return '<div class="adm-feed-row">' +
                    '<span class="adm-ev ' + m.c + '">' + esc(m.t) + '</span>' +
                    '<span class="adm-feed-who adm-mono">' + fmtDT(e.created_at) + '</span>' +
                    '<span class="adm-feed-time">' + fmtAgo(e.created_at) + '</span>' +
                '</div>';
            }).join('') + '</div>';
        }

        // Опасная зона
        var delDisabled = me ? 'Себя удалить нельзя'
            : (p.role === 'admin' ? 'Сначала снимите роль администратора' : '');
        h += '<div class="adm-m-danger">' +
            armBtn('clear-data', p.id, IC.trash, 'Очистить данные', '') +
            armBtn('delete-user', p.id, IC.userX, 'Удалить аккаунт', delDisabled) +
            '<span class="adm-m-danger-s">«Очистить данные» стирает портфели и настройки из облака, аккаунт остаётся. ' +
            '«Удалить аккаунт» удаляет пользователя целиком и безвозвратно.</span>' +
        '</div>';

        modal.querySelector('.adm-m-card').innerHTML = h;
    }

    function mInfo(label, val) {
        return '<div class="adm-m-cell"><small>' + label + '</small><b class="adm-mono">' + val + '</b></div>';
    }

    function armBtn(act, id, ic, label, disabledReason) {
        if (disabledReason) {
            return '<button class="adm-btn" disabled title="' + esc(disabledReason) + '">' + ic + label + '</button>';
        }
        var danger = act === 'ban' || act === 'clear-data' || act === 'role-user' || act === 'delete-user';
        return '<button class="adm-btn arm2' + (danger ? ' danger' : '') + '" data-act="' + act + '" data-id="' + id + '" data-label="' + esc(label) + '">' + ic + '<span>' + label + '</span></button>';
    }

    // краткая сводка портфелей для карточки
    function pfSummary(value) {
        try {
            var items = (value && value.items) || [];
            if (!items.length) return '<div class="adm-empty">Портфелей нет.</div>';
            return '<div class="adm-pf-list">' + items.map(function (p) {
                var holds = (p.holdings || []).length;
                var trades = (p.trades || []).length;
                return '<div class="adm-pf-row">' +
                    '<i style="background:' + esc(pfColor(p.color)) + '"></i>' +
                    '<b>' + esc(p.name || 'Портфель') + '</b>' +
                    '<span class="adm-mono">' + holds + ' поз.' + (trades ? ' · ' + trades + ' сдел.' : '') + (p.hidden ? ' · скрыт' : '') + '</span>' +
                '</div>';
            }).join('') + '</div>';
        } catch (e) { return ''; }
    }
    var PF_COLORS = { blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', violet: '#8b5cf6', red: '#ef4444', cyan: '#06b6d4', pink: '#ec4899', slate: '#64748b' };
    function pfColor(c) { return PF_COLORS[c] || c || '#3b82f6'; }

    // ---------- действия админа ----------
    function updateUserRow(id, patch, evName, evMetaObj, okMsg) {
        client().from('profiles').update(patch).eq('id', id).select().single()
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                // обновляем локальную копию
                for (var i = 0; i < D.profiles.length; i++) {
                    if (D.profiles[i].id === id) { D.profiles[i] = res.data; break; }
                }
                if (modalUser && modalUser.id === id) { modalUser = res.data; renderModal(); }
                supa().logEvent(evName, Object.assign({ target: id, target_email: res.data.email }, evMetaObj || {}));
                toast(okMsg);
                renderApp();
            });
    }

    // Полное удаление: RPC admin_delete_user удаляет строку auth.users,
    // каскад стирает профиль и данные; события остаются с user_id = null.
    function deleteUser(id) {
        var em = (D.profiles.filter(function (p) { return p.id === id; })[0] || {}).email;
        client().rpc('admin_delete_user', { p_user_id: id })
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                D.profiles = D.profiles.filter(function (p) { return p.id !== id; });
                D.dataMeta = D.dataMeta.filter(function (r) { return r.user_id !== id; });
                closeModal();
                supa().logEvent('admin_delete_user', { target: id, target_email: em });
                toast('Аккаунт удалён');
                renderApp();
            });
    }

    function clearUserData(id) {
        client().from('user_data').delete().eq('user_id', id)
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                D.dataMeta = D.dataMeta.filter(function (r) { return r.user_id !== id; });
                if (modalUser && modalUser.id === id) { modalData = []; renderModal(); }
                var em = (D.profiles.filter(function (p) { return p.id === id; })[0] || {}).email;
                supa().logEvent('admin_clear_data', { target: id, target_email: em });
                toast('Данные пользователя очищены');
                renderApp();
            });
    }

    // ---------- клики (делегирование) ----------
    function onAction(e) {
        var btn = e.target.closest ? e.target.closest('[data-act]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        var id = btn.getAttribute('data-id');

        // двухшаговое подтверждение для опасных кнопок
        if (btn.classList.contains('arm2') && !btn.classList.contains('arm')) {
            btn.classList.add('arm');
            var sp = btn.querySelector('span');
            if (sp) sp.textContent = 'Точно?';
            setTimeout(function () {
                btn.classList.remove('arm');
                var s2 = btn.querySelector('span');
                if (s2) s2.textContent = btn.getAttribute('data-label');
            }, 2600);
            return;
        }

        switch (act) {
            case 'sec': section = btn.getAttribute('data-sec'); renderApp(); break;
            case 'refresh': refresh(); break;
            case 'go-home': if (window.switchTab) window.switchTab('home'); break;
            case 'ev-filter': eventFilter = btn.getAttribute('data-f'); renderApp(); break;
            case 'ev-more': loadMoreEvents(); break;
            case 'open-user': e.stopPropagation(); openUser(id); break;
            case 'close-modal': closeModal(); break;
            case 'copy-id':
                try {
                    navigator.clipboard.writeText(id);
                    toast('ID скопирован');
                } catch (err) {}
                break;
            case 'role-admin': updateUserRow(id, { role: 'admin' }, 'admin_role', { role: 'admin' }, 'Пользователь теперь администратор'); break;
            case 'role-user': updateUserRow(id, { role: 'user' }, 'admin_role', { role: 'user' }, 'Роль администратора снята'); break;
            case 'ban': updateUserRow(id, { banned: true }, 'admin_ban', null, 'Пользователь заблокирован'); break;
            case 'unban': updateUserRow(id, { banned: false }, 'admin_unban', null, 'Пользователь разблокирован'); break;
            case 'clear-data': clearUserData(id); break;
            case 'delete-user': deleteUser(id); break;
        }
    }

    // ---------- интеграция с приложением ----------
    function gateNav() {
        var b = dq('sbAdminBtn');
        if (b) b.style.display = (supa() && supa().isAdmin()) ? '' : 'none';
    }

    function onEnterTab() {
        renderGate();
        if (supa() && supa().isAdmin() && !D.loading &&
            (!D.loadedAt || Date.now() - D.loadedAt > 60000)) {
            refresh();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        ensureRoot();
        if (root) root.addEventListener('click', onAction);
        gateNav();
        renderGate();
    });

    var _prevSwitchTab = window.switchTab;
    if (typeof _prevSwitchTab === 'function') {
        window.switchTab = function (tabId) {
            _prevSwitchTab(tabId);
            if (tabId === 'admin') onEnterTab();
            else closeModal();
        };
    }

    if (window.supa) {
        window.supa.onChange(function (kind) {
            gateNav();
            if (typeof currentTab !== 'undefined' && currentTab === 'admin' &&
                (kind === 'init' || kind === 'signin' || kind === 'signout' || kind === 'profile')) {
                onEnterTab();
            }
        });
    }
})();
