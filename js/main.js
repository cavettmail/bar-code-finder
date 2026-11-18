"use strict";
// Start-up.
/* ---------- Start ---------- */
async function start(code,fromLink){
  let items;
  try{ items=await unlockItems(code); }catch{ return false; }
  TEAM_CODE=code; ls.set("bcf-team",code);
  if(fromLink) history.replaceState(null,"",location.pathname);
  BASE_ITEMS=items; $("lock").hidden=true; $("app").hidden=false;
  setItems(BASE_ITEMS); renderNoSku(); renderAI(); showTab(ls.get("bcf-tab","find")); if(!ls.get("bcf-help-seen",false)) openHelp();
  startShared(await teamIdFor(code));
  return true;
}
(async()=>{
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
    // The app opens from the phone's copy; when a newer version has finished downloading, offer to switch to it.
    navigator.serviceWorker.addEventListener("message",e=>{ if(e.data?.type==="updated") $("updBar").hidden=false; });
  }
  $("updBtn").onclick=()=>location.reload();
  const fromHash=new URLSearchParams(location.hash.slice(1)).get("t");
  const code=fromHash||ls.get("bcf-team",null);
  if(code&&await start(code.trim(),!!fromHash)) return;
  $("lock").hidden=false;
  if(code) $("lockMsg").textContent="That link's team code didn't work. Ask for a fresh link, or type the code below.";
  $("lockForm").onsubmit=async e=>{ e.preventDefault(); const v=$("lockCode").value.trim().toLowerCase(); if(!v) return;
    if(!await start(v,false)) $("lockMsg").textContent="That code didn't work. Check it and try again."; };
})();
