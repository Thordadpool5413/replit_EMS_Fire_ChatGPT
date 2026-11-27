import { Activity, Building2, ClipboardCheck, HeartPulse, Timer, Truck, Users } from 'lucide-react';
import type { DepartmentMetric } from '../../data/providerProfileEvidence';
import { formatProviderMetric } from '../../services/providerCardIntelligence';
import { ProviderSourceLink } from './ProviderEquipmentFunding';

function iconFor(label: string) {
  if (/personnel|firefighters/i.test(label)) return Users;
  if (/units|engines|quints/i.test(label)) return Truck;
  if (/stations|facilities/i.test(label)) return Building2;
  if (/response time|first-unit|within .*minutes/i.test(label)) return Timer;
  if (/cardiac|ROSC|STEMI/i.test(label)) return HeartPulse;
  if (/quality improvement|reviews/i.test(label)) return ClipboardCheck;
  return Activity;
}

export function ProviderMetrics({ metrics }: { metrics: DepartmentMetric[] }) {
  const comparable = metrics.filter(metric => metric.comparison === 'apparatus');
  const source = comparable[0]?.source;
  const grouped = source && comparable.length > 1 && comparable.every(metric =>
    metric.source.url === source.url && metric.source.date === source.date && Number.isInteger(metric.value) && metric.value >= 0);
  const featured = grouped ? metrics.filter(metric => !comparable.includes(metric)) : metrics;
  const max = grouped ? Math.max(...comparable.map(metric => metric.value), 1) : 1;

  return <>
    <dl className="pr-metrics pr-metric-cards">
      {featured.map(metric => {
        const Icon = iconFor(metric.label);
        return <div key={metric.label} className="pr-metric-card">
          <dt><Icon size={17} aria-hidden="true" />{metric.label}</dt>
          <dd>{formatProviderMetric(metric)}{metric.context && <small>{metric.context}</small>}<ProviderSourceLink source={metric.source} /></dd>
        </div>;
      })}
    </dl>
    {grouped && <section className="pr-apparatus-comparison">
      <h3><Truck size={19} aria-hidden="true" /> Reported apparatus</h3>
      <dl>
        {comparable.map(metric => <div key={metric.label}>
          <dt>{metric.label}</dt><dd>{metric.value.toLocaleString('en-US')}
            <span className="pr-metric-bar" aria-hidden="true"><span style={{ width: (metric.value / max * 100) + '%' }} /></span>
          </dd>
        </div>)}
      </dl>
      <ProviderSourceLink source={source} />
    </section>}
  </>;
}
