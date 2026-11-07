---
name: Territory visual hierarchy
description: User-stated visual direction for territory and county exploration screens.
---

For the Home territory map, make the map the visual focus and show the selected area's summary in an adjacent inspection panel on desktop. Keep the metric selector, legend, and zoom controls together in a compact toolbar above the map. On phones, stack the inspector below the map. The cartographic background must span the entire map viewport, independently of any width-constrained SVG used for state geometry; do not leave a narrower inset-looking background rectangle behind the U.S. Use neutral surrounding surfaces, reserve strong colors for map metrics/status, keep selection distinct from metric shading, and reduce nested cards in favor of headings and dividers.

**Why:** The user repeatedly said the territory and county screens did not feel visually impressive or professional, and explicitly corrected a map background that still appeared as a narrower inset.

**How to apply:** Keep map texture and atmosphere on a full-bleed viewport layer rather than relying on the geometry SVG's opaque background. Reduce surrounding chrome before shrinking readable text. Fit the map without cropping, balance the map and inspector widths, and verify short-laptop and phone layouts for visible background coverage, horizontal overflow, or clipped legend labels. Preserve available data, citations, actions, and usable map controls.

Use the shared app theme tokens for county and provider surfaces. Keep descriptive metrics neutral rather than assigning each metric a distinct accent; reserve semantic colors for meaningful source/status states and map-specific data encoding. Use FEMA risk colors only for the risk category defined by the source.

**Why:** the user asked for a restrained, consistent theme across Home, Territory, Agencies, and Field Work, with color reserved for actions, selection, and meaningful status rather than decorative metric coding.

**How to apply:** use the shared canvas, surface, text, border, and action tokens in light and dark themes. Keep population, transport time, and counts on quiet neutral surfaces; retain the source-defined FEMA risk palette and map metric shading.

Do not modify the existing app logo during visual or responsive changes. If it appears clipped, correct the surrounding layout rather than changing the logo asset or its styling.

**Why:** The user repeatedly instructed that the logo must remain untouched.

**How to apply:** Preserve the logo asset and its rendering; fix clipping through the containing header, spacing, or overflow behavior.

On laptop Territory screens, align the explorer with the full workspace width and avoid centered narrow columns that leave large side gutters. Keep card columns wide enough for their labels and values to remain readable.

**Why:** The user said the narrowed, multi-column laptop layout made the county map and cards worse to scan.

**How to apply:** Compare the explorer edges with the shared workspace toolbar at laptop widths, and verify the card count and readability at both 1024px and 1366px.

On drilled-in Territory views, do not repeat the selected location when the shared app header already shows it. Group the back action, county count, and collapsed area-change menu with the page title, not in a separate full-width toolbar; keep alternate state/county selectors, sharing, and reset inside that menu.

**Why:** A separate row for only two controls left dead space and pushed the title, search, and provider action farther down the page.

**How to apply:** Let the shared breadcrumb provide current-location context; keep the selected area, search, and primary provider action in one compact heading card, with secondary controls available on demand.

For county directories, use aligned comparison rows on laptops and compact stacked cards on phones. Emphasize county/seat and the three reference metrics; keep mapped places, geography metadata, extra context, and citations available in one collapsed details control. Keep the scope caveat visible at section level.

**Why:** A multi-column card grid repeated labels and controls across every county, making important facts difficult to compare and scan.

**How to apply:** On desktop, line up county/seat, population, transport time, OHCA reference, details, and action as rows rather than separate card tiles. On phones, retain one compact card per county. Do not delete data or citations; verify expanded place selection and source links.
