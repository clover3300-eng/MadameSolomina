// ===== ГРАФИК ДОХОДА (тёмный список выплат в календаре купонов) =====
// Вынесен из webapp-tabs.js при декомпозиции.
// Контракт загрузки: после data.js (allScheduledPayments/bondQtyMap/monthlyIncomeBonds
// читаются в рантайме). incomeShowChart вызывается из calculator-ui.js и index.html.

// ===== INCOME CHART VIEW =====
function incomeShowChart() {
    var wrap = document.querySelector('.income-cal-wrap');
    var grid = document.getElementById('calc-results-list');
    var steppers = document.querySelector('.income-cal-steppers');
    var btn = document.querySelector('.income-cal-chart-btn');
    var footer = document.getElementById('calc-results-footer');
    var chartView = document.getElementById('incomeChartView');
    if (!chartView) return;

    // Скрываем основной вид
    if (grid) grid.style.display = 'none';
    if (steppers) steppers.style.display = 'none';
    if (btn) btn.style.display = 'none';
    if (footer) footer.style.display = 'none';

    // Рендерим тёмный список
    var darkList = document.getElementById('calc-results-list-dark');
    var darkFooter = document.getElementById('calc-results-footer-dark');
    if (darkList && darkFooter) {
        // Копируем текущий HTML из основного calc-results-list
        // но нужно перерендерить в тёмном стиле
        renderIncomeDarkList(darkList, darkFooter);
    }

    chartView.style.display = 'block';
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function incomeHideChart() {
    var grid = document.getElementById('calc-results-list');
    var steppers = document.querySelector('.income-cal-steppers');
    var btn = document.querySelector('.income-cal-chart-btn');
    var footer = document.getElementById('calc-results-footer');
    var chartView = document.getElementById('incomeChartView');

    if (chartView) chartView.style.display = 'none';
    if (grid) grid.style.display = '';
    if (steppers) steppers.style.display = '';
    if (btn) btn.style.display = '';
    if (footer) footer.style.display = '';

    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
}

function renderIncomeDarkList(container, footer) {
    var customTax = 0;
    var taxBtns = document.querySelectorAll('.tax-segment');
    taxBtns.forEach(function(btn) {
        if (btn.classList.contains('active')) {
            customTax = parseFloat(btn.dataset.tax || 0);
        }
    });

    var html = '';
    var total = 0;

    allScheduledPayments.forEach(function(payment) {
        var qty = bondQtyMap[payment.paymentTicker] || 0;
        if (!qty) {
            var parentBond = monthlyIncomeBonds.find(function(b) { return b.n === payment.displayName; });
            if (parentBond) qty = bondQtyMap[parentBond.t] || 0;
        }
        var net = (payment.staticCouponVal * qty) * (1 - customTax);
        total += net;
        // Формат даты: DD.MM из dateStr вида "MM.YY"
        var parts = payment.dateStr.split('.');
        var mm = parts[0] || '01';
        // Статичная дата купона из allScheduledPayments — берём реальный день если есть, иначе 15
        var dd = payment.couponDay ? String(payment.couponDay).padStart(2,'0') : '15';
        var dateLabel = dd + '.' + mm;
        // Убираем дефис из названия ОФЗ: "ОФЗ-26238" → "ОФЗ 26238"
        var bondName = (payment.displayName || '').replace(/^(ОФЗ)-/, '$1 ');
        var sumStr = qty > 0 ? ('+' + Math.round(net).toLocaleString('ru-RU') + ' ₽') : '—';

        var qtyBadge = qty > 0
            ? '<span style="display:inline-block;background:rgba(255,255,255,0.08);border-radius:6px;padding:2px 8px;font-family:monospace;font-size:12px;font-weight:600;color:rgba(255,255,255,0.65);">' + qty + '</span>'
            : '<span style="color:rgba(255,255,255,0.2);font-family:monospace;font-size:12px;">—</span>';
        html += '<div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);gap:9px;">'
            + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:600;color:rgba(255,255,255,0.45);letter-spacing:0.01em;flex-shrink:0;min-width:58px;">' + dateLabel + '</span>'
            + '<span style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + bondName + '</span>'
            + '<span style="flex-shrink:0;margin-left:8px;">' + qtyBadge + '</span>'
            + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:13px;font-weight:700;color:' + (qty > 0 ? '#10B981' : 'rgba(255,255,255,0.2)') + ';flex-shrink:0;min-width:72px;text-align:right;">' + sumStr + '</span>'
            + '</div>';
    });

    var hdrRow = '<div style="display:flex;align-items:center;padding:8px 14px 7px;border-bottom:1px solid rgba(255,255,255,0.08);gap:9px;">'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex-shrink:0;min-width:58px;">ДАТА</span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex:1;">ОБЛИГАЦИЯ</span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex-shrink:0;margin-left:8px;min-width:40px;text-align:right;">ШТ</span>'
        + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.35);flex-shrink:0;min-width:80px;text-align:right;">СУММА</span>'
        + '</div>';
    container.innerHTML = hdrRow + (html || '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.2);font-size:12px;">Введите количество</div>');

    if (total > 0) {
        var monthly = Math.round(total / 12);
        var investInput = document.getElementById('monthlySumInput');
        var investSum = investInput ? (parseFloat(investInput.value.replace(/\s/g,'')) || 0) : 0;
        var pct = investSum > 0 ? ((total / investSum) * 100).toFixed(1) : '0.0';
        var rowStyle = 'display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        var lblStyle = 'font-family:Inter,sans-serif;font-size:11px;color:rgba(255,255,255,0.35);';
        var valStyleGreen = 'font-family:monospace;font-size:14px;font-weight:700;color:#10B981;letter-spacing:-0.02em;';
        var valStyleNeutral = 'font-family:monospace;font-size:14px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:-0.02em;';
        footer.style.cssText = '';
        footer.innerHTML =
            '<div style="' + rowStyle + '">'
            + '<span style="' + lblStyle + '">Итого за год</span>'
            + '<span style="' + valStyleNeutral + '">' + Math.round(total).toLocaleString('ru-RU') + ' ₽</span>'
            + '</div>'
            + '<div style="' + rowStyle + '">'
            + '<span style="' + lblStyle + '">Среднемесячный доход</span>'
            + '<span style="' + valStyleGreen + '">~' + monthly.toLocaleString('ru-RU') + ' ₽</span>'
            + '</div>'
            + '<div style="' + rowStyle.replace('border-bottom:1px solid rgba(255,255,255,0.05);','') + '">'
            + '<span style="' + lblStyle + '">Доходность годовая</span>'
            + '<span style="' + valStyleGreen + '">' + pct + '%</span>'
            + '</div>';
    } else {
        footer.innerHTML = '';
    }
}
// ===== END INCOME CHART VIEW =====
