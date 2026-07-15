/* ============================================
   Smoke-набор «Портфелей» — dev-инструмент, в index.html НЕ подключён.

   Запуск: открыть сайт, в консоли —
     var s = document.createElement('script'); s.src = 'js/dev-smoke.js?ts=' + Date.now(); document.head.appendChild(s);

   Что делает: снимает бэкап затрагиваемых localStorage-ключей, гоняет ~12
   проверок ПУБЛИЧНОГО API вкладки «Портфели» (создание → своя вкладка,
   скрытие → вкладка живёт, undo-тосты, deep-link-путь, DnD чипов), затем
   восстанавливает данные и перезагружает страницу (замусоренное тестами
   состояние в памяти умирает вместе с ней). Отчёт: console.table по ходу +
   localStorage['__smoke_last'] (переживает перезагрузку).

   Гварды: НЕ запускается под облачной сессией Supabase (мутации утекли бы в
   cloud-sync) и при 7+ портфелях (нужно два свободных слота из MAX 8).
   ============================================ */
(function () {
    'use strict';
    var TAG = '[smoke]';

    if (Object.keys(localStorage).some(function (k) { return /^sb-.*-auth-token$/.test(k); })) {
        console.warn(TAG, 'Облачная сессия активна — прогон отменён: тестовые мутации зеркалились бы в Supabase.');
        return;
    }
    if (typeof window.ensurePortfoliosJs !== 'function' || typeof window.switchTab !== 'function') {
        console.warn(TAG, 'Приложение не загружено (нет ensurePortfoliosJs/switchTab).');
        return;
    }
    var itemsNow = [];
    try { itemsNow = (JSON.parse(localStorage.getItem('portfolios_v1')) || {}).items || []; } catch (e) {}
    if (itemsNow.length >= 7) {
        console.warn(TAG, 'Портфелей уже ' + itemsNow.length + ' — нужно 2 свободных слота из 8. Прогон отменён.');
        return;
    }
    if (!window.matchMedia('(min-width: 1024px)').matches) {
        console.warn(TAG, 'Узкий экран: вкладок-чипов на мобильном нет — прогон только на десктопе.');
        return;
    }

    var KEYS = ['portfolios_v1', 'pf_open_tabs_v1', 'pf_subtab_v1', 'pf_dash_v1',
        'pf_dash_tabs_v1', 'pf_trades_v1', 'pf_snapshots_v1', 'pf_widget_fab_v1'];
    var snap = {};
    KEYS.forEach(function (k) { snap[k] = localStorage.getItem(k); });
    function restore() {
        KEYS.forEach(function (k) {
            if (snap[k] == null) localStorage.removeItem(k);
            else localStorage.setItem(k, snap[k]);
        });
    }

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function items() { try { return (JSON.parse(localStorage.getItem('portfolios_v1')) || {}).items || []; } catch (e) { return []; } }
    function chipEls() { return document.querySelectorAll('#pfWrap .pfx-tab-pf'); }
    function chipPids() { return Array.prototype.map.call(chipEls(), function (c) { return c.getAttribute('data-pid'); }); }

    var results = [];
    function ok(name, cond, note) {
        results.push({ проверка: name, итог: cond ? 'PASS' : 'FAIL', детали: note || '' });
        (cond ? console.log : console.error)(TAG, (cond ? 'PASS' : 'FAIL'), name, note || '');
    }

    async function run() {
        window.switchTab('portfolios');
        await sleep(150);

        // --- единый тост ---
        ok('msToast существует', typeof window.msToast === 'function');
        window.msToast('smoke: проверка тоста');
        var t = document.getElementById('pfToast');
        ok('тост объявляется скринридеру (role/aria-live)',
            !!t && t.getAttribute('role') === 'status' && t.getAttribute('aria-live') === 'polite');

        // --- создание: второй портфель уходит на СВОЮ вкладку со шторкой ---
        window.pfAddPortfolio(); await sleep(200);
        var idA = (items()[0] || {}).id;
        window.pfAddPortfolio(); await sleep(200);
        var idB = (items()[0] || {}).id;
        ok('создание: два тестовых портфеля', !!idA && !!idB && idA !== idB);
        ok('создание при 2+ видимых: активна вкладка нового',
            localStorage.getItem('pf_subtab_v1') === 'pf:' + idB,
            'subtab=' + localStorage.getItem('pf_subtab_v1'));
        ok('создание: чип нового в ряду', chipPids().indexOf(idB) >= 0);
        var drawer = document.getElementById('pfSetDrawer');
        ok('создание: настройки открыты шторкой', !!drawer && drawer.classList.contains('open'));
        window.pfCloseMenu(); await sleep(120);

        // --- deep-link: запись и применение (подвкладка живёт в ХЭШЕ) ---
        function urlNow() { return location.pathname + location.hash; }
        window.pfxGoTab('analytics'); await sleep(120);
        ok('deep-link: переключение пишет адрес', urlNow() === '/portfolios#analytics',
            'url=' + urlNow());
        window.pfxApplySubPath('divs'); await sleep(120);
        ok('deep-link: применение из адреса', localStorage.getItem('pf_subtab_v1') === 'divs' &&
            urlNow() === '/portfolios#divs', 'url=' + urlNow());
        window.pfxGoTab('pf:' + idB); await sleep(120);
        ok('deep-link: вкладка-портфель в адресе', window.pfxSubPath() === '#pf-' + idB &&
            urlNow() === '/portfolios#pf-' + idB);

        // --- скрытие: вкладка живёт, тост с «Вернуть» ---
        window.pfToggleHidden(idB); await sleep(350);   // renderSmooth асинхронный (View Transitions)
        var hidChip = document.querySelector('#pfWrap .pfx-tab-pf.hid[data-pid="' + idB + '"]');
        ok('скрытие: чип скрытого остался (приглушён)', !!hidChip);
        ok('скрытие: у чипа мини-глазок', !!(hidChip && hidChip.querySelector('.pfx-tab-eyeoff')));
        ok('скрытие: в «Видимости» кнопка «открыть вкладку»', !!document.querySelector('.pf-eyego'));
        var undo = document.querySelector('#pfToast .pf-toast-act');
        ok('скрытие: тост с кнопкой «Вернуть»', !!undo);
        if (undo) { undo.click(); await sleep(350); }
        ok('скрытие: «Вернуть» вернул портфель',
            !(items().filter(function (p) { return p.id === idB; })[0] || {}).hidden);

        // --- закрытие чипа: undo восстанавливает место и активность ---
        var beforeIdx = chipPids().indexOf(idB);
        window.pfxClosePfTab(idB); await sleep(150);
        ok('чип: закрылся', chipPids().indexOf(idB) < 0);
        var undo2 = document.querySelector('#pfToast .pf-toast-act');
        ok('чип: тост с «Вернуть»', !!undo2);
        if (undo2) { undo2.click(); await sleep(150); }
        ok('чип: вернулся на прежнее место и активен',
            chipPids().indexOf(idB) === beforeIdx &&
            localStorage.getItem('pf_subtab_v1') === 'pf:' + idB);

        // --- DnD: каретка на dragover, порядок сохраняется ---
        var order0 = chipPids().join(',');
        var row = document.querySelector('#pfWrap .pfx-tabs');
        var chips = chipEls();
        if (row && chips.length >= 2) {
            var target = chips[chips.length - 1].getBoundingClientRect();
            chips[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
            row.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: target.right + 5 }));
            ok('DnD: каретка вставки видна', !!row.querySelector('.pfx-drop-before, .pfx-drop-after'));
            row.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: target.right + 5 }));
            await sleep(150);
            var domOrder = chipPids(), stored = [];
            try { stored = JSON.parse(localStorage.getItem('pf_open_tabs_v1')) || []; } catch (e) {}
            ok('DnD: порядок чипов изменился и сохранился',
                domOrder.join(',') !== order0 && stored.join(',') === domOrder.join(','),
                'до=' + order0 + ' после=' + domOrder.join(','));
        } else ok('DnD: два чипа для теста', false, 'чипов меньше двух');

        // --- переименование виджета ---
        window.pfxGoTab('ports'); await sleep(150);
        var plist = document.querySelector('#pfWrap .pf-plistblk');
        ok('виджет называется «Список портфелей»',
            !!plist && plist.textContent.indexOf('Список портфелей') >= 0);

        var pass = results.filter(function (r) { return r.итог === 'PASS'; }).length;
        console.table(results);
        console.log(TAG, pass + '/' + results.length + ' PASS');
        try { localStorage.setItem('__smoke_last', JSON.stringify({ at: new Date().toISOString(), pass: pass, total: results.length, results: results })); } catch (e) {}
        window.msToast('Smoke: ' + pass + '/' + results.length + ' — страница перезагрузится', pass !== results.length);
    }

    window.ensurePortfoliosJs(function () {
        run().catch(function (e) {
            console.error(TAG, 'прогон упал:', e);
            try { localStorage.setItem('__smoke_last', JSON.stringify({ at: new Date().toISOString(), error: String(e) })); } catch (e2) {}
        }).finally(function () {
            restore();   // данные пользователя — как до прогона
            // мусор тестового прогона живёт в памяти модуля — перезагрузка обязательна,
            // иначе следующий saveStore перезаписал бы восстановленные данные
            setTimeout(function () { location.reload(); }, 1600);
        });
    });
})();
