// Web push for the PWA through Firebase Cloud Messaging (the same channel the
// Phase 2 Flutter apps use). Only active with the real backend and a Firebase config.

export function pushConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_CONFIG && import.meta.env.VITE_FIREBASE_VAPID_KEY);
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Ask permission, register the FCM service worker and return a device token. */
export async function enablePush(): Promise<string> {
  if (!pushConfigured()) throw new Error('Push isn’t configured for this build (see docs/SETUP.md).');
  if (!pushSupported()) throw new Error('This browser doesn’t support push notifications. On iPhone, add Linky to your Home Screen first.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site.');

  const config = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG!);
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(config))}`,
    { scope: '/firebase-cloud-messaging-push-scope' },
  );
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  const app = getApps()[0] ?? initializeApp(config);
  return getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
}
