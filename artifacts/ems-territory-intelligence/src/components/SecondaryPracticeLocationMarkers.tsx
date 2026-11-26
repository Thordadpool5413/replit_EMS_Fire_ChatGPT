import React,{useState} from 'react';
import {AdvancedMarker,InfoWindow} from '@vis.gl/react-google-maps';
import {addressText} from '../services/providerLocationContract';
import type {SecondaryPointGroup} from '../services/nppesSecondaryDiscovery';
export function SecondaryPracticeLocationMarkers({groups,countyNames}:{groups:SecondaryPointGroup[];countyNames:Record<string,string>}){
 const [selected,setSelected]=useState<string>();
 const group=groups.find(g=>g.key===selected);
 return <>
 {groups.map(g=><AdvancedMarker key={g.key} position={{lat:g.lat,lng:g.lng}} title={g.rows.length===1?g.rows[0].source.parentName+' · approximate secondary practice address':g.rows.length+' secondary address records at one approximate point'} onClick={()=>setSelected(g.key)}>
  <span style={{display:'flex',alignItems:'center',justifyContent:'center',minWidth:20,height:20,padding:'0 3px',border:'2px solid white',borderRadius:5,background:'#6d28d9',color:'#fff',fontSize:10,fontWeight:700,boxShadow:'0 1px 4px #0005'}}>{g.rows.length>1?g.rows.length:'S'}</span>
 </AdvancedMarker>)}
 {group&&<InfoWindow position={{lat:group.lat,lng:group.lng}} onCloseClick={()=>setSelected(undefined)}><div style={{maxWidth:270,color:'#14283f',fontSize:13,overflowWrap:'anywhere',maxHeight:300,overflowY:'auto'}}>
  <strong>Secondary practice address evidence</strong><p>Approximate Census street-range location. Not a verified station, saved account or primary address.</p>
  <ul className="divide-y">{group.rows.map(r=><li key={r.source.sourceKey} className="py-2">
  <strong>{r.source.parentName}</strong><p>{addressText(r.source.address)}</p><p>{countyNames[r.countyFips]??r.countyFips} · address geography only.</p><p>NPI {r.source.parentNpi} · Parent registry state {r.source.parentState}{r.source.crossState?' · Cross-state address':''}.</p>
  {r.sharedApproximatePoint&&<p>Coordinate shared with another source record; identities remain separate.</p>}
  <a href={'https://npiregistry.cms.hhs.gov/provider-view/'+r.source.parentNpi} target="_blank" rel="noreferrer">Federal parent record</a>
  </li>)}</ul><p><a href="https://download.cms.gov/nppes/NPI_Files.html" target="_blank" rel="noreferrer">November 2026 CMS source</a> · End-user validation required.</p>
 </div></InfoWindow>}
 </>;
}
