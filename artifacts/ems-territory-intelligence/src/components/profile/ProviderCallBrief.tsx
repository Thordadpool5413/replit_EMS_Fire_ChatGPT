import { ArrowUpRight, ClipboardList, HeartPulse, MessageSquare, ShieldCheck } from 'lucide-react';
import type { ProviderEvidence } from '../../data/providerProfileEvidence';
import { ProviderSourceLink, providerCurrency } from './ProviderEquipmentFunding';

export function ProviderCallBrief({ evidence }: { evidence?: ProviderEvidence }) {
  const equipment = evidence?.equipment ?? [];
  const funding = evidence?.funding ?? [];
  const quality = evidence?.quality ?? [];
  const context = evidence?.accountContext ?? [];
  const inService = equipment.find(entry => entry.status === 'In service reported');
  const prior = equipment.find(entry => entry.status === 'Documented historically');
  const service = equipment.find(entry => entry.status === 'Service agreement');
  const proposal = equipment.find(entry => entry.status === 'Proposed purchase');
  const purchase = funding.find(entry => entry.status !== 'Reported expenditure');
  const cardiac = quality.some(metric => /cardiac arrest|ROSC/i.test(metric.label));

  return <section className="pr-panel pr-call-brief">
    <h2><ClipboardList aria-hidden="true" size={23} /> Pre-call briefing</h2>
    <div className="pr-call-grid">
      <div className="pr-call-card">
        <h3><ShieldCheck aria-hidden="true" size={19} /> Equipment and purchasing</h3>
        {inService && <div>
          <p><strong>Reported in service</strong> · {inService.deployment ?? inService.model ?? 'Equipment record'}</p>
          <ProviderSourceLink source={inService.source} />
        </div>}
        {prior && <div>
          <p><strong>Replacement history</strong> · {prior.deployment ?? prior.model ?? 'Historical equipment record'}</p>
          <ProviderSourceLink source={prior.source} />
        </div>}
        {service && <div>
          <p><strong>Service agreement</strong> · {service.manufacturer ?? service.deployment ?? 'Equipment maintenance'}</p>
          <ProviderSourceLink source={service.source} />
        </div>}
        {purchase && <div>
          <p><strong>{purchase.status}{purchase.amount === undefined ? '' : ' · ' + providerCurrency.format(purchase.amount)}</strong></p>
          <p>{purchase.title}</p>
          <ProviderSourceLink source={purchase.source} />
        </div>}
        {!purchase && proposal && <div>
          <p><strong>Proposed purchase</strong> · {proposal.model ?? proposal.deployment ?? 'Equipment proposal'}</p>
          <ProviderSourceLink source={proposal.source} />
        </div>}
        {equipment.length === 0 && !purchase && <p className="pr-muted">No agency-specific equipment or equipment-purchasing records on file.</p>}
        <a href="#equipment" className="pr-source-link">View equipment and funding <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
      <div className="pr-call-card">
        <h3><MessageSquare aria-hidden="true" size={19} /> Questions for the visit</h3>
        <ul>
          <li>{inService || prior ? 'Which makes and models are in service today, and what are the service and replacement dates?' : 'What devices are in use on front-line units, reserves, and public-access sites?'}</li>
          {service && <li>When do the service contract and its renewal options expire? Who manages the agreement?</li>}
          {(purchase || proposal) && <li>Has this purchase been awarded and deployed? What remains to be purchased, and who owns that decision?</li>}
          {context.some(entry => entry.title === 'AED-to-monitor compatibility') && <li>Which pads and connectors must carry over from a public-access AED to a crew’s monitor?</li>}
          {cardiac && <li>How does the EMS quality team review CPR events today, and what information is hard to capture?</li>}
          {!purchase && !proposal && <li>Who owns equipment evaluation and budget approval, and when is the next capital or grant decision?</li>}
        </ul>
      </div>
    </div>
    {context.length > 0 && <div className="pr-call-context">
      <h3><HeartPulse aria-hidden="true" size={19} /> Department workflow and buying roles</h3>
      {context.map(entry => <div key={entry.title}>
        <span className="pr-evidence-status">{entry.area}</span>
        <h4>{entry.title}</h4>
        <p>{entry.detail}</p>
        <ProviderSourceLink source={entry.source} />
      </div>)}
    </div>}
  </section>;
}
