// =============================================
// PAGE-TRANSITION — занавес между перезагрузками
// =============================================
// Вход, выход и «очистка устройства» перезагружают страницу: модули держат
// данные в памяти, без reload они не перечитают localStorage (см. cloud-sync).
// Сам reload читался как рывок — три вспышки подряд:
//   1) промежуточный кадр приложения со СТАРЫМИ данными (вход) или
//      полурасчищенный «гостевой» перерендер (выход);
//   2) белый экран между выгрузкой и первым пейнтом;
//   3) скачок темы — выход всегда уводит на Главную, а она тёмная.
// Лечим одним приёмом: ПЕРЕД reload поднимаем занавес цвета БУДУЩЕЙ темы,
// следующая страница стартует уже под ним (флаг в sessionStorage, стиль и
// «взвод» — инлайном в <head> index.html, иначе занавеса нет до загрузки css)
// и раскрывается, когда приложение отрисовано. Данные не трогаем вообще.
//
// API:
//   pageTransition.reload({tab, label})        — поднять занавес и перезагрузиться
//   pageTransition.cover({tab, label}, done)   — поднять и позвать done (reload делает вызывающий)
//   pageTransition.go(url, {tab, label})       — поднять и уйти по адресу
//   pageTransition.reveal()                    — раскрыть вручную
// tab — вкладка, на которой ОТКРОЕТСЯ страница (задаёт цвет занавеса);
// не передан — берём из текущего пути. label — подпись, показывается только
// если переход затянулся дольше ~0.45с.
//
// Грузится ПЕРВЫМ из js/*: занавесом пользуются cloud-sync и profile-menu.

(function () {
    'use strict';

    var FLAG = 'pg_cloak_v1';   // sessionStorage: «следующая загрузка — под занавесом»
    var ROOT = document.documentElement;
    var FADE = 320;             // = transition в инлайн-стиле <head>, менять парой
    var SAFETY = 7000;          // reload не случился (сеть/ошибка) — раскрываемся сами
    var CAP = 2500;             // потолок ожидания отрисовки на старте

    var covered = ROOT.classList.contains('pg-cloak');   // стартовали под занавесом
    var busy = false;
    var lastLabel = '';
    var safetyT = null;

    function cls() { return ROOT.classList; }

    // Кадр для старта transition. Голого rAF мало: в фоновой (или свёрнутой)
    // вкладке кадры не приходят вовсе, и переход, повешенный только на rAF,
    // не начинается НИКОГДА — а вместе с ним не случается и reload. Дублируем
    // таймером: анимацию в фоне всё равно никто не видит, важно не застрять.
    function nextFrame(fn) {
        var done = false;
        function run() { if (done) return; done = true; fn(); }
        requestAnimationFrame(function () { requestAnimationFrame(run); });
        setTimeout(run, 40);
    }

    // Вкладка из адреса (зеркалит _themeIsHomeTab из core.js)
    function pathTab() {
        var p = location.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/index\.html?$/i, '');
        return p || 'home';
    }

    // Тема, в которой ОТКРОЕТСЯ вкладка: Главная — theme_home (дефолт тёмная),
    // остальные — user_theme (дефолт светлая). Логика одна с core.js, но занавес
    // может подниматься раньше, чем core.js исполнился, — поэтому свой запасной путь.
    function wantDark(tab) {
        if (tab == null) tab = pathTab();
        try {
            if (typeof window._themeWantDark === 'function') return !!window._themeWantDark(tab);
        } catch (e) {}
        try {
            if (tab === 'home') {
                var th = localStorage.getItem('theme_home');
                return th ? th === 'dark' : true;
            }
            var ut = localStorage.getItem('user_theme');
            return ut ? ut === 'dark' : false;
        } catch (e) {}
        return false;
    }

    // Флаг для следующей страницы — её поднимет инлайн-скрипт в <head>
    function armFlag(dark, label) {
        try {
            sessionStorage.setItem(FLAG, JSON.stringify({
                ts: Date.now(), dark: !!dark, label: label || ''
            }));
        } catch (e) {}
    }

    // ---------- поднять ----------
    function cover(opts, done) {
        opts = opts || {};
        var dark = ('dark' in opts) ? !!opts.dark : wantDark(opts.tab);
        var label = opts.label || '';
        var fire = function () {
            if (typeof done !== 'function') return;
            var fn = done; done = null;
            try { fn(); } catch (e) {}
        };

        // Занавес уже поднят: выход поднимает его в profile-menu, а cloud-sync
        // просит ещё раз перед самим reload. Второй вызов только уточняет флаг.
        if (busy || covered) {
            if (label) lastLabel = label;
            armFlag(dark, lastLabel);
            // Занавес мог уже уходить (страница стартовала под ним, идёт
            // раскрытие) — возвращаем на место, иначе именно в эту щель и
            // покажется кадр, ради которого всё затевалось.
            if (cls().contains('pg-cloak')) {
                if (dark) cls().add('pg-dark');
                cls().remove('pg-clear');
                clearTimeout(safetyT);
                safetyT = setTimeout(reveal, SAFETY);
            }
            fire();
            return;
        }

        busy = true;
        lastLabel = label;
        armFlag(dark, label);

        if (label) ROOT.setAttribute('data-pg-label', label);
        if (dark) cls().add('pg-dark');
        cls().add('pg-cloak', 'pg-clear');   // занавес есть, но пока прозрачный
        void ROOT.offsetWidth;               // зафиксировать стартовое состояние
        cls().add('pg-anim');
        nextFrame(function () { cls().remove('pg-clear'); });   // → opacity 1
        // reload вешаем на собственный таймер, НЕ внутрь кадра: даже если
        // отрисовки не будет (фоновая вкладка), выход обязан состояться
        setTimeout(fire, FADE);

        clearTimeout(safetyT);
        safetyT = setTimeout(reveal, SAFETY);
    }

    function reload(opts) {
        cover(opts, function () { location.reload(); });
    }

    function go(url, opts) {
        cover(opts, function () { location.href = url; });
    }

    // ---------- раскрыть ----------
    function reveal() {
        clearTimeout(safetyT);
        if (!cls().contains('pg-cloak')) { busy = false; covered = false; return; }
        cls().add('pg-anim');
        nextFrame(function () { cls().add('pg-clear'); });
        setTimeout(function () {
            cls().remove('pg-cloak', 'pg-clear', 'pg-anim', 'pg-dark');
            ROOT.removeAttribute('data-pg-label');
            busy = false; covered = false;
        }, FADE + 60);
    }

    // ---------- автораскрытие на старте ----------
    // Ждём отрисовки: route-hash переключает вкладку синхронно на DCL, дальше
    // отдаём кадр вёрстке. Потолок — чтобы висящая картинка или медленная сеть
    // не держала занавес поднятым.
    if (covered) {
        var opened = false;
        function open() { if (opened) return; opened = true; reveal(); }
        // nextFrame, а не голый rAF: в видимой вкладке раскрываемся по настоящему
        // кадру (приложение уже нарисовано), в фоновой — по таймеру, иначе занавес
        // висел бы до потолка CAP и встречал вернувшегося пользователя пустотой
        function whenPainted() { nextFrame(function () { setTimeout(open, 60); }); }
        if (document.readyState === 'complete') whenPainted();
        else window.addEventListener('load', whenPainted);
        setTimeout(open, CAP);
    }

    // Загрузка кончилась — возвращаем анимации фона (тему теперь можно менять
    // плавно). Класс ставит инлайн в <head>, чтобы правка цвета на старте не
    // читалась как вспышка; см. комментарий там же.
    (function () {
        function animOn() {
            setTimeout(function () { ROOT.classList.remove('boot-anim-off'); }, 80);
        }
        if (document.readyState === 'complete') animOn();
        else window.addEventListener('load', animOn);
    })();

    window.pageTransition = {
        cover: cover,
        reload: reload,
        go: go,
        reveal: reveal,
        wantDark: wantDark
    };
})();
