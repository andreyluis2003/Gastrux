/**
 * FASE 11: Service Worker - Offline-first caching strategy
 * Handles offline mode, data persistence, and sync
 */

const CACHE_VERSION = 'v1';
const CACHE_NAMES = {
  static: `static-${CACHE_VERSION}`,
  pages: `pages-${CACHE_VERSION}`,
  api: `api-${CACHE_VERSION}`,
  images: `images-${CACHE_VERSION}`,
};

const CRITICAL_ASSETS = [
  '/',
  '/dashboard',
  '/insumos',
  '/receitas',
  '/estoque',
  '/planejamento',
  '/auth/signin',
];

const STATIC_ASSETS = [
  '/_next/static/',
  '/manifest.json',
];

const API_ROUTES = [
  '/api/ingredients',
  '/api/recipes',
  '/api/stock',
  '/api/analytics',
  '/api/forecasts',
];

// 1. INSTALL EVENT - Pre-cache critical assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAMES.static).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(() => {
        console.log('[SW] Some static assets failed to cache (expected)');
      });
    })
  );

  // Skip waiting - activate new SW immediately
  self.skipWaiting();
});

// 2. ACTIVATE EVENT - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            !Object.values(CACHE_NAMES).includes(cacheName) &&
            cacheName.startsWith('v')
          ) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  self.clients.claim();
});

// 3. FETCH EVENT - Implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Determine cache strategy based on URL
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isAPIRoute(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
  } else if (isImageRequest(request)) {
    event.respondWith(cacheFirstImageStrategy(request));
  } else {
    event.respondWith(networkFirstStrategy(request));
  }
});

// 4. SYNC EVENT - Handle offline data sync
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered');

  if (event.tag === 'sync-pending-changes') {
    event.waitUntil(syncPendingChanges());
  }
});

// 5. MESSAGE EVENT - Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CLEAR_CACHE') {
    clearAllCaches();
  } else if (event.data.type === 'SYNC_NOW') {
    syncPendingChanges().then(() => {
      // Notify all clients
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SYNC_COMPLETE',
            success: true,
          });
        });
      });
    });
  }
});

// ============ CACHE STRATEGIES ============

/**
 * Cache First Strategy
 * Returns cached response if available, otherwise fetches from network
 * Good for: Static assets, images
 */
async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAMES.static);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Fetch failed, returning offline response');
    return createOfflineResponse();
  }
}

/**
 * Cache First Strategy for Images
 * Aggressively cache images
 */
async function cacheFirstImageStrategy(request) {
  const cache = await caches.open(CACHE_NAMES.images);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.headers.get('content-type')?.includes('image')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] Image fetch failed');
    // Return a placeholder or cached version
    const fallback = await cache.match('/images/placeholder.png');
    return fallback || createOfflineResponse();
  }
}

/**
 * Network First Strategy
 * Tries network first, falls back to cache if offline
 * Good for: HTML pages, API data
 */
async function networkFirstStrategy(request) {
  const cacheName = getAppropriateCache(request.url);

  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] Network failed, checking cache');
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    return createOfflineResponse();
  }
}

// ============ HELPERS ============

function isStaticAsset(pathname) {
  return (
    pathname.includes('/_next/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname === '/manifest.json'
  );
}

function isAPIRoute(pathname) {
  return pathname.startsWith('/api/');
}

function isImageRequest(request) {
  const url = new URL(request.url);
  return (
    url.pathname.includes('/images/') ||
    request.headers.get('accept')?.includes('image')
  );
}

function getAppropriateCache(url) {
  if (url.includes('/api/')) {
    return CACHE_NAMES.api;
  }
  if (url.includes('/images/')) {
    return CACHE_NAMES.images;
  }
  return CACHE_NAMES.pages;
}

function createOfflineResponse() {
  return new Response(
    JSON.stringify({
      error: 'offline',
      message: 'Application is offline. Please check your connection.',
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(cacheNames.map((name) => caches.delete(name)));
}

/**
 * Sync pending changes with server
 * This is a simplified version - would integrate with IndexedDB
 */
async function syncPendingChanges() {
  console.log('[SW] Syncing pending changes...');
  // Implementation would query IndexedDB for pending changes
  // and sync them with the server
  return Promise.resolve();
}

// ============ WEB PUSH NOTIFICATIONS ============

/**
 * PUSH EVENT - Handle incoming push notifications
 * Receives push events from server and displays notifications
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');

  if (!event.data) {
    console.log('[SW] No data in push event');
    return;
  }

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Notificação do Gastrux',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'alert',
      requireInteraction: data.requireInteraction || false,
      data: {
        url: data.url || '/dashboard',
        ...data.customData,
      },
      actions: [
        {
          action: 'view',
          title: 'Ver',
          icon: '/icon-192.png',
        },
        {
          action: 'dismiss',
          title: 'Descartar',
          icon: '/icon-192.png',
        },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Gastrux', options)
    );
  } catch (error) {
    console.error('[SW] Error parsing push event:', error);
    event.waitUntil(
      self.registration.showNotification('Gastrux', {
        body: 'Você tem uma notificação importante',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      })
    );
  }
});

/**
 * NOTIFICATION CLICK EVENT - Handle notification interactions
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if the app is already open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (
          client.url === new URL(urlToOpen, self.location).href &&
          'focus' in client
        ) {
          return client.focus();
        }
      }
      // If not open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

/**
 * NOTIFICATION CLOSE EVENT - Handle notification dismissal
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed');
  // Could log this for analytics
});
