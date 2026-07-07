// ===== ГЛОБАЛЬНЫЙ ПОИСК (ARC-style палитра, Cmd/Ctrl+T или +K) =====
// Вынесен из webapp-tabs.js при декомпозиции.
// Контракт загрузки: после webapp-tabs.js. Использует в рантайме searchAssets
// (core.js/data.js), openBondDetail/openStockDetail (терминалы), echelonTableData.

// ===== TOP SEARCH (ARC-style floating palette с живыми результатами) =====
let _searchResults = [];   // текущий набор совпадений
let _searchActive = -1;    // индекс подсвеченного результата (для стрелок)

function openTopSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    const inp = document.getElementById('searchInput');
    if (inp) {
        inp.value = '';
        setTimeout(() => inp.focus(), 60);
    }
    renderSearchResults('');
}

function closeTopSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.classList.remove('open');
    const box = document.getElementById('searchResults');
    if (box) box.classList.remove('show');
    _searchResults = [];
    _searchActive = -1;
}

// Рендер живого списка под полем ввода
function renderSearchResults(query) {
    const box = document.getElementById('searchResults');
    if (!box) return;

    query = (query || '').trim();
    if (query.length < 1) {
        _searchResults = [];
        _searchActive = -1;
        box.classList.remove('show');
        box.innerHTML = '';
        return;
    }

    _searchResults = (typeof searchAssets === 'function') ? searchAssets(query).slice(0, 8) : [];
    _searchActive = _searchResults.length ? 0 : -1;
    box.classList.add('show');

    if (!_searchResults.length) {
        box.innerHTML = '<div class="search-res-empty">Ничего не найдено по «' +
            query.replace(/</g, '&lt;') + '»</div>';
        return;
    }

    const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="12 3 14.85 8.78 21.23 9.71 16.61 14.21 17.7 20.56 12 17.56 6.3 20.56 7.39 14.21 2.77 9.71 9.15 8.78 12 3"/></svg>';

    let html = _searchResults.map((r, i) => {
        const isBond = r.type === 'Облигация';
        const badge = (r.t || '').slice(0, 4).toUpperCase();
        const fav = searchItemFav(r);
        return '<div class="search-res-item' + (i === _searchActive ? ' active' : '') +
            '" data-idx="' + i + '" onmouseenter="setSearchActive(' + i + ')" onclick="chooseSearchResult(' + i + ')">' +
            '<div class="search-res-badge' + (isBond ? ' bond' : '') + '">' + badge + '</div>' +
            '<div class="search-res-main">' +
                '<div class="search-res-ticker">' + (r.t || '') + '</div>' +
                '<div class="search-res-name">' + (r.n || '') + '</div>' +
            '</div>' +
            '<div class="search-res-type">' + r.type + '</div>' +
            '<button class="search-res-fav' + (fav ? ' active' : '') + '" type="button" data-idx="' + i +
                '" title="' + (fav ? 'Убрать из избранного' : 'В избранное') +
                '" onclick="toggleSearchFav(' + i + ', event)">' + STAR_SVG + '</button>' +
        '</div>';
    }).join('');
    html += '<div class="search-res-hint"><kbd>↑↓</kbd> выбрать · <kbd>↵</kbd> открыть · <kbd>esc</kbd> закрыть</div>';
    box.innerHTML = html;
}

// Проверить, в избранном ли элемент (акции → stk_fav_v1, облигации → bnd_fav_v1 по ISIN)
function searchItemFav(item) {
    if (!item || !item.t) return false;
    if (item.type === 'Облигация') {
        return (typeof window.bndGetFavorites === 'function') &&
               window.bndGetFavorites().indexOf(item.t) !== -1;
    }
    return (typeof window.stkGetFavorites === 'function') &&
           window.stkGetFavorites().indexOf(item.t) !== -1;
}

// Добавить/убрать из избранного прямо из выпадающей карточки
function toggleSearchFav(i, ev) {
    if (ev) ev.stopPropagation();
    const item = _searchResults[i];
    if (!item || !item.t) return;
    let nowFav = false;
    if (item.type === 'Облигация') {
        if (typeof window.bndToggleFav === 'function') nowFav = window.bndToggleFav(item.t);
    } else {
        if (typeof window.stkToggleFav === 'function') nowFav = window.stkToggleFav(item.t);
    }
    const btn = document.querySelector('#searchResults .search-res-fav[data-idx="' + i + '"]');
    if (btn) {
        btn.classList.toggle('active', nowFav);
        btn.title = nowFav ? 'Убрать из избранного' : 'В избранное';
    }
}

function setSearchActive(i) {
    _searchActive = i;
    document.querySelectorAll('#searchResults .search-res-item').forEach(el => {
        el.classList.toggle('active', +el.dataset.idx === i);
    });
}

function chooseSearchResult(i) {
    const item = _searchResults[i];
    if (!item) return;
    closeTopSearch();

    if (item.type === 'Облигация') {
        // Боковая панель об облигации
        if (typeof openBondDetail === 'function') openBondDetail(item);
        else openCompanyPage(item, item.t || '');
        return;
    }

    // Акция — боковая панель о компании
    if (typeof openStockDetail === 'function') {
        openStockDetail(item.t, searchEchelonOf(item.t));
    } else {
        openCompanyPage(item, item.t || '');
    }
}

// Определить эшелон (1..4) тикера по таблице эшелонов — для цвета бейджа в панели
function searchEchelonOf(ticker) {
    if (typeof echelonTableData === 'undefined' || !echelonTableData) return 1;
    for (let i = 0; i < echelonTableData.length; i++) {
        if (echelonTableData[i].some(it => it.t === ticker)) return i + 1;
    }
    return 1;
}

// Живой поиск по мере ввода
function handleTopSearchInput(event) {
    renderSearchResults(event.target.value);
}

// Навигация клавиатурой
function handleTopSearchKeydown(event) {
    const key = event.key;
    if (key === 'Escape') {
        event.preventDefault();
        closeTopSearch();
        return;
    }
    if (key === 'ArrowDown') {
        event.preventDefault();
        if (_searchResults.length) setSearchActive((_searchActive + 1) % _searchResults.length);
        return;
    }
    if (key === 'ArrowUp') {
        event.preventDefault();
        if (_searchResults.length) setSearchActive((_searchActive - 1 + _searchResults.length) % _searchResults.length);
        return;
    }
    if (key === 'Enter') {
        event.preventDefault();
        const query = event.target.value.trim();
        if (_searchActive >= 0 && _searchResults[_searchActive]) {
            chooseSearchResult(_searchActive);
        } else if (query) {
            closeTopSearch();
            performSearch(query);
        }
    }
}

// legacy: нижняя строка поиска (tickerSearchInput)
function handleSearchKeyup(event) {
    if (event.keyCode === 13) {
        const query = event.target.value.trim();
        if (query) performSearch(query);
    }
}

// legacy compat
function handleTopSearchKeyup(event) {}
window.expandSearch = openTopSearch;
window.collapseSearch = closeTopSearch;
window.setSearchActive = setSearchActive;
window.chooseSearchResult = chooseSearchResult;
window.searchItemFav = searchItemFav;
window.toggleSearchFav = toggleSearchFav;
window.handleTopSearchInput = handleTopSearchInput;
window.handleTopSearchKeydown = handleTopSearchKeydown;

// Глобальный хоткей: Cmd/Ctrl+T (как просили) и Cmd/Ctrl+K (надёжный фолбэк —
// Cmd+T часто перехватывается браузером под «новую вкладку») открывают/закрывают поиск.
if (!window._searchHotkeyBound) {
    window._searchHotkeyBound = true;
    document.addEventListener('keydown', function (e) {
        if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
        const k = (e.key || '').toLowerCase();
        if (k !== 't' && k !== 'k') return;
        e.preventDefault();
        const overlay = document.getElementById('searchOverlay');
        if (overlay && overlay.classList.contains('open')) closeTopSearch();
        else openTopSearch();
    });
}
