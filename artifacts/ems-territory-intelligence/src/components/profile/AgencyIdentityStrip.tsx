import React, {useState} from 'react';
import {MapPin, Phone, Globe, Users, Mail, Copy, ArrowUpRight, FileText, ChevronDown} from 'lucide-react';
import {isPhysicalStreet} from '../../services/providerLocationContract';
import type {Agency, AgencyFactEvidence} from '../../types';

function SourceContext({evidence, fallback}: {evidence?: AgencyFactEvidence; fallback?: string}) {
  const source = evidence?.sourceName || fallback;
  const url = (() => { try { const u = new URL(evidence?.sourceUrl || ''); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } })();
  return <details className="brief-source"><summary><FileText aria-hidden="true"/>Source details<ChevronDown aria-hidden="true"/></summary><div><p>{source || 'No source recorded for these details.'}</p><p>{evidence?.reportingPeriod ? `Source period: ${evidence.reportingPeriod}` : 'Source period not recorded'}</p>{url && <a href={url} target="_blank" rel="noreferrer">Open source <ArrowUpRight aria-hidden="true"/></a>}</div></details>;
}

export function AgencyIdentityStrip({agency, onPeople}: {agency: Agency; onPeople: () => void}) {
  const [notice, setNotice] = useState('');
  const address = agency.address?.trim();
  const usable = address && !/not (reported|source.verified)|unknown/i.test(address);
  const locality = [agency.city, agency.stateCode, agency.zipCode].filter(Boolean).join(', ');
  const fullAddress = [usable ? address : '', locality].filter(Boolean).join(', ');
  const copy = async () => { try { await navigator.clipboard.writeText(fullAddress); setNotice('Address copied.'); } catch { setNotice('Select the recorded address to copy it.'); } };
  const website = (() => { try { const u = new URL(agency.officialWebsite || ''); return /^https?:$/.test(u.protocol) ? u : null; } catch { return null; } })();
  const contacts = agency.keyContacts || [];
  return <section className="agency-identity-strip agency-briefing" aria-label="Agency location and key people">
    <div className="brief-location">
      <div className="brief-section-heading"><span className="brief-icon"><MapPin aria-hidden="true"/></span><h2>Location & contact</h2></div>
      <address><strong>{usable ? address : 'Street address not recorded'}</strong><span>{locality}</span></address>
      <p className="brief-caption">Recorded location</p>
      <div className="brief-location-actions">{usable && <><button type="button" onClick={() => void copy()}><Copy aria-hidden="true"/>Copy address</button>{isPhysicalStreet(address)&&<a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`}><MapPin aria-hidden="true"/>Directions</a>}</>}</div>
      <div className="brief-communication">{agency.headquartersPhone ? <a href={`tel:${agency.headquartersPhone}`}><Phone aria-hidden="true"/><span><small>Main phone</small>{agency.headquartersPhone}</span></a> : <p><Phone aria-hidden="true"/><span>Main phone not recorded</span></p>}{website ? <a href={website.href} target="_blank" rel="noreferrer"><Globe aria-hidden="true"/><span><small>Website</small>{website.hostname.replace(/^www\./,'')}</span><ArrowUpRight aria-hidden="true"/></a> : <p><Globe aria-hidden="true"/><span>Website not recorded</span></p>}</div>
      <SourceContext evidence={agency.factEvidence?.providerAddress}/>
      {notice && <p role="status">{notice}</p>}
    </div>
    <div className="brief-people">
      <header className="brief-section-heading"><span className="brief-icon"><Users aria-hidden="true"/></span><div><h2>Recorded contacts</h2></div><button type="button" onClick={onPeople}>View all people <ArrowUpRight aria-hidden="true"/></button></header>
      {contacts.length ? <ul className="brief-contact-grid">{contacts.slice(0,3).map((contact,index) => <li key={contact.id || index} className="brief-contact">
        <div className="brief-contact-top"><span className="brief-avatar" aria-hidden="true">{contact.name.split(/\s+/).filter(Boolean).map(s=>s[0]).slice(0,2).join('')}</span><span className="brief-contact-index">{String(index+1).padStart(2,'0')}</span></div>
        <strong>{contact.name}</strong><span className="brief-contact-title">{contact.title || contact.role || 'Title not recorded'}</span>
        <div className="brief-contact-actions">{contact.email ? <a href={`mailto:${contact.email}`} title={contact.email} aria-label={`Email ${contact.name}`}><Mail aria-hidden="true"/>Email<span className="sr-only"> {contact.name}</span></a> : <span>Email not recorded</span>}{contact.phone ? <a href={`tel:${contact.phone}`} title={contact.phone} aria-label={`Call ${contact.name}`}><Phone aria-hidden="true"/>Call<span className="sr-only"> {contact.name}</span></a> : <span>Phone not recorded</span>}</div>
        <SourceContext evidence={agency.factEvidence?.decisionMakers} fallback={contact.verificationSource}/>
      </li>)}</ul> : <div className="brief-people-empty"><Users aria-hidden="true"/><div><strong>Start with the right person</strong><p>No contacts are recorded. Add leadership, clinical and purchasing contacts in People.</p><button type="button" onClick={onPeople}>Open People <ArrowUpRight aria-hidden="true"/></button></div></div>}
    </div>
  </section>;
}
