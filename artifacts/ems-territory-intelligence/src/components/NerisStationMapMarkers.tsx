import React,{useState} from 'react';
import {AdvancedMarker,InfoWindow} from '@vis.gl/react-google-maps';
import type {Agency} from '../types';
import {nerisObjectUrl} from '../services/nerisStationCatalog';
import {linkedNerisAccount,type NerisMapGroup,type NerisMapRow} from '../services/nerisStationMap';
import {NerisDepartmentStations} from './profile/NerisDepartmentStations';
export function NerisMapStationDetails({station:s,countyNames,agencies,onOpen}:{station:NerisMapRow;countyNames:Record<string,string>;agencies:Agency[];onOpen:(a:Agency)=>void}){
 const account=linkedNerisAccount(s.parentId,agencies);
 return <div className="space-y-1 py-2 break-words text-sm">
  <strong>{s.name||'Unnamed station source record'}</strong><p>{s.parentName}</p>
  <p>{s.address.filter(Boolean).join(', ')}</p><p>Station {s.id} · Parent {s.parentId}</p>
  {s.countyFips?<p>{countyNames[s.countyFips]??s.countyFips} · Derived point geography, not service territory.</p>:<p>County not established from bundled boundaries.</p>}
  {s.address[3]!==s.parentState&&<p>Parent department is registered in {s.parentState}.</p>}
  {s.sharedPoint&&<p>Shared source coordinate; station identities remain separate.</p>}
  {s.coordinates&&<a className="underline block" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.coordinates.join(','))} target="_blank" rel="noreferrer">Open source location</a>}
  <a className="underline block" href={nerisObjectUrl(1,s.oid)} target="_blank" rel="noreferrer">Original station GIS record</a>
  {account&&<button className="workspace-button min-h-11" type="button" onClick={()=>onOpen(account)}>Open linked parent account</button>}
  <NerisDepartmentStations key={s.parentId} id={s.parentId}/>
 </div>;
}
export function NerisStationMapMarkers({groups,countyNames,agencies,onOpen}:{groups:NerisMapGroup[];countyNames:Record<string,string>;agencies:Agency[];onOpen:(a:Agency)=>void}){
 const [selected,setSelected]=useState<string>();
 const group=groups.find(g=>g.key===selected);
 return <>
  {groups.map(g=><AdvancedMarker key={g.key} position={{lat:g.lat,lng:g.lng}} title={g.rows.length===1?(g.rows[0].name||g.rows[0].parentName)+' · NERIS station source record':g.rows.length+' NERIS station records at one source point'} onClick={()=>setSelected(g.key)} zIndex={selected===g.key?1200:500}>
    <span className={`neris-map-dot${selected===g.key?' is-selected':''}`} aria-hidden="true">
     {g.rows.length>1?g.rows.length:''}
    </span>
  </AdvancedMarker>)}
 {group&&<InfoWindow position={{lat:group.lat,lng:group.lng}} onCloseClick={()=>setSelected(undefined)}><div style={{maxWidth:280,maxHeight:350,overflowY:'auto',color:'#14283f',overflowWrap:'anywhere'}}><strong>Federal NERIS station locations</strong><p className="text-xs">Source-reported points; not confirmed current operating stations. End-user validation required.</p><ul className="divide-y">{group.rows.map(s=><li key={s.id}><NerisMapStationDetails station={s} countyNames={countyNames} agencies={agencies} onOpen={onOpen}/></li>)}</ul></div></InfoWindow>}
 </>;
}
