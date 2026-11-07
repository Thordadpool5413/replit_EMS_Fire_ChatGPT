---
name: Translucent overlay contrast
description: Composite nested translucent backgrounds in the correct order when measuring text contrast.
---

When computing text contrast over translucent surfaces, collect the element's background layers and composite them from the outermost opaque ancestor to the text's nearest surface. Reversing this order can turn a dark tooltip over a light page into a false white background sample.

**Why:** Browser checks for fixed dark GIS overlays run over both light and dark page surfaces; reversed alpha compositing produced false contrast results.

**How to apply:** For browser readability checks, composite each foreground layer over its parent background in CSS painting order before calculating contrast.
