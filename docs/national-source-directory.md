# National registry coverage

The national map now loads a bundled source index automatically, independently of the cloud workspace profile count. A national source-listings shading layer and searchable state/county drilldown expose actual registry names, identifiers, source links and location evidence. County pages include a switch to review state listings that still need county assignment. No manual Settings import is required.

Snapshot totals verified by `node scripts/check-national-directory.mjs`:

- USFA: 27,117 source listings, including 15 outside the 50 states and D.C. The registry has retired updates, so this snapshot is not a current operating certification.
- NPPES: 20,554 ambulance taxonomy organization listings already bundled in the application; 19,567 fall within the 50 states and D.C.
- Combined: 46,669 source listings across all 50 states and D.C.; 1,002 additional listings elsewhere. These are listings, not deduplicated operating agencies. A fire department may also have one or more NPIs.
- Assigned listings occur in 3,087 of 3,144 current county equivalents. The remaining 57 county equivalents have no assigned listing in these snapshots; this does not establish the absence of operating agencies.
- 20,719 listings across all jurisdictions lack a supported current county assignment. The bundled NPPES extract supplies postal cities, not counties. No county is guessed from city/ZIP. USFA recorded counties are matched to current Census county identities, rejecting ambiguous matches. Compatible Connecticut towns use the official legacy county/current planning region crosswalk.

These sources do not establish equipment ownership, replacement dates, buying authority, current contacts or service areas. They never become synthetic `Agency` profiles or populate operational metrics. The equipment layer and cloud profiles retain their independent counts and evidence. Source listings are served as static state shards, with SHA-256 integrity checks, rather than generating tens of thousands of cloud writes.

Rebuild with `python scripts/build-national-source-directory.py /path/to/usfa.csv`, using the official CSV URL and source hash recorded in the generated index. The script reads the existing bundled NPPES shards and checks their hashes and row counts. The generated index includes per-state totals, county coverage and explicit gaps.
