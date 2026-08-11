
// ═══════════════════════════════════════════════════════════════════════
// RÖPLABDA MECCS ELEMZŐ — application logic (rendering, storage, UI wiring)
// Depends on engine.js functions being loaded first (same global scope).
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'rv_meccs_elemzo_matches_v1';
const GRADE_LEGEND = '<span class="gl"><b style="color:#ffc840">#</b> Kiváló</span> <span class="gl"><b style="color:#4ade80">+</b> Pozitív</span> <span class="gl"><b>!</b> Közepes</span> <span class="gl"><b>/</b> Átpattanó</span> <span class="gl"><b style="color:#fb923c">-</b> Negatív</span> <span class="gl"><b style="color:#ff6b7a">=</b> Hiba</span>';

const TECH_LABELS = {H:'Erős', P:'Pörgetett', T:'Ejtés', M:'Közepes', O:'Egyéb', Q:'Quick', F:'Fault'};
// Fixed starting zone per attack code, from the Data Volley 4 "Attack Combinations"
// table (official documentation). Zones 2/3/4 = front row; 7/8/9 = back-row
// takeoff points (7≈behind zone 4, 8=Pipe/behind zone 3, 9≈behind zone 2).
// Start zones now come from each .dvw file's own [3ATTACKCOMBINATION] table
// (see parseAttackCombinations in engine.js), because every statistician
// codes differently — V5 is zone 4 for one scout, 7 for another, 8 for a
// third. These are just the display labels, in coach language.
// DataVolley back-row take-off zones: 7 = behind 4 (pos 5), 8 = pipe
// (pos 6), 9 = behind 2 (pos 1).
const START_ZONE_LABEL = {4:'4-es hely', 3:'3-as hely', 2:'2-es hely',
                          8:'Pipe (6-os hely)', 7:'5-ös hely', 9:'1-es hely'};
const START_ZONE_SHORT = {4:'4', 3:'3', 2:'2', 8:'6', 7:'5', 9:'1'};
const START_ZONE_ORDER = [4,3,2,8,7,9];
const TEMPO_LABEL = {fast:'Gyors labda', high:'Magas labda', other:'Egyéb'};

const COMBO_COLORS = {
  '4-es hely':'#f0a500', '2-es hely':'#e63946', '1-es hely':'#fb923c',
  '5-ös hely':'#2ec4b6', 'Pipe (6-os hely)':'#818cf8', '3-as hely':'#c084fc',
  'Feladó támadás':'#f472b6', 'Egyéb':'#8899aa',
};
// combo group -> {startPos (own court position 1-6), frac (0..1 landing x on opp court)}
const COMBO_GEOM = {
  '4-es hely':        {pos:4, frac:0.72},
  '2-es hely':        {pos:2, frac:0.28},
  '1-es hely':        {pos:1, frac:0.87},
  '5-ös hely':        {pos:5, frac:0.13},
  'Pipe (6-os hely)': {pos:6, frac:0.50},
  '3-as hely':        {pos:3, frac:0.55},
  'Feladó támadás':   {pos:3, frac:0.58},
  'Egyéb':            {pos:3, frac:0.50},
};
const ROLE_DEFAULT_POS = {'Szélső ütő':4, 'Átló':2, 'Center':3, 'Feladó':3, 'Libero':6};

function radarChartSVG(axes, W, H){
  W = W || 320; H = H || 320;
  const cx = W/2, cy = H/2 - 8;
  const maxR = Math.min(W,H)/2 - 62;
  const n = axes.length;
  const angleFor = i => -Math.PI/2 + i*(2*Math.PI/n);

  let s = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;display:block;margin:0 auto">`];
  s.push(`<rect width="${W}" height="${H}" fill="#07111d" rx="8"/>`);

  [20,40,60,80,100].forEach(level=>{
    const r = maxR*level/100;
    const pts = [];
    for (let i=0;i<n;i++){ const a=angleFor(i); pts.push(`${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`); }
    s.push(`<polygon points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,${level===100?0.16:0.06})" stroke-width="1"/>`);
  });

  axes.forEach((ax,i)=>{
    const a = angleFor(i);
    const x2 = cx+maxR*Math.cos(a), y2 = cy+maxR*Math.sin(a);
    s.push(`<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`);
    const lx = cx+(maxR+30)*Math.cos(a), ly = cy+(maxR+30)*Math.sin(a);
    const anchor = Math.abs(Math.cos(a))<0.25 ? 'middle' : (Math.cos(a)>0?'start':'end');
    s.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" fill="#dde8f4" font-size="10.5" font-family="Arial" font-weight="700">${escHtml(ax.label)}</text>`);
    s.push(`<text x="${lx.toFixed(1)}" y="${(ly+14).toFixed(1)}" text-anchor="${anchor}" fill="#f0a500" font-size="13" font-family="Arial" font-weight="900">${Math.round(ax.score)}</text>`);
  });

  const dataPts = axes.map((ax,i)=>{
    const a = angleFor(i);
    const r = maxR*Math.max(2,Math.min(100,ax.score))/100;
    return [cx+r*Math.cos(a), cy+r*Math.sin(a)];
  });
  s.push(`<polygon points="${dataPts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}" fill="rgba(240,165,0,0.26)" stroke="#f0a500" stroke-width="2.5"/>`);
  dataPts.forEach(p=>{ s.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#ffc840" stroke="#07111d" stroke-width="1.5"/>`); });

  s.push('</svg>');
  return s.join('\n');
}

function computeRadarScores(stats){
  // Scales are calibrated against the real spread measured across the loaded
  // teams, so the five axes are comparable to each other instead of one of
  // them always sitting on the floor.
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const scale=(v,lo,hi)=>clamp((v-lo)/(hi-lo)*100,0,100);

  let atkTot=0, atkKill=0, atkErr=0, atkBlk=0;
  Object.values(stats.attack).forEach(a=>{ atkTot+=a.total; atkKill+=(a.grades['#']||0); atkErr+=(a.grades['=']||0); atkBlk+=(a.grades['/']||0); });
  const atkEff = atkTot? 100*(atkKill-atkErr-atkBlk)/atkTot : 0;

  let recvTot=0, recvGood=0, recvErr=0;
  Object.values(stats.recv).forEach(r=>{ recvTot+=r.total; recvGood+=(r.grades['#']||0)+(r.grades['+']||0); recvErr+=(r.grades['=']||0); });
  const recvQ = recvTot? (100*recvGood/recvTot - 100*recvErr/recvTot) : 0;

  let servTot=0, servAce=0, servErr=0;
  Object.values(stats.serve).forEach(sv=>{ servTot+=sv.total; servAce+=(sv.grades['#']||0); servErr+=(sv.grades['=']||0); });
  const acePct = servTot? 100*servAce/servTot : 0;
  const servErrPct = servTot? 100*servErr/servTot : 0;
  const servScore = acePct - servErrPct/3;   // aggressive but not reckless

  // Block: kills PER SET is the meaningful volleyball metric. Raw block
  // "efficiency" is negative for every team (most touches aren't points),
  // which made this axis useless.
  let blkKill=0, blkTot=0;
  Object.values(stats.block).forEach(b=>{ blkTot+=b.total; blkKill+=(b.grades['#']||0); });
  let setCount=0; stats.matches.forEach(m=>{ setCount += (m.sets&&m.sets.length) ? m.sets.length : 0; });
  const blkPerSet = setCount ? blkKill/setCount : 0;

  const comboTotals = {};
  Object.values(stats.setterFB).forEach(byRot=>{
    Object.values(byRot).forEach(byGrade=>{
      Object.values(byGrade).forEach(combos=>{
        Object.entries(combos).forEach(([g,n])=>{ comboTotals[g]=(comboTotals[g]||0)+n; });
      });
    });
  });
  const fbTotal = Object.values(comboTotals).reduce((a,b)=>a+b,0);
  const numGroups = Object.keys(comboTotals).length || 1;
  let entropy = 0;
  if (fbTotal>0) Object.values(comboTotals).forEach(n=>{ const p=n/fbTotal; if (p>0) entropy -= p*Math.log2(p); });
  const maxEntropy = Math.log2(Math.max(2,numGroups));
  const setterScore = maxEntropy>0 ? clamp(100*entropy/maxEntropy,0,100) : 50;

  return {
    axes: [
      {label:'Ütés',    score: scale(atkEff,10,45),     n: atkTot,  hint: `${Math.round(atkEff)}% eff.`},
      {label:'Fogadás', score: scale(recvQ,15,65),      n: recvTot, hint: `${Math.round(recvQ)} pont`},
      {label:'Nyitás',  score: scale(servScore,-6,14),  n: servTot, hint: `${acePct.toFixed(1)}% ász / ${servErrPct.toFixed(0)}% hiba`},
      {label:'Blokk',   score: scale(blkPerSet,0.8,4.5),n: blkKill, hint: `${blkPerSet.toFixed(1)} blokkpont/szett`},
      {label:'Feladó',  score: setterScore,             n: fbTotal, hint: `${numGroups} irány`},
    ],
    sampleWarning: [atkTot, recvTot, servTot, blkTot, fbTotal].some(n=>n<15),
  };
}

function titleCaseName(name){
  if (!name) return name;
  return name.split(' ').map(w=>{
    if (!w) return w;
    return w.split('-').map(part => part ? part.charAt(0).toUpperCase()+part.slice(1).toLowerCase() : part).join('-');
  }).join(' ');
}

// Some .dvw files carry no match date. The coach can type one in on the upload
// tab; it is stored per filename and used everywhere the file's own date would
// have been, so sorting and the season range stay correct.
let MANUAL_DATES = {};
function loadManualDates(){
  try{ MANUAL_DATES = JSON.parse(localStorage.getItem('rv_manual_dates')||'{}'); }catch(e){ MANUAL_DATES = {}; }
}
function saveManualDates(){
  try{ localStorage.setItem('rv_manual_dates', JSON.stringify(MANUAL_DATES)); }catch(e){}
}
function hasRealDate(d){ return !!(d && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d.trim())); }
// Accepts what a Hungarian coach would type: 2026.03.14, 2026-03-14 or 2026/03/14
function normalizeTypedDate(v){
  const m = (v||'').trim().match(/^(\d{4})[.\-\/\s]+(\d{1,2})[.\-\/\s]+(\d{1,2})\.?$/);
  if (!m) return null;
  const y=+m[1], mo=+m[2], d=+m[3];
  if (mo<1||mo>12||d<1||d>31) return null;
  return `${mo}/${d}/${y}`;
}
function setManualDate(filename, value){
  const norm = normalizeTypedDate(value);
  if (!norm){ alert('Add meg a dátumot ÉÉÉÉ.HH.NN formában, például 2026.03.14'); return; }
  MANUAL_DATES[filename] = norm;
  saveManualDates();
  renderUploadTab();
  rebuildTeamSelector();
}
function clearManualDate(filename){
  delete MANUAL_DATES[filename];
  saveManualDates();
  renderUploadTab();
  rebuildTeamSelector();
}

// Wrap the engine's parser once, so a manually entered date reaches every
// consumer — the match list, the match picker, the season range on the
// overview, and the per-match rows inside computeTeamStats — instead of only
// the upload screen.
if (typeof parseMatchMeta === 'function' && !parseMatchMeta.__manualPatched){
  const originalParseMatchMeta = parseMatchMeta;
  parseMatchMeta = function(rawText, filename){
    const meta = originalParseMatchMeta(rawText, filename);
    if (meta && !hasRealDate(meta.date) && MANUAL_DATES[filename]){
      meta.date = MANUAL_DATES[filename];
      meta.dateIsManual = true;
    }
    return meta;
  };
  parseMatchMeta.__manualPatched = true;
}

function parseDateMDY(s){
  const p = (s||'').split('/');
  if (p.length===3){
    const mm=parseInt(p[0],10), dd=parseInt(p[1],10), yyyy=parseInt(p[2],10);
    if (!isNaN(mm) && !isNaN(dd) && !isNaN(yyyy)) return new Date(yyyy, mm-1, dd);
  }
  return new Date(0);
}
function formatDateHu(s){
  const p = (s||'').split('/');
  if (p.length===3) return `${p[2]}.${p[0]}.${p[1]}`;
  return s || '';
}

// ═══════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════

let APP_MATCHES = []; // [{filename, rawText, addedAt}]

function loadMatchesFromStorage(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw){
      APP_MATCHES = JSON.parse(raw);
      return true;
    }
  }catch(e){ console.warn('Storage read failed', e); }
  return false;
}

function saveMatchesToStorage(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(APP_MATCHES));
    return true;
  }catch(e){
    console.warn('Storage write failed', e);
    showStorageWarning();
    return false;
  }
}

function showStorageWarning(){
  const el = document.getElementById('storage-warning');
  if (el) el.style.display = 'flex';
}

function seedEmbeddedMatchesIfEmpty(){
  if (APP_MATCHES.length>0) return;
  if (typeof EMBEDDED_DVW === 'undefined') return;
  Object.entries(EMBEDDED_DVW).forEach(([filename, b64])=>{
    try{
      const bytes = b64ToBytes(b64);
      const rawText = decodeDVWBytes(bytes);
      APP_MATCHES.push({filename, rawText, addedAt: Date.now()});
    }catch(e){ console.warn('Seed failed for', filename, e); }
  });
  saveMatchesToStorage();
}

function b64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ═══════════════════════════════════════════════════════════════════════
// CLOUD SYNC (Firebase Realtime Database)
// ═══════════════════════════════════════════════════════════════════════
// To enable shared/cloud sync so every teammate sees the same uploaded
// matches: create a free Firebase project (console.firebase.google.com),
// enable Realtime Database, and paste your config values below.
// Leave the placeholders as-is to run in local-only mode (each browser
// keeps its own separate match list).

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCOzyS5znUzAPcYhBInnfSvgEHdv9C7oXs",
  databaseURL: "https://roplabda-elemzo-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "roplabda-elemzo",
};
const FIREBASE_ENABLED = !!(FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('PASTE_')
  && FIREBASE_CONFIG.databaseURL && !FIREBASE_CONFIG.databaseURL.startsWith('PASTE_'));

let fbDb = null;
let cloudSyncStatus = 'disabled'; // disabled | connecting | synced | error
let cloudBootstrapped = false;
let firebaseAppInitialized = false;

function sanitizeFbKey(filename){
  return (filename||'').replace(/[.#$\[\]\/]/g, '_');
}

function initFirebaseApp(){
  if (firebaseAppInitialized) return true;
  if (!FIREBASE_ENABLED || typeof firebase === 'undefined') return false;
  try{
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    firebaseAppInitialized = true;
    return true;
  }catch(e){
    console.warn('Firebase app init failed', e);
    return false;
  }
}

function initCloudSync(){
  if (!FIREBASE_ENABLED){ cloudSyncStatus='disabled'; updateSyncIndicator(); return; }
  if (typeof firebase === 'undefined' || !initFirebaseApp()){ cloudSyncStatus='error'; updateSyncIndicator(); return; }
  try{
    fbDb = firebase.database();
    cloudSyncStatus = 'connecting';
    updateSyncIndicator();

    fbDb.ref('matches').on('value', (snapshot)=>{
      cloudSyncStatus = 'synced';
      const data = snapshot.val() || {};
      const cloudMatches = Object.values(data)
        .filter(m=>m && m.filename && m.rawText)
        .map(m=>({filename:m.filename, rawText:m.rawText, addedAt:m.addedAt||0}));

      if (cloudMatches.length===0 && !cloudBootstrapped){
        // Cloud is empty (first-ever run for this project) — bootstrap it
        // with whatever we already have locally (embedded seed matches, etc).
        // Only the admin can actually write, so this silently no-ops for others.
        cloudBootstrapped = true;
        APP_MATCHES.forEach(m=>pushMatchToCloud(m));
      } else {
        APP_MATCHES = cloudMatches;
        saveMatchesToStorage(); // keep a local offline cache too
        cloudBootstrapped = true;
      }
      renderUploadTab();
      rebuildTeamSelector();
      updateSyncIndicator();
    }, (err)=>{
      console.warn('Firebase sync error', err);
      cloudSyncStatus = 'error';
      updateSyncIndicator();
    });
  }catch(e){
    console.warn('Firebase init failed', e);
    cloudSyncStatus = 'error';
    updateSyncIndicator();
  }
}

function pushMatchToCloud(match){
  if (!fbDb) return;
  const key = sanitizeFbKey(match.filename);
  fbDb.ref('matches/'+key).set({
    filename: match.filename, rawText: match.rawText, addedAt: match.addedAt||Date.now(),
  }).catch(e=>console.warn('Cloud push failed', e));
}

function removeMatchFromCloud(filename){
  if (!fbDb) return;
  fbDb.ref('matches/'+sanitizeFbKey(filename)).remove().catch(e=>console.warn('Cloud remove failed', e));
}

function updateSyncIndicator(){
  const map = {
    disabled:   ['⚪', 'Csak helyi mentés — nincs felhő-szinkron beállítva (csak ebben a böngészőben látszanak a feltöltött meccsek)', 'var(--gray)', '',     'Nincs felhő-kapcsolat (csak helyi mentés)'],
    connecting: ['🔄', 'Csatlakozás a felhőhöz…', 'var(--amber)',                                                                    'warn', 'Csatlakozás folyamatban…'],
    synced:     ['🟢', 'Élő szinkronban a csapattal — amit bárki feltölt, mindenkinél megjelenik', 'var(--green)',                    'ok',   'Élő kapcsolat a felhővel'],
    error:      ['🔴', 'Nincs kapcsolat a felhővel — átmenetileg csak helyi mentés', 'var(--red)',                                    'bad',  'Nincs kapcsolat a felhővel'],
  };
  const [icon,label,color,dotCls,dotTitle] = map[cloudSyncStatus] || map.disabled;

  const el = document.getElementById('sync-indicator');
  if (el) el.innerHTML = `<span style="color:${color};font-weight:600">${icon} ${label}</span>`;

  const dot = document.getElementById('fb-dot');
  if (dot){
    dot.className = 'fb-dot' + (dotCls ? ' '+dotCls : '');
    dot.title = dotTitle;
  }
}



// Reading every file at once and re-serialising the whole match array after
// each one is what made the browser hang around ten files: N FileReaders fire
// in parallel, then N full JSON.stringify passes over an ever-growing array.
// Now files are read one at a time with a yield between them, storage is
// written once at the end, and progress is shown while it runs.
let UPLOAD_BUSY = false;

function readFileAsMatch(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      try{ resolve({filename: file.name, rawText: decodeDVWBytes(new Uint8Array(e.target.result)), addedAt: Date.now()}); }
      catch(err){ reject(err); }
    };
    reader.onerror = () => reject(new Error('Nem sikerült beolvasni: '+file.name));
    reader.readAsArrayBuffer(file);
  });
}

function setUploadProgress(done, total, label){
  const el = document.getElementById('upload-progress');
  if (!el) return;
  if (total<=0){ el.style.display='none'; el.innerHTML=''; return; }
  const pct = Math.round(100*done/total);
  el.style.display = 'block';
  el.innerHTML = `<div class="up-bar"><div class="up-fill" style="width:${pct}%"></div></div>
    <div class="up-txt">${escHtml(label)} — ${done}/${total}</div>`;
}

async function handleFiles(fileList){
  if (UPLOAD_BUSY){ alert('Egy feltöltés még folyamatban van, várd meg a végét.'); return; }
  const files = Array.from(fileList).filter(f=>f.name.toLowerCase().endsWith('.dvw'));
  if (!files.length) return;

  UPLOAD_BUSY = true;
  const added = [], failed = [];
  try{
    for (let i=0; i<files.length; i++){
      const file = files[i];
      setUploadProgress(i, files.length, file.name);
      // Hand the frame back to the browser so the progress bar can paint and
      // the tab stays responsive on large batches.
      await new Promise(r=>setTimeout(r, 0));
      try{
        const match = await readFileAsMatch(file);
        APP_MATCHES = APP_MATCHES.filter(m=>m.filename !== match.filename);
        APP_MATCHES.push(match);
        added.push(match);
      }catch(err){
        console.warn(err);
        failed.push(file.name);
      }
    }
    setUploadProgress(files.length, files.length, 'Mentés…');
    await new Promise(r=>setTimeout(r, 0));
    saveMatchesToStorage();          // one write for the whole batch
    renderUploadTab();
    rebuildTeamSelector();
    // Cloud pushes are fire-and-forget and spaced out so a big batch doesn't
    // flood the connection.
    added.forEach((m,i)=>setTimeout(()=>pushMatchToCloud(m), i*120));
  } finally {
    UPLOAD_BUSY = false;
    setUploadProgress(0, 0, '');
    if (failed.length) alert('Nem sikerült beolvasni:\n' + failed.join('\n'));
  }
}

function deleteMatch(filename){
  const label = matchLabelFor(filename);
  if (!confirm('Biztosan törlöd ezt a meccset?\n\n' + label)) return;
  if (!confirm('Ez végleges — a felhőből is törlődik.\n\nTényleg törlöd?')) return;
  APP_MATCHES = APP_MATCHES.filter(m=>m.filename!==filename);
  MATCH_SELECTION.delete(filename);
  saveMatchesToStorage();
  renderUploadTab();
  rebuildTeamSelector();
  removeMatchFromCloud(filename);
}

// ── bulk selection on the upload list ────────────────────────────────────
let MATCH_SELECTION = new Set();

function matchLabelFor(filename){
  const m = APP_MATCHES.find(x=>x.filename===filename);
  if (!m) return filename;
  try{
    const meta = parseMatchMeta(m.rawText, m.filename);
    return `${formatDateHu(meta.date)} — ${meta.homeName} – ${meta.awayName}`;
  }catch(e){ return filename; }
}

function toggleMatchSelect(filename, checked){
  if (checked) MATCH_SELECTION.add(filename); else MATCH_SELECTION.delete(filename);
  updateBulkBar();
}

function toggleSelectAllMatches(checked){
  MATCH_SELECTION = checked ? new Set(APP_MATCHES.map(m=>m.filename)) : new Set();
  document.querySelectorAll('.mr-check').forEach(cb=>{ cb.checked = checked; });
  updateBulkBar();
}

function updateBulkBar(){
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  const n = MATCH_SELECTION.size;
  bar.style.display = n ? 'flex' : 'none';
  const cnt = document.getElementById('bulk-count');
  if (cnt) cnt.textContent = n + (n===1 ? ' meccs kijelölve' : ' meccs kijelölve');
  const all = document.getElementById('select-all-matches');
  if (all) all.checked = n>0 && n===APP_MATCHES.length;
}

function deleteSelectedMatches(){
  const names = [...MATCH_SELECTION].filter(f=>APP_MATCHES.some(m=>m.filename===f));
  if (!names.length) return;
  const list = names.slice(0,8).map(f=>'· '+matchLabelFor(f)).join('\n')
             + (names.length>8 ? `\n· …és további ${names.length-8}` : '');
  if (!confirm(`${names.length} meccset törölsz:\n\n${list}`)) return;
  if (!confirm('Ez végleges — a felhőből is törlődnek.\n\nTényleg törlöd mind a ' + names.length + ' meccset?')) return;
  const del = new Set(names);
  APP_MATCHES = APP_MATCHES.filter(m=>!del.has(m.filename));
  MATCH_SELECTION = new Set();
  saveMatchesToStorage();
  renderUploadTab();
  rebuildTeamSelector();
  names.forEach(f=>removeMatchFromCloud(f));
}

function renderUploadTab(){
  const countEl = document.getElementById('match-count');
  const listEl = document.getElementById('match-list');
  if (!listEl) return;

  countEl.textContent = APP_MATCHES.length;

  MATCH_SELECTION = new Set([...MATCH_SELECTION].filter(f=>APP_MATCHES.some(m=>m.filename===f)));

  if (APP_MATCHES.length===0){
    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray);font-size:.85rem">Még nincs betöltött meccs. Húzz ide .dvw fájlokat, vagy tallózz.</div>';
    updateBulkBar();
    return;
  }

  // Parse light metadata for each match for display
  const rows = APP_MATCHES.map(m=>{
    let meta;
    try{ meta = parseMatchMeta(m.rawText, m.filename); }
    catch(e){ meta = {date:'?', homeName:m.filename, awayName:'', sets:[], homeSets:0, awaySets:0, comp:''}; }
    const fromFile = hasRealDate(meta.date) && !meta.dateIsManual;
    const manual = meta.dateIsManual ? meta.date : null;
    return {filename: m.filename, meta, fromFile, manual};
  });

  rows.sort((a,b)=> parseDateMDY(a.manual || a.meta.date) - parseDateMDY(b.manual || b.meta.date));

  listEl.innerHTML = rows.map(r=>{
    const m = r.meta;
    const setsStr = m.sets.join(' · ');
    const resultStr = `${m.homeSets} : ${m.awaySets}`;
    const comp = m.comp || 'Bajnoki mérkőzés';
    const f = escAttr(r.filename);
    let dateCell;
    if (r.fromFile){
      dateCell = `<div class="mr-date">${formatDateHu(m.date)}</div>`;
    } else if (r.manual){
      dateCell = `<div class="mr-date mr-date-manual" title="Kézzel megadott dátum">${formatDateHu(r.manual)}
        <button class="mr-date-clear" onclick="clearManualDate('${f}')" title="Dátum törlése">×</button></div>`;
    } else {
      dateCell = `<div class="mr-date"><input class="mr-date-in" type="text" placeholder="ÉÉÉÉ.HH.NN"
        onchange="setManualDate('${f}', this.value)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></div>`;
    }
    return `<div class="match-row${r.fromFile?'':' no-date'}">
      <input type="checkbox" class="mr-check" ${MATCH_SELECTION.has(r.filename)?'checked':''}
        onchange="toggleMatchSelect('${f}', this.checked)" title="Kijelölés">
      ${dateCell}
      <div class="mr-match"><b>${escHtml(m.homeName)}</b> – ${escHtml(m.awayName)}</div>
      <div class="mr-result">${resultStr} <span class="mr-sets">(${setsStr})</span></div>
      <div class="mr-comp">${escHtml(comp)}</div>
      <button class="mr-del" onclick="deleteMatch('${f}')" title="Törlés">×</button>
    </div>`;
  }).join('');

  updateBulkBar();
}

function escHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escAttr(s){ return (s||'').replace(/'/g,"\\'"); }

// ═══════════════════════════════════════════════════════════════════════
// TEAM SELECTOR
// ═══════════════════════════════════════════════════════════════════════

let CURRENT_TEAM = null;
let CURRENT_STATS = null;
let TEAM_MATCH_FILENAMES = [];         // all match filenames belonging to CURRENT_TEAM
let SELECTED_MATCH_FILENAMES = new Set(); // currently selected subset (default: all)

function rebuildTeamSelector(){
  const sel = document.getElementById('team-select');
  const teams = getAllTeamsFromMatches(APP_MATCHES);
  const prevValue = CURRENT_TEAM;

  sel.innerHTML = teams.length
    ? teams.map(t=>`<option value="${escAttr(t)}">${escHtml(t)}</option>`).join('')
    : '<option value="">— nincs csapat —</option>';

  if (teams.length===0){
    CURRENT_TEAM = null; CURRENT_STATS = null; TEAM_MATCH_FILENAMES = []; SELECTED_MATCH_FILENAMES = new Set();
    document.getElementById('match-picker-wrap').style.display = 'none';
    renderAllDataTabs();
    return;
  }

  // Keep previous selection if still valid, else pick first
  const toSelect = (prevValue && teams.includes(prevValue)) ? prevValue : teams[0];
  sel.value = toSelect;
  onTeamChange(toSelect);
}

function onTeamChange(teamName){
  CURRENT_TEAM = teamName;
  if (!teamName){
    CURRENT_STATS = null; TEAM_MATCH_FILENAMES = []; SELECTED_MATCH_FILENAMES = new Set();
    document.getElementById('match-picker-wrap').style.display = 'none';
    renderAllDataTabs();
    return;
  }

  // Determine which loaded matches actually involve this team
  TEAM_MATCH_FILENAMES = APP_MATCHES
    .filter(m => { try { return !!findTeamPrefix(m.rawText, teamName); } catch(e){ return false; } })
    .map(m => m.filename);
  // Default: every match for this team is selected
  SELECTED_MATCH_FILENAMES = new Set(TEAM_MATCH_FILENAMES);

  document.getElementById('match-picker-wrap').style.display = TEAM_MATCH_FILENAMES.length ? 'flex' : 'none';
  renderMatchPicker();
  recomputeAndRenderStats();
}

function getSortedTeamMatches(){
  return TEAM_MATCH_FILENAMES.map(fn=>{
    const m = APP_MATCHES.find(x=>x.filename===fn);
    let meta;
    try { meta = parseMatchMeta(m.rawText, fn); }
    catch(e){ meta = {date:'', homeName:fn, awayName:''}; }
    return {filename: fn, meta};
  }).sort((a,b)=> parseDateMDY(b.meta.date) - parseDateMDY(a.meta.date)); // most recent first
}

function renderMatchPicker(){
  const btn = document.getElementById('match-picker-btn');
  const panel = document.getElementById('match-picker-panel');
  if (!btn || !panel) return;

  const total = TEAM_MATCH_FILENAMES.length;
  const selectedCount = SELECTED_MATCH_FILENAMES.size;
  const allSelected = selectedCount === total;

  btn.textContent = allSelected ? `Minden meccs (${total})` : `${selectedCount} / ${total} meccs kiválasztva`;
  btn.classList.toggle('filtered', !allSelected);

  const sortedMatches = getSortedTeamMatches();

  let html = `<div class="mp-actions">
    <button class="mp-preset" onclick="selectAllMatches()">Minden meccs</button>
    ${total>=3 ? `<button class="mp-preset" onclick="selectLastN(3)">Utolsó 3</button>` : ''}
    ${total>=5 ? `<button class="mp-preset" onclick="selectLastN(5)">Utolsó 5</button>` : ''}
    ${total>=10 ? `<button class="mp-preset" onclick="selectLastN(10)">Utolsó 10</button>` : ''}
  </div><div class="mp-list">`;
  sortedMatches.forEach(({filename, meta})=>{
    const checked = SELECTED_MATCH_FILENAMES.has(filename) ? 'checked' : '';
    const opponentLabel = meta.homeName && meta.awayName ? `${meta.homeName} – ${meta.awayName}` : filename;
    html += `<label class="mp-item">
      <input type="checkbox" ${checked} onchange="onMatchCheckboxChange('${escAttr(filename)}', this.checked)">
      <span class="mp-date">${formatDateHu(meta.date)}</span>
      <span>${escHtml(opponentLabel)}</span>
    </label>`;
  });
  html += `</div>`;
  panel.innerHTML = html;
}

function onMatchCheckboxChange(filename, isChecked){
  if (isChecked) SELECTED_MATCH_FILENAMES.add(filename);
  else SELECTED_MATCH_FILENAMES.delete(filename);
  renderMatchPicker();
  recomputeAndRenderStats();
}

function selectAllMatches(){
  SELECTED_MATCH_FILENAMES = new Set(TEAM_MATCH_FILENAMES);
  renderMatchPicker();
  recomputeAndRenderStats();
}

function selectLastN(n){
  const sorted = getSortedTeamMatches(); // most recent first
  SELECTED_MATCH_FILENAMES = new Set(sorted.slice(0, n).map(x=>x.filename));
  renderMatchPicker();
  recomputeAndRenderStats();
}

function toggleMatchPicker(evt){
  if (evt) evt.stopPropagation();
  const panel = document.getElementById('match-picker-panel');
  panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}

document.addEventListener('click', (e)=>{
  const wrap = document.getElementById('match-picker-wrap');
  const panel = document.getElementById('match-picker-panel');
  if (!wrap || !panel || panel.style.display==='none') return;
  if (!wrap.contains(e.target)) panel.style.display = 'none';
});

function recomputeAndRenderStats(){
  if (!CURRENT_TEAM || SELECTED_MATCH_FILENAMES.size===0){
    CURRENT_STATS = null;
    renderAllDataTabs();
    return;
  }
  const filteredMatches = APP_MATCHES.filter(m => SELECTED_MATCH_FILENAMES.has(m.filename));
  CURRENT_STATS = computeTeamStats(filteredMatches, CURRENT_TEAM);
  refinePlayerRoles(CURRENT_STATS);
  renderAllDataTabs();
}

// The file's role_code field reliably distinguishes Libero(1) and Feladó(5),
// but the OH/Opposite/Middle distinction (codes 2,3,4,6) is entered inconsistently
// across different teams/scouts. Attack landing pattern is a much stronger signal:
// dominant 4-es hely -> Szélső ütő, dominant 2-es/1-es hely -> Átló, dominant Quick -> Center.
function refinePlayerRoles(stats){
  Object.entries(stats.players).forEach(([j,p])=>{
    // The .dvw role code is trustworthy: across every loaded file, code 2
    // players do the receiving, code 4 players do the blocking and almost no
    // receiving, code 5 does the setting. Only fill in players whose file
    // record has no role code at all.
    if (p.roleCode) return;
    const set = stats.setActions[j]||0;
    const rec = (stats.recv[j]||{}).total||0;
    const atk = (stats.attack[j]||{}).total||0;
    const blk = (stats.block[j]||{}).total||0;
    if (set>=8 && atk<set) p.role = 'Feladó';
    else if (rec>=6 && atk===0) p.role = 'Libero';
    else if (atk>=8 && rec>=6) p.role = 'Szélső ütő';
    else if (atk>=6 && blk>atk*0.4) p.role = 'Center';
    else if (atk>=6) p.role = 'Átló';
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════

function showTab(id, btn){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo(0,0);
}

function showAtkPlayer(pid){
  document.querySelectorAll('.atk-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.atk-btn').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('atk-panel-'+pid);
  if (panel) panel.classList.add('active');
  const btn = document.getElementById('atk-btn-'+pid);
  if (btn) btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════════
// SVG COURT GENERATORS
// ═══════════════════════════════════════════════════════════════════════

const POSITION_COLORS = {2:'#e63946', 3:'#818cf8', 4:'#2ec4b6', 7:'#fb923c', 8:'#c084fc', 9:'#f0a500'};

// Visual style per attack grade, modeled after the Data Volley 4 Direction
// Chart: color/dash pattern + the grade symbol shown at the line's end.
const GRADE_STYLE = {
  '#': {color:'#f5f5f5', dash:'0',   w:1.8},  // kill — thick white
  '+': {color:'#4ade80', dash:'0',   w:1.1},  // in play, rally continues — green
  '!': {color:'#38bdf8', dash:'0',   w:1.2},  // deflected off the block, still live — blue, rebounds at the net
  '-': {color:'#fb923c', dash:'3,2', w:1.0},  // negative — orange dashed
  '/': {color:'#e63946', dash:'0',   w:2.2},  // stuff-blocked — thick red, rebounds at the net
  '=': {color:'#e63946', dash:'2,2', w:1.1},  // error — red dashed, drawn OUTSIDE the court
};

function buildZigzagPath(x1,y1,x2,y2,jags){
  jags = jags||5;
  const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
  const nx=-dy/len, ny=dx/len; // perpendicular unit vector
  const amp = 3.2;
  let d = `M${x1.toFixed(1)},${y1.toFixed(1)}`;
  for (let i=1;i<=jags;i++){
    const t = i/jags;
    const px = x1+dx*t, py = y1+dy*t;
    const side = (i%2===0) ? 1 : -1;
    const ox = (i===jags) ? 0 : nx*amp*side;
    const oy = (i===jags) ? 0 : ny*amp*side;
    d += ` L${(px+ox).toFixed(1)},${(py+oy).toFixed(1)}`;
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════════════
// ATTACK DIRECTION VISUALISATION
// Two modes on one court: FLOW (arrows, thickness = volume, colour =
// efficiency) and ZONES (9-zone grid, colour = volume OR efficiency).
// The grid deliberately mirrors the data's real resolution — the source
// records discrete zones, not x/y points, so a smoothed heat map would imply
// precision that does not exist.
// ═══════════════════════════════════════════════════════════════════════

// Volume uses a single-hue ramp; the red↔green axis is reserved exclusively
// for good/bad, so a colour never means two different things.
const VOL_RAMP = ['#1b2436','#3a3a2e','#6b5320','#a97112','#e0900a','#f0a500'];
function volColor(t){ return VOL_RAMP[Math.min(VOL_RAMP.length-1, Math.max(0, Math.round(t*(VOL_RAMP.length-1))))]; }
function effColor(eff){
  return eff>=0.45?'#22c55e': eff>=0.25?'#84cc16': eff>=0.05?'#eab308':
         eff>=-0.10?'#f97316':'#e63946';
}

// zone -> [col,row] on the opponent's 3x3 grid (standard DataVolley layout:
// 4/3/2 at the net, 7/8/9 mid, 5/6/1 deep)
const ZONE_GRID = {4:[0,0],3:[1,0],2:[2,0], 7:[0,1],8:[1,1],9:[2,1], 5:[0,2],6:[1,2],1:[2,2]};
const ZONE_NAME = {1:'1-es hely',2:'2-es hely',3:'3-as hely',4:'4-es hely',5:'5-ös hely',6:'6-os hely',7:'7-es (rövid)',8:'8-as (rövid)',9:'9-es (rövid)'};

function computeAttackViz(attackDetails, opts){
  const starts = opts.starts && opts.starts.size ? opts.starts : null;
  const tempos = opts.tempos && opts.tempos.size ? opts.tempos : null;
  const recvGrades = opts.recvGrades && opts.recvGrades.size ? opts.recvGrades : null;
  const outcome = opts.outcome || 'all';
  const zones = {};            // landing zone -> tallies
  const dirs = {};             // "start-zone" -> tallies
  let total = 0, kill = 0, err = 0, blocked = 0, defended = 0;
  let noZone = 0, blockContact = 0, noStart = 0, blockTouched = 0, mirrorDropped = 0;
  const techAll = {};

  Object.values(attackDetails).forEach(recs=>{
    recs.forEach(r=>{
      // Filters now work on the attack's START ZONE and SET TEMPO, both read
      // from the match file itself, instead of on scout-specific code names.
      if (starts && !starts.has(r.start)) return;
      if (tempos && !tempos.has(r.tempoGroup||'other')) return;
      // recvGrades restricts to first attacks after a reception of that
      // quality — a transition attack has no reception grade, so it drops out.
      if (recvGrades && !recvGrades.has(r.recvGrade || 'TRANS')) return;
      if (outcome==='kill' && r.grade!=='#') return;
      if (outcome==='err'  && r.grade!=='=' && r.grade!=='/') return;
      total++;
      if (r.grade==='#') kill++;
      else if (r.grade==='=') err++;
      else if (r.grade==='/') blocked++;
      else if (r.grade==='!') defended++;
      if (!r.start) noStart++;
      if (r.blockTouch) blockTouched++;
      if (r.rawZone && r.zone==null && !(r.grade==='/'||r.grade==='!')) mirrorDropped++;
      // Blocked balls (/ and !) carry a landing zone in the file, but it is
      // where the ball dropped off the block — not a target the hitter chose.
      // They stay in every count above and are reported separately below,
      // but they never draw a line on the court.
      techAll[r.subtype||'O'] = (techAll[r.subtype||'O']||0)+1;
      if (r.grade==='/' || r.grade==='!'){ blockContact++; return; }
      if (r.zone==null){ noZone++; return; }
      const z = zones[r.zone] || (zones[r.zone] = {n:0,k:0,e:0,b:0,d:0,tech:{}});
      z.n++; z.tech[r.subtype||'O'] = (z.tech[r.subtype||'O']||0)+1;
      if (r.grade==='#') z.k++; else if (r.grade==='=') z.e++;
      if (r.start){
        const key = r.start+'-'+r.zone;
        const dd = dirs[key] || (dirs[key] = {start:r.start, zone:r.zone, n:0,k:0,e:0,b:0,d:0,tech:{}});
        dd.n++; dd.tech[r.subtype||'O'] = (dd.tech[r.subtype||'O']||0)+1;
        if (r.grade==='#') dd.k++; else if (r.grade==='=') dd.e++;
      }
    });
  });

  const zoned = Object.values(zones).reduce((a,z)=>a+z.n,0);
  Object.values(zones).forEach(z=>{ z.eff = z.n ? (z.k - z.e - z.b)/z.n : 0; z.share = zoned ? z.n/zoned : 0; });
  Object.values(dirs).forEach(d=>{ d.eff = d.n ? (d.k - d.e - d.b)/d.n : 0; d.share = zoned ? d.n/zoned : 0; });

  // Predictability: 0 = spreads the ball everywhere, 100 = always the same spot
  let H = 0;
  Object.values(zones).forEach(z=>{ const p=z.share; if (p>0) H -= p*Math.log2(p); });
  const predictability = zoned ? Math.round(100*(1 - H/Math.log2(9))) : 0;

  const topZone = Object.entries(zones).sort((a,b)=>b[1].n-a[1].n)[0] || null;
  return {zones, dirs, total, kill, err, blocked, defended, zoned, noZone, blockContact,
          blockTouched, mirrorDropped, noStart, predictability, topZone, techAll,
          inPlay: total - err - blocked,
          eff: total ? (kill-err-blocked)/total : 0};
}

// Unfiltered tallies for the filter chips, so the coach can see how much
// data sits behind each button before clicking it.
function attackFilterTallies(attackDetails){
  const byStart = {}, byTempo = {fast:0, high:0, other:0}, byRecv = {};
  Object.values(attackDetails).forEach(recs=>recs.forEach(r=>{
    if (r.start) byStart[r.start] = (byStart[r.start]||0)+1;
    const g = r.tempoGroup||'other';
    byTempo[g] = (byTempo[g]||0)+1;
    const rg = r.recvGrade || 'TRANS';
    byRecv[rg] = (byRecv[rg]||0)+1;
  }));
  return {byStart, byTempo, byRecv};
}

function attackHeadline(viz, player){
  if (!viz.topZone) return 'Nincs elég adat az irányok kiértékeléséhez.';
  const [z, d] = viz.topZone;
  const pct = Math.round(100*d.share);
  // Thresholds calibrated on the real spread across every attacker in the
  // loaded matches (range 11-54, median 25), so the three labels actually
  // split the squad instead of everyone landing in one bucket.
  const label = viz.predictability>=30 ? ['KISZÁMÍTHATÓ','#e63946']
              : viz.predictability>=19 ? ['VEGYES','#f0a500']
              : ['VÁLTOZATOS','#22c55e'];
  return `<b>${pct}%</b>-ban a <b>${ZONE_NAME[z]||z}</b> felé üt, onnan <b style="color:${effColor(d.eff)}">${d.eff>=0?'+':''}${Math.round(100*d.eff)}%</b> hatékonysággal.
    <span class="atk-pred" style="color:${label[1]};border-color:${label[1]}44">● ${label[0]} (${viz.predictability}/100)</span>`;
}

function attackCourtSvg(viz, opts){
  const W=360, H=470, lm=16, cw=(W-2*lm)/3;
  const ownTop=14, netY=180, gridTop=netY+16, gridH=H-gridTop-22, rowH=gridH/3;
  const cx=[lm+cw*0.5, lm+cw*1.5, lm+cw*2.5];
  const ownPos={2:[cx[0],netY-30],3:[cx[1],netY-30],4:[cx[2],netY-30],
                9:[cx[0],ownTop+26],8:[cx[1],ownTop+26],7:[cx[2],ownTop+26]};
  const zoneCenter = z => { const g=ZONE_GRID[z]; return g ? [lm+cw*(g[0]+0.5), gridTop+rowH*(g[1]+0.5)] : null; };
  const maxZ = Math.max(1, ...Object.values(viz.zones).map(z=>z.n));
  const maxD = Math.max(1, ...Object.values(viz.dirs).map(d=>d.n));
  const sel = opts.selected;
  const selFn = opts.selectFn || 'selectAttackItem';
  let s=[`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="atk-court">`];
  s.push(`<rect width="${W}" height="${H}" fill="#070f1c" rx="10"/>`);
  s.push(`<rect x="${lm}" y="${ownTop}" width="${W-2*lm}" height="${netY-ownTop-6}" fill="#0c1b2e" rx="5" stroke="#1e3a55"/>`);
  s.push(`<text x="${lm+6}" y="${ownTop+13}" fill="rgba(255,255,255,.22)" font-size="8.5" font-family="Arial">TÁMADÓ OLDAL</text>`);

  // opponent 3x3 grid
  Object.entries(ZONE_GRID).forEach(([z,g])=>{
    const x=lm+cw*g[0], y=gridTop+rowH*g[1];
    const d=viz.zones[z];
    let fill='#0d1526';
    if (opts.mode==='zones' && d){
      fill = opts.colorBy==='eff' ? effColor(d.eff) : volColor(d.n/maxZ);
    }
    const isSel = sel && sel.type==='zone' && String(sel.zone)===String(z);
    s.push(`<rect class="atk-zone" data-z="${z}" x="${x+1.5}" y="${y+1.5}" width="${cw-3}" height="${rowH-3}" rx="4"
      fill="${fill}" fill-opacity="${opts.mode==='zones'&&d?0.85:1}" stroke="${isSel?'#fff':'#1c2942'}" stroke-width="${isSel?2:1}"
      onclick="${selFn}('zone','${z}')" style="cursor:pointer"/>`);
    s.push(`<text x="${x+cw/2}" y="${y+rowH/2-4}" text-anchor="middle" fill="rgba(255,255,255,.30)" font-size="10" font-family="Arial" pointer-events="none">${z}</text>`);
    if (d) s.push(`<text x="${x+cw/2}" y="${y+rowH/2+12}" text-anchor="middle" fill="#fff" font-size="13" font-weight="bold" font-family="Arial" pointer-events="none" stroke="#000" stroke-width="2.6" paint-order="stroke">${d.n}</text>`);
  });

  // flow arrows
  if (opts.mode==='flow'){
    const list=Object.values(viz.dirs).filter(d=>!opts.hideNoise || d.share>=0.05 || d.n>=3).sort((a,b)=>a.n-b.n);
    list.forEach(d=>{
      const from=ownPos[d.start], to=zoneCenter(d.zone);
      if(!from||!to) return;
      const t=d.n/maxD;
      const wdt=2+9*t, op=0.35+0.5*t;
      const col=effColor(d.eff);
      const mx=(from[0]+to[0])/2 + (to[0]-from[0])*0.12, my=(from[1]+to[1])/2;
      const isSel = sel && sel.type==='dir' && sel.key===d.start+'-'+d.zone;
      s.push(`<path d="M${from[0]},${from[1]} Q${mx},${my} ${to[0]},${to[1]}" fill="none"
        stroke="${col}" stroke-width="${isSel?wdt+2:wdt}" opacity="${isSel?1:op}" stroke-linecap="round"
        onclick="${selFn}('dir','${d.start}-${d.zone}')" style="cursor:pointer"/>`);
      s.push(`<circle cx="${to[0]}" cy="${to[1]}" r="${3+3*t}" fill="${col}" opacity="${op+0.15}" pointer-events="none"/>`);
    });
  }

  // net + attacker markers
  s.push(`<rect x="${lm-3}" y="${netY-4}" width="${W-2*lm+6}" height="7" fill="#f0a500" rx="2"/>`);
  const used={};
  Object.values(viz.dirs).forEach(d=>{ used[d.start]=(used[d.start]||0)+d.n; });
  Object.entries(used).forEach(([z,n])=>{
    const p=ownPos[z]; if(!p) return;
    const lbl=START_ZONE_SHORT[z]||z;
    s.push(`<circle cx="${p[0]}" cy="${p[1]}" r="15" fill="#16233c" stroke="#f0a500" stroke-width="2"/>`);
    s.push(`<text x="${p[0]}" y="${p[1]+4}" text-anchor="middle" fill="#f0a500" font-size="11" font-weight="bold" font-family="Arial">${lbl}</text>`);
  });
  s.push('</svg>');
  return s.join('');
}

function attackDetailCard(viz, sel){
  const box = (title, d) => {
    const pct = n => d.n ? Math.round(100*n/d.n)+'%' : '0%';
    return `<div class="atk-detail">
      <div class="atk-detail-h">${title}</div>
      <div class="atk-detail-grid">
        <div><span>Ütés</span><b>${d.n}</b></div>
        <div><span>Pont</span><b style="color:#f5f5f5">${d.k} · ${pct(d.k)}</b></div>
        <div><span>Hiba</span><b style="color:#e63946">${d.e} · ${pct(d.e)}</b></div>
        <div><span>Hatékonyság</span><b style="color:${effColor(d.eff)}">${d.eff>=0?'+':''}${Math.round(100*d.eff)}%</b></div>
      </div></div>`;
  };
  if (sel && sel.type==='zone' && viz.zones[sel.zone]) return box(ZONE_NAME[sel.zone]||sel.zone, viz.zones[sel.zone]);
  if (sel && sel.type==='dir' && viz.dirs[sel.key]){
    const d=viz.dirs[sel.key];
    const lbl=START_ZONE_LABEL[d.start]||(d.start+'. zóna');
    return box(`${lbl} → ${ZONE_NAME[d.zone]||d.zone}`, d);
  }
  return `<div class="atk-detail atk-detail-empty">Válassz egy zónát vagy egy irányt a részletekért.</div>`;
}

function serveCourtSVG(target1, target2Label, avoidLabel){
  const W=280, H=350, lm=12, cw=(W-2*lm)/3, netY=H/2;
  const cx=[lm+cw*0.5, lm+cw*1.5, lm+cw*2.5];
  const ourBY=netY-95, ourFY=netY-35;
  const landY=H-lm-18, midDvtk = netY + (H-netY)*0.42;

  let s=[`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">`];
  s.push(`<rect width="${W}" height="${H}" fill="#07111d" rx="5"/>`);
  s.push(`<rect x="${lm}" y="6" width="${W-2*lm}" height="${netY-10}" fill="#081d2a" rx="3" stroke="#1a4060" stroke-width="1"/>`);
  s.push(`<rect x="${lm}" y="${netY+4}" width="${W-2*lm}" height="${H-netY-10}" fill="#1a0808" rx="3" stroke="#4a1a1a" stroke-width="1"/>`);
  [1,2].forEach(i=>{
    const x = lm+cw*i;
    s.push(`<line x1="${x.toFixed(0)}" y1="6" x2="${x.toFixed(0)}" y2="${(netY-3).toFixed(0)}" stroke="#1a4060" stroke-width="0.7" stroke-dasharray="4,3"/>`);
    s.push(`<line x1="${x.toFixed(0)}" y1="${(netY+4).toFixed(0)}" x2="${x.toFixed(0)}" y2="${H-6}" stroke="#4a1a1a" stroke-width="0.7" stroke-dasharray="4,3"/>`);
  });
  s.push(`<rect x="${lm-2}" y="${netY-4}" width="${W-2*lm+4}" height="8" fill="#f0a500" rx="2"/>`);
  s.push(`<text x="${W/2}" y="${(netY+3.5).toFixed(0)}" text-anchor="middle" fill="#07111d" font-size="6" font-family="Arial" font-weight="bold">HÁLÓ</text>`);
  s.push(`<text x="${lm+3}" y="16" fill="rgba(46,196,182,0.6)" font-size="7" font-family="Arial" font-weight="bold">MI</text>`);
  s.push(`<text x="${lm+3}" y="${H-3}" fill="rgba(230,57,70,0.6)" font-size="7" font-family="Arial" font-weight="bold">ELLENFÉL</text>`);

  const ourPos={1:[cx[0],ourBY],6:[cx[1],ourBY],5:[cx[2],ourBY], 2:[cx[0],ourFY],3:[cx[1],ourFY],4:[cx[2],ourFY]};
  Object.entries(ourPos).forEach(([pos,[px,py]])=>{
    s.push(`<text x="${px.toFixed(0)}" y="${(py+4).toFixed(0)}" text-anchor="middle" fill="rgba(46,196,182,.22)" font-size="10" font-family="Arial">${pos}</text>`);
  });
  const oppPos={4:[cx[0],netY+35],3:[cx[1],netY+35],2:[cx[2],netY+35], 5:[cx[0],H-lm-48],6:[cx[1],H-lm-48],1:[cx[2],H-lm-48]};
  Object.entries(oppPos).forEach(([pos,[px,py]])=>{
    s.push(`<text x="${px.toFixed(0)}" y="${(py+4).toFixed(0)}" text-anchor="middle" fill="rgba(200,80,80,.18)" font-size="10" font-family="Arial">${pos}</text>`);
  });

  // Server marker (position1, our back-left)
  const svX=cx[0], svY=5;
  s.push(`<circle cx="${svX.toFixed(0)}" cy="${svY}" r="13" fill="#2ec4b6" stroke="#4dfff0" stroke-width="1.5"/>`);
  s.push(`<text x="${svX.toFixed(0)}" y="${svY-2}" text-anchor="middle" fill="#07111d" font-size="7" font-family="Arial" font-weight="bold">NYITÓ</text>`);
  s.push(`<text x="${svX.toFixed(0)}" y="${svY+6}" text-anchor="middle" fill="#07111d" font-size="6" font-family="Arial">1.h.</text>`);

  // Primary target (opponent position5, back-left)
  const hw1=cw*0.45, t1x=cx[0];
  const x1a=Math.max(lm+3,t1x-hw1), x1b=Math.min(W-lm-3,t1x+hw1);
  s.push(`<polygon points="${svX.toFixed(0)},${svY} ${x1a.toFixed(0)},${landY.toFixed(0)} ${x1b.toFixed(0)},${landY.toFixed(0)}" fill="#e63946" opacity="0.30" stroke="#e63946" stroke-width="1" stroke-opacity="0.7"/>`);
  s.push(`<rect x="${x1a.toFixed(0)}" y="${landY.toFixed(0)}" width="${(x1b-x1a).toFixed(0)}" height="7" fill="#e63946" opacity="0.9" rx="2"/>`);
  s.push(`<rect x="${lm+3}" y="${(midDvtk+7).toFixed(0)}" width="${(cw-6).toFixed(0)}" height="${(H-lm-48-midDvtk-4).toFixed(0)}" fill="rgba(230,57,70,0.15)" rx="3" stroke="#e63946" stroke-width="1.5"/>`);
  s.push(`<text x="${cx[0].toFixed(0)}" y="${(midDvtk+24).toFixed(0)}" text-anchor="middle" fill="#e63946" font-size="8.5" font-family="Arial" font-weight="bold">🎯 ${target1.num?('#'+target1.num):''}</text>`);
  s.push(`<text x="${cx[0].toFixed(0)}" y="${(midDvtk+36).toFixed(0)}" text-anchor="middle" fill="rgba(230,57,70,0.8)" font-size="7.5" font-family="Arial">${escHtml(target1.name||'')}</text>`);
  s.push(`<text x="${cx[0].toFixed(0)}" y="${(midDvtk+46).toFixed(0)}" text-anchor="middle" fill="rgba(230,57,70,0.6)" font-size="7" font-family="Arial">5-ös hely</text>`);

  // Secondary target
  const t2x = cx[0]+cw*0.5, hw2=cw*0.25;
  const x2a=t2x-hw2, x2b=Math.min(W-lm-3, t2x+hw2);
  s.push(`<polygon points="${svX.toFixed(0)},${svY} ${x2a.toFixed(0)},${(landY-12).toFixed(0)} ${x2b.toFixed(0)},${(landY-12).toFixed(0)}" fill="#f0a500" opacity="0.18" stroke="#f0a500" stroke-width="0.8" stroke-opacity="0.5" stroke-dasharray="4,3"/>`);
  s.push(`<text x="${t2x.toFixed(0)}" y="${(landY-16).toFixed(0)}" text-anchor="middle" fill="#f0a500" font-size="7" font-family="Arial" font-weight="bold">${escHtml(target2Label||'')}</text>`);

  // Avoid zone
  s.push(`<rect x="${(lm+cw+3).toFixed(0)}" y="${(midDvtk+7).toFixed(0)}" width="${(cw-6).toFixed(0)}" height="${(H-lm-48-midDvtk-4).toFixed(0)}" fill="rgba(46,196,182,0.07)" rx="3" stroke="#2ec4b6" stroke-width="1" stroke-dasharray="4,3"/>`);
  s.push(`<text x="${cx[1].toFixed(0)}" y="${(midDvtk+24).toFixed(0)}" text-anchor="middle" fill="#2ec4b6" font-size="8" font-family="Arial" font-weight="bold">❌ KERÜLD</text>`);
  s.push(`<text x="${cx[1].toFixed(0)}" y="${(midDvtk+36).toFixed(0)}" text-anchor="middle" fill="rgba(46,196,182,0.7)" font-size="7" font-family="Arial">${escHtml(avoidLabel||'')}</text>`);

  s.push('</svg>');
  return s.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// STAT HELPERS
// ═══════════════════════════════════════════════════════════════════════

function attackSummary(a){
  const total = a.total;
  const kill = a.grades['#']||0, err = a.grades['=']||0, blocked = a.grades['/']||0;
  const kp = total? Math.round(100*kill/total) : 0;
  const ep = total? Math.round(100*err/total) : 0;
  const bp = total? Math.round(100*blocked/total) : 0;
  // International standard efficiency: (kills - errors - blocked) / attempts.
  // A blocked ball loses the rally just like an error, so it counts against.
  const eff = total? Math.round(100*(kill-err-blocked)/total) : 0;
  return {total, kill, err, blocked, kp, ep, bp, eff};
}

function topComboGroup(combos){
  const entries = Object.entries(combos);
  if (!entries.length) return null;
  entries.sort((a,b)=>b[1]-a[1]);
  return entries[0];
}

function generateAdvice(playerRole, combos, tech, total, errPct){
  const comboEntries = Object.entries(combos).sort((a,b)=>b[1]-a[1]);
  if (!comboEntries.length) return 'Nincs elég adat a taktikai javaslathoz.';
  const [topGroup, topCount] = comboEntries[0];
  const topPct = Math.round(100*topCount/total);
  let advice = '';
  if (topPct>=60){
    advice = `${topGroup} irány dominál (${topPct}%) — a blokk erre koncentráljon elsődlegesen.`;
  } else if (comboEntries.length>=2){
    const [g2,c2] = comboEntries[1];
    const p2 = Math.round(100*c2/total);
    if (topPct - p2 <= 15){
      advice = `Kétirányú fenyegetés: ${topGroup} (${topPct}%) és ${g2} (${p2}%) — vegyes blokkstratégia szükséges, ne köteleződj el egy irány mellett.`;
    } else {
      advice = `${topGroup} irány dominál (${topPct}%), másodlagosan ${g2} (${p2}%).`;
    }
  } else {
    advice = `${topGroup} irány szinte kizárólagos (${topPct}%).`;
  }
  const techTotal = Object.values(tech).reduce((a,b)=>a+b,0);
  const ejtesN = tech['T']||0;
  const ejtesPct = techTotal? Math.round(100*ejtesN/techTotal) : 0;
  if (ejtesPct>=45){
    advice += ` Magas ejtésarány (${ejtesPct}%) — a blokk ne ugorjon korán vagy túl magasra azonnal.`;
  }
  if (errPct>=13){
    advice += ` Viszonylag magas saját hibaarány (${errPct}%) — türelmes védekezéssel is kihasználható.`;
  }
  return advice;
}

function dangerTag(eff, total, killPct, errPct){
  if (total>=15 && eff>=28) return {label:'FŐ VESZÉLY', cls:'td'};
  if (errPct>=15) return {label:'SOK HIBA', cls:'tw'};
  if (killPct>=45) return {label:'MAGAS KILL%', cls:'tg'};
  if (eff>=40) return {label:'KIVÁLÓ HATÉKONYSÁG', cls:'tg'};
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER: OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// FULL MATCH REPORT (DataVolley-style printed report replica)
// ═══════════════════════════════════════════════════════════════════════

function mrFormatPct(n){ return (n===null || n===undefined) ? '' : n+'%'; }
function mrFormatPM(n){ return n>0 ? '+'+n : String(n); }
function mrFormatDuration(min){
  if (!min) return '';
  const m = parseInt(min,10);
  if (isNaN(m)) return '';
  return `0.${String(m).padStart(2,'0')}`;
}

function mrPlayerRowHtml(p, setCount){
  let setBoxes = '';
  for (let s=1; s<=setCount; s++){
    const pos = p.setPositions[s];
    setBoxes += pos ? `<span class="mr-set-box">${pos}</span>` : `<span class="mr-set-box mr-set-empty">–</span>`;
  }
  const nameLabel = (p.isLibero ? 'L ' : '') + titleCaseName(p.name);
  const hasAny = p.pointsTot>0 || p.serveTot>0 || p.recvTot>0 || p.atkTot>0 || p.bkPts>0 || Object.keys(p.setPositions).length>0;
  if (!hasAny) return '';
  return `<tr>
    <td>${p.jersey}</td>
    <td class="mr-name">${escHtml(nameLabel)}</td>
    <td>${setBoxes}</td>
    <td>${p.pointsTot||''}</td>
    <td>${p.serveTot||''}</td>
    <td>${p.serveErr||''}</td>
    <td>${p.servePts||''}</td>
    <td>${p.recvTot||''}</td>
    <td>${p.recvErr||''}</td>
    <td>${mrFormatPct(p.recvPosPct)}</td>
    <td>(${mrFormatPct(p.recvExcPct)})</td>
    <td>${p.atkTot||''}</td>
    <td>${p.atkErr||''}</td>
    <td>${p.atkBlo||''}</td>
    <td>${p.atkPts||''}</td>
    <td>${mrFormatPct(p.atkPtsPct)}</td>
    <td>${p.bkPts||''}</td>
  </tr>`;
}

function mrTeamBlockHtml(team, setCount){
  const rows = team.players.map(p=>mrPlayerRowHtml(p, setCount)).join('');
  const t = team.totals;

  let pointsWonRows = '';
  for (let s=1; s<=setCount; s++){
    const b = team.bySet[s] || {ser:0,att:0,bk:0,opEr:0};
    pointsWonRows += `<tr class="mr-pointswon-row"><td>Set ${s}</td><td>${b.ser}</td><td>${b.att}</td><td>${b.bk}</td><td>${b.opEr}</td></tr>`;
  }

  return `
  <div class="mr-team-block">
    <div class="mr-team-name">${escHtml(team.name)}</div>
    <table class="mr-player-table">
      <thead>
        <tr>
          <th rowspan="2">#</th><th rowspan="2">Név</th><th rowspan="2">Szett</th>
          <th rowspan="2">Pontok</th><th colspan="3">Nyitás</th><th colspan="4">Fogadás</th>
          <th colspan="5">Támadás</th><th rowspan="2">BK Pts</th>
        </tr>
        <tr>
          <th>Tot</th><th>Err</th><th>Pts</th>
          <th>Tot</th><th>Err</th><th>Pos%</th><th>(Exc%)</th>
          <th>Tot</th><th>Err</th><th>Blo</th><th>Pts</th><th>Pts%</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="mr-totals-row">
          <td colspan="3">Csapat összesen</td>
          <td>${t.pointsTot}</td>
          <td>${t.serveTot}</td><td>${t.serveErr}</td><td>${t.servePts}</td>
          <td>${t.recvTot}</td><td>${t.recvErr}</td><td>${mrFormatPct(t.recvPosPct)}</td><td>(${mrFormatPct(t.recvExcPct)})</td>
          <td>${t.atkTot}</td><td>${t.atkErr}</td><td>${t.atkBlo}</td><td>${t.atkPts}</td><td>${mrFormatPct(t.atkPtsPct)}</td>
          <td>${t.bkPts}</td>
        </tr>
      </tbody>
    </table>
    <table class="mr-player-table" style="margin-top:2px">
      <thead><tr><th></th><th>Ser</th><th>Att</th><th>BK</th><th>Op.Er</th></tr></thead>
      <tbody>${pointsWonRows}</tbody>
    </table>
    <div class="mr-coach-row">
      <div><b>Vezetőedző:</b> ${escHtml(team.headCoach||'–')}</div>
      <div><b>Másodedző:</b> ${escHtml(team.assistantCoach||'–')}</div>
    </div>
  </div>`;
}

function mrKillTableHtml(homeKill, awayKill, title, bucketKey){
  const h = homeKill[bucketKey], a = awayKill[bucketKey];
  const pct = (kt)=> kt.tot? Math.round(100*kt.pts/kt.tot) : 0;
  return `<div class="mr-kill-row">
    <div class="kr-title">${escHtml(title)}</div>
    <table class="mr-kill-table">
      <thead><tr><th>Err</th><th>Blo</th><th>Pts%</th><th>Tot</th><th>Tot</th><th>Pts%</th><th>Blo</th><th>Err</th></tr></thead>
      <tbody><tr>
        <td>${h.err}</td><td>${h.blo}</td><td>${pct(h)}%</td><td>${h.tot}</td>
        <td>${a.tot}</td><td>${pct(a)}%</td><td>${a.blo}</td><td>${a.err}</td>
      </tr></tbody>
    </table>
  </div>`;
}

function renderFullMatchReportHtml(r){
  const setCount = r.setCount;
  const homeWon = r.homeSets > r.awaySets;

  let setsRows = '';
  r.sets.forEach((s,i)=>{
    setsRows += `<tr><td>${i+1}</td><td>${mrFormatDuration(s.durationMin)}</td>
      <td>${s.checkpoint1}</td><td>${s.checkpoint2}</td><td>${s.checkpoint3}</td><td><b>${s.final}</b></td></tr>`;
  });

  const totalDuration = r.sets.reduce((sum,s)=>sum+(parseInt(s.durationMin,10)||0),0);
  const totalH = r.home.totals.pointsTot + 0; // just for footer scoreline, not critical
  const finalHScore = r.sets.reduce((sum,s)=>sum+ (parseInt(s.final.split('-')[0],10)||0), 0);
  const finalVScore = r.sets.reduce((sum,s)=>sum+ (parseInt(s.final.split('-')[1],10)||0), 0);

  const recvSOEach = r.home.totals.recvTot ? (r.home.totals.recvTot/Math.max(1,r.home.totals.recvWon)).toFixed(2) : '–';
  const servBPEach = r.home.totals.serveTot ? (r.home.totals.serveTot/Math.max(1,r.home.totals.serveWon)).toFixed(2) : '–';
  const recvSOEachV = r.away.totals.recvTot ? (r.away.totals.recvTot/Math.max(1,r.away.totals.recvWon)).toFixed(2) : '–';
  const servBPEachV = r.away.totals.serveTot ? (r.away.totals.serveTot/Math.max(1,r.away.totals.serveWon)).toFixed(2) : '–';

  return `<div class="mr-doc">
    <div class="mr-header">
      <div class="mr-logo">🏐</div>
      <div class="mr-title">
        <h1>${escHtml(r.comp || 'Bajnoki mérkőzés')}</h1>
        <div class="sub">Meccs riport</div>
        <div class="mreport">Match report</div>
      </div>
      <div class="mr-score-box">
        <div class="mr-score-row"><span>${escHtml(r.home.name)}</span><span class="val">${r.homeSets}</span></div>
        <div class="mr-score-row"><span>${escHtml(r.away.name)}</span><span class="val">${r.awaySets}</span></div>
      </div>
    </div>

    <div class="mr-info-grid">
      <div class="mr-info-cell"><div class="lbl">Mérkőzés</div><div class="v">${escHtml(r.matchNum||'–')}</div></div>
      <div class="mr-info-cell"><div class="lbl">Nézőszám</div><div class="v">${escHtml(r.spectators||'–')}</div></div>
      <div class="mr-info-cell" style="grid-row:span 3"><div class="lbl">Csarnok</div><div class="v">${escHtml(r.hall||'–')}</div></div>
      <div class="mr-info-cell"><div class="lbl">Dátum</div><div class="v">${formatDateHu(r.date)}</div></div>
      <div class="mr-info-cell"><div class="lbl">Bevétel</div><div class="v">${escHtml(r.receipts||'–')}</div></div>
      <div class="mr-info-cell"><div class="lbl">Idő</div><div class="v">${escHtml(r.time||'–')}</div></div>
      <div class="mr-info-cell"><div class="lbl">Város</div><div class="v">${escHtml(r.city||'–')}</div></div>
      <div class="mr-info-cell" style="grid-column:span 3"><div class="lbl">Játékvezetők</div><div class="v">${escHtml(r.referees||'–')}</div></div>
    </div>

    <table class="mr-sets-table">
      <thead><tr><th>Szett</th><th>Időtartam</th><th colspan="3">Részeredmény</th><th>Eredmény</th></tr></thead>
      <tbody>${setsRows}
        <tr><td colspan="5" style="text-align:right"><b>Összesen</b></td><td><b>${finalHScore} : ${finalVScore}</b></td></tr>
      </tbody>
    </table>

    ${mrTeamBlockHtml(r.home, setCount)}
    ${mrTeamBlockHtml(r.away, setCount)}

    <div class="mr-bottom-grid">
      <div class="mr-bottom-box">
        <h4>${escHtml(r.home.name)}</h4>
        <div class="mr-bottom-stat"><span class="lbl">Fogadások / Side-out pont</span><span class="v">${r.home.totals.recvTot} / ${r.home.totals.recvWon}</span></div>
        <div class="mr-bottom-stat"><span class="lbl">Nyitások / Break pont</span><span class="v">${r.home.totals.serveTot} / ${r.home.totals.serveWon}</span></div>
      </div>
      <div class="mr-bottom-box">
        <h4>${escHtml(r.away.name)}</h4>
        <div class="mr-bottom-stat"><span class="lbl">Fogadások / Side-out pont</span><span class="v">${r.away.totals.recvTot} / ${r.away.totals.recvWon}</span></div>
        <div class="mr-bottom-stat"><span class="lbl">Nyitások / Break pont</span><span class="v">${r.away.totals.serveTot} / ${r.away.totals.serveWon}</span></div>
      </div>
    </div>

    <div class="mr-kill-section">
      <h4>Ütés fogadás/mentés után (${escHtml(r.home.name)} | ${escHtml(r.away.name)})</h4>
      ${mrKillTableHtml(r.home.kill, r.away.kill, '1. ütés pozitív fogadás után (+/#)', 'posRecv')}
      ${mrKillTableHtml(r.home.kill, r.away.kill, '1. ütés negatív fogadás után (-/!)', 'negRecv')}
    </div>

    <div class="mr-legend">
      <span><b>Err</b> Hiba</span>
      <span><b>Pos%</b> Pozitív fogadás%</span>
      <span><b>Exc%</b> Kiváló fogadás%</span>
      <span><b>Blo</b> Blokkolt / Blokkoló</span>
      <span><b>BK Pts</b> Blokk pontok</span>
      <span><b>L</b> Libero</span>
    </div>
    <div class="mr-footer">Röplabda Meccs Elemző · Adatforrás: Data Volley 4 · ${escHtml(r.filename)}</div>
  </div>`;
}

function showMatchReport(filename){
  const match = APP_MATCHES.find(m=>m.filename===filename);
  if (!match) return;
  let report;
  try {
    report = computeFullMatchReport(match.rawText, filename);
  } catch(e){
    console.error('Match report generation failed', e);
    alert('Nem sikerült előállítani a riportot ehhez a meccshez.');
    return;
  }
  document.getElementById('match-report-content').innerHTML = renderFullMatchReportHtml(report);
  document.getElementById('match-report-overlay').style.display = 'flex';
  window.scrollTo(0,0);
}

function closeMatchReport(){
  document.getElementById('match-report-overlay').style.display = 'none';
}

function renderOverview(){

  const el = document.getElementById('t2-content');
  if (!CURRENT_STATS){
    el.innerHTML = emptyStateHtml();
    return;
  }
  const st = CURRENT_STATS;
  const matches = st.matches.slice().sort((a,b)=>parseDateMDY(a.date)-parseDateMDY(b.date));
  const wins = matches.filter(m=>m.won).length;
  const losses = matches.length - wins;
  const dates = matches.map(m=>parseDateMDY(m.date)).filter(d=>d.getTime()>0);
  const dateRange = dates.length ? `${formatDateHu(matches[0].date)} – ${formatDateHu(matches[matches.length-1].date)}` : '–';

  let html = `<div class="hero">
    <div class="hero-tag">Felkészülési Scouting Riport</div>
    <h1>${escHtml(CURRENT_TEAM)}</h1>
    <div class="hero-meta">
      <div class="meta-m"><div class="l">Elemzett mérkőzések</div><div class="v">${matches.length} bajnoki</div></div>
      <div class="meta-m"><div class="l">Időszak</div><div class="v">${dateRange}</div></div>
      <div class="meta-m"><div class="l">Mérleg</div><div class="v">${wins} győzelem / ${losses} vereség</div></div>
    </div>
  </div>`;

  // Radar chart — quick 5-axis team profile
  const radar = computeRadarScores(st);
  html += `<div class="card" style="margin-bottom:22px">
    <div class="ch"><h3>📡 Csapat-profil (gyors áttekintés)</h3></div>
    <div class="profile-grid">
      <div>${radarChartSVG(radar.axes)}</div>
      <div>
        <div style="font-size:.82rem;color:var(--light);line-height:1.6;margin-bottom:10px">
          Minden tengely 0–100 skálán mutatja a csapat erősségét. A skálák a betöltött mérkőzések valós szórásához vannak igazítva, így a öt tengely egymással is összevethető. Blokknál a szettenkénti blokkpont számít, nyitásnál az ász% a hibaarány levonásával.
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${radar.axes.map(a=>`<div style="display:flex;justify-content:space-between;font-size:.8rem;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">
            <span style="color:var(--gray)">${escHtml(a.label)}</span>
            <span><b style="color:var(--amber)">${Math.round(a.score)}</b> <span style="color:var(--gray);font-size:.74rem">(${escHtml(a.hint)}, ${a.n} db)</span></span>
          </div>`).join('')}
        </div>
        ${radar.sampleWarning ? '<div style="margin-top:10px;font-size:.72rem;color:var(--gray)">⚠️ Néhány tengelynél kevés az adat — kevesebb meccs esetén ingadozhat.</div>' : ''}
      </div>
    </div>
  </div>`;

  html += `<div class="st">Elemzett mérkőzések</div>
  <div class="mt" style="margin-bottom:20px"><table>
  <thead><tr><th>Dátum</th><th>Mérkőzés</th><th>Eredmény</th><th>Szetek</th><th></th></tr></thead>
  <tbody>`;
  matches.forEach(m=>{
    const chip = m.won ? '<span class="win-chip">GY '+m.teamSets+':'+m.oppSets+'</span>' : '<span class="loss-chip">V '+m.teamSets+':'+m.oppSets+'</span>';
    const matchupStr = m.home ? `${escHtml(m.teamName)} <b>vs</b> ${escHtml(m.opponent)}` : `${escHtml(m.opponent)} <b>vs</b> ${escHtml(m.teamName)}`;
    html += `<tr><td>${formatDateHu(m.date)}</td><td>${matchupStr}</td><td>${chip}</td>
      <td style="color:var(--gray);font-family:monospace">${m.sets.join(' · ')}</td>
      <td><button class="mr-btn" onclick="showMatchReport('${escAttr(m.filename)}')">📄 Teljes meccs riport</button></td></tr>`;
  });
  html += `</tbody></table></div>`;

  // Alerts: top dangerous / top efficient
  const attackers = Object.entries(st.attack).filter(([j,a])=>a.total>=10);
  if (attackers.length){
    const withSummary = attackers.map(([j,a])=>({jersey:j, ...attackSummary(a), player: st.players[j]}));
    const dangerous = withSummary.slice().sort((a,b)=> (b.eff*Math.log(b.total+1)) - (a.eff*Math.log(a.total+1)))[0];
    const efficient = withSummary.slice().sort((a,b)=>b.eff-a.eff)[0];
    if (dangerous){
      const p = dangerous.player || {name:'#'+dangerous.jersey};
      html += `<div class="al alr"><div>
        <div class="at">Legveszélyesebb ütő: #${dangerous.jersey} ${escHtml(titleCaseName(p.name))} (${escHtml(p.role||'')})</div>
        <div class="ad">${dangerous.total} ütés · ${dangerous.kp}% kill · ${dangerous.eff>=0?'+':''}${dangerous.eff}% hatékonyság · nagy volumen + jó hatékonyság kombinációja teszi a legveszélyesebbé.</div>
      </div></div>`;
    }
    if (efficient && efficient.jersey!==dangerous.jersey){
      const p = efficient.player || {name:'#'+efficient.jersey};
      html += `<div class="al ala"><div>
        <div class="at">Leghatékonyabb ütő: #${efficient.jersey} ${escHtml(titleCaseName(p.name))} (${escHtml(p.role||'')})</div>
        <div class="ad">${efficient.total} ütés · ${efficient.kp}% kill · ${efficient.eff>=0?'+':''}${efficient.eff}% hatékonyság · ${efficient.ep}% hibaarány.</div>
      </div></div>`;
    }
  }

  // Reception weak point alert (require a reliable sample so a lucky/unlucky
  // small-n receiver doesn't drive the headline recommendation)
  const recvEntries = Object.entries(st.recv).filter(([j,r])=>r.total>=12);
  if (recvEntries.length){
    const withPct = recvEntries.map(([j,r])=>{
      const exc = (r.grades['#']||0)+(r.grades['+']||0);
      const neg = r.grades['-']||0, err = r.grades['=']||0;
      const excPct = Math.round(100*exc/r.total);
      const errPct = Math.round(100*err/r.total);
      const weakness = errPct*2 + Math.round(100*neg/r.total) - excPct;
      return {jersey:j, total:r.total, excPct, errPct, weakness, player: st.players[j]};
    });
    withPct.sort((a,b)=>b.weakness-a.weakness);
    const weakest = withPct[0];
    if (weakest){
      const p = weakest.player || {name:'#'+weakest.jersey};
      html += `<div class="al alg"><div>
        <div class="at">Nyitási célpont: #${weakest.jersey} ${escHtml(titleCaseName(p.name))} (${escHtml(p.role||'')})</div>
        <div class="ad">${weakest.excPct}% pozitív fogadás, ${weakest.errPct}% közvetlen hiba (${weakest.total} fogadásból) — a csapat leggyengébb fogadója, elsődleges célpont float nyitással.</div>
      </div></div>`;
    }
  }

  // Roster
  html += `<div class="st">Keret</div><div class="player-grid">`;
  const rosterEntries = Object.entries(st.players).sort((a,b)=>a[1].roleCode - b[1].roleCode || parseInt(a[0])-parseInt(b[0]));
  rosterEntries.forEach(([j,p])=>{
    const rc = {'Feladó':'rF','Libero':'rL','Center':'rC','Szélső ütő':'rS','Átló':'rA'}[p.role] || '';
    const a = st.attack[j];
    let mini = '–';
    if (a && a.total>=5){
      const sum = attackSummary(a);
      mini = `${sum.total} ütés · ${sum.kp}% kill`;
    } else if (st.serve[j] && st.serve[j].total>=5){
      mini = `${st.serve[j].total} nyitás`;
    }
    html += `<div class="player-card">
      <div class="num">${j}</div>
      <div class="info">
        <div class="name">${escHtml(titleCaseName(p.name))}</div>
        <div class="role"><span class="rb ${rc}">${escHtml(p.role)}</span></div>
        <div class="mini-stats">${mini}</div>
      </div>
    </div>`;
  });
  html += `</div>`;

  // Attack summary table
  const attackForTable = Object.entries(st.attack).filter(([j,a])=>a.total>=8)
    .map(([j,a])=>({jersey:j, ...attackSummary(a), combos:a.combos, tech:a.tech, player:st.players[j]}))
    .sort((a,b)=>b.total-a.total);
  if (attackForTable.length){
    html += `<div class="st">Ütési összesítő</div><div class="card" style="overflow-x:auto"><table class="ov-table">
    <thead><tr><th>#</th><th>Játékos</th><th>Poszt</th><th>Ütés</th><th># Kill%</th><th>=Hiba%</th><th title="(kill - hiba - blokkolt) / ütés">Eff.</th><th>Fő irány</th><th>Technika</th></tr></thead><tbody>`;
    attackForTable.forEach(r=>{
      const p = r.player || {name:'#'+r.jersey, role:''};
      const rc = {'Feladó':'rF','Libero':'rL','Center':'rC','Szélső ütő':'rS','Átló':'rA'}[p.role] || '';
      const topCombo = topComboGroup(r.combos);
      const comboStr = topCombo ? `${topCombo[0]} (${Math.round(100*topCombo[1]/r.total)}%)` : '–';
      const topTech = topComboGroup(r.tech);
      const techStr = topTech ? `${TECH_LABELS[topTech[0]]||topTech[0]} ${Math.round(100*topTech[1]/r.total)}%` : '–';
      const effColor = r.eff>=30 ? '#27ae60' : r.eff>=15 ? '#f0a500' : '#e63946';
      html += `<tr><td><span class="jsy">${r.jersey}</span></td><td><b>${escHtml(titleCaseName(p.name))}</b></td>
        <td><span class="rb ${rc}">${escHtml(p.role)}</span></td><td>${r.total}</td>
        <td>${r.kp}%</td><td>${r.ep}%</td>
        <td style="font-weight:700;color:${effColor}">${r.eff>=0?'+':''}${r.eff}%</td>
        <td style="font-size:.77rem">${escHtml(comboStr)}</td>
        <td style="font-size:.77rem">${escHtml(techStr)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // Reception quality -> attack outcome chain
  const bucketDefs = [
    ['Jó fogadás (# / +)', ['#','+'], '#4ade80'],
    ['Közepes fogadás (!)', ['!'], '#f0a500'],
    ['Gyenge fogadás (- / = / /)', ['-','=','/'], '#e63946'],
  ];
  const chainRows = bucketDefs.map(([label,grades,color])=>{
    let tot=0, kill=0, err=0;
    grades.forEach(g=>{
      const d = st.recvChain[g];
      if (!d) return;
      Object.entries(d).forEach(([ag,n])=>{ tot+=n; if(ag==='#') kill+=n; if(ag==='=') err+=n; });
    });
    return {label, color, tot, killPct: tot?Math.round(100*kill/tot):0, effPct: tot?Math.round(100*(kill-err)/tot):0};
  }).filter(r=>r.tot>=5);

  if (chainRows.length>=2){
    const maxKill = Math.max(...chainRows.map(r=>r.killPct), 1);
    html += `<div class="st">Mennyit számít a fogadás minősége?</div>
    <div class="card">
      <div style="font-size:.82rem;color:var(--gray);margin-bottom:14px">Az adott fogadás-minőség UTÁN következő ütés kimenetele — ez mutatja meg, mennyit ér, ha nyomás alá helyezzük a fogadásukat.</div>
      <div class="bw">`;
    chainRows.forEach(r=>{
      const barPct = Math.round(100*r.killPct/maxKill);
      html += `<div class="br">
        <span class="bl" style="min-width:200px">${escHtml(r.label)} <span style="color:var(--gray);font-size:.7rem">${r.tot} db</span></span>
        <div class="bt"><div class="bf" style="width:${barPct}%;background:${r.color}"></div></div>
        <span class="bp">${r.killPct}% kill</span>
      </div>`;
    });
    html += `</div>
      <div style="margin-top:12px;padding:10px 14px;background:rgba(240,165,0,.06);border-radius:6px;font-size:.8rem;color:var(--light)">
        💡 ${chainRows[0] && chainRows[chainRows.length-1] ? `Jó fogadás után <b>${chainRows[0].killPct}%</b> a kill-arányuk, gyenge fogadás után <b>${chainRows[chainRows.length-1].killPct}%</b> — ez mutatja a nyitási nyomás valódi tétjét.` : ''}
      </div>
    </div>`;
  }

  el.innerHTML = html;
}

function emptyStateHtml(){
  if (CURRENT_TEAM && TEAM_MATCH_FILENAMES.length>0 && SELECTED_MATCH_FILENAMES.size===0){
    return `<div class="empty-state">
      <div class="empty-icon">🔍</div>
      <div class="empty-title">Nincs kiválasztott meccs a szűrőben</div>
      <div class="empty-desc">A <b>MECCSEK</b> legördülőben minden meccs ki van kapcsolva. Válassz legalább egyet, vagy kattints a "Minden meccs" gombra.</div>
    </div>`;
  }
  return `<div class="empty-state">
    <div class="empty-icon">📂</div>
    <div class="empty-title">Nincs kiválasztott csapat vagy betöltött meccs</div>
    <div class="empty-desc">Menj a <b>FELTÖLTÉS</b> fülre, tölts be .dvw fájlokat, majd válassz csapatot a jobb felső legördülőben.</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER: ATTACK TAB
// ═══════════════════════════════════════════════════════════════════════

let ATTACK_CODE_DATA = {}; // jersey -> {attackDetails: {code: [{zone,grade,subtype}]}}
function buildComboBarsHtml(combos, total){
  const entries = Object.entries(combos).sort((x,y)=>y[1]-x[1]);
  let html = '';
  entries.forEach(([g,n])=>{
    const pct = total? Math.round(100*n/total) : 0;
    if (pct<1) return;
    const col = COMBO_COLORS[g]||'#8899aa';
    html += `<div class="br"><span class="bl">${escHtml(g)} <span style="color:var(--gray);font-size:.7rem">${n} db</span></span>
      <div class="bt"><div class="bf" style="width:${pct}%;background:${col}"></div></div><span class="bp">${pct}%</span></div>`;
  });
  return html || `<div style="color:var(--gray);font-size:.8rem">Nincs adat ehhez az álláshoz.</div>`;
}
function sortCodesForDisplay(codes){
  return codes.slice().sort((a,b)=>{
    const sufA = a.slice(1), sufB = b.slice(1);
    if (sufA!==sufB) return sufA<sufB ? -1 : 1;
    return a<b ? -1 : 1;
  });
}
function buildAttackLinesFromDetails(attackDetails, filterStarts){
  // filterStarts: null/undefined -> every start zone; array of zone numbers -> union.
  const wanted = filterStarts ? new Set(filterStarts.map(Number)) : null;
  const lines = [];
  let total = 0;
  Object.values(attackDetails).forEach(recs=>recs.forEach(rec=>{
    if (wanted && !wanted.has(rec.start)) return;
    total++;
    if (!rec.start) return;
    lines.push({startZone: rec.start, targetZone: rec.zone, grade: rec.grade, subtype: rec.subtype});
  }));
  return { lines, total };
}

let ATTACK_VIZ_STATE = {};  // jersey -> view state for the attack visualisation

function attackVizState(jersey){
  if (!ATTACK_VIZ_STATE[jersey]){
    ATTACK_VIZ_STATE[jersey] = {mode:'flow', colorBy:'freq', starts:new Set(), tempos:new Set(),
                                recvGrades:new Set(), hideNoise:true, outcome:'all', selected:null};
  }
  return ATTACK_VIZ_STATE[jersey];
}
function setAttackMode(j,m){ const s=attackVizState(j); s.mode=m; s.selected=null; renderAttack(); }
function setAttackColorBy(j,c){ attackVizState(j).colorBy=c; renderAttack(); }
function setAttackOutcome(j,o){ const s=attackVizState(j); s.outcome=o; s.selected=null; renderAttack(); }
function toggleAttackNoise(j){ const s=attackVizState(j); s.hideNoise=!s.hideNoise; renderAttack(); }
function toggleAttackStartChip(j, z){
  const s=attackVizState(j);
  if (z==='all') s.starts=new Set();
  else { const n=parseInt(z,10); if (s.starts.has(n)) s.starts.delete(n); else s.starts.add(n); }
  s.selected=null; renderAttack();
}
function toggleAttackRecvChip(j, g){
  const s=attackVizState(j);
  if (g==='all') s.recvGrades=new Set();
  else if (s.recvGrades.has(g)) s.recvGrades.delete(g);
  else s.recvGrades.add(g);
  s.selected=null; renderAttack();
}
function clearAttackFilters(j){
  const s=attackVizState(j);
  s.starts=new Set(); s.tempos=new Set(); s.recvGrades=new Set();
  s.outcome='all'; s.selected=null; renderAttack();
}
function toggleAttackTempoChip(j, g){
  const s=attackVizState(j);
  if (g==='all') s.tempos=new Set();
  else if (s.tempos.has(g)) s.tempos.delete(g);
  else s.tempos.add(g);
  s.selected=null; renderAttack();
}
function selectAttackItem(type, val){
  const s = attackVizState(CURRENT_ATK_JERSEY);
  const same = s.selected && ((type==='zone' && String(s.selected.zone)===String(val)) || (type==='dir' && s.selected.key===val));
  s.selected = same ? null : (type==='zone' ? {type:'zone', zone:val} : {type:'dir', key:val});
  renderAttack();
}

let CURRENT_ATK_JERSEY = null;

// The court can only show attacks that actually have a target zone. Everything
// else still counts in kill%/efficiency, so say out loud how much is missing —
// otherwise the map silently under-reports (one scout records almost no
// landing zones at all).
// Headline numbers for the attack tab. Everything here is computed from the
// already-filtered viz object, so the cards move with the start-zone / tempo /
// outcome filters instead of always showing the player's season totals.
const RECV_FILTER_DEFS = [['#','# Kiváló'],['+','+ Pozitív'],['!','! Közepes'],['-','- Negatív'],['TRANS','Folytatásból']];

// One tidy panel instead of a wall of loose buttons: every filter sits on its
// own labelled row, and a summary line spells out what is currently active.
function filterPanelHtml(rows, activeSummary, clearFn){
  const body = rows.filter(Boolean).map(r=>
    `<div class="fp-row"><div class="fp-lbl">${escHtml(r.label)}</div><div class="fp-ctl">${r.html}</div></div>`
  ).join('');
  return `<div class="fpanel">
    <div class="fp-head">
      <span class="fp-title">Szűrők</span>
      <span class="fp-active">${activeSummary || 'nincs szűrő — minden ütés látszik'}</span>
      ${clearFn?`<button class="fp-clear" onclick="${clearFn}">Törlés</button>`:''}
    </div>
    ${body}
  </div>`;
}

// Technique breakdown that follows the current selection: tap a zone or an
// arrow and this shows how that specific ball was hit.
function techCardHtml(viz, sel){
  let tech = viz.techAll, scope = 'a szűrt ütések';
  if (sel && sel.type==='zone' && viz.zones[sel.zone]){
    tech = viz.zones[sel.zone].tech; scope = (ZONE_NAME[sel.zone]||sel.zone);
  } else if (sel && sel.type==='dir' && viz.dirs[sel.key]){
    const d = viz.dirs[sel.key];
    tech = d.tech; scope = `${START_ZONE_LABEL[d.start]||d.start} → ${ZONE_NAME[d.zone]||d.zone}`;
  }
  const tot = Object.values(tech||{}).reduce((x,y)=>x+y,0);
  const body = tot ? Object.entries(tech).sort((x,y)=>y[1]-x[1]).map(([t,n])=>{
    const pct = Math.round(100*n/tot);
    const css = t==='T'?'rL': t==='H'?'rS': t==='P'?'rC':'';
    return `<span class="rb ${css}" style="padding:3px 9px;font-size:.74rem">${escHtml(TECH_LABELS[t]||t)}: ${pct}% <span style="opacity:.6">(${n})</span></span>`;
  }).join('') : '<span style="font-size:.76rem;color:var(--gray)">Nincs adat ehhez a választáshoz.</span>';
  return `<div class="card" style="padding:12px"><div class="ch"><h3>⚙️ Ütéstechnika</h3>
      <span style="font-size:.68rem;color:var(--gray)">${escHtml(scope)}</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${body}</div></div>`;
}

function attackStatCardsHtml(viz){
  const pct = n => viz.total ? Math.round(1000*n/viz.total)/10 : 0;
  const eff = viz.total ? Math.round(1000*(viz.kill-viz.err-viz.blocked)/viz.total)/10 : 0;
  const cell = (label, value, sub, color) =>
    `<div class="asc-c"><div class="asc-v" style="${color?`color:${color}`:''}">${value}</div>
      <div class="asc-l">${escHtml(label)}</div>${sub?`<div class="asc-s">${sub}</div>`:''}</div>`;
  return `<div class="asc asc-7">
    ${cell('Összes labda', viz.total, '')}
    ${cell('Beütött labda', viz.inPlay, viz.total?pct(viz.inPlay)+'%':'' , '#4ade80')}
    ${cell('Blokkot ért', viz.blockTouched, viz.total?pct(viz.blockTouched)+'%':'', '#c084fc')}
    ${cell('Leblokkolt', viz.blocked, viz.total?pct(viz.blocked)+'%':'', '#ff6b7a')}
    ${cell('Hiba', viz.err, viz.total?pct(viz.err)+'%':'', '#e63946')}
    ${cell('Pont', viz.kill, viz.total?pct(viz.kill)+'% kill':'', '#ffc840')}
    ${cell('Hatékonyság', (eff>=0?'+':'')+eff+'%', '', effColor(eff/100))}
  </div>`;
}

function attackCoverageNote(viz){
  const bits = [];
  if (viz.blockContact) bits.push(`blokkba ütött / blokkról pattant: <b>${viz.blockContact}</b>`);
  if (viz.mirrorDropped) bits.push(`blokkot ért, a rögzített zóna a hálónál van: <b>${viz.mirrorDropped}</b>`);
  if (viz.noZone) bits.push(`célzóna nélkül rögzítve: <b>${viz.noZone}</b>`);
  if (!bits.length) return '';
  const shown = viz.zoned, tot = viz.total;
  const pct = tot ? Math.round(100*shown/tot) : 0;
  const warn = pct < 55;
  return `<div class="atk-cover ${warn?'warn':''}">
    A térképen <b>${shown}</b> ütés a ${tot}-ból (${pct}%) — ${bits.join(' · ')}. A számok fent mindet tartalmazzák.
    ${warn?'<br><b>Kevés az iránnyal rögzített adat, a térkép csak tájékoztató.</b>':''}
  </div>`;
}

function renderAttack(){
  const el = document.getElementById('t3-content');
  if (!CURRENT_STATS){ el.innerHTML = emptyStateHtml(); return; }
  const st = CURRENT_STATS;

  const attackers = Object.entries(st.attack).filter(([j,a])=>a.total>=8)
    .map(([j,a])=>({jersey:j, ...attackSummary(a), combos:a.combos, tech:a.tech,
                    attackDetails:a.attackDetails||{}, player: st.players[j]||{name:'#'+j,role:''}}))
    .sort((a,b)=>b.total-a.total).slice(0,8);

  if (!attackers.length){
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏐</div><div class="empty-title">Nincs elég ütési adat</div>
      <div class="empty-desc">Ehhez a csapathoz nincs legalább 8 rögzített ütéssel rendelkező játékos.</div></div>`;
    return;
  }
  if (!CURRENT_ATK_JERSEY || !attackers.find(a=>a.jersey===CURRENT_ATK_JERSEY)) CURRENT_ATK_JERSEY = attackers[0].jersey;
  const a = attackers.find(x=>x.jersey===CURRENT_ATK_JERSEY);
  const vs = attackVizState(a.jersey);
  const tally = attackFilterTallies(a.attackDetails);
  const viz = computeAttackViz(a.attackDetails, vs);

  const chipStart=(id,label,active)=>`<button class="chip ${active?'active':''}" onclick="toggleAttackStartChip('${a.jersey}','${id}')">${label}</button>`;
  const chipTempo=(id,label,active)=>`<button class="chip ${active?'active':''}" onclick="toggleAttackTempoChip('${a.jersey}','${id}')">${label}</button>`;
  const chipRecv=(id,label,active)=>`<button class="chip ${active?'active':''}" onclick="toggleAttackRecvChip('${a.jersey}','${id}')">${label}</button>`;
  const seg=(cur,val,label,fn)=>`<button class="seg ${cur===val?'active':''}" onclick="${fn}('${a.jersey}','${val}')">${label}</button>`;

  const activeBits = [];
  if (vs.starts.size) activeBits.push([...vs.starts].map(z=>START_ZONE_LABEL[z]||z).join(', '));
  if (vs.tempos.size) activeBits.push([...vs.tempos].map(g=>TEMPO_LABEL[g]||g).join(', '));
  if (vs.recvGrades.size) activeBits.push('fogadás: '+[...vs.recvGrades].map(g=>(RECV_FILTER_DEFS.find(d=>d[0]===g)||[,g])[1]).join(', '));
  if (vs.outcome!=='all') activeBits.push(vs.outcome==='kill'?'csak pontok':'csak hibák');

  const controls = filterPanelHtml([
    {label:'Nézet', html:
      `<div class="segbox">${seg(vs.mode,'flow','Irányok','setAttackMode')}${seg(vs.mode,'zones','Zónák','setAttackMode')}</div>`
      + (vs.mode==='zones'
          ? `<div class="segbox small">${seg(vs.colorBy,'freq','Gyakoriság','setAttackColorBy')}${seg(vs.colorBy,'eff','Hatékonyság','setAttackColorBy')}</div>`
          : `<label class="atk-check"><input type="checkbox" ${vs.hideNoise?'checked':''} onchange="toggleAttackNoise('${a.jersey}')"> 5% alatti irányok elrejtése</label>`)},
    {label:'Honnan üt', html:
      chipStart('all','Mind', vs.starts.size===0)
      + START_ZONE_ORDER.filter(z=>tally.byStart[z]).map(z=>chipStart(z, `${START_ZONE_LABEL[z]} <b>${tally.byStart[z]}</b>`, vs.starts.has(z))).join('')},
    {label:'Labda', html:
      chipTempo('all','Mind', vs.tempos.size===0)
      + ['fast','high','other'].filter(g=>tally.byTempo[g]).map(g=>chipTempo(g, `${TEMPO_LABEL[g]} <b>${tally.byTempo[g]}</b>`, vs.tempos.has(g))).join('')},
    {label:'Fogadás', html:
      chipRecv('all','Mind', vs.recvGrades.size===0)
      + RECV_FILTER_DEFS.filter(([g])=>tally.byRecv[g]).map(([g,l])=>chipRecv(g, `${l} <b>${tally.byRecv[g]}</b>`, vs.recvGrades.has(g))).join('')},
    {label:'Kimenetel', html:
      `<div class="segbox small">${seg(vs.outcome,'all','Összes','setAttackOutcome')}${seg(vs.outcome,'kill','Csak pontok','setAttackOutcome')}${seg(vs.outcome,'err','Csak hibák','setAttackOutcome')}</div>`},
  ], activeBits.join(' · '), `clearAttackFilters('${a.jersey}')`);

  el.innerHTML = `
  <div class="atk-selector">
    ${attackers.map(x=>`<button class="atk-btn ${x.jersey===a.jersey?'active':''}" onclick="CURRENT_ATK_JERSEY='${x.jersey}';renderAttack()">#${x.jersey} ${escHtml(titleCaseName(x.player.name).split(' ')[0])}</button>`).join('')}
  </div>

  <div class="atk-head">
    <div class="atk-head-l">
      <div class="atk-name"><span class="jsy" style="width:32px;height:32px;font-size:1rem">#${a.jersey}</span>
        <div><b>${escHtml(titleCaseName(a.player.name))}</b><div class="atk-role">${escHtml(a.player.role||'')} · ${a.total} ütés a szezonban</div></div></div>
      <div class="atk-sentence">${attackHeadline(viz, a.player)}</div>
    </div>

  </div>

  ${controls}

  ${attackStatCardsHtml(viz)}

  <div class="atk-main">
    <div class="atk-courtwrap">
      ${attackCourtSvg(viz, vs)}
      <div class="atk-legend">${vs.mode==='flow'
        ? 'Vastagság = hányszor üt oda · Szín = mennyire eredményes'
        : (vs.colorBy==='eff' ? 'Szín = hatékonyság (zöld jó, piros gyenge)' : 'Szín = mennyiség (világosabb = többször)')}</div>
      ${attackCoverageNote(viz)}
    </div>
    <div class="atk-side">
      ${attackDetailCard(viz, vs.selected)}
      ${techCardHtml(viz, vs.selected)}
      <div class="card" style="padding:12px"><div class="ch"><h3>🛡 Blokk-tipp</h3></div>
        <div style="font-size:.8rem;color:var(--light);line-height:1.5">${generateAdvice(a.player.role, a.combos, a.tech, a.total, a.ep)}</div></div>
    </div>
  </div>
  ${blockStatsSectionHtml(st)}`;
}
function blockStatsSectionHtml(stats){
  const entries = Object.entries(stats.block).filter(([j,b])=>b.total>=5).map(([j,b])=>{
    const kill = b.grades['#']||0, err = b.grades['=']||0, pos = b.grades['+']||0;
    const total = b.total;
    const killPct = Math.round(100*kill/total), errPct = Math.round(100*err/total);
    const eff = Math.round(100*(kill-err)/total);
    return {jersey:j, total, killPct, errPct, eff, player: stats.players[j]||{name:'#'+j,role:''}};
  }).sort((a,b)=>b.total-a.total);

  if (!entries.length) return '';

  const weakest = entries.slice().sort((a,b)=>a.eff-b.eff)[0];

  let html = `<div class="st">Blokk-hatékonyság — kin keresztül érdemes támadni?</div>
  <div class="al ala"><div>
    <div class="at">Legkihasználhatóbb blokkoló: #${weakest.jersey} ${escHtml(titleCaseName(weakest.player.name))} (${escHtml(weakest.player.role||'')})</div>
    <div class="ad">${weakest.total} blokk-kísérlet · ${weakest.killPct}% blokk-kill · ${weakest.errPct}% hiba · ${weakest.eff>=0?'+':''}${weakest.eff}% hatékonyság — a leggyengébb blokkoló, célszerű az ő oldalán/rajta keresztül támadni.</div>
  </div></div>
  <div class="card"><table class="ov-table">
    <thead><tr><th>#</th><th>Játékos</th><th>Poszt</th><th>Blokk-kísérlet</th>
      <th style="color:#ffc840"># Kill</th><th style="color:#ff6b7a">= Hiba</th><th>Eff.</th></tr></thead><tbody>`;
  entries.forEach(e=>{
    const p = e.player;
    const effColor = e.eff>=15 ? '#27ae60' : e.eff>=0 ? '#f0a500' : '#e63946';
    html += `<tr style="${e.jersey===weakest.jersey?'background:rgba(240,165,0,.06)':''}">
      <td><span class="jsy">${e.jersey}</span></td><td><b>${escHtml(titleCaseName(p.name))}</b></td>
      <td style="font-size:.75rem">${escHtml(p.role||'')}</td><td>${e.total}</td>
      <td style="color:#ffc840">${e.killPct}%</td><td style="color:#ff6b7a">${e.errPct}%</td>
      <td style="font-weight:700;color:${effColor}">${e.eff>=0?'+':''}${e.eff}%</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

let SETTER_GRADE_FILTER = new Set(['#','+']);
let SETTER_FB_RAW = {};
const SETTER_ROT_COLORS = {
  '4-es hely':'#f0a500','2-es hely':'#2ec4b6','Pipe (6-os hely)':'#818cf8',
  '1-es hely':'#fb923c','3-as hely':'#c084fc','5-ös hely':'#4ade80',
  'Feladó támadás':'#f472b6','Egyéb':'#8899aa',
};
const GRADE_LABELS = {'#':'# Kiváló','+':'+ Pozitív','!':'! Közepes','-':'- Negatív','/':'/ Átpattanó','=':'= Hiba'};

function mergeFBForGrades(setterJersey, rot){
  const byGrade = (SETTER_FB_RAW[setterJersey]||{})[rot] || {};
  const merged = {};
  Object.entries(byGrade).forEach(([grade, combos])=>{
    if (!SETTER_GRADE_FILTER.has(grade)) return;
    Object.entries(combos).forEach(([g,n])=>{ merged[g] = (merged[g]||0)+n; });
  });
  const total = Object.values(merged).reduce((a,b)=>a+b,0);
  return {combos: merged, total};
}

function rotationCardHtml(rot, combos, total){
  if (total===0){
    return `<div class="rc">
      <div class="rn">R${rot}</div>
      <div style="font-size:.72rem;color:var(--gray);padding:14px 0">Nincs rögzített feladás a kiválasztott szűrővel ebben a rotációban.</div>
    </div>`;
  }
  const entries = Object.entries(combos).sort((a,b)=>b[1]-a[1]);
  const [topGroup, topN] = entries[0];
  const topPct = Math.round(100*topN/total);
  const topCol = SETTER_ROT_COLORS[topGroup]||'#8899aa';
  const lowSample = total<6;

  let rowsHtml = '';
  entries.forEach(([g,n])=>{
    const pct = Math.round(100*n/total);
    if (pct===0) return;
    const col = SETTER_ROT_COLORS[g]||'#8899aa';
    rowsHtml += `<div class="rpr"><div class="rpd" style="background:${col}"></div><div class="rpn">${escHtml(g)}</div>
      <div style="flex:2;height:4px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;margin:0 3px">
        <div style="width:${pct}%;height:100%;background:${col};border-radius:2px"></div></div>
      <div class="rpp">${pct}%</div></div>`;
  });

  let blockAdvice;
  if (topPct>=55) blockAdvice = `🛡 BLOKK: ${topGroup}! (${topPct}%)`;
  else if (entries.length>=2){
    const [g2,n2] = entries[1];
    const p2 = Math.round(100*n2/total);
    blockAdvice = `🛡 ${topGroup} (${topPct}%) + ${g2} (${p2}%)`;
  } else blockAdvice = `🛡 ${topGroup} (${topPct}%)`;

  const bwarnColor = topPct>=55 ? topCol+'26' : 'rgba(255,255,255,.06)';

  return `<div class="rc">
    <div class="rn">R${rot}</div>
    <div class="rs" style="color:${topCol}">${escHtml(topGroup)}: ${topPct}%</div>
    <div style="font-size:.67rem;color:var(--gray);margin-bottom:6px">${total} db${lowSample?' ⚠️ kis minta':''}</div>
    ${rowsHtml}
    <div style="margin-top:7px;padding:4px 8px;border-radius:4px;background:${bwarnColor};font-size:.69rem;font-weight:700;color:white">${blockAdvice}</div>
  </div>`;
}

function rebuildAllSetterGrids(){
  Object.keys(SETTER_FB_RAW).forEach(setterJersey=>{
    const gridEl = document.getElementById(`rot-grid-${setterJersey}`);
    if (!gridEl) return;
    let gridHtml = '';
    for (let rot=1; rot<=6; rot++){
      const {combos, total} = mergeFBForGrades(setterJersey, rot);
      gridHtml += rotationCardHtml(rot, combos, total);
    }
    gridEl.innerHTML = gridHtml;
  });
}

function toggleSetterGrade(grade){
  if (SETTER_GRADE_FILTER.has(grade)) SETTER_GRADE_FILTER.delete(grade);
  else SETTER_GRADE_FILTER.add(grade);
  if (SETTER_GRADE_FILTER.size===0) SETTER_GRADE_FILTER.add(grade); // never allow empty selection
  updateGradeFilterButtons();
  rebuildAllSetterGrids();
}

function setSetterGradeFilter(grades){
  SETTER_GRADE_FILTER = new Set(grades);
  updateGradeFilterButtons();
  rebuildAllSetterGrids();
}

function updateGradeFilterButtons(){
  const allGrades = ['#','+','!','-'];
  const isAll = allGrades.every(g=>SETTER_GRADE_FILTER.has(g));
  document.querySelectorAll('.grade-filter-btn').forEach(b=>{
    if (b.dataset.grade==='ALL'){ b.classList.toggle('active', isAll); return; }
    b.classList.toggle('active', SETTER_GRADE_FILTER.has(b.dataset.grade));
  });
}


// ═══════════════════════════════════════════════════════════════════════
// SETTER TAB — where does the first attack go after each reception grade,
// and where does the setter put the ball out of transition?
// ═══════════════════════════════════════════════════════════════════════

// ── transition setting: where the ball goes when there was NO reception ──
function transitionSetterHtml(st, setterJersey){
  const raw = st.setterTrans[setterJersey] || {};
  const p = st.players[setterJersey] || {name:'#'+setterJersey};
  const grand = Object.values(raw).reduce((s,r)=>s+Object.values(r).reduce((a,b)=>a+b,0),0);
  if (!grand) return '';

  let cells = '';
  for (let rot=1; rot<=6; rot++){
    const byZone = raw[rot] || {};
    const total = Object.values(byZone).reduce((a,b)=>a+b,0);
    if (!total){
      cells += `<div class="rc"><div class="rn">R${rot}</div>
        <div style="font-size:.72rem;color:var(--gray);padding:14px 0">Nincs rögzített folytatásos feladás.</div></div>`;
      continue;
    }
    const entries = Object.entries(byZone)
      .sort((a,b)=>b[1]-a[1])
      .map(([z,n])=>[START_ZONE_LABEL[z] || (z==='?'?'Ismeretlen':z+'. zóna'), n, z]);
    const [topLabel, topN, topZ] = entries[0];
    const topPct = Math.round(100*topN/total);
    const topCol = SETTER_ZONE_COLORS[topZ] || '#8899aa';

    let rows = '';
    entries.forEach(([label,n,z])=>{
      const pct = Math.round(100*n/total);
      if (!pct) return;
      const col = SETTER_ZONE_COLORS[z] || '#8899aa';
      rows += `<div class="rpr"><div class="rpd" style="background:${col}"></div><div class="rpn">${escHtml(label)}</div>
        <div style="flex:2;height:4px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;margin:0 3px">
          <div style="width:${pct}%;height:100%;background:${col};border-radius:2px"></div></div>
        <div class="rpp">${pct}%</div></div>`;
    });
    const advice = topPct>=55 ? `🛡 BLOKK: ${topLabel}! (${topPct}%)`
      : entries.length>=2 ? `🛡 ${topLabel} (${topPct}%) + ${entries[1][0]} (${Math.round(100*entries[1][1]/total)}%)`
      : `🛡 ${topLabel} (${topPct}%)`;

    cells += `<div class="rc">
      <div class="rn">R${rot}</div>
      <div class="rs" style="color:${topCol}">${escHtml(topLabel)}: ${topPct}%</div>
      <div style="font-size:.67rem;color:var(--gray);margin-bottom:6px">${total} db${total<6?' ⚠️ kis minta':''}</div>
      ${rows}
      <div style="margin-top:7px;padding:4px 8px;border-radius:4px;background:${topPct>=55?topCol+'26':'rgba(255,255,255,.06)'};font-size:.69rem;font-weight:700;color:white">${advice}</div>
    </div>`;
  }

  return `<div class="st">Köztes játék — #${setterJersey} ${escHtml(titleCaseName(p.name))} folytatásból hova ad</div>
  <div class="al ala"><div>
    <div class="at">Ásás, mentés, szabadlabda után — nem nyitásfogadásból</div>
    <div class="ad">Mozgásból, kevesebb opcióval — ezért más az eloszlás, mint nyitásfogadás után. ${grand} feladás.</div>
  </div></div>
  <div class="rg">${cells}</div>`;
}

const SETTER_ZONE_COLORS = {'4':'#f0a500','2':'#2ec4b6','3':'#c084fc','8':'#818cf8','7':'#4ade80','9':'#fb923c','?':'#8899aa'};

function renderSetter(){
  const el = document.getElementById('t4-content');
  if (!CURRENT_STATS){ el.innerHTML = emptyStateHtml(); return; }
  const st = CURRENT_STATS;
  SETTER_FB_RAW = st.setterFB;

  const setterEntries = Object.entries(st.setActions).filter(([j,n])=>n>=8).sort((a,b)=>b[1]-a[1]).slice(0,2);
  if (!setterEntries.length){
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">Nincs elég feladó-adat</div>
      <div class="empty-desc">Ehhez a csapathoz nincs legalább 8 feladással rendelkező játékos.</div></div>`;
    return;
  }

  const systemLabel = setterEntries.length>1 ? '6-2 rendszer · két feladó' : '5-1 rendszer · egy feladó';

  let html = `  <div class="al alt"><div>
    <div class="at">${systemLabel}</div>
    <div class="ad">Alapból csak a jó fogadás (# / +) utáni döntések látszanak — ez mutatja a valódi taktikai szabadságot.</div>
  </div></div>
  <div class="grade-filter-bar">
    <span class="team-picker-label" style="margin-right:4px">FOGADÁS UTÁN:</span>
    <button class="grade-filter-btn" data-grade="ALL" onclick="setSetterGradeFilter(['#','+','!','-'])">Mind</button>
    <button class="grade-filter-btn active" data-grade="#" onclick="toggleSetterGrade('#')"># Kiváló</button>
    <button class="grade-filter-btn active" data-grade="+" onclick="toggleSetterGrade('+')">+ Pozitív</button>
    <button class="grade-filter-btn" data-grade="!" onclick="toggleSetterGrade('!')">! Közepes</button>
    <button class="grade-filter-btn" data-grade="-" onclick="toggleSetterGrade('-')">- Negatív</button>
  </div>`;

  // Only the primary setter keeps a serve-receive grid. The slot that used to
  // hold the second setter now carries the transition report, which is far
  // more useful to a blocker than a near-empty backup-setter grid.
  const [mainJersey] = setterEntries[0];
  {
    const setterJersey = mainJersey;
    const p = st.players[setterJersey] || {name:'#'+setterJersey};
    html += `<div class="st">#${setterJersey} ${escHtml(titleCaseName(p.name))} – Feladás rotációnként (nyitásfogadásból)</div>
    <div class="rg" id="rot-grid-${setterJersey}">`;
    for (let rot=1; rot<=6; rot++){
      const {combos, total} = mergeFBForGrades(setterJersey, rot);
      html += rotationCardHtml(rot, combos, total);
    }
    html += `</div>`;
  }

  html += transitionSetterHtml(st, mainJersey);
  html += `<div class="al alt" style="margin-top:18px"><div>
    <div class="at">Fogadás után hova üt az adott ütő?</div>
    <div class="ad">Ez az ÜTÉSI TAKTIKA fülre került át: ott a <b>Fogadás</b> szűrővel (# / + / ! / -) ugyanezt látod, ráadásul a honnan-üt és labdatempó szűrőkkel kombinálva, egy helyen.</div>
  </div></div>`;
  html += rotationEfficiencySectionHtml(st);

  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER: SERVE TAB
// ═══════════════════════════════════════════════════════════════════════

function rotationEfficiencySectionHtml(stats){
  const rots = [1,2,3,4,5,6].map(r=>{
    const b = stats.rotation[r];
    if (!b) return null;
    const serveTotal = b.serveWon+b.serveLost;
    const recvTotal = b.recvWon+b.recvLost;
    const servePct = serveTotal? Math.round(100*b.serveWon/serveTotal) : null;
    const sideOutPct = recvTotal? Math.round(100*b.recvWon/recvTotal) : null;
    return {rot:r, servePct, sideOutPct, serveTotal, recvTotal};
  }).filter(Boolean);

  if (!rots.length) return '';

  const barColor = (pct)=> pct===null ? '#8899aa' : pct>=55 ? '#27ae60' : pct>=42 ? '#f0a500' : '#e63946';

  let html = `<div class="st">Rotációs hatékonyság — hol a leggyengébb láncszem?</div>
  <div class="al alt"><div>
    <div class="at">Melyik rotációjuk erős, és melyik támadható?</div>
    <div class="ad">
      <b>BP% (Break Point)</b> — amikor <b>ŐK nyitnak</b> ebben a rotációban, ilyen arányban nyerik meg a labdamenetet. Magas érték = jó a nyitásuk és a blokkjuk, nehéz tőlük pontot venni.<br>
      <b>SO% (Side-out)</b> — amikor <b>MI nyitunk</b> nekik, ilyen arányban szerzik vissza a pontot. <b>Alacsony SO% = ide nyiss</b>, mert ebben a rotációban nehezen jönnek vissza fogadásból.
    </div>
  </div></div>
  <div class="rg">`;

  rots.forEach(r=>{
    const lowSample = (r.serveTotal<10 || r.recvTotal<10);
    html += `<div class="rc">
      <div class="rn">R${r.rot}</div>
      <div style="margin:6px 0">
        <div style="font-size:.68rem;color:var(--gray);margin-bottom:2px">BP% – ők nyitnak (${r.serveTotal} db)</div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:8px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden">
            <div style="width:${r.servePct||0}%;height:100%;background:${barColor(r.servePct)};border-radius:4px"></div>
          </div>
          <span style="font-size:.78rem;font-weight:700;color:${barColor(r.servePct)};min-width:32px">${r.servePct!==null?r.servePct+'%':'–'}</span>
        </div>
      </div>
      <div>
        <div style="font-size:.68rem;color:var(--gray);margin-bottom:2px">SO% – mi nyitunk (${r.recvTotal} db)</div>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:8px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden">
            <div style="width:${r.sideOutPct||0}%;height:100%;background:${barColor(r.sideOutPct)};border-radius:4px"></div>
          </div>
          <span style="font-size:.78rem;font-weight:700;color:${barColor(r.sideOutPct)};min-width:32px">${r.sideOutPct!==null?r.sideOutPct+'%':'–'}</span>
        </div>
      </div>
      ${(()=>{ if(r.sideOutPct===null) return '';
        const v = r.sideOutPct<=45 ? ['TÁMADHATÓ','#27ae60','rgba(39,174,96,.15)']
                : r.sideOutPct>=62 ? ['ERŐS ROTÁCIÓ','#e63946','rgba(230,57,70,.15)']
                : ['ÁTLAGOS','#f0a500','rgba(240,165,0,.12)'];
        return `<div style="margin-top:8px;padding:3px 6px;border-radius:4px;background:${v[2]};color:${v[1]};font-size:.66rem;font-weight:700">${v[0]}</div>`; })()}
      ${lowSample ? '<div style="margin-top:6px;font-size:.65rem;color:var(--gray)">⚠️ kis minta</div>' : ''}
    </div>`;
  });

  html += `</div>`;
  return html;
}

function perRotationServeTargetHtml(stats){
  const rots = [];
  for (let r=1; r<=6; r++){
    const byPlayer = stats.recvByRotation[r];
    if (!byPlayer) continue;
    const entries = Object.entries(byPlayer).filter(([j,d])=>d.total>=3).map(([j,d])=>{
      const exc=d.grades['#']||0, pos=d.grades['+']||0, neg=d.grades['-']||0, err=d.grades['=']||0;
      const total = d.total;
      const goodPct = Math.round(100*(exc+pos)/total);
      const errPct = Math.round(100*err/total);
      const negPct = Math.round(100*neg/total);
      const weakness = errPct*2 + negPct - goodPct;
      return {jersey:j, total, goodPct, errPct, weakness, player: stats.players[j]||{name:'#'+j,role:''}};
    }).sort((a,b)=>b.weakness-a.weakness);
    if (entries.length) rots.push({rot:r, entries});
  }
  if (!rots.length) return '';

  let html = `<div class="st">Rotációnkénti nyitási célpont</div>
  <div class="al ala"><div>
    <div class="at">Rotációnként más a leggyengébb fogadó</div>
    <div class="ad">A fenti összesített rangsor az egész csapatra szól. Ez a bontás rotációnként mutatja, ki a leggyengébb fogadójuk — az <b>R1–R6</b> ugyanazt jelenti, mint a Feladó riportban (a feladó helye a pályán), így a két fül adatai összevethetők.</div>
  </div></div>
  <div class="rg">`;

  rots.forEach(({rot,entries})=>{
    const weakest = entries[0];
    const p = weakest.player;
    const lowSample = weakest.total<10;
    html += `<div class="rc">
      <div class="rn">R${rot}</div>
      <div class="rs" style="color:var(--red)">🎯 #${weakest.jersey} ${escHtml(titleCaseName(p.name).split(' ')[0])}</div>
      <div style="font-size:.68rem;color:var(--gray);margin-bottom:8px">${escHtml(p.role||'')} · ${weakest.total} db${lowSample?' ⚠️':''}</div>
      <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:3px">
        <span style="color:var(--gray)">Pozitív</span><span style="color:#4ade80;font-weight:700">${weakest.goodPct}%</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.72rem">
        <span style="color:var(--gray)">Hiba</span><span style="color:#ff6b7a;font-weight:700">${weakest.errPct}%</span>
      </div>
      ${entries.length>1 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);font-size:.68rem;color:var(--gray)">Másik fogadó itt: #${entries[1].jersey} ${escHtml(titleCaseName(entries[1].player.name).split(' ')[0])} (${entries[1].goodPct}%)</div>` : ''}
    </div>`;
  });

  html += `</div>`;
  return html;
}

function doubleTargetRotationHtml(stats){
  const rotData = [];
  for (let r=1; r<=6; r++){
    const rotStat = stats.rotation[r];
    const byPlayer = stats.recvByRotation[r];
    if (!rotStat || !byPlayer) continue;
    const recvTotal = rotStat.recvWon + rotStat.recvLost;
    if (recvTotal < 5) continue;
    const sideOutPct = Math.round(100*rotStat.recvWon/recvTotal);

    const entries = Object.entries(byPlayer).filter(([j,d])=>d.total>=3).map(([j,d])=>{
      const pos=d.grades['#']||0, plus=d.grades['+']||0, neg=d.grades['-']||0, err=d.grades['=']||0;
      const total = d.total;
      const goodPct = Math.round(100*(pos+plus)/total);
      const weakness = Math.round(100*err/total)*2 + Math.round(100*neg/total) - goodPct;
      return {jersey:j, total, goodPct, weakness, player: stats.players[j]||{name:'#'+j,role:''}};
    }).sort((a,b)=>b.weakness-a.weakness);
    if (!entries.length) continue;
    const weakest = entries[0];

    const priorityScore = (100-sideOutPct) + weakest.weakness;
    rotData.push({rot:r, sideOutPct, recvTotal, weakest, priorityScore, sampleOk: recvTotal>=10 && weakest.total>=6});
  }
  if (!rotData.length) return '';
  rotData.sort((a,b)=>b.priorityScore-a.priorityScore);
  const top = rotData[0];
  // Only worth calling out when one rotation genuinely stands apart. Measured
  // across the loaded teams the gap to the runner-up is 30-80 where a real
  // weak spot exists and 1-7 where every rotation is equally solid, so 25
  // cleanly separates "attack this one" from "no single target".
  if (rotData.length>1 && (top.priorityScore - rotData[1].priorityScore) < 25) return '';

  const pName = titleCaseName(top.weakest.player.name);
  return `<div class="al alr"><div>
    <div class="at">Dupla célpont: R${top.rot} rotáció</div>
    <div class="ad">Ebben a rotációban kettős az előny: a csapat side-out%-a mindössze <b>${top.sideOutPct}%</b> (${top.recvTotal} db fogadásból — nehezen jönnek vissza fogadásból), ÉS a leggyengébb fogadójuk (#${top.weakest.jersey} ${escHtml(pName)}, ${top.weakest.goodPct}% pozitív) is itt van bent. Ha egyetlen rotációra koncentrálnál a nyitással, ez legyen az.
    ${!top.sampleOk ? '<br><span style="color:var(--gray)">⚠️ Kis minta — több meccs adatával pontosabb lenne.</span>' : ''}</div>
  </div></div>`;
}

function zoneToXY(zoneStr){
  // Serve target zone (1-9) on the receiving court, laid out like the attack
  // chart: front row 4/3/2 (left->right), back row 5/6/1, short zones 7/8/9.
  const z = parseInt(zoneStr,10);
  const map = {
    7:[0.17,0.14], 8:[0.50,0.14], 9:[0.83,0.14],
    4:[0.17,0.40], 3:[0.50,0.40], 2:[0.83,0.40],
    5:[0.17,0.78], 6:[0.50,0.78], 1:[0.83,0.78],
  };
  const p = map[z] || [0.5,0.5];
  return {x:p[0], y:p[1]};
}

function serveZoneSVG(zones, total, W, H){
  W = W||210; H=H||150;
  const lm = 10;
  let s = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">`];
  s.push(`<rect width="${W}" height="${H}" fill="#1a0808" rx="5"/>`);
  s.push(`<rect x="${lm}" y="${lm+6}" width="${W-2*lm}" height="${H-2*lm-6}" fill="#0d1020" rx="3" stroke="#2a1a3a" stroke-width="1"/>`);
  s.push(`<rect x="${lm-2}" y="${lm-1}" width="${W-2*lm+4}" height="6" fill="#f0a500" rx="2"/>`);
  s.push(`<text x="${W/2}" y="${lm+4}" text-anchor="middle" fill="#0a1628" font-size="5.5" font-family="Arial" font-weight="bold">HÁLÓ</text>`);
  Object.entries({7:[0.17,0.14],8:[0.50,0.14],9:[0.83,0.14],4:[0.17,0.40],3:[0.50,0.40],2:[0.83,0.40],5:[0.17,0.78],6:[0.50,0.78],1:[0.83,0.78]}).forEach(([z,p])=>{
    s.push(`<text x="${(lm+p[0]*(W-2*lm)).toFixed(1)}" y="${(lm+6+p[1]*(H-2*lm-6)+3).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.10)" font-size="9" font-family="Arial">${z}</text>`);
  });
  const maxCount = Math.max(...Object.values(zones), 1);
  Object.entries(zones).forEach(([z,n])=>{
    const {x,y} = zoneToXY(z);
    const px = lm + x*(W-2*lm);
    const py = lm+6 + y*(H-2*lm-6);
    const r = 5 + 13*(n/maxCount);
    const pct = Math.round(100*n/total);
    const alpha = 0.30 + 0.55*(n/maxCount);
    s.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="#e63946" opacity="${alpha.toFixed(2)}" stroke="#e63946" stroke-width="1"/>`);
    if (pct>=7) s.push(`<text x="${px.toFixed(1)}" y="${(py+3).toFixed(1)}" text-anchor="middle" fill="white" font-size="7.5" font-family="Arial" font-weight="bold">${pct}%</text>`);
  });
  s.push('</svg>');
  return s.join('\n');
}

function serveZoneMapSectionHtml(stats){
  const servers = Object.entries(stats.serve).filter(([j,s])=>s.total>=10 && Object.keys(s.zones||{}).length>0)
    .map(([j,s])=>({jersey:j, total:s.total, zones:s.zones, player: stats.players[j]||{name:'#'+j,role:''}}))
    .sort((a,b)=>b.total-a.total)
    .slice(0,6);
  if (!servers.length) return '';

  let html = `<div class="st">Saját nyitás célzási térkép</div>
  <div class="al alt"><div>
    <div class="at">Hova szoktak célozni a nyitóik?</div>
    <div class="ad">A kör mérete a gyakoriságot mutatja — ez alapján állítható be a fogadó formáció.</div>
  </div></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:20px">`;
  servers.forEach(s=>{
    const name = titleCaseName(s.player.name);
    html += `<div class="card" style="padding:12px">
      <div style="font-size:.8rem;font-weight:700;color:var(--white);margin-bottom:2px">#${s.jersey} ${escHtml(name.split(' ')[0])}</div>
      <div style="font-size:.68rem;color:var(--gray);margin-bottom:8px">${escHtml(s.player.role||'')} · ${s.total} db nyitás</div>
      ${serveZoneSVG(s.zones, s.total)}
    </div>`;
  });
  html += `</div>`;
  return html;
}

function renderServe(){
  const el = document.getElementById('t5-content');
  if (!CURRENT_STATS){ el.innerHTML = emptyStateHtml(); return; }
  const st = CURRENT_STATS;

  const recvEntries = Object.entries(st.recv).filter(([j,r])=>r.total>=5).map(([j,r])=>{
    const exc = r.grades['#']||0, pos = r.grades['+']||0, mid = r.grades['!']||0, neg = r.grades['-']||0, err = r.grades['=']||0;
    const total = r.total;
    const excPct = Math.round(100*exc/total), posPct = Math.round(100*pos/total), midPct = Math.round(100*mid/total);
    const negPct = Math.round(100*neg/total), errPct = Math.round(100*err/total);
    const weakness = errPct*2 + negPct - (excPct+posPct);
    return {jersey:j, total, excPct, posPct, midPct, negPct, errPct, weakness, player: st.players[j]||{name:'#'+j,role:''}};
  }).sort((a,b)=>b.weakness-a.weakness);

  if (!recvEntries.length){
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">Nincs elég fogadási adat</div>
      <div class="empty-desc">Ehhez a csapathoz nincs legalább 5 fogadással rendelkező játékos.</div></div>`;
    return;
  }

  // Headline recommendations need a more reliable sample than the full table
  // (an n=5 receiver can show 0% purely by chance) — prefer players with >=12
  // receptions for the featured targets, falling back to the full list only
  // if nobody meets that bar.
  const RELIABLE_MIN = 12;
  const reliablePool = recvEntries.filter(r=>r.total>=RELIABLE_MIN);
  const pool = reliablePool.length ? reliablePool : recvEntries;
  const target1 = pool[0];
  const target2 = pool.length>1 ? pool[1] : null;
  const strongest = pool[pool.length-1];

  let html = '';
  html += doubleTargetRotationHtml(st);

  const t1Name = titleCaseName(target1.player.name);
  const t2Label = target2 ? `#${target1.jersey}–#${target2.jersey} között` : '';
  const avoidLabel = `#${strongest.jersey} ${titleCaseName(strongest.player.name).split(' ')[0]} (${strongest.player.role||''})`;

  html += `<div class="serve-court">
    <div>${serveCourtSVG({num:target1.jersey, name:t1Name}, t2Label, avoidLabel)}</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="al alr"><div>
        <div class="at">#1 CÉL: #${target1.jersey} ${escHtml(t1Name)} (${escHtml(target1.player.role||'')})</div>
        <div class="ad">${target1.total} fogadás · <b>${target1.excPct+target1.posPct}% pozitív</b> · ${target1.errPct}% közvetlen hiba · Negatív: ${target1.negPct}%<br>
          Float nyitással a testére vagy a domináns oldalára célozva. Ha megzavarjuk a fogadásban, a csapat ütőrendszere felbomlik.</div>
      </div></div>`;
  if (target2){
    const t2Name = titleCaseName(target2.player.name);
    html += `<div class="al ala"><div>
      <div class="at">#2: #${target1.jersey} és #${target2.jersey} ${escHtml(t2Name.split(' ')[0])} közé</div>
      <div class="ad">A két gyengébb fogadó közé nyitott labda kommunikációs zavart okoz — mindkét oldal kevésbé stabil fogadó.</div>
    </div></div>`;
  }
  html += `<div class="al alg"><div>
      <div class="at">Kerüld: #${strongest.jersey} ${escHtml(titleCaseName(strongest.player.name))} (${escHtml(strongest.player.role||'')})</div>
      <div class="ad">${strongest.total} fogadás · ${strongest.excPct+strongest.posPct}% pozitív — a csapat legjobb fogadója, ide nyitva rendezett feladást kapnak.</div>
    </div></div>
  </div></div>`;

  // Reception ranking table
  html += `<div class="st">Fogadási minőség – rangsor</div><table class="recv-table">
  <thead><tr><th>#</th><th>Játékos</th><th>Poszt</th><th>Fogadás</th>
    <th style="color:#ffc840"># Kiv.</th><th style="color:#4ade80">+ Poz.</th>
    <th>! Köz.</th><th style="color:#fb923c">- Neg.</th><th style="color:#ff6b7a">= Hiba</th>
    <th>Javaslat</th></tr></thead><tbody>`;
  recvEntries.forEach((r)=>{
    const p = r.player;
    let rec = '';
    let isTarget1 = target1 && r.jersey===target1.jersey;
    if (isTarget1) rec = '<span class="tag td">FŐ CÉL</span>';
    else if (target2 && r.jersey===target2.jersey) rec = '<span class="tag tw">#2 CÉL</span>';
    else if (r.jersey===strongest.jersey) rec = '❌ Kerüld!';
    if (r.total<RELIABLE_MIN) rec += ` <span style="color:var(--gray);font-weight:400">(kis minta)</span>`;
    html += `<tr style="${isTarget1?'background:rgba(230,57,70,.06)':''}">
      <td><span class="jsy">${r.jersey}</span></td><td><b>${escHtml(titleCaseName(p.name))}</b></td>
      <td style="font-size:.75rem">${escHtml(p.role||'')}</td><td>${r.total}</td>
      <td style="color:#ffc840">${r.excPct}%</td><td style="color:#4ade80">${r.posPct}%</td>
      <td>${r.midPct}%</td><td style="color:#fb923c">${r.negPct}%</td><td style="color:#ff6b7a">${r.errPct}%</td>
      <td style="font-size:.75rem;font-weight:700">${rec}</td></tr>`;
  });
  html += `</tbody></table>`;

  html += perRotationServeTargetHtml(st);

  // Own serve threat table
  const serveEntries = Object.entries(st.serve).filter(([j,s])=>s.total>=5).map(([j,s])=>{
    const g = s.grades, total = s.total, r = n => Math.round(100*(n||0)/total);
    return {jersey:j, total,
      acePct: r(g['#']), brkPct: r(g['/']), posPct: r(g['+']),
      midPct: r(g['!']), negPct: r(g['-']), errPct: r(g['=']),
      player: st.players[j]||{name:'#'+j,role:''}};
  }).sort((a,b)=>(b.acePct+b.brkPct+b.posPct)-(a.acePct+a.brkPct+a.posPct));

  if (serveEntries.length){
    html += `<div class="st">${escHtml(CURRENT_TEAM)} saját nyitásai – mire figyeljünk fogadásban</div>
    <div class="al alt"><div>
      <div class="at">Minden osztályzat külön oszlopban</div>
      <div class="ad">A Nyomás oszlop az ász, az átpattanó és a pozitív nyitások összege — ennyi nyitásuk után nem tud rendezetten támadni a fogadó.</div>
    </div></div>
    <table class="recv-table"><thead><tr><th>#</th><th>Nyitó</th><th>Poszt</th><th>Nyitás</th>
      <th style="color:#ffc840"># Ász</th><th style="color:#3b5bdb">/ Átpattanó</th>
      <th style="color:#4ade80">+ Pozitív</th><th>! Közepes</th>
      <th style="color:#fb923c">- Negatív</th><th style="color:#ff6b7a">= Hiba</th>
      <th>Nyomás</th></tr></thead><tbody>`;
    serveEntries.forEach(r=>{
      const p = r.player;
      const pressure = r.acePct + r.brkPct + r.posPct;
      const pCol = pressure>=35 ? '#ff6b7a' : pressure>=22 ? '#f0a500' : 'var(--gray)';
      html += `<tr><td><span class="jsy">${r.jersey}</span></td><td><b>${escHtml(titleCaseName(p.name))}</b></td>
        <td style="font-size:.75rem">${escHtml(p.role||'')}</td><td>${r.total}</td>
        <td style="color:#ffc840;font-weight:700">${r.acePct}%</td>
        <td style="color:#3b5bdb;font-weight:700">${r.brkPct}%</td>
        <td style="color:#4ade80">${r.posPct}%</td>
        <td>${r.midPct}%</td>
        <td style="color:#fb923c">${r.negPct}%</td>
        <td style="color:#ff6b7a;font-weight:700">${r.errPct}%</td>
        <td style="font-weight:700;color:${pCol}">${pressure}%</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  html += serveZoneMapSectionHtml(st);

  el.innerHTML = html;
}




// ═══════════════════════════════════════════════════════════════════════
// MATCH-DAY ONE-PAGER — a single sheet the coach can share with the squad
// ═══════════════════════════════════════════════════════════════════════

function pickExpectedSix(st){
  const atk = Object.entries(st.attack).filter(([j,a])=>a.total>=5)
    .map(([j,a])=>({jersey:j, ...attackSummary(a), combos:a.combos, tech:a.tech,
                    player: st.players[j]||{name:'#'+j, role:''}}))
    .sort((a,b)=>b.total-a.total);
  const take=(role,n)=>atk.filter(x=>x.player.role===role).slice(0,n);
  const six = [...take('Center',2), ...take('Szélső ütő',2), ...take('Átló',1)];
  const used = new Set(six.map(x=>x.jersey));
  const sub = atk.find(x=>!used.has(x.jersey));
  return {six, sub};
}

function attackerAdviceShort(a){
  const top = Object.entries(a.combos).sort((x,y)=>y[1]-x[1])[0];
  const dir = top ? top[0] : '–';
  const dirPct = top ? Math.round(100*top[1]/a.total) : 0;
  const techTot = Object.values(a.tech).reduce((x,y)=>x+y,0)||1;
  const tipPct = Math.round(100*(a.tech['T']||0)/techTot);
  let tip = dirPct>=70 ? 'Szinte mindig ide üt — zárd le ezt az irányt.'
                       : 'Váltogat, ne köteleződj el korán egy irány mellett.';
  if (tipPct>=25) tip += ` Sokat ejt (${tipPct}%) — ne ugorj be túl korán.`;
  if (a.ep>=15) tip += ` Sokat hibázik (${a.ep}%) — türelmes védekezéssel is megfogható.`;
  return {dir, dirPct, tip};
}

function buildMatchdayMessages(st){
  const msgs=[];
  const recv = Object.entries(st.recv).filter(([j,r])=>r.total>=12).map(([j,r])=>{
    const good=(r.grades['#']||0)+(r.grades['+']||0), err=r.grades['=']||0, neg=r.grades['-']||0, t=r.total;
    return {jersey:j, goodPct:Math.round(100*good/t),
            weak:Math.round(100*err/t)*2+Math.round(100*neg/t)-Math.round(100*good/t),
            player: st.players[j]||{name:'#'+j}};
  }).sort((a,b)=>b.weak-a.weak);
  if (recv.length) msgs.push(`Nyitás: <b>#${recv[0].jersey} ${escHtml(titleCaseName(recv[0].player.name))}</b> a leggyengébb fogadójuk (${recv[0].goodPct}% pozitív) — rá menjen a labda.`);

  const rots=[];
  for(let r=1;r<=6;r++){ const b=st.rotation[r]; if(!b) continue;
    const tot=b.recvWon+b.recvLost; if(tot<8) continue;
    rots.push({r, so:Math.round(100*b.recvWon/tot)}); }
  rots.sort((a,b)=>a.so-b.so);
  if (rots.length) msgs.push(`A <b>R${rots[0].r}</b> rotációjuk a leggyengébb: csak ${rots[0].so}%-ban jönnek vissza fogadásból — itt kell nyomni a nyitással.`);

  const atk = Object.entries(st.attack).filter(([j,a])=>a.total>=15)
    .map(([j,a])=>({jersey:j, ...attackSummary(a), player: st.players[j]||{name:'#'+j}}))
    .sort((a,b)=>b.eff-a.eff);
  if (atk.length){ const t=atk[0];
    msgs.push(`Legveszélyesebb ütőjük <b>#${t.jersey} ${escHtml(titleCaseName(t.player.name))}</b> (${t.kp}% kill) — rá készüljön a blokk.`); }
  while(msgs.length<3) msgs.push('');
  return msgs.slice(0,3);
}

function matchdaySetterHtml(st){
  const setters = Object.entries(st.setActions).filter(([j,n])=>n>=8).sort((a,b)=>b[1]-a[1]).slice(0,1);
  if(!setters.length) return '';
  const [sj] = setters[0];
  const p = st.players[sj]||{name:'#'+sj};
  const fb = st.setterFB[sj]||{};
  let cells='';
  for(let rot=1;rot<=6;rot++){
    const byGrade=fb[rot]||{};
    const merged={};
    ['#','+'].forEach(g=>{ Object.entries(byGrade[g]||{}).forEach(([k,v])=>{merged[k]=(merged[k]||0)+v;}); });
    const tot=Object.values(merged).reduce((a,b)=>a+b,0);
    if(!tot){ cells+=`<div class="md-rot"><div class="md-rot-n">R${rot}</div><div class="md-rot-e">nincs adat</div></div>`; continue; }
    const e=Object.entries(merged).sort((a,b)=>b[1]-a[1]);
    const top=e[0], pct=Math.round(100*top[1]/tot);
    const second = e[1] ? `${escHtml(e[1][0])} ${Math.round(100*e[1][1]/tot)}%` : '';
    cells+=`<div class="md-rot"><div class="md-rot-n">R${rot}</div>
      <div class="md-rot-top">${escHtml(top[0])}</div><div class="md-rot-pct">${pct}%</div>
      ${second?`<div class="md-rot-e">${second}</div>`:''}</div>`;
  }
  return `<div class="md-sec"><h3>📋 Feladó — jó fogadás után hova ad</h3>
    <div class="md-sub">#${sj} ${escHtml(titleCaseName(p.name))}</div>
    <div class="md-rotgrid">${cells}</div></div>`;
}

let MD_STATE = null;      // editable match-day sheet state for the current team
let MD_TOOL  = 'player';  // active drawing tool
let MD_PENDING = null;    // first click of a two-click tool

function mdStorageKey(team){ return (team||'').replace(/[.#$\[\]\/]/g,'_'); }

function mdDefaultState(st){
  return { msgs: buildMatchdayMessages(st), serveOrder: null, serveNotes: {}, attackNotes: {}, courts: [ {name:'', items:[]} ] };
}

function loadMatchdayNotes(team, st, cb){
  const fallback = mdDefaultState(st);
  if (!fbDb){ cb(fallback); return; }
  fbDb.ref('matchdayNotes/'+mdStorageKey(team)).once('value')
    .then(sn=>{
      const v = sn.val();
      if (!v){ cb(fallback); return; }
      cb({ msgs: v.msgs || fallback.msgs,
           serveOrder: v.serveOrder || null,
           serveNotes: v.serveNotes || {},
           attackNotes: v.attackNotes || {},
           courts: (v.courts && v.courts.length) ? v.courts : fallback.courts });
    })
    .catch(()=>cb(fallback));
}

function saveMatchdayNotes(){
  if (!fbDb || !IS_ADMIN || !CURRENT_TEAM || !MD_STATE) return;
  fbDb.ref('matchdayNotes/'+mdStorageKey(CURRENT_TEAM)).set({
    msgs: MD_STATE.msgs, serveOrder: MD_STATE.serveOrder,
    serveNotes: MD_STATE.serveNotes, attackNotes: MD_STATE.attackNotes,
    courts: MD_STATE.courts, updated: Date.now()
  }).catch(()=>{});
  const el = document.getElementById('md-save-note');
  if (el){ el.textContent = 'Mentve ✓'; setTimeout(()=>{ if(el) el.textContent=''; }, 1500); }
}

// ── serve receivers, ordered (first = main target) ──────────────────────
function mdServeList(st){
  const list = Object.entries(st.recv).filter(([j,r])=>r.total>=8).map(([j,r])=>{
    const good=(r.grades['#']||0)+(r.grades['+']||0), err=r.grades['=']||0, neg=r.grades['-']||0;
    const t=r.total;
    return {jersey:j, total:t, goodPct:Math.round(100*good/t), errPct:Math.round(100*err/t),
            weak:Math.round(100*err/t)*2+Math.round(100*neg/t)-Math.round(100*good/t),
            player: st.players[j]||{name:'#'+j, role:''}};
  }).sort((a,b)=>b.weak-a.weak);
  if (MD_STATE && MD_STATE.serveOrder){
    const byJ = {}; list.forEach(x=>byJ[x.jersey]=x);
    const ordered = MD_STATE.serveOrder.map(j=>byJ[j]).filter(Boolean);
    list.forEach(x=>{ if (ordered.indexOf(x)<0) ordered.push(x); });
    return ordered;
  }
  return list;
}

function mdOnDragStart(ev, jersey){ ev.dataTransfer.setData('text/plain', jersey); ev.dataTransfer.effectAllowed='move'; }
function mdOnDragOver(ev){ ev.preventDefault(); ev.dataTransfer.dropEffect='move'; }
function mdOnDrop(ev, targetJersey){
  ev.preventDefault();
  const from = ev.dataTransfer.getData('text/plain');
  if (!from || from===targetJersey) return;
  const order = mdServeList(CURRENT_STATS).map(x=>x.jersey);
  const i = order.indexOf(from), k = order.indexOf(targetJersey);
  if (i<0 || k<0) return;
  order[i] = targetJersey; order[k] = from;   // swap: the old target goes back to the list
  MD_STATE.serveOrder = order;
  saveMatchdayNotes();
  renderMatchday();
}

function mdSetNote(kind, jersey, el){
  const v = el.textContent.trim();
  if (kind==='serve') MD_STATE.serveNotes[jersey] = v; else MD_STATE.attackNotes[jersey] = v;
  saveMatchdayNotes();
}
function mdSetMsg(i, el){ MD_STATE.msgs[i] = el.textContent.trim(); saveMatchdayNotes(); }

// ── direction wording from the attacker's real landing zones ────────────
function mdDirectionText(a, st){
  const det = (st.attack[a.jersey]||{}).attackDetails || {};
  const zones = {};
  Object.values(det).forEach(rs=>rs.forEach(r=>{ if(r.zone!=null) zones[r.zone]=(zones[r.zone]||0)+1; }));
  const tot = Object.values(zones).reduce((x,y)=>x+y,0);
  if (!tot) return '';
  const startTally = {};
  Object.values(det).forEach(rs=>rs.forEach(r=>{ if(r.start) startTally[r.start]=(startTally[r.start]||0)+1; }));
  const startTop = Object.entries(startTally).sort((x,y)=>y[1]-x[1])[0];
  const start = startTop ? parseInt(startTop[0],10) : 4;
  const named = {1:'1-es hely',2:'2-es hely',3:'3-as hely',4:'4-es hely',5:'5-ös hely',6:'6-os hely',7:'rövid 4',8:'rövid 3',9:'rövid 2'};
  const top = Object.entries(zones).sort((a,b)=>b[1]-a[1]).slice(0,2);
  const label = z => {
    const zn = +z;
    if (start===4 || start===7){ if (zn===5||zn===6) return 'kereszt'; if (zn===1||zn===2) return 'vonal'; }
    if (start===2 || start===9){ if (zn===5||zn===4) return 'vonal'; if (zn===1||zn===2) return 'kereszt'; }
    if (zn===6) return '6-os hely';
    return named[zn]||(zn+'. zóna');
  };
  return top.map(([z,n])=>`${label(z)} ${Math.round(100*n/tot)}%`).join(' · ');
}

// ── drawing board ───────────────────────────────────────────────────────
const MD_COLORS = {sarga:'#f0a500', zold:'#22c55e', piros:'#e63946', feher:'#ffffff'};
let MD_COLOR = 'sarga';

function mdCourtSvg(idx, court, editable){
  const W=320,H=460,lm=12,cw=(W-2*lm)/3;
  const serveH=26;                       // serve strips behind each end line
  const top=8+serveH, bot=H-8-serveH, netY=(top+bot)/2;
  const cx=[lm+cw*0.5, lm+cw*1.5, lm+cw*2.5];
  const rowH=(netY-top)/2;
  // opponent half (top): front 4-3-2, back 5-6-1 ; own half (bottom): front 2-3-4, back 1-6-5
  const zoneLabels = [
    [cx[0],top+rowH*0.5,'5'],[cx[1],top+rowH*0.5,'6'],[cx[2],top+rowH*0.5,'1'],
    [cx[0],top+rowH*1.5,'4'],[cx[1],top+rowH*1.5,'3'],[cx[2],top+rowH*1.5,'2'],
    [cx[0],netY+rowH*0.5,'2'],[cx[1],netY+rowH*0.5,'3'],[cx[2],netY+rowH*0.5,'4'],
    [cx[0],netY+rowH*1.5,'1'],[cx[1],netY+rowH*1.5,'6'],[cx[2],netY+rowH*1.5,'5'],
  ];
  let s=[`<svg id="md-court-${idx}" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:320px;display:block;background:#0a1424;border-radius:8px;${editable?'cursor:crosshair':''}" ${editable?`onclick="mdCourtClick(event,${idx})"`:''}>`];
  // serve strips
  s.push(`<rect x="${lm}" y="8" width="${W-2*lm}" height="${serveH-3}" fill="#0b1a2c" stroke="#1b2c44" stroke-dasharray="3,2"/>`);
  s.push(`<rect x="${lm}" y="${bot+3}" width="${W-2*lm}" height="${serveH-3}" fill="#0b1a2c" stroke="#1b2c44" stroke-dasharray="3,2"/>`);
  s.push(`<text x="${lm+5}" y="${8+serveH-8}" fill="rgba(255,255,255,.22)" font-size="7.5" font-family="Arial">nyitás</text>`);
  s.push(`<text x="${lm+5}" y="${bot+serveH-6}" fill="rgba(255,255,255,.22)" font-size="7.5" font-family="Arial">nyitás</text>`);
  // courts
  s.push(`<rect x="${lm}" y="${top}" width="${W-2*lm}" height="${netY-top}" fill="#12162a" stroke="#2a3550"/>`);
  s.push(`<rect x="${lm}" y="${netY}" width="${W-2*lm}" height="${bot-netY}" fill="#0f2136" stroke="#24405e"/>`);
  for(const i of [1,2]){ const x=lm+cw*i;
    s.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bot}" stroke="rgba(255,255,255,.07)"/>`); }
  s.push(`<line x1="${lm}" y1="${top+rowH}" x2="${W-lm}" y2="${top+rowH}" stroke="rgba(255,255,255,.07)"/>`);
  s.push(`<line x1="${lm}" y1="${netY+rowH}" x2="${W-lm}" y2="${netY+rowH}" stroke="rgba(255,255,255,.07)"/>`);
  zoneLabels.forEach(([x,y,t])=>s.push(`<text x="${x}" y="${y+4}" text-anchor="middle" fill="rgba(255,255,255,.10)" font-size="13" font-family="Arial">${t}</text>`));
  s.push(`<rect x="${lm-2}" y="${netY-3}" width="${W-2*lm+4}" height="6" fill="#f0a500"/>`);

  (court.items||[]).forEach((it,k)=>{
    const col = MD_COLORS[it.color] || MD_COLORS.sarga;
    if (it.t==='a' || it.t==='c' || it.t==='z'){
      s.push(`<defs><marker id="mdh${idx}_${k}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><polygon points="0 0, 7 3.5, 0 7" fill="${col}"/></marker></defs>`);
      let d;
      if (it.t==='a') d=`M${it.x1},${it.y1} L${it.x2},${it.y2}`;
      else if (it.t==='c'){ const mx=(it.x1+it.x2)/2, my=(it.y1+it.y2)/2-38; d=`M${it.x1},${it.y1} Q${mx},${my} ${it.x2},${it.y2}`; }
      else d=buildZigzagPath(it.x1,it.y1,it.x2,it.y2,9);
      s.push(`<path d="${d}" stroke="${col}" stroke-width="2.4" fill="none" marker-end="url(#mdh${idx}_${k})"/>`);
    } else if (it.t==='o'){
      s.push(`<ellipse cx="${it.x}" cy="${it.y}" rx="${it.rx}" ry="${it.ry}" fill="none" stroke="${col}" stroke-width="2.2" stroke-dasharray="5,3"/>`);
    } else if (it.t==='d'){
      s.push(`<circle cx="${it.x}" cy="${it.y}" r="7" fill="${col}" stroke="#0a1424" stroke-width="1.4"/>`);
    } else {
      s.push(`<circle cx="${it.x}" cy="${it.y}" r="13" fill="${col}" stroke="#0a1424" stroke-width="1.6"/>`);
      s.push(`<text x="${it.x}" y="${it.y+4}" text-anchor="middle" fill="#0a1424" font-size="11" font-weight="bold" font-family="Arial">${escHtml(String(it.num))}</text>`);
    }
  });
  if (MD_PENDING && MD_PENDING.idx===idx)
    s.push(`<circle cx="${MD_PENDING.x}" cy="${MD_PENDING.y}" r="4" fill="${MD_COLORS[MD_COLOR]}"/>`);
  s.push('</svg>');
  return s.join('');
}

function mdCourtClick(ev, idx){
  const r = ev.currentTarget.getBoundingClientRect();
  const x = Math.round((ev.clientX-r.left)/r.width*320);
  const y = Math.round((ev.clientY-r.top)/r.height*460);
  const court = MD_STATE.courts[idx];
  court.items = court.items || [];
  const two = {arrow:'a', curve:'c', zigzag:'z', oval:'o'};
  if (MD_TOOL==='player'){
    const num = (document.getElementById('md-jersey')||{}).value || '';
    if (!String(num).trim()){ alert('Írd be a mezszámot, aztán kattints a pályára.'); return; }
    court.items.push({t:'p', x, y, num:String(num).trim(), color:MD_COLOR});
  } else if (MD_TOOL==='dot'){
    court.items.push({t:'d', x, y, color:MD_COLOR});
  } else if (two[MD_TOOL]){
    if (!MD_PENDING || MD_PENDING.idx!==idx){ MD_PENDING={idx,x,y}; renderMatchday(); return; }
    if (MD_TOOL==='oval'){
      court.items.push({t:'o', x:MD_PENDING.x, y:MD_PENDING.y,
        rx:Math.max(8,Math.abs(x-MD_PENDING.x)), ry:Math.max(8,Math.abs(y-MD_PENDING.y)), color:MD_COLOR});
    } else {
      court.items.push({t:two[MD_TOOL], x1:MD_PENDING.x, y1:MD_PENDING.y, x2:x, y2:y, color:MD_COLOR});
    }
    MD_PENDING=null;
  }
  saveMatchdayNotes(); renderMatchday();
}
function mdSetTool(t){ MD_TOOL=t; MD_PENDING=null; renderMatchday(); }
function mdSetColor(c){ MD_COLOR=c; renderMatchday(); }
function mdSetCourtName(i, el){ MD_STATE.courts[i].name = el.textContent.trim(); saveMatchdayNotes(); }
function mdAddCourt(){ if (MD_STATE.courts.length<4){ MD_STATE.courts.push({name:'', items:[]}); saveMatchdayNotes(); renderMatchday(); } }
function mdClearCourt(i){ MD_STATE.courts[i].items=[]; MD_PENDING=null; saveMatchdayNotes(); renderMatchday(); }
function mdRemoveCourt(i){ if (MD_STATE.courts.length>1){ MD_STATE.courts.splice(i,1); MD_PENDING=null; saveMatchdayNotes(); renderMatchday(); } }
function mdUndo(i){ const c=MD_STATE.courts[i]; if ((c.items||[]).length) c.items.pop(); saveMatchdayNotes(); renderMatchday(); }

// ── the sheet itself ────────────────────────────────────────────────────
function buildMatchdayHtml(st, teamName, editable){
  const {six, sub} = pickExpectedSix(st);
  const ed = editable ? ' contenteditable="true"' : '';

  const serves = mdServeList(st);
  const main = serves[0], second = serves[1];
  const rest = serves.slice(2);
  const noteOf = j => (MD_STATE && MD_STATE.serveNotes[j]) || '';

  const serveCard = (r, tag, cls) => r ? `<div class="md-row ${cls}" ${editable?`draggable="true" ondragstart="mdOnDragStart(event,'${r.jersey}')" ondragover="mdOnDragOver(event)" ondrop="mdOnDrop(event,'${r.jersey}')"`:''}>
      <div class="md-num">#${r.jersey}</div>
      <div class="md-body"><b>${escHtml(titleCaseName(r.player.name))}</b> <span class="md-role">${escHtml(r.player.role||'')}</span>
        <div class="md-note">${r.goodPct}% pozitív · ${r.errPct}% hiba (${r.total} db)</div>
        ${(editable || noteOf(r.jersey)) ? `<div class="md-comment"${ed} ${editable?`onblur="mdSetNote('serve','${r.jersey}',this)"`:''}>${noteOf(r.jersey)||''}</div>` : ''}</div>
      <div class="md-tag">${tag}</div></div>` : '';

  let serveHtml = `<div class="md-sec"><h3>🎯 Nyitás — kire menjen a labda</h3>
    <div class="md-servewrap">
      <div class="md-servemain">${serveCard(main,'FŐ CÉL','md-hot')}${serveCard(second,'2. CÉL','')}</div>
      ${editable && rest.length ? `<div class="md-pool"><div class="md-pool-h">Fogadóik — húzd át a fő cél helyére</div>
        ${rest.map(r=>`<div class="md-poolitem" draggable="true" ondragstart="mdOnDragStart(event,'${r.jersey}')" ondragover="mdOnDragOver(event)" ondrop="mdOnDrop(event,'${r.jersey}')">
          <b>#${r.jersey}</b> ${escHtml(titleCaseName(r.player.name).split(' ')[0])}
          <span>${r.goodPct}%</span></div>`).join('')}</div>` : ''}
    </div></div>`;

  let blockHtml='<div class="md-sec"><h3>🛡 Blokk — várható kezdő ütőik</h3><div class="md-list">';
  const atkNote = j => (MD_STATE && MD_STATE.attackNotes[j]) || '';
  six.forEach(a=>{
    const adv=attackerAdviceShort(a);
    const dirs=mdDirectionText(a, st);
    blockHtml+=`<div class="md-row">
      <div class="md-num">#${a.jersey}</div>
      <div class="md-body"><b>${escHtml(titleCaseName(a.player.name))}</b> <span class="md-role">${escHtml(a.player.role)}</span>
        <div class="md-note"><b style="color:#f0a500">${escHtml(adv.dir)} ${adv.dirPct}%</b> · ${a.kp}% kill${dirs?` · <b>${escHtml(dirs)}</b>`:''}</div>
        ${(editable || atkNote(a.jersey)) ? `<div class="md-comment"${ed} ${editable?`onblur="mdSetNote('atk','${a.jersey}',this)"`:''}>${atkNote(a.jersey)||''}</div>` : ''}</div></div>`;
  });
  const setterEnt = Object.entries(st.setActions).filter(([j,n])=>n>=8).sort((a,b)=>b[1]-a[1])[0];
  if (setterEnt){
    const sj=setterEnt[0], sa=st.attack[sj];
    const dumps = sa ? (sa.combos['Feladó támadás']||0) : 0;
    const sp = st.players[sj]||{name:'#'+sj};
    blockHtml+=`<div class="md-row"><div class="md-num">#${sj}</div>
      <div class="md-body"><b>${escHtml(titleCaseName(sp.name))}</b> <span class="md-role">Feladó</span>
        <div class="md-note">${dumps>0?`<b style="color:#f0a500">Ledobálja: ${dumps} db</b> — figyeld a 2-3 hely között.`:'Gyakorlatilag nem dobálja le a labdát.'}</div>
        ${(editable || atkNote(sj)) ? `<div class="md-comment"${ed} ${editable?`onblur="mdSetNote('atk','${sj}',this)"`:''}>${atkNote(sj)||''}</div>` : ''}</div></div>`;
  }
  if (sub){
    const adv=attackerAdviceShort(sub);
    blockHtml+=`<div class="md-row md-subrow"><div class="md-num">#${sub.jersey}</div>
      <div class="md-body"><b>${escHtml(titleCaseName(sub.player.name))}</b> <span class="md-role">${escHtml(sub.player.role)} · csere</span>
        <div class="md-note">${escHtml(adv.dir)} ${adv.dirPct}% · ${sub.kp}% kill</div>
        ${(editable || atkNote(sub.jersey)) ? `<div class="md-comment"${ed} ${editable?`onblur="mdSetNote('atk','${sub.jersey}',this)"`:''}>${atkNote(sub.jersey)||''}</div>` : ''}</div></div>`;
  }
  blockHtml+='</div></div>';

  const msgs = (MD_STATE && MD_STATE.msgs) || buildMatchdayMessages(st);
  let msgHtml='<div class="md-sec md-keys"><h3>⚡ 3 kulcsüzenet</h3><ol class="md-keylist">';
  msgs.forEach((m,i)=>{
    msgHtml += editable
      ? `<li><span class="md-key-edit" contenteditable="true" onblur="mdSetMsg(${i},this)">${m||''}</span></li>`
      : (m?`<li>${m}</li>`:'');
  });
  msgHtml+='</ol></div>';

  const courts = (MD_STATE && MD_STATE.courts) || [];
  const hasDrawing = courts.some(c=>(c.items||[]).length||c.name);
  let boardHtml='';
  if (editable || hasDrawing){
    const toolBtn=(id,label)=>`<button class="pos-btn ${MD_TOOL===id?'active':''}" onclick="mdSetTool('${id}')">${label}</button>`;
    const colBtn=(id,hex)=>`<button class="md-colbtn ${MD_COLOR===id?'active':''}" style="background:${hex}" onclick="mdSetColor('${id}')" title="${id}"></button>`;
    const hints={player:'Írd be a mezszámot, majd kattints a pályára.',dot:'Kattints a pályára a pötty elhelyezéséhez.',
      arrow:'Kattints a kezdő-, majd a végpontra.',curve:'Kattints a kezdő-, majd a végpontra (íves).',
      zigzag:'Kattints a kezdő-, majd a végpontra (cikcakk).',oval:'Kattints a közép-, majd egy szélső pontra.'};
    boardHtml = `<div class="md-sec"><h3>✏️ Taktikai rajzok</h3>
      ${editable?`<div class="md-tools">
        ${toolBtn('player','🔵 Játékos')}<input id="md-jersey" class="md-jersey" placeholder="mez">
        ${toolBtn('dot','● Pötty')}${toolBtn('arrow','➜ Nyíl')}${toolBtn('curve','⌒ Íves')}${toolBtn('zigzag','∿ Cikcakk')}${toolBtn('oval','◯ Ovális')}
        <span class="md-colors">${Object.entries(MD_COLORS).map(([id,hex])=>colBtn(id,hex)).join('')}</span>
        <span class="md-hint">${hints[MD_TOOL]||''}</span>
      </div>`:''}
      <div class="md-courts">
        ${courts.map((c,i)=>`<div class="md-courtbox">
          <div class="md-courtname"${editable?' contenteditable="true" onblur="mdSetCourtName('+i+',this)"':''}>${escHtml(c.name||'')||(editable?'':'')}</div>
          ${mdCourtSvg(i,c,editable)}
          ${editable?`<div class="md-courtbtns">
            <button class="pos-btn" onclick="mdUndo(${i})">↶ Vissza</button>
            <button class="pos-btn" onclick="mdClearCourt(${i})">Ürítés</button>
            ${courts.length>1?`<button class="pos-btn" onclick="mdRemoveCourt(${i})">Törlés</button>`:''}
          </div>`:''}
        </div>`).join('')}
      </div>
      ${editable && courts.length<4?`<button class="pos-btn" style="margin-top:8px" onclick="mdAddCourt()">+ Pálya hozzáadása (${courts.length}/4)</button>`:''}
    </div>`;
  }

  return `<div class="md-doc">
    <div class="md-head">
      <div><div class="md-kicker">MECCS LAP</div>
        <h2>${escHtml(teamName)}</h2>
        <div class="md-meta">${st.matches.length} elemzett mérkőzés alapján</div></div>
      <div class="md-logo">🏐</div>
    </div>
    ${msgHtml}${serveHtml}${blockHtml}${matchdaySetterHtml(st)}${boardHtml}
    <div class="md-foot">Röplabda Meccs Elemző</div>
  </div>`;
}

function renderMatchday(){
  const el = document.getElementById('t6-content');
  if (!el) return;
  if (!CURRENT_STATS){ el.innerHTML = emptyStateHtml(); return; }
  const draw = () => {
    el.innerHTML = `
      <div class="hero" style="padding:18px 24px;margin-bottom:16px">
        <div class="hero-tag">Játékosoknak küldhető összefoglaló</div>
        <h1 style="font-size:1.6rem">Meccs <span>lap</span></h1>
        <p style="color:var(--gray);font-size:.8rem;margin-top:6px;max-width:640px">Ez az a lap, amit meccs előtt kiadhatsz a csapatnak. Az adatok készen vannak — a szürke szövegekbe belekattintva átírhatod őket a saját szavaidra, a nyitási célpontot pedig húzással cserélheted. Amit módosítasz, automatikusan mentődik. Ha kész, másold a linket vagy nyomtasd ki.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center">
          <button class="mr-print-btn" onclick="publishMatchday()">🔗 Link másolása a csapatnak</button>
          <button class="pos-btn" onclick="window.print()">🖨 Nyomtatás</button>
          <span id="md-save-note" style="color:var(--green);font-size:.78rem"></span>
        </div>
        <div id="md-publish-status" style="font-size:.78rem;margin-top:8px"></div>
      </div>
      <div id="md-preview">${buildMatchdayHtml(CURRENT_STATS, CURRENT_TEAM, true)}</div>`;
  };
  if (!MD_STATE || MD_STATE.__team !== CURRENT_TEAM){
    loadMatchdayNotes(CURRENT_TEAM, CURRENT_STATS, stt=>{ stt.__team = CURRENT_TEAM; MD_STATE = stt; draw(); });
  } else draw();
}

function publishMatchday(){
  const status = document.getElementById('md-publish-status');
  if (!CURRENT_STATS) return;
  const html = buildMatchdayHtml(CURRENT_STATS, CURRENT_TEAM, false);
  if (!fbDb){
    status.innerHTML = '<span style="color:var(--red)">Nincs kapcsolat a felhővel — a megosztáshoz internet és bejelentkezés kell.</span>';
    return;
  }
  saveMatchdayNotes();
  const id = Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
  status.innerHTML = '<span style="color:var(--amber)">Mentés…</span>';
  fbDb.ref('reports/'+id).set({html, team: CURRENT_TEAM, created: Date.now()})
    .then(()=>{
      const url = location.origin + location.pathname + '#r=' + id;
      const done = ok => status.innerHTML = ok
        ? `<span style="color:var(--green)">✅ Link a vágólapon — beillesztheted a csoportba.</span><div style="margin-top:6px;word-break:break-all;color:var(--gray)">${escHtml(url)}</div>`
        : `<span style="color:var(--amber)">A link elkészült, másold ki innen:</span><div style="margin-top:6px;word-break:break-all;color:var(--light)">${escHtml(url)}</div>`;
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(url).then(()=>done(true)).catch(()=>done(false));
      else done(false);
    })
    .catch(err=>{
      status.innerHTML = `<span style="color:var(--red)">Nem sikerült menteni (${escHtml(err.code||'hiba')}). Ellenőrizd, hogy adminként vagy bejelentkezve, és hogy a "reports" szabály be van másolva.</span>`;
    });
}

// Opening the app with #r=<id> shows only that shared report — no login needed.
function tryRenderPublicReport(){
  const m = (location.hash||'').match(/^#r=([A-Za-z0-9]+)/);
  if (!m) return false;
  const holder = document.getElementById('public-report');
  const login = document.getElementById('login-screen');
  const app = document.getElementById('app-container');
  if (login) login.style.display='none';
  if (app) app.style.display='none';
  holder.style.display='block';
  holder.innerHTML = '<div style="padding:40px;text-align:center;color:#8899aa">Betöltés…</div>';
  if (!initFirebaseApp() || typeof firebase==='undefined'){
    holder.innerHTML = '<div style="padding:40px;text-align:center;color:#e63946">Nem sikerült betölteni a riportot.</div>';
    return true;
  }
  firebase.database().ref('reports/'+m[1]).once('value')
    .then(snap=>{
      const v = snap.val();
      holder.innerHTML = v && v.html
        ? `<div class="md-public">${v.html}</div>`
        : '<div style="padding:40px;text-align:center;color:#8899aa">Ez a riport nem érhető el (törölték vagy lejárt a link).</div>';
    })
    .catch(()=>{ holder.innerHTML = '<div style="padding:40px;text-align:center;color:#e63946">Nem sikerült betölteni a riportot.</div>'; });
  return true;
}

function renderAllDataTabs(){
  renderOverview();
  renderAttack();
  renderSetter();
  renderServe();
  renderMatchday();
  renderBenchmark();
  const teamLabel = document.getElementById('current-team-label');
  if (teamLabel) teamLabel.textContent = CURRENT_TEAM || '—';
}

// ═══════════════════════════════════════════════════════════════════════
// ATTACK CODE MAPPING — other statisticians use other codes. Unknown codes
// are detected automatically and can be mapped to our own code set once;
// the mapping is stored in Firebase so it applies to every future file.
// ═══════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════
// LIGA BENCHMARK — inspired by a professional DataVolley/peranavolley match
// report: (1) team comparison against every other loaded team's season
// average, (2) where points are actually won/lost from (ász / fogadásos
// támadás / folytatásos támadás / blokk / ellenfél hibája), and (3) whether
// the team's own sideout%/breakpoint% is over- or under-performing what a
// league-wide baseline would predict from their reception/serve grades.
// Every number here is computed purely client-side from whatever .dvw files
// are already loaded — nothing is sent anywhere.
// ═══════════════════════════════════════════════════════════════════════

let LEAGUE_CACHE = {fingerprint: null, baseline: null, kpis: null};

function matchesFingerprint(){
  return APP_MATCHES.length + '|' + APP_MATCHES.map(m=>m.filename).join(',');
}

// Team-level KPI summary (whole loaded season for that team, independent of
// the current match-picker filter, so every team in the table is measured
// the same way).
function teamKPISummary(teamName, allMatches){
  const matches = allMatches.filter(m=>{ try{ return !!findTeamPrefix(m.rawText, teamName); }catch(e){ return false; } });
  if (!matches.length) return null;
  let stats;
  try { stats = computeTeamStats(matches, teamName); } catch(e){ return null; }

  let atkTot=0, atkKill=0, atkErr=0, atkBlk=0;
  Object.values(stats.attack).forEach(a=>{ atkTot+=a.total; atkKill+=(a.grades['#']||0); atkErr+=(a.grades['=']||0); atkBlk+=(a.grades['/']||0); });
  let recvTot=0, recvErr=0;
  Object.values(stats.recv).forEach(r=>{ recvTot+=r.total; recvErr+=(r.grades['=']||0); });
  let servTot=0, servAce=0, servErr=0;
  Object.values(stats.serve).forEach(s=>{ servTot+=s.total; servAce+=(s.grades['#']||0); servErr+=(s.grades['=']||0); });
  let blkKill=0;
  Object.values(stats.block).forEach(b=>{ blkKill+=(b.grades['#']||0); });
  let setCount=0; stats.matches.forEach(m=>{ setCount += (m.sets && m.sets.length) ? m.sets.length : 0; });
  let serveWon=0, serveLost=0, recvWon=0, recvLost=0;
  Object.values(stats.rotation).forEach(r=>{ serveWon+=r.serveWon; serveLost+=r.serveLost; recvWon+=r.recvWon; recvLost+=r.recvLost; });
  const rallies = serveWon+serveLost+recvWon+recvLost;
  const r1 = (n,d)=> d ? Math.round(1000*n/d)/10 : null;

  return {
    team: teamName, matches: matches.length, sets: setCount,
    soPct: r1(recvWon, recvWon+recvLost),
    bpPct: r1(serveWon, serveWon+serveLost),
    killPct: r1(atkKill, atkTot),
    atkEff: r1(atkKill-atkErr-atkBlk, atkTot),
    acePct: r1(servAce, servTot),
    servErrPct: r1(servErr, servTot),
    recvErrPct: r1(recvErr, recvTot),
    blkPerSet: setCount ? Math.round(10*blkKill/setCount)/10 : null,
    ptsPer100: r1(atkKill+servAce+blkKill, rallies),
    errsPer100: r1(atkErr+servErr+recvErr, rallies),
  };
}

function getLeagueCache(){
  const fp = matchesFingerprint();
  if (LEAGUE_CACHE.fingerprint === fp) return LEAGUE_CACHE;
  const teams = getAllTeamsFromMatches(APP_MATCHES);
  const kpis = teams.map(t=>teamKPISummary(t, APP_MATCHES)).filter(Boolean);
  let baseline = null;
  try { baseline = computeLeagueBaseline(APP_MATCHES); } catch(e){ baseline = null; }
  LEAGUE_CACHE = {fingerprint: fp, baseline, kpis};
  return LEAGUE_CACHE;
}

function bmColorForRank(rank, total){
  if (total<=1) return 'var(--light)';
  const t = (rank-1)/(total-1); // 0 = best, 1 = worst
  if (t<=0.34) return '#4ade80';
  if (t>=0.67) return '#ff6b7a';
  return '#f0a500';
}

// Renders a ranked comparison table. metrics: [{key, label, higherIsBetter, suffix}]
function benchmarkTableHtml(kpis, currentTeam){
  const metrics = [
    {key:'soPct', label:'SO% (fogadásból pont)', hib:true, suf:'%'},
    {key:'bpPct', label:'BP% (nyitásból pont)', hib:true, suf:'%'},
    {key:'killPct', label:'Ütés kill%', hib:true, suf:'%'},
    {key:'atkEff', label:'Ütés hatékonyság', hib:true, suf:'%'},
    {key:'acePct', label:'Ász%', hib:true, suf:'%'},
    {key:'servErrPct', label:'Nyitási hiba%', hib:false, suf:'%'},
    {key:'blkPerSet', label:'Blokkpont/szett', hib:true, suf:''},
    {key:'ptsPer100', label:'Pont / 100 labdamenet', hib:true, suf:''},
    {key:'errsPer100', label:'Hiba / 100 labdamenet', hib:false, suf:''},
  ];

  const ranks = {};
  metrics.forEach(m=>{
    const withVal = kpis.filter(k=>k[m.key]!==null).slice().sort((a,b)=> m.hib ? b[m.key]-a[m.key] : a[m.key]-b[m.key]);
    ranks[m.key] = {};
    withVal.forEach((k,i)=>{ ranks[m.key][k.team] = {rank:i+1, total:withVal.length}; });
  });

  const avg = {};
  metrics.forEach(m=>{
    const vals = kpis.map(k=>k[m.key]).filter(v=>v!==null);
    avg[m.key] = vals.length ? Math.round(10*vals.reduce((a,b)=>a+b,0)/vals.length)/10 : null;
  });

  let html = `<div class="mt" style="overflow-x:auto"><table>
    <thead><tr><th>Csapat</th>${metrics.map(m=>`<th title="${escAttr(m.label)}">${escHtml(m.label)}</th>`).join('')}</tr></thead><tbody>`;

  const sortedKpis = kpis.slice().sort((a,b)=> a.team===currentTeam ? -1 : b.team===currentTeam ? 1 : a.team.localeCompare(b.team,'hu'));
  sortedKpis.forEach(k=>{
    const isCurrent = k.team===currentTeam;
    html += `<tr style="${isCurrent?'background:rgba(240,165,0,.07)':''}">
      <td style="${isCurrent?'font-weight:700;color:var(--amber)':''}">${isCurrent?'▶ ':''}${escHtml(k.team)} <span style="color:var(--gray);font-size:.7rem">(${k.matches} meccs)</span></td>
      ${metrics.map(m=>{
        const v = k[m.key];
        const rk = ranks[m.key][k.team];
        const col = v===null ? 'var(--gray)' : bmColorForRank(rk.rank, rk.total);
        return `<td style="color:${col};font-weight:${isCurrent?'700':'400'}">${v===null?'–':v+m.suf}${v!==null?` <span style="color:var(--gray);font-size:.65rem">(${rk.rank}.)</span>`:''}</td>`;
      }).join('')}
    </tr>`;
  });
  html += `<tr style="border-top:2px solid var(--border)"><td style="font-weight:700;color:var(--gray)">LIGA ÁTLAG</td>
    ${metrics.map(m=>`<td style="color:var(--gray);font-weight:700">${avg[m.key]===null?'–':avg[m.key]+m.suf}</td>`).join('')}
    </tr>`;
  html += `</tbody></table></div>`;
  return html;
}

const ORIGIN_WON_DEFS = [
  ['ace','Ász (break point)','#2ec4b6'],
  ['soAtt','Side out ütés','#4ade80'],
  ['bpAtt','Break point ütés','#f0a500'],
  ['soTransAtt','Folytatásos ütés (side out)','#fbbf24'],
  ['block','Blokk','#818cf8'],
  ['oppErr','Ellenfél hibája','#8899aa'],
  ['other','Egyéb','#3a4a63'],
];
const ORIGIN_LOST_DEFS = [
  ['oppAce','Ellenfél ásza','#e63946'],
  ['oppSoAtt','Ellenfél side out ütése','#fb7185'],
  ['oppBpAtt','Ellenfél break point ütése','#fb923c'],
  ['oppSoTransAtt','Ellenfél folytatásos ütése (side out)','#fdba74'],
  ['oppBlock','Ellenfél blokkja','#c084fc'],
  ['ownErr','Saját hibánk','#8899aa'],
  ['other','Egyéb','#3a4a63'],
];

function originBarHtml(bucket, defs){
  const total = Object.values(bucket).reduce((a,b)=>a+b,0);
  if (!total) return '<div style="font-size:.78rem;color:var(--gray)">Nincs elég adat.</div>';
  let bar = '<div class="origin-bar">';
  defs.forEach(([key,label,color])=>{
    const n = bucket[key]||0;
    if (!n) return;
    const pct = 100*n/total;
    bar += `<div class="origin-seg" style="width:${pct}%;background:${color}" title="${escAttr(label)}: ${n} db (${Math.round(pct)}%)"></div>`;
  });
  bar += '</div>';
  let legend = '<div class="origin-legend">';
  defs.forEach(([key,label,color])=>{
    const n = bucket[key]||0;
    if (!n) return;
    const pct = Math.round(100*n/total);
    legend += `<div class="origin-item"><span class="origin-dot" style="background:${color}"></span>${escHtml(label)} <b>${pct}%</b> <span style="color:var(--gray)">(${n})</span></div>`;
  });
  legend += '</div>';
  return bar + legend;
}

function expectedVsActualHtml(label, outcome, rateTable, sampleN){
  const gradeCounts = {};
  let won=0, tot=0;
  Object.entries(outcome||{}).forEach(([g,v])=>{ gradeCounts[g]=v.won+v.lost; won+=v.won; tot+=v.won+v.lost; });
  if (!tot) return '';
  const actual = Math.round(1000*won/tot)/10;
  const exp = expectedRateFromGrades(gradeCounts, rateTable);
  const expPct = exp.expRate!==null ? Math.round(1000*exp.expRate)/10 : null;
  const delta = expPct!==null ? Math.round(10*(actual-expPct))/10 : null;
  const deltaColor = delta===null ? 'var(--gray)' : delta>=1.5 ? '#4ade80' : delta<=-1.5 ? '#ff6b7a' : '#f0a500';
  return `<div class="sb" style="text-align:left;padding:12px 16px">
    <div style="font-size:.72rem;color:var(--gray);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">${escHtml(label)}</div>
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:baseline">
      <div><div class="sv" style="font-size:1.3rem">${actual}%</div><div class="sl">Tényleges</div></div>
      <div><div class="sv" style="font-size:1.3rem;color:var(--gray)">${expPct===null?'–':expPct+'%'}</div><div class="sl">Várható (liga alapján)</div></div>
      <div><div class="sv" style="font-size:1.3rem;color:${deltaColor}">${delta===null?'–':(delta>=0?'+':'')+delta}</div><div class="sl">Eltérés</div></div>
    </div>
    <div style="font-size:.7rem;color:var(--gray);margin-top:6px">${tot} db saját adat · liga-minta: ${sampleN||0} db</div>
  </div>`;
}

function renderBenchmark(){
  const el = document.getElementById('t7-content');
  if (!el) return;
  if (!CURRENT_STATS || !CURRENT_TEAM){ el.innerHTML = emptyStateHtml(); return; }

  const cache = getLeagueCache();
  if (cache.kpis.length < 2){
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Ehhez legalább 2 csapat kell</div>
      <div class="empty-desc">A liga-összehasonlításhoz tölts be legalább egy másik csapat meccseit is a FELTÖLTÉS fülön — utána itt automatikusan megjelennek.</div></div>`;
    return;
  }

  let html = `  <div class="al alt"><div>
    <div class="at">Teljes szezon minden csapatnál</div>
    <div class="ad">A MECCSEK szűrő ide nem hat, hogy a csapatok azonos alapon legyenek összevethetők. Zárójelben a helyezés: 1. = legjobb.</div>
  </div></div>

  <div class="st">Csapat-összehasonlító tábla (${cache.kpis.length} csapat)</div>
  ${benchmarkTableHtml(cache.kpis, CURRENT_TEAM)}`;

  // Point-origin breakdown for the currently selected team + match filter
  const filteredMatches = APP_MATCHES.filter(m => SELECTED_MATCH_FILENAMES.has(m.filename));
  let ownOutcome = null;
  try { ownOutcome = aggregateTeamOutcome(filteredMatches, CURRENT_TEAM); } catch(e){ ownOutcome = null; }

  if (ownOutcome){
    html += `<div class="st">Pontszerzés eredete — ${escHtml(CURRENT_TEAM)}</div>
    <div class="al ala"><div>
      <div class="at">Miből szerezzük és miből veszítjük a pontokat?</div>
      <div class="ad">A MECCSEK szűrőben kiválasztott meccsek alapján.</div>
    </div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px" class="bm-origin-grid">
      <div class="card">
        <div class="ch"><h3 style="color:#4ade80">✅ Nyert pontok</h3></div>
        ${originBarHtml(ownOutcome.originWon, ORIGIN_WON_DEFS)}
      </div>
      <div class="card">
        <div class="ch"><h3 style="color:#ff6b7a">❌ Vesztett pontok</h3></div>
        ${originBarHtml(ownOutcome.originLost, ORIGIN_LOST_DEFS)}
      </div>
    </div>`;

    // Expected vs actual SO%/BP%
    if (cache.baseline){
      html += `<div class="st">Várható vs. tényleges SO% / BP%</div>
      <div class="al alt"><div>
        <div class="at">Mit "várna el" a liga a mi fogadás/nyitás-minőségünktől?</div>
        <div class="ad">A várható érték a mi osztályzat-eloszlásunkra alkalmazza a mezőny átlagos hozamát. <b>Tényleges a várható felett</b> = jobban konvertálunk az átlagnál; <b>alatta</b> = van tartalék a kivitelezésben.</div>
      </div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:20px">
        ${expectedVsActualHtml('SO% — fogadásból szerzett pont', ownOutcome.recvOutcome, cache.baseline.recvRate, cache.baseline.recvN)}
        ${expectedVsActualHtml('BP% — nyitásból szerzett pont', ownOutcome.serveOutcome, cache.baseline.serveRate, cache.baseline.serveN)}
      </div>`;
    }
  }

  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// AUTHENTICATION (Firebase Auth) — gates the whole app behind login,
// and restricts the upload tab to the admin account only.
// ═══════════════════════════════════════════════════════════════════════

const ADMIN_EMAIL = 'leiner.peter11@gmail.com';
let CURRENT_USER_EMAIL = null;
let IS_ADMIN = false;

function handleLogin(event){
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  errEl.style.display = 'none';

  if (typeof firebase === 'undefined' || !initFirebaseApp()){
    errEl.textContent = 'A bejelentkezés jelenleg nem elérhető (nincs kapcsolat a szerverrel). Próbáld frissíteni az oldalt.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Bejelentkezés...';

  // Safety net: if nothing happens within 15s (e.g. a restrictive mobile
  // browser silently blocks the underlying storage Firebase needs), reset
  // the button instead of leaving it stuck forever.
  let settled = false;
  const timeoutId = setTimeout(()=>{
    if (settled) return;
    settled = true;
    errEl.textContent = 'A bejelentkezés túl sokáig tart. Ha mobilböngészőből (pl. Safari privát mód, vagy egy appon belüli böngésző) próbálkozol, próbáld meg a rendes böngésződben megnyitni az oldalt.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Bejelentkezés';
  }, 15000);

  function doSignIn(){
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(()=>{ settled = true; clearTimeout(timeoutId); })
      .catch(err=>{
        settled = true; clearTimeout(timeoutId);
        let msg = 'Hibás email cím vagy jelszó.';
        if (err.code==='auth/too-many-requests') msg = 'Túl sok próbálkozás — próbáld újra néhány perc múlva.';
        else if (err.code==='auth/user-disabled') msg = 'Ez a fiók le van tiltva.';
        else if (err.code==='auth/network-request-failed') msg = 'Nincs internetkapcsolat.';
        else if (err.code==='auth/invalid-email') msg = 'Érvénytelen email cím formátum.';
        else if (err.code && err.code!=='auth/wrong-password' && err.code!=='auth/user-not-found' && err.code!=='auth/invalid-credential'){
          // Unexpected error — show the real code instead of a misleading
          // "wrong password" message, so this can actually be diagnosed.
          msg = `Váratlan hiba (${err.code}). Ha ez mobilon jelenik meg, próbáld laptopról is, és jelezd ezt a hibakódot.`;
        }
        errEl.textContent = msg;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Bejelentkezés';
      });
  }

  // Some mobile browsers (private/incognito modes, in-app browsers) restrict
  // IndexedDB, which LOCAL persistence needs. Fall back gracefully instead
  // of silently failing.
  if (firebase.auth().setPersistence){
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(()=>firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(()=>{}))
      .then(doSignIn)
      .catch(doSignIn);
  } else {
    doSignIn();
  }
}

function handleLogout(){
  if (typeof firebase !== 'undefined' && firebaseAppInitialized){
    firebase.auth().signOut();
  }
}

function applyAdminUI(){
  document.querySelectorAll('.admin-only').forEach(el=>{
    el.style.display = IS_ADMIN ? '' : 'none';
  });
  if (!IS_ADMIN){
    const t1 = document.getElementById('t1');
    if (t1 && t1.classList.contains('active')){
      showTab('t2', document.querySelectorAll('.tab')[1]);
    }
  }
}

function onAuthReady(user){
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app-container');
  if (user){
    CURRENT_USER_EMAIL = user.email;
    IS_ADMIN = (user.email === ADMIN_EMAIL);
    loginScreen.style.display = 'none';
    appContainer.style.display = 'block';
    const label = document.getElementById('user-email-label');
    if (label) label.textContent = user.email + (IS_ADMIN ? ' · admin' : '');
    applyAdminUI();
    initCloudSync();
  } else {
    CURRENT_USER_EMAIL = null;
    IS_ADMIN = false;
    appContainer.style.display = 'none';
    loginScreen.style.display = 'flex';
    const btn = document.getElementById('login-btn');
    if (btn){ btn.disabled = false; btn.textContent = 'Bejelentkezés'; }
    const form = document.getElementById('login-form');
    if (form) form.reset();
  }
}


function initApp(){
  loadManualDates();
  loadMatchesFromStorage();
  seedEmbeddedMatchesIfEmpty();
  renderUploadTab();
  rebuildTeamSelector();

  // Dropzone wiring
  const dz = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  dz.addEventListener('click', ()=>fileInput.click());
  dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', ()=>dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', e=>{
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  document.getElementById('team-select').addEventListener('change', e=>{
    onTeamChange(e.target.value);
  });

  if (tryRenderPublicReport()) return;

  // Auth gating: the whole app stays behind the login screen until Firebase
  // confirms a signed-in user. If Firebase itself isn't configured/reachable,
  // fall back to showing the app directly (can't enforce login without it).
  if (FIREBASE_ENABLED && typeof firebase !== 'undefined' && initFirebaseApp()){
    firebase.auth().onAuthStateChanged(onAuthReady, (err)=>{
      console.warn('Auth state listener error', err);
      onAuthReady(null);
    });
  } else {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    IS_ADMIN = true;
    applyAdminUI();
    updateSyncIndicator();
  }
}

document.addEventListener('DOMContentLoaded', initApp);


