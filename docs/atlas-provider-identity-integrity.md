# ATLAS: registry identity containment and source discovery

Both national and territory geographic generators previously created official-looking FDIDs and expiry dates without agency sources. This change stops those two generators, recognizes legacy generated records independently of verification labels, excludes synthetic IDs from identity matching, and requires mapped evidence for exact contract expiry. The existing per-state registry snapshot is exposed inside selected territory views with original USFA FDIDs and NPPES NPIs, not invented identifiers.

Saved account IDs, field notes, routes, bookmarks and user source associations are retained. Only uniquely confirmed existing source associations open a saved account. No automatic name matching or destructive identity migration. Generated records remain separately identified as prospects, not confirmed operating organizations.

## Scope and limitations
- Bundled national manifest: 47,671 source listings, including 27,117 USFA and 20,554 NPPES ambulance taxonomy organizations. These are source records, not unique operators.
- USFA data is historical. NPPES postal geography is not used to invent county assignments.
- No live Firestore migration or production database audit has occurred.
- Remaining: state EMS licensing adapters, live NERIS bulk ingestion, source-native account creation, reviewed deduplication and reversible identity migration, full operational-field lineage enforcement, registry refresh, and production/database verification.
