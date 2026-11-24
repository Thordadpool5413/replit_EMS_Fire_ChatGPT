import React,{useState,useMemo} from 'react';
import type {Agency,AgencySourceRecordAssociation} from '../types';
import {createReviewedRegistryAssociation,findRegistryIdentityAccounts,type RegistryIdentity} from '../services/registryAccountLink';
export function RegistryAccountReview({identity,agencies,onOpen,onDecide}:{identity:RegistryIdentity;agencies:Agency[];onOpen?:(a:Agency)=>void;onDecide?:(id:string,association:AgencySourceRecordAssociation)=>void}){
 const [query,setQuery]=useState(''),[accountId,setAccountId]=useState(''),[basis,setBasis]=useState(''),[error,setError]=useState('');
 const linked=useMemo(()=>findRegistryIdentityAccounts(identity,agencies),[identity,agencies]);
 const matches=useMemo(()=>{const q=query.trim().toLowerCase();return q.length<2?[]:agencies.filter(a=>a.stateCode?.toUpperCase()===identity.stateCode&&[a.name,a.id,a.city,a.county].join(' ').toLowerCase().includes(q)).slice(0,30)},[agencies,identity.stateCode,query]);
 if(linked.length>1)return <p role="alert" className="text-sm font-medium">Multiple saved accounts have confirmed this identity. Review their source associations before merging anything.</p>;
 if(linked.length===1)return onOpen?<button className="workspace-button" type="button" onClick={()=>onOpen(linked[0])}>Open linked account</button>:<p>Linked to {linked[0].name}</p>;
 if(!onDecide)return <p className="text-xs">No uniquely confirmed saved-account association.</p>;
 return <details className="mt-2"><summary className="cursor-pointer font-semibold">Review and link to a saved account</summary>
 <div className="space-y-2 pt-2 max-w-full min-w-0">
 <p className="text-xs">Match the actual legal organization, not just its location. Linking records identity evidence; it does not verify equipment or contracts.</p>
 <label className="block">Find saved account<input className="block w-full min-w-0 border rounded p-2 bg-transparent text-base" value={query} onChange={e=>{setQuery(e.target.value);setAccountId('')}} placeholder="Name or city"/></label>
 <label className="block">Select account<select className="block w-full min-w-0 border rounded p-2 bg-transparent text-base" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Choose account</option>{matches.map(a=><option key={a.id} value={a.id}>{a.name} ({a.city||a.stateCode})</option>)}</select></label>
 <label className="block">Match evidence<textarea className="block w-full min-w-0 border rounded p-2 bg-transparent text-base" value={basis} onChange={e=>setBasis(e.target.value)} placeholder="Explain which official name, address or identifier establishes the match."/></label>
 <button type="button" className="workspace-button" disabled={!accountId||!basis.trim()} onClick={()=>{try{const a=agencies.find(a=>a.id===accountId);if(!a)throw Error('Account no longer available.');const association=createReviewedRegistryAssociation(identity,a,basis,agencies);onDecide(a.id,association);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>Confirm identity association</button>
 {error&&<p role="alert">{error}</p>}
 </div></details>;
}
