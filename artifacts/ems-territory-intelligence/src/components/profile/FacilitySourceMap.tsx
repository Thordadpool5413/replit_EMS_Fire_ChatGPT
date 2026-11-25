import {useEffect,useMemo,useState} from 'react';
import {APIProvider,Map,AdvancedMarker,useMap} from '@vis.gl/react-google-maps';
import {stationMapBounds,type Facility} from '../../services/departmentFacilities';
type Point={id:string;name:string;lat:number;lng:number};
export function stationMapPoints(facilities:Facility[]):Point[]{
 return facilities.flatMap(f=>{
  const c=f.coordinates;
  return f.source==='NERIS'&&f.sourceRecordId&&c&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180&&(c.latitude!==0||c.longitude!==0)?[{id:f.sourceRecordId,name:f.name??'Station name not reported',lat:c.latitude,lng:c.longitude}]:[];
 });
}
function Fit({points}:{points:Point[]}){
 const map=useMap();
 useEffect(()=>{if(!map||!points.length)return;if(points.length===1){map.setCenter(points[0]);map.setZoom(13);return;}const bounds=stationMapBounds(points);if(bounds)map.fitBounds(bounds,32);},[map,points]);
 return null;
}
export function FacilitySourceMap({facilities,styles}:{facilities:Facility[];styles?:Record<string,{color:string;glyph:string;label:string}>}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState('');
 const points=useMemo(()=>stationMapPoints(facilities),[facilities]);
 const key=(import.meta as unknown as {env?:Record<string,string>}).env?.VITE_GOOGLE_MAPS_API_KEY||(()=>{try{return localStorage.getItem('gmp_api_key')||'';}catch{return '';}})();
 if(!points.length)return null;
 return <div className="space-y-2">
  <button className="workspace-button min-h-11" type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Hide station map':'View '+points.length+' source station points'}</button>
  {open&&<>
   <p>Source-reported coordinates, not independently field verified. These markers do not change provider counts or headquarters.</p>
   {key?<div className="h-64 w-full overflow-hidden rounded border"><APIProvider apiKey={key} libraries={['marker']}><Map mapId="DEMO_MAP_ID" defaultCenter={points[0]} defaultZoom={9} gestureHandling="cooperative"><Fit points={points}/>{points.map(p=><AdvancedMarker key={p.id} position={p} title={p.name+(styles?.[p.id]?" · "+styles[p.id].label:"")} onClick={()=>setSelected(p.id)}>{styles?.[p.id]&&<span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow" style={{background:styles[p.id].color}}>{styles[p.id].glyph}</span>}</AdvancedMarker>)}</Map></APIProvider></div>:<p>Google Maps is not configured. Use the source links below.</p>}
   {selected&&<p role="status">{points.find(p=>p.id===selected)?.name} · Source point, validation required</p>}
  </>}
 </div>;
}
