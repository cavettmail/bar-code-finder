"use strict";
// Screens: item cards, taps, tabs, full-screen barcode, help, pinned/recent, install/share, photos, search.
/* ---------- Item card ---------- */
const plate=code=>`<button class="plate" type="button" data-full="${code}" aria-label="Show barcode ${code} full screen">${barcodeSVG(code)}<div class="num">${code}</div></button>`;
const BOTTLE='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 2h4v4l1.5 3v12a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V9L10 6z"/><path d="M8.5 13h7"/></svg>';
const picBlock=code=>{ const p=PHOTOS[code];
  const media=p?`<img src="${esc(p.thumb)}" data-img="${code}" alt="Bottle photo">`:`<div class="ph">${BOTTLE}</div>`;
  const act=DB?`<button class="copy" type="button" data-addphoto="${code}">${p?"Replace photo":"Add photo"}</button>`:"";
  const save=(DB&&!p&&lastFile)?`<button class="copy" type="button" data-savesnap="${code}">Use the photo I just took</button>`:"";
  return `<div class="pic" data-pic="${code}">${media}<div class="acts">${p?'<span class="photo-ok">Photo saved</span>':'<span class="count">No photo yet</span>'}${save}${act}</div></div>`; };
const cntBlock=code=>{ const q=myQ(code); return `<div class="cnt" data-cnt="${code}"><label for="cq-${code}">Count</label>
  <button type="button" data-step="-1" aria-label="One less">−1</button><input id="cq-${code}" inputmode="decimal" placeholder="0" value="${q!=null?fmtQty(q):""}"><button type="button" data-step="1" aria-label="One more">+1</button>
  <div class="st">${countSt(code)}</div></div>`; };
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
/* ---------- Clicks ---------- */
document.addEventListener("click",async e=>{
  const t=e.target;
  const tab=t.closest("[data-tab]"); if(tab){ showTab(tab.dataset.tab); return; }
  const f=t.closest("[data-full]"); if(f){ openFull(f.dataset.full); return; }
  const c=t.closest("[data-copy]"); if(c){ const tx=c.textContent; try{ await navigator.clipboard.writeText(c.dataset.copy); c.textContent="Copied"; }catch{ c.textContent=c.dataset.copy; } setTimeout(()=>c.textContent=tx,1400); return; }
  const ss=t.closest("[data-stepstart]"); if(ss){ openStep(0); return; }
  const p=t.closest("[data-pick]"); if(p){ pick(p); return; }
  const w=t.closest("[data-wrongupc]"); if(w){ w.closest(".card").remove(); setStatus("Reading the label…",true);
    try{ lastText=await readLabel(lastFile); }catch{ lastText=""; } lastSig=await fileSig(lastFile).catch(()=>null); showCandidates(lastText,lastUPC,aiOn()?await askAI(lastFile):null); return; }
  const s=t.closest("[data-star]"); if(s){ toggleFav(s.dataset.star); return; }
  const st=t.closest("[data-step]"); if(st){ const box=st.closest("[data-cnt]"), inp=box.querySelector("input"); const v=Math.max(0,(parseFloat(inp.value)||0)+Number(st.dataset.step)); inp.value=fmtQty(v); saveCount(box.dataset.cnt,v,box); return; }
  const q=t.closest("[data-show]"); if(q){ showTab("find"); showItem(q.dataset.show); return; }
  const ns=t.closest("[data-addnosku]"); if(ns){ addNoSku(lastFile,lastText,lastUPC,ns); return; }
  const nd=t.closest("[data-nsdone]"); if(nd){ if(!DB) return; const n=NOSKU.find(x=>x.id===nd.dataset.nsdone), on=nd.dataset.v==="1";
    logged(`${on?"Marked SKU added":"Reopened"} on No SKU: ${n?.note||"bottle"}`,[["nosku/"+nd.dataset.nsdone,{done:on},"update"]]).catch(()=>toast("Couldn't update")); return; }
  const nx=t.closest("[data-nsdel]"); if(nx){ if(!confirm("Remove this bottle from the list?")) return;
    const n=NOSKU.find(x=>x.id===nx.dataset.nsdel);
    try{ await logged(`Removed from No SKU: ${n?.note||"bottle"}`,[["nosku/"+nx.dataset.nsdel,null]]); }catch{ toast("Couldn't remove"); } return; }
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
  ov.innerHTML=`${PHOTOS[code]?`<img class="shot" src="${esc(PHOTOS[code].thumb)}" data-img="${code}" alt="">`:""}${barcodeSVG(code)}<div class="big">${code}</div><div class="nm">${esc(r[2])} · ${esc(r[1])}</div><div class="tip">Turn screen brightness up. Tap anywhere to close.</div>`;
  ov.hidden=false; ov.tabIndex=-1; ov.focus(); hydrate(ov); }
function openShot(src){ lastFocus=document.activeElement; ov.innerHTML=`<img class="shot" style="max-height:80vh;max-width:92vw" src="${esc(safeImg(src)||"")}" alt=""><div class="tip">Tap anywhere to close.</div>`; ov.hidden=false; }
ov.onclick=e=>{ const sn=e.target.closest?.("[data-sn]");
  if(sn){ e.stopPropagation(); if(sn.dataset.sn!=="close"){ openStep(Number(sn.dataset.sn)); return; } }
  ov.hidden=true; STEP=-1; lastFocus?.focus?.(); lastFocus=null; };
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!ov.hidden){ ov.hidden=true; STEP=-1; } });
/* ---------- How to use ---------- */
function openHelp(){ $("help").hidden=false; $("help").scrollTop=0; $("helpClose").focus(); ls.set("bcf-help-seen",true); }
function closeHelp(){ $("help").hidden=true; $("helpBtn").focus(); }
$("helpBtn").onclick=openHelp; $("helpClose").onclick=closeHelp;
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!$("help").hidden) closeHelp(); });

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
    await logged(`${PHOTOS[code]?"Replaced":"Added"} photo: ${byCode[code]?.[1]||code}`,[["photoImg/"+code,{img,at:now()}],["photos/"+code,sig?{thumb,sig,at:now()}:{thumb,at:now()}]]);
    IMG_CACHE.set(code,Promise.resolve(img));
  }catch(e){ if(btn){ btn.disabled=false; btn.textContent="Didn't save, tap to retry"; } }
}
let photoFor=null;
$("itemPhoto").onchange=e=>{ const f=e.target.files?.[0], code=photoFor; e.target.value=""; if(!f||!code) return;
  savePhoto(code,f,document.querySelector(`[data-addphoto="${code}"]`)); };
/* ---------- Search ---------- */
const listEl=$("list"), qEl=$("q"), countEl=$("count");
let openCode=null;
function renderList(){
  const terms=norm(qEl.value).split(/\s+/).filter(Boolean);
  const miss=$("missOnly").checked;
  const hits=ITEMS.filter((r,i)=>(terms.every(t=>HAY[i].includes(t))||terms.length===1&&upcsFor(r[0]).some(u=>u.includes(terms[0])))&&(!miss||!PHOTOS[r[0]]));
  countEl.textContent=(terms.length||miss)?`${hits.length} match${hits.length===1?"":"es"}`:"Tap an item to show its barcode.";
  listEl.innerHTML=hits.slice(0,80).map(r=>`<button class="row" type="button" data-row="${r[0]}" aria-expanded="${openCode===r[0]}">
      ${PHOTOS[r[0]]?`<img class="th" src="${esc(PHOTOS[r[0]].thumb)}" alt="">`:`<span class="th">${BOTTLE}</span>`}<span class="n">${esc(r[1])}</span><span class="c"><span class="code">${r[0]}</span><span class="pg">${totalQ(r[0])!=null?`Count ${fmtQty(totalQ(r[0]))}`:pagesTxt(r[4])}</span></span>
      <span class="p">${esc(r[2])}${r[5]?" · <em>"+esc(r[5])+"</em>":""}</span></button>${openCode===r[0]?`<div class="expand"><div class="card" style="border:0;padding:0">${itemBlock(r)}</div></div>`:""}`).join("")
    +(hits.length>80?`<div class="row note" style="cursor:default"><span class="p">Showing 80 of ${hits.length}. Type more to narrow it down.</span></div>`:"")
    +(!hits.length?`<div class="row note" style="cursor:default"><span class="p">Nothing on the sheets matches that. Add it on the No SKU tab.</span></div>`:"");
  hydrate(listEl);
}
listEl.addEventListener("click",e=>{ if(e.target.closest(".expand")) return; const r=e.target.closest("[data-row]"); if(!r) return; openCode=openCode===r.dataset.row?null:r.dataset.row; if(openCode) addRecent(openCode); renderList(); });
qEl.addEventListener("input",()=>{openCode=null;renderList();});
$("missOnly").addEventListener("change",()=>{openCode=null;renderList();});
