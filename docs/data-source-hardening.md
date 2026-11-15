# Data-source hardening

Implemented locally on the latest main:
- NPI name similarity produces a possible relationship, never automatic operating-relationship confirmation.
- Individual NPI lookups use a same-origin backend endpoint with timeout and upstream error validation.
- NPPES search rejects application-error/malformed payloads and flags a full 50-record result page as potentially truncated.
- Fire-registry refresh failures retain the last successful cache snapshot, preserve its retrieval date, report cached-source refresh failure and apply a retry cooldown. No prior snapshot still produces an error.
- Removed generated last-contact dates and the import fallback that manufactured hospital transports from 88% of annual transports.
- Generated prospects do not qualify as populated fact evidence solely because calculated fields exist. Profile overview and field badges identify generated estimates; user access is retained.

Validation: 185 frontend unit/component tests plus two backend cache tests passed. Workspace type checks and frontend/backend production builds run before delivery.

Remaining work: replacing the legacy generated-number schema with explicit optional estimates throughout every consumer, bulk NPPES pagination, persistent cross-source identity crosswalks, and comprehensive import-quality dashboards. This change flags capped results rather than claiming completeness. No live upstream outage test, deployed test, or visual browser verification is claimed. No Replit changes or deployment were requested for this release.
