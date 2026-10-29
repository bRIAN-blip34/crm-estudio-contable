// Service worker del CRM — sin bundler (ver CLAUDE.md: frontend vanilla,
// sin npm), así que a diferencia de finnix-app (vite-plugin-pwa,
// injectManifest) este archivo es código plano, cacheado con Cache API
// directo, sin Workbox. Cache mínimo (shell de la app) + manejo de push
// en background vía Firebase Cloud Messaging — mismo patrón que
// finnix-app/src/sw.js, adaptado a mano.

const CACHE_NAME = 'finnix-crm-shell-v1';
const SHELL_ASSETS = ['/', '/index.html', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Network-first para todo — el CRM trabaja con datos de Firestore siempre
// frescos, el cache acá es solo para que el shell cargue instantáneo/
// offline, no para servir data vieja de negocio.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request)),
  );
});

// ── Firebase Cloud Messaging (push en background) ──────────────────────
// Mismo proyecto/credenciales que ya están hardcodeadas en index.html (son
// la config pública del cliente Firebase, no un secreto — ver
// CLAUDE.md, "No modificar firebaseConfig"). Sin build ni env vars acá,
// así que van repetidas a mano en vez de import.meta.env como en
// finnix-app.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCgpZnHLfdoMu3YuCvQvJUnVWONpI3g2LU',
  authDomain: 'finnix-crm.firebaseapp.com',
  projectId: 'finnix-crm',
  storageBucket: 'finnix-crm.firebasestorage.app',
  messagingSenderId: '869108301178',
  appId: '1:869108301178:web:678d8cf5ce0f9a71286ac3',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Finnix CRM', {
    body: body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
