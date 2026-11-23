# EMS & Fire: Desktop-to-mobile visual parity contract

Date: November 23, 2026  
Baseline reviewed: `main` commit `a15305adcb4d4469e9d75aeaa4ec5dd993f86fff`

## Product direction

The **existing desktop application is the single visual source of truth** for the installed mobile PWA. This keeps the application brand intact while intentionally replacing the provider-profile's prior beige/red palette with a shared crisp white, slate and blue presentation on desktop **and** mobile. Mobile should feel like the same application with more disciplined hierarchy, smaller screens, touch controls, and responsive reflow.

### What is non-negotiable

- **Identity:** same original logo, product name, app icons, color meanings, icons, and typography as desktop.
- **Themes:** preserve desktop's Daylight, Dark and Miami Vice variants throughout the broader app. The provider dossier intentionally uses one readable light presentation across viewport sizes, and should never bring back the old orange/beige/red palette.
- **Profile palette:** the user rejected the warm provider-profile coloring. `profile/contracts.css` now owns a **shared desktop/mobile profile palette**: canvas `#F6F8FB`, card `#FFFFFF`, primary ink `#17243A`, borders `#E2E8F0`, action `#1B66C9`. Only meaningful warning and verified-source states may use semantic red or green; the active topic is always blue. The rest of the application retains its existing desktop-led identity.
- **Information:** retain all original EMS/Fire content, tabs, account actions, equipment information, decision makers, map layers, source timestamps, verification statuses, and user data. Mobile may organize them into contextual sections, sheets, or disclosures, but not remove capabilities.
- **Trust:** source-confirmed, user-reviewed, estimated, unavailable, and unsynced states must remain visibly different and never imply a level of validation not supported by the data.

### Responsive differences are desirable

| Element | Desktop behavior | Mobile/PWA behavior |
| --- | --- | --- |
| Main navigation | Existing sidebar with shared workspace glyphs | Bottom navigation with **the exact same glyph mapping** from `WorkspaceIcon`; long-tail tools under More |
| Identity/header | Original logo and current workspace | Same logo and title, compact Near me / Search / More actions |
| Home map | Full US map and related inspector | Same map colors and labels, correctly scaled and touch-accessible; filters in disclosures |
| Agency directory | Multi-column cards/controls | Same card visual vocabulary, single-column or compact rows, quick search and meaningful status labels |
| Agency profile | Crisp white/slate/blue identity, topic navigation, forms and evidence | The exact same visual palette and content, but concise first-screen summary, clear action row and progressive disclosure |
| Reports and tools | Broad tables and charts | Responsive cards and local horizontal scrolling for genuinely tabular information |
| Inputs and dialogs | Desktop pointer/keyboard controls | 44px touch targets, 16px editable inputs, safe-area spacing, accessible bottom sheets |

## Code-grounded mismatches and corrections

1. `shared/foundation.css` defines the base desktop themes and semantic tokens; the original `shell/contracts.css` phone selectors replaced these with rust/orange colors. The active branch switches those controls back to the **same semantic tokens** used across desktop.
2. The original `home/contracts.css` phone-map controls introduced a second warm UI palette even though desktop Home uses a white/navy/blue map treatment. The active branch replaces the mobile-only warm controls with desktop tokens, retaining the map data palette.
3. The original `MobileBottomNav.tsx` duplicated icon definitions, including a home-map glyph different from the desktop sidebar. The active branch reuses `WorkspaceIcon` for each primary destination.
4. The new user instruction explicitly requests a clean, white premium look for **all individual provider profile cards, tabs, and pages**. `profile/contracts.css` now intentionally harmonizes shared desktop/mobile provider-profile colors and preserves targeted phone-only reflow rules. Non-profile desktop workspaces remain unchanged.
5. `styles/README.md` documents a complex CSS cascade including high-specificity legacy theme bridges. Future mobile work should modify the owning responsive CSS module or existing selector. Do not append random `!important` patches or switch component styling to a new global palette.

## Focused mobile EMS/Fire provider-profile implementation

The profile is a single full-screen workspace, not two stacked mobile navigation systems.

- `App.tsx`: suppresses the regular five-destination app navigation while the provider dossier is open. The profile has its own visible Back control.
- `FocusedProviderProfile.tsx`: replaces the phone's overflowing comparison/RFP/meeting/route/save/sources/back grid with four actions: **Notes, Route, Save, Sources**. The original full action set remains in **More actions** and the existing tablet presentation. The mobile More menu now includes a visible Close control and dismisses after a selected button.
- `FocusedProviderProfile.tsx`: keeps desktop identity details but compacts phone verification into an evidence note and expandable caveat. The source-completeness percentage is **not** presented as independently verified truth.
- `profile/contracts.css`: shared premium palette for every provider tab and card, restrained blue controls and selection states, white content surfaces, slate typography, uniform shadows and borders, plus phone-only masthead reflow, 22px minimum provider name, readable contact buttons, one compact Explore section picker, safe-area bottom clearance and four-action dock. The provider's **desktop profile** deliberately adopts these same new colors.
- `profile/records.css`: on phones, the secondary account-actions menu is a bounded two-column sheet above the dock, with a stage selector and explicit Close.
- `ProfileCommandOverview.tsx`: the first screen features the monitor/device summary and a **View additional equipment & software** disclosure. The underlying six category rows remain mounted and are available when expanded; all six categories remain accessible in the Equipment topic.
- `scripts/check-profile-overflow.mjs`, `scripts/check-profile-polish.mjs` and `scripts/check-profile-redesign.mjs` assert a single usable phone dock, expand inventory for stress tests, and require consistent cool-neutral background, white header/navigation, and blue action tokens on both phone and desktop.

The work preserves current EMS/Fire data, agency identifiers, real or missing values, review workflows, sources, geography links, and all existing content areas. **Do not merge without responsive screenshots and passing browser tests.**

## Remaining improvements before calling this polished

- **Mobile home:** verify recognizable state labels, responsive map fit, pan/zoom behavior, readable legend and no accidental document zoom.
- **Agency cards:** compare desktop versus mobile screenshots at matched theme; fix oversized spacing, cut-off labels, inconsistent actions, missing and ambiguous evidence badges.
- **Profiles:** compare EMS and Fire variants across every section. Reduce on-screen clutter and redundant headings without removing data or falsely upgrading evidence statuses. Retain semantic warnings and source-review cues without coloring entire cards by category.
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

**Verification status:** GitHub Actions runs the unit suite, typecheck, production build, style ownership checks, and read-only Chromium screenshots for profile pages. Validate the latest commit's workflow result and inspect generated EMS/Fire captures before merging. Physical iPhone and Android standalone PWA checks remain outstanding.
