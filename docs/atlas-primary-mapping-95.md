# Primary provider mapping: 95% minimum

The denominator is the existing **46,791 source-native primary records**. The
release needs at least **44,452 usable primary mappings**. Station records,
secondary practices, and added identities do not count toward this target.

The published baseline at `0049221` has 31,599 raw mapped records and **31,461
usable records (67.2373%)**. The application withholds 138 pins whose recorded
source county conflicts with the coordinate county. A raw coordinate count is
not the readiness metric.

## Acceptance rules

- Preserve source-native identity, name, source date, original primary address,
  and county evidence. A missing record remains in the denominator.
- Match physical house number and street through documented normalization;
  preserve the source's actual city, state and ZIP. State/ZIP or exact-city
  locality fallbacks require an explicit supported basis.
- Scan complete source inventories before applying uniqueness or coordinate
  reuse checks. Withhold conflicting coordinates and unresolved county points.
- A department-site association is inferred. Retain the exact reciprocal
  identity evidence, original address, reported site role, and a requirement
  for end-user validation. A sole station is never relabeled as headquarters.
- Historical facility points support a physical address location. Their old
  source dates and placement precision do not establish a current headquarters.
- Reproduce new candidates from retained native source evidence and pass the
  same parsers, listing association checks, and county guards used by the app.

## Release procedure

Build into a separate candidate directory with all 51 state/DC shards and the
original identity set. Preserve valid published mappings, explicitly audit
legacy NERIS points, and report every newly withheld conflict. Count only
records that the actual frontend consumes as usable pins.

The `--require-target` gate must fail below 44,452 usable mappings. Passing
source acquisition, unit tests, or a raw coordinate count does not satisfy the
95% requirement. Public location shards are promoted only after the complete
candidate, retained evidence, and frontend coverage gate have passed.

This recovery changes the Git repository. It does not deploy the application
or operate Replit.
