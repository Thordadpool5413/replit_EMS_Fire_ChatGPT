/**
 * User-facing explanations for values a model guard declines to compute.
 * Display copy only: never use these as computation sentinels.
 */
export const MISSING_INPUT_COPY = {
  claimsRecovery: 'Needs sourced claim inputs',
  planningValue: 'Needs verified agency inputs',
  pulseIqScore: 'Needs scoring inputs',
  priority: 'Priority not assigned',
  fleetPricing: 'Needs verified fleet count and pricing',
  tcoSavings: 'Same inputs required; no savings estimated',
  medicareInputs: 'Needs reported transports and Medicare payer share',
  procedureDenial: 'Needs reported denial rate',
} as const;
