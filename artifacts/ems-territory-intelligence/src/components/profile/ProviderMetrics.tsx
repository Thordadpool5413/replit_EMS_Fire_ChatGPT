import { Activity, Building2, Truck, Users } from 'lucide-react';
import type { DepartmentMetric } from '../../data/providerProfileEvidence';
import { ProviderSourceLink, providerCurrency } from './ProviderEquipmentFunding';

function iconFor(label: string) {
  if (/personnel|firefighters/i.test(label)) return Users;
  if (/units|engines|quints/i.test(label)) return Truck;
  if (/stations/i.test(label)) return Building2;
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
          <dd>{metric.format === 'currency' ? providerCurrency.format(metric.value) : metric.value.toLocaleString('en-US') + (metric.format === 'percent' ? '%' : '')} <ProviderSourceLink source={metric.source} /></dd>
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
