# ATLAS: registry identity containment and source discovery

Both national and territory geographic generators previously created official-looking FDIDs and expiry dates without agency sources. This change stops those two generators, recognizes legacy generated records independently of verification labels, excludes synthetic IDs from identity matching, and requires mapped evidence for exact contract expiry. The existing per-state registry snapshot is exposed inside selected territory views with original USFA FDIDs and NPPES NPIs, not invented identifiers.

Saved account IDs, field notes, routes, bookmarks and user source associations are retained. Only uniquely confirmed existing source associations open a saved account. No automatic name matching or destructive identity migration. Generated records remain separately identified as prospects, not confirmed operating organizations.

## Scope and limitations
- Bundled national manifest: 47,671 source listings, including 27,117 USFA and 20,554 NPPES ambulance taxonomy organizations. These are source records, not unique operators.
- USFA data is historical. NPPES postal geography is not used to invent county assignments.
- No live Firestore migration or production database audit has occurred.
- Remaining: additional state EMS licensing adapters, live NERIS bulk ingestion, reviewed deduplication and reversible production identity migration, full operational-field lineage enforcement, registry refresh coverage for additional sources, and production/database verification.

## Source reconciliation and live directory
The national snapshot can be browsed by state and established county; unassigned source rows remain unassigned. Records without an official FDID have an internal location key solely for snapshot row identity. It is never an FDID or an identity association.
A user can explicitly link a source identity to a saved account after entering match evidence. Cross-state links, duplicate confirmed links and competing confirmed registry identities are rejected; no automatic merge or account ID rewrite occurs.
The read-only NERIS state directory retrieves the public department layer on request with caching and explicit errors. Its state/city scope does not establish county or operating status. NERIS, NPPES and FDID are distinct namespaces. State EMS office routes are manual references; direct provider lookup or directory references are mapped for Florida, Virginia, Massachusetts and Pennsylvania. Ohio has a separate staged agency-code roster. Nationwide licensing, historical account deduplication and operational fact backfill remain incomplete.
The automated national audit checks each bundled file against its manifest hash, validates record identity/row shape and reconciles source/state/county totals.

## Phase 2: Source-native accounts and state EMS roster
- Ohio: 1,520 agency listings with original agency codes, headquarters city and reported EMS service level, source update 2026-05-05 and retrieval 2026-11-24. Browse under Ohio in the public source directory. Codes are not licenses, NPIs or FDIDs. No county or service-area guesses; not all listings have a reported EMS service level. The snapshot omits chief names.
- Explicit create-account actions are available in the federal, Ohio and NERIS source views. NPI and NERIS identities are national; FDIDs and state agency codes are state-scoped. Native public identity persists with the account. Human-reviewed associations remain browser-local and can be exported. Candidate name matches block creation for manual review rather than merging records automatically. NPI checksums validate format only.
- Unknown values are represented as null or missing. Identity does not verify fleet, contracts, call counts, operations, licensure or equipment. PulseIQ factors require agency-level evidence for native accounts.
- Only explicitly saved source-native accounts with valid, canonical identifiers are eligible for bulk cloud sync (maximum 25), no fallback to modeled accounts. Individual field-work saves remain available. Duplicate create replay preserves newer records. County navigation remains read-only.
- Settings > Backup & restore includes a read-only loaded-account audit and JSON export for identifier conflicts, duplicate account IDs, candidate name matches and generated prospects. Scope is the browser's loaded accounts, not every production document. No merge, deletion, rekey or production migration is performed.
- Production Firestore access and Replit deployment are not verified; validate a protected backup, run loaded-data reconciliation against authorized production read access, and confirm live deployment separately.
