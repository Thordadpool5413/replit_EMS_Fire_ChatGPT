---
name: App-wide visual density
description: User-stated sizing preference for the EMS & Fire Territory Intelligence app across screens.
---

Keep the entire app compact, clean, and scannable on laptop and phone. Reduce oversized cards, padding, spacing, typography, and persistent chrome that make screens feel overwhelming, but do not shrink text or controls until they become hard to read or use. For county directories, retain readable metadata and distinct metric hierarchy instead of compressing everything into tiny inline text; at short laptop heights, keep primary sidebar destinations and utility labels accessible without changing the logo. Preserve the map-only Home screen and all available data; remove duplicate or non-actionable notices rather than useful workflows. Avoid mock alerts and repeated connectivity popups, while retaining meaningful errors, offline-save status, and neutral source/estimate context.

**Why:** The user said the full app looked too large and overwhelming on a laptop and asked for a cleaner experience throughout the app, then asked to remove warnings and notifications that do not help end users. They later called out that over-compressed county cards and hidden sidebar destinations looked unprofessional.

**How to apply:** Tune shared shell and component density consistently across workspaces; check laptop and phone layouts, maintain readable type and tap targets, and keep all secondary information accessible rather than deleting it. Do not seed simulated alert feeds or show repeated network-state toasts; keep genuine errors, sync/offline consequences, and data-source or estimate disclosures.

For EMS and Fire profiles, keep the executive header as the single summary of agency type, location, core operations, and source access. Start detail panels collapsed and avoid repeating the same figures in their collapsed labels; retain the full facts and citations when expanded, and keep registry, planning, assessment, and review details at the profile end.

**Why:** The user said profile sheets looked repetitive and oversized, and asked for essentials first with secondary material moved to the bottom.

**How to apply:** Keep one identity header, one operations summary, and one topic bar; collapse supporting panels by default, reset profile state when the agency changes, and verify source details and layout on phone and laptop.

The sidebar needs even layout, not merely enough space to fit. Keep navigation and utility rows aligned in width, height, icon position, and text baseline, with deliberate spacing between groups.

**Why:** The user again rejected the sidebar after the no-scroll correction, saying that not everything was evenly displayed and laid out.

**How to apply:** Check actual row and icon geometry as well as overflow. Avoid mixing cramped half-width utility controls with full-width destinations or introducing large gaps between related groups. Preserve the logo.

County cards should communicate a visual story through related groups, rather than a flat inventory of numbers. Keep all county details visible and balance the county preview with the adjacent state map.

**Why:** The user repeatedly rejected both multicolor metric grids and compressed inline numbers, then specifically requested a visual story of the county's data and a preview sized to match its map.

**How to apply:** Group related figures with clear captions and a deliberate reading order. Do not mistake smaller text or more decorative color for better hierarchy, and verify the actual map/preview geometry at laptop widths.
