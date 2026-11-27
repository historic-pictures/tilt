// sw.js - a pass-through service worker. Chrome only offers "Install app" to pages whose worker has a fetch handler;
// this one caches nothing (the game's 300 MB of assets stay on the network / HTTP cache) and never touches a request.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network as usual */ });
