---
name: Firestore read scope
description: Avoid expensive all-collection Firestore reads while preserving scoped cloud access.
---

Keep nationwide browsing on the device's existing cache. Start agency listeners only when a user selects a state, and label cloud reachability separately from active record synchronization.

**Why:** An unfiltered live listener downloads every agency document for each fresh client and can exhaust Firestore's daily read quota; a successful connectivity ping does not mean the national records are actively syncing.

**How to apply:** Do not add an unfiltered `onSnapshot` for the national scope. If national cloud refresh becomes necessary, require an explicit user action and implement a bounded, paginated, cached read path with clear completeness status.
