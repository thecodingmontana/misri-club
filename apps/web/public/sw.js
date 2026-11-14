// Misri's service worker: shows push notifications and opens their link when
// tapped (see src/server/push.server.ts). It caches nothing.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)

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
