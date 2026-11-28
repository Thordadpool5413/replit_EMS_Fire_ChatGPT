import { loadAgencyWorkspaceAccess } from '../../services/agencyWorkspaceAccess';
import { ProviderDenialDetails } from '../ProviderDenialDetails';
import { getAgencyMedicareDenialMetricForDisplay } from '../../services/agencyMedicareDenialService';
import { AgencyAuthorityEvidence } from './AgencyAuthorityEvidence';
import { ProviderSourceWorkspace } from './ProviderSourceWorkspace';
import { ReviewedLifecycleTimeline } from './ReviewedLifecycleTimeline';
import { StationEquipmentSummary } from './StationEquipmentSummary';
import { useAuth } from '@workspace/replit-auth-web';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { fetchAgenciesFromReplit } from '../../utils/replitAgencyApi';
import { matchedWorkspaceAgency, workspaceFactsFor } from '../../services/matchedWorkspaceFacts';
import { factSection } from '../../services/departmentBrief';
import type { ProviderProfileRef } from '../../navigation/providerProfileUrl';

export function WorkspaceDepartmentFacts({
  record,
  section,
}: {
  record: ProviderProfileRef;
  section: string;
}) {
  const { user } = useAuth();
  const state = record.state;
  const query = useQuery({
    queryKey: ['public-profile-state-workspace', state, user?.id ?? null],
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
          (f) => factSection[f.kind] === section || (section === 'grants' && f.kind === 'funding'),
        );
  const directory = query.data ?? [];
  const agency = user ? matchedWorkspaceAgency(record, directory) : undefined;
  const hasWorkspaceTab = ['equipment', 'grants', 'claims', 'people', 'discovery', 'stations'].includes(section);
  const access = useQuery({
    queryKey: ['provider-workspace-access', user?.id],
    queryFn: () => loadAgencyWorkspaceAccess(),
    enabled: Boolean(user && agency && hasWorkspaceTab),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const canReadWorkspace = access.data === 'viewer' || access.data === 'editor';
  const denialMetric = section === 'claims' && agency && canReadWorkspace ? getAgencyMedicareDenialMetricForDisplay(agency) : null;
  return <>
    {selected.length > 0 && <section className="pr-panel">
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
    </section>}
    {user && agency && hasWorkspaceTab && canReadWorkspace && <div className="space-y-3" key={user.id + ':' + agency.id}>
      {section === 'equipment' && <ProviderSourceWorkspace agencyId={agency.id} kind="inventory" readOnly />}
      {(section === 'equipment' || section === 'grants') && <ProviderSourceWorkspace agencyId={agency.id} kind="purchases" readOnly />}
      {section === 'claims' && <ProviderSourceWorkspace agencyId={agency.id} kind="billing" readOnly />}
      {denialMetric && <section className="pr-panel">
        <h2>Documented Medicare denial rate</h2>
        <strong>{denialMetric.ratePct}%</strong>
        <ProviderDenialDetails metric={denialMetric} />
      </section>}
      {(section === 'people' || section === 'discovery') && <AgencyAuthorityEvidence agencyId={agency.id} autoLoad readOnly />}
      {(section === 'equipment' || section === 'stations') && <StationEquipmentSummary agency={agency} directory={directory} />}
      {section === 'equipment' && <ReviewedLifecycleTimeline agency={agency} directory={directory} />}
    </div>}
  </>;
}
