/** Register the service worker (installable board). Failure is harmless. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}
