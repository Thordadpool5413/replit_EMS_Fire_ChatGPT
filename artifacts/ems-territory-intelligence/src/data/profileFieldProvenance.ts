import { hasVerifiedProviderIdentity } from './providerIdentity.ts';

export type FieldProvenanceKind =
  | 'live_record'
  | 'source_linked'
  | 'local_claim'
  | 'modeled'
  | 'unavailable';

export interface FieldProvenance {
  kind: FieldProvenanceKind;
  label: string;
  explanation: string;
  sourceUrl?: string;
}

function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

export function resolveProfileFieldProvenance(
  rawProfile: unknown,
  normalizedProfile: unknown,
  fieldPath: string
): FieldProvenance {
  const raw = asRecord(rawProfile);
  const profile = asRecord(normalizedProfile);
  const rawValue = readPath(rawProfile, fieldPath);
  const normalizedValue = readPath(normalizedProfile, fieldPath);
  const npiNumber = typeof profile.npiNumber === 'string' ? profile.npiNumber : '';
  const nppesUrl = isHttpUrl(profile.nppesRegistryUrl)
    ? profile.nppesRegistryUrl
    : npiNumber
      ? `https://npiregistry.cms.hhs.gov/provider-view/${npiNumber}`
      : undefined;
  const usfaUrl = profile.usfaRegistryUrl;
  const femaUrl = 'https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants';
  const identityVerified = profile.isVerifiedRecord === true &&
    hasVerifiedProviderIdentity(profile as unknown as Parameters<typeof hasVerifiedProviderIdentity>[0]) &&
    !['UNRELATED_ENTITY', 'RELATIONSHIP_UNRESOLVED'].includes(String(profile.operatingRelationship || ''));

  if (fieldPath === 'npiNumber' && identityVerified) {
    return {
      kind: 'source_linked',
      label: 'Source linked',
      explanation: 'NPPES identity and exact name/city/state match; this does not validate operations.',
      sourceUrl: nppesUrl
    };
  }

  if (fieldPath === 'name' && identityVerified && profile.name === profile.nppesOfficialName) {
    return {
      kind: 'source_linked',
      label: 'Source linked',
      explanation: 'Agency name matches the organization name in the linked NPPES record.',
      sourceUrl: nppesUrl
    };
  }

  if (fieldPath === 'nppesOfficialName' && identityVerified && hasValue(profile.nppesOfficialName)) {
    return {
      kind: 'source_linked',
      label: 'Source linked',
      explanation: 'Organization name is linked to the matching NPPES record.',
      sourceUrl: nppesUrl
    };
  }

  if (
    ['address', 'nppesVerifiedAddress'].includes(fieldPath) &&
    identityVerified &&
    hasValue(profile.nppesVerifiedAddress) &&
    profile.address === profile.nppesVerifiedAddress
  ) {
    return {
      kind: 'source_linked',
      label: 'Source linked',
      explanation: 'Address matches the NPPES practice location for the matched identity.',
      sourceUrl: nppesUrl
    };
  }

  if (
    ['city', 'nppesVerifiedCity'].includes(fieldPath) &&
    identityVerified &&
    profile.city === profile.nppesVerifiedCity
  ) {
    return {
      kind: 'source_linked',
      label: 'Source linked',
      explanation: 'City matches the NPPES record used for the identity check.',
      sourceUrl: nppesUrl
    };
  }

  if (
    ['stateCode', 'nppesVerifiedStateCode'].includes(fieldPath) &&
    identityVerified &&
    profile.stateCode === profile.nppesVerifiedStateCode
  ) {
    return {
      kind: 'source_linked',
      label: 'Source linked',
      explanation: 'State matches the NPPES record used for the identity check.',
      sourceUrl: nppesUrl
    };
  }

  if (
    fieldPath === 'fdid' &&
    profile.isFdidVerified === true &&
    hasValue(profile.fdid) &&
    isHttpUrl(usfaUrl) &&
    usfaUrl !== 'https://apps.usfa.fema.gov/registry/'
  ) {
    return {
      kind: 'source_linked',
      label: 'Source linked',
      explanation: 'FDID has a department-specific USFA registry link; station counts are not validated by this.',
      sourceUrl: usfaUrl
    };
  }

  if (fieldPath === 'liveFemaAwards' && Array.isArray(profile.liveFemaAwards) && profile.liveFemaAwards.length > 0) {
    return {
      kind: 'live_record',
      label: 'Live record',
      explanation: 'Returned from OpenFEMA AFG v1; this row is not automatically matched to the local agency.',
      sourceUrl: femaUrl
    };
  }

  if (
    fieldPath.startsWith('femaGrantHistory') &&
    !Array.isArray(raw.femaGrantHistory) &&
    Array.isArray(profile.liveFemaAwards) &&
    profile.liveFemaAwards.length > 0
  ) {
    return {
      kind: 'live_record',
      label: 'Live record',
      explanation: 'Historical OpenFEMA award record only; not proof of remaining funds or a local profile match.',
      sourceUrl: femaUrl
    };
  }

  if (
    fieldPath.startsWith('installedFleet.') &&
    profile.installedFleet &&
    typeof profile.installedFleet === 'object'
  ) {
    const fleet = profile.installedFleet as Record<string, unknown>;
    if (fleet.isVerifiedEquipment === true && hasValue(fleet.procurementResolutionId) && isHttpUrl(fleet.procurementSourceDoc)) {
      return {
        kind: 'source_linked',
        label: 'Source linked',
        explanation: 'Linked to the profile’s procurement record; review the cited document for field scope.',
        sourceUrl: fleet.procurementSourceDoc
      };
    }
    if (fieldPath.toLowerCase().includes('warranty') && fleet.isVerifiedWarranty === true && isHttpUrl(fleet.warrantyContractDoc)) {
      return {
        kind: 'source_linked',
        label: 'Source linked',
        explanation: 'Warranty value is linked to a contract document.',
        sourceUrl: fleet.warrantyContractDoc
      };
    }
  }

  if (
    fieldPath.startsWith('competitorContract.') &&
    profile.competitorContract &&
    typeof profile.competitorContract === 'object'
  ) {
    const contract = profile.competitorContract as Record<string, unknown>;
    if (contract.isVerifiedContract === true && isHttpUrl(contract.contractSourceDoc)) {
      return {
        kind: 'source_linked',
        label: 'Source linked',
        explanation: 'Contract value is linked to a procurement document.',
        sourceUrl: contract.contractSourceDoc
      };
    }
  }

  if (hasValue(rawValue)) {
    return {
      kind: 'local_claim',
      label: 'Local claim',
      explanation: 'Stored in the local profile; a field-specific source has not been linked.'
    };
  }

  if (hasValue(normalizedValue)) {
    return {
      kind: 'modeled',
      label: 'Modeled',
      explanation: 'Filled by a default or calculation because the local profile did not provide this field.'
    };
  }

  return {
    kind: 'unavailable',
    label: 'Not provided',
    explanation: 'No value is available for this field.'
  };
}
