const CACHE_NAME = "ems-territory-shell-v4";
const APP_ROOT = new URL("./", self.location).href;
// Filled deterministically by the production build: entry graph + Home for a cold offline launch.
const BOOT_ASSETS = /* BUILD_BOOT_ASSETS */ [];
const SHELL_ASSETS = [
  APP_ROOT,
  new URL("manifest.webmanifest", APP_ROOT).href,
  new URL("pwa-192.png", APP_ROOT).href,
  new URL("pwa-512.png", APP_ROOT).href,
  new URL("pwa-512-maskable.png", APP_ROOT).href,
  new URL("pwa-180.png", APP_ROOT).href,
  new URL("logo.jpg", APP_ROOT).href,
  ...BOOT_ASSETS.map(asset => new URL(asset, APP_ROOT).href),
];
const BUILT_ASSETS_ROOT = new URL("assets/", APP_ROOT).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

// Updating an installed app is explicit so an active research form is not reloaded.
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("ems-territory-shell-") && key !== CACHE_NAME)
          // Retain the previous shell's fingerprinted files for other open tabs.
          .slice(0, -1)
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
  if (/^api(?:\/|\?|$)/.test(url.href.slice(APP_ROOT.length))) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
          await (await caches.open(CACHE_NAME)).put(APP_ROOT, response.clone())
            .catch(error => console.warn("Shell cache write failed", error));
        }
        return response;
      } catch {
        return (await (await caches.open(CACHE_NAME)).match(APP_ROOT)) || Response.error();
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
      const cached = await cache.match(request) ||
        (isBuiltAsset ? await caches.match(request) : undefined);
      const network = fetch(request).then(async (response) => {
        if (response.ok && response.type === "basic") {
          await cache.put(request, response.clone()).catch(error => console.warn("Shell cache write failed", error));
        }
        return response;
      }).catch(() => cached || Response.error());
      event.waitUntil(network.then(() => undefined));
      return cached || network;
    }),
  );
});
