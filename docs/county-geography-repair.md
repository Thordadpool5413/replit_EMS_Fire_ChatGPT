# Canonical county geography repair

The county catalog and map assets now agree with the Census 2026 Gazetteer for all 50 states and D.C.: 3,144 unique county equivalents, with matching state codes, FIPS identifiers and canonical names. Illinois has 102 county polygons; Connecticut has nine current planning regions. The compressed public map asset is checked against the JSON asset used in audits.

Illinois and Connecticut geometries were rebuilt from Census 2025 1:500,000 cartographic boundaries, matched by official GEOID rather than relabeling the existing shapes. Topology-preserving simplification uses a 0.0005-degree tolerance. Existing geometries for other states are retained. Alaska county-equivalent names, New York borough aliases, Virginia county labels and other display aliases now have canonical Census names with prior labels retained as aliases. The source manifest records archive URLs and SHA-256 hashes.

The original eight Connecticut county records and their values remain in `src/data/ct-legacy-counties.json`. A 169-town crosswalk is built by matching official 2020 and 2025 Census town identities. A profile with an exact recorded town and a compatible legacy county can resolve to its current planning region. Original county name/FIPS remain on the profile as source fields, with the crosswalk basis visible in geographic links. This is a recorded-location candidate, not agency verification or a service-area assignment. Unknown towns, conflicting legacy counties and wrong-state FIPS do not select an arbitrary county or region.

New-region operational/demographic metrics remain null. They are not copied from legacy counties or converted to zero. Planning generators skip regions with unavailable inputs; existing named profiles remain accessible. All 169 current Connecticut towns appear in the region hierarchy using representative points from official town geometry, not inferred agency headquarters.

County normalization and identity resolution are used by equipment rollups, provider indexes, hierarchy mapping, source sanitization and curated ZIP locations. Independent cities remain distinct from same-named counties. Unmatched ZIP prefixes no longer select a state's first county. County metrics and SVG projection types now support unavailable values.

## Validation

- `node scripts/check-county-identities.mjs`: all 51 jurisdictions and 3,144 catalog/polygon identities match the frozen official reference; packed/public assets agree; coordinate/ring checks pass; nine current regions, 169 towns and eight archived counties are present.
- `node scripts/check-county-routing.mjs`: executes production hierarchy/provider/territory code against the actual bundled county and boundary bytes. It loads every state and projects all 3,144 counties, verifies Hartford and New York location resolution, and checks missing-region/ZIP fallbacks. Only Vite's asset-URL loading is adapted for Node; no agency, county or geometry fixtures replace production data.
- 225 frontend unit/component tests and five backend tests pass. Frontend/API/library type checks, stylesheet ownership and production build pass.
- Shapely validation found all 3,144 bundled geometries valid and nonempty. This validates topology, not the source vintage or exact border accuracy of retained states.

For a reproducible asset rebuild, install pyshp and shapely in a development environment, stage the four archives listed in `src/data/county-geography-manifest.json`, then run `python scripts/repair-county-geography.py --source-dir <archive-directory>` and both county checks. This does not write cloud agency records.

Live browser/device verification and Replit checkout/publication must be checked separately. Geography repair does not connect the separate bulk NPPES directory to operating agency profiles or establish national equipment completeness. End users still verify all profile facts.
