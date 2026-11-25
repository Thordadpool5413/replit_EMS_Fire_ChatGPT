# Replit record migration

The Replit API is the active agency-record source. The migration utility is additive and does not fetch data from the former provider.

## Prepare an export

In the current app, use **Data & system → Backup & recovery → Export workspace backup**. Keep the downloaded JSON private; it may include agency notes, follow-ups, source evidence, and saved drafts.

Place the export in the workspace without committing it. The importer accepts the app's `ems-workspace` version 1 backup and a versioned `ems-record-export` file.

## Review before import

Run the dry-run first. It validates the file and prints record counts only:

```bash
pnpm --filter @workspace/scripts run import:replit-records -- --file=/path/to/export.json
```

When the counts and source file are correct, add `--apply`:

```bash
pnpm --filter @workspace/scripts run import:replit-records -- --file=/path/to/export.json --apply
```

The importer:

- creates records that are not already in Replit storage;
- leaves exact duplicates unchanged;
- never overwrites an existing record with a different payload;
- preserves conflicting incoming records in the import archive for review;
- reports counts only and does not print record contents.

The import runs in a database transaction. A failed import is rolled back. The original export remains untouched and should be retained until the imported counts and records have been independently checked.
