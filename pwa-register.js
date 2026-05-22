if ('serviceWorker' in navigator) {
    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });

    function activateWaitingWorker(registration) {
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }

    function watchForUpdates(registration) {
        activateWaitingWorker(registration);

        registration.addEventListener('updatefound', () => {
            const nextWorker = registration.installing;
            if (!nextWorker) return;

            nextWorker.addEventListener('statechange', () => {
                if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    activateWaitingWorker(registration);
                }
            });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                registration.update();
            }
        });

        window.addEventListener('focus', () => {
            registration.update();
        });
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/service-worker.js', { updateViaCache: 'none' })
            .then((registration) => {
                watchForUpdates(registration);
                registration.update();
            })
            .catch((error) => {
                console.warn('No se pudo registrar la app instalable:', error);
            });
    });
}
