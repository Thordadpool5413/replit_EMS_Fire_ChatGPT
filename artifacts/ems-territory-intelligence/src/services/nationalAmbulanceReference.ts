/**
 * CMS FY2024 RSNAT program snapshot, PDF page 6.
 * Claim-line outcomes, NOT unique claims, all ambulance services, or local rates.
 * Keep this reference separate from provider/county/state claim selectors.
 */
const RSNAT_REPORTED_OUTCOMES = Object.freeze({
  paidClaimLines: 721_767,
  deniedClaimLines: 31_031,
  periodStart: '2023-10-01',
  periodEnd: '2024-09-30',
  reportingPeriod: 'FY2024 · Oct 1, 2023–Sep 30, 2024',
  sourcePublishedAt: '2025-09-16',
  sourceUrl: 'https://www.cms.gov/files/document/pre-claim-review-program-statistics-document-fy-24.pdf#page=6',
});

export function getNationalRsnatReference() {
  const { paidClaimLines, deniedClaimLines } = RSNAT_REPORTED_OUTCOMES;
  // Use the source's explicitly labeled line counts, not authorization requests
  // or its separate selected prepayment-review cohort.
  const outcomeClaimLines = paidClaimLines + deniedClaimLines;
  return {
    ...RSNAT_REPORTED_OUTCOMES,
    outcomeClaimLines,
    ratePct: (deniedClaimLines / outcomeClaimLines) * 100,
    unit: 'claim lines' as const,
    geography: 'national-program' as const,
    scope: 'Medicare Part B FFS · Repetitive, scheduled non-emergency ambulance transport',
  };
}
