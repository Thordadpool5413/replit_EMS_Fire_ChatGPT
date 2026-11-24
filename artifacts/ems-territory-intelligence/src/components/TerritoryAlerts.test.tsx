import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TerritoryAlerts} from './TerritoryAlerts';
import {buildLocalTerritoryAlerts,buildPublicTerritoryAlerts} from '../services/territoryAlerts';
test('empty or unavailable alerts distinguish absence of evidence from absence of opportunity',()=>{
 const data={local:buildLocalTerritoryAlerts([]),public:buildPublicTerritoryAlerts(undefined),alerts:[],feedStatus:'unavailable' as const,refresh:()=>{}};
 const html=renderToStaticMarkup(<TerritoryAlerts data={data} onFollowUps={()=>{}}/>);
 assert.match(html,/data-testid="territory-alerts"/);assert.match(html,/Public feed unavailable or not initialized/);assert.match(html,/No alerts in this selection/);assert.match(html,/No push, email, background delivery/);assert.doesNotMatch(html,/NaN|undefined/);
});
