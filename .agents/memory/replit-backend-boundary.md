---
name: Replit backend boundary
description: The user says Territory Intelligence uses Replit for its backend, not Firebase.
---

Treat Replit PostgreSQL and its API as the canonical backend for shared agency records. Saved agency profiles are publicly readable without sign-in; edits require an authenticated, explicitly authorized Replit editor. Public responses must omit field notes, follow-up tasks, contact notes, and local source-review overlays while preserving those values in authorized or browser-local views. Reviewed-evidence and other private workspace tools retain their existing access controls.

Legacy exports must be imported additively: do not overwrite existing Replit records, and preserve conflicts in the archive. Never assume a legacy identity is the same as a Replit Auth ID. Keep evidence authors and reviewers marked unmapped and block approval until an administrator explicitly confirms their identity mapping.

**Why:** The user chose public read access for saved agency profiles, but did not authorize public exposure of personal work notes or browser-local source-review data.

**How to apply:** Build on the Replit API/database. Keep profile reads separate from authenticated writes, sanitize anonymous responses, and preserve local notes during public directory refreshes. Use an explicit export, dry run, and additive transaction for migration. Do not introduce Firebase/Firestore for application storage or production reads unless the user explicitly asks.
