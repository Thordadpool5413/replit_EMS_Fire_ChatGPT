import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileCommandOverview } from './ProfileCommandOverview';
import { ProcurementTimeline } from './ProcurementTimeline';
import { getAgencyServiceMode } from './AgencyIntelligenceBrief';
import { COMPREHENSIVE_NATIONWIDE_AGENCIES } from '../../data/nationalAgenciesData';
import type { Agency } from '../../types';
const populated = COMPREHENSIVE_NATIONWIDE_AGENCIES.find(a=>a.id==='zoll-agency-oh-cleveland')!;
const fixture = (overrides:Partial<Agency>):Agency=>({
  ...populated,id:'isolated-fixture',factEvidence:{},keyContacts:[],fieldNotes:[],
  installedFleet:{} as Agency['installedFleet'],competitorContract:{} as Agency['competitorContract'],
  femaGrantHistory:[],budgetCycleEndMonth:undefined,stateLicenseExpiration:undefined,...overrides,
});
const render=(agency:Agency)=>renderToStaticMarkup(<ProfileCommandOverview agency={agency} onNavigate={()=>{}} onOpenSources={()=>{}}><p>Focused account briefing</p></ProfileCommandOverview>);
test('populated EMS overview has four distinct summaries and useful account actions',()=>{
  const html=render(populated);
  for(const id of ['summary-equipment','summary-purchasing','summary-people','summary-operations','panel-overview-contact','panel-overview-dates','panel-overview-gaps','panel-overview-sources'])assert.match(html,new RegExp(`data-testid="${id}"`));
  assert.equal((html.match(/data-testid="summary-equipment"/g)||[]).length,1);
  assert.match(html,/View equipment/);assert.match(html,/Open sources/);
  assert.doesNotMatch(html,/Verification context|fact groups have a mapped source/);
});
test('long contact names appear once in context rather than inflating the summary row',()=>{
  const name='Anderson County Emergency Medical Services Command & Administration';
  const title='Office of the EMS Director & Medical Command';
  const html=render(fixture({keyContacts:[{name,title,role:'EMS Chief'} as Agency['keyContacts'][number]]}));
  assert.equal((html.match(/Anderson County Emergency Medical Services Command &amp; Administration/g)||[]).length,1);
  assert.match(html,/1 recorded/);
  assert.match(html,/Office of the EMS Director &amp; Medical Command/);
  assert.match(html,/data-testid="summary-people-open"/);
});
test('equipment-first overview retains recorded quantities and age, including zeros',()=>{
  const html=render(fixture({installedFleet:{
    defibBrand:'Recorded Monitor Model',defibUnitsCount:0,defibAgeYears:0,
  } as Agency['installedFleet']}));
  assert.match(html,/Recorded Monitor Model/);
  assert.match(html,/0 units/);
  assert.match(html,/0 (?:years|yrs)/);
  assert.doesNotMatch(html,/eligible units|confirmed deployment|verified equipment/i);
});
test('overview keeps all six equipment and software rows, missing labels, and inventory caveat',()=>{
  const html=render(fixture({installedFleet:{
    defibBrand:'Recorded Monitor Model',defibUnitsCount:12,
    mechanicalCPR:undefined,transportVentilator:undefined,epcrCadSoftware:undefined,
    dispatchCadVendor:undefined,billingSoftware:undefined,
  } as unknown as Agency['installedFleet']}));
  for(const key of ['monitor','cpr','vent','epcrcad','dispatch','billing']){
    assert.match(html,new RegExp(`data-testid="row-overview-equipment-${key}"`));
  }
  for(const value of ['Monitor / defibrillator','Mechanical CPR','Transport ventilator','ePCR / CAD (combined record)','Dispatch CAD vendor','Billing software']){
    assert.ok(html.includes(value),`missing equipment category: ${value}`);
  }
  assert.match(html,/12 units/);
  assert.equal((html.match(/Not reported/g)||[]).length,6); // Five category values plus the monitor age.
  assert.equal((html.match(/Units not reported/g)||[]).length,2);
  assert.match(html,/Inventory as recorded/);
  assert.match(html,/not condition, intent or buy-back eligibility/);
});
test('phone overview offers a labeled equipment disclosure while retaining all six source rows',()=>{
  const html=render(populated);
  assert.match(html,/data-testid="button-overview-expand-equipment-phone"/);
  assert.match(html,/aria-expanded="false"/);
  assert.match(html,/View additional equipment &amp; software/);
  assert.match(html,/id="[^"]+-equipment-catalog" class="acp-ledger-catalog"/);
  assert.equal((html.match(/data-testid="row-overview-equipment-/g)||[]).length,6);
});
test('unknown equipment quantity and age are not displayed as reported zeros',()=>{
  const html=render(fixture({installedFleet:{
    defibBrand:'Recorded Monitor Model',
  } as Agency['installedFleet']}));
  assert.match(html,/Recorded Monitor Model/);
  assert.doesNotMatch(html,/>0 units|>0 years|>0 yrs/);
});
test('sparse EMS remains a research-needed view, not a fake dashboard',()=>{
  const html=render(fixture({annualCallVolume:undefined,annual911Transports:undefined,stationsCount:undefined,totalAmbulances:undefined} as unknown as Partial<Agency>));
  assert.match(html,/No equipment recorded yet/);assert.match(html,/No signal recorded/);
  assert.match(html,/No contact recorded/);assert.match(html,/Monitor \/ defibrillator model/);
  assert.doesNotMatch(html,/NaN|undefined/);
});
test('overview source access does not display per-record verification counts',()=>{
  const html=render(fixture({}));
  assert.match(html,/Open sources/);
  assert.doesNotMatch(html,/0<\/strong> of \d+ fact groups/);
});
test('EMS, fire and combined profiles omit the removed recommended-next-action section',()=>{
  for(const agency of [
    populated,
    fixture({agencyType:'Volunteer Fire & Rescue',providerCategory:'FIRE',totalAmbulances:0}),
    fixture({agencyType:'Fire & EMS',providerCategory:'FIRE',totalAmbulances:2}),
  ]){
    const html=render(agency);
    assert.doesNotMatch(html,/Recommended next action|panel-recommended-next-action|button-overview-log-note/);
    assert.match(html,/Most relevant contact/);
    assert.match(html,/Important dates/);
    assert.match(html,/Research gaps/);
    assert.match(html,/Focused account briefing/);
  }
});
test('source records do not add verification badges to the overview',()=>{
  const html=render(fixture({factEvidence:{
    providerAddress:{reviewed:false,sourceKind:'link',sourceName:'Agency website',sourceRecordId:'address',sourceUrl:'https://example.org/agency'},
    stationCount:{reviewed:false,sourceKind:'dataset',sourceName:'State count',sourceRecordId:'state',note:'Not agency scope',geographicLevel:'state'},
  }}));
  assert.match(html,/Open sources/);
  assert.doesNotMatch(html,/1<\/strong> of \d+ fact groups/);
});
test('expired contracts are history rather than upcoming deadlines',()=>{
  const agency=fixture({competitorContract:{contractEndDate:'2020-01-01',vendor:'Recorded vendor'} as Agency['competitorContract']});
  assert.match(render(agency),/historical, not a deadline/);
  const html=renderToStaticMarkup(<ProcurementTimeline agency={agency}/>);
  assert.match(html,/History/);assert.match(html,/0 upcoming/);
});
test('fire-only fixture avoids EMS transport summary and combined record keeps its discipline',()=>{
  const fire=fixture({agencyType:'Volunteer Fire & Rescue',providerCategory:'FIRE',totalAmbulances:0,annual911Transports:0,annualCallVolume:100});
  assert.equal(getAgencyServiceMode(fire),'fire');
  const html=render(fire);
  assert.match(html,/reported fire-rescue calls/);assert.doesNotMatch(html,/ambulances/);
  const combined=fixture({agencyType:'Fire & EMS',providerCategory:'FIRE',totalAmbulances:2,annual911Transports:500});
  assert.equal(getAgencyServiceMode(combined),'combined');
});
