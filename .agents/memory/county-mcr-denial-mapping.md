---
name: County Medicare denial matching
description: Source and calculation rules for displaying Medicare claim-denial metrics by county.
---

For county Medicare claim-denial rates, use a direct county-level report matched by the canonical five-digit county FIPS. When raw counts are available, calculate denied claims divided by adjudicated claims for the same claim scope and reporting period. For any rollup, sum denied counts and divide by summed adjudicated counts only when scope and period match; do not average percentages or substitute state/ZIP values.

A claim-count denial percentage is not a denied-dollar percentage. Do not estimate denied dollars by multiplying billed dollars by a claim denial rate; use a reported denied-dollar amount for that same claim cohort.

**Why:** CMS Medicare Geographic Variation county data reports Medicare utilization and spending, not ambulance claim-denial counts, so it cannot produce a county denial rate. CMS's national ambulance improper-payment measure is a different metric and must not be presented as a denial rate.

**How to apply:** Show the rate as unavailable until a county-level denial measure exists. Keep the reporting period, source, and claim scope alongside any rate. Calculate financial recovery only from reported denied-dollar amounts, not a count-based rate; never label Medicare payment or utilization metrics as denials.
