---
name: Google Maps marker compatibility
description: Avoid the Replit metadata attribute conflict with Google Maps PinElement.
---

Use ordinary DOM marker content inside `AdvancedMarker` instead of the vis.gl `Pin` component in this workspace. Keep the marker compact and use normal Google Maps polygons and info windows.

**Why:** Replit adds `data-replit-metadata` to marker nodes; Google Maps rejects that property when constructing a `PinElement`.

**How to apply:** When using `@vis.gl/react-google-maps`, verify map rendering in the browser after a workflow restart. If a `PinElement` reports an unknown `data-replit-metadata` property, replace the `Pin` with a plain HTML child and CSS.
