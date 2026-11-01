---
name: Claim summary sharing boundary
description: User decision and safety requirement for storing imported Medicare claim summaries.
---

The user chose workspace-wide storage for aggregate claim summaries but declined adding sign-in. Until an alternative workspace-only access boundary is verified, keep imports in the current browser profile and do not publish them to Firestore or an API.

**Why:** Firestore rules were unavailable for review and the app had no authenticated workspace identity. Publishing without a verified boundary could expose claim summaries outside the intended workspace.

**How to apply:** Before enabling cross-device or shared persistence, verify the actual access-control rules and workspace identity end-to-end. If that cannot be done without sign-in, ask before adding sign-in; do not silently change the user's decision.
