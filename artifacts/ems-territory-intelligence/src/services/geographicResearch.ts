import type {Agency} from '../types';
import type {AddressMatch} from './providerLocationContract';
import {isPhysicalStreet,addressText,addressMatchLabel} from './providerLocationContract';
import type {ProviderLocation} from './providerLocation';
import {providerIdentityReady} from './providerCompetitiveProfile';
import {buildReviewedAccountPriorities,type ReviewedSample,type RankedSignal} from './reviewedAccountPriorities';
import {buildCommercialQueue} from './commercialOpportunityQueue';
import type {OpportunityKind} from './opportunityRadar';
export type GeoPoint={lat:number;lng:number};
export type LocatedAccount={agency:Agency;identityKey:string;point:GeoPoint;address:string;sourceUrl:string;matchLabel:string;approximate:boolean;signals:RankedSignal[]};
export type GeoCluster={key:string;accounts:LocatedAccount[];diameterMiles:number};
export type ResolveLocation=(a:Agency,directory:Agency[])=>{location:ProviderLocation|undefined;match:AddressMatch|undefined};
export const DISTANCES=[10,25,50] as const;
export type Distance=typeof DISTANCES[number];
export function distanceMiles(a:GeoPoint,b:GeoPoint){
 const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lng-a.lng)*rad;
 const v=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
 return 3958.7613*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,v))));
}
const validPoint=(p:GeoPoint)=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180&&(p.lat!==0||p.lng!==0);
/** Deterministic complete-link grouping. No chain of adjacent points can create a cluster wider than the chosen distance. */
export function groupNearby(accounts:LocatedAccount[],radius:Distance):GeoCluster[]{
 if(!DISTANCES.includes(radius))return [];
 const groups:GeoCluster[]=[];
 for(const account of [...accounts].sort((a,b)=>a.identityKey.localeCompare(b.identityKey))){
  if(!validPoint(account.point))continue;
  const eligible=groups.flatMap(g=>{
   if(g.accounts.some(a=>a.agency.stateCode!==account.agency.stateCode))return [];
   const max=Math.max(...g.accounts.map(a=>distanceMiles(a.point,account.point)));
   return max<=radius?[{g,max}]:[];
  }).sort((a,b)=>a.max-b.max||a.g.key.localeCompare(b.g.key));
  if(eligible.length){const {g,max}=eligible[0];g.accounts.push(account);g.diameterMiles=Math.max(g.diameterMiles,max);}
  else groups.push({key:account.identityKey,accounts:[account],diameterMiles:0});
 }
 return groups.sort((a,b)=>b.accounts.length-a.accounts.length||a.key.localeCompare(b.key));
}
export function buildGeographicResearch(agencies:Agency[],selected:string[],samples:ReviewedSample[],resolve:ResolveLocation,radius:Distance=25,now=Date.now(),kind:OpportunityKind|'all'='all'){
 const ranked=buildReviewedAccountPriorities(agencies,selected,samples,now,'all');
 const commercial=buildCommercialQueue(agencies,selected,samples,now,365);
 const safeCommercial=new Set([...commercial.upcoming,...commercial.later,...commercial.funding,...commercial.awards].map(r=>JSON.stringify([r.identityKey,r.signal.signal.evidence.factId])));
 const located:LocatedAccount[]=[],unmapped:{agency:Agency;reason:string}[]=[],excluded:{agency:Agency;reason:string}[]=[];
 for(const r of ranked.ranked){
  if(!providerIdentityReady(r.agency,agencies)){excluded.push({agency:r.agency,reason:'Provider identity requires review'});continue;}
  const signals=r.signals.filter(s=>(kind==='all'||s.signal.kind===kind)&&(s.signal.kind==='competitor-equipment'||safeCommercial.has(JSON.stringify([r.identityKey,s.signal.evidence.factId]))));
  if(!signals.length){excluded.push({agency:r.agency,reason:'No eligible signal in selected view, or document conflict'});continue;}
  const {location,match}=resolve(r.agency,agencies);
  if(!location||location.identityKey!==r.identityKey||location.address.state!==r.agency.stateCode||!isPhysicalStreet(location.address.street)||!match||!validPoint({lat:match.latitude,lng:match.longitude})){
   unmapped.push({agency:r.agency,reason:'No accepted source-matched physical location'});continue;
  }
  located.push({agency:r.agency,identityKey:r.identityKey,point:{lat:match.latitude,lng:match.longitude},address:addressText(location.address),sourceUrl:location.sourceUrl,matchLabel:addressMatchLabel(match),approximate:match.method==='census-address-range',signals});
 }
 return {clusters:groupNearby(located,radius),located,unmapped,excluded,gaps:ranked.gaps,checked:ranked.checked,selected:selected.length,invalidScope:ranked.invalidScope};
}
