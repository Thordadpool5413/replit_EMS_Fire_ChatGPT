# Phase 6.2G — facility identity reconciliation

A read-only CI queue now covers source-county disagreements, missing addresses, nonstandard/mailing addresses and other records explicitly requiring review. It preserves raw registry values, withheld match evidence and exact source identity. Existing accepted supplemental address research is separated from new unconfirmed research; the queue recommends a coordinate check for supplemental addresses, but neither changes the registry nor creates a map pin.

Two researched cases are recorded in a separate review-only file: Alvarado, MN (historical state guide, independent confirmation needed) and Humboldt, NE (historical inventory address conflicts with the city's clinic listing). PDF page images were unavailable; do not promote either to verified facility status. No new coordinates or operating-station claims. End-user validation mandatory. The facility-review JSON is produced alongside the nationwide gap audit in GitHub CI. No production database or deployment changes; Replit remains the only runtime backend.

The existing 138 source-county conflicts are the last confirmed baseline, not necessarily the number in future snapshots. Future work must independently confirm county and facility identity before replacing or displaying a conflicting location. Do not weaken the additive release gate to handle corrections.
