import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agency, SyncOutboxItem } from '../types';
import { applyAgencyMutation } from './agencyMutation';
import { applyAgencyReviews, stripAgencyReviewOverlay, validateCorrection } from './agencyReviewOverlay';
import { createWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup } from './workspaceBackup';
import type { FactReviewEntry } from './factReviewStore';

const agency = { id:'agency-1', name:'County EMS', address:'Old address', fieldNotes:[], installedFleet:{defibAgeYears:3,defibBrand:'Vendor'}, zollOpportunity:{salesStage:'Target Lead',scoreBreakdown:{}}, competitorContract:{} } as unknown as Agency;
const mutation = (actionType: SyncOutboxItem['actionType'], payload: any): SyncOutboxItem => ({id:'change-1',agencyId:agency.id,agencyName:agency.name,timestamp:'2026-11-14T00:00:00Z',actionType,payload,status:'PENDING'});
const review: FactReviewEntry = {id:'review-1',agencyId:agency.id,fieldId:'monitor.age',action:'correct',originalValue:'3',previousValue:'3',correctedValue:'10',reviewer:'Nick',method:'Agency call',note:'Confirmed fleet age',reviewedAt:'2026-11-14T00:00:00Z'};
function memoryStorage(): Storage {
  const data = new Map<string,string>();
  return {get length(){return data.size;}, key:i=>[...data.keys()][i] ?? null,getItem:k=>data.get(k) ?? null,setItem:(k,v)=>{data.set(k,String(v));},removeItem:k=>{data.delete(k);},clear:()=>data.clear()};
}
test('field-note retries are idempotent and preserve concurrent notes and latest contact', () => {
  const first = {id:'visit-1',date:'2026-11-14',notes:'First visit'};
  const second = {id:'visit-2',date:'2026-11-13',notes:'Second visit'};
  const a = applyAgencyMutation(agency,mutation('ADD_FIELD_NOTE',{note:first}));
  const b = applyAgencyMutation(a,mutation('ADD_FIELD_NOTE',{note:second}));
  const retried = applyAgencyMutation(b,mutation('ADD_FIELD_NOTE',{note:second}));
  assert.equal(retried.fieldNotes.length,2);
  assert.equal(retried.lastContactDate,'2026-11-14');
  assert.equal(agency.fieldNotes.length,0);
});
test('concurrent changes to different fields merge; conflicting stages are retained for review', () => {
  const staged = applyAgencyMutation(agency,mutation('AGENCY_PATCH',{changes:{'zollOpportunity.salesStage':'Demo Scheduled'},expected:{'zollOpportunity.salesStage':'Target Lead'}}),true);
  const bookmarked = applyAgencyMutation(staged,mutation('AGENCY_PATCH',{changes:{isBookmarked:true},expected:{isBookmarked:false}}),true);
  assert.equal(bookmarked.zollOpportunity.salesStage,'Demo Scheduled');
  assert.equal(bookmarked.isBookmarked,true);
  assert.throws(()=>applyAgencyMutation(staged,mutation('AGENCY_PATCH',{changes:{'zollOpportunity.salesStage':'Closed Won'},expected:{'zollOpportunity.salesStage':'Target Lead'}}),true),/Another device/);
});
test('corrections change effective numeric values and scoring without mutating imported facts', () => {
  const corrected = applyAgencyReviews(agency,[review]);
  assert.equal(corrected.installedFleet.defibAgeYears,10);
  assert.equal(agency.installedFleet.defibAgeYears,3);
  assert.equal(stripAgencyReviewOverlay(corrected).installedFleet.defibAgeYears,3);
  assert.equal(stripAgencyReviewOverlay(corrected)._reviewOriginalValues,undefined);
  assert.equal(corrected._reviewOriginalValues?.['monitor.age'],'3');
  assert.ok(corrected.zollOpportunity.pulseIqScore > applyAgencyReviews(agency,[{...review,correctedValue:'2'}]).zollOpportunity.pulseIqScore);
  assert.throws(()=>validateCorrection('monitor.quantity','three'),/number/);
  assert.throws(()=>validateCorrection('monitor.quantity','-1'),/number/);
  assert.throws(()=>validateCorrection('monitor.quantity','1.5'),/fractions/);
});
test('source refresh does not silently inherit a correction for an older source value', () => {
  const refreshed = {...agency,installedFleet:{...agency.installedFleet,defibAgeYears:4}};
  assert.equal(applyAgencyReviews(refreshed,[review]).installedFleet.defibAgeYears,4);
});
test('reviews merge by stable identity on retry', () => {
  const item = mutation('FACT_REVIEW',{review});
  const once = applyAgencyMutation(agency,item);
  assert.equal(applyAgencyMutation(once,item)._factReviews?.length,1);
});
test('workspace backup restores reviews, research, new agencies, and a local-only journal', () => {
  const store=memoryStorage();
  store.setItem('ems_agency_fact_reviews_v1',JSON.stringify([review]));
  store.setItem('ems_equipment_research_v1:agency-1',JSON.stringify({signals:[],offers:[],devices:{}}));
  store.setItem('zoll_pulseiq_outbox_v1',JSON.stringify([mutation('ADD_FIELD_NOTE',{note:{id:'visit-1'}})]));
  store.setItem('unrelated-token','do-not-export');
  const backup=parseWorkspaceBackup(JSON.stringify(createWorkspaceBackup([agency],store)));
  assert.equal(backup.storage['unrelated-token'],undefined);
  const target=memoryStorage();
  restoreWorkspaceBackup(backup,target);
  assert.deepEqual(JSON.parse(target.getItem('ems_agency_fact_reviews_v1')!),[review]);
  assert.ok(target.getItem('ems_equipment_research_v1:agency-1'));
  assert.equal(JSON.parse(target.getItem('zoll_pulseiq_outbox_v1')!)[0].status,'LOCAL_ONLY');
  assert.equal(JSON.parse(target.getItem('zoll_pulseiq_custom_agencies_v8')!)[0][1].record.name,agency.name);
});
test('malformed backup is rejected before touching existing work', () => {
  const store=memoryStorage();store.setItem('ems_agency_fact_reviews_v1','[]');
  const before=store.getItem('ems_agency_fact_reviews_v1');
  assert.throws(()=>restoreWorkspaceBackup({format:'ems-workspace',version:1,createdAt:'2026-11-14',agencies:[],storage:{'ems_agency_fact_reviews_v1':'[{}]'}},store));
  assert.equal(store.getItem('ems_agency_fact_reviews_v1'),before);
});
test('quota failure rolls back the workspace without discarding prior values', () => {
  const store=memoryStorage();store.setItem('ems_agency_fact_reviews_v1','[]');
  const write=store.setItem;
  store.setItem=(k,v)=>{if(k==='ems_equipment_research_v1:agency-1') throw new Error('Quota');write(k,v);};
  const backup=createWorkspaceBackup([],memoryStorage());
  backup.storage['ems_equipment_research_v1:agency-1']=JSON.stringify({signals:[],offers:[],devices:{}});
  assert.throws(()=>restoreWorkspaceBackup(backup,store),/previous workspace was retained/);
  assert.equal(store.getItem('ems_agency_fact_reviews_v1'),'[]');
});
