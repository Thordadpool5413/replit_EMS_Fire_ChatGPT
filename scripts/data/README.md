# NPPES bulk staging

Run locally against an extracted official NPPES dissemination CSV:

```sh
python scripts/data/stage_nppes.py /path/to/nppes.csv /path/to/staged.ndjson --reporting-period 2026-11 --source-url https://download.cms.gov/nppes/NPI_Files.html
```

The tool streams the file and selects Type 2 organizations with ambulance taxonomy. Output contains a source manifest, unreviewed identity candidates and a summary of received, accepted, excluded, rejected and duplicate rows. It retains source update, deactivation and reactivation dates. A repeated NPI retains its first row and is counted as a duplicate; it is not automatically reconciled. Output replaces its destination only after successful completion; malformed input leaves previous output intact.

This is a staging tool, not a deployed importer. It neither downloads the nationwide file nor populates production accounts. Review candidates and entity relationships before integrating them. State licenses, fire registries, operating locations and billing organizations remain distinct. Bulk files are not committed to Git.

Test with `python -m unittest discover -s scripts/data -p 'test_*.py'`.
