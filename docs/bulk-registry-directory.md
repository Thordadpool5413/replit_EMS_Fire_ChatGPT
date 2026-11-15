# Bundled national NPPES registry directory

Built locally and delivered through GitHub main. No deployment performed.

## Included source snapshot

- Source: https://download.cms.gov/nppes/NPPES_Data_Dissemination_November_2026_V2.zip
- Release: November 9, 2026 monthly Version 2 file.
- Source records scanned: 9,891,116.
- Selected: 20,554 Type 2 organizations with ambulance taxonomy.
- Excluded by scope: 9,870,562. Invalid selected NPIs: 0. Duplicate selected NPIs: 0.
- 67 compressed, checksum-protected shards, approximately 1.1 MB total including metadata.

The source includes registry entities with deactivation/reactivation dates and locations outside the fifty states. The snapshot does not establish active operations, licensing, equipment ownership, purchasing authority or completeness of fire-department coverage.

## User workflow

Settings → Bulk NPPES directory → Load bundled national registry snapshot. The app checks every part, validates identifiers and reconciles the manifest before atomically saving a device-local IndexedDB snapshot. Search by name, alternate name, NPI or location. Inspect source update and deactivation/reactivation dates; open the official NPI record. Operating agency associations remain unreviewed and existing profiles/corrections are unchanged.

Prepared NDJSON can also be imported. A successful import replaces this bulk directory, not agency profiles. Export registry backup before replacing it if needed. This separate export is required: the general workspace backup does not include the bulk IndexedDB store.

## Validation

195 frontend unit/component tests and one Python pipeline test passed, along with TypeScript, stylesheet ownership, persistence regression and production build. The actual bundled loader validated all 20,554 real records and all shard hashes. Tests cover malformed files, duplicate NPIs, mismatched counts, altered shards, ZIP processing and preservation of previous staging output on failure.

Real browser IndexedDB transactions and physical mobile interaction remain unverified because the interactive browser environment is blocked. Legacy generated values still require migration in remaining direct consumers; this release additionally prevents unreferenced generated values from being exposed by the fact-value accessor and labels overview equipment rows.

Source archive SHA-256: `c5a34fba9b2e04bcb87358a1e3f9f4bbfc79b49b71fb37b71f9de43570c18713`.
