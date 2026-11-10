---
name: Local denial-rate visibility
description: Product direction for local ambulance denial-rate displays and underlying claim records.
---

Do not display local ambulance denial percentages at state, county, or individual provider/fire department scope. Keep claim imports and source records intact; this is a display change, not a request to delete claim evidence.

**Why:** The user asked to remove these local rate displays and expects end users to verify the underlying records directly.

**How to apply:** Hide local-rate map layers, summaries, sorting, and profile fields while preserving raw claim counts, citations, and separate national reference measures.

Remove unsupported claim-dollar recovery estimates from county provider lists and quick previews rather than retaining a nonfunctional “Not calculated” column.

**Why:** The user specifically requested removal unless the app can support the estimate with the necessary logic and math.

**How to apply:** Do not reintroduce recovery dollars based on denial percentages, revenue proxies, or the presence of a claim citation alone. Any future recovery calculation needs compatible source-backed claim-dollar inputs and a reproducible agency-specific method. Keep underlying claim evidence intact.
