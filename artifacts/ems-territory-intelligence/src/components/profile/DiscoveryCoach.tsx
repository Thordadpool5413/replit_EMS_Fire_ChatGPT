import stationArt from '../../assets/provider-station-art.webp';
import fireArt from '../../assets/provider-fire-art.webp';
import emsArt from '../../assets/provider-ems-art.webp';
import { DiscoveryEvidenceChart, factsInCategory } from './DiscoveryEvidenceChart';
import './DiscoveryCoach.css';
import { registryIdentityKey } from '../../services/registryAccountLink';
import { useDiscoverySources } from '../../services/useDiscoverySources';
import { linkedBillingOrganization, providerEvidenceNerisId } from '../../data/providerProfileEvidence';
import type { RegistryIdentity } from '../../services/registryAccountLink';
import type { ProviderEvidence } from '../../data/providerProfileEvidence';
import { discoveryFacts, type DiscoveryFact } from '../../services/discoveryEvidence';
import { ZOLL_PRODUCTS } from '../../data/zollProducts';
import React, { useState } from 'react';
import { MessagesSquare, FileSearch, Scale, Quote, Send, Headphones, UserRound } from 'lucide-react';
import { discoveryLibrary } from '../../data/discoveryLibrary';

type Turn = {role:'user'|'assistant'; content:string};
type Mode = 'ask' | 'practice' | 'coach';
function Session({facts,agency, stakeholder, topic, objection, mode}: {facts:DiscoveryFact[];agency:string;stakeholder:string;topic:string;objection:string;mode:Mode}) {
  const [history,setHistory]=useState<Turn[]>([]);
  const [input,setInput]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  async function send(message:string) {
    if (!message.trim() || busy) return;
    const turns:Turn[]=[...history,{role:'user',content:message.trim()}];
    const words=message.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    const score=(f:DiscoveryFact)=>words.filter(w=>(f.topic+' '+f.detail).toLowerCase().includes(w)).length;
    const ranked=[...facts].sort((a,b)=>score(b)-score(a));
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/discovery/coach',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({facts:ranked.slice(0,12).map(f=>[f.topic,f.detail,f.source.label,f.source.date].join(' · ').slice(0,1800)),agency,stakeholder,topic,objection,mode,history:turns.slice(-15)})});
      const data=await response.json();
      if (!response.ok || !data.text) throw Error(data.error || 'Coaching unavailable.');
      setHistory([...turns,{role:'assistant',content:data.text}]);setInput('');
    } catch(e) {setError(e instanceof Error?e.message:'Unable to reach coach.');} finally {setBusy(false);}
  }
  return <div className="space-y-2"><p>{mode==='practice'?'Fictional role-play. Respond as yourself or ask for listening feedback.':mode==='ask'?'Ask about the public evidence shown here.':'Ask for one question or describe what the stakeholder said.'} Messages are sent to OpenAI. Leave patient information out.</p>
    <div className="discovery-transcript" aria-live="polite">{history.map((turn,i)=><p data-speaker={turn.role} key={i}><strong>{turn.role==='user'?'You':mode==='practice'?stakeholder:'Coach'}</strong> · {turn.content}</p>)}</div>
    {!history.length && <button className="workspace-button" disabled={busy} onClick={()=>send(mode==='practice'?'Start the scenario.':mode==='ask'?'Summarize the latest supplied evidence with dates and sources.':'Suggest an opening question.')}>{mode==='practice'?'Start role-play':mode==='ask'?'Summarize evidence':'Suggest an opener'}</button>}
    <label className="block">Your message<textarea className="block w-full" maxLength={2500} value={input} onChange={e=>setInput(e.target.value)}/></label>
    <button className="workspace-button" disabled={busy||!input.trim()} onClick={()=>send(input)}><Send size={15} aria-hidden="true"/> {busy?'Thinking…':'Send'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
export function DiscoveryCoach({agency,evidence,identity,billingNpi}:{agency:string;billingNpi?:string|null;evidence?:ProviderEvidence;identity?:RegistryIdentity}) {
  const [index,setIndex]=useState(0),[role,setRole]=useState('Training captain'),[mode,setMode]=useState<Mode>('ask');
  const key=identity && registryIdentityKey(identity);
  const npi=billingNpi === undefined ? (identity?.sourceName==='NPPES' ? identity.identifier : linkedBillingOrganization(key,evidence)) : billingNpi;
  const sources=useDiscoverySources(npi || undefined,evidence?.registryKey ?? key,identity?.sourceName==='NERIS'?identity.identifier:providerEvidenceNerisId(evidence));
  const allFacts=[...discoveryFacts(evidence,identity),...sources.facts].sort((a,b)=>(b.source.date.match(/\d{4}(?:-\d{2}){0,2}/)?.[0]??'').localeCompare(a.source.date.match(/\d{4}(?:-\d{2}){0,2}/)?.[0]??''));
  const [category,setCategory]=useState('');
  const facts=factsInCategory(allFacts,category);
  const artwork=evidence?.combinedServices?stationArt:identity?.sourceName==='NERIS'||identity?.sourceName==='USFA NFDR'?fireArt:identity?.sourceName==='NPPES'?emsArt:stationArt;
  const factKey=(f:DiscoveryFact)=>JSON.stringify([f.topic,f.source.url,f.source.date,f.detail]);

  const [selected,setSelected]=useState('all');
  const [device,setDevice]=useState(''),[product,setProduct]=useState(''),[task,setTask]=useState('');
  const [topic,question,objection,more,empathy]=discoveryLibrary[index];
  return <section className="pr-panel space-y-3 discovery-room"><header className="discovery-banner"><div><MessagesSquare size={28} aria-hidden="true"/><h2>Discovery</h2><p>{agency}</p></div><img src={artwork} alt="" /></header>
    <h3 className="discovery-heading"><FileSearch aria-hidden="true"/>Ask this profile</h3>
    <DiscoveryEvidenceChart facts={allFacts} category={category} select={value=>{setCategory(value);setSelected('all');}}/>
    {sources.loading && <p role="status">Loading matched sources…</p>}
    {sources.unavailable && <p role="status">Sources currently unavailable: {sources.unavailable}.</p>}
    {sources.partial && <p>Partial purchasing results.</p>}
    <label className="block">Public evidence <select value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">{category || 'All available records'} ({facts.length})</option>{facts.map((f,i)=><option key={i} value={factKey(f)}>{f.topic} · {f.detail.slice(0,70)} · {f.source.date}</option>)}</select></label>
    {facts.length ? <details key={selected} open={selected!=='all'}><summary>{selected==='all'?'Latest dated evidence':'Selected record'}</summary>{(selected==='all'?facts.slice(0,5):facts.filter(f=>factKey(f)===selected)).filter(Boolean).map((f,i)=><p key={i}>{f.detail}<br/><small>{f.source.label} · {f.source.date}</small></p>)}</details>:<p>No matched public evidence is loaded for this assistant.</p>}
    <details className="discovery-fold"><summary><Scale aria-hidden="true"/>Compare equipment for a crew evaluation</summary>
    <label className="block">Documented equipment <select value={device} onChange={e=>setDevice(e.target.value)}><option value="">Select equipment</option>{allFacts.filter(f=>f.topic==='Equipment').map((f,i)=><option key={i} value={f.detail}>{f.detail.slice(0,90)}</option>)}</select></label>
    <label className="block">ZOLL model to evaluate <select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Select model</option>{Object.values(ZOLL_PRODUCTS).map(p=><option key={p.id}>{p.name}</option>)}</select></label>
    <label className="block">Task the crew wants to evaluate <input value={task} onChange={e=>setTask(e.target.value)} maxLength={200}/></label>
    {device && product && <div className="grid gap-2 sm:grid-cols-2">
      <article className="pr-panel"><strong>Department record</strong><p>{device}</p>
      {/\bLIFEPAK 15\b/i.test(device.split(' · ').slice(0,2).join(' ')) && <p>Stryker lists 18.5 lb fully featured with two batteries and roll paper. Source: LIFEPAK 15 data sheet.</p>}</article>
      <article className="pr-panel"><strong>{product}</strong>
      {product===ZOLL_PRODUCTS['x-series-advanced'].name ? <p>ZOLL lists 10.6 lb without battery and paper. The factory-refurbished package lists a SurePower II battery. Source: X Series Advanced Operator’s Guide, appendix A, and ZOLL ExpertCare package list.</p>:<p>Configuration-specific accessory requirements need confirmation.</p>}</article>
      <p>Compare weights with the same installed accessories. Confirm mount, power supply and cables for each vehicle.</p></div>}
    {task && product && device && <p>Use the same setup and crew-defined task on both configurations: <strong>{task}</strong>. Record the steps, accessories required, and crew observations for each. Confirm installed options on both devices.</p>}</details>
    <label className="block">Conversation topic <select value={index} onChange={e=>setIndex(Number(e.target.value))}>{discoveryLibrary.map(([label],i)=><option value={i} key={label}>{label}</option>)}</select></label>
    <h3 className="discovery-question"><Quote aria-hidden="true"/>{question}</h3><details className="discovery-fold"><summary><Headphones aria-hidden="true"/>Practice objection · “{objection}”</summary>
    <p><strong>Tell me more</strong> · {more}</p><p><strong>Feel, felt, found</strong> · {empathy}</p></details>
    <label className="block"><UserRound size={16} aria-hidden="true"/> Stakeholder <select value={role} onChange={e=>setRole(e.target.value)}>{['Chief','Training captain','Frontline medic','Fleet manager','Medical director','Purchasing officer'].map(r=><option key={r}>{r}</option>)}</select></label>
    <label className="block">AI mode <select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="ask">Ask this profile</option><option value="coach">Ask a discovery coach</option><option value="practice">Practice with a stakeholder</option></select></label>
    <Session facts={selected==='all'?facts:facts.filter(f=>factKey(f)===selected)} key={[agency,role,index,mode,category,selected].join('|')} agency={agency} stakeholder={role} topic={topic} objection={objection} mode={mode}/>
  </section>;
}
