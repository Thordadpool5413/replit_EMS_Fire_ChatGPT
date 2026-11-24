import test from 'node:test';
import assert from 'node:assert/strict';
import {runScopedAudit,validateAuditScope} from './audit-production-providers.mjs';
const scope={projectId:'atlas-test',databaseId:'(default)',stateCode:'VA',authorizationReference:'approved test scope',agencyIds:['fire-va-51001-chi','legacy-2','missing']};
const fields={stateCode:{stringValue:'VA'},fdid:{stringValue:'VA-FD-51001-CHI'},verificationSource:{stringValue:'Geographic prospect generator'},npiNumber:{stringValue:'1234567893'},competitorContract:{mapValue:{fields:{contractEndDate:{stringValue:'2028-02-28'}}}},privateNotes:{stringValue:'DO NOT EXPORT'}};
test('explicit scoped audit is GET only, uses field masks, identifies legacy synthetic data and duplicate candidates',async()=>{
 const requests=[];
 const report=await runScopedAudit(scope,'mock-secret',{now:()=> '2026-11-24T00:00:00Z',fetchImpl:async(u,o)=>{
 requests.push(u.href);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.equal(o.headers.Authorization,'Bearer mock-secret');assert(!u.searchParams.getAll('mask.fieldPaths').some(x=>/notes|contacts/i.test(x)));
 const id=decodeURIComponent(u.pathname.split('/').at(-1));if(id==='missing')return new Response(null,{status:404});
 return Response.json({name:'projects/atlas-test/databases/(default)/documents/agencies/'+id,fields});
 }});
 assert.equal(requests.length,3);assert.equal(report.inspected,2);assert.equal(report.notFound,1);assert.equal(report.flags['synthetic-fdid'],2);assert.equal(report.flags['contract-date-needs-agency-evidence'],2);assert.equal(report.duplicateIdentifierCandidates[0].identifier,'NPI:1234567893');
 assert(!JSON.stringify(report).includes('mock-secret'));assert(!JSON.stringify(report).includes('DO NOT EXPORT'));assert(!JSON.stringify(report).includes('approved test scope'));
});
test('wrong state is isolated, permission failure aborts, broad or malformed scope is rejected',async()=>{
 const one={...scope,agencyIds:['other-state']};
 const report=await runScopedAudit(one,'token',{fetchImpl:async()=>Response.json({name:'projects/atlas-test/databases/(default)/documents/agencies/other-state',fields:{stateCode:{stringValue:'TX'}}})});
 assert.deepEqual(report.rows,[{id:'other-state',outcome:'scope-mismatch'}]);
 await assert.rejects(runScopedAudit(one,'token',{fetchImpl:async()=>new Response(null,{status:403})}),/HTTP 403/);
 assert.throws(()=>validateAuditScope({...scope,agencyIds:[]}),/1–100/);
 assert.throws(()=>validateAuditScope({...scope,agencyIds:['a','a']}),/duplicate/);
 assert.throws(()=>validateAuditScope({...scope,agencyIds:['../other']}),/invalid/);
 assert.throws(()=>validateAuditScope({...scope,agencyIds:Array.from({length:101},(_,i)=>'id'+i)}),/1–100/);
});
