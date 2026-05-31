const CACHE_NAME = 'rsu-app-v43';
const APP_SHELL = [
    '/',
    '/index.html',
    '/login.html',
    '/registro.html',
    '/publicar.html',
    '/favoritos.html',
    '/ayuda.html',
    '/buzon.html',
    '/crear-perfil.html',
    '/transacciones.html',
    '/chat.html',
    '/detalle_publicacion.html',
    '/perfil_empresa.html',
    '/editar-perfil.html',
    '/configuracion.html',
    '/rsu-aero.css',
    '/supabase-config.js',
    '/auth-guard.js',
    '/marketplace.js',
    '/publicar.js',
    '/favoritos-db.js',
    '/ayuda.js',
    '/buzon.js',
    '/crear-perfil.js',
    '/transacciones.js',
    '/chat.js',
    '/detalle-publicacion.js',
    '/app-preferences.js',
    '/pwa-register.js',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
});
