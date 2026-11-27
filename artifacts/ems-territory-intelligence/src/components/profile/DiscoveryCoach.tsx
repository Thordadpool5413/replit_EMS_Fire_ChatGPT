import React, { useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { discoveryLibrary } from '../../data/discoveryLibrary';

type Turn = {role:'user'|'assistant'; content:string};
function Session({agency, stakeholder, topic, objection, mode}: {agency:string;stakeholder:string;topic:string;objection:string;mode:'practice'|'coach'}) {
  const [history,setHistory]=useState<Turn[]>([]);
  const [input,setInput]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  async function send(message:string) {
    if (!message.trim() || busy) return;
    const turns:Turn[]=[...history,{role:'user',content:message.trim()}];
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/discovery/coach',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({agency,stakeholder,topic,objection,mode,history:turns.slice(-15)})});
      const data=await response.json();
      if (!response.ok || !data.text) throw Error(data.error || 'Coaching unavailable.');
      setHistory([...turns,{role:'assistant',content:data.text}]);setInput('');
    } catch(e) {setError(e instanceof Error?e.message:'Unable to reach coach.');} finally {setBusy(false);}
  }
  return <div className="space-y-2"><p>{mode==='practice'?'Fictional role-play. Respond as yourself or ask for listening feedback.':'Ask for one question or describe what the stakeholder said.'} Messages are sent to OpenAI. Leave patient information out.</p>
    <div aria-live="polite">{history.map((turn,i)=><p key={i}><strong>{turn.role==='user'?'You':mode==='practice'?stakeholder:'Coach'}</strong> · {turn.content}</p>)}</div>
    {!history.length && <button className="workspace-button" disabled={busy} onClick={()=>send(mode==='practice'?'Start the scenario.':'Suggest an opening question.')}>{mode==='practice'?'Start role-play':'Suggest an opener'}</button>}
    <label className="block">Your message<textarea className="block w-full" maxLength={2500} value={input} onChange={e=>setInput(e.target.value)}/></label>
    <button className="workspace-button" disabled={busy||!input.trim()} onClick={()=>send(input)}>{busy?'Thinking…':'Send'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
export function DiscoveryCoach({agency}:{agency:string}) {
  const [index,setIndex]=useState(0),[role,setRole]=useState('Training captain'),[mode,setMode]=useState<'practice'|'coach'>('coach');
  const [topic,question,objection,more,empathy]=discoveryLibrary[index];
  return <section className="pr-panel space-y-3"><h2 className="pr-icon-heading"><MessagesSquare aria-hidden="true"/>Discovery</h2>
    <label className="block">Conversation topic <select value={index} onChange={e=>setIndex(Number(e.target.value))}>{discoveryLibrary.map(([label],i)=><option value={i} key={label}>{label}</option>)}</select></label>
    <h3>{question}</h3><details><summary>Practice objection · “{objection}”</summary>
    <p><strong>Tell me more</strong> · {more}</p><p><strong>Feel, felt, found</strong> · {empathy}</p></details>
    <label className="block">Stakeholder <select value={role} onChange={e=>setRole(e.target.value)}>{['Chief','Training captain','Frontline medic','Fleet manager','Medical director','Purchasing officer'].map(r=><option key={r}>{r}</option>)}</select></label>
    <label className="block">AI mode <select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="coach">Ask a discovery coach</option><option value="practice">Practice with a stakeholder</option></select></label>
    <Session key={[agency,role,index,mode].join('|')} agency={agency} stakeholder={role} topic={topic} objection={objection} mode={mode}/>
  </section>;
}
