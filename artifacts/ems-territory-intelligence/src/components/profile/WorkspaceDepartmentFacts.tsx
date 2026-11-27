import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { fetchAgenciesFromReplit } from '../../utils/replitAgencyApi';
import { workspaceFactsFor } from '../../services/matchedWorkspaceFacts';
import { factSection } from '../../services/departmentBrief';
import type { ProviderProfileRef } from '../../navigation/providerProfileUrl';

export function WorkspaceDepartmentFacts({
  record,
  section,
}: {
  record: ProviderProfileRef;
  section: string;
}) {
  const state = record.state;
  const query = useQuery({
    queryKey: ['public-profile-state-workspace', state],
    queryFn: () => fetchAgenciesFromReplit(state),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const facts = workspaceFactsFor(record, query.data ?? []);
  const selected =
    section === 'overview' || section === 'sources'
      ? facts
      : facts.filter(
          (f) => factSection[f.kind] === section || (section === 'equipment' && f.kind === 'funding'),
        );
  if (!selected.length) return null;
  return (
    <section className="pr-panel">
      <h2 className="pr-icon-heading">
        <ClipboardList size={20} />
        Linked department records
      </h2>
      <dl className="pr-metrics">
        {selected.map((f, i) => (
          <div key={f.label + i}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
            {f.note && <p>{f.note}</p>}
            <small>{f.source}</small>
          </div>
        ))}
      </dl>
    </section>
  );
}
