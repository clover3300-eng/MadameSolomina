        // Регистрация service-worker удалена (аудит 2026-07-15): файла
        // service-worker.js в public/ нет, на проде запрос отдавал 404.
        // loadData() отсюда тоже убран — данные грузит единственный вызов
        // в DOMContentLoaded-инициализаторе webapp-tabs.js (раньше грузились дважды).
        if(window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            
            // Сообщаем Telegram что приложение готово
            tg.ready();
            
            // Раскрываем на максимальную высоту
            tg.expand();
            
            // Отключаем свайп вниз для закрытия приложения
            tg.disableVerticalSwipes();
            
            // Полноэкранный режим и блокировка ориентации появились в Bot API 8.0:
            // на старых клиентах сам метод существует, но внутри логирует
            // «not supported» в консоль — поэтому сверяем версию, а не наличие
            if (tg.requestFullscreen && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
                tg.requestFullscreen();
            }
            if (tg.lockOrientation && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
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
                if (tg.requestFullscreen && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
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
 // === Поповер «Стратегия эшелонов» ===
 // Всплывает рядом с кнопкой-триггером (над/под ней), без затемнения фона
 // и без выезда снизу. Закрывается по ×, клику вне, Esc или прокрутке.
 // var (не let): верхний уровень init.js может прерваться раньше из-за loadData(),
 // поэтому используем hoisted-объявление без TDZ, доступное из функций ниже.
 var echPopTrigger = null;
 // Содержимое текущего поповера. Их два («Стратегия эшелонов» и «Потенциал»),
 // корпус, позиционирование и закрытие у них общие — различаются только тексты,
 // поэтому оболочка одна, а контент подставляют toggle-функции ниже.
 var echPopTitle = '', echPopSub = '', echPopBody = '';

 function toggleEchelonGuide(show, context = 'rebalance', triggerEl = null) {
     if (!show) { echPopShow(false); return; }
     echPopTitle = 'Стратегия эшелонов';
     echPopSub = 'Группы акций по надёжности выплат и потенциалу роста';
     echPopBody =
         createEchelonItem('I', 'Надёжный', 'Платят дивиденды и стараются их повышать', 'e1') +
         createEchelonItem('II', 'Стабильный', 'Платят дивиденды, но размер выплат меняется', 'e2') +
         createEchelonItem('III', 'Рисковый', 'Могут платить, но реинвестируют прибыль в рост', 'e3') +
         createEchelonItem('IV', 'Венчурный', 'Не платят дивидендов, но имеют большой потенциал', 'e4');
     echPopShow(true, triggerEl);
 }

 /* Поповер «Потенциал» — вторая кнопка-подсказка внизу карточки «Акции»
    («Академия», index.html). Тексты — те же, что в шторке тикера
    (sd-pot-note в js/rebalance.js): потенциал НЕ прогноз доходности, а порядок,
    в котором мы смотрим бумаги при замене, и меряется он внутри эшелона —
    у разных эшелонов разный риск, сравнивать их между собой нечего. */
 function togglePotentialGuide(show, triggerEl = null) {
     if (!show) { echPopShow(false); return; }
     echPopTitle = 'Потенциал';
     echPopSub = 'Мера приоритета, а не прогноз доходности';
     echPopBody =
         createEchelonItem('36м', 'Горизонт до 36 месяцев', 'Оценка строится на этом сроке, а не на ближайших неделях', 'nt') +
         createEchelonItem('!', 'Это не обещание доходности', 'Потенциал носит условный характер и служит мерой приоритета одной акции над другой', 'wn') +
         createEchelonItem('=', 'Сравниваем внутри эшелона', 'Бумагу меняем на бумагу того же эшелона: у разных эшелонов разный риск', 'nt');
     echPopShow(true, triggerEl);
 }

 function echPopShow(show, triggerEl = null) {
     const ID = 'rebalance-info-modal';
     const existing = document.getElementById(ID);

     // --- Закрытие ---
     if (!show) {
         if (existing) {
             existing.classList.remove('open');
             setTimeout(() => { if (existing.parentNode) existing.remove(); }, 200);
         }
         document.removeEventListener('keydown', echPopOnKey);
         document.removeEventListener('mousedown', echPopOnOutside, true);
         window.removeEventListener('scroll', echPopOnScroll, true);
         window.removeEventListener('resize', echPopOnScroll);
         echPopTrigger = null;
         return;
     }

     // --- Открытие: пересоздаём заново ---
     if (existing) existing.remove();
     ensureEchPopStyles();

     const pop = document.createElement('div');
     pop.id = ID;
     pop.className = 'ech-pop';
     pop.setAttribute('role', 'dialog');
     pop.setAttribute('aria-label', echPopTitle);
     pop.innerHTML = `
         <div class="ech-pop-head">
             <h3>${echPopTitle}</h3>
             <button type="button" class="ech-pop-close" aria-label="Закрыть" onclick="toggleEchelonGuide(false)">&times;</button>
         </div>
         <div class="ech-pop-sub">${echPopSub}</div>
         <div class="ech-pop-body">${echPopBody}</div>
     `;
     document.body.appendChild(pop);

     echPopTrigger = triggerEl || null;
     positionEchPop(pop, triggerEl);
     requestAnimationFrame(() => pop.classList.add('open'));

     // Слушатели закрытия — на следующий тик, чтобы текущий клик не закрыл сразу
     setTimeout(() => {
         document.addEventListener('keydown', echPopOnKey);
         document.addEventListener('mousedown', echPopOnOutside, true);
         window.addEventListener('scroll', echPopOnScroll, true);
         window.addEventListener('resize', echPopOnScroll);
     }, 0);

     if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.selectionChanged();
 }

 function echPopOnKey(e) { if (e.key === 'Escape') toggleEchelonGuide(false); }
 function echPopOnOutside(e) {
     const pop = document.getElementById('rebalance-info-modal');
     if (!pop) return;
     if (pop.contains(e.target)) return;
     if (echPopTrigger && echPopTrigger.contains(e.target)) return;
     toggleEchelonGuide(false);
 }
 // При скролле/ресайзе не закрываем, а держим поповер приклеенным к кнопке
 function echPopOnScroll() {
     const pop = document.getElementById('rebalance-info-modal');
     if (pop && echPopTrigger) positionEchPop(pop, echPopTrigger);
 }

 // Позиционируем поповер у триггера. Учитываем возможный body{zoom} на десктопе:
 // fixed-элемент внутри зума масштабируется, поэтому делим координаты на zoom.
 function positionEchPop(pop, triggerEl) {
     const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
     const vw = window.innerWidth, vh = window.innerHeight;
     const margin = 12;
     const rect = pop.getBoundingClientRect();
     const pw = rect.width, ph = rect.height;
     let left, top;

     if (triggerEl) {
         const r = triggerEl.getBoundingClientRect();
         // По горизонтали: левый край у кнопки, но не вылезаем за экран
         left = r.left;
         if (left + pw > vw - margin) left = vw - margin - pw;
         if (left < margin) left = margin;
         // По вертикали: по умолчанию НАД кнопкой; если сверху мало места — снизу
         const spaceAbove = r.top - margin;
         const spaceBelow = vh - r.bottom - margin;
         if (spaceAbove >= ph || spaceAbove >= spaceBelow) {
             top = r.top - ph - margin;
         } else {
             top = r.bottom + margin;
         }
         if (top < margin) top = margin;
         if (top + ph > vh - margin) top = vh - margin - ph;
     } else {
         left = (vw - pw) / 2;
         top = (vh - ph) / 2;
     }

     pop.style.left = (left / zoom) + 'px';
     pop.style.top  = (top  / zoom) + 'px';
 }

 // Инъекция стилей поповера (один раз)
 function ensureEchPopStyles() {
     if (document.getElementById('ech-pop-styles')) return;
     const style = document.createElement('style');
     style.id = 'ech-pop-styles';
     style.textContent = `
     .ech-pop {
         position: fixed; z-index: 99999;
         width: min(380px, calc(100vw - 24px));
         max-height: 78vh; overflow-y: auto;
         background: #ffffff;
         border: 1px solid #e6ecf3;
         border-radius: 18px;
         box-shadow: 0 20px 54px rgba(20, 30, 50, 0.22);
         padding: 18px 18px 20px;
         font-family: 'Manrope', 'Inter', sans-serif;
         opacity: 0;
         transform: translateY(8px) scale(0.97);
         transform-origin: top center;
         transition: opacity .18s ease, transform .2s cubic-bezier(.2,.8,.2,1);
     }
     .ech-pop.open { opacity: 1; transform: translateY(0) scale(1); }
     body.dark-mode .ech-pop { background: #1d2734; border-color: rgba(255,255,255,.1); box-shadow: 0 20px 54px rgba(0,0,0,.5); }
     .ech-pop-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
     .ech-pop-head h3 { margin:0; font-size:16px; font-weight:800; letter-spacing:-0.01em; color:#0f172a; }
     body.dark-mode .ech-pop-head h3 { color:#eef2f7; }
     .ech-pop-close { background:none; border:none; font-size:24px; line-height:1; color:#94a3b8; cursor:pointer; padding:0 4px; border-radius:8px; transition: color .15s, background .15s; }
     .ech-pop-close:hover { color:#0f172a; background:#eef2f7; }
     body.dark-mode .ech-pop-close:hover { color:#fff; background: rgba(255,255,255,.08); }
     .ech-pop-sub { margin:4px 0 14px; font-size:12.5px; font-weight:600; color:#8593a6; }
     .ech-pop-body { display:flex; flex-direction:column; gap:9px; }
     .ech-row { display:flex; gap:12px; align-items:flex-start; padding:11px 12px; border-radius:13px; background:#f6f9fc; border:1px solid #eef2f7; }
     body.dark-mode .ech-row { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.07); }
     .ech-row-title { font-weight:700; font-size:14px; color:#0f172a; margin-bottom:3px; }
     body.dark-mode .ech-row-title { color:#eef2f7; }
     .ech-row-desc { font-size:12.5px; line-height:1.4; color:#64748b; }
     body.dark-mode .ech-row-desc { color:#9aa7ba; }
     .ech-pop .modal-badge {
         width:28px; height:28px; min-width:28px; border-radius:50%;
         display:flex; align-items:center; justify-content:center;
         font-family:'JetBrains Mono', monospace; font-size:12px; font-weight:800;
         border:2px solid; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.06); margin-top:1px;
     }
     body.dark-mode .ech-pop .modal-badge { background: rgba(255,255,255,.06); }
     .ech-pop .modal-badge.e1 { color:#10B981; border-color:#10B981; }
     .ech-pop .modal-badge.e2 { color:#3B82F6; border-color:#3B82F6; }
     .ech-pop .modal-badge.e3 { color:#F59E0B; border-color:#F59E0B; }
     .ech-pop .modal-badge.e4 { color:#EF4444; border-color:#EF4444; }
     /* поповер «Потенциал»: у его строк не эшелоны, а пометки — нейтральная и
        предупреждающая. «36м» длиннее римской цифры, поэтому кегль мельче */
     .ech-pop .modal-badge.nt { color:#64748b; border-color:#dbe3ec; font-size:9.5px; }
     body.dark-mode .ech-pop .modal-badge.nt { color:#9aa7ba; border-color: rgba(255,255,255,.14); }
     .ech-pop .modal-badge.wn { color:#F59E0B; border-color:#F59E0B; }
     @media (max-width: 1023px) { .ech-pop { width: calc(100vw - 24px); } }
     `;
     document.head.appendChild(style);
 }

// Генератор строки эшелона для поповера
function createEchelonItem(num, title, desc, colorClass) {
    return `
    <div class="ech-row">
        <div class="modal-badge ${colorClass}">${num}</div>
        <div class="ech-row-txt">
            <div class="ech-row-title">${title}</div>
            <div class="ech-row-desc">${desc}</div>
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

    
// Легаси-лог посещений в Google Apps Script удалён (аудит 2026-07-15):
// USERS_API_URL пуст с аудита безопасности 2026-07-10, и в Telegram-контексте
// fetch уходил в саму страницу и падал с «Ошибка лога» в консоли.


