/* Firebase Cloud Messaging service worker for background pushes.
 * Registered by src/lib/push.ts with the Firebase web config in the query string,
 * so no project-specific values are baked into this file. */
/* global firebase */
importScripts('/firebase/firebase-app-compat.js', '/firebase/firebase-messaging-compat.js');

const config = JSON.parse(new URL(self.location.href).searchParams.get('config') || '{}');
if (config.apiKey) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const n = payload.notification || {};
    self.registration.showNotification(n.title || 'Linky', {
      body: n.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: (payload.data && payload.data.url) || '/' },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ('focus' in w) return w.navigate(url).then((c) => c && c.focus());
      return self.clients.openWindow(url);
    }),
  );
});
