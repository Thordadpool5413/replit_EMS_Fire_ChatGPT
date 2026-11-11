---
name: PWA registration timing
description: Service worker startup and offline caching constraints for the EMS territory app.
---

Register the production service worker directly during entry-module startup instead of deferring registration to a `window` load listener. Cache the HTML shell, packaged shell files, and versioned Vite assets; leave API responses and agency/source records network-controlled. Production worker revisions must change with the UI build and packaged shell assets.

**Why:** Production browser checks showed registration could be missed when deferred to the load event, and offline startup needs packaged datasets fetched by application code to be available without caching live records. A same-version cache can keep serving an outdated manifest or icon after its source file changes.

**How to apply:** When changing registration, packaged data or shell files, ensure the build-derived release fingerprint covers those files. Test a fresh production build, worker activation, cache contents and a full offline reload with the browser HTTP cache disabled.

Installed-app updates require explicit user approval and must not interrupt an unfinished fact review. Keep the previous shell's cached fingerprinted assets available for other open tabs.

**Why:** Field users can be editing local research while a new version arrives; immediate activation, cache deletion or automatic reload can disrupt that work.

**How to apply:** Derive release revisions from the build, keep install/update listeners alive outside optional menus, provide a save-first reload action, and test cancellation and local-data preservation. Cold offline launch needs the entry dependency graph and Home assets, not just cached HTML.
