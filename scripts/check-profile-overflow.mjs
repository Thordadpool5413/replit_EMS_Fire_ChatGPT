import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl =
  process.env.PROFILE_TEST_URL ??
  `http://127.0.0.1:${process.env.PORT ?? '24938'}/ems-territory-intelligence/`;
const chromiumPath = process.env.CHROMIUM_PATH ?? 'chromium';
const testViewports = [
  { width: 360, height: 844, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 1280, height: 900, mobile: false },
];
const comparisonViewports = [
  { width: 320, height: 740, mobile: true },
  { width: 402, height: 874, mobile: true },
  { width: 768, height: 900, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const workspaceRegressionViewports = [
  { width: 390, height: 844, mobile: true },
  { width: 768, height: 900, mobile: false },
  { width: 1280, height: 900, mobile: false },
];
const specialistAndSystemViews = [
  { group: 'Specialist tools', tab: 'Clinical & competitive', heading: 'Clinical & competitive knowledge hub' },
  { group: 'Specialist tools', tab: 'Medicare & public health', heading: 'Public healthcare, CMS claims & EMS outcomes engine' },
  { group: 'Specialist tools', tab: 'Equipment viewer', heading: '3D Ambulance, Fire Apparatus' },
  { group: 'Specialist tools', tab: 'Federal sources', heading: 'Nationwide Federal Registry' },
  { group: 'Data & system', tab: 'Data health & sync', heading: 'Data Health, Cloud Synchronization' },
  { group: 'Data & system', tab: 'Backup & restore', heading: 'Local Backup & State Archive Center' },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chromium is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Chromium did not start its debugging endpoint at ${url}`);
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const handlers = pending.get(message.id);
    if (!handlers) return;
    pending.delete(message.id);
    clearTimeout(handlers.timeout);
    if (message.error) handlers.reject(new Error(`${handlers.method}: ${message.error.message}`));
    else handlers.resolve(message);
  });

  return {
    async connect() {
      await opened;
    },
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for Chromium command: ${method}`));
        }, 10_000);
        pending.set(id, { resolve, reject, timeout, method });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  let response;
  try {
    response = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
  } catch (error) {
    throw new Error(`${error.message}; expression: ${expression.slice(0, 240)}`);
  }
  if (response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text);
  }
  return response.result.result.value;
}

async function waitFor(cdp, expression, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function clickVisibleButton(cdp, label, description = label) {
  const clicked = await evaluate(cdp, `(() => {
    const candidates = [...document.querySelectorAll('button')]
      .filter((button) => button.innerText.trim() === ${JSON.stringify(label)})
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return rect.width > 0 && rect.height > 0 &&
          style.visibility !== 'hidden' && style.display !== 'none' &&
          rect.right > 0 && rect.left < innerWidth &&
          rect.bottom > 0 && rect.top < innerHeight;
      });
    const button = candidates.at(-1);
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not reach the ${description} button at this viewport`);
}

async function openAgencyProfile(cdp) {
  await clickVisibleButton(cdp, 'Agencies', 'Agencies navigation');
  try {
    await waitFor(
      cdp,
      `document.body.innerText.includes('Open agency profile')`,
      'the agency directory',
    );
  } catch (error) {
    const state = await evaluate(cdp, `JSON.stringify({
      text: document.body.innerText.slice(-1600),
      profileText: document.body.innerText.includes('Open agency profile'),
      matchingControls: [...document.querySelectorAll('button, a, [role="button"]')]
        .map((element) => element.innerText.trim())
        .filter((text) => text.toLowerCase().includes('profile'))
    })`);
    throw new Error(`${error.message}. Current screen: ${state}`);
  }
  const opened = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button, a, [role="button"]')]
      .find((candidate) => candidate.innerText.trim().includes('Open agency profile'));
    if (!button) return false;
    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  })()`);
  assert(opened, 'Could not open an agency profile from the directory');
  await waitFor(
    cdp,
    `Boolean(document.querySelector('main.profile-workspace'))`,
    'the agency profile',
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="agency-intelligence-overview"]'))`,
    'the agency intelligence overview',
  );
  const overviewChecks = await evaluate(cdp, `(() => {
    const overview = document.querySelector('[data-testid="agency-intelligence-overview"]');
    return {
      heading: overview?.innerText.includes('Operational intelligence') ?? false,
      identity: Boolean(overview?.querySelector('[data-testid="section-identity"]')),
      command: Boolean(overview?.querySelector('[data-testid="section-command-contacts"]')),
      apparatus: Boolean(overview?.querySelector('[data-testid="section-stations-apparatus"]')),
      operations: Boolean(overview?.querySelector('[data-testid="section-operations-service-area"]')),
      hospitals: Boolean(overview?.querySelector('[data-testid="section-receiving-hospitals"]')),
      systems: Boolean(overview?.querySelector('[data-testid="section-equipment-communications"]')),
      sourcesAction: Boolean(overview?.querySelector('[data-testid="button-open-agency-sources"]')),
    };
  })()`);
  for (const [area, available] of Object.entries(overviewChecks)) {
    assert(available, `Agency intelligence overview is missing ${area}`);
  }
  const initialExpansion = await evaluate(
    cdp,
    `document.querySelector('[data-testid="button-toggle-stations-apparatus"]')?.getAttribute('aria-expanded')`,
  );
  assert(initialExpansion === 'true' || initialExpansion === 'false', 'Apparatus details are not keyboard-accessible');
  await evaluate(cdp, `document.querySelector('[data-testid="button-toggle-stations-apparatus"]')?.click()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="button-toggle-stations-apparatus"]')?.getAttribute('aria-expanded') !== ${JSON.stringify(initialExpansion)}`,
    'apparatus details to expand or collapse',
  );
  await evaluate(cdp, `document.querySelector('[data-testid="button-toggle-stations-apparatus"]')?.click()`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="button-toggle-stations-apparatus"]')?.getAttribute('aria-expanded') === ${JSON.stringify(initialExpansion)}`,
    'apparatus details to return to their original state',
  );
  await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="button-open-agency-sources"]');
    button?.scrollIntoView({ block: 'center' });
    button?.click();
    return Boolean(button);
  })()`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('#profile-source-evidence'))`,
    'the full agency source and records workspace',
  );
}

async function assertNoHorizontalOverflow(cdp, width, area) {
  const dimensions = await evaluate(cdp, `(() => {
    const profile = document.querySelector('main.profile-workspace');
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    const root = document.documentElement;
    const measured = ${JSON.stringify(area)} === 'drawer' ? drawer : profile;
    if (!profile || !measured) return null;
    return {
      viewport: innerWidth,
      document: root.scrollWidth,
      profile: profile.scrollWidth,
      profileClient: profile.clientWidth,
      measured: measured.scrollWidth,
      measuredClient: measured.clientWidth,
      measuredLeft: measured.getBoundingClientRect().left,
      measuredRight: measured.getBoundingClientRect().right,
    };
  })()`);
  assert(dimensions, `Missing profile content while checking ${area} at ${width}px`);
  const measuredWidth = dimensions.measured;
  const clientWidth = dimensions.measuredClient;
  assert(
    dimensions.viewport === width,
    `Expected ${width}px viewport, got ${dimensions.viewport}px`,
  );
  assert(
    dimensions.document <= width + 1,
    `Document overflows horizontally at ${width}px (${dimensions.document}px wide)`,
  );
  assert(
    dimensions.profile <= dimensions.profileClient + 1,
    `Profile overflows horizontally at ${width}px (${dimensions.profile}px content / ${dimensions.profileClient}px visible)`,
  );
  assert(
    measuredWidth <= clientWidth + 1,
    `${area} content overflows at ${width}px (${measuredWidth}px content / ${clientWidth}px visible)`,
  );
  assert(
    dimensions.measuredLeft >= -1 && dimensions.measuredRight <= width + 1,
    `${area} extends beyond the ${width}px viewport`,
  );
}

async function checkProfileAtViewport(cdp, viewport) {
  console.log(`Checking ${viewport.width}px viewport...`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `document.querySelector('#root')?.childElementCount > 0 &&
      document.body.innerText.includes('Interactive U.S. Territory Map')`,
    `the app at ${viewport.width}px`,
    60_000,
  );
  await openAgencyProfile(cdp);
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  if (viewport.mobile) {
    await evaluate(cdp, `(() => {
      const picker = document.querySelector('[data-testid="select-profile-section-mobile"]');
      picker?.scrollIntoView({ block: 'center' });
      return Boolean(picker);
    })()`);
  }

  const mobileControls = await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="select-profile-section-mobile"]');
    const dock = document.querySelector('[aria-label="Account Action Dock"]');
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden' &&
        rect.right > 0 && rect.left < innerWidth &&
        rect.bottom > 0 && rect.top < innerHeight;
    };
    return {
      mobile: innerWidth < 768,
      sectionPicker: visible(select),
      routeAction: visible(dock?.querySelector(
        '[aria-label="Add agency to route"], [aria-label="Remove agency from today\\'s route"]',
      )),
      saveAction: visible(dock?.querySelector(
        '[aria-label="Save agency to My Work"], [aria-label="Remove agency from saved work"]',
      )),
      meetingAction: visible(dock?.querySelector('[aria-label="Prepare for meeting"]')),
      sourceAction: visible(dock?.querySelector('[aria-label="Inspect agency sources"]')),
    };
  })()`);
  if (mobileControls.mobile) {
    for (const action of ['sectionPicker', 'routeAction', 'saveAction', 'meetingAction', 'sourceAction']) {
      assert(mobileControls[action], `Mobile ${action} is not reachable at ${viewport.width}px`);
    }

    const selectedEvidence = await evaluate(cdp, `(() => {
      const select = document.querySelector('[data-testid="select-profile-section-mobile"]');
      if (!select) return false;
      select.value = 'evidence';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert(selectedEvidence, `Profile section picker was unavailable at ${viewport.width}px`);
    await waitFor(
      cdp,
      `document.querySelector('[data-testid="select-profile-section-mobile"]')?.value === 'evidence' &&
        document.body.innerText.includes('Source Evidence & Verification Ledger')`,
      `the evidence section at ${viewport.width}px`,
    );
    await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');
  }

  const openedRegistryDetails = await evaluate(cdp, `(() => {
    const summary = [...document.querySelectorAll('summary')]
      .find((item) => item.innerText.includes('Registry identifiers and verification'));
    if (!summary) return false;
    summary.scrollIntoView({ block: 'center' });
    summary.click();
    return summary.parentElement.open === true;
  })()`);
  assert(openedRegistryDetails, `Registry details could not be opened at ${viewport.width}px`);
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');

  const meetingActionReached = await evaluate(cdp, `(() => {
    const button = document.querySelector('[aria-label="Account Action Dock"] [aria-label="Prepare for meeting"]');
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth) return false;
    button.click();
    return true;
  })()`);
  assert(meetingActionReached, `Prepare for meeting was not reachable at ${viewport.width}px`);
  await waitFor(
    cdp,
    `(() => {
      const section = document.querySelector('[aria-label="Prepare for Meeting Intelligence Workspace"]');
      const dock = document.querySelector('[aria-label="Account Action Dock"]');
      if (!section) return false;
      const rect = section.getBoundingClientRect();
      const dockTop = dock?.getBoundingClientRect().top ?? innerHeight;
      return rect.top < dockTop && rect.bottom > 0;
    })()`,
    `the meeting briefing at ${viewport.width}px`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'profile');

  const drawerButton = await evaluate(cdp, `(() => {
    const button = document.querySelector('[aria-label="Account Action Dock"] [aria-label="Inspect agency sources"]');
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.left >= innerWidth) return false;
    button.click();
    return true;
  })()`);
  assert(drawerButton, `Source inspection was not reachable at ${viewport.width}px`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]'))`,
    `the source inspection drawer at ${viewport.width}px`,
  );
  await assertNoHorizontalOverflow(cdp, viewport.width, 'drawer');

  const sourceContentAvailable = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    if (!drawer) return { drawer: false };
    const buttons = [...drawer.querySelectorAll('button')].map((button) => button.innerText.trim());
    return {
      drawer: true,
      registryIdentifiers: drawer.innerText.toLowerCase().includes('registry identifiers & match status'),
      registryLinks: drawer.innerText.toLowerCase().includes('direct federal registry links'),
      closeButton: buttons.includes('Close'),
      buttons,
      text: drawer.innerText.slice(0, 1200),
    };
  })()`);
  assert(
    sourceContentAvailable?.drawer &&
      sourceContentAvailable.registryIdentifiers &&
      sourceContentAvailable.registryLinks &&
      sourceContentAvailable.closeButton,
    `Source drawer content is incomplete at ${viewport.width}px: ${JSON.stringify(sourceContentAvailable)}`,
  );
  const closedSourceDrawer = await evaluate(cdp, `(() => {
    const drawer = document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]');
    const close = [...(drawer?.querySelectorAll('button') ?? [])]
      .find((button) => button.innerText.trim() === 'Close');
    if (!close) return false;
    close.click();
    return true;
  })()`);
  assert(closedSourceDrawer, `The source inspection drawer could not be closed at ${viewport.width}px`);
  await waitFor(
    cdp,
    `!document.querySelector('[aria-label="Evidence and Source Inspection Drawer"]')`,
    `the source inspection drawer to close at ${viewport.width}px`,
  );
  console.log(`✓ ${viewport.width}px: profile, actions, section, registry details, briefing, and source drawer`);
}

async function openAgencyComparison(cdp, width) {
  await cdp.send('Page.navigate', { url: baseUrl });
  await waitFor(
    cdp,
    `document.querySelector('#root')?.childElementCount > 0 &&
      document.body.innerText.includes('Interactive U.S. Territory Map')`,
    `the app at ${width}px`,
    60_000,
  );
  await clickVisibleButton(cdp, 'Agencies', 'Agencies navigation');
  await waitFor(
    cdp,
    `document.body.innerText.includes('Open agency profile')`,
    'the agency directory',
  );
  const selectedIds = await evaluate(cdp, `(() => {
    const visible = (button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    };
    const buttons = [...document.querySelectorAll('[data-testid^="button-toggle-comparison-"]')]
      .filter(visible);
    const selected = buttons.slice(0, 3);
    selected.forEach((button) => button.click());
    return selected.map((button) => button.dataset.testid);
  })()`);
  assert(
    selectedIds?.length === 3,
    `Could not select three agencies for comparison at ${width}px: ${JSON.stringify(selectedIds)}`,
  );
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="button-open-agency-comparison"]')) &&
      !document.querySelector('[data-testid="button-open-agency-comparison"]').disabled`,
    'the enabled agency comparison action',
  );
  const opened = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="button-open-agency-comparison"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(opened, `Could not open agency comparison at ${width}px`);
  await waitFor(
    cdp,
    `Boolean(document.querySelector('[data-testid="agency-comparison-panel"]'))`,
    'the agency comparison panel',
  );
}

async function checkComparisonAtViewport(cdp, viewport, downloadPath) {
  console.log(`Checking agency comparison at ${viewport.width}px viewport...`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await openAgencyComparison(cdp, viewport.width);

  const layout = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const panel = document.querySelector('[data-testid="agency-comparison-panel"]');
    const mobile = document.querySelector('[data-testid="comparison-mobile-layout"]');
    const table = panel?.querySelector('.overflow-x-auto');
    const rect = (element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height };
    };
    return {
      viewport: innerWidth,
      documentWidth: root.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      panel: rect(panel),
      mobile: rect(mobile),
      mobileDisplay: mobile ? getComputedStyle(mobile).display : null,
      table: rect(table),
      tableDisplay: table ? getComputedStyle(table).display : null,
      filters: rect(panel?.querySelector('[data-testid="comparison-filter-controls"]')),
      sort: rect(panel?.querySelector('[data-testid="comparison-sort"]')?.parentElement),
      export: rect(panel?.querySelector('[data-testid="button-export-comparison"]')),
    };
  })()`);
  assert(layout, `Agency comparison layout was missing at ${viewport.width}px`);
  assert(layout.viewport === viewport.width, `Expected ${viewport.width}px viewport, got ${layout.viewport}px`);
  assert(
    layout.documentWidth <= viewport.width + 1 && layout.bodyWidth <= viewport.width + 1,
    `Page scrolls horizontally at ${viewport.width}px (document ${layout.documentWidth}px, body ${layout.bodyWidth}px)`,
  );
  assert(
    layout.panel && layout.panel.left >= -1 && layout.panel.right <= viewport.width + 1,
    `Comparison panel extends beyond the ${viewport.width}px viewport: ${JSON.stringify(layout.panel)}`,
  );
  for (const control of ['filters', 'sort', 'export']) {
    const bounds = layout[control];
    assert(
      bounds && bounds.width > 0 && bounds.height > 0 &&
        bounds.left >= -1 && bounds.right <= viewport.width + 1,
      `${control} controls are not fully reachable at ${viewport.width}px: ${JSON.stringify(bounds)}`,
    );
  }
  if (viewport.width < 768) {
    assert(
      layout.mobileDisplay !== 'none' && layout.mobile?.width > 0 &&
        layout.tableDisplay === 'none',
      `Phone field-first comparison layout is not active at ${viewport.width}px: ${JSON.stringify(layout)}`,
    );
  } else {
    assert(
      layout.tableDisplay !== 'none' && layout.table?.width > 0 &&
        layout.mobileDisplay === 'none',
      `Comparison table is not active at ${viewport.width}px: ${JSON.stringify(layout)}`,
    );
  }

  for (const filter of ['different', 'shared', 'all']) {
    const clicked = await evaluate(cdp, `(() => {
      const button = document.querySelector('[data-testid="comparison-filter-${filter}"]');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    assert(clicked, `The ${filter} filter was unavailable at ${viewport.width}px`);
    await waitFor(
      cdp,
      `document.querySelector('[data-testid="comparison-filter-${filter}"]')?.getAttribute('aria-pressed') === 'true'`,
      `the ${filter} filter to update at ${viewport.width}px`,
    );
  }

  const sortChanged = await evaluate(cdp, `(() => {
    const select = document.querySelector('[data-testid="comparison-sort"]');
    if (!select || select.disabled) return false;
    select.value = 'pulseIqDesc';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert(sortChanged, `Sort control was unavailable at ${viewport.width}px`);
  await waitFor(
    cdp,
    `document.querySelector('[data-testid="comparison-sort"]')?.value === 'pulseIqDesc'`,
    `agency sorting to update at ${viewport.width}px`,
  );

  const exportClicked = await evaluate(cdp, `(() => {
    const button = document.querySelector('[data-testid="button-export-comparison"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(exportClicked, `Export CSV was unavailable at ${viewport.width}px`);
  const deadline = Date.now() + 10_000;
  let downloadedFiles = [];
  while (Date.now() < deadline) {
    downloadedFiles = await readdir(downloadPath);
    if (downloadedFiles.some((file) => file.endsWith('.csv'))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(
    downloadedFiles.some((file) => file.endsWith('.csv')),
    `Export CSV did not produce a download at ${viewport.width}px`,
  );
  console.log(`✓ ${viewport.width}px: no page overflow, correct layout, filters, sorting, and CSV export`);
}

async function openSpecialistOrSystemView(cdp, view) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await clickVisibleButton(cdp, view.group, `${view.group} navigation`);
  const navLabel = view.group === 'Specialist tools'
    ? 'Specialist tool views'
    : 'Data and system views';
  await waitFor(
    cdp,
    `Boolean(document.querySelector('nav[aria-label="${navLabel}"]'))`,
    `${view.group} view tabs`,
  );
  const selected = await evaluate(cdp, `(() => {
    const nav = document.querySelector('nav[aria-label="${navLabel}"]');
    const button = [...(nav?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.innerText.trim() === ${JSON.stringify(view.tab)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(selected, `Could not select "${view.tab}"`);
  await waitFor(
    cdp,
    `(() => {
      const workspace = document.querySelector('main.workspace-grid-shell .operations-workspace');
      return Boolean(workspace && [...workspace.querySelectorAll('h1, h2')]
        .some((heading) => heading.innerText.includes(${JSON.stringify(view.heading)})));
    })()`,
    `"${view.heading}" workspace`,
    60_000,
  );
}

async function checkSpecialistAndSystemAtViewport(cdp, view, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await evaluate(cdp, `new Promise((resolve) => requestAnimationFrame(() =>
    requestAnimationFrame(resolve)))`);

  const layout = await evaluate(cdp, `(() => {
    const root = document.documentElement;
    const main = document.querySelector('main.workspace-grid-shell');
    const workspace = main?.querySelector('.operations-workspace');
    if (!main || !workspace) return null;
    const headings = [...workspace.querySelectorAll('h1, h2')];
    const heading = headings.find((item) => item.innerText.includes(${JSON.stringify(view.heading)}));
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const tokenProbe = document.createElement('span');
    tokenProbe.style.backgroundColor = 'var(--pi-surface-bg)';
    tokenProbe.style.color = 'var(--pi-text-primary)';
    tokenProbe.style.fontFamily = 'var(--font-display)';
    document.body.appendChild(tokenProbe);
    const expectedSurface = getComputedStyle(tokenProbe).backgroundColor;
    const expectedText = getComputedStyle(tokenProbe).color;
    const expectedDisplayFont = getComputedStyle(tokenProbe).fontFamily;
    tokenProbe.remove();
    const surfaces = [...workspace.querySelectorAll(
      '[class~="bg-white"], [class*="dark:bg-slate-900"]',
    )];
    const surface = surfaces.find((item) =>
      getComputedStyle(item).backgroundColor === expectedSurface);
    const bounds = main.getBoundingClientRect();
    return {
      viewport: innerWidth,
      documentWidth: root.scrollWidth,
      mainWidth: main.scrollWidth,
      mainClientWidth: main.clientWidth,
      mainLeft: bounds.left,
      mainRight: bounds.right,
      headingPresent: Boolean(heading),
      headingFont: headingStyle?.fontFamily ?? null,
      displayFont: expectedDisplayFont,
      headingColor: headingStyle?.color ?? null,
      expectedText,
      surfacePresent: Boolean(surface),
      surfaceColor: surface ? getComputedStyle(surface).backgroundColor : null,
      expectedSurface,
    };
  })()`);
  assert(layout, `Missing main workspace content for "${view.tab}" at ${viewport.width}px`);
  assert(
    layout.viewport === viewport.width,
    `Expected ${viewport.width}px viewport, got ${layout.viewport}px`,
  );
  assert(
    layout.documentWidth <= viewport.width + 1,
    `"${view.tab}" document overflows at ${viewport.width}px (${layout.documentWidth}px wide)`,
  );
  assert(
    layout.mainWidth <= layout.mainClientWidth + 1,
    `"${view.tab}" main workspace overflows at ${viewport.width}px (${layout.mainWidth}px content / ${layout.mainClientWidth}px visible)`,
  );
  assert(
    layout.mainLeft >= -1 && layout.mainRight <= viewport.width + 1,
    `"${view.tab}" main workspace extends beyond the ${viewport.width}px viewport`,
  );
  assert(
    layout.headingPresent && layout.headingFont === layout.displayFont &&
      layout.headingColor === layout.expectedText,
    `"${view.tab}" is missing shared heading styling at ${viewport.width}px: ${JSON.stringify(layout)}`,
  );
  assert(
    layout.surfacePresent && layout.surfaceColor === layout.expectedSurface,
    `"${view.tab}" is missing shared surface styling at ${viewport.width}px: ${JSON.stringify(layout)}`,
  );
  console.log(`✓ ${viewport.width}px: ${view.tab}, shared heading/surface, no horizontal overflow`);
}

async function checkSpecialistAndSystemViews(cdp) {
  for (const view of specialistAndSystemViews) {
    await cdp.send('Page.navigate', { url: baseUrl });
    await waitFor(
      cdp,
      `document.querySelector('#root')?.childElementCount > 0 &&
        document.body.innerText.includes('Interactive U.S. Territory Map')`,
      'the app before opening a specialist or system view',
      60_000,
    );
    await openSpecialistOrSystemView(cdp, view);
    for (const viewport of workspaceRegressionViewports) {
      await checkSpecialistAndSystemAtViewport(cdp, view, viewport);
    }
  }
}

async function main() {
  const response = await fetch(baseUrl);
  assert(
    response.ok,
    `Could not load ${baseUrl} (HTTP ${response.status}). Start the EMS Territory Intelligence web workflow first.`,
  );

  const debuggingPort = await reservePort();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'ems-profile-overflow-'));
  const downloadPath = path.join(userDataDir, 'downloads');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(downloadPath));
  const chromium = spawn(chromiumPath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  let cdp;
  try {
    const target = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    const targets = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`).then((result) => result.json());
    const page = targets.find((candidate) => candidate.type === 'page');
    assert(page, 'Chromium did not create a page target');
    cdp = createCdpClient(page.webSocketDebuggerUrl ?? target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });

    for (const viewport of testViewports) {
      await checkProfileAtViewport(cdp, viewport);
    }
    for (const viewport of comparisonViewports) {
      await checkComparisonAtViewport(cdp, viewport, downloadPath);
    }
    await checkSpecialistAndSystemViews(cdp);
    console.log('Agency profile, comparison, specialist, and system responsive checks passed.');
  } finally {
    cdp?.close();
    const chromiumClosed = new Promise((resolve) => chromium.once('close', resolve));
    try {
      process.kill(-chromium.pid, 'SIGTERM');
    } catch {
      // Chromium may already have exited after a failed assertion.
    }
    await Promise.race([
      chromiumClosed,
      new Promise((resolve) => setTimeout(resolve, 1_500)),
    ]);
    try {
      process.kill(-chromium.pid, 'SIGKILL');
    } catch {
      // Chromium may already have exited.
    }
    await Promise.race([
      chromiumClosed,
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Responsive browser check failed: ${error.message}`);
  process.exitCode = 1;
});
