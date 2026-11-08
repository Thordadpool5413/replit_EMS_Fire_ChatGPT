---
name: PWA registration timing
description: Service worker startup and offline caching constraints for the EMS territory app.
---

Register the production service worker directly during entry-module startup instead of deferring registration to a `window` load listener. Cache the HTML shell, packaged shell files, and versioned Vite assets; leave API responses and agency/source records network-controlled. Increment the shell cache version whenever a cache-first packaged shell file changes.

**Why:** Production browser checks showed registration could be missed when deferred to the load event, and offline startup needs packaged datasets fetched by application code to be available without caching live records. A same-version cache can keep serving an outdated manifest or icon after its source file changes.

**How to apply:** When changing PWA registration or packaged static data, bump the cache version if a cache-first shell file changed, then test a fresh production build, worker activation, cache contents, and a full offline launch.
