import React from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildReviewedRadar} from '../services/sharedOpportunityRadar';
import {sharedAgencyKey} from '../services/sharedEvidence';
import {buildIntelligenceCoverage} from '../services/intelligenceCoverage';
import {coverageLocation} from './profile/ProviderIntelligenceCoverage';
import {useLocationRevision} from '../services/providerLocation';
export function SelectedIntelligenceCoverage({agencies,selected,samples,onOpenAgency}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];onOpenAgency:(a:Agency)=>void}){
 useLocationRevision();const now=Date.now();
 const rows=selected.flatMap(id=>{const matches=agencies.filter(a=>a.id===id);if(matches.length!==1)return [];const a=matches[0],key=sharedAgencyKey(a);
 const found=samples.filter(s=>s.agencyId===id&&s.identityKey===key&&Number.isFinite(Date.parse(s.checkedAt))&&Date.parse(s.checkedAt)<=now&&now-Date.parse(s.checkedAt)<300000);
 const documents=found.length===1?buildReviewedRadar(a,found[0].rows,{complete:true,withheld:0},now):undefined;
 return [{a,coverage:buildIntelligenceCoverage(a,agencies,{location:coverageLocation(a,agencies),documents,documentStatus:documents?.complete?'checked':'unavailable',stationStatus:'not-checked',authorityStatus:'not-checked'},now)}];});
 return <details className="border rounded p-3 min-w-0"><summary className="font-semibold cursor-pointer">Selected territory intelligence coverage</summary><p className="text-xs mt-2">Same eight-category lower bound across selected accounts, based on loaded source locations, local documents and reviewed public-document samples. Station and authority evidence are not checked here; open each profile for those sources. No territory-wide extrapolation.</p>
 <ul className="divide-y">{rows.map(({a,coverage:c})=><li key={a.id} className="py-2 space-y-1 break-words"><p className="font-semibold">{a.name}</p><p>{c.documented}/{c.total} documented · {c.reviewed} reviewed · {c.unchecked} unchecked or review required</p><progress max={c.total} value={c.documented} className="w-full" aria-label={a.name+' categories with evidence'}/><button className="workspace-button min-h-11" type="button" onClick={()=>onOpenAgency(a)}>Open coverage in profile</button></li>)}</ul><p className="text-xs">{selected.length-rows.length} ambiguous loaded account IDs withheld.</p></details>;
}
