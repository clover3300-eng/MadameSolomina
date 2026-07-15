// =============================================
// СКРЫТИЕ СУММ — «прятать капитал от посторонних глаз»
// =============================================
// Тумблер «Скрывать суммы» в личном кабинете (profile_settings_v1.hideSums)
// включает body.sums-hidden. Модуль помечает классом .sum-mask все листовые
// элементы, чей текст — рублёвая сумма (число + ₽), а CSS их размывает.
//
// Почему MutationObserver, а не разовый проход: карточки постоянно
// перерисовываются (цены тикают, действия пользователя). Колбэк наблюдателя
// — микрозадача, выполняется ДО отрисовки кадра, поэтому свежие суммы
// получают .sum-mask раньше, чем браузер их покажет — мигания нет.
//
// Прячем только рубли (не проценты — это «суммы», а не доходности).
// Наведение курсора временно раскрывает конкретное значение (для владельца).
// Заголовки колонок вроде «Средняя цена, ₽» не трогаем — там нет цифры перед ₽.

(function () {
    'use strict';

    var LS_SETTINGS = 'profile_settings_v1';
    var CLS = 'sum-mask';
    // число (возможно со знаком и разделителями/пробелами) вплотную к ₽
    var MONEY = /[\d][\d\s.,  ]*\s*₽/;
    // области, которые не маскируем: шапка с рыночными лентами, список и футер кабинета
    // (там сам тумблер и никаких сумм), редактируемые поля (пользователь вводит свои же
    // суммы), а также вкладка «Рынок» (тепловая карта + терминалы Акции/Облигации) — там
    // ПУБЛИЧНЫЕ котировки Мосбиржи, а не капитал пользователя: размывать их бессмысленно.
    //   ВАЖНО: раньше здесь стоял весь '#profileHub'. С появлением KPI-полоски в шапке
    //   кабинета (.ph-strip, капитал из последнего снимка) это стало дырой в самом
    //   тумблере: «Скрывать суммы» включён, а капитал в кабинете открыт. Скипаем теперь
    //   только .ph-list/.ph-foot — герой шапки маскируется наравне со всем остальным.
    var SKIP_SEL = '#headerWrapper, #profileHub .ph-list, #profileHub .ph-foot, #topSearchModal, #panel-market, #panel-market-stocks, input, textarea, select, [contenteditable="true"]';

    var on = false;
    var observer = null;
    var rafPending = false;
    var pendingRoots = [];

    function readSetting() {
        try {
            var s = JSON.parse(localStorage.getItem(LS_SETTINGS)) || {};
            return !!s.hideSums;
        } catch (e) { return false; }
    }

    function isMoneyLeaf(el) {
        if (el.nodeType !== 1) return false;          // только элементы
        if (el.firstElementChild) return false;       // только листья (без вложенных тегов)
        var t = el.textContent;
        if (!t || t.length > 40) return false;        // длинный текст — не ценник
        return MONEY.test(t);
    }

    // помечаем листья-суммы внутри поддерева root
    function tag(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.closest && root.closest(SKIP_SEL)) return;
        if (isMoneyLeaf(root)) { root.classList.add(CLS); return; }
        var nodes = root.querySelectorAll('*:not(script):not(style)');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el.closest(SKIP_SEL)) continue;
            if (isMoneyLeaf(el)) el.classList.add(CLS);
        }
    }

    function tagPending() {
        rafPending = false;
        var roots = pendingRoots;
        pendingRoots = [];
        for (var i = 0; i < roots.length; i++) tag(roots[i]);
    }
    function queue(root) {
        pendingRoots.push(root);
        if (rafPending) return;
        rafPending = true;
        // микрозадача (Promise) — успеваем до отрисовки, но не блокируем поток
        Promise.resolve().then(tagPending);
    }

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(function (recs) {
            for (var i = 0; i < recs.length; i++) {
                var r = recs[i];
                if (r.type === 'characterData') {
                    var p = r.target.parentElement;
                    if (p) queue(p);
                } else {
                    for (var j = 0; j < r.addedNodes.length; j++) {
                        var n = r.addedNodes[j];
                        if (n.nodeType === 1) queue(n);
                        else if (n.nodeType === 3 && n.parentElement) queue(n.parentElement);
                    }
                }
            }
        });
        observer.observe(document.body, {
            childList: true, characterData: true, subtree: true
        });
    }
    function stopObserver() {
        if (observer) { observer.disconnect(); observer = null; }
    }

    function enable() {
        if (on) return;
        on = true;
        document.body.classList.add('sums-hidden');
        tag(document.body);
        startObserver();
    }
    function disable() {
        if (!on) return;
        on = false;
        stopObserver();
        document.body.classList.remove('sums-hidden');
        // класс с элементов не снимаем: под sums-hidden он не действует,
        // а при повторном включении разметка уже готова (меньше работы).
    }

    function apply(want) {
        if (want) enable(); else disable();
    }
    function refresh() { apply(readSetting()); }

    window.sumsPrivacy = {
        set: apply,          // явное управление из кабинета (мгновенно)
        refresh: refresh,    // перечитать настройку (после cloud-pull/логина)
        isOn: function () { return on; }
    };

    function init() {
        if (readSetting()) enable();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
