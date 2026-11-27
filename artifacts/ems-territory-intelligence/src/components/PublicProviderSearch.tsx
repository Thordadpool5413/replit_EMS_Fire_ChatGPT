import type { Agency, AgencySourceRecordAssociation } from '../types';
import { useNationalSourceDirectory } from '../hooks/useNationalSourceDirectory';
import type { PublicSearchScope } from '../services/publicProviderSearch';
import { DepartmentResults } from './DepartmentDirectory';
export function PublicProviderSearch({
  scope,
  countyUnresolved = false,
  agencies,
  onState,
  onOpen,
  onCreate,
  onDecide,
}: {
  scope: PublicSearchScope;
  countyUnresolved?: boolean;
  agencies: Agency[];
  onState: (state: string) => void;
  onOpen: (a: Agency) => void;
  onCreate?: (a: Agency) => void | Promise<void>;
  onDecide?: (id: string, a: AgencySourceRecordAssociation) => void;
}) {
  const { manifest, error: manifestError, retry: retryManifest } = useNationalSourceDirectory();
  const ready = scope.state !== 'all' || scope.query.trim().length >= 2 || scope.zip.trim().length >= 3;
  const blocked = countyUnresolved;

  return (
    <section
      className="department-directory"
      data-testid="public-provider-search"
      aria-label="Public provider results"
    >
      <header className="dd-head">
        <h2>EMS &amp; fire directory</h2>
        <label className="dd-state">
          Browse state
          <select
            aria-label="Public provider state"
            value={scope.state}
            onChange={(e) => onState(e.target.value)}
          >
            <option value="all">All states</option>
            {Object.entries(manifest?.stateNames ?? {})
              .filter(([code]) => Object.hasOwn(manifest?.byState ?? {}, code))
              .map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
          </select>
        </label>
      </header>
      {manifestError && (
        <p role="alert">
          {manifestError} <button onClick={retryManifest}>Retry</button>
        </p>
      )}
      {!manifest && !manifestError && <p role="status">Loading directory…</p>}
      {blocked && <p role="alert">Select the county again to load its departments.</p>}
      {!ready && !blocked && (
        <p>Choose a state or search nationwide by department name, city, ZIP or identifier.</p>
      )}
      {ready && !blocked && manifest && (
        <DepartmentResults
          scope={scope}
          states={scope.state === 'all' ? Object.keys(manifest.byState) : [scope.state]}
          agencies={agencies}
          onOpen={onOpen}
          onCreate={onCreate}
          onDecide={onDecide}
        />
      )}
    </section>
  );
}
