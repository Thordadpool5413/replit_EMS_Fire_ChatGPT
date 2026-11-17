import React from 'react';import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {EquipmentRecordBar,EquipmentRecordSummary} from './EquipmentRecordComposition';
import {EquipmentCoverageLegend} from './EquipmentMapFilter';
import {emptyCoverage} from '../utils/equipmentGeography';
test('state bar and inspector keep proportions, counts and missing equipment explicit',()=>{
 const coverage={...emptyCoverage(),total:100,zoll:10,competitor:20,mixed:5,unknown:15,notReported:50,reported:50};
 const html=renderToStaticMarkup(<EquipmentRecordSummary coverage={coverage}/>);
 for(const text of ['100 profiles','50 of 100','market share is not established','Both at same agency','5 · 5.0% of profiles','50 · 50.0% of profiles','One directory ID counts once'])assert(html.includes(text),text);
 const svg=renderToStaticMarkup(<svg><EquipmentRecordBar coverage={coverage} width={100}/></svg>);
 assert.match(svg,/data-equipment-category="competitor" x="10" y="0" width="20"/);
 assert.match(svg,/data-equipment-category="mixed" x="30[^"]*" y="0" width="5"/);
});
test('legend describes neutral states and category bars instead of whole-state ownership',()=>{
 const html=renderToStaticMarkup(<EquipmentCoverageLegend mode="composition"/>);
 for(const text of ['State shapes are neutral geography','not statewide market share','ZOLL only','Competitor only','Both at same agency','No equipment entry reported'])assert(html.includes(text),text);
 assert(!html.includes('Both found in area'));
 const empty=renderToStaticMarkup(<EquipmentRecordSummary/>);assert(empty.includes('No eligible agency profiles'));assert(!empty.includes('NaN'));
});
