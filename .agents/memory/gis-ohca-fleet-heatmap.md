---
name: EMS territory map metrics
description: Calculation, missing-data, and color-direction rules for EMS territory and state maps.
---

The OHCA GIS metric is annual reported OHCA calls divided by annual reported 911 transports, multiplied by 1,000. Only agencies with both nonnegative values and a positive transport denominator qualify. State and territory rates use the ratio of summed matched calls to summed matched transports, not the simple average of agency rates. Relative tiers use national percentiles and must not be described as clinical acuity. Fleet age uses 0–4, 5–6, 7–9, and 10+ year bands; missing ages remain explicitly unreported.

Render every agency in the active geography/provider filter for heat and hex aggregation. Keep individual station markers optional at nationwide scale because dense point overlays obscure the surface.

**Why:** The user wants available information visible for end users to verify with the agency; calculations must preserve the reporting denominator and distinguish missing data from zero.

**How to apply:** Preserve paired-input coverage, weighted aggregate rates, national-relative tier labels, age-band labels, and a no-data state in future GIS changes.

On the home map, keep the full U.S. overview visible at the initial mobile zoom. Zoom should enlarge the SVG so users can pan the overflow; only recenter on a selected state after the user changes selection or zoom.

**Why:** Centering the default selected state hid the national map on phones, and cropping the SVG viewBox made zoomed regions difficult to pan.

**How to apply:** Start at 100% with the whole map in view; scale the SVG dimensions for zoom and keep the selected-state focus independent of the metric color.

For the Home national map, keep the map, cards, and controls on white surfaces in every theme. The user's preferred default layer is Cardiac survival estimate. Use bright, discrete relative comparison bands for every map metric, and label the legend as relative quintiles. Direction remains metric-specific: counts show magnitude, while stronger cardiac-survival estimates or shorter transit are favorable. Preserve missing-data hatching and the independent selected-state outline. Avoid full-spectrum rainbow ramps.

Keep geographic backgrounds restrained; decorative grids, halos, and brightness/saturation filters must not compete with boundaries or alter the legend's data colors. Align the state map and preview at the top but bound the map viewport independently of the preview's source/place content.

**Why:** The user approved a less decorative map presentation. Stretching the map to match a narrow preview's full height pushed Florida below the laptop's first viewport despite passing a proportional geometry-fit check.

**How to apply:** Check actual loaded laptop screenshots as well as geometric fit; preserve readable preview widths and avoid forcing equal panel heights when content length differs.

**Why:** The user asked for a white U.S. map, cardiac survival as the main display, and brighter colors that clearly show how states compare.

**How to apply:** Start on cardiac survival, preserve other explicit saved selections, and use a distinct high-contrast five-band scale for each layer. Keep metric direction clear and do not treat missing records as zero.
