import React,{useCallback,useEffect,useRef,useState} from 'react';
import { Banknote, CalendarDays, ClipboardList, Receipt, Truck, Users, type LucideIcon } from 'lucide-react';
import type {Agency} from '../../types';
import {profileCmsLookupNpi,loadCmsServiceEvidence,type CmsServiceEvidence} from '../../services/cmsAmbulanceEvidence';
const count=(v:number|null)=>v===null?'Not reported':v.toLocaleString(undefined,{maximumFractionDigits:2});
const money=(v:number|null)=>v===null?'Not reported':v.toLocaleString('en-US',{style:'currency',currency:'USD'});
function CmsEvidenceMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="pr-source-tile">
    <dt className="pr-icon-heading"><Icon size={15} aria-hidden="true" />{label}</dt>
    <dd className="font-semibold tabular-nums">{value}</dd>
  </div>;
}
export function CmsAmbulanceEvidencePanel({agency, autoLoad = false}:{agency:Agency; autoLoad?:boolean}){
 const lookup=profileCmsLookupNpi(agency),npi=lookup.npi;
 const [result,setResult]=useState<CmsServiceEvidence|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>{setResult(null);setBusy(false);setError('');return()=>{active.current?.abort();active.current=null}},[agency.id,npi]);
 const refresh = useCallback(async () => {
  if(!npi)return;active.current?.abort();
  const c=new AbortController();active.current=c;setBusy(true);setResult(null);setError('');
  try{const data=await loadCmsServiceEvidence(npi,AbortSignal.any([c.signal,AbortSignal.timeout(45_000)]));if(active.current===c&&!c.signal.aborted)setResult(data);}
  catch{if(active.current===c&&!c.signal.aborted)setError('Federal CMS lookup did not complete. Retry; no values were inferred.');}
  finally{if(active.current===c){setBusy(false);active.current=null;}}
 }, [npi]);
 useEffect(()=>{if(autoLoad)void refresh()},[agency.id,autoLoad,refresh]);
 const current=result?.npi===npi?result:null;
 return <section className="pi-surface p-3 space-y-3 min-w-0" data-testid="cms-federal-ambulance-evidence">
 <h3 className="font-semibold text-sm">Federal Medicare ambulance service evidence</h3>
 <p className="text-xs">CMS Original Medicare Part B public-use data, calendar year 2024. Available nationwide by NPI without a state license lookup. This is source-reported evidence, not verified operating agency claims or station activity.</p>
 <p className="text-xs">{lookup.reason}{npi?' NPI '+npi+'.':''}</p>
 {npi&&<button type="button" disabled={busy} className="workspace-button min-h-11" onClick={()=>void refresh()}>{busy?'Loading CMS evidence…':current?'Refresh CMS service data':'Pull CMS service data'}</button>}
 {error&&<p role="alert" className="text-xs">{error}</p>}
 {current&&<><p className="text-xs"><a className="underline" href={current.sourceUrl} target="_blank" rel="noreferrer">CMS dataset</a> · <a className="underline" href={current.queryUrl} target="_blank" rel="noreferrer">Exact NPI API query</a> · retrieved {current.retrievedAt.slice(0,10)} UTC.</p>
 {current.status==='no-published-rows'?<p role="status">No published organization ambulance service rows for this NPI and year. This does not mean zero claims, zero services or no operations.</p>:<><p role="status" className="text-xs">{current.rows.length} published ambulance HCPCS / place-of-service rows. CMS organization names and geography are shown as reported, not assumed to be this operating department.</p>
 <ul className="divide-y">{current.rows.map(row=><li className="py-3 space-y-1 text-sm break-words" key={row.rowKey}>
 <strong>{row.hcpcs} · {row.description??'Description not reported'}</strong><p className="text-xs">{row.organizationName} · {[row.city,row.state].filter(Boolean).join(', ')} · {row.placeOfService==='F'?'Facility':'Non-facility'} place-of-service category</p>
 <dl className="pr-source-grid text-xs">
   <CmsEvidenceMetric icon={Truck} label="Published service units" value={count(row.services)} />
   <CmsEvidenceMetric icon={Users} label="Beneficiaries (this row)" value={count(row.beneficiaries)} />
   <CmsEvidenceMetric icon={ClipboardList} label="Average submitted charge" value={money(row.averageSubmittedCharge)} />
   <CmsEvidenceMetric icon={Receipt} label="Average Medicare allowed" value={money(row.averageAllowedAmount)} />
   <CmsEvidenceMetric icon={Banknote} label="Average Medicare payment" value={money(row.averageMedicarePayment)} />
   <CmsEvidenceMetric icon={CalendarDays} label="Beneficiary-day services" value={count(row.beneficiaryDayServices)} />
 </dl>
 </li>)}</ul></>}
 <p className="text-xs">Service units can include mileage. Beneficiaries may overlap rows; do not add them as unique people. Small cells are suppressed. No denial counts, denial rates, total claims, Medicare Advantage, all-payer revenue, current operating relationship or station assignment is established. End-user validation required.</p></>}
 </section>;
}
