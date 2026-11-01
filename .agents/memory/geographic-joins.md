---
name: Geographic identity and vintage
description: Rules for joining and rolling up EMS/fire records across administrative and operational geography.
---

Keep an agency's physical location separate from documented operational coverage. Never infer service area or jurisdiction from a mailing address or simple geographic containment. For counts and metrics, retain the source's native geography, identifier, and vintage, and aggregate only valid unique records with compatible definitions and periods.

When a source's current county-equivalents do not match the app's bundled boundaries (for example, current Connecticut planning regions versus legacy county polygons), do not paint values onto mismatched shapes. Show exact source records separately until a verified crosswalk exists.

**Why:** Source geographies and boundary vintages can diverge, and a false crosswalk changes which communities appear to have a value.

**How to apply:** For any national, state, county, city, or agency join, validate exact IDs and geography vintage, mark unmatched values explicitly, and keep administrative and operational relationships separate.
