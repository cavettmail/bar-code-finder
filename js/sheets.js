"use strict";
// Sheets tab: update the item list from new inventory sheets (read on the phone, no AI).
/* ---------- Update the item list from new sheets (read on the phone, no AI) ---------- */
const CATS=["Wine","Liquor","Beer/Cider","N/A / Mixers / Juice","Pantry / Produce / Misc"];
function renderSheets(){
  const src=CATALOG?`Uploaded ${new Date(CATALOG.at).toLocaleDateString()} from ${esc(CATALOG.source||"new sheets")}`:"The original inventory sheets";
  $("shInfo").innerHTML=`<b>${ITEMS.length} items</b> · ${src}`;
  // Changing the list changes it for everyone, so only managers can (the database rules check this too).
  const mgr=!!(DB&&ACCESS.admin);
  $("shRevert").hidden=!CATALOG||!mgr; $("shPick").hidden=!mgr; if(!mgr) $("shPreview").hidden=true;
  const NOTE=/^(Updating the list turns on|Only a manager)/;
  if(!DB) shStatus("Updating the list turns on once the app's shared storage is set up.");
  else if(!mgr) shStatus("Only a manager can upload new sheets. Ask a manager to sign in on this phone.");
  else if(NOTE.test($("shStatus").textContent)) shStatus("");
}
function shStatus(h,spin){ const el=$("shStatus"); el.hidden=!h; el.innerHTML=(spin?'<span class="spin"></span>':"")+(h||""); }
const guessCat=t=>{ t=norm(t); if(/\b(beer|ipa|lager|pils|cider|birra|kolsch|ale)\b/.test(t)) return "Beer/Cider";
  if(/\b(juice|lemonade|soda|tonic|water|bitters|syrup|grenadine|cola|limonata|n a|zero|espresso|capsules|nectar|ice)\b/.test(t)) return "N/A / Mixers / Juice";
  if(/\b(vodka|gin|rum|tequila|mezcal|whisk(e)?y|bourbon|scotch|rye|amaro|liqueur|vermouth|aperitivo|bitter|grappa|limoncello|brandy|sambuca|fernet|campari|aperol|chartreuse|maraschino|nog)\b/.test(t)) return "Liquor";
  if(/\b(lemons?|limes?|oranges?|mint|basil|sugar|milk|evoo|olio|vinegar|cherries|pepper|glass)\b/.test(t)) return "Pantry / Produce / Misc";
  return "Wine"; };
// Header names that probably mean each field.
const FIELD_GUESS={code:/^(sku|code|item ?(no|num|number|#|code)|item|article|plu|id)$/i,name:/^(name|description|desc|item ?name|product|item description)$/i,producer:/^(producer|brand|vendor|winery|distiller|maker|supplier)$/i,category:/^(category|cat|type|class|department|dept)$/i,page:/^(page|sheet|pg|location|section)$/i};
// Inventory report laid out as item cards in columns: code (+unit) / name (1-2 lines) / producer, under category headers.
const SECT=[[/BEER|CIDER|BIRRA/,"Beer/Cider"],[/WINE|VINO/,"Wine"],[/LIQUOR|SPIRIT|LIQUEUR/,"Liquor"],[/BEVERAGE|JUICE|SODA|MIXER|N\/A/,"N/A / Mixers / Juice"],[/.*/,"Pantry / Produce / Misc"]];
// Category tags printed on the Eataly inventory report.
const SHEET_CAT={VI:"Wine",RS:"",U2:"Liquor",U1:"Beer/Cider",QB:"N/A / Mixers / Juice",GH:"N/A / Mixers / Juice",GF:"Pantry / Produce / Misc",GD:"Pantry / Produce / Misc",OF:"",RB:""};
function catFromSheet(tag,name){ const c=SHEET_CAT[tag];
  if(c) return c;
  const g=guessCat(name);
  if(tag==="OF") return g==="Wine"?"Pantry / Produce / Misc":g; // fresh produce, juices, olives
  return g; }
function pdfCards(pages){
  const items=[], WORDS=new Set();
  pages.forEach(its=>its.forEach(t=>t.s.split(/\s+/).forEach(w=>{ w=w.replace(/[^A-Z0-9']/gi,"").toUpperCase(); if(w.length>=3) WORDS.add(w); })));
  pages.forEach((its,pi)=>{
    const codeXs=[]; its.forEach(t=>{ if(/^\d{5,9}$/.test(t.s)) codeXs.push(t.x); });
    const cols=[...new Set(codeXs.map(x=>Math.round(x/20)))].map(k=>Math.min(...codeXs.filter(x=>Math.round(x/20)===k))).sort((a,b)=>a-b);
    if(!cols.length) return;
    const colOf=x=>{ let c=0; cols.forEach((cx,i)=>{ if(x+12>=cx) c=i; }); return c; };
    const byCol=cols.map(()=>[]);
    its.forEach(t=>{ if(/^\d{1,2}\/\d{1,2}\/\d{4}/.test(t.s)||/^pagina\b|^page\b/i.test(t.s)||t.h>=14) return; byCol[colOf(t.x)].push(t); });
    for(const col of byCol){
      col.sort((a,b)=>b.y-a.y||a.x-b.x);
      let cat="", card=null; const codeYs=col.filter(t=>/^\d{5,9}$/.test(t.s)).map(t=>t.y);
      const finish=()=>{ if(!card) return; const L=card.lines;
        let prod="", name=L.map(l=>l.s);
        if(L.length>=2){ const gap=L[L.length-2].y-L[L.length-1].y, lineGap=L.length>=3?L[0].y-L[1].y:0;
          if(gap>11||L.length>=2&&gap>lineGap+3){ prod=L[L.length-1].s; name=name.slice(0,-1); } }
        const P=" "+prod.toUpperCase()+" ";
        let nm=""; name.forEach(s=>{ const a=nm.match(/(\S+)$/), b=s.match(/^(\S+)/);
          // Lines are cut at a fixed width, sometimes mid-word ("SAN P" + "ELLEGRINO", "FONTANAFREDDA 1" + "982"): rejoin them.
          let glue=false;
          if(nm.length>=34&&a&&b&&!/[,)]$/.test(a[1])){ const A=a[1].toUpperCase(), B=b[1].toUpperCase();
            glue=WORDS.has((A+B).replace(/[^A-Z0-9']/gi,""))            // makes a word seen elsewhere in the report
              ||(/^\d+$/.test(A)&&/^\d+$/.test(B))                      // a number split in two
              ||A.length===1||(B.length===1&&B!=="&")                   // a stray letter on either side
              ||P.includes((A+B).slice(0,A.length+Math.min(B.length,3))); } // matches the producer ("PASS"+"ALACQUA")
          nm+=!nm?s:glue?s:" "+s; });
        nm=nm.replace(/\s+/g," ").replace(/\s+,/g,",").trim();
        items.push({code:card.code,name:nm,producer:prod.trim(),category:card.cat,sheetCat:card.sheetCat||"",page:String(pi+1)}); card=null; };
      // The report's own category tag (VI, U2, GH…) prints on the same line as the item code.
      const tags=col.filter(t=>(t.s in SHEET_CAT)&&codeYs.some(y=>Math.abs(y-t.y)<4));
      const tagFor=y=>(tags.find(t=>Math.abs(t.y-y)<4)||{}).s||"";
      for(let i=0;i<col.length;i++){ const t=col[i];
        if(/\(([A-Z0-9]{1,4})\)$/.test(t.s)&&!/^\d/.test(t.s)&&(!card||card.lines.length)){ finish(); const lab=t.s.toUpperCase(); cat=(SECT.find(([r])=>r.test(lab))||[])[1]||""; continue; }
        // unit next to a code (EA, BT, CS…) or the short tag beside a section name
        if(/^[A-Z0-9]{1,4}$/.test(t.s)&&!/^\d{5,9}$/.test(t.s)&&(codeYs.some(y=>Math.abs(y-t.y)<3)||col.some(o=>o!==t&&Math.abs(o.y-t.y)<1.5&&/\([A-Z0-9]{1,4}\)$/.test(o.s)))) continue;
        if(/^\d{5,9}$/.test(t.s)){ finish(); card={code:t.s,y:t.y,cat,sheetCat:tagFor(t.y),lines:[]}; continue; }
        if(card) card.lines.push({s:t.s.trim(),y:t.y});
      }
      finish();
    }
  });
  return items;
}
async function readSheetRows(file){
  const name=file.name.toLowerCase();
  if(name.endsWith(".pdf")||file.type==="application/pdf"){
    if(!window.pdfjsLib){ await loadScript("vendor/pdf.min.js"); pdfjsLib.GlobalWorkerOptions.workerSrc="vendor/pdf.worker.min.js"; }
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise; const items=[], pages=[];
    for(let i=1;i<=pdf.numPages;i++){ const tc=await (await pdf.getPage(i)).getTextContent();
      pages.push(tc.items.filter(it=>it.str.trim()).map(it=>({x:it.transform[4],y:it.transform[5],s:it.str.trim(),h:it.height||Math.abs(it.transform[3])})));
      const rows={}; tc.items.forEach(it=>{ const y=Math.round(it.transform[5]/3); (rows[y]=rows[y]||[]).push([it.transform[4],it.str]); });
      for(const y of Object.keys(rows).sort((a,b)=>b-a)){ const line=rows[y].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(" ").replace(/\s+/g," ").trim();
        const mm=line.match(/^(\d{5,9})\s+(.{3,})$/); const m2=!mm&&line.match(/^(.{3,}?)\s+(\d{5,9})(\s|$)/);
        const code=mm?mm[1]:m2?m2[2]:null, rest=(mm?mm[2]:m2?m2[1]:"").replace(/(\s+[\d.,_]+)+$/,"").trim();
        if(code&&rest) items.push({code,name:rest,producer:"",category:"",page:String(i)}); } }
    // Reports that print each item as a card (code, then name, then producer) rather than one row per item.
    const lone=pages.flat().filter(t=>/^\d{5,9}$/.test(t.s)).length;
    if(lone>=10&&lone>=items.length/2){ const cardItems=pdfCards(pages); if(cardItems.length>=10) return {mode:"pdf",items:cardItems,note:"Read from the PDF's item cards: code, name, producer, category and page for each item."}; }
    return {mode:"pdf",items,note:"Read from the PDF: each row that starts or ends with an item code."};
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
    // The sheet is the source of truth: take its name and producer, and only fall back to what's on file when the sheet leaves them blank.
    const name=it.name||old?.[1], producer=it.producer||old?.[2];
    const cat=(it.sheetCat?catFromSheet(it.sheetCat,it.name):"")||CATS.find(c=>norm(c)===norm(it.category))||(old?old[3]:guessCat(it.name+" "+it.category));
    found.set(it.code,[it.code,name||it.code,producer||"",cat,pg||(old?old[4]:"?"),old?.[5]||""]); }
  return [...found.values()].sort((a,b)=>a[2].localeCompare(b[2])||a[1].localeCompare(b[1]));
}
let SHEET=null;
$("shFile").onchange=async e=>{
  const file=e.target.files?.[0]; e.target.value=""; if(!file||!DB||!ACCESS.admin) return;
  $("shPreview").hidden=true;
  try{
    shStatus("Reading the file…",true);
    SHEET={file:file.name,...await readSheetRows(file)};
    shStatus("");
    if(SHEET.mode==="pdf") return previewList(mergeItems(SHEET.items),SHEET.note);
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
    <p class="hint">Check a few codes against the sheets before saving. Photos, linked barcodes, and counts stay attached to their codes.</p>
    ${added.length?`<button class="btn btn-primary" id="shAdd" type="button">Add the ${added.length} new item${added.length===1?"":"s"}, keep everything else</button>`:""}
    <div class="btn-row"><button class="btn btn-quiet" id="shApply" type="button">Replace with this list${removed.length?` (removes ${removed.length})`:""}</button><button class="btn btn-quiet" id="shCancel" type="button">Cancel</button></div></div>`;
  $("shPreview").hidden=false;
  const save=async(btn,items,what)=>{ btn.disabled=true; const tx=btn.textContent; btn.textContent="Saving…";
    try{ await logged(what,[["catalog/current",{items:items.map(r=>({c:r[0],n:r[1],p:r[2],k:r[3],g:r[4],a:r[5]||""})),source:SHEET.file,at:now()}]]); $("shPreview").hidden=true; toast("Item list updated"); }
    catch{ btn.disabled=false; btn.textContent="Didn't save, tap to retry"; } };
  $("shApply").onclick=()=>save($("shApply"),list,`Replaced the item list (${list.length} items, ${SHEET.file})`);
  if($("shAdd")) $("shAdd").onclick=()=>{ const merged=[...ITEMS,...added].sort((a,b)=>a[2].localeCompare(b[2])||a[1].localeCompare(b[1]));
    save($("shAdd"),merged,`Added ${added.length} new item${added.length===1?"":"s"} from ${SHEET.file}`); };
  $("shCancel").onclick=()=>{ $("shPreview").hidden=true; };
}
$("shRevert").onclick=async()=>{ if(!confirm("Go back to the original item list for everyone?")) return;
  try{ await logged("Went back to the original item list",[["catalog/current",null]]); toast("Back to the original list"); }catch{ toast("Couldn't change the list"); } };
