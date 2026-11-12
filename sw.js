/**
 * VISION 23: Service Worker for Offline PWA Support & Cache Management
 * Enables offline installation on Android devices and caches core assets & AI models.
 */

const CACHE_NAME = 'vision23-ghpages-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/path_history.js',
  './js/state.js',
  './js/telemetry.js',
  './js/vision.js',
  './js/voice.js',
  './js/app.js',
  './vendor/tf.min.js',
  './vendor/coco-ssd.min.js',
  './vendor/models/ssdlite_mobilenet_v2/model.json',
  './vendor/models/ssdlite_mobilenet_v2/group1-shard1of5',
  './vendor/models/ssdlite_mobilenet_v2/group1-shard2of5',
  './vendor/models/ssdlite_mobilenet_v2/group1-shard3of5',
  './vendor/models/ssdlite_mobilenet_v2/group1-shard4of5',
  './vendor/models/ssdlite_mobilenet_v2/group1-shard5of5'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Vision 23 SW] Pre-caching offline assets...');
      // Use addAll with error tolerance so missing model files don't break installation
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) => cache.add(url).catch((err) => console.warn('[Vision 23 SW] Precache missed:', url, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache for camera video streams, websocket connections, and dynamic API endpoints
  if (
    url.port === '81' ||
    url.pathname.includes('/stream') ||
    url.pathname.includes('/api/') ||
    url.protocol.startsWith('ws') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback to offline index.html if navigating
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Message listener for clearing cache from UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'clearCache') {
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => {
      console.log('[Vision 23 SW] All caches purged.');
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
});
