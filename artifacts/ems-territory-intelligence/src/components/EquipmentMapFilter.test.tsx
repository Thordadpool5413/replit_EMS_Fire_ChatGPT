import React from 'react';import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {EquipmentMapFilter} from './EquipmentMapFilter';import type {Agency} from '../types';
test('named vendor controls explain matches, counts and missing source context',()=>{
 const agencies=[{id:'1',name:'Example EMS',city:'Town',stateCode:'FL',installedFleet:{defibBrand:'LIFEPAK 15'}}] as Agency[];
 const html=renderToStaticMarkup(<EquipmentMapFilter value={{presence:'competitor',family:'monitors',vendor:'stryker'}} onChange={()=>{}} agencies={agencies}/>);
 for(const text of ['Competitor name','Stryker / Physio-Control (1)','Philips (0)','Example EMS','LIFEPAK 15','No supporting source attached','counts are not market share'])assert(html.includes(text),text);
});
