import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const FLORIDA_EMS_SOURCE = {
  name: "Florida Department of Health — EMS Data Unit Weekly Providers Report",
  url: "https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf",
  completenessNote:
    "Florida DOH license roster. The report date is shown separately; a listing does not verify current response activity or operational capacity.",
};

export const FLORIDA_FIRE_SOURCE = {
  name: "U.S. Fire Administration National Fire Department Registry",
  url: "https://apps.usfa.fema.gov/registry/api/download/state/72",
  completenessNote:
    "Voluntary registry, not a complete census. The state download does not provide a per-department update date or independently verify current staffing.",
};

const USFA_CSV_URL = FLORIDA_FIRE_SOURCE.url;
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

type NullableString = string | null;

export interface FloridaEmsLicenseRecord {
  licenseNumber: string;
  providerName: string;
  city: NullableString;
  addressState: NullableString;
  county: NullableString;
  licenseType: string;
  licenseIssuedDate: NullableString;
  licenseExpirationDate: NullableString;
}

export interface FloridaFireRegistryRecord {
  fdid: NullableString;
  departmentName: string;
  city: NullableString;
  county: NullableString;
  departmentType: NullableString;
  organizationType: NullableString;
}

interface SourceMetadata {
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: NullableString;
  retrievedAt: NullableString;
  recordCount: number;
  completenessNote: string;
  errorMessage: NullableString;
}

export interface FloridaOfficialAgenciesResponse {
  ems: {
    metadata: SourceMetadata;
    records: FloridaEmsLicenseRecord[];
  };
  fire: {
    metadata: SourceMetadata;
    records: FloridaFireRegistryRecord[];
  };
}

interface PositionedText {
  str: string;
  x: number;
  y: number;
}

interface TextLine {
  y: number;
  items: PositionedText[];
}

function getColumn(x: number): string {
  if (x < 115) return "name";
  if (x < 212) return "address";
  if (x < 282) return "city";
  if (x < 293) return "state";
  if (x < 344) return "zip";
  if (x < 380) return "county";
  if (x < 428) return "license";
  if (x < 471) return "issued";
  if (x < 521) return "expires";
  if (x < 563) return "type";
  return "other";
}

function makeLines(items: PositionedText[]): TextLine[] {
  const lines = new Map<number, PositionedText[]>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.y * 10) / 10;
    const lineItems = lines.get(y) ?? [];
    lineItems.push(item);
    lines.set(y, lineItems);
  }
  return [...lines.entries()]
    .map(([y, lineItems]) => ({
      y,
      items: lineItems.sort((a, b) => a.x - b.x),
    }))
    .sort((a, b) => b.y - a.y);
}

function textInColumn(line: TextLine, column: string): string {
  return line.items
    .filter((item) => getColumn(item.x) === column)
    .map((item) => item.str.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function normalizedDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseProcessedDate(lines: TextLine[]): string | null {
  const processedIndex = lines.findIndex((line) =>
    line.items.some((item) => /processed:/i.test(item.str)),
  );
  if (processedIndex < 0) return null;

  const processedLine = lines[processedIndex];
  const textOnLine = processedLine.items.map((item) => item.str).join(" ");
  const dateMatch = textOnLine.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (!dateMatch) return null;

  let rawDate = dateMatch[1];
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(rawDate)) {
    const followingLine = lines
      .slice(processedIndex + 1)
      .find(
        (line) =>
          processedLine.y - line.y <= 15 &&
          processedLine.y > line.y &&
          line.items.some((item) => item.x >= 60 && item.x < 110 && /^\d{2}$/.test(item.str.trim())),
      );
    const yearSuffix = followingLine?.items
      .find((item) => item.x >= 60 && item.x < 110 && /^\d{2}$/.test(item.str.trim()))
      ?.str.trim();
    if (!yearSuffix) return null;
    rawDate = `${rawDate}${yearSuffix}`;
  }

  const [month, day, year] = rawDate.split("/").map(Number);
  if (!month || !day || !year) return null;
  const fullYear = year < 100 ? 2000 + year : year;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseEmsPage(lines: TextLine[]): FloridaEmsLicenseRecord[] {
  const namesByLicense = new Map<string, string>();
  let nameParts: string[] = [];

  for (const line of lines) {
    const nameText = textInColumn(line, "name");
    if (!nameText) continue;
    if (/^provider$/i.test(nameText)) {
      nameParts = [];
      continue;
    }
    nameParts.push(nameText);
    const joinedName = nameParts.join(" ").replace(/\s+/g, " ").trim();
    const licenseMatch = joinedName.match(/\bLic\s*#\s*(\d{1,6})\b/i);
    if (!licenseMatch) continue;

    const licenseNumber = licenseMatch[1];
    const providerName = joinedName
      .replace(new RegExp(`\\s*-?\\s*Lic\\s*#\\s*${licenseNumber}\\s*$`, "i"), "")
      .trim();
    if (providerName) namesByLicense.set(licenseNumber, providerName);
    nameParts = [];
  }

  const records: FloridaEmsLicenseRecord[] = [];
  for (const line of lines) {
    const licenseNumber = textInColumn(line, "license");
    const issued = textInColumn(line, "issued");
    const expires = textInColumn(line, "expires");
    if (!/^\d{1,6}$/.test(licenseNumber) || !normalizedDate(issued) || !normalizedDate(expires)) {
      continue;
    }

    const providerName = namesByLicense.get(licenseNumber);
    if (!providerName) {
      throw new Error(`Florida DOH roster row ${licenseNumber} has no matching provider name`);
    }
    records.push({
      licenseNumber,
      providerName,
      city: textInColumn(line, "city") || null,
      addressState: textInColumn(line, "state") || null,
      county: textInColumn(line, "county") || null,
      licenseType: textInColumn(line, "type"),
      licenseIssuedDate: normalizedDate(issued),
      licenseExpirationDate: normalizedDate(expires),
    });
  }
  return records;
}

export async function parseFloridaEmsPdf(
  pdfData: Uint8Array,
): Promise<{ records: FloridaEmsLicenseRecord[]; sourceUpdatedAt: string | null }> {
  const loadingTask = getDocument({
    data: pdfData,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  try {
    const records: FloridaEmsLicenseRecord[] = [];
    let sourceUpdatedAt: string | null = null;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const positioned = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        return [
          {
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
          },
        ];
      });
      const lines = makeLines(positioned);
      if (pageNumber === 1) sourceUpdatedAt = parseProcessedDate(lines);
      records.push(...parseEmsPage(lines));
      page.cleanup();
    }

    if (!records.length) {
      throw new Error("Florida DOH PDF contained no parseable license rows");
    }
    const licenseNumbers = new Set(records.map((record) => record.licenseNumber));
    if (licenseNumbers.size !== records.length) {
      throw new Error("Florida DOH PDF contains duplicate license numbers");
    }
    return { records, sourceUpdatedAt };
  } finally {
    await loadingTask.destroy();
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("USFA CSV contains an unterminated quoted field");
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

export function parseUsfaFireCsv(text: string): FloridaFireRegistryRecord[] {
  const [rawHeaders, ...rows] = parseCsv(text);
  if (!rawHeaders?.length) throw new Error("USFA returned an empty CSV file");
  const headers = rawHeaders.map((header) => header.trim());
  const columnIndex = new Map(headers.map((header, index) => [header, index]));
  const get = (row: string[], header: string): string | null => {
    const index = columnIndex.get(header);
    return index === undefined ? null : row[index]?.trim() || null;
  };

  if (!columnIndex.has("FDID") || !columnIndex.has("Fire dept name")) {
    throw new Error("USFA CSV is missing required fire department identity columns");
  }

  const records = rows
    .map((row) => ({
      fdid: get(row, "FDID"),
      departmentName: get(row, "Fire dept name"),
      city: get(row, "HQ city"),
      county: get(row, "County"),
      departmentType: get(row, "Dept Type"),
      organizationType: get(row, "Organization Type"),
      state: get(row, "HQ state"),
    }))
    .filter(
      (row): row is typeof row & { departmentName: string } =>
        Boolean(row.departmentName && row.state === "FL"),
    )
    .map(({ state: _state, ...record }) => record);

  if (!records.length) throw new Error("USFA CSV contained no Florida fire department rows");
  return records;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "user-agent": "EMS-Territory-Intelligence/1.0 (public-source reader)" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function metadata(
  sourceName: string,
  sourceUrl: string,
  completenessNote: string,
  sourceUpdatedAt: string | null,
  retrievedAt: string | null,
  recordCount: number,
  errorMessage: string | null,
): SourceMetadata {
  return {
    sourceName,
    sourceUrl,
    sourceUpdatedAt,
    retrievedAt,
    recordCount,
    completenessNote,
    errorMessage,
  };
}

async function loadEmsSource(): Promise<FloridaOfficialAgenciesResponse["ems"]> {
  try {
    const response = await fetchWithTimeout(FLORIDA_EMS_SOURCE.url);
    if (!response.ok) throw new Error(`Florida DOH returned HTTP ${response.status}`);
    const { records, sourceUpdatedAt } = await parseFloridaEmsPdf(
      new Uint8Array(await response.arrayBuffer()),
    );
    return {
      metadata: metadata(
        FLORIDA_EMS_SOURCE.name,
        FLORIDA_EMS_SOURCE.url,
        FLORIDA_EMS_SOURCE.completenessNote,
        sourceUpdatedAt,
        new Date().toISOString(),
        records.length,
        null,
      ),
      records,
    };
  } catch (error) {
    return {
      metadata: metadata(
        FLORIDA_EMS_SOURCE.name,
        FLORIDA_EMS_SOURCE.url,
        FLORIDA_EMS_SOURCE.completenessNote,
        null,
        null,
        0,
        error instanceof Error ? error.message : "Florida DOH source could not be read.",
      ),
      records: [],
    };
  }
}

async function loadFireSource(): Promise<FloridaOfficialAgenciesResponse["fire"]> {
  try {
    const response = await fetchWithTimeout(USFA_CSV_URL);
    if (!response.ok) throw new Error(`USFA returned HTTP ${response.status}`);
    const records = parseUsfaFireCsv(await response.text());
    return {
      metadata: metadata(
        FLORIDA_FIRE_SOURCE.name,
        FLORIDA_FIRE_SOURCE.url,
        FLORIDA_FIRE_SOURCE.completenessNote,
        null,
        new Date().toISOString(),
        records.length,
        null,
      ),
      records,
    };
  } catch (error) {
    return {
      metadata: metadata(
        FLORIDA_FIRE_SOURCE.name,
        FLORIDA_FIRE_SOURCE.url,
        FLORIDA_FIRE_SOURCE.completenessNote,
        null,
        null,
        0,
        error instanceof Error ? error.message : "USFA source could not be read.",
      ),
      records: [],
    };
  }
}

let cache:
  | { expiresAt: number; value: FloridaOfficialAgenciesResponse }
  | undefined;
let inFlight: Promise<FloridaOfficialAgenciesResponse> | undefined;

export async function getFloridaOfficialAgencies(
  forceRefresh = false,
): Promise<FloridaOfficialAgenciesResponse> {
  if (!forceRefresh && cache && Date.now() < cache.expiresAt) return cache.value;
  if (!forceRefresh && inFlight) return inFlight;

  inFlight = Promise.all([loadEmsSource(), loadFireSource()]).then(([ems, fire]) => ({
    ems,
    fire,
  }));
  try {
    const result = await inFlight;
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, value: result };
    return result;
  } finally {
    inFlight = undefined;
  }
}
