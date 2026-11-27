export const providerSourceKinds = ['inventory', 'purchases', 'billing'] as const;
export type ProviderSourceKind = typeof providerSourceKinds[number];
export const payerCategories = ['Medicare FFS', 'Medicare Advantage', 'Medicaid FFS', 'Medicaid Managed Care',
  'Commercial', 'Self-pay', 'VA', 'Other', 'Unknown'] as const;
export const providerSourceHeadings = {
  inventory: ['registry_key', 'as_of', 'equipment_category', 'manufacturer', 'model', 'owned_units', 'coverage_scope', 'scope_reference'],
  purchases: ['registry_key', 'event_date', 'event_type', 'reference', 'equipment_category', 'manufacturer', 'model', 'supplier', 'units', 'amount_cents'],
  billing: ['registry_key', 'period_start', 'period_end', 'payer', 'payer_name', 'claim_count',
    'adjudicated_claims', 'initially_denied_claims', 'finally_denied_claims', 'billed_cents', 'paid_cents'],
} as const;
export type ProviderSourceRow = Record<string, string | number | null>;
export const MAX_PROVIDER_SOURCE_CSV = 65_000;
export const purchaseEvents = ['approved', 'ordered', 'purchased', 'delivered', 'paid', 'cancelled'] as const;
export const equipmentCategories = ['aed', 'monitor', 'cpr', 'ventilator', 'ambulance', 'apparatus', 'software', 'other'] as const;
export const inventoryScopes = ['department', 'station', 'vehicle', 'other named subset'] as const;
export const billingDenialDefinitions = ['not provided', 'entire claim denied', 'any service line denied'] as const;
export function isProviderSourceKind(value: unknown): value is ProviderSourceKind {
  return providerSourceKinds.some(kind => kind === value);
}

export function parseProviderSourceRows(csv: string, kind: ProviderSourceKind, registryKey: string): ProviderSourceRow[] {
  if (typeof csv !== 'string' || csv.length > MAX_PROVIDER_SOURCE_CSV) throw Error('Choose a CSV under 65 KB.');
  const [header, ...records] = readCsv(csv.replace(/^\uFEFF/, ''));
  const columns = providerSourceHeadings[kind];
  if (header?.join(',') !== columns.join(',') || !records.length || records.length > 300) {
    throw Error('Use the downloadable template with 1–300 rows and no extra columns.');
  }
  const seen = new Set<string>();
  return records.map((cells, index) => {
    if (cells.length !== columns.length || cells[0].trim() !== registryKey) {
      throw Error('Row ' + (index + 2) + ' needs the exact registry key for this account.');
    }
    const values = cells.slice(1).map(cell => cell.trim());
    let row: ProviderSourceRow;
    let identity: string[];
    switch (kind) {
      case 'billing': {
        const [start, end, payer, payerName, ...metrics] = values;
        if (!date(start) || !date(end) || end < start || !listed(payerCategories, payer) || !text(payerName, false)) throw Error('Use a valid billing period and a listed payer category.');
        const [claims, adjudicated, initial, final, billed, paid] = metrics.map(number);
        if (metrics.every(v => !v) || ((initial !== null || final !== null) &&
          (!adjudicated || (initial ?? 0) > adjudicated || (final ?? 0) > adjudicated))) {
          throw Error('Enter a metric. Denials require a positive adjudicated denominator and counts within it.');
        }
        row = { start, end, payer, payerName, claims, adjudicated, initial, final, billed, paid };
        identity = [start, end, payer, payerName];
        break;
      }
      case 'inventory': {
        const [asOf, category, manufacturer, model, units, scope, scopeReference] = values;
        const owned = number(units);
        if (!date(asOf) || !listed(equipmentCategories, category) || !text(manufacturer) || !text(model) ||
          owned === null || owned > 100_000 || !listed(inventoryScopes, scope) || !text(scopeReference, scope !== 'department')) {
          throw Error('Inventory needs a valid as-of date, category, make, model, owned unit count and coverage scope.');
        }
        row = { asOf, category, manufacturer, model, owned, scope, scopeReference };
        identity = [asOf, category, manufacturer, model, scope, scopeReference];
        break;
      }
      case 'purchases': {
        const [eventDate, event, reference, category, manufacturer, model, supplier, units, cents] = values;
        const quantity = number(units), amount = number(cents);
        if (!date(eventDate) || !listed(purchaseEvents, event) || !text(reference) || !listed(equipmentCategories, category) ||
          !text(manufacturer, false) || !text(model, false) || !text(supplier, false) ||
          (quantity !== null && (!quantity || quantity > 100_000))) throw Error('Purchase records need a dated event, reference, valid equipment category and valid quantities.');
        row = { eventDate, event, reference, category, manufacturer, model, supplier, quantity, amount };
        identity = [eventDate, event, reference, category, manufacturer, model];
        break;
      }
    }
    const key = JSON.stringify(identity.map(item => item.toLowerCase()));
    if (seen.has(key)) throw Error('Duplicate source row. Consolidate repeated items before saving.');
    seen.add(key);
    return row;
  }).sort((a, b) => String(b.asOf ?? b.eventDate ?? b.end).localeCompare(String(a.asOf ?? a.eventDate ?? a.end))
    || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function listed(values: readonly string[], item: string) { return values.includes(item); }
function text(value: string, required = true) {
  return (!required || value.length > 0) && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
}
function date(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function number(value: string) {
  if (!value) return null;
  if (!/^\d{1,13}$/.test(value)) throw Error('Counts and cents must be nonnegative whole numbers or blank.');
  return Number(value);
}

function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i] ?? '\n';
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (ch === ',' || ch === '\r' || ch === '\n') {
      row.push(cell);
      cell = '';
      closed = false;
      if (ch !== ',') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        if (row.some(item => item.trim())) rows.push(row);
        row = [];
      }
    } else if (ch === '"' && cell === '' && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw Error('Invalid CSV quoting.');
      cell += ch;
    }
  }
  if (quoted) throw Error('A quoted field is unclosed.');
  return rows;
}
