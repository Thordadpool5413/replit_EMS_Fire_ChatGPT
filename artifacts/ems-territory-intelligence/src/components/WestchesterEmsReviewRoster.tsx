import { providerProfileHref } from '../navigation/providerProfileUrl';
import React,{useEffect,useMemo,useState} from 'react';
import {loadWestchesterCatalog,type WestchesterReviewCatalog} from '../services/westchesterEmsReview';
export function WestchesterEmsReviewRoster({countySelected=false}:{countySelected?:boolean}){
 const [data,setData]=useState<WestchesterReviewCatalog|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{let active=true;setError('');loadWestchesterCatalog().then(x=>{if(active)setData(x)}).catch(()=>{if(active)setError('Regional source evidence unavailable')});return()=>{active=false}},[attempt]);
 const matches=useMemo(()=>(data?.records??[]).filter(r=>query.toLowerCase().trim().split(/\s+/).every(w=>[r.name,r.agencyCodeAsReported,r.headquartersStreetAsReported,r.cityAsReported,r.stateAsReported,r.postalCodeAsReported].join(' ').toLowerCase().includes(w))),[data,query]);
 const current=Math.min(page,Math.max(1,Math.ceil(matches.length/8)));
 return <section className="space-y-3 min-w-0" data-testid="westchester-ems-review-roster">
 <h4 className="font-semibold">Westchester Regional EMS Council directory</h4>
 <p className="text-sm">Regional organization listings, not a statewide license roster. Headquarters addresses and agency codes are as reported. {countySelected?'The selected county does not filter this regional directory. ':''}No station or operating-location verification. Some organizations have headquarters outside the council region.</p>
 {error?<p role="alert">{error} <button type="button" className="workspace-button" onClick={()=>setAttempt(x=>x+1)}>Retry</button></p>:!data?<p role="status">Loading regional source evidence…</p>:<>
 <p className="text-xs">Retrieved {data.retrievedAt.slice(0,10)} UTC · source edition date not stated · 88 listings · 20 possible national registry matches. <a className="underline" href={data.sourceUrl} target="_blank" rel="noreferrer">Original council directory</a></p>
 <label className="block text-sm">Search regional listings<input className="block w-full border rounded p-2 bg-transparent" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Name, code, address or city"/></label>
 <p role="status" className="text-sm">{matches.length} source rows · not unique verified organizations</p>
 <ul className="divide-y">{matches.slice((current-1)*8,current*8).map(r=><li key={r.reviewKey} className="py-3 break-words text-sm"><a className="font-semibold underline underline-offset-2" href={providerProfileHref({state:'NY',source:'regional-ems',id:r.reviewKey})}>{r.name}</a><p>Agency code as reported: {r.agencyCodeAsReported??'Not reported'} · {r.agencyCodeStatus.replaceAll('-',' ')}</p>
 <p>Reported headquarters: {[r.headquartersStreetAsReported,r.cityAsReported,r.stateAsReported,r.postalCodeAsReported].filter(Boolean).join(', ')||'Not reported'}</p>
 {r.nationalReviewCandidates.length?<p>Possible national match: {r.nationalReviewCandidates[0].name} · {r.nationalReviewCandidates[0].sourceKey}. End-user identity review required.</p>:<p>No exact national comparison candidate in the snapshot.</p>}
 </li>)}</ul>{!matches.length&&<p>No matching source listing.</p>}
 <div className="flex flex-wrap gap-2 items-center"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {Math.max(1,Math.ceil(matches.length/8))}</span><button type="button" className="workspace-button" disabled={current*8>=matches.length} onClick={()=>setPage(current+1)}>Next</button></div></>}
 </section>;
}
