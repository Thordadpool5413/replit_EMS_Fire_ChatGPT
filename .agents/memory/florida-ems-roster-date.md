---
name: Florida EMS roster date mismatch
description: Freshness caution for the downloadable Florida DOH EMS provider roster.
---

The Florida DOH EMS provider page links a roster PDF whose URL path contains `/2025/08/`, while the PDF's embedded processed timestamp reads `10/23/2020`. Do not treat the URL path as the roster's effective date; use the individual MQA license record's “Data As Of” date for freshness.

**Why:** the roster's embedded timestamp conflicts with the apparent upload vintage, so a user could mistake an older list for current license status.

**How to apply:** when linking or ingesting Florida provider records, surface the license-level MQA result and its own data date; preserve the PDF timestamp as a warning until the discrepancy is resolved.
