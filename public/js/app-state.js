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
        var prev = lsLoad();
        var state = {
            sum: sumEl ? sumEl.value : '',
            bondPct: sliderEl ? sliderEl.value : '50',
            brokerFee: typeof brokerFee !== 'undefined' ? brokerFee : 0.0005,
            isFeeSelected: typeof isFeeSelected !== 'undefined' ? isFeeSelected : false,
            btDate: btDate ? btDate.value : '',
            btTickers: btState ? btState.tickers : [],
            btSource: btState ? btState.source : 'calc',
            btPayoutMode: btState ? btState.payoutMode : 'full',
            btShowDeposit: btState ? btState.showDeposit : true,
            btManualCapital: (document.getElementById('btManualCapital') || {}).value || '',
            // смешанный расчёт произведён — по этому флагу calc-mode.js тихо
            // пересобирает портфель при загрузке (подвкладка «Смешанный портфель»)
            calcDone: typeof isPortfolioCalculated !== 'undefined' ? !!isPortfolioCalculated : false,
            // Дата расчёта для витрины «Продолжить» — её ставит calc-mode.js в
            // момент настоящего расчёта. lsSave пересобирает объект целиком на
            // каждый ввод, поэтому поле надо переносить, иначе оно затрётся.
            calcTs: (prev && prev.calcTs) || 0,
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

    // Слайдер + синхронизация карточки стратегии и подсветки в списке.
    // Раньше восстанавливался только slider.value — заголовок «Стратегия» и
    // галочка в списке оставались на дефолтной «Гармонии», расходясь с реально
    // выбранным соотношением (напр. slider=60, а в списке отмечена 50/50).
    // Прогоняем bondPct через тот же путь, что и обычный выбор стратегии.
    if (state.bondPct) {
        var bp = parseInt(state.bondPct, 10);
        var slider = document.getElementById('ratioSlider');
        if (slider) slider.value = state.bondPct;
        var preset = (typeof ndFindPreset === 'function') ? ndFindPreset(bp) : null;
        if (preset && typeof ndApplyStrategy === 'function') {
            ndApplyStrategy(preset.bonds, preset.title, preset.subtitle);
        } else if (!isNaN(bp) && bp >= 0 && bp <= 100) {
            // некруглое соотношение — «Индивидуальная», как после ручной настройки
            try { savedCustomBonds = bp; savedCustomStocks = 100 - bp; } catch (e) {}
            var custSlider = document.getElementById('customRatioSlider');
            if (custSlider) custSlider.value = bp;
            if (typeof updateCustomSliderDisplay === 'function') { try { updateCustomSliderDisplay(bp); } catch (e) {} }
            if (typeof updateMainCardUI === 'function') { try { updateMainCardUI(bp, 'Индивидуальная', 'Ваша настройка'); } catch (e) {} }
            var cv = document.getElementById('ndStratCardVal'); if (cv) cv.textContent = 'Индивидуальная';
            if (typeof ndBuildWF === 'function') { try { ndBuildWF(); } catch (e) {} }
            if (typeof draw === 'function') { try { draw(); } catch (e) {} }
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
        if (typeof btSyncPresetChips === 'function') btSyncPresetChips();
    }

    // Тикеры бэктеста — нормализуем и подгружаем цены на дату теста заново
    // (тип определяет btDetectType: SU/RU000 → облигация, задел под корпоративные)
    if (state.btTickers && state.btTickers.length > 0 && btState) {
        btState.tickers = state.btTickers.map(function(t) {
            return { t: t.t, type: t.type || btDetectType(t.t), price: 0, qty: 0, status: 'loading' };
        });
        btRenderTickerList();
        btState.tickers.forEach(function(t) { btFetchTickerPrice(t); });
    }

    if (state.btSource && btState) {
        btSetSource(state.btSource);
    }

    // Режим P&L теста («с выплатами / только цены») — просто флаг, без перерисовки:
    // результатов после перезагрузки ещё нет
    if ((state.btPayoutMode === 'full' || state.btPayoutMode === 'price') && btState) {
        btState.payoutMode = state.btPayoutMode;
    }

    // Показывать ли линию «Депозит» на графике сравнения (по умолчанию да)
    if (typeof state.btShowDeposit === 'boolean' && btState) {
        btState.showDeposit = state.btShowDeposit;
    }

    if (state.btManualCapital) {
        var btCapEl = document.getElementById('btManualCapital');
        if (btCapEl) btCapEl.value = state.btManualCapital;
    }

    // Тема больше НЕ восстанавливается отсюда: ей управляет авто-схема по вкладке
    // (Главная тёмная, остальные светлые) + явный выбор user_theme (core.js
    // initTheme/applyAutoThemeForTab). Форс theme==='dark' ломал бы «светлые
    // остальные» на не-Главных вкладках.

    btUpdateRunBtn();
    if (typeof ndSyncCtaState === 'function') ndSyncCtaState();
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
