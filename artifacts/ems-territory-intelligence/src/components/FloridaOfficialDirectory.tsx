import React, { useMemo, useState } from "react";
import {
  getGetFloridaOfficialAgenciesQueryKey,
  useGetFloridaOfficialAgencies,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  ExternalLink,
  Flame,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
} from "lucide-react";

const PAGE_SIZE = 25;

function displayDate(value: string | null | undefined): string {
  if (!value) return "Not provided by source";
  const sourceCalendarDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const date = new Date(
    sourceCalendarDate ? `${sourceCalendarDate}T00:00:00` : value,
  );
  return Number.isNaN(date.getTime())
    ? "Not provided by source"
    : date.toLocaleDateString();
}

function displayTimestamp(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString();
}

function SourceStatus({
  errorMessage,
}: {
  errorMessage: string | null;
}) {
  if (!errorMessage) return null;
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Source unavailable: {errorMessage}</span>
    </div>
  );
}

export const FloridaOfficialDirectory: React.FC = () => {
  const [source, setSource] = useState<"ems" | "fire">("ems");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [forceRefresh, setForceRefresh] = useState(false);
  const query = useGetFloridaOfficialAgencies(
    { refresh: forceRefresh },
    {
      query: {
        queryKey: getGetFloridaOfficialAgenciesQueryKey({
          refresh: forceRefresh,
        }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  );

  const emsRecords = query.data?.ems.records ?? [];
  const fireRecords = query.data?.fire.records ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredEms = useMemo(
    () =>
      emsRecords.filter((record) =>
        [
          record.providerName,
          record.city,
          record.addressState,
          record.county,
          record.licenseNumber,
          record.licenseType,
        ]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedSearch)),
      ),
    [emsRecords, normalizedSearch],
  );
  const filteredFire = useMemo(
    () =>
      fireRecords.filter((record) =>
        [
          record.departmentName,
          record.city,
          record.county,
          record.fdid,
          record.departmentType,
          record.organizationType,
        ]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedSearch)),
      ),
    [fireRecords, normalizedSearch],
  );

  const selectedMetadata = query.data?.[source].metadata;
  const selectedCount = source === "ems" ? filteredEms.length : filteredFire.length;
  const pageCount = Math.max(1, Math.ceil(selectedCount / PAGE_SIZE));
  const visibleEms = filteredEms.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const visibleFire = filteredFire.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const selectSource = (nextSource: "ems" | "fire") => {
    setSource(nextSource);
    setPage(0);
    setSearch("");
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const refresh = () => {
    if (!forceRefresh) {
      setForceRefresh(true);
      return;
    }
    void query.refetch();
  };

  return (
    <section
      aria-labelledby="florida-official-directory-title"
      className="pi-surface space-y-4 p-5 sm:p-6"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h2
              id="florida-official-directory-title"
              className="text-lg font-semibold text-slate-900 dark:text-white"
            >
              Florida official-source directory
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            These are source records, not completed operating profiles. They are
            not merged with scored agencies, and missing capabilities or
            performance data are not inferred.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={query.isFetching}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {query.isFetching ? "Checking sources…" : "Refresh official sources"}
        </button>
      </div>

      <div className="flex flex-col gap-3 border-y border-slate-200 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose source list">
          <button
            type="button"
            aria-pressed={source === "ems"}
            onClick={() => selectSource("ems")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
              source === "ems"
                ? "bg-blue-700 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            <Siren className="h-4 w-4" aria-hidden="true" />
            Florida EMS license report
          </button>
          <button
            type="button"
            aria-pressed={source === "fire"}
            onClick={() => selectSource("fire")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
              source === "fire"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            <Flame className="h-4 w-4" aria-hidden="true" />
            USFA fire registry
          </button>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <span className="sr-only">Search the selected Florida source list</span>
          <input
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search name, county, city, ID…"
            className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950"
          />
        </label>
      </div>

      {query.isLoading && (
        <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading source records from Florida DOH and USFA…
        </div>
      )}

      {query.isError && !query.data && (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
        >
          The official-source service could not be reached. No cached or
          estimated records are being presented. Use “Refresh official sources”
          to retry.
        </div>
      )}

      {query.data && (
        <>
          {selectedMetadata && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/70">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {selectedMetadata.sourceName}
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    Source report date: {displayDate(selectedMetadata.sourceUpdatedAt)}
                    <span className="px-2 text-slate-400">·</span>
                    Retrieved: {displayTimestamp(selectedMetadata.retrievedAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedMetadata.completenessNote} Live requests are cached
                    for up to five minutes; use refresh to bypass that cache.
                  </p>
                </div>
                <a
                  href={selectedMetadata.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 font-semibold text-blue-700 hover:underline dark:text-blue-300"
                >
                  Open source
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
              <SourceStatus errorMessage={selectedMetadata.errorMessage} />
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
            <p>
              {selectedCount.toLocaleString()} matching records
              {!normalizedSearch && selectedMetadata
                ? ` · ${selectedMetadata.recordCount.toLocaleString()} source rows`
                : ""}
            </p>
            {selectedCount > 0 && (
              <p>
                Page {page + 1} of {pageCount}
              </p>
            )}
          </div>

          {selectedCount === 0 && !selectedMetadata?.errorMessage && (
            <p className="rounded-lg border border-slate-200 p-5 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
              {query.isFetching
                ? "Checking the official source…"
                : "No source records match this search."}
            </p>
          )}

          {source === "ems" && visibleEms.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="px-3 py-3">Provider</th>
                    <th scope="col" className="px-3 py-3">Location on report</th>
                    <th scope="col" className="px-3 py-3">County</th>
                    <th scope="col" className="px-3 py-3">DOH license</th>
                    <th scope="col" className="px-3 py-3">License dates as reported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleEms.map((record) => (
                    <tr key={record.licenseNumber} className="align-top">
                      <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">
                        {record.providerName}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {[record.city, record.addressState].filter(Boolean).join(", ") || "Not listed"}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {record.county ?? "Not listed"}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        <span className="block">{record.licenseNumber}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {record.licenseType}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        <span className="block">Issued {displayDate(record.licenseIssuedDate)}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Expires {displayDate(record.licenseExpirationDate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {source === "fire" && visibleFire.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="px-3 py-3">Department in registry</th>
                    <th scope="col" className="px-3 py-3">City</th>
                    <th scope="col" className="px-3 py-3">County</th>
                    <th scope="col" className="px-3 py-3">USFA FDID</th>
                    <th scope="col" className="px-3 py-3">Registry classifications</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleFire.map((record, index) => (
                    <tr key={`${record.fdid ?? "no-fdid"}-${record.departmentName}-${index}`} className="align-top">
                      <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">
                        {record.departmentName}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {record.city ?? "Not listed"}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {record.county ?? "Not listed"}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {record.fdid ?? "Not listed in source"}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        <span className="block">{record.departmentType ?? "Not listed"}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {record.organizationType ?? "Organization type not listed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Contact details, staffing totals, and modeled scores are excluded from this source view.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={page + 1 >= pageCount}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
