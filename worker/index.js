/* eslint-disable no-restricted-globals */
// Código extra do service worker (next-pwa junta este arquivo ao sw.js gerado).
// Exibe as notificações push enviadas por lib/push/sender.ts e abre o app ao tocar.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Pastoreio', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Pastoreio';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/alertas' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  // Só abre páginas do próprio app
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && new URL(client.url).origin === target.origin) {
          client.navigate(target.href);
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});
