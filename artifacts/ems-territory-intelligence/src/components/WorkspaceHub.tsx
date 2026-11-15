import { BulkRegistryDirectory } from './BulkRegistryDirectory';
import { ImportRunHistory } from './ImportRunHistory';
import { DataCoverageSummary } from './DataCoverageSummary';
import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Download, MapPin, SlidersHorizontal, BarChart3 } from 'lucide-react';
import type { Agency } from '../types';
import { getRecordOrigin, buildWorkspaceCsv } from '../utils/workspacePresentation';
const reports = [
  ['contracts','Purchasing timeline','Review recorded contracts and upcoming renewal dates.'],
  ['grants','Fire grants','Explore recorded funding opportunities and supporting sources.'],
  ['pulseiq','Territory priorities','Compare modeled opportunity signals across your territory.'],
  ['knowledge','Clinical & competitive reference','Prepare for equipment and clinical conversations.'],
  ['3d_studio','Equipment viewer','Explore product reference models and demonstrations.'],
];
const settings = [
  ['data_health','Data status & sync','Inspect source coverage, queued changes, and cloud availability.'],
  ['resilience','Backup & restore','Export your complete workspace or recover saved work.'],
  ['gateway','Source directory','Find federal and state sources for your research.'],
  ['claims','Public data & imports','Review Medicare and public-health reference data.'],
];
export const WorkspaceHub: React.FC<{kind:'reports'|'settings';agencies:Agency[];navigate:(id:string)=>void;pending:number;online:boolean}> = ({kind,agencies,navigate,pending,online}) => {
  const [includeEstimates,setIncludeEstimates]=useState(false);
  const work = useMemo(()=>agencies.filter(a=>a.isBookmarked||a.inDayRoute||(a.fieldNotes?.length || a.followUpTasks?.length)||Object.keys(a._reviewOriginalValues??{}).length),[agencies]);
  const exportWork=()=>{
    const url=URL.createObjectURL(new Blob(['\uFEFF',buildWorkspaceCsv(work,undefined,includeEstimates)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`agency-work-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section className="workspace-hub" aria-labelledby="workspace-hub-title">
    <header className="workspace-hub-heading"><div><p className="workspace-eyebrow">Territory intelligence</p><h1 id="workspace-hub-title">{kind==='reports'?'Reports':'Settings'}</h1><p>{kind==='reports'?'Turn your account work into a useful next step.':'Keep your research, saved work, and connected data organized.'}</p></div>{kind==='reports'?<BarChart3 aria-hidden="true"/>:<SlidersHorizontal aria-hidden="true"/>}</header>
    <div className="workspace-hub-summary" role="status"><span>{online?'Online':'Offline · saved work stays on this device'}</span><span>{pending?`${pending} changes waiting for cloud acknowledgment`:'No queued changes'}</span><span>{work.length.toLocaleString()} accounts with saved work</span></div>
    {kind==='reports'&&<section className="workspace-export-panel" aria-labelledby="export-work-title"><div><h2 id="export-work-title">Your account activity</h2><p>{work.length?'Export saved accounts, route stops, and accounts with notes or corrections.':'Save an agency or log your first visit to create an account activity report.'}</p><small>Includes record origin, user-corrected values, latest interaction, and next action. All agency information requires user validation. Generated equipment values are excluded from reported equipment columns.</small><label className="text-sm block mt-2"><input type="checkbox" checked={includeEstimates} onChange={e=>setIncludeEstimates(e.target.checked)}/> Include a separate planning-estimates column</label></div><button className="workspace-button" disabled={!work.length} onClick={exportWork}><Download size={16} aria-hidden="true"/>Export CSV</button></section>}
    {kind==='settings'&&<><DataCoverageSummary agencies={agencies}/><ImportRunHistory/><BulkRegistryDirectory/></>}
    <div className="workspace-hub-grid">{(kind==='reports'?reports:settings).map(([id,title,description])=><button key={id} type="button" className="workspace-destination" onClick={()=>navigate(id)}><span><strong>{title}</strong><span>{description}</span></span><ArrowUpRight size={18} aria-hidden="true"/></button>)}</div>
    <footer className="workspace-hub-footer"><MapPin size={16} aria-hidden="true"/><span>Need an account? Start with the map or agency directory.</span><button className="workspace-text-button" onClick={()=>navigate('states_directory')}>Open directory</button></footer>
  </section>;
};
