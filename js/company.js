// ========================================================================
    
// Исправленная функция копирования
function copyTicker(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Скопировано!");
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
    });
}

// Исправленная функция раскрытия
function toggleOfzDetails(ticker) {
    const detailEl = document.getElementById(`details-${ticker}`);
    const container = document.getElementById(`container-${ticker}`);
    
    const isOpen = detailEl.style.display === 'block';
    
    // Закрываем все остальные (опционально, для чистоты дизайна)
    // document.querySelectorAll('.ofz-lux-details').forEach(el => el.style.display = 'none');
    // document.querySelectorAll('.ofz-row-container').forEach(el => el.classList.remove('active'));

    if (isOpen) {
        detailEl.style.display = 'none';
        container.classList.remove('active');
    } else {
        detailEl.style.display = 'block';
        container.classList.add('active');
    }
}

    // Функция для нового триггера ОФЗ
function toggleOfzGhost() {
    const hiddenRows = document.querySelectorAll('.ofz-row-hidden');
    const allRows = document.querySelectorAll('.ofz-row-container');
    const trigger = document.getElementById('ghostTriggerOfz');
    const text = document.getElementById('ghostTextOfz');

    // Если у нас есть скрытые строки — значит нужно раскрыть
    if (hiddenRows.length > 0) {
        hiddenRows.forEach(row => {
            row.classList.remove('ofz-row-hidden');
            row.style.animation = 'fadeIn 0.4s ease forwards';
        });
        text.innerText = "СКРЫТЬ";
        trigger.classList.add('open');
    } else {
        // Если скрытых нет — значит нужно скрыть всё после 3-й строки
        allRows.forEach((row, index) => {
            if (index > 2) {
                row.classList.add('ofz-row-hidden');
            }
        });
        text.innerText = "ПОКАЗАТЬ ВСЕ";
        trigger.classList.remove('open');
        
        // Скроллим чуть выше, чтобы пользователь не потерялся
        document.querySelector('.ofz-analogs-title').scrollIntoView({ behavior: 'smooth' });
    }

    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

    // НОВАЯ ФУНКЦИЯ КОПИРОВАНИЯ
function copyTickerNew(text) {
    navigator.clipboard.writeText(text).then(() => {
        showLuxuryToast("СКОПИРОВАНО", text);
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
    });
}

// Функция управления люксовой капсулой (универсальная)
function showLuxuryToast(title, message) {
    const notify = document.getElementById('luxuryNotification');
    if (!notify) return;

    // 1. Меняем контент
    const titleEl = notify.querySelector('.notify-title');
    const msgEl = notify.querySelector('.notify-message');
    const iconContainer = notify.querySelector('.notify-icon-circle');
    
    // Сохраняем исходное состояние (для ошибки)
    const oldTitle = titleEl.innerText;
    const oldMsg = msgEl.innerText;
    const oldIcon = iconContainer.innerHTML;
    const oldColor = iconContainer.style.color;

    // Ставим галочку успеха
    titleEl.innerText = title;
    msgEl.innerText = message;
    iconContainer.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    iconContainer.style.color = "#2ecc71"; // Зеленый цвет

    // 2. Показываем
    notify.classList.add('show');

    // 3. Скрываем и возвращаем как было
    setTimeout(() => {
        notify.classList.remove('show');
        // Возвращаем через 500мс (после анимации скрытия), чтобы вернуть состояние "Ошибки"
        setTimeout(() => {
            titleEl.innerText = "Минимальный капитал"; // или верните исходное
            msgEl.innerText = "Введите сумму от 100 000 ₽";
            iconContainer.innerHTML = oldIcon;
            iconContainer.style.color = "";
        }, 500);
    }, 2000);
}

    async function fetchBondDetailsInBackground() {
    const promises = bonds.map(async (b) => {
        try {
            const extra = await fetchBondData(b.t);
            b.nkd = extra.nkd || 0;
            b.matDate = extra.matDate || '—';
        } catch(e) {
            console.log("Error fetching", b.t);
        }
    });
    
    await Promise.all(promises);
    
    // Лог загруженных данных
    console.log('[DATA LOADED] bonds:', bonds.length, 'bondDetailsMap keys:', Object.keys(bondDetailsMap).length);
    bonds.forEach(b => {
        const d = bondDetailsMap[b.t] || {};
        console.log(`[DATA] ${b.t}: p=${b.p}, nkd=${b.nkd}, couponValue=${d.couponValue}, freq=${d.freq}, matDate=${d.matDate}`);
    });
    
    // После загрузки обновляем отображение
    renderOfzList();
    draw();
}

// Функция поиска компании по тикеру (вызывается из карточки акции)
function searchCompanyInternal(ticker) {
    performSearch(ticker);
}

        function performSearch(query) {
    if(!query || query.length < 2) {
        openCompanyPage(null, query);
        return;
    }
    
    const q = query.toUpperCase();
    let results = [];
    
    // 1. Ищем в акциях портфеля (12 шт)
    echelons.forEach(e => {
        e.assets.forEach(a => {
            if(a.t.toUpperCase().includes(q) || a.n.toUpperCase().includes(q)) {
                results.push({...a, type: 'Акция'});
            }
        });
    });
    
    // 2. Ищем в ОФЗ портфеля (8 шт)
    bonds.forEach(b => {
        if(b.t.toUpperCase().includes(q) || b.n.toUpperCase().includes(q)) {
            results.push({...b, type: 'Облигация'});
        }
    });
    
    // 3. НОВОЕ: Ищем в таблице эшелонов (до 48 акций)
    echelonTableData.forEach((column, echelonIndex) => {
        column.forEach(asset => {
            // Проверяем, что актив ещё не добавлен
            const alreadyAdded = results.some(r => r.t === asset.t);
            if (!alreadyAdded && (asset.t.toUpperCase().includes(q) || asset.n.toUpperCase().includes(q))) {
                results.push({
                    ...asset,
                    type: 'Акция',
                    p: 0 // Цена будет загружена в openCompanyPage
                });
            }
        });
    });
    
    const input = document.getElementById('tickerSearchInput');
    input.value = '';
    input.blur();
    
    openCompanyPage(results[0] || null, query);
}
        
        // Потенциал всегда в процентах: абсолютную цель пересчитываем от текущей цены
function fmtPotential(target, price) {
    if (!target || target === '-') return target;
    const s = String(target);
    if (s.includes('%')) return s;
    const tp = parseFloat(s.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
    const p = parseFloat(price) || 0;
    if (tp > 0 && p > 0) {
        const pct = (tp / p - 1) * 100;
        return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    }
    return s;
}

async function openCompanyPage(item, searchQuery = '') {
    const content = document.getElementById('company-content');
    const screenCompany = document.getElementById('screen-company');
    
    // Убираем класс активности при закрытии
    screenCompany.classList.remove('company-screen-active');
    
    if(!item) {
        content.innerHTML = `
            <div class="search-empty-state">
                <div class="icon">🔍</div>
                <div class="title">Ничего не найдено</div>
                <div class="desc">По запросу "${searchQuery}" не найдено результатов.<br>Попробуйте изменить запрос.</div>
            </div>
        `;
        showScreen('screen-company');
        return;
    }
    
    // Показываем skeleton пока грузятся данные
    content.innerHTML = `
        <div class="skeleton-company">
            <div class="skeleton-bone s-back"></div>
            <div class="skeleton-bone s-name"></div>
            <div class="skeleton-bone s-price-big"></div>
            <div class="skeleton-bone s-change"></div>
            <div class="skeleton-bone s-trend"></div>
            <div class="s-actions"><div class="skeleton-bone s-action-btn"></div><div class="skeleton-bone s-action-btn"></div></div>
            <div class="skeleton-bone s-section-title"></div>
            <div class="s-analytics">
                <div class="skeleton-bone s-analytics-tile"></div>
                <div class="skeleton-bone s-analytics-tile"></div>
                <div class="skeleton-bone s-analytics-tile"></div>
                <div class="skeleton-bone s-analytics-tile"></div>
            </div>
            <div class="skeleton-bone s-section-title" style="margin-top:16px"></div>
            <div class="skeleton-news-item"><div class="skeleton-bone s-news-title"></div><div class="skeleton-bone s-news-date"></div></div>
            <div class="skeleton-news-item"><div class="skeleton-bone s-news-title"></div><div class="skeleton-bone s-news-date"></div></div>
            <div class="skeleton-news-item"><div class="skeleton-bone s-news-title"></div><div class="skeleton-bone s-news-date"></div></div>
        </div>
    `;
    showScreen('screen-company');
    
    const isStock = item.type === 'Акция';
    const target = isStock ? item.target : '-';
    
    // Определяем цвет свечения в зависимости от профита
    let glowColor = 'rgba(46, 204, 113, 0.15)'; // зелёный по умолчанию
    let changeClass = 'neutral';
    let changeText = '--';
    let changePercent = 0;
    
    // Загружаем данные о цене и изменении
    try {
        const url = MOEX_PROXY + '?path=' + encodeURIComponent(`/iss/engines/stock/markets/${isStock ? 'shares' : 'bonds'}/securities/${item.t}.json?iss.meta=off&iss.only=securities,marketdata`);
        const res = await fetch(url);
        const data = await res.json();
        const marketcols = data.marketdata.columns;
        const mrows = data.marketdata.data || [];
        const liIdx = marketcols.indexOf('LAST');
        const lcIdx = marketcols.indexOf('LCURRENTPRICE');
        const mpIdx = marketcols.indexOf('MARKETPRICE');
        // Берём строку борда, где есть актуальная цена
        const marketdata = mrows.find(r => r[liIdx] || (lcIdx >= 0 && r[lcIdx])) || mrows[0] || [];
        const seccols = data.securities.columns;
        const srows = data.securities.data || [];
        const paqIdx = seccols.indexOf('PREVADMITTEDQUOTE');
        const ppIdx = seccols.indexOf('PREVPRICE');
        // Закрытие предыдущей сессии (или последняя известная цена после выходных)
        let prevClose = null;
        for (const r of srows) {
            let v = paqIdx >= 0 ? r[paqIdx] : null;
            if (v === null || v === undefined) v = ppIdx >= 0 ? r[ppIdx] : null;
            if (v) { prevClose = v; break; }
        }
        let last = marketdata[liIdx];
        if (!last && lcIdx >= 0) last = marketdata[lcIdx];
        if (!last && mpIdx >= 0) last = marketdata[mpIdx];
        if (!last) last = prevClose;
        
        // Актуальная цена с MOEX важнее переданной (поиск может дать 0)
        if (last) item.p = last;
        else if ((!item.p || item.p === 0) && prevClose) item.p = prevClose;
        
        if (last && prevClose && prevClose > 0) {
            const change = last - prevClose;
            changePercent = (change / prevClose) * 100;
            const sign = change > 0 ? '+' : '';
            
            if (change > 0) {
                changeClass = 'positive';
                glowColor = 'rgba(46, 204, 113, 0.15)';
                changeText = `${sign}${change.toFixed(2)} ₽ (${sign}${changePercent.toFixed(2)}%)`;
            } else if (change < 0) {
                changeClass = 'negative';
                glowColor = 'rgba(231, 76, 60, 0.15)';
                changeText = `${change.toFixed(2)} ₽ (${changePercent.toFixed(2)}%)`;
            } else {
                changeClass = 'neutral';
                changeText = '0.00 ₽ (0.00%)';
            }
        }
    } catch (e) { 
        console.log('Error fetching company details'); 
    }
    
    // Устанавливаем цвет свечения
    screenCompany.style.setProperty('--glow-color', glowColor);
    screenCompany.classList.add('company-screen-active');
    
    // Определяем эшелон для акций
    let echelonNum = 0;
    let echelonName = '';
    if (isStock) {
        echelonNum = echelons.findIndex(e => e.assets.some(a => a.t === item.t)) + 1;
        if (echelonNum > 0) {
            echelonName = ['I Эшелон', 'II Эшелон', 'III Эшелон', 'IV Эшелон'][echelonNum - 1];
        }
    }
    
    // Рассчитываем прогресс к цели (для акций)
    let progressPercent = 0;
    if (isStock && item.target) {
        const targetPrice = parseFloat(item.target.replace(/[^\d.]/g, '')) || 0;
        if (targetPrice > 0 && item.p > 0) {
            progressPercent = Math.min((item.p / targetPrice) * 100, 100);
        }
    }
    
    // Определяем уровень риска
    const riskLevels = ['Низкий', 'Умеренный', 'Средний', 'Высокий'];
    const riskLevel = isStock ? riskLevels[Math.min(echelonNum - 1, 3)] || 'Н/Д' : 'Низкий';
    
    // Генерируем SVG мини-тренд (случайный для демо)
    const trendPoints = generateTrendLine(changePercent >= 0);
    const trendColor = changePercent >= 0 ? '#2ecc71' : '#e74c3c';
    
    // Формируем HTML
    let html = `
        <!-- Верхняя панель -->
        <div class="company-top-bar">
            <div class="company-back-btn" onclick="goBackFromCompany()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </div>
            <div class="company-ticker-badge">
                <span class="ticker-dot"></span>
                <span>${item.t}</span>
                <span style="opacity: 0.5;">•</span>
                <span style="opacity: 0.7;">MOEX</span>
            </div>
        </div>
        
        <!-- Hero секция -->
        <div class="company-hero">
            <div class="company-hero-name">${item.n}</div>
            <div class="company-hero-price">${item.p.toLocaleString('ru-RU')} ₽</div>
            <div class="company-hero-change ${changeClass}">
                ${changeClass === 'positive' ? '↑' : changeClass === 'negative' ? '↓' : '→'} ${changeText}
            </div>
            
            <!-- SVG мини-тренд -->
            <div class="company-trend-svg">
                <svg width="200" height="50" viewBox="0 0 200 50">
                    <defs>
                        <linearGradient id="trendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" style="stop-color:${trendColor};stop-opacity:0.3" />
                            <stop offset="100%" style="stop-color:${trendColor};stop-opacity:1" />
                        </linearGradient>
                    </defs>
                    <polyline class="trend-line" fill="none" stroke="url(#trendGradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${trendPoints}" />
                </svg>
            </div>
        </div>
        
        <!-- Кнопки действий -->
        <div class="company-actions">
            <button class="company-action-btn primary" onclick="openTradingView(event, '${item.t}')">
                <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                График
            </button>
            <button class="company-action-btn" id="divHistoryBtn" onclick="toggleDivHistory(event, '${item.t}', ${isStock})">
                <svg viewBox="0 0 24 24"><path d="M9 19V5h5a3.5 3.5 0 0 1 0 7H9"/><line x1="7" y1="15" x2="13" y2="15"/></svg>
                Дивиденды
            </button>
        </div>

        <!-- Дивиденды по годам (загружается по клику) -->
        <div class="glass-card div-history-section" id="divHistorySection" style="display:none;"></div>
        
        <!-- Описание актива -->
        ${companyDescriptions[item.t] ? `
        <div class="glass-card company-description-section">
            <div class="company-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                Описание актива
            </div>
            <div class="company-description-text">
                ${highlightKeywords(companyDescriptions[item.t])}
            </div>
        </div>
        ` : ''}
        
        <!-- Аналитика -->
        <div class="company-section-title" style="padding: 0 4px; margin-bottom: 12px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>
                <path d="M22 12A10 10 0 0 0 12 2v10z"/>
            </svg>
            Аналитика
        </div>
        <div class="analytics-grid">
            <div class="analytics-tile tile-forecast">
                <div class="analytics-tile-label">Target Forecast</div>
                <div class="analytics-tile-value">${isStock ? fmtPotential(target, item.p) : item.y}</div>
                <div class="analytics-tile-sub">${isStock ? 'Потенциал' : 'Доходность к погашению'}</div>
                ${isStock ? `
                <div class="forecast-progress">
                    <div class="forecast-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                ` : ''}
            </div>
            
            <div class="analytics-tile tile-dividends">
                <div class="analytics-tile-label">Dividends</div>
                <div class="analytics-tile-value">${isStock ? (echelonNum <= 2 ? 'Да' : 'Нет') : 'Купоны'}</div>
                <div class="analytics-tile-sub">${isStock ? 'Выплата дивидендов' : 'Регулярные выплаты'}</div>
            </div>
            
            <div class="analytics-tile tile-risk">
                <div class="analytics-tile-label">Risk Tier</div>
                <div class="analytics-tile-value">${riskLevel}</div>
                <div class="analytics-tile-sub">${isStock ? echelonName || 'Не определён' : 'ОФЗ - гос. гарантия'}</div>
            </div>
            
            <div class="analytics-tile tile-cap">
                <div class="analytics-tile-label">Market Cap</div>
                <div class="analytics-tile-value">${isStock ? 'Large' : 'Gov'}</div>
                <div class="analytics-tile-sub">${isStock ? 'Капитализация' : 'Государственная'}</div>
            </div>
        </div>
        
       <!-- События терминала (новости) -->
        <div class="glass-card events-section">
            <div class="company-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Новости Smart-Lab
            </div>
            
            <div id="company-news-list">
                <div class="skeleton-container">
                    <div class="skeleton-news-item"><div class="skeleton-bone s-news-title"></div><div class="skeleton-bone s-news-date"></div></div>
                    <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:75%"></div><div class="skeleton-bone s-news-date"></div></div>
                    <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:85%"></div><div class="skeleton-bone s-news-date"></div></div>
                </div>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
            // Загружаем новости асинхронно после отрисовки страницы
    loadAndDisplayNews(item.t);
    showScreen('screen-company');
}

// ===== ДИВИДЕНДЫ ПО ГОДАМ (MOEX ISS) =====
var divHistoryCache = {};
var divTitleSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19V5h5a3.5 3.5 0 0 1 0 7H9"/><line x1="7" y1="15" x2="13" y2="15"/></svg>';

// Загрузка и агрегация дивидендов по годам с MOEX (с кэшем). Используется и на
// странице «О компании», и в выезжающей карточке тикера в ребалансе.
async function fetchDividendRows(ticker) {
    if (divHistoryCache[ticker]) return divHistoryCache[ticker];
    const url = MOEX_PROXY + '?path=' + encodeURIComponent('/iss/securities/' + ticker + '/dividends.json?iss.meta=off');
    const res = await fetch(url);
    const data = await res.json();
    const cols = data.dividends.columns;
    const di = cols.indexOf('registryclosedate');
    const vi = cols.indexOf('value');
    // Известные объявленные, но ОТМЕНЁННЫЕ выплаты, которые MOEX держит в реестре
    const CANCELLED_DIVS = {
        'GAZP': { '2022-07-20': 52.53 } // дивиденд за 2021, отменён ГОСА 30.06.2022
    };
    const byYear = {};
    const seen = {};
    (data.dividends.data || []).forEach(function(r) {
        const date = String(r[di] || '');
        const y = date.slice(0, 4);
        const v = parseFloat(r[vi]) || 0;
        if (y.length !== 4) return;
        // дедупликация одинаковых записей реестра
        const key = date + '|' + v;
        if (seen[key]) return;
        seen[key] = true;
        // фильтр отменённых решений
        const cancelled = CANCELLED_DIVS[ticker];
        if (cancelled && cancelled[date] === v) return;
        if (!byYear[y]) byYear[y] = { sum: 0, n: 0 };
        byYear[y].sum += v;
        byYear[y].n++;
    });
    const rows = Object.keys(byYear).sort().reverse().map(function(y) {
        return { year: y, sum: byYear[y].sum, n: byYear[y].n };
    });
    divHistoryCache[ticker] = rows;
    return rows;
}

async function toggleDivHistory(event, ticker, isStock) {
    if (event) event.stopPropagation();
    const section = document.getElementById('divHistorySection');
    if (!section) return;
    // Повторный клик — сворачиваем
    if (section.style.display !== 'none') {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    section.innerHTML = '<div class="company-section-title">' + divTitleSvg + 'Дивиденды по годам</div>' +
        '<div class="div-history-loading">Загружаем историю выплат с MOEX…</div>';
    try { section.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}

    try {
        const rows = await fetchDividendRows(ticker);
        renderDivHistory(section, ticker, rows, isStock);
    } catch (e) {
        const l = section.querySelector('.div-history-loading');
        if (l) l.textContent = 'Не удалось загрузить данные MOEX. Попробуйте позже.';
    }
}

function renderDivHistory(section, ticker, rows, isStock) {
    const title = '<div class="company-section-title">' + divTitleSvg + 'Дивиденды по годам</div>';
    if (!rows.length) {
        const msg = isStock
            ? 'MOEX не вернула историю дивидендных выплат по тикеру ' + ticker + '.'
            : 'По облигациям выплачиваются купоны — история дивидендов для них не ведётся.';
        section.innerHTML = title + '<div class="div-history-empty">' + msg + '</div>';
        return;
    }
    const maxSum = Math.max.apply(null, rows.map(function(r) { return r.sum; }));
    const fmt = function(v) { return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    const list = rows.map(function(r) {
        const w = maxSum > 0 ? Math.max(4, Math.round(r.sum / maxSum * 100)) : 4;
        return '<div class="div-year-row">' +
            '<div class="div-year">' + r.year + '</div>' +
            '<div class="div-bar-wrap"><div class="div-bar" style="width:' + w + '%"></div></div>' +
            '<div class="div-meta">' + r.n + ' ' + divPlural(r.n, 'выплата', 'выплаты', 'выплат') + '</div>' +
            '<div class="div-sum">' + fmt(r.sum) + ' <span class="div-rub">₽</span></div>' +
            '</div>';
    }).join('');
    section.innerHTML = title +
        '<div class="div-history-note">Суммарно на одну акцию за календарный год · реестр MOEX (фактически выплаченные)</div>' + list;
}

function divPlural(n, one, few, many) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
}
window.toggleDivHistory = toggleDivHistory;

    // Функция загрузки и отображения новостей
async function loadAndDisplayNews(ticker, containerId = 'company-news-list') {
    const newsContainer = document.getElementById(containerId);
    if (!newsContainer) return;
    
    // Показываем skeleton для новостей
    newsContainer.innerHTML = `
        <div class="skeleton-container">
            <div class="skeleton-news-item"><div class="skeleton-bone s-news-title"></div><div class="skeleton-bone s-news-date"></div></div>
            <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:75%"></div><div class="skeleton-bone s-news-date"></div></div>
            <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:85%"></div><div class="skeleton-bone s-news-date"></div></div>
        </div>
    `;
    
    // Загружаем новости
    const news = await loadNewsForTicker(ticker);
    
    // Если новостей нет
    if (!news || news.length === 0) {
        newsContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                <div style="font-size: 24px; margin-bottom: 10px;">📭</div>
                Новостей по ${ticker} пока нет
            </div>
        `;
        return;
    }
    
    // Формируем HTML для новостей
    let html = '';
    news.forEach((item) => {
        // Парсим реальную дату из ответа API
        const newsDate = new Date(item.date);
        
        // Проверяем валидность даты
        const isValidDate = !isNaN(newsDate.getTime());
        const displayDate = isValidDate ? newsDate : new Date();
        
        // Форматируем относительную дату для описания
        const relativeDate = getRelativeDateText(displayDate);
        
        html += `
            <div class="event-item" onclick="openExternalLink('${item.link}')" style="cursor: pointer;">
                <div class="event-date">
                    <span class="event-date-day">${displayDate.getDate()}</span>
                    <span class="event-date-month">${getMonthShort(displayDate.getMonth())}</span>
                </div>
                <div class="event-content">
                    <div class="event-title">${item.title.substring(0, 60)}${item.title.length > 60 ? '...' : ''}</div>
                    <div class="event-description" style="display: flex; align-items: center; gap: 5px;">
                        <span style="color: var(--accent-blue);">Smart-Lab</span>
                        <span>•</span>
                        <span>${relativeDate}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    newsContainer.innerHTML = html;
}

// Функция для получения относительной даты (сегодня, вчера, 3 дня назад и т.д.)
function getRelativeDateText(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 60) {
        return diffMinutes <= 1 ? 'Только что' : `${diffMinutes} мин. назад`;
    }
    
    if (diffHours < 24) {
        return `${diffHours} ${getHoursWord(diffHours)} назад`;
    }
    
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} ${getDaysWord(diffDays)} назад`;
    
    // Для более старых новостей показываем полную дату
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

// Склонение слова "час"
function getHoursWord(n) {
    if (n === 1 || n === 21) return 'час';
    if (n >= 2 && n <= 4 || n >= 22 && n <= 24) return 'часа';
    return 'часов';
}

// Склонение слова "день"
function getDaysWord(n) {
    if (n === 1) return 'день';
    if (n >= 2 && n <= 4) return 'дня';
    return 'дней';
}

// Вспомогательная функция: генерация точек для SVG тренда
function generateTrendLine(isPositive) {
    let points = [];
    let y = 25;
    
    for (let x = 0; x <= 200; x += 20) {
        // Добавляем случайность, но с общим трендом вверх или вниз
        const randomDelta = (Math.random() - 0.5) * 15;
        const trendDelta = isPositive ? -1.5 : 1.5;
        y = Math.max(5, Math.min(45, y + randomDelta + trendDelta));
        points.push(`${x},${y}`);
    }
    
    return points.join(' ');
}

// Вспомогательная функция: получить короткое название месяца
function getMonthShort(monthIndex) {
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    return months[monthIndex];
}

// Вспомогательная функция: выделение ключевых слов в описании
function highlightKeywords(text) {
    // Список ключевых слов для выделения
    const keywords = ['нефтегазовый', 'банк', 'ритейл', 'телеком', 'металлургия', 'энергетика', 'IT', 'технологии', 'добыча', 'производство', 'экспорт', 'дивиденды', 'лидер', 'крупнейший'];
    
    let result = text;
    keywords.forEach(keyword => {
        const regex = new RegExp(`(${keyword})`, 'gi');
        result = result.replace(regex, '<span class="highlight">$1</span>');
    });
    
    return result;
}

