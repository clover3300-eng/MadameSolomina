// ========================================================================
// AURORA REBALANCE - НОВЫЕ ФУНКЦИИ ДЛЯ ВКЛАДОК
// ========================================================================

// ----- R4: сортировка списка ОФЗ, цветовая шкала, статистика рельсы -----

// Текущий ключ сортировки списка ОФЗ: 'yield' (доходность) | 'price' (цена)
let rebalanceOfzSortKey = 'yield';
// Направление сортировки: 'desc' (убыв., ▼) | 'asc' (возр., ▲)
let rebalanceOfzSortDir = 'desc';

// Плавная зелёная шкала: чем выше доходность в диапазоне, тем насыщеннее цвет.
function ofzYieldColor(y, minY, maxY) {
    if (!isFinite(y)) return '#10B981';
    const t = (maxY === minY) ? 1 : Math.max(0, Math.min(1, (y - minY) / (maxY - minY)));
    return `oklch(${(62 - t * 4).toFixed(1)}% ${(0.08 + t * 0.13).toFixed(3)} 152)`;
}

// Переключение сортировки списка ОФЗ (кнопки в шапке карточки).
// Повторный клик по активной кнопке — меняет направление (возр./убыв.).
function setOfzSort(key) {
    if (rebalanceOfzSortKey === key) {
        rebalanceOfzSortDir = (rebalanceOfzSortDir === 'desc') ? 'asc' : 'desc';
    } else {
        rebalanceOfzSortKey = key;
        // Дефолт: доходность — по убыванию (лучшая сверху), цена — по возрастанию (дешевле сверху)
        rebalanceOfzSortDir = (key === 'price') ? 'asc' : 'desc';
    }
    updateOfzSortUI();
    renderAuroraOfzList();
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}

// Подсветка активной кнопки сортировки и направление стрелки
function updateOfzSortUI() {
    [['yield', document.getElementById('ofzSortYield')],
     ['price', document.getElementById('ofzSortPrice')]].forEach(function(pair) {
        const k = pair[0], el = pair[1];
        if (!el) return;
        const active = (rebalanceOfzSortKey === k);
        el.classList.toggle('act', active);
        el.classList.toggle('asc', active && rebalanceOfzSortDir === 'asc');
        el.classList.toggle('desc', active && rebalanceOfzSortDir === 'desc');
    });
}

// ----- R6: статистика для шапки-героя (ОФЗ и акции считаются одновременно) -----

// Плавный подсчёт числа в элементе: от прошлого значения к целевому
function rbxAnimateNum(el, target, fmt) {
    if (!el) return;
    if (!isFinite(target)) { el.textContent = '\u2014'; return; }
    const from = parseFloat(el.dataset.cur || '0') || 0;
    el.dataset.cur = target;
    if (Math.abs(target - from) < 1e-9) { el.textContent = fmt(target); return; }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = fmt(target); return;
    }
    const t0 = performance.now(), dur = 800;
    (function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = fmt(from + (target - from) * e);
        if (p < 1) requestAnimationFrame(tick);
    })(t0);
}

// Обновляет KPI шапки-героя и счётчики секций. Старый аргумент (mode)
// игнорируется — с R6 обе выборки видны на одном экране.
function updateRebalanceStats() {
    const num = (s) => parseFloat(String(s == null ? '' : s).replace('%', '').replace(',', '.'));

    const arr = (typeof bonds !== 'undefined' && bonds) ? bonds : [];
    const ys = arr.map(b => num(b.y)).filter(n => isFinite(n));
    const avgY = ys.length ? ys.reduce((s, n) => s + n, 0) / ys.length : NaN;

    const cols = (typeof echelonTableData !== 'undefined' && echelonTableData) ? echelonTableData : [[], [], [], []];
    const all = cols.flat();
    const pots = all.map(a => num(a.target)).filter(n => isFinite(n));
    const avgP = pots.length ? pots.reduce((s, n) => s + n, 0) / pots.length : NaN;

    rbxAnimateNum(document.getElementById('rbxOfzNum'), arr.length || NaN, v => String(Math.round(v)));
    rbxAnimateNum(document.getElementById('rbxOfzAvg'), avgY, v => v.toFixed(2) + '%');
    rbxAnimateNum(document.getElementById('rbxStNum'), all.length || NaN, v => String(Math.round(v)));
    rbxAnimateNum(document.getElementById('rbxStAvg'), avgP, v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%');

    const oc = document.getElementById('ofzCount');
    if (oc) oc.textContent = arr.length || '\u2014';
    const sc = document.getElementById('stocksCount');
    if (sc) sc.textContent = all.length || '\u2014';

    rbxTopSync();
}

/* ===== ВИТРИНА ВКЛАДКИ (#rbxTop) =====
   Заменила тёмный герой «Умная замена»: после сноса шапки сайта с десктопа
   плита осталась экспонатом между светлой колонкой и белыми карточками, а её
   KPI дублировали счётчики списков. Здесь — имя вкладки и ОДИН абзац; счётчики
   и средние живут в витринах своих списков (.rbx-bh).

   Абзац и кнопка зависят от входа, и это ДВА РАЗНЫХ ТЕКСТА, а не один с
   подстановкой: гостю «когда придёт время выравнивать доли» — правда, вошедшему
   с дрейфом время уже пришло, и ему обещают не помощь, а сделку из этих бумаг.
   Обещание живёт в КОНЦЕ абзаца, а не подписью у кнопки: два серых текста по
   краям витрины читались как два разных сообщения.

   Статус справа (сколько портфелей просят ребаланса) показываем ТОЛЬКО когда
   цепочка #pfLazySrc уже загружена: своих источников у вкладки нет, а тянуть
   модуль «Портфелей» ради одной строки — платить 236КБ за подпись. Ровно так же
   ведёт себя табло капитала в колонке (#sbCap пуст без PF). */
function rbxAuthed() {
    try { return !!(window.supa && window.supa.enabled && window.supa.isAuthed()); } catch (e) { return false; }
}
function rbxDriftCount() {
    try { return (window.PF && PF.pfDriftCount) ? PF.pfDriftCount() : 0; } catch (e) { return 0; }
}
function rbxPlural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
}
const RBX_LEAD_BASE = 'Недооценённые бумаги рынка: ОФЗ с самой высокой доходностью и акции с наибольшим потенциалом роста';
// Вход в академию стоит во втором уровне колонки, но её нет ни в рейке 84px, ни
// на мобиле — там кнопка возвращается сюда. Прячет её CSS по body.sb-ctx, а не
// JS: признак ставит sbCtxSync, и держать на него подписку было бы лишней связью.
const RBX_ACAD_BTN =
    '<button type="button" class="rbx-top-btn ghost rbx-acad-btn" onclick="rbxAcademyOpen()">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21.4 10.9a1 1 0 0 0 0-1.8l-8.5-3.9a2 2 0 0 0-1.7 0L2.7 9.1a1 1 0 0 0 0 1.8l8.5 3.9a2 2 0 0 0 1.7 0z"/>' +
    '<path d="M6 12.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5"/></svg>Академия</button>';

function rbxTopSync() {
    const lead = document.getElementById('rbxTopLead');
    const act = document.getElementById('rbxTopAct');
    if (!lead || !act) return;

    let leadHtml, actHtml;
    if (rbxAuthed()) {
        leadHtml = RBX_LEAD_BASE + '. <b>Из них мастер и соберёт сделку для ваших портфелей.</b>';
        const n = rbxDriftCount();
        const status = n > 0
            ? '<span class="rbx-top-state"><i></i>' + n + ' ' +
              rbxPlural(n, 'портфель просит', 'портфеля просят', 'портфелей просят') + ' ребаланса</span>'
            : '';
        actHtml = RBX_ACAD_BTN + status +
            '<button type="button" class="rbx-top-btn" onclick="rbxGoWizard()">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
            '<polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>Провести ребалансировку</button>';
    } else {
        leadHtml = RBX_LEAD_BASE + ' — кандидаты на покупку, когда придёт время выравнивать доли. ' +
            '<b>Поможем провести её грамотно.</b>';
        // одна кнопка в пустом углу читалась сиротой; «Войти» — не третий рассказ
        // о продукте, а вторая половина того же выбора
        actHtml = RBX_ACAD_BTN +
            '<button type="button" class="rbx-top-quiet" onclick="rbxGoRegister()">Уже есть аккаунт? <b>Войти</b></button>' +
            '<button type="button" class="rbx-top-btn big" onclick="rbxGoRegister()">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/>' +
            '<line x1="15" y1="12" x2="3" y2="12"/></svg>Зарегистрироваться</button>';
    }
    if (lead.__h !== leadHtml) { lead.innerHTML = leadHtml; lead.__h = leadHtml; }
    if (act.__h !== actHtml) { act.innerHTML = actHtml; act.__h = actHtml; }
}
window.rbxTopSync = rbxTopSync;

// Вход и регистрация живут в карточке Главной (#homeRegister) — своей формы у
// вкладки нет и быть не должно: пароль вводят в одном месте на весь сайт.
function rbxGoRegister() {
    if (window.switchTab) window.switchTab('home');
    setTimeout(function () {
        const card = document.getElementById('homeRegister');
        if (!card) return;
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const inp = card.querySelector('input:not([type=hidden])');
        if (inp) { try { inp.focus(); } catch (e) {} }
    }, 220);
}
// Мастер ребаланса — подвкладка «Портфелей» (ключ 'rebal', НЕ 'rebalance').
// Модуль ленивый: switchTab поднимет цепочку, но pfxGoTab появится только после
// неё — поэтому переход подвкладки ждём колбэка ensurePortfoliosJs.
function rbxGoWizard() {
    if (window.switchTab) window.switchTab('portfolios');
    if (window.ensurePortfoliosJs) {
        window.ensurePortfoliosJs(function () { if (window.pfxGoTab) window.pfxGoTab('rebal'); });
    } else if (window.pfxGoTab) {
        window.pfxGoTab('rebal');
    }
}

// Совместимость: переключателя ОФЗ/Акции больше нет — обе секции на одном экране
function switchRebalanceTab() {}

// Рендер списка ОФЗ (левая секция карты R6)
function renderAuroraOfzList() {
    const container = document.getElementById('ofz-aurora-list');
    if (!container || typeof bonds === 'undefined' || bonds.length === 0) return;

    function formatDateDMY(dateStr) {
        if (!dateStr || dateStr === '\u2014') return '\u2014';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return String(date.getDate()).padStart(2, '0') + '.' +
                   String(date.getMonth() + 1).padStart(2, '0') + '.' + date.getFullYear();
        } catch (e) { return dateStr; }
    }

    // Сортировка списка: по доходности или по цене (см. setOfzSort)
    const parseYield = (b) => parseFloat(String(b.y || '0').replace('%', '').replace(',', '.')) || 0;
    const parsePriceFull = (b) => (parseFloat(String(b.p).replace(',', '.')) || 0) + (parseFloat(b.nkd || 0) || 0);
    const sortVal = (b) => rebalanceOfzSortKey === 'price' ? parsePriceFull(b) : parseYield(b);
    const dirSign = (rebalanceOfzSortDir === 'asc') ? 1 : -1;
    const sorted = bonds.slice().sort((a, b) => (sortVal(a) - sortVal(b)) * dirSign);

    // Диапазон доходностей для цветовой шкалы
    const ysAll = sorted.map(parseYield);
    const maxY = Math.max(...ysAll), minY = Math.min(...ysAll);

    let html = '';
    sorted.forEach((b, index) => {
        const details = bondDetailsMap[b.t] || { matDate: '\u2014', couponValue: 0, nextCoupon: '\u2014', freq: 0 };
        const priceFinal = parseFloat(String(b.p).replace(',', '.')).toFixed(2);
        const nkd = parseFloat(b.nkd || 0).toFixed(2);
        const priceWithNkd = (parseFloat(priceFinal) + parseFloat(nkd)).toFixed(2);
        const sheetYield = b.y ? b.y.replace('%', '') : '\u2014';
        let curYield = '0.00';
        if (details.couponValue > 0 && details.freq > 0) {
            curYield = ((details.couponValue * details.freq / parseFloat(priceFinal)) * 100).toFixed(2);
        }

        html += `
        <div class="rbx-row" id="aurora-${b.t}">
            <div class="rbx-row-main" onclick="toggleAuroraOfzDetails('${b.t}')">
                <span class="rk">#${index + 1}</span>
                <span class="nm">${formatNameWithMonoDigits(limitName(b.n))}</span>
                <span class="yl" style="color:${ofzYieldColor(parseFloat(sheetYield), minY, maxY)}">${sheetYield}%</span>
                <span class="pr">${priceWithNkd} \u20bd</span>
                <span class="ar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></span>
            </div>
            <div class="rbx-det" id="aurora-details-${b.t}">
                <div class="rbx-det-in">
                    <div class="rbx-spec">
                        <div class="rbx-srow rbx-srow-copy" onclick="copyTickerNew('${b.t}')" title="Скопировать код">
                            <span>Код (ISIN)</span>
                            <b>${b.t}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg></b>
                        </div>
                        <div class="rbx-srow"><span>Текущая цена</span><b>${priceFinal} \u20bd</b></div>
                        <div class="rbx-srow"><span>НКД<i class="rbx-q" onclick="toggleOfzHelp('nkdHelp-${b.t}', event)">?</i></span><b>${nkd} \u20bd</b></div>
                        <div class="rbx-shelp" id="nkdHelp-${b.t}"><b>НКД</b> — накопленный купонный доход: часть купона, которую вы платите продавцу за дни с последней выплаты. Следующий купон получите целиком.</div>
                        <div class="rbx-srow"><span>Итого (цена + НКД)</span><b class="tot">${priceWithNkd} \u20bd</b></div>
                        <div class="rbx-srow"><span>Погашение</span><b>${formatDateDMY(details.matDate)}</b></div>
                        <div class="rbx-srow"><span>Размер купона</span><b>${details.couponValue} \u20bd</b></div>
                        <div class="rbx-srow"><span>Ближайший купон</span><b>${formatDateDMY(details.nextCoupon)}</b></div>
                        <div class="rbx-srow"><span>Куп. доходность<i class="rbx-q" onclick="toggleOfzHelp('yieldHelp-${b.t}', event)">?</i></span><b class="up">${curYield}%</b></div>
                        <div class="rbx-shelp" id="yieldHelp-${b.t}"><b>Текущая купонная доходность</b> — процент годовых от купонов к текущей цене облигации, без учёта выплаты номинала при погашении.</div>
                        <div class="rbx-srow"><span>Выплат в год</span><b>${details.freq}</b></div>
                    </div>
                    <button class="rbx-chart-btn" onclick="openTradingViewDirect('${b.t}')">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        Открыть график
                    </button>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
    hideSkeleton('skeleton-ofz-list');
    updateRebalanceStats();
}

// Раскрытие деталей выпуска ОФЗ (одна строка открыта за раз)
function toggleAuroraOfzDetails(ticker) {
    const item = document.getElementById(`aurora-${ticker}`);
    if (!item) return;
    const wasExpanded = item.classList.contains('expanded');
    document.querySelectorAll('.rbx-row.expanded').forEach(el => el.classList.remove('expanded'));
    if (!wasExpanded) {
        item.classList.add('expanded');
        setTimeout(() => item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 180);
    }
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}

// Рендер акций по эшелонам риска: 4 колонки карточек (правая секция карты R6)
const RBX_TIERS = [
    { cls: 'e1', roman: 'I' },
    { cls: 'e2', roman: 'II' },
    { cls: 'e3', roman: 'III' },
    { cls: 'e4', roman: 'IV' },
];

function renderAuroraStocksTable() {
    const container = document.getElementById('stocks-aurora-body');
    if (!container) return;

    // Данные могли ещё не приехать из Google Sheets — подождём
    if (typeof echelonTableData === 'undefined' || !echelonTableData ||
        echelonTableData.every(col => col.length === 0)) {
        setTimeout(renderAuroraStocksTable, 500);
        return;
    }

    // Общая шкала потенциала — полоски всех эшелонов сопоставимы между собой
    const toPot = (s) => parseFloat(String(s == null ? '' : s).replace('%', '').replace(',', '.'));
    const allPots = echelonTableData.flat().map(a => toPot(a.target)).filter(n => isFinite(n));
    const maxPot = allPots.length ? Math.max(...allPots) : 0;

    let html = '';
    for (let col = 0; col < 4; col++) {
        const tier = RBX_TIERS[col];
        // Внутри эшелона — по убыванию потенциала
        const assets = (echelonTableData[col] || []).slice()
            .sort((a, b) => (toPot(b.target) || 0) - (toPot(a.target) || 0));

        html += `<div class="rbx-ech-col ${tier.cls}">
            <div class="rbx-ech-head"><span>${tier.roman}</span></div>`;

        assets.forEach(asset => {
            if (!asset || !asset.t) return;
            const potNum = toPot(asset.target);
            const potStr = isFinite(potNum) ? ((potNum >= 0 ? '+' : '') + potNum.toFixed(2) + '%') : (asset.target || '');
            const chg = isFinite(potNum) ? (potNum >= 0 ? 'pos' : 'neg') : '';
            const barPct = (isFinite(potNum) && maxPot > 0) ? Math.max(6, Math.min(100, potNum / maxPot * 100)) : 0;
            html += `<div class="rbx-tile" onclick="openStockDetail('${asset.t}', ${col + 1}, this)">
                <div class="tt"><b>${asset.t}</b><span class="${chg}">${potStr}</span></div>
                <div class="nm">${asset.n || asset.t}</div>
                ${barPct > 0 ? `<div class="bar"><i style="width:${barPct.toFixed(1)}%"></i></div>` : ''}
            </div>`;
        });

        html += '</div>';
    }

    container.innerHTML = html;
    hideSkeleton('skeleton-stocks-table');
    updateRebalanceStats();
}

// Открытие карточки деталей тикера
function openStockDetail(ticker, echelon, clickedCell = null) {
    const card = document.getElementById('stockDetailCard');
    if (!card || !ticker) return;
    
    // Снимаем активный класс с предыдущей ячейки
    document.querySelectorAll('.rbx-tile.active, .stocks-cell.active').forEach(c => c.classList.remove('active'));
    
    // Закрываем если уже открыта эта же карточка
    if (card.classList.contains('open') && card.dataset.ticker === ticker) {
        closeStockDetail();
        return;
    }
    
    // Добавляем активный класс на кликнутую ячейку
    if (clickedCell) {
        clickedCell.classList.add('active');
    }
    
    // Ищем данные о компании в echelonTableData
    let companyName = ticker;
    let companySector = '';
    
    // Для привилегированных акций (SNGSp -> SNGS) ищем сектор базового тикера
    const baseTicker = ticker.toLowerCase().endsWith('p') ? ticker.slice(0, -1) : ticker;
    
    if (typeof echelonTableData !== 'undefined') {
        // Сначала ищем точное совпадение
        for (let i = 0; i < echelonTableData.length; i++) {
            const found = echelonTableData[i].find(item => item.t === ticker);
            if (found) {
                companyName = found.n || ticker;
                companySector = found.sector || '';
                break;
            }
        }
        
        // Если сектор не найден и это привилегированная акция - ищем по базовому тикеру
        if (!companySector && ticker !== baseTicker) {
            for (let i = 0; i < echelonTableData.length; i++) {
                const found = echelonTableData[i].find(item => item.t === baseTicker || item.t === baseTicker.toUpperCase());
                if (found) {
                    companySector = found.sector || '';
                    if (!companyName || companyName === ticker) {
                        companyName = found.n || ticker;
                    }
                    break;
                }
            }
        }
    }
    
    const tierMap = {
        1: { color: '#1d9d6c', roman: 'I',   name: 'I эшелон' },
        2: { color: '#3d6fd1', roman: 'II',  name: 'II эшелон' },
        3: { color: '#d07b2a', roman: 'III', name: 'III эшелон' },
        4: { color: '#d8434f', roman: 'IV',  name: 'IV эшелон' }
    };
    const tier = tierMap[echelon] || tierMap[1];

    // Потенциал роста (target) для этого тикера
    let potentialStr = '';
    if (typeof echelonTableData !== 'undefined') {
        for (let i = 0; i < echelonTableData.length; i++) {
            const f = echelonTableData[i].find(it => it.t === ticker) ||
                      (ticker !== baseTicker ? echelonTableData[i].find(it => it.t === baseTicker || it.t === baseTicker.toUpperCase()) : null);
            if (f) { potentialStr = f.target || ''; break; }
        }
    }
    let potNum = parseFloat(String(potentialStr).replace('%', '').replace(',', '.'));
    // «Потенциал» в приложении = показатель ОДХС из терминала «Рынок · Акции»
    // (US-формат чисел). Берём значение из ОДХС, подпись поля остаётся «Потенциал».
    if (typeof window.stkEnsureLoaded === 'function') { try { window.stkEnsureLoaded(); } catch (e) {} }
    if (typeof window.stkFindCompany === 'function') {
        const stkCo = window.stkFindCompany(ticker) ||
                      (ticker !== baseTicker ? window.stkFindCompany(baseTicker) : null);
        const odRaw = stkCo && stkCo.main ? stkCo.main['ОДХС'] : null;
        const odNum = odRaw != null ? parseFloat(String(odRaw).replace(/[^0-9.\-]/g, '')) : NaN;
        if (isFinite(odNum)) potNum = odNum;
    }
    const potDisplay = isFinite(potNum) ? ((potNum >= 0 ? '+' : '') + potNum.toFixed(2) + '%') : (potentialStr || '—');

    // Fallback: в ребалансе лишь кураторский список тикеров, а карточку можно открыть
    // из терминала «Рынок · Акции» (221 компания). Если имя/сектор не нашлись —
    // берём их из терминала через stkFindCompany.
    if ((companyName === ticker || !companySector) && typeof window.stkFindCompany === 'function') {
        const stk = window.stkFindCompany(ticker) ||
                    (ticker !== baseTicker ? window.stkFindCompany(baseTicker) : null);
        if (stk) {
            if (companyName === ticker && stk.name) companyName = stk.name;
            if (!companySector && stk.sector) companySector = stk.sector;
        }
    }

    // Сектор
    const sectorHtml = companySector ? `
        <span class="sd-sector">
            <span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></span>
            ${companySector}
        </span>` : '';

    // В избранном ли тикер (единый список stk_fav_v1)
    const isFav = (typeof window.stkGetFavorites === 'function') &&
                  window.stkGetFavorites().indexOf(ticker) !== -1;

    card.innerHTML = `
        <div class="sd">
            <div class="sd-close" onclick="closeStockDetail()" title="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </div>
            <div class="sd-top">
                <div class="sd-id">
                    <div class="sd-tk-row">
                        <div class="tk">${ticker}</div>
                        <button class="sd-copy" onclick="copyTickerNew('${ticker}')" title="Скопировать тикер" aria-label="Скопировать тикер"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg></button>
                        <button class="sd-fav${isFav ? ' active' : ''}" onclick="toggleStockCardFav('${ticker}', this)" title="${isFav ? 'Убрать из избранного' : 'В избранное'}" aria-label="Избранное"><svg viewBox="0 0 24 24" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg></button>
                    </div>
                    <div class="nm">${companyName}</div>
                </div>
                <span class="sd-tier-circle" style="color:${tier.color};border-color:${tier.color}">${tier.roman}</span>
            </div>
            ${sectorHtml}
            <div class="sd-hr"></div>
            <div class="sd-pot${isFinite(potNum) && potNum < 0 ? ' sd-pot--neg' : ''}">
                <div>
                    <div class="sd-pot-label">Потенциал</div>
                    <div class="sd-pot-val">${potDisplay}</div>
                </div>
                <div class="sd-pot-horizon">
                    <span class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M4 10.5h16M9 4v3M15 4v3"/></svg></span>
                    горизонт до 36 мес.
                </div>
            </div>
            <div class="sd-pot-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Потенциал носит условный характер и служит мерой приоритета одной акции над другой, а не прогнозом доходности.</span>
            </div>
            <div class="sd-block sd-desc-block" id="sdDescBlock" style="display:none;">
                <div class="sd-hr"></div>
                <div class="company-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Описание актива</div>
                <div class="sd-desc" id="sdDesc"></div>
            </div>
            <div class="sd-btns sd-btns-single">
                <div class="sd-btn dark" onclick="openTradingViewDirect('${ticker}')">
                    <span class="ic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/></svg></span>
                    Открыть график
                </div>
            </div>

            <div class="sd-hr"></div>
            <div class="sd-block" id="sdDivHistory">
                <div class="company-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19V5h5a3.5 3.5 0 0 1 0 7H9"/><line x1="7" y1="15" x2="13" y2="15"/></svg>Дивиденды по годам</div>
                <div class="div-history-loading">Загружаем историю выплат с MOEX…</div>
            </div>

            <div class="sd-hr"></div>
            <div class="sd-block events-section">
                <div class="company-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Новости Smart-Lab</div>
                <div id="sdNewsList">
                    <div class="skeleton-container">
                        <div class="skeleton-news-item"><div class="skeleton-bone s-news-title"></div><div class="skeleton-bone s-news-date"></div></div>
                        <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:75%"></div><div class="skeleton-bone s-news-date"></div></div>
                        <div class="skeleton-news-item"><div class="skeleton-bone s-news-title" style="width:85%"></div><div class="skeleton-bone s-news-date"></div></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    card.dataset.ticker = ticker;
    card.dataset.echelon = echelon;

    // Панель выезжает справа поверх всего. Выносим её в <body>, чтобы position:fixed
    // считался от окна, а не от трансформированных предков вкладки (tabFadeIn).
    if (card.parentElement !== document.body) document.body.appendChild(card);

    // Выезжающая панель справа: подложка + открытие, прокрутку панели — в начало
    ensureStockDetailBackdrop().classList.add('open');
    document.body.classList.add('sd-drawer-open');
    card.classList.add('open');
    card.scrollTop = 0;

    // Подгружаем описание, дивиденды и новости Smart-Lab (как во вкладке «О компании»)
    loadStockCardDescription(ticker);
    loadStockCardDividends(ticker);
    loadAndDisplayNews(ticker, 'sdNewsList');

    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Закрыть карточку деталей
// Добавить/убрать тикер из избранного прямо из карточки компании
function toggleStockCardFav(ticker, btn) {
    let nowFav = false;
    if (typeof window.stkToggleFav === 'function') nowFav = window.stkToggleFav(ticker);
    if (btn) {
        btn.classList.toggle('active', nowFav);
        btn.title = nowFav ? 'Убрать из избранного' : 'В избранное';
        if (nowFav) {
            btn.classList.remove('just-faved');
            void btn.offsetWidth; // рестарт анимации
            btn.classList.add('just-faved');
        }
    }
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}
window.toggleStockCardFav = toggleStockCardFav;

function closeStockDetail() {
    const card = document.getElementById('stockDetailCard');
    if (card) {
        card.classList.remove('open');
        card.dataset.ticker = '';
    }
    const backdrop = document.getElementById('stockDetailBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    document.body.classList.remove('sd-drawer-open');
    // Снимаем активный класс со всех ячеек
    document.querySelectorAll('.rbx-tile.active, .stocks-cell.active').forEach(c => c.classList.remove('active'));
}

// Подложка-затемнение за выезжающей карточкой (создаётся один раз)
function ensureStockDetailBackdrop() {
    let backdrop = document.getElementById('stockDetailBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'stockDetailBackdrop';
        backdrop.addEventListener('click', closeStockDetail);
        document.body.appendChild(backdrop);
    }
    return backdrop;
}

// Описание актива в карточке тикера. Справочник companyDescriptions грузится из
// Google Sheets асинхронно, а демо-список акций отрисовывается мгновенно — поэтому
// карточку можно открыть раньше, чем приедут описания. Ждём их и заполняем блок.
function loadStockCardDescription(ticker, attempt = 0) {
    const card = document.getElementById('stockDetailCard');
    const block = document.getElementById('sdDescBlock');
    // карточку могли закрыть или переоткрыть на другом тикере
    if (!block || !card || card.dataset.ticker !== ticker) return;

    const hasDesc = typeof companyDescriptions !== 'undefined';
    // если справочник пуст — на всякий случай инициируем его загрузку
    if (attempt === 0 && (!hasDesc || !Object.keys(companyDescriptions).length)
        && typeof loadCompanyDescriptions === 'function') {
        try { loadCompanyDescriptions(); } catch (e) {}
    }

    const base = ticker.toLowerCase().endsWith('p') ? ticker.slice(0, -1) : ticker;
    let desc = '';
    if (hasDesc) {
        desc = companyDescriptions[ticker] || companyDescriptions[base]
            || companyDescriptions[base.toUpperCase()] || '';
    }

    if (desc) {
        const target = document.getElementById('sdDesc');
        if (target) target.innerHTML = highlightKeywords(desc);
        block.style.display = '';
        return;
    }
    // описания ещё не подъехали — подождём и попробуем снова (до ~5 c)
    if (attempt < 10) {
        setTimeout(() => loadStockCardDescription(ticker, attempt + 1), 500);
    } else {
        block.style.display = 'none';
    }
}

// Дивиденды по годам в карточке тикера — переиспользуем загрузку и рендер
// со страницы «О компании» (MOEX ISS)
async function loadStockCardDividends(ticker) {
    const section = document.getElementById('sdDivHistory');
    if (!section) return;
    try {
        const rows = await fetchDividendRows(ticker);
        renderDivHistory(section, ticker, rows, true);
    } catch (e) {
        const l = section.querySelector('.div-history-loading');
        if (l) l.textContent = 'Не удалось загрузить данные MOEX. Попробуйте позже.';
    }
}

// Закрытие выезжающей карточки по Esc
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const card = document.getElementById('stockDetailCard');
        if (card && card.classList.contains('open')) closeStockDetail();
    }
});

// Переход на страницу компании (из карточки деталей акции)
function goToCompanyPage(ticker) {
    // Ищем данные о компании в echelonTableData
    let companyData = null;
    
    if (typeof echelonTableData !== 'undefined') {
        for (let i = 0; i < echelonTableData.length; i++) {
            const found = echelonTableData[i].find(item => item.t === ticker);
            if (found) {
                companyData = {
                    t: found.t,
                    n: found.n || ticker,
                    sector: found.sector || '',
                    target: found.target || '—',
                    type: 'Акция'
                };
                break;
            }
        }
    }
    
    if (companyData && typeof openCompanyPage === 'function') {
        openCompanyPage(companyData);
    } else {
        showToast('Информация о компании недоступна');
    }
}

// Переход на страницу компании как если бы в поиск ввели тикер
function goToCompanyPageFromTicker(ticker) {
    // Вызываем функцию поиска с тикером
    if (typeof searchCompanyInternal === 'function') {
        searchCompanyInternal(ticker);
    } else if (typeof openCompanyPage === 'function') {
        // Fallback - ищем данные и открываем страницу
        let companyData = null;
        
        // Для привилегированных акций ищем и базовый тикер
        const baseTicker = ticker.toLowerCase().endsWith('p') ? ticker.slice(0, -1).toUpperCase() : ticker;
        
        if (typeof echelonTableData !== 'undefined') {
            for (let i = 0; i < echelonTableData.length; i++) {
                let found = echelonTableData[i].find(item => item.t === ticker);
                if (!found && ticker !== baseTicker) {
                    found = echelonTableData[i].find(item => item.t === baseTicker);
                }
                if (found) {
                    companyData = {
                        t: ticker, // Используем оригинальный тикер
                        n: found.n || ticker,
                        sector: found.sector || '',
                        target: found.target || '—',
                        type: 'Акция',
                        p: 0
                    };
                    break;
                }
            }
        }
        
        if (companyData) {
            openCompanyPage(companyData, ticker);
        } else {
            // Пробуем открыть без данных
            openCompanyPage(null, ticker);
        }
    } else {
        showToast('Информация о компании недоступна');
    }
}

// Функция показа/скрытия подсказки для НКД и текущей купонной доходности
function toggleOfzHelp(helpId, event) {
    event.stopPropagation();
    const help = document.getElementById(helpId);
    if (help) {
        help.classList.toggle('show');
    }
    
    // Вибрация
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

// Функция прямого открытия TradingView без предупреждения
function openTradingViewDirect(ticker) {
    const tvUrl = `https://ru.tradingview.com/chart/?symbol=MOEX%3A${ticker}`;
    openExternalLink(tvUrl);
}

// ========================================================================
// КОНЕЦ AURORA REBALANCE ФУНКЦИЙ

// ========================================================================
// АКАДЕМИЯ РЕБАЛАНСИРОВКИ — выезжающая справа шторка (#rbxAcademy)
// Открывается кнопкой «Подробнее» блока «Зачем нужно ребалансировать».
// Паттерн тот же, что у карточки тикера: панель переносится в <body>,
// чтобы position:fixed считался от окна, а не от трансформированных
// предков вкладки (tabFadeIn). Стили — в rebalance-r6.css (.rbxa-*).
// ========================================================================

// Подложка-затемнение за шторкой академии (создаётся один раз)
function rbxAcademyBackdrop() {
    let backdrop = document.getElementById('rbxAcademyBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'rbxAcademyBackdrop';
        backdrop.addEventListener('click', rbxAcademyClose);
        document.body.appendChild(backdrop);
    }
    return backdrop;
}

function rbxAcademyOpen() {
    const panel = document.getElementById('rbxAcademy');
    if (!panel) return;
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    rbxAcademyBackdrop().classList.add('open');
    document.body.classList.add('rbxa-open');
    panel.classList.add('open');
    const body = panel.querySelector('.rbxa-body');
    if (body) body.scrollTop = 0;
    // тренажёры — в исходное состояние при каждом открытии
    rbxLevelReset();
    rbxInsidePick(rbxiState.mode);
    rbxAcademyStep(1, true);
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.selectionChanged();
    }
}

function rbxAcademyClose() {
    const panel = document.getElementById('rbxAcademy');
    if (panel) panel.classList.remove('open');
    const backdrop = document.getElementById('rbxAcademyBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    document.body.classList.remove('rbxa-open');
    rbxAcademyStopPlay();
}

// Переключение разделов академии (Два уровня / Внутри классов / Раз в год)
function rbxAcademyTab(name) {
    document.querySelectorAll('#rbxAcademy .rbxa-tab').forEach(btn => {
        btn.classList.toggle('act', btn.dataset.atab === name);
    });
    document.querySelectorAll('#rbxAcademy .rbxa-pane').forEach(pane => {
        pane.classList.toggle('act', pane.id === 'rbxaPane-' + name);
    });
    const body = document.querySelector('#rbxAcademy .rbxa-body');
    if (body) body.scrollTop = 0;
    if (name !== 'annual') rbxAcademyStopPlay();   // ушли со вкладки — автопрогон не крутим вслепую
}

// ── Раздел 1: тренажёр «Два уровня» ──────────────────────────────────────
// Сцена: полоса долей акции/ОФЗ + полки с бумагами. Уровень 1 меняет бумаги
// внутри полки (доли неподвижны), уровень 2 двигает сами доли.
const RBXL_CHIPS = {
    st: [{ t: 'SBER', v: '+75%' }, { t: 'GAZP', v: 'потенциал исчерпан', hot: true }, { t: 'LKOH', v: '+42%' }],
    of: [{ t: 'ОФЗ 26238', v: '19.3%' }, { t: 'ОФЗ 26233', v: '15.2% — подорожала', hot: true }, { t: 'ОФЗ 26230', v: '18.6%' }]
};
// Что происходит по нажатию на уровне 1: шаг за шагом меняем «перегретую»
// бумагу на недооценённую — сначала в акциях, потом в облигациях.
const RBXL_SWAPS = [
    {
        shelf: 'st', idx: 1, to: { t: 'MRKC', v: '+153%' },
        say: '<b>Акции:</b> GAZP дошёл до справедливой цены — потенциал исчерпан. Продали и купили MRKC с апсайдом +153% из того же эшелона. Доли остались 50/50 — риск не изменился.'
    },
    {
        shelf: 'of', idx: 1, to: { t: 'ОФЗ 26225', v: '18.3%' },
        say: '<b>Облигации:</b> ОФЗ 26233 подорожала, её доходность упала до 15.2%. Переложились в 26225 под 18.3% — на те же деньги больше бумаг. Доли снова не тронуты.'
    }
];

const rbxlState = { level: 1, swap: 0, stage: 0, chips: null };

function rbxLevelReset() {
    rbxlState.level = 1;
    rbxlState.swap = 0;
    rbxlState.stage = 0;
    rbxlState.chips = { st: RBXL_CHIPS.st.map(c => ({ ...c })), of: RBXL_CHIPS.of.map(c => ({ ...c })) };
    document.querySelectorAll('#rbxAcademy .rbxl-sw').forEach(b => b.classList.toggle('act', b.dataset.lvl === '1'));
    rbxLevelSplit(50);
    rbxLevelChips();
    rbxLevelSay('Портфель собран по плану 50/50. Нажмите кнопку ниже.');
    rbxLevelBtn('Сделать замену');
}
window.rbxLevelReset = rbxLevelReset;

function rbxLevelPick(lvl) {
    rbxlState.level = lvl;
    rbxlState.swap = 0;
    rbxlState.stage = 0;
    rbxlState.chips = { st: RBXL_CHIPS.st.map(c => ({ ...c })), of: RBXL_CHIPS.of.map(c => ({ ...c })) };
    document.querySelectorAll('#rbxAcademy .rbxl-sw').forEach(b => b.classList.toggle('act', b.dataset.lvl === String(lvl)));
    rbxLevelSplit(50);
    rbxLevelChips();
    if (lvl === 1) {
        rbxLevelSay('<b>Уровень 1 · постоянно.</b> Меняем бумаги внутри классов: продаём то, что выросло, покупаем недооценённое. Доли акций и ОФЗ при этом не двигаются.');
        rbxLevelBtn('Сделать замену');
    } else {
        rbxLevelSay('<b>Уровень 2 · раз в год.</b> Сверяем фактические доли с планом. Посмотрим, что делает с портфелем год роста.');
        rbxLevelBtn('Прошёл год');
    }
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}
window.rbxLevelPick = rbxLevelPick;

// Одно нажатие главной кнопки — один шаг сценария выбранного уровня
function rbxLevelAct() {
    if (rbxlState.level === 1) {
        const swap = RBXL_SWAPS[rbxlState.swap];
        if (!swap) {   // оба обмена показаны — подводим итог
            rbxLevelSay('Так и работает первый уровень: капитал постоянно перетекает в самые недооценённые бумаги, а доли классов стоят на месте. Сбросьте, чтобы повторить.');
            rbxLevelBtn('Сделать замену', true);
            return;
        }
        rbxlState.chips[swap.shelf][swap.idx] = { ...swap.to, fresh: true };
        rbxlState.swap++;
        rbxLevelChips();
        rbxLevelSay(swap.say);
        rbxLevelFlashBar();
        rbxLevelBtn(rbxlState.swap < RBXL_SWAPS.length ? 'Следующая замена' : 'Готово');
    } else {
        if (rbxlState.stage === 0) {          // год роста → перекос долей
            rbxlState.stage = 1;
            rbxLevelSplit(58);
            rbxLevelSay('За год акции выросли сильнее облигаций — их доля раздулась до <b>58%</b>. Портфель стал рискованнее, чем мы планировали.');
            rbxLevelBtn('Выровнять доли');
        } else if (rbxlState.stage === 1) {   // годовая сверка → возврат к плану
            rbxlState.stage = 2;
            rbxLevelSplit(50);
            rbxLevelSay('Продали часть выросших акций и докупили ОФЗ — доли снова <b>50/50</b>. Прибыль зафиксирована, риск вернулся к плану.');
            rbxLevelBtn('Ещё раз', true);
        }
    }
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}
window.rbxLevelAct = rbxLevelAct;

// Полоса долей: ширина сегментов + подписи процентов
function rbxLevelSplit(pctSt) {
    const segSt = document.getElementById('rbxlSegSt');
    const segOf = document.getElementById('rbxlSegOf');
    const txSt = document.getElementById('rbxlPctSt');
    const txOf = document.getElementById('rbxlPctOf');
    if (segSt) segSt.style.width = pctSt + '%';
    if (segOf) segOf.style.width = (100 - pctSt) + '%';
    if (txSt) txSt.textContent = pctSt + '%';
    if (txOf) txOf.textContent = (100 - pctSt) + '%';
    const bar = document.getElementById('rbxlBar');
    if (bar) bar.classList.toggle('skew', pctSt !== 50);
}

// Полки с бумагами; hot — «перегретая» бумага, fresh — только что купленная
function rbxLevelChips() {
    ['st', 'of'].forEach(shelf => {
        const host = document.getElementById(shelf === 'st' ? 'rbxlChipsSt' : 'rbxlChipsOf');
        if (!host) return;
        host.innerHTML = rbxlState.chips[shelf].map(c =>
            '<span class="rbxl-chip' + (c.hot ? ' hot' : '') + (c.fresh ? ' fresh' : '') + '">'
            + '<b>' + c.t + '</b><i>' + c.v + '</i></span>'
        ).join('');
    });
}

function rbxLevelSay(html) {
    const el = document.getElementById('rbxlSay');
    if (el) el.innerHTML = html;
}

function rbxLevelBtn(label, done) {
    const btn = document.getElementById('rbxlDo');
    if (!btn) return;
    btn.textContent = label;
    btn.classList.toggle('done', !!done);
}

// Подсветка полосы долей на уровне 1 — «смотрите, доли не сдвинулись»
function rbxLevelFlashBar() {
    const bar = document.getElementById('rbxlBar');
    if (!bar) return;
    bar.classList.remove('steady');
    void bar.offsetWidth;   // рестарт анимации
    bar.classList.add('steady');
}

// ── Раздел 2: тренажёр «Умная замена» ────────────────────────────────────
// Один и тот же компонент для ОФЗ и акций: карточка «продаём» → карточка
// «покупаем» и строка эффекта. Числа иллюстративные, позиция 100 000 ₽.
const RBXI_DEMO = {
    ofz: {
        cap: 'Держим <b>10 ОФЗ</b>, куплены по 700 ₽ · пример',
        out: { tag: 'Продаём', t: 'ОФЗ 26233', sub: '700 → 721 ₽: +3% за месяц', k: 'Доходность', v: '14.0%', tone: 'warn' },
        in:  { tag: 'Покупаем', t: 'ОФЗ 26225', sub: 'торгуется дешевле — по 655 ₽', k: 'Доходность', v: '18.9%', tone: 'good' },
        stats: [
            { l: 'Бумаг в позиции', a: '10 шт', b: '11 шт', d: '+1 шт' },
            { l: 'Купоны в год', a: '1 010 ₽', b: '1 364 ₽', d: '+354 ₽' },
            { l: 'Тело к погашению', a: '10 000 ₽', b: '11 000 ₽', d: '+1 000 ₽' }
        ],
        punch: '<b>Машина денег.</b> Продали 10 бумаг — купили 11, и сверху не вложили ни рубля: лишнюю бумагу оплатил сам рывок цены. Теперь купоны платят 11 бумаг вместо 10 — доход вырос без новых денег.',
        rules: [
            'Продаём <b>не просто «ту, где доходность ниже»</b>, а ту, что резко выросла в цене: +3% за месяц — это около +36% годовых. Такой рывок нужно забирать, пока он есть.',
            'Прибыль фиксируем сразу — она перестаёт быть бумажной и ложится в карман живыми деньгами.',
            'На всю сумму берём выпуск, который торгуется дешевле и с высокой доходностью. Цель прямая: продали 10 бумаг — купили 11.',
            'Купоны тоже не копим на счёте, а реинвестируем сюда же — машина работает и на них.'
        ]
    },
    st: {
        cap: 'Позиция <b>100 000 ₽</b> · пример',
        out: { tag: 'Продаём', t: 'GAZP', sub: 'дошла до справедливой цены', k: 'Потенциал', v: '+8%', tone: 'warn' },
        in:  { tag: 'Покупаем', t: 'MRKC', sub: 'тот же эшелон риска', k: 'Потенциал', v: '+153%', tone: 'good' },
        stats: [
            { l: 'Потенциал позиции', a: '+8%', b: '+153%', d: '×19' },
            { l: 'Оценка при росте', a: '108 000 ₽', b: '253 000 ₽', d: '+145 000 ₽' },
            { l: 'Эшелон риска', a: 'II', b: 'II', d: 'не меняем' }
        ],
        punch: 'Тот же приём, что и в облигациях: забираем реализованный рост и переносим деньги туда, где потенциал ещё не отыгран. Риск при этом не растёт — эшелон прежний.',
        rules: [
            'У каждой бумаги есть потенциал роста до справедливой цены — он виден в таблице кандидатов.',
            'Потенциал реализован — фиксируем прибыль и берём бумагу с наибольшим апсайдом внутри того же эшелона.',
            'Эшелон сохраняем: риск остаётся распределён по плану.'
        ]
    }
};

const rbxiState = { mode: 'ofz', done: false };

function rbxInsidePick(mode) {
    rbxiState.mode = mode;
    rbxiState.done = false;
    document.querySelectorAll('#rbxAcademy .rbxi-sg').forEach(b => b.classList.toggle('act', b.dataset.imode === mode));
    rbxInsideRender();
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}
window.rbxInsidePick = rbxInsidePick;

function rbxInsideAct() {
    rbxiState.done = !rbxiState.done;
    rbxInsideRender();
    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
}
window.rbxInsideAct = rbxInsideAct;

function rbxInsideRender() {
    const d = RBXI_DEMO[rbxiState.mode];
    if (!d) return;
    const done = rbxiState.done;

    const card = (c, dim) => '<div class="rbxi-tag">' + c.tag + '</div>'
        + '<div class="rbxi-t">' + c.t + '</div>'
        + '<div class="rbxi-sub">' + c.sub + '</div>'
        + '<div class="rbxi-kv ' + c.tone + '"><span>' + c.k + '</span><b>' + c.v + '</b></div>';

    const out = document.getElementById('rbxiOut');
    const inn = document.getElementById('rbxiIn');
    if (out) { out.innerHTML = card(d.out); out.classList.toggle('dim', done); }
    if (inn) { inn.innerHTML = card(d.in); inn.classList.toggle('hi', done); }

    const arrow = document.getElementById('rbxiArrow');
    if (arrow) arrow.classList.toggle('go', done);

    const cap = document.getElementById('rbxiCap');
    if (cap) cap.innerHTML = d.cap;

    // вывод-«машина денег» — только после обмена: до него выводить нечего
    const punch = document.getElementById('rbxiPunch');
    if (punch) {
        punch.innerHTML = d.punch;
        punch.classList.toggle('on', done);
    }

    const stats = document.getElementById('rbxiStats');
    if (stats) {
        // строку, где значение не меняется (эшелон), не зачёркиваем — менять там нечего
        stats.innerHTML = d.stats.map(s =>
            '<div class="rbxi-stat' + (done ? ' done' : '') + (s.a === s.b ? ' same' : '') + '">'
            + '<span class="l">' + s.l + '</span>'
            + '<span class="v"><em>' + s.a + '</em>'
            + (done ? '<i class="ar">→</i><b>' + s.b + '</b><u>' + s.d + '</u>' : '') + '</span>'
            + '</div>'
        ).join('');
    }

    const btn = document.getElementById('rbxiDo');
    if (btn) {
        btn.textContent = done ? 'Показать как было' : 'Обменять';
        btn.classList.toggle('done', done);
    }

    const rules = document.getElementById('rbxiRules');
    if (rules) rules.innerHTML = d.rules.map(r => '<li>' + r + '</li>').join('');
}

// ── Раздел 3: автопрогон примера по шагам ────────────────────────────────
let rbxaPlayTimer = null;

function rbxAcademyPlay() {
    if (rbxaPlayTimer) { rbxAcademyStopPlay(); return; }
    let n = 1;
    rbxAcademyStep(1, true);
    rbxAcademyPlayBtn(true);
    rbxaPlayTimer = setInterval(() => {
        n++;
        if (n > 4) { rbxAcademyStopPlay(); return; }
        rbxAcademyStep(n, true);
    }, 2200);
}
window.rbxAcademyPlay = rbxAcademyPlay;

function rbxAcademyStopPlay() {
    if (rbxaPlayTimer) { clearInterval(rbxaPlayTimer); rbxaPlayTimer = null; }
    rbxAcademyPlayBtn(false);
}

function rbxAcademyPlayBtn(playing) {
    const btn = document.getElementById('rbxaPlay');
    const tx = document.getElementById('rbxaPlayTx');
    if (btn) btn.classList.toggle('playing', playing);
    if (tx) tx.textContent = playing ? 'Стоп' : 'Проиграть';
}

// ── Раздел 3: живой пример годовой ребалансировки ────────────────────────
// Шаги считаются от ползунка «Акции за год» (rbxaState.growth), поэтому
// сценарий рабочий в обе стороны: на росте ребаланс продаёт акции, на
// падении — покупает. Старт всегда 100 000 ₽ по плану 50/50.
const RBXA_START = 50000;      // акции на старте
const RBXA_OFZ_YEAR = 0.18;    // ОФЗ за год: купоны, константа сценария

const rbxaState = { step: 1, growth: 50 };

// Все числа шага из одного расчёта — чтобы подписи не разъезжались с суммами
function rbxaCalc() {
    const g = rbxaState.growth / 100;
    const stYear = RBXA_START * (1 + g);
    const ofzYear = RBXA_START * (1 + RBXA_OFZ_YEAR);
    const total = stYear + ofzYear;
    const half = total / 2;
    const trade = Math.abs(stYear - half);
    return {
        g: rbxaState.growth,
        stYear, ofzYear, total, half, trade,
        pctYear: Math.round(stYear / total * 100),
        sellStocks: stYear > half        // на росте продаём акции, на падении — докупаем
    };
}

const rbxaMoney = v => Math.round(v).toLocaleString('ru-RU') + ' ₽';
const rbxaPct = v => (v > 0 ? '+' : '') + v + '%';

// Тексты и суммы шага. Возвращает готовое состояние сцены.
function rbxaScene(n) {
    const c = rbxaCalc();
    const dir = c.sellStocks ? 'выросли' : 'просели';

    if (n === 1) {
        return {
            st: RBXA_START, ofz: RBXA_START,
            market: 'Собрали портфель по плану 50/50: 50 000 ₽ в акциях, 50 000 ₽ в ОФЗ — риск ровно тот, на который мы готовы.',
            action: 'Ничего не делаем. Между сверками работает только умная замена внутри классов.'
        };
    }
    if (n === 2) {
        return {
            st: c.stYear, ofz: c.ofzYear,
            market: 'Акции за год ' + dir + ' на ' + rbxaPct(c.g) + ', ОФЗ принесли +18% купонами. Доля акций стала <b>' + c.pctYear + '%</b> вместо 50%.',
            action: c.pctYear === 50
                ? 'Доли совпали с планом сами — редкий случай, делать нечего.'
                : (c.sellStocks
                    ? 'Портфель рискованнее плана: акций стало слишком много. Подошла годовая сверка.'
                    : 'Портфель консервативнее плана: акции просели и весят меньше положенного. Подошла годовая сверка.')
        };
    }
    if (n === 3) {
        return {
            st: c.half, ofz: c.half,
            market: 'Цены прежние — меняем только структуру портфеля.',
            action: c.trade < 500
                ? 'Отклонение меньше 500 ₽ — сделка не окупит комиссий. Оставляем как есть.'
                : (c.sellStocks
                    ? 'Продаём акции на <b>' + rbxaMoney(c.trade) + '</b> и перекладываем в ОФЗ. Портфель снова 50/50.'
                    : 'Продаём ОФЗ на <b>' + rbxaMoney(c.trade) + '</b> и докупаем подешевевшие акции. Портфель снова 50/50.')
        };
    }
    return {
        st: c.half, ofz: c.half,
        market: c.sellStocks
            ? 'Прибыль от роста акций «переехала» в надёжные облигации.'
            : 'Акции куплены дёшево — на отскоке это принесёт больше, чем простое ожидание.',
        action: c.sellStocks
            ? 'Риск снова по плану. Упадут акции — сделаем зеркально: продадим часть ОФЗ и купим акции дёшево.'
            : 'Риск снова по плану. Вырастут акции — сделаем зеркально: зафиксируем прибыль и переложим в ОФЗ.'
    };
}

// Ползунок «Акции за год» — пересчитывает текущий шаг на месте
function rbxAcademyGrowth(v) {
    rbxaState.growth = parseInt(v, 10) || 0;
    const tx = document.getElementById('rbxaGrowthTx');
    if (tx) {
        tx.textContent = rbxaPct(rbxaState.growth);
        tx.classList.toggle('neg', rbxaState.growth < 0);
    }
    rbxAcademyStep(rbxaState.step, true);   // не сбивает автопрогон: сцену только пересчитываем
}
window.rbxAcademyGrowth = rbxAcademyGrowth;

// fromPlay ставит автопрогон; ручной клик по шагу его останавливает
function rbxAcademyStep(n, fromPlay) {
    if (n < 1 || n > 4) return;
    if (!fromPlay) rbxAcademyStopPlay();
    rbxaState.step = n;
    const scene = rbxaScene(n);
    document.querySelectorAll('#rbxAcademy .rbxa-step').forEach(btn => {
        btn.classList.toggle('act', btn.dataset.astep === String(n));
    });
    const total = scene.st + scene.ofz;
    const stPct = Math.round(scene.st / total * 100);
    const put = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };
    put('rbxaSimSt', rbxaMoney(scene.st));
    put('rbxaSimOfz', rbxaMoney(scene.ofz));
    put('rbxaSimTotal', rbxaMoney(total));
    put('rbxaSimShares', stPct + '% / ' + (100 - stPct) + '%');
    put('rbxaSimMarket', scene.market);
    put('rbxaSimAction', scene.action);
    const stBar = document.getElementById('rbxaSimStBar');
    const ofzBar = document.getElementById('rbxaSimOfzBar');
    if (stBar) stBar.style.width = stPct + '%';
    if (ofzBar) ofzBar.style.width = (100 - stPct) + '%';
    // перекос долей подсвечиваем — это и есть повод для годовой сверки
    const boxes = document.querySelector('#rbxAcademy .rbxa-sim-boxes');
    if (boxes) boxes.classList.toggle('skew', stPct !== 50);
    // итог портфеля против «ничего не делали» — виден на шагах 3 и 4
    const gain = document.getElementById('rbxaSimGain');
    if (gain) {
        const c = rbxaCalc();
        const show = n >= 3 && c.trade >= 500;
        gain.classList.toggle('on', show);
        if (show) {
            gain.innerHTML = c.sellStocks
                ? 'Зафиксировали <b>' + rbxaMoney(c.trade) + '</b> прибыли акций — теперь эти деньги платят купоны, а не зависят от рынка.'
                : 'Купили акции на <b>' + rbxaMoney(c.trade) + '</b> по низким ценам — на восстановлении рынка это работает на нас.';
        }
    }
}

// Закрытие академии по Esc (карточка тикера обрабатывается своим слушателем)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const panel = document.getElementById('rbxAcademy');
        if (panel && panel.classList.contains('open')) rbxAcademyClose();
    }
});
