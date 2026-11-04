export type ProviderScope = 'all' | 'ems' | 'fire';
export type TerritoryUrlValidators = {
  isValidStateCode: (stateCode: string) => boolean;
  resolveCountyName: (stateCode: string, countyName: string) => string | undefined;
};

export type TerritoryUrlSelection = {
  state: string;
  county: string;
  category: ProviderScope;
  hasTerritorySelection: boolean;
};

const NATIONAL_SELECTION: TerritoryUrlSelection = {
  state: 'all',
  county: 'all',
  category: 'all',
  hasTerritorySelection: false,
};

const normalizeProviderScope = (value: string | null): ProviderScope =>
  value === 'ems' || value === 'fire' ? value : 'all';

export function parseTerritoryUrl(
  search: string,
  validators: TerritoryUrlValidators,
): TerritoryUrlSelection {
  const params = new URLSearchParams(search);
  const rawState = params.get('state');
  const rawCounty = params.get('county');
  const category = normalizeProviderScope(params.get('provider'));
  const hasTerritoryParams = rawState !== null || rawCounty !== null;

  if (!hasTerritoryParams) {
    return { ...NATIONAL_SELECTION, category };
  }

  const stateCode = rawState?.trim().toUpperCase();
  if (!stateCode || stateCode === 'ALL') {
    return {
      ...NATIONAL_SELECTION,
      category,
      hasTerritorySelection: false,
    };
  }

  if (!validators.isValidStateCode(stateCode)) {
    return { ...NATIONAL_SELECTION, category };
  }

  if (rawCounty === null || rawCounty.trim().toLowerCase() === 'all') {
    return {
      state: stateCode,
      county: 'all',
      category,
      hasTerritorySelection: true,
    };
  }

  const countyName = rawCounty.trim();
  if (!countyName) {
    return { ...NATIONAL_SELECTION, category };
  }

  const canonicalCounty = validators.resolveCountyName(stateCode, countyName);
  if (!canonicalCounty) {
    return { ...NATIONAL_SELECTION, category };
  }

  return {
    state: stateCode,
    county: canonicalCounty,
    category,
    hasTerritorySelection: true,
  };
}

export function withTerritoryUrl(
  href: string,
  selection: Pick<TerritoryUrlSelection, 'state' | 'county' | 'category'>,
  validators: TerritoryUrlValidators,
): string {
  const url = new URL(href);
  url.searchParams.delete('state');
  url.searchParams.delete('county');
  url.searchParams.delete('provider');

  const { state, county, category } = selection;
  if (state !== 'all' && validators.isValidStateCode(state)) {
    url.searchParams.set('state', state);
    if (county !== 'all') {
      const canonicalCounty = validators.resolveCountyName(state, county);
      if (canonicalCounty) url.searchParams.set('county', canonicalCounty);
    }
  }
  if (category !== 'all') {
    url.searchParams.set('provider', category);
  }

  return url.toString();
}
