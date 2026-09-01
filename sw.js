/* Service worker - offline cache so the installed app keeps working when the
   PC that served it is off. Only registers on a secure context (https:// or
   localhost); over plain LAN http:// the game still runs, just without offline
   support. */

const CACHE = 'game5-v2';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
  './js/unity.js',
  './js/save.js',
  './js/physics2d.js',
  './js/world.js',
  './js/player.js',
  './js/bird.js',
  './js/ui.js',
  './js/managers.js',
  './js/fx.js',
  './js/hud.js',
  './js/start.js',
  './assets/data/sprites.data.js',
  './assets/data/config.data.js',
  './assets/data/world.data.js',
  './assets/data/ui.data.js',
  './assets/data/components.data.js',
  './assets/data/spinners.data.js',
  './assets/fonts/LiberationSans.ttf',
  './assets/sprites/Daire.png',
  './assets/sprites/Dirt.png',
  './assets/sprites/Ending.png',
  './assets/sprites/EnemyBird.png',
  './assets/sprites/EnemyFlyBird.png',
  './assets/sprites/Grasssssssss.png',
  './assets/sprites/Kaktus.png',
  './assets/sprites/RBirdStay.png',
  './assets/sprites/RBridFly.png',
  './assets/sprites/Sky.png',
  './assets/sprites/Square.png',
  './assets/sprites/Treeeeeeeeeeeeee.png',
  './assets/sprites/Triangle.png',
  './assets/sprites/Twoxwoob.png',
  './assets/sprites/Barrrrr.png',
  './assets/sprites/Miktarrrrr.png',
  './assets/sprites/Effectttk.png',
  './assets/sprites/Finished0times.png',
  './assets/sprites/Finished1times.png',
  './assets/sprites/Finished2times.png',
  './assets/sprites/Finished5times.png',
  './assets/sprites/Finished10times.png',
  './assets/sprites/PrimalMode.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
