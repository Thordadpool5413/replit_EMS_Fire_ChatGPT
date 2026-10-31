---
name: Display available agency data
description: Product rule for showing EMS and fire agency information before end-user verification.
---

Display available data, information, and logic to the end user. The end user is responsible for verifying it directly with the account.

**Why:** the user requested that available information not be withheld pending verification.

**How to apply:** keep source references separate from data visibility; do not hide available values or calculations because their source has not been reviewed.

For missing agency metrics, show “Not reported” rather than substituting a typical or sample number. Preserve reported zero as a real value. Show an estimate only when its agency inputs and calculation method are visible.

**Why:** sample fallbacks can be mistaken for agency-reported facts and impair user review.

**How to apply:** use null-aware presence checks; label estimates, show their source inputs and formula, and never conflate absent data with zero.
