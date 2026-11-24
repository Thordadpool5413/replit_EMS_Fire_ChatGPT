import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Agency} from '../../types';
import {PreCallPlanner} from './PreCallPlanner';
test('pre-call planner renders a compact source-gated plan with three questions and user-controlled copy',()=>{
 const a={id:'unmapped',name:'Example department',stateCode:'FL'} as Agency;
 const html=renderToStaticMarkup(<PreCallPlanner agency={a} directory={[a]} onOpenSources={()=>{}}/>);
 assert.match(html,/data-testid="provider-precall-planner"/);
 assert.match(html,/Identity review required/);
 assert.match(html,/Copy preparation brief/);
 assert.match(html,/No automatic save or external AI request/);
 assert.equal((html.match(/<li>/g)??[]).length,3);
 assert.doesNotMatch(html,/NaN|undefined|Original supporting document/);
});
