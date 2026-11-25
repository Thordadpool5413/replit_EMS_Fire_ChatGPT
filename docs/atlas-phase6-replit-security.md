# Phase 6.1 — Replit saved agency security

The backend is Replit Auth, the Replit API and PostgreSQL. GitHub main is the code source of truth. Public source registry search remains independent of saved private agency records.

## Deployment setup (required before rollout)

- In the Replit deployment environment configure `ATLAS_PUBLIC_ORIGIN` as the exact HTTPS origin of the app (no path).
- Set `ATLAS_AGENCY_EDITOR_IDS` to comma-separated exact Replit Auth subject IDs of authorized editors; set `ATLAS_AGENCY_VIEWER_IDS` for read-only users. Empty or missing lists deny all access. Do not substitute email, usernames, legacy Firebase UIDs or guessed IDs. No self-enrollment. These are server-only settings, never VITE variables.
- A signed-in account can see its Replit account ID in the desktop Help & sources / mobile Workspace tools menu if access is denied. An administrator must verify the identity and configure access.
- The deployment uses one shared private agency dataset, not separate tenant databases. Everyone granted access can read the same saved accounts. Do not authorize unrelated users. Shared evidence keeps its separate existing role system.
- Back up/export existing records privately before rollout. Do not delete local backups, migrate old identities automatically, change production schema or apply destructive database operations.
- In Replit, inspect dirty state and divergence, preserve recovery copies, and integrate the reviewed GitHub commit without force push or discarding work. Check the deployed commit after publishing.

## Acceptance

Anonymous and unauthorized sessions cannot list, read, update, mutate or batch-create saved accounts. Viewers cannot write; editors can write only through existing revision and mutation receipt checks. Known modeled provider origins are rejected on writes. Cross-origin private requests are denied; authenticated responses are not cacheable. CI uses an isolated PostgreSQL container and test-only sessions, never production records. Local offline recovery remains intentionally retained on the device; this release is not a multi-user device cache isolation mechanism. Use a trusted device, and do not share browser profiles.

After CI passes, verify production sign-in, correct user ID grants, authorized read, save and reload on two devices, and public provider search while signed out. Use a separately designated staging record for write tests; do not insert mock providers into production. Do not declare deployment complete until checked in Replit.
