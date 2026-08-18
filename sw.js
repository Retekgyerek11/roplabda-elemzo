// ═══════════════════════════════════════════════════════════════════════
// Röplabda Meccs Elemző — offline réteg
//
// Cél: a csarnokban, gyenge vagy hiányzó térerő mellett is nyíljon meg az
// alkalmazás és a csapatnak megosztott meccslap.
//
// Stratégia:
//   • saját fájlok (html/js/css)  → cache-first, háttérben frissül
//   • Firebase / Google kérések   → SOHA nem cache-elődnek (mindig élő adat)
//   • megosztott meccslap adata   → network-first, sikeres letöltés után
//                                    elmentve, hogy offline is előjöjjön
//
// Verzióemelés: ha kiadsz egy új verziót, írd át a CACHE_VERSION számot —
// ettől a régi gyorsítótár törlődik és mindenki a friss fájlokat kapja.
// ═══════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'rv-v3';
const APP_CACHE  = CACHE_VERSION + '-app';
const DATA_CACHE = CACHE_VERSION + '-data';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './engine.js',
  './app.js',
  './manifest.webmanifest',
  './favicon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      // addAll fails the whole install if a single file 404s, so each file is
      // fetched on its own and a missing one simply stays uncached.
      .then(cache => Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(err => console.warn('[sw] nem cache-elhető:', url, err))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Anything that must stay live: auth, database traffic, the Firebase SDK.
// Caching these would show stale matches or break sign-in.
function isLiveOnly(url) {
  return /googleapis\.com|firebaseio\.com|firebasedatabase\.app|gstatic\.com|identitytoolkit|securetoken/.test(url);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;

  if (isLiveOnly(url)) {
    // Let the browser handle it normally — no offline fallback on purpose,
    // so nobody ever sees yesterday's data believing it is today's.
    return;
  }

  // Same-origin app files: serve from cache instantly, refresh in the
  // background so the next open already has the newer build.
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(req).then(hit => {
        const network = fetch(req)
          .then(res => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(APP_CACHE).then(c => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit || caches.match('./index.html'));
        return hit || network;
      })
    );
    return;
  }

  // html2canvas is fetched on first export; caching it means the image export
  // keeps working later without a connection.
  // Everything else (fonts, images): try the network, fall back to cache.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(DATA_CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// The page sends the rendered match sheet here after publishing or opening it,
// so a player who loaded the link once can reopen it with no connection.
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'cacheReport' && data.id && data.html) {
    caches.open(DATA_CACHE).then(c =>
      c.put(
        new Request('report-cache/' + data.id),
        new Response(data.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      )
    );
  }
  if (data.type === 'skipWaiting') self.skipWaiting();
});
