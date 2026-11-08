const CACHE_NAME = "ems-territory-shell-v3";
const APP_ROOT = new URL("./", self.location).href;
const SHELL_ASSETS = [
  APP_ROOT,
  new URL("manifest.webmanifest", APP_ROOT).href,
  new URL("pwa-192.png", APP_ROOT).href,
  new URL("pwa-512.png", APP_ROOT).href,
  new URL("pwa-512-maskable.png", APP_ROOT).href,
  new URL("logo.jpg", APP_ROOT).href,
];
const BUILT_ASSETS_ROOT = new URL("assets/", APP_ROOT).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("ems-territory-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  const url = new URL(request.url);
  if (!url.href.startsWith(APP_ROOT)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
          await (await caches.open(CACHE_NAME)).put(APP_ROOT, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(APP_ROOT)) || Response.error();
      }
    })());
    return;
  }

  // Vite fingerprints built assets (including bundled static datasets), so these
  // URLs change when app code or packaged data changes. Live APIs, agency records,
  // and arbitrary images stay network-only to avoid presenting stale evidence.
  const isBuiltAsset = url.href.startsWith(BUILT_ASSETS_ROOT);
  const isPackagedShellAsset = SHELL_ASSETS.includes(url.href) && url.href !== APP_ROOT;
  if (!isBuiltAsset && !isPackagedShellAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
