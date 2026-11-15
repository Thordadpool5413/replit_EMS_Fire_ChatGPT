# NPPES bulk staging

Run locally against an official NPPES dissemination ZIP or extracted CSV:

```sh
python scripts/data/stage_nppes.py /path/to/nppes.csv /path/to/staged.ndjson --reporting-period 2026-11 --source-url https://download.cms.gov/nppes/NPI_Files.html
```

The tool streams the file and selects Type 2 organizations with ambulance taxonomy. Output contains a source manifest, unreviewed identity candidates and a summary of received, accepted, excluded, rejected and duplicate rows. It retains source update, deactivation and reactivation dates. A repeated NPI retains its first row and is counted as a duplicate; it is not automatically reconciled. Output replaces its destination only after successful completion; malformed input leaves previous output intact.

This is a staging tool, not a deployed importer. It neither downloads the nationwide file nor populates production accounts. Review candidates and entity relationships before integrating them. State licenses, fire registries, operating locations and billing organizations remain distinct. Bulk files are not committed to Git.

Test with `python -m unittest discover -s scripts/data -p 'test_*.py'`.

## Bundling a reviewed source snapshot

```sh
python scripts/data/bundle_nppes.py /path/to/staged.ndjson artifacts/ems-territory-intelligence/public/registry/nppes
```

The bundler creates a source index and deterministic gzip/base64 state shards with SHA-256 checksums of their uncompressed contents. Settings → Bulk NPPES directory can load the bundled snapshot or import a prepared NDJSON file. Neither path merges registry candidates into operating agency profiles. The browser stores its directory in IndexedDB and supplies a separate export/restore file; the general workspace backup does not include this bulk store.
