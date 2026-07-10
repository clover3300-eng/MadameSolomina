// ===== DESKTOP DASHBOARD (домик → дашборд) =====
// Полностью собранная вкладка «Главная»:
//  • верхняя LIVE-полоска с рыночными данными (IMOEX / USD / BTC) + часы МСК
//  • сохранённый портфель (живёт в localStorage, переживает перезагрузку)
//  • пересчёт прямо здесь — кнопка раскрывает выбор стратегии и комиссии
//  • вертикальные рекомендации для ребаланса: ОФЗ и акции по эшелонам
//  • клик по тикеру → выезжающая справа панель о компании / облигации
//  • полоса ставок рынка (ключевая, вклады, инфляция, ОФЗ 10 лет) — как на «Портфелях»
(function() {
    'use strict';

    var SNAP_KEY = 'dash_portfolio_v1';
    var rebalRetries = 0;
    var clockTimer = null;

    function dq(id) { return document.getElementById(id); }
    function txt(id, fb) { var e = dq(id); return e ? (e.textContent || '').trim() : (fb == null ? '—' : fb); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    }); }
    // Для данных внутри JS-строки inline-обработчика (onclick="fn('X')"):
    // браузер декодирует &#39; обратно в кавычку ДО исполнения JS, поэтому
    // одного esc() мало — сначала экранируем для JS (\\ и \'), затем esc().
    function jsArg(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
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
    //  РЫНОЧНАЯ ЛЕНТА В ШАПКЕ САЙТА (бывшая тёмная LIVE-полоска #dash2LiveBar на
    //  странице) — тонкой строкой вшита прямо в топ-бар (#topBarDashMarket, между
    //  брендом/разделом «Главная» и панелью действий), без своего бокса. Общий
    //  класс/стили .topbar-tab-market и .tbmk-* — см. css/portfolios.css (там же
    //  их аналог для вкладки «Портфели», откуда и перекочевал этот паттерн).
    // ====================================================================
    function topBarDashMarketHtml() {
        var tiles = [
            { k: 'imoex', label: 'IMOEX' },
            { k: 'usd',   label: 'USD/RUB' },
            { k: 'btc',   label: 'BTC' }
        ];
        return '<span class="tbmk-dot"></span>' + tiles.map(function (t, i) {
            var go = t.k === 'imoex';
            return (i ? '<span class="tbmk-sep">·</span>' : '') +
                '<span class="tbmk-item' + (go ? ' tbmk-go' : '') + '"' +
                (go ? ' role="button" tabindex="0" title="Открыть вкладку «Рынок»" onclick="switchTab(\'market\')"' : '') + '>' +
                '<span class="tbmk-k">' + esc(t.label) + '</span>' +
                '<span class="tbmk-v" id="tbmkd-v-' + t.k + '">—</span>' +
                '<span class="tbmk-c" id="tbmkd-c-' + t.k + '"></span></span>';
        }).join('');
    }
    function renderTopBarDashMarket() {
        var host = dq('topBarDashMarket'); if (!host) return;
        host.innerHTML = topBarDashMarketHtml();
        host.style.display = 'flex';
    }
    function hideTopBarDashMarket() {
        var host = dq('topBarDashMarket'); if (!host) return;
        host.style.display = 'none'; host.innerHTML = '';
    }

    // Обновление значений ленты без полной перерисовки (раз в секунду)
    function tickLiveBar() {
        [['imoex','val-imoex','dyn-imoex'], ['usd','val-usdrub','dyn-usdrub'], ['btc','val-btc','dyn-btc']].forEach(function(p) {
            var v = dq('tbmkd-v-' + p[0]);
            var c = dq('tbmkd-c-' + p[0]);
            var srcV = dq(p[1]);
            var srcD = dq(p[2]);
            if (v && srcV) { var s = (srcV.textContent || '').trim(); if (s) v.textContent = s; }
            if (c && srcD) {
                var t = (srcD.textContent || '').trim();
                c.textContent = t;
                c.className = 'tbmk-c ' + (srcD.classList.contains('negative') ? 'neg' : (srcD.classList.contains('positive') ? 'pos' : 'flat'));
            }
        });
    }

    function ensureClock() {
        if (clockTimer) return;
        clockTimer = setInterval(function() {
            if (currentTab === 'dashboard' && dq('tbmkd-v-imoex')) tickLiveBar();
        }, 1000);
    }

    // ====================================================================
    //  ПАНЕЛЬ ДЕЙСТВИЙ В ШАПКЕ САЙТА (Новый расчёт / Ребаланс) — была
    //  d3-head-actions прямо на странице, теперь в #topBarDashActions
    // ====================================================================
    function renderTopBarDashActions() {
        var host = dq('topBarDashActions'); if (!host) return;
        host.innerHTML =
            '<button class="d3-quick" onclick="switchTab(\'calc\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
                '<span>Новый расчёт</span></button>' +
            '<button class="d3-quick ghost" onclick="switchTab(\'rebalance\')">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
                '<span>Ребаланс</span></button>';
        host.style.display = 'flex';
    }
    function hideTopBarDashActions() {
        var host = dq('topBarDashActions'); if (!host) return;
        host.style.display = 'none'; host.innerHTML = '';
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
            var holdCount = 0;
            if (snap.composition) holdCount = ((snap.composition.bonds || []).length) + ((snap.composition.stocks || []).length);
            var statsHtml =
                '<div class="dp-stats">' +
                    '<div class="dp-stat"><div class="dp-stat-l">Стратегия</div><div class="dp-stat-v">' + esc(snap.strategy || '—') + '</div></div>' +
                    '<div class="dp-stat"><div class="dp-stat-l">Комиссия</div><div class="dp-stat-v">' + esc(snap.fee || '—') + '</div></div>' +
                    '<div class="dp-stat"><div class="dp-stat-l">Бумаг</div><div class="dp-stat-v">' + (holdCount || '—') + '</div></div>' +
                '</div>';
            summaryHtml =
                '<div class="dp-top">' +
                    '<div class="dp-top-l">' +
                        '<div class="dp-eyebrow">Текущий капитал</div>' +
                        '<div class="dp-capital">' + esc(bindRub(snap.cap)) + '</div>' +
                        '<div class="dp-forecast">' +
                            '<span class="dp-fc-label">Прогноз 3 года</span>' +
                            '<span class="dp-fc-row"><span class="dp-fc-total">' + esc(bindRub(snap.fcTotal)) + '</span>' +
                            (snap.fcPct ? '<span class="dp-fc-pct ' + (/-/.test(snap.fcPct) ? 'neg' : '') + '">' + esc(snap.fcPct) + '</span>' : '') + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="dp-ring-wrap">' +
                        '<div class="dp-ring" style="--bp:' + bondNum + '">' +
                            '<div class="dp-ring-center"><span class="dp-ring-c-top">Баланс</span><span class="dp-ring-c-val">' + bondNum + '/' + (100 - bondNum) + '</span></div>' +
                        '</div>' +
                        '<div class="dp-legend">' +
                            '<div class="dp-leg"><span class="dp-dot bond"></span><span class="dp-leg-name">ОФЗ</span><span class="dp-leg-pct">' + esc(snap.bondPct) + '</span><span class="dp-leg-sum">' + esc(bindRub(snap.bondSum)) + '</span></div>' +
                            '<div class="dp-leg"><span class="dp-dot stock"></span><span class="dp-leg-name">Акции</span><span class="dp-leg-pct">' + esc(snap.stockPct) + '</span><span class="dp-leg-sum">' + esc(bindRub(snap.stockSum)) + '</span></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                statsHtml;
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
            '<button class="dp-recalc-toggle' + (recalc.open ? ' open' : '') + '" onclick="dashToggleRecalc()">' +
                '<span class="dp-rt-left"><svg viewBox="0 0 24 24">' + ICONS.recalc + '</svg>' + (snap ? 'Пересчитать портфель' : 'Сформировать портфель') + '</span>' +
                '<svg class="dp-rt-chev" viewBox="0 0 24 24">' + ICONS.chevron + '</svg>' +
            '</button>' +
            renderRecalcPanel(snap);

        bindRecalcInputs();
        if (snap) requestAnimationFrame(dashFitBigNumbers);   // подгонка крупных сумм под ширину
    }

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
            return '<button class="dp-chip' + (sel ? ' sel' : '') + '" onclick="dashPickStrategy(' + s.bonds + ',\'' + jsArg(s.title) + '\')">' +
                '<span class="dp-chip-t">' + esc(s.title) + '</span><span class="dp-chip-s">' + esc(sub) + '</span></button>';
        }).join('');

        var feeChips = FEE_OPTS.map(function(f) {
            var sel = !recalc.customFee && Math.abs(recalc.fee - f.v) < 1e-9;
            return '<button class="dp-fchip' + (sel ? ' sel' : '') + '" onclick="dashPickFee(' + f.v + ',\'' + f.t + '\')">' + f.t + '</button>';
        }).join('');

        var isCustomStrat = recalc.strat === 'Своя';
        var stockPct = 100 - recalc.bondPct;

        return '<div class="dp-recalc-panel' + (recalc.open ? ' open' : '') + '" id="dashRecalcPanel">' +
            '<div class="dp-rc-head"><svg viewBox="0 0 24 24">' + ICONS.recalc + '</svg><span>Параметры пересчёта</span></div>' +
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
    function dashSyncRecalcOpenClass() {
        var card = dq('dash2Portfolio');
        if (card) card.classList.toggle('recalc-open', recalc.open);
    }
    function dashRecalcOutside(e) {
        var card = dq('dash2Portfolio');
        if (card && card.contains(e.target)) return;   // клики внутри карточки/панели — не закрываем
        recalc.open = false;
        renderPortfolio();
        dashSyncRecalcOpenClass();
        document.removeEventListener('mousedown', dashRecalcOutside);
    }
    window.dashToggleRecalc = function() {
        recalc.open = !recalc.open;
        renderPortfolio();
        dashSyncRecalcOpenClass();
        if (recalc.open) {
            setTimeout(function() { document.addEventListener('mousedown', dashRecalcOutside); }, 0);
        } else {
            document.removeEventListener('mousedown', dashRecalcOutside);
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
            dashSyncRecalcOpenClass();
            document.removeEventListener('mousedown', dashRecalcOutside);
            renderHoldings();   // обновляем состав сразу после пересчёта
            requestAnimationFrame(dashSyncTopRowHeights);
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

    // Копирование текста в буфер (с фолбэком) + тост
    function dashCopyText(text, okMsg) {
        function ok() { dashToast(okMsg || 'Скопировано'); }
        function fallback() {
            try {
                var ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta); ok();
            } catch (e) { dashToast('Не удалось скопировать', true); }
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
            else fallback();
        } catch (e) { fallback(); }
    }

    // ====================================================================
    //  ИЗБРАННОЕ (звёздочки из раздела «Рынок · Акции»)
    // ====================================================================
    function loadFavsRaw() {
        try { var a = JSON.parse(localStorage.getItem('stk_fav_v1')); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }

    // Форматирование потенциала роста (колонка ОДХС / target)
    function fmtPotential(raw) {
        if (raw == null || raw === '') return null;
        var n = toNum(raw);
        if (!isFinite(n)) return null;
        return { metric: (n >= 0 ? '+' : '') + n.toFixed(1) + '%', neg: n < 0 };
    }
    // Потенциал из таблицы акций (колонка ОДХС)
    function stkPotential(tk) {
        if (typeof window.stkFindCompany !== 'function') return null;
        var co = window.stkFindCompany(tk);
        if (!co || !co.main) return null;
        return fmtPotential(co.main['ОДХС']);
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
            if (co) { var p = co.main ? fmtPotential(co.main['ОДХС']) : null;
                return { name: co.name || tk, echelon: 0, metric: p ? p.metric : '', neg: p ? p.neg : false }; }
        }
        return { name: tk, echelon: 0, metric: '', neg: false };
    }

    // Для избранного потенциал берём ПРЕЖДЕ ВСЕГО из колонки ОДХС таблицы акций
    function resolveFavMeta(tk) {
        var base = resolveTickerMeta(tk);
        var p = stkPotential(tk);
        if (p) { base.metric = p.metric; base.neg = p.neg; }
        return base;
    }

    var favExpanded = false;
    var ICO_COPY = '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
    var ICO_EXPAND = '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
    var ICO_CLOSE = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';

    function favRowHtml(tk) {
        var meta = resolveFavMeta(tk);
        var metric = meta.metric
            ? '<span class="dfv-metric ' + (meta.neg ? 'neg' : '') + '">' + esc(meta.metric) + '</span>'
            : '<span class="dfv-metric muted">—</span>';
        return '<div class="dfv-item" onclick="dashOpenFav(\'' + jsArg(tk) + '\',' + (meta.echelon || 1) + ')">' +
            '<span class="dfv-info"><span class="dfv-tk">' + esc(tk) + '</span>' +
                '<span class="dfv-name">' + esc(meta.name) + '</span></span>' +
            metric +
            '<button class="dfv-x" title="Убрать из избранного" onclick="event.stopPropagation();dashUnfav(\'' + jsArg(tk) + '\')">' +
                '<svg viewBox="0 0 24 24">' + ICO_CLOSE + '</svg></button>' +
        '</div>';
    }

    // Единый список избранного: акции (stk_fav_v1) + облигации (bnd_fav_v1).
    // Каждый элемент { id, type } — id для акции это тикер, для облигации ISIN.
    function getFavItems() {
        var items = [];
        var stk = (typeof window.stkGetFavorites === 'function') ? window.stkGetFavorites() : loadFavsRaw();
        stk.forEach(function (tk) { items.push({ id: tk, type: 'stock' }); });
        if (typeof window.bndGetFavorites === 'function') {
            window.bndGetFavorites().forEach(function (isin) { items.push({ id: isin, type: 'bond' }); });
        }
        return items;
    }
    function favItemHtml(item) {
        return item.type === 'bond' ? favBondRowHtml(item.id) : favRowHtml(item.id);
    }
    // Строка избранной облигации: название + ISIN + среднегодовая доходность.
    function favBondRowHtml(isin) {
        var b = (typeof window.bndFindBond === 'function') ? window.bndFindBond(isin) : null;
        var nm = b ? b.name : isin;
        var yld = (b && b.main) ? String(b.main['Среднегодовая Простая Доходность'] || '').trim() : '';
        var metric = yld
            ? '<span class="dfv-metric">' + esc(yld) + '</span>'
            : '<span class="dfv-metric muted">—</span>';
        return '<div class="dfv-item" onclick="dashOpenFavBond(\'' + jsArg(isin) + '\')">' +
            '<span class="dfv-info"><span class="dfv-tk">' + esc(nm) + '</span>' +
                '<span class="dfv-name">' + esc(isin) + '</span></span>' +
            metric +
            '<button class="dfv-x" title="Убрать из избранного" onclick="event.stopPropagation();dashUnfavBond(\'' + jsArg(isin) + '\')">' +
                '<svg viewBox="0 0 24 24">' + ICO_CLOSE + '</svg></button>' +
        '</div>';
    }

    function renderFavorites() {
        var host = dq('dash2Fav');
        if (!host) return;
        var favs = getFavItems();
        host.className = 'dash2-card dash2-fav' + (favExpanded ? ' fav-open' : '');

        // ----- пустое состояние (новый дизайн) -----
        if (!favs.length) {
            favExpanded = false;
            host.innerHTML =
                '<div class="dfv-head"><div class="dfv-title">Избранное</div></div>' +
                '<div class="dfv-empty">' +
                    '<div class="dfv-empty-art"><span class="dfv-empty-glow"></span>' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
                    '</div>' +
                    '<div class="dfv-empty-title">Список избранного пуст</div>' +
                    '<div class="dfv-empty-text">Отмечайте акции звёздочкой ★ в таблице — и следите за их потенциалом роста здесь.</div>' +
                    '<button class="dfv-empty-btn" onclick="switchTab(\'market-stocks\')">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 20 7"/></svg>' +
                        'Открыть таблицу акций</button>' +
                '</div>';
            return;
        }

        var actions = '<div class="dfv-actions">' +
            '<button class="dfv-act" title="Скопировать список" onclick="event.stopPropagation();dashCopyFavs()"><svg viewBox="0 0 24 24">' + ICO_COPY + '</svg></button>' +
            '<button class="dfv-act" title="Развернуть весь список" onclick="event.stopPropagation();dashToggleFavExpand()"><svg viewBox="0 0 24 24">' + ICO_EXPAND + '</svg></button>' +
        '</div>';
        var head = '<div class="dfv-head"><div class="dfv-title">Избранное</div><span class="dfv-count">' + favs.length + '</span>' + actions + '</div>';
        var colhead = '<div class="dfv-colhead"><span>Тикер</span><span>Потенциал</span></div>';
        var rows = favs.map(favItemHtml).join('');
        var footLink = '<button class="dfv-foot-link" onclick="switchTab(\'market-stocks\')">Все акции в таблице<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></button>';

        var overlay =
            '<div class="dfv-overlay' + (favExpanded ? ' open' : '') + '" id="favOverlay">' +
                '<div class="dfv-ov-head"><div class="dfv-title">Избранное<span class="dfv-count">' + favs.length + '</span></div>' +
                    '<div class="dfv-actions">' +
                        '<button class="dfv-act" title="Скопировать список" onclick="event.stopPropagation();dashCopyFavs()"><svg viewBox="0 0 24 24">' + ICO_COPY + '</svg></button>' +
                        '<button class="dfv-act" title="Свернуть" onclick="event.stopPropagation();dashToggleFavExpand()"><svg viewBox="0 0 24 24">' + ICO_CLOSE + '</svg></button>' +
                    '</div>' +
                '</div>' + colhead +
                '<div class="dfv-ov-list">' + rows + '</div>' +
            '</div>';

        host.innerHTML = head + colhead + '<div class="dfv-list">' + rows + '</div>' + footLink + overlay;
    }

    window.dashToggleFavExpand = function() {
        favExpanded = !favExpanded;
        var ov = dq('favOverlay'), card = dq('dash2Fav');
        if (ov) ov.classList.toggle('open', favExpanded);
        if (card) card.classList.toggle('fav-open', favExpanded);
        if (favExpanded) setTimeout(function() { document.addEventListener('mousedown', dashFavOutside); }, 0);
        else document.removeEventListener('mousedown', dashFavOutside);
    };
    function dashFavOutside(e) {
        var card = dq('dash2Fav');
        if (card && card.contains(e.target)) return;
        favExpanded = false;
        var ov = dq('favOverlay'); if (ov) ov.classList.remove('open');
        if (card) card.classList.remove('fav-open');
        document.removeEventListener('mousedown', dashFavOutside);
    }
    window.dashCopyFavs = function() {
        // Копируем с разделением на облигации и акции. Облигации из таблицы
        // терминала (type:'bond') → по названию; тикеры из старого списка
        // облигаций (findBondByT) → тоже «Облигации», остальное → «Акции».
        var items = getFavItems();
        var bondsArr = [], stocksArr = [];
        items.forEach(function(it) {
            if (it.type === 'bond') {
                var b = (typeof window.bndFindBond === 'function') ? window.bndFindBond(it.id) : null;
                bondsArr.push(b ? b.name : it.id);
            } else {
                (findBondByT(it.id) ? bondsArr : stocksArr).push(it.id);
            }
        });
        var lines = [];
        if (bondsArr.length) { lines.push('Облигации'); bondsArr.forEach(function(t) { lines.push(t); }); }
        if (stocksArr.length) { if (lines.length) lines.push(''); lines.push('Акции'); stocksArr.forEach(function(t) { lines.push(t); }); }
        dashCopyText(lines.join('\n'), items.length + ' ' + plural(items.length, 'тикер', 'тикера', 'тикеров') + ' скопировано');
    };

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
        dashSyncTopRowHeights();
    };
    // Клик по избранной облигации — открыть вкладку «Облигации»
    window.dashOpenFavBond = function(isin) {
        if (typeof switchTab === 'function') switchTab('market-bonds');
    };
    // Убрать облигацию из избранного (через API модуля облигаций)
    window.dashUnfavBond = function(isin) {
        if (typeof window.bndToggleFav === 'function') window.bndToggleFav(isin);
        renderFavorites();
        dashSyncTopRowHeights();
    };

    // ====================================================================
    //  СОСТАВ ПОРТФЕЛЯ (holdings) — отдельная полоса вне карточки
    // ====================================================================
    function fmtSum(n) { n = Math.round(Number(n) || 0); return n.toLocaleString('ru-RU').replace(/\s/g, '.') + ' ₽'; }
    // Привязываем символ ₽ к числу неразрывным пробелом, чтобы он не переносился на новую строку
    function bindRub(s) { return String(s == null ? '' : s).replace(/\s*₽/g, ' ₽'); }

    function findBondByT(t) {
        if (typeof bonds !== 'undefined' && bonds) for (var i = 0; i < bonds.length; i++) if (bonds[i].t === t) return bonds[i];
        return null;
    }
    // Детали облигации (как в «Лучшее для ребаланса»)
    function holdBondDetailHtml(t) {
        var b = findBondByT(t);
        var d = (typeof bondDetailsMap !== 'undefined' && bondDetailsMap[t]) ? bondDetailsMap[t] : {};
        var price = b ? (parseFloat(String(b.p).replace(',', '.')) || 0) : 0;
        var nkd = b ? (parseFloat(b.nkd || 0) || 0) : 0;
        var total = price + nkd;
        var cur = (d.couponValue > 0 && d.freq > 0 && price > 0) ? ((d.couponValue * d.freq / price * 100).toFixed(2) + '%') : '—';
        var rows = [
            ['Код (ISIN)', '<span class="drb-od-code" onclick="event.stopPropagation();copyTickerNew(\'' + jsArg(t) + '\')">' + esc(t) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>'],
            ['Текущая цена', price ? price.toFixed(2) + ' ₽' : '—'],
            ['НКД', nkd.toFixed(2) + ' ₽'],
            ['Итого (цена + НКД)', '<b>' + total.toFixed(2) + ' ₽</b>'],
            ['Погашение', dfmt(d.matDate)],
            ['Размер купона', (d.couponValue != null ? d.couponValue : '—') + ' ₽'],
            ['Ближайший купон', dfmt(d.nextCoupon)],
            ['Текущая купонная доходность', '<span style="color:#16b56b">' + cur + '</span>'],
            ['Выплат в год', (d.freq != null ? d.freq : '—')]
        ];
        var dr = rows.map(function(r) { return '<div class="drb-od-row"><span class="drb-od-l">' + r[0] + '</span><span class="drb-od-v">' + r[1] + '</span></div>'; }).join('');
        return '<div class="drb-od-list">' + dr + '</div>' +
            '<button class="drb-od-chart" onclick="event.stopPropagation();openTradingViewDirect(\'' + jsArg(t) + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Открыть график</button>';
    }

    // Одна строка состава: облигация раскрывается inline, акция открывает карточку
    function holdRowHtml(it, kind, grand) {
        var ac = kind === 'bond' ? '#5B7C99' : '#D97757';
        var w = Math.max(2, Math.round((it.sum || 0) / grand * 100));
        var sub = '<span class="d3h-r-sub"><span class="d3h-r-w">' + w + '%</span>' + (it.qty ? '<span>·</span><span>' + it.qty + ' шт</span>' : '');
        if (kind === 'bond') {
            return '<button class="d3h-row d3h-row-bond" style="--ac:' + ac + ';--w:' + w + '%" onclick="dashOpenBondCard(\'' + jsArg(it.ticker) + '\')">' +
                '<span class="d3h-r-main"><span class="d3h-r-tk">' + esc(it.ticker) + '</span><span class="d3h-r-name">' + esc(it.name || it.ticker) + '</span></span>' +
                '<span class="d3h-r-side"><span class="d3h-r-sum">' + fmtSum(it.sum) + '</span>' + sub + '</span></span>' +
                '<svg class="d3h-go" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</button>';
        }
        var meta = resolveTickerMeta(it.ticker);
        var tier = it.echelon ? '<span class="drb-tier tier-' + it.echelon + '">' + ((TIERS[it.echelon - 1] || TIERS[0]).roman) + '</span>' : '';
        var pot = meta.metric ? '<span class="d3h-r-pot ' + (meta.neg ? 'neg' : '') + '">' + esc(meta.metric) + '</span>' : '';
        return '<button class="d3h-row" style="--ac:' + ac + ';--w:' + w + '%" onclick="dashOpenTicker(\'' + jsArg(it.ticker) + '\',' + (it.echelon || 1) + ')">' +
            '<span class="d3h-r-main"><span class="d3h-r-tk">' + esc(it.ticker) + tier + '</span><span class="d3h-r-name">' + esc(it.name || it.ticker) + '</span></span>' +
            '<span class="d3h-r-side"><span class="d3h-r-sum">' + fmtSum(it.sum) + '</span>' + sub + pot + '</span></span>' +
            '<svg class="d3h-go" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</button>';
    }

    function holdGroupsHtml(bondsArr, stocksArr, grand) {
        var g = '';
        if (bondsArr.length) g += '<div class="d3h-grp"><span class="dp-dot bond"></span>Облигации · ОФЗ <b>' + bondsArr.length + '</b></div>' +
            bondsArr.map(function(b) { return holdRowHtml(b, 'bond', grand); }).join('');
        if (stocksArr.length) g += '<div class="d3h-grp"><span class="dp-dot stock"></span>Акции <b>' + stocksArr.length + '</b></div>' +
            stocksArr.map(function(s) { return holdRowHtml(s, 'stock', grand); }).join('');
        return g;
    }

    var holdExpanded = false;
    function renderHoldings() {
        var host = dq('dash2Holdings');
        if (!host) return;
        host.className = 'dash2-card dash2-holdings' + (holdExpanded ? ' hold-open' : '');

        var snap = (window.isPortfolioCalculated ? dashCaptureLive() : null) || dashLoadSnapshot();
        var c = snap && snap.composition;
        var bondsArr = (c && c.bonds) || [], stocksArr = (c && c.stocks) || [];
        var total = bondsArr.length + stocksArr.length;

        if (!total) {
            holdExpanded = false;
            host.innerHTML =
                '<div class="d3h-head"><div class="d3h-title">Состав портфеля</div></div>' +
                '<div class="d3h-empty">' +
                    '<div class="d3h-empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>' +
                    '<div class="d3h-empty-text">Здесь появится состав рассчитанного портфеля — облигации и акции с их долями.</div>' +
                '</div>';
            return;
        }

        var grand = 0;
        bondsArr.concat(stocksArr).forEach(function(x) { grand += (x.sum || 0); });
        if (!grand) grand = 1;

        var groups = holdGroupsHtml(bondsArr, stocksArr, grand);
        var note = stocksArr.length
            ? '<div class="d3h-foot-note"><b>%</b> — доля бумаги · цветной <b>%</b> — потенциал · <b>I–IV</b> — эшелон</div>'
            : '<div class="d3h-foot-note"><b>%</b> — доля бумаги в портфеле</div>';

        var actions = '<div class="d3h-actions">' +
            '<button class="d3h-act" title="Скопировать состав" onclick="event.stopPropagation();dashCopyHoldings()"><svg viewBox="0 0 24 24">' + ICO_COPY + '</svg></button>' +
            '<button class="d3h-act" title="Развернуть весь состав" onclick="event.stopPropagation();dashToggleHoldExpand()"><svg viewBox="0 0 24 24">' + ICO_EXPAND + '</svg></button>' +
        '</div>';
        var metaHtml = '<div class="d3h-meta"><span>' + total + ' ' + plural(total, 'бумага', 'бумаги', 'бумаг') + '</span><b>' + fmtSum(grand) + '</b></div>';

        var overlay =
            '<div class="d3h-overlay' + (holdExpanded ? ' open' : '') + '" id="holdOverlay">' +
                '<div class="d3h-ov-head"><div class="d3h-title">Состав портфеля</div>' + metaHtml +
                    '<div class="d3h-actions">' +
                        '<button class="d3h-act" title="Скопировать состав" onclick="event.stopPropagation();dashCopyHoldings()"><svg viewBox="0 0 24 24">' + ICO_COPY + '</svg></button>' +
                        '<button class="d3h-act" title="Свернуть" onclick="event.stopPropagation();dashToggleHoldExpand()"><svg viewBox="0 0 24 24">' + ICO_CLOSE + '</svg></button>' +
                    '</div>' +
                '</div>' +
                '<div class="d3h-ov-list">' + groups + '</div>' + note +
            '</div>';

        host.innerHTML =
            '<div class="d3h-head"><div class="d3h-title">Состав портфеля</div>' + metaHtml + actions + '</div>' +
            '<div class="d3h-scroll">' + groups + '</div>' +
            note + overlay +
            '<div class="d3h-overlay d3h-bondpop" id="bondPop"></div>';
    }

    // Карточка облигации — раскрывается ПОВЕРХ контента (а не внутри бокса)
    window.dashOpenBondCard = function(t) {
        var pop = dq('bondPop'); if (!pop) return;
        var b = findBondByT(t);
        pop.innerHTML =
            '<div class="d3h-ov-head"><div class="d3h-title">' + esc(b ? (b.n || t) : t) + '</div>' +
                '<div class="d3h-actions"><button class="d3h-act" title="Закрыть" onclick="event.stopPropagation();dashCloseBondCard()"><svg viewBox="0 0 24 24">' + ICO_CLOSE + '</svg></button></div>' +
            '</div>' +
            '<div class="d3h-bondpop-body">' + holdBondDetailHtml(t) + '</div>';
        pop.classList.add('open');
        var card = dq('dash2Holdings'); if (card) card.classList.add('hold-open');
        setTimeout(function() { document.addEventListener('mousedown', dashBondPopOutside); }, 0);
    };
    window.dashCloseBondCard = function() {
        var pop = dq('bondPop'); if (pop) pop.classList.remove('open');
        var card = dq('dash2Holdings'); if (card && !holdExpanded) card.classList.remove('hold-open');
        document.removeEventListener('mousedown', dashBondPopOutside);
    };
    function dashBondPopOutside(e) {
        var pop = dq('bondPop');
        if (pop && pop.contains(e.target)) return;          // клик внутри карточки облигации
        if (e.target.closest && e.target.closest('.d3h-row-bond')) return;  // клик по другой облигации — переоткроется
        window.dashCloseBondCard();
    }
    window.dashToggleHoldExpand = function() {
        holdExpanded = !holdExpanded;
        var ov = dq('holdOverlay'), card = dq('dash2Holdings');
        if (ov) ov.classList.toggle('open', holdExpanded);
        if (card) card.classList.toggle('hold-open', holdExpanded);
        if (holdExpanded) setTimeout(function() { document.addEventListener('mousedown', dashHoldOutside); }, 0);
        else document.removeEventListener('mousedown', dashHoldOutside);
    };
    function dashHoldOutside(e) {
        var card = dq('dash2Holdings');
        if (card && card.contains(e.target)) return;
        holdExpanded = false;
        var ov = dq('holdOverlay'); if (ov) ov.classList.remove('open');
        if (card) card.classList.remove('hold-open');
        document.removeEventListener('mousedown', dashHoldOutside);
    }
    window.dashCopyHoldings = function() {
        var snap = (window.isPortfolioCalculated ? dashCaptureLive() : null) || dashLoadSnapshot();
        var c = snap && snap.composition;
        if (!c) return;
        // Копируем ТОЛЬКО тикеры, с разделением на облигации и акции.
        var lines = [];
        if (c.bonds && c.bonds.length) { lines.push('Облигации'); c.bonds.forEach(function(b) { lines.push(b.ticker); }); }
        if (c.stocks && c.stocks.length) { if (lines.length) lines.push(''); lines.push('Акции'); c.stocks.forEach(function(s) { lines.push(s.ticker); }); }
        dashCopyText(lines.join('\n'), 'Состав портфеля скопирован');
    };

    // ====================================================================
    //  СТАВКИ РЫНКА — горизонтальная полоса плиток (как на вкладке «Портфели»)
    // ====================================================================
    function rateTiles() {
        var rd = window.ratesData || (typeof ratesData !== 'undefined' ? ratesData : {});
        function rv(id, fb) { var e = dq(id); var t = e ? (e.textContent || '').trim() : '';
            if (t && /\d/.test(t) && t.indexOf('---') < 0) return t; if (fb != null && /\d/.test(String(fb))) return fb; return t || '—'; }
        return [
            { l: 'Ключевая ставка', v: rv('val-key-rate', rd.keyRate), ac: '#119d5c', ic: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>' },
            { l: 'Ставка по вкладам', v: rv('val-deposit-rate', rd.depositRate), ac: '#5B7C99', ic: '<polygon points="12 2 21 7 3 7"/><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="12" y1="18" x2="12" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/>' },
            { l: 'Инфляция, год', v: rv('val-inflation', rd.inflation), ac: '#D97757', ic: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
            { l: 'Доходность ОФЗ 10 лет', v: rv('val-ofz10', rd.ofz10), ac: '#3d6fd1', ic: '<path d="M3 3v18h18"/><polyline points="7 14 11 10 14 13 20 7"/>' }
        ];
    }
    function rateTileHtml(t) {
        return '<div class="drt-tile" style="--ac:' + t.ac + '"><div class="drt-ic"><svg viewBox="0 0 24 24">' + t.ic + '</svg></div>' +
            '<div class="drt-body"><div class="drt-l">' + esc(t.l) + '</div><div class="drt-v">' + esc(t.v) + '</div></div></div>';
    }
    function renderRatesBand() {
        var host = dq('dash2Rates');
        if (!host) return;
        host.innerHTML = '<div class="drt-grid">' + rateTiles().map(rateTileHtml).join('') + '</div>';
    }

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
        return list.slice(0, 6);
    }

    // Квота по эшелонам: 1 из I, 2 из II, 2 из III, 1 из IV (в каждом — лучшие по потенциалу)
    var STOCK_QUOTA = [1, 2, 2, 1];
    function topStocks() {
        if (typeof echelonTableData === 'undefined' || !echelonTableData) return [];
        var picked = [];
        echelonTableData.forEach(function(col, ci) {
            var arr = (col || []).filter(function(a) { return a && a.t; }).map(function(a) {
                var pot = toNum(a.target);
                return { ticker: a.t, name: a.n || a.t, echelon: ci + 1,
                    pot: isFinite(pot) ? pot : -1e9,
                    metric: isFinite(pot) ? ((pot >= 0 ? '+' : '') + pot.toFixed(1) + '%') : '—' };
            });
            arr.sort(function(a, b) { return b.pot - a.pot; });
            picked = picked.concat(arr.slice(0, STOCK_QUOTA[ci] || 0));
        });
        if (rebalSort.stock === 'echelon') picked.sort(function(a, b) { return (a.echelon - b.echelon) || (b.pot - a.pot); });
        else picked.sort(function(a, b) { return b.pot - a.pot; });
        return picked;
    }

    // Строка ОФЗ с инлайн-раскрытием деталей (как во вкладке «Ребаланс»)
    function renderOfzItem(it, i, metric) {
        var d = it.d || {};
        var cur = isFinite(it.cur) ? it.cur.toFixed(2) + '%' : '—';
        var t = it.ticker;
        var rows = [
            ['Код (ISIN)', '<span class="drb-od-code" onclick="event.stopPropagation();copyTickerNew(\'' + jsArg(t) + '\')">' + esc(t) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>'],
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
            '<button class="drb-item drb-ofz-sum" onclick="dashToggleOfz(\'' + jsArg(t) + '\')">' +
                '<span class="drb-rank">' + (i + 1) + '</span>' +
                '<span class="drb-info"><span class="drb-ticker">' + esc(it.name) + '</span><span class="drb-tsub">' + it.total.toFixed(2) + ' ₽</span></span>' +
                '<span class="drb-metric">' + esc(metric) + '</span>' +
                '<svg class="drb-go drb-ofz-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
            '</button>' +
            '<div class="drb-ofz-det"><div class="drb-od-list">' + detailRows + '</div>' +
                '<button class="drb-od-chart" onclick="event.stopPropagation();openTradingViewDirect(\'' + jsArg(t) + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Открыть график</button>' +
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
            return '<button class="drb-item" onclick="dashOpenTicker(\'' + jsArg(it.ticker) + '\',' + it.echelon + ')">' +
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

        var bondMetricLabel = rebalSort.bond === 'coupon' ? 'Купонная дох.' : 'Доходность (YTM)';
        host.innerHTML =
            '<div class="drb-title">Лучшее для ребаланса <span class="drb-sub">нажмите на тикер — детали</span></div>' +
            '<div class="drb-cols">' +
                '<div class="drb-col">' +
                    '<div class="drb-col-head"><span class="drb-dot" style="--c:#5B7C99"></span><span class="drb-col-name">Облигации · ОФЗ</span>' +
                        sortToggle('bond', [{ k: 'yield', t: 'Доходность' }, { k: 'coupon', t: 'Купонная' }]) +
                    '</div>' +
                    '<div class="drb-colsub"><span class="drb-colsub-l">Бумага</span><span class="drb-colsub-r">' + bondMetricLabel + '</span></div>' +
                    ofzRows +
                '</div>' +
                '<div class="drb-col">' +
                    '<div class="drb-col-head"><span class="drb-dot" style="--c:#D97757"></span><span class="drb-col-name">Акции</span>' +
                        sortToggle('stock', [{ k: 'potential', t: 'Потенциал' }, { k: 'echelon', t: 'Эшелон' }]) +
                    '</div>' +
                    '<div class="drb-colsub"><span class="drb-colsub-l">Бумага</span><span class="drb-colsub-r">Потенциал</span></div>' +
                    stockRows +
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
    //  СИНХРОНИЗАЦИЯ ВЫСОТ ВЕРХНЕГО РЯДА
    //  Высоту задаёт блок капитала; состав и избранное подгоняются под него
    //  и скроллятся внутри (а не растягивают строку).
    // ====================================================================
    // Подгоняем размер шрифта крупных сумм (капитал + прогноз) под ширину колонки,
    // чтобы очень большие числа не вылезали за карточку и не налезали на кольцо.
    function dashFitBigNumbers() {
        var host = dq('dash2Portfolio'); if (!host) return;
        var topL = host.querySelector('.dp-top-l'); if (!topL) return;

        // Капитал — блок во всю ширину колонки: переполнение ловим через scrollWidth.
        var capEl = host.querySelector('.dp-capital');
        if (capEl) {
            capEl.style.fontSize = '';                 // вернуть базовый размер из CSS
            var cw = capEl.clientWidth, sw = capEl.scrollWidth;
            if (cw && sw > cw) {
                var b = parseFloat(getComputedStyle(capEl).fontSize) || 38;
                capEl.style.fontSize = Math.max(16, Math.floor(b * cw / sw * 0.97)) + 'px';
            }
        }
        // Прогноз — инлайн-значение рядом с пилюлей %: бюджет = ширина колонки минус пилюля.
        var fcEl = host.querySelector('.dp-fc-total');
        if (fcEl) {
            fcEl.style.fontSize = '';
            var pctEl = host.querySelector('.dp-fc-pct');
            var pctW = pctEl ? pctEl.getBoundingClientRect().width : 0;
            var budget = topL.getBoundingClientRect().width - pctW - 16;
            var w = fcEl.getBoundingClientRect().width;
            if (budget > 0 && w > budget) {
                var bf = parseFloat(getComputedStyle(fcEl).fontSize) || 21;
                fcEl.style.fontSize = Math.max(12, Math.floor(bf * budget / w * 0.97)) + 'px';
            }
        }
    }
    window.dashFitBigNumbers = dashFitBigNumbers;

    function dashSyncTopRowHeights() {
        var cap = dq('dash2Portfolio'), hold = dq('dash2Holdings'), fav = dq('dash2Fav');
        if (!cap) return;
        dashFitBigNumbers();   // сначала подгоняем шрифт сумм (влияет на высоту блока капитала)
        // сброс перед измерением естественной высоты капитала
        if (hold) hold.style.height = '';
        if (fav) fav.style.height = '';
        var threeCol = window.matchMedia('(min-width: 1041px)').matches;
        var twoCol = !threeCol && window.matchMedia('(min-width: 721px)').matches;
        if (!threeCol && !twoCol) return;   // узкий экран — карточки естественной высоты
        var h = cap.offsetHeight;
        if (h <= 0) return;
        if (hold) hold.style.height = h + 'px';                // состав всегда рядом с капиталом
        if (fav && threeCol) fav.style.height = h + 'px';      // избранное — только в 3 колонки
    }
    window.dashSyncTopRowHeights = dashSyncTopRowHeights;

    var _dashResizeT = null;
    window.addEventListener('resize', function() {
        if (currentTab !== 'dashboard') return;
        clearTimeout(_dashResizeT);
        _dashResizeT = setTimeout(dashSyncTopRowHeights, 120);
    });

    // ====================================================================
    //  ГЛАВНЫЙ РЕНДЕР
    // ====================================================================
    function renderDashboard() {
        rebalRetries = 0;
        renderTopBarDashActions();
        renderTopBarDashMarket();
        renderPortfolio();
        renderFavorites();
        renderHoldings();
        renderRatesBand();
        renderRebal();
        ensureClock();
        if (typeof window.stkEnsureLoaded === 'function') window.stkEnsureLoaded();  // подтянуть таблицу акций (для ОДХС в избранном)
        if (typeof window.bndEnsureLoaded === 'function') window.bndEnsureLoaded();  // подтянуть таблицу облигаций (имя/доходность в избранном)
        requestAnimationFrame(dashSyncTopRowHeights);
    }
    window.renderDashboard = renderDashboard;

    // Ушли со вкладки — панель действий и рыночная лента в шапке сайта больше не
    // относятся к текущей странице, прячем их (сама рендерится заново при возврате
    // на «Главную» — см. renderDashboard())
    var _prevSwitchDash = window.switchTab;
    window.switchTab = function (tabId) {
        var r = _prevSwitchDash ? _prevSwitchDash.apply(this, arguments) : undefined;
        if (tabId !== 'dashboard') { hideTopBarDashActions(); hideTopBarDashMarket(); }
        return r;
    };

    // Когда таблица акций догрузилась — обновляем избранное (потенциал ОДХС)
    window.onStkCompaniesLoaded = function() {
        if (currentTab === 'dashboard') { renderFavorites(); dashSyncTopRowHeights(); }
    };
    // Когда таблица облигаций догрузилась — обновляем избранное (имя/доходность)
    window.onBndBondsLoaded = function() {
        if (currentTab === 'dashboard') { renderFavorites(); dashSyncTopRowHeights(); }
    };

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
