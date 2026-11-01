---
name: USFA registry feed latency
description: Performance and completeness considerations for the public USFA department and station CSV downloads.
---

The public USFA department and station CSVs are whole-national downloads, several megabytes each, and may take about a minute to fetch. A department's reported station count can exist even when the station-address download returns no rows for it.

**Why:** Blocking an agency lookup on the large USFA download makes the preview feel unavailable, while treating a count as an address list would overstate what the source provides.

**How to apply:** Cache the USFA files server-side, load them asynchronously, and return faster NERIS matches while they are pending. Keep each source's reported station count distinct from the number of station address rows returned.
