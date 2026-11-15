# Agency workspace reliability

Agency information remains research material that the end user validates. Generated prospects remain available, but their origin is now explicit in profiles, directory cards, Data Health, and comparison exports.

## Implemented behavior

- New field-note IDs are no longer mistaken for demo notes. All four note-entry surfaces await saving, keep the form on failure, and display errors.
- Agency persistence retains full new records, all notes, same-count edits, contact dates, and all changed agencies. Storage errors never trigger truncation. Existing v8 records remain readable; legacy keys are no longer deleted on startup.
- Each stage, route, bookmark, note, new agency, and fact review is first written to a durable local change journal. The cloud worker retries on reconnect, periodically, and through the existing sync button. Acknowledged entries remain available for recovery; pending or failed entries are not silently cleared.
- Firestore transactions merge the changed fields against the latest agency record, deduplicate notes/reviews, increment a revision, and retain mutation receipts for idempotent retries. Conflicting fields remain queued. Field Work shows the cloud and proposed values and offers an explicit “Apply my change to this field” action. Transactions use the existing `agencies` collection and do not change database permissions.
- Web Locks serialize journal writes across supported browser tabs. Firestore transactions protect concurrent cloud updates. Browsers without Web Locks still have cloud conflict detection; simultaneous local-tab writes are not guaranteed there.
- Valid numeric corrections feed the active profile and scoring. Imported values remain separate and are restored before caching/uploading source records. A source refresh with a different original value requires a new review. Reviewed names are self-entered, not authenticated identities.
- Workspace export and restore include source records, fact-review history, equipment research, added agencies, notes, and the journal. Restore validates first, previews the backup, and rolls back storage writes on failure. Restored journal entries remain local-only rather than automatically overwriting cloud work.
- Unknown scoring inputs contribute zero, with no minimum score floor. Profiles show evidence coverage. Scores remain estimates, not independently validated purchasing recommendations.
- County preview identity persists when the pointer leaves the map to click the Open action. Hover styling remains separate.

## Verification

Run from the repository root:

```sh
pnpm run test:ems:unit
pnpm run test:ems:persistence
pnpm run typecheck
node --test scripts/pwa-worker.test.mjs scripts/check-theme-readability.test.mjs
PORT=24938 BASE_PATH=/ pnpm --filter @workspace/ems-territory-intelligence run build
```

The unit suite covers field-level conflict rejection, merging independent changes, idempotent notes/reviews, correction overlays, invalid corrections, source refresh, complete backup recovery, malformed imports, and quota rollback. The persistence regression script bundles the real baseline and storage service, checking 12 notes, same-count edits, 175 modified agencies, new records, 75 journal entries, quota failure, and generated provenance.

## Deployment verification still required

GitHub main is the delivery target for this change. Publishing the Replit application and live Firestore write permission checks are separate from building the repository. No database rules or live agency records were changed during development. Verify two-device cloud synchronization, conflict resolution, and physical iPhone offline reopening against the deployed app before marking those runtime checks complete. If Firestore rejects a transaction, the app retains the local change and shows the failure.

The local preview could not be reached by the available browser in this session; rendered interaction checks on this new build are not claimed. Browser storage and Firestore document limits still apply. Exceeding storage limits is an explicit failure, not a license to discard older work. Previously truncated history cannot be reconstructed without an older backup.
