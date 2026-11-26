# Overture source recovery and replay

This branch reconstructs the Overture work that was lost with the executor. It retains source geocodes for review; it does not update the public primary-location snapshot. The original denominator remains the 46,791 identities in the immutable baseline, with index SHA-256 e1f59b47e7d6931714b2defcfd02acefc4013d3dd793ed2081a27df6a3bd0a48.

The workflow first checkpoints code, then downloads fixed public objects, performs every target match locally on the runner, independently replays the retained evidence, freezes newly measured pins, and commits the resulting source evidence using the normal checkout token. Provider addresses are never included in remote acquisition requests.

## Fixed source scope

Both sources use release 2026-11-18.0 from the public Overture S3 bucket.

| Scope | Addresses | Places |
| --- | ---: | ---: |
| Global Parquet objects | 64 | 16 |
| Expected global rows | 475,239,461 | 90,295,748 |
| Required complete US rows | 126,202,222 | 18,806,080 |
| Historical local projection size | 1.99 GB | 0.77 GB |
| Largest historical temporary original | 543 MB | 836 MB |

The global inventory retains object keys, ETags, sizes and Parquet country statistics. Every object whose metadata may contain US rows is downloaded completely and hashed. The actual US projections preserve native addresses and source-file row ordinals. Places also preserves names, phones, existence confidence, operating status and taxonomy. One temporary original file is held at a time, with a 700 MB disk reserve.

The complete-source count gates are mandatory. Bounded acquisition checkpoints never issue a complete-US receipt.

## Source guards

Matching normalizes only the shared conservative street and locality rules. It preserves the reported house number, street spelling, state and ZIP. The enabled bases are normalized street/city/state/ZIP and normalized street/state/ZIP. Blank source ZIP matches remain diagnostic.

Both resolvers audit coordinate reuse across every US source row, comparing on a 1e-7-degree grid while retaining the selected coordinates unchanged. Actual normalized state, ZIP and house/street witnesses distinguish physical addresses. Conflicting reported ZIPs remain distinct; city aliases at one ZIP do not invent a second address.

Every pair of eligible native points must agree within 75 metres. County geometry and the original reported county constraint must agree. Positive coordinate, county and distinct-address reuse conflicts remain explicit rejections.

Native NAD wrappers are withheld when the wrapper lacks native lifecycle and placement evidence. Actual source attribution is preserved; explicit noncommercial, no-derivatives or redistribution restrictions are rejected.

Places requires a native reported open status, a nonempty reported name and an existence confidence of at least 0.9. Geographic entities are excluded. The confidence measures reported existence, not location accuracy. A place name does not establish provider identity or an operational headquarters role.

## Durable review outputs

The ordinary source jobs write:

- scripts/data/evidence/primary-overture-addresses/2026-11-26
- scripts/data/evidence/primary-overture-places/2026-11-26

The separate native-target job writes:

- scripts/data/evidence/primary-overture-native-variants/2026-11-26

Each directory contains original.zip and manifest.json. The archive retains the complete inventory and country receipts, exact frozen target scope, selected full native records, report, and actual coordinate-reuse witnesses. A retained release replays without the large projection cache.

The surviving ordinary Address implementation must reproduce its historical report SHA-256 2adb2dc598586af97b9082287a816cc8e0fc238ae9276633bf8518943a41527e and 461 source candidates. The reconstructed ordinary Places implementation must pass complete native replay and its historical 2,744-candidate gate. These are reconstruction checks, not net coverage claims. Archive bytes and the reconstructed Places report may differ from the lost executor; actual measured hashes are frozen explicitly in the review commit.

A failed count or replay check leaves the new release disabled. The workflow preserves available source diagnostics for review instead of substituting a historical hash.

## Native CMS and NERIS scopes

The native variant job consumes target JSON files from explicitly pinned commits in the same repository. scripts/fixtures/overture-native-variant-inputs.json records each commit, exact path, SHA-256 and identity count. fetch_overture_native_inputs.py verifies these fields before matching. prepare_overture_native_variants.py binds every target to an original baseline identity and retains the actual component or agency/site evidence.

The recovered CMS target file contains 609 native primary components and has SHA-256 cac14a8230f8922fadd733308ab3aa7a161ba141e2593c70f3b7861018971305. Its native report has SHA-256 c379d061fb3b500240f4b147337cb7610788a048794a1c504b7ba854d93fe6e9. Earlier lost-workspace target and report hashes are historical only.

Address variants use the CMS scope. Place variants use the combined CMS and NERIS scope. Every matching native row is reacquired from its full original public source object, including rows whose full provenance was unavailable in the lost workspace. A reconstructed catalog may therefore differ from the earlier limited subset. The actual candidate set, rejected witnesses, target hashes and all-pairs checks remain in its separate report.

The catalog certifies a source geocode only. The CMS or NERIS association module must independently replay the original-primary role before enabling a primary mapping. A diagnostic geocode cannot turn a mailing address, station, phone match or organization name into a primary site on its own.

## Runtime APIs

Ordinary entry validation:

    retain_overture_primary_addresses.validate_overture_primary_entry(entry)
    retain_overture_primary_places.validate_overture_place_primary_entry(entry)

Each ordinary module also exports:

    overture_primary_catalog()
    overture_primary_coordinate_witnesses(key)
    overture_coordinate_witnesses_for_match(match, target_address)

The match/address resolver requires exact binding to an accepted ordinary candidate, then checks the separate diagnostic catalog when necessary. It returns every qualified underlying native endpoint, deduplicated by source file, row and Places address ordinal. This lets central consensus check every cross-source endpoint pair and independently recompute each endpoint's county.

Separate native-target APIs:

    retain_overture_primary_variants.overture_diagnostic_catalog(method)
    retain_overture_primary_variants.validate_overture_diagnostic_candidate(candidate, target)
    retain_overture_primary_variants.overture_diagnostic_coordinate_witnesses(method, key)
    retain_overture_primary_variants.overture_diagnostic_witnesses_for_match(match, target_address)

Supported methods are overture-address and overture-place-address. Catalogs include candidates, exact frozen targets, rejected rows, explicit uncertainty and report SHA. Public catalog access returns defensive copies. Candidate validation compares canonical bytes to the fully replayed source candidate and target.

Browser/API contracts pin native ID, actual source file SHA and ETag, row ordinal, native record hash, attribution, coordinates, county, reuse count and precision. Places also pins reported name, confidence, open status and native address ordinal. Separate variant pin files preserve the ordinary catalog boundary.

## Rebuild

Use Python 3.12 with duckdb==2.0.1, pyarrow==26.0.1 and numpy==2.3.5. Install the official httpfs and spatial extensions from https://extensions.duckdb.org.

Ordinary Addresses:

    python3 scripts/data/primary_recovery_baseline.py --retain
    python3 scripts/data/stage_overture_primary_addresses.py --output /tmp/overture-addresses --workers 1 --select-primary
    python3 scripts/data/match_overture_primary_addresses.py --source /tmp/overture-addresses --workers 1
    python3 scripts/data/retain_overture_primary_addresses.py --source /tmp/overture-addresses
    python3 scripts/data/freeze_overture_recovered_release.py --source addresses --expected-candidates 461
    python3 scripts/data/retain_overture_primary_addresses.py --verify
    python3 scripts/data/build_overture_point_fixtures.py --source /tmp/overture-addresses

Ordinary Places:

    python3 scripts/data/stage_overture_primary_places.py --output /tmp/overture-places --workers 1
    python3 scripts/data/match_overture_primary_places.py --source /tmp/overture-places
    python3 scripts/data/retain_overture_primary_places.py --source /tmp/overture-places
    python3 scripts/data/freeze_overture_recovered_release.py --source places --expected-candidates 2744
    python3 scripts/data/retain_overture_primary_places.py --verify
    python3 scripts/data/build_overture_place_point_fixtures.py --source /tmp/overture-places

The scoped workflow is .github/workflows/overture-profile-rebuild.yml. A recovery-branch commit tagged [retain-overture-profiles] runs ordinary sources; a commit tagged [retain-overture-variants] runs the pinned native scopes. Output branches are atlas/overture-addresses-source-RUN_ID, atlas/overture-places-source-RUN_ID and atlas/overture-variants-source-RUN_ID. They contain evidence and code pins for central review, without public-shard changes.

## Official source documentation

- https://docs.overturemaps.org/guides/addresses/
- https://docs.overturemaps.org/guides/places/
- https://docs.overturemaps.org/schema/reference/places/place/
- https://docs.overturemaps.org/schema/reference/system/phone_number/
- https://docs.overturemaps.org/attribution/
