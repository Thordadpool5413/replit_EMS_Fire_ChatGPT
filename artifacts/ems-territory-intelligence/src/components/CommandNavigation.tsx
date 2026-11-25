import React,{useId} from 'react';
import {COMMAND_VIEWS,type CommandView} from '../services/territoryCommand';
export const COMMAND_VIEW_LABELS:Record<CommandView,string>={
 overview:'Overview',priorities:'Priority accounts',commercial:'Purchasing and funding',geography:'Geographic research',coverage:'Evidence coverage',followups:'Follow-ups',plan:'Field execution plan',activity:'Account activity',competitive:'Competitive research',pipeline:'Working sales pipeline',leadership:'Leadership review',coaching:'Field coaching',analytics:'Territory analytics'
};
export const COMMAND_VIEW_GROUPS:{label:string;views:CommandView[]}[]=[
 {label:'Summary',views:['overview']},
 {label:'Account intelligence',views:['priorities','commercial','competitive','geography','coverage']},
 {label:'Field execution',views:['plan','activity','followups','pipeline']},
 {label:'Leadership and development',views:['leadership','coaching','analytics']}
];
export function CommandNavigation({view,onView}:{view:CommandView;onView:(v:CommandView)=>void}){
 const id=useId();
 return <nav className="research-navigation" aria-label="Territory command views">
  <div className="research-navigation-field"><label htmlFor={id}>Workspace</label><select id={id} value={view} onChange={e=>{const next=e.target.value;if(COMMAND_VIEWS.some(v=>v===next))onView(next as CommandView);}}>
   {COMMAND_VIEW_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.views.map(v=><option key={v} value={v}>{COMMAND_VIEW_LABELS[v]}</option>)}</optgroup>)}
  </select></div>
  {view!=='overview'&&<button type="button" className="workspace-button research-overview-link" onClick={()=>onView('overview')}>Back to overview</button>}
 </nav>;
}
