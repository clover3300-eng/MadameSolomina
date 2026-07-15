// =============================================
// АДМИНКА — вкладка «Админка» (#panel-admin)
// =============================================
// Видна только пользователям с profiles.role = 'admin' (пункт в
// сайдбаре скрыт для остальных; прямой заход /admin упирается в
// заглушку «нет доступа»). Работает целиком на anon-ключе: доступ
// к чужим строкам открывают RLS-политики public.is_admin().
// Разделы (под тёмной шапкой-героем с живыми KPI — спокойный вариант
// rbx-hero из «Ребаланса», без тяжёлых анимаций):
//   · Обзор       — график регистраций/входов (14/30 дней) и лента событий
//                   одной картой с внутренним разделителем;
//   · Пользователи — фильтры-пилюли, сортировка по колонкам, поиск (и по id),
//                   Excel-выгрузка; карточка: роль, бан, сброс пароля, данные;
//   · События     — журнал app_events: фильтры, раскрытие meta по клику,
//                   Excel-выгрузка, подгрузка страницами;
//   · Оповещения  — рассылка в public.notifications (всем или адресно),
//                   дубль в Telegram через worker /api/notify, история
//                   с числом прочитавших и отзывом. У пользователей —
//                   звоночек в шапке (js/notifications.js).
// Пока вкладка открыта — тихий поллинг раз в 60 с (пропускается, когда
// открыта карточка или печатают в поиске). Опасные действия — двухшаговое
// подтверждение («Точно?»), как у кнопки «Выйти» в кабинете. Полное
// удаление аккаунта — RPC admin_delete_user (security definer,
// см. supabase/schema.sql).
// Грузится после cloud-sync.js, до route-hash.js.

(function () {
    'use strict';

    var root = null;                  // #admRoot
    var section = 'overview';         // overview | users | events | notify | sheet
    var searchQ = '';
    var eventFilter = 'all';
    var userFilter = 'all';           // all | online | pf | admins | banned
    var userSort = { col: 'created', dir: -1 };   // created | seen | data | name
    var chartKind = 'reg';            // график Обзора: reg | login
    var chartDays = 14;               // 14 | 30
    var EVENTS_PAGE = 300;
    var POLL_MS = 60000;              // тихое автообновление, пока вкладка открыта

    var D = {
        profiles: [],                 // public.profiles (новые сверху)
        dataMeta: [],                 // user_data: user_id/key/updated_at (без значений)
        events: [],                   // app_events + вложенный профиль
        eventsTotal: 0,
        eventsHasMore: false,
        events24: 0,                  // точный count за сутки (страница событий может не покрыть их все)
        logins: null,                 // created_at входов за 30 дней — для графика, грузится лениво
        loginsLoading: false,
        profilesCapped: false,        // упёрлись в limit(1000) профилей
        loadedAt: 0,
        loading: false,
        error: null
    };

    // ---------- helpers ----------
    function supa() { return window.supa; }
    function client() { return window.supa.client; }
    function dq(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
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
    // «Онлайн» = активность свежее 5 минут И последнее auth-событие — не выход.
    // Иначе после «Выйти» пользователь ещё до 5 минут горел бы онлайн:
    // last_seen_at остаётся свежим, гасит его только событие logout.
    var lastAuthEv = {};   // uid -> { ev: 'login'|'logout'|'register', ts }
    function rebuildAuthIndex() {
        lastAuthEv = {};
        // D.events отсортированы новые→старые: первое попавшееся и есть свежайшее
        for (var i = 0; i < D.events.length; i++) {
            var e = D.events[i];
            if (!e.user_id || lastAuthEv[e.user_id]) continue;
            if (e.event === 'login' || e.event === 'logout' || e.event === 'register') {
                lastAuthEv[e.user_id] = { ev: e.event, ts: new Date(e.created_at).getTime() };
            }
        }
    }
    function isOnline(p) {
        if (!p.last_seen_at) return false;
        var seen = new Date(p.last_seen_at).getTime();
        if (Date.now() - seen >= 5 * 60 * 1000) return false;
        var a = lastAuthEv[p.id];
        if (a && a.ev === 'logout' && a.ts >= seen) return false;
        return true;
    }
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
        admin_delete_user:      { t: 'Аккаунт удалён',    c: 'ban' },
        admin_notify:           { t: 'Оповещение',        c: 'adm' },
        admin_notify_del:       { t: 'Оповещение отозвано', c: 'ban' },
        admin_gate:             { t: 'Вкладки: заглушки', c: 'adm' },
        admin_gate_notify:      { t: 'Рассылка о готовности', c: 'adm' }
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
        check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        alert: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        dl: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        key: '<svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
        sdir: '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>',
        bell: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
        crown: '<svg viewBox="0 0 24 24"><path d="M2 8l4.5 4L12 4l5.5 8L22 8v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/></svg>',
        info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        send: '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    };

    // ---------- загрузка данных ----------
    // silent=true — тихое обновление поллингом: без «загружаем…» на старте
    function refresh(silent) {
        if (D.loading) return;
        D.loading = true;
        D.error = null;
        if (!silent) renderApp();

        var since24 = new Date(Date.now() - 86400000).toISOString();
        Promise.all([
            client().from('profiles').select('*').order('created_at', { ascending: false }).limit(1000),
            client().from('user_data').select('user_id,key,updated_at').limit(20000),
            client().from('app_events').select('*, profiles(name,email)')
                .order('created_at', { ascending: false }).limit(EVENTS_PAGE),
            client().from('app_events').select('*', { count: 'exact', head: true }),
            // событий за сутки может быть больше первой страницы — считаем на сервере
            client().from('app_events').select('*', { count: 'exact', head: true }).gte('created_at', since24)
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
            rebuildAuthIndex();
            D.eventsTotal = res[3].count || 0;
            D.eventsHasMore = D.events.length < D.eventsTotal;
            D.events24 = res[4].count || 0;
            D.profilesCapped = D.profiles.length >= 1000;
            D.logins = null;               // входы для графика пересоберём при необходимости
            D.loadedAt = Date.now();
            renderApp();
            if (section === 'overview' && chartKind === 'login') loadLogins();
        }, function (e) {
            D.loading = false;
            D.error = String(e && e.message || e);
            renderApp();
        });
    }

    // входы за 30 дней (только даты) — источник графика «Входы»
    function loadLogins() {
        if (D.loginsLoading) return;
        D.loginsLoading = true;
        var since = new Date(Date.now() - 30 * 86400000);
        since.setHours(0, 0, 0, 0);
        client().from('app_events').select('created_at').eq('event', 'login')
            .gte('created_at', since.toISOString()).limit(10000)
            .then(function (res) {
                D.loginsLoading = false;
                D.logins = res.error ? [] : (res.data || []).map(function (r) { return r.created_at; });
                if (section === 'overview') renderApp();
            }, function () {
                D.loginsLoading = false;
                D.logins = [];
                if (section === 'overview') renderApp();
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

    // ---------- Excel-выгрузка ----------
    // CSV по паттерну терминала: BOM для Excel, разделитель «;»,
    // анти-формульный гард (=+@ в начале ячейки гасим апострофом)
    function csvCell(v) {
        var s = String(v == null ? '' : v).replace(/\n/g, ' ');
        if (/^[=+@\t\r]/.test(s) || (s[0] === '-' && !/^-[\d\s.,]+%?$/.test(s))) s = "'" + s;
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function downloadCsv(name, lines) {
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }
    function stamp() {
        var d = new Date();
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    // выгружается текущий срез: фильтры, поиск и сортировка как на экране
    function exportUsers() {
        var byUser = dataByUser();
        var lines = [['Имя', 'Email', 'Роль', 'Статус', 'Регистрация', 'Активность', 'Ключей данных', 'ID']
            .map(csvCell).join(';')];
        filteredUsers().forEach(function (p) {
            lines.push([
                p.name || '', p.email || '',
                p.role === 'admin' ? 'админ' : 'юзер',
                p.banned ? 'бан' : (isOnline(p) ? 'онлайн' : 'активен'),
                fmtDT(p.created_at),
                p.last_seen_at ? fmtDT(p.last_seen_at) : '—',
                (byUser[p.id] || []).length,
                p.id
            ].map(csvCell).join(';'));
        });
        downloadCsv('admin-polzovateli-' + stamp() + '.csv', lines);
        toast('Список пользователей выгружен');
    }
    function exportEvents() {
        var lines = [['Время', 'Пользователь', 'Email', 'Событие', 'Детали']
            .map(csvCell).join(';')];
        filteredEvents().forEach(function (e) {
            var pr = e.profiles || {};
            lines.push([
                fmtDT(e.created_at),
                pr.name || (e.profiles ? '' : 'удалённый аккаунт'),
                pr.email || '',
                evMeta(e.event).t,
                e.meta && Object.keys(e.meta).length ? JSON.stringify(e.meta) : ''
            ].map(csvCell).join(';'));
        });
        downloadCsv('admin-sobytiya-' + stamp() + '.csv', lines);
        toast('Журнал событий выгружен');
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

        var h = renderHero() +
            '<div class="adm-top">' +
                '<div class="adm-seg" role="tablist">' +
                    segBtn('overview', 'Обзор') +
                    segBtn('users', 'Пользователи', D.profiles.length) +
                    segBtn('events', 'События', D.eventsTotal) +
                    segBtn('notify', 'Оповещения', NT.list ? NT.list.length : null) +
                    segBtn('tabs', 'Вкладки', GC.cfg ? (gatesOffCount() || null) : null) +
                    segBtn('sheet', 'Гугл таблица', EA.results.length ? (EA.mismatch || null) : null) +
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
        } else if (section === 'notify') {
            h += renderNotify();
        } else if (section === 'tabs') {
            h += renderTabsAdmin();
        } else if (section === 'sheet') {
            h += renderSheet();
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

        // черновик оповещения переживает перерисовки (поллинг, смена типа):
        // значения держим в NC и возвращаем в поля после каждого рендера
        var nfT = dq('admNfTitle');
        if (nfT) {
            nfT.value = NC.title;
            nfT.addEventListener('input', function () { NC.title = this.value; });
        }
        var nfB = dq('admNfBody');
        if (nfB) {
            nfB.value = NC.body;
            nfB.addEventListener('input', function () { NC.body = this.value; });
        }
        var nfTo = dq('admNfTo');
        if (nfTo) nfTo.addEventListener('change', function () { NC.to = this.value; });

        // раздел «Вкладки»: тексты баннеров живут в GC.cfg и возвращаются
        // в поля после каждой перерисовки (тот же паттерн, что у черновика NC)
        root.querySelectorAll('input[data-gt-msg]').forEach(function (inp) {
            var gtTab = inp.getAttribute('data-gt-msg');
            inp.value = (GC.cfg && GC.cfg[gtTab] && GC.cfg[gtTab].msg) || '';
            inp.addEventListener('input', function () {
                if (!GC.cfg || !GC.cfg[gtTab]) return;
                GC.cfg[gtTab].msg = this.value;
                var sv = dq('admGtSave');
                if (sv) sv.disabled = !(gatesDirty() && !GC.saving);
            });
        });
        // черновик формы «добавить вкладку» — тоже переживает перерисовки
        var gtK = dq('admGtKey');
        if (gtK) {
            gtK.value = GC.addKey;
            gtK.addEventListener('input', function () { GC.addKey = this.value; });
        }
        var gtL = dq('admGtLabel');
        if (gtL) {
            gtL.value = GC.addLabel;
            gtL.addEventListener('input', function () { GC.addLabel = this.value; });
        }
    }

    function segBtn(id, label, n) {
        return '<button class="adm-seg-btn' + (section === id ? ' active' : '') + '" data-act="sec" data-sec="' + id + '">' +
            label + (n != null ? ' <span class="adm-seg-n">' + n + '</span>' : '') + '</button>';
    }

    // ---------- ШАПКА-ГЕРОЙ ----------
    // спокойная версия rbx-hero: та же тёмная подложка и раскладка
    // «идентити | KPI | кнопка», но без анимаций — только статичная сетка
    function renderHero() {
        var now = Date.now(), day = 86400000;
        var loaded = !!D.loadedAt;
        var online = 0, new7 = 0, act24 = 0;
        if (loaded) {
            online = D.profiles.filter(isOnline).length;
            new7 = D.profiles.filter(function (p) { return now - new Date(p.created_at).getTime() < 7 * day; }).length;
            act24 = D.profiles.filter(function (p) { return p.last_seen_at && now - new Date(p.last_seen_at).getTime() < day; }).length;
        }
        var upd = D.loading ? 'загружаем…'
            : (loaded ? 'обновлено ' + pad2(new Date(D.loadedAt).getHours()) + ':' + pad2(new Date(D.loadedAt).getMinutes()) : '');

        return '<div class="adm-hero">' +
            '<div class="adm-hero-fx" aria-hidden="true"><i class="glow"></i><i class="mesh"></i></div>' +
            '<div class="adm-hero-id">' +
                '<div class="adm-hero-ico">' + IC.shield + '</div>' +
                '<div class="adm-hero-t">' +
                    '<div class="adm-hero-title">Админка</div>' +
                    '<div class="adm-hero-sub">Пользователи, данные и события сервиса</div>' +
                '</div>' +
            '</div>' +
            '<div class="adm-hero-kpis">' +
                heroKpi(loaded ? D.profiles.length : '—', 'человек', loaded ? 'за 7 дней <b>+' + new7 + '</b>' : '&nbsp;') +
                '<i class="adm-hero-div"></i>' +
                heroKpi(loaded ? online : '—', 'онлайн', loaded ? 'за 24 ч <b>' + act24 + '</b>' : '&nbsp;') +
                '<i class="adm-hero-div"></i>' +
                heroKpi(loaded ? D.events24 : '—', 'событий · 24 ч', loaded ? 'всего <b>' + D.eventsTotal + '</b>' : '&nbsp;') +
            '</div>' +
            '<div class="adm-hero-side">' +
                '<button class="adm-hero-refresh" data-act="refresh" title="Обновить данные"' + (D.loading ? ' disabled' : '') + '>' + IC.refresh + 'Обновить</button>' +
                '<span class="adm-hero-upd">' + upd + '</span>' +
            '</div>' +
        '</div>';
    }
    function heroKpi(num, label, sub) {
        return '<div class="adm-hkpi">' +
            '<div class="num"><b>' + num + '</b><span>' + label + '</span></div>' +
            '<div class="sub">' + sub + '</div>' +
        '</div>';
    }

    // ---------- ОБЗОР ----------
    // одна карта с внутренним разделителем (как секции rbx-card):
    // слева график с переключателями, справа лента событий
    function renderOverview() {
        // Поллинг сбрасывает D.logins в null и дозагружает их только с открытым
        // Обзором. Если «Входы» выбраны, а раздел открыли позже, без этого
        // вызова карточка навсегда застревала на «Загружаем входы…».
        if (chartKind === 'login' && D.logins === null) loadLogins();
        var byUser = dataByUser();
        var withPf = Object.keys(byUser).filter(function (uid) {
            return byUser[uid].some(function (r) { return r.key === 'portfolios_v1'; });
        }).length;
        var banned = D.profiles.filter(function (p) { return p.banned; }).length;
        var admins = D.profiles.filter(isMod).length;

        var feed;
        if (!D.events.length) {
            feed = '<div class="adm-empty">Событий пока нет — они появятся после первых регистраций и входов.</div>';
        } else {
            feed = '<div class="adm-feed">' + D.events.slice(0, 9).map(function (e) {
                var m = evMeta(e.event);
                var who = e.profiles ? (e.profiles.name || e.profiles.email || '—') : 'удалённый аккаунт';
                // имя ведёт в карточку, если пользователь ещё существует
                var link = e.user_id && e.profiles;
                return '<div class="adm-feed-row">' +
                    '<span class="adm-ev ' + m.c + '">' + esc(m.t) + '</span>' +
                    '<span class="adm-feed-who' + (link ? '" data-act="open-user" data-id="' + e.user_id : '') + '">' + esc(who) + '</span>' +
                    '<span class="adm-feed-time">' + fmtAgo(e.created_at) + '</span>' +
                '</div>';
            }).join('') + '</div>';
        }

        var h = '<div class="adm-card adm-ov">' +
            '<section class="adm-ov-sec">' +
                '<div class="adm-ov-head">' +
                    '<div class="adm-card-t">' + (chartKind === 'reg' ? 'Регистрации' : 'Входы') + ' · ' + chartDays + ' дней</div>' +
                    '<div class="adm-ov-ctl">' +
                        ctlPill('chart-kind', 'reg', 'Регистрации', chartKind === 'reg') +
                        ctlPill('chart-kind', 'login', 'Входы', chartKind === 'login') +
                        '<i class="sep"></i>' +
                        ctlPill('chart-days', '14', '14', chartDays === 14) +
                        ctlPill('chart-days', '30', '30', chartDays === 30) +
                    '</div>' +
                '</div>' + chartSvg() +
            '</section>' +
            '<section class="adm-ov-sec adm-ov-feed">' +
                '<div class="adm-card-t">Последние события</div>' + feed +
            '</section>' +
        '</div>';

        // служебная строка
        h += '<div class="adm-foot-note">Администраторов: ' + admins + ' · Заблокировано: ' + banned +
             ' · С портфелями: ' + withPf + ' · Ключей данных: ' + D.dataMeta.length +
             (D.profilesCapped ? ' · <b>показаны первые 1000 профилей</b>' : '') +
             ' · Удаление аккаунта — в карточке пользователя, раздел «Пользователи».</div>';
        return h;
    }

    function ctlPill(act, f, label, active) {
        return '<button class="adm-pill' + (active ? ' active' : '') + '" data-act="' + act + '" data-f="' + f + '">' + label + '</button>';
    }

    // столбики по дням: регистрации из profiles, входы из ленивого D.logins
    function chartSvg() {
        if (chartKind === 'login' && D.logins === null) {
            return '<div class="adm-empty">Загружаем входы…</div>';
        }
        var days = [];
        var now = new Date(); now.setHours(0, 0, 0, 0);
        for (var i = chartDays - 1; i >= 0; i--) {
            var d = new Date(now.getTime() - i * 86400000);
            days.push({ t: d.getTime(), n: 0, lab: pad2(d.getDate()) });
        }
        var src = chartKind === 'reg'
            ? D.profiles.map(function (p) { return p.created_at; })
            : D.logins;
        src.forEach(function (isoStr) {
            var t = new Date(isoStr); t.setHours(0, 0, 0, 0);
            var idx = Math.round((t.getTime() - days[0].t) / 86400000);
            if (idx >= 0 && idx < days.length) days[idx].n++;
        });
        var max = Math.max.apply(null, days.map(function (d) { return d.n; }));
        if (!max) {
            return '<div class="adm-empty">' +
                (chartKind === 'reg' ? 'За эти дни регистраций не было.' : 'За эти дни входов не было.') + '</div>';
        }

        var W = 560, H = 150, pad = 4, bw = (W - pad * 2) / days.length;
        var labEvery = days.length > 16 ? 3 : 1;   // 30 дней — подписи через две
        var showV = days.length <= 16;             // цифры над столбиками только на 14 днях
        var bars = days.map(function (d, i) {
            var bh = d.n ? Math.max(6, (d.n / max) * (H - 44)) : 3;
            var x = pad + i * bw + bw * 0.18;
            var y = H - 26 - bh;
            return '<g><title>' + fmtDate(new Date(d.t).toISOString()) + ': ' + d.n + '</title>' +
                '<rect class="adm-bar' + (d.n ? '' : ' zero') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
                '" width="' + (bw * 0.64).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="4"/>' +
                (showV && d.n ? '<text class="adm-bar-v" x="' + (x + bw * 0.32).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle">' + d.n + '</text>' : '') +
                (i % labEvery === 0 ? '<text class="adm-bar-l" x="' + (x + bw * 0.32).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + d.lab + '</text>' : '') +
            '</g>';
        }).join('');
        return '<svg class="adm-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + bars + '</svg>';
    }

    // ---------- ПОЛЬЗОВАТЕЛИ ----------
    var U_FILTERS = [
        { id: 'all', t: 'Все' },
        { id: 'online', t: 'Онлайн' },
        { id: 'pf', t: 'С портфелями' },
        { id: 'admins', t: 'Админы' },
        { id: 'banned', t: 'Бан' }
    ];

    function filteredUsers() {
        var list = D.profiles;
        if (userFilter !== 'all') {
            var byUser = userFilter === 'pf' ? dataByUser() : null;
            list = list.filter(function (p) {
                if (userFilter === 'online') return isOnline(p);
                if (userFilter === 'admins') return isMod(p);
                if (userFilter === 'banned') return p.banned;
                return (byUser[p.id] || []).some(function (r) { return r.key === 'portfolios_v1'; });
            });
        }
        if (searchQ.trim()) {
            var q = searchQ.trim().toLowerCase();
            list = list.filter(function (p) {
                return String(p.name || '').toLowerCase().indexOf(q) !== -1 ||
                       String(p.email || '').toLowerCase().indexOf(q) !== -1 ||
                       String(p.id || '').toLowerCase().indexOf(q) !== -1;
            });
        }
        return sortUsers(list);
    }

    function sortUsers(list) {
        var col = userSort.col, dir = userSort.dir;
        var counts = null;
        if (col === 'data') {
            counts = {};
            D.dataMeta.forEach(function (r) { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
        }
        function key(p) {
            if (col === 'name') return String(p.name || p.email || '').toLowerCase();
            if (col === 'seen') return p.last_seen_at ? new Date(p.last_seen_at).getTime() : -Infinity;
            if (col === 'data') return counts[p.id] || 0;
            return new Date(p.created_at).getTime();
        }
        return list.slice().sort(function (a, b) {
            var ka = key(a), kb = key(b);
            if (col === 'name') return ka.localeCompare(kb, 'ru') * dir;
            return (ka - kb) * dir;
        });
    }

    function thSort(col, label) {
        var a = userSort.col === col;
        return '<span><span class="adm-th-sort' + (a ? ' act' + (userSort.dir > 0 ? ' asc' : '') : '') +
            '" data-act="sort-users" data-col="' + col + '" title="Сортировать">' + label + IC.sdir + '</span></span>';
    }

    function renderUsers() {
        var h = '<div class="adm-card">' +
            '<div class="adm-users-bar">' +
                '<div class="adm-search">' + IC.search + '<input id="admSearch" type="text" placeholder="Имя, email или id…" autocomplete="off" spellcheck="false"></div>' +
                '<div class="adm-uflt">' + U_FILTERS.map(function (f) {
                    return ctlPill('u-filter', f.id, f.t, userFilter === f.id);
                }).join('') + '</div>' +
                '<span class="adm-users-n">Найдено: <b id="admUsersCount">' + filteredUsers().length + '</b></span>' +
                '<button class="adm-btn sm" data-act="export-users" title="Выгрузить текущий список (CSV для Excel)">' + IC.dl + 'Excel</button>' +
            '</div>' +
            '<div class="adm-uhead">' +
                thSort('name', 'Пользователь') +
                '<span>Роль</span><span>Статус</span>' +
                thSort('created', 'Регистрация') +
                thSort('seen', 'Активность') +
                thSort('data', 'Данные') +
                '<span></span>' +
            '</div>' +
            '<div class="adm-ubody" id="admUsersBody">' + usersRows() + '</div>' +
        '</div>';
        return h;
    }

    function usersRows() {
        var list = filteredUsers();
        if (!list.length) {
            return '<div class="adm-empty">' + (searchQ ? 'Никого не нашли по запросу «' + esc(searchQ) + '».'
                : (userFilter !== 'all' ? 'Под этот фильтр никто не попадает.' : 'Пока нет ни одного пользователя.')) + '</div>';
        }
        var byUser = dataByUser();
        return list.map(function (p) {
            var keys = byUser[p.id] || [];
            return '<div class="adm-urow' + (p.banned ? ' banned' : '') + '" data-act="open-user" data-id="' + p.id + '">' +
                '<span class="adm-u-id">' +
                    '<span class="adm-ava' + (isMod(p) ? ' adm' : '') + '">' + esc(initialsOf(p)) + avaPhoto(p) + (isOnline(p) ? '<i class="adm-dot"></i>' : '') + '</span>' +
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
        if (p.role === 'owner') return '<span class="adm-badge role-owner">' + IC.crown + 'владелец</span>';
        return p.role === 'admin'
            ? '<span class="adm-badge role-admin">' + IC.shield + 'админ</span>'
            : '<span class="adm-badge role-user">юзер</span>';
    }
    function isMod(p) { return p.role === 'admin' || p.role === 'owner'; }
    function iAmOwner() { return !!(supa().isOwner && supa().isOwner()); }
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
        { id: 'admin', t: 'Действия админа', match: ['admin_role', 'admin_ban', 'admin_unban', 'admin_clear_data', 'admin_delete_user', 'admin_notify', 'admin_notify_del', 'admin_gate', 'admin_gate_notify'] }
    ];

    function filteredEvents() {
        var flt = EV_FILTERS.filter(function (f) { return f.id === eventFilter; })[0] || EV_FILTERS[0];
        return flt.match
            ? D.events.filter(function (e) { return flt.match.indexOf(e.event) !== -1; })
            : D.events;
    }

    function renderEvents() {
        var list = filteredEvents();

        var h = '<div class="adm-card">' +
            '<div class="adm-ev-bar">' +
                EV_FILTERS.map(function (f) {
                    return ctlPill('ev-filter', f.id, f.t, eventFilter === f.id);
                }).join('') +
                '<span class="adm-users-n">Показано: <b>' + list.length + '</b> из ' + D.eventsTotal + '</span>' +
                '<button class="adm-btn sm" data-act="export-events" title="Выгрузить текущий срез журнала (CSV для Excel)">' + IC.dl + 'Excel</button>' +
            '</div>';

        if (!list.length) {
            h += '<div class="adm-empty">Под этот фильтр событий пока нет.</div>';
        } else {
            h += '<div class="adm-ehead"><span>Время</span><span>Пользователь</span><span>Событие</span><span>Детали</span><span></span></div>' +
                '<div class="adm-ebody">' + list.map(function (e) {
                    var m = evMeta(e.event);
                    var who = e.profiles ? (e.profiles.name || e.profiles.email || '—') : 'удалённый аккаунт';
                    var hasMeta = !!(e.meta && Object.keys(e.meta).length);
                    var meta = hasMeta ? JSON.stringify(e.meta) : '';
                    if (meta.length > 80) meta = meta.slice(0, 77) + '…';
                    // строка с meta раскрывается по клику: полный JSON под строкой
                    return '<div class="adm-erow-w">' +
                        '<div class="adm-erow' + (hasMeta ? ' has-meta" data-act="ev-toggle"' : '"') + '>' +
                            '<span class="adm-mono">' + fmtDT(e.created_at) + '</span>' +
                            '<span class="adm-e-who' + (e.user_id ? '" data-act="open-user" data-id="' + e.user_id : '') + '">' + esc(who) + '</span>' +
                            '<span><span class="adm-ev ' + m.c + '">' + esc(m.t) + '</span></span>' +
                            '<span class="adm-e-meta">' + esc(meta) + '</span>' +
                            '<span class="adm-e-chev">' + (hasMeta ? IC.chev : '') + '</span>' +
                        '</div>' +
                        (hasMeta
                            ? '<div class="adm-erow-det"><div class="adm-erow-det-in"><pre class="adm-json">' +
                              esc(JSON.stringify(e.meta, null, 2)) + '</pre></div></div>'
                            : '') +
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
                '<span class="adm-ava big' + (isMod(p) ? ' adm' : '') + '">' + esc(initialsOf(p)) + avaPhoto(p) + '</span>' +
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
                roleActionBtn(p, me) +
                (p.banned
                    ? armBtn('unban', p.id, IC.check, 'Разблокировать', banDisabledReason(p, me))
                    : armBtn('ban', p.id, IC.ban, 'Заблокировать', banDisabledReason(p, me))) +
                armBtn('reset-pass', p.id, IC.key, 'Сброс пароля', resetDisabledReason(p, me)) +
            '</div>';

        // Данные
        h += '<div class="adm-m-sec-t">Данные пользователя</div>';
        if (!modalData) {
            h += '<div class="adm-empty">Загружаем…</div>';
        } else if (!modalData.length) {
            h += '<div class="adm-empty">Пользователь ещё ничего не сохранил.</div>';
        } else {
            h += '<div class="adm-m-data">' + modalData.map(function (r, i) {
                var val = r.value;
                // токен брокера из старых записей — секрет, не показываем даже админу
                if (r.key === 'profile_settings_v1' && val && typeof val === 'object' && val.brokerToken) {
                    val = Object.assign({}, val, { brokerToken: '•••скрыто•••' });
                }
                var str = val == null ? 'null' : JSON.stringify(val, null, 2);
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

        // Опасная зона (правила ролей зеркалят серверные гарды из schema.sql —
        // сервер всё равно не пропустит, тут только честные подсказки)
        var delDisabled = me ? 'Себя удалить нельзя'
            : (p.role === 'owner' ? 'Владельца сервиса удалить нельзя'
            : (p.role === 'admin'
                ? (iAmOwner() ? 'Сначала снимите роль администратора' : 'Администратора удаляет только владелец')
                : ''));
        var clearDisabled = (!me && p.role === 'owner') ? 'Данные владельца — только сам владелец'
            : ((!me && p.role === 'admin' && !iAmOwner()) ? 'Данные администратора чистит владелец' : '');
        h += '<div class="adm-m-danger">' +
            armBtn('clear-data', p.id, IC.trash, 'Очистить данные', clearDisabled) +
            armBtn('delete-user', p.id, IC.userX, 'Удалить аккаунт', delDisabled) +
            '<span class="adm-m-danger-s">«Очистить данные» стирает портфели и настройки из облака, аккаунт остаётся. ' +
            '«Удалить аккаунт» удаляет пользователя целиком и безвозвратно.</span>' +
        '</div>';

        modal.querySelector('.adm-m-card').innerHTML = h;
    }

    function mInfo(label, val) {
        return '<div class="adm-m-cell"><small>' + label + '</small><b class="adm-mono">' + val + '</b></div>';
    }

    // Кнопки карточки с учётом иерархии ролей (user < admin < owner):
    // роли раздаёт только владелец, владелец неприкосновенен, админ не
    // трогает других админов. Сервер (schema.sql 5.3) дублирует все запреты.
    function roleActionBtn(p, me) {
        if (p.role === 'owner') {
            return armBtn('role-user', p.id, IC.crown, 'Владелец',
                'Владелец сервиса — роль передаётся только напрямую в базе данных');
        }
        if (p.role === 'admin') {
            return armBtn('role-user', p.id, IC.shield, 'Снять админа',
                !iAmOwner() ? 'Назначает и снимает администраторов только владелец'
                    : (me ? 'С себя роль снять нельзя' : ''));
        }
        return armBtn('role-admin', p.id, IC.shield, 'Сделать админом',
            !iAmOwner() ? 'Назначает и снимает администраторов только владелец' : '');
    }
    function banDisabledReason(p, me) {
        if (me) return 'Себя заблокировать нельзя';
        if (p.role === 'owner') return 'Владельца заблокировать нельзя';
        if (p.role === 'admin' && !iAmOwner()) return 'Администратора блокирует только владелец';
        return '';
    }
    function resetDisabledReason(p, me) {
        if (!p.email) return 'У пользователя нет email';
        if (me) return '';
        if (p.role === 'owner') return 'Сброс пароля владельцу — только он сам';
        if (p.role === 'admin' && !iAmOwner()) return 'Сброс пароля администратору — только владелец';
        return '';
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

    // письмо для смены пароля — обычный recovery-поток Supabase (хватает
    // anon-ключа), редирект на Главную, где вход ловит kind='recovery'
    function sendReset(id) {
        var p = D.profiles.filter(function (x) { return x.id === id; })[0];
        if (!p || !p.email) return;
        client().auth.resetPasswordForEmail(p.email, { redirectTo: location.origin + '/' })
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                supa().logEvent('password_reset_request', { target: id, target_email: p.email, by: 'admin' });
                toast('Письмо для сброса пароля отправлено');
            });
    }

    function clearUserData(id) {
        client().from('user_data').delete().eq('user_id', id)
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                // Чистим свой аккаунт: локальная копия и модули в памяти тут же
                // перезальют данные обратно в облако — стираем её и перезагружаемся
                // (route-hash вернёт на эту же вкладку). Чужие устройства подхватят
                // удаление при следующем pull (см. cloud-sync.js).
                if (isMe({ id: id }) && window.supaSync && window.supaSync.wipeLocal) {
                    supa().logEvent('admin_clear_data', { target: id, target_email: supa().session.user.email })
                        .then(function () {
                            window.supaSync.wipeLocal();
                            location.reload();
                        });
                    return;
                }
                D.dataMeta = D.dataMeta.filter(function (r) { return r.user_id !== id; });
                if (modalUser && modalUser.id === id) { modalData = []; renderModal(); }
                var em = (D.profiles.filter(function (p) { return p.id === id; })[0] || {}).email;
                supa().logEvent('admin_clear_data', { target: id, target_email: em });
                toast('Данные пользователя очищены');
                renderApp();
            });
    }

    // ---------- ОПОВЕЩЕНИЯ ----------
    // Запись в public.notifications (user_id null = всем) — у пользователей
    // она всплывает под звоночком в шапке (js/notifications.js). Дубль в
    // Telegram — POST /api/notify (worker проверяет, что зовёт админ, и шлёт
    // ботом тем, кто привязал Telegram и включил notify_telegram). История —
    // с числом прочитавших (notification_reads) и отзывом (delete каскадом
    // уносит и отметки).
    var NT = { list: null, reads: {}, loading: false, error: null, sending: false };
    // черновик живёт вне DOM: поллинг перерисовывает раздел, поля восстанавливаются
    var NC = { to: 'all', kind: 'info', title: '', body: '', tg: false };

    var NF_KINDS = [
        { id: 'info',    t: 'Инфо' },
        { id: 'success', t: 'Успех' },
        { id: 'warn',    t: 'Важно' }
    ];
    function nfKindIc(kind) {
        return kind === 'success' ? IC.check : (kind === 'warn' ? IC.alert : IC.info);
    }

    function loadNotify(force) {
        if (NT.loading) return;
        if (!force && NT.list) return;
        NT.loading = true;
        NT.error = null;
        Promise.all([
            client().from('notifications').select('*')
                .order('created_at', { ascending: false }).limit(200),
            client().from('notification_reads').select('notification_id').limit(20000)
        ]).then(function (res) {
            NT.loading = false;
            var bad = res.filter(function (r) { return r.error; })[0];
            if (bad) {
                NT.error = bad.error.message;
            } else {
                NT.list = res[0].data || [];
                NT.reads = {};
                (res[1].data || []).forEach(function (r) {
                    NT.reads[r.notification_id] = (NT.reads[r.notification_id] || 0) + 1;
                });
            }
            if (section === 'notify') renderApp();
        }, function (e) {
            NT.loading = false;
            NT.error = String(e && e.message || e);
            if (section === 'notify') renderApp();
        });
    }

    function sendNotify() {
        if (NT.sending) return;
        var title = NC.title.trim();
        var body = NC.body.trim();
        if (!title) { toast('Введите заголовок оповещения', true); return; }
        NT.sending = true;
        renderApp();
        var target = NC.to === 'all' ? null : NC.to;
        client().from('notifications').insert({
            user_id: target,
            title: title,
            body: body,
            kind: NC.kind,
            created_by: supa().session.user.id
        }).select().single().then(function (res) {
            if (res.error) {
                NT.sending = false;
                toast(supa().errRu(res.error), true);
                renderApp();
                return;
            }
            var em = target ? ((D.profiles.filter(function (p) { return p.id === target; })[0] || {}).email) : null;
            supa().logEvent('admin_notify', {
                target: target || 'all',
                target_email: em || undefined,
                title: title.slice(0, 80),
                telegram: NC.tg
            });
            if (NT.list) { NT.list.unshift(res.data); }
            var wantTg = NC.tg;
            NC.title = '';
            NC.body = '';
            if (!wantTg) {
                NT.sending = false;
                toast(target ? 'Оповещение отправлено пользователю' : 'Оповещение отправлено всем');
                renderApp();
                return;
            }
            fetch('/api/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + supa().session.access_token
                },
                body: JSON.stringify({ user_id: target, title: title, body: body })
            }).then(function (r) { return r.json(); }).then(function (d) {
                NT.sending = false;
                if (d && d.ok) {
                    toast(d.total
                        ? 'Оповещение отправлено. Telegram: ушло ' + d.sent + ' из ' + d.total + (d.failed ? ', ошибок ' + d.failed : '')
                        : 'Оповещение отправлено. В Telegram некому: никто не включил уведомления');
                } else {
                    toast('На сайте отправлено, но Telegram не сработал: ' + ((d && d.error) || 'ошибка сервера'), true);
                }
                renderApp();
            }, function () {
                NT.sending = false;
                toast('На сайте отправлено, но сервер Telegram-рассылки недоступен', true);
                renderApp();
            });
        });
    }

    function deleteNotify(id) {
        client().from('notifications').delete().eq('id', id).then(function (res) {
            if (res.error) { toast(supa().errRu(res.error), true); return; }
            var gone = (NT.list || []).filter(function (n) { return String(n.id) === String(id); })[0];
            NT.list = (NT.list || []).filter(function (n) { return String(n.id) !== String(id); });
            supa().logEvent('admin_notify_del', { notification: id, title: gone ? gone.title.slice(0, 80) : undefined });
            toast('Оповещение отозвано у всех получателей');
            renderApp();
        });
    }

    function renderNotify() {
        if (NT.list === null && !NT.loading && !NT.error) loadNotify();

        // получатели: все или конкретный (список берём из уже загруженных профилей)
        var users = D.profiles.slice().sort(function (a, b) {
            return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'ru');
        });
        var opts = '<option value="all"' + (NC.to === 'all' ? ' selected' : '') + '>Всем пользователям (' + D.profiles.length + ')</option>' +
            users.map(function (p) {
                var label = (p.name || 'Без имени') + (p.email ? ' — ' + p.email : '');
                return '<option value="' + p.id + '"' + (NC.to === p.id ? ' selected' : '') + '>' + esc(label) + '</option>';
            }).join('');

        var form = '<section class="adm-nf-sec">' +
            '<div class="adm-card-t">Новое оповещение</div>' +
            '<label class="adm-nf-lab" for="admNfTo">Кому</label>' +
            '<select class="adm-nf-select" id="admNfTo">' + opts + '</select>' +
            '<label class="adm-nf-lab">Тип</label>' +
            '<div class="adm-nf-kinds">' + NF_KINDS.map(function (k) {
                return ctlPill('nf-kind', k.id, k.t, NC.kind === k.id);
            }).join('') + '</div>' +
            '<label class="adm-nf-lab" for="admNfTitle">Заголовок</label>' +
            '<input class="adm-nf-input" id="admNfTitle" type="text" maxlength="120" placeholder="Например: обновление сервиса" autocomplete="off" spellcheck="false">' +
            '<label class="adm-nf-lab" for="admNfBody">Текст</label>' +
            '<textarea class="adm-nf-text" id="admNfBody" maxlength="2000" rows="5" placeholder="Что произошло и что сделать пользователю…"></textarea>' +
            '<button class="adm-nf-tg' + (NC.tg ? ' on' : '') + '" type="button" data-act="nf-tg" title="Отправить это же сообщение ботом в Telegram — тем, кто привязал его и включил уведомления">' +
                '<i>' + IC.check + '</i>' + IC.send + 'Продублировать в Telegram' +
            '</button>' +
            '<div class="adm-nf-foot">' +
                '<button class="adm-btn primary" data-act="nf-send"' + (NT.sending ? ' disabled' : '') + '>' + IC.bell + (NT.sending ? 'Отправляем…' : 'Отправить') + '</button>' +
                '<span class="adm-nf-hint">Получатели увидят его под звоночком в шапке — рядом с аватаром.</span>' +
            '</div>' +
        '</section>';

        var hist;
        if (NT.error) {
            hist = '<div class="adm-error">Не удалось загрузить оповещения: ' + esc(NT.error) +
                '<br>Если таблиц ещё нет — выполните <b>supabase/schema.sql</b> (раздел 9, «Оповещения») в SQL Editor.</div>';
        } else if (NT.list === null) {
            hist = '<div class="adm-empty">Загружаем…</div>';
        } else if (!NT.list.length) {
            hist = '<div class="adm-empty">Ещё ничего не отправляли — первое оповещение появится здесь.</div>';
        } else {
            hist = '<div class="adm-nfh">' + NT.list.map(function (n) {
                var kind = (n.kind === 'success' || n.kind === 'warn') ? n.kind : 'info';
                var t = n.user_id ? (D.profiles.filter(function (p) { return p.id === n.user_id; })[0]) : null;
                var who = n.user_id
                    ? 'Лично: ' + esc(t ? (t.name || t.email || 'пользователь') : 'удалённый аккаунт')
                    : 'Всем';
                var readN = NT.reads[n.id] || 0;
                var readTxt = n.user_id ? (readN ? 'прочитано' : 'не прочитано') : 'прочитали: ' + readN;
                return '<div class="adm-nfh-row">' +
                    '<span class="adm-nfk ' + kind + '">' + nfKindIc(kind) + '</span>' +
                    '<span class="adm-nfh-m">' +
                        '<b>' + esc(n.title) + '</b>' +
                        (n.body ? '<span class="adm-nfh-b">' + esc(n.body) + '</span>' : '') +
                        '<span class="adm-nfh-meta">' + who + ' · ' + fmtDT(n.created_at) + ' · ' + readTxt + '</span>' +
                    '</span>' +
                    '<button class="adm-btn sm arm2 danger adm-nfh-del" data-act="nf-del" data-id="' + n.id + '" data-label="Отозвать" title="Убрать оповещение у всех получателей">' + IC.trash + '<span>Отозвать</span></button>' +
                '</div>';
            }).join('') + '</div>';
        }

        return '<div class="adm-card adm-nf">' +
            form +
            '<section class="adm-nf-sec adm-nf-histsec">' +
                '<div class="adm-nfh-head">' +
                    '<div class="adm-card-t">Отправленные</div>' +
                    '<button class="adm-btn sm" data-act="nf-refresh" title="Обновить список и счётчики прочтений"' + (NT.loading ? ' disabled' : '') + '>' + IC.refresh + '</button>' +
                '</div>' + hist +
            '</section>' +
        '</div>';
    }

    // ---------- ВКЛАДКИ: заглушки и системные сообщения ----------
    // Конфиг — app_config['tab_gates'] (см. supabase/schema.sql, раздел 10),
    // применяет у пользователей js/tab-gates.js: off = тёмная заглушка
    // «раздел в разработке» с подпиской на готовность (feature_waitlist),
    // msg = баннер поверх вкладки. «Уведомить» шлёт подписчикам адресные
    // оповещения (+ Telegram выбравшим его) и чистит список ожидания.
    var GATE_TABS = [
        { id: 'calc',          t: 'Расчёт' },
        { id: 'portfolio',     t: 'Портфель' },
        { id: 'portfolios',    t: 'Портфели' },
        { id: 'rebalance',     t: 'Ребаланс' },
        { id: 'market',        t: 'Рынок' },
        { id: 'market-stocks', t: 'Терминал' },
        { id: 'backtest',      t: 'Тест портфеля' }
    ];
    // Спец-строка: заглушка ВСЕЙ мобильной версии (ключ 'mobile' в конфиге,
    // fixed-оверлей на экранах ≤1023px рисует tab-gates.js). Баннер к ней
    // не применим — баннеры живут внутри конкретных панелей.
    var GATE_MOBILE = { id: 'mobile', t: 'Мобильная версия', mobile: true };
    // addKey/addLabel — черновик формы «добавить вкладку» (переживает
    // перерисовки, тот же паттерн, что NC у оповещений)
    var GC = { cfg: null, custom: {}, saved: '', wl: null, loading: false, saving: false, notifying: false, error: null, addKey: '', addLabel: '' };

    // Полный список строк раздела: мобильная версия + встроенные вкладки +
    // добавленные админом (custom — задел под будущие вкладки: заглушка
    // применится сама, как только на сайте появится #panel-<ключ>).
    function gateList() {
        var l = [GATE_MOBILE].concat(GATE_TABS);
        Object.keys(GC.custom || {}).forEach(function (k) {
            l.push({ id: k, t: (GC.custom[k] && GC.custom[k].label) || k, custom: true });
        });
        return l;
    }

    function gatesOffCount() {
        if (!GC.cfg) return 0;
        return gateList().filter(function (t) { return GC.cfg[t.id] && GC.cfg[t.id].off; }).length;
    }
    function gatesClean() {
        var tabs = {};
        gateList().forEach(function (t) {
            var g = GC.cfg && GC.cfg[t.id];
            if (!g) return;
            var e = {};
            if (g.off) e.off = true;
            // у мобильной строки баннера нет — только заглушка
            var m = t.mobile ? '' : String(g.msg || '').trim().slice(0, 300);
            if (m) {
                e.msg = m;
                if (g.msgKind === 'warn') e.msgKind = 'warn';
            }
            if (Object.keys(e).length) tabs[t.id] = e;
        });
        return tabs;
    }
    // Снапшот для «есть несохранённые правки»: настройки вкладок + список custom
    function gatesSnap() { return JSON.stringify({ t: gatesClean(), c: GC.custom }); }
    function gatesDirty() { return gatesSnap() !== GC.saved; }
    function wlByTab(tab) {
        return (GC.wl || []).filter(function (r) { return r.tab === tab; });
    }

    function loadGates(force) {
        if (GC.loading) return;
        if (!force && GC.cfg) return;
        GC.loading = true;
        GC.error = null;
        Promise.all([
            client().from('app_config').select('value').eq('key', 'tab_gates').limit(1),
            client().from('feature_waitlist').select('user_id,tab,channel').limit(5000)
        ]).then(function (res) {
            GC.loading = false;
            var bad = res.filter(function (r) { return r.error; })[0];
            if (bad) {
                GC.error = bad.error.message;
            } else {
                var v = (res[0].data && res[0].data[0] && res[0].data[0].value) || {};
                var tabs = v.tabs || {};
                GC.custom = v.custom || {};   // до gateList(): custom-строки читаются из конфига
                GC.cfg = {};
                gateList().forEach(function (t) {
                    var g = tabs[t.id] || {};
                    GC.cfg[t.id] = { off: !!g.off, msg: g.msg || '', msgKind: g.msgKind === 'warn' ? 'warn' : 'info' };
                });
                GC.saved = gatesSnap();
                GC.wl = res[1].data || [];
            }
            if (section === 'tabs') renderApp();
        }, function (e) {
            GC.loading = false;
            GC.error = String(e && e.message || e);
            if (section === 'tabs') renderApp();
        });
    }

    function saveGates() {
        if (GC.saving || !GC.cfg) return;
        GC.saving = true;
        renderApp();
        var tabs = gatesClean();
        client().from('app_config').upsert({
            key: 'tab_gates',
            value: { tabs: tabs, custom: GC.custom },
            updated_by: supa().session.user.id
        }, { onConflict: 'key' }).then(function (res) {
            GC.saving = false;
            if (res.error) { toast(supa().errRu(res.error), true); renderApp(); return; }
            GC.saved = JSON.stringify({ t: tabs, c: GC.custom });
            supa().logEvent('admin_gate', { off: Object.keys(tabs).filter(function (k) { return tabs[k].off; }) });
            // применяем на своей странице сразу — увидеть заглушку можно тут же
            if (window.tabGates) window.tabGates.refresh();
            toast('Настройки вкладок сохранены и уже действуют');
            renderApp();
        });
    }

    // Рассылка «раздел готов»: адресное оповещение каждому подписчику
    // (+ дубль в Telegram выбравшим этот канал), затем список очищается.
    // Подписчиков перечитываем с сервера ПРЯМО перед отправкой — снапшот в
    // GC.wl мог устареть, а delete по вкладке снёс бы новых без оповещения.
    function notifyGateReady(tab) {
        if (GC.notifying) return;
        GC.notifying = true;
        renderApp();
        client().from('feature_waitlist').select('user_id,channel').eq('tab', tab)
            .then(function (res) {
                var subs = res.error ? [] : (res.data || []);
                if (!subs.length) {
                    GC.notifying = false;
                    toast('Подписчиков уже нет — список пуст');
                    loadGates(true);
                    return;
                }
                notifyGateSend(tab, subs);
            }, function () {
                GC.notifying = false;
                toast('Не удалось получить список подписчиков', true);
                renderApp();
            });
    }
    function notifyGateSend(tab, subs) {
        var tabName = (gateList().filter(function (t) { return t.id === tab; })[0] || {}).t || tab;
        var isMob = tab === GATE_MOBILE.id;
        var title = isMob ? 'Мобильная версия открыта' : 'Раздел «' + tabName + '» открыт';
        var body = isMob
            ? 'Мобильная версия готова — теперь сайт удобно открывать прямо с телефона.'
            : 'Мы дописали раздел, на который вы подписывались, — заходите, он уже ждёт вас в меню.';
        client().from('notifications').insert(subs.map(function (s) {
            return { user_id: s.user_id, title: title, body: body, kind: 'success', created_by: supa().session.user.id };
        })).then(function (res) {
            if (res.error) {
                GC.notifying = false;
                toast(supa().errRu(res.error), true);
                renderApp();
                return;
            }
            NT.list = null;   // история оповещений устарела — перечитается при заходе
            var tg = subs.filter(function (s) { return s.channel === 'telegram'; });
            var tgSent = 0;
            function tgNext(i) {
                if (i >= tg.length) return Promise.resolve();
                return fetch('/api/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + supa().session.access_token },
                    body: JSON.stringify({ user_id: tg[i].user_id, title: title, body: body })
                }).then(function (r) { return r.json(); }).then(function (d) {
                    if (d && d.ok && d.sent) tgSent++;
                }, function () {}).then(function () { return tgNext(i + 1); });
            }
            tgNext(0).then(function () {
                return client().from('feature_waitlist').delete().eq('tab', tab);
            }).then(function () {
                GC.notifying = false;
                GC.wl = (GC.wl || []).filter(function (r) { return r.tab !== tab; });
                supa().logEvent('admin_gate_notify', { tab: tab, subscribers: subs.length, telegram: tgSent });
                toast('Оповестили ' + subs.length + ' подписч.' + (tg.length ? ' · Telegram: ' + tgSent + ' из ' + tg.length : ''));
                renderApp();
            });
        });
    }

    function renderTabsAdmin() {
        if (GC.cfg === null && !GC.loading && !GC.error) loadGates();

        if (GC.error) {
            return '<div class="adm-card"><div class="adm-error">Не удалось загрузить настройки вкладок: ' + esc(GC.error) +
                '<br>Если таблиц ещё нет — выполните <b>supabase/schema.sql</b> (раздел 10, «Заглушки вкладок»).</div></div>';
        }
        if (GC.cfg === null) {
            return '<div class="adm-card"><div class="adm-empty">Загружаем настройки вкладок…</div></div>';
        }

        var rows = gateList().map(function (t) {
            var g = GC.cfg[t.id];
            if (!g) { g = GC.cfg[t.id] = { off: false, msg: '', msgKind: 'info' }; }
            var subs = wlByTab(t.id);
            var tgN = subs.filter(function (s) { return s.channel === 'telegram'; }).length;
            var wlTxt = subs.length
                ? subs.length + ' в списке ожидания' + (tgN ? ' · TG: ' + tgN : '')
                : 'подписчиков нет';
            // custom-вкладка, панели которой на сайте ещё нет — честная подсказка
            if (t.custom && !document.getElementById('panel-' + t.id)) {
                wlTxt += ' · вкладки ещё нет — заглушка ждёт её появления';
            }
            var chip = t.mobile ? '<span class="adm-gt-chip">весь сайт ≤1023px</span>'
                : (t.custom ? '<span class="adm-gt-chip blue">своя</span>' : '');
            // мобильной строке баннер не положен: вместо поля и пилюль — пояснение
            var msgCell = t.mobile
                ? '<div class="adm-gt-note">Заглушка закрывает всю мобильную версию — на компьютере сайт работает как обычно.</div>'
                : '<input class="adm-nf-input adm-gt-msg" type="text" maxlength="300" placeholder="Системное сообщение на вкладке (пусто — нет)" data-gt-msg="' + t.id + '" autocomplete="off" spellcheck="false">' ;
            var kindCell = t.mobile ? '' :
                '<div class="adm-gt-kind">' +
                    ctlPill('gt-kind:' + t.id, 'info', 'Инфо', g.msgKind !== 'warn') +
                    ctlPill('gt-kind:' + t.id, 'warn', 'Важно', g.msgKind === 'warn') +
                '</div>';
            return '<div class="adm-gt-row' + (g.off ? ' off' : '') + (t.mobile ? ' mob' : '') + '">' +
                '<div class="adm-gt-name"><b>' + esc(t.t) + chip + '</b><small>' + wlTxt + '</small></div>' +
                '<div class="adm-gt-gate">' +
                    '<button class="ph-sw' + (g.off ? ' on' : '') + '" type="button" data-act="gt-off" data-tab="' + t.id + '" role="switch" aria-checked="' + (g.off ? 'true' : 'false') + '" aria-label="Заглушка: ' + esc(t.t) + '"></button>' +
                    '<span class="adm-gt-gate-l">' + (g.off ? 'Заглушка' : 'Открыта') + '</span>' +
                '</div>' +
                msgCell + kindCell +
                '<div class="adm-gt-act">' +
                    '<button class="adm-btn sm arm2 adm-gt-notify" data-act="gt-notify" data-id="' + t.id + '" data-label="Уведомить"' +
                        (subs.length && !GC.notifying ? '' : ' disabled') +
                        ' title="Разослать подписчикам оповещение «раздел открыт» (+ Telegram выбравшим его) и очистить список">' +
                        IC.bell + '<span>' + (GC.notifying ? 'Шлём…' : 'Уведомить') + '</span></button>' +
                    (t.custom
                        ? '<button class="adm-btn sm danger arm2 adm-gt-del" data-act="gt-del" data-id="' + t.id + '" data-label="Убрать" title="Убрать вкладку из списка (настройки и подписка по ней пропадут после сохранения)"><span>Убрать</span></button>'
                        : '') +
                '</div>' +
            '</div>';
        }).join('');

        return '<div class="adm-card adm-gt">' +
            '<div class="adm-gt-head">' +
                '<div>' +
                    '<div class="adm-card-t">Заглушки и сообщения вкладок</div>' +
                    '<div class="adm-gt-s">Заглушка закрывает раздел тёмной сценой в стиле Главной — авторизованные могут подписаться на новость о готовности. Сообщение — баннер поверх работающей вкладки. «Мобильная версия» закрывает весь сайт на телефонах. Главную и Админку закрыть нельзя.</div>' +
                '</div>' +
                '<button class="adm-btn sm" data-act="gt-refresh" title="Перечитать настройки и подписчиков"' + (GC.loading ? ' disabled' : '') + '>' + IC.refresh + '</button>' +
            '</div>' +
            '<div class="adm-gt-list">' + rows + '</div>' +
            '<div class="adm-gt-add">' +
                '<input class="adm-nf-input" id="admGtKey" type="text" maxlength="24" placeholder="ключ латиницей: news" autocomplete="off" spellcheck="false">' +
                '<input class="adm-nf-input" id="admGtLabel" type="text" maxlength="40" placeholder="Название вкладки (например «Новости»)" autocomplete="off" spellcheck="false">' +
                '<button class="adm-btn sm" data-act="gt-add">' + IC.plus + '<span>Добавить вкладку</span></button>' +
            '</div>' +
            '<span class="adm-nf-hint">Задел на будущее: ключ = id панели новой вкладки (panel-&lt;ключ&gt;). Добавленная вкладка рождается под заглушкой — как только разработчики выложат саму вкладку, заглушка и подписка применятся к ней автоматически.</span>' +
            '<div class="adm-gt-foot">' +
                '<button class="adm-btn primary" id="admGtSave" data-act="gt-save"' + ((gatesDirty() && !GC.saving) ? '' : ' disabled') + '>' + IC.check + (GC.saving ? 'Сохраняем…' : 'Сохранить изменения') + '</button>' +
                '<span class="adm-nf-hint">Изменения вступают в силу у пользователей в течение пары минут (кэш конфига) или при следующем заходе.</span>' +
            '</div>' +
        '</div>';
    }

    // ---------- свои вкладки (задел на будущее) ----------
    function addGateTab() {
        if (!GC.cfg) return;
        var key = (GC.addKey || '').trim().toLowerCase();
        var label = (GC.addLabel || '').trim();
        if (!/^[a-z][a-z0-9-]{1,23}$/.test(key)) {
            toast('Ключ — латиницей: буквы, цифры, дефис; от 2 до 24 символов', true);
            return;
        }
        var taken = key === 'home' || key === 'admin' ||
            gateList().some(function (t) { return t.id === key; });
        if (taken) { toast('Такой ключ уже занят', true); return; }
        GC.custom[key] = { label: label || key };
        // новая вкладка рождается закрытой — это её смысл до релиза
        GC.cfg[key] = { off: true, msg: '', msgKind: 'info' };
        GC.addKey = '';
        GC.addLabel = '';
        renderApp();
        toast('Вкладка добавлена — не забудьте «Сохранить изменения»');
    }
    function removeGateTab(key) {
        if (!GC.custom[key]) return;
        delete GC.custom[key];
        delete GC.cfg[key];
        renderApp();
    }

    // ---------- клики (делегирование) ----------
    // ---------- АУДИТ ЭШЕЛОНОВ («Гугл таблица») ----------
    // Тикеры и их «проставленный» эшелон берём из echelonTableData (данные
    // Google-таблицы «Акции», 4 колонки = 4 эшелона). Для каждого тикера
    // тянем историю дивидендов с MOEX (fetchDividendRows из company.js, с
    // общим кэшем divHistoryCache) и вычисляем «дивидендный» эшелон:
    //   1 — платят каждый год И повышают;
    //   2 — платят каждый год, но суммы разнятся;
    //   3 — платят через раз (есть пропуски);
    //   4 — не платят вовсе.
    // Расхождение проставленного и вычисленного = сигнал проверить вручную.
    var ECH_ROMAN = ['I', 'II', 'III', 'IV'];
    var ECH_DESC = {
        1: 'платят каждый год и повышают',
        2: 'платят каждый год, суммы разнятся',
        3: 'платят через раз (есть пропуски)',
        4: 'дивиденды не платят'
    };
    // Google-таблица «Акции» — источник эшелонов (SHEET_ID/GID из core.js)
    var SHEET_LINK = 'https://docs.google.com/spreadsheets/d/1SFV5dBIsvfX5HKbXBuXHFVvBfw1p1MPPx2uK209ajLM/edit#gid=1213653337';
    var AUDIT_LS = 'ech_audit_v1';    // кэш результатов: бейдж на аватаре сразу после загрузки, без 24 запросов к MOEX
    var AUDIT_TTL = 6 * 3600000;
    var sheetFilter = 'all';          // all | ok | bad | na — фильтр-чипы раздела
    var EA = { results: [], mismatch: 0, running: false, ranAt: 0, bgStarted: false, _promise: null, _sig: '' };

    // Классификация эшелона по истории выплат. Возвращает { ech: 0..4, why }.
    // Решают ПОСЛЕДНИЕ 3 ЗАКРЫТЫХ ГОДА: разовый пропуск старше трёх лет
    // (например, санкционный 2022 у Сбера) не выбрасывает стабильного
    // плательщика из I эшелона — по свежим годам он платит и повышает.
    // 0 — «без оценки» (короткая история, судить рано, в расхождения не идёт).
    function ruYears(n) {
        var m = n % 100, d = n % 10;
        return n + ' ' + (m > 10 && m < 20 ? 'лет' : d === 1 ? 'год' : d > 1 && d < 5 ? 'года' : 'лет');
    }
    function classifyDivs(rows) {
        var Y = new Date().getFullYear();
        var end = Y - 1;                          // текущий год ещё не закрыт
        var map = {}, minY = Infinity, maxY = -Infinity;
        (rows || []).forEach(function (r) {
            var y = +r.year;
            if (r.sum > 0) {
                map[y] = (map[y] || 0) + r.sum;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        });
        if (minY === Infinity) return { ech: 4, why: 'выплат не найдено' };
        if (maxY < end - 1) return { ech: 4, why: 'последняя выплата — ' + maxY };   // молчат ≥2 закрытых лет
        if (minY > end - 2) return { ech: 0, why: 'мало истории (платят с ' + minY + ')' };
        var r3 = [end - 2, end - 1, end];
        if (r3.some(function (y) { return map[y] == null; })) {
            // пропуск в свежей тройке лет — «когда платят, когда нет»
            var start = Math.max(Y - 5, minY), missed = [];
            for (var y = start; y <= end; y++) if (map[y] == null) missed.push(y);
            return { ech: 3, why: 'пропуск' + (missed.length > 1 ? 'и' : '') + ': ' + missed.join(', ') };
        }
        // последние 3 года платили: повышают или разнятся?
        var dropY = 0;
        for (var i = 1; i < r3.length; i++) {
            if (map[r3[i]] < map[r3[i - 1]] * 0.999) dropY = r3[i];
        }
        if (dropY) return { ech: 2, why: 'в ' + dropY + ' выплата снизилась' };
        // серия лет без снижения — вглубь, пока года идут подряд
        var streak = 1;
        for (var y2 = end; y2 > minY; y2--) {
            if (map[y2] != null && map[y2 - 1] != null && map[y2] >= map[y2 - 1] * 0.999) streak++;
            else break;
        }
        return { ech: 1, why: 'платят и повышают ' + ruYears(streak) + ' подряд' };
    }

    // Источник: тикер + проставленный эшелон из таблицы «Акции».
    function eaSource() {
        var out = [], seen = {};
        if (typeof echelonTableData === 'undefined' || !echelonTableData) return out;
        for (var c = 0; c < echelonTableData.length; c++) {
            (echelonTableData[c] || []).forEach(function (a) {
                if (!a || !a.t) return;
                var t = String(a.t).trim().toUpperCase();
                if (!t || seen[t]) return;
                seen[t] = true;
                out.push({ t: t, n: a.n || a.t, assigned: c + 1 });
            });
        }
        return out;
    }

    function divFn() {
        return (typeof fetchDividendRows === 'function') ? fetchDividendRows
            : (typeof window.fetchDividendRows === 'function' ? window.fetchDividendRows : null);
    }

    // Подпись состава таблицы: если тикеры/эшелоны в Google-таблице поменялись,
    // сохранённый кэш аудита считается устаревшим.
    function eaSig(src) {
        return src.map(function (s) { return s.t + ':' + s.assigned; }).join(',');
    }

    function auditAnnounce() {
        try { window.dispatchEvent(new CustomEvent('echelon-audit', { detail: { mismatch: EA.mismatch, total: EA.results.length } })); } catch (e) {}
    }

    function saveAuditCache() {
        try { localStorage.setItem(AUDIT_LS, JSON.stringify({ v: 2, ranAt: EA.ranAt, sig: EA._sig, results: EA.results })); } catch (e) {}
    }
    function loadAuditCache() {
        try {
            var c = JSON.parse(localStorage.getItem(AUDIT_LS) || 'null');
            if (!c || c.v !== 2 || !c.results || !c.results.length) return null;
            if (Date.now() - c.ranAt > AUDIT_TTL) return null;
            return c;
        } catch (e) { return null; }
    }

    // Прогон аудита с ограниченной параллельностью, чтобы не завалить прокси MOEX.
    function runAudit(force) {
        if (EA.running) return EA._promise;
        var src = eaSource();
        if (!src.length) return Promise.resolve([]);
        if (!force && EA.ranAt && EA.results.length && Date.now() - EA.ranAt < 30 * 60000) {
            return Promise.resolve(EA.results);
        }
        var fn = divFn();
        if (!fn) return Promise.resolve([]);
        EA.running = true;
        var i = 0, CONC = 4, results = [];
        function worker() {
            if (i >= src.length) return Promise.resolve();
            var item = src[i++];
            return fn(item.t).then(function (rows) {
                var c = classifyDivs(rows);
                var last = rows && rows[0] ? rows[0] : null;
                results.push({
                    t: item.t, n: item.n, assigned: item.assigned, expected: c.ech, why: c.why,
                    match: c.ech === 0 ? null : (c.ech === item.assigned),
                    lastYear: last ? last.year : '', lastSum: last ? last.sum : null,
                    years: rows ? rows.length : 0
                });
            }, function () {
                results.push({ t: item.t, n: item.n, assigned: item.assigned, expected: 0, why: '', match: null, error: true });
            }).then(worker);
        }
        var pool = [];
        for (var k = 0; k < CONC; k++) pool.push(worker());
        EA._promise = Promise.all(pool).then(function () {
            results.sort(function (a, b) { return a.assigned - b.assigned || a.t.localeCompare(b.t); });
            EA.results = results;
            EA.ranAt = Date.now();
            EA.running = false;
            EA.mismatch = results.filter(function (r) { return r.match === false; }).length;
            EA._sig = eaSig(src);
            saveAuditCache();
            auditAnnounce();
            if (root && !document.hidden && typeof currentTab !== 'undefined' && currentTab === 'admin' && section === 'sheet') renderApp();
            return results;
        });
        return EA._promise;
    }

    // Фоновый аудит для админа: сперва поднимаем сохранённый результат (бейдж
    // загорается мгновенно), затем ждём echelonTableData из Google-таблицы и,
    // если кэша нет / состав изменился / кэш старше TTL — пересчитываем.
    function bgAudit() {
        if (!(supa() && supa().isAdmin())) return;
        if (EA.bgStarted) { runAudit(); return; }
        EA.bgStarted = true;
        var cached = loadAuditCache();
        if (cached) {
            EA.results = cached.results;
            EA.ranAt = cached.ranAt;
            EA._sig = cached.sig || '';
            EA.mismatch = cached.results.filter(function (r) { return r.match === false; }).length;
            auditAnnounce();
        }
        var tries = 0;
        (function attempt() {
            var src = eaSource();
            if (src.length && divFn()) {
                if (EA.results.length && EA._sig === eaSig(src)) return;   // кэш актуален
                EA.ranAt = 0;                                               // состав изменился — мимо TTL
                runAudit();
                return;
            }
            if (tries++ < 25) setTimeout(attempt, 3000);
        })();
    }

    window.echelonAudit = {
        run: runAudit,
        results: function () { return EA.results; },
        mismatch: function () { return EA.mismatch; },
        running: function () { return EA.running; },
        ranAt: function () { return EA.ranAt; },
        // прыжок из бейджа на аватаре прямо в раздел «Гугл таблица»
        open: function () {
            section = 'sheet';
            if (typeof currentTab !== 'undefined' && currentTab === 'admin') renderApp();
            else if (typeof window.switchTab === 'function') window.switchTab('admin');
        }
    };

    function echBadge(n, kind) {
        // kind: 'ok' | 'bad' | 'na'
        return '<span class="adm-echb ' + kind + '">' + (n ? ECH_ROMAN[n - 1] : '—') + '</span>';
    }

    function renderSheet() {
        var src = eaSource();
        if (!src.length) {
            return '<div class="adm-sheet">' +
                '<div class="adm-gate"><div class="adm-gate-s">Таблица «Акции» ещё не подтянулась из Google-таблицы. ' +
                'Откройте вкладку «Рынок» или обновите страницу — тикеры и эшелоны появятся здесь.</div></div></div>';
        }
        var res = EA.results;
        var legend = ECH_ROMAN.map(function (r, k) {
            return '<span class="adm-lg"><i class="adm-echb ok">' + r + '</i>' + ECH_DESC[k + 1] + '</span>';
        }).join('');
        var checked = EA.ranAt ? 'проверено ' + pad2(new Date(EA.ranAt).getHours()) + ':' + pad2(new Date(EA.ranAt).getMinutes()) : '';
        var head = '<div class="adm-sheet-head">' +
            '<div class="adm-sheet-tt">' +
                '<div class="adm-sheet-t">' + IC.grid + 'Эшелоны по дивидендам</div>' +
                '<div class="adm-sheet-s">Сверяем эшелон из Google-таблицы «Акции» с историей выплат MOEX: решают последние 3 закрытых года, разовый пропуск старше (например, 2022) эшелон не понижает. Клик по тикеру — карточка компании с дивидендами.</div>' +
            '</div>' +
            '<div class="adm-sheet-act">' +
                '<a class="adm-btn sm" href="' + SHEET_LINK + '" target="_blank" rel="noopener" title="Открыть лист «Акции» в Google Sheets">' + IC.grid + 'Таблица</a>' +
                '<button class="adm-btn sm" data-act="sheet-export"' + (res.length ? '' : ' disabled') + ' title="Выгрузить результат сверки (CSV для Excel)">' + IC.dl + 'Excel</button>' +
                '<button class="adm-btn sm" data-act="sheet-refresh"' + (EA.running ? ' disabled' : '') + ' title="Забрать свежие дивиденды с MOEX и пересчитать">' + IC.refresh + (EA.running ? 'Считаем…' : 'Пересчитать') + '</button>' +
                (checked ? '<span class="adm-sheet-upd">' + checked + '</span>' : '') +
            '</div>' +
        '</div>';

        if (!res.length) {
            runAudit();
            return '<div class="adm-sheet">' + head +
                '<div class="adm-gate"><div class="adm-gate-s">Считаем эшелоны по истории дивидендов ' + src.length + ' тикеров…</div></div></div>';
        }

        var bad = res.filter(function (r) { return r.match === false; }).length;
        var na = res.filter(function (r) { return r.match === null; }).length;
        var ok = res.length - bad - na;
        // чипы-счётчики работают фильтрами: клик оставляет только свой срез, повторный — все
        function chip(f, cls, icon, label) {
            return '<button type="button" class="adm-chip ' + cls + (sheetFilter === f ? ' on' : '') + '" data-act="sheet-filter" data-f="' + f + '" title="Показать только этот срез (повторный клик — все)">' + icon + label + '</button>';
        }
        var summary = '<div class="adm-sheet-sum">' +
            chip('ok', 'ok', IC.check, ok + ' совпадает') +
            chip('bad', bad ? 'bad' : 'mut', IC.alert, bad + ' расхождений') +
            chip('na', 'mut', '', na + ' без оценки') +
            '<span class="adm-sheet-legend">' + legend + '</span>' +
        '</div>';

        var kindOf = function (r) { return r.match === false ? 'bad' : (r.match === null ? 'na' : 'ok'); };
        var RANK = { bad: 0, na: 1, ok: 2 };   // проблемы — наверх колонки

        // Группируем по проставленному эшелону — «все тикеры распределены по эшелонам».
        var cols = '';
        for (var e = 1; e <= 4; e++) {
            var rows = res.filter(function (r) {
                return r.assigned === e && (sheetFilter === 'all' || kindOf(r) === sheetFilter);
            });
            rows.sort(function (a, b) { return RANK[kindOf(a)] - RANK[kindOf(b)] || a.t.localeCompare(b.t); });
            var rowsHtml = rows.length ? rows.map(function (r) {
                var kind = r.match === false ? 'bad' : (r.match === null ? 'na' : 'ok');
                var expBadge = r.expected ? echBadge(r.expected, kind) : '<span class="adm-echb na">—</span>';
                var note = r.error ? 'нет данных MOEX'
                    : (r.why || (r.expected === 0 ? 'мало истории'
                    : (r.match === false ? 'дивиденды → ' + ECH_ROMAN[r.expected - 1] + ' эшелон' : ECH_DESC[r.expected])));
                var last = (r.lastSum != null && r.lastYear)
                    ? ' · ' + r.lastYear + ': ' + r.lastSum.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽' : '';
                return '<div class="adm-srow ' + kind + '" data-act="sheet-open" data-ticker="' + esc(r.t) + '" data-ech="' + r.assigned + '" title="Открыть карточку компании ' + esc(r.t) + '">' +
                    '<span class="adm-sr-sig">' + (r.match === false ? IC.alert : (r.match === null ? IC.grid : IC.check)) + '</span>' +
                    '<span class="adm-sr-t">' + esc(r.t) + '</span>' +
                    expBadge +
                    '<span class="adm-sr-meta"><span class="adm-sr-n">' + esc(r.n) + '</span>' +
                        '<span class="adm-sr-note">' + note + last + '</span></span>' +
                '</div>';
            }).join('') : '<div class="adm-sempty">' + (sheetFilter === 'all' ? 'нет тикеров' : 'нет под фильтром') + '</div>';
            cols += '<div class="adm-scol">' +
                '<div class="adm-scol-h"><span class="adm-echb ok">' + ECH_ROMAN[e - 1] + '</span>' + ECH_ROMAN[e - 1] + ' эшелон' +
                    '<span class="adm-scol-n">' + rows.length + '</span></div>' +
                '<div class="adm-scol-b">' + rowsHtml + '</div>' +
            '</div>';
        }

        return '<div class="adm-sheet">' + head + summary + '<div class="adm-scols">' + cols + '</div></div>';
    }

    // Excel-выгрузка сверки: как у пользователей/событий — BOM, «;», анти-формульный гард
    function exportSheet() {
        if (!EA.results.length) return;
        var lines = ['Тикер;Название;Эшелон (таблица);Эшелон (дивиденды);Статус;Причина;Последний год выплаты;Сумма за год, ₽;Лет с выплатами'];
        EA.results.forEach(function (r) {
            var status = r.error ? 'нет данных MOEX'
                : (r.match === false ? 'расхождение' : (r.match === null ? 'без оценки' : 'совпадает'));
            lines.push([
                r.t, r.n, ECH_ROMAN[r.assigned - 1],
                r.expected ? ECH_ROMAN[r.expected - 1] : '—', status, r.why || '',
                r.lastYear || '', r.lastSum != null ? String(r.lastSum).replace('.', ',') : '', r.years || 0
            ].map(csvCell).join(';'));
        });
        downloadCsv('echelon-audit-' + stamp() + '.csv', lines);
        toast('Выгрузка сформирована');
    }

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
            case 'sec':
                section = btn.getAttribute('data-sec');
                // «Вкладки»: подписчики и конфиг меняются извне — освежаем на входе
                if (section === 'tabs' && GC.cfg && !GC.saving && !gatesDirty()) loadGates(true);
                renderApp();
                break;
            case 'refresh': refresh(); break;
            case 'go-home': if (window.switchTab) window.switchTab('home'); break;
            case 'ev-filter': eventFilter = btn.getAttribute('data-f'); renderApp(); break;
            case 'ev-more': loadMoreEvents(); break;
            case 'ev-toggle':
                var w = btn.closest('.adm-erow-w');
                if (w) w.classList.toggle('exp');
                break;
            case 'u-filter': userFilter = btn.getAttribute('data-f'); renderApp(); break;
            case 'sort-users':
                var col = btn.getAttribute('data-col');
                if (userSort.col === col) userSort.dir = -userSort.dir;
                else userSort = { col: col, dir: col === 'name' ? 1 : -1 };
                renderApp();
                break;
            case 'chart-kind':
                chartKind = btn.getAttribute('data-f');
                if (chartKind === 'login' && D.logins === null) loadLogins();
                renderApp();
                break;
            case 'chart-days': chartDays = +btn.getAttribute('data-f'); renderApp(); break;
            case 'export-users': exportUsers(); break;
            case 'export-events': exportEvents(); break;
            case 'reset-pass': sendReset(id); break;
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
            case 'sheet-refresh':
                // чистим сессионный кэш дивидендов (company.js), иначе «пересчитать»
                // возьмёт те же старые данные; renderSheet сам запустит runAudit
                try { window.divHistoryCache = {}; } catch (err) {}
                EA.results = [];
                EA.ranAt = 0;
                renderApp();
                break;
            case 'sheet-export': exportSheet(); break;
            case 'sheet-filter':
                sheetFilter = sheetFilter === btn.getAttribute('data-f') ? 'all' : btn.getAttribute('data-f');
                renderApp();
                break;
            case 'sheet-open':
                var tk = btn.getAttribute('data-ticker');
                var ech = +btn.getAttribute('data-ech') || 1;
                if (typeof window.openStockDetail === 'function') window.openStockDetail(tk, ech);
                break;
            case 'nf-kind': NC.kind = btn.getAttribute('data-f'); renderApp(); break;
            case 'nf-tg': NC.tg = !NC.tg; renderApp(); break;
            case 'nf-send': sendNotify(); break;
            case 'nf-refresh': loadNotify(true); break;
            case 'nf-del': deleteNotify(id); break;
            case 'gt-off':
                var gtTab = btn.getAttribute('data-tab');
                if (GC.cfg && GC.cfg[gtTab]) { GC.cfg[gtTab].off = !GC.cfg[gtTab].off; renderApp(); }
                break;
            case 'gt-save': saveGates(); break;
            case 'gt-refresh': loadGates(true); break;
            case 'gt-notify': notifyGateReady(id); break;
            case 'gt-add': addGateTab(); break;
            case 'gt-del': removeGateTab(id); break;
            default:
                // пилюли типа баннера: data-act="gt-kind:<tab>"
                if (act && act.indexOf('gt-kind:') === 0 && GC.cfg) {
                    var kt = act.slice(8);
                    if (GC.cfg[kt]) { GC.cfg[kt].msgKind = btn.getAttribute('data-f'); renderApp(); }
                }
        }
    }

    // ---------- тихий поллинг ----------
    // раз в POLL_MS перезагружаем данные, пока вкладка открыта; пропускаем,
    // когда вкладка браузера в фоне, открыта карточка или печатают в поиске
    var pollTimer = null;
    function startPoll() {
        stopPoll();
        pollTimer = setInterval(function () {
            if (document.hidden || D.loading) return;
            if (!supa() || !supa().isAdmin()) return;
            if (modal && modal.classList.contains('open')) return;
            var ae = document.activeElement;
            // печатают в поиске или в форме оповещения — не перерисовываем из-под рук
            if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && root && root.contains(ae)) return;
            refresh(true);
        }, POLL_MS);
    }
    function stopPoll() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    // ---------- интеграция с приложением ----------
    function gateNav() {
        var b = dq('sbAdminBtn');
        if (b) b.style.display = (supa() && supa().isAdmin()) ? '' : 'none';
    }

    function onEnterTab() {
        renderGate();
        if (supa() && supa().isAdmin()) {
            if (!D.loading && (!D.loadedAt || Date.now() - D.loadedAt > 60000)) refresh();
            startPoll();
            bgAudit();
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
            else { stopPoll(); closeModal(); }
        };
    }

    if (window.supa) {
        window.supa.onChange(function (kind) {
            gateNav();
            // Фоновый аудит эшелонов запускаем для админа сразу, как узнали роль —
            // чтобы красный сигнал на аватаре зажёгся, даже если в Админку не заходили.
            if ((kind === 'init' || kind === 'signin' || kind === 'profile') && supa() && supa().isAdmin()) bgAudit();
            if (typeof currentTab !== 'undefined' && currentTab === 'admin' &&
                (kind === 'init' || kind === 'signin' || kind === 'signout' || kind === 'profile')) {
                onEnterTab();
            }
        });
    }
})();
