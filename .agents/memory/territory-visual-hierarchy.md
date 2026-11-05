---
name: Territory visual hierarchy
description: User-stated visual direction for territory and county exploration screens.
---

For the Home territory map, make the map the visual focus and show the selected area's summary in an adjacent inspection panel on desktop. Keep the metric selector, legend, and zoom controls together in a compact toolbar above the map. On phones, stack the inspector below the map. The cartographic background must span the entire map viewport, independently of any width-constrained SVG used for state geometry; do not leave a narrower inset-looking background rectangle behind the U.S. Use neutral surrounding surfaces, reserve strong colors for map metrics/status, keep selection distinct from metric shading, and reduce nested cards in favor of headings and dividers.

**Why:** The user repeatedly said the territory and county screens did not feel visually impressive or professional, and explicitly corrected a map background that still appeared as a narrower inset.

**How to apply:** Keep map texture and atmosphere on a full-bleed viewport layer rather than relying on the geometry SVG's opaque background. Reduce surrounding chrome before shrinking readable text. Fit the map without cropping, balance the map and inspector widths, and verify short-laptop and phone layouts for visible background coverage, horizontal overflow, or clipped legend labels. Preserve available data, citations, actions, and usable map controls.

For county reference cards, use restrained cool hues to distinguish metric categories, not to signal good or bad performance. Use FEMA risk colors only for the risk category defined by the source.

**Why:** population, transport time, and incident counts are descriptive measures, while a source-defined risk category has explicit severity semantics.

**How to apply:** keep raw county metrics on blue/cyan/violet surfaces with clearly named labels; keep the FEMA rating aligned with its published category palette and scope note.

Do not modify the existing app logo during visual or responsive changes. If it appears clipped, correct the surrounding layout rather than changing the logo asset or its styling.

**Why:** The user repeatedly instructed that the logo must remain untouched.

**How to apply:** Preserve the logo asset and its rendering; fix clipping through the containing header, spacing, or overflow behavior.

On laptop Territory screens, align the explorer with the full workspace width and avoid centered narrow columns that leave large side gutters. Keep card columns wide enough for their labels and values to remain readable.

**Why:** The user said the narrowed, multi-column laptop layout made the county map and cards worse to scan.

**How to apply:** Compare the explorer edges with the shared workspace toolbar at laptop widths, and verify the card count and readability at both 1024px and 1366px.
