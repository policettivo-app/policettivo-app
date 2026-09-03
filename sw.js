// firma-diagnosi-v1
const CACHE = 'policettivo-v3'
const STATIC_FILES = ['/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_FILES)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // firma-diagnosi-v1 — il service worker non tocca piu' le richieste che non sono GET.
  // Una POST non e' mettibile in cache: farla passare di qui non serviva a niente e la
  // esponeva a fallire prima di partire. Senza respondWith la richiesta la fa il browser,
  // esattamente come se il service worker non ci fosse.
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Navigation requests (HTML pages): network-first, cache as fallback
  // This ensures token query params are never lost to a stale cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    )
    return
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})
