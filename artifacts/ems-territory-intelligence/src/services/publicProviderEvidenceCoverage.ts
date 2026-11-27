import type { ProviderEvidence } from '../data/providerProfileEvidence';

export function publicProviderEvidenceCoverage(evidence?: ProviderEvidence) {
  const equipment = evidence?.equipment ?? [];
  return {
    owned: equipment.filter(row => ['In service reported', 'Service agreement'].includes(row.status) &&
      row.owner && row.quantity !== undefined),
    acquisitions: [...new Set(equipment.flatMap(row => [
      row.lastPurchasedOn ? 'Purchase dated ' + row.lastPurchasedOn : '',
      row.paidOn ? 'Paid ' + row.paidOn : '',
      row.acquiredOn ? 'Acquired ' + row.acquiredOn : '',
    ].filter(Boolean)))],
    datedApprovals: [...new Set(equipment.flatMap(row => row.approvedOn ? [row.approvedOn] : []))],
    payerMix: Boolean(evidence?.payerMix?.length),
    denials: Boolean(evidence?.billingDenials?.length),
    namedPayers: [...new Set(evidence?.billingDenials?.flatMap(row => row.denialPayer ? [row.denialPayer] : []) ?? [])],
  };
}

export type EvidenceCoverageCounts = {
  listings: number;
  owned: number;
  acquisitions: number;
  payerMix: number;
  namedDenials: number;
};

export type EvidenceCoverageSnapshot = {
  schemaVersion: 1;
  source: 'Bundled source audit';
  national: EvidenceCoverageCounts;
  byState: Record<string, EvidenceCoverageCounts>;
  byCounty: Record<string, EvidenceCoverageCounts>;
};
