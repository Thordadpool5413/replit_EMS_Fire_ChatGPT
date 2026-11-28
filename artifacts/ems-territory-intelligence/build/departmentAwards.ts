import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { profileSourceKey } from '../src/services/departmentIdentity';
import type { DirectoryProvider } from '../src/services/providerCatalog';
import type { ProviderFundingEvidence } from '../src/data/providerProfileEvidence';

type Grant = {
  id: string;
  vendorState: string;
  vendorName: string;
  fiscalYear: number;
  awardNumber: string;
  awardAmount: number | null;
};
type Contract = {
  id: string;
  recipient: string;
  description: string;
  awardAmount: number | null;
  startDate: string;
};
type StateGrantEdition = {
  date: string;
  url: string;
  rows: { index: number; page: number; recipient: string; county: string; purpose: string; amount: number }[];
};
const texasGrantEditions: StateGrantEdition[] = JSON.parse(
  gunzipSync(readFileSync(new URL('./data/texas-fire-grants.json.gz', import.meta.url))).toString(),
);
function texasRecipientKey(recipient: string, county: string) {
  const name = normalized(recipient)
    .replace(/\s+(?:inc|incorporated|llc)$/, '');
  return name + '|' + normalized(county.replace(/ County$/i, ''));
}

type Edition = { checked: string; records: Grant[] };
const grants: Edition = JSON.parse(
  gunzipSync(readFileSync(new URL('./data/department-awards.json.gz', import.meta.url))).toString(),
);
const purchases: { throughDate: string; byState: Record<string, { awards: Contract[]; status: string }> } =
  JSON.parse(
    readFileSync(new URL('../public/data/national-aed-procurement.json', import.meta.url), 'utf8'),
  );
function normalized(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\bdept\b/g, 'department')
    .replace(/\bv\s*f\s*d\b/g, 'volunteer fire department')
    .replace(/\bfire\s+dist\b/g, 'fire district')
    .replace(/\bfire\s+co\b/g, 'fire company')
    .replace(/\bfire\s+pro(?:t|tection)?\s+dist(?:rict)?\b/g, 'fire protection district')
    .replace(/\s+(?:incorporated|inc)(?=\s*$)/, '')
    .replace(/\bvol\b/g, 'volunteer')
    .replace(/\s+/g, ' ')
    .trim();
}
export function departmentAwards(state: string, rows: DirectoryProvider[], countyNames: Record<string, string>) {
  const names = new Map<string, Set<string>>();
  for (const row of rows)
    for (const value of [row.name, ...(row.aliases ?? [])]) {
      const name = normalized(value);
      if (!/\b(fire|ambulance|ems|rescue|emergency medical services)\b/.test(name)) continue;
      // Generic service labels and government-only payees cannot identify the operating agency.
      if (
        !name
          .replace(
            /\b(fire|ambulance|ems|rescue|emergency|medical|services?|department|volunteer|district|inc|company|of|and|the|city|county|town|municipal|corporation)\b/g,
            '',
          )
          .trim()
      )
        continue;
      const owners = names.get(name) ?? new Set<string>();
      owners.add(profileSourceKey(row.ref));
      names.set(name, owners);
    }
  const byProvider: Record<string, ProviderFundingEvidence[]> = {};
  const counters = {
    checked: grants.checked,
    grantRows: 0,
    stateGrantRows: 0,
    contractRows: 0,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    contractCoverage: purchases.byState[state]?.status ?? 'unavailable',
  };
  function accept(owners: Set<string> | undefined, event: ProviderFundingEvidence) {
    if (!owners?.size) {
      counters.unmatched++;
      return;
    }
    if (owners.size !== 1) {
      counters.ambiguous++;
      return;
    }
    const key = [...owners][0];
    (byProvider[key] ??= []).push(event);
    counters.matched++;
  }
  for (const r of grants.records
    .filter((r) => r.vendorState === state)
    .sort((a, b) => b.fiscalYear - a.fiscalYear || a.awardNumber.localeCompare(b.awardNumber))) {
    counters.grantRows++;
    accept(names.get(normalized(r.vendorName)), {
      title: 'Assistance to Firefighters Grant · ' + r.awardNumber,
      status: 'Awarded',
      fiscalYear: r.fiscalYear,
      ...(r.awardAmount != null ? { amount: r.awardAmount } : {}),
      basis:
        'OpenFEMA names ' +
        r.vendorName +
        ' as the recipient. The award record does not specify equipment or expenditure.',
      source: {
        label: 'OpenFEMA · ' + r.awardNumber,
        date: 'FY ' + r.fiscalYear,
        url: 'https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants/' + r.id,
      },
    });
  }
  for (const r of purchases.byState[state]?.awards ?? []) {
    counters.contractRows++;
    accept(names.get(normalized(r.recipient)), {
      title: 'Federal contract recipient · ' + r.id,
      status: 'Awarded',
      ...(r.awardAmount != null ? { amount: r.awardAmount } : {}),
      basis:
        'Supplier or service contractor: ' + r.recipient + '. Federal award description: ' + r.description,
      source: {
        label: 'USAspending federal contract',
        date: r.startDate,
        url: 'https://www.usaspending.gov/award/' + encodeURIComponent(r.id),
      },
    });
  }
  if (state === 'TX') {
    const byCountyAndName = new Map<string, Set<string>>();
    for (const row of rows) {
      const county = countyNames[row.county];
      if (!county || row.countyBasis || row.kind === 'ems') continue;
      for (const alias of [row.name, ...(row.aliases ?? [])]) {
        const name = texasRecipientKey(alias, county);
        const owners = byCountyAndName.get(name) ?? new Set<string>();
        owners.add(profileSourceKey(row.ref));
        byCountyAndName.set(name, owners);
      }
    }
    for (const edition of texasGrantEditions) {
      for (const row of edition.rows) {
        counters.stateGrantRows++;
        accept(byCountyAndName.get(texasRecipientKey(row.recipient, row.county)), {
          title: 'Texas HB 2604 award · ' + row.purpose,
          status: 'Awarded',
          fiscalYear: 2026,
          amount: row.amount,
          basis: row.recipient + ' · ' + row.county + ' County · Grant approval for ' + row.purpose +
            '. The funding table records the award amount. Delivery and payment dates are unspecified.',
          source: {
            label: 'Texas A&M Forest Service · final approval ' + row.index,
            date: edition.date,
            url: edition.url + '#page=' + row.page,
          },
        });
      }
    }
  }
  return { byProvider, counters };
}
