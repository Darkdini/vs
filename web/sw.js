'use strict';
// Помощник кэша (Service Worker). К адресу каждого файла игры добавляет отпечаток его содержимого (?h=) из /assets.json:
// такой адрес браузер хранит навсегда и берёт из памяти телефона без сети, а изменившийся файл получает новый
// отпечаток — после обновления игры старая картинка не покажется. Любая ошибка — обычная загрузка из сети.
let man = null, manP = null;
const CACHE = 'war-assets';
const loadMan = () => (manP = fetch('/assets.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) man = j; return man; }).catch(() => man));
// убрать из памяти телефона файлы прошлых версий игры (отпечаток не совпадает с текущим списком)
const prune = (m) => m && caches.open(CACHE).then((c) => c.keys().then((ks) => Promise.all(ks.map((k) => { const u = new URL(k.url); return m[decodeURIComponent(u.pathname.slice(1))] === u.searchParams.get('h') ? null : c.delete(k); })))).catch(() => {});
// листы графики (tools/gfxpack.py): картинки лежат в нескольких зашифрованных листах web/pk/<n>.bin — лист скачивается
// один раз целиком, расшифровывается здесь и хранится в памяти телефона (в приложении для Android файл отдаёт само приложение —
// пометка X-App-Local, копировать его в кэш не нужно); картинка отдаётся из листа под своим обычным адресом
const PK_KEY = '__PK_KEY__'; // ключ сборки (подставляет tools/gfxpack.py; в исходниках листов нет)
let pk = null, pkP = null; const PLAIN = new Map();
const loadPk = () => (pkP = (PK_KEY.startsWith('__') ? Promise.resolve(null) : (man ? Promise.resolve(man) : manP || loadMan()).then((m) => fetch(`/pk/index.json?h=${(m && m['pk/index.json']) || Date.now()}`)).then((r) => (r.ok ? r.json() : null)).then((j) => { pk = j && j.kid === seedOf('check') ? j : null; PLAIN.clear(); return pk; }).catch(() => null)));
function seedOf(n) { let h = 0x811C9DC5; for (const ch of new TextEncoder().encode(`${PK_KEY}:${n}`)) h = Math.imul(h ^ ch, 0x01000193) >>> 0; return h || 1; }
function decrypt(ab, n) {
  const b = new Uint8Array(ab), out = new Uint8Array(b.length), full = b.length & ~3, dv = new DataView(b.buffer), ov = new DataView(out.buffer);
  let s = seedOf(n);
  for (let i = 0; i < b.length; i += 4) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    if (i < full) ov.setUint32(i, (dv.getUint32(i, true) ^ s) >>> 0, true);
    else for (let k = 0; i + k < b.length; k++) out[i + k] = b[i + k] ^ ((s >>> (8 * k)) & 255);
  }
  return out;
}
function bundle(n) {
  if (PLAIN.has(n)) return PLAIN.get(n);
  const url = `/pk/${n}.bin?h=${pk.bundles[n]}`;
  const p = caches.open(CACHE).then((c) => c.match(url).then((hit) => hit || fetch(url).then((r) => { if (r.ok && !r.headers.get('X-App-Local')) c.put(url, r.clone()).catch(() => {}); return r; })))
    .then((r) => { if (!r.ok) throw new Error('pk'); return r.arrayBuffer(); }).then((ab) => decrypt(ab, n));
  PLAIN.set(n, p); p.catch(() => PLAIN.delete(n));
  return p;
}
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(loadMan()); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim().then(() => (man || loadMan()).then(prune))));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || u.pathname === '/assets.json' || u.pathname === '/sw.js' || u.pathname.startsWith('/avatar/') || u.pathname.startsWith('/admin.js') || u.pathname === '/ws') return;
  // открытие игры: заодно свежий список отпечатков (до того, как страница запросит картинки)
  if (req.mode === 'navigate') { e.respondWith(Promise.all([fetch(req), loadMan()]).then(([r]) => { e.waitUntil(Promise.resolve(prune(man)).then(() => loadPk())); return r; })); return; }
  const rel = decodeURIComponent(u.pathname.slice(1));
  if (rel.startsWith('gfx') && !PK_KEY.startsWith('__')) { // картинка из листа
    e.respondWith((pk ? Promise.resolve(pk) : pkP || loadPk()).then((P) => {
      const f = P && P.files[rel]; if (!f) return fetch(req);
      return bundle(f[0]).then((b) => new Response(b.slice(f[1], f[1] + f[2]), { headers: { 'Content-Type': f[3] } }));
    }).catch(() => fetch(req)));
    return;
  }
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
