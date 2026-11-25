/** Compact decision-maker directory. Buying role is derived from the recorded title/role text only; never inferred relationships. */
import React from 'react';
import { Briefcase, ClipboardList, ExternalLink, Landmark, Mail, Phone, Stethoscope, UserRound, Users, Wrench } from 'lucide-react';
import type { Agency } from '../../types';


import {CONTACT_ROLES,recordedContactContext,professionalSource,professionalPhone,type ContactRole} from '../../services/professionalContacts';
const GROUP_ICON:Record<ContactRole,React.ComponentType<{className?:string;'aria-hidden'?:boolean|'true'}>>={
 'Leadership role':Briefcase,'Clinical role':Stethoscope,'Education role':Users,'Operational role':Wrench,'Technical / biomedical role':Wrench,'IT / communications role':Wrench,'Procurement role':ClipboardList,'Administrative / budget role':Landmark,'Role not classified':Users
};
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

const safeUrl=professionalSource;

export const DecisionMakerDirectory: React.FC<{ agency: Agency }> = ({ agency }) => {
  const contacts = (agency.keyContacts ?? []).filter((c) => c.name?.trim());
  const ev = agency.factEvidence?.decisionMakers || agency.factEvidence?.agencyLeadership;
  const grouped = CONTACT_ROLES.map((g) => ({ g, list: contacts.filter((c) => recordedContactContext(c).role === g) })).filter((x) => x.list.length);

  return (
    <div className="adm" data-testid="decision-maker-directory">
      <div className="adm-source">
        {ev?.sourceName && (safeUrl(ev.sourceUrl)
          ? <a href={safeUrl(ev.sourceUrl)} target="_blank" rel="noopener noreferrer">{ev.sourceName}<ExternalLink aria-hidden="true" className="h-3 w-3" /></a>
          : <span>{ev.sourceName}</span>)}
        {ev?.reportingPeriod && <span>· {ev.reportingPeriod}</span>}
        <span className="adm-hint">Grouped by recorded titles; purchasing responsibility requires separate dated evidence.</span>
      </div>
      {contacts.length === 0 ? (
        <div className="adm-empty">
          <UserRound aria-hidden="true" className="h-5 w-5" />
          <div>
            <p className="adm-empty-title">No professional contacts recorded</p>
            <p>Research the chief, medical director and purchasing contact.{professionalPhone(agency.headquartersPhone) && <> Main line: <a href={`tel:${agency.headquartersPhone}`}>{agency.headquartersPhone}</a></>}{safeUrl(agency.officialWebsite) && <> · <a href={safeUrl(agency.officialWebsite)} target="_blank" rel="noopener noreferrer">Agency website</a></>}</p>
          </div>
        </div>
      ) : (
        grouped.map(({ g, list }) => { const GroupIcon = GROUP_ICON[g]; return (
          <section key={g} className="adm-group" data-group={CONTACT_ROLES.indexOf(g)} aria-label={g}>
            <h3><GroupIcon aria-hidden="true" className="adm-group-ico" />{g} <span>{list.length}</span></h3>
            <ul>
              {list.map((c, i) => { const context=recordedContactContext(c); return (
                <li key={c.id || `${c.name}-${i}`} className="adm-row" data-testid={`row-contact-${c.id || i}`}>
                  <span className="adm-avatar" aria-hidden="true">{initials(c.name)}</span>
                  <div className="adm-who">
                    <p className="adm-name">{c.name}</p>
                    <p className="adm-title">{[c.title, c.role !== c.title ? c.role : ''].filter(Boolean).join(' · ') || 'Title not reported'}</p>
                  </div>
                  <div className="adm-contact">
                    {context.phone ? <a href={`tel:${context.phone}`} data-testid={`link-contact-phone-${c.id || i}`}><Phone aria-hidden="true" className="h-3.5 w-3.5" />{c.phone}</a> : <span className="is-missing">No usable recorded phone</span>}
                    {context.email ? <a href={`mailto:${context.email}`} data-testid={`link-contact-email-${c.id || i}`}><Mail aria-hidden="true" className="h-3.5 w-3.5" />{c.email}</a> : <span className="is-missing">No usable recorded email</span>}
                  </div>
                   <p className="adm-src">{context.sourceName || 'Individual source not listed'}{context.website&&<> · <a href={context.website} target="_blank" rel="noopener noreferrer">Recorded website</a></>} · Validate with agency</p>
                </li>
              );})}
            </ul>
          </section>
        ); })
      )}
    </div>
  );
};

export default DecisionMakerDirectory;
