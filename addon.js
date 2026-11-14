/* 旅遊小幫手 附加功能（完整版）：倒數貼紙、照片、今日路線、Firebase 同步、須知頁、評分頁 */
(function () {
  const FIREBASE_CONFIG = { apiKey: "AIzaSyAwVNxRT6VMje1ZutvaOx-oL36MsaF8f1w", authDomain: "travel-plan-46bc4.firebaseapp.com", databaseURL: "https://travel-plan-46bc4-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "travel-plan-46bc4", appId: "1:995767265783:web:a12f909fda79f5d4d766f2" };

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const trip = new URLSearchParams(location.search).get('trip') || 'default';
  const me = localStorage.voter_id || (localStorage.voter_id = 'v' + Math.random().toString(36).slice(2, 10));
  let votes = {}, rateSel = 0, openD = {};
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

  // ---------- Q版人物（向量圖 + 動畫）----------
  const SK = '#FFE0C7', shirt = g => g === 'f' ? '#F4A6A6' : '#8DB6E8';
  const head = (g, x, y, s) => { const f = g === 'f', hc = f ? '#7A4B3A' : '#3B3030'; return `<g transform="translate(${x} ${y}) scale(${s})">${f ? `<circle cx="-24" cy="-22" r="9" fill="${hc}"/><circle cx="24" cy="-22" r="9" fill="${hc}"/>` : ''}<circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/>${f ? `<path d="M-27 -2C-30 14 -26 24 -20 28L-22 0ZM27 -2C30 14 26 24 20 28L22 0Z" fill="${hc}"/>` : ''}<g class="k-blink"><ellipse cx="-10" cy="2" rx="3" ry="4" fill="#3B3030"/><ellipse cx="10" cy="2" rx="3" ry="4" fill="#3B3030"/></g><circle cx="-17" cy="10" r="4" fill="#FFB5B5" opacity=".7"/><circle cx="17" cy="10" r="4" fill="#FFB5B5" opacity=".7"/><path d="M-5 11Q0 16 5 11" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/></g>`; };
  const wh = (x, y, r) => `<g class="k-spin"><circle cx="${x}" cy="${y}" r="${r}" fill="#4A423D"/><line x1="${x}" y1="${y - r + 3}" x2="${x}" y2="${y + r - 3}" stroke="#ddd" stroke-width="2"/></g>`;
  const win = (g, x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="#CDEBFF"/>` + head(g, x, y + 3, .42);
  const road = y => `<line class="k-wave" x1="0" y1="${y}" x2="260" y2="${y}" stroke="#cbbfb3" stroke-width="3" stroke-dasharray="14 12"/>`;
  const rects = (xs, y, w, h) => xs.map(x => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#CDEBFF"/>`).join('');
  // ---------- 辦公室場景 + 互動 ----------
  function office(g) {
    const f = g === 'f', hc = '#2B2626', dc = f ? '#C9B8E8' : '#fff';
    const arm = (a, b, c, d) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${f ? SK : '#E8E1DA'}" stroke-width="8" stroke-linecap="round"/>`;
    const hand = (x, y, c) => `<circle ${c ? `class="${c}"` : ''} cx="${x}" cy="${y}" r="4.5" fill="${SK}"/>`;
    const stack = (x, w, cols) => cols.map((c, i) => `<rect x="${x + (i % 2)}" y="${97 - i * 7}" width="${w - (i % 2) * 2}" height="7" rx="1" fill="${c}" stroke="#d6c7ad" stroke-width=".6"/>`).join('');
    const mon = (x, w, d) => `<rect x="${x + 16}" y="92" width="6" height="12" fill="#5B5560"/><rect x="${x}" y="60" width="${w}" height="32" rx="3" fill="#4A4A55"/><rect x="${x + 3}" y="63" width="${w - 6}" height="26" fill="#DDEEFF"/>` + [0, 1, 2, 3].map(i => `<rect class="k-twinkle" style="animation-delay:${i * .35 + d}s" x="${x + 6}" y="${67 + i * 5.5}" width="${w - 12 - (i % 2) * 8}" height="2.4" rx="1" fill="#7FA6D9"/>`).join('');
    const bld = [[12, 34, 12], [26, 22, 14], [42, 30, 10], [54, 16, 16], [72, 28, 14]].map(([x, y, w], i) => `<rect x="${x}" y="${y}" width="${w}" height="${60 - y}" fill="${i % 2 ? '#8AA3BA' : '#9DB4C8'}"/><rect class="k-twinkle" style="animation-delay:${i * .5}s" x="${x + 3}" y="${y + 5}" width="3" height="3" fill="#FFF3B0"/>`).join('');
    const face = `<g transform="translate(70 56)"><g class="hd"><circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/><g class="ey"><g class="k-blink"><ellipse cx="-10" cy="2" rx="3" ry="4.2" fill="${hc}"/><ellipse cx="10" cy="2" rx="3" ry="4.2" fill="${hc}"/></g></g>${[-10, 10].map(x => `<circle cx="${x}" cy="2" r="9" fill="rgba(255,255,255,.3)" stroke="#4A423D" stroke-width="1.6"/>`).join('')}<line x1="-1" y1="2" x2="1" y2="2" stroke="#4A423D" stroke-width="1.6"/><line class="bl" x1="-16" y1="-12" x2="-5" y2="-12" stroke="${hc}" stroke-width="2.2" stroke-linecap="round"/><line class="br" x1="5" y1="-12" x2="16" y2="-12" stroke="${hc}" stroke-width="2.2" stroke-linecap="round"/><circle class="bk" cx="-17" cy="12" r="4"/><circle class="bk" cx="17" cy="12" r="4"/><path class="m-n" d="M-5 14Q0 18 5 14" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse class="m-a" cx="0" cy="15" rx="6" ry="5" fill="#C0392B"/><line class="m-t" x1="-4" y1="15" x2="4" y2="15" stroke="#B5655A" stroke-width="2" stroke-linecap="round"/><circle class="m-w" cx="0" cy="15" r="3" fill="#B5655A"/></g><text class="x-ang" x="16" y="-26" font-size="16">💢</text><text class="x-q" x="18" y="-28" font-size="16">❓</text><text class="x-z" x="18" y="-28" font-size="14">💤</text></g>`;
    return '<defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8977A"/><stop offset="1" stop-color="#B8977A" stop-opacity="0"/></linearGradient></defs><rect x="8" y="8" width="86" height="52" fill="#CFE8F5"/>' + bld + '<rect x="8" y="8" width="86" height="52" fill="none" stroke="#bfb3a5" stroke-width="3"/><rect x="5" y="58" width="92" height="4" fill="#bfb3a5"/>'
      + `<g class="hit">${f ? `<g transform="translate(70 56)"><g class="hd"><path d="M-30 -6C-36 -40 36 -40 30 -6L33 32Q0 40 -33 32Z" fill="${hc}"/></g></g>` : ''}<rect x="52" y="80" width="36" height="40" rx="12" fill="${dc}" stroke="#d9d2ca"/>${f ? '<path d="M62 80Q70 90 78 80Z" fill="#fff"/>' : '<polygon points="70,82 66,90 70,104 74,90" fill="#4F86C6"/>'}${face}</g>`
      + '<rect x="4" y="104" width="192" height="8" rx="3" fill="#C9A98B"/><rect x="4" y="112" width="192" height="38" fill="url(#dg)"/><line x1="100" y1="114" x2="100" y2="150" stroke="#a5846a"/>'
      + stack(8, 34, ['#F3E3C3', '#fff', '#E8D0A9', '#D8E2EE', '#fff', '#F3E3C3', '#E8D0A9', '#fff']) + stack(44, 14, ['#E8D0A9', '#fff', '#D8E2EE'])
      + '<rect x="56" y="100" width="30" height="4" rx="1.5" fill="#E8E1DA"/><rect class="cup-s" x="89" y="94" width="7" height="10" rx="1.5" fill="#CDEBFF" stroke="#9fc5de"/><rect x="98" y="98" width="12" height="6" rx="2" fill="#4A4A55"/><rect x="99" y="95" width="10" height="3" rx="1.5" fill="#6B6B78"/>'
      + mon(112, 38, 0) + mon(152, 40, .5)
      + `<g class="o-a a-type">${arm(58, 90, 66, 100)}${arm(82, 90, 78, 100)}${hand(66, 101, 'k-tapL')}${hand(78, 101, 'k-tapR')}</g>`
      + `<g class="o-a a-stretch">${arm(56, 90, 36, 54)}${arm(84, 90, 104, 54)}${hand(35, 51)}${hand(105, 51)}</g>`
      + `<g class="o-a a-drink">${arm(84, 92, 79, 82)}<rect x="66" y="70" width="8" height="10" rx="2" fill="#CDEBFF" stroke="#9fc5de"/>${hand(78, 80)}</g>`
      + `<g class="o-a a-files">${arm(58, 92, 52, 97)}<rect class="k-lid" x="44" y="88" width="14" height="10" fill="#fff" stroke="#d6c7ad"/>${hand(52, 98)}</g>`
      + `<g class="o-a a-phone">${arm(84, 92, 90, 70)}<rect x="86" y="54" width="6" height="18" rx="3" fill="#4A4A55" transform="rotate(10 89 63)"/>${hand(90, 71)}${hand(66, 101, 'k-tapL')}</g>`;
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
    if (kind === 'sleep') { const run = () => { if (tok !== SC.tok) return; setTimeout(() => { if (tok !== SC.tok) return; setBubble('好興奮!睡不著!', 100, 44); setTimeout(() => { if (tok === SC.tok) setBubble(''); }, 2200); }, 7600); setTimeout(run, 10000); }; run(); }
    v.onclick = ev => {
      if (kind === 'work') { if (ev.target.closest('.hit')) poke(); return; }
      if (kind === 'court') { const w = ev.target.closest('[data-who]'); if (!w) return; setBubble(pick(COURT[w.dataset.who]), +w.dataset.ax, +w.dataset.ay); clearTimeout(SC.bt); SC.bt = setTimeout(() => setBubble(''), 2800); return; }
      const L = kind === 'pack' ? (SAY.pack[left] || SAY.pack[7]) : SAY[kind]; if (!L) return;
      setBubble(pick(L)); clearTimeout(SC.bt); SC.bt = setTimeout(() => setBubble(''), 2800);
    };
  }
  setInterval(() => { if (SC.kind === 'work' && SC.f === 'look' && $('cd-svg')) { SC.s = pick(['type', 'type', 'stretch', 'drink', 'files', 'phone']); applyS(); } }, 5000);

  // ---------- 法庭小彩蛋 ----------
  const COURT = { J: ['原告請求權基礎為何?', '原告訴之聲明?', '被告答辯聲明?', '有沒有和解意願?', '有無意見?', '定宣判期日!', '有無證據請求調查?', '講慢一點，書記官打字很辛苦'], C: ['麻煩講慢一點...', '好累...'], R: ['感覺又要拖庭了...', '下一庭是誰?'], L: ['詳如歷次書狀所載', '如書狀所載', '再具狀表示意見', '有和解意願', '謝謝庭上!謝謝書座!'], O: ['法官我跟你說他很可惡...', '我這個很複雜...', '我沒有見過這種人!!!', '你不了解!!!'] };
  const courtDay = () => { const d = new Date(); return (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) % 5 === 0; };
  function court(g) {
    const f = g === 'f', hc = '#2B2626', onLeft = new Date().getDate() % 2 === 0, LX = onLeft ? 50 : 150, OX = onLeft ? 150 : 50;
    const hd = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${c || hc}"/><circle cx="-9" cy="3" r="3" fill="${hc}"/><circle cx="9" cy="3" r="3" fill="${hc}"/><path d="M-5 13Q0 17 5 13" stroke="#B5655A" stroke-width="3" fill="none"/></g>`;
    const rb = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${c}"/>`;
    const desk = (x, w) => `<rect x="${x}" y="90" width="${w}" height="8" rx="2" fill="#B8977A"/><rect x="${x + 8}" y="82" width="16" height="8" rx="1" fill="#4A4A55"/>`;
    const table = x => `<rect x="${x - 34}" y="118" width="68" height="10" rx="3" fill="#B8977A"/><rect x="${x - 26}" y="112" width="20" height="6" fill="#fff" stroke="#d6c7ad"/><rect x="${x - 4}" y="113" width="22" height="5" fill="#F3E3C3" stroke="#d6c7ad"/>`;
    return `<g data-who="J" data-ax="100" data-ay="16" class="hit">${rb(88, 40, 24, 22, '#4F6FA8')}<rect x="97" y="40" width="6" height="22" fill="#fff" opacity=".6"/>${hd(100, 30, .5)}</g><rect x="64" y="54" width="72" height="14" rx="3" fill="#8A6F55"/>`
      + `<g data-who="C" data-ax="40" data-ay="54" class="hit">${rb(60, 78, 22, 26, '#1f1f1f')}${hd(71, 70, .45)}</g>${desk(52, 38)}<circle class="k-tapL" cx="66" cy="92" r="3" fill="${SK}"/><circle class="k-tapR" cx="76" cy="92" r="3" fill="${SK}"/>`
      + `<g data-who="R" data-ax="160" data-ay="54" class="hit">${rb(118, 78, 22, 26, '#1f1f1f')}${hd(129, 70, .45)}</g>${desk(110, 38)}`
      + `<g data-who="O" data-ax="${OX}" data-ay="64" class="hit">${rb(OX - 13, 94, 26, 32, '#E8A87C')}${hd(OX, 82, .55, '#6b4a3a')}</g>${table(OX)}`
      + `<g data-who="L" data-ax="${LX}" data-ay="64" class="hit">${f ? `<rect x="${LX - 15}" y="78" width="30" height="24" rx="9" fill="${hc}"/>` : ''}${rb(LX - 14, 94, 28, 32, '#2B2626')}<polygon points="${LX - 6},94 ${LX + 6},94 ${LX + 4},126 ${LX - 4},126" fill="#C9CED6"/>${hd(LX, 82, .55)}</g>${table(LX)}`;
  }

  // ---------- 收行李（依剩餘天數）----------
  const hairB = (g, x, y, s) => g === 'f' ? `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 -6C-36 -40 36 -40 30 -6L33 32Q0 40 -33 32Z" fill="#2B2626"/></g>` : '';
  const pHead = (g, x, y, s) => { const f = g === 'f', hc = '#2B2626'; return `<g transform="translate(${x} ${y}) scale(${s})"><circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/><g class="k-blink"><ellipse cx="-10" cy="2" rx="3" ry="4.2" fill="${hc}"/><ellipse cx="10" cy="2" rx="3" ry="4.2" fill="${hc}"/></g>${[-10, 10].map(x => `<circle cx="${x}" cy="2" r="9" fill="rgba(255,255,255,.3)" stroke="#4A423D" stroke-width="1.6"/>`).join('')}<line x1="-1" y1="2" x2="1" y2="2" stroke="#4A423D" stroke-width="1.6"/><path d="M-5 14Q0 18 5 14" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/></g>`; };
  function pack(g, left) {
    const f = g === 'f', dc = f ? '#C9B8E8' : '#fff';
    const arm = (a, b, c, d) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${f ? SK : '#E8E1DA'}" stroke-width="8" stroke-linecap="round"/>`;
    const hand = (x, y, c) => `<circle ${c ? `class="${c}"` : ''} cx="${x}" cy="${y}" r="4.5" fill="${SK}"/>`;
    const sit = x => `${hairB(g, x, 76, .8)}<rect x="${x - 20}" y="122" width="18" height="10" rx="5" fill="#7A6A5E"/><rect x="${x + 2}" y="122" width="18" height="10" rx="5" fill="#7A6A5E"/><rect x="${x - 14}" y="94" width="28" height="32" rx="10" fill="${dc}"/>${pHead(g, x, 76, .8)}`;
    const stand = (x, c) => `<g ${c ? `class="${c}"` : ''}>${hairB(g, x, 52, .8)}<rect x="${x - 14}" y="70" width="28" height="38" rx="10" fill="${dc}"/><rect x="${x - 10}" y="106" width="8" height="22" rx="4" fill="#7A6A5E"/><rect x="${x + 2}" y="106" width="8" height="22" rx="4" fill="#7A6A5E"/>${pHead(g, x, 52, .8)}</g>`;
    const stuff = n => ['#A0C4E3', '#F3B6B6', '#F6D365', '#BFE0C6'].slice(0, n).map((c, i) => `<rect x="124" y="${122 - i * 9}" width="44" height="8" rx="3" fill="${c}"/>`).join('');
    const open = n => `<rect x="118" y="54" width="56" height="40" rx="6" fill="#D98E5F"/><rect x="118" y="92" width="56" height="42" rx="6" fill="#E8A87C"/><rect x="123" y="96" width="46" height="34" rx="4" fill="#F5DEC8"/>${stuff(n)}`;
    const bag = x => `<rect x="${x}" y="104" width="26" height="28" rx="9" fill="#7FA6D9"/><rect x="${x + 5}" y="116" width="16" height="10" rx="3" fill="#5E87BC"/>`;
    const sh = '<ellipse cx="100" cy="138" rx="90" ry="6" fill="rgba(0,0,0,.06)"/>';
    if (left >= 6) return sh + open(0) + sit(52) + '<rect x="68" y="118" width="22" height="8" rx="3" fill="#A0C4E3"/><rect class="k-move" x="70" y="108" width="14" height="10" rx="2" fill="#F3B6B6"/>' + arm(62, 102, 74, 114) + hand(75, 115, 'k-tapL');
    if (left === 5) return sh + '<rect x="4" y="96" width="30" height="6" rx="2" fill="#C9A98B"/><rect x="8" y="102" width="4" height="30" fill="#B8977A"/><rect x="26" y="102" width="4" height="30" fill="#B8977A"/><rect x="8" y="82" width="7" height="14" rx="2" fill="#7FA6D9"/><rect x="18" y="86" width="9" height="10" rx="2" fill="#E09F9F"/>' + open(2) + stand(70, 'k-turn') + arm(60, 80, 46, 92) + hand(46, 93) + '<rect class="k-move" x="84" y="92" width="7" height="14" rx="2" fill="#7FA6D9"/>';
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
      + arm(70, 84, 66, 104) + '<g class="k-bills"><g class="k-count">' + bill(88) + bill(91) + '</g></g>'
      + `<g class="k-hands">${arm(74, 84, 88, 100)}${arm(90, 84, 98, 100)}<circle cx="88" cy="100" r="4.5" fill="${SK}"/><circle cx="98" cy="100" r="4.5" fill="${SK}"/></g>`;
  }
  function sleepIn(g) {
    const f = g === 'f', hc = '#2B2626';
    const hd = `<g transform="translate(58 78) scale(.9)">${f ? `<path d="M-30 -6C-36 -40 36 -40 30 -6L33 32Q0 40 -33 32Z" fill="${hc}"/>` : ''}<circle r="26" fill="${SK}"/><path d="M-27 -2C-30 -34 -10 -36 0 -36C12 -36 30 -34 27 -2C22 -14 12 -20 0 -20C-12 -20 -22 -14 -27 -2Z" fill="${hc}"/><g class="e-cl"><path d="M-15 4Q-10 9 -5 4M5 4Q10 9 15 4" stroke="${hc}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g><g class="e-op"><circle cx="-10" cy="3" r="4" fill="${hc}"/><circle cx="10" cy="3" r="4" fill="${hc}"/></g><circle cx="-17" cy="12" r="4" fill="#FFB5B5" opacity=".6"/><circle cx="17" cy="12" r="4" fill="#FFB5B5" opacity=".6"/><path d="M-5 14Q0 18 5 14" stroke="#B5655A" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
    return '<path d="M176 12a14 14 0 1 0 8 24a11 11 0 1 1-8-24z" fill="#F6D365"/><text class="k-twinkle" x="20" y="30" font-size="14" fill="#F6D365">✦</text><text class="k-twinkle" style="animation-delay:.6s" x="130" y="40" font-size="12" fill="#F6D365">✦</text>'
      + '<rect x="12" y="104" width="176" height="14" rx="5" fill="#B8977A"/><rect x="16" y="118" width="6" height="22" fill="#B8977A"/><rect x="178" y="118" width="6" height="22" fill="#B8977A"/><rect x="26" y="86" width="60" height="22" rx="11" fill="#fff" stroke="#eee"/>'
      + '<g class="k-roll">' + hd + '<rect x="44" y="96" width="140" height="22" rx="14" fill="#BFD7F2"/><rect x="44" y="106" width="140" height="6" fill="#A6C6EB"/></g>'
      + '<rect x="150" y="84" width="34" height="20" rx="3" fill="#C9A98B"/><circle cx="160" cy="80" r="5" fill="none" stroke="#4A423D" stroke-width="1.5"/><circle cx="172" cy="80" r="5" fill="none" stroke="#4A423D" stroke-width="1.5"/>';
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
    else if (k.startsWith('plane')) o = `<g class="k-wave" opacity=".8"><ellipse cx="34" cy="26" rx="18" ry="7" fill="#fff"/><ellipse cx="150" cy="124" rx="22" ry="8" fill="#fff"/></g><g transform="rotate(${k === 'plane-arr' ? 7 : -7} 100 75)"><g class="k-bob"><polygon points="95,64 120,38 136,38 118,66" fill="#d9d2ca"/><ellipse cx="100" cy="75" rx="70" ry="22" fill="#fff" stroke="#d9d2ca"/><polygon points="40,70 24,40 52,40 62,68" fill="#E09F9F"/><polygon points="95,85 142,120 118,120 78,86" fill="#E8E1DA"/><rect x="44" y="82" width="116" height="5" fill="#A0C4E3"/><circle cx="78" cy="72" r="5" fill="#CDEBFF"/><circle cx="96" cy="72" r="5" fill="#CDEBFF"/>${win(g, 126, 72)}</g></g>`;
    else if (k === 'train' || k === 'shinkansen') { const sn = k === 'shinkansen'; o = road(121) + '<g class="k-bob">' + (sn ? '<path d="M20 108V74Q20 54 42 54H128Q160 54 184 98L186 108Z" fill="#fff" stroke="#d9d2ca"/>' : '<rect x="20" y="54" width="164" height="54" rx="14" fill="#8CC7A1"/>') + `<rect x="20" y="92" width="166" height="6" fill="${sn ? '#4F86C6' : '#F6D365'}"/>` + rects([34, 60, 86], 66, 20, 16) + win(g, 124, 74) + '</g>' + wh(50, 112, 8) + wh(100, 112, 8) + wh(150, 112, 8); }
    else if (k === 'bus' || k === 'coach') o = road(124) + `<g class="k-bob"><rect x="24" y="50" width="152" height="60" rx="10" fill="${k === 'bus' ? '#F6D365' : '#C3B5E8'}"/>${rects([34, 62, 90], 62, 22, 18)}${win(g, 140, 70)}<rect x="24" y="90" width="152" height="5" fill="rgba(255,255,255,.6)"/></g>` + wh(56, 112, 10) + wh(144, 112, 10);
    else if (k === 'car') o = road(132) + `<g class="k-bob"><path d="M62 84L78 54H128L146 84Z" fill="#E7A8A8"/><rect x="30" y="82" width="140" height="34" rx="12" fill="#E09F9F"/>${win(g, 102, 70)}<circle cx="166" cy="94" r="4" fill="#F6D365"/></g>` + wh(62, 118, 11) + wh(140, 118, 11);
    else if (k === 'boat') o = '<g class="k-bob"><rect x="70" y="72" width="60" height="28" rx="6" fill="#fff" stroke="#d9d2ca"/><rect x="98" y="52" width="4" height="20" fill="#a9754f"/><polygon points="102,52 122,58 102,64" fill="#E09F9F"/>' + win(g, 100, 86) + '<path d="M24 100H176L158 128H44Z" fill="#E8A87C"/></g><path class="k-wave" d="M-26 132q13-8 26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0" stroke="#A0C4E3" stroke-width="3" fill="none"/>';
    else if (k === 'cruise') o = '<g class="k-bob"><rect x="92" y="38" width="16" height="22" fill="#E09F9F"/><rect x="58" y="58" width="84" height="20" rx="4" fill="#fff" stroke="#d9d2ca"/><rect x="40" y="78" width="120" height="20" rx="4" fill="#F2F6F9" stroke="#d9d2ca"/>' + win(g, 100, 69) + '<circle cx="56" cy="88" r="4" fill="#CDEBFF"/><circle cx="76" cy="88" r="4" fill="#CDEBFF"/><circle cx="124" cy="88" r="4" fill="#CDEBFF"/><circle cx="144" cy="88" r="4" fill="#CDEBFF"/><path d="M14 98H186L164 128H36Z" fill="#fff" stroke="#d9d2ca"/><rect x="26" y="108" width="148" height="5" fill="#A0C4E3"/></g><path class="k-wave" d="M-26 134q13-8 26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0t26 0" stroke="#A0C4E3" stroke-width="3" fill="none"/>';
    else o = road(140) + head(g, 80, 48, 1) + '<rect x="62" y="74" width="36" height="38" rx="12" fill="' + s + '"/><rect class="k-leg" x="68" y="110" width="9" height="26" rx="4" fill="#7A6A5E"/><rect class="k-leg" style="animation-direction:alternate-reverse" x="84" y="110" width="9" height="26" rx="4" fill="#7A6A5E"/>' + arm(94, 88, 120, 108) + '<g class="k-bob"><rect x="116" y="108" width="30" height="24" rx="5" fill="#E8A87C"/><rect x="126" y="102" width="10" height="6" rx="3" fill="#a9754f"/></g>' + wh(122, 136, 4) + wh(140, 136, 4);
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
    const fl = info.flights.map((f, i) => `<div class="info-card"><div class="fl-row"><div><b>${esc(f.dep)}</b><small>${esc(f.depT)}</small></div><div class="fl-mid">✈️<small>${esc(f.no)}</small></div><div><b>${esc(f.arr)}</b><small>${esc(f.arrT)}</small></div></div><small class="muted">${esc(f.date)}</small>${f.bag ? `<div class="bag">🧳 託運：${esc(f.bag)}</div>` : ''}${f.carry ? `<div class="bag">🎒 手提：${esc(f.carry)}</div>` : ''}${ed('flights', i)}</div>`).join('');
    const ht = info.hotels.map((h, i) => `<div class="info-card">${h.img ? `<img class="evt-img" src="${esc(h.img)}" onerror="this.remove()">` : ''}<b>${esc(h.name)}</b><div class="muted">📅 ${esc(h.in)} → ${esc(h.out)}</div>${h.note ? `<div class="bag">${esc(h.note)}</div>` : ''}<a class="route-btn" style="margin:10px 0 0" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.map || h.name)}">🗺️ 地圖</a>${ed('hotels', i)}</div>`).join('');
    const nt = info.notes.map((n, i) => `<details class="info-card"><summary>${esc(n.title)}</summary><div class="bag">${esc(n.body)}</div>${ed('notes', i)}</details>`).join('');
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
  function saveVote(pid, o) { (votes[me] = votes[me] || {})[pid] = o; if (window.__pushVote) window.__pushVote(pid, o); }
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
