// ===== DESKTOP DASHBOARD (домик → дашборд) =====
// Агрегирует уже существующие данные приложения:
//  • сохранённый расчёт портфеля (вкладка «Портфель»)
//  • рыночные данные IMOEX / USD / BTC
//  • вертикаль ставок (ключевая, вклады, инфляция, ОФЗ 10 лет)
//  • быстрый пересчёт портфеля прямо отсюда
//  • топ-3 для ребаланса: ОФЗ + каждый из 4 эшелонов
(function() {
    var rebalRetries = 0;

    function dq(id) { return document.getElementById(id); }
    function txt(id, fb) { var e = dq(id); return e ? (e.textContent || '').trim() : (fb || '—'); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    }); }

    var ICONS = {
        imoex: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        usd:   '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
        btc:   '<path d="M11.5 2v3M11.5 19v3M8 2v3M8 19v3"/><path d="M6 5h7a4 4 0 0 1 0 8H6zM6 13h8a4 4 0 0 1 0 8H6z"/>',
        recalc:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'
    };

    // ---------- Рыночные данные ----------
    function renderMarket() {
        var host = dq('dash2Market');
        if (!host) return;
        var tiles = [
            { key: 'imoex', label: 'IMOEX',   val: txt('val-imoex'),  dyn: dq('dyn-imoex') },
            { key: 'usd',   label: 'USD / RUB', val: txt('val-usdrub'), dyn: dq('dyn-usdrub') },
            { key: 'btc',   label: 'BTC',     val: txt('val-btc'),    dyn: dq('dyn-btc') }
        ];
        host.innerHTML = tiles.map(function(t) {
            var dynTxt = t.dyn ? (t.dyn.textContent || '').trim() : '';
            var neg = /-/.test(dynTxt);
            var cls = dynTxt ? (neg ? 'neg' : 'pos') : '';
            return '<div class="dm-tile">' +
                '<div class="dm-ic"><svg viewBox="0 0 24 24">' + ICONS[t.key] + '</svg></div>' +
                '<div class="dm-body">' +
                    '<div class="dm-label">' + esc(t.label) + '</div>' +
                    '<div class="dm-val">' + esc(t.val || '—') + '</div>' +
                '</div>' +
                (dynTxt ? '<div class="dm-chg ' + cls + '">' + esc(dynTxt) + '</div>' : '') +
            '</div>';
        }).join('');
    }

    // ---------- Сохранённый расчёт портфеля ----------
    function renderPortfolio() {
        var host = dq('dash2Portfolio');
        if (!host) return;
        var calculated = !!window.isPortfolioCalculated;

        if (!calculated) {
            host.innerHTML =
                '<div class="dp-head"><span class="dp-eyebrow">Портфель</span></div>' +
                '<div class="dp-empty">' +
                    '<div class="dp-empty-ic">📂</div>' +
                    '<div class="dp-empty-title">Портфель ещё не рассчитан</div>' +
                    '<div class="dp-empty-text">Сформируйте портфель — и сводка появится здесь.</div>' +
                    '<button class="dp-empty-btn" onclick="switchTab(\'calc\')">Перейти к расчёту</button>' +
                '</div>';
            return;
        }

        var cap = txt('summ-invested', '0 ₽');
        var bondPct = txt('srl-bond-pct-v2', '50%');
        var stockPct = txt('srl-stock-pct-v2', '50%');
        var bondSum = txt('legend-bond-sum', '—');
        var stockSum = txt('legend-stock-sum', '—');
        var fcTotal = txt('summ-total-value-v2', '—');
        var pctEl = dq('summ-total-percent-v2');
        var fcPct = pctEl ? (pctEl.getAttribute('data-pct') || (pctEl.textContent || '').trim()) : '';
        var bondNum = parseFloat(String(bondPct).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

        var lastSum = (dq('sumInput') ? dq('sumInput').value : '') || '';

        host.innerHTML =
            '<div class="dp-head"><span class="dp-eyebrow">Текущий капитал</span></div>' +
            '<div class="dp-capital">' + esc(cap) + '</div>' +
            '<div class="dp-bar"><i class="dp-bar-bond" style="width:' + bondNum + '%"></i><i class="dp-bar-stock" style="width:' + (100 - bondNum) + '%"></i></div>' +
            '<div class="dp-legend">' +
                '<div class="dp-leg"><span class="dp-dot bond"></span><span class="dp-leg-name">ОФЗ</span><span class="dp-leg-pct">' + esc(bondPct) + '</span><span class="dp-leg-sum">' + esc(bondSum) + '</span></div>' +
                '<div class="dp-leg"><span class="dp-dot stock"></span><span class="dp-leg-name">Акции</span><span class="dp-leg-pct">' + esc(stockPct) + '</span><span class="dp-leg-sum">' + esc(stockSum) + '</span></div>' +
            '</div>' +
            '<div class="dp-forecast">' +
                '<span class="dp-fc-label">Прогноз через 3 года</span>' +
                '<span class="dp-fc-row"><span class="dp-fc-total">' + esc(fcTotal) + '</span>' +
                (fcPct ? '<span class="dp-fc-pct">' + esc(fcPct) + '</span>' : '') + '</span>' +
            '</div>' +
            '<div class="dp-recalc">' +
                '<div class="dp-recalc-field"><input type="text" id="dashSumInput" inputmode="numeric" value="' + esc(lastSum) + '" placeholder="Сумма, ₽"><span>₽</span></div>' +
                '<button class="dp-recalc-btn" onclick="dashQuickRecalc()">' +
                    '<svg viewBox="0 0 24 24">' + ICONS.recalc + '</svg> Пересчитать' +
                '</button>' +
            '</div>';

        var si = dq('dashSumInput');
        if (si) si.addEventListener('input', function() {
            var raw = this.value.replace(/\D/g, '').replace(/^0+/, '');
            var n = parseInt(raw) || 0;
            this.value = n > 0 ? n.toLocaleString('ru-RU').replace(/\s/g, '.') : '';
        });
    }

    window.dashQuickRecalc = function() {
        var si = dq('dashSumInput');
        var main = dq('sumInput');
        if (si && main) {
            var raw = si.value.replace(/\D/g, '');
            if (raw) {
                main.value = (parseInt(raw) || 0).toLocaleString('ru-RU').replace(/\s/g, '.');
                if (typeof ndFormatInput === 'function') ndFormatInput(main);
            }
        }
        if (typeof calculateAndShowPortfolio === 'function') calculateAndShowPortfolio();
        renderPortfolio();
    };

    // ---------- Вертикаль ставок ----------
    function renderRates() {
        var host = dq('dash2Rates');
        if (!host) return;
        var rd = window.ratesData || {};
        var rows = [
            { label: 'Ключевая ставка', val: rd.keyRate     != null ? rd.keyRate     : txt('val-key-rate') },
            { label: 'Ставка по вкладам', val: rd.depositRate != null ? rd.depositRate : txt('val-deposit-rate') },
            { label: 'Инфляция',        val: rd.inflation   != null ? rd.inflation   : txt('val-inflation') },
            { label: 'Доходность ОФЗ 10 лет', val: rd.ofz10  != null ? rd.ofz10       : txt('val-ofz10') }
        ];
        host.innerHTML =
            '<div class="dr-title">Ставки рынка</div>' +
            '<div class="dr-list">' + rows.map(function(r) {
                return '<div class="dr-row"><span class="dr-label">' + esc(r.label) + '</span><span class="dr-val">' + esc(r.val) + '</span></div>';
            }).join('') + '</div>';
    }

    // ---------- Топ-3 для ребаланса ----------
    function toNum(s) { return parseFloat(String(s == null ? '' : s).replace('%', '').replace(',', '.')); }

    function topOfz() {
        if (typeof bonds === 'undefined' || !bonds || !bonds.length) return [];
        return bonds.slice().sort(function(a, b) { return (toNum(b.y) || 0) - (toNum(a.y) || 0); })
            .slice(0, 3).map(function(b) {
                var p = parseFloat(String(b.p).replace(',', '.')) || 0;
                var nkd = parseFloat(b.nkd || 0) || 0;
                return { ticker: b.t, name: b.n, metric: (b.y ? String(b.y).replace('%', '') + '%' : '—'), sub: (p + nkd).toFixed(2) + ' ₽' };
            });
    }

    function topEchelon(col) {
        if (typeof echelonTableData === 'undefined' || !echelonTableData || !echelonTableData[col]) return [];
        return echelonTableData[col].slice().filter(function(a) { return a && a.t; })
            .sort(function(a, b) {
                var pa = toNum(a.target), pb = toNum(b.target);
                return (isFinite(pb) ? pb : -1e9) - (isFinite(pa) ? pa : -1e9);
            }).slice(0, 3).map(function(a) {
                var pot = toNum(a.target);
                return { ticker: a.t, name: a.n || a.t,
                    metric: isFinite(pot) ? (pot >= 0 ? '+' : '') + pot.toFixed(1) + '%' : '—' };
            });
    }

    function renderRebal() {
        var host = dq('dash2Rebal');
        if (!host) return;
        var ofz = topOfz();
        var cols = [
            { key: 'ofz', title: 'ОФЗ', color: '#5B7C99', items: ofz, metricLabel: 'доходность' },
            { key: 'e1',  title: 'I эшелон',  color: '#1d9d6c', items: topEchelon(0), metricLabel: 'потенциал' },
            { key: 'e2',  title: 'II эшелон', color: '#3d6fd1', items: topEchelon(1), metricLabel: 'потенциал' },
            { key: 'e3',  title: 'III эшелон',color: '#d07b2a', items: topEchelon(2), metricLabel: 'потенциал' },
            { key: 'e4',  title: 'IV эшелон', color: '#d8434f', items: topEchelon(3), metricLabel: 'потенциал' }
        ];

        var ready = ofz.length || cols.some(function(c) { return c.items.length; });
        if (!ready && rebalRetries < 8) {
            rebalRetries++;
            host.innerHTML = '<div class="drb-title">Лучшее для ребаланса</div><div class="drb-loading">Загрузка рыночных данных…</div>';
            if (currentTab === 'dashboard') setTimeout(renderRebal, 700);
            return;
        }

        host.innerHTML =
            '<div class="drb-title">Лучшее для ребаланса <span class="drb-sub">топ-3 по потенциалу</span></div>' +
            '<div class="drb-cols">' + cols.map(function(c) {
                var rows = c.items.length ? c.items.map(function(it, i) {
                    return '<button class="drb-item" onclick="' +
                        (c.key === 'ofz'
                            ? "switchTab('rebalance')"
                            : "switchTab('rebalance');setTimeout(function(){window.switchRebalanceTab&&switchRebalanceTab('stocks');},60)") +
                        '">' +
                        '<span class="drb-rank">' + (i + 1) + '</span>' +
                        '<span class="drb-info"><span class="drb-ticker">' + esc(it.ticker) + '</span>' +
                        (it.sub ? '<span class="drb-tsub">' + esc(it.sub) + '</span>' : '<span class="drb-tsub">' + esc(it.name) + '</span>') +
                        '</span>' +
                        '<span class="drb-metric">' + esc(it.metric) + '</span>' +
                    '</button>';
                }).join('') : '<div class="drb-empty">нет данных</div>';
                return '<div class="drb-col">' +
                    '<div class="drb-col-head" style="--c:' + c.color + '"><span class="drb-dot"></span>' + esc(c.title) + '</div>' +
                    rows +
                '</div>';
            }).join('') + '</div>';
    }

    // ---------- Главный рендер ----------
    function renderDashboard() {
        rebalRetries = 0;
        renderMarket();
        renderPortfolio();
        renderRates();
        renderRebal();
    }
    window.renderDashboard = renderDashboard;
})();
