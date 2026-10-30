export interface SourceEvidence {
  sourceUrl: string;
  retrievedAt: string;
  sourceUpdatedAt?: string;
}

export interface ImportedAfgAward {
  awardNumber?: string;
  grantee: string;
  stateCode?: string;
  programName?: string;
  awardAmount?: number;
  fiscalYear?: number;
  evidence: SourceEvidence;
}

export interface ImportedNppesProvider {
  npiNumber: string;
  organizationName: string;
  address?: string;
  city: string;
  stateCode: string;
  postalCode?: string;
  taxonomyCode?: string;
  taxonomyDescription?: string;
  authorizedOfficialName?: string;
  authorizedOfficialTitle?: string;
  registryUrl: string;
  nppesLastUpdated?: string;
  nppesEvidence: SourceEvidence;
  femaAwards: ImportedAfgAward[];
  importedAt: string;
  relationshipConfirmedByUser: true;
}

export const PROVIDER_SOURCE_IMPORTS_STORAGE_KEY =
  "ems_provider_source_imports_v1";

export function normalizeExactOrganizationName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isExactFemaRecipientMatch(
  registryOrganizationName: string,
  femaGranteeName: string,
): boolean {
  const registryName = normalizeExactOrganizationName(registryOrganizationName);
  const granteeName = normalizeExactOrganizationName(femaGranteeName);
  return Boolean(registryName && granteeName && registryName === granteeName);
}

export function loadProviderSourceImports(): ImportedNppesProvider[] {
  try {
    const raw = window.localStorage.getItem(PROVIDER_SOURCE_IMPORTS_STORAGE_KEY);
    if (!raw) return [];
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    return records.filter(isImportedNppesProvider);
  } catch {
    return [];
  }
}

export function saveProviderSourceImport(
  record: ImportedNppesProvider,
): ImportedNppesProvider[] {
  const current = loadProviderSourceImports();
  const next = [
    record,
    ...current.filter((saved) => saved.npiNumber !== record.npiNumber),
  ];
  window.localStorage.setItem(
    PROVIDER_SOURCE_IMPORTS_STORAGE_KEY,
    JSON.stringify(next),
  );
  return next;
}

function isEvidence(value: unknown): value is SourceEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<SourceEvidence>;
  return Boolean(
    typeof evidence.sourceUrl === "string" &&
      /^https?:\/\//i.test(evidence.sourceUrl) &&
      typeof evidence.retrievedAt === "string" &&
      Number.isFinite(Date.parse(evidence.retrievedAt)),
  );
}

function isImportedNppesProvider(
  value: unknown,
): value is ImportedNppesProvider {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ImportedNppesProvider>;
  return Boolean(
    typeof record.npiNumber === "string" &&
      /^\d{10}$/.test(record.npiNumber) &&
      typeof record.organizationName === "string" &&
      record.organizationName.trim() &&
      typeof record.city === "string" &&
      record.city.trim() &&
      typeof record.stateCode === "string" &&
      /^[A-Z]{2}$/.test(record.stateCode) &&
      typeof record.registryUrl === "string" &&
      /^https:\/\/npiregistry\.cms\.hhs\.gov\//i.test(record.registryUrl) &&
      isEvidence(record.nppesEvidence) &&
      typeof record.importedAt === "string" &&
      Number.isFinite(Date.parse(record.importedAt)) &&
      record.relationshipConfirmedByUser === true &&
      Array.isArray(record.femaAwards) &&
      record.femaAwards.every(
        (award) =>
          Boolean(award) &&
          typeof award.grantee === "string" &&
          isEvidence(award.evidence),
      ),
  );
}
