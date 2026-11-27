import assert from 'node:assert/strict';
import test from 'node:test';
import { departmentAliases, departmentProfile, isCombinedDepartment } from './departmentIdentity';
import { directoryProviders, directorySourceMatches, type SourceDirectoryRecord } from './nationalSourceDirectory';
import { activeProviderRecords, matchesAgencyScope } from '../utils/providerRecordTrust';
import type { Agency } from '../types';

test('Flagler county license, station registry and fire registry open one department',()=>{
 const destination = { state:'FL', source:'registry', id:'usfa:FL:61091' };
 assert.deepEqual(departmentProfile({state:'FL',source:'state-ems',id:'1801'}),destination);
 assert.deepEqual(departmentProfile({state:'FL',source:'neris',id:'FD12035253'}),destination);
 assert.ok(departmentAliases('FL','FDID:FL:61091').includes('STATE-EMS:FL:license:1801'));
 assert.ok(isCombinedDepartment('FDID:FL:61091'));
 assert.equal(departmentProfile({state:'OH',source:'state-ems',id:'1801'}).state,'OH');
});

test('Orange County billing and fire identities produce one selectable provider under both scopes',()=>{
 const fire = ['usfa:FL:07252','USFA','Orange County Fire Rescue Department','FL'] as SourceDirectoryRecord;
 const billing = ['nppes:1033215348','NPPES','Orange County Board of County Commissioners','FL'] as SourceDirectoryRecord;
 assert.deepEqual(directoryProviders([billing,fire]),[fire]);
 assert.ok(directorySourceMatches(fire,'NPPES'));
 assert.ok(directorySourceMatches(fire,'USFA'));
 const saved = (row:SourceDirectoryRecord):Agency=>({id:row[0],stateCode:'FL',name:row[2],registryIdentity:{sourceName:row[1]==='USFA'?'USFA NFDR':'NPPES',stateCode:'FL',identifier:row[0].split(':').pop()}} as Agency);
 const hospital={id:'hospital',stateCode:'FL',name:'Holmes Regional Medical Center',agencyType:'EMS'} as Agency;
 const visible = activeProviderRecords([hospital,saved(billing),saved(fire)]);
 assert.deepEqual(visible.map(a=>a.id),[fire[0]]);
 assert.ok(matchesAgencyScope(visible[0],'ems') && matchesAgencyScope(visible[0],'fire'));
});
