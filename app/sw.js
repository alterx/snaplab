// Offline cache. Bump VERSION when files change.
const VERSION = "snaplab-v3";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "engine.js", "recipes.js", "camper-snapper.js", "chart.js", "gamma-table.js",
  "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "presets/index.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then(async (c) => {
      await c.addAll(SHELL);
      const presets = await (await fetch("presets/index.json")).json();
      await c.addAll(presets.map((p) => `presets/${p}`));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so edits show up while developing), cache fallback when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Google Fonts: cache first, so the type survives offline.
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }
  // Same-origin files and Camper Snapper's .flt files: network first, cached copy when offline.
  if (url.origin !== location.origin && url.hostname !== "campersnapper.com") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
