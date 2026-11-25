# Agency action center and follow-ups

Delivered in Field Work and agency Activity:

- Existing interaction next actions automatically appear as follow-ups, with no migration or duplicate records.
- Open, overdue, today, upcoming, undated and completed filters; agency/action search; direct profile navigation.
- Complete, reopen and reschedule actions. Original interaction notes and contact date remain intact.
- Agency context includes last interaction, stage and recorded contacts. Completing a task never validates agency data.
- Profile overview selects the earliest dated open action, excluding completed actions. CSV exports include follow-up status.
- Updates use the existing durable local journal and Replit mutation API. Per-note conflict checks retain conflicting edits for review rather than replacing a newer agency record. Backup and recovery include queued changes through the existing journal.

Validation: 175 unit/component tests and 14 PWA/theme tests passed; TypeScript, persistence regression, stylesheet ownership and production build passed. Tests cover legacy notes, date buckets, completion, reopening, rescheduling, missing notes, retries, preservation of concurrent notes and conflict detection.

Limitations: physical-device and interactive browser validation remain outstanding. Replit reports a successful published Territory Intelligence deployment, but its deployed commit has not been independently confirmed. A GitHub push is not proof of deployment.
