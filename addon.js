/* 旅遊小幫手 附加功能（完整版）：倒數貼紙、照片、今日路線、Firebase 同步、須知頁、評分頁 */
(function () {
  { const q = (document.currentScript && document.currentScript.src.split('?')[1]) || Date.now(); if (!document.getElementById('addon-css')) { const l = document.createElement('link'); l.id = 'addon-css'; l.rel = 'stylesheet'; l.href = 'addon.css?' + q; document.head.appendChild(l); } }
  // ---------- 離線使用（Service Worker：sw.js）----------
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const warm = () => navigator.serviceWorker.ready.then(reg => {
      if (!reg.active) return;
      const L = performance.getEntriesByType('resource').map(e => [e.name, e.initiatorType === 'img']), add = u => { try { if (u) L.push([new URL(u, location.href).href, true]); } catch (x) { } };
      try {
        (data.days || []).forEach(d => (d.events || []).forEach(e => add(e.image)));
        ((data.info || {}).hotels || []).forEach(h => add(h.img));
        ((data.rating || {}).items || []).forEach(i => (i.players || []).forEach(p => add(p.img)));
      } catch (x) { }
      reg.active.postMessage({ type: 'warm', list: L });
    }).catch(() => { });
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').then(() => { setTimeout(warm, 5000); setTimeout(warm, 20000); }).catch(() => { }); });
    window.addEventListener('online', () => setTimeout(warm, 2000));
    window.addEventListener('offline', () => { try { toast('📴 目前離線，顯示上次載入的內容'); } catch (x) { } });
  }
  const FIREBASE_CONFIG = { apiKey: "AIzaSyAwVNxRT6VMje1ZutvaOx-oL36MsaF8f1w", authDomain: "travel-plan-46bc4.firebaseapp.com", databaseURL: "https://travel-plan-46bc4-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "travel-plan-46bc4", appId: "1:995767265783:web:a12f909fda79f5d4d766f2" };

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 簡易文字格式：**粗體**、*斜體*、~~刪除線~~、<span style="color: #ff0000;">文字</span>（只允許顏色，其他一律當一般文字）
  const mdEm = t => t.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/~~([\s\S]+?)~~/g, '<s>$1</s>').replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
  const md = t => mdEm(esc(t).replace(/&lt;span style=(?:&quot;|')color:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*;?(?:&quot;|')&gt;([\s\S]*?)&lt;\/span&gt;/g, '<span style="color:$1">$2</span>'));
  const MDC = ['#e53935', '#fb8c00', '#43a047', '#1e88e5', '#8e24aa'];
  const mdBar = id => `<div class="md-bar"><button type="button" onclick="mdW('${id}','**','**')"><b>B</b></button><button type="button" onclick="mdW('${id}','*','*')"><i>I</i></button><button type="button" onclick="mdW('${id}','~~','~~')"><s>S</s></button>${MDC.map(c => `<button type="button" class="md-c" style="background:${c}" onclick="mdW('${id}','&lt;span style=&quot;color: ${c};&quot;&gt;','&lt;/span&gt;')"></button>`).join('')}</div>`;
  window.mdW = (id, a, b) => { const t = $(id); if (!t) return; const st = t.selectionStart, en = t.selectionEnd, v = t.value, sel = v.slice(st, en) || '文字'; t.value = v.slice(0, st) + a + sel + b + v.slice(en); t.focus(); t.setSelectionRange(st + a.length, st + a.length + sel.length); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const trip = new URLSearchParams(location.search).get('trip') || 'default';
  // 管理員模式閒置自動上鎖（分鐘；設 0 代表不自動上鎖）
  const AUTO_LOCK_MIN = 5; let lastAct = Date.now();
  ['click', 'touchstart', 'keydown'].forEach(e => document.addEventListener(e, () => { lastAct = Date.now(); }, true));
  setInterval(() => { if (AUTO_LOCK_MIN && typeof isAdminMode !== 'undefined' && isAdminMode && Date.now() - lastAct > AUTO_LOCK_MIN * 60000) toggleAdminMode(); }, 20000);
  const me = localStorage.voter_id || (localStorage.voter_id = 'v' + Math.random().toString(36).slice(2, 10));
  let votes = {}, rateSel = 0, openD = {}, DONE = {}, MASC = null;
  try { DONE = JSON.parse(localStorage.getItem('done_' + trip) || '{}') || {}; votes = JSON.parse(localStorage.getItem('votes_' + trip) || '{}') || {}; } catch (e) { }   // 離線時也記得完成進度與評分
  const I = () => data.info = Object.assign({ flights: [], hotels: [], notes: [] }, data.info || {});
  const R = () => data.rating = Object.assign({ items: [] }, data.rating || {});
  const commit = () => { saveData(); renderInfo(); renderRate(); };
  Object.assign(LOC_COORDS, { Fukuoka: { lat: 33.5902, lon: 130.4017 }, Tokyo: { lat: 35.6762, lon: 139.6503 }, Sapporo: { lat: 43.0618, lon: 141.3545 }, Okinawa: { lat: 26.2124, lon: 127.6809 }, Seoul: { lat: 37.5665, lon: 126.978 }, Busan: { lat: 35.1796, lon: 129.0756 } });

  // ---------- 通用表單視窗 ----------
  function form(title, fields, vals, onSave, onDel) {
    let m = $('gen-modal'); if (!m) { m = document.createElement('div'); m.id = 'gen-modal'; m.className = 'modal'; document.body.appendChild(m); }
    m.innerHTML = `<div class="modal-content"><h3 style="margin-top:0">${title}</h3>${fields.map(([k, l, t]) => `<label>${l}</label>` + (t === 'rich' ? mdBar('gf-' + k) + `<textarea id="gf-${k}" rows="4"></textarea>` : t === 'area' ? `<textarea id="gf-${k}" rows="3"></textarea>` : `<input id="gf-${k}" type="${t || 'text'}">`)).join('')}<button class="btn" id="gf-ok">儲存</button>${onDel ? '<button class="btn btn-danger" id="gf-del">刪除</button>' : ''}<button class="btn btn-outline" id="gf-x" style="margin-top:5px">取消</button></div>`;
    fields.forEach(([k]) => $('gf-' + k).value = (vals || {})[k] || '');
    const close = () => m.style.display = 'none';
    $('gf-ok').onclick = () => { const o = {}; fields.forEach(([k]) => o[k] = $('gf-' + k).value.trim()); onSave(o); close(); };
    $('gf-x').onclick = close;
    if (onDel) $('gf-del').onclick = () => { if (confirm('確定刪除？')) { onDel(); close(); } };
    m.style.display = 'flex';
  }

  // ---------- 小倒數貼紙（行程頁） ----------
  function stage() {
    const D = data.days; if (!D.length) return { k: 'work', left: 0 };
    const n = new Date(), s = new Date(D[0].date + 'T00:00:00'), e = new Date(D[D.length - 1].date + 'T23:59:59'), left = Math.ceil((s - n) / 864e5);
    if (n > e) return { k: 'work', left: -1, end: 1 };
    if (left > 7) return { k: 'work', left }; if (left >= 3) return { k: 'pack', left }; if (left === 2) return { k: 'cash', left }; if (left === 1) return { k: 'sleep', left };
    return { k: 'trip', left, di: Math.min(D.length - 1, Math.max(0, Math.floor((n - s) / 864e5))) };
  }
  function countdown() {
    const hero = document.querySelector('#page-itinerary .hero-header'); if (!hero || !data.days.length) return;
    let el = $('cd-sticker'); if (!el) { el = document.createElement('div'); el.id = 'cd-sticker'; hero.appendChild(el); }
    const st = stage();
    el.innerHTML = st.k === 'trip' ? `<span class="plane">🎒</span> 旅行中！第 ${st.di + 1} 天` : st.end ? '🏠 旅程結束，平安回家' : `<span class="plane">✈️</span> 距離出發還有 ${st.left} 天`;
  }
  const _uh = updateHero; updateHero = function () { _uh(); countdown(); renderInfo(); };

  // ---------- 行程照片 + 今日路線 ----------
  const _ri = renderItinerary;
  renderItinerary = function () {
    data.days.forEach(d => { delete d.hasManualOrder; });   // 一律依時間排序（舊的手動排序紀錄也一併作廢）
    _ri();
    if (typeof sortableInstance !== 'undefined' && sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }   // 不允許拖曳調整
    const d = data.days[currentDayIndex]; if (!d) return;
    document.querySelectorAll('#itinerary-list .timeline-card-wrapper').forEach(w => {
      const ev = d.events[+w.dataset.idx];
      if (ev && ev.image) { const im = document.createElement('img'); im.className = 'evt-img'; im.loading = 'lazy'; im.src = ev.image; im.onerror = () => im.remove(); w.querySelector('.event-title-large').after(im); }
    });
    document.querySelectorAll('#itinerary-list .event-note-box').forEach(el => { el.innerHTML = mdEm(el.innerHTML); });
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
    if (!$('evt-note').previousElementSibling.classList.contains('md-bar')) $('evt-note').insertAdjacentHTML('beforebegin', mdBar('evt-note'));
    $('evt-img').value = idx == null ? '' : (data.days[currentDayIndex].events[idx].image || '');
  };
  const _se = saveEvent;
  saveEvent = function () {
    const d = data.days[currentDayIndex], img = ($('evt-img') || {}).value || '', oi = editingEvent && editingEvent.evtIdx, oldKey = oi != null && d.events[oi] ? evKey(d, d.events[oi]) : null;
    d.events.forEach(x => Object.defineProperty(x, '_s', { value: 1, configurable: true }));
    _se();
    const n = d.events.find(x => !x._s);
    if (n) { n.id = oldKey || n.id || uid(); if (img) n.image = img; else delete n.image; saveData(); renderItinerary(); }
  };

  // ---------- 新增兩個頁面 + 導覽列 ----------
  function mkPage(id, title, sub, pre, inner) {
    const d = document.createElement('div'); d.id = 'page-' + id; d.className = 'page';
    d.innerHTML = `<div class="hero-header" style="height:200px"><div class="admin-lock-btn" onclick="toggleAdminMode()"><i class="fas fa-lock"></i></div><div class="day-title-large">${title}</div><div class="location-tag">${sub}</div></div>${pre}<div class="content-area-bg" style="padding:20px">${inner}<div style="height:60px"></div></div>`;
    document.body.insertBefore(d, document.querySelector('.bottom-nav'));
  }
  mkPage('info', '旅行須知', '<i class="fas fa-circle-info"></i> Info & Weather', '', '<div id="info-body"></div>');
  mkPage('rate', '旅途評分', '<i class="fas fa-star"></i> Rate & Compare', '<div class="date-scroller" id="rate-tabs"></div>', '<div id="rate-body"></div>');
  const nav = document.querySelector('.bottom-nav');
  const nv = (pid, ic, t) => { const n = document.createElement('div'); n.className = 'nav-item'; n.innerHTML = `<i class="fas ${ic}"></i> ${t}`; n.onclick = () => switchPage(pid, n); return n; };
  nav.insertBefore(nv('info', 'fa-circle-info', '須知'), nav.children[1]);
  nav.insertBefore(nv('rate', 'fa-star', '評分'), nav.children[3]);

  // ---------- 須知頁 ----------
  const TR = [['plane-arr', '🛬', '飛機(抵達)'], ['plane-dep', '🛫', '飛機(出發)'], ['train', '🚃', '火車'], ['shinkansen', '🚄', '新幹線'], ['bus', '🚌', '公車'], ['coach', '🚍', '遊覽車'], ['car', '🚗', '小客車'], ['boat', '⛴️', '船'], ['cruise', '🛳️', '郵輪'], ['walk', '🚶', '走路']];
  const SCH = {
    flights: ['航班', [['date', '日期', 'date'], ['dep', '出發機場縮寫（如 TPE）'], ['depT', '起飛時間', 'time'], ['arr', '抵達機場縮寫（如 FUK）'], ['arrT', '降落時間', 'time'], ['no', '班機號'], ['bag', '託運行李（尺寸/件數/限重/總重或單件…）', 'rich'], ['carry', '手提行李（尺寸/限重…）', 'rich']]],
    hotels: ['住宿', [['name', '住宿名稱'], ['in', '入住日期', 'date'], ['out', '退房日期', 'date'], ['img', '照片網址（選填）'], ['map', '地圖搜尋關鍵字或地址（選填）'], ['note', '備註', 'rich']]],
    notes: ['須知', [['title', '標題'], ['body', '內文', 'rich']]]
  };
  window.infoEdit = (k, i) => { const L = I()[k], n = i == null; form((n ? '新增' : '編輯') + SCH[k][0], SCH[k][1], n ? {} : L[i], o => { n ? L.push(o) : L[i] = o; commit(); }, n ? null : () => { L.splice(i, 1); commit(); }); };
  window.infoMove = (k, i, d) => { const L = I()[k], j = i + d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; commit(); };
  window.cdG = g => { localStorage.cd_gender = g; renderInfo(); };
  window.cdT = (i, v) => { data.days[i].transport = v; commit(); };
  const ed = (k, i) => `<div class="ed admin-only"><span onclick="infoEdit('${k}',${i})">✏️ 編輯</span>${k !== 'notes' ? `<span onclick="infoMove('${k}',${i},-1)">▲ 上移</span><span onclick="infoMove('${k}',${i},1)">▼ 下移</span>` : ''}</div>`;
  const add = (k, t) => `<button class="btn btn-outline admin-only" onclick="infoEdit('${k}')">+ ${t}</button>`;
  let wxKey = '', wxHtml = '';
  const wi = c => c === 0 ? '☀️' : c <= 3 ? '⛅' : c < 50 ? '🌫️' : c < 70 ? '🌧️' : c < 80 ? '❄️' : c < 90 ? '🌦️' : '⛈️';

  // ---------- Q版人物（向量圖 + 動畫）----------
  const SK = '#FFE0C7', shirt = g => g === 'f' ? '#F4A6A6' : '#8DB6E8';
  const head = (g, x, y, s) => { const f = g === 'f', hc = '#2B2626'; return `<g transform="translate(${x} ${y}) scale(${s})">${f ? `<path d="M-30 -6C-36 -40 36 -40 30 -6L33 32Q0 40 -33 32Z" fill="${hc}"/>` : ''}<circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/>${f ? `<path d="M-27 -2C-30 14 -26 24 -20 28L-22 0ZM27 -2C30 14 26 24 20 28L22 0Z" fill="${hc}"/>` : ''}<g class="k-blink"><ellipse cx="-10" cy="2" rx="3" ry="4" fill="#3B3030"/><ellipse cx="10" cy="2" rx="3" ry="4" fill="#3B3030"/></g><circle cx="-10" cy="2" r="9" fill="rgba(255,255,255,.3)" stroke="#4A423D" stroke-width="1.6"/><circle cx="10" cy="2" r="9" fill="rgba(255,255,255,.3)" stroke="#4A423D" stroke-width="1.6"/><circle cx="-17" cy="10" r="4" fill="#FFB5B5" opacity=".7"/><circle cx="17" cy="10" r="4" fill="#FFB5B5" opacity=".7"/><path d="M-5 11Q0 16 5 11" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/></g>`; };
  const wh = (x, y, r) => `<g class="k-spin"><circle cx="${x}" cy="${y}" r="${r}" fill="#4A423D"/><line x1="${x}" y1="${y - r + 3}" x2="${x}" y2="${y + r - 3}" stroke="#ddd" stroke-width="2"/></g>`;
  const win = (g, x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="#CDEBFF"/>` + head(g, x, y + 3, .42);
  const road = y => `<line class="k-wave" x1="0" y1="${y}" x2="260" y2="${y}" stroke="#cbbfb3" stroke-width="3" stroke-dasharray="14 12"/>`;
  const rects = (xs, y, w, h) => xs.map(x => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#CDEBFF"/>`).join('');
  // ---------- 辦公室場景 + 互動 ----------
  function officeWalk(g) {
    const f = g === 'f', dc = f ? '#C9B8E8' : '#fff';
    return `<g class="k-walkw"><g class="o-w"><rect x="148" y="92" width="22" height="54" rx="4" fill="#BFD7F2"/><rect x="152" y="96" width="14" height="4" rx="2" fill="#fff"/><rect x="157" y="100" width="4" height="5" fill="#7FA6D9"/><rect class="drip" x="158" y="105" width="2" height="8" fill="#7FA6D9"/></g><g class="k-walk hit">${hairB(g, 70, 84, .55)}<rect class="k-leg" x="62" y="128" width="7" height="18" rx="3" fill="#7A6A5E"/><rect class="k-leg" style="animation-direction:alternate-reverse" x="71" y="128" width="7" height="18" rx="3" fill="#7A6A5E"/><rect x="58" y="98" width="24" height="32" rx="9" fill="${dc}" stroke="#d9d2ca"/>${pHead(g, 70, 84, .55)}<line x1="80" y1="104" x2="88" y2="114" stroke="${f ? SK : '#E8E1DA'}" stroke-width="6" stroke-linecap="round"/><g class="cup-w"><rect x="86" y="110" width="8" height="10" rx="2" fill="#CDEBFF" stroke="#9fc5de"/></g><circle cx="88" cy="115" r="3.5" fill="${SK}"/><text class="x-q2" x="78" y="66" font-size="13">❓</text></g></g>`;
  }
  function office(g) {
    const f = g === 'f', hc = '#2B2626', dc = f ? '#C9B8E8' : '#fff';
    const arm = (a, b, c, d) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${f ? SK : '#E8E1DA'}" stroke-width="8" stroke-linecap="round"/>`;
    const hand = (x, y, c) => `<circle ${c ? `class="${c}"` : ''} cx="${x}" cy="${y}" r="4.5" fill="${SK}"/>`;
    const stack = (x, w, cols) => cols.map((c, i) => `<rect x="${x + (i % 2)}" y="${97 - i * 7}" width="${w - (i % 2) * 2}" height="7" rx="1" fill="${c}" stroke="#d6c7ad" stroke-width=".6"/>`).join('');
    const mon = (x, w, d) => `<rect x="${x + 16}" y="92" width="6" height="12" fill="#5B5560"/><rect x="${x}" y="60" width="${w}" height="32" rx="3" fill="#4A4A55"/><rect x="${x + 3}" y="63" width="${w - 6}" height="26" fill="#DDEEFF"/>` + [0, 1, 2, 3].map(i => `<rect class="k-twinkle" style="animation-delay:${i * .35 + d}s" x="${x + 6}" y="${67 + i * 5.5}" width="${w - 12 - (i % 2) * 8}" height="2.4" rx="1" fill="#7FA6D9"/>`).join('');
    const bld = [[12, 34, 12], [26, 22, 14], [42, 30, 10], [54, 16, 16], [72, 28, 14]].map(([x, y, w], i) => `<rect x="${x}" y="${y}" width="${w}" height="${60 - y}" fill="${i % 2 ? '#8AA3BA' : '#9DB4C8'}"/><rect class="k-twinkle" style="animation-delay:${i * .5}s" x="${x + 3}" y="${y + 5}" width="3" height="3" fill="#FFF3B0"/>`).join('');
    const face = `<g transform="translate(70 56)"><g class="hd"><circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/><g class="ey"><g class="k-blink"><ellipse cx="-10" cy="2" rx="3" ry="4.2" fill="${hc}"/><ellipse cx="10" cy="2" rx="3" ry="4.2" fill="${hc}"/></g></g>${[-10, 10].map(x => `<circle cx="${x}" cy="2" r="9" fill="rgba(255,255,255,.3)" stroke="#4A423D" stroke-width="1.6"/>`).join('')}<line x1="-1" y1="2" x2="1" y2="2" stroke="#4A423D" stroke-width="1.6"/><line class="bl" x1="-16" y1="-12" x2="-5" y2="-12" stroke="${hc}" stroke-width="2.2" stroke-linecap="round"/><line class="br" x1="5" y1="-12" x2="16" y2="-12" stroke="${hc}" stroke-width="2.2" stroke-linecap="round"/><circle class="bk" cx="-17" cy="12" r="4"/><circle class="bk" cx="17" cy="12" r="4"/><path class="m-n" d="M-5 14Q0 18 5 14" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse class="m-a" cx="0" cy="15" rx="6" ry="5" fill="#C0392B"/><line class="m-t" x1="-4" y1="15" x2="4" y2="15" stroke="#B5655A" stroke-width="2" stroke-linecap="round"/><circle class="m-w" cx="0" cy="15" r="3" fill="#B5655A"/></g><text class="x-ang" x="16" y="-26" font-size="16">💢</text><text class="x-q" x="18" y="-28" font-size="16">❓</text><text class="x-z" x="18" y="-28" font-size="14">💤</text></g>`;
    return '<defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8977A"/><stop offset="1" stop-color="#B8977A" stop-opacity="0"/></linearGradient></defs><rect x="8" y="8" width="86" height="52" fill="#CFE8F5"/>' + bld + '<rect x="8" y="8" width="86" height="52" fill="none" stroke="#bfb3a5" stroke-width="3"/><rect x="5" y="58" width="92" height="4" fill="#bfb3a5"/>'
      + `<g class="hit seat">${f ? `<g transform="translate(70 56)"><g class="hd"><path d="M-30 -6C-36 -40 36 -40 30 -6L33 32Q0 40 -33 32Z" fill="${hc}"/></g></g>` : ''}<rect x="52" y="80" width="36" height="40" rx="12" fill="${dc}" stroke="#d9d2ca"/>${f ? '<path d="M62 80Q70 90 78 80Z" fill="#fff"/>' : '<polygon points="70,82 66,90 70,104 74,90" fill="#4F86C6"/>'}${face}</g>`
      + '<rect x="4" y="104" width="192" height="8" rx="3" fill="#C9A98B"/><rect x="4" y="112" width="192" height="38" fill="url(#dg)"/><line x1="100" y1="114" x2="100" y2="150" stroke="#a5846a"/>'
      + stack(8, 34, ['#F3E3C3', '#fff', '#E8D0A9', '#D8E2EE', '#fff', '#F3E3C3', '#E8D0A9', '#fff']) + stack(44, 14, ['#E8D0A9', '#fff', '#D8E2EE'])
      + '<rect x="56" y="100" width="30" height="4" rx="1.5" fill="#E8E1DA"/><rect class="cup-s" x="89" y="94" width="7" height="10" rx="1.5" fill="#CDEBFF" stroke="#9fc5de"/><rect x="98" y="98" width="12" height="6" rx="2" fill="#4A4A55"/><rect x="99" y="95" width="10" height="3" rx="1.5" fill="#6B6B78"/>'
      + mon(112, 38, 0) + mon(152, 40, .5)
      + `<g class="o-a a-type">${arm(58, 90, 66, 100)}${arm(82, 90, 78, 100)}${hand(66, 101, 'k-tapL')}${hand(78, 101, 'k-tapR')}</g>`
      + `<g class="o-a a-stretch">${arm(56, 90, 36, 54)}${arm(84, 90, 104, 54)}${hand(35, 51)}${hand(105, 51)}</g>`
      + `<g class="o-a a-drink">${arm(84, 92, 79, 82)}<rect x="66" y="70" width="8" height="10" rx="2" fill="#CDEBFF" stroke="#9fc5de"/>${hand(78, 80)}</g>`
      + `<g class="o-a a-files">${arm(58, 92, 52, 97)}<rect class="k-lid" x="44" y="88" width="14" height="10" fill="#fff" stroke="#d6c7ad"/>${hand(52, 98)}</g>`
      + `<g class="o-a a-phone">${arm(84, 92, 90, 70)}<rect x="86" y="54" width="6" height="18" rx="3" fill="#4A4A55" transform="rotate(10 89 63)"/>${hand(90, 71)}${hand(66, 101, 'k-tapL')}</g>` + officeWalk(g);
  }
  const SC = { s: 'type', f: 'look', n: 0, t: 0, kind: '', left: 7 };
  const SAY = { pack: { 7: ['要帶幾套衣服...?'], 6: ['要帶幾套衣服...?'], 5: ['還有什麼要帶的嗎?'], 4: ['行動電源一定要放隨身包包...'], 3: ['其實只要有帶護照和信用卡就夠了吧!'] }, cash: ['不要偷看我的密碼!', '我忘記領錢了!', '帶這麼多錢夠嗎?'], sleep: ['好興奮!睡不著!'] };
  const pick = a => a[Math.random() * a.length | 0];
  function setBubble(t, ax = 148, ay = 44) { const b = $('cd-bubble'); if (b) { b.style.left = ax / 2 + '%'; b.style.top = ay / 1.5 + '%'; b.textContent = t; b.classList.toggle('on', !!t); } }
  function applyS() { const v = $('cd-svg'); if (v) { v.dataset.s = SC.s; v.dataset.f = SC.f; } }
  function poke() {
    const rest = ['stretch', 'drink'].includes(SC.s), work = ['type', 'phone', 'files'].includes(SC.s);
    SC.n = Date.now() - SC.t < 2500 ? SC.n + 1 : 1; SC.t = Date.now();
    const many = SC.n >= 3, L = work ? ['別吵!我在工作!'] : rest ? ['好累~我休息一下~', '想睡覺了...'] : ['什麼什麼?我也要聽!', '等我一下喔~'];
    SC.f = many ? (work ? 'angry' : rest ? 'tired' : 'wonder') : (work || rest ? 'turn' : 'wonder');
    applyS(); setBubble(many ? pick(L) : '');
    clearTimeout(SC.rt); SC.rt = setTimeout(() => { SC.f = 'look'; SC.n = 0; applyS(); setBubble(''); }, 3500);
  }
  function bindScene(kind, left) {
    SC.kind = kind; SC.left = left; const v = $('cd-svg'); if (!v) return; applyS();
    const tok = SC.tok = (SC.tok || 0) + 1;
    if (kind === 'sleep') { const run = () => { if (tok !== SC.tok) return; setTimeout(() => { if (tok !== SC.tok) return; setBubble('好興奮!睡不著!', 150, 28); setTimeout(() => { if (tok === SC.tok) setBubble(''); }, 2200); }, 7600); setTimeout(run, 10000); }; run(); }
    v.onclick = ev => {
      if (kind === 'work') { if (ev.target.closest('.hit')) poke(); return; }
      if (kind === 'court') { const w = ev.target.closest('[data-who]'); if (!w) return; setBubble(pick(COURT[w.dataset.who]), +w.dataset.ax, +w.dataset.ay); clearTimeout(SC.bt); SC.bt = setTimeout(() => setBubble(''), 2800); return; }
      const L = kind === 'pack' ? (SAY.pack[left] || SAY.pack[7]) : SAY[kind]; if (!L) return;
      setBubble(pick(L)); clearTimeout(SC.bt); SC.bt = setTimeout(() => setBubble(''), 2800);
    };
  }
  setInterval(() => { if (SC.kind === 'work' && SC.f === 'look' && $('cd-svg')) { SC.s = pick(['type', 'type', 'stretch', 'drink', 'files', 'phone', 'walk', 'water']); applyS(); } }, 5000);

  // ---------- 法庭小彩蛋 ----------
  const COURT = { J: ['原告請求權基礎為何?', '原告訴之聲明?', '被告答辯聲明?', '有沒有和解意願?', '有無意見?', '定宣判期日!', '有無證據請求調查?', '講慢一點，書記官打字很辛苦'], C: ['麻煩講慢一點...', '好累...'], R: ['感覺又要拖庭了...', '下一庭是誰?'], L: ['詳如歷次書狀所載', '如書狀所載', '再具狀表示意見', '有和解意願', '謝謝庭上!謝謝書座!'], O: ['法官我跟你說他很可惡...', '我這個很複雜...', '我沒有見過這種人!!!', '你不了解!!!'] };
  const courtDay = () => { const d = new Date(); return (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % 5 === 0; };
  function court(g) {
    const f = g === 'f', hc = '#2B2626', silver = '#C9CED6', onLeft = new Date().getDate() % 2 === 0, LX = onLeft ? 50 : 150, OX = onLeft ? 150 : 50, dir = OX > 100 ? -1 : 1;
    const hd = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${c || hc}"/><circle cx="-9" cy="3" r="3" fill="${hc}"/><circle cx="9" cy="3" r="3" fill="${hc}"/><path d="M-5 13Q0 17 5 13" stroke="#B5655A" stroke-width="3" fill="none"/></g>`;
    const rb = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${c}"/>`;
    const desk = (x, w) => `<rect x="${x}" y="90" width="${w}" height="8" rx="2" fill="#B8977A"/><rect x="${x + 8}" y="82" width="16" height="8" rx="1" fill="#4A4A55"/>`;
    const table = x => `<rect x="${x - 34}" y="118" width="68" height="10" rx="3" fill="#B8977A"/><rect x="${x - 26}" y="112" width="20" height="6" fill="#fff" stroke="#d6c7ad"/><rect x="${x - 4}" y="113" width="22" height="5" fill="#F3E3C3" stroke="#d6c7ad"/>`;
    const sleeve = (x1, y1, x2, y2, c) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`;
    return `<g data-who="J" data-ax="100" data-ay="16" class="hit"><rect x="88" y="40" width="24" height="22" rx="6" fill="#4F6FA8" stroke="#2F4E86" stroke-width="1.5"/><path d="M93 40L100 54L107 40" fill="#7F9BD0" stroke="#2F4E86" stroke-width="1.5"/><g class="k-nod">${hd(100, 30, .5)}</g></g><rect x="64" y="54" width="72" height="14" rx="3" fill="#8A6F55"/>`
      + `<g data-who="C" data-ax="40" data-ay="54" class="hit">${rb(60, 78, 22, 26, '#1f1f1f')}<g class="k-bob">${hd(71, 70, .45)}</g></g>${desk(52, 38)}<circle class="k-tapL" cx="66" cy="92" r="3" fill="${SK}"/><circle class="k-tapR" cx="76" cy="92" r="3" fill="${SK}"/>`
      + `<g data-who="R" data-ax="160" data-ay="54" class="hit">${rb(118, 78, 22, 26, '#1f1f1f')}<g class="k-sleepy">${hd(129, 70, .45)}</g></g>${desk(110, 38)}<rect class="k-lid" x="122" y="90" width="9" height="6" fill="#fff" stroke="#d6c7ad"/><circle class="k-tapL" cx="124" cy="94" r="2.6" fill="${SK}"/><text class="k-twinkle" x="140" y="62" font-size="9" fill="#999">z</text>`
      + `<g data-who="O" data-ax="${OX}" data-ay="64" class="hit">${rb(OX - 13, 94, 26, 32, '#E8A87C')}${hd(OX, 82, .55, '#6b4a3a')}</g>${table(OX)}<g class="k-flap">${sleeve(OX + dir * 11, 102, OX + dir * 24, 90, '#E8A87C')}<circle cx="${OX + dir * 25}" cy="88" r="3.5" fill="${SK}"/></g><text class="k-twinkle" x="${OX - 6}" y="66" font-size="12">💢</text>`
      + `<g data-who="L" data-ax="${LX}" data-ay="64" class="hit">${hairB(g, LX, 82, .55)}${rb(LX - 14, 94, 28, 32, hc)}<path d="M${LX - 11} 94L${LX + 11} 94L${LX + 5} 126L${LX - 5} 126Z" fill="${silver}"/><path d="M${LX - 5} 94L${LX + 5} 94L${LX} 103Z" fill="${hc}"/>${pHead(g, LX, 82, .55)}</g>${table(LX)}`
      + `${sleeve(LX - 12, 100, LX - 15, 114, hc)}<rect x="${LX - 19}" y="111" width="8" height="4" rx="1.5" fill="${silver}"/><circle class="k-tapL" cx="${LX - 15}" cy="118" r="3" fill="${SK}"/>${sleeve(LX + 12, 100, LX + 15, 114, hc)}<rect x="${LX + 11}" y="111" width="8" height="4" rx="1.5" fill="${silver}"/><circle class="k-tapR" cx="${LX + 15}" cy="118" r="3" fill="${SK}"/>`;
  }

  // ---------- 收行李（依剩餘天數）----------
  const hairB = (g, x, y, s) => g === 'f' ? `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 -6C-36 -40 36 -40 30 -6L33 32Q0 40 -33 32Z" fill="#2B2626"/></g>` : '';
  const pHead = (g, x, y, s) => { const f = g === 'f', hc = '#2B2626'; return `<g transform="translate(${x} ${y}) scale(${s})"><circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/><g class="k-blink"><ellipse cx="-10" cy="2" rx="3" ry="4.2" fill="${hc}"/><ellipse cx="10" cy="2" rx="3" ry="4.2" fill="${hc}"/></g>${[-10, 10].map(x => `<circle cx="${x}" cy="2" r="9" fill="rgba(255,255,255,.3)" stroke="#4A423D" stroke-width="1.6"/>`).join('')}<line x1="-1" y1="2" x2="1" y2="2" stroke="#4A423D" stroke-width="1.6"/><path d="M-5 14Q0 18 5 14" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/></g>`; };
  function pack(g, left) {
    const f = g === 'f', dc = f ? '#C9B8E8' : '#fff';
    const arm = (a, b, c, d) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${f ? SK : '#E8E1DA'}" stroke-width="8" stroke-linecap="round"/>`;
    const hand = (x, y, c) => `<circle ${c ? `class="${c}"` : ''} cx="${x}" cy="${y}" r="4.5" fill="${SK}"/>`;
    const sit = x => `${hairB(g, x, 76, .8)}<rect x="${x - 20}" y="122" width="18" height="10" rx="5" fill="#7A6A5E"/><rect x="${x + 2}" y="122" width="18" height="10" rx="5" fill="#7A6A5E"/><rect x="${x - 14}" y="94" width="28" height="32" rx="10" fill="${dc}"/>${pHead(g, x, 76, .8)}`;
    const stand = (x, c, ex) => `<g ${c ? `class="${c}"` : ''}>${hairB(g, x, 52, .8)}<rect x="${x - 14}" y="70" width="28" height="38" rx="10" fill="${dc}"/><rect x="${x - 10}" y="106" width="8" height="22" rx="4" fill="#7A6A5E"/><rect x="${x + 2}" y="106" width="8" height="22" rx="4" fill="#7A6A5E"/>${pHead(g, x, 52, .8)}${ex || ''}</g>`;
    const stuff = n => ['#A0C4E3', '#F3B6B6', '#F6D365', '#BFE0C6'].slice(0, n).map((c, i) => `<rect x="124" y="${122 - i * 9}" width="44" height="8" rx="3" fill="${c}"/>`).join('');
    const open = n => `<rect x="118" y="54" width="56" height="40" rx="6" fill="#D98E5F"/><rect x="118" y="92" width="56" height="42" rx="6" fill="#E8A87C"/><rect x="123" y="96" width="46" height="34" rx="4" fill="#F5DEC8"/>${stuff(n)}`;
    const bag = x => `<rect x="${x}" y="104" width="26" height="28" rx="9" fill="#7FA6D9"/><rect x="${x + 5}" y="116" width="16" height="10" rx="3" fill="#5E87BC"/>`;
    const sh = '<ellipse cx="100" cy="138" rx="90" ry="6" fill="rgba(0,0,0,.06)"/>';
    if (left >= 6) return sh + open(0) + sit(52) + '<rect x="68" y="118" width="22" height="8" rx="3" fill="#A0C4E3"/><rect class="k-move" x="70" y="108" width="14" height="10" rx="2" fill="#F3B6B6"/>' + arm(62, 102, 74, 114) + hand(75, 115, 'k-tapL');
    if (left === 5) return sh + '<rect x="4" y="96" width="30" height="6" rx="2" fill="#C9A98B"/><rect x="8" y="102" width="4" height="30" fill="#B8977A"/><rect x="26" y="102" width="4" height="30" fill="#B8977A"/><rect x="8" y="82" width="7" height="14" rx="2" fill="#7FA6D9"/><rect x="18" y="86" width="9" height="10" rx="2" fill="#E09F9F"/>' + open(2) + stand(70, 'k-turn', arm(60, 80, 46, 92) + hand(46, 93)) + '<rect class="k-move" x="84" y="92" width="7" height="14" rx="2" fill="#7FA6D9"/>';
    if (left === 4) return sh + '<rect x="118" y="90" width="56" height="42" rx="6" fill="#E8A87C"/><rect x="118" y="84" width="56" height="12" rx="6" fill="#D98E5F"/><rect x="138" y="78" width="16" height="6" rx="3" fill="#a9754f"/>' + sit(56) + bag(82) + arm(66, 102, 84, 112) + hand(85, 113, 'k-tapL') + '<circle cx="20" cy="142" r="4" fill="none" stroke="#C9A24B" stroke-width="2"/><rect x="24" y="141" width="10" height="3" fill="#C9A24B"/><rect x="44" y="138" width="14" height="9" rx="2" fill="#8A5A44"/><rect x="66" y="141" width="26" height="5" rx="2.5" fill="#E09F9F"/><rect x="100" y="138" width="11" height="9" rx="2" fill="#4C8C6A"/>';
    return sh + '<rect x="132" y="48" width="40" height="84" rx="7" fill="#E8A87C"/><line x1="152" y1="52" x2="152" y2="130" stroke="#a9754f" stroke-width="2" stroke-dasharray="3 2"/><rect x="144" y="40" width="16" height="8" rx="3" fill="#a9754f"/>' + bag(102) + stand(60) + arm(72, 80, 86, 66) + hand(87, 64) + '<g class="k-bob"><rect x="84" y="46" width="14" height="18" rx="2" fill="#4C8C6A"/><circle cx="91" cy="55" r="3.5" fill="none" stroke="#E8D28A"/></g>';
  }

  // ---------- 領外幣 / 睡不著 ----------
  function cashAtm(g) {
    const f = g === 'f', dc = f ? '#C9B8E8' : '#fff', arm = (a, b, c, d) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${f ? SK : '#E8E1DA'}" stroke-width="8" stroke-linecap="round"/>`;
    const bill = y => `<rect x="126" y="${y}" width="28" height="12" rx="2" fill="#CFE8C0" stroke="#7FB77E"/><text x="136" y="${y + 9}" font-size="9" fill="#5C9A5B">¥</text>`;
    return '<ellipse cx="100" cy="132" rx="90" ry="5" fill="rgba(0,0,0,.06)"/>'
      + '<polygon points="2,46 28,28 54,46" fill="#C9A98B"/><text x="14" y="44" font-size="9" fill="#fff">銀行</text>' + [8, 22, 36].map(x => `<rect x="${x}" y="46" width="8" height="72" fill="#E8E1DA"/>`).join('') + '<rect x="2" y="116" width="52" height="8" fill="#C9A98B"/>'
      + '<g class="k-atm"><rect x="112" y="36" width="58" height="92" rx="7" fill="#9FB4C8"/><rect x="120" y="46" width="42" height="26" rx="3" fill="#CDEBFF"/><text x="134" y="64" font-size="14" fill="#5B7FA5">¥</text>' + [0, 1, 2, 3, 4, 5].map(i => `<rect x="${122 + (i % 3) * 14}" y="${96 + Math.floor(i / 3) * 10}" width="10" height="6" rx="1.5" fill="#7F96AC"/>`).join('') + '<rect x="122" y="84" width="38" height="6" rx="3" fill="#4A4A55"/></g>'
      + hairB(g, 82, 52, .8) + `<rect x="58" y="98" width="14" height="14" rx="4" fill="#E8A87C"/><rect x="68" y="70" width="28" height="38" rx="10" fill="${dc}"/><rect x="72" y="106" width="8" height="22" rx="4" fill="#7A6A5E"/><rect x="84" y="106" width="8" height="22" rx="4" fill="#7A6A5E"/>` + pHead(g, 82, 52, .8)
      + `<g class="k-idle">${arm(72, 86, 68, 104)}${arm(92, 86, 96, 104)}</g>` + '<g class="k-bills"><g class="k-count">' + bill(88) + bill(91) + '</g></g>'
      + `<g class="k-hands">${arm(72, 86, 80, 103)}${arm(92, 86, 86, 103)}<circle cx="80" cy="104" r="4.5" fill="${SK}"/><circle cx="86" cy="104" r="4.5" fill="${SK}"/></g>`;
  }
  function sleepIn(g) {
    const f = g === 'f', hc = '#2B2626';
    const head = `<g transform="translate(100 40) scale(.85)"><circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/><g class="e-cl"><path d="M-15 4Q-10 9 -5 4M5 4Q10 9 15 4" stroke="${hc}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g><g class="e-op"><circle cx="-10" cy="3" r="4" fill="${hc}"/><circle cx="10" cy="3" r="4" fill="${hc}"/></g><circle cx="-17" cy="12" r="4" fill="#FFB5B5" opacity=".6"/><circle cx="17" cy="12" r="4" fill="#FFB5B5" opacity=".6"/><path d="M-5 14Q0 18 5 14" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
    return '<rect x="46" y="8" width="108" height="138" rx="12" fill="#fff" stroke="#E4D9CF" stroke-width="2"/><rect x="42" y="2" width="116" height="9" rx="3" fill="#B8977A"/><rect x="64" y="14" width="72" height="28" rx="13" fill="#F7F2FA" stroke="#E4D9CF"/>'
      + '<g class="k-roll">' + (f ? `<ellipse cx="100" cy="24" rx="32" ry="15" fill="${hc}"/>` : '') + '<rect x="52" y="54" width="96" height="90" rx="14" fill="#BFD7F2"/><rect x="52" y="54" width="96" height="12" rx="6" fill="#A6C6EB"/>' + head + '</g>'
      + '<rect x="162" y="14" width="32" height="34" rx="6" fill="#C9A98B"/><circle cx="171" cy="31" r="5.5" fill="none" stroke="#4A423D" stroke-width="1.6"/><circle cx="184" cy="31" r="5.5" fill="none" stroke="#4A423D" stroke-width="1.6"/><ellipse cx="28" cy="122" rx="7" ry="4" fill="#E8A8A8"/><ellipse cx="28" cy="134" rx="7" ry="4" fill="#E8A8A8"/>';
  }

  // ---------- 交通工具：行駛、起降、背景 ----------
  const scroll = (inner, t) => `<g class="k-scroll" style="animation-duration:${t}s">${inner}<g transform="translate(200 0)">${inner}</g></g>`;
  const CITYP = '<rect x="6" y="64" width="22" height="54" fill="#C9D3DE"/><rect x="32" y="82" width="16" height="36" fill="#B8C4D0"/><circle cx="64" cy="100" r="11" fill="#9CC9A5"/><rect x="62" y="108" width="4" height="10" fill="#8A6F55"/><rect x="82" y="56" width="26" height="62" fill="#B8C4D0"/><rect x="112" y="78" width="18" height="40" fill="#C9D3DE"/><circle cx="144" cy="98" r="12" fill="#8FC09A"/><rect x="142" y="108" width="4" height="10" fill="#8A6F55"/><circle cx="166" cy="104" r="9" fill="#9CC9A5"/><rect x="164" y="110" width="4" height="8" fill="#8A6F55"/><rect x="176" y="70" width="20" height="48" fill="#C9D3DE"/>';
  const SEAP = '<ellipse cx="30" cy="40" rx="20" ry="7" fill="#fff" opacity=".8"/><ellipse cx="120" cy="30" rx="26" ry="8" fill="#fff" opacity=".8"/><path d="M60 120L82 98L104 120Z" fill="#9CC9A5"/><path d="M150 120L162 108L176 120Z" fill="#8FC09A"/>';
  const SHOPP = ['#F6D8D8', '#D8E8F6', '#F6EBC8', '#D8F0DC', '#E8DDF3'].map((c, i) => `<rect x="${i * 40 + 2}" y="62" width="36" height="62" fill="${c}"/><rect x="${i * 40 + 2}" y="62" width="36" height="9" fill="#E09F9F"/><rect x="${i * 40 + 9}" y="80" width="22" height="22" rx="2" fill="#fff" opacity=".85"/><rect x="${i * 40 + 14}" y="106" width="12" height="18" fill="#8A6F55"/>`).join('');
  function planeScene(g, arr) {
    const body = `<polygon points="95,64 120,38 136,38 118,66" fill="#d9d2ca"/><ellipse cx="100" cy="75" rx="70" ry="22" fill="#fff" stroke="#d9d2ca"/><polygon points="40,70 24,40 52,40 62,68" fill="#E09F9F"/><polygon points="95,85 142,120 118,120 78,86" fill="#E8E1DA"/><rect x="44" y="82" width="116" height="5" fill="#A0C4E3"/><circle cx="78" cy="72" r="5" fill="#CDEBFF"/><circle cx="96" cy="72" r="5" fill="#CDEBFF"/>${win(g, 126, 72)}<circle cx="80" cy="99" r="3.5" fill="#4A423D"/><circle cx="124" cy="99" r="3.5" fill="#4A423D"/>`;
    const clouds = scroll('<ellipse cx="30" cy="28" rx="20" ry="7" fill="#fff"/><ellipse cx="120" cy="52" rx="26" ry="8" fill="#fff"/><ellipse cx="180" cy="20" rx="16" ry="6" fill="#fff"/>', 6);
    return `<g class="${arr ? 'p-skyout' : 'p-skyin'}">${clouds}</g><g class="${arr ? 'p-gin' : 'p-gout'}"><g class="${arr ? '' : 'p-term'}"><rect x="12" y="62" width="54" height="40" fill="#D8E2EE"/><rect x="18" y="70" width="42" height="8" fill="#9FB4C8"/><rect x="40" y="38" width="10" height="24" fill="#B8C4D0"/><rect x="38" y="34" width="14" height="6" fill="#9FB4C8"/></g><rect x="0" y="102" width="200" height="8" fill="#C9CED6"/><line class="k-wave" x1="0" y1="106" x2="260" y2="106" stroke="#fff" stroke-width="2" stroke-dasharray="14 12"/></g><g class="${arr ? 'k-land' : 'k-take'}">${body}</g>`;
  }

  function scene(g, k, left) {
    const s = shirt(g), body = x => `<rect x="${x - 18}" y="84" width="36" height="44" rx="12" fill="${s}"/>`;
    const arm = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s}" stroke-width="9" stroke-linecap="round"/>`;
    let o = '';
    if (k === 'work') o = office(g);
    else if (k === 'court') o = court(g);
    else if (k === 'pack') o = pack(g, left);
    else if (k === 'cash') o = cashAtm(g);
    else if (k === 'sleep') o = sleepIn(g);
    else if (k.startsWith('plane')) o = planeScene(g, k === 'plane-arr');
    else if (k === 'train' || k === 'shinkansen') { const sn = k === 'shinkansen'; o = road(121) + '<g class="k-bob">' + (sn ? '<path d="M20 108V74Q20 54 42 54H128Q160 54 184 98L186 108Z" fill="#fff" stroke="#d9d2ca"/>' : '<rect x="20" y="54" width="164" height="54" rx="14" fill="#8CC7A1"/>') + `<rect x="20" y="92" width="166" height="6" fill="${sn ? '#4F86C6' : '#F6D365'}"/>` + rects([34, 60, 86], 66, 20, 16) + win(g, 124, 74) + '</g>' + wh(50, 112, 8) + wh(100, 112, 8) + wh(150, 112, 8); }
    else if (k === 'bus' || k === 'coach') o = road(124) + `<g class="k-bob"><rect x="24" y="50" width="152" height="60" rx="10" fill="${k === 'bus' ? '#F6D365' : '#C3B5E8'}"/>${rects([34, 62, 90], 62, 22, 18)}${win(g, 140, 70)}<rect x="24" y="90" width="152" height="5" fill="rgba(255,255,255,.6)"/></g>` + wh(56, 112, 10) + wh(144, 112, 10);
    else if (k === 'car') o = road(132) + `<g class="k-bob"><path d="M62 84L78 54H128L146 84Z" fill="#E7A8A8"/><rect x="30" y="82" width="140" height="34" rx="12" fill="#E09F9F"/>${win(g, 102, 70)}<circle cx="166" cy="94" r="4" fill="#F6D365"/></g>` + wh(62, 118, 11) + wh(140, 118, 11);
    else if (k === 'boat') o = '<g class="k-bob"><rect x="70" y="72" width="60" height="28" rx="6" fill="#fff" stroke="#d9d2ca"/><rect x="98" y="52" width="4" height="20" fill="#a9754f"/><polygon points="102,52 122,58 102,64" fill="#E09F9F"/>' + win(g, 100, 86) + '<path d="M24 100H176L158 128H44Z" fill="#E8A87C"/></g><path class="k-wave" d="M-26 132q13-8 26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0" stroke="#A0C4E3" stroke-width="3" fill="none"/>';
    else if (k === 'cruise') o = '<g class="k-bob"><rect x="92" y="38" width="16" height="22" fill="#E09F9F"/><rect x="58" y="58" width="84" height="20" rx="4" fill="#fff" stroke="#d9d2ca"/><rect x="40" y="78" width="120" height="20" rx="4" fill="#F2F6F9" stroke="#d9d2ca"/>' + win(g, 100, 69) + '<circle cx="56" cy="88" r="4" fill="#CDEBFF"/><circle cx="76" cy="88" r="4" fill="#CDEBFF"/><circle cx="124" cy="88" r="4" fill="#CDEBFF"/><circle cx="144" cy="88" r="4" fill="#CDEBFF"/><path d="M14 98H186L164 128H36Z" fill="#fff" stroke="#d9d2ca"/><rect x="26" y="108" width="148" height="5" fill="#A0C4E3"/></g><path class="k-wave" d="M-26 134q13-8 26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0" stroke="#A0C4E3" stroke-width="3" fill="none"/>';
    else o = road(140) + head(g, 80, 48, 1) + '<rect x="62" y="74" width="36" height="38" rx="12" fill="' + s + '"/><rect class="k-leg" x="68" y="110" width="9" height="26" rx="4" fill="#7A6A5E"/><rect class="k-leg" style="animation-direction:alternate-reverse" x="84" y="110" width="9" height="26" rx="4" fill="#7A6A5E"/>' + arm(94, 88, 120, 108) + '<g class="k-bob"><rect x="116" y="108" width="30" height="24" rx="5" fill="#E8A87C"/><rect x="126" y="102" width="10" height="6" rx="3" fill="#a9754f"/></g>' + wh(122, 136, 4) + wh(140, 136, 4);
    const LAND = ['train', 'shinkansen', 'bus', 'coach', 'car'], SEA = ['boat', 'cruise'];
    if (LAND.includes(k) || SEA.includes(k) || (!['work', 'court', 'pack', 'cash', 'sleep'].includes(k) && !k.startsWith('plane'))) {
      const re = /<(line|path) class="k-wave"[^>]*\/>/g, ground = (o.match(re) || []).join('');
      o = o.replace(re, '');
      const walk = !LAND.includes(k) && !SEA.includes(k);
      const bg = SEA.includes(k) ? '<circle cx="168" cy="26" r="11" fill="#F6D365"/>' + scroll(SEAP, 14) : scroll(walk ? SHOPP : CITYP, walk ? 5 : 8);
      o = bg + ground + (walk ? o : `<g class="k-drive">${o}</g>`);
    }
    return `<svg id="cd-svg" data-s="type" data-f="look" viewBox="0 0 200 150" width="100%" style="max-width:300px;height:auto" role="img">${o}</svg>`;
  }

  function renderInfo() {
    const pg = $('info-body'); if (!pg || !data.days.length) return;
    const g = localStorage.cd_gender || 'f', p = g === 'm' ? '👨' : '👩', st = stage();
    let em = p, prop, txt, kind = st.k;
    if (st.k === 'work') { em = p + '\u200d💻'; prop = '⌨️'; txt = st.end ? '旅程結束，回到日常' : '認真工作中…'; }
    else if (st.k === 'pack') { prop = '🧳👕'; txt = '陸續收拾行李中'; }
    else if (st.k === 'cash') { prop = '💴🏦'; txt = '去領外幣囉'; }
    else if (st.k === 'sleep') { prop = '🌙🛏️'; txt = '興奮到睡不著…'; }
    else { const t = TR.find(x => x[0] === data.days[st.di].transport); prop = t ? t[1] : '🧳'; kind = t ? t[0] : 'walk'; txt = t ? '今日交通：' + t[2] : '旅行中！'; }
    if (st.k === 'work' && !st.end && courtDay()) { kind = 'court'; txt = '開庭中…'; }
    const big = st.k === 'trip' ? `旅行中 第 <b>${st.di + 1}</b> 天` : st.end ? '旅程結束' : `還有 <b>${st.left}</b> 天`;
    const info = I();
    const fl = info.flights.map((f, i) => `<div class="info-card"><div class="fl-row"><div><b>${esc(f.dep)}</b><small>${esc(f.depT)}</small></div><div class="fl-mid">✈️<small>${esc(f.no)}</small></div><div><b>${esc(f.arr)}</b><small>${esc(f.arrT)}</small></div></div><small class="muted">${esc(f.date)}</small>${f.bag ? `<div class="bag">🧳 託運：${md(f.bag)}</div>` : ''}${f.carry ? `<div class="bag">🎒 手提：${md(f.carry)}</div>` : ''}${ed('flights', i)}</div>`).join('');
    const ht = info.hotels.map((h, i) => `<div class="info-card">${h.img ? `<img class="evt-img" src="${esc(h.img)}" onerror="this.remove()">` : ''}<b>${esc(h.name)}</b><div class="muted">📅 ${esc(h.in)} → ${esc(h.out)}</div>${h.note ? `<div class="bag">${md(h.note)}</div>` : ''}<a class="route-btn" style="margin:10px 0 0" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.map || h.name)}">🗺️ 地圖</a>${ed('hotels', i)}</div>`).join('');
    const nt = info.notes.map((n, i) => `<details class="info-card"><summary><span>${md(n.title)}</span><span class="mv admin-only"><span onclick="event.preventDefault();event.stopPropagation();infoMove('notes',${i},-1)">▲</span><span onclick="event.preventDefault();event.stopPropagation();infoMove('notes',${i},1)">▼</span></span></summary><div class="bag">${md(n.body)}</div>${ed('notes', i)}</details>`).join('');
    const trAdmin = `<div class="info-card admin-only" style="flex-direction:column"><b>🚦 每日交通工具（管理員）</b>${data.days.map((d, i) => `<div class="tr-row"><span>Day ${i + 1}（${esc(d.date.slice(5))}）</span><select onchange="cdT(${i},this.value)"><option value="">未設定</option>${TR.map(t => `<option value="${t[0]}" ${d.transport === t[0] ? 'selected' : ''}>${t[1]} ${t[2]}</option>`).join('')}</select></div>`).join('')}</div>`;
    pg.innerHTML = `<div class="cd-card"><div class="gender"><span class="${g === 'm' ? 'on' : ''}" onclick="cdG('m')">♂</span><span class="${g !== 'm' ? 'on' : ''}" onclick="cdG('f')">♀</span></div><div class="cd-scene">${scene(g, kind, st.left)}<div class="cd-bubble" id="cd-bubble"></div></div><div class="cd-days">${big}</div><div class="cd-sub">${txt}</div></div>${trAdmin}
    <div class="sec-h">🌤️ 旅遊天氣</div><div id="wx" class="wx-row"></div>
    <div class="sec-h">✈️ 航班資訊${add('flights', '新增')}</div>${fl || '<div class="muted">尚未新增航班</div>'}
    <div class="sec-h">🏨 住宿資訊${add('hotels', '新增')}</div>${ht || '<div class="muted">尚未新增住宿</div>'}
    <div class="sec-h">📌 其他須知${add('notes', '新增')}</div>${nt || '<div class="muted">尚未新增須知（例如：護照遺失怎麼辦、緊急聯絡電話）</div>'}`;
    renderWx(); bindScene(kind, st.left);
  }
  async function renderWx() {
    const box = $('wx'); if (!box) return;
    const D = data.days, s = D[0].date, e = D[D.length - 1].date, loc = D[0].location, k = loc + s + e;
    if (k === wxKey) { box.innerHTML = wxHtml; return; }
    const today = new Date().toISOString().slice(0, 10), lim = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10), c = LOC_COORDS[loc] || LOC_COORDS.Osaka;
    if (s > lim) { box.innerHTML = '<div class="muted">出發前 16 天內才會有天氣預報，到時再來看看 ☀️</div>'; return; }
    if (e < today) { box.innerHTML = '<div class="muted">旅程已結束</div>'; return; }
    box.innerHTML = '<div class="muted">載入天氣中…</div>';
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${s < today ? today : s}&end_date=${e > lim ? lim : e}`);
      const d = (await r.json()).daily;
      wxHtml = d.time.map((t, i) => `<div class="wx-c"><div>${t.slice(5).replace('-', '/')}</div><div>${wi(d.weathercode[i])}</div><div>${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°</div><div>☔ ${d.precipitation_probability_max[i] ?? '-'}%</div></div>`).join('');
      wxKey = k; if ($('wx')) $('wx').innerHTML = wxHtml;
    } catch (x) { box.innerHTML = '<div class="muted">天氣暫時載入失敗</div>'; }
  }

  // ---------- 評分頁 ----------
  const av = pid => { const a = Object.values(votes).map(v => v && v[pid] && v[pid].t).filter(x => x !== '' && x != null && !isNaN(x)).map(Number); return a.length ? { m: a.reduce((s, x) => s + x, 0) / a.length, n: a.length } : null; };
  const so = cur => '<option value="">未評分</option>' + Array.from({ length: 11 }, (_, i) => `<option value="${i}" ${String(cur) === String(i) ? 'selected' : ''}>${i} 分</option>`).join('');
  function saveVote(pid, o) { (votes[me] = votes[me] || {})[pid] = o; try { localStorage.setItem('votes_' + trip, JSON.stringify(votes)); } catch (e) { } if (window.__pushVote) window.__pushVote(pid, o); }
  window.vote = (pid, v) => { const o = (votes[me] || {})[pid] || {}; o.t = v; saveVote(pid, o); renderRate(); };
  window.voteC = (pid, j, v) => { const o = (votes[me] || {})[pid] || {}; o.c = o.c || {}; o.c[j] = v; saveVote(pid, o); };
  window.rateOpen = (id, o) => { openD[id] = o; };
  window.rateTab = i => { rateSel = i; renderRate(); };
  window.rateShow = v => { data.settings.showRank = v; commit(); };
  window.rateEdit = i => { const its = R().items, n = i == null; form(n ? '新增評比項目' : '編輯評比項目', [['title', '項目名稱（如：飯店評比）'], ['criteria', '評分標準（一行一個，如：隔音）', 'area']], n ? {} : its[i], o => { if (!o.title) return; if (n) { its.push({ id: uid(), title: o.title, criteria: o.criteria, players: [] }); rateSel = its.length - 1; } else Object.assign(its[i], o); commit(); }, n ? null : () => { its.splice(i, 1); rateSel = 0; commit(); }); };
  window.plEdit = i => { const it = R().items[rateSel]; it.players = it.players || []; const L = it.players, n = i == null; form(n ? '新增選手' : '編輯選手', [['name', '選手名稱'], ['img', '照片網址（選填）']], n ? {} : L[i], o => { if (!o.name) return; if (n) L.push({ id: uid(), name: o.name, img: o.img }); else Object.assign(L[i], o); commit(); }, n ? null : () => { L.splice(i, 1); commit(); }); };

  function renderRate() {
    const tb = $('rate-tabs'), bd = $('rate-body'); if (!bd) return;
    const its = R().items; if (rateSel >= its.length) rateSel = 0;
    tb.innerHTML = its.map((x, i) => `<div class="date-card rate-tab ${i === rateSel ? 'active' : ''}" onclick="rateTab(${i})">${esc(x.title)}</div>`).join('') + '<div class="date-card date-card-add admin-only" onclick="rateEdit()"><i class="fas fa-plus"></i></div>';
    const show = !!(data.settings && data.settings.showRank), it = its[rateSel];
    let h = `<div class="admin-only switch-container"><span>🏆 公開前三名與平均分</span><label class="switch"><input type="checkbox" ${show ? 'checked' : ''} onchange="rateShow(this.checked)"><span class="slider"></span></label></div>`;
    if (!it) h += '<div class="muted" style="text-align:center;margin-top:40px">還沒有評比項目<br>（管理員可按上方 + 新增）</div>';
    else {
      const cr = (it.criteria || '').split('\n').map(s => s.trim()).filter(Boolean), pl = it.players || [];
      const rk = pl.map(x => ({ x, a: av(x.id) })).filter(o => o.a).sort((a, b) => b.a.m - a.a.m).slice(0, 3);
      h += show ? `<div class="info-card">🏆 <b>目前前三名</b>${rk.length ? rk.map((o, i) => `<div>${['🥇', '🥈', '🥉'][i]} ${esc(o.x.name)}　${o.a.m.toFixed(1)} 分</div>`).join('') : '<div class="muted">還沒有人評分</div>'}</div>` : '<div class="muted" style="margin-bottom:12px">🙈 評分結果尚未公開</div>';
      h += `<div class="admin-only" style="gap:8px"><button class="btn btn-outline" onclick="plEdit()">+ 新增選手</button><button class="btn btn-outline" onclick="rateEdit(${rateSel})">✏️ 編輯項目/標準</button></div>`;
      pl.forEach((x, i) => {
        const a = av(x.id), my = (votes[me] || {})[x.id] || {};
        h += `<div class="info-card">${x.img ? `<img class="evt-img" src="${esc(x.img)}" onerror="this.remove()">` : ''}<div class="pl-h"><b>${esc(x.name)}</b>${show && a ? `<span class="avg">平均 ${a.m.toFixed(1)}（${a.n}人）</span>` : ''}<span class="ed admin-only" onclick="plEdit(${i})">✏️</span></div><label>我的總分</label><select onchange="vote('${x.id}',this.value)">${so(my.t)}</select>${cr.length ? `<details ${openD[x.id] ? 'open' : ''} ontoggle="rateOpen('${x.id}',this.open)"><summary>評分標準（參考，選填）</summary>${cr.map((c, j) => `<div class="cr"><span>${esc(c)}</span><select onchange="voteC('${x.id}',${j},this.value)">${so((my.c || {})[j])}</select></div>`).join('')}</details>` : ''}</div>`;
      });
      if (!pl.length) h += '<div class="muted" style="text-align:center">這個項目還沒有選手</div>';
    }
    bd.innerHTML = h;
  }
  renderInfo(); renderRate();

  // ---------- Firebase 即時同步 ----------
  if (!FIREBASE_CONFIG.apiKey) return;
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const load = s => new Promise((r, j) => { const e = document.createElement('script'); e.src = s; e.onload = r; e.onerror = j; document.head.appendChild(e); });
  let db, ref;
  const ready = load(base + 'firebase-app-compat.js').then(() => load(base + 'firebase-database-compat.js')).then(() => { firebase.initializeApp(FIREBASE_CONFIG); db = firebase.database(); ref = db.ref('trips/' + trip); });
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
  window.__pushVote = (pid, o) => ready.then(() => ref.child('votes/' + me + '/' + pid).set(clean(o))).catch(() => toast('❌ 評分未同步', 1));

  const _sd = saveData;
  let lastExp = {};   // 上次與雲端同步時，每筆帳目的內容（只寫入有變動的帳目，避免互相覆蓋）
  saveData = function () {
    localStorage.setItem('trip_data_public', JSON.stringify(data));
    const d = clean(data), upd = {}, cur = {};
    (d.expenses || []).forEach(e => { cur[e.id] = JSON.stringify(e); if (lastExp[e.id] !== cur[e.id]) upd['exp/' + e.id] = e; });
    Object.keys(lastExp).forEach(id => { if (!(id in cur)) upd['exp/' + id] = null; });
    delete d.expenses; Object.keys(d).forEach(k => { upd[k] = d[k]; }); upd.expenses = null; lastExp = cur;
    ready.then(() => ref.update(upd)).then(() => toast('✅ 已同步')).catch(() => toast('❌ 同步失敗', 1));
  };
  const _lc = loadCloudData;
  loadCloudData = async function () {
    try {
      await ready;
      ref.on('value', async snap => {
        let v = snap.val();
        if (!v || !v.days) {
          if (trip === 'default') { try { const r = await fetch(API_URL); const old = await r.json(); v = old && old.days ? old : data; } catch (e) { v = data; } }
          else v = blank();
          ref.set(clean(norm(v))); return;
        }
        votes = v.votes || {}; delete v.votes; DONE = v.done || {}; delete v.done; MASC = v.mascot || null; delete v.mascot;
        try { localStorage.setItem('done_' + trip, JSON.stringify(DONE)); localStorage.setItem('votes_' + trip, JSON.stringify(votes)); } catch (e) { }
        const ex = v.exp ? Object.values(v.exp) : [], old = v.expenses ? Object.values(v.expenses).filter(Boolean) : [], migrate = !ex.length && old.length;   // 舊格式（整包陣列）自動搬成單筆儲存
        delete v.exp; v.expenses = ex.length ? ex : old;
        data = norm(v); localStorage.setItem('trip_data_public', JSON.stringify(data));
        if (MASC && Date.now() - MASC.t < 432e5 && MASC.t > seenT()) { const mi = data.days.findIndex(x => x.date === MASC.d); if (mi >= 0) currentDayIndex = mi; }
        lastExp = {}; if (!migrate) data.expenses.forEach(e => { lastExp[e.id] = JSON.stringify(e); });
        if (currentDayIndex >= data.days.length) currentDayIndex = 0;
        updateHero(); renderDates(); renderItinerary(); renderExpenseList(); renderTotalOverview(); renderShoppingList(); renderPackingList(); renderInfo(); renderRate();
        if (migrate) saveData();
      });
    } catch (e) { console.error(e); _lc(); }
  };

  // ---------- 記帳：點開看詳細、退稅、品項分配、發票照片 ----------
  const openExp = {}; let MP = { add: {}, del: new Set(), old: {} }, IT = [];
  const fmtM = (c, n) => (c ? c + ' ' : '') + (Math.round(n * 100) / 100).toLocaleString();
  const refundOf = e => Math.max(0, +e.refund || 0);
  const photoRef = id => db.ref('photos/' + trip + '/' + id);
  function netExpenses(list) {   // 依比例扣退稅：分擔按比例縮小；退稅退給指定的人，沒指定就由付款人按比例拿回
    return list.map(e => {
      const r = refundOf(e); if (e.type === 'transfer' || !r || r >= e.amount) return e;
      const k = (e.amount - r) / e.amount, sc = (o, f) => Object.fromEntries(Object.entries(o).map(([m, v]) => [m, v * f]));
      let pay = typeof e.payer === 'object' ? Object.assign({}, e.payer) : { [e.payer]: e.amount };
      if (e.refundTo) pay[e.refundTo] = (pay[e.refundTo] || 0) - r; else pay = sc(pay, k);
      return Object.assign({}, e, { amount: e.amount - r, splitDetails: sc(e.splitDetails || {}, k), payer: pay });
    });
  }
  const withNet = fn => function () { const o = data.expenses; data.expenses = netExpenses(o); try { fn(); } finally { data.expenses = o; } };
  renderSettlement = withNet(renderSettlement); renderTotalOverview = withNet(renderTotalOverview);

  function detailHtml(e) {
    const c = e.currency, pay = typeof e.payer === 'object' ? e.payer : { [e.payer]: e.amount }, r = refundOf(e), k = r && r < e.amount ? (e.amount - r) / e.amount : 1;
    const payers = Object.keys(pay).filter(m => pay[m] > 0), row = (a, b) => `<div class="ed-row"><span>${a}</span><span>${b}</span></div>`, sec = (t, b) => `<div class="ed-sec"><div class="ed-sub">${t}</div><div class="ed-body">${b}</div></div>`;
    const items = (e.items || []).map(it => { const q = +it.q || 1, ws = Object.entries(it.who || {}).filter(([, n]) => n > 0), who = !ws.length ? '全員平分' : q === 1 ? ws.map(w => esc(w[0])).join('、') : ws.map(([m, n]) => esc(m) + '×' + n).join('　'); return `<div class="ed-item">${row(esc(it.n || '品項'), fmtM(c, (+it.p || 0) * q))}<small class="muted">${fmtM('', +it.p || 0)} × ${q}　→ ${who}</small></div>`; }).join('');
    return '<div class="exp-detail">' + (items ? sec('品項', items) : '')
      + sec('誰先付', payers.map(m => row(esc(m), fmtM(c, pay[m]))).join(''))
      + sec('每人應付' + (r ? '（已扣退稅）' : ''), Object.entries(e.splitDetails || {}).map(([m, v]) => row(esc(m), fmtM(c, v * k) + (r ? `<small class="muted">（原 ${fmtM('', v)}）</small>` : ''))).join(''))
      + (r ? sec('退稅', row('金額', '− ' + fmtM(c, r)) + row('退給', esc(e.refundTo || payers.join('、') || '—'))) : '')
      + (e.note ? sec('備註', `<div class="bag" style="margin:0">${md(e.note)}</div>`) : '') + (e.nPhotos ? sec('發票照片', '<div class="ed-ph"><span class="muted">📷 載入中…</span></div>') : '') + '</div>';
  }
  function openDetail(card, e) {
    card.insertAdjacentHTML('beforeend', detailHtml(e));
    const box = card.querySelector('.ed-ph'); if (!box) return;
    ready.then(() => photoRef(e.id).once('value')).then(s => { const v = s.val() || {}; box.innerHTML = Object.keys(v).map(k => `<img class="ed-img" src="${v[k]}" onclick="event.stopPropagation();viewImg(this.src)">`).join('') || '<span class="muted">沒有照片</span>'; }).catch(() => { box.innerHTML = '<span class="muted">照片載入失敗</span>'; });
  }
  function badge(card, e) {
    card.querySelectorAll('.refund-tag').forEach(x => x.remove());
    const r = refundOf(e); if (r && card.children[1]) card.children[1].children[0].insertAdjacentHTML('afterend', `<div class="refund-tag">退稅 −${fmtM(e.currency, r)}${e.refundTo ? '（給' + esc(e.refundTo) + '）' : ''}</div>`);
  }
  function refreshCard(id) {
    const e = data.expenses.find(x => x.id === id), c = document.querySelector(`#expense-list .expense-card[data-id="${id}"]`); if (!e || !c) return;
    badge(c, e); const d = c.querySelector('.exp-detail'); if (d) { d.remove(); openDetail(c, e); }
  }
  const _rel = renderExpenseList;
  renderExpenseList = function () {
    _rel(); renderRefundBar();
    document.querySelectorAll('#expense-list .expense-card').forEach(c => {
      const id = c.dataset.id, e = data.expenses.find(x => x.id === id); if (!e || e.type === 'transfer') return;
      badge(c, e);
      if (e.cat) c.children[0].insertAdjacentHTML('beforeend', `<span class="cat-tag" style="background:${catColor(e.cat)}">${esc(e.cat)}</span>`);
      if (e.nPhotos) c.children[0].insertAdjacentHTML('beforeend', `<span class="muted"> 📷${e.nPhotos}</span>`);
      c.children[1].insertAdjacentHTML('beforeend', `<div class="ref-row" onclick="event.stopPropagation()"><span>退稅</span><input type="number" inputmode="numeric" placeholder="0" value="${refundOf(e) || ''}" onchange="setRefund('${esc(id)}',this.value)"><select onchange="setRefundTo('${esc(id)}',this.value)"><option value="">付款人</option>${data.members.map(m => `<option value="${esc(m)}" ${e.refundTo === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>`);
      c.style.cursor = 'pointer';
      c.onclick = ev => { if (ev.target.closest('.admin-only, .ref-row, .exp-detail')) return; const d = c.querySelector('.exp-detail'); if (d) { d.remove(); delete openExp[id]; } else { openExp[id] = 1; openDetail(c, e); } };
      if (openExp[id]) openDetail(c, e);
    });
  };
  window.setRefund = (id, v) => { const e = data.expenses.find(x => x.id === id); if (!e) return; const n = parseFloat(v); if (n > 0) e.refund = n; else delete e.refund; saveData(); renderTotalOverview(); refreshCard(id); };
  window.setRefundTo = (id, v) => { const e = data.expenses.find(x => x.id === id); if (!e) return; if (v) e.refundTo = v; else delete e.refundTo; saveData(); renderTotalOverview(); refreshCard(id); };
  window.refundAll = on => {
    const who = $('rb-who').value;
    if (!confirm(on ? `把所有帳目的退稅人都設為「${who}」？\n（之後仍可一張張調整）` : '所有帳目的退稅人還原為各自的付款人？')) return;
    data.expenses.forEach(e => { if (e.type !== 'transfer') { if (on) e.refundTo = who; else delete e.refundTo; } });
    saveData(); renderExpenseList(); renderTotalOverview();
  };
  function renderRefundBar() { const s = $('rb-who'); if (s) { const v = s.value; s.innerHTML = data.members.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join(''); if (v) s.value = v; } }
  window.toggleRefund = () => { const on = $('page-expense').classList.toggle('refund-on'); $('refund-btn').classList.toggle('on', on); $('refund-btn').textContent = on ? '✓ 完成退稅' : '🧾 退稅'; };
  $('page-expense').querySelector('.hero-header').insertAdjacentHTML('beforeend', '<div id="refund-btn" class="refund-btn admin-only" onclick="toggleRefund()">🧾 退稅</div>');
  $('expense-list').insertAdjacentHTML('beforebegin', '<div id="refund-bar" class="refund-bar"><span>統一退稅給</span><select id="rb-who"></select><button class="btn" onclick="refundAll(1)">全部套用</button><button class="btn btn-outline" onclick="refundAll(0)">還原付款人</button></div>');
  window.viewImg = src => { let o = $('img-view'); if (!o) { o = document.createElement('div'); o.id = 'img-view'; o.onclick = () => { o.style.display = 'none'; }; document.body.appendChild(o); } o.innerHTML = `<img src="${src}">`; o.style.display = 'flex'; };

  // ---------- 品項明細（單價 × 數量，各人買幾個）----------
  const itT = it => (+it.p || 0) * (+it.q || 1);
  const itWarn = i => { const it = IT[i], q = +it.q || 1, w = it.who || {}; if (q > 1) { const used = Object.values(w).reduce((s, x) => s + x, 0); return used !== q ? `已分 ${used}/${q}，其餘平分` : ''; } return Object.keys(w).length ? '' : '未選＝全員平分'; };
  function itWho(i) {
    const it = IT[i], q = +it.q || 1, w = it.who || {};
    return data.members.map((m, mi) => { const n = w[m] || 0;
      if (!n) return `<span class="chip" onclick="itTog(${i},${mi})">${esc(m)}</span>`;
      return q > 1 ? `<span class="chip on">${esc(m)} <i onclick="itQ(${i},${mi},-1)">－</i><input class="chip-n" type="number" inputmode="numeric" value="${n}" onfocus="this.select()" onchange="itN(${i},${mi},this.value)"><i onclick="itQ(${i},${mi},1)">＋</i></span>` : `<span class="chip on" onclick="itTog(${i},${mi})">${esc(m)}</span>`; }).join('') + `<small class="it-warn" id="it-warn${i}">${itWarn(i)}</small>`;
  }
  function renderIT() {
    const box = $('it-list'); if (!box) return; setTimeout(numpad, 0);
    box.innerHTML = IT.map((it, i) => `<div class="it-row"><div class="it-top"><input placeholder="品名" value="${esc(it.n)}" oninput="itSet(${i},'n',this.value)"><input type="number" inputmode="numeric" onfocus="this.select()" placeholder="單價" value="${it.p || ''}" oninput="itSet(${i},'p',this.value)"><span>×</span><input type="number" inputmode="numeric" onfocus="this.select()" value="${it.q || 1}" oninput="itSet(${i},'q',this.value)"><span class="it-x" onclick="itDel(${i})">✕</span></div><div class="it-sub">小計 <b id="it-t${i}">${fmtM('', itT(it))}</b></div><div class="it-who" id="it-w${i}">${itWho(i)}</div></div>`).join('');
  }
  function itUp(i) { $('it-t' + i).textContent = fmtM('', itT(IT[i])); $('it-w' + i).innerHTML = itWho(i); itApply(); }
  function itApply() {
    if (!IT.length) return;
    const M = data.members, raw = {}; let total = 0; M.forEach(m => raw[m] = 0);
    IT.forEach(it => {
      const p = +it.p || 0, q = +it.q || 1, T = p * q, who = Object.entries(it.who || {}).filter(([m, n]) => M.includes(m) && n > 0); total += T;
      if (q === 1) { const S = who.length ? who.map(x => x[0]) : M; S.forEach(m => raw[m] += T / S.length); }
      else { let used = 0; who.forEach(([m, n]) => { raw[m] += p * n; used += n; }); const rem = Math.max(0, q - used); if (rem) M.forEach(m => raw[m] += p * rem / M.length); }
    });
    total = Math.round(total); const out = {}; let sum = 0; M.forEach(m => { out[m] = Math.round(raw[m]); sum += out[m]; });
    if (total - sum) { const mx = M.reduce((a, b) => raw[b] > raw[a] ? b : a); out[mx] += total - sum; }
    $('exp-amount').value = total; handleTotalAmountChange();
    document.querySelectorAll('.split-amt').forEach(inp => { const m = inp.dataset.m, cb = document.querySelector(`.split-cb[value="${m}"]`); if (cb) cb.checked = (out[m] || 0) > 0; inp.value = out[m] || 0; inp.dataset.locked = 'true'; inp.classList.remove('auto-calc'); });
    setSplitMode('custom'); chkTotal();
  }
  window.itAdd = () => { IT.push({ n: '', p: 0, q: 1, who: {} }); renderIT(); };
  window.itDel = i => { IT.splice(i, 1); renderIT(); itApply(); };
  window.itSet = (i, k, v) => {
    const it = IT[i];
    if (k === 'n') { it.n = v; return; }
    if (k === 'p') it.p = parseFloat(v) || 0;
    else { const nq = Math.max(1, parseInt(v) || 1); if (nq === 1 && (it.q || 1) > 1) it.who = Object.fromEntries(Object.keys(it.who || {}).map(m => [m, 1])); it.q = nq; }
    itUp(i);
  };
  window.itTog = (i, mi) => { const it = IT[i], m = data.members[mi]; it.who = it.who || {}; if (it.who[m]) delete it.who[m]; else it.who[m] = 1; itUp(i); };
  window.itN = (i, mi, v) => { const it = IT[i], m = data.members[mi], n = parseInt(v) || 0; if (n <= 0) { delete it.who[m]; itUp(i); return; } it.who[m] = n; $('it-t' + i).textContent = fmtM('', itT(it)); $('it-warn' + i).textContent = itWarn(i); itApply(); };
  window.itQ = (i, mi, d) => { const it = IT[i], m = data.members[mi], n = (it.who[m] || 0) + d; if (n <= 0) delete it.who[m]; else it.who[m] = n; itUp(i); };

  // ---------- 發票照片：手機端自動壓縮（長邊 1400px、JPEG 60%，約 200～300KB）----------
  const compress = f => new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(f); img.onload = () => { const s = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', .6)); }; img.onerror = rej; img.src = u; });
  function renderMP() {
    const L = $('exp-ph-list'); if (!L) return;
    L.innerHTML = Object.keys(MP.old).filter(k => !MP.del.has(k)).map(k => `<div class="mp-img"><img src="${MP.old[k]}"><span onclick="mpDel('${k}')">✕</span></div>`).join('') + Object.keys(MP.add).map(k => `<div class="mp-img"><img src="${MP.add[k]}"><span onclick="mpDel('${k}',1)">✕</span></div>`).join('');
  }
  window.mpDel = (k, isNew) => { if (isNew) delete MP.add[k]; else MP.del.add(k); renderMP(); };
  const numpad = () => document.querySelectorAll('#modal-expense input[type=number], #modal-transfer input[type=number], #modal-expense .payer-amt, #modal-expense .split-amt').forEach(i => { i.setAttribute('inputmode', 'numeric'); i.setAttribute('pattern', '[0-9]*'); if (!i.getAttribute('onfocus')) i.setAttribute('onfocus', 'this.select()'); });
  const _otm = openTransferModal; openTransferModal = function (id) { _otm(id); numpad(); };
  const _oem = openExpenseModal;
  openExpenseModal = function (id) {
    _oem(id);
    if (!$('exp-refund')) {
      $('exp-amount').insertAdjacentHTML('afterend', '<div id="it-box"><div class="it-head"><b>🧾 品項明細（選填）</b><button class="btn btn-outline" onclick="itAdd()">+ 品項</button></div><div id="it-list"></div></div>');
      $('exp-note').previousElementSibling.insertAdjacentHTML('beforebegin', '<label>退稅額（選填，扣除後按比例分攤）</label><input type="number" inputmode="numeric" id="exp-refund" placeholder="0"><label>退稅退給誰</label><select id="exp-refundto"></select><label>📷 發票照片（選填，自動壓縮）</label><input type="file" id="exp-photo" accept="image/*" multiple><div id="exp-ph-list"></div>');
      $('exp-note').insertAdjacentHTML('beforebegin', mdBar('exp-note'));
      $('exp-title').insertAdjacentHTML('afterend', '<label>類別</label><select id="exp-cat" onchange="catChange(this)"></select>');
      $('exp-photo').onchange = async ev => { for (const f of ev.target.files) { try { MP.add[uid()] = await compress(f); renderMP(); } catch (x) { toast('❌ 照片讀取失敗', 1); } } ev.target.value = ''; };
    }
    const e = id ? data.expenses.find(x => x.id === id) : null;
    fillCat(e && e.cat); $('exp-refund').value = (e && e.refund) || '';
    $('exp-refundto').innerHTML = '<option value="">付款人（預設）</option>' + data.members.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join(''); $('exp-refundto').value = (e && e.refundTo) || '';
    IT = e && e.items ? JSON.parse(JSON.stringify(e.items)) : []; IT.forEach(x => x.who = x.who || {}); renderIT();
    MP = { add: {}, del: new Set(), old: {} }; renderMP(); numpad();
    if (e && e.nPhotos) ready.then(() => photoRef(e.id).once('value')).then(s => { MP.old = s.val() || {}; renderMP(); });
  };
  const _sx = saveExpense;
  saveExpense = function () {
    const had = data.expenses.length, eid = editingExpenseId;
    _sx();
    if ($('modal-expense').style.display !== 'none') return;
    const e = eid ? data.expenses.find(x => x.id === eid) : (data.expenses.length > had ? data.expenses[data.expenses.length - 1] : null); if (!e) return;
    const r = parseFloat($('exp-refund').value); if (r > 0) e.refund = r; else delete e.refund;
    const cv = $('exp-cat').value; if (cv && cv !== '__new') e.cat = cv; else delete e.cat;
    if ($('exp-refundto').value) e.refundTo = $('exp-refundto').value; else delete e.refundTo;
    const its = IT.filter(x => x.n || x.p).map(x => ({ n: x.n || '', p: +x.p || 0, q: +x.q || 1, who: x.who || {} })); if (its.length) e.items = its; else delete e.items;
    const add = Object.entries(MP.add), del = [...MP.del], n = Object.keys(MP.old).filter(k => !MP.del.has(k)).length + add.length;
    if (n) e.nPhotos = n; else delete e.nPhotos;
    if (add.length || del.length) ready.then(() => { const r0 = photoRef(e.id); add.forEach(([k, u]) => r0.child(k).set(u)); del.forEach(k => r0.child(k).remove()); }).catch(() => toast('❌ 照片上傳失敗', 1));
    MP = { add: {}, del: new Set(), old: {} }; IT = [];
    saveData(); renderExpenseList(); renderTotalOverview();
  };
  const _de = deleteExpense;
  deleteExpense = function (id) { const n = data.expenses.length; _de(id); if (data.expenses.length < n) ready.then(() => photoRef(id).remove()).catch(() => { }); };

  // ---------- 類別、支出統計、匯出 ----------
  const DEFCAT = ['餐飲', '交通', '購物', '住宿', '門票', '其他'], PAL = ['#E09F9F', '#94C0C0', '#E3D081', '#DDBEA9', '#A0C4E3', '#B8A6D9', '#9CC9A5', '#F0B27A', '#C7B299', '#8FB8DE'];
  const cats = () => (data.settings && data.settings.categories && data.settings.categories.length) ? data.settings.categories : DEFCAT;
  const catColor = c => c === '未分類' ? '#CFCFCF' : PAL[Math.max(0, cats().indexOf(c)) % PAL.length];
  let statWho = '';
  function fillCat(v) { const s = $('exp-cat'); s.innerHTML = '<option value="">未分類</option>' + cats().map(c => `<option>${esc(c)}</option>`).join('') + '<option value="__new">＋ 新增類別…</option>'; s.value = v || ''; s.dataset.prev = s.value; }
  window.catChange = sel => { if (sel.value !== '__new') { sel.dataset.prev = sel.value; return; } const n = (prompt('新類別名稱：') || '').trim(); if (n) { const L = cats().slice(); if (!L.includes(n)) L.push(n); data.settings.categories = L; fillCat(n); } else sel.value = sel.dataset.prev || ''; };
  function statSums(who) { const sums = {}; netExpenses(data.expenses.filter(e => e.type !== 'transfer')).forEach(e => { const r = exchangeRates[e.currency] || 1, c = e.cat || '未分類', a = who ? ((e.splitDetails || {})[who] || 0) : e.amount; sums[c] = (sums[c] || 0) + a * r; }); return sums; }
  function donut(sums) {
    const ent = Object.entries(sums).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]), total = ent.reduce((s, x) => s + x[1], 0); if (!ent.length) return '<div class="muted">還沒有資料</div>';
    const C = 2 * Math.PI * 36; let off = 0;
    const arcs = ent.map(([c, v]) => { const len = v / total * C, a = `<circle cx="50" cy="50" r="36" fill="none" stroke="${catColor(c)}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>`; off += len; return a; }).join('');
    return `<div class="st-wrap"><svg viewBox="0 0 100 100" class="st-svg">${arcs}<text x="50" y="48" text-anchor="middle" font-size="6" fill="#888">總計</text><text x="50" y="58" text-anchor="middle" font-size="7.5" font-weight="700" fill="#4A423D">NT$${Math.round(total).toLocaleString()}</text></svg><div class="st-leg">${ent.map(([c, v]) => `<div class="st-row"><i style="background:${catColor(c)}"></i><span>${esc(c)}</span><b>NT$ ${Math.round(v).toLocaleString()}</b><small>${Math.round(v / total * 100)}%</small></div>`).join('')}</div></div>`;
  }
  function renderStats() {
    const box = $('stats-body'); if (!box) return;
    if (!data.members.includes(statWho)) statWho = data.members[0];
    const pub = !!(data.settings && data.settings.showTotalsToPublic);
    box.innerHTML = '<div class="ed-sub">全體支出（已扣退稅，約合台幣）</div>' + donut(statSums(''))
      + `<div class="${pub ? '' : 'admin-only'}" style="flex-direction:column;align-items:stretch"><div class="ed-sub" style="margin-top:16px">個人支出${pub ? '' : '（管理員可見）'}</div><select onchange="statPick(this.value)">${data.members.map(m => `<option value="${esc(m)}" ${m === statWho ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>${donut(statSums(statWho))}</div>`;
  }
  window.statPick = v => { statWho = v; renderStats(); };
  $('refund-bar').insertAdjacentHTML('beforebegin', '<div class="info-card" id="stats-card"><div class="sec-h" style="margin-top:0">📊 支出統計<span class="admin-only" style="gap:6px"><button class="btn btn-outline" onclick="catManage()">⚙ 類別</button><button class="btn btn-outline" onclick="$e(\'modal-export\').style.display=\'flex\'">📤 匯出</button></span></div><div id="stats-body"></div></div>');
  window.$e = id => document.getElementById(id);
  document.body.insertAdjacentHTML('beforeend', '<div id="modal-export" class="modal"><div class="modal-content"><h3 style="margin-top:0">匯出</h3><button class="btn" onclick="exportCSV()">📊 記帳明細（CSV，可用 Excel 開啟）</button><button class="btn" onclick="exportPlan()" style="margin-top:8px">🗓️ 行程（開新頁，可列印／存成 PDF）</button><button class="btn" onclick="exportJSON()" style="margin-top:8px">💾 完整備份（JSON）</button><button class="btn btn-outline" style="margin-top:8px" onclick="closeModal(\'modal-export\')">關閉</button></div></div>');
  const _rt2 = renderTotalOverview; renderTotalOverview = function () { _rt2(); renderStats(); };
  const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); };
  window.exportCSV = () => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', rows = [['日期', '類別', '項目', '幣別', '金額', '退稅', '退稅給', '先付', '每人分擔', '品項', '備註']];
    data.expenses.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e => {
      if (e.type === 'transfer') { rows.push([e.date, '轉帳', '轉帳(還款)', e.currency, e.amount, '', '', e.payer, Object.entries(e.splitDetails || {}).map(([m, v]) => m + ' ' + v).join(' / '), '', '']); return; }
      const pay = typeof e.payer === 'object' ? e.payer : { [e.payer]: e.amount };
      rows.push([e.date, e.cat || '', e.title, e.currency, e.amount, refundOf(e) || '', e.refundTo || '', Object.entries(pay).filter(([, v]) => v > 0).map(([m, v]) => m + ' ' + v).join(' / '), Object.entries(e.splitDetails || {}).map(([m, v]) => m + ' ' + Math.round(v)).join(' / '), (e.items || []).map(it => `${it.n} ${it.p}×${it.q}`).join(' / '), e.note || '']);
    });
    dl(trip + '-記帳.csv', '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  window.exportJSON = () => dl(trip + '-備份.json', JSON.stringify(data, null, 1), 'application/json');
  window.exportPlan = () => {
    const w = window.open('', '_blank'); if (!w) return alert('請允許開啟新視窗');
    const tm = e => e.time || e.depTime || '';
    const line = e => { let m = esc(e.title); if (e.category === 'flight') m += `　${esc(e.depAirport)}→${esc(e.arrAirport)} ${esc(e.flightNo)}（${esc(e.depTime)}–${esc(e.arrTime)}）`; else if (e.category === 'transport') m += `　${esc(e.transFrom)}→${esc(e.transTo)}`; else if (e.location) m += `　📍${esc(e.location)}`; return `<div class="ev"><b>${esc(tm(e)) || '--:--'}</b><div>${m}${e.note ? `<div class="nt">${md(e.note)}</div>` : ''}</div></div>`; };
    const body = data.days.map((d, i) => `<h2>Day ${i + 1}　${esc(d.date)}　${esc(d.title)}<small>　${esc(d.location)}</small></h2>` + (d.events || []).slice().sort((a, b) => (tm(a) || '99:99').localeCompare(tm(b) || '99:99')).map(line).join('')).join('');
    w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>${esc(trip)} 行程</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:720px;margin:20px auto;padding:0 16px;color:#4A423D}h2{border-bottom:2px solid #E09F9F;padding-bottom:4px;margin-top:28px;font-size:1.15rem}h2 small{color:#999;font-weight:400}.ev{display:flex;gap:12px;padding:6px 0;border-bottom:1px dashed #ddd}.ev b{width:48px;flex-shrink:0}.nt{color:#777;font-size:.9rem;white-space:pre-wrap;margin-top:2px}.tip{background:#FFF3B0;padding:8px 12px;border-radius:8px;font-size:.85rem}@media print{.tip{display:none}}</style></head><body><div class="tip">列印或「分享 → 存成 PDF」即可保存；也可以直接截圖。</div>${body}</body></html>`);
    w.document.close();
  };

  // ---------- 現在／下一個 + 長尾山雀 ----------
  const hash = t => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  function evKey(d, e) { return e.id || hash(d.date + '|' + (e.time || e.depTime || '') + '|' + (e.title || '')); }
  const todayStr = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
  const seenT = () => +localStorage.getItem('tit_' + trip) || 0;
  const TIT = '<svg viewBox="0 0 44 44"><g class="tit-tail"><path d="M26 36Q37 38 42 47" stroke="#4A4044" stroke-width="3.4" stroke-linecap="round" fill="none"/><path d="M26 36Q37 38 42 47" stroke="#fff" stroke-width=".9" stroke-linecap="round" fill="none" opacity=".6"/></g><path d="M16 38v4M28 38v4" stroke="#2B2626" stroke-width="1.8" stroke-linecap="round"/><g class="tit-wl"><path d="M12 15Q-1 20 3 34Q13 31 16 21Z" fill="#B9A79A"/><path d="M12 15Q-1 20 3 34" stroke="#3B3436" stroke-width="2.2" stroke-linecap="round" fill="none"/></g><g class="tit-wr"><path d="M32 15Q45 20 41 34Q31 31 28 21Z" fill="#B9A79A"/><path d="M32 15Q45 20 41 34" stroke="#3B3436" stroke-width="2.2" stroke-linecap="round" fill="none"/></g><circle cx="22" cy="22.5" r="18" fill="#fff" stroke="#EAE2DA"/><ellipse cx="22" cy="33" rx="12" ry="6" fill="#F4EFEA" opacity=".5"/><g class="tit-ey"><circle cx="15" cy="21" r="2" fill="#2B2626"/><circle cx="15.7" cy="20.2" r=".7" fill="#fff"/><circle cx="29" cy="21" r="2" fill="#2B2626"/><circle cx="29.7" cy="20.2" r=".7" fill="#fff"/></g><path d="M20.2 24.6Q22 23.6 23.8 24.6Q22 27.8 20.2 24.6Z" fill="#3A3436"/><ellipse class="tit-ck" cx="10.5" cy="26" rx="2.8" ry="2" fill="#F4B6B6" opacity=".55"/><ellipse class="tit-ck" cx="33.5" cy="26" rx="2.8" ry="2" fill="#F4B6B6" opacity=".55"/><path class="tit-br" d="M10.5 15.5L18 18.2M33.5 15.5L26 18.2" stroke="#2B2626" stroke-width="1.1" stroke-linecap="round"/><path class="tit-cl" d="M12.5 21Q15 23.6 17.5 21M26.5 21Q29 23.6 31.5 21" stroke="#2B2626" stroke-width="1.5" stroke-linecap="round" fill="none"/><path class="tit-sb" d="M10.5 18.2L18 15.6M33.5 18.2L26 15.6" stroke="#2B2626" stroke-width="1.1" stroke-linecap="round"/><path class="p-tear" d="M12.5 25Q11 28 12.5 29.5Q14 28 12.5 25Z" fill="#8EC5F0"/><g class="p-cam"><rect x="9" y="27" width="16" height="10" rx="2" fill="#4A4A55"/><rect x="12" y="25" width="6" height="3" rx="1" fill="#4A4A55"/><circle cx="17" cy="32" r="3.4" fill="#CDEBFF" stroke="#2B2626"/></g><text class="p-flash" x="26" y="26" font-size="10" fill="#F6C945">✦</text><g class="p-bun"><circle cx="22" cy="30" r="5" fill="#F6E3C3" stroke="#D9B98A"/><path d="M19 29Q22 27 25 29" stroke="#D9B98A" fill="none" stroke-width=".8"/></g><g class="p-slip"><rect x="31" y="14" width="8" height="19" rx="1" fill="#fff" stroke="#E09F9F"/><rect x="31" y="14" width="8" height="4" fill="#E09F9F"/><path d="M33.5 21h3M33.5 24h3M33.5 27h3" stroke="#C9A0A0" stroke-width=".8"/></g><text class="p-z" x="31" y="9" font-size="8" fill="#7F96AC">z</text><text class="p-z" x="35" y="4" font-size="6" fill="#7F96AC" style="animation-delay:.8s">z</text></svg>';
  const TITSAY = ['啾啾！', '今天也要慢慢玩～', '我的尾巴很長喔', '不用趕時間啦', '要記得喝水喔', '好期待下一站！', '肚子餓了嗎？', '長尾山雀最可愛了（自己說）'];
  const PL = {
    FIRST: ['好興奮!', '昨天開始就睡不著了!!', '要出發了嗎?', '要準備出發了!!', '出去玩～', '好快樂', '啾啾啾～', '起床了嗎?'],
    LAST: ['要回家了', '快樂的時光總是過得特別快...', '明天又要上班...', '下次什麼時候再去玩?', '再會', '好累喔...', '該回家了'],
    MEAL: ['不可能正餐吃不下吧?', '吃飯飯了!', '好餓喔!', '今天吃什麼?', '我吃得下!!', '欠吃!'],
    SNACK: ['我還飽著...先不吃...', '怎麼又要吃?', '看起來很好吃欸', '我已經吃不下了...'],
    NIGHT: ['可以吧?才第幾餐?', '加油加油', '吃吃吃!'],
    PHOTO: ['給雀雀笑一個', '拍個紀念照～', '很好很上鏡!'],
    OMI: ['本多終勝啦!!', '抽到大吉了沒?', '拜託!拜託!財運旺旺!', '我抽到大吉!', '抽籤也是本多終勝嗎?'],
    CHARM: ['買個御守', '來蒐集御朱印!', '去抽籤嗎?'],
    HOTEL: ['已躺好!', '晚安～', '再睡一下', '我已經睡著了', '啾啾', '今天會有個好夢'],
    HOTELAM: ['早上了嗎?', '我還沒睡飽', '集合時間還沒到...', '我再睡十分鐘...', '今天不化妝多睡一點', '睡到亮晶晶!起床!', '再睡就來不及了!', '起床!!化妝!!']
  };
  const NEST_B = '<ellipse cx="30" cy="12" rx="28" ry="11" fill="#7E5C3C"/>';
  const NEST_F = '<path d="M2 12Q3 34 30 34Q57 34 58 12Q30 22 2 12Z" fill="#B38A5E" stroke="#8F6B47"/><path d="M8 20Q30 26 52 20M12 27Q30 32 48 27" stroke="#8F6B47" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
  let titTm = 0, titCtx = { cat: 'other', first: false, last: false, dayFirst: false };
  function titSay(t, ms) { const b = document.querySelector('#tit .tit-b'); if (!b) return; b.textContent = t; b.classList.add('on'); clearTimeout(titTm); titTm = setTimeout(() => b.classList.remove('on'), ms || 2600); }
  function titAct(a, ms) { const el = $('tit'); if (!el || !a) return; const c = a === 'roll' ? 'roll' : 'a-' + a; el.classList.add(c); setTimeout(() => el.classList.remove(c), ms); }
  window.titPoke = () => {
    const el = $('tit'); if (!el || el.classList.contains('walk')) return;
    const c = titCtx, r = Math.random(); let a = null, ms = 1400, L = TITSAY;
    if (c.cat === 'hotel') { a = pick(['sleep', 'rest', 'flap']); ms = 2600; L = c.dayFirst ? PL.HOTELAM : PL.HOTEL; }
    else if (c.first) { a = r < .35 ? 'roll' : r < .6 ? 'sway' : null; L = PL.FIRST; ms = 1600; }
    else if (c.last) { a = 'sad'; ms = 2400; L = PL.LAST; }
    else if (c.cat === 'meal') { a = r < .5 ? 'sway' : 'eat'; ms = a === 'eat' ? 2200 : 1600; L = PL.MEAL; }
    else if (c.cat === 'spot' && r < .4) { a = 'photo'; ms = 1800; L = PL.PHOTO; }
    else if (c.cat === 'shrine' && r < .4) { a = 'omi'; ms = 2000; L = PL.OMI; }
    else { if (Math.random() < .35) a = 'roll'; L = c.cat === 'shrine' ? TITSAY.concat(PL.CHARM) : c.cat === 'snack' ? TITSAY.concat(PL.SNACK) : c.cat === 'night' ? TITSAY.concat(PL.NIGHT) : TITSAY; }
    titSay(pick(L), a === 'sad' ? 2400 : 2600); titAct(a, ms);
  };
  // 長尾山雀是獨立的一層，不會跟著行程列表重畫；已完成的行程折疊；飯店旁有鳥窩
  let titEl = null, nestF = null, titIdx = null, titDay = '', titTok = 0, titBusy = 0, titKeep = 0; const foldOpen = {};
  const CATN = e => { const c = e && e.category; return c === 'food' ? 'meal' : (c || 'other'); };
  window.foldTog = () => { const d = data.days[currentDayIndex], was = !!foldOpen[d.date]; foldOpen[d.date] = !was; renderTit(); if (was) { const b = document.querySelector('#itinerary-list .fold-bar'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
  let titRe = null;
  if (window.ResizeObserver) { const lst = $('itinerary-list'); if (lst) new ResizeObserver(() => { if (titRe) titRe(); }).observe(lst); }
  function titHide() { if (titEl) titEl.style.display = 'none'; if (nestF) nestF.style.display = 'none'; titIdx = null; titRe = null; }
  function renderTit() {
    document.querySelectorAll('#itinerary-list .tick, #itinerary-list .fold-bar, #itinerary-list .nest').forEach(x => x.remove());
    const d = data.days[currentDayIndex], list = $('itinerary-list');
    if (!d || !list || d.date > todayStr()) return titHide();
    const ws = [...list.querySelectorAll('.timeline-card-wrapper')]; if (!ws.length) return titHide();
    const isToday = d.date === todayStr();
    ws.forEach(w => { const e = d.events[+w.dataset.idx], k = evKey(d, e), on = !!DONE[k]; w.dataset.k = k; w.classList.toggle('ev-done', on); w.querySelector('.card').insertAdjacentHTML('beforeend', `<div class="tick ${on ? 'on' : ''}" onclick="tickEv('${k}')">✓</div>`); if (isToday && CATN(e) === 'hotel') w.insertAdjacentHTML('beforeend', `<div class="nest"><svg viewBox="0 0 60 36" width="60" height="36">${NEST_B}${NEST_F}</svg></div>`); });
    const idx = ws.findIndex(w => !DONE[w.dataset.k]), at = idx < 0 ? ws.length - 1 : idx, active = $('page-itinerary').classList.contains('active'), open = !!foldOpen[d.date];
    const catOf = i => CATN(d.events[+ws[Math.max(0, Math.min(ws.length - 1, i))].dataset.idx]), atCat = catOf(at), atHotel = atCat === 'hotel';
    titCtx = { cat: atCat, first: currentDayIndex === 0 && at === 0, last: currentDayIndex === data.days.length - 1 && at === ws.length - 1, dayFirst: at === 0 };
    const live = () => [...list.querySelectorAll('.timeline-card-wrapper')];
    const foldTo = n => live().forEach((w, i) => w.classList.toggle('ev-fold', !open && i < n));
    const place = (i, anim, nested) => { const L = live(), w = L[Math.max(0, Math.min(L.length - 1, i))]; titEl.style.transition = anim ? '' : 'none'; titEl.style.top = (list.offsetTop + w.offsetTop + 44 + (nested ? 6 : 0)) + 'px'; titEl.style.left = (list.offsetLeft + w.offsetLeft + 8) + 'px'; nestF.style.display = nested ? '' : 'none'; if (nested) { nestF.style.top = (list.offsetTop + w.offsetTop + 62) + 'px'; nestF.style.left = (list.offsetLeft + w.offsetLeft + 2) + 'px'; } };
    if (at > 0) {
      const mk = top => { const bar = document.createElement('div'); bar.className = 'fold-bar' + (top ? ' fold-top' : ''); bar.innerHTML = `✓ 已完成 ${at} 個行程　${open ? '▴ 收起' : '▾ 展開'}`; bar.onclick = window.foldTog; return bar; };
      list.insertBefore(mk(false), ws[at]);
      if (open) list.insertBefore(mk(true), ws[0]);   // 展開後，最上面也能收起
    }
    if (!isToday) { foldTo(at); return titHide(); }   // 不是今天：不顯示長尾山雀
    titRe = () => { if (Date.now() >= titBusy && titEl && titEl.style.display !== 'none') place(at, false, atHotel); };   // 版面變動時重新對位
    const m = MASC, pend = m && m.d === d.date && m.t > seenT() && Date.now() - m.t < 432e5;
    let from = null, dir = null;
    if (active) {
      if (titEl && titDay === d.date && titIdx != null && titIdx !== at) { from = titIdx; dir = at > from ? 'f' : 'b'; }
      else if (pend && (titDay !== d.date || titIdx == null)) { from = m.from; dir = m.dir; }
      if (pend) localStorage.setItem('tit_' + trip, m.t);
    }
    if (from != null) from = Math.min(from, ws.length - 1); if (from === at) from = null;
    const par = list.parentNode; if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
    if (!titEl) { titEl = document.createElement('div'); titEl.id = 'tit'; titEl.className = 'tit'; titEl.onclick = window.titPoke; titEl.innerHTML = TIT + '<div class="tit-b"></div>'; nestF = document.createElement('div'); nestF.id = 'nest-f'; nestF.innerHTML = `<svg viewBox="0 0 60 36" width="60" height="36">${NEST_F}</svg>`; }
    if (titEl.parentNode !== par) { par.appendChild(titEl); par.appendChild(nestF); }
    titEl.style.display = '';
    const base = () => 'tit' + (idx < 0 ? ' fin' : '') + (atHotel ? ' innest' : '');
    if (Date.now() < titBusy && from == null && titIdx === at) { foldTo(Math.min(titKeep, at)); return; }
    if (from == null) { titEl.className = base(); foldTo(at); place(at, false, atHotel); }
    else {
      const fromCat = catOf(from), fwd = dir === 'f', air = fwd ? (fromCat === 'flight' || fromCat === 'transport') : (atCat === 'flight' || atCat === 'transport'), keep = Math.min(from, at);
      let cls = 'tit walk ', say;
      if (fwd) { cls += 'cheer'; say = fromCat === 'hotel' ? pick(['又有力氣繼續逛街了!', '休息結束!繼續吃!']) : pick(['太棒了！', '完成～下一站出發！', '耶～']); }
      else if (fromCat === 'hotel') { cls += 'a-sad'; say = '我剛窩好欸...'; }
      else { cls += 'angry'; say = atCat === 'flight' ? '再玩行程你現在買機票飛回去!' : atCat === 'transport' ? '搭車很累!不要鬧!' : '不要亂玩行程!!!'; }
      if (air) cls += ' fly' + (fwd ? '' : ' cheer');
      titKeep = keep; titBusy = Date.now() + 1900;
      foldTo(keep); place(from, false, fromCat === 'hotel');
      titEl.className = cls; titSay(say, 2400);
      const tok = ++titTok; titEl.getBoundingClientRect();
      requestAnimationFrame(() => requestAnimationFrame(() => { if (tok === titTok) place(at, true, false); }));
      setTimeout(() => { if (tok !== titTok) return; titEl.className = base(); foldTo(at); place(at, true, atHotel); }, 1900);
    }
    titIdx = at; titDay = d.date;
  }
  window.tickEv = key => {
    const d = data.days[currentDayIndex], first = () => { const i = d.events.findIndex(e => !DONE[evKey(d, e)]); return i < 0 ? d.events.length : i; };
    const from = first(), on = !DONE[key];
    if (on) { DONE[key] = Date.now(); foldOpen[d.date] = false; } else delete DONE[key];   // 完成後自動收起已完成區
    const to = first(), m = from !== to ? { d: d.date, dir: to > from ? 'f' : 'b', from, to, t: Date.now() } : null;
    ready.then(() => { ref.child('done/' + key).set(on ? Date.now() : null); if (m) ref.child('mascot').set(m); }).catch(() => toast('❌ 同步失敗', 1));
    try { localStorage.setItem('done_' + trip, JSON.stringify(DONE)); } catch (e) { }
    if (m) MASC = m; renderItinerary();
  };
  const _ri3 = renderItinerary; renderItinerary = function () { _ri3(); renderTit(); };
  const _sp = switchPage; switchPage = function (pid, el) { _sp(pid, el); if (pid === 'itinerary') renderTit(); };
  const _tpv = togglePublicView; togglePublicView = function () { _tpv(); renderStats(); };

  // ---------- 行程類別：新增飯店、神社，美食拆成正餐／點心／消夜 ----------
  if (typeof CAT_CONFIG !== 'undefined') Object.assign(CAT_CONFIG, { shrine: { color: '#E08A8A', name: '神社' }, hotel: { color: '#9AA8D6', name: '飯店' }, meal: { color: '#E3D081', name: '正餐' }, snack: { color: '#F0B89A', name: '點心' }, night: { color: '#8E7FB8', name: '消夜' } });
  if ($('evt-cat')) $('evt-cat').innerHTML = '<option value="spot">⛩️ 景點</option><option value="shrine">⛩️ 神社</option><option value="hotel">🏨 飯店</option><option value="transport">🚅 交通</option><option value="flight">✈️ 航班</option><option value="meal">🍜 正餐</option><option value="snack">🍡 點心</option><option value="night">🍢 消夜</option><option value="shop">🛍️ 購物</option><option value="other">📝 其他</option>';
  const _riCat = renderItinerary;
  renderItinerary = function () { data.days.forEach(x => (x.events || []).forEach(e => { if (e.category === 'food') e.category = 'meal'; })); _riCat(); };

  // ---------- 類別管理 ----------
  const catSave = () => { saveData(); renderExpenseList(); renderTotalOverview(); catManage(); };
  window.catManage = () => {
    let m = $('modal-cat'); if (!m) { document.body.insertAdjacentHTML('beforeend', '<div id="modal-cat" class="modal"><div class="modal-content"></div></div>'); m = $('modal-cat'); }
    m.querySelector('.modal-content').innerHTML = `<h3 style="margin-top:0">管理類別</h3>${cats().map((c, i) => `<div class="cat-row"><i style="background:${catColor(c)}"></i><span>${esc(c)}</span><span class="ed" onclick="catRen(${i})">✏️ 改名</span><span class="ed" onclick="catDel(${i})">🗑️ 刪除</span></div>`).join('')}<button class="btn btn-outline" onclick="catAdd()">+ 新增類別</button><button class="btn" style="margin-top:6px" onclick="closeModal('modal-cat')">完成</button>`;
    m.style.display = 'flex';
  };
  window.catAdd = () => { const n = (prompt('新類別名稱：') || '').trim(); if (!n) return; const L = cats().slice(); if (L.includes(n)) return alert('已經有這個類別了'); L.push(n); data.settings.categories = L; catSave(); };
  window.catRen = i => { const L = cats().slice(), o = L[i], n = (prompt('改名為：', o) || '').trim(); if (!n || n === o) return; if (L.includes(n)) return alert('已經有這個類別了'); L[i] = n; data.settings.categories = L; data.expenses.forEach(e => { if (e.cat === o) e.cat = n; }); catSave(); };
  window.catDel = i => { const L = cats().slice(), o = L[i]; if (!confirm(`刪除類別「${o}」？\n使用這個類別的帳目會變成「未分類」。`)) return; L.splice(i, 1); data.settings.categories = L; data.expenses.forEach(e => { if (e.cat === o) delete e.cat; }); catSave(); };

  // ---------- 旅程切換（僅管理員）----------
  const b = document.createElement('div'); b.id = 'trip-btn'; b.className = 'admin-only'; b.innerText = '🗺️ ' + (trip === 'default' ? '旅程' : trip);
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
