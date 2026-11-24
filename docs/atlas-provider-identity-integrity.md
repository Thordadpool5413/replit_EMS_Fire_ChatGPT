# ATLAS: registry identity containment and source discovery

Both national and territory geographic generators previously created official-looking FDIDs and expiry dates without agency sources. This change stops those two generators, recognizes legacy generated records independently of verification labels, excludes synthetic IDs from identity matching, and requires mapped evidence for exact contract expiry. The existing per-state registry snapshot is exposed inside selected territory views with original USFA FDIDs and NPPES NPIs, not invented identifiers.

Saved account IDs, field notes, routes, bookmarks and user source associations are retained. Only uniquely confirmed existing source associations open a saved account. No automatic name matching or destructive identity migration. Generated records remain separately identified as prospects, not confirmed operating organizations.

## Scope and limitations
- Bundled national manifest: 47,671 source listings, including 27,117 USFA and 20,554 NPPES ambulance taxonomy organizations. These are source records, not unique operators.
- USFA data is historical. NPPES postal geography is not used to invent county assignments.
- No live Firestore migration or production database audit has occurred.
- Remaining: state EMS licensing adapters, live NERIS bulk ingestion, source-native account creation, reviewed deduplication and reversible identity migration, full operational-field lineage enforcement, registry refresh, and production/database verification.

## Source reconciliation and live directory
The national snapshot can be browsed by state and established county; unassigned source rows remain unassigned. Records without an official FDID have an internal location key solely for snapshot row identity. It is never an FDID or an identity association.
A user can explicitly link a source identity to a saved account after entering match evidence. Cross-state links, duplicate confirmed links and competing confirmed registry identities are rejected; no automatic merge or account ID rewrite occurs.
The read-only NERIS state directory retrieves the public department layer on request with caching and explicit errors. Its state/city scope does not establish county or operating status. NERIS, NPPES and FDID are distinct namespaces. State EMS office routes are manual references; only Florida and Virginia license search links are directly mapped. Nationwide licensing, historical account deduplication and operational fact backfill remain incomplete.
The automated national audit checks each bundled file against its manifest hash, validates record identity/row shape and reconciles source/state/county totals.
