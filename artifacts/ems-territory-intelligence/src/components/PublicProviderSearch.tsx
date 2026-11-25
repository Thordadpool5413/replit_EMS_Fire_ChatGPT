import React,{useEffect,useMemo,useState} from 'react';
import type {Agency,AgencySourceRecordAssociation} from '../types';
import {useNationalSourceDirectory} from '../hooks/useNationalSourceDirectory';
import {searchPublicProviders,type PublicSearchScope,type PublicSearchResult} from '../services/publicProviderSearch';
import {listingLocation,enrichRegistryRow,loadNationalLocationState,LISTING_LOCATION_LABELS,type LocationState} from '../services/nationalLocationSnapshot';
import {addressText,isPhysicalStreet,addressMatchLabel} from '../services/providerLocationContract';
import {snapshotRegistryIdentity,registryIdentifierText} from '../services/registryAccountLink';
import {RegistryAccountReview} from './RegistryAccountReview';
const empty:PublicSearchResult={records:[],failedStates:[],locationUnavailable:false,statesSearched:0};
export function PublicProviderSearch({scope,countyUnresolved=false,agencies,onState,onOpen,onCreate,onDecide}:{scope:PublicSearchScope;countyUnresolved?:boolean;agencies:Agency[];onState:(state:string)=>void;onOpen:(a:Agency)=>void;onCreate?:(a:Agency)=>void|Promise<void>;onDecide?:(id:string,a:AgencySourceRecordAssociation)=>void}){
 const {manifest,error:manifestError,retry:retryManifest}=useNationalSourceDirectory();
 const [result,setResult]=useState<PublicSearchResult>(empty),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[page,setPage]=useState(0);
 const [locations,setLocations]=useState<Record<string,LocationState|undefined>>({});
 const [details,setDetails]=useState<string>();
 const ready=scope.state!=='all'||scope.query.trim().length>=2||scope.zip.trim().length>=3;
 const blocked=countyUnresolved;
 useEffect(()=>{
  const abort=new AbortController();
  setResult(empty);setPage(0);setDetails(undefined);setError('');
  if(!manifest||!ready||blocked){setBusy(false);return;}
  setBusy(true);
  const timer=setTimeout(()=>searchPublicProviders(manifest,scope,abort.signal).then(data=>{if(!abort.signal.aborted)setResult(data);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Public provider search failed.');}).finally(()=>{if(!abort.signal.aborted)setBusy(false);}),180);
  return()=>{clearTimeout(timer);abort.abort();};
 },[manifest,ready,blocked,scope.state,scope.countyFips,scope.city,scope.zip,scope.category,scope.query,attempt]);
 const current=Math.min(page,Math.max(0,Math.ceil(result.records.length/8)-1));
 const visible=useMemo(()=>result.records.slice(current*8,(current+1)*8),[result.records,current]);
 const states=useMemo(()=>[...new Set(visible.map(r=>r[3]))].sort().join(','),[visible]);
 useEffect(()=>{
  let active=true;if(!states)return;
  void Promise.all(states.split(',').map(async state=>[state,await loadNationalLocationState(state)] as const)).then(entries=>{if(active)setLocations(old=>({...old,...Object.fromEntries(entries)}));});
  return()=>{active=false;};
 },[states,attempt]);
 const incomplete=result.failedStates.length>0||result.locationUnavailable;
 return <section className="pi-surface p-3 space-y-3 min-w-0" data-testid="public-provider-search" aria-label="Public provider results">
  <div><h2 className="font-semibold">Public EMS and fire directory</h2><p className="text-sm">Official registry listings. Available independently of saved-account synchronization. Review each provider before treating source data as confirmed.</p></div>
  {manifest&&<p className="text-xs">{manifest.statesAndDcRecords.toLocaleString()} registry listings across 50 states and D.C. Not a unique operating-agency count.</p>}
  <label className="block text-sm">Browse state<select aria-label="Public provider state" className="block border rounded p-2 bg-transparent max-w-full" value={scope.state} onChange={e=>onState(e.target.value)}><option value="all">All states (search by name, city, ZIP or ID)</option>{Object.entries(manifest?.stateNames??{}).filter(([code])=>Object.hasOwn(manifest?.byState??{},code)).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
  {!manifest&&!manifestError&&<p role="status">Loading public registry index…</p>}
  {blocked&&<p role="alert">County selection could not be resolved. Select the county again; no broader results are substituted.</p>}
  {!ready&&!blocked&&manifest&&<p className="text-sm">Choose a state to browse its providers, or enter a name, city, ZIP or registry identifier above to search nationwide.</p>}
  {(manifestError||error||incomplete)&&<div role="alert" className="workspace-data-status pi-status-warning"><span>{manifestError||error||(result.failedStates.length?'Partial results: '+result.failedStates.join(', ')+' could not be loaded.':'Location data unavailable; the recorded directory is still searchable. County/coordinate coverage may be incomplete.')}</span><button className="workspace-button" type="button" onClick={()=>{retryManifest();setAttempt(n=>n+1);}}>Retry public records</button></div>}
  {busy&&<p role="status">Searching source records…</p>}
  {!busy&&ready&&!blocked&&manifest&&!error&&<p role="status" data-testid="public-provider-count">{result.records.length.toLocaleString()} matching public listings{incomplete?' (partial coverage)':''} · {result.statesSearched} state/DC {result.statesSearched===1?'directory':'directories'} checked. Equipment and operating status require validation.</p>}
  {!busy&&ready&&result.records.length===0&&!incomplete&&!error&&manifest&&!blocked&&<p className="text-sm">No matching listing in the searched snapshot. Review the search and geography; absence does not establish that a provider does not exist.</p>}
  <ul className="space-y-2">{visible.map(raw=>{
   const stateLocations=locations[raw[3]],row=enrichRegistryRow(raw,stateLocations),loc=listingLocation(raw,stateLocations);
   const identity=snapshotRegistryIdentity(row,row[1]==='USFA'?manifest?.sources.USFA.retrievedAt:manifest?.sources.NPPES.reportingPeriod);
   const sourceUrl=row[1]==='USFA'?'https://apps.usfa.fema.gov/registry/search':row[11];
   return <li key={raw[0]} className="border rounded-lg p-3 space-y-1 min-w-0 break-words" data-testid="public-provider-result">
    <strong className="block">{row[2]}</strong>
    <p className="text-sm">{loc.address?addressText(loc.address):[row[4],row[3],row[5]].filter(Boolean).join(' ')}{!loc.address&&!stateLocations?' · address data loading or unavailable':''}</p>
    <p className="text-xs">{registryIdentifierText(row)} · {row[1]==='USFA'?'USFA fire registry':'CMS NPPES'} · {stateLocations?LISTING_LOCATION_LABELS[loc.status]:'Location snapshot not loaded'}</p>
    <button className="workspace-button min-h-11" type="button" aria-expanded={details===raw[0]} onClick={()=>setDetails(details===raw[0]?undefined:raw[0])}>{details===raw[0]?'Close provider profile':'View provider profile'}</button>
    {details===raw[0]&&<div className="border-t pt-2 space-y-2" data-testid="public-provider-profile"><p className="text-sm font-semibold">End-user validation required</p><p className="text-xs">Source-reported identity, not a confirmed operating station. Equipment, decision-makers, purchasing and service volumes: not reported by this registry.</p>
     <p className="text-xs">{row[6]?manifest?.countyNames[row[6]]||row[6]:'County not established'} · {loc.match?addressMatchLabel(loc.match):'No accepted map coordinates'}</p>
     {loc.officialAddressEvidence&&<p className="text-xs"><a className="underline" href={loc.officialAddressEvidence.sourceUrl} target="_blank" rel="noreferrer">{loc.officialAddressEvidence.authority}</a> · checked {loc.officialAddressEvidence.checkedAt}</p>}
     <div className="flex flex-wrap gap-3 text-sm"><a className="underline" href={sourceUrl} target="_blank" rel="noreferrer">Original source</a>{loc.address&&isPhysicalStreet(loc.address.street)&&loc.status!=='historical'&&loc.status!=='review'&&<a className="underline" href={'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(addressText(loc.address))} target="_blank" rel="noreferrer">Directions</a>}{loc.match&&<a className="underline" href={'https://www.google.com/maps/search/?api=1&query='+loc.match.latitude+','+loc.match.longitude} target="_blank" rel="noreferrer">View mapped point</a>}</div>
     {identity?<RegistryAccountReview identity={{...identity,countyName:identity.countyFips?manifest?.countyNames[identity.countyFips]:undefined}} agencies={agencies} onOpen={onOpen} onCreate={onCreate} onDecide={onDecide}/>:<p className="text-xs">Official identity missing; review before creating an account.</p>}
    </div>}
   </li>;
  })}</ul>
  {result.records.length>8&&<div className="flex flex-wrap items-center gap-2"><button className="workspace-button" disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><span className="text-xs">Page {current+1} of {Math.ceil(result.records.length/8)}</span><button className="workspace-button" disabled={(current+1)*8>=result.records.length} onClick={()=>setPage(current+1)}>Next</button></div>}
 </section>;
}
