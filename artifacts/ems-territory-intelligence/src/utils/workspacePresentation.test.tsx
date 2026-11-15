import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MobileBottomNav} from '../components/MobileBottomNav';
import {WorkspaceHub} from '../components/WorkspaceHub';
import {buildWorkspaceCsv} from './workspacePresentation';
import type {Agency} from '../types';
const task={id:'task-1',taskOnly:true,nextAction:'Review equipment list',dueDate:'2026-11-22',owner:'Unassigned',priority:'high',history:[{id:'create-1',at:'2026-11-15T12:00:00Z',before:{},after:{nextAction:'Review equipment list',dueDate:'2026-11-22',owner:'',priority:'high',followUpStatus:'open'}},{id:'edit-1',at:'2026-11-16T12:00:00Z',before:{nextAction:'Review equipment list'},after:{nextAction:'Review equipment list with agency'}}]};
const agency={id:'a-1',name:'=UNTRUSTED()',stateCode:'FL',county:'Brevard',city:'Satellite Beach',verificationSource:'Geographic prospect generator',installedFleet:{defibBrand:'User corrected model',defibUnitsCount:0},zollOpportunity:{salesStage:'Target Lead'},fieldNotes:[{id:'n-1',date:'2026-11-14',nextAction:'Call purchasing',dueDate:'2026-11-20'}],followUpTasks:[task],_reviewOriginalValues:{'monitor.model':'Prior model','monitor.quantity':'Unknown'}} as unknown as Agency;
test('report export preserves zero, corrections, source origin, latest action, and spreadsheet safety',()=>{
 const csv=buildWorkspaceCsv([agency],'2026-11-15T12:00:00Z');
 assert.ok(csv.includes('"\'=UNTRUSTED()"'));
  for(const value of ['Generated prospect','End-user validation required','User corrected model','"0"','Call purchasing','Review equipment list','Review equipment list with agency','2026-11-16T12:00:00Z','monitor.model','2026-11-15T12:00:00Z']) assert.ok(csv.includes(value),value);
});
test('five mobile destinations have readable labels and the correct selected group',()=>{
 const html=renderToStaticMarkup(<MobileBottomNav activeTab="grants" setActiveTab={()=>{}} dayRouteCount={2}/>);
 assert.equal((html.match(/aria-current="page"/g)??[]).length,1);
 assert.match(html,/aria-label="Reports" aria-current="page"/);
 for(const label of ['Map','Agencies','Field Work','Reports','Settings']) assert.ok(html.includes(`aria-label="${label}"`));
 assert.equal((html.match(/<button/g)??[]).length,5);
});
test('empty report explains the next step and disables exporting empty work',()=>{
 const html=renderToStaticMarkup(<WorkspaceHub kind="reports" agencies={[]} navigate={()=>{}} pending={0} online={false}/>);
 assert.ok(html.includes('Save an agency or log your first visit'));
 assert.match(html,/disabled=""/);assert.ok(html.includes('Offline'));
});
test('settings retains source, import, status, and recovery destinations',()=>{
 const html=renderToStaticMarkup(<WorkspaceHub kind="settings" agencies={[agency]} navigate={()=>{}} pending={2} online/>);
 for(const title of ['Backup &amp; restore','Data status &amp; sync','Public data &amp; imports','Source directory']) assert.ok(html.includes(title));
 assert.ok(html.includes('2 changes waiting'));
});

test('generated equipment is excluded by default and isolated in opt-in planning export',()=>{
 const unreviewed={...agency,_reviewOriginalValues:{},installedFleet:{...agency.installedFleet,defibBrand:'Synthetic model',defibUnitsCount:1234}};
 assert.ok(!buildWorkspaceCsv([unreviewed]).includes('Synthetic model'));
 assert.ok(buildWorkspaceCsv([unreviewed],undefined,true).includes('Synthetic model'));
 assert.ok(buildWorkspaceCsv([unreviewed],undefined,true).includes('not observed agency facts'));
});
