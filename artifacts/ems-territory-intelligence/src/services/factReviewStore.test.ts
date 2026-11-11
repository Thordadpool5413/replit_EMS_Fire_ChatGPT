import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFactReview, effectiveFactValue, factReviewStatus, loadFactReviews, FACT_REVIEW_STORAGE_KEY, safeSourceUrl, type FactReviewEntry } from './factReviewStore';
function memory() {const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
function entry(partial:Partial<FactReviewEntry>={}):FactReviewEntry {return {id:'one',agencyId:'agency-a',fieldId:'monitor.model',action:'confirm',originalValue:'Recorded monitor',previousValue:'Recorded monitor',reviewer:'Test reviewer',method:'Document review',note:'',reviewedAt:'2026-11-11T00:00:00Z',...partial};}
test('reviews persist by agency and field without blanket confirmation',()=>{
  const s=memory();appendFactReview(entry(),s);appendFactReview(entry({id:'two',agencyId:'agency-b'}),s);
  assert.equal(loadFactReviews('agency-a',s).length,1);
  assert.equal(factReviewStatus('Recorded monitor',loadFactReviews('agency-a',s)),'User confirmed');
  assert.equal(factReviewStatus('10',loadFactReviews('agency-a',s).filter(e=>e.fieldId==='monitor.quantity')),'Needs review');
});
test('corrections retain original, previous value, and immutable history',()=>{
  const s=memory();appendFactReview(entry({action:'correct',correctedValue:'New monitor'}),s);
  appendFactReview(entry({id:'two',action:'correct',previousValue:'New monitor',correctedValue:'Latest monitor'}),s);
  const history=loadFactReviews('agency-a',s);
  assert.equal(history[0].correctedValue,'New monitor');
  assert.equal(effectiveFactValue('Recorded monitor',history),'Latest monitor');
  assert.equal(effectiveFactValue('Updated source value',history),'Updated source value');
  assert.equal(factReviewStatus('Updated source value',history),'History available · review current value');
});
test('malformed storage blocks writes without replacing history',()=>{
  const s=memory();s.setItem(FACT_REVIEW_STORAGE_KEY,'bad-json');
  assert.throws(()=>appendFactReview(entry(),s),/not been overwritten/);
  assert.equal(s.getItem(FACT_REVIEW_STORAGE_KEY),'bad-json');
});
test('failed storage writes report failure',()=>{
  assert.throws(()=>appendFactReview(entry(),{getItem:()=>null,setItem:()=>{throw Error('quota');}}),/could not save/);
});
test('reviewer, method, correction and identifiers are validated',()=>{
  for(const patch of [{reviewer:''},{method:''},{agencyId:'__proto__'},{action:'correct',correctedValue:''}] as Partial<FactReviewEntry>[]){
    assert.throws(()=>appendFactReview(entry(patch),memory()),/required/);
  }
});
test('unsafe source protocols are never exposed as links',()=>{
  assert.equal(safeSourceUrl('javascript:alert(1)'),undefined);
  assert.equal(safeSourceUrl('https://example.org/research'),'https://example.org/research');
});
