---
name: Source freshness
description: Product rule for displaying source retrieval times and data staleness.
---

Display an app/API retrieval time separately from a source's publication or record-update date. If the app did not record a source-specific check, show freshness as unknown rather than current. Modelled and locally supplied values must not inherit the freshness of a linked public source.

For the territory explorer, the national county-equivalent index uses 2020 Census geography. A live TIGERweb retrieval timestamp is not a new publication date; the bundled fallback's source vintage must remain unknown.

**Why:** A recent API request does not establish when the underlying public dataset was last updated, and one source's timestamp does not verify adjacent profile fields.

**How to apply:** Use retrieval timestamps only for live lookups, show source-provided update dates separately, and make missing check times explicit in source-backed profile sections. Keep the county boundary vintage and retrieval time separate, and label the bundled fallback as unknown-vintage.
