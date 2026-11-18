"use strict";
// Core: barcode drawing, small helpers, team code, item list and text matching.
const P = ["11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100", "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100", "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110", "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110", "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010", "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110", "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010", "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110", "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110", "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010", "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000", "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000", "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010", "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100", "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110", "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000", "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110", "11110101110", "11010000100", "11010010000", "11010011100"];
const STOP = "1100011101011";
// Same Code 128 style as the inventory report: digits packed in pairs (code set C), an odd last digit in code set A.
// Anything that isn't all digits falls back to code set B. Every style scans as the same number.
function bits(s){ s=String(s); let v;
  if(/^\d{2,}$/.test(s)){ v=[105]; for(let i=0;i+1<s.length;i+=2) v.push(+s.slice(i,i+2)); if(s.length%2) v.push(101,s.charCodeAt(s.length-1)-32); }
  else v=[104,...[...s].map(ch=>ch.charCodeAt(0)-32)];
  let chk=v[0]; v.slice(1).forEach((x,i)=>chk+=(i+1)*x); chk%=103;
  return v.map(x=>P[x]).join("")+P[chk]+STOP; }
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
// Load one of the app's ES modules (ai.js, store.js, config.js) from the app's own folder.
const mod=p=>import(new URL(p,document.baseURI).href);
// Shared data comes from every phone on the team, so check it before it goes into the page:
// photos must be plain base64 images, item codes plain letters/digits.
const safeImg=u=>typeof u==="string"&&u.length<1.5e6&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(u)?u:null;
const safeCode=c=>/^[0-9A-Za-z-]{1,20}$/.test(String(c));

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
