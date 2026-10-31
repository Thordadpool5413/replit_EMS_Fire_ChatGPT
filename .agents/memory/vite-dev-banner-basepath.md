---
name: Vite dev banner under artifact paths
description: Diagnose the Replit development-banner script 404 in path-prefixed Vite artifacts.
---

The Replit Vite dev-banner plugin may inject a root-absolute script URL. In a path-prefixed artifact, the app and the banner script under the artifact prefix can return 200 while the unprefixed banner URL returns 404 through the preview proxy. This is a development-only asset, not an app API failure. If the plugin has no base-aware option, removing only the `devBanner()` plugin call avoids the error without changing the artifact base path or application routes.

**Why:** The banner request was observed failing at the proxy root while the prefixed artifact route and application both responded successfully.

**How to apply:** When diagnosing preview 404s, inspect the exact failed request URL and compare root versus artifact-prefixed paths before changing app routes or API code.
