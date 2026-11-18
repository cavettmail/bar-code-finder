"use strict";
// Live scan: point the camera at bottle barcodes one after another. A bottle whose barcode is already linked shows its
// inventory barcode right away, ready for the scanner. An unlinked one can be looked up with a photo, which links it.
const LV={stream:null,timer:null,busy:false,last:"",lastAt:0,det:null,canvas:null};
async function liveDecode(video){
  if(!video.videoWidth) return null;
  if(LV.det===null&&"BarcodeDetector" in window){
    try{ const f=await BarcodeDetector.getSupportedFormats(); const want=["ean_13","upc_a","ean_8","upc_e"].filter(x=>f.includes(x));
      LV.det=want.length?new BarcodeDetector({formats:want}):false; }catch{ LV.det=false; } }
  if(LV.det){ try{ const r=await LV.det.detect(video); const hit=r.find(b=>/^\d{8,14}$/.test(b.rawValue)); return hit?cleanUPC(hit.rawValue):null; }catch{ return null; } }
  // No built-in detector (iPhone, some Androids): read a smaller copy of the frame with the bundled reader.
  if(!zxingP) zxingP=loadScript("vendor/zxing.min.js");
  await zxingP; const Z=window.ZXing; if(!Z) return null;
  const k=Math.min(1,900/Math.max(video.videoWidth,video.videoHeight)), c=LV.canvas||(LV.canvas=document.createElement("canvas"));
  c.width=Math.round(video.videoWidth*k); c.height=Math.round(video.videoHeight*k);
  c.getContext("2d",{willReadFrequently:true}).drawImage(video,0,0,c.width,c.height);
  try{ const reader=new Z.MultiFormatReader(), hints=new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.UPC_A,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_E]); reader.setHints(hints);
    const res=reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))); return res?.getText()?cleanUPC(res.getText()):null; }catch{ return null; }
}
async function openLive(){
  const box=$("live"), video=$("liveVideo");
  if(!navigator.mediaDevices?.getUserMedia){ toast("Live scan isn't available in this browser. Use Snap a bottle."); return; }
  try{ LV.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false}); }
  catch{ $("blocked").hidden=false; toast("The camera is blocked. Allow it in the browser, or use Snap a bottle."); return; }
  video.srcObject=LV.stream; await video.play().catch(()=>{});
  LV.last=""; $("liveOut").innerHTML=`<p class="hint" style="color:#ddd">Point at a bottle's own barcode. Hold it about a hand's width away.</p>`;
  box.hidden=false; $("liveClose").focus();
  LV.timer=setInterval(async()=>{
    if(LV.busy||box.hidden) return; LV.busy=true;
    try{ const upc=await liveDecode(video);
      if(upc&&!(upc===LV.last&&Date.now()-LV.lastAt<3000)){ LV.last=upc; LV.lastAt=Date.now(); try{navigator.vibrate?.(30);}catch{} showLive(upc); }
      else if(upc===LV.last) LV.lastAt=Date.now();
    } finally{ LV.busy=false; }
  },250);
}
function showLive(upc){
  const code=UPC[upc], r=code&&byCode[code];
  if(r){ addRecent(code);
    $("liveOut").innerHTML=`<div class="card"><span class="tag">Bottle barcode ${esc(upc)}</span><div class="ihead"><div><h3>${esc(r[1])}</h3><div class="prod">${esc(r[2])} · ${pagesTxt(r[4])}</div></div></div>${plate(r[0])}${cntBlock(r[0])}</div>`;
    return; }
  $("liveOut").innerHTML=`<div class="card"><div class="nosku">Bottle barcode ${esc(upc)} isn't linked to an item yet.</div>
    <button class="btn btn-primary" type="button" id="liveLook">Look it up with a photo</button><p class="hint">Takes a picture now and matches the label. Tap the right item and this barcode is linked for everyone.</p></div>`;
  $("liveLook").onclick=lookUpFrame;
}
async function lookUpFrame(){
  const video=$("liveVideo"); if(!video.videoWidth) return;
  const c=document.createElement("canvas"); c.width=video.videoWidth; c.height=video.videoHeight; c.getContext("2d").drawImage(video,0,0);
  const blob=await new Promise(res=>c.toBlob(res,"image/jpeg",.9)); closeLive(); showTab("find");
  if(blob) run({files:[new File([blob],"live.jpg",{type:"image/jpeg"})],value:""});
}
function closeLive(){
  clearInterval(LV.timer); LV.timer=null; LV.stream?.getTracks().forEach(t=>t.stop()); LV.stream=null;
  $("liveVideo").srcObject=null; $("live").hidden=true; $("liveBtn").focus?.();
}
$("liveBtn").onclick=openLive; $("liveClose").onclick=closeLive;
// Capture phase, so this runs before Escape closes a full-screen barcode opened from the live view.
window.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!$("live").hidden&&ov.hidden) closeLive(); },true);
// Don't keep the camera on when the app goes to the background.
document.addEventListener("visibilitychange",()=>{ if(document.hidden&&!$("live").hidden) closeLive(); });
