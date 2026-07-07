// =============================================
// USERS API — Registration & Dashboard System
// =============================================

// USERS_API_URL и isApiConfigured перенесены выше (до checkFirstVisit)

// =============================================
// ПРОВЕРКА РЕГИСТРАЦИИ ПРИ ЗАПУСКЕ
// =============================================
async function checkUserRegistration(telegramId) {
    // Сначала проверяем localStorage (быстрый кэш)
    const cached = localStorage.getItem('user_registered');
    
    if (!isApiConfigured()) {
        // API не настроен — работаем только через localStorage
        if (cached) {
            try {
                window._currentUser = JSON.parse(cached);
                window._isRegistered = true;
                isFirstVisit = false;
                document.getElementById('navWrapper').style.display = 'flex';
                populateDashboard(window._currentUser);
                showScreen('screen-dashboard');
                return;
            } catch(e) { /* corrupted cache */ }
        }
        isFirstVisit = true;
        showScreen('screen-home');
        return;
    }
    
    try {
        const url = `${USERS_API_URL}?action=check_user&telegram_id=${telegramId}`;
        const response = await fetch(url, { redirect: 'follow', mode: 'cors' });
        
        // Google Apps Script может вернуть HTML вместо JSON если что-то не так
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch(parseErr) {
            console.error('API returned non-JSON:', text.substring(0, 200));
            throw new Error('Invalid API response');
        }
        
        // Проверяем что ответ от правильного API (должен иметь поле 'registered')
        if (!('registered' in data)) {
            console.error('API response missing "registered" field — wrong endpoint?');
            throw new Error('Wrong API endpoint');
        }
        
        if (data.success && data.registered) {
            const user = data.user;
            
            if (user.status === 'deleted' || user.status === 'blocked') {
                window._isRegistered = false;
                window._currentUser = null;
                localStorage.removeItem('user_registered');
                localStorage.removeItem('user_visited');
                isFirstVisit = true;
                showScreen('screen-home');
                return;
            }
            
            window._currentUser = user;
            window._isRegistered = true;
            isFirstVisit = false;
            localStorage.setItem('user_registered', JSON.stringify(user));

            document.getElementById('navWrapper').style.display = 'flex';
            populateDashboard(user);
            // Навигируем на дашборд только если пользователь ещё на стартовых экранах
            const _initScreens = ['screen-home', 'screen-register', 'screen-dashboard'];
            if (_initScreens.includes(currentScreen)) {
                showScreen('screen-dashboard');
            }
        } else {
            window._isRegistered = false;
            localStorage.removeItem('user_registered');
            localStorage.removeItem('user_visited');
            isFirstVisit = true;
            showScreen('screen-home');
        }
    } catch (err) {
        console.error('Error checking user:', err);
        if (cached) {
            try {
                window._currentUser = JSON.parse(cached);
                window._isRegistered = true;
                isFirstVisit = false;
                document.getElementById('navWrapper').style.display = 'flex';
                populateDashboard(window._currentUser);
                const _initScreens2 = ['screen-home', 'screen-register', 'screen-dashboard'];
                if (_initScreens2.includes(currentScreen)) {
                    showScreen('screen-dashboard');
                }
            } catch(e) {
                isFirstVisit = true;
                showScreen('screen-home');
            }
        } else {
            isFirstVisit = true;
            showScreen('screen-home');
        }
    }
}

// =============================================
// ОТКРЫТЬ TERMINAL ИЛИ РЕГИСТРАЦИЮ
// =============================================
function openTerminalOrRegister() {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
    
    if (window._isRegistered && window._currentUser) {
        // Уже зарегистрирован — сразу на дашборд, регистрация недоступна
        document.getElementById('navWrapper').style.display = 'flex';
        showScreen('screen-dashboard');
    } else {
        // Предзаполняем имя из Telegram
        const tg = window.Telegram?.WebApp;
        const user = tg?.initDataUnsafe?.user;
        if (user) {
            const fn = document.getElementById('regFirstName');
            const ln = document.getElementById('regLastName');
            if (fn && user.first_name) fn.value = user.first_name;
            if (ln && user.last_name) ln.value = user.last_name || '';
        }
        showScreen('screen-register');
    }
}

// =============================================
// ВЫБОР БРОКЕРА
// =============================================
function selectBroker(card) {
    // Legacy fallback — redirect to waterfall
}

// =============================================
// BROKER WATERFALL ACCORDION
// =============================================
function toggleBrokerList() {
    const container = document.getElementById('brokerWaterfall');
    const arrow = document.getElementById('brokerMainArrow');
    if (!container) return;
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    
    container.classList.toggle('show');
    arrow.classList.toggle('open');
}

function selectBrokerWaterfall(card, brokerId, brokerName, logoClass) {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    
    // Убираем selected у всех
    document.querySelectorAll('#brokerWaterfall .strategy-option-card').forEach(c => c.classList.remove('selected-in-list'));
    card.classList.add('selected-in-list');
    
    window._selectedBroker = brokerId;
    
    // Обновляем главную карточку
    const mainCard = document.getElementById('brokerMainCard');
    const mainName = document.getElementById('brokerMainName');
    const mainLogoWrap = document.getElementById('brokerMainLogo');
    
    if (mainName) mainName.textContent = brokerName;
    if (mainLogoWrap) {
        const letters = {'t-invest':'Т','alor':'A','finam':'F','bcs':'Б','alfa':'A'};
        // Заменяем placeholder на обычный broker-logo
        mainLogoWrap.className = 'broker-logo ' + logoClass;
        mainLogoWrap.innerHTML = '<span>' + (letters[brokerId] || '?') + '</span>';
    }
    if (mainCard) mainCard.classList.add('has-selection');
    
    // Закрываем waterfall
    setTimeout(() => {
        document.getElementById('brokerWaterfall').classList.remove('show');
        document.getElementById('brokerMainArrow').classList.remove('open');
    }, 200);
}

// =============================================
// ВЫБОР ПЛАНА
// =============================================
function selectPlan(card) {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    window._selectedPlan = card.dataset.plan;
}

// =============================================
// ОТПРАВКА РЕГИСТРАЦИИ
// =============================================
async function submitRegistration() {
    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    
    if (!firstName) { showDashToast('Введите имя', true); return; }
    if (!window._selectedBroker) { showDashToast('Выберите брокера', true); return; }
    
    const tg = window.Telegram?.WebApp;
    const telegramUser = tg?.initDataUnsafe?.user;
    
    document.getElementById('regLoading').classList.add('active');
    document.getElementById('btnRegister').disabled = true;
    
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
    
    // Формируем объект пользователя
    const now = new Date();
    const planDays = { trial: 90, monthly: 30, yearly: 365 };
    const endDate = new Date(now.getTime() + (planDays[window._selectedPlan] || 90) * 86400000);
    
    const localUser = {
        telegram_id: telegramUser ? telegramUser.id : 'local_' + Date.now(),
        username: telegramUser?.username ? '@' + telegramUser.username : '',
        first_name: firstName,
        last_name: lastName,
        broker: window._selectedBroker,
        plan: window._selectedPlan,
        plan_start: now.toISOString().split('T')[0],
        plan_end: endDate.toISOString().split('T')[0],
        status: 'active',
        registered_at: now.toISOString().split('T')[0]
    };
    
    if (!isApiConfigured()) {
        // API не настроен — регистрация только локально
        window._currentUser = localUser;
        window._isRegistered = true;
        isFirstVisit = false;
        localStorage.setItem('user_registered', JSON.stringify(localUser));
        localStorage.setItem('user_visited', 'true');
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        
        document.getElementById('regLoading').classList.remove('active');
        document.getElementById('btnRegister').disabled = false;
        document.getElementById('navWrapper').style.display = 'flex';
        populateDashboard(localUser);
        showScreen('screen-dashboard');
        return;
    }
    
    if (!telegramUser) { 
        showDashToast('Откройте через Telegram', true); 
        document.getElementById('regLoading').classList.remove('active');
        document.getElementById('btnRegister').disabled = false;
        return; 
    }
    
    try {
        const params = new URLSearchParams({
            action: 'register',
            telegram_id: telegramUser.id,
            username: telegramUser.username ? '@' + telegramUser.username : '',
            first_name: firstName,
            last_name: lastName,
            broker: window._selectedBroker,
            plan: window._selectedPlan
        });
        
        const response = await fetch(`${USERS_API_URL}?${params.toString()}`, { redirect: 'follow', mode: 'cors' });
        const regText = await response.text();
        let data;
        try { data = JSON.parse(regText); } catch(pe) { throw new Error('Invalid API response'); }
        
        if (data.success) {
            window._currentUser = data.user;
            window._isRegistered = true;
            isFirstVisit = false;
            
            localStorage.setItem('user_registered', JSON.stringify(data.user));
            localStorage.setItem('user_visited', 'true');
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            
            document.getElementById('navWrapper').style.display = 'flex';
            populateDashboard(data.user);
            showScreen('screen-dashboard');
        } else {
            showDashToast(data.error || 'Ошибка регистрации', true);
        }
    } catch (err) {
        console.error('Registration error:', err);
        // При ошибке сети — сохраняем локально
        window._currentUser = localUser;
        window._isRegistered = true;
        isFirstVisit = false;
        localStorage.setItem('user_registered', JSON.stringify(localUser));
        localStorage.setItem('user_visited', 'true');
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        
        document.getElementById('navWrapper').style.display = 'flex';
        populateDashboard(localUser);
        showScreen('screen-dashboard');
    } finally {
        document.getElementById('regLoading').classList.remove('active');
        document.getElementById('btnRegister').disabled = false;
    }
}

// =============================================
// ЗАПОЛНЕНИЕ ДАШБОРДА
// =============================================
function populateDashboard(user) {
    if (!user) return;
    
    document.getElementById('dashFirstName').textContent = user.first_name || '—';
    document.getElementById('dashLastName').textContent = user.last_name || '—';
    
    const statusPill = document.getElementById('dashStatusPill');
    const statusText = document.getElementById('dashStatusText');
    if (user.status === 'active') {
        statusPill.classList.remove('expired');
        statusText.textContent = 'Active';
    } else {
        statusPill.classList.add('expired');
        statusText.textContent = user.status === 'expired' ? 'Expired' : 'Inactive';
    }
    
    document.getElementById('dashProfileName').textContent = 
        (user.first_name || '') + ' ' + (user.last_name || '');
    document.getElementById('dashProfileTg').textContent = user.username || '—';
    
    const brokerNames = { 't-invest': 'Т-Инвестиции', 'alor': 'АЛОР Брокер', 'finam': 'Финам', 'bcs': 'БКС', 'alfa': 'Альфа-Инвестиции' };
    document.getElementById('dashProfileBroker').textContent = brokerNames[user.broker] || user.broker || '—';
    document.getElementById('dashProfileDate').textContent = user.registered_at || '—';
    
    const planNames = { 'trial': 'Пробный', 'monthly': 'Ежемесячная', 'yearly': 'Годовая' };
    document.getElementById('dashSubPlan').textContent = planNames[user.plan] || user.plan;
    
    const subBadge = document.getElementById('dashSubBadge');
    if (user.status === 'active') {
        subBadge.textContent = 'Active';
        subBadge.classList.remove('expired');
    } else {
        subBadge.textContent = 'Expired';
        subBadge.classList.add('expired');
    }
    
    document.getElementById('dashSubStart').textContent = formatDateRu(user.plan_start);
    document.getElementById('dashSubEnd').textContent = formatDateRu(user.plan_end);
    
    document.querySelectorAll('.dash-plan-option').forEach(opt => {
        opt.classList.remove('current');
        if (opt.dataset.plan === user.plan) opt.classList.add('current');
    });
    
    if (user.api_token) document.getElementById('dashTokenInput').value = user.api_token;
    updateBrokerInstructions(user.broker);
    
    // Sync bento widgets
    syncBentoSub(user);
    syncBentoRing();
    syncBentoMarketData();
    updateDashDatePill();
    syncSettingsBadges(user);
}

function formatDateRu(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch(e) { return dateStr; }
}

function updateBrokerInstructions(broker) {
    const instructions = {
        't-invest': `<strong>Т-Инвестиции (T-Invest API):</strong><br><strong>1.</strong> Откройте <strong>tinkoff.ru/invest</strong> → Настройки<br><strong>2.</strong> Раздел «Токен для API»<br><strong>3.</strong> Нажмите «Выпустить токен» → «Только чтение»<br><strong>4.</strong> Скопируйте и вставьте выше`,
        'alor': `<strong>АЛОР Брокер (ALOR OpenAPI):</strong><br><strong>1.</strong> Войдите в <strong>lk.alor.ru</strong><br><strong>2.</strong> Настройки → API<br><strong>3.</strong> Создайте Refresh Token<br><strong>4.</strong> Скопируйте и вставьте выше`,
        'finam': `<strong>Финам (Trading API):</strong><br><strong>1.</strong> Войдите в <strong>my.finam.ru</strong><br><strong>2.</strong> Настройки → Торговые API<br><strong>3.</strong> Создайте ключ с правами чтения<br><strong>4.</strong> Скопируйте и вставьте выше`,
        'bcs': `<strong>БКС (BCS Trade API):</strong><br><strong>1.</strong> Войдите в <strong>bcs.ru/trade-api</strong><br><strong>2.</strong> Зарегистрируйтесь в API<br><strong>3.</strong> Получите токен доступа<br><strong>4.</strong> Скопируйте и вставьте выше`,
        'alfa': `<strong>Альфа-Инвестиции:</strong><br><strong>1.</strong> Войдите в <strong>Альфа-Инвестиции</strong> в личный кабинет<br><strong>2.</strong> Перейдите в Настройки → API<br><strong>3.</strong> Создайте токен с правами чтения<br><strong>4.</strong> Скопируйте и вставьте выше`
    };
    const el = document.getElementById('brokerInstructionText');
    if (el && instructions[broker]) el.innerHTML = instructions[broker];
}

// =============================================
// СМЕНА ПОДПИСКИ
// =============================================
async function changePlan(newPlan) {
    if (!window._currentUser || window._currentUser.plan === newPlan) return;
    if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
    
    try {
        const params = new URLSearchParams({
            action: 'update_subscription',
            telegram_id: window._currentUser.telegram_id,
            plan: newPlan
        });
        const response = await fetch(`${USERS_API_URL}?${params.toString()}`);
        const data = await response.json();
        
        if (data.success) {
            window._currentUser.plan = newPlan;
            window._currentUser.plan_start = data.plan_start;
            window._currentUser.plan_end = data.plan_end;
            window._currentUser.status = 'active';
            localStorage.setItem('user_registered', JSON.stringify(window._currentUser));
            populateDashboard(window._currentUser);
            showDashToast('Подписка обновлена');
            if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        } else { showDashToast(data.error || 'Ошибка', true); }
    } catch (err) { showDashToast('Ошибка сети', true); }
}

// =============================================
// СОХРАНЕНИЕ API ТОКЕНА
// =============================================
async function saveApiToken() {
    if (!window._currentUser) return;
    const token = document.getElementById('dashTokenInput').value.trim();
    
    try {
        const params = new URLSearchParams({
            action: 'update_token',
            telegram_id: window._currentUser.telegram_id,
            api_token: token
        });
        const response = await fetch(`${USERS_API_URL}?${params.toString()}`);
        const data = await response.json();
        
        if (data.success) {
            window._currentUser.api_token = token;
            localStorage.setItem('user_registered', JSON.stringify(window._currentUser));
            showDashToast('Токен сохранён');
            if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        } else { showDashToast('Ошибка сохранения', true); }
    } catch (err) { showDashToast('Ошибка сети', true); }
}

// =============================================
// DASHBOARD SETTINGS ACCORDION
// =============================================
// =============================================
// BENTO DASHBOARD WIDGETS
// =============================================

// Date pill
function updateDashDatePill() {
    const el = document.getElementById('dashDatePill');
    if (!el) return;
    const now = new Date();
    const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    const days = ['вс','пн','вт','ср','чт','пт','сб'];
    el.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}
updateDashDatePill();

// Portfolio Ring Chart (canvas donut)
function drawBentoRing(bondsPct) {
    const canvas = document.getElementById('bentoRingCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w/2, cy = h/2, r = 62, lw = 14;
    ctx.clearRect(0, 0, w, h);
    
    if (bondsPct === null) {
        // No calculation yet — draw placeholder ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const isDark = document.body.classList.contains('dark-mode');
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Dashed hint segments  
        ctx.setLineDash([8, 20]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + Math.PI * 1.2);
        ctx.strokeStyle = isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.12)';
        ctx.lineWidth = lw;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI/2 + Math.PI * 1.3, -Math.PI/2 + Math.PI * 2);
        ctx.strokeStyle = isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.12)';
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Update labels
        const pctEl = document.getElementById('bentoRingPct');
        const lblEl = document.querySelector('.bento-ring-label');
        if (pctEl) pctEl.textContent = '—';
        if (lblEl) lblEl.textContent = 'расчёт';
        return;
    }
    
    const stocksPct = 100 - bondsPct;
    const bondRad = (bondsPct / 100) * Math.PI * 2;
    const gap = 0.04; // small gap between segments
    
    // Bonds arc (blue)
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI/2 + gap/2, -Math.PI/2 + bondRad - gap/2);
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Stocks arc (green)
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI/2 + bondRad + gap/2, -Math.PI/2 + Math.PI*2 - gap/2);
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Update label
    const pctEl = document.getElementById('bentoRingPct');
    const lblEl = document.querySelector('.bento-ring-label');
    if (pctEl) pctEl.textContent = bondsPct + '%';
    if (lblEl) lblEl.textContent = 'облигации';
}

// Sync ring with portfolio data
function syncBentoRing() {
    // Check if portfolio was ever calculated
    const slider = document.getElementById('bondsSlider');
    const hasCalculation = window.isPortfolioCalculated || 
                           (window._lastCalcResult && window._lastCalcResult.bonds);
    
    if (hasCalculation && slider) {
        drawBentoRing(parseInt(slider.value) || 60);
    } else {
        drawBentoRing(null); // placeholder
    }
}

// Sync market data to quiet strip
function syncBentoMarketData() {
    // Quiet strip — IMOEX
    const imoexSrc = document.getElementById('val-imoex');
    const imoexQs = document.getElementById('dqs-imoex');
    if (imoexSrc && imoexQs && imoexSrc.textContent !== '---') {
        imoexQs.textContent = imoexSrc.textContent;
    }
    
    // Quiet strip — USD/RUB
    const usdSrc = document.getElementById('val-usdrub');
    const usdQs = document.getElementById('dqs-usd');
    if (usdSrc && usdQs && usdSrc.textContent !== '---') {
        usdQs.textContent = usdSrc.textContent;
    }
    
    // Quiet strip — BTC
    const btcSrc = document.getElementById('val-btc');
    const btcQs = document.getElementById('dqs-btc');
    if (btcSrc && btcQs && btcSrc.textContent !== '---') {
        btcQs.textContent = btcSrc.textContent;
    }
}

// Sync subscription mini card  
function syncBentoSub(user) {
    if (!user) return;
    const planNames = { 'trial': 'Trial', 'monthly': 'Monthly', 'yearly': 'Yearly' };
    const planEl = document.getElementById('bentoSubPlan');
    const badgeEl = document.getElementById('bentoSubBadge');
    const endEl = document.getElementById('bentoSubEnd');
    
    if (planEl) planEl.textContent = planNames[user.plan] || user.plan;
    if (badgeEl) {
        if (user.status === 'active') {
            badgeEl.textContent = 'Active';
            badgeEl.classList.remove('expired');
        } else {
            badgeEl.textContent = 'Expired';
            badgeEl.classList.add('expired');
        }
    }
    if (endEl) endEl.textContent = formatDateRu(user.plan_end);
}

// Market data sync interval
setInterval(syncBentoMarketData, 2000);

// Hook into populateDashboard to sync bento widgets
const _origPopulateDashboard = typeof populateDashboard === 'function' ? populateDashboard : null;

// Toggle entire settings panel
function toggleDashSettingsPanel() {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    const panel = document.getElementById('dashSettingsPanel');
    const link = document.querySelector('.dash-settings-link');
    if (!panel) return;
    
    panel.classList.toggle('open');
    if (link) link.classList.toggle('dsl-open');
    
    // Close inner panels when closing
    if (!panel.classList.contains('open')) {
        document.querySelectorAll('.ds-expand-panel').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.dash-settings-row').forEach(r => r.classList.remove('ds-open'));
    }
}

// New settings panel toggle
function toggleSettingsPanel(panelId, rowEl) {
    if (window.Telegram?.WebApp?.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.selectionChanged();
    }
    const panel = document.getElementById(panelId);
    if (!panel) return;
    
    const isOpen = panel.classList.contains('open');
    
    // Close all panels first
    document.querySelectorAll('.ds-expand-panel').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.dash-settings-row').forEach(r => r.classList.remove('ds-open'));
    
    // Toggle current
    if (!isOpen) {
        panel.classList.add('open');
        if (rowEl) rowEl.classList.add('ds-open');
    }
}

// Sync new settings badge with user data
function syncSettingsBadges(user) {
    if (!user) return;
    const badge = document.getElementById('dsSubBadge');
    if (badge) {
        badge.textContent = user.status === 'active' ? 'Active' : 'Expired';
        badge.className = 'ds-row-badge' + (user.status !== 'active' ? ' expired' : '');
    }
    const hint = document.getElementById('dsSubHint');
    const planNames = { 'trial': 'Пробный', 'monthly': 'Ежемесячная', 'yearly': 'Годовая' };
    if (hint) hint.textContent = planNames[user.plan] || 'Управление тарифом';
    
    const tokenStatus = document.getElementById('dsTokenStatus');
    if (tokenStatus) {
        tokenStatus.textContent = user.api_token ? 'Задан' : 'Не задан';
    }
}

// Also update bento sub mini card to open new panel
function openSubFromBento() {
    // Open settings panel first if closed
    const panel = document.getElementById('dashSettingsPanel');
    const link = document.querySelector('.dash-settings-link');
    if (panel && !panel.classList.contains('open')) {
        panel.classList.add('open');
        if (link) link.classList.add('dsl-open');
    }
    // Then open subscription sub-panel
    setTimeout(() => {
        const row = document.getElementById('dsRowSub');
        toggleSettingsPanel('dsPanelSub', row);
        const section = document.querySelector('.dash-settings-group');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
}

// Plan waterfall toggle
function togglePlanList() {
    const wf = document.getElementById('planWaterfall');
    const arrow = document.getElementById('planMainArrow');
    if (!wf) return;
    const isOpen = wf.classList.contains('show');
    
    // Close broker waterfall if open
    const brokerWf = document.getElementById('brokerWaterfall');
    if (brokerWf) brokerWf.classList.remove('show');
    const brokerArrow = document.getElementById('brokerMainArrow');
    if (brokerArrow) brokerArrow.classList.remove('open');
    
    if (isOpen) {
        wf.classList.remove('show');
        if (arrow) arrow.classList.remove('open');
    } else {
        wf.classList.add('show');
        if (arrow) arrow.classList.add('open');
    }
    if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
}

function selectPlanWaterfall(el, plan, name, price) {
    // Update main card
    document.getElementById('planMainName').textContent = name;
    document.getElementById('planMainPrice').textContent = price;
    document.getElementById('planMainCard').classList.add('has-selection');
    
    // Update selected state
    document.querySelectorAll('#planWaterfall .strategy-option-card').forEach(c => c.classList.remove('selected-in-list'));
    el.classList.add('selected-in-list');
    
    // Set plan value (compatible with submitRegistration)
    window.selectedPlan = plan;
    window._selectedPlan = plan;
    
    // Close waterfall
    setTimeout(() => {
        document.getElementById('planWaterfall').classList.remove('show');
        document.getElementById('planMainArrow').classList.remove('open');
    }, 200);
    
    if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
}

function toggleDashSettings(id) {
    const item = document.getElementById(id);
    if (!item) return;
    if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.selectionChanged();
    document.querySelectorAll('.dash-settings-item').forEach(el => {
        if (el.id !== id) el.classList.remove('open');
    });
    item.classList.toggle('open');
}

// =============================================
// НАВИГАЦИЯ: ДОМОЙ
// =============================================
function goHomeScreen() {
    if (window._isRegistered) {
        showScreen('screen-dashboard');
    } else {
        showScreen('screen-home');
    }
}

// =============================================
// TOAST УВЕДОМЛЕНИЯ
// =============================================
function showDashToast(message, isError) {
    const toast = document.getElementById('dashToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}


       
        
