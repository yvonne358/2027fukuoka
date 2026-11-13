/* 旅遊小幫手 附加功能：倒數貼紙、行程照片、今日路線、Firebase 即時同步、多旅程模板 */
(function () {
  // ▼▼▼ 只需要改這裡：貼上 Firebase 給你的設定（教學見「設定教學.md」）▼▼▼
  const FIREBASE_CONFIG = { apiKey: "", authDomain: "", databaseURL: "", projectId: "", appId: "" };
  // ▲▲▲ 留空的話，會繼續使用原本的 Google 同步，其他功能照常 ▲▲▲

  const $ = id => document.getElementById(id);
  const trip = new URLSearchParams(location.search).get('trip') || 'default';
  Object.assign(LOC_COORDS, { Fukuoka: { lat: 33.5902, lon: 130.4017 }, Tokyo: { lat: 35.6762, lon: 139.6503 }, Sapporo: { lat: 43.0618, lon: 141.3545 }, Okinawa: { lat: 26.2124, lon: 127.6809 }, Seoul: { lat: 37.5665, lon: 126.978 }, Busan: { lat: 35.1796, lon: 129.0756 } });

  // --- 出發倒數貼紙 ---
  function countdown() {
    const hero = document.querySelector('#page-itinerary .hero-header');
    if (!hero || !data.days.length) return;
    let el = $('cd-sticker');
    if (!el) { el = document.createElement('div'); el.id = 'cd-sticker'; hero.appendChild(el); }
    const now = new Date(), s = new Date(data.days[0].date + 'T00:00:00'), e = new Date(data.days[data.days.length - 1].date + 'T23:59:59');
    const left = Math.ceil((s - now) / 864e5);
    el.innerHTML = left > 0 ? `<span class="plane">✈️</span> 距離出發還有 ${left} 天` : now <= e ? `<span class="plane">🎒</span> 旅行中！第 ${Math.floor((now - s) / 864e5) + 1} 天` : `🏠 旅程結束，平安回家`;
  }
  const _uh = updateHero; updateHero = function () { _uh(); countdown(); };

  // --- 行程照片 + 今日路線 ---
  const _ri = renderItinerary;
  renderItinerary = function () {
    _ri();
    const d = data.days[currentDayIndex]; if (!d) return;
    document.querySelectorAll('#itinerary-list .timeline-card-wrapper').forEach(w => {
      const ev = d.events[+w.dataset.idx];
      if (ev && ev.image) { const im = document.createElement('img'); im.className = 'evt-img'; im.loading = 'lazy'; im.src = ev.image; im.onerror = () => im.remove(); w.querySelector('.event-title-large').after(im); }
    });
    const stops = d.events.filter(x => x.location && x.category !== 'flight' && x.category !== 'transport').map(x => '日本 ' + x.location);
    if (stops.length >= 2) {
      const u = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(stops[0]) + '&destination=' + encodeURIComponent(stops[stops.length - 1]) + (stops.length > 2 ? '&waypoints=' + encodeURIComponent(stops.slice(1, -1).join('|')) : '');
      $('itinerary-list').insertAdjacentHTML('afterbegin', `<a class="route-btn" target="_blank" href="${u}">🗺️ 今日路線</a>`);
    }
  };
  const _oe = openEventModal;
  openEventModal = function (idx) {
    _oe(idx);
    if (!$('evt-img')) $('evt-note').previousElementSibling.insertAdjacentHTML('beforebegin', '<label>照片網址（選填）</label><input type="text" id="evt-img" placeholder="例如 images/dazaifu.jpg">');
    $('evt-img').value = idx == null ? '' : (data.days[currentDayIndex].events[idx].image || '');
  };
  const _se = saveEvent;
  saveEvent = function () {
    const d = data.days[currentDayIndex], img = ($('evt-img') || {}).value || '';
    d.events.forEach(x => Object.defineProperty(x, '_s', { value: 1, configurable: true }));
    _se();
    const n = d.events.find(x => !x._s);
    if (n && (img || n.image)) { if (img) n.image = img; else delete n.image; saveData(); renderItinerary(); }
  };

  // --- Firebase 即時同步 ---
  if (!FIREBASE_CONFIG.apiKey) return;
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const load = s => new Promise((r, j) => { const e = document.createElement('script'); e.src = s; e.onload = r; e.onerror = j; document.head.appendChild(e); });
  let db, ref;
  const ready = load(base + 'firebase-app-compat.js').then(() => load(base + 'firebase-database-compat.js')).then(() => {
    firebase.initializeApp(FIREBASE_CONFIG); db = firebase.database(); ref = db.ref('trips/' + trip);
  });
  const clean = o => JSON.parse(JSON.stringify(o));
  const norm = v => {
    v.days = (v.days || []).map(d => { d.events = d.events || []; d.date = String(d.date).replace(/\./g, '-'); return d; });
    v.expenses = (v.expenses || []).map(e => { e.splitDetails = e.splitDetails || {}; return e; });
    v.members = v.members || ['我'];
    v.settings = Object.assign({ showTotalsToPublic: false, defaultCurrency: 'TWD' }, v.settings || {});
    return v;
  };
  const blank = () => ({ days: [{ date: new Date().toISOString().split('T')[0], title: '第一天', location: 'Fukuoka', events: [] }], expenses: [], members: ['我', '朋友A'], settings: {} });
  const toast = (t, bad) => { const s = document.createElement('div'); s.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);color:#fff;padding:5px 15px;border-radius:20px;font-size:.8rem;z-index:9999;background:' + (bad ? '#d33' : '#4A423D'); s.innerText = t; document.body.appendChild(s); setTimeout(() => s.remove(), 2000); };

  const _sd = saveData;
  saveData = function () {
    localStorage.setItem('trip_data_public', JSON.stringify(data));
    ready.then(() => ref.set(clean(data))).then(() => toast('✅ 已同步')).catch(() => { toast('❌ 同步失敗', 1); });
  };
  const _lc = loadCloudData;
  loadCloudData = async function () {
    try {
      await ready;
      ref.on('value', async snap => {
        let v = snap.val();
        if (!v || !v.days) {            // 這個旅程還沒有資料
          if (trip === 'default') { try { const r = await fetch(API_URL); const old = await r.json(); v = old && old.days ? old : data; } catch (e) { v = data; } }
          else v = blank();
          ref.set(clean(norm(v))); return;
        }
        data = norm(v); localStorage.setItem('trip_data_public', JSON.stringify(data));
        if (currentDayIndex >= data.days.length) currentDayIndex = 0;
        updateHero(); renderDates(); renderItinerary(); renderExpenseList(); renderTotalOverview(); renderShoppingList(); renderPackingList();
      });
    } catch (e) { console.error(e); _lc(); }
  };

  // --- 旅程切換 / 建立新旅程（模板）---
  const b = document.createElement('div'); b.id = 'trip-btn'; b.innerText = '🗺️ ' + (trip === 'default' ? '旅程' : trip);
  b.onclick = async () => {
    const c = (prompt('輸入旅程代碼來開啟或建立旅程（建議用英文+數字，例如 tokyo2027）\n新的代碼 = 新旅程\n目前：' + trip) || '').trim().replace(/[.#$\[\]\/]/g, '');
    if (!c) return;
    await ready;
    const s = await db.ref('trips/' + c).once('value');
    if (!s.exists() && confirm('這是新旅程。\n要把目前的行程複製過去當範本嗎？\n（保留每天行程與成員，清空記帳）\n按「取消」則建立空白旅程')) {
      const cp = clean(data); cp.expenses = []; await db.ref('trips/' + c).set(cp);
    }
    location.href = '?trip=' + encodeURIComponent(c);
  };
  document.body.appendChild(b);
})();
