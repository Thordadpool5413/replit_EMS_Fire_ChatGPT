---
name: Display available agency data
description: Product rule for showing EMS and fire agency information before end-user verification.
---

Map as much available EMS and fire agency data, information, logic, and API/source detail as possible. Display every available value—including estimates, generated prospect hypotheses, and candidate matches—so the end user can verify it directly with the account. Verification is the end user's responsibility; lack of confirmation or a mapped source must never block display or be framed as a warning.

**Why:** the user’s goal is comprehensive agency intelligence for end-user verification, not to treat every unverified value as wrong or suppress it.

**How to apply:** map each field to its source or API, agency-matching key, reporting period, refresh date, and calculation where available. Label whether a value is sourced, estimated, generated, or a candidate, and show its basis so users can assess it. Keep source references and verification state separate from data visibility; avoid “source needed” or “unverified” blockers. PulseIQ scores are estimates: show them even when inputs lack citations, use neutral estimate/source labels, and do not frame estimate status as a warning.

For missing agency metrics, show “Not reported” rather than substituting a typical or sample number. Preserve reported zero as a real value. Show an estimate only when its agency inputs and calculation method are visible.

**Why:** sample fallbacks can be mistaken for agency-reported facts and impair user review.

**How to apply:** use null-aware presence checks; label estimates, show their source inputs and formula, and never conflate absent data with zero.

For county-directory provider totals, count unique agency records only when their county association uses an exact native geography ID or an explicitly confirmed link. Never derive provider totals from city or ZIP counts; omit the total when the county match is not supported.

**Why:** a mapped-place count is not a provider count, and multiplying one by a constant presents fabricated coverage as a fact.

**How to apply:** keep place coverage and provider-record coverage separate, and label any displayed record count by its actual match scope.
