// =============================================
// УВЕДОМЛЕНИЯ — звоночек в шапке
// =============================================
// Кнопка-звоночек #nfBell встаёт в шапку СЛЕВА от аватара (#topProfileBtn)
// и живёт по его правилам видимости: все вкладки, кроме Главной. Показана
// только при живой сессии Supabase — оповещения приходят из облака
// (public.notifications: общие user_id=null и адресные), отметки
// «прочитано» — public.notification_reads. Красный «!» админа на самом
// аватаре не трогаем — это другой сигнал (аудит эшелонов).
//   • бейдж-счётчик непрочитанных (синий, в тон бренда);
//   • клик — панель #nfPanel (живёт в <body>: fixed нельзя класть в
//     анимируемые панели, паттерн stockDetailCard/#profileHub);
//   • открытие панели отмечает всё прочитанным (подсветка «новых»
//     держится до закрытия);
//   • шестерёнка — настройки доставки: браузер (Notification API,
//     флаг notifyBrowser в profile_settings_v1 — синхронизируется),
//     Telegram (profiles.notify_telegram, рассылает worker /api/notify),
//     push на телефон — задел «скоро»;
//   • тихий поллинг раз в 5 минут + обновление при возврате на вкладку;
//     если вкладка в фоне и включён браузерный режим — новое оповещение
//     показывается системным уведомлением.
// Грузится после profile-menu.js (кнопка встаёт рядом с готовым
// аватаром), до route-hash.js.

(function () {
    'use strict';

    var LS_SETTINGS = 'profile_settings_v1';   // notifyBrowser живёт тут (ключ уже в cloud-sync.WATCH)
    var LS_LAST = 'nf_seen_ts_v1';             // локальная метка «до сюда браузером уже оповещали» (вне WATCH)
    // ЛОКАЛЬНЫЕ уведомления (msNotify.local) — события УСТРОЙСТВА: сделки и
    // алерты терминала. В облачную таблицу notifications им нельзя: брокерский
    // контур не покидает устройство (cloud-sync.LOCAL_ONLY), поэтому свой ключ
    // ВНЕ WATCH — живут в том же звоночке, но не синкаются
    var LS_LOCAL = 'nf_local_v1', LOCAL_MAX = 30;
    var POLL_MS = 5 * 60000;

    var bell = null, panel = null, pollT = null;
    var NF = {
        local: [],       // локальные (сделки/алерты терминала), новые сверху
        list: [],        // оповещения, новые сверху
        read: {},        // id -> true (прочитано)
        pending: {},     // id -> true: отметили локально, сервер мог ещё не подтвердить —
                         // иначе fetch, стартовавший параллельно с upsert, воскресит бейдж
        unread: 0,
        snap: {},        // id -> true: были непрочитанными на момент открытия панели (подсветка)
        snapCount: 0,
        loaded: false,
        loading: false,
        view: 'list'     // list | prefs
    };

    // ---------- helpers ----------
    function supa() { return window.supa; }
    function cloudOn() { return !!(supa() && supa().enabled && supa().isAuthed()); }
    function toast(msg, isErr) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isErr);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function getSettings() {
        try { return JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}; } catch (e) { return {}; }
    }
    function saveSettings(patch) {
        var next = Object.assign({}, getSettings(), patch);
        Object.keys(next).forEach(function (k) { if (next[k] == null) delete next[k]; });
        try { localStorage.setItem(LS_SETTINGS, JSON.stringify(next)); } catch (e) {}
    }
    function plural(n, one, few, many) {
        var m = Math.abs(n) % 100, d = m % 10;
        if (m > 10 && m < 20) return many;
        if (d > 1 && d < 5) return few;
        if (d === 1) return one;
        return many;
    }
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtAgo(iso) {
        if (!iso) return '';
        var t = new Date(iso), s = (Date.now() - t.getTime()) / 1000;
        if (s < 90) return 'только что';
        if (s < 3600) return Math.round(s / 60) + ' мин назад';
        if (s < 86400) return Math.round(s / 3600) + ' ч назад';
        if (s < 172800) return 'вчера';
        return pad2(t.getDate()) + '.' + pad2(t.getMonth() + 1) + '.' + t.getFullYear();
    }

    var IC = {
        bell: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
        gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        back: '<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
        info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        success: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.27"/></svg>',
        warn: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        monitor: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        plane: '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
        phone: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
        zzz: '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'
    };
    function kindIc(kind) { return IC[kind] || IC.info; }

    // ---------- локальные уведомления (терминал) ----------
    function loadLocal() {
        var o;
        try { o = JSON.parse(localStorage.getItem(LS_LOCAL) || 'null'); } catch (e) { return; }
        if (!Array.isArray(o)) return;
        NF.local = o.filter(function (n) {
            return n && typeof n === 'object' && n.id && n.title;
        }).slice(0, LOCAL_MAX).map(function (n) {
            return { id: String(n.id), kind: n.kind === 'success' || n.kind === 'warn' ? n.kind : 'info',
                     title: String(n.title).slice(0, 140), body: String(n.body || '').slice(0, 240),
                     created_at: n.created_at, read: !!n.read, local: true };
        });
    }
    function saveLocal() {
        try { localStorage.setItem(LS_LOCAL, JSON.stringify(NF.local.slice(0, LOCAL_MAX))); } catch (e) {}
    }
    var localSeq = 0;
    function addLocal(kind, title, body) {
        NF.local.unshift({
            id: 'loc-' + Date.now() + '-' + (++localSeq),
            kind: kind === 'success' || kind === 'warn' ? kind : 'info',
            title: String(title || '').slice(0, 140),
            body: String(body || '').slice(0, 240),
            created_at: new Date().toISOString(), read: false, local: true
        });
        NF.local = NF.local.slice(0, LOCAL_MAX);
        saveLocal();
        recount();
        syncBell();
        if (panel && panel.classList.contains('open') && NF.view === 'list') renderPanel();
    }
    // общий список панели: локальные и облачные вперемешку, новые сверху
    function allItems() {
        return NF.local.concat(NF.list).sort(function (a, b) {
            return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
        });
    }
    function isRead(n) { return n.local ? !!n.read : !!NF.read[n.id]; }
    function recount() {
        NF.unread = allItems().filter(function (n) { return !isRead(n); }).length;
    }

    // ---------- данные ----------
    function fetchData() {
        if (!cloudOn() || NF.loading) return Promise.resolve();
        NF.loading = true;
        var c = supa().client;
        var uid = supa().session.user.id;
        return Promise.all([
            c.from('notifications').select('*')
                .or('user_id.is.null,user_id.eq.' + uid)
                .order('created_at', { ascending: false }).limit(50),
            c.from('notification_reads').select('notification_id')
        ]).then(function (res) {
            NF.loading = false;
            // таблиц ещё нет (schema.sql не выполнен) или сеть — молчим, звоночек просто пуст
            if (res[0].error || res[1].error) return;
            NF.list = res[0].data || [];
            NF.read = {};
            (res[1].data || []).forEach(function (r) { NF.read[r.notification_id] = true; });
            // локальные отметки, которые сервер ещё не вернул, не теряем;
            // подтверждённые — вычёркиваем из ожидания
            Object.keys(NF.pending).forEach(function (id) {
                if (NF.read[id]) delete NF.pending[id];
                else NF.read[id] = true;
            });
            recount();
            NF.loaded = true;
            syncBell();
            maybeBrowserNotify();
            if (panel && panel.classList.contains('open') && NF.view === 'list') renderPanel();
        }, function () { NF.loading = false; });
    }

    // Открытие панели = «всё прочитано»: пишем отметки на сервер (крест-девайсно),
    // локально гасим бейдж сразу — при ошибке сети он просто вернётся с поллингом.
    function markAllRead() {
        // локальные читаются локально же — облако о них не знает
        var dirty = false;
        NF.local.forEach(function (n) { if (!n.read) { n.read = true; dirty = true; } });
        if (dirty) saveLocal();
        NF.unread = 0;
        syncBell();
        if (!cloudOn()) return;
        var ids = NF.list.filter(function (n) { return !NF.read[n.id]; }).map(function (n) { return n.id; });
        if (!ids.length) return;
        var uid = supa().session.user.id;
        supa().client.from('notification_reads')
            .upsert(ids.map(function (id) { return { user_id: uid, notification_id: id }; }),
                { onConflict: 'user_id,notification_id', ignoreDuplicates: true })
            .then(function () {}, function () {});
        ids.forEach(function (id) { NF.read[id] = true; NF.pending[id] = true; });
    }

    // Браузерное уведомление о свежепришедших — только когда вкладка в фоне
    // (на глазах хватает бейджа). Первая загрузка помечает историю «виденной»,
    // чтобы не выстрелить очередью старых оповещений.
    function maybeBrowserNotify() {
        var last = 0;
        try { last = +localStorage.getItem(LS_LAST) || 0; } catch (e) {}
        var maxTs = 0;
        NF.list.forEach(function (n) {
            var t = Date.parse(n.created_at) || 0;
            if (t > maxTs) maxTs = t;
        });
        if (maxTs > last) { try { localStorage.setItem(LS_LAST, String(maxTs)); } catch (e) {} }
        if (!last) return;
        if (!getSettings().notifyBrowser) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (!document.hidden) return;
        NF.list.filter(function (n) {
            return (Date.parse(n.created_at) || 0) > last && !NF.read[n.id];
        }).slice(0, 3).forEach(function (n) {
            try {
                new Notification(n.title || "Madame Solomi'na", {
                    body: String(n.body || '').slice(0, 140),
                    tag: 'msnf-' + n.id
                });
            } catch (e) {}
        });
    }

    // ---------- кнопка-звоночек ----------
    function buildBell(anchor) {
        bell = document.createElement('div');
        bell.id = 'nfBell';
        bell.title = 'Уведомления';
        bell.setAttribute('role', 'button');
        bell.setAttribute('tabindex', '0');
        bell.setAttribute('aria-haspopup', 'dialog');
        bell.setAttribute('aria-expanded', 'false');
        bell.innerHTML = IC.bell;
        anchor.parentNode.insertBefore(bell, anchor);
    }

    function syncBell() {
        if (!bell) return;
        var on = cloudOn();
        bell.classList.toggle('on', on);
        if (!on) { closePanel(); return; }
        var b = bell.querySelector('.nf-badge');
        if (NF.unread > 0) {
            if (!b) {
                b = document.createElement('span');
                b.className = 'nf-badge';
                b.setAttribute('aria-hidden', 'true');
                bell.appendChild(b);
            }
            b.textContent = NF.unread > 9 ? '9+' : String(NF.unread);
            bell.title = 'Уведомления: ' + NF.unread + ' ' + plural(NF.unread, 'новое', 'новых', 'новых');
        } else {
            if (b) b.remove();
            bell.title = 'Уведомления';
        }
    }

    // ---------- панель ----------
    function buildPanel() {
        panel = document.createElement('div');
        panel.id = 'nfPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Уведомления');
        document.body.appendChild(panel);
    }

    function openPanel() {
        if (!panel || panel.classList.contains('open')) return;
        NF.view = 'list';
        // снимок непрочитанных — подсветка «новых» живёт, пока панель открыта
        NF.snap = {};
        NF.snapCount = 0;
        allItems().forEach(function (n) {
            if (!isRead(n)) { NF.snap[n.id] = true; NF.snapCount++; }
        });
        renderPanel();
        panel.classList.add('open');
        bell.setAttribute('aria-expanded', 'true');
        markAllRead();
        if (cloudOn() && !NF.loading) fetchData();   // заодно освежаем список
    }
    function closePanel() {
        if (!panel || !panel.classList.contains('open')) return;
        panel.classList.remove('open');
        if (bell) bell.setAttribute('aria-expanded', 'false');
    }
    function togglePanel() {
        if (panel && panel.classList.contains('open')) closePanel(); else openPanel();
    }

    function renderPanel() {
        if (!panel) return;
        if (NF.view === 'prefs') { renderPrefs(); return; }

        var h = '<div class="nf-head">' +
            '<span class="nf-head-t">Уведомления</span>' +
            (NF.snapCount > 0 ? '<span class="nf-head-n">' + NF.snapCount + ' ' + plural(NF.snapCount, 'новое', 'новых', 'новых') + '</span>' : '') +
            '<button class="nf-hbtn" type="button" data-nf="prefs" title="Настроить доставку уведомлений" aria-label="Настройки уведомлений">' + IC.gear + '</button>' +
        '</div>';

        var items = allItems();
        if (!items.length && !NF.loaded && NF.loading) {
            h += '<div class="nf-empty"><div class="nf-empty-s">Загружаем…</div></div>';
        } else if (!items.length) {
            h += '<div class="nf-empty">' +
                '<div class="nf-empty-ic">' + IC.zzz + '</div>' +
                '<div class="nf-empty-t">Пока тихо</div>' +
                '<div class="nf-empty-s">Здесь будут появляться сообщения от сервиса — о новых возможностях и важных событиях.</div>' +
            '</div>';
        } else {
            h += '<div class="nf-list">' + items.map(function (n) {
                var kind = (n.kind === 'success' || n.kind === 'warn') ? n.kind : 'info';
                var fresh = !!NF.snap[n.id];
                return '<div class="nf-item' + (fresh ? ' new' : '') + '">' +
                    '<span class="nf-ic ' + kind + '">' + kindIc(kind) + '</span>' +
                    '<span class="nf-item-m">' +
                        '<span class="nf-item-t">' + esc(n.title) + (fresh ? '<i class="nf-dot"></i>' : '') + '</span>' +
                        (n.body ? '<span class="nf-item-b">' + esc(n.body) + '</span>' : '') +
                        '<span class="nf-item-d">' + fmtAgo(n.created_at) +
                            (n.local ? ' · терминал' : n.user_id ? ' · лично вам' : '') + '</span>' +
                    '</span>' +
                '</div>';
            }).join('') + '</div>';
        }
        panel.innerHTML = h;
    }

    // ---------- настройки доставки ----------
    function renderPrefs() {
        var s = getSettings();
        var browserOn = !!s.notifyBrowser && ('Notification' in window) && Notification.permission === 'granted';
        var pr = supa() && supa().profile;
        var tgLinked = !!(pr && pr.telegram_id);
        var tgOn = !!(pr && pr.notify_telegram);

        var h = '<div class="nf-head">' +
            '<button class="nf-hbtn" type="button" data-nf="back" title="К уведомлениям" aria-label="Назад">' + IC.back + '</button>' +
            '<span class="nf-head-t">Доставка уведомлений</span>' +
        '</div>' +
        '<div class="nf-prefs">' +

            '<div class="ph-set">' +
                '<span class="nf-set-ic">' + IC.monitor + '</span>' +
                '<span class="ph-set-tt"><span class="ph-set-t">В браузере</span>' +
                    '<span class="ph-set-s">Системное уведомление, когда вкладка в фоне</span></span>' +
                '<button class="ph-sw' + (browserOn ? ' on' : '') + '" type="button" data-nf="sw-browser" role="switch" aria-checked="' + (browserOn ? 'true' : 'false') + '" aria-label="Уведомления в браузере"></button>' +
            '</div>' +

            '<div class="ph-set' + (tgLinked ? '' : ' nf-set-off') + '">' +
                '<span class="nf-set-ic">' + IC.plane + '</span>' +
                '<span class="ph-set-tt"><span class="ph-set-t">В Telegram</span>' +
                    '<span class="ph-set-s">' + (tgLinked
                        ? 'Сообщение от бота — придёт и на телефон'
                        : 'Сначала привяжите Telegram: аватар → Профиль') + '</span></span>' +
                '<button class="ph-sw' + (tgOn ? ' on' : '') + '" type="button" data-nf="sw-tg" role="switch" aria-checked="' + (tgOn ? 'true' : 'false') + '"' + (tgLinked ? '' : ' disabled') + ' aria-label="Уведомления в Telegram"></button>' +
            '</div>' +

            // Telegram доставляет сообщения только тем, кто сам открыл бота (нажал Start):
            // без этого sendMessage бота отдаёт 403 — подсказываем зайти в бота ссылкой
            (tgLinked ? '<div class="nf-tg-hint">' +
                '<span class="nf-tg-hint-t">Бот может писать только тем, кто открыл его хоть раз. Зайдите в бота и нажмите <b>Start</b> — иначе сообщения не дойдут.</span>' +
                '<a class="nf-tg-btn" href="https://t.me/' + (window.TELEGRAM_BOT_USERNAME || 'MadameSolominabot') + '" target="_blank" rel="noopener">' + IC.plane + '<span>Открыть бота</span></a>' +
            '</div>' : '') +

            '<div class="ph-set nf-set-off">' +
                '<span class="nf-set-ic">' + IC.phone + '</span>' +
                '<span class="ph-set-tt"><span class="ph-set-t">Push на телефон <span class="ph-soon">скоро</span></span>' +
                    '<span class="ph-set-s">Появится вместе с мобильным приложением</span></span>' +
                '<button class="ph-sw" type="button" disabled aria-label="Push на телефон — скоро"></button>' +
            '</div>' +

            '<div class="nf-prefs-hint">На сайте уведомления показываются всегда — эти переключатели добавляют каналы доставки.</div>' +
        '</div>';
        panel.innerHTML = h;
    }

    function setBrowserPref(sw) {
        var turnOn = !sw.classList.contains('on');
        if (!turnOn) {
            saveSettings({ notifyBrowser: false });
            toast('Уведомления в браузере выключены');
            renderPrefs();
            return;
        }
        if (!('Notification' in window)) {
            toast('Этот браузер не поддерживает уведомления', true);
            return;
        }
        Notification.requestPermission().then(function (perm) {
            if (perm === 'granted') {
                saveSettings({ notifyBrowser: true });
                toast('Уведомления в браузере включены');
                // пробное — сразу видно, как будет выглядеть
                try {
                    new Notification("Madame Solomi'na", { body: 'Уведомления подключены — так будет выглядеть оповещение.' });
                } catch (e) {}
            } else {
                saveSettings({ notifyBrowser: false });
                toast('Браузер не дал разрешение — проверьте настройки уведомлений для сайта', true);
            }
            renderPrefs();
        });
    }

    function setTelegramPref(sw) {
        if (!cloudOn()) return;
        var pr = supa().profile;
        if (!pr || !pr.telegram_id) return;
        var next = !sw.classList.contains('on');
        supa().client.from('profiles')
            .update({ notify_telegram: next })
            .eq('id', supa().session.user.id)
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                pr.notify_telegram = next;   // локальная копия профиля — чтобы не перечитывать
                toast(next ? 'Уведомления в Telegram включены — проверьте, что бот открыт (Start)' : 'Уведомления в Telegram выключены');
                renderPrefs();
            });
    }

    // ---------- поллинг ----------
    function startPoll() {
        if (pollT) return;
        pollT = setInterval(function () {
            if (!cloudOn()) return;
            fetchData();
        }, POLL_MS);
    }
    function stopPoll() {
        if (pollT) { clearInterval(pollT); pollT = null; }
    }

    // ---------- события ----------
    function wire() {
        bell.addEventListener('click', togglePanel);
        bell.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                togglePanel();
            }
        });
        panel.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-nf]') : null;
            if (!b) return;
            var act = b.getAttribute('data-nf');
            if (act === 'prefs') { NF.view = 'prefs'; renderPanel(); }
            else if (act === 'back') { NF.view = 'list'; renderPanel(); }
            else if (act === 'sw-browser') setBrowserPref(b);
            else if (act === 'sw-tg') setTelegramPref(b);
        });
        document.addEventListener('pointerdown', function (e) {
            if (!panel.classList.contains('open')) return;
            if (panel.contains(e.target) || bell.contains(e.target)) return;
            closePanel();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closePanel();
        });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && cloudOn()) fetchData();
        });
    }

    // ---------- init ----------
    function init() {
        var anchor = document.getElementById('topProfileBtn');
        if (!anchor || !anchor.parentNode) return;
        buildBell(anchor);
        buildPanel();
        wire();

        if (supa()) {
            supa().onChange(function (kind) {
                if (kind === 'init' || kind === 'signin' || kind === 'profile') {
                    syncBell();
                    if (cloudOn()) {
                        if (!NF.loaded && !NF.loading) fetchData();
                        startPoll();
                    }
                } else if (kind === 'signout') {
                    // локальные (события устройства) переживают выход из облака
                    NF.list = []; NF.read = {}; NF.pending = {}; NF.loaded = false;
                    recount();
                    stopPoll();
                    syncBell();
                }
            });
        }
        syncBell();
        if (cloudOn()) { fetchData(); startPoll(); }
    }

    // Панель закрывается при смене вкладки — как #profileHub
    var _prevSwitchTab = window.switchTab;
    if (typeof _prevSwitchTab === 'function') {
        window.switchTab = function (tabId) {
            _prevSwitchTab(tabId);
            closePanel();
        };
    }

    loadLocal();
    recount();
    // local(kind, title, body) — событие терминала в звоночек, минуя облако
    window.msNotify = { refresh: fetchData, open: openPanel, local: addLocal };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
