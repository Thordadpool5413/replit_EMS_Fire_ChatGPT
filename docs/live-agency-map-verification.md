# Live agency-map verification

Verified November 10, 2026 against the running development artifact and the real
Google Maps JavaScript SDK. No SDK mock, API-key inspection, key configuration,
database writes, or production changes were used.

## Results

| Case | Result |
| --- | --- |
| Desktop camera | Mouse drag changed the real map center. Native Zoom in changed zoom. The resulting camera persisted through idle and a Terrain-style rerender. |
| Filter target | Narrowing the PulseIQ range to one synthetic agency moved the camera to that agency's coordinates and the county target zoom. A filter-induced target change is an intentional camera move, not a persistence failure. |
| Multiple coordinates | Fit area contained all five fixture coordinates in SDK `getBounds()`, including the original coordinates of clustered agencies. |
| One marker | Fit area centered on the agency at zoom 12. |
| Zero markers | Fit area returned to the current implementation's Illinois-area fallback, zoom 10 for county scope, without passing invalid bounds to Google. |
| Identical coordinates | Both agencies remained in an inspectable overlap cluster and inside the fitted bounds. |
| Phone one-finger gesture | At 390 × 844, Chromium touch input scrolled the page without changing map center/zoom. |
| Phone two-finger gesture | Simultaneous touch input moved/zoomed the map without scrolling the page. |

The deterministic fixture mounts the unchanged production component in an
isolated browser session. Its five synthetic agency records exercise exact
counts without changing application data. The component obtains its configured
key normally; the harness does not read or log that key.

A separate browser pass also confirmed real Google basemap tiles, native zoom,
Fit area across distant live-data locations, overlap-cluster inspection, and
the live-data zero-result view. Its initial concern about recentering after
selecting EMS was withdrawn: that interaction changes the territory target.
The deterministic check above verifies persistence across an unrelated rerender.

Seven marker-grouping unit tests pass, covering empty/single sets, distinct
markers, input preservation, transitive collisions, zoom-dependent separation,
and identical coordinates. The app type-check passes.

## Repeat the checks

Start the existing web workflow, then run from the workspace root:

```sh
pnpm --filter @workspace/ems-territory-intelligence run test:map-markers
LIVE_MAP_TEST_URL="https://$REPLIT_DEV_DOMAIN/" \
  pnpm --filter @workspace/ems-territory-intelligence run test:live-agency-map
```

The live check requires the installed Chromium binary, the development Vite
module endpoints, network access to Google, and an already configured Maps key
authorized for the development host. It deliberately fails rather than
substituting a mock. It prints only authored assertions and sanitized results,
not browser network logs or SDK request URLs.

## Limits and separate findings

- Phone checks use Chromium touch emulation, not a physical iOS/Android device.
- Tests target camera/filter/Fit behavior, not correctness of the agency dataset.
- The live-data pass saw nationwide agencies after selecting a state in the
  launcher. The launcher's separate state/county callbacks should be checked
  independently; this does not invalidate the explicit-prop camera checks.
- The current no-results fallback is fixed near Illinois, even for other
  territories. This run confirms safe camera behavior, not geographic accuracy
  of that fallback.
- The harness first reached all passing assertions but encountered a temporary
  Chromium profile cleanup race. Cleanup now retries transient directory-busy
  errors; no application assertion failed in that run.
