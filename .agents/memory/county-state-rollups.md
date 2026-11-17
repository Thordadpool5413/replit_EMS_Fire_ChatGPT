---
name: County-to-state rollups
description: Rules for combining county-level EMS, fire, equipment, demographic, and risk information into state summaries.
---

Use unique county FIPS as the aggregation key. Keep agency assignment county distinct from documented multi-county service areas so an agency or device is counted once in a state rollup. Every metric must retain its source, geography, and reporting vintage; show county coverage alongside totals, and leave missing values missing rather than interpreting them as zero or absence.

For additive counts such as population, sum county estimates. For a population share, sum the numerator and denominator first, then divide (for example, residents age 65+ divided by total population). For poverty rate, sum people below poverty and the poverty-status universe before dividing. Median household income cannot be summed or averaged into a true state median; a median of county medians must be labeled as such.

**Why:** The user specified that county records are the foundation for state summaries, requested all source-backed county metrics, and requires missing county information to remain “not reported.” Existing county EMS reference figures do not have per-figure source metadata and must not be promoted to sourced state totals.

**How to apply:** Join source records to the current county geography by exact FIPS, count each county once, withhold statewide map fills when required county coverage is incomplete, and explain the formula and source vintage in the state and county views.
