# Card density and readability

Based on three supplied laptop screenshots showing a Florida county preview, county directory, and Alachua provider view.

The county directory used equal-height grid rows across the complete collection, causing short records to inherit the tallest row. It now uses natural row heights and content-sized cards. County header/body gaps, FEMA bands and large figures are reduced, targeting approximately 30% less non-map card footprint without scaling the app or shrinking all text. The exact rendered reduction has not been measured.

Agency-card names, product summaries, and related descriptions no longer stop at a two-line clamp; table product descriptions wrap instead of truncating. County figure labels and values can wrap; long labels no longer depend on nowrap. County city lists flow naturally on desktop as well as mobile instead of clipping the last visible row inside a capped list. The provider identity band explicitly owns white title/icon ink and light context ink; its more specific selectors resolve competing light-surface heading rules. The selected card/table control also has an explicit contrasting foreground/background pair.

Desktop non-map compact-workspace padding and gaps are reduced through the existing density owner. Map SVG sizing and mobile touch targets are preserved. Sidebar logo grows from 76px to 128px, with 108px on short desktop windows so navigation remains reachable.

Validation: unit suite, workspace types, production build, built-module references, style ownership and whitespace checks. Browser geometry, exact percentage reduction, and physical-device appearance remain unverified until a rendering-capable environment is available. No zoom or transform scaling is used for density.
