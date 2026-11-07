---
name: Browser contrast color sampling
description: Browser-specific guidance for reliable contrast measurements in the existing Chromium DevTools harness.
---

When measuring contrast in Chromium, support its computed `color(srgb r g b / a)` serialization and sample the element's actual rendered surface when an ancestor background is not the one behind the text.

**Why:** CSS `color-mix()` may compute to normalized sRGB syntax, and nested/translucent navigation surfaces can make a distant ancestor produce a false contrast failure.

**How to apply:** Extend the existing Chromium contrast helper with the normalized color form and let samples specify a containing surface for overlays or navigation. Keep the default ancestor compositing path for ordinary content.
