    // ========== MOEX PROXY ==========
    var MOEX_PROXY = 'https://functions.yandexcloud.net/d4ejkbncfpob68e9letn';
    const moexUrl = (path) => MOEX_PROXY + '?path=' + encodeURIComponent(path);
    // Отдаём наружу — пульс IMOEX на Главной (home-register.js) ходит через
    // тот же прокси, что и «Рынок», иначе прямой iss.moex.com у части
    // пользователей режется (CORS/сеть) и данные не грузятся.
    window.moexUrl = moexUrl;

    // ========== SKELETON LOADER SYSTEM ==========
    function hideSkeleton(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('hiding');
        setTimeout(() => { el.style.display = 'none'; }, 300);
    }
    function hideSkeletonInstant(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }
    // ========== END: SKELETON LOADER SYSTEM ==========

    // Очистка старых настроек при загрузке
        localStorage.removeItem('invest_settings');
    
        // ========== ИСПРАВЛЕННЫЙ КОД - НАЧАЛО ==========
        document.addEventListener('click', function(event) {
    const sumInput = document.getElementById('sumInput');
    const inputWrapper = document.querySelector('.input-wrapper');
    const currencySymbol = document.getElementById('currencySymbol');
    
    // Игнорируем клики по полю ввода, его обёртке, символу валюты и карточкам стратегий
    if (event.target.closest('.strategy-card') || 
        event.target.closest('.fee-dropdown-container') ||
        event.target.closest('.fee-dropdown-trigger') || // ДОБАВЛЕНО
        event.target.closest('.fee-dropdown-menu') ||    // ДОБАВЛЕНО
        event.target.closest('.custom-strategy-expanded')) {
        return; // Не закрываем клавиатуру при клике на эти элементы
    }
            
            // Если клик НЕ по полю ввода и НЕ по его обёртке - закрываем клавиатуру
            if (sumInput && 
                !sumInput.contains(event.target) && 
                !inputWrapper?.contains(event.target) &&
                !currencySymbol?.contains(event.target)) {
                sumInput.blur();
            }
        });
        // ========== ИСПРАВЛЕННЫЙ КОД - КОНЕЦ ==========

    
        
        var SHEET_ID = '1SFV5dBIsvfX5HKbXBuXHFVvBfw1p1MPPx2uK209ajLM';
        const GID = '1213653337'; 
        var CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

           // Лист с описаниями компаний
        const GID_DESCRIPTIONS = '88183976';
        const CSV_DESCRIPTIONS_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vSl8uP-rbiQbK57e9L5xxu8dHKzN05jNsJukOMclUn0wuaT2UNsnX-PIAaCctInmwDOzffdPuah4bER/pub?gid=${GID_DESCRIPTIONS}&single=true&output=csv`;
        
          // URL вашего Google Apps Script (ЗАМЕНИТЕ НА СВОЙ!)
        const NEWS_API_URL = 'https://script.google.com/macros/s/AKfycbys840HDKQ6JIt2ITZ2cNJ7FS1nlAsI-iUZyxfE9HMNrQZt-MjK7kD3uD9l4EFONSI/exec';
         // Кэш новостей чтобы не загружать повторно
          let newsCache = {};

        // Функция загрузки новостей для тикера
        async function loadNewsForTicker(ticker) {
         // Проверяем кэш 
        if (newsCache[ticker]) {
        return newsCache[ticker];
    }
    
    try {
        const response = await fetch(`${NEWS_API_URL}?ticker=${ticker}`);
        const data = await response.json();
        
        if (!data.error && data.news) {
            newsCache[ticker] = data.news;
            return data.news;
        }
        return [];
    } catch (e) {
        console.error('Ошибка загрузки новостей:', e);
        return [];
    }
}

// Функция форматирования даты новости
function formatNewsDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) return 'Только что';
    if (diffHours < 24) return `${diffHours} ч. назад`;
    if (diffDays < 7) return `${diffDays} дн. назад`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

    

        let bonds = [];
        let bondDataCache = {};
        let monthlyIncomeBonds = []; // New list for the specific calculator
        let bondQtyMap = {}; // Глобальная карта количеств для калькулятора
        let allScheduledPayments = [];
        var brokerFee = 0.0005; // По умолчанию Премиум 
        let currentTax = 0.13;
        let customTax = 0.13;
        let bondCouponsMap = {}; 
        let bondDetailsMap = {};
        let companyDescriptions = {};
        let currentScreen = 'screen-home';
        let lastNavScreen = 'screen-home';
        var isPortfolioCalculated = false;
        let isFirstVisit = true;
        let isUpdatingProgrammatically = false;
        let savedCustomBonds = null;
        let savedCustomStocks = null;
        // Переменные для вертикали ставок
        let ratesData = {
           keyRate: '21.0%',
           depositRate: '21.5%',
           inflation: '9.1%',
           ofz10: '---'
        };
    

                var echelons = [
            { title: 'Надежные', weight: 0.30, assets: [], info: 'КОМПАНИИ, КОТОРЫЕ ПЛАТЯТ ДИВИДЕНДЫ И СТАРАЮТСЯ ИХ ПОВЫШАТЬ' },
            { title: 'Стабильные', weight: 0.40, assets: [], info: 'КОМПАНИИ, КОТОРЫЕ ПЛАТЯТ ДИВИДЕНДЫ, НО ВЫПЛАТЫ РАЗНЯТСЯ' },
            { title: 'Рисковые', weight: 0.15, assets: [], info: 'КОМПАНИИ, КОТОРЫЕ МОГУТ ПЛАТИТЬ, НО НЕ ПЛАТЯТ' },
            { title: 'Венчурные', weight: 0.15, assets: [], info: 'КОМПАНИИ, КОТОРЫЕ НЕ ПЛАТЯТ ДИВИДЕНДОВ' }
        ];

        let echelonTableData = [[], [], [], []];
        
        // Swipe navigation removed

// !!! ВАЖНО: Замените эту ссылку на URL вашего НОВОГО Apps Script для управления пользователями !!!
// Это НЕ тот же URL что LOGGING_URL — нужно создать ОТДЕЛЬНЫЙ скрипт из файла UserManagement_GoogleAppsScript.js
// и развернуть его как веб-приложение (Развернуть → Новое развертывание → Веб-приложение)
const USERS_API_URL = "https://script.google.com/macros/s/AKfycbwjEFXyzldB0vZBMXknvTRXjgVjxbWC16PMR-_7u3Ax59Beld4OWj7VUiYoMiqV6wJCDQ/exec";

// Проверяем настроен ли API
function isApiConfigured() {
    return USERS_API_URL && !USERS_API_URL.includes('ВСТАВЬТЕ_СЮДА');
}

// Глобальное состояние пользователя
window._currentUser = null;
window._isRegistered = false;
window._selectedBroker = '';
window._selectedPlan = 'trial';

                function checkFirstVisit() {
    // Сначала проверяем localStorage — быстрый кэш
    const cached = localStorage.getItem('user_registered');
    
    const tg = window.Telegram?.WebApp;
    const telegramId = tg?.initDataUnsafe?.user?.id;
    
    if (telegramId && isApiConfigured()) {
        // В Telegram и API настроен — проверяем в Google Sheets
        // Но сначала показываем кэш мгновенно если есть
        if (cached) {
            try {
                const cachedUser = JSON.parse(cached);
                window._currentUser = cachedUser;
                window._isRegistered = true;
                isFirstVisit = false;
                document.getElementById('navWrapper').style.display = 'flex';
                populateDashboard(cachedUser);
                showScreen('screen-dashboard');
            } catch(e) {
                showScreen('screen-home');
            }
        }
        // Затем проверяем актуальные данные с сервера (async)
        checkUserRegistration(telegramId);
    } else {
        // Не в Telegram или API не настроен — работаем через localStorage
        if (cached) {
            try {
                const cachedUser = JSON.parse(cached);
                window._currentUser = cachedUser;
                window._isRegistered = true;
                isFirstVisit = false;
                document.getElementById('navWrapper').style.display = 'flex';
                populateDashboard(cachedUser);
                showScreen('screen-dashboard');
                return;
            } catch(e) { /* corrupted cache */ }
        }
        isFirstVisit = true;
        showScreen('screen-home');
    }
}


        function startCalculation() {
    localStorage.setItem('user_visited', 'true');
    isFirstVisit = false;
    showScreen('screen-app');
    
    // Haptic feedback при открытии
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
}
    function openTerminal() {
    console.log('openTerminal called'); // для отладки
    localStorage.setItem('user_visited', 'true');
    isFirstVisit = false;
    
    // Скрываем навигацию (экран расчёта без nav)
    const navWrapper = document.getElementById('navWrapper');
    if (navWrapper) navWrapper.style.removeProperty('display');
    document.body.classList.remove('quiz-mode');
    document.body.classList.add('app-mode');

    // Переключаем экран
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const appScreen = document.getElementById('screen-app');
    if (appScreen) {
        appScreen.classList.add('active');
    }

    // Показываем sticky панель — ОТКЛЮЧЕНО, используется calcCtaBar
    const stickyPanel = document.getElementById('stickyPanel');
    if (stickyPanel) {
        stickyPanel.style.setProperty('display', 'none', 'important');
    }
    
    currentScreen = 'screen-app';

    // Мгновенно сбрасываем позицию тела и внутреннего скролл-контейнера
    window.scrollTo({top: 0, behavior: 'auto'});
    const calcSectionOT = document.getElementById('calcSection');
    if (calcSectionOT) calcSectionOT.scrollTop = 0;
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
}

        function updateMarketStatus() {
    const now = new Date();
    const day = now.getDay(); 
    const hour = now.getHours(); 
    const min = now.getMinutes();
    const dot = document.getElementById('market-status-dot');
    
    if (!dot) {
        console.log('market-status-dot не найден');
        return;
    }
    
    const isWeekday = day >= 1 && day <= 5;
    const isWorkingHours = (hour > 10 || (hour === 10 && min >= 0)) && (hour < 18 || (hour === 18 && min <= 50));
    dot.className = (isWeekday && isWorkingHours) ? 'market-dot dot-online' : 'market-dot dot-offline';
}


    function updateRatesDisplay() {
    // Живые цифры дня на обложке Главной (#panel-home, см. js/home-register.js)
    var hcKey = document.getElementById('hcStatKey');
    if (hcKey) hcKey.innerText = ratesData.keyRate;
    var hcOfz = document.getElementById('hcStatOfz');
    if (hcOfz) hcOfz.innerText = ratesData.ofz10;
    document.getElementById('val-key-rate').innerText = ratesData.keyRate;
    document.getElementById('val-deposit-rate').innerText = ratesData.depositRate;
    document.getElementById('val-inflation').innerText = ratesData.inflation;
    document.getElementById('val-ofz10').innerText = ratesData.ofz10;
    // Show real rates and hide skeleton
    const ratesList = document.getElementById('ratesRowList');
    if (ratesList) ratesList.style.display = '';
    hideSkeleton('skeleton-rates');
}

        async function updateMarketData() {
            const setDynamics = (el, change, tileId) => {
                el.classList.remove('positive', 'negative', 'neutral');
                const tile = document.getElementById(tileId);
                if (tile) {
                    tile.classList.remove('positive', 'negative');
                }
                
                // Иконка стрелки
                let arrowSvg = '';
                
                if (change > 0.01) {
                    el.classList.add('positive');
                    if (tile) tile.classList.add('positive');
                    arrowSvg = `<svg class="trend-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;
                    el.innerHTML = `${arrowSvg}+${change.toFixed(2)}%`;
                } else if (change < -0.01) {
                    el.classList.add('negative');
                    if (tile) tile.classList.add('negative');
                    arrowSvg = `<svg class="trend-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
                    el.innerHTML = `${arrowSvg}${change.toFixed(2)}%`;
                } else {
                    el.classList.add('neutral');
                    arrowSvg = `<svg class="trend-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>`;
                    el.innerHTML = `${arrowSvg}${Math.abs(change).toFixed(2)}%`;
                }
            };
            
            // Анимация накрутки цифр
            const animateValue = (el, endValue, prefix = '', suffix = '', decimals = 0) => {
                const startValue = 0;
                const duration = 1000;
                const startTime = performance.now();
                
                const update = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    // Easing функция для плавности
                    const easeOut = 1 - Math.pow(1 - progress, 3);
                    const currentValue = startValue + (endValue - startValue) * easeOut;
                    
                    if (decimals > 0) {
                        el.innerText = prefix + currentValue.toFixed(decimals).replace('.00', '') + suffix;
                    } else {
                        el.innerText = prefix + Math.round(currentValue).toLocaleString() + suffix;
                    }
                    
                    if (progress < 1) {
                        requestAnimationFrame(update);
                    }
                };
                
                requestAnimationFrame(update);
            };
            
            // Bitcoin
            try {
                const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
                const data = await res.json();
                if(data && data.lastPrice) {
                    const btcValue = Math.round(parseFloat(data.lastPrice));
                    animateValue(document.getElementById('val-btc'), btcValue, '$', '');
                    setDynamics(document.getElementById('dyn-btc'), parseFloat(data.priceChangePercent), 'tile-btc');
                }
            } catch(e) { console.log("BTC fetch error:", e); }

            // MOEX data
            const fetchMoex = (url, valEl, dynEl, tileId, suffix = '') => {
                fetch(url)
                    .then(r => r.json())
                    .then(d => {
                        const marketdata = (d.marketdata && d.marketdata.data.length > 0) ? d.marketdata : ((d.marketdata_yields && d.marketdata_yields.data.length > 0) ? d.marketdata_yields : null);
                        
                        let last, open, prev;
                        let changePercent = 0;

                        const getVal = (block, colName) => {
                            if(!block || !block.columns || !block.data || block.data.length === 0) return null;
                            const idx = block.columns.indexOf(colName);
                            return idx !== -1 ? block.data[0][idx] : null;
                        };

                        if (marketdata) {
                            last = getVal(marketdata, 'LAST') || getVal(marketdata, 'CURRENTVALUE') || getVal(marketdata, 'YIELD');
                            open = getVal(marketdata, 'OPEN');
                            
                            // Приоритет: LASTCHANGEPRCNT → LASTCHANGE → ручной расчёт
                            const lastChangePrcnt = getVal(marketdata, 'LASTCHANGEPRCNT');
                            const lastChange = getVal(marketdata, 'LASTCHANGE');
                            
                            if (lastChangePrcnt != null && lastChangePrcnt !== 0) {
                                changePercent = lastChangePrcnt;
                            } else if (lastChange != null && last && (last - lastChange) > 0) {
                                changePercent = (lastChange / (last - lastChange)) * 100;
                            } else if (last && open && open > 0) {
                                changePercent = ((last - open) / open) * 100;
                            }
                        }

                        if (changePercent === 0 && d.securities && d.securities.data.length > 0) {
                             prev = getVal(d.securities, 'PREVPRICE');
                             if(!last) last = prev; 
                             if(last && prev && prev > 0) {
                                 changePercent = ((last - prev) / prev) * 100;
                             }
                        }
                        
                        if(last) {
                            animateValue(valEl, last, '', suffix, suffix ? 2 : 0);
                            hideSkeleton('skeleton-market-tiles');
                        }
                        setDynamics(dynEl, changePercent, tileId);
                    }).catch(e => {
                        console.log("MOEX error for:", valEl.id, e);
                        valEl.innerText = "---";
                    });
            };

            fetchMoex(moexUrl('/iss/engines/stock/markets/index/securities/IMOEX.json?iss.meta=off&iss.only=securities,marketdata'), document.getElementById('val-imoex'), document.getElementById('dyn-imoex'), 'tile-imoex', '');
            
            // USD/RUB - берём курс ЦБ РФ
            fetch(moexUrl('/iss/statistics/engines/currency/markets/selt/rates.json?iss.meta=off'))
                .then(response => {
                    if (!response.ok) {
                        throw new Error('HTTP error, status = ' + response.status);
                    }
                    return response.json();
                })
                .then(json => {
                    const valEl = document.getElementById('val-usdrub');
                    const dynEl = document.getElementById('dyn-usdrub');
                    const tileId = 'tile-usdrub';
                    
                    // Получаем индексы колонок
                    const columns = json.cbrf.columns;
                    const data = json.cbrf.data[0];
                    
                    // Текущий курс ЦБ РФ
                    const lastIdx = columns.indexOf('CBRF_USD_LAST');
                    const last = data[lastIdx];
                    
                    // Пробуем несколько источников для изменения
                    let changePercent = 0;
                    
                    // 1. Пробуем CBRF_USD_LASTCHANGEPRCNT
                    const changePrcntIdx = columns.indexOf('CBRF_USD_LASTCHANGEPRCNT');
                    if (changePrcntIdx >= 0 && data[changePrcntIdx] != null) {
                        changePercent = data[changePrcntIdx];
                    } else {
                        // 2. Пробуем wap_rates
                        const waprice = json.wap_rates?.data[0]?.[json.wap_rates.columns.indexOf('waprice')];
                        if (last && waprice && waprice > 0) {
                            changePercent = ((last - waprice) / waprice) * 100;
                        } else {
                            // 3. Пробуем CBRF_USD_LASTCHANGE для абсолютного изменения
                            const changeIdx = columns.indexOf('CBRF_USD_LASTCHANGE');
                            if (changeIdx >= 0 && data[changeIdx] != null && last) {
                                const prevRate = last - data[changeIdx];
                                if (prevRate > 0) {
                                    changePercent = (data[changeIdx] / prevRate) * 100;
                                }
                            }
                        }
                    }
                    
                    if (last) {
                        animateValue(valEl, last, '', ' ₽', 2);
                    }
                    setDynamics(dynEl, changePercent, tileId);
                })
                .catch(error => {
                    console.error('USD/RUB CBRF error:', error);
                    document.getElementById('val-usdrub').innerText = '---';
                });
            
             fetch(moexUrl('/iss/engines/stock/markets/bonds/securities/SU26244RMFS2.json?iss.meta=off&iss.only=securities,marketdata'))
                .then(r => r.json())
                .then(d => {
                     const md = d.marketdata || d.marketdata_yields;
                     if(md && md.data.length > 0) {
                         const yIdx = md.columns.indexOf('YIELD');
                         const y = md.data[0][yIdx];
                         if(y) {
                             animateValue(document.getElementById('val-ofz10'), y, '', '%', 2);
                         }
                     }
                }).catch(e => console.log('OFZ fetch error'));
        }

        setInterval(updateMarketData, 30000);

// Если через 4 сек рыночные данные не загрузились — ставим демо-значения
setTimeout(() => {
    const imoexEl = document.getElementById('val-imoex');
    if (imoexEl && (imoexEl.innerText === '---' || imoexEl.innerText === '')) {
        // Демо рыночные данные
        const demoMarket = [
            { id: 'val-imoex', v: '2 847', dyn: 'dyn-imoex', tile: 'tile-imoex', chg: +0.82 },
            { id: 'val-usdrub', v: '88.34 ₽', dyn: 'dyn-usdrub', tile: 'tile-usdrub', chg: -0.31 },
            { id: 'val-btc', v: '$104 250', dyn: 'dyn-btc', tile: 'tile-btc', chg: +2.14 },
        ];
        demoMarket.forEach(m => {
            const el = document.getElementById(m.id);
            if (el) el.innerText = m.v;
            const dynEl = document.getElementById(m.dyn);
            if (dynEl) {
                const sign = m.chg > 0 ? '+' : '';
                const color = m.chg > 0 ? '' : 'negative';
                dynEl.className = 'market-tile-change ' + (m.chg > 0 ? 'positive' : 'negative');
                dynEl.innerHTML = m.chg > 0
                    ? '<svg class="trend-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>' + sign + m.chg.toFixed(2) + '%'
                    : '<svg class="trend-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>' + m.chg.toFixed(2) + '%';
            }
        });
        hideSkeleton('skeleton-market-tiles');
        // Sync dashboard
        const dqs = { 'dqs-imoex': '2 847', 'dqs-usd': '88.34', 'dqs-btc': '$104 250' };
        Object.entries(dqs).forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.innerText = v; });
    }
}, 4000);
        
        
                // Глобальный флаг: пришли ли мы на screen-assets через главное меню
                var assetsFromMainNav = false;

                function showScreen(screenId, fromMainNav) {
            // Список портфельных экранов
            const portfolioScreens = ['screen-portfolio', 'screen-stub', 'screen-assets'];

            // Всегда снимаем register-mode при переходе на любой другой экран
            if (screenId !== 'screen-register') {
                document.body.classList.remove('register-mode');
            }

            // Запоминаем флаг для screen-assets
            if (screenId === 'screen-assets') {
                assetsFromMainNav = !!fromMainNav;
            } else {
                assetsFromMainNav = false;
            }

            // 1. Логика для меню: если это Главная (screen-home)
            if (screenId === 'screen-home') {
                document.body.classList.add('home-mode'); // Включаем "прозрачный" режим
                document.body.classList.remove('compact-nav');
                document.body.classList.remove('dashboard-home-mode');
                document.body.classList.remove('app-mode');
                document.getElementById('navWrapper').style.display = 'flex';
                document.getElementById('stickyPanel').style.display = 'none';
            } else if (screenId === 'screen-dashboard') {
                // Dashboard — compact nav like other screens
                document.body.classList.remove('home-mode');
                document.body.classList.add('compact-nav');
                document.body.classList.remove('dashboard-home-mode');
                document.body.classList.remove('app-mode');
                document.getElementById('navWrapper').style.display = 'flex';
                document.getElementById('stickyPanel').style.display = 'none';
                // Обновляем данные дашборда
                if (window._currentUser) populateDashboard(window._currentUser);
            } else if (screenId === 'screen-register') {
                // Регистрация — без навигации
                document.body.classList.remove('home-mode');
                document.body.classList.remove('compact-nav');
                document.body.classList.remove('dashboard-home-mode');
                document.body.classList.remove('app-mode');
                document.body.classList.add('register-mode');
                document.getElementById('navWrapper').style.display = 'none';
                document.getElementById('stickyPanel').style.display = 'none';
            } else if (screenId === 'screen-vanguard') {
                // Тест Vanguard — без навигации и sticky панели
                document.body.classList.remove('home-mode');
                document.body.classList.remove('dashboard-home-mode');
                document.body.classList.remove('compact-nav');
                document.body.classList.remove('app-mode');
                document.body.classList.add('quiz-mode');
                document.getElementById('stickyPanel').style.display = 'none';
            } else if (screenId === 'screen-app') {
                // Экран расчёта — без навигации, с кнопкой CTA
                document.body.classList.remove('home-mode');
                document.body.classList.remove('dashboard-home-mode');
                document.body.classList.remove('compact-nav');
                document.body.classList.remove('quiz-mode');
                document.body.classList.add('app-mode');
                const nw = document.getElementById('navWrapper');
                if (nw) nw.style.removeProperty('display');
                const stickyPanel = document.getElementById('stickyPanel');
                if (stickyPanel) stickyPanel.style.setProperty('display', 'none', 'important');
            } else {
                document.body.classList.remove('home-mode');
                document.body.classList.remove('dashboard-home-mode');
                document.body.classList.remove('app-mode');
                // Восстанавливаем навигацию (могла быть скрыта на screen-app)
                document.getElementById('navWrapper').style.display = 'flex';

                // Компактный режим: на всех страницах кроме главной и портфельных
                if (!portfolioScreens.includes(screenId) || (screenId === 'screen-assets' && assetsFromMainNav)) {
                    document.body.classList.add('compact-nav');
                } else {
                    document.body.classList.remove('compact-nav');
                }

                // Управление видимостью stickyPanel
                const stickyPanel = document.getElementById('stickyPanel');
                if (stickyPanel) stickyPanel.style.display = 'none';
            }

            // Старая логика функции (оставляем как было)
            if(screenId !== 'screen-interesting' && screenId !== 'screen-company') {
                lastNavScreen = screenId;
                collapseSearch(false);
            }
            
            currentScreen = screenId;
            
            // Показываем нужный экран
            const targetScreen = document.getElementById(screenId);
            document.querySelectorAll('.screen').forEach(s => {
                // При свайпе не убираем active/display с целевого экрана — он уже виден
                if (window._swipeNavigation && s === targetScreen) return;
                s.classList.remove('active');
            });
            if(targetScreen) {
                targetScreen.classList.add('active');
            }
            
            // Обновляем навигацию
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            document.getElementById('nav-search').classList.remove('active');
            
            // Подсветка кнопок
            let navId = `nav-${screenId.split('-')[1]}`;
            // Dashboard использует кнопку "домик"
            if (screenId === 'screen-dashboard') navId = 'nav-home';
            const navBtn = document.getElementById(navId);
            if (navBtn) navBtn.classList.add('active');
            
            if(screenId === 'screen-interesting' || screenId === 'screen-company') {
                document.getElementById('nav-search').classList.add('active');
            }
            
            // При переходе на экран ребалансировки - рендерим таблицу акций
            if (screenId === 'screen-assets') {
                renderAuroraStocksTable();
                renderAuroraOfzList();
            }
            
            // Action Panel логика - используем новую панель V2
            const portfolioActionPanelV2 = document.getElementById('portfolioActionPanelV2');
            if (portfolioActionPanelV2) {
                if (screenId === 'screen-portfolio' && isPortfolioCalculated) {
                    portfolioActionPanelV2.style.display = 'flex';
                    // Синхронизируем данные при переключении на портфель
                    if (typeof syncPortfolioDataToV2 === 'function') {
                        syncPortfolioDataToV2();
                    }
                } else {
                    portfolioActionPanelV2.style.display = 'none';
                }
            }
            
            // Показываем/скрываем 3 иконки действий в заголовке портфеля
            const portfolioActionBtns = document.getElementById('portfolioActionBtns');
            if (portfolioActionBtns) {
                portfolioActionBtns.style.display = (screenId === 'screen-portfolio' && isPortfolioCalculated) ? 'flex' : 'none';
            }
            
            // Скрываем старую панель
            const portfolioActionPanel = document.getElementById('portfolioActionPanel');
            if (portfolioActionPanel) {
                portfolioActionPanel.style.display = 'none';
            }
            
            if (screenId === 'screen-app') {
                // Мгновенный сброс тела + внутреннего скролла — без анимации, иначе header уходит под Telegram-кнопки
                window.scrollTo({top: 0, behavior: 'auto'});
                const calcSection = document.getElementById('calcSection');
                if (calcSection) calcSection.scrollTop = 0;
            } else {
                window.scrollTo({top: 0, behavior: window._swipeNavigation ? 'auto' : 'smooth'});
            }
            if (!window._swipeNavigation && window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');

                    if (typeof checkMenuVisibility === 'function') {
        checkMenuVisibility(screenId);
    }
                    
        }


        
        function expandSearch() {
            const backBtn = document.querySelector('#expandedNav .nav-back-island');
            const activeNavId = `nav-${lastNavScreen.split('-')[1]}`;
            const activeNav = document.getElementById(activeNavId);

            if (activeNav && backBtn) {
                const iconSvg = activeNav.querySelector('svg').cloneNode(true);
                backBtn.innerHTML = '';
                backBtn.appendChild(iconSvg);
            }
            
            document.getElementById('standardNav').classList.add('hidden');
            document.getElementById('nav-search').style.display = 'none';
            document.getElementById('expandedNav').classList.add('active');
            showScreen('screen-interesting');
            setTimeout(() => {
                document.getElementById('tickerSearchInput').focus();
            }, 300);
        }

        function collapseSearch(goBack = true) {
            document.getElementById('expandedNav').classList.remove('active');
            document.getElementById('standardNav').classList.remove('hidden');
            document.getElementById('nav-search').style.display = 'flex';
            document.getElementById('tickerSearchInput').blur();
            document.getElementById('tickerSearchInput').value = '';
            
            if(goBack) showScreen(lastNavScreen);
        }

        function goBackFromCompany() {
            showScreen('screen-interesting');
        }

        function handleSearchKeyup(event) {
            if(event.keyCode === 13) {
                performSearch(event.target.value);
            }
        }

        // Функция показа уведомления (принимает необязательные заголовок и текст)
function showLuxuryNotification(customTitle, customMessage) {
    const notify = document.getElementById('luxuryNotification');
    if (!notify) return;

    const titleEl = notify.querySelector('.notify-title');
    const msgEl = notify.querySelector('.notify-message');
    const defaultTitle = 'Минимальный капитал';
    const defaultMsg = 'Введите сумму от 100 000 ₽';

    if (customTitle && titleEl) titleEl.innerText = customTitle;
    if (customMessage && msgEl) msgEl.innerText = customMessage;

    // 1. Показываем (добавляем класс)
    notify.classList.add('show');

    // 2. Haptic Feedback (Вибрация ошибки)
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
    }

    // 3. Прячем через 3.5 секунды и возвращаем исходный текст
    setTimeout(() => {
        notify.classList.remove('show');
        setTimeout(() => {
            if (titleEl) titleEl.innerText = defaultTitle;
            if (msgEl) msgEl.innerText = defaultMsg;
        }, 500);
    }, 3500);
}

// Основная функция расчета
function calculateAndShowPortfolio() {
    // 1. Проверка СУММЫ (как было)
    const sum = getSumInputValue();
    if (sum < 100000) {
        showLuxuryNotification();
        const inputBlock = document.querySelector('.input-wrapper');
        if (inputBlock) {
            inputBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    // 2. ПРОВЕРКА: КОМИССИЯ БРОКЕРА
    if (!isFeeSelected) {
        showLuxuryNotification('Комиссия брокера', 'Выберите тариф брокера');
        const feeBlock = document.querySelector('#feeDropdownTrigger');
        if (feeBlock) {
            feeBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
            feeBlock.classList.add('shake-error');
            setTimeout(() => feeBlock.classList.remove('shake-error'), 500);
        }
        return; // ОСТАНАВЛИВАЕМ ПЕРЕХОД
    }

    // 3. УСПЕХ (Все проверки пройдены)
    try {
        draw();
        savePortfolio();
        isPortfolioCalculated = true;
        
        document.getElementById('portfolio-empty').style.display = 'none';
        document.getElementById('portfolio-content').style.display = 'block';
        
        // Показываем 3 иконки действий
        const actionBtns = document.getElementById('portfolioActionBtns');
        if(actionBtns) actionBtns.style.display = 'flex';
        
        // Показываем новую панель действий
        const actionPanelV2 = document.getElementById('portfolioActionPanelV2');
        if(actionPanelV2) actionPanelV2.style.display = 'flex';
        
        // Скрываем старую панель (на случай если она есть)
        const actionPanel = document.getElementById('portfolioActionPanel');
        if(actionPanel) actionPanel.style.display = 'none';
        
        // Синхронизируем данные в новый дизайн
        syncPortfolioDataToV2();
        
        // Сбрасываем на страницу "К ПОКУПКЕ"
        switchPortfolioPage('buy');
        
        // Логика переключателя Денежный поток / Растущая часть
        const slider = document.getElementById('ratioSlider');
        const currentBondPct = slider ? parseInt(slider.value) : 50;
        const tabSwitcher = document.getElementById('portfolioTabSwitcher');
        
        if (currentBondPct === 0) {
            // 100% акций — показываем только Растущую часть
            if (tabSwitcher) tabSwitcher.style.display = 'none';
            switchPortfolioContentTab('stocks');
        } else if (currentBondPct === 100) {
            // 100% облигаций — показываем только Денежный поток
            if (tabSwitcher) tabSwitcher.style.display = 'none';
            switchPortfolioContentTab('bonds');
        } else {
            // Смешанный — показываем обе вкладки
            if (tabSwitcher) tabSwitcher.style.display = '';
            switchPortfolioContentTab('bonds');
        }
        
        showScreen('screen-portfolio');
    } catch(e) {
        console.error('Error calculating portfolio:', e);
    }
}


        function toggleAccordion(id) {
            const el = document.getElementById(id);
            el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
        }

    /* ============================================
       6.3 Анимация Накручивания Цифр (Evolution Design)
       При загрузке страницы цифры "накручиваются" от 0 до значения
       ============================================ */
    function animateCountUp(element, targetValue, duration = 800) {
        if (!element) return;
        
        // Парсим целевое значение
        const isPercentage = targetValue.includes('%');
        const hasComma = targetValue.includes(',');
        const hasDot = targetValue.includes('.');
        
        // Извлекаем числовое значение
        let numericValue = parseFloat(targetValue.replace(/[^0-9.,\-]/g, '').replace(',', '.'));
        if (isNaN(numericValue)) {
            element.textContent = targetValue;
            return;
        }
        
        // Определяем количество десятичных знаков
        let decimals = 0;
        if (hasDot || hasComma) {
            const parts = targetValue.replace(',', '.').split('.');
            if (parts[1]) decimals = parts[1].replace(/[^0-9]/g, '').length;
        }
        
        const startTime = performance.now();
        const startValue = 0;
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing функция - easeOutExpo для плавного завершения
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            
            const currentValue = startValue + (numericValue - startValue) * eased;
            
            // Форматируем значение
            let formattedValue = currentValue.toFixed(decimals);
            if (hasComma) formattedValue = formattedValue.replace('.', ',');
            
            // Добавляем суффикс
            if (isPercentage) formattedValue += '%';
            
            element.textContent = formattedValue;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                // Устанавливаем точное конечное значение
                element.textContent = targetValue;
            }
        }
        
        requestAnimationFrame(update);
    }
    
    // Запуск анимации для экрана Интересное
    function initInterestingAnimations() {
        // Курсы валют
        const marketValues = [
            { id: 'val-imoex', target: null },
            { id: 'val-usdrub', target: null },
            { id: 'val-btc', target: null }
        ];
        
        // Ставки
        const rateValues = [
            { id: 'val-inflation', target: '9.1%' },
            { id: 'val-deposit-rate', target: '21.5%' },
            { id: 'val-key-rate', target: '21.0%' },
            { id: 'val-ofz10', target: null }
        ];
        
        // Анимируем только значения, которые уже установлены
        rateValues.forEach((item, index) => {
            const el = document.getElementById(item.id);
            if (el && el.textContent && el.textContent !== '---' && el.textContent !== '---%') {
                const target = el.textContent;
                el.textContent = '0%';
                setTimeout(() => {
                    animateCountUp(el, target, 600 + index * 100);
                }, index * 80);
            }
        });
    }
    
    // Наблюдатель за переключением на экран Интересное
    const originalShowScreen = typeof showScreen === 'function' ? showScreen : null;
    
    // Переопределим showScreen чтобы запускать анимацию
    if (typeof window !== 'undefined') {
        const _originalShowScreen = window.showScreen;
        window.showScreenWithAnimation = function(screenId) {
            if (_originalShowScreen) _originalShowScreen(screenId);
            
            if (screenId === 'screen-interesting') {
                setTimeout(initInterestingAnimations, 100);
            }
        };
    }
    
    // Новая функция для аккордеона калькулятора в "Интересное"
// Флаг: инпут калькулятора был только что в фокусе
let _calcInputWasActive = false;

// Отслеживаем blur на инпутах калькулятора
document.addEventListener('focusout', function(e) {
    if (e.target && (e.target.id === 'monthlySumInput' || e.target.classList.contains('calc-input'))) {
        _calcInputWasActive = true;
        setTimeout(() => { _calcInputWasActive = false; }, 300);
    }
});

function toggleCalcAccordion() {
    const accordion = document.getElementById('calcAccordion');
    if (!accordion) return;
    
    // Если инпут калькулятора только что потерял фокус — не сворачиваем, клавиатура уже закрылась
    if (_calcInputWasActive) {
        _calcInputWasActive = false;
        return;
    }
    
    accordion.classList.toggle('collapsed');
    
    const isOpen = !accordion.classList.contains('collapsed');
    
    // Скрываем баннер когда калькулятор открыт, показываем когда свёрнут
    const banner = document.getElementById('ndIncomeBanner');
    if (banner) {
        banner.style.display = isOpen ? 'none' : '';
    }
    
    // При открытии — скроллим contentArea к аккордеону чтобы он не выглядел обрезанным
    if (isOpen) {
        var contentArea = document.getElementById('contentArea');
        if (contentArea) {
            // Небольшая задержка чтобы дать display:block сработать
            setTimeout(function() {
                var accTop = accordion.offsetTop;
                // Скроллим так чтобы шапка аккордеона была у самого верха с небольшим отступом
                contentArea.scrollTo({ top: accTop - 8, behavior: 'smooth' });
            }, 30);
        }
    }
    
    // Вращаем шеврон баннера
    const chevron = document.querySelector('#ndIncomeBanner .nd-ib-chevron svg');
    if (chevron) {
        chevron.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        chevron.style.transition = 'transform .25s';
    }
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    } else if (navigator.vibrate) {
        navigator.vibrate(5);
    }
}

// Toggle для секции "Смотреть далее" на вкладке Интересное
function toggleInterestingMore() {
    const trigger = document.getElementById('interestingGhostTrigger');
    const section = document.getElementById('infographicSection');
    const text = document.getElementById('interestingGhostText');
    
    if (!trigger || !section) return;
    
    const isOpen = trigger.classList.contains('open');
    
    if (isOpen) {
        // Закрываем
        trigger.classList.remove('open');
        section.style.display = 'none';
        text.textContent = 'СМОТРЕТЬ ДАЛЕЕ';
    } else {
        // Открываем
        trigger.classList.add('open');
        section.style.display = 'block';
        text.textContent = 'СКРЫТЬ';
    }
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    } else if (navigator.vibrate) {
        navigator.vibrate(5);
    }
}

        function toggleCouponSection() {
            const content = document.getElementById('couponContent');
            const arrow = document.getElementById('couponArrow');
            content.classList.toggle('active');
            arrow.classList.toggle('rotated');
        }

        function toggleEchelonTable(btn) {
            const wrapper = document.getElementById('echelon-wrapper');
            wrapper.classList.toggle('collapsed');
            if(btn && btn.classList) btn.classList.toggle('open');
        }

        function toggleOfzTable(btn) {
            const wrapper = document.getElementById('ofz-wrapper');
            wrapper.classList.toggle('collapsed');
            if(btn && btn.classList) btn.classList.toggle('open');
        }
        
        function toggleOfzDetails(id) {
            const el = document.getElementById(id);
            if(el) el.classList.toggle('active');
        }
        
        function toggleInfoBlock(headerElement) {
            event.stopPropagation();
            let nextEl = headerElement.nextElementSibling;
            while(nextEl) {
                if (nextEl.classList.contains('info-expanded-block')) {
                    nextEl.classList.toggle('show');
                    break;
                }
                nextEl = nextEl.nextElementSibling;
            }
        }

        function toggleEchelonTip(event, tipId) {
            event.stopPropagation();
            const allTips = document.querySelectorAll('.echelon-tip');
            allTips.forEach(t => {
                if(t.id !== tipId) t.classList.remove('show');
            });
            const tip = document.getElementById(tipId);
            if(tip) tip.classList.toggle('show');
        }

        function showYieldInfo(event) {
            event.stopPropagation();
            const infoBox = document.getElementById('yield-info-box');
            if (infoBox) {
                infoBox.classList.toggle('show');
            }
        }
        
        function toggleTheme() {
            const body = document.body;
            const btn = document.getElementById('themeBtn');
            const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
            const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            if (body.classList.contains('dark-mode')) {
                body.classList.remove('dark-mode'); body.classList.add('light-mode');
                btn.innerHTML = moonIcon; localStorage.setItem('user_theme', 'light');
            } else {
                body.classList.remove('light-mode');
                body.classList.add('dark-mode'); btn.innerHTML = sunIcon; localStorage.setItem('user_theme', 'dark');
            }
        }

        function initTheme() {
            const savedTheme = localStorage.getItem('user_theme');
            const btn = document.getElementById('themeBtn');
            const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
            const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
            // Стартовая вкладка по пути: корень «/» (или /home) — это Главная.
            var _lt = location.pathname.replace(/^\//, '').replace(/\/$/, '');
            var landingHome = (_lt === '' || _lt === 'home');
            // Главная ЗАДУМАНА тёмной: при заходе на неё дефолт всегда тёмный,
            // даже если глобально выбрана светлая (переключатель на Главной при
            // этом продолжает работать — enforce только при загрузке).
            // На остальных вкладках уважаем явный выбор пользователя (user_theme).
            // Нет выбора вообще — тоже тёмная (тёмный — общий дефолт продукта).
            if (savedTheme === 'light' && !landingHome) { document.body.classList.add('light-mode'); btn.innerHTML = moonIcon; }
            else { document.body.classList.add('dark-mode'); btn.innerHTML = sunIcon; }
        }

        function saveSettings() {
    // Автосохранение отключено
    // Настройки сбрасываются при каждом открытии
}

    // ========== НОВАЯ ФУНКЦИЯ - НАЧАЛО ==========
function savePortfolio() {
    try {
        const portfolioData = {
            sum: getSumInputValue(),
            ratio: parseInt(document.getElementById('ratioSlider').value),
            fee: brokerFee,
            tax: currentTax,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('portfolio_snapshot', JSON.stringify(portfolioData));
        console.log('Portfolio saved:', portfolioData);
    } catch(e) {
        console.error('Error saving portfolio:', e);
    }
}
// ========== НОВАЯ ФУНКЦИЯ - КОНЕЦ ==========

       /* ========== NEW LOGIC FOR GHOST SLIDER ========== */

// Функция переключения состояния (Открыть/Закрыть)
