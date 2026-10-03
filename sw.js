// Keeps the app working with a weak signal: the app files load from the phone, then update in the background.
const VERSION = "bcf-v1";
const SHELL = ["./", "index.html", "app.js", "store.js", "config.js", "manifest.webmanifest", "data/items.enc.json", "icon-192.png"];
const BIG = ["vendor/tesseract.min.js", "vendor/zxing.min.js", "vendor/ocr/worker.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => c.addAll(BIG).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const firebaseLib = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (!sameOrigin && !firebaseLib) return; // Firebase data traffic goes straight to the network
  const isVendor = firebaseLib || url.pathname.includes("/vendor/");
  if (isVendor) {
    // Libraries never change at a given path: phone copy first.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone())); return res; })));
    return;
  }
  // App files: newest from the network, phone copy when offline.
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req).then(hit => hit || caches.match("index.html"))));
});
