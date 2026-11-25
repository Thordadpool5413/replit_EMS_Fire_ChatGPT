---
name: Git safety guard
description: How to preserve a dirty Replit checkout during Git synchronization.
---

Before integrating upstream changes, capture the current commit on a recovery branch and preserve staged, unstaged, and unresolved-conflict content. In this Replit shell, metadata-changing Git commands can be blocked until rerun with `DANGEROUSLY_ALLOW_GIT=1`; this is a confirmation guard, not a Git failure.

**Why:** During a sync, the guard blocked branch and index updates even though the user had authorized the Git repair. Recovery branches and file/index snapshots kept all local work recoverable.

**How to apply:** Inspect status and divergence first. Create a recovery branch and save dirty/conflict snapshots, then use the explicit authorization prefix only for the Git operation the user requested. Never force-push, hard-reset, or discard existing changes.
