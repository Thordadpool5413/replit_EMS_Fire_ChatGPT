---
name: Territory visual hierarchy
description: User-stated visual direction for territory and county exploration screens.
---

For the Home territory map, make the map the visual focus and show the selected area's summary in an adjacent inspection panel on desktop. Keep the metric selector, legend, and zoom controls together in a compact toolbar above the map. On phones, stack the inspector below the map. The cartographic background must span the entire map viewport, independently of any width-constrained SVG used for state geometry; do not leave a narrower inset-looking background rectangle behind the U.S. Use neutral surrounding surfaces, reserve strong colors for map metrics/status, keep selection distinct from metric shading, and reduce nested cards in favor of headings and dividers.

**Why:** The user repeatedly said the territory and county screens did not feel visually impressive or professional, and explicitly corrected a map background that still appeared as a narrower inset.

**How to apply:** Keep map texture and atmosphere on a full-bleed viewport layer rather than relying on the geometry SVG's opaque background. Reduce surrounding chrome before shrinking readable text. Fit the map without cropping, balance the map and inspector widths, and verify short-laptop and phone layouts for visible background coverage, horizontal overflow, or clipped legend labels. Preserve available data, citations, actions, and usable map controls.
