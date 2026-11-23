# Precision White: Mobile/PWA UX audit and redesign specification

Audit date: 2026-11-23  
Target: `artifacts/ems-territory-intelligence`  
Baseline: `main` at `a15305adcb4d4469e9d75aeaa4ec5dd993f86fff`

## Scope and verification

This audit is grounded in repository source code, not a verified physical-phone screenshot. The mobile-first color unification in this branch is a limited first implementation pass. **Do not declare the mobile redesign complete until the browser and device matrix below passes.**

## Confirmed findings from source

1. **Fragmented palette ownership.** `shared/foundation.css` defines a cool neutral/blue Daylight theme, while `profile/contracts.css` overrides it with warm cream, brown, and rust colors, and `shell/contracts.css` contains several successive mobile-only palette overrides. The resulting experience is likely to look inconsistent across screens. This branch aligns the profile, mobile shell accents, and map controls to the shared white/navy/cobalt direction.
2. **CSS cascade fragility.** `index.css` deliberately imports many style phases, and the style ownership README documents high-specificity `!important` overrides, legacy theme bridges and dependencies. Prefer changes within existing owners. Do not append a catch-all patch to `index.css`.
3. **Mobile navigation overload.** `MobileBottomNav.tsx` exposes Map, Agencies, Field, Reports, and More; the More panel has Territory, Field work, Opportunities, Specialist, and System groups. This is functional, but information architecture must be tested with actual field-rep tasks. Consider surfacing Search / Nearby / Saved / Route as contextual actions rather than adding more primary tabs.
4. **Overgrown profile surface.** `FocusedProviderProfile.tsx` is ~211KB, with a sticky header, identity header, action dock, records, review status and many topic-specific presentations. Optimize first-screen hierarchy: agency name, verified status / source period, city, three field actions, and next recommended step before deeper intelligence.
5. **Competing header controls.** `TopBar.tsx` includes location, Near Me, provider search, utilities, sync, theme and install actions. Keep the first row compact; move secondary actions into a labeled settings sheet.
6. **Map interaction complexity.** `HomeHubView.tsx` includes region filters, map metrics, a zoom range, detail panels, state search/browse and selection. On phones, state names should remain readable and the map should be the hero; filters should be progressive rather than persistent clutter.
7. **PWA verification gap.** A proper manifest, installed-app actions and lifecycle code exist. `docs/mobile-pwa-enhancements.md` states that physical installation, keyboard transitions and offline reopen are unverified; the audit script has substantial coverage but browser execution must actually succeed before trusting it.

## Design intent

- **Identity:** Precision White. White `#FFFFFF` base, navy `#14283F` primary text, slate `#53657A` secondary, cobalt `#2456C8` for actions. Teal reserved for actual positive/verified states, amber for cautions, red for critical exceptions.
- **Type:** Use the existing Instrument Sans variable family for interface text and Manrope for meaningful page headings. 16px body inputs to avoid iOS focus zoom. Avoid 9–11px critical data on phones.
- **Surface:** Small, purposeful card radii (10–14px), subtle borders, near-invisible shadows. Use white space inside a compact hierarchy, not giant panels.
- **Icons:** Keep one semantic Lucide icon per action and a consistent stroke weight. Never use brand/color changes to imply verified data.
- **Trust:** Visually differentiate **Source verified**, **User reviewed**, **Estimated**, **Not reported**, and **Sync pending**. Never treat model scores as audited field outcomes.
- **Map:** Color encodes the selected metric, not aesthetic state categories. Preserve missing/zero data distinction and readable legend. Allow horizontal map navigation without accidental page-wide zoom.
- **Phone UI:** One clear title, one meaningful primary action, then a small set of priorities. Avoid repeating tool navigation and breadcrumbs on every screen.

## Recommended screen model

| Screen | First-screen priority | Secondary reveal |
| --- | --- | --- |
| Home / Map | Legible US map, search, Near me, selected geography | Metric controls, legend, raw data coverage |
| Agencies | Search and filters, compact provider result cards with location and source status | Comparison, batch actions |
| Provider profile | Name, EMS/Fire type, city, credibility state, Call / Directions / Next action | Equipment, contracts, decision makers, sourcing |
| Field | Today’s route, next visit, quick note, next follow-up | Historical logs, exports |
| Reports | Priority opportunity and actionable insights | Methodology, detailed tables, downloadable reporting |
| Settings | Sync, backup, update/install status | Data tools and detailed configuration |

## Implementation sequencing

1. **P0: Consistent visual identity.** Align shell, home controls and profile (partial first pass in this PR); preserve the three-theme architecture and do not clobber semantic metric colors.
2. **P0: Trust-first profile.** Audit exact agency status labels, missing values, timestamps, data provenance and above-the-fold ordering.
3. **P0: Navigation and keyboard.** Validate 320–430px screens, tab selection, More sheet, Escape, outside dismiss, keyboard and PWA safe areas.
4. **P1: Map.** Mobile camera behavior, state-selection legibility, region controls and zoom/pan interactions. Ensure zero and unavailable data are never visually conflated.
5. **P1: Cards and tables.** Reduce redundant padding and title duplication; allow dense data to disclose or scroll locally, with visible affordances.
6. **P1: PWA finish.** Icons, maskable safe zones, iPhone home screen, app re-opening, service worker updates, caching, offline boundaries and browser-specific status bar colors.

## Acceptance matrix

- Width: 320, 360, 375, 390, 414, 430px; portrait and landscape; and tablet at 768/1024px.
- Devices: iPhone Safari and installed standalone PWA; Android Chrome and installed PWA; desktop Safari/Chrome regression.
- Interactions: TopBar search; Near me; map state selection, zoom and reset; provider profile; Call/Directions; review; follow-up; saved route; Reports; Settings; More menu; sync and installation instructions.
- Accessibility: keyboard and VoiceOver/TalkBack focus order, 44px minimum primary touch target, focus visibility, readable contrast, dynamic/enlarged text, reduced motion, no horizontal document overflow or clipped controls.
- Data: distinguish unknown/estimate/source-verified/reviewed; never show simulated opportunity metrics as confirmed results.
- Quality gates: `pnpm --filter @workspace/ems-territory-intelligence typecheck`; `pnpm --filter @workspace/ems-territory-intelligence build`; `pnpm --filter @workspace/ems-territory-intelligence test:style-ownership`; `pnpm --filter @workspace/ems-territory-intelligence test:mobile-nav-a11y`; `pnpm --filter @workspace/ems-territory-intelligence test:mobile-nav-labels`; `node scripts/check-mobile-pwa.mjs` against a running build; physical PWA installation.
- Review screenshot pairs side-by-side at equal width; require no regression in contrast or visibility for Night and Miami Vice variants.

## Do not regress

Keep the desktop layout, real account data, source badges, map metric palette, Fire/EMS navigation, profile forms, local drafts, offline outbox, cloud sync and PWA update flows. Preserve existing deep links and agency-review confirmation.
