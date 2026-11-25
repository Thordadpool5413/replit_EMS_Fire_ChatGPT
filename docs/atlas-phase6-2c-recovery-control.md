# Phase 6.2C — nationwide mapping recovery control

The gap audit reads only the verified public registry snapshot and generates state/county priorities, source breakdowns, deduplicated physical-address query targets, raw versus usable mapped counts, and separately withheld source-county conflicts. It does not create records or call external services. A configured regional adapter is not a guarantee of available or complete source coverage. The report is produced in GitHub CI on relevant changes.

Before releasing an independently recovered data candidate, run the additive release gate against the current main snapshot and the candidate snapshot, both with the same registry inputs. It rejects changes to provider identities, addresses, existing coordinates, historical/review records and newly conflicting county matches. Only no-match/unavailable/pending records may advance to mapped. Candidate conflicts should be reconciled separately against authoritative sources; do not overwrite main with an older branch. Run full CI again after integrating approved data. Existing legacy Census county conflicts remain withheld.

Baseline at implementation: 46,791 supported source identities, 30,137 raw mapped, 14,073 no-match. These counts are not unique active stations. No new coordinates are asserted in this change. Replit remains the sole application backend, and end-user field confirmation is still required. No production data or deployment changes.

Run: python3 scripts/data/audit_location_gaps.py
Release gate: python3 scripts/data/check_additive_location_release.py --base /path/to/current/locations --candidate /path/to/candidate/locations
