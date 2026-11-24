import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOhioRoster} from './refresh-ohio-state-ems.mjs';
const header=['Agency Code','Agency Name','Headquarters City','EMS Service Level','Chief Name'];
const html=rows=>'<div id="js-placeholder-json-data">'+JSON.stringify([header,...rows])+'</div>';
test('refresh stages only identity, city and service level and does not fabricate source date',()=>{
 const roster=parseOhioRoster(html([['001','Example EMS','Town','Paramedic','Private name']]),'2026-11-24',1);
 assert.deepEqual(roster.records,[{identifier:'001',name:'Example EMS',city:'Town',serviceLevel:'Paramedic'}]);assert.equal(roster.sourceDate,null);assert.equal(JSON.stringify(roster).includes('Private name'),false);
});
test('refresh fails closed on duplicate codes, incomplete data and changed headers',()=>{
 assert.throws(()=>parseOhioRoster(html([['A','EMS','Town','EMT',''],['a','EMS','Town','EMT','']]),'2026-11-24',1),/duplicate/);
 assert.throws(()=>parseOhioRoster(html([['A','EMS','Town','EMT','']])) ,/small/);
 assert.throws(()=>parseOhioRoster('<div id="js-placeholder-json-data">[["unknown"]]</div>','2026-11-24',1),/format|schema/);
});
