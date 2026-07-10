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
    payoutMode: 'full',    // 'full' — P&L с купонами/дивидендами, 'price' — только цены
    benchOverride: null,   // индекс, выбранный вручную пилюлей (сбрасывается новым прогоном)
    resultsTab: 'overview',// активная подвкладка результатов: overview | assets | pays
    showDeposit: true,     // показывать линию «Депозит (RUSFAR)» на графике сравнения
};

// --- UI helpers ---

function btSetSource(src) {
    btState.source = src;
    document.getElementById('btSourceCalc').classList.toggle('active', src === 'calc');
    document.getElementById('btSourceManual').classList.toggle('active', src === 'manual');
    document.getElementById('btSourceCalcInfo').style.display = src === 'calc' ? 'block' : 'none';
    document.getElementById('btSourceManualBlock').style.display = src === 'manual' ? 'block' : 'none';
    btSyncFromCalcBtn();
    btUpdateRunBtn();
    btMarkResultsStale();
}

// Кнопка «Подставить из расчёта» в ручном режиме видна только когда портфель
// действительно рассчитан (иначе подставлять нечего)
function btSyncFromCalcBtn() {
    var btn = document.getElementById('btManualFromCalc');
    if (!btn) return;
    var show = btState.source === 'manual' && typeof isPortfolioCalculated !== 'undefined' && isPortfolioCalculated;
    btn.style.display = show ? 'flex' : 'none';
}

// Подставить состав из расчёта в ручной список: тикеры ОФЗ и акций из
// рассчитанного портфеля добавляются к уже набранным (без дублей), капитал —
// из расчёта, если поле ещё пустое. Дальше пользователь правит список руками.
function btAddFromCalc() {
    if (typeof isPortfolioCalculated === 'undefined' || !isPortfolioCalculated) return;
    var a = btCollectFromPortfolio();
    var items = a.bonds.map(function(b) { return { t: b.t, type: 'bond' }; })
        .concat(a.stocks.map(function(s) { return { t: s.t, type: 'stock' }; }));
    // Капитал из расчёта — только если пользователь ещё не ввёл свой
    if (btGetManualCapital() <= 0) {
        var cap = btGetCapital();
        var capEl = document.getElementById('btManualCapital');
        if (cap > 0 && capEl) capEl.value = String(cap).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    var added = [];
    items.forEach(function(it) {
        var ticker = btCleanTicker(it.t);
        if (!ticker || btState.tickers.find(function(t) { return t.t === ticker; })) return;
        var item = { t: ticker, type: it.type || btDetectType(ticker), price: 0, qty: 0, status: 'loading' };
        btState.tickers.push(item);
        added.push(item);
    });
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    if (added.length) btMarkResultsStale();
    added.forEach(function(item) { btFetchTickerPrice(item); });
    if (added.length && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
    lsScheduleSave();
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

// Локальная дата → YYYY-MM-DD (toISOString отдаёт UTC и до 03:00 МСК сдвигает день назад)
function btLocalISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Тикер из пользовательского ввода: только A-Z / 0-9 / дефис (формат secid MOEX).
// Всё остальное режем — тикер попадает в innerHTML и onclick, произвольные
// символы там — вектор self-XSS (см. конвенцию jsArg в остальных модулях).
function btCleanTicker(raw) {
    return (raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
}

// Тип бумаги по тикеру/ISIN. Задел под корпоративные облигации:
// SU… — ОФЗ, RU000… — облигационный ISIN (корпоративные/биржевые бонды торгуются
// на MOEX по ISIN как secid), всё остальное — акция. Цены и купоны для corp-бондов
// пойдут теми же bonds-эндпоинтами, номинал берётся из FACEVALUE (см. btGetBondPrice).
function btDetectType(ticker) {
    var t = String(ticker || '');
    if (t.indexOf('SU') === 0) return 'bond';
    if (/^RU000/.test(t)) return 'bond';
    return 'stock';
}

function btAddTicker() {
    var tickerEl = document.getElementById('btTickerInput');
    var ticker = btCleanTicker(tickerEl.value);
    if (!ticker) { tickerEl.focus(); return; }
    if (!btState.tickers.find(function(t) { return t.t === ticker; })) {
        var item = { t: ticker, type: btDetectType(ticker), price: 0, qty: 0, status: 'loading' };
        btState.tickers.push(item);
        btFetchTickerPrice(item);   // async: цена на дату теста → пересчёт количества
    }
    tickerEl.value = '';
    tickerEl.focus();
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    btMarkResultsStale();
    lsScheduleSave();
}

function btApplyBulk() {
    var ta = document.getElementById('btBulkInput');
    var lines = (ta.value || '').trim().split('\n');
    var added = [];
    lines.forEach(function(line) {
        var ticker = btCleanTicker(line.trim().split(/\s+/)[0]);
        if (!ticker) return;
        if (btState.tickers.find(function(t) { return t.t === ticker; })) return;
        var item = { t: ticker, type: btDetectType(ticker), price: 0, qty: 0, status: 'loading' };
        btState.tickers.push(item);
        added.push(item);
    });
    ta.value = '';
    if (btState.bulkOpen) btToggleBulk();
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    if (added.length > 0) btMarkResultsStale();
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
    btMarkResultsStale();
    lsScheduleSave();
}

// Очистить весь список добавленных бумаг разом
function btClearTickers() {
    if (!btState.tickers.length) return;
    btState.tickers = [];
    btRecomputeManualQty();
    btRenderTickerList();
    btUpdateRunBtn();
    btMarkResultsStale();
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
        if (window._btFxBonds && window._btFxBonds[item.t]) {
            // валютная/замещающая облигация: цена есть, но номинал в USD/CNY —
            // без курса на дату рублёвая оценка невозможна (задел, см. btGetBondPrice)
            item.status = 'fx';
            item.fxUnit = window._btFxBonds[item.t];
        } else {
            // различаем «биржа не знает такой бумаги» и «бумага есть, но нет цены на дату»
            item.status = (await btTickerExists(item.t)) ? 'error' : 'notfound';
            if (btCurrentDate() !== dateStr) return;
        }
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
            ? '<span class="bt-tr-badge bond">' + (item.t.indexOf('SU') === 0 ? 'ОФЗ' : 'Облигация') + '</span>'
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
        } else if (item.status === 'fx') {
            calc = '<span class="bt-tr-muted">валютная облигация (номинал в ' + (item.fxUnit || 'валюте') + ') — поддержка в планах</span>';
        } else if (item.qty > 0) {
            calc = '<b class="bt-tr-qty">' + btQtyStr(item.qty) + ' шт.</b>'
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
    btSyncFromCalcBtn();
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

// Быстрые периоды теста: N лет назад от сегодня
function btSetPreset(years) {
    var el = document.getElementById('btDateInput');
    if (!el) return;
    var d = new Date();
    d.setFullYear(d.getFullYear() - years);
    el.value = btLocalISO(d);
    onBtDateChange();
    if (typeof lsScheduleSave === 'function') lsScheduleSave();
}

// Подсветка чипа-пресета, когда дата совпадает с «N лет назад» день в день
function btSyncPresetChips() {
    var cur = btCurrentDate();
    document.querySelectorAll('.bt-preset').forEach(function(b) {
        var d = new Date();
        d.setFullYear(d.getFullYear() - parseInt(b.dataset.years, 10));
        b.classList.toggle('active', btLocalISO(d) === cur);
    });
}

function onBtDateChange() {
    btSyncPresetChips();
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
    btMarkResultsStale();
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
    var from = btLocalISO(fromDate);

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
    // Цена облигации приходит в % от номинала. Номинал — из той же строки истории
    // (FACEVALUE): задел под корпоративные облигации с номиналом ≠ 1000 ₽.
    // Нет колонки/значения — классические 1000 ₽ (все ОФЗ-ПД), т.е. прежний ×10.
    var fvIdx = cols.indexOf('FACEVALUE');
    var fv = (fvIdx >= 0 && row[fvIdx] > 0) ? row[fvIdx] : 1000;
    // Задел под валютные/замещающие облигации: у них номинал в USD/CNY/EUR
    // (колонка FACEUNIT), рублёвая стоимость = % × номинал × курс на дату.
    // Курсов у нас пока нет — честно не считаем (иначе ГазКЗ-34Д оценилась бы
    // в ~80 раз дешевле), тикер помечаем: UI объяснит причину человеку.
    var fuIdx = cols.indexOf('FACEUNIT');
    var fu = fuIdx >= 0 ? row[fuIdx] : null;
    if (fu && fu !== 'SUR' && fu !== 'RUB') {
        (window._btFxBonds = window._btFxBonds || {})[ticker] = fu;
        return 0;
    }
    return price > 0 ? price * (fv / 100) : 0;
}

// НКД (накопленный купонный доход) облигации на дату — колонка ACCINT в истории MOEX.
// Цена закрытия (CLOSE) приходит «чистой» (без НКД), поэтому НКД тянем отдельно.
async function btGetBondNkd(ticker, dateStr) {
    var fromDate = new Date(dateStr);
    fromDate.setDate(fromDate.getDate() - 7);
    var from = btLocalISO(fromDate);

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
    var from = btLocalISO(fromDate);

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

// --- Выплаты за период: дивиденды (акции) и купоны (облигации) ---

// История дивидендов бумаги: дата отсечки + выплата на одну акцию
async function btFetchDividends(ticker) {
    var url = MOEX_PROXY + '?path=' + encodeURIComponent(
        '/iss/securities/' + ticker + '/dividends.json?iss.meta=off');
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var blk = data.dividends;
    if (!blk || !blk.data) return [];
    var cols = blk.columns;
    var dIdx = cols.indexOf('registryclosedate'), vIdx = cols.indexOf('value');
    var cIdx = cols.indexOf('currencyid');
    var out = [];
    blk.data.forEach(function(r) {
        var d = r[dIdx], v = r[vIdx];
        // валютные дивиденды (исторические USD-выплаты Polymetal, QIWI и т.п.)
        // не суммируем как рубли — курса на дату у нас нет
        var cur = cIdx >= 0 ? r[cIdx] : null;
        if (cur && cur !== 'RUB' && cur !== 'SUR') return;
        if (d && v > 0) out.push({ d: d, v: +v });
    });
    return out;
}

// Купонное расписание облигации (bondization MOEX ISS, постранично):
// дата купона + выплата в рублях на одну бумагу. Будущие купоны без
// определённой ставки приходят с value=null — отфильтруются по v > 0.
async function btFetchCoupons(ticker) {
    var out = [], start = 0;
    for (var page = 0; page < 12; page++) {
        var url = MOEX_PROXY + '?path=' + encodeURIComponent(
            '/iss/statistics/engines/stock/markets/bonds/bondization/' + ticker +
            '.json?iss.meta=off&iss.only=coupons&limit=100&start=' + start);
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var blk = data.coupons;
        if (!blk || !blk.data || !blk.data.length) break;
        var cols = blk.columns;
        var dIdx = cols.indexOf('coupondate');
        var vrIdx = cols.indexOf('value_rub'), vIdx = cols.indexOf('value');
        blk.data.forEach(function(r) {
            var d = r[dIdx];
            var v = (vrIdx >= 0 && r[vrIdx] != null) ? +r[vrIdx] : (vIdx >= 0 && r[vIdx] != null ? +r[vIdx] : 0);
            if (d && v > 0) out.push({ d: d, v: v });
        });
        if (blk.data.length < 100) break;
        start += blk.data.length;
    }
    return out;
}

// Амортизации облигации (тот же bondization): возврат номинала — частями
// (ОФЗ-АД, корпоративные) или целиком при погашении (data_source='maturity').
// Это возврат ТЕЛА, а не купон: идёт в стоимость/P&L, а не в «Выплаты».
async function btFetchAmortizations(ticker) {
    var out = [], start = 0;
    for (var page = 0; page < 12; page++) {
        var url = MOEX_PROXY + '?path=' + encodeURIComponent(
            '/iss/statistics/engines/stock/markets/bonds/bondization/' + ticker +
            '.json?iss.meta=off&iss.only=amortizations&limit=100&start=' + start);
        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var blk = data.amortizations;
        if (!blk || !blk.data || !blk.data.length) break;
        var cols = blk.columns;
        var dIdx = cols.indexOf('amortdate');
        var vrIdx = cols.indexOf('value_rub'), vIdx = cols.indexOf('value');
        var sIdx = cols.indexOf('data_source');
        blk.data.forEach(function(r) {
            var d = r[dIdx];
            var v = (vrIdx >= 0 && r[vrIdx] != null) ? +r[vrIdx] : (vIdx >= 0 && r[vIdx] != null ? +r[vIdx] : 0);
            if (d && v > 0) out.push({ d: d, v: v, fin: sIdx >= 0 && r[sIdx] === 'maturity' });
        });
        if (blk.data.length < 100) break;
        start += blk.data.length;
    }
    return out;
}

// null = не удалось загрузить, [] = амортизаций за период не было
async function btFetchAmortsSafe(ticker, fromStr, tillStr) {
    try {
        return btFilterPayments(await btFetchAmortizations(ticker), fromStr, tillStr);
    } catch(e) {
        console.warn('[BT] Amortizations fetch failed for ' + ticker + ':', e.message);
        return null;
    }
}

// Выплаты внутри окна теста: строго ПОСЛЕ даты покупки (отсечка/купон в день
// покупки достаются прежнему владельцу) и по сегодня включительно
function btFilterPayments(list, fromStr, tillStr) {
    return list.filter(function(p) { return p.d > fromStr && p.d <= tillStr; })
        .sort(function(a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
}

// null = не удалось загрузить (неизвестно), [] = выплат за период не было
async function btFetchPaymentsSafe(ticker, isBond, fromStr, tillStr) {
    try {
        var list = isBond ? await btFetchCoupons(ticker) : await btFetchDividends(ticker);
        return btFilterPayments(list, fromStr, tillStr);
    } catch(e) {
        console.warn('[BT] Payments fetch failed for ' + ticker + ':', e.message);
        return null;
    }
}

// --- Сплиты акций ---
// Сплит внутри окна теста ломает «лобовое» сравнение цен: Транснефть 1→100
// (фев 2024) без поправки даёт −99%, обратный сплит ВТБ 5000→1 (июл 2024) —
// +400 000%. Справочник сплитов MOEX ISS отдаёт ВСЕ сплиты одним запросом:
// tradedate, secid, before, after (before старых акций → after новых).

// Кэш-промис на страницу: параллельные loadOne делят один запрос
var _btSplitsPromise = null;
function btFetchAllSplits() {
    if (!_btSplitsPromise) {
        _btSplitsPromise = (async function() {
            var url = MOEX_PROXY + '?path=' + encodeURIComponent(
                '/iss/statistics/engines/stock/splits.json?iss.meta=off');
            var res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            var blk = data.splits;
            if (!blk || !blk.data) return [];
            var cols = blk.columns;
            var dIdx = cols.indexOf('tradedate'), tIdx = cols.indexOf('secid');
            var bIdx = cols.indexOf('before'), aIdx = cols.indexOf('after');
            return blk.data.map(function(r) {
                return { d: r[dIdx], t: r[tIdx], before: +r[bIdx], after: +r[aIdx] };
            }).filter(function(s) { return s.d && s.t && s.before > 0 && s.after > 0; });
        })().catch(function(e) {
            console.warn('[BT] Splits fetch failed:', e && e.message);
            _btSplitsPromise = null;   // не кэшируем ошибку — следующий прогон попробует снова
            return null;               // null = неизвестно (без поправки, как раньше)
        });
    }
    return _btSplitsPromise;
}

// Сплиты бумаги строго ПОСЛЕ даты покупки (цена на дату покупки уже в «своих»
// единицах) и по сегодня. f = after/before: множитель количества.
function btSplitsFor(all, ticker, fromStr, tillStr) {
    if (!all) return [];
    return all.filter(function(s) { return s.t === ticker && s.d > fromStr && s.d <= tillStr; })
        .map(function(s) { return { d: s.d, before: s.before, after: s.after, f: s.after / s.before }; })
        .sort(function(a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
}

// Количество бумаг на дату d: стартовое qty × произведение прошедших к d сплитов.
// Выплата «на 1 шт.» объявляется в акциях СВОЕГО времени — умножать надо именно
// на количество в тот день (PLZL: 1301.75 ₽ до сплита 1:10, 73 ₽ после).
function btQtyAtDate(a, d) {
    var q = a.qty;
    if (a.splits) a.splits.forEach(function(s) { if (s.d <= d) q *= s.f; });
    return q;
}

// Человекочитаемое количество: тонкие НЕРАЗРЫВНЫЕ пробелы тысяч («26 373 626»,
// точки-разделители заняты рублями), дробное (обратный сплит) — до 2 знаков
function btQtyStr(q) {
    var r = Math.round(q * 100) / 100;
    var i = Math.floor(r);
    var s = i.toLocaleString('ru-RU').replace(/\s/g, ' ');
    var frac = Math.round((r - i) * 100);
    if (frac > 0) s += ',' + String(frac).padStart(2, '0').replace(/0$/, '');
    return s;
}

// --- Бенчмарки сравнения ---
// Ценовой портфель сравниваем с ценовым индексом, портфель с выплатами — с индексом
// полной доходности; чисто облигационный состав — с гособлигационной парой RGBI.
var BT_BENCH = {
    IMOEX:  { family: 'stock', kind: 'price', title: 'Индекс Мосбиржи',                        note: 'акции · только цены' },
    MCFTR:  { family: 'stock', kind: 'tr',    title: 'Индекс Мосбиржи полной доходности',      note: 'акции · с дивидендами' },
    RGBI:   { family: 'bond',  kind: 'price', title: 'Индекс гособлигаций RGBI',               note: 'ОФЗ · только цены' },
    RGBITR: { family: 'bond',  kind: 'tr',    title: 'Индекс гособлигаций полной доходности',  note: 'ОФЗ · с купонами' },
};

// Авто-выбор: семейство по составу (только облигации → RGBI-пара), вид по режиму P&L
function btAutoBenchmark(results) {
    var family = (results && results.bonds.length && !results.stocks.length) ? 'bond' : 'stock';
    var kind = btState.payoutMode === 'price' ? 'price' : 'tr';
    var found = null;
    Object.keys(BT_BENCH).forEach(function(k) {
        if (BT_BENCH[k].family === family && BT_BENCH[k].kind === kind) found = k;
    });
    return found || 'IMOEX';
}

function btCurrentBenchmark() {
    return (btState.benchOverride && BT_BENCH[btState.benchOverride])
        ? btState.benchOverride
        : btAutoBenchmark(window._btLastResults);
}

// Серия портфеля с накопленными выплатами: к стоимости бумаг на каждый день
// прибавляются купоны/дивиденды, полученные К этой дате (без реинвестирования).
// Именно эту серию честно сравнивать с индексами полной доходности.
function btApplyPayoutsToSeries(series, results) {
    var events = [];
    results.bonds.concat(results.stocks).forEach(function(a) {
        if (!a.payments || !(a.qty > 0)) return;
        a.payments.forEach(function(p) { events.push({ d: p.d, amt: p.v * btQtyAtDate(a, p.d) }); });
    });
    if (!events.length) return series;
    events.sort(function(x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
    var out = [], ei = 0, cum = 0;
    for (var i = 0; i < series.length; i++) {
        var pt = series[i];
        while (ei < events.length && events[ei].d <= pt.d) { cum += events[ei].amt; ei++; }
        out.push({ d: pt.d, c: pt.c + cum, inv: pt.inv });
    }
    return out;
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

// Экранирование текста для вставки в innerHTML (подсказки — свои строки, но
// пусть будет честно на случай будущих правок)
function btEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Видимая иконка-подсказка «?». Текст пояснения — в data-tip; всплывающий
// пузырёк рисуется в <body> (btShowHelpTip), поэтому не обрезается overflow:hidden
// у героя и не зависит от стек-контекста карточки.
function btHelpIcon(text) {
    return '<span class="btx-help" data-tip="' + btEsc(text) + '" tabindex="0" role="button" aria-label="Пояснение">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        + '</span>';
}

// Единый всплывающий пузырёк подсказки на весь модуль (в <body>, fixed):
// показывается при наведении/фокусе на любую .btx-help, сам клампится в экран.
var _btHelpTipEl = null;
function btShowHelpTip(icon) {
    var text = icon.getAttribute('data-tip');
    if (!text) return;
    if (!_btHelpTipEl) {
        _btHelpTipEl = document.createElement('div');
        _btHelpTipEl.className = 'bt-help-tip';
        document.body.appendChild(_btHelpTipEl);
    }
    var tip = _btHelpTipEl;
    tip.textContent = text;   // textContent — без разбора HTML, перевод строк через CSS pre-line
    tip.style.maxWidth = Math.min(300, window.innerWidth - 24) + 'px';
    tip.style.display = 'block';
    tip.style.visibility = 'hidden';
    var r = icon.getBoundingClientRect();
    var tr = tip.getBoundingClientRect();
    var left = r.left + r.width / 2 - tr.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tr.width - 12));
    var top = r.bottom + 8;
    if (top + tr.height > window.innerHeight - 8 && r.top - 8 - tr.height > 8) top = r.top - 8 - tr.height;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.visibility = 'visible';
}
function btHideHelpTip() { if (_btHelpTipEl) _btHelpTipEl.style.display = 'none'; }
document.addEventListener('mouseover', function(e) {
    var ic = e.target.closest && e.target.closest('.btx-help');
    if (ic) btShowHelpTip(ic);
});
document.addEventListener('mouseout', function(e) {
    var ic = e.target.closest && e.target.closest('.btx-help');
    if (ic && !(e.relatedTarget && ic.contains(e.relatedTarget))) btHideHelpTip();
});
document.addEventListener('focusin', function(e) {
    var ic = e.target.closest && e.target.closest('.btx-help');
    if (ic) btShowHelpTip(ic);
});
document.addEventListener('focusout', function(e) {
    var ic = e.target.closest && e.target.closest('.btx-help');
    if (ic) btHideHelpTip();
});
window.addEventListener('scroll', btHideHelpTip, true);

// Полноширинный тёмный герой результатов (rbx-стиль, как «Ребаланс»/«Админка»):
// идентити слева, KPI-числа справа, переключатель режима P&L в хвосте.
// P&L и процент зависят от btState.payoutMode: 'full' — с выплатами, 'price' — цены.
function btRenderHero(results, dateStr) {
    var el = document.getElementById('btHero');
    if (!el) return;
    window._btLastResults = results;
    window._btLastDate = dateStr;
    var full = btState.payoutMode !== 'price';
    var totalPnl = full ? results.totalPnlFull : results.totalPnl;
    var pctRaw = full ? results.totalPnlPctFull : results.totalPnlPct;
    var pct = (pctRaw !== null && pctRaw !== undefined) ? parseFloat(pctRaw) : null;
    var hasPnl = totalPnl !== null && totalPnl !== undefined;
    var cls = hasPnl ? (totalPnl >= 0 ? 'pos' : 'neg') : '';
    var positions = results.bonds.concat(results.stocks).filter(function(a) { return a.qty > 0; }).length;
    var payStr = results._payUnknown ? '—'
        : (results.totalPayouts > 0 ? '+' + btFmtRub(results.totalPayouts) : '0 ₽');
    var dd = results._maxDD;

    // help — необязательная иконка-подсказка в подпись; label в одну строку
    function kpi(label, val, valCls, help) {
        return '<div class="btx-kpi"><span>' + label + (help || '') + '</span><b class="' + (valCls || '') + '">' + val + '</b></div>';
    }

    var ddTip = 'Самое глубокое падение стоимости бумаг от локального пика до дна внутри периода — «сколько вы могли потерять в худший момент, если бы продали на самом дне». Считается по дневным ценам, без учёта выплат. На графике сравнения шкала другая (доходность от даты старта), поэтому это число обычно «страшнее» самой нижней точки графика — и это нормально.';

    var h = '';
    h += '<div class="btx-fx"><i class="g1"></i><b class="mesh"></b></div>';
    h += '<div class="btx-id">';
    h += '<div class="btx-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>';
    h += '<div class="btx-t"><div class="btx-title">Результат теста</div>';
    h += '<div class="btx-sub">' + btFormatDate(dateStr) + ' → сегодня · ' + btPluralPapers(positions) + '</div></div>';
    h += '</div>';
    // KPI сгруппированы в три смысловых блока (с тонкими разделителями), чтобы
    // не сливались в кашу: «Деньги» (вложено → стало → выплаты) | «Итог»
    // (P&L → доходность) | «Риск» (просадка).
    h += '<div class="btx-kpis">';
    h += '<div class="btx-grp">';
    h += kpi('Стартовая сумма', results.totalBuyPrice > 0 ? btFmtRub(results.totalBuyPrice) : '—');
    h += kpi('Бумаги сейчас', results.totalTestPrice > 0 ? btFmtRub(results.totalTestPrice) : '—');
    h += kpi('Купоны и дивиденды', payStr, (!results._payUnknown && results.totalPayouts > 0) ? 'pos' : '');
    h += '</div>';
    h += '<span class="btx-sep"></span>';
    h += '<div class="btx-grp">';
    h += kpi('P&L', hasPnl ? (totalPnl >= 0 ? '+' : '') + btFmtRub(totalPnl) : '—', cls);
    h += kpi('Доходность', pct !== null ? (pct >= 0 ? '+' : '') + pct + '%' : '—', cls);
    h += '</div>';
    h += '<span class="btx-sep"></span>';
    h += '<div class="btx-grp">';
    // id="btDDVal" нужен: btLoadChart дописывает просадку асинхронно после расчёта серии
    h += '<div class="btx-kpi"><span>Макс. просадка' + btHelpIcon(ddTip) + '</span><b id="btDDVal" class="dd">' + (dd != null ? dd.toFixed(1) + '%' : '—') + '</b></div>';
    h += '</div>';
    h += '</div>';
    h += '<div class="btx-mode">';
    h += '<div class="bt-res-mode">';
    h += '<button type="button" class="bt-res-mode-btn' + (full ? ' active' : '') + '" onclick="btSetPayoutMode(\'full\')" title="P&L с купонами и дивидендами за период">С выплатами</button>';
    h += '<button type="button" class="bt-res-mode-btn' + (!full ? ' active' : '') + '" onclick="btSetPayoutMode(\'price\')" title="P&L только по изменению цен">Только цены</button>';
    h += '</div>';
    h += '<div class="btx-mode-note">' + (full ? 'с купонами и дивидендами' : 'только изменение цен') + '</div>';
    h += '</div>';
    el.innerHTML = h;
    el.style.display = 'flex';
}

// Переключение «С выплатами / Только цены»: пересобирает героя, таблицы бумаг
// и график (линия портфеля и авто-индекс зависят от режима; серии в кэше,
// повторных запросов цен нет). Таблицы выплат от режима не зависят.
function btSetPayoutMode(mode) {
    if (btState.payoutMode === mode) return;
    btState.payoutMode = mode;
    var r = window._btLastResults;
    if (r) {
        btRenderHero(r, window._btLastDate);
        btRenderAssetTables(r, window._btLastDate);
        btLoadChart();
    }
    if (typeof lsScheduleSave === 'function') lsScheduleSave();
}

// Переключение раскладки в режим результатов (карточка слева + таблица справа)
function btEnterResultsMode() {
    var wrap = document.querySelector('#panel-backtest .bt2-wrap');
    if (wrap) wrap.classList.add('bt-results-mode');
}
function btExitResultsMode() {
    var wrap = document.querySelector('#panel-backtest .bt2-wrap');
    if (wrap) wrap.classList.remove('bt-results-mode');
    var hero = document.getElementById('btHero');
    if (hero) { hero.style.display = 'none'; hero.innerHTML = ''; }
    var res = document.getElementById('btResults');
    if (res) res.innerHTML = '';
    window._btPfSeries = null;
}

// ============================================================
// ГРАФИК ПРОТИВ ИНДЕКСА (IMOEX / MCFTR / RGBI / RGBITR)
// Живёт в подвкладке «Обзор», грузится сразу после прогона.
// ============================================================
var _btChartSeq = 0;                       // защита от гонки при кликах по пилюлям
var _btIdxCache = { key: '', map: {} };    // серии индексов текущего прогона

// Переключатель линии «Депозит» в легенде: перерисовываем график из кэша
// (серии уже посчитаны — ни сети, ни спиннера), состояние персистим
function btToggleDeposit() {
    btState.showDeposit = !btState.showDeposit;
    var c = window._btLastChart;
    var panel = document.getElementById('btImoexPanel');
    if (c && panel) btRenderIdxChart(panel, c.data, c.dateStr, c.todayStr, c.bench);
    else btLoadChart();
    if (typeof lsScheduleSave === 'function') lsScheduleSave();
}

// Пилюля индекса: ручной выбор действует до следующего прогона
function btPickBenchmark(secid) {
    if (!BT_BENCH[secid] || btCurrentBenchmark() === secid) return;
    btState.benchOverride = secid;
    btLoadChart();
}

async function btLoadChart() {
    var panel = document.getElementById('btImoexPanel');
    var results = window._btLastResults;
    var dateStr = window._btLastDate;
    if (!panel || !results || !dateStr) return;
    var bench = btCurrentBenchmark();
    var seq = ++_btChartSeq;
    panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">'
        + '<div class="bt-spinner"></div><div>Загружаем ' + bench + ' с Московской биржи…</div></div></div>';
    try {
        var todayStr = btLocalISO(new Date());
        if (_btIdxCache.key !== dateStr) _btIdxCache = { key: dateStr, map: {} };
        // Ценовая серия портфеля — одна на прогон (кэш); из неё же макс. просадка,
        // поэтому строим её ПЕРВОЙ: KPI появится, даже если индекс не загрузится
        if (!window._btPfSeries || window._btPfSeriesKey !== dateStr) {
            var pfRaw = await btBuildPortfolioSeries(results, dateStr, todayStr);
            if (seq !== _btChartSeq) return;
            window._btPfSeries = pfRaw;
            window._btPfSeriesKey = dateStr;
            if (pfRaw.length > 1) {
                results._maxDD = btMaxDrawdown(pfRaw);
                var ddEl = document.getElementById('btDDVal');
                if (ddEl) ddEl.textContent = results._maxDD.toFixed(1) + '%';
            }
        }
        var pf = window._btPfSeries;
        if (!pf || !pf.length) throw new Error('NO_PF');
        // В режиме «с выплатами» линия портфеля включает накопленные купоны/дивиденды —
        // иначе против индексов полной доходности сравнение снова было бы неравным
        if (btState.payoutMode !== 'price') pf = btApplyPayoutsToSeries(pf, results);
        if (!_btIdxCache.map[bench]) {
            var idxRaw = await btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/' + bench + '.json', dateStr, todayStr);
            if (seq !== _btChartSeq) return;
            _btIdxCache.map[bench] = idxRaw;
        }
        var idx = _btIdxCache.map[bench];
        if (!idx.length) throw new Error('NO_IDX');
        var data = btAlignReturns(pf, idx);
        if (!data || data.points.length < 2) throw new Error('NO_ALIGN');
        // Число «Ваш портфель» в легенде = P&L-процент героя в ТЕКУЩЕМ режиме — один
        // показатель, один источник (прямое закрытие MOEX + те же выплаты).
        // Кривая может закончиться на ~0.1 пп иначе из-за forward-fill — на глаз незаметно.
        var cardPctRaw = btState.payoutMode === 'price' ? results.totalPnlPct : results.totalPnlPctFull;
        var cardPct = (cardPctRaw !== null && cardPctRaw !== undefined) ? parseFloat(cardPctRaw) : null;
        if (cardPct !== null && !isNaN(cardPct)) {
            data.pfFinal = cardPct;
            data.delta = data.pfFinal - data.imFinal;
        }
        // Третья линия «Депозит» — накопленная RUSFAR; не пилюля, а фон-ориентир.
        // Ключ с подчёркиванием, чтобы не пересекаться с пилюлями BT_BENCH.
        // При сбое загрузки график живёт без неё.
        if (!_btIdxCache.map._RUSFAR) {
            _btIdxCache.map._RUSFAR = await btFetchHistorySeries('/iss/history/engines/stock/markets/index/securities/RUSFAR.json', dateStr, todayStr);
            if (seq !== _btChartSeq) return;
        }
        btAttachDeposit(data, _btIdxCache.map._RUSFAR);
        if (seq !== _btChartSeq) return;
        // кэш входов графика: переключатель депозита перерисовывает без спиннера/сети
        window._btLastChart = { data: data, dateStr: dateStr, todayStr: todayStr, bench: bench };
        btRenderIdxChart(panel, data, dateStr, todayStr, bench);
    } catch(e) {
        console.warn('[BT] index compare failed:', e && e.message);
        if (seq !== _btChartSeq) return;
        panel.innerHTML = '<div class="bt-imoex-card"><div class="bt-imoex-state">'
            + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            + '<div>Не удалось получить данные индекса ' + bench + ' с Московской биржи. Попробуйте позже.</div></div></div>';
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
    // Бумаги с нулевым количеством (например, не торговались на дату теста) в серию
    // не берём: вклад их всё равно нулевой, а первая дата их торгов иначе сдвигает
    // базовую дату ВСЕГО графика (baseDate = максимум из стартов «жёстких» активов).
    // mult=10 — задел: для корп. облигаций с номиналом ≠1000 линию графика при их
    // появлении надо будет строить от FACEVALUE (см. btGetBondPrice).
    // splits/splitK приходят из строк результатов «Теста»; вызовы из portfolios.js
    // их не передают — там поведение прежнее (поправка = 1).
    results.bonds.forEach(function(b) { if (b.qty > 0 || (b.lots && b.lots.length)) assets.push({ t: b.t, qty: b.qty, lots: b.lots, market: 'bonds', mult: 10, splits: b.splits, splitK: b.splitK }); });
    results.stocks.forEach(function(s) { if (s.qty > 0 || (s.lots && s.lots.length)) assets.push({ t: s.t, qty: s.qty, lots: s.lots, market: 'shares', mult: 1, splits: s.splits, splitK: s.splitK }); });
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
        // Приведение цен к сегодняшним акциям: цену дня d делим на произведение
        // сплит-множителей БУДУЩИХ относительно d сплитов. Серия становится
        // непрерывной (без этого 100×-обвал в день сплита застревал в фильтре
        // аномалий ниже и цена «замерзала» досплитовой до конца графика).
        var spl = (a.splits && a.splits.length) ? a.splits : null;
        var unitAdj = function(d) {
            if (!spl) return 1;
            var m = 1;
            for (var si = 0; si < spl.length; si++) if (spl[si].d > d) m *= spl[si].f;
            return m;
        };
        // фильтр аномалий: одиночная «битая» котировка от MOEX ISS (сбойный CLOSE, задвоенный
        // борд и т.п.) иначе через forward-fill портит ВСЮ доходность до конца графика — цена
        // навсегда «залипает» на неверном уровне. Облигации внутридневно почти не двигаются
        // (порог ×2), акции могут прыгать сильнее (порог ×10) — за пределами считаем точку
        // сбойной и пропускаем её, оставляя предыдущую валидную цену через forward-fill.
        var map = {}, dates = [], prevGood = null;
        var lo = a.market === 'bonds' ? 0.5 : 0.1, hi = a.market === 'bonds' ? 2 : 10;
        ser.forEach(function(p) {
            var c = p.c * a.mult / unitAdj(p.d);
            if (prevGood != null && prevGood > 0) {
                var ratio = c / prevGood;
                if (ratio < lo || ratio > hi) return;
            }
            map[p.d] = c; dates.push(p.d); prevGood = c;
        });
        dates.sort();
        var lots = (a.lots && a.lots.length) ? a.lots.slice().sort(function (x, y) { return x.buyDate < y.buyDate ? -1 : x.buyDate > y.buyDate ? 1 : 0; }) : null;
        // qty — в сегодняшних акциях (цены выше уже приведены к ним же)
        maps.push({ dates: dates, map: map, qty: a.qty * (a.splitK || 1), lots: lots });
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

// Максимальная просадка серии стоимости, % (от пика до дна, значение ≤ 0)
function btMaxDrawdown(series) {
    var peak = 0, dd = 0;
    for (var i = 0; i < series.length; i++) {
        var c = series[i].c;
        if (c > peak) peak = c;
        else if (peak > 0) {
            var d = (c / peak - 1) * 100;
            if (d < dd) dd = d;
        }
    }
    return dd;
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

// «Депозит»: капитализация дневной ставки RUSFAR (обеспеченный денежный рынок
// Мосбиржи, ходит вплотную к ключевой) по календарным дням — честный ориентир
// «а лучше ли вклада?». rates: [{d, c: ставка % годовых}] с индексного эндпоинта.
// Пишет p.dep (накопленный % с базовой даты) в каждую точку графика.
function btAttachDeposit(data, rates) {
    if (!data || !rates || rates.length < 2) return;
    var pts = data.points, ri = 0, rate = null, factor = 1, prevD = null;
    for (var i = 0; i < pts.length; i++) {
        var d = pts[i].d;
        while (ri < rates.length && rates[ri].d <= d) { rate = rates[ri].c; ri++; }
        if (prevD !== null && rate !== null) {
            var days = Math.round((new Date(d) - new Date(prevD)) / 86400000);
            if (days > 0) factor *= Math.pow(1 + rate / 100, days / 365);
        }
        pts[i].dep = (factor - 1) * 100;
        prevD = d;
    }
    data.hasDep = true;
    data.depFinal = pts[pts.length - 1].dep;
}

// SVG-график доходности портфеля против выбранного индекса
function btRenderIdxChart(panel, data, fromStr, tillStr, bench) {
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
    // депозит есть в данных, но пользователь может скрыть его переключателем в легенде
    var depAvailable = !!data.hasDep && typeof s[0].dep === 'number';
    var hasDep = depAvailable && btState.showDeposit;
    var depColor = '#E3A008';
    var allV = [];
    s.forEach(function(p) { allV.push(p.pf, p.im); if (hasDep) allV.push(p.dep); });
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
    // Пунктир депозита — под основными линиями, чтобы не спорил с ними
    if (hasDep) svg += '<path d="' + line('dep') + '" fill="none" stroke="' + depColor + '" stroke-width="1.8" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<path d="' + line('im') + '" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<path d="' + line('pf') + '" fill="none" stroke="' + pfColor + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(s[n - 1].pf).toFixed(1) + '" r="3.5" fill="' + pfColor + '"/>';
    svg += '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(s[n - 1].im).toFixed(1) + '" r="3.5" fill="#94A3B8"/>';
    // Левая метка оси — РЕАЛЬНОЕ начало общей серии (если какая-то бумага начала
    // торговаться позже даты теста, сравнение честно стартует с этого дня)
    svg += '<text x="' + padL + '" y="' + (H - 7) + '" font-size="10" fill="#94A3B8" font-family="Inter">' + btFormatDateShort(s[0].d) + '</text>';
    svg += '<text x="' + (W - padR) + '" y="' + (H - 7) + '" text-anchor="end" font-size="10" fill="#94A3B8" font-family="Inter">' + btFormatDateShort(tillStr) + '</text>';
    svg += '</svg>';

    var b = BT_BENCH[bench] || BT_BENCH.IMOEX;
    var full = btState.payoutMode !== 'price';
    var beat = data.delta >= 0;
    var deltaCls = beat ? 'pos' : 'neg';
    var deltaTxt = (beat ? 'обгоняем индекс +' : 'отстаём от индекса −')
        + Math.abs(data.delta).toFixed(1) + ' пп';
    // Пилюли выбора индекса; авто-выбранная = активная, клик — ручной выбор до конца прогона
    var pills = '<div class="btb-pills">';
    Object.keys(BT_BENCH).forEach(function(k) {
        pills += '<button type="button" class="btb-pill' + (k === bench ? ' active' : '')
            + '" onclick="btPickBenchmark(\'' + k + '\')" title="' + BT_BENCH[k].title + '">' + k + '</button>';
    });
    pills += '</div>';
    // Подпись: что именно сравниваем; предупреждаем, если учёт выплат разный
    var subTxt = 'С даты теста, нормировано к 0% · портфель '
        + (full ? 'с купонами и дивидендами (без реинвестирования)' : 'только по ценам')
        + ' · ' + b.note;
    if ((full && b.kind === 'price') || (!full && b.kind === 'tr')) {
        subTxt += ' · внимание: разный учёт выплат';
    }
    var pfCls = data.pfFinal >= 0 ? 'pos' : 'neg', imCls = data.imFinal >= 0 ? 'pos' : 'neg';
    var html = '<div class="bt-imoex-card">';
    html += '<div class="bt-imoex-head"><div class="bt-imoex-title">Доходность против индекса</div>' + pills + '</div>';
    html += '<div class="bt-imoex-subrow"><div class="bt-imoex-sub">' + subTxt + '</div>';
    html += '<span class="bt-imoex-delta ' + deltaCls + '">' + deltaTxt + '</span></div>';
    html += svg;
    html += '<div class="bt-imoex-legend">';
    html += '<span class="bt-imoex-leg"><i style="background:' + pfColor + '"></i>Ваш портфель <b class="v ' + pfCls + '">' + (data.pfFinal >= 0 ? '+' : '') + data.pfFinal.toFixed(1) + '%</b></span>';
    html += '<span class="bt-imoex-leg"><i style="background:#94A3B8"></i>' + bench + ' <b class="v ' + imCls + '">' + (data.imFinal >= 0 ? '+' : '') + data.imFinal.toFixed(1) + '%</b></span>';
    // «Депозит» — не пилюля-бенчмарк, а фон-ориентир: клик по легенде включает/
    // выключает линию, «?» рядом объясняет, что это и зачем сравнивать
    if (depAvailable) {
        var depTip = 'Депозит (RUSFAR) — сколько принесла бы та же сумма, если бы вы её просто положили на вклад под рыночную ставку, а не покупали бумаги.\n'
            + 'RUSFAR — ставка, по которой банки одалживают друг другу деньги под залог; она держится вплотную к ключевой ставке ЦБ и близка к процентам по вкладам. Линия капитализируется каждый день.\n'
            + 'Зачем сравнивать: если ваш портфель идёт ниже этой линии, значит риск не окупился — деньги на вкладе принесли бы больше, причём без просадок.\n'
            + 'Пример: 1 000 000 ₽ за год. Портфель дал +8%, а депозит +18% — вклад оказался и выгоднее, и спокойнее.';
        html += '<span class="bt-imoex-leg-dep">';
        html += '<button type="button" class="bt-imoex-leg bt-dep-toggle' + (hasDep ? '' : ' off') + '" onclick="btToggleDeposit()" title="Показать или скрыть линию депозита на графике">'
            + '<i class="dash" style="background:' + (hasDep ? depColor : '#9aa8bc') + '"></i>Депозит (RUSFAR) '
            + (hasDep ? '<b class="v">+' + data.depFinal.toFixed(1) + '%</b>' : '<b class="v muted">скрыт</b>')
            + '</button>';
        html += btHelpIcon(depTip);
        html += '</span>';
    }
    html += '</div></div>';
    panel.innerHTML = html;

    // ── Ховер-тултип: вертикальная направляющая + значения линий на дату ──
    var svgEl = panel.querySelector('svg.bt-imoex-chart');
    var cardEl = panel.querySelector('.bt-imoex-card');
    if (svgEl && cardEl) {
        var tip = document.createElement('div');
        tip.className = 'bt-ch-tip';
        cardEl.appendChild(tip);
        var guide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        guide.setAttribute('stroke', 'rgba(100,116,139,0.55)');
        guide.setAttribute('stroke-width', '1');
        guide.setAttribute('stroke-dasharray', '2 3');
        guide.setAttribute('y1', padT);
        guide.setAttribute('y2', H - padB);
        guide.style.display = 'none';
        svgEl.appendChild(guide);
        var tipRow = function(color, label, v) {
            return '<span class="r"><i style="background:' + color + '"></i>' + label
                + '<b>' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</b></span>';
        };
        svgEl.addEventListener('pointermove', function(ev) {
            var rect = svgEl.getBoundingClientRect();
            if (!rect.width) return;
            var vx = (ev.clientX - rect.left) / rect.width * W;
            var i = Math.round((vx - padL) / (W - padL - padR) * (n - 1));
            if (i < 0) i = 0;
            if (i > n - 1) i = n - 1;
            var p = s[i];
            var gx = X(i).toFixed(1);
            guide.setAttribute('x1', gx);
            guide.setAttribute('x2', gx);
            guide.style.display = '';
            tip.innerHTML = '<b class="d">' + btFormatDateDots(p.d) + '</b>'
                + tipRow(pfColor, 'Портфель', p.pf)
                + tipRow('#94A3B8', bench, p.im)
                + (hasDep ? tipRow(depColor, 'Депозит', p.dep) : '');
            // Тултип прилегает к курсору (следует и по X, и по Y), а вертикальная
            // направляющая при этом «примагничена» к ближайшей точке данных
            var cardRect = cardEl.getBoundingClientRect();
            var curX = ev.clientX - cardRect.left;
            var curY = ev.clientY - cardRect.top;
            var flip = curX > cardRect.width * 0.6;
            tip.style.left = curX + 'px';
            tip.style.top = curY + 'px';
            tip.style.transform = flip ? 'translate(-100%, -50%)' : 'translate(0, -50%)';
            tip.style.marginLeft = flip ? '-16px' : '16px';
            tip.style.display = 'block';
        });
        svgEl.addEventListener('pointerleave', function() {
            tip.style.display = 'none';
            guide.style.display = 'none';
        });
    }
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
    btMarkResultsStale();
    if (typeof lsScheduleSave === 'function') lsScheduleSave();
}

// Итоги по строкам: ценовые суммы, выплаты (купоны/дивиденды) и оба варианта
// P&L — «только цены» и «с выплатами». Выплата на строку = (на 1 шт.) × qty,
// пересчитывается именно здесь: btRebuyAtBudget меняет qty уже после загрузки.
function btComputeTotals(results) {
    var tb = 0, tt = 0, pay = 0, anyKnown = false;
    results.bonds.concat(results.stocks).forEach(function(a) {
        if (a.payments) anyKnown = true;
        // выплата «на 1 шт.» × количество НА ДАТУ выплаты (см. btQtyAtDate: сплиты)
        a.payTotal = (a.payments || []).reduce(function(s, p) { return s + p.v * btQtyAtDate(a, p.d); }, 0);
        // возврат номинала (амортизации/погашение) — это тело, а не купон:
        // прибавляем к стоимости «сейчас» в ОБОИХ режимах P&L
        a.amortTotal = (a.amorts || []).reduce(function(s, p) { return s + p.v * btQtyAtDate(a, p.d); }, 0);
        var effNow = a.testTotal + a.amortTotal;
        pay += a.payTotal;
        tb += a.buyTotal;
        tt += effNow;
        var ok = a.buyTotal > 0 && effNow > 0;
        a.pnl = ok ? effNow - a.buyTotal : null;
        a.pnlPct = ok ? ((effNow - a.buyTotal) / a.buyTotal * 100).toFixed(1) : null;
        a.pnlFull = ok ? effNow + a.payTotal - a.buyTotal : null;
        a.pnlPctFull = ok ? ((effNow + a.payTotal - a.buyTotal) / a.buyTotal * 100).toFixed(1) : null;
    });
    results.totalBuyPrice = tb;
    results.totalTestPrice = tt;
    results.totalPayouts = pay;
    // выплаты «неизвестны» (не грузились ни для одной бумаги) ≠ «их не было»
    results._payUnknown = !anyKnown && (results.bonds.length + results.stocks.length) > 0;
    var both = tb > 0 && tt > 0;
    results.totalPnl = both ? tt - tb : null;
    results.totalPnlPct = both ? ((tt - tb) / tb * 100).toFixed(1) : null;
    results.totalPnlFull = both ? tt + pay - tb : null;
    results.totalPnlPctFull = both ? ((tt + pay - tb) / tb * 100).toFixed(1) : null;
}

// «Покупка на стартовую сумму»: вместо переоценки текущих количеств по ценам
// прошлого считаем, что на дату теста инвестируется бюджет из расчёта в той же
// пропорции. Тогда «Стартовая сумма» ≈ сумме из расчёта, а не историческая стоимость.
function btRebuyAtBudget(results, budget) {
    if (!budget || budget <= 0) return;
    var all = results.bonds.concat(results.stocks);
    var vNow = 0;
    // testPrice — в сегодняшних акциях, qty — в купленных на дату теста: сплит-коэффициент
    all.forEach(function(a) { if (a.testPrice > 0) vNow += a.testPrice * a.qty * (a.splitK || 1); });
    if (vNow <= 0) return;
    all.forEach(function(a) {
        var k = a.splitK || 1;
        var w = (a.testPrice > 0 ? a.testPrice * a.qty * k : 0) / vNow;   // текущий вес
        var alloc = budget * w;
        var q = a.buyPrice > 0 ? Math.floor(alloc / a.buyPrice) : 0;
        a.qty = q;
        a.buyTotal = a.buyPrice > 0 ? a.buyPrice * q : 0;
        a.testTotal = a.testPrice > 0 ? a.testPrice * q * k : 0;
    });
    btComputeTotals(results);
}

function renderBtResults(results, dateStr) {
    var container = document.getElementById('btResults');
    if (!container) return;

    // Новый прогон: индекс снова авто, подвкладка — «Обзор», кэши серий — заново
    btState.benchOverride = null;
    btState.resultsTab = 'overview';
    window._btPfSeries = null;
    _btIdxCache = { key: '', map: {} };
    _btPayOpen = {};

    btRenderHero(results, dateStr);

    if (!results.bonds.length && !results.stocks.length) {
        container.innerHTML = '<div class="bt-error-card">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/>'
            + '<line x1="12" y1="8" x2="12" y2="12"/>'
            + '<line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            + '<div><div class="bt-error-title">Нет данных</div>'
            + '<div class="bt-error-msg">Портфель пуст или данные не загрузились.</div></div>'
            + '</div>';
        btEnterResultsMode();
        return;
    }

    var payCount = btCountPayments(results);
    var html = '';
    // Предупреждение о частичных данных — над подвкладками
    if (results._partialWarning) {
        html += '<div class="bt-stale-note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            + '<div><b>Частичные данные:</b> ' + results._partialWarning + '. Показаны доступные результаты.</div></div>';
    }
    // Подвкладки результатов — как подвкладки итогов в «Расчёте»
    function tabBtn(id, label, cnt) {
        return '<button type="button" class="btr-tab" data-rtab="' + id + '" onclick="btShowResultsTab(\'' + id + '\')">' + label
            + (cnt ? '<span class="cnt">' + cnt + '</span>' : '') + '</button>';
    }
    html += '<div class="btr-tabs" id="btResTabs">';
    html += tabBtn('overview', 'Обзор');
    html += tabBtn('assets', 'Бумаги', results.bonds.length + results.stocks.length);
    if (payCount > 0) html += tabBtn('pays', 'Выплаты', payCount);
    // Выгрузка всего результата (сводка + бумаги + выплаты) — по паттерну терминала.
    // Отделяем тонким разделителем, чтобы кнопка читалась как самостоятельное
    // действие, а не «потерявшаяся» вкладка.
    html += '<span class="btr-sep" aria-hidden="true"></span>';
    html += '<button type="button" class="btr-export" onclick="btExportCsv()" title="Скачать результаты теста в Excel (CSV)">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
        + '<span class="btr-export-tx">Excel</span></button>';
    html += '</div>';
    html += '<div class="btr-sub" id="btSubOverview"><div id="btImoexPanel"></div><div id="btAllocPanel"></div></div>';
    html += '<div class="btr-sub" id="btSubAssets"><div id="btAssetTables"></div></div>';
    html += '<div class="btr-sub" id="btSubPays"><div id="btPayTables"></div></div>';
    container.innerHTML = html;

    btRenderAssetTables(results, dateStr);
    btRenderPayTables(results, dateStr);
    btRenderAllocation(results);   // виджет «Распределение сейчас» под графиком
    btApplyResultsTab();
    btEnterResultsMode();
    btLoadChart();   // график в «Обзоре» — сразу, без отдельной кнопки
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}

// Число выплат за период по всем бумагам (для счётчика на подвкладке)
function btCountPayments(results) {
    var n = 0;
    results.bonds.concat(results.stocks).forEach(function(a) {
        if (a.payments && a.qty > 0) n += a.payments.length;
    });
    return n;
}

// Переключение подвкладок результатов
function btShowResultsTab(tab) {
    btState.resultsTab = tab;
    btApplyResultsTab();
}
function btApplyResultsTab() {
    var tab = btState.resultsTab || 'overview';
    document.querySelectorAll('#btResTabs .btr-tab').forEach(function(b) {
        b.classList.toggle('active', b.dataset.rtab === tab);
    });
    var map = { overview: 'btSubOverview', assets: 'btSubAssets', pays: 'btSubPays' };
    Object.keys(map).forEach(function(k) {
        var el = document.getElementById(map[k]);
        if (el) el.classList.toggle('active', k === tab);
    });
}

// Дата 'YYYY-MM-DD' → 'DD.MM.YYYY' для колонок таблиц выплат
function btFormatDateDots(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : (iso || '');
}

// Подвкладка «Бумаги»: таблицы ОФЗ и акций (лекало таблицы ОФЗ из «Ребаланса»)
function btRenderAssetTables(results, dateStr) {
    var container = document.getElementById('btAssetTables');
    if (!container) return;
    var full = btState.payoutMode !== 'price';
    var html = '';

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
        // Строки данных: P&L — по режиму (с выплатами / только цены)
        for (var k = 0; k < items.length; k++) {
            var b = items[k];
            var pnlVal = full ? b.pnlFull : b.pnl;
            if (pnlVal === undefined) pnlVal = b.pnl;
            var rowPnlClass = pnlVal != null ? (pnlVal > 0 ? 'pos' : pnlVal < 0 ? 'neg' : 'neutral') : 'neutral';
            var rowSign = pnlVal != null && pnlVal >= 0 ? '+' : '';
            var buyStr = b.buyPrice > 0
                ? (b.buyPrice < 100 ? b.buyPrice.toFixed(2) + ' ₽' : btFmtRub(b.buyPrice))
                : '—';
            var priceStr = b.testPrice > 0
                ? (b.testPrice < 100 ? b.testPrice.toFixed(2) + ' ₽' : btFmtRub(b.testPrice))
                : '—';
            var pnlStr = (b.error || pnlVal == null) ? '—' : rowSign + btFmtRub(pnlVal);
            // Не было цены на дату теста → бумага исключена из расчёта, говорим явно;
            // отдельный случай — валютная облигация (номинал в USD/CNY, курса нет)
            var ntBadge = '';
            if (b.error) {
                var fxu = window._btFxBonds && window._btFxBonds[b.t];
                ntBadge = fxu
                    ? '<i class="bt-nt-badge" title="Валютная облигация: номинал в ' + fxu + ', для рублёвой оценки нужен курс на дату — поддержка появится позже. Бумага не участвует в расчёте">валютная</i>'
                    : '<i class="bt-nt-badge" title="Нет цены на дату теста — бумага не участвует в расчёте">не торговалась</i>';
            }
            // Облигация погашена внутри окна: номинал вернулся деньгами и уже в P&L
            if (b.redeemed) {
                ntBadge += '<i class="bt-nt-badge" title="Облигация погашена за период теста: номинал возвращён деньгами и учтён в P&L вместе с купонами">погашена</i>';
            }
            // Сплит за период: «покупка» — в старых акциях, «сейчас» — в новых,
            // количество показываем как «купили → стало»
            var qtyStr = btQtyStr(b.qty) + ' шт.';
            if (b.splits) {
                var sp0 = b.splits[0];
                ntBadge += '<i class="bt-split-badge" title="' + b.splits.map(function(s) {
                    return 'Сплит ' + btFormatDateDots(s.d) + ': ' + s.before + ' → ' + s.after;
                }).join('; ') + '. Количество и цена «сейчас» — в новых акциях.">сплит ' + sp0.before + ':' + sp0.after + '</i>';
                qtyStr = btQtyStr(b.qty) + ' → ' + btQtyStr(b.qty * b.splitK) + ' шт.';
            }
            t += '<div class="bt-asset-row">';
            t += '<span class="bt-asset-rank">#' + (k + 1) + '</span>';
            t += '<div class="bt-asset-nameblock"><div class="bt-asset-name">' + (b.n || b.t) + ntBadge + '</div>';
            // в ручном режиме имя = тикер — не дублируем его в подстроке
            t += '<div class="bt-asset-ticker">' + ((b.n && b.n !== b.t) ? b.t + ' · ' : '') + qtyStr + '</div></div>';
            t += '<div class="bt-asset-buy-price">' + buyStr + '</div>';
            t += '<div class="bt-asset-price">' + priceStr + '</div>';
            t += '<div class="bt-asset-pnl ' + rowPnlClass + '">' + pnlStr + '</div>';
            t += '</div>';
        }
        t += '</div>';
        return t;
    }

    html += renderTable(results.bonds, 'Облигации', 'Цена входа на дату теста и текущая стоимость');
    html += renderTable(results.stocks, 'Акции', 'Цена входа на дату теста и текущая стоимость');
    container.innerHTML = html;
}

// ── Подвкладка «Выплаты»: купоны и дивиденды аккордеоном по бумаге ──
// Свёрнутая строка = бумага (сколько выплат, на 1 шт. за период, сумма),
// клик раскрывает хронологию выплат. Открытость живёт в _btPayOpen до прогона.
var _btPayOpen = {};

function btTogglePayGroup(key) {
    _btPayOpen[key] = !_btPayOpen[key];
    var body = document.getElementById('btPayG_' + key);
    var row = document.getElementById('btPayR_' + key);
    if (body) body.style.display = _btPayOpen[key] ? 'block' : 'none';
    if (row) row.classList.toggle('open', !!_btPayOpen[key]);
}

function btRenderPayTables(results, dateStr) {
    var container = document.getElementById('btPayTables');
    if (!container) return;
    var html = '';

    function renderPayTable(items, title, subtitle, dateColName, unitColName, kind) {
        var groups = items.filter(function(a) { return a.qty > 0 && a.payments && a.payments.length; });
        var missed = items.filter(function(a) { return a.qty > 0 && a.payments === null; }).map(function(a) { return a.t; });
        if (!groups.length) return '';
        var payN = 0, sum = 0;
        groups.forEach(function(a) {
            payN += a.payments.length;
            sum += a.payTotal || 0;
        });
        var t = '<div class="bt-assets-card bt-pay-card">';
        t += '<div class="bt-assets-header">';
        t += '<div class="bt-assets-ti"><div class="bt-assets-titlerow">';
        t += '<b class="bt-assets-title">' + title + '</b>';
        t += '<span class="bt-assets-cnt">' + payN + '</span></div>';
        t += '<span class="bt-assets-sub">' + subtitle + '</span></div>';
        t += '<div class="bt-assets-date-pill">с ' + btFormatDate(dateStr) + '</div>';
        t += '</div>';
        t += '<div class="bt-asset-row bt-asset-head">';
        t += '<span class="bt-col-head"></span>';
        t += '<div class="bt-col-head">Бумага</div>';
        t += '<div class="bt-col-head right">' + dateColName + '</div>';
        t += '<div class="bt-col-head right">' + unitColName + '</div>';
        t += '<div class="bt-col-head right">Сумма</div>';
        t += '</div>';
        groups.forEach(function(a) {
            var key = kind + '_' + a.t;
            var open = !!_btPayOpen[key];
            // «на 1 шт. за период»: при сплите выплаты объявлены на акции РАЗНОГО
            // масштаба — складывать их бессмысленно, показываем прочерк с пояснением
            var perUnitStr = a.splits
                ? '<span title="Был сплит: выплаты на акцию до и после — в разном масштабе, сумма на 1 шт. не определена">—</span>'
                : btPriceStr(a.payments.reduce(function(s, p) { return s + p.v; }, 0));
            var qtyStr = a.splits
                ? (btQtyStr(a.qty) + ' → ' + btQtyStr(a.qty * a.splitK) + ' шт.')
                : (btQtyStr(a.qty) + ' шт.');
            // Свёрнутая строка бумаги
            t += '<div class="bt-asset-row bt-pay-group' + (open ? ' open' : '') + '" id="btPayR_' + key + '" onclick="btTogglePayGroup(\'' + key + '\')" role="button" aria-expanded="' + open + '">';
            t += '<span class="bt-asset-rank"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>';
            t += '<div class="bt-asset-nameblock"><div class="bt-asset-name">' + (a.n || a.t) + '</div>';
            // количество — вперёд (на узком экране подстрока режется справа);
            // в ручном режиме имя = тикер, второй раз его не пишем
            t += '<div class="bt-asset-ticker">' + qtyStr + ((a.n && a.n !== a.t) ? ' · ' + a.t : '') + '</div></div>';
            t += '<div class="bt-asset-buy-price">' + a.payments.length + ' выпл.</div>';
            t += '<div class="bt-asset-price">' + perUnitStr + '</div>';
            t += '<div class="bt-asset-pnl pos">+' + btFmtRub(a.payTotal || 0) + '</div>';
            t += '</div>';
            // Раскрытая хронология: сумма = выплата × количество НА ДАТУ выплаты
            t += '<div class="bt-pay-body" id="btPayG_' + key + '" style="display:' + (open ? 'block' : 'none') + ';">';
            a.payments.forEach(function(p) {
                t += '<div class="bt-asset-row bt-pay-sub">';
                t += '<span class="bt-asset-rank"></span>';
                t += '<div class="bt-asset-nameblock"></div>';
                t += '<div class="bt-asset-buy-price">' + btFormatDateDots(p.d) + '</div>';
                t += '<div class="bt-asset-price">' + btPriceStr(p.v) + '</div>';
                t += '<div class="bt-asset-pnl pos">+' + btFmtRub(p.v * btQtyAtDate(a, p.d)) + '</div>';
                t += '</div>';
            });
            t += '</div>';
        });
        // Итоговая строка
        t += '<div class="bt-asset-row bt-pay-totalrow">';
        t += '<span class="bt-asset-rank"></span>';
        t += '<div class="bt-asset-nameblock"><div class="bt-asset-name">Итого за период</div></div>';
        t += '<div class="bt-asset-buy-price"></div>';
        t += '<div class="bt-asset-price"></div>';
        t += '<div class="bt-asset-pnl pos">+' + btFmtRub(sum) + '</div>';
        t += '</div>';
        if (missed.length) {
            t += '<div class="bt-pay-miss">По ' + missed.join(', ') + ' историю выплат загрузить не удалось — суммы могут быть неполными.</div>';
        }
        t += '</div>';
        return t;
    }

    html += renderPayTable(results.bonds, 'Купоны по облигациям',
        'Раскройте бумагу, чтобы увидеть каждую выплату', 'Дата купона', 'На 1 обл.', 'b');
    html += renderPayTable(results.stocks, 'Дивиденды по акциям',
        'Раскройте компанию, чтобы увидеть каждую выплату', 'Отсечка', 'На 1 акцию', 's');

    if (!html) {
        html = '<div class="bt-pay-empty">За период теста купонов и дивидендов не было — или их историю не удалось загрузить.</div>';
    }
    container.innerHTML = html;
}

// ── Виджет «Распределение сейчас»: доли облигаций и акций ──
// Считаем по ТЕКУЩЕЙ рыночной стоимости (цена сейчас × кол-во + возвращённый
// номинал), не зависит от режима P&L. Наглядно показывает, чего в портфеле
// больше и как это соотносится с классами активов.
function btRenderAllocation(results) {
    var panel = document.getElementById('btAllocPanel');
    if (!panel) return;
    function agg(list) {
        var val = 0, n = 0;
        list.forEach(function(a) {
            if (!(a.qty > 0)) return;
            var v = (a.testTotal || 0) + (a.amortTotal || 0);
            if (v > 0) { val += v; n++; }
        });
        return { val: val, n: n };
    }
    var b = agg(results.bonds), s = agg(results.stocks);
    var total = b.val + s.val;
    if (total <= 0) { panel.innerHTML = ''; return; }
    var bp = b.val / total * 100, sp = s.val / total * 100;
    var bondCol = '#2E90FA', stockCol = '#16B56B';
    var tip = 'Доли по текущей рыночной стоимости: цена бумаги сейчас × количество (плюс номинал уже погашенных облигаций). Проценты — от суммарной стоимости бумаг «сейчас», выплаты сюда не входят.';

    var bar = '<div class="bt-alloc-bar">';
    if (b.val > 0) bar += '<span style="width:' + bp.toFixed(2) + '%;background:' + bondCol + '"></span>';
    if (s.val > 0) bar += '<span style="width:' + sp.toFixed(2) + '%;background:' + stockCol + '"></span>';
    bar += '</div>';

    function row(name, col, part, cnt, val) {
        if (val <= 0) return '';
        return '<div class="bt-alloc-row">'
            + '<i style="background:' + col + '"></i>'
            + '<span class="bt-alloc-meta"><span class="nm">' + name + '</span>'
            + '<span class="ct">' + btPluralPapers(cnt) + '</span></span>'
            + '<span class="bt-alloc-fig"><b class="pct">' + part.toFixed(1) + '%</b>'
            + '<span class="amt">' + btFmtRub(val) + '</span></span>'
            + '</div>';
    }

    var html = '<div class="bt-alloc-card">';
    html += '<div class="bt-alloc-head">';
    html += '<div class="bt-alloc-htext"><div class="bt-alloc-title">Распределение сейчас' + btHelpIcon(tip) + '</div>';
    html += '<div class="bt-alloc-sub">Доли по текущей рыночной стоимости бумаг</div></div>';
    html += '<div class="bt-alloc-total"><span class="lbl">Всего</span><b>' + btFmtRub(total) + '</b></div>';
    html += '</div>';
    html += bar;
    html += '<div class="bt-alloc-rows">';
    html += row('Облигации', bondCol, bp, b.n, b.val);
    html += row('Акции', stockCol, sp, s.n, s.val);
    html += '</div></div>';
    panel.innerHTML = html;
}

// ── Экспорт результатов теста в Excel ──
// CSV с ; и запятой-десятичной (русская локаль Excel), BOM для кириллицы,
// анти-формульный гард — те же конвенции, что у экспорта терминала.
function btCsvCell(v) {
    var s = String(v == null ? '' : v).replace(/\n/g, ' ');
    // Excel исполняет ячейки, начинающиеся с = + @ (формульная инъекция) —
    // гасим апострофом; отрицательные числа («-12,3») не трогаем
    if (/^[=+@\t\r]/.test(s) || (s[0] === '-' && !/^-[\d\s.,]+%?$/.test(s))) s = "'" + s;
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function btCsvNum(v, dec) {
    if (v == null || isNaN(v)) return '';
    return (+v).toFixed(dec == null ? 2 : dec).replace('.', ',');
}
function btExportCsv() {
    var r = window._btLastResults, dateStr = window._btLastDate;
    if (!r || !dateStr) return;
    var lines = [];
    function push(row) { lines.push(row.map(btCsvCell).join(';')); }
    // Сводка
    push(['Тест портфеля', 'с ' + btFormatDateDots(dateStr) + ' по ' + btFormatDateDots(btLocalISO(new Date()))]);
    push(['Стартовая сумма, ₽', btCsvNum(r.totalBuyPrice)]);
    push(['Бумаги сейчас (включая возврат номинала), ₽', btCsvNum(r.totalTestPrice)]);
    push(['Купоны и дивиденды, ₽', r._payUnknown ? 'н/д' : btCsvNum(r.totalPayouts)]);
    push(['P&L только цены, ₽', btCsvNum(r.totalPnl)]);
    push(['Доходность только цены, %', r.totalPnlPct == null ? '' : String(r.totalPnlPct).replace('.', ',')]);
    push(['P&L с выплатами, ₽', btCsvNum(r.totalPnlFull)]);
    push(['Доходность с выплатами, %', r.totalPnlPctFull == null ? '' : String(r.totalPnlPctFull).replace('.', ',')]);
    if (r._maxDD != null) push(['Макс. просадка, %', btCsvNum(r._maxDD, 1)]);
    // Бумаги
    lines.push('');
    push(['Тип', 'Тикер', 'Название', 'Куплено, шт.', 'Сейчас, шт.', 'Цена покупки, ₽', 'Цена сейчас, ₽',
          'Вложено, ₽', 'Бумаги сейчас, ₽', 'Возврат номинала, ₽', 'Купоны/дивиденды, ₽',
          'P&L цены, ₽', 'P&L с выплатами, ₽', 'Пометки']);
    function assetRow(a, type) {
        var notes = [];
        if (a.error) notes.push(window._btFxBonds && window._btFxBonds[a.t] ? 'валютная (не в расчёте)' : 'не торговалась');
        if (a.redeemed) notes.push('погашена');
        if (a.splits) notes.push('сплит ' + a.splits.map(function(s) { return s.before + ':' + s.after; }).join(', '));
        var k = a.splitK || 1;
        push([type, a.t, a.n || a.t, btCsvNum(a.qty, 0), btCsvNum(a.qty * k, k < 1 ? 2 : 0),
              btCsvNum(a.buyPrice), btCsvNum(a.testPrice), btCsvNum(a.buyTotal), btCsvNum(a.testTotal),
              btCsvNum(a.amortTotal || 0), btCsvNum(a.payTotal || 0), btCsvNum(a.pnl), btCsvNum(a.pnlFull),
              notes.join('; ')]);
    }
    r.bonds.forEach(function(a) { assetRow(a, 'Облигация'); });
    r.stocks.forEach(function(a) { assetRow(a, 'Акция'); });
    // Хронология выплат
    var pays = [];
    r.bonds.forEach(function(a) { (a.payments || []).forEach(function(p) { pays.push({ a: a, p: p, kind: 'Купон' }); }); });
    r.stocks.forEach(function(a) { (a.payments || []).forEach(function(p) { pays.push({ a: a, p: p, kind: 'Дивиденд' }); }); });
    if (pays.length) {
        pays.sort(function(x, y) { return x.p.d < y.p.d ? -1 : x.p.d > y.p.d ? 1 : 0; });
        lines.push('');
        push(['Выплата', 'Тикер', 'Название', 'Дата', 'На 1 шт., ₽', 'Кол-во на дату, шт.', 'Сумма, ₽']);
        pays.forEach(function(row) {
            var q = btQtyAtDate(row.a, row.p.d);
            push([row.kind, row.a.t, row.a.n || row.a.t, btFormatDateDots(row.p.d),
                  btCsvNum(row.p.v), btCsvNum(q, q === Math.round(q) ? 0 : 2), btCsvNum(row.p.v * q)]);
        });
    }
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'test-portfelya-' + dateStr + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

// Пометка «параметры изменились» над результатами прошлого запуска —
// чтобы устаревшие таблицы нельзя было принять за пересчитанные
function btMarkResultsStale() {
    if (!window._btLastResults) return;
    var wrap = document.querySelector('#panel-backtest .bt2-wrap');
    if (!wrap || !wrap.classList.contains('bt-results-mode')) return;
    if (document.getElementById('btStaleNote')) return;
    var res = document.getElementById('btResults');
    if (!res) return;
    var div = document.createElement('div');
    div.id = 'btStaleNote';
    div.className = 'bt-stale-note';
    div.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        + '<div><b>Параметры изменились.</b> Ниже — результат прошлого запуска, нажмите «Запустить тест» ещё раз.</div>';
    res.insertBefore(div, res.firstChild);
}



// ===== IMPROVEMENT 3: MOEX API GRACEFUL FALLBACK =====
// («IMPROVEMENT 2» — btLoadLastPortfolio — удалён 2026-07-10: кнопки в UI не было,
// восстановление расчёта давно живёт в calc-mode.js через флаг calcDone)

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

    var todayStr = btLocalISO(new Date());

    // Все бумаги грузим ПАРАЛЛЕЛЬНО (обе цены + выплаты каждой бумаги тоже):
    // раньше 20 позиций = 40 последовательных запросов и полминуты ожидания,
    // теперь время = самый медленный одиночный запрос. Порядок сохраняется через map.
    function loadOne(asset, getPrice, isBond) {
        return Promise.all([
            getPrice(asset.t, dateStr),
            getPrice(asset.t, todayStr),
            btFetchPaymentsSafe(asset.t, isBond, dateStr, todayStr),
            btFetchAllSplits(),
            isBond ? btFetchAmortsSafe(asset.t, dateStr, todayStr) : Promise.resolve([])
        ]).then(function (trio) {
                var histPrice = trio[0], nowPrice = trio[1];
                done++;
                if (histPrice === -1) { failed++; histPrice = 0; }
                // Цена «сейчас» — живое закрытие с MOEX (тот же источник, что и конец
                // графика сравнения), цена из расчёта (asset.p) — запасной вариант.
                var rawNow = nowPrice;
                if (nowPrice <= 0) nowPrice = asset.p > 0 ? asset.p : 0;
                // Сплиты в окне теста: цена покупки — в старых акциях, цена «сейчас» —
                // в новых. Текущее количество = qty × splitK (qty остаётся стартовым).
                // Крайний случай: тест в день сплита при приостановленных торгах
                // (последняя цена — досплитовая) не ловим — сравниваем с датой теста.
                var spl = btSplitsFor(trio[3], asset.t, dateStr, todayStr);
                var splitK = spl.reduce(function(m, s) { return m * s.f; }, 1);
                // Погашение внутри окна: бумаги больше нет (цены «сейчас» нет), но
                // номинал вернулся ДЕНЬГАМИ — учтётся через amorts в btComputeTotals.
                // Без этого погашенная облигация выглядела как убыток в −100% цены.
                var amorts = trio[4];
                var redeemed = isBond && histPrice > 0 && rawNow <= 0
                    && !!(amorts && amorts.some(function(p) { return p.fin; }));
                var buyTotal = histPrice > 0 ? histPrice * asset.qty : 0;
                var nowTotal = nowPrice > 0 ? nowPrice * asset.qty * splitK : 0;
                updateProgress();
                return {
                    t: asset.t, n: asset.n, qty: asset.qty,
                    buyPrice: histPrice, testPrice: nowPrice,
                    buyTotal: buyTotal, testTotal: nowTotal,
                    splits: spl.length ? spl : null, splitK: splitK,
                    payments: trio[2],   // [{d,v на 1 шт.}] за период, null = не загрузились
                    amorts: amorts,      // возвраты номинала за период (fin = погашение)
                    redeemed: redeemed,
                    error: histPrice === 0
                };
            });
    }
    var loaded = await Promise.all([
        Promise.all(assets.bonds.map(function (b) { return loadOne(b, btGetBondPriceSafe, true); })),
        Promise.all(assets.stocks.map(function (s) { return loadOne(s, btGetStockPriceSafe, false); }))
    ]);
    results.bonds = loaded[0];
    results.stocks = loaded[1];

    if (failed > 0 && failed === total) {
        throw new Error('MOEX_UNAVAILABLE');
    }

    // Итоги (цены + выплаты, оба варианта P&L) — единым помощником
    btComputeTotals(results);
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
        renderBtResults(results, testDate);   // график в «Обзоре» грузится внутри
        lsSave();
    } catch(e) {
        if (e.message === 'MOEX_UNAVAILABLE') {
            showBtError(
                'Биржа не отвечает',
                'Не удалось получить ни одной цены с Мосбиржи. Проверьте подключение к интернету и попробуйте ещё раз через пару минут.'
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
        dateEl.max = btLocalISO(maxDate);
        dateEl.min = '2010-01-01';
        dateEl.value = btLocalISO(d);
    }
    btSyncPresetChips();
    btRenderTickerList();
    btUpdateRunBtn();
});
