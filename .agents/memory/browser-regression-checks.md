---
name: Browser regression checks
description: Browser automation constraints and conventions for the EMS territory app.
---

Use the installed Chromium binary with Node's built-in WebSocket and Chrome DevTools Protocol for browser-level layout checks. The workspace has no Playwright or Puppeteer dependency, so keep this harness dependency-free unless the project adopts a browser test framework.

**Why:** Browser testing must run in the Replit environment without adding a browser automation package just to cover a viewport regression.

**How to apply:** Extend the existing profile overflow browser script for similar viewport checks. Return booleans and plain measurements from DevTools evaluations; do not return DOM nodes by value.
