import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialIntelligence, matchBenchmarkModelId, type FinancialIntelligenceProps } from './FinancialIntelligence';
import { calculateAgencyFleetTco } from '../../data/clinicalAndCompetitiveIntelligence';
import { COMPREHENSIVE_NATIONWIDE_AGENCIES } from '../../data/nationalAgenciesData';
import type { Agency } from '../../types';
const real = COMPREHENSIVE_NATIONWIDE_AGENCIES.find(a=>a.id==='zoll-agency-oh-cleveland')!;
const agency=(model:string,units=4):Agency=>({...real,installedFleet:{...real.installedFleet,defibBrand:model,defibUnitsCount:units}});
const noop=()=>{};
const props=(a:Agency):FinancialIntelligenceProps=>({
  agency:a,mode:'ems',tcoModel:null,benchmarkMatched:false,selectedBenchmarkId:null,onSelectBenchmark:noop,includedUnits:a.installedFleet.defibUnitsCount,onIncludedUnits:noop,
  unitMsrp:38500,tradeInPerUnit:4000,capturePct:65,onUnitMsrp:noop,onTradeIn:noop,onCapturePct:noop,recoveryPool:null,
});
const render=(p:FinancialIntelligenceProps)=>renderToStaticMarkup(<FinancialIntelligence {...p}/>);
test('monitor matching requires a model rather than manufacturer identity',()=>{
  assert.equal(matchBenchmarkModelId(agency('Stryker')),null);
  assert.equal(matchBenchmarkModelId(agency('Philips')),null);
  assert.equal(matchBenchmarkModelId(agency('Unknown monitor')),null);
  assert.equal(matchBenchmarkModelId(agency('Stryker LIFEPAK 15')),'lp15-intel');
  assert.equal(matchBenchmarkModelId(agency('LIFEPAK 35')),'lp35-intel');
  assert.equal(matchBenchmarkModelId(agency('HeartStart MRx')),'philips-mrx-tempus');
});
test('operating comparison renders reconciled operating totals without applying credit',()=>{
  const a=agency('LIFEPAK 15');
  const model=calculateAgencyFleetTco(a,5,4,'lp15-intel');
  const total=model.zollServiceTotal+model.zollBatteryTotal+model.zollConsumablesTotal;
  const difference=model.incumbentOperatingTotal-total;
  const html=render({...props(a),tcoModel:model,benchmarkMatched:true,selectedBenchmarkId:'lp15-intel'});
  assert.match(html,new RegExp(`\\$${total.toLocaleString()}`));
  assert.match(html,new RegExp(`\\$${difference.toLocaleString()}`));
  assert.match(html,/Trade-in credit is not included here/);
});
test('capital credit is explicitly capped and cannot produce a negative capital total',()=>{
  const html=render({...props(agency('Unknown monitor',2)),unitMsrp:100,tradeInPerUnit:200,includedUnits:2});
  assert.match(html,/capped/);
  assert.match(html,/Illustrative net replacement capital/);
  assert.match(html,/<td>Net capital<\/td><td colSpan="3">\$0<\/td>/);
  assert.doesNotMatch(html,/eligible-quantity confirmation/i);
});
test('payer discrepancies retain raw values and do not normalize displayed percentages',()=>{
  const a=agency('Unknown');a.cmsData={...a.cmsData,medicarePayerPct:120,medicaidPayerPct:0,commercialPayerMixPct:0,selfPayPayerPct:0};
  const html=render(props(a));
  assert.match(html,/120%/);assert.match(html,/outside 0–100%/);assert.match(html,/>0%<\/dd>/);
});
test('fire-only financial view omits ambulance payer metrics and recovery results',()=>{
  const html=render({...props(agency('Unknown')),mode:'fire'});
  assert.match(html,/without recorded ambulance transport/);
  assert.doesNotMatch(html,/Reported payer &amp; billing data|Illustrative annual claims recovery/);
});
test('zero and fractional reported quantities do not become missing or partial devices',()=>{
  const zero=render(props(agency('LIFEPAK 15',0)));
  assert.match(zero,/Reported monitor count is 0/);
  assert.doesNotMatch(zero,/unit count is missing/);
  const fractional=render(props(agency('LIFEPAK 15',2.5)));
  assert.match(fractional,/not a positive whole number/);
  assert.doesNotMatch(fractional,/Illustrative net replacement capital/);
});
