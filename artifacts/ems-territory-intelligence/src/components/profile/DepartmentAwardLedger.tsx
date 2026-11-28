import { Landmark } from 'lucide-react';
import type { ProviderProfileRef } from '../../navigation/providerProfileUrl';
import { useDepartmentBrief } from './ServiceBrief';
import { ProviderSourceLink } from './ProviderEquipmentFunding';

export function DepartmentAwardLedger({
  record,
  coverage = false,
}: {
  record: ProviderProfileRef;
  coverage?: boolean;
}) {
  const { data } = useDepartmentBrief(record);
  if (!data?.awardCoverage || (!coverage && !data.awards.length)) return null;
  const edition = data.awardCoverage;
  return (
    <section className="pr-panel">
      <h2 className="pr-icon-heading">
        <Landmark size={20} />
        Public awards naming this department
      </h2>
      <p>
        {data.awards.length.toLocaleString()} matched records · Federal sources checked {edition.checked}
      </p>
      {coverage && (
        <p className="pr-muted">
          State source coverage · {edition.grantRows.toLocaleString()} firefighter grant records since FY
          2020 and {edition.contractRows.toLocaleString()} federal AED procurement records in the retained
          USAspending search ({edition.contractCoverage}). Matches require a unique department recipient in
          the state.
          {edition.stateGrantRows ? ` Texas HB 2604 also contributed ${edition.stateGrantRows.toLocaleString()} approval rows, matched by department and county.` : null}
        </p>
      )}
      {!!data.awards.length && (
        <ol className="pr-source-grid">
          {data.awards.map((a) => (
            <li className="pr-source-tile" key={a.source.url + a.source.label}>
              <strong>
                {a.amount == null
                  ? 'Amount unreported'
                  : a.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </strong>
              <h3>{a.title}</h3>
              <p>{a.status} · {a.basis}</p>
              <ProviderSourceLink source={a.source} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
