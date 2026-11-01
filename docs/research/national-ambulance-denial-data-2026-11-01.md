# National public ambulance denial-data review

## State-specific follow-through

The user reiterated that the requirement is a percentage for **each state**, not merely a national reference. The national reference does not fulfill that requirement.

An additional state-focused review checked the FY2024 RSNAT table, the PSPS field definitions, and the [September 2020 RSNAT second interim evaluation](https://www.cms.gov/priorities/innovation/data-and-reports/2020/rsnat-secondintevalrpt). The FY2024 table remains a national table; the older evaluation explicitly says it does not examine the impact on individual states. PSPS identifies carrier and pricing-locality dimensions and counts denied submitted services, not the required per-state unique-claim/pickup-geography count pair. These checks did not establish actual claim-denial rates for every state.

On November 1, 2026 at 22:05:48 UTC, Outlook accepted a public-data inquiry to `AmbulancePA@cms.hhs.gov`, the contact verified on the official CMS RSNAT program page. Subject: **Public data inquiry: Medicare ambulance denial counts for all 50 states and DC**.

The inquiry asks for existing state-level paid/denied line counts underlying the national RSNAT report and, separately, any broader public all-ground-ambulance unique-claim outcome report. It requests native geography definitions, periods, as-of dates, denial/appeal definitions, coverage, exclusions, and public API/download links. It preserves the distinction between RSNAT-only lines and all-ambulance claims. It authorizes no fees, requests no patient-level information, and asks for the appropriate records channel if one is needed.

A non-draft sent copy with the expected recipient was verified. Acceptance for sending and the sent copy are not confirmed delivery, a CMS acknowledgment, a formal FOIA tracking number, or receipt of usable state counts. No new state percentages were populated. No automatic reply monitoring has been configured.

Checked November 1, 2026. Public sources only. The original app integration displays the calculated national program reference separately from local claim metrics. That integration did not contact agencies; the later state-specific inquiry is recorded above.

## Newly established national metric

CMS publishes a nationwide **Repetitive, Scheduled Non-Emergent Ambulance Transport (RSNAT)** program report containing actual reported claim-line outcomes. This is stronger national evidence than an unsupported scalar or a targeted-review classification, but is not an all-ambulance claim-denial rate.

Primary source: [CMS Prior Authorization and Pre-Claim Review Program Stats for Fiscal Year 2024](https://www.cms.gov/files/document/pre-claim-review-program-statistics-document-fy-24.pdf), published September 16, 2025, PDF page 6. Reporting period: October 1, 2023–September 30, 2024.

The relevant page was text-extracted and visually inspected to verify the table titles, column labels, and numbers.

### Claim-line outcome percentage: 4.12%

The **Claims and Appeals** table reports:

- Claim lines paid: **721,767**
- Claim lines denied: **31,031**
- Claim lines appealed: **6,216**
- Percentage of claim lines overturned on level 1 appeal: **45.1%**
- First column, labeled “Claims Reviewed”: **752,798**

The report mixes “claims” and “claim lines” in its column labels. To preserve a consistent counting unit, calculate the line-outcome percentage using the explicitly labeled paid and denied line counts:

```
denominator = 721767 paid claim lines + 31031 denied claim lines
            = 752798 claim lines
percentage = 100 * 31031 / 752798
           = 4.122088528396728%
display = 4.12%
```

Eligible display label: **“National RSNAT claim-line denial percentage — FY2024: 4.12%.”**

Scope: Original Medicare Part B, repetitive scheduled non-emergency transport, independent ambulance suppliers not based at an institution. It is not all emergency ambulance services, all ambulance suppliers/providers, all payers, or a rate for an individual fire department.

The separate appeals columns do not establish a final post-appeal population denial rate. Do not subtract a rounded appeals percentage from denied-line counts to manufacture a final rate.

### Two different measures on the same page

| Measure | Numerator | Denominator | Calculated percentage | Interpretation |
|---|---:|---:|---:|---|
| Reported program claim-line denial outcomes | 31,031 | 752,798 | 4.12% | Reported paid/denied line outcomes for the RSNAT program table |
| Selected prepayment medical-record review denials | 14,268 | 23,622 | 60.40% | Selected review cohort; not all RSNAT claims |
| Prior-authorization non-affirmations | 7,948 | 28,836 | 27.56% | Requests, not claim outcomes |

For the last measure, CMS reports 28,836 completed requests and 20,888 provisionally affirmed requests; the non-affirmation numerator is their difference. The report defines completed requests as those receiving affirmation or non-affirmation decisions. Requests can be resubmitted and are not necessarily unique patients, claims, or transport episodes.

These cohorts must not be added together, averaged, or substituted for each other. The selected prepayment-review count is not an additional independent denominator to combine with the program Claims and Appeals table.

Machine-readable extraction: [national RSNAT metrics CSV](../../reports/national-ambulance-rsnat-fy2024-public-metrics.csv). All three rows explicitly prohibit use as a state, county, or provider claim rate.

## Newer-report check

The [official RSNAT program page](https://www.cms.gov/data-research/monitoring-programs/medicare-fee-service-compliance-programs/prior-authorization-and-pre-claim-review-initiatives/prior-authorization-repetitive-scheduled-non-emergent-ambulance-transport-rsnat) links the September 16, 2025 update to the FY2024 report and also links older reports.

A targeted search for FY2025 statistics did not establish a newer RSNAT program-statistics report. FY2024 is the newest report located in this review, not a claim that no newer publication can exist.

## Other national public datasets and reports

### CMS Physician/Supplier Procedure Summary: public dataset and API

- [Dataset](https://data.cms.gov/summary-statistics-on-use-and-payments/physiciansupplier-procedure-summary)
- [Methodology](https://data.cms.gov/resources/physician-supplier-procedure-summary-methodology)
- [Data dictionary](https://data.cms.gov/resources/physician-supplier-procedure-summary-data-dictionary)
- The dataset page currently lists **2025** as the latest available year and offers View Data, Access API, and Download.
- It reports submitted, allowed, and denied **services**, charges, and payments, organized by carrier, pricing locality, HCPCS, modifier, provider specialty, type of service, and place of service.
- Useful for HCPCS-specific Medicare service-unit comparisons. Ambulance mileage units must not be mixed into a supposed unique-claim denominator.
- The published dimensions do not establish exact billing-NPI or pickup-county attribution. Public suppression also limits complete population totals. It must not backfill actual agency, county, or state claim-denial percentages.
- No new PSPS national percentage was calculated in this review; the national RSNAT percentages above come from the separate program report.

### Ground Ambulance Data Collection System: operational and financial benchmarks

- [CMS GADCS overview](https://www.cms.gov/medicare/payment/fee-schedules/ambulance/medicare-ground-ambulance-data-collection-system)
- [CMS reports and resources](https://www.cms.gov/medicare/payment/fee-schedules/ambulance-fee-schedule/medicare-gadcs-resources)
- [Updated Years 1–4 analytic codebook](https://www.cms.gov/files/document/medicare-ground-ambulance-data-collection-system-gadcs-updated-codebook-year-1-4-cohort-analysis.pdf), resource dated December 9, 2025.
- Public report and codebook resources cover organizational characteristics, staffing, transport/utilization, costs, and revenues.
- The complete updated codebook was text-extracted and searched. No “denied” or “denial” field was located. It does not establish the needed denied/adjudicated claim-count pair.
- A publicly available report/codebook does not by itself establish availability of an organization-identifiable downloadable row-level analytic file or open API.
- Useful for comparing an agency with reported national operational/financial cohorts, not asserting its individual denial percentage.

### National industry trends from Medicare fee-for-service claims

- [CMS Ground Ambulance Industry Trends, 2017–2022 report resource](https://www.cms.gov/medicare/payment/fee-schedules/ambulance-fee-schedule/medicare-gadcs-resources/ground-ambulance-industry-trends-2017-2022-report-analysis-medicare-ffs-claims)
- [Direct PDF](https://www.cms.gov/files/document/ground-ambulance-industry-trends-2017-2022-report-analysis-medicare-fee-service-claims.pdf)
- The official resource identifies a national claims-analysis report. The resource page and PDF link were verified; the report tables were not fully audited in this pass.
- Candidate for broader volume/payment and industry-context research, not an established denial-count feed.

## Consequences for the app

1. A separate national **RSNAT claim-line** reference can be supported with a fixed 4.12% value, exact counts, dates, and the source page.
2. This reference must not replace state, county, or agency percentages or be called the national all-ambulance claim-denial rate.
3. No national public feed with complete matched provider-NPI and pickup-county denied/adjudicated claim counts was established by the sources inspected.
4. The app now calculates and displays the national program reference on the home map, geographic explorer, and provider billing section, including the counts, period, source link, and expandable calculation/coverage details. Local claim selectors and county/state count aggregation remain separate and do not fall back to this reference.
5. The missing local rates remain unresolved pending usable counts; the national finding does not complete that task.
