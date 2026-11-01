# Research Notes: EMS & Fire Agency Data Sources

**Status:** researching
**Depth:** Standard

## Plan

- **Question:** Which APIs, MCP tools, and open datasets can materially improve this app's EMS/fire agency intelligence?
- **Scope:** U.S. national and state sources for identity, operations, clinical metrics, claims, hospitals, communications, grants, procurement, fleet, and GIS.
- **Audience:** Product and engineering
- **Deliverable:** Source comparison, match keys, coverage limits, recommended joins, and phased implementation priorities.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Provider identity and agency directories | pending | -- |
| 2 | EMS operations and clinical data | pending | -- |
| 3 | Medicare claims and denial-rate availability | pending | -- |
| 4 | Hospitals, STEMI, 911, and communications | pending | -- |
| 5 | Grants, procurement, fleet, and GIS | pending | -- |

## Coverage Checklist

- [ ] Which live sources are already connected, and what do they actually prove?
- [ ] Which national/state registries can match real agencies and stations?
- [ ] Which open datasets support agency-level operations, volume, or clinical measures?
- [ ] Can public CMS data support provider, pickup-county, or state ambulance denial rates?
- [ ] Which public hospital, trauma, STEMI, PSAP, CAD, or ePCR sources are usable?
- [ ] Which grant/procurement sources link awards to actual equipment or contracts?
- [ ] What join keys, dates, and confidence labels make the combined information useful?

## Findings Log

_[@key] markers will reference the source registry._

## Conflicts & Open Questions

- Public availability may differ by state; national completeness and agency-level access must be verified per source.
- A source record, map result, award, or dataset match is not automatically proof of the current operating agency or installed equipment.

## Gaps

- Pending source discovery and cross-checking.
