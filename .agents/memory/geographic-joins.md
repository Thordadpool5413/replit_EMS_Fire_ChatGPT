---
name: Geographic identity and vintage
description: Rules for joining and rolling up EMS/fire records across administrative and operational geography.
---

Keep an agency's physical location separate from documented operational coverage. Never infer service area or jurisdiction from a mailing address or simple geographic containment. For counts and metrics, retain the source's native geography, identifier, and vintage, and aggregate only valid unique records with compatible definitions and periods.

Do not infer a county figure's source, vintage, period, or source scope from its metric name, display geography, or a data standard such as NEMSIS. If per-figure provenance is absent, label those fields unavailable while keeping the county FIPS as the app's display geography.

When a source's current county-equivalents do not match the app's bundled boundaries (for example, current Connecticut planning regions versus legacy county polygons), do not paint values onto mismatched shapes. Show exact source records separately until a verified crosswalk exists.

Do not treat county, state, or national citations as evidence for an agency-specific operational fact unless the relationship to that agency is explicitly user-confirmed. Keep the source's native scope, identifier, and period visible; user association does not change the source's geography.

**Why:** Source geographies and boundary vintages can diverge, and a false crosswalk changes which communities appear to have a value.

**How to apply:** For any national, state, county, city, or agency join, validate exact IDs and geography vintage, mark unmatched values explicitly, keep administrative and operational relationships separate, and require user confirmation before regional context supports an agency fact. Show source scope only when attached to that figure's record; do not substitute the app's county FIPS or a standard's name.
