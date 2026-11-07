---
name: Theme cascade and focus
description: Keep shared theme tokens authoritative over legacy dark-mode overrides and verify keyboard focus states.
---

When centralizing theme colors, check legacy selectors with higher specificity; a later generic token rule may not override an earlier dark-mode focus rule. Test focus-visible with keyboard modality in both themes, not only programmatic focus.

**Why:** Browser checks found hardcoded dark focus and navigation styles that masked shared theme tokens; theme-transition effects can also make immediate color assertions sample an intermediate value.

**How to apply:** When changing shared theme tokens or focus styles, search for existing dark-state overrides, especially navigation selected states, and verify the keyboard-visible ring, focused controls, and settled colors in each theme.
