# Phase 6.6H — Production release gates

**Not production approval.** GitHub is the source of truth; Replit sync and release are operator-controlled. No live database or deployment has been modified.

## Before release

- Require green CI for the exact main commit, including provider snapshot validation, unit/type/build checks, PWA and responsive checks, disposable PostgreSQL permission and client integration tests.
- Preserve uncommitted Replit work and record the currently deployed commit. Back up PostgreSQL and verify restoration in a separate staging database. Export private workspace data separately and retain local drafts.
- Review the additive `working_pipeline` and `working_pipeline_history` schema changes, plus the `provider_source_snapshots` table used for private inventory, purchasing and aggregate claims. The post-merge hook now installs dependencies only: it must not apply schema changes automatically.
- In the intended Replit environment run `node scripts/check-release-config.mjs`. It checks required configuration presence and exact HTTPS origin; it does not print secret values, verify credentials or establish actual user identity.
- Review Drizzle's proposed changes against a restored/staging database first. Only after backup and explicit approval, run `pnpm --filter @workspace/db run push` against the intended database. Do not use push-force in production. Stop on any destructive change or unexpected schema diff.
- Deploy reviewed code. Check `/api/healthz` (liveness) and `/api/readyz` (database connectivity and required saved-agency, session, pipeline and provider source schema columns). Readiness returns only ready/unavailable, with a bounded response and no record contents; it is not an all-feature audit.

## Live acceptance, operator sign-off required

- Signed-out public registry browsing; denied private API; exact editor/viewer grants; real Replit OIDC sign-in and sign-out.
- Real mobile and desktop profiles, maps, addresses and controls; distinguish source address matches from operational station confirmation.
- Authorized editor saves a genuine, designated staging opportunity after validation; second browser reloads; viewer cannot edit; stale revision rejected; CRM unchanged; leadership and analytics reconcile.
- Check offline/online recovery, workspace sync indicators and browser reload; local drafts are never automatically uploaded. No synthetic provider records in production.
- Verify production monitoring, database backup and restore evidence, and a rollback rehearsal. Record acceptance by commit, environment, tester, date and outcome. Any failed gate blocks rollout.

## Rollback

Stop new writes and preserve logs without secrets. Roll back application to previously recorded good commit using Replit's normal deployment process. Additive tables may remain; do not drop them or blindly restore over later user changes. If database restoration is required, use an isolated recovery database and reconcile newer writes with the owner before switching. Do not force-push or discard local data.

## Known limitations

The committed national snapshot contains 30,379 raw mapped records of 46,791 source records (64.92%), including 138 existing county conflicts (30,241 usable without those conflicts, 64.63%). This is source-record coverage, not unique departments or verified station locations. 13,831 potentially recoverable physical-address records remain. End-user validation remains mandatory. Shared pipeline supports one working record per saved provider and existing shared-workspace roles, not multi-tenant or manager-specific territory isolation. Live device acceptance, OIDC and actual migration are not established by CI. No claim of production readiness until sign-off.

