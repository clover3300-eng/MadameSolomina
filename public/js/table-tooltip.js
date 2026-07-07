/* Кастомный тултип для таблиц-терминалов (Акции / Облигации).
   Заменяет нативные `title`-подсказки (серый системный фон ОС) на
   стилизованный плавающий блок, согласованный с темой сайта.

   Работает делегированно: при наведении на любой элемент с `title`
   внутри .stk-root / .bnd-root оригинальный текст «прячется» в data-tt-title
   (а сам title удаляется, чтобы подавить нативную подсказку), и показывается
   собственный блок. При уходе курсора title восстанавливается — доступность
   и поведение «как было» сохраняются.

   Без ES-модулей: обычный IIFE, общий с остальными скриптами scope. */
(function () {
    'use strict';

    var ROOT_SEL = '.stk-root, .bnd-root';
    var STASH = 'data-tt-title';   // здесь хранится исходный текст title
    var SEL = '[title], [' + STASH + ']';

    var tipEl = null;   // плавающий блок (создаётся лениво в <body>)
    var curEl = null;   // элемент, для которого сейчас показан тултип

    function ensureTip() {
        if (tipEl) return tipEl;
        tipEl = document.createElement('div');
        tipEl.className = 'tbl-tip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
        return tipEl;
    }

    function show(el) {
        var title = el.getAttribute('title');
        if (title == null) title = el.getAttribute(STASH);
        if (!title) return;

        // Подавляем нативную подсказку: прячем title, запоминаем оригинал.
        if (el.hasAttribute('title')) {
            el.setAttribute(STASH, title);
            el.removeAttribute('title');
        }
        curEl = el;

        var tip = ensureTip();
        // Многострочные подсказки используют \n: первая строка — основная,
        // остальные (например, подсказка про сортировку) — приглушённые.
        tip.textContent = '';
        var lines = String(title).split('\n');
        for (var i = 0; i < lines.length; i++) {
            if (!lines[i]) continue;
            var span = document.createElement('span');
            span.className = 'tbl-tip-line' + (i > 0 ? ' tbl-tip-sub' : '');
            span.textContent = lines[i];
            tip.appendChild(span);
        }
        tip.classList.add('show');
        position(el, tip);
    }

    function position(el, tip) {
        var r = el.getBoundingClientRect();
        tip.style.visibility = 'hidden';
        tip.style.left = '0px';
        tip.style.top = '0px';

        var tw = tip.offsetWidth;
        var th = tip.offsetHeight;
        var gap = 8;
        var pad = 6;

        var left = r.left + r.width / 2 - tw / 2;
        var top = r.bottom + gap;

        // Если снизу не помещается — показываем над элементом.
        if (top + th > window.innerHeight - pad) {
            top = r.top - th - gap;
        }
        // Прижимаем по горизонтали к границам окна.
        if (left < pad) left = pad;
        if (left + tw > window.innerWidth - pad) left = window.innerWidth - pad - tw;
        if (top < pad) top = pad;

        tip.style.left = Math.round(left) + 'px';
        tip.style.top = Math.round(top) + 'px';
        tip.style.visibility = 'visible';
    }

    function hide() {
        if (curEl) {
            // Возвращаем title на место (доступность / поведение по умолчанию).
            var stashed = curEl.getAttribute(STASH);
            if (stashed != null && !curEl.hasAttribute('title')) {
                curEl.setAttribute('title', stashed);
            }
            curEl.removeAttribute(STASH);
            curEl = null;
        }
        if (tipEl) tipEl.classList.remove('show');
    }

    document.addEventListener('pointerover', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var root = t.closest(ROOT_SEL);
        if (!root) return;
        var el = t.closest(SEL);
        if (!el || !root.contains(el)) return;
        if (el === curEl) return;
        if (curEl) hide();
        show(el);
    }, true);

    document.addEventListener('pointerout', function (e) {
        if (!curEl) return;
        var to = e.relatedTarget;
        // Не прячем, если курсор ушёл во вложенный элемент того же узла.
        if (to && curEl.contains && curEl.contains(to)) return;
        hide();
    }, true);

    // Любой скролл/клик/уход фокуса убирает подсказку.
    window.addEventListener('scroll', hide, true);
    document.addEventListener('click', hide, true);
    window.addEventListener('blur', hide);
})();
