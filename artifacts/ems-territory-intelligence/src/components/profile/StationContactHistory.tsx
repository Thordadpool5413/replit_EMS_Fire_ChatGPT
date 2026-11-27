import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, Warehouse } from 'lucide-react';
import { loadStationHistory, stationHistorySource } from '../../services/stationHistory';
import { departmentProfile, profileSourceKey } from '../../services/departmentIdentity';
import type { ProviderProfileRef } from '../../navigation/providerProfileUrl';

export function StationContactHistory({ record }: { record: ProviderProfileRef }) {
  const query = useQuery({
    queryKey: ['station-directory-history', record.state],
    queryFn: () => loadStationHistory(record.state),
    staleTime: Infinity,
  });
  const [showAll, setShowAll] = useState(false);
  const rows = query.data?.[profileSourceKey(departmentProfile(record))];
  if (query.isError)
    return (
      <p role="status">
        Archived station records unavailable. <button onClick={() => void query.refetch()}>Retry</button>
      </p>
    );
  if (!rows?.length) return null;
  return (
    <section className="pr-panel db-contacts">
      <h2>
        <Warehouse size={20} />
        Archived station directory
      </h2>
      <p className="pr-muted">
        {rows.length} matched {rows.length === 1 ? 'site' : 'sites'} · HIFLD fire and EMS station listings.
        Contact dates identify the age of each entry.
      </p>
      <div className="pr-source-grid">
        {(showAll ? rows : rows.slice(0, 4)).map((site) => (
          <article className="pr-source-tile" key={site.sourceId}>
            <h3>{site.name}</h3>
            <p>{site.address}</p>
            {site.phone && (
              <p>
                <a className="pr-source-link" href={'tel:' + site.phone.replace(/[^\d+]/g, '')}>
                  <Phone size={15} />
                  {site.phone}
                </a>
              </p>
            )}
            {Object.entries(site.figures).map(([label, value]) => (
              <p key={label}>
                {label} on archived listing · {value}
              </p>
            ))}
            <small>
              {site.date ? 'Source contact date ' + site.date : 'Contact date unreported'} ·{' '}
              <a href={stationHistorySource + '/' + site.sourceId} target="_blank" rel="noreferrer">
                HIFLD site {site.sourceId}
              </a>
            </small>
          </article>
        ))}
      </div>
      {rows.length > 4 && (
        <button className="pr-source-link" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer sites' : 'Show all ' + rows.length + ' sites'}
        </button>
      )}
    </section>
  );
}
