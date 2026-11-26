import React, { useEffect, useMemo, useState } from 'react';
import type { Agency } from '../types';
import { filterNerisCountyStations, linkedNerisAccount, loadNerisMapState } from '../services/nerisStationMap';
import { nerisObjectUrl } from '../services/nerisStationCatalog';

const PAGE_SIZE = 10;

export function CountyNerisStationDirectory({
  stateCode,
  countyFips,
  countyName,
  city = '',
  agencies = [],
  onOpenSavedAgency,
}: {
  stateCode: string;
  countyFips: string;
  countyName: string;
  city?: string;
  agencies?: Agency[];
  onOpenSavedAgency?: (agency: Agency) => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadNerisMapState>> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    setPage(1);
    setLoading(true);
    loadNerisMapState(stateCode)
      .then((next) => {
        if (active) setData(next);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stateCode, attempt]);

  const stations = useMemo(
    () => data ? filterNerisCountyStations(data, countyFips, city, query) : [],
    [data, countyFips, city, query],
  );
  const parentCount = useMemo(() => new Set(stations.map((station) => station.parentId)).size, [stations]);
  const pageCount = Math.max(1, Math.ceil(stations.length / PAGE_SIZE));
  const visibleStations = stations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:p-4" aria-labelledby="county-stations-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 id="county-stations-heading" className="font-semibold text-slate-950 dark:text-white">Individual station records</h4>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            NERIS station source records with a point assigned to {countyName}. A station point does not establish department service area or current operation.
          </p>
        </div>
        <a
          className="shrink-0 text-sm font-medium text-blue-700 underline dark:text-blue-300"
          href="https://www.usfa.fema.gov/neris/public/"
          target="_blank"
          rel="noreferrer"
        >
          NERIS source
        </a>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300">
        County is derived from the reported point and a generalized county boundary, not a NERIS service-area field. Records with ambiguous or unavailable county placement are not assigned to this county.
        {data && <> Source snapshot: {data.retrievedAt.slice(0, 10)}.</>}
      </p>

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Search station or parent department
        <input
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Station name, ID, or department"
          aria-label="Search station records in county"
        />
      </label>

      {loading && <p role="status" className="text-sm">Loading station source records for {stateCode}…</p>}
      {error && (
        <p role="alert" className="text-sm">
          Station source records could not be loaded. <button type="button" className="underline" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
        </p>
      )}

      {data && !loading && !error && (
        <>
          <p role="status" className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {stations.length.toLocaleString()} station source records · {parentCount.toLocaleString()} parent department IDs represented · County FIPS {countyFips}
          </p>
          {!stations.length ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              No station records in this source snapshot have a point assigned to this county. Unassigned or ambiguous records are excluded; this does not establish that the county has no stations.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {visibleStations.map((station) => {
                const linkedAgency = linkedNerisAccount(station.parentId, agencies);
                const reportedAddress = station.address.filter(Boolean).join(', ') || 'Address not reported';
                return (
                  <li key={station.id} className="py-3 first:pt-1 last:pb-1">
                    <article className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <h5 className="min-w-0 break-words font-semibold text-slate-950 dark:text-white">
                          {station.name || 'Unnamed station source record'}
                        </h5>
                        <span className="shrink-0 font-mono text-xs text-slate-600 dark:text-slate-300">Station ID {station.id}</span>
                      </div>
                      <p className="break-words text-sm text-slate-700 dark:text-slate-200">
                        <strong>Parent department:</strong> {station.parentName} · NERIS ID {station.parentId}
                      </p>
                      {station.parentNameConflict && (
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Source parent-name discrepancy; relationship needs review.</p>
                      )}
                      <p className="break-words text-sm text-slate-700 dark:text-slate-200">
                        <strong>Reported geography:</strong> {reportedAddress}
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        <strong>Location status:</strong> source point assigned to {countyName} using a generalized boundary; not a service-area assignment.
                        {station.sharedPoint && ' This point is shared by multiple source records.'}
                      </p>
                      {station.exportDate !== null && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">Source record date: {new Date(station.exportDate).toISOString().slice(0, 10)}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        <a className="font-medium text-blue-700 underline dark:text-blue-300" href={nerisObjectUrl(1, station.oid)} target="_blank" rel="noreferrer">
                          Open original station record
                        </a>
                        {linkedAgency && onOpenSavedAgency && (
                          <button type="button" className="font-medium text-blue-700 underline dark:text-blue-300" onClick={() => onOpenSavedAgency(linkedAgency)}>
                            Open linked saved profile
                          </button>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          {stations.length > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
              <button type="button" className="workspace-button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <span>Page {page} of {pageCount}</span>
              <button type="button" className="workspace-button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
