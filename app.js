/* ========= 基本設定 ========= */
const SHEET_ID = "1keAp5yTtGV0VT9yxkPXVpdhJxGiypiV7DnEZpFgxfBs";

/* 你的各分頁 gid（來自你提供的清單） */
const GIDS = {
  "表單回應1": "1997737894",
  "身體": "128552717",
  "護理": "1985223179",
  "血壓": "2010169356",
  "血糖": "1308241683",
  "小便": "1217043471",
  "大便": "135944068",
  "訪客": "2061789603",
  "復健": "694319844",
  "飲食": "426173260",
  "喝水": "351311067",
  "喝水進度圖": "1529024056",
  "代買": "1520775045",
  "體重": "2058611808",
  "其他": "206690780"
};

/* ========= i18n（簡易字典，不依賴外部API） ========= */
const I18N = {
  zh: {
    title:"我照顧你放心",
    version:"v1.1",
    pickSheet:"請選擇分頁",
    loading:"載入中…",
    noData:"目前沒有資料。",
    last30:"僅顯示最近 30 天",
    waterGoal:"目標 cc",
    todayIntake:"今日飲水 cc",
    achievement:"達成率",
    tips:"提示",
    waterTips:[
      "起床先喝溫水 200–300cc。",
      "若腎臟與醫囑允許，白天小口常喝，晚上減量。",
      "喝藥配水也要計入。",
      "天熱或發燒時要與醫護討論增量。"
    ],
    langs:["繁體中文","Bahasa Indonesia","English"],
    nav:{home:"首頁",bp:"血壓",visitor:"訪客",buy:"代買",diet:"飲食",water:"喝水",waterGraph:"喝水進度圖"}
  },
  id: {
    title:"Aku Jaga Kamu, Tenang ya",
    version:"v1.1",
    pickSheet:"Pilih Lembar",
    loading:"Memuat…",
    noData:"Belum ada data.",
    last30:"Hanya 30 hari terakhir",
    waterGoal:"Target cc",
    todayIntake:"Minum hari ini cc",
    achievement:"Tingkat capaian",
    tips:"Saran",
    waterTips:[
      "Bangun pagi minum air hangat 200–300cc.",
      "Bila ginjal & anjuran dokter memungkinkan, minum sedikit-sedikit siang hari, malam kurangi.",
      "Air untuk obat juga dihitung.",
      "Saat cuaca panas/demam, diskusikan penambahan dengan tenaga medis."
    ],
    langs:["繁體中文","Bahasa Indonesia","English"],
    nav:{home:"Beranda",bp:"Tekanan darah",visitor:"Kunjungan",buy:"Titip beli",diet:"Makan",water:"Minum",waterGraph:"Grafik minum"}
  },
  en: {
    title:"Care Log — Peace of Mind",
    version:"v1.1",
    pickSheet:"Choose a sheet",
    loading:"Loading…",
    noData:"No data yet.",
    last30:"Showing last 30 days only",
    waterGoal:"Goal cc",
    todayIntake:"Today cc",
    achievement:"Achievement",
    tips:"Tips",
    waterTips:[
      "After waking, drink 200–300cc warm water.",
      "If kidneys & doctor allow, sip often daytime, less at night.",
      "Water taken with meds counts too.",
      "In heat/fever, discuss increasing intake with clinicians."
    ],
    langs:["繁體中文","Bahasa Indonesia","English"],
    nav:{home:"Home",bp:"Blood Pressure",visitor:"Visitor",buy:"Groceries",diet:"Diet",water:"Water",waterGraph:"Water Graph"}
  }
};
let currentLang = localStorage.getItem("lang") || "zh";

/* ========= 語系切換 ========= */
function setLang(lang){
  currentLang = lang;
  localStorage.setItem("lang", lang);
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    const val = key.split(".").reduce((o,k)=>o?.[k], I18N[lang]) || "";
    el.textContent = val;
  });
  // 語系按鈕外觀
  document.querySelectorAll(".langs button").forEach(b=>{
    b.classList.toggle("active", b.dataset.lang===lang);
  });
}

/* ========= 工具：抓 CSV ========= */
async function fetchCSV(gid){
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const resp = await fetch(url);
  if(!resp.ok) throw new Error("fetch failed");
  return await resp.text();
}

/* ========= 解析 CSV ========= */
function parseCSV(text){
  // 簡易 CSV 解析（符合 Google Sheets 匯出的格式）
  const rows = [];
  let i=0, cur="", inQ=false, row=[];
  const pushCell=()=>{ row.push(cur); cur="";};
  const pushRow=()=>{ rows.push(row); row=[];};
  while(i<text.length){
    const c=text[i];
    if(inQ){
      if(c==='"' && text[i+1]==='"'){ cur+='"'; i++; }
      else if(c==='"'){ inQ=false; }
      else { cur+=c; }
    }else{
      if(c==='"'){ inQ=true; }
      else if(c===','){ pushCell(); }
      else if(c==='\n'){ pushCell(); pushRow(); }
      else if(c==='\r'){ /* skip */ }
      else { cur+=c; }
    }
    i++;
  }
  if(cur.length || row.length){ pushCell(); pushRow(); }
  const headers = rows.shift() || [];
  const data = rows.filter(r=>r.some(x=>x!=="" )).map(r=>{
    const o={};
    headers.forEach((h,idx)=> o[h]=r[idx] ?? "");
    return o;
  });
  return {headers, data};
}

/* ========= 找日期欄位 & 篩選近30天 ========= */
function filterLast30(data){
  // 可能的日期欄位名稱
  const candidates = ["執行時間","執行日期","時間戳記","時間","日期","date","Date","Tanggal"];
  const sample = data[0] || {};
  let key = candidates.find(k=> Object.prototype.hasOwnProperty.call(sample,k));
  if(!key){ return data; } // 找不到就不過濾

  const now = new Date();
  const d30 = new Date(now.getTime() - 30*24*60*60*1000);

  const parse = (v)=>{
    // 支援「2025/8/1 09:52:15」或「2025-08-01」等
    if(!v) return null;
    let s = v.toString().trim()
                 .replaceAll(".","/")
                 .replaceAll("-","/")
                 .replace("上午","")
                 .replace("下午",""); // 簡化處理
    const d = new Date(s);
    return isNaN(d)? null : d;
  };

  return data.filter(row=>{
    const d = parse(row[key]);
    return d ? d >= d30 : true;
  });
}

/* ========= 將資料渲染成表格 ========= */
function renderTable(el, headers, rows){
  if(!rows.length){
    el.innerHTML = `<div class="empty" data-i18n="noData">${I18N[currentLang].noData}</div>`;
    setLang(currentLang); return;
  }
  const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>`;
  const body = rows.map(r=>`<tr>${headers.map(h=>`<td>${(r[h]??"")}</td>`).join("")}</tr>`).join("");
  el.innerHTML = `<div class="table-wrap"><table>${thead}<tbody>${body}</tbody></table></div>
  <div class="small" style="margin-top:8px" data-i18n="last30">${I18N[currentLang].last30}</div>`;
  setLang(currentLang);
}

/* ========= 頁面：一般清單（血壓 / 訪客 / 代買 / 飲食） ========= */
async function loadSimplePage(gid, mountId){
  const mount = document.getElementById(mountId);
  mount.innerHTML = `<div class="hint" data-i18n="loading">${I18N[currentLang].loading}</div>`;
  try{
    const csv = await fetchCSV(gid);
    const {headers, data} = parseCSV(csv);
    const filtered = filterLast30(data);
    renderTable(mount, headers, filtered);
  }catch(e){
    mount.innerHTML = `<div class="empty">Load error</div>`;
  }
}

/* ========= 頁面：喝水（含進度與提示） ========= */
async function loadWaterPage(){
  const mount = document.getElementById("waterMount");
  mount.innerHTML = `<div class="hint" data-i18n="loading">${I18N[currentLang].loading}</div>`;
  try{
    const csv = await fetchCSV(GIDS["喝水"]);
    const {headers, data} = parseCSV(csv);
    const filtered = filterLast30(data);

    // 嘗試尋找「飲水量」欄
    const waterKeys = ["飲水量","喝水cc","當日飲水cc","drink","minum","water"];
    const wKey = waterKeys.find(k=>headers.includes(k)) || headers.find(h=>/水/.test(h)) || headers.at(-1);

    // 以日期聚合今天的飲水
    const candidatesDate = ["日期","執行日期","時間","date"];
    const dateKey = candidatesDate.find(k=>headers.includes(k)) || headers[0];

    const todayStr = new Date().toISOString().slice(0,10);
    const toNum = v => {
      const x = Number(String(v).replace(/[^\d.-]/g,""));
      return isNaN(x)?0:x;
    };
    let todayTotal = 0;
    filtered.forEach(r=>{
      const raw = (r[dateKey]||"").toString().replaceAll(".","/").replaceAll("-","/");
      const d = new Date(raw);
      if(!isNaN(d)){
        const ds = d.toISOString().slice(0,10);
        if(ds===todayStr) todayTotal += toNum(r[wKey]);
      }
    });

    const goal = 1500; // 先寫固定，之後可做成可調
    const rate = Math.min(1, todayTotal/goal);

    // KPI 區 + 進度條
    const kpiHtml = `
      <div class="kpi-row">
        <div class="kpi">
          <div class="small" data-i18n="todayIntake">${I18N[currentLang].todayIntake}</div>
          <div style="font-size:1.6rem;font-weight:700">${todayTotal}</div>
        </div>
        <div class="kpi">
          <div class="small" data-i18n="waterGoal">${I18N[currentLang].waterGoal}</div>
          <div style="font-size:1.4rem">${goal}</div>
        </div>
        <div class="kpi">
          <div class="small" data-i18n="achievement">${I18N[currentLang].achievement}</div>
          <div class="progress" aria-label="progress"><i style="width:${(rate*100).toFixed(1)}%"></i></div>
          <div class="small" style="margin-top:6px">${(rate*100).toFixed(1)}%</div>
        </div>
      </div>
    `;

    // 提示詞
    const tips = I18N[currentLang].waterTips.map(s=>`<li>${s}</li>`).join("");
    const tipsHtml = `
      <div class="card" style="margin:10px 0">
        <strong data-i18n="tips">${I18N[currentLang].tips}</strong>
        <ul style="margin:8px 0 0 18px">${tips}</ul>
      </div>
    `;

    // 表格
    const tableDiv = document.createElement("div");
    renderTable(tableDiv, headers, filtered);

    mount.innerHTML = kpiHtml + tipsHtml + tableDiv.innerHTML + `<div class="footer-space"></div>`;
    setLang(currentLang);
  }catch(e){
    mount.innerHTML = `<div class="empty">Load error</div>`;
  }
}

/* ========= 共用：建立語言按鈕 ========= */
function mountLangButtons(){
  const box = document.querySelector(".langs");
  if(!box) return;
  const langs = [
    {k:"zh", label:I18N.zh.langs[0]},
    {k:"id", label:I18N.id.langs[1]},
    {k:"en", label:I18N.en.langs[2]}
  ];
  box.innerHTML = langs.map(l=>`<button data-lang="${l.k}">${l.label}</button>`).join("");
  box.querySelectorAll("button").forEach(b=>{
    b.addEventListener("click",()=>setLang(b.dataset.lang));
  });
  setLang(currentLang);
}

/* ========= 導覽 tabs（可選） ========= */
function setActiveTab(id){
  document.querySelectorAll(".tabs a").forEach(a=>{
    a.classList.toggle("active", a.id===id);
  });
}

/* ========= 導出到全域，讓各頁呼叫 ========= */
window.CareSite = {
  GIDS, I18N, setLang, mountLangButtons, loadSimplePage, loadWaterPage, setActiveTab
};