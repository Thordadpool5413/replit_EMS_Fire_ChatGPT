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
  const periods = new Map<string, DepartmentMetric[]>();
  for (const metric of metrics) {
    if (!metric.reportingPeriod) continue;
    const rows = periods.get(metric.label) ?? [];
    rows.push(metric);
    periods.set(metric.label, rows);
  }
  const trends = [...periods].filter(([, rows]) =>
    new Set(rows.map(row => row.reportingPeriod)).size === rows.length && rows.length > 1 &&
    rows.every(row => row.format === rows[0].format && row.value >= 0 && (row.format !== 'percent' || row.value <= 100)));
  const trendLabels = new Set(trends.map(([label]) => label));
  const featured = metrics.filter(metric => !trendLabels.has(metric.label) && !(grouped && comparable.includes(metric)));
  const max = grouped ? Math.max(...comparable.map(metric => metric.value), 1) : 1;

  return <>
    <dl className="pr-metrics pr-metric-cards">
      {featured.map(metric => {
        const Icon = iconFor(metric.label);
        return <div key={metric.label + ':' + (metric.reportingPeriod ?? metric.source.date)} className="pr-metric-card">
          <dt><Icon size={17} aria-hidden="true" />{metric.label}</dt>
          <dd>{formatProviderMetric(metric)}{metric.reportingPeriod && metric.reportingPeriod !== metric.source.date && <small>{metric.reportingPeriod}</small>}{metric.format === 'percent' && metric.value >= 0 && metric.value <= 100 &&
            <span className="pr-metric-bar" aria-hidden="true"><span style={{ width: metric.value + '%' }} /></span>}{metric.context && <small>{metric.context}</small>}<ProviderSourceLink source={metric.source} /></dd>
        </div>;
      })}
    </dl>
    {trends.length > 0 && <section className="pr-apparatus-comparison">
      <h3><HeartPulse size={19} aria-hidden="true" /> Published year-over-year figures</h3>
      {trends.map(([label, rows]) => {
        const max = rows[0].format === 'percent' ? 100 : Math.max(1, ...rows.map(row => row.value));
        return <section key={label}>
          <h4>{label}</h4>
          <dl>{rows.map(row => <div key={row.reportingPeriod}>
            <dt>{row.reportingPeriod}</dt>
            <dd>{formatProviderMetric(row)}
              <span className="pr-metric-bar" aria-hidden="true"><span style={{ width: row.value / max * 100 + '%' }} /></span>
              {row.context && <small>{row.context}</small>}<ProviderSourceLink source={row.source} />
            </dd>
          </div>)}</dl>
        </section>;
      })}
    </section>}
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
