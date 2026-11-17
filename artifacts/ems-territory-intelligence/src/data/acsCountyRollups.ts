export interface AcsCountyMetricRecord {
  countyFips: string;
  population: number | null;
  population65Plus: number | null;
  povertyUniverse: number | null;
  populationBelowPoverty: number | null;
  medianHouseholdIncome: number | null;
}

export interface AcsMetricCoverage {
  value: number | null;
  partialValue: number | null;
  availableCount: number;
  expectedCount: number;
  complete: boolean;
}

export interface AcsStateRollup {
  countyCount: number;
  duplicateCountyFips: boolean;
  sourceDuplicates: boolean;
  population: AcsMetricCoverage;
  population65PlusShare: AcsMetricCoverage;
  povertyRate: AcsMetricCoverage;
  medianCountyHouseholdIncome: AcsMetricCoverage;
}

const isEstimate = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const coveredMeasure = (
  values: number[],
  expectedCount: number,
  summarize: (values: number[]) => number,
  invalidGeometry = false,
  invalidSource = false,
): AcsMetricCoverage => {
  const partialValue = values.length ? summarize(values) : null;
  const complete =
    expectedCount > 0 &&
    values.length === expectedCount &&
    !invalidGeometry &&
    !invalidSource;
  return {
    value: complete ? partialValue : null,
    partialValue,
    availableCount: values.length,
    expectedCount,
    complete,
  };
};

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Rolls source rows up only through exact county FIPS matches. Incomplete source coverage
 * retains a partial diagnostic value but withholds the statewide value used for map shading.
 */
export function buildAcsStateRollups(
  counties: readonly { countyFips: string; stateCode: string }[],
  sourceRows: readonly AcsCountyMetricRecord[],
  stateCodes: readonly string[],
): Record<string, AcsStateRollup> {
  const sourceByFips = new Map<string, AcsCountyMetricRecord>();
  const duplicateSourceFips = new Set<string>();
  for (const row of sourceRows) {
    if (!/^\d{5}$/.test(row.countyFips)) continue;
    if (sourceByFips.has(row.countyFips)) duplicateSourceFips.add(row.countyFips);
    else sourceByFips.set(row.countyFips, row);
  }

  const countiesByState = new Map<string, typeof counties[number][]>();
  for (const county of counties) {
    const stateRows = countiesByState.get(county.stateCode) ?? [];
    stateRows.push(county);
    countiesByState.set(county.stateCode, stateRows);
  }

  return Object.fromEntries(
    stateCodes.map((stateCode) => {
      const stateCounties = countiesByState.get(stateCode) ?? [];
      const uniqueFips = new Set(stateCounties.map((county) => county.countyFips));
      const duplicateCountyFips = uniqueFips.size !== stateCounties.length;
      const seenCountyFips = new Set<string>();
      const matched = stateCounties.flatMap((county) => {
        if (seenCountyFips.has(county.countyFips)) return [];
        seenCountyFips.add(county.countyFips);
        const row = sourceByFips.get(county.countyFips);
        return row ? [{ county, row }] : [];
      });
      const expectedCount = stateCounties.length;
      const invalidGeometry = duplicateCountyFips || expectedCount === 0;
      const sourceDuplicates = matched.some(({ county }) => duplicateSourceFips.has(county.countyFips));
      const populationRows = matched.filter(({ row }) => isEstimate(row.population));
      const ageRows = matched.filter(
        ({ row }) =>
          isEstimate(row.population) &&
          row.population > 0 &&
          isEstimate(row.population65Plus),
      );
      const povertyRows = matched.filter(
        ({ row }) =>
          isEstimate(row.povertyUniverse) &&
          row.povertyUniverse > 0 &&
          isEstimate(row.populationBelowPoverty),
      );
      const incomeRows = matched.filter(({ row }) => isEstimate(row.medianHouseholdIncome));

      const population = coveredMeasure(
        populationRows.map(({ row }) => row.population!),
        expectedCount,
        (values) => values.reduce((total, value) => total + value, 0),
        invalidGeometry,
        sourceDuplicates,
      );
      const population65PlusShare = coveredMeasure(
        ageRows.map(({ row }) => row.population65Plus! / row.population!),
        expectedCount,
        () => {
          const totalPopulation = ageRows.reduce((total, { row }) => total + row.population!, 0);
          const totalOlderAdults = ageRows.reduce(
            (total, { row }) => total + row.population65Plus!,
            0,
          );
          return totalPopulation > 0 ? (totalOlderAdults / totalPopulation) * 100 : 0;
        },
        invalidGeometry,
        sourceDuplicates,
      );
      const povertyRate = coveredMeasure(
        povertyRows.map(({ row }) => row.populationBelowPoverty! / row.povertyUniverse!),
        expectedCount,
        () => {
          const denominator = povertyRows.reduce((total, { row }) => total + row.povertyUniverse!, 0);
          const numerator = povertyRows.reduce(
            (total, { row }) => total + row.populationBelowPoverty!,
            0,
          );
          return denominator > 0 ? (numerator / denominator) * 100 : 0;
        },
        invalidGeometry,
        sourceDuplicates,
      );
      const medianCountyHouseholdIncome = coveredMeasure(
        incomeRows.map(({ row }) => row.medianHouseholdIncome!),
        expectedCount,
        median,
        invalidGeometry,
        sourceDuplicates,
      );

      return [
        stateCode,
        {
          countyCount: expectedCount,
          duplicateCountyFips,
          sourceDuplicates,
          population,
          population65PlusShare,
          povertyRate,
          medianCountyHouseholdIncome,
        },
      ];
    }),
  );
}
