import { useMemo } from "react";
import {
  getGetEmsRegistryMatchesQueryKey,
  useGetEmsRegistryMatches,
} from "@workspace/api-client-react";
import { ExternalLink, MapPin, RefreshCw } from "lucide-react";
import { getEmsJurisdictionSourceCoverage } from "../data/stateEmsSourceCoverage";
import type { AgencySourceRecordAssociation } from "../types";
import { findAgencySourceRecordAssociation } from "../services/agencySourceRecordStore";

type EmsRegistryLookupProps = {
  agencyName: string;
  city?: string;
  stateCode: string;
  agencyId: string;
  sourceRecordAssociations: AgencySourceRecordAssociation[];
  onDecideSourceRecord: (association: AgencySourceRecordAssociation) => void;
};

const CMS_ENROLLMENT_SOURCE =
  "https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/medicare-fee-for-service-public-provider-enrollment";
const NEMSIS_PUBLIC_SOURCE =
  "https://nemsis.org/view-reports/public-reports/version-3-public-dashboards";

function displayDate(value: Date | string | null | undefined): string {
  if (!value) return "Date not stated";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not stated";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function addressPurpose(purpose: string | null): string {
  if (purpose === "LOCATION") return "Practice location";
  if (purpose === "MAILING") return "Mailing address";
  return purpose || "Address";
}

function formatAddress(parts: Array<string | null>): string {
  return parts.filter(Boolean).join(", ");
}

export function EmsRegistryLookup({
  agencyName,
  city = "",
  stateCode,
  agencyId,
  sourceRecordAssociations,
  onDecideSourceRecord,
}: EmsRegistryLookupProps) {
  const params = useMemo(
    () => ({
      agencyName,
      city: city || undefined,
      stateCode,
    }),
    [agencyName, city, stateCode],
  );
  const hasSearchInputs =
    agencyName.trim().length >= 2 && /^[A-Z]{2}$/i.test(stateCode);
  const query = useGetEmsRegistryMatches(params, {
    query: {
      enabled: hasSearchInputs,
      queryKey: getGetEmsRegistryMatchesQueryKey(params),
      staleTime: 30 * 60 * 1000,
    },
  });
  const data = query.data;
  const records = data?.records ?? [];
  const jurisdictionSource = getEmsJurisdictionSourceCoverage(stateCode);
  const isFloridaLicenseReference =
    jurisdictionSource?.coverageStatus === "official-license-reference";

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      data-testid="panel-ems-registry-matches"
      aria-labelledby="ems-registry-title"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3.5 py-3 dark:border-slate-800">
        <div>
          <h3
            id="ems-registry-title"
            className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200"
          >
            Public EMS source records
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            NPI records are candidates, not proof of an active EMS license,
            current operations, or equipment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={!hasSearchInputs || query.isFetching}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          data-testid="button-refresh-ems-registry"
          aria-label="Refresh public EMS source records"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {jurisdictionSource && (
        <div
          className="border-b border-slate-100 bg-blue-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-blue-950/20"
          data-testid={`source-ems-jurisdiction-${jurisdictionSource.code.toLowerCase()}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                {jurisdictionSource.name}: {jurisdictionSource.sourceName}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                {jurisdictionSource.sourceScope}{" "}
                {jurisdictionSource.appConnection}
              </p>
              {isFloridaLicenseReference && (
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Search using the state license number or provider name. The
                  license record includes its own data-as-of date; it does not
                  establish this agency’s service area or active equipment.
                </p>
              )}
            </div>
            <a
              href={jurisdictionSource.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
              data-testid={`link-ems-jurisdiction-source-${jurisdictionSource.code.toLowerCase()}`}
            >
              {isFloridaLicenseReference ? "Search license" : "Open office map"}{" "}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
            <a
              href={jurisdictionSource.directoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              {isFloridaLicenseReference
                ? "Florida DOH program and roster"
                : "EMS.gov state-system information"}{" "}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-slate-500 dark:text-slate-400">
              {jurisdictionSource.periodAndFreshness}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
            {jurisdictionSource.limitations}
          </p>
        </div>
      )}

      {!hasSearchInputs ? (
        <p
          className="px-3.5 py-3 text-xs text-slate-600 dark:text-slate-300"
          role="status"
          data-testid="status-ems-registry-invalid-input"
        >
          An agency name and two-letter state code are needed for this search.
        </p>
      ) : query.isLoading ? (
        <p
          className="px-3.5 py-3 text-xs text-slate-600 dark:text-slate-300"
          role="status"
          data-testid="status-ems-registry-loading"
        >
          Searching CMS NPI organization records for {stateCode.toUpperCase()}…
        </p>
      ) : query.isError ? (
        <div
          className="space-y-2 px-3.5 py-3"
          role="status"
          data-testid="status-ems-registry-error"
        >
          <p className="text-xs text-rose-700 dark:text-rose-300">
            The NPI Registry could not be reached. The agency record was not
            changed.
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
            data-testid="button-retry-ems-registry"
          >
            Try again
          </button>
        </div>
      ) : data?.status === "unavailable" ? (
        <div
          className="space-y-2 px-3.5 py-3"
          role="status"
          data-testid="status-ems-registry-unavailable"
        >
          <p className="text-xs text-rose-700 dark:text-rose-300">
            {data.errorMessage || "The NPI Registry is temporarily unavailable."}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
            data-testid="button-retry-ems-registry"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className="text-[10px] text-slate-500 dark:text-slate-400"
              data-testid="text-ems-registry-search-scope"
            >
              {data?.searchScope === "name_state"
                ? city
                  ? "Search broadened to agency name + state after no city-scoped results."
                  : "Search used agency name + state."
                : `Search used agency name + ${city}, ${stateCode.toUpperCase()}.`}
            </p>
            {data && (
              <p className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                Retrieved {displayDate(data.fetchedAt)}
              </p>
            )}
          </div>

          {records.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300"
              role="status"
              data-testid="status-ems-registry-no-matches"
            >
              {data?.resultsTruncated ? 'Retrieval was incomplete; no usable organization candidates are available from the retrieved pages.' : 'No NPI organization candidates were returned for this search.'}
              That does not show whether an agency is licensed or operating.
              Check the state roster and source links below.
            </p>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                {records.length} NPI organization{" "}
                {records.length === 1 ? "candidate" : "candidates"}
                {data?.resultsTruncated
                  ? " · incomplete source retrieval"
                  : ""}
              </p>

              {records.map((record, recordIndex) => {
                const savedDecision = findAgencySourceRecordAssociation(
                  sourceRecordAssociations,
                  "CMS NPPES",
                  record.npi,
                );
                const saveDecision = (
                  decision: AgencySourceRecordAssociation["decision"],
                ) => {
                  const retrievedAt = data?.fetchedAt || new Date().toISOString();
                  onDecideSourceRecord({
                    id: `CMS NPPES:${record.npi}`,
                    sourceName: "CMS NPPES",
                    sourceRecordId: record.npi,
                    sourceUrl: record.registryUrl,
                    decision,
                    matchBasis:
                      `Name/state candidate search (${data?.searchScope === "name_state" ? "agency name + state" : "agency name + city + state"}); user ${decision === "confirmed" ? "associated" : "rejected"} it for agency ${agencyId}.`,
                    sourceDate: record.updatedAt,
                    retrievedAt,
                    decidedAt: new Date().toISOString(),
                    sourceFields: {
                      organizationName: record.organizationName,
                      npi: record.npi,
                      enumerationType: record.enumerationType,
                      addresses: record.addresses,
                      taxonomies: record.taxonomies,
                      updatedAt: record.updatedAt,
                    },
                  });
                };
                const ambulanceTaxonomies = record.taxonomies.filter(
                  (taxonomy) =>
                    taxonomy.code?.startsWith("3416") ||
                    taxonomy.description
                      ?.toLowerCase()
                      .includes("ambulance"),
                );

                return (
                  <article
                    key={record.npi}
                    className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
                    data-testid={`card-ems-registry-record-${recordIndex}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="break-words text-sm font-semibold text-slate-900 dark:text-white">
                          {record.organizationName}
                        </h4>
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">NPI {record.npi}</span>
                          <span>·</span>
                          <span>Organization record</span>
                        </p>
                      </div>
                      <a
                        href={record.registryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
                        data-testid={`link-ems-registry-record-${recordIndex}`}
                      >
                        Open NPI record <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {record.addresses.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {record.addresses.map((address, addressIndex) => (
                          <p
                            key={`${address.purpose}-${addressIndex}`}
                            className="flex items-start gap-1.5 text-[10px] text-slate-600 dark:text-slate-300"
                          >
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              <span className="font-medium">
                                {addressPurpose(address.purpose)}:
                              </span>{" "}
                              {formatAddress([
                                address.line1,
                                address.line2,
                                address.city,
                                address.stateCode,
                                address.postalCode,
                              ]) || "Address not listed"}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">
                          NPI record updated
                        </p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {displayDate(record.updatedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">
                          Ambulance taxonomy
                        </p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {ambulanceTaxonomies.length > 0
                            ? "Listed"
                            : "Not listed on this NPI"}
                        </p>
                      </div>
                    </div>

                    {record.taxonomies.length > 0 && (
                      <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                        <p className="mb-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          NPI taxonomy entries
                        </p>
                        <ul className="space-y-1">
                          {record.taxonomies.map((taxonomy, taxonomyIndex) => (
                            <li
                              key={`${taxonomy.code}-${taxonomyIndex}`}
                              className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300"
                            >
                              <span className="font-mono">
                                {taxonomy.code || "Code not stated"}
                              </span>
                              {taxonomy.description
                                ? ` · ${taxonomy.description}`
                                : ""}
                              {taxonomy.primary ? " · Primary" : ""}
                              {taxonomy.stateCode
                                ? ` · ${taxonomy.stateCode}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      <span className="text-[10px] text-slate-600 dark:text-slate-300">
                        {savedDecision?.decision === "confirmed"
                          ? "You associated this NPI record with this agency."
                          : savedDecision?.decision === "rejected"
                            ? "You rejected this NPI record for this agency."
                            : "This search result is not linked until you decide."}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => saveDecision("confirmed")}
                          className="h-7 rounded border border-emerald-200 px-2 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                          data-testid={`button-confirm-ems-source-${record.npi}`}
                        >
                          {savedDecision?.decision === "confirmed"
                            ? "Associated"
                            : "Associate record"}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveDecision("rejected")}
                          className="h-7 rounded border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          data-testid={`button-reject-ems-source-${record.npi}`}
                        >
                          {savedDecision?.decision === "rejected"
                            ? "Rejected"
                            : "Not this agency"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {data?.resultsTruncated && (
                <p className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
                  {data.errorMessage || 'The results may be incomplete. Narrow the agency name or city and try again.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <details className="border-t border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
        <summary className="cursor-pointer text-[10px] font-semibold text-slate-700 dark:text-slate-200">
          Other public EMS data sources and their scope
        </summary>
        <div className="mt-2 space-y-2">
          <SourceLink
            title="CMS Medicare provider enrollment"
            href={CMS_ENROLLMENT_SOURCE}
            note="Quarterly active Medicare enrollment; it is not a complete EMS license or operating-agency list and is not matched to this candidate here."
          />
          <SourceLink
            title="NEMSIS public dashboards"
            href={NEMSIS_PUBLIC_SOURCE}
            note="Public operational and performance measures are aggregated; these dashboards are not an agency-by-agency licensing registry."
          />
          {!isFloridaLicenseReference && jurisdictionSource && (
            <p
              className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400"
              data-testid="status-ems-state-license-feed-not-connected"
            >
              This is a state-office discovery route, not a connected license
              roster. No state-level provider records were matched by this app.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

function SourceLink({
  title,
  href,
  note,
}: {
  title: string;
  href: string;
  note: string;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-2.5 py-2 dark:bg-slate-800/70">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
      >
        {title} <ExternalLink className="h-3 w-3" />
      </a>
      <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
        {note}
      </p>
    </div>
  );
}
