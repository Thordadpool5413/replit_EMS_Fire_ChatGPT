import type { Agency } from '../types';

export type FemaAfgAwardRecord = NonNullable<Agency['liveFemaAwards']>[number];

export function findExactFemaAfgAward(
  agency: Pick<Agency, 'name' | 'nppesOfficialName' | 'grantStatus' | 'liveFemaAwards'>,
): FemaAfgAwardRecord | undefined {
  const expectedAwardNumber = agency.grantStatus.afgAwardNumber?.trim();
  const expectedRecipient = (agency.nppesOfficialName || agency.name).trim().toLocaleLowerCase();
  const matches = (agency.liveFemaAwards || []).filter((award) => {
    const recipientMatches = Boolean(
      award.grantee?.trim() &&
      award.grantee.trim().toLocaleLowerCase() === expectedRecipient
    );
    if (!recipientMatches) return false;

    if (expectedAwardNumber) {
      return Boolean(
        award.awardNumber?.trim() &&
        award.awardNumber.trim() === expectedAwardNumber
      );
    }

    const amount = award.federalShareAwarded ?? award.awardAmount;
    const year = award.programYear ?? award.fiscalYear;
    return Boolean(
      amount === agency.grantStatus.afgAwardAmount &&
      year === agency.grantStatus.afgFiscalYear
    );
  });

  return matches.length === 1 ? matches[0] : undefined;
}
