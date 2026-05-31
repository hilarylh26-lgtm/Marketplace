import { supabase } from './supabase-config.js';

const LOGIN_PAGE = '/login.html';
const guardStyle = document.createElement('style');
guardStyle.id = 'auth-guard-style';
guardStyle.textContent = 'body{visibility:hidden!important}';
document.head.appendChild(guardStyle);

function redirectValue() {
    const page = window.location.pathname.split('/').pop().replace(/\.html$/i, '');
    return page + window.location.search;
}

function redirectToLogin() {
    window.location.replace(`${LOGIN_PAGE}?redirect=${encodeURIComponent(redirectValue())}`);
}

function revealPage() {
    guardStyle.remove();
}

const { data, error } = await supabase.auth.getSession();

if (error || !data?.session) {
    redirectToLogin();
} else {
    revealPage();
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        redirectToLogin();
    }
});
