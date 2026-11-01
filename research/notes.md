# Research Notes: EMS & Fire Agency Data Sources

**Status:** complete
**Depth:** Standard

## Plan

- **Question:** Which APIs, MCP tools, and open datasets can materially improve this app's EMS/fire agency intelligence?
- **Scope:** U.S. national and state sources for identity, operations, clinical metrics, claims, hospitals, communications, grants, procurement, fleet, and GIS.
- **Audience:** Product and engineering
- **Deliverable:** Source comparison, match keys, coverage limits, recommended joins, and phased implementation priorities.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Provider identity and agency directories | done | 5 |
| 2 | EMS operations and clinical data | done | 4 |
| 3 | Medicare claims and denial-rate availability | done | 6 |
| 4 | Hospitals, STEMI, 911, and communications | done | 5 |
| 5 | Grants, procurement, fleet, and GIS | done | 10 |

## Coverage Checklist

- [x] Live sources: NPPES and OpenFEMA are connected; Google Maps renders/searches geography but is not an agency-data feed.
- [x] USFA NFDR, NERIS, NPPES, and selected state license records offer complementary identity data; no universal EMS/fire agency ID exists.
- [x] NERIS can support fire department/station geography and lagged fire incidents; public NEMSIS removes agency identifiers and cannot validate an individual agency.
- [x] Public CMS records do not support exact provider/county/state ambulance claim-denial rates; PSPS service-unit aggregates are a separate measure, while provider utilization is not denials.
- [x] CMS hospital rows, state trauma listings, and FCC PSAP records provide partial facility/dispatch context; no national STEMI destination, CAD/ePCR deployment, or agency routing feed was established.
- [x] OpenFEMA and USAspending reveal awards/federal procurement signals, not current installed equipment or comprehensive local contracts.
- [x] Join on source IDs and effective/reporting dates; retain separate identifiers and match confidence, and do not turn modeled context into an agency fact.

## Findings Log

### Provider identity and agency directories

- USFA NFDR offers national department CSVs, HQ fields, station counts/staffing, and a station-address file for departments that supplied it [@usfa-nfdr].
- FDID is assigned by states, so it is not globally unique; use state+FDID and keep separate NERIS department IDs and CMS NPI values [@usfa-nfdr] [@neris-layer-departments] [@cms-nppes-api].
- NPPES is a daily read-only NPI lookup, but CMS says NPI issuance does not verify licensure or credentialing [@cms-nppes-api].

### EMS operations and clinical data

- NERIS exposes department/station records with NERIS IDs, station address, unit count, and export dates; its public incident data are fire-service reports, not EMS transport totals [@neris-public] [@neris-layer-stations].
- NEMSIS 2025 public release contains large activation volume but strips agency, hospital, and reporting-state identities; NEMSIS public data cannot be joined to an individual app agency [@nemsis-public-release].
- Florida DOH says agency-submitted patient records are confidential; licensed providers access their own EMSTARS reports, while research access requires a data-use request [@florida-emstars-privacy].
- The public Florida licensed-provider PDF is processed 2020-10-23 despite its newer site path; do not treat it as a current statewide roster [@florida-ems-roster].

### Medicare claims and denial-rate availability

- CMS provider/service data can support historical Medicare service/use context by NPI, HCPCS, and place of service, but it is not a denial dataset or all-payer call volume [@cms-provider-service].
- The CMS PSPS record layout lists submitted and denied service counts and denied charges at carrier/pricing-locality, procedure, and specialty dimensions; it does not provide an NPI or county FIPS join. The fetched layout is dated 2015, so validate current schema before using any derived service-unit ratio [@cms-psps] [@cms-psps-record-layout].
- GADCS's Year 1–4 public report aggregates selected organizations and includes service volume/mix, vehicles, equipment, and cost benchmarks through data reported May 15, 2025; it is not a public provider-level record feed [@cms-gadcs-report] [@cms-gadcs-faq].
- CMS Geographic Variation is county/state Medicare use and spending, not ambulance denial counts [@cms-geographic-variation].

### Hospitals, STEMI, 911, and communications

- CMS Hospital General Information lists hospitals registered with Medicare and provides facility IDs, names, addresses, hospital type, ownership, and an emergency-services field; this does not establish STEMI/cath-lab capability or agency destination relationships [@cms-hospital-general].
- Florida DOH publishes trauma-center listings/maps, while the reviewed sources did not establish a structured nationwide STEMI-center or EMS destination feed [@florida-trauma].
- FCC's public PSAP registry has FCC IDs, name, state/county/city, change records, and per-record modification dates, but not jurisdiction boundaries or CAD/ePCR deployment details [@fcc-psap].

### Grants, procurement, fleet, and GIS

- OpenFEMA AFG is an existing annual award feed with award IDs, year, recipient/vendor text, and award amounts; awards are procurement leads, not proof of current equipment [@openfema-afg].
- FEMA's `vendorName` field identifies the grant recipient/awardee; it does not by itself identify the hardware supplier [@openfema-afg].
- USAspending offers federal award/contract APIs; state and local procurement remains fragmented and award descriptions need record-level matching [@usaspending-api].
- 2026 TIGER/Line boundaries and ACS 2025 estimates improve geographic context; ZCTAs are not postal ZIPs [@census-tigerline] [@census-acs-release] [@census-acs-5year].
- CDC PLACES and SVI can add modeled population-health and social-vulnerability context, not actual agency call counts or patient-level acuity [@cdc-places] [@cdc-svi].
- Google Maps MCP in this workspace exposes documentation tools only. Places/Geocoding can discover or position candidate facilities, Routes can estimate travel time, and boundary styling can show app-owned metrics; none verifies EMS operations or installed assets [@google-places-api] [@google-geocoding-api] [@google-routes-api] [@google-boundaries].

## Conflicts & Open Questions

- Public availability may differ by state; national completeness and agency-level access must be verified per source.
- A source record, map result, award, or dataset match is not automatically proof of the current operating agency or installed equipment.

## Gaps

- NERIS public product documentation differs on incident freshness: the public data catalog gives a 60-day incident lag, while the launch article describes updates multiple times per week. Read each layer's `dataLastEditDate` and incident timestamps at ingestion; do not hard-code a freshness promise [@neris-public] [@neris-launch].
- Florida's public EMS aggregate portal returned only a welcome page to the research fetch. Confirm which public aggregates and filters it exposes before treating it as an import source.
- The Florida licensed-provider roster is stale; identify whether the state portal has a stable, permitted machine-readable endpoint before designing an automated license sync.
- The PSPS layout evidence is dated 2015, and CMS's current data dictionary page did not expose its body through the research fetch. Validate current PSPS fields and suppression before shipping a service-unit metric.
