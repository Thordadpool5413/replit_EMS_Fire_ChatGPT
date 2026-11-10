# Theme readability checks

Run from the workspace root. GIS-only checks use a fresh Chromium session for
each **viewport × theme × layer × check type**, testing both basemaps. All
existing source-color, marker, legend, contrast, heat-pixel, hexbin direction,
choropleth risk and AED missing-source assertions remain active.

Preview a plan without starting a browser:

```sh
THEME_TEST_WIDTH=1280 node scripts/check-theme-readability.mjs --list-gis-groups
```

Run one independently selectable group (normally well below the five-minute
shell execution limit):

```sh
THEME_GIS_ONLY=1 THEME_TEST_WIDTH=1280 \
THEME_GIS_THEMES=dark THEME_GIS_LAYERS=survival THEME_GIS_CHECKS=kde \
node scripts/check-theme-readability.mjs
```

Selectors accept comma-separated values:

- `THEME_GIS_THEMES`: `daylight`, `dark`, `miami-vice`. Default: daylight and dark,
  preserving the original GIS-only coverage.
- `THEME_GIS_LAYERS`: `ohca`, `survival`, `aed`, `transport`. Default: all.
- `THEME_GIS_CHECKS`: `legend`, `kde`, `hexbin`, `choropleth`. Default: all.
  OHCA has legend checks only; no new OHCA risk assertions are invented.
- `THEME_TEST_WIDTH`: one existing width: 390, 767, 768, 820, 1024, 1280.
  Default: all six. Select one width for bounded invocations.
- `THEME_GIS_GROUP_TIMEOUT_MS`: default 90000; maximum 240000. Includes browser
  startup and page loading. Cleanup gets a short additional grace period.
- `THEME_TEST_URL`: override the app URL; use the artifact preview URL when
  API-backed data is needed.

`THEME_GIS_RISK_ONLY=1` retains the risk-only subset (no legend groups).
GIS filters require one of the GIS-only modes, so they cannot silently narrow a
full readability run. Other existing focused modes and full-suite assertions
remain unchanged.

A complete single-width GIS run has 26 groups. Run separate theme/layer/check
selections in separate shell invocations if the combined plan exceeds the
execution budget, or run the full plan as a background shell. START/CHECK/PASS
lines identify progress and elapsed group time. PASS is emitted only after
browser cleanup. A failing group prints its exact rerun command.

Group-budget expiry and SIGINT/SIGTERM exit with code 2 and report INCOMPLETE,
not a visual assertion failure. Assertion/setup failures exit with code 1.
Earlier group passes do not imply that unfinished groups passed. Chromium's
process group and temporary profile are cleaned up on success, error, budget
expiry, and catchable termination signals. No program can clean up after
SIGKILL, so select small groups rather than relying on an external hard kill.

Planner regression checks (no browser required):

```sh
node --test scripts/check-theme-readability.test.mjs
```
