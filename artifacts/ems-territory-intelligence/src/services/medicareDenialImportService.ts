import { validateNpiCheckDigit } from './npiVerificationService';

export const MEDICARE_DENIAL_IMPORT_EVENT = 'medicare-denial-import-updated';
export const MEDICARE_DENIAL_CSV_HEADERS = [
  'npi',
  'pickup_county_fips',
  'denied_claims',
  'adjudicated_claims',
] as const;

const STORAGE_KEY = 'ems-territory-intelligence.medicare-denial-import.v1';
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 25_000;
const MAX_STORED_CHARACTERS = 2_500_000;

export type DenialDefinition = 'any_service_line_denied' | 'fully_denied_claim';

export interface MedicareDenialImportRow {
  npi: string;
  countyFips: string;
  stateCode: string;
  deniedClaims: number;
  adjudicatedClaims: number;
}

export interface MedicareDenialImportDataset {
  schemaVersion: 1;
  importedAt: string;
  fileName: string;
  claimScope: string;
  reportingPeriod: string;
  denialDefinition: DenialDefinition;
  sourceName: string;
  sourceReference: string;
  sourceUrl?: string;
  coverage: {
    completeProviderGroups: boolean;
    completeProviderTotals: boolean;
    completeCountyTotals: boolean;
    completeStateTotals: boolean;
  };
  rows: MedicareDenialImportRow[];
}

export interface ImportedDenialMetric {
  ratePct: number | null;
  deniedClaims: number;
  adjudicatedClaims: number;
  claimScope: string;
  reportingPeriod: string;
  denialDefinition: DenialDefinition;
  sourceName: string;
  sourceReference: string;
  sourceUrl?: string;
}

export interface MedicareDenialImportReport {
  providerCountyMetrics: Array<ImportedDenialMetric & { npi: string; countyFips: string; stateCode: string }>;
  providerMetrics: Array<ImportedDenialMetric & { npi: string }>;
  countyMetrics: Array<ImportedDenialMetric & { countyFips: string; stateCode: string }>;
  stateMetrics: Array<ImportedDenialMetric & { stateCode: string }>;
}

// County FIPS begins with the Census state FIPS; keep this lookup independent of
// the full compressed map bundle so claims validation does not load geography data.
const STATE_FIPS_TO_CODE = new Map<string, string>([
  ['01', 'AL'], ['02', 'AK'], ['04', 'AZ'], ['05', 'AR'], ['06', 'CA'],
  ['08', 'CO'], ['09', 'CT'], ['10', 'DE'], ['11', 'DC'], ['12', 'FL'],
  ['13', 'GA'], ['15', 'HI'], ['16', 'ID'], ['17', 'IL'], ['18', 'IN'],
  ['19', 'IA'], ['20', 'KS'], ['21', 'KY'], ['22', 'LA'], ['23', 'ME'],
  ['24', 'MD'], ['25', 'MA'], ['26', 'MI'], ['27', 'MN'], ['28', 'MS'],
  ['29', 'MO'], ['30', 'MT'], ['31', 'NE'], ['32', 'NV'], ['33', 'NH'],
  ['34', 'NJ'], ['35', 'NM'], ['36', 'NY'], ['37', 'NC'], ['38', 'ND'],
  ['39', 'OH'], ['40', 'OK'], ['41', 'OR'], ['42', 'PA'], ['44', 'RI'],
  ['45', 'SC'], ['46', 'SD'], ['47', 'TN'], ['48', 'TX'], ['49', 'UT'],
  ['50', 'VT'], ['51', 'VA'], ['53', 'WA'], ['54', 'WV'], ['55', 'WI'],
  ['56', 'WY'],
]);
let countyReferencePromise: Promise<Map<string, string>> | null = null;

function stateCodeForCountyFips(countyFips: string): string | null {
  return STATE_FIPS_TO_CODE.get(countyFips.slice(0, 2)) ?? null;
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"' && value.length === 0) {
      inQuotes = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== '')) records.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (inQuotes) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(value);
  if (row.some((cell) => cell.trim() !== '')) records.push(row);
  return records;
}

export function parseMedicareDenialCsv(text: string): MedicareDenialImportRow[] {
  const records = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  if (records.length < 2) throw new Error('The CSV needs a header and at least one data row.');

  const headers = records[0].map((header) => header.trim().toLowerCase());
  if (
    headers.length !== MEDICARE_DENIAL_CSV_HEADERS.length ||
    MEDICARE_DENIAL_CSV_HEADERS.some((header) => !headers.includes(header))
  ) {
    throw new Error(
      `Use only these four aggregate columns: ${MEDICARE_DENIAL_CSV_HEADERS.join(', ')}. Extra columns are rejected.`,
    );
  }

  const column = Object.fromEntries(headers.map((header, index) => [header, index]));
  const seenGroups = new Set<string>();
  const rows: MedicareDenialImportRow[] = [];

  for (let recordIndex = 1; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (record.length !== headers.length) {
      throw new Error(`Row ${recordIndex + 1} has ${record.length} columns; expected ${headers.length}.`);
    }

    const npi = record[column.npi].trim();
    const countyFips = record[column.pickup_county_fips].trim();
    const deniedText = record[column.denied_claims].trim();
    const adjudicatedText = record[column.adjudicated_claims].trim();

    if (!/^\d{10}$/.test(npi) || !validateNpiCheckDigit(npi)) {
      throw new Error(`Row ${recordIndex + 1} has an invalid 10-digit NPI.`);
    }
    if (!/^\d{5}$/.test(countyFips)) {
      throw new Error(`Row ${recordIndex + 1} needs a five-digit pickup-county FIPS.`);
    }
    const stateCode = stateCodeForCountyFips(countyFips);
    if (!stateCode) {
      throw new Error(`Row ${recordIndex + 1} has a county FIPS outside a supported state or Washington, DC.`);
    }
    if (!/^\d+$/.test(deniedText) || !/^\d+$/.test(adjudicatedText)) {
      throw new Error(`Row ${recordIndex + 1} must use whole-number claim counts.`);
    }

    const deniedClaims = Number(deniedText);
    const adjudicatedClaims = Number(adjudicatedText);
    if (
      !Number.isSafeInteger(deniedClaims) ||
      !Number.isSafeInteger(adjudicatedClaims) ||
      deniedClaims < 0 ||
      adjudicatedClaims < 0 ||
      deniedClaims > adjudicatedClaims ||
      (adjudicatedClaims === 0 && deniedClaims !== 0)
    ) {
      throw new Error(`Row ${recordIndex + 1} has inconsistent or out-of-range claim counts.`);
    }

    const groupKey = `${npi}|${countyFips}`;
    if (seenGroups.has(groupKey)) {
      throw new Error(`Duplicate NPI and pickup-county group on row ${recordIndex + 1}; combine it before import.`);
    }
    seenGroups.add(groupKey);
    rows.push({ npi, countyFips, stateCode, deniedClaims, adjudicatedClaims });

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`The import exceeds the ${MAX_IMPORT_ROWS.toLocaleString()}-row limit.`);
    }
  }

  return rows;
}

async function getCountyReference(): Promise<Map<string, string>> {
  countyReferencePromise ??= import('../data/allCountiesDatabase').then(({ ALL_NATIONWIDE_COUNTIES }) => {
    const counties = new Map<string, string>();
    for (const county of ALL_NATIONWIDE_COUNTIES) {
      const fips = county.countyFips;
      const stateCode = stateCodeForCountyFips(fips);
      if (stateCode) counties.set(fips, stateCode);
    }
    return counties;
  });
  return countyReferencePromise;
}

export async function validateMedicareDenialImportRows(rows: MedicareDenialImportRow[]): Promise<void> {
  const counties = await getCountyReference();
  for (const row of rows) {
    if (counties.get(row.countyFips) !== row.stateCode) {
      throw new Error(`County FIPS ${row.countyFips} is not present in the app's county reference dataset.`);
    }
  }
}

export async function validateMedicareDenialImportCoverage(dataset: MedicareDenialImportDataset): Promise<void> {
  const counties = await getCountyReference();
  for (const row of dataset.rows) {
    if (counties.get(row.countyFips) !== row.stateCode) {
      throw new Error(`County FIPS ${row.countyFips} is not present in the app's county reference dataset.`);
    }
  }
  if (!dataset.coverage.completeStateTotals) return;

  const expectedByState = new Map<string, Set<string>>();
  for (const [fips, stateCode] of counties.entries()) {
    const expected = expectedByState.get(stateCode) ?? new Set<string>();
    expected.add(fips);
    expectedByState.set(stateCode, expected);
  }
  const actualByState = new Map<string, Set<string>>();
  for (const row of dataset.rows) {
    const actual = actualByState.get(row.stateCode) ?? new Set<string>();
    actual.add(row.countyFips);
    actualByState.set(row.stateCode, actual);
  }
  for (const [stateCode, actual] of actualByState.entries()) {
    const expected = expectedByState.get(stateCode) ?? new Set<string>();
    const missing = [...expected].filter((fips) => !actual.has(fips));
    if (missing.length > 0) {
      const sample = missing.slice(0, 5).join(', ');
      throw new Error(
        `${stateCode} statewide rate was blocked: ${missing.length} county FIPS are missing${sample ? ` (including ${sample})` : ''}. Include rows for every county, using 0 denied and 0 adjudicated where appropriate.`,
      );
    }
  }
}

type MedicareDenialImportMetadata = Omit<
  MedicareDenialImportDataset,
  'schemaVersion' | 'importedAt' | 'rows' | 'fileName'
>;

function validateMetadata(metadata: MedicareDenialImportMetadata): void {
  if (!['any_service_line_denied', 'fully_denied_claim'].includes(metadata.denialDefinition)) {
    throw new Error('Choose a supported denial definition from the source report.');
  }
  const required: Array<[string, string, number]> = [
    ['claim scope', metadata.claimScope, 240],
    ['reporting period', metadata.reportingPeriod, 100],
    ['source name', metadata.sourceName, 160],
    ['source report reference', metadata.sourceReference, 160],
  ];
  for (const [label, value, maxLength] of required) {
    if (!value.trim()) throw new Error(`Enter the ${label}.`);
    if (value.trim().length > maxLength) throw new Error(`The ${label} is too long.`);
  }
  if (metadata.sourceUrl?.trim()) {
    try {
      if (new URL(metadata.sourceUrl).protocol !== 'https:') throw new Error();
    } catch {
      throw new Error('The optional source URL must be a valid HTTPS link.');
    }
  }
  if (!metadata.coverage.completeProviderGroups) {
    throw new Error('Confirm the NPI × pickup-county rows are complete and deduplicated before importing.');
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isStoredMedicareDenialImport(
  value: unknown,
): value is MedicareDenialImportDataset {
  if (!isPlainRecord(value)) return false;
  const datasetKeys = [
    'schemaVersion',
    'importedAt',
    'fileName',
    'claimScope',
    'reportingPeriod',
    'denialDefinition',
    'sourceName',
    'sourceReference',
    'sourceUrl',
    'coverage',
    'rows',
  ];
  if (!hasOnlyKeys(value, datasetKeys)) return false;
  if (
    value.schemaVersion !== 1 ||
    typeof value.importedAt !== 'string' ||
    Number.isNaN(Date.parse(value.importedAt)) ||
    typeof value.fileName !== 'string' ||
    value.fileName.length > 180 ||
    typeof value.claimScope !== 'string' ||
    typeof value.reportingPeriod !== 'string' ||
    (value.denialDefinition !== 'any_service_line_denied' &&
      value.denialDefinition !== 'fully_denied_claim') ||
    typeof value.sourceName !== 'string' ||
    typeof value.sourceReference !== 'string' ||
    (value.sourceUrl !== undefined && typeof value.sourceUrl !== 'string') ||
    !isPlainRecord(value.coverage) ||
    !Array.isArray(value.rows) ||
    value.rows.length === 0 ||
    value.rows.length > MAX_IMPORT_ROWS
  ) {
    return false;
  }

  const coverage = value.coverage;
  const coverageKeys = [
    'completeProviderGroups',
    'completeProviderTotals',
    'completeCountyTotals',
    'completeStateTotals',
  ];
  if (
    !hasOnlyKeys(coverage, coverageKeys) ||
    coverageKeys.some((key) => typeof coverage[key] !== 'boolean') ||
    coverage.completeProviderGroups !== true ||
    (coverage.completeStateTotals === true &&
      coverage.completeCountyTotals !== true)
  ) {
    return false;
  }

  const seenGroups = new Set<string>();
  for (const rowValue of value.rows) {
    if (!isPlainRecord(rowValue)) return false;
    if (
      !hasOnlyKeys(rowValue, [
        'npi',
        'countyFips',
        'stateCode',
        'deniedClaims',
        'adjudicatedClaims',
      ])
    ) {
      return false;
    }
    const { npi, countyFips, stateCode, deniedClaims, adjudicatedClaims } =
      rowValue;
    if (
      typeof npi !== 'string' ||
      !/^\d{10}$/.test(npi) ||
      !validateNpiCheckDigit(npi) ||
      typeof countyFips !== 'string' ||
      !/^\d{5}$/.test(countyFips) ||
      typeof stateCode !== 'string' ||
      stateCodeForCountyFips(countyFips) !== stateCode ||
      typeof deniedClaims !== 'number' ||
      !Number.isSafeInteger(deniedClaims) ||
      typeof adjudicatedClaims !== 'number' ||
      !Number.isSafeInteger(adjudicatedClaims) ||
      deniedClaims < 0 ||
      adjudicatedClaims < 0 ||
      deniedClaims > adjudicatedClaims ||
      (adjudicatedClaims === 0 && deniedClaims !== 0)
    ) {
      return false;
    }
    const groupKey = `${npi}|${countyFips}`;
    if (seenGroups.has(groupKey)) return false;
    seenGroups.add(groupKey);
  }

  try {
    validateMetadata({
      claimScope: value.claimScope,
      reportingPeriod: value.reportingPeriod,
      denialDefinition: value.denialDefinition,
      sourceName: value.sourceName,
      sourceReference: value.sourceReference,
      sourceUrl: value.sourceUrl,
      coverage: coverage as MedicareDenialImportDataset['coverage'],
    });
    return true;
  } catch {
    return false;
  }
}

export function createMedicareDenialImport(
  rows: MedicareDenialImportRow[],
  metadata: MedicareDenialImportMetadata,
  fileName: string,
): MedicareDenialImportDataset {
  validateMetadata(metadata);
  if (rows.length === 0) throw new Error('No valid aggregate claim rows were found.');
  if (metadata.coverage.completeStateTotals && !metadata.coverage.completeCountyTotals) {
    throw new Error('State totals require complete county coverage as well.');
  }
  return {
    schemaVersion: 1,
    importedAt: new Date().toISOString(),
    fileName: fileName.slice(0, 180),
    ...metadata,
    rows,
  };
}

function metricForRows(
  dataset: MedicareDenialImportDataset,
  rows: MedicareDenialImportRow[],
): ImportedDenialMetric {
  let deniedClaims = 0;
  let adjudicatedClaims = 0;
  for (const row of rows) {
    deniedClaims += row.deniedClaims;
    adjudicatedClaims += row.adjudicatedClaims;
    if (!Number.isSafeInteger(deniedClaims) || !Number.isSafeInteger(adjudicatedClaims)) {
      throw new Error('The imported count total exceeds the safe integer limit.');
    }
  }
  return {
    ratePct: adjudicatedClaims > 0 ? Number(((deniedClaims / adjudicatedClaims) * 100).toFixed(1)) : null,
    deniedClaims,
    adjudicatedClaims,
    claimScope: dataset.claimScope,
    reportingPeriod: dataset.reportingPeriod,
    denialDefinition: dataset.denialDefinition,
    sourceName: dataset.sourceName,
    sourceReference: dataset.sourceReference,
    sourceUrl: dataset.sourceUrl,
  };
}

export function getMedicareDenialImportReport(dataset: MedicareDenialImportDataset): MedicareDenialImportReport {
  const groupBy = <T,>(keyOf: (row: MedicareDenialImportRow) => string) => {
    const groups = new Map<string, MedicareDenialImportRow[]>();
    for (const row of dataset.rows) {
      const key = keyOf(row);
      const current = groups.get(key) ?? [];
      current.push(row);
      groups.set(key, current);
    }
    return groups;
  };

  const providerCountyMetrics = dataset.rows.map((row) => ({
    npi: row.npi,
    countyFips: row.countyFips,
    stateCode: row.stateCode,
    ...metricForRows(dataset, [row]),
  }));

  const providerMetrics = dataset.coverage.completeProviderTotals
    ? Array.from(groupBy((row) => row.npi), ([npi, rows]) => ({
        npi,
        ...metricForRows(dataset, rows),
      }))
    : [];
  const countyMetrics = dataset.coverage.completeCountyTotals
    ? Array.from(groupBy((row) => row.countyFips), ([countyFips, rows]) => ({
        countyFips,
        stateCode: rows[0].stateCode,
        ...metricForRows(dataset, rows),
      }))
    : [];
  const stateMetrics = dataset.coverage.completeStateTotals
    ? Array.from(groupBy((row) => row.stateCode), ([stateCode, rows]) => ({
        stateCode,
        ...metricForRows(dataset, rows),
      }))
    : [];

  return { providerCountyMetrics, providerMetrics, countyMetrics, stateMetrics };
}

export function getLocalMedicareDenialImport(): MedicareDenialImportDataset | null {
  if (typeof window === 'undefined') return null;
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    const dataset: unknown = JSON.parse(serialized);
    return isStoredMedicareDenialImport(dataset) ? dataset : null;
  } catch {
    return null;
  }
}

export function saveLocalMedicareDenialImport(dataset: MedicareDenialImportDataset): void {
  if (typeof window === 'undefined') throw new Error('Local browser storage is unavailable.');
  if (!isStoredMedicareDenialImport(dataset)) {
    throw new Error('The claim summary is not valid for local storage.');
  }
  const serialized = JSON.stringify(dataset);
  if (serialized.length > MAX_STORED_CHARACTERS) {
    throw new Error('This summary exceeds the browser storage limit. Import a smaller state or county subset.');
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(MEDICARE_DENIAL_IMPORT_EVENT));
  } catch {
    throw new Error('The browser could not save this import. Free local browser storage and try again.');
  }
}

export function clearLocalMedicareDenialImport(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(MEDICARE_DENIAL_IMPORT_EVENT));
}

export function getImportedProviderDenialMetric(npiValue: string | undefined): ImportedDenialMetric | null {
  const npi = npiValue?.trim() ?? '';
  if (!/^\d{10}$/.test(npi) || !validateNpiCheckDigit(npi)) return null;
  const dataset = getLocalMedicareDenialImport();
  if (!dataset?.coverage.completeProviderTotals) return null;
  const metric = getMedicareDenialImportReport(dataset).providerMetrics.find((item) => item.npi === npi) ?? null;
  return metric?.ratePct === null ? null : metric;
}

export function getImportedCountyDenialMetric(countyFips: string): (ImportedDenialMetric & { countyFips: string; stateCode: string }) | null {
  const fips = countyFips.trim();
  if (!/^\d{5}$/.test(fips)) return null;
  const dataset = getLocalMedicareDenialImport();
  if (!dataset?.coverage.completeCountyTotals) return null;
  const metric = getMedicareDenialImportReport(dataset).countyMetrics.find((item) => item.countyFips === fips) ?? null;
  return metric?.ratePct === null ? null : metric;
}
