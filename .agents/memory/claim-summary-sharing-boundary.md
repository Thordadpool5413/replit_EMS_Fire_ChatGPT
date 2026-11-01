---
name: Browser-local data sharing boundary
description: Access-control constraint for storing imported claim summaries and locally captured agency source evidence.
---

The user chose workspace-wide storage for aggregate claim summaries but declined adding sign-in. Until an alternative workspace-only access boundary is verified, keep imports in the current browser profile and do not publish them to Firestore or an API.

**Why:** Firestore rules were unavailable for review and the app had no authenticated workspace identity. Publishing without a verified boundary could expose claim summaries outside the intended workspace.

**How to apply:** Before enabling cross-device or shared persistence, verify the actual access-control rules and workspace identity end-to-end. If that cannot be done without sign-in, ask before adding sign-in; do not silently change the user's decision.

Agency source-match decisions and manually captured operational facts are also browser-local. This is an implementation boundary, not a user decision that all agency evidence must remain private or that sign-in is rejected for this separate data.

**Why:** The agency source records may include account-level operational details, while the app does not verify workspace identity or per-user Firestore access rules.

**How to apply:** Keep the browser-only status visible. Before enabling sharing or cross-device persistence for agency evidence, verify the access-control boundary and ask the user how this data should be shared.
