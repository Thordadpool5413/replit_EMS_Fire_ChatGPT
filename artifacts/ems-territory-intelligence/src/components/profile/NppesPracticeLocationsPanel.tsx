import React,{useEffect,useRef,useState} from 'react';
import type {Agency} from '../../types';
import {profileCmsLookupNpi} from '../../services/cmsAmbulanceEvidence';
import {loadNppesPracticeEvidence,loadNppesPracticeMap} from '../../services/nppesPracticeEvidence';
import type {NppesPracticeEvidence,NppesPracticeRow} from '../../services/nppesPracticeContract';
import {addressText,type AddressMatch} from '../../services/providerLocationContract';
import {loadMonthlySecondary,type MonthlySecondaryRow} from '../../services/nppesMonthlySecondary';
import {loadMonthlySecondaryGeocodes,type MonthlyGeocodeRow} from '../../services/nppesMonthlyGeocode';
function LocationRow({row,profileState}:{row:NppesPracticeRow;profileState:string}){
 const [match,setMatch]=useState<AddressMatch|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 async function locate(){
  pending.current?.abort();const c=new AbortController();pending.current=c;setBusy(true);setMessage('');setMatch(null);
  try{const m=await loadNppesPracticeMap(row.address,AbortSignal.any([c.signal,AbortSignal.timeout(22000)]));if(!c.signal.aborted){setMatch(m);setMessage(m?'Approximate Census street-range match only. Unit and station use are not verified.':'No unique public street-range match; no coordinates inferred.');}}
  catch{if(!c.signal.aborted)setMessage('Location API unavailable. Retry.');}
  finally{if(!c.signal.aborted)setBusy(false);}
 }
 return <li className="py-2 space-y-1 break-words"><strong>{row.kind==='primary-practice'?'Primary practice address':row.kind==='secondary-practice'?'Secondary practice address':'Mailing address (not a practice site)'}</strong><p>{addressText(row.address)}{row.address.state!==profileState?' · Different state from saved profile':''}</p>
 {row.physicalStreet&&row.address.zip&&<button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>void locate()}>{busy?'Locating…':'Find approximate street location'}</button>}
 {message&&<p role="status" className="text-xs">{message}</p>}
 {match&&<a className="underline" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(match.latitude+','+match.longitude)}>Open approximate address map</a>}
 </li>;
}
function StoredSecondaryPoint({evidence}:{evidence?:MonthlyGeocodeRow}){
 if(!evidence)return null;
 const point=evidence.sourceGeometry;
 if(!point)return <p className="text-xs">Stored Census lookup: no unique street match. A new live lookup remains available.</p>;
 return <div className="mt-1 text-xs space-y-1" data-testid="nppes-secondary-stored-point">
 <p className="font-semibold">Source-reported practice address · approximate Census location</p>
 <p>{point.matchedAddress} · {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</p>
 <p>Geocoder-reported county FIPS {evidence.censusCountyAsReported}. {evidence.sharedApproximatePoint?'Coordinate shared with another source row. ':''}Base-address estimate; unit, station and operating status not verified.</p>
 <a className="underline" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(point.latitude+','+point.longitude)}>Open stored approximate location in map</a>
 <p>Federal Census source · November 26, 2026 UTC. End-user validation required.</p>
 </div>;
}
function MonthlyLocations({npi,agency}:{npi:string;agency:Agency}){
 const [rows,setRows]=useState<MonthlySecondaryRow[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [geocodes,setGeocodes]=useState<MonthlyGeocodeRow[]>([]),[geoError,setGeoError]=useState('');
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function load(){
  setBusy(true);setError('');
  setGeoError('');setGeocodes([]);
  try{
   const result=await loadMonthlySecondary(npi);if(!active.current)return;setRows(result.rows);
   if(result.rows.length){
    try{const points=await loadMonthlySecondaryGeocodes(npi,result.rows);if(active.current)setGeocodes(points);}
    catch{if(active.current)setGeoError('Stored geographic evidence unavailable. Live address lookup is still available.');}
   }
  }
  catch{if(active.current)setError('Monthly federal location evidence unavailable. Live NPPES lookup is still available.');}
  finally{if(active.current)setBusy(false);}
 }
 return <section className="my-2 border rounded p-2 min-w-0 text-sm" data-testid="nppes-monthly-secondary">
 <h4 className="font-semibold">November 2026 federal secondary addresses</h4>
 <p>Monthly CMS release, independent of state licensing records. Additional practice locations are not confirmed stations.</p>
 <button className="workspace-button min-h-11" type="button" disabled={busy} onClick={()=>void load()}>{busy?'Loading monthly addresses…':rows?'Reload monthly addresses':'Show monthly secondary addresses'}</button>
 {error&&<p role="alert">{error}</p>}
 {geoError&&<p role="status" className="text-xs">{geoError}</p>}
 {rows&&<><p role="status">{rows.length} additional address {rows.length===1?'row':'rows'} in this scoped snapshot. {rows.length===0?'No listing is not proof of no additional sites.':''}</p>
 <p><a className="underline" href="https://download.cms.gov/nppes/NPI_Files.html" target="_blank" rel="noreferrer">Official CMS monthly reference file</a> · November 9, 2026 release.</p>
 {rows.length>0&&<p>Source organization: {rows[0].parentName} · NPI {npi}. Confirm the operating relationship before use.</p>}
 {geocodes.length>0&&<p className="text-xs">{geocodes.filter(g=>g.sourceGeometry).length} approximate Census address matches in this provider's monthly records. Not confirmed stations.</p>}
 <ul className="divide-y">{rows.map(r=><li key={r.sourceKey} className="py-2"><p className="text-xs">Source row {r.sourceRow}{r.sharedAddressAcrossNpis?' · Address shared across NPIs; not a merged agency':''}</p><ul><LocationRow row={{key:r.sourceKey,kind:'secondary-practice',address:r.address,physicalStreet:true,stationIdentityEstablished:false,endUserValidationRequired:true}} profileState={agency.stateCode}/></ul><StoredSecondaryPoint evidence={geocodes.find(g=>g.sourceKey===r.sourceKey)}/></li>)}</ul></>}
 </section>;
}
export function NppesPracticeLocationsPanel({agency}:{agency:Agency}){
 const npi=profileCmsLookupNpi(agency).npi;
 const [data,setData]=useState<NppesPracticeEvidence|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
 const request=useRef<AbortController|null>(null);
 useEffect(()=>{setData(null);setBusy(false);setError('');return()=>{request.current?.abort();request.current=null}},[agency.id,npi]);
 async function load(){
  if(!npi)return;request.current?.abort();const c=new AbortController();request.current=c;setData(null);setError('');setBusy(true);
  try{const result=await loadNppesPracticeEvidence(npi,AbortSignal.any([c.signal,AbortSignal.timeout(22000)]));if(request.current===c&&!c.signal.aborted){setData(result);setVersion(x=>x+1);}}
  catch{if(request.current===c&&!c.signal.aborted)setError('Federal NPPES location lookup unavailable. No addresses inferred.');}
  finally{if(request.current===c){setBusy(false);request.current=null;}}
 }
 if(!npi)return null;
 const current=data?.npi===npi?data:null;
 return <details className="acp-address-note min-w-0" data-testid="nppes-practice-locations"><summary className="cursor-pointer font-semibold">Federal NPI practice and mailing locations</summary>
 <p className="my-2">CMS NPPES organization NPI {npi}. No state licensing lookup required. Source-reported addresses are not confirmed operating stations or saved profile locations.</p>
 <button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>void load()}>{busy?'Loading…':current?'Refresh federal addresses':'Pull federal addresses'}</button>
 <MonthlyLocations key={agency.id+':'+npi} npi={npi} agency={agency}/>
 {error&&<p role="alert">{error}</p>}
 {current&&<><p><a className="underline" href={current.sourceUrl} target="_blank" rel="noreferrer">Official NPPES record</a> · Retrieved {current.retrievedAt.slice(0,10)} UTC{current.sourceDate?' · Registry updated '+current.sourceDate:''}.</p>
 {current.status!=='source-reported'?<p>No eligible active ambulance organization record returned for this NPI. No site inferred.</p>:<><p className="font-semibold">{current.organizationName}</p><p>Secondary practice collection: {current.secondaryCollection==='reported'?'returned by CMS':'not returned; completeness unknown'}. {current.withheldAddressCount?current.withheldAddressCount+' duplicate, conflicting or unsupported address entries withheld.':''}</p>
 {!current.rows.length?<p>No usable US address rows returned.</p>:<ul className="divide-y">{current.rows.map(r=><LocationRow key={version+':'+r.key} row={r} profileState={agency.stateCode}/>)}</ul>}</>}
 <p>End-user validation required. An NPI does not establish licensure or a current operating relationship. No saved profile address, station or national map pin is changed.</p></>}
 </details>;
}
