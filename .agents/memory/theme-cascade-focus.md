---
name: Theme cascade and focus
description: Keep shared theme tokens authoritative over legacy dark-mode overrides and verify keyboard focus states.
---

When centralizing theme colors, check legacy selectors with higher specificity; a later generic token rule may not override an earlier dark-mode focus rule. Test focus-visible with keyboard modality in both themes, not only programmatic focus.

**Why:** Browser checks found hardcoded dark focus and navigation styles that masked shared theme tokens; theme-transition effects can also make immediate color assertions sample an intermediate value.

**How to apply:** When changing shared theme tokens or focus styles, search for existing dark-state overrides, especially navigation selected states, and verify the keyboard-visible ring, focused controls, and settled colors in each theme.

Verify selector matching against the rendered ancestor tree before increasing specificity. Shared action-link rules can override subtle evidence badges because they contain a background utility.

**Why:** A declared badge color was not the rendered color; an attempted stronger rule also failed because the scope classes were on different ancestor elements.

**How to apply:** Inspect computed foreground/background colors and actual class placement. Assert the settled rendered colors, not just stylesheet declarations, when fixing contrast.

When changing a sidebar utility grid into a vertical list, audit legacy child placement as well as the parent layout. Old explicit grid-column rules can create unintended implicit columns even after the parent is set to one column.

**Why:** The footer still rendered uneven widths and overlapping labels until the old grid-placement behavior was removed from the new row layout.

**How to apply:** Check live row widths, heights and icon alignment, not just page overflow. Use an unambiguous layout contract and verify the selected-geography state at short laptop heights.

Include row and icon geometry in every theme's checks, not only contrast.

**Why:** Daylight geometry and all-theme contrast checks missed a Miami Vice selected-state border that shifted only the active row's icon.

**How to apply:** Keep selection indicators from changing row border geometry; check the selected workspace against inactive rows after switching themes.

Every fresh app session starts in Daylight, regardless of a previously selected app theme or the device color preference. Users may still switch themes during the current session.

**Why:** the user asked.

**How to apply:** Keep startup theme initialization authoritative, and verify reload behavior after selecting dark or Miami Vice.
