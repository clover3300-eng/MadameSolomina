// ========================================================================
// AURORA REBALANCE - НОВЫЕ ФУНКЦИИ ДЛЯ ВКЛАДОК
// ========================================================================

// ----- R4: сортировка списка ОФЗ, цветовая шкала, статистика рельсы -----

// Текущий ключ сортировки списка ОФЗ: 'yield' (доходность) | 'price' (цена)
let rebalanceOfzSortKey = 'yield';

// Плавная зелёная шкала: чем выше доходность в диапазоне, тем насыщеннее цвет.
function ofzYieldColor(y, minY, maxY) {
    if (!isFinite(y)) return '#10B981';
    const t = (maxY === minY) ? 1 : Math.max(0, Math.min(1, (y - minY) / (maxY - minY)));
    return `oklch(${(62 - t * 4).toFixed(1)}% ${(0.08 + t * 0.13).toFixed(3)} 152)`;
}

// Переключение сортировки списка ОФЗ (кнопки в шапке карточки)
function setOfzSort(key) {
    if (rebalanceOfzSortKey === key) return;
    rebalanceOfzSortKey = key;
    const y = document.getElementById('ofzSortYield');
    const p = document.getElementById('ofzSortPrice');
    if (y) y.classList.toggle('act', key === 'yield');
    if (p) p.classList.toggle('act', key === 'price');
    renderAuroraOfzList();
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}

// Кнопка «Показать рекомендации» (плейсхолдер)
function rebalanceShowRecos() {
    if (typeof showToast === 'function') showToast('Рекомендации скоро будут доступны');
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
}

// Статистика в тёмной рельсе зависит от активной вкладки
function updateRebalanceStats(mode) {
    const v1 = document.getElementById('rbStatV1');
    if (!v1) return;
    const k1 = document.getElementById('rbStatK1');
    const k2 = document.getElementById('rbStatK2'), v2 = document.getElementById('rbStatV2');
    const k3 = document.getElementById('rbStatK3'), v3 = document.getElementById('rbStatV3');
    const num = (s) => parseFloat(String(s == null ? '' : s).replace('%', '').replace(',', '.'));

    if (mode === 'stocks') {
        const cols = (typeof echelonTableData !== 'undefined' && echelonTableData) ? echelonTableData : [[], [], [], []];
        const all = cols.flat();
        const sectors = new Set(all.map(a => (a.sector || '').trim()).filter(Boolean));
        const pots = all.map(a => num(a.target)).filter(n => isFinite(n));
        if (k1) k1.textContent = 'Кандидатов'; v1.textContent = all.length || '—';
        if (k2) k2.textContent = 'Макс. потенциал'; v2.textContent = pots.length ? '+' + Math.max(...pots).toFixed(2) + '%' : '—'; v2.className = 'v up';
        if (k3) k3.textContent = 'Секторов'; v3.textContent = sectors.size || '—'; v3.className = 'v';
        const sc = document.getElementById('stocksCount'); if (sc) sc.textContent = all.length;
    } else {
        const arr = (typeof bonds !== 'undefined' && bonds) ? bonds : [];
        const ys = arr.map(b => num(b.y)).filter(n => isFinite(n));
        const avg = ys.length ? ys.reduce((s, n) => s + n, 0) / ys.length : 0;
        if (k1) k1.textContent = 'Кандидатов'; v1.textContent = arr.length || '—';
        if (k2) k2.textContent = 'Средняя доходность'; v2.textContent = ys.length ? avg.toFixed(2) + '%' : '—'; v2.className = 'v up';
        if (k3) k3.textContent = 'Лучшая доходность'; v3.textContent = ys.length ? Math.max(...ys).toFixed(2) + '%' : '—'; v3.className = 'v';
        const oc = document.getElementById('ofzCount'); if (oc) oc.textContent = arr.length;
    }
}

// Переключение вкладок ОФЗ / АКЦИИ (Liquid Tab Switcher)
function switchRebalanceTab(tabName) {
    const tabSwitcher = document.getElementById('tabSwitcher');
    const tabs = document.querySelectorAll('.tab-btn');
    
    // Убираем активный класс со всех кнопок
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Скрываем весь контент
    document.querySelectorAll('.rebalance-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Управляем глайдером
    if (tabName === 'stocks') {
        tabSwitcher.classList.add('show-stocks');
        tabs[1].classList.add('active');
    } else {
        tabSwitcher.classList.remove('show-stocks');
        tabs[0].classList.add('active');
    }
    
    // Показываем нужный контент
    document.getElementById(`rebalance-tab-${tabName}`).classList.add('active');
    
    // Скролл на верх страницы
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    
    // Если переключились на акции — рендерим таблицу заново
    if (tabName === 'stocks') {
        // Закрываем открытую карточку
        closeStockDetail();
        // Перерендериваем таблицу
        renderAuroraStocksTable();
    }
    updateInfoBtnState(tabName);
    updateRebalanceStats(tabName);
}

// Инициализация Spotlight эффекта для карточки "Умная замена"
function initSmartReplaceSpotlight() {
    const card = document.getElementById('smartReplaceCard');
    if (!card) return;
    
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', x + '%');
        card.style.setProperty('--mouse-y', y + '%');
    });
}

// Вызываем инициализацию при загрузке
document.addEventListener('DOMContentLoaded', initSmartReplaceSpotlight);

// Рендер списка ОФЗ в Aurora стиле
function renderAuroraOfzList() {
    const container = document.getElementById('ofz-aurora-list');
    if (!container || typeof bonds === 'undefined' || bonds.length === 0) return;
    
    // Функция форматирования даты в день-месяц-год
    function formatDateDMY(dateStr) {
        if (!dateStr || dateStr === '—') return '—';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        } catch (e) {
            return dateStr;
        }
    }
    
    let html = '';

    // Сортировка списка: по доходности (убыв.) или по цене (возр.)
    const parseYield = (b) => parseFloat(String(b.y || '0').replace('%', '').replace(',', '.')) || 0;
    const parsePriceFull = (b) => {
        const p = parseFloat(String(b.p).replace(',', '.')) || 0;
        return p + (parseFloat(b.nkd || 0) || 0);
    };
    const sorted = bonds.slice().sort((a, b) =>
        rebalanceOfzSortKey === 'price' ? parsePriceFull(a) - parsePriceFull(b) : parseYield(b) - parseYield(a));

    // Диапазон доходностей для цветовой шкалы
    const ysAll = sorted.map(parseYield);
    const maxY = Math.max(...ysAll), minY = Math.min(...ysAll);

    sorted.forEach((b, index) => {
        const rank = index + 1;
        const details = bondDetailsMap[b.t] || { matDate: '—', couponValue: 0, nextCoupon: '—', freq: 0 };
        const priceFinal = parseFloat(String(b.p).replace(',', '.')).toFixed(2);
        const nkd = parseFloat(b.nkd || 0).toFixed(2);
        const priceWithNkd = (parseFloat(priceFinal) + parseFloat(nkd)).toFixed(2);
        
        // Доходность из Google Sheets для строки
        const sheetYield = b.y ? b.y.replace('%', '') : '—';
        
        // Рассчитанная текущая купонная доходность для подстроки
        let curYield = "0.00";
        if (details.couponValue > 0 && details.freq > 0) {
            curYield = ((details.couponValue * details.freq / parseFloat(priceFinal)) * 100).toFixed(2);
        }
        
        const hiddenClass = ''; // Список ОФЗ раскрыт полностью изначально
        
        html += `
        <div class="ofz-aurora-item ${hiddenClass}" id="aurora-${b.t}" data-index="${index}">
            <div class="ofz-aurora-summary" onclick="toggleAuroraOfzDetails('${b.t}')">
                <span class="rb-rank">#${rank}</span>
                <span class="ofz-aurora-name">${formatNameWithMonoDigits(limitName(b.n))}</span>
                <span class="ofz-aurora-yield" style="color:${ofzYieldColor(parseFloat(sheetYield), minY, maxY)}">${sheetYield}%</span>
                <span class="ofz-aurora-price">${priceWithNkd} ₽</span>
                <span class="ofz-expand-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>
            </div>
            
            <div class="ofz-aurora-details" id="aurora-details-${b.t}">
                <div class="ofz-aurora-details-list">
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Код (ISIN)</span>
                        <div class="ofz-copy-wrapper" onclick="copyTickerNew('${b.t}')">
                            <span class="ofz-copy-code">${b.t}</span>
                            <svg class="ofz-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </div>
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Текущая цена</span>
                        <span class="ofz-detail-value">${priceFinal} ₽</span>
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">НКД<span class="ofz-help-icon" onclick="toggleOfzHelp('nkdHelp-${b.t}', event)">?</span></span>
                        <span class="ofz-detail-value">${nkd} ₽</span>
                    </div>
                    <div class="ofz-inline-help" id="nkdHelp-${b.t}">
                        <b>НКД</b> — накопленный купонный доход. Это часть купона, которую вы платите продавцу облигации за дни с последней выплаты до даты покупки. При получении следующего купона вы получите его целиком.
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Итого (цена + НКД)</span>
                        <span class="ofz-detail-value" style="font-weight: 700;">${priceWithNkd} ₽</span>
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Погашение</span>
                        <span class="ofz-detail-value">${formatDateDMY(details.matDate)}</span>
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Размер купона</span>
                        <span class="ofz-detail-value">${details.couponValue} ₽</span>
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Ближайший купон</span>
                        <span class="ofz-detail-value">${formatDateDMY(details.nextCoupon)}</span>
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Текущая купонная доходность<span class="ofz-help-icon" onclick="toggleOfzHelp('yieldHelp-${b.t}', event)">?</span></span>
                        <span class="ofz-detail-value" style="color: #10B981;">${curYield}%</span>
                    </div>
                    <div class="ofz-inline-help" id="yieldHelp-${b.t}">
                        <b>Текущая купонная доходность</b> — показывает, какой процент годовых вы получаете от купонов относительно текущей цены облигации. Не учитывает выплату номинала при погашении.
                    </div>
                    <div class="ofz-detail-row">
                        <span class="ofz-detail-label">Выплат в год</span>
                        <span class="ofz-detail-value">${details.freq}</span>
                    </div>
                </div>
                <button class="ofz-aurora-chart-btn" onclick="openTradingViewDirect('${b.t}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    Открыть график
                </button>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
    hideSkeleton('skeleton-ofz-list');
    const _at = document.querySelector('.tab-btn.active')?.dataset.tab || 'ofz';
    updateRebalanceStats(_at);
}

// Раскрытие/скрытие деталей ОФЗ в Aurora стиле с прокруткой
function toggleAuroraOfzDetails(ticker) {
    const item = document.getElementById(`aurora-${ticker}`);
    if (!item) return;
    
    const isExpanded = item.classList.contains('expanded');
    
    // Закрываем все открытые
    document.querySelectorAll('.ofz-aurora-item.expanded').forEach(el => {
        el.classList.remove('expanded');
    });
    
    // Если не был открыт — открываем и прокручиваем
    if (!isExpanded) {
        item.classList.add('expanded');
        // Прокрутка чтобы карточка была видна между кнопкой телеграм (сверху) и навигацией (снизу)
        setTimeout(() => {
            const navHeight = 80; // высота навигационного меню + отступ
            const topOffset = 60; // отступ от верха (кнопка закрыть телеграм)
            const itemRect = item.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const bottomOfCard = itemRect.top + item.offsetHeight;
            const topOfCard = itemRect.top;
            
            // Если верх карточки выше зоны видимости — прокручиваем вниз
            if (topOfCard < topOffset) {
                const scrollBy = topOfCard - topOffset;
                window.scrollBy({ top: scrollBy, behavior: 'smooth' });
            }
            // Если низ карточки ниже навигации — прокручиваем вверх
            else if (bottomOfCard > viewportHeight - navHeight) {
                const scrollBy = bottomOfCard - (viewportHeight - navHeight) + 20;
                window.scrollBy({ top: scrollBy, behavior: 'smooth' });
            }
        }, 150);
    }
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Показать/скрыть все ОФЗ в Aurora стиле
let ofzListExpanded = true;

function toggleAuroraOfzList() {
    const items = document.querySelectorAll('.ofz-aurora-item');
    const trigger = document.getElementById('ofzGhostTrigger');
    const text = document.getElementById('ofzGhostText');
    
    ofzListExpanded = !ofzListExpanded;
    
    if (!ofzListExpanded) {
        // Сворачиваем — показываем только первые 3
        items.forEach((item, index) => {
            if (index > 2) {
                item.classList.add('aurora-hidden');
            }
            // Также закрываем все подстроки
            item.classList.remove('expanded');
        });
        text.innerText = 'ОТКРЫТЬ СПИСОК';
        trigger.classList.remove('open');
        
        // Прокрутка к верху страницы
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // Разворачиваем — показываем все с анимацией
        items.forEach((item, index) => {
            item.classList.remove('aurora-hidden');
            // Перезапускаем анимацию stagger
            item.style.animation = 'none';
            item.offsetHeight; // Триггер reflow
            item.style.animation = `staggerIn 0.4s ease forwards`;
            item.style.animationDelay = `${index * 0.05}s`;
        });
        text.innerText = 'СВЕРНУТЬ';
        trigger.classList.add('open');
    }
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Стрелка у ИНСТРУМЕНТ — одно нажатие открывает, повторное сворачивает
function toggleOfzListCollapse() {
    var items = document.querySelectorAll('.ofz-aurora-item');
    var toggle = document.getElementById('ofzCollapseToggle');
    var ghostTrigger = document.getElementById('ofzGhostTrigger');
    var ghostText = document.getElementById('ofzGhostText');
    var hiddenItems = document.querySelectorAll('.ofz-aurora-item.aurora-hidden');
    var isExpanded = hiddenItems.length === 0;

    if (!isExpanded) {
        // Раскрываем всё
        items.forEach(function(item, index) {
            item.classList.remove('aurora-hidden');
            item.style.animation = 'none';
            item.offsetHeight;
            item.style.animation = 'staggerIn 0.35s ease forwards';
            item.style.animationDelay = (index * 0.04) + 's';
        });
        // Стрелка поворачивается вверх — "нажми чтобы скрыть"
        if (toggle) toggle.classList.add('expanded');
        if (ghostTrigger) { ghostTrigger.style.display = 'flex'; ghostTrigger.classList.add('open'); }
        if (ghostText) ghostText.innerText = 'СВЕРНУТЬ';
        ofzListExpanded = true;
    } else {
        // Сворачиваем до 3х
        items.forEach(function(item, index) {
            if (index >= 3) {
                item.classList.add('aurora-hidden');
                item.classList.remove('expanded');
            }
        });
        // Стрелка возвращается вниз
        if (toggle) toggle.classList.remove('expanded');
        if (ghostTrigger) { ghostTrigger.style.display = 'flex'; ghostTrigger.classList.remove('open'); }
        if (ghostText) ghostText.innerText = 'ОТКРЫТЬ СПИСОК';
        ofzListExpanded = false;
    }

    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Переключение описания эшелонов
function toggleEchelonsInfo() {
    const info = document.getElementById('stocksEchelonInfo');
    const header = document.getElementById('echelonsHeader');
    
    if (!info || !header) return;
    
    const isOpen = info.classList.contains('open');
    
    if (isOpen) {
        info.classList.remove('open');
        header.classList.remove('open');
    } else {
        info.classList.add('open');
        header.classList.add('open');
    }
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Подсветка столбца эшелона при клике на кружок
let activeEchelonColumn = null;

function toggleEchelonColumnHighlight(echelonNum, event) {
    event.stopPropagation();
    
    const rows = document.querySelectorAll('.stocks-table-row');
    const circle = document.getElementById(`echelonCircle${echelonNum}`);
    
    // Снимаем подсветку со всех столбцов
    for (let i = 1; i <= 4; i++) {
        const c = document.getElementById(`echelonCircle${i}`);
        if (c) c.classList.remove('active');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('.stocks-cell');
            if (cells[i - 1]) {
                cells[i - 1].classList.remove(`column-highlight-${i}`);
            }
        });
    }
    
    // Если кликнули на тот же столбец — просто выключаем
    if (activeEchelonColumn === echelonNum) {
        activeEchelonColumn = null;
        
        // Вибрация
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.selectionChanged();
        }
        return;
    }
    
    // Включаем подсветку нового столбца
    activeEchelonColumn = echelonNum;
    
    if (circle) circle.classList.add('active');
    
    // Подсвечиваем только ячейки с тикерами
    rows.forEach(row => {
        const cells = row.querySelectorAll('.stocks-cell');
        const cell = cells[echelonNum - 1];
        if (cell) {
            // Проверяем есть ли тикер в ячейке
            const ticker = cell.querySelector('.stocks-cell-ticker');
            if (ticker && ticker.textContent.trim()) {
                cell.classList.add(`column-highlight-${echelonNum}`);
            }
        }
    });
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Рендер таблицы эшелонов акций в Aurora стиле
function renderAuroraStocksTable() {
    const container = document.getElementById('stocks-aurora-body');
    if (!container) return;
    
    // Сбрасываем подсветку столбцов
    activeEchelonColumn = null;
    for (let i = 1; i <= 4; i++) {
        const c = document.getElementById(`echelonCircle${i}`);
        if (c) c.classList.remove('active');
    }
    
    // Проверяем есть ли данные в echelonTableData
    if (typeof echelonTableData === 'undefined' || 
        !echelonTableData || 
        echelonTableData.every(col => col.length === 0)) {
        // Если данных нет, ждем загрузки
        setTimeout(renderAuroraStocksTable, 500);
        return;
    }
    
    let html = '';
    const maxRows = Math.max(...echelonTableData.map(col => col.length));
    const maxVisibleRows = 3;

    // Глобальный максимум потенциала — общая шкала для полосок всех эшелонов
    const toPot = (s) => parseFloat(String(s == null ? '' : s).replace('%', '').replace(',', '.'));
    const allPots = echelonTableData.flat().map(a => toPot(a.target)).filter(n => isFinite(n));
    const maxPot = allPots.length ? Math.max(...allPots) : 0;

    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
        const hiddenClass = ''; // Список акций раскрыт полностью изначально

        html += `<div class="stocks-table-row ${hiddenClass}" data-row="${rowIndex}">`;

        for (let colIndex = 0; colIndex < 4; colIndex++) {
            const asset = echelonTableData[colIndex][rowIndex];

            if (asset && asset.t) {
                const ticker = asset.t;
                const rawTarget = asset.target || '';
                const echelonNum = colIndex + 1;
                const name = asset.n || ticker;

                // Потенциал в %: приводим к виду «+125.86%», полоска — доля от максимума
                const potNum = toPot(rawTarget);
                const potStr = isFinite(potNum) ? ((potNum >= 0 ? '+' : '') + potNum.toFixed(2) + '%') : rawTarget;
                const changeClass = isFinite(potNum) ? (potNum >= 0 ? 'positive' : 'negative') : 'neutral';
                const barPct = (isFinite(potNum) && maxPot > 0) ? Math.max(7, Math.min(100, potNum / maxPot * 100)) : 0;
                const barHtml = barPct > 0 ? `<div class="ec-bar"><i style="width:${barPct.toFixed(1)}%"></i></div>` : '';

                html += `<div class="stocks-cell esh-card" onclick="openStockDetail('${ticker}', ${echelonNum}, this)">
                    <div class="ec-top"><span class="stocks-cell-ticker">${ticker}</span><span class="stocks-cell-change ${changeClass}">${potStr}</span></div>
                    <div class="ec-name">${name}</div>
                    ${barHtml}
                </div>`;
            } else {
                html += `<div class="stocks-cell empty"></div>`;
            }
        }

        html += '</div>';
    }

    container.innerHTML = html;
    hideSkeleton('skeleton-stocks-table');
    const _at = document.querySelector('.tab-btn.active')?.dataset.tab || 'ofz';
    updateRebalanceStats(_at);
    
    // Проверяем что карточка деталей существует и в правильном месте
    let card = document.getElementById('stockDetailCard');
    if (!card) {
        // Создаем карточку если её нет
        card = document.createElement('div');
        card.className = 'stock-detail-card';
        card.id = 'stockDetailCard';
        const ghostTrigger = document.getElementById('stocksGhostTrigger');
        if (ghostTrigger) {
            ghostTrigger.before(card);
        } else {
            container.after(card);
        }
    }
    
    // Обновляем кнопку показать/скрыть
    updateStocksShowMoreButton();
}

// Открытие карточки деталей тикера
function openStockDetail(ticker, echelon, clickedCell = null) {
    const card = document.getElementById('stockDetailCard');
    if (!card || !ticker) return;
    
    // Снимаем активный класс с предыдущей ячейки
    document.querySelectorAll('.stocks-cell.active').forEach(c => c.classList.remove('active'));
    
    // Закрываем если уже открыта эта же карточка
    if (card.classList.contains('open') && card.dataset.ticker === ticker) {
        closeStockDetail();
        return;
    }
    
    // Добавляем активный класс на кликнутую ячейку
    if (clickedCell) {
        clickedCell.classList.add('active');
    }
    
    // Ищем данные о компании в echelonTableData
    let companyName = ticker;
    let companySector = '';
    
    // Для привилегированных акций (SNGSp -> SNGS) ищем сектор базового тикера
    const baseTicker = ticker.toLowerCase().endsWith('p') ? ticker.slice(0, -1) : ticker;
    
    if (typeof echelonTableData !== 'undefined') {
        // Сначала ищем точное совпадение
        for (let i = 0; i < echelonTableData.length; i++) {
            const found = echelonTableData[i].find(item => item.t === ticker);
            if (found) {
                companyName = found.n || ticker;
                companySector = found.sector || '';
                break;
            }
        }
        
        // Если сектор не найден и это привилегированная акция - ищем по базовому тикеру
        if (!companySector && ticker !== baseTicker) {
            for (let i = 0; i < echelonTableData.length; i++) {
                const found = echelonTableData[i].find(item => item.t === baseTicker || item.t === baseTicker.toUpperCase());
                if (found) {
                    companySector = found.sector || '';
                    if (!companyName || companyName === ticker) {
                        companyName = found.n || ticker;
                    }
                    break;
                }
            }
        }
    }
    
    const tierMap = {
        1: { color: '#1d9d6c', roman: 'I',   name: 'I эшелон' },
        2: { color: '#3d6fd1', roman: 'II',  name: 'II эшелон' },
        3: { color: '#d07b2a', roman: 'III', name: 'III эшелон' },
        4: { color: '#d8434f', roman: 'IV',  name: 'IV эшелон' }
    };
    const tier = tierMap[echelon] || tierMap[1];

    // Потенциал роста (target) для этого тикера
    let potentialStr = '';
    if (typeof echelonTableData !== 'undefined') {
        for (let i = 0; i < echelonTableData.length; i++) {
            const f = echelonTableData[i].find(it => it.t === ticker) ||
                      (ticker !== baseTicker ? echelonTableData[i].find(it => it.t === baseTicker || it.t === baseTicker.toUpperCase()) : null);
            if (f) { potentialStr = f.target || ''; break; }
        }
    }
    const potNum = parseFloat(String(potentialStr).replace('%', '').replace(',', '.'));
    const potDisplay = isFinite(potNum) ? ((potNum >= 0 ? '+' : '') + potNum.toFixed(2) + '%') : (potentialStr || '—');

    // Сектор
    const sectorHtml = companySector ? `
        <span class="sd-sector">
            <span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></span>
            ${companySector}
        </span>` : '';

    card.innerHTML = `
        <div class="sd">
            <div class="sd-close" onclick="closeStockDetail()" title="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </div>
            <div class="sd-top">
                <div class="sd-id">
                    <div class="tk">${ticker}</div>
                    <div class="nm">${companyName}</div>
                </div>
                <span class="sd-tier-circle" style="color:${tier.color};border-color:${tier.color}">${tier.roman}</span>
            </div>
            ${sectorHtml}
            <div class="sd-hr"></div>
            <div class="sd-pot">
                <div>
                    <div class="sd-pot-label">Потенциал</div>
                    <div class="sd-pot-val">${potDisplay}</div>
                </div>
                <div class="sd-pot-horizon">
                    <span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M4 10.5h16M9 4v3M15 4v3"/></svg></span>
                    горизонт до 36 мес.
                </div>
            </div>
            <div class="sd-hr"></div>
            <div class="kv">
                <span class="k">Код (тикер)</span>
                <span class="v"><span class="isin-pill" onclick="copyTickerNew('${ticker}')">${ticker}<span class="cp"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg></span></span></span>
            </div>
            <div class="kv">
                <span class="k">Эшелон риска</span>
                <span class="v">${tier.name}</span>
            </div>
            <div class="sd-btns">
                <div class="sd-btn dark" onclick="openTradingViewDirect('${ticker}')">
                    <span class="ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/></svg></span>
                    График
                </div>
                <div class="sd-btn light" onclick="goToCompanyPageFromTicker('${ticker}')">
                    <span class="ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.5"/></svg></span>
                    О компании
                </div>
            </div>
        </div>
    `;
    
    card.dataset.ticker = ticker;
    card.dataset.echelon = echelon;
    
    // Вставляем карточку сразу под строкой с тикером
    if (clickedCell) {
        const row = clickedCell.closest('.stocks-table-row');
        if (row && row.parentNode) {
            // Перемещаем карточку после строки (insertBefore с nextSibling)
            row.parentNode.insertBefore(card, row.nextSibling);
        }
    }
    
    card.classList.add('open');
    
    // Прокручиваем так чтобы карточка была видна между кнопкой телеграм и навигацией
    setTimeout(() => {
        const navHeight = 80;
        const topOffset = 60;
        const cardRect = card.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const bottomOfCard = cardRect.top + card.offsetHeight;
        const topOfCard = cardRect.top;
        
        // Если верх карточки выше зоны видимости — прокручиваем вниз
        if (topOfCard < topOffset) {
            const scrollBy = topOfCard - topOffset;
            window.scrollBy({ top: scrollBy, behavior: 'smooth' });
        }
        // Если низ карточки ниже навигации — прокручиваем вверх
        else if (bottomOfCard > viewportHeight - navHeight) {
            const scrollBy = bottomOfCard - (viewportHeight - navHeight) + 20;
            window.scrollBy({ top: scrollBy, behavior: 'smooth' });
        }
    }, 100);
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Закрыть карточку деталей
function closeStockDetail() {
    const card = document.getElementById('stockDetailCard');
    if (card) {
        card.classList.remove('open');
        card.dataset.ticker = '';
        
        // Возвращаем карточку на исходное место (после таблицы)
        const tableContainer = document.querySelector('.stocks-aurora-table');
        if (tableContainer && card.parentNode !== tableContainer.parentNode) {
            const ghostTrigger = document.getElementById('stocksGhostTrigger');
            if (ghostTrigger) {
                ghostTrigger.before(card);
            } else {
                tableContainer.after(card);
            }
        }
    }
    // Снимаем активный класс со всех ячеек
    document.querySelectorAll('.stocks-cell.active').forEach(c => c.classList.remove('active'));
}

// Переход на страницу компании (из карточки деталей акции)
function goToCompanyPage(ticker) {
    // Ищем данные о компании в echelonTableData
    let companyData = null;
    
    if (typeof echelonTableData !== 'undefined') {
        for (let i = 0; i < echelonTableData.length; i++) {
            const found = echelonTableData[i].find(item => item.t === ticker);
            if (found) {
                companyData = {
                    t: found.t,
                    n: found.n || ticker,
                    sector: found.sector || '',
                    target: found.target || '—',
                    type: 'Акция'
                };
                break;
            }
        }
    }
    
    if (companyData && typeof openCompanyPage === 'function') {
        openCompanyPage(companyData);
    } else {
        showToast('Информация о компании недоступна');
    }
}

// Переход на страницу компании как если бы в поиск ввели тикер
function goToCompanyPageFromTicker(ticker) {
    // Вызываем функцию поиска с тикером
    if (typeof searchCompanyInternal === 'function') {
        searchCompanyInternal(ticker);
    } else if (typeof openCompanyPage === 'function') {
        // Fallback - ищем данные и открываем страницу
        let companyData = null;
        
        // Для привилегированных акций ищем и базовый тикер
        const baseTicker = ticker.toLowerCase().endsWith('p') ? ticker.slice(0, -1).toUpperCase() : ticker;
        
        if (typeof echelonTableData !== 'undefined') {
            for (let i = 0; i < echelonTableData.length; i++) {
                let found = echelonTableData[i].find(item => item.t === ticker);
                if (!found && ticker !== baseTicker) {
                    found = echelonTableData[i].find(item => item.t === baseTicker);
                }
                if (found) {
                    companyData = {
                        t: ticker, // Используем оригинальный тикер
                        n: found.n || ticker,
                        sector: found.sector || '',
                        target: found.target || '—',
                        type: 'Акция',
                        p: 0
                    };
                    break;
                }
            }
        }
        
        if (companyData) {
            openCompanyPage(companyData, ticker);
        } else {
            // Пробуем открыть без данных
            openCompanyPage(null, ticker);
        }
    } else {
        showToast('Информация о компании недоступна');
    }
}

// Показать/скрыть все акции
let stocksExpanded = true;

function toggleStocksTable() {
    const rows = document.querySelectorAll('.stocks-table-row');
    const trigger = document.getElementById('stocksGhostTrigger');
    const text = document.getElementById('stocksGhostText');
    
    stocksExpanded = !stocksExpanded;
    
    rows.forEach((row, index) => {
        if (stocksExpanded) {
            row.classList.remove('stocks-row-hidden');
            row.style.animation = 'none';
            row.offsetHeight;
            row.style.animation = `staggerIn 0.3s ease forwards`;
            row.style.animationDelay = `${index * 0.05}s`;
        } else {
            if (index >= 3) {
                row.classList.add('stocks-row-hidden');
            }
        }
    });
    
    text.innerText = stocksExpanded ? 'СВЕРНУТЬ' : 'ОТКРЫТЬ СПИСОК';
    trigger.classList.toggle('open', stocksExpanded);

    // === НОВОЕ: ПРОКРУТКА К НАЧАЛУ ПРИ СКРЫТИИ ===
    if (!stocksExpanded) {
        window.scrollTo({
            top: 0,
            behavior: 'smooth' // Плавная прокрутка
        });
    }
    // ===========================================
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function updateStocksShowMoreButton() {
    const allRows = document.querySelectorAll('.stocks-table-row');
    const hiddenRows = document.querySelectorAll('.stocks-table-row.stocks-row-hidden');
    const trigger = document.getElementById('stocksGhostTrigger');
    if (!trigger) return;
    // Показываем trigger только если есть скрытые строки
    if (hiddenRows.length > 0) {
        trigger.style.display = 'flex';
    } else if (allRows.length > 3) {
        // Все строки показаны — показываем "Свернуть"
        trigger.style.display = 'flex';
    } else {
        trigger.style.display = 'none';
    }
}

// CSS для скрытых строк акций
const stocksHiddenStyle = document.createElement('style');
stocksHiddenStyle.textContent = `
    .stocks-row-hidden {
        display: none !important;
    }
`;
document.head.appendChild(stocksHiddenStyle);

// Функция показа тултипа для цены
function showPriceTooltip(event) {
    event.stopPropagation();
    
    // Удаляем старые тултипы
    document.querySelectorAll('.header-tooltip').forEach(t => t.remove());
    
    const tooltip = document.createElement('div');
    tooltip.className = 'header-tooltip';
    tooltip.innerHTML = 'Цена формируется как:<br><b>Текущая цена + НКД</b>';
    document.body.appendChild(tooltip);
    
    const rect = event.target.getBoundingClientRect();
    tooltip.style.top = (rect.bottom + 8) + 'px';
    tooltip.style.right = (window.innerWidth - rect.right) + 'px';
    
    // Закрытие по клику в любом месте
    setTimeout(() => {
        document.addEventListener('click', function closeTooltip() {
            tooltip.remove();
            document.removeEventListener('click', closeTooltip);
        });
    }, 100);
    
    // Автозакрытие через 3 секунды
    setTimeout(() => {
        if (tooltip.parentNode) {
            tooltip.remove();
        }
    }, 3000);
}

// Функция показа тултипа для доходности
function showYieldTooltip(event) {
    event.stopPropagation();
    
    // Удаляем старые тултипы
    document.querySelectorAll('.header-tooltip').forEach(t => t.remove());
    
    const tooltip = document.createElement('div');
    tooltip.className = 'header-tooltip';
    tooltip.innerHTML = '<b>Простая доходность к погашению</b>';
    document.body.appendChild(tooltip);
    
    const rect = event.target.getBoundingClientRect();
    tooltip.style.top = (rect.bottom + 8) + 'px';
    tooltip.style.left = (rect.left) + 'px';
    
    // Закрытие по клику в любом месте
    setTimeout(() => {
        document.addEventListener('click', function closeTooltip() {
            tooltip.remove();
            document.removeEventListener('click', closeTooltip);
        });
    }, 100);
    
    // Автозакрытие через 3 секунды
    setTimeout(() => {
        if (tooltip.parentNode) {
            tooltip.remove();
        }
    }, 3000);
}

// Новые функции для раскрывающихся пояснений
function toggleYieldDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('yieldDropdown');
    const priceDropdown = document.getElementById('priceDropdown');
    
    // Закрываем другой dropdown
    if (priceDropdown) priceDropdown.classList.remove('show');
    
    // Переключаем текущий
    if (dropdown) {
        dropdown.classList.toggle('show');
        
        // Закрытие по клику вне
        if (dropdown.classList.contains('show')) {
            setTimeout(() => {
                document.addEventListener('click', function closeDropdown(e) {
                    if (!dropdown.contains(e.target)) {
                        dropdown.classList.remove('show');
                        document.removeEventListener('click', closeDropdown);
                    }
                });
            }, 100);
        }
    }
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

function togglePriceDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('priceDropdown');
    const yieldDropdown = document.getElementById('yieldDropdown');
    
    // Закрываем другой dropdown
    if (yieldDropdown) yieldDropdown.classList.remove('show');
    
    // Переключаем текущий
    if (dropdown) {
        dropdown.classList.toggle('show');
        
        // Закрытие по клику вне
        if (dropdown.classList.contains('show')) {
            setTimeout(() => {
                document.addEventListener('click', function closeDropdown(e) {
                    if (!dropdown.contains(e.target)) {
                        dropdown.classList.remove('show');
                        document.removeEventListener('click', closeDropdown);
                    }
                });
            }, 100);
        }
    }
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Функция показа/скрытия подсказки для НКД и текущей купонной доходности
function toggleOfzHelp(helpId, event) {
    event.stopPropagation();
    const help = document.getElementById(helpId);
    if (help) {
        help.classList.toggle('show');
    }
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Функция прямого открытия TradingView без предупреждения
function openTradingViewDirect(ticker) {
    const tvUrl = `https://ru.tradingview.com/chart/?symbol=MOEX%3A${ticker}`;
    openExternalLink(tvUrl);
}

// ========================================================================
// КОНЕЦ AURORA REBALANCE ФУНКЦИЙ
