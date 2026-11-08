---
name: Browser regression checks
description: Browser automation constraints and conventions for the EMS territory app.
---

Check component-level overflow as well as document width; an ancestor with hidden overflow can clip a source table while the page still passes a horizontal-overflow assertion.

**Why:** A county source table visibly lost columns even though the document's measured width fit the laptop viewport.

**How to apply:** Compare scroll width with client width on the county/source containers, then inspect the loaded screenshot. Do not equate absence of a page scrollbar with readable content.

Use the installed Chromium binary with Node's built-in WebSocket and Chrome DevTools Protocol for browser-level layout checks. The workspace has no Playwright or Puppeteer dependency, so keep this harness dependency-free unless the project adopts a browser test framework.

**Why:** Browser testing must run in the Replit environment without adding a browser automation package just to cover a viewport regression.

**How to apply:** Extend the existing profile overflow browser script for similar viewport checks. Return booleans and plain measurements from DevTools evaluations; do not return DOM nodes by value. Compare in-page values inside the evaluation or against measurements returned to Node.

For rem-sized layout invariants, calculate expected geometry from the live root font size and compare the rendered box model, including borders, rather than assuming a fixed pixel size.

**Why:** The app's root font size and box sizing affect measured dimensions, so hard-coded pixel assumptions can fail even when the visible layout has not changed.

**How to apply:** Use `getComputedStyle(document.documentElement).fontSize` for rem conversions and measure both the frame and its rendered image or content.

Run feature-specific profile checks from the app shell and navigate directly to the profile flow instead of waiting for home-map data. Keep route smoke checks and unrelated map readiness out of focused profile failures.

**Why:** A profile layout regression should remain diagnosable even when territory-map services or published routes have unrelated loading problems.

**How to apply:** Give focused profile checks their own mode and wait only for the app shell and profile directory controls they need.

When selecting a named agency from the card directory, locate its exact heading and click the profile action within that heading's nearest card. Do not match the agency name against broad ancestor text, which can select another card when the ancestor contains multiple results.

**Why:** A broad ancestor can contain a matching agency name elsewhere in the results while the first profile button belongs to a different agency.

**How to apply:** Use exact visible heading text as the anchor for any browser test that opens a named agency from the directory.

For map palette contrast checks, sample the rendered SVG state `fill` values instead of parsing CSS gradient text.

**Why:** Chromium may normalize gradient color syntax when exposing it through the CSSOM, so tests that expect the original hexadecimal strings are brittle.

**How to apply:** Calculate contrast from actual state fills and use the legend's low/high endpoint labels to verify palette direction across responsive widths.

When comparing stylesheet refactors, keep font-face definitions stable and compare
the before/after computed styles synchronously on the same connected elements.

**Why:** Replacing font-face rules can briefly measure fallback-font geometry;
awaiting font readiness between snapshots lets asynchronous agency hydration
replace the elements, producing false geometry and color differences.

**How to apply:** Load fonts before collecting the elements, keep their definitions
outside the swapped stylesheets, and avoid yielding between the two measurements.

When a screen contains multiple native disclosure elements, select the one being tested by its summary label instead of using the first `details` element.

**Why:** County cards added their own disclosures ahead of the existing FEMA boundary/source disclosure, making a first-match selector read the wrong content and wait forever.

**How to apply:** Scope browser assertions to the intended component and use its visible summary text to identify nested or neighboring disclosures.

The full theme-readability run is expensive because it sweeps charts and multiple GIS layers at each viewport. On a constrained run, the DevTools evaluation can time out late in the GIS sweep after the preceding theme, profile, chart, and dialog checks have passed.

**Why:** Repeated full runs at laptop and phone widths reached the GIS layer sweep before hitting the DevTools command timeout; the focused selection checks remained reliable.

**How to apply:** Run one viewport at a time. Diagnose with the selection-only or specialty-only mode first, and distinguish a late harness timeout from a specific visual assertion failure.

For Letter-print regressions, capture PDFs with Chromium's DevTools print command and verify page size, text, and non-empty pagination. `pdftotext -layout` may interleave text from adjacent table columns, so check print-layout geometry and meaningful content tokens instead of requiring every multi-column cell to extract as one exact phrase.

**Why:** Multi-column PDF extraction order is not a reliable representation of the visual cell boundaries, even when the printed table is intact.

**How to apply:** Use the installed `pdfinfo` and `pdftotext` tools alongside DOM measurements under print media when validating agency brief output.

In Plan mode, a temporary Chromium user-data directory alone does not prevent browser writes to the workspace: ancillary crash-report and NSS certificate stores can still use workspace-backed OS profile locations.

**Why:** Read-only audits were blocked by Chromium writing crash settings and certificate database files outside its requested temporary user-data directory.

**How to apply:** Prefer the platform screenshot tool for read-only planning previews. If a temporary browser harness is necessary, isolate all ancillary OS profile storage under `/tmp` before launching; never treat a blocked launch or an early loading screenshot as a completed layout check.
