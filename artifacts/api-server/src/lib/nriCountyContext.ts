import { GetNriCountyContextResponse } from "@workspace/api-zod";

type NriCountyContextResponse = ReturnType<
  typeof GetNriCountyContextResponse.parse
>;

const NRI_LAYER_URL =
  "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0";
const NRI_SOURCE_URL =
  "https://www.fema.gov/about/reports-and-data/openfema/nri";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_RECORDS = 5000;

type NriFeature = { attributes?: Record<string, unknown> };
type CachedResponse = {
  expiresAt: number;
  response: NriCountyContextResponse;
};

const cache = new Map<string, CachedResponse>();

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

function countyRecordUrl(countyFips: string): string {
  const url = new URL(`${NRI_LAYER_URL}/query`);
  url.searchParams.set("where", `STCOFIPS='${countyFips}'`);
  url.searchParams.set(
    "outFields",
    "STCOFIPS,STATEABBRV,COUNTY,RISK_SCORE,RISK_RATNG,EAL_VALT,NRI_VER",
  );
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");
  return url.toString();
}

export async function getNriCountyContext(
  requestedStateCode?: string,
): Promise<NriCountyContextResponse> {
  const stateCode = requestedStateCode?.trim().toUpperCase() || null;
  const cacheKey = stateCode ?? "all";
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const outFields = [
    "STCOFIPS",
    "STATEABBRV",
    "COUNTY",
    "POPULATION",
    "RISK_SCORE",
    "RISK_RATNG",
    "EAL_VALT",
    "EAL_SCORE",
    "EAL_RATNG",
    "SOVI_SCORE",
    "SOVI_RATNG",
    "RESL_SCORE",
    "RESL_RATNG",
    "NRI_VER",
  ];
  const records: NriCountyContextResponse["records"] = [];
  let offset = 0;

  while (offset <= MAX_RECORDS) {
    const url = new URL(`${NRI_LAYER_URL}/query`);
    url.searchParams.set(
      "where",
      stateCode ? `STATEABBRV='${stateCode}'` : "1=1",
    );
    url.searchParams.set("outFields", outFields.join(","));
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("orderByFields", "STCOFIPS ASC");
    url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("f", "json");

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new Error(`FEMA National Risk Index returned HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as {
      error?: { message?: string };
      features?: NriFeature[];
    };
    if (payload.error) {
      throw new Error(
        payload.error.message || "FEMA National Risk Index returned an error.",
      );
    }
    const page = Array.isArray(payload.features) ? payload.features : [];
    for (const feature of page) {
      const attrs = feature.attributes ?? {};
      const rawFips = textOrNull(attrs.STCOFIPS);
      const rawName = textOrNull(attrs.COUNTY);
      const rawStateCode = textOrNull(attrs.STATEABBRV)?.toUpperCase();
      if (
        !rawFips ||
        !/^\d{1,5}$/.test(rawFips) ||
        !rawName ||
        !rawStateCode ||
        (stateCode && rawStateCode !== stateCode)
      ) {
        continue;
      }
      const countyFips = rawFips.padStart(5, "0");
      records.push({
        countyFips,
        countyName: rawName,
        stateCode: rawStateCode,
        population: numberOrNull(attrs.POPULATION),
        riskScore: numberOrNull(attrs.RISK_SCORE),
        riskRating: textOrNull(attrs.RISK_RATNG),
        expectedAnnualLoss: numberOrNull(attrs.EAL_VALT),
        expectedAnnualLossScore: numberOrNull(attrs.EAL_SCORE),
        expectedAnnualLossRating: textOrNull(attrs.EAL_RATNG),
        socialVulnerabilityScore: numberOrNull(attrs.SOVI_SCORE),
        socialVulnerabilityRating: textOrNull(attrs.SOVI_RATNG),
        communityResilienceScore: numberOrNull(attrs.RESL_SCORE),
        communityResilienceRating: textOrNull(attrs.RESL_RATNG),
        sourceVersion: textOrNull(attrs.NRI_VER) ?? "Version not stated",
        sourceUrl: countyRecordUrl(countyFips),
      });
    }
    if (page.length < PAGE_SIZE) break;
    offset += page.length;
    if (offset >= MAX_RECORDS) {
      throw new Error("FEMA National Risk Index exceeded the safe retrieval limit.");
    }
  }

  const result: NriCountyContextResponse = {
    fetchedAt: new Date(),
    stateCode,
    sourceUrl: NRI_SOURCE_URL,
    sourceVersion:
      records.find((record) => record.sourceVersion !== "Version not stated")
        ?.sourceVersion ?? "Version not stated",
    records: records.sort((a, b) => a.countyFips.localeCompare(b.countyFips)),
  };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, response: result });
  return result;
}
