import React,{useState} from 'react';
import {AdvancedMarker,InfoWindow} from '@vis.gl/react-google-maps';
import {addressText,addressMatchLabel,addressPointSource} from '../services/providerLocationContract';
import {primaryAssociationLabel,snapshotSourceUrl,type SnapshotLocation} from '../services/nationalLocationSnapshot';
export function PublicRegistryLocationMarkers({rows}:{rows:SnapshotLocation[]}){
 const [selected,setSelected]=useState<string>();
 const e=rows.find(r=>r.key===selected),pointSource=e?.match&&addressPointSource(e.match);
 return <>{rows.map(r=>r.match&&<AdvancedMarker key={r.key} position={{lat:r.match.latitude,lng:r.match.longitude}} title={r.name+' · source-matched address'} onClick={()=>setSelected(r.key)}><span style={{display:'block',width:15,height:15,border:'2px solid white',borderRadius:'50%',background:'#0f766e',boxShadow:'0 1px 4px #0005'}}/></AdvancedMarker>)}
 {e?.match&&e.address&&<InfoWindow position={{lat:e.match.latitude,lng:e.match.longitude}} onCloseClick={()=>setSelected(undefined)}><div style={{maxWidth:230,color:'#14283f',fontSize:13,overflowWrap:'anywhere'}}><strong>{e.name}</strong><p>{addressText(e.address)}</p><p>{e.key} · {e.sourceDate??'Date not supplied'}</p>{e.primaryAddressEvidence&&<p>{primaryAssociationLabel(e.primaryAddressEvidence)}{e.primaryAddressEvidence.originalAddress&&<><br/>Original registry address: {addressText(e.primaryAddressEvidence.originalAddress)}</>}</p>}<p>{addressMatchLabel(e.match)}. Not a confirmed operating station.</p>{pointSource&&<p><a href={pointSource.url} target="_blank" rel="noreferrer">{pointSource.label}</a></p>}<a href={snapshotSourceUrl(e)} target="_blank" rel="noreferrer">Source record</a> · <a href={'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(addressText(e.address))} target="_blank" rel="noreferrer">Directions</a></div></InfoWindow>}</>;
}
