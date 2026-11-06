---
name: Browser regression checks
description: Browser automation constraints and conventions for the EMS territory app.
---

Use the installed Chromium binary with Node's built-in WebSocket and Chrome DevTools Protocol for browser-level layout checks. The workspace has no Playwright or Puppeteer dependency, so keep this harness dependency-free unless the project adopts a browser test framework.

**Why:** Browser testing must run in the Replit environment without adding a browser automation package just to cover a viewport regression.

**How to apply:** Extend the existing profile overflow browser script for similar viewport checks. Return booleans and plain measurements from DevTools evaluations; do not return DOM nodes by value. Compare in-page values inside the evaluation or against measurements returned to Node.

When selecting a named agency from the card directory, locate its exact heading and click the profile action within that heading's nearest card. Do not match the agency name against broad ancestor text, which can select another card when the ancestor contains multiple results.

**Why:** A broad ancestor can contain a matching agency name elsewhere in the results while the first profile button belongs to a different agency.

**How to apply:** Use exact visible heading text as the anchor for any browser test that opens a named agency from the directory.

For map palette contrast checks, sample the rendered SVG state `fill` values instead of parsing CSS gradient text.

**Why:** Chromium may normalize gradient color syntax when exposing it through the CSSOM, so tests that expect the original hexadecimal strings are brittle.

**How to apply:** Calculate contrast from actual state fills and use the legend's low/high endpoint labels to verify palette direction across responsive widths.

When a screen contains multiple native disclosure elements, select the one being tested by its summary label instead of using the first `details` element.

**Why:** County cards added their own disclosures ahead of the existing FEMA boundary/source disclosure, making a first-match selector read the wrong content and wait forever.

**How to apply:** Scope browser assertions to the intended component and use its visible summary text to identify nested or neighboring disclosures.
