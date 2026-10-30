export interface AgencyLegalGeography {
  name: string;
  city: string;
  stateCode: string;
}

export interface RegistryLegalGeography {
  legalName: string;
  city: string;
  stateCode: string;
}

export interface VerifiedFieldEvidence {
  sourceUrl: string;
  retrievedAt: string;
}

export const REQUIRED_DIRECTORY_EVIDENCE_FIELDS = [
  "annualCallVolume",
  "annual911Transports",
  "annualCardiacArrestCalls",
  "utsteinSurvivalRate",
  "populationServed",
  "cmsData.claimDenialRate",
  "cmsData.medicareBilledAnnual",
  "installedFleet.defibAgeYears",
  "installedFleet.defibBrand",
  "installedFleet.billingSoftware",
  "installedFleet.epcrCadSoftware",
  "installedFleet.defibUnitsCount",
  "installedFleet.defibWarrantyStatus",
  "grantStatus.afgAwardAmount",
  "grantStatus.afgAwarded",
  "grantStatus.saferGrantActive",
  "grantStatus.afgFiscalYear",
  "gisData.avgTransportTimeMinutes",
  "gisData.publicAccessAedDeficitPct",
  "gisData.seniorPopulationPct",
  "cmsData.topDenialReasonCode",
] as const;

function normalizeIdentityValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchesExactLegalGeography(
  agency: AgencyLegalGeography,
  registry: RegistryLegalGeography,
): boolean {
  const agencyName = normalizeIdentityValue(agency.name);
  const registryName = normalizeIdentityValue(registry.legalName);
  const agencyCity = normalizeIdentityValue(agency.city);
  const registryCity = normalizeIdentityValue(registry.city);
  const agencyState = agency.stateCode.trim().toUpperCase();
  const registryState = registry.stateCode.trim().toUpperCase();

  return Boolean(
    agencyName &&
      registryName &&
      agencyCity &&
      registryCity &&
      agencyState &&
      registryState &&
      agencyName === registryName &&
      agencyCity === registryCity &&
      agencyState === registryState,
  );
}

export function hasVerifiedLegalGeography(
  agency: AgencyLegalGeography & {
    isVerifiedRecord?: boolean;
    nppesOfficialName?: string;
    nppesVerifiedCity?: string;
    nppesVerifiedStateCode?: string;
  },
): boolean {
  return (
    agency.isVerifiedRecord === true &&
    matchesExactLegalGeography(
      agency,
      {
        legalName: agency.nppesOfficialName ?? "",
        city: agency.nppesVerifiedCity ?? "",
        stateCode: agency.nppesVerifiedStateCode ?? "",
      },
    )
  );
}

export function hasVerifiedProviderIdentity(
  agency: AgencyLegalGeography & {
    isVerifiedRecord?: boolean;
    npiNumber?: string;
    nppesOfficialName?: string;
    nppesVerifiedCity?: string;
    nppesVerifiedStateCode?: string;
  },
): boolean {
  const npi = agency.npiNumber ?? "";
  if (!/^\d{10}$/.test(npi)) return false;

  const digits = `80840${npi.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  return (
    (10 - (sum % 10)) % 10 === Number(npi[9]) &&
    hasVerifiedLegalGeography(agency)
  );
}

export function hasVerifiedNppesEvidence(
  agency: AgencyLegalGeography & {
    isVerifiedRecord?: boolean;
    npiNumber?: string;
    nppesOfficialName?: string;
    nppesVerifiedCity?: string;
    nppesVerifiedStateCode?: string;
    verificationSource?: string;
    lastVerifiedAt?: string;
  },
): boolean {
  const verifiedAt = agency.lastVerifiedAt
    ? Date.parse(agency.lastVerifiedAt)
    : Number.NaN;

  return (
    hasVerifiedProviderIdentity(agency) &&
    /nppes/i.test(agency.verificationSource ?? "") &&
    Number.isFinite(verifiedAt)
  );
}

/**
 * Profiles feed operational metrics and modeled scores throughout the app.
 * Identity verification alone is not enough to publish those values.
 */
export function hasCompleteVerifiedDirectoryProfile(
  agency: AgencyLegalGeography & {
    isVerifiedRecord?: boolean;
    npiNumber?: string;
    nppesOfficialName?: string;
    nppesVerifiedCity?: string;
    nppesVerifiedStateCode?: string;
    verificationSource?: string;
    lastVerifiedAt?: string;
    verifiedFieldEvidence?: Record<string, VerifiedFieldEvidence>;
    annualCallVolume?: number;
    annual911Transports?: number;
    annualCardiacArrestCalls?: number;
    utsteinSurvivalRate?: number;
    populationServed?: number;
    cmsData?: {
      claimDenialRate?: number;
      medicareBilledAnnual?: number;
      estimatedRecoverableRevenue?: number;
      topDenialReasonCode?: string;
    };
    installedFleet?: {
      defibAgeYears?: number;
      defibBrand?: string;
      billingSoftware?: string;
      epcrCadSoftware?: string;
      defibUnitsCount?: number;
      defibWarrantyStatus?: string;
    };
    grantStatus?: {
      afgAwardAmount?: number;
      afgAwarded?: boolean;
      saferGrantActive?: boolean;
      afgFiscalYear?: number;
    };
    gisData?: {
      avgTransportTimeMinutes?: number;
      publicAccessAedDeficitPct?: number;
      seniorPopulationPct?: number;
    };
  },
): boolean {
  if (!hasVerifiedNppesEvidence(agency)) return false;

  const sourceEvidenceComplete = REQUIRED_DIRECTORY_EVIDENCE_FIELDS.every((fieldPath) => {
    const evidence = agency.verifiedFieldEvidence?.[fieldPath];
    return Boolean(
      evidence &&
        /^https?:\/\//i.test(evidence.sourceUrl) &&
        Number.isFinite(Date.parse(evidence.retrievedAt)),
    );
  });
  if (!sourceEvidenceComplete) return false;

  const profileValues: Record<string, unknown> = {
    annualCallVolume: agency.annualCallVolume,
    annual911Transports: agency.annual911Transports,
    annualCardiacArrestCalls: agency.annualCardiacArrestCalls,
    utsteinSurvivalRate: agency.utsteinSurvivalRate,
    populationServed: agency.populationServed,
    "cmsData.claimDenialRate": agency.cmsData?.claimDenialRate,
    "cmsData.medicareBilledAnnual": agency.cmsData?.medicareBilledAnnual,
    "installedFleet.defibAgeYears": agency.installedFleet?.defibAgeYears,
    "installedFleet.defibBrand": agency.installedFleet?.defibBrand,
    "installedFleet.billingSoftware": agency.installedFleet?.billingSoftware,
    "installedFleet.epcrCadSoftware": agency.installedFleet?.epcrCadSoftware,
    "installedFleet.defibUnitsCount": agency.installedFleet?.defibUnitsCount,
    "installedFleet.defibWarrantyStatus": agency.installedFleet?.defibWarrantyStatus,
    "grantStatus.afgAwardAmount": agency.grantStatus?.afgAwardAmount,
    "grantStatus.afgAwarded": agency.grantStatus?.afgAwarded,
    "grantStatus.saferGrantActive": agency.grantStatus?.saferGrantActive,
    "grantStatus.afgFiscalYear": agency.grantStatus?.afgFiscalYear,
    "gisData.avgTransportTimeMinutes": agency.gisData?.avgTransportTimeMinutes,
    "gisData.publicAccessAedDeficitPct": agency.gisData?.publicAccessAedDeficitPct,
    "gisData.seniorPopulationPct": agency.gisData?.seniorPopulationPct,
    "cmsData.topDenialReasonCode": agency.cmsData?.topDenialReasonCode,
  };

  return REQUIRED_DIRECTORY_EVIDENCE_FIELDS.every((fieldPath) => {
    const value = profileValues[fieldPath];
    return typeof value === "number"
      ? Number.isFinite(value)
      : typeof value === "string"
        ? value.trim().length > 0
        : typeof value === "boolean";
  });
}

export function hasVerifiedFieldEvidence(
  agency: {
    verifiedFieldEvidence?: Record<string, VerifiedFieldEvidence>;
  },
  fieldPath: string,
): boolean {
  const evidence = agency.verifiedFieldEvidence?.[fieldPath];
  return Boolean(
    evidence &&
      /^https?:\/\//i.test(evidence.sourceUrl) &&
      Number.isFinite(Date.parse(evidence.retrievedAt)),
  );
}
