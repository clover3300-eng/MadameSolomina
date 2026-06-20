      function draw() {
    console.log('draw() called');
    
    // 1. Получаем текущее значение слайдера
    const slider = document.getElementById('ratioSlider');
    if (!slider) return;
    const bondPct = parseInt(slider.value);
    const stockPct = 100 - bondPct;
    
    // 2. СРАЗУ обновляем видимость карточек в списке (скрываем дубликаты)
    updateStrategyCardSelection(bondPct);

    // 3. Получаем введенную сумму
    const inputSum = getSumInputValue();

    // 4. Если сумма 0, обновляем только проценты в центре и выходим
    if (inputSum === 0) {
        if(document.getElementById('labelBondsPct')) {
             document.getElementById('labelBondsPct').innerText = bondPct;
             document.getElementById('labelStocksPct').innerText = stockPct;
        }
        return;
    }
    
    // Дальше идет твоя логика расчетов...
    console.log('Drawing with sum:', inputSum);

    // Обновляем визуальное выделение кнопок-пресетов под кругом
    const presets = document.querySelectorAll('.preset-btn-modern');
    presets.forEach(p => {
         const match = p.getAttribute('onclick').match(/\d+/);
         if(match) {
             const pct = parseInt(match[0]);
             if(pct !== bondPct) p.classList.remove('selected-preset');
             else p.classList.add('selected-preset');
         }
    });


            const bondBudget = (inputSum * bondPct) / 100;
            const stockBudget = (inputSum * stockPct) / 100;
            const feeVal = inputSum * brokerFee;

            if(document.getElementById('labelBondsPct')) {
    document.getElementById('labelBondsPct').innerText = bondPct;
    document.getElementById('labelStocksPct').innerText = stockPct;
    
    const dynamicSubtitle = document.getElementById('dynamicSubtitle');
    if(dynamicSubtitle) {
        dynamicSubtitle.innerText = `Система ${bondPct}/${stockPct}: Денежный Поток и Рост.`;
    }
    
    document.querySelectorAll('.bond-pct-text').forEach(el => el.innerText = bondPct);
                document.querySelectorAll('.stock-pct-text').forEach(el => el.innerText = stockPct);
                const mainChart = document.getElementById('mainChart');
    if(mainChart) {
        mainChart.style.background = `conic-gradient(var(--accent-blue) 0% ${bondPct}%, var(--accent-green) ${bondPct}% 100%)`;
        mainChart.setAttribute('data-pct', `${bondPct}/${stockPct}`);
    }
}

            const bondSection = document.getElementById('section-bonds');
            const couponBox = document.getElementById('couponBox');
            const separator = document.getElementById('section-separator');
            const stockSection = document.getElementById('section-stocks');
            const stockHeader = document.getElementById('header-stocks');
            const footerImportant = document.getElementById('footer-important');
            
            if(bondSection && stockSection) {
                bondSection.style.display = 'block'; couponBox.style.display = 'block';
                separator.style.display = 'flex'; stockSection.style.display = 'block';
                footerImportant.style.display = 'block'; stockHeader.innerText = "2. Растущая часть";
                if (bondPct === 0) {
                    bondSection.style.display = 'none'; couponBox.style.display = 'none';
                    separator.style.display = 'none'; stockHeader.innerText = "1. Растущая часть";
                } else if (bondPct === 100) {
                    stockSection.style.display = 'none'; footerImportant.style.display = 'none';
                    separator.style.display = 'none';
                }
            }

            let actualSpentTotal = 0; let bondQuantities = {};
            let totalBondProjectedIncome = 0;
            let rainData = [];
            let bondCalculations = [];
            
       // === ГЕНЕРАЦИЯ СПИСКА ОБЛИГАЦИЙ (С ПОДСВЕТКОЙ ISIN) ===
            let bHtml = '';
            if (bonds.length > 0 && bondBudget > 0) {
                // Считаем полную стоимость каждой облигации
                bondCalculations = bonds.map(b => { 
                    const fullCostPerUnit = (b.p + b.nkd) * (1 + brokerFee); 
                    return { ...b, qty: 0, fullCostPerUnit }; 
                });
                
                // Фильтруем: оставляем только те облигации, на которые хватает бюджета (хотя бы 1 шт)
                let affordableBonds = bondCalculations.filter(b => b.fullCostPerUnit > 0 && b.fullCostPerUnit <= bondBudget);
                
                if (affordableBonds.length > 0) {
                    // 1. Равномерно распределяем бюджет по всем облигациям
                    const perBondBudget = bondBudget / affordableBonds.length;
                    affordableBonds.forEach(b => {
                        b.qty = Math.floor(perBondBudget / b.fullCostPerUnit);
                    });
                    
                    // 2. Суммируем остаток от каждой и распределяем на первые (лучшие)
                    let leftover = bondBudget - affordableBonds.reduce((acc, b) => acc + (b.qty * b.fullCostPerUnit), 0);
                    
                    // Идём по порядку (первые = лучшие), добавляем по 1 шт пока хватает
                    let distributed = true;
                    while (distributed) {
                        distributed = false;
                        for (const bond of affordableBonds) {
                            if (leftover >= bond.fullCostPerUnit) {
                                bond.qty += 1;
                                leftover -= bond.fullCostPerUnit;
                                distributed = true;
                            }
                        }
                    }
                    
                    // Убираем облигации с qty=0 (не влезли даже по 1 шт)
                    affordableBonds = affordableBonds.filter(b => b.qty > 0);
                }
                
                // Объединяем: показываем только купленные облигации
                bondCalculations = affordableBonds;
                
                bondCalculations.forEach(b => {
                    actualSpentTotal += (b.qty * b.fullCostPerUnit); 
                    bondQuantities[b.t] = b.qty;
                    
                    // === ПРАВИЛЬНЫЙ РАСЧЁТ КУПОННОГО ДОХОДА ===
                    // couponValue × кол-во_оставшихся_купонов × qty
                    const details = bondDetailsMap[b.t] || {};
                    const couponVal = details.couponValue || 0;
                    const freq = details.freq || 2; // частота купонов в год (по умолчанию 2)
                    const matDateStr = details.matDate || '';
                    
                    let remainingCoupons = freq * 3; // fallback: 3 года × частота
                    if (matDateStr && matDateStr !== '—') {
                        const matDate = new Date(matDateStr);
                        const now = new Date();
                        if (matDate > now) {
                            const daysRemaining = (matDate - now) / (1000 * 60 * 60 * 24);
                            const couponPeriodDays = freq > 0 ? 365 / freq : 182;
                            remainingCoupons = Math.floor(daysRemaining / couponPeriodDays);
                        } else {
                            remainingCoupons = 0; // облигация уже погашена
                        }
                    }
                    
                    const bondCouponIncome = couponVal * remainingCoupons * b.qty;
                    totalBondProjectedIncome += bondCouponIncome;
                    
                    console.log(`[FORECAST BONDS] ${b.t}: couponVal=${couponVal}, freq=${freq}, matDate=${matDateStr}, remainCoupons=${remainingCoupons}, qty=${b.qty}, income=${bondCouponIncome}`);
                    
                    if(b.qty > 0 && bondCouponsMap[b.t]) {
                        const info = bondCouponsMap[b.t];
                        const netAmount = (info.value * b.qty) * (1 - currentTax);
                        rainData.push({ date: info.date, name: b.n, qty: b.qty, amount: netAmount });
                    }
                    
                    // Данные для деталей (используем уже объявленный details)
                    const detailsFull = bondDetailsMap[b.t] || { matDate:'—', couponValue:0, nextCoupon:'—', couponYield:'—', freq:0 };
                    const calculatedCY = (b.p > 0 && detailsFull.couponValue && detailsFull.freq) ? ((detailsFull.couponValue * detailsFull.freq) / b.p * 100).toFixed(2) : '0.00';
                    
                    bHtml += `
                    <div class="portfolio-list-item" onclick="this.classList.toggle('expanded')">
                        <div class="list-item-summary">
                            <span class="list-item-ticker">${limitName(b.n)}</span>
                            <span class="list-item-yield bonds">${b.y}</span>
                            <span class="list-item-qty">${b.qty} шт.</span>
                            <span class="list-item-sum">${Math.round(b.qty * b.p).toLocaleString()} ₽</span>
                        </div>
                        <div class="list-item-details" onclick="event.stopPropagation()">
                            <div class="details-row">
                                <span class="details-row-label">Полное Наименование</span>
                                <span class="details-row-value">${b.n}</span>
                            </div>
                            
                            <!-- ОБНОВЛЕНО: ISIN с подсветкой и иконкой -->
                            <div class="details-row">
                                <span class="details-row-label">ISIN/Код</span>
                                <span class="details-row-value detail-ticker-highlight" onclick="copyTicker(event, '${b.t}')">
                                    ${b.t}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </span>
                            </div>
                            
                            <div class="details-row">
                                <span class="details-row-label">Дата погашения</span>
                                <span class="details-row-value">${details.matDate}</span>
                            </div>
                            <div class="details-row">
                                <span class="details-row-label">Цена</span>
                                <span class="details-row-value">${b.p} ₽</span>
                            </div>
                            <div class="details-row">
                                <span class="details-row-label">НКД</span>
                                <span class="details-row-value">${b.nkd.toFixed(2)} ₽</span>
                            </div>
                            <div class="details-row">
                                <span class="details-row-label">Простая Доходность</span>
                                <span class="details-row-value">${calculatedCY}%</span>
                            </div>
                            
                            <button class="details-btn" onclick="openTradingView(event, '${b.t}')">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                Открыть график
                            </button>
                        </div>
                    </div>`;
                });
            }



if(document.getElementById('listBonds')) { 
    document.getElementById('listBonds').innerHTML = bHtml;
    
    // Обновляем бейдж суммы облигаций
    const badgeBonds = document.getElementById('badge-bonds-sum');
    if(badgeBonds) badgeBonds.innerText = Math.round(bondBudget).toLocaleString() + ' ₽';
}
          
// === ОБНОВЛЕНИЕ ИТОГО ОФЗ + % ИСПОЛНЕНИЯ БЮДЖЕТА ===
    const bondsTotalRow = document.getElementById('bondsTotalSum');
    const bondsPercentBadge = document.getElementById('bondsTotalPercent');

    if(bondsTotalRow) {
        // Считаем ИТОГО по ВСЕМ облигациям (не только видимым в свёрнутом списке)
        let totalAllSum = 0;
        bondCalculations.forEach(b => {
            totalAllSum += Math.round(b.qty * b.fullCostPerUnit);
        });

        bondsTotalRow.innerText = totalAllSum.toLocaleString() + ' ₽';

        // Считаем процент ОТ БЮДЖЕТА НА ОБЛИГАЦИИ
        if(bondsPercentBadge && typeof bondBudget !== 'undefined' && bondBudget > 0) {
            const percent = (totalAllSum / bondBudget) * 100;
            if (percent > 99.9 && percent < 100.1) {
                 bondsPercentBadge.innerText = '100%';
            } else {
                 bondsPercentBadge.innerText = percent.toFixed(1) + '%';
            }
        }
    }
            
            if(document.getElementById('couponList')) {
                rainData.sort((a,b) => new Date(a.date) - new Date(b.date));
                let couponHtml = ''; let couponTotal = 0;
                if(rainData.length === 0) { 
                    couponHtml = '<div style="text-align:center; padding:15px; color:#aaa; font-size:12px;">Нет ближайших выплат для выбранных активов.</div>';
                } else { 
                    rainData.forEach(r => { 
                        couponTotal += r.amount; 
                        couponHtml += `
                        <div class="coupon-row">
                            <div><b>${new Date(r.date).toLocaleDateString('ru-RU')}</b></div>
                            <div style="color:#8e8e93">${limitName(r.name)}</div>
                            <div style="text-align:center">${r.qty}шт.</div>
                            <div style="text-align:right"><b>${Math.round(r.amount).toLocaleString()}₽</b></div>
                        </div>`; 
                    }); 
                }
                document.getElementById('couponList').innerHTML = couponHtml;
                document.getElementById('couponTotalHeader').innerText = Math.round(couponTotal).toLocaleString() + ' ₽';
            }

            // === Превью ближайшей выплаты (для свёрнутого "Купонного дождя") ===
            updateCouponPreviewV2(rainData);

            let ofzHtml = '';
            bonds.forEach(b => {
                const details = bondDetailsMap[b.t] || { matDate:'—', couponValue:0, nextCoupon:'—', couponYield:'—', freq:0 };
                const calculatedCY = (b.p > 0 && details.couponValue && details.freq) ? ((details.couponValue * details.freq) / b.p * 100).toFixed(2) : '0.00';
                ofzHtml += `
                <div class="ofz-card-modern" onclick="toggleOfzDetails('details-${b.t}')">
                    <div class="ofz-main-info">
                        <div class="ofz-name-lg">${limitName(b.n)}</div>
                        <div class="ofz-ticker-sm">${b.t}</div>
                    </div>
                    <div class="ofz-price">${b.p}</div>
                    <div class="ofz-nkd-badge">${Math.round(b.nkd*10)/10}</div>
                    <div class="ofz-yield-badge" title="Доходность к погашению">
                        ${b.y} <svg class="ofz-arrow" viewBox="0 0 24 24"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>
                    </div>
                </div>
                <div id="details-${b.t}" class="ofz-details-panel">
                    <div class="ofz-detail-row"><span>Код:</span> <span class="ofz-detail-val">${b.t}</span></div>
                    <div class="ofz-detail-row"><span>НКД:</span> <span class="ofz-detail-val">${b.nkd.toFixed(2)} ₽</span></div>
                    <div class="ofz-detail-row"><span>Дата погашения:</span> <span class="ofz-detail-val">${details.matDate}</span></div>
                    <div class="ofz-detail-row"><span>Размер купона:</span> <span class="ofz-detail-val">${details.couponValue} ₽</span></div>
                    <div class="ofz-detail-row"><span>Дата ближайшего купона:</span> <span class="ofz-detail-val">${details.nextCoupon}</span></div>
                    <div class="ofz-detail-row"><span>Текущая купонная доходность:</span> <span class="ofz-detail-val">${calculatedCY}%</span></div>
                    <div class="ofz-detail-row"><span>Выплат в год:</span> <span class="ofz-detail-val">${details.freq}</span></div>
                </div>`;
            });
            if(document.getElementById('ofz-list')) document.getElementById('ofz-list').innerHTML = ofzHtml;

                                // === ГЕНЕРАЦИЯ ЭШЕЛОНОВ АКЦИЙ (ФИНАЛЬНЫЙ ВАРИАНТ) ===
            let eHtml = '';
            let totalStockProjectedGrowth = 0;
            let echelonIndex = 0;

            echelons.forEach(e => {
                const echelonBudget = stockBudget * e.weight; 
                const perAssetBudget = e.assets.length > 0 ? echelonBudget / e.assets.length : 0;
                
                let stockCalculations = e.assets.map(a => { 
                    const fullCostPerUnit = a.p * (1 + brokerFee); 
                    let qty = fullCostPerUnit > 0 ? Math.floor(perAssetBudget / fullCostPerUnit) : 0; 
                    return { ...a, qty, fullCostPerUnit }; 
                });
                
                let currentEchelonSpent = stockCalculations.reduce((acc, s) => acc + (s.qty * s.fullCostPerUnit), 0);
                if (stockCalculations.length > 0 && (echelonBudget - currentEchelonSpent) >= stockCalculations[0].fullCostPerUnit) {
                    stockCalculations[0].qty += Math.floor((echelonBudget - currentEchelonSpent) / stockCalculations[0].fullCostPerUnit);
                }
                
                const tipId = `echelon-tip-new-${echelonIndex}`;
                const echelonNum = echelonIndex + 1;
                const echelonLabel = ['I', 'II', 'III', 'IV'][echelonIndex];

                // Цвета для плашек (Зеленый, Синий, Желтый, Оранжевый)
                const colors = [
                    { bg: 'rgba(46, 204, 113, 0.15)', txt: '#27ae60' },
                    { bg: 'rgba(52, 152, 219, 0.15)', txt: '#2980b9' },
                    { bg: 'rgba(241, 196, 15, 0.15)', txt: '#f39c12' },
                    { bg: 'rgba(231, 76, 60, 0.15)', txt: '#d35400' }
                ];
                const c = colors[echelonIndex];
                
                eHtml += `
    <div class="echelon-header-new" onclick="toggleEchelonTip(event, '${tipId}')">
        <div class="echelon-header-left">
            <div class="echelon-number e${echelonNum}">${echelonLabel}</div>
            <span class="echelon-title-new" style="color: var(--text-slate); font-family: 'Inter', sans-serif !important; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; background: transparent; padding: 0;"> ${e.title} </span>
            <div class="h-help-btn h-help-animated" style="width:16px;height:16px;font-size:9px;margin-left:2px;" onclick="event.stopPropagation(); this.classList.remove('h-help-animated');">ⓘ</div>
        </div>
        <div class="echelon-header-right">
            <span class="echelon-sum">${Math.round(echelonBudget).toLocaleString()} ₽</span>
            <span class="echelon-percent-badge" style="color: var(--text-slate); font-family: 'Inter', sans-serif !important; font-size: 10px; font-weight: 700; background: transparent; padding: 0; letter-spacing: 0.08em;">${Math.round(e.weight*100)}%</span>
        </div>
    </div>
                
                <div class="echelon-info-tooltip" id="${tipId}">${e.info}</div>
                
                <div class="portfolio-list">
                    <!-- Заголовки таблицы -->
                    <div class="echelon-columns-header">
                        <span>Компания</span>
                        <span>Потенциал</span>
                        <span>Кол-во</span>
                        <span>Сумма</span>
                    </div>`;
                
                stockCalculations.forEach(s => {
                    actualSpentTotal += (s.qty * s.fullCostPerUnit);
                    const targetPct = parseFloat(s.target.replace(/[^\d.\-]/g,'')) || 0; // target — это % роста
                    
                    // Рост = qty * price * (targetPct / 100)
                    if (s.qty > 0 && targetPct > 0) {
                        const growth = s.qty * s.p * (targetPct / 100);
                        totalStockProjectedGrowth += growth;
                        console.log(`[FORECAST STOCK] ${s.t}: price=${s.p}, target=${targetPct}%, qty=${s.qty}, growth=+${growth.toFixed(0)}`);
                    } else if (s.qty > 0) {
                        console.log(`[FORECAST STOCK] ${s.t}: price=${s.p}, target=${targetPct}%, qty=${s.qty}, growth=0 (цель ≤ 0%)`);
                    }
                    
                    eHtml += `
                    <div class="portfolio-list-item" onclick="this.classList.toggle('expanded')">
                        <div class="list-item-summary">
                            <span class="list-item-ticker">${s.t}</span>
                            <span class="list-item-yield stocks">${s.target.replace(' ₽','')}</span>
                            <span class="list-item-qty">${s.qty} шт.</span>
                            <span class="list-item-sum">${Math.round(s.qty * s.p).toLocaleString()} ₽</span>
                        </div>
                        <div class="list-item-details" onclick="event.stopPropagation()">
                            <div class="details-row">
                                <span class="details-row-label">Компания</span>
                                <span class="details-row-value">${s.n}</span>
                            </div>
                            <div class="details-row">
                                <span class="details-row-label">Тикер</span>
                                <span class="details-row-value detail-ticker-highlight" onclick="copyTicker(event, '${s.t}')">
                                    ${s.t} 
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </span>
                            </div>
                            <div class="details-row">
                                <span class="details-row-label">Цена</span>
                                <span class="details-row-value">${s.p} ₽</span>
                            </div>
                            <div class="details-row">
                                <span class="details-row-label">Потенциал</span>
                                <span class="details-row-value">${s.target}</span>
                            </div>
                            <!-- Примечание статичное -->
                            <div class="details-row" style="border-bottom:none !important; justify-content:center !important; padding-top:6px !important;">
                                <span style="font-size:10px; color:var(--claude-text-secondary); opacity:0.7;">[ Прогноз на период до 36 мес. ]</span>
                            </div>
                            <button class="details-btn" onclick="openTradingView(event, '${s.t}')">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                Открыть график
                            </button>
                        </div>
                    </div>`;
                });
                
                eHtml += `</div>`; // Закрываем div.portfolio-list
                echelonIndex++;
            });

            console.log(`[FORECAST TOTAL] inputSum=${inputSum}, bonds=${totalBondProjectedIncome}, stocks=${totalStockProjectedGrowth}, fee=${inputSum * brokerFee}, total=${inputSum + totalBondProjectedIncome + totalStockProjectedGrowth - inputSum * brokerFee}`);

            // === ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (ОДИН РАЗ, БЕЗ ДУБЛЕЙ) ===
            if(document.getElementById('echelonContainer')) {
                document.getElementById('echelonContainer').innerHTML = eHtml;
                
                // 1. Обновляем бейдж суммы акций (ИСПРАВЛЕНО)
                const badgeStocks = document.getElementById('badge-stocks-sum');
            if(badgeStocks) {
               badgeStocks.innerText = Math.round(stockBudget).toLocaleString() + ' ₽';
               badgeStocks.style.display = 'flex'; // Принудительно
              }
                // === ОБНОВЛЕНИЕ ИТОГО ПО ЭШЕЛОНАМ ===
const totalRow = document.getElementById('echelonsTotalSum');
if(totalRow) {
    // stockBudget - это переменная, в которой хранится общая сумма на акции
    totalRow.innerText = Math.round(stockBudget).toLocaleString() + ' ₽';
}

                // 2. Обновляем все остальные цифры
                const valStocks = document.getElementById('valStocks');
                if(valStocks) valStocks.innerText = Math.round(stockBudget).toLocaleString();
                
                const usageFill = document.getElementById('usageFill');
                if(usageFill) usageFill.style.width = Math.min((actualSpentTotal / inputSum) * 100, 100) + '%';
                
                const usageLabelText = document.getElementById('usageLabelText');
                if(usageLabelText) usageLabelText.innerText = Math.round(actualSpentTotal).toLocaleString() + ' ₽';
                
                document.getElementById('summ-invested').innerText = Math.round(inputSum).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';
                document.getElementById('srl-bond-pct').innerText = bondPct + '%';
                document.getElementById('srl-stock-pct').innerText = stockPct + '%';
                document.getElementById('bar-bond-fill').style.width = bondPct + '%';
                document.getElementById('bar-stock-fill').style.width = stockPct + '%';
                
                const feePercent = (brokerFee * 100).toFixed(2);
                document.getElementById('summ-fee').innerText = feePercent + '%';
                
                document.getElementById('summ-bond-income').innerText = '+' + Math.round(totalBondProjectedIncome).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';
                document.getElementById('summ-stock-growth').innerText = '+' + Math.round(totalStockProjectedGrowth).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';
                
                const projectedTotal = inputSum + totalBondProjectedIncome + totalStockProjectedGrowth - feeVal;
                let percentageChange = (inputSum > 0) ? ((projectedTotal - inputSum) / inputSum) * 100 : 0;
                const changeSign = percentageChange >= 0 ? '+' : '';
                const changeColor = percentageChange >= 0 ? '#27ae60' : '#e74c3c';
                const changeHtml = ` <span style="font-size: 14px; color: ${changeColor}; font-weight: 500;">(${changeSign}${percentageChange.toFixed(1)}%)</span>`;
                
                document.getElementById('summ-total-3y').innerHTML = Math.round(projectedTotal).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽' + changeHtml;
                
                // === ОБНОВЛЕНИЕ НОВОГО ДИЗАЙНА V2 ===
                // Синхронизируем распределение в новую карточку
                const barStockV2 = document.getElementById('bar-stock-fill-v2');
                const barBondV2 = document.getElementById('bar-bond-fill-v2');
                if (barStockV2) barStockV2.style.width = stockPct + '%';
                if (barBondV2) barBondV2.style.width = bondPct + '%';
                
                const stockPctV2 = document.getElementById('srl-stock-pct-v2');
                const bondPctV2 = document.getElementById('srl-bond-pct-v2');
                if (stockPctV2) stockPctV2.textContent = stockPct + '%';
                if (bondPctV2) bondPctV2.textContent = bondPct + '%';
                
                // Прогноз в новом формате - сумма + процент + детализация
                const totalValueV2 = document.getElementById('summ-total-value-v2');
                const totalPercentV2 = document.getElementById('summ-total-percent-v2');
                const bondIncomeMini = document.getElementById('summ-bond-income-mini');
                const stockGrowthMini = document.getElementById('summ-stock-growth-mini');
                const legendBondSum = document.getElementById('legend-bond-sum');
                const legendStockSum = document.getElementById('legend-stock-sum');

                const fmtRub = (v) => Math.round(v).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';

                if (legendBondSum) legendBondSum.textContent = fmtRub(bondBudget);
                if (legendStockSum) legendStockSum.textContent = fmtRub(stockBudget);

                if (totalValueV2) {
                    totalValueV2.textContent = '~' + fmtRub(projectedTotal);
                }
                if (totalPercentV2) {
                    totalPercentV2.setAttribute('data-pct', changeSign + percentageChange.toFixed(1) + '%');
                }
                if (bondIncomeMini) {
                    bondIncomeMini.textContent = '+' + Math.round(totalBondProjectedIncome).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';
                }
                if (stockGrowthMini) {
                    stockGrowthMini.textContent = '+' + Math.round(totalStockProjectedGrowth).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';
                }
                
                // Рендерим список облигаций в новый контейнер V2 (с возможностью свернуть/развернуть)
                window._bondCalculationsV2 = bondCalculations;
                window._bondDetailsMapV2 = bondDetailsMap;
                renderPortfolioBondsV2();
                hideSkeletonInstant('skeleton-portfolio-bonds');
                
                // Копируем купонный дождь в новый контейнер
                const couponListV2 = document.getElementById('couponListV2');
                const couponTotalV2 = document.getElementById('couponTotalHeaderV2');
                const couponListOld = document.getElementById('couponList');
                const couponTotalOld = document.getElementById('couponTotalHeader');
                if (couponListV2 && couponListOld) { couponListV2.innerHTML = couponListOld.innerHTML; hideSkeletonInstant('skeleton-coupons'); }
                if (couponTotalV2 && couponTotalOld) couponTotalV2.textContent = couponTotalOld.textContent;
                
                // Рендерим эшелоны в новый контейнер V2
                const echelonContainerV2 = document.getElementById('echelonContainerV2');
                if (echelonContainerV2) {
                    let echelonsHtmlV2 = '';
                    let grandTotalStocks = 0;
                    // Новые названия эшелонов
                    const echelonNames = ['НАДЁЖНЫЙ', 'СТАБИЛЬНЫЙ', 'РИСКОВЫЙ', 'ВЕНЧУРНЫЙ'];
                    // Римские цифры
                    const romanNumerals = ['I', 'II', 'III', 'IV'];
                    const echelonClasses = ['e1', 'e2', 'e3', 'e4'];
                    
                    echelons.forEach((e, idx) => {
                        const echelonBudget = stockBudget * e.weight;
                        const perAssetBudget = e.assets.length > 0 ? echelonBudget / e.assets.length : 0;
                        
                        let stocksInEchelon = e.assets.map(a => {
                            const fullCostPerUnit = a.p * (1 + brokerFee);
                            const qty = fullCostPerUnit > 0 ? Math.floor(perAssetBudget / fullCostPerUnit) : 0;
                            const targetPrice = parseFloat(a.target.replace(/[^\d.]/g,'')) || a.p;
                            const yieldPercent = a.p > 0 ? (((targetPrice - a.p) / a.p) * 100).toFixed(0) : '0';
                            return { ...a, qty, sum: qty * a.p, yieldPercent };
                        });
                        
                        const percent = Math.round(e.weight * 100);

                        // === ВСТАВИТЬ ЭТОТ БЛОК (Подсчет суммы эшелона) ===
                        const echelonTotalSum = stocksInEchelon.reduce((acc, item) => acc + item.sum, 0);
                        grandTotalStocks += echelonTotalSum;
                        // ==================================================
                        
                        echelonsHtmlV2 += `
                        <div class="portfolio-echelon-card" onclick="togglePortfolioEchelon(this, event)">
                            <div class="portfolio-echelon-header">
                                <div class="portfolio-echelon-header-left">
                                    <div class="portfolio-echelon-number ${echelonClasses[idx]}">${romanNumerals[idx]}</div>
                                    <div class="portfolio-echelon-title">${echelonNames[idx]}</div>
                                </div>
                                <div class="portfolio-echelon-header-right">
                                    <span class="portfolio-echelon-sum">${Math.round(echelonBudget).toLocaleString()} ₽</span>
                                    <span class="portfolio-echelon-percent">${percent}%</span>
                                    <svg class="portfolio-echelon-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                </div>
                            </div>
                            <div class="portfolio-echelon-content">
                                <div class="portfolio-echelon-columns-header">
                                    <span class="pf-rank-head"></span>
                                    <span>ТИКЕР</span>
                                    <span>ДОХОДНОСТЬ</span>
                                    <span>ШТ</span>
                                    <span>РАСХОДЫ</span>
                                </div>
                                <div class="portfolio-echelon-list">
                                    ${stocksInEchelon.map((s, idx) => `
                                        <div class="portfolio-stock-wrapper" onclick="event.stopPropagation(); this.classList.toggle('expanded')">
                                            <div class="portfolio-stock-item">
                                                <div class="pf-rank">#${idx + 1}</div>
                                                <div class="portfolio-stock-ticker" style="display:flex;align-items:center;gap:5px;">${s.t}<span class="ofz-expand-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></span></div>
                                                <div class="portfolio-stock-yield">${s.target.replace(' ₽', '')}</div>
                                                <div class="portfolio-stock-qty">${s.qty}</div>
                                                <div class="portfolio-stock-sum">${Math.round(s.sum).toLocaleString()} ₽</div>
                                            </div>
                                            <div class="portfolio-stock-details">
                                                <div class="portfolio-stock-detail-grid">
                                                    <div class="portfolio-stock-detail-row">
                                                        <span class="portfolio-stock-detail-label">Компания</span>
                                                        <span class="portfolio-stock-detail-value">${s.n || s.t}</span>
                                                    </div>
                                                    <div class="portfolio-stock-detail-row">
                                                        <span class="portfolio-stock-detail-label">Текущая цена</span>
                                                        <span class="portfolio-stock-detail-value">${s.p} ₽</span>
                                                    </div>
                                                    <div class="portfolio-stock-detail-row">
                                                        <span class="portfolio-stock-detail-label">Потенциал</span>
                                                        <span class="portfolio-stock-detail-value" style="color: #10B981;">${fmtPotential(s.target, s.p)}</span>
                                                    </div>
                                                    <div class="portfolio-stock-detail-row">
                                                        <span class="portfolio-stock-detail-label">Прогноз</span>
                                                        <span class="portfolio-stock-detail-value" style="font-size:10px; color:var(--text-slate);">до 36 мес.</span>
                                                    </div>
                                                </div>
                                                <div class="portfolio-stock-buttons">
                                                    <button class="portfolio-stock-btn chart" onclick="event.stopPropagation(); openTradingViewDirect('${s.t}')">
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                                        График
                                                    </button>
                                                    <button class="portfolio-stock-btn info" onclick="event.stopPropagation(); openStockDetail('${s.t}', ${idx + 1})">
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                                        О компании
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div class="portfolio-echelon-total-line">
                               <span class="echelon-total-label">ИТОГО</span>
                               <span class="echelon-total-value">${Math.round(echelonTotalSum).toLocaleString()} ₽</span>
                              </div>
                            </div>
                        </div>`;
                    });
                    
                    echelonContainerV2.innerHTML = echelonsHtmlV2;
                    hideSkeletonInstant('skeleton-portfolio-echelons');
                    // === ВСТАВЛЯЕМ СЮДА (ШАГ 3) ===
const totalStocksRow = document.getElementById('echelonsTotalSum');
const totalStocksPctBadge = document.getElementById('stocksTotalPercent');

if(totalStocksRow) {
    // Выводим сумму
    totalStocksRow.innerText = Math.round(grandTotalStocks).toLocaleString() + ' ₽';

    // Считаем процент
    if(totalStocksPctBadge && typeof stockBudget !== 'undefined' && stockBudget > 0) {
        const percent = (grandTotalStocks / stockBudget) * 100;
        
        // Если больше 99.9%, но меньше 100% (из-за копеек), ставим 100%
        // Иначе показываем 1 знак после запятой
        if (percent > 99.9 && percent < 100.1) {
             totalStocksPctBadge.innerText = '100%';
        } else {
             totalStocksPctBadge.innerText = percent.toFixed(1) + '%';
        }
    }
}
// =============================
                }
            }
            
            updateEchelonTable();
            renderOfzList();
            
            // Сохраняем данные для списка к покупке
            window._shoppingListData = { bonds: [], stocks: [] };
            if (bondCalculations.length > 0) {
                bondCalculations.forEach(b => {
                    if (b.qty > 0) window._shoppingListData.bonds.push({ ticker: b.t, name: b.n, qty: b.qty, price: b.p, sum: Math.round(b.qty * b.fullCostPerUnit) });
                });
            }
            echelons.forEach((e, idx) => {
                const eBudget = stockBudget * e.weight;
                const perA = e.assets.length > 0 ? eBudget / e.assets.length : 0;
                let calcs = e.assets.map(a => {
                    const fc = a.p * (1 + brokerFee);
                    return { ...a, qty: fc > 0 ? Math.floor(perA / fc) : 0, fc };
                });
                let left = eBudget - calcs.reduce((acc, s) => acc + (s.qty * s.fc), 0);
                if (calcs.length > 0 && left >= calcs[0].fc && calcs[0].fc > 0) calcs[0].qty += Math.floor(left / calcs[0].fc);
                calcs.forEach(s => {
                    if (s.qty > 0) window._shoppingListData.stocks.push({ ticker: s.t, name: s.n, qty: s.qty, price: s.p, sum: Math.round(s.qty * s.p), echelon: idx + 1 });
                });
            });
        } // Закрытие функции draw

/* =================================================================
   PORTFOLIO V2 - ФУНКЦИИ ПЕРЕКЛЮЧЕНИЯ
   ================================================================= */

// Переключение страниц К ПОКУПКЕ / МОИ АКТИВЫ
function switchPortfolioPage(page) {
    // Обновляем кнопки
    document.querySelectorAll('.portfolio-page-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    
    // Скрываем/показываем страницы
    document.querySelectorAll('.portfolio-page-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetPage = document.getElementById(`portfolio-page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Показываем action panel только на странице "К покупке"
    const actionPanel = document.getElementById('portfolioActionPanelV2');
    if (actionPanel) {
        actionPanel.style.display = (page === 'buy') ? 'flex' : 'none';
    }
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Переключение вкладок Денежный поток / Растущая часть
function switchPortfolioContentTab(tab) {
    const switcher = document.getElementById('portfolioTabSwitcher');
    if (!switcher) return;
    
    // Обновляем кнопки
    document.querySelectorAll('#portfolioTabSwitcher .portfolio-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Двигаем глайдер
    if (tab === 'stocks') {
        switcher.classList.add('show-stocks');
    } else {
        switcher.classList.remove('show-stocks');
    }
    
    // Скрываем/показываем контент
    document.querySelectorAll('.portfolio-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetTab = document.getElementById(`portfolio-tab-${tab}`);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    // Ширина блока могла измениться → пересчитываем центрирование таблиц
    if (window.pfCenterTables) requestAnimationFrame(window.pfCenterTables);
}

// === Список ОФЗ: рендер с возможностью свернуть/развернуть (топ-3 по доходности) ===
const PORTFOLIO_BONDS_VISIBLE = 3;
let portfolioBondsExpanded = false;

function renderPortfolioBondsV2(opts) {
    opts = opts || {};
    const list = document.getElementById('listBondsV2');
    if (!list) return;
    const bondCalculations = window._bondCalculationsV2 || [];
    const bondDetailsMap = window._bondDetailsMapV2 || {};
    if (bondCalculations.length === 0) { list.innerHTML = ''; return; }

    // Сортируем по доходности (убывание) — топ показывается первым
    const sorted = [...bondCalculations].sort((a, b) => parseFloat(b.y) - parseFloat(a.y));
    const total = sorted.length;
    const showAll = true; // Показываем полный список без кнопки
    const toShow = sorted;
    const hiddenCount = 0;
    const hiddenSum = 0;

    let html = '';
    toShow.forEach((b, idx) => {
        const qty = b.qty;
        const details = bondDetailsMap[b.t] || { matDate:'—', couponValue:0, nextCoupon:'—' };
        const formattedName = b.n.replace(/(\d+)/g, '<span class="ofz-number">$1</span>');
        const isJustRevealed = opts.justExpanded && idx >= PORTFOLIO_BONDS_VISIBLE;
        html += `
        <div class="portfolio-ofz-item${isJustRevealed ? ' ofz-just-revealed' : ''}" onclick="this.classList.toggle('expanded')">
            <div class="portfolio-ofz-summary">
                <div class="pf-rank">#${idx + 1}</div>
                <div class="portfolio-ofz-name">${formattedName}<span class="ofz-expand-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></span></div>
                <div class="portfolio-ofz-yield">${b.y}</div>
                <div class="portfolio-ofz-qty">${qty}</div>
                <div class="portfolio-ofz-sum">${Math.round(qty * b.fullCostPerUnit).toLocaleString()} ₽</div>
            </div>
            <div class="portfolio-ofz-details">
                <div class="portfolio-ofz-details-grid">
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">Код (ISIN)</span>
                        <div class="ofz-copy-wrapper" onclick="event.stopPropagation(); copyTickerNew('${b.t}')">
                            <span class="ofz-copy-code">${b.t}</span>
                            <svg class="ofz-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </div>
                    </div>
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">Текущая цена</span>
                        <span class="portfolio-ofz-detail-value">${b.p} ₽</span>
                    </div>
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">НКД</span>
                        <span class="portfolio-ofz-detail-value">${b.nkd.toFixed(2)} ₽</span>
                    </div>
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">Итого (цена + НКД)</span>
                        <span class="portfolio-ofz-detail-value" style="font-weight: 700;">${(b.p + b.nkd).toFixed(2)} ₽</span>
                    </div>
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">Погашение</span>
                        <span class="portfolio-ofz-detail-value">${details.matDate}</span>
                    </div>
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">Размер купона</span>
                        <span class="portfolio-ofz-detail-value">${details.couponValue} ₽</span>
                    </div>
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">Ближайший купон</span>
                        <span class="portfolio-ofz-detail-value">${details.nextCoupon || '—'}</span>
                    </div>
                    <div class="portfolio-ofz-detail-row">
                        <span class="portfolio-ofz-detail-label">Выплат в год</span>
                        <span class="portfolio-ofz-detail-value">${details.freq || 2}</span>
                    </div>
                </div>
                <button class="ofz-aurora-chart-btn" onclick="event.stopPropagation(); openTradingViewDirect('${b.t}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    Открыть график
                </button>
            </div>
        </div>`;
    });

    if (hiddenCount > 0) {
        const chevrons = `
            <span class="ofz-toggle-chevrons">
                <svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 2 12 10 22 2"/></svg>
                <svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 2 12 10 22 2"/></svg>
                <svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 2 12 10 22 2"/></svg>
            </span>`;
        if (!portfolioBondsExpanded) {
            html += `
            <button class="ofz-toggle-btn" onclick="togglePortfolioBondsV2(event)">
                ${chevrons}
                <span class="ofz-toggle-text-wrap">
                    <span class="ofz-toggle-main">Показать ещё ${hiddenCount} ОФЗ</span>
                    <span class="ofz-toggle-sub">на ${hiddenSum.toLocaleString('ru-RU').replace(/,/g, ' ')} ₽</span>
                </span>
            </button>`;
        } else {
            html += `
            <button class="ofz-toggle-btn ofz-toggle-collapse" onclick="togglePortfolioBondsV2(event)">
                ${chevrons}
                <span class="ofz-toggle-text-wrap">
                    <span class="ofz-toggle-main">Свернуть список</span>
                    <span class="ofz-toggle-sub">показать только топ-${PORTFOLIO_BONDS_VISIBLE}</span>
                </span>
            </button>`;
        }
    }

    list.innerHTML = html;
}

function togglePortfolioBondsV2(e) {
    if (e) e.stopPropagation();
    const wasExpanded = portfolioBondsExpanded;
    portfolioBondsExpanded = !portfolioBondsExpanded;
    renderPortfolioBondsV2({ justExpanded: !wasExpanded });
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Раскрытие купонного дождя с вибрацией
function toggleCouponRain(element) {
    const card = element.closest('.portfolio-coupon-card') || element.parentElement;
    card.classList.toggle('open');

    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// === Обновление превью ближайшей купонной выплаты ===
function updateCouponPreviewV2(rainData) {
    const strip = document.getElementById('couponPreviewStripV2');
    if (!strip) return;
    if (!rainData || rainData.length === 0) {
        strip.classList.add('is-empty');
        return;
    }

    const sorted = [...rainData].sort((a, b) => new Date(a.date) - new Date(b.date));
    const next = sorted[0];

    const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    const target = new Date(next.date);
    if (isNaN(target.getTime())) {
        strip.classList.add('is-empty');
        return;
    }
    const day = String(target.getDate()).padStart(2, '0');
    const monthName = months[target.getMonth()];

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.round((targetStart - todayStart) / (1000 * 60 * 60 * 24));

    function dayUnit(n) {
        const abs = Math.abs(n);
        const lastTwo = abs % 100;
        const last = abs % 10;
        if (lastTwo >= 11 && lastTwo <= 14) return 'дн.';
        if (last === 1) return 'день';
        if (last >= 2 && last <= 4) return 'дня';
        return 'дн.';
    }

    let relText;
    if (diffDays === 0) relText = 'Сегодня';
    else if (diffDays === 1) relText = 'Завтра';
    else if (diffDays > 1) relText = 'через ' + diffDays + ' ' + dayUnit(diffDays);
    else relText = day + ' ' + monthName;

    const elName = document.getElementById('cpName');
    const elQty = document.getElementById('cpQty');
    const elSum = document.getElementById('cpSum');
    const elDay = document.getElementById('cpDay');
    const elDate = document.getElementById('cpRealDate');

    if (elName) elName.textContent = next.name;
    if (elQty) elQty.textContent = next.qty + ' шт';
    if (elSum) elSum.textContent = '+' + Math.round(next.amount).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';
    if (elDay) elDay.textContent = relText;
    if (elDate) elDate.textContent = day + ' ' + monthName;

    strip.classList.remove('is-empty');
}

// Новый расчёт с вибрацией - переход на вкладку Расчёт
function newCalculationWithHaptic() {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
    showScreen('screen-app');
}

// Поделиться с вибрацией
function shareWithHaptic() {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
    shareAsPDF();
}

// === Обработчик кнопок с подтверждением (показ названия → второй тап = действие) ===
let _activeActionWrapper = null;

function handleActionBtn(btn, actionFn) {
    const wrapper = btn.closest('.portfolio-action-wrapper');
    
    // Вибрация при нажатии
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    
    // Если эта кнопка уже активна — выполняем действие
    if (wrapper.classList.contains('show-label')) {
        closeAllActionLabels();
        actionFn();
        return;
    }
    
    // Иначе — показываем название, скрываем остальные
    closeAllActionLabels();
    wrapper.classList.add('show-label');
    btn.classList.add('active-hint');
    _activeActionWrapper = wrapper;
    
    // Закрытие при тапе вне кнопки
    setTimeout(() => {
        document.addEventListener('click', _closeActionLabelsOnOutsideClick, { once: true });
    }, 10);
}

function closeAllActionLabels() {
    document.querySelectorAll('.portfolio-action-wrapper.show-label').forEach(w => {
        w.classList.remove('show-label');
        w.querySelector('.portfolio-action-icon-btn')?.classList.remove('active-hint');
    });
    _activeActionWrapper = null;
}

function _closeActionLabelsOnOutsideClick(e) {
    if (_activeActionWrapper && !_activeActionWrapper.contains(e.target)) {
        closeAllActionLabels();
    } else if (_activeActionWrapper) {
        // Если кликнули внутри — переставляем слушатель
        setTimeout(() => {
            document.addEventListener('click', _closeActionLabelsOnOutsideClick, { once: true });
        }, 10);
    }
}

// Выпадающее меню портфеля (три точки)
function togglePortfolioMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('portfolioDropdownMenu');
    if (menu) {
        menu.classList.toggle('open');
        if (menu.classList.contains('open')) {
            // Закрытие при клике вне меню
            setTimeout(() => {
                document.addEventListener('click', closePortfolioMenuOnClick, { once: true });
            }, 10);
        }
    }
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function closePortfolioMenu() {
    const menu = document.getElementById('portfolioDropdownMenu');
    if (menu) menu.classList.remove('open');
}

function closePortfolioMenuOnClick(e) {
    const menu = document.getElementById('portfolioDropdownMenu');
    const btn = document.getElementById('portfolioDotsBtn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.remove('open');
    }
}

// === ТЕРМИНАЛ (Список к покупке) ===
let _slTotalSum = 0;
let _slExecutedSum = 0;

function openShoppingList() {
    const overlay = document.getElementById('shoppingListOverlay');
    const body = document.getElementById('shoppingListBody');
    if (!overlay || !body) return;
    
    const data = window._shoppingListData;
    if (!data || (data.bonds.length === 0 && data.stocks.length === 0)) {
        body.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#64748B;font-size:14px;">Сначала рассчитайте портфель</div>';
        overlay.style.display = 'flex';
        return;
    }
    
    const roman = ['I','II','III','IV'];
    const svgCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"/></svg>';
    
    let html = '';
    _slTotalSum = 0;
    _slExecutedSum = 0;
    
    // Облигации
    if (data.bonds.length > 0) {
        const bondsTotal = data.bonds.reduce((a, b) => a + b.sum, 0);
        _slTotalSum += bondsTotal;
        
        html += `<div class="sl-section-label">Облигации / OFZ</div>`;
        html += `<div class="sl-card-group">`;
        data.bonds.forEach(b => {
            html += `
            <div class="sl-item" data-sum="${b.sum}" onclick="toggleShopItem(this)">
                <div class="sl-checkbox"></div>
                <div class="sl-info">
                    <div class="sl-info-top">
                        <span class="sl-badge sl-badge-ofz">OFZ</span>
                        <span class="sl-ticker">${b.ticker}</span>
                    </div>
                    <div class="sl-name">${b.name}</div>
                </div>
                <div class="sl-right">
                    <div class="sl-qty">${b.qty} шт</div>
                    <div class="sl-sum">${b.sum.toLocaleString('ru-RU')} ₽</div>
                </div>
            </div>`;
        });
        html += `<div class="sl-group-total">
            <span class="sl-group-total-label">Итого ОФЗ</span>
            <span class="sl-group-total-value">${bondsTotal.toLocaleString('ru-RU')} ₽</span>
        </div></div>`;
    }
    
    // Акции
    if (data.stocks.length > 0) {
        const stocksTotal = data.stocks.reduce((a, s) => a + s.sum, 0);
        _slTotalSum += stocksTotal;
        
        html += `<div class="sl-section-label">Акции / Stocks</div>`;
        html += `<div class="sl-card-group">`;
        data.stocks.forEach(s => {
            const tier = s.echelon || 1;
            const badgeClass = tier <= 3 ? `sl-badge-t${tier}` : 'sl-badge-t3';
            html += `
            <div class="sl-item" data-sum="${s.sum}" onclick="toggleShopItem(this)">
                <div class="sl-checkbox"></div>
                <div class="sl-info">
                    <div class="sl-info-top">
                        <span class="sl-badge ${badgeClass}">${roman[tier-1]}</span>
                        <span class="sl-ticker">${s.ticker}</span>
                    </div>
                    <div class="sl-name">${s.name}</div>
                </div>
                <div class="sl-right">
                    <div class="sl-qty">${s.qty} шт</div>
                    <div class="sl-sum">${s.sum.toLocaleString('ru-RU')} ₽</div>
                </div>
            </div>`;
        });
        html += `<div class="sl-group-total">
            <span class="sl-group-total-label">Итого Акции</span>
            <span class="sl-group-total-value">${stocksTotal.toLocaleString('ru-RU')} ₽</span>
        </div></div>`;
    }
    
    body.innerHTML = html;
    overlay.style.display = 'flex';
    updateSlFooter();
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function toggleShopItem(row) {
    const checkbox = row.querySelector('.sl-checkbox');
    if (!checkbox) return;
    const sum = parseFloat(row.dataset.sum) || 0;
    const isFilled = row.classList.contains('filled');
    
    if (isFilled) {
        row.classList.remove('filled');
        checkbox.innerHTML = '';
        _slExecutedSum -= sum;
    } else {
        row.classList.add('filled');
        checkbox.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"/></svg>';
        _slExecutedSum += sum;
    }
    
    _slExecutedSum = Math.max(0, _slExecutedSum);
    updateSlFooter();
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    } else if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

function updateSlFooter() {
    const remaining = _slTotalSum - _slExecutedSum;
    const percent = _slTotalSum > 0 ? Math.round((_slExecutedSum / _slTotalSum) * 100) : 0;
    
    const elRemaining = document.getElementById('slRemaining');
    const elPlan = document.getElementById('slPlan');
    const elBar = document.getElementById('slProgressBar');
    const elLabel = document.getElementById('slProgressLabel');
    
    if (elRemaining) elRemaining.textContent = remaining.toLocaleString('ru-RU') + ' ₽';
    if (elPlan) elPlan.textContent = _slTotalSum.toLocaleString('ru-RU') + ' ₽';
    if (elBar) elBar.style.width = percent + '%';
    if (elLabel) elLabel.textContent = percent + '%';
}

function closeShoppingList() {
    const overlay = document.getElementById('shoppingListOverlay');
    if (overlay) overlay.style.display = 'none';
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function copyShoppingList() {
    const data = window._shoppingListData;
    if (!data) return;
    
    const roman = ['I','II','III','IV'];
    let text = '📋 ПЛАН ПОКУПОК:\n\n';
    
    // Собираем статусы из DOM
    const items = document.querySelectorAll('.sl-item');
    let idx = 0;
    
    if (data.bonds.length > 0) {
        data.bonds.forEach(b => {
            const filled = items[idx] && items[idx].classList.contains('filled');
            text += `${filled ? '✅' : '⚪️'} ${b.ticker} — ${b.qty} шт\n`;
            idx++;
        });
    }
    
    if (data.stocks.length > 0) {
        data.stocks.forEach(s => {
            const filled = items[idx] && items[idx].classList.contains('filled');
            text += `${filled ? '✅' : '⚪️'} ${s.ticker} — ${s.qty} шт\n`;
            idx++;
        });
    }
    
    text += `\n💰 Всего к исполнению: ${_slTotalSum.toLocaleString('ru-RU')} ₽`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            const toast = document.getElementById('slToast');
            if (toast) {
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            }
        });
    }
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}

// Переключение раскрытия эшелона
function togglePortfolioEchelon(card, event) {
    // Не раскрываем если клик был по stock-wrapper
    if (event.target.closest('.portfolio-stock-wrapper')) return;
    
    card.classList.toggle('expanded');
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Переключение информации об эшелонах
function togglePortfolioEchelonsInfo() {
    const card = document.getElementById('portfolioEchelonsExplainer');
    if (card) {
        card.classList.toggle('open');
    }
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Переключение подсказки для % в ОФЗ
function toggleYieldHelp() {
    const tooltip = document.getElementById('yieldHelpTooltip');
    if (tooltip) {
        tooltip.classList.toggle('show');
    }
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

/* --- Правильная функция для % Эшелонов --- */
function toggleEchelonPercentHelp(event) {
    // Если передали событие (клик), останавливаем его всплытие, 
    // чтобы не срабатывали другие клики на странице (если они есть)
    if (event) event.stopPropagation();

    // Мы ищем элемент именно с ID "echelonPercentTooltip", как в вашем HTML
    const tooltip = document.getElementById('echelonPercentTooltip');
    
    if (tooltip) {
        // Переключаем класс (убедитесь, что в CSS есть .echelon-percent-tooltip.show)
        tooltip.classList.toggle('show');
    } else {
        console.error('Ошибка: Не найден блок с id="echelonPercentTooltip"');
    }

    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}
    
// Открыть информацию о компании
function openCompanyInfo(ticker) {
    // Открываем на SmartLab
    window.open(`https://smart-lab.ru/q/${ticker}/`, '_blank');
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

// Синхронизация данных между старым и новым UI
function syncPortfolioDataToV2() {
    // Синхронизируем распределение из слайдера
    const slider = document.getElementById('ratioSlider');
    if (slider) {
        const bondPercent = parseInt(slider.value);
        const stockPercent = 100 - bondPercent;
        
        // Обновляем новый прогресс-бар
        const stockBar = document.getElementById('bar-stock-fill-v2');
        const bondBar = document.getElementById('bar-bond-fill-v2');
        if (stockBar) stockBar.style.width = stockPercent + '%';
        if (bondBar) bondBar.style.width = bondPercent + '%';
        
        // Обновляем лейблы
        const stockPct = document.getElementById('srl-stock-pct-v2');
        const bondPct = document.getElementById('srl-bond-pct-v2');
        if (stockPct) stockPct.textContent = stockPercent + '%';
        if (bondPct) bondPct.textContent = bondPercent + '%';
    }
    
    // Синхронизируем прогноз
    const total3y = document.getElementById('summ-total-3y');
    if (total3y) {
        // Обновляем компактный прогноз с процентами
        const totalText = total3y.textContent || total3y.innerText;
    }
    
    // Копируем список купонов в новый контейнер
    const oldCouponList = document.getElementById('couponList');
    const newCouponList = document.getElementById('couponListV2');
    if (oldCouponList && newCouponList) {
        newCouponList.innerHTML = oldCouponList.innerHTML;
    }
    
    const oldCouponTotal = document.getElementById('couponTotalHeader');
    const newCouponTotal = document.getElementById('couponTotalHeaderV2');
    if (oldCouponTotal && newCouponTotal) {
        newCouponTotal.textContent = oldCouponTotal.textContent;
    }
}


        async function shareAsPDF() {
            let btn = document.getElementById('btnShare');
            if (!btn) btn = document.querySelector('.portfolio-action-btn.primary');
            const container = document.getElementById('shareContainer');
            const brand = document.getElementById('shareBrand'); 
            const dateEl = document.getElementById('shareDate');
            if (!container) { console.error('Required elements not found for PDF'); return; }
            
            const originalText = btn ? btn.innerHTML : '';
            if (btn) { btn.innerHTML = "⏳ Генерация..."; btn.disabled = true; }
            if (brand) brand.style.display = 'block'; 
            if (dateEl) dateEl.innerText = new Date().toLocaleString();
            container.classList.add('sharing-mode');
            
            try {
                const { jsPDF } = window.jspdf;
                
                // 1. Рендерим карточку капитала
                const canvas1 = await html2canvas(container, { backgroundColor: '#0f172a', scale: 2, logging: false, useCORS: true });
                
                // 2. Рендерим список к покупке через временный DOM элемент
                const shopData = window._shoppingListData;
                const hasShopData = shopData && (shopData.bonds.length > 0 || shopData.stocks.length > 0);
                let canvas2 = null;
                
                if (hasShopData) {
                    const roman = ['I','II','III','IV'];
                    const badgeColors = {1:'#2ecc71', 2:'#3498db', 3:'#f1c40f', 4:'#e74c3c'};
                    
                    let shopHtml = `
                        <div style="padding:24px;font-family:'Inter',system-ui,sans-serif;">
                            <div style="text-align:center;font-size:16px;font-weight:800;color:#F1F5F9;margin-bottom:20px;letter-spacing:0.08em;">СПИСОК К ПОКУПКЕ</div>
                            <div style="border-top:1px solid rgba(255,255,255,0.15);margin-bottom:16px;"></div>
                    `;
                    
                    if (shopData.bonds.length > 0) {
                        let bondsTotal = 0;
                        shopHtml += `<div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Облигации (ОФЗ)</div>`;
                        shopData.bonds.forEach(b => {
                            bondsTotal += b.sum;
                            shopHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                                <span style="font-weight:700;color:#F1F5F9;font-size:13px;">${b.ticker}</span>
                                <div style="display:flex;gap:16px;align-items:center;">
                                    <span style="color:#10B981;font-weight:600;font-size:12px;">${b.qty} шт</span>
                                    <span style="color:#94A3B8;font-size:12px;min-width:80px;text-align:right;">${b.sum.toLocaleString('ru-RU')} ₽</span>
                                </div>
                            </div>`;
                        });
                        shopHtml += `<div style="display:flex;justify-content:space-between;padding:10px 0 16px;border-top:1px solid rgba(255,255,255,0.1);margin-top:4px;">
                            <span style="font-size:11px;font-weight:600;color:#64748B;">Итого ОФЗ</span>
                            <span style="font-size:13px;font-weight:700;color:#F1F5F9;">${bondsTotal.toLocaleString('ru-RU')} ₽</span>
                        </div>`;
                    }
                    
                    if (shopData.stocks.length > 0) {
                        let stocksTotal = 0;
                        shopHtml += `<div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Акции</div>`;
                        shopData.stocks.forEach(s => {
                            stocksTotal += s.sum;
                            shopHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:${badgeColors[s.echelon]}30;color:${badgeColors[s.echelon]};">${roman[s.echelon-1]}</span>
                                    <span style="font-weight:700;color:#F1F5F9;font-size:13px;">${s.ticker}</span>
                                </div>
                                <div style="display:flex;gap:16px;align-items:center;">
                                    <span style="color:#10B981;font-weight:600;font-size:12px;">${s.qty} шт</span>
                                    <span style="color:#94A3B8;font-size:12px;min-width:80px;text-align:right;">${s.sum.toLocaleString('ru-RU')} ₽</span>
                                </div>
                            </div>`;
                        });
                        shopHtml += `<div style="display:flex;justify-content:space-between;padding:10px 0 16px;border-top:1px solid rgba(255,255,255,0.1);margin-top:4px;">
                            <span style="font-size:11px;font-weight:600;color:#64748B;">Итого Акции</span>
                            <span style="font-size:13px;font-weight:700;color:#F1F5F9;">${stocksTotal.toLocaleString('ru-RU')} ₽</span>
                        </div>`;
                    }
                    
                    const grandTotal = shopData.bonds.reduce((a,b) => a + b.sum, 0) + shopData.stocks.reduce((a,s) => a + s.sum, 0);
                    shopHtml += `<div style="display:flex;justify-content:space-between;padding:14px 16px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.15);border-radius:12px;margin-top:8px;">
                        <span style="font-size:12px;font-weight:700;color:#10B981;">ВСЕГО К ПОКУПКЕ</span>
                        <span style="font-size:16px;font-weight:800;color:#10B981;">${grandTotal.toLocaleString('ru-RU')} ₽</span>
                    </div>`;
                    
                    shopHtml += `<div style="text-align:center;padding-top:20px;">
                        <div style="font-size:14px;font-weight:700;color:#D97757;">Madame Solomi'na Portfolio</div>
                        <div style="font-size:9px;color:#64748B;margin-top:4px;">${new Date().toLocaleString()}</div>
                    </div></div>`;
                    
                    // Создаем временный элемент
                    const tempDiv = document.createElement('div');
                    tempDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:${canvas1.width / 2}px;background:#0f172a;`;
                    tempDiv.innerHTML = shopHtml;
                    document.body.appendChild(tempDiv);
                    
                    canvas2 = await html2canvas(tempDiv, { backgroundColor: '#0f172a', scale: 2, logging: false });
                    document.body.removeChild(tempDiv);
                }
                
                // Собираем PDF
                const pageWidth = canvas1.width;
                let totalHeight = canvas1.height;
                if (canvas2) totalHeight += canvas2.height + 30;
                
                const doc = new jsPDF({ orientation: 'p', unit: 'px', format: [pageWidth, totalHeight] });
                doc.setFillColor(15, 23, 42);
                doc.rect(0, 0, pageWidth, totalHeight, 'F');
                
                let yPos = 0;
                doc.addImage(canvas1.toDataURL('image/png'), 'PNG', 0, yPos, canvas1.width, canvas1.height);
                yPos += canvas1.height + 30;
                
                if (canvas2) {
                    const scale2 = pageWidth / canvas2.width;
                    doc.addImage(canvas2.toDataURL('image/png'), 'PNG', 0, yPos, canvas2.width * scale2, canvas2.height * scale2);
                }

                const pdfBlob = doc.output('blob');
                const pdfFile = new File([pdfBlob], "Madame_Solomina_Portfolio.pdf", { type: "application/pdf" });

                if (navigator.share && navigator.canShare) {
                    try {
                        if (navigator.canShare({ files: [pdfFile] })) {
                            await navigator.share({ files: [pdfFile], title: 'Мой портфель', text: 'Расчёт от Madame Solomi\'na' });
                            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                            if (brand) brand.style.display = 'none'; container.classList.remove('sharing-mode'); return;
                        }
                    } catch(shareErr) { console.log('Web Share cancelled or failed:', shareErr); }
                }

                const blobUrl = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a'); a.href = blobUrl; a.download = 'Madame_Solomina_Portfolio.pdf';
                a.style.display = 'none'; document.body.appendChild(a); a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
                if (btn) { btn.innerHTML = '✅ PDF скачан'; setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000); }
            } catch(e) {
                console.error(e); alert("Не удалось создать PDF: " + e.message);
                if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            } finally { if (brand) brand.style.display = 'none'; container.classList.remove('sharing-mode'); }
        }
    function resetAndGoToTerminal() {
    // Сбрасываем поле ввода суммы
    const sumInput = document.getElementById('sumInput');
    if (sumInput) {
        sumInput.value = '';
    }
    
    // Скрываем символ рубля
    const currencySymbol = document.getElementById('currencySymbol');
    if (currencySymbol) {
        currencySymbol.style.display = 'none';
    }
    
    // Показываем серый рубль
    const currencyPlaceholder = document.getElementById('currencyPlaceholder');
    if (currencyPlaceholder) {
        currencyPlaceholder.style.display = 'block';
        currencyPlaceholder.style.setProperty('margin-left', '2px', 'important');
        currencyPlaceholder.style.setProperty('font-size', '42px', 'important');
    }
    
    // Сбрасываем стратегию на Гармонию 50/50
    document.getElementById('ratioSlider').value = 50;
    
    // Убираем selected со всех карточек
    document.querySelectorAll('.strategy-card').forEach(c => c.classList.remove('selected'));
    
    // Выбираем Гармонию
    const harmonyCard = document.querySelector('.strategy-card[data-bonds="50"]');
    if (harmonyCard) {
        harmonyCard.classList.add('selected');
    }
    
    // Сбрасываем кастомную стратегию
    resetCustomCardDisplay();
    
    // Скрываем скрытые карточки стратегий
    const hiddenCards = document.getElementById('strategyCardsHidden');
    const trigger = document.getElementById('strategyExpandTrigger');
    if (hiddenCards) hiddenCards.classList.remove('show');
    if (trigger) {
        trigger.classList.remove('open');
        const textEl = trigger.querySelector('.strategy-expand-text');
        if (textEl) textEl.textContent = 'Другие стратегии';
    }
    
    // Скрываем контент портфеля
    document.getElementById('portfolio-content').style.display = 'none';
    document.getElementById('portfolio-empty').style.display = 'flex';
    document.getElementById('portfolioActionPanel').style.display = 'none';
    
    // Скрываем 3 иконки действий
    const actionBtns = document.getElementById('portfolioActionBtns');
    if(actionBtns) actionBtns.style.display = 'none';
    
    isPortfolioCalculated = false;
    
    // Переходим на экран терминала
    showScreen('screen-app');
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}

    // Регистрация Service Worker для PWA
