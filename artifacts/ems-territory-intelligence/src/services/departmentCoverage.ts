import type { ProviderEvidence } from '../data/providerProfileEvidence';

export const coverageLabels = {
  profiles: 'Department profiles',
  device: 'Named device model',
  aed: 'AED record',
  supplier: 'Named equipment supplier',
  inventory: 'Dated equipment count',
  purchase: 'Documented purchase date',
  funding: 'Funding record',
  quality: 'Clinical measures',
  payerMix: 'Published payer mix',
  denials: 'Payer-specific denials',
  medicaid: 'Medicaid billing',
  medicare: 'Original Medicare ambulance billing',
  incidents: 'NFIRS incident reporting',
};
export type Coverage = Record<keyof typeof coverageLabels, number> & { unassigned: number };
export function emptyCoverage(): Coverage {
  return {
    profiles: 0,
    unassigned: 0,
    device: 0,
    aed: 0,
    supplier: 0,
    inventory: 0,
    purchase: 0,
    funding: 0,
    quality: 0,
    payerMix: 0,
    denials: 0,
    medicaid: 0,
    medicare: 0,
    incidents: 0,
  };
}

export function countDepartment(
  totals: Coverage | undefined,
  evidence: ProviderEvidence | undefined,
  medicaid: boolean,
  medicare = false,
  incidents = false,
): Coverage {
  const count = totals ?? emptyCoverage();
  count.profiles++;
  if (evidence?.equipment?.some((r) => r.model)) count.device++;
  if (evidence?.equipment?.some((r) => r.category === 'aed')) count.aed++;
  if (evidence?.equipment?.some((r) => r.supplier)) count.supplier++;
  if (
    evidence?.equipment?.some(
      (r) => r.quantity != null && ['In service reported', 'Documented historically'].includes(r.status),
    )
  )
    count.inventory++;
  if (evidence?.equipment?.some((r) => r.lastPurchasedOn)) count.purchase++;
  if (evidence?.funding?.length) count.funding++;
  if (evidence?.quality?.length) count.quality++;
  if (evidence?.payerMix?.length) count.payerMix++;
  if (evidence?.billingDenials?.some((r) => r.denialPayer)) count.denials++;
  if (medicaid) count.medicaid++;
  if (medicare) count.medicare++;
  if (incidents) count.incidents++;
  return count;
}

export async function loadDepartmentCoverage(state: string) {
  const response = await fetch(import.meta.env.BASE_URL + 'data/providers/coverage-' + state + '.json');
  if (!response.ok) throw Error('Coverage unavailable');
  return await response.json() as Record<string, Coverage>;
}
