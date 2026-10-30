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
