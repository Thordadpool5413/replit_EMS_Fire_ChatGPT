import { parseCsvRecords } from './medicareDenialImportService';

export const payerHeaders = ['registry_key', 'period_start', 'period_end', 'payer', 'claim_count',
  'adjudicated_claims', 'initially_denied_claims', 'finally_denied_claims', 'billed_cents', 'paid_cents'] as const;
export const payerCategories = ['Medicare FFS', 'Medicare Advantage', 'Medicaid FFS', 'Medicaid Managed Care',
  'Commercial', 'Self-pay', 'VA', 'Other', 'Unknown'] as const;
type Payer = typeof payerCategories[number];
export type PayerRow = {
  payer: Payer; start: string; end: string;
  claims: number | null; adjudicated: number | null; initial: number | null; final: number | null;
  billed: number | null; paid: number | null;
};

const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) &&
  new Date(date).toISOString().slice(0, 10) === date;
function count(value: string) {
  if (value === '') return null;
  if (!/^\d{1,15}$/.test(value)) throw Error('Counts and cents must be nonnegative whole numbers or blank.');
  return Number(value);
}

export function parseAggregatePayerCsv(text: string, registryKeys: readonly string[]): PayerRow[] {
  const [headers, ...records] = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  if (headers?.join(',') !== payerHeaders.join(',') || !records.length || records.length > 300) {
    throw Error('Use the aggregate billing template with 1–300 rows and no extra columns.');
  }
  if (!registryKeys.length) throw Error('This profile needs a native or confirmed registry identifier.');
  const seen = new Set<string>();
  return records.map((cells, index) => {
    const [registry, start, end, payer, ...values] = cells.map(cell => cell.trim());
    if (cells.length !== payerHeaders.length || !registryKeys.includes(registry) ||
      !validDate(start) || !validDate(end) || end < start || !payerCategories.includes(payer as Payer)) {
      throw Error('Row ' + (index + 2) + ' needs a matching registry key, valid period and template payer category.');
    }
    const key = JSON.stringify([start, end, payer]);
    if (seen.has(key)) throw Error('Duplicate payer and period. Use one summary row for each payer and period.');
    seen.add(key);
    const [claims, adjudicated, initial, final, billed, paid] = values.map(count);
    if (values.every(value => value === '') ||
      ((initial !== null || final !== null) && (adjudicated === null || adjudicated === 0)) ||
      (initial !== null && adjudicated !== null && initial > adjudicated) ||
      (final !== null && adjudicated !== null && final > adjudicated)) {
      throw Error('Each row needs a metric. Denials require a positive adjudicated denominator and counts within that denominator.');
    }
    return { payer: payer as Payer, start, end, claims, adjudicated, initial, final, billed, paid };
  }).sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start) || a.payer.localeCompare(b.payer));
}
