---
name: County Medicare denial matching
description: Source and calculation rules for displaying Medicare claim-denial metrics by county.
---

For this denial-rate data-acquisition effort: **“Public sources only.”**

**Why:** The user selected public sources only when choosing the data-access route.

**How to apply:** Research open APIs and public reports; do not request private billing-system credentials or provider authorization for this effort. Do not substitute private API integration or unsupported estimated rates for public evidence.

For an actual county Medicare claim-denial rate, use a direct county-level report matched by the canonical five-digit county FIPS. Assign ambulance claims by pickup/service county, not the provider's billing or headquarters address. Define the unit (unique claims or claim lines) and decision point (initial or final after adjustment/appeal); keep those measures separate and use the same unit in numerator and denominator. For final claim-level rates, deduplicate adjustment/reversal transactions to one final disposition per claim. When raw counts are available, calculate denied claims divided by adjudicated claims for the same claim scope and reporting period. For any claim-count rollup, sum denied counts and divide by summed adjudicated counts only when scope, period, and coverage match; never average percentages into a state or county claims rate.

The user wants available ZIP-profile values displayed for end users to verify, even when external URLs or reporting periods are absent. Show the exact value as a ZIP-profile value, label missing periods "Not stated," and do not imply it is an official state or county claim rate. Open a mapped source link when one exists; do not invent citations or dates.

Show ZIP-profile percentages as single scalar values with their scope and available details. A state profile summary may use an unweighted arithmetic mean only when every included value shares the same reporting period and claim scope; show the number and individual ZIP values. Label it as a ZIP-profile average, never as a claim-count-weighted state denial rate. Provider claim rates require provider-specific denied and adjudicated claim counts, matching scope and period, a valid billing NPI, and a source URL; derive the percentage rather than trusting a standalone scalar.

A claim-count denial percentage is not a denied-dollar percentage. Do not estimate denied dollars by multiplying billed dollars by a claim denial rate; use a reported denied-dollar amount for that same claim cohort.

For locally imported claim summaries, accept aggregate NPI × pickup-county counts only; do not upload raw 835/EOB or patient-level files. The user declined sign-in for shared claim data, so imported summaries stay in this browser and must not sync to Firestore. Require source name/reference, period, claim scope, and the report's denial definition; a public URL is optional for a user-supplied local report.

The user expects populated state, county, and individual-provider denial percentages. Do not describe a formula, importer, or display path alone as fixing missing percentages.

**Why:** The user repeatedly clarified that the remaining “Not published” output was not resolved by those changes.

**How to apply:** Separate calculation correctness from source-data availability in both work and completion reports. State explicitly which real geographic rates were populated and which remain unavailable.

Targeted medical-review classifications and error rates must not backfill population-level agency, county, or state claim-denial rates.

**Why:** First Coast's ambulance TPE publication reports minor/moderate/major classifications for selected reviews, not a complete geographically attributed claims denominator. Its ambulance-specific percentages can otherwise look like usable Florida denial rates in search results.

**How to apply:** Keep targeted-review findings as review context only; require the actual population claim counts and geographic/provider identifiers for a geographic rate.

**Why:** CMS PSPS publishes denied service-unit counts by carrier/locality, HCPCS, specialty, and place of service, but the public release suppresses cells under 11 and has no NPI or county FIPS; it cannot provide complete state, county, or individual-provider claim-denial rates. CMS Geographic Variation and Market Saturation & Utilization are use/spending or paid-claim datasets, not denial counts. The user also wants available profile values shown for their direct review rather than blocked by missing source metadata, and declined sign-in for sharing imported claim summaries.

**How to apply:** Show a true county rate only from same-scope, same-period claim counts assigned to pickup-county FIPS. A state claim rate requires complete state coverage and summed denied/adjudicated counts. Keep ZIP-profile averages and CMS service-unit statistics separately labeled; never substitute them for claim rates. Calculate financial recovery only from reported denied-dollar amounts, not a count-based rate. Keep imported counts browser-local unless the user later approves authentication and protected workspace storage.
