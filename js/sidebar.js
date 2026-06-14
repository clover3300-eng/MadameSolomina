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
            if (localStorage.getItem('sbCollapsed') === null) {
                document.body.classList.toggle('sb-collapsed', sbIsDesktop());
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
        var DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
        var pop = null, vY = 0, vM = 0;
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        function getInput() { return document.getElementById('btDateInput'); }
        function closeCal() { if (pop) { pop.remove(); pop = null; } }
        function selDate() {
            var inp = getInput();
            if (inp && inp.value) {
                var p = inp.value.split('-');
                return { y: +p[0], m: +p[1] - 1, d: +p[2] };
            }
            return null;
        }
        function render() {
            var today = new Date(); today.setHours(0,0,0,0);
            var sel = selDate();
            var h = '<div class="btcal-head">'
                + '<button class="btcal-nav" data-nav="-1"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'
                + '<div class="btcal-title">' + MONTHS[vM] + ' ' + vY + '</div>'
                + '<button class="btcal-nav" data-nav="1"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>'
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
                h += '<button class="' + cls + '"' + (dis ? '' : ' data-date="' + dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + '"') + '>' + dnum + '</button>';
            }
            h += '</div>';
            pop.innerHTML = h;
        }
        function openCal() {
            var inp = getInput();
            var col = document.getElementById('btConfigCol');
            if (!inp || !col) return;
            closeCal();
            var sel = selDate();
            var base = sel ? new Date(sel.y, sel.m, 1) : new Date();
            vY = base.getFullYear(); vM = base.getMonth();
            pop = document.createElement('div');
            pop.className = 'btcal';
            col.appendChild(pop);
            var ir = inp.getBoundingClientRect();
            var cr = col.getBoundingClientRect();
            pop.style.top = (ir.bottom - cr.top + 8) + 'px';
            pop.style.left = Math.max(8, ir.left - cr.left) + 'px';
            render();
            pop.addEventListener('click', function(e) {
                var nav = e.target.closest('[data-nav]');
                if (nav) {
                    vM += parseInt(nav.dataset.nav, 10);
                    if (vM < 0) { vM = 11; vY--; }
                    if (vM > 11) { vM = 0; vY++; }
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
