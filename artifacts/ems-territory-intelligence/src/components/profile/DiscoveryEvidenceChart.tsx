import React from 'react';
import { Activity, Building2, ClipboardList, HeartPulse, Landmark, Monitor, Receipt, Users, Warehouse } from 'lucide-react';
import type { DiscoveryFact } from '../../services/discoveryEvidence';

const topics = [
  {label:'Equipment', topics:['Equipment'], Icon:Monitor},
  {label:'Purchasing & funding', topics:['Funding','Procurement','Purchasing','Capital planning'], Icon:Landmark},
  {label:'People', topics:['People'], Icon:Users},
  {label:'Stations', topics:['Stations'], Icon:Warehouse},
  {label:'Billing', topics:['Billing','Payer mix','Medicaid','Medicare','Denials'], Icon:Receipt},
  {label:'Clinical', topics:['Quality','Clinical workflow'], Icon:HeartPulse},
  {label:'Operations', topics:['Operations'], Icon:Activity},
  {label:'Registry', topics:['Registry'], Icon:Building2},
];
export function DiscoveryEvidenceChart({facts,category,select}:{facts:DiscoveryFact[];category:string;select:(value:string)=>void}) {
  const groups=topics.map(group=>({...group,count:facts.filter(f=>group.topics.includes(f.topic)).length})).filter(group=>group.count);
  if(!groups.length)return null;
  return <section className="discovery-chart"><div className="discovery-chart-title"><h4><ClipboardList size={17} aria-hidden="true"/>Evidence by topic</h4>
    {category && <button type="button" onClick={()=>select('')}>Show all</button>}</div>
    <div className="discovery-bars">{groups.map(({label,Icon,count})=><button type="button" key={label} aria-pressed={category===label} onClick={()=>select(category===label?'':label)}>
      <Icon size={17} aria-hidden="true"/><span>{label}</span><strong>{count.toLocaleString()} <span className="sr-only">records</span></strong>
      <i aria-hidden="true"><b style={{width:100*count/facts.length+'%'}}/></i>
    </button>)}</div></section>;
}
export function factsInCategory(facts:DiscoveryFact[],category:string) {
  const group=topics.find(item=>item.label===category);
  return group?facts.filter(f=>group.topics.includes(f.topic)):facts;
}
