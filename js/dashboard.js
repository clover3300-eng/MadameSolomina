// ===== DESKTOP DASHBOARD (домик → дашборд) =====
// Полностью собранная вкладка «Главная»:
//  • верхняя LIVE-полоска с рыночными данными (IMOEX / USD / BTC) + часы МСК
//  • сохранённый портфель (живёт в localStorage, переживает перезагрузку)
//  • пересчёт прямо здесь — кнопка раскрывает выбор стратегии и комиссии
//  • вертикальные рекомендации для ребаланса: ОФЗ и акции по эшелонам
//  • клик по тикеру → выезжающая справа панель о компании / облигации
//  • вертикаль рыночных ставок
(function() {
    'use strict';

    var SNAP_KEY = 'dash_portfolio_v1';
    var rebalRetries = 0;
    var clockTimer = null;

    function dq(id) { return document.getElementById(id); }
    function txt(id, fb) { var e = dq(id); return e ? (e.textContent || '').trim() : (fb == null ? '—' : fb); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    }); }
    function toNum(s) { return parseFloat(String(s == null ? '' : s).replace('%', '').replace(/\s/g, '').replace(',', '.')); }

    var ICONS = {
        imoex: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        usd:   '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
        btc:   '<path d="M11.5 2v3M11.5 19v3M8 2v3M8 19v3"/><path d="M6 5h7a4 4 0 0 1 0 8H6zM6 13h8a4 4 0 0 1 0 8H6z"/>',
        recalc:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        chevron:'<polyline points="6 9 12 15 18 9"/>',
        bolt:  '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        check: '<polyline points="20 6 9 17 4 12"/>'
    };

    // ====================================================================
    //  LIVE-ПОЛОСКА (рыночные данные + часы МСК)
    // ====================================================================
    function renderLiveBar() {
        var host = dq('dash2LiveBar');
        if (!host) return;
        var tiles = [
            { k: 'imoex', label: 'IMOEX',   val: 'val-imoex',  dyn: 'dyn-imoex' },
            { k: 'usd',   label: 'USD/RUB', val: 'val-usdrub', dyn: 'dyn-usdrub' },
            { k: 'btc',   label: 'BTC',     val: 'val-btc',    dyn: 'dyn-btc' }
        ];
        host.innerHTML =
            '<div class="dlv-live"><span class="dlv-dot"></span>LIVE</div>' +
            '<div class="dlv-vsep"></div>' +
            '<div class="dlv-items">' + tiles.map(function(t) {
                return '<div class="dlv-item">' +
                    '<span class="dlv-k">' + esc(t.label) + '</span>' +
                    '<span class="dlv-v" id="dlv-v-' + t.k + '">—</span>' +
                    '<span class="dlv-c" id="dlv-c-' + t.k + '"></span>' +
                '</div>';
            }).join('<span class="dlv-isep"></span>') + '</div>' +
            '<div class="dlv-time"><span class="dlv-time-k">MSK</span><span class="dlv-time-v" id="dlvClock">--:--:--</span></div>';
        tickLiveBar();
    }

    // Обновление значений полоски без полной перерисовки (раз в секунду)
    function tickLiveBar() {
        var clock = dq('dlvClock');
        if (clock) {
            try {
                clock.textContent = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour12: false });
            } catch (e) {
                clock.textContent = new Date().toLocaleTimeString('ru-RU', { hour12: false });
            }
        }
        [['imoex','val-imoex','dyn-imoex'], ['usd','val-usdrub','dyn-usdrub'], ['btc','val-btc','dyn-btc']].forEach(function(p) {
            var v = dq('dlv-v-' + p[0]);
            var c = dq('dlv-c-' + p[0]);
            var srcV = dq(p[1]);
            var srcD = dq(p[2]);
            if (v && srcV) { var s = (srcV.textContent || '').trim(); if (s) v.textContent = s; }
            if (c && srcD) {
                var t = (srcD.textContent || '').trim();
                c.textContent = t;
                c.className = 'dlv-c ' + (srcD.classList.contains('negative') ? 'neg' : (srcD.classList.contains('positive') ? 'pos' : 'flat'));
            }
        });
    }

    function ensureClock() {
        if (clockTimer) return;
        clockTimer = setInterval(function() {
            if (currentTab === 'dashboard' && dq('dlvClock')) tickLiveBar();
        }, 1000);
    }

    // ====================================================================
    //  СОХРАНЁННЫЙ ПОРТФЕЛЬ (persist)
    // ====================================================================
    // Считываем рассчитанный портфель из «живого» DOM (вкладка «Портфель»)
    function dashCaptureLive() {
        if (!window.isPortfolioCalculated) return null;
        var cap = txt('summ-invested', '');
        if (!cap || cap === '—' || /^0\s*₽?$/.test(cap)) return null;
        var pctEl = dq('summ-total-percent-v2');
        var fee = (typeof brokerFee !== 'undefined') ? (brokerFee * 100).toFixed(2).replace(/\.?0+$/, '') + '%' : '';
        return {
            cap: cap,
            bondPct: txt('srl-bond-pct-v2', '50%'),
            stockPct: txt('srl-stock-pct-v2', '50%'),
            bondSum: txt('legend-bond-sum', '—'),
            stockSum: txt('legend-stock-sum', '—'),
            fcTotal: txt('summ-total-value-v2', '—'),
            fcPct: pctEl ? (pctEl.getAttribute('data-pct') || (pctEl.textContent || '').trim()) : '',
            strategy: txt('mainCardTitle', ''),
            fee: fee,
            composition: dashCaptureComposition(),
            ts: Date.now()
        };
    }

    // Состав рассчитанного портфеля (тикеры) — берём готовые данные из draw()
    function dashCaptureComposition() {
        var sl = window._shoppingListData;
        if (!sl || (!(sl.bonds && sl.bonds.length) && !(sl.stocks && sl.stocks.length))) return null;
        function trim(arr) {
            return (arr || []).filter(function(x) { return x && x.ticker; }).map(function(x) {
                return { ticker: x.ticker, name: x.name || x.ticker, qty: x.qty || 0, sum: x.sum || 0, echelon: x.echelon || 0 };
            });
        }
        return { bonds: trim(sl.bonds), stocks: trim(sl.stocks) };
    }

    function dashSaveSnapshot(snap) {
        try { if (snap) localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); } catch (e) {}
    }
    function dashLoadSnapshot() {
        try { var raw = localStorage.getItem(SNAP_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }

    // Состояние инлайн-пересчёта (сумма / стратегия / комиссия)
    var recalc = { open: false, bondPct: 50, fee: 0.0005, feeText: '0.05%', strat: 'Гармония', customFee: false };
    var compOpen = true; // раскрыт ли блок «Состав портфеля»

    function plural(n, one, few, many) {
        n = Math.abs(n) % 100; var n1 = n % 10;
        if (n > 10 && n < 20) return many;
        if (n1 > 1 && n1 < 5) return few;
        if (n1 === 1) return one;
        return many;
    }

    function dashStrategies() {
        if (typeof ND_STRATEGIES !== 'undefined' && ND_STRATEGIES && ND_STRATEGIES.length) return ND_STRATEGIES;
        return [
            { bonds: 70, stocks: 30, title: 'Депозит',     subtitle: 'Защита капитала' },
            { bonds: 60, stocks: 40, title: 'Баланс',      subtitle: 'Умеренный риск' },
            { bonds: 50, stocks: 50, title: 'Гармония',    subtitle: 'Классический баланс' },
            { bonds: 40, stocks: 60, title: 'Умеренная',   subtitle: 'Баланс роста' },
            { bonds: 30, stocks: 70, title: 'Агрессивная', subtitle: 'Макс. рост' },
            { bonds: -1, stocks: -1, title: 'Своя',        subtitle: 'Вручную' }
        ];
    }

    var FEE_OPTS = [
        { v: 0.0001, t: '0.01%' }, { v: 0.0003, t: '0.03%' }, { v: 0.0005, t: '0.05%' },
        { v: 0.001,  t: '0.1%'  }, { v: 0.003,  t: '0.3%'  }, { v: 0.005,  t: '0.5%'  }
    ];

    function fmtRubInput(n) { return n > 0 ? n.toLocaleString('ru-RU').replace(/\s/g, '.') : ''; }

    function renderPortfolio() {
        var host = dq('dash2Portfolio');
        if (!host) return;

        // Свежие данные приоритетнее сохранённых; если есть — сохраняем снапшот
        var live = dashCaptureLive();
        if (live) dashSaveSnapshot(live);
        var snap = live || dashLoadSnapshot();

        // Инициализируем состояние пересчёта из снапшота / калькулятора
        if (snap) {
            var bp = toNum(snap.bondPct); if (isFinite(bp)) recalc.bondPct = bp;
            if (snap.strategy) recalc.strat = snap.strategy;
        } else {
            var sl = dq('ratioSlider'); if (sl) recalc.bondPct = parseInt(sl.value) || 50;
        }
        if (typeof brokerFee !== 'undefined') {
            recalc.fee = brokerFee;
            recalc.feeText = (brokerFee * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
        }

        var summaryHtml;
        if (snap) {
            var bondNum = toNum(snap.bondPct) || 0;
            summaryHtml =
                '<div class="dp-eyebrow">Текущий капитал' + (snap.strategy ? ' · <span class="dp-strat">' + esc(snap.strategy) + '</span>' : '') + '</div>' +
                '<div class="dp-capital">' + esc(snap.cap) + '</div>' +
                '<div class="dp-bar"><i class="dp-bar-bond" style="width:' + bondNum + '%"></i><i class="dp-bar-stock" style="width:' + (100 - bondNum) + '%"></i></div>' +
                '<div class="dp-legend">' +
                    '<div class="dp-leg"><span class="dp-dot bond"></span><span class="dp-leg-name">ОФЗ</span><span class="dp-leg-pct">' + esc(snap.bondPct) + '</span><span class="dp-leg-sum">' + esc(snap.bondSum) + '</span></div>' +
                    '<div class="dp-leg"><span class="dp-dot stock"></span><span class="dp-leg-name">Акции</span><span class="dp-leg-pct">' + esc(snap.stockPct) + '</span><span class="dp-leg-sum">' + esc(snap.stockSum) + '</span></div>' +
                '</div>' +
                '<div class="dp-forecast">' +
                    '<span class="dp-fc-label">Прогноз через 3 года</span>' +
                    '<span class="dp-fc-row"><span class="dp-fc-total">' + esc(snap.fcTotal) + '</span>' +
                    (snap.fcPct ? '<span class="dp-fc-pct ' + (/-/.test(snap.fcPct) ? 'neg' : '') + '">' + esc(snap.fcPct) + '</span>' : '') + '</span>' +
                '</div>';
        } else {
            summaryHtml =
                '<div class="dp-eyebrow">Портфель</div>' +
                '<div class="dp-empty">' +
                    '<div class="dp-empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg></div>' +
                    '<div class="dp-empty-title">Портфель ещё не сформирован</div>' +
                    '<div class="dp-empty-text">Задайте сумму, стратегию и комиссию — расчёт появится прямо здесь и сохранится.</div>' +
                '</div>';
        }

        host.innerHTML =
            summaryHtml +
            (snap ? renderComposition(snap) : '') +
            '<button class="dp-recalc-toggle' + (recalc.open ? ' open' : '') + '" onclick="dashToggleRecalc()">' +
                '<span class="dp-rt-left"><svg viewBox="0 0 24 24">' + ICONS.recalc + '</svg>' + (snap ? 'Пересчитать портфель' : 'Сформировать портфель') + '</span>' +
                '<svg class="dp-rt-chev" viewBox="0 0 24 24">' + ICONS.chevron + '</svg>' +
            '</button>' +
            renderRecalcPanel(snap);

        bindRecalcInputs();
    }

    // ---- Состав рассчитанного портфеля (тикеры, сохраняются в снапшоте) ----
    function compChip(it, kind) {
        var click = kind === 'stock'
            ? 'dashOpenTicker(\'' + esc(it.ticker) + '\',' + (it.echelon || 1) + ')'
            : 'dashOpenComp(\'' + esc(it.ticker) + '\')';
        var qty = it.qty ? '<span class="dpc-qty">' + it.qty + '</span>' : '';
        return '<button class="dpc-chip" onclick="' + click + '" title="' + esc(it.name) + '">' +
            '<span class="dpc-tk">' + esc(it.ticker) + '</span>' + qty + '</button>';
    }

    function renderComposition(snap) {
        var c = snap && snap.composition;
        if (!c) return '';
        var bonds = c.bonds || [], stocks = c.stocks || [];
        var total = bonds.length + stocks.length;
        if (!total) return '';
        var groups = '';
        if (bonds.length) {
            groups += '<div class="dpc-group">' +
                '<div class="dpc-glabel"><span class="dp-dot bond"></span>ОФЗ<span class="dpc-gn">' + bonds.length + '</span></div>' +
                '<div class="dpc-chips">' + bonds.map(function(b) { return compChip(b, 'bond'); }).join('') + '</div>' +
            '</div>';
        }
        if (stocks.length) {
            groups += '<div class="dpc-group">' +
                '<div class="dpc-glabel"><span class="dp-dot stock"></span>Акции<span class="dpc-gn">' + stocks.length + '</span></div>' +
                '<div class="dpc-chips">' + stocks.map(function(s) { return compChip(s, 'stock'); }).join('') + '</div>' +
            '</div>';
        }
        return '<div class="dp-comp' + (compOpen ? ' open' : '') + '">' +
            '<button class="dp-comp-head" onclick="dashToggleComp()">' +
                '<span class="dp-comp-title">Состав портфеля</span>' +
                '<span class="dp-comp-count">' + total + ' ' + plural(total, 'бумага', 'бумаги', 'бумаг') + '</span>' +
                '<svg class="dp-comp-chev" viewBox="0 0 24 24">' + ICONS.chevron + '</svg>' +
            '</button>' +
            '<div class="dp-comp-body">' + groups + '</div>' +
        '</div>';
    }

    window.dashToggleComp = function() { compOpen = !compOpen; renderPortfolio(); };
    // Клик по облигации из состава → график (детальная панель — только для акций)
    window.dashOpenComp = function(ticker) {
        if (typeof openTradingViewDirect === 'function') openTradingViewDirect(ticker);
        else if (typeof openStockDetail === 'function') openStockDetail(ticker, 1);
    };

    function renderRecalcPanel() {
        var stratChips = dashStrategies().map(function(s) {
            var custom = s.bonds === -1;
            var sel = custom ? (recalc.strat === 'Своя') : (recalc.strat === s.title);
            var sub = custom ? 'вручную' : (s.bonds + '/' + s.stocks);
            return '<button class="dp-chip' + (sel ? ' sel' : '') + '" onclick="dashPickStrategy(' + s.bonds + ',\'' + esc(s.title) + '\')">' +
                '<span class="dp-chip-t">' + esc(s.title) + '</span><span class="dp-chip-s">' + esc(sub) + '</span></button>';
        }).join('');

        var feeChips = FEE_OPTS.map(function(f) {
            var sel = !recalc.customFee && Math.abs(recalc.fee - f.v) < 1e-9;
            return '<button class="dp-fchip' + (sel ? ' sel' : '') + '" onclick="dashPickFee(' + f.v + ',\'' + f.t + '\')">' + f.t + '</button>';
        }).join('');

        var isCustomStrat = recalc.strat === 'Своя';
        var stockPct = 100 - recalc.bondPct;

        return '<div class="dp-recalc-panel' + (recalc.open ? ' open' : '') + '" id="dashRecalcPanel">' +
            '<div class="dp-field-label">Сумма инвестиций</div>' +
            '<div class="dp-recalc-field"><input type="text" id="dashSumInput" inputmode="numeric" autocomplete="off" placeholder="например, 1.000.000"><span>₽</span></div>' +

            '<div class="dp-field-label">Стратегия</div>' +
            '<div class="dp-chips">' + stratChips + '</div>' +
            '<div class="dp-custom-strat' + (isCustomStrat ? ' open' : '') + '">' +
                '<button class="dp-step" onclick="dashAdjustBonds(-5)">−</button>' +
                '<div class="dp-step-disp"><span class="dp-step-b">' + recalc.bondPct + '</span><span class="dp-step-sep">/</span><span class="dp-step-s">' + stockPct + '</span></div>' +
                '<button class="dp-step" onclick="dashAdjustBonds(5)">+</button>' +
                '<div class="dp-step-tags"><span>Обл.</span><span>Акц.</span></div>' +
            '</div>' +

            '<div class="dp-field-label">Комиссия брокера</div>' +
            '<div class="dp-fchips">' + feeChips +
                '<button class="dp-fchip dp-fchip-custom' + (recalc.customFee ? ' sel' : '') + '" onclick="dashShowCustomFee()">Своя</button>' +
            '</div>' +
            '<div class="dp-custom-fee' + (recalc.customFee ? ' open' : '') + '">' +
                '<input type="text" id="dashCustomFee" inputmode="decimal" placeholder="0.05" value="' + (recalc.customFee ? (recalc.fee * 100) : '') + '"><span>%</span>' +
                '<button class="dp-fee-apply" onclick="dashApplyCustomFee()">ОК</button>' +
            '</div>' +

            '<button class="dp-run-btn" onclick="dashRunRecalc()"><svg viewBox="0 0 24 24">' + ICONS.bolt + '</svg>' +
                (window.isPortfolioCalculated || dashLoadSnapshot() ? 'Пересчитать' : 'Рассчитать портфель') + '</button>' +
            '<div class="dp-run-hint">Минимальная сумма расчёта — 100.000 ₽</div>' +
        '</div>';
    }

    function bindRecalcInputs() {
        var si = dq('dashSumInput');
        if (si) {
            // подставляем последнюю сумму из калькулятора, если есть
            var main = dq('sumInput');
            if (main && main.value) si.value = main.value;
            si.addEventListener('input', function() {
                var raw = this.value.replace(/\D/g, '').replace(/^0+/, '');
                var n = parseInt(raw) || 0;
                this.value = fmtRubInput(n);
            });
        }
    }

    // ---- Управление инлайн-пересчётом ----
    window.dashToggleRecalc = function() {
        recalc.open = !recalc.open;
        renderPortfolio();
        if (recalc.open) {
            var p = dq('dashRecalcPanel');
            if (p) setTimeout(function() { p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 120);
        }
    };
    window.dashPickStrategy = function(bonds, title) {
        recalc.strat = title;
        if (bonds >= 0) recalc.bondPct = bonds;
        renderRecalcOnly();
    };
    window.dashAdjustBonds = function(d) {
        recalc.bondPct = Math.max(0, Math.min(100, recalc.bondPct + d));
        recalc.strat = 'Своя';
        renderRecalcOnly();
    };
    window.dashPickFee = function(v, t) {
        recalc.fee = v; recalc.feeText = t; recalc.customFee = false;
        renderRecalcOnly();
    };
    window.dashShowCustomFee = function() {
        recalc.customFee = true;
        renderRecalcOnly();
        var el = dq('dashCustomFee'); if (el) el.focus();
    };
    window.dashApplyCustomFee = function() {
        var el = dq('dashCustomFee');
        var raw = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
        if (!isNaN(raw) && raw > 0 && raw <= 100) {
            recalc.fee = raw / 100;
            recalc.feeText = (raw < 1 ? raw.toFixed(2) : raw.toFixed(1)) + '%';
            recalc.customFee = true;
        }
        renderRecalcOnly();
    };

    // Перерисовать только панель пересчёта (сохранить введённую сумму)
    function renderRecalcOnly() {
        var si = dq('dashSumInput');
        var saved = si ? si.value : '';
        var panel = dq('dashRecalcPanel');
        if (!panel) { renderPortfolio(); return; }
        panel.outerHTML = renderRecalcPanel();
        bindRecalcInputs();
        var si2 = dq('dashSumInput');
        if (si2 && saved) si2.value = saved;
    }

    window.dashRunRecalc = function() {
        var si = dq('dashSumInput');
        var sum = si ? (parseInt(si.value.replace(/\D/g, '')) || 0) : 0;
        if (sum < 100000) {
            if (si) {
                si.closest('.dp-recalc-field').classList.add('dp-shake');
                setTimeout(function() { var f = dq('dashSumInput'); if (f) f.closest('.dp-recalc-field').classList.remove('dp-shake'); }, 500);
            }
            dashToast('Введите сумму от 100.000 ₽', true);
            return;
        }
        // прокидываем значения в основной калькулятор и считаем (без ухода со страницы)
        var main = dq('sumInput');
        if (main) { main.value = fmtRubInput(sum); if (typeof ndFormatInput === 'function') { try { ndFormatInput(main); } catch (e) {} } }
        var slider = dq('ratioSlider');
        if (slider) slider.value = recalc.bondPct;
        if (typeof brokerFee !== 'undefined') brokerFee = recalc.fee;
        if (typeof isFeeSelected !== 'undefined') isFeeSelected = true;
        var feeTxtEl = dq('feeSelectedText');
        if (feeTxtEl) { feeTxtEl.textContent = recalc.feeText; feeTxtEl.classList.remove('placeholder'); }
        // главная карточка стратегии в калькуляторе — для консистентности
        if (typeof updateMainCardUI === 'function') {
            var st = recalc.strat === 'Своя' ? 'Индивидуальная' : recalc.strat;
            try { updateMainCardUI(recalc.bondPct, st, recalc.strat === 'Своя' ? 'Ваша настройка' : ''); } catch (e) {}
        }
        try {
            if (typeof draw === 'function') draw();
            if (typeof savePortfolio === 'function') savePortfolio();
            window.isPortfolioCalculated = true;
            recalc.open = false;
            renderPortfolio();
            dashToast('Портфель пересчитан');
        } catch (e) {
            console.error('dashRunRecalc error', e);
            dashToast('Не удалось пересчитать', true);
        }
    };

    function dashToast(msg, isErr) {
        var t = dq('dashToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'dashToast';
            t.className = 'dash-toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.className = 'dash-toast show' + (isErr ? ' error' : '');
        clearTimeout(dashToast._t);
        dashToast._t = setTimeout(function() { t.className = 'dash-toast' + (isErr ? ' error' : ''); }, 2200);
    }

    // ====================================================================
    //  ВЕРТИКАЛЬ СТАВОК
    // ====================================================================
    function renderRates() {
        var host = dq('dash2Rates');
        if (!host) return;
        var rd = window.ratesData || (typeof ratesData !== 'undefined' ? ratesData : {});
        var keyV  = rd.keyRate     != null ? rd.keyRate     : txt('val-key-rate');
        var depV  = rd.depositRate != null ? rd.depositRate : txt('val-deposit-rate');
        var inflV = rd.inflation   != null ? rd.inflation   : txt('val-inflation');
        var ofzV  = rd.ofz10       != null ? rd.ofz10       : txt('val-ofz10');
        var rows = [
            { label: 'Ключевая ставка',       val: keyV, accent: true },
            { label: 'Ставка по вкладам',     val: depV },
            { label: 'Инфляция год',          val: inflV },
            { label: 'Доходность ОФЗ 10 лет', val: ofzV }
        ];
        // Реальная ставка = ключевая − инфляция (заполняет карточку и полезна)
        var k = toNum(keyV), inf = toNum(inflV), realStr = '—', realNeg = false;
        if (isFinite(k) && isFinite(inf)) { var r = k - inf; realNeg = r < 0; realStr = (r >= 0 ? '+' : '') + r.toFixed(2) + '%'; }
        host.innerHTML =
            '<div class="dr-head"><div class="dr-title">Ставки рынка</div><span class="dr-tag">Россия</span></div>' +
            '<div class="dr-list">' + rows.map(function(r) {
                return '<div class="dr-row' + (r.accent ? ' accent' : '') + '">' +
                    '<span class="dr-label">' + esc(r.label) + '</span>' +
                    '<span class="dr-val">' + esc(r.val) + '</span>' +
                '</div>';
            }).join('') + '</div>' +
            '<div class="dr-foot">' +
                '<div class="dr-foot-l"><div class="dr-foot-title">Реальная ставка</div><div class="dr-foot-sub">ключевая − инфляция</div></div>' +
                '<div class="dr-foot-v' + (realNeg ? ' neg' : '') + '">' + esc(realStr) + '</div>' +
            '</div>';
    }

    // ====================================================================
    //  ИЗБРАННОЕ (звёздочки из раздела «Рынок · Акции»)
    // ====================================================================
    function loadFavsRaw() {
        try { var a = JSON.parse(localStorage.getItem('stk_fav_v1')); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }

    // Достаём имя / эшелон / метрику для тикера из доступных данных
    function resolveTickerMeta(tk) {
        if (typeof echelonTableData !== 'undefined' && echelonTableData) {
            for (var ci = 0; ci < echelonTableData.length; ci++) {
                var col = echelonTableData[ci] || [];
                for (var i = 0; i < col.length; i++) {
                    if (col[i] && col[i].t === tk) {
                        var pot = toNum(col[i].target);
                        return { name: col[i].n || tk, echelon: ci + 1,
                            metric: isFinite(pot) ? ((pot >= 0 ? '+' : '') + pot.toFixed(1) + '%') : '',
                            neg: isFinite(pot) && pot < 0 };
                    }
                }
            }
        }
        if (typeof bonds !== 'undefined' && bonds) {
            for (var b = 0; b < bonds.length; b++) {
                if (bonds[b].t === tk) {
                    var y = toNum(bonds[b].y);
                    return { name: bonds[b].n || tk, echelon: 0, metric: isFinite(y) ? y.toFixed(2) + '%' : '', neg: false };
                }
            }
        }
        if (typeof window.stkFindCompany === 'function') {
            var co = window.stkFindCompany(tk);
            if (co) return { name: co.name || tk, echelon: 0, metric: '', neg: false };
        }
        return { name: tk, echelon: 0, metric: '', neg: false };
    }

    function renderFavorites() {
        var host = dq('dash2Fav');
        if (!host) return;
        var favs = (typeof window.stkGetFavorites === 'function') ? window.stkGetFavorites() : loadFavsRaw();
        var head = '<div class="dfv-head"><div class="dfv-title">Избранное</div>' +
            (favs.length ? '<span class="dfv-count">' + favs.length + '</span>' : '') + '</div>';

        if (!favs.length) {
            host.innerHTML = head +
                '<div class="dfv-empty">' +
                    '<div class="dfv-empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>' +
                    '<div class="dfv-empty-text">Отмечайте акции звёздочкой ★ в разделе «Рынок · Акции» — они появятся здесь.</div>' +
                    '<button class="dfv-empty-btn" onclick="switchTab(\'market-stocks\')">Перейти к акциям</button>' +
                '</div>';
            return;
        }

        var rows = favs.map(function(tk) {
            var meta = resolveTickerMeta(tk);
            var metric = meta.metric ? '<span class="dfv-metric ' + (meta.neg ? 'neg' : '') + '">' + esc(meta.metric) + '</span>' : '';
            var tier = meta.echelon ? '<span class="drb-tier tier-' + meta.echelon + '">' + (TIERS[meta.echelon - 1] || TIERS[0]).roman + '</span>' : '';
            return '<div class="dfv-item" onclick="dashOpenFav(\'' + esc(tk) + '\',' + (meta.echelon || 1) + ')">' +
                '<span class="dfv-info"><span class="dfv-tk">' + esc(tk) + tier + '</span>' +
                    '<span class="dfv-name">' + esc(meta.name) + '</span></span>' +
                metric +
                '<button class="dfv-x" title="Убрать из избранного" onclick="event.stopPropagation();dashUnfav(\'' + esc(tk) + '\')">' +
                    '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>';
        }).join('');
        host.innerHTML = head + '<div class="dfv-list">' + rows + '</div>';
    }

    window.dashOpenFav = function(tk, ech) {
        if (typeof openStockDetail === 'function') openStockDetail(tk, ech || 1);
        else if (typeof goToCompanyPageFromTicker === 'function') goToCompanyPageFromTicker(tk);
    };
    window.dashUnfav = function(tk) {
        if (typeof window.stkToggleFav === 'function') window.stkToggleFav(tk);
        else {
            var a = loadFavsRaw(); var i = a.indexOf(tk); if (i >= 0) a.splice(i, 1);
            try { localStorage.setItem('stk_fav_v1', JSON.stringify(a)); } catch (e) {}
        }
        renderFavorites();
    };

    // ====================================================================
    //  РЕКОМЕНДАЦИИ ДЛЯ РЕБАЛАНСА (вертикально: ОФЗ + акции, с сортировкой)
    // ====================================================================
    var rebalSort = { bond: 'yield', stock: 'potential' };

    var TIERS = [ { roman: 'I' }, { roman: 'II' }, { roman: 'III' }, { roman: 'IV' } ];

    function dfmt(dateStr) {
        if (!dateStr || dateStr === '—') return '—';
        var p = String(dateStr).split('T')[0].split('-');
        return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : String(dateStr);
    }

    // ОФЗ: считаем YTM (из Sheets) и текущую купонную доходность (купон·частота / цена)
    function ofzList() {
        if (typeof bonds === 'undefined' || !bonds || !bonds.length) return [];
        var list = bonds.map(function(b) {
            var price = parseFloat(String(b.p).replace(',', '.')) || 0;
            var nkd = parseFloat(b.nkd || 0) || 0;
            var d = (typeof bondDetailsMap !== 'undefined' && bondDetailsMap[b.t]) ? bondDetailsMap[b.t] : {};
            var cur = (d.couponValue > 0 && d.freq > 0 && price > 0) ? (d.couponValue * d.freq / price * 100) : NaN;
            return { ticker: b.t, name: b.n, ytm: toNum(b.y), cur: cur, price: price, nkd: nkd, total: price + nkd, d: d };
        });
        if (rebalSort.bond === 'coupon') list.sort(function(a, b) { return (isFinite(b.cur) ? b.cur : -1e9) - (isFinite(a.cur) ? a.cur : -1e9); });
        else list.sort(function(a, b) { return (isFinite(b.ytm) ? b.ytm : -1e9) - (isFinite(a.ytm) ? a.ytm : -1e9); });
        return list.slice(0, 5);
    }

    function topStocks(limit) {
        if (typeof echelonTableData === 'undefined' || !echelonTableData) return [];
        var all = [];
        echelonTableData.forEach(function(col, ci) {
            (col || []).forEach(function(a) {
                if (a && a.t) {
                    var pot = toNum(a.target);
                    all.push({ ticker: a.t, name: a.n || a.t, echelon: ci + 1,
                        pot: isFinite(pot) ? pot : -1e9,
                        metric: isFinite(pot) ? ((pot >= 0 ? '+' : '') + pot.toFixed(1) + '%') : '—' });
                }
            });
        });
        if (rebalSort.stock === 'echelon') all.sort(function(a, b) { return (a.echelon - b.echelon) || (b.pot - a.pot); });
        else all.sort(function(a, b) { return b.pot - a.pot; });
        return all.slice(0, limit);
    }

    // Строка ОФЗ с инлайн-раскрытием деталей (как во вкладке «Ребаланс»)
    function renderOfzItem(it, i, metric) {
        var d = it.d || {};
        var cur = isFinite(it.cur) ? it.cur.toFixed(2) + '%' : '—';
        var t = it.ticker;
        var rows = [
            ['Код (ISIN)', '<span class="drb-od-code" onclick="event.stopPropagation();copyTickerNew(\'' + esc(t) + '\')">' + esc(t) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>'],
            ['Текущая цена', it.price.toFixed(2) + ' ₽'],
            ['НКД', it.nkd.toFixed(2) + ' ₽'],
            ['Итого (цена + НКД)', '<b>' + it.total.toFixed(2) + ' ₽</b>'],
            ['Погашение', dfmt(d.matDate)],
            ['Размер купона', (d.couponValue != null ? d.couponValue : '—') + ' ₽'],
            ['Ближайший купон', dfmt(d.nextCoupon)],
            ['Текущая купонная доходность', '<span style="color:#16b56b">' + cur + '</span>'],
            ['Выплат в год', (d.freq != null ? d.freq : '—')]
        ];
        var detailRows = rows.map(function(r) {
            return '<div class="drb-od-row"><span class="drb-od-l">' + r[0] + '</span><span class="drb-od-v">' + r[1] + '</span></div>';
        }).join('');
        return '<div class="drb-ofz" id="dofz-' + esc(t) + '">' +
            '<button class="drb-item drb-ofz-sum" onclick="dashToggleOfz(\'' + esc(t) + '\')">' +
                '<span class="drb-rank">' + (i + 1) + '</span>' +
                '<span class="drb-info"><span class="drb-ticker">' + esc(it.name) + '</span><span class="drb-tsub">' + it.total.toFixed(2) + ' ₽</span></span>' +
                '<span class="drb-metric">' + esc(metric) + '</span>' +
                '<svg class="drb-go drb-ofz-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
            '</button>' +
            '<div class="drb-ofz-det"><div class="drb-od-list">' + detailRows + '</div>' +
                '<button class="drb-od-chart" onclick="event.stopPropagation();openTradingViewDirect(\'' + esc(t) + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Открыть график</button>' +
            '</div>' +
        '</div>';
    }

    function renderRebal() {
        var host = dq('dash2Rebal');
        if (!host) return;
        var ofz = ofzList();
        var stocks = topStocks(6);

        var ready = ofz.length || stocks.length;
        if (!ready && rebalRetries < 8) {
            rebalRetries++;
            host.innerHTML = '<div class="drb-title">Лучшее для ребаланса</div><div class="drb-loading"><span class="drb-spin"></span>Загрузка рыночных данных…</div>';
            if (currentTab === 'dashboard') setTimeout(renderRebal, 700);
            return;
        }

        var ofzRows = ofz.length ? ofz.map(function(it, i) {
            var metric = rebalSort.bond === 'coupon'
                ? (isFinite(it.cur) ? it.cur.toFixed(2) + '%' : '—')
                : (isFinite(it.ytm) ? it.ytm.toFixed(2) + '%' : '—');
            return renderOfzItem(it, i, metric);
        }).join('') : '<div class="drb-empty">нет данных</div>';

        var stockRows = stocks.length ? stocks.map(function(it, i) {
            return '<button class="drb-item" onclick="dashOpenTicker(\'' + esc(it.ticker) + '\',' + it.echelon + ')">' +
                '<span class="drb-rank">' + (i + 1) + '</span>' +
                '<span class="drb-info"><span class="drb-ticker">' + esc(it.ticker) +
                    '<span class="drb-tier tier-' + it.echelon + '">' + (TIERS[it.echelon - 1] || TIERS[0]).roman + '</span></span>' +
                    '<span class="drb-tsub">' + esc(it.name) + '</span></span>' +
                '<span class="drb-metric ' + (/-/.test(it.metric) ? 'neg' : '') + '">' + esc(it.metric) + '</span>' +
                '<svg class="drb-go" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</button>';
        }).join('') : '<div class="drb-empty">нет данных</div>';

        function sortToggle(group, opts) {
            return '<div class="drb-sort">' + opts.map(function(o) {
                return '<button class="drb-sort-btn' + (rebalSort[group] === o.k ? ' active' : '') + '" onclick="' +
                    (group === 'bond' ? 'dashSetBondSort' : 'dashSetStockSort') + '(\'' + o.k + '\')">' + o.t + '</button>';
            }).join('') + '</div>';
        }

        host.innerHTML =
            '<div class="drb-title">Лучшее для ребаланса <span class="drb-sub">нажмите на тикер — детали</span></div>' +
            '<div class="drb-cols">' +
                '<div class="drb-col">' +
                    '<div class="drb-col-head"><span class="drb-dot" style="--c:#5B7C99"></span><span class="drb-col-name">Облигации · ОФЗ</span>' +
                        sortToggle('bond', [{ k: 'yield', t: 'Доходность' }, { k: 'coupon', t: 'Купонная' }]) +
                    '</div>' + ofzRows +
                '</div>' +
                '<div class="drb-col">' +
                    '<div class="drb-col-head"><span class="drb-dot" style="--c:#D97757"></span><span class="drb-col-name">Акции</span>' +
                        sortToggle('stock', [{ k: 'potential', t: 'Потенциал' }, { k: 'echelon', t: 'Эшелон' }]) +
                    '</div>' + stockRows +
                '</div>' +
            '</div>';
    }

    window.dashSetBondSort = function(m) { if (rebalSort.bond === m) return; rebalSort.bond = m; renderRebal(); };
    window.dashSetStockSort = function(m) { if (rebalSort.stock === m) return; rebalSort.stock = m; renderRebal(); };

    // Инлайн-раскрытие деталей ОФЗ (одно открыто за раз)
    window.dashToggleOfz = function(ticker) {
        var item = dq('dofz-' + ticker);
        if (!item) return;
        var open = item.classList.contains('open');
        var host = dq('dash2Rebal');
        if (host) Array.prototype.forEach.call(host.querySelectorAll('.drb-ofz.open'), function(el) { el.classList.remove('open'); });
        if (!open) item.classList.add('open');
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.selectionChanged();
        }
    };

    // ====================================================================
    //  КЛИК ПО АКЦИИ → выезжающая панель справа (как в ребалансе)
    // ====================================================================
    window.dashOpenTicker = function(ticker, echelon) {
        if (typeof openStockDetail === 'function') openStockDetail(ticker, echelon || 1);
        else if (typeof goToCompanyPageFromTicker === 'function') goToCompanyPageFromTicker(ticker);
    };

    // ====================================================================
    //  ГЛАВНЫЙ РЕНДЕР
    // ====================================================================
    function renderDashboard() {
        rebalRetries = 0;
        renderLiveBar();
        renderPortfolio();
        renderRates();
        renderFavorites();
        renderRebal();
        ensureClock();
    }
    window.renderDashboard = renderDashboard;

    // Пересчёт на других вкладках тоже обновляет сохранённый снапшот
    if (typeof window.calculateAndShowPortfolio === 'function') {
        var _origCalc = window.calculateAndShowPortfolio;
        window.calculateAndShowPortfolio = function() {
            var r = _origCalc.apply(this, arguments);
            setTimeout(function() { var s = dashCaptureLive(); if (s) dashSaveSnapshot(s); }, 250);
            return r;
        };
    }
})();
