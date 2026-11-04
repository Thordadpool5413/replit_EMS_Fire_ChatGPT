---
name: Landscape map breakpoints
description: Responsive browser checks for phone landscape sizes that cross desktop CSS breakpoints.
---

Treat the emulated CSS viewport width—not the test device's `mobile` flag—as the source of truth for which responsive layout and controls are present.

**Why:** Landscape phone widths such as 844px and 932px exceed the app's 768px responsive breakpoint, so they show desktop navigation and zoom controls rather than the mobile bottom bar and Tools menu.

**How to apply:** When adding viewport checks, assert the controls and navigation that the page actually renders at each width. Verify map, filters, zoom, and shortcuts can be reached within the selected layout.
