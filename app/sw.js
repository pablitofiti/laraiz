/* La raíz · service worker
   - index.html: red primero (las actualizaciones aparecen solas)
   - resto (fuentes, iconos): caché primero
   - Dropbox: nunca se cachea */
const CACHE = "raiz-v31";
const SHELL = ["./", "./index.html", "./config.js", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.includes("dropbox") || url.hostname.includes("anthropic")) return;
  if (e.request.method !== "GET") return;
  if (url.pathname.endsWith("raiz.json")) return;
  const esDoc = e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/") || url.pathname.endsWith("config.js") || url.pathname.endsWith("app.js");
  if (esDoc) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html"))));
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => { const c = resp.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return resp; })));
  }
});
