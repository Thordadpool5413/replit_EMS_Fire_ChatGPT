import React,{useEffect,useRef,useState} from 'react';
import {MapPin,Navigation} from 'lucide-react';
import type {Agency} from '../../types';
import {addressText,isPhysicalStreet} from '../../services/providerLocationContract';
import {canResearchProviderLocation,displayedProviderLocation,mappedProviderLocation,researchProviderLocation,locationDirections,useLocationRevision} from '../../services/providerLocation';
export function ProviderAddressLine({agency,directory,onReview}:{agency:Agency;directory:Agency[];onReview:()=>void}){
 useLocationRevision();
 const loc=displayedProviderLocation(agency,directory),pin=mappedProviderLocation(agency,directory),eligible=canResearchProviderLocation(agency,directory);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=useRef<AbortController|undefined>(undefined);
 async function run(geocode:boolean){
  request.current?.abort();const c=new AbortController();request.current=c;setBusy(true);setMessage('');
  try{const found=await researchProviderLocation(agency,directory,c.signal,geocode);if(c.signal.aborted)return;setMessage(!found?'No exact source address was returned. Review the registry record.':geocode?mappedProviderLocation(agency,directory)?'Address-range location added to this session’s agency map.':'No unique street match; no pin was placed.':'');}
  catch(e){if(!c.signal.aborted)setMessage(e instanceof Error?e.message:'Location source unavailable.');}
  finally{if(!c.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{if(eligible&&!loc)void run(false);return()=>request.current?.abort();},[agency.id,agency.registryIdentity,agency.sourceRecordAssociations,eligible]);
 const physical=loc&&isPhysicalStreet(loc.address.street);
 return <div className="acp-provider-location" data-testid="provider-address-line">
  <div className="acp-loc"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/><span>{loc?addressText(loc.address):[agency.city,agency.stateCode].filter(Boolean).join(', ')||'Location not reported'}</span></div>
  <p className="acp-address-note">{loc?<><a href={loc.sourceUrl} target="_blank" rel="noreferrer">{loc.sourceName}</a> · {loc.kind}{loc.sourceDate?' · '+loc.sourceDate:''}{pin?' · Approximate street-range map location':''}</>:busy?'Checking exact public registry identity…':'Street address not established from a linked source.'}</p>
  <div className="acp-address-actions">{physical&&<a href={locationDirections(loc)} target="_blank" rel="noreferrer" data-testid="link-header-directions"><Navigation size={14} aria-hidden="true"/>Directions</a>}{physical&&loc.address.zip&&loc.kind!=='source-reported address'&&!pin&&<button type="button" disabled={busy} onClick={()=>void run(true)}>Locate on agency map</button>}{!loc&&eligible&&!busy&&<button type="button" onClick={()=>void run(false)}>Retry address lookup</button>}{!loc&&!eligible&&<button type="button" onClick={onReview}>Review location sources</button>}</div>
  {message&&<p className="acp-address-note" role="status">{message}</p>}
 </div>;
}
