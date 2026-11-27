import type { CountyFigureSourceKey, CountyFigureSourceMetadata, CountyHealthRecord } from '../types';

type Edition = {
  name: string;
  vintage: string;
  reportingPeriod: string;
  tables: { populationAndAge: string; poverty: string; householdIncome: string };
};

export function countyReferenceFigures(county: CountyHealthRecord, edition: Edition) {
  const values: Partial<Record<CountyFigureSourceKey, number | null>> = {};
  const sources: Partial<Record<CountyFigureSourceKey, CountyFigureSourceMetadata>> = {};
  for (const [field, source] of Object.entries(county.figureSources ?? {})) {
    if (!source?.source && !source?.sourceUrl) continue;
    const key = field as CountyFigureSourceKey;
    values[key] = county[key];
    sources[key] = source;
  }
  const acs = county.acsCountyContext;
  if (acs && (!('countyFips' in acs) || acs.countyFips === county.countyFips)) {
    const share = (count: number | null, total: number | null) =>
      count != null && total != null && total > 0 ? Math.round((1000 * count) / total) / 10 : null;
    const demographics = [
      ['population', acs.population, 'populationAndAge'],
      ['seniorPopPct', share(acs.population65Plus, acs.population), 'populationAndAge'],
      ['povertyRatePct', share(acs.populationBelowPoverty, acs.povertyUniverse), 'poverty'],
      ['medianIncome', acs.medianHouseholdIncome, 'householdIncome'],
    ] as const;
    for (const [key, value, table] of demographics) {
      if (value == null) continue;
      values[key] = value;
      sources[key] = {
        source: edition.name,
        vintage: edition.vintage,
        reportingPeriod: edition.reportingPeriod,
        sourceUrl: edition.tables[table],
        scope: county.countyName,
      };
    }
  }
  return { values, sources };
}
