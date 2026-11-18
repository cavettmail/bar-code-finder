"use strict";
// Count tab. With the shared storage on, everyone on the team counts into the same count: each phone keeps its own
// number for an item (so two people counting different spots just add up), and the Count tab shows the team total.
// Without shared storage, the count stays on this phone.
let COUNTS=ls.get("bcf-counts",{});      // this phone only: code -> {q, at}
let SESSION=null;                         // id of the team's current count
let SHARED_COUNTS={};                     // code -> {uid: {q, name}}
let countUnsub=null;
const shared=()=>!!(DB&&SESSION);
function partsOf(code){ return Object.entries(SHARED_COUNTS[code]||{}).filter(([,v])=>typeof v?.q==="number"&&isFinite(v.q)); }
function myQ(code){ return shared()?SHARED_COUNTS[code]?.[DB.uid]?.q??null:COUNTS[code]?.q??null; }
function totalQ(code){ if(!shared()) return COUNTS[code]?.q??null; const p=partsOf(code); return p.length?p.reduce((s,[,v])=>s+v.q,0):null; }
function othersTxt(code){ if(!shared()) return ""; const o=partsOf(code).filter(([u])=>u!==DB.uid); return o.map(([,v])=>`${v.name||"someone"} ${fmtQty(v.q)}`).join(", "); }
function countSt(code){ const mine=myQ(code), o=othersTxt(code), t=totalQ(code);
  return o?`Team total ${fmtQty(t)} (${mine!=null?`you ${fmtQty(mine)}, `:""}${esc(o)})`:mine!=null?"Counted":""; }

function saveCount(code,q){
  if(q!=null&&isNaN(q)) q=null;
  if(shared()){
    if(!SHARED_COUNTS[code]) SHARED_COUNTS[code]={};
    SHARED_COUNTS[code][DB.uid]={q,name:ME.name||""};
    DB.doc(`counts/${SESSION}_${code}`).set({session:SESSION,code,at:now(),by:{[DB.uid]:{q,name:ME.name||"",at:now()}}},{merge:true})
      .catch(()=>toast("Count didn't save. Check your connection."));
  } else {
    if(q==null) delete COUNTS[code]; else COUNTS[code]={q,at:now()};
    ls.set("bcf-counts",COUNTS);
  }
  paintCount(code); renderCount();
}
function paintCount(code){
  document.querySelectorAll(`[data-cnt="${code}"]`).forEach(b=>{ b.querySelector(".st").innerHTML=countSt(code); const i=b.querySelector("input"), q=myQ(code); if(i!==document.activeElement) i.value=q==null?"":fmtQty(q); });
}
// Follow the team's current count. A new count is just a new id, so the old one is still there to undo back to.
function startCounts(){
  DB.doc("countSession/current").onSnapshot(s=>{
    const id=(s.exists&&typeof s.data()?.id==="string"&&/^[A-Za-z0-9]{1,40}$/.test(s.data().id))?s.data().id:"first";
    if(id===SESSION) return;
    SESSION=id; SHARED_COUNTS={}; countUnsub?.();
    // Counts made on this phone in the last 12 hours, before sharing was on, join the team's count once. Older ones are dropped.
    const local=Object.entries(COUNTS), fresh=Date.now()-12*36e5;
    if(local.length){ COUNTS={}; ls.set("bcf-counts",COUNTS);
      local.forEach(([c,v])=>{ if(byCode[c]&&typeof v?.q==="number"&&Date.parse(v.at)>fresh) saveCount(c,v.q); }); }
    const sid=SESSION;
    countUnsub=DB.collection("counts").where("session","==",sid).onSnapshot(snap=>{
      if(sid!==SESSION) return; // a late update from the count before "Start a new count"
      const m={}; snap.docs.forEach(d=>{ const v=d.data(); if(v?.code&&v.by&&typeof v.by==="object") m[v.code]=Object.fromEntries(Object.entries(v.by).map(([u,x])=>[u,{q:typeof x?.q==="number"?x.q:null,name:String(x?.name||"").slice(0,40)}])); });
      SHARED_COUNTS=m; renderCount(); document.querySelectorAll("[data-cnt]").forEach(b=>paintCount(b.dataset.cnt)); renderList();
    },()=>{});
    renderCount(); document.querySelectorAll("[data-cnt]").forEach(b=>paintCount(b.dataset.cnt));
  },()=>{});
}
function countedCodes(){ return shared()?Object.keys(SHARED_COUNTS).filter(c=>totalQ(c)!=null):Object.keys(COUNTS); }
function countRows(){ return countedCodes().filter(c=>byCode[c]).map(c=>[byCode[c],totalQ(c)]).sort((a,b)=>firstPage(a[0][4])-firstPage(b[0][4])||a[0][2].localeCompare(b[0][2])||a[0][1].localeCompare(b[0][1])); }
function renderCount(){
  const rows=countRows(); $("tabCount").textContent=rows.length; $("cItems").textContent=rows.length;
  $("cBottles").textContent=fmtQty(rows.reduce((s,[,q])=>s+q,0));
  $("cMode").textContent=shared()?"Shared with the team: everyone's counts add up here.":"Kept on this phone.";
  if(!rows.length){ $("cList").innerHTML=`<div class="empty">Nothing counted yet.</div>`; return; }
  let html="", pg=null;
  for(const [r,q] of rows){ const p=firstPage(r[4]); if(p!==pg){ pg=p; html+=`<div class="pghead">Page ${p===999?"?":p}</div>`; }
    const who=shared()&&partsOf(r[0]).length>1?` · ${esc(partsOf(r[0]).map(([u,v])=>`${u===DB.uid?"you":v.name||"someone"} ${fmtQty(v.q)}`).join(", "))}`:"";
    html+=`<div class="crow"><button class="nm" type="button" data-show="${r[0]}">${esc(r[1])}</button><span class="q">${fmtQty(q)}</span><span class="s">${esc(r[2])} · <span class="code" style="font-size:.84rem">${r[0]}</span>${who}</span></div>`; }
  $("cList").innerHTML=html;
}
function countText(){ const rows=countRows(); let out=`Bar count, ${new Date().toLocaleDateString()}\n`, pg=null;
  for(const [r,q] of rows){ const p=firstPage(r[4]); if(p!==pg){ pg=p; out+=`\nPage ${p===999?"?":p}\n`; } out+=`${r[0]}  ${r[2]} – ${r[1]}: ${fmtQty(q)}\n`; } return out; }
$("cCopy").onclick=async()=>{ if(!countRows().length) return toast("Nothing counted yet"); try{ await navigator.clipboard.writeText(countText()); toast("Count copied"); }catch{ toast("Couldn't copy on this phone"); } };
$("cCsv").onclick=async()=>{
  const rows=countRows(); if(!rows.length) return toast("Nothing counted yet");
  // Quote every cell, and keep a spreadsheet from treating a name that starts with = + - @ as a formula.
  const q=s=>{ s=String(s); if(/^[=+\-@]/.test(s)&&!/^-?\d/.test(s)) s="'"+s; return `"${s.replace(/"/g,'""')}"`; };
  const who=r=>shared()?partsOf(r[0]).map(([u,v])=>`${u===DB.uid?(ME.name||"me"):v.name||"someone"} ${fmtQty(v.q)}`).join("; "):"";
  const csv="Page,Code,Producer,Item,Category,Count"+(shared()?",Counted by":"")+"\n"+rows.map(([r,n])=>[firstPage(r[4])===999?"":firstPage(r[4]),r[0],r[2],r[1],r[3],fmtQty(n),...(shared()?[who(r)]:[])].map(q).join(",")).join("\n");
  const name=`bar-count-${new Date().toISOString().slice(0,10)}.csv`, file=new File([csv],name,{type:"text/csv"});
  try{ if(navigator.canShare?.({files:[file]})){ await navigator.share({files:[file],title:"Bar count"}); return; } }catch(e){ if(e?.name==="AbortError") return; }
  const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=name; document.body.appendChild(a); a.click(); a.remove();
};
$("cClear").onclick=async()=>{
  if(!countRows().length) return;
  if(shared()){
    if(!confirm("Start a new count for the whole team? Everyone's numbers go back to zero. Copy or download this count first if you need it. A manager can undo this.")) return;
    try{ const id=DB.newId("counts").replace(/[^A-Za-z0-9]/g,"");
      await logged("Started a new count",[["countSession/current",{id,at:now(),by:DB.uid,name:ME.name||""}]]); toast("New count started"); }
    catch{ toast("Couldn't start a new count. Check your connection."); }
    return;
  }
  if(!confirm("Clear this count and start a new one? Copy or download it first if you need it.")) return;
  COUNTS={}; ls.set("bcf-counts",COUNTS); renderCount();
  document.querySelectorAll("[data-cnt] input").forEach(i=>i.value=""); document.querySelectorAll("[data-cnt] .st").forEach(s=>s.textContent="");
  toast("New count started");
};
