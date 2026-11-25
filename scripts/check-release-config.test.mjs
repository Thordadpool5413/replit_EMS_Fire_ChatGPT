import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseConfigIssues} from './check-release-config.mjs';
const env={DATABASE_URL:'fixture',REPL_ID:'fixture',AI_INTEGRATIONS_GEMINI_BASE_URL:'fixture',AI_INTEGRATIONS_GEMINI_API_KEY:'fixture',ATLAS_PUBLIC_ORIGIN:'https://atlas.example',ATLAS_AGENCY_EDITOR_IDS:'editor',ATLAS_AGENCY_VIEWER_IDS:'viewer'};
test('release preflight requires configuration and exact origin, never prints values',()=>{
 assert.deepEqual(releaseConfigIssues(env),[]);
 assert.ok(releaseConfigIssues({}).length>=6);
 for(const origin of ['http://atlas.example','https://atlas.example/','https://atlas.example/path','https://user:secret@atlas.example'])assert.ok(releaseConfigIssues({...env,ATLAS_PUBLIC_ORIGIN:origin}).some(x=>x.includes('ATLAS_PUBLIC_ORIGIN')));
 assert.ok(releaseConfigIssues({...env,ATLAS_AGENCY_VIEWER_IDS:'editor'}).some(x=>x.includes('overlapping')));
 assert.ok(!JSON.stringify(releaseConfigIssues({...env,ATLAS_PUBLIC_ORIGIN:'https://secret@atlas.example'})).includes('secret'));
});
