// Misri's service worker: push notifications, and an offline copy of the app.
//
// Offline: the app's files are kept once fetched (their names change with
// every deploy, so a kept file never goes stale), and each page and read you
// open is kept as its latest copy. Online, pages and reads always come from
// the network; the copies are only used when it can't be reached. Signing
// out deletes the copies (see src/lib/session-cache.ts).

const FILES = 'misri-files-v1' // hashed build files, icons, the engine
const PAGES = 'misri-pages-v1' // the last copy of pages and data you opened
const KEEP_FILES = 300

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('misri-') && ![FILES, PAGES].includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
)

// The page lists the files it loaded before this worker took over.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'keep-files') return
  const urls = (event.data.urls || []).filter(isFile)
  event.waitUntil(caches.open(FILES).then((cache) => cache.addAll(urls)).catch(() => {}))
})

const isFile = (href) => {
  const url = new URL(href, self.location.origin)
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/stockfish/') ||
      url.pathname.startsWith('/landing/') ||
      /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname))
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // sign-in, calendar feeds, cron and the version check always go to the server
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return

  if (isFile(request.url)) {
    event.respondWith(fromCacheFirst(request))
  } else if (
    request.mode === 'navigate' ||
    url.pathname.startsWith('/_serverFn/')
  ) {
    event.respondWith(fromNetworkFirst(request))
  }
})

async function fromCacheFirst(request) {
  const cache = await caches.open(FILES)
  const kept = await cache.match(request)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok) {
    await cache.put(request, response.clone())
    trim(cache)
  }
  return response
}

async function fromNetworkFirst(request) {
  const cache = await caches.open(PAGES)
  try {
    const response = await fetch(request)
    // only full, successful answers; a redirect (signed out) is not a copy
    if (response.ok && response.type === 'basic' && !response.redirected) {
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const kept = await cache.match(request)
    if (kept) return kept
    if (request.mode === 'navigate') {
      // a page never opened: the home page can still show what's kept
      const home = await cache.match('/')
      if (home) return home
      return new Response(OFFLINE_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
    throw error
  }
}

// keeps the newest files once a deploy or two have added more
async function trim(cache) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - KEEP_FILES))) {
    await cache.delete(key)
  }
}

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Misri</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;background:#fafafa;color:#1c1917;text-align:center}
@media (prefers-color-scheme:dark){body{background:#0c0a09;color:#fafaf9}}</style></head>
<body><main><h1>You're offline</h1><p>This page hasn't been opened on this device yet.<br>It will load once you're back online.</p></main></body></html>`

self.addEventListener('push', (event) => {
  // DevTools' "Push" button sends plain text, so fall back to it
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Misri', {
      body: data.body,
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
  // only ever open our own pages
  if (url.origin !== self.location.origin) return
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find(
          (w) => new URL(w.url).origin === url.origin,
        )
        if (!open) return self.clients.openWindow(url.href)
        return open.focus().then((w) => w.navigate(url.href))
      }),
  )
})
