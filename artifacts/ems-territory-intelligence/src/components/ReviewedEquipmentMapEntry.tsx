import React,{useState} from 'react';
import type { Agency } from '../types';
import { evidenceEnabled } from '../services/sharedEvidenceReplit';
import { SharedEvidenceWorkspace } from './SharedEvidenceWorkspace';
/** Explicit opt-in view, separate from the existing map's persistent filter and agency state. */
export function ReviewedEquipmentMapEntry({agencies,onOpenAgency}:{agencies:Agency[];onOpenAgency:(a:Agency)=>void}){
 const [open,setOpen]=useState(false);
 if(!evidenceEnabled)return null;
 return <section className="pi-surface p-3 space-y-2 min-w-0" aria-label="Reviewed equipment map access">
  <button type="button" className="workspace-button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Close reviewed equipment map':'Open reviewed equipment map'}</button>
  {open&&<SharedEvidenceWorkspace agencies={agencies} view="map" onOpenAgency={onOpenAgency}/>}
 </section>;
}
