---
name: Display available agency data
description: Product rule for showing EMS and fire agency information before end-user verification.
---

Map as much available EMS and fire agency data, information, logic, and API/source detail as possible. Display available values—including estimates and generated prospect hypotheses—so the end user can verify them directly with the account; do not hide a value only because it is unverified or has no mapped source.

**Why:** the user’s goal is comprehensive agency intelligence for end-user verification, not to treat every unverified value as wrong or suppress it.

**How to apply:** map each field to its source or API, agency-matching key, reporting period, refresh date, and calculation where available. Label whether a value is sourced, estimated, or generated, and show its basis so users can assess it. Keep source references separate from data visibility.

For missing agency metrics, show “Not reported” rather than substituting a typical or sample number. Preserve reported zero as a real value. Show an estimate only when its agency inputs and calculation method are visible.

**Why:** sample fallbacks can be mistaken for agency-reported facts and impair user review.

**How to apply:** use null-aware presence checks; label estimates, show their source inputs and formula, and never conflate absent data with zero.
