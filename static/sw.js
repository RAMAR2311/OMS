const CACHE_NAME = 'omc-pwa-v3';

// Recursos estáticos inmutables para precachear
const PRECACHE_ASSETS = [
    '/offline',
    '/static/manifest.json',
    '/static/favicon.ico',
    '/static/img/icons/icon-192x192.png',
    '/static/img/icons/icon-512x512.png',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800;900&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Instalación: Precarga de recursos clave
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                    console.warn('[SW] Aviso: Algunos recursos precacheados fallaron (continuando):', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activación: Limpieza agresiva de versiones obsoletas de caché
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Purgando caché obsoleto:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia de Fetch Optimizada
self.addEventListener('fetch', (event) => {
    // 1. Ignorar solicitudes que no sean GET (como POST de ventas, inventario, etc.)
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // 2. NUNCA cachear endpoints de API, autenticación ni llamadas dinámicas
    // Esto garantiza que búsquedas de cargadores/productos y arqueos siempre traigan datos frescos
    if (
        url.pathname.includes('/api/') || 
        url.pathname.startsWith('/auth/') || 
        url.pathname.includes('logout') ||
        url.pathname.includes('search') ||
        url.searchParams.has('q')
    ) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'Sin conexión al servidor' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // 3. Navegación HTML (Páginas): Network First SIEMPRE directo al servidor.
    // IMPORTANTE: NO guardamos páginas HTML en caché para evitar que tokens CSRF o sesiones queden vencidas ("me salgo y no me deja").
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(async () => {
                    // Si el servidor o red está offline, mostrar la pantalla offline limpia
                    const offlinePage = await caches.match('/offline');
                    if (offlinePage) {
                        return offlinePage;
                    }
                    return new Response('Sin conexión a internet. Revisa tu conexión de red.', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
                    });
                })
        );
        return;
    }

    // 4. Recursos Estáticos Reales (CSS, JS, Fonts, Iconos): Cache First con fallback a Network
    if (
        url.pathname.startsWith('/static/') ||
        url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')
    ) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fallback silencioso para assets secundarios
                });
            })
        );
        return;
    }

    // Por defecto para cualquier otra solicitud GET: Red directa
    event.respondWith(fetch(event.request));
});
