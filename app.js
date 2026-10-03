// Bar Code Finder — standalone version.
import { FIREBASE } from "./config.js";
const P = ["11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100", "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100", "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110", "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110", "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010", "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110", "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010", "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110", "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110", "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010", "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000", "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000", "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010", "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100", "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110", "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000", "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110", "11110101110", "11010000100", "11010010000", "11010011100"];
const STOP = "1100011101011";
function bits(s){ const v=[...s].map(ch=>ch.charCodeAt(0)-32); let chk=104; v.forEach((x,i)=>chk+=(i+1)*x); chk%=103; return P[104]+v.map(x=>P[x]).join("")+P[chk]+STOP; }
function barcodeSVG(code){ const b=bits(code),q=10,w=b.length+q*2; let r="",i=0;
  while(i<b.length){ if(b[i]==="1"){let j=i;while(b[j]==="1")j++;r+=`<rect x="${i+q}" y="0" width="${j-i}" height="44"/>`;i=j;} else i++; }
  return `<svg viewBox="0 0 ${w} 44" preserveAspectRatio="none" role="img" aria-label="Barcode ${code}"><rect width="${w}" height="44" fill="#fff"/><g fill="#000">${r}</g></svg>`; }


const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pagesTxt=p=>(String(p).includes(",")?"Pages ":"Page ")+p;
const firstPage=p=>parseInt(String(p).split(",")[0],10)||999;
const fmtQty=q=>String(Math.round(q*100)/100);
function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,2400); }
const ls={ get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch{ return d; } }, set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} } };
const loadScript=src=>new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
const now=()=>new Date().toISOString();

/* ---------- Team code: unlocks the item list and names the team's shared data ---------- */
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function unlockItems(code){
  const enc=await (await fetch("data/items.enc.json",{cache:"no-cache"})).json();
  const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(code),"PBKDF2",false,["deriveKey"]);
  const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(enc.salt),iterations:enc.iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(enc.iv)},key,b64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function teamIdFor(code){ const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("bcf-team:"+code)); return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,32); }
let TEAM_CODE=null;
const appLink=()=>location.origin+location.pathname.replace(/index\.html$/,"")+"#t="+TEAM_CODE;

/* ---------- Item list ---------- */
let BASE_ITEMS=[], ITEMS=[], byCode={}, HAY=[], N=0, CATALOG=null;
function setItems(list){
  ITEMS=list; N=ITEMS.length; byCode=Object.fromEntries(ITEMS.map(r=>[r[0],r]));
  HAY=ITEMS.map(r=>norm(r.join(" ")));
  buildIndex(); $("total").textContent=ITEMS.length;
  renderList(); renderQuick(); renderCount(); renderSheets(); refreshPhotoCount();
}

/* ---------- Matching ---------- */
const norm=s=>String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9 ]/g," ");
const STOPW=new Set("the and di del della delle dei de la le il lo of con with a ml 750ml 1l 1 750 700ml 375ml 12oz 11 2oz oz l btl can cans nv doc docg igt wine vino red white rosso bianco".split(" "));
const toks=s=>norm(s).split(/\s+/).filter(w=>w.length>=3&&!STOPW.has(w));
let LEARN=ls.get("bcf-learn",{}), SHARED_LEARN={}, ITOK=[], DF={};
function buildIndex(){
  ITOK=ITEMS.map(r=>new Set([...toks(r[1]+" "+r[2]+" "+(r[5]||"")), ...(LEARN[r[0]]||[]), ...(SHARED_LEARN[r[0]]||[])]));
  DF={}; ITOK.forEach(s=>s.forEach(t=>DF[t]=(DF[t]||0)+1));
}
function lev(a,b){ if(Math.abs(a.length-b.length)>2) return 9; const m=[...Array(b.length+1).keys()];
  for(let i=1;i<=a.length;i++){ let p=m[0]; m[0]=i; for(let j=1;j<=b.length;j++){ const t=m[j]; m[j]=Math.min(m[j]+1,m[j-1]+1,p+(a[i-1]===b[j-1]?0:1)); p=t; } } return m[b.length]; }
function sim(a,b){ if(a===b) return 1; if(a.length>=5&&b.length>=5&&(a.includes(b)||b.includes(a))) return .85;
  const d=lev(a,b), L=Math.max(a.length,b.length); const s=1-d/L; return (L>=5&&s>=.7)||(L>=4&&d<=1&&s>=.75)?s:0; }
function rankText(text){
  const q=[...new Set(toks(text))]; const out=new Map(); if(!q.length) return out;
  ITEMS.forEach((r,i)=>{ let sc=0, hit=0;
    for(const t of ITOK[i]){ let best=0; for(const w of q){ const s=sim(w,t); if(s>best) best=s; if(best===1) break; }
      if(best){ sc+=best*Math.log(1+N/DF[t]); hit++; } }
    if(hit) out.set(r[0], sc*(0.6+0.4*hit/ITOK[i].size)); });
  return out;
}

/* ---------- Photo matching ---------- */
function signature(img){
  const W=img.naturalWidth||img.width, H=img.naturalHeight||img.height;
  const c=document.createElement("canvas"); c.width=24; c.height=32; const x=c.getContext("2d",{willReadFrequently:true});
  x.drawImage(img,W*.2,H*.1,W*.6,H*.8,0,0,24,32); const a=x.getImageData(0,0,24,32).data;
  const hist=new Array(72).fill(0), gray=[];
  for(let i=0;i<a.length;i+=4){ const r=a[i]/255,g=a[i+1]/255,b=a[i+2]/255, mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
    let h=0; if(d){ h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4; h=(h*60+360)%360; }
    const s=mx?d/mx:0, v=mx; hist[Math.min(7,Math.floor(h/45))*9+Math.min(2,Math.floor(s*3))*3+Math.min(2,Math.floor(v*3))]++;
    gray.push(.3*a[i]+.59*a[i+1]+.11*a[i+2]); }
  const n=gray.length, tot=hist.reduce((p,q)=>p+q,0), mean=gray.reduce((p,q)=>p+q,0)/n;
  const sd=Math.sqrt(gray.reduce((p,q)=>p+(q-mean)**2,0)/n)||1;
  return { h:hist.map(v=>Math.round(v/tot*1000)/1000), g:gray.map(v=>Math.round((v-mean)/sd*100)/100) };
}
function sigSim(a,b){ if(!a||!b||a.h?.length!==72||b.h?.length!==72||a.g?.length!==b.g?.length) return 0;
  let hi=0; for(let i=0;i<72;i++) hi+=Math.min(a.h[i],b.h[i]);
  let co=0; for(let i=0;i<a.g.length;i++) co+=a.g[i]*b.g[i]; co/=a.g.length;
  return .6*hi+.4*Math.max(0,co); }
const loadImg=src=>new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; });
async function fileSig(file){ const u=URL.createObjectURL(file); try{ return signature(await loadImg(u)); } finally{ URL.revokeObjectURL(u); } }
function rankPhotos(sig){ const out=new Map(); if(!sig) return out; for(const code in PHOTOS) if(byCode[code]&&PHOTOS[code].sig) out.set(code,sigSim(sig,PHOTOS[code].sig)); return out; }

/* ---------- Bottle barcodes (UPC/EAN) ---------- */
let zxingP=null;
async function readUPC(file){
  try{
    const img=await createImageBitmap(file,{imageOrientation:"from-image"});
    if("BarcodeDetector" in window){
      try{ const det=new BarcodeDetector({formats:["ean_13","upc_a","ean_8","upc_e"]});
        const r=await det.detect(img); const hit=r.find(b=>/^\d{8,14}$/.test(b.rawValue)); if(hit) return cleanUPC(hit.rawValue); }catch{}
    }
    if(!zxingP) zxingP=loadScript("vendor/zxing.min.js");
    await zxingP; const Z=window.ZXing; if(!Z) return null;
    const hints=new Map(); hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.UPC_A,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_E]); hints.set(Z.DecodeHintType.TRY_HARDER,true);
    for(const max of [1600,2400,1000]){
      const k=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement("canvas"); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      try{ const reader=new Z.MultiFormatReader(); reader.setHints(hints);
        const res=reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))); if(res?.getText()) return cleanUPC(res.getText()); }catch{}
    }
  }catch{}
  return null;
}
const cleanUPC=s=>{ s=String(s).replace(/\D/g,""); return s.length===13&&s[0]==="0"?s.slice(1):s; };
let UPC=ls.get("bcf-upc",{});
const upcsFor=code=>Object.keys(UPC).filter(u=>UPC[u]===code);

/* ---------- Label reader (runs on the phone) ---------- */
let workerP=null;
const OCR=new URL("vendor/ocr/",location.href).href;
function getWorker(){ if(!workerP) workerP=Tesseract.createWorker("eng",1,{workerPath:OCR+"worker.min.js",workerBlobURL:false,corePath:OCR,langPath:OCR.replace(/\/$/,""),logger:m=>{ if(m.status==="recognizing text") setStatus(`Reading the label… ${Math.round(m.progress*100)}%`,true); else if(/load|initializ/.test(m.status)) setStatus("Loading the label reader (first time only)…",true); }}); return workerP; }
async function prep(file){
  const img=await createImageBitmap(file,{imageOrientation:"from-image"}).catch(()=>null) || await loadImg(URL.createObjectURL(file));
  const max=1800, k=Math.min(1,max/Math.max(img.width,img.height)), w=Math.round(img.width*k), h=Math.round(img.height*k);
  const c=document.createElement("canvas"); c.width=w; c.height=h; const x=c.getContext("2d"); x.drawImage(img,0,0,w,h);
  const d=x.getImageData(0,0,w,h), a=d.data; for(let i=0;i<a.length;i+=4){ const g=.3*a[i]+.59*a[i+1]+.11*a[i+2]; a[i]=a[i+1]=a[i+2]=g; } x.putImageData(d,0,0);
  return c;
}
async function readLabel(file){
  if(!window.Tesseract) throw new Error("no reader");
  try{ const [w,canvas]=await Promise.all([getWorker(),prep(file)]); const { data } = await w.recognize(canvas); return (data.text||"").trim(); }
  catch(e){ workerP=null; throw e; }
}

/* ---------- Photos: stored as small JPEGs in the shared database ---------- */
let PHOTOS={}; // code -> {thumb, sig, at}
const IMG_CACHE=new Map();
async function jpeg(file,max,q){
  const img=await createImageBitmap(file,{imageOrientation:"from-image"}).catch(()=>null) || await loadImg(URL.createObjectURL(file));
  const k=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement("canvas");
  c.width=Math.round(img.width*k); c.height=Math.round(img.height*k); c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",q);
}
const dataUrlToBlob=u=>fetch(u).then(r=>r.blob());
async function fullImg(code){
  if(IMG_CACHE.has(code)) return IMG_CACHE.get(code);
  const p=(async()=>{ try{ const s=await DB.collection("photoImg").doc(code).get(); return s.exists?s.data().img:null; }catch{ return null; } })();
  IMG_CACHE.set(code,p); return p;
}
function hydrate(root=document){
  root.querySelectorAll("img[data-img]").forEach(async el=>{ const code=el.dataset.img; el.removeAttribute("data-img"); const u=await fullImg(code); if(u) el.src=u; });
}

/* ---------- Item card ---------- */
const plate=code=>`<button class="plate" type="button" data-full="${code}" aria-label="Show barcode ${code} full screen">${barcodeSVG(code)}<div class="num">${code}</div></button>`;
const BOTTLE='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 2h4v4l1.5 3v12a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V9L10 6z"/><path d="M8.5 13h7"/></svg>';
const picBlock=code=>{ const p=PHOTOS[code];
  const media=p?`<img src="${p.thumb}" data-img="${code}" alt="Bottle photo">`:`<div class="ph">${BOTTLE}</div>`;
  const act=DB?`<button class="copy" type="button" data-addphoto="${code}">${p?"Replace photo":"Add photo"}</button>`:"";
  const save=(DB&&!p&&lastFile)?`<button class="copy" type="button" data-savesnap="${code}">Use the photo I just took</button>`:"";
  return `<div class="pic" data-pic="${code}">${media}<div class="acts">${p?'<span class="photo-ok">Photo saved</span>':'<span class="count">No photo yet</span>'}${save}${act}</div></div>`; };
const cntBlock=code=>{ const q=COUNTS[code]?.q; return `<div class="cnt" data-cnt="${code}"><label for="cq-${code}">Count</label>
  <button type="button" data-step="-1" aria-label="One less">−1</button><input id="cq-${code}" inputmode="decimal" placeholder="0" value="${q!=null?fmtQty(q):""}"><button type="button" data-step="1" aria-label="One more">+1</button>
  <div class="st">${q!=null?"Counted":""}</div></div>`; };
const starBtn=code=>`<button class="star" type="button" data-star="${code}" aria-pressed="${FAV.includes(code)}" aria-label="Pin to the top">${FAV.includes(code)?"★":"☆"}</button>`;
const itemBlock=r=>{ const ups=upcsFor(r[0]); return `${picBlock(r[0])}<div class="ihead"><div><h3>${esc(r[1])}</h3><div class="prod">${esc(r[2])}</div></div>${starBtn(r[0])}</div>${plate(r[0])}
  <div class="meta"><span class="chip">${pagesTxt(r[4])}</span><span class="chip">${esc(r[3])}</span><button class="copy" type="button" data-copy="${r[0]}">Copy code</button></div>
  ${ups.length?`<div class="upcnote">Bottle barcode linked: ${ups.map(esc).join(", ")}</div>`:""}
  ${cntBlock(r[0])}`; };
function showItem(code,note){
  const r=byCode[code]; if(!r) return;
  resultsEl.innerHTML=`<div class="card">${note?`<span class="tag">${esc(note)}</span>`:""}<div class="match">${itemBlock(r)}</div></div>`;
  hydrate(resultsEl); addRecent(code); resultsEl.scrollIntoView({block:"start",behavior:"smooth"});
}

/* ---------- Snap a bottle ---------- */
const statusEl=$("status"), resultsEl=$("results");
function setStatus(h,spin){ statusEl.hidden=!h; statusEl.innerHTML=(spin?'<span class="spin"></span>':"")+(h||""); }
let busy=false, lastWords=[], lastText="", lastFile=null, lastUPC=null, lastSig=null;
$("photo").onchange=e=>run(e.target); $("photoLib").onchange=e=>run(e.target);
async function run(input){
  const file=input.files?.[0]; input.value=""; if(!file||busy) return;
  busy=true; lastFile=file; lastUPC=null; lastSig=null; lastText=""; const url=URL.createObjectURL(file);
  resultsEl.innerHTML=`<div class="preview"><img src="${url}" alt="Your photo"><div><div class="label">Your photo</div><div id="phase">Reading the label…</div></div></div>`;
  try{
    setStatus("Reading the label…",true);
    const sigP=fileSig(file).catch(()=>null);
    const upc=await readUPC(file); lastUPC=upc;
    if(upc&&UPC[upc]&&byCode[UPC[upc]]){
      setStatus("");
      resultsEl.insertAdjacentHTML("beforeend",`<div class="card"><span class="tag">Matched by the bottle's barcode ${esc(upc)}</span><div class="match">${itemBlock(byCode[UPC[upc]])}</div>
        <button class="copy" type="button" data-wrongupc="1">Not this bottle? Show other matches</button></div>`);
      hydrate(resultsEl); $("phase").textContent="Found it"; addRecent(UPC[upc]); return;
    }
    const text=await readLabel(file); lastText=text; lastSig=await sigP;
    showCandidates(text,upc);
  }catch(e){ setStatus(""); resultsEl.insertAdjacentHTML("beforeend",`<div class="card"><div class="nosku">The label couldn't be read. Reload the app and try again, or type the name in search below.</div>${noSkuBtn()}</div>`); }
  finally{ busy=false; }
}
const noSkuBtn=()=>`<button class="btn btn-quiet" type="button" data-addnosku="1">Not on the sheets? Add it to the No SKU list</button>`;
function showCandidates(text,upc){
  setStatus("");
  lastWords=[...new Set(toks(text))];
  const tx=rankText(text), ph=rankPhotos(lastSig);
  const maxT=Math.max(0,...tx.values())||1, codes=new Set([...tx.keys(),...[...ph].filter(([,s])=>s>=.62).map(([c])=>c)]);
  const scored=[...codes].map(c=>{ const t=(tx.get(c)||0)/maxT, p=ph.get(c)||0; return [c, t+2*Math.max(0,p-.55), p]; })
    .filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if($("phase")) $("phase").textContent=scored.length?"Tap the one that matches":"No match found";
  const upcLine=upc?`<div class="upcnote">Read the bottle's barcode: ${esc(upc)}. Tap the right item and it's linked for next time.</div>`:"";
  resultsEl.insertAdjacentHTML("beforeend", `<div class="card">
    <div class="label">Words read from the label</div><div class="ocr">${esc(text||"(no text found)")}</div>${upcLine}
    ${scored.length?`<div class="cands">${scored.map(([c,,p],i)=>{ const r=byCode[c]; return `<button class="cand${i===0?" best":""}" type="button" data-pick="${c}"><span>${esc(r[1])}</span><span class="code">${c}</span><span class="sub">${esc(r[2])} · ${pagesTxt(r[4])}${p>=.7?" · looks like the saved photo":""}</span></button>`; }).join("")}</div>`
      :`<div class="nosku">Couldn't match this to anything on the sheets. Try a closer, straighter photo of the front label, or type the name below.</div>`}
    ${noSkuBtn()}
    <div class="match" hidden></div></div>`);
}
function pick(p){
  const card=p.closest(".card"), code=p.dataset.pick;
  card.querySelectorAll(".cand").forEach(b=>b.classList.toggle("best",b===p));
  if(lastUPC&&UPC[lastUPC]!==code){ UPC[lastUPC]=code; ls.set("bcf-upc",UPC);
    if(DB) DB.collection("upc").doc(lastUPC).set({code,at:now()}).catch(()=>{}); toast("Bottle barcode linked"); }
  const m=card.querySelector(".match"); m.innerHTML=itemBlock(byCode[code]); m.hidden=false; hydrate(m); m.scrollIntoView({block:"nearest",behavior:"smooth"});
  addRecent(code);
  if(lastWords.length){
    const words=lastWords.slice(0,12);
    const s=new Set(LEARN[code]||[]); words.forEach(w=>s.add(w)); LEARN[code]=[...s].slice(-40); ls.set("bcf-learn",LEARN);
    if(DB){ const sh=new Set(SHARED_LEARN[code]||[]); words.forEach(w=>sh.add(w)); const arr=[...sh].slice(-60); SHARED_LEARN[code]=arr;
      DB.collection("learn").doc(code).set({words:arr,at:now()}).catch(()=>{}); }
    buildIndex();
  }
}
// Some in-app browsers (a link opened inside a messaging app) block the camera: offer Chrome instead.
const IS_ANDROID=/Android/i.test(navigator.userAgent);
function watchPicker(){
  let opened=false; const mark=()=>{opened=true;};
  window.addEventListener("blur",mark,{once:true}); document.addEventListener("visibilitychange",mark,{once:true});
  setTimeout(()=>{ window.removeEventListener("blur",mark); document.removeEventListener("visibilitychange",mark);
    if(!opened && !busy) $("blocked").hidden=false; },1800);
}
$("snapBtn").addEventListener("click",watchPicker); $("libBtn").addEventListener("click",watchPicker);
$("openBrowser").onclick=async()=>{
  const link=appLink(), u=new URL(link);
  if(IS_ANDROID) location.href=`intent://${u.host}${u.pathname}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(link)};end`;
  else window.open(link,"_blank","noopener");
  setTimeout(async()=>{ try{ await navigator.clipboard.writeText(link); $("blockedMsg").textContent="If Chrome didn't open, the link is copied: paste it into Chrome."; }catch{} },1500);
};

/* ---------- Clicks ---------- */
document.addEventListener("click",async e=>{
  const t=e.target;
  const tab=t.closest("[data-tab]"); if(tab){ showTab(tab.dataset.tab); return; }
  const f=t.closest("[data-full]"); if(f){ openFull(f.dataset.full); return; }
  const c=t.closest("[data-copy]"); if(c){ const tx=c.textContent; try{ await navigator.clipboard.writeText(c.dataset.copy); c.textContent="Copied"; }catch{ c.textContent=c.dataset.copy; } setTimeout(()=>c.textContent=tx,1400); return; }
  const p=t.closest("[data-pick]"); if(p){ pick(p); return; }
  const w=t.closest("[data-wrongupc]"); if(w){ w.closest(".card").remove(); setStatus("Reading the label…",true);
    try{ lastText=await readLabel(lastFile); }catch{ lastText=""; } lastSig=await fileSig(lastFile).catch(()=>null); showCandidates(lastText,lastUPC); return; }
  const s=t.closest("[data-star]"); if(s){ toggleFav(s.dataset.star); return; }
  const st=t.closest("[data-step]"); if(st){ const box=st.closest("[data-cnt]"), inp=box.querySelector("input"); const v=Math.max(0,(parseFloat(inp.value)||0)+Number(st.dataset.step)); inp.value=fmtQty(v); saveCount(box.dataset.cnt,v,box); return; }
  const q=t.closest("[data-show]"); if(q){ showTab("find"); showItem(q.dataset.show); return; }
  const ns=t.closest("[data-addnosku]"); if(ns){ addNoSku(lastFile,lastText,lastUPC,ns); return; }
  const nd=t.closest("[data-nsdone]"); if(nd){ DB?.collection("nosku").doc(nd.dataset.nsdone).update({done:nd.dataset.v==="1"}).catch(()=>toast("Couldn't update")); return; }
  const nx=t.closest("[data-nsdel]"); if(nx){ if(!confirm("Remove this bottle from the list?")) return;
    try{ await DB.collection("nosku").doc(nx.dataset.nsdel).delete(); }catch{ toast("Couldn't remove"); } return; }
  const nimg=t.closest("[data-nsimg]"); if(nimg){ openShot(nimg.src); return; }
  const a=t.closest("[data-addphoto]"); if(a){ photoFor=a.dataset.addphoto; $("itemPhoto").click(); return; }
  const sv=t.closest("[data-savesnap]"); if(sv&&lastFile){ savePhoto(sv.dataset.savesnap,lastFile,sv); return; }
});
document.addEventListener("change",e=>{ const box=e.target.closest?.("[data-cnt]"); if(box&&e.target.tagName==="INPUT"){ const raw=e.target.value.trim(); saveCount(box.dataset.cnt, raw===""?null:Math.max(0,parseFloat(raw.replace(",","."))||0), box); } });

/* ---------- Tabs ---------- */
function showTab(name){
  document.querySelectorAll("[data-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===name)));
  document.querySelectorAll("[data-panel]").forEach(p=>p.hidden=p.dataset.panel!==name);
  ls.set("bcf-tab",name); window.scrollTo({top:0});
}

/* ---------- Full-screen barcode ---------- */
const ov=$("overlay"); let lastFocus=null;
async function openFull(code){ const r=byCode[code]; if(!r) return; lastFocus=document.activeElement;
  ov.innerHTML=`${PHOTOS[code]?`<img class="shot" src="${PHOTOS[code].thumb}" data-img="${code}" alt="">`:""}${barcodeSVG(code)}<div class="big">${code}</div><div class="nm">${esc(r[2])} · ${esc(r[1])}</div><div class="tip">Turn screen brightness up. Tap anywhere to close.</div>`;
  ov.hidden=false; ov.tabIndex=-1; ov.focus(); hydrate(ov); }
function openShot(src){ lastFocus=document.activeElement; ov.innerHTML=`<img class="shot" style="max-height:80vh;max-width:92vw" src="${src}" alt=""><div class="tip">Tap anywhere to close.</div>`; ov.hidden=false; }
ov.onclick=()=>{ ov.hidden=true; lastFocus?.focus?.(); };
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!ov.hidden){ ov.hidden=true; } });

/* ---------- Pinned + recent (this phone) ---------- */
let FAV=ls.get("bcf-fav",[]), RECENT=ls.get("bcf-recent",[]);
function addRecent(code){ RECENT=[code,...RECENT.filter(c=>c!==code)].slice(0,12); ls.set("bcf-recent",RECENT); renderQuick(); }
function toggleFav(code){ FAV=FAV.includes(code)?FAV.filter(c=>c!==code):[code,...FAV]; ls.set("bcf-fav",FAV);
  document.querySelectorAll(`[data-star="${code}"]`).forEach(b=>{ const on=FAV.includes(code); b.setAttribute("aria-pressed",String(on)); b.textContent=on?"★":"☆"; });
  renderQuick(); toast(FAV.includes(code)?"Pinned to the top":"Unpinned"); }
function renderQuick(){
  const el=$("quick"); const fav=FAV.filter(c=>byCode[c]), rec=RECENT.filter(c=>byCode[c]&&!fav.includes(c)).slice(0,8);
  const chip=c=>{ const r=byCode[c]; return `<button class="qchip" type="button" data-show="${c}"><span>${esc(r[1])}</span><span class="sub">${esc(r[2])} · ${c}</span></button>`; };
  el.hidden=!(fav.length||rec.length);
  el.innerHTML=(fav.length?`<div class="label">★ Pinned</div><div class="chips">${fav.map(chip).join("")}</div>`:"")+(rec.length?`<div class="label">Recent</div><div class="chips">${rec.map(chip).join("")}</div>`:"");
}

/* ---------- Count (kept on this phone) ---------- */
let COUNTS=ls.get("bcf-counts",{});
function saveCount(code,q,box){
  if(q==null||isNaN(q)) delete COUNTS[code]; else COUNTS[code]={q,at:now()};
  ls.set("bcf-counts",COUNTS);
  document.querySelectorAll(`[data-cnt="${code}"]`).forEach(b=>{ b.querySelector(".st").textContent=q==null?"":"Counted"; const i=b.querySelector("input"); if(i!==document.activeElement) i.value=q==null?"":fmtQty(q); });
  renderCount();
}
function countRows(){ return Object.entries(COUNTS).filter(([c])=>byCode[c]).map(([c,v])=>[byCode[c],v.q]).sort((a,b)=>firstPage(a[0][4])-firstPage(b[0][4])||a[0][2].localeCompare(b[0][2])||a[0][1].localeCompare(b[0][1])); }
function renderCount(){
  const rows=countRows(); $("tabCount").textContent=rows.length; $("cItems").textContent=rows.length;
  $("cBottles").textContent=fmtQty(rows.reduce((s,[,q])=>s+q,0));
  if(!rows.length){ $("cList").innerHTML=`<div class="empty">Nothing counted yet.</div>`; return; }
  let html="", pg=null;
  for(const [r,q] of rows){ const p=firstPage(r[4]); if(p!==pg){ pg=p; html+=`<div class="pghead">Page ${p===999?"?":p}</div>`; }
    html+=`<div class="crow"><button class="nm" type="button" data-show="${r[0]}">${esc(r[1])}</button><span class="q">${fmtQty(q)}</span><span class="s">${esc(r[2])} · <span class="code" style="font-size:.84rem">${r[0]}</span></span></div>`; }
  $("cList").innerHTML=html;
}
function countText(){ const rows=countRows(); let out=`Bar count, ${new Date().toLocaleDateString()}\n`, pg=null;
  for(const [r,q] of rows){ const p=firstPage(r[4]); if(p!==pg){ pg=p; out+=`\nPage ${p===999?"?":p}\n`; } out+=`${r[0]}  ${r[2]} – ${r[1]}: ${fmtQty(q)}\n`; } return out; }
$("cCopy").onclick=async()=>{ if(!countRows().length) return toast("Nothing counted yet"); try{ await navigator.clipboard.writeText(countText()); toast("Count copied"); }catch{ toast("Couldn't copy on this phone"); } };
$("cCsv").onclick=async()=>{
  const rows=countRows(); if(!rows.length) return toast("Nothing counted yet");
  const q=s=>`"${String(s).replace(/"/g,'""')}"`;
  const csv="Page,Code,Producer,Item,Category,Count\n"+rows.map(([r,n])=>[firstPage(r[4])===999?"":firstPage(r[4]),r[0],r[2],r[1],r[3],fmtQty(n)].map(q).join(",")).join("\n");
  const name=`bar-count-${new Date().toISOString().slice(0,10)}.csv`, file=new File([csv],name,{type:"text/csv"});
  try{ if(navigator.canShare?.({files:[file]})){ await navigator.share({files:[file],title:"Bar count"}); return; } }catch(e){ if(e?.name==="AbortError") return; }
  const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=name; document.body.appendChild(a); a.click(); a.remove();
};
$("cClear").onclick=()=>{
  if(!countRows().length) return; if(!confirm("Clear this count and start a new one? Copy or download it first if you need it.")) return;
  COUNTS={}; ls.set("bcf-counts",COUNTS); renderCount();
  document.querySelectorAll("[data-cnt] input").forEach(i=>i.value=""); document.querySelectorAll("[data-cnt] .st").forEach(s=>s.textContent="");
  toast("New count started");
};

/* ---------- No SKU list (shared) ---------- */
let NOSKU=[];
async function addNoSku(file,text,upc,btn){
  if(!DB){ toast("The shared list isn't set up yet"); return; }
  const note=prompt("What is it? (name, size, anything useful)", (text||"").split("\n").map(s=>s.trim()).filter(Boolean).slice(0,2).join(" ").slice(0,80));
  if(note===null) return;
  if(btn){ btn.disabled=true; btn.textContent="Adding…"; }
  try{
    const img=file?await jpeg(file,700,.72):null;
    await DB.collection("nosku").add({note:note.trim(),words:(text||"").slice(0,300),upc:upc||"",img,at:now(),done:false});
    if(btn) btn.textContent="Added to the No SKU list"; toast("Added to the No SKU list");
  }catch(e){ if(btn){ btn.disabled=false; btn.textContent="Didn't save, tap to retry"; } else toast("Didn't save. Check your connection."); }
}
$("nsPhoto").onchange=async e=>{ const f=e.target.files?.[0]; e.target.value=""; if(!f) return;
  $("nsNote").hidden=false; $("nsNote").textContent="Reading the label…";
  const [text,upc]=await Promise.all([readLabel(f).catch(()=>""),readUPC(f)]);
  $("nsNote").hidden=true; addNoSku(f,text,upc,null); };
$("nsShowDone").onchange=renderNoSku;
function renderNoSku(){
  const open=NOSKU.filter(n=>!n.done); $("tabNosku").textContent=open.length;
  const list=$("nsShowDone").checked?NOSKU:open;
  $("nsList").innerHTML=!DB?`<div class="empty">The shared No SKU list turns on once the app's shared storage is set up.</div>`:list.length?list.map(n=>`<div class="nrow${n.done?" done":""}">${n.img?`<img src="${esc(n.img)}" alt="" data-nsimg="1" style="cursor:zoom-in">`:`<span class="ph">${BOTTLE}</span>`}
    <div class="t"><b>${esc(n.note||"(no description)")}</b><span class="count">${new Date(n.at).toLocaleDateString()}${n.upc?` · barcode <span class="code" style="font-size:.85rem">${esc(n.upc)}</span>`:""}</span>${n.words?`<span class="w">${esc(n.words.replace(/\s+/g," ").slice(0,140))}</span>`:""}
    <div class="btn-row" style="margin-top:4px"><button class="copy" type="button" data-nsdone="${esc(n.id)}" data-v="${n.done?"0":"1"}">${n.done?"Reopen":"SKU added"}</button><button class="copy" type="button" data-nsdel="${esc(n.id)}">Remove</button></div></div></div>`).join("")
    :`<div class="empty">${NOSKU.length?"Everything on the list has a SKU now.":"No bottles waiting for a SKU."}</div>`;
}
$("nsCopy").onclick=async()=>{ const open=NOSKU.filter(n=>!n.done); if(!open.length) return toast("Nothing on the list");
  const txt="Bottles that need a SKU\n\n"+open.map(n=>`- ${n.note}${n.upc?` (barcode ${n.upc})`:""}, ${new Date(n.at).toLocaleDateString()}`).join("\n");
  try{ await navigator.clipboard.writeText(txt); toast("List copied"); }catch{ toast("Couldn't copy on this phone"); } };

/* ---------- Install + share ---------- */
const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
let installEvt=null;
window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); installEvt=e; $("installBtn").hidden=false; });
window.addEventListener("appinstalled",()=>{ $("installBtn").hidden=true; });
if(!standalone) $("installBtn").hidden=false;
$("installBtn").onclick=async()=>{
  if(installEvt){ installEvt.prompt(); const r=await installEvt.userChoice.catch(()=>null); installEvt=null; if(r?.outcome==="accepted") $("installBtn").hidden=true; return; }
  alert(/iPhone|iPad/.test(navigator.userAgent)?"Tap the Share button at the bottom of Safari, then Add to Home Screen.":"Open Chrome's ⋮ menu (top right), then tap Add to Home screen or Install app.");
};
$("shareBtn").onclick=async()=>{
  const link=appLink(), text="Bar Code Finder: snap a bottle and get its inventory barcode. Open this in Chrome, then add it to your home screen.";
  try{ if(navigator.share){ await navigator.share({title:"Bar Code Finder",text,url:link}); return; } }catch(e){ if(e?.name==="AbortError") return; }
  try{ await navigator.clipboard.writeText(link); toast("Link copied: send it to your team"); }catch{ prompt("Copy this link:",link); }
};

/* ---------- Photos ---------- */
function refreshPhotoCount(){ const n=ITEMS.filter(r=>PHOTOS[r[0]]).length, pc=$("photoCount"); pc.hidden=!DB; pc.textContent=`${n} of ${ITEMS.length} items have a photo`; }
function refreshPhotos(){ refreshPhotoCount(); renderList(); document.querySelectorAll("[data-pic]").forEach(el=>{ const n=document.createElement("div"); n.innerHTML=picBlock(el.dataset.pic); const fresh=n.firstElementChild; el.replaceWith(fresh); hydrate(fresh); }); }
async function savePhoto(code,file,btn){
  if(!DB) return;
  if(btn){ btn.disabled=true; btn.textContent="Saving…"; }
  try{
    const img=await jpeg(file,900,.75), thumb=await jpeg(file,96,.6);
    const sig=await fileSig(await dataUrlToBlob(img)).catch(()=>null);
    await DB.collection("photoImg").doc(code).set({img,at:now()});
    await DB.collection("photos").doc(code).set(sig?{thumb,sig,at:now()}:{thumb,at:now()});
    IMG_CACHE.set(code,Promise.resolve(img));
  }catch(e){ if(btn){ btn.disabled=false; btn.textContent="Didn't save, tap to retry"; } }
}
let photoFor=null;
$("itemPhoto").onchange=e=>{ const f=e.target.files?.[0], code=photoFor; e.target.value=""; if(!f||!code) return;
  savePhoto(code,f,document.querySelector(`[data-addphoto="${code}"]`)); };

/* ---------- Update the item list from new sheets (read on the phone, no AI) ---------- */
const CATS=["Wine","Liquor","Beer/Cider","N/A / Mixers / Juice","Pantry / Produce / Misc"];
function renderSheets(){
  const src=CATALOG?`Uploaded ${new Date(CATALOG.at).toLocaleDateString()} from ${esc(CATALOG.source||"new sheets")}`:"The original inventory sheets";
  $("shInfo").innerHTML=`<b>${ITEMS.length} items</b> · ${src}`;
  $("shRevert").hidden=!CATALOG; $("shPick").hidden=!DB;
  if(!DB){ shStatus("Updating the list turns on once the app's shared storage is set up."); }
}
function shStatus(h,spin){ const el=$("shStatus"); el.hidden=!h; el.innerHTML=(spin?'<span class="spin"></span>':"")+(h||""); }
const guessCat=t=>{ t=norm(t); if(/\b(beer|ipa|lager|pils|cider|birra|kolsch|ale)\b/.test(t)) return "Beer/Cider";
  if(/\b(juice|soda|tonic|water|bitters|syrup|grenadine|cola|limonata|n a|zero|espresso|capsules|nectar|ice)\b/.test(t)) return "N/A / Mixers / Juice";
  if(/\b(vodka|gin|rum|tequila|mezcal|whisk(e)?y|bourbon|scotch|rye|amaro|liqueur|vermouth|aperitivo|bitter|grappa|limoncello|brandy|sambuca|fernet|campari|aperol|chartreuse|maraschino)\b/.test(t)) return "Liquor";
  if(/\b(lemons?|limes?|oranges?|mint|basil|sugar|milk|evoo|olio|vinegar|cherries|pepper|glass)\b/.test(t)) return "Pantry / Produce / Misc";
  return "Wine"; };
// Header names that probably mean each field.
const FIELD_GUESS={code:/^(sku|code|item ?(no|num|number|#|code)|item|article|plu|id)$/i,name:/^(name|description|desc|item ?name|product|item description)$/i,producer:/^(producer|brand|vendor|winery|distiller|maker|supplier)$/i,category:/^(category|cat|type|class|department|dept)$/i,page:/^(page|sheet|pg|location|section)$/i};
async function readSheetRows(file){
  const name=file.name.toLowerCase();
  if(name.endsWith(".pdf")||file.type==="application/pdf"){
    if(!window.pdfjsLib){ await loadScript("vendor/pdf.min.js"); pdfjsLib.GlobalWorkerOptions.workerSrc="vendor/pdf.worker.min.js"; }
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise; const items=[];
    for(let i=1;i<=pdf.numPages;i++){ const tc=await (await pdf.getPage(i)).getTextContent();
      const rows={}; tc.items.forEach(it=>{ const y=Math.round(it.transform[5]/3); (rows[y]=rows[y]||[]).push([it.transform[4],it.str]); });
      for(const y of Object.keys(rows).sort((a,b)=>b-a)){ const line=rows[y].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(" ").replace(/\s+/g," ").trim();
        const mm=line.match(/^(\d{5,9})\s+(.{3,})$/); const m2=!mm&&line.match(/^(.{3,}?)\s+(\d{5,9})(\s|$)/);
        const code=mm?mm[1]:m2?m2[2]:null, rest=(mm?mm[2]:m2?m2[1]:"").replace(/(\s+[\d.,_]+)+$/,"").trim();
        if(code&&rest) items.push({code,name:rest,producer:"",category:"",page:String(i)}); } }
    return {mode:"pdf",items};
  }
  if(!window.XLSX) await loadScript("vendor/xlsx.full.min.js");
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"}); const sheets=[];
  wb.SheetNames.forEach((n,si)=>{ const rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:""}).filter(r=>r.some(c=>String(c).trim()));
    if(rows.length) sheets.push({name:n,index:si+1,rows}); });
  return {mode:"table",sheets};
}
function headerIndex(rows){ // the first row that has a column looking like a code header
  for(let i=0;i<Math.min(rows.length,15);i++) if(rows[i].some(c=>FIELD_GUESS.code.test(String(c).trim()))) return i; return -1; }
function tableToItems(sheets,map){
  const out=[];
  for(const sh of sheets){ const hi=headerIndex(sh.rows); const body=sh.rows.slice(hi+1);
    for(const r of body){ const g=k=>map[k]>=0?String(r[map[k]]??"").trim():"";
      const code=g("code").replace(/\.0$/,""); if(!/^[0-9A-Za-z-]{3,20}$/.test(code)) continue;
      out.push({code,name:g("name"),producer:g("producer"),category:g("category"),page:(g("page").match(/\d+/)||[String(sheets.length>1?sh.index:"")])[0]}); } }
  return out;
}
function mergeItems(raw){
  const found=new Map();
  for(const it of raw){ const old=byCode[it.code]||BASE_ITEMS.find(r=>r[0]===it.code); const pg=it.page||"";
    const prev=found.get(it.code);
    if(prev){ if(pg){ const ps=new Set(prev[4].split(", ").filter(Boolean)); ps.add(pg); prev[4]=[...ps].sort((a,b)=>a-b).join(", "); } continue; }
    // Keep the names already on file for codes we know; new codes take what the sheet says.
    const name=old?old[1]:it.name, producer=old?old[2]:it.producer;
    const cat=CATS.find(c=>norm(c)===norm(it.category))||(old?old[3]:guessCat(it.name+" "+it.category));
    found.set(it.code,[it.code,name||it.code,producer||"",cat,pg||(old?old[4]:"?"),old?.[5]||""]); }
  return [...found.values()].sort((a,b)=>a[2].localeCompare(b[2])||a[1].localeCompare(b[1]));
}
let SHEET=null;
$("shFile").onchange=async e=>{
  const file=e.target.files?.[0]; e.target.value=""; if(!file||!DB) return;
  $("shPreview").hidden=true;
  try{
    shStatus("Reading the file…",true);
    SHEET={file:file.name,...await readSheetRows(file)};
    shStatus("");
    if(SHEET.mode==="pdf") return previewList(mergeItems(SHEET.items),"Read from the PDF: each row that starts or ends with an item code. Item names already on file are kept.");
    // Spreadsheet: let the person confirm which column is which.
    const sh=SHEET.sheets[0]; if(!sh) throw new Error("That file looks empty.");
    const hi=headerIndex(sh.rows); const heads=(hi>=0?sh.rows[hi]:sh.rows[0]).map((h,i)=>String(h).trim()||`Column ${i+1}`);
    const guess=k=>heads.findIndex(h=>FIELD_GUESS[k].test(h));
    const sel=(k,label,req)=>`<label class="field"><span class="label">${label}</span><select data-map="${k}" style="font:1rem var(--body);padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)">${req?"":`<option value="-1">(none)</option>`}${heads.map((h,i)=>`<option value="${i}"${guess(k)===i?" selected":""}>${esc(h)}</option>`).join("")}</select></label>`;
    $("shPreview").innerHTML=`<div class="card"><div class="label">Which column is which?</div>${sel("code","Item code (SKU)",true)}${sel("name","Item name")}${sel("producer","Producer / brand")}${sel("category","Category")}${sel("page","Page (otherwise each tab counts as a page)")}
      <button class="btn btn-primary" id="shMapGo" type="button">Check the list</button></div>`;
    $("shPreview").hidden=false;
    $("shMapGo").onclick=()=>{ const map={}; document.querySelectorAll("[data-map]").forEach(s=>map[s.dataset.map]=Number(s.value)); previewList(mergeItems(tableToItems(SHEET.sheets,map)),""); };
  }catch(err){ shStatus(esc(err?.message||"Couldn't read that file. Try an Excel or CSV export of the inventory sheets.")); }
};
function previewList(list,note){
  if(list.length<10){ shStatus(`Only found ${list.length} items in that file, so nothing changed. Check it's the full set of sheets${SHEET?.mode==="pdf"?", or try an Excel export":""}.`); $("shPreview").hidden=true; return; }
  const added=list.filter(r=>!byCode[r[0]]), keep=new Set(list.map(r=>r[0])), removed=ITEMS.filter(r=>!keep.has(r[0]));
  const changed=list.filter(r=>byCode[r[0]]&&byCode[r[0]][4]!==r[4]);
  const li=rs=>rs.slice(0,60).map(r=>`<li>${esc(r[2]?r[2]+" · ":"")}${esc(r[1])} <span class="code" style="font-size:.8rem">${r[0]}</span></li>`).join("")+(rs.length>60?`<li>…and ${rs.length-60} more</li>`:"");
  $("shPreview").innerHTML=`<div class="card"><div class="label">Found ${list.length} items in ${esc(SHEET.file)}</div>${note?`<p class="hint">${esc(note)}</p>`:""}
    <div class="diff"><div><b>${added.length}</b> new${added.length?`<ul>${li(added)}</ul>`:""}</div>
    <div><b>${removed.length}</b> no longer on the sheets${removed.length?`<ul>${li(removed)}</ul>`:""}</div>
    <div><b>${changed.length}</b> on a different page</div></div>
    <p class="hint">Check a few codes against the sheets before switching. Photos, linked barcodes, and counts stay attached to their codes.</p>
    <div class="btn-row"><button class="btn btn-primary" id="shApply" type="button">Use this list</button><button class="btn btn-quiet" id="shCancel" type="button">Cancel</button></div></div>`;
  $("shPreview").hidden=false;
  $("shApply").onclick=async()=>{ const b=$("shApply"); b.disabled=true; b.textContent="Saving…";
    try{ await DB.collection("catalog").doc("current").set({items:list.map(r=>({c:r[0],n:r[1],p:r[2],k:r[3],g:r[4],a:r[5]||""})),source:SHEET.file,at:now()}); $("shPreview").hidden=true; toast("Item list updated"); }
    catch{ b.disabled=false; b.textContent="Didn't save, tap to retry"; } };
  $("shCancel").onclick=()=>{ $("shPreview").hidden=true; };
}
$("shRevert").onclick=async()=>{ if(!confirm("Go back to the original item list for everyone?")) return;
  try{ await DB.collection("catalog").doc("current").delete(); toast("Back to the original list"); }catch{ toast("Couldn't change the list"); } };

/* ---------- Search ---------- */
const listEl=$("list"), qEl=$("q"), countEl=$("count");
let openCode=null;
function renderList(){
  const terms=norm(qEl.value).split(/\s+/).filter(Boolean);
  const miss=$("missOnly").checked;
  const hits=ITEMS.filter((r,i)=>(terms.every(t=>HAY[i].includes(t))||terms.length===1&&upcsFor(r[0]).some(u=>u.includes(terms[0])))&&(!miss||!PHOTOS[r[0]]));
  countEl.textContent=(terms.length||miss)?`${hits.length} match${hits.length===1?"":"es"}`:"Tap an item to show its barcode.";
  listEl.innerHTML=hits.slice(0,80).map(r=>`<button class="row" type="button" data-row="${r[0]}" aria-expanded="${openCode===r[0]}">
      ${PHOTOS[r[0]]?`<img class="th" src="${PHOTOS[r[0]].thumb}" alt="">`:`<span class="th">${BOTTLE}</span>`}<span class="n">${esc(r[1])}</span><span class="c"><span class="code">${r[0]}</span><span class="pg">${COUNTS[r[0]]?`Count ${fmtQty(COUNTS[r[0]].q)}`:pagesTxt(r[4])}</span></span>
      <span class="p">${esc(r[2])}${r[5]?" · <em>"+esc(r[5])+"</em>":""}</span></button>${openCode===r[0]?`<div class="expand"><div class="card" style="border:0;padding:0">${itemBlock(r)}</div></div>`:""}`).join("")
    +(hits.length>80?`<div class="row note" style="cursor:default"><span class="p">Showing 80 of ${hits.length}. Type more to narrow it down.</span></div>`:"")
    +(!hits.length?`<div class="row note" style="cursor:default"><span class="p">Nothing on the sheets matches that. Add it on the No SKU tab.</span></div>`:"");
  hydrate(listEl);
}
listEl.addEventListener("click",e=>{ if(e.target.closest(".expand")) return; const r=e.target.closest("[data-row]"); if(!r) return; openCode=openCode===r.dataset.row?null:r.dataset.row; if(openCode) addRecent(openCode); renderList(); });
qEl.addEventListener("input",()=>{openCode=null;renderList();});
$("missOnly").addEventListener("change",()=>{openCode=null;renderList();});

/* ---------- Shared storage ---------- */
let DB=null;
async function startShared(teamId){
  if(!FIREBASE) return;
  const note=$("syncNote");
  try{
    const { connect } = await import("./store.js");
    DB=await connect(FIREBASE,teamId);
  }catch(e){ console.error(e); note.hidden=false; note.textContent="Offline: shared photos and lists will appear when you're back online."; return; }
  $("missWrap").hidden=false; renderNoSku(); renderSheets(); refreshPhotos();
  const err=()=>{ note.hidden=false; note.textContent="Couldn't reach the shared lists. Check your connection."; };
  DB.collection("photos").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>{ const v=d.data(); if(typeof v?.thumb==="string"&&v.thumb.startsWith("data:image/")) m[d.id]={thumb:v.thumb,sig:v.sig,at:v.at}; });
    for(const c in m) if(PHOTOS[c]?.at!==m[c].at) IMG_CACHE.delete(c);
    PHOTOS=m; refreshPhotos(); },err);
  DB.collection("upc").onSnapshot(snap=>{ const m={...UPC}; snap.docs.forEach(d=>{ const v=d.data(); if(typeof v?.code==="string") m[d.id]=v.code; }); UPC=m; ls.set("bcf-upc",UPC); },err);
  DB.collection("learn").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>{ const v=d.data(); if(Array.isArray(v?.words)) m[d.id]=v.words.filter(w=>typeof w==="string").slice(0,60); }); SHARED_LEARN=m; buildIndex(); },err);
  DB.collection("nosku").orderBy("at","desc").onSnapshot(snap=>{ NOSKU=snap.docs.map(d=>({id:d.id,...d.data()})).filter(n=>!n.img||String(n.img).startsWith("data:image/")); renderNoSku(); },err);
  DB.doc("catalog/current").onSnapshot(snap=>{ const v=snap.exists?snap.data():null;
    if(v&&Array.isArray(v.items)&&v.items.length>=10){ CATALOG={at:v.at,source:v.source}; setItems(v.items.filter(r=>r&&r.c&&r.n).map(r=>[String(r.c),String(r.n),String(r.p||""),String(r.k||"Liquor"),String(r.g||"?"),String(r.a||"")])); }
    else if(CATALOG){ CATALOG=null; setItems(BASE_ITEMS); } },err);
}

/* ---------- Start ---------- */
async function start(code,fromLink){
  let items;
  try{ items=await unlockItems(code); }catch{ return false; }
  TEAM_CODE=code; ls.set("bcf-team",code);
  if(fromLink) history.replaceState(null,"",location.pathname);
  BASE_ITEMS=items; $("lock").hidden=true; $("app").hidden=false;
  setItems(BASE_ITEMS); renderNoSku(); showTab(ls.get("bcf-tab","find"));
  startShared(await teamIdFor(code));
  return true;
}
(async()=>{
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
  const fromHash=new URLSearchParams(location.hash.slice(1)).get("t");
  const code=fromHash||ls.get("bcf-team",null);
  if(code&&await start(code.trim(),!!fromHash)) return;
  $("lock").hidden=false;
  if(code) $("lockMsg").textContent="That link's team code didn't work. Ask for a fresh link, or type the code below.";
  $("lockForm").onsubmit=async e=>{ e.preventDefault(); const v=$("lockCode").value.trim().toLowerCase(); if(!v) return;
    if(!await start(v,false)) $("lockMsg").textContent="That code didn't work. Check it and try again."; };
})();
