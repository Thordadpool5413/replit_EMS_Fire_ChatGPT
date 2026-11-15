# Import quality and estimate boundaries

Built and tested locally; GitHub main is the delivery target. No deployment.

- Settings displays the latest 100 recorded source-backup and aggregate-claims save/import outcomes, with export. Counts distinguish unknown from zero. Existing conflicts remain untouched. Receipt persistence failure does not misreport a successful import as failed. Import receipt history is included in workspace backup/restore.
- Generated equipment values are excluded from reported equipment CSV columns by default. User-corrected fields remain exportable. An explicit checkbox includes a separate planning-estimates column.
- Generated score factors without mapped agency evidence contribute no opportunity points; the factor explanation identifies excluded generated inputs. This is not an assertion that the agency has zero activity or zero equipment.
- Added a streaming Python tool for staging an extracted official NPPES bulk CSV. It validates NPI identifiers, filters organization ambulance taxonomy, deduplicates candidates and preserves source/deactivation metadata. Its output is unreviewed NDJSON with source manifest and quality counts. Atomic replacement protects prior output if staging fails.

Validation: 191 unit/component tests, one Python staging test, TypeScript checks, persistence regression and frontend production build.

Limitations: bulk staging is not national data ingestion into the deployed app. No national file was downloaded or loaded. The history covers newly recorded source-backup and aggregate-claims saves, not every upstream fetch or earlier import. Legacy generated numbers still exist in the model; this release protects scoring and exports rather than claiming every consumer has completed an optional-value migration. Physical-device, live-source and rendered-browser verification remain outstanding.
