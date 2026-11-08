---
name: Direct PDF export compatibility
description: Keep browser-generated agency PDFs compatible with html2canvas and prevent clipping in searchable text.
---

Direct agency PDF export must normalize computed theme colors before html2canvas captures the cloned document. html2canvas 1.4 rejects OKLCH color functions; use print-safe RGB fallbacks for text, surfaces, borders, and status badges in the export clone. When adding the invisible searchable text layer with jsPDF, do not constrain each extracted word to its measured CSS width: jsPDF's font metrics can differ from the browser's and clip characters.

**Why:** Real Daylight, Dark, and Miami Vice theme colors made the direct export fail before saving, and CSS-sized maxWidth values truncated extracted words and source references.

**How to apply:** Keep the direct A4 export covered by the profile print regression, checking A4 page size, non-empty pages, agency/operations words, and source URLs.
