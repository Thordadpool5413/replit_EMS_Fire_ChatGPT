import React from 'react';
import type { Agency } from '../types';
import { isGeographicProspect } from '../utils/providerRecordTrust';

type DirectoryStatus = 'loading' | 'ready' | 'unavailable';

export function CountySavedProfiles({
  countyName,
  profiles,
  status,
  onOpen,
}: {
  countyName: string;
  profiles: Agency[];
  status: DirectoryStatus;
  onOpen?: (agency: Agency) => void;
}) {
  const orderedProfiles = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section
      className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20"
      aria-labelledby="county-saved-profiles-heading"
      data-testid="county-saved-profiles"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="county-saved-profiles-heading" className="font-semibold text-slate-950 dark:text-white">
          Saved profiles in {countyName}
        </h4>
        <span className="text-sm font-medium tabular-nums">
          {profiles.length.toLocaleString()} in the current view
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        These are saved workspace profiles, separate from public registry listings. Source records do not become profiles unless someone explicitly reviews and links or creates one.
      </p>

      {orderedProfiles.length > 0 ? (
        <>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {orderedProfiles.slice(0, 4).map((agency) => (
              <li
                key={agency.id}
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-950 dark:text-white">{agency.name}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {agency.agencyType}
                    {isGeographicProspect(agency) ? ' · Geography-generated prospect' : ' · Saved profile'}
                  </p>
                </div>
                {onOpen && (
                  <button
                    type="button"
                    className="workspace-button min-h-11 shrink-0 px-3"
                    onClick={() => onOpen(agency)}
                  >
                    Open profile
                  </button>
                )}
              </li>
            ))}
          </ul>
          {profiles.length > 4 && (
            <a
              className="mt-2 inline-flex min-h-11 items-center font-medium text-blue-800 underline dark:text-blue-300"
              href="#territory-results-summary"
            >
              View all {profiles.length.toLocaleString()} saved profiles
            </a>
          )}
          {status === 'loading' && (
            <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Showing currently loaded profiles while the latest saved records refresh.
            </p>
          )}
        </>
      ) : status === 'loading' ? (
        <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          Saved profiles are loading. Public source listings below remain separate.
        </p>
      ) : status === 'unavailable' ? (
        <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          Saved profiles could not be refreshed; this is not evidence that none exist. Public source listings below remain separate.
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          No saved profiles match the current county filters. Browse the source listings below; they are not saved profiles.
        </p>
      )}
    </section>
  );
}
