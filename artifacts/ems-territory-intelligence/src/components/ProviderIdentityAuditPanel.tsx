import React,{useState} from 'react';
import type {Agency} from '../types';
import {auditLoadedProviderIdentities} from '../services/providerIdentityAudit';
export function ProviderIdentityAuditPanel({agencies}:{agencies:Agency[]}){
 const [audit,setAudit]=useState<ReturnType<typeof auditLoadedProviderIdentities>|null>(null);
 const download=()=>{if(!audit)return;const url=URL.createObjectURL(new Blob([JSON.stringify(audit,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='atlas-provider-identity-audit.json';link.click();URL.revokeObjectURL(url);};
 return <section className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3" aria-label="Provider identity audit">
 <h3 className="font-semibold">Provider identity audit</h3><p className="text-sm text-slate-600 dark:text-slate-300">Inspect loaded workspace accounts for conflicting identifiers, possible duplicates and generated records. Read-only; does not inspect every production document or merge, delete or upload accounts.</p>
 <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button" onClick={()=>setAudit(auditLoadedProviderIdentities(agencies))}>Run loaded-account audit</button><button type="button" className="workspace-button" disabled={!audit} onClick={download}>Export audit JSON</button></div>
 {audit&&<div className="space-y-2" role="status"><p className="text-xs">Snapshot: {new Date(audit.createdAt).toLocaleString()}</p><dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">{Object.entries({...audit.totals,identifierConflicts:audit.identifierConflicts.length,possibleNameDuplicates:audit.possibleNameDuplicates.length,duplicateAccountIds:audit.duplicateAccountIds.length,remainingSyntheticFdid:audit.remainingSyntheticFdid.length,invalidNativeIdentities:audit.invalidNativeIdentities.length}).map(([key,value])=><div className="min-w-0" key={key}><dt className="break-words">{key.replace(/([A-Z])/g,' $1').toLowerCase()}</dt><dd className="text-lg font-semibold">{value.toLocaleString()}</dd></div>)}</dl><p className="text-xs">Name matches are review candidates, not confirmed duplicates. Export contains account identity details only, not notes or contact records.</p></div>}
 </section>;
}
