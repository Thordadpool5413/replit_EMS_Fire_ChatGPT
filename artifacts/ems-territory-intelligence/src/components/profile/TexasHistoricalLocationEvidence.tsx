import React,{useEffect,useState} from 'react';
import type {Agency} from '../../types';
import {loadTexasLocationCatalog,texasLocationProfileCandidates,type TexasLocationCandidate,type TexasLocationCatalog} from '../../services/texasLocationReview';
function HistoricalLocations({rows,sourceUrl,comparison=false}:{rows:TexasLocationCandidate[];sourceUrl:string;comparison?:boolean}){
 if(!rows.length)return null;
 return <details className="min-w-0 border rounded p-3 text-sm" data-testid="texas-historical-location-evidence"><summary className="font-semibold cursor-pointer">Texas historical location evidence · {rows.length} {rows.length===1?'candidate':'candidates'}</summary>
 <p className="mt-2">September 2025 source. {comparison?'Possible cross-registry organization match only. ':''}Not a verified station, headquarters, current operating location, or map pin. Validate directly with the organization.</p>
 <ul>{rows.map(r=><li key={r.sourceKey} className="py-2 border-b break-words"><strong>{r.parentName}</strong><p>DSHS parent license {r.parentIdentifier} · GIS object {r.objectId} (not a station ID)</p><p>{r.reportedAddress.street}, {r.reportedAddress.city}, {r.reportedAddress.state} {r.reportedAddress.zip}</p><p>Source match: {r.matchedAddress} · point-address score {r.score}/100</p><p>Historical coordinates: {r.sourceGeometry.latitude.toFixed(5)}, {r.sourceGeometry.longitude.toFixed(5)}</p><a className="underline text-xs" target="_blank" rel="noreferrer" href={sourceUrl+'/query?where=ObjectID%3D'+r.objectId+'&outFields=ObjectID%2CIN_Address%2CIN_City%2CIN_Region%2CIN_Postal%2CUSER_License_Number%2CUSER_Primary_Name%2CScore%2CAddr_type&returnGeometry=true&outSR=4326&f=pjson'}>Inspect original GIS object</a></li>)}</ul>
 </details>;
}
export function TexasRosterLocationEvidence({catalog,parentKey}:{catalog:TexasLocationCatalog|null;parentKey:string}){
 return catalog?<HistoricalLocations rows={catalog.candidates.filter(c=>c.parentReviewKey===parentKey)} sourceUrl={catalog.sourceUrl}/>:null;
}
export function TexasProfileLocationEvidence({agency,directory}:{agency:Agency;directory:Agency[]}){
 const [catalog,setCatalog]=useState<TexasLocationCatalog|null>(null),[failed,setFailed]=useState(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{if(agency.stateCode!=='TX'||!agency.registryIdentity)return;let active=true;setFailed(false);loadTexasLocationCatalog().then(x=>{if(active)setCatalog(x)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[agency.stateCode,agency.registryIdentity,attempt]);
 if(agency.stateCode!=='TX'||!agency.registryIdentity)return null;
 if(failed)return <p className="text-xs">Texas historical location evidence unavailable. <button type="button" className="underline" onClick={()=>setAttempt(x=>x+1)}>Retry</button></p>;
 return catalog?<HistoricalLocations rows={texasLocationProfileCandidates(agency,directory,catalog)} sourceUrl={catalog.sourceUrl} comparison/>:null;
}
