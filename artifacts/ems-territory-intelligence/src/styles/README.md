# Style ownership and cascade

`../index.css` is an import manifest, not a place for fixes. There are no new
cascade layers: adding layers would change the priority of existing `!important`
declarations and Tailwind utilities.

## Owners

| Directory | Owns |
| --- | --- |
| `shared` | Three palettes, Tailwind token bindings, base typography, reusable surfaces, controls, tables, workspace spacing/tabs/loading and utility-color compatibility |
| `shell` | TopBar, desktop sidebar, mobile header/navigation, logos, theme selector and shell-relative profile overlay placement |
| `home` | National map, toolbar, inspector, legend, shortcuts and responsive cartographic frame |
| `territory` | Territory explorer, geographic selection header, agency directory and surviving county layout hooks |
| `profile` | Provider dossier, summary, actions and evidence presentation |
| `specialist` | Specialist/data-management workspace presentation |
| `opportunities` | Lead queue cards, PulseIQ factor disclosure, Opportunities/contract and Field Work phone touch sizing |
| `county` | Current `cv-*` state/county maps, county records, inline source figures/table and map keyboard focus |

## Why the phases remain

Within each phase, shared rules generally load before scoped presentation.
The records phase is the deliberate exception: the existing shared laptop
density rules came after county/profile records and must keep that precedence.
Shared surface control sizing also follows territory's earlier phone defaults;
`shared/surfaces-controls.css` preserves that existing equal-specificity order.
Phases retain the historical sequence of initial rules, surface treatments,
responsive density, records, theme application, then current contracts. Rules
for the same selector retain their declaration order and media conditions.
The split deliberately does **not** attempt to rewrite every historical
specificity relationship at once.

- `foundation`: palette values, base primitives and theme-select defaults.
- `initial`, `surfaces`, `responsive`, `records`: existing presentation grouped
  by owner. These names are cascade slots, not additional design systems.
- `theme-bridge`: compatibility for hardcoded utility colors and old palette
  aliases. This must follow historical presentation until its consumers use
  semantic tokens directly.
- `contracts`: current workspace-loading/tabs, sidebar and `cv-*` layouts.

Make changes in the owning rule. Do not add another “final override” to the
manifest or create a new phase. Keep selectors scoped to their owner. Update
the relevant existing responsive rule rather than appending a media query
elsewhere. The small Home records/theme-bridge files are intentional cascade
slots; folding them into earlier files would move their priority.

## Specificity conflicts still requiring care

These are retained dependencies, not invitations to add stronger selectors:

1. **Utility color bridge:** `shared/theme-bridge.css` matches exact/arbitrary
   Tailwind class attributes under `.pi-app-shell` and Radix portals, often with
   `!important`. These declarations can beat a component's utility colors.
   Convert consumers to semantic tokens before removing the corresponding
   mappings. Never extend these remaps to SVG fills/strokes, map legends or
   source-defined risk colors. Recharts text/grid mappings are chart-specific.
2. **Sidebar theme bridge versus layout:** `shell/theme-bridge.css` retains
   high-specificity `html.dark[data-theme="miami-vice"]` selectors. The current
   `.pi-primary-sidebar .pi-primary-nav .pi-sb-item` contract owns geometry,
   row states and focus in `shell/contracts.css`. Do not restore historical
   child-grid placement or short-height rail layouts from older phases.
3. **Generic workspace density versus workspace rules:** the shared phase
   modules still match utility classes such as `p-6`, `gap-6`, and `rounded-xl`
   under `.workspace-grid-shell`. Some declarations are important. A change
   to those selectors affects more than one workspace; check the scoped Home,
   territory and profile modules instead of compensating globally.
4. **Provider/territory palette aliases:** scoped `--atlas-*` and
   `--briefing-*` aliases in their theme bridges intentionally replace earlier
   decorative colors. A new palette must continue to resolve these aliases
   through the shared `--pi-*` tokens.
5. **Focus:** shared base, shared control, shell dark-mode, and current sidebar
   focus selectors coexist. Test keyboard-visible focus, especially selected
   navigation in Miami Vice; do not remove the more specific rules solely
   because a generic `:focus-visible` exists.

## Removed markup

Old county directory cards, county inspector metric/disclosure structures,
county summary panels, county profile cards and the collapsed figure-source
controls are no longer rendered. Their selectors were removed after checking
all application TypeScript/TSX sources, including dynamic class-name stems.
Surviving hooks such as `county-state-map-panel`, `county-inspector-panel`,
`county-single-map-svg`, `county-profile-city-list` and the source-table wrapper
remain because current markup and browser checks use them.

## Checks

- `pnpm --filter @workspace/ems-territory-intelligence test:style-ownership`
- Existing typecheck and production build
- `test:county-polish`, `test:navigation-layout`, `test:theme-readability`

The ownership check ensures the manifest imports every module once, keeps
phases ordered, and catches reintroduced unused county selectors. Browser
checks remain responsible for actual geometry, keyboard focus, logo crop,
source-defined map colors and contrast in all three palettes.
