"use strict";
// No SKU list (shared).
/* ---------- No SKU list (shared) ---------- */
let NOSKU=[];
async function addNoSku(file,text,upc,btn){
  if(!DB){ toast("The shared list isn't set up yet"); return; }
  const note=prompt("What is it? (name, size, anything useful)", (text||"").split("\n").map(s=>s.trim()).filter(Boolean).slice(0,2).join(" ").slice(0,80));
  if(note===null) return;
  if(btn){ btn.disabled=true; btn.textContent="Adding…"; }
  try{
    const img=file?await jpeg(file,700,.72):null;
    await logged(`Added to No SKU: ${note.trim()||"bottle"}`,[["nosku/"+DB.newId("nosku"),{note:note.trim(),words:(text||"").slice(0,300),upc:upc||"",img,at:now(),done:false}]]);
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
