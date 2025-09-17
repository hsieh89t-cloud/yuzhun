// === 動態入口版：可讀「總入口表（CSV）」 ===
// 入口表欄位（第一列標題必須為）：通道, 名稱, csv, gas_url(可選)
// 通道值建議：文章庫 / 文件庫 / 日常
const DEFAULT_CFG = {
  entry_csv: "",       // 若空，改用 fallbackRoutes
  gas_web_app_url: "", // 可被入口表中的 gas_url 覆蓋
  gas_token: "",
  write_cmd: "寫入",
  read_cmd: "讀取",
  fallbackRoutes: {    // 沒有入口表時的預設
    "文章庫": { csv: "" },
    "文件庫": { csv: "" },
    "日常":   { csv: "" }
  }
};

// 儲存在本機的設定鍵
const LS_CFG = "pwaEntryConfig";
const LS_ENTRY = "pwaEntryCsvUrl";

// 全域狀態
let CFG = loadUserConfig();
let ROUTES = structuredClone(CFG.fallbackRoutes);
let currentSheet = document.querySelector('.tab.active').dataset.sheet;
let page = 0, PAGE_SIZE = 20, cacheRows = [];

// PWA SW
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js'); }

// DOM
const titleEl = document.querySelector('#title');
const catEl = document.querySelector('#category');
const contentEl = document.querySelector('#content');
const statusEl = document.querySelector('#status');
const saveBtn = document.querySelector('#saveBtn');
const clearBtn = document.querySelector('#clearDraft');
const refreshBtn = document.querySelector('#refreshBtn');
const searchEl = document.querySelector('#search');
const listEl = document.querySelector('#list');
const loadMoreBtn = document.querySelector('#loadMore');
const tabs = Array.from(document.querySelectorAll('.tab'));
const entryCsvEl = document.querySelector('#entryCsv');
const gasUrlEl = document.querySelector('#gasUrl');
const gasTokenEl = document.querySelector('#gasToken');
const saveSettingsBtn = document.querySelector('#saveSettings');
const clearSettingsBtn = document.querySelector('#clearSettings');

// 事件
tabs.forEach(btn=>btn.addEventListener('click',()=>{
  tabs.forEach(t=>t.classList.remove('active')); btn.classList.add('active');
  currentSheet = btn.dataset.sheet; loadDraft(); resetList(); fetchList();
}));
let draftTimer;
[titleEl,catEl,contentEl].forEach(el=>el.addEventListener('input',()=>{
  clearTimeout(draftTimer); draftTimer=setTimeout(saveDraft,800);
}));
clearBtn.addEventListener('click',()=>{ localStorage.removeItem(draftKey()); titleEl.value='';catEl.value='';contentEl.value=''; status('已清除草稿'); });
saveBtn.addEventListener('click',doSave);
refreshBtn.addEventListener('click',()=>{ resetList(); fetchList(); });
searchEl.addEventListener('input',renderList);
loadMoreBtn.addEventListener('click',()=>{ page++; renderList(); });
saveSettingsBtn.addEventListener('click',saveSettings);
clearSettingsBtn.addEventListener('click',()=>{ localStorage.removeItem(LS_CFG); localStorage.removeItem(LS_ENTRY); location.reload(); });

// 初始化
(async function init(){
  // 載入入口表 URL（若使用者曾保存）
  const savedEntry = localStorage.getItem(LS_ENTRY);
  if (savedEntry) { CFG.entry_csv = savedEntry; }
  entryCsvEl.value = CFG.entry_csv || "";
  gasUrlEl.value = CFG.gas_web_app_url || "";
  gasTokenEl.value = CFG.gas_token || "";
  if (CFG.entry_csv) {
    await loadRoutesFromEntry(CFG.entry_csv);
  }
  bindChannelTabs();
  loadDraft();
  resetList();
  fetchList();
  setTimeout(flushQueue, 800);
})();

function bindChannelTabs(){
  // 如果入口表提供了額外通道，動態渲染
  const known = ["文章庫","文件庫","日常"];
  const all = Object.keys(ROUTES);
  if (all.some(n=>!known.includes(n))) {
    const nav = document.querySelector('#channels');
    nav.innerHTML = "";
    all.forEach((name,i)=>{
      const b=document.createElement('button');
      b.className='tab'+(i===0?' active':'');
      b.dataset.sheet = name;
      b.textContent = name;
      nav.appendChild(b);
    });
    // 重新綁定
    const newTabs = Array.from(document.querySelectorAll('.tab'));
    newTabs.forEach(btn=>btn.addEventListener('click',()=>{
      newTabs.forEach(t=>t.classList.remove('active')); btn.classList.add('active');
      currentSheet = btn.dataset.sheet; loadDraft(); resetList(); fetchList();
    }));
    currentSheet = all[0];
  }
}

function loadUserConfig(){
  try{
    const saved = JSON.parse(localStorage.getItem(LS_CFG)||"null");
    return saved ? saved : structuredClone(DEFAULT_CFG);
  }catch(e){
    return structuredClone(DEFAULT_CFG);
  }
}

function saveSettings(){
  CFG.entry_csv = (entryCsvEl.value||"").trim();
  CFG.gas_web_app_url = (gasUrlEl.value||"").trim();
  CFG.gas_token = (gasTokenEl.value||"").trim();
  localStorage.setItem(LS_CFG, JSON.stringify(CFG));
  if (CFG.entry_csv) localStorage.setItem(LS_ENTRY, CFG.entry_csv);
  status('已保存設定'); 
  if (CFG.entry_csv) {
    loadRoutesFromEntry(CFG.entry_csv).then(()=>{ resetList(); fetchList(); });
  }
}

async function loadRoutesFromEntry(url){
  try{
    const res = await fetch(url);
    const text = await res.text();
    const rows = parseCSV(text);
    // 期待欄位：通道, 名稱, csv, gas_url(可選)
    const routes = {};
    rows.forEach(r=>{
      const ch = r["通道"] || r["channel"] || r["Channel"];
      const csv = r["csv"] || r["CSV"];
      const gas = r["gas_url"] || r["GAS"] || r["gas"];
      if (ch && csv) { routes[ch] = { csv }; }
      if (gas && !CFG.gas_web_app_url) { CFG.gas_web_app_url = gas; }
    });
    if (Object.keys(routes).length) {
      ROUTES = routes;
      bindChannelTabs();
      status('✅ 已從總入口表載入 ' + Object.keys(ROUTES).length + ' 個通道');
    } else {
      status('⚠️ 總入口表格式不完整，請確認欄位包含：通道,csv');
    }
  }catch(e){
    status('⚠️ 無法讀取總入口表。請確認網址「發佈到網路→CSV」且可公開存取');
  }
}

// 草稿
function draftKey(){ return `draft:${currentSheet}`; }
function saveDraft(){ const d={title:titleEl.value,category:catEl.value,content:contentEl.value,ts:Date.now()}; localStorage.setItem(draftKey(), JSON.stringify(d)); status('已暫存於本機'); }
function loadDraft(){ const raw=localStorage.getItem(draftKey()); if(raw){ try{ const d=JSON.parse(raw); titleEl.value=d.title||'';catEl.value=d.category||'';contentEl.value=d.content||''; status('已載入本機草稿');}catch{} } else { titleEl.value='';catEl.value='';contentEl.value=''; status(''); }}

// 存入流程（可離線排隊）
async function doSave(){
  const title=(titleEl.value||'').trim();
  const content=(contentEl.value||'').trim();
  if(!title||!content){ return status('請至少填「標題」與「內容」'); }
  const rec={ sheet: currentSheet, date: new Date().toISOString(), category:(catEl.value||'').trim(), title, content };
  const ok = await sendToGAS(rec);
  if(ok){
    status('✅ 已存入雲端'); localStorage.removeItem(draftKey()); resetList(); fetchList();
  }else{
    enqueueOffline(rec); status('⚠️ GAS 未設定或停用，已先存入本機待送');
  }
}
async function sendToGAS(rec){
  const url = (CFG.gas_web_app_url||"").trim(); if(!url) return false;
  const meta = { sheet: rec.sheet, row: { 日期:rec.date, 分類:rec.category, 標題:rec.title, 內容:rec.content } };
  try{
    const p=new URLSearchParams(); if(CFG.gas_token) p.set('token', CFG.gas_token); p.set('cmd', CFG.write_cmd||'寫入'); p.set('meta', JSON.stringify(meta));
    const r=await fetch(`${url}?${p.toString()}`,{method:'GET'}); const j=await r.json(); if(j&&j.ok) return true;
  }catch{}
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ token: CFG.gas_token, cmd: CFG.write_cmd||'寫入', meta })}); const j=await r.json(); if(j&&j.ok) return true;
  }catch{}
  return false;
}
function enqueueOffline(rec){ const key='pendingQueue'; const list=JSON.parse(localStorage.getItem(key)||'[]'); list.push(rec); localStorage.setItem(key, JSON.stringify(list)); }
async function flushQueue(){ const key='pendingQueue'; let list=JSON.parse(localStorage.getItem(key)||'[]'); if(!list.length) return; const okList=[]; for(const rec of list){ const ok=await sendToGAS(rec); if(ok) okList.push(rec); } if(okList.length){ list=list.filter(x=>!okList.includes(x)); localStorage.setItem(key, JSON.stringify(list)); status('✅ 已補送 '+okList.length+' 筆'); }}

// 讀取列表（CSV）
function resetList(){ page=0; cacheRows=[]; listEl.innerHTML=''; }
async function fetchList(){
  const route = ROUTES[currentSheet];
  if(!route||!route.csv){ status('尚未在入口表設定此通道的 CSV 連結'); return; }
  try{ const res=await fetch(route.csv); const text=await res.text(); cacheRows=parseCSV(text); renderList(); status('已載入 '+cacheRows.length+' 筆'); }
  catch(e){ status('讀取失敗，請確認該分頁已「發佈到網路」且權限開放'); }
}
function parseCSV(text){
  const rows = []; let row=[], field='', inQ=false;
  for(let i=0;i<text.length;i++){ const c=text[i],n=text[i+1];
    if(inQ){ if(c=='"'&&n=='"'){field+='"';i++;} else if(c=='"'){inQ=false;} else {field+=c;} }
    else { if(c=='"'){inQ=true;} else if(c==','){row.push(field);field='';} else if(c=='\n'){row.push(field);rows.push(row);row=[];field='';} else if(c=='\r'){} else {field+=c;} }
  }
  if(field||row.length){ row.push(field); rows.push(row); }
  const headers = rows.shift()||[];
  const H = {}; headers.forEach((h,i)=>H[h]=i);
  return rows.map(r=>({
    日期: r[H["日期"]||-1]||'',
    分類: r[H["分類"]||-1]||'',
    標題: r[H["標題"]||-1]||'',
    內容: r[H["內容"]||-1]||''
  }));
}
function renderList(){
  const q=(searchEl.value||'').trim();
  const start=page*PAGE_SIZE, end=start+PAGE_SIZE;
  const filtered=cacheRows.filter(x=>!q||(x.標題&&x.標題.includes(q))||(x.內容&&x.內容.includes(q)));
  const slice=filtered.slice(0,end);
  listEl.innerHTML = slice.map(x=>`<li class="item"><h3>${esc(x.標題||'(無標題)')}</h3><div class="meta">${esc(x.日期||'')}｜${esc(x.分類||'')}</div><div class="preview">${esc((x.內容||'').slice(0,300))}</div></li>`).join('');
  loadMoreBtn.style.display = (filtered.length> end)?'block':'none';
}
function esc(s){return (s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}
