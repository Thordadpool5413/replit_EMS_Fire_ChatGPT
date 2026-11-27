import { providerProfileHref } from '../navigation/providerProfileUrl';
import React,{useEffect,useMemo,useState} from 'react';
import {loadTexasReviewRoster,type TexasReviewCatalog,type TexasRosterKind} from '../services/texasEmsReviewRoster';
import {loadTexasLocationCatalog,type TexasLocationCatalog} from '../services/texasLocationReview';
import {TexasRosterLocationEvidence} from './profile/TexasHistoricalLocationEvidence';
export function TexasEmsReviewRoster({countySelected=false}:{countySelected?:boolean}){
 const [data,setData]=useState<TexasReviewCatalog|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[query,setQuery]=useState(''),[kind,setKind]=useState<'all'|TexasRosterKind>('all'),[page,setPage]=useState(1);
 useEffect(()=>{let active=true;setError('');loadTexasReviewRoster().then(x=>{if(active)setData(x)}).catch(e=>{if(active)setError(String(e.message??e))});return()=>{active=false}},[attempt]);
 const [locations,setLocations]=useState<TexasLocationCatalog|null>(null),[locationError,setLocationError]=useState(false);
 useEffect(()=>{let active=true;setLocationError(false);loadTexasLocationCatalog().then(x=>{if(active)setLocations(x)}).catch(()=>{if(active)setLocationError(true)});return()=>{active=false}},[attempt]);
 const matches=useMemo(()=>(data?.records??[]).filter(r=>(kind==='all'||r.rosterKind===kind)&&query.toLowerCase().trim().split(/\s+/).every(w=>[r.identifier,r.name,r.dbaName,r.city,r.state,r.zip,r.mailingCounty].join(' ').toLowerCase().includes(w))),[data,query,kind]);
 const current=Math.min(page,Math.max(1,Math.ceil(matches.length/8)));
 return <section className="space-y-3 min-w-0" aria-label="Texas state EMS roster review" data-testid="texas-ems-review-roster">
 <h4 className="font-semibold">Texas DSHS provider and first-responder rosters</h4>
 <p className="text-sm">Government organization records for review. Addresses and counties are mailing information, not verified operating locations. Station counts are source-reported aggregates, not mapped stations. {countySelected?'The selected county does not limit this state-issued roster. ':''}Verify current status and identity before use.</p>
 {error?<p role="alert">{error} <button className="workspace-button" type="button" onClick={()=>setAttempt(x=>x+1)}>Retry</button></p>:!data?<p role="status">Loading Texas source evidence…</p>:<>
 <p className="text-xs">Retrieved {data.retrievedAt} (UTC) · source edition date not stated · 743 provider and 643 first-responder records. <a className="underline" href={data.referenceUrl} target="_blank" rel="noreferrer">Official DSHS sources</a></p>
 {locations&&<p className="text-xs">Historical GIS research: {locations.sourceFeatureCount} source features, {locations.candidates.length} location review candidates, 0 verified stations.</p>}{locationError&&<p className="text-xs">Historical location evidence unavailable. <button type="button" className="underline" onClick={()=>setAttempt(x=>x+1)}>Retry</button></p>}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
 <label className="block text-sm">Search Texas roster<input aria-label="Search Texas roster" className="block w-full min-w-0 border rounded p-2 bg-transparent text-base" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Name, identifier, mailing city or ZIP"/></label>
 <label className="block text-sm">Roster<select className="block w-full min-w-0 border rounded p-2 bg-transparent" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setPage(1)}}><option value="all">Both rosters</option><option value="provider">EMS providers</option><option value="first-responder">First-responder organizations</option></select></label>
 </div><p role="status" className="text-sm">{matches.length.toLocaleString()} matching source records · not unique saved agencies</p>
 {!matches.length&&<p>No matching source listing. This does not establish absence of service.</p>}
 <ul>{matches.slice((current-1)*8,current*8).map(r=><li key={r.sourceKey} className="py-3 border-b text-sm break-words"><a className="font-semibold underline underline-offset-2" href={providerProfileHref({state:'TX',source:'regional-ems',id:r.sourceKey})}>{r.name}</a>{r.dbaName&&<p>DBA: {r.dbaName}</p>}
 <p>{r.rosterKind==='provider'?'EMS provider license':'First-responder registration'} {r.identifier} · {r.status} (source-reported){r.secondaryStatus?' · '+r.secondaryStatus:''}</p>
 <p>First licensure: {r.issuedOn??'Not reported'} · expiration: {r.expiresOn??'Not reported'}</p>{r.licenseDateConflict&&<p className="font-semibold">Source date contradiction — validate with DSHS.</p>}
 <p>Mailing address: {[r.addressAsReported,r.mailingAddress2,r.city,r.state,r.zip].filter(Boolean).join(', ')||'Not reported'}</p><p>Mailing county: {r.mailingCounty??'Not reported'}{r.state!=='TX'?' · Out-of-state mailing location':''}</p>
 <p>Reported station count: {r.stationCountAsReported} (no individual station locations)</p>
 <p>{r.nationalReviewCandidates.length?r.nationalReviewCandidates.length+' possible national registry match(es) — review required':'No exact name and mailing-city/ZIP comparison match'}</p>
 {r.nationalReviewCandidates.length>0&&<ul className="pl-3">{r.nationalReviewCandidates.map(c=><li key={c.sourceKey}>{c.name} · {c.sourceKey} · {c.basis.join(' / ')} + mailing city/ZIP</li>)}</ul>}
 <TexasRosterLocationEvidence catalog={locations} parentKey={r.sourceKey}/>
 <a className="underline text-xs" href={data.sources[r.rosterKind].sourceUrl} target="_blank" rel="noreferrer">Official roster workbook</a>
 </li>)}</ul><div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {Math.max(1,Math.ceil(matches.length/8))}</span><button type="button" className="workspace-button" disabled={current*8>=matches.length} onClick={()=>setPage(current+1)}>Next</button></div></>}
 </section>;
}
