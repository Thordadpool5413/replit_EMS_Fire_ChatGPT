# ATLAS Phase 4: documented intelligence engine (November 24, 2026)

## Florida EMS licensing
- The bundled FL.json snapshot was extracted from the Florida Department of Health's [EMS provider report](https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf). The live extraction stated processed 11/24/2026 6:52:36 AM and printed total 347. All 347 distinct license numbers were retained: 332 Florida headquarters and 15 outside Florida. One expiration had passed as of the report date. A cached retrieval showed an earlier July version with a different total; the snapshot uses the November extraction and its own printed total, not that cached version. Counts and field validation are not independent visual verification of every row.
- One type cell included trailing phone text; only its valid ALS/T code was retained and the normalization is recorded in the snapshot. Personnel names, telephone, fax and email were excluded.
- These are state-issued license listings, not an active-agency census. Headquarters state is separate from licensing jurisdiction. Out-of-state headquarters remain browse-only in this workflow; explicit Florida counties can match county FIPS and unknown counties remain unassigned.
- Ohio and Florida have bundled state rosters. Other state-specific direct references and state-office links are research pathways, not ingested licensing coverage. NERIS/USFA/NPPES records remain separate sources.

## Evidence and opportunity workflow
1. Open an agency's Sources & Review, then Add documented sales intelligence.
2. Select the precise observation type, enter the source name, source record ID, public HTTPS document URL, document date and exact value. Open procurement requires an explicit deadline. License expirations must never be entered as service contract expirations.
3. Review the cited document and agency identity before saving. Evidence is stored in the existing browser-local source record workflow; nothing is automatically independently verified, uploaded or scraped.
4. Reports & intelligence / ATLAS Opportunity Radar lists eligible evidence-based research signals, source links and next steps. State and signal filters are available. Conflicting account state assignments withhold signals. Use the same record ID for updates to a procurement; a newer closure or award supersedes an open solicitation.
5. In the equipment filters select Dated source observations only to separate dated installation observations from legacy recorded fields. County evidence and vendor categories follow the selected mode. Neither mode establishes national market share.

## Deliberate conservative rules
- Explicit installed-equipment observations only; proposal, negative, discontinued and historical wording is withheld. Latest dated observation is used per category, disagreements between same-date documents are withheld, and applicable flags/corrections suppress the observation. A dated observation is not proof of current installed equipment. Default maximum age is 730 days.
- Contract expirations within 365 days, open dated solicitations with unpassed deadlines, and awards/funding dated within 365 days are research signals, not qualified pipeline or guaranteed opportunities. A future deadline is not proof an RFP remains open. No inferred equipment, contracts, award amounts or revenue.
- Legacy entries and user notes are not rewritten by this layer. Existing research queue remains useful for reconciling recorded fields. Unknown evidence remains unknown.
- Remaining work: additional jurisdiction ingestion, public-document discovery and review pipelines, independent source checking, source freshness scheduling, authorized secure multi-user evidence sync, and real-world procurement/equipment backfill. Production Firestore was not accessed or migrated. Replit integration and deployment require separate confirmation.
