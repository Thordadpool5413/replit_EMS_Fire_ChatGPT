import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {MapPin,ExternalLink} from 'lucide-react';
import type {Agency} from '../../types';
import {FacilityFieldNotes} from './FacilityFieldNotes';
import {FacilityEquipment} from './FacilityEquipment';
import {FacilitySourceMap} from './FacilitySourceMap';
import {facilityParents,facilityDirections,type FacilityParent,type FacilityResult} from '../../services/departmentFacilities';
function SourceFacilities({parent,agencyId}:{parent:FacilityParent;agencyId:string}){
 const [expanded,setExpanded]=useState(false);
 const query=useQuery({queryKey:['public-department-facilities',parent.source,parent.stateCode,parent.identifier],enabled:expanded,retry:false,staleTime:30*60*1000,queryFn:async({signal}):Promise<FacilityResult>=>{
  const response=await fetch('/api/fire-registry/facilities?'+new URLSearchParams(parent),{signal,cache:'no-store'});
  if(!response.ok)throw Error('Facility source unavailable.');
  const data=await response.json() as FacilityResult;
  if(data.parent?.identifier!==parent.identifier||data.parent?.stateCode!==parent.stateCode||data.parent?.source!==parent.source||!Array.isArray(data.facilities))throw Error('Unexpected facility response.');
  return data;
 }});
 return <div className="border-t border-slate-200 py-2 dark:border-slate-700">
  <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-xs font-semibold"><span>{parent.source} · {parent.identifier}</span><span>{expanded?'Hide':'View facilities'}</span></button>
  {expanded&&<div className="space-y-2 text-xs">
   {query.isFetching&&<p role="status">Retrieving source-reported station records…</p>}
   {query.isError&&<p role="status">Facility source unavailable. <button type="button" onClick={()=>void query.refetch()} className="underline">Retry</button></p>}
   {query.data&&<>
    <p>{query.data.facilities.length} source rows displayed{query.data.reportedStationCount!==null?' · '+query.data.reportedStationCount+' stations reported by parent source':''}. Not a count of independently confirmed active stations.</p>
    {query.data.warning&&<p role="status">{query.data.warning}</p>}
    {query.data.withheld>0&&<p>{query.data.withheld} duplicate, incomplete or excess rows withheld.</p>}
    {!query.data.facilities.length&&<p>No station records returned by this source. This does not mean the department has no stations.</p>}
    <FacilitySourceMap facilities={query.data.facilities}/>
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{query.data.facilities.map((f,i)=>{
     const link=facilityDirections(f);
     return <li key={f.sourceRecordId??i} className="py-2 min-w-0">
      <p className="font-semibold break-words">{f.name??'Station name not reported'}</p>
      <p className="break-words">{[f.address,f.city,f.stateCode,f.postalCode].filter(Boolean).join(', ')||'Address not reported'}</p>
      <p className="text-slate-500 dark:text-slate-400">{f.sourceRecordId?'Station ID '+f.sourceRecordId:'No native station ID reported'} · End-user validation required</p>
      {f.coordinates&&<p className="text-slate-500 dark:text-slate-400">Source-reported point: {f.coordinates.latitude.toFixed(5)}, {f.coordinates.longitude.toFixed(5)} (not field verified)</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
       <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 underline"><ExternalLink className="h-3 w-3"/>Source</a>
       {link&&<a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 underline"><MapPin className="h-3 w-3"/>Open address</a>}
      </div>
      {f.source==='NERIS'&&f.sourceRecordId&&<><FacilityFieldNotes agencyId={agencyId} parentId={parent.identifier} stationId={f.sourceRecordId}/><FacilityEquipment agencyId={agencyId} parentId={parent.identifier} stationId={f.sourceRecordId}/></>}
     </li>;
    })}</ul>
   </>}
  </div>}
 </div>;
}
export function DepartmentFacilities({agency,onReview}:{agency:Agency;onReview:()=>void}){
 const parents=facilityParents(agency);
 return <section data-testid="department-facilities" className="pi-surface p-3 text-slate-800 dark:text-slate-200">
  <h3 className="text-sm font-semibold">Operating facilities</h3>
  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Station records are separate from the department’s registry address. Verify each location before visiting. Sources may overlap; counts are not combined.</p>
  {parents.length?parents.map(p=><SourceFacilities key={p.source+':'+p.identifier} parent={p} agencyId={agency.id}/>):<div className="mt-2 text-xs"><p>No unambiguous supported fire registry identity is attached. EMS-only station coverage is not yet available from this lookup.</p><button type="button" onClick={onReview} className="workspace-button min-h-11">Review source identities</button></div>}
 </section>;
}
