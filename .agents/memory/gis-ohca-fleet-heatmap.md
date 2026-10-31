---
name: GIS OHCA rates and fleet aging
description: Calculation and display rules for the EMS territory map's OHCA rate and defibrillator-age layers.
---

The OHCA GIS metric is annual reported OHCA calls divided by annual reported 911 transports, multiplied by 1,000. Only agencies with both nonnegative values and a positive transport denominator qualify. State and territory rates use the ratio of summed matched calls to summed matched transports, not the simple average of agency rates. Relative tiers use national percentiles and must not be described as clinical acuity. Fleet age uses 0–4, 5–6, 7–9, and 10+ year bands; missing ages remain explicitly unreported.

Render every agency in the active geography/provider filter for heat and hex aggregation. Keep individual station markers optional at nationwide scale because dense point overlays obscure the surface.

**Why:** The user wants available information visible for end users to verify with the agency; calculations must preserve the reporting denominator and distinguish missing data from zero.

**How to apply:** Preserve paired-input coverage, weighted aggregate rates, national-relative tier labels, age-band labels, and a no-data state in future GIS changes.
