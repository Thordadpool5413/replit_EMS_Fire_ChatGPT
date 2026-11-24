import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Agency} from '../../types';
import {ProviderCompetitiveProfile} from './ProviderCompetitiveProfile';
const a={id:'unmapped',name:'Example department',stateCode:'FL'} as Agency;
test('compact provider evidence panels use one disclosure and do not imply verified deployment or initiate retrieval',()=>{
 for(const view of ['equipment','purchasing'] as const){
  const html=renderToStaticMarkup(<ProviderCompetitiveProfile agency={a} directory={[a]} view={view} onOpenSources={()=>{}}/>);
  assert.match(html,new RegExp('data-testid="provider-competitive-'+view+'"'));
  assert.match(html,/aria-expanded="false"/);assert.match(html,/Source identity or evidence review needed/);
  assert.doesNotMatch(html,/Find possible grant records|current fleet verification|NaN|undefined/);
 }
});
