// Minimal service worker: network-first, no offline chat (the agent needs
// the network anyway). Exists mainly so the PWA is installable.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
