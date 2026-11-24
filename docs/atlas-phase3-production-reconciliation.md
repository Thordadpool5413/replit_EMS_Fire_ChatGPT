# ATLAS Phase 3 — scoped production audit and research triage

## Production state observed on 2026-11-24
GitHub main was 940b8a84d4705043a0047192e3912811c67b1abe. Replit Agent reported local main 0b09024b298d3fec7f34491c19841ace304df758, clean, 1 ahead and 10 behind current remote. Latest recorded publication marker was 39fbfb800df776ab50997132bbcc36fcbbd11498, not independently confirmed serving SHA.

Do not force push, hard-reset or discard the local commit. Create a recoverable backup, fetch, inspect the local diff and merge remote changes, run tests, then push without force. Verify deployed version after publishing only when the final integrated commit is tested. The app has no established authenticated production audit scope and automatically retries pending writes, so it is not a read-only audit environment.

## Standalone read-only audit
An administrator must obtain approved Google ADC using an IAM principal with only the necessary read access and identify the exact project/database and agency document IDs. The code cannot establish or enforce the actual principal's IAM policy; authorization must be independently verified. No credentials belong in Git or this document.

Create a local private JSON file with projectId, databaseId, stateCode, authorizationReference and agencyIds (1–100 exact document IDs). Run from the repository root:
```
node scripts/audit-production-providers.mjs --scope approved-scope.json --out new-audit.json --confirm-read-only
```
The script does GET requests to specific document paths only, with field masks. It never lists or queries the collection, starts a listener, logs tokens, reads notes/contacts, or writes to Firestore. It fails on permission errors and refuses to overwrite a report. Results are limited to supplied IDs; export locally with restricted permissions; do not commit outputs. Cross-state results are identified but excluded from analysis. Duplicate identifiers are review candidates, not merge instructions.

No production request has been executed by this PR. Tests use simulated REST responses. A production audit requires approved account IDs and a separately authorized read-only principal. Backup and reconciliation remain human-reviewed.

## Research queue
Reports now includes a saved-work-first research queue for monitors, CPR, ventilation, ePCR, billing, actual contract vendor and expiration. Identity, category mapping, installed value, exact-value source record and local user review are distinct. Only source-reported facts with matching agency ID, category, exact normalized value, valid source link and valid entry timestamp receive a value-matched source label. That is not current equipment confirmation. Invalid dates, flagged facts, missing values and unsubstantiated records are prioritized. No automatic device inference or revenue prediction.

The existing competitive map remains a recorded-data view; this PR does not certify national market share, add source backfill, or relabel the map as independently verified. Existing source review and correction records remain intact.
