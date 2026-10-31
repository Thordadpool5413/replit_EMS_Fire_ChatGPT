---
name: County Medicare denial matching
description: Source and calculation rules for displaying Medicare claim-denial metrics by county.
---

For an actual county Medicare claim-denial rate, use a direct county-level report matched by the canonical five-digit county FIPS. Assign ambulance claims by pickup/service county, not the provider's billing or headquarters address. Define the unit (unique claims or claim lines) and decision point (initial or final after adjustment/appeal); keep those measures separate and use the same unit in numerator and denominator. For final claim-level rates, deduplicate adjustment/reversal transactions to one final disposition per claim. When raw counts are available, calculate denied claims divided by adjudicated claims for the same claim scope and reporting period. For any claim-count rollup, sum denied counts and divide by summed adjudicated counts only when scope and period match; never average ZIP percentages into a county claims rate.

The app must still display existing fixed ZIP- and provider-profile percentages for end-user review. Show one scalar per county view, selecting a county-seat ZIP profile first, then a listed primary ZIP, then the lowest ZIP code deterministically; display the selected ZIP and label the value as a ZIP profile, not a county claims rate. Display an individual provider's stored percentage as one scalar when present; identify it as a profile value unless claim-specific evidence supports a CMS label. Do not render ranges for county or provider values.

A claim-count denial percentage is not a denied-dollar percentage. Do not estimate denied dollars by multiplying billed dollars by a claim denial rate; use a reported denied-dollar amount for that same claim cohort.

**Why:** CMS Medicare Geographic Variation county data reports Medicare utilization and spending, not ambulance claim-denial counts. CMS Market Saturation & Utilization State-County includes ambulance paid-claim utilization (users, providers, and FFS beneficiaries), but no denied/adjudicated counts. Neither can produce a true county denial rate. The user wants existing profile percentages displayed as fixed values for end users to verify, while keeping them distinct from an actual county claims calculation.

**How to apply:** Show a true county claims rate only when its county-level measure and reporting scope are available. If only a ZIP profile exists, show one deterministic ZIP-profile percentage with its ZIP label; do not substitute it for the county rate. Keep provider profile percentages visible as single values. Calculate financial recovery only from reported denied-dollar amounts, not a count-based rate; never label Medicare payment or utilization metrics as denials.
