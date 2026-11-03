---
name: API checks through artifact proxies
description: Distinguishes direct local Vite requests from API routing through the Replit artifact preview proxy.
---

API-backed screens can appear to fail in a browser test pointed directly at the Vite port because the local server does not proxy root `/api` requests. The Replit artifact preview routes those requests separately; adding the artifact path prefix to the API URL can return the app shell instead of API data.

**Why:** A direct-port browser check showed missing county risk shading even though the API returned valid county records through the preview proxy.

**How to apply:** When a route works by direct API request but fails from a local Vite browser test, verify the endpoint through the artifact preview URL before changing app API paths. Keep UI layout tests local if they do not need backend data.
