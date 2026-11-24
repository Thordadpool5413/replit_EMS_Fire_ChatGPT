import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, disableNetwork } from 'firebase/firestore';

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
  for(const [uid,role] of [['editor','editor'],['viewer','viewer'],['unverified','editor'],['password','editor'],['revoked','editor'],['other','invalid']])
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
