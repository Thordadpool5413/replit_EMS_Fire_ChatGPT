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

For the home map's Shade states by layers, use a cohesive, vivid green–yellow–orange–red ramp, with direction chosen by metric: red for higher inventory/priority values or unfavorable values, and green for favorable values such as stronger cardiac-survival estimates or shorter transit. Raw inventory counts are magnitudes, not quality scores; keep the legend explicit. Preserve missing-data hatching and the independent selected-state outline. Avoid full-spectrum rainbow ramps.

**Why:** The user wants vibrant red-for-high and green-for-good shading, and rejected a full-spectrum rainbow as visually unimpressive.

**How to apply:** Recheck palette direction against the metric meaning whenever a map layer is added or its values are redefined.
