import type { ProviderEvidence } from '../data/providerProfileEvidence';

export const coverageLabels = {
  profiles: 'Department profiles',
  device: 'Named device model',
  inventory: 'Dated equipment count',
  purchase: 'Documented purchase date',
  funding: 'Funding record',
  quality: 'Clinical measures',
  payerMix: 'Published payer mix',
  denials: 'Payer-specific denials',
  medicaid: 'Medicaid billing',
};
export type Coverage = Record<keyof typeof coverageLabels, number>;
export function countDepartment(
  totals: Coverage | undefined,
  evidence: ProviderEvidence | undefined,
  medicaid: boolean,
): Coverage {
  const count = totals ?? {
    profiles: 0,
    device: 0,
    inventory: 0,
    purchase: 0,
    funding: 0,
    quality: 0,
    payerMix: 0,
    denials: 0,
    medicaid: 0,
  };
  count.profiles++;
  if (evidence?.equipment?.some((r) => r.model)) count.device++;
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
  return count;
}
