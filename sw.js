/* 旅遊小幫手 離線快取（放在 index.html 同一個資料夾） */
const V = 'trip-cache-v3';
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

// 每次都向伺服器確認有沒有新版（不吃瀏覽器自己的 10 分鐘快取）
const fresh = r => r.mode === 'navigate' ? new Request(r.url, { cache: 'no-cache' }) : new Request(r, { cache: 'no-cache' });
// 先顯示快取（打開馬上有畫面），同時在背景檢查新版，新版下次打開就會生效；第一次還沒有快取時才等網路
const swr = (e, r, key) => caches.match(key).then(m => {
  const f = fetch(fresh(r)).then(x => { if (x && x.ok) put(key, x.clone()); return x; }).catch(() => m);
  e.waitUntil(f.catch(() => { }));
  return m || f;
});
// 外部函式庫、字型：版本固定，有快取就直接用
const cf = (r, key) => caches.match(key).then(m => m || fetch(r).then(x => { put(key, x.clone()); return x; }));

self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const same = new URL(r.url).origin === location.origin, img = r.destination === 'image';
  if (!cacheable(r.url, img)) return;   // 同步資料庫、天氣、匯率等一律走網路，不碰
  if (r.mode === 'navigate') return e.respondWith(swr(e, r, INDEX));
  const key = same ? keyOf(r.url) : r.url;
  if (img || same) return e.respondWith(swr(e, r, key));
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
