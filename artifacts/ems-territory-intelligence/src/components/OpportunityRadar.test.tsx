import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Agency} from '../types';
import {OpportunityRadar} from './OpportunityRadar';
test('empty radar does not invent opportunities and exposes method and missing-evidence status',()=>{
 const a={id:'unknown',name:'Example Fire Department',stateCode:'FL'} as Agency;
 const html=renderToStaticMarkup(<OpportunityRadar agencies={[a]}/>);
 assert.match(html,/data-testid="opportunity-radar"/);
 assert.match(html,/No eligible priority signals/);
 assert.match(html,/not AI prediction/);
 assert.match(html,/1 loaded rows without typed evidence/);
 assert.doesNotMatch(html,/NaN|undefined/);
});
