---
name: Territory visual hierarchy
description: User-stated visual direction for territory and county exploration screens.
---

For the Home territory map, make the map the visual focus and show the selected area's summary in an adjacent inspection panel on desktop. Keep the metric selector, legend, and zoom controls together in a compact toolbar above the map. On phones, stack the inspector below the map. The cartographic background must span the entire map viewport, independently of any width-constrained SVG used for state geometry; do not leave a narrower inset-looking background rectangle behind the U.S. Use neutral surrounding surfaces, reserve strong colors for map metrics/status, keep selection distinct from metric shading, and reduce nested cards in favor of headings and dividers.

**Why:** The user repeatedly said the territory and county screens did not feel visually impressive or professional, and explicitly corrected a map background that still appeared as a narrower inset.

**How to apply:** Keep map texture and atmosphere on a full-bleed viewport layer rather than relying on the geometry SVG's opaque background. Reduce surrounding chrome before shrinking readable text. Fit the map without cropping, balance the map and inspector widths, and verify short-laptop and phone layouts for visible background coverage, horizontal overflow, or clipped legend labels. Preserve available data, citations, actions, and usable map controls.

Use shared app theme tokens for county and provider surfaces. County figures use restrained colors: neutral numbers for most facts, red for cardiac arrests as a topic cue, and brand color for actions/selection. Use FEMA risk colors only for the risk category defined by the source.

**Why:** After rejecting the multicolor county cards as visually cluttered, the user explicitly chose “Use restrained colors (recommended),” superseding the earlier request for a separate color on every metric.

**How to apply:** Use shared canvas, surface, text, border, and action tokens in all themes. Do not restore rainbow metric colors or competing saturated metric panels. Keep readable neutral numbers and cardiac red without implying performance thresholds or unvalidated risk ratings. Preserve FEMA/map palettes.

The user subsequently requested more color in visuals, icons, cards, and text. Use a small coordinated set of topic accents and subtle header/context tints rather than returning to a separate accent for every metric. Operations, community/geography, planning/equipment, and clinical information can have distinct topic hues while sources/review/risk labels remain neutral.

**Why:** The user wanted a more visually appealing experience after the shared icon rollout; restrained topic color adds distinction without reviving the multicolor numeric clutter they previously rejected.

**How to apply:** Treat these hues as subject identifiers, never performance or validation states. Keep values legible, use shared theme-specific tokens, check contrast on tinted surfaces, and preserve paper-safe and forced-colors rendering.

Do not modify the existing app logo during visual or responsive changes. If it appears clipped, correct the surrounding layout rather than changing the logo asset or its styling.

**Why:** The user repeatedly instructed that the logo must remain untouched.

**How to apply:** Preserve the logo asset and its rendering; fix clipping through the containing header, spacing, or overflow behavior.

On laptop Territory screens, align the explorer with the full workspace width and avoid centered narrow columns that leave large side gutters. Keep card columns wide enough for their labels and values to remain readable.

**Why:** The user said the narrowed, multi-column laptop layout made the county map and cards worse to scan.

**How to apply:** Compare the explorer edges with the shared workspace toolbar at laptop widths, and verify the card count and readability at both 1024px and 1366px.

On drilled-in Territory views, do not repeat the selected location when the shared app header already shows it. Group the back action, county count, and collapsed area-change menu with the page title, not in a separate full-width toolbar; keep alternate state/county selectors, sharing, and reset inside that menu.

**Why:** A separate row for only two controls left dead space and pushed the title, search, and provider action farther down the page.

**How to apply:** Let the shared breadcrumb provide current-location context; keep the selected area, search, and primary provider action in one compact heading card, with secondary controls available on demand.

For county directories, use two equal-width cards side by side on laptops and one per row on phones. Emphasize county/seat and the reference metrics. Display mapped places, geography metadata, extra context, and sources directly with each county rather than behind collapsed details. Remove the "User review not recorded" badge and its review-status column instead of replacing it with another verification notice.

**Why:** The user explicitly asked to cut county card width in half to show two counties side by side, replacing the earlier full-width comparison-row direction. They also requested inline Details & sources and removal of "User review not recorded."

**How to apply:** Recompose content for half-width cards rather than shrinking full-width layouts. Verify two equal columns at 1024px and 1366px, one readable card per row on phones, and all themes. Do not delete data or citations; verify place selection and source links.

Emphasize population, average EMS transport time, and annual cardiac arrests over supporting context and geography. Label FEMA as hazard risk, not an agency-performance grade or percentage. Explain general FIPS/NEMSIS limitations once at directory level; retain county-specific provenance with each county.

**Why:** The user approved this hierarchy to make county cards easier to scan without hiding available data or inventing good/bad judgments.

**How to apply:** Use stronger numbers for the three key figures, quieter supporting/geographic rows, and low-chrome place links. The user explicitly requested a red cardiac-arrest accent; treat this as a metric-category cue, not an inferred risk threshold. Keep every figure and actual source, vintage, scope, and period visible.

Readability improvements alone are not enough for county cards: the user wants the data to look and feel visually impressive and appealing, not like a plain table inside a white box.

**Why:** The user rejected the clearer, neutral card presentation and subsequently rejected the data area again after a blue header, metric icons, and a tinted supporting-facts strip were added.

**How to apply:** Redesign the data composition itself, not just the header or surrounding color. The user rejected roomy response/community panels, narrow multi-column metric matrices with colored ticks, an eight-row label/value ledger, and freely wrapping supporting figures that run together. Do not treat those as approved designs. Keep two half-width cards with clear primary/supporting hierarchy and restrained color. Avoid stretching shorter cards to match neighbors. Retain readable labels and avoid invented good/bad judgments.

Keep every county detail visible; do not move secondary figures, geography, places, or source records into an expandable section.

**Why:** When explicitly offered a smaller summary with expandable secondary details, the user chose “Keep every detail visible.”

**How to apply:** Reduce redundant chrome and improve composition rather than hiding content, truncating labels, omitting records, or making essential type smaller. On phones, let county place lists flow with the page rather than capping them inside a nested scroll box; this preserves the same visible-detail requirement during touch browsing.

For county views, remove the dedicated mapped-place lists from county reference panels, map-side previews, and county directory cards, but retain city/town markers and labels on the county map.

**Why:** The user asked to remove the “Places in the county” section and then explicitly chose to keep map pins, which preserve geographic discovery and city-level selection.

**How to apply:** Remove place-list panels and rows without deleting underlying geography data or map markers; keep map pin selection and the all-places reset action available.

Use a clearly colored blue county-name header, not an almost-white tint. Keep Home's desktop map controls on the normal app surface (white in Daylight), separate from the dark geographic canvas.

**Why:** The user explicitly requested a header color for each county and proposed white for the map's side options after rejecting the oversized cards and all-dark options panel.

**How to apply:** Preserve legible header metadata and icons on blue. Recheck actual control and legend text contrast when separating the light control surface from the fixed dark map; legacy map text colors must not carry over onto white.

Restore blue, not green/teal, as the Daylight theme's action and selection color. Preserve source-defined map/risk colors and use stronger hierarchy rather than giving every descriptive metric a decorative accent.

**Why:** The user explicitly asked to return Daylight to the blue color previously used, rejecting the green appearance.

**How to apply:** Update the shared Daylight action, link, selection, focus, and related navigation tokens consistently; do not change the logo or infer new good/bad data thresholds.
