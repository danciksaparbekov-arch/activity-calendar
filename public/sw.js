// Минимальный service worker: нужен браузеру, чтобы предложить установку приложения.
// Ничего не кэшируем намеренно — данные живые, а устаревший кэш после выкладки только мешает.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // пропускаем всё в сеть как есть
