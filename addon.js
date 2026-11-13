/* 旅遊小幫手 附加功能（完整版）：倒數貼紙、照片、今日路線、Firebase 同步、須知頁、評分頁 */
(function () {
  const FIREBASE_CONFIG = { apiKey: "AIzaSyAwVNxRT6VMje1ZutvaOx-oL36MsaF8f1w", authDomain: "travel-plan-46bc4.firebaseapp.com", databaseURL: "https://travel-plan-46bc4-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "travel-plan-46bc4", appId: "1:995767265783:web:a12f909fda79f5d4d766f2" };

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const trip = new URLSearchParams(location.search).get('trip') || 'default';
  const me = localStorage.voter_id || (localStorage.voter_id = 'v' + Math.random().toString(36).slice(2, 10));
  let votes = {}, rateSel = 0;
  const I = () => data.info = Object.assign({ flights: [], hotels: [], notes: [] }, data.info || {});
  const R = () => data.rating = Object.assign({ items: [] }, data.rating || {});
  const commit = () => { saveData(); renderInfo(); renderRate(); };
  Object.assign(LOC_COORDS, { Fukuoka: { lat: 33.5902, lon: 130.4017 }, Tokyo: { lat: 35.6762, lon: 139.6503 }, Sapporo: { lat: 43.0618, lon: 141.3545 }, Okinawa: { lat: 26.2124, lon: 127.6809 }, Seoul: { lat: 37.5665, lon: 126.978 }, Busan: { lat: 35.1796, lon: 129.0756 } });

  // ---------- 通用表單視窗 ----------
  function form(title, fields, vals, onSave, onDel) {
    let m = $('gen-modal'); if (!m) { m = document.createElement('div'); m.id = 'gen-modal'; m.className = 'modal'; document.body.appendChild(m); }
    m.innerHTML = `<div class="modal-content"><h3 style="margin-top:0">${title}</h3>${fields.map(([k, l, t]) => `<label>${l}</label>` + (t === 'area' ? `<textarea id="gf-${k}" rows="3"></textarea>` : `<input id="gf-${k}" type="${t || 'text'}">`)).join('')}<button class="btn" id="gf-ok">儲存</button>${onDel ? '<button class="btn btn-danger" id="gf-del">刪除</button>' : ''}<button class="btn btn-outline" id="gf-x" style="margin-top:5px">取消</button></div>`;
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
    flights: ['航班', [['date', '日期', 'date'], ['dep', '出發機場縮寫（如 TPE）'], ['depT', '起飛時間', 'time'], ['arr', '抵達機場縮寫（如 FUK）'], ['arrT', '降落時間', 'time'], ['no', '班機號'], ['bag', '託運行李（尺寸/件數/限重/總重或單件…）', 'area'], ['carry', '手提行李（尺寸/限重…）', 'area']]],
    hotels: ['住宿', [['name', '住宿名稱'], ['in', '入住日期', 'date'], ['out', '退房日期', 'date'], ['img', '照片網址（選填）'], ['map', '地圖搜尋關鍵字或地址（選填）'], ['note', '備註', 'area']]],
    notes: ['須知', [['title', '標題'], ['body', '內文', 'area']]]
  };
  window.infoEdit = (k, i) => { const L = I()[k], n = i == null; form((n ? '新增' : '編輯') + SCH[k][0], SCH[k][1], n ? {} : L[i], o => { n ? L.push(o) : L[i] = o; commit(); }, n ? null : () => { L.splice(i, 1); commit(); }); };
  window.cdG = g => { localStorage.cd_gender = g; renderInfo(); };
  window.cdT = (i, v) => { data.days[i].transport = v; commit(); };
  const ed = (k, i) => `<div class="ed admin-only" onclick="infoEdit('${k}',${i})">✏️ 編輯</div>`;
  const add = (k, t) => `<button class="btn btn-outline admin-only" onclick="infoEdit('${k}')">+ ${t}</button>`;
  let wxKey = '', wxHtml = '';
  const wi = c => c === 0 ? '☀️' : c <= 3 ? '⛅' : c < 50 ? '🌫️' : c < 70 ? '🌧️' : c < 80 ? '❄️' : c < 90 ? '🌦️' : '⛈️';

  function renderInfo() {
    const pg = $('info-body'); if (!pg || !data.days.length) return;
    const g = localStorage.cd_gender || 'f', p = g === 'm' ? '👨' : '👩', st = stage();
    let em = p, prop, txt;
    if (st.k === 'work') { em = p + '\u200d💻'; prop = '⌨️'; txt = st.end ? '旅程結束，回到日常' : '認真工作中…'; }
    else if (st.k === 'pack') { prop = '🧳👕'; txt = '陸續收拾行李中'; }
    else if (st.k === 'cash') { prop = '💴🏦'; txt = '去領外幣囉'; }
    else if (st.k === 'sleep') { prop = '🌙🛏️'; txt = '興奮到睡不著…'; }
    else { const t = TR.find(x => x[0] === data.days[st.di].transport); prop = t ? t[1] : '🧳'; txt = t ? '今日交通：' + t[2] : '旅行中！'; }
    const big = st.k === 'trip' ? `旅行中 第 <b>${st.di + 1}</b> 天` : st.end ? '旅程結束' : `還有 <b>${st.left}</b> 天`;
    const info = I();
    const fl = info.flights.map((f, i) => `<div class="info-card"><div class="fl-row"><div><b>${esc(f.dep)}</b><small>${esc(f.depT)}</small></div><div class="fl-mid">✈️<small>${esc(f.no)}</small></div><div><b>${esc(f.arr)}</b><small>${esc(f.arrT)}</small></div></div><small class="muted">${esc(f.date)}</small>${f.bag ? `<div class="bag">🧳 託運：${esc(f.bag)}</div>` : ''}${f.carry ? `<div class="bag">🎒 手提：${esc(f.carry)}</div>` : ''}${ed('flights', i)}</div>`).join('');
    const ht = info.hotels.map((h, i) => `<div class="info-card">${h.img ? `<img class="evt-img" src="${esc(h.img)}" onerror="this.remove()">` : ''}<b>${esc(h.name)}</b><div class="muted">📅 ${esc(h.in)} → ${esc(h.out)}</div>${h.note ? `<div class="bag">${esc(h.note)}</div>` : ''}<a class="route-btn" style="margin:10px 0 0" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.map || h.name)}">🗺️ 地圖</a>${ed('hotels', i)}</div>`).join('');
    const nt = info.notes.map((n, i) => `<details class="info-card"><summary>${esc(n.title)}</summary><div class="bag">${esc(n.body)}</div>${ed('notes', i)}</details>`).join('');
    const trAdmin = `<div class="info-card admin-only" style="flex-direction:column"><b>🚦 每日交通工具（管理員）</b>${data.days.map((d, i) => `<div class="tr-row"><span>Day ${i + 1}（${esc(d.date.slice(5))}）</span><select onchange="cdT(${i},this.value)"><option value="">未設定</option>${TR.map(t => `<option value="${t[0]}" ${d.transport === t[0] ? 'selected' : ''}>${t[1]} ${t[2]}</option>`).join('')}</select></div>`).join('')}</div>`;
    pg.innerHTML = `<div class="cd-card"><div class="gender"><span class="${g === 'm' ? 'on' : ''}" onclick="cdG('m')">♂</span><span class="${g !== 'm' ? 'on' : ''}" onclick="cdG('f')">♀</span></div><div class="cd-scene"><span class="cd-p">${em}</span><span class="cd-prop">${prop}</span></div><div class="cd-days">${big}</div><div class="cd-sub">${txt}</div></div>${trAdmin}
    <div class="sec-h">🌤️ 旅遊天氣</div><div id="wx" class="wx-row"></div>
    <div class="sec-h">✈️ 航班資訊${add('flights', '新增')}</div>${fl || '<div class="muted">尚未新增航班</div>'}
    <div class="sec-h">🏨 住宿資訊${add('hotels', '新增')}</div>${ht || '<div class="muted">尚未新增住宿</div>'}
    <div class="sec-h">📌 其他須知${add('notes', '新增')}</div>${nt || '<div class="muted">尚未新增須知（例如：護照遺失怎麼辦、緊急聯絡電話）</div>'}`;
    renderWx();
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
  function saveVote(pid, o) { (votes[me] = votes[me] || {})[pid] = o; if (window.__pushVote) window.__pushVote(pid, o); }
  window.vote = (pid, v) => { const o = (votes[me] || {})[pid] || {}; o.t = v; saveVote(pid, o); renderRate(); };
  window.voteC = (pid, j, v) => { const o = (votes[me] || {})[pid] || {}; o.c = o.c || {}; o.c[j] = v; saveVote(pid, o); };
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
        h += `<div class="info-card">${x.img ? `<img class="evt-img" src="${esc(x.img)}" onerror="this.remove()">` : ''}<div class="pl-h"><b>${esc(x.name)}</b>${show && a ? `<span class="avg">平均 ${a.m.toFixed(1)}（${a.n}人）</span>` : ''}<span class="ed admin-only" onclick="plEdit(${i})">✏️</span></div><label>我的總分</label><select onchange="vote('${x.id}',this.value)">${so(my.t)}</select>${cr.length ? `<details><summary>評分標準（參考，選填）</summary>${cr.map((c, j) => `<div class="cr"><span>${esc(c)}</span><select onchange="voteC('${x.id}',${j},this.value)">${so((my.c || {})[j])}</select></div>`).join('')}</details>` : ''}</div>`;
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
  saveData = function () {
    localStorage.setItem('trip_data_public', JSON.stringify(data));
    ready.then(() => ref.update(clean(data))).then(() => toast('✅ 已同步')).catch(() => toast('❌ 同步失敗', 1));
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
        votes = v.votes || {}; delete v.votes;
        data = norm(v); localStorage.setItem('trip_data_public', JSON.stringify(data));
        if (currentDayIndex >= data.days.length) currentDayIndex = 0;
        updateHero(); renderDates(); renderItinerary(); renderExpenseList(); renderTotalOverview(); renderShoppingList(); renderPackingList(); renderInfo(); renderRate();
      });
    } catch (e) { console.error(e); _lc(); }
  };

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
