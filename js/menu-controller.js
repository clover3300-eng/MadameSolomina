    // === ГЛАВНЫЙ КОНТРОЛЛЕР МЕНЮ ===

    // Функция, которую нужно вызывать при переходе на экран
    // Например: showScreen('screen-portfolio') -> вызываем checkMenuVisibility('screen-portfolio')
   function checkMenuVisibility(screenId) {
        const mainMenu = document.getElementById('navWrapper'); // Старое меню
        const portfolioMenu = document.getElementById('portfolioModeSwitcher'); // Новый пульт

        // Список экранов, которые относятся к "Портфельному режиму"
        const portfolioScreens = ['screen-portfolio', 'screen-stub', 'screen-assets'];

        // Если screen-assets открыт через главное меню (иконку $) — показываем главное меню
        if (screenId === 'screen-assets' && assetsFromMainNav) {
            if (mainMenu) mainMenu.style.setProperty('display', 'flex', 'important');
            if (portfolioMenu) portfolioMenu.style.display = 'none';
            return;
        }

        if (portfolioScreens.includes(screenId)) { 
            // === МЫ ВНУТРИ ПОРТФЕЛЯ ===
            if (mainMenu) mainMenu.style.setProperty('display', 'none', 'important');
            if (portfolioMenu) portfolioMenu.style.display = 'block';
            
            // Светлое меню если портфель ещё не сформирован, тёмное после
            const modeSwitcher = portfolioMenu ? portfolioMenu.querySelector('.mode-switcher') : null;
            if (modeSwitcher) {
                if (isPortfolioCalculated) {
                    modeSwitcher.classList.remove('mode-light');
                } else {
                    modeSwitcher.classList.add('mode-light');
                }
            }

            // Обновляем подсветку кнопок на пульте в зависимости от экрана
            updatePortfolioTabs(screenId);

        } else {
            // === ОБЫЧНЫЙ РЕЖИМ ===
            // Не показываем меню на странице регистрации, расчёта и Vanguard-теста
            if (screenId === 'screen-register' || screenId === 'screen-app' || screenId === 'screen-vanguard') {
                if (mainMenu) mainMenu.style.setProperty('display', 'none', 'important');
            } else {
                if (mainMenu) mainMenu.style.setProperty('display', 'flex', 'important');
            }
            if (portfolioMenu) portfolioMenu.style.display = 'none';
        }
    }

        // Вспомогательная функция: Синхронизирует кнопку пульта с текущим экраном
    function updatePortfolioTabs(screenId) {
        const switcher = document.getElementById('portfolioModeSwitcher');
        if (!switcher) return;
        
        const btns = switcher.querySelectorAll('.mode-btn');
        const indicator = document.getElementById('modeIndicator');
        let activeIndex = 0;

        btns.forEach(b => b.classList.remove('active'));

        if (screenId === 'screen-portfolio') activeIndex = 0; // Купить
        if (screenId === 'screen-stub') activeIndex = 1;      // Активы
        if (screenId === 'screen-assets') activeIndex = 2;    // Ребаланс

        btns[activeIndex].classList.add('active');
        indicator.style.transform = `translateX(${activeIndex * 100}%)`;
    }

    // 2. ФУНКЦИЯ ВЫХОДА (Стрелочка)
    function closePortfolioMode() {
        goHomeScreen(); // Возврат на домашний экран (dashboard или home)
    }

    // 3. ФУНКЦИЯ ПОИСКА (Лупа)
    function openSearchFromPortfolio() {
        // Показываем главное меню (нужно для expandedNav)
        const mainMenu = document.getElementById('navWrapper');
        const portfolioMenu = document.getElementById('portfolioModeSwitcher');
        
        if (mainMenu) mainMenu.style.setProperty('display', 'flex', 'important');
        if (portfolioMenu) portfolioMenu.style.display = 'none';
        
        // Добавляем compact-nav для светлого стиля
        document.body.classList.add('compact-nav');
        
        // Открываем поиск как из главного меню
        expandSearch();
    }

    // 4. ПЕРЕКЛЮЧЕНИЕ ТАБОВ (Купить / Активы / Ребаланс)
  function switchMode(btn, index) {
        // Вибрация
        if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.selectionChanged();
        }

        // ПЕРЕХОД НА НУЖНЫЙ ЭКРАН
        if (index === 0) {
            // КУПИТЬ -> Идем на screen-portfolio
            // (Логика "пусто/густо" уже внутри самого экрана)
            showScreen('screen-portfolio');
        } 
        else if (index === 1) {
            // АКТИВЫ -> Идем на заглушку
            showScreen('screen-stub');
        } 
        else if (index === 2) {
            // РЕБАЛАНС -> Идем на screen-assets (Таблица Аврора)
            showScreen('screen-assets');
        }
    }
