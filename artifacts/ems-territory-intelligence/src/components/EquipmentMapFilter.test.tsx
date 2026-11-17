import React from 'react';import test from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {EquipmentCoverageLegend,EquipmentMapFilter} from './EquipmentMapFilter';import type {Agency} from '../types';
test('named vendor controls explain matches, counts and missing source context',()=>{
 const agencies=[{id:'1',name:'Example EMS',city:'Town',stateCode:'FL',installedFleet:{defibBrand:'LIFEPAK 15'}}] as Agency[];
 const html=renderToStaticMarkup(<EquipmentMapFilter value={{presence:'competitor',family:'monitors',vendor:'stryker'}} onChange={()=>{}} agencies={agencies}/>);
 for(const text of ['Competitor name','Stryker / Physio-Control (1)','Philips (0)','Example EMS','LIFEPAK 15','No supporting source attached','counts are not market share'])assert(html.includes(text),text);
});
test('unknown-vendor records expose their original equipment value instead of hiding it',()=>{
 const agencies=[{id:'2',name:'County EMS',city:'Town',stateCode:'TX',installedFleet:{defibBrand:'Acme Monitor 5000'}}] as Agency[];
 const html=renderToStaticMarkup(<EquipmentMapFilter value={{presence:'unknown',family:'monitors'}} onChange={()=>{}} agencies={agencies}/>);
 for(const text of ['County EMS','Monitor / defibrillator entry:','Acme Monitor 5000','manufacturer not recognized; verify with agency'])assert(html.includes(text),text);
});
test('equipment legend names every state and county coverage category',()=>{
 const html=renderToStaticMarkup(<EquipmentCoverageLegend/>);
 for(const text of ['ZOLL recorded','Competitor recorded','Both found in area','No recognized maker','No match for filter','No loaded agency records','not a complete equipment census'])assert(html.includes(text),text);
});
