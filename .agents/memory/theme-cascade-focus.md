---
name: Theme cascade and focus
description: Keep shared theme tokens authoritative over legacy dark-mode overrides and verify keyboard focus states.
---

When centralizing theme colors, check legacy selectors with higher specificity; a later generic token rule may not override an earlier dark-mode focus rule. Test focus-visible with keyboard modality in both themes, not only programmatic focus.

**Why:** Browser checks found a dark-only focus ring that kept a hardcoded color despite the shared light/dark token layer.

**How to apply:** When changing shared theme tokens or focus styles, search for existing dark-state overrides and verify the actual keyboard-visible ring and focused form controls in both themes.
