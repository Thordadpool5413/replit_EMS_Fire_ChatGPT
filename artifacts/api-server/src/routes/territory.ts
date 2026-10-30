import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetAfgGrantsQueryParams,
  SearchGroundedPlacesBody,
  SendTerritoryResearchMessageBody,
  VerifyProviderLiveBody,
} from "@workspace/api-zod";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const FEMA_URL =
  "https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants";
const NPPES_URL = "https://npiregistry.cms.hhs.gov/api/";

type RegistryRecord = {
  number?: string;
  basic?: {
    organization_name?: string;
    authorized_official_first_name?: string;
    authorized_official_last_name?: string;
    authorized_official_title_or_position?: string;
    last_updated?: string;
  };
  addresses?: Array<{
    address_purpose?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  }>;
  taxonomies?: Array<{
    code?: string;
    desc?: string;
    primary?: boolean;
  }>;
};

function normalizeLegalName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasValidNpiCheckDigit(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = `80840${npi.slice(0, 9)}`;
  let sum = 0;
  const parity = digits.length % 2;

  for (let i = 0; i < digits.length; i += 1) {
    let value = Number(digits[i]);
    if (i % 2 === parity) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }

  return (10 - (sum % 10)) % 10 === Number(npi[9]);
}

function safeAddress(record?: RegistryRecord): RegistryRecord["addresses"] extends
  | (infer T)[]
  | undefined
  ? T | undefined
  : never {
  return record?.addresses?.find(
    (address) => address.address_purpose === "LOCATION",
  ) ?? record?.addresses?.[0];
}

async function getNppesCandidates(
  input: ReturnType<typeof VerifyProviderLiveBody.parse>,
): Promise<RegistryRecord[]> {
  const url = new URL(NPPES_URL);
  url.searchParams.set("version", "2.1");
  url.searchParams.set("limit", "50");

  if (input.npiNumber) {
    url.searchParams.set("number", input.npiNumber);
  } else {
    url.searchParams.set("organization_name", input.agencyName);
    if (input.city) url.searchParams.set("city", input.city);
    if (input.stateCode) url.searchParams.set("state", input.stateCode);
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`CMS NPPES returned HTTP ${response.status}`);
  const payload = (await response.json()) as { results?: RegistryRecord[] };
  return Array.isArray(payload.results) ? payload.results : [];
}

function onlySafeAgencyContext(
  context: Record<string, unknown> | undefined,
): string {
  if (!context) return "";
  const values = [
    ["Agency", context.name],
    ["City", context.city],
    ["State", context.stateCode],
    ["Provider category", context.providerCategory ?? context.category],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([label, value]) => `${label}: ${(value as string).slice(0, 160)}`);
  return values.length > 0
    ? `\n\nLimited agency context:\n${values.join("\n")}`
    : "";
}

router.get(
  "/fema/afg-grants",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GetAfgGrantsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid FEMA query parameters." });
      return;
    }

    const stateCode = parsed.data.stateCode?.toUpperCase();
    if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) {
      res.status(400).json({ error: "State code must contain two letters." });
      return;
    }

    const limit = Math.min(parsed.data.limit ?? 30, 100);
    const cleanCity = (parsed.data.city ?? "")
      .replace(/[^a-zA-Z\s]/g, "")
      .trim()
      .slice(0, 80)
      .toUpperCase();
    const makeUrl = (includeCity: boolean) => {
      const filters = ["startswith(programName,'Assistance to Firefighters')"];
      if (stateCode) filters.push(`vendorState eq '${stateCode}'`);
      if (includeCity && cleanCity) {
        filters.push(`contains(vendorName,'${cleanCity}')`);
      }
      const url = new URL(FEMA_URL);
      url.searchParams.set("$top", String(limit));
      url.searchParams.set("$orderby", "fiscalYear desc");
      url.searchParams.set("$filter", filters.join(" and "));
      return url;
    };

    try {
      let response = await fetch(makeUrl(true), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        res.status(502).json({
          error: `OpenFEMA returned HTTP ${response.status}.`,
        });
        return;
      }
      let payload = (await response.json()) as {
        NonDisasterAssistanceFirefighterGrants?: Array<Record<string, unknown>>;
      };
      let sourceRecords = Array.isArray(
        payload.NonDisasterAssistanceFirefighterGrants,
      )
        ? payload.NonDisasterAssistanceFirefighterGrants
        : [];
      if (sourceRecords.length === 0 && cleanCity) {
        response = await fetch(makeUrl(false), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          res.status(502).json({
            error: `OpenFEMA returned HTTP ${response.status}.`,
          });
          return;
        }
        payload = (await response.json()) as {
          NonDisasterAssistanceFirefighterGrants?: Array<
            Record<string, unknown>
          >;
        };
        sourceRecords = Array.isArray(
          payload.NonDisasterAssistanceFirefighterGrants,
        )
          ? payload.NonDisasterAssistanceFirefighterGrants
          : [];
      }

      const awards = sourceRecords.map((record, index) => ({
        id: String(record.id ?? record.awardNumber ?? `fema-record-${index}`),
        awardNumber: record.awardNumber ?? "",
        grantee: record.grantee ?? record.vendorName ?? "",
        city: record.city ?? record.vendorCity ?? "",
        stateCode: record.state ?? record.vendorState ?? "",
        programActivity: record.programActivity ?? record.programName ?? "",
        federalShareAwarded:
          record.awardAmount ?? record.federalShareAwarded ?? null,
        awardDate: record.awardDate ?? null,
        programYear: record.fiscalYear ?? record.programYear ?? null,
        organizationType: record.organizationType ?? "",
        verificationUrl:
          "https://www.fema.gov/openfema-data-page/non-disaster-assistance-firefighter-grants-v1",
      }));

      res.json({
        source: FEMA_URL,
        fetchedAt: new Date().toISOString(),
        count: awards.length,
        awards,
      });
    } catch (error) {
      req.log.error({ err: error }, "OpenFEMA grant lookup failed");
      res.status(502).json({
        error: "OpenFEMA is unavailable. Try again later.",
      });
    }
  },
);

router.post(
  "/providers/verify-live",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = VerifyProviderLiveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A provider name is required." });
      return;
    }

    const input = parsed.data;
    const stateCode = input.stateCode?.toUpperCase();
    if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) {
      res.status(400).json({ error: "State code must contain two letters." });
      return;
    }
    if (input.npiNumber && !hasValidNpiCheckDigit(input.npiNumber)) {
      res.json({
        outcome: "NOT_MATCHED",
        verified: false,
        matchConfidence: 0,
        matchReasons: ["The supplied NPI failed the CMS check-digit validation."],
        verificationSource: "CMS NPPES NPI Registry",
        npiNumber: input.npiNumber,
        details: "No registry request was made for the invalid NPI.",
        allCityNpiProviders: [],
        liveFemaAwards: [],
        authorizedOfficial: null,
        usfaRegistryUrl: "https://apps.usfa.fema.gov/registry/",
      });
      return;
    }

    try {
      const candidates = await getNppesCandidates({
        ...input,
        stateCode,
      });
      const targetName = normalizeLegalName(input.agencyName);
      const targetCity = normalizeLegalName(input.city ?? "");
      const targetState = stateCode ?? "";

      const mappedCandidates = candidates.map((candidate) => {
        const address = safeAddress(candidate);
        return {
          npiNumber: candidate.number ?? "",
          officialName: candidate.basic?.organization_name ?? "",
          city: address?.city ?? "",
          stateCode: address?.state ?? "",
          zipCode: address?.postal_code ?? "",
          taxonomyDescription:
            candidate.taxonomies?.find((taxonomy) => taxonomy.primary)?.desc ??
            candidate.taxonomies?.[0]?.desc ??
            "",
          registryUrl: candidate.number
            ? `https://npiregistry.cms.hhs.gov/provider-view/${encodeURIComponent(candidate.number)}`
            : "",
        };
      });

      const exactMatch = candidates.find((candidate) => {
        const address = safeAddress(candidate);
        const nameMatch =
          normalizeLegalName(candidate.basic?.organization_name ?? "") ===
          targetName;
        const cityMatch =
          !targetCity ||
          normalizeLegalName(address?.city ?? "") === targetCity;
        const stateMatch =
          !targetState ||
          (address?.state ?? "").toUpperCase() === targetState;
        const npiMatch =
          !input.npiNumber || candidate.number === input.npiNumber;
        return nameMatch && cityMatch && stateMatch && npiMatch;
      });

      if (!exactMatch) {
        res.json({
          outcome: "NOT_MATCHED",
          verified: false,
          matchConfidence: 0,
          matchReasons: [
            "No exact legal-organization match was found in CMS NPPES.",
          ],
          verificationSource: "CMS NPPES NPI Registry",
          details:
            "Registry candidates are shown for review only. An NPI does not establish that a department is an operating EMS or fire agency.",
          allCityNpiProviders: mappedCandidates,
          liveFemaAwards: [],
          authorizedOfficial: null,
          usfaRegistryUrl: "https://apps.usfa.fema.gov/registry/",
        });
        return;
      }

      const address = safeAddress(exactMatch);
      const primaryTaxonomy =
        exactMatch.taxonomies?.find((taxonomy) => taxonomy.primary) ??
        exactMatch.taxonomies?.[0];
      const officialName = exactMatch.basic?.organization_name ?? "";
      const officialFirstName =
        exactMatch.basic?.authorized_official_first_name ?? "";
      const officialLastName =
        exactMatch.basic?.authorized_official_last_name ?? "";
      const officialNameFromRegistry = [officialFirstName, officialLastName]
        .filter(Boolean)
        .join(" ");
      const authorizedOfficial = officialNameFromRegistry
        ? {
            name: officialNameFromRegistry,
            title:
              exactMatch.basic?.authorized_official_title_or_position ?? "",
          }
        : null;

      res.json({
        outcome: "MATCHED",
        verified: true,
        matchConfidence: 1,
        matchReasons: [
          "Exact legal-organization name and requested geography matched CMS NPPES.",
        ],
        verificationSource: "CMS NPPES NPI Registry",
        npiNumber: exactMatch.number ?? "",
        address: [address?.address_1, address?.address_2]
          .filter(Boolean)
          .join(", "),
        zipCode: address?.postal_code ?? "",
        taxonomyCode: primaryTaxonomy?.code ?? "",
        taxonomyDescription: primaryTaxonomy?.desc ?? "",
        nppesOfficialName: officialName,
        nppesOfficialTitle:
          exactMatch.basic?.authorized_official_title_or_position ?? "",
        nppesLastUpdated: exactMatch.basic?.last_updated ?? "",
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${input.agencyName} ${input.city ?? ""} ${stateCode ?? ""}`)}`,
        details:
          "CMS NPPES confirms this legal-organization identity only; operational status, installed equipment, procurement authority, contract status, grants, and clinical outcomes are not verified by this match.",
        usfaRegistryUrl: "https://apps.usfa.fema.gov/registry/",
        liveFemaAwards: [],
        authorizedOfficial,
        allCityNpiProviders: mappedCandidates,
      });
    } catch (error) {
      req.log.error({ err: error }, "CMS NPPES provider verification failed");
      res.status(502).json({
        error: "CMS NPPES is unavailable. Existing agency data was not changed.",
      });
    }
  },
);

router.post(
  "/gemini/chat",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SendTerritoryResearchMessageBody.safeParse(req.body);
    if (!parsed.success || parsed.data.messages.length === 0) {
      res.status(400).json({ error: "At least one message is required." });
      return;
    }
    if (
      parsed.data.messages.length > 30 ||
      parsed.data.messages.some((message) => message.content.length > 8000)
    ) {
      res.status(413).json({ error: "The research conversation is too long." });
      return;
    }

    const input = parsed.data;
    const baseInstructions =
      "You are an EMS and fire territory research assistant. Separate sourced facts from estimates. Never invent citations, people, agency records, grants, equipment, outcomes, or contract details. Treat modeled app data as unverified. For clinical questions, provide general information only, name authoritative sources when known, and do not replace medical direction or local protocols.";
    const systemInstruction = [
      baseInstructions,
      input.systemInstruction?.slice(0, 4000) ?? "",
      onlySafeAgencyContext(input.agencyContext),
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: input.messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        config: { systemInstruction, maxOutputTokens: 8192 },
      });
      res.json({ content: response.text ?? "" });
    } catch (error) {
      req.log.error({ err: error }, "Gemini territory research failed");
      res.status(503).json({
        error: "Gemini research is temporarily unavailable. Try again shortly.",
      });
    }
  },
);

router.post(
  "/gemini/maps-grounding",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SearchGroundedPlacesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A place-search question is required." });
      return;
    }

    const input = parsed.data;
    const location = [input.city, input.state].filter(Boolean).join(", ");
    const coordinates =
      typeof input.latitude === "number" &&
      typeof input.longitude === "number"
        ? `Coordinates: ${input.latitude}, ${input.longitude}.`
        : "";
    const prompt = [
      "Find relevant EMS, fire, trauma, hospital, or public-safety facilities for this request.",
      `Question: ${input.query.slice(0, 2000)}`,
      location ? `Requested area: ${location}.` : "",
      coordinates,
      "Only report locations returned by map grounding. Distinguish search results from independently verified agency records.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleMaps: {} }],
          maxOutputTokens: 8192,
        },
      });
      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const mapsLinks = groundingChunks.flatMap((chunk) => {
        const maps = (
          chunk as {
            maps?: { title?: string; uri?: string };
          }
        ).maps;
        return maps?.uri
          ? [{ title: maps.title ?? "Map result", uri: maps.uri }]
          : [];
      });
      res.json({
        text: response.text ?? "No map-grounded results were returned.",
        mapsLinks,
      });
    } catch (error) {
      req.log.error({ err: error }, "Gemini Maps-grounded lookup failed");
      res.status(503).json({
        error:
          "Maps-grounded research is unavailable. No unverified facility results were returned.",
      });
    }
  },
);

export default router;
