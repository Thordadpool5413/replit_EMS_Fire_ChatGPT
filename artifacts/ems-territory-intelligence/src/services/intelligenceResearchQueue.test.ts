import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {assessResearchField,buildIntelligenceResearchQueue,RESEARCH_FIELDS} from './intelligenceResearchQueue';
const now=Date.parse('2026-11-24T12:00:00Z');
const agency={id:'a',name:'Example EMS',stateCode:'VA',isBookmarked:true,inDayRoute:false,installedFleet:{defibBrand:'ZOLL X Series'},competitorContract:{contractEndDate:'2026-02-31'},factEvidence:{defibrillatorBiomedicalFleet:{sourceKind:'logic',sourceName:'Estimate',sourceRecordId:'model',note:'Model',reviewed:true}}} as unknown as Agency;
const monitor=RESEARCH_FIELDS[0],contract=RESEARCH_FIELDS.at(-1)!;
const fact={id:'f',fieldKey:'defibrillatorBiomedicalFleet',value:'ZOLL X Series',sourceName:'Town equipment ledger',sourceRecordId:'inventory-1',sourceUrl:'https://example.gov/inventory/1',geographicLevel:'agency',geographicId:'a',basis:'source-reported',enteredAt:'2026-11-20T00:00:00Z'} as const;
test('category-level or modeled evidence cannot promote a specific recorded value',()=>{
 assert.equal(assessResearchField(agency,monitor,now).status,'recorded-unsubstantiated');
 assert.equal(assessResearchField(agency,contract,now).status,'invalid');
 for(const source of [{...fact,basis:'calculated'},{...fact,geographicLevel:'county'},{...fact,geographicId:'b'},{...fact,value:'ZOLL R Series'},{...fact,sourceUrl:'javascript:bad'},{...fact,enteredAt:'2027-01-01'}])assert.equal(assessResearchField({...agency,sourceFacts:[source]} as Agency,monitor,now).status,'recorded-unsubstantiated');
 assert.equal(assessResearchField({...agency,sourceFacts:[fact]},monitor,now).status,'value-matched-source');
});
test('review bound to original field and exact value; flag and correction stay distinguishable',()=>{
 const review={id:'r',agencyId:'a',fieldId:'monitor.model',action:'confirm',originalValue:'ZOLL X Series',previousValue:'ZOLL X Series',reviewer:'User',method:'Checked',note:'',reviewedAt:'2026-11-23'} as const;
 assert.equal(assessResearchField({...agency,_factReviews:[review]},monitor,now).status,'user-confirmed');
 assert.equal(assessResearchField({...agency,_factReviews:[{...review,action:'flag'}]},monitor,now).status,'flagged');
 assert.equal(assessResearchField({...agency,installedFleet:{...agency.installedFleet,defibBrand:'Other brand'},_factReviews:[review]},monitor,now).status,'recorded-unsubstantiated');
});
test('queue deduplicates loaded IDs, defaults to saved accounts and does not rank invented revenue',()=>{
 const q=buildIntelligenceResearchQueue([agency,{...agency},{...agency,id:'b',stateCode:'TX',isBookmarked:false,verificationSource:'Geographic prospect generator'}],'all','saved',now);
 assert.equal(q.accounts,1);assert.equal(q.accountsNeedingResearch,1);assert.equal(q.rows[0].flagged,1);
 assert.equal(buildIntelligenceResearchQueue([agency],'TX','loaded',now).accounts,0);
});
