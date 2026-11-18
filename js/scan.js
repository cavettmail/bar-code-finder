"use strict";
// Reading photos: bottle barcodes, label text, photo look-alikes, snapping, shelf scan and AI.
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
  const p=(async()=>{ try{ const s=await DB.collection("photoImg").doc(code).get(); return s.exists?safeImg(s.data()?.img):null; }catch{ return null; } })();
  IMG_CACHE.set(code,p); return p;
}
function hydrate(root=document){
  root.querySelectorAll("img[data-img]").forEach(async el=>{ const code=el.dataset.img; el.removeAttribute("data-img"); const u=await fullImg(code); if(u) el.src=u; });
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
    // Online with a key: ask the AI at the same time as the on-phone readers, so it costs no extra waiting.
    const aiP=aiOn()?askAI(file):null;
    const upc=await readUPC(file); lastUPC=upc;
    if(upc&&UPC[upc]&&byCode[UPC[upc]]){
      setStatus("");
      resultsEl.insertAdjacentHTML("beforeend",`<div class="card"><span class="tag">Matched by the bottle's barcode ${esc(upc)}</span><div class="match">${itemBlock(byCode[UPC[upc]])}</div>
        <button class="copy" type="button" data-wrongupc="1">Not this bottle? Show other matches</button></div>`);
      hydrate(resultsEl); $("phase").textContent="Found it"; addRecent(UPC[upc]); return;
    }
    let text="", ocrFailed=false;
    try{ text=await readLabel(file); }catch{ ocrFailed=true; }
    if(aiP) setStatus("Checking the photo with AI…",true);
    const ai=aiP?await aiP:null;
    lastText=text; lastSig=await sigP;
    if(ocrFailed&&!ai?.matches?.length) throw new Error("unreadable");
    showCandidates(text,upc,ai);
  }catch(e){ setStatus(""); resultsEl.insertAdjacentHTML("beforeend",`<div class="card"><div class="nosku">The label couldn't be read. Reload the app and try again, or type the name in search below.</div>${noSkuBtn()}</div>`); }
  finally{ busy=false; }
}
/* ---------- Whole shelf: AI lists every bottle in order, with barcodes to scan one after another ---------- */
let SHELF=[]; // [{code, seen, count, confidence, shelf}]
$("shelfPhoto").onchange=e=>runShelf(e.target);
async function runShelf(input){
  const file=input.files?.[0]; input.value=""; if(!file||busy) return;
  if(!AI?.on||!DB){ toast("Shelf scan needs AI turned on in the manager page"); return; }
  const url=URL.createObjectURL(file);
  resultsEl.innerHTML=`<div class="preview"><img src="${url}" alt="Your shelf photo"><div><div class="label">Your shelf photo</div><div id="phase">Finding every bottle…</div></div></div>`;
  if(!navigator.onLine){ resultsEl.insertAdjacentHTML("beforeend",`<div class="card"><div class="nosku">Shelf scan needs a connection. You're offline, so snap bottles one at a time instead, or try again when you have signal.</div></div>`); $("phase").textContent="Offline"; return; }
  busy=true; lastFile=file;
  try{
    setStatus("The AI is finding every bottle on the shelf. This can take up to a minute…",true);
    aiMod=aiMod||await mod("ai.js");
    const img=await jpeg(file,2000,.85);
    const { shelves }=await aiMod.aiShelf({app:DB.app,model:AI.model,imageDataUrl:img,items:ITEMS});
    SHELF=shelves.flatMap((sh,si)=>sh.map(b=>({...b,shelf:si+1})));
    setStatus(""); renderShelf(shelves.length);
  }catch(e){ console.warn(e); setStatus("");
    resultsEl.insertAdjacentHTML("beforeend",`<div class="card"><div class="nosku">${/abort|timeout/i.test(String(e?.name)+String(e?.message))?"The AI took too long. Try a photo of fewer shelves at a time.":"The shelf scan didn't go through. Check your signal and try again."}</div></div>`);
    if($("phase")) $("phase").textContent="Didn't work"; }
  finally{ busy=false; }
}
const shelfMatched=()=>SHELF.filter(b=>b.code&&byCode[b.code]);
function renderShelf(nShelves){
  const hits=shelfMatched(), miss=SHELF.length-hits.length, bottles=SHELF.reduce((a,b)=>a+b.count,0);
  if($("phase")) $("phase").textContent=SHELF.length?`${bottles} bottle${bottles===1?"":"s"} found`:"No bottles found";
  if(!SHELF.length){ resultsEl.insertAdjacentHTML("beforeend",`<div class="card"><div class="nosku">The AI couldn't make out any bottles. Step back so the labels face the camera, use good light, and try one or two shelves at a time.</div></div>`); return; }
  let n=0, cur=0, html="";
  for(const b of SHELF){
    if(b.shelf!==cur){ cur=b.shelf; html+=`<div class="pghead" style="margin:0 -14px">Shelf ${cur}${cur===1?" (top)":""}</div>`; }
    const r=b.code&&byCode[b.code], cnt=b.count>1?` · ×${b.count} side by side`:"";
    if(r){ n++; html+=`<div class="shelfrow"><div class="n">${n}</div><div><div class="t">${esc(r[1])}</div>
      <div class="s">${esc(r[2])} · ${pagesTxt(r[4])}${cnt}${b.confidence<.7?' · <b>check this one</b>':""}</div>${plate(r[0])}</div></div>`; }
    else html+=`<div class="shelfrow miss"><div class="n">–</div><div><div class="t">Not on the sheets: ${esc(b.seen||"unknown bottle")}</div><div class="s">No barcode${cnt}. Add it on the No SKU tab if it needs one.</div></div></div>`;
  }
  resultsEl.insertAdjacentHTML("beforeend",`<div class="card">
    <div class="label">${hits.length} item${hits.length===1?"":"s"} to scan, in shelf order${miss?` · ${miss} not on the sheets`:""}</div>
    <p class="hint">Top shelf first, left to right. Bottles marked <b>check this one</b> are the AI's best guess, so glance at the label before scanning.</p>
    ${hits.length?`<button class="btn btn-primary" type="button" data-stepstart="0">Scan them in order</button>`:""}
    <div style="margin-top:8px">${html}</div></div>`);
}
// Step-through: one big barcode at a time with Back / Next.
let STEP=-1;
function openStep(i){
  const list=shelfMatched(); if(!list.length) return;
  if(i>=list.length){ ov.innerHTML=`<div class="big" style="letter-spacing:0">All ${list.length} done</div><div class="nm">Every matched bottle on the shelf has been shown.</div>
    <div class="stepnav"><button type="button" data-sn="${list.length-1}">Back</button><button type="button" class="next" data-sn="close">Finish</button></div>`; STEP=list.length; ov.hidden=false; return; }
  STEP=Math.max(0,i); const b=list[STEP], r=byCode[b.code]; lastFocus=lastFocus||document.activeElement;
  ov.innerHTML=`<div class="pos">${STEP+1} of ${list.length} · Shelf ${b.shelf}${b.count>1?` · ×${b.count}`:""}</div>${barcodeSVG(r[0])}<div class="big">${r[0]}</div><div class="nm">${esc(r[2])} · ${esc(r[1])}</div>
    <div class="stepnav"><button type="button" data-sn="${STEP-1}" ${STEP===0?"disabled":""}>Back</button><button type="button" class="next" data-sn="${STEP+1}">${STEP+1===list.length?"Done":"Next"}</button></div>
    <div class="tip">Scan, then tap Next. Tap outside the buttons to stop.</div>`;
  ov.hidden=false; ov.tabIndex=-1; ov.focus();
}
document.addEventListener("keydown",e=>{ if(ov.hidden||STEP<0) return;
  if(e.key==="ArrowRight"){ e.preventDefault(); openStep(STEP+1); } else if(e.key==="ArrowLeft"&&STEP>0){ e.preventDefault(); openStep(STEP-1); } });
/* ---------- AI photo match (online only) ---------- */
// {on, model} set by a manager and shared through Firebase. Older versions kept a Gemini key here: drop it from the phone.
let AI=(v=>v&&(v.on||v.key)?{on:true,model:String(v.model||"")}:null)(ls.get("bcf-ai",null)); ls.set("bcf-ai",AI);
const aiOn=()=>!!(AI?.on&&DB&&navigator.onLine);
let aiMod=null;
async function askAI(file){
  try{
    aiMod=aiMod||await mod("ai.js");
    const img=await jpeg(file,1024,.8);
    return await aiMod.aiIdentify({app:DB.app,model:AI.model,imageDataUrl:img,items:ITEMS});
  }catch(e){ console.warn("AI match failed",e); return {error:true,matches:[],seen:""}; }
}
const noSkuBtn=()=>`<button class="btn btn-quiet" type="button" data-addnosku="1">Not on the sheets? Add it to the No SKU list</button>`;
function showCandidates(text,upc,ai){
  setStatus("");
  lastWords=[...new Set(toks(text+" "+(ai?.seen||"")))];
  const tx=rankText(text), ph=rankPhotos(lastSig);
  const maxT=Math.max(0,...tx.values())||1, codes=new Set([...tx.keys(),...[...ph].filter(([,s])=>s>=.62).map(([c])=>c)]);
  let scored=[...codes].map(c=>{ const t=(tx.get(c)||0)/maxT, p=ph.get(c)||0; return [c, t+2*Math.max(0,p-.55), p, 0]; })
    .filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  // AI picks go first; label and photo matches fill in below.
  const aiHits=(ai?.matches||[]).filter(m=>byCode[m.code]&&m.confidence>=.3);
  if(aiHits.length){ const pos=new Map(scored.map(x=>[x[0],x]));
    scored=[...aiHits.map(m=>[m.code,9+m.confidence,pos.get(m.code)?.[2]||0,m.confidence]), ...scored.filter(x=>!aiHits.some(m=>m.code===x[0]))]; }
  scored=scored.slice(0,6);
  if($("phase")) $("phase").textContent=scored.length?"Tap the one that matches":"No match found";
  const upcLine=upc?`<div class="upcnote">Read the bottle's barcode: ${esc(upc)}. Tap the right item and it's linked for next time.</div>`:"";
  const aiLine=ai&&!ai.error?(ai.seen?`<div class="label" style="margin-top:8px">AI read the label as</div><div class="ocr">${esc(ai.seen)}</div>`:"")
    :ai?.error?`<div class="hint">AI check didn't go through, so these are from the label text only.</div>`
    :(AI?.on&&!navigator.onLine)?`<div class="hint">Offline: matched from the label text only. AI matching comes back when you're online.</div>`:"";
  resultsEl.insertAdjacentHTML("beforeend", `<div class="card">
    <div class="label">Words read from the label</div><div class="ocr">${esc(text||"(no text found)")}</div>${aiLine}${upcLine}
    ${scored.length?`<div class="cands">${scored.map(([c,,p,ac],i)=>{ const r=byCode[c]; return `<button class="cand${i===0?" best":""}" type="button" data-pick="${c}"><span>${esc(r[1])}</span><span class="code">${c}</span><span class="sub">${esc(r[2])} · ${pagesTxt(r[4])}${ac?` · AI match${ac>=.8?"":" (not sure)"}`:""}${p>=.7?" · looks like the saved photo":""}</span></button>`; }).join("")}</div>`
      :`<div class="nosku">Couldn't match this to anything on the sheets. Try a closer, straighter photo of the front label, or type the name below.</div>`}
    ${noSkuBtn()}
    <div class="match" hidden></div></div>`);
}
function pick(p){
  const card=p.closest(".card"), code=p.dataset.pick;
  card.querySelectorAll(".cand").forEach(b=>b.classList.toggle("best",b===p));
  if(lastUPC&&UPC[lastUPC]!==code){ UPC[lastUPC]=code; ls.set("bcf-upc",UPC);
    if(DB) logged(`Linked bottle barcode ${lastUPC} to ${byCode[code]?.[1]||code}`,[["upc/"+lastUPC,{code,at:now()}]]).catch(()=>{}); toast("Bottle barcode linked"); }
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
