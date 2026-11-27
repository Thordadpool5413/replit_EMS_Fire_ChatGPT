---
name: Google Maps marker compatibility
description: Avoid the Replit metadata attribute conflict with Google Maps PinElement.
---

Use a small image or other ordinary DOM child inside `AdvancedMarker` instead of the vis.gl `Pin` component or deprecated `Marker` class in this workspace. Keep the marker compact and use normal Google Maps polygons and info windows.

**Why:** Replit adds `data-replit-metadata` to marker nodes; Google Maps rejects that property when constructing a `PinElement`. The older `google.maps.Marker` also emits a deprecation warning.

**How to apply:** When using `@vis.gl/react-google-maps`, verify map rendering in the browser after a workflow restart. Use a compact `<img>` child for recognizable map pin artwork; avoid `PinElement` and deprecated `Marker`.
