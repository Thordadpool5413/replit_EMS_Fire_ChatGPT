# EMS & Fire Territory Intelligence — Data Source and Logic Map

**Audit date:** 2026-11-01
**Scope:** Code-path audit of the app and its API server. This maps what the code loads, requests, stores, and derives. It does **not** independently confirm that an agency fact is correct at its source. The app's purpose is to give users the available information and let them verify it directly with the account.

## Executive summary

The app contains five materially different kinds of information:

1. **Live public registry results:** CMS NPPES identity lookups and OpenFEMA AFG award records.
2. **Bundled reference data:** county geography, ZIP/city records, state summaries, and selected agency-directory entries.
3. **Saved agency records:** Firestore records when configured, plus browser-local saved verification patches and notes.
4. **User-imported claim summaries:** aggregate claim counts entered through the Medicare denial import flow; currently stored in this browser's `localStorage`, not shared across users or devices.
5. **Generated or modeled prospect values:** agency names, locations, equipment, vendors, volumes, hospital destinations, payer mix, and opportunity estimates generated from geography and deterministic formulas.

A source being listed in the app's lineage catalog does not mean the app currently fetches it. In the inspected application, NEMSIS, USFA, CMS claims-denial data, hospital destination relationships, procurement/contract records, and current vendor inventories do not have a live data ingestion path.

**Important display rule:** values can remain visible for the end user to investigate. Their type and basis should remain clear: live registry result, bundled reference, user-entered, derived, or generated hypothesis. “Generated” and “not source-checked” describe provenance; they do not need to block a user from viewing the value.

## Active integrations and local persistence

| System | What the code does | Match key and freshness | What it does not prove |
|---|---|---|---|
| **CMS NPPES API** — `https://npiregistry.cms.hhs.gov/api/` | Live lookup by exact NPI, or search by organization name with optional city and state. The app calls NPPES v2.1. The API server exposes `POST /api/providers/verify-live`; the client also has a direct lookup path in `npiVerificationService.ts`. | Exact NPI is the strongest lookup key. Name/city/state is a candidate search and must be matched to the operating agency. NPPES `basic.last_updated` is the record's update date. | NPPES enrollment does not establish that the listed entity operates a particular fire/EMS department, is its purchasing authority, or that an authorized official is its current fire chief or EMS director. NPI-1 individuals must not be mistaken for an agency. |
| **OpenFEMA AFG API** — `https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants` | Live GET through `GET /api/fema/afg-grants`. The server filters program name to Assistance to Firefighters Grants, optionally filters by state, optionally searches text in the grantee name, sorts fiscal year descending, and caps the limit at 100. The app's all-states selection omits the state filter and requests up to 20 records. | State code plus optional grantee-name text. The response's `fetchedAt` is when this app queried the API; `programYear` is the award's fiscal/program year when supplied. | The public result does not provide a reliable agency-ID crosswalk or city-level match. An award does not prove that equipment is currently installed, still in service, or purchased by the specific operating department. |
| **Google Maps JavaScript API** | `GoogleMapsTerritoryExplorer.tsx` loads the Maps JavaScript API using `VITE_GOOGLE_MAPS_API_KEY`, with an optional browser `localStorage` key. | Coordinates and place/map requests used by the map experience. | This is a mapping/geography service, not the source of EMS agency leadership, apparatus, call volume, vendors, contracts, or claims. A map result or search link is not an agency fact verification. |
| **Firestore** | `utils/firebase.ts` defines `agencies`, `counties`, `field_notes`, and `user_preferences` collections. Agency records can be read and written; writes add `_updatedAt` or `_syncedAt`. | App agency ID and the record's state/county fields; `_updatedAt`/`_syncedAt` are storage timestamps, not source dates. Field-specific `AgencyFactEvidence` can hold a source URL, source record ID, reporting period, review status, and review date. | A cloud-synced record is not automatically externally verified. Storage timestamps do not show when the underlying fact was true. Access/sharing depends on Firebase configuration and rules, which this code audit does not verify. |
| **Browser storage** | Verification patches and some user-entered data are saved in browser storage. The denial import summary is stored in `localStorage`. | Browser profile/device, not an authoritative agency identifier. | It is not workspace-wide sharing. Imported claim summaries do not become visible to other users or devices through this implementation. |
| **Google Maps Platform MCP** | A Maps MCP integration is available in the workspace, but no app ingestion path was found that uses MCP results as the agency data feed. | Not applicable to persisted agency records. | Its presence in the workspace is not evidence that an agency field was obtained or verified through MCP. |

### Runtime check during this audit

The API server health endpoint returned HTTP 200. A live Florida OpenFEMA request through `/api/fema/afg-grants?stateCode=FL&limit=1` also returned HTTP 200 and a grant record. In that response, `awardDate` was null; the app should display “date not provided” for that record rather than infer a date. This check verifies that the route and public API responded at the time of the audit, not that every award is matched to the correct local agency.

## Field-by-field map

| Data shown or requested | Current source/path and logic | Match key, date, and interpretation |
|---|---|---|
| **Agency identity, provider address, NPI** | Seeded directory entries and saved agency records; optional live NPPES lookup by NPI or organization name/city/state. `npiVerificationService.ts` checks NPI format/check digit and examines NPI entity type, legal name, addresses, taxonomy, and authorized official. | NPI is a registry identifier, not a department identifier. Confirm NPI Type 2, legal name, location address, and operating relationship. Use NPPES `last_updated` for registry freshness. |
| **FDID and department registry identity** | FDID fields and USFA references exist in the app's data model/lineage catalog. No live USFA department-registry API fetch was found. Generated prospects can receive a hash-derived FDID. | A generated FDID is not a valid USFA identifier. Verify against an actual department/USFA record and retain that record's ID and date. |
| **Agency leadership and decision makers** | Selected bundled contacts, Firestore/user-entered evidence, and NPPES authorized-official data. Generated prospects may also be assigned placeholder contacts. | NPPES authorized official is not necessarily operational command or purchasing authority. Confirm name, title, role, active dates, and source directly against an agency roster or account. |
| **Stations, frontline apparatus, fleet breakdown, annual calls/transports** | County/city geography and population inputs feed deterministic prospect-generation formulas in `nationalProviderDatabase.ts` and `territoryIntelligenceEngine.ts`. Selected source-backed records can override generated values. | County/city names and app IDs are used to place prospects; these are not one-to-one operating-agency identifiers. Population-derived quantities are estimates, not observed agency counts or CAD totals. No live nationwide apparatus or call-volume feed was found. |
| **Active defibrillator, biomedical fleet, age, warranty, maintenance** | Generated brand, unit-count, age, and warranty assumptions are calculated from a deterministic hash and population; records can also hold user-entered/source evidence. | Exact model names and unit counts in a generated prospect are hypotheses, not inventory records. Verify serial/model, asset tag, in-service status, warranty, and maintenance contract with the department. No live asset-management feed was found. |
| **Receiving hospital, STEMI/cath lab logistics, transport relationship** | County/reference geography and generated prospect logic; some records have agency-level GIS fields. A generated hospital name may be composed from the city, and destination-transport share can be calculated from a fixed factor. | A nearby hospital or cath lab does not prove the agency transports there, has an EMS destination agreement, or activates STEMI there. No live hospital-routing or agency destination feed was found. |
| **Emergency communications, 911 CAD, ePCR** | Vendor fields may be present in imported records; generated prospects choose vendor names from fixed lists. No live CAD/ePCR product or procurement API was found. | Do not interpret a populated vendor field as a current contract or installed system without account evidence, contract/source ID, and effective dates. |
| **Suppliers, verified hardware, maintenance/procurement contracts** | The model contains contract and vendor fields, but the nationwide prospect-building path can fill these from assumptions. Source-catalog entries for cooperative purchasing organizations are not a live contract ingestion. | A cooperative purchasing vehicle is not proof of a particular agency purchase. Verify award/contract number, buyer, vendor, item, term, amendments, and current status. |
| **Operational volume and contract records** | Evidence keys and lineage fields support attaching source records, but generated baseline volumes and contracts also exist. | Preserve the reporting period and scope: agency vs. county, calls received vs. transports, and active vs. historical contract. Do not combine unlike scopes. |
| **Medicare claim-denial rate by provider** | No live CMS ambulance-denial API or public denial-count feed was found. The supported exact path is the authorized aggregate import flow. | Group by NPI, pickup-county FIPS, claim scope, denial definition, and reporting period. Formula: `100 × sum(denied claims) / sum(adjudicated claims)`. Do not average rates. A zero denominator or incomplete/mismatched scope yields unavailable, not 0%. |
| **County Medicare claim-denial rate** | Same imported claim-summary data, grouped by pickup-county FIPS. CMS geographic use/spending data and Medicare Ground Ambulance PUF references do not supply the denied/adjudicated ambulance claim counts needed for this calculation. | Use exact five-digit county FIPS and same-period/same-definition counts. County of provider address is not a substitute for pickup county. Do not infer a county rate from ZIP-profile values. |
| **State Medicare claim-denial rate** | Same imported claim summaries, rolled up from compatible county/provider counts only when coverage is complete for the required state geography. | Aggregate counts first, then divide. Do not average county or ZIP percentages. State completeness and claim scope/period must match. No statewide rate should be described as an official CMS state rate unless CMS actually publishes those underlying counts. |
| **ZIP-profile denial values** | Local ZIP/city reference records include `medicareDenialRate` values, but the inspected rows do not carry fact-specific source URLs, reporting periods, or claim denominators. | They may be displayed as ZIP-profile/reference values with that label, but they are not an official provider, county, or state claims-denial rate. The original source and method for each ZIP value are not established by the current code. |
| **AFG grants** | Live OpenFEMA results through the API route. The UI maps grantee, award number, city/state when present, program, federal share, award date, and year. State can be selected or omitted for a nationwide query. | Retain the OpenFEMA award ID/number and program year; treat `fetchedAt` as query time. Match grantee to agency carefully. Null dates stay null. Awards are historical funding records, not current fleet inventory. |
| **GIS location, county boundaries, ZIP/city context** | Bundled `all-counties-database.json.gz` is loaded by `allCountiesDatabase.ts`; other local files include ZIP/city and state reference records. Coordinates can also be generated from a county centroid plus deterministic offset. Google Maps renders/assists with the map. | County FIPS and geometry are appropriate geographic keys. A generated agency point is a visualization placement, not a verified station address. The boundary dataset's field-level source date is not consistently exposed in the app. |
| **Clinical acuity, OHCA/Utstein, STEMI metrics** | The lineage catalog names CARES/NEMSQA and demographic models, but no live NEMSIS/CARES/NEMSQA ingestion was found in the inspected app paths. Generated estimates and static reference data exist. | Registry participation and reporting period must be proven per field. A modeled incidence or activation ratio is not an agency outcome. |
| **Payer mix, denial reason, billed/allowed amounts, recoverable revenue** | Some bundled agency records have fixed values; generated records use default payer mixes and denial codes. Revenue/recovery can be calculated using fixed per-transport multipliers. | A per-transport projection is a model, not an observed ledger or recoverable claim balance. A denial reason is not a denial count or rate. Require claim-level/aggregate source evidence for observed claims values. |

## Medicare denial calculation and import rules

The import flow in `services/medicareDenialImportService.ts` accepts **aggregate counts**, not raw claims, EOBs, or 835 files. Its core fields are:

- `npi`
- `pickup_county_fips`
- `denied_claims`
- `adjudicated_claims`

The user also provides the report scope, reporting period, denial definition, source name/reference, and coverage attestations. For one compatible slice:

```text
denial_rate_pct = 100 * sum(denied_claims) / sum(adjudicated_claims)
```

The count totals must refer to the same claim population, period, and definition. A provider result groups by NPI; a county result groups by pickup-county FIPS; a state result aggregates compatible counts and requires complete state coverage in the import. Percentages are never averaged. No imported rows means no computed rate; it does not mean 0%.

**Storage limitation:** despite the earlier choice to share summaries across the workspace, the current import implementation stores summaries in browser `localStorage`. Because no sign-in was requested, it does not upload or share the data across users/devices. Do not import PHI or raw claims through this flow.

## Bundled reference data and generated prospect logic

### County and state files

- `src/data/allCountiesDatabase.ts` downloads the app-bundled compressed county JSON and exposes names, FIPS, centroids, boundaries, area, cities, and related county fields.
- `src/data/nationalGeographicData.ts` documents broad reference sources (including Census, CMS, CARES, and USFA) and includes hardcoded state summaries. The code resets all state `avgMedicareDenialRate` values to `null` because they were not derived from source-backed denied/adjudicated claim counts.
- `src/data/nationalZipCityRegistry.ts` contains ZIP/city profile fields, including denial-rate-like values without per-row source citations, periods, or denominators in the inspected records.
- `src/data/dataLineageManifest.ts` defines evidence and lineage labels for 23 field groups. A catalog entry or source name is not proof an API call or source review happened.

### Generated agency-like records

`nationalProviderDatabase.ts` and `territoryIntelligenceEngine.ts` can create an agency-shaped prospect from a county/city record. Deterministic formulas choose or calculate details such as:

- EMS/fire organization name and type, app ID, FDID-like identifier, address text, and map point;
- station/apparatus/device quantities and equipment models;
- defibrillator age/warranty and CAD vendor;
- payer mix and certain clinical metrics;
- receiving-hospital name and transport share;
- grant/contract assumptions and revenue projections.

These outputs are useful as **prospect hypotheses** for end users to investigate. They are not a national census of active agencies and do not establish that a named department, station, hospital relationship, vendor, model, or contract exists.

### Other modeled values that need visible labels

- Recoverable revenue can be based on a fixed amount per transport (for example, `$68 × transports`); that is a projection, not actual recovery.
- PulseIQ calculations and explanations have fallback inputs for fleet age, device brand, device count, cardiac volume, recovery amount, grant year, ePCR, and billing model. If the underlying field is absent, these defaults must not be described as observed agency facts.
- The lineage manifest has default reporting-period labels such as `NPPES Dissemination CY2026`, `USFA National Census 2026`, `FY2025 Municipal Operating Audit`, and fixed CARES/NEMSQA periods. Where those are used without field-specific evidence from the record, they are placeholder labels rather than proof of a source record's period.

## Accuracy and provenance issues to prioritize

1. **Generated values can look exact.** Keep the values available, but display “generated prospect estimate” adjacent to exact-looking names, counts, vendors, and percentages.
2. **NPI presence can overstate provenance.** `dataSanitizationService.ts` classifies an agency with any `npiNumber` as `live_federal_registry`, although the stricter lineage checks require a valid NPI, a verification timestamp/URL, and relationship evidence. The badge should reflect a successful live match, not just a populated NPI field.
3. **Some denial screens read raw values.** The sanitizer replaces unsupported `cmsData.claimDenialRate` with a strict imported metric, but direct reads remain in `ExecutiveBriefingDossier.tsx`, `PredictiveLeadQueue.tsx`, `AgencyQuickPreviewDrawer.tsx`, `FocusedProviderProfile.tsx`, and `PulseIqScoreExplainerHub.tsx`. These paths should use the same strict service to avoid displaying static/profile values as claims rates.
4. **AFG records are not city- or agency-verified.** The API supports state filters and grantee-name text matching, not a reliable city or agency-ID match. The UI now labels nationwide results and the 20-record limit, and does not imply that county/city filters apply to the federal records.
5. **A source period can be a placeholder.** The lineage manifest sometimes supplies a fixed year/report name when evidence is absent. Use the source record's actual period where available; otherwise say “period not stated.”
6. **Workspace sharing for imports is not implemented.** The chosen workspace-shared claim-summary storage is currently browser-local. Implementing shared storage requires an authenticated/authorized server-side store or an explicitly scoped shared Firestore design.

## What a user should verify on an account

For each record, expose the actual field value and its basis, then give the user an in-app record/source link where one exists. The user should confirm:

- the operating agency and legal entity are the same entity being evaluated;
- address, station location, leadership, and decision-maker role are current;
- apparatus and biomedical inventory is active, with unit counts and service status;
- annual calls, transports, and clinical metrics use the stated agency scope and period;
- hospital destination and STEMI/cath lab relationships are operational, not just geographic;
- CAD/ePCR, communications, suppliers, and maintenance contracts are currently installed/active;
- grant awards belong to the agency and are the correct historical award;
- claims rates use matching NPI/pickup-county/claim scope/period/denial definition and aggregate counts.

The app should keep source URL, source record ID, reporting period, review date, and any calculation inputs attached to the specific fact. If none are present, that is useful context for the user—not a reason to suppress an available value.
