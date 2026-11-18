// Keeps the app quick on a weak signal: it always opens from the copy on the phone, then checks for a newer version
// in the background. When one has fully downloaded, the page is told so it can offer "Reload".
// No version number to bump by hand: the app files are compared with what's on the phone.
const CACHE = "bcf-app";
const APP = ["./", "index.html", "js/core.js", "js/scan.js", "js/ui.js", "js/count.js", "js/nosku.js", "js/sheets.js",
  "js/shared.js", "js/admin.js", "js/livescan.js", "js/main.js", "ai.js", "store.js", "config.js",
  "manifest.webmanifest", "data/items.enc.json", "icon-192.png"];
// The label reader (engine + English data) and barcode reader, so snaps work with no signal from day one.
const BIG = ["vendor/tesseract.min.js", "vendor/zxing.min.js", "vendor/ocr/worker.min.js", "vendor/ocr/eng.traineddata.gz",
  "vendor/ocr/tesseract-core-simd-lstm.wasm.js", "vendor/ocr/tesseract-core-lstm.wasm.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP.map(u => new Request(u, { cache: "no-cache" })))
    // Reuse the big reader files from the phone's older copy of the app (any cache) rather than downloading them again.
    .then(() => Promise.all(BIG.map(u => caches.match(u).then(hit => hit ? c.put(u, hit) : c.add(u)).catch(() => {}))))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Fetch every app file fresh; only if all of them arrive, swap them in together (so page and code always match).
let checking = null;
function checkForUpdate() {
  if (checking) return checking;
  checking = (async () => {
    const c = await caches.open(CACHE);
    const fresh = await Promise.all(APP.map(u => fetch(u, { cache: "no-cache" }).then(r => r.ok ? r : Promise.reject())));
    let changed = false;
    for (let i = 0; i < APP.length; i++) {
      const old = await c.match(APP[i]);
      const [a, b] = await Promise.all([fresh[i].clone().arrayBuffer(), old ? old.arrayBuffer() : null]);
      if (!b || a.byteLength !== b.byteLength) { changed = true; continue; }
      const x = new Uint8Array(a), y = new Uint8Array(b);
      for (let j = 0; j < x.length; j++) if (x[j] !== y[j]) { changed = true; break; }
    }
    if (!changed) return;
    await Promise.all(APP.map((u, i) => c.put(u, fresh[i])));
    (await self.clients.matchAll({ type: "window" })).forEach(cl => cl.postMessage({ type: "updated" }));
  })().catch(() => {}).finally(() => { checking = null; });
  return checking;
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const firebaseLib = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (!sameOrigin && !firebaseLib) return; // Firebase data traffic goes straight to the network
  const isVendor = firebaseLib || url.pathname.includes("/vendor/");
  const keep = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (isVendor) {
    // Libraries never change at a given path: phone copy first.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(keep)));
    return;
  }
  // App files: the phone's copy right away; opening the page also starts a background check for a newer version.
  if (req.mode === "navigate") e.waitUntil(checkForUpdate());
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit
    || fetch(req).then(keep).catch(() => req.mode === "navigate" ? caches.match("index.html") : Response.error())));
});
