const VERSION = 'v9.0';
const CACHE = 'school-records-' + VERSION;
const ASSETS = ['./', './index.html', './style.css', './core.js', './store.js', './sync.js', './app.js', './analytics.js', './timetable.js', './assignments.js', './config.js', './security.js', './notifications-push.js', './people.js', './fees.js', './plugin-loader.js', './teacher-gate.js', './attendance-v2.js', './gradebook.js', './bulk-messaging.js', './library.js', './i18n.js','./dictionary.js','./math-tools.js','./face-attendance.js','./student-auth.js','./departments.js','./public-pages.js','./registration.js','./voice-marks.js','./app-lock.js','./quiz-builder.js','./ai-exam-generator.js','./notes-bank.js','./courses.js','./discussion.js','./secretary.js','./onboarding.js','./ai-reports.js','./manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('school-records-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match('./index.html'))));
});

/* ---- Web Push event handler ---- */
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'School Records', body: 'New notification' };
  e.waitUntil(self.registration.showNotification(data.title || 'School Records', {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'sr-push',
    renotify: true,
    vibrate: [200, 100, 200],
    data: data.data || {}
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => {
    if (cs.length) return cs[0].focus();
    return clients.openWindow('./');
  }));
});
