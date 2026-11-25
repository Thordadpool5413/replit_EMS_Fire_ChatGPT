# Equipment map geography and layout repair

The national map now has a dedicated, independently scrolling control rail. Filter, legend, hover/selected-state preview, and small-state shortcuts are siblings in that rail instead of competing for separately calculated grid rows. The map retains its own viewport; the preview uses normal flow, not an overlapping position.

Equipment filters now use explicit equipment colors on national state polygons and statewide county polygons. Teal means selected ZOLL matches; amber competitor matches; purple mixed matches; slate unknown-only/unknown-match coverage; pale means no selected match recorded among loaded records; dark means no loaded records. The ordinary count-scale legend is replaced while equipment filtering is active. FEMA risk colors and legend resume when the equipment filter is cleared.

A nationwide index initializes every bundled state and county, including areas with no loaded records. State names and codes are normalized. County links use a valid FIPS within the correct state, or a unique normalized county name within that state. Invalid/wrong-state FIPS are counted as conflicts and never replaced by a guessed county. Unresolved geography is reported, not silently assigned to a first county. County previews and national previews expose equipment matches/unknowns.

Coverage is computed from loaded agency records. Generated or missing equipment is not converted into observed ownership. A complete geographic index does not establish complete national equipment data. The small number of recognized vendor records in the supplied screenshots indicates limited recorded product information; assigning vendor tags to the remaining agencies without sources would invent facts. Linked addresses and county tags represent recorded location, not service-area boundaries.

Validation includes a test that indexes every county in the bundled national county database with synthetic FIPS fixtures (explicitly test fixtures, not production equipment), classification/geography conflict tests, full unit suite, type checks, style checks and production build. Browser/physical-device rendering remains unverified because local Chromium cannot start under the environment's socket restriction.

## Existing-data loading repair

A fresh national view now reads the Replit agency API in stable, cursor-based pages. One shared loader serves the app session, so selecting states/counties or remounting a map does not restart the national scan. Partial reads retain existing records, display loading/unavailable status, and offer retry from the failed page. Connectivity reflects successful reads from the actual agency endpoint.

Replit-backed and bundled records feed the same agency state used by national, county, location and fleet views. Late national pages cannot overwrite a newer backend revision. Nested equipment fields, local source attachments, pending changes and fact-review overlays are retained by the reconciliation path. Agency IDs are preserved by the Replit API.

Recorded equipment recognition now includes the existing alternate `fleet.currentDefibVendor`, `currentCprDevice`, `currentVentilator`, `currentEpcrVendor`, and `currentCadVendor` fields alongside `installedFleet`. Identical product strings do not duplicate breakdown rows. Generated fields remain excluded unless mapped evidence exists; end users still confirm current use. The imported-directory adapter no longer inserts a CentralSquare CAD supplier where none was provided.

County equipment colors and vendor breakdowns now honor the selected EMS/fire provider scope, matching the national view. Equipment selectors mounted together share changes immediately. National directory status no longer reports ready before the cloud read completes.

Validation: 221 unit tests pass, including fresh-session pagination, shared reads/remounts, failure/retry, late revision protection, alternate equipment formats and reconciliation of the actual bundled agency catalog against all bundled county boundaries for all five product scopes. Frontend type checking, style ownership and production build pass. This establishes code behavior and bundled-data rollups, not the production database's record count or completeness. Interactive visual verification and direct live-cloud inspection remain unverified: Chromium cannot start in this environment (`socket() failed: Operation not permitted`). GitHub delivery and Replit publication remain separate.
