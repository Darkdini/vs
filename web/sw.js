'use strict';
// Помощник кэша (Service Worker). К адресу каждого файла игры добавляет отпечаток его содержимого (?h=) из /assets.json:
// такой адрес браузер хранит навсегда и берёт из памяти телефона без сети, а изменившийся файл получает новый
// отпечаток — после обновления игры старая картинка не покажется. Любая ошибка — обычная загрузка из сети.
let man = null, manP = null;
const CACHE = 'war-assets';
const loadMan = () => (manP = fetch('/assets.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) man = j; return man; }).catch(() => man));
// убрать из памяти телефона файлы прошлых версий игры (отпечаток не совпадает с текущим списком)
const prune = (m) => m && caches.open(CACHE).then((c) => c.keys().then((ks) => Promise.all(ks.map((k) => { const u = new URL(k.url); return m[decodeURIComponent(u.pathname.slice(1))] === u.searchParams.get('h') ? null : c.delete(k); })))).catch(() => {});
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(loadMan()); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim().then(() => (man || loadMan()).then(prune))));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || u.pathname === '/assets.json' || u.pathname === '/sw.js' || u.pathname.startsWith('/avatar/') || u.pathname.startsWith('/admin.js') || u.pathname === '/ws') return;
  // открытие игры: заодно свежий список отпечатков (до того, как страница запросит картинки)
  if (req.mode === 'navigate') { e.respondWith(Promise.all([fetch(req), loadMan()]).then(([r]) => { e.waitUntil(prune(man)); return r; })); return; }
  e.respondWith((man ? Promise.resolve(man) : manP || loadMan()).then((m) => {
    const h = m && m[decodeURIComponent(u.pathname.slice(1))];
    if (!h) return fetch(req);
    u.searchParams.set('h', h);
    const key = u.toString();
    // сперва память телефона (Cache Storage) — повторный вход без сети; иначе сеть и сохранить
    return caches.open(CACHE).then((c) => c.match(key).then((hit) => hit || fetch(key, { headers: { Accept: req.headers.get('accept') || '*/*' }, credentials: 'same-origin' }).then((r) => {
      if (r.ok && r.status === 200) e.waitUntil(c.put(key, r.clone()).catch(() => {}));
      return r;
    })));
  }).catch(() => fetch(req)));
});
