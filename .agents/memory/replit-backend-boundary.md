---
name: Replit backend boundary
description: The user says Territory Intelligence uses Replit for its backend, not Firebase.
---

Treat Replit as the app's backend. Do not assume Firebase or Firestore is the active application data store.

**Why:** The user stated that they are using Replit for the backend, not Firebase or another backend service.

**How to apply:** Build on the existing Replit backend. Do not introduce or rely on Firebase/Firestore for application storage or production reads unless the user explicitly asks.
