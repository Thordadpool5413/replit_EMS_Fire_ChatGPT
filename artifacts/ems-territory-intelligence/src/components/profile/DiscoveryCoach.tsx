import type { RegistryIdentity } from '../../services/registryAccountLink';
import type { ProviderEvidence } from '../../data/providerProfileEvidence';
import { discoveryFacts, type DiscoveryFact } from '../../services/discoveryEvidence';
import { ZOLL_PRODUCTS } from '../../data/zollProducts';
import React, { useState } from 'react';
import { MessagesSquare } from 'lucide-react';
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
    <div aria-live="polite">{history.map((turn,i)=><p key={i}><strong>{turn.role==='user'?'You':mode==='practice'?stakeholder:'Coach'}</strong> · {turn.content}</p>)}</div>
    {!history.length && <button className="workspace-button" disabled={busy} onClick={()=>send(mode==='practice'?'Start the scenario.':mode==='ask'?'Summarize the latest supplied evidence with dates and sources.':'Suggest an opening question.')}>{mode==='practice'?'Start role-play':mode==='ask'?'Summarize evidence':'Suggest an opener'}</button>}
    <label className="block">Your message<textarea className="block w-full" maxLength={2500} value={input} onChange={e=>setInput(e.target.value)}/></label>
    <button className="workspace-button" disabled={busy||!input.trim()} onClick={()=>send(input)}>{busy?'Thinking…':'Send'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
export function DiscoveryCoach({agency,evidence,identity}:{agency:string;evidence?:ProviderEvidence;identity?:RegistryIdentity}) {
  const [index,setIndex]=useState(0),[role,setRole]=useState('Training captain'),[mode,setMode]=useState<Mode>('ask');
  const facts=discoveryFacts(evidence,identity);
  const [selected,setSelected]=useState('all');
  const [device,setDevice]=useState(''),[product,setProduct]=useState(''),[task,setTask]=useState('');
  const [topic,question,objection,more,empathy]=discoveryLibrary[index];
  return <section className="pr-panel space-y-3"><h2 className="pr-icon-heading"><MessagesSquare aria-hidden="true"/>Discovery</h2>
    <h3>Ask this profile</h3>
    <label className="block">Public evidence <select value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">All available records ({facts.length})</option>{facts.map((f,i)=><option key={i} value={i}>{f.topic} · {f.detail.slice(0,70)} · {f.source.date}</option>)}</select></label>
    {facts.length ? <details key={selected} open={selected!=='all'}><summary>{selected==='all'?'Latest dated evidence':'Selected record'}</summary>{(selected==='all'?facts.slice(0,5):[facts[Number(selected)]]).filter(Boolean).map((f,i)=><p key={i}>{f.detail}<br/><small>{f.source.label} · {f.source.date}</small></p>)}</details>:<p>No matched public evidence is loaded for this assistant.</p>}
    <details><summary>Compare equipment for a crew evaluation</summary>
    <label className="block">Documented equipment <select value={device} onChange={e=>setDevice(e.target.value)}><option value="">Select equipment</option>{facts.filter(f=>f.topic==='Equipment').map((f,i)=><option key={i} value={f.detail}>{f.detail.slice(0,90)}</option>)}</select></label>
    <label className="block">ZOLL model to evaluate <select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Select model</option>{Object.values(ZOLL_PRODUCTS).map(p=><option key={p.id}>{p.name}</option>)}</select></label>
    <label className="block">Task the crew wants to evaluate <input value={task} onChange={e=>setTask(e.target.value)} maxLength={200}/></label>
    {task && product && device && <p>Use the same setup and crew-defined task on both configurations: <strong>{task}</strong>. Record the steps, accessories required, and crew observations for each. Confirm installed options on both devices.</p>}</details>
    <label className="block">Conversation topic <select value={index} onChange={e=>setIndex(Number(e.target.value))}>{discoveryLibrary.map(([label],i)=><option value={i} key={label}>{label}</option>)}</select></label>
    <h3>{question}</h3><details><summary>Practice objection · “{objection}”</summary>
    <p><strong>Tell me more</strong> · {more}</p><p><strong>Feel, felt, found</strong> · {empathy}</p></details>
    <label className="block">Stakeholder <select value={role} onChange={e=>setRole(e.target.value)}>{['Chief','Training captain','Frontline medic','Fleet manager','Medical director','Purchasing officer'].map(r=><option key={r}>{r}</option>)}</select></label>
    <label className="block">AI mode <select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="ask">Ask this profile</option><option value="coach">Ask a discovery coach</option><option value="practice">Practice with a stakeholder</option></select></label>
    <Session facts={selected==='all'?facts:facts.slice(Number(selected),Number(selected)+1)} key={[agency,role,index,mode,selected].join('|')} agency={agency} stakeholder={role} topic={topic} objection={objection} mode={mode}/>
  </section>;
}
