import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, disableNetwork } from 'firebase/firestore';

const projectId = 'demo-atlas-evidence';
const host = process.env.FIRESTORE_EMULATOR_HOST;
// Refuse all nonlocal hosts. Never use production or developer credentials.
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw Error('Run only against the local Firestore emulator.');
const workspace = 'alpha', key = 'FDID:FL:12345';
let env;
const claims = (verified = true, provider = 'google.com') => ({ email:'test@example.invalid', email_verified:verified, firebase:{sign_in_provider:provider, identities:{}} });
const client = (uid, verified = true, provider = 'google.com') => env.authenticatedContext(uid, claims(verified, provider)).firestore();
const record = (db, id = 'seed', space = workspace, agency = key) => doc(db,'workspaces',space,'agencies',agency,'evidence',id);
const records = (db, space = workspace) => collection(db,'workspaces',space,'agencies',key,'evidence');
const member = (db, uid, space = workspace) => doc(db,'workspaces',space,'members',uid);
function payload(id, uid='editor', changes={}) {
  return { agencyKey:key, agencyName:'Example Fire', stateCode:'FL', factId:id, kind:'installed-monitor',
    value:'ZOLL X Series', sourceName:'Example municipality',sourceRecordId:'report-1',sourceUrl:'https://example.gov/report.pdf',
    documentDate:'2025-01-01',dueDate:'',enteredAt:'2025-01-02T00:00:00.000Z',authorUid:uid,publishedAt:serverTimestamp(),...changes };
}
before(async ()=>{
 env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(new URL('./atlas-evidence.firestore.rules',import.meta.url),'utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const [uid,role] of [['editor','editor'],['viewer','viewer'],['unverified','editor'],['password','editor'],['revoked','editor'],['other','invalid'],['reviewer','reviewer'],['self-reviewer','reviewer']])
   await setDoc(member(db,uid),{role});
  await setDoc(member(db,'other','beta'),{role:'editor'});
  await setDoc(record(db),payload('seed'));
  await setDoc(record(db,'beta-seed','beta'),payload('beta-seed'));
 });
});
after(async()=>{if(env)await env.cleanup();});

test('anonymous, unverified, non-Google, missing and invalid membership cannot read or write',async()=>{
 for(const db of [env.unauthenticatedContext().firestore(),client('unverified',false),client('password',true,'password'),client('outsider'),client('other')]){
  await assertFails(getDocFromServer(record(db)));
  await assertFails(getDocsFromServer(query(records(db),limit(50))));
  await assertFails(setDoc(record(db,'denied'),payload('denied')));
 }
});
test('viewer can read bounded pages and own role, cannot publish or alter membership',async()=>{
 const db=client('viewer');
 await assertSucceeds(getDocFromServer(member(db,'viewer')));
 await assertSucceeds(getDocFromServer(record(db)));
 const page=await assertSucceeds(getDocsFromServer(query(records(db),limit(50))));
 assert.equal(page.size,1);
 await assertFails(setDoc(record(db,'viewer-write'),payload('viewer-write','viewer')));
 await assertFails(setDoc(member(db,'viewer'),{role:'editor'}));
 await assertFails(setDoc(member(db,'someone'),{role:'editor'}));
 await assertFails(getDocFromServer(member(db,'editor')));
 await assertFails(getDocsFromServer(collection(db,'workspaces',workspace,'members')));
});
test('editor can create a valid record and another member can read it; no edits/deletes',async()=>{
 const db=client('editor'), id='new-evidence';
 await assertSucceeds(setDoc(record(db,id),payload(id)));
 const saved=await assertSucceeds(getDocFromServer(record(client('viewer'),id)));
 assert.equal(saved.data().authorUid,'editor');
 assert.ok(saved.data().publishedAt instanceof Timestamp);
 await assertFails(updateDoc(record(db,id),{value:'Altered value'}));
 await assertFails(setDoc(record(db,id),payload(id)));
 await assertFails(deleteDoc(record(db,id)));
});
test('valid procurement and contract evidence accepted, chronological errors rejected',async()=>{
 const db=client('editor');
 await assertSucceeds(setDoc(record(db,'bid'),payload('bid','editor',{kind:'procurement-open',dueDate:'2025-02-01',value:'Monitor solicitation'})));
 await assertSucceeds(setDoc(record(db,'contract'),payload('contract','editor',{kind:'contract-expiration',value:'2028-01-01'})));
 await assertFails(setDoc(record(db,'backdated-bid'),payload('backdated-bid','editor',{kind:'procurement-open',dueDate:'2024-12-31'})));
 await assertFails(setDoc(record(db,'backdated-contract'),payload('backdated-contract','editor',{kind:'contract-expiration',value:'2024-12-31'})));
});
test('reject forged author/time, malformed, unknown, mismatched and extra fields',async()=>{
 const db=client('editor');
 const cases=[
  {authorUid:'viewer'},{publishedAt:Timestamp.fromMillis(0)},{factId:'other'},
  {agencyKey:'FDID:FL:99999'},{stateCode:'GA'},{value:'x'.repeat(501)},
  {value:'   '},{note:'private information'},{kind:'unknown'},{sourceUrl:'http://example.gov/report'},
  {sourceUrl:'https://user:pass@example.gov/doc'},{documentDate:'2025-13-01'},
  {enteredAt:'bad'},{documentDate:'2025-02-01'},{dueDate:'2025-02-01'},
  {sourceRecordId:''},{sourceUrl:42},
 ];
 for(const [i,change] of cases.entries()) {
  const id='bad-'+i; await assertFails(setDoc(record(db,id),payload(id,'editor',change)));
 }
 const missing=payload('missing');delete missing.sourceName;
 await assertFails(setDoc(record(db,'missing'),missing));
 await assertFails(setDoc(record(db,'invalid.key'),payload('invalid.key')));
});
test('cross-workspace, unbounded list, collection group and legacy paths are denied',async()=>{
 const db=client('editor');
 await assertFails(getDocFromServer(record(db,'beta-seed','beta')));
 await assertFails(getDocsFromServer(query(records(db,'beta'),limit(50))));
 await assertFails(setDoc(record(db,'cross-write','beta'),payload('cross-write')));
 await assertFails(getDocsFromServer(records(db)));
 await assertFails(getDocsFromServer(query(records(db),limit(51))));
 await assertFails(getDocsFromServer(query(collectionGroup(db,'evidence'),limit(50))));
 await assertFails(getDocFromServer(doc(db,'agencies','legacy')));
 await assertFails(setDoc(doc(db,'agencies','legacy'),{name:'not allowed'}));
});
test('membership revocation takes effect on new server operations',async()=>{
 const db=client('revoked');
 await assertSucceeds(getDocFromServer(record(db)));
 await env.withSecurityRulesDisabled(async ctx=>deleteDoc(member(ctx.firestore(),'revoked')));
 await assertFails(getDocFromServer(record(db)));
 await assertFails(getDocsFromServer(query(records(db),limit(50))));
 await assertFails(setDoc(record(db,'revoked-write'),payload('revoked-write','revoked')));
});
test('transaction read-before-create supports retry without overwriting and rejects conflicts',async()=>{
 const db=client('editor'),ref=record(db,'transaction');
 async function publish(value){
  return runTransaction(db,async tx=>{
   const snap=await tx.get(ref);
   if(snap.exists()){
    if(snap.data().value!==value)throw Error('conflict');
    return 'exists';
   }
   tx.set(ref,payload('transaction','editor',{value}));return 'created';
  });
 }
 assert.equal(await publish('LIFEPAK 15'),'created');
 assert.equal(await publish('LIFEPAK 15'),'exists');
 await assert.rejects(publish('different device'),/conflict/);
 assert.equal((await getDocFromServer(ref)).data().value,'LIFEPAK 15');
});
test('server-only reads do not report cached success when disconnected',async()=>{
 const db=client('viewer');
 await assertSucceeds(getDocFromServer(record(db)));
 await disableNetwork(db);
 await assert.rejects(getDocFromServer(record(db)));
});

const decisions=(db,id,space=workspace)=>collection(record(db,id,space),'decisions');
const decision=(db,id,action,space=workspace)=>doc(decisions(db,id,space),action);
const reviewPayload=(id,action,reason,replacementId='',uid='reviewer',extra={})=>({factId:id,action,reason,replacementId,reviewerUid:uid,reviewedAt:serverTimestamp(),...extra});
async function seedGovernance(id,changes={},uid='editor'){
 const db=client('editor');
 await assertSucceeds(setDoc(record(db,id),payload(id,uid,changes)));
}
test('reviewer role can read and approve but cannot publish; editor and viewer cannot review',async()=>{
 await seedGovernance('gov-role');
 const reviewer=client('reviewer'),viewer=client('viewer'),editor=client('editor');
 await assertSucceeds(getDocFromServer(record(reviewer,'gov-role')));
 await assertFails(setDoc(record(reviewer,'reviewer-publish'),payload('reviewer-publish','reviewer')));
 await assertFails(setDoc(decision(editor,'gov-role','approved'),reviewPayload('gov-role','approved','source-checked','','editor')));
 await assertFails(setDoc(decision(viewer,'gov-role','approved'),reviewPayload('gov-role','approved','source-checked','','viewer')));
 await assertSucceeds(setDoc(decision(reviewer,'gov-role','approved'),reviewPayload('gov-role','approved','source-checked')));
 const page=await assertSucceeds(getDocsFromServer(query(decisions(viewer,'gov-role'),limit(5))));
 assert.equal(page.size,1);
 assert.equal(page.docs[0].data().reviewerUid,'reviewer');
 await assertFails(getDocsFromServer(decisions(reviewer,'gov-role')));
 await assertFails(getDocFromServer(decision(client('outsider'),'gov-role','approved')));
});
test('review decisions are immutable and validate actor, reason, target and time',async()=>{
 await seedGovernance('gov-invalid');
 const db=client('reviewer'),ref=decision(db,'gov-invalid','challenged');
 for(const changes of [{reviewerUid:'editor'},{reviewedAt:Timestamp.fromMillis(0)},{reason:'private free text'},{replacementId:'x'},{factId:'other'},{action:'withdrawn'},{extra:'not allowed'}]){
  await assertFails(setDoc(ref,reviewPayload('gov-invalid','challenged','source-conflict','','reviewer',changes)));
 }
 await assertFails(setDoc(decision(db,'missing-evidence','approved'),reviewPayload('missing-evidence','approved','source-checked')));
 await assertFails(setDoc(decision(db,'beta-seed','approved','beta'),reviewPayload('beta-seed','approved','source-checked')));
 await assertSucceeds(setDoc(ref,reviewPayload('gov-invalid','challenged','source-conflict')));
 await assertFails(updateDoc(ref,{reason:'incorrect-value'}));
 await assertFails(deleteDoc(ref));
 await assertFails(setDoc(ref,reviewPayload('gov-invalid','challenged','source-conflict')));
 await assertFails(setDoc(decision(db,'gov-invalid','approved'),reviewPayload('gov-invalid','approved','source-checked')));
 await assertSucceeds(setDoc(decision(db,'gov-invalid','withdrawn'),reviewPayload('gov-invalid','withdrawn','incorrect-value')));
});
test('reviewers cannot approve their own evidence even after a role change',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>setDoc(record(ctx.firestore(),'gov-self'),payload('gov-self','self-reviewer')));
 const db=client('self-reviewer');
 await assertFails(setDoc(decision(db,'gov-self','approved'),reviewPayload('gov-self','approved','source-checked','','self-reviewer')));
});
test('supersession requires distinct matching independently approved replacement and cannot create cycles',async()=>{
 const db=client('reviewer');
 for(const id of ['gov-old','gov-new','gov-wrong','gov-blocked'])await seedGovernance(id,id==='gov-wrong'?{kind:'installed-cpr'}:{});
 const supersede=(from,to)=>setDoc(decision(db,from,'superseded'),reviewPayload(from,'superseded','corrected-evidence',to));
 await assertFails(supersede('gov-old','gov-old'));
 await assertFails(supersede('gov-old','gov-new'));
 await assertSucceeds(setDoc(decision(db,'gov-wrong','approved'),reviewPayload('gov-wrong','approved','source-checked')));
 await assertFails(supersede('gov-old','gov-wrong'));
 await assertSucceeds(setDoc(decision(db,'gov-blocked','approved'),reviewPayload('gov-blocked','approved','source-checked')));
 await assertSucceeds(setDoc(decision(db,'gov-blocked','withdrawn'),reviewPayload('gov-blocked','withdrawn','incorrect-value')));
 await assertFails(supersede('gov-old','gov-blocked'));
 await assertSucceeds(setDoc(decision(db,'gov-old','approved'),reviewPayload('gov-old','approved','source-checked')));
 await assertSucceeds(setDoc(decision(db,'gov-new','approved'),reviewPayload('gov-new','approved','source-checked')));
 const batch=writeBatch(db);
 batch.set(decision(db,'gov-old','superseded'),reviewPayload('gov-old','superseded','corrected-evidence','gov-new'));
 batch.set(decision(db,'gov-new','superseded'),reviewPayload('gov-new','superseded','corrected-evidence','gov-old'));
 await assertFails(batch.commit());
 await assertSucceeds(supersede('gov-old','gov-new'));
 await assertFails(supersede('gov-new','gov-old'));
 await assertSucceeds(getDocFromServer(record(db,'gov-old')));
});
test('contract corrections must refer to the same issuer and record',async()=>{
 const db=client('reviewer');
 for(const [id,sourceRecordId] of [['gov-contract-old','contract-1'],['gov-contract-other','contract-2'],['gov-contract-new','contract-1']]){
   await seedGovernance(id,{kind:'contract-expiration',value:'2028-01-01',sourceRecordId});
   await assertSucceeds(setDoc(decision(db,id,'approved'),reviewPayload(id,'approved','source-checked')));
 }
 await assertFails(setDoc(decision(db,'gov-contract-old','superseded'),reviewPayload('gov-contract-old','superseded','corrected-evidence','gov-contract-other')));
 await assertSucceeds(setDoc(decision(db,'gov-contract-old','superseded'),reviewPayload('gov-contract-old','superseded','corrected-evidence','gov-contract-new')));
});
