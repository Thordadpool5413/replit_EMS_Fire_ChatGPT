---
name: Geographic identity and vintage
description: Rules for joining and rolling up EMS/fire records across administrative and operational geography.
---

Keep an agency's physical location separate from documented operational coverage. Never infer service area or jurisdiction from a mailing address or simple geographic containment. For counts and metrics, retain the source's native geography, identifier, and vintage, and aggregate only valid unique records with compatible definitions and periods.

Do not infer a county figure's source, vintage, period, or source scope from its metric name, display geography, or a data standard such as NEMSIS. If per-figure provenance is absent, label those fields unavailable while keeping the county FIPS as the app's display geography.

When a source's current county-equivalents do not match the app's bundled boundaries (for example, current Connecticut planning regions versus legacy county polygons), do not paint values onto mismatched shapes. Show exact source records separately until a verified crosswalk exists.

Do not treat county, state, or national citations as evidence for an agency-specific operational fact unless the relationship to that agency is explicitly user-confirmed. Keep the source's native scope, identifier, and period visible; user association does not change the source's geography.

For EMS/fire equipment rollups, county records are the source layer and state summaries must be sums of county-assigned unique agency records. Assign an agency to one county using its recorded physical location, retain explicitly documented service areas as context without repeating the agency or its equipment, and keep documented, unverified, not-reported, and county-unassigned states distinct. Missing county or equipment records are not evidence that equipment is absent.

**Why:** Source geographies and boundary vintages can diverge, and a false crosswalk changes which communities appear to have a value. Repeating one multi-county agency inflates equipment totals; treating missing records as zero invents certainty.

**How to apply:** For any national, state, county, city, or agency join, validate exact IDs and geography vintage, mark unmatched values explicitly, keep administrative and operational relationships separate, and require user confirmation before regional context supports an agency fact. For equipment, roll state views up from counties, deduplicate on stable agency IDs, report unresolved assignments separately, and show source scope and dates only when attached to that record; do not substitute the app's county FIPS or a standard's name.
