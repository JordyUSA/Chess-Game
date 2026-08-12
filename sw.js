/**
 * Service worker: precache the shell, cache-first for everything bundled.
 *
 * The whole app — code, styles, all 6,500 puzzles — is a fixed set of static
 * files, so there is nothing to negotiate at runtime. Precache it on install
 * and the game works on a plane.
 *
 * Bump CACHE_VERSION whenever shipped files change; the old cache is dropped
 * on activate.
 */

const CACHE_VERSION = 'pocket-chess-v1';

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/board.css',
  'css/ui.css',
  'js/main.js',
  'js/data.js',
  'js/core/rules.js',
  'js/core/puzzle.js',
  'js/core/daily.js',
  'js/core/srs.js',
  'js/core/store.js',
  'js/core/explain.js',
  'js/core/dates.js',
  'js/core/rng.js',
  'js/ui/board.js',
  'js/ui/input.js',
  'js/ui/pieces.js',
  'js/ui/sound.js',
  'js/ui/fx.js',
  'js/ui/icons.js',
  'js/ui/settings.js',
  'js/ui/screens/home.js',
  'js/ui/screens/puzzle.js',
  'js/ui/screens/pickers.js',
  'js/ui/screens/play.js',
  'js/ui/screens/stats.js',
  'js/ai/engine.js',
  'js/ai/worker.js',
  'js/ai/eval.js',
  'vendor/chess.js',
  'data/index.json',
  'data/daily.json',
  'data/puzzles/tier-1.json',
  'data/puzzles/tier-2.json',
  'data/puzzles/tier-3.json',
  'data/puzzles/tier-4.json',
  'data/puzzles/tier-5.json',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll is atomic: one 404 would reject the whole install, so add
      // individually and let a missing optional asset slide.
      .then((cache) => Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations fall back to the cached shell so deep links work offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
