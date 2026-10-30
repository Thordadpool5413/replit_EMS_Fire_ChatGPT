import React, { useMemo, useState } from "react";
import {
  useGetAfgGrants,
  useSearchNppesProviders,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  ImportedAfgAward,
  ImportedNppesProvider,
  isExactFemaRecipientMatch,
  loadProviderSourceImports,
  saveProviderSourceImport,
  SourceEvidence,
} from "../data/officialSourceImports";

interface NppesSearchResult {
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
  nppesLastUpdated?: string;
  registryUrl: string;
}

interface ProviderSourceImportPanelProps {
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}

function readText(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readFiniteNumber(
  row: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function toIsoTimestamp(value: unknown): string | undefined {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : undefined;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Timestamp unavailable";
}

export const ProviderSourceImportPanel: React.FC<
  ProviderSourceImportPanelProps
> = ({ showToast }) => {
  const [npiNumber, setNpiNumber] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [results, setResults] = useState<NppesSearchResult[]>([]);
  const [selected, setSelected] = useState<NppesSearchResult | null>(null);
  const [nppesEvidence, setNppesEvidence] = useState<SourceEvidence | null>(
    null,
  );
  const [confirmedRelationship, setConfirmedRelationship] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedImports, setSavedImports] = useState<ImportedNppesProvider[]>(
    loadProviderSourceImports,
  );
  const searchMutation = useSearchNppesProviders();

  const grantQuery = useGetAfgGrants(
    {
      stateCode: selected?.stateCode,
      recipientName: selected?.organizationName,
      limit: 100,
    },
    {
      query: {
        queryKey: [
          "/api/fema/afg-grants",
          selected?.stateCode,
          selected?.organizationName,
        ],
        enabled: Boolean(selected),
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  );

  const matchingAwards = useMemo<ImportedAfgAward[]>(() => {
    if (!selected || !nppesEvidence) return [];
    const payload = grantQuery.data as unknown as
      | {
          awards?: unknown[];
          sourceUrl?: unknown;
          fetchedAt?: unknown;
        }
      | undefined;
    if (!Array.isArray(payload?.awards)) return [];

    const sourceUrl =
      typeof payload.sourceUrl === "string" &&
      /^https?:\/\//i.test(payload.sourceUrl)
        ? payload.sourceUrl
        : "";
    const retrievedAt = toIsoTimestamp(payload.fetchedAt);
    if (!sourceUrl || !retrievedAt) return [];

    return payload.awards.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const grantee = readText(row, "grantee", "vendorName");
      const awardState = readText(row, "stateCode", "vendorState")?.toUpperCase();
      if (
        !grantee ||
        !isExactFemaRecipientMatch(selected.organizationName, grantee) ||
        awardState !== selected.stateCode.toUpperCase()
      ) {
        return [];
      }

      const award: ImportedAfgAward = {
        grantee,
        evidence: { sourceUrl, retrievedAt },
      };
      const awardNumber = readText(row, "awardNumber", "award");
      const programName = readText(row, "programName");
      const awardAmount = readFiniteNumber(row, "awardAmount");
      const fiscalYear = readFiniteNumber(row, "fiscalYear");
      if (awardNumber) award.awardNumber = awardNumber;
      if (programName) award.programName = programName;
      if (awardAmount !== undefined) award.awardAmount = awardAmount;
      if (fiscalYear !== undefined) award.fiscalYear = fiscalYear;
      if (awardState) award.stateCode = awardState;
      return [award];
    });
  }, [grantQuery.data, nppesEvidence, selected]);

  const importedNpis = useMemo(
    () => new Set(savedImports.map((record) => record.npiNumber)),
    [savedImports],
  );

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setResults([]);
    setSelected(null);
    setNppesEvidence(null);
    setConfirmedRelationship(false);

    const normalizedNpi = npiNumber.replace(/\s/g, "");
    const normalizedState = stateCode.trim().toUpperCase();
    if (normalizedNpi) {
      if (!/^\d{10}$/.test(normalizedNpi)) {
        setErrorMessage("Enter all 10 digits of the NPI.");
        return;
      }
    } else if (!agencyName.trim() || !city.trim() || !/^[A-Za-z]{2}$/.test(normalizedState)) {
      setErrorMessage(
        "Enter an NPI, or provide the organization name, city, and two-letter state.",
      );
      return;
    }

    try {
      const response = await searchMutation.mutateAsync({
        data: normalizedNpi
          ? { npiNumber: normalizedNpi, limit: 20 }
          : {
              agencyName: agencyName.trim(),
              city: city.trim(),
              stateCode: normalizedState,
              limit: 20,
            },
      });
      setResults(response.results as NppesSearchResult[]);
      setNppesEvidence({
        sourceUrl: response.sourceUrl,
        retrievedAt: toIsoTimestamp(response.retrievedAt) ?? "",
      });
      if (response.results.length === 0) {
        setErrorMessage(
          "CMS NPPES returned no organization records for this search. No profile was created.",
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "CMS NPPES could not be reached. No source record was changed.",
      );
    }
  };

  const handleImport = () => {
    if (!selected || !nppesEvidence?.sourceUrl || !nppesEvidence.retrievedAt) {
      setErrorMessage("Run a successful NPPES lookup and select a result first.");
      return;
    }
    if (!confirmedRelationship) {
      setErrorMessage(
        "Confirm that you independently matched this registry organization to the EMS/fire entity.",
      );
      return;
    }

    const record: ImportedNppesProvider = {
      ...selected,
      nppesEvidence: {
        ...nppesEvidence,
        sourceUpdatedAt: selected.nppesLastUpdated || undefined,
      },
      femaAwards: matchingAwards,
      importedAt: new Date().toISOString(),
      relationshipConfirmedByUser: true,
    };

    try {
      const next = saveProviderSourceImport(record);
      setSavedImports(next);
      setErrorMessage("");
      showToast(
        `Saved NPPES identity${matchingAwards.length ? ` and ${matchingAwards.length} exact-name FEMA award${matchingAwards.length === 1 ? "" : "s"}` : ""} in this browser.`,
        "success",
      );
    } catch {
      setErrorMessage(
        "The source record could not be saved in this browser. Check available storage and try again.",
      );
    }
  };

  return (
    <section className="space-y-5" aria-labelledby="nppes-import-title">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 id="nppes-import-title" className="font-semibold">
              NPI lookup and official-source imports
            </h3>
            <p className="mt-1 leading-relaxed">
              CMS NPPES verifies registry identity, not that an organization
              operates an EMS or fire service. FEMA awards are imported only
              for exact legal-name and state matches. These source records stay
              in this browser and are not added to the operational directory
              until the required operational fields are individually sourced.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
        <form
          onSubmit={handleSearch}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-4">
            <h4 className="font-semibold text-slate-900 dark:text-white">
              Search CMS NPPES
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Search by NPI, or by organization name, city, and state.
            </p>
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              NPI
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={10}
                value={npiNumber}
                onChange={(event) => setNpiNumber(event.target.value.replace(/\D/g, ""))}
                placeholder="10-digit organization NPI"
                className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <div className="flex items-center gap-3 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              or search by name
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Organization legal name
              <input
                value={agencyName}
                onChange={(event) => setAgencyName(event.target.value)}
                maxLength={180}
                placeholder="Name as listed in CMS NPPES"
                className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                City
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  maxLength={100}
                  placeholder="City"
                  className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                State
                <input
                  value={stateCode}
                  onChange={(event) => setStateCode(event.target.value.slice(0, 2).toUpperCase())}
                  maxLength={2}
                  placeholder="TX"
                  className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm uppercase text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={searchMutation.isPending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searchMutation.isPending ? "Searching NPPES…" : "Search official registry"}
            </button>
          </div>
          {errorMessage && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            </div>
          )}
        </form>

        <div className="space-y-4">
          {results.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-900 dark:text-white">
                  NPPES organization results
                </h4>
                <span className="text-[11px] text-slate-500">
                  {results.length} returned · not yet imported
                </span>
              </div>
              <div className="space-y-2">
                {results.map((result) => {
                  const isSelected = selected?.npiNumber === result.npiNumber;
                  return (
                    <button
                      type="button"
                      key={result.npiNumber}
                      onClick={() => {
                        setSelected(result);
                        setConfirmedRelationship(false);
                        setErrorMessage("");
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40"
                          : "border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {result.organizationName}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                        )}
                      </div>
                      <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
                        NPI {result.npiNumber} · {result.city}, {result.stateCode}
                        {result.postalCode ? ` ${result.postalCode}` : ""}
                      </span>
                      {result.taxonomyDescription && (
                        <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                          Taxonomy listed by NPPES: {result.taxonomyDescription}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {nppesEvidence && (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  NPPES response retrieved {formatTimestamp(nppesEvidence.retrievedAt)}
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              Search CMS NPPES to review an organization record before importing
              it.
            </div>
          )}

          {selected && nppesEvidence && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    CMS NPPES record found
                  </span>
                  <h4 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                    {selected.organizationName}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    NPI {selected.npiNumber} · {selected.city}, {selected.stateCode}
                    {selected.postalCode ? ` ${selected.postalCode}` : ""}
                  </p>
                </div>
                <a
                  href={selected.registryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline dark:text-blue-300"
                >
                  Open NPPES record <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Registry address</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-white">
                    {selected.address || "Not returned"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Taxonomy listed by NPPES</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-white">
                    {selected.taxonomyDescription || "Not returned"}
                    {selected.taxonomyCode ? ` · ${selected.taxonomyCode}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Authorized official listed by NPPES</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-white">
                    {selected.authorizedOfficialName || "Not returned"}
                    {selected.authorizedOfficialTitle
                      ? ` · ${selected.authorizedOfficialTitle}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Source-record update date</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-white">
                    {selected.nppesLastUpdated || "Not supplied by NPPES"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                Lookup retrieved {formatTimestamp(nppesEvidence.retrievedAt)}.
                This retrieval time is separate from the NPPES record-update date.
              </p>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      FEMA AFG grant records
                    </h5>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Exact recipient-name and state match only
                    </p>
                  </div>
                  {grantQuery.isFetching && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking OpenFEMA
                    </span>
                  )}
                </div>
                {grantQuery.isError && (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                    OpenFEMA could not be reached. The NPPES identity can still
                    be imported; no grant status will be inferred.
                  </p>
                )}
                {!grantQuery.isFetching &&
                  !grantQuery.isError &&
                  matchingAwards.length === 0 && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      No exact-name awards were returned. This does not establish
                      that the organization has never received a grant.
                    </p>
                  )}
                {matchingAwards.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {matchingAwards.map((award, index) => (
                      <div
                        key={`${award.awardNumber || award.fiscalYear || "award"}-${index}`}
                        className="rounded-md border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="font-medium text-slate-900 dark:text-white">
                          {award.programName || "FEMA AFG award"}
                        </div>
                        <div className="mt-1 text-slate-600 dark:text-slate-300">
                          {award.awardNumber ? `Award ${award.awardNumber}` : "Award number not supplied"}
                          {award.fiscalYear !== undefined ? ` · FY ${award.fiscalYear}` : ""}
                          {award.awardAmount !== undefined
                            ? ` · $${award.awardAmount.toLocaleString()}`
                            : ""}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500">
                          OpenFEMA exact grantee result · retrieved{" "}
                          {formatTimestamp(award.evidence.retrievedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={confirmedRelationship}
                  onChange={(event) =>
                    setConfirmedRelationship(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-blue-700"
                />
                <span>
                  I independently confirmed that this CMS organization is the
                  EMS/fire entity I intend to track. NPPES itself does not verify
                  that operating relationship.
                </span>
              </label>
              <button
                type="button"
                onClick={handleImport}
                disabled={
                  !confirmedRelationship ||
                  grantQuery.isFetching ||
                  !nppesEvidence.sourceUrl
                }
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Database className="h-4 w-4" />
                {importedNpis.has(selected.npiNumber)
                  ? "Update imported source record"
                  : "Import this NPPES record"}
                {matchingAwards.length > 0
                  ? ` + ${matchingAwards.length} FEMA award${matchingAwards.length === 1 ? "" : "s"}`
                  : ""}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white">
              Imported source records
            </h4>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Saved in this browser only; not synced to cloud or added to the
              verified operational directory.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {savedImports.length}
          </span>
        </div>
        {savedImports.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No NPPES records have been imported in this browser.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {savedImports.map((record) => (
              <article
                key={record.npiNumber}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="font-semibold text-slate-900 dark:text-white">
                      {record.organizationName}
                    </h5>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      NPPES identity imported
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    NPI {record.npiNumber} · {record.city}, {record.stateCode} ·{" "}
                    {record.femaAwards.length} exact-name FEMA award
                    {record.femaAwards.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    NPPES retrieved {formatTimestamp(record.nppesEvidence.retrievedAt)}
                    {record.nppesEvidence.sourceUpdatedAt
                      ? ` · NPPES record update ${record.nppesEvidence.sourceUpdatedAt}`
                      : " · NPPES update date not supplied"}
                  </p>
                </div>
                <a
                  href={record.registryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 underline dark:text-blue-300"
                >
                  View official record <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
