/* 旅遊小幫手 離線快取（放在 index.html 同一個資料夾） */
const V = 'trip-cache-v1';
const CORE = ['index.html', 'addon.js', 'addon.css', 'manifest.json', 'app-icon.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+Display:wght@400;700&family=Noto+Sans+TC:wght@400;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];
const HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
const BAD = /firebaseio\.com|firebasedatabase\.app/;
const scope = self.registration.scope;
const INDEX = new URL('index.html', scope).href;
const keyOf = u => { const x = new URL(u); return x.origin === location.origin ? x.origin + x.pathname : x.href; };
const cacheable = (u, img) => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol) || BAD.test(x.host)) return false; return x.origin === location.origin || HOSTS.includes(x.hostname) || !!img; } catch (e) { return false; } };
const put = (key, res) => (res && (res.ok || res.type === 'opaque')) ? caches.open(V).then(c => c.put(key, res)).catch(() => { }) : null;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(
    CORE.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && c.put(keyOf(new URL(u, scope)), r)).catch(() => { }))
      .concat(CDN.map(u => fetch(u).then(r => r.ok && c.put(u, r)).catch(() => { })))
  )).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// 網路優先（4 秒沒回應就先用快取）：自己的網頁程式，有更新時能馬上拿到新版
const netFirst = (r, key) => new Promise(res => {
  let done = false; const fin = x => { if (!done && x) { done = true; res(x); } };
  const t = setTimeout(() => caches.match(key).then(fin), 4000);
  fetch(r).then(x => { clearTimeout(t); if (x && x.ok) put(key, x.clone()); if (!done) { done = true; res(x); } })
    .catch(() => { clearTimeout(t); caches.match(key).then(m => { if (!done) { done = true; res(m || Response.error()); } }); });
});
// 圖片：先顯示快取，背景再更新
const swr = (r, key) => caches.match(key).then(m => { const f = fetch(r).then(x => { put(key, x.clone()); return x; }).catch(() => m); return m || f; });
// 外部函式庫、字型：版本固定，有快取就直接用
const cf = (r, key) => caches.match(key).then(m => m || fetch(r).then(x => { put(key, x.clone()); return x; }));

self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const same = new URL(r.url).origin === location.origin, img = r.destination === 'image';
  if (!cacheable(r.url, img)) return;   // 同步資料庫、天氣、匯率等一律走網路，不碰
  if (r.mode === 'navigate') return e.respondWith(netFirst(r, INDEX));
  const key = same ? keyOf(r.url) : r.url;
  if (img) return e.respondWith(swr(r, key));
  if (same) return e.respondWith(netFirst(r, key));
  e.respondWith(cf(r, key));
});

// 頁面載入後，把用到的資源（字型、行程照片…）一次存起來
self.addEventListener('message', e => {
  const d = e.data; if (!d || d.type !== 'warm') return;
  e.waitUntil(Promise.all((d.list || []).filter(([u, img]) => cacheable(u, img)).map(([u, img]) => {
    const key = keyOf(u);
    return caches.match(key).then(m => m || fetch(u).catch(() => fetch(u, { mode: 'no-cors' })).then(x => put(key, x)).catch(() => { }));
  })));
});
