import React,{useState} from 'react';
import type {Agency} from '../types';
import {loadLegacyProviderArchive} from '../utils/syncStore';
export function LegacyProviderArchive({records=[]}:{records?:Agency[]}){
 const [message,setMessage]=useState('');
 function download(){
  try{
   const archive=loadLegacyProviderArchive(records);
   if(!archive.count){setMessage('No archived legacy account work found on this device.');return;}
   const url=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='atlas-legacy-account-review-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('Exported '+archive.count+' archived identity references. This is a recovery archive, not a provider directory.');
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to export the archive. Existing data was not changed.');}
 }
 return <section className="pi-surface p-3 space-y-2 min-w-0" data-testid="legacy-provider-archive">
 <h2 className="font-semibold">Legacy account reconciliation</h2>
 <p className="text-sm">Illustrative seed records and geography-generated prospects are excluded from active provider profiles, maps, priorities and reports. Existing saved work is retained. No record is silently reassigned to another agency.</p>
 <p className="text-xs">{records.length.toLocaleString()} loaded legacy records withheld. Older saved deltas and queued changes are included in the device archive when available.</p>
 <p className="text-xs">Use the public registry below to identify the actual provider, create a source-backed account, and independently review any work before transferring it. The archive may contain old modeled values; do not use them as facts.</p>
 <button className="workspace-button min-h-11" type="button" onClick={download}>Export archived work for review</button>
 {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
