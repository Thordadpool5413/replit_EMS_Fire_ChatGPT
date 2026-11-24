import { isGeographicProspect, isGeneratedFdid } from '../utils/providerRecordTrust';
import type {Agency} from '../types';
export interface IdentityLink {key:string;agencyId:string;agencyName:string;basis:string;reviewedAt?:string;sourceUrl?:string}
/** Read-only index: sharing an identifier is a review flag, never an automatic merge. */
export function buildAgencyIdentityIndex(agencies:Agency[]) {
 const links:IdentityLink[]=[]; const byLink=new Map<string,IdentityLink>(); const linkedAgencies=new Set<string>();
 for(const a of agencies){
  const add=(key:string,basis:string,reviewedAt?:string,sourceUrl?:string)=>{const unique=JSON.stringify([key,a.id]);if(!byLink.has(unique)){const link={key,agencyId:a.id,agencyName:a.name,basis,reviewedAt,sourceUrl};links.push(link);byLink.set(unique,link);linkedAgencies.add(a.id);}};
  const generated=isGeographicProspect(a);
  if(!generated){
   if(/^\d{10}$/.test(a.npiNumber??''))add(`NPI:${a.npiNumber}`,'Recorded identifier; association needs review');
   if(a.fdid?.trim()&&a.stateCode&&!isGeneratedFdid(a.fdid,a))add(`FDID:${a.stateCode.toUpperCase()}:${a.fdid.trim().toUpperCase()}`,'Recorded identifier; association needs review');
   if(a.stateLicenseNumber?.trim()&&a.stateCode)add(`LICENSE:${a.stateCode.toUpperCase()}:${a.stateLicenseNumber.trim().toUpperCase()}`,'Recorded identifier; association needs review');
  }
  for(const association of a.sourceRecordAssociations??[]){
   if(association.decision!=='confirmed')continue;
   const name=association.sourceName.toUpperCase();const id=association.sourceRecordId.trim();
   if(/USFA|NFDR/.test(name)&&isGeneratedFdid(id,a))continue;
   const key=/NPPES|NPI/.test(name)&&/^\d{10}$/.test(id)?`NPI:${id}`:/USFA/.test(name)?`FDID:${a.stateCode.toUpperCase()}:${id.toUpperCase()}`:`SOURCE:${name}:${id}`;
   // A reviewed association upgrades the same link rather than duplicating it.
   const existing=byLink.get(JSON.stringify([key,a.id]));
   if(existing){existing.basis=association.matchBasis;existing.reviewedAt=association.decidedAt;existing.sourceUrl=association.sourceUrl;}
   else add(key,association.matchBasis,association.decidedAt,association.sourceUrl);
  }
 }
 const grouped=new Map<string,IdentityLink[]>();for(const link of links)grouped.set(link.key,[...(grouped.get(link.key)??[]),link]);
 return {links,conflicts:[...grouped].filter(([,items])=>items.length>1).map(([key,items])=>({key,items})),unlinked:agencies.filter(a=>!linkedAgencies.has(a.id)).length};
}
