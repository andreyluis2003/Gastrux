'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
          console.log('[SW] Registration successful:', registration);

          // Check for updates periodically
          setInterval(async () => {
            try {
              await registration.update();
            } catch (error) {
              console.error('[SW] Update check failed:', error);
            }
          }, 60000); // Check every minute

          // Listen for new service worker activation
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[SW] New version available');
                  // Notify user about new version
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
        } catch (error) {
          console.error('[SW] Registration failed:', error);
        }
      });

      // Handle messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('[SW Message]:', event.data);
      });
    }
  }, []);

  return null;
}
