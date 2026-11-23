import { useEffect, useMemo } from "react";
import {
  getGetFireRegistryMatchesQueryKey,
  useGetFireRegistryMatches,
} from "@workspace/api-client-react";
import { ExternalLink, MapPin, RefreshCw } from "lucide-react";
import type { AgencySourceRecordAssociation } from "../types";
import { findAgencySourceRecordAssociation } from "../services/agencySourceRecordStore";
import { DataLabel } from './DataLabel';

type FireRegistryLookupProps = {
  agencyName: string;
  city?: string;
  stateCode: string;
  fdid?: string;
  agencyId: string;
  sourceRecordAssociations: AgencySourceRecordAssociation[];
  onDecideSourceRecord: (association: AgencySourceRecordAssociation) => void;
};

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

function displayLocation(
  city: string | null | undefined,
  stateCode: string | null | undefined,
  postalCode?: string | null,
): string {
  return [city, stateCode, postalCode].filter(Boolean).join(", ");
}

function recordLabel(matchLevel: string): string {
  return matchLevel === "strong_candidate"
    ? "Strong name/location match"
    : "Possible name/location match";
}

export function FireRegistryLookup({
  agencyName,
  city = "",
  stateCode,
  fdid = "",
  agencyId,
  sourceRecordAssociations,
  onDecideSourceRecord,
}: FireRegistryLookupProps) {
  const params = useMemo(
    () => ({
      agencyName,
      city: city || undefined,
      stateCode,
      fdid: fdid || undefined,
    }),
    [agencyName, city, stateCode, fdid],
  );
  const hasSearchInputs =
    agencyName.trim().length > 0 && /^[A-Z]{2}$/i.test(stateCode);
  const query = useGetFireRegistryMatches(params, {
    query: {
      enabled: hasSearchInputs,
      queryKey: getGetFireRegistryMatchesQueryKey(params),
      staleTime: 30 * 60 * 1000,
    },
  });
  const records = query.data?.records ?? [];
  const sources = query.data?.sourceStatuses ?? [];
  const sourceStillLoading = sources.some(
    (source) => source.status === "loading",
  );

  useEffect(() => {
    if (!sourceStillLoading) return;
    const timer = window.setInterval(() => {
      void query.refetch();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [sourceStillLoading, query.refetch]);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      data-testid="panel-fire-registry-matches"
      aria-labelledby="fire-registry-title"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3.5 py-3 dark:border-slate-800">
        <div>
          <h3
            id="fire-registry-title"
            className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200"
          >
            Public fire registry records
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Source entries stay separate; review the linked record before
            treating a candidate as the same agency.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={!hasSearchInputs || query.isFetching}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          data-testid="button-refresh-fire-registry"
          aria-label="Refresh public fire registry search"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {!hasSearchInputs ? (
        <p
          className="px-3.5 py-3 text-xs text-slate-600 dark:text-slate-300"
          role="status"
          data-testid="status-fire-registry-invalid-input"
        >
          A two-letter state code is needed to search the public registries.
        </p>
      ) : query.isLoading ? (
        <p
          className="px-3.5 py-3 text-xs text-slate-600 dark:text-slate-300"
          role="status"
          data-testid="status-fire-registry-loading"
        >
          Searching USFA and NERIS records for {stateCode.toUpperCase()}…
        </p>
      ) : query.isError ? (
        <div
          className="space-y-2 px-3.5 py-3"
          role="status"
          data-testid="status-fire-registry-error"
        >
          <p className="text-xs text-rose-700 dark:text-rose-300">
            Public registry records could not be loaded. The saved agency record
            was not changed.
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
            data-testid="button-retry-fire-registry"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-3.5">
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.map((source) => (
              <div
                key={source.source}
                className="min-w-0 rounded-md bg-slate-50 px-2.5 py-2 dark:bg-slate-800/70"
                data-testid={`status-fire-registry-source-${source.source === "NERIS" ? "neris" : "usfa"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                    {source.source}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-semibold ${
                      source.status === "available"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : source.status === "loading"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {source.status === "available"
                      ? "Available"
                      : source.status === "loading"
                        ? "Loading"
                        : "Unavailable"}
                  </span>
                </div>
                {source.status === "available" ? (
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    {source.recordCount.toLocaleString()} state records loaded ·
                    retrieved {displayDate(source.fetchedAt)}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    {source.errorMessage || "Source could not be reached."}
                  </p>
                )}
                {source.status === "available" && source.errorMessage && (
                  <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                    {source.errorMessage}
                  </p>
                )}
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 hover:underline dark:text-blue-300"
                  data-testid={`link-fire-registry-source-${source.source === "NERIS" ? "neris" : "usfa"}`}
                >
                  Open source <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>

          {records.length === 0 ? (
            <p
              className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300"
              role="status"
              data-testid="status-fire-registry-no-matches"
            >
              No close name/location candidates were returned for this agency.
              That does not prove a record is absent; check the source lists
              directly.
            </p>
          ) : (
            <div className="space-y-2.5">
              {records.map((record, recordIndex) => {
                const savedDecision = findAgencySourceRecordAssociation(
                  sourceRecordAssociations,
                  record.source,
                  record.sourceRecordId,
                );
                const saveDecision = (
                  decision: AgencySourceRecordAssociation["decision"],
                ) => {
                  onDecideSourceRecord({
                    id: `${record.source}:${record.sourceRecordId}`,
                    sourceName: record.source,
                    sourceRecordId: record.sourceRecordId,
                    sourceUrl: record.sourceUrl,
                    decision,
                    matchBasis: `${record.matchReasons.join("; ")}. User ${decision === "confirmed" ? "associated" : "rejected"} the candidate for agency ${agencyId}.`,
                    sourceDate: record.exportDate,
                    retrievedAt:
                      query.data?.fetchedAt || new Date().toISOString(),
                    decidedAt: new Date().toISOString(),
                    sourceFields: {
                      agencyName: record.agencyName,
                      stateCode: record.stateCode,
                      city: record.city,
                      county: record.county,
                      headquartersAddress: record.headquartersAddress,
                      fdid: record.fdid,
                      nerisId: record.nerisId,
                      departmentType: record.departmentType,
                      organizationType: record.organizationType,
                      entityType: record.entityType,
                      stationCount: record.stationCount,
                      unitCount: record.unitCount,
                      exportDate: record.exportDate,
                      stations: record.stations,
                      units: record.units,
                      jurisdictions: record.jurisdictions,
                      stationsTruncated: record.stationsTruncated,
                      unitsTruncated: record.unitsTruncated,
                      jurisdictionsTruncated: record.jurisdictionsTruncated,
                    },
                  });
                };
                return (
                <article
                  key={`${record.source}-${record.sourceRecordId}`}
                  className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
                  data-testid={`card-fire-registry-record-${record.source.toLowerCase().replace(/\s+/g, "-")}-${recordIndex}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {record.source}
                        </span>
                        <span
                          className={`text-[10px] font-semibold ${
                            record.matchLevel === "strong_candidate"
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {recordLabel(record.matchLevel)}
                        </span>
                      </div>
                      <h4
                        className="mt-1.5 break-words text-sm font-semibold text-slate-900 dark:text-white"
                        data-testid={`text-fire-registry-name-${recordIndex}`}
                      >
                        {record.agencyName}
                      </h4>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {displayLocation(record.city, record.stateCode)}
                        {record.county ? ` · ${record.county} County` : ""}
                      </p>
                    </div>
                    <a
                      href={record.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline dark:text-blue-300"
                      data-testid={`link-fire-registry-record-${recordIndex}`}
                    >
                      View record <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {record.source === "USFA NFDR" && record.fdid
                          ? "State-scoped FDID"
                          : record.source === "NERIS"
                            ? "NERIS ID"
                            : "Source record ID"}
                      </dt>
                      <dd className="break-all font-mono font-medium text-slate-800 dark:text-slate-100">
                        {record.sourceRecordId}
                      </dd>
                    </div>
                    {record.headquartersAddress && (
                      <div className="col-span-2">
                        <dt className="text-slate-500 dark:text-slate-400">
                          <DataLabel kind="location">Registry address</DataLabel>
                        </dt>
                        <dd className="font-medium text-slate-800 dark:text-slate-100">
                          {record.headquartersAddress}
                        </dd>
                      </div>
                    )}
                    {record.stationCount !== null && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          <DataLabel kind="stations">Reported stations</DataLabel>
                        </dt>
                        <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                          {record.stationCount}
                        </dd>
                      </div>
                    )}
                    {record.unitCount !== null && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Reported units
                        </dt>
                        <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                          {record.unitCount}
                        </dd>
                      </div>
                    )}
                    {(record.departmentType ||
                      record.organizationType ||
                      record.entityType) && (
                      <div className="col-span-2">
                        <dt className="text-slate-500 dark:text-slate-400">
                          Registry classification
                        </dt>
                        <dd className="font-medium text-slate-800 dark:text-slate-100">
                          {[
                            record.departmentType,
                            record.organizationType,
                            record.entityType,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        <DataLabel kind="period">Record export date</DataLabel>
                      </dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">
                        {displayDate(record.exportDate)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                        Station address records ({record.stations.length})
                      </span>
                      {record.stationsTruncated && (
                        <span className="text-[9px] text-amber-700 dark:text-amber-300">
                          First 100 shown
                        </span>
                      )}
                    </div>
                    {record.stations.length > 0 ? (
                      <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                        {record.stations.map((station, stationIndex) => (
                          <li
                            key={`${station.source}-${station.sourceRecordId ?? station.name}-${stationIndex}`}
                            className="rounded bg-slate-50 px-2 py-1.5 dark:bg-slate-800/70"
                            data-testid={`row-fire-station-${recordIndex}-${stationIndex}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="break-words text-[10px] font-medium text-slate-800 dark:text-slate-100">
                                  {station.name}
                                </p>
                                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                  {[
                                    station.address,
                                    displayLocation(
                                      station.city,
                                      station.stateCode,
                                      station.postalCode,
                                    ),
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Address not listed"}
                                </p>
                                {station.unitCount !== null && (
                                  <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">
                                    {station.unitCount} units reported at this
                                    station
                                  </p>
                                )}
                                {station.exportDate && (
                                  <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">
                                    Source export: {displayDate(station.exportDate)}
                                  </p>
                                )}
                              </div>
                              <a
                                href={station.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open source for ${station.name}`}
                                className="shrink-0 text-blue-700 hover:underline dark:text-blue-300"
                                data-testid={`link-fire-station-source-${recordIndex}-${stationIndex}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        No station address rows were returned by this source.
                      </p>
                    )}
                  </div>

                  {record.source === "NERIS" && (
                    <>
                      <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                            NERIS unit-table records ({record.units.length})
                          </span>
                          {record.unitsTruncated && (
                            <span className="text-[9px] text-amber-700 dark:text-amber-300">
                              First 200 shown
                            </span>
                          )}
                        </div>
                        <p className="mb-1.5 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
                          These are unit-table entries from the cited NERIS export, not confirmation that each unit is currently active or in frontline service.
                        </p>
                        {record.units.length > 0 ? (
                          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                            {record.units.map((unit, unitIndex) => (
                              <li
                                key={`${unit.sourceRecordId}-${unitIndex}`}
                                className="rounded bg-slate-50 px-2 py-1.5 text-[10px] dark:bg-slate-800/70"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                                      {unit.unitType || "Unit type not stated"}
                                      {unit.stationName ? ` · ${unit.stationName}` : ""}
                                    </p>
                                    <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                      {[
                                        unit.cadDesignation1,
                                        unit.cadDesignation2,
                                        unit.dedicatedStaffing
                                          ? `Staffing: ${unit.dedicatedStaffing}`
                                          : null,
                                      ].filter(Boolean).join(" · ") || "No CAD designation or staffing value listed"}
                                    </p>
                                    <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">
                                      Unit NERIS ID {unit.sourceRecordId} · export {displayDate(unit.exportDate)}
                                    </p>
                                  </div>
                                  <a
                                    href={unit.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Open NERIS source for unit ${unit.sourceRecordId}`}
                                    className="shrink-0 text-blue-700 hover:underline dark:text-blue-300"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            No unit-table rows were returned for this department.
                          </p>
                        )}
                      </div>

                      <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                            NERIS department-jurisdiction boundary records ({record.jurisdictions.length})
                          </span>
                          {record.jurisdictionsTruncated && (
                            <span className="text-[9px] text-amber-700 dark:text-amber-300">
                              First 50 shown
                            </span>
                          )}
                        </div>
                        <p className="mb-1.5 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
                          Boundary geometry remains at the NERIS source; the app does not infer service coverage from an address or nearby station.
                        </p>
                        {record.jurisdictions.length > 0 ? (
                          <ul className="space-y-1.5">
                            {record.jurisdictions.map((jurisdiction, jurisdictionIndex) => (
                              <li
                                key={`${jurisdiction.sourceRecordId}-${jurisdictionIndex}`}
                                className="flex items-start justify-between gap-2 rounded bg-slate-50 px-2 py-1.5 text-[10px] dark:bg-slate-800/70"
                              >
                                <div>
                                  <p className="font-medium text-slate-800 dark:text-slate-100">
                                    {jurisdiction.name || "Jurisdiction name not stated"}
                                  </p>
                                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                    {[jurisdiction.regionType, jurisdiction.entityType, jurisdiction.departmentType]
                                      .filter(Boolean).join(" · ") || "Classification not stated"}
                                    {" · "}Export {displayDate(jurisdiction.exportDate)}
                                  </p>
                                </div>
                                <a
                                  href={jurisdiction.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open NERIS jurisdiction boundary for ${jurisdiction.name || record.agencyName}`}
                                  className="shrink-0 text-blue-700 hover:underline dark:text-blue-300"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            No jurisdiction boundary record was returned for this department.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Match basis: {record.matchReasons.join(" · ")}. This is a
                    candidate for account review, not a confirmed agency
                    identity.
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <span className="text-[10px] text-slate-600 dark:text-slate-300">
                      {savedDecision?.decision === "confirmed"
                        ? "You associated this source record with this agency."
                        : savedDecision?.decision === "rejected"
                          ? "You rejected this source record for this agency."
                          : "This source candidate is not linked until you decide."}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => saveDecision("confirmed")}
                        className="h-7 rounded border border-emerald-200 px-2 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        data-testid={`button-confirm-fire-source-${record.source.toLowerCase().replace(/\s+/g, "-")}-${record.sourceRecordId}`}
                      >
                        {savedDecision?.decision === "confirmed"
                          ? "Associated"
                          : "Associate record"}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveDecision("rejected")}
                        className="h-7 rounded border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        data-testid={`button-reject-fire-source-${record.source.toLowerCase().replace(/\s+/g, "-")}-${record.sourceRecordId}`}
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}
