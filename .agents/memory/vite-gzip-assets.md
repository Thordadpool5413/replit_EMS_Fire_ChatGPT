---
name: Compressed Vite assets
description: Vite/browser handling of `.gz` files imported as URLs.
---

When fetching a `.gz` file through a Vite `?url` import, accept both raw gzip bytes and an already decompressed response. Check the gzip magic bytes (`1f 8b`) before calling `gunzipSync`; otherwise parse the response bytes directly.

**Why:** Vite's development server can serve a `.gz` URL with `Content-Encoding: gzip`, so browser `fetch` transparently decompresses the body. Unconditional gunzip then fails in the preview even though the file itself is valid.

**How to apply:** Use this check for browser-fetched gzip assets that must work in both Vite development and production.
