import { collectNppesPages } from '../lib/nppesPagination';
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetEmsRegistryMatchesQueryParams,
  GetEmsRegistryMatchesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/";
const NPPES_HELP_URL = "https://npiregistry.cms.hhs.gov/api-page";
const NPPES_RECORD_URL = "https://npiregistry.cms.hhs.gov/provider-view/";
const NPPES_RESULT_LIMIT = 50;

type NppesAddress = {
  address_purpose?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
};

type NppesTaxonomy = {
  code?: string;
  desc?: string;
  primary?: boolean;
  state?: string;
};

type NppesOrganization = {
  number?: string;
  enumeration_type?: string;
  basic?: {
    organization_name?: string;
    last_updated?: string;
  };
  addresses?: NppesAddress[];
  taxonomies?: NppesTaxonomy[];
};

type NppesSearchPayload = {
  Errors?: unknown;
  errors?: unknown;
  result_count?: number;
  results?: NppesOrganization[];
};

type SearchResult = {
  records: NppesOrganization[];
  totalResults: number;
  resultsTruncated: boolean;
  warning: string | null;
};

function optionalText(value: string | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function nppesSearchUrl(input: {
  agencyName: string;
  city?: string;
  stateCode: string;
}): URL {
  const url = new URL(NPPES_API_URL);
  url.searchParams.set("version", "2.1");
  url.searchParams.set("enumeration_type", "NPI-2");
  url.searchParams.set("organization_name", input.agencyName);
  url.searchParams.set("state", input.stateCode);
  url.searchParams.set("limit", String(NPPES_RESULT_LIMIT));
  if (input.city) url.searchParams.set("city", input.city);
  return url;
}

async function searchNppes(input: {
  agencyName: string;
  city?: string;
  stateCode: string;
}): Promise<SearchResult> {
  return collectNppesPages<NppesOrganization>(async(skip,limit)=>{
    const url=nppesSearchUrl(input);url.searchParams.set('skip',String(skip));url.searchParams.set('limit',String(limit));
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`CMS NPPES returned HTTP ${response.status}.`);
    return await response.json() as NppesSearchPayload;
  });
}

function mapNppesRecord(record: NppesOrganization) {
  const npi = record.number ?? "";
  const updatedAt = optionalText(record.basic?.last_updated);
  return {
    npi,
    organizationName:
      optionalText(record.basic?.organization_name) ?? "Unnamed organization",
    enumerationType: record.enumeration_type ?? "NPI-2",
    updatedAt:
      updatedAt && /^\d{4}-\d{2}-\d{2}$/.test(updatedAt) ? updatedAt : null,
    registryUrl: `${NPPES_RECORD_URL}${encodeURIComponent(npi)}`,
    addresses: (record.addresses ?? []).slice(0, 3).map((address) => ({
      purpose: optionalText(address.address_purpose),
      line1: optionalText(address.address_1),
      line2: optionalText(address.address_2),
      city: optionalText(address.city),
      stateCode: optionalText(address.state)?.toUpperCase() ?? null,
      postalCode: optionalText(address.postal_code),
    })),
    taxonomies: (record.taxonomies ?? []).slice(0, 15).map((taxonomy) => ({
      code: optionalText(taxonomy.code),
      description: optionalText(taxonomy.desc),
      primary: taxonomy.primary === true,
      stateCode: optionalText(taxonomy.state)?.toUpperCase() ?? null,
    })),
  };
}

router.get(
  "/ems-registry/matches",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GetEmsRegistryMatchesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Agency name and a two-letter state code are required.",
      });
      return;
    }

    const agencyName = parsed.data.agencyName.trim();
    const city = parsed.data.city?.trim() || undefined;
    const stateCode = parsed.data.stateCode.toUpperCase();
    if (!/^[A-Z]{2}$/.test(stateCode)) {
      res.status(400).json({ error: "State code must contain two letters." });
      return;
    }

    const fetchedAt = new Date().toISOString();
    try {
      let searchScope: "name_city_state" | "name_state" = city
        ? "name_city_state"
        : "name_state";
      let result = await searchNppes({ agencyName, city, stateCode });

      // NPI mailing/practice locations can differ from an agency's operational
      // address, so broaden by name and state only if the city-scoped search is
      // empty. This still returns candidates, never an automatic agency match.
      if (result.records.length === 0 && !result.resultsTruncated && city) {
        searchScope = "name_state";
        result = await searchNppes({ agencyName, stateCode });
      }

      const response = GetEmsRegistryMatchesResponse.parse({
        status: "available",
        sourceUrl: NPPES_HELP_URL,
        fetchedAt,
        searchScope,
        recordCount: result.records.length,
        totalResults: result.totalResults,
        resultsTruncated: result.resultsTruncated,
        errorMessage: result.warning,
        records: result.records.map(mapNppesRecord),
      });
      res.json(response);
    } catch (error) {
      req.log.warn({ err: error, stateCode }, "CMS NPPES EMS lookup unavailable");
      const response = GetEmsRegistryMatchesResponse.parse({
        status: "unavailable",
        sourceUrl: NPPES_HELP_URL,
        fetchedAt,
        searchScope: city ? "name_city_state" : "name_state",
        recordCount: 0,
        totalResults: 0,
        resultsTruncated: false,
        errorMessage: "CMS NPPES is temporarily unavailable. Try again later.",
        records: [],
      });
      res.json(response);
    }
  },
);

// Same-origin transport for individual NPI lookups; upstream errors are never empty matches.
router.get('/ems-registry/npi/:npi', async (req: Request, res: Response) => {
  const npi = String(req.params.npi);
  if (!/^\d{10}$/.test(npi)) { res.status(400).json({error:'Invalid NPI format.'}); return; }
  try {
    const url = new URL(NPPES_API_URL); url.searchParams.set('version','2.1'); url.searchParams.set('number',npi);
    const upstream = await fetch(url, {headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if (!upstream.ok) throw new Error(`NPPES HTTP ${upstream.status}`);
    const payload = await upstream.json() as NppesSearchPayload;
    if (payload.Errors || payload.errors || (!Array.isArray(payload.results) && payload.result_count !== 0)) throw new Error('Unexpected NPPES payload');
    res.setHeader('Cache-Control','private, max-age=300'); res.json(payload);
  } catch(error) { req.log.warn({err:error},'NPI lookup unavailable'); res.status(502).json({error:'NPPES is unavailable. Retry later.'}); }
});
export default router;
