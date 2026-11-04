---
name: Territory browser history
description: Navigation-history rules for state, county, and agency profile paths.
---

Keep browser history owned by the app-level navigation state so browser Back/Forward and in-app Back restore the same workspace and selected geography. Add entries for meaningful workspace, state, county, city, and agency-profile transitions. Replace the active entry for filter-only changes rather than creating a new step.

**Why:** Separate profile and geographic `popstate` listeners can compete, close the wrong view, or reconstruct context instead of restoring the user’s actual previous screen.

**How to apply:** Store a compact navigation snapshot in each history entry, restore it from one app-level `popstate` listener, and make in-app Back use the same history step. Keep filter changes such as provider category out of the history stack while preserving them across Back/Forward.
