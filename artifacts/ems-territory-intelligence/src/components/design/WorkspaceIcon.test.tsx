import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WORKSPACE_ICONS,WorkspaceIcon,WorkspaceHeading} from './WorkspaceIcon';
import {PRIMARY_WORKSPACES,TERRITORY_WORKSPACE_TABS,FIELD_WORKSPACE_TABS,OPPORTUNITIES_WORKSPACE_TABS,SPECIALIST_WORKSPACE_TABS,SYSTEM_WORKSPACE_TABS} from '../../navigation/workspaceNavigation';
test('every primary and secondary destination has an explicit icon mapping',()=>{
 for(const item of [...PRIMARY_WORKSPACES,...TERRITORY_WORKSPACE_TABS,...FIELD_WORKSPACE_TABS,...OPPORTUNITIES_WORKSPACE_TABS,...SPECIALIST_WORKSPACE_TABS,...SYSTEM_WORKSPACE_TABS]) {
  assert(WORKSPACE_ICONS[item.id],item.id);
  const html=renderToStaticMarkup(<WorkspaceIcon name={item.id}/>);
  assert(html.includes('aria-hidden="true"'));
  assert(html.includes('stroke-width="1.8"'));
 }
});
test('workspace titles remain textual with decorative icons and readable descriptions',()=>{
 const html=renderToStaticMarkup(<WorkspaceHeading name="field" title="Field work" description="Plan the next conversation."/>);
 assert(html.includes('<h1>Field work</h1>'));
 assert(html.includes('Plan the next conversation.'));
 assert(html.includes('data-workspace-icon="field"'));
});
