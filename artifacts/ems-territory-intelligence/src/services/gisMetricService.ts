export type OhcaRateTier = 'critical' | 'high' | 'moderate' | 'baseline';
export type FleetAgeBandKey = '0-4' | '5-6' | '7-9' | '10+';

export interface OhcaRateThresholds {
  p10: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export const FLEET_AGE_BANDS: Array<{
  key: FleetAgeBandKey;
  label: string;
  color: string;
}> = [
  { key: '0-4', label: '0–4 years', color: '#16a34a' },
  { key: '5-6', label: '5–6 years', color: '#0284c7' },
  { key: '7-9', label: '7–9 years', color: '#d97706' },
  { key: '10+', label: '10+ years', color: '#e11d48' },
];

export function getOhcaRatePerThousand(
  cardiacArrestCalls: number | null | undefined,
  annualTransports: number | null | undefined,
): number | null {
  if (
    cardiacArrestCalls == null ||
    !Number.isFinite(cardiacArrestCalls) ||
    cardiacArrestCalls < 0 ||
    annualTransports == null ||
    !Number.isFinite(annualTransports) ||
    annualTransports <= 0
  ) {
    return null;
  }

  return (cardiacArrestCalls / annualTransports) * 1000;
}

export function getOhcaRateThresholds(values: number[]): OhcaRateThresholds {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { p10: null, p50: null, p75: null, p90: null };
  }

  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

  return {
    p10: percentile(0.1),
    p50: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
  };
}

export function classifyOhcaRate(
  rate: number | null,
  thresholds: OhcaRateThresholds,
): OhcaRateTier | null {
  if (rate == null || thresholds.p50 == null || thresholds.p75 == null || thresholds.p90 == null) {
    return null;
  }
  if (rate >= thresholds.p90) return 'critical';
  if (rate >= thresholds.p75) return 'high';
  if (rate >= thresholds.p50) return 'moderate';
  return 'baseline';
}

export function getFleetAgeBand(ageYears: number | null | undefined): FleetAgeBandKey | null {
  if (ageYears == null || !Number.isFinite(ageYears) || ageYears < 0) return null;
  if (ageYears < 5) return '0-4';
  if (ageYears < 7) return '5-6';
  if (ageYears < 10) return '7-9';
  return '10+';
}
