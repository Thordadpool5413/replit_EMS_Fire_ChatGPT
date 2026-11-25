import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLifecycleTimeline,lifecycleWindow,type LifecycleSample} from './lifecycleTimeline';
const obs={stationId:'S1',submissionId:'1',family:'monitors',maker:'zoll',model:'Fixture',apparatus:'Unit 1',observedOn:'2026-01-01',basis:'direct-observation',sourceUrl:'',acquiredOn:'2024-01-01',serviceEnd:'2026-03-01'};
const sample:LifecycleSample={agencyId:'a',parentId:'FD1',stations:[{id:'S1',name:'Fixture',stateCode:'FL'}],observations:[obs],acceptedRowsChecked:1,checkedAt:'2026-02-01'};
test('lifecycle uses exact dates and preserves distinct station scope',()=>{
 const rows=buildLifecycleTimeline(sample,[],'2026-02-01');
 assert.equal(rows.length,2);assert.equal(lifecycleWindow(rows[0],'2026-02-01',90),'history');assert.equal(lifecycleWindow(rows[1],'2026-02-01',90),'within-window');
 assert.equal(rows[1].scope,'station');assert.equal(rows[1].kind,'service');
});
test('ambiguous date observations are not prioritized, invalid and duplicate identities withheld',()=>{
 const rows=buildLifecycleTimeline({...sample,observations:[obs,{...obs,submissionId:'2',serviceEnd:'2026-04-01'},{...obs,submissionId:'3',stationId:'OTHER'}]},[],'2026-02-01');
 assert.equal(rows.filter(r=>r.kind==='service'&&r.ambiguous).length,2);
 assert.ok(rows.filter(r=>r.kind==='service').every(r=>lifecycleWindow(r,'2026-02-01',90)==='ambiguous'));
 assert.equal(buildLifecycleTimeline({...sample,observations:[obs,obs]},[],'2026-02-01').length,0);
 assert.equal(buildLifecycleTimeline({...sample,observations:[{...obs,serviceEnd:'2026-02-30'}]},[],'2026-02-01').length,1);
});
