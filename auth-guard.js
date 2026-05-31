import { getCurrentSession, supabase } from './supabase-config.js';

const LOGIN_PAGE = '/login.html';
const guardStyle = document.createElement('style');
guardStyle.id = 'auth-guard-style';
guardStyle.textContent = 'body{visibility:hidden!important}';
document.head.appendChild(guardStyle);

function currentPage() {
    return window.location.pathname.split('/').pop() + window.location.search;
}

function redirectToLogin() {
    const redirect = encodeURIComponent(currentPage());
    window.location.replace(`${LOGIN_PAGE}?redirect=${redirect}`);
}

function revealPage() {
    guardStyle.remove();
}

const session = await getCurrentSession();
if (!session?.user) {
    redirectToLogin();
} else {
    revealPage();
}

supabase.auth.onAuthStateChange((event, nextSession) => {
    if (event === 'SIGNED_OUT' || !nextSession?.user) {
        redirectToLogin();
    }
});
