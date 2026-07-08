// ===== ПЕРСИСТ СОСТОЯНИЯ ПРИЛОЖЕНИЯ (localStorage) =====
// Вынесен из webapp-tabs.js при декомпозиции.
// Сохраняет/восстанавливает: сумму и слайдер расчёта, комиссию, состояние
// бэктеста (btState), последнюю вкладку, тему.
// Контракт загрузки: ПОСЛЕ backtest.js (lsSave читает btState) и ДО route-hash.js
// (switchTab при восстановлении вкладки зовёт lsScheduleSave в рантайме).

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
            // смешанный расчёт произведён — по этому флагу calc-mode.js тихо
            // пересобирает портфель при загрузке (подвкладка «Смешанный портфель»)
            calcDone: typeof isPortfolioCalculated !== 'undefined' ? !!isPortfolioCalculated : false,
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

// Восстанавливаем состояние после полной загрузки
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(lsRestore, 300);
});
