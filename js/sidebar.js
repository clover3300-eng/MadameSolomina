// ===== SITE SIDEBAR CONTROLLER =====
(function() {
    var sbMqDesktop = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };
    var sbIsDesktop = function() { return sbMqDesktop.matches; };

    // Default state: on desktop the sidebar rests collapsed (icon rail) and
    // expands on hover; on mobile it's an off-canvas drawer. The user can pin
    // it open via the collapse toggle, which we remember in localStorage ('0').
    // We (re)apply this whenever the viewport crosses the desktop breakpoint so
    // it survives resizes and late viewport sizing.
    function applySidebarDefault() {
        try {
            var stored = localStorage.getItem('sbCollapsed');
            if (stored === null) {
                document.body.classList.toggle('sb-collapsed', sbIsDesktop());
            } else {
                document.body.classList.toggle('sb-collapsed', stored === '1');
            }
        } catch (e) {}
        if (window.updateCollapseLabel) window.updateCollapseLabel();
    }
    applySidebarDefault();
    if (sbMqDesktop.addEventListener) sbMqDesktop.addEventListener('change', applySidebarDefault);
    else if (sbMqDesktop.addListener) sbMqDesktop.addListener(applySidebarDefault);
    window.addEventListener('load', applySidebarDefault);

    // Desktop hover-to-peek: while the cursor is over the collapsed rail the
    // sidebar expands as a floating overlay (content/header never shift); moving
    // the cursor away (into the content) collapses it again.
    document.addEventListener('DOMContentLoaded', function() {
        applySidebarDefault();

        var sb = document.getElementById('sideBar');
        if (!sb) return;
        sb.addEventListener('mouseenter', function() {
            if (sbIsDesktop() && document.body.classList.contains('sb-collapsed')) {
                document.body.classList.add('sb-peek');
            }
        });
        sb.addEventListener('mouseleave', function() {
            document.body.classList.remove('sb-peek');
        });
    });

    // Keep the footer toggle's label honest: collapsed → it pins the menu open,
    // expanded → it collapses back to the icon rail.
    function updateCollapseLabel() {
        var btn = document.getElementById('sbCollapseBtn');
        if (!btn) return;
        var collapsed = document.body.classList.contains('sb-collapsed');
        var lbl = btn.querySelector('.sb-label');
        if (lbl) lbl.textContent = collapsed ? 'Закрепить' : 'Свернуть';
        btn.title = collapsed ? 'Закрепить меню' : 'Свернуть меню';
    }
    window.updateCollapseLabel = updateCollapseLabel;

    window.toggleSidebarCollapse = function() {
        var collapsed = document.body.classList.toggle('sb-collapsed');
        document.body.classList.remove('sb-peek');
        try { localStorage.setItem('sbCollapsed', collapsed ? '1' : '0'); } catch (e) {}
        updateCollapseLabel();
        // ширина сайдбара изменилась → пересчитываем левый край портфеля
        requestAnimationFrame(function() {
            window.pfSyncLeftEdge && window.pfSyncLeftEdge();
            window.pfSyncLeftWidth && window.pfSyncLeftWidth();
            window.pfCenterTables && window.pfCenterTables();
            window.pfFitNumbers && window.pfFitNumbers();
        });
    };
    window.openSidebarDrawer = function() {
        document.body.classList.add('sb-open');
    };
    window.closeSidebarDrawer = function() {
        document.body.classList.remove('sb-open');
    };

    // Section badges in the header: icon chip + name
    var hdrSections = {
        calc:      { name: 'Расчёт',         icon: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>' },
        portfolio: { name: 'Портфель',       icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
        rebalance: { name: 'Ребаланс',       icon: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><polyline points="17 6 23 6 23 12"/>' },
        market:    { name: 'Рынок',          icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
        backtest:  { name: 'Тест портфеля',  icon: '<path d="M3 3v18h18"/><path d="M18 17l-5-5-4 4-3-3"/>' }
    };
    function updateDockActive(tabId) {
        document.querySelectorAll('#mobileDock [data-tab]').forEach(function(btn) {
            var isActive = btn.dataset.tab === tabId ||
                           (btn.dataset.tab === 'calc' && tabId === 'portfolio') ||
                           (btn.dataset.tab === 'home' && tabId === 'dashboard');
            btn.classList.toggle('active', isActive);
        });
    }
    var _origBrandHTML = null;
    function updateHomeGreeting(tabId) {
        var t = document.getElementById('topBarTitle');
        if (!t) return;
        if (_origBrandHTML === null) _origBrandHTML = t.innerHTML;
        if (tabId === 'home') {
            t.innerHTML = '<span style="font-weight:300;">Добро </span><span style="font-weight:800;">пожаловать!</span>';
        } else {
            t.innerHTML = _origBrandHTML;
        }
    }
    function renderHeaderBadge(tabId) {
        var crumb = document.getElementById('topBarCrumb');
        if (!crumb) return;
        var s = hdrSections[tabId];
        if (s) {
            crumb.innerHTML = '<span class="hdr-chip"><svg viewBox="0 0 24 24">' + s.icon + '</svg></span>' +
                              '<span class="hdr-sec">' + s.name + '</span>';
            crumb.style.display = 'flex';
        } else {
            crumb.style.display = 'none';
        }
    }
    window.renderHeaderBadge = renderHeaderBadge;

    // Close mobile drawer after navigation
    var _sbPrevSwitchTab = switchTab;
    switchTab = function(tabId) {
        _sbPrevSwitchTab(tabId);
        window.closeSidebarDrawer();
        renderHeaderBadge(tabId);
        updateDockActive(tabId);
        if (['portfolio','rebalance','market','backtest'].indexOf(tabId) !== -1 && window.pfSyncLeftWidth) {
            requestAnimationFrame(function() {
                window.pfSyncLeftEdge && window.pfSyncLeftEdge();
                window.pfSyncLeftWidth();
                window.pfCenterTables && window.pfCenterTables();
            window.pfFitNumbers && window.pfFitNumbers();
            });
        }
    };

    // Esc closes the drawer
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') window.closeSidebarDrawer();
    });

    // ===== Красивый календарь для даты бэктеста (десктоп) =====
    (function() {
        var mq = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };
        var MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        var MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
        var DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
        var pop = null, vY = 0, vM = 0, view = 'days', vYPageEnd = 0;
        var MIN_YEAR = 2014;
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        function chevron() { return '<svg class="btcal-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'; }
        function getInput() { return document.getElementById('btDateInput'); }
        function getField() { var i = getInput(); return i ? i.closest('.bt-date-field') : null; }
        function closeCal() { if (pop) { pop.remove(); pop = null; } }
        function selDate() {
            var inp = getInput();
            if (inp && inp.value) {
                var p = inp.value.split('-');
                return { y: +p[0], m: +p[1] - 1, d: +p[2] };
            }
            return null;
        }
        function monthInFuture(y, m, tY, tM) { return y > tY || (y === tY && m > tM); }

        function renderDays() {
            var today = new Date(); today.setHours(0,0,0,0);
            var tY = today.getFullYear(), tM = today.getMonth();
            var sel = selDate();
            var nm = vM === 11 ? 0 : vM + 1, ny = vM === 11 ? vY + 1 : vY;
            var nextDis = monthInFuture(ny, nm, tY, tM);
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<div class="btcal-sel">'
                + '<button type="button" class="btcal-pick" data-pick="months">' + MONTHS[vM] + chevron() + '</button>'
                + '<button type="button" class="btcal-pick" data-pick="years">' + vY + chevron() + '</button>'
                + '</div>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-dow">';
            DOW.forEach(function(d) { h += '<span>' + d + '</span>'; });
            h += '</div><div class="btcal-grid">';
            var first = new Date(vY, vM, 1);
            var offset = (first.getDay() + 6) % 7;
            var dim = new Date(vY, vM + 1, 0).getDate();
            var dimPrev = new Date(vY, vM, 0).getDate();
            for (var i = 0; i < 42; i++) {
                var dnum, cy = vY, cm = vM, out = false;
                if (i < offset) { dnum = dimPrev - offset + 1 + i; cm = vM - 1; out = true; }
                else if (i >= offset + dim) { dnum = i - offset - dim + 1; cm = vM + 1; out = true; }
                else { dnum = i - offset + 1; }
                var dt = new Date(cy, cm, dnum); dt.setHours(0,0,0,0);
                var dis = dt > today;
                var isSel = sel && dt.getFullYear() === sel.y && dt.getMonth() === sel.m && dt.getDate() === sel.d;
                var isToday = dt.getTime() === today.getTime();
                var cls = 'btcal-day' + (out ? ' out' : '') + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isToday ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-date="' + dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + '"') + '>' + dnum + '</button>';
            }
            h += '</div>';
            return h;
        }

        function renderMonths() {
            var today = new Date();
            var tY = today.getFullYear(), tM = today.getMonth();
            var sel = selDate();
            var nextDis = vY >= tY;
            var prevDis = vY <= MIN_YEAR;
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"' + (prevDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<button type="button" class="btcal-title" data-pick="years">' + vY + chevron() + '</button>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-months">';
            for (var m = 0; m < 12; m++) {
                var dis = monthInFuture(vY, m, tY, tM);
                var isSel = sel && sel.y === vY && sel.m === m;
                var isCur = vY === tY && m === tM;
                var cls = 'btcal-mo' + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isCur ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-month="' + m + '"') + '>' + MONTHS_SHORT[m] + '</button>';
            }
            h += '</div>';
            return h;
        }

        function renderYears() {
            var today = new Date();
            var tY = today.getFullYear();
            var sel = selDate();
            var end = vYPageEnd, start = end - 11;
            var prevDis = start <= MIN_YEAR;
            var nextDis = end >= tY;
            var h = '<div class="btcal-head">'
                + '<button type="button" class="btcal-nav" data-nav="-1"' + (prevDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<div class="btcal-title btcal-title-static">' + Math.max(MIN_YEAR, start) + ' – ' + end + '</div>'
                + '<button type="button" class="btcal-nav" data-nav="1"' + (nextDis ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
                + '</div><div class="btcal-years">';
            for (var y = start; y <= end; y++) {
                if (y < MIN_YEAR) { h += '<span class="btcal-yr empty"></span>'; continue; }
                var dis = y > tY;
                var isSel = sel && sel.y === y;
                var isCur = y === tY;
                var cls = 'btcal-yr' + (dis ? ' dis' : '') + (isSel ? ' sel' : '') + (isCur ? ' today' : '');
                h += '<button type="button" class="' + cls + '"' + (dis ? '' : ' data-year="' + y + '"') + '>' + y + '</button>';
            }
            h += '</div>';
            return h;
        }

        function render() {
            if (!pop) return;
            pop.innerHTML = view === 'years' ? renderYears() : (view === 'months' ? renderMonths() : renderDays());
        }

        function openCal() {
            var inp = getInput();
            var field = getField();
            if (!inp || !field) return;
            closeCal();
            var sel = selDate();
            var base = sel ? new Date(sel.y, sel.m, 1) : new Date();
            vY = base.getFullYear(); vM = base.getMonth(); view = 'days';
            pop = document.createElement('div');
            pop.className = 'btcal';
            field.appendChild(pop);
            render();
            pop.addEventListener('click', function(e) {
                var t = new Date(), tY = t.getFullYear(), tM = t.getMonth();
                var nav = e.target.closest('[data-nav]');
                if (nav) {
                    if (nav.disabled) return;
                    var d = parseInt(nav.dataset.nav, 10);
                    if (view === 'years') {
                        vYPageEnd += d * 12;
                        if (vYPageEnd > tY) vYPageEnd = tY;
                        if (vYPageEnd < MIN_YEAR + 11) vYPageEnd = MIN_YEAR + 11;
                    } else if (view === 'months') {
                        vY += d;
                        if (vY < MIN_YEAR) vY = MIN_YEAR;
                        if (vY > tY) vY = tY;
                    } else {
                        vM += d;
                        if (vM < 0) { vM = 11; vY--; }
                        if (vM > 11) { vM = 0; vY++; }
                    }
                    render();
                    return;
                }
                var pick = e.target.closest('[data-pick]');
                if (pick) {
                    if (pick.dataset.pick === 'years') {
                        view = 'years';
                        vYPageEnd = tY;
                        if (vY < vYPageEnd - 11) vYPageEnd = vY + 11;
                        if (vYPageEnd < MIN_YEAR + 11) vYPageEnd = MIN_YEAR + 11;
                    } else {
                        view = 'months';
                    }
                    render();
                    return;
                }
                var mo = e.target.closest('[data-month]');
                if (mo) {
                    vM = parseInt(mo.dataset.month, 10);
                    view = 'days';
                    render();
                    return;
                }
                var yr = e.target.closest('[data-year]');
                if (yr) {
                    vY = parseInt(yr.dataset.year, 10);
                    if (monthInFuture(vY, vM, tY, tM)) vM = tM;
                    view = 'days';
                    render();
                    return;
                }
                var day = e.target.closest('[data-date]');
                if (day) {
                    var inp2 = getInput();
                    inp2.value = day.dataset.date;
                    if (typeof onBtDateChange === 'function') onBtDateChange();
                    closeCal();
                }
            });
        }

        // На десктопе делаем поле readonly — это полностью отключает нативный
        // системный календарь, оставляя только наш кастомный.
        function applyMode() {
            var inp = getInput();
            if (!inp) return;
            if (mq.matches) { inp.readOnly = true; }
            else { inp.readOnly = false; closeCal(); }
        }
        if (mq.addEventListener) mq.addEventListener('change', applyMode);
        else if (mq.addListener) mq.addListener(applyMode);
        window.addEventListener('resize', applyMode);
        applyMode();
        document.addEventListener('DOMContentLoaded', applyMode);

        document.addEventListener('mousedown', function(e) {
            var inp = getInput();
            if (!inp) return;
            if (e.target === inp && mq.matches) {
                e.preventDefault();
                if (pop) closeCal(); else openCal();
                return;
            }
            if (pop && !pop.contains(e.target)) closeCal();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeCal();
        });
    })();

    // Initial active state sync (switchTab may have run before this script)
    document.addEventListener('DOMContentLoaded', function() {
        var ct = (typeof currentTab !== 'undefined' && currentTab) ? currentTab : 'home';
        renderHeaderBadge(ct);
        updateDockActive(ct);
        document.querySelectorAll('.sb-item[data-tab]').forEach(function(btn) {
            var isActive = btn.dataset.tab === ct ||
                           (btn.dataset.tab === 'calc' && ct === 'portfolio') ||
                           (btn.dataset.tab === 'home' && ct === 'dashboard');
            btn.classList.toggle('active', isActive);
        });
    });
})();
