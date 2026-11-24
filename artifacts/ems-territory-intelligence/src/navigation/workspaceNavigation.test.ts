import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  PRIMARY_WORKSPACES, primaryWorkspaceFor,
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

test('four daily workspaces retain every legacy route and administrative destination', () => {
  assert.deepEqual(PRIMARY_WORKSPACES.map(i=>i.label),['Map','Agencies','Field Work','Reports']);
  for (const id of ['home','states_directory','geo','map','gis','google_maps']) assert.equal(primaryWorkspaceFor(id),'home');
  assert.equal(primaryWorkspaceFor('queue'),'queue');
  for(const id of ['field','tm_dashboard']) assert.equal(primaryWorkspaceFor(id),'field');
  for(const id of ['reports','contracts','grants','pulseiq','knowledge','3d_studio']) assert.equal(primaryWorkspaceFor(id),'reports');
  for(const id of ['settings','data_health','resilience','gateway','claims']) assert.equal(primaryWorkspaceFor(id),'settings');
  for(const file of ['components/TopBar.tsx','components/MobileBottomNav.tsx']) {
    const source=readSource(file);assert.match(source,/PRIMARY_WORKSPACES/);assert.match(source,/primaryWorkspaceFor/);assert.match(source,/aria-current/);
  }
  const app=readSource('App.tsx');
  for(const {id} of [...OPPORTUNITIES_WORKSPACE_TABS,...TERRITORY_WORKSPACE_TABS,...FIELD_WORKSPACE_TABS,...SPECIALIST_WORKSPACE_TABS,...SYSTEM_WORKSPACE_TABS]) assert.ok(app.includes(`activeTab === '${id}'`));
});

test('desktop workspaces share compact tabs and quiet connection status', () => {
  const topBar = readSource('components/TopBar.tsx');
  const app = readSource('App.tsx');
  const styles = readSource('styles/shared/records.css');
  const sharedShellStyles = readSource('styles/shell/records.css');

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

test('home and mobile tools do not seed or restore alert badges; Reports count is derived from records', () => {
  const app = readSource('App.tsx');
  const topBar = readSource('components/TopBar.tsx');
  const mobileNav = readSource('components/MobileBottomNav.tsx');
  const home = readSource('components/HomeHubView.tsx');
  const hub = readSource('components/WorkspaceHub.tsx');
  const panel = readSource('components/TerritoryAlerts.tsx');
  const engine = readSource('services/territoryAlerts.ts');
  const hook = readSource('hooks/useTerritoryAlerts.ts');
  const mobileToolsStart = topBar.indexOf('/* Compact mobile utility menu');
  const mobileToolsEnd = topBar.indexOf('</header>', mobileToolsStart);
  assert.ok(mobileToolsStart >= 0 && mobileToolsEnd > mobileToolsStart, 'The mobile tools menu should remain identifiable.');
  const mobileTools = topBar.slice(mobileToolsStart, mobileToolsEnd);
  // Only Reports has the record-backed alert panel; home stays focused on the map.
  const normalizedHome = home.replace(/role="alert"/g, '').replace(/\bpi-alert-banner\b/g, '');
  assert.doesNotMatch(normalizedHome, /\balerts?\b|\bunread\b|\b(?:alertFeed|notificationFeed|unreadAlertCount|unreadNotificationCount)\b/i);
  assert.match(app, /const territoryAlerts = useTerritoryAlerts\(agencies, isOnline\)/);
  assert.equal((app.match(/territoryAlertCount=\{territoryAlerts\.alerts\.length\}/g) ?? []).length, 2);
  assert.match(app, /<WorkspaceHub territoryAlerts=\{territoryAlerts\}/);
  assert.match(hub, /kind==='reports'&&territoryAlerts&&<TerritoryAlerts data=\{territoryAlerts\}/);
  assert.equal((hub.match(/<TerritoryAlerts\b/g) ?? []).length, 1);
  for (const nav of [topBar,mobileNav]) {
    assert.match(nav, /item\.id\s*===\s*'reports'\s*&&\s*territoryAlertCount\s*>\s*0/);
    assert.match(nav, /territoryAlertCount>99\?'99\+':territoryAlertCount/);
    assert.doesNotMatch(nav, /unread(?:Alert|Notification)Count/);
  }
  assert.match(hook, /buildLocalTerritoryAlerts\(agencies,clock\)/);
  assert.match(hook, /buildPublicTerritoryAlerts\(feed,clock\)/);
  assert.match(engine, /buildOpportunityPriorities\(agencies,'all','all',now\)/);
  assert.match(engine, /validateDiscoveryFeed\(input,now\)/);
  assert.match(engine, /feedIsStale\(feed,now\)/);
  assert.match(engine, /i\.lastSeen===feed\.runAt&&i\.lastChanged===feed\.runAt&&i\.event!=='baseline'/);
  assert.match(panel, /sourceRecordId/);
  assert.match(panel, /sourceUrl/);
  assert.match(panel, /documentDate/);
  assert.match(panel, /nativeId/);
  assert.match(panel, /a\.date/);
  assert.doesNotMatch(
    [app,topBar,mobileNav,hub,panel,hook,engine].join('\n'),
    /(?:localStorage|sessionStorage)\.(?:getItem|setItem)\(\s*['"][^'"]*(?:alert|notification)/i,
    'Reloading should not restore alert or notification state from browser storage.',
  );
  assert.doesNotMatch([app,topBar,mobileNav,hub,panel,hook,engine].join('\n'), /\b(?:unreadAlertCount|unreadNotificationCount|alertBadgeCount|notificationBadgeCount)\s*[:=]\s*(?:\{\s*)?\d+\b/i);
  assert.doesNotMatch(mobileTools, /\b(?:alert|notification|unread)\b/i, 'Mobile tools should not display an alert feed or unread badge.');
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
  assert.match(profile, /benchmarkIntel\.fdaRecallId/);
  assert.match(profile, /benchmarkIntel\.fdaRecallSummary/);

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
