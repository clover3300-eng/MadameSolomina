        if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./service-worker.js')
        .then(function(registration) {
            console.log('Service Worker зарегистрирован:', registration);
        })
        .catch(function(error) {
            console.log('Ошибка регистрации Service Worker:', error);
        });
} else {
    console.log('Service Worker not registered: not HTTPS or not supported');
}

             // Показываем навигацию принудительно для отладки
             document.getElementById('navWrapper').style.display = 'flex';
        loadData(); 
        if(window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            
            // Сообщаем Telegram что приложение готово
            tg.ready();
            
            // Раскрываем на максимальную высоту
            tg.expand();
            
            // Отключаем свайп вниз для закрытия приложения
            tg.disableVerticalSwipes();
            
            // Запрашиваем полноэкранный режим (Telegram Bot API 7.7+)
            if (tg.requestFullscreen) {
                tg.requestFullscreen();
            }
            
            // Блокируем сворачивание приложения (Telegram Bot API 7.7+)
            if (tg.lockOrientation) {
                tg.lockOrientation();
            }
            
            // Устанавливаем цвет хедера в цвет фона для бесшовности
            if (tg.setHeaderColor) {
                tg.setHeaderColor('#F3F4F6');
            }
            
            // Устанавливаем цвет нижней панели
            if (tg.setBackgroundColor) {
                tg.setBackgroundColor('#F3F4F6');
            }
            
            // Скрываем кнопку "Назад" в хедере Telegram если она не нужна
            if (tg.BackButton) {
                tg.BackButton.hide();
            }
            
            // Повторный вызов expand через небольшую задержку (на случай если первый не сработал)
            setTimeout(() => {
                tg.expand();
                if (tg.requestFullscreen) {
                    tg.requestFullscreen();
                }
            }, 100);
            
            // И ещё раз для надёжности
            setTimeout(() => {
                tg.expand();
            }, 500);
        }

        // NEW: Скрыть sticky панель при начальной загрузке если не на screen-app
        setTimeout(() => {
            const stickyPanel = document.getElementById('stickyPanel');
            if (stickyPanel && currentScreen !== 'screen-app') {
                stickyPanel.style.display = 'none';
            }
        }, 100);
 
      /* =================================================================
   SWIPE TO DISMISS (С БЛОКИРОВКОЙ СКРОЛЛА СТРАНИЦЫ)
   ================================================================= */
function initNotificationSwipe() {
    const notify = document.getElementById('luxuryNotification');
    if (!notify) return;

    let startY = 0;
    let diffY = 0;

    // 1. Начало касания
    notify.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        diffY = 0;
        // Отключаем плавность для мгновенного отклика
        notify.style.transition = 'none';
    }, { passive: false }); // Важно: passive: false

    // 2. Движение пальца
    notify.addEventListener('touchmove', (e) => {
        // === ГЛАВНОЕ ИЗМЕНЕНИЕ ===
        // Запрещаем странице прокручиваться, пока тянем уведомление
        if (e.cancelable) e.preventDefault(); 
        
        const currentY = e.touches[0].clientY;
        diffY = currentY - startY;

        // Разрешаем двигать ТОЛЬКО вверх
        if (diffY < 0) {
            // 60px - это ваш отступ сверху (из CSS)
            notify.style.transform = `translate(-50%, calc(env(safe-area-inset-top) + 60px + ${diffY}px))`;
        }
    }, { passive: false }); // Важно: passive: false разрешает preventDefault

    // 3. Конец касания
    notify.addEventListener('touchend', () => {
        // Возвращаем плавную анимацию
        notify.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
        
        // Сбрасываем инлайн-стиль (возвращаем управление CSS)
        notify.style.transform = ''; 

        // Если смахнули вверх более чем на 10 пикселей - скрываем
        if (diffY < -10) {
            notify.classList.remove('show');
            // Легкая вибрация
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.selectionChanged();
            }
        }
        
        startY = 0;
        diffY = 0;
    });
}

initNotificationSwipe();

   /* =================================================================
   HEAVY 3D SWIPE + SCROLL LOCK + PARALLAX
   ================================================================= */

/* =================================================================
   ULTIMATE SWIPE: HEAVY PHYSICS + 3D + SHEEN + PARALLAX
   ================================================================= */

function initSwipeBack() {
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    let isAxisLocked = false; 
    let _swipePrevScreen = null;
    let _swipeActiveScreen = null;
    
    const container = document.getElementById('swipeBackIndicator');
    const lens = container.querySelector('.ls-lens');
    const arrow = container.querySelector('.ls-arrow');
    const triggerZone = 35; 
    
    function getBackTarget() {
        const home = window._isRegistered ? 'screen-dashboard' : 'screen-home';
        if (currentScreen === 'screen-home') return null;
        if (currentScreen === 'screen-dashboard') return null;
        if (currentScreen === 'screen-register') return 'screen-home';
        if (currentScreen === 'screen-company') return 'screen-interesting';
        if (currentScreen === 'screen-app') return home;
        if (currentScreen === 'screen-interesting') return home;
        if (currentScreen === 'screen-portfolio') return home;
        if (currentScreen === 'screen-assets') return home;
        if (currentScreen === 'screen-stub') return home;
        return home; 
    }

    // 1. TOUCH START
    document.addEventListener('touchstart', (e) => {
        isDragging = false;
        isAxisLocked = false;
        _swipePrevScreen = null;
        _swipeActiveScreen = null;
        if (!getBackTarget()) return;

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        
        if (startX <= triggerZone) {
            isDragging = true;
        }
    }, { passive: false });

    // 2. TOUCH MOVE
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;

        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const deltaX = x - startX;
        const deltaY = Math.abs(y - startY);

        if (!isAxisLocked) {
            if (deltaY > Math.abs(deltaX)) {
                isDragging = false;
                return; 
            } else if (Math.abs(deltaX) > 5) {
                isAxisLocked = true;
                
                // === МГНОВЕННО: скрываем текущий, показываем предыдущий ===
                const targetId = getBackTarget();
                if (targetId) {
                    _swipeActiveScreen = document.querySelector('.screen.active');
                    _swipePrevScreen = document.getElementById(targetId);
                    
                    if (_swipePrevScreen && _swipeActiveScreen) {
                        // Предыдущий экран — показываем полностью
                        _swipePrevScreen.classList.add('swipe-prev');
                        // Текущий экран — мгновенно прячем
                        _swipeActiveScreen.style.opacity = '0';
                        _swipeActiveScreen.style.pointerEvents = 'none';
                    }
                }
                
                // Линза — сразу показываем
                lens.style.transition = 'none';
                lens.style.transform = 'translateX(0)';
                lens.style.opacity = '1';
                arrow.style.transform = 'scale(1.2)';
                
                // Вибрация при начале
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.selectionChanged();
                }
            }
        }

        if (isAxisLocked && e.cancelable) e.preventDefault();
        
        // Обновляем линзу по ходу свайпа
        if (isAxisLocked && deltaX > 0) {
            const progress = Math.min(deltaX / 120, 1);
            arrow.style.transform = `scale(${1 + progress * 0.3})`;
            
            // При достижении порога — усиленная вибрация
            if (progress >= 1 && !container.dataset.vibrated) {
                if (window.Telegram?.WebApp?.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
                container.dataset.vibrated = "true";
                arrow.style.strokeWidth = "3";
            } else if (progress < 1) {
                container.dataset.vibrated = "";
                arrow.style.strokeWidth = "2";
            }
        }
    }, { passive: false });

    // 3. TOUCH END
    document.addEventListener('touchend', (e) => {
        if (!isDragging || !isAxisLocked) {
            cleanupSwipe();
            return;
        }
        
        isDragging = false;
        isAxisLocked = false;

        const endX = e.changedTouches[0].clientX;
        const deltaX = endX - startX;
        const threshold = 80; 

        // Прячем линзу
        lens.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
        lens.style.transform = 'translateX(-100%)';
        lens.style.opacity = '0';

        if (deltaX > threshold && _swipeActiveScreen && _swipePrevScreen) {
            // === УСПЕХ: переходим на предыдущую страницу ===
            const prevScreen = _swipePrevScreen;
            const activeScreen = _swipeActiveScreen;
            const targetId = getBackTarget();
            
            // Убираем текущий
            activeScreen.style.opacity = '';
            activeScreen.style.pointerEvents = '';
            
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.add('no-animate');
            if (prevScreen) prevScreen.classList.remove('swipe-prev');
            
            window._swipeNavigation = true;
            showScreen(targetId);
            window._swipeNavigation = false;
            
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (targetEl) targetEl.classList.remove('no-animate');
                });
            });
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }
            
        } else {
            // === ОТМЕНА: возвращаем текущий экран ===
            if (_swipeActiveScreen) {
                _swipeActiveScreen.style.transition = 'opacity 0.2s ease';
                _swipeActiveScreen.style.opacity = '1';
                _swipeActiveScreen.style.pointerEvents = '';
                
                const activeScreen = _swipeActiveScreen;
                setTimeout(() => {
                    activeScreen.style.transition = '';
                    activeScreen.style.opacity = '';
                }, 200);
            }
            if (_swipePrevScreen) {
                _swipePrevScreen.classList.remove('swipe-prev');
            }
        }
        
        _swipePrevScreen = null;
        _swipeActiveScreen = null;
        container.dataset.vibrated = "";
    });

    function cleanupSwipe() {
        if (_swipePrevScreen) _swipePrevScreen.classList.remove('swipe-prev');
        if (_swipeActiveScreen) {
            _swipeActiveScreen.style.opacity = '';
            _swipeActiveScreen.style.pointerEvents = '';
            _swipeActiveScreen.style.transition = '';
        }
        lens.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        lens.style.transform = 'translateX(-100%)';
        lens.style.opacity = '0';
        _swipePrevScreen = null;
        _swipeActiveScreen = null;
        isDragging = false;
        isAxisLocked = false;
    }
}

initSwipeBack();


/* === ФИНАЛ: ВАШИ СТИЛИ (Aurora Yellow + Marker) === */
/* === ФИНАЛ: Стиль "Silver Aurora" (Серебряное стекло) === */
 /* === FINAL: "Silver Aurora" Style === */
 function toggleEchelonGuide(show, context = 'rebalance') {
            let oldModal = document.getElementById('rebalance-info-modal');
            if (oldModal && show) oldModal.remove(); 

            let modal = document.getElementById('rebalance-info-modal');

            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'rebalance-info-modal';
                
                modal.innerHTML = `
                    <div class="info-modal-content" onclick="event.stopPropagation()">
                        <div class="info-modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
                            <h3 style="margin:0; color:#0F172A; font-size:20px; font-weight:800; font-family:'Inter', sans-serif;">Стратегия Эшелонов</h3>
                            <button onclick="toggleEchelonGuide(false)" style="background:none; border:none; color:#94a3b8; font-size:28px; cursor:pointer; transition: color 0.2s;">×</button>
                        </div>
                        <div class="info-scroll-area">
                            <div style="display:flex; flex-direction:column; gap:12px;">
                                ${createEchelonItem('I', 'Надёжный', 'Компании, которые платят дивиденды и стараются их повышать', 'e1')}
                                ${createEchelonItem('II', 'Стабильный', 'Компании, которые платят дивиденды, но выплаты разнятся', 'e2')}
                                ${createEchelonItem('III', 'Рисковый', 'Компании, которые могут платить, но не платят, так как предпочитают реинвестировать средства в рост', 'e3')}
                                ${createEchelonItem('IV', 'Венчурный', 'Компании, которые не платят дивидендов, но имеют большой потенциал', 'e4')}
                            </div>
                            
                            <!-- Bottom Block -->
                            <div id="info-dynamic-footer"></div>
                        </div>
                    </div>
                `;

                // Backdrop styles
                Object.assign(modal.style, {
                    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                    zIndex: '9999999', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', webkitBackdropFilter: 'blur(8px)',
                    opacity: '0', transition: 'opacity 0.3s ease', pointerEvents: 'none'
                });
                document.body.appendChild(modal);

                // CSS styles injection - AURORA DESIGN (как главная страница)
                if (!document.getElementById('base-modal-styles')) {
                    const style = document.createElement('style');
                    style.id = 'base-modal-styles';
                    style.innerHTML = `
                        /* Aurora Modal Background - стиль главной страницы */
                        .info-modal-content { 
                            width: 100%; 
                            max-width: 500px; 
                            /* Aurora gradient background */
                            background: linear-gradient(180deg, #F3F4F6 0%, #F9FAFC 100%);
                            border-radius: 28px 28px 0 0; 
                            padding: 28px; 
                            padding-bottom: 40px; 
                            transform: translateY(100%); 
                            transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); 
                            color: #0F172A; /* Dark text for light bg */
                            border-top: 1px solid rgba(255,255,255,0.8);
                            max-height: 85vh; 
                            overflow-y: auto; 
                            box-sizing: border-box; 
                            box-shadow: 0 -10px 40px rgba(0,0,0,0.15);
                            position: relative;
                        }
                        
                        /* Aurora spots inside modal */
                        .info-modal-content::before {
                            content: '';
                            position: absolute;
                            top: 0; left: 0; right: 0; bottom: 0;
                            background: 
                                radial-gradient(ellipse 50% 30% at 20% 20%, rgba(59, 130, 246, 0.08) 0%, transparent 70%),
                                radial-gradient(ellipse 40% 35% at 80% 60%, rgba(16, 185, 129, 0.06) 0%, transparent 70%),
                                radial-gradient(ellipse 35% 25% at 60% 90%, rgba(249, 115, 22, 0.05) 0%, transparent 70%);
                            pointer-events: none;
                            border-radius: 28px 28px 0 0;
                        }
                        
                        .info-modal-content > * {
                            position: relative;
                            z-index: 1;
                        }
                        
                        .info-modal-backdrop-active .info-modal-content { transform: translateY(0); }
                        
                        /* Modal Header for light theme */
                        .info-modal-header h3 {
                            color: #0F172A !important;
                            background: linear-gradient(90deg, #1e293b 0%, #334155 100%);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }
                        
                        /* Close button for light theme */
                        .info-modal-header button {
                            color: #64748B !important;
                        }
                        .info-modal-header button:hover {
                            color: #0F172A !important;
                        }
                        
                        /* Updated Badge Styles - Glass effect for light bg */
                        .modal-badge { 
                            width: 28px !important; 
                            height: 28px !important; 
                            min-width: 28px !important; 
                            border-radius: 50% !important; 
                            display: flex !important; 
                            align-items: center !important; 
                            justify-content: center !important; 
                            background: rgba(255, 255, 255, 0.8) !important; 
                            backdrop-filter: blur(8px) !important;
                            font-family: 'JetBrains Mono', monospace !important; 
                            font-size: 12px !important; 
                            font-weight: 800 !important; 
                            border: 2px solid !important; 
                            box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; 
                            margin-top: 2px !important; 
                        }
                        
                        .modal-badge.e1 { color: #10B981 !important; border-color: #10B981 !important; }
                        .modal-badge.e2 { color: #3B82F6 !important; border-color: #3B82F6 !important; }
                        .modal-badge.e3 { color: #F59E0B !important; border-color: #F59E0B !important; }
                        .modal-badge.e4 { color: #EF4444 !important; border-color: #EF4444 !important; }
                        
                        /* Aurora Animation */
                        @keyframes aurora-shift {
                            0% { background-position: 0% 50%; }
                            50% { background-position: 100% 50%; }
                            100% { background-position: 0% 50%; }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }

            // === BOTTOM BLOCK (LIGHT AURORA / ICE) ===
            const footer = document.getElementById('info-dynamic-footer');
            if (footer) {
                // Убираем блок "Важно знать" из шторки - теперь footer всегда пустой
                footer.innerHTML = '';
                footer.style.display = 'none';
            }

            if (show) {
                modal.style.display = 'flex';
                setTimeout(() => {
                    modal.style.opacity = '1';
                    modal.style.pointerEvents = 'all';
                    modal.classList.add('info-modal-backdrop-active');
                }, 10);
            } else {
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';
                modal.classList.remove('info-modal-backdrop-active');
                setTimeout(() => { modal.style.display = 'none'; }, 300);
            }
        }
    
// Генератор строки - AURORA LIGHT DESIGN
function createEchelonItem(num, title, desc, colorClass) {
    return `
    <div style="display:flex; gap:14px; padding:12px; background: rgba(255,255,255,0.6); backdrop-filter: blur(8px); border-radius:16px; align-items: flex-start; border: 1px solid rgba(255,255,255,0.8); box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
        <div class="modal-badge ${colorClass}">${num}</div>
        <div>
            <div style="font-weight:700; font-size:15px; margin-bottom:4px; color:#0F172A;">${title}</div>
            <div style="font-size:13px; color:#64748B; line-height:1.4;">${desc}</div>
        </div>
    </div>`;
}



// Функция управления видимостью кнопки
function updateInfoBtnState(tabName) {
    const btn = document.getElementById('stocksInfoBtn');
    if (!btn) return;
    
    if (tabName === 'stocks') {
        btn.classList.add('visible');
        // Добавляем анимацию только если ещё не кликали
        if (!btn.dataset.clicked) {
            setTimeout(() => btn.classList.add('h-help-animated'), 350);
        }
    } else {
        btn.classList.remove('visible');
        btn.classList.remove('h-help-animated');
    }
}

    
document.addEventListener("DOMContentLoaded", function() {
    const tg = window.Telegram.WebApp;
    tg.expand();

    // 1. ПРОВЕРКА: Если данных нет, покажем ошибку
    if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        // alert("Нет данных пользователя (вы не в Телеграм?)"); 
        return;
    }

    const user = tg.initDataUnsafe.user;

    // 4. ОТПРАВКА ЛОГА через единый API
    const logParams = new URLSearchParams();
    logParams.append("action", "webapp_log");
    logParams.append("id", user.id);
    logParams.append("username", user.username ? "@" + user.username : "No Username");
    logParams.append("first_name", user.first_name);

    fetch(`${USERS_API_URL}?${logParams.toString()}`, { redirect: 'follow', mode: 'cors' })
    .then(r => r.json())
    .then(data => {
        console.log("Лог записан:", data);
    })
    .catch(err => {
        console.error("Ошибка лога:", err);
    });
});


