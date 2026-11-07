---
name: Print theme readability
description: Keep printable agency briefs and field sheets readable regardless of the active screen theme.
---

Print output should use a light paper surface and dark readable text independent of the app's Daylight, Dark, or Miami Vice theme. Preserve status meaning with explicit high-contrast status labels, not theme-dependent utility colors. Keep source references visibly linked and retain intentional page-break markers; hiding a marker removes the break rather than just its decoration.

**Why:** Screen theme classes can leak low-contrast foregrounds and dark backgrounds into print, and provider briefs rely on explicit page breaks for their multi-page structure.

**How to apply:** Scope print overrides to the printable document or sheet, keep links and semantic labels legible even when printer background graphics are disabled, and use Chromium PDF output to verify text, source references, page breaks, and non-empty pagination in every supported theme.
