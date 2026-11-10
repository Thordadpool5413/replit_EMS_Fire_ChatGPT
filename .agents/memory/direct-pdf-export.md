---
name: Direct PDF export compatibility
description: Keep browser-generated agency PDFs theme-safe, searchable, and correctly paginated on A4 and Letter paper.
---

Direct agency PDF export must normalize computed theme colors before html2canvas captures the cloned document. html2canvas 1.4 rejects OKLCH color functions; use print-safe RGB fallbacks for text, surfaces, borders, and status badges in the export clone. When adding the invisible searchable text layer with jsPDF, do not constrain each extracted word to its measured CSS width: jsPDF's font metrics can differ from the browser's and clip characters.

Crop each rasterized document page to the printable content area instead of shifting one tall image by the printable height across full-size pages. The latter overlaps neighboring page content through the margins and can leave a duplicate sliver or blank trailing page, especially on Letter paper. Keep a consistent 10 mm margin and derive pagination from the final searchable text baseline so the last text page is included without adding a textless tail.

Capture source-link client rectangles from the same cloned document used for the raster and searchable text layers. Scale and clip each rectangle to its cropped PDF page, then add a URI annotation with the exact sanitized href; verify both annotation targets and visible source URLs in the direct-export regression.

**Why:** Real Daylight, Dark, and Miami Vice theme colors made the direct export fail before saving, CSS-sized maxWidth values truncated extracted words, and full-image page shifts duplicated the report footer across Letter page boundaries.

**How to apply:** Preserve RGB fallbacks for html2canvas, unrestricted searchable-word placement, and per-page image crops. Keep the profile print regression checking both direct-download paper sizes, non-empty pages, agency/operations words, visible source URLs, and matching URI annotations.

For icon-rich briefs, reuse a content-keyed document capture when switching A4/Letter rather than rendering the same document with html2canvas again. Keep decorative label icons self-contained and paper-safe in the export clone.

**Why:** A fresh A4 capture succeeded but a second capture after a Letter download repeatedly stalled; reusing the same capture restored sequential exports for both agency types. Paper choice affects cropping, not the underlying document rendering.

**How to apply:** Invalidate cached captures when document content, theme, or width changes, release them when the dossier closes, and retain the searchable text and source-link rectangles with the capture. Verify sequential downloads, not only one fresh export.
