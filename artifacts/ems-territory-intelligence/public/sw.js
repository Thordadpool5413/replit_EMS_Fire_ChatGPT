const CACHE_NAME = "ems-territory-shell-v1";
const APP_ROOT = new URL("./", self.location).href;
const SHELL_ASSETS = [
  APP_ROOT,
  new URL("manifest.webmanifest", APP_ROOT).href,
  new URL("pwa-192.png", APP_ROOT).href,
  new URL("pwa-512.png", APP_ROOT).href,
  new URL("pwa-512-maskable.png", APP_ROOT).href,
];

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
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(APP_ROOT)) || Response.error()),
    );
    return;
  }

  // Cache only app-shell assets. API calls, public datasets, and user data are
  // deliberately left network-controlled so stale records are never presented as current.
  if (!["script", "style", "font", "image"].includes(request.destination)) return;
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
