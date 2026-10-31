---
name: County Medicare denial matching
description: Source and calculation rules for displaying Medicare claim-denial metrics by county.
---

For county Medicare claim-denial rates, use a direct county-level report matched by the canonical five-digit county FIPS. When raw counts are available, calculate denied claims divided by adjudicated claims for the same claim scope and reporting period. Do not average county percentages or substitute state/ZIP values.

**Why:** CMS Medicare Geographic Variation county data reports Medicare utilization and spending, not ambulance claim-denial counts, so it cannot produce a county denial rate.

**How to apply:** Show the rate as unavailable until a county-level denial measure exists. Keep the reporting period and source alongside any rate, and do not label Medicare payment or utilization metrics as denials.
