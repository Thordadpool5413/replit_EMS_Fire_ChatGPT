import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConversionResearch} from './conversionResearch';
import type {LifecycleSample,LifecycleObservation} from './lifecycleTimeline';
const today='2026-11-25';
const o:LifecycleObservation={stationId:'S1',submissionId:'a',family:'monitors',maker:'stryker',model:'Fixture',apparatus:'Unit 1',observedOn:'2026-11-01',basis:'direct-observation',sourceUrl:'',serviceEnd:'2027-01-01'};
const s:LifecycleSample={agencyId:'a',parentId:'FD1',stations:[{id:'S1',name:'Fixture',stateCode:'FL'}],observations:[o],acceptedRowsChecked:1,checkedAt:'2026-11-25'};
const run=(observations:LifecycleObservation[],family:'all'|'cpr'='all')=>buildConversionResearch({...s,observations},[],[],today,90,family);
test('exact observation date is a research prompt, never replacement prediction',()=>{
 const result=run([o]);assert.equal(result.rows[0].status,'verify-date');assert.equal(result.rows[0].dates[0].submissionId,'a');
 assert.equal(run([o],'cpr').rows.length,0);
 assert.equal(run([{...o,serviceEnd:undefined}]).rows[0].status,'confirm-equipment');
 assert.equal(run([{...o,model:''}]).rows[0].dates.length,0);
});
test('mixed, stale, unknown and ambiguous evidence do not become confident conversion priorities',()=>{
 assert.equal(run([o,{...o,submissionId:'b',maker:'zoll'}]).rows[0].status,'mixed-evidence');
 assert.equal(run([{...o,maker:'unknown'}]).rows.length,0);
 assert.equal(run([{...o,observedOn:'2023-01-01'}]).stale,1);
 assert.equal(run([o,{...o,submissionId:'b',serviceEnd:'2027-02-01'}]).rows[0].status,'confirm-equipment');
 assert.equal(run([o,{...o,stationId:'OTHER'}]).rows.length,0);
 assert.equal(run([{...o,stationId:'OTHER'}]).withheld,1);
 assert.equal(buildConversionResearch(undefined,[],[],today,90,'all').stationAvailable,false);
});
