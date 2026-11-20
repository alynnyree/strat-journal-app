// The Strat Setups pop-up. The service sends one message per purchase; this
// shows it as a notification, and a tap opens the answer page on that
// purchase. Nothing here reads or writes trades.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Strat Setups';
  const url = d.url || './';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Which play, and which timeframe did you enter on?',
    tag: d.fill ? 'purchase-' + d.fill : 'purchase',
    icon: '../icon-192.png',
    data: { url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope) && 'navigate' in c) { await c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
