# Ambulance denial source audit

Checked: November 1, 2026.

## Active access scope

The user selected **public sources only**. Private billing connections, credential requests, provider enrollment, and authorized remittance ingestion are not part of the active acquisition route. The Stedi assessment below is retained as an evaluated but excluded candidate, not a recommended next connection. Existing local aggregate-import functionality was not removed.

## Result

No source examined in this audit supplies complete Medicare ambulance denied/adjudicated claim counts by both billing NPI and pickup county. No actual state, county, or individual-provider claim rates were populated by this research. Do not describe this report or the existing importer as completing population of those rates.

The search covered CMS public datasets and documentation, First Coast ambulance medical-review publications, Florida EMS reporting, Florida county billing pages and reports, and documented remittance APIs. This is a scoped research result, not a claim that no other source could ever exist.

## Existing app inputs

Reproduce with `node scripts/audit-ambulance-denial-inputs.mjs`.

| Bundled source | Finding | Why it cannot produce the requested rate |
|---|---|---|
| `src/data/nationalAgenciesData.ts` | 19 numeric `claimDenialRate` literals; no denied/adjudicated claim count fields | A scalar alone does not provide a weighting denominator or split a multi-county provider's claims by pickup county. |
| `src/data/allStatesAgenciesData.ts` | 34 numeric `claimDenialRate` literals; no denied/adjudicated claim count fields | Same limitation. These are source-code occurrences, not necessarily 34 unique providers. |
| `src/data/nationalZipCityRegistry.ts` | 122 numeric `medicareDenialRate` literals; no denied/adjudicated claim count fields | Legacy values lack row-level source/period/scope evidence. The runtime registry suppresses untraceable legacy denial values. They are not a county claims dataset. |
| `src/data/all-counties-database.json.gz` | 3,143 county records; zero with usable paired claim counts. Florida: 67 county records, zero with usable paired counts. | Geography/reference attributes do not contain the numerator and denominator. |
| API server routes | Identity/registry/geographic-context endpoints; no live claims-denial ingestion route found | An NPPES identity response does not contain Medicare claim-denial outcomes. |
| Aggregate import service | Validated NPI × pickup-county counts with report metadata and completeness attestations | A functioning calculation/input path, not an already-populated public data source. |

Paths above are relative to `artifacts/ems-territory-intelligence/`. This inspection does **not** read the user's private browser localStorage, imported reports, or saved Firestore records. Do not infer those stores are empty from the bundled audit.

## Source assessment

### 1. CMS Physician/Supplier Procedure Summary (PSPS)

- Dataset: https://data.cms.gov/summary-statistics-on-use-and-payments/physiciansupplier-procedure-summary
- Dictionary: https://data.cms.gov/resources/physician-supplier-procedure-summary-data-dictionary
- Methodology: https://data.cms.gov/resources/physician-supplier-procedure-summary-methodology
- Has submitted and denied **service-unit** counts and charges.
- Native dimensions include carrier, pricing locality, HCPCS, modifiers, specialty, type/place of service—not billing NPI plus pickup-county FIPS.
- The dataset page states a separate unsuppressed Limited Data Set is available under a Data Use Agreement. Removing suppression does not add missing geographic/provider keys or turn service units into unique claims.
- Suitable for a separately defined published-cell service-unit analysis after geography/HCPCS/suppression review. **Not eligible for the app's complete county/provider ambulance claim-denial percentage.**

### 2. CMS Geographic Variation

- https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-geographic-comparisons/medicare-geographic-variation-by-national-state-county
- Existing app county context concerns use/spending. Those fields do not supply the required ambulance denied/adjudicated claim pair.
- A paid-services count, beneficiary count, expenditure, or average reimbursement is not a denial numerator.

### 3. First Coast ambulance Targeted Probe and Educate (TPE)

- https://medicare.fcso.com/medical-review/targeted-probe-and-educate-tpe-round-results-ambulance-services-basic-life-support
- Page dated July 21, 2025; covers A0428 and A0425 targeted reviews.
- The embedded chart was inspected, not just its page text. Round 1 (December 2021–July 2022) shows classification categories: Minor 70%, Moderate 0%, Major 30%.
- These percentages describe targeted-review result classifications. They are **not** Florida's ambulance claim-denial rate and have no named-provider NPI/pickup-county claim denominator.
- Do not import 30% or 70% as a state, county, or agency denial rate.

### 4. First Coast service-specific ambulance review

- https://medicare.fcso.com/medical-review/part-b-service-specific-review-ambulance-services-hcpcs-code-a0428-a0425
- Page dated August 26, 2024; discusses an October 2020 post-payment review.
- Useful for reasons such as medical necessity and documentation deficiencies. A selected post-payment review is not the population of all adjudicated ambulance claims.
- Not a complete statewide/provider/county claims-count feed.

### 5. Florida EMSTARS / NEMSIS

- https://www.floridahealth.gov/statistics-data/emergency-medical-services-ems-data-systems/ems-data-reports-research
- The official page describes clinical/operational reporting, confidentiality, and controlled data requests.
- It states the NEMSIS public-release research dataset does not identify EMS agencies or reporting states.
- Clinical calls/transports cannot be treated as Medicare adjudicated claims; no billing-denial join is established by this page.
- Could support authorized pickup-location linkage if actual matching identifiers and access are established. Do not assume clinical-data access confers billing-data access.

### 6. Pinellas / Sunstar billing authority

- https://pinellas.gov/ambulance-billing-fee-information-disclosures
- Explicitly states Pinellas County Ambulance Billing & Financial Services handles Sunstar ambulance billing.
- Geographic context: Pinellas County, Florida; county FIPS `12103`.
- Establishes a concrete billing-data custodian. It does not establish an NPI or disclose denied/adjudicated counts.
- Public billing charges and their effective dates are not denial reporting periods or claim-denial counts. The billing office's mailing address is not the pickup location.
- Do not attribute Sunstar billing outcomes to every Pinellas fire department or count the same Sunstar transport again under a responding department.

### 7. Stedi remittance and claim APIs — excluded by public-only scope

- ERA endpoint documentation: https://www.stedi.com/docs/healthcare/api-reference/get-healthcare-reports-835
- Correlation/workflow documentation: https://www.stedi.com/docs/healthcare/receive-claim-responses
- `GET https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/reports/v2/{transactionId}/835`
- Returns processed 835 transactions available in the authorized account, including claim status, claim control numbers, adjustments, and service lines.
- Requires an authorized production account/API key and the relevant providers' payer/ERA access. It is **not** an open API for all agencies' claims. Test responses cannot populate production rates.
- Stedi explicitly warns that zero payment does not establish a denial. Use documented status semantics and resolve adjustments/reversals.
- Its correlation documentation joins an original 837 claim to an 835 using the patient control number. Original claims or an authorized billing/ePCR linkage are still needed for pickup geography.
- A key alone cannot authorize access to unrelated agencies or supply complete county/state coverage.
- No connection, enrollment, PHI processing, or secret request was performed in this audit.

### 8. Alachua County Fire Rescue operational audit — additional public report

- Official report dated November 30, 2023: https://alachuacounty.us/Depts/OMB/Audits/Operational%20Performance%20Audit%20Report%20for%20Alachua%20County%20Fire%20Rescue%20-%2011-30-23.pdf
- Full PDF text was searched for Medicare, billing, claims, denial, and denied; the relevant billing passages were read.
- PDF page 11 states that Alachua Fire Rescue's Revenue and Collections Section also performs medical billing for Bradford County EMS. Relevant county FIPS are Alachua `12001` and Bradford `12007`.
- This is historical public evidence of shared billing administration, not proof of a shared NPI, current contract, pickup county, or department-level denial rate.
- PDF page 246 documents Respond Billing (Central Square/TriTech) and ESO-related systems/contracts as of the report. These are not public claim-outcome APIs.
- The report explicitly excludes evaluation of the Revenue and Collections Section from its project scope. It does not establish the required Medicare denied/adjudicated count pair.
- This source is useful for identifying a public billing-data custodian and checking the agency/biller relationship. Do not roll Bradford claims into Alachua merely because Alachua administers billing.

### 9. Fairfax County EMS billing follow-up — additional public comparison

- Official-hosted draft, April 2, 2025: https://www.fairfaxcounty.gov/boardofsupervisors/sites/boardofsupervisors/files/Assets/documents/Fairfax-County-EMS-Billing-Follow-Up-Study-DRAFT-April-2-2025.pdf
- Full PDF text was searched for claims, Medicare, denial, denied, and collection rates; billing-analysis passages were read.
- PDF pages 9–10 discuss a Digitech billing analysis of 43,394 billed transports from February 19–December 31, 2024, with backlog exclusions and data as of February 25, 2025.
- It reports charges, adjustments, receipts, amounts due, and collection percentages. Those are monetary/collections measures, not denied/adjudicated Medicare claim counts.
- The report discusses contractual adjustments and patient waivers. Neither an unpaid balance nor `100% - collection_percentage` is a claim-denial rate.
- This provides another public-report route to billing operations, but cannot populate the app's actual Medicare claim-denial metric.

## Required source contract and joins

The app needs compatible aggregate rows containing:

`billing_npi, pickup_county_fips, reporting_period, payer_scope, denial_definition, denied_claims, adjudicated_claims, source_reference`

Upstream preparation must:

1. Identify the actual billing organization and establish its relationship to the displayed operating agency. Registry identity alone is insufficient.
2. Keep Original Medicare FFS, Medicare Advantage, Medicaid, and commercial cohorts separate.
3. Match remittances to originating claims and, where necessary, authorized pickup records. Do not use headquarters, mailing, beneficiary-residence, or destination-hospital county as pickup county.
4. Assign county from sufficient pickup-location information. ZIP codes crossing county lines cannot be resolved to a unique county merely by selecting the first ZIP-to-county match.
5. Resolve adjustments, reversals, duplicates, and appeals to the chosen decision point. Count a unique claim once; do not count mileage service units as separate ambulance claims.
6. Distinguish a pre-adjudication rejection, a pending claim, an entire-claim denial, and a partial service-line denial. Do not classify every zero-dollar payment or contractual adjustment as denied.
7. Preserve source references, period, definition, and coverage. Missing evidence stays missing; it does not become a zero.
8. Export only the permitted aggregate counts into the current app. Do not introduce raw remittance/claim uploads or unauthenticated shared storage.

Then:

```
county_rate = 100 × sum(county denied claims) / sum(county adjudicated claims)
state_rate  = 100 × sum(all counties' denied claims) / sum(all counties' adjudicated claims)
provider_rate = 100 × sum(exact billing NPI denied claims) / sum(exact billing NPI adjudicated claims)
```

Provider-wide percentages cannot be assigned to counties without the pickup-county split. An arithmetic mean of provider percentages is not the county's actual combined denial rate. A rate based on only participating providers must remain labeled as that cohort, not as complete county/state coverage.

## What is and is not completed

- Completed: repeatable bundled-input audit, investigation of additional official/public sources including full-text Alachua and Fairfax billing audits, specific remittance API documentation and join requirements, source eligibility inventory, and recording the user's public-only acquisition scope.
- Already implemented separately: aggregate count calculations and exact-key display path.
- **Not completed:** acquisition of real complete denied/adjudicated counts; authorized provider enrollment; complete billing-NPI-to-operating-agency corroboration; pickup-county linkage; population of real state/county/provider percentages.
- No public source inspected warrants inserting a new actual denial percentage into the app. No substitute or fabricated percentage was inserted.
- No private billing connection will be pursued under the current scope. The public-only review has not established complete Florida county/state counts or actual individual-provider claim rates.
