# EMS & Fire: Desktop-to-mobile visual parity contract

Date: November 23, 2026  
Baseline reviewed: `main` commit `a15305adcb4d4469e9d75aeaa4ec5dd993f86fff`

## Product direction

The **existing desktop application is the single visual source of truth** for the installed mobile PWA. This is **not** a new brand, a new "Precision White" theme, or a full-screen desktop layout squeezed into a phone. Mobile should feel like the same application with more disciplined hierarchy, smaller screens, touch controls, and responsive reflow.

### What is non-negotiable

- **Identity:** same original logo, product name, app icons, color meanings, icons, and typography as desktop.
- **Themes:** preserve desktop's Daylight, Dark and Miami Vice variants. Use the same design tokens and active theme; do not hard-code a special orange/beige/red "mobile theme" or invent a fourth palette.
- **Page personality:** respect page-specific desktop styling. For example, the existing agency profile has a deliberately warm presentation in `profile/contracts.css`. The previous attempt incorrectly recolored **both** desktop and mobile profile styling and was reverted.
- **Information:** retain all original EMS/Fire content, tabs, account actions, equipment information, decision makers, map layers, source timestamps, verification statuses, and user data. Mobile may organize them into contextual sections, sheets, or disclosures, but not remove capabilities.
- **Trust:** source-confirmed, user-reviewed, estimated, unavailable, and unsynced states must remain visibly different and never imply a level of validation not supported by the data.

### Responsive differences are desirable

| Element | Desktop behavior | Mobile/PWA behavior |
| --- | --- | --- |
| Main navigation | Existing sidebar with shared workspace glyphs | Bottom navigation with **the exact same glyph mapping** from `WorkspaceIcon`; long-tail tools under More |
| Identity/header | Original logo and current workspace | Same logo and title, compact Near me / Search / More actions |
| Home map | Full US map and related inspector | Same map colors and labels, correctly scaled and touch-accessible; filters in disclosures |
| Agency directory | Multi-column cards/controls | Same card visual vocabulary, single-column or compact rows, quick search and meaningful status labels |
| Agency profile | Original identity, topic navigation, forms and evidence | Same colors and content, but concise first-screen summary, clear action row and progressive disclosure |
| Reports and tools | Broad tables and charts | Responsive cards and local horizontal scrolling for genuinely tabular information |
| Inputs and dialogs | Desktop pointer/keyboard controls | 44px touch targets, 16px editable inputs, safe-area spacing, accessible bottom sheets |

## Code-grounded mismatches and corrections

1. `shared/foundation.css` defines the base desktop themes and semantic tokens; the original `shell/contracts.css` phone selectors replaced these with rust/orange colors. The active branch switches those controls back to the **same semantic tokens** used across desktop.
2. The original `home/contracts.css` phone-map controls introduced a second warm UI palette even though desktop Home uses a white/navy/blue map treatment. The active branch replaces the mobile-only warm controls with desktop tokens, retaining the map data palette.
3. The original `MobileBottomNav.tsx` duplicated icon definitions, including a home-map glyph different from the desktop sidebar. The active branch reuses `WorkspaceIcon` for each primary destination.
4. `profile/contracts.css` intentionally styles the provider profile across viewport sizes. The previous PR changed that **shared** desktop experience. That file is restored exactly to `main`.
5. `styles/README.md` documents a complex CSS cascade including high-specificity legacy theme bridges. Future mobile work should modify the owning responsive CSS module or existing selector. Do not append random `!important` patches or switch component styling to a new global palette.

## Remaining improvements before calling this polished

- **Mobile home:** verify recognizable state labels, responsive map fit, pan/zoom behavior, readable legend and no accidental document zoom.
- **Agency cards:** compare desktop versus mobile screenshots at matched theme; fix oversized spacing, cut-off labels, inconsistent actions, missing and ambiguous evidence badges.
- **Profiles:** compare EMS and Fire variants across every section. Reduce on-screen clutter and redundant headings without changing source-specific colors or removing actions.
- **Navigation:** test Map, Agencies, Field Work, Reports, More, specialist subpages, Back and active state on all screen widths.
- **Visual and functional checks:** typography scale, icon alignment, gradients, shadows, modal clipping, touch hit areas, sticky positioning, side panels, native keyboard and safe areas.
- **PWA:** iPhone standalone installation/reopening, Android installation, splash and icon crop, service-worker upgrade prompts, offline status/sync behavior and recovery.

## Verification requirements

Use side-by-side desktop-versus-mobile screenshots of **the same page and active theme**. Review desktop at 1366x768 and 1440x900; phone widths 320, 360, 375, 390, 414, 430px, and phone landscape. Include iPhone Safari + installed PWA and Android Chrome + installed PWA. Audit both Light/Daylight and alternate themes.

Suggested repository checks:
```bash
pnpm --filter @workspace/ems-territory-intelligence typecheck
pnpm --filter @workspace/ems-territory-intelligence build
pnpm --filter @workspace/ems-territory-intelligence test:style-ownership
pnpm --filter @workspace/ems-territory-intelligence test:mobile-nav-a11y
pnpm --filter @workspace/ems-territory-intelligence test:mobile-nav-labels
node scripts/check-mobile-pwa.mjs
```

**Current verification status:** This branch was edited through the GitHub connector. The available execution container cannot resolve `github.com`, so these changes have not been built, browser-rendered, screenshot-compared, or tested on physical phones. Do not merge or mark the full mobile polish done based on this initial parity pass.
