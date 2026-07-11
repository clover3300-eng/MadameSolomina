// =============================================
// ЗАГЛУШКИ ВКЛАДОК И СИСТЕМНЫЕ СООБЩЕНИЯ
// =============================================
// Конфиг живёт в Supabase (app_config, ключ 'tab_gates', пишет админ из
// раздела «Вкладки»), читают все — включая гостей. Форматы:
//   { tabs: { calc: { off: true }, market: { msg: '…', msgKind: 'warn' } } }
//   off — вкладка закрыта заглушкой «раздел в разработке»;
//   msg — баннер-сообщение поверх вкладки (не блокирует работу).
//
// Заглушка — тёмная сцена В ДУХЕ Главной (градиент + мозаика плиток +
// крупная типографика), рендерится ВНУТРИ панели вкладки (.gx-cover,
// прямые дети панели прячутся классом .tab-gated — никаких fixed,
// см. паттерн «fixed ловится transform» у stockDetailCard):
//   · авторизованный видит обращение по имени и карточку «сообщим,
//     когда будет готово» с выбором канала (сайт / браузер / Telegram —
//     подписка в feature_waitlist; выбор telegram включает
//     profiles.notify_telegram, browser — разрешение Notification);
//   · гость видит просто заглушку с кнопкой «На Главную».
//
// Кэш конфига — localStorage tab_gates_cache_v1 (ВНЕ cloud-sync.WATCH):
// заглушка встаёт мгновенно при загрузке, сеть лишь освежает.
// Без Supabase модуль спит (в демо-режиме заглушек нет).
// Грузится после notifications.js, до route-hash.js.

(function () {
    'use strict';

    var LS_CACHE = 'tab_gates_cache_v1';
    var REFRESH_MS = 90000;              // перечитываем конфиг не чаще
    var CFG_KEY = 'tab_gates';

    // Вкладки, которым доступны заглушка и баннер (Главная и Админка — никогда)
    var TABS = {
        calc:            'Расчёт',
        portfolio:       'Портфель',
        portfolios:      'Портфели',
        rebalance:       'Ребаланс',
        market:          'Рынок',
        'market-stocks': 'Терминал',
        backtest:        'Тест портфеля'
    };

    var gates = {};          // tab -> { off, msg, msgKind }
    var fetchedAt = 0;
    var fetching = false;
    var myWaitlist = null;   // tab -> channel (подписки текущего пользователя), null = не грузили

    function supa() { return window.supa; }
    function cloudOn() { return !!(supa() && supa().enabled); }
    function authed() { return !!(supa() && supa().enabled && supa().isAuthed()); }
    function toast(msg, isErr) {
        if (typeof window.showDashToast === 'function') window.showDashToast(msg, isErr);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function firstName() {
        var pr = supa() && supa().profile;
        var n = (pr && pr.name || '').trim();
        return n ? n.split(/\s+/)[0] : '';
    }

    // ---------- конфиг ----------
    function readCache() {
        try {
            var c = JSON.parse(localStorage.getItem(LS_CACHE) || 'null');
            return (c && c.tabs) ? c.tabs : {};
        } catch (e) { return {}; }
    }
    function writeCache(tabs) {
        try { localStorage.setItem(LS_CACHE, JSON.stringify({ tabs: tabs, at: Date.now() })); } catch (e) {}
    }

    function fetchConfig(force) {
        if (!cloudOn() || fetching) return Promise.resolve();
        if (!force && Date.now() - fetchedAt < REFRESH_MS) return Promise.resolve();
        fetching = true;
        return supa().client.from('app_config').select('value').eq('key', CFG_KEY).limit(1)
            .then(function (res) {
                fetching = false;
                if (res.error) return;
                fetchedAt = Date.now();
                var v = (res.data && res.data[0] && res.data[0].value) || {};
                gates = v.tabs || {};
                writeCache(gates);
                applyAll();
            }, function () { fetching = false; });
    }

    function fetchMyWaitlist() {
        if (!authed()) { myWaitlist = {}; return Promise.resolve(); }
        return supa().client.from('feature_waitlist').select('tab,channel')
            .then(function (res) {
                myWaitlist = {};
                if (!res.error) (res.data || []).forEach(function (r) { myWaitlist[r.tab] = r.channel; });
            }, function () { myWaitlist = {}; });
    }

    // Мгновенное применение свежесохранённого конфига (зовёт админка)
    window.tabGates = {
        refresh: function () { fetchedAt = 0; return fetchConfig(true); },
        get: function () { return gates; },
        TABS: TABS
    };

    // ---------- применение ----------
    function panelOf(tab) { return document.getElementById('panel-' + tab); }

    function applyAll() {
        Object.keys(TABS).forEach(function (tab) { applyTab(tab); });
    }

    function applyTab(tab) {
        var panel = panelOf(tab);
        if (!panel) return;
        var g = gates[tab] || {};

        // --- заглушка ---
        var covered = !!g.off;
        panel.classList.toggle('tab-gated', covered);
        var cover = panel.querySelector('.gx-cover');
        if (covered) {
            if (!cover) {
                cover = document.createElement('div');
                cover.className = 'gx-cover';
                panel.insertBefore(cover, panel.firstChild);
            }
            renderCover(cover, tab);
        } else if (cover) {
            cover.remove();
        }

        // --- системный баннер (при заглушке не нужен — панель и так закрыта) ---
        var msg = (!covered && g.msg) ? String(g.msg) : '';
        var banner = panel.querySelector('.gx-banner');
        if (msg) {
            if (!banner) {
                banner = document.createElement('div');
                banner.setAttribute('role', 'status');
                panel.insertBefore(banner, panel.firstChild);
            }
            banner.className = 'gx-banner ' + (g.msgKind === 'warn' ? 'warn' : 'info');
            banner.innerHTML =
                '<svg viewBox="0 0 24 24">' + (g.msgKind === 'warn'
                    ? '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
                    : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>') + '</svg>' +
                '<span>' + esc(msg) + '</span>';
        } else if (banner) {
            banner.remove();
        }
    }

    // ---------- сцена-заглушка ----------
    // Мозаика как на Главной, но статичная: сетка плиток с псевдослучайной
    // (сеяной — без мигания при перерисовках) интенсивностью.
    function tilesHtml(tab) {
        var html = '';
        var seed = 0;
        for (var i = 0; i < tab.length; i++) seed = (seed * 31 + tab.charCodeAt(i)) & 0xffff;
        function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
        for (var k = 0; k < 24; k++) {
            var kind = rnd() < 0.55 ? 'up' : (rnd() < 0.5 ? 'dn' : 'flat');
            html += '<i class="' + kind + '" style="--k:' + (0.25 + rnd() * 0.75).toFixed(2) + '"></i>';
        }
        return '<div class="gx-tiles" aria-hidden="true">' + html + '</div>';
    }

    function renderCover(cover, tab) {
        var isAuthed = authed();
        var name = firstName();
        var tabName = TABS[tab] || tab;
        var sub = myWaitlist && myWaitlist[tab];

        var head =
            '<div class="gx-brand"><span class="gx-brand-n"><span style="font-weight:300;">Madame </span><span style="font-weight:800;">Solomi\'na</span></span><span class="gx-brand-s">Terminal</span></div>' +
            '<div class="gx-badge">Раздел в разработке</div>' +
            '<h2 class="gx-title">' + (isAuthed && name ? esc(name) + ', раздел<br>«' + esc(tabName) + '» в мастерской' : 'Раздел «' + esc(tabName) + '»<br>скоро откроется') + '</h2>' +
            '<p class="gx-lead">' + (isAuthed
                ? 'Мы дорабатываем его до привычного уровня. Подпишитесь — и мы сообщим, как только всё будет готово.'
                : 'Мы дорабатываем его до привычного уровня. Загляните чуть позже — или войдите, чтобы подписаться на новость о запуске.') + '</p>';

        var card;
        if (!isAuthed) {
            card =
                '<div class="gx-card">' +
                    '<div class="gx-card-t">Не пропустить запуск</div>' +
                    '<div class="gx-card-s">Создайте аккаунт или войдите — под заглушкой появится подписка на оповещение о готовности раздела.</div>' +
                    '<button class="gx-btn primary" type="button" data-gx="go-home">Войти на Главной</button>' +
                '</div>';
        } else if (sub) {
            card =
                '<div class="gx-card">' +
                    '<div class="gx-card-ok"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.27"/></svg></div>' +
                    '<div class="gx-card-t">Вы в списке</div>' +
                    '<div class="gx-card-s">Как только раздел откроется, пришлём оповещение' + (sub === 'telegram' ? ' — и продублируем в Telegram' : (sub === 'browser' ? ' — и покажем в браузере' : ' под звоночек в шапке')) + '.</div>' +
                    '<div class="gx-row">' +
                        '<button class="gx-btn primary" type="button" data-gx="go-home">Вернуться в кабинет</button>' +
                        '<button class="gx-btn ghost" type="button" data-gx="unsub" data-tab="' + tab + '">Отписаться</button>' +
                    '</div>' +
                '</div>';
        } else {
            var pr = supa().profile || {};
            var tgOk = !!pr.telegram_id;
            var chans =
                chanBtn('site', 'Под звоночком', 'Оповещение на сайте — рядом с аватаром', true, true) +
                chanBtn('browser', 'В браузере', ('Notification' in window) ? 'Системное уведомление на этом устройстве' : 'Браузер не поддерживает уведомления', ('Notification' in window), false) +
                chanBtn('telegram', 'В Telegram', tgOk ? 'Сообщение от бота — придёт и на телефон' : 'Сначала привяжите Telegram: аватар → Профиль', tgOk, false);
            card =
                '<div class="gx-card">' +
                    '<div class="gx-card-t">Сообщим о готовности</div>' +
                    '<div class="gx-card-s">Выберите, как удобнее получить новость о запуске раздела.</div>' +
                    '<div class="gx-chans" data-tab="' + tab + '">' + chans + '</div>' +
                    '<div class="gx-row">' +
                        '<button class="gx-btn primary" type="button" data-gx="sub" data-tab="' + tab + '">Подписаться</button>' +
                        '<button class="gx-btn ghost" type="button" data-gx="go-home">Вернуться в кабинет</button>' +
                    '</div>' +
                '</div>';
        }

        cover.innerHTML = tilesHtml(tab) + '<div class="gx-glow" aria-hidden="true"></div>' +
            '<div class="gx-in">' + head + card + '</div>';
    }

    function chanBtn(id, t, s, enabled, active) {
        return '<button type="button" class="gx-chan' + (active ? ' on' : '') + '" data-chan="' + id + '"' + (enabled ? '' : ' disabled') + '>' +
            '<b>' + t + '</b><span>' + s + '</span></button>';
    }

    // ---------- подписка ----------
    function subscribe(tab, channel) {
        if (!authed()) return;
        var uid = supa().session.user.id;
        supa().client.from('feature_waitlist')
            .upsert({ user_id: uid, tab: tab, channel: channel }, { onConflict: 'user_id,tab' })
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                myWaitlist = myWaitlist || {};
                myWaitlist[tab] = channel;

                // выбранный канал включаем по-настоящему — иначе доставка не дойдёт
                if (channel === 'telegram') {
                    supa().client.from('profiles').update({ notify_telegram: true })
                        .eq('id', uid).then(function () {
                            if (supa().profile) supa().profile.notify_telegram = true;
                        }, function () {});
                } else if (channel === 'browser' && ('Notification' in window) && Notification.permission !== 'granted') {
                    Notification.requestPermission().then(function (perm) {
                        if (perm === 'granted') {
                            try {
                                var s = JSON.parse(localStorage.getItem('profile_settings_v1') || '{}');
                                s.notifyBrowser = true;
                                localStorage.setItem('profile_settings_v1', JSON.stringify(s));
                            } catch (e) {}
                        }
                    });
                }
                toast('Подписка оформлена — сообщим, когда раздел откроется');
                applyTab(tab);
            });
    }

    function unsubscribe(tab) {
        if (!authed()) return;
        supa().client.from('feature_waitlist').delete()
            .eq('user_id', supa().session.user.id).eq('tab', tab)
            .then(function (res) {
                if (res.error) { toast(supa().errRu(res.error), true); return; }
                if (myWaitlist) delete myWaitlist[tab];
                toast('Подписка снята');
                applyTab(tab);
            });
    }

    // ---------- события ----------
    document.addEventListener('click', function (e) {
        var chan = e.target.closest ? e.target.closest('.gx-chan') : null;
        if (chan && !chan.disabled) {
            var box = chan.closest('.gx-chans');
            box.querySelectorAll('.gx-chan').forEach(function (b) { b.classList.remove('on'); });
            chan.classList.add('on');
            return;
        }
        var btn = e.target.closest ? e.target.closest('[data-gx]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-gx');
        if (act === 'go-home') {
            if (typeof window.switchTab === 'function') window.switchTab('home');
        } else if (act === 'sub') {
            var tab = btn.getAttribute('data-tab');
            var picked = document.querySelector('.gx-chans[data-tab="' + tab + '"] .gx-chan.on');
            subscribe(tab, picked ? picked.getAttribute('data-chan') : 'site');
        } else if (act === 'unsub') {
            unsubscribe(btn.getAttribute('data-tab'));
        }
    });

    // ---------- init ----------
    function init() {
        gates = readCache();       // мгновенно, до сети
        applyAll();
        if (!cloudOn()) return;    // демо-режим — заглушек нет
        fetchMyWaitlist().then(function () { applyAll(); });
        fetchConfig(true);

        if (supa()) {
            supa().onChange(function (kind) {
                if (kind === 'init' || kind === 'signin' || kind === 'signout' || kind === 'profile') {
                    fetchMyWaitlist().then(function () { applyAll(); });
                }
            });
        }
    }

    // Переключение вкладки: перепроверяем конфиг (мягко, с троттлингом)
    var _prevSwitchTab = window.switchTab;
    if (typeof _prevSwitchTab === 'function') {
        window.switchTab = function (tabId) {
            _prevSwitchTab(tabId);
            if (TABS[tabId]) {
                applyTab(tabId);
                fetchConfig(false);
            }
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
