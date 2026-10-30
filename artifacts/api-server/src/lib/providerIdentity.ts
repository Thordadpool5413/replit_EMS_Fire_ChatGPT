export interface ProviderIdentityLocation {
  legalName: string;
  city: string;
  stateCode: string;
  npiNumber?: string;
}

export interface ProviderIdentityRequest {
  agencyName: string;
  city: string;
  stateCode: string;
  npiNumber?: string;
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

export function matchesExactProviderIdentity(
  requested: ProviderIdentityRequest,
  registry: ProviderIdentityLocation,
): boolean {
  const requestedName = normalizeIdentityValue(requested.agencyName);
  const requestedCity = normalizeIdentityValue(requested.city);
  const requestedState = requested.stateCode.trim().toUpperCase();
  const registryName = normalizeIdentityValue(registry.legalName);
  const registryCity = normalizeIdentityValue(registry.city);
  const registryState = registry.stateCode.trim().toUpperCase();

  return Boolean(
    requestedName &&
      requestedCity &&
      requestedState &&
      registryName &&
      registryCity &&
      registryState &&
      requestedName === registryName &&
      requestedCity === registryCity &&
      requestedState === registryState &&
      (!requested.npiNumber || requested.npiNumber === registry.npiNumber),
  );
}
