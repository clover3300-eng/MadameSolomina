        async function fetchBondData(code) {
    if (!code) return { nkd: 0, matDate: '—', price: 0 };
    
    // Проверяем кэш
    if (bondDataCache[code]) {
        console.log(`[CACHE] Данные из кэша для ${code}`);
        return bondDataCache[code];
    }
    
    try {
        // ПРЯМОЙ ЗАПРОС (как было раньше)
        const url = MOEX_PROXY + '?path=' + encodeURIComponent(`/iss/engines/stock/markets/bonds/securities/${code}.json?iss.meta=off&iss.only=securities,marketdata`);
        
        console.log(`[NET] Запрос к MOEX: ${code}`);
        const res = await fetch(url);
        
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        
        const data = await res.json(); 
        
        const sec_cols = data.securities.columns; 
        const sec_row = data.securities.data[0];
        
        let lastPrice = 0;
        
        // 1. Ищем цену в рыночных данных (перебираем ВСЕ строки — разные boardid)
        if (data.marketdata && data.marketdata.data.length > 0) {
             const m_cols = data.marketdata.columns;
             const lastIdx = m_cols.indexOf('LAST');
             const prevIdx = m_cols.indexOf('PREVPRICE');
             
             for (let i = 0; i < data.marketdata.data.length; i++) {
                 const m_row = data.marketdata.data[i];
                 if (lastIdx !== -1 && m_row[lastIdx]) {
                     lastPrice = m_row[lastIdx];
                     break;
                 }
             }
             
             if (!lastPrice) {
                 for (let i = 0; i < data.marketdata.data.length; i++) {
                     const m_row = data.marketdata.data[i];
                     if (prevIdx !== -1 && m_row[prevIdx]) {
                         lastPrice = m_row[prevIdx];
                         break;
                     }
                 }
             }
        }
        
        // 2. Если цены всё еще нет, ищем в SECURITIES (перебираем все строки)
        if (!lastPrice && data.securities && data.securities.data.length > 0) {
             const prevPriceIdx = sec_cols.indexOf('PREVPRICE');
             for (let i = 0; i < data.securities.data.length; i++) {
                 const row = data.securities.data[i];
                 if (prevPriceIdx !== -1 && row[prevPriceIdx]) {
                     lastPrice = row[prevPriceIdx];
                     break;
                 }
             }
        }

        // Обновляем данные для графиков (ваша старая логика)
        if (sec_row) {
            bondCouponsMap[code] = { date: sec_row[sec_cols.indexOf('NEXTCOUPON')], value: parseFloat(sec_row[sec_cols.indexOf('COUPONVALUE')]) || 0 };
            
            const couponPeriod = parseFloat(sec_row[sec_cols.indexOf('COUPONPERIOD')]) || 0;
            const freq = couponPeriod > 0 ? Math.round(365 / couponPeriod) : 0;
            
            bondDetailsMap[code] = {
                matDate: sec_row[sec_cols.indexOf('MATDATE')] || '—',
                couponValue: parseFloat(sec_row[sec_cols.indexOf('COUPONVALUE')]) || 0,
                nextCoupon: sec_row[sec_cols.indexOf('NEXTCOUPON')] || '—',
                couponYield: sec_row[sec_cols.indexOf('COUPONPERCENT')] || '—',
                freq: freq,
                face: (parseFloat(sec_row[sec_cols.indexOf('FACEVALUE')]) > 0) ? parseFloat(sec_row[sec_cols.indexOf('FACEVALUE')]) : 1000
            };
        }

        // Котировка MOEX — в % от номинала: рубли = % × FACEVALUE / 100. У ОФЗ номинал
        // 1000 ₽ (то же ×10, что и раньше), но у корпоративных/амортизированных бумаг
        // номинал другой — берём настоящий из securities. Валютные бонды (FACEUNIT ≠ RUB)
        // этим не решаются: их цена получится в валюте номинала.
        const faceIdx = sec_cols ? sec_cols.indexOf('FACEVALUE') : -1;
        const faceVal = (sec_row && faceIdx >= 0 && parseFloat(sec_row[faceIdx]) > 0) ? parseFloat(sec_row[faceIdx]) : 1000;
        const finalPrice = lastPrice > 0 ? (lastPrice * faceVal / 100) : 0;

        const result = {
            nkd: sec_row ? (parseFloat(sec_row[sec_cols.indexOf('ACCRUEDINT')]) || 0) : 0,
            matDate: (sec_row && sec_row[sec_cols.indexOf('MATDATE')]) || '—',
            price: finalPrice,
            face: faceVal
        };
        
        // Сохраняем в кэш
        bondDataCache[code] = result;
        
        console.log(`[SUCCESS] ${code}: Цена ${result.price} (из ${lastPrice}%), НКД ${result.nkd}`);
        return result;

    } catch (e) { 
        console.error(`[ERROR] Ошибка загрузки ${code}:`, e);
        // Возвращаем нули, если сеть упала
        return { nkd: 0, matDate: '—', price: 0 }; 
    }
}

    async function loadCompanyDescriptions() {
    try {
        const response = await fetch(CSV_DESCRIPTIONS_URL);
        if (!response.ok) return;
        
        const text = await response.text();
        const rows = text.split('\n').map(row => 
            row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/"/g, '').trim())
        );
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i] && rows[i].length > 8) {
                const ticker = rows[i][4] ? String(rows[i][4]).trim() : null;
                const description = rows[i][8] ? String(rows[i][8]).trim() : '';
                if (ticker && description) {
                    companyDescriptions[ticker] = description;
                }
            }
        }
        console.log('Описания загружены:', Object.keys(companyDescriptions).length);
    } catch (e) {
        console.error('Ошибка загрузки описаний:', e);
    }
}

        
// ===== DEMO DATA FALLBACK =====
// Загружается когда Google Sheets / API недоступны (артефакты, оффлайн и т.д.)

function loadDemoData() {
    console.log('[DEMO] Loading demo data (API unavailable)');

    // Ставки
    ratesData = { keyRate: '21.0%', depositRate: '21.5%', inflation: '9.13%', ofz10: '15.8%' };
    updateRatesDisplay();

    // Облигации (ОФЗ) — 8 реальных бумаг
    bonds = [
        { t: 'SU26244RMFS2', n: 'ОФЗ 26244', p: 938.50, y: '16.2%', nkd: 12.3, matDate: '2034-03-15' },
        { t: 'SU26243RMFS4', n: 'ОФЗ 26243', p: 961.20, y: '15.8%', nkd: 8.7,  matDate: '2033-05-19' },
        { t: 'SU26240RMFS0', n: 'ОФЗ 26240', p: 979.40, y: '15.5%', nkd: 21.4, matDate: '2036-07-30' },
        { t: 'SU26241RMFS8', n: 'ОФЗ 26241', p: 954.80, y: '16.0%', nkd: 5.2,  matDate: '2032-11-17' },
        { t: 'SU26238RMFS4', n: 'ОФЗ 26238', p: 986.10, y: '15.3%', nkd: 18.9, matDate: '2041-05-15' },
        { t: 'SU26239RMFS2', n: 'ОФЗ 26239', p: 971.30, y: '15.6%', nkd: 11.1, matDate: '2031-07-23' },
        { t: 'SU26236RMFS8', n: 'ОФЗ 26236', p: 944.70, y: '16.1%', nkd: 3.8,  matDate: '2028-05-17' },
        { t: 'SU26230RMFS1', n: 'ОФЗ 26230', p: 993.20, y: '15.1%', nkd: 24.6, matDate: '2039-03-16' },
    ];

    // bondDetailsMap
    bonds.forEach((b, i) => {
        bondDetailsMap[b.t] = {
            matDate: b.matDate,
            couponValue: 35 + i * 2,
            nextCoupon: '2025-' + String(i + 1).padStart(2,'0') + '-15',
            couponYield: b.y,
            freq: 2
        };
        bondCouponsMap[b.t] = {
            date: bondDetailsMap[b.t].nextCoupon,
            value: bondDetailsMap[b.t].couponValue
        };
        bondDataCache[b.t] = { nkd: b.nkd, matDate: b.matDate, price: b.p };
    });

    // Ежемесячный доход — 12 строк выплат (по месяцам), облигации распределяем циклично
    // Реальные данные: 12 строк из Google Sheets (rows 2..13)
    // Демо: создаём 12 выплат из 8 ОФЗ — каждая платит купон 2 раза в год
    const monthNames = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    // 8 ОФЗ × 2 купона в год = 16 выплат → берём 12 чтобы покрыть все месяцы
    // 6 уникальных ОФЗ × 2 купона в год = 12 строк (как в реальных данных)
    const couponSchedule = [
        { month: '01', bondIdx: 0 }, { month: '02', bondIdx: 1 },
        { month: '03', bondIdx: 2 }, { month: '04', bondIdx: 3 },
        { month: '05', bondIdx: 4 }, { month: '06', bondIdx: 5 },
        { month: '07', bondIdx: 0 }, { month: '08', bondIdx: 1 },
        { month: '09', bondIdx: 2 }, { month: '10', bondIdx: 3 },
        { month: '11', bondIdx: 4 }, { month: '12', bondIdx: 5 },
    ];
    // Реалистичные дни выплат по 6 ОФЗ (один день для обоих купонов выпуска) — формат DD.MM.YYYY
    const couponDays = ['12', '19', '07', '24', '16', '28'];
    allScheduledPayments = couponSchedule.map(({ month, bondIdx }) => {
        const b = bonds[bondIdx];
        return {
            dateStr: (couponDays[bondIdx] || '15') + '.' + month + '.2026',
            displayName: b.n,
            paymentTicker: b.t,
            staticCouponVal: 35 + bondIdx * 2
        };
    });

    // Только уникальные ОФЗ из расписания выплат (как в реальных данных из Sheets)
    var usedTickers = {};
    allScheduledPayments.forEach(function(p) {
        if (!usedTickers[p.paymentTicker]) usedTickers[p.paymentTicker] = true;
    });
    monthlyIncomeBonds = bonds.filter(function(b) {
        return usedTickers[b.t];
    }).map(function(b) {
        return { t: b.t, n: b.n, y: b.y, p: b.p, nkd: b.nkd };
    });

    window.pfMonthlyBonds = monthlyIncomeBonds.slice();   // экспорт для вкладки «Портфели» (импорт)
    renderMonthlyIncomeCards();
    recalcCustomCoupons();
    hideSkeleton('skeleton-income-cards');

    // Акции — 12 бумаг по 3 в каждый эшелон
    const demoStocks = [
        // I — Надёжные
        { t: 'SBER',  n: 'Сбербанк',       p: 312.50, target: '390 ₽' },
        { t: 'LKOH',  n: 'ЛУКОЙЛ',          p: 6890.0, target: '8200 ₽' },
        { t: 'GAZP',  n: 'Газпром',          p: 138.40, target: '180 ₽' },
        // II — Стабильные
        { t: 'GMKN',  n: 'Норникель',        p: 118.60, target: '145 ₽' },
        { t: 'NVTK',  n: 'НОВАТЭК',          p: 956.40, target: '1200 ₽' },
        { t: 'ROSN',  n: 'Роснефть',         p: 481.20, target: '580 ₽' },
        // III — Рисковые
        { t: 'YNDX',  n: 'Яндекс',           p: 3812.0, target: '4600 ₽' },
        { t: 'TCSG',  n: 'Т-Технологии',     p: 2630.0, target: '3200 ₽' },
        { t: 'POLY',  n: 'Полюс',             p: 1423.0, target: '1750 ₽' },
        // IV — Венчурные
        { t: 'OZON',  n: 'OZON',             p: 2840.0, target: '3600 ₽' },
        { t: 'VKCO',  n: 'ВКонтакте',        p: 324.60, target: '420 ₽' },
        { t: 'SMLT',  n: 'Самолёт',           p: 1640.0, target: '2100 ₽' },
    ];

    echelons[0].assets = demoStocks.slice(0, 3);
    echelons[1].assets = demoStocks.slice(3, 6);
    echelons[2].assets = demoStocks.slice(6, 9);
    echelons[3].assets = demoStocks.slice(9, 12);

    // Ребаланс — echelonTableData
    echelonTableData = [[], [], [], []];
    const sectorMap = {
        'SBER': 'Финансы', 'LKOH': 'Нефть и газ', 'GAZP': 'Нефть и газ',
        'GMKN': 'Металлы', 'NVTK': 'Нефть и газ', 'ROSN': 'Нефть и газ',
        'YNDX': 'Технологии', 'TCSG': 'Финансы', 'POLY': 'Металлы',
        'OZON': 'E-commerce', 'VKCO': 'Технологии', 'SMLT': 'Недвижимость',
    };
    demoStocks.forEach((s, i) => {
        const ech = Math.floor(i / 3);
        echelonTableData[ech].push({
            t: s.t, n: s.n,
            sector: sectorMap[s.t] || '',
            target: s.target
        });
    });

    renderAuroraOfzList();
    renderAuroraStocksTable();
    distributeMonthlyInvestment();
    updateEchelonTable();
    renderOfzList();

    hideSkeleton('skeleton-ofz-list');
    hideSkeleton('skeleton-stocks-table');
    hideSkeleton('skeleton-rates');
    hideSkeleton('skeleton-market-tiles');

    // Показываем демо-баннер
    showDemoBanner();
}

function showDemoBanner() {
    // Если уже есть — не дублируем
    if (document.getElementById('demoBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'demoBanner';
    banner.style.cssText = `
        position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
        background: rgba(44,54,76,0.92); color: white; padding: 10px 18px;
        border-radius: 20px; font-family: 'Inter',sans-serif; font-size: 11px;
        font-weight: 600; letter-spacing: 0.03em; z-index: 9999;
        backdrop-filter: blur(10px); box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: flex; align-items: center; gap: 8px; white-space: nowrap;
    `;
    banner.innerHTML = `<span style="font-size:14px;">⚡</span> Демо-режим — API недоступен`;
    document.body.appendChild(banner);
    // Скрыть через 5 сек
    setTimeout(() => { banner.style.opacity = '0'; banner.style.transition = 'opacity 0.5s'; setTimeout(() => banner.remove(), 500); }, 5000);
}
// ===== END DEMO DATA =====

async function loadData() {
            initTheme();
            updateMarketData();
            loadCompanyDescriptions();

            try {
    console.log('Fetching data from:', CSV_URL);
    const response = await fetch(CSV_URL, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    console.log('Data loaded successfully, length:', text.length);
                // 1. Парсим CSV в массив строк (ЭТА СТРОКА ОБЯЗАТЕЛЬНА)
                const rows = text.split('\n').map(row => row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/"/g, '').trim()));

                // 2. Вертикаль ставок (обновление данных из таблицы)
                if (rows.length > 1 && rows[1].length > 42) {
                    const keyRateVal = rows[1][42]; 
                    if (keyRateVal) ratesData.keyRate = keyRateVal.includes('%') ? keyRateVal : keyRateVal + '%';
                }
                if (rows.length > 2 && rows[2].length > 42) {
                    const depositRateVal = rows[2][42];
                    if (depositRateVal) ratesData.depositRate = depositRateVal.includes('%') ? depositRateVal : depositRateVal + '%';
                }
                if (rows.length > 3 && rows[3].length > 42) {
                    const inflationVal = rows[3][42];
                    if (inflationVal) ratesData.inflation = inflationVal.includes('%') ? inflationVal : inflationVal + '%';
                }
                if (rows.length > 4 && rows[4].length > 42) {  
                    const ofz10Val = rows[4][42];
                    if (ofz10Val) ratesData.ofz10 = ofz10Val.includes('%') ? ofz10Val : ofz10Val + '%';
                }
                updateRatesDisplay();

                // 3. Загрузка Облигаций (3 вкладка)
                let bondList = [];
                for (let i = 2; i <= 9; i++) { 
                    if (rows[i] && rows[i].length > 13 && rows[i][10]) {
                        bondList.push({ 
                            t: rows[i][10], 
                            n: (rows[i][11] || '').replace(/^(ОФЗ)-/, '$1 '), 
                            p: parseFloat(rows[i][12].replace(',', '.')) || 0, 
                            y: rows[i][13] || '0%',
                            nkd: 0,
                            matDate: '—'
                        }); 
                    }
                }
                bonds = bondList;
                fetchBondDetailsInBackground();

                // 4. Ежемесячный доход (Калькулятор)
                allScheduledPayments = []; 
                let uniqueBondsMap = new Map();

                for (let i = 2; i <= 13; i++) {
                    if (!rows[i]) continue;
                    const dateVal = rows[i][27] || "---"; 
                    const nameVal = (rows[i][28] || "---").replace(/^(ОФЗ)-/, '$1 '); 
                    const couponVal = parseFloat(String(rows[i][30]).replace(',', '.')) || 0; 
                    const ticker = rows[i][31] ? String(rows[i][31]).trim() : ''; 

                    allScheduledPayments.push({
                        dateStr: dateVal,
                        displayName: nameVal,
                        paymentTicker: ticker,
                        staticCouponVal: couponVal
                    });
                    console.log(`[COUPON SCHEDULE] row ${i}: date=${dateVal}, name=${nameVal}, coupon(AE)=${couponVal}, ticker=${ticker}, col_AD="${rows[i][29]}", col_AE="${rows[i][30]}"`);

                    if (ticker && !uniqueBondsMap.has(ticker)) {
                        uniqueBondsMap.set(ticker, {
                            t: ticker,          
                            n: rows[i][32] || ticker, 
                            y: rows[i][33] || "0%",
                            p: 1000, 
                            nkd: 0
                        });
                    }
                }

                monthlyIncomeBonds = Array.from(uniqueBondsMap.values());
                window.pfMonthlyBonds = monthlyIncomeBonds.slice();   // экспорт для вкладки «Портфели»
                renderMonthlyIncomeCards();
                recalcCustomCoupons();
                fetchPricesForMonthlyIncome();

                // 5. Загрузка Акций (3 вкладка - Портфель)
                let allStocks = [];
                for (let i = 11; i <= 22; i++) { 
                    if (rows[i] && rows[i].length > 13 && rows[i][10]) {
                        allStocks.push({ t: rows[i][10], n: rows[i][11], p: parseFloat(rows[i][12].replace(',', '.')) || 0, target: rows[i][13] || '—' });
                    }
                }
                if (allStocks.length > 0) { 
                    echelons[0].assets = allStocks.slice(0, 3);
                    echelons[1].assets = allStocks.slice(3, 6); 
                    echelons[2].assets = allStocks.slice(6, 9); 
                    echelons[3].assets = allStocks.slice(9, 12);
                }
                
                console.log('[DATA LOADED] stocks:', allStocks.length);
                allStocks.forEach(s => console.log(`[DATA STOCK] ${s.t}: price=${s.p}, target=${s.target}`));

                // === 6. НОВАЯ ЛОГИКА: 4 Вкладка (Ребалансировка) с поиском имен ===
                
                // Шаг А: Создаем справочник из колонок F, G, H
                const tickerInfo = {};
                for (let i = 2; i < rows.length; i++) { 
                    if (rows[i] && rows[i].length > 7) {
                        const ticker = rows[i][5] ? String(rows[i][5]).trim() : null; 
                        const name = rows[i][6];       
                        const sector = rows[i][7];      
                        if(ticker) {
                            tickerInfo[ticker] = { 
                                n: name || ticker, 
                                sector: sector || '' 
                            };
                        }
                    }
                }

                // Шаг Б: Заполняем таблицу эшелонов данными из справочника
                echelonTableData = [[], [], [], []];
                for (let i = 2; i <= 13; i++) {
                     if (rows[i] && rows[i].length > 23) {
                        
                        // Функция для обработки одной ячейки (чтобы не копировать код 4 раза)
                        const processAsset = (tickerIndex, targetIndex, echelonArrIndex) => {
                            if(rows[i][tickerIndex]) {
                                const rawTicker = String(rows[i][tickerIndex]).trim();
                                // Защита: настоящий тикер — одно слово до 12 символов, без пробелов
                                if (!/^[A-Za-z0-9.\-@]{1,12}$/.test(rawTicker)) return;
                                // Ищем в справочнике
                                const info = tickerInfo[rawTicker] || { n: rawTicker, sector: '' };
                                
                                echelonTableData[echelonArrIndex].push({ 
                                    t: rawTicker,        
                                    n: info.n,           
                                    sector: info.sector, 
                                    target: rows[i][targetIndex] || '—' 
                                });
                            }
                        };

                        processAsset(16, 17, 0); // I Эшелон
                        processAsset(18, 19, 1); // II Эшелон
                        processAsset(20, 21, 2); // III Эшелон
                        processAsset(22, 23, 3); // IV Эшелон
                    }
                }
                
                distributeMonthlyInvestment();
                updateEchelonTable();
                renderOfzList();
                
                // Рендерим Aurora таблицу акций
                renderAuroraStocksTable();
                
                // Не вызываем draw() при первой загрузке, чтобы был виден плейсхолдер
                // draw() вызовется когда пользователь начнет вводить сумму
            } catch (e) { 
                console.error("Error in loadData:", e);
                // Fallback: load demo data when API/Sheets unavailable
                loadDemoData();
            }
        }

        // --- MONTHLY INCOME CALCULATOR LOGIC ---
        
        const mInput = document.getElementById('monthlySumInput');
        if(mInput) {
    mInput.addEventListener('focus', () => {
        // Скрываем навигацию
        const nav = document.getElementById('navWrapper');
        if(nav) nav.style.display = 'none';
        
        // Скрываем заголовок экрана, чтобы больше места было
        const header = document.querySelector('.header');
        if(header) header.style.display = 'none';
    });

    mInput.addEventListener('blur', () => {
        // Возвращаем всё назад с небольшой задержкой
        setTimeout(() => {
            const nav = document.getElementById('navWrapper');
            if(nav) nav.style.display = 'flex';
            
            const header = document.querySelector('.header');
            if(header) header.style.display = 'block';
        }, 100);
    });
            // Автозапуск расчета при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const mInput = document.getElementById('monthlySumInput');
    if (mInput && mInput.value) {
        // Имитируем ввод, чтобы запустить пересчет
        mInput.dispatchEvent(new Event('input'));
    }
});
}

        function adaptCalcInputFont(el) {
            const len = String(el.value || '').length;
            if (len > 8) el.style.fontSize = '7px';
            else if (len > 6) el.style.fontSize = '9px';
            else if (len > 4) el.style.fontSize = '11px';
            else el.style.fontSize = '14px';
        }

        function changeQty(ticker, delta) {
            const input = document.getElementById(`input-${ticker}`);
            if(input) {
                let val = parseInt(input.value) || 0;
                val = Math.max(0, val + delta);
                input.value = val;
                adaptCalcInputFont(input);
                updateMonthlySumFromQuantities();
            }
        }
        
        function resetOne(ticker) {
             const input = document.getElementById(`input-${ticker}`);
             if(input) {
                 input.value = 0;
                 updateMonthlySumFromQuantities();
             }
        }
        
        function updateMonthlySumFromQuantities() {
            if (isUpdatingProgrammatically) return;
            let totalSum = 0;
            monthlyIncomeBonds.forEach(bond => {
                const input = document.getElementById(`input-${bond.t}`);
                if (input) {
                    const qty = parseInt(input.value) || 0;
                    if (qty > 0) {
                        const fullCost = (bond.p + bond.nkd); 
                        totalSum += qty * fullCost;
                    }
                }
            });

            isUpdatingProgrammatically = true;
            document.getElementById('monthlySumInput').value = Math.round(totalSum);
            isUpdatingProgrammatically = false;

            recalcCustomCoupons(); // <--- ВАЖНОЕ ДОБАВЛЕНИЕ: Обновляем нижний список
        }

        function distributeMonthlyInvestment() {
    const input = document.getElementById('monthlySumInput');
    if (!input) return;

    // Очищаем от пробелов и превращаем в число
    const totalInvestment = parseFloat(input.value.replace(/\s/g, ''));

    if (!totalInvestment || totalInvestment <= 0) {
        renderMonthlyIncomeCards();
        recalcCustomCoupons();
        return;
    }

    // 6 бумаг в стратегии
    const perBondBudget = totalInvestment / 6;

    const priced = monthlyIncomeBonds.map(bond => ({ bond, fullPrice: bond.p + bond.nkd }));

    priced.forEach(({ bond, fullPrice }) => {
        // Полная стоимость покупки = Цена + НКД
        let count = 0;
        if (fullPrice > 0) {
            count = Math.floor(perBondBudget / fullPrice);
        }

        // Сохраняем кол-во в карту
        bondQtyMap[bond.t] = count;
    });

    // Остаток от деления "на 6 равных частей" добираем самыми дешёвыми бумагами,
    // чтобы итоговая сумма была максимально близка к введённой (а не к 1/6 от неё)
    let leftover = totalInvestment - priced.reduce((sum, { bond, fullPrice }) => sum + bondQtyMap[bond.t] * fullPrice, 0);
    const byPrice = priced.filter(p => p.fullPrice > 0).sort((a, b) => a.fullPrice - b.fullPrice);
    let added = true;
    while (added) {
        added = false;
        for (const { bond, fullPrice } of byPrice) {
            if (fullPrice <= leftover) {
                bondQtyMap[bond.t]++;
                leftover -= fullPrice;
                added = true;
            }
        }
    }
    renderMonthlyIncomeCards();
    recalcCustomCoupons();
}
        // ===== ФУНКЦИЯ 1: Отрисовка карточек =====
function renderMonthlyIncomeCards() {
    var container = document.getElementById('calc-bonds-input-list');
    if (!container) return;

    var html = '';

    monthlyIncomeBonds.forEach(function(b, i) {
        var qty = bondQtyMap[b.t] || 0;
        var yld = b.y ? String(b.y).replace('%','') + '%' : '';
        var ticker = b.t;
        html += '<div class="mi5-bond">'
            + '<span class="mi5-bond-rk">#' + (i + 1) + '</span>'
            + '<div class="mi5-bond-info">'
            + '<div class="mi5-bond-nm">' + styledName(b.n) + '</div>'
            + '</div>'
            + '<div class="mi5-bond-yield">' + yld + '</div>'
            + '<div class="mi5-step">'
            + '<button type="button" onclick="changeQty(this.dataset.t,-1)" data-t="' + ticker + '">−</button>'
            + '<input type="number" id="input-' + ticker + '" class="mi5-step-q" data-ticker="' + ticker + '" value="' + qty + '" min="0"'
            + ' oninput="updateMonthlySumFromQuantities(); recalcCustomCoupons()">'
            + '<button type="button" onclick="changeQty(this.dataset.t,1)" data-t="' + ticker + '">+</button>'
            + '</div></div>';
    });

    container.innerHTML = html;
    var sk = document.getElementById('skeleton-income-cards');
    if (sk) sk.style.display = 'none';
    // Сразу пересчитываем сетку после рендера
    setTimeout(function() { recalcCustomCoupons(); }, 0);
}

// ===== ФУНКЦИЯ 2: Загрузка цен с биржи =====
async function fetchPricesForMonthlyIncome() {
    const promises = monthlyIncomeBonds.map(async (bond) => {
        try {
            const extra = await fetchBondData(bond.t);
            // Если данные пришли, записываем их
            bond.p = extra.price;
            bond.nkd = extra.nkd;
        } catch(e) {
            console.error("Не удалось получить данные по", bond.t, e);
            // === ЗАГЛУШКИ УБРАНЫ ===
            // Раньше тут было: bond.p = 1000;
            // Теперь мы просто оставляем старое значение или undefined.
            // Если цена будет undefined, математика выдаст NaN,
            // и пользователь увидит, что данные не загрузились, вместо ложных 1000р.
        }
    });

    await Promise.all(promises);
    
    renderMonthlyIncomeCards();
    distributeMonthlyInvestment(); // Пересчет (как мы добавили ранее)
}
// ===== ФУНКЦИЯ 3: Пересчёт выплат (ИСПРАВЛЕННАЯ) =====
function recalcCustomCoupons() {
    const resultList = document.getElementById('calc-results-list');
    if (!resultList) return;

    // Собираем количества из полей ввода
    bondQtyMap = {};
    monthlyIncomeBonds.forEach(bond => {
        const input = document.getElementById(`input-${bond.t}`);
        bondQtyMap[bond.t] = input ? (parseInt(input.value) || 0) : 0;
    });

    const MON = ['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];
    let totalAmount = 0;
    let nextIdx = -1;

    // Первый проход — считаем суммы
    const rows = allScheduledPayments.map(function(payment, idx) {
        let qty = bondQtyMap[payment.paymentTicker];
        if (!qty) {
            const parentBond = monthlyIncomeBonds.find(b => b.n === payment.displayName);
            if (parentBond) qty = bondQtyMap[parentBond.t];
        }
        qty = qty || 0;
        const net = (payment.staticCouponVal * qty) * (1 - customTax);
        totalAmount += net;
        if (qty > 0 && nextIdx === -1) nextIdx = idx;

        // Формат даты: DD.MM.YYYY (реальные данные) либо MM.YY (демо)
        const parts = String(payment.dateStr).split('.');
        let day = '', monthNum, dm = '', year = new Date().getFullYear();
        if (parts.length >= 3) {
            day = parts[0];
            monthNum = parseInt(parts[1], 10) - 1;
            dm = parts[0] + '.' + parts[1];
            year = parseInt(parts[2], 10) || year;
        } else {
            // Формат MM.YY без дня — подставляем день 15, чтобы в датах всегда было число
            monthNum = parseInt(parts[0], 10) - 1;
            day = '15';
            dm = '15.' + (parts[0] || '');
        }
        const mo = MON[monthNum] || '';
        const name = (payment.displayName || '').replace(/^(ОФЗ)-/, '$1 ');
        return { day: day, mo: mo, dm: dm, mn: monthNum, year: year, name: name, qty: qty, net: net };
    });

    // Второй проход — рисуем таймлайн выплат
    let html = '';
    rows.forEach(function(r, idx) {
        const sumStr = r.qty > 0 ? ('+' + Math.round(r.net).toLocaleString('ru-RU') + ' ₽') : '—';
        html += '<div class="mi5-pay' + (idx === nextIdx ? ' is-next' : '') + '">'
            + '<div class="mi5-pay-rail"><span class="dot"></span></div>'
            + '<div class="mi5-pay-main">'
            + '<div class="mi5-pay-date"><b>' + (r.day || r.mo) + '</b><span>' + (r.day ? r.mo : '') + '</span></div>'
            + '<div class="mi5-pay-info"><div class="mi5-pay-bn">' + r.name + '</div><div class="mi5-pay-q">' + r.qty + ' шт</div></div>'
            + '<div class="mi5-pay-amt' + (r.qty > 0 ? '' : ' is-zero') + '"><span class="am">' + sumStr + '</span></div>'
            + '</div></div>';
    });
    resultList.innerHTML = html;

    // --- Мини-график: поступления по месяцам (баннер дохода) ---
    const chartWrap = document.getElementById('miMonthlyChart');
    if (chartWrap) {
        const monthly = new Array(12).fill(0);    // сумма выплат по месяцам
        const monthDay = new Array(12).fill('');   // день ближайшей выплаты в месяце (DD)
        const monthYear = new Array(12).fill(0);   // год выплаты в этом месяце
        rows.forEach(function(r) {
            if (r.qty > 0 && r.mn >= 0 && r.mn < 12) {
                monthly[r.mn] += r.net;
                if (!monthDay[r.mn] && r.day) monthDay[r.mn] = r.day;
                if (!monthYear[r.mn] && r.year) monthYear[r.mn] = r.year;
            }
        });
        let maxM = 0;
        monthly.forEach(function(v) { if (v > maxM) maxM = v; });

        // Месяц старта = месяц ближайшей выплаты (тот же, что в блоке «Ближайшая выплата»).
        // allScheduledPayments отсортирован от ближайшей выплаты, поэтому rows[nextIdx]
        // указывает на корректную следующую выплату (с учётом дня, а не только месяца).
        const curYear = new Date().getFullYear();
        let startMonth = (nextIdx >= 0 && rows[nextIdx]) ? rows[nextIdx].mn : new Date().getMonth();
        const baseYear = (nextIdx >= 0 && rows[nextIdx] && rows[nextIdx].year) ? rows[nextIdx].year : curYear;

        const LET = 'ЯФМАМИИАСОНД';

        // Геометрия (в координатах viewBox 0..100, SVG растягивается на контейнер)
        const N = 12, padX = 5, topY = 22, botY = 86;
        const xAt = function (i) { return padX + (i / (N - 1)) * (100 - 2 * padX); };
        const yAt = function (v) { return maxM > 0 ? (botY - (v / maxM) * (botY - topY)) : botY; };

        const pts = [];
        for (let i = 0; i < N; i++) {
            const m = (startMonth + i) % 12;
            pts.push({ i: i, m: m, x: xAt(i), y: yAt(monthly[m]) });
        }

        // Плавная кривая (Catmull-Rom → кубические безье)
        const smooth = function (p) {
            if (p.length < 2) return '';
            let d = 'M' + p[0].x.toFixed(2) + ',' + p[0].y.toFixed(2);
            for (let i = 0; i < p.length - 1; i++) {
                const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p[i + 1];
                const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
                const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
                d += ' C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2) + ' ' + p2.x.toFixed(2) + ',' + p2.y.toFixed(2);
            }
            return d;
        };
        const lineD = smooth(pts);
        const areaD = lineD + ' L' + pts[N - 1].x.toFixed(2) + ',' + botY + ' L' + pts[0].x.toFixed(2) + ',' + botY + ' Z';

        let svg = '<svg class="mi5-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none">'
            + '<defs><linearGradient id="miLineGrad" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0" stop-color="#ffb37a" stop-opacity="0.42"/>'
            + '<stop offset="1" stop-color="#ffb37a" stop-opacity="0"/>'
            + '</linearGradient></defs>'
            + '<path class="mi5-line-area" d="' + areaD + '" fill="url(#miLineGrad)"/>'
            + '<path class="mi5-line-path" d="' + lineD + '" fill="none" stroke="var(--mi-orange)" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>'
            + '</svg>';

        // Накладной слой: точки + тултипы + подписи месяцев
        let overlay = '';
        for (let i = 0; i < N; i++) {
            const p = pts[i];
            // Реальный год выплаты из данных; для пустых месяцев — расчётный (с учётом перехода через декабрь)
            const slotYear = monthYear[p.m] || (baseYear + (startMonth + i >= 12 ? 1 : 0));
            const has = monthly[p.m] > 0;
            const sumTxt = has ? ('+' + Math.round(monthly[p.m]).toLocaleString('ru-RU') + ' ₽') : 'нет выплат';
            const dateTxt = has
                ? ((monthDay[p.m] || '15') + '.' + String(p.m + 1).padStart(2, '0') + '.' + slotYear)
                : (MON[p.m] + ' ' + slotYear);
            const flip = p.y < 42 ? ' flip' : '';   // верхние точки — тултип снизу
            overlay += '<div class="mi5-lp' + (has ? '' : ' is-empty') + flip + '" style="left:' + p.x.toFixed(2) + '%;--y:' + p.y.toFixed(2) + '%">'
                + '<span class="mi5-lp-dot"></span>'
                + '<div class="mi5-lp-tip"><b>' + sumTxt + '</b><span>' + dateTxt + '</span></div>'
                + '<span class="mi5-lp-x">' + LET[p.m] + '</span>'
                + '</div>';
        }

        chartWrap.innerHTML = svg + overlay;

        // Анимация прорисовки линии — только при первом показе
        if (!window._miLineAnimated) {
            const path = chartWrap.querySelector('.mi5-line-path');
            const area = chartWrap.querySelector('.mi5-line-area');
            if (path) {
                const len = path.getTotalLength();
                path.style.strokeDasharray = len;
                path.style.strokeDashoffset = len;
                path.getBoundingClientRect(); // reflow
                path.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)';
                path.style.strokeDashoffset = '0';
            }
            if (area) {
                area.style.opacity = '0';
                area.getBoundingClientRect();
                area.style.transition = 'opacity .9s ease .25s';
                area.style.opacity = '1';
            }
            window._miLineAnimated = true;
        }
    }

    // --- Сводка: баннер + итоги + ближайшая выплата ---
    const monthlyAvg = totalAmount > 0 ? Math.round(totalAmount / 12) : 0;
    const investInput = document.getElementById('monthlySumInput');
    const investSum = investInput ? (parseFloat(String(investInput.value).replace(/\s/g, '')) || 0) : 0;
    const yearlyPercent = investSum > 0 ? ((totalAmount / investSum) * 100).toFixed(1) : '0.0';

    // Баннер дохода (01)
    const ibMonthly = document.getElementById('ndIbMonthly');
    const ibYearly  = document.getElementById('ndIbYearly');
    const ibYield   = document.getElementById('ndIbYield');
    const ibSub     = document.getElementById('ndIbSub');
    if (ibMonthly) ibMonthly.textContent = monthlyAvg > 0 ? ('~' + monthlyAvg.toLocaleString('ru-RU')) : '—';
    if (ibYearly)  ibYearly.textContent  = monthlyAvg > 0 ? ('~' + Math.round(totalAmount).toLocaleString('ru-RU')) : '—';
    if (ibYield)   ibYield.textContent   = monthlyAvg > 0 ? yearlyPercent : '—';
    if (ibSub)     ibSub.textContent     = (investSum > 0 ? investSum : 0).toLocaleString('ru-RU');

    // Итоги в карточке графика
    const elMonth = document.getElementById('incomeStatMonth');
    const elYear  = document.getElementById('incomeStatYear');
    const elPct   = document.getElementById('incomeStatPct');
    if (elMonth) elMonth.textContent = monthlyAvg > 0 ? ('~' + monthlyAvg.toLocaleString('ru-RU') + ' ₽') : '—';
    if (elYear)  elYear.textContent  = monthlyAvg > 0 ? (Math.round(totalAmount).toLocaleString('ru-RU') + ' ₽') : '—';
    if (elPct)   elPct.textContent   = monthlyAvg > 0 ? (yearlyPercent + '%') : '—';

    // Ближайшая выплата
    const nextName = document.getElementById('miNextName');
    const nextAmt  = document.getElementById('miNextAmt');
    if (nextName && nextAmt) {
        if (nextIdx >= 0) {
            const rn = rows[nextIdx];
            nextName.textContent = rn.name + (rn.dm ? (' · ' + rn.dm) : '');
            nextAmt.textContent = '+' + Math.round(rn.net).toLocaleString('ru-RU') + ' ₽';
        } else {
            nextName.textContent = '—';
            nextAmt.textContent = '—';
        }
    }

    // Подсветка активного пресета по текущей сумме
    document.querySelectorAll('.mi5-preset').forEach(function(b) {
        b.classList.toggle('act', parseFloat(b.dataset.amt) === investSum);
    });
}

// Установка суммы из пресета (250 тыс / 500 тыс / 1 млн / 3 млн / 5 млн)
function miPreset(btn) {
    var input = document.getElementById('monthlySumInput');
    if (!input || !btn) return;
    input.value = parseFloat(btn.dataset.amt) || 0;
    document.querySelectorAll('.mi5-preset').forEach(function(b) { b.classList.remove('act'); });
    btn.classList.add('act');
    distributeMonthlyInvestment();
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// ===== Интро-оверлей раздела (поверх карточки калькулятора) =====
// Форматирование стартовой суммы + живая синхронизация с #monthlySumInput
function miStartFmt(inp) {
    var d = String(inp.value).replace(/\D/g, '').slice(0, 12);
    inp.value = d ? parseInt(d, 10).toLocaleString('ru-RU') : '';
    var main = document.getElementById('monthlySumInput');
    if (main) main.value = parseInt(d || '0', 10);
    if (typeof distributeMonthlyInvestment === 'function') distributeMonthlyInvestment();
}

// «Приступить к расчёту»: прячем оверлей, применяем сумму, открываем
// кнопку «Подробнее» и ПОКАЗЫВАЕМ «Создать портфель» (до старта её нет вовсе)
function miStartCalc() {
    var ov = document.getElementById('miStartOverlay');
    var inp = document.getElementById('miStartInput');
    var main = document.getElementById('monthlySumInput');
    var v = inp ? (parseInt(String(inp.value).replace(/\D/g, ''), 10) || 0) : 0;
    if (main && v > 0 && parseInt(main.value, 10) !== v) {
        main.value = v;
        if (typeof distributeMonthlyInvestment === 'function') distributeMonthlyInvestment();
    }
    if (ov) {
        ov.classList.add('is-out');
        setTimeout(function () { ov.style.display = 'none'; }, 260);
    }
    var more = document.getElementById('miMoreBtn');
    if (more) more.classList.remove('is-hidden');
    var cr = document.getElementById('miCreatePfBtn');
    if (cr) cr.classList.remove('is-hidden');
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Переключение правой колонки: баннер дохода ↔ график выплат.
// Вызывается кнопками «Подробнее»/«Сводка» на карточках правой колонки.
function toggleScheduleView() {
    var banner = document.getElementById('miBannerCard');
    var sch = document.getElementById('miSchCard');
    if (!banner || !sch) return;
    var show = sch.classList.contains('is-hidden'); // сейчас скрыт → показываем
    sch.classList.toggle('is-hidden', !show);
    banner.classList.toggle('is-hidden', show);
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

        function resetCustomCalc() {
            isUpdatingProgrammatically = true;
            document.getElementById('monthlySumInput').value = 0;
            isUpdatingProgrammatically = false;
            const inputs = document.querySelectorAll('.calc-input');
            inputs.forEach(input => input.value = 0);
            
            recalcCustomCoupons(); // <--- ДОБАВЛЕНО
            
            if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }

      

        // --- END OF MONTHLY CALC LOGIC ---

        function updateEchelonTable() {
    const body = document.getElementById('echelon-tickers-body');
    if(!body) return;
    let html = '';
    const maxRows = Math.max(...echelonTableData.map(col => col.length));
    
    for(let i=0; i<maxRows; i++) {
        // Основная строка с ячейками
        html += '<tr>';
        for(let j=0; j<4; j++) {
            const asset = echelonTableData[j][i];
            if(asset) {
                // Убираем знак рубля из отображения в ячейке
                const priceDisplay = asset.target.replace(' ₽', '');
                html += `
                <td class="et-cell" onclick="toggleEchelonCell('${i}-${j}')">
                    <div class="et-cell-content">
                        <span class="et-ticker">${asset.t}</span>
                        <span class="et-price">${priceDisplay}</span>
                    </div>
                </td>`;
            } else {
                html += '<td class="et-cell-empty"></td>';
            }
        }
        html += '</tr>';
        
        // Скрытая строка с деталями
        html += `<tr class="et-details-row" id="details-row-${i}" style="display:none;">
            <td colspan="4" class="et-details-container">
                <div id="details-content-${i}"></div>
            </td>
        </tr>`;
    }
    body.innerHTML = html;
}


    function toggleEchelonCell(cellId) {
    const [row, col] = cellId.split('-').map(Number);
    const detailsRow = document.getElementById(`details-row-${row}`);
    const detailsContent = document.getElementById(`details-content-${row}`);
    
    // Закрываем все остальные открытые строки
    document.querySelectorAll('.et-details-row').forEach(r => {
        if(r.id !== `details-row-${row}`) {
            r.style.display = 'none';
        }
    });
    
    // Переключаем текущую строку
    if(detailsRow.style.display === 'none') {
        // НОВОЕ: Раскрываем таблицу автоматически
        const wrapper = document.getElementById('echelon-wrapper');
        const expandBtn = document.getElementById('expandArrowBtn');
        if(wrapper && wrapper.classList.contains('collapsed')) {
            wrapper.classList.remove('collapsed');
            if(expandBtn) expandBtn.classList.add('open');
        }
        
        // Получаем данные актива
        const asset = echelonTableData[col][row];
        if(!asset) return;
        
        // Берём название компании из самого asset (уже загружено из колонки G)
const companyName = asset.n || asset.t;
        
        // Определяем эшелон
        const echelonNum = col + 1;
        const echelonName = ['I Эшелон', 'II Эшелон', 'III Эшелон', 'IV Эшелон'][col];
        
        // Формируем контент для деталей
        detailsContent.innerHTML = `
            <div class="et-expanded-details">
                <div class="et-details-header">
                    <div class="et-details-title">
                        <span class="et-details-ticker">${asset.t}</span>
                        <span class="et-details-echelon">${echelonName}</span>
                    </div>
                </div>
               <div style="margin-bottom: 16px;">
    <div style="background: linear-gradient(135deg, var(--bg-color), var(--card-bg)); padding: 16px; border-radius: 16px; border: 1px solid var(--border-color); margin-bottom: 12px; box-shadow: 0 2px 8px var(--card-shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Компания</div>
            <div style="background: var(--accent-blue); color: white; font-size: 9px; font-weight: 700; padding: 4px 10px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">${echelonName}</div>
        </div>
        <div style="font-size: 16px; font-weight: 800; color: var(--text-main); line-height: 1.4; margin-bottom: 8px;">${companyName}</div>
        ${asset.sector ? `<div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(52, 152, 219, 0.1); color: var(--accent-blue); font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 8px; margin-top: 4px;">
            <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            ${asset.sector}
        </div>` : ''}
    </div>
    
    <div class="et-details-grid">
        <div class="et-detail-item">
            <span class="et-detail-label">Тикер:</span>
            <span class="et-detail-value" style="cursor:pointer; color:var(--accent-blue);" onclick="copyTicker(event, '${asset.t}')">${asset.t} 📋</span>
        </div>
        <div class="et-detail-item">
            <span class="et-detail-label">Потенциал:</span>
            <span class="et-detail-value">${asset.target}</span>
        </div>
        <div class="et-detail-item">
            <span class="et-detail-label">Прогноз:</span>
            <span class="et-detail-value">до 36 мес.</span>
        </div>
    </div>
</div>
                <div class="et-details-actions">
                    <button class="et-btn-chart" onclick="openTradingView(event, '${asset.t}')">
                        <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                        График
                    </button>
                    <button class="et-btn-company" onclick="openCompanyFromTable(event, '${asset.t}', '${companyName}')">
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        О компании
                    </button>
                </div>
            </div>
        `;
        detailsRow.style.display = 'table-row';
        
       // НОВОЕ: Плавная прокрутка с отступом от нижнего меню
setTimeout(() => {
    const rect = detailsRow.getBoundingClientRect();
    const offset = 150; // Высота меню + отступ
    const elementTop = rect.top + window.pageYOffset;
    const offsetPosition = elementTop - offset;
    
    window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
    });
}, 100);
        
    } else {
        detailsRow.style.display = 'none';
    }
}

function openCompanyFromTable(event, ticker, companyName) {
    event.stopPropagation();
    // Ищем полную информацию об активе
    let foundAsset = null;
    
    // Сначала ищем в основных эшелонах
    for(let e of echelons) {
        const found = e.assets.find(a => a.t === ticker);
        if(found) {
            foundAsset = found;
            break;
        }
    }
    
    // Если не нашли, создаем минимальный объект
    if(!foundAsset) {
        for(let i = 0; i < echelonTableData.length; i++) {
            const found = echelonTableData[i].find(a => a.t === ticker);
            if(found) {
                foundAsset = {
                    t: found.t,
                    n: companyName || found.t,
                    p: 0,
                    target: found.target
                };
                break;
            }
        }
    }
    
    if(foundAsset) {
        const item = {
            ...foundAsset,
            type: 'Акция'
        };
        openCompanyPage(item);
    }
}
    
// Функция для уведомления
function showToast(message) {
    let toast = document.getElementById('copy-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'copy-toast';
        toast.className = 'copy-notification';
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.classList.add('show');
    
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// Обновленная отрисовка
// Вспомогательная функция для оборачивания цифр в шрифт Mono
function formatNameWithMonoDigits(name) {
    if (!name) return '';
    // Ищем все группы цифр и оборачиваем их в span
    return name.replace(/(\d+)/g, '<span class="mono-digit-span">$1</span>');
}

// Функция для раскрытия/скрытия ВСЕГО списка через заголовок
// 1. Управление всем блоком ОФЗ
function toggleGlobalOfzList() {
    const headerContainer = document.querySelector('.ofz-headers-container');
    const isExpanding = !headerContainer.classList.contains('is-expanded');
    
    // Переключаем класс для стрелочки
    headerContainer.classList.toggle('is-expanded');
    
    // Если мы СВОРАЧИВАЕМ (isExpanding = false), закрываем все открытые детали
    if (!isExpanding) {
        document.querySelectorAll('.ofz-lux-details').forEach(detail => {
            detail.style.display = 'none';
        });
        // Убираем активные классы со строк
        document.querySelectorAll('.ofz-row-container').forEach(row => {
            row.classList.remove('active');
        });
    }

    // Вызываем твою функцию скрытия лишних строк (из терминала)
    if (typeof toggleOfzGhost === 'function') {
        toggleOfzGhost(); 
    }
}

// 2. Рендер списка
function renderOfzList() {
    if (typeof bonds === 'undefined' || bonds.length === 0) return;
    
    // Принудительный фикс стиля превью (убиваем "белый фон")
    const pBox = document.querySelector('.rebalance-preview-box') || document.querySelector('.rebalance-intro-modern');
    if (pBox) {
        pBox.style.cssText = "background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%) !important; color: white !important;";
        pBox.querySelectorAll('*').forEach(child => child.style.color = 'white');
    }

   let ofzHtml = `
        <div class="ofz-headers-container">
            <div class="h-label-instrument-wrapper" onclick="toggleGlobalOfzList()" style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase;">Инструмент</span>
                <svg id="global-ofz-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="3" style="transition:0.3s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div class="headers-right-group">
                <div class="header-glass-pill">%</div>
                <div class="header-glass-pill">₽</div>
            </div>
        </div>
        <div id="ofz-items-container">
            </div>
    `;
    
    bonds.forEach((b, index) => {
        const details = bondDetailsMap[b.t] || { matDate: '—', couponValue: 0, nextCoupon: '—', freq: 0 };
        const priceFinal = parseFloat(String(b.p).replace(',', '.')).toFixed(2);
        
        let curYield = "0.00";
        if (details.couponValue > 0 && details.freq > 0) {
            curYield = ((details.couponValue * details.freq / parseFloat(priceFinal)) * 100).toFixed(2);
        }

        const hiddenClass = ''; // Раскрыто полностью

        ofzHtml += `
        <div class="ofz-row-container ${hiddenClass}" id="container-${b.t}">
            <div class="ofz-luxury-item" onclick="toggleOfzDetails('${b.t}')">
                <div class="ofz-lux-name">${formatNameWithMonoDigits(limitName(b.n))}</div>
                <div class="ofz-lux-bridge"></div>
                <div class="ofz-lux-right">
                    <div class="ofz-lux-yield">${b.y}</div>
                    <div class="ofz-price-pill">${priceFinal} ₽</div>
                </div>
            </div>

            <div id="details-${b.t}" class="ofz-lux-details" style="display:none; padding: 20px;">
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">КОД (ISIN)</span>
                    <span class="copy-code-blue" onclick="copyTickerNew('${b.t}')">${b.t}</span>
                </div>
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">ТЕКУЩАЯ ЦЕНА</span>
                    <span class="ofz-lux-detail-value"><span class="mono-digit-span">${priceFinal}</span> ₽</span>
                </div>
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">НКД</span>
                    <span class="ofz-lux-detail-value"><span class="mono-digit-span">${b.nkd}</span> ₽</span>
                </div>
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">ДАТА ПОГАШЕНИЯ</span>
                    <span class="ofz-lux-detail-value mono-digit-span">${details.matDate}</span>
                </div>
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">РАЗМЕР КУПОНА</span>
                    <span class="ofz-lux-detail-value"><span class="mono-digit-span">${details.couponValue}</span> ₽</span>
                </div>
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">БЛИЖ. КУПОН</span>
                    <span class="ofz-lux-detail-value mono-digit-span">${details.nextCoupon}</span>
                </div>
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">ТЕКУЩАЯ КУПОННАЯ ДОХОДНОСТЬ</span>
                    <span class="ofz-lux-detail-value" style="color:#3498db; font-weight:800;">
                        <span class="mono-digit-span">${curYield}</span>%
                    </span>
                </div>
                <div class="ofz-lux-detail-row">
                    <span class="ofz-lux-detail-label">ВЫПЛАТ В ГОД</span>
                    <span class="ofz-lux-detail-value mono-digit-span">${details.freq}</span>
                </div>
                <button class="btn-luxury-chart" onclick="openTradingView(event, '${b.t}')">Открыть график TV</button>
            </div>
        </div>`;
    });
    
    document.getElementById('ofz-list').innerHTML = ofzHtml;
    
    // Также рендерим новый Aurora список
    renderAuroraOfzList();
}

