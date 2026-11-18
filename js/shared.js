"use strict";
// Shared storage, change history, and who has access.
/* ---------- Shared storage ---------- */
let DB=null;
async function startShared(teamId){
  const { FIREBASE, APP_CHECK_SITE_KEY } = await mod("config.js").catch(()=>({}));
  if(!FIREBASE) return;
  const note=$("syncNote");
  try{
    const { connect } = await mod("store.js");
    DB=await connect(FIREBASE,teamId,APP_CHECK_SITE_KEY);
  }catch(e){ console.error(e); note.hidden=false; note.textContent="Offline: shared photos and lists will appear when you're back online."; return; }
  $("missWrap").hidden=false; renderNoSku(); renderSheets(); refreshPhotos();
  watchAccess(); ensureName(); startCounts();
  const err=()=>{ note.hidden=false; note.textContent="Couldn't reach the shared lists. Check your connection."; };
  DB.collection("photos").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>{ const v=d.data(); if(safeImg(v?.thumb)) m[d.id]={thumb:v.thumb,sig:v.sig,at:v.at}; });
    for(const c in m) if(PHOTOS[c]?.at!==m[c].at) IMG_CACHE.delete(c);
    PHOTOS=m; refreshPhotos(); },err);
  DB.collection("upc").onSnapshot(snap=>{ const m={...UPC}; snap.docs.forEach(d=>{ const v=d.data(); if(typeof v?.code==="string") m[d.id]=v.code; }); UPC=m; ls.set("bcf-upc",UPC); },err);
  DB.collection("learn").onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>{ const v=d.data(); if(Array.isArray(v?.words)) m[d.id]=v.words.filter(w=>typeof w==="string").slice(0,60); }); SHARED_LEARN=m; buildIndex(); },err);
  DB.collection("nosku").orderBy("at","desc").onSnapshot(snap=>{ NOSKU=snap.docs.map(d=>({id:d.id,...d.data()})).map(n=>({...n,img:safeImg(n.img)})); renderNoSku(); },err);
  DB.doc("config/ai").onSnapshot(snap=>{ const v=snap.exists?snap.data():null; AI=v&&(v.on||v.key)?{on:true,model:String(v.model||"")}:null; ls.set("bcf-ai",AI); renderAI(); },()=>{});
  DB.doc("catalog/current").onSnapshot(snap=>{ const v=snap.exists?snap.data():null;
    if(v&&Array.isArray(v.items)&&v.items.length>=10){ CATALOG={at:v.at,source:v.source}; setItems(v.items.filter(r=>r&&r.c&&r.n&&safeCode(r.c)).map(r=>[String(r.c),String(r.n),String(r.p||""),String(r.k||"Liquor"),/^[\d, ?]{1,60}$/.test(String(r.g))?String(r.g):"?",String(r.a||"")])); }
    else if(CATALOG){ CATALOG=null; setItems(BASE_ITEMS); } },err);
}

/* ---------- Change history: every shared change keeps what was there before, for 30 days ---------- */
const UNDOABLE=/^(photos|photoImg|upc|nosku|catalog|countSession)\/[^/]+$/;
// ops: [[path, data or null to delete, "update" to change only some fields]]
async function logged(what,ops){
  const before=await Promise.all(ops.map(([p])=>DB.doc(p).get().then(s=>s.exists?s.data():null).catch(()=>undefined)));
  const b=DB.batch(), group=DB.newId("history");
  ops.forEach(([p,d,mode],i)=>{
    if(d===null) b.delete(p); else if(mode==="update") b.update(p,d); else b.set(p,d);
    const id=i?DB.newId("history"):group, saved=before[i]!==undefined;
    b.set("history/"+id,{at:DB.serverTime(),by:DB.uid,name:ME.name||"",path:p,what:String(what).slice(0,200),group,saved});
    if(saved) b.set("histData/"+id,{before:before[i]});
  });
  await b.commit();
}

/* ---------- Who's using the app, and whether their access is on ---------- */
let ME={name:ls.get("bcf-name","")};
const ACCESS={revoked:false,approved:false,approvalOn:false,admin:false};
let accessReady=false, wasBlocked=false;
const deviceName=()=>{ const u=navigator.userAgent; return /iPhone/.test(u)?"iPhone":/iPad/.test(u)?"iPad":/Android/.test(u)?"Android phone":/Mac/.test(u)?"Mac":/Windows/.test(u)?"Windows computer":"Device"; };
function saveMember(){ if(DB&&ME.name) DB.doc("members/"+DB.uid).set({name:ME.name,seen:DB.serverTime(),device:deviceName()}).catch(()=>{}); }
function ensureName(){
  if(ME.name){ saveMember(); return; }
  $("nameDlg").hidden=false; setTimeout(()=>$("nameIn").focus(),50);
}
$("nameForm").onsubmit=e=>{ e.preventDefault(); const v=$("nameIn").value.replace(/\s+/g," ").trim().slice(0,40);
  if(v.length<2){ $("nameMsg").textContent="Type your name."; return; }
  ME.name=v; ls.set("bcf-name",v); $("nameDlg").hidden=true; saveMember(); applyAccess(); };
function applyAccess(){
  if(!accessReady) return;
  const blocked=!ACCESS.admin&&(ACCESS.revoked||(ACCESS.approvalOn&&!ACCESS.approved));
  if(blocked){
    $("gateMsg").textContent=ACCESS.revoked?"Your access to this app has been turned off. Talk to your manager if you think that's a mistake."
      :`Waiting for a manager to approve this phone${ME.name?` (${ME.name})`:""}. This opens on its own as soon as they do.`;
    $("gate").hidden=false; $("app").hidden=true; wasBlocked=true;
  } else if(wasBlocked){ location.reload(); }
}
function watchAccess(){
  const keys={revoked:"revoked/"+DB.uid,approved:"approved/"+DB.uid,approvalOn:"config/approvalOn",admin:"admins/"+DB.uid};
  const seen=new Set();
  for(const [k,path] of Object.entries(keys)){
    const done=v=>{ ACCESS[k]=v; seen.add(k); if(seen.size===4) accessReady=true; applyAccess(); if(k==="admin") renderSheets(); };
    DB.doc(path).onSnapshot(s=>done(s.exists),()=>done(false));
  }
}
