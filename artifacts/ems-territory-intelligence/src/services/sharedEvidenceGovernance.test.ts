import assert from 'node:assert/strict';
import test from 'node:test';
import {readDecision, summarizeDecisions, validDecisionDraft, sameDecision,type DecisionAction,type EvidenceDecision} from './sharedEvidenceGovernance';
const row=(action:DecisionAction,reason:string,replacementId=''):EvidenceDecision=>({action,reason,replacementId,factId:'f1',reviewerUid:'reviewer-1',reviewedAt:'2026-11-24T00:00:00.000Z'});
const approval=row('approved','source-checked'),challenge=row('challenged','source-conflict'),withdrawal=row('withdrawn','source-retracted'),replacement=row('superseded','corrected-evidence','f2');
test('pending approval and all blocking decisions have deterministic precedence',()=>{
 assert.equal(summarizeDecisions([]),'pending');
 assert.equal(summarizeDecisions([approval]),'approved');
 assert.equal(summarizeDecisions([challenge,approval]),'challenged');
 assert.equal(summarizeDecisions([replacement,approval,challenge]),'superseded');
 assert.equal(summarizeDecisions([withdrawal,replacement,challenge,approval]),'withdrawn');
 assert.equal(summarizeDecisions([approval,approval]),'unavailable');
 assert.equal(summarizeDecisions([approval],1),'unavailable');
});
test('action, reason and replacement are bounded and action-specific',()=>{
 for(const v of [approval,challenge,withdrawal,replacement])assert.equal(validDecisionDraft(v,'f1'),true);
 for(const v of [{...approval,reason:'free form'},{...approval,replacementId:'f2'},{...replacement,replacementId:'f1'},{...replacement,replacementId:'../f2'},{...replacement,replacementId:''},{...approval,action:'toString'},null])assert.equal(validDecisionDraft(v,'f1'),false);
});
test('malformed paths, actors or timestamps are withheld',()=>{
 assert.deepEqual(readDecision(approval,'f1','approved'),approval);
 assert.equal(readDecision(approval,'f2','approved'),undefined);
 assert.equal(readDecision(approval,'f1','challenged'),undefined);
 assert.equal(readDecision({...approval,reviewerUid:''},'f1','approved'),undefined);
 assert.equal(readDecision({...approval,reviewedAt:'bad'},'f1','approved'),undefined);
});
test('retries are identical only for the same action, reason, replacement and actor',()=>{
 assert.equal(sameDecision(approval,approval,'reviewer-1'),true);
 assert.equal(sameDecision(approval,approval,'other'),false);
 assert.equal(sameDecision(replacement,{...replacement,replacementId:'f3'},'reviewer-1'),false);
});
