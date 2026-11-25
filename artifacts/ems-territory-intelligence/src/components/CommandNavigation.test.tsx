import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommandNavigation,COMMAND_VIEW_GROUPS,COMMAND_VIEW_LABELS} from './CommandNavigation';
import {COMMAND_VIEWS} from '../services/territoryCommand';
test('all command views remain available exactly once in both viewport sizes',()=>{
 const entries=COMMAND_VIEW_GROUPS.flatMap(g=>g.views);
 assert.deepEqual([...entries].sort(),[...COMMAND_VIEWS].sort());
 assert.equal(new Set(entries).size,COMMAND_VIEWS.length);
 for(const view of COMMAND_VIEWS){
  const html=renderToStaticMarkup(<CommandNavigation view={view} onView={()=>{}}/>);
  assert.equal((html.match(/<select\b/g)??[]).length,1);
  assert.equal((html.match(/<option\b/g)??[]).length,COMMAND_VIEWS.length);
  assert.ok(html.includes('value="'+view+'" selected=""'));
  assert.ok(html.includes(COMMAND_VIEW_LABELS[view]));
  assert.match(html,/<label for=/);
  assert.equal(html.includes('Back to overview'),view!=='overview');
 }
});
