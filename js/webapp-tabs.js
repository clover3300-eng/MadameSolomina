// ===== WEBAPP TAB SYSTEM =====

let currentTab = 'home';
let isPortfolioPanePopulated = false;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    // Set initial home state — class must be present from the very first paint
    document.body.classList.add('tab-home');
    // Populate content panels from legacy screens
    populatePanels();
    // Первичное выравнивание левого края портфеля под логотип
    requestAnimationFrame(function() {
        window.pfSyncLeftEdge && window.pfSyncLeftEdge();
        window.pfSyncLeftWidth && window.pfSyncLeftWidth();
        window.pfCenterTables && window.pfCenterTables();
            window.pfFitNumbers && window.pfFitNumbers();
    });
    window.addEventListener('load', function() {
        setTimeout(function() {
            window.pfSyncLeftEdge && window.pfSyncLeftEdge();
            window.pfSyncLeftWidth && window.pfSyncLeftWidth();
            window.pfCenterTables && window.pfCenterTables();
            window.pfFitNumbers && window.pfFitNumbers();
        }, 100);
    });
    // Init sum input — 64px, width so it's tappable
    var sumEl = document.getElementById('sumInput');
    if (sumEl) {
        setTimeout(function() {
            sumEl.style.setProperty('font-size', '64px', 'important');
            sumEl.style.setProperty('width', '1ch', 'important');
            sumEl.style.setProperty('min-width', '1ch', 'important');
            var ruble = document.getElementById('ndRuble');
            if (ruble) ruble.style.fontSize = '64px';
        }, 50);
    }
    // Start data loading
    loadData();
    // Set default date for backtest (1 year ago)
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    const dateEl = document.getElementById('btDateInput');
    if (dateEl) {
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() - 1);
        dateEl.max = maxDate.toISOString().split('T')[0];
        dateEl.min = '2010-01-01';
        dateEl.value = d.toISOString().split('T')[0];
    }
    // Init backtest state
    btRenderTickerList();
    btUpdateRunBtn();
    // Init market data auto-refresh
    updateMarketData();
    setInterval(updateMarketData, 30000);
    loadCompanyDescriptions();
});

function populatePanels() {
    // Approach: instead of moving DOM nodes (which can cause display bugs),
    // we wire up the panel divs to show the right legacy screen content
    // by moving it once cleanly.

    // === CALC PANEL ===
    const calcSection = document.getElementById('calcSection');
    const calcPaneContent = document.getElementById('calcPaneContent');
    if (calcSection && calcPaneContent) {
        calcPaneContent.appendChild(calcSection);
        // Reset any mobile-app scroll constraints
        calcSection.style.cssText = 'display:block; height:auto; min-height:0; overflow:visible; padding:0;';
    }

    // === PORTFOLIO PANEL ===
    const portfolioContent = document.getElementById('portfolio-content');
    const portfolioTabContent = document.getElementById('portfolioTabContent');
    const portfolioEmpty = document.getElementById('portfolio-empty');
    if (portfolioEmpty) portfolioEmpty.style.display = 'none'; // use our own
    if (portfolioContent && portfolioTabContent) {
        portfolioTabContent.appendChild(portfolioContent);
        portfolioContent.style.display = 'none'; // shown after calculation
    }
    // === 3-секционный портфель: левый рельс (капитал + переключатель + действия) и правая колонка ===
    (function() {
        const pageBuy = document.getElementById('portfolio-page-buy');
        if (!pageBuy || document.getElementById('pfLeftRail')) return;
        const left = document.createElement('div');
        left.id = 'pfLeftRail';
        const right = document.createElement('div');
        right.id = 'pfRightCol';
        const share = document.getElementById('shareContainer');
        const tabs = pageBuy.querySelector('.portfolio-content-tabs');
        // переносим всё остальное в правую колонку
        [...pageBuy.children].forEach(function(c) {
            if (c !== share && c !== tabs) right.appendChild(c);
        });
        if (share) left.appendChild(share);
        if (tabs) left.appendChild(tabs);
        // пилл «К расчёту» и кнопки действий — в левую колонку под переключатель
        const hdr = document.querySelector('#panel-portfolio .panel-section-header');
        if (hdr) left.appendChild(hdr);
        pageBuy.appendChild(left);
        pageBuy.appendChild(right);
    })();
    // === V3 «Зеркало»: десктопная сборка портфеля (таблица слева, панель справа) ===
    (function() {
        const share = document.getElementById('shareContainer');
        const pageBuy = document.getElementById('portfolio-page-buy');
        const rail = document.getElementById('pfLeftRail');
        if (!share || !pageBuy || !rail || document.querySelector('.v3-recalc-btn')) return;
        // 1) Обёртки-карточки таблиц (на мобиле display:contents — невидимы)
        function wrapRange(parent, fromSel, toSel) {
            if (!parent) return;
            const from = parent.querySelector(':scope > ' + fromSel);
            const to = parent.querySelector(':scope > ' + toSel);
            if (!from || !to) return;
            const card = document.createElement('div');
            card.className = 'v3-table-card';
            parent.insertBefore(card, from);
            let n = from;
            while (n) {
                const next = n.nextElementSibling;
                card.appendChild(n);
                if (n === to) break;
                n = next;
            }
        }
        wrapRange(document.getElementById('portfolio-tab-bonds'), '#pfBondsThead', '#bondsTotalRow');
        wrapRange(document.getElementById('portfolio-tab-stocks'), '#pfStocksThead', '.portfolio-echelons-total-row');
        // 2) Кнопка «Список к покупке» внутри светлой части карточки капитала
        const fcLight = share.querySelector('.capital-forecast-light');
        if (fcLight) {
            const buyBtn = document.createElement('button');
            buyBtn.type = 'button';
            buyBtn.className = 'v3-buylist-btn';
            buyBtn.innerHTML = '<span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="16" rx="2.5"/><path d="M9 5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1"/><path d="M8.5 11l1.6 1.6L13.5 9"/><path d="M8.5 16.5h5"/></svg></span>Список к покупке<span class="count" id="v3BuyCount">0</span>';
            // Повторное нажатие сворачивает встроенную панель (десктоп)
            buyBtn.onclick = function() {
                var pfR = document.getElementById('pfRightCol');
                if (pfR && pfR.classList.contains('v3-buy-open')) { if (typeof window.v3CloseBuyList === 'function') window.v3CloseBuyList(); return; }
                if (typeof window.v3OpenBuyList === 'function') window.v3OpenBuyList();
                else if (typeof openShoppingList === 'function') openShoppingList();
            };
            fcLight.appendChild(buyBtn);
        }
        // 3) Кнопка «Новый расчёт» — внутри карточки капитала (увеличивает её),
        //    возврат на вкладку Расчёт
        const recalc = document.createElement('button');
        recalc.type = 'button';
        recalc.className = 'v3-recalc-btn';
        recalc.innerHTML = '<span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 0 1 14.4-6.1L21 8"/><path d="M21 3.5V8.2h-4.7"/><path d="M20.5 12a8.5 8.5 0 0 1-14.4 6.1L3 16"/><path d="M3 20.5V15.8h4.7"/></svg></span>Новый расчёт';
        recalc.onclick = function() { switchTab('calc'); };
        if (fcLight) fcLight.appendChild(recalc); else rail.appendChild(recalc);
        // 3.5) Встроенная панель «Список к покупке» — открывается вместо таблицы
        const pfRight = document.getElementById('pfRightCol');
        if (pfRight) {
            const buyPanel = document.createElement('div');
            buyPanel.id = 'v3BuyPanel';
            buyPanel.innerHTML =
                '<div class="v3bl-head">' +
                    '<button type="button" class="v3bl-iconbtn" onclick="v3CloseBuyList()" title="К портфелю">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>' +
                    '</button>' +
                    '<span class="v3bl-title">Список к покупке</span>' +
                    '<span class="v3bl-count" id="v3BuyCount2">0</span>' +
                    '<span class="sp"></span>' +
                    '<span class="v3bl-toast" id="v3BuyToast">Скопировано ✓</span>' +
                    '<button type="button" class="v3bl-iconbtn" onclick="v3CopyBuyList()" title="Скопировать список">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div class="v3bl-colhead">' +
                    '<span class="ch-asset">Актив</span>' +
                    '<span class="ch-qty">Кол-во</span>' +
                    '<span class="ch-sum">Сумма</span>' +
                '</div>' +
                '<div id="v3BuyBody"></div>' +
                '<div class="v3bl-foot">' +
                    '<div class="v3bl-foot-row">' +
                        '<div><div class="lb">Осталось купить</div><div class="vl" id="v3SlRemaining">0 ₽</div></div>' +
                        '<div class="plan"><div class="lb">План</div><div class="vl" id="v3SlPlan">0 ₽</div></div>' +
                    '</div>' +
                    '<div class="v3bl-track"><div class="v3bl-bar" id="v3SlBar"></div></div>' +
                    '<div class="v3bl-pct" id="v3SlPct">0%</div>' +
                '</div>';
            pfRight.insertBefore(buyPanel, pfRight.firstChild);
        }
        // Прогресс панели: считаем по DOM (общий стейт с toggleShopItem через data-sum/.filled)
        function v3MirrorSlFooter() {
            const items = document.querySelectorAll('#v3BuyBody .sl-item');
            let total = 0, done = 0;
            items.forEach(function(it) {
                const s = parseFloat(it.dataset.sum) || 0;
                total += s;
                if (it.classList.contains('filled')) done += s;
            });
            const pct = total > 0 ? Math.round(done / total * 100) : 0;
            const fmt = function(n) { return Math.max(0, Math.round(n)).toLocaleString('ru-RU') + ' ₽'; };
            const a = document.getElementById('v3SlRemaining'); if (a) a.textContent = fmt(total - done);
            const b = document.getElementById('v3SlPlan'); if (b) b.textContent = fmt(total);
            const bar = document.getElementById('v3SlBar'); if (bar) bar.style.width = pct + '%';
            const p = document.getElementById('v3SlPct'); if (p) p.textContent = pct + '%';
        }
        if (typeof window.updateSlFooter === 'function') {
            const _origUpdateSlFooter = window.updateSlFooter;
            window.updateSlFooter = function() { _origUpdateSlFooter(); v3MirrorSlFooter(); };
        }
        window.v3OpenBuyList = function() {
            if (!mqV3.matches) { if (typeof openShoppingList === 'function') openShoppingList(); return; }
            if (typeof openShoppingList === 'function') openShoppingList();
            const ov = document.getElementById('shoppingListOverlay');
            if (ov) ov.style.display = 'none';
            const srcBody = document.getElementById('shoppingListBody');
            const host = document.getElementById('v3BuyBody');
            if (srcBody && host) { host.innerHTML = srcBody.innerHTML; srcBody.innerHTML = ''; }
            const c1 = document.getElementById('v3BuyCount');
            const c2 = document.getElementById('v3BuyCount2');
            if (c1 && c2) c2.textContent = c1.textContent;
            if (pfRight) pfRight.classList.add('v3-buy-open');
            v3MirrorSlFooter();
        };
        window.v3CloseBuyList = function() {
            if (pfRight) pfRight.classList.remove('v3-buy-open');
        };
        window.v3CopyBuyList = function() {
            if (typeof copyShoppingList === 'function') copyShoppingList();
            const t = document.getElementById('v3BuyToast');
            if (t) { t.classList.add('show'); setTimeout(function() { t.classList.remove('show'); }, 1600); }
        };
        // Переключение ОФЗ/Акции возвращает таблицу
        document.querySelectorAll('.portfolio-tab-btn').forEach(function(b) {
            b.addEventListener('click', function() { window.v3CloseBuyList(); });
        });
        // 4) Счётчик позиций к покупке (облигации + акции из данных списка)
        window.v3UpdateBuyCount = function() {
            const el = document.getElementById('v3BuyCount');
            if (!el) return;
            let n = 0;
            const d = window._shoppingListData;
            if (d) n = (d.bonds ? d.bonds.length : 0) + (d.stocks ? d.stocks.length : 0);
            if (!n) {
                const lb = document.getElementById('listBondsV2');
                if (lb) n = lb.querySelectorAll('.portfolio-ofz-item').length;
            }
            el.textContent = n;
            el.style.display = n ? '' : 'none';
        };
        const lbObserved = document.getElementById('listBondsV2');
        if (lbObserved && window.MutationObserver) {
            new MutationObserver(function() {
                window.v3UpdateBuyCount();
                // если встроенный список открыт — перегенерируем его свежими данными
                if (pfRight && pfRight.classList.contains('v3-buy-open')) window.v3OpenBuyList();
            }).observe(lbObserved, { childList: true });
        }
        window.v3UpdateBuyCount();
        // 5) Десктоп: табы внутрь карточки капитала (между тёмным блоком и прогнозом);
        //    мобила: возвращаем на место. Плюс короткий заголовок купонного стрипа.
        const darkTop = share.querySelector('.capital-dark-top');
        const couponTitle = document.querySelector('#couponBoxV2 .portfolio-coupon-title');
        const couponTitleMobile = couponTitle ? couponTitle.textContent : '';
        const mqV3 = window.matchMedia('(min-width: 1024px)');
        function v3Place() {
            const tabs = document.querySelector('.portfolio-content-tabs');
            if (mqV3.matches) {
                if (tabs && darkTop && tabs.previousElementSibling !== darkTop) {
                    darkTop.insertAdjacentElement('afterend', tabs);
                }
                if (couponTitle) couponTitle.textContent = 'Ближайшие выплаты';
            } else {
                if (tabs && tabs.parentElement !== rail) {
                    share.insertAdjacentElement('afterend', tabs);
                }
                if (couponTitle) couponTitle.textContent = couponTitleMobile;
                if (window.v3CloseBuyList) window.v3CloseBuyList();
            }
        }
        if (mqV3.addEventListener) mqV3.addEventListener('change', v3Place);
        else if (mqV3.addListener) mqV3.addListener(v3Place);
        v3Place();

        // Карточка капитала зафиксирована по своей естественной высоте (как в
        // состоянии «Акции») и НЕ растягивается под высоту таблицы при переключении
        // ОФЗ/Акции — рельса остаётся фиксированной, как в Ребалансе.
        window.v3SyncCapHeight = function() {
            const capCard = document.querySelector('#pfLeftRail .portfolio-capital-card');
            if (!capCard) return;
            capCard.style.height = '';
        };
        requestAnimationFrame(function(){ requestAnimationFrame(window.v3SyncCapHeight); });
        window.addEventListener('resize', function(){ if (window.v3SyncCapHeight) window.v3SyncCapHeight(); });
        document.querySelectorAll('.portfolio-tab-btn').forEach(function(b){
            b.addEventListener('click', function(){ setTimeout(window.v3SyncCapHeight, 60); });
        });
        const lbForHeight = document.getElementById('listBondsV2');
        if (lbForHeight && window.MutationObserver) {
            new MutationObserver(function(){ setTimeout(window.v3SyncCapHeight, 60); }).observe(lbForHeight, { childList: true });
        }
    })();
    // Равные отступы: grid-gap (рельса→контент) = зазор сайдбар→рельса. Для всех страниц с рельсой.
    window.pfSyncLeftWidth = function() {
        const ids = ['portfolio-page-buy', 'rebalancePanelContent', 'marketPanelContent', 'panel-backtest'];
        const els = ids.map(function(id){ return document.getElementById(id); }).filter(Boolean);
        const sb = document.getElementById('sbPanel');
        if (window.innerWidth < 1024) { els.forEach(function(g){ g.style.removeProperty('--pfGap'); }); return; }
        const vis = els.find(function(g){ return g.offsetParent !== null; });
        if (!vis || !sb) return;
        const gap = Math.round(Math.max(20, vis.getBoundingClientRect().left - sb.getBoundingClientRect().right));
        if (gap < 200) els.forEach(function(g){ g.style.setProperty('--pfGap', gap + 'px'); });
    };
    // Выравнивание левого края контента под началом «Madame Solomi'na». Для всех страниц с рельсой.
    window.pfSyncLeftEdge = function() {
        // V3: все страницы с рельсой центрируются сами (margin:auto) — сбрасываем паддинги
        const ids = [];
        ['panel-portfolio', 'panel-rebalance', 'panel-market', 'panel-backtest'].forEach(function(id) {
            const p = document.getElementById(id);
            if (p) p.style.paddingLeft = '';
        });
        const els = ids.map(function(id){ return document.getElementById(id); }).filter(Boolean);
        const brand = document.getElementById('topBarTitle');
        if (window.innerWidth < 1024 || !brand) {
            els.forEach(function(p){ p.style.paddingLeft = ''; });
            return;
        }
        const vis = els.find(function(p){ return p.offsetParent !== null; });
        if (!vis) return;
        // временно обнуляем, чтобы измерить «естественный» левый край контента
        vis.style.paddingLeft = '0px';
        const brandLeft = brand.getBoundingClientRect().left;
        const panelInnerLeft = vis.getBoundingClientRect().left;
        const delta = Math.round(brandLeft - panelInnerLeft);
        if (delta > 0 && delta < 400) {
            const pad = delta + 'px';
            els.forEach(function(p){ p.style.paddingLeft = pad; });
        } else {
            vis.style.paddingLeft = '';
        }
    };
    // Центрирование отключено — таблица идёт сразу после карточки с равным отступом
    window.pfCenterTables = function() {
        const right = document.getElementById('pfRightCol');
        if (right) right.style.transform = '';
    };
    // Авто-подгонка размера крупных сумм (капитал и прогноз), чтобы все цифры и ₽ вмещались
    window.pfFitNumbers = function() {
        const rail = document.getElementById('pfLeftRail');
        if (!rail) return;
        function reset(sel) { rail.querySelectorAll(sel).forEach(function(el){ el.style.fontSize = ''; }); }
        if (window.innerWidth < 1024) { reset('.capital-value'); reset('.forecast-data-total'); return; }
        function fit(el, maxPx, minPx) {
            if (!el || !el.parentElement) return;
            const avail = el.parentElement.clientWidth;
            if (!avail) return;
            let size = maxPx;
            el.style.fontSize = size + 'px';
            let guard = 0;
            while (el.scrollWidth > avail && size > minPx && guard < 60) {
                size -= 0.5; el.style.fontSize = size + 'px'; guard++;
            }
        }
        rail.querySelectorAll('.capital-value').forEach(function(el){ fit(el, 32, 16); });
        rail.querySelectorAll('.forecast-data-total').forEach(function(el){ fit(el, 27, 14); });
    };
    window.addEventListener('resize', function() { window.pfSyncLeftEdge(); window.pfSyncLeftWidth(); window.pfCenterTables(); window.pfFitNumbers(); });
    // Also move the portfolio header row (action btns) to our tab
    const portfolioHeaderRow = document.querySelector('#screen-portfolio .portfolio-header-row');
    if (portfolioHeaderRow) portfolioHeaderRow.style.display = 'none'; // hide old header

    // === REBALANCE PANEL ===
    const rebalanceScreen = document.getElementById('screen-assets');
    const rebalanceTarget = document.getElementById('rebalancePanelContent');
    if (rebalanceScreen && rebalanceTarget) {
        Array.from(rebalanceScreen.children).forEach(child => {
            if (!child.classList.contains('aurora-container') && 
                !child.classList.contains('noise-overlay')) {
                rebalanceTarget.appendChild(child);
            }
        });
    }

    // === MARKET PANEL ===
    const marketScreen = document.getElementById('screen-interesting');
    const marketTarget = document.getElementById('marketPanelContent');
    if (marketScreen && marketTarget) {
        Array.from(marketScreen.children).forEach(child => {
            if (!child.classList.contains('aurora-container') &&
                !child.classList.contains('noise-overlay')) {
                marketTarget.appendChild(child);
            }
        });
    }

    // === V3: рельсы Ребаланса и Рынка собираем ПОСЛЕ переноса контента ===
    // === Ребаланс: рельса (умная замена + переключатель) и правая колонка ===
    (function() {
        const host = document.getElementById('rebalancePanelContent');
        if (!host || document.getElementById('rbLeftRail')) return;
        const left = document.createElement('div'); left.id = 'rbLeftRail';
        const right = document.createElement('div'); right.id = 'rbRightCol';
        const hdr = host.querySelector('.header');
        // Переключатель ОФЗ/Акции теперь живёт внутри .smart-replace-card (R4),
        // поэтому отдельно его не переносим — он уедет в рельсу вместе с картой.
        const card = host.querySelector('.smart-replace-card');
        [...host.children].forEach(function(c) {
            if (c === hdr || c === card) return;
            if (c.classList && (c.classList.contains('aurora-container') || c.classList.contains('noise-overlay'))) return;
            right.appendChild(c);
        });
        if (card) left.appendChild(card);
        if (hdr) left.appendChild(hdr);
        host.appendChild(left);
        host.appendChild(right);
    })();
    // === Рынок: рельса (котировки + ставки) и правая колонка (калькулятор) ===
    (function() {
        const host = document.getElementById('marketPanelContent');
        if (!host || document.getElementById('mkLeftRail')) return;
        const left = document.createElement('div'); left.id = 'mkLeftRail';
        const right = document.createElement('div'); right.id = 'mkRightCol';
        const hdr = host.querySelector('.header');
        const strip = host.querySelector('#marketQuietStripInner');
        const rates = host.querySelector('.rates-glass-card');
        [...host.children].forEach(function(c) {
            if (c === hdr || c === strip || c === rates) return;
            if (c.classList && (c.classList.contains('aurora-container') || c.classList.contains('noise-overlay'))) return;
            right.appendChild(c);
        });
        if (hdr) left.appendChild(hdr);
        if (strip) left.appendChild(strip);
        if (rates) left.appendChild(rates);
        host.appendChild(left);
        host.appendChild(right);
    })();

    // === Ежемесячный доход: баннер + калькулятор показываем РАЗДЕЛЬНО ===
    // marketPanelContent теперь живёт во вкладке «Ежемесячный доход». Аккордеон
    // больше не сворачивается: баннер и калькулятор видны одновременно как две
    // отдельные карточки. Снимаем интерактивные обработчики сворачивания.
    (function() {
        const acc = document.getElementById('calcAccordion');
        if (!acc) return;
        acc.classList.remove('collapsed');                 // калькулятор всегда раскрыт
        const banner = document.getElementById('ndIncomeBanner');
        if (banner) { banner.onclick = null; banner.removeAttribute('onclick'); banner.style.display = ''; }
        const openHdr = document.getElementById('calcOpenHeader');
        if (openHdr) { openHdr.onclick = null; openHdr.removeAttribute('onclick'); }
    })();
}

function switchTab(tabId) {
    currentTab = tabId;
    
    // Update tab buttons (top bar legacy + bottom bar)
    document.querySelectorAll('.tab-btn-new, .btab, .sb-item[data-tab]').forEach(btn => {
        // Кнопка "Расчёт" остаётся активной когда открыт Портфель,
        // кнопка "Главная" (домик) — когда открыт Дашборд
        var isActive = btn.dataset.tab === tabId ||
                       (btn.dataset.tab === 'calc' && (tabId === 'portfolio' || tabId === 'monthly')) ||
                       (btn.dataset.tab === 'market' && (tabId === 'market-bonds' || tabId === 'market-stocks')) ||
                       (btn.dataset.tab === 'home' && tabId === 'dashboard');
        btn.classList.toggle('active', isActive);
    });

    // Update breadcrumb in top bar
    var crumbMap = { dashboard: 'Главная', calc: 'Параметры', portfolio: 'Портфель', portfolios: 'Портфели', rebalance: 'Ребаланс', market: 'Рынок', 'market-bonds': 'Облигации', 'market-stocks': 'Акции', monthly: 'Ежемесячный доход', backtest: 'Тест портфеля' };
    var crumb = document.getElementById('topBarCrumb');
    var crumbText = document.getElementById('topBarCrumbText');
    if (crumb && crumbText) {
        if (crumbMap[tabId]) {
            crumbText.textContent = crumbMap[tabId];
            crumb.style.display = 'flex';
        } else {
            crumb.style.display = 'none';
        }
    }

    // Показываем кнопку расчёта только на вкладке calc (не на portfolio)
    document.body.classList.toggle('tab-calc', tabId === 'calc');
    // Прозрачный таббар на главной
    document.body.classList.toggle('tab-home', tabId === 'home');
    
    // Update panels
    document.querySelectorAll('.tab-panel, #panel-calc').forEach(panel => {
        panel.classList.remove('active');
    });
    
    const target = document.getElementById('panel-' + tabId);
    if (target) {
        target.classList.add('active');
    }
    
    // Tab-specific init
    if (tabId === 'rebalance') {
        renderAuroraStocksTable();
        renderAuroraOfzList();
        setTimeout(updateRebalanceTabCounts, 300);
    }
    if (tabId === 'monthly') {
        // Анимация ставок + пересчёт дохода (баннер + калькулятор переехали сюда)
        initInterestingAnimations && initInterestingAnimations();
        if (typeof distributeMonthlyInvestment === 'function') {
            setTimeout(function() { try { distributeMonthlyInvestment(); } catch (e) {} }, 60);
        }
    }
    if (tabId === 'portfolio' && window.v3SyncCapHeight) {
        setTimeout(window.v3SyncCapHeight, 80);
    }
    if (tabId === 'dashboard' && window.renderDashboard) {
        window.renderDashboard();
    }

    // Scroll content area to top
    const ca = document.getElementById('contentArea');
    if (ca) ca.scrollTop = 0;
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Override showScreen to work with new tab system
const _origShowScreen = window.showScreen;
window.showScreen = function(screenId) {
    // Map old screen IDs to new tabs
    const tabMap = {
        'screen-home': 'home',
        'screen-app': 'calc',
        'screen-portfolio': 'portfolio',
        'screen-assets': 'rebalance',
        'screen-interesting': 'market',
    };
    
    if (tabMap[screenId]) {
        switchTab(tabMap[screenId]);
        // If portfolio, scroll right pane into view
        if (screenId === 'screen-portfolio') {
            const pane = document.getElementById('portfolioPane');
            if (pane) pane.scrollTop = 0;
        }
        return;
    }
    
    // Overlay screens (vanguard, company)
    if (screenId === 'screen-vanguard') {
        document.getElementById('screen-vanguard').classList.add('active');
        return;
    }
    if (screenId === 'screen-company') {
        const co = document.getElementById('screen-company');
        if (co) { co.classList.add('active'); co.style.display = 'block'; }
        return;
    }
    
    // Fallback for any other screens — ignore
};

// Back from overlays
function closeScreenOverlay(screenId) {
    const el = document.getElementById(screenId);
    if (el) el.classList.remove('active');
}

// Override goHomeScreen
window.goHomeScreen = function() {
    switchTab('home');
    document.body.classList.add('tab-home');
};

// Домик в навигации: на десктопе открывает Дашборд, на мобиле — приветствие.
// Логотип «Madame Solomi'na» в шапке/сайдбаре всегда ведёт на приветствие (switchTab('home')).
window.goHome = function() {
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
        switchTab('dashboard');
    } else {
        switchTab('home');
    }
};

// Override openTerminal/openTerminalOrRegister
window.openTerminal = function() { switchTab('calc'); };
window.openTerminalOrRegister = function() { switchTab('calc'); };
window.startCalculation = function() { switchTab('calc'); };

// Кнопка Расчёт — если портфель уже рассчитан, открывает портфель
// Повторное нажатие на Расчёт возвращает в форму ввода
function switchToCalcOrPortfolio() {
    if (isPortfolioCalculated && currentTab !== 'calc') {
        // Пришли с другой вкладки — показываем портфель
        switchTab('portfolio');
    } else {
        // Уже на расчёте, или портфель не рассчитан — идём на форму
        switchTab('calc');
    }
}

// Override calculateAndShowPortfolio to show right pane
const _origCalc = window.calculateAndShowPortfolio;
window.calculateAndShowPortfolio = function() {
    // 1. Проверка суммы
    const sum = getSumInputValue();
    if (sum < 100000) {
        showLuxuryNotification();
        return;
    }
    // 2. Проверка комиссии — алерт, как при недостаточной сумме
    if (!isFeeSelected) {
        showLuxuryNotification('Комиссия брокера', 'Выберите тариф брокера');
        const feeBlock = document.querySelector('#feeDropdownTrigger');
        if (feeBlock) {
            feeBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            feeBlock.classList.add('shake-error');
            setTimeout(() => feeBlock.classList.remove('shake-error'), 500);
        }
        return;
    }
    // 3. Расчёт
    try {
        draw();
        savePortfolio();
        isPortfolioCalculated = true;

        // Показываем portfolio-content (перемещён в portfolioTabContent при populatePanels)
        const portfolioContent = document.getElementById('portfolio-content');
        if (portfolioContent) portfolioContent.style.display = 'block';

        const tabEmpty = document.getElementById('portfolioTabEmpty');
        if (tabEmpty) tabEmpty.style.display = 'none';

        const tabContent = document.getElementById('portfolioTabContent');
        if (tabContent) tabContent.style.display = 'block';

        // Кнопки действий портфеля
        const portfolioActionBtns = document.getElementById('portfolioActionBtns');
        if (portfolioActionBtns) portfolioActionBtns.style.display = 'flex';

        // Показываем action panel V2 если есть
        const actionPanelV2 = document.getElementById('portfolioActionPanelV2');
        if (actionPanelV2) actionPanelV2.style.display = 'flex';

        // Синхронизируем данные в новый дизайн V2
        if (typeof syncPortfolioDataToV2 === 'function') syncPortfolioDataToV2();

        // Переключаемся на страницу "К покупке"
        if (typeof switchPortfolioPage === 'function') switchPortfolioPage('buy');

        // Управляем переключателем Денежный поток / Растущая часть
        const slider = document.getElementById('ratioSlider');
        const currentBondPct = slider ? parseInt(slider.value) : 50;
        const tabSwitcher = document.getElementById('portfolioTabSwitcher');
        if (currentBondPct === 0) {
            if (tabSwitcher) tabSwitcher.style.display = 'none';
            if (typeof switchPortfolioContentTab === 'function') switchPortfolioContentTab('stocks');
        } else if (currentBondPct === 100) {
            if (tabSwitcher) tabSwitcher.style.display = 'none';
            if (typeof switchPortfolioContentTab === 'function') switchPortfolioContentTab('bonds');
        } else {
            if (tabSwitcher) tabSwitcher.style.display = '';
            if (typeof switchPortfolioContentTab === 'function') switchPortfolioContentTab('bonds');
        }

        // Активируем кнопку Тест портфеля и обновляем инфо
        btUpdateRunBtn();
        const assets = btCollectFromPortfolio();
        const sumEl = document.getElementById('btCalcSummary');
        if (sumEl) sumEl.textContent = `${assets.bonds.length + assets.stocks.length} позиций: ${assets.bonds.length} ОФЗ, ${assets.stocks.length} акций.`;

        // Переходим на вкладку Портфель
        switchTab('portfolio');
        // Контент таблиц только что отрисован — пересчитываем геометрию ещё раз
        setTimeout(function() {
            window.pfSyncLeftEdge && window.pfSyncLeftEdge();
            window.pfSyncLeftWidth && window.pfSyncLeftWidth();
            window.pfCenterTables && window.pfCenterTables();
            window.pfFitNumbers && window.pfFitNumbers();
        }, 60);

        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
    } catch(e) {
        console.error('Error in calculateAndShowPortfolio:', e);
    }
};

// ===== TOP SEARCH (ARC-style floating palette с живыми результатами) =====
let _searchResults = [];   // текущий набор совпадений
let _searchActive = -1;    // индекс подсвеченного результата (для стрелок)

function openTopSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    const inp = document.getElementById('searchInput');
    if (inp) {
        inp.value = '';
        setTimeout(() => inp.focus(), 60);
    }
    renderSearchResults('');
}

function closeTopSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.classList.remove('open');
    const box = document.getElementById('searchResults');
    if (box) box.classList.remove('show');
    _searchResults = [];
    _searchActive = -1;
}

// Рендер живого списка под полем ввода
function renderSearchResults(query) {
    const box = document.getElementById('searchResults');
    if (!box) return;

    query = (query || '').trim();
    if (query.length < 1) {
        _searchResults = [];
        _searchActive = -1;
        box.classList.remove('show');
        box.innerHTML = '';
        return;
    }

    _searchResults = (typeof searchAssets === 'function') ? searchAssets(query).slice(0, 8) : [];
    _searchActive = _searchResults.length ? 0 : -1;
    box.classList.add('show');

    if (!_searchResults.length) {
        box.innerHTML = '<div class="search-res-empty">Ничего не найдено по «' +
            query.replace(/</g, '&lt;') + '»</div>';
        return;
    }

    const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg>';

    let html = _searchResults.map((r, i) => {
        const isBond = r.type === 'Облигация';
        const badge = (r.t || '').slice(0, 4).toUpperCase();
        const fav = searchItemFav(r);
        return '<div class="search-res-item' + (i === _searchActive ? ' active' : '') +
            '" data-idx="' + i + '" onmouseenter="setSearchActive(' + i + ')" onclick="chooseSearchResult(' + i + ')">' +
            '<div class="search-res-badge' + (isBond ? ' bond' : '') + '">' + badge + '</div>' +
            '<div class="search-res-main">' +
                '<div class="search-res-ticker">' + (r.t || '') + '</div>' +
                '<div class="search-res-name">' + (r.n || '') + '</div>' +
            '</div>' +
            '<div class="search-res-type">' + r.type + '</div>' +
            '<button class="search-res-fav' + (fav ? ' active' : '') + '" type="button" data-idx="' + i +
                '" title="' + (fav ? 'Убрать из избранного' : 'В избранное') +
                '" onclick="toggleSearchFav(' + i + ', event)">' + STAR_SVG + '</button>' +
        '</div>';
    }).join('');
    html += '<div class="search-res-hint"><kbd>↑↓</kbd> выбрать · <kbd>↵</kbd> открыть · <kbd>esc</kbd> закрыть</div>';
    box.innerHTML = html;
}

// Проверить, в избранном ли элемент (акции → stk_fav_v1, облигации → bnd_fav_v1 по ISIN)
function searchItemFav(item) {
    if (!item || !item.t) return false;
    if (item.type === 'Облигация') {
        return (typeof window.bndGetFavorites === 'function') &&
               window.bndGetFavorites().indexOf(item.t) !== -1;
    }
    return (typeof window.stkGetFavorites === 'function') &&
           window.stkGetFavorites().indexOf(item.t) !== -1;
}

// Добавить/убрать из избранного прямо из выпадающей карточки
function toggleSearchFav(i, ev) {
    if (ev) ev.stopPropagation();
    const item = _searchResults[i];
    if (!item || !item.t) return;
    let nowFav = false;
    if (item.type === 'Облигация') {
        if (typeof window.bndToggleFav === 'function') nowFav = window.bndToggleFav(item.t);
    } else {
        if (typeof window.stkToggleFav === 'function') nowFav = window.stkToggleFav(item.t);
    }
    const btn = document.querySelector('#searchResults .search-res-fav[data-idx="' + i + '"]');
    if (btn) {
        btn.classList.toggle('active', nowFav);
        btn.title = nowFav ? 'Убрать из избранного' : 'В избранное';
    }
}

function setSearchActive(i) {
    _searchActive = i;
    document.querySelectorAll('#searchResults .search-res-item').forEach(el => {
        el.classList.toggle('active', +el.dataset.idx === i);
    });
}

function chooseSearchResult(i) {
    const item = _searchResults[i];
    if (!item) return;
    closeTopSearch();

    if (item.type === 'Облигация') {
        // Боковая панель об облигации
        if (typeof openBondDetail === 'function') openBondDetail(item);
        else openCompanyPage(item, item.t || '');
        return;
    }

    // Акция — боковая панель о компании
    if (typeof openStockDetail === 'function') {
        openStockDetail(item.t, searchEchelonOf(item.t));
    } else {
        openCompanyPage(item, item.t || '');
    }
}

// Определить эшелон (1..4) тикера по таблице эшелонов — для цвета бейджа в панели
function searchEchelonOf(ticker) {
    if (typeof echelonTableData === 'undefined' || !echelonTableData) return 1;
    for (let i = 0; i < echelonTableData.length; i++) {
        if (echelonTableData[i].some(it => it.t === ticker)) return i + 1;
    }
    return 1;
}

// Живой поиск по мере ввода
function handleTopSearchInput(event) {
    renderSearchResults(event.target.value);
}

// Навигация клавиатурой
function handleTopSearchKeydown(event) {
    const key = event.key;
    if (key === 'Escape') {
        event.preventDefault();
        closeTopSearch();
        return;
    }
    if (key === 'ArrowDown') {
        event.preventDefault();
        if (_searchResults.length) setSearchActive((_searchActive + 1) % _searchResults.length);
        return;
    }
    if (key === 'ArrowUp') {
        event.preventDefault();
        if (_searchResults.length) setSearchActive((_searchActive - 1 + _searchResults.length) % _searchResults.length);
        return;
    }
    if (key === 'Enter') {
        event.preventDefault();
        const query = event.target.value.trim();
        if (_searchActive >= 0 && _searchResults[_searchActive]) {
            chooseSearchResult(_searchActive);
        } else if (query) {
            closeTopSearch();
            performSearch(query);
        }
    }
}

// legacy: нижняя строка поиска (tickerSearchInput)
function handleSearchKeyup(event) {
    if (event.keyCode === 13) {
        const query = event.target.value.trim();
        if (query) performSearch(query);
    }
}

// legacy compat
function handleTopSearchKeyup(event) {}
window.expandSearch = openTopSearch;
window.collapseSearch = closeTopSearch;
window.setSearchActive = setSearchActive;
window.chooseSearchResult = chooseSearchResult;
window.searchItemFav = searchItemFav;
window.toggleSearchFav = toggleSearchFav;
window.handleTopSearchInput = handleTopSearchInput;
window.handleTopSearchKeydown = handleTopSearchKeydown;

// Глобальный хоткей: Cmd/Ctrl+T (как просили) и Cmd/Ctrl+K (надёжный фолбэк —
// Cmd+T часто перехватывается браузером под «новую вкладку») открывают/закрывают поиск.
if (!window._searchHotkeyBound) {
    window._searchHotkeyBound = true;
    document.addEventListener('keydown', function (e) {
        if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
        const k = (e.key || '').toLowerCase();
        if (k !== 't' && k !== 'k') return;
        e.preventDefault();
        const overlay = document.getElementById('searchOverlay');
        if (overlay && overlay.classList.contains('open')) closeTopSearch();
        else openTopSearch();
    });
}

// Обновляем счётчики позиций в переключателе ОФЗ/Акции
function updateRebalanceTabCounts() {
    var ofzItems = document.querySelectorAll('#ofz-aurora-list .ofz-aurora-item');
    var ofzCount = ofzItems.length;
    var stocksRows = document.querySelectorAll('.stocks-table-row');
    var stocksCount = 0;
    stocksRows.forEach(function(row) {
        row.querySelectorAll('.stocks-cell:not(:empty)').forEach(function(){ stocksCount++; });
    });
    var ofzEl = document.getElementById('rebCountOfz');
    var stEl = document.getElementById('rebCountStocks');
    if (ofzEl) ofzEl.textContent = ofzCount > 0 ? ofzCount : '';
    if (stEl) stEl.textContent = stocksCount > 0 ? stocksCount : '';
}


// ===== INCOME CHART VIEW =====
function incomeShowChart() {
    var wrap = document.querySelector('.income-cal-wrap');
    var grid = document.getElementById('calc-results-list');
    var steppers = document.querySelector('.income-cal-steppers');
    var btn = document.querySelector('.income-cal-chart-btn');
    var footer = document.getElementById('calc-results-footer');
    var chartView = document.getElementById('incomeChartView');
    if (!chartView) return;

    // Скрываем основной вид
    if (grid) grid.style.display = 'none';
    if (steppers) steppers.style.display = 'none';
    if (btn) btn.style.display = 'none';
    if (footer) footer.style.display = 'none';

    // Рендерим тёмный список
    var darkList = document.getElementById('calc-results-list-dark');
    var darkFooter = document.getElementById('calc-results-footer-dark');
    if (darkList && darkFooter) {
        // Копируем текущий HTML из основного calc-results-list
        // но нужно перерендерить в тёмном стиле
        renderIncomeDarkList(darkList, darkFooter);
    }

    chartView.style.display = 'block';
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function incomeHideChart() {
    var grid = document.getElementById('calc-results-list');
    var steppers = document.querySelector('.income-cal-steppers');
    var btn = document.querySelector('.income-cal-chart-btn');
    var footer = document.getElementById('calc-results-footer');
    var chartView = document.getElementById('incomeChartView');

    if (chartView) chartView.style.display = 'none';
    if (grid) grid.style.display = '';
    if (steppers) steppers.style.display = '';
    if (btn) btn.style.display = '';
    if (footer) footer.style.display = '';

    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function renderIncomeDarkList(container, footer) {
    var customTax = 0;
    var taxBtns = document.querySelectorAll('.tax-segment');
    taxBtns.forEach(function(btn) {
        if (btn.classList.contains('active')) {
            customTax = parseFloat(btn.dataset.tax || 0);
        }
    });

    var html = '';
    var total = 0;

    allScheduledPayments.forEach(function(payment) {
        var qty = bondQtyMap[payment.paymentTicker] || 0;
        if (!qty) {
            var parentBond = monthlyIncomeBonds.find(function(b) { return b.n === payment.displayName; });
            if (parentBond) qty = bondQtyMap[parentBond.t] || 0;
        }
        var net = (payment.staticCouponVal * qty) * (1 - customTax);
        total += net;
        // Формат даты: DD.MM из dateStr вида "MM.YY"
        var parts = payment.dateStr.split('.');
        var mm = parts[0] || '01';
        // Статичная дата купона из allScheduledPayments — берём реальный день если есть, иначе 15
        var dd = payment.couponDay ? String(payment.couponDay).padStart(2,'0') : '15';
        var dateLabel = dd + '.' + mm;
        // Убираем дефис из названия ОФЗ: "ОФЗ-26238" → "ОФЗ 26238"
        var bondName = (payment.displayName || '').replace(/^(ОФЗ)-/, '$1 ');
        var sumStr = qty > 0 ? ('+' + Math.round(net).toLocaleString('ru-RU') + ' ₽') : '—';

        var qtyBadge = qty > 0
            ? '<span style="display:inline-block;background:rgba(255,255,255,0.08);border-radius:6px;padding:2px 8px;font-family:monospace;font-size:12px;font-weight:600;color:rgba(255,255,255,0.65);">' + qty + '</span>'
            : '<span style="color:rgba(255,255,255,0.2);font-family:monospace;font-size:12px;">—</span>';
        html += '<div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);gap:9px;">'
            + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:600;color:rgba(255,255,255,0.45);letter-spacing:0.01em;flex-shrink:0;min-width:58px;">' + dateLabel + '</span>'
            + '<span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + bondName + '</span>'
            + '<span style="flex-shrink:0;margin-left:8px;">' + qtyBadge + '</span>'
            + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:13px;font-weight:700;color:' + (qty > 0 ? '#10B981' : 'rgba(255,255,255,0.2)') + ';flex-shrink:0;min-width:72px;text-align:right;">' + sumStr + '</span>'
            + '</div>';
    });

    var hdrRow = '<div style="display:flex;align-items:center;padding:8px 14px 7px;border-bottom:1px solid rgba(255,255,255,0.08);gap:9px;">'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex-shrink:0;min-width:58px;">ДАТА</span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex:1;">ОБЛИГАЦИЯ</span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex-shrink:0;margin-left:8px;min-width:40px;text-align:right;">ШТ</span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex-shrink:0;min-width:80px;text-align:right;">СУММА</span>'
        + '</div>';
    container.innerHTML = hdrRow + (html || '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.2);font-size:12px;">Введите количество</div>');

    if (total > 0) {
        var monthly = Math.round(total / 12);
        var investInput = document.getElementById('monthlySumInput');
        var investSum = investInput ? (parseFloat(investInput.value.replace(/\s/g,'')) || 0) : 0;
        var pct = investSum > 0 ? ((total / investSum) * 100).toFixed(1) : '0.0';
        var rowStyle = 'display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        var lblStyle = 'font-family:Inter,sans-serif;font-size:11px;color:rgba(255,255,255,0.35);';
        var valStyleGreen = 'font-family:monospace;font-size:14px;font-weight:700;color:#10B981;letter-spacing:-0.02em;';
        var valStyleNeutral = 'font-family:monospace;font-size:14px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:-0.02em;';
        footer.style.cssText = '';
        footer.innerHTML =
            '<div style="' + rowStyle + '">'
            + '<span style="' + lblStyle + '">Итого за год</span>'
            + '<span style="' + valStyleNeutral + '">' + Math.round(total).toLocaleString('ru-RU') + ' ₽</span>'
            + '</div>'
            + '<div style="' + rowStyle + '">'
            + '<span style="' + lblStyle + '">Среднемесячный доход</span>'
            + '<span style="' + valStyleGreen + '">~' + monthly.toLocaleString('ru-RU') + ' ₽</span>'
            + '</div>'
            + '<div style="' + rowStyle.replace('border-bottom:1px solid rgba(255,255,255,0.05);','') + '">'
            + '<span style="' + lblStyle + '">Доходность годовая</span>'
            + '<span style="' + valStyleGreen + '">' + pct + '%</span>'
            + '</div>';
    } else {
        footer.innerHTML = '';
    }
}
// ===== END INCOME CHART VIEW =====

// ===== BACKTEST MODULE =====

const btState = {
    source: 'calc',
    tickers: [],
    bulkOpen: false,
};

// --- UI helpers ---

function btSetSource(src) {
    btState.source = src;
    document.getElementById('btSourceCalc').classList.toggle('active', src === 'calc');
    document.getElementById('btSourceManual').classList.toggle('active', src === 'manual');
    document.getElementById('btSourceCalcInfo').style.display = src === 'calc' ? 'block' : 'none';
    document.getElementById('btSourceManualBlock').style.display = src === 'manual' ? 'block' : 'none';
    btUpdateRunBtn();
}

function btToggleBulk() {
    btState.bulkOpen = !btState.bulkOpen;
    document.getElementById('btBulkBlock').style.display = btState.bulkOpen ? 'block' : 'none';
    var chev = document.getElementById('btBulkChev');
    if (chev) chev.style.transform = btState.bulkOpen ? 'rotate(180deg)' : '';
}

// Текущая дата теста (YYYY-MM-DD) или ''
function btCurrentDate() {
    var el = document.getElementById('btDateInput');
    return el && el.value ? el.value : '';
}

function btAddTicker() {
    var tickerEl = document.getElementById('btTickerInput');
    var ticker = (tickerEl.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!ticker) { tickerEl.focus(); return; }
    if (!btState.tickers.find(function(t) { return t.t === ticker; })) {
        var type = ticker.startsWith('SU') ? 'bond' : 'stock';
        var item = { t: ticker, type: type, price: 0, qty: 0, status: 'loading' };
        btState.tickers.push(item);
        btFetchTickerPrice(item);   // async: цена на дату теста → пересчёт количества
    }
    tickerEl.value = '';
    tickerEl.focus();
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

function btApplyBulk() {
    var ta = document.getElementById('btBulkInput');
    var lines = (ta.value || '').trim().split('\n');
    var added = [];
    lines.forEach(function(line) {
        var ticker = line.trim().split(/\s+/)[0];
        if (!ticker) return;
        ticker = ticker.toUpperCase();
        if (btState.tickers.find(function(t) { return t.t === ticker; })) return;
        var type = ticker.startsWith('SU') ? 'bond' : 'stock';
        var item = { t: ticker, type: type, price: 0, qty: 0, status: 'loading' };
        btState.tickers.push(item);
        added.push(item);
    });
    ta.value = '';
    if (btState.bulkOpen) btToggleBulk();
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    added.forEach(function(item) { btFetchTickerPrice(item); });
    if (added.length > 0 && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
    lsScheduleSave();
}

function btRemoveTicker(ticker) {
    btState.tickers = btState.tickers.filter(function(t) { return t.t !== ticker; });
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

// Очистить весь список добавленных бумаг разом
function btClearTickers() {
    if (!btState.tickers.length) return;
    btState.tickers = [];
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

// Загрузка цены бумаги на дату теста (для авто-расчёта количества)
async function btFetchTickerPrice(item) {
    var dateStr = btCurrentDate();
    if (!dateStr) { item.status = 'nodate'; item.price = 0; btRenderTickerList(); return; }
    item.status = 'loading';
    item.priceDate = dateStr;
    var p = item.type === 'bond'
        ? await btGetBondPriceSafe(item.t, dateStr)
        : await btGetStockPriceSafe(item.t, dateStr);
    if (btCurrentDate() !== dateStr) return;   // дата сменилась — результат устарел
    if (p > 0) { item.price = p; item.status = 'ok'; }
    else { item.price = 0; item.status = 'error'; }
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

// Догрузить недостающие цены на текущую дату (перед запуском теста)
async function btEnsureManualPrices() {
    var dateStr = btCurrentDate();
    var pending = btState.tickers.filter(function(t) { return t.status !== 'ok' || t.priceDate !== dateStr; });
    await Promise.all(pending.map(function(t) { return btFetchTickerPrice(t); }));
    btRecomputeManualQty();
}

// Капитал делится поровну: каждая бумага = капитал / N, количество = floor(доля / цена)
function btRecomputeManualQty() {
    var cap = btGetManualCapital();
    var n = btState.tickers.length;
    var per = (cap > 0 && n > 0) ? cap / n : 0;
    btState.tickers.forEach(function(t) {
        t.qty = (t.status === 'ok' && t.price > 0 && per > 0) ? Math.floor(per / t.price) : 0;
    });
}

// Склонение «бумага / бумаги / бумаг»
function btPluralPapers(n) {
    var d = n % 10, dd = n % 100;
    if (d === 1 && dd !== 11) return n + ' бумага';
    if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return n + ' бумаги';
    return n + ' бумаг';
}

// Цена за штуку: десятичные для дешёвых бумаг, точки-разделители для дорогих
function btPriceStr(p) {
    if (!(p > 0)) return '—';
    return p < 100 ? (p.toFixed(2) + ' ₽') : btFmtRub(p);
}

function btRenderTickerList() {
    var container = document.getElementById('btTickerList');
    var countEl = document.getElementById('btManualCount');
    // Раздел «Состав портфеля» виден только когда есть добавленные бумаги
    var comp = document.getElementById('btManualComposition');
    if (comp) comp.style.display = btState.tickers.length ? 'block' : 'none';
    if (countEl) countEl.textContent = btState.tickers.length ? btPluralPapers(btState.tickers.length) : 'пусто';
    if (!container) return;
    if (btState.tickers.length === 0) {
        container.innerHTML = '';
        return;
    }
    var hasCap = btGetManualCapital() > 0;
    var html = '';
    btState.tickers.forEach(function(item) {
        var badge = item.type === 'bond'
            ? '<span class="bt-tr-badge bond">ОФЗ</span>'
            : '<span class="bt-tr-badge stock">Акция</span>';
        var calc;
        if (item.status === 'loading') {
            calc = '<span class="bt-tr-muted">загружаем цену…</span>';
        } else if (item.status === 'error') {
            calc = '<span class="bt-tr-err">нет цены на эту дату</span>';
        } else if (item.status === 'nodate') {
            calc = '<span class="bt-tr-muted">укажите дату оценки</span>';
        } else if (!hasCap) {
            calc = '<span class="bt-tr-muted">' + btPriceStr(item.price) + ' за шт. · укажите капитал</span>';
        } else if (item.qty > 0) {
            calc = '<b class="bt-tr-qty">' + item.qty + ' шт.</b>'
                 + '<span class="bt-tr-sep">×</span>' + btPriceStr(item.price)
                 + '<span class="bt-tr-sep">≈</span><span class="bt-tr-sub">' + btFmtRub(item.qty * item.price) + '</span>';
        } else {
            calc = '<span class="bt-tr-muted">' + btPriceStr(item.price) + ' за шт. · мало капитала</span>';
        }
        html += '<div class="bt-tr">'
            + '<div class="bt-tr-main">'
            +   '<div class="bt-tr-top"><span class="bt-tr-tk">' + item.t + '</span>' + badge + '</div>'
            +   '<div class="bt-tr-calc">' + calc + '</div>'
            + '</div>'
            + '<button class="bt-tr-del" onclick="btRemoveTicker(\'' + item.t + '\')" aria-label="Удалить">'
            +   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
            + '</button>'
            + '</div>';
    });
    container.innerHTML = html;
}

function btUpdateRunBtn() {
    var btn = document.getElementById('btRunBtn');
    if (!btn) return;
    var dateEl = document.getElementById('btDateInput');
    var dateOk = !!(dateEl && dateEl.value);
    var portfolioOk = btState.source === 'calc'
        ? isPortfolioCalculated
        : (btState.tickers.length > 0 && btGetManualCapital() > 0);
    btn.disabled = !(dateOk && portfolioOk);
    // Подсказку под кнопкой показываем только пока тест недоступен
    var note = document.getElementById('btRunNote');
    if (note) note.classList.toggle('is-hidden', !btn.disabled);
    btSyncCalcInfo();
}

// Баннер «Из расчёта»: когда портфель уже рассчитан, переключаем его в
// состояние «готов» — прячем описание и кнопку «Перейти к расчёту»,
// чтобы не путать пользователя активной кнопкой.
function btSyncCalcInfo() {
    var box = document.getElementById('btCalcEmpty');
    if (!box) return;
    var ready = (btState.source === 'calc') && !!isPortfolioCalculated;
    box.classList.toggle('is-ready', ready);
    var icon = document.getElementById('btCalcIcon');
    if (icon) {
        icon.innerHTML = ready
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
    }
}

function onBtDateChange() {
    if (isPortfolioCalculated) {
        var assets = btCollectFromPortfolio();
        var total = assets.bonds.length + assets.stocks.length;
        var sumEl = document.getElementById('btCalcSummary');
        if (sumEl) sumEl.textContent = total + ' позиций: ' + assets.bonds.length + ' ОФЗ, ' + assets.stocks.length + ' акций.';
    }
    // Ручной режим: цена покупки привязана к дате — пересчитываем при её смене
    if (btState.source === 'manual' && btState.tickers.length > 0) {
        btState.tickers.forEach(function(t) { t.status = 'loading'; });
        btRenderTickerList();
        btState.tickers.forEach(function(t) { btFetchTickerPrice(t); });
    }
    btUpdateRunBtn();
}

// --- Collect assets from calculated portfolio ---

function btCollectFromPortfolio() {
    var bonds = [];
    var stocks = [];

    // Облигации — из _bondCalculationsV2
    if (window._bondCalculationsV2 && window._bondCalculationsV2.length > 0) {
        window._bondCalculationsV2.forEach(function(b) {
            if (b.qty > 0) {
                bonds.push({ t: b.t, n: b.n || b.t, p: b.price || b.p || 0, qty: b.qty });
            }
        });
    }

    // Акции — из echelons
    if (typeof echelons !== 'undefined') {
        var sum = (typeof getSumInputValue === 'function') ? getSumInputValue() : 0;
        var slider = document.getElementById('ratioSlider');
        var bondPct = slider ? parseInt(slider.value) : 50;
        var stockBudget = sum * (1 - bondPct / 100);
        var fee = (typeof brokerFee !== 'undefined') ? brokerFee : 0.0005;

        echelons.forEach(function(echelon) {
            if (!echelon.assets || echelon.assets.length === 0) return;
            var echelonBudget = stockBudget * echelon.weight;
            var perAsset = echelonBudget / echelon.assets.length;
            echelon.assets.forEach(function(asset) {
                var fullCost = asset.p * (1 + fee);
                var qty = fullCost > 0 ? Math.floor(perAsset / fullCost) : 0;
                if (qty > 0) {
                    stocks.push({ t: asset.t, n: asset.n || asset.t, p: asset.p, qty: qty });
                }
            });
        });
    }

    return { bonds: bonds, stocks: stocks };
}

// --- Main backtest run ---

async function runBacktest() {
    var dateInput = document.getElementById('btDateInput');
    if (!dateInput || !dateInput.value) return;
    var testDate = dateInput.value;

    var assets;
    if (btState.source === 'calc') {
        if (!isPortfolioCalculated) {
            showLuxuryNotification('Портфель не рассчитан', 'Перейдите в Расчёт и нажмите Рассчитать');
            return;
        }
        assets = btCollectFromPortfolio();
        if (assets.bonds.length === 0 && assets.stocks.length === 0) {
            showBtError('Портфель пуст', 'Рассчитайте портфель в вкладке Расчёт.');
            return;
        }
    } else {
        if (btState.tickers.length === 0) {
            showLuxuryNotification('Нет тикеров', 'Добавьте хотя бы один тикер');
            return;
        }
        assets = {
            bonds: btState.tickers
                .filter(function(t) { return t.type === 'bond'; })
                .map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
            stocks: btState.tickers
                .filter(function(t) { return t.type === 'stock'; })
                .map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
        };
    }

    showBtLoading(testDate);
    try {
        var results = await btFetchPrices(testDate, assets);
        renderBtResults(results, testDate);
    } catch(e) {
        console.error('Backtest error:', e);
        showBtError('Ошибка загрузки', 'Не удалось получить данные с MOEX для даты ' + btFormatDate(testDate) + '.');
    }
}

// --- MOEX price fetching ---

async function btFetchPrices(dateStr, assets) {
    var results = {
        date: dateStr,
        bonds: [],
        stocks: [],
        totalBuyPrice: 0,
        totalTestPrice: 0,
    };

    for (var i = 0; i < assets.bonds.length; i++) {
        var bond = assets.bonds[i];
        try {
            var price = await btGetBondPrice(bond.t, dateStr);
            var buyTotal = bond.p > 0 ? bond.p * bond.qty : 0;
            var testTotal = price > 0 ? price * bond.qty : 0;
            results.bonds.push({
                t: bond.t, n: bond.n, qty: bond.qty,
                buyPrice: bond.p, testPrice: price,
                buyTotal: buyTotal, testTotal: testTotal,
                pnl: buyTotal > 0 && testTotal > 0 ? testTotal - buyTotal : null,
                pnlPct: buyTotal > 0 && testTotal > 0
                    ? ((testTotal - buyTotal) / buyTotal * 100).toFixed(1) : null,
            });
            results.totalBuyPrice += buyTotal;
            results.totalTestPrice += testTotal;
        } catch(e) {
            results.bonds.push({ t: bond.t, n: bond.n, qty: bond.qty,
                buyPrice: 0, testPrice: 0, buyTotal: 0, testTotal: 0,
                pnl: null, pnlPct: null, error: true });
        }
    }

    for (var j = 0; j < assets.stocks.length; j++) {
        var stock = assets.stocks[j];
        try {
            var sPrice = await btGetStockPrice(stock.t, dateStr);
            var sBuyTotal = stock.p > 0 ? stock.p * stock.qty : 0;
            var sTestTotal = sPrice > 0 ? sPrice * stock.qty : 0;
            results.stocks.push({
                t: stock.t, n: stock.n, qty: stock.qty,
                buyPrice: stock.p, testPrice: sPrice,
                buyTotal: sBuyTotal, testTotal: sTestTotal,
                pnl: sBuyTotal > 0 && sTestTotal > 0 ? sTestTotal - sBuyTotal : null,
                pnlPct: sBuyTotal > 0 && sTestTotal > 0
                    ? ((sTestTotal - sBuyTotal) / sBuyTotal * 100).toFixed(1) : null,
            });
            results.totalBuyPrice += sBuyTotal;
            results.totalTestPrice += sTestTotal;
        } catch(e) {
            results.stocks.push({ t: stock.t, n: stock.n, qty: stock.qty,
                buyPrice: 0, testPrice: 0, buyTotal: 0, testTotal: 0,
                pnl: null, pnlPct: null, error: true });
        }
    }

    var hasBuy = results.totalBuyPrice > 0;
    var hasTest = results.totalTestPrice > 0;
    results.totalPnl = hasBuy && hasTest ? results.totalTestPrice - results.totalBuyPrice : null;
    results.totalPnlPct = hasBuy && hasTest
        ? ((results.totalTestPrice - results.totalBuyPrice) / results.totalBuyPrice * 100).toFixed(1)
        : null;
    return results;
}

async function btGetBondPrice(ticker, dateStr) {
    var fromDate = new Date(dateStr);
    fromDate.setDate(fromDate.getDate() - 7);
    var from = fromDate.toISOString().split('T')[0];

    var url = MOEX_PROXY + '?path=' + encodeURIComponent(
        '/iss/history/engines/stock/markets/bonds/securities/' + ticker +
        '.json?from=' + from + '&till=' + dateStr + '&iss.meta=off&iss.only=history&sort_order=desc&limit=1'
    );
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (!data.history || !data.history.data || data.history.data.length === 0) return 0;
    var cols = data.history.columns;
    var row = data.history.data[0];
    var closeIdx = cols.indexOf('CLOSE');
    var price = closeIdx >= 0 ? row[closeIdx] : 0;
    // Цена облигации в % от номинала → умножаем на 10 (номинал 1000 руб)
    return price > 0 ? price * 10 : 0;
}

// НКД (накопленный купонный доход) облигации на дату — колонка ACCINT в истории MOEX.
// Цена закрытия (CLOSE) приходит «чистой» (без НКД), поэтому НКД тянем отдельно.
async function btGetBondNkd(ticker, dateStr) {
    var fromDate = new Date(dateStr);
    fromDate.setDate(fromDate.getDate() - 7);
    var from = fromDate.toISOString().split('T')[0];

    var url = MOEX_PROXY + '?path=' + encodeURIComponent(
        '/iss/history/engines/stock/markets/bonds/securities/' + ticker +
        '.json?from=' + from + '&till=' + dateStr + '&iss.meta=off&iss.only=history&sort_order=desc&limit=1'
    );
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (!data.history || !data.history.data || data.history.data.length === 0) return -1;
    var cols = data.history.columns;
    var row = data.history.data[0];
    var idx = cols.indexOf('ACCINT');
    if (idx < 0) return -1;
    var nkd = row[idx];
    return (nkd != null && nkd !== '' && isFinite(nkd)) ? +nkd : -1;
}
async function btGetBondNkdSafe(ticker, dateStr) {
    try {
        return await btGetBondNkd(ticker, dateStr);
    } catch (e) {
        console.warn('[BT] Bond NKD fetch failed for ' + ticker + ':', e.message);
        return -1; // sentinel: failed
    }
}

async function btGetStockPrice(ticker, dateStr) {
    var fromDate = new Date(dateStr);
    fromDate.setDate(fromDate.getDate() - 7);
    var from = fromDate.toISOString().split('T')[0];

    var url = MOEX_PROXY + '?path=' + encodeURIComponent(
        '/iss/history/engines/stock/markets/shares/securities/' + ticker +
        '.json?from=' + from + '&till=' + dateStr + '&iss.meta=off&iss.only=history&sort_order=desc&limit=1'
    );
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (!data.history || !data.history.data || data.history.data.length === 0) return 0;
    var cols = data.history.columns;
    var row = data.history.data[0];
    var closeIdx = cols.indexOf('CLOSE');
    return closeIdx >= 0 ? (row[closeIdx] || 0) : 0;
}

// --- UI: loading / error / results ---

function showBtLoading(dateStr) {
    var el = document.getElementById('btResults');
    if (!el) return;
    el.innerHTML = '<div class="bt-loading">'
        + '<div class="bt-spinner"></div>'
        + '<div class="bt-loading-text">Загружаем цены с MOEX...</div>'
        + '<div class="bt-loading-sub">Исторические данные на ' + btFormatDate(dateStr) + '</div>'
        + '</div>';
}

function showBtError(title, msg) {
    if (typeof btExitResultsMode === 'function') btExitResultsMode();
    var el = document.getElementById('btResults');
    if (!el) return;
    el.innerHTML = '<div class="bt-error-card">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/>'
        + '<line x1="12" y1="8" x2="12" y2="12"/>'
        + '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        + '<div><div class="bt-error-title">' + title + '</div>'
        + '<div class="bt-error-msg">' + msg + '</div></div>'
        + '</div>';
}

function btFormatDate(dateStr) {
    try {
        var d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch(e) { return dateStr; }
}

function btFmtRub(v) {
    return Math.round(v).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';
}

// Левая карточка-«шапка» с финальными данными теста
function btRenderSummary(results, dateStr) {
    var el = document.getElementById('btResultSummary');
    if (!el) return;
    window._btLastResults = results;
    window._btLastDate = dateStr;
    var totalPnl = results.totalPnl;
    var pct = results.totalPnlPct !== null ? parseFloat(results.totalPnlPct) : null;
    var hasPnl = totalPnl !== null;
    var cls = hasPnl ? (totalPnl >= 0 ? 'pos' : 'neg') : '';
    var pnlSign = hasPnl && totalPnl >= 0 ? '+' : '';
    var pctSign = pct !== null && pct >= 0 ? '+' : '';
    var arrow = hasPnl ? (totalPnl >= 0
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>') : '';
    var positions = results.bonds.length + results.stocks.length;

    var h = '';
    h += '<div class="bt-res-sum-top">';
    h += '<span class="bt-res-sum-eyebrow">Результат теста</span>';
    h += '<span class="bt-res-date-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + btFormatDate(dateStr) + '</span>';
    h += '</div>';
    h += '<div class="bt-res-sum-label">Стоимость портфеля сейчас</div>';
    h += '<div class="bt-res-sum-valrow">';
    h += '<div class="bt-res-sum-value">' + (results.totalTestPrice > 0 ? btFmtRub(results.totalTestPrice) : '—') + '</div>';
    if (pct !== null) {
        h += '<span class="bt-res-pct-badge ' + cls + '">' + arrow + pctSign + pct + '%</span>';
    }
    h += '</div>';
    h += '<div class="bt-res-sum-stats">';
    h += '<div class="bt-res-stat"><span>Стартовая сумма</span><b>' + (results.totalBuyPrice > 0 ? btFmtRub(results.totalBuyPrice) : '—') + '</b></div>';
    h += '<div class="bt-res-stat"><span>P&L</span><b class="' + cls + '">' + (hasPnl ? pnlSign + btFmtRub(totalPnl) : '—') + '</b></div>';
    h += '</div>';
    h += '<button type="button" class="bt-imoex-btn" id="btImoexBtn" onclick="btCompareImoex()">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
        + 'Сравнить с IMOEX</button>';
    el.innerHTML = h;
    el.style.display = 'block';
}

// Переключение раскладки в режим результатов (карточка слева + таблица справа)
function btEnterResultsMode() {
    var wrap = document.querySelector('#panel-backtest .bt2-wrap');
    if (wrap) wrap.classList.add('bt-results-mode');
}
function btExitResultsMode() {
    var wrap = document.querySelector('#panel-backtest .bt2-wrap');
    if (wrap) wrap.classList.remove('bt-results-mode');
    var sum = document.getElementById('btResultSummary');
    if (sum) { sum.style.display = 'none'; sum.innerHTML = ''; }
    var res = document.getElementById('btResults');
    if (res) res.innerHTML = '';
    _btImoexOpen = false;
}

// ============================================================
// СРАВНЕНИЕ С ИНДЕКСОМ МОСБИРЖИ (IMOEX)
// ============================================================
var _btImoexOpen = false;

function btCompareImoex() {
    var btn = document.getElementById('btImoexBtn');
    var res = document.getElementById('btResults');
    if (!res) return;
    var panel = document.getElementById('btImoexPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'btImoexPanel';
        res.insertBefore(panel, res.firstChild);
    }
    // Повторное нажатие — сворачиваем
    if (_btImoexOpen) {
        _btImoexOpen = false;
        panel.style.display = 'none';
        panel.innerHTML = '';
        if (btn) btn.classList.remove('is-open');
        return;
    }
    _btImoexOpen = true;
    panel.style.display = 'block';
    if (btn) btn.classList.add('is-open');
    panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">'
        + '<div class="bt-spinner"></div><div>Загружаем индекс Московской биржи…</div></div></div>';
    btLoadImoexCompare(panel);
}

async function btLoadImoexCompare(panel) {
    var results = window._btLastResults;
    var dateStr = window._btLastDate;
    if (!results || !dateStr) {
        panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">Нет данных теста для сравнения.</div></div>';
        return;
    }
    try {
        var todayStr = new Date().toISOString().split('T')[0];
        var imoexRaw = await btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/IMOEX.json', dateStr, todayStr);
        if (!imoexRaw.length) throw new Error('NO_IMOEX');
        var pf = await btBuildPortfolioSeries(results, dateStr, todayStr);
        // Линия портфеля — настоящий ряд MOEX, нормированный к 0% на дату теста.
        var data = btAlignReturns(pf, imoexRaw);
        if (!data || data.points.length < 2) throw new Error('NO_ALIGN');
        // Число «Ваш портфель» в легенде = доходность из карточки: это тот же показатель
        // и тот же источник (прямое закрытие MOEX на сегодня), поэтому подписи совпадают.
        // Кривая может закончиться на ~0.1 пп иначе из-за forward-fill — на глаз незаметно.
        var cardPct = results.totalPnlPct !== null ? parseFloat(results.totalPnlPct) : null;
        if (cardPct !== null && !isNaN(cardPct)) {
            data.pfFinal = cardPct;
            data.delta = data.pfFinal - data.imFinal;
        }
        if (!_btImoexOpen) return; // пользователь успел закрыть
        btRenderImoexChart(panel, data, dateStr, todayStr);
    } catch(e) {
        console.warn('[BT] IMOEX compare failed:', e && e.message);
        if (!_btImoexOpen) return;
        panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">'
            + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            + '<div>Не удалось получить данные индекса IMOEX с Московской биржи. Попробуйте позже.</div></div></div>';
    }
}

// Постраничная загрузка дневной истории закрытий (MOEX ISS)
async function btFetchHistorySeries(path, fromStr, tillStr) {
    var out = [];
    var start = 0;
    for (var page = 0; page < 40; page++) {
        var url = MOEX_PROXY + '?path=' + encodeURIComponent(
            path + '?from=' + fromStr + '&till=' + tillStr +
            '&iss.meta=off&iss.only=history&sort_order=asc&start=' + start);
        var res = await fetch(url);
        if (!res.ok) break;
        var data = await res.json();
        if (!data.history || !data.history.data || !data.history.data.length) break;
        var cols = data.history.columns;
        var dIdx = cols.indexOf('TRADEDATE');
        var cIdx = cols.indexOf('CLOSE');
        var rows = data.history.data;
        for (var i = 0; i < rows.length; i++) {
            var d = rows[i][dIdx], c = rows[i][cIdx];
            if (d && c != null && c > 0) out.push({ d: d, c: c });
        }
        if (rows.length < 100) break;
        start += rows.length;
    }
    return out;
}

// Стоимость портфеля по датам = сумма (цена*кол-во) с forward-fill.
// Если для актива переданы lots ([{buyDate,qty}] — фактические докупки), кол-во на
// каждый день НАРАСТАЕТ по датам лотов, а не считается «купленным целиком» с начала
// периода текущим количеством — иначе доходность за давние даты (до реальной докупки)
// завышается/занижается на объём, которого тогда ещё не было. Без lots (напр. вкладка
// «Тест», где вся сумма покупается ОДНИМ днём fromStr) — старое поведение: qty фиксировано,
// баз. дата = когда уже торгуются ВСЕ активы (актив не мог быть куплен до начала торгов).
async function btBuildPortfolioSeries(results, fromStr, tillStr) {
    var assets = [];
    results.bonds.forEach(function(b) { assets.push({ t: b.t, qty: b.qty, lots: b.lots, market: 'bonds', mult: 10 }); });
    results.stocks.forEach(function(s) { assets.push({ t: s.t, qty: s.qty, lots: s.lots, market: 'shares', mult: 1 }); });
    var maps = [], hardDates = [], softDates = [];
    for (var i = 0; i < assets.length; i++) {
        var a = assets[i];
        var path = '/iss/history/engines/stock/markets/' + a.market + '/securities/' + a.t + '.json';
        var ser;
        try { ser = await btFetchHistorySeries(path, fromStr, tillStr); } catch(e) { ser = []; }
        if (!ser.length) continue;
        // фильтр аномалий: одиночная «битая» котировка от MOEX ISS (сбойный CLOSE, задвоенный
        // борд и т.п.) иначе через forward-fill портит ВСЮ доходность до конца графика — цена
        // навсегда «залипает» на неверном уровне. Облигации внутридневно почти не двигаются
        // (порог ×2), акции могут прыгать сильнее (порог ×10) — за пределами считаем точку
        // сбойной и пропускаем её, оставляя предыдущую валидную цену через forward-fill.
        var map = {}, dates = [], prevGood = null;
        var lo = a.market === 'bonds' ? 0.5 : 0.1, hi = a.market === 'bonds' ? 2 : 10;
        ser.forEach(function(p) {
            var c = p.c * a.mult;
            if (prevGood != null && prevGood > 0) {
                var ratio = c / prevGood;
                if (ratio < lo || ratio > hi) return;
            }
            map[p.d] = c; dates.push(p.d); prevGood = c;
        });
        dates.sort();
        var lots = (a.lots && a.lots.length) ? a.lots.slice().sort(function (x, y) { return x.buyDate < y.buyDate ? -1 : x.buyDate > y.buyDate ? 1 : 0; }) : null;
        maps.push({ dates: dates, map: map, qty: a.qty, lots: lots });
        if (lots) softDates.push(dates[0]); else hardDates.push(dates[0]);
    }
    if (!maps.length) return [];
    var baseDate;
    if (hardDates.length) { hardDates.sort(); baseDate = hardDates[hardDates.length - 1]; }
    else { softDates.sort(); baseDate = softDates[0]; }
    var dateSet = {};
    maps.forEach(function(m) { m.dates.forEach(function(d) { if (d >= baseDate) dateSet[d] = 1; }); });
    var union = Object.keys(dateSet).sort();
    var series = [];
    var ptr = maps.map(function() { return 0; });
    var lastPrice = maps.map(function() { return 0; });
    var lotPtr = maps.map(function() { return 0; });
    var lotQty = maps.map(function() { return 0; });
    var lotCost = maps.map(function() { return 0; });   // накопленная себестоимость лотов (buyPrice*qty)
    var baseInv = maps.map(function() { return null; }); // активы без lots: себестоимость = стоимость на baseDate (фикс.)
    for (var u = 0; u < union.length; u++) {
        var day = union[u], total = 0, inv = 0;
        for (var mi = 0; mi < maps.length; mi++) {
            var m = maps[mi];
            while (ptr[mi] < m.dates.length && m.dates[ptr[mi]] <= day) { lastPrice[mi] = m.map[m.dates[ptr[mi]]]; ptr[mi]++; }
            var q = m.qty;
            if (m.lots) {
                while (lotPtr[mi] < m.lots.length && m.lots[lotPtr[mi]].buyDate <= day) {
                    var lot = m.lots[lotPtr[mi]];
                    lotQty[mi] += lot.qty; lotCost[mi] += (lot.buyPrice || 0) * lot.qty; lotPtr[mi]++;
                }
                q = lotQty[mi];
            } else if (baseInv[mi] == null) {
                baseInv[mi] = lastPrice[mi] * q;
            }
            total += lastPrice[mi] * q;
            inv += m.lots ? lotCost[mi] : (baseInv[mi] || 0);
        }
        if (total > 0) series.push({ d: day, c: total, inv: inv });
    }
    return series;
}

// Выравнивание двух серий к общему старту → доходность в %. Портфель: (стоимость − вложено
// на эту дату) / вложено на эту дату (q.inv — себестоимость накопленных на эту дату лотов,
// см. выше) — та же формула, что и в calcHold/calcPf, просто на каждый день. Простое
// отношение c[t]/c[0] тут не годится: докупка увеличивает c[t] возросшим кол-вом, и это
// ошибочно засчитывалось бы как доходность (напр. один портфель показывал +2000% при
// реальном −0.8%). Индекс IMOEX — по простому отношению цены (у него нет докупок).
function btAlignReturns(pfSeries, imoexSeries) {
    if (!pfSeries.length || !imoexSeries.length) return null;
    var imap = {}, idates = [];
    imoexSeries.forEach(function(p) { imap[p.d] = p.c; idates.push(p.d); });
    idates.sort();
    function imoexAt(day) {
        var lo = 0, hi = idates.length - 1, ans = -1;
        while (lo <= hi) { var mid = (lo + hi) >> 1; if (idates[mid] <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
        return ans >= 0 ? imap[idates[ans]] : null;
    }
    var base0 = null, ibase = null;
    for (var i = 0; i < pfSeries.length; i++) {
        var iv = imoexAt(pfSeries[i].d);
        if (iv != null) { base0 = pfSeries[i]; ibase = iv; break; }
    }
    if (!base0) return null;
    var points = [];
    for (var j = 0; j < pfSeries.length; j++) {
        var p = pfSeries[j];
        if (p.d < base0.d) continue;
        var iv2 = imoexAt(p.d);
        if (iv2 == null) continue;
        var pfPct = p.inv > 0 ? (p.c / p.inv - 1) * 100 : 0;
        points.push({ d: p.d, pf: pfPct, im: (iv2 / ibase - 1) * 100 });
    }
    if (points.length < 2) return null;
    var last = points[points.length - 1];
    return { points: points, pfFinal: last.pf, imFinal: last.im, delta: last.pf - last.im };
}

// SVG-график доходности портфеля vs IMOEX
function btRenderImoexChart(panel, data, fromStr, tillStr) {
    var pts = data.points;
    var step = Math.max(1, Math.ceil(pts.length / 90));
    var s = [];
    for (var i = 0; i < pts.length; i += step) s.push(pts[i]);
    if (s[s.length - 1] !== pts[pts.length - 1]) s.push(pts[pts.length - 1]);

    // Размеры адаптивно под ширину контейнера: на десктопе (full-width) —
    // широкая невысокая лента ~1:4, на мобильном — компактнее, но не «сплющенная».
    var cw = (panel && panel.clientWidth) ? Math.round(panel.clientWidth) : 900;
    cw = Math.max(280, cw - 4);
    var W = cw, H = Math.round(Math.min(260, Math.max(195, cw * 0.25)));
    var padL = 48, padR = 16, padT = 16, padB = 26;
    var allV = [];
    s.forEach(function(p) { allV.push(p.pf, p.im); });
    var minV = Math.min.apply(null, allV), maxV = Math.max.apply(null, allV);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    var rng = maxV - minV; minV -= rng * 0.08; maxV += rng * 0.08;
    var n = s.length;
    function X(i) { return padL + (W - padL - padR) * (i / (n - 1)); }
    function Y(v) { return padT + (H - padT - padB) * (1 - (v - minV) / (maxV - minV)); }
    function line(key) { var d = ''; for (var i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s[i][key]).toFixed(1) + ' '; return d.trim(); }
    function area(key) { var d = 'M' + X(0).toFixed(1) + ' ' + Y(s[0][key]).toFixed(1) + ' '; for (var i = 1; i < n; i++) d += 'L' + X(i).toFixed(1) + ' ' + Y(s[i][key]).toFixed(1) + ' '; d += 'L' + X(n - 1).toFixed(1) + ' ' + (H - padB).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + (H - padB).toFixed(1) + ' Z'; return d; }

    var zeroY = (minV <= 0 && maxV >= 0) ? Y(0) : null;
    var yTicks = [maxV, (maxV + minV) / 2, minV];
    var svg = '<svg class="bt-imoex-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    yTicks.forEach(function(v) {
        var y = Y(v);
        svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="rgba(133,147,166,0.16)" stroke-width="1"/>';
        svg += '<text x="' + (padL - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#94A3B8" font-family="JetBrains Mono, monospace">' + (v >= 0 ? '+' : '') + v.toFixed(0) + '%</text>';
    });
    if (zeroY !== null) svg += '<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + zeroY.toFixed(1) + '" stroke="rgba(133,147,166,0.45)" stroke-width="1" stroke-dasharray="3 3"/>';
    svg += '<path d="' + area('pf') + '" fill="rgba(22,181,107,0.10)"/>';
    svg += '<path d="' + line('im') + '" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<path d="' + line('pf') + '" fill="none" stroke="#16B56B" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(s[n - 1].pf).toFixed(1) + '" r="3.5" fill="#16B56B"/>';
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(s[n - 1].im).toFixed(1) + '" r="3.5" fill="#94A3B8"/>';
    svg += '<text x="' + padL + '" y="' + (H - 7) + '" font-size="10" fill="#94A3B8" font-family="Inter">' + btFormatDateShort(fromStr) + '</text>';
    svg += '<text x="' + (W - padR) + '" y="' + (H - 7) + '" text-anchor="end" font-size="10" fill="#94A3B8" font-family="Inter">' + btFormatDateShort(tillStr) + '</text>';
    svg += '</svg>';

    var beat = data.delta >= 0;
    var deltaCls = beat ? 'pos' : 'neg';
    var deltaTxt = (beat ? '+' : '') + data.delta.toFixed(1) + ' пп';
    var pfCls = data.pfFinal >= 0 ? 'pos' : 'neg', imCls = data.imFinal >= 0 ? 'pos' : 'neg';
    var html = '<div class="bt-imoex-card">';
    html += '<div class="bt-imoex-head"><div class="bt-imoex-title">Доходность vs рынок (IMOEX)</div>';
    html += '<span class="bt-imoex-delta ' + deltaCls + '">' + (beat ? 'обгоняем рынок ' : 'отстаём ') + deltaTxt + '</span></div>';
    html += '<div class="bt-imoex-sub">Рост портфеля и индекса Мосбиржи с даты теста, нормировано к 0%</div>';
    html += svg;
    html += '<div class="bt-imoex-legend">';
    html += '<span class="bt-imoex-leg"><i style="background:#16B56B"></i>Ваш портфель <b class="v ' + pfCls + '">' + (data.pfFinal >= 0 ? '+' : '') + data.pfFinal.toFixed(1) + '%</b></span>';
    html += '<span class="bt-imoex-leg"><i style="background:#94A3B8"></i>IMOEX <b class="v ' + imCls + '">' + (data.imFinal >= 0 ? '+' : '') + data.imFinal.toFixed(1) + '%</b></span>';
    html += '</div></div>';
    panel.innerHTML = html;
}

function btFormatDateShort(dateStr) {
    try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }); }
    catch(e) { return dateStr; }
}

// Текущий капитал со страницы «Портфель» (#summ-invested) — он же бюджет теста
function btGetCapital() {
    var el = document.getElementById('summ-invested');
    if (el) {
        var n = parseInt(el.textContent.replace(/[^\d]/g, ''), 10);
        if (n > 0) return n;
    }
    return (typeof getSumInputValue === 'function') ? getSumInputValue() : 0;
}
// Стартовый капитал в ручном режиме (поле #btManualCapital)
function btGetManualCapital() {
    var el = document.getElementById('btManualCapital');
    if (!el) return 0;
    var n = parseInt((el.value || '').replace(/[^\d]/g, ''), 10);
    return n > 0 ? n : 0;
}
// Форматирование ввода капитала с разделителями тысяч
function btFormatCapital(el) {
    var d = (el.value || '').replace(/[^\d]/g, '');
    el.value = d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    // Капитал меняет распределение → пересчитываем количества и список
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    if (typeof lsScheduleSave === 'function') lsScheduleSave();
}

// «Покупка на стартовую сумму»: вместо переоценки текущих количеств по ценам
// прошлого считаем, что на дату теста инвестируется бюджет из расчёта в той же
// пропорции. Тогда «Стартовая сумма» ≈ сумме из расчёта, а не историческая стоимость.
function btRebuyAtBudget(results, budget) {
    if (!budget || budget <= 0) return;
    var all = results.bonds.concat(results.stocks);
    var vNow = 0;
    all.forEach(function(a) { if (a.testPrice > 0) vNow += a.testPrice * a.qty; });
    if (vNow <= 0) return;
    function rebuild(arr) {
        arr.forEach(function(a) {
            var w = (a.testPrice > 0 ? a.testPrice * a.qty : 0) / vNow;   // текущий вес
            var alloc = budget * w;
            var q = a.buyPrice > 0 ? Math.floor(alloc / a.buyPrice) : 0;
            a.qty = q;
            a.buyTotal = a.buyPrice > 0 ? a.buyPrice * q : 0;
            a.testTotal = a.testPrice > 0 ? a.testPrice * q : 0;
            a.pnl = (a.buyTotal > 0 && a.testTotal > 0) ? a.testTotal - a.buyTotal : null;
            a.pnlPct = (a.buyTotal > 0 && a.testTotal > 0) ? ((a.testTotal - a.buyTotal) / a.buyTotal * 100).toFixed(1) : null;
        });
    }
    rebuild(results.bonds);
    rebuild(results.stocks);
    var tb = 0, tt = 0;
    results.bonds.concat(results.stocks).forEach(function(a) { tb += a.buyTotal; tt += a.testTotal; });
    results.totalBuyPrice = tb;
    results.totalTestPrice = tt;
    var both = tb > 0 && tt > 0;
    results.totalPnl = both ? tt - tb : null;
    results.totalPnlPct = both ? ((tt - tb) / tb * 100).toFixed(1) : null;
}

function renderBtResults(results, dateStr) {
    var container = document.getElementById('btResults');
    if (!container) return;

    _btImoexOpen = false;   // новый прогон — закрываем прошлый график
    // Финальные данные — в левую карточку-шапку
    btRenderSummary(results, dateStr);
    var html = '';

    // Asset tables helper — лекало таблицы ОФЗ из вкладки «Ребаланс»
    function renderTable(items, title, subtitle) {
        if (!items.length) return '';
        var t = '<div class="bt-assets-card">';
        // Шапка: название + счётчик + подзаголовок | дата теста
        t += '<div class="bt-assets-header">';
        t += '<div class="bt-assets-ti"><div class="bt-assets-titlerow">';
        t += '<b class="bt-assets-title">' + title + '</b>';
        t += '<span class="bt-assets-cnt">' + items.length + '</span></div>';
        t += '<span class="bt-assets-sub">' + subtitle + '</span></div>';
        t += '<div class="bt-assets-date-pill">' + btFormatDate(dateStr) + '</div>';
        t += '</div>';
        // Шапка столбцов — 5 колонок: ранг | бумага | покупка | сейчас | P&L
        t += '<div class="bt-asset-row bt-asset-head">';
        t += '<span class="bt-col-head"></span>';
        t += '<div class="bt-col-head">Бумага</div>';
        t += '<div class="bt-col-head right">Покупка</div>';
        t += '<div class="bt-col-head right">Сейчас</div>';
        t += '<div class="bt-col-head right">P&L</div>';
        t += '</div>';
        // Строки данных
        for (var k = 0; k < items.length; k++) {
            var b = items[k];
            var rowPnlClass = b.pnl !== null ? (b.pnl > 0 ? 'pos' : b.pnl < 0 ? 'neg' : 'neutral') : 'neutral';
            var rowSign = b.pnl !== null && b.pnl >= 0 ? '+' : '';
            var buyStr = b.buyPrice > 0
                ? (b.buyPrice < 100 ? b.buyPrice.toFixed(2) + ' ₽' : btFmtRub(b.buyPrice))
                : '—';
            var priceStr = b.testPrice > 0
                ? (b.testPrice < 100 ? b.testPrice.toFixed(2) + ' ₽' : btFmtRub(b.testPrice))
                : '—';
            var pnlStr = (b.error || b.pnl === null) ? '—' : rowSign + btFmtRub(b.pnl);
            t += '<div class="bt-asset-row">';
            t += '<span class="bt-asset-rank">#' + (k + 1) + '</span>';
            t += '<div class="bt-asset-nameblock"><div class="bt-asset-name">' + (b.n || b.t) + '</div>';
            t += '<div class="bt-asset-ticker">' + b.t + ' · ' + b.qty + ' шт.</div></div>';
            t += '<div class="bt-asset-buy-price">' + buyStr + '</div>';
            t += '<div class="bt-asset-price">' + priceStr + '</div>';
            t += '<div class="bt-asset-pnl ' + rowPnlClass + '">' + pnlStr + '</div>';
            t += '</div>';
        }
        t += '</div>';
        return t;
    }

    html += renderTable(results.bonds, 'Облигации (ОФЗ)', 'Цена входа на дату теста и текущая стоимость');
    html += renderTable(results.stocks, 'Акции', 'Цена входа на дату теста и текущая стоимость');

    if (!results.bonds.length && !results.stocks.length) {
        html += '<div class="bt-error-card">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/>'
            + '<line x1="12" y1="8" x2="12" y2="12"/>'
            + '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            + '<div><div class="bt-error-title">Нет данных</div>'
            + '<div class="bt-error-msg">Портфель пуст или данные не загрузились.</div></div>'
            + '</div>';
    }

    // Предупреждение о частичных данных
    if (results._partialWarning) {
        html = '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">'
            + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            + '<div style="font-family:Inter,sans-serif;font-size:12px;color:var(--text-slate);line-height:1.5;">'
            + '<strong style="color:#B45309;">Частичные данные:</strong> ' + results._partialWarning + '. Показаны доступные результаты.'
            + '</div></div>' + html;
    }

    container.innerHTML = html;
    btEnterResultsMode();
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}



// ===== COMPAT: Legacy functions that reference old navigation =====
window.openVanguardTest = function() {
    const vg = document.getElementById('screen-vanguard');
    if (vg) {
        vg.classList.add('active');
        vg.style.display = 'block';
    }
};

window.vgGoBack = function() {
    const vg = document.getElementById('screen-vanguard');
    if (vg) { vg.classList.remove('active'); vg.style.display = ''; }
    switchTab('calc');
};

window.vgCancel = function() {
    window.vgGoBack();
};

// Override openCompanyPage to show company overlay
const _origOpenCompany = window.openCompanyPage;
// openCompanyPage НЕ переопределяем — оригинальная функция вызывает showScreen('screen-company')
// который наш override уже обрабатывает (показывает overlay)
// window.openCompanyPage остаётся оригинальным

// Company back button
window.goBackFromCompany = function() {
    const co = document.getElementById('screen-company');
    if (co) { co.classList.remove('active'); co.style.display = ''; }
};

// Sync bento ring / market data to topbar
window.syncBentoMarketData = function() {
    // Update quick stats if wanted in future
};

// checkFirstVisit override — skip welcome screen
window.checkFirstVisit = function() {
    // No-op: we always start at the app
};

// Placeholder for missing functions
window.openTerminalOrRegister = function() { switchTab('calc'); };

// Handle theme button in top bar sync
function syncThemeBtn() {
    const btn = document.getElementById('topThemeBtn');
    if (!btn) return;
    const isDark = document.body.classList.contains('dark-mode');
    const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    btn.innerHTML = isDark ? sunIcon : moonIcon;
}

// Patch toggleTheme to also update topThemeBtn
const _origToggleTheme = window.toggleTheme;
window.toggleTheme = function() {
    if (_origToggleTheme) _origToggleTheme();
    // Update legacy themeBtn 
    syncThemeBtn();
};

// Make old themeBtn invisible (we use topThemeBtn)
document.addEventListener('DOMContentLoaded', () => {
    const oldBtn = document.getElementById('themeBtn');
    if (oldBtn) oldBtn.style.display = 'none';
    syncThemeBtn();
});


// ===== IMPROVEMENT 1: localStorage STATE PERSISTENCE =====

var LS_KEY = 'msolominа_state';

function lsSave() {
    try {
        var sumEl = document.getElementById('sumInput');
        var sliderEl = document.getElementById('ratioSlider');
        var btDate = document.getElementById('btDateInput');
        var state = {
            sum: sumEl ? sumEl.value : '',
            bondPct: sliderEl ? sliderEl.value : '50',
            brokerFee: typeof brokerFee !== 'undefined' ? brokerFee : 0.0005,
            isFeeSelected: typeof isFeeSelected !== 'undefined' ? isFeeSelected : false,
            btDate: btDate ? btDate.value : '',
            btTickers: btState ? btState.tickers : [],
            btSource: btState ? btState.source : 'calc',
            btManualCapital: (document.getElementById('btManualCapital') || {}).value || '',
            lastTab: currentTab || 'home',
            theme: document.body.classList.contains('dark-mode') ? 'dark' : 'light',
            ts: Date.now()
        };
        localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch(e) {}
}

function lsLoad() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch(e) { return null; }
}

function lsRestore() {
    var state = lsLoad();
    if (!state) return;

    // Восстанавливаем сумму
    if (state.sum) {
        var sumEl = document.getElementById('sumInput');
        if (sumEl) {
            sumEl.value = state.sum;
            if (typeof ndFormatInput === 'function') ndFormatInput(sumEl);
        }
    }

    // Слайдер
    if (state.bondPct) {
        var slider = document.getElementById('ratioSlider');
        if (slider) {
            slider.value = state.bondPct;
            if (typeof updateSlider === 'function') updateSlider(slider);
        }
    }

    // Комиссия
    if (state.isFeeSelected && state.brokerFee && typeof ndSelectFee === 'function') {
        var feeText = (state.brokerFee * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
        ndSelectFee(state.brokerFee, feeText, null);
    }

    // Дата бэктеста
    if (state.btDate) {
        var btDateEl = document.getElementById('btDateInput');
        if (btDateEl) btDateEl.value = state.btDate;
    }

    // Тикеры бэктеста — нормализуем и подгружаем цены на дату теста заново
    if (state.btTickers && state.btTickers.length > 0 && btState) {
        btState.tickers = state.btTickers.map(function(t) {
            return { t: t.t, type: t.type || (String(t.t).startsWith('SU') ? 'bond' : 'stock'), price: 0, qty: 0, status: 'loading' };
        });
        btRenderTickerList();
        btState.tickers.forEach(function(t) { btFetchTickerPrice(t); });
    }

    if (state.btSource && btState) {
        btSetSource(state.btSource);
    }

    if (state.btManualCapital) {
        var btCapEl = document.getElementById('btManualCapital');
        if (btCapEl) btCapEl.value = state.btManualCapital;
    }

    // Тема
    if (state.theme === 'dark' && !document.body.classList.contains('dark-mode')) {
        if (typeof toggleTheme === 'function') toggleTheme();
    }

    btUpdateRunBtn();
}

// Автосохранение каждые 2 сек после изменений
var lsSaveTimer = null;
function lsScheduleSave() {
    clearTimeout(lsSaveTimer);
    lsSaveTimer = setTimeout(lsSave, 2000);
}

// Вешаем на ключевые события
document.addEventListener('input', function(e) {
    if (e.target && (e.target.id === 'sumInput' || e.target.id === 'ratioSlider' ||
        e.target.id === 'btDateInput')) {
        lsScheduleSave();
    }
});

// ===== IMPROVEMENT 2: LOAD LAST PORTFOLIO IN BACKTEST =====

function btLoadLastPortfolio() {
    var state = lsLoad();
    if (!state || !state.sum || parseFloat(state.sum.replace(/\s/g, '')) < 100000) {
        showLuxuryNotification('Нет сохранённого портфеля', 'Сначала рассчитайте портфель во вкладке «Расчёт»');
        return;
    }

    // Восстанавливаем параметры и пересчитываем
    if (state.sum) {
        var sumEl = document.getElementById('sumInput');
        if (sumEl) { sumEl.value = state.sum; if (typeof ndFormatInput === 'function') ndFormatInput(sumEl); }
    }
    if (state.bondPct) {
        var slider = document.getElementById('ratioSlider');
        if (slider) { slider.value = state.bondPct; if (typeof updateSlider === 'function') updateSlider(slider); }
    }
    if (state.isFeeSelected && state.brokerFee && typeof ndSelectFee === 'function') {
        var feeText = (state.brokerFee * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
        ndSelectFee(state.brokerFee, feeText, null);
    }

    // Пересчитываем
    if (typeof draw === 'function') {
        try {
            draw();
            savePortfolio && savePortfolio();
            isPortfolioCalculated = true;
            var assets = btCollectFromPortfolio();
            var sumEl2 = document.getElementById('btCalcSummary');
            if (sumEl2) sumEl2.textContent = assets.bonds.length + assets.stocks.length + ' позиций: ' + assets.bonds.length + ' ОФЗ, ' + assets.stocks.length + ' акций.';
            btUpdateRunBtn();
            var saveTime = state.ts ? new Date(state.ts).toLocaleString('ru-RU', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
            showLuxuryNotification('Портфель восстановлен', saveTime ? 'Сохранён ' + saveTime : '');
        } catch(e) {
            showLuxuryNotification('Ошибка', 'Не удалось восстановить портфель');
        }
    }
}

// ===== IMPROVEMENT 3: MOEX API GRACEFUL FALLBACK =====

async function btGetBondPriceSafe(ticker, dateStr) {
    try {
        var price = await btGetBondPrice(ticker, dateStr);
        return price;
    } catch(e) {
        console.warn('[BT] Bond price fetch failed for ' + ticker + ':', e.message);
        return -1; // sentinel: failed
    }
}

async function btGetStockPriceSafe(ticker, dateStr) {
    try {
        var price = await btGetStockPrice(ticker, dateStr);
        return price;
    } catch(e) {
        console.warn('[BT] Stock price fetch failed for ' + ticker + ':', e.message);
        return -1; // sentinel: failed
    }
}

// Патчим btFetchPrices чтобы использовать safe версии + показывать прогресс
var _origBtFetchPrices = btFetchPrices;
btFetchPrices = async function(dateStr, assets) {
    var total = assets.bonds.length + assets.stocks.length;
    var done = 0;
    var failed = 0;

    function updateProgress() {
        var el = document.getElementById('btResults');
        if (!el) return;
        var pct = total > 0 ? Math.round((done / total) * 100) : 0;
        el.innerHTML = '<div class="bt-loading">'
            + '<div class="bt-spinner"></div>'
            + '<div class="bt-loading-text">Загружаем цены... ' + done + '/' + total + '</div>'
            + '<div style="width:200px;height:4px;background:rgba(0,0,0,0.06);border-radius:2px;margin-top:8px;overflow:hidden;">'
            + '<div style="width:' + pct + '%;height:100%;background:var(--accent-blue,#3498db);border-radius:2px;transition:width 0.3s;"></div></div>'
            + '<div class="bt-loading-sub">' + btFormatDate(dateStr) + '</div>'
            + '</div>';
    }

    updateProgress();

    var results = { date: dateStr, bonds: [], stocks: [], totalBuyPrice: 0, totalTestPrice: 0 };

    var todayStr = new Date().toISOString().split('T')[0];

    for (var i = 0; i < assets.bonds.length; i++) {
        var bond = assets.bonds[i];
        var histPrice = await btGetBondPriceSafe(bond.t, dateStr);
        done++;
        if (histPrice === -1) { failed++; histPrice = 0; }
        // Цена «сейчас» — всегда живое закрытие с MOEX (тот же источник, что и
        // конец графика сравнения), цена из расчёта (bond.p) только как запасной вариант.
        var nowPrice = await btGetBondPriceSafe(bond.t, todayStr);
        if (nowPrice <= 0) nowPrice = bond.p > 0 ? bond.p : 0;
        var buyTotal = histPrice > 0 ? histPrice * bond.qty : 0;
        var nowTotal = nowPrice > 0 ? nowPrice * bond.qty : 0;
        results.bonds.push({
            t: bond.t, n: bond.n, qty: bond.qty,
            buyPrice: histPrice, testPrice: nowPrice,
            buyTotal: buyTotal, testTotal: nowTotal,
            pnl: buyTotal > 0 && nowTotal > 0 ? nowTotal - buyTotal : null,
            pnlPct: buyTotal > 0 && nowTotal > 0 ? ((nowTotal - buyTotal) / buyTotal * 100).toFixed(1) : null,
            error: histPrice === 0
        });
        results.totalBuyPrice += buyTotal;
        results.totalTestPrice += nowTotal;
        updateProgress();
    }

    for (var j = 0; j < assets.stocks.length; j++) {
        var stock = assets.stocks[j];
        var sHistPrice = await btGetStockPriceSafe(stock.t, dateStr);
        done++;
        if (sHistPrice === -1) { failed++; sHistPrice = 0; }
        // Цена «сейчас» — живое закрытие с MOEX (как и конец графика сравнения).
        var sNowPrice = await btGetStockPriceSafe(stock.t, todayStr);
        if (sNowPrice <= 0) sNowPrice = stock.p > 0 ? stock.p : 0;
        var sBuyTotal = sHistPrice > 0 ? sHistPrice * stock.qty : 0;
        var sNowTotal = sNowPrice > 0 ? sNowPrice * stock.qty : 0;
        results.stocks.push({
            t: stock.t, n: stock.n, qty: stock.qty,
            buyPrice: sHistPrice, testPrice: sNowPrice,
            buyTotal: sBuyTotal, testTotal: sNowTotal,
            pnl: sBuyTotal > 0 && sNowTotal > 0 ? sNowTotal - sBuyTotal : null,
            pnlPct: sBuyTotal > 0 && sNowTotal > 0 ? ((sNowTotal - sBuyTotal) / sBuyTotal * 100).toFixed(1) : null,
            error: sHistPrice === 0
        });
        results.totalBuyPrice += sBuyTotal;
        results.totalTestPrice += sNowTotal;
        updateProgress();
    }

    if (failed > 0 && failed === total) {
        throw new Error('MOEX_UNAVAILABLE');
    }

    var hasBuy = results.totalBuyPrice > 0;
    var hasTest = results.totalTestPrice > 0;
    results.totalPnl = hasBuy && hasTest ? results.totalTestPrice - results.totalBuyPrice : null;
    results.totalPnlPct = hasBuy && hasTest ? ((results.totalTestPrice - results.totalBuyPrice) / results.totalBuyPrice * 100).toFixed(1) : null;
    results.failedCount = failed;
    return results;
};

// Обновлённый runBacktest с graceful fallback
var _origRunBacktest = runBacktest;
runBacktest = async function() {
    var dateInput = document.getElementById('btDateInput');
    if (!dateInput || !dateInput.value) return;
    var testDate = dateInput.value;

    var assets;
    if (btState.source === 'calc') {
        if (!isPortfolioCalculated) {
            showLuxuryNotification('Портфель не рассчитан', 'Перейдите в Расчёт и нажмите Рассчитать');
            return;
        }
        assets = btCollectFromPortfolio();
        if (assets.bonds.length === 0 && assets.stocks.length === 0) {
            showBtError('Портфель пуст', 'Рассчитайте портфель во вкладке Расчёт.');
            return;
        }
    } else {
        if (btState.tickers.length === 0) {
            showLuxuryNotification('Нет бумаг', 'Добавьте хотя бы одну бумагу');
            return;
        }
        if (btGetManualCapital() <= 0) {
            showLuxuryNotification('Нет капитала', 'Укажите стартовый капитал');
            return;
        }
        // Цены на дату теста → количество (капитал поровну между бумагами)
        showBtLoading(testDate);
        await btEnsureManualPrices();
        var picked = btState.tickers.filter(function(t) { return t.qty > 0; });
        if (picked.length === 0) {
            showBtError('Не удалось рассчитать', 'Нет цен на выбранную дату или капитала не хватает даже на одну бумагу.');
            return;
        }
        assets = {
            bonds: picked.filter(function(t) { return t.type === 'bond'; }).map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
            stocks: picked.filter(function(t) { return t.type === 'stock'; }).map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
        };
    }

    try {
        var results = await btFetchPrices(testDate, assets);
        if (results.failedCount > 0 && results.failedCount < results.bonds.length + results.stocks.length) {
            // Частичные данные — показываем предупреждение в результатах
            results._partialWarning = results.failedCount + ' из ' + (results.bonds.length + results.stocks.length) + ' тикеров не загрузились';
        }
        // Calc-режим: «Стартовая сумма» = капитал из расчёта, перекупаем в тех же
        // пропорциях. Ручной режим уже посчитал количество (капитал поровну) — не трогаем.
        if (btState.source === 'calc') {
            var _budget = btGetCapital();
            if (_budget > 0) btRebuyAtBudget(results, _budget);
        }
        renderBtResults(results, testDate);
        // Сразу показываем сравнение с IMOEX (renderBtResults сбросил _btImoexOpen)
        if (typeof btCompareImoex === 'function') btCompareImoex();
        lsSave();
    } catch(e) {
        if (e.message === 'MOEX_UNAVAILABLE') {
            showBtError(
                'MOEX API недоступен',
                'Не удалось получить ни одной цены с биржи. Проверьте подключение к интернету или попробуйте позже. Исторические данные доступны через Yandex Cloud прокси.'
            );
        } else {
            showBtError('Ошибка загрузки', 'Не удалось получить данные с MOEX для даты ' + btFormatDate(testDate) + '.');
        }
    }
};

// ===== IMPROVEMENT 4: TAB SWITCH ANIMATION =====

var tabOrder = ['home', 'calc', 'portfolio', 'rebalance', 'market', 'backtest'];

var _origSwitchTab = switchTab;
switchTab = function(tabId) {
    var oldTab = currentTab;
    var oldIdx = tabOrder.indexOf(oldTab);
    var newIdx = tabOrder.indexOf(tabId);
    var dir = newIdx > oldIdx ? 1 : -1;

    // Текущая панель — анимируем уход
    var oldPanel = document.getElementById('panel-' + oldTab);
    if (oldPanel && oldTab !== tabId) {
        oldPanel.style.transition = 'opacity 0.15s ease, transform 0.18s ease';
        oldPanel.style.opacity = '0';
        oldPanel.style.transform = 'translateX(' + (dir * -24) + 'px)';
        setTimeout(function() {
            oldPanel.style.transition = '';
            oldPanel.style.transform = '';
            oldPanel.style.opacity = '';
        }, 180);
    }

    // Вызываем оригинальный switchTab
    _origSwitchTab(tabId);

    // Новая панель — анимируем появление
    var newPanel = document.getElementById('panel-' + tabId);
    if (newPanel && oldTab !== tabId) {
        newPanel.style.opacity = '0';
        newPanel.style.transform = 'translateX(' + (dir * 24) + 'px)';
        newPanel.style.transition = '';
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                newPanel.style.transition = 'opacity 0.2s ease, transform 0.22s ease';
                newPanel.style.opacity = '1';
                newPanel.style.transform = 'translateX(0)';
                setTimeout(function() {
                    newPanel.style.transition = '';
                    newPanel.style.transform = '';
                    newPanel.style.opacity = '';
                }, 220);
            });
        });
    }

    // Сохраняем состояние
    lsScheduleSave();
};

// ===== IMPROVEMENT 5: REBALANCE EMPTY STATE =====

function checkRebalanceEmptyState() {
    var target = document.getElementById('rebalancePanelContent');
    if (!target) return;

    // Проверяем есть ли данные в таблицах
    var hasOfz = document.querySelector('.ofz-aurora-item') !== null;
    var hasStocks = document.querySelector('.stocks-aurora-body-cell') !== null ||
                    document.getElementById('stocks-aurora-body')?.children.length > 0;

    var existingEmpty = document.getElementById('rebalanceEmptyState');

    if (!hasOfz && !hasStocks && isPortfolioCalculated === false) {
        if (!existingEmpty) {
            var empty = document.createElement('div');
            empty.id = 'rebalanceEmptyState';
            empty.className = 'portfolio-empty-new';
            empty.style.cssText = 'margin-top:40px;';
            empty.innerHTML = '<div class="empty-icon" style="background:linear-gradient(135deg,rgba(44,54,76,0.08),rgba(91,124,153,0.08));border:1px solid rgba(91,124,153,0.15);">'
                + '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5B7C99" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
                + '</div>'
                + '<div class="empty-title">Нет данных для ребаланса</div>'
                + '<div class="empty-text">Сначала рассчитайте портфель во вкладке «Расчёт», затем вернитесь сюда.</div>'
                + '<button class="empty-btn" onclick="switchTab(\'calc\')">'
                + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>'
                + 'Перейти к расчёту'
                + '</button>';
            // Вставляем после smart-replace-card
            var smartCard = target.querySelector('.smart-replace-card');
            if (smartCard && smartCard.nextSibling) {
                target.insertBefore(empty, smartCard.nextSibling);
            } else {
                target.appendChild(empty);
            }
        }
    } else {
        if (existingEmpty) existingEmpty.remove();
    }
}

// Патчим switchTab чтобы проверять пустое состояние при переходе на ребаланс
var _origSwitchTab2 = switchTab;
switchTab = function(tabId) {
    _origSwitchTab2(tabId);
    if (tabId === 'rebalance') {
        setTimeout(checkRebalanceEmptyState, 50);
    }
    if (tabId === 'backtest' || tabId === 'calc') {
        lsScheduleSave();
    }
    if (tabId === 'backtest') {
        // Синхронизируем баннер «Из расчёта», кнопку и подсказку при входе
        if (typeof btUpdateRunBtn === 'function') btUpdateRunBtn();
    }
};

// Восстанавливаем состояние после загрузки данных
var _origCalculateAndShow = window.calculateAndShowPortfolio;
window.calculateAndShowPortfolio = function() {
    _origCalculateAndShow && _origCalculateAndShow();
    setTimeout(function() {
        var empty = document.getElementById('rebalanceEmptyState');
        if (empty) empty.remove();
        lsSave();
    }, 500);
};

// ===== HEADER SCROLL SHADOW =====
(function() {
    function initHeaderScroll() {
        var contentArea = document.getElementById('contentArea');
        var headerWrapper = document.getElementById('headerWrapper');
        if (!contentArea || !headerWrapper) return;

        function onScroll() {
            if (contentArea.scrollTop > 4) {
                headerWrapper.classList.add('scrolled');
            } else {
                headerWrapper.classList.remove('scrolled');
            }
        }

        contentArea.addEventListener('scroll', onScroll, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeaderScroll);
    } else {
        initHeaderScroll();
    }
})();
// ===================================

// Инициализация после загрузки
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(lsRestore, 300);
    setTimeout(checkRebalanceEmptyState, 1000);
});

// ===== РЕАЛЬНАЯ ВЫСОТА VIEWPORT ДЛЯ SAFARI PWA =====
// 100dvh в standalone Safari завышает высоту → таббар уезжает, появляется зазор сверху него.
// window.innerHeight даёт точную видимую высоту экрана.
(function() {
    function setRealVH() {
        document.documentElement.style.setProperty('--real-vh', window.innerHeight + 'px');
    }
    setRealVH();
    window.addEventListener('resize', setRealVH);
    window.addEventListener('orientationchange', function() { setTimeout(setRealVH, 120); });
    window.addEventListener('load', function() { setRealVH(); setTimeout(setRealVH, 300); });
})();
