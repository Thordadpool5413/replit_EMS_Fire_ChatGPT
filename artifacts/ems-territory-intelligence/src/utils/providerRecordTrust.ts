import { registryIdentityKey,registryIdentityLabel,registryAccountId,canCreateRegistryAccount } from '../services/registryAccountLink';
import type { Agency } from '../types';

/** Geographic prospect origin survives verification-label changes and cloud sync.
 * Identity confirmation does not establish operational, clinical or purchasing facts.
 */
export function isGeographicProspect(agency: Pick<Agency,'id'|'verificationSource'|'dataProvenanceTier'>): boolean {
  return agency.dataProvenanceTier === 'generated_prospect'
    || /geographic prospect generator|generated geography-based prospect/i.test(agency.verificationSource ?? '')
    || /^(?:ems|fire)-[a-z]{2}-\d{5}(?:-|$)/i.test(agency.id ?? '')
    || /^territory-[a-z]{2}-(?:ems|fire)-/i.test(agency.id ?? '');
}

/** Identify the two legacy synthetic FDID patterns. Never reject an actual
 * state-scoped fire ID merely because it contains digits or leading zeroes.
 */
export function isGeneratedFdid(value: unknown, agency?: Pick<Agency,'id'|'verificationSource'|'dataProvenanceTier'>): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const id = value.trim();
  if (/^location-[a-f0-9]+$/i.test(id)) return true;
  if (/^[A-Z]{2}-(?:FD|EMS)-\d{5}(?:-[A-Z0-9]{1,3})?$/i.test(id)) return true;
  return Boolean(agency && /^territory-[a-z]{2}-(?:ems|fire)-/i.test(agency.id ?? '') && /^[A-Z]{2}-\d{1,5}$/i.test(id));
}

export function withoutGeneratedFdid<T extends Agency>(agency: T): T {
  if (!isGeneratedFdid(agency.fdid, agency)) return agency;
  return { ...agency, fdid: '', isFdidVerified: false };
}

/** Preserve source namespaces. A bare, unreviewed legacy FDID is not an official ID. */
export function agencyIdentifierLabel(agency: Agency): string {
  if(agency.registryIdentity&&registryIdentityKey(agency.registryIdentity))return registryIdentityLabel(agency.registryIdentity);
  const fdid = agency.fdid?.trim();
  const usfa = (agency.sourceRecordAssociations ?? []).filter(a =>
    a.decision === 'confirmed' && /USFA|NFDR/i.test(a.sourceName) && typeof a.sourceFields?.fdid === 'string');
  const linkedIds = [...new Set(usfa.filter(a=>!a.sourceFields.stateCode || String(a.sourceFields.stateCode).toUpperCase()===agency.stateCode?.toUpperCase()).map(a=>String(a.sourceFields.fdid).trim()).filter(v=>v&&!isGeneratedFdid(v,agency)))];
  if (linkedIds.length === 1) return 'FDID ' + linkedIds[0];
  if (linkedIds.length > 1) return 'FDID association requires review';
  if (fdid && !isGeneratedFdid(fdid,agency) && agency.isFdidVerified) return 'FDID ' + fdid;
  const fire = (agency.providerCategory ?? '').toLowerCase() === 'fire' || /fire/i.test(agency.agencyType ?? '');
  const neris = [...new Set((agency.sourceRecordAssociations ?? []).filter(a=>a.decision==='confirmed' && /^NERIS$/i.test(a.sourceName) && a.sourceRecordId.trim() && (!a.sourceFields?.stateCode || String(a.sourceFields.stateCode).toUpperCase()===agency.stateCode?.toUpperCase())).map(a=>a.sourceRecordId.trim()))];
  if (neris.length===1) return 'NERIS ID '+neris[0];
  if (neris.length>1) return 'NERIS association requires review';
  const stateIds=[...new Set((agency.sourceRecordAssociations??[]).filter(a=>a.decision==='confirmed'&&a.sourceName==='State EMS'&&a.sourceFields?.stateCode===agency.stateCode&&a.sourceFields?.identifierKind==='agency-code'&&typeof a.sourceFields?.stateAgencyId==='string').map(a=>String(a.sourceFields.stateAgencyId)))];
  if(stateIds.length===1)return 'State agency code '+stateIds[0];
  if(stateIds.length>1)return 'State agency code association requires review';
  const stateLicenses=[...new Set((agency.sourceRecordAssociations??[]).filter(a=>a.decision==='confirmed'&&a.sourceName==='State EMS'&&a.sourceFields?.stateCode===agency.stateCode&&a.sourceFields?.identifierKind==='license'&&typeof a.sourceFields?.stateAgencyId==='string').map(a=>String(a.sourceFields.stateAgencyId)))];
  if(stateLicenses.length===1)return 'State EMS license '+stateLicenses[0];
  if(stateLicenses.length>1)return 'State EMS license association requires review';
  if (agency.stateLicenseNumber?.trim()) return 'State license ' + agency.stateLicenseNumber.trim();
  if (agency.npiNumber?.trim()) return 'NPI ' + agency.npiNumber.trim() + (agency.isVerifiedRecord ? '' : ' (recorded)');
  return fire ? 'FDID not reported' : 'EMS ID not reported';
}

/** Scrub modeled contract values at the presentation boundary, not through a destructive database migration. */
export function withoutUnsubstantiatedProspectContract(agency: Agency, supported: boolean): Agency {
  if (!isGeographicProspect(agency) || supported) return agency;
  return {...agency, competitorContract:{...agency.competitorContract,
    vendor:'',contractEndDate:'',renewalWindowDays:0,annualServiceCostPerUnit:0,
    status:'Not reported',actionRecommendation:'Confirm contract terms with agency sources.',isVerifiedContract:false}};
}

/** Origin evidence supports identity, not operational fields. */
export function requiresAgencyFieldEvidence(agency:Agency):boolean {
 return isGeographicProspect(agency)||!!agency.registryIdentity;
}
export function canBulkHydrateAgency(agency:Agency):boolean {
 return !isGeographicProspect(agency)&&!!agency.registryIdentity&&canCreateRegistryAccount(agency.registryIdentity)&&registryAccountId(agency.registryIdentity)===agency.id;
}
