/** Compact decision-maker directory. Buying role is derived from the recorded title/role text only; never inferred relationships. */
import React from 'react';
import { ExternalLink, Mail, Phone, UserRound } from 'lucide-react';
import type { Agency, KeyContact } from '../../types';
import { hasMappedAgencyFactEvidence } from '../../data/agencyFactEvidence';

type Influence = 'Recorded economic buyer' | 'Clinical role' | 'Operational role' | 'Procurement role' | 'Leadership · authority unconfirmed' | 'Role not classified';

const classify = (c: KeyContact): Influence => {
  const t = `${c.role} ${c.title}`.toLowerCase();
  if (/economic buyer|final purchasing authority/.test(t)) return 'Recorded economic buyer';
  if (/purchas|procure|finance|budget|city manager|county manager/.test(t)) return 'Procurement role';
  if (/medical director|clinical|quality|educat|nurse/.test(t)) return 'Clinical role';
  if (/chief|director|commissioner|administrator/.test(t) && !/battalion|deputy|assistant/.test(t)) return 'Leadership · authority unconfirmed';
  if (/captain|logistic|fleet|deputy|battalion|operations|assistant|supervisor/.test(t)) return 'Operational role';
  return 'Role not classified';
};
const ORDER: Influence[] = ['Recorded economic buyer', 'Leadership · authority unconfirmed', 'Procurement role', 'Clinical role', 'Operational role', 'Role not classified'];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

const safeUrl = (v?: string) => { try { const u = new URL(v ?? ''); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined; } catch { return undefined; } };

export const DecisionMakerDirectory: React.FC<{ agency: Agency }> = ({ agency }) => {
  const contacts = (agency.keyContacts ?? []).filter((c) => c.name?.trim());
  const ev = agency.factEvidence?.decisionMakers || agency.factEvidence?.agencyLeadership;
  const mapped = hasMappedAgencyFactEvidence(agency, 'decisionMakers') || hasMappedAgencyFactEvidence(agency, 'agencyLeadership');
  const grouped = ORDER.map((g) => ({ g, list: contacts.filter((c) => classify(c) === g) })).filter((x) => x.list.length);

  return (
    <div className="adm" data-testid="decision-maker-directory">
      <div className="adm-source">
        <span className="afi-kind" data-kind={mapped ? 'reported' : 'reference'}>{mapped ? 'Source mapped' : 'No roster source mapped'}</span>
        {ev?.sourceName && (safeUrl(ev.sourceUrl)
          ? <a href={safeUrl(ev.sourceUrl)} target="_blank" rel="noopener noreferrer">{ev.sourceName}<ExternalLink aria-hidden="true" className="h-3 w-3" /></a>
          : <span>{ev.sourceName}</span>)}
        {ev?.reportingPeriod && <span>· {ev.reportingPeriod}</span>}
        <span className="adm-hint">Grouped by recorded titles. A title alone does not establish purchasing authority or influence.</span>
      </div>
      {contacts.length === 0 ? (
        <div className="adm-empty">
          <UserRound aria-hidden="true" className="h-5 w-5" />
          <div>
            <p className="adm-empty-title">No decision makers recorded</p>
            <p>Research the chief, medical director and purchasing contact.{agency.headquartersPhone && <> Main line: <a href={`tel:${agency.headquartersPhone}`}>{agency.headquartersPhone}</a></>}{safeUrl(agency.officialWebsite) && <> · <a href={safeUrl(agency.officialWebsite)} target="_blank" rel="noopener noreferrer">Agency website</a></>}</p>
          </div>
        </div>
      ) : (
        grouped.map(({ g, list }) => (
          <section key={g} className="adm-group" aria-label={g}>
            <h3>{g} <span>{list.length}</span></h3>
            <ul>
              {list.map((c, i) => (
                <li key={c.id || `${c.name}-${i}`} className="adm-row" data-testid={`row-contact-${c.id || i}`}>
                  <span className="adm-avatar" aria-hidden="true">{initials(c.name)}</span>
                  <div className="adm-who">
                    <p className="adm-name">{c.name}</p>
                    <p className="adm-title">{[c.title, c.role !== c.title ? c.role : ''].filter(Boolean).join(' · ') || 'Title not reported'}</p>
                  </div>
                  <div className="adm-contact">
                    {c.phone ? <a href={`tel:${c.phone}`} data-testid={`link-contact-phone-${c.id || i}`}><Phone aria-hidden="true" className="h-3.5 w-3.5" />{c.phone}</a> : <span className="is-missing">No direct phone</span>}
                    {c.email ? <a href={`mailto:${c.email}`} data-testid={`link-contact-email-${c.id || i}`}><Mail aria-hidden="true" className="h-3.5 w-3.5" />{c.email}</a> : <span className="is-missing">No email listed</span>}
                  </div>
                  <p className="adm-src">{c.verificationSource || 'Source not listed'}{c.isVerifiedOfficial ? ' · official listing recorded' : ''}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default DecisionMakerDirectory;
