// =============================================
// Тосты приложения
// =============================================
// Единственный живой остаток старой Telegram/GAS-регистрации
// (сами экраны screen-register/screen-dashboard из index.html давно удалены,
// их логика вычищена при аудите 2026-07-15; актуальная авторизация —
// home-register.js + Supabase). Имя showDashToast сохранено: на него
// завязаны admin.js, cloud-sync.js, home-register.js, notifications.js,
// profile-menu.js, supabase-client.js и tab-gates.js.
// Элемент #dashToast создаётся лениво, стили — .dash-toast в dashboard.css.

function showDashToast(message, isError) {
    // R9.4: единый движок тостов — window.msToast (webapp-tabs.js), скин прежний
    // ('dash': цветная плашка сверху). Фолбэк на свою реализацию нужен, потому что
    // registration.js в порядке тегов стоит РАНЬШЕ webapp-tabs.js.
    if (typeof window.msToast === 'function') {
        window.msToast(message, { skin: 'dash', err: isError, ms: 2500 });
        return;
    }
    let toast = document.getElementById('dashToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'dashToast';
        toast.className = 'dash-toast';
        toast.style.zIndex = '9999'; // поверх модалок и шторок
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    clearTimeout(showDashToast._t);
    showDashToast._t = setTimeout(() => toast.classList.remove('show'), 2500);
}
