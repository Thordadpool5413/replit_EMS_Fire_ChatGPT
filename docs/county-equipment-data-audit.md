# County-first equipment evidence audit

Repository data-path review. Runtime cloud audit results are excluded from this public document.

| Existing source | What it contains | What can be rolled up |
| --- | --- | --- |
| Frontend county catalog | 3,144 county equivalents, FIPS, state, places, demographics and activity figures | County/state geographic coverage; compatible sourced counts and weighted metrics |
| Replit `agency_records` | Runtime agency profiles | County-assigned recorded products and manufacturer references |
| Bundled named profiles plus cloud profiles | Deduplicated directory IDs with county assignments | Recorded-profile penetration, not a statewide census |
| USFA / NERIS backend adapters | Department identity, county/address, stations and general units | Agency identity and location; these responses do not contain monitor/CPR manufacturer inventory |
| NPPES snapshot / backend adapter | Ambulance taxonomy organizations and provider identity | Candidate organization directory, not installed equipment |
| Generated geographic prospects | Brands and lifecycle values selected by deterministic rules in the prospect generators | Planning estimates only; not installed market share |

`nationalProviderDatabase.ts` selects monitor brands using a hash-derived value. `territoryIntelligenceEngine.ts` also derives monitor, CPR and ventilator selections from deterministic rules. `dataLineageManifest.ts` describes unsupported equipment as modeled estimates. Aggregating these assignments would produce a modeled scenario, not observed ZOLL or competitor market share.

The existing county-first aggregator indexes every county, assigns each eligible directory ID to one recorded county, and sums county summaries into states. Service areas do not create duplicate equipment records. Unresolved locations remain unassigned. Generated profiles without substantive equipment evidence or verified identities are excluded.

This update adds category-specific recorded ZOLL penetration and the leading recorded competitor to state/county summaries. Percentages use county-assigned loaded profiles and include a clear denominator. Mixed agencies may appear under both vendor penetration figures. No cross-category percentage is shown when “All product categories” is selected. Complete statewide market share remains unestablished. Product-specific source evidence counts now exclude other equipment categories.

The national and county equipment modes now activate consistently when a product category alone is selected, rather than leaving the county view on FEMA risk colors. Both use the same bright warm equipment palette.

Reproduce the report with `node scripts/audit-equipment-states.mjs --cloud agency-snapshot.json --county-cloud county-snapshot.json --out report.json`. The report omits agency names and contacts. It documents snapshot dates, source scope, all 51 jurisdiction summaries and all 3,144 indexed county equivalents. Browser-only corrections are outside its scope.
