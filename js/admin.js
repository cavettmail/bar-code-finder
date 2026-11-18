"use strict";
// Manager mode and the manager page.
/* ---------- Manager mode: hold the word "Code" for 5 seconds ---------- */
(()=>{ const k=$("adminKey"); let t=null,x0=0,y0=0;
  const stop=()=>{ clearTimeout(t); t=null; };
  k.addEventListener("pointerdown",e=>{ x0=e.clientX; y0=e.clientY; stop(); t=setTimeout(()=>{ t=null; try{navigator.vibrate?.(40);}catch{} openPin(); },5000); });
  k.addEventListener("pointermove",e=>{ if(t&&Math.hypot(e.clientX-x0,e.clientY-y0)>14) stop(); });
  ["pointerup","pointerleave","pointercancel"].forEach(ev=>k.addEventListener(ev,stop));
  k.addEventListener("contextmenu",e=>e.preventDefault());
})();
let pinFails=0, pinWait=0;
function openPin(){ $("pinMsg").textContent=""; $("pinIn").value=""; $("pinDlg").hidden=false; setTimeout(()=>$("pinIn").focus(),50); }
$("pinClose").onclick=()=>{ $("pinDlg").hidden=true; };
const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),ms))]);
$("pinForm").onsubmit=async e=>{
  e.preventDefault(); const msg=$("pinMsg"), go=$("pinGo"), pin=$("pinIn").value.trim();
  if(!pin) return;
  if(!DB){ msg.textContent="This needs the shared storage. Check your connection and reopen the app."; return; }
  if(Date.now()<pinWait){ msg.textContent=`Too many tries. Wait ${Math.ceil((pinWait-Date.now())/1000)} seconds.`; return; }
  go.disabled=true; msg.textContent="Checking…";
  try{
    // The password is checked by the database rules on Google's side; it isn't stored in this app.
    await withTimeout(DB.doc("admins/"+DB.uid).set({pin,name:ME.name||"",at:DB.serverTime()}),12000);
    pinFails=0; $("pinIn").value=""; $("pinDlg").hidden=true; openAdmin();
  }catch(err){
    if(err?.message==="timeout"){ msg.textContent="Couldn't reach the shared storage. Check your connection."; }
    else{ pinFails++; $("pinIn").value=""; if(pinFails>=5){ pinFails=0; pinWait=Date.now()+60000; msg.textContent="Wrong password. Wait a minute before trying again."; } else msg.textContent="Wrong password."; }
  }finally{ go.disabled=false; }
};

/* ---------- Manager page ---------- */
const DAY=864e5;
let ADM={members:{},revoked:new Set(),approved:new Set(),approvalOn:false,hist:[],unsub:[]};
const tsDate=v=>v?.toDate?v.toDate():v?new Date(v):new Date();
function ago(d){ const m=Math.round((Date.now()-d)/6e4); if(m<1) return "just now"; if(m<60) return `${m} min ago`; const h=Math.round(m/60); if(h<24) return `${h} hr ago`; const dd=Math.round(h/24); return dd===1?"yesterday":`${dd} days ago`; }
const whoName=(uid,fallback)=>uid===DB?.uid?`${ADM.members[uid]?.name||fallback||ME.name||"You"} (this phone)`:(ADM.members[uid]?.name||fallback||"Unknown phone");
function openAdmin(){
  $("admin").hidden=false; $("admin").scrollTop=0; $("adminClose").focus();
  ADM.unsub.forEach(f=>{ try{f();}catch{} }); ADM.unsub=[];
  const L=(q,fn)=>ADM.unsub.push(q.onSnapshot(fn,()=>{}));
  L(DB.collection("members"),s=>{ ADM.members=Object.fromEntries(s.docs.map(d=>[d.id,d.data()])); renderPeople(); renderUndo(); renderActivity(); });
  L(DB.collection("revoked"),s=>{ ADM.revoked=new Set(s.docs.map(d=>d.id)); renderPeople(); });
  L(DB.collection("approved"),s=>{ ADM.approved=new Set(s.docs.map(d=>d.id)); renderPeople(); });
  L(DB.doc("config/approvalOn"),s=>{ ADM.approvalOn=s.exists; $("apOn").checked=s.exists; renderPeople(); });
  loadHistory(); cleanHistory(); renderAI(); dropOldKey();
}
// Older versions kept the Gemini key in the shared database, where every phone could read it. Remove it.
async function dropOldKey(){
  try{ const s=await DB.doc("config/ai").get(), v=s.exists?s.data():null;
    if(v&&"key" in v){ await DB.doc("config/ai").set({on:true,model:String(v.model||""),at:now(),by:ME.name||""});
      $("aiMsg").textContent="Removed the old Gemini key from the shared storage. Delete that key in Google AI Studio too, since phones could read it."; } }catch{}
}
function closeAdmin(){ $("admin").hidden=true; ADM.unsub.forEach(f=>{ try{f();}catch{} }); ADM.unsub=[]; }
$("adminClose").onclick=closeAdmin;
/* ---------- Manager: AI (runs through Firebase AI Logic; the key stays in the Firebase project) ---------- */
function renderAI(){ $("shelfBtn").hidden=!AI?.on; const st=$("aiState"); if(!st) return;
  st.textContent=AI?.on?`On. Using ${AI.model||"the default model"} when phones are online.`:"Off. Snaps use the on-phone barcode and label readers only.";
  $("aiOff").hidden=!AI?.on; $("aiSave").textContent=AI?.on?"Test and save":"Test and turn on";
  if(!$("aiModel").value) $("aiModel").value=AI?.model||"gemini-3.5-flash-lite"; }
$("aiSave").onclick=async()=>{ const model=$("aiModel").value.trim(), msg=$("aiMsg"), b=$("aiSave");
  if(!DB){ msg.textContent="This needs the shared storage. Check your connection."; return; }
  b.disabled=true; msg.textContent="Testing…";
  try{ aiMod=aiMod||await mod("ai.js"); await aiMod.aiTest(DB.app,model);
    await DB.doc("config/ai").set({on:true,model,at:now(),by:ME.name||""}); msg.textContent="Working. AI photo search is on for everyone."; }
  catch(e){ console.warn(e); msg.textContent=`That didn't work: ${e?.message||"couldn't reach Google"}. Check that AI Logic is turned on in the Firebase console (with the Gemini Developer API), and the model name.`; }
  finally{ b.disabled=false; } };
$("aiOff").onclick=async()=>{ if(!confirm("Turn off AI photo search for everyone?")) return;
  try{ await DB.doc("config/ai").delete(); $("aiMsg").textContent="AI photo search is off."; }catch{ $("aiMsg").textContent="Couldn't change it. Check your connection."; } };

/* ---------- Manager: save the current list as the app's built-in (encrypted) file ---------- */
async function encryptItems(list,code){
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12)), iter=150000;
  const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(code),"PBKDF2",false,["deriveKey"]);
  const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:iter,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt"]);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(list))));
  const enc=u=>btoa(String.fromCharCode(...u));
  return {v:1,iter,salt:enc(salt),iv:enc(iv),ct:btoa([...ct].map(c=>String.fromCharCode(c)).join(""))};
}
$("encSave").onclick=async()=>{ const b=$("encSave"), msg=$("encMsg"); b.disabled=true; msg.textContent="Making the file…";
  try{ const out=await encryptItems(ITEMS.map(r=>r.slice(0,6)),TEAM_CODE);
    const file=new File([JSON.stringify(out)],"items.enc.json",{type:"application/json"});
    const done=`Saved ${ITEMS.length} items as items.enc.json. Upload it to the data folder on GitHub, replacing the old one.`;
    // Phones (especially iPhone home-screen apps) often block downloads, so use the share sheet when there is one: "Save to Files" or Drive.
    if(navigator.canShare?.({files:[file]})){
      try{ await navigator.share({files:[file],title:"items.enc.json"}); msg.textContent=done; return; }
      catch(e){ if(e?.name==="AbortError"){ msg.textContent="Cancelled. Tap again and choose Save to Files (or Drive)."; return; } }
    }
    const url=URL.createObjectURL(file), a=document.createElement("a"); a.href=url; a.download="items.enc.json"; document.body.appendChild(a); a.click(); a.remove();
    msg.innerHTML=`${esc(done)} <a href="${url}" download="items.enc.json">Download didn't start? Tap here.</a>`; }
  catch(e){ console.error(e); msg.textContent="Couldn't make the file. Close the app fully, reopen it, and try again."; }
  finally{ b.disabled=false; } };

document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ if(!$("admin").hidden) closeAdmin(); else if(!$("pinDlg").hidden) $("pinDlg").hidden=true; } });
$("adminOut").onclick=async()=>{ try{ await DB.doc("admins/"+DB.uid).delete(); }catch{} closeAdmin(); toast("Signed out of manager mode"); };

function renderPeople(){
  const ids=Object.keys(ADM.members);
  const state=id=>ADM.revoked.has(id)?"off":(ADM.approvalOn&&!ADM.approved.has(id)&&id!==DB.uid)?"wait":"on";
  ids.sort((a,b)=>{ const o={wait:0,on:1,off:2}; return o[state(a)]-o[state(b)]||tsDate(ADM.members[b].seen)-tsDate(ADM.members[a].seen); });
  $("ppl").innerHTML=ids.length?ids.map(id=>{ const m=ADM.members[id], st=state(id), me=id===DB.uid;
    const chip=st==="off"?'<span class="chip st-off">Access off</span>':st==="wait"?'<span class="chip warn">Waiting for approval</span>':me?'<span class="chip">Manager</span>':"";
    const acts=me?"":st==="off"?`<button class="copy" type="button" data-arestore="${esc(id)}">Turn back on</button>`
      :`${st==="wait"?`<button class="copy" type="button" data-aapprove="${esc(id)}">Approve</button>`:""}<button class="copy" type="button" data-arevoke="${esc(id)}" style="color:var(--warn)">Turn off</button>`;
    return `<div class="prow"><span class="who">${esc(whoName(id,m.name))} ${chip}</span><span class="acts">${acts}</span><span class="sub">${esc(m.device||"")} · last opened ${ago(tsDate(m.seen))}</span></div>`; }).join("")
    :`<div class="empty">No one yet. People show up here after they open the app and add their name.</div>`;
}
$("ppl").addEventListener("click",async e=>{
  const t=e.target, r=t.closest("[data-arevoke]"), on=t.closest("[data-arestore]"), ap=t.closest("[data-aapprove]");
  try{
    if(r){ const id=r.dataset.arevoke; if(!confirm(`Turn off access for ${ADM.members[id]?.name||"this phone"}? They're blocked right away.`)) return;
      await DB.doc("revoked/"+id).set({at:DB.serverTime(),by:DB.uid,name:ADM.members[id]?.name||""}); await DB.doc("approved/"+id).delete().catch(()=>{}); toast("Access turned off"); }
    if(on){ const id=on.dataset.arestore; await DB.doc("revoked/"+id).delete(); if(ADM.approvalOn) await DB.doc("approved/"+id).set({at:DB.serverTime(),by:DB.uid}); toast("Access turned back on"); }
    if(ap){ await DB.doc("approved/"+ap.dataset.aapprove).set({at:DB.serverTime(),by:DB.uid}); toast("Approved"); }
  }catch{ toast("Didn't save. Check your connection, or sign in again."); }
});
$("apOn").onchange=async e=>{
  const want=e.target.checked;
  try{
    if(want){
      if(!confirm("From now on, new phones wait for you to approve them. Everyone already listed (and not turned off) stays approved.")){ e.target.checked=false; return; }
      const b=DB.batch(); let n=0;
      for(const id of Object.keys(ADM.members)) if(!ADM.revoked.has(id)&&!ADM.approved.has(id)&&n<450){ b.set("approved/"+id,{at:DB.serverTime(),by:DB.uid}); n++; }
      b.set("config/approvalOn",{at:DB.serverTime(),by:DB.uid}); await b.commit(); toast("New phones need your approval");
    } else { await DB.doc("config/approvalOn").delete(); toast("New phones get in with the link"); }
  }catch{ e.target.checked=!want; toast("Didn't save. Check your connection."); }
};

async function loadHistory(){
  try{
    const s=await DB.collection("history").where("at",">=",new Date(Date.now()-30*DAY)).orderBy("at","desc").get();
    ADM.hist=s.docs.map(d=>({id:d.id,...d.data(),when:tsDate(d.data().at)}));
  }catch{ ADM.hist=null; }
  renderUndo(); renderActivity();
}
// History older than 31 days is no longer needed.
async function cleanHistory(){
  try{ const s=await DB.collection("history").where("at","<",new Date(Date.now()-31*DAY)).limit(200).get(); if(s.empty) return;
    const b=DB.batch(); s.docs.forEach(d=>{ b.delete("history/"+d.id); if(d.data().saved) b.delete("histData/"+d.id); }); await b.commit(); }catch{}
  // Old counts (not the current one) are kept 90 days, then removed.
  try{ const s=await DB.collection("counts").where("at","<",new Date(Date.now()-90*DAY).toISOString()).limit(400).get();
    const old=s.docs.filter(d=>d.data().session!==SESSION); if(!old.length) return;
    const b=DB.batch(); old.forEach(d=>b.delete("counts/"+d.id)); await b.commit(); }catch{}
}
const groupsOf=list=>{ const g=new Map(); list.forEach(h=>{ const k=h.group||h.id; if(!g.has(k)) g.set(k,h); }); return [...g.values()]; };
function renderActivity(){
  const el=$("act");
  if(ADM.hist===null){ el.innerHTML='<div class="empty">Couldn\'t load the history. Check your connection.</div>'; return; }
  const g=groupsOf(ADM.hist).slice(0,40);
  el.innerHTML=g.length?g.map(h=>`<div class="arow"><span>${esc(h.what)}</span><span class="sub">${esc(whoName(h.by,h.name))} · ${ago(h.when)}</span></div>`).join("")
    :'<div class="empty">No changes in the last 30 days.</div>';
}
function undoSet(){ const days=Number($("undoDays").value)||1, who=$("undoWho").value, since=Date.now()-days*DAY;
  return (ADM.hist||[]).filter(h=>h.when>=since&&(!who||h.by===who)); }
function renderUndo(){
  const hist=ADM.hist||[], daysSel=$("undoDays"), whoSel=$("undoWho");
  const prevDays=daysSel.value||"1", prevWho=whoSel.value;
  daysSel.innerHTML=Array.from({length:30},(_,i)=>{ const d=i+1, n=groupsOf(hist.filter(h=>h.when>=Date.now()-d*DAY)).length;
    return `<option value="${d}">${d===1?"24 hours":`${d} days (${d*24} hours)`} · ${n} change${n===1?"":"s"}</option>`; }).join("");
  daysSel.value=prevDays;
  const people=new Map(); hist.forEach(h=>{ if(!people.has(h.by)) people.set(h.by,whoName(h.by,h.name)); });
  whoSel.innerHTML=`<option value="">Everyone</option>`+[...people].map(([id,n])=>`<option value="${esc(id)}">${esc(n)}</option>`).join("");
  whoSel.value=people.has(prevWho)?prevWho:"";
  const g=groupsOf(undoSet()), prev=$("undoPrev");
  if(ADM.hist===null){ prev.innerHTML='<p class="hint">Couldn\'t load the history.</p>'; $("undoGo").disabled=true; return; }
  prev.innerHTML=g.length?`<p class="hint"><b style="color:var(--ink)">${g.length} change${g.length===1?"":"s"}</b> will be undone, newest first:</p><ul class="undo-list">${g.map(h=>`<li>${esc(h.what)} <span style="opacity:.8">· ${esc(whoName(h.by,h.name))}, ${ago(h.when)}</span></li>`).join("")}</ul>${whoSel.value?'<p class="hint" style="margin-top:6px">If someone else changed the same thing afterward, their change is undone too.</p>':""}`
    :'<p class="hint">Nothing changed in that time.</p>';
  $("undoGo").disabled=!g.length;
}
$("undoDays").onchange=renderUndo; $("undoWho").onchange=renderUndo;
$("undoGo").onclick=async()=>{
  const days=Number($("undoDays").value)||1, who=$("undoWho").value, go=$("undoGo");
  const label=days===1?"the last 24 hours":`the last ${days} days`;
  if(!confirm(`Undo ${who?`${$("undoWho").selectedOptions[0].text}'s changes`:"all changes"} from ${label}? This changes it for everyone. You can undo the undo afterward.`)) return;
  go.disabled=true; go.textContent="Undoing…";
  try{
    // Fresh copy of the history, oldest first: the first entry for each thing holds how it looked before the window.
    const s=await DB.collection("history").where("at",">=",new Date(Date.now()-days*DAY)).orderBy("at","asc").get();
    const first=new Map(); let skipped=0;
    s.docs.map(d=>({id:d.id,...d.data()})).filter(h=>!who||h.by===who).forEach(h=>{ if(!first.has(h.path)) first.set(h.path,h); });
    let b=DB.batch(), ops=0; const done=new Set();
    for(const [path,h] of first){
      if(!UNDOABLE.test(path)||!h.saved){ skipped++; continue; }
      const bd=await DB.doc("histData/"+h.id).get(); if(!bd.exists){ skipped++; continue; }
      const before=bd.data().before??null;
      const cur=await DB.doc(path).get(), now0=cur.exists?cur.data():null;
      if(before===null) b.delete(path); else b.set(path,before);
      const id=DB.newId("history");
      b.set("history/"+id,{at:DB.serverTime(),by:DB.uid,name:ME.name||"",path,what:`Undid: ${h.what}`.slice(0,200),group:id,saved:true,undo:true});
      b.set("histData/"+id,{before:now0});
      ops+=3; done.add(h.group||h.id);
      if(ops>=360){ await b.commit(); b=DB.batch(); ops=0; }
    }
    if(ops) await b.commit();
    toast(done.size?`Undid ${done.size} change${done.size===1?"":"s"}${skipped?` (${skipped} couldn't be undone)`:""}`:"Nothing to undo");
  }catch(e){ console.error(e); toast("Undo didn't finish. Check your connection and try again."); }
  finally{ go.textContent="Undo these changes"; loadHistory(); }
};
