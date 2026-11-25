---
name: Replit backend boundary
description: The user says Territory Intelligence uses Replit for its backend, not Firebase.
---

Treat Replit PostgreSQL and its API as the canonical backend for shared agency records and reviewed public-source evidence. Agency records keep the current no-sign-in access model; only the reviewed-evidence workspace requires Replit Auth.

Legacy exports must be imported additively: do not overwrite existing Replit records, and preserve conflicts in the archive. Never assume a legacy identity is the same as a Replit Auth ID. Keep evidence authors and reviewers marked unmapped and block approval until an administrator explicitly confirms their identity mapping.

**Why:** The user said they are using Replit for the backend, asked to preserve and migrate existing records, and kept agency data under the current access model.

**How to apply:** Build on the Replit API/database. Use an explicit export, dry run, and additive transaction for migration. Do not introduce Firebase/Firestore for application storage or production reads unless the user explicitly asks.
