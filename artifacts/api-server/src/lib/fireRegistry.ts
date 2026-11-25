import type {
  FireRegistryCandidate,
  FireRegistryMatchesResponse,
  FireRegistrySourceStatus,
  FireRegistryStation,
  FireRegistryUnit,
  FireRegistryJurisdiction,
} from "@workspace/api-zod";

const USFA_DOWNLOAD_PAGE = "https://apps.usfa.fema.gov/registry/download";
const USFA_DOWNLOAD_BASE = "https://apps.usfa.fema.gov/registry/api/download";
const NERIS_FEATURE_SERVER =
  "https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer";
const NERIS_PUBLIC_PAGE = NERIS_FEATURE_SERVER;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ARC_GIS_PAGE_SIZE = 1000;
const MAX_STATE_FEATURES = 12000;
const MAX_STATIONS_PER_RECORD = 100;

type SearchInput = {
  agencyName: string;
  city?: string;
  stateCode: string;
  fdid?: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  fetchedAt: string;
  state: "loading" | "ready";
  data?: T;
  promise: Promise<T>;
};

type CsvTable = {
  rows: string[][];
  headerIndex: Map<string, number>;
};

type UsfaDepartment = {
  fdid: string;
  name: string;
  stateCode: string;
  city: string | null;
  county: string | null;
  headquartersAddress: string | null;
  departmentType: string | null;
  organizationType: string | null;
  stationCount: number | null;
};

type UsfaStation = {
  fdid: string;
  stateCode: string; // Parent department state, not station state.
  stationState: string;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
};

type NerisFeature = {
  attributes?: Record<string, unknown>;
};

type NerisDepartment = {
  nerisId: string;
  name: string;
  stateCode: string;
  city: string | null;
  headquartersAddress: string | null;
  departmentType: string | null;
  entityType: string | null;
  stationCount: number | null;
  unitCount: number | null;
  exportDate: Date | null;
};

type NerisStation = {
  nerisId: string | null;
  departmentNerisId: string;
  name: string;
  stateCode: string;
  city: string | null;
  address: string | null;
  postalCode: string | null;
  unitCount: number | null;
  exportDate: Date | null;
};

type MatchCandidate = {
  record: FireRegistryCandidate;
  score: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const sourceFailures = new Map<
  string,
  { message: string; retryAfter: number }
>();

export async function loadCached<T>(
  key: string,
  load: () => Promise<T>,
  failureMessage: string,
): Promise<{ data: T; fetchedAt: string }> {
  const current = cache.get(key) as CacheEntry<T> | undefined;
  if (current?.data !== undefined && (sourceFailures.get(key)?.retryAfter ?? 0) > Date.now()) return {data:current.data,fetchedAt:current.fetchedAt};
  if (current && current.expiresAt > Date.now()) {
    return { data: await current.promise, fetchedAt: current.fetchedAt };
  }

  const entry: CacheEntry<T> = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    fetchedAt: current?.fetchedAt ?? new Date().toISOString(),
    state: "loading",
    promise: Promise.resolve(undefined as T),
  };
  entry.promise = load()
    .then((data) => {
      entry.fetchedAt = new Date().toISOString();
      entry.state = "ready";
      entry.data = data;
      sourceFailures.delete(key);
      return data;
    })
    .catch((error: unknown) => {
      if (cache.get(key) === entry) {
        if (current?.data !== undefined) cache.set(key, current as CacheEntry<unknown>);
        else cache.delete(key);
      }
      sourceFailures.set(key, {
        message: current?.data !== undefined ? `Using cached records retrieved ${current.fetchedAt}; refresh failed. ${failureMessage}` : failureMessage,
        retryAfter: Date.now() + 30000,
      });
      if (current?.data !== undefined) return current.data;
      throw error;
    });
  cache.set(key, entry as CacheEntry<unknown>);

  try {
    return { data: await entry.promise, fetchedAt: entry.fetchedAt };
  } catch (error) {
    throw error;
  }
}

function getCachedValue<T>(
  key: string,
): { data: T; fetchedAt: string } | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (
    !entry ||
    entry.state !== "ready" ||
    entry.data === undefined
  ) {
    return null;
  }
  return { data: entry.data, fetchedAt: entry.fetchedAt };
}

function getSourceFailure(key: string): string | null {
  const failure = sourceFailures.get(key);
  if (!failure) return null;
  if (failure.retryAfter <= Date.now()) {
    sourceFailures.delete(key);
    return null;
  }
  return failure.message;
}

function startCachedLoad(
  key: string,
  load: () => Promise<unknown>,
): void {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return;
  if (getSourceFailure(key)) return;
  void load().catch(() => undefined);
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvRows(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      value = "";
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  return rows;
}

function parseCsvTable(content: string, requiredHeaders: string[]): CsvTable {
  const rows = parseCsvRows(content);
  const headers = rows.shift();
  if (!headers) throw new Error("The USFA download was empty.");

  const headerIndex = new Map(
    headers.map((header, index) => [normalizeHeader(header), index]),
  );
  const missingHeaders = requiredHeaders.filter(
    (header) => !headerIndex.has(normalizeHeader(header)),
  );
  if (missingHeaders.length > 0) {
    throw new Error("The USFA download format did not contain expected fields.");
  }

  return { rows, headerIndex };
}

function csvValue(
  table: CsvTable,
  row: string[],
  header: string,
): string {
  const index = table.headerIndex.get(normalizeHeader(header));
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function optionalText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function numberOrNull(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAddress(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map((part) => part?.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

async function fetchUsfaCsv(
  listName: "national" | "station",
): Promise<string> {
  const url = new URL(`${USFA_DOWNLOAD_BASE}/${listName}`);
  // The official download page appends a cache key; changing it daily allows
  // the app's own 12-hour cache to reuse the same upstream copy.
  url.searchParams.set("cacheKey", String(Math.floor(Date.now() / 86_400_000)));
  const response = await fetch(url, {
    headers: { Accept: "text/csv" },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`USFA returned HTTP ${response.status}.`);
  }
  return response.text();
}

async function getUsfaDepartments(): Promise<{
  data: UsfaDepartment[];
  fetchedAt: string;
}> {
  const result = await loadCached("usfa:departments", async () => {
    const content = await fetchUsfaCsv("national");
    const table = parseCsvTable(content, [
      "FDID",
      "Fire dept name",
      "HQ state",
      "HQ city",
    ]);
    return table.rows.flatMap((row) => {
      const fdid = csvValue(table, row, "FDID");
      const name = csvValue(table, row, "Fire dept name");
      const stateCode = csvValue(table, row, "HQ state").toUpperCase();
      if (!fdid || !name || !/^[A-Z]{2}$/.test(stateCode)) return [];

      return [{
        fdid,
        name,
        stateCode,
        city: optionalText(csvValue(table, row, "HQ city")),
        county: optionalText(csvValue(table, row, "County")),
        headquartersAddress: buildAddress([
          csvValue(table, row, "HQ addr1"),
          csvValue(table, row, "HQ addr2"),
          csvValue(table, row, "HQ city"),
          stateCode,
          csvValue(table, row, "HQ zip"),
        ]),
        departmentType: optionalText(csvValue(table, row, "Dept Type")),
        organizationType: optionalText(
          csvValue(table, row, "Organization Type"),
        ),
        stationCount: numberOrNull(
          csvValue(table, row, "Number Of Stations"),
        ),
      }];
    });
  }, "USFA department records could not be loaded.");
  return { data: result.data, fetchedAt: result.fetchedAt };
}

async function getUsfaStations(): Promise<{
  data: UsfaStation[];
  fetchedAt: string;
}> {
  const result = await loadCached("usfa:stations", async () => {
    const content = await fetchUsfaCsv("station");
    const table = parseCsvTable(content, [
      "FDID",
      "HQ State",
      "Station Name",
      "Station State",
    ]);
    return table.rows.flatMap((row) => {
      const fdid = csvValue(table, row, "FDID");
      const stateCode = csvValue(table, row, "HQ State").toUpperCase();
      const stationState = csvValue(table, row, "Station State").toUpperCase();
      if (!fdid || !/^[A-Z]{2}$/.test(stateCode) || !/^[A-Z]{2}$/.test(stationState)) return [];

      const name =
        optionalText(csvValue(table, row, "Station Name")) ?? "Station record";
      return [{
        fdid,
        stateCode,
        stationState,
        name,
        address: buildAddress([
          csvValue(table, row, "Station Addr1"),
          csvValue(table, row, "Station Addr2"),
        ]),
        city: optionalText(csvValue(table, row, "Station City")),
        postalCode: optionalText(csvValue(table, row, "Station Zip")),
      }];
    });
  }, "USFA station address rows could not be loaded.");
  return { data: result.data, fetchedAt: result.fetchedAt };
}

function nerisLayerUrl(layerId: 0 | 1 | 2 | 3): string {
  return `${NERIS_FEATURE_SERVER}/${layerId}`;
}

function toIsoDate(value: unknown): Date | null {
  const milliseconds =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function queryNerisLayer(
  stateCode: string,
  layerId: 0 | 1,
  outFields: string[],
): Promise<NerisFeature[]> {
  const features: NerisFeature[] = [];
  const layerUrl = `${nerisLayerUrl(layerId)}/query`;
  let offset = 0;

  while (offset < MAX_STATE_FEATURES) {
    const url = new URL(layerUrl);
    url.searchParams.set("where", `state='${stateCode}'`);
    url.searchParams.set("outFields", outFields.join(","));
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("orderByFields", "OBJECTID ASC");
    url.searchParams.set("resultRecordCount", String(ARC_GIS_PAGE_SIZE));
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("f", "json");

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new Error(`NERIS returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as {
      error?: { message?: string };
      features?: NerisFeature[];
      exceededTransferLimit?: boolean;
    };
    if (payload.error) {
      throw new Error(payload.error.message || "NERIS returned an error.");
    }

    if (!Array.isArray(payload.features)) throw new Error("NERIS response has no feature array.");
    const page = payload.features;
    if (features.length + page.length > MAX_STATE_FEATURES) throw new Error("NERIS state results exceeded the safe retrieval limit.");
    features.push(...page);
    if (payload.exceededTransferLimit !== true) return features;
    if (page.length === 0) throw new Error("NERIS pagination stalled.");
    offset += page.length;
  }

  if (offset >= MAX_STATE_FEATURES) {
    throw new Error("NERIS state results exceeded the safe retrieval limit.");
  }
  return features;
}

async function getNerisDepartments(stateCode: string): Promise<{
  data: NerisDepartment[];
  fetchedAt: string;
}> {
  const result = await loadCached(
    `neris:departments:${stateCode}`,
    async () => {
      const features = await queryNerisLayer(stateCode, 0, [
        "neris_id",
        "name",
        "address_line_1",
        "address_line_2",
        "city",
        "state",
        "station_count",
        "unit_count",
        "entity_type",
        "department_type",
        "export_date",
      ]);

      return features.flatMap((feature) => {
        const attributes = feature.attributes ?? {};
        const nerisId = String(attributes.neris_id ?? "").trim();
        const name = String(attributes.name ?? "").trim();
        const sourceState = String(attributes.state ?? "").toUpperCase();
        if (!nerisId || !name || sourceState !== stateCode) return [];
        return [{
          nerisId,
          name,
          stateCode: sourceState,
          city: optionalText(String(attributes.city ?? "")),
          headquartersAddress: buildAddress([
            String(attributes.address_line_1 ?? ""),
            String(attributes.address_line_2 ?? ""),
            String(attributes.city ?? ""),
            sourceState,
          ]),
          departmentType: optionalText(
            String(attributes.department_type ?? ""),
          ),
          entityType: optionalText(String(attributes.entity_type ?? "")),
          stationCount: numberOrNull(
            attributes.station_count as string | number | null | undefined,
          ),
          unitCount: numberOrNull(
            attributes.unit_count as string | number | null | undefined,
          ),
          exportDate: toIsoDate(attributes.export_date),
        }];
      });
    },
    "NERIS department records could not be loaded.",
  );
  return { data: result.data, fetchedAt: result.fetchedAt };
}

async function getNerisStations(stateCode: string): Promise<{
  data: NerisStation[];
  fetchedAt: string;
}> {
  const result = await loadCached(
    `neris:stations:${stateCode}`,
    async () => {
      const features = await queryNerisLayer(stateCode, 1, [
        "neris_id",
        "station_name",
        "address_line_1",
        "address_line_2",
        "city",
        "state",
        "zip_code",
        "unit_count",
        "department_neris_id",
        "export_date",
      ]);

      return features.flatMap((feature) => {
        const attributes = feature.attributes ?? {};
        const stationId = optionalText(String(attributes.neris_id ?? ""));
        const departmentNerisId = String(
          attributes.department_neris_id ?? "",
        ).trim();
        const name = String(attributes.station_name ?? "").trim();
        const sourceState = String(attributes.state ?? "").toUpperCase();
        if (!departmentNerisId || !name || sourceState !== stateCode) return [];
        return [{
          nerisId: stationId,
          departmentNerisId,
          name,
          stateCode: sourceState,
          city: optionalText(String(attributes.city ?? "")),
          address: buildAddress([
            String(attributes.address_line_1 ?? ""),
            String(attributes.address_line_2 ?? ""),
          ]),
          postalCode: optionalText(String(attributes.zip_code ?? "")),
          unitCount: numberOrNull(
            attributes.unit_count as string | number | null | undefined,
          ),
          exportDate: toIsoDate(attributes.export_date),
        }];
      });
    },
    "NERIS station records could not be loaded.",
  );
  return { data: result.data, fetchedAt: result.fetchedAt };
}

function normalizeName(value: string): string {
  const tokens = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const generic = new Set([
    "and",
    "city",
    "county",
    "department",
    "dept",
    "district",
    "emergency",
    "fire",
    "inc",
    "incorporated",
    "of",
    "rescue",
    "service",
    "services",
    "the",
    "township",
    "volunteer",
  ]);
  const meaningful = tokens.filter((token) => !generic.has(token));
  return (meaningful.length > 0 ? meaningful : tokens).sort().join(" ");
}

function nameSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeName(left).split(/\s+/).filter(Boolean));
  const rightTokens = new Set(normalizeName(right).split(/\s+/).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);
  return intersection.length / union.size;
}

function stationRecordUrl(
  layerId: 0 | 1,
  fieldName: "neris_id" | "department_neris_id",
  value: string,
): string {
  const url = new URL(`${nerisLayerUrl(layerId)}/query`);
  const escapedValue = value.replace(/'/g, "''");
  url.searchParams.set("where", `${fieldName}='${escapedValue}'`);
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");
  return url.toString();
}

function nerisDepartmentDetailsUrl(
  layerId: 2 | 3,
  fieldName: "neris_id" | "department_neris_id",
  value: string,
  returnGeometry = false,
): string {
  const url = new URL(`${nerisLayerUrl(layerId)}/query`);
  url.searchParams.set("where", `${fieldName}='${value.replace(/'/g, "''")}'`);
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", String(returnGeometry));
  url.searchParams.set("f", "json");
  return url.toString();
}

async function queryNerisDepartmentLayer(
  layerId: 2 | 3,
  fieldName: "neris_id" | "department_neris_id",
  departmentNerisId: string,
  outFields: string[],
): Promise<NerisFeature[]> {
  const features: NerisFeature[] = [];
  let offset = 0;
  while (offset < MAX_STATE_FEATURES) {
    const url = new URL(`${nerisLayerUrl(layerId)}/query`);
    url.searchParams.set(
      "where",
      `${fieldName}='${departmentNerisId.replace(/'/g, "''")}'`,
    );
    url.searchParams.set("outFields", outFields.join(","));
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("orderByFields", "OBJECTID ASC");
    url.searchParams.set("resultRecordCount", String(ARC_GIS_PAGE_SIZE));
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("f", "json");
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`NERIS returned HTTP ${response.status}.`);
    const payload = (await response.json()) as {
      error?: { message?: string };
      features?: NerisFeature[];
    };
    if (payload.error) {
      throw new Error(payload.error.message || "NERIS returned an error.");
    }
    const page = Array.isArray(payload.features) ? payload.features : [];
    features.push(...page);
    if (page.length < ARC_GIS_PAGE_SIZE) break;
    offset += page.length;
  }
  if (offset >= MAX_STATE_FEATURES) {
    throw new Error("NERIS department details exceeded the safe retrieval limit.");
  }
  return features;
}

async function getNerisDepartmentDetails(
  departmentNerisId: string,
): Promise<{ units: FireRegistryUnit[]; jurisdictions: FireRegistryJurisdiction[] }> {
  const result = await loadCached(
    `neris:department-details:${departmentNerisId}`,
    async () => {
      const [unitFeatures, jurisdictionFeatures] = await Promise.all([
        queryNerisDepartmentLayer(3, "department_neris_id", departmentNerisId, [
          "neris_id",
          "cad_designation_1",
          "cad_designation_2",
          "type",
          "dedicated_staffing",
          "station_neris_id",
          "station_name",
          "department_neris_id",
          "export_date",
        ]),
        queryNerisDepartmentLayer(2, "neris_id", departmentNerisId, [
          "neris_id",
          "name",
          "region_type",
          "entity_type",
          "department_type",
          "export_date",
        ]),
      ]);
      const units = unitFeatures.flatMap((feature) => {
        const attrs = feature.attributes ?? {};
        const sourceRecordId = optionalText(String(attrs.neris_id ?? ""));
        const linkedDepartmentId = optionalText(
          String(attrs.department_neris_id ?? ""),
        );
        if (!sourceRecordId || linkedDepartmentId !== departmentNerisId) return [];
        return [{
          sourceRecordId,
          sourceUrl: nerisDepartmentDetailsUrl(
            3,
            "department_neris_id",
            departmentNerisId,
          ),
          departmentNerisId,
          stationNerisId: optionalText(String(attrs.station_neris_id ?? "")),
          stationName: optionalText(String(attrs.station_name ?? "")),
          unitType: optionalText(String(attrs.type ?? "")),
          cadDesignation1: optionalText(String(attrs.cad_designation_1 ?? "")),
          cadDesignation2: optionalText(String(attrs.cad_designation_2 ?? "")),
          dedicatedStaffing: optionalText(String(attrs.dedicated_staffing ?? "")),
          exportDate: toIsoDate(attrs.export_date),
        }];
      });
      const jurisdictions = jurisdictionFeatures.flatMap((feature) => {
        const attrs = feature.attributes ?? {};
        const sourceRecordId = optionalText(String(attrs.neris_id ?? ""));
        if (!sourceRecordId) return [];
        return [{
          sourceRecordId,
          sourceUrl: nerisDepartmentDetailsUrl(
            2,
            "neris_id",
            departmentNerisId,
            true,
          ),
          name: optionalText(String(attrs.name ?? "")),
          regionType: optionalText(String(attrs.region_type ?? "")),
          entityType: optionalText(String(attrs.entity_type ?? "")),
          departmentType: optionalText(String(attrs.department_type ?? "")),
          exportDate: toIsoDate(attrs.export_date),
          boundaryAvailableAtSource: true,
        }];
      });
      return { units, jurisdictions };
    },
    "NERIS unit or jurisdiction details could not be loaded.",
  );
  return result.data;
}

function makeMatch(
  input: SearchInput,
  fields: {
    source: "USFA NFDR" | "NERIS";
    sourceRecordId: string;
    sourceUrl: string;
    agencyName: string;
    stateCode: string;
    city: string | null;
    county: string | null;
    headquartersAddress: string | null;
    fdid: string | null;
    nerisId: string | null;
    departmentType: string | null;
    organizationType: string | null;
    entityType: string | null;
    stationCount: number | null;
    unitCount: number | null;
    exportDate: Date | null;
    stations: FireRegistryStation[];
    stationsTruncated: boolean;
  },
): MatchCandidate | null {
  const stateMatch = fields.stateCode.toUpperCase() === input.stateCode;
  if (!stateMatch) return null;

  const appName = normalizeName(input.agencyName);
  const sourceName = normalizeName(fields.agencyName);
  const exactName = appName.length > 0 && appName === sourceName;
  const similarity = nameSimilarity(input.agencyName, fields.agencyName);
  const cityMatch =
    Boolean(input.city?.trim()) &&
    normalizeName(input.city ?? "") === normalizeName(fields.city ?? "");
  const appFdid = input.fdid?.trim().toUpperCase() ?? "";
  const sourceFdid = fields.fdid?.trim().toUpperCase() ?? "";
  const fdidMatch = Boolean(appFdid && sourceFdid && appFdid === sourceFdid);
  const fdidConflict = Boolean(appFdid && sourceFdid && appFdid !== sourceFdid);

  let score = 25;
  const matchReasons = ["Same state"];
  if (exactName) {
    score += 55;
    matchReasons.push("Agency names match after normalization");
  } else if (similarity >= 0.55) {
    score += similarity >= 0.75 ? 40 : 28;
    matchReasons.push("Agency names share key terms");
  }
  if (cityMatch) {
    score += 20;
    matchReasons.push("Same city");
  }
  if (fdidMatch) {
    score += 35;
    matchReasons.push("State-scoped FDID matches");
  } else if (fdidConflict) {
    score -= 30;
    matchReasons.push("App FDID differs from this registry record");
  }
  if (score < 60) return null;

  const strongNameLocationCandidate =
    exactName && cityMatch && !fdidConflict;
  const record: FireRegistryCandidate = {
    source: fields.source,
    sourceRecordId: fields.sourceRecordId,
    sourceUrl: fields.sourceUrl,
    agencyName: fields.agencyName,
    stateCode: fields.stateCode,
    city: fields.city,
    county: fields.county,
    headquartersAddress: fields.headquartersAddress,
    fdid: fields.fdid,
    nerisId: fields.nerisId,
    departmentType: fields.departmentType,
    organizationType: fields.organizationType,
    entityType: fields.entityType,
    stationCount: fields.stationCount,
    unitCount: fields.unitCount,
    exportDate: fields.exportDate,
    matchLevel: strongNameLocationCandidate
      ? "strong_candidate"
      : "possible_candidate",
    matchReasons,
    stations: fields.stations,
    stationsTruncated: fields.stationsTruncated,
    units: [],
    unitsTruncated: false,
    jurisdictions: [],
    jurisdictionsTruncated: false,
  };
  return { record, score };
}

function toUsfaStation(
  station: UsfaStation,
): FireRegistryStation {
  return {
    source: "USFA NFDR",
    sourceRecordId: null,
    sourceUrl: USFA_DOWNLOAD_PAGE,
    name: station.name,
    address: station.address,
    city: station.city,
    stateCode: station.stationState,
    postalCode: station.postalCode,
    unitCount: null,
    exportDate: null,
  };
}

function toNerisStation(station: NerisStation): FireRegistryStation {
  const sourceUrl = station.nerisId
    ? stationRecordUrl(1, "neris_id", station.nerisId)
    : stationRecordUrl(1, "department_neris_id", station.departmentNerisId);
  return {
    source: "NERIS",
    sourceRecordId: station.nerisId,
    sourceUrl,
    name: station.name,
    address: station.address,
    city: station.city,
    stateCode: station.stateCode,
    postalCode: station.postalCode,
    unitCount: station.unitCount,
    exportDate: station.exportDate,
  };
}

function boundedStations(
  stations: FireRegistryStation[],
): { stations: FireRegistryStation[]; stationsTruncated: boolean } {
  return {
    stations: stations.slice(0, MAX_STATIONS_PER_RECORD),
    stationsTruncated: stations.length > MAX_STATIONS_PER_RECORD,
  };
}

function usfaCandidates(
  input: SearchInput,
  departments: UsfaDepartment[],
  stationRows: UsfaStation[],
): MatchCandidate[] {
  const stateDepartments = departments.filter(
    (department) => department.stateCode === input.stateCode,
  );
  return stateDepartments.flatMap((department) => {
    const stationDetails = stationRows
      .filter(
        (station) =>
          station.stateCode === department.stateCode &&
          station.fdid === department.fdid,
      )
      .map(toUsfaStation);
    const bounded = boundedStations(stationDetails);
    const candidate = makeMatch(input, {
      source: "USFA NFDR",
      sourceRecordId: `${department.stateCode}:${department.fdid}`,
      sourceUrl: USFA_DOWNLOAD_PAGE,
      agencyName: department.name,
      stateCode: department.stateCode,
      city: department.city,
      county: department.county,
      headquartersAddress: department.headquartersAddress,
      fdid: department.fdid,
      nerisId: null,
      departmentType: department.departmentType,
      organizationType: department.organizationType,
      entityType: null,
      stationCount: department.stationCount,
      unitCount: null,
      exportDate: null,
      stations: bounded.stations,
      stationsTruncated: bounded.stationsTruncated,
    });
    return candidate ? [candidate] : [];
  });
}

function nerisCandidates(
  input: SearchInput,
  departments: NerisDepartment[],
  stationRows: NerisStation[],
): MatchCandidate[] {
  return departments.flatMap((department) => {
    const stationDetails = stationRows
      .filter((station) => station.departmentNerisId === department.nerisId)
      .map(toNerisStation);
    const bounded = boundedStations(stationDetails);
    const candidate = makeMatch(input, {
      source: "NERIS",
      sourceRecordId: department.nerisId,
      sourceUrl: stationRecordUrl(0, "neris_id", department.nerisId),
      agencyName: department.name,
      stateCode: department.stateCode,
      city: department.city,
      county: null,
      headquartersAddress: department.headquartersAddress,
      fdid: null,
      nerisId: department.nerisId,
      departmentType: department.departmentType,
      organizationType: null,
      entityType: department.entityType,
      stationCount: department.stationCount,
      unitCount: department.unitCount,
      exportDate: department.exportDate,
      stations: bounded.stations,
      stationsTruncated: bounded.stationsTruncated,
    });
    return candidate ? [candidate] : [];
  });
}

function sourceStatus(
  source: "USFA NFDR" | "NERIS",
  sourceUrl: string,
  status: "available" | "loading" | "unavailable",
  fetchedAt: string | null,
  recordCount: number,
  errorMessage: string | null,
): FireRegistrySourceStatus {
  return {
    source,
    status,
    sourceUrl,
    fetchedAt: fetchedAt ? new Date(fetchedAt) : null,
    recordCount,
    errorMessage,
  };
}

export async function searchFireRegistryMatches(
  input: SearchInput,
): Promise<FireRegistryMatchesResponse> {
  const stateCode = input.stateCode.toUpperCase();
  const normalizedInput = { ...input, stateCode };

  startCachedLoad("usfa:departments", getUsfaDepartments);
  startCachedLoad("usfa:stations", getUsfaStations);

  const usfaDepartments = getCachedValue<UsfaDepartment[]>("usfa:departments");
  const usfaStations = getCachedValue<UsfaStation[]>("usfa:stations");

  const [nerisDepartmentsResult, nerisStationsResult] = await Promise.allSettled([
    getNerisDepartments(stateCode),
    getNerisStations(stateCode),
  ]);

  const nerisDepartments =
    nerisDepartmentsResult.status === "fulfilled"
      ? nerisDepartmentsResult.value
      : null;
  const nerisStations =
    nerisStationsResult.status === "fulfilled"
      ? nerisStationsResult.value
      : null;

  const usfaDepartmentFailure = getSourceFailure("usfa:departments");
  const usfaStationFailure = getSourceFailure("usfa:stations");
  const usfaStatus = usfaDepartments
    ? "available"
    : usfaDepartmentFailure
      ? "unavailable"
      : "loading";
  const usfaError = (usfaDepartmentFailure && usfaDepartments) ? `Using previously retrieved USFA records (${usfaDepartments.fetchedAt}). ${usfaDepartmentFailure}` : usfaDepartments
    ? usfaStations
      ? null
      : usfaStationFailure ??
        "USFA department records loaded; station address rows are still loading."
    : usfaDepartmentFailure ??
      "USFA national department data is loading; NERIS results are shown first.";
  const nerisError = getSourceFailure(`neris:departments:${stateCode}`) || getSourceFailure(`neris:stations:${stateCode}`) ||
    !nerisDepartments
      ? "NERIS department records could not be loaded."
      : !nerisStations
        ? "NERIS department records loaded, but station records could not be loaded."
        : null;

  const records: MatchCandidate[] = [];
  if (usfaDepartments) {
    records.push(
      ...usfaCandidates(
        normalizedInput,
        usfaDepartments.data,
        usfaStations?.data ?? [],
      ),
    );
  }
  if (nerisDepartments) {
    records.push(
      ...nerisCandidates(
        normalizedInput,
        nerisDepartments.data,
        nerisStations?.data ?? [],
      ),
    );
  }

  records.sort((left, right) => right.score - left.score);
  const topRecords = records.slice(0, 10);
  let nerisDetailsUnavailable = false;
  await Promise.all(
    topRecords.map(async ({ record }) => {
      if (record.source !== "NERIS" || !record.nerisId) return;
      try {
        const details = await getNerisDepartmentDetails(record.nerisId);
        record.units = details.units.slice(0, 200);
        record.unitsTruncated = details.units.length > 200;
        record.jurisdictions = details.jurisdictions.slice(0, 50);
        record.jurisdictionsTruncated = details.jurisdictions.length > 50;
      } catch {
        nerisDetailsUnavailable = true;
      }
    }),
  );

  const usfaStateRecordCount =
    usfaDepartments?.data.filter(
      (record) => record.stateCode === stateCode,
    ).length ?? 0;
  const nerisStateRecordCount =
    nerisDepartments?.data.length ?? 0;

  const sourceStatuses = [
    sourceStatus(
      "USFA NFDR",
      USFA_DOWNLOAD_PAGE,
      usfaStatus,
      usfaDepartments?.fetchedAt ?? null,
      usfaStateRecordCount,
      usfaError,
    ),
    sourceStatus(
      "NERIS",
      NERIS_PUBLIC_PAGE,
      nerisDepartments ? "available" : "unavailable",
      nerisDepartments?.fetchedAt ?? null,
      nerisStateRecordCount,
      nerisError ??
        (nerisDetailsUnavailable
          ? "Matching department records loaded, but some unit or jurisdiction details could not be loaded."
          : null),
    ),
  ];

  return {
    fetchedAt: new Date(),
    sourceStatuses,
    records: topRecords.map(({ record }) => record),
  };
}

/** Source-native state roster. No county or operating-status inference. */
export async function listNerisDepartments(stateCode: string) {
  if (!/^[A-Z]{2}$/.test(stateCode)) throw new Error("Invalid state code.");
  const {data,fetchedAt}=await getNerisDepartments(stateCode);
  const seen=new Set<string>();
  const departments=data.filter(row=>{
    if(seen.has(row.nerisId))return false;
    seen.add(row.nerisId);return true;
  });
  return {source:"NERIS",stateCode,fetchedAt,warning:getSourceFailure(`neris:departments:${stateCode}`),departments};
}

/** Public facilities are a separate record grain, never a saved agency or HQ replacement. */
export type FacilityParent = {source:"USFA NFDR"|"NERIS"; stateCode:string; identifier:string};
export type PublicFacility = {source:"USFA NFDR"|"NERIS"; sourceRecordId:string|null; name:string|null; address:string|null; city:string|null; stateCode:string; postalCode:string|null; coordinates:{latitude:number;longitude:number}|null; sourceUrl:string; exportDate:string|null; endUserValidationRequired:true};
const US_STATES=new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
export function validFacilityParent(p:FacilityParent):boolean {
  return US_STATES.has(p.stateCode) && (p.source==="USFA NFDR" ? /^[-A-Z0-9.]{1,80}$/.test(p.identifier)&&!/^LOCATION-|^[A-Z]{2}-(?:FD|EMS)-\d{5}/.test(p.identifier) : p.source==="NERIS" && /^[-A-Z0-9]{1,14}$/.test(p.identifier));
}
function sourceText(v:unknown,max=255):string|null {
  return typeof v==="string"&&v.trim()&&v.trim().length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():null;
}
export function parseNerisFacility(feature:unknown,parent:FacilityParent):PublicFacility|null {
  if(!feature||typeof feature!=="object")return null;
  const f=feature as {attributes?:Record<string,unknown>;geometry?:{x?:unknown;y?:unknown}};
  const a=f.attributes??{};
  if(a.department_neris_id!==parent.identifier)return null;
  const id=sourceText(a.neris_id,14),state=sourceText(a.state,2);
  if(!id||!/^[-A-Z0-9]{1,14}$/.test(id)||!state||!US_STATES.has(state))return null;
  const x=f.geometry?.x,y=f.geometry?.y;
  const coordinates=typeof x==="number"&&typeof y==="number"&&Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=180&&Math.abs(y)<=90&&(x!==0||y!==0)?{latitude:y,longitude:x}:null;
  return {source:"NERIS",sourceRecordId:id,name:sourceText(a.station_name),address:buildAddress([sourceText(a.address_line_1),sourceText(a.address_line_2)]),city:sourceText(a.city),stateCode:state,postalCode:sourceText(a.zip_code,10),coordinates,sourceUrl:stationRecordUrl(1,"neris_id",id),exportDate:toIsoDate(a.export_date)?.toISOString()??null,endUserValidationRequired:true};
}
async function exactNerisFacilities(parent:FacilityParent) {
  // Validate parent identity against the public department roster before requesting children.
  const departments=await getNerisDepartments(parent.stateCode);
  if(departments.data.filter(d=>d.nerisId===parent.identifier).length!==1)throw Error("Department identity unavailable or ambiguous.");
  const url=new URL(nerisLayerUrl(1)+"/query");
  url.searchParams.set("where","department_neris_id='"+parent.identifier+"'");
  url.searchParams.set("outFields","OBJECTID,neris_id,station_name,address_line_1,address_line_2,city,state,zip_code,department_neris_id,export_date");
  url.searchParams.set("returnGeometry","true");url.searchParams.set("outSR","4326");url.searchParams.set("orderByFields","OBJECTID ASC");url.searchParams.set("resultRecordCount","1000");url.searchParams.set("f","json");
  const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error("Station source unavailable.");
  const payload=await response.json() as {error?:unknown;features?:unknown[];exceededTransferLimit?:boolean;spatialReference?:{wkid?:number;latestWkid?:number}};
  if(payload.error||!Array.isArray(payload.features)||payload.exceededTransferLimit||payload.features.length>=1000)throw Error("Incomplete station response.");
  const wgs84=payload.spatialReference?.wkid===4326||payload.spatialReference?.latestWkid===4326;
  const rows=payload.features.map(feature=>parseNerisFacility(feature,parent));
  const counts=new Map<string,number>();for(const row of rows)if(row?.sourceRecordId)counts.set(row.sourceRecordId,(counts.get(row.sourceRecordId)??0)+1);
  const facilities=rows.flatMap(row=>row&&counts.get(row.sourceRecordId!)===1?[{...row,coordinates:wgs84?row.coordinates:null}]:[]);
  return {facilities,withheld:rows.length-facilities.length,reportedStationCount:departments.data.find(d=>d.nerisId===parent.identifier)?.stationCount??null};
}
export async function listDepartmentFacilities(parent:FacilityParent) {
  if(!validFacilityParent(parent))throw Error("Invalid department identity.");
  if(parent.source==="NERIS"){
    // Avoid unbounded cache keys for public arbitrary identifiers.
    const data=await exactNerisFacilities(parent);
    return {parent,...data,retrievedAt:new Date().toISOString(),warning:getSourceFailure(`neris:departments:${parent.stateCode}`)};
  }
  const [departments,stations]=await Promise.all([getUsfaDepartments(),getUsfaStations()]);
  const matches=departments.data.filter(d=>d.stateCode===parent.stateCode&&d.fdid.toUpperCase()===parent.identifier);
  if(matches.length!==1)throw Error("Department identity unavailable or ambiguous.");
  const rows=stations.data.filter(s=>s.stateCode===parent.stateCode&&s.fdid.toUpperCase()===parent.identifier);
  const seen=new Set<string>();const facilities:PublicFacility[]=[];
  for(const s of rows){
    if(!US_STATES.has(s.stationState))continue;
    const key=JSON.stringify([s.name,s.address,s.city,s.stationState,s.postalCode]);
    if(seen.has(key))continue;seen.add(key);
    facilities.push({source:"USFA NFDR",sourceRecordId:null,name:s.name==="Station record"?null:s.name,address:s.address,city:s.city,stateCode:s.stationState,postalCode:s.postalCode,coordinates:null,sourceUrl:USFA_DOWNLOAD_PAGE,exportDate:null,endUserValidationRequired:true});
  }
  return {parent,facilities:facilities.slice(0,1000),withheld:rows.length-Math.min(facilities.length,1000),reportedStationCount:matches[0].stationCount,retrievedAt:stations.fetchedAt,warning:getSourceFailure("usfa:stations")??getSourceFailure("usfa:departments")};
}
