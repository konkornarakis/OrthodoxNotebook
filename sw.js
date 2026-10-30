// sw.js — λειτουργία χωρίς σύνδεση
//
// Στρατηγική: πρώτα το δίκτυο, ώστε όποιος έχει σύνδεση να βλέπει πάντα την τελευταία έκδοση
// (καμία ενημέρωση δεν «κολλάει» σε παλιά αντίγραφα). Χωρίς σύνδεση, ή με πολύ αργή σύνδεση,
// ό,τι έχει αποθηκευτεί.
// Οι γραμματοσειρές της Google φυλάσσονται μόνιμα, αφού οι διευθύνσεις τους δεν αλλάζουν.
//
// Αν ποτέ χρειαστεί να απενεργοποιηθεί: αρκεί ένα sw.js που κάνει
// self.registration.unregister() και καθαρίζει τα caches.

const VERSION = 'v3';
const CACHE = 'on-pages-' + VERSION;
const FONTS = 'on-fonts-v1';
const PRECACHE = [
  '/main.html', '/synaxarion.html', '/prayer.html', '/fasting.html', '/sermons.html', '/radio.html', '/simeioma.html', '/efarmogi.html',
  '/anagnosmata.html', '/proseuxitario.html', '/assets/greek.js', '/assets/prayers.js',
  '/assets/site.css', '/assets/site.js', '/assets/calendar.js', '/assets/prayer.js', '/assets/ics.js',
  '/assets/icons/icon.svg', '/assets/icons/icon-192.png', '/assets/icons/favicon-32.png', '/assets/icons/apple-touch-icon.png',
  '/manifest.webmanifest', '/sermons-data.json',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // ένα-ένα, ώστε μια αποτυχία να μη σταματά την εγκατάσταση
    await Promise.all(PRECACHE.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('on-') && k !== CACHE && k !== FONTS).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) { /* */ } }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.gstatic.com') { event.respondWith(cacheFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com') { event.respondWith(staleWhileRevalidate(req, event)); return; }
  if (url.origin !== self.location.origin) return;                     // βίντεο, proxies κ.λπ.: όπως πάντα
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/saints') return;   // μόνο δίκτυο

  event.respondWith(networkFirst(event, url));
});

// Οι σελίδες φυλάσσονται χωρίς query string (π.χ. /main.html?x=1 → /main.html)
function keyFor(req, url) {
  return req.mode === 'navigate' ? url.origin + url.pathname : req;
}

// Σε σύνδεση που «σέρνεται» (π.χ. μέσα σε ναό, με μία γραμμή σήμα) δεν περιμένουμε
// επ' άπειρον: μετά από λίγα δευτερόλεπτα δίνεται το αποθηκευμένο αντίγραφο και το δίκτυο
// συνεχίζει στο παρασκήνιο, ώστε την επόμενη φορά να υπάρχει το νεότερο.
const SLOW_MS = 4000;

async function networkFirst(event, url) {
  const req = event.request;
  const key = keyFor(req, url);
  const cache = await caches.open(CACHE);
  const network = (async () => {
    const preloaded = req.mode === 'navigate' ? await event.preloadResponse : null;
    const res = preloaded || await fetch(req);
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      event.waitUntil(cache.put(key, res.clone()));
    }
    return res;
  })();
  event.waitUntil(network.catch(() => {}));

  let timer;
  const slow = new Promise(resolve => { timer = setTimeout(resolve, SLOW_MS, 'slow'); });
  const first = await Promise.race([network.catch(() => 'offline'), slow]);
  clearTimeout(timer);
  if (first instanceof Response && first.status < 500) return first;

  // χωρίς σύνδεση, πολύ αργά, ή σφάλμα του server: το αποθηκευμένο αντίγραφο, αν υπάρχει
  const hit = await cache.match(key);
  if (hit) return hit;
  if (first instanceof Response) return first;
  if (first === 'slow') {
    try { return await network; } catch (e) { /* συνεχίζει παρακάτω */ }
  }
  if (req.mode === 'navigate') {
    const home = await cache.match(url.origin + '/main.html');
    if (home) return home;
  }
  return new Response('Χωρίς σύνδεση', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const update = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(update); return hit; }
  return (await update) || new Response('', { status: 503 });
}
