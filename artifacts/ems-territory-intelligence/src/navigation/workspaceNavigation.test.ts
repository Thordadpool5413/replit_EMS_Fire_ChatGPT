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
const stripAllowedAlertContent = (source: string) => source
  .replace(/^import[\s\S]*?;\s*/gm, '')
  .replace(/<p\b(?=[^>]*\brole="alert")[^>]*>[\s\S]*?<\/p>/gi, '')
  .replace(/<\/?ShieldAlert\b[^>]*\/?>/g, '')
  .replace(/<\/?Alert(?:Circle|Triangle)\b[^>]*\/?>/g, '')
  .replace(/Incumbent FDA Recall Alert|Active Alert:/gi, '')
  .replace(/&amp; mock alerts/gi, '');

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

test('desktop workspaces share compact tabs and quiet connection status', () => {
  const topBar = readSource('components/TopBar.tsx');
  const app = readSource('App.tsx');
  const styles = readFileSync(resolve(sourceRoot, 'index.css'), 'utf8');
  const sharedShellStyles = styles.slice(styles.lastIndexOf('Shared desktop shell sizing'));

  assert.equal(
    (app.match(/className="pi-workspace-tabs/g) || []).length,
    5,
    'Every secondary workspace toolbar should use the shared tab styling.',
  );
  assert.match(styles, /\.pi-workspace-tabs\s*\{[\s\S]*?min-height:\s*2\.4rem/);
  assert.match(styles, /\.pi-workspace-tabs button\s*\{[\s\S]*?min-height:\s*2\.05rem/);
  assert.doesNotMatch(sharedShellStyles, /pi-sidebar-logo|pi-mobile-logo/);
  assert.match(topBar, /role="status"[\s\S]*?aria-live="polite"/);
  assert.doesNotMatch(topBar, /Cloud Ready \(\$\{cloudSyncCount\}\)|Cloud Synced \(\$\{cloudSyncCount\}\)/);
  assert.doesNotMatch(topBar, /<button[\s\S]{0,160}onClick=\{toggleNetwork\}/);
  assert.doesNotMatch(app, /Choose an agency before generating a quote/);
});

test('home and mobile tools do not seed or restore alert badges', () => {
  const app = readSource('App.tsx');
  const topBar = readSource('components/TopBar.tsx');
  const home = readSource('components/HomeHubView.tsx');
  const mobileToolsStart = topBar.indexOf('/* Compact mobile utility menu');
  const mobileToolsEnd = topBar.indexOf('</header>', mobileToolsStart);
  assert.ok(mobileToolsStart >= 0 && mobileToolsEnd > mobileToolsStart, 'The mobile tools menu should remain identifiable.');
  const mobileTools = topBar.slice(mobileToolsStart, mobileToolsEnd);
  const appAndHome = `${app}\n${home}`;

  assert.doesNotMatch(
    appAndHome,
    /\balerts?\b|\bunread\b|\b(?:alertFeed|notificationFeed|unreadAlertCount|unreadNotificationCount)\b/i,
    'Home should not render an alert feed or unread-alert state.',
  );
  // If a feed is added later, replace this no-feed guard with a contract check for record IDs, sources, and timestamps.
  assert.doesNotMatch(
    `${app}\n${topBar}`,
    /(?:localStorage|sessionStorage)\.(?:getItem|setItem)\(\s*['"][^'"]*(?:alert|notification)/i,
    'Reloading should not restore alert or notification state from browser storage.',
  );
  assert.doesNotMatch(
    mobileTools,
    /\b(?:alert|notification|unread)\b/i,
    'Mobile tools should not display an alert feed or unread badge.',
  );
  assert.match(mobileTools, /pendingSyncCount > 0/, 'The mobile tools badge should only appear for pending sync work.');
  assert.match(mobileTools, /{pendingSyncCount}/, 'The mobile tools badge should show the pending sync count.');
});

test('agency profiles, Field Work, and system tools keep alerts record-backed', () => {
  const profile = readSource('components/FocusedProviderProfile.tsx');
  const fieldWork = readSource('components/FieldModeView.tsx');
  const dataHealth = readSource('components/DataHealthDashboard.tsx');
  const resilience = readSource('components/CloudBackupResilienceView.tsx');

  // These existing uses are legitimate validation feedback or domain-specific recall information.
  assert.match(profile, /role="alert">[\s\S]*?\{profileReviewError\}/);
  assert.match(profile, /tcoModel\.matchedIntel\.fdaRecallId/);
  assert.match(profile, /tcoModel\.matchedIntel\.fdaRecallSummary/);

  // "Mock alerts" is permitted only as an explicitly excluded data-audit category, never as a feed.
  assert.match(dataHealth, /5\. Mock \/ Sample \/ Test Data[\s\S]*?Blocked by DataSanitizationService[\s\S]*?&amp; mock alerts[\s\S]*?0 active \([\s\S]*?stripped\)/);

  const screens = [
    ['Agency profile', profile],
    ['Field Work', fieldWork],
    ['Data health system tool', dataHealth],
    ['Resilience system tool', resilience],
  ] as const;

  for (const [screen, source] of screens) {
    const normalizedSource = stripAllowedAlertContent(source);
    const hasAlertUi = /\b(?:alerts?|notifications?|unread)\b/i.test(normalizedSource);

    assert.doesNotMatch(
      normalizedSource,
      /\b(?:sample|mock|demo|fake)\s+(?:alerts?|notifications?)\b/i,
      `${screen} must not show a sample alert or notification feed.`,
    );
    assert.doesNotMatch(
      normalizedSource,
      /\b(?:unread(?:Alert|Notification)?Count|alertBadgeCount|notificationBadgeCount)\s*[:=]\s*(?:\{\s*)?\d+\b|\b(?:unread|alerts?|notifications?)[^\n]{0,48}\b\d+\b|\b\d+\s+(?:unread\s+)?(?:alerts?|notifications?)\b/i,
      `${screen} must not seed a hard-coded unread count.`,
    );

    if (hasAlertUi) {
      assert.match(
        source,
        /\b(?:recordId|alertId|notificationId)\b/i,
        `${screen} alert UI must identify its real source record.`,
      );
      assert.match(
        source,
        /\b(?:source|sourceName|sourceId|sourceUrl)\b/i,
        `${screen} alert UI must expose source provenance.`,
      );
      assert.match(
        source,
        /\b(?:timestamp|createdAt|occurredAt|receivedAt)\b/i,
        `${screen} alert UI must expose when its source record was created.`,
      );
    }
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
