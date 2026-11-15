# Registry discovery and identity review

Built locally; delivered through GitHub main. No deployment.

- NPPES discovery retrieves bounded pages, deduplicates NPIs and detects repeated pages. A partial page ends retrieval; a capped, repeated or failed later page is explicitly incomplete. Earlier records survive a later-page failure. Initial errors remain unavailable, never empty results. Narrow the query for discovery beyond the cap; this is not a national bulk ingest.
- Lookup UI avoids pretending the retrieved-row count is the total source population.
- Settings includes loaded-record coverage, generated prospects, records without indexed identifiers, and shared-identifier review. Counts never imply national completeness.
- Read-only identity index uses NPI, state-scoped FDID/license and persisted source associations. Generated placeholder IDs and rejected associations are excluded. Confirmed associations retain review basis/date. Shared identifiers are flagged, never auto-merged, since parent and billing entities can legitimately be shared.
- Identity export includes all loaded links and conflicts; on-screen link list is bounded. Existing association persistence and backup remain the authority, avoiding an independent copy of decisions.

Validation: 187 unit/component tests and five backend tests passed before final build. Tests cover pagination, deduplication, repeated/capped pages, partial failure, cache recovery, state-scoped identifiers and rejected/generated associations. Type checks and both production builds are required before push.

Remaining: national bulk-file ingestion and incremental updates; complete optional-value migration of legacy generated metrics; persistent per-import accepted/rejected/changed counts and source freshness dashboard; deployed and rendered browser verification.
