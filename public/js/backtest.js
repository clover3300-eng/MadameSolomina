// ===== ВКЛАДКА «ТЕСТ» (бэктест портфеля) =====
// Вынесен из webapp-tabs.js при декомпозиции.
// Контракт загрузки: ПОСЛЕ webapp-tabs.js и ДО portfolios.js — тот переиспользует
// btBuildPortfolioSeries / btFetchHistorySeries / btAlignReturns / btGetBondPriceSafe /
// btGetStockPriceSafe / btGetBondNkdSafe для графиков доходности и исторических цен.
// ВАЖНО: патчи btFetchPrices/runBacktest в конце файла — это рабочие версии
// (safe-фолбэк MOEX + прогресс); порядок секций внутри файла несущий.

// ===== BACKTEST MODULE =====

const btState = {
    source: 'calc',
    tickers: [],
    bulkOpen: false,
};

// --- UI helpers ---

function btSetSource(src) {
    btState.source = src;
    document.getElementById('btSourceCalc').classList.toggle('active', src === 'calc');
    document.getElementById('btSourceManual').classList.toggle('active', src === 'manual');
    document.getElementById('btSourceCalcInfo').style.display = src === 'calc' ? 'block' : 'none';
    document.getElementById('btSourceManualBlock').style.display = src === 'manual' ? 'block' : 'none';
    btUpdateRunBtn();
}

function btToggleBulk() {
    btState.bulkOpen = !btState.bulkOpen;
    document.getElementById('btBulkBlock').style.display = btState.bulkOpen ? 'block' : 'none';
    var chev = document.getElementById('btBulkChev');
    if (chev) chev.style.transform = btState.bulkOpen ? 'rotate(180deg)' : '';
}

// Текущая дата теста (YYYY-MM-DD) или ''
function btCurrentDate() {
    var el = document.getElementById('btDateInput');
    return el && el.value ? el.value : '';
}

function btAddTicker() {
    var tickerEl = document.getElementById('btTickerInput');
    var ticker = (tickerEl.value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!ticker) { tickerEl.focus(); return; }
    if (!btState.tickers.find(function(t) { return t.t === ticker; })) {
        var type = ticker.startsWith('SU') ? 'bond' : 'stock';
        var item = { t: ticker, type: type, price: 0, qty: 0, status: 'loading' };
        btState.tickers.push(item);
        btFetchTickerPrice(item);   // async: цена на дату теста → пересчёт количества
    }
    tickerEl.value = '';
    tickerEl.focus();
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

function btApplyBulk() {
    var ta = document.getElementById('btBulkInput');
    var lines = (ta.value || '').trim().split('\n');
    var added = [];
    lines.forEach(function(line) {
        var ticker = line.trim().split(/\s+/)[0];
        if (!ticker) return;
        ticker = ticker.toUpperCase();
        if (btState.tickers.find(function(t) { return t.t === ticker; })) return;
        var type = ticker.startsWith('SU') ? 'bond' : 'stock';
        var item = { t: ticker, type: type, price: 0, qty: 0, status: 'loading' };
        btState.tickers.push(item);
        added.push(item);
    });
    ta.value = '';
    if (btState.bulkOpen) btToggleBulk();
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    added.forEach(function(item) { btFetchTickerPrice(item); });
    if (added.length > 0 && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
    lsScheduleSave();
}

function btRemoveTicker(ticker) {
    btState.tickers = btState.tickers.filter(function(t) { return t.t !== ticker; });
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

// Очистить весь список добавленных бумаг разом
function btClearTickers() {
    if (!btState.tickers.length) return;
    btState.tickers = [];
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

// Существует ли бумага на MOEX вообще (для честного сообщения об ошибке:
// «тикер не найден» вместо «нет цены»). При сетевых сбоях отвечаем true —
// не делаем вывод о несуществовании из недоступности API.
async function btTickerExists(ticker) {
    try {
        var url = MOEX_PROXY + '?path=' + encodeURIComponent(
            '/iss/securities/' + ticker + '.json?iss.meta=off&iss.only=description');
        var res = await fetch(url);
        if (!res.ok) return true;
        var data = await res.json();
        return !!(data.description && data.description.data && data.description.data.length);
    } catch (e) { return true; }
}

// Загрузка цены бумаги на дату теста (для авто-расчёта количества)
async function btFetchTickerPrice(item) {
    var dateStr = btCurrentDate();
    if (!dateStr) { item.status = 'nodate'; item.price = 0; btRenderTickerList(); return; }
    item.status = 'loading';
    item.priceDate = dateStr;
    var p = item.type === 'bond'
        ? await btGetBondPriceSafe(item.t, dateStr)
        : await btGetStockPriceSafe(item.t, dateStr);
    if (btCurrentDate() !== dateStr) return;   // дата сменилась — результат устарел
    if (p > 0) { item.price = p; item.status = 'ok'; }
    else {
        item.price = 0;
        // различаем «биржа не знает такой бумаги» и «бумага есть, но нет цены на дату»
        item.status = (await btTickerExists(item.t)) ? 'error' : 'notfound';
        if (btCurrentDate() !== dateStr) return;
    }
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    lsScheduleSave();
}

// Догрузить недостающие цены на текущую дату (перед запуском теста)
async function btEnsureManualPrices() {
    var dateStr = btCurrentDate();
    var pending = btState.tickers.filter(function(t) { return t.status !== 'ok' || t.priceDate !== dateStr; });
    await Promise.all(pending.map(function(t) { return btFetchTickerPrice(t); }));
    btRecomputeManualQty();
}

// Капитал делится поровну: каждая бумага = капитал / N, количество = floor(доля / цена)
function btRecomputeManualQty() {
    var cap = btGetManualCapital();
    var n = btState.tickers.length;
    var per = (cap > 0 && n > 0) ? cap / n : 0;
    btState.tickers.forEach(function(t) {
        t.qty = (t.status === 'ok' && t.price > 0 && per > 0) ? Math.floor(per / t.price) : 0;
    });
}

// Склонение «бумага / бумаги / бумаг»
function btPluralPapers(n) {
    var d = n % 10, dd = n % 100;
    if (d === 1 && dd !== 11) return n + ' бумага';
    if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return n + ' бумаги';
    return n + ' бумаг';
}

// Цена за штуку: десятичные для дешёвых бумаг, точки-разделители для дорогих
function btPriceStr(p) {
    if (!(p > 0)) return '—';
    return p < 100 ? (p.toFixed(2) + ' ₽') : btFmtRub(p);
}

function btRenderTickerList() {
    var container = document.getElementById('btTickerList');
    var countEl = document.getElementById('btManualCount');
    // Раздел «Состав портфеля» виден только когда есть добавленные бумаги
    var comp = document.getElementById('btManualComposition');
    if (comp) comp.style.display = btState.tickers.length ? 'block' : 'none';
    if (countEl) countEl.textContent = btState.tickers.length ? btPluralPapers(btState.tickers.length) : 'пусто';
    if (!container) return;
    if (btState.tickers.length === 0) {
        container.innerHTML = '';
        return;
    }
    var hasCap = btGetManualCapital() > 0;
    var html = '';
    btState.tickers.forEach(function(item) {
        var badge = item.type === 'bond'
            ? '<span class="bt-tr-badge bond">ОФЗ</span>'
            : '<span class="bt-tr-badge stock">Акция</span>';
        var calc;
        if (item.status === 'loading') {
            calc = '<span class="bt-tr-muted">загружаем цену…</span>';
        } else if (item.status === 'notfound') {
            calc = '<span class="bt-tr-err">тикер не найден на MOEX — проверьте написание</span>';
        } else if (item.status === 'error') {
            calc = '<span class="bt-tr-err">нет цены на эту дату</span>';
        } else if (item.status === 'nodate') {
            calc = '<span class="bt-tr-muted">укажите дату оценки</span>';
        } else if (!hasCap) {
            calc = '<span class="bt-tr-muted">' + btPriceStr(item.price) + ' за шт. · укажите капитал</span>';
        } else if (item.qty > 0) {
            calc = '<b class="bt-tr-qty">' + item.qty + ' шт.</b>'
                 + '<span class="bt-tr-sep">×</span>' + btPriceStr(item.price)
                 + '<span class="bt-tr-sep">≈</span><span class="bt-tr-sub">' + btFmtRub(item.qty * item.price) + '</span>';
        } else {
            calc = '<span class="bt-tr-muted">' + btPriceStr(item.price) + ' за шт. · мало капитала</span>';
        }
        html += '<div class="bt-tr">'
            + '<div class="bt-tr-main">'
            +   '<div class="bt-tr-top"><span class="bt-tr-tk">' + item.t + '</span>' + badge + '</div>'
            +   '<div class="bt-tr-calc">' + calc + '</div>'
            + '</div>'
            + '<button class="bt-tr-del" onclick="btRemoveTicker(\'' + item.t + '\')" aria-label="Удалить">'
            +   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
            + '</button>'
            + '</div>';
    });
    container.innerHTML = html;
}

function btUpdateRunBtn() {
    var btn = document.getElementById('btRunBtn');
    if (!btn) return;
    var dateEl = document.getElementById('btDateInput');
    var dateOk = !!(dateEl && dateEl.value);
    var portfolioOk = btState.source === 'calc'
        ? isPortfolioCalculated
        : (btState.tickers.length > 0 && btGetManualCapital() > 0);
    btn.disabled = !(dateOk && portfolioOk);
    // Подсказку под кнопкой показываем только пока тест недоступен
    var note = document.getElementById('btRunNote');
    if (note) note.classList.toggle('is-hidden', !btn.disabled);
    btSyncCalcInfo();
}

// Баннер «Из расчёта»: когда портфель уже рассчитан, переключаем его в
// состояние «готов» — прячем описание и кнопку «Перейти к расчёту»,
// чтобы не путать пользователя активной кнопкой.
function btSyncCalcInfo() {
    var box = document.getElementById('btCalcEmpty');
    if (!box) return;
    var ready = (btState.source === 'calc') && !!isPortfolioCalculated;
    box.classList.toggle('is-ready', ready);
    var icon = document.getElementById('btCalcIcon');
    if (icon) {
        icon.innerHTML = ready
            ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
    }
}

function onBtDateChange() {
    if (isPortfolioCalculated) {
        var assets = btCollectFromPortfolio();
        var total = assets.bonds.length + assets.stocks.length;
        var sumEl = document.getElementById('btCalcSummary');
        if (sumEl) sumEl.textContent = total + ' позиций: ' + assets.bonds.length + ' ОФЗ, ' + assets.stocks.length + ' акций.';
    }
    // Ручной режим: цена покупки привязана к дате — пересчитываем при её смене
    if (btState.source === 'manual' && btState.tickers.length > 0) {
        btState.tickers.forEach(function(t) { t.status = 'loading'; });
        btRenderTickerList();
        btState.tickers.forEach(function(t) { btFetchTickerPrice(t); });
    }
    btUpdateRunBtn();
}

// --- Collect assets from calculated portfolio ---

function btCollectFromPortfolio() {
    var bonds = [];
    var stocks = [];

    // Облигации — из _bondCalculationsV2
    if (window._bondCalculationsV2 && window._bondCalculationsV2.length > 0) {
        window._bondCalculationsV2.forEach(function(b) {
            if (b.qty > 0) {
                bonds.push({ t: b.t, n: b.n || b.t, p: b.price || b.p || 0, qty: b.qty });
            }
        });
    }

    // Акции — из echelons
    if (typeof echelons !== 'undefined') {
        var sum = (typeof getSumInputValue === 'function') ? getSumInputValue() : 0;
        var slider = document.getElementById('ratioSlider');
        var bondPct = slider ? parseInt(slider.value) : 50;
        var stockBudget = sum * (1 - bondPct / 100);
        var fee = (typeof brokerFee !== 'undefined') ? brokerFee : 0.0005;

        echelons.forEach(function(echelon) {
            if (!echelon.assets || echelon.assets.length === 0) return;
            var echelonBudget = stockBudget * echelon.weight;
            var perAsset = echelonBudget / echelon.assets.length;
            echelon.assets.forEach(function(asset) {
                var fullCost = asset.p * (1 + fee);
                var qty = fullCost > 0 ? Math.floor(perAsset / fullCost) : 0;
                if (qty > 0) {
                    stocks.push({ t: asset.t, n: asset.n || asset.t, p: asset.p, qty: qty });
                }
            });
        });
    }

    return { bonds: bonds, stocks: stocks };
}

// --- Main backtest run ---

async function runBacktest() {
    var dateInput = document.getElementById('btDateInput');
    if (!dateInput || !dateInput.value) return;
    var testDate = dateInput.value;

    var assets;
    if (btState.source === 'calc') {
        if (!isPortfolioCalculated) {
            showLuxuryNotification('Портфель не рассчитан', 'Перейдите в Расчёт и нажмите Рассчитать');
            return;
        }
        assets = btCollectFromPortfolio();
        if (assets.bonds.length === 0 && assets.stocks.length === 0) {
            showBtError('Портфель пуст', 'Рассчитайте портфель в вкладке Расчёт.');
            return;
        }
    } else {
        if (btState.tickers.length === 0) {
            showLuxuryNotification('Нет тикеров', 'Добавьте хотя бы один тикер');
            return;
        }
        assets = {
            bonds: btState.tickers
                .filter(function(t) { return t.type === 'bond'; })
                .map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
            stocks: btState.tickers
                .filter(function(t) { return t.type === 'stock'; })
                .map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
        };
    }

    showBtLoading(testDate);
    try {
        var results = await btFetchPrices(testDate, assets);
        renderBtResults(results, testDate);
    } catch(e) {
        console.error('Backtest error:', e);
        showBtError('Ошибка загрузки', 'Не удалось получить данные с MOEX для даты ' + btFormatDate(testDate) + '.');
    }
}

// --- MOEX price fetching ---

async function btFetchPrices(dateStr, assets) {
    var results = {
        date: dateStr,
        bonds: [],
        stocks: [],
        totalBuyPrice: 0,
        totalTestPrice: 0,
    };

    for (var i = 0; i < assets.bonds.length; i++) {
        var bond = assets.bonds[i];
        try {
            var price = await btGetBondPrice(bond.t, dateStr);
            var buyTotal = bond.p > 0 ? bond.p * bond.qty : 0;
            var testTotal = price > 0 ? price * bond.qty : 0;
            results.bonds.push({
                t: bond.t, n: bond.n, qty: bond.qty,
                buyPrice: bond.p, testPrice: price,
                buyTotal: buyTotal, testTotal: testTotal,
                pnl: buyTotal > 0 && testTotal > 0 ? testTotal - buyTotal : null,
                pnlPct: buyTotal > 0 && testTotal > 0
                    ? ((testTotal - buyTotal) / buyTotal * 100).toFixed(1) : null,
            });
            results.totalBuyPrice += buyTotal;
            results.totalTestPrice += testTotal;
        } catch(e) {
            results.bonds.push({ t: bond.t, n: bond.n, qty: bond.qty,
                buyPrice: 0, testPrice: 0, buyTotal: 0, testTotal: 0,
                pnl: null, pnlPct: null, error: true });
        }
    }

    for (var j = 0; j < assets.stocks.length; j++) {
        var stock = assets.stocks[j];
        try {
            var sPrice = await btGetStockPrice(stock.t, dateStr);
            var sBuyTotal = stock.p > 0 ? stock.p * stock.qty : 0;
            var sTestTotal = sPrice > 0 ? sPrice * stock.qty : 0;
            results.stocks.push({
                t: stock.t, n: stock.n, qty: stock.qty,
                buyPrice: stock.p, testPrice: sPrice,
                buyTotal: sBuyTotal, testTotal: sTestTotal,
                pnl: sBuyTotal > 0 && sTestTotal > 0 ? sTestTotal - sBuyTotal : null,
                pnlPct: sBuyTotal > 0 && sTestTotal > 0
                    ? ((sTestTotal - sBuyTotal) / sBuyTotal * 100).toFixed(1) : null,
            });
            results.totalBuyPrice += sBuyTotal;
            results.totalTestPrice += sTestTotal;
        } catch(e) {
            results.stocks.push({ t: stock.t, n: stock.n, qty: stock.qty,
                buyPrice: 0, testPrice: 0, buyTotal: 0, testTotal: 0,
                pnl: null, pnlPct: null, error: true });
        }
    }

    var hasBuy = results.totalBuyPrice > 0;
    var hasTest = results.totalTestPrice > 0;
    results.totalPnl = hasBuy && hasTest ? results.totalTestPrice - results.totalBuyPrice : null;
    results.totalPnlPct = hasBuy && hasTest
        ? ((results.totalTestPrice - results.totalBuyPrice) / results.totalBuyPrice * 100).toFixed(1)
        : null;
    return results;
}

async function btGetBondPrice(ticker, dateStr) {
    var fromDate = new Date(dateStr);
    fromDate.setDate(fromDate.getDate() - 7);
    var from = fromDate.toISOString().split('T')[0];

    var url = MOEX_PROXY + '?path=' + encodeURIComponent(
        '/iss/history/engines/stock/markets/bonds/securities/' + ticker +
        '.json?from=' + from + '&till=' + dateStr + '&iss.meta=off&iss.only=history&sort_order=desc&limit=1'
    );
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (!data.history || !data.history.data || data.history.data.length === 0) return 0;
    var cols = data.history.columns;
    var row = data.history.data[0];
    var closeIdx = cols.indexOf('CLOSE');
    var price = closeIdx >= 0 ? row[closeIdx] : 0;
    // Цена облигации в % от номинала → умножаем на 10 (номинал 1000 руб)
    return price > 0 ? price * 10 : 0;
}

// НКД (накопленный купонный доход) облигации на дату — колонка ACCINT в истории MOEX.
// Цена закрытия (CLOSE) приходит «чистой» (без НКД), поэтому НКД тянем отдельно.
async function btGetBondNkd(ticker, dateStr) {
    var fromDate = new Date(dateStr);
    fromDate.setDate(fromDate.getDate() - 7);
    var from = fromDate.toISOString().split('T')[0];

    var url = MOEX_PROXY + '?path=' + encodeURIComponent(
        '/iss/history/engines/stock/markets/bonds/securities/' + ticker +
        '.json?from=' + from + '&till=' + dateStr + '&iss.meta=off&iss.only=history&sort_order=desc&limit=1'
    );
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (!data.history || !data.history.data || data.history.data.length === 0) return -1;
    var cols = data.history.columns;
    var row = data.history.data[0];
    var idx = cols.indexOf('ACCINT');
    if (idx < 0) return -1;
    var nkd = row[idx];
    return (nkd != null && nkd !== '' && isFinite(nkd)) ? +nkd : -1;
}
async function btGetBondNkdSafe(ticker, dateStr) {
    try {
        return await btGetBondNkd(ticker, dateStr);
    } catch (e) {
        console.warn('[BT] Bond NKD fetch failed for ' + ticker + ':', e.message);
        return -1; // sentinel: failed
    }
}

async function btGetStockPrice(ticker, dateStr) {
    var fromDate = new Date(dateStr);
    fromDate.setDate(fromDate.getDate() - 7);
    var from = fromDate.toISOString().split('T')[0];

    var url = MOEX_PROXY + '?path=' + encodeURIComponent(
        '/iss/history/engines/stock/markets/shares/securities/' + ticker +
        '.json?from=' + from + '&till=' + dateStr + '&iss.meta=off&iss.only=history&sort_order=desc&limit=1'
    );
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (!data.history || !data.history.data || data.history.data.length === 0) return 0;
    var cols = data.history.columns;
    var row = data.history.data[0];
    var closeIdx = cols.indexOf('CLOSE');
    return closeIdx >= 0 ? (row[closeIdx] || 0) : 0;
}

// --- UI: loading / error / results ---

function showBtLoading(dateStr) {
    var el = document.getElementById('btResults');
    if (!el) return;
    el.innerHTML = '<div class="bt-loading">'
        + '<div class="bt-spinner"></div>'
        + '<div class="bt-loading-text">Загружаем цены с MOEX...</div>'
        + '<div class="bt-loading-sub">Исторические данные на ' + btFormatDate(dateStr) + '</div>'
        + '</div>';
}

function showBtError(title, msg) {
    if (typeof btExitResultsMode === 'function') btExitResultsMode();
    var el = document.getElementById('btResults');
    if (!el) return;
    el.innerHTML = '<div class="bt-error-card">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/>'
        + '<line x1="12" y1="8" x2="12" y2="12"/>'
        + '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        + '<div><div class="bt-error-title">' + title + '</div>'
        + '<div class="bt-error-msg">' + msg + '</div></div>'
        + '</div>';
}

function btFormatDate(dateStr) {
    try {
        var d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch(e) { return dateStr; }
}

function btFmtRub(v) {
    return Math.round(v).toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽';
}

// Левая карточка-«шапка» с финальными данными теста
function btRenderSummary(results, dateStr) {
    var el = document.getElementById('btResultSummary');
    if (!el) return;
    window._btLastResults = results;
    window._btLastDate = dateStr;
    var totalPnl = results.totalPnl;
    var pct = results.totalPnlPct !== null ? parseFloat(results.totalPnlPct) : null;
    var hasPnl = totalPnl !== null;
    var cls = hasPnl ? (totalPnl >= 0 ? 'pos' : 'neg') : '';
    var pnlSign = hasPnl && totalPnl >= 0 ? '+' : '';
    var pctSign = pct !== null && pct >= 0 ? '+' : '';
    var arrow = hasPnl ? (totalPnl >= 0
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>') : '';
    var positions = results.bonds.length + results.stocks.length;

    var h = '';
    h += '<div class="bt-res-sum-top">';
    h += '<span class="bt-res-sum-eyebrow">Результат теста</span>';
    h += '<span class="bt-res-date-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + btFormatDate(dateStr) + '</span>';
    h += '</div>';
    h += '<div class="bt-res-sum-label">Стоимость портфеля сейчас</div>';
    h += '<div class="bt-res-sum-valrow">';
    h += '<div class="bt-res-sum-value">' + (results.totalTestPrice > 0 ? btFmtRub(results.totalTestPrice) : '—') + '</div>';
    if (pct !== null) {
        h += '<span class="bt-res-pct-badge ' + cls + '">' + arrow + pctSign + pct + '%</span>';
    }
    h += '</div>';
    h += '<div class="bt-res-sum-stats">';
    h += '<div class="bt-res-stat"><span>Стартовая сумма</span><b>' + (results.totalBuyPrice > 0 ? btFmtRub(results.totalBuyPrice) : '—') + '</b></div>';
    h += '<div class="bt-res-stat"><span>P&L</span><b class="' + cls + '">' + (hasPnl ? pnlSign + btFmtRub(totalPnl) : '—') + '</b></div>';
    h += '</div>';
    h += '<button type="button" class="bt-imoex-btn" id="btImoexBtn" onclick="btCompareImoex()">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
        + 'Сравнить с IMOEX</button>';
    el.innerHTML = h;
    el.style.display = 'block';
}

// Переключение раскладки в режим результатов (карточка слева + таблица справа)
function btEnterResultsMode() {
    var wrap = document.querySelector('#panel-backtest .bt2-wrap');
    if (wrap) wrap.classList.add('bt-results-mode');
}
function btExitResultsMode() {
    var wrap = document.querySelector('#panel-backtest .bt2-wrap');
    if (wrap) wrap.classList.remove('bt-results-mode');
    var sum = document.getElementById('btResultSummary');
    if (sum) { sum.style.display = 'none'; sum.innerHTML = ''; }
    var res = document.getElementById('btResults');
    if (res) res.innerHTML = '';
    _btImoexOpen = false;
}

// ============================================================
// СРАВНЕНИЕ С ИНДЕКСОМ МОСБИРЖИ (IMOEX)
// ============================================================
var _btImoexOpen = false;

function btCompareImoex() {
    var btn = document.getElementById('btImoexBtn');
    var res = document.getElementById('btResults');
    if (!res) return;
    var panel = document.getElementById('btImoexPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'btImoexPanel';
        res.insertBefore(panel, res.firstChild);
    }
    // Повторное нажатие — сворачиваем
    if (_btImoexOpen) {
        _btImoexOpen = false;
        panel.style.display = 'none';
        panel.innerHTML = '';
        if (btn) btn.classList.remove('is-open');
        return;
    }
    _btImoexOpen = true;
    panel.style.display = 'block';
    if (btn) btn.classList.add('is-open');
    panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">'
        + '<div class="bt-spinner"></div><div>Загружаем индекс Московской биржи…</div></div></div>';
    btLoadImoexCompare(panel);
}

async function btLoadImoexCompare(panel) {
    var results = window._btLastResults;
    var dateStr = window._btLastDate;
    if (!results || !dateStr) {
        panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">Нет данных теста для сравнения.</div></div>';
        return;
    }
    try {
        var todayStr = new Date().toISOString().split('T')[0];
        var imoexRaw = await btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/IMOEX.json', dateStr, todayStr);
        if (!imoexRaw.length) throw new Error('NO_IMOEX');
        var pf = await btBuildPortfolioSeries(results, dateStr, todayStr);
        // Линия портфеля — настоящий ряд MOEX, нормированный к 0% на дату теста.
        var data = btAlignReturns(pf, imoexRaw);
        if (!data || data.points.length < 2) throw new Error('NO_ALIGN');
        // Число «Ваш портфель» в легенде = доходность из карточки: это тот же показатель
        // и тот же источник (прямое закрытие MOEX на сегодня), поэтому подписи совпадают.
        // Кривая может закончиться на ~0.1 пп иначе из-за forward-fill — на глаз незаметно.
        var cardPct = results.totalPnlPct !== null ? parseFloat(results.totalPnlPct) : null;
        if (cardPct !== null && !isNaN(cardPct)) {
            data.pfFinal = cardPct;
            data.delta = data.pfFinal - data.imFinal;
        }
        if (!_btImoexOpen) return; // пользователь успел закрыть
        btRenderImoexChart(panel, data, dateStr, todayStr);
    } catch(e) {
        console.warn('[BT] IMOEX compare failed:', e && e.message);
        if (!_btImoexOpen) return;
        panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">'
            + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            + '<div>Не удалось получить данные индекса IMOEX с Московской биржи. Попробуйте позже.</div></div></div>';
    }
}

// Постраничная загрузка дневной истории закрытий (MOEX ISS)
async function btFetchHistorySeries(path, fromStr, tillStr) {
    var out = [];
    var start = 0;
    for (var page = 0; page < 40; page++) {
        var url = MOEX_PROXY + '?path=' + encodeURIComponent(
            path + '?from=' + fromStr + '&till=' + tillStr +
            '&iss.meta=off&iss.only=history&sort_order=asc&start=' + start);
        var res = await fetch(url);
        if (!res.ok) break;
        var data = await res.json();
        if (!data.history || !data.history.data || !data.history.data.length) break;
        var cols = data.history.columns;
        var dIdx = cols.indexOf('TRADEDATE');
        var cIdx = cols.indexOf('CLOSE');
        var rows = data.history.data;
        for (var i = 0; i < rows.length; i++) {
            var d = rows[i][dIdx], c = rows[i][cIdx];
            if (d && c != null && c > 0) out.push({ d: d, c: c });
        }
        if (rows.length < 100) break;
        start += rows.length;
    }
    return out;
}

// Стоимость портфеля по датам = сумма (цена*кол-во) с forward-fill.
// Если для актива переданы lots ([{buyDate,qty}] — фактические докупки), кол-во на
// каждый день НАРАСТАЕТ по датам лотов, а не считается «купленным целиком» с начала
// периода текущим количеством — иначе доходность за давние даты (до реальной докупки)
// завышается/занижается на объём, которого тогда ещё не было. Без lots (напр. вкладка
// «Тест», где вся сумма покупается ОДНИМ днём fromStr) — старое поведение: qty фиксировано,
// баз. дата = когда уже торгуются ВСЕ активы (актив не мог быть куплен до начала торгов).
async function btBuildPortfolioSeries(results, fromStr, tillStr) {
    var assets = [];
    results.bonds.forEach(function(b) { assets.push({ t: b.t, qty: b.qty, lots: b.lots, market: 'bonds', mult: 10 }); });
    results.stocks.forEach(function(s) { assets.push({ t: s.t, qty: s.qty, lots: s.lots, market: 'shares', mult: 1 }); });
    var maps = [], hardDates = [], softDates = [];
    // Историю всех бумаг тянем параллельно — последовательная загрузка на большом
    // портфеле держала график сравнения десятки секунд
    var serList = await Promise.all(assets.map(function (a) {
        var path = '/iss/history/engines/stock/markets/' + a.market + '/securities/' + a.t + '.json';
        return btFetchHistorySeries(path, fromStr, tillStr).catch(function () { return []; });
    }));
    for (var i = 0; i < assets.length; i++) {
        var a = assets[i];
        var ser = serList[i];
        if (!ser.length) continue;
        // фильтр аномалий: одиночная «битая» котировка от MOEX ISS (сбойный CLOSE, задвоенный
        // борд и т.п.) иначе через forward-fill портит ВСЮ доходность до конца графика — цена
        // навсегда «залипает» на неверном уровне. Облигации внутридневно почти не двигаются
        // (порог ×2), акции могут прыгать сильнее (порог ×10) — за пределами считаем точку
        // сбойной и пропускаем её, оставляя предыдущую валидную цену через forward-fill.
        var map = {}, dates = [], prevGood = null;
        var lo = a.market === 'bonds' ? 0.5 : 0.1, hi = a.market === 'bonds' ? 2 : 10;
        ser.forEach(function(p) {
            var c = p.c * a.mult;
            if (prevGood != null && prevGood > 0) {
                var ratio = c / prevGood;
                if (ratio < lo || ratio > hi) return;
            }
            map[p.d] = c; dates.push(p.d); prevGood = c;
        });
        dates.sort();
        var lots = (a.lots && a.lots.length) ? a.lots.slice().sort(function (x, y) { return x.buyDate < y.buyDate ? -1 : x.buyDate > y.buyDate ? 1 : 0; }) : null;
        maps.push({ dates: dates, map: map, qty: a.qty, lots: lots });
        if (lots) softDates.push(dates[0]); else hardDates.push(dates[0]);
    }
    if (!maps.length) return [];
    var baseDate;
    if (hardDates.length) { hardDates.sort(); baseDate = hardDates[hardDates.length - 1]; }
    else { softDates.sort(); baseDate = softDates[0]; }
    var dateSet = {};
    maps.forEach(function(m) { m.dates.forEach(function(d) { if (d >= baseDate) dateSet[d] = 1; }); });
    var union = Object.keys(dateSet).sort();
    var series = [];
    var ptr = maps.map(function() { return 0; });
    var lastPrice = maps.map(function() { return 0; });
    var lotPtr = maps.map(function() { return 0; });
    var lotQty = maps.map(function() { return 0; });
    var lotCost = maps.map(function() { return 0; });   // накопленная себестоимость лотов (buyPrice*qty)
    var baseInv = maps.map(function() { return null; }); // активы без lots: себестоимость = стоимость на baseDate (фикс.)
    for (var u = 0; u < union.length; u++) {
        var day = union[u], total = 0, inv = 0;
        for (var mi = 0; mi < maps.length; mi++) {
            var m = maps[mi];
            while (ptr[mi] < m.dates.length && m.dates[ptr[mi]] <= day) { lastPrice[mi] = m.map[m.dates[ptr[mi]]]; ptr[mi]++; }
            var q = m.qty;
            if (m.lots) {
                while (lotPtr[mi] < m.lots.length && m.lots[lotPtr[mi]].buyDate <= day) {
                    var lot = m.lots[lotPtr[mi]];
                    lotQty[mi] += lot.qty; lotCost[mi] += (lot.buyPrice || 0) * lot.qty; lotPtr[mi]++;
                }
                q = lotQty[mi];
            } else if (baseInv[mi] == null) {
                baseInv[mi] = lastPrice[mi] * q;
            }
            total += lastPrice[mi] * q;
            inv += m.lots ? lotCost[mi] : (baseInv[mi] || 0);
        }
        if (total > 0) series.push({ d: day, c: total, inv: inv });
    }
    return series;
}

// Выравнивание двух серий к общему старту → доходность в %. Портфель: (стоимость − вложено
// на эту дату) / вложено на эту дату (q.inv — себестоимость накопленных на эту дату лотов,
// см. выше) — та же формула, что и в calcHold/calcPf, просто на каждый день. Простое
// отношение c[t]/c[0] тут не годится: докупка увеличивает c[t] возросшим кол-вом, и это
// ошибочно засчитывалось бы как доходность (напр. один портфель показывал +2000% при
// реальном −0.8%). Индекс IMOEX — по простому отношению цены (у него нет докупок).
function btAlignReturns(pfSeries, imoexSeries) {
    if (!pfSeries.length || !imoexSeries.length) return null;
    var imap = {}, idates = [];
    imoexSeries.forEach(function(p) { imap[p.d] = p.c; idates.push(p.d); });
    idates.sort();
    function imoexAt(day) {
        var lo = 0, hi = idates.length - 1, ans = -1;
        while (lo <= hi) { var mid = (lo + hi) >> 1; if (idates[mid] <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
        return ans >= 0 ? imap[idates[ans]] : null;
    }
    var base0 = null, ibase = null;
    for (var i = 0; i < pfSeries.length; i++) {
        var iv = imoexAt(pfSeries[i].d);
        if (iv != null) { base0 = pfSeries[i]; ibase = iv; break; }
    }
    if (!base0) return null;
    var points = [];
    for (var j = 0; j < pfSeries.length; j++) {
        var p = pfSeries[j];
        if (p.d < base0.d) continue;
        var iv2 = imoexAt(p.d);
        if (iv2 == null) continue;
        var pfPct = p.inv > 0 ? (p.c / p.inv - 1) * 100 : 0;
        points.push({ d: p.d, pf: pfPct, im: (iv2 / ibase - 1) * 100 });
    }
    if (points.length < 2) return null;
    var last = points[points.length - 1];
    return { points: points, pfFinal: last.pf, imFinal: last.im, delta: last.pf - last.im };
}

// SVG-график доходности портфеля vs IMOEX
function btRenderImoexChart(panel, data, fromStr, tillStr) {
    var pts = data.points;
    var step = Math.max(1, Math.ceil(pts.length / 90));
    var s = [];
    for (var i = 0; i < pts.length; i += step) s.push(pts[i]);
    if (s[s.length - 1] !== pts[pts.length - 1]) s.push(pts[pts.length - 1]);

    // Размеры адаптивно под ширину контейнера: на десктопе (full-width) —
    // широкая невысокая лента ~1:4, на мобильном — компактнее, но не «сплющенная».
    var cw = (panel && panel.clientWidth) ? Math.round(panel.clientWidth) : 900;
    cw = Math.max(280, cw - 4);
    var W = cw, H = Math.round(Math.min(260, Math.max(195, cw * 0.25)));
    var padL = 48, padR = 16, padT = 16, padB = 26;
    var allV = [];
    s.forEach(function(p) { allV.push(p.pf, p.im); });
    var minV = Math.min.apply(null, allV), maxV = Math.max.apply(null, allV);
    if (minV === maxV) { minV -= 1; maxV += 1; }
    var rng = maxV - minV; minV -= rng * 0.08; maxV += rng * 0.08;
    var n = s.length;
    function X(i) { return padL + (W - padL - padR) * (i / (n - 1)); }
    function Y(v) { return padT + (H - padT - padB) * (1 - (v - minV) / (maxV - minV)); }
    function line(key) { var d = ''; for (var i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(s[i][key]).toFixed(1) + ' '; return d.trim(); }
    function area(key) { var d = 'M' + X(0).toFixed(1) + ' ' + Y(s[0][key]).toFixed(1) + ' '; for (var i = 1; i < n; i++) d += 'L' + X(i).toFixed(1) + ' ' + Y(s[i][key]).toFixed(1) + ' '; d += 'L' + X(n - 1).toFixed(1) + ' ' + (H - padB).toFixed(1) + ' L' + X(0).toFixed(1) + ' ' + (H - padB).toFixed(1) + ' Z'; return d; }

    var zeroY = (minV <= 0 && maxV >= 0) ? Y(0) : null;
    var yTicks = [maxV, (maxV + minV) / 2, minV];
    // Цвет линии портфеля — по знаку итоговой доходности: зелёная линия у портфеля
    // в минусе сбивала с толку («обгоняем индекс, но теряем деньги»)
    var pfUp = data.pfFinal >= 0;
    var pfColor = pfUp ? '#16B56B' : '#e05252';
    var pfFill = pfUp ? 'rgba(22,181,107,0.10)' : 'rgba(224,82,82,0.10)';
    var svg = '<svg class="bt-imoex-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">';
    yTicks.forEach(function(v) {
        var y = Y(v);
        svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="rgba(133,147,166,0.16)" stroke-width="1"/>';
        svg += '<text x="' + (padL - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#94A3B8" font-family="JetBrains Mono, monospace">' + (v >= 0 ? '+' : '') + v.toFixed(0) + '%</text>';
    });
    if (zeroY !== null) svg += '<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + zeroY.toFixed(1) + '" stroke="rgba(133,147,166,0.45)" stroke-width="1" stroke-dasharray="3 3"/>';
    svg += '<path d="' + area('pf') + '" fill="' + pfFill + '"/>';
    svg += '<path d="' + line('im') + '" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<path d="' + line('pf') + '" fill="none" stroke="' + pfColor + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(s[n - 1].pf).toFixed(1) + '" r="3.5" fill="' + pfColor + '"/>';
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(s[n - 1].im).toFixed(1) + '" r="3.5" fill="#94A3B8"/>';
    svg += '<text x="' + padL + '" y="' + (H - 7) + '" font-size="10" fill="#94A3B8" font-family="Inter">' + btFormatDateShort(fromStr) + '</text>';
    svg += '<text x="' + (W - padR) + '" y="' + (H - 7) + '" text-anchor="end" font-size="10" fill="#94A3B8" font-family="Inter">' + btFormatDateShort(tillStr) + '</text>';
    svg += '</svg>';

    var beat = data.delta >= 0;
    var deltaCls = beat ? 'pos' : 'neg';
    var deltaTxt = (beat ? '+' : '') + data.delta.toFixed(1) + ' пп';
    var pfCls = data.pfFinal >= 0 ? 'pos' : 'neg', imCls = data.imFinal >= 0 ? 'pos' : 'neg';
    var html = '<div class="bt-imoex-card">';
    html += '<div class="bt-imoex-head"><div class="bt-imoex-title">Доходность vs рынок (IMOEX)</div>';
    html += '<span class="bt-imoex-delta ' + deltaCls + '">' + (beat ? 'обгоняем рынок ' : 'отстаём ') + deltaTxt + '</span></div>';
    html += '<div class="bt-imoex-sub">Рост портфеля и индекса Мосбиржи с даты теста, нормировано к 0%</div>';
    html += svg;
    html += '<div class="bt-imoex-legend">';
    html += '<span class="bt-imoex-leg"><i style="background:' + pfColor + '"></i>Ваш портфель <b class="v ' + pfCls + '">' + (data.pfFinal >= 0 ? '+' : '') + data.pfFinal.toFixed(1) + '%</b></span>';
    html += '<span class="bt-imoex-leg"><i style="background:#94A3B8"></i>IMOEX <b class="v ' + imCls + '">' + (data.imFinal >= 0 ? '+' : '') + data.imFinal.toFixed(1) + '%</b></span>';
    html += '</div></div>';
    panel.innerHTML = html;
}

function btFormatDateShort(dateStr) {
    try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }); }
    catch(e) { return dateStr; }
}

// Текущий капитал со страницы «Портфель» (#summ-invested) — он же бюджет теста
function btGetCapital() {
    var el = document.getElementById('summ-invested');
    if (el) {
        var n = parseInt(el.textContent.replace(/[^\d]/g, ''), 10);
        if (n > 0) return n;
    }
    return (typeof getSumInputValue === 'function') ? getSumInputValue() : 0;
}
// Стартовый капитал в ручном режиме (поле #btManualCapital)
function btGetManualCapital() {
    var el = document.getElementById('btManualCapital');
    if (!el) return 0;
    var n = parseInt((el.value || '').replace(/[^\d]/g, ''), 10);
    return n > 0 ? n : 0;
}
// Форматирование ввода капитала с разделителями тысяч
function btFormatCapital(el) {
    var d = (el.value || '').replace(/[^\d]/g, '');
    el.value = d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    // Капитал меняет распределение → пересчитываем количества и список
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    if (typeof lsScheduleSave === 'function') lsScheduleSave();
}

// «Покупка на стартовую сумму»: вместо переоценки текущих количеств по ценам
// прошлого считаем, что на дату теста инвестируется бюджет из расчёта в той же
// пропорции. Тогда «Стартовая сумма» ≈ сумме из расчёта, а не историческая стоимость.
function btRebuyAtBudget(results, budget) {
    if (!budget || budget <= 0) return;
    var all = results.bonds.concat(results.stocks);
    var vNow = 0;
    all.forEach(function(a) { if (a.testPrice > 0) vNow += a.testPrice * a.qty; });
    if (vNow <= 0) return;
    function rebuild(arr) {
        arr.forEach(function(a) {
            var w = (a.testPrice > 0 ? a.testPrice * a.qty : 0) / vNow;   // текущий вес
            var alloc = budget * w;
            var q = a.buyPrice > 0 ? Math.floor(alloc / a.buyPrice) : 0;
            a.qty = q;
            a.buyTotal = a.buyPrice > 0 ? a.buyPrice * q : 0;
            a.testTotal = a.testPrice > 0 ? a.testPrice * q : 0;
            a.pnl = (a.buyTotal > 0 && a.testTotal > 0) ? a.testTotal - a.buyTotal : null;
            a.pnlPct = (a.buyTotal > 0 && a.testTotal > 0) ? ((a.testTotal - a.buyTotal) / a.buyTotal * 100).toFixed(1) : null;
        });
    }
    rebuild(results.bonds);
    rebuild(results.stocks);
    var tb = 0, tt = 0;
    results.bonds.concat(results.stocks).forEach(function(a) { tb += a.buyTotal; tt += a.testTotal; });
    results.totalBuyPrice = tb;
    results.totalTestPrice = tt;
    var both = tb > 0 && tt > 0;
    results.totalPnl = both ? tt - tb : null;
    results.totalPnlPct = both ? ((tt - tb) / tb * 100).toFixed(1) : null;
}

function renderBtResults(results, dateStr) {
    var container = document.getElementById('btResults');
    if (!container) return;

    _btImoexOpen = false;   // новый прогон — закрываем прошлый график
    // Финальные данные — в левую карточку-шапку
    btRenderSummary(results, dateStr);
    var html = '';

    // Asset tables helper — лекало таблицы ОФЗ из вкладки «Ребаланс»
    function renderTable(items, title, subtitle) {
        if (!items.length) return '';
        var t = '<div class="bt-assets-card">';
        // Шапка: название + счётчик + подзаголовок | дата теста
        t += '<div class="bt-assets-header">';
        t += '<div class="bt-assets-ti"><div class="bt-assets-titlerow">';
        t += '<b class="bt-assets-title">' + title + '</b>';
        t += '<span class="bt-assets-cnt">' + items.length + '</span></div>';
        t += '<span class="bt-assets-sub">' + subtitle + '</span></div>';
        t += '<div class="bt-assets-date-pill">' + btFormatDate(dateStr) + '</div>';
        t += '</div>';
        // Шапка столбцов — 5 колонок: ранг | бумага | покупка | сейчас | P&L
        t += '<div class="bt-asset-row bt-asset-head">';
        t += '<span class="bt-col-head"></span>';
        t += '<div class="bt-col-head">Бумага</div>';
        t += '<div class="bt-col-head right">Покупка</div>';
        t += '<div class="bt-col-head right">Сейчас</div>';
        t += '<div class="bt-col-head right">P&L</div>';
        t += '</div>';
        // Строки данных
        for (var k = 0; k < items.length; k++) {
            var b = items[k];
            var rowPnlClass = b.pnl !== null ? (b.pnl > 0 ? 'pos' : b.pnl < 0 ? 'neg' : 'neutral') : 'neutral';
            var rowSign = b.pnl !== null && b.pnl >= 0 ? '+' : '';
            var buyStr = b.buyPrice > 0
                ? (b.buyPrice < 100 ? b.buyPrice.toFixed(2) + ' ₽' : btFmtRub(b.buyPrice))
                : '—';
            var priceStr = b.testPrice > 0
                ? (b.testPrice < 100 ? b.testPrice.toFixed(2) + ' ₽' : btFmtRub(b.testPrice))
                : '—';
            var pnlStr = (b.error || b.pnl === null) ? '—' : rowSign + btFmtRub(b.pnl);
            t += '<div class="bt-asset-row">';
            t += '<span class="bt-asset-rank">#' + (k + 1) + '</span>';
            t += '<div class="bt-asset-nameblock"><div class="bt-asset-name">' + (b.n || b.t) + '</div>';
            t += '<div class="bt-asset-ticker">' + b.t + ' · ' + b.qty + ' шт.</div></div>';
            t += '<div class="bt-asset-buy-price">' + buyStr + '</div>';
            t += '<div class="bt-asset-price">' + priceStr + '</div>';
            t += '<div class="bt-asset-pnl ' + rowPnlClass + '">' + pnlStr + '</div>';
            t += '</div>';
        }
        t += '</div>';
        return t;
    }

    html += renderTable(results.bonds, 'Облигации (ОФЗ)', 'Цена входа на дату теста и текущая стоимость');
    html += renderTable(results.stocks, 'Акции', 'Цена входа на дату теста и текущая стоимость');

    if (!results.bonds.length && !results.stocks.length) {
        html += '<div class="bt-error-card">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/>'
            + '<line x1="12" y1="8" x2="12" y2="12"/>'
            + '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            + '<div><div class="bt-error-title">Нет данных</div>'
            + '<div class="bt-error-msg">Портфель пуст или данные не загрузились.</div></div>'
            + '</div>';
    }

    // Предупреждение о частичных данных
    if (results._partialWarning) {
        html = '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">'
            + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            + '<div style="font-family:Inter,sans-serif;font-size:12px;color:var(--text-slate);line-height:1.5;">'
            + '<strong style="color:#B45309;">Частичные данные:</strong> ' + results._partialWarning + '. Показаны доступные результаты.'
            + '</div></div>' + html;
    }

    container.innerHTML = html;
    btEnterResultsMode();
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}



// ===== IMPROVEMENT 2: LOAD LAST PORTFOLIO IN BACKTEST =====

function btLoadLastPortfolio() {
    var state = lsLoad();
    if (!state || !state.sum || parseFloat(state.sum.replace(/\s/g, '')) < 100000) {
        showLuxuryNotification('Нет сохранённого портфеля', 'Сначала рассчитайте портфель во вкладке «Расчёт»');
        return;
    }

    // Восстанавливаем параметры и пересчитываем
    if (state.sum) {
        var sumEl = document.getElementById('sumInput');
        if (sumEl) { sumEl.value = state.sum; if (typeof ndFormatInput === 'function') ndFormatInput(sumEl); }
    }
    if (state.bondPct) {
        var slider = document.getElementById('ratioSlider');
        if (slider) { slider.value = state.bondPct; if (typeof updateSlider === 'function') updateSlider(slider); }
    }
    if (state.isFeeSelected && state.brokerFee && typeof ndSelectFee === 'function') {
        var feeText = (state.brokerFee * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
        ndSelectFee(state.brokerFee, feeText, null);
    }

    // Пересчитываем
    if (typeof draw === 'function') {
        try {
            draw();
            savePortfolio && savePortfolio();
            isPortfolioCalculated = true;
            var assets = btCollectFromPortfolio();
            var sumEl2 = document.getElementById('btCalcSummary');
            if (sumEl2) sumEl2.textContent = assets.bonds.length + assets.stocks.length + ' позиций: ' + assets.bonds.length + ' ОФЗ, ' + assets.stocks.length + ' акций.';
            btUpdateRunBtn();
            var saveTime = state.ts ? new Date(state.ts).toLocaleString('ru-RU', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
            showLuxuryNotification('Портфель восстановлен', saveTime ? 'Сохранён ' + saveTime : '');
        } catch(e) {
            showLuxuryNotification('Ошибка', 'Не удалось восстановить портфель');
        }
    }
}

// ===== IMPROVEMENT 3: MOEX API GRACEFUL FALLBACK =====

async function btGetBondPriceSafe(ticker, dateStr) {
    try {
        var price = await btGetBondPrice(ticker, dateStr);
        return price;
    } catch(e) {
        console.warn('[BT] Bond price fetch failed for ' + ticker + ':', e.message);
        return -1; // sentinel: failed
    }
}

async function btGetStockPriceSafe(ticker, dateStr) {
    try {
        var price = await btGetStockPrice(ticker, dateStr);
        return price;
    } catch(e) {
        console.warn('[BT] Stock price fetch failed for ' + ticker + ':', e.message);
        return -1; // sentinel: failed
    }
}

// Патчим btFetchPrices чтобы использовать safe версии + показывать прогресс
var _origBtFetchPrices = btFetchPrices;
btFetchPrices = async function(dateStr, assets) {
    var total = assets.bonds.length + assets.stocks.length;
    var done = 0;
    var failed = 0;

    function updateProgress() {
        var el = document.getElementById('btResults');
        if (!el) return;
        var pct = total > 0 ? Math.round((done / total) * 100) : 0;
        el.innerHTML = '<div class="bt-loading">'
            + '<div class="bt-spinner"></div>'
            + '<div class="bt-loading-text">Загружаем цены... ' + done + '/' + total + '</div>'
            + '<div style="width:200px;height:4px;background:rgba(0,0,0,0.06);border-radius:2px;margin-top:8px;overflow:hidden;">'
            + '<div style="width:' + pct + '%;height:100%;background:var(--accent-blue,#3498db);border-radius:2px;transition:width 0.3s;"></div></div>'
            + '<div class="bt-loading-sub">' + btFormatDate(dateStr) + '</div>'
            + '</div>';
    }

    updateProgress();

    var results = { date: dateStr, bonds: [], stocks: [], totalBuyPrice: 0, totalTestPrice: 0 };

    var todayStr = new Date().toISOString().split('T')[0];

    // Все бумаги грузим ПАРАЛЛЕЛЬНО (и обе цены каждой бумаги тоже): раньше
    // 20 позиций = 40 последовательных запросов и полминуты ожидания, теперь
    // время = самый медленный одиночный запрос. Порядок сохраняется через map.
    function loadOne(asset, getPrice) {
        return Promise.all([getPrice(asset.t, dateStr), getPrice(asset.t, todayStr)])
            .then(function (pair) {
                var histPrice = pair[0], nowPrice = pair[1];
                done++;
                if (histPrice === -1) { failed++; histPrice = 0; }
                // Цена «сейчас» — живое закрытие с MOEX (тот же источник, что и конец
                // графика сравнения), цена из расчёта (asset.p) — запасной вариант.
                if (nowPrice <= 0) nowPrice = asset.p > 0 ? asset.p : 0;
                var buyTotal = histPrice > 0 ? histPrice * asset.qty : 0;
                var nowTotal = nowPrice > 0 ? nowPrice * asset.qty : 0;
                updateProgress();
                return {
                    t: asset.t, n: asset.n, qty: asset.qty,
                    buyPrice: histPrice, testPrice: nowPrice,
                    buyTotal: buyTotal, testTotal: nowTotal,
                    pnl: buyTotal > 0 && nowTotal > 0 ? nowTotal - buyTotal : null,
                    pnlPct: buyTotal > 0 && nowTotal > 0 ? ((nowTotal - buyTotal) / buyTotal * 100).toFixed(1) : null,
                    error: histPrice === 0
                };
            });
    }
    var loaded = await Promise.all([
        Promise.all(assets.bonds.map(function (b) { return loadOne(b, btGetBondPriceSafe); })),
        Promise.all(assets.stocks.map(function (s) { return loadOne(s, btGetStockPriceSafe); }))
    ]);
    results.bonds = loaded[0];
    results.stocks = loaded[1];
    results.bonds.concat(results.stocks).forEach(function (a) {
        results.totalBuyPrice += a.buyTotal;
        results.totalTestPrice += a.testTotal;
    });

    if (failed > 0 && failed === total) {
        throw new Error('MOEX_UNAVAILABLE');
    }

    var hasBuy = results.totalBuyPrice > 0;
    var hasTest = results.totalTestPrice > 0;
    results.totalPnl = hasBuy && hasTest ? results.totalTestPrice - results.totalBuyPrice : null;
    results.totalPnlPct = hasBuy && hasTest ? ((results.totalTestPrice - results.totalBuyPrice) / results.totalBuyPrice * 100).toFixed(1) : null;
    results.failedCount = failed;
    return results;
};

// Обновлённый runBacktest с graceful fallback
var _origRunBacktest = runBacktest;
runBacktest = async function() {
    var dateInput = document.getElementById('btDateInput');
    if (!dateInput || !dateInput.value) return;
    var testDate = dateInput.value;

    var assets;
    if (btState.source === 'calc') {
        if (!isPortfolioCalculated) {
            showLuxuryNotification('Портфель не рассчитан', 'Перейдите в Расчёт и нажмите Рассчитать');
            return;
        }
        assets = btCollectFromPortfolio();
        if (assets.bonds.length === 0 && assets.stocks.length === 0) {
            showBtError('Портфель пуст', 'Рассчитайте портфель во вкладке Расчёт.');
            return;
        }
    } else {
        if (btState.tickers.length === 0) {
            showLuxuryNotification('Нет бумаг', 'Добавьте хотя бы одну бумагу');
            return;
        }
        if (btGetManualCapital() <= 0) {
            showLuxuryNotification('Нет капитала', 'Укажите стартовый капитал');
            return;
        }
        // Цены на дату теста → количество (капитал поровну между бумагами)
        showBtLoading(testDate);
        await btEnsureManualPrices();
        var picked = btState.tickers.filter(function(t) { return t.qty > 0; });
        if (picked.length === 0) {
            showBtError('Не удалось рассчитать', 'Нет цен на выбранную дату или капитала не хватает даже на одну бумагу.');
            return;
        }
        assets = {
            bonds: picked.filter(function(t) { return t.type === 'bond'; }).map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
            stocks: picked.filter(function(t) { return t.type === 'stock'; }).map(function(t) { return { t: t.t, n: t.t, p: 0, qty: t.qty }; }),
        };
    }

    try {
        var results = await btFetchPrices(testDate, assets);
        if (results.failedCount > 0 && results.failedCount < results.bonds.length + results.stocks.length) {
            // Частичные данные — показываем предупреждение в результатах
            results._partialWarning = results.failedCount + ' из ' + (results.bonds.length + results.stocks.length) + ' тикеров не загрузились';
        }
        // Calc-режим: «Стартовая сумма» = капитал из расчёта, перекупаем в тех же
        // пропорциях. Ручной режим уже посчитал количество (капитал поровну) — не трогаем.
        if (btState.source === 'calc') {
            var _budget = btGetCapital();
            if (_budget > 0) btRebuyAtBudget(results, _budget);
        }
        renderBtResults(results, testDate);
        // Сразу показываем сравнение с IMOEX (renderBtResults сбросил _btImoexOpen)
        if (typeof btCompareImoex === 'function') btCompareImoex();
        lsSave();
    } catch(e) {
        if (e.message === 'MOEX_UNAVAILABLE') {
            showBtError(
                'MOEX API недоступен',
                'Не удалось получить ни одной цены с биржи. Проверьте подключение к интернету или попробуйте позже. Исторические данные доступны через Yandex Cloud прокси.'
            );
        } else {
            showBtError('Ошибка загрузки', 'Не удалось получить данные с MOEX для даты ' + btFormatDate(testDate) + '.');
        }
    }
};

// ===== Инициализация вкладки «Тест»: дата по умолчанию (год назад) + первичный рендер =====
document.addEventListener('DOMContentLoaded', function() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    const dateEl = document.getElementById('btDateInput');
    if (dateEl) {
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() - 1);
        dateEl.max = maxDate.toISOString().split('T')[0];
        dateEl.min = '2010-01-01';
        dateEl.value = d.toISOString().split('T')[0];
    }
    btRenderTickerList();
    btUpdateRunBtn();
});
