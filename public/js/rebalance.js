// ========================================================================
// AURORA REBALANCE - НОВЫЕ ФУНКЦИИ ДЛЯ ВКЛАДОК
// ========================================================================

// ----- R4: сортировка списка ОФЗ, цветовая шкала, статистика рельсы -----

// Текущий ключ сортировки списка ОФЗ: 'yield' (доходность) | 'price' (цена)
let rebalanceOfzSortKey = 'yield';
// Направление сортировки: 'desc' (убыв., ▼) | 'asc' (возр., ▲)
let rebalanceOfzSortDir = 'desc';

// Плавная зелёная шкала: чем выше доходность в диапазоне, тем насыщеннее цвет.
function ofzYieldColor(y, minY, maxY) {
    if (!isFinite(y)) return '#10B981';
    const t = (maxY === minY) ? 1 : Math.max(0, Math.min(1, (y - minY) / (maxY - minY)));
    return `oklch(${(62 - t * 4).toFixed(1)}% ${(0.08 + t * 0.13).toFixed(3)} 152)`;
}

// Переключение сортировки списка ОФЗ (кнопки в шапке карточки).
// Повторный клик по активной кнопке — меняет направление (возр./убыв.).
function setOfzSort(key) {
    if (rebalanceOfzSortKey === key) {
        rebalanceOfzSortDir = (rebalanceOfzSortDir === 'desc') ? 'asc' : 'desc';
    } else {
        rebalanceOfzSortKey = key;
        // Дефолт: доходность — по убыванию (лучшая сверху), цена — по возрастанию (дешевле сверху)
        rebalanceOfzSortDir = (key === 'price') ? 'asc' : 'desc';
    }
    updateOfzSortUI();
    renderAuroraOfzList();
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}

// Подсветка активной кнопки сортировки и направление стрелки
function updateOfzSortUI() {
    [['yield', document.getElementById('ofzSortYield')],
     ['price', document.getElementById('ofzSortPrice')]].forEach(function(pair) {
        const k = pair[0], el = pair[1];
        if (!el) return;
        const active = (rebalanceOfzSortKey === k);
        el.classList.toggle('act', active);
        el.classList.toggle('asc', active && rebalanceOfzSortDir === 'asc');
        el.classList.toggle('desc', active && rebalanceOfzSortDir === 'desc');
    });
}

// ----- R6: статистика для шапки-героя (ОФЗ и акции считаются одновременно) -----

// Плавный подсчёт числа в элементе: от прошлого значения к целевому
function rbxAnimateNum(el, target, fmt) {
    if (!el) return;
    if (!isFinite(target)) { el.textContent = '\u2014'; return; }
    const from = parseFloat(el.dataset.cur || '0') || 0;
    el.dataset.cur = target;
    if (Math.abs(target - from) < 1e-9) { el.textContent = fmt(target); return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = fmt(target); return;
    }
    const t0 = performance.now(), dur = 800;
    (function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = fmt(from + (target - from) * e);
        if (p < 1) requestAnimationFrame(tick);
    })(t0);
}

// Обновляет KPI шапки-героя и счётчики секций. Старый аргумент (mode)
// игнорируется — с R6 обе выборки видны на одном экране.
function updateRebalanceStats() {
    const num = (s) => parseFloat(String(s == null ? '' : s).replace('%', '').replace(',', '.'));

    const arr = (typeof bonds !== 'undefined' && bonds) ? bonds : [];
    const ys = arr.map(b => num(b.y)).filter(n => isFinite(n));
    const avgY = ys.length ? ys.reduce((s, n) => s + n, 0) / ys.length : NaN;

    const cols = (typeof echelonTableData !== 'undefined' && echelonTableData) ? echelonTableData : [[], [], [], []];
    const all = cols.flat();
    const pots = all.map(a => num(a.target)).filter(n => isFinite(n));
    const avgP = pots.length ? pots.reduce((s, n) => s + n, 0) / pots.length : NaN;

    rbxAnimateNum(document.getElementById('rbxOfzNum'), arr.length || NaN, v => String(Math.round(v)));
    rbxAnimateNum(document.getElementById('rbxOfzAvg'), avgY, v => v.toFixed(2) + '%');
    rbxAnimateNum(document.getElementById('rbxStNum'), all.length || NaN, v => String(Math.round(v)));
    rbxAnimateNum(document.getElementById('rbxStAvg'), avgP, v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%');

    const oc = document.getElementById('ofzCount');
    if (oc) oc.textContent = arr.length || '\u2014';
    const sc = document.getElementById('stocksCount');
    if (sc) sc.textContent = all.length || '\u2014';
}

// Совместимость: переключателя ОФЗ/Акции больше нет — обе секции на одном экране
function switchRebalanceTab() {}

// Рендер списка ОФЗ (левая секция карты R6)
function renderAuroraOfzList() {
    const container = document.getElementById('ofz-aurora-list');
    if (!container || typeof bonds === 'undefined' || bonds.length === 0) return;

    function formatDateDMY(dateStr) {
        if (!dateStr || dateStr === '\u2014') return '\u2014';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return String(date.getDate()).padStart(2, '0') + '.' +
                   String(date.getMonth() + 1).padStart(2, '0') + '.' + date.getFullYear();
        } catch (e) { return dateStr; }
    }

    // Сортировка списка: по доходности или по цене (см. setOfzSort)
    const parseYield = (b) => parseFloat(String(b.y || '0').replace('%', '').replace(',', '.')) || 0;
    const parsePriceFull = (b) => (parseFloat(String(b.p).replace(',', '.')) || 0) + (parseFloat(b.nkd || 0) || 0);
    const sortVal = (b) => rebalanceOfzSortKey === 'price' ? parsePriceFull(b) : parseYield(b);
    const dirSign = (rebalanceOfzSortDir === 'asc') ? 1 : -1;
    const sorted = bonds.slice().sort((a, b) => (sortVal(a) - sortVal(b)) * dirSign);

    // Диапазон доходностей для цветовой шкалы
    const ysAll = sorted.map(parseYield);
    const maxY = Math.max(...ysAll), minY = Math.min(...ysAll);

    let html = '';
    sorted.forEach((b, index) => {
        const details = bondDetailsMap[b.t] || { matDate: '\u2014', couponValue: 0, nextCoupon: '\u2014', freq: 0 };
        const priceFinal = parseFloat(String(b.p).replace(',', '.')).toFixed(2);
        const nkd = parseFloat(b.nkd || 0).toFixed(2);
        const priceWithNkd = (parseFloat(priceFinal) + parseFloat(nkd)).toFixed(2);
        const sheetYield = b.y ? b.y.replace('%', '') : '\u2014';
        let curYield = '0.00';
        if (details.couponValue > 0 && details.freq > 0) {
            curYield = ((details.couponValue * details.freq / parseFloat(priceFinal)) * 100).toFixed(2);
        }

        html += `
        <div class="rbx-row" id="aurora-${b.t}">
            <div class="rbx-row-main" onclick="toggleAuroraOfzDetails('${b.t}')">
                <span class="rk">#${index + 1}</span>
                <span class="nm">${formatNameWithMonoDigits(limitName(b.n))}</span>
                <span class="yl" style="color:${ofzYieldColor(parseFloat(sheetYield), minY, maxY)}">${sheetYield}%</span>
                <span class="pr">${priceWithNkd} \u20bd</span>
                <span class="ar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>
            </div>
            <div class="rbx-det" id="aurora-details-${b.t}">
                <div class="rbx-det-in">
                    <div class="rbx-spec">
                        <div class="rbx-srow rbx-srow-copy" onclick="copyTickerNew('${b.t}')" title="Скопировать код">
                            <span>Код (ISIN)</span>
                            <b>${b.t}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg></b>
                        </div>
                        <div class="rbx-srow"><span>Текущая цена</span><b>${priceFinal} \u20bd</b></div>
                        <div class="rbx-srow"><span>НКД<i class="rbx-q" onclick="toggleOfzHelp('nkdHelp-${b.t}', event)">?</i></span><b>${nkd} \u20bd</b></div>
                        <div class="rbx-shelp" id="nkdHelp-${b.t}"><b>НКД</b> — накопленный купонный доход: часть купона, которую вы платите продавцу за дни с последней выплаты. Следующий купон получите целиком.</div>
                        <div class="rbx-srow"><span>Итого (цена + НКД)</span><b class="tot">${priceWithNkd} \u20bd</b></div>
                        <div class="rbx-srow"><span>Погашение</span><b>${formatDateDMY(details.matDate)}</b></div>
                        <div class="rbx-srow"><span>Размер купона</span><b>${details.couponValue} \u20bd</b></div>
                        <div class="rbx-srow"><span>Ближайший купон</span><b>${formatDateDMY(details.nextCoupon)}</b></div>
                        <div class="rbx-srow"><span>Куп. доходность<i class="rbx-q" onclick="toggleOfzHelp('yieldHelp-${b.t}', event)">?</i></span><b class="up">${curYield}%</b></div>
                        <div class="rbx-shelp" id="yieldHelp-${b.t}"><b>Текущая купонная доходность</b> — процент годовых от купонов к текущей цене облигации, без учёта выплаты номинала при погашении.</div>
                        <div class="rbx-srow"><span>Выплат в год</span><b>${details.freq}</b></div>
                    </div>
                    <button class="rbx-chart-btn" onclick="openTradingViewDirect('${b.t}')">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        Открыть график
                    </button>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
    hideSkeleton('skeleton-ofz-list');
    updateRebalanceStats();
}

// Раскрытие деталей выпуска ОФЗ (одна строка открыта за раз)
function toggleAuroraOfzDetails(ticker) {
    const item = document.getElementById(`aurora-${ticker}`);
    if (!item) return;
    const wasExpanded = item.classList.contains('expanded');
    document.querySelectorAll('.rbx-row.expanded').forEach(el => el.classList.remove('expanded'));
    if (!wasExpanded) {
        item.classList.add('expanded');
        setTimeout(() => item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 180);
    }
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}

// Рендер акций по эшелонам риска: 4 колонки карточек (правая секция карты R6)
const RBX_TIERS = [
    { cls: 'e1', roman: 'I' },
    { cls: 'e2', roman: 'II' },
    { cls: 'e3', roman: 'III' },
    { cls: 'e4', roman: 'IV' },
];

function renderAuroraStocksTable() {
    const container = document.getElementById('stocks-aurora-body');
    if (!container) return;

    // Данные могли ещё не приехать из Google Sheets — подождём
    if (typeof echelonTableData === 'undefined' || !echelonTableData ||
        echelonTableData.every(col => col.length === 0)) {
        setTimeout(renderAuroraStocksTable, 500);
        return;
    }

    // Общая шкала потенциала — полоски всех эшелонов сопоставимы между собой
    const toPot = (s) => parseFloat(String(s == null ? '' : s).replace('%', '').replace(',', '.'));
    const allPots = echelonTableData.flat().map(a => toPot(a.target)).filter(n => isFinite(n));
    const maxPot = allPots.length ? Math.max(...allPots) : 0;

    let html = '';
    for (let col = 0; col < 4; col++) {
        const tier = RBX_TIERS[col];
        // Внутри эшелона — по убыванию потенциала
        const assets = (echelonTableData[col] || []).slice()
            .sort((a, b) => (toPot(b.target) || 0) - (toPot(a.target) || 0));

        html += `<div class="rbx-ech-col ${tier.cls}">
            <div class="rbx-ech-head"><span>${tier.roman}</span></div>`;

        assets.forEach(asset => {
            if (!asset || !asset.t) return;
            const potNum = toPot(asset.target);
            const potStr = isFinite(potNum) ? ((potNum >= 0 ? '+' : '') + potNum.toFixed(2) + '%') : (asset.target || '');
            const chg = isFinite(potNum) ? (potNum >= 0 ? 'pos' : 'neg') : '';
            const barPct = (isFinite(potNum) && maxPot > 0) ? Math.max(6, Math.min(100, potNum / maxPot * 100)) : 0;
            html += `<div class="rbx-tile" onclick="openStockDetail('${asset.t}', ${col + 1}, this)">
                <div class="tt"><b>${asset.t}</b><span class="${chg}">${potStr}</span></div>
                <div class="nm">${asset.n || asset.t}</div>
                ${barPct > 0 ? `<div class="bar"><i style="width:${barPct.toFixed(1)}%"></i></div>` : ''}
            </div>`;
        });

        html += '</div>';
    }

    container.innerHTML = html;
    hideSkeleton('skeleton-stocks-table');
    updateRebalanceStats();
}

// Открытие карточки деталей тикера
function openStockDetail(ticker, echelon, clickedCell = null) {
    const card = document.getElementById('stockDetailCard');
    if (!card || !ticker) return;
    
    // Снимаем активный класс с предыдущей ячейки
    document.querySelectorAll('.rbx-tile.active, .stocks-cell.active').forEach(c => c.classList.remove('active'));
    
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
    let potNum = parseFloat(String(potentialStr).replace('%', '').replace(',', '.'));
    // «Потенциал» в приложении = показатель ОДХС из терминала «Рынок · Акции»
    // (US-формат чисел). Берём значение из ОДХС, подпись поля остаётся «Потенциал».
    if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }
    if (typeof window.stkFindCompany === 'function') {
        const stkCo = window.stkFindCompany(ticker) ||
                      (ticker !== baseTicker ? window.stkFindCompany(baseTicker) : null);
        const odRaw = stkCo && stkCo.main ? stkCo.main['ОДХС'] : null;
        const odNum = odRaw != null ? parseFloat(String(odRaw).replace(/[^0-9.\-]/g, '')) : NaN;
        if (isFinite(odNum)) potNum = odNum;
    }
    const potDisplay = isFinite(potNum) ? ((potNum >= 0 ? '+' : '') + potNum.toFixed(2) + '%') : (potentialStr || '—');

    // Fallback: в ребалансе лишь кураторский список тикеров, а карточку можно открыть
    // из терминала «Рынок · Акции» (221 компания). Если имя/сектор не нашлись —
    // берём их из терминала через stkFindCompany.
    if ((companyName === ticker || !companySector) && typeof window.stkFindCompany === 'function') {
        const stk = window.stkFindCompany(ticker) ||
                    (ticker !== baseTicker ? window.stkFindCompany(baseTicker) : null);
        if (stk) {
            if (companyName === ticker && stk.name) companyName = stk.name;
            if (!companySector && stk.sector) companySector = stk.sector;
        }
    }

    // Сектор
    const sectorHtml = companySector ? `
        <span class="sd-sector">
            <span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></span>
            ${companySector}
        </span>` : '';

    // В избранном ли тикер (единый список stk_fav_v1)
    const isFav = (typeof window.stkGetFavorites === 'function') &&
                  window.stkGetFavorites().indexOf(ticker) !== -1;

    card.innerHTML = `
        <div class="sd">
            <div class="sd-close" onclick="closeStockDetail()" title="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </div>
            <div class="sd-top">
                <div class="sd-id">
                    <div class="sd-tk-row">
                        <div class="tk">${ticker}</div>
                        <button class="sd-copy" onclick="copyTickerNew('${ticker}')" title="Скопировать тикер" aria-label="Скопировать тикер"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg></button>
                        <button class="sd-fav${isFav ? ' active' : ''}" onclick="toggleStockCardFav('${ticker}', this)" title="${isFav ? 'Убрать из избранного' : 'В избранное'}" aria-label="Избранное"><svg viewBox="0 0 24 24" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg></button>
                    </div>
                    <div class="nm">${companyName}</div>
                </div>
                <span class="sd-tier-circle" style="color:${tier.color};border-color:${tier.color}">${tier.roman}</span>
            </div>
            ${sectorHtml}
            <div class="sd-hr"></div>
            <div class="sd-pot${isFinite(potNum) && potNum < 0 ? ' sd-pot--neg' : ''}">
                <div>
                    <div class="sd-pot-label">Потенциал</div>
                    <div class="sd-pot-val">${potDisplay}</div>
                </div>
                <div class="sd-pot-horizon">
                    <span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M4 10.5h16M9 4v3M15 4v3"/></svg></span>
                    горизонт до 36 мес.
                </div>
            </div>
            <div class="sd-pot-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Потенциал носит условный характер и служит мерой приоритета одной акции над другой, а не прогнозом доходности.</span>
            </div>
            <div class="sd-block sd-desc-block" id="sdDescBlock" style="display:none;">
                <div class="sd-hr"></div>
                <div class="company-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Описание актива</div>
                <div class="sd-desc" id="sdDesc"></div>
            </div>
            <div class="sd-btns sd-btns-single">
                <div class="sd-btn dark" onclick="openTradingViewDirect('${ticker}')">
                    <span class="ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/></svg></span>
                    Открыть график
                </div>
            </div>

            <div class="sd-hr"></div>
            <div class="sd-block" id="sdDivHistory">
                <div class="company-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19V5h5a3.5 3.5 0 0 1 0 7H9"/><line x1="7" y1="15" x2="13" y2="15"/></svg>Дивиденды по годам</div>
                <div class="div-history-loading">Загружаем историю выплат с MOEX…</div>
            </div>

            <div class="sd-hr"></div>
            <div class="sd-block events-section">
                <div class="company-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Новости Smart-Lab</div>
                <div id="sdNewsList">
                    <div class="skeleton-container">
                        <div class="skeleton-news-item"><div class="skeleton-bone s-news-title"></div><div class="skeleton-bone s-news-date"></div></div>
                        <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:75%"></div><div class="skeleton-bone s-news-date"></div></div>
                        <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:85%"></div><div class="skeleton-bone s-news-date"></div></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    card.dataset.ticker = ticker;
    card.dataset.echelon = echelon;

    // Панель выезжает справа поверх всего. Выносим её в <body>, чтобы position:fixed
    // считался от окна, а не от трансформированных предков вкладки (tabFadeIn).
    if (card.parentElement !== document.body) document.body.appendChild(card);

    // Выезжающая панель справа: подложка + открытие, прокрутку панели — в начало
    ensureStockDetailBackdrop().classList.add('open');
    document.body.classList.add('sd-drawer-open');
    card.classList.add('open');
    card.scrollTop = 0;

    // Подгружаем описание, дивиденды и новости Smart-Lab (как во вкладке «О компании»)
    loadStockCardDescription(ticker);
    loadStockCardDividends(ticker);
    loadAndDisplayNews(ticker, 'sdNewsList');

    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Закрыть карточку деталей
// Добавить/убрать тикер из избранного прямо из карточки компании
function toggleStockCardFav(ticker, btn) {
    let nowFav = false;
    if (typeof window.stkToggleFav === 'function') nowFav = window.stkToggleFav(ticker);
    if (btn) {
        btn.classList.toggle('active', nowFav);
        btn.title = nowFav ? 'Убрать из избранного' : 'В избранное';
        if (nowFav) {
            btn.classList.remove('just-faved');
            void btn.offsetWidth; // рестарт анимации
            btn.classList.add('just-faved');
        }
    }
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}
window.toggleStockCardFav = toggleStockCardFav;

function closeStockDetail() {
    const card = document.getElementById('stockDetailCard');
    if (card) {
        card.classList.remove('open');
        card.dataset.ticker = '';
    }
    const backdrop = document.getElementById('stockDetailBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    document.body.classList.remove('sd-drawer-open');
    // Снимаем активный класс со всех ячеек
    document.querySelectorAll('.rbx-tile.active, .stocks-cell.active').forEach(c => c.classList.remove('active'));
}

// Подложка-затемнение за выезжающей карточкой (создаётся один раз)
function ensureStockDetailBackdrop() {
    let backdrop = document.getElementById('stockDetailBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'stockDetailBackdrop';
        backdrop.addEventListener('click', closeStockDetail);
        document.body.appendChild(backdrop);
    }
    return backdrop;
}

// Описание актива в карточке тикера. Справочник companyDescriptions грузится из
// Google Sheets асинхронно, а демо-список акций отрисовывается мгновенно — поэтому
// карточку можно открыть раньше, чем приедут описания. Ждём их и заполняем блок.
function loadStockCardDescription(ticker, attempt = 0) {
    const card = document.getElementById('stockDetailCard');
    const block = document.getElementById('sdDescBlock');
    // карточку могли закрыть или переоткрыть на другом тикере
    if (!block || !card || card.dataset.ticker !== ticker) return;

    const hasDesc = typeof companyDescriptions !== 'undefined';
    // если справочник пуст — на всякий случай инициируем его загрузку
    if (attempt === 0 && (!hasDesc || !Object.keys(companyDescriptions).length)
        && typeof loadCompanyDescriptions === 'function') {
        try { loadCompanyDescriptions(); } catch (e) {}
    }

    const base = ticker.toLowerCase().endsWith('p') ? ticker.slice(0, -1) : ticker;
    let desc = '';
    if (hasDesc) {
        desc = companyDescriptions[ticker] || companyDescriptions[base]
            || companyDescriptions[base.toUpperCase()] || '';
    }

    if (desc) {
        const target = document.getElementById('sdDesc');
        if (target) target.innerHTML = highlightKeywords(desc);
        block.style.display = '';
        return;
    }
    // описания ещё не подъехали — подождём и попробуем снова (до ~5 c)
    if (attempt < 10) {
        setTimeout(() => loadStockCardDescription(ticker, attempt + 1), 500);
    } else {
        block.style.display = 'none';
    }
}

// Дивиденды по годам в карточке тикера — переиспользуем загрузку и рендер
// со страницы «О компании» (MOEX ISS)
async function loadStockCardDividends(ticker) {
    const section = document.getElementById('sdDivHistory');
    if (!section) return;
    try {
        const rows = await fetchDividendRows(ticker);
        renderDivHistory(section, ticker, rows, true);
    } catch (e) {
        const l = section.querySelector('.div-history-loading');
        if (l) l.textContent = 'Не удалось загрузить данные MOEX. Попробуйте позже.';
    }
}

// Закрытие выезжающей карточки по Esc
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const card = document.getElementById('stockDetailCard');
        if (card && card.classList.contains('open')) closeStockDetail();
    }
});

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

// ========================================================================
// АКАДЕМИЯ РЕБАЛАНСИРОВКИ — выезжающая справа шторка (#rbxAcademy)
// Открывается кнопкой «Подробнее» блока «Зачем нужно ребалансировать».
// Паттерн тот же, что у карточки тикера: панель переносится в <body>,
// чтобы position:fixed считался от окна, а не от трансформированных
// предков вкладки (tabFadeIn). Стили — в rebalance-r6.css (.rbxa-*).
// ========================================================================

// Подложка-затемнение за шторкой академии (создаётся один раз)
function rbxAcademyBackdrop() {
    let backdrop = document.getElementById('rbxAcademyBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'rbxAcademyBackdrop';
        backdrop.addEventListener('click', rbxAcademyClose);
        document.body.appendChild(backdrop);
    }
    return backdrop;
}

function rbxAcademyOpen() {
    const panel = document.getElementById('rbxAcademy');
    if (!panel) return;
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    rbxAcademyBackdrop().classList.add('open');
    document.body.classList.add('rbxa-open');
    panel.classList.add('open');
    const body = panel.querySelector('.rbxa-body');
    if (body) body.scrollTop = 0;
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

function rbxAcademyClose() {
    const panel = document.getElementById('rbxAcademy');
    if (panel) panel.classList.remove('open');
    const backdrop = document.getElementById('rbxAcademyBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    document.body.classList.remove('rbxa-open');
}

// Переключение разделов академии (Два уровня / Внутри классов / Раз в год)
function rbxAcademyTab(name) {
    document.querySelectorAll('#rbxAcademy .rbxa-tab').forEach(btn => {
        btn.classList.toggle('act', btn.dataset.atab === name);
    });
    document.querySelectorAll('#rbxAcademy .rbxa-pane').forEach(pane => {
        pane.classList.toggle('act', pane.id === 'rbxaPane-' + name);
    });
    const body = document.querySelector('#rbxAcademy .rbxa-body');
    if (body) body.scrollTop = 0;
}

// Пример годовой ребалансировки по шагам (раздел «Раз в год»).
// Цифры иллюстративные: 100 000 ₽ по плану 50/50, за год акции +50%,
// ОФЗ +18% купонами; ребаланс возвращает доли к целевым.
const RBXA_STEPS = {
    1: {
        st: 50000, ofz: 50000,
        market: 'Собрали портфель по плану 50/50 — риск ровно тот, на который мы готовы.',
        action: 'Ничего не делаем. Работает только умная замена внутри классов.'
    },
    2: {
        st: 75000, ofz: 59000,
        market: 'Акции выросли на 50%, ОФЗ принесли купоны. Доля акций раздулась до 56% — риск уже выше плана.',
        action: 'Подошла годовая сверка — пора выравнивать доли.'
    },
    3: {
        st: 67000, ofz: 67000,
        market: 'Цены те же — меняем только структуру портфеля.',
        action: 'Продаём акции на 8 000 ₽ и перекладываем в ОФЗ. Портфель снова 50/50.'
    },
    4: {
        st: 67000, ofz: 67000,
        market: 'Прибыль от роста акций «переехала» в надёжные облигации.',
        action: 'Риск снова по плану. Упадут акции — сделаем наоборот: продадим часть ОФЗ и купим акции дёшево.'
    }
};

function rbxAcademyStep(n) {
    const step = RBXA_STEPS[n];
    if (!step) return;
    document.querySelectorAll('#rbxAcademy .rbxa-step').forEach(btn => {
        btn.classList.toggle('act', btn.dataset.astep === String(n));
    });
    const fmt = v => v.toLocaleString('ru-RU') + ' ₽';
    const total = step.st + step.ofz;
    const stPct = Math.round(step.st / total * 100);
    const put = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    put('rbxaSimSt', fmt(step.st));
    put('rbxaSimOfz', fmt(step.ofz));
    put('rbxaSimTotal', fmt(total));
    put('rbxaSimShares', stPct + '% / ' + (100 - stPct) + '%');
    put('rbxaSimMarket', step.market);
    put('rbxaSimAction', step.action);
    const stBar = document.getElementById('rbxaSimStBar');
    const ofzBar = document.getElementById('rbxaSimOfzBar');
    if (stBar) stBar.style.width = stPct + '%';
    if (ofzBar) ofzBar.style.width = (100 - stPct) + '%';
}

// Закрытие академии по Esc (карточка тикера обрабатывается своим слушателем)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const panel = document.getElementById('rbxAcademy');
        if (panel && panel.classList.contains('open')) rbxAcademyClose();
    }
});
