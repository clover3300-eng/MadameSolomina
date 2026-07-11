function toggleStrategies() {
    const container = document.getElementById('waterfallContainer');
    const trigger = document.getElementById('ghostTrigger');
    const text = document.getElementById('ghostText');
    const customBlock = document.getElementById('customStrategyExpanded');
    
    // Переключаем классы
    const isOpen = container.classList.toggle('show');
    trigger.classList.toggle('open');
    
    // Меняем текст и вибрацию
    if(isOpen) {
        text.innerText = "ЗАКРЫТЬ";
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    } else {
        text.innerText = "ОТКРЫТЬ СТРАТЕГИИ";
        // Если закрываем список, закрываем и кастомную настройку, если она открыта
        if(customBlock) customBlock.classList.remove('show');
    }
}

// Функция выбора стратегии (обновляет главную карточку)
function selectStrategy(bondPercent, optionCard, title, subtitle) {
    // 1. Обновляем данные слайдера
    document.getElementById('ratioSlider').value = bondPercent;
    
    // 2. Визуально обновляем ГЛАВНУЮ карточку (тексты, цвета)
    updateMainCardUI(bondPercent, title, subtitle);

    // 3. Сбрасываем кастомный режим, если выбрана стандартная стратегия
    if(title !== 'Индивидуальная') {
        savedCustomBonds = null;
        document.getElementById('customStrategyExpanded').classList.remove('show');
    }

    // 4. Закрываем список с небольшой задержкой (для красоты)
    setTimeout(() => {
        toggleStrategies(); 
    }, 150);

    // 5. Запускаем draw (он теперь сам вызовет updateStrategyCardSelection внутри себя)
    draw();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Обновление UI главной карточки
function updateMainCardUI(bondPercent, title, subtitle) {
    const stockPercent = 100 - bondPercent;
    
    // Тексты
    document.getElementById('mainCardTitle').innerText = title;
    document.getElementById('mainCardSubtitle').innerText = subtitle;
    document.getElementById('mainCardBonds').innerText = `Обл. ${bondPercent}%`;
    document.getElementById('mainCardStocks').innerText = `Акц. ${stockPercent}%`;
    
    // Градиент индикатора
    const indicator = document.getElementById('mainCardIndicator');
    indicator.style.background = `linear-gradient(180deg, #5B7C99 0%, #5B7C99 ${bondPercent}%, #94A8B8 ${bondPercent}%, #94A8B8 100%)`;
}

// Логика для кастомной стратегии (адаптированная)
function toggleCustomStrategyNew(cardElement) {
    const expanded = document.getElementById('customStrategyExpanded');
    const isOpening = !expanded.classList.contains('show');
    
    if (isOpening) {
        expanded.classList.add('show');
        // Плавно скроллим к настройкам, чтобы их было видно
        expanded.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // ЭТОТ БЛОК СРАБОТАЕТ ПРИ НАЖАТИИ "ГОТОВО"
        expanded.classList.remove('show');
        
        // ВОЗВРАЩАЕМ ЭКРАН В САМЫЙ ВЕРХ (к вводу суммы)
        // Используем setTimeout, чтобы скролл начался после того, как блок начнет скрываться
        setTimeout(() => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }, 50);
    }
}



// Переопределяем функцию сохранения кастомной стратегии
saveCustomStrategy = function() {
    const bondPct = parseInt(document.getElementById('customRatioSlider').value);
    const stockPct = 100 - bondPct;
    
    savedCustomBonds = bondPct;
    savedCustomStocks = stockPct;
    
    document.getElementById('ratioSlider').value = bondPct;
    
    // 1. Убираем фокус с любых полей (важно для iOS)
    if (document.activeElement) document.activeElement.blur();
    
    // 2. Обновляем UI
    updateMainCardUI(bondPct, 'Индивидуальная', 'Ваша настройка');
    
    // 3. Сворачиваем ВНУТРЕННИЙ блок (анимация началась)
    document.getElementById('customStrategyExpanded').classList.remove('show');
    
    // 4. ПЕРВАЯ ПРОКРУТКА (Плавная)
    // Запускаем её сразу, пока страница еще длинная
    const inputBlock = document.querySelector('.input-wrapper');
    if (inputBlock) {
        inputBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 5. ЗАКРЫВАЕМ ВНЕШНИЙ СПИСОК С ЗАДЕРЖКОЙ
    // Даем 400мс, чтобы сработал первый скролл и прошла анимация внутреннего блока
    setTimeout(() => {
        const container = document.getElementById('waterfallContainer');
        const trigger = document.getElementById('ghostTrigger');
        
        if (container && container.classList.contains('show')) {
            container.classList.remove('show');
            if (trigger) trigger.classList.remove('open');
            const text = document.getElementById('ghostText');
            if (text) text.innerText = "ОТКРЫТЬ СТРАТЕГИИ";
        }

        // 6. ВТОРАЯ ПРОКРУТКА (Мгновенная - страховка)
        // Это "лечит" залипание. Если браузер заблокировал скролл,
        // эта команда принудительно вернет его наверх после изменения высоты.
        window.scrollTo({ top: 0, behavior: 'auto' });
        
    }, 400); 
    
    draw();
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}


        

        // NEW: Dropdown для тарифа комиссии
var isFeeSelected = false;

// ── ND-functions (new design) ───────────────────────────────────────────────

// Strategy list for nd waterfall
const ND_STRATEGIES = [
    { bonds: 70,  stocks: 30, title: 'Депозит',    subtitle: 'Защита капитала'  },
    { bonds: 60,  stocks: 40, title: 'Баланс',     subtitle: 'Умеренный риск'   },
    { bonds: 50,  stocks: 50, title: 'Гармония',   subtitle: 'Классический баланс' },
    { bonds: 40,  stocks: 60, title: 'Умеренная',  subtitle: 'Баланс роста'     },
    { bonds: 30,  stocks: 70, title: 'Агрессивная',subtitle: 'Макс. рост'       },
    { bonds: -1,  stocks: -1, title: 'Своя',       subtitle: 'Настроить вручную'  },
];

let _ndCurrentBonds = 50; // default Harmony

function ndBuildWF() {
    const inner = document.getElementById('ndWfInner');
    if (!inner) return;
    inner.innerHTML = '';
    const currentTitle = document.getElementById('ndStratCardVal')?.textContent?.trim() || '';
    const hasCustom = (typeof savedCustomBonds !== 'undefined' && savedCustomBonds !== null);
    // Термины «Обл.»/«Акц.» оборачиваем в .r5-term — поповер вешает js/calc-r5.js
    const obT = '<span class="r5-term ob" data-term="ob">Обл.</span>';
    const acT = '<span class="r5-term ac" data-term="ac">Акц.</span>';
    ND_STRATEGIES.forEach(s => {
        const card = document.createElement('div');
        const isCustom = s.bonds === -1;
        // «Своя» после сохранения соотношения превращается в «Индивидуальная»
        const customSaved = isCustom && hasCustom;
        const title    = customSaved ? 'Индивидуальная' : s.title;
        const subtitle = customSaved ? 'Ваша настройка'  : s.subtitle;
        const bonds    = customSaved ? savedCustomBonds   : s.bonds;
        const stocks   = customSaved ? savedCustomStocks  : s.stocks;
        const isSelected = isCustom
            ? (customSaved && currentTitle === 'Индивидуальная')
            : (s.title === currentTitle);
        card.className = 'nd-wfc'
            + (isCustom ? ' nd-wfc-custom' : '')
            + (customSaved ? ' nd-wfc-custom-saved' : '')
            + (isSelected ? ' nd-wfc-selected' : '');
        const bondGrad = (isCustom && !customSaved) ? 50 : bonds;
        const rightSide = (isCustom && !customSaved)
            ? `<div class="nd-wf-pencil">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
               </div>`
            : `<div class="nd-wfdiv"></div>
               <div class="nd-wfp"><div class="nd-wfb">${obT} ${bonds}%</div><div class="nd-wfst">${acT} ${stocks}%</div></div>`;
        card.innerHTML = `
            <div class="nd-wfl">
                <div class="nd-wfbar" style="background:linear-gradient(180deg,#5B7C99 0%,#5B7C99 ${bondGrad}%,#94A8B8 ${bondGrad}%,#94A8B8 100%)"></div>
                <div><div class="nd-wfn">${title}</div><div class="nd-wfs">${subtitle}</div></div>
            </div>
            <div class="nd-wfr">${rightSide}${isSelected ? '<div class="nd-wf-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>' : ''}</div>`;
        card.onclick = () => {
            if (isCustom) {
                ndOpenCustom();
            } else {
                ndApplyStrategy(s.bonds, s.title, s.subtitle);
            }
        };
        inner.appendChild(card);
    });
    // даём шанс calc-r5.js навесить поповеры на свежие .r5-term
    if (typeof window.r5BindTerms === 'function') { try { window.r5BindTerms(); } catch (e) {} }
}

function ndApplyStrategy(bonds, title, subtitle) {
    _ndCurrentBonds = bonds;
    // Выбор именованной стратегии сбрасывает сохранённую «Индивидуальную» —
    // строка возвращается к «Своя» с карандашом
    try { if (typeof savedCustomBonds !== 'undefined') { savedCustomBonds = null; savedCustomStocks = null; } } catch (e) {}
    const cardVal = document.getElementById('ndStratCardVal');
    if (cardVal) cardVal.textContent = title;
    updateMainCardUI(bonds, title, subtitle);
    const slider = document.getElementById('ratioSlider');
    if (slider) slider.value = bonds;
    // Закрываем waterfall, кружок возвращается к галочке
    const wf = document.getElementById('waterfallContainer');
    if (wf) wf.classList.remove('show');
    const changeBtn = document.getElementById('ndStratChangeBtn');
    if (changeBtn) changeBtn.classList.remove('open');
    const icon = document.getElementById('ndStratChangeBtnIcon');
    if (icon) icon.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
    // Перестраиваем список чтобы обновить выделение
    ndBuildWF();
    draw();
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
}

function ndOpenCustom() {
    const custom = document.getElementById('customStrategyExpanded');
    if (custom) {
        custom.classList.add('show');
        setTimeout(() => custom.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
    const wf = document.getElementById('waterfallContainer');
    if (wf) wf.classList.remove('show');
}

// Если пользовательские проценты совпали с готовой стратегией — применяем её,
// а не «Индивидуальную» (одинаковое распределение не должно жить под двумя именами)
function ndFindPreset(bondPct) {
    return ND_STRATEGIES.find(s => s.bonds === bondPct) || null;
}

function ndSaveCustom() {
    const slider = document.getElementById('customRatioSlider');
    const bondPct = slider ? parseInt(slider.value) : 50;
    const preset = ndFindPreset(bondPct);
    if (preset) {
        const custom = document.getElementById('customStrategyExpanded');
        if (custom) custom.classList.remove('show');
        ndApplyStrategy(preset.bonds, preset.title, preset.subtitle);
        return;
    }
    savedCustomBonds = bondPct;
    savedCustomStocks = 100 - bondPct;
    document.getElementById('ratioSlider').value = bondPct;
    updateMainCardUI(bondPct, 'Индивидуальная', 'Ваша настройка');
    const cardVal = document.getElementById('ndStratCardVal');
    if (cardVal) cardVal.textContent = 'Индивидуальная';
    const custom = document.getElementById('customStrategyExpanded');
    if (custom) custom.classList.remove('show');
    // перестраиваем список: «Своя» → «Индивидуальная» с долями и галочкой
    if (typeof ndBuildWF === 'function') { try { ndBuildWF(); } catch (e) {} }
    draw();
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
}

// ===== FEE DROPDOWN =====
function toggleFeeDropdown() {
    try {
        const trigger = document.getElementById('feeDropdownTrigger');
        const menu = document.getElementById('feeDropdownMenu');
        if (!menu) return;
        const isNowOpen = menu.classList.toggle('show');
        const arrow = trigger ? trigger.querySelector('.fee-dropdown-arrow') : null;
        if (arrow) arrow.style.transform = isNowOpen ? 'rotate(180deg)' : 'rotate(0deg)';
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    } catch(e) { console.error(e); }
}

function ndSelectFee(value, rateText, el) {
    brokerFee = value;
    isFeeSelected = true;
    const txt = document.getElementById('feeSelectedText');
    if (txt) { txt.textContent = rateText; txt.classList.remove('placeholder'); }
    document.querySelectorAll('.fee-dropdown-item').forEach(i => i.classList.remove('selected'));
    if (el) el.classList.add('selected');
    toggleFeeDropdown();
    ndSyncCtaState();
    draw();
}

function showCustomFeeInput() {
    const label = document.getElementById('feeCustomLabel');
    const wrap  = document.getElementById('feeCustomInpWrap');
    const chk   = document.getElementById('feeCustomChk');
    if (label) label.style.display = 'none';
    if (chk)   chk.style.display   = 'none';
    if (wrap)  { wrap.style.display = 'flex'; document.getElementById('feeCustomInp').focus(); }
    document.getElementById('feeCustomInp').onkeydown = function(e) {
        if (e.key === 'Enter') applyCustomFee();
        if (e.key === 'Escape') closeCustomFeeInput();
    };
}

function closeCustomFeeInput() {
    const label = document.getElementById('feeCustomLabel');
    const wrap  = document.getElementById('feeCustomInpWrap');
    const chk   = document.getElementById('feeCustomChk');
    if (label) label.style.display = '';
    if (chk)   chk.style.display   = '';
    if (wrap)  wrap.style.display   = 'none';
}

function applyCustomFee() {
    const raw = parseFloat(document.getElementById('feeCustomInp').value);
    if (!isNaN(raw) && raw > 0 && raw <= 100) {
        brokerFee = raw / 100;
        isFeeSelected = true;
        const label = raw < 1 ? raw.toFixed(2) + '%' : raw.toFixed(1) + '%';
        const txt = document.getElementById('feeSelectedText');
        if (txt) { txt.textContent = label; txt.classList.remove('placeholder'); }
        const trigger = document.getElementById('feeDropdownTrigger');
        if (trigger) trigger.classList.add('nd-sel-has-value');
        // Отметить «Своя» как selected
        document.querySelectorAll('.fee-dropdown-item').forEach(i => i.classList.remove('selected'));
        const row = document.getElementById('feeCustomRow');
        if (row) row.classList.add('selected');
        ndSyncCtaState();
        draw();
    }
    closeCustomFeeInput();
    toggleFeeDropdown();
}

// Закрытие по клику вне
document.addEventListener('click', function(e) {
    const wrap = document.querySelector('.fee-selector-unified');
    const menu = document.getElementById('feeDropdownMenu');
    const trigger = document.getElementById('feeDropdownTrigger');
    if (wrap && !wrap.contains(e.target)) {
        if (menu) menu.classList.remove('show');
        if (trigger) { trigger.classList.remove('open'); const arr = trigger.querySelector('.fee-dropdown-arrow'); if(arr) arr.style.transform = ''; }
    }
});
// ===== END FEE DROPDOWN (cleanup) =====

// ===== MARKET TAB QUIET STRIP =====
function syncMarketQuietStrip() {
    const map = [
        ['val-imoex',  'mqs-imoex'],
        ['val-usdrub', 'mqs-usd'],
        ['val-btc',    'mqs-btc'],
        ['val-ofz',    'mqs-ofz'],
    ];
    map.forEach(([srcId, dstId]) => {
        const src = document.getElementById(srcId);
        const dst = document.getElementById(dstId);
        if (src && dst && src.textContent && src.textContent !== '---' && src.textContent !== '—') {
            dst.textContent = src.textContent;
        }
    });
}
setInterval(syncMarketQuietStrip, 2000);
document.addEventListener('DOMContentLoaded', syncMarketQuietStrip);
// ===== END MARKET QUIET STRIP =====

// Toggle entire strategy block (called from selector card)
function ndToggleStratBlock() {
    const expand = document.getElementById('ndStratBlock');
    const card = document.getElementById('ndStratCard');
    const chevron = document.getElementById('ndStratChev');
    const wf = document.getElementById('waterfallContainer');
    const custom = document.getElementById('customStrategyExpanded');
    const wfChev = document.getElementById('ndStratChevron');
    if (!expand) return;

    const isHidden = expand.style.display === 'none' || expand.style.display === '';
    if (isHidden) {
        expand.style.display = 'block';
        ndBuildWF();
        // Сразу показываем waterfall без дополнительного клика
        requestAnimationFrame(() => {
            const wf = document.getElementById('waterfallContainer');
            if (wf) wf.classList.add('show');
        });
        if (card) card.classList.add('open');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        expand.style.display = 'none';
        if (wf) wf.classList.remove('show');
        if (custom) custom.classList.remove('show');
        if (card) card.classList.remove('open');
        if (chevron) chevron.style.transform = '';
        if (wfChev) wfChev.classList.remove('open');
    }
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
}

// Toggle waterfall within block (called from main strategy card)
function ndToggleWF() {
    const wf = document.getElementById('waterfallContainer');
    if (!wf) return;
    const isOpen = wf.classList.toggle('show');
    const btn = document.getElementById('ndStratChangeBtn');
    const icon = document.getElementById('ndStratChangeBtnIcon');
    if (btn) btn.classList.toggle('open', isOpen);
    if (icon) {
        // Открыт → шеврон вниз; закрыт → галочка
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.innerHTML = isOpen
            ? '<polyline points="6 9 12 15 18 9"/>'
            : '<polyline points="20 6 9 17 4 12"/>';
    }
    const custom = document.getElementById('customStrategyExpanded');
    if (!isOpen && custom) custom.classList.remove('show');
}

// Sum input formatting + adaptive font + ₽ opacity
function ndFormatInput(input) {
    let raw = input.value.replace(/\D/g, '').replace(/^0+/, '');
    const num = parseInt(raw) || 0;
    input.value = num > 0 ? num.toLocaleString('ru-RU').replace(/\s/g, '.') : '';
    const ruble = document.getElementById('ndRuble');
    const hero = document.getElementById('ndInputHero');
    const len = input.value.length;
    const size = len <= 6 ? 64 : len <= 9 ? 52 : len <= 11 ? 40 : len <= 15 ? 30 : 22;
    // Use setProperty with !important to override global input#sumInput CSS rules
    input.style.setProperty('font-size', size + 'px', 'important');
    input.style.setProperty('width', (len || 1) + 'ch', 'important');
    input.style.setProperty('min-width', (len || 1) + 'ch', 'important');
    if (ruble) {
        ruble.style.fontSize = size + 'px';
        ruble.style.opacity = num > 0 ? '0.9' : '0.35';
    }
    const zeroPh = document.getElementById('ndZeroPlaceholder');
    if (hero) hero.classList.toggle('has-value', num > 0);
    if (zeroPh) zeroPh.style.display = 'none';
    ndSyncCtaState();
    draw();
}

// Состояние кнопки «Рассчитать портфель»: пока сумма < 100 000 ₽ или не выбрана
// комиссия — кнопка приглушена, а подпись подсказывает недостающий шаг. Клик по
// приглушённой кнопке всё равно работает (calculateAndShowPortfolio покажет
// плашку-гид), просто теперь заранее видно, чего не хватает.
function ndSyncCtaState() {
    var bar = document.getElementById('calcCtaBar');
    if (!bar) return;
    var btn = bar.querySelector('.nd-btn-cta-g');
    if (!btn) return;
    var raw = (document.getElementById('sumInput') || {}).value || '';
    var sum = parseInt(raw.replace(/\D/g, ''), 10) || 0;
    var feeOk = (typeof isFeeSelected !== 'undefined') && isFeeSelected;
    var msg, locked = true;
    if (sum < 100000) msg = 'Введите сумму';
    else if (!feeOk)  msg = 'Выберите комиссию';
    else { msg = 'Рассчитать портфель'; locked = false; }
    btn.classList.toggle('is-locked', locked);
    var label = btn.querySelector('.cta-label');
    if (label) label.textContent = msg;
}
window.ndSyncCtaState = ndSyncCtaState;

// Enter в поле суммы = «готово»: сразу запускаем расчёт (проверки суммы и
// комиссии — внутри calculateAndShowPortfolio). Только в смешанном режиме; в
// купонном своё поле (monthlySumInput), туда Enter отсюда не попадёт.
function ndSumEnter() {
    if (document.body.classList.contains('cxm-monthly')) return;
    if (typeof calculateAndShowPortfolio === 'function') calculateAndShowPortfolio();
}
window.ndSumEnter = ndSumEnter;

function ndOnFocus() {
    const hero = document.getElementById('ndInputHero');
    if (hero) hero.classList.add('focused');
    document.body.classList.add('input-focused');
}

function ndOnBlur() {
    const hero = document.getElementById('ndInputHero');
    const input = document.getElementById('sumInput');
    const hasVal = input && input.value.length > 0;
    if (hero) {
        hero.classList.remove('focused');
        if (!hasVal) hero.classList.remove('has-value');
    }
    document.body.classList.remove('input-focused');
    if (!hasVal) {
        if (input) {
            input.style.setProperty('font-size', '64px', 'important');
            input.style.setProperty('width', '1ch', 'important');
            input.style.setProperty('min-width', '1ch', 'important');
        }
        const ruble = document.getElementById('ndRuble');
        if (ruble) { ruble.style.fontSize = '64px'; ruble.style.opacity = '0.35'; }
    }
}

// Fee selection for new design
// ndSelectFee — совместимость со state restore (теперь обновляет слайдер)
        function setTax(val, btn) {
            currentTax = val;
            document.querySelectorAll('#taxGroupV2 .tax-ui-btn').forEach(b => b.classList.remove('active')); 
            btn.classList.add('active'); 
            if (window.Telegram?.WebApp?.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.selectionChanged();
            }
            draw();
        }
        
        function setCustomTax(val, btn) {
    customTax = val;
    
    // Убираем active со всех кнопок налога
    const taxButtons = document.querySelectorAll('#marketPanelContent .tax-segment, #tax-custom-0, #tax-custom-13, #tax-custom-15');
    taxButtons.forEach(b => b.classList.remove('active'));
    
    // Добавляем active на нажатую кнопку
    btn.classList.add('active');
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    
    distributeMonthlyInvestment();

    // Если открыт «График выплат» — перерисовываем его с новым налогом
    var _chartView = document.getElementById('incomeChartView');
    if (_chartView && _chartView.style.display !== 'none' && typeof incomeShowChart === 'function') {
        incomeShowChart();
    }
}

        function shortenTicker(t) { return t.length > 7 ? t.substring(0, 7) : t; }
        function limitName(n) { return n.length > 18 ? n.substring(0, 16) + '...' : n; }
        function styledName(n) {
            const limited = limitName(n);
            return limited.replace(/(\d+)/g, '<span style="font-family:\'JetBrains Mono\',monospace">$1</span>');
        }
        function hideAllTips(event) { 
            document.querySelectorAll('.echelon-tip, .info-preview-box').forEach(el => {
                if(!el.contains(event.target) && !event.target.closest('.section-header-styled')) {
                    el.classList.remove('show')
                }
            });
            if(event && event.target.tagName !== 'INPUT') { 
                if(document.getElementById('sumInput')) document.getElementById('sumInput').blur();
                if(document.getElementById('monthlySumInput')) document.getElementById('monthlySumInput').blur();
            } 
        }

    
// NEW: Форматирование суммы с разделителями и адаптивным размером


    function adjustInputWidth(input) {
    // Создаем временный span для измерения ширины текста
    const span = document.createElement('span');
    const computedStyle = window.getComputedStyle(input);
    span.style.font = computedStyle.font;
    span.style.fontSize = computedStyle.fontSize; // Берём ТЕКУЩИЙ размер шрифта (с учётом классов)
    span.style.fontWeight = computedStyle.fontWeight;
    span.style.letterSpacing = computedStyle.letterSpacing;
    span.style.fontFamily = computedStyle.fontFamily;
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.style.whiteSpace = 'nowrap';
    span.textContent = input.value || input.placeholder;
    
    document.body.appendChild(span);
    const width = span.offsetWidth;
    document.body.removeChild(span);
    
    // Устанавливаем ширину с небольшим запасом (10px вместо 20px)
    input.style.width = Math.max(200, Math.min(width + 10, window.innerWidth * 0.85)) + 'px';
}
    

// NEW: Адаптивный размер шрифта в зависимости от длины
function adjustSumInputSize(input) {
    const length = input.value.length;
    input.classList.remove('size-large', 'size-medium', 'size-small', 'size-xsmall');
    
    const currencyGold = document.getElementById('currencySymbol');
    const currencyGray = document.getElementById('currencyPlaceholder');
    const cursor = document.getElementById('customCursor');
    
    let fontSize;
    if (length <= 7) {
        input.classList.add('size-large');
        fontSize = '42px';
    } else if (length <= 11) {
        input.classList.add('size-medium');
        fontSize = '32px';
    } else if (length <= 15) {
        input.classList.add('size-small');
        fontSize = '24px';
    } else {
        input.classList.add('size-xsmall');
        fontSize = '20px';
    }
    
    if (currencyGold) currencyGold.style.setProperty('font-size', fontSize, 'important');
    if (currencyGray) currencyGray.style.setProperty('font-size', fontSize, 'important');
    if (cursor) cursor.style.setProperty('height', fontSize, 'important');
}

// NEW: Получить числовое значение из форматированного поля
function getSumInputValue() {
    const input = document.getElementById('sumInput');
    if (!input) {
        console.log('getSumInputValue: input not found');
        return 0;
    }
    
    const value = input.value;
    console.log('getSumInputValue: raw value:', value);
    
    const cleanValue = value.replace(/\./g, '');
    console.log('getSumInputValue: clean value:', cleanValue);
    
    const result = parseInt(cleanValue) || 0;
    console.log('getSumInputValue: result:', result);
    
    return result;
}

// NEW: Скрытие меню при фокусе на вводе
                function onSumInputFocus(input) {
            document.body.classList.add('input-focused');
            
            if (input.value === "0") {
                input.value = "";
            }
        }



// NEW: Показ меню при потере фокуса
                        function onSumInputBlur(input) {
            document.body.classList.remove('input-focused');
            
            if (input.value === "") {
                const currencyGold = document.getElementById('currencySymbol');
                const currencyGray = document.getElementById('currencyPlaceholder');
                
                if(currencyGold) currencyGold.style.display = 'none';
                if(currencyGray) {
                    currencyGray.style.display = 'block';
                    currencyGray.style.setProperty('margin-left', '2px', 'important');
                    currencyGray.style.setProperty('font-size', '42px', 'important');
                }
                
                input.style.width = '150px';
            }
        }



            function formatSumInput(input) {
            let value = input.value.replace(/\D/g, '');
            value = value.replace(/^0+/, '') || '';
            const numericValue = parseInt(value) || 0;
            
            const currencyGold = document.getElementById('currencySymbol');
            const currencyGray = document.getElementById('currencyPlaceholder');
            
            if (value.length > 0) {
                input.value = numericValue.toLocaleString('ru-RU').replace(/\s/g, '.');
                
                if(currencyGold) {
                    currencyGold.style.display = 'block';
                    currencyGold.style.setProperty('margin-left', '2px', 'important');
                }
                if(currencyGray) currencyGray.style.display = 'none';
                
                adjustInputWidth(input);
            } else {
                input.value = "";
                
                if(currencyGold) currencyGold.style.display = 'none';
                if(currencyGray) {
                    currencyGray.style.display = 'block';
                    currencyGray.style.setProperty('margin-left', '2px', 'important');
                    currencyGray.style.setProperty('font-size', '42px', 'important');
                }
                
                input.style.width = '150px'; 
            }
            
            adjustSumInputSize(input);
            draw();
        }


// NEW: Сброс соотношения на 50/50
function resetRatioTo50() {
    document.getElementById('ratioSlider').value = 50;
    
    // Обновляем выделение карточек
    updateStrategyCardSelection(50);
    
    draw();
    
    // Haptic feedback
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

    



// NEW: Обновление выделения карточки при изменении ползунка
function updateStrategyCardSelection(bondPercent) {
    const cards = document.querySelectorAll('.strategy-option-card');
    // Проверяем, включен ли режим "Своя стратегия" (через наличие сохраненных данных)
    const isCustomMode = (savedCustomBonds !== null);

    cards.forEach(card => {
        const cardBondsAttr = card.getAttribute('data-bonds');
        if (!cardBondsAttr) return;

        // ЛОГИКА ДЛЯ "НАСТРОИТЬ СВОЮ"
        if (cardBondsAttr === 'custom') {
            card.style.display = 'flex'; // Всегда видна
            if (isCustomMode) card.classList.add('selected');
            else card.classList.remove('selected');
            return;
        }

        // ЛОГИКА ДЛЯ СТАНДАРТНЫХ КАРТОЧЕК
        if (isCustomMode) {
            // Если выбрана "Своя", показываем все остальные стандартные
            card.style.display = 'flex';
            card.classList.remove('selected');
        } else {
            // Если выбрана стандартная - скрываем ту, что совпадает по процентам
            if (parseInt(cardBondsAttr) === bondPercent) {
                card.style.display = 'none'; // Убираем из списка (уже наверху)
            } else {
                card.style.display = 'flex';
                card.classList.remove('selected');
            }
        }
    });
}
    

// NEW: Обновление кастомного слайдера
function updateCustomSlider(value) {
    let bondPct = parseInt(value);
    const slider = document.getElementById('customRatioSlider');
    
    // Snap через «мёртвые зоны»: 1-14% и 86-99%
    if (bondPct > 0 && bondPct < 15) {
        bondPct = bondPct < 8 ? 0 : 15;
        if (slider) slider.value = bondPct;
    }
    if (bondPct > 85 && bondPct < 100) {
        bondPct = bondPct > 92 ? 100 : 85;
        if (slider) slider.value = bondPct;
    }
    
    updateCustomSliderDisplay(bondPct);
    
    // НЕ обновляем основной слайдер до нажатия "Готово"
}

// NEW: Обновление отображения кастомного слайдера
// Функция обновления отображения (безопасная версия)
function updateCustomSliderDisplay(bondPct) {
    const stockPct = 100 - bondPct;
    
    // Обновляем большие цифры (они есть в новом дизайне)
    const bondDisplay = document.getElementById('customBondsDisplay');
    const stockDisplay = document.getElementById('customStocksDisplay');
    
    if (bondDisplay) bondDisplay.textContent = bondPct;
    if (stockDisplay) stockDisplay.textContent = stockPct;
    
    // Пытаемся обновить старые подписи (если они вдруг остались), но не ломаем код, если их нет
    const oldBondLabel = document.getElementById('customBondsPct');
    const oldStockLabel = document.getElementById('customStocksPct');
    if (oldBondLabel) oldBondLabel.textContent = bondPct;
    if (oldStockLabel) oldStockLabel.textContent = stockPct;
    
    // Обновляем индикатор точек
    updateDotsIndicator(bondPct);
}


    // NEW: Обновление индикатора точек
function updateDotsIndicator(bondPct) {
    const dots = document.querySelectorAll('.custom-dot');
    const thresholds = [0, 25, 50, 75, 100];
    
    // Находим ближайший порог
    let closestIndex = 0;
    let minDiff = Math.abs(bondPct - thresholds[0]);
    
    thresholds.forEach((threshold, index) => {
        const diff = Math.abs(bondPct - threshold);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = index;
        }
    });
    
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === closestIndex);
    });
}

    // NEW: Сохранение кастомной стратегии
function saveCustomStrategy() {
    const bondPct = parseInt(document.getElementById('customRatioSlider').value);
    const stockPct = 100 - bondPct;
    
    // Сохраняем значения
    savedCustomBonds = bondPct;
    savedCustomStocks = stockPct;
    
    // Обновляем основной слайдер
    document.getElementById('ratioSlider').value = bondPct;
    
    // Обновляем отображение кастомной карточки
    updateCustomCardDisplay(bondPct, stockPct);
    
    // Закрываем панель настройки
    const expandedBlock = document.getElementById('customStrategyExpanded');
    expandedBlock.classList.remove('show');
    
    // Оставляем карточку выбранной
    const customCard = document.getElementById('customStrategyCard');
    customCard.classList.add('selected');
    
    // Перерисовываем
    draw();
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}

    // NEW: Обновление отображения кастомной карточки после сохранения
function updateCustomCardDisplay(bondPct, stockPct) {
    const customCard = document.getElementById('customStrategyCard');
    const indicator = document.getElementById('customIndicator');
    const subtitle = document.getElementById('customSubtitle');
    const bondsText = document.getElementById('customCardBonds');
    const stocksText = document.getElementById('customCardStocks');
    
    // Добавляем класс сохранённого состояния
    customCard.classList.add('has-saved');
    
    // Устанавливаем градиент индикатора
    indicator.style.background = `linear-gradient(180deg, #5B7C99 0%, #5B7C99 ${bondPct}%, #94A8B8 ${bondPct}%, #94A8B8 100%)`;
    
    // Меняем подзаголовок
    subtitle.textContent = 'Индивидуальная';
    
    // Обновляем проценты
    bondsText.textContent = `Обл. ${bondPct}%`;
    stocksText.textContent = `Акц. ${stockPct}%`;
}

    // NEW: Сброс отображения кастомной карточки
function resetCustomCardDisplay() {
    const customCard = document.getElementById('customStrategyCard');
    const subtitle = document.getElementById('customSubtitle');
    
    // Убираем класс сохранённого состояния
    customCard.classList.remove('has-saved');
    
    // Возвращаем подзаголовок
    subtitle.textContent = 'Выберите своё соотношение';
    
    // Сбрасываем сохранённые значения
    savedCustomBonds = null;
    savedCustomStocks = null;
}

// NEW: Кнопки +/- для кастомной стратегии
function adjustCustomRatio(delta) {
    const slider = document.getElementById('customRatioSlider');
    if (!slider) return;
    
    let newValue = parseInt(slider.value) + delta;
    newValue = Math.max(0, Math.min(100, newValue));
    
    // Прыжок через «мёртвые зоны»: 1-14% и 86-99%
    // Если доля облигаций < 15% но > 0% → прыгаем на 0% или 15%
    if (newValue > 0 && newValue < 15) {
        newValue = delta > 0 ? 15 : 0; // + → 15%, − → 0%
    }
    // Если доля облигаций > 85% но < 100% → прыгаем на 85% или 100%
    if (newValue > 85 && newValue < 100) {
        newValue = delta > 0 ? 100 : 85; // + → 100%, − → 85%
    }
    
    slider.value = newValue;
    updateCustomSliderDisplay(newValue);
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}


    

// NEW: Сброс кастомной стратегии на 50/50
function resetCustomTo50() {
    document.getElementById('customRatioSlider').value = 50;
    updateCustomSliderDisplay(50);
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}
        function toggleRow(el) {
    el.classList.toggle('is-expanded');
}

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                const toast = document.getElementById('toast');
                toast.innerText = `Скопировано: ${text}`;
                toast.className = "toast show";
                setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 2000);
            });
        }
        
        // Универсальная функция для открытия внешних ссылок без предупреждения Telegram
        function openExternalLink(url) {
            if (window.Telegram?.WebApp?.openLink) {
                // Используем Telegram API - открывает без предупреждения
                window.Telegram.WebApp.openLink(url);
            } else {
                // Fallback для браузера
                window.open(url, '_blank');
            }
        }
        
        function copyTicker(e, text) {
            e.stopPropagation();
            copyToClipboard(text);
        }
        
        function openTradingView(e, ticker) {
            e.stopPropagation();
            const url = `https://ru.tradingview.com/chart/?symbol=MOEX:${ticker}`;
            openExternalLink(url);
        }

