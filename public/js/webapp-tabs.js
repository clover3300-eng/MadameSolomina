// ===== WEBAPP TAB SYSTEM =====
// Роутер вкладок + сборка панелей из legacy-экранов (populatePanels) + шимы
// совместимости. При декомпозиции отсюда вынесены: top-search.js (поиск),
// income-chart.js (график дохода), backtest.js (вкладка «Тест»),
// app-state.js (персист в localStorage) — грузятся сразу после этого файла.
// Патчи switchTab (анимация, empty-state Ребаланса) живут здесь же, ниже
// объявления, — их порядок несущий; stock-terminal.js и portfolios.js
// оборачивают switchTab уже поверх, при своей загрузке.

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
        // 2.5) Кнопка «Создать портфель» — переносит рассчитанный состав (ОФЗ + акции)
        // в новый портфель на вкладке «Портфели» и сразу открывает её
        const createPfBtn = document.createElement('button');
        createPfBtn.type = 'button';
        createPfBtn.className = 'v3-createpf-btn';
        createPfBtn.innerHTML = '<span class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>Создать портфель';
        createPfBtn.onclick = function() {
            if (typeof window.pfImport === 'function') window.pfImport('calc', 'all', null);
            switchTab('portfolios');
        };
        if (fcLight) fcLight.appendChild(createPfBtn);
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
