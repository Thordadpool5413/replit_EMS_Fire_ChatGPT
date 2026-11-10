---
name: Browser contrast color sampling
description: Browser-specific guidance for reliable contrast measurements in the existing Chromium DevTools harness.
---

When measuring contrast in Chromium, support its computed `color(srgb r g b / a)` serialization and sample the element's actual rendered surface when an ancestor background is not the one behind the text.

**Why:** CSS `color-mix()` may compute to normalized sRGB syntax, and nested/translucent navigation surfaces can make a distant ancestor produce a false contrast failure.

**How to apply:** Extend the existing Chromium contrast helper with the normalized color form and let samples specify a containing surface for overlays or navigation. Keep the default ancestor compositing path for ordinary content.

In forced-colors checks, do not assume `currentColor` decorations use the
forced text color: Chromium can resolve them against the original authored
color before forcing the foreground. Prefer explicit system color keywords
for high-contrast decorations.

**Why:** A county link's text became the system link color while its
`currentColor` underline still computed to the app's blue accent.

**How to apply:** Sample foreground and decoration independently under both
light and dark forced-color palettes; use `LinkText` for anchor decorations
and `ButtonText` for button decorations without opting out of forced colors.
