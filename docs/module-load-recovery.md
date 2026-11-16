# Module-load recovery

Screenshot symptom: a directory view reports “Failed to fetch dynamically imported module.” This establishes a module transport failure, not the precise server-side cause. An old open tab requesting a removed build file, an interrupted request, or a host returning HTML for a missing asset can produce this failure. No deployed network trace was available.

Changes built locally:
- Error boundary distinguishes module-load failures from ordinary render errors. Explicit Reload app refreshes the document, checks worker updates with a bounded wait, and never clears device data. Offline attempts show reconnect guidance. Other render errors retain the existing reset action.
- Technical error text wraps instead of truncating the failing URL.
- PWA boot graph includes Home, directory and agency list with static dependencies; formerly only Home was included.
- Boot installation validates JavaScript/CSS content types. A failed new install does not force-activate a broken worker.
- Runtime cache rejects HTML fallback responses for script/style URLs and preserves valid cached assets when network returns an error or incorrect type.
- Added build graph check verifies relative module references exist and key views appear in the boot cache.

Validation: 199 frontend unit/component tests, eight service-worker tests, workspace TypeScript and production build. Build graph check verifies all built relative imports and core boot assets. No browser or deployed trace verification is claimed. The existing installation must receive the new build for these changes to apply; a GitHub push alone does not update Replit. No deployment or Replit edits were performed.
