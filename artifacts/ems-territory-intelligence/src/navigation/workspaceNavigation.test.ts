import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  FIELD_WORKSPACE_TABS,
  isFieldWorkTab,
  isOpportunitiesTab,
  isSpecialistTab,
  isSystemTab,
  isTerritoryTab,
  isTerritoryViewSelected,
  OPPORTUNITIES_WORKSPACE_TABS,
  SPECIALIST_WORKSPACE_TABS,
  SYSTEM_WORKSPACE_TABS,
  TERRITORY_WORKSPACE_TABS
} from './workspaceNavigation';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (path: string) => readFileSync(resolve(sourceRoot, path), 'utf8');
const contains = (source: string, pattern: RegExp, message: string) => {
  assert.ok(pattern.test(source), message);
};

test('workspace tab groups keep every requested view reachable and selected', () => {
  assert.deepEqual(OPPORTUNITIES_WORKSPACE_TABS.map(({ id }) => id), [
    'contracts',
    'grants',
    'pulseiq'
  ]);
  assert.ok(OPPORTUNITIES_WORKSPACE_TABS.every(({ id }) => isOpportunitiesTab(id)));

  assert.deepEqual(TERRITORY_WORKSPACE_TABS.map(({ id }) => id), [
    'states_directory',
    'google_maps',
    'map'
  ]);
  assert.ok(['states_directory', 'geo', 'google_maps', 'map', 'gis'].every(isTerritoryTab));
  assert.ok(isTerritoryViewSelected('states_directory', 'geo'));
  assert.ok(isTerritoryViewSelected('map', 'gis'));
  assert.ok(!isTerritoryViewSelected('google_maps', 'gis'));

  assert.deepEqual(FIELD_WORKSPACE_TABS.map(({ id }) => id), ['field', 'tm_dashboard']);
  assert.ok(FIELD_WORKSPACE_TABS.every(({ id }) => isFieldWorkTab(id)));
  assert.deepEqual(SPECIALIST_WORKSPACE_TABS.map(({ id }) => id), [
    'knowledge',
    'claims',
    '3d_studio',
    'gateway'
  ]);
  assert.ok(SPECIALIST_WORKSPACE_TABS.every(({ id }) => isSpecialistTab(id)));
  assert.deepEqual(SYSTEM_WORKSPACE_TABS.map(({ id }) => id), ['data_health', 'resilience']);
  assert.ok(SYSTEM_WORKSPACE_TABS.every(({ id }) => isSystemTab(id)));
});

test('desktop and mobile entry points share workspace groups and expose selected state', () => {
  const topBar = readSource('components/TopBar.tsx');
  const mobileNav = readSource('components/MobileBottomNav.tsx');
  const app = readSource('App.tsx');

  contains(topBar, /hidden md:flex/, 'Desktop workspace navigation should remain available.');
  contains(topBar, /isOpportunitiesWorkspaceTab\(activeTab\)/, 'Desktop Opportunities should use shared tab grouping.');
  contains(topBar, /isTerritoryWorkspaceTab\(activeTab\)/, 'Desktop Territory should use shared tab grouping.');
  contains(topBar, /isFieldWorkTab\(activeTab\)/, 'Desktop Field Work should use shared tab grouping.');
  contains(topBar, /isSpecialistWorkspaceTab\(activeTab\)/, 'Desktop Specialist tools should use shared tab grouping.');
  contains(topBar, /isSystemWorkspaceTab\(activeTab\)/, 'Desktop system tools should use shared tab grouping.');
  contains(topBar, /aria-current=\{isOpportunitiesActive \? 'page' : undefined\}/, 'Desktop Opportunities selection should be identifiable.');
  contains(topBar, /aria-current=\{isTerritoryActive \? 'page' : undefined\}/, 'Desktop Territory selection should be identifiable.');
  contains(topBar, /aria-current=\{isMyWorkActive \? 'page' : undefined\}/, 'Desktop Field Work selection should be identifiable.');
  contains(topBar, /aria-current=\{isSpecialistActive \? 'page' : undefined\}/, 'Desktop Specialist tools selection should be identifiable.');
  contains(topBar, /setActiveTab\(isOpportunities \? activeTab : 'contracts'\)/, 'Desktop Opportunities should open its default view.');
  contains(topBar, /setActiveTab\(isTerritory \? activeTab : 'states_directory'\)/, 'Desktop Territory should open its default view.');
  contains(topBar, /setActiveTab\(isMyWorkTab \? activeTab : 'field'\)/, 'Desktop Field Work should open Routes & notes.');
  contains(topBar, /setActiveTab\(isSpecialist \? activeTab : 'knowledge'\)/, 'Desktop Specialist tools should open its first view.');

  contains(mobileNav, /md:hidden fixed bottom-0/, 'Mobile primary navigation should remain available.');
  contains(mobileNav, /onClick=\{\(\) => navigate\('contracts'\)\}/, 'Mobile navigation should open Opportunities.');
  contains(mobileNav, /onClick=\{\(\) => navigate\('states_directory'\)\}/, 'Mobile navigation should open Territory.');
  contains(mobileNav, /onClick=\{\(\) => navigate\(isMyWork \? activeTab : 'field'\)\}/, 'Mobile navigation should open Field Work.');
  contains(mobileNav, /SPECIALIST_WORKSPACE_TABS\.map/, 'Mobile Specialist menu should expose every shared specialist view.');
  contains(mobileNav, /SYSTEM_WORKSPACE_TABS\.map/, 'Mobile system menu should expose every shared system view.');
  contains(mobileNav, /aria-current=\{isOpportunities \? 'page' : undefined\}/, 'Mobile Opportunities selection should be identifiable.');
  contains(mobileNav, /aria-current=\{isTerritory \? 'page' : undefined\}/, 'Mobile Territory selection should be identifiable.');
  contains(mobileNav, /aria-current=\{isMyWork \? 'page' : undefined\}/, 'Mobile Field Work selection should be identifiable.');
  contains(mobileNav, /aria-current=\{active \? 'page' : undefined\}/, 'Mobile Specialist selection should be identifiable.');

  for (const navName of ['Opportunities views', 'Territory views', 'Field Work views', 'Specialist tool views', 'Data and system views']) {
    contains(app, new RegExp(`aria-label="${navName}"`), `${navName} should render its shared view navigation.`);
  }
  contains(app, /aria-current=\{activeTab === item\.id \? 'page' : undefined\}/, 'Shared view tabs should expose the selected page.');
  contains(app, /aria-current=\{isTerritoryViewSelected\(item\.id, activeTab\) \? 'page' : undefined\}/, 'Territory aliases should expose the correct selected view.');
  contains(app, /onClick=\{\(\) => handleNavigateTab\(item\.id\)\}/, 'Shared view tabs should navigate to their corresponding view.');

  for (const { id } of [...OPPORTUNITIES_WORKSPACE_TABS, ...TERRITORY_WORKSPACE_TABS, ...FIELD_WORKSPACE_TABS, ...SPECIALIST_WORKSPACE_TABS, ...SYSTEM_WORKSPACE_TABS]) {
    contains(app, new RegExp(`activeTab === '${id}'`), `The ${id} view should have a corresponding rendered content branch.`);
  }
});

test('field dashboard opens Routes & notes and keeps visit actions there', () => {
  const app = readSource('App.tsx');
  const dashboard = readSource('components/ZollMobileDashboard.tsx');
  const routesAndNotes = readSource('components/FieldModeView.tsx');

  assert.match(app, /activeTab === 'tm_dashboard'[\s\S]*?<ZollMobileDashboard/);
  assert.match(app, /activeTab === 'field'[\s\S]*?<FieldModeView/);
  assert.match(dashboard, /onClick=\{\(\) => onNavigateTab\('field'\)\}/);
  assert.match(dashboard, /Open Routes & notes/);
  assert.doesNotMatch(dashboard, /toggleRoute|onAddFieldNote|handleQuickLog|setQuickNoteAgencyId/);

  assert.match(routesAndNotes, /Today's Route Stops/);
  assert.match(routesAndNotes, /setQuickNoteAgencyId/);
  assert.match(routesAndNotes, /handleQuickLog/);
});
