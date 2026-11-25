# ATLAS shared evidence on the Replit backend

Reviewed public-source evidence is stored in Replit PostgreSQL, separately from agency profiles and their private notes, contacts, pipeline, source attachments, and drafts. Agency browsing and profile records retain the existing no-sign-in access model. Replit Auth is required only for the reviewed-evidence workspace.

## Access and data boundaries

- The feature is disabled unless `VITE_ATLAS_EVIDENCE_ENABLED=true` and a valid `VITE_ATLAS_EVIDENCE_WORKSPACE_ID` are configured.
- Users sign in through the app's Replit Auth OIDC endpoints. The API checks Replit session identity and an existing `workspace_memberships` role; users cannot grant themselves a role.
- Public-source evidence is published explicitly by an editor and reviewed through append-only decisions. The evidence API is bounded and does not expose private agency notes, contacts, opportunity pipeline, drafts, or attachments.
- New Replit-authored evidence can be reviewed by a different mapped Replit member. A record whose imported author identity is unmapped cannot be approved until an administrator provides an explicit identity mapping. Unmapped historical decisions remain preserved but do not count as valid approval.
- The app does not infer current equipment, purchasing intent, or market share from an evidence record. Evidence does not automatically change agency profiles, scoring, county rollups, or map colors.

## Existing-record migration

The migration script accepts a versioned workspace or collection export. It defaults to dry-run; `--apply` is required for database writes. Imports are additive and transactional. Existing Replit records are never overwritten: identical rows are counted unchanged and conflicting rows are retained in `imported_legacy_records` for review.

Legacy membership, evidence-author, and decision-reviewer identities are not assumed to match Replit Auth user IDs. A role is activated only from an explicit `replitUserId` or an export record explicitly marked with `identityProvider: "replit"`. Evidence and decisions without that mapping are preserved with an unmapped status; approval is blocked until an administrator confirms identity correspondence.

No export has been supplied and no legacy records have been imported yet. The safe next step is to provide the export, inspect the dry-run counts and conflict report, then explicitly approve an additive import. Do not copy or upload credentials with the export.

## Verification still required

Automated tests cover input validation, duplicate/conflict handling, append-only decisions, revision checks, identity mapping safeguards, and Replit API behavior. Before enabling the workspace for users, verify Replit Auth on the deployed host, establish and review authorized workspace memberships, validate role boundaries with test accounts, and confirm the Replit database contains the expected migrated records. None of those checks has been represented as production-complete here.

## ATLAS capabilities retained from upstream

- **Evidence review and reconciliation:** Compare published source observations with typed local evidence without promoting the result to agency records, maps, scores, or claims of verified coverage. Incomplete pages, conflicting reads, invalid review history, and unavailable requests fail closed.
- **Review governance:** Keep publication and review roles separate. Decisions are append-only; reviewers cannot approve their own evidence. Challenges, withdrawals, and supersession block older evidence. Corrections use a new observation and an explicitly reviewed replacement chain.
- **Shared opportunity and equipment research:** Reviewed signals remain a bounded, short-lived research sample. The equipment view distinguishes ZOLL, other makers, mixed observations, no eligible observation, unavailable review, and not checked. It does not claim fleet ownership, nationwide market share, or complete county coverage.
- **Public funding and procurement discovery:** Keep source pages, retrieval time, record scope, and uncertainty visible. A discovered award is not available funding, installed equipment, or agency intent; ambiguous and unavailable results are not treated as negative findings.
- **Provider location and directory recovery:** Preserve source listings separately from saved agency records. A location is mapped only from a compatible, source-backed identity and address match; uncertain, conflicting, historical, or missing addresses remain unassigned rather than receiving guessed coordinates or county assignments. Public registry search remains available independently of saved-account requests.
- **End-user validation:** Imported and source-derived facts remain research references until the end user reviews the individual fact and its source. Missing information remains unknown; completing a task or seeing a registry listing does not validate agency information.

These notes retain the applicable upstream Phase 5 behavior while replacing its obsolete cloud provisioning instructions with the Replit access and storage model above. The complete upstream text remains available in Git history.
